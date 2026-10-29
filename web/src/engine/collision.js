// Static collision world: axis-aligned boxes bucketed in a uniform spatial hash.
// Everything that never moves (walls, wrecks, crates) lives here. Queries are
// allocation-free so they can run hundreds of times per frame.
//
// OPENINGS (doors and windows, systems/interiors.js) share the hash: an opening entry carries an `op`
// and is never in `boxes` (so the nav grid ignores it). Every query hands those entries to `this.ops`
// (the Interiors system): a door leaf at its live angle, a window by its state. So every mover, sight
// line, bullet and thrown thing meets doors and windows without knowing they exist.
// A wall with windows stays ONE box (walkers can't pass a window, so neither can paths); its window
// openings are `holes` along its axis that only rays use: sight and bullets pass over the sill to meet
// the glass or boards (the window's op), and a throw does too when it flies higher than the sill.
// Ray modes: SOLID (default: throwables, the harpoon) meets anything physical; SIGHT (lineOfSight)
// sees through window holes and glass; BULLET flies through window holes and is stopped by glass.
//
// THE STREAMED WORLD (docs/design/WEB_STREAMING.md §3.6): the Phoenix island keeps the grid above, exactly as built.
// Past it, every streamed chunk's boxes live in a ring of 8 x 8 chunk slots (32 x 32 cells of 8 m each), keyed by
// chunk, so a query never does a Map lookup: a cell is found by (cx & 7, cz & 7) and a key check. A chunk's boxes are
// clipped to its own square, so nothing is listed twice; unloaded ground is empty. A query near the island edge visits
// both, and the shared `mark` stamp counts each box once.
// A box may FLOAT: `base` > 0 means it starts that high (a bridge's parapet over the interstate). Movers pass under it
// when their top is below its base (topY), and ground-level rays (sight, bullets) pass under it.
export const RAY_SOLID = 0, RAY_SIGHT = 1, RAY_BULLET = 2;

const ISQ = 472;   // the island grid answers queries that reach inside |x|,|z| < 472 (the island is 464 + a cell)
const ICORE = 456; // the chunk ring answers queries that reach outside |x|,|z| > 456
const CC = 32;     // cells per chunk side (256 m / 8 m)
const EMPTY = [];

export class StaticWorld {
  constructor(half = 460, cell = 8) {
    this.half = half;
    this.cell = cell;
    this.n = Math.ceil((half * 2) / cell);
    this.cells = new Array(this.n * this.n);
    for (let i = 0; i < this.cells.length; i++) this.cells[i] = [];
    this.boxes = [];
    this.stamp = 1;
    this.hit = { t: 0, nx: 0, nz: 0, box: null };
    this.ops = null; // the Interiors system once it registers (doors, windows)
    // The streamed chunk ring (empty until the streamer registers chunks).
    this.ring = [];
    for (let i = 0; i < 64; i++) {
      const cells = new Array(CC * CC);
      for (let k = 0; k < cells.length; k++) cells[k] = [];
      this.ring.push({ cx: 0x7fffffff, cz: 0x7fffffff, cells, boxes: EMPTY, used: false, gen: 0 });
    }
    this.chunkBoxes = 0; // boxes registered across the ring (for perf/world reports)
    // THE UNDERGROUND (systems/underground.js): a second StaticWorld for whoever is below the surface (c.ug), and the few
    // `extra` boxes round an open entrance (its collar) that the street's movers meet but its hash and nav grids never see.
    this.under = null;
    this.extra = [];
    // GENERATED SETTLEMENTS (systems/citygen.js): the live towns' boxes in their own 8 m hash (cg.cell(gx, gz) -> list;
    // cg.n boxes; cg.x0..z1 their bounds), met by every query below wherever a town stands.
    this.cg = null;
  }

  // An opening's entry: bucketed over the area it can ever occupy (a door's whole swing).
  addOp(op, minX, minZ, maxX, maxZ, height = 2.3) {
    const b = { minX, minZ, maxX, maxZ, tag: op.kind, height, mark: 0, op, holes: null, holeX: false, sill: 0, base: 0, owner: null }; // same shape as add()'s
    for (let x = this.ci(minX); x <= this.ci(maxX); x++)
      for (let z = this.ci(minZ); z <= this.ci(maxZ); z++) this.cells[z * this.n + x].push(b);
    return b;
  }

  ci(v) {
    const c = Math.floor((v + this.half) / this.cell);
    return c < 0 ? 0 : c >= this.n ? this.n - 1 : c;
  }

  add(minX, minZ, maxX, maxZ, tag = 'wall', height = 3) {
    // One shape for every entry (op, holes preset) so the hot loops below stay monomorphic.
    // holes: window openings [a0, a1, ...] along x (holeX) or z, with a sill `sill` metres high.
    const b = { minX, minZ, maxX, maxZ, tag, height, mark: 0, op: null, holes: null, holeX: false, sill: 0, base: 0, owner: null };
    this.boxes.push(b);
    for (let x = this.ci(minX); x <= this.ci(maxX); x++)
      for (let z = this.ci(minZ); z <= this.ci(maxZ); z++) this.cells[z * this.n + x].push(b);
    return b;
  }

  addCentered(cx, cz, sx, sz, tag, height) {
    return this.add(cx - sx / 2, cz - sz / 2, cx + sx / 2, cz + sz / 2, tag, height);
  }

  // A streamed box record (the same shape as add()'s), for chunk layouts. Not registered anywhere until its chunk is.
  static box(minX, minZ, maxX, maxZ, tag, height, base = 0) {
    return { minX, minZ, maxX, maxZ, tag, height, mark: 0, op: null, holes: null, holeX: false, sill: 0, base, owner: null };
  }

  // ---- the chunk ring ------------------------------------------------------------------------------------------------
  slotOf(cx, cz) { return this.ring[(cx & 7) | ((cz & 7) << 3)]; }
  hasChunk(cx, cz) { const s = this.slotOf(cx, cz); return s.cx === cx && s.cz === cz; }
  // Put a chunk's boxes (already clipped to its square) into its slot, replacing whatever chunk held the slot.
  registerChunk(cx, cz, boxes) {
    const s = this.slotOf(cx, cz);
    if (s.cx === cx && s.cz === cz && s.boxes === boxes) return;
    this.clearSlot(s);
    s.cx = cx; s.cz = cz; s.boxes = boxes; s.used = true; s.gen++;
    const gx0 = cx * CC, gz0 = cz * CC;
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      const x0 = Math.max(0, Math.floor(b.minX / this.cell) - gx0), x1 = Math.min(CC - 1, Math.floor(b.maxX / this.cell) - gx0);
      const z0 = Math.max(0, Math.floor(b.minZ / this.cell) - gz0), z1 = Math.min(CC - 1, Math.floor(b.maxZ / this.cell) - gz0);
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) s.cells[z * CC + x].push(b);
    }
    this.chunkBoxes += boxes.length;
  }
  unregisterChunk(cx, cz) { const s = this.slotOf(cx, cz); if (s.cx === cx && s.cz === cz) this.clearSlot(s); }
  clearSlot(s) {
    if (!s.used) return;
    for (let i = 0; i < s.cells.length; i++) if (s.cells[i].length) s.cells[i].length = 0;
    this.chunkBoxes -= s.boxes.length;
    s.boxes = EMPTY; s.cx = 0x7fffffff; s.cz = 0x7fffffff; s.used = false; s.gen++;
  }
  // A streamed opening (a ring building's door leaf or window, systems/interiors.js) in the chunk ring: pushed into the
  // cells of the chunks it covers that are in the ring now, and taken out again when its building detaches. A slot that
  // changes hands (or empties) bumps its gen, so ringOpStale() tells interiors to put it back in.
  addRingOp(op, minX, minZ, maxX, maxZ, height = 2.3) {
    const b = { minX, minZ, maxX, maxZ, tag: op.kind, height, mark: 0, op, holes: null, holeX: false, sill: 0, base: 0, owner: null, lists: [], slots: [] };
    this.insertRingOp(b);
    return b;
  }
  insertRingOp(b) {
    b.lists.length = 0; b.slots.length = 0;
    const c = this.cell;
    for (let gx = Math.floor(b.minX / c); gx <= Math.floor(b.maxX / c); gx++) for (let gz = Math.floor(b.minZ / c); gz <= Math.floor(b.maxZ / c); gz++) {
      const s = this.ring[((gx >> 5) & 7) | (((gz >> 5) & 7) << 3)];
      if (!b.slots.includes(s)) b.slots.push(s, s.gen);
      const list = this.chunkCell(gx, gz);
      if (list !== EMPTY) { list.push(b); b.lists.push(list); }
    }
  }
  removeRingOp(b) {
    for (const list of b.lists) { const i = list.indexOf(b); if (i >= 0) { list[i] = list[list.length - 1]; list.pop(); } }
    b.lists.length = 0;
  }
  ringOpStale(b) { for (let i = 0; i < b.slots.length; i += 2) if (b.slots[i].gen !== b.slots[i + 1]) return true; return false; }
  // The list in global 8 m cell (gx, gz), or EMPTY when its chunk is not in the ring.
  chunkCell(gx, gz) {
    const cx = gx >> 5, cz = gz >> 5, s = this.ring[(cx & 7) | ((cz & 7) << 3)];
    if (s.cx !== cx || s.cz !== cz) return EMPTY;
    return s.cells[((gz - (cz << 5)) << 5) + (gx - (cx << 5))];
  }

  // Push a circle out of every box it overlaps. Returns penetration depth sum.
  // mover: who is walking/driving into things (a character or a vehicle). A door leaf gives way to a
  // mover and swings; to anything else (a spawn check, a crowd shove) it is as solid as a wall.
  // minY: the circle rides this high off the ground (a car in the air), so boxes no taller than that pass under it.
  // skip: boxes with this owner don't count (a ramp's own sides and lip, for the car riding or flying off that ramp).
  // topY: the mover's top: a floating box (base > 0) that starts at or above it passes over (people under a bridge).
  resolveCircle(p, r, mover = null, minY = -Infinity, skip = null, topY = 2.5) {
    const stamp = ++this.stamp;
    let pushed = 0;
    const bx0 = p.x - r, bx1 = p.x + r, bz0 = p.z - r, bz1 = p.z + r;
    if (bx1 > -ISQ && bx0 < ISQ && bz1 > -ISQ && bz0 < ISQ) {
      const x0 = this.ci(bx0), x1 = this.ci(bx1), z0 = this.ci(bz0), z1 = this.ci(bz1);
      for (let cx = x0; cx <= x1; cx++)
        for (let cz = z0; cz <= z1; cz++) {
          const list = this.cells[cz * this.n + cx];
          for (let i = 0; i < list.length; i++) pushed += this.circleBox(list[i], stamp, p, r, mover, minY, skip, topY);
        }
    }
    if (this.chunkBoxes > 0 && (bx0 < -ICORE || bx1 > ICORE || bz0 < -ICORE || bz1 > ICORE)) {
      const c = this.cell, gx0 = Math.floor(bx0 / c), gx1 = Math.floor(bx1 / c), gz0 = Math.floor(bz0 / c), gz1 = Math.floor(bz1 / c);
      for (let gx = gx0; gx <= gx1; gx++)
        for (let gz = gz0; gz <= gz1; gz++) {
          const list = this.chunkCell(gx, gz);
          for (let i = 0; i < list.length; i++) pushed += this.circleBox(list[i], stamp, p, r, mover, minY, skip, topY);
        }
    }
    const cg = this.cg;
    if (cg !== null && cg.n > 0 && bx1 > cg.x0 && bx0 < cg.x1 && bz1 > cg.z0 && bz0 < cg.z1) {
      const c = this.cell, gx0 = Math.floor(bx0 / c), gx1 = Math.floor(bx1 / c), gz0 = Math.floor(bz0 / c), gz1 = Math.floor(bz1 / c);
      for (let gx = gx0; gx <= gx1; gx++)
        for (let gz = gz0; gz <= gz1; gz++) {
          const list = cg.cell(gx, gz);
          for (let i = 0; i < list.length; i++) pushed += this.circleBox(list[i], stamp, p, r, mover, minY, skip, topY);
        }
    }
    for (let i = 0; i < this.extra.length; i++) pushed += this.circleBox(this.extra[i], stamp, p, r, mover, minY, skip, topY);
    return pushed;
  }

  // A person moving. Inside a storeyed building and up off the street floor (c.storey, c.gy: world/storeys.js, kept by
  // main.js standOn), only the boxes across their own height range count: the floor below's walls pass under their feet,
  // the floor above's over their head. Everywhere else, the old flat rule (dunes, ramps and bridges as they were).
  // mover: who pushes doors (the person by default; null for a shove in a crowd, where a door is as solid as a wall).
  resolveBody(p, r, c, mover = c) {
    if (c?.ug && this.under) { const u = c.gy ?? 0; return this.under.resolveCircle(p, r, mover, u + 0.25, null, u + 2.4); } // underground: the level's own walls at its own height
    const y = c?.storey ? (c.gy ?? 0) - (c.storey.y0 ?? 0) : 0; // a building's boxes stand on its own floor (y0: raised ground)
    return y > 0.5 ? this.resolveCircle(p, r, mover, y + 0.25, null, y + 2.4) : this.resolveCircle(p, r, mover);
  }

  circleBox(b, stamp, p, r, mover, minY, skip, topY) {
    if (b.mark === stamp) return 0;
    b.mark = stamp;
    if (b.height <= minY || b.base >= topY || (skip && b.owner === skip)) return 0;
    if (b.op) {
      if (this.ops && p.x + r > b.minX && p.x - r < b.maxX && p.z + r > b.minZ && p.z - r < b.maxZ) return this.ops.circle(b.op, p, r, mover);
      return 0;
    }
    const qx = p.x < b.minX ? b.minX : p.x > b.maxX ? b.maxX : p.x;
    const qz = p.z < b.minZ ? b.minZ : p.z > b.maxZ ? b.maxZ : p.z;
    const dx = p.x - qx, dz = p.z - qz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= r * r) return 0;
    if (d2 > 1e-8) {
      const d = Math.sqrt(d2);
      const k = (r - d) / d;
      p.x += dx * k; p.z += dz * k;
      return r - d;
    }
    // Center inside the box: leave by the shallowest side.
    const l = p.x - b.minX, rr = b.maxX - p.x, t = p.z - b.minZ, bt = b.maxZ - p.z;
    const m = Math.min(l, rr, t, bt);
    if (m === l) p.x = b.minX - r; else if (m === rr) p.x = b.maxX + r;
    else if (m === t) p.z = b.minZ - r; else p.z = b.maxZ + r;
    return m + r;
  }

  // Ray vs boxes. Returns distance to first hit (or maxDist). Fills this.hit.
  // mode: RAY_SOLID | RAY_SIGHT | RAY_BULLET (see the top of the file). y >= 0: the ray's height (a
  // thrown thing): anything lower than it is flown over, so a sill can't hide the glass behind it.
  raycast(x0, z0, dx, dz, maxDist, mode = RAY_SOLID, y = -1) {
    if (y < -1.5 && this.under) { // a ray at an underground height is the UnderWorld's (systems/underground.js); y is over the street, as up a building
      const t = this.under.raycast(x0, z0, dx, dz, maxDist, mode, y + (this.under.y0 ?? 0)), h = this.under.hit; // its boxes stand at true heights (a town's pad for its drains)
      this.hit.t = t; this.hit.nx = h.nx; this.hit.nz = h.nz; this.hit.box = h.box;
      return t;
    }
    const stamp = ++this.stamp;
    const step = this.cell * 0.5;
    this.best = maxDist;
    this.hit.box = null;
    const invX = dx !== 0 ? 1 / dx : 1e9, invZ = dz !== 0 ? 1 / dz : 1e9;
    let lastCell = -1, lastG = 0x7fffffff, lastGz = 0x7fffffff, lastCx = 0x7fffffff, lastCz = 0x7fffffff;
    const chunks = this.chunkBoxes > 0, cg = this.cg !== null && this.cg.n > 0 ? this.cg : null;
    for (let s = 0; s <= maxDist + step; s += step) {
      if (s > this.best + this.cell) break;
      const px = x0 + dx * Math.min(s, maxDist), pz = z0 + dz * Math.min(s, maxDist);
      if (px > -ISQ - this.cell && px < ISQ + this.cell && pz > -ISQ - this.cell && pz < ISQ + this.cell) {
        const cx = this.ci(px), cz = this.ci(pz);
        // Check the 3x3 neighbourhood once per new cell so diagonal rays never slip through.
        const id = cz * this.n + cx;
        if (id !== lastCell) {
          lastCell = id;
          for (let ox = -1; ox <= 1; ox++)
            for (let oz = -1; oz <= 1; oz++) {
              const nx = cx + ox, nz = cz + oz;
              if (nx < 0 || nz < 0 || nx >= this.n || nz >= this.n) continue;
              this.rayList(this.cells[nz * this.n + nx], stamp, x0, z0, dx, dz, invX, invZ, mode, y);
            }
        }
      }
      if (chunks && (px < -ICORE + this.cell || px > ICORE - this.cell || pz < -ICORE + this.cell || pz > ICORE - this.cell)) {
        const gx = Math.floor(px / this.cell), gz = Math.floor(pz / this.cell);
        if (gx !== lastG || gz !== lastGz) {
          lastG = gx; lastGz = gz;
          for (let ox = -1; ox <= 1; ox++) for (let oz = -1; oz <= 1; oz++) this.rayList(this.chunkCell(gx + ox, gz + oz), stamp, x0, z0, dx, dz, invX, invZ, mode, y);
        }
      }
      if (cg !== null && px > cg.x0 - this.cell && px < cg.x1 + this.cell && pz > cg.z0 - this.cell && pz < cg.z1 + this.cell) {
        const gx = Math.floor(px / this.cell), gz = Math.floor(pz / this.cell);
        if (gx !== lastCx || gz !== lastCz) {
          lastCx = gx; lastCz = gz;
          for (let ox = -1; ox <= 1; ox++) for (let oz = -1; oz <= 1; oz++) this.rayList(cg.cell(gx + ox, gz + oz), stamp, x0, z0, dx, dz, invX, invZ, mode, y);
        }
      }
    }
    this.hit.t = this.best;
    return this.best;
  }

  rayList(list, stamp, x0, z0, dx, dz, invX, invZ, mode, y) {
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (b.mark === stamp) continue;
      b.mark = stamp;
      if (y >= 0 && b.height <= y) continue;
      if (b.base > 0 && y < b.base) continue; // a floating box: ground-level rays and low throws pass under it
      const best = this.best;
      if (b.op !== null) {
        if (!this.ops) continue;
        const t = this.ops.ray(b.op, x0, z0, dx, dz, best, mode);
        if (t < best) { this.best = t; this.hit.nx = this.ops.nx; this.hit.nz = this.ops.nz; this.hit.box = b; }
        continue;
      }
      const t1 = (b.minX - x0) * invX, t2 = (b.maxX - x0) * invX;
      let tmin = Math.min(t1, t2), tmax = Math.max(t1, t2);
      let nxv = t1 < t2 ? -1 : 1, nzv = 0;
      const t3 = (b.minZ - z0) * invZ, t4 = (b.maxZ - z0) * invZ;
      const tzmin = Math.min(t3, t4), tzmax = Math.max(t3, t4);
      if (tzmin > tmin) { tmin = tzmin; nxv = 0; nzv = t3 < t4 ? -1 : 1; }
      tmax = Math.min(tmax, tzmax);
      if (tmax < 0 || tmin > tmax) continue;
      if (tmin < 0) tmin = 0;
      // In and out through the same window hole: nothing of this wall in the way (the glass or
      // boards are the window's own op). Thrown things only when they clear the sill.
      if (b.holes !== null && (mode !== RAY_SOLID || y > b.sill) && tmin < best && this.throughHole(b, x0, z0, dx, dz, tmin, tmax)) continue;
      if (tmin < best) {
        this.best = tmin;
        this.hit.nx = nxv; this.hit.nz = nzv; this.hit.box = b;
      }
    }
  }

  throughHole(b, x0, z0, dx, dz, t0, t1) {
    const h = b.holes;
    const a0 = b.holeX ? x0 + dx * t0 : z0 + dz * t0, a1 = b.holeX ? x0 + dx * t1 : z0 + dz * t1;
    for (let i = 0; i < h.length; i += 2) if (a0 >= h[i] && a0 <= h[i + 1] && a1 >= h[i] && a1 <= h[i + 1]) return true;
    return false;
  }

  // Sight by default: glass and window holes don't block it, boards and closed doors do. y >= 0: the ray's height (an
  // upper floor's eye line: the walls of the floor below pass under it, the floor above's over it).
  lineOfSight(ax, az, bx, bz, mode = RAY_SIGHT, y = -1) {
    const dx = bx - ax, dz = bz - az;
    const d = Math.hypot(dx, dz);
    if (d < 0.01) return true;
    return this.raycast(ax, az, dx / d, dz / d, d, mode, y) >= d - 0.05;
  }

  pointBlocked(x, z, r = 0.5) {
    const p = { x, z };
    return this.resolveCircle(p, r) > 0;
  }
}

// Segment (origin + dir * t, t in [0,maxT]) vs circle. Returns t or -1.
export function rayCircle(x0, z0, dx, dz, cx, cz, r, maxT) {
  const fx = x0 - cx, fz = z0 - cz;
  const b = fx * dx + fz * dz;
  const c = fx * fx + fz * fz - r * r;
  const disc = b * b - c;
  if (disc < 0) return -1;
  const t = -b - Math.sqrt(disc);
  if (t < 0 || t > maxT) return c < 0 ? 0 : -1;
  return t;
}
