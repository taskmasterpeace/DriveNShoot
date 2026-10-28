// THE BACK LOTS MADE SOLID (docs/design/WEB_BACK_LOTS.md §3): world/citygen/backlots.js's plan -> colliders and items, the
// way build.js makes the buildings (pure; every piece an item in citygen's one instanced mesh, so no draw call is added).
//   alleys   the lane (its row's surface) and the two verges
//   yards    fence panels (a box each: climbed, kicked through, shot through as its material says) with posts; the gates
//            (out.gates: systems/backlots.js hangs them as real leaves); the yard's things
//   docks    the raised platform (a box you climb onto from the bay, cover), bumpers, pallets on it, the apron
//   verges   utility poles, dumpsters, bins
// out.fences: [{ id, yard, fence, box, items: [i...], kicks, broken }] for systems/backlots.js.
import { ALLEYS, FENCES, YARD_PROPS, ALLEY_PROPS } from '../../data/backlots.js';

export function buildBacklots(T, out, box) {
  const vis = (cx, cy, cz, sx, sy, sz, col) => { out.items.push({ cx, cy, cz, sx, sy, sz, col, lv: 0, R: null }); return out.items.length - 1; };
  const solid = (x0, z0, x1, z1, tag, h, col, base = 0) => { const b = box(x0, z0, x1, z1, tag, h + base, base); out.boxes.push(b); vis((x0 + x1) / 2, base + h / 2, (z0 + z1) / 2, x1 - x0, h, z1 - z0, col); return b; };
  const cover = (x, z, nx, nz, h, kind) => out.cover.push(x, z, 0, nx, nz, h, kind);
  // ---- alleys: lane over verges over the block's ground ----
  for (const A of T.alleys ?? []) {
    const R = ALLEYS[A.row];
    vis((A.x0 + A.x1) / 2, 0.045, (A.z0 + A.z1) / 2, A.x1 - A.x0, 0.05, A.z1 - A.z0, R.edge);
    const L = A.lane;
    vis((L.x0 + L.x1) / 2, 0.06, (L.z0 + L.z1) / 2, L.x1 - L.x0, 0.05, L.z1 - L.z0, R.color);
    if (A.row !== 'paved') for (const o of [-0.85, 0.85]) { // two wheel ruts down an unpaved lane (it reads as a lane from above)
      const ax = A.axis === 'x', c = ax ? (L.z0 + L.z1) / 2 + o : (L.x0 + L.x1) / 2 + o;
      vis(ax ? (L.x0 + L.x1) / 2 : c, 0.07, ax ? c : (L.z0 + L.z1) / 2, ax ? L.x1 - L.x0 : 0.45, 0.05, ax ? 0.45 : L.z1 - L.z0, '#6a5a44');
    }
  }
  // ---- docks: apron, platform, bumpers, pallets ----
  for (const D of T.docks ?? []) {
    const a = D.apron;
    vis((a.x0 + a.x1) / 2, 0.065, (a.z0 + a.z1) / 2, a.x1 - a.x0, 0.04, a.z1 - a.z0, '#7a7670');
    const P = D.platform;
    if (!P) continue;
    solid(P.x0, P.z0, P.x1, P.z1, 'bl-dock', P.h, '#8e8a82');
    const ax = D.side === 'N' || D.side === 'S', out1 = D.side === 'S' || D.side === 'E' ? 1 : -1; // outward from the wall
    const face = ax ? (out1 > 0 ? P.z1 : P.z0) : (out1 > 0 ? P.x1 : P.x0);
    for (const t of [0.25, 0.75]) { const u = ax ? P.x0 + (P.x1 - P.x0) * t : P.z0 + (P.z1 - P.z0) * t; vis(ax ? u : face + out1 * 0.08, P.h * 0.55, ax ? face + out1 * 0.08 : u, ax ? 0.5 : 0.16, 0.4, ax ? 0.16 : 0.5, '#26241f'); }
    for (let k = 0; k < 2; k++) { const u = ax ? P.x0 + 1 + k * 1.5 : P.z0 + 1 + k * 1.5, v = ax ? (P.z0 + P.z1) / 2 : (P.x0 + P.x1) / 2; vis(ax ? u : v, P.h + 0.25, ax ? v : u, 1.1, 0.5, 1.1, k ? '#8a6a44' : '#7a5c3a'); }
    cover(ax ? (P.x0 + P.x1) / 2 : face + out1 * 0.7, ax ? face + out1 * 0.7 : (P.z0 + P.z1) / 2, ax ? 0 : out1, ax ? out1 : 0, 1, 6);
  }
  // ---- yards: fences, gates, the yard's things ----
  for (const y of T.yards ?? []) {
    const F = FENCES[y.fence];
    for (const r of y.segs) {
      const horiz = r.x1 - r.x0 >= r.z1 - r.z0, len = horiz ? r.x1 - r.x0 : r.z1 - r.z0;
      const b = box(r.x0, r.z0, r.x1, r.z1, F.tag, F.h, 0); out.boxes.push(b);
      const items = [];
      const ph = y.fence === 'picket' ? F.h * 0.9 : y.fence === 'rail' ? F.h * 0.25 : F.h;
      if (y.fence === 'rail') for (const hh of [0.45, 0.95]) items.push(vis((r.x0 + r.x1) / 2, hh, (r.z0 + r.z1) / 2, r.x1 - r.x0, 0.14, r.z1 - r.z0, F.color));
      else items.push(vis((r.x0 + r.x1) / 2, ph / 2, (r.z0 + r.z1) / 2, r.x1 - r.x0, ph, r.z1 - r.z0, F.color));
      if (F.post) for (let a = 0; a <= len + 0.01; a += Math.max(1, len / Math.max(1, Math.round(len / F.post)))) {
        const x = horiz ? r.x0 + a : (r.x0 + r.x1) / 2, z = horiz ? (r.z0 + r.z1) / 2 : r.z0 + a;
        items.push(vis(x, F.h / 2 + 0.05, z, 0.14, F.h + 0.1, 0.14, F.postColor));
      }
      b.fence = { id: `${y.id}.f${out.fences.length}`, town: T.id, yard: y.id, b: y.b, fence: y.fence, box: b, items, kicks: F.kicks, broken: false, horiz };
      out.fences.push(b.fence);
    }
    for (const g of y.gates) {
      const ax = g.nz !== 0; // the gate spans x when it faces z
      for (const s of [-1, 1]) vis(ax ? g.x + s * (g.w / 2 + 0.05) : g.x, (F.h + 0.2) / 2, ax ? g.z : g.z + s * (g.w / 2 + 0.05), 0.16, F.h + 0.2, 0.16, F.postColor);
      out.gates.push({ id: `${y.id}.${g.kind}${out.gates.filter((q) => q.yard === y.id).length}`, yard: y.id, b: y.b, kind: g.kind, x: g.x, z: g.z, w: g.w, nx: g.nx, nz: g.nz, fence: y.fence });
    }
    for (const p of y.props) {
      const P = YARD_PROPS[p.kind], cx = (p.x0 + p.x1) / 2, cz = (p.z0 + p.z1) / 2, sx = p.x1 - p.x0, sz = p.z1 - p.z0;
      if (P.pen) { // a chain-link run: three sides and a gate gap
        const t = 0.06, wide = sx >= sz;
        out.boxes.push(box(p.x0, p.z0, p.x1, p.z0 + t, P.tag, P.h)); vis(cx, P.h / 2, p.z0, sx, P.h, t, P.col);
        out.boxes.push(box(p.x0, p.z1 - t, p.x1, p.z1, P.tag, P.h)); vis(cx, P.h / 2, p.z1, sx, P.h, t, P.col);
        if (wide) { out.boxes.push(box(p.x0, p.z0, p.x0 + t, p.z1, P.tag, P.h)); vis(p.x0, P.h / 2, cz, t, P.h, sz, P.col); }
        else { out.boxes.push(box(p.x1 - t, p.z0, p.x1, p.z1, P.tag, P.h)); vis(p.x1, P.h / 2, cz, t, P.h, sz, P.col); }
        vis(cx, 0.03, cz, sx - 0.2, 0.02, sz - 0.2, '#7a6a4a'); // trodden dirt
        vis(wide ? p.x1 - 0.7 : cx, 0.45, wide ? cz : p.z0 + 0.7, 0.9, 0.8, 0.9, '#6a5236'); // the kennel
        continue;
      }
      if (P.line) { // two posts and the line; nothing to bump into but the posts' feet
        const al = p.along === 'x', L = al ? sx : sz;
        for (const s of [-1, 1]) vis(al ? cx + s * L / 2 : cx, P.h / 2, al ? cz : cz + s * L / 2, 0.1, P.h, 0.1, '#6a5a48');
        vis(cx, P.h - 0.1, cz, al ? L : 0.03, 0.03, al ? 0.03 : L, P.col);
        for (let k = 0; k < 3; k++) { const o = (k - 1) * L * 0.25; vis(al ? cx + o : cx, P.h - 0.45, al ? cz : cz + o, al ? 0.6 : 0.04, 0.7, al ? 0.04 : 0.6, ['#b8b0a0', '#7a8a9a', '#a07a5a'][k]); }
        continue;
      }
      if (P.bed) { vis(cx, P.h / 2, cz, sx, P.h, sz, '#5a4632'); for (let k = 0; k < 3; k++) { const o = (k - 1) * (Math.max(sx, sz) / 3.2); vis(sx >= sz ? cx + o : cx, P.h + 0.15, sx >= sz ? cz : cz + o, sx >= sz ? 0.4 : sx - 0.4, 0.3, sx >= sz ? sz - 0.4 : 0.4, P.col); } continue; }
      if (p.kind === 'car_blocks') {
        out.boxes.push(box(p.x0, p.z0, p.x1, p.z1, P.tag, P.h));
        vis(cx, 0.75, cz, sx, 0.6, sz, P.col); vis(cx, 1.2, cz, sx * 0.55, 0.45, sz * 0.9, '#2e2c2a');
        for (const [a, c] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) vis(cx + a * sx * 0.32, 0.22, cz + c * sz * 0.32, 0.4, 0.44, 0.4, '#8a847a'); // the blocks
        cover(cx, cz + (sz / 2 + 0.6), 0, 1, 0.5, 8); cover(cx, cz - (sz / 2 + 0.6), 0, -1, 0.5, 8);
        continue;
      }
      solid(p.x0, p.z0, p.x1, p.z1, P.tag, P.h, P.col);
      if (P.roof) vis(cx, P.h + 0.08, cz, sx + 0.2, 0.16, sz + 0.2, P.roof);
    }
  }
  // ---- verges: poles, dumpsters, bins ----
  for (const q of T.backProps ?? []) {
    const P = ALLEY_PROPS[q.kind], al = q.along === 'x', w = al ? P.w : P.d, d = al ? P.d : P.w;
    solid(q.x - w / 2, q.z - d / 2, q.x + w / 2, q.z + d / 2, P.tag, P.h, P.col);
    if (q.kind === 'pole') vis(q.x, P.h - 0.6, q.z, al ? 0.12 : 2.0, 0.12, al ? 2.0 : 0.12, P.cross);
    if (q.kind === 'dumpster') { vis(q.x, P.h + 0.05, q.z, w + 0.05, 0.1, d + 0.05, '#2e4a38'); cover(q.x + (al ? 0 : 1.2), q.z + (al ? 1.2 : 0), al ? 0 : 1, al ? 1 : 0, 0.5, 6); cover(q.x - (al ? 0 : 1.2), q.z - (al ? 1.2 : 0), al ? 0 : -1, al ? -1 : 0, 0.5, 6); }
  }
}
