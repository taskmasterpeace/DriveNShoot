import { makeRng } from '../engine/rng.js';
import { FLAGS } from './portrait.js';

// HUD art. Every plate, tag, sign, bezel, gauge face, cartridge, throwable icon and flag patch the HUD wears is
// painted here once, on canvas, at boot: no image files, no borrowed art. Seeded, so the same scratches, rust
// and bullet holes every boot. Painted at 2x so the HUD's scale transform stays crisp. Nothing here runs per frame.

export const DPR = 2;
const TAU = Math.PI * 2;

export function makeCanvas(w, h, el) {
  const c = el ?? document.createElement('canvas');
  c.width = Math.round(w * DPR); c.height = Math.round(h * DPR);
  const g = c.getContext('2d');
  g.setTransform(DPR, 0, 0, DPR, 0, 0);
  return [c, g];
}

// ---- shared grain -------------------------------------------------------------------------------------------
let NOISE = null;
function noiseTile() {
  if (NOISE) return NOISE;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), img = g.createImageData(128, 128), rng = makeRng(911);
  for (let i = 0; i < img.data.length; i += 4) { const v = rng() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
  g.putImageData(img, 0, 0);
  return (NOISE = c);
}
function grain(g, w, h, alpha, sx = 0.5, sy = 0.5, op = 'overlay') {
  const p = g.createPattern(noiseTile(), 'repeat');
  p.setTransform(new DOMMatrix([sx, 0, 0, sy, 0, 0]));
  g.save(); g.globalCompositeOperation = op; g.globalAlpha = alpha; g.fillStyle = p; g.fillRect(0, 0, w, h); g.restore();
}
// A dark speckle tile for CSS-only pieces (chips, kill rows, tags): one small data URL shared by all of them.
let SPECKLE = null;
export function speckleURL() {
  if (SPECKLE) return SPECKLE;
  const c = document.createElement('canvas'); c.width = c.height = 96;
  const g = c.getContext('2d'), img = g.createImageData(96, 96), rng = makeRng(77);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = rng(), light = rng() < 0.35;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = light ? 235 : 12;
    img.data[i + 3] = Math.round((light ? 0.05 : 0.12) * 255 * v);
  }
  g.putImageData(img, 0, 0);
  return (SPECKLE = c.toDataURL());
}

// ---- small painting helpers ---------------------------------------------------------------------------------
function blob(g, rng, x, y, r) {
  g.beginPath();
  for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU, rr = r * rng.range(0.55, 1.3); g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  g.closePath(); g.fill();
}
function soft(g, x, y, r, rgb, a) {
  const grd = g.createRadialGradient(x, y, 0, x, y, r);
  grd.addColorStop(0, `rgba(${rgb},${a})`); grd.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = grd; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
}
const RUST = ['#2a170c', '#4a2512', '#6b3415', '#8a4418', '#a85a22', '#c4742f', '#d58a3e'];
function rustPatch(g, rng, x, y, r, k = 1) {
  g.save();
  soft(g, x, y, r * 1.6, '74,38,16', 0.5 * k);
  for (let i = 0; i < 34 * k; i++) {
    const a = rng() * TAU, d = Math.pow(rng(), 0.65) * r, rr = rng.range(0.7, 3.6) * (1 - (d / r) * 0.55);
    g.globalAlpha = rng.range(0.4, 0.9);
    g.fillStyle = RUST[2 + Math.floor(rng() * 5)];
    blob(g, rng, x + Math.cos(a) * d, y + Math.sin(a) * d, rr);
  }
  g.fillStyle = '#1c1008';
  for (let i = 0; i < 10 * k; i++) { const a = rng() * TAU, d = rng() * r * 0.8; g.globalAlpha = 0.65; g.beginPath(); g.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, rng.range(0.3, 0.9), 0, TAU); g.fill(); }
  g.restore();
}
function rustRun(g, rng, x, y, len, w = 3) {
  const grd = g.createLinearGradient(x, y, x, y + len);
  grd.addColorStop(0, 'rgba(150,72,28,0.55)'); grd.addColorStop(1, 'rgba(110,52,20,0)');
  g.fillStyle = grd;
  g.beginPath(); g.moveTo(x - w / 2, y); g.quadraticCurveTo(x - w * 0.2, y + len * 0.6, x + rng.range(-1, 1), y + len); g.quadraticCurveTo(x + w * 0.3, y + len * 0.5, x + w / 2, y); g.fill();
}
function scratch(g, rng, x, y, a, len, alpha) {
  const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len, b = rng.range(-len * 0.06, len * 0.06);
  const mx = (x + x2) / 2 - Math.sin(a) * b, my = (y + y2) / 2 + Math.cos(a) * b;
  g.lineWidth = rng.range(0.35, 1);
  g.strokeStyle = `rgba(0,0,0,${(alpha * 0.7).toFixed(3)})`;
  g.beginPath(); g.moveTo(x + 0.5, y + 0.7); g.quadraticCurveTo(mx + 0.5, my + 0.7, x2 + 0.5, y2 + 0.7); g.stroke();
  g.strokeStyle = `rgba(255,246,230,${alpha.toFixed(3)})`;
  g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(mx, my, x2, y2); g.stroke();
}
function scratches(g, rng, w, h, n, alpha = 0.2) {
  g.save(); g.lineCap = 'round';
  for (let i = 0; i < n; i++) scratch(g, rng, rng() * w, rng() * h, rng() * Math.PI * 2, rng.range(6, rng() < 0.2 ? 90 : 34), alpha * rng.range(0.35, 1));
  // a few gouged clusters: near-parallel strokes from one blow
  for (let k = 0; k < Math.max(1, n / 30); k++) {
    const cx = rng() * w, cy = rng() * h, a = rng.range(-1.1, -0.35) + (rng() < 0.4 ? Math.PI / 2 : 0), m = 4 + Math.floor(rng() * 9);
    for (let i = 0; i < m; i++) scratch(g, rng, cx + rng.range(-14, 14), cy + rng.range(-14, 14), a + rng.range(-0.08, 0.08), rng.range(20, 110), alpha * rng.range(0.6, 1.3));
  }
  g.restore();
}
export function screw(g, rng, x, y, r, cross = true) {
  g.save();
  g.fillStyle = 'rgba(0,0,0,0.6)'; g.beginPath(); g.arc(x + 0.7, y + 1.1, r + 1.3, 0, TAU); g.fill();
  const grd = g.createRadialGradient(x - r * 0.35, y - r * 0.45, r * 0.1, x, y, r);
  grd.addColorStop(0, '#d6d0c2'); grd.addColorStop(0.45, '#8d877b'); grd.addColorStop(1, '#36332e');
  g.fillStyle = grd; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.65)'; g.lineWidth = 0.8; g.stroke();
  const a0 = rng() * Math.PI;
  const slot = (a) => {
    const dx = Math.cos(a) * r * 0.7, dy = Math.sin(a) * r * 0.7;
    g.lineCap = 'round';
    g.strokeStyle = 'rgba(18,16,13,0.92)'; g.lineWidth = Math.max(1, r * 0.3);
    g.beginPath(); g.moveTo(x - dx, y - dy); g.lineTo(x + dx, y + dy); g.stroke();
    g.strokeStyle = 'rgba(255,250,238,0.32)'; g.lineWidth = 0.55;
    g.beginPath(); g.moveTo(x - dx + 0.5, y - dy + 0.9); g.lineTo(x + dx + 0.5, y + dy + 0.9); g.stroke();
  };
  slot(a0); if (cross) slot(a0 + Math.PI / 2);
  if (rng() < 0.6) { g.globalAlpha = 0.5; g.fillStyle = '#7a3d18'; g.beginPath(); g.arc(x + rng.range(-r, r) * 0.5, y + rng.range(-r, r) * 0.5, r * 0.35, 0, TAU); g.fill(); }
  g.restore();
}
function rivet(g, x, y, r) {
  g.save();
  g.fillStyle = 'rgba(0,0,0,0.55)'; g.beginPath(); g.arc(x + 0.6, y + 1, r + 0.9, 0, TAU); g.fill();
  const grd = g.createRadialGradient(x - r * 0.4, y - r * 0.45, 0, x, y, r);
  grd.addColorStop(0, '#bdb7aa'); grd.addColorStop(0.5, '#6e695f'); grd.addColorStop(1, '#2e2b27');
  g.fillStyle = grd; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  g.restore();
}
function roundRect(g, x, y, w, h, r) { g.beginPath(); g.roundRect(x, y, w, h, r); }
// The inside bevel of a closed path: light along the top/left, dark along the bottom/right.
function bevel(g, path, light = 0.22, dark = 0.7, wd = 3) {
  g.save(); g.clip(path); g.lineWidth = wd * 2;
  g.translate(1.4, 1.4); g.strokeStyle = `rgba(255,248,232,${light})`; g.stroke(path);
  g.translate(-2.8, -2.8); g.strokeStyle = `rgba(0,0,0,${dark})`; g.stroke(path);
  g.restore();
  g.save(); g.lineWidth = 1.2; g.strokeStyle = 'rgba(0,0,0,0.85)'; g.stroke(path); g.restore();
}
function chamferPath(w, h, c, extra = {}) {
  const tr = extra.tr ?? c, br = extra.br ?? c, bl = extra.bl ?? c, tl = extra.tl ?? c;
  const p = new Path2D();
  p.moveTo(tl, 0); p.lineTo(w - tr, 0); p.lineTo(w, tr); p.lineTo(w, h - br); p.lineTo(w - br, h); p.lineTo(bl, h); p.lineTo(0, h - bl); p.lineTo(0, tl); p.closePath();
  return p;
}
// Edge grime: darken a band inside the outline.
function edgeGrime(g, path, w, h, a = 0.5) {
  g.save(); g.clip(path);
  for (let i = 0; i < 6; i++) { g.lineWidth = 4 + i * 5; g.strokeStyle = `rgba(14,10,6,${(a / (i + 2)).toFixed(3)})`; g.stroke(path); }
  g.restore();
}

// ---- steel plates -------------------------------------------------------------------------------------------
// opts: seed, chamfer, cut {tl,tr,br,bl}, rust 0..1, scratch count, screws [[x,y,r]], rivets [[x,y]], tone
export function paintPlate(w, h, opts = {}, el) {
  const [c, g] = makeCanvas(w, h, el);
  const rng = makeRng(opts.seed ?? 3);
  const path = chamferPath(w, h, opts.chamfer ?? 10, opts.cut ?? {});
  g.save(); g.clip(path);
  const base = g.createLinearGradient(0, 0, w * 0.35, h * 1.1);
  const [a, b, d] = opts.tone === 'light' ? ['#6b6760', '#4d4a45', '#34322e'] : ['#5b5852', '#403d39', '#292724'];
  base.addColorStop(0, a); base.addColorStop(0.55, b); base.addColorStop(1, d);
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  grain(g, w, h, 0.35, 6, 0.35);            // brushed streaks
  grain(g, w, h, 0.22, 0.5, 0.5);           // fine grain
  // mottled wear: soft light and dark clouds
  for (let i = 0; i < 18; i++) soft(g, rng() * w, rng() * h, rng.range(20, 70), rng() < 0.5 ? '255,245,225' : '10,8,6', rng.range(0.03, 0.08));
  scratches(g, rng, w, h, opts.scratch ?? 40, opts.scratchAlpha ?? 0.22);
  // rust: patches hugging the edges and corners, runs under the fixings
  const rust = opts.rust ?? 0.6;
  for (let i = 0; i < Math.round(10 * rust); i++) {
    const t = rng(), side = Math.floor(rng() * 4), inset = rng.range(-2, 8);
    const [x, y] = side === 0 ? [t * w, inset] : side === 1 ? [w - inset, t * h] : side === 2 ? [t * w, h - inset] : [inset, t * h];
    rustPatch(g, rng, x, y, rng.range(5, 15), rng.range(0.6, 1.2));
  }
  for (const [x, y] of [[0, 0], [w, 0], [w, h], [0, h]]) if (rng() < rust) rustPatch(g, rng, x + (x ? -6 : 6), y + (y ? -6 : 6), rng.range(8, 16), 1);
  edgeGrime(g, path, w, h, 0.55);
  g.restore();
  bevel(g, path, 0.2, 0.75, 2.5);
  for (const [x, y, r = 3.2] of opts.rivets ?? []) rivet(g, x, y, r);
  for (const [x, y, r = 6.5, cross = true] of opts.screws ?? []) {
    if (rng() < rust * 0.8) rustRun(g, rng, x + rng.range(-2, 2), y + r * 0.6, rng.range(8, 22), r * 0.8);
    screw(g, rng, x, y, r, cross);
  }
  return c;
}

// ---- the ORDERS tag: torn, stained, pinned paper -------------------------------------------------------------
function tornPoly(rng, x0, y0, x1, y1, step = 3.2, jag = 1.3) {
  const pts = [];
  const edge = (ax, ay, bx, by, nx, ny) => {
    const len = Math.hypot(bx - ax, by - ay), n = Math.max(2, Math.round(len / step));
    let bite = 0;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      if (bite <= 0 && rng() < 0.035) bite = rng.range(1.5, 5.5);
      const j = rng.range(-jag, jag) + (bite > 0 ? bite * rng.range(0.6, 1) : 0);
      bite -= rng.range(0.4, 1.4);
      pts.push([ax + (bx - ax) * t + nx * j, ay + (by - ay) * t + ny * j]);
    }
  };
  edge(x0, y0, x1, y0, 0, 1); edge(x1, y0, x1, y1, -1, 0); edge(x1, y1, x0, y1, 0, -1); edge(x0, y1, x0, y0, 1, 0);
  const p = new Path2D(); pts.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y))); p.closePath();
  return p;
}
export function paintPaper(w, h, seed = 11) {
  const [c, g] = makeCanvas(w, h);
  const rng = makeRng(seed);
  // a second sheet peeking out behind, darker and skewed
  g.save(); g.translate(w / 2, h / 2); g.rotate(0.022); g.translate(-w / 2, -h / 2);
  const back = tornPoly(rng, 10, 12, w - 3, h - 2);
  g.fillStyle = '#a88d58'; g.fill(back);
  g.save(); g.clip(back); grain(g, w, h, 0.35, 0.5, 0.5, 'multiply'); g.restore();
  g.restore();
  const f = 26; // dog-eared corner (top right): the fold runs from (fx, 6) down-right at 45 degrees
  const paper = tornPoly(rng, 6, 6, w - 10, h - 10);
  const fx0 = w - 10 - f;
  g.save();
  g.clip(paper);
  g.beginPath(); g.rect(0, 0, w, h); g.moveTo(fx0 - 6, 0); g.lineTo(w, w - fx0); g.lineTo(w, 0); g.closePath();
  g.clip('evenodd');
  const base = g.createRadialGradient(w * 0.45, h * 0.42, 10, w / 2, h / 2, w * 0.75);
  base.addColorStop(0, '#f4e9cc'); base.addColorStop(0.55, '#e8d7ae'); base.addColorStop(1, '#c6a874');
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  grain(g, w, h, 0.2, 0.5, 0.5, 'multiply');
  grain(g, w, h, 0.18, 3, 0.4, 'soft-light');
  // water stains, rings, foxing
  for (let i = 0; i < 9; i++) soft(g, rng() * w, rng() * h, rng.range(14, 50), '120,84,40', rng.range(0.05, 0.14));
  for (let i = 0; i < 3; i++) { g.strokeStyle = `rgba(110,74,34,${rng.range(0.08, 0.16)})`; g.lineWidth = rng.range(0.8, 2); g.beginPath(); g.arc(rng() * w, rng() * h, rng.range(12, 30), rng() * TAU, rng() * TAU + 4); g.stroke(); }
  for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(90,58,26,${rng.range(0.1, 0.4)})`; g.beginPath(); g.arc(rng() * w, rng() * h, rng.range(0.3, 1.4), 0, TAU); g.fill(); }
  // a smear of dried blood on the right edge
  g.save(); g.globalAlpha = 0.5; g.fillStyle = '#6e2414';
  for (let i = 0; i < 16; i++) blob(g, rng, w - 14 + rng.range(-4, 6), h * 0.38 + rng.range(-16, 22), rng.range(1, 4));
  g.restore();
  soft(g, w - 12, h * 0.42, 22, '110,40,20', 0.18);
  // a crease, light then dark
  g.lineWidth = 1; g.strokeStyle = 'rgba(255,250,235,0.35)';
  g.beginPath(); g.moveTo(0, h * 0.63); g.quadraticCurveTo(w * 0.5, h * 0.6, w, h * 0.66); g.stroke();
  g.strokeStyle = 'rgba(90,64,30,0.22)';
  g.beginPath(); g.moveTo(0, h * 0.63 + 1.2); g.quadraticCurveTo(w * 0.5, h * 0.6 + 1.2, w, h * 0.66 + 1.2); g.stroke();
  edgeGrime(g, paper, w, h, 0.48);
  g.restore();
  g.save(); g.strokeStyle = 'rgba(70,48,22,0.55)'; g.lineWidth = 0.8; g.stroke(paper); g.restore();
  // the folded flap: shadow, then the paler back of the sheet
  const fx = w - 10 - f, fy = 6;
  g.save();
  g.fillStyle = 'rgba(30,20,8,0.35)';
  g.beginPath(); g.moveTo(fx, fy); g.lineTo(fx + f + 1, fy + f + 1); g.lineTo(fx - 2, fy + f + 4); g.closePath(); g.fill();
  const flap = g.createLinearGradient(fx, fy + f, fx + f * 0.5, fy + f * 0.5);
  flap.addColorStop(0, '#cbb88c'); flap.addColorStop(1, '#f1e6c8');
  g.fillStyle = flap; g.beginPath(); g.moveTo(fx, fy); g.lineTo(fx + f, fy + f); g.lineTo(fx, fy + f); g.closePath(); g.fill();
  g.strokeStyle = 'rgba(80,58,28,0.45)'; g.lineWidth = 0.7; g.stroke();
  g.restore();
  return c;
}
// The grommet and the bent nail that holds the tag up (a separate canvas so the paper can stretch).
export function paintPin(w = 72, h = 86) {
  const [c, g] = makeCanvas(w, h);
  const rng = makeRng(5);
  const cx = w / 2, cy = h - 34;
  // grommet ring
  g.fillStyle = 'rgba(30,18,8,0.45)'; g.beginPath(); g.arc(cx + 1.5, cy + 2.5, 25, 0, TAU); g.fill();
  const ring = g.createRadialGradient(cx - 7, cy - 8, 2, cx, cy, 24);
  ring.addColorStop(0, '#cf7c4c'); ring.addColorStop(0.5, '#93482a'); ring.addColorStop(1, '#4a2212');
  g.fillStyle = ring; g.beginPath(); g.arc(cx, cy, 23, 0, TAU); g.fill();
  for (let i = 0; i < 26; i++) { g.fillStyle = RUST[1 + Math.floor(rng() * 5)]; g.globalAlpha = 0.5; blob(g, rng, cx + rng.range(-18, 18), cy + rng.range(-18, 18), rng.range(0.6, 2.4)); }
  g.globalAlpha = 1;
  g.strokeStyle = 'rgba(255,214,170,0.4)'; g.lineWidth = 1.2; g.beginPath(); g.arc(cx, cy, 21, Math.PI * 1.05, Math.PI * 1.65); g.stroke();
  g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 1; g.beginPath(); g.arc(cx, cy, 23, 0, TAU); g.stroke();
  // the hole, dark, with a lit lower lip
  g.fillStyle = '#140c07'; g.beginPath(); g.arc(cx, cy, 9, 0, TAU); g.fill();
  g.strokeStyle = 'rgba(255,190,140,0.4)'; g.lineWidth = 1.1; g.beginPath(); g.arc(cx, cy, 9, 0.2, Math.PI - 0.2); g.stroke();
  // the bent nail: up out of the hole, over the top, hooked down
  const iron = (lw, col) => { g.lineWidth = lw; g.strokeStyle = col; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(cx - 3, cy + 3); g.lineTo(cx - 4, 12); g.quadraticCurveTo(cx - 3, 2, cx + 6, 3); g.quadraticCurveTo(cx + 13, 5, cx + 11, 16); g.stroke(); };
  g.save(); g.translate(2, 2.5); iron(6.5, 'rgba(0,0,0,0.45)'); g.restore();
  iron(5.6, '#47382d'); iron(2.6, '#7d6655');
  g.lineWidth = 0.9; g.strokeStyle = 'rgba(255,230,200,0.45)'; g.beginPath(); g.moveTo(cx - 5.4, cy - 2); g.lineTo(cx - 6, 13); g.stroke();
  return c;
}

// ---- brass compass ribbon -----------------------------------------------------------------------------------
export function paintRibbon(w, h) {
  const [c, g] = makeCanvas(w, h);
  const rng = makeRng(21);
  const path = new Path2D(); path.roundRect(0.5, 0.5, w - 1, h - 1, 4);
  g.save(); g.clip(path);
  const base = g.createLinearGradient(0, 0, 0, h);
  base.addColorStop(0, '#d2bc84'); base.addColorStop(0.18, '#bb9f62'); base.addColorStop(0.6, '#9a7f43'); base.addColorStop(1, '#634d24');
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  grain(g, w, h, 0.4, 7, 0.3);
  grain(g, w, h, 0.2, 0.5, 0.5, 'multiply');
  // tarnish: darker clouds, worn lighter where thumbs rubbed
  for (let i = 0; i < 26; i++) soft(g, rng() * w, rng() * h, rng.range(10, 40), rng() < 0.7 ? '60,40,12' : '255,236,180', rng.range(0.06, 0.16));
  const vg = g.createLinearGradient(0, 0, w, 0);
  vg.addColorStop(0, 'rgba(40,26,8,0.45)'); vg.addColorStop(0.12, 'rgba(40,26,8,0)'); vg.addColorStop(0.88, 'rgba(40,26,8,0)'); vg.addColorStop(1, 'rgba(40,26,8,0.45)');
  g.fillStyle = vg; g.fillRect(0, 0, w, h);
  scratches(g, rng, w, h, 30, 0.16);
  g.restore();
  bevel(g, path, 0.4, 0.6, 2);
  screw(g, rng, 13, h / 2, 6.2, true); screw(g, rng, w - 13, h / 2, 6.2, true);
  return c;
}

// ---- licence plate (cash) -----------------------------------------------------------------------------------
export function paintLicence(w, h) {
  const [c, g] = makeCanvas(w, h);
  const rng = makeRng(33);
  const path = new Path2D(); path.roundRect(1, 1, w - 2, h - 2, 9);
  g.save(); g.clip(path);
  const base = g.createLinearGradient(0, 0, w * 0.2, h);
  base.addColorStop(0, '#ecebe4'); base.addColorStop(0.5, '#d9d7ce'); base.addColorStop(1, '#bdb9ac');
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  grain(g, w, h, 0.18, 0.5, 0.5, 'multiply');
  for (let i = 0; i < 10; i++) soft(g, rng() * w, rng() * h, rng.range(15, 45), '110,96,70', rng.range(0.04, 0.1));
  // dirt runs down from the top edge
  for (let i = 0; i < 14; i++) { const x = rng() * w; const grd = g.createLinearGradient(0, 0, 0, h); grd.addColorStop(0, 'rgba(90,70,40,0.18)'); grd.addColorStop(1, 'rgba(90,70,40,0)'); g.fillStyle = grd; g.fillRect(x, 0, rng.range(1, 4), h * rng.range(0.3, 1)); }
  // rust: the corners and the bolt slots go first
  for (const [x, y] of [[8, 8], [w - 8, 8], [w - 8, h - 8], [8, h - 8]]) rustPatch(g, rng, x + rng.range(-3, 8) * Math.sign(w / 2 - x), y + rng.range(0, 6) * Math.sign(h / 2 - y), rng.range(11, 19), 1.4);
  for (let i = 0; i < 5; i++) { const t = rng(); rustPatch(g, rng, t * w, rng() < 0.5 ? rng.range(2, 9) : h - rng.range(2, 9), rng.range(5, 11), 1); }
  scratches(g, rng, w, h, 24, 0.22);
  g.restore();
  // the stamped rim, raised: light above, dark below
  const rim = new Path2D(); rim.roundRect(7, 7, w - 14, h - 14, 6);
  g.save(); g.lineWidth = 2.6;
  g.translate(-0.9, -0.9); g.strokeStyle = 'rgba(255,255,255,0.85)'; g.stroke(rim);
  g.translate(1.8, 1.8); g.strokeStyle = 'rgba(40,34,26,0.5)'; g.stroke(rim);
  g.restore();
  g.lineWidth = 1.4; g.strokeStyle = 'rgba(30,26,20,0.8)'; g.stroke(path);
  // four bolt slots
  for (const [x, y] of [[w * 0.29, 11], [w * 0.71, 11], [w * 0.29, h - 11], [w * 0.71, h - 11]]) {
    roundRect(g, x - 8, y - 2.6, 16, 5.2, 2.6); g.fillStyle = '#1b1712'; g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(x - 7, y + 3.4); g.lineTo(x + 7, y + 3.4); g.stroke();
    if (rng() < 0.7) rustRun(g, rng, x + rng.range(-5, 5), y + 3, rng.range(5, 14), 3);
  }
  return c;
}

// ---- green street sign, shot up -----------------------------------------------------------------------------
function bulletHole(g, rng, x, y, s = 1) {
  g.save();
  // chipped paint showing bare steel
  g.fillStyle = '#9d9b92';
  g.beginPath();
  for (let i = 0; i < 11; i++) { const a = (i / 11) * TAU, r = s * rng.range(5.5, 9); g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
  g.closePath(); g.fill();
  const steel = g.createRadialGradient(x - 2 * s, y - 2 * s, 0, x, y, 8 * s);
  steel.addColorStop(0, '#e1dfd6'); steel.addColorStop(1, 'rgba(120,118,110,0)');
  g.fillStyle = steel; g.fill();
  // cracks in the paint
  g.strokeStyle = 'rgba(8,18,12,0.7)'; g.lineWidth = 0.6;
  for (let i = 0; i < 6; i++) { const a = rng() * TAU, r0 = s * 6, r1 = s * rng.range(9, 15); g.beginPath(); g.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0); g.lineTo(x + Math.cos(a + rng.range(-0.2, 0.2)) * r1, y + Math.sin(a + rng.range(-0.2, 0.2)) * r1); g.stroke(); }
  // the punched lip, then the hole
  g.fillStyle = '#3b3a35';
  g.beginPath(); for (let i = 0; i < 9; i++) { const a = (i / 9) * TAU, r = s * rng.range(3.6, 5); g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } g.closePath(); g.fill();
  g.fillStyle = '#070706'; g.beginPath(); g.arc(x, y, s * 3, 0, TAU); g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 0.7; g.beginPath(); g.arc(x, y, s * 3.6, 0.3, 2.2); g.stroke();
  soft(g, x + 1, y + 4, 9 * s, '120,60,24', 0.22);
  g.restore();
}
export function paintSign(w, h) {
  const [c, g] = makeCanvas(w, h);
  const rng = makeRng(45);
  const path = new Path2D(); path.roundRect(1, 1, w - 2, h - 2, 10);
  g.save(); g.clip(path);
  const base = g.createLinearGradient(0, 0, w * 0.3, h);
  base.addColorStop(0, '#356f4b'); base.addColorStop(0.55, '#2b5f3f'); base.addColorStop(1, '#1f4a30');
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  grain(g, w, h, 0.3, 0.5, 0.5);
  grain(g, w, h, 0.18, 0.6, 5, 'multiply');   // weather streaks
  for (let i = 0; i < 12; i++) soft(g, rng() * w, rng() * h, rng.range(16, 60), rng() < 0.6 ? '30,26,14' : '200,220,190', rng.range(0.04, 0.1));
  for (let i = 0; i < 22; i++) { const x = rng() * w, grd = g.createLinearGradient(0, 0, 0, h); grd.addColorStop(0, 'rgba(70,52,30,0.22)'); grd.addColorStop(1, 'rgba(70,52,30,0)'); g.fillStyle = grd; g.fillRect(x, 0, rng.range(0.8, 3), h * rng.range(0.2, 0.9)); }
  scratches(g, rng, w, h, 34, 0.24);
  edgeGrime(g, path, w, h, 0.35);
  g.restore();
  // the white reflective border
  const border = new Path2D(); border.roundRect(6.5, 6.5, w - 13, h - 13, 7);
  g.lineWidth = 3.4; g.strokeStyle = '#e4e8df'; g.stroke(border);
  g.save(); g.lineWidth = 3.4; g.setLineDash([rng.range(20, 60), 2, rng.range(30, 80), 1.5]); g.strokeStyle = 'rgba(90,80,60,0.45)'; g.stroke(border); g.restore();
  g.lineWidth = 1.2; g.strokeStyle = 'rgba(10,20,12,0.9)'; g.stroke(path);
  g.lineWidth = 0.8; g.strokeStyle = 'rgba(255,255,255,0.25)'; g.beginPath(); g.moveTo(12, 2.2); g.lineTo(w - 12, 2.2); g.stroke();
  for (const [x, y, s] of [[w * 0.665, 11, 1], [w * 0.925, h * 0.48, 0.95], [w * 0.075, h * 0.8, 0.9], [w * 0.85, h * 0.84, 1.05]]) bulletHole(g, rng, x, y, s);
  return c;
}

// ---- minimap bezel: rugged case, knurled ring, degree band, brass rim, glass glare ---------------------------
export function paintBezel(S = 232, glassR = 84, font = 'Barlow Condensed') {
  const [c, g] = makeCanvas(S, S + 14);
  const rng = makeRng(57);
  const cx = S / 2, cy = S / 2;
  // backing plate with a foot underneath
  const back = new Path2D(); back.roundRect(8, 10, S - 16, S - 18, 30);
  const foot = new Path2D(); foot.moveTo(cx - 46, S - 20); foot.lineTo(cx + 46, S - 20); foot.lineTo(cx + 40, S + 12); foot.lineTo(cx - 40, S + 12); foot.closePath();
  for (const p of [foot, back]) {
    g.save(); g.clip(p);
    const bg = g.createLinearGradient(0, 0, S * 0.4, S);
    bg.addColorStop(0, '#4a4742'); bg.addColorStop(1, '#22201d');
    g.fillStyle = bg; g.fillRect(0, 0, S, S + 14);
    grain(g, S, S + 14, 0.3, 0.5, 0.5);
    scratches(g, rng, S, S + 14, 14, 0.16);
    g.restore();
    bevel(g, p, 0.18, 0.7, 2);
  }
  for (const [x, y] of [[24, 26], [S - 24, 26], [24, S - 22], [S - 24, S - 22]]) screw(g, rng, x, y, 6.5, true);
  // outer ring
  const R = cx - 6;
  g.fillStyle = 'rgba(0,0,0,0.55)'; g.beginPath(); g.arc(cx + 1.5, cy + 3, R + 2, 0, TAU); g.fill();
  const ring = g.createLinearGradient(0, 0, S, S);
  ring.addColorStop(0, '#928c80'); ring.addColorStop(0.45, '#5c5850'); ring.addColorStop(1, '#25231f');
  g.fillStyle = ring; g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.fill();
  // knurled grip
  g.lineWidth = 1.4;
  for (let i = 0; i < 144; i++) {
    const a = (i / 144) * TAU;
    g.strokeStyle = i % 2 ? 'rgba(0,0,0,0.45)' : 'rgba(255,250,240,0.14)';
    g.beginPath(); g.moveTo(cx + Math.cos(a) * (R - 5), cy + Math.sin(a) * (R - 5)); g.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); g.stroke();
  }
  g.lineWidth = 1; g.strokeStyle = 'rgba(0,0,0,0.8)'; g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.stroke();
  // degree band
  const b0 = R - 7, b1 = glassR + 9;
  g.fillStyle = '#1b1a18'; g.beginPath(); g.arc(cx, cy, b0, 0, TAU); g.fill();
  const bandShade = g.createRadialGradient(cx, cy, b1, cx, cy, b0);
  bandShade.addColorStop(0, 'rgba(0,0,0,0.5)'); bandShade.addColorStop(1, 'rgba(255,255,255,0.06)');
  g.fillStyle = bandShade; g.beginPath(); g.arc(cx, cy, b0, 0, TAU); g.fill();
  g.strokeStyle = 'rgba(255,248,230,0.18)'; g.lineWidth = 1; g.beginPath(); g.arc(cx, cy, b0, Math.PI, Math.PI * 1.75); g.stroke();
  for (let d = 0; d < 360; d += 5) {
    const a = (d - 90) * Math.PI / 180, long = d % 30 === 0, mid = d % 10 === 0;
    const r1 = b0 - 1, r0 = b0 - (long ? 7 : mid ? 5 : 3);
    g.strokeStyle = long ? 'rgba(230,222,205,0.85)' : 'rgba(200,192,175,0.5)'; g.lineWidth = long ? 1.4 : 0.8;
    g.beginPath(); g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); g.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); g.stroke();
  }
  const labels = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' };
  for (let d = 0; d < 360; d += 30) {
    const a = (d - 90) * Math.PI / 180, r = (b0 + b1) / 2 - 2.5;
    const card = labels[d];
    g.save(); g.translate(cx + Math.cos(a) * r, cy + Math.sin(a) * r); g.rotate(a + Math.PI / 2);
    g.font = card ? `700 13px "${font}"` : `600 9.5px "${font}"`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = 'rgba(0,0,0,0.7)'; g.fillText(card ?? String(d), 0.6, 0.9);
    g.fillStyle = card === 'N' ? '#f0a72a' : card ? '#ece4d2' : '#b9b19f';
    g.fillText(card ?? String(d), 0, 0);
    g.restore();
  }
  // the lubber triangle under the N
  g.fillStyle = '#f0a72a'; g.beginPath(); g.moveTo(cx, cy - b1 + 1); g.lineTo(cx - 4, cy - b1 - 6); g.lineTo(cx + 4, cy - b1 - 6); g.closePath(); g.fill();
  // brass inner rim
  const rimG = g.createLinearGradient(cx - b1, cy - b1, cx + b1, cy + b1);
  rimG.addColorStop(0, '#d8b46a'); rimG.addColorStop(0.5, '#8a6a2e'); rimG.addColorStop(1, '#3e2c10');
  g.strokeStyle = rimG; g.lineWidth = 6; g.beginPath(); g.arc(cx, cy, glassR + 3, 0, TAU); g.stroke();
  g.strokeStyle = 'rgba(0,0,0,0.85)'; g.lineWidth = 1.2; g.beginPath(); g.arc(cx, cy, glassR, 0, TAU); g.stroke();
  // punch the glass hole so the live minimap shows through, then lay glare + inner shadow over it
  g.save(); g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.arc(cx, cy, glassR, 0, TAU); g.fill(); g.restore();
  g.save(); g.beginPath(); g.arc(cx, cy, glassR, 0, TAU); g.clip();
  const inner = g.createRadialGradient(cx, cy, glassR * 0.62, cx, cy, glassR);
  inner.addColorStop(0, 'rgba(0,0,0,0)'); inner.addColorStop(1, 'rgba(0,0,0,0.62)');
  g.fillStyle = inner; g.fillRect(0, 0, S, S);
  const glare = g.createLinearGradient(cx - glassR, cy - glassR, cx + glassR * 0.2, cy + glassR * 0.2);
  glare.addColorStop(0, 'rgba(255,255,240,0.2)'); glare.addColorStop(0.45, 'rgba(255,255,240,0.05)'); glare.addColorStop(0.46, 'rgba(255,255,240,0)');
  g.fillStyle = glare; g.beginPath(); g.ellipse(cx - glassR * 0.25, cy - glassR * 0.35, glassR * 0.95, glassR * 0.6, -0.6, 0, TAU); g.fill();
  g.restore();
  return c;
}
// Static glass overlay drawn into the minimap each frame (hex mesh + scan rows), in minimap pixels.
export function paintRadarMesh(S = 200) {
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  g.strokeStyle = 'rgba(150,190,90,0.10)'; g.lineWidth = 1;
  const r = 5.5, hw = Math.sqrt(3) * r;
  for (let row = 0, y = 0; y < S + r * 2; row++, y += r * 1.5) {
    for (let x = row % 2 ? hw / 2 : 0; x < S + hw; x += hw) {
      g.beginPath();
      for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + (i * Math.PI) / 3; g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
      g.closePath(); g.stroke();
    }
  }
  g.fillStyle = 'rgba(0,0,0,0.12)';
  for (let y = 0; y < S; y += 3) g.fillRect(0, y, S, 1);
  const glow = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S * 0.55);
  glow.addColorStop(0, 'rgba(190,230,120,0.10)'); glow.addColorStop(0.6, 'rgba(190,230,120,0.03)'); glow.addColorStop(1, 'rgba(0,0,0,0.25)');
  g.fillStyle = glow; g.fillRect(0, 0, S, S);
  return c;
}
// One-off GPS grade of the world minimap (static after boot): a dark olive screen where the roads (the darkest
// thing on the source map) light up as pale lines, ground sinks, blocks glow faintly, and anything with real colour
// (the town wall, water) keeps a muted version of it. One pass over the pixels, done once.
export function tintMap(src) {
  const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(src, 0, 0);
  const img = g.getImageData(0, 0, c.width, c.height), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], gg = d[i + 1], b = d[i + 2];
    const l = (r * 0.3 + gg * 0.59 + b * 0.11) / 255, sat = (Math.max(r, gg, b) - Math.min(r, gg, b)) / 255;
    let R, G, B;
    if (l < 0.11) { R = 112; G = 140; B = 72; }                                   // road: pale olive line
    else { const k = Math.min(1, (l - 0.11) / 0.45); R = 22 + 70 * k; G = 32 + 88 * k; B = 14 + 34 * k; } // ground → blocks
    const keep = Math.max(0, sat - 0.25) * 1.2;                                   // saturated features keep some hue
    d[i] = R + (r - R) * keep; d[i + 1] = G + (gg - G) * keep; d[i + 2] = B + (b - B) * keep;
  }
  g.putImageData(img, 0, 0);
  return c;
}

// ---- analog gauge faces (food, water, speedometer, fuel) -----------------------------------------------------
// sweep: ±deg from straight up. zone: [from, to] in 0..1 painted red. ticks: major count. nums: labels at majors.
export function paintGauge(d, opts = {}, el) {
  const [c, g] = makeCanvas(d, d, el);
  const rng = makeRng(opts.seed ?? 61);
  const cx = d / 2, cy = d / 2, R = d / 2 - 1;
  const sweep = (opts.sweep ?? 115) * Math.PI / 180, a0 = -Math.PI / 2 - sweep, a1 = -Math.PI / 2 + sweep;
  const bez = Math.max(3.5, d * 0.07);
  g.fillStyle = 'rgba(0,0,0,0.55)'; g.beginPath(); g.arc(cx + 1, cy + 2, R, 0, TAU); g.fill();
  const brass = g.createLinearGradient(0, 0, d, d);
  brass.addColorStop(0, '#f0d58e'); brass.addColorStop(0.35, '#b88f45'); brass.addColorStop(0.7, '#7a5522'); brass.addColorStop(1, '#3d2a10');
  g.fillStyle = brass; g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.7)'; g.lineWidth = 1; g.stroke();
  const fr = R - bez;
  g.fillStyle = '#2a1f12'; g.beginPath(); g.arc(cx, cy, fr + 1, 0, TAU); g.fill();
  const face = g.createRadialGradient(cx - fr * 0.25, cy - fr * 0.3, fr * 0.1, cx, cy, fr);
  face.addColorStop(0, '#f6efdb'); face.addColorStop(0.7, '#e3d6b4'); face.addColorStop(1, '#bfae86');
  g.save(); g.beginPath(); g.arc(cx, cy, fr, 0, TAU); g.clip();
  g.fillStyle = face; g.fillRect(0, 0, d, d);
  grain(g, d, d, 0.16, 0.5, 0.5, 'multiply');
  for (let i = 0; i < 5; i++) soft(g, cx + rng.range(-fr, fr), cy + rng.range(-fr, fr), fr * rng.range(0.2, 0.5), '120,90,40', rng.range(0.05, 0.12));
  // red zone
  if (opts.zone) {
    const [z0, z1] = opts.zone;
    g.strokeStyle = '#b8321e'; g.lineWidth = Math.max(2, fr * 0.11);
    g.beginPath(); g.arc(cx, cy, fr * 0.84, a0 + (a1 - a0) * z0, a0 + (a1 - a0) * z1); g.stroke();
  }
  if (opts.zoneLow) {
    const [z0, z1] = opts.zoneLow;
    g.strokeStyle = 'rgba(40,110,60,0.8)'; g.lineWidth = Math.max(2, fr * 0.08);
    g.beginPath(); g.arc(cx, cy, fr * 0.84, a0 + (a1 - a0) * z0, a0 + (a1 - a0) * z1); g.stroke();
  }
  const majors = opts.ticks ?? 4, minors = opts.minor ?? 4;
  for (let i = 0; i <= majors * minors; i++) {
    const t = i / (majors * minors), a = a0 + (a1 - a0) * t, major = i % minors === 0;
    const r1 = fr * 0.93, r0 = fr * (major ? 0.74 : 0.84);
    g.strokeStyle = '#231d16'; g.lineWidth = major ? Math.max(1.1, d * 0.018) : Math.max(0.6, d * 0.009);
    g.beginPath(); g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); g.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); g.stroke();
  }
  if (opts.nums) {
    g.fillStyle = '#231d16'; g.font = `700 ${Math.round(d * 0.085)}px "${opts.font ?? 'Barlow Condensed'}"`; g.textAlign = 'center'; g.textBaseline = 'middle';
    opts.nums.forEach((n, i) => { const a = a0 + ((a1 - a0) * i) / (opts.nums.length - 1); g.fillText(n, cx + Math.cos(a) * fr * 0.58, cy + Math.sin(a) * fr * 0.58); });
  }
  if (opts.label) {
    g.fillStyle = 'rgba(35,29,22,0.85)'; g.font = `700 ${Math.max(6, Math.round(d * (opts.labelSize ?? 0.1)))}px "${opts.font ?? 'Barlow Condensed'}"`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(opts.label, cx, cy - fr * (opts.labelY ?? 0.32));
  }
  if (opts.ends) {
    g.font = `700 ${Math.round(d * 0.11)}px "${opts.font ?? 'Barlow Condensed'}"`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#9a2a18'; g.fillText(opts.ends[0], cx + Math.cos(a0) * fr * 0.5, cy + Math.sin(a0) * fr * 0.5 - fr * 0.05);
    g.fillStyle = '#231d16'; g.fillText(opts.ends[1], cx + Math.cos(a1) * fr * 0.5, cy + Math.sin(a1) * fr * 0.5 - fr * 0.05);
  }
  // inner shadow + glass glare
  const sh = g.createRadialGradient(cx, cy, fr * 0.7, cx, cy, fr);
  sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(40,24,8,0.45)');
  g.fillStyle = sh; g.fillRect(0, 0, d, d);
  g.restore();
  g.save(); g.beginPath(); g.arc(cx, cy, fr, 0, TAU); g.clip();
  const gl = g.createLinearGradient(cx - fr, cy - fr, cx, cy);
  gl.addColorStop(0, 'rgba(255,255,255,0.32)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gl; g.beginPath(); g.ellipse(cx - fr * 0.2, cy - fr * 0.45, fr * 0.85, fr * 0.45, -0.35, 0, TAU); g.fill();
  g.restore();
  g.strokeStyle = 'rgba(255,240,200,0.5)'; g.lineWidth = 0.8; g.beginPath(); g.arc(cx, cy, R - 1, Math.PI * 1.05, Math.PI * 1.6); g.stroke();
  return c;
}

// ---- cloth flag patch: the real flag, woven, folded, frayed, stitched ---------------------------------------
export function paintClothFlag(code, w = 132, h = 84, el) {
  const pad = 7;
  const [c, g] = makeCanvas(w, h, el);
  const rng = makeRng(71 + code.charCodeAt(0) * 3 + code.charCodeAt(1));
  const fw = w - pad * 2, fh = h - pad * 2;
  const flag = document.createElement('canvas'); flag.width = fw * DPR; flag.height = fh * DPR;
  const fg = flag.getContext('2d'); fg.scale(DPR, DPR);
  (FLAGS[code] ?? FLAGS.US).draw(fg, fw, fh);
  // frayed outline
  const p = new Path2D();
  const step = 2.2;
  const pts = [];
  for (let x = 0; x <= fw; x += step) pts.push([pad + x, pad + rng.range(-0.6, 1.4)]);
  for (let y = 0; y <= fh; y += step) pts.push([pad + fw - rng.range(-0.6, 2.2), pad + y]);
  for (let x = fw; x >= 0; x -= step) pts.push([pad + x, pad + fh - rng.range(-0.6, 1.4)]);
  for (let y = fh; y >= 0; y -= step) pts.push([pad + rng.range(-0.6, 1.2), pad + y]);
  pts.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y))); p.closePath();
  g.save();
  g.translate(2, 3); g.fillStyle = 'rgba(0,0,0,0.45)'; g.fill(p); g.translate(-2, -3);
  g.clip(p);
  g.drawImage(flag, pad, pad, fw, fh);
  // folds: soft vertical waves of light and shade
  for (let x = 0; x < w; x += 1) {
    const k = Math.sin(x * 0.085 + 0.7) * 0.6 + Math.sin(x * 0.21 + 2.1) * 0.25 + Math.sin(x * 0.04) * 0.3;
    g.fillStyle = k > 0 ? `rgba(255,248,230,${(k * 0.12).toFixed(3)})` : `rgba(10,6,2,${(-k * 0.22).toFixed(3)})`;
    g.fillRect(x, 0, 1, h);
  }
  // weave
  g.fillStyle = 'rgba(0,0,0,0.09)'; for (let y = 0; y < h; y += 1.5) g.fillRect(0, y, w, 0.5);
  g.fillStyle = 'rgba(255,255,255,0.05)'; for (let x = 0; x < w; x += 1.5) g.fillRect(x, 0, 0.5, h);
  grain(g, w, h, 0.25, 0.5, 0.5, 'multiply');
  // grime and sun-fade
  for (let i = 0; i < 10; i++) soft(g, rng() * w, rng() * h, rng.range(8, 30), rng() < 0.7 ? '70,50,24' : '230,215,180', rng.range(0.06, 0.16));
  const edge = g.createLinearGradient(0, 0, 0, h);
  edge.addColorStop(0, 'rgba(60,40,15,0.15)'); edge.addColorStop(0.5, 'rgba(60,40,15,0)'); edge.addColorStop(1, 'rgba(60,40,15,0.25)');
  g.fillStyle = edge; g.fillRect(0, 0, w, h);
  // stitched hem
  g.setLineDash([3, 2.2]); g.lineWidth = 0.9;
  g.strokeStyle = 'rgba(0,0,0,0.35)'; g.strokeRect(pad + 3.6, pad + 3.6, fw - 6.4, fh - 6.4);
  g.strokeStyle = 'rgba(245,235,210,0.55)'; g.strokeRect(pad + 3, pad + 3, fw - 6, fh - 6);
  g.restore();
  // loose threads
  g.save(); g.lineWidth = 0.6; g.lineCap = 'round';
  for (let i = 0; i < 16; i++) {
    const side = Math.floor(rng() * 4), t = rng();
    const [x, y, nx, ny] = side === 0 ? [pad + t * fw, pad, 0, -1] : side === 1 ? [pad + fw, pad + t * fh, 1, 0] : side === 2 ? [pad + t * fw, pad + fh, 0, 1] : [pad, pad + t * fh, -1, 0];
    const len = rng.range(2, 6);
    g.strokeStyle = rng() < 0.5 ? 'rgba(235,225,200,0.8)' : 'rgba(150,40,30,0.7)';
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + nx * len * 0.6 + rng.range(-2, 2), y + ny * len * 0.6 + rng.range(-2, 2), x + nx * len + rng.range(-2, 2), y + ny * len + rng.range(-2, 2)); g.stroke();
  }
  g.restore();
  return c;
}

// ---- sprites: cartridges (full + spent) and throwables -------------------------------------------------------
export const CART = { w: 14, h: 48 };
const CART_KINDS = ['smg', 'pistol', 'shell'];
function cartridge(g, x0, kind, spent) {
  const { w, h } = CART, cx = x0 + w / 2;
  const cyl = (x, y, ww, hh, cols) => {
    const grd = g.createLinearGradient(x, 0, x + ww, 0);
    cols.forEach(([t, col]) => grd.addColorStop(t, col));
    g.fillStyle = grd; g.fillRect(x, y, ww, hh);
  };
  const brass = spent ? [[0, '#1d160c'], [0.3, '#3d3018'], [0.55, '#2f2512'], [1, '#140f08']] : [[0, '#5b3f12'], [0.28, '#f2d27a'], [0.45, '#d6ad4c'], [0.75, '#9a7224'], [1, '#4a3410']];
  const copper = spent ? [[0, '#1a110a'], [0.3, '#3a2616'], [1, '#120c06']] : [[0, '#5a2710'], [0.3, '#e59a62'], [0.5, '#c4693a'], [1, '#55230e']];
  const red = spent ? [[0, '#1c0c08'], [0.3, '#3a1a12'], [1, '#120806']] : [[0, '#4a0e08'], [0.3, '#d2483a'], [0.55, '#a8281e'], [1, '#40100a']];
  if (kind === 'shell') {
    const bw = w - 1, x = x0 + 0.5;
    cyl(x, 3, bw, h - 15, red);
    g.fillStyle = spent ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.35)'; for (let i = 0; i < 3; i++) g.fillRect(x, 4 + i * 2.2, bw, 0.8); // crimp
    cyl(x - 0.5, h - 12, bw + 1, 10, brass);
    cyl(x - 1, h - 3, bw + 2, 2.5, brass);
  } else {
    const short = kind === 'pistol';
    const caseTop = Math.round(h * (short ? 0.39 : 0.43)), bw = short ? w - 2 : w - 3, x = x0 + (w - bw) / 2;
    cyl(x, caseTop, bw, h - caseTop - 3, brass);
    cyl(x - 0.6, h - 3.5, bw + 1.2, 3, brass);                       // rim
    g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(x, h - 5.2, bw, 0.9); // extractor groove
    // the bullet: an ogive on a short shank
    const top = Math.round(h * (short ? 0.13 : 0.09)), bwB = bw - 1.4, xb = cx - bwB / 2;
    g.save();
    g.beginPath(); g.moveTo(xb, caseTop + 1); g.lineTo(xb, top + bwB * 0.9); g.quadraticCurveTo(xb, top, cx, top); g.quadraticCurveTo(xb + bwB, top, xb + bwB, top + bwB * 0.9); g.lineTo(xb + bwB, caseTop + 1); g.closePath();
    g.clip();
    cyl(xb, top, bwB, caseTop - top + 1, copper);
    g.restore();
    g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(x, caseTop, bw, 0.8);
  }
  if (!spent) { g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(x0 + w * 0.32, 8, 0.9, h - 14); }
}
export function cartridgeSprite() {
  const [c, g] = makeCanvas(CART.w * CART_KINDS.length * 2, CART.h);
  CART_KINDS.forEach((k, i) => { cartridge(g, i * 2 * CART.w, k, false); cartridge(g, (i * 2 + 1) * CART.w, k, true); });
  return c.toDataURL();
}
export const CART_INDEX = Object.fromEntries(CART_KINDS.map((k, i) => [k, i]));

export const THROW_ICON = { w: 40, h: 50 };
export const THROW_KINDS = ['frag', 'molotov', 'smoke', 'flash', 'pipe', 'sticky', 'rock'];
function throwIcon(g, x0, kind) {
  const { w, h } = THROW_ICON, cx = x0 + w / 2;
  const shade = (x, y, ww, hh, cols, r = 0) => { const grd = g.createLinearGradient(x, 0, x + ww, 0); cols.forEach(([t, col]) => grd.addColorStop(t, col)); g.fillStyle = grd; g.beginPath(); g.roundRect(x, y, ww, hh, r); g.fill(); };
  g.save();
  g.shadowColor = 'rgba(0,0,0,0.6)'; g.shadowOffsetX = 1.5; g.shadowOffsetY = 2; g.shadowBlur = 2;
  if (kind === 'frag') {
    const body = g.createRadialGradient(cx - 5, 27, 2, cx, 31, 15);
    body.addColorStop(0, '#8d9a5a'); body.addColorStop(0.6, '#4f5a2c'); body.addColorStop(1, '#262b14');
    g.fillStyle = body; g.beginPath(); g.ellipse(cx, 32, 11.5, 14, 0, 0, TAU); g.fill();
    g.shadowColor = 'transparent';
    g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 0.9;
    for (let i = -2; i <= 2; i++) { g.beginPath(); g.ellipse(cx, 32, Math.abs(i) * 4 + 0.5, 14, 0, 0, TAU); g.stroke(); }
    for (let y = 22; y < 44; y += 4.5) { const hw = Math.sqrt(Math.max(0, 1 - ((y - 32) / 14) ** 2)) * 11.5; g.beginPath(); g.moveTo(cx - hw, y); g.lineTo(cx + hw, y); g.stroke(); }
    shade(cx - 5, 13, 10, 7, [[0, '#3a3a36'], [0.4, '#a8a69c'], [1, '#3a3a36']], 1.5);
    g.fillStyle = '#6e6c64'; g.beginPath(); g.moveTo(cx + 3, 13); g.lineTo(cx + 14, 17); g.lineTo(cx + 13, 36); g.lineTo(cx + 10, 35); g.lineTo(cx + 10, 19); g.closePath(); g.fill();
    g.strokeStyle = '#c9c6ba'; g.lineWidth = 1.6; g.beginPath(); g.arc(cx - 9, 13, 5, 0, TAU); g.stroke();
  } else if (kind === 'molotov') {
    shade(cx - 9, 22, 18, 26, [[0, '#2a1806'], [0.35, '#8a5a1c'], [0.6, '#5a3a10'], [1, '#1e1004']], 6);
    shade(cx - 4, 10, 8, 14, [[0, '#2a1806'], [0.4, '#8a5a1c'], [1, '#1e1004']], 2);
    g.shadowColor = 'transparent';
    g.fillStyle = 'rgba(255,220,150,0.35)'; g.fillRect(cx - 5, 26, 2, 16);
    g.fillStyle = '#c9b48a'; g.beginPath(); g.moveTo(cx - 5, 12); g.quadraticCurveTo(cx - 9, 2, cx - 2, 3); g.quadraticCurveTo(cx + 6, 1, cx + 5, 12); g.closePath(); g.fill();
    g.fillStyle = '#9a2a18'; g.beginPath(); g.moveTo(cx - 1, 4); g.quadraticCurveTo(cx + 9, 0, cx + 12, 6); g.lineTo(cx + 4, 9); g.closePath(); g.fill();
  } else if (kind === 'smoke') {
    shade(cx - 9, 12, 18, 34, [[0, '#2b2c28'], [0.35, '#9a9c92'], [0.6, '#6c6e66'], [1, '#22231f']], 3);
    g.shadowColor = 'transparent';
    g.fillStyle = '#c8b25a'; g.fillRect(cx - 9, 26, 18, 4);
    shade(cx - 4, 7, 8, 6, [[0, '#333'], [0.5, '#aaa'], [1, '#333']], 1);
  } else if (kind === 'flash') {
    shade(cx - 8, 12, 16, 34, [[0, '#2b2c28'], [0.3, '#d8d8cf'], [0.6, '#8d8e86'], [1, '#22231f']], 3);
    g.shadowColor = 'transparent';
    g.fillStyle = '#1a1a18'; for (let y = 16; y < 42; y += 6) for (const dx of [-3, 3]) { g.beginPath(); g.arc(cx + dx, y, 1.4, 0, TAU); g.fill(); }
    shade(cx - 4, 7, 8, 6, [[0, '#333'], [0.5, '#bbb'], [1, '#333']], 1);
  } else if (kind === 'pipe') {
    shade(cx - 7, 10, 14, 36, [[0, '#2a2622'], [0.35, '#8c857a'], [0.6, '#5d574e'], [1, '#1d1a17']], 1);
    g.shadowColor = 'transparent';
    shade(cx - 9, 8, 18, 6, [[0, '#2a2622'], [0.4, '#a29a8c'], [1, '#1d1a17']], 1.5);
    shade(cx - 9, 42, 18, 6, [[0, '#2a2622'], [0.4, '#a29a8c'], [1, '#1d1a17']], 1.5);
    g.strokeStyle = '#b5652a'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(cx, 8); g.quadraticCurveTo(cx + 6, 0, cx + 12, 4); g.stroke();
  } else if (kind === 'sticky') {
    const body = g.createRadialGradient(cx - 4, 24, 2, cx, 28, 15);
    body.addColorStop(0, '#9a4a2a'); body.addColorStop(1, '#3a140a');
    g.fillStyle = body; g.beginPath(); g.ellipse(cx, 29, 14, 12, 0, 0, TAU); g.fill();
    g.shadowColor = 'transparent';
    g.fillStyle = '#ff4a2a'; g.beginPath(); g.arc(cx, 26, 2.5, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,120,80,0.35)'; g.beginPath(); g.arc(cx, 26, 5.5, 0, TAU); g.fill();
  } else {
    const body = g.createRadialGradient(cx - 4, 26, 2, cx, 30, 15);
    body.addColorStop(0, '#9a8a72'); body.addColorStop(1, '#3c3224');
    g.fillStyle = body; g.beginPath(); g.moveTo(cx - 12, 34); g.lineTo(cx - 8, 20); g.lineTo(cx + 3, 17); g.lineTo(cx + 13, 25); g.lineTo(cx + 11, 40); g.lineTo(cx - 4, 43); g.closePath(); g.fill();
  }
  g.restore();
}
export function throwSprite() {
  const [c, g] = makeCanvas(THROW_ICON.w * THROW_KINDS.length, THROW_ICON.h);
  THROW_KINDS.forEach((k, i) => throwIcon(g, i * THROW_ICON.w, k));
  return c.toDataURL();
}
