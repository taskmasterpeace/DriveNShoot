import * as THREE from 'three';
import { makeRng } from '../engine/rng.js';
import { Hasher } from './geo.js';
import { STOREY, FLIGHT, RAIL, WINDOWS, LEVEL, RISE, UPSTAIRS, QUARTERS } from '../data/storeys.js';
import { ROOMS, SCATTER } from '../data/floorplans.js';
import { FURNITURE } from '../data/ring.js';
import { placePiece } from './furnish.js';

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
      if (!b.enterable || b.ruined || !b.roofIdx?.length || b.noRise) continue; // noRise: city.js found no room for a stair hall
      const rise = riseOf(b);
      if (!rise) continue;
      const { rng, n } = rise;
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

  // Where the staircase goes: along one inside wall, starting at a corner, clear of that wall's doors, every partition and
  // inner doorway, every piece of furniture and every bed. A building with a stair hall (city.js: the island's floor plans
  // lay one, 4.0 m wide, along the wall the flight climbs) takes its flight against that hall's outside wall only, from
  // either end. Candidates are tried in a seeded order; the first that fits wins.
  plan(b, n, rng) {
    const g = this.g, h = b.h, up = STOREY.up;
    const L0 = h / FLIGHT.pitch, Lu = up / FLIGHT.pitch, fw = FLIGHT.w, land = FLIGHT.landing;
    const depth = n > 1 ? fw * 2 : fw, need = land + L0 + land;
    const cands = [];
    for (const side of b.stair ? [b.stair.side] : ['N', 'S', 'W', 'E']) {
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
      // In a stair hall the flight stands off its wall by g (< 0.56 m: nobody fits in it) so a 1 m nav cell's centre line
      // runs up its band: the foot nav grid reaches the foot of the stairs whatever the building's alignment (flush, a
      // band 1.4 m wide between the wall and its flank holds no cell centre at all about half the time).
      const g = b.stair ? this.standOff(b, c) : 0;
      const fr = this.frame(b, c, g);
      const area = fr.rect(-land, L0 + land, 0, depth);
      if (!this.clear(b, c, area, fr.rect(-land, L0, 0, fw))) continue;
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
        if (i === 0 && b.stair) { f.bottomOut = this.footCell(fr, c, g); f.entry = fr.point(0.25, 0.7); } // the open nav cell on the landing at its foot; its first step
        f.topOut = aEnd(climbsOut ? r1 + 0.8 : r0 - 0.8);
        f.rBottom = climbsOut ? r0 : r1; f.rTop = climbsOut ? r1 : r0;
        flights.push(f);
      }
      const S = { b, n, Y, flights, frame: fr, c, depth, area, color: b.color ?? '#7c756a',
        ix0: b.minX + IN, ix1: b.maxX - IN, iz0: b.minZ + IN, iz1: b.maxZ - IN, top: Y[n] + up, idx: [] };
      S.g = g;
      if (b.stair) { S.wframe = this.frame(b, c, 0); S.quarters = this.layQuarters(S, L0); }
      return S;
    }
    return null;
  }

  // A staircase's own frame: run r along the wall from the origin in the climb direction, band q in from the wall.
  // How far a flight stands off its wall (a stair hall's): the least g >= 0 that puts a nav cell centre (whole metres +
  // 0.5) in band 0's walkable strip, [g + 0.46, g + 0.88] in from the wall (a walker's 0.45 m off the wall's face and off
  // the flank's).
  standOff(b, c) {
    const wall = c.side === 'N' ? b.minZ + IN : c.side === 'S' ? b.maxZ - IN : c.side === 'W' ? b.minX + IN : b.maxX - IN;
    const inward = c.side === 'N' || c.side === 'W' ? 1 : -1, phi = (((inward * (0.5 - wall)) % 1) + 1) % 1;
    return Math.max(0, (phi >= 0.46 ? phi : phi + 1) - 0.88);
  }
  // The foot of the street flight as a nav cell centre: on the landing (r in [-0.93, 0.6], clear of the end wall and short
  // of the flank), in band 0's walkable strip.
  footCell(fr, c, g) {
    const a = fr.along(-0.4), as = Math.round(a - 0.5) + 0.5;
    let r = (as - c.o) / c.dir;
    if (r < -0.93) r += 1; else if (r > 0.6) r -= 1;
    const wq = fr.point(0, 0.67), q0 = fr.point(0, 0), across = c.alongX ? 'z' : 'x', inward = Math.sign(wq[across] - q0[across]);
    const qc = Math.round(wq[across] - 0.5) + 0.5, q = (qc - q0[across]) * inward;
    return fr.point(r, q);
  }
  frame(b, c, g = 0) {
    const wall = (c.side === 'N' ? b.minZ + IN : c.side === 'S' ? b.maxZ - IN : c.side === 'W' ? b.minX + IN : b.maxX - IN) + (c.side === 'N' || c.side === 'W' ? g : -g);
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

  // area: the stairs and both landings; run: the street flight and the landing at its foot (where an inside doorway's
  // clearance may not reach: the landing at the top is a floor up).
  clear(b, c, area, run) {
    const g = this.g, pad = 0.3;
    const over = (r, x0, z0, x1, z1) => x1 > r.minX - pad && x0 < r.maxX + pad && z1 > r.minZ - pad && z0 < r.maxZ + pad;
    const hit = (x0, z0, x1, z1) => over(area, x0, z0, x1, z1);
    // The outside doors (and a metre either side).
    for (const d of b.doors) if (hit(d.x - 1.4, d.z - 1.4, d.x + 1.4, d.z + 1.4)) return false;
    // Every inner doorway: the floor it keeps clear each side of its wall (a planned one), or 1.6 m round it (the old shell).
    for (const d of b.innerDoors ?? []) {
      if (d.horizontal === undefined) { if (hit(d.x - 1.6, d.z - 1.6, d.x + 1.6, d.z + 1.6)) return false; continue; }
      const hw = (d.w ?? 1.9) / 2, dep = 1.25;
      if (d.horizontal ? over(run, d.x - hw, d.z - dep, d.x + hw, d.z + dep) : over(run, d.x - dep, d.z - hw, d.x + dep, d.z + hw)) return false;
    }
    // Every partition (none may cross the stairs or a landing).
    for (const P of b.plan?.inner ?? []) {
      const t = 0.25;
      if (P.horizontal ? hit(P.a0, P.fixed - t, P.a1, P.fixed + t) : hit(P.fixed - t, P.a0, P.fixed + t, P.a1)) return false;
    }
    for (const s of g.statics.boxes) {
      if (s.tag !== 'crate' && s.tag !== 'table' && s.tag !== 'shelf' && s.tag !== 'furniture' && s.tag !== 'wreck') continue;
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
      const qj = S.quarters?.junctions.filter((j) => j.horiz === sd.horiz && Math.abs(j.fixed - sd.fixed) < 0.01) ?? [];
      for (let k = centres.length - 1; k >= 0; k--) if (qj.some((j) => Math.abs(j.at - centres[k]) < WINDOWS.w / 2 + 0.6)) centres.splice(k, 1);
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
        const rr = fr.rect(ra, rb, q0 + 0.05 - (f.band === 0 ? S.g : 0), q1 - 0.05), yTop = f.from + (rise * (s + 1)) / steps; // band 0's treads run on to the wall
        const y0 = f.i === 0 ? 0 : yTop - 0.18; // the street flight is built up solid; the ones above are treads
        vis((rr.minX + rr.maxX) / 2, (y0 + yTop) / 2, (rr.minZ + rr.maxZ) / 2, rr.maxX - rr.minX, yTop - y0, rr.maxZ - rr.minZ, s % 2 ? '#5b4a3a' : '#655241', f.i);
      }
      // A flight standing off its wall (a stair hall's, S.g): the strip between is shut under it (a stringer), so nobody
      // walks along under the stairs beside the wall.
      if (f.band === 0 && S.g > 0.02) { const sg = fr.rect(f.rBottom, f.rTop, -S.g, 0); add(sg.minX, sg.minZ, sg.maxX, sg.maxZ, f.from, f.to); }
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

    // ---- upstairs, the first floor: the keeper's (or the old tenants') living quarters (world/furnish.js, data/storeys.js
    // QUARTERS): the stair hall goes on up, a partition with a doorway off the top landing, a living room with the kitchen
    // along its walls and a bedroom beyond. Containers (inventory.js placeFurniture reads 'crate'/'shelf' boxes) and beds.
    if (S.quarters) this.quarters(S, rng, add, vis);
    // ---- the floors above that: crates and shelves, a mattress.
    const area = (S.ix1 - S.ix0) * (S.iz1 - S.iz0);
    for (let k = S.quarters ? 2 : 1; k <= n; k++) {
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

  // The first floor's rooms (a building with a stair hall): the hall's partition carried up with a doorway off the top
  // landing, and the rest split across into a living room (the doorway's end) and a bedroom (the far end) when it is long
  // enough, else one room. Coordinates in the hall's frame: r along it from the flight's foot, q in from its outside wall.
  layQuarters(S, L0) {
    const b = S.b, fr = S.wframe, c = S.c, Q = QUARTERS, hw = ROOMS.stair.fix, T = WALL_T;
    const lo = (c.alongX ? b.minX : b.minZ) + IN, hi = (c.alongX ? b.maxX : b.maxZ) - IN;
    const rA = c.dir > 0 ? -(c.o - lo) : -(hi - c.o), rB = c.dir > 0 ? hi - c.o : c.o - lo; // the interior's ends in r
    const qFar = c.alongX ? b.maxZ - b.minZ - 2 * IN : b.maxX - b.minX - 2 * IN;              // the far wall's face in q
    const walls = [], rooms = [], junctions = [];
    const wall = (r0, r1, q0, q1, gapAt, gapW, gapAlongR) => walls.push({ rect: fr.rect(r0, r1, q0, q1), gapAt, gapW, gapAlongR });
    // The hall's partition: q = hw .. hw + T, the whole length, its doorway centred on the top landing.
    const rd = L0 + FLIGHT.landing / 2;
    wall(rA, rB, hw, hw + T, rd, Q.door, true);
    // The split: across the loft from the hall's partition to the far wall, its doorway by the hall.
    const rs = rd + Q.door / 2 + Q.jamb + T / 2;
    const split = rB - (rs + T / 2) >= Q.bedroom && rs - T / 2 - rA >= Q.living;
    if (split) wall(rs - T / 2, rs + T / 2, hw + T, qFar, hw + T + Q.jamb + Q.door / 2, Q.door, false);
    const room = (r0, r1, q0, q1, type, list) => { const R = fr.rect(r0, r1, q0, q1); rooms.push({ type, x0: R.minX, z0: R.minZ, x1: R.maxX, z1: R.maxZ, ui: 0, list }); };
    if (split) { room(rA, rs - T / 2, hw + T, qFar, 'qliving', Q.living_list); room(rs + T / 2, rB, hw + T, qFar, 'qbed', Q.bedroom_list); }
    else room(rA, rB, hw + T, qFar, 'qliving', [...Q.living_list, ...Q.bedroom_list]);
    // Where these partitions meet the outside walls (no window there).
    for (const wl of walls) {
      const R = wl.rect, horiz = R.maxX - R.minX > R.maxZ - R.minZ; // a wall's long axis
      if (horiz) { junctions.push({ horiz: false, fixed: b.minX, at: (R.minZ + R.maxZ) / 2 }, { horiz: false, fixed: b.maxX, at: (R.minZ + R.maxZ) / 2 }); }
      else { junctions.push({ horiz: true, fixed: b.minZ, at: (R.minX + R.maxX) / 2 }, { horiz: true, fixed: b.maxZ, at: (R.minX + R.maxX) / 2 }); }
    }
    return { walls, rooms, junctions, split };
  }

  quarters(S, rng, add, vis) {
    const b = S.b, y = S.Y[1], top = S.n > 1 ? S.Y[2] - STOREY.slab : S.top, fr = S.wframe, k = 1, Q = S.quarters;
    const shade = (col, f) => { const cc = new THREE.Color(col); return cc.setRGB(Math.min(1, cc.r * f), Math.min(1, cc.g * f), Math.min(1, cc.b * f)); };
    // The partitions, a doorway each (a gap; no leaf upstairs), and the clear zones the furniture keeps out of.
    const zones = [];
    for (const wl of Q.walls) {
      const R = wl.rect, alongX = R.maxX - R.minX > R.maxZ - R.minZ;
      const a0 = alongX ? R.minX : R.minZ, a1 = alongX ? R.maxX : R.maxZ, gc = wl.gapAlongR ? fr.along(wl.gapAt) : fr.point(0, wl.gapAt)[alongX ? 'x' : 'z'];
      for (const [s0, s1] of [[a0, gc - wl.gapW / 2], [gc + wl.gapW / 2, a1]]) {
        if (s1 - s0 < 0.1) continue;
        const r = alongX ? { minX: s0, maxX: s1, minZ: R.minZ, maxZ: R.maxZ } : { minX: R.minX, maxX: R.maxX, minZ: s0, maxZ: s1 };
        add(r.minX, r.minZ, r.maxX, r.maxZ, y, top, 'storey-wall');
        vis((r.minX + r.maxX) / 2, (y + top) / 2, (r.minZ + r.maxZ) / 2, r.maxX - r.minX, top - y, r.maxZ - r.minZ, shade(S.color, 0.94), k);
      }
      const hwz = wl.gapW / 2 + 0.15, dep = WALL_T / 2 + 1.0, cx = alongX ? gc : (R.minX + R.maxX) / 2, cz = alongX ? (R.minZ + R.maxZ) / 2 : gc;
      zones.push(alongX ? { x0: cx - hwz, x1: cx + hwz, z0: cz - dep, z1: cz + dep } : { x0: cx - dep, x1: cx + dep, z0: cz - hwz, z1: cz + hwz });
      (S.doorways ??= []).push({ x: cx, z: cz, alongX, w: wl.gapW });
    }
    // Floor finishes and the furniture, through the ring's placement rules (no probe: there is no nav grid upstairs; the
    // middle of every room stays open and the doorways clear).
    const g = { props: [], boxes: [], beds: [], boxesIn: [] }, ctx = { zones, zr: new Map(), placed: [], spots: [], on: false };
    for (const r of Q.rooms) {
      const f = ROOMS[r.type]?.floor; if (f) vis((r.x0 + r.x1) / 2, y + 0.006, (r.z0 + r.z1) / 2, r.x1 - r.x0, 0.012, r.z1 - r.z0, f, k);
      for (const t of r.list) placePiece(t, r, g, { label: null, loot: 'bedroom' }, { loot: [['bedroom', 1]] }, rng, ctx);
      const sc = SCATTER[r.type]; // a table in the middle of a big living room, as downstairs (data/floorplans.js SCATTER)
      if (sc) {
        const [t, every, inset, max] = sc, [fw, fd] = FURNITURE[t].size;
        let n = 0;
        for (let x = r.x0 + inset + fw / 2; x <= r.x1 - inset - fw / 2 && n < max; x += every) for (let z = r.z0 + inset + fd / 2; z <= r.z1 - inset - fd / 2 && n < max; z += every)
          if (placePiece(t, r, g, { label: null, loot: 'kitchen' }, { loot: [['kitchen', 1]] }, rng, ctx, { cands: [{ r: { x0: x - fw / 2, z0: z - fd / 2, x1: x + fw / 2, z1: z + fd / 2 } }], gap: 0.9 })) n++;
      }
    }
    // A part drawn to lie on the street floor's slab (its top is 0.12: a rug, a floor finish) comes down onto this floor.
    for (const p of g.props) vis(p[0], y + p[1] - (p[1] - p[4] / 2 > 0.11 && p[1] < 0.2 ? 0.12 : 0), p[2], p[3], p[4], p[5], shade(p[6], p[8] ?? 1), k);
    for (const q of g.boxes) {
      const x = (q.x0 + q.x1) / 2, z = (q.z0 + q.z1) / 2, box = add(q.x0, q.z0, q.x1, q.z1, y, y + q.h, q.tag);
      box.storeyLv = k;
      const ci = g.boxesIn.find((cc) => Math.abs(cc.x - x) < 0.01 && Math.abs(cc.z - z) < 0.01);
      if (ci) { box.loot = ci.table; box.label = ci.label; }
    }
    for (const q of g.beds) this.g.world.spawns.beds.push({ x: q.x, z: q.z, face: q.face, bedY: y + q.bedY, y, upstairs: true }); // somewhere to sleep (survival.js); not a townsfolk's bed (ai.js)
    S.upstairs = { rooms: Q.rooms.map((r) => ({ type: r.type, x0: r.x0, z0: r.z0, x1: r.x1, z1: r.z1 })), pieces: g.boxes.length, beds: g.beds.length };
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
    if (Math.hypot(near.x - c.x, near.z - c.z) < 0.9) return up && f.entry ? f.entry : far; // a stair hall's foot: onto the first step square, then up
    // On the street floor of a planned building the stairs are in their own hall, rooms and doorways away: the way to
    // their foot is a route on the foot nav grid (kept a second, then asked again), not a straight line through the walls.
    if (k === 0 && S.b.stair) return this.route(c, near) ?? near;
    return near;
  }
  route(c, to) {
    const t = this.g.time ?? 0, R = c.stairWay;
    if (!R || R.to !== to || t - R.t > 1 || !R.path?.length) c.stairWay = { to, t, path: this.g.nav?.foot?.find(c.x, c.z, to.x, to.z) ?? null };
    const P = c.stairWay.path;
    if (!P) return null;
    while (P.length > 1 && Math.hypot(P[0].x - c.x, P[0].z - c.z) < 0.7) P.shift();
    return P[0];
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

// The rise roll (city.js asks it before it lays a building's plan, so a building that will rise gets a stair hall): null,
// or { rng, n } - n floors above the street, rng the building's own stream, read on by plan() and raise().
export function riseOf(b) {
  const R = RISE[b.district];
  if (!R || (b.maxX - b.minX) * (b.maxZ - b.minZ) < R.minArea) return null;
  const rng = makeRng(seedOf(b));
  if (rng() >= R.share) return null;
  return { rng, n: rng.int(R.storeys[0], R.storeys[1]) };
}

// A building's own seed: from its position, so it never draws from the city's stream.
function seedOf(b) {
  const x = Math.round((b.minX + b.maxX) * 5), z = Math.round((b.minZ + b.maxZ) * 5);
  return (Math.imul(x, 73856093) ^ Math.imul(z, 19349663) ^ 0x5eed) >>> 0;
}
