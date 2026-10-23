// The Building Lab's plan: one floor of an authored row drawn in ink on drafting paper over the 1 m nav grid - typed rooms
// with their sizes, walls, doorways and door swings, windows, furniture as the ring placed it, stairs (UP/DN), and the
// reachability proof's findings in red. Hit-testing for the editor. Coordinates: the row's own frame (metres).
import { ROOMS } from '../data/floorplans.js';
import { RING } from '../data/ring.js';
import { landings } from '../world/authored.js';
import { wallsOf } from './edit.js';

const T = RING.wall;
const INK = '#2b2219', PAPER = '#efe6d2', AMBER = '#f5b21a', RUST = '#d4492c', RED = '#e0391f';
const TINT = { living: '#efe2c8', kitchen: '#e3d7b5', dining: '#eadcc0', bedroom: '#e8d3c6', bath: '#d9ddd5', hall: '#ddd2bb', floor: '#e2dccd', sales: '#ece2cb', diningroom: '#eadfc5', stock: '#d8d0c0', restroom: '#d9ddd5', office: '#e2dbc9', dkitchen: '#e3d7b5' };
const tint = (type) => TINT[type] ?? (type?.startsWith('corr') ? '#ddd2bb' : /bath|wash|rest/.test(type) ? '#d9ddd5' : /bed|ward|motel/.test(type) ? '#e8d3c6' : '#ebe1ca');

export class Plan2D {
  constructor(canvas) { this.c = canvas; this.g = canvas.getContext('2d'); this.view = { s: 20, ox: 0, oz: 0 }; }
  fit(row, pad = 3.2) {
    const c = this.c, w = c.clientWidth, h = c.clientHeight, W = row.x1 - row.x0 + pad * 2 + (row.walkway ?? 0) * 2, D = row.z1 - row.z0 + pad * 2 + (row.walkway ?? 0) * 2;
    const s = Math.max(4, Math.min(w / W, h / D));
    this.view = { s, ox: w / 2 - ((row.x0 + row.x1) / 2) * s, oz: h / 2 - ((row.z0 + row.z1) / 2) * s };
  }
  toPx(x, z) { return [this.view.ox + x * this.view.s, this.view.oz + z * this.view.s]; }
  toM(px, pz) { return [(px - this.view.ox) / this.view.s, (pz - this.view.oz) / this.view.s]; }
  resize() {
    const c = this.c, dpr = Math.min(2, window.devicePixelRatio || 1), w = c.clientWidth, h = c.clientHeight;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  // st: { row, k, geo, upper (floor k's authored geometry, k > 0), proof, sel, hover, ghost }
  draw(st) {
    this.resize();
    const { row, k } = st, g = this.g, c = this.c, s = this.view.s, P = (x, z) => this.toPx(x, z);
    const W = c.clientWidth, H = c.clientHeight;
    g.fillStyle = '#17130f'; g.fillRect(0, 0, W, H);
    // The nav grid (1 m cells on whole metres: a cell's centre is whole + 0.5) and a 5 m grid.
    const [mx0, mz0] = this.toM(0, 0), [mx1, mz1] = this.toM(W, H);
    g.lineWidth = 1;
    for (let x = Math.floor(mx0); x <= mx1; x++) { const [px] = P(x, 0); g.strokeStyle = x % 5 === 0 ? 'rgba(245,178,26,0.10)' : 'rgba(239,230,210,0.045)'; g.beginPath(); g.moveTo(Math.round(px) + 0.5, 0); g.lineTo(Math.round(px) + 0.5, H); g.stroke(); }
    for (let z = Math.floor(mz0); z <= mz1; z++) { const [, pz] = P(0, z); g.strokeStyle = z % 5 === 0 ? 'rgba(245,178,26,0.10)' : 'rgba(239,230,210,0.045)'; g.beginPath(); g.moveTo(0, Math.round(pz) + 0.5); g.lineTo(W, Math.round(pz) + 0.5); g.stroke(); }
    // The street side.
    const f = row.front, sx = (row.x0 + row.x1) / 2, sz = (row.z0 + row.z1) / 2, off = 2.6 + (row.walkway ?? 0);
    const [lx, lz] = f === 'N' ? P(sx, row.z0 - off) : f === 'S' ? P(sx, row.z1 + off) : f === 'W' ? P(row.x0 - off, sz) : P(row.x1 + off, sz);
    g.save(); g.translate(lx, lz); if (f === 'W' || f === 'E') g.rotate(-Math.PI / 2);
    g.fillStyle = 'rgba(245,178,26,0.55)'; g.font = '600 11px Inter, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('— STREET —', 0, 0); g.restore();
    if (row.walkway > 0 && k === 0) {
      const d = row.walkway, r = f === 'N' ? [row.x0, row.z0 - d - T / 2, row.x1, row.z0 - T / 2] : f === 'S' ? [row.x0, row.z1 + T / 2, row.x1, row.z1 + d + T / 2] : f === 'W' ? [row.x0 - d - T / 2, row.z0, row.x0 - T / 2, row.z1] : [row.x1 + T / 2, row.z0, row.x1 + d + T / 2, row.z1];
      const [a, b] = P(r[0], r[1]), [cc, dd] = P(r[2], r[3]);
      g.fillStyle = 'rgba(200,190,170,0.22)'; g.fillRect(a, b, cc - a, dd - b);
      g.fillStyle = 'rgba(239,230,210,0.5)'; g.font = '500 10px Inter, system-ui'; g.textAlign = 'center';
      const lx2 = f === 'W' || f === 'E' ? (a + cc) / 2 : (a + cc) / 2, lz2 = f === 'N' ? b + 8 : f === 'S' ? dd - 6 : (b + dd) / 2;
      g.fillText('COVERED WALKWAY', lx2, lz2);
    }
    // Paper under the footprint (and only the deck on a mezzanine floor).
    const F = row.floors[k], deck = F.deck;
    const [p0x, p0z] = P(row.x0 - T / 2, row.z0 - T / 2), [p1x, p1z] = P(row.x1 + T / 2, row.z1 + T / 2);
    g.fillStyle = k && deck ? 'rgba(239,230,210,0.10)' : PAPER; g.fillRect(p0x, p0z, p1x - p0x, p1z - p0z);
    if (k && deck) {
      const [a, b] = P(deck.x0, deck.z0), [cc, dd] = P(deck.x1, deck.z1); g.fillStyle = PAPER; g.fillRect(a, b, cc - a, dd - b);
      g.save(); g.beginPath(); g.rect(p0x, p0z, p1x - p0x, p1z - p0z); g.rect(a, dd, cc - a, b - dd); g.clip('evenodd');
      hatch(g, p0x, p0z, p1x - p0x, p1z - p0z, 'rgba(239,230,210,0.12)', 9); g.restore();
      g.fillStyle = 'rgba(239,230,210,0.45)'; g.font = '600 10px Inter, system-ui'; g.textAlign = 'center';
    }
    // Rooms.
    const sels = st.sel?.room !== undefined && st.sel.k === k ? st.sel.room : -1, hov = st.hover?.room !== undefined ? st.hover.room : -1;
    F.rooms.forEach((r, i) => {
      const [a, b] = P(r.x0, r.z0), [cc, dd] = P(r.x1, r.z1);
      g.fillStyle = tint(r.type); g.fillRect(a, b, cc - a, dd - b);
      if (r.type === 'hall' || r.type?.startsWith('corr')) { g.save(); g.beginPath(); g.rect(a, b, cc - a, dd - b); g.clip(); hatch(g, a, b, cc - a, dd - b, 'rgba(43,34,25,0.07)', 7); g.restore(); }
      if (i === hov && i !== sels) { g.fillStyle = 'rgba(245,178,26,0.12)'; g.fillRect(a, b, cc - a, dd - b); }
      if (i === sels) { g.fillStyle = 'rgba(245,178,26,0.2)'; g.fillRect(a, b, cc - a, dd - b); }
    });
    // Furniture as the ring placed it (from above: every part below head height), on this floor.
    const props = k ? st.upper?.props?.map((e) => [e[0], e[1] - F.y, e[2], e[3], e[4], e[5]]) ?? [] : st.geo.props;
    g.lineWidth = 1;
    for (const e of props) {
      if (e[4] < 0.02 || e[1] + e[4] / 2 > 3.0 || e[3] > 6 || e[5] > 6) continue;
      if (e[0] < row.x0 || e[0] > row.x1 || e[2] < row.z0 || e[2] > row.z1) continue;
      const [a, b] = P(e[0] - e[3] / 2, e[2] - e[5] / 2);
      g.fillStyle = 'rgba(43,34,25,0.13)'; g.fillRect(a, b, e[3] * s, e[5] * s);
      g.strokeStyle = 'rgba(43,34,25,0.38)'; g.strokeRect(a + 0.5, b + 0.5, e[3] * s - 1, e[5] * s - 1);
    }
    // Stairs: this floor's flights up, and the ones arriving through it.
    row.flights.forEach((fl, fi) => {
      if (fl.from !== k && fl.from !== k - 1) return;
      const up = fl.from === k, [a, b] = P(fl.x0, fl.z0), [cc, dd] = P(fl.x1, fl.z1);
      const on = st.sel?.flight === fi, hv = st.hover?.flight === fi;
      g.fillStyle = up ? '#cfc4ad' : 'rgba(23,19,15,0.75)'; g.fillRect(a, b, cc - a, dd - b);
      const ax = fl.axis === 'x', n = Math.max(4, Math.round(((ax ? fl.x1 - fl.x0 : fl.z1 - fl.z0)) / 0.25));
      g.strokeStyle = up ? 'rgba(43,34,25,0.55)' : 'rgba(239,230,210,0.25)'; g.lineWidth = 1;
      for (let i = 1; i < n; i++) { const t = i / n; g.beginPath(); if (ax) { const x = a + (cc - a) * t; g.moveTo(x, b); g.lineTo(x, dd); } else { const z = b + (dd - b) * t; g.moveTo(a, z); g.lineTo(cc, z); } g.stroke(); }
      g.strokeStyle = on ? AMBER : hv ? 'rgba(245,178,26,0.7)' : INK; g.lineWidth = on ? 2.5 : 1.5; g.strokeRect(a, b, cc - a, dd - b);
      // The arrow, foot to head, and its landings (dashed).
      const L = landings(fl), [fx, fz] = P(...L.foot), [hx, hz] = P(...L.head);
      g.strokeStyle = up ? RUST : 'rgba(212,73,44,0.6)'; g.fillStyle = g.strokeStyle; g.lineWidth = 2;
      g.beginPath(); g.moveTo(fx, fz); g.lineTo(hx, hz); g.stroke();
      const ang = Math.atan2(hz - fz, hx - fx); g.beginPath(); g.moveTo(hx, hz); g.lineTo(hx - 9 * Math.cos(ang - 0.45), hz - 9 * Math.sin(ang - 0.45)); g.lineTo(hx - 9 * Math.cos(ang + 0.45), hz - 9 * Math.sin(ang + 0.45)); g.closePath(); g.fill();
      g.setLineDash([4, 4]); g.lineWidth = 1; g.strokeStyle = 'rgba(212,73,44,0.55)';
      for (const l of up ? [L.bottom] : [L.top]) { const [la, lb] = P(l.x0, l.z0), [lc, ld] = P(l.x1, l.z1); g.strokeRect(la, lb, lc - la, ld - lb); }
      g.setLineDash([]);
      g.font = '700 10px Inter, system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = up ? INK : 'rgba(239,230,210,0.8)';
      g.fillText(up ? `UP ${fl.from + 1}` : `DN ${fl.from}`, (a + cc) / 2, (b + dd) / 2);
    });
    // Walls: the outside ones, the partitions with their doorways.
    const walls = wallsOf(row, k), selW = st.sel?.wall, hovW = st.hover?.wall;
    const wallBox = (w) => (w.horizontal ? [w.a0, w.fixed - T / 2, w.a1, w.fixed + T / 2] : [w.fixed - T / 2, w.a0, w.fixed + T / 2, w.a1]);
    for (const w of walls) {
      const segs = [];
      const gaps = (w.ext ? (k ? [] : row.floors[0].doors.filter((d) => d.side === w.ref.side).map((d) => ({ at: d.at, w: d.w, door: d }))) : w.gaps.map((q) => ({ ...q }))).sort((p, q) => p.at - q.at);
      let cur = w.a0;
      for (const q of gaps) { segs.push([cur, q.at - q.w / 2]); cur = q.at + q.w / 2; }
      segs.push([cur, w.a1]);
      const isSel = selW && st.sel.k === k && sameRef(selW, w.ref), isHov = hovW && sameRef(hovW, w.ref);
      g.fillStyle = isSel ? AMBER : isHov ? '#6b5434' : INK;
      for (const [a0, a1] of segs) {
        if (a1 - a0 < 0.02) continue;
        const r = w.horizontal ? [a0, w.fixed - T / 2, a1, w.fixed + T / 2] : [w.fixed - T / 2, a0, w.fixed + T / 2, a1];
        const [a, b] = P(r[0], r[1]), [cc, dd] = P(r[2], r[3]); g.fillRect(a, b, cc - a, dd - b);
      }
      // Door swings for the outside doors; a doorway's jambs for the inside ones.
      for (const q of gaps) {
        const doorSel = q.door ? st.sel?.door === row.floors[0].doors.indexOf(q.door) : st.sel?.gap !== undefined && st.sel.k === k && sameRef(st.sel.wallOf, w.ref) && w.gaps.indexOf(w.gaps.find((x) => x.at === q.at)) === st.sel.gap;
        const doorHov = q.door ? st.hover?.door === row.floors[0].doors.indexOf(q.door) : st.hover?.gap !== undefined && sameRef(st.hover.wallOf, w.ref) && w.gaps.findIndex((x) => x.at === q.at) === st.hover.gap;
        const [c0x, c0z] = w.horizontal ? P(q.at - q.w / 2, w.fixed) : P(w.fixed, q.at - q.w / 2);
        g.strokeStyle = doorSel ? AMBER : doorHov ? 'rgba(245,178,26,0.8)' : q.door ? RUST : 'rgba(43,34,25,0.6)'; g.lineWidth = doorSel ? 2.5 : 1.5;
        if (q.door) {
          // The leaf (two for a wide door) drawn open into the building, its swing as a quarter arc from the hinge.
          const inward = (w.ref.side === 'N' || w.ref.side === 'W') ? 1 : -1, leaves = q.w >= 2 ? 2 : 1, R = (q.w / leaves) * s;
          const [c1x, c1z] = w.horizontal ? P(q.at + q.w / 2, w.fixed) : P(w.fixed, q.at + q.w / 2);
          const swing = (hx, hz, ax, az) => { // hinge, and the unit vector along the wall toward the door's middle
            const ox = w.horizontal ? 0 : inward, oz = w.horizontal ? inward : 0;
            const aO = Math.atan2(oz, ox), aC = Math.atan2(az, ax);
            let dl = aC - aO; while (dl <= -Math.PI) dl += 2 * Math.PI; while (dl > Math.PI) dl -= 2 * Math.PI;
            g.beginPath(); g.moveTo(hx, hz); g.lineTo(hx + ox * R, hz + oz * R); g.arc(hx, hz, R, aO, aC, dl < 0); g.stroke();
          };
          if (q.door.kind === 'bay') { g.setLineDash([6, 4]); g.beginPath(); g.moveTo(c0x, c0z); g.lineTo(c1x, c1z); g.stroke(); g.setLineDash([]); }
          else {
            swing(c0x, c0z, w.horizontal ? 1 : 0, w.horizontal ? 0 : 1);
            if (leaves === 2) swing(c1x, c1z, w.horizontal ? -1 : 0, w.horizontal ? 0 : -1);
          }
          const [mx, mz] = w.horizontal ? P(q.at, w.fixed) : P(w.fixed, q.at);
          g.fillStyle = q.door.kind === 'back' ? 'rgba(239,230,210,0.75)' : AMBER; g.font = '700 9px Inter, system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle';
          const out = -inward * 11;
          if (gaps.length <= 3) g.fillText(q.door.kind === 'back' ? 'BACK' : q.door.kind === 'bay' ? 'BAY' : 'FRONT', mx + (w.horizontal ? 0 : out * 1.6), mz + (w.horizontal ? out : 0));
        } else {
          const [c1x, c1z] = w.horizontal ? P(q.at + q.w / 2, w.fixed) : P(w.fixed, q.at + q.w / 2);
          g.beginPath(); g.moveTo(c0x, c0z); g.lineTo(c1x, c1z); g.setLineDash([3, 3]); g.stroke(); g.setLineDash([]);
        }
      }
      // Windows (the street storey's, from the walls the ring built).
      void wallBox;
    }
    if (!k) for (const b of st.geo.boxes) {
      if (!b.holes || b.tag !== 'wall') continue;
      for (let i = 0; i < b.holes.length; i += 2) {
        const h0 = b.holes[i], h1 = b.holes[i + 1];
        const r = b.holeX ? [h0, b.z0, h1, b.z1] : [b.x0, h0, b.x1, h1], [a, bb] = P(r[0], r[1]), [cc, dd] = P(r[2], r[3]);
        g.fillStyle = '#d8e0dc'; g.fillRect(a, bb, cc - a, dd - bb);
        g.strokeStyle = INK; g.lineWidth = 1; g.strokeRect(a + 0.5, bb + 0.5, cc - a - 1, dd - bb - 1);
      }
    }
    // Room labels: type and size (interior, metres).
    F.rooms.forEach((r) => {
      const [a, b] = P(r.x0, r.z0), [cc, dd] = P(r.x1, r.z1), cw = cc - a, ch = dd - b;
      const name = ROOMS[r.type]?.name ?? r.type, size = `${(r.x1 - r.x0).toFixed(1)} × ${(r.z1 - r.z0).toFixed(1)} m`;
      const vert = ch > cw * 1.6 && cw < 70;
      g.save(); g.translate((a + cc) / 2, (b + dd) / 2); if (vert) g.rotate(-Math.PI / 2);
      const room = vert ? ch : cw, fs = Math.max(8, Math.min(13, room / Math.max(6, name.length) * 1.5));
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = 'rgba(239,230,210,0.85)'; g.font = `700 ${fs}px Inter, system-ui`;
      const tw = Math.max(g.measureText(name).width, (g.font = `500 ${fs - 1}px ui-monospace, Menlo, monospace`, g.measureText(size).width));
      g.fillStyle = 'rgba(239,230,210,0.78)'; roundRect(g, -tw / 2 - 5, -fs - 3, tw + 10, fs * 2 + 6, 4); g.fill();
      g.fillStyle = INK; g.font = `700 ${fs}px Inter, system-ui`; g.fillText(name, 0, -fs / 2 + 1);
      g.fillStyle = '#6b5434'; g.font = `500 ${fs - 1}px ui-monospace, Menlo, monospace`; g.fillText(size, 0, fs / 2 + 2);
      g.restore();
    });
    // The proof's findings on this floor, in red.
    const rep = st.proof?.floors?.[k];
    if (rep) {
      g.fillStyle = 'rgba(224,57,31,0.35)';
      for (const [x, z] of rep.cells) { const [a, b] = P(x - 0.5, z - 0.5); g.fillRect(a + 1, b + 1, s - 2, s - 2); }
      rep.rooms.forEach((q) => {
        if (q.reached) return;
        const r = F.rooms[q.i]; if (!r) return;
        const [a, b] = P(r.x0, r.z0), [cc, dd] = P(r.x1, r.z1);
        g.save(); g.beginPath(); g.rect(a, b, cc - a, dd - b); g.clip(); hatch(g, a, b, cc - a, dd - b, 'rgba(224,57,31,0.32)', 8); g.restore();
        g.strokeStyle = RED; g.lineWidth = 3; g.strokeRect(a + 1.5, b + 1.5, cc - a - 3, dd - b - 3);
        g.fillStyle = RED; g.font = '800 10px Inter, system-ui'; g.textAlign = 'center'; g.fillText('UNREACHABLE', (a + cc) / 2, dd - 9);
      });
      for (const d of rep.doors) if (!d.ok) { const [x, z] = P(d.x, d.z); g.strokeStyle = RED; g.lineWidth = 3; g.beginPath(); g.moveTo(x - 7, z - 7); g.lineTo(x + 7, z + 7); g.moveTo(x + 7, z - 7); g.lineTo(x - 7, z + 7); g.stroke(); }
      for (const b of rep.beds) if (!b.ok) { const [x, z] = P(b.x, b.z); g.strokeStyle = RED; g.lineWidth = 2.5; g.beginPath(); g.arc(x, z, 10, 0, Math.PI * 2); g.stroke(); }
    }
    for (const p of st.proof?.problems ?? []) if (p.kind === 'flight' && p.floor === k && p.at) { const [x, z] = P(...p.at); g.strokeStyle = RED; g.lineWidth = 2.5; g.beginPath(); g.arc(x, z, 12, 0, Math.PI * 2); g.stroke(); }
    // Overall dimensions.
    dim(g, P(row.x0, row.z1 + 1.6 + (f === 'S' ? row.walkway ?? 0 : 0)), P(row.x1, row.z1 + 1.6 + (f === 'S' ? row.walkway ?? 0 : 0)), `${(row.x1 - row.x0).toFixed(1)} m`, false);
    dim(g, P(row.x1 + 1.6 + (f === 'E' ? row.walkway ?? 0 : 0), row.z0), P(row.x1 + 1.6 + (f === 'E' ? row.walkway ?? 0 : 0), row.z1), `${(row.z1 - row.z0).toFixed(1)} m`, true);
    // A ghost of the edit being made (a hall's strip, a wall's line).
    if (st.ghost) {
      const q = st.ghost, [a, b] = P(q.x0, q.z0), [cc, dd] = P(q.x1, q.z1);
      g.fillStyle = q.bad ? 'rgba(224,57,31,0.25)' : 'rgba(245,178,26,0.25)'; g.fillRect(a, b, cc - a, dd - b);
      g.strokeStyle = q.bad ? RED : AMBER; g.lineWidth = 1.5; g.setLineDash([5, 4]); g.strokeRect(a, b, cc - a, dd - b); g.setLineDash([]);
      if (q.label) { g.fillStyle = q.bad ? RED : AMBER; g.font = '700 11px Inter, system-ui'; g.textAlign = 'center'; g.fillText(q.label, (a + cc) / 2, Math.min(b, dd) - 8); }
    }
  }
  // What is under (px, pz) on floor k: { door } | { gap, wallOf } | { flight } | { wall } | { room } | null.
  hit(st, px, pz) {
    const { row, k } = st, [x, z] = this.toM(px, pz), tol = Math.max(0.35, 7 / this.view.s);
    if (!k) for (const [i, d] of row.floors[0].doors.entries()) {
      const hz = d.side === 'N' || d.side === 'S', fixed = { N: row.z0, S: row.z1, W: row.x0, E: row.x1 }[d.side];
      if (Math.abs((hz ? z : x) - fixed) < tol + 0.2 && Math.abs((hz ? x : z) - d.at) < d.w / 2) return { door: i };
    }
    const walls = wallsOf(row, k);
    for (const w of walls) {
      if (w.ext) continue;
      const along = w.horizontal ? x : z, across = w.horizontal ? z : x;
      if (Math.abs(across - w.fixed) > tol + 0.2) continue;
      const gi = w.gaps.findIndex((q) => Math.abs(along - q.at) < q.w / 2);
      if (gi >= 0) return { gap: gi, wallOf: w.ref };
    }
    for (const [fi, f] of row.flights.entries()) if (f.from === k && x > f.x0 && x < f.x1 && z > f.z0 && z < f.z1) return { flight: fi };
    let best = null, bd = tol;
    for (const w of walls) {
      const along = w.horizontal ? x : z, across = w.horizontal ? z : x, d = Math.abs(across - w.fixed);
      if (along < w.a0 - 0.1 || along > w.a1 + 0.1 || d > bd) continue;
      bd = d; best = { wall: w.ref, ext: !!w.ext, horizontal: w.horizontal };
    }
    if (best) return best;
    const ri = row.floors[k].rooms.findIndex((r) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1);
    return ri >= 0 ? { room: ri } : null;
  }
}
export const sameRef = (a, b) => !!a && !!b && (a.side ? a.side === b.side : a.i === b.i && b.side === undefined);
function hatch(g, x, y, w, h, col, step) {
  g.strokeStyle = col; g.lineWidth = 1; g.beginPath();
  for (let t = -h; t < w; t += step) { g.moveTo(x + t, y + h); g.lineTo(x + t + h, y); }
  g.stroke();
}
function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function dim(g, [ax, az], [bx, bz], label, vert) {
  g.strokeStyle = 'rgba(239,230,210,0.45)'; g.fillStyle = 'rgba(239,230,210,0.75)'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(ax, az); g.lineTo(bx, bz);
  if (vert) { g.moveTo(ax - 5, az); g.lineTo(ax + 5, az); g.moveTo(bx - 5, bz); g.lineTo(bx + 5, bz); } else { g.moveTo(ax, az - 5); g.lineTo(ax, az + 5); g.moveTo(bx, bz - 5); g.lineTo(bx, bz + 5); }
  g.stroke();
  g.save(); g.translate((ax + bx) / 2, (az + bz) / 2); if (vert) g.rotate(-Math.PI / 2);
  g.font = '600 11px ui-monospace, Menlo, monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const w = g.measureText(label).width + 10; g.fillStyle = '#17130f'; g.fillRect(-w / 2, -8, w, 16); g.fillStyle = 'rgba(239,230,210,0.85)'; g.fillText(label, 0, 0);
  g.restore();
}
