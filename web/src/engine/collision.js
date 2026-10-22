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
export const RAY_SOLID = 0, RAY_SIGHT = 1, RAY_BULLET = 2;

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
  }

  // An opening's entry: bucketed over the area it can ever occupy (a door's whole swing).
  addOp(op, minX, minZ, maxX, maxZ, height = 2.3) {
    const b = { minX, minZ, maxX, maxZ, tag: op.kind, height, mark: 0, op, holes: null, holeX: false, sill: 0 }; // same shape as add()'s
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
    const b = { minX, minZ, maxX, maxZ, tag, height, mark: 0, op: null, holes: null, holeX: false, sill: 0 };
    this.boxes.push(b);
    for (let x = this.ci(minX); x <= this.ci(maxX); x++)
      for (let z = this.ci(minZ); z <= this.ci(maxZ); z++) this.cells[z * this.n + x].push(b);
    return b;
  }

  addCentered(cx, cz, sx, sz, tag, height) {
    return this.add(cx - sx / 2, cz - sz / 2, cx + sx / 2, cz + sz / 2, tag, height);
  }

  // Push a circle out of every box it overlaps. Returns penetration depth sum.
  // mover: who is walking/driving into things (a character or a vehicle). A door leaf gives way to a
  // mover and swings; to anything else (a spawn check, a crowd shove) it is as solid as a wall.
  resolveCircle(p, r, mover = null) {
    const stamp = ++this.stamp;
    let pushed = 0;
    const x0 = this.ci(p.x - r), x1 = this.ci(p.x + r), z0 = this.ci(p.z - r), z1 = this.ci(p.z + r);
    for (let cx = x0; cx <= x1; cx++)
      for (let cz = z0; cz <= z1; cz++) {
        const list = this.cells[cz * this.n + cx];
        for (let i = 0; i < list.length; i++) {
          const b = list[i];
          if (b.mark === stamp) continue;
          b.mark = stamp;
          if (b.op) {
            if (this.ops && p.x + r > b.minX && p.x - r < b.maxX && p.z + r > b.minZ && p.z - r < b.maxZ) pushed += this.ops.circle(b.op, p, r, mover);
            continue;
          }
          const qx = p.x < b.minX ? b.minX : p.x > b.maxX ? b.maxX : p.x;
          const qz = p.z < b.minZ ? b.minZ : p.z > b.maxZ ? b.maxZ : p.z;
          let dx = p.x - qx, dz = p.z - qz;
          const d2 = dx * dx + dz * dz;
          if (d2 >= r * r) continue;
          if (d2 > 1e-8) {
            const d = Math.sqrt(d2);
            const k = (r - d) / d;
            p.x += dx * k; p.z += dz * k;
            pushed += r - d;
          } else {
            // Center inside the box: leave by the shallowest side.
            const l = p.x - b.minX, rr = b.maxX - p.x, t = p.z - b.minZ, bt = b.maxZ - p.z;
            const m = Math.min(l, rr, t, bt);
            if (m === l) p.x = b.minX - r; else if (m === rr) p.x = b.maxX + r;
            else if (m === t) p.z = b.minZ - r; else p.z = b.maxZ + r;
            pushed += m + r;
          }
        }
      }
    return pushed;
  }

  // Ray vs boxes. Returns distance to first hit (or maxDist). Fills this.hit.
  // mode: RAY_SOLID | RAY_SIGHT | RAY_BULLET (see the top of the file). y >= 0: the ray's height (a
  // thrown thing): anything lower than it is flown over, so a sill can't hide the glass behind it.
  raycast(x0, z0, dx, dz, maxDist, mode = RAY_SOLID, y = -1) {
    const stamp = ++this.stamp;
    const step = this.cell * 0.5;
    let best = maxDist;
    this.hit.box = null;
    const invX = dx !== 0 ? 1 / dx : 1e9, invZ = dz !== 0 ? 1 / dz : 1e9;
    let lastCell = -1;
    for (let s = 0; s <= maxDist + step; s += step) {
      if (s > best + this.cell) break;
      const px = x0 + dx * Math.min(s, maxDist), pz = z0 + dz * Math.min(s, maxDist);
      const cx = this.ci(px), cz = this.ci(pz);
      // Check the 3x3 neighbourhood once per new cell so diagonal rays never slip through.
      const id = cz * this.n + cx;
      if (id === lastCell) continue;
      lastCell = id;
      for (let ox = -1; ox <= 1; ox++)
        for (let oz = -1; oz <= 1; oz++) {
          const nx = cx + ox, nz = cz + oz;
          if (nx < 0 || nz < 0 || nx >= this.n || nz >= this.n) continue;
          const list = this.cells[nz * this.n + nx];
          for (let i = 0; i < list.length; i++) {
            const b = list[i];
            if (b.mark === stamp) continue;
            b.mark = stamp;
            if (y >= 0 && b.height <= y) continue;
            if (b.op !== null) {
              if (!this.ops) continue;
              const t = this.ops.ray(b.op, x0, z0, dx, dz, best, mode);
              if (t < best) { best = t; this.hit.nx = this.ops.nx; this.hit.nz = this.ops.nz; this.hit.box = b; }
              continue;
            }
            let t1 = (b.minX - x0) * invX, t2 = (b.maxX - x0) * invX;
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
              best = tmin;
              this.hit.nx = nxv; this.hit.nz = nzv; this.hit.box = b;
            }
          }
        }
    }
    this.hit.t = best;
    return best;
  }

  throughHole(b, x0, z0, dx, dz, t0, t1) {
    const h = b.holes;
    const a0 = b.holeX ? x0 + dx * t0 : z0 + dz * t0, a1 = b.holeX ? x0 + dx * t1 : z0 + dz * t1;
    for (let i = 0; i < h.length; i += 2) if (a0 >= h[i] && a0 <= h[i + 1] && a1 >= h[i] && a1 <= h[i + 1]) return true;
    return false;
  }

  // Sight by default: glass and window holes don't block it, boards and closed doors do.
  lineOfSight(ax, az, bx, bz, mode = RAY_SIGHT) {
    const dx = bx - ax, dz = bz - az;
    const d = Math.hypot(dx, dz);
    if (d < 0.01) return true;
    return this.raycast(ax, az, dx / d, dz / d, d, mode) >= d - 0.05;
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
