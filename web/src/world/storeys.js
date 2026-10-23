import * as THREE from 'three';
import { makeRng } from '../engine/rng.js';
import { Hasher } from './geo.js';
import { STOREY, FLIGHT, RAIL, WINDOWS, LEVEL, RISE, UPSTAIRS } from '../data/storeys.js';

// Buildings with floors above the street (docs/design/WEB_STOREYS.md), on the streaming branch's vertical model:
// a floor is a DECK that counts only for someone already up near it (heightAt), its walls are static boxes with a
// `base` and a `height`, and a flight of stairs is a slope between two decks. Nothing here is a second source of truth
// for height: a person's level is just where their `gy` sits.
//
// Layout (for a building with n upper storeys): Y[0] = 0 (the street), Y[1] = the street storey's own wall top (city.js
// rolled it, 4.2-6 m), Y[k] = Y[1] + (k-1)·up. Flight 0 climbs Y[0]→Y[1] against an inside wall, as long as its rise
// needs at the one pitch; the flights above (Y[k]→Y[k+1]) switch back in a second band beside it. Every flight is
// entered at its two ends only: its flanks are walls on its own height range, the top end is blocked at the lower
// floor, and the hole it leaves in the floor above is railed.
//
// Built after city.js and before the nav grids (the street floor's walkers route round the stairwell), with its own
// seed per building (its position), so the island's layout and its golden hash (streamer.js, which skips 'storey'
// boxes) do not move.
//   build()                     raise the buildings, colliders, one instanced batch
//   heightAt(x, z, y)           the floor or stair under someone standing at height y, or null outside these buildings
//   at(x, z)                    the storeyed building around a point (its record), or null
//   levelOf(S, y)               which floor of S height y is (0 = the street storey), or -1 on a flight
//   sameFloor(a, b)             may a and b see, shoot, reach each other (outside these buildings: always, as before)
//   steer(c, tx, tz, ty)        the point a person should head for to reach (tx, tz) at height ty: the stairs, or null
//   setView(S, y)               inside S at height y: the floors above are not drawn
const WALL_T = 0.5, CELL = 16, IN = WALL_T / 2;
const _o = new THREE.Object3D();

export class Storeys {
  constructor(game) {
    this.g = game;
    this.list = [];          // one record per storeyed building
    this.grid = new Map();   // CELL-m cells -> records
    this.items = [];         // { cx, cy, cz, sx, sy, sz, color, lv, S }
    this.mesh = null;
    this.viewS = null; this.viewL = -1;
    this.boxes = 0;
  }

  // ---- building ------------------------------------------------------------------------------------------------------
  build() {
    const g = this.g, W = g.world;
    for (const b of W.buildings) {
      if (!b.enterable || b.ruined || !b.roofIdx?.length) continue;
      const R = RISE[b.district];
      const w = b.maxX - b.minX, d = b.maxZ - b.minZ;
      if (!R || w * d < R.minArea) continue;
      const rng = makeRng(seedOf(b));
      if (rng() >= R.share) continue;
      const n = rng.int(R.storeys[0], R.storeys[1]);
      const S = this.plan(b, n, rng);
      if (!S) continue; // no wall has room for a staircase clear of doors, the partition and the furniture
      this.raise(S, rng);
      this.list.push(S);
      b.storey = S;
      for (let cx = Math.floor(b.minX / CELL); cx <= Math.floor(b.maxX / CELL); cx++)
        for (let cz = Math.floor(b.minZ / CELL); cz <= Math.floor(b.maxZ / CELL); cz++) {
          const k = `${cx},${cz}`;
          if (!this.grid.has(k)) this.grid.set(k, []);
          this.grid.get(k).push(S);
        }
    }
    this.mesh = this.batch();
    if (this.mesh) g.scene.add(this.mesh);
    this.hash = this.hashAll();
  }

  // Where the staircase goes: along one inside wall, starting at a corner, clear of that wall's doors, the partition,
  // every piece of furniture and every bed. Candidates are tried in a seeded order; the first that fits wins.
  plan(b, n, rng) {
    const g = this.g, h = b.h, up = STOREY.up;
    const L0 = h / FLIGHT.pitch, Lu = up / FLIGHT.pitch, fw = FLIGHT.w, land = FLIGHT.landing;
    const depth = n > 1 ? fw * 2 : fw, need = land + L0 + land;
    const px = b.innerDoors?.[0]?.x ?? null;
    const cands = [];
    for (const side of ['N', 'S', 'W', 'E']) {
      const alongX = side === 'N' || side === 'S';
      const lo = (alongX ? b.minX : b.minZ) + IN, hi = (alongX ? b.maxX : b.maxZ) - IN;
      if (hi - lo < need + 0.2) continue;
      // From either corner, climbing away from it. (Not toward it: a top landing in a corner leaves a pocket on the street
      // floor beside the flight's high end that nobody can walk into - the nav grid sealed one.)
      cands.push({ side, alongX, o: lo + land, dir: 1 }, { side, alongX, o: hi - land, dir: -1 });
    }
    for (let i = cands.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [cands[i], cands[j]] = [cands[j], cands[i]]; }
    for (const c of cands) {
      // The footprint the stairs and their landings take: run r in [-land, L0 + land], band [0, depth] from the wall.
      const fr = this.frame(b, c);
      const area = fr.rect(-land, L0 + land, 0, depth);
      if (!this.clear(b, c, area, px)) continue;
      const Y = [0, h];
      for (let k = 2; k <= n; k++) Y.push(h + (k - 1) * up);
      const flights = [];
      for (let i = 0; i < n; i++) {
        const band = i % 2 === 0 ? 0 : 1;
        const r0 = i === 0 ? 0 : L0 - Lu, r1 = i === 0 ? L0 : L0;
        const climbsOut = i === 0 || band === 0; // band 0 flights climb with dir, band 1 flights back against it
        const f = { i, from: Y[i], to: Y[i + 1], len: r1 - r0, band, ...fr.rect(r0, r1, band * fw, band * fw + fw) };
        f.ax = c.alongX ? 'x' : 'z';
        f.u = climbsOut ? c.dir : -c.dir;
        f.s0 = fr.along(climbsOut ? r0 : r1);
        const aEnd = (s) => fr.point(s, (band + 0.5) * fw);
        f.bottomOut = aEnd(climbsOut ? r0 - 0.8 : r1 + 0.8);
        f.topOut = aEnd(climbsOut ? r1 + 0.8 : r0 - 0.8);
        f.rBottom = climbsOut ? r0 : r1; f.rTop = climbsOut ? r1 : r0;
        flights.push(f);
      }
      return { b, n, Y, flights, frame: fr, c, depth, area, color: b.color ?? '#7c756a',
        ix0: b.minX + IN, ix1: b.maxX - IN, iz0: b.minZ + IN, iz1: b.maxZ - IN, top: Y[n] + up, idx: [] };
    }
    return null;
  }

  // A staircase's own frame: run r along the wall from the origin in the climb direction, band q in from the wall.
  frame(b, c) {
    const wall = c.side === 'N' ? b.minZ + IN : c.side === 'S' ? b.maxZ - IN : c.side === 'W' ? b.minX + IN : b.maxX - IN;
    const inward = c.side === 'N' || c.side === 'W' ? 1 : -1;
    const along = (r) => c.o + c.dir * r;
    const across = (q) => wall + inward * q;
    return {
      along,
      point: (r, q) => (c.alongX ? { x: along(r), z: across(q) } : { x: across(q), z: along(r) }),
      rect(r0, r1, q0, q1) {
        const a0 = Math.min(along(r0), along(r1)), a1 = Math.max(along(r0), along(r1));
        const b0 = Math.min(across(q0), across(q1)), b1 = Math.max(across(q0), across(q1));
        return c.alongX ? { minX: a0, maxX: a1, minZ: b0, maxZ: b1 } : { minX: b0, maxX: b1, minZ: a0, maxZ: a1 };
      },
    };
  }

  clear(b, c, area, px) {
    const g = this.g, pad = 0.3;
    const hit = (x0, z0, x1, z1) => x1 > area.minX - pad && x0 < area.maxX + pad && z1 > area.minZ - pad && z0 < area.maxZ + pad;
    // The wall's own doors (and a metre either side), the partition, the inner door.
    for (const d of b.doors) if (hit(d.x - 1.4, d.z - 1.4, d.x + 1.4, d.z + 1.4)) return false;
    for (const d of b.innerDoors ?? []) if (hit(d.x - 1.6, d.z - 1.6, d.x + 1.6, d.z + 1.6)) return false;
    if (px !== null && hit(px - 0.5, b.minZ, px + 0.5, b.maxZ)) return false;
    for (const s of g.statics.boxes) {
      if (s.tag !== 'crate' && s.tag !== 'table' && s.tag !== 'shelf') continue;
      if (s.maxX < b.minX || s.minX > b.maxX || s.maxZ < b.minZ || s.minZ > b.maxZ) continue;
      if (hit(s.minX, s.minZ, s.maxX, s.maxZ)) return false;
    }
    for (const bed of g.world.spawns.beds) if (hit(bed.x - 1, bed.z - 1, bed.x + 1, bed.z + 1)) return false;
    return true;
  }

  // Colliders and visuals for one building: the walls above the street storey (window openings cut in), the floors
  // (slabs with the stairwell left open), the flights (treads, flanks, rails, the top-end block), the roof moved up,
  // and the upstairs furniture.
  raise(S, rng) {
    const { b, n, Y, top, color } = S, st = this.g.statics, h = Y[1];
    const add = (minX, minZ, maxX, maxZ, base, height, tag = 'storey') => { const x = st.add(minX, minZ, maxX, maxZ, tag, height); x.base = base; this.boxes++; return x; };
    const vis = (cx, cy, cz, sx, sy, sz, col, lv) => { this.items.push({ cx, cy, cz, sx, sy, sz, color: new THREE.Color(col), lv, S }); };
    const shade = (col, k) => `#${new THREE.Color(col).multiplyScalar(k).getHexString()}`;

    // ---- the walls above the street storey: one collider a side (base = the street storey's wall top, so walkers on
    // the street pass under nothing new and door gaps get a lintel upstairs), window openings as holes.
    const sides = [
      { horiz: true, fixed: b.minZ, a0: b.minX, a1: b.maxX }, { horiz: true, fixed: b.maxZ, a0: b.minX, a1: b.maxX },
      { horiz: false, fixed: b.minX, a0: b.minZ, a1: b.maxZ }, { horiz: false, fixed: b.maxX, a0: b.minZ, a1: b.maxZ },
    ];
    for (const sd of sides) {
      const p0 = sd.a0 - IN, p1 = sd.a1 + IN, len = p1 - p0;
      const nw = Math.max(0, Math.floor((len - 1.6) / WINDOWS.every));
      const centres = [];
      for (let k = 0; k < nw; k++) centres.push(p0 + 0.8 + (k + 0.5) * ((len - 1.6) / nw));
      const holes = [];
      for (const c of centres) holes.push(c - WINDOWS.w / 2, c + WINDOWS.w / 2);
      const box = sd.horiz ? add(p0, sd.fixed - IN, p1, sd.fixed + IN, h, top, 'storey-wall') : add(sd.fixed - IN, p0, sd.fixed + IN, p1, h, top, 'storey-wall');
      if (holes.length) { box.holes = holes; box.holeX = sd.horiz; box.sill = h + WINDOWS.sill; }
      // Visuals per storey band (so a floor above you can be hidden): solid between the windows, a sill and a lintel
      // in each opening.
      const piece = (a0, a1, y0, y1, col, lv) => {
        if (a1 - a0 < 0.05 || y1 - y0 < 0.02) return;
        const mid = (a0 + a1) / 2, sy = y1 - y0, cy = (y0 + y1) / 2;
        if (sd.horiz) vis(mid, cy, sd.fixed, a1 - a0, sy, WALL_T, col, lv); else vis(sd.fixed, cy, mid, WALL_T, sy, a1 - a0, col, lv);
      };
      for (let k = 1; k <= n; k++) {
        const y0 = Y[k], y1 = k === n ? top + STOREY.top : Y[k] + STOREY.up;
        let cur = p0;
        for (const c of centres) {
          piece(cur, c - WINDOWS.w / 2, y0, y1, color, k);
          piece(c - WINDOWS.w / 2, c + WINDOWS.w / 2, y0, y0 + WINDOWS.sill, shade(color, 1.12), k);
          piece(c - WINDOWS.w / 2, c + WINDOWS.w / 2, y0 + WINDOWS.sill + WINDOWS.h, y1, color, k);
          cur = c + WINDOWS.w / 2;
        }
        piece(cur, p1, y0, y1, color, k);
      }
    }

    // ---- floors: a slab over the footprint with the arriving flight's hole left open (visual; the deck is heightAt).
    const slabCol = b.district === 'town' ? '#6b5543' : '#5a524a'; // boards in town, concrete in the ruins: a floor, not more wall
    for (let k = 1; k <= n; k++) {
      const hole = S.flights[k - 1], y = Y[k] - STOREY.slab / 2;
      const x0 = S.ix0, x1 = S.ix1, z0 = S.iz0, z1 = S.iz1;
      const rect = (a, bb, c, d) => { if (bb - a > 0.05 && d - c > 0.05) vis((a + bb) / 2, y, (c + d) / 2, bb - a, STOREY.slab, d - c, slabCol, k); };
      rect(x0, x1, z0, hole.minZ); rect(x0, x1, hole.maxZ, z1);
      rect(x0, hole.minX, hole.minZ, hole.maxZ); rect(hole.maxX, x1, hole.minZ, hole.maxZ);
    }

    // ---- flights: treads (solid steps for the street flight), flanks, the top-end block, the rails round the hole above.
    const T = RAIL.t, wallSide = (f) => f.band === 0; // band 0 sits against the outside wall: no flank on that side
    for (const f of S.flights) {
      const steps = Math.max(8, Math.round(f.len / 0.28)), rise = f.to - f.from, fr = S.frame;
      const q0 = f.band * FLIGHT.w, q1 = q0 + FLIGHT.w;
      for (let s = 0; s < steps; s++) {
        const ra = f.rBottom + ((f.rTop - f.rBottom) * s) / steps, rb = f.rBottom + ((f.rTop - f.rBottom) * (s + 1)) / steps;
        const rr = fr.rect(ra, rb, q0 + 0.05, q1 - 0.05), yTop = f.from + (rise * (s + 1)) / steps;
        const y0 = f.i === 0 ? 0 : yTop - 0.18; // the street flight is built up solid; the ones above are treads
        vis((rr.minX + rr.maxX) / 2, (y0 + yTop) / 2, (rr.minZ + rr.maxZ) / 2, rr.maxX - rr.minX, yTop - y0, rr.maxZ - rr.minZ, s % 2 ? '#5b4a3a' : '#655241', f.i);
      }
      // Flanks: the long sides not against the outside wall, over the flight's own height range. They start FLANK_OPEN m
      // up the flight: stepping onto the first steps from the side is a rise under half a metre, and a flank from the
      // very bottom left a corner landing too narrow for the nav grid (a sealed pocket on the street floor).
      const dirR = Math.sign(f.rTop - f.rBottom), FLANK_OPEN = 0.7;
      const flankQs = wallSide(f) ? [q1] : [q0, q1];
      for (const q of flankQs) {
        const fl = fr.rect(f.rBottom + dirR * FLANK_OPEN, f.rTop, q - T / 2, q + T / 2), r = fr.rect(f.rBottom, f.rTop, q - T / 2, q + T / 2);
        add(fl.minX, fl.minZ, fl.maxX, fl.maxZ, f.from, f.to + 0.1);
        vis((fl.minX + fl.maxX) / 2, (f.from + f.to) / 2, (fl.minZ + fl.maxZ) / 2, fl.maxX - fl.minX, f.to - f.from, fl.maxZ - fl.minZ, shade(color, 0.85), f.i);
        // ...and a rail above the whole side, round the hole on the floor the flight arrives at.
        add(r.minX, r.minZ, r.maxX, r.maxZ, f.to, f.to + RAIL.h);
        vis((r.minX + r.maxX) / 2, f.to + RAIL.h / 2, (r.minZ + r.maxZ) / 2, r.maxX - r.minX, RAIL.h, r.maxZ - r.minZ, '#3a3430', f.i + 1);
      }
      // The top end is shut at the lower floor (nobody walks in under the top of a stair)...
      const te = fr.rect(f.rTop - T / 2 * Math.sign(f.rTop - f.rBottom), f.rTop + T / 2 * Math.sign(f.rTop - f.rBottom), q0, q1);
      add(te.minX, te.minZ, te.maxX, te.maxZ, f.from, f.from + FLIGHT.block);
      vis((te.minX + te.maxX) / 2, f.from + FLIGHT.block / 2, (te.minZ + te.maxZ) / 2, te.maxX - te.minX, FLIGHT.block, te.maxZ - te.minZ, shade(color, 0.85), f.i);
      // ...and the bottom end is railed on the floor above (the hole's last edge; the top end is where you step off).
      const be = fr.rect(f.rBottom - T / 2 * Math.sign(f.rTop - f.rBottom), f.rBottom + T / 2 * Math.sign(f.rTop - f.rBottom), q0, q1);
      add(be.minX, be.minZ, be.maxX, be.maxZ, f.to, f.to + RAIL.h);
      vis((be.minX + be.maxX) / 2, f.to + RAIL.h / 2, (be.minZ + be.maxZ) / 2, be.maxX - be.minX, RAIL.h, be.maxZ - be.minZ, '#3a3430', f.i + 1);
    }

    // ---- the roof goes up on top of the top storey (it hides with the rest when you walk in).
    this.g.world.raiseRoof?.(b, top - h);

    // ---- upstairs: crates and shelves (containers: inventory.js placeFurniture reads the 'crate'/'shelf' boxes), a mattress.
    const area = (S.ix1 - S.ix0) * (S.iz1 - S.iz0);
    for (let k = 1; k <= n; k++) {
      const count = Math.max(1, Math.floor(area / UPSTAIRS.per));
      for (let i = 0; i < count; i++) {
        const x = rng.range(S.ix0 + 1.2, S.ix1 - 1.2), z = rng.range(S.iz0 + 1.2, S.iz1 - 1.2);
        if (x > S.area.minX - 1 && x < S.area.maxX + 1 && z > S.area.minZ - 1 && z < S.area.maxZ + 1) continue; // the stairs and their landings
        const r = rng(), y = Y[k];
        if (r < UPSTAIRS.crate) {
          const c = add(x - 0.5, z - 0.5, x + 0.5, z + 0.5, y, y + 1, 'crate'); c.storeyLv = k;
          vis(x, y + 0.5, z, 1, 1, 1, '#7a5a34', k);
        } else if (r < UPSTAIRS.crate + UPSTAIRS.shelf) {
          const along = rng.chance(0.5);
          const c = along ? add(x - 1.1, z - 0.25, x + 1.1, z + 0.25, y, y + 1.8, 'shelf') : add(x - 0.25, z - 1.1, x + 0.25, z + 1.1, y, y + 1.8, 'shelf'); c.storeyLv = k;
          vis(x, y + 0.9, z, along ? 2.2 : 0.5, 1.8, along ? 0.5 : 2.2, '#4d3a29', k);
        } else {
          vis(x, y + 0.12, z, 1, 0.22, 2, rng.pick(['#6d6552', '#4f5a4f', '#7a6048']), k);
          this.g.world.spawns.beds.push({ x, z, face: 0, bedY: y + 0.2, y, upstairs: true }); // somewhere to sleep (survival.js); not a townsfolk's bed (ai.js)
        }
      }
    }
  }

  batch() {
    if (!this.items.length) return null;
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.88, metalness: 0.04 });
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, this.items.length);
    this.items.forEach((it, i) => { it.S.idx.push(i); this.place(mesh, i, it, true); mesh.setColorAt(i, it.color); });
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    return mesh;
  }
  place(mesh, i, it, on) {
    _o.position.set(it.cx, it.cy, it.cz); _o.rotation.set(0, 0, 0);
    const k = on ? 1 : 0;
    _o.scale.set(it.sx * k, it.sy * k, it.sz * k); _o.updateMatrix();
    mesh.setMatrixAt(i, _o.matrix);
  }

  // ---- queries ---------------------------------------------------------------------------------------------------------
  at(x, z) {
    const list = this.grid.get(`${Math.floor(x / CELL)},${Math.floor(z / CELL)}`);
    if (!list) return null;
    for (const S of list) { const b = S.b; if (x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ) return S; }
    return null;
  }

  heightAt(x, z, y = 0) {
    const S = this.at(x, z);
    if (!S) return null;
    let best = null, bd = Infinity;
    for (const f of S.flights) {
      if (x < f.minX || x > f.maxX || z < f.minZ || z > f.maxZ) continue;
      if (y <= f.from - 2.2 || y >= f.to + 1.0) continue;
      const a = f.ax === 'x' ? x : z, t = Math.min(1, Math.max(0, ((a - f.s0) * f.u) / f.len)), hy = f.from + (f.to - f.from) * t;
      const dd = Math.abs(hy - y);
      if (dd < bd) { bd = dd; best = hy; }
    }
    if (best !== null) return best;
    if (x < S.ix0 || x > S.ix1 || z < S.iz0 || z > S.iz1) return 0;
    for (let k = S.n; k >= 1; k--) {
      const hole = S.flights[k - 1];
      if (y > S.Y[k] - 2.2 && !(x >= hole.minX && x <= hole.maxX && z >= hole.minZ && z <= hole.maxZ)) return S.Y[k];
    }
    return 0;
  }

  levelOf(S, y) {
    let best = -1, bd = LEVEL.same;
    for (let k = 0; k <= S.n; k++) { const d = Math.abs(S.Y[k] - y); if (d < bd) { bd = d; best = k; } }
    return best;
  }

  // Two people share a floor: outside these buildings, always (the old flat rule: dunes, ramps and bridges unchanged).
  sameFloor(a, b) {
    if (!this.list.length) return true;
    const ay = a.gy ?? 0, by = b.gy ?? 0;
    if (Math.abs(ay - by) <= LEVEL.same) return true;
    return !(this.at(a.x, a.z) || this.at(b.x, b.z));
  }

  // The point to head for to reach (tx, tz) at height ty, when the stairs are the way: on a flight, its far end; on a
  // floor, the end of the flight that leads toward the target's floor (its near landing first, then through it).
  steer(c, tx, tz, ty = 0) {
    if (!this.list.length) return null;
    const S = this.at(c.x, c.z), cy = c.gy ?? 0;
    if (!S) return null;
    const want = this.at(tx, tz) === S ? ty : 0; // a target outside is on the street
    if (Math.abs(want - cy) < LEVEL.same) return null;
    const up = want > cy;
    for (const f of S.flights) {
      if (c.x < f.minX || c.x > f.maxX || c.z < f.minZ || c.z > f.maxZ) continue;
      if (cy < f.from - 0.3 || cy > f.to + 0.3) continue;
      return up ? f.topOut : f.bottomOut;
    }
    const k = this.levelOf(S, cy);
    if (k < 0) return null;
    const f = up ? S.flights[k] : S.flights[k - 1];
    if (!f) return null;
    const near = up ? f.bottomOut : f.topOut, far = up ? f.topOut : f.bottomOut;
    return Math.hypot(near.x - c.x, near.z - c.z) < 0.9 ? far : near;
  }

  // Inside S at height y: what is above that floor is not drawn (walls, floors, flights, furniture); leaving shows it all.
  setView(S, y) {
    const L = S ? Math.max(0, this.levelOf(S, y)) : -1;
    if (S === this.viewS && L === this.viewL) return;
    const M = this.mesh;
    if (!M) return;
    const show = (T, on) => { for (const i of T.idx) this.place(M, i, this.items[i], on(this.items[i])); };
    if (this.viewS && this.viewS !== S) show(this.viewS, () => true);
    if (S) show(S, (it) => it.lv <= L);
    this.viewS = S; this.viewL = L;
    M.instanceMatrix.needsUpdate = true;
  }

  hashAll() {
    const H = new Hasher();
    for (const S of this.list) { H.num(S.b.minX).num(S.b.minZ).int(S.n).num(S.flights[0].minX).num(S.flights[0].minZ); }
    return H.hex();
  }

  view() {
    return {
      buildings: this.list.length, boxes: this.boxes, items: this.items.length, hash: this.hash,
      list: this.list.map((S, i) => ({ i, x: +((S.b.minX + S.b.maxX) / 2).toFixed(1), z: +((S.b.minZ + S.b.maxZ) / 2).toFixed(1), district: S.b.district, shop: S.b.shopName ?? null, storeys: S.n + 1, floors: S.Y.map((y) => +y.toFixed(2)),
        flights: S.flights.map((f) => ({ from: +f.from.toFixed(2), to: +f.to.toFixed(2), len: +f.len.toFixed(2), bottom: [+f.bottomOut.x.toFixed(2), +f.bottomOut.z.toFixed(2)], top: [+f.topOut.x.toFixed(2), +f.topOut.z.toFixed(2)], axis: f.ax, u: f.u })) })),
    };
  }
}

// A building's own seed: from its position, so it never draws from the city's stream.
function seedOf(b) {
  const x = Math.round((b.minX + b.maxX) * 5), z = Math.round((b.minZ + b.maxZ) * 5);
  return (Math.imul(x, 73856093) ^ Math.imul(z, 19349663) ^ 0x5eed) >>> 0;
}
