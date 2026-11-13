// ROOMS FOR A GENERATED BUILDING (docs/design/WEB_CG_ROOMS.md; rows data/cgrooms.js). Pure, like build.js: given one floor
// of one building (its inside rect, the places that must stay clear) it adds partition walls with doorways and furniture
// through build.js's own add() and vis(), and says which pieces can hold the floor's loot.
//
// The one rule that keeps every room reachable: a partition is only ever CUT, never extended. Each room is laid with a
// doorway of its own; then every keep-clear rect (the stair core and its landings, each outer door's swing, a drive lane,
// a fire-escape door) is cut out of any wall that crosses it. Furniture stands against walls, never in a keep-clear rect
// or a doorway, and never so deep that two pieces facing each other close the room.
import { KIND_ROOMS, DEFAULT_ROOMS, PIECES, ROOM_TYPES, CG_ROOMS as C } from '../../data/cgrooms.js';

const hits = (a, b, pad = 0) => a.minX < b.maxX + pad && a.maxX > b.minX - pad && a.minZ < b.maxZ + pad && a.maxZ > b.minZ - pad;
const shade = (hex, k) => { const n = parseInt(hex.slice(1), 16); const c = (v) => Math.max(0, Math.min(255, Math.round(v * k))); return `#${((c(n >> 16) << 16) | (c((n >> 8) & 255) << 8) | c(n & 255)).toString(16).padStart(6, '0')}`; };

// o: { B, k, y0, y1, ix0, ix1, iz0, iz1, keep: [{minX,minZ,maxX,maxZ}], add, vis, rng }
// Returns { rooms: [{ k, type, name, minX, minZ, maxX, maxZ }], holders: [{ x, z }], solids: [box],
//   gaps: [{ x, z, w, nx, nz }] its doorways (the path grid keeps them open: systems/backlots.js navOverlay) }.
export function layRooms(o) {
  const { B, k, y0, y1, ix0, ix1, iz0, iz1, keep, add, vis, rng } = o;
  const row = KIND_ROOMS[B.kind] ?? DEFAULT_ROOMS, L = k === 0 ? row.street : row.up;
  const f = B.front, ns = f === 'N' || f === 'S';
  const U = ns ? ix1 - ix0 : iz1 - iz0, V = ns ? iz1 - iz0 : ix1 - ix0; // u: along the front; v: in from the front wall
  const wx = (u, v) => (ns ? ix0 + u : f === 'W' ? ix0 + v : ix1 - v), wz = (u, v) => (ns ? (f === 'N' ? iz0 + v : iz1 - v) : iz0 + u);
  const rect = (u0, v0, u1, v1) => { const xa = wx(u0, v0), xb = wx(u1, v1), za = wz(u0, v0), zb = wz(u1, v1); return { minX: Math.min(xa, xb), maxX: Math.max(xa, xb), minZ: Math.min(za, zb), maxZ: Math.max(za, zb) }; };
  const walls = [], rooms = [], m = C.minRoom;
  const room = (type, u0, v0, u1, v1) => rooms.push({ type, u0, v0, u1, v1 });
  // run 'u': the wall runs along u at v = at, from u = a to b (run 'v': along v at u = at). doors: where along its run.
  const wall = (run, at, a, b, doors = []) => walls.push({ run, at, a, b, doors });
  let lay = L[0];
  if (lay === 'split' && !(V >= m * 2 + 0.4 && U >= m)) lay = 'hall';
  if (lay === 'home' && !(V >= m * 2 + 0.4 && U >= m * 2 + 0.4)) lay = 'hall';
  if (lay === 'corridor' && !(Math.min(U, V) >= m * 2 + C.corridor && Math.max(U, V) >= m * 2)) lay = 'hall';
  if (lay === 'split') {
    const c = Math.min(Math.max(V * 0.64, m), V - m), two = U >= m * 2 + 0.4, s = U * 0.5;
    wall('u', c, 0, U, [two ? U * 0.25 : U * 0.5]);
    room(L[1], 0, 0, U, c);
    if (two) { wall('v', s, c, V, [(c + V) / 2]); room(L[2], 0, c, s, V); room(L[3], s, c, U, V); } else room(L[2], 0, c, U, V);
  } else if (lay === 'home') {
    const c = V * 0.5, s = U * 0.56, t = U * 0.62;
    wall('u', c, 0, U, [t * 0.5, (t + U) / 2]);
    wall('v', s, 0, c, [c * 0.5]);
    wall('v', t, c, V, []);
    room(L[1], 0, 0, s, c); room(L[2], s, 0, U, c); room(L[3], 0, c, t, V); room(L[4], t, c, U, V);
  } else if (lay === 'corridor') {
    const al = V > U ? 'v' : 'u', cr = al === 'u' ? 'v' : 'u', Ln = Math.max(U, V), X = Math.min(U, V);
    const c0 = X / 2 - C.corridor / 2, c1 = X / 2 + C.corridor / 2, nb = Math.max(1, Math.round(Ln / C.bay)), bl = Ln / nb;
    const mids = []; for (let i = 0; i < nb; i++) mids.push((i + 0.5) * bl);
    wall(al, c0, 0, Ln, mids); wall(al, c1, 0, Ln, mids);
    for (let i = 1; i < nb; i++) { wall(cr, i * bl, 0, c0); wall(cr, i * bl, c1, X); }
    const R = (a0, x0, a1, x1, type) => (al === 'u' ? room(type, a0, x0, a1, x1) : room(type, x0, a0, x1, a1));
    for (let i = 0; i < nb; i++) { R(i * bl, 0, (i + 1) * bl, c0, L[1]); R(i * bl, c1, (i + 1) * bl, X, L[1]); }
    R(0, c0, Ln, c1, 'corridor');
  } else room(L[1], 0, 0, U, V);

  // ---- the partitions: cut by doorways and by every keep-clear rect ---------------------------------------------------
  const T = C.wall, wcol = shade(B.color, 1.12), solids = [], zones = keep.slice(), gaps = [];
  for (const w of walls) {
    const p0 = w.run === 'u' ? [w.a, w.at] : [w.at, w.a], p1 = w.run === 'u' ? [w.b, w.at] : [w.at, w.b];
    const xa = wx(p0[0], p0[1]), xb = wx(p1[0], p1[1]), za = wz(p0[0], p0[1]), zb = wz(p1[0], p1[1]);
    const horiz = Math.abs(za - zb) < 1e-6, fixed = horiz ? za : xa, lo = horiz ? Math.min(xa, xb) : Math.min(za, zb), hi = horiz ? Math.max(xa, xb) : Math.max(za, zb);
    const cuts = [];
    for (const d of w.doors) {
      const q = w.run === 'u' ? [d, w.at] : [w.at, d], c = horiz ? wx(q[0], q[1]) : wz(q[0], q[1]);
      cuts.push({ a: c - C.door / 2, b: c + C.door / 2, door: true });
      gaps.push(horiz ? { x: c, z: fixed, w: C.door, nx: 0, nz: 1 } : { x: fixed, z: c, w: C.door, nx: 1, nz: 0 });
      zones.push(horiz ? { minX: c - C.door / 2 - 0.2, maxX: c + C.door / 2 + 0.2, minZ: fixed - C.clear, maxZ: fixed + C.clear } : { minX: fixed - C.clear, maxX: fixed + C.clear, minZ: c - C.door / 2 - 0.2, maxZ: c + C.door / 2 + 0.2 });
    }
    for (const K of keep) {
      const c0 = horiz ? K.minZ : K.minX, c1 = horiz ? K.maxZ : K.maxX;
      if (fixed + T / 2 > c0 && fixed - T / 2 < c1) cuts.push({ a: horiz ? K.minX : K.minZ, b: horiz ? K.maxX : K.maxZ, door: false });
    }
    cuts.sort((p, q) => p.a - q.a);
    let cur = lo;
    const piece = (a, b, base, top) => {
      if (b - a < 0.45 || top - base < 0.05) return;
      const bx = horiz ? add(a, fixed - T / 2, b, fixed + T / 2, 'cg-wall', top, base) : add(fixed - T / 2, a, fixed + T / 2, b, 'cg-wall', top, base);
      bx.inner = true;
      if (base <= y0 + 0.01) solids.push(bx);
      if (horiz) vis((a + b) / 2, (base + top) / 2, fixed, b - a, top - base, T, wcol, k); else vis(fixed, (base + top) / 2, (a + b) / 2, T, top - base, b - a, wcol, k);
    };
    for (const c of cuts) {
      if (c.a > cur) piece(cur, Math.min(c.a, hi), y0, y1);
      if (c.door && c.a >= cur - 1e-6 && c.b <= hi + 1e-6) piece(c.a, c.b, y0 + C.lintel, y1); // the head of a doorway (never over a keep-clear cut)
      cur = Math.max(cur, c.b);
      if (cur >= hi) break;
    }
    if (cur < hi) piece(cur, hi, y0, y1);
  }

  // ---- the furniture: against the walls of each room, then rows in the middle of a big one ---------------------------
  const holders = [], placed = [], outRooms = [];
  // Two pieces on the same wall of a room may stand side by side. Any two others in a room keep a walkway (C.pass)
  // between them: a bed out from one wall and a cupboard on the next never close the way from one doorway to another.
  let ri = 0;
  const blocked = (r, side) => zones.some((z) => hits(r, z)) || placed.some((q) => hits(r, q, q.ri === ri ? (q.side === side && side >= 0 ? 0.25 : C.pass) : 0.05));
  const put = (r, P, side) => {
    const bx = add(r.minX, r.minZ, r.maxX, r.maxZ, 'cg-furn', y0 + P.h, y0);
    r.ri = ri; r.side = side;
    solids.push(bx); placed.push(r);
    vis((r.minX + r.maxX) / 2, y0 + P.h / 2, (r.minZ + r.maxZ) / 2, r.maxX - r.minX, P.h, r.maxZ - r.minZ, P.col, k);
    if (P.holds) holders.push({ x: (r.minX + r.maxX) / 2, z: (r.minZ + r.maxZ) / 2 });
  };
  for (const q of rooms) {
    ri++;
    const RT = ROOM_TYPES[q.type] ?? ROOM_TYPES.store, w0 = rect(q.u0, q.v0, q.u1, q.v1);
    const r = { minX: w0.minX + T / 2, maxX: w0.maxX - T / 2, minZ: w0.minZ + T / 2, maxZ: w0.maxZ - T / 2 };
    outRooms.push({ k, type: q.type, name: RT.name, minX: r.minX, minZ: r.minZ, maxX: r.maxX, maxZ: r.maxZ });
    const sx = r.maxX - r.minX, sz = r.maxZ - r.minZ;
    if (!RT.wall.length || sx < 1.6 || sz < 1.6) continue;
    const want = Math.max(C.pieces[0], Math.min(C.pieces[1], Math.round((sx * sz) / C.perPiece)));
    // the four walls: N (z = minZ, runs along x), S, W, E; depth[] is how far pieces stand out from each so far
    const depth = [0, 0, 0, 0], start = Math.floor(rng() * 4);
    let got = 0, pi = 0;
    for (let wi = 0; wi < 4 && got < want; wi++) {
      const side = (start + wi) % 4, alongX = side < 2, len = alongX ? sx : sz, span = alongX ? sz : sx, opp = side ^ 1;
      let cur = 0.3, tries = 0;
      while (got < want && tries++ < 24) {
        const P = PIECES[RT.wall[pi % RT.wall.length]];
        if (cur + P.w > len - 0.3) break;
        if (depth[opp] + P.d + C.pass > span) { pi++; if (tries > 6) break; continue; } // would close the room against the piece opposite
        const a0 = (alongX ? r.minX : r.minZ) + cur, a1 = a0 + P.w;
        const fr = side === 0 ? { minX: a0, maxX: a1, minZ: r.minZ, maxZ: r.minZ + P.d } : side === 1 ? { minX: a0, maxX: a1, minZ: r.maxZ - P.d, maxZ: r.maxZ }
          : side === 2 ? { minX: r.minX, maxX: r.minX + P.d, minZ: a0, maxZ: a1 } : { minX: r.maxX - P.d, maxX: r.maxX, minZ: a0, maxZ: a1 };
        if (blocked(fr, side)) { cur += 0.6; continue; }
        put(fr, P, side); depth[side] = Math.max(depth[side], P.d); got++; pi++; cur += P.w + 0.35;
      }
    }
    if (RT.centre && Math.min(sx, sz) >= C.centreMin) {
      const P = PIECES[RT.centre], wide = sx >= sz, pw = wide ? P.w : P.d, pd = wide ? P.d : P.w, mg = C.centreEdge;
      let n = 0;
      for (let z = r.minZ + mg; z + pd <= r.maxZ - mg + 1e-6 && n < 12; z += pd + C.aisle) for (let x = r.minX + mg; x + pw <= r.maxX - mg + 1e-6 && n < 12; x += pw + C.aisle) {
        const fr = { minX: x, maxX: x + pw, minZ: z, maxZ: z + pd };
        if (blocked(fr, -1)) continue;
        put(fr, P, -1); n++;
      }
    }
  }
  return { rooms: outRooms, holders, solids, gaps };
}

// Is (x, z) clear of everything rooms.js put on this floor (a loose crate's centre with half a metre round it)?
export function clearOf(solids, x, z, pad = 0.55) {
  for (const b of solids) if (x + pad > b.minX && x - pad < b.maxX && z + pad > b.minZ && z - pad < b.maxZ) return false;
  return true;
}
