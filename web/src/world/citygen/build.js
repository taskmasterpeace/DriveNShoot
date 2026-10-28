// A TOWN PLAN MADE SOLID (docs/design/WEB_CITYGEN.md §3.3): world/citygen/layout.js's records -> colliders, floors, stairs,
// visuals, loot and cover. Pure (no three.js, no game): systems/citygen.js registers what this returns, the audit
// (world/citygen/audit.js) walks it headless.
//
// The vertical law is the storeys law (docs/design/WEB_STOREYS.md, world/storeys.js): a floor is a DECK that counts only
// for someone already up near it, walls are boxes with a base and a height (one box per wall segment per storey band, so a
// person upstairs meets only their own floor's walls), a flight of stairs is a slope between two decks entered at its two
// ends (flanks, rails, a top-end block). Each storeyed building is a record shaped like world/storeys.js's (b, n, Y,
// flights, ix0..iz1, top) so Storeys.at/heightAt/levelOf/sameFloor/steer/setView take it as their own: people climb
// generated stairs, zombies find them, the cutaway hides the floors above you, a bullet stays on its floor.
//   walls     per storey band, door gaps on the street storey (a front door, roll-up BAYS a car drives through), window
//             holes every few metres (bullets and sight pass, people do not), escape doors upstairs; a ruin's top band is
//             jagged half-walls open to the sky
//   stairs    a switchback core against a side wall, on up to the ROOF (a bulkhead) where the kind has roof access
//   roof      a deck with a PARAPET round it (cover: a man kneeling behind it is hidden; standing, he shoots over it)
//   escape    a fire escape: the same switchback core OUTSIDE a side wall, a door into every floor, railed landings
//   bridges   planks between two roofs (a flight, level or sloped), railed, through gaps in both parapets
//   loot      per-floor containers (richer upstairs), a crate on the roof; cover: points with their facing and height
const WALL = 0.4, IN = WALL / 2, FW = 1.4, LAND = 1.4, PITCH = 3.2 / 4.4, LADDER = 1.73, RAIL_H = 1.0, RAIL_T = 0.12, BLOCK = 2.0, LINTEL = 2.6;
import { VERT, LOOT_BY_KIND, FLOOR_LOOT, ROADS, BIOMES } from '../../data/citygen.js';
import { makeRng } from '../../engine/rng.js';
import { buildBacklots } from './backlots-build.js';
import { wreckOf } from '../../data/wrecks.js';
const fnv = (x, z, k) => { let v = 2166136261 ^ k; for (const n of [Math.round(x * 10), Math.round(z * 10)]) { v ^= n; v = Math.imul(v, 16777619); } return v >>> 0; };

// the one box shape (engine/collision.js StaticWorld.box): monomorphic for the hot loops
const box = (minX, minZ, maxX, maxZ, tag, height, base = 0) => ({ minX, minZ, maxX, maxZ, tag, height, mark: 0, op: null, holes: null, holeX: false, sill: 0, base, owner: null });
const shade = (hex, k) => { const n = parseInt(hex.slice(1), 16); const c = (v) => Math.max(0, Math.min(255, Math.round(v * k))); return `#${((c(n >> 16) << 16) | (c((n >> 8) & 255) << 8) | c(n & 255)).toString(16).padStart(6, '0')}`; };

// ---- heights: the storeys law for one record (world/storeys.js heightAt, line for line) --------------------------------
export function recHeight(S, x, z, y = 0) {
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

// ---- a switchback stair core (world/storeys.js plan(): flight 0 the long one in band 0, the ones above back and forth) --
// c: { alongX, wall (the face it stands against), inward (+1/-1), o (where r = 0 along the wall), dir (+1/-1) }
// Y: deck heights [y0, y1, ...]; pitches: per flight (a ladder is steep). Returns { flights, area, frame }.
function frameOf(c) {
  const along = (r) => c.o + c.dir * r, across = (q) => c.wall + c.inward * q;
  return {
    along,
    point: (r, q) => (c.alongX ? { x: along(r), z: across(q) } : { x: across(q), z: along(r) }),
    rect(r0, r1, q0, q1) {
      const a0 = Math.min(along(r0), along(r1)), a1 = Math.max(along(r0), along(r1)), b0 = Math.min(across(q0), across(q1)), b1 = Math.max(across(q0), across(q1));
      return c.alongX ? { minX: a0, maxX: a1, minZ: b0, maxZ: b1 } : { minX: b0, maxX: b1, minZ: a0, maxZ: a1 };
    },
  };
}
export function coreLength(Y, pitches) { return (Y[1] - Y[0]) / pitches[0]; }
function stairCore(c, Y, pitches) {
  const fr = frameOf(c), m = Y.length - 1, L0 = (Y[1] - Y[0]) / pitches[0];
  const flights = [];
  for (let i = 0; i < m; i++) {
    const Li = i === 0 ? L0 : Math.min(L0, (Y[i + 1] - Y[i]) / pitches[i]);
    const band = i % 2, r0 = i === 0 ? 0 : L0 - Li, r1 = L0, climbsOut = i === 0 || band === 0;
    const f = { i, from: Y[i], to: Y[i + 1], len: r1 - r0, band, ...fr.rect(r0, r1, band * FW, band * FW + FW) };
    f.ax = c.alongX ? 'x' : 'z';
    f.u = climbsOut ? c.dir : -c.dir;
    f.s0 = fr.along(climbsOut ? r0 : r1);
    const aEnd = (s) => fr.point(s, (band + 0.5) * FW);
    f.bottomOut = aEnd(climbsOut ? r0 - 0.8 : r1 + 0.8);
    f.topOut = aEnd(climbsOut ? r1 + 0.8 : r0 - 0.8);
    f.rBottom = climbsOut ? r0 : r1; f.rTop = climbsOut ? r1 : r0;
    f.pitch = pitches[i];
    flights.push(f);
  }
  const depth = m > 1 ? FW * 2 : FW;
  // The way onto each flight from the room (world/storeys.js steer, for generated records): a point in the room beside
  // its foot landing, and the landing's column (from there the foot is a straight walk across the landing).
  for (const f of flights) {
    const rf = f.rBottom === 0 && f.i === 0 ? -LAND / 2 : f.rBottom + Math.sign(f.rBottom - f.rTop) * (LAND / 2);
    if (c.outside && f.i > 0) continue; // a fire escape's upper landings: the room side is thin air
    f.approach = fr.point(rf, depth + 0.9);
    f.footBox = fr.rect(rf - LAND / 2 - 0.1, rf + LAND / 2 + 0.1, -0.2, depth + 1.4);
  }
  return { flights, frame: fr, L0, depth, area: fr.rect(-LAND, L0 + LAND, 0, depth) };
}
// the colliders and visuals of a core's flights (world/storeys.js raise(), the flights part). outerOpen: the core stands
// outside (a fire escape): band 1's far side and the band-0 flank are open air, so both get flanks and rails.
function coreSolids(core, add, vis, lvBase, outerOpen) {
  const fr = core.frame;
  // Under the street flight's top landing, band 0 is a cupboard (solid to just under the floor above): nobody walks into
  // the dead-end pocket behind the flight's top end on the street floor.
  const f0 = core.flights[0];
  if (f0 && !outerOpen) { const cb = fr.rect(core.L0 + RAIL_T / 2, core.L0 + LAND, 0, FW); add(cb.minX, cb.minZ, cb.maxX, cb.maxZ, 'cg-flank', f0.to - 0.3, 0); vis((cb.minX + cb.maxX) / 2, (f0.to - 0.3) / 2, (cb.minZ + cb.maxZ) / 2, cb.maxX - cb.minX, f0.to - 0.3, cb.maxZ - cb.minZ, '#4a4038', lvBase); }
  for (const f of core.flights) {
    const steps = Math.max(6, Math.round(f.len / 0.3)), rise = f.to - f.from, q0 = f.band * FW, q1 = q0 + FW;
    const ladder = f.pitch > 1.2;
    for (let s = 0; s < steps; s++) {
      const ra = f.rBottom + ((f.rTop - f.rBottom) * s) / steps, rb = f.rBottom + ((f.rTop - f.rBottom) * (s + 1)) / steps;
      const rr = fr.rect(ra, rb, q0 + 0.05, q1 - 0.05), yTop = f.from + (rise * (s + 1)) / steps;
      const y0 = f.i === 0 && !outerOpen ? f.from : yTop - (ladder ? 0.06 : 0.18);
      vis((rr.minX + rr.maxX) / 2, (y0 + yTop) / 2, (rr.minZ + rr.maxZ) / 2, rr.maxX - rr.minX, Math.max(0.05, yTop - y0), rr.maxZ - rr.minZ, outerOpen ? (s % 2 ? '#4a4440' : '#55504a') : (s % 2 ? '#5b4a3a' : '#655241'), lvBase + f.i);
    }
    const dirR = Math.sign(f.rTop - f.rBottom), OPEN = 0.7;
    const flankQs = f.band === 0 && !outerOpen ? [q1] : f.band === 0 ? [q1] : [q0, q1];
    for (const q of flankQs) {
      const fl = fr.rect(f.rBottom + dirR * OPEN, f.rTop, q - RAIL_T / 2, q + RAIL_T / 2), r = fr.rect(f.rBottom, f.rTop, q - RAIL_T / 2, q + RAIL_T / 2);
      add(fl.minX, fl.minZ, fl.maxX, fl.maxZ, 'cg-flank', f.to + 0.1, f.from);
      vis((fl.minX + fl.maxX) / 2, (f.from + f.to) / 2, (fl.minZ + fl.maxZ) / 2, fl.maxX - fl.minX, f.to - f.from, fl.maxZ - fl.minZ, '#4a4038', lvBase + f.i);
      add(r.minX, r.minZ, r.maxX, r.maxZ, 'cg-rail', f.to + RAIL_H, f.to);
      vis((r.minX + r.maxX) / 2, f.to + RAIL_H / 2, (r.minZ + r.maxZ) / 2, r.maxX - r.minX, RAIL_H, r.maxZ - r.minZ, '#3a3430', lvBase + f.i + 1);
    }
    const te = fr.rect(f.rTop - (RAIL_T / 2) * dirR, f.rTop + (RAIL_T / 2) * dirR, q0, q1);
    add(te.minX, te.minZ, te.maxX, te.maxZ, 'cg-flank', f.from + BLOCK, f.from);
    vis((te.minX + te.maxX) / 2, f.from + BLOCK / 2, (te.minZ + te.maxZ) / 2, te.maxX - te.minX, BLOCK, te.maxZ - te.minZ, '#4a4038', lvBase + f.i);
    const be = fr.rect(f.rBottom - (RAIL_T / 2) * dirR, f.rBottom + (RAIL_T / 2) * dirR, q0, q1);
    add(be.minX, be.minZ, be.maxX, be.maxZ, 'cg-rail', f.to + RAIL_H, f.to);
    vis((be.minX + be.maxX) / 2, f.to + RAIL_H / 2, (be.minZ + be.maxZ) / 2, be.maxX - be.minX, RAIL_H, be.maxZ - be.minZ, '#3a3430', lvBase + f.i + 1);
  }
}

// ---- one building ------------------------------------------------------------------------------------------------------
// out: { boxes, items, recs, loot, cover, doors }. Returns the building's runtime record { B, S, E (escape), i0, i1 }.
export function buildBuilding(B, out, T, rng) {
  const items0 = out.items.length;
  const n = B.n, Y = B.Y, top = B.top;
  // outer faces: the plan's footprint is wall centre lines
  const ox0 = B.x0 - IN, ox1 = B.x1 + IN, oz0 = B.z0 - IN, oz1 = B.z1 + IN;
  const ix0 = B.x0 + IN, ix1 = B.x1 - IN, iz0 = B.z0 + IN, iz1 = B.z1 - IN;
  const R = { B, S: null, E: null, i0: items0, i1: items0, minX: ox0, maxX: ox1, minZ: oz0, maxZ: oz1, enterable: true, roofIdx: [], label: B.name.toUpperCase(), district: B.zone, town: T.id, bridgeGaps: B._gaps ?? [] };
  const add = (minX, minZ, maxX, maxZ, tag, height, base = 0) => { const b = box(minX, minZ, maxX, maxZ, tag, height, base); out.boxes.push(b); return b; };
  const vis = (cx, cy, cz, sx, sy, sz, col, lv) => { out.items.push({ cx, cy, cz, sx, sy, sz, col, lv, R }); };
  const coverPt = (x, z, y, nx, nz, h, kind) => out.cover.push(x, z, y, nx, nz, h === 'full' ? 1 : 0.5, kind);

  // ---- the stairs: levels (decks above the street) and the core's wall --------------------------------------------
  let m = B.ruined ? n - 1 : B.roofAccess ? n : n - 1;
  let core = null, coreSide = null;
  const frontI = 'NESW'.indexOf(B.front), back = 'NESW'[(frontI + 2) % 4];
  const avoid = new Set([B.front]);
  if (B.doors.some((d) => d.side === back && d.kind === 'bay')) avoid.add(back);
  if (B.escape) avoid.add(B.escape.side);
  while (m >= 1 && !core) {
    const Yd = Y.slice(0, m + 1);
    const pitches = Yd.slice(1).map((_, i) => (i === m - 1 && B.roof === 'ladder' && !B.ruined && m === n ? LADDER : PITCH));
    const L0 = (Yd[1] - Yd[0]) / pitches[0], need = LAND + L0 + LAND, depth = m > 1 ? FW * 2 : FW;
    const cands = [];
    for (const side of ['N', 'E', 'S', 'W']) {
      if (avoid.has(side)) continue;
      const alongX = side === 'N' || side === 'S';
      const lo = (alongX ? ix0 : iz0), hi = (alongX ? ix1 : iz1), across = alongX ? iz1 - iz0 : ix1 - ix0;
      if (hi - lo < need + 0.2 || across < depth + 2.2) continue;
      const wall = side === 'N' ? iz0 : side === 'S' ? iz1 : side === 'W' ? ix0 : ix1, inward = side === 'N' || side === 'W' ? 1 : -1;
      cands.push({ side, alongX, wall, inward, o: lo + LAND, dir: 1 }, { side, alongX, wall, inward, o: hi - LAND, dir: -1 });
    }
    for (let i = cands.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [cands[i], cands[j]] = [cands[j], cands[i]]; }
    for (const c of cands) {
      const k = stairCore(c, Yd, pitches);
      // clear of every door's swing on any wall and of the drive lane between bays
      const A = k.area, pad = 0.4;
      const hitDoor = B.doors.some((d) => { const [dx, dz] = doorXZ(B, d), r = d.kind === 'bay' ? d.w / 2 + 1.6 : 1.6; return dx + r > A.minX - pad && dx - r < A.maxX + pad && dz + r > A.minZ - pad && dz - r < A.maxZ + pad; });
      const lane = B.drive && B.doors.filter((d) => d.kind === 'bay').some((d) => { const ax = d.side === 'N' || d.side === 'S'; return ax ? A.maxX > d.at - d.w / 2 - 1.4 && A.minX < d.at + d.w / 2 + 1.4 : A.maxZ > d.at - d.w / 2 - 1.4 && A.minZ < d.at + d.w / 2 + 1.4; });
      if (hitDoor || lane) continue;
      core = k; coreSide = c.side; break;
    }
    if (!core) m--;
  }
  if (!core && !B.ruined) { B.roofAccess = false; }
  B.levels = m = core ? m : 0;

  // ---- the escape: the same core outside a side wall ------------------------------------------------------------
  let esc = null;
  if (B.escape && n >= 3) {
    const side = B.escape.side, alongX = side === 'N' || side === 'S';
    const topL = core && m === n ? n : n - 1;
    const Ye = Y.slice(0, topL + 1);
    const pit = Ye.slice(1).map(() => PITCH), L0 = (Ye[1] - Ye[0]) / PITCH, need = LAND + L0 + LAND;
    const lo = alongX ? ox0 : oz0, hi = alongX ? ox1 : oz1;
    if (hi - lo >= need + 1) {
      const wall = side === 'N' ? oz0 : side === 'S' ? oz1 : side === 'W' ? ox0 : ox1, inward = side === 'N' || side === 'W' ? -1 : 1; // outward
      const c = { side, alongX, wall, inward, o: lo + 0.5 + LAND, dir: 1, outside: true };
      const k = stairCore(c, Ye, pit);
      const fp = k.frame.rect(-LAND, k.L0 + LAND, 0, FW * 2);
      // keep it off the other buildings, the town wall and the streets (the plan leaves side yards; a tight row may not)
      const hit = T.buildings.some((o) => o !== B && fp.maxX + 0.6 > o.x0 - IN && fp.minX - 0.6 < o.x1 + IN && fp.maxZ + 0.6 > o.z0 - IN && fp.minZ - 0.6 < o.z1 + IN)
        || T.roads.some((r) => fp.maxX > r.x0 && fp.minX < r.x1 && fp.maxZ > r.z0 && fp.minZ < r.z1);
      if (!hit) esc = { core: k, side, rect: fp, topL, Ye }; else B.escape = null;
    } else B.escape = null;
  }

  // ---- walls: per storey band, gaps for doors (street), escape doors (upstairs), window holes ---------------------
  const sides = [
    { s: 'N', horiz: true, fixed: B.z0, a0: ox0, a1: ox1, nx: 0, nz: -1 }, { s: 'S', horiz: true, fixed: B.z1, a0: ox0, a1: ox1, nx: 0, nz: 1 },
    { s: 'W', horiz: false, fixed: B.x0, a0: oz0 + WALL, a1: oz1 - WALL, nx: -1, nz: 0 }, { s: 'E', horiz: false, fixed: B.x1, a0: oz0 + WALL, a1: oz1 - WALL, nx: 1, nz: 0 },
  ];
  const escDoorAt = esc ? esc.core.frame.along(esc.core.L0 + LAND * 0.5) : null;
  const topBand = n - 1;
  for (const sd of sides) {
    for (let k = 0; k < n; k++) {
      const y0 = Y[k], y1 = k + 1 <= n ? (k + 1 === n ? top : Y[k + 1]) : top;
      let yTop = y1;
      const gaps = [];
      if (k === 0) for (const d of B.doors) if (d.side === sd.s) gaps.push({ a: d.at - d.w / 2, b: d.at + d.w / 2, h: d.h });
      if (k > 0 && esc && esc.side === sd.s && k <= esc.topL && k < n) gaps.push({ a: escDoorAt - VERT.escape.door / 2, b: escDoorAt + VERT.escape.door / 2, h: LINTEL });
      gaps.sort((p, q) => p.a - q.a);
      // window centres between the gaps (every VERT.window.every m), none in a gap or a metre from a corner
      const wins = [];
      const L = sd.a1 - sd.a0, nw = Math.max(0, Math.floor((L - 2) / VERT.window.every));
      for (let i = 0; i < nw; i++) {
        const c = sd.a0 + 1 + (i + 0.5) * ((L - 2) / nw);
        if (gaps.some((g) => c + VERT.window.w / 2 + 0.3 > g.a && c - VERT.window.w / 2 - 0.3 < g.b)) continue;
        if (B.open && k > 0) continue; // a parking deck is open sided (its rails are the half wall)
        wins.push(c);
      }
      const ruinTop = B.ruined && k === topBand;
      let cur = sd.a0;
      const segs = [];
      for (const g of gaps) { if (g.a > cur + 0.05) segs.push([cur, g.a]); cur = Math.max(cur, g.b); }
      if (sd.a1 > cur + 0.05) segs.push([cur, sd.a1]);
      const col = B.color;
      for (const [a, b2] of segs) {
        let hgt = yTop;
        if (ruinTop) hgt = y0 + rng.range(0.9, Math.max(1.0, (y1 - y0) * 0.8)); // jagged: half walls to fight behind
        if (B.open && k > 0) hgt = y0 + 1.1; // a parking deck: a waist-high wall
        const bx = sd.horiz ? add(a, sd.fixed - IN, b2, sd.fixed + IN, ruinTop ? 'cg-half' : 'cg-wall', hgt, y0) : add(sd.fixed - IN, a, sd.fixed + IN, b2, ruinTop ? 'cg-half' : 'cg-wall', hgt, y0);
        const holes = [];
        for (const c of wins) if (c - VERT.window.w / 2 > a && c + VERT.window.w / 2 < b2) holes.push(c - VERT.window.w / 2, c + VERT.window.w / 2);
        if (holes.length && !ruinTop && !(B.open && k > 0)) { bx.holes = holes; bx.holeX = sd.horiz; bx.sill = y0 + VERT.window.sill; }
        // visuals: solid between windows, sill and lintel in each opening
        const piece = (p0, p1, q0, q1, c2) => { if (p1 - p0 < 0.05 || q1 - q0 < 0.02) return; const mid = (p0 + p1) / 2; if (sd.horiz) vis(mid, (q0 + q1) / 2, sd.fixed, p1 - p0, q1 - q0, WALL, c2, k); else vis(sd.fixed, (q0 + q1) / 2, mid, WALL, q1 - q0, p1 - p0, c2, k); };
        let pc = a;
        if (holes.length && !ruinTop) {
          for (let i = 0; i < holes.length; i += 2) {
            piece(pc, holes[i], y0, hgt, col);
            piece(holes[i], holes[i + 1], y0, y0 + VERT.window.sill, shade(col, 1.12));
            piece(holes[i], holes[i + 1], y0 + VERT.window.sill + VERT.window.h, hgt, col);
            pc = holes[i + 1];
          }
        }
        piece(pc, b2, y0, hgt, ruinTop ? shade(col, 0.9) : col);
        // cover: along the outside face at the street storey (a wall to put your back to), the half walls of a ruin
        if (k === 0 || ruinTop) for (let p = a + 1; p < b2 - 0.5; p += 2.5) { const x = sd.horiz ? p : sd.fixed + sd.nx * (IN + 0.5), z = sd.horiz ? sd.fixed + sd.nz * (IN + 0.5) : p; coverPt(x, z, y0, sd.nx, sd.nz, ruinTop ? 'half' : 'full', ruinTop ? 2 : 1); }
        for (let i = 0; i < holes.length; i += 2) { const c = (holes[i] + holes[i + 1]) / 2, x = sd.horiz ? c : sd.fixed - sd.nx * (IN + 0.5), z = sd.horiz ? sd.fixed - sd.nz * (IN + 0.5) : c; coverPt(x, z, y0, -sd.nx, -sd.nz, 'full', 3); }
        // the street storey's windows are real (systems/interiors.js: glass, smash, climb through, board up), attached near you
        if (k === 0 && !ruinTop) for (let i = 0; i < holes.length; i += 2) { const c = (holes[i] + holes[i + 1]) / 2; out.windows.push({ b: B.id, x: sd.horiz ? c : sd.fixed, z: sd.horiz ? sd.fixed : c, axis: sd.horiz ? 'x' : 'z', width: holes[i + 1] - holes[i], nx: sd.nx, nz: sd.nz }); }
      }
      // lintels over the gaps (a door: people pass under; a bay: a car does)
      for (const g of gaps) {
        if (g.h >= yTop - y0 - 0.05) continue;
        const lb = y0 + g.h;
        if (sd.horiz) add(g.a, sd.fixed - IN, g.b, sd.fixed + IN, 'cg-wall', yTop, lb); else add(sd.fixed - IN, g.a, sd.fixed + IN, g.b, 'cg-wall', yTop, lb);
        const mid = (g.a + g.b) / 2;
        if (!ruinTop) { if (sd.horiz) vis(mid, (lb + yTop) / 2, sd.fixed, g.b - g.a, yTop - lb, WALL, shade(col, 0.92), k); else vis(sd.fixed, (lb + yTop) / 2, mid, WALL, yTop - lb, g.b - g.a, shade(col, 0.92), k); }
        if (k === 0 && g.h > 3) { // a roll-up door: rolled up (a dark band at its top) or down (a panel and a collider)
          if (sd.horiz) vis(mid, lb - 0.3, sd.fixed, g.b - g.a, 0.6, WALL * 0.6, '#3e3a34', k); else vis(sd.fixed, lb - 0.3, mid, WALL * 0.6, 0.6, g.b - g.a, '#3e3a34', k);
          const bx = sd.horiz ? add(g.a, sd.fixed - 0.12, g.b, sd.fixed + 0.12, 'cg-rollup', y0 + g.h, 99) : add(sd.fixed - 0.12, g.a, sd.fixed + 0.12, g.b, 'cg-rollup', y0 + g.h, 99);
          const panel = out.items.length;
          if (sd.horiz) vis(mid, g.h / 2, sd.fixed, g.b - g.a, g.h, 0.16, '#6a6458', 0); else vis(sd.fixed, g.h / 2, mid, 0.16, g.h, g.b - g.a, '#6a6458', 0);
          out.items[panel].rollup = true;
          out.bays.push({ id: `${B.id}:bay:${sd.s}:${mid.toFixed(1)}`, b: B.id, side: sd.s, at: mid, x: sd.horiz ? mid : sd.fixed, z: sd.horiz ? sd.fixed : mid, w: g.b - g.a, h: g.h, nx: sd.nx, nz: sd.nz, box: bx, panel, open: true, locked: false });
        }
      }
    }
  }

  // ---- floors: a slab per level with its stairwell hole; the roof (a deck when you can get up there) ----------------
  const slabCol = B.zone === 'industrial' || B.zone === 'military' || B.open ? '#5a5650' : '#6b5543';
  const holeRect = (k) => (core && k >= 1 && k <= m ? core.flights[k - 1] : null);
  const slab = (k, y, col, lv) => {
    const h = holeRect(k);
    const rect = (a, b2, c, d) => { if (b2 - a > 0.05 && d - c > 0.05) vis((a + b2) / 2, y, (c + d) / 2, b2 - a, VERT.slab, d - c, col, lv); };
    if (!h) { rect(ix0, ix1, iz0, iz1); return; }
    rect(ix0, ix1, iz0, h.minZ); rect(ix0, ix1, h.maxZ, iz1); rect(ix0, h.minX, h.minZ, h.maxZ); rect(h.maxX, ix1, h.minZ, h.maxZ);
  };
  for (let k = 1; k < n; k++) slab(k, Y[k] - VERT.slab / 2, slabCol, k);
  if (!B.ruined) {
    // the roof: over the whole footprint (wall tops included) unless you can walk it (then the stairwell's bulkhead opening)
    const rc = B.roofColor;
    if (core && m === n) slab(n, top - VERT.slab / 2, rc, n); else vis((ox0 + ox1) / 2, top + 0.15, (oz0 + oz1) / 2, ox1 - ox0 + 0.3, 0.3, oz1 - oz0 + 0.3, rc, n);
    R.roofLv = n;
  }
  if (B.fortified) { // a blast wall along the front, 3 m out, its one gate at the lobby door (side yards stay open: neighbours)
    const g = 3, t = 0.6, h = 2.2, fd = B.doors.find((d) => d.kind === 'door' && d.side === B.front);
    const ring = [['N', ox0 - g, oz0 - g - t, ox1 + g, oz0 - g], ['S', ox0 - g, oz1 + g, ox1 + g, oz1 + g + t], ['W', ox0 - g - t, oz0 - g, ox0 - g, oz1 + g], ['E', ox1 + g, oz0 - g, ox1 + g + t, oz1 + g]];
    for (const [sd, a0, b0, a1, b1] of ring) {
      if (sd !== B.front) continue;
      const horiz = sd === 'N' || sd === 'S', gap = fd && fd.side === sd ? [fd.at - 2.5, fd.at + 2.5] : null;
      const segs = !gap ? [[horiz ? a0 : b0, horiz ? a1 : b1]] : [[horiz ? a0 : b0, gap[0]], [gap[1], horiz ? a1 : b1]];
      for (const [p0, p1] of segs) {
        const bx = horiz ? add(p0, b0, p1, b1, 'cg-townwall', h) : add(a0, p0, a1, p1, 'cg-townwall', h);
        vis((bx.minX + bx.maxX) / 2, h / 2, (bx.minZ + bx.maxZ) / 2, bx.maxX - bx.minX, h, bx.maxZ - bx.minZ, '#6a6a5e', 0);
      }
    }
    R.lobby = fd ? doorXZ(B, fd) : null;
  }
  if (B.steeple) vis((ix0 + ix1) / 2, top + 5, iz0 + 2.5, 3, 10, 3, shade(B.color, 0.9), n);
  if (B.canopy) { // a gas station's canopy over the pumps, in front: four posts and a lid
    const d = B.front, cx = (ox0 + ox1) / 2, cz = d === 'N' ? oz0 - 11 : d === 'S' ? oz1 + 11 : (oz0 + oz1) / 2, cxx = d === 'W' ? ox0 - 11 : d === 'E' ? ox1 + 11 : cx;
    const ewc = d === 'E' || d === 'W', hx = (ewc ? 9 : 15) / 2 + 1, hz = (ewc ? 15 : 9) / 2 + 1;
    const clash = T.buildings.some((o) => o !== B && cxx + hx > o.x0 - IN && cxx - hx < o.x1 + IN && cz + hz > o.z0 - IN && cz - hz < o.z1 + IN) || (T.wall && (cxx - hx < T.wall.x0 + 2 || cxx + hx > T.wall.x1 - 2 || cz - hz < T.wall.z0 + 2 || cz + hz > T.wall.z1 - 2));
    if (!clash) {
    vis(cxx, 4.6, cz, ewc ? 9 : 15, 0.5, ewc ? 15 : 9, '#c8c0aa', 0);
    const ew = d === 'E' || d === 'W';
    for (const [pa, pb] of [[-7, -3.5], [7, -3.5], [-7, 3.5], [7, 3.5]]) { const px = ew ? pb : pa, pz = ew ? pa : pb; add(cxx + px - 0.2, cz + pz - 0.2, cxx + px + 0.2, cz + pz + 0.2, 'cg-post', 4.6); vis(cxx + px, 2.3, cz + pz, 0.4, 4.6, 0.4, '#8a8478', 0); }
    for (const px of [0]) { add(cxx + px - 0.5, cz - 0.35, cxx + px + 0.5, cz + 0.35, 'cg-pump', 1.6); vis(cxx + px, 0.8, cz, 1, 1.6, 0.7, '#a8402e', 0); coverPt(cxx + px, cz + 1, 0, 0, 1, 'half', 4); }
    }
  }

  // ---- the parapet round a roof you can stand on (gaps where a bridge or the escape lands) ------------------------
  if (core && m === n && B.parapet > 0) {
    const ph = B.parapet;
    for (const sd of sides) {
      const gaps = [];
      for (const g of R.bridgeGaps) if (g.side === sd.s) gaps.push(g);
      if (esc && esc.side === sd.s && esc.topL === n) gaps.push({ a: escDoorAt - 0.7, b: escDoorAt + 0.7 });
      gaps.sort((p, q) => p.a - q.a);
      let cur = sd.a0;
      const segs = [];
      for (const g of gaps) { if (g.a > cur + 0.05) segs.push([cur, g.a]); cur = Math.max(cur, g.b); }
      if (sd.a1 > cur + 0.05) segs.push([cur, sd.a1]);
      for (const [a, b2] of segs) {
        if (sd.horiz) add(a, sd.fixed - IN, b2, sd.fixed + IN, 'cg-parapet', top + ph, top); else add(sd.fixed - IN, a, sd.fixed + IN, b2, 'cg-parapet', top + ph, top);
        if (sd.horiz) vis((a + b2) / 2, top + ph / 2, sd.fixed, b2 - a, ph, WALL, shade(B.color, 0.86), n); else vis(sd.fixed, top + ph / 2, (a + b2) / 2, WALL, ph, b2 - a, shade(B.color, 0.86), n);
        for (let p = a + 1; p < b2 - 0.5; p += 2.5) { const x = sd.horiz ? p : sd.fixed - sd.nx * (IN + 0.5), z = sd.horiz ? sd.fixed - sd.nz * (IN + 0.5) : p; coverPt(x, z, top, -sd.nx, -sd.nz, 'half', 5); }
      }
    }
  }

  // ---- the stairs themselves; the record the storeys law reads -------------------------------------------------------
  if (core) {
    coreSolids(core, add, vis, 0, false);
    const levY = Y.slice(0, m + 1);
    if (m === n) levY[n] = top;
    // A bulkhead round the stair's top on the roof (a hut you come up into), open toward the roof
    R.S = {
      b: R, n: m, Y: levY, flights: core.flights, frame: core.frame, depth: core.depth, area: core.area, color: B.color,
      ix0: ox0, ix1: ox1, iz0: oz0, iz1: oz1, top: top + VERT.up, idx: [], ext: null, cg: true, id: B.id, side: coreSide,
    };
    out.recs.push(R.S);
  }
  if (esc) {
    const k = esc.core, fr = esc.rect;
    coreSolids(k, add, vis, 0, true);
    // the outer rail of every landing above the street, and the two ends
    const qOut = k.frame.rect(-LAND, k.L0 + LAND, FW * 2 - RAIL_T, FW * 2);
    for (let L = 1; L < esc.Ye.length; L++) {
      const y = esc.Ye[L];
      add(qOut.minX, qOut.minZ, qOut.maxX, qOut.maxZ, 'cg-rail', y + RAIL_H, y);
      vis((qOut.minX + qOut.maxX) / 2, y + RAIL_H / 2, (qOut.minZ + qOut.maxZ) / 2, qOut.maxX - qOut.minX, RAIL_H, qOut.maxZ - qOut.minZ, '#2e2a26', L);
      for (const r of [-LAND, k.L0 + LAND]) { const e = k.frame.rect(r - 0.06, r + 0.06, 0, FW * 2); add(e.minX, e.minZ, e.maxX, e.maxZ, 'cg-rail', y + RAIL_H, y); }
      // the landing's grating (visual: the deck is the record's)
      vis((fr.minX + fr.maxX) / 2, y - 0.05, (fr.minZ + fr.maxZ) / 2, fr.maxX - fr.minX, 0.1, fr.maxZ - fr.minZ, '#3a3632', L);
    }
    const ly = esc.Ye.slice(); ly[ly.length - 1] = esc.topL === n ? top : ly[ly.length - 1];
    R.E = { b: { minX: fr.minX, maxX: fr.maxX, minZ: fr.minZ, maxZ: fr.maxZ, escapeOf: R }, n: esc.Ye.length - 1, Y: ly, flights: k.flights, frame: k.frame, depth: FW * 2, area: fr,
      ix0: fr.minX, ix1: fr.maxX, iz0: fr.minZ, iz1: fr.maxZ, top: ly[ly.length - 1] + 1, idx: [], ext: null, cg: true, id: `${B.id}.esc`, escape: true };
    out.recs.push(R.E);
  }

  // ---- loot: containers per floor (richer upstairs), a crate on the roof; crates are cover --------------------------
  const LK = LOOT_BY_KIND[B.loot] ?? LOOT_BY_KIND.house;
  const area = (ix1 - ix0) * (iz1 - iz0), floors = B.ruined ? n : m + 1;
  const busy = (x, z) => (core && x > core.area.minX - 2 && x < core.area.maxX + 2 && z > core.area.minZ - 2 && z < core.area.maxZ + 2) // a walker's way round the core's landings
    || B.doors.some((d) => { const [dx, dz] = doorXZ(B, d); return Math.abs(dx - x) < (d.kind === 'bay' ? d.w / 2 + 1.5 : 1.8) && Math.abs(dz - z) < (d.kind === 'bay' ? d.w / 2 + 1.5 : 1.8); })
    || (B.drive && B.doors.some((d) => d.kind === 'bay' && ((d.side === 'N' || d.side === 'S') ? Math.abs(x - d.at) < d.w / 2 + 1.4 : Math.abs(z - d.at) < d.w / 2 + 1.4)));
  for (let k = 0; k < (B.noLoot ? 0 : Math.min(floors, n)); k++) {
    const y = Y[k], cnt = Math.min(4, Math.max(1, Math.floor(area / LK.per)));
    for (let i = 0; i < cnt; i++) {
      const x = Math.round(rng.range(ix0 + 1.2, ix1 - 1.2) * 2) / 2, z = Math.round(rng.range(iz0 + 1.2, iz1 - 1.2) * 2) / 2;
      if (busy(x, z)) continue;
      if (esc && Math.abs(x - (B.escape.side === 'W' ? ix0 : B.escape.side === 'E' ? ix1 : x)) < 2 && Math.abs(z - (B.escape.side === 'N' ? iz0 : B.escape.side === 'S' ? iz1 : z)) < 2) continue;
      add(x - 0.5, z - 0.5, x + 0.5, z + 0.5, 'crate', y + 1, y);
      vis(x, y + 0.5, z, 1, 1, 1, '#7a5a34', k);
      const table = LK.table[Math.floor(rng() * LK.table.length)];
      out.loot.push({ id: `cg:${B.id}:L${k}:${i}`, table: k >= 2 && rng.chance(FLOOR_LOOT.richPerFloor * k) ? 'gunsmith' : table, x, z, y, cap: 60, label: `${k ? `FLOOR ${k + 1} · ` : ''}${B.name.toUpperCase()}`, b: B.id, k });
      coverPt(x, z + 1, y, 0, 1, 'half', 6);
    }
  }
  if (core && m === n && !B.noLoot && rng.chance(FLOOR_LOOT.roofCrate)) {
    const x = Math.round(((ix0 + ix1) / 2) * 2) / 2, z = Math.round((core.area.minZ > (iz0 + iz1) / 2 ? iz0 + 2 : iz1 - 2) * 2) / 2;
    if (!busy(x, z)) { add(x - 0.5, z - 0.5, x + 0.5, z + 0.5, 'crate', top + 1, top); vis(x, top + 0.5, z, 1, 1, 1, '#5e5a3a', n); out.loot.push({ id: `cg:${B.id}:roof`, table: FLOOR_LOOT.roofTable, x, z, y: top, cap: 60, label: `ROOF · ${B.name.toUpperCase()}`, b: B.id, k: n }); }
  }
  for (const d of B.doors) { const [dx, dz] = doorXZ(B, d); out.doors.push({ b: B.id, x: dx, z: dz, side: d.side, w: d.w, h: d.h, kind: d.kind }); }
  R.i1 = out.items.length;
  return R;
}

// A door's centre on its wall line (the footprint's centre lines).
export function doorXZ(B, d) { return d.side === 'N' ? [d.at, B.z0] : d.side === 'S' ? [d.at, B.z1] : d.side === 'W' ? [B.x0, d.at] : [B.x1, d.at]; }

// ---- a bridge between two roofs ---------------------------------------------------------------------------------------
function buildBridge(br, out) {
  const lo = Math.min(br.yFrom, br.yTo), hi = Math.max(br.yFrom, br.yTo), ax = br.axis;
  // the plank flight from the lower roof to the higher (flat when level)
  const lowAtStart = br.yFrom <= br.yTo; // from = the west/north building
  const len = ax === 'x' ? br.x1 - br.x0 : br.z1 - br.z0;
  const f = { i: 0, from: lo, to: hi === lo ? lo + 0.001 : hi, len, band: 0, minX: br.x0, maxX: br.x1, minZ: br.z0, maxZ: br.z1, ax, u: lowAtStart ? 1 : -1, s0: lowAtStart ? (ax === 'x' ? br.x0 : br.z0) : (ax === 'x' ? br.x1 : br.z1) };
  f.bottomOut = ax === 'x' ? { x: lowAtStart ? br.x0 - 0.8 : br.x1 + 0.8, z: (br.z0 + br.z1) / 2 } : { x: (br.x0 + br.x1) / 2, z: lowAtStart ? br.z0 - 0.8 : br.z1 + 0.8 };
  f.topOut = ax === 'x' ? { x: lowAtStart ? br.x1 + 0.8 : br.x0 - 0.8, z: (br.z0 + br.z1) / 2 } : { x: (br.x0 + br.x1) / 2, z: lowAtStart ? br.z1 + 0.8 : br.z0 - 0.8 };
  f.rBottom = 0; f.rTop = len; f.pitch = (hi - lo) / len;
  const add = (minX, minZ, maxX, maxZ, tag, height, base) => { const b = box(minX, minZ, maxX, maxZ, tag, height, base); out.boxes.push(b); return b; };
  // rails both long sides (over the whole height range)
  if (ax === 'x') { add(br.x0, br.z0 - RAIL_T, br.x1, br.z0, 'cg-rail', hi + RAIL_H, lo); add(br.x0, br.z1, br.x1, br.z1 + RAIL_T, 'cg-rail', hi + RAIL_H, lo); }
  else { add(br.x0 - RAIL_T, br.z0, br.x0, br.z1, 'cg-rail', hi + RAIL_H, lo); add(br.x1, br.z0, br.x1 + RAIL_T, br.z1, 'cg-rail', hi + RAIL_H, lo); }
  const steps = Math.max(3, Math.round(len / 0.5));
  for (let s = 0; s < steps; s++) {
    const t0 = s / steps, t1 = (s + 1) / steps, y = lo + (hi - lo) * (lowAtStart ? (t0 + t1) / 2 : 1 - (t0 + t1) / 2);
    if (ax === 'x') out.items.push({ cx: br.x0 + len * (t0 + t1) / 2, cy: y - 0.06, cz: (br.z0 + br.z1) / 2, sx: len / steps - 0.05, sy: 0.12, sz: br.z1 - br.z0, col: s % 2 ? '#6a5236' : '#7a5e3e', lv: 0, R: null });
    else out.items.push({ cx: (br.x0 + br.x1) / 2, cy: y - 0.06, cz: br.z0 + len * (t0 + t1) / 2, sx: br.x1 - br.x0, sy: 0.12, sz: len / steps - 0.05, col: s % 2 ? '#6a5236' : '#7a5e3e', lv: 0, R: null });
  }
  const S = { b: { minX: br.x0, maxX: br.x1, minZ: br.z0, maxZ: br.z1, bridge: br.id }, n: 1, Y: [0, lo], flights: [f], ix0: br.x0, ix1: br.x1, iz0: br.z0, iz1: br.z1, top: hi + 2, idx: [], ext: null, cg: true, id: br.id, bridge: true };
  out.recs.push(S);
  return S;
}

// ---- the whole town ------------------------------------------------------------------------------------------------------
export function buildTown(T) {
  const rng = makeRng((T.seed ^ 0xb1d6) >>> 0);
  const out = { boxes: [], items: [], recs: [], loot: [], cover: [], doors: [], blds: [], bridges: [], ground: [], windows: [], bays: [], fences: [], gates: [], wrecks: [] };
  const BI = BIOMES[T.biome] ?? BIOMES.desert_sonoran;
  // ground: the town's lots, then the streets (and their walks) on top
  for (const b of T.blocks) out.items.push({ cx: (b.x0 + b.x1) / 2, cy: 0.02, cz: (b.z0 + b.z1) / 2, sx: b.x1 - b.x0, sy: 0.04, sz: b.z1 - b.z0, col: b.green ? '#6a7448' : BI.ground, lv: 0, R: null });
  for (const r of T.roads) {
    const RW = ROADS[r.row];
    out.items.push({ cx: (r.x0 + r.x1) / 2, cy: 0.05, cz: (r.z0 + r.z1) / 2, sx: r.x1 - r.x0, sy: 0.06, sz: r.z1 - r.z0, col: RW.edge, lv: 0, R: null });
    const inset = RW.walk;
    if (r.axis === 'x') out.items.push({ cx: (r.x0 + r.x1) / 2, cy: 0.07, cz: (r.z0 + r.z1) / 2, sx: r.x1 - r.x0, sy: 0.06, sz: r.z1 - r.z0 - 2 * inset, col: RW.color, lv: 0, R: null });
    else out.items.push({ cx: (r.x0 + r.x1) / 2, cy: 0.07, cz: (r.z0 + r.z1) / 2, sx: r.x1 - r.x0 - 2 * inset, sy: 0.06, sz: r.z1 - r.z0, col: RW.color, lv: 0, R: null });
  }
  if (T.runway) out.items.push({ cx: (T.runway.x0 + T.runway.x1) / 2, cy: 0.09, cz: (T.runway.z0 + T.runway.z1) / 2, sx: T.runway.x1 - T.runway.x0 - 20, sy: 0.02, sz: 1, col: '#c8c0a0', lv: 0, R: null });
  // bridges first (their parapet gaps), then the buildings
  const byId = new Map(T.buildings.map((B) => [B.id, B]));
  const gaps = new Map();
  for (const br of T.bridges) {
    const from = byId.get(br.from.id ?? br.from) ?? br.from, to = byId.get(br.to.id ?? br.to) ?? br.to;
    const ax = br.axis, c = ax === 'x' ? (br.z0 + br.z1) / 2 : (br.x0 + br.x1) / 2;
    (gaps.get(from.id) ?? gaps.set(from.id, []).get(from.id)).push({ side: ax === 'x' ? 'E' : 'S', a: c - VERT.bridge.w / 2 - 0.1, b: c + VERT.bridge.w / 2 + 0.1 });
    (gaps.get(to.id) ?? gaps.set(to.id, []).get(to.id)).push({ side: ax === 'x' ? 'W' : 'N', a: c - VERT.bridge.w / 2 - 0.1, b: c + VERT.bridge.w / 2 + 0.1 });
  }
  for (const B of T.buildings) {
    const brng = makeRng((hashStr(B.id) ^ T.seed) >>> 0);
    B._gaps = gaps.get(B.id) ?? [];
    out.blds.push(buildBuilding(B, out, T, brng));
    delete B._gaps;
  }
  // a bridge needs both its roofs walkable (a core reached the roof on both sides)
  for (const br of T.bridges) {
    const a = out.blds.find((R) => R.B.id === (br.from.id ?? br.from)), b = out.blds.find((R) => R.B.id === (br.to.id ?? br.to));
    if (!a?.S || !b?.S || a.S.n !== a.B.n || b.S.n !== b.B.n) continue;
    br.yFrom = a.B.top; br.yTo = b.B.top;
    out.bridges.push({ br, S: buildBridge(br, out) });
  }
  // the wall (most towns: none), its gates and towers
  if (T.wall) {
    const Wl = T.wall, t = Math.max(0.3, Wl.t), h = Wl.h;
    const sideSeg = (s) => {
      const horiz = s === 'N' || s === 'S', fixed = s === 'N' ? Wl.z0 : s === 'S' ? Wl.z1 : s === 'W' ? Wl.x0 : Wl.x1, a0 = horiz ? Wl.x0 : Wl.z0, a1 = horiz ? Wl.x1 : Wl.z1;
      const gs = Wl.gates.filter((g) => g.side === s).map((g) => [g.at - g.w / 2 - 1, g.at + g.w / 2 + 1]).sort((p, q) => p[0] - q[0]);
      let cur = a0; const segs = [];
      for (const [a, b] of gs) { if (a > cur) segs.push([cur, a]); cur = Math.max(cur, b); }
      if (a1 > cur) segs.push([cur, a1]);
      for (const [a, b] of segs) {
        // container/car-husk walls in pieces (each a box of its own colour), the rest one run
        const piece = Wl.type === 'container' ? 6.1 : Wl.type === 'car_husk' ? 4.4 : b - a;
        for (let p = a; p < b - 0.05; p += piece) {
          const q = Math.min(b, p + piece), hh = Wl.type === 'car_husk' ? h * (0.8 + rng() * 0.3) : h;
          const bx = horiz ? box(p, fixed - t / 2, q, fixed + t / 2, Wl.fence ? 'cg-fence' : 'cg-townwall', hh) : box(fixed - t / 2, p, fixed + t / 2, q, Wl.fence ? 'cg-fence' : 'cg-townwall', hh);
          out.boxes.push(bx);
          const col = Wl.type === 'container' ? rng.pick(['#7a4a34', '#4a5a4e', '#8a6a3a', '#5a5a5e', '#9a5a3a']) : Wl.type === 'car_husk' ? rng.pick(['#6a4a3a', '#4a4a44', '#7a5a3a']) : Wl.look;
          out.items.push({ cx: (bx.minX + bx.maxX) / 2, cy: hh / 2, cz: (bx.minZ + bx.maxZ) / 2, sx: bx.maxX - bx.minX, sy: hh, sz: bx.maxZ - bx.minZ, col, lv: 0, R: null });
          if (!Wl.fence) for (let c2 = p + 1; c2 < q; c2 += 3) { const inw = s === 'N' || s === 'W' ? 1 : -1, x = horiz ? c2 : fixed + inw * (t / 2 + 0.6), z = horiz ? fixed + inw * (t / 2 + 0.6) : c2; out.cover.push(x, z, 0, horiz ? 0 : -inw, horiz ? -inw : 0, 1, 7); }
        }
      }
    };
    for (const s of ['N', 'E', 'S', 'W']) sideSeg(s);
    if (Wl.towers) for (const [x, z] of [[Wl.x0, Wl.z0], [Wl.x1, Wl.z0], [Wl.x0, Wl.z1], [Wl.x1, Wl.z1]]) {
      out.boxes.push(box(x - 2, z - 2, x + 2, z + 2, 'cg-tower', h + 3.5));
      out.items.push({ cx: x, cy: (h + 3.5) / 2, cz: z, sx: 4, sy: h + 3.5, sz: 4, col: '#5a4a38', lv: 0, R: null });
    }
  }
  // the back lots (world/citygen/backlots-build.js): alleys, yard fences and gates, yard things, docks, verge props
  buildBacklots(T, out, box);
  // wrecks: dead cars in the street, cover for a firefight
  const keep = out.doors.map((d) => [d.x, d.z, d.kind === 'bay' ? 10 : 4.5]);
  for (const w of T.wrecks) {
    if (keep.some(([x, z, r]) => Math.abs(w.x - x) < r + 2.2 && Math.abs(w.z - z) < r + 2.2)) continue; // never in front of a door or a bay
    const lx = w.along === 'x' ? 2.2 : 0.95, lz = w.along === 'x' ? 0.95 : 2.2;
    out.boxes.push(box(w.x - lx, w.z - lz, w.x + lx, w.z + lz, 'cg-wreck', 1.4));
    out.wrecks.push({ x: w.x, z: w.z, rot: w.along === 'x' ? Math.PI / 2 : 0, ...wreckOf(fnv(w.x, w.z, 0x57), 'street'), fit: [4.4, 1.9] }); // our body, dead (systems/wrecks.js)
    out.cover.push(w.x + (w.along === 'x' ? 0 : 1.6), w.z + (w.along === 'x' ? 1.6 : 0), 0, w.along === 'x' ? 0 : 1, w.along === 'x' ? 1 : 0, 0.5, 8);
    out.cover.push(w.x - (w.along === 'x' ? 0 : 1.6), w.z - (w.along === 'x' ? 1.6 : 0), 0, w.along === 'x' ? 0 : -1, w.along === 'x' ? -1 : 0, 0.5, 8);
  }
  return out;
}
export function hashStr(s) { let v = 2166136261; for (let i = 0; i < s.length; i++) { v ^= s.charCodeAt(i); v = Math.imul(v, 16777619); } return v >>> 0; }
