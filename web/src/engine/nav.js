// Navigation grid + A*. Rasterises the StaticWorld into a 2m occupancy grid per agent
// size (dilated by its radius), then answers path queries in a few ms.
// Used by: player autopilot (moveTo), vehicle driveTo, GPS route on the minimap.

export class NavGrid {
  constructor(statics, { cell = 2, radius = 0.5, half = statics.half } = {}) {
    this.cell = cell; this.half = half; this.radius = radius;
    this.n = Math.ceil((half * 2) / cell);
    const n = this.n;
    this.blocked = new Uint8Array(n * n);
    for (const b of statics.boxes) {
      if (b.tag === 'bound') continue;
      // Block a cell only if its CENTRE lies inside the box grown by the agent radius,
      // so a 2.6m doorway stays open for a 0.55m-radius walker.
      const lo = (v) => Math.max(0, Math.ceil((v + half) / cell - 0.5));
      const hi = (v) => Math.min(n - 1, Math.floor((v + half) / cell - 0.5));
      const x0 = lo(b.minX - radius), x1 = hi(b.maxX + radius);
      const z0 = lo(b.minZ - radius), z1 = hi(b.maxZ + radius);
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) this.blocked[z * n + x] = 1;
    }
    // Map edge.
    for (let i = 0; i < n; i++) { this.blocked[i] = this.blocked[(n - 1) * n + i] = this.blocked[i * n] = this.blocked[i * n + n - 1] = 1; }
    // Scratch buffers reused across queries (no per-query allocation of big arrays).
    this.g = new Float32Array(n * n);
    this.parent = new Int32Array(n * n);
    this.seen = new Uint32Array(n * n);
    this.closed = new Uint32Array(n * n);
    this.stamp = 0;
    this.heap = new Int32Array(n * n);
    this.f = new Float32Array(n * n);
  }

  ci(v) { const c = Math.floor((v + this.half) / this.cell); return c < 0 ? 0 : c >= this.n ? this.n - 1 : c; }
  wx(c) { return (c + 0.5) * this.cell - this.half; }
  free(x, z) { return !this.blocked[this.ci(z) * this.n + this.ci(x)]; }

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

  // Returns [{x,z}, ...] smoothed waypoints, or null. If the start sits in a tiny pocket
  // (wedged between crates / tents), retry from nearby open cells before giving up.
  // Temporarily block discs (parked/moving vehicles) for one query: [{x,z,r}].
  withObstacles(discs, fn) {
    const n = this.n, changed = [];
    for (const d of discs) {
      const r = d.r + this.radius;
      const x0 = this.ci(d.x - r), x1 = this.ci(d.x + r), z0 = this.ci(d.z - r), z1 = this.ci(d.z + r);
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
        const i = z * n + x;
        if (this.blocked[i]) continue;
        if ((this.wx(x) - d.x) ** 2 + (this.wx(z) - d.z) ** 2 > r * r) continue;
        this.blocked[i] = 2; changed.push(i);
      }
    }
    try { return fn(); } finally { for (const i of changed) this.blocked[i] = 0; }
  }

  find(sx, sz, tx, tz, maxNodes = 400000) {
    const t0 = performance.now();
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
    const start = this.nearestFree(this.ci(sx), this.ci(sz));
    const goal = this.nearestFree(this.ci(tx), this.ci(tz));
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
    const out = pts.map((i) => ({ x: this.wx(i % n), z: this.wx((i / n) | 0) }));
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
