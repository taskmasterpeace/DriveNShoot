import { makeRng } from '../engine/rng.js';

// Procedural portraits. Everybody's from somewhere: the person's flag is the backdrop.

const W = 200, H = 240;

// ---- flags (drawn as real geometry, never emoji letters) ---------------------------
function stripesH(g, w, h, cols, weights) {
  const total = (weights ?? cols.map(() => 1)).reduce((a, b) => a + b, 0);
  let y = 0;
  cols.forEach((c, i) => { const hh = (h * (weights ? weights[i] : 1)) / total; g.fillStyle = c; g.fillRect(0, y, w, hh + 1); y += hh; });
}
function stripesV(g, w, h, cols) { cols.forEach((c, i) => { g.fillStyle = c; g.fillRect((w / cols.length) * i, 0, w / cols.length + 1, h); }); }
function star(g, cx, cy, r, color, points = 5) {
  g.fillStyle = color; g.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const rr = i % 2 ? r * 0.42 : r, a = (i * Math.PI) / points - Math.PI / 2;
    g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  g.closePath(); g.fill();
}

export const FLAGS = {
  US: { name: 'United States', draw(g, w, h) {
    for (let i = 0; i < 13; i++) { g.fillStyle = i % 2 ? '#fff' : '#b22234'; g.fillRect(0, (h / 13) * i, w, h / 13 + 1); }
    g.fillStyle = '#3c3b6e'; g.fillRect(0, 0, w * 0.4, h * (7 / 13));
    for (let r = 0; r < 5; r++) for (let c = 0; c < 6; c++) star(g, w * 0.4 * ((c + 0.5) / 6), h * (7 / 13) * ((r + 0.5) / 5), w * 0.018, '#fff');
  } },
  MX: { name: 'Mexico', draw(g, w, h) {
    stripesV(g, w, h, ['#006847', '#fff', '#ce1126']);
    g.fillStyle = '#8c5a2b'; g.beginPath(); g.ellipse(w / 2, h / 2, w * 0.07, h * 0.1, 0, 0, 7); g.fill();
    g.fillStyle = '#4c7a34'; g.beginPath(); g.ellipse(w / 2, h / 2 + h * 0.1, w * 0.08, h * 0.03, 0, 0, 7); g.fill();
  } },
  CA: { name: 'Canada', draw(g, w, h) {
    g.fillStyle = '#d52b1e'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#fff'; g.fillRect(w * 0.25, 0, w * 0.5, h);
    const cx = w / 2, cy = h / 2, s = Math.min(w * 0.5, h) * 0.38;
    const leaf = [[0, -1], [0.12, -0.72], [0.32, -0.8], [0.26, -0.42], [0.62, -0.62], [0.54, -0.3], [0.78, -0.18], [0.44, 0.06], [0.5, 0.26], [0.08, 0.2], [0.06, 0.62], [-0.06, 0.62], [-0.08, 0.2], [-0.5, 0.26], [-0.44, 0.06], [-0.78, -0.18], [-0.54, -0.3], [-0.62, -0.62], [-0.26, -0.42], [-0.32, -0.8], [-0.12, -0.72]];
    g.fillStyle = '#d52b1e'; g.beginPath(); leaf.forEach(([x, y]) => g.lineTo(cx + x * s, cy + y * s)); g.closePath(); g.fill();
  } },
  CU: { name: 'Cuba', draw(g, w, h) {
    for (let i = 0; i < 5; i++) { g.fillStyle = i % 2 ? '#fff' : '#002a8f'; g.fillRect(0, (h / 5) * i, w, h / 5 + 1); }
    g.fillStyle = '#cf142b'; g.beginPath(); g.moveTo(0, 0); g.lineTo(w * 0.43, h / 2); g.lineTo(0, h); g.fill();
    star(g, w * 0.15, h / 2, h * 0.13, '#fff');
  } },
  JM: { name: 'Jamaica', draw(g, w, h) {
    g.fillStyle = '#009b3a'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#000'; g.beginPath(); g.moveTo(0, 0); g.lineTo(w / 2, h / 2); g.lineTo(0, h); g.fill();
    g.beginPath(); g.moveTo(w, 0); g.lineTo(w / 2, h / 2); g.lineTo(w, h); g.fill();
    g.strokeStyle = '#fed100'; g.lineWidth = h * 0.12;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(w, h); g.moveTo(w, 0); g.lineTo(0, h); g.stroke();
  } },
  IE: { name: 'Ireland', draw(g, w, h) { stripesV(g, w, h, ['#169b62', '#fff', '#ff883e']); } },
  NG: { name: 'Nigeria', draw(g, w, h) { stripesV(g, w, h, ['#008751', '#fff', '#008751']); } },
  IT: { name: 'Italy', draw(g, w, h) { stripesV(g, w, h, ['#009246', '#fff', '#ce2b37']); } },
  DE: { name: 'Germany', draw(g, w, h) { stripesH(g, w, h, ['#000', '#dd0000', '#ffce00']); } },
  CO: { name: 'Colombia', draw(g, w, h) { stripesH(g, w, h, ['#fcd116', '#003893', '#ce1126'], [2, 1, 1]); } },
  HT: { name: 'Haiti', draw(g, w, h) {
    stripesH(g, w, h, ['#00209f', '#d21034']);
    g.fillStyle = '#fff'; g.fillRect(w * 0.38, h * 0.32, w * 0.24, h * 0.36);
    g.fillStyle = '#4c7a34'; g.fillRect(w * 0.47, h * 0.38, w * 0.06, h * 0.22);
  } },
  GH: { name: 'Ghana', draw(g, w, h) { stripesH(g, w, h, ['#ce1126', '#fcd116', '#006b3f']); star(g, w / 2, h / 2, h * 0.15, '#000'); } },
  JP: { name: 'Japan', draw(g, w, h) { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.fillStyle = '#bc002d'; g.beginPath(); g.arc(w / 2, h / 2, h * 0.3, 0, 7); g.fill(); } },
  VN: { name: 'Vietnam', draw(g, w, h) { g.fillStyle = '#da251d'; g.fillRect(0, 0, w, h); star(g, w / 2, h / 2, h * 0.3, '#ffff00'); } },
  PH: { name: 'Philippines', draw(g, w, h) {
    stripesH(g, w, h, ['#0038a8', '#ce1126']);
    g.fillStyle = '#fff'; g.beginPath(); g.moveTo(0, 0); g.lineTo(w * 0.43, h / 2); g.lineTo(0, h); g.fill();
    g.fillStyle = '#fcd116'; g.beginPath(); g.arc(w * 0.15, h / 2, h * 0.09, 0, 7); g.fill();
  } },
  KR: { name: 'South Korea', draw(g, w, h) {
    g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
    const r = h * 0.25, cx = w / 2, cy = h / 2;
    g.fillStyle = '#cd2e3a'; g.beginPath(); g.arc(cx, cy, r, Math.PI, 0); g.fill();
    g.fillStyle = '#0047a0'; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI); g.fill();
    g.fillStyle = '#cd2e3a'; g.beginPath(); g.arc(cx - r / 2, cy, r / 2, 0, 7); g.fill();
    g.fillStyle = '#0047a0'; g.beginPath(); g.arc(cx + r / 2, cy, r / 2, 0, 7); g.fill();
  } },
  BR: { name: 'Brazil', draw(g, w, h) {
    g.fillStyle = '#009c3b'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffdf00'; g.beginPath(); g.moveTo(w / 2, h * 0.1); g.lineTo(w * 0.92, h / 2); g.lineTo(w / 2, h * 0.9); g.lineTo(w * 0.08, h / 2); g.fill();
    g.fillStyle = '#002776'; g.beginPath(); g.arc(w / 2, h / 2, h * 0.22, 0, 7); g.fill();
  } },
  PR: { name: 'Puerto Rico', draw(g, w, h) {
    for (let i = 0; i < 5; i++) { g.fillStyle = i % 2 ? '#fff' : '#ed0000'; g.fillRect(0, (h / 5) * i, w, h / 5 + 1); }
    g.fillStyle = '#0050f0'; g.beginPath(); g.moveTo(0, 0); g.lineTo(w * 0.43, h / 2); g.lineTo(0, h); g.fill();
    star(g, w * 0.15, h / 2, h * 0.13, '#fff');
  } },
};
export const FLAG_KEYS = Object.keys(FLAGS);

export function drawFlag(code, w = 60, h = 40) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  FLAGS[code].draw(c.getContext('2d'), w, h);
  return c;
}

const SKINS = ['#f1c9a5', '#e0ac85', '#c68863', '#a86b45', '#8d5532', '#6e3f22', '#4f2c17'];
const HAIRS = ['#1b1410', '#3b2516', '#6a4428', '#a0794a', '#c9b48a', '#8a8682', '#d8d4cc', '#b0301e'];

// Portrait = flag backdrop (darkened, worn) + bust drawn from a seed.
export function drawPortrait(p) {
  const rng = makeRng(p.seed ?? 7);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  FLAGS[p.flag ?? 'US'].draw(g, W, H);
  // Weather the flag: grime, vignette, scanline.
  g.fillStyle = 'rgba(20,14,8,0.42)'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(30,20,10,${rng() * 0.25})`; g.fillRect(rng() * W, rng() * H, rng() * 6, rng() * 6); }
  const vg = g.createRadialGradient(W / 2, H * 0.45, H * 0.2, W / 2, H * 0.5, H * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.75)');
  g.fillStyle = vg; g.fillRect(0, 0, W, H);

  const skin = p.skin ?? rng.pick(SKINS);
  const hair = p.hair ?? rng.pick(HAIRS);
  const shirt = p.shirt ?? rng.pick(['#5a4a38', '#3d4a3a', '#6b3a24', '#2f3b42', '#4a3f35']);
  const shade = (hex, k) => {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.max(0, Math.min(255, ((n >> 16) & 255) * k)), gg = Math.max(0, Math.min(255, ((n >> 8) & 255) * k)), b = Math.max(0, Math.min(255, (n & 255) * k));
    return `rgb(${r | 0},${gg | 0},${b | 0})`;
  };
  const cx = W / 2;
  // Shoulders / jacket.
  g.fillStyle = shirt;
  g.beginPath(); g.moveTo(cx - 92, H); g.quadraticCurveTo(cx - 88, 178, cx - 40, 168); g.lineTo(cx + 40, 168); g.quadraticCurveTo(cx + 88, 178, cx + 92, H); g.fill();
  g.fillStyle = shade(shirt, 0.7);
  g.beginPath(); g.moveTo(cx - 22, 168); g.lineTo(cx, 205); g.lineTo(cx + 22, 168); g.fill();
  if (p.gear === 'bandolier' || rng.chance(0.25)) {
    g.strokeStyle = '#3a2a1a'; g.lineWidth = 9; g.beginPath(); g.moveTo(cx - 70, 180); g.lineTo(cx + 50, H); g.stroke();
    g.fillStyle = '#c9a24a'; for (let i = 0; i < 6; i++) g.fillRect(cx - 62 + i * 18, 183 + i * 10, 4, 7);
  }
  // Neck + head.
  g.fillStyle = shade(skin, 0.85); g.fillRect(cx - 17, 140, 34, 34);
  const headW = rng.range(46, 54), headH = rng.range(58, 66);
  g.fillStyle = skin; g.beginPath(); g.ellipse(cx, 112, headW, headH, 0, 0, 7); g.fill();
  // Ears.
  g.beginPath(); g.ellipse(cx - headW + 2, 115, 7, 12, 0, 0, 7); g.ellipse(cx + headW - 2, 115, 7, 12, 0, 0, 7); g.fill();
  // Cheek shadow.
  g.fillStyle = 'rgba(0,0,0,0.12)'; g.beginPath(); g.ellipse(cx + headW * 0.45, 125, headW * 0.35, headH * 0.6, 0, 0, 7); g.fill();
  // Eyes.
  const eyeY = 108 + rng.range(-3, 3), eyeDX = rng.range(17, 21);
  for (const s of [-1, 1]) {
    g.fillStyle = '#eee8dc'; g.beginPath(); g.ellipse(cx + s * eyeDX, eyeY, 8, 4.5, 0, 0, 7); g.fill();
    g.fillStyle = rng.pick(['#3a2614', '#2a3a3a', '#4a5a2a', '#1a1a1a', '#5a7a8a']); g.beginPath(); g.arc(cx + s * eyeDX, eyeY, 3.6, 0, 7); g.fill();
    g.fillStyle = '#000'; g.beginPath(); g.arc(cx + s * eyeDX, eyeY, 1.6, 0, 7); g.fill();
    g.strokeStyle = shade(hair, 0.9); g.lineWidth = 4; g.lineCap = 'round';
    g.beginPath(); g.moveTo(cx + s * (eyeDX - 9), eyeY - 10 + rng.range(-2, 2)); g.lineTo(cx + s * (eyeDX + 9), eyeY - 11 + (p.mood === 'angry' ? s * -0 + 4 : rng.range(-3, 1))); g.stroke();
  }
  // Nose + mouth.
  g.strokeStyle = shade(skin, 0.65); g.lineWidth = 2.5;
  g.beginPath(); g.moveTo(cx - 2, eyeY + 6); g.lineTo(cx - 7, eyeY + 26); g.lineTo(cx + 4, eyeY + 28); g.stroke();
  g.strokeStyle = shade(skin, 0.5); g.lineWidth = 3;
  g.beginPath(); const my = eyeY + 42;
  if (p.mood === 'smile') { g.moveTo(cx - 14, my - 2); g.quadraticCurveTo(cx, my + 8, cx + 14, my - 2); }
  else if (p.mood === 'angry') { g.moveTo(cx - 13, my + 3); g.quadraticCurveTo(cx, my - 4, cx + 13, my + 3); }
  else { g.moveTo(cx - 12, my); g.lineTo(cx + 12, my + rng.range(-1, 1)); }
  g.stroke();
  // Beard / stubble.
  if (p.beard ?? rng.chance(0.4)) {
    g.fillStyle = hair; g.globalAlpha = 0.85;
    g.beginPath(); g.moveTo(cx - headW + 6, 118); g.quadraticCurveTo(cx - headW + 10, 172, cx, 178); g.quadraticCurveTo(cx + headW - 10, 172, cx + headW - 6, 118);
    g.quadraticCurveTo(cx + 20, 150, cx, my + 4); g.quadraticCurveTo(cx - 20, 150, cx - headW + 6, 118); g.fill();
    g.globalAlpha = 1;
  }
  // Hair / hat.
  const style = p.hat ?? rng.pick(['short', 'long', 'bald', 'mohawk', 'cap', 'cowboy', 'wrap']);
  g.fillStyle = hair;
  if (style === 'short') { g.beginPath(); g.ellipse(cx, 78, headW + 2, 30, 0, Math.PI, 0); g.fill(); }
  else if (style === 'long') { g.beginPath(); g.ellipse(cx, 82, headW + 6, 34, 0, Math.PI, 0); g.fill(); g.fillRect(cx - headW - 6, 80, 16, 80); g.fillRect(cx + headW - 10, 80, 16, 80); }
  else if (style === 'mohawk') { g.fillRect(cx - 9, 34, 18, 46); }
  else if (style === 'cap') { g.fillStyle = rng.pick(['#4a3a2a', '#2f3b42', '#6b3a24']); g.beginPath(); g.ellipse(cx, 80, headW + 3, 30, 0, Math.PI, 0); g.fill(); g.fillRect(cx - 10, 74, headW + 34, 10); }
  else if (style === 'cowboy') {
    g.fillStyle = '#5a3f24'; g.beginPath(); g.ellipse(cx, 76, headW + 40, 12, 0, 0, 7); g.fill();
    g.beginPath(); g.moveTo(cx - headW + 4, 76); g.quadraticCurveTo(cx - headW + 6, 34, cx, 40); g.quadraticCurveTo(cx + headW - 6, 34, cx + headW - 4, 76); g.fill();
    g.fillStyle = '#2a1d12'; g.fillRect(cx - headW + 4, 66, headW * 2 - 8, 8);
  } else if (style === 'wrap') { g.fillStyle = rng.pick(['#7a6a4a', '#5a2a1a', '#3a4a3a']); g.beginPath(); g.ellipse(cx, 82, headW + 8, 36, 0, Math.PI, 0); g.fill(); }
  // Wasteland accessories.
  const acc = p.gear ?? rng.pick(['none', 'goggles', 'scar', 'bandana', 'none', 'eyepatch']);
  if (acc === 'goggles') {
    g.fillStyle = '#2a2622'; g.fillRect(cx - headW, 72, headW * 2, 8);
    for (const s of [-1, 1]) { g.fillStyle = '#3a3632'; g.beginPath(); g.arc(cx + s * 20, 76, 13, 0, 7); g.fill(); g.fillStyle = '#c98a3a'; g.beginPath(); g.arc(cx + s * 20, 76, 9, 0, 7); g.fill(); }
  } else if (acc === 'scar') {
    g.strokeStyle = '#7a2a22'; g.lineWidth = 3; g.beginPath(); g.moveTo(cx + 10, 90); g.lineTo(cx + 34, 140); g.stroke();
  } else if (acc === 'bandana') {
    g.fillStyle = rng.pick(['#8a1c14', '#2a3a5a', '#3a3a2a']);
    g.beginPath(); g.moveTo(cx - headW + 2, 128); g.lineTo(cx + headW - 2, 128); g.lineTo(cx + headW - 8, 160); g.lineTo(cx, 182); g.lineTo(cx - headW + 8, 160); g.fill();
  } else if (acc === 'eyepatch') {
    g.fillStyle = '#111'; g.beginPath(); g.ellipse(cx - eyeDX, eyeY, 11, 9, 0, 0, 7); g.fill();
    g.strokeStyle = '#111'; g.lineWidth = 2; g.beginPath(); g.moveTo(cx - headW, 92); g.lineTo(cx + headW, 100); g.stroke();
  }
  // Dust grain.
  for (let i = 0; i < 500; i++) { g.fillStyle = `rgba(${rng() < 0.5 ? '255,230,200' : '0,0,0'},${rng() * 0.08})`; g.fillRect(rng() * W, rng() * H, 1.5, 1.5); }
  return c;
}
