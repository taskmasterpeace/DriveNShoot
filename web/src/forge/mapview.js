// The surveyor's table (docs/design/WEB_FORGE.md §3.3): one canvas map in usmap metres (the rows' own frame), shared by
// the MAP and BRUSH tabs. A base wash of the country painted once from the usmap grids (biome, relief hillshade, the
// sea), state lines, then whatever layers a tab hands it, every frame it changes. Wheel zooms about the cursor from the
// whole country down to a town's street; drag pans unless the tab takes the pointer.
import { toWorld, toUsmap } from '../world/geo.js';
import { STREAM } from '../data/streaming.js';

export const BIOME_COL = { '.': [24, 46, 56], w: [44, 86, 98], F: [44, 70, 40], f: [104, 104, 66], p: [134, 124, 84], a: [118, 118, 70], d: [160, 128, 86], m: [112, 92, 72], s: [56, 74, 52], u: [104, 98, 90] };
export const KIND_COL = { lab: '#7fd1c4', ruin: '#c9a27a', holdout: '#e3a72f', route: '#d97a4a', wilds: '#8fbf6a', water: '#6fb3cf', base: '#d6c9a8', bunker: '#7fd1c4', city: '#e3a72f' };
export const BASE_COL = { remnant: '#9cc46a', ruler: '#e3a72f', raider: '#d9643a', abandoned: '#8c8478', overrun: '#c2402e', automated: '#9fb6c2', none: '#8c8478' };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class MapView {
  constructor(wrap, opts = {}) {
    this.wrap = wrap;
    this.canvas = document.createElement('canvas');
    wrap.prepend(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.view = { cx: opts.cx ?? -25000, cy: opts.cy ?? -2000, s: opts.s ?? 0.02 };
    this.minS = 0.004; this.maxS = 6;
    this.layers = [];
    this.h = {}; // the tab's pointer handlers: down(ev, p) -> true takes the drag; move, up, click, hover, leave, dbl
    this.w = 0; this.hgt = 0; this.dpr = 1;
    this.dirty = true;
    new ResizeObserver(() => this.resize()).observe(wrap);
    this.bind();
    const loop = () => { if (this.dirty && this.w) { this.dirty = false; this.draw(); } requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }
  resize() {
    const r = this.wrap.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    const was = this.w;
    this.w = r.width; this.hgt = r.height;
    if (this.autoFit && !this.moved && r.width && Math.abs(r.width - was) > 2) requestAnimationFrame(() => this.autoFit());
    this.canvas.width = Math.max(1, Math.round(r.width * this.dpr)); this.canvas.height = Math.max(1, Math.round(r.height * this.dpr));
    this.dirty = true;
  }
  redraw() { this.dirty = true; }
  // usmap <-> screen (CSS pixels)
  sx(ux) { return (ux - this.view.cx) * this.view.s + this.w / 2; }
  sy(uy) { return (uy - this.view.cy) * this.view.s + this.hgt / 2; }
  ux(px) { return (px - this.w / 2) / this.view.s + this.view.cx; }
  uy(py) { return (py - this.hgt / 2) / this.view.s + this.view.cy; }
  visible(x0, y0, x1, y1, m = 0) { return this.sx(x1) >= -m && this.sx(x0) <= this.w + m && this.sy(y1) >= -m && this.sy(y0) <= this.hgt + m; }
  // Metres per pixel in the WORLD (game) frame: K world metres per usmap metre.
  worldPerPx() { return STREAM.K / this.view.s; }

  bind() {
    const c = this.canvas;
    const pt = (e) => { const r = c.getBoundingClientRect(); const px = e.clientX - r.left, py = e.clientY - r.top; return { px, py, ux: this.ux(px), uy: this.uy(py) }; };
    let drag = null;
    c.addEventListener('wheel', (e) => {
      e.preventDefault(); this.moved = true;
      const p = pt(e), k = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018));
      this.zoomAt(p.px, p.py, this.view.s * k);
    }, { passive: false });
    c.addEventListener('pointerdown', (e) => {
      const p = pt(e);
      try { c.setPointerCapture(e.pointerId); } catch { /* a synthetic pointer (an agent's test) */ }
      this.moved = true;
      const pan = e.button === 1 || e.button === 2 || e.shiftKey && e.button === 0 ? true : !this.h.down?.(e, p);
      drag = { pan, x: e.clientX, y: e.clientY, cx: this.view.cx, cy: this.view.cy, moved: 0, p };
      c.style.cursor = pan ? 'grabbing' : this.cursor ?? 'crosshair';
    });
    c.addEventListener('pointermove', (e) => {
      const p = pt(e);
      this.mouse = p;
      if (drag) {
        drag.moved = Math.max(drag.moved, Math.hypot(e.clientX - drag.x, e.clientY - drag.y));
        if (drag.pan) { this.view.cx = drag.cx - (e.clientX - drag.x) / this.view.s; this.view.cy = drag.cy - (e.clientY - drag.y) / this.view.s; this.redraw(); this.h.view?.(); }
        else this.h.move?.(e, p);
      } else this.h.hover?.(e, p);
    });
    c.addEventListener('pointerup', (e) => {
      const p = pt(e), d = drag; drag = null;
      c.style.cursor = this.cursor ?? 'crosshair';
      if (!d) return;
      if (!d.pan) this.h.up?.(e, p, d.moved);
      else if (d.moved < 4 && e.button === 0) this.h.click?.(e, p);
    });
    c.addEventListener('dblclick', (e) => this.h.dbl?.(e, pt(e)));
    c.addEventListener('pointerleave', () => { this.mouse = null; this.h.leave?.(); });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  zoomAt(px, py, s) {
    s = clamp(s, this.minS, this.maxS);
    const ux = this.ux(px), uy = this.uy(py);
    this.view.s = s;
    this.view.cx = ux - (px - this.w / 2) / s; this.view.cy = uy - (py - this.hgt / 2) / s;
    this.redraw(); this.h.view?.();
  }
  flyTo(ux, uy, s = this.view.s, ms = 420, auto = false) {
    if (!auto) this.moved = true; // a view someone chose: a resize keeps it
    const a = { ...this.view }, b = { cx: ux, cy: uy, s: clamp(s, this.minS, this.maxS) }, t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / ms), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      const ls = Math.exp(Math.log(a.s) + (Math.log(b.s) - Math.log(a.s)) * e);
      this.view = { cx: a.cx + (b.cx - a.cx) * e, cy: a.cy + (b.cy - a.cy) * e, s: ls };
      this.redraw();
      if (k < 1) requestAnimationFrame(step); else this.h.view?.();
    };
    requestAnimationFrame(step);
  }
  fit(x0, y0, x1, y1, pad = 40, auto = false) {
    const s = Math.min((this.w - pad * 2) / Math.max(1, x1 - x0), (this.hgt - pad * 2) / Math.max(1, y1 - y0));
    this.flyTo((x0 + x1) / 2, (y0 + y1) / 2, s, 420, auto);
  }

  // ---- the base wash, painted once per grid: biome colour, relief hillshade, grain; and the state lines ------------------
  setGrid(doc) {
    this.doc = doc;
    const P = 8, W = doc.w * P, H = doc.h * P;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d'), img = g.createImageData(W, H), d = img.data;
    const rel = (i, j) => { i = clamp(i, 0, doc.w - 1); j = clamp(j, 0, doc.h - 1); return (doc.relief[j].charCodeAt(i) - 48) / 9; };
    const relAt = (fx, fy) => { const i = Math.floor(fx), j = Math.floor(fy), tx = fx - i, ty = fy - j; return (rel(i, j) * (1 - tx) + rel(i + 1, j) * tx) * (1 - ty) + (rel(i, j + 1) * (1 - tx) + rel(i + 1, j + 1) * tx) * ty; };
    const bio = (i, j) => doc.grid[clamp(j, 0, doc.h - 1)][clamp(i, 0, doc.w - 1)];
    let seed = 1977;
    const rnd = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return ((seed >>> 0) % 1000) / 1000; };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const fx = x / P - 0.5, fy = y / P - 0.5, i = Math.floor(x / P), j = Math.floor(y / P);
      // Biome colour blended between cell centres (no hard squares), the sea kept crisp.
      const b0 = bio(i, j);
      let r = 0, gg = 0, bb = 0;
      if (b0 === '.') [r, gg, bb] = BIOME_COL['.'];
      else {
        const ii = Math.floor(fx), jj = Math.floor(fy), tx = fx - ii, ty = fy - jj;
        for (let k = 0; k < 4; k++) {
          const bk = bio(ii + (k & 1), jj + (k >> 1)), c = BIOME_COL[bk === '.' ? b0 : bk] ?? BIOME_COL.d, w = (k & 1 ? tx : 1 - tx) * (k >> 1 ? ty : 1 - ty);
          r += c[0] * w; gg += c[1] * w; bb += c[2] * w;
        }
      }
      // Hillshade: light from the north-west on the painted relief.
      let sh = 1;
      if (b0 !== '.') { const e = 0.6, dx = relAt(fx + e, fy) - relAt(fx - e, fy), dy = relAt(fx, fy + e) - relAt(fx, fy - e); sh = 1 + clamp(-(dx + dy) * 0.9, -0.35, 0.35) + relAt(fx, fy) * 0.08; }
      const n = 0.94 + rnd() * 0.12, o = (y * W + x) * 4;
      d[o] = clamp(r * sh * n, 0, 255); d[o + 1] = clamp(gg * sh * n, 0, 255); d[o + 2] = clamp(bb * sh * n, 0, 255); d[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    this.base = cv; this.baseP = P;
    // State borders as segments between cells of different states (land only).
    const segs = [];
    const st = (i, j) => (i < 0 || j < 0 || i >= doc.w || j >= doc.h ? '.' : doc.states_grid[j][i]);
    const ox = doc.world_offset[0], oy = doc.world_offset[1], cm = doc.cell_m;
    for (let j = 0; j < doc.h; j++) for (let i = 0; i < doc.w; i++) {
      const a = st(i, j); if (a === '.') continue;
      const r2 = st(i + 1, j), b2 = st(i, j + 1);
      if (r2 !== a && r2 !== '.') segs.push(ox + (i + 1) * cm, oy + j * cm, ox + (i + 1) * cm, oy + (j + 1) * cm);
      if (b2 !== a && b2 !== '.') segs.push(ox + i * cm, oy + (j + 1) * cm, ox + (i + 1) * cm, oy + (j + 1) * cm);
    }
    this.stateSegs = segs;
    // State names at each state's cell centroid.
    const acc = new Map();
    for (let j = 0; j < doc.h; j++) for (let i = 0; i < doc.w; i++) { const a = st(i, j); if (a === '.') continue; const v = acc.get(a) ?? [0, 0, 0]; v[0] += i; v[1] += j; v[2]++; acc.set(a, v); }
    this.stateLabels = [...acc].map(([k, [si, sj, n]]) => ({ name: doc.state_legend[k], x: ox + (si / n + 0.5) * cm, y: oy + (sj / n + 0.5) * cm, n }));
    this.redraw();
  }

  draw() {
    const g = this.ctx, d = this.doc;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = 'rgb(20,38,46)'; g.fillRect(0, 0, this.w, this.hgt);
    if (d && this.base) {
      const x0 = this.sx(d.world_offset[0]), y0 = this.sy(d.world_offset[1]), x1 = this.sx(d.world_offset[0] + d.w * d.cell_m), y1 = this.sy(d.world_offset[1] + d.h * d.cell_m);
      g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
      g.drawImage(this.base, x0, y0, x1 - x0, y1 - y0);
      // The baked land under the corridor (forge/land.js), faded in as you zoom past the 500 m wash.
      const L = this.land, k = L ? Math.min(1, Math.max(0, (this.view.s - (this.landFrom ?? 0.03)) / 0.05)) : 0;
      if (k > 0) {
        const K = STREAM.K, [px, py] = STREAM.PHX, lx0 = this.sx(L.x0 / K + px), ly0 = this.sy(L.z0 / K + py);
        // Close in, a baked sample (two cells, 64 m) spans many pixels: soften it so the landcover reads as country, not camo.
        const pxs = ((L.w / K) * this.view.s) / L.canvas.width;
        if (pxs > 3) g.filter = `blur(${Math.min(8, pxs * 0.45).toFixed(1)}px)`;
        g.globalAlpha = k; g.drawImage(L.canvas, lx0, ly0, (L.w / K) * this.view.s, (L.h / K) * this.view.s); g.globalAlpha = 1; g.filter = 'none';
      }
      // Graticule every 2.5 km of usmap (a surveyor's grid), faint.
      const step = this.view.s > 0.12 ? 500 : this.view.s > 0.03 ? 2500 : 10000;
      g.strokeStyle = 'rgba(232,222,196,0.05)'; g.lineWidth = 1; g.beginPath();
      for (let x = Math.ceil(this.ux(0) / step) * step; x < this.ux(this.w); x += step) { g.moveTo(this.sx(x), 0); g.lineTo(this.sx(x), this.hgt); }
      for (let y = Math.ceil(this.uy(0) / step) * step; y < this.uy(this.hgt); y += step) { g.moveTo(0, this.sy(y)); g.lineTo(this.w, this.sy(y)); }
      g.stroke();
      if (this.showStates !== false) {
        g.strokeStyle = 'rgba(236,226,200,0.32)'; g.lineWidth = 1; g.setLineDash([4, 3]); g.beginPath();
        const S = this.stateSegs;
        for (let k = 0; k < S.length; k += 4) { g.moveTo(this.sx(S[k]), this.sy(S[k + 1])); g.lineTo(this.sx(S[k + 2]), this.sy(S[k + 3])); }
        g.stroke(); g.setLineDash([]);
        if (this.view.s < 0.06) {
          g.font = `700 ${clamp(10 + this.view.s * 120, 10, 14)}px "Barlow Condensed", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
          for (const L of this.stateLabels) { if (L.n < 18) continue; g.fillStyle = 'rgba(236,226,200,0.2)'; g.fillText(spaced(L.name), this.sx(L.x), this.sy(L.y)); }
        }
      }
    }
    for (const L of this.layers) if (L.on !== false) { g.save(); try { L.draw(g, this); } catch (e) { console.warn('layer', L.id, e); } g.restore(); }
  }
}
const spaced = (s) => s.split('').join(' ');

// ---- shared row painters (MAP draws them all; BRUSH draws the network faintly under the paint) --------------------------------
export function polyline(g, mv, pts, close = false) {
  g.beginPath();
  for (let i = 0; i < pts.length; i++) { const x = mv.sx(pts[i][0]), y = mv.sy(pts[i][1]); if (i) g.lineTo(x, y); else g.moveTo(x, y); }
  if (close) g.closePath();
}
const bboxOf = (pts) => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const p of pts) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; } return [x0, y0, x1, y1]; };
const bbCache = new WeakMap();
export const rowBox = (r) => { let b = bbCache.get(r.pts); if (!b) bbCache.set(r.pts, (b = bboxOf(r.pts))); return b; };
export function drawNetwork(g, mv, doc, o = {}) {
  const s = mv.view.s, a = o.alpha ?? 1;
  const vis = (r) => { const b = rowBox(r); return mv.visible(b[0], b[1], b[2], b[3], 30); };
  if (o.rivers !== false) {
    g.strokeStyle = `rgba(104,170,196,${0.85 * a})`; g.lineCap = 'round'; g.lineJoin = 'round';
    for (const r of doc.rivers ?? []) { if (!vis(r)) continue; g.lineWidth = clamp(s * 70, 1.6, 7); polyline(g, mv, r.pts); g.stroke(); }
  }
  if (o.roads !== false) for (const r of doc.roads ?? []) {
    if (!vis(r)) continue;
    g.lineWidth = clamp(s * 30, 1, 4); g.strokeStyle = r.kind === 'dirt' ? `rgba(184,156,112,${0.75 * a})` : `rgba(214,196,150,${0.85 * a})`;
    g.setLineDash(r.kind === 'dirt' ? [5, 4] : []); polyline(g, mv, r.pts); g.stroke(); g.setLineDash([]);
  }
  if (o.streets !== false && s > 0.08) for (const r of doc.streets ?? []) {
    if (!vis(r)) continue;
    g.lineWidth = clamp(s * 9, 1, 7); g.strokeStyle = `rgba(232,222,196,${0.8 * a})`; polyline(g, mv, r.pts); g.stroke();
  }
  if (o.rails !== false) for (const r of doc.rails ?? []) {
    if (!vis(r)) continue;
    g.lineWidth = clamp(s * 22, 2, 5); g.strokeStyle = `rgba(30,24,18,${0.9 * a})`; polyline(g, mv, r.pts); g.stroke();
    g.lineWidth = clamp(s * 12, 1, 3); g.strokeStyle = `rgba(226,214,188,${0.9 * a})`; g.setLineDash([6, 6]); polyline(g, mv, r.pts); g.stroke(); g.setLineDash([]);
  }
  if (o.interstates !== false) {
    const w = clamp(s * 55, 2.4, 9);
    for (const r of doc.interstates ?? []) {
      if (!vis(r)) continue;
      g.lineCap = 'round'; g.lineJoin = 'round';
      g.lineWidth = w + 3; g.strokeStyle = `rgba(22,16,10,${0.85 * a})`; polyline(g, mv, r.pts); g.stroke();
      g.lineWidth = w; g.strokeStyle = r.id === o.hot ? 'rgba(255,214,120,1)' : `rgba(236,170,72,${a})`; polyline(g, mv, r.pts); g.stroke();
    }
  }
}
// An interstate shield with its number, every ~360 px along each line.
export function drawShields(g, mv, doc) {
  g.font = '800 11px "Barlow Condensed", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const r of doc.interstates ?? []) {
    const b = rowBox(r); if (!mv.visible(b[0], b[1], b[2], b[3])) continue;
    let acc = 180;
    for (let i = 1; i < r.pts.length; i++) {
      const x0 = mv.sx(r.pts[i - 1][0]), y0 = mv.sy(r.pts[i - 1][1]), x1 = mv.sx(r.pts[i][0]), y1 = mv.sy(r.pts[i][1]), L = Math.hypot(x1 - x0, y1 - y0);
      while (acc < L) {
        const t = acc / L, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
        if (x > 0 && y > 0 && x < mv.w && y < mv.hgt) shield(g, x, y, r.id.replace('I-', ''));
        acc += 360;
      }
      acc -= L;
    }
  }
}
function shield(g, x, y, n) {
  const w = 10 + n.length * 4.5, h = 15;
  g.beginPath(); g.moveTo(x - w / 2, y - h / 2); g.lineTo(x + w / 2, y - h / 2); g.lineTo(x + w / 2, y + 2); g.quadraticCurveTo(x + w / 2, y + h / 2, x, y + h / 2 + 2); g.quadraticCurveTo(x - w / 2, y + h / 2, x - w / 2, y + 2); g.closePath();
  g.fillStyle = '#2d5a3e'; g.fill(); g.lineWidth = 1.5; g.strokeStyle = '#efe6cc'; g.stroke();
  g.fillStyle = '#efe6cc'; g.fillText(n, x, y + 1);
}
// Labels that never pile up: a greedy pass by priority.
export class Labeler {
  constructor() { this.rects = []; }
  fits(x, y, w, h) { for (const r of this.rects) if (x < r[0] + r[2] && x + w > r[0] && y < r[1] + r[3] && y + h > r[1]) return false; this.rects.push([x, y, w, h]); return true; }
  text(g, s, x, y, { font = '700 12px "Barlow Condensed", sans-serif', fill = '#efe6cc', halo = 'rgba(16,12,8,0.85)', dx = 8, dy = 0, align = 'left' } = {}) {
    g.font = font; const w = g.measureText(s).width, h = 13;
    const lx = align === 'center' ? x - w / 2 : x + dx, ly = y + dy - h / 2;
    if (!this.fits(lx - 2, ly - 1, w + 4, h + 2)) return false;
    g.textAlign = 'left'; g.textBaseline = 'middle';
    g.lineWidth = 3.2; g.strokeStyle = halo; g.strokeText(s, lx, y + dy); g.fillStyle = fill; g.fillText(s, lx, y + dy);
    return true;
  }
}
// The game's own frame on the national map: the P1 box the importer copies, the dust wall, the island.
export function drawGameFrame(g, mv, doc, game) {
  const K = STREAM.K, [px, py] = STREAM.PHX;
  const box = doc.meta?.box;
  if (box) { g.strokeStyle = 'rgba(227,167,47,0.45)'; g.setLineDash([6, 5]); g.lineWidth = 1.2; g.strokeRect(mv.sx(box.x0), mv.sy(box.y0), (box.x1 - box.x0) * mv.view.s, (box.y1 - box.y0) * mv.view.s); g.setLineDash([]); }
  const R = STREAM.dustWall / K;
  g.strokeStyle = 'rgba(200,150,90,0.55)'; g.lineWidth = 2; g.setLineDash([2, 5]); g.beginPath(); g.arc(mv.sx(px), mv.sy(py), R * mv.view.s, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
  const isl = STREAM.island / K;
  g.fillStyle = 'rgba(227,167,47,0.25)'; g.strokeStyle = 'rgba(227,167,47,0.9)'; g.lineWidth = 1.2;
  g.fillRect(mv.sx(px - isl), mv.sy(py - isl), 2 * isl * mv.view.s, 2 * isl * mv.view.s); g.strokeRect(mv.sx(px - isl), mv.sy(py - isl), 2 * isl * mv.view.s, 2 * isl * mv.view.s);
  if (mv.view.s > 0.015) { const lab = new Labeler(); lab.text(g, 'THE DUST WALL', mv.sx(px), mv.sy(py - R) - 10, { align: 'center', fill: 'rgba(220,170,110,0.9)', font: '700 11px "Barlow Condensed", sans-serif' }); }
  if (game?.player) {
    const [ux, uy] = toUsmap(game.player.x, game.player.z), x = mv.sx(ux), y = mv.sy(uy), t = performance.now() / 600;
    g.strokeStyle = `rgba(156,196,106,${0.5 + 0.4 * Math.sin(t)})`; g.lineWidth = 2; g.beginPath(); g.arc(x, y, 10 + 3 * Math.sin(t), 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#9cc46a'; g.beginPath(); g.arc(x, y, 4.5, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#10140a'; g.lineWidth = 1.5; g.stroke();
    const lab = new Labeler(); lab.text(g, game.label ?? 'YOU', x, y, { fill: '#cfe8a8', dx: 14 });
    clearTimeout(mv._pulse); mv._pulse = setTimeout(() => mv.redraw(), 90); // the pulse, ~10 a second
  }
}
export { toWorld, toUsmap };
