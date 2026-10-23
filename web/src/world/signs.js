import * as THREE from 'three';
import { SIGN_STYLE } from '../data/streaming.js';
import { hash32, rngOf } from './geo.js';

// Every road sign face on the P1 corridor, painted once at boot into one atlas (WorldIndex.signs: exit advance signs
// in game miles, gore signs, distance signs, state lines, the dust-wall warning, and the STOP face). The signs pool
// draws them all in one call: each instance carries its face's rect in the atlas (aRect).
// Guide signs are a faded highway green with an off-white border and letters, sun-bleached and pitted; a dead exit's
// signs are rusted out and shot up. Never purple: the state-line slate is a blue-grey.

const SW = 512, SH = 256, COLS = 4;

export class SignAtlas {
  // opts.scale: a smaller slot (a region's atlas: docs/design/WEB_FLORIDA.md §3.1); opts.dedupe: faces with the same
  // style, words and shape share one slot (an exit's EXIT 9 / 1 MILE reads the same both ways). P1's atlas uses neither.
  constructor(signs, opts = {}) {
    const k = opts.scale ?? 1, SWk = Math.round(SW * k), SHk = Math.round(SH * k);
    let faces = [...signs.map((s) => ({ id: s.id, style: s.style, lines: s.lines, aspect: s.w / s.hgt })), { id: 'STOP', style: 'stop', lines: ['STOP'], aspect: 1, octagon: true }];
    const alias = new Map();
    if (opts.dedupe) {
      const seen = new Map(), kept = [];
      for (const f of faces) { const key = `${f.style}|${f.lines.join('/')}|${f.aspect.toFixed(3)}|${!!f.octagon}`; const o = seen.get(key); if (o) alias.set(f.id, o.id); else { seen.set(key, f); kept.push(f); } }
      faces = kept;
    }
    const rows = Math.ceil(faces.length / COLS);
    const c = (this.canvas = document.createElement('canvas'));
    c.width = SWk * COLS; c.height = SHk * rows;
    const g = c.getContext('2d');
    g.fillStyle = '#20201c'; g.fillRect(0, 0, c.width, c.height);
    this.rects = new Map();
    faces.forEach((f, i) => {
      const px = (i % COLS) * SWk, py = Math.floor(i / COLS) * SHk;
      // The face is drawn at its own aspect inside the slot; the rect covers just that part.
      const fw = f.aspect >= SWk / SHk ? SWk : Math.round(SHk * f.aspect), fh = f.aspect >= SWk / SHk ? Math.round(SWk / f.aspect) : SHk;
      const fx = px + (SWk - fw) / 2, fy = py + (SHk - fh) / 2;
      this.paint(g, f, fx, fy, fw, fh);
      this.rects.set(f.id, [fx / c.width, 1 - (fy + fh) / c.height, fw / c.width, fh / c.height]);
    });
    for (const [id, to] of alias) this.rects.set(id, this.rects.get(to));
    const t = (this.texture = new THREE.CanvasTexture(c));
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    this.count = faces.length;
  }

  rect(id) { return this.rects.get(id) ?? [0, 0, 1 / COLS, 0.01]; }

  paint(g, f, x, y, w, h) {
    const S = SIGN_STYLE[f.style] ?? SIGN_STYLE.guide, rng = rngOf(hash32(...[...f.id].map((ch) => ch.charCodeAt(0))));
    g.save();
    g.beginPath();
    if (f.octagon) {
      const cx = x + w / 2, cy = y + h / 2, r = Math.min(w, h) / 2 - 4;
      for (let k = 0; k < 8; k++) { const a = Math.PI / 8 + (k * Math.PI) / 4; g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
      g.closePath();
    } else g.roundRect(x + 3, y + 3, w - 6, h - 6, Math.min(w, h) * 0.07);
    g.fillStyle = S.bg; g.fill();
    g.clip();
    // Sun-bleach: a pale wash heavier toward the top, and blotches.
    const grd = g.createLinearGradient(x, y, x, y + h);
    grd.addColorStop(0, `rgba(235,225,200,${S.fade})`); grd.addColorStop(1, `rgba(235,225,200,${S.fade * 0.35})`);
    g.fillStyle = grd; g.fillRect(x, y, w, h);
    for (let k = 0; k < 14; k++) { g.fillStyle = `rgba(20,18,14,${rng.range(0.04, 0.12)})`; g.beginPath(); g.ellipse(x + rng() * w, y + rng() * h, rng.range(6, 30), rng.range(4, 18), rng() * 3, 0, 6.3); g.fill(); }
    if (S.rust) for (let k = 0; k < 26; k++) { g.fillStyle = `rgba(${120 + rng() * 40},${58 + rng() * 20},${28 + rng() * 10},${rng.range(0.35, 0.8)})`; g.beginPath(); g.ellipse(x + rng() * w, y + rng() * h, rng.range(3, 22), rng.range(2, 12), rng() * 3, 0, 6.3); g.fill(); }
    // Border.
    g.lineWidth = Math.max(5, Math.min(w, h) * 0.035); g.strokeStyle = S.border;
    if (f.octagon) { g.stroke(); } else { g.beginPath(); g.roundRect(x + 12, y + 12, w - 24, h - 24, Math.min(w, h) * 0.05); g.stroke(); }
    // Letters: bold condensed, sized to fit.
    g.fillStyle = S.fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    const lines = f.lines.filter(Boolean), n = lines.length;
    const lh = (h - 40) / Math.max(1, n);
    lines.forEach((ln, i) => {
      const big = i === 0 && n > 1 && /^EXIT|^I-\d|^STATE|^DUST|^SQUALL/.test(ln);
      let size = Math.min(lh * (big ? 0.62 : 0.74), f.octagon ? h * 0.3 : 80);
      g.font = `700 ${size}px "Arial Narrow", "Roboto Condensed", "Barlow Condensed", Arial, sans-serif`;
      while (g.measureText(ln).width > w - 44 && size > 12) { size -= 2; g.font = `700 ${size}px "Arial Narrow", "Roboto Condensed", "Barlow Condensed", Arial, sans-serif`; }
      g.fillText(ln, x + w / 2, y + 20 + lh * (i + 0.5));
    });
    // Bullet holes (out here everybody shoots at signs): more on a dead exit's.
    const holes = f.style === 'faded' ? 14 : f.style === 'stop' ? 3 : rng.int(1, 6);
    for (let k = 0; k < holes; k++) {
      const hx = x + rng.range(0.08, 0.92) * w, hy = y + rng.range(0.1, 0.9) * h, r = rng.range(2.2, 4.2);
      g.fillStyle = 'rgba(200,190,170,0.85)'; g.beginPath(); g.arc(hx, hy, r + 2.2, 0, 6.3); g.fill();
      g.fillStyle = '#121110'; g.beginPath(); g.arc(hx, hy, r, 0, 6.3); g.fill();
    }
    g.restore();
  }
}
