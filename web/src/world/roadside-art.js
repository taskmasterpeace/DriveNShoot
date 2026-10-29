import * as THREE from 'three';
import { ADVERTS } from '../data/roadside.js';
import { hash32, rngOf } from './geo.js';
import { BILL_COLS, BILL_SW, BILL_SH } from './roadside.js';

// Every billboard and price-pole face on the roadside (world/roadside.js faces, in order), painted once into one atlas
// the `bills` pool draws (each instance carries its rect: aRect, as the road signs do). A century of sun: paint bleached
// toward the top, paper peeling off grey plywood, bullet holes, a faction's whitewash and spray over an old advert. Our
// own adverts only (data/roadside.js ADVERTS). Never purple.

const FONT = '"Arial Narrow", "Roboto Condensed", "Barlow Condensed", Arial, sans-serif';
const EXIT = { bg: '#2f5a3c', fg: '#e8e2cc', band: '#c8a03a' };
const SPRAY = ['#b8261a', '#1a1816', '#e8e2d2', '#d8862a'];

export class BillboardAtlas {
  constructor(faces) {
    const rows = Math.max(1, Math.ceil(faces.length / BILL_COLS));
    const c = (this.canvas = document.createElement('canvas'));
    c.width = BILL_SW * BILL_COLS; c.height = BILL_SH * rows;
    const g = c.getContext('2d');
    g.fillStyle = '#3a3630'; g.fillRect(0, 0, c.width, c.height);
    faces.forEach((f, i) => this.paint(g, f, (i % BILL_COLS) * BILL_SW, Math.floor(i / BILL_COLS) * BILL_SH, BILL_SW, BILL_SH));
    const t = (this.texture = new THREE.CanvasTexture(c));
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    this.count = faces.length;
  }

  text(g, s, x, y, maxW, size, weight = 800, col = '#fff', align = 'center') {
    if (!s) return;
    g.fillStyle = col; g.textAlign = align; g.textBaseline = 'middle';
    let k = size;
    g.font = `${weight} ${k}px ${FONT}`;
    while (g.measureText(s).width > maxW && k > 9) { k -= 1; g.font = `${weight} ${k}px ${FONT}`; }
    g.fillText(s, x, y);
  }

  paint(g, f, x, y, w, h) {
    const rng = rngOf(hash32(...[...String(f.id)].map((ch) => ch.charCodeAt(0)), 77));
    g.save();
    g.beginPath(); g.rect(x + 2, y + 2, w - 4, h - 4); g.clip();
    // The plywood under it all (grey, grain), then whatever was painted or pasted on.
    g.fillStyle = '#8a8478'; g.fillRect(x, y, w, h);
    for (let k = 0; k < 18; k++) { g.fillStyle = `rgba(60,52,44,${rng.range(0.05, 0.14)})`; g.fillRect(x, y + rng() * h, w, rng.range(1, 3)); }
    if (f.kind === 'exit') this.exitFace(g, f, x, y, w, h, rng);
    else if (f.kind === 'advert') this.advert(g, ADVERTS[f.ad], x, y, w, h, rng);
    else if (f.kind === 'price') this.price(g, f, x, y, w, h, rng);
    else { // a faction's board: an old advert under whitewash and spray
      this.advert(g, ADVERTS[f.under] ?? ADVERTS.motor_court, x, y, w, h, rng);
      g.fillStyle = 'rgba(226,220,204,0.86)';
      g.beginPath(); g.moveTo(x + 10, y + 14); g.lineTo(x + w - 14, y + 8); g.lineTo(x + w - 8, y + h - 12); g.lineTo(x + 16, y + h - 6); g.closePath(); g.fill();
      const col = f.kind === 'toll' ? '#1a1816' : '#b8261a', lines = f.lines.filter(Boolean);
      this.spray(g, lines[0], x + w / 2, y + h * 0.34, w - 40, h * 0.34, col, rng);
      for (let i = 1; i < lines.length; i++) this.text(g, lines[i], x + w / 2, y + h * (0.34 + i * 0.22), w - 40, h * 0.16, 700, '#2a2622');
    }
    this.weather(g, f, x, y, w, h, rng);
    g.restore();
  }

  exitFace(g, f, x, y, w, h, rng) {
    g.fillStyle = EXIT.bg; g.fillRect(x, y, w, h);
    g.fillStyle = EXIT.band; g.fillRect(x, y + h - 16, w, 10);
    // The pictogram on the left: a pump, a trade post's crossed tools, a holdout's house; nothing for a dead exit.
    const px = x + 52, py = y + h * 0.46;
    g.strokeStyle = EXIT.fg; g.fillStyle = EXIT.fg; g.lineWidth = 5;
    if (f.art === 'fuel') { g.fillRect(px - 16, py - 26, 28, 50); g.fillStyle = EXIT.bg; g.fillRect(px - 10, py - 18, 16, 12); g.fillStyle = EXIT.fg; g.beginPath(); g.moveTo(px + 12, py - 18); g.lineTo(px + 24, py - 10); g.lineTo(px + 24, py + 16); g.stroke(); }
    else if (f.art === 'trade') { g.beginPath(); g.moveTo(px - 22, py - 22); g.lineTo(px + 22, py + 22); g.moveTo(px + 22, py - 22); g.lineTo(px - 22, py + 22); g.stroke(); g.beginPath(); g.arc(px, py, 30, 0, 6.3); g.stroke(); }
    else if (f.art === 'town') { g.beginPath(); g.moveTo(px - 26, py - 2); g.lineTo(px, py - 28); g.lineTo(px + 26, py - 2); g.closePath(); g.fill(); g.fillRect(px - 18, py - 2, 36, 28); g.fillStyle = EXIT.bg; g.fillRect(px - 5, py + 8, 10, 18); }
    const lx = x + (f.art && f.art !== 'none' ? w * 0.6 : w / 2), mw = f.art && f.art !== 'none' ? w * 0.68 : w - 30;
    this.text(g, f.lines[0], lx, y + h * 0.2, mw, 28, 800, EXIT.band);
    this.text(g, f.lines[1], lx, y + h * 0.44, mw, 30, 800, EXIT.fg);
    this.text(g, f.lines[2], lx, y + h * 0.66, mw, 24, 800, EXIT.fg);
    this.text(g, f.lines[3], lx, y + h * 0.84, mw, 14, 700, EXIT.fg);
  }

  advert(g, A, x, y, w, h, rng) {
    g.fillStyle = A.bg; g.fillRect(x, y, w, h);
    g.fillStyle = A.band; g.fillRect(x, y + h * 0.7, w, h * 0.3);
    // A motif: a big sun with rays behind the headline's left (everybody's billboard had one).
    g.fillStyle = A.band; g.globalAlpha = 0.55; g.beginPath(); g.arc(x + 46, y + h * 0.36, 26, 0, 6.3); g.fill();
    g.strokeStyle = A.band; g.lineWidth = 3;
    for (let k = 0; k < 10; k++) { const a = (k / 10) * 6.28; g.beginPath(); g.moveTo(x + 46 + Math.cos(a) * 32, y + h * 0.36 + Math.sin(a) * 32); g.lineTo(x + 46 + Math.cos(a) * 42, y + h * 0.36 + Math.sin(a) * 42); g.stroke(); }
    g.globalAlpha = 1;
    this.text(g, A.lines[0], x + w * 0.56, y + h * 0.26, w * 0.78, 34, 900, A.fg);
    this.text(g, A.lines[1], x + w * 0.56, y + h * 0.52, w * 0.78, 18, 700, A.fg);
    this.text(g, A.lines[2], x + w / 2, y + h * 0.85, w - 30, 20, 800, A.bg);
    void rng;
  }

  price(g, f, x, y, w, h, rng) {
    g.fillStyle = '#d8d0b8'; g.fillRect(x, y, w, h);
    g.fillStyle = '#a8321e'; g.fillRect(x, y, w, h * 0.42);
    // The brand's star.
    g.fillStyle = '#e8c04a'; g.beginPath();
    for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + (k / 10) * 6.283, r = k % 2 ? 9 : 22; g.lineTo(x + 34 + Math.cos(a) * r, y + h * 0.21 + Math.sin(a) * r); }
    g.closePath(); g.fill();
    this.text(g, f.lines[0], x + w * 0.58, y + h * 0.21, w * 0.7, 34, 900, '#f2e8d0');
    this.text(g, f.lines[1], x + w / 2, y + h * 0.6, w - 24, 26, 800, '#2a2622');
    this.text(g, f.lines[2], x + w / 2, y + h * 0.84, w - 24, 18, 700, '#7a2a1a');
    void rng;
  }

  // Spray paint: the letters gone over twice, a little crooked, with drips.
  spray(g, s, cx, cy, maxW, size, col, rng) {
    if (!s) return;
    g.save(); g.translate(cx, cy); g.rotate(rng.range(-0.05, 0.05));
    for (let p = 0; p < 2; p++) { g.globalAlpha = p ? 0.85 : 0.5; this.text(g, s, rng.range(-1.5, 1.5), rng.range(-1.5, 1.5), maxW, size, 900, col); }
    g.globalAlpha = 0.75; g.fillStyle = col;
    for (let k = 0; k < 9; k++) g.fillRect(rng.range(-maxW / 2, maxW / 2), size * 0.3, 2, rng.range(6, 22));
    g.restore();
  }

  // A century outdoors: the sun's bleach (heavier up top), peeled strips, rust weeping from the bolts, bullet holes.
  weather(g, f, x, y, w, h, rng) {
    const c = f.cond ?? 'faded';
    const grd = g.createLinearGradient(x, y, x, y + h);
    const k = c === 'repainted' ? 0.12 : 0.34;
    grd.addColorStop(0, `rgba(236,226,204,${k})`); grd.addColorStop(1, `rgba(236,226,204,${k * 0.3})`);
    g.fillStyle = grd; g.fillRect(x, y, w, h);
    for (let i = 0; i < 16; i++) { g.fillStyle = `rgba(30,26,20,${rng.range(0.04, 0.12)})`; g.beginPath(); g.ellipse(x + rng() * w, y + rng() * h, rng.range(8, 34), rng.range(4, 16), rng() * 3, 0, 6.3); g.fill(); }
    if (c === 'peeled' || (c === 'faded' && rng() < 0.5)) for (let i = 0; i < (c === 'peeled' ? 7 : 3); i++) {
      g.fillStyle = '#8a8478'; const sx = x + rng() * w, sw = rng.range(14, 60);
      g.beginPath(); g.moveTo(sx, y); g.lineTo(sx + sw, y); g.lineTo(sx + sw * rng.range(0.3, 1.1), y + rng.range(h * 0.3, h)); g.lineTo(sx + sw * rng.range(-0.2, 0.4), y + rng.range(h * 0.2, h * 0.9)); g.closePath(); g.fill();
    }
    for (let i = 0; i < 4; i++) { const bx = x + 20 + rng() * (w - 40); g.fillStyle = `rgba(120,60,26,${rng.range(0.25, 0.5)})`; g.fillRect(bx, y + rng.range(0, h * 0.5), 3, rng.range(18, 50)); }
    const holes = c === 'shot' ? rng.int(16, 30) : c === 'repainted' ? rng.int(1, 4) : rng.int(3, 9);
    for (let i = 0; i < holes; i++) {
      const hx = x + rng.range(0.05, 0.95) * w, hy = y + rng.range(0.08, 0.92) * h, r = rng.range(1.8, 3.4);
      g.fillStyle = 'rgba(210,200,180,0.8)'; g.beginPath(); g.arc(hx, hy, r + 2, 0, 6.3); g.fill();
      g.fillStyle = '#121110'; g.beginPath(); g.arc(hx, hy, r, 0, 6.3); g.fill();
    }
    // The frame's edge.
    g.strokeStyle = 'rgba(40,34,28,0.9)'; g.lineWidth = 4; g.strokeRect(x + 2, y + 2, w - 4, h - 4);
  }
}
