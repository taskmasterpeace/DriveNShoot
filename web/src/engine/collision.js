// Static collision world: axis-aligned boxes bucketed in a uniform spatial hash.
// Everything that never moves (walls, wrecks, crates) lives here. Queries are
// allocation-free so they can run hundreds of times per frame.

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
  }

  ci(v) {
    const c = Math.floor((v + this.half) / this.cell);
    return c < 0 ? 0 : c >= this.n ? this.n - 1 : c;
  }

  add(minX, minZ, maxX, maxZ, tag = 'wall', height = 3) {
    const b = { minX, minZ, maxX, maxZ, tag, height, mark: 0 };
    this.boxes.push(b);
    for (let x = this.ci(minX); x <= this.ci(maxX); x++)
      for (let z = this.ci(minZ); z <= this.ci(maxZ); z++) this.cells[z * this.n + x].push(b);
    return b;
  }

  addCentered(cx, cz, sx, sz, tag, height) {
    return this.add(cx - sx / 2, cz - sz / 2, cx + sx / 2, cz + sz / 2, tag, height);
  }

  // Push a circle out of every box it overlaps. Returns penetration depth sum. minY: the circle rides this high off
  // the ground (a car in the air), so boxes no taller than that pass under it. skip: boxes with this owner don't
  // count (a ramp's own sides and lip, for the car riding or flying off that ramp).
  resolveCircle(p, r, minY = -Infinity, skip = null) {
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
          if (b.height <= minY || (skip && b.owner === skip)) continue;
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
  raycast(x0, z0, dx, dz, maxDist) {
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
            let t1 = (b.minX - x0) * invX, t2 = (b.maxX - x0) * invX;
            let tmin = Math.min(t1, t2), tmax = Math.max(t1, t2);
            let nxv = t1 < t2 ? -1 : 1, nzv = 0;
            const t3 = (b.minZ - z0) * invZ, t4 = (b.maxZ - z0) * invZ;
            const tzmin = Math.min(t3, t4), tzmax = Math.max(t3, t4);
            if (tzmin > tmin) { tmin = tzmin; nxv = 0; nzv = t3 < t4 ? -1 : 1; }
            tmax = Math.min(tmax, tzmax);
            if (tmax < 0 || tmin > tmax) continue;
            if (tmin < 0) tmin = 0;
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

  lineOfSight(ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az;
    const d = Math.hypot(dx, dz);
    if (d < 0.01) return true;
    return this.raycast(ax, az, dx / d, dz / d, d) >= d - 0.05;
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
