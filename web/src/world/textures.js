import * as THREE from 'three';
import { makeRng } from '../engine/rng.js';

// Every texture is painted procedurally at boot: zero downloads, tiny build.

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function tex(c, repeat = true) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

function noise(g, w, h, rng, count, colors, size = [1, 3], alpha = [0.05, 0.25]) {
  for (let i = 0; i < count; i++) {
    g.globalAlpha = rng.range(alpha[0], alpha[1]);
    g.fillStyle = rng.pick(colors);
    const s = rng.range(size[0], size[1]);
    g.fillRect(rng() * w, rng() * h, s, s);
  }
  g.globalAlpha = 1;
}

function cracks(g, w, h, rng, n, color, width = 1.2) {
  g.strokeStyle = color;
  g.lineWidth = width;
  for (let i = 0; i < n; i++) {
    let x = rng() * w, y = rng() * h, a = rng() * Math.PI * 2;
    g.beginPath(); g.moveTo(x, y);
    const segs = 4 + ((rng() * 8) | 0);
    for (let s = 0; s < segs; s++) {
      a += rng.range(-0.9, 0.9);
      x += Math.cos(a) * rng.range(6, 18); y += Math.sin(a) * rng.range(6, 18);
      g.lineTo(x, y);
    }
    g.stroke();
  }
}

export function sandTexture() {
  const rng = makeRng(11);
  const [c, g] = canvas(512);
  g.fillStyle = '#a77d52'; g.fillRect(0, 0, 512, 512);
  // Large soft patches for dune variation.
  for (let i = 0; i < 60; i++) {
    const x = rng() * 512, y = rng() * 512, r = rng.range(30, 120);
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    const col = rng.pick(['rgba(140,98,60,', 'rgba(184,142,96,', 'rgba(120,84,52,']);
    gr.addColorStop(0, col + '0.35)'); gr.addColorStop(1, col + '0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  noise(g, 512, 512, rng, 9000, ['#5e4127', '#c7a074', '#87613d', '#3f2b1a'], [1, 2.5]);
  cracks(g, 512, 512, rng, 14, 'rgba(60,40,24,0.35)', 1);
  // Scrub tufts like the reference footage.
  for (let i = 0; i < 70; i++) {
    const x = rng() * 512, y = rng() * 512;
    g.fillStyle = rng.pick(['rgba(92,88,48,0.8)', 'rgba(70,64,36,0.8)', 'rgba(110,96,58,0.8)']);
    for (let k = 0; k < 9; k++) g.fillRect(x + rng.range(-4, 4), y + rng.range(-4, 4), 2, 2);
  }
  const t = tex(c);
  return t;
}

export function asphaltTexture() {
  const rng = makeRng(23);
  const [c, g] = canvas(256);
  g.fillStyle = '#34312e'; g.fillRect(0, 0, 256, 256);
  noise(g, 256, 256, rng, 5000, ['#1d1c1a', '#4a4641', '#2a2826', '#5a554e'], [1, 2]);
  // Sun-bleached patches + potholes.
  for (let i = 0; i < 8; i++) {
    const x = rng() * 256, y = rng() * 256, r = rng.range(10, 34);
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(90,80,66,0.35)'); gr.addColorStop(1, 'rgba(90,80,66,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < 3; i++) {
    g.fillStyle = 'rgba(14,13,12,0.85)';
    g.beginPath(); g.ellipse(rng() * 256, rng.range(40, 216), rng.range(4, 9), rng.range(3, 7), rng() * 3, 0, 7); g.fill();
  }
  cracks(g, 256, 256, rng, 10, 'rgba(10,10,10,0.6)', 1.1);
  // Faded lane markings: dashed center line (V = 0.5) and solid edge lines.
  g.fillStyle = 'rgba(214,170,60,0.55)';
  for (let x = 0; x < 256; x += 64) g.fillRect(x + 8, 125, 34, 5);
  g.fillStyle = 'rgba(210,205,190,0.32)';
  g.fillRect(0, 14, 256, 3); g.fillRect(0, 239, 256, 3);
  // Sand drifting onto the edges.
  for (let side of [0, 1]) {
    const gr = g.createLinearGradient(0, side ? 256 : 0, 0, side ? 216 : 40);
    gr.addColorStop(0, 'rgba(167,125,82,0.7)'); gr.addColorStop(1, 'rgba(167,125,82,0)');
    g.fillStyle = gr; g.fillRect(0, side ? 216 : 0, 256, 40);
  }
  return tex(c);
}

export function concreteTexture(base = '#8c8478') {
  const rng = makeRng(31);
  const [c, g] = canvas(256);
  g.fillStyle = base; g.fillRect(0, 0, 256, 256);
  noise(g, 256, 256, rng, 3000, ['#5b554d', '#a49c90', '#6e675e'], [1, 2]);
  g.strokeStyle = 'rgba(40,36,32,0.35)'; g.lineWidth = 1.5;
  for (let i = 0; i <= 256; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 256); g.moveTo(0, i); g.lineTo(256, i); g.stroke(); }
  cracks(g, 256, 256, rng, 6, 'rgba(30,26,22,0.45)');
  return tex(c);
}

export function floorTexture() {
  const rng = makeRng(41);
  const [c, g] = canvas(256);
  g.fillStyle = '#5c4a3a'; g.fillRect(0, 0, 256, 256);
  // Old plank floor.
  for (let y = 0; y < 256; y += 16) {
    g.fillStyle = rng.pick(['#5a4636', '#64503d', '#4e3d2f', '#6a5542']);
    g.fillRect(0, y, 256, 15);
    g.fillStyle = 'rgba(20,14,10,0.6)'; g.fillRect(0, y + 15, 256, 1);
    for (let x = rng() * 80; x < 256; x += rng.range(60, 120)) g.fillRect(x, y, 1, 15);
  }
  noise(g, 256, 256, rng, 2500, ['#2a1f17', '#8a7258'], [1, 2], [0.05, 0.2]);
  return tex(c);
}

export function radialGlow() {
  const [c, g] = canvas(128);
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  gr.addColorStop(0.6, 'rgba(255,255,255,0.14)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return tex(c, false);
}

// Headlight / flashlight cone. Apex at the TOP-centre of the texture (UV v=1), opening toward v=0:
// every cone in the game is a PlaneGeometry laid flat with rotateX(-π/2), which puts its v=1 edge
// at the near end, so the light leaves the lamp. (It was the other way up: every beam's narrow end
// hung in the air 20 m out with a dark gap back to the car, the flashlight's too.)
export function coneTexture() {
  const [c, g] = canvas(128, 256);
  const img = g.createImageData(128, 256);
  for (let y = 0; y < 256; y++)
    for (let x = 0; x < 128; x++) {
      const v = y / 255; // 0 at the apex (top row; canvas textures flipY, so that is UV v=1), 1 at the far end
      const u = (x - 63.5) / 63.5;
      const halfW = 0.1 + 0.9 * Math.sqrt(v); // fans out fast near the lamp: a low beam's pool, not a pencil
      const across = Math.max(0, 1 - Math.abs(u) / halfW);
      const along = Math.pow(1 - v, 1.7) * Math.min(1, 0.35 + v * 6); // lit at the lens, hottest a few metres out
      const a = Math.pow(across, 1.15) * along;
      const i = (y * 128 + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.min(255, a * 255);
    }
  g.putImageData(img, 0, 0);
  return tex(c, false);
}

// Tinted safety glass from above: a sky-sheen gradient and a soft diagonal reflection streak.
export function glassTexture() {
  const [c, g] = canvas(64, 128);
  const gr = g.createLinearGradient(0, 128, 0, 0);
  gr.addColorStop(0, '#141e24'); gr.addColorStop(1, '#2e4048');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 128);
  g.fillStyle = 'rgba(170, 196, 206, 0.22)';
  g.beginPath(); g.moveTo(8, 128); g.lineTo(26, 128); g.lineTo(56, 0); g.lineTo(38, 0); g.closePath(); g.fill();
  g.fillStyle = 'rgba(170, 196, 206, 0.1)';
  g.beginPath(); g.moveTo(32, 128); g.lineTo(37, 128); g.lineTo(64, 6); g.lineTo(64, 0); g.lineTo(59, 0); g.closePath(); g.fill();
  return tex(c, false);
}

// Window glass in a building: clearer and paler than a car's tint (you see the room through it),
// grimy at the bottom, with two sky-sheen streaks so it reads as glass from above and at an angle.
export function windowGlassTexture() {
  const [c, g] = canvas(64, 128);
  const gr = g.createLinearGradient(0, 128, 0, 0);
  gr.addColorStop(0, '#6f7f7c'); gr.addColorStop(0.35, '#93a9ab'); gr.addColorStop(1, '#bcd0d2');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 128);
  g.fillStyle = 'rgba(235, 244, 246, 0.45)';
  g.beginPath(); g.moveTo(6, 128); g.lineTo(22, 128); g.lineTo(52, 0); g.lineTo(36, 0); g.closePath(); g.fill();
  g.fillStyle = 'rgba(235, 244, 246, 0.25)';
  g.beginPath(); g.moveTo(30, 128); g.lineTo(36, 128); g.lineTo(64, 10); g.lineTo(64, 0); g.lineTo(58, 0); g.closePath(); g.fill();
  const rng = makeRng(53);
  noise(g, 64, 128, rng, 160, ['#5a5a4a', '#7a6a50'], [1, 2], [0.1, 0.3]); // dust and grime
  return tex(c, false);
}

// Safety-glass crack web for vehicle panes. A DATA texture, not colour: R = the order each pixel
// cracks in (0 at the impact point, rising outward, so mounting damage spreads the web), G = the
// crack lines themselves. Seeded: every pane breaks the same way.
export function crackTexture() {
  const S = 256, rng = makeRng(47), [c, g] = canvas(S);
  const cx = S * 0.42, cy = S * 0.4;
  g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
  g.strokeStyle = '#fff'; g.lineCap = 'round'; g.lineJoin = 'round';
  for (let k = 0; k < 14; k++) { // radial cracks: jagged walks out from the impact point
    let a = (k / 14) * Math.PI * 2 + rng.range(-0.2, 0.2), x = cx, y = cy;
    g.lineWidth = rng.range(1.1, 2.4); g.beginPath(); g.moveTo(x, y);
    for (let s = 0; s < 14; s++) { a += rng.range(-0.35, 0.35); const st = rng.range(7, 16); x += Math.cos(a) * st; y += Math.sin(a) * st; g.lineTo(x, y); }
    g.stroke();
  }
  for (const r of [16, 34, 58, 88, 122]) { // ring cracks: broken arcs around it
    g.lineWidth = rng.range(0.8, 1.5);
    for (let a = rng() * 0.6; a < Math.PI * 2; a += rng.range(0.35, 0.8)) {
      if (!rng.chance(0.65)) continue;
      const a1 = a + rng.range(0.2, 0.5);
      g.beginPath();
      for (let t = 0; t <= 6; t++) { const aa = a + (a1 - a) * (t / 6), rr = r * rng.range(0.92, 1.08); const px = cx + Math.cos(aa) * rr, py = cy + Math.sin(aa) * rr; if (t) g.lineTo(px, py); else g.moveTo(px, py); }
      g.stroke();
    }
  }
  // B: which glass is still in the frame once the pane is shot out. Polygonal shards (a jittered-grid
  // Voronoi); a shard clings when its centre sits close enough to the frame, deeper ones fell in.
  const C = 20, n = Math.ceil(S / C), seeds = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const sx = (i + rng.range(0.15, 0.85)) * C, sy = (j + rng.range(0.15, 0.85)) * C;
    const edge = Math.min(sx, S - sx, sy, S - sy) / S;
    seeds.push([sx, sy, edge < 0.02 + 0.1 * rng() ? 255 : 0]);
  }
  const img = g.getImageData(0, 0, S, S), d = img.data, far = Math.hypot(S, S) * 0.62;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4, line = d[i];
    d[i] = Math.min(255, (Math.hypot(x - cx, y - cy) / far) * 255);
    d[i + 1] = line; d[i + 3] = 255;
    let best = Infinity, cling = 0;
    const gi = Math.floor(x / C), gj = Math.floor(y / C);
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const ii = gi + di, jj = gj + dj;
      if (ii < 0 || jj < 0 || ii >= n || jj >= n) continue;
      const s = seeds[jj * n + ii], d2 = (s[0] - x) ** 2 + (s[1] - y) ** 2;
      if (d2 < best) { best = d2; cling = s[2]; }
    }
    d[i + 2] = cling;
  }
  g.putImageData(img, 0, 0);
  const t = tex(c, false);
  t.colorSpace = THREE.NoColorSpace; // data, not colour: no sRGB decode
  return t;
}

export function splatTexture(seed = 5) {
  const rng = makeRng(seed);
  const [c, g] = canvas(128);
  g.fillStyle = '#fff';
  const blob = (x, y, r) => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); };
  blob(64, 64, 22);
  for (let i = 0; i < 26; i++) {
    const a = rng() * Math.PI * 2, d = rng.range(10, 44);
    blob(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, rng.range(2, 10) * (1 - d / 70));
  }
  for (let i = 0; i < 6; i++) {
    const a = rng() * Math.PI * 2;
    g.strokeStyle = '#fff'; g.lineWidth = rng.range(2, 5); g.lineCap = 'round';
    g.beginPath(); g.moveTo(64, 64); g.lineTo(64 + Math.cos(a) * rng.range(40, 60), 64 + Math.sin(a) * rng.range(40, 60)); g.stroke();
  }
  // Soft alpha falloff so pools read wet, not stamped.
  const id = g.getImageData(0, 0, 128, 128);
  for (let i = 3; i < id.data.length; i += 4) id.data[i] *= 0.92;
  g.putImageData(id, 0, 0);
  return tex(c, false);
}

export function corrugatedTexture() {
  const [c, g] = canvas(64);
  for (let x = 0; x < 64; x++) {
    const v = 120 + Math.sin((x / 64) * Math.PI * 8) * 40;
    g.fillStyle = `rgb(${v},${v * 0.9},${v * 0.8})`;
    g.fillRect(x, 0, 1, 64);
  }
  const rng = makeRng(77);
  noise(g, 64, 64, rng, 400, ['#6b3a1c', '#8c4a20', '#3b2414'], [1, 4], [0.2, 0.6]);
  return tex(c);
}
