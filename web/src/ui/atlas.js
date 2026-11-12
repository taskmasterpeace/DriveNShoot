// THE ATLAS: the big map's COUNTRY view (docs/design/WEB_WORLD_MAP.md; WEB_STREAMING.md §3.9 "a continental atlas").
// The whole Divided States on one sheet: the land by biome with hill shading and the sea (painted once, from the usmap
// grids), the state lines with each state's name and who rules it, the rivers, the ten interstates with their nicknames,
// the cities, and a fog over every square kilometre you have never been near. Holdouts, exits and military bases are
// local knowledge (law 6: nobody knows what they weren't told): they show only where the fog is gone.
//
// Frames: the sheet works in usmap metres (the rows' own frame, geo.js); the world is (u - PHX) * K. The fog is a grid
// of 1 km WORLD cells over the usmap box (F13: 390 x 221 = 86,190 cells), uncovered within UNCOVER_M of you, saved
// as runs. Painting costs once per session (the base) and once per open after you moved (the fog); a closed map costs
// one cell test every UNCOVER_S seconds.
import USMAP from '../data/usmap.json';
import { RULERS, ATLAS_BASES, ATLAS_XZ } from '../data/atlas.js';
import { STREAM } from '../data/streaming.js';
import { toWorldX, toWorldZ, toUsmap } from '../world/geo.js';

export const ATLAS = {
  cellW: 1000,        // fog cell, world metres (F13)
  uncoverM: 1600,     // you see this far round you (world metres): the fog lifts in a disc this wide
  uncoverS: 0.5,      // how often the fog is updated while you move (seconds)
  P: 6,               // base sheet pixels per usmap grid cell (150 x 85 cells -> 900 x 510)
  minZoom: 1, maxZoom: 8, // the view's zoom: 1 = the whole country fits the canvas width
  pad: 2500,         // usmap metres the view may run past the painted sheet (Florida's tip is past its last row)
  cw: 1216, ch: 690,  // the COUNTRY canvas (px): the country's own shape, 75 x 42.5 km of usmap
  roadCol: { 1: '#d8b066', 2: '#e3923e', 3: '#d8452e' }, // interstates by danger: sand, orange, red
  riverCol: '#5f9fb8',
  fogCol: 'rgba(16,12,8,0.66)',
  stateLine: 'rgba(240,226,196,0.42)',
};

export const BIOME_RGB = { '.': [22, 44, 54], w: [44, 86, 98], F: [46, 70, 42], f: [104, 100, 64], p: [132, 120, 80], a: [116, 114, 70], d: [158, 124, 84], m: [110, 88, 68], s: [56, 74, 52], u: [100, 92, 84] };

// The usmap state legend names states in full; the rulers (data/atlas.js RULERS, docs/DIVIDED_STATES.md) are keyed by USPS code.
export const USPS = {
  ALABAMA: 'AL', ARIZONA: 'AZ', ARKANSAS: 'AR', CALIFORNIA: 'CA', COLORADO: 'CO', CONNECTICUT: 'CT', DELAWARE: 'DE', FLORIDA: 'FL', GEORGIA: 'GA',
  IDAHO: 'ID', ILLINOIS: 'IL', INDIANA: 'IN', IOWA: 'IA', KANSAS: 'KS', KENTUCKY: 'KY', LOUISIANA: 'LA', MAINE: 'ME', MARYLAND: 'MD',
  MASSACHUSETTS: 'MA', MICHIGAN: 'MI', MINNESOTA: 'MN', MISSISSIPPI: 'MS', MISSOURI: 'MO', MONTANA: 'MT', NEBRASKA: 'NE', NEVADA: 'NV',
  'NEW HAMPSHIRE': 'NH', 'NEW JERSEY': 'NJ', 'NEW MEXICO': 'NM', 'NEW YORK': 'NY', 'NORTH CAROLINA': 'NC', 'NORTH DAKOTA': 'ND', OHIO: 'OH',
  OKLAHOMA: 'OK', OREGON: 'OR', PENNSYLVANIA: 'PA', 'RHODE ISLAND': 'RI', 'SOUTH CAROLINA': 'SC', 'SOUTH DAKOTA': 'SD', TENNESSEE: 'TN',
  TEXAS: 'TX', UTAH: 'UT', VERMONT: 'VT', VIRGINIA: 'VA', WASHINGTON: 'WA', 'WEST VIRGINIA': 'WV', WISCONSIN: 'WI', WYOMING: 'WY',
};
export const rulerOf = (stateName) => RULERS[USPS[stateName]] ?? null;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// A town row's name as the sheet prints it: the city, not its epithet ("CHICAGO, dash, epithet" keeps "CHICAGO"). Some rows came
// through the Godot import with the dash mis-decoded (U+00E2 U+20AC U+201D); both spellings split the same.
export const placeName = (n) => String(n).split(/\s+(?:\u2014|\u00e2\u20ac\u201d|--)\s+/)[0].trim();
const D = USMAP;
const UX0 = D.world_offset[0], UY0 = D.world_offset[1], UW = D.w * D.cell_m, UH = D.h * D.cell_m;

export class Atlas {
  constructor(g) {
    this.g = g;
    // The fog grid: 1 km world cells over the usmap box.
    this.wx0 = toWorldX(UX0); this.wz0 = toWorldZ(UY0);
    this.fw = Math.ceil((UW * STREAM.K) / ATLAS.cellW); this.fh = Math.ceil((UH * STREAM.K) / ATLAS.cellW);
    this.seen = new Uint8Array(this.fw * this.fh);
    this.nSeen = 0;
    this.fogDirty = true;
    this.t = 0; this.last = null;
    this.view = null; // { cx, cy, z } in usmap metres and zoom; null = fit to the player
    this.paintMs = null;
  }

  // ---- the fog ---------------------------------------------------------------------------------------------------
  cellOf(x, z) { const i = Math.floor((x - this.wx0) / ATLAS.cellW), j = Math.floor((z - this.wz0) / ATLAS.cellW); return i < 0 || j < 0 || i >= this.fw || j >= this.fh ? -1 : j * this.fw + i; }
  isSeen(x, z) { const k = this.cellOf(x, z); return k >= 0 && this.seen[k] === 1; }
  // Lift the fog in a disc round (x, z). Returns the cells newly uncovered.
  uncover(x, z, r = ATLAS.uncoverM) {
    const C = ATLAS.cellW, i0 = Math.floor((x - r - this.wx0) / C), i1 = Math.floor((x + r - this.wx0) / C), j0 = Math.floor((z - r - this.wz0) / C), j1 = Math.floor((z + r - this.wz0) / C);
    let n = 0;
    for (let j = Math.max(0, j0); j <= Math.min(this.fh - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(this.fw - 1, i1); i++) {
      const cx = this.wx0 + (i + 0.5) * C, cz = this.wz0 + (j + 0.5) * C, k = j * this.fw + i;
      if (this.seen[k] || Math.hypot(cx - x, cz - z) > r + C * 0.5) continue;
      this.seen[k] = 1; n++;
    }
    if (n) { this.nSeen += n; this.fogDirty = true; if (this.g.time !== undefined) this.g.emit?.('atlasUncover', { cells: n, total: this.nSeen }); }
    return n;
  }
  share() { return this.nSeen / this.seen.length; }
  // Every UNCOVER_S of play, and only after you have moved a fog cell's width since the last lift.
  update(dt) {
    this.t -= dt;
    if (this.t > 0) return;
    this.t = ATLAS.uncoverS;
    const p = this.g.player, x = p.inVehicle?.x ?? p.x, z = p.inVehicle?.z ?? p.z;
    if (this.last && Math.hypot(x - this.last.x, z - this.last.z) < ATLAS.cellW * 0.25) return;
    this.last = { x, z };
    this.uncover(x, z);
  }
  // Saved as runs of uncovered cells [start, length, ...] (a few hundred numbers for a long trip).
  save() {
    const runs = [];
    for (let k = 0; k < this.seen.length; k++) if (this.seen[k]) { const s = k; while (k < this.seen.length && this.seen[k]) k++; runs.push(s, k - s); }
    return { v: 1, w: this.fw, h: this.fh, cellW: ATLAS.cellW, runs };
  }
  load(s) {
    if (!s || s.w !== this.fw || s.h !== this.fh || s.cellW !== ATLAS.cellW) return false; // a different grid: keep what you have
    this.seen.fill(0); this.nSeen = 0;
    for (let i = 0; i + 1 < s.runs.length; i += 2) { this.seen.fill(1, s.runs[i], s.runs[i] + s.runs[i + 1]); this.nSeen += s.runs[i + 1]; }
    this.fogDirty = true; this.last = null;
    return true;
  }

  // ---- the sheet, painted once -----------------------------------------------------------------------------------
  paint() {
    if (this.base) return this.base;
    const t0 = performance.now(), P = ATLAS.P, W = D.w * P, H = D.h * P;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d'), img = g.createImageData(W, H), d = img.data;
    const rel = (i, j) => (D.relief[clamp(j, 0, D.h - 1)].charCodeAt(clamp(i, 0, D.w - 1)) - 48) / 9;
    const relAt = (fx, fy) => { const i = Math.floor(fx), j = Math.floor(fy), tx = fx - i, ty = fy - j; return (rel(i, j) * (1 - tx) + rel(i + 1, j) * tx) * (1 - ty) + (rel(i, j + 1) * (1 - tx) + rel(i + 1, j + 1) * tx) * ty; };
    const bio = (i, j) => D.grid[clamp(j, 0, D.h - 1)][clamp(i, 0, D.w - 1)];
    let seed = 1977;
    const rnd = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return ((seed >>> 0) % 1000) / 1000; };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const fx = x / P - 0.5, fy = y / P - 0.5, i = Math.floor(x / P), j = Math.floor(y / P), b0 = bio(i, j);
      let r = 0, gg = 0, bb = 0;
      if (b0 === '.') [r, gg, bb] = BIOME_RGB['.'];
      else {
        const ii = Math.floor(fx), jj = Math.floor(fy), tx = fx - ii, ty = fy - jj;
        for (let k = 0; k < 4; k++) {
          const bk = bio(ii + (k & 1), jj + (k >> 1)), c = BIOME_RGB[bk === '.' ? b0 : bk] ?? BIOME_RGB.d, w = (k & 1 ? tx : 1 - tx) * (k >> 1 ? ty : 1 - ty);
          r += c[0] * w; gg += c[1] * w; bb += c[2] * w;
        }
      }
      let sh = 1;
      if (b0 !== '.') { const e = 0.6, dx = relAt(fx + e, fy) - relAt(fx - e, fy), dy = relAt(fx, fy + e) - relAt(fx, fy - e); sh = 1 + clamp(-(dx + dy) * 0.9, -0.35, 0.35) + relAt(fx, fy) * 0.08; }
      const n = 0.94 + rnd() * 0.12, o = (y * W + x) * 4;
      d[o] = clamp(r * sh * n, 0, 255); d[o + 1] = clamp(gg * sh * n, 0, 255); d[o + 2] = clamp(bb * sh * n, 0, 255); d[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    // State lines (between land cells of different states) and each state's centre for its label.
    const st = (i, j) => (i < 0 || j < 0 || i >= D.w || j >= D.h ? '.' : D.states_grid[j][i]);
    const segs = [], acc = new Map();
    for (let j = 0; j < D.h; j++) for (let i = 0; i < D.w; i++) {
      const a = st(i, j); if (a === '.') continue;
      const v = acc.get(a) ?? [0, 0, 0]; v[0] += i; v[1] += j; v[2]++; acc.set(a, v);
      const r2 = st(i + 1, j), b2 = st(i, j + 1);
      if (r2 !== a && r2 !== '.') segs.push(i + 1, j, i + 1, j + 1);
      if (b2 !== a && b2 !== '.') segs.push(i, j + 1, i + 1, j + 1);
    }
    this.stateSegs = segs; // in grid cells
    this.states = [...acc].map(([k, [si, sj, n]]) => {
      const name = D.state_legend[k];
      return { key: k, name, code: USPS[name] ?? name.slice(0, 2), ruler: rulerOf(name), n, ux: UX0 + (si / n + 0.5) * D.cell_m, uy: UY0 + (sj / n + 0.5) * D.cell_m };
    });
    this.base = cv;
    this.paintMs = performance.now() - t0;
    return cv;
  }
  fogCanvas() {
    if (this.fog && !this.fogDirty) return this.fog;
    const cv = this.fog ?? document.createElement('canvas'); cv.width = this.fw; cv.height = this.fh;
    const g = cv.getContext('2d'), img = g.createImageData(this.fw, this.fh), d = img.data;
    for (let k = 0; k < this.seen.length; k++) { const o = k * 4; d[o] = 16; d[o + 1] = 12; d[o + 2] = 8; d[o + 3] = this.seen[k] ? 0 : 170; }
    g.putImageData(img, 0, 0);
    this.fog = cv; this.fogDirty = false;
    return cv;
  }

  // ---- the view --------------------------------------------------------------------------------------------------
  // The transform for a W x H canvas: px per usmap metre and the usmap point at the canvas's top-left. Zoom 1 fits the
  // country's width; the centre is held so the sheet never slides off the canvas.
  frame(W = ATLAS.cw, H = ATLAS.ch) {
    if (!this.view) this.view = { cx: UX0 + UW / 2, cy: UY0 + UH / 2, z: 1 }; // the first open: the whole country
    const s = (W / UW) * this.view.z, hx = W / 2 / s, hy = H / 2 / s;
    const keep = (v, lo, span, half) => (half >= span / 2 ? lo + span / 2 : clamp(v, lo + half, lo + span - half));
    // The view may run PAD past the sheet (the sea): Florida's south (Miami, the Keys road) lies past the grid's last row.
    this.view.cx = keep(this.view.cx, UX0 - ATLAS.pad, UW + ATLAS.pad * 2, hx); this.view.cy = keep(this.view.cy, UY0 - ATLAS.pad, UH + ATLAS.pad * 2, hy);
    return { s, x0: this.view.cx - hx, y0: this.view.cy - hy, W, H };
  }
  // Zoom about a canvas point (u, v in 0..1) by a factor.
  zoomAt(u, v, f, W = ATLAS.cw, H = ATLAS.ch) {
    const F = this.frame(W, H), ux = F.x0 + (u * W) / F.s, uy = F.y0 + (v * H) / F.s;
    const z = clamp(this.view.z * f, ATLAS.minZoom, ATLAS.maxZoom), s = (W / UW) * z;
    this.view.z = z; this.view.cx = ux - (u * W - W / 2) / s; this.view.cy = uy - (v * H - H / 2) / s;
    this.frame(W, H);
  }
  pan(dxPx, dyPx, W = ATLAS.cw, H = ATLAS.ch) { const F = this.frame(W, H); this.view.cx -= dxPx / F.s; this.view.cy -= dyPx / F.s; this.frame(W, H); }
  centreOn(x, z, zoom) { const [ux, uy] = toUsmap(x, z); this.view = { cx: ux, cy: uy, z: clamp(zoom ?? this.view?.z ?? 1, ATLAS.minZoom, ATLAS.maxZoom) }; this.frame(); }
  // A canvas point (0..1) to world metres.
  pick(u, v, W = ATLAS.cw, H = ATLAS.ch) { const F = this.frame(W, H), ux = F.x0 + (u * W) / F.s, uy = F.y0 + (v * H) / F.s; return { x: toWorldX(ux), z: toWorldZ(uy), ux, uy }; }
  // World metres to a canvas point (0..1): the inverse of pick.
  toCanvas(x, z, W = ATLAS.cw, H = ATLAS.ch) { const F = this.frame(W, H), [ux, uy] = toUsmap(x, z); return { u: ((ux - F.x0) * F.s) / W, v: ((uy - F.y0) * F.s) / H }; }
  stateAtU(ux, uy) { const i = Math.floor((ux - UX0) / D.cell_m), j = Math.floor((uy - UY0) / D.cell_m); if (i < 0 || j < 0 || i >= D.w || j >= D.h) return null; const k = D.states_grid[j][i]; return k === '.' ? null : D.state_legend[k] ?? null; }
  stateAt(x, z) { const [ux, uy] = toUsmap(x, z); return this.stateAtU(ux, uy); }

  // What the sheet shows: rows other code (the selftest, the agent command) can count without reading pixels.
  marks() {
    this.paint();
    const seenW = (x, z) => this.isSeen(x, z);
    const towns = D.towns.map((t) => { const x = toWorldX(t.pos[0]), z = toWorldZ(t.pos[1]); return { id: t.id, name: placeName(t.name), kind: t.kind, ux: t.pos[0], uy: t.pos[1], x, z, shown: t.kind === 'city' || seenW(x, z) }; });
    const exits = D.exits.map((e) => { const x = toWorldX(e.pos[0]), z = toWorldZ(e.pos[1]); return { id: e.id, n: e.exit_number, name: e.name, road: e.highway_id, ux: e.pos[0], uy: e.pos[1], x, z, shown: seenW(x, z) }; });
    const bases = ATLAS_BASES.map((b) => { const xz = ATLAS_XZ.bases?.[b.id]; if (!xz) return null; const [ux, uy] = toUsmap(xz[0], xz[1]); return { id: b.id, name: b.name, state: b.state, x: xz[0], z: xz[1], ux, uy, shown: seenW(xz[0], xz[1]) }; }).filter(Boolean);
    return { states: this.states, towns, exits, bases, roads: D.interstates.map((r) => ({ id: r.id, nickname: r.nickname || null, danger: r.danger, pts: r.pts })), rivers: D.rivers };
  }

  // ---- drawing ---------------------------------------------------------------------------------------------------
  // c: the big map's 2d context (W x H). Returns the world->canvas transform for the layers drawn on top. Labels are
  // placed in order of importance (states, cities, rulers, interstates, then local places) and one that would cover an
  // earlier one is left off, so the sheet never prints text over text; zooming in makes room for more.
  draw(c, W, H, me = null) {
    this.me = me ? toUsmap(me[0], me[1]) : null; // you: kept clear of shields
    const base = this.paint(), F = this.frame(W, H), s = F.s;
    const U = (ux, uy) => [(ux - F.x0) * s, (uy - F.y0) * s];
    const T = (x, z) => { const [ux, uy] = toUsmap(x, z); return U(ux, uy); };
    const z = this.view.z, line = (pts) => { c.beginPath(); pts.forEach((p, i) => { const [x, y] = U(p[0], p[1]); if (i) c.lineTo(x, y); else c.moveTo(x, y); }); };
    this.placed = []; this.texts = []; // every box text or a mark holds; the text boxes alone
    for (const st of this.states ?? []) delete st.ly;
    c.fillStyle = 'rgb(18,23,24)'; c.fillRect(0, 0, W, H); // past the sheet: the sea under the fog (BIOME_RGB '.' under fogCol)
    c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
    { const [a, b] = U(UX0, UY0); c.drawImage(base, a, b, UW * s, UH * s); }
    // The fog of where you have never been.
    { const [ux, uy] = toUsmap(this.wx0, this.wz0), [a, b] = U(ux, uy); c.drawImage(this.fogCanvas(), a, b, ((this.fw * ATLAS.cellW) / STREAM.K) * s, ((this.fh * ATLAS.cellW) / STREAM.K) * s); }
    c.lineCap = 'round'; c.lineJoin = 'round';
    c.strokeStyle = ATLAS.riverCol; c.lineWidth = 1.4 + z * 0.4;
    for (const r of D.rivers) { line(r.pts); c.stroke(); }
    // State lines.
    c.strokeStyle = ATLAS.stateLine; c.lineWidth = 1; c.setLineDash([4, 3]); c.beginPath();
    const S4 = this.stateSegs, cm = D.cell_m;
    for (let k = 0; k < S4.length; k += 4) { const [a, b] = U(UX0 + S4[k] * cm, UY0 + S4[k + 1] * cm), [e, f] = U(UX0 + S4[k + 2] * cm, UY0 + S4[k + 3] * cm); c.moveTo(a, b); c.lineTo(e, f); }
    c.stroke(); c.setLineDash([]);
    // The reachable world: the dust wall round Phoenix and the streamed regions past it (Florida).
    c.strokeStyle = 'rgba(222,170,100,0.85)'; c.lineWidth = 2; c.setLineDash([6, 5]);
    { const [ox, oy] = T(0, 0); c.beginPath(); c.arc(ox, oy, (STREAM.dustWall / STREAM.K) * s, 0, Math.PI * 2); c.stroke(); }
    for (const R of Object.values(this.g.streamer?.W?.regions ?? {})) { if (!Number.isFinite(R.x0)) continue; const [a, b2] = T(R.x0, R.z0), [e, f] = T(R.x1, R.z1); c.strokeRect(a, b2, e - a, f - b2); }
    c.setLineDash([]);
    // The interstates by danger: a dark casing, then the colour.
    for (const r of D.interstates) { line(r.pts); c.strokeStyle = '#1b1410'; c.lineWidth = 2.6 + z * 0.5; c.stroke(); c.strokeStyle = ATLAS.roadCol[r.danger] ?? ATLAS.roadCol[1]; c.lineWidth = 1.4 + z * 0.4; c.stroke(); }
    const M = this.marks();
    // Marks (no text yet): exits and bases where you have been (law 6), holdouts once seen, cities always.
    for (const e of M.exits) if (e.shown) { const [x, y] = U(e.ux, e.uy); c.fillStyle = '#7fbf6a'; c.fillRect(x - 2, y - 2, 4, 4); }
    for (const b of M.bases) if (b.shown) {
      const [x, y] = U(b.ux, b.uy); c.fillStyle = '#a8b070'; c.strokeStyle = '#1b1410'; c.lineWidth = 1.5; c.beginPath();
      for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? 2.6 : 6.5; c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
      c.closePath(); c.fill(); c.stroke();
    }
    for (const t of M.towns) if (t.shown) {
      const [x, y] = U(t.ux, t.uy), big = t.kind === 'city';
      c.fillStyle = big ? '#f5c542' : '#c9a46a'; c.strokeStyle = '#1b1410'; c.lineWidth = 1.5;
      c.beginPath(); if (big) c.arc(x, y, 3 + z * 0.4, 0, Math.PI * 2); else c.rect(x - 2.5, y - 2.5, 5, 5); c.fill(); c.stroke();
    }
    // Interstate shields at a third of the way along each road (marks too: text placement steps round them).
    const shields = [];
    const cities = M.towns.filter((t) => t.kind === 'city').map((t) => U(t.ux, t.uy));
    for (const r of D.interstates) {
      // A third of the way along, or the first of a few other spots that is clear of every city and of you.
      const me = this.me ? U(...this.me) : [-1e9, -1e9];
      let x = -1, y = -1;
      for (const f of [1 / 3, 0.5, 0.22, 0.66, 0.8]) {
        const p = r.pts[Math.min(r.pts.length - 1, Math.floor(r.pts.length * f))], q = U(p[0], p[1]);
        if (q[0] < 16 || q[1] < 9 || q[0] > W - 16 || q[1] > H - 9) continue;
        if (cities.some((cq) => Math.hypot(cq[0] - q[0], cq[1] - q[1]) < 34) || Math.hypot(me[0] - q[0], me[1] - q[1]) < 30) continue;
        [x, y] = q; break;
      }
      if (x < 0) continue;
      c.fillStyle = '#1b1410'; c.fillRect(x - 15, y - 8, 30, 15); c.fillStyle = ATLAS.roadCol[r.danger] ?? ATLAS.roadCol[1];
      c.font = '700 11px Barlow Condensed'; c.textAlign = 'center'; c.fillText(r.id, x, y + 3.5);
      this.placed.push([x - 15, y - 8, x + 15, y + 7]); shields.push({ r, x, y });
    }
    // The interstates' key, in the Pacific off the south-west (the whole-country view only): every road, its nickname,
    // its colour by danger. Its box is reserved first so no label prints under it.
    const key = z < 1.35 ? this.roadKey(c, 12, H - 12) : null;
    // Every city's dot, and you, are kept clear of text.
    for (const [x, y] of cities) this.placed.push([x - 4, y - 4, x + 4, y + 4]);
    if (this.me) { const [x, y] = U(...this.me); this.placed.push([x - 8, y - 11, x + 8, y + 9]); }
    // Text, by importance. 1: cities, right of the dot, else left, above or below it.
    this.labels = { states: 0, rulers: 0, towns: 0, nicknames: 0, places: 0 };
    for (const t of M.towns) if (t.shown && t.kind === 'city') {
      const [x, y] = U(t.ux, t.uy), f = `700 ${Math.round(clamp(10 + z, 10, 14))}px Barlow Condensed`;
      if (this.label(c, t.name, x + 6, y + 4, f, '#f5c542', 'left', W, H) || this.label(c, t.name, x - 6, y + 4, f, '#f5c542', 'right', W, H)
        || this.label(c, t.name, x, y - 7, f, '#f5c542', 'center', W, H) || this.label(c, t.name, x, y + 16, f, '#f5c542', 'center', W, H)) this.labels.towns++;
    }
    // 2: state names (a small state shows its code until you zoom in), nudged up or down off a city.
    for (const st of this.states) {
      const [x, y] = U(st.ux, st.uy), room = st.n * z * z, big = room > 60, t = big ? st.name.split('').join(' ') : st.code, f = `700 ${big ? Math.round(clamp(9 + z * 1.5, 10, 16)) : 10}px Barlow Condensed`;
      for (const dy of [0, -13, 13, -24]) if (this.label(c, t, x, y + dy, f, 'rgba(242,230,208,0.8)', 'center', W, H)) { this.labels.states++; st.ly = y + dy; break; }
    }
    // 3: who rules each state, under its name.
    for (const st of this.states) if (st.ruler && st.ly !== undefined && st.n * z * z > 140) { const [x] = U(st.ux, st.uy), y = st.ly; if (this.label(c, st.ruler.toUpperCase(), x, y + 11 + z, `italic 600 ${Math.round(clamp(8 + z, 9, 13))}px Barlow Condensed`, 'rgba(236,200,140,0.92)', 'center', W, H)) this.labels.rulers++; }
    // 4: the interstates' nicknames, beside their shields.
    for (const { r, x, y } of shields) if (r.nickname && this.label(c, r.nickname, x + 18, y + 4, 'italic 700 11px Barlow Condensed', ATLAS.roadCol[r.danger] ?? '#d8b066', 'left', W, H)) this.labels.nicknames++;
    // 5: local places where you have been: holdouts, bases, exits (zoomed in).
    for (const t of M.towns) if (t.shown && t.kind !== 'city') { const [x, y] = U(t.ux, t.uy); if (this.label(c, t.name, x + 6, y + 4, '700 11px Barlow Condensed', '#e8d6b0', 'left', W, H)) this.labels.places++; }
    for (const b of M.bases) if (b.shown) { const [x, y] = U(b.ux, b.uy); if (this.label(c, b.name.toUpperCase(), x + 8, y + 4, '600 11px Barlow Condensed', '#cfd49a', 'left', W, H)) this.labels.places++; }
    if (z >= 3) for (const e of M.exits) if (e.shown) { const [x, y] = U(e.ux, e.uy); if (this.label(c, `EXIT ${e.n} · ${e.name}`, x + 5, y - 4, '600 10px Barlow Condensed', '#bfe0a8', 'left', W, H)) this.labels.places++; }
    if (key) key();
    c.textAlign = 'left';
    return T;
  }
  // Reserve the key's box (bottom-left corner at x, y) and return the function that paints it.
  roadKey(c, x, y) {
    const rows = [...D.interstates].sort((a, b) => parseInt(a.id.slice(2), 10) - parseInt(b.id.slice(2), 10)), lh = 15, w = 214, h = 26 + rows.length * lh + 22;
    const x0 = x, y0 = y - h;
    this.placed.push([x0, y0, x0 + w, y0 + h]);
    return () => {
      c.fillStyle = 'rgba(14,11,8,0.82)'; c.strokeStyle = 'rgba(240,226,196,0.28)'; c.lineWidth = 1;
      c.fillRect(x0, y0, w, h); c.strokeRect(x0 + 0.5, y0 + 0.5, w - 1, h - 1);
      c.textAlign = 'left'; c.font = '700 12px Barlow Condensed'; c.fillStyle = '#f2e6d0'; c.fillText('THE INTERSTATES', x0 + 10, y0 + 17);
      rows.forEach((r, i) => {
        const yy = y0 + 32 + i * lh, col = ATLAS.roadCol[r.danger] ?? ATLAS.roadCol[1];
        c.strokeStyle = col; c.lineWidth = 3; c.beginPath(); c.moveTo(x0 + 10, yy - 4); c.lineTo(x0 + 30, yy - 4); c.stroke();
        c.font = '700 11px Barlow Condensed'; c.fillStyle = col; c.fillText(r.id, x0 + 36, yy);
        c.font = 'italic 600 11px Barlow Condensed'; c.fillStyle = '#e8d6b0'; c.fillText(r.nickname || 'NO NAME ON IT YET', x0 + 70, yy);
      });
      c.font = '600 10px Barlow Condensed'; c.fillStyle = 'rgba(232,214,176,0.8)';
      c.fillText('SAND · ORANGE · RED  =  QUIET · RISKY · DEADLY', x0 + 10, y0 + h - 8);
    };
  }
  // Print one label unless it would cover one already printed (or fall off the canvas). Returns whether it printed.
  label(c, text, x, y, font, fill, align = 'left', W = Infinity, H = Infinity) {
    c.font = font; c.textAlign = align;
    const w = c.measureText(text).width, h = parseInt(/(\d+)px/.exec(font)?.[1] ?? '11', 10), a = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    const box = [a - 2, y - h, a + w + 2, y + 3];
    if (box[0] < 0 || box[1] < 0 || box[2] > W || box[3] > H) return false;
    for (const q of this.placed) if (box[0] < q[2] && box[2] > q[0] && box[1] < q[3] && box[3] > q[1]) return false;
    this.placed.push(box); this.texts.push(box);
    c.lineWidth = 3; c.strokeStyle = 'rgba(20,14,10,0.85)'; c.strokeText(text, x, y); c.fillStyle = fill; c.fillText(text, x, y);
    return true;
  }
}
