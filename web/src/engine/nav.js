// Navigation grid + A*. Rasterises the StaticWorld into an occupancy grid per agent size (dilated by its radius), then
// answers path queries in a few ms. Used by: player autopilot (moveTo), vehicle driveTo, GPS route on the minimap.
//
// THE NAV WINDOW (docs/design/WEB_STREAMING.md §3.6): A* runs on a 4 x 4-chunk window (1,024 m) that moves with the
// queries. The Phoenix island is rasterised once at boot into a pinned store covering its 16 chunks, exactly as the old
// whole-map grid was (same 1 m / 2 m cell-centre lattice, so its routes hold); streamed chunks bring their own tiles,
// rasterised when their layout is built. A query whose ends both fit one window re-centres it (ensureCovers, a copy of
// tiles, about half a millisecond); ends farther apart than a window are a job for the road graph (P3) and get null.
// Cells: 0 open, 1 blocked, 2 a vehicle for one query (withObstacles), 3 a locked door (systems/interiors.js).

const C = 256; // chunk size (must match data/streaming.js)

export class NavGrid {
  // statics: the island StaticWorld; tiles(cx, cz) -> this grid's Uint8Array tile for a streamed chunk, or null.
  constructor(statics, { cell = 2, radius = 0.5, island = 512, chunks = 4 } = {}) {
    this.cell = cell; this.radius = radius;
    this.isl = island;
    this.ni = Math.round((island * 2) / cell);  // the pinned island store, (2 * island / cell)^2
    this.T = C / cell;                          // a chunk tile is T x T cells
    this.n = chunks * this.T;                   // the window is n x n cells
    this.W = chunks * C;                        // ... and W metres on a side
    this.store = new Uint8Array(this.ni * this.ni);
    this.rasterise(statics.boxes, this.store, this.ni, -island, -island);
    this.tiles = null;                          // set by the streamer
    this.blocked = new Uint8Array(this.n * this.n);
    // Scratch buffers reused across queries (no per-query allocation of big arrays).
    const nn = this.n * this.n;
    this.g = new Float32Array(nn);
    this.parent = new Int32Array(nn);
    this.seen = new Uint32Array(nn);
    this.closed = new Uint32Array(nn);
    this.stamp = 0;
    this.heap = new Int32Array(nn);
    this.f = new Float32Array(nn);
    this.locked = false; this.dirty = true; this.recentres = 0; this.lastRebuildMs = 0;
    this.rebuild(-island, -island);
  }

  // Block every cell whose CENTRE lies inside a box grown by the agent radius (a 2.6 m doorway stays open for a 0.55 m
  // walker). Floating boxes (a bridge parapet) are skipped: what is under them is the ground's business.
  rasterise(boxes, arr, n, ox, oz) {
    const cell = this.cell, radius = this.radius;
    const lo = (v, o) => Math.max(0, Math.ceil((v - o) / cell - 0.5)), hi = (v, o) => Math.min(n - 1, Math.floor((v - o) / cell - 0.5));
    let any = 0;
    for (const b of boxes) {
      if (b.tag === 'bound' || b.base > 0) continue;
      const x0 = lo(b.minX - radius, ox), x1 = hi(b.maxX + radius, ox), z0 = lo(b.minZ - radius, oz), z1 = hi(b.maxZ + radius, oz);
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) { arr[z * n + x] = 1; any = 1; }
    }
    return any;
  }

  // Bake a rule into the pinned island store (deep water at boot): fn(x, z) true blocks that cell.
  blockStore(fn) {
    const n = this.ni, c = this.cell, o = -this.isl;
    for (let zc = 0; zc < n; zc++) for (let xc = 0; xc < n; xc++) if (fn(o + (xc + 0.5) * c, o + (zc + 0.5) * c)) this.store[zc * n + xc] = 1;
    this.dirty = true;
  }

  // ---- the window ---------------------------------------------------------------------------------------------------
  cix(v) { const c = Math.floor((v - this.ox) / this.cell); return c < 0 ? 0 : c >= this.n ? this.n - 1 : c; }
  ciz(v) { const c = Math.floor((v - this.oz) / this.cell); return c < 0 ? 0 : c >= this.n ? this.n - 1 : c; }
  wxx(c) { return this.ox + (c + 0.5) * this.cell; }
  wxz(c) { return this.oz + (c + 0.5) * this.cell; }
  inWindow(x, z, m = 0) { return x >= this.ox + m && x < this.ox + this.W - m && z >= this.oz + m && z < this.oz + this.W - m; }

  // Copy tiles into the window at origin (ox, oz) (multiples of the chunk size): the island store where it reaches,
  // OR'd with a streamed chunk's tile; a chunk with no layout yet is blocked (unknown ground is not a route).
  rebuild(ox, oz) {
    const t0 = performance.now(), n = this.n, T = this.T, ni = this.ni, ib = -this.isl, B = this.blocked;
    this.ox = ox; this.oz = oz;
    for (let j = 0; j < n / T; j++) for (let i = 0; i < n / T; i++) {
      const cx = Math.floor(ox / C) + i, cz = Math.floor(oz / C) + j;
      const tile = this.tiles ? this.tiles(cx, cz) : null;
      const sx = Math.round((cx * C - ib) / this.cell), sz = Math.round((cz * C - ib) / this.cell); // in the island store
      const inStore = sx >= 0 && sz >= 0 && sx + T <= ni && sz + T <= ni;
      for (let r = 0; r < T; r++) {
        const dst = (j * T + r) * n + i * T;
        if (inStore) {
          B.set(this.store.subarray((sz + r) * ni + sx, (sz + r) * ni + sx + T), dst);
          if (tile?.any) for (let k = 0; k < T; k++) if (tile.a[r * T + k]) B[dst + k] = 1;
        } else if (tile) B.set(tile.a.subarray(r * T, r * T + T), dst);
        else B.fill(1, dst, dst + T);
      }
    }
    // The window's edge.
    for (let i = 0; i < n; i++) { B[i] = B[(n - 1) * n + i] = B[i * n] = B[i * n + n - 1] = 1; }
    this.dirty = false;
    this.recentres++;
    this.lastRebuildMs = performance.now() - t0;
  }

  // A streamed chunk's tile changed (built or evicted): rebuild the window before its next query if it shows it.
  invalidate(cx, cz) {
    const i = cx - Math.floor(this.ox / C), j = cz - Math.floor(this.oz / C), k = this.n / this.T;
    if (cx === undefined || (i >= 0 && j >= 0 && i < k && j < k)) this.dirty = true;
  }

  // Make the window hold both points (with a margin). Prefers the island window while both are inside it, so routes in
  // Phoenix are the routes they always were. False when the two are too far apart for one window.
  ensureCovers(ax, az, bx = ax, bz = az, margin = 24) {
    const x0 = Math.min(ax, bx) - margin, x1 = Math.max(ax, bx) + margin, z0 = Math.min(az, bz) - margin, z1 = Math.max(az, bz) + margin;
    const m = this.cell * 2, W = this.W;
    if (x0 >= this.ox + m && x1 < this.ox + W - m && z0 >= this.oz + m && z1 < this.oz + W - m) {
      if (this.dirty && !this.locked) this.rebuild(this.ox, this.oz);
      return true;
    }
    if (this.locked) return false;
    if (x1 - x0 > W - 2 * m || z1 - z0 > W - 2 * m) return false;
    let ox, oz;
    const I = -this.isl;
    if (x0 >= I + m && x1 < I + W - m && z0 >= I + m && z1 < I + W - m && W === 2 * this.isl) { ox = I; oz = I; }
    else {
      const fit = (lo, hi) => {
        let o = Math.floor(((lo + hi) / 2 - W / 2) / C) * C;
        if (hi >= o + W - m) o += C;
        if (lo < o + m) o -= C;
        return lo >= o + m && hi < o + W - m ? o : null;
      };
      ox = fit(x0, x1); oz = fit(z0, z1);
      if (ox === null || oz === null) return false;
    }
    this.rebuild(ox, oz);
    return true;
  }
  // Tests: centre the window on a spot (the island window when it is in Phoenix).
  focus(x, z) { return this.ensureCovers(x, z, x, z, 0); }

  // Is the cell at (x, z) open? Answered from the window, or from the tiles when (x, z) is outside it.
  free(x, z) {
    if (this.dirty && !this.locked) this.rebuild(this.ox, this.oz);
    if (this.inWindow(x, z)) return !this.blocked[this.ciz(z) * this.n + this.cix(x)];
    return this.cellAt(x, z) === 0;
  }
  cellAt(x, z) {
    const c = this.cell, ib = -this.isl;
    const sx = Math.floor((x - ib) / c), sz = Math.floor((z - ib) / c);
    let v = sx >= 0 && sz >= 0 && sx < this.ni && sz < this.ni ? this.store[sz * this.ni + sx] : -1;
    const cx = Math.floor(x / C), cz = Math.floor(z / C), tile = this.tiles ? this.tiles(cx, cz) : null;
    if (tile) { const t = tile.a[Math.floor((z - cz * C) / c) * this.T + Math.floor((x - cx * C) / c)]; v = v < 0 ? t : v | t; }
    return v < 0 ? 1 : v;
  }
  // A door's cells (systems/interiors.js) by world position: kept in the pinned store, mirrored into the window.
  setCell(x, z, val) {
    const c = this.cell, ib = -this.isl, sx = Math.floor((x - ib) / c), sz = Math.floor((z - ib) / c);
    if (sx >= 0 && sz >= 0 && sx < this.ni && sz < this.ni) this.store[sz * this.ni + sx] = val;
    if (this.inWindow(x, z)) this.blocked[this.ciz(z) * this.n + this.cix(x)] = val;
  }
  getCell(x, z) {
    const c = this.cell, ib = -this.isl, sx = Math.floor((x - ib) / c), sz = Math.floor((z - ib) / c);
    return sx >= 0 && sz >= 0 && sx < this.ni && sz < this.ni ? this.store[sz * this.ni + sx] : this.cellAt(x, z);
  }

  // Nearest open cell to (x,z) by expanding rings.
  nearestFree(cx, cz, maxR = 16) {
    const n = this.n;
    if (!this.blocked[cz * n + cx]) return cz * n + cx;
    for (let r = 1; r <= maxR; r++)
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dz) !== r) continue;
        const x = cx + dx, z = cz + dz;
        if (x < 0 || z < 0 || x >= n || z >= n) continue;
        if (!this.blocked[z * n + x]) return z * n + x;
      }
    return -1;
  }

  // Temporarily block discs (parked/moving vehicles) for one query: [{x,z,r}]. The window is pinned while fn runs.
  withObstacles(discs, fn) {
    const n = this.n, changed = [];
    for (const d of discs) {
      const r = d.r + this.radius;
      if (!this.inWindow(d.x, d.z, -r)) continue;
      const x0 = this.cix(d.x - r), x1 = this.cix(d.x + r), z0 = this.ciz(d.z - r), z1 = this.ciz(d.z + r);
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
        const i = z * n + x;
        if (this.blocked[i]) continue;
        if ((this.wxx(x) - d.x) ** 2 + (this.wxz(z) - d.z) ** 2 > r * r) continue;
        this.blocked[i] = 2; changed.push(i);
      }
    }
    this.locked = true;
    try { return fn(); } finally { this.locked = false; for (const i of changed) this.blocked[i] = 0; }
  }

  // Returns [{x,z}, ...] smoothed waypoints, or null. If the start sits in a tiny pocket
  // (wedged between crates / tents), retry from nearby open cells before giving up.
  find(sx, sz, tx, tz, maxNodes = 400000) {
    const t0 = performance.now();
    if (!this.ensureCovers(sx, sz, tx, tz)) return null;
    const dist = Math.hypot(tx - sx, tz - sz);
    // Long trips: weighted A* first (slightly longer routes, an order of magnitude fewer
    // cells). Short trips: exact A*, then weighted if the budget ran out.
    const far = dist > 120;
    let p = this.findOnce(sx, sz, tx, tz, far ? this.n * this.n : maxNodes, far ? 2.5 : 1.05);
    if (p) return p;
    if (!far && dist > 40) { p = this.findOnce(sx, sz, tx, tz, this.n * this.n, 2.5); if (p) return p; }
    // Start wedged in a tiny pocket (between crates/tents)? Retry from nearby open cells,
    // with a hard 120ms cap so a hopeless query never hitches the frame.
    for (const r of [2, 3.5, 5]) for (let a = 0; a < 8; a++) {
      if (performance.now() - t0 > 120) return null;
      const ox = sx + Math.cos((a / 8) * Math.PI * 2) * r, oz = sz + Math.sin((a / 8) * Math.PI * 2) * r;
      if (!this.free(ox, oz)) continue;
      const q = this.findOnce(ox, oz, tx, tz, 150000, 2.5);
      if (q) return [{ x: ox, z: oz }, ...q];
    }
    return null;
  }

  findOnce(sx, sz, tx, tz, maxNodes, weight = 1.05) {
    const n = this.n;
    const start = this.nearestFree(this.cix(sx), this.ciz(sz));
    const goal = this.nearestFree(this.cix(tx), this.ciz(tz));
    if (start < 0 || goal < 0) return null;
    if (start === goal) return [{ x: tx, z: tz }];
    const stamp = ++this.stamp;
    const gx = goal % n, gz = (goal / n) | 0;
    const h = (i) => { const dx = Math.abs((i % n) - gx), dz = Math.abs(((i / n) | 0) - gz); return (dx + dz) + (Math.SQRT2 - 2) * Math.min(dx, dz); };
    let size = 0;
    const heap = this.heap, f = this.f;
    const push = (i) => { let k = size++; heap[k] = i; while (k > 0) { const p = (k - 1) >> 1; if (f[heap[p]] <= f[i]) break; heap[k] = heap[p]; k = p; } heap[k] = i; };
    const pop = () => {
      const top = heap[0]; const last = heap[--size]; let k = 0;
      while (true) { let c = 2 * k + 1; if (c >= size) break; if (c + 1 < size && f[heap[c + 1]] < f[heap[c]]) c++; if (f[heap[c]] >= f[last]) break; heap[k] = heap[c]; k = c; }
      heap[k] = last; return top;
    };
    this.g[start] = 0; this.seen[start] = stamp; this.parent[start] = -1; f[start] = h(start); push(start);
    let expanded = 0, found = false;
    const DX = [1, -1, 0, 0, 1, 1, -1, -1], DZ = [0, 0, 1, -1, 1, -1, 1, -1], COST = [1, 1, 1, 1, Math.SQRT2, Math.SQRT2, Math.SQRT2, Math.SQRT2];
    while (size && expanded < maxNodes) {
      const cur = pop();
      if (this.closed[cur] === stamp) continue;
      this.closed[cur] = stamp;
      if (cur === goal) { found = true; break; }
      expanded++;
      const cx = cur % n, cz = (cur / n) | 0;
      for (let k = 0; k < 8; k++) {
        const x = cx + DX[k], z = cz + DZ[k];
        if (x < 0 || z < 0 || x >= n || z >= n) continue;
        const ni = z * n + x;
        if (this.blocked[ni] || this.closed[ni] === stamp) continue;
        if (k >= 4 && (this.blocked[cz * n + x] || this.blocked[z * n + cx])) continue; // no corner cutting
        const ng = this.g[cur] + COST[k];
        if (this.seen[ni] !== stamp || ng < this.g[ni]) {
          this.seen[ni] = stamp; this.g[ni] = ng; this.parent[ni] = cur; f[ni] = ng + h(ni) * weight; push(ni);
        }
      }
    }
    if (!found) return null;
    const cells = [];
    for (let i = goal; i !== -1; i = this.parent[i]) cells.push(i);
    cells.reverse();
    // String-pull: keep a waypoint only when the straight line to the next one is blocked.
    const pts = [];
    let anchor = 0;
    for (let i = 2; i < cells.length; i++) {
      if (!this.clearLine(cells[anchor], cells[i])) { pts.push(cells[i - 1]); anchor = i - 1; }
    }
    pts.push(goal);
    const out = pts.map((i) => ({ x: this.wxx(i % n), z: this.wxz((i / n) | 0) }));
    out[out.length - 1] = this.free(tx, tz) ? { x: tx, z: tz } : out[out.length - 1];
    return out;
  }

  clearLine(a, b) {
    const n = this.n;
    let x0 = a % n, z0 = (a / n) | 0;
    const x1 = b % n, z1 = (b / n) | 0;
    const dx = Math.abs(x1 - x0), dz = Math.abs(z1 - z0), sx = x0 < x1 ? 1 : -1, sz = z0 < z1 ? 1 : -1;
    let err = dx - dz;
    while (true) {
      if (this.blocked[z0 * n + x0]) return false;
      if (x0 === x1 && z0 === z1) return true;
      const e2 = 2 * err;
      if (e2 > -dz) { err -= dz; x0 += sx; }
      if (e2 < dx) { err += dx; z0 += sz; }
      // Thick line: also test the side cell on diagonal steps.
      if (this.blocked[z0 * n + x0]) return false;
    }
  }
}
