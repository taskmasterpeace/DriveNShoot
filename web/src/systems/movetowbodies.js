// The boats, the boat trailer and the wrecker, built to the car standard (docs/design/WEB_MOVE_TOW.md §3.4): real hull
// shapes lofted from cross-sections (a raked bow, chines, a flared side, a gunwale with a rub rail, a transom), a cockpit
// sole inside, seats and consoles, the airboat's cage and its big fan, and the wear painted into the vertex colours
// (an anti-fouling bottom under the waterline, oxidised and rust-streaked topsides, scuffed gunwales).
// vehiclebodies.js buildBody routes these bases here (HULLS[base]) with its own helpers in K, so every body is still ONE
// merged, vertex-coloured mesh with a `part` id per vertex (1 draw call per vehicle). Local frame as everywhere: +x the
// driver's left, +y up, +z forward; the hull's keel near y = 0 (the water's surface carries the boat's group).
import * as THREE from 'three';

const _c = new THREE.Color(), _k = new THREE.Color(), _r = new THREE.Color('#7b4526'), _rd = new THREE.Color('#4e2c18'), _dk = new THREE.Color('#1b1915');
const fract = (v) => v - Math.floor(v);
const hash = (i, j) => fract(Math.sin(i * 127.1 + j * 311.7) * 43758.5453);
function vnoise(x, y) {
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash(i, j), b = hash(i + 1, j), c = hash(i, j + 1), d = hash(i + 1, j + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const lerp = (a, b, t) => a + (b - a) * t;
const sat = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// The wear on a hull's skin at a vertex: W = { base, bottom, line (waterline y), sheer (y, for streaks), boot (stripe colour), rust 0..1, seed }
function wear(out, W, x, y, z) {
  out.copy(W.base);
  const n = vnoise(x * 2.1 + W.seed, z * 1.7 - y * 2.3), n2 = vnoise(x * 5.3 - z * 0.4 + 31 + W.seed, z * 4.1 + y * 3.7);
  out.lerp(_dk, 0.18 * n); // grime, uneven
  if (W.boot && y > W.line && y < W.line + 0.07) out.copy(W.boot).lerp(_dk, 0.25 * n2); // the boot stripe
  if (y <= W.line) { out.copy(W.bottom).lerp(_dk, 0.3 * n); return out; } // anti-fouling, scraped
  const rust = W.rust ?? 0.5;
  if (n2 > 1 - 0.32 * rust) out.lerp(n2 > 0.92 ? _rd : _r, sat((n2 - (1 - 0.32 * rust)) * 3.2)); // rust blooms
  const st = hash(Math.floor(z * 4.5 + (x > 0 ? 7 : 0)), 3.3 + W.seed);
  if (st > 1 - 0.28 * rust && W.sheer - y < 0.55) out.lerp(_r, 0.55 * sat(1 - (W.sheer - y) / 0.55) * (st - (1 - 0.28 * rust)) * 3.5); // streaks down from the gunwale fittings
  return out;
}

// A hull lofted from stations. o:
//   L, n               length, stations
//   prof(u, s)         u 0 stern .. 1 bow -> fills s { hw (sheer half beam), cw (chine half beam), ky (keel y), cy (chine y), sy (sheer y) }
//   fy                 the cockpit sole's height (null: no open cockpit: decked over at the sheer)
//   open: [u0, u1]     the stretch that is an open cockpit (outside it: decked over at the sheer)
//   t                  side thickness
//   W                  wear (see wear()); gun (gunwale cap colour), deck (sole and deck colour)
//   parts              K.PART for the bow and stern thirds
function loft(K, o) {
  const pos = [], col = [], part = [];
  const S = [];
  for (let i = 0; i <= o.n; i++) {
    const u = i / o.n, s = { hw: 0, cw: 0, ky: 0, cy: 0, sy: 0, z: -o.L / 2 + u * o.L, u };
    o.prof(u, s); S.push(s);
  }
  const P = K.PART, partAt = (u) => (u > 0.78 ? P.bumperF : u < 0.12 ? P.bumperR : P.body);
  const v3 = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), nm = new THREE.Vector3(), ref = new THREE.Vector3();
  // A triangle whose normal points away from (sign +1) or toward (-1) the reference point; colours by fn or a flat colour.
  const tri = (a, b, c, rx, ry, rz, sign, colr, u) => {
    e1.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]); e2.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]); nm.crossVectors(e1, e2);
    ref.set((a[0] + b[0] + c[0]) / 3 - rx, (a[1] + b[1] + c[1]) / 3 - ry, (a[2] + b[2] + c[2]) / 3 - rz);
    if (nm.dot(ref) * sign < 0) { const t = b; b = c; c = t; }
    for (const p of [a, b, c]) {
      pos.push(p[0], p[1], p[2]);
      if (colr) { col.push(colr.r, colr.g, colr.b); } else { wear(_c, o.W, p[0], p[1], p[2]); col.push(_c.r, _c.g, _c.b); }
      part.push(partAt(u));
    }
  };
  const quad = (a, b, c, d, rx, ry, rz, sign, colr, u) => { tri(a, b, c, rx, ry, rz, sign, colr, u); tri(a, c, d, rx, ry, rz, sign, colr, u); };
  const sec = (s) => [[s.hw, s.sy, s.z], [s.cw, s.cy, s.z], [0, s.ky, s.z], [-s.cw, s.cy, s.z], [-s.hw, s.sy, s.z]];
  const inOpen = (u) => o.open && u >= o.open[0] - 1e-6 && u <= o.open[1] + 1e-6;
  const floorW = (s) => {
    const y = o.fy;
    const w = y >= s.cy ? s.cw + (s.hw - s.cw) * sat((y - s.cy) / Math.max(1e-3, s.sy - s.cy)) : s.cw * sat((y - s.ky) / Math.max(1e-3, s.cy - s.ky));
    return Math.max(0, w - o.t);
  };
  _k.set(o.gun); const gun = _k.clone(); _k.set(o.deck); const deck = _k.clone();
  for (let i = 0; i < o.n; i++) {
    const A = S[i], B = S[i + 1], a = sec(A), b = sec(B), u = (A.u + B.u) / 2, my = (A.sy + A.ky) / 2;
    for (let k = 0; k < 4; k++) quad(a[k], a[k + 1], b[k + 1], b[k], 0, my, (A.z + B.z) / 2, 1, null, u); // the skin, outward
    const opn = inOpen(A.u) && inOpen(B.u);
    if (opn && o.fy !== null) {
      const fa = floorW(A), fb = floorW(B);
      for (const sd of [1, -1]) {
        // the inside of the side (toward the centre line), the gunwale cap over the top of it
        quad([sd * (A.hw - o.t), A.sy, A.z], [sd * fa, o.fy, A.z], [sd * fb, o.fy, B.z], [sd * (B.hw - o.t), B.sy, B.z], 0, o.fy + 0.3, (A.z + B.z) / 2, -1, null, u);
        quad([sd * A.hw, A.sy, A.z], [sd * (A.hw - o.t), A.sy + 0.012, A.z], [sd * (B.hw - o.t), B.sy + 0.012, B.z], [sd * B.hw, B.sy, B.z], 0, -5, 0, 1, gun, u);
      }
      quad([fa, o.fy, A.z], [-fa, o.fy, A.z], [-fb, o.fy, B.z], [fb, o.fy, B.z], 0, -5, 0, 1, deck, u); // the sole
    } else {
      quad([A.hw, A.sy, A.z], [-A.hw, A.sy, A.z], [-B.hw, B.sy, B.z], [B.hw, B.sy, B.z], 0, -5, 0, 1, deck, u); // decked over
    }
    // the cockpit's ends: a bulkhead where the open part meets a deck
    if (o.fy !== null && inOpen(B.u) !== inOpen(A.u)) { const s = inOpen(A.u) ? B : A, w = Math.min(floorW(A), floorW(B)); quad([s.hw - o.t, s.sy, s.z], [-(s.hw - o.t), s.sy, s.z], [-w, o.fy, s.z], [w, o.fy, s.z], 0, o.fy, inOpen(A.u) ? s.z - 1 : s.z + 1, -1, null, u); }
  }
  // the transom: the stern section closed, flat
  const T = sec(S[0]);
  const cx = 0, cy = (S[0].sy + S[0].ky) / 2;
  for (let k = 0; k < 4; k++) tri([cx, cy, S[0].z], T[k], T[k + 1], 0, cy, S[0].z + 5, 1, null, 0.02);
  tri([cx, cy, S[0].z], T[4], T[0], 0, cy, S[0].z + 5, 1, null, 0.02);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('part', new THREE.Float32BufferAttribute(part, 1));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2)); // the merge wants every part's attributes alike
  g.computeVertexNormals();
  return { geo: g, S };
}
// A rub rail along the sheer, both sides (beams between stations).
function rubRail(parts, K, S, color, drop = 0.04, from = 0) {
  for (let i = from; i < S.length - 1; i++) for (const sd of [1, -1]) parts.push(K.beam([sd * (S[i].hw + 0.012), S[i].sy - drop, S[i].z], [sd * (S[i + 1].hw + 0.012), S[i + 1].sy - drop, S[i + 1].z], 0.055, color, K.PART.frame));
}
const sheerAt = (S, z) => { for (let i = 0; i < S.length - 1; i++) if (z >= S[i].z && z <= S[i + 1].z) { const t = (z - S[i].z) / (S[i + 1].z - S[i].z); return { hw: lerp(S[i].hw, S[i + 1].hw, t), sy: lerp(S[i].sy, S[i + 1].sy, t) }; } return S[S.length - 1]; };
function cleat(parts, K, x, y, z, rot = 0) {
  parts.push(K.slab(x - 0.03, x + 0.03, y, y + 0.05, z - 0.03, z + 0.03, '#8d8a84', K.PART.frame));
  const g = new THREE.BoxGeometry(rot ? 0.05 : 0.2, 0.035, rot ? 0.2 : 0.05).toNonIndexed().translate(x, y + 0.06, z); parts.push(K.tag(g, '#9a968e', K.PART.frame));
}
function cyl(K, r, h, x, y, z, color, part, axis = 'y', seg = 12) {
  const g = new THREE.CylinderGeometry(r, r, h, seg).toNonIndexed();
  if (axis === 'z') g.rotateX(Math.PI / 2); else if (axis === 'x') g.rotateZ(Math.PI / 2);
  g.translate(x, y, z);
  return K.tag(g, color, part ?? K.PART.body);
}
// An outboard motor on the transom: the bracket, the leg, the cowl, a tiller arm (opt).
function outboard(parts, K, x, z, top, size = 1, cowlC = '#2b2b2b', tiller = false) {
  const s = size;
  parts.push(K.slab(x - 0.08 * s, x + 0.08 * s, top - 0.25, top + 0.05, z - 0.06, z + 0.04, '#3b3934', K.PART.bumperR)); // clamp bracket
  parts.push(K.slab(x - 0.06 * s, x + 0.06 * s, top - 0.75 * s, top + 0.1, z - 0.2 * s, z - 0.06, '#2a2a28', K.PART.bumperR)); // the leg
  parts.push(K.coloredBox(0.36 * s, 0.4 * s, 0.5 * s, x, top + 0.28 * s, z - 0.22 * s, cowlC, K.PART.bumperR)); // the cowl
  parts.push(K.slab(x - 0.185 * s, x + 0.185 * s, top + 0.42 * s, top + 0.47 * s, z - 0.45 * s, z + 0.01 * s, '#8a7d62', K.PART.bumperR)); // a faded decal band
  if (tiller) parts.push(K.beam([x, top + 0.2 * s, z - 0.05], [x + 0.06, top + 0.27 * s, z + 0.55 * s], 0.05, '#1e1e1c', K.PART.frame));
}
// A tyre hung on a rope over the side as a fender (raider boats).
function fender(parts, K, x, y, z) {
  const t = new THREE.TorusGeometry(0.22, 0.09, 6, 12).toNonIndexed().rotateY(Math.PI / 2).translate(x, y, z);
  parts.push(K.tag(t, '#161514', K.PART.body));
}

// ---- the airboat ---------------------------------------------------------------------------------------------------
// A flat-bottomed scow with a raked, blunt bow and flared sides; the deck (data/decks.js airboatDeck: y 0.67, z -1.05..1.55);
// the raised driver's chair on its tube stand; the aircraft engine on its stand at the stern, the prop in a round
// cage of hoops, spokes and mesh, two rudders behind it on a push-pull stick.
function airboat(parts, s, paint, K) {
  const L = s.len, B = s.wid / 2;
  const { geo, S } = loft(K, {
    L, n: 16, t: 0.05, fy: 0.67, open: [0.1, 0.82], gun: '#9b9a92', deck: '#34332d',
    W: { base: new THREE.Color(paint), bottom: new THREE.Color('#33302a'), line: 0.2, sheer: 0.84, boot: null, rust: 0.45, seed: 3 },
    prof(u, o) {
      const bow = sat((u - 0.72) / 0.28);
      o.hw = B * (0.96 - 0.36 * bow * bow); o.cw = o.hw * (0.9 - 0.05 * bow);
      o.ky = 0.06 + 0.62 * bow * bow; o.cy = o.ky + 0.06; o.sy = 0.82 + 0.1 * bow;
    },
  });
  parts.push(geo);
  rubRail(parts, K, S, '#4c4b46');
  const zs = -L / 2;
  // a bow deck plate with a non-skid tread and a bow eye
  parts.push(K.slab(-0.5, 0.5, 0.86, 0.9, L / 2 - 0.85, L / 2 - 0.3, '#73726a', K.PART.bumperF));
  parts.push(cyl(K, 0.05, 0.08, 0, 0.92, L / 2 - 0.25, '#9a968e', K.PART.bumperF));
  for (const sd of [1, -1]) { cleat(parts, K, sd * (B - 0.2), 0.88, L / 2 - 1.05); cleat(parts, K, sd * (B - 0.18), 0.86, zs + 0.3); }
  // the raised chair: four legs, cross braces, the seat and its high back (data/decks.js airboatDeck chair: z -0.85..0.05)
  const cz0 = -0.85, cz1 = 0.05, cy = 1.45;
  for (const [x, z] of [[-0.4, cz0], [0.4, cz0], [-0.4, cz1], [0.4, cz1]]) parts.push(K.beam([x, 0.67, z], [x * 0.9, cy, z * 0.95 - 0.02], 0.055, '#3b3a36'));
  for (const z of [cz0, cz1]) parts.push(K.beam([-0.38, 1.05, z], [0.38, 1.05, z], 0.04, '#3b3a36'));
  parts.push(K.beam([-0.38, 1.05, cz0], [0.38, 1.05, cz1], 0.04, '#3b3a36'));
  parts.push(K.coloredBox(0.86, 0.12, 0.62, 0, cy + 0.05, -0.38, '#2c2723'));        // the seat
  parts.push(K.coloredBox(0.86, 0.62, 0.1, 0, cy + 0.38, -0.7, '#2c2723', K.PART.body, -0.12)); // its back
  parts.push(K.slab(-0.46, 0.46, cy - 0.03, cy, -0.75, 0.0, '#4a4842'));
  parts.push(K.beam([0.45, 0.67, -0.1], [0.5, 1.55, 0.05], 0.045, '#1b1a18', K.PART.frame)); // the rudder stick (the driver's left hand)
  parts.push(K.coloredBox(0.09, 0.09, 0.09, 0.5, 1.58, 0.06, '#7a2a18', K.PART.frame));
  parts.push(K.slab(-0.12, 0.12, 0.67, 0.75, -0.2, 0.35, '#262522')); // the foot throttle box
  // the engine on its stand, aft of the chair: block, heads, a radiator up front, the stacks, an air cleaner
  const ez = -1.55, ey = 1.05;
  for (const [x, z] of [[-0.35, ez - 0.3], [0.35, ez - 0.3], [-0.35, ez + 0.3], [0.35, ez + 0.3]]) parts.push(K.beam([x, 0.67, z], [x * 0.8, ey, z], 0.06, '#2e2d2a'));
  parts.push(K.coloredBox(0.62, 0.42, 0.72, 0, ey + 0.21, ez, '#3e3c38'));
  for (const sd of [1, -1]) parts.push(K.coloredBox(0.16, 0.18, 0.66, sd * 0.36, ey + 0.38, ez, '#585550'));
  parts.push(K.slab(-0.34, 0.34, ey + 0.05, ey + 0.62, ez + 0.4, ez + 0.47, '#1c1c1b'));      // radiator
  for (let k = 0; k < 4; k++) parts.push(K.slab(-0.31, 0.31, ey + 0.1 + k * 0.13, ey + 0.12 + k * 0.13, ez + 0.47, ez + 0.48, '#6e6c66'));
  for (const sd of [1, -1]) parts.push(K.beam([sd * 0.42, ey + 0.35, ez - 0.1], [sd * 0.5, ey + 0.95, ez - 0.25], 0.07, '#6a5f52', K.PART.frame)); // stacks
  parts.push(cyl(K, 0.17, 0.12, 0, ey + 0.52, ez - 0.05, '#2a2a28'));                         // the air cleaner
  // the cage: two hoops, spokes from the hub, a mesh of chords inside, braces down to the gunwales
  const cz = zs + 0.42, R = 1.05, hy = 1.62;
  for (const z of [cz - 0.12, cz + 0.12]) { const ring = new THREE.TorusGeometry(R, 0.04, 6, 28).toNonIndexed(); ring.translate(0, hy, z); parts.push(K.tag(ring, '#8f8e88', K.PART.frame)); }
  const ring2 = new THREE.TorusGeometry(R * 0.55, 0.022, 4, 22).toNonIndexed(); ring2.translate(0, hy, cz + 0.12); parts.push(K.tag(ring2, '#7d7c76', K.PART.frame));
  for (let k = -4; k <= 4; k++) { if (!k) continue; const x = k * 0.22, hh = Math.sqrt(Math.max(0, R * R - x * x)) - 0.02; parts.push(K.beam([x, hy - hh, cz + 0.13], [x, hy + hh, cz + 0.13], 0.018, '#6e6d68', K.PART.frame)); parts.push(K.beam([-hh, hy + x, cz + 0.13], [hh, hy + x, cz + 0.13], 0.018, '#6e6d68', K.PART.frame)); }
  for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; parts.push(K.beam([0, hy, cz - 0.12], [Math.cos(a) * R, hy + Math.sin(a) * R, cz - 0.12], 0.025, '#7d7c76', K.PART.frame)); }
  for (const sd of [1, -1]) { parts.push(K.beam([sd * R * 0.7, hy - R * 0.7, cz], [sd * (B - 0.25), 0.84, cz + 0.45], 0.06, '#5d5c57')); parts.push(K.beam([sd * R * 0.95, hy + 0.2, cz], [sd * 0.4, ey + 0.4, ez], 0.05, '#5d5c57')); }
  // the prop: a hub and two long blades (a wood blade, its tips painted), pitched
  parts.push(cyl(K, 0.11, 0.24, 0, hy, cz + 0.02, '#1d1c1a', K.PART.frame, 'z'));
  for (const a of [0.35, 0.35 + Math.PI]) {
    const bl = new THREE.BoxGeometry(0.17, R * 0.92, 0.035).toNonIndexed().rotateY(0.32).translate(0, R * 0.46, 0).rotateZ(a).translate(0, hy, cz + 0.02);
    parts.push(K.tag(bl, '#5a4128', K.PART.frame));
    const tip = new THREE.BoxGeometry(0.175, 0.12, 0.04).toNonIndexed().rotateY(0.32).translate(0, R * 0.86, 0).rotateZ(a).translate(0, hy, cz + 0.02);
    parts.push(K.tag(tip, '#c9a43a', K.PART.frame));
  }
  // twin rudders behind the cage on a tie bar
  for (const x of [0.32, -0.32]) { parts.push(K.slab(x - 0.015, x + 0.015, 1.05, 2.25, zs - 0.12, zs + 0.18, '#4a4944', K.PART.bumperR)); }
  parts.push(K.beam([-0.36, 1.2, zs - 0.05], [0.36, 1.2, zs - 0.05], 0.03, '#2b2a27', K.PART.bumperR));
  // a push pole and a gas can
  parts.push(K.beam([B - 0.12, 0.92, zs + 0.6], [B - 0.16, 0.92, L / 2 - 0.6], 0.04, '#8b7350', K.PART.frame));
  parts.push(K.coloredBox(0.22, 0.28, 0.32, -0.75, 0.81, -1.3, '#9a2a16'));
  for (const z of [0.4, 0.9, 1.35]) parts.push(K.slab(-0.85, 0.85, 0.67, 0.685, z - 0.18, z + 0.18, '#4b4a43')); // tread plates
  parts.push(K.slab(0.62, 1.1, 0.67, 1.07, -1.05, -0.62, '#d9d2c2')); parts.push(K.slab(0.6, 1.12, 1.07, 1.11, -1.07, -0.6, '#3e6f8a')); // the cooler, its lid
}

// ---- the waterbike ---------------------------------------------------------------------------------------------------
// A deep-V sit-down hull, decked over: the nose cowl over the engine, the handlebar pod, a stepped saddle, footwells each
// side of it, the pump's nozzle at the stern, rub strakes, a faded race stripe.
function waterbike(parts, s, paint, K) {
  const L = s.len, B = s.wid / 2;
  const { geo, S } = loft(K, {
    L, n: 14, t: 0.04, fy: 0.42, open: [0.2, 0.58], gun: '#1d1d1c', deck: paint,
    W: { base: new THREE.Color(paint), bottom: new THREE.Color('#e2ded2'), line: 0.12, sheer: 0.55, boot: new THREE.Color('#d8d2c2'), rust: 0.15, seed: 11 },
    prof(u, o) {
      const bow = sat((u - 0.55) / 0.45), st = sat((0.12 - u) / 0.12);
      o.hw = B * (1 - 0.95 * bow * bow) * (1 - 0.1 * st); o.cw = o.hw * 0.72;
      o.ky = 0.0 + 0.32 * bow * bow * bow; o.cy = o.ky + 0.13 * (1 - bow * 0.5); o.sy = 0.54 + 0.12 * bow;
    },
  });
  parts.push(geo);
  rubRail(parts, K, S, '#1f1f1e', 0.12);
  // the nose cowl (a rounded hood over the engine, sloping to the bow) and the handlebar pod
  parts.push(K.coloredBox(0.78, 0.22, 0.9, 0, 0.66, 0.68, paint, K.PART.hood, 0.12));
  parts.push(K.coloredBox(0.5, 0.14, 0.42, 0, 0.82, 0.32, '#2a2928', K.PART.body, -0.25));
  parts.push(K.slab(-0.18, 0.18, 0.86, 0.93, 0.22, 0.4, '#1c1c1b'));   // the gauge
  parts.push(K.slab(-0.12, 0.12, 0.93, 0.95, 0.26, 0.36, '#6f8a86'));  // its glass
  parts.push(K.beam([-0.38, 0.98, 0.3], [0.38, 0.98, 0.3], 0.045, '#8a8580', K.PART.frame));
  for (const sd of [1, -1]) parts.push(K.coloredBox(0.1, 0.07, 0.07, sd * 0.39, 0.98, 0.3, '#151514', K.PART.frame)); // grips
  parts.push(K.beam([0, 0.8, 0.3], [0, 0.98, 0.3], 0.06, '#2a2a28', K.PART.frame));
  // the stepped saddle, its strap
  parts.push(K.coloredBox(0.42, 0.24, 0.85, 0, 0.68, -0.15, '#1d1b19'));
  parts.push(K.coloredBox(0.4, 0.2, 0.42, 0, 0.74, -0.68, '#1d1b19'));
  parts.push(K.slab(-0.215, 0.215, 0.79, 0.81, -0.32, -0.26, '#3a3734'));
  // the rear deck, a grab handle, the pump nozzle, a stripe down each side
  parts.push(K.slab(-0.42, 0.42, 0.48, 0.56, -L / 2 + 0.06, -0.88, '#2f2f2c', K.PART.bumperR));
  parts.push(K.beam([-0.15, 0.62, -L / 2 + 0.22], [0.15, 0.62, -L / 2 + 0.22], 0.04, '#8a8580', K.PART.frame));
  parts.push(cyl(K, 0.08, 0.16, 0, 0.16, -L / 2 - 0.02, '#3a3936', K.PART.bumperR, 'z'));
  for (const sd of [1, -1]) parts.push(K.slab(sd * (B * 0.98), sd * (B * 0.98 + 0.012), 0.42, 0.47, -0.9, 0.95, '#c9a43a', K.PART.body));
}

// ---- the gunboat -------------------------------------------------------------------------------------------------------
// A deep-V work boat taken by raiders: a wheelhouse under the greenhouse (vehiclebodies GREENHOUSE.gunboat), a foredeck with
// a pintle gun behind a shield in a ring of sandbags, plate welded over the topsides, twin outboards on the transom, fuel
// drums and a lockbox in the aft cockpit (data/decks.js gunboatDeck: y 0.7, z -3.4..-0.62), tyre fenders, a mast.
function gunboat(parts, s, paint, K) {
  const L = s.len, B = s.wid / 2, G = K.GREENHOUSE.gunboat;
  const { geo, S } = loft(K, {
    L, n: 18, t: 0.07, fy: 0.7, open: [0.02, 0.46], gun: '#2b2925', deck: '#3a342b',
    W: { base: new THREE.Color('#34412e'), bottom: new THREE.Color('#5a2a1c'), line: 0.32, sheer: 1.16, boot: new THREE.Color('#bdb59e'), rust: 0.55, seed: 21 },
    prof(u, o) {
      const bow = sat((u - 0.6) / 0.4);
      o.hw = B * (0.92 + 0.08 * Math.sin(u * Math.PI * 0.9)) * (1 - 0.97 * bow * bow); o.cw = o.hw * 0.74;
      o.ky = -0.1 + 0.55 * bow * bow * bow; o.cy = o.ky + 0.34 * (1 - 0.4 * bow); o.sy = 1.15 + 0.38 * bow * bow;
    },
  });
  parts.push(geo);
  rubRail(parts, K, S, '#23211e', 0.07);
  // plate welded over the topsides (darker panels, rivet rows)
  for (const sd of [1, -1]) for (const [z0, z1] of [[-2.9, -1.7], [-1.5, -0.3], [-0.1, 1.1]]) {
    const a = sheerAt(S, z0), b = sheerAt(S, z1);
    parts.push(K.slab(sd * (Math.max(a.hw, b.hw) + 0.01), sd * (Math.max(a.hw, b.hw) + 0.045), 0.5, Math.min(a.sy, b.sy) - 0.08, z0, z1, '#4b4a42'));
    for (let z = z0 + 0.1; z < z1; z += 0.22) parts.push(K.slab(sd * (Math.max(a.hw, b.hw) + 0.045), sd * (Math.max(a.hw, b.hw) + 0.06), Math.min(a.sy, b.sy) - 0.16, Math.min(a.sy, b.sy) - 0.12, z, z + 0.04, '#77746a'));
  }
  // the wheelhouse: walls to the belt, the greenhouse, a roof rack with a spotlight and a whip aerial
  parts.push(K.slab(-G.wB / 2, G.wB / 2, 0.7, G.yB, G.zC, G.zA, '#4a3c2c'));
  parts.push(K.slab(-G.wB / 2 - 0.01, G.wB / 2 + 0.01, 1.18, 1.26, G.zC, G.zA, '#2c2620'));
  K.greenhouse(parts, G, '#4a3c2c', '#3b3024');
  parts.push(K.slab(-0.7, 0.7, G.yR + 0.07, G.yR + 0.12, G.roofR + 0.15, G.roofF - 0.15, '#22201d'));
  parts.push(cyl(K, 0.12, 0.2, 0.45, G.yR + 0.26, G.roofF - 0.25, '#a7a39b', K.PART.frame, 'z'));
  parts.push(K.beam([-0.6, G.yR + 0.1, G.roofR + 0.2], [-0.62, G.yR + 1.9, G.roofR + 0.1], 0.03, '#1a1a19', K.PART.frame));
  parts.push(K.slab(-0.62, 0.62, 0.7, 1.15, G.zC - 0.02, G.zC + 0.02, '#3d3226')); // a door frame to the cockpit
  // the foredeck gun: sandbags round a pintle, the shield, the gun, ammo cans
  const gz = L / 2 - 1.55, top = sheerAt(S, gz).sy;
  for (let k = 0; k < 9; k++) { const a = -Math.PI * 0.85 + k * (Math.PI * 1.7 / 8), r = 0.62; parts.push(K.coloredBox(0.36, 0.18, 0.22, Math.cos(a) * r, top + 0.09, gz + Math.sin(a) * r * 0.9 - 0.1, k % 2 ? '#8a7a58' : '#7d6e4f')); }
  parts.push(cyl(K, 0.07, 0.5, 0, top + 0.25, gz, '#2a2826', K.PART.frame));
  parts.push(K.slab(-0.42, 0.42, top + 0.42, top + 0.9, gz + 0.32, gz + 0.36, '#4a4a42', K.PART.frame));
  parts.push(K.slab(-0.07, 0.07, top + 0.52, top + 0.66, gz - 0.35, gz + 0.3, '#2b2a28', K.PART.frame));
  parts.push(K.beam([0, top + 0.6, gz + 0.3], [0, top + 0.62, gz + 1.25], 0.07, '#4f4c47', K.PART.frame));
  for (const sd of [1, -1]) parts.push(K.slab(sd * 0.18, sd * 0.38, top, top + 0.2, gz - 0.55, gz - 0.35, '#4a5236'));
  // the aft cockpit: drums (data/decks.js drums -0.4..0.4, -3.3..-2.5), the lockbox, the transom's twin outboards
  for (const x of [-0.22, 0.22]) parts.push(cyl(K, 0.21, 0.62, x, 1.0, -2.9, x > 0 ? '#7a3a1c' : '#2f4a3a'));
  parts.push(K.slab(0.78, 1.28, 0.7, 1.15, -1.38, -0.78, '#4a4a3e'));
  for (const x of [-0.65, 0.65]) outboard(parts, K, x, -L / 2 - 0.02, 1.0, 1.25, '#1f1f1d');
  for (const sd of [1, -1]) for (const z of [-2.4, -0.9, 0.6]) fender(parts, K, sd * (sheerAt(S, z).hw + 0.1), 0.72, z);
  for (const sd of [1, -1]) cleat(parts, K, sd * (B - 0.25), 1.17, -3.2);
}

// ---- the fishing skiff ----------------------------------------------------------------------------------------------------
// A planing V skiff: a sharp raked bow, two thwarts, a little side console with the wheel, a tiller outboard, a fish box,
// a coil of net, rod holders, oars along the side. Faded paint over primer.
function skiff(parts, s, paint, K) {
  const L = s.len, B = s.wid / 2;
  const { geo, S } = loft(K, {
    L, n: 16, t: 0.045, fy: 0.42, open: [0.05, 0.8], gun: '#8a7454', deck: '#6a5a44',
    W: { base: new THREE.Color(paint), bottom: new THREE.Color('#5d3a28'), line: 0.2, sheer: 0.82, boot: new THREE.Color('#e4dccb'), rust: 0.55, seed: 41 },
    prof(u, o) {
      const bow = sat((u - 0.62) / 0.38);
      o.hw = B * (0.86 + 0.14 * Math.sin(u * Math.PI * 0.95)) * (1 - 0.98 * bow * bow); o.cw = o.hw * 0.66;
      o.ky = 0.02 + 0.5 * bow * bow * bow; o.cy = o.ky + 0.2 * (1 - 0.5 * bow); o.sy = 0.78 + 0.26 * bow * bow;
    },
  });
  parts.push(geo);
  rubRail(parts, K, S, '#4a3a28', 0.03);
  for (const z of [0.55, -0.55]) { const w = sheerAt(S, z).hw - 0.06; parts.push(K.slab(-w, w, 0.62, 0.68, z - 0.16, z + 0.16, '#8a7454')); }
  parts.push(K.slab(-0.55, -0.15, 0.42, 1.05, -1.25, -0.9, '#d8d0bf')); // the side console (on the right, the wheel facing aft)
  parts.push(K.slab(-0.55, -0.15, 1.05, 1.12, -1.3, -0.85, '#3a3834'));
  const sw = new THREE.TorusGeometry(0.13, 0.02, 5, 12).toNonIndexed().rotateX(0.5).translate(-0.35, 1.08, -1.32); parts.push(K.tag(sw, '#1d1b19', K.PART.body));
  parts.push(K.slab(-0.48, -0.22, 1.12, 1.22, -0.92, -0.86, '#6f8a86')); // a scratched windscreen
  outboard(parts, K, 0, -L / 2 - 0.02, 0.75, 0.85, '#3d3b35', true);
  parts.push(K.slab(0.25, 0.75, 0.42, 0.72, -1.95, -1.45, '#c9c2b0')); // the fish box
  parts.push(K.slab(0.24, 0.76, 0.72, 0.75, -1.96, -1.44, '#9d978a'));
  for (let k = 0; k < 5; k++) parts.push(K.coloredBox(0.5 - k * 0.07, 0.07, 0.5 - k * 0.07, 0.15, 0.46 + k * 0.05, 1.25, k % 2 ? '#6b7a5a' : '#5d6b4d')); // a coil of net in the bow
  for (const sd of [1, -1]) parts.push(K.beam([sd * (B - 0.15), 0.74, -1.6], [sd * (B - 0.12), 0.74, 1.0], 0.045, '#9c8058', K.PART.frame)); // oars
  for (const x of [0.65, -0.65]) parts.push(K.beam([x, 0.8, -2.1], [x * 1.05, 1.9, -2.6], 0.02, '#26231f', K.PART.frame)); // rods
  for (const sd of [1, -1]) cleat(parts, K, sd * (B - 0.2), 0.8, -2.2, 1);
}

// ---- the pontoon barge ------------------------------------------------------------------------------------------------------
// Two steel pontoon tubes with nose cones, cross-members, a plank deck, rails with a bow gate, a bimini canopy on its
// frame, benches, a helm console, an outboard. A ferry for the backwaters.
function barge(parts, s, paint, K) {
  const L = s.len, W2 = s.wid / 2, P = K.PART;
  const tubeR = 0.34, tx = W2 - 0.52;
  for (const sd of [1, -1]) {
    const g = new THREE.CylinderGeometry(tubeR, tubeR, L - 1.1, 14).toNonIndexed().rotateX(Math.PI / 2).translate(sd * tx, 0.2, -0.3);
    const W = { base: new THREE.Color('#8b8d86'), bottom: new THREE.Color('#4a3a2c'), line: 0.08, sheer: 0.54, boot: null, rust: 0.95, seed: 51 + sd };
    const p = g.attributes.position, cols = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) { wear(_c, W, p.getX(i), p.getY(i), p.getZ(i)); cols[i * 3] = _c.r; cols[i * 3 + 1] = _c.g; cols[i * 3 + 2] = _c.b; }
    K.tag(g, '#8b8d86', P.body); g.setAttribute('color', new THREE.BufferAttribute(cols, 3)); parts.push(g);
    const cone = new THREE.ConeGeometry(tubeR, 0.95, 14).toNonIndexed().rotateX(Math.PI / 2).translate(sd * tx, 0.2, L / 2 - 0.12 - 0.48); parts.push(K.tag(cone, '#7d7f78', P.bumperF));
    const cap = new THREE.CylinderGeometry(tubeR * 0.98, tubeR * 0.98, 0.04, 14).toNonIndexed().rotateX(Math.PI / 2).translate(sd * tx, 0.2, -L / 2 + 0.25); parts.push(K.tag(cap, '#5d5f59', P.bumperR));
  }
  for (let z = -L / 2 + 0.6; z < L / 2 - 0.8; z += 0.9) parts.push(K.slab(-W2 + 0.2, W2 - 0.2, 0.48, 0.54, z - 0.05, z + 0.05, '#3b3a35', P.frame));
  // the deck: planks, a little uneven and weathered
  const nPl = 12, pw = (2 * W2) / nPl;
  for (let k = 0; k < nPl; k++) parts.push(K.slab(-W2 + k * pw + 0.01, -W2 + (k + 1) * pw - 0.01, 0.54, 0.62 - (k % 3 === 1 ? 0.01 : 0), -L / 2 + 0.25, L / 2 - 0.35, ['#8a6f4e', '#7c6446', '#957a56'][k % 3]));
  // rails: posts, a top rail and a mid rail round three sides, a gate at the bow
  const rh = 1.5, posts = [];
  for (let z = -L / 2 + 0.4; z <= L / 2 - 0.4; z += 1.15) for (const sd of [1, -1]) posts.push([sd * (W2 - 0.08), z]);
  for (const x of [-W2 + 0.4, -0.4, 0.4, W2 - 0.4]) posts.push([x, -L / 2 + 0.32]);
  for (const [x, z] of posts) parts.push(K.beam([x, 0.62, z], [x, rh, z], 0.04, '#9a9790', P.frame));
  for (const sd of [1, -1]) for (const y of [rh, 1.05]) parts.push(K.beam([sd * (W2 - 0.08), y, -L / 2 + 0.32], [sd * (W2 - 0.08), y, L / 2 - 0.4], 0.035, '#a7a39b', P.frame));
  for (const y of [rh, 1.05]) parts.push(K.beam([-W2 + 0.08, y, -L / 2 + 0.32], [W2 - 0.08, y, -L / 2 + 0.32], 0.035, '#a7a39b', P.frame));
  for (const sd of [1, -1]) parts.push(K.beam([sd * (W2 - 0.08), rh, L / 2 - 0.4], [sd * 0.55, rh, L / 2 - 0.4], 0.035, '#a7a39b', P.frame));
  // the bimini: four uprights, a canvas top (faded olive), its stitched edge
  for (const [x, z] of [[-W2 + 0.2, -1.6], [W2 - 0.2, -1.6], [-W2 + 0.2, 1.2], [W2 - 0.2, 1.2]]) parts.push(K.beam([x, 0.62, z], [x * 0.96, 2.3, z], 0.035, '#b4b0a6', P.frame));
  parts.push(K.slab(-W2 + 0.15, W2 - 0.15, 2.3, 2.34, -1.75, 1.35, '#6f7458'));
  parts.push(K.slab(-W2 + 0.12, W2 - 0.12, 2.25, 2.3, -1.78, -1.7, '#4e5240'));
  // benches, the helm, crates and a drum, the outboard
  for (const sd of [1, -1]) { parts.push(K.slab(sd * (W2 - 0.65), sd * (W2 - 0.15), 0.62, 0.98, -0.8, 1.0, '#6a5a44')); parts.push(K.slab(sd * (W2 - 0.25), sd * (W2 - 0.15), 0.98, 1.35, -0.8, 1.0, '#6a5a44')); }
  parts.push(K.slab(0.35, 0.95, 0.62, 1.25, -2.4, -2.0, '#c9c2b0')); parts.push(K.slab(0.33, 0.97, 1.25, 1.3, -2.45, -1.95, '#3a3834'));
  const sw = new THREE.TorusGeometry(0.15, 0.02, 5, 12).toNonIndexed().rotateX(0.5).translate(0.65, 1.3, -2.45); parts.push(K.tag(sw, '#1d1b19', P.body));
  parts.push(K.slab(-0.9, -0.3, 0.62, 1.12, 2.1, 2.7, '#7a6446')); parts.push(K.slab(-0.85, -0.35, 1.12, 1.5, 2.15, 2.6, '#6e583c'));
  parts.push(cyl(K, 0.25, 0.8, -0.95, 1.02, -2.6, '#3e5038'));
  outboard(parts, K, 0, -L / 2 + 0.22, 0.62, 1.2, '#2c2c2a');
}

// ---- the boat trailer ---------------------------------------------------------------------------------------------------------
// Two frame rails, an A-frame tongue to the coupler, a single axle under fenders, two carpeted bunks the hull sits on, keel
// rollers, the winch post with its drum and strap, a light bar on the tail, safety chains.
function boattrailer(parts, s, paint, K) {
  const L = s.len, W2 = s.wid / 2, P = K.PART, steel = '#4c4f4a', galv = '#8f928c';
  const tz = L / 2, rz = -L / 2 + 0.1;
  for (const sd of [1, -1]) parts.push(K.slab(sd * (W2 - 0.42), sd * (W2 - 0.3), 0.36, 0.5, rz, 1.4, steel, P.frame));
  for (const z of [rz + 0.05, -0.6, 0.6, 1.35]) parts.push(K.slab(-W2 + 0.3, W2 - 0.3, 0.38, 0.48, z - 0.05, z + 0.05, steel, P.frame));
  for (const sd of [1, -1]) parts.push(K.beam([sd * (W2 - 0.36), 0.43, 1.35], [0, 0.43, tz - 0.25], 0.11, steel, P.frame));
  parts.push(K.beam([0, 0.43, 1.0], [0, 0.43, tz - 0.2], 0.12, steel, P.frame)); // the tongue
  parts.push(K.slab(-0.09, 0.09, 0.36, 0.52, tz - 0.25, tz, galv, P.bumperF)); // the coupler
  parts.push(cyl(K, 0.035, 0.32, 0.18, 0.22, tz - 0.6, '#2a2a28', P.frame)); // the jack
  for (const sd of [1, -1]) parts.push(K.beam([sd * 0.05, 0.4, tz - 0.1], [sd * 0.18, 0.18, tz - 0.05], 0.025, '#6a6a64', P.frame)); // chains
  // the axle, wheels, fenders
  parts.push(K.beam([-W2 + 0.2, 0.33, -0.6], [W2 - 0.2, 0.33, -0.6], 0.08, '#2e2e2c', P.frame));
  K.axle(parts, -0.6, 0.33, 0.22, W2 - 0.15, false);
  for (const sd of [1, -1]) { parts.push(K.slab(sd * (W2 - 0.27), sd * (W2 + 0.0), 0.72, 0.76, -1.05, -0.15, galv)); parts.push(K.slab(sd * (W2 - 0.02), sd * (W2 + 0.0), 0.5, 0.74, -1.05, -0.15, galv)); }
  // bunks (carpet over timber) and keel rollers
  for (const sd of [1, -1]) { parts.push(K.slab(sd * 0.32, sd * 0.5, 0.48, 0.6, rz + 0.1, 1.2, '#3a4a3a')); for (const z of [rz + 0.4, 0.4]) parts.push(K.beam([sd * 0.41, 0.48, z], [sd * 0.41, 0.4, z], 0.05, steel, P.frame)); }
  for (const z of [rz + 0.25, 0.9]) parts.push(cyl(K, 0.07, 0.24, 0, 0.5, z, '#b04a1c', P.frame, 'x'));
  // the winch post: upright, a brace, the drum, the strap and its hook, a bow stop
  parts.push(K.beam([0, 0.45, 1.75], [0, 1.15, 1.7], 0.09, steel, P.frame));
  parts.push(K.beam([0, 0.45, 2.15], [0, 1.0, 1.72], 0.07, steel, P.frame));
  parts.push(cyl(K, 0.08, 0.2, 0, 1.0, 1.82, galv, P.frame, 'x'));
  parts.push(K.beam([0.14, 1.0, 1.82], [0.24, 1.08, 1.9], 0.025, '#1b1b1a', P.frame)); // the crank
  parts.push(K.slab(-0.13, 0.13, 0.9, 1.08, 1.6, 1.68, '#1b1b1a')); // the bow stop
  parts.push(K.beam([0, 1.0, 1.74], [0, 0.95, 1.2], 0.03, '#2a5a8a', P.frame)); // the strap (blue webbing)
  // the light bar
  parts.push(K.slab(-W2 + 0.1, W2 - 0.1, 0.5, 0.56, rz - 0.06, rz, '#2a2a28', P.bumperR));
}

// ---- the wrecker ------------------------------------------------------------------------------------------------------------------
// Added over the pickup's body (vehiclebodies carBody, s.look 'wrecker'): an A-frame mast in the bed, the boom back over
// the tail with its sheave, cable and hook, the wheel-lift underneath behind the bumper, a heavy front bumper with the
// winch drum, toolboxes along the bed rails, an amber beacon bar, coiled chain.
function wrecker(parts, s, paint, K) {
  const L = s.len, hw = s.wid / 2, P = K.PART, G = K.GREENHOUSE.pickup, steel = '#2e2c29', boomC = '#a8892a';
  const mz = G.zC - 0.45, tail = -L / 2;
  for (const sd of [1, -1]) parts.push(K.beam([sd * (hw - 0.25), 0.95, mz], [sd * 0.18, 2.35, mz - 0.25], 0.12, boomC, P.frame));
  parts.push(K.beam([-0.2, 2.35, mz - 0.25], [0.2, 2.35, mz - 0.25], 0.12, boomC, P.frame));
  parts.push(K.beam([0, 2.3, mz - 0.2], [0, 1.85, tail - 0.25], 0.16, boomC, P.frame));         // the boom
  parts.push(K.beam([0, 1.0, mz - 0.1], [0, 2.05, mz - 0.9], 0.11, '#3a3631', P.frame));         // the ram
  parts.push(cyl(K, 0.13, 0.12, 0, 1.85, tail - 0.25, '#1e1d1b', P.frame, 'x'));                 // the sheave
  parts.push(K.beam([0, 1.75, tail - 0.3], [0, 0.95, tail - 0.32], 0.025, '#8f8a80', P.frame));  // the cable
  parts.push(K.slab(-0.06, 0.06, 0.82, 0.95, tail - 0.38, tail - 0.26, '#5a2a16', P.frame));      // the hook
  // the wheel-lift: a crossbar on a stinger behind the bumper, two L-arms
  parts.push(K.beam([0, 0.4, tail + 0.4], [0, 0.32, tail - 0.4], 0.12, steel, P.bumperR));
  parts.push(K.slab(-0.9, 0.9, 0.26, 0.38, tail - 0.5, tail - 0.36, steel, P.bumperR));
  for (const sd of [1, -1]) parts.push(K.slab(sd * 0.72, sd * 0.84, 0.26, 0.36, tail - 0.85, tail - 0.4, steel, P.bumperR));
  // bed toolboxes, a chain coil, the beacon bar
  for (const sd of [1, -1]) parts.push(K.slab(sd * (hw - 0.08), sd * (hw - 0.48), 0.95, 1.42, tail + 0.25, G.zC - 0.2, '#8a8478'));
  for (let k = 0; k < 4; k++) parts.push(K.coloredBox(0.36 - k * 0.05, 0.05, 0.36 - k * 0.05, 0.45, 1.0 + k * 0.04, tail + 0.75, '#5d5952', P.frame));
  const zc = (G.roofF + G.roofR) / 2, y = G.yR + 0.07;
  parts.push(K.slab(-0.66, 0.66, y, y + 0.1, zc - 0.13, zc + 0.13, '#1e1e1e'));
  for (const x of [-0.45, 0, 0.45]) parts.push(K.slab(x - 0.14, x + 0.14, y + 0.1, y + 0.18, zc - 0.1, zc + 0.1, '#c27a12'));
  // the heavy front bumper with the winch drum in it
  parts.push(K.slab(-hw - 0.05, hw + 0.05, 0.38, 0.8, L / 2 + 0.02, L / 2 + 0.24, steel, P.bumperF));
  parts.push(cyl(K, 0.12, 0.5, 0, 0.6, L / 2 + 0.2, '#3d3b37', P.bumperF, 'x'));
  parts.push(K.slab(-0.07, 0.07, 0.52, 0.66, L / 2 + 0.24, L / 2 + 0.34, '#5a2a16', P.bumperF));
}

export const HULLS = { airboat, jetski: waterbike, gunboat, skiff, barge, boattrailer };
export const LOOKS = { wrecker };

// Lens anchors for the bases here (vehiclebodies lampAnchors asks first): a bow light, a stern light; the trailer's tail bar.
export function hullLamps(base, s) {
  const L = s.len, W = s.wid;
  if (base === 'airboat') return { head: [[0, 0.98, L / 2 - 0.4]], tail: [[0, 1.0, -L / 2 + 0.1]], beamW: 6, beamL: 26, halo: 1 };
  if (base === 'gunboat') return { head: [[0.45, 2.52, 0.86]], tail: [[0, 1.3, -L / 2 + 0.1]], beamW: 7, beamL: 30, halo: 1.1 };
  if (base === 'jetski') return { head: [[0, 0.74, L / 2 - 0.55]], tail: [], beamW: 5, beamL: 20, halo: 0.7 };
  if (base === 'skiff') return { head: [[0, 1.0, L / 2 - 0.35]], tail: [[0, 1.0, -L / 2 + 0.2]], beamW: 5, beamL: 20, halo: 0.8 };
  if (base === 'barge') return { head: [[-W / 2 + 0.3, 1.55, L / 2 - 0.4], [W / 2 - 0.3, 1.55, L / 2 - 0.4]], tail: [[0, 1.55, -L / 2 + 0.3]], beamW: 7, beamL: 18, halo: 0.9 };
  if (base === 'boattrailer') return { head: [], tail: [[W / 2 - 0.2, 0.53, -L / 2 + 0.04], [-(W / 2 - 0.2), 0.53, -L / 2 + 0.04]], beamW: 2, beamL: 3, halo: 0.4 };
  return null;
}
