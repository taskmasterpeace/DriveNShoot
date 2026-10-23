// The observer's map: a 2D canvas over world metres (+x east = right, +z south = down, as the game's camera).
// Layers bottom to top: ground (the island's own minimap, streamed chunk tiles, I-10), a heatmap, labels, doors and
// windows, a replay path, vehicles, people (faction colour, real flag), the player, event ripples, the selection.

import { drawFlag, FLAGS } from '../ui/portrait.js';

const flagCache = new Map();
export function flagCanvas(code, w = 24, h = 16) {
  const k = `${code}:${w}x${h}`;
  if (!flagCache.has(k)) flagCache.set(k, FLAGS[code] ? drawFlag(code, w, h) : null);
  return flagCache.get(k);
}
const flagURLs = new Map();
export function flagURL(code) {
  if (!flagURLs.has(code)) { const c = flagCanvas(code, 36, 24); flagURLs.set(code, c ? c.toDataURL() : ''); }
  return flagURLs.get(code);
}

const TAU = Math.PI * 2;
export const EVENT_STYLE = {
  kill: { col: '#d8432c', r: 16, icon: 'x' }, playerDied: { col: '#ff5a3c', r: 26, icon: 'x' }, hurt: { col: '#d8762c', r: 10 }, downed: { col: '#e3a72f', r: 14 },
  deed: { col: '#e3b341', r: 18, icon: 'd' }, rumor: { col: '#c9b48a', r: 22, dash: true }, witnessRuns: { col: '#e3b341', r: 14, dash: true },
  director: { col: '#e07a2c', r: 44 }, trade: { col: '#8fb35a', r: 12 }, roleTier: { col: '#f0c75a', r: 22, icon: 'd' },
  thrown: { col: '#d8762c', r: 10 }, detonated: { col: '#ff7a2c', r: 30 }, fire: { col: '#ff8a3c', r: 20 }, residentDied: { col: '#d8432c', r: 14, icon: 'x' },
  respawn: { col: '#c9e0a0', r: 18 }, enterVehicle: { col: '#d8d0b0', r: 8 }, exitVehicle: { col: '#d8d0b0', r: 8 }, stole: { col: '#e3a72f', r: 12 },
};

export class MapView {
  constructor(canvas) {
    this.c = canvas; this.ctx = canvas.getContext('2d');
    this.cx = 0; this.cz = 0; this.s = 1.1; // px per metre
    this.W = 1; this.H = 1; this.dpr = 1;
    this.hits = []; // [{kind, id, x, y, r}]
    this.tileCache = new Map(); // key -> recoloured canvas
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize();
  }
  resize() {
    const r = this.c.getBoundingClientRect();
    this.dpr = Math.min(2, devicePixelRatio || 1);
    this.W = Math.max(1, r.width); this.H = Math.max(1, r.height);
    this.c.width = Math.round(this.W * this.dpr); this.c.height = Math.round(this.H * this.dpr);
  }
  w2s(x, z) { return [(x - this.cx) * this.s + this.W / 2, (z - this.cz) * this.s + this.H / 2]; }
  s2w(sx, sy) { return [(sx - this.W / 2) / this.s + this.cx, (sy - this.H / 2) / this.s + this.cz]; }
  zoomAt(sx, sy, k) {
    const [wx, wz] = this.s2w(sx, sy);
    this.s = Math.max(0.012, Math.min(24, this.s * k));
    this.cx = wx - (sx - this.W / 2) / this.s; this.cz = wz - (sy - this.H / 2) / this.s;
  }
  viewRect() { const [x0, z0] = this.s2w(0, 0), [x1, z1] = this.s2w(this.W, this.H); return [x0, z0, x1, z1]; }
  niceScale() {
    const target = 110 / this.s, steps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000];
    const m = steps.find((v) => v >= target * 0.6) ?? 50000;
    return { m, px: m * this.s, label: m >= 1000 ? `${m / 1000} km` : `${m} m` };
  }
  tile(key, img) {
    if (this.tileCache.has(key)) return this.tileCache.get(key);
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d');
    // The game paints its radar tiles green; the observer's ground is the island's warm palette.
    g.filter = 'sepia(1) saturate(0.55) hue-rotate(-14deg) brightness(0.62) contrast(1.1)';
    g.drawImage(img, 0, 0);
    this.tileCache.set(key, c);
    return c;
  }

  draw(st) {
    const g = this.ctx, s = this.s, now = performance.now();
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = '#17120d'; g.fillRect(0, 0, this.W, this.H);
    this.hits.length = 0;
    const [vx0, vz0, vx1, vz1] = this.viewRect();
    const vis = (x, z, pad = 40 / s) => x > vx0 - pad && x < vx1 + pad && z > vz0 - pad && z < vz1 + pad;
    const B = st.base;

    // ---- ground: streamed tiles, the island, a chunk grid, I-10
    g.imageSmoothingEnabled = s < 2.4;
    const C = B?.chunk ?? 256;
    for (const [key, img] of st.tiles) {
      const [cx, cz] = key.split(',').map(Number), x = cx * C, z = cz * C;
      if (x + C < vx0 || x > vx1 || z + C < vz0 || z > vz1) continue;
      const [sx, sy] = this.w2s(x, z);
      g.drawImage(this.tile(key, img), sx, sy, C * s + 0.5, C * s + 0.5);
    }
    if (B?.islandImg) {
      const h = B.island.half, [sx, sy] = this.w2s(-h, -h);
      g.drawImage(B.islandImg, sx, sy, h * 2 * s, h * 2 * s);
      g.strokeStyle = 'rgba(227,167,47,0.25)'; g.lineWidth = 1; g.setLineDash([6, 6]); g.strokeRect(sx, sy, h * 2 * s, h * 2 * s); g.setLineDash([]);
    }
    if (s < 1.2 && s > 0.03) {
      g.strokeStyle = 'rgba(200,170,120,0.06)'; g.lineWidth = 1; g.beginPath();
      for (let x = Math.floor(vx0 / C) * C; x < vx1; x += C) { const [a] = this.w2s(x, 0); g.moveTo(a, 0); g.lineTo(a, this.H); }
      for (let z = Math.floor(vz0 / C) * C; z < vz1; z += C) { const [, b] = this.w2s(0, z); g.moveTo(0, b); g.lineTo(this.W, b); }
      g.stroke();
    }
    if (B?.i10) {
      g.lineCap = 'round'; g.lineJoin = 'round';
      const isl = B.island.half + 10;
      const path = () => { g.beginPath(); let pen = false; for (const [x, z] of B.i10) { if (Math.abs(x) < isl && Math.abs(z) < isl) { pen = false; continue; } const [a, b] = this.w2s(x, z); if (pen) g.lineTo(a, b); else g.moveTo(a, b); pen = true; } };
      path(); g.strokeStyle = 'rgba(10,8,6,0.75)'; g.lineWidth = Math.max(3, Math.min(14, 30 * s)); g.stroke();
      path(); g.strokeStyle = s > 1.5 ? 'rgba(120,108,90,0.55)' : 'rgba(227,167,47,0.55)'; g.lineWidth = Math.max(1.5, Math.min(9, 22 * s)); g.stroke();
    }

    // ---- heat
    if (st.heat?.bins?.size) this.drawHeat(st.heat);

    // ---- labels
    if (st.layers.labels && B) {
      g.textAlign = 'center'; g.textBaseline = 'middle';
      for (const t of B.towns) {
        if (!vis(t.x, t.z, 400)) continue;
        const [a, b] = this.w2s(t.x, t.z);
        g.font = `900 ${s < 0.05 ? 11 : 13}px 'Big Shoulders Stencil Display', 'Barlow Condensed', sans-serif`;
        g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillText(t.name, a + 1, b + 1); g.fillStyle = '#e8d7b0'; g.fillText(t.name, a, b);
      }
      if (s > 0.06) for (const X of B.exits) {
        if (!vis(X.x, X.z)) continue;
        const [a, b] = this.w2s(X.x, X.z);
        g.font = "700 10px 'Barlow Condensed', sans-serif"; g.fillStyle = '#2f5d3a'; const w = g.measureText(`EXIT ${X.number}`).width + 8;
        g.fillRect(a - w / 2, b - 7, w, 14); g.fillStyle = '#e9f0dc'; g.fillText(`EXIT ${X.number}`, a, b);
      }
      if (s > 0.25) for (const c of B.camps) {
        if (!vis(c.x, c.z)) continue;
        const [a, b] = this.w2s(c.x, c.z);
        g.fillStyle = 'rgba(176,48,30,0.85)'; g.beginPath(); g.moveTo(a, b - 7); g.lineTo(a + 7, b + 6); g.lineTo(a - 7, b + 6); g.closePath(); g.fill();
      }
      if (s > 0.25) for (const bs of B.bases) {
        const f = bs.fence, [a, b] = this.w2s(f.x0, f.z0);
        g.strokeStyle = 'rgba(122,132,86,0.9)'; g.setLineDash([4, 3]); g.lineWidth = 1.5; g.strokeRect(a, b, (f.x1 - f.x0) * s, (f.z1 - f.z0) * s); g.setLineDash([]);
        g.font = "800 11px 'Barlow Condensed', sans-serif"; g.fillStyle = '#b9c48e'; g.fillText(bs.name.toUpperCase(), a + ((f.x1 - f.x0) * s) / 2, b - 8);
      }
      if (s > 2.6) for (const sh of B.shops) {
        if (!vis(sh.x, sh.z)) continue;
        const [a, b] = this.w2s(sh.x, sh.z);
        g.font = "800 10px 'Big Shoulders Stencil Display', 'Barlow Condensed', sans-serif"; g.fillStyle = 'rgba(217,201,162,0.42)'; g.fillText(sh.name.toUpperCase(), a, b - 5 * s);
      }
    }

    const snap = st.snap;
    if (st.replay) this.drawReplay(st.replay, st);

    // ---- doors and windows (zoomed in)
    if (snap && st.layers.doors && s > 1.6) {
      g.lineCap = 'round';
      for (const W of snap.windows ?? []) {
        const [, x, z, axis, wd, state] = W; const [a, b] = this.w2s(x, z), h = (wd * s) / 2;
        g.strokeStyle = state === 'shattered' ? '#d06a3a' : state === 'boarded' ? '#8a6038' : state === 'cracked' ? '#d8c08a' : 'rgba(220,226,214,0.75)';
        g.lineWidth = Math.max(1.5, 0.25 * s); g.beginPath();
        if (axis === 'x') { g.moveTo(a - h, b); g.lineTo(a + h, b); } else { g.moveTo(a, b - h); g.lineTo(a, b + h); }
        g.stroke();
      }
      for (const D of snap.doors ?? []) {
        const [, x, z, locked, leaves] = D;
        for (const [hx, hz, ang, len] of leaves) {
          const [a, b] = this.w2s(hx, hz), [c2, d2] = this.w2s(hx + Math.cos(ang) * len, hz + Math.sin(ang) * len);
          g.strokeStyle = locked ? '#d0582c' : '#e3c27a'; g.lineWidth = Math.max(2, 0.18 * s);
          g.beginPath(); g.moveTo(a, b); g.lineTo(c2, d2); g.stroke();
        }
        if (locked) { const [a, b] = this.w2s(x, z); g.fillStyle = '#d0582c'; g.beginPath(); g.arc(a, b, Math.max(2.5, 0.25 * s), 0, TAU); g.fill(); }
      }
    }

    // ---- vehicles
    const P = st.pos; // interpolated positions by id
    if (snap && st.layers.vehicles) {
      for (const v of snap.vehicles) {
        const [id, type, , , , hpPct, dead, driver, , wid, len, name, fire] = v, q = P.get(id) ?? { x: v[2], z: v[3], h: v[4] };
        if (!vis(q.x, q.z)) continue;
        const [a, b] = this.w2s(q.x, q.z);
        const W2 = Math.max(5, wid * s), L2 = Math.max(9, len * s);
        g.save(); g.translate(a, b); g.rotate(-q.h);
        g.fillStyle = dead ? '#4a3d33' : fire ? '#e0602e' : driver === snap.player.id ? '#f0b429' : driver ? '#d9cba6' : '#a39886';
        g.strokeStyle = dead ? 'rgba(0,0,0,0.6)' : '#120e0a'; g.lineWidth = 1.6;
        g.fillRect(-W2 / 2, -L2 / 2, W2, L2); g.strokeRect(-W2 / 2, -L2 / 2, W2, L2);
        g.fillStyle = 'rgba(20,16,12,0.75)'; g.fillRect(-W2 / 2 + 1.5, L2 * 0.1, W2 - 3, L2 * 0.2); // windscreen toward +z (forward)
        if (driver && !dead) { g.fillStyle = '#120e0a'; g.beginPath(); g.arc(0, -L2 * 0.05, Math.max(1.5, W2 * 0.18), 0, TAU); g.fill(); }
        g.restore();
        if (hpPct < 100 && !dead && s > 0.8) { g.fillStyle = '#221a14'; g.fillRect(a - 9, b - L2 / 2 - 7, 18, 3); g.fillStyle = hpPct > 40 ? '#8fb35a' : '#d8432c'; g.fillRect(a - 9, b - L2 / 2 - 7, 18 * hpPct / 100, 3); }
        this.hits.push({ kind: 'vehicle', id, x: a, y: b, r: Math.max(8, L2 / 2), name, type });
      }
    }

    // ---- people
    if (snap && st.layers.people) {
      const allFlags = st.layers.flags || s >= 3.2;
      const r0 = Math.max(3.2, 0.55 * s);
      for (const row of snap.chars) {
        const [id, , , , fac, flag, state, , named, name, veh, , hostile] = row;
        if (veh) continue; // inside a vehicle: the vehicle stands for them
        const q = P.get(id) ?? { x: row[1], z: row[2], h: row[3] };
        if (!vis(q.x, q.z)) continue;
        const [a, b] = this.w2s(q.x, q.z);
        const col = st.factions?.[fac]?.color ?? '#9a8a6a', dead = state === 'dead';
        if (dead) {
          g.strokeStyle = 'rgba(160,60,40,0.8)'; g.lineWidth = 1.5; const k = r0 * 0.9;
          g.beginPath(); g.moveTo(a - k, b - k); g.lineTo(a + k, b + k); g.moveTo(a + k, b - k); g.lineTo(a - k, b + k); g.stroke();
          this.hits.push({ kind: 'char', id, x: a, y: b, r: 8 });
          continue;
        }
        g.fillStyle = col; g.strokeStyle = hostile ? '#ff4d2e' : 'rgba(10,8,6,0.85)'; g.lineWidth = hostile ? 1.6 : 1.2;
        g.beginPath(); g.arc(a, b, r0, 0, TAU); g.fill(); g.stroke();
        if (s > 1.2) { g.strokeStyle = 'rgba(10,8,6,0.9)'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(a, b); g.lineTo(a + Math.sin(q.h) * r0 * 1.9, b + Math.cos(q.h) * r0 * 1.9); g.stroke(); }
        if (state === 'asleep' && s > 1) { g.fillStyle = '#d8d0b0'; g.font = "700 10px 'Barlow Condensed'"; g.fillText('z', a + r0 + 3, b - r0); }
        if (state === 'downed' || state === 'knocked') { g.strokeStyle = '#e3a72f'; g.lineWidth = 1.2; g.beginPath(); g.arc(a, b, r0 + 3, 0, TAU); g.stroke(); }
        if (named) { g.strokeStyle = '#f3ead6'; g.lineWidth = 1.3; g.beginPath(); g.arc(a, b, r0 + 2.2, 0, TAU); g.stroke(); }
        if ((allFlags || named) && flag) {
          const fw = named ? 18 : 12, fh = named ? 12 : 8, fc = flagCanvas(flag, 24, 16);
          if (fc) { g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(a + r0 + 1, b - r0 - fh - 1, fw + 2, fh + 2); g.drawImage(fc, a + r0 + 2, b - r0 - fh, fw, fh); }
        }
        if (named && (s > 1.2 || st.sel === id) && st.layers.labels) {
          g.font = "700 11.5px 'Barlow Condensed', sans-serif"; g.textAlign = 'left';
          const tx = a + r0 + (flag ? 22 : 4), ty = b - r0 - 5;
          g.fillStyle = 'rgba(0,0,0,0.7)'; g.fillText(name, tx + 1, ty + 1); g.fillStyle = '#f3ead6'; g.fillText(name, tx, ty);
        }
        this.hits.push({ kind: 'char', id, x: a, y: b, r: Math.max(7, r0 + 3) });
      }
    }

    // ---- the player
    if (snap?.player) {
      const pl = snap.player, q = P.get(pl.id) ?? { x: pl.x, z: pl.z, h: pl.face };
      const [a, b] = this.w2s(q.x, q.z), r = Math.max(7, 0.9 * s);
      g.save(); g.translate(a, b); g.rotate(-q.h);
      g.fillStyle = pl.alive ? '#f0b429' : '#6b5a3a'; g.strokeStyle = '#140f0a'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(0, r * 1.5); g.lineTo(r, -r); g.lineTo(0, -r * 0.45); g.lineTo(-r, -r); g.closePath(); g.fill(); g.stroke();
      g.restore();
      g.strokeStyle = 'rgba(240,180,41,0.35)'; g.lineWidth = 1; g.beginPath(); g.arc(a, b, r * 2.3 + Math.sin(now / 300) * 2, 0, TAU); g.stroke();
      const fc = flagCanvas(pl.flag || 'US', 24, 16);
      g.font = "800 12px 'Barlow Condensed', sans-serif"; g.textAlign = 'left';
      if (fc) { g.fillStyle = 'rgba(0,0,0,0.7)'; g.fillRect(a + r + 3, b - r - 15, 20, 14); g.drawImage(fc, a + r + 4, b - r - 14, 18, 12); }
      g.fillStyle = 'rgba(0,0,0,0.7)'; g.fillText('YOU', a + r + 27, b - r - 6); g.fillStyle = '#f0b429'; g.fillText('YOU', a + r + 26, b - r - 7);
      this.hits.push({ kind: 'char', id: pl.id, x: a, y: b, r: r + 4 });
    }

    // ---- event ripples
    if (st.layers.events) {
      g.textAlign = 'center';
      for (const e of st.ripples) {
        const age = (now - e.at) / 1000, life = e.life ?? 6;
        if (age > life || !vis(e.x, e.z, 200)) continue;
        const sty = EVENT_STYLE[e.type]; if (!sty) continue;
        const k = age / life, [a, b] = this.w2s(e.x, e.z);
        g.globalAlpha = 1 - k;
        g.strokeStyle = sty.col; g.lineWidth = 2;
        if (sty.dash) g.setLineDash([4, 4]);
        g.beginPath(); g.arc(a, b, 4 + sty.r * (0.4 + k * 1.2), 0, TAU); g.stroke(); g.setLineDash([]);
        if (sty.icon === 'x') { g.lineWidth = 2.6; const q = 6; g.beginPath(); g.moveTo(a - q, b - q); g.lineTo(a + q, b + q); g.moveTo(a + q, b - q); g.lineTo(a - q, b + q); g.stroke(); }
        if (sty.icon === 'd') { g.fillStyle = sty.col; g.beginPath(); g.moveTo(a, b - 6); g.lineTo(a + 6, b); g.lineTo(a, b + 6); g.lineTo(a - 6, b); g.closePath(); g.fill(); }
        if (e.hub) { const [c2, d2] = this.w2s(e.hub[0], e.hub[1]); g.setLineDash([3, 5]); g.beginPath(); g.moveTo(a, b); g.lineTo(c2, d2); g.stroke(); g.setLineDash([]); }
        if (e.label && age < life * 0.7) { g.font = "700 11px 'Barlow Condensed', sans-serif"; g.fillStyle = 'rgba(0,0,0,0.7)'; g.fillText(e.label, a + 1, b - sty.r - 9); g.fillStyle = sty.col; g.fillText(e.label, a, b - sty.r - 10); }
        g.globalAlpha = 1;
      }
    }

    // ---- the selection: a ring, a line to who they are after
    if (st.sel && snap) {
      const row = snap.chars.find((c) => c[0] === st.sel), isP = st.sel === snap.player.id;
      const q = P.get(st.sel) ?? (row ? { x: row[1], z: row[2] } : isP ? { x: snap.player.x, z: snap.player.z } : null);
      if (q) {
        const [a, b] = this.w2s(q.x, q.z), pulse = 12 + Math.sin(now / 180) * 2.5;
        if (row?.[14]) {
          const tq = P.get(row[14]) ?? (row[14] === snap.player.id ? { x: snap.player.x, z: snap.player.z } : null);
          if (tq) { const [c2, d2] = this.w2s(tq.x, tq.z); g.strokeStyle = 'rgba(255,77,46,0.85)'; g.lineWidth = 1.6; g.setLineDash([6, 4]); g.beginPath(); g.moveTo(a, b); g.lineTo(c2, d2); g.stroke(); g.setLineDash([]); }
        }
        g.strokeStyle = '#f0b429'; g.lineWidth = 2;
        for (let i = 0; i < 4; i++) { const a0 = i * (TAU / 4) + now / 900; g.beginPath(); g.arc(a, b, pulse, a0, a0 + 0.9); g.stroke(); }
      }
    }
  }

  drawHeat(H) {
    const g = this.ctx, s = this.s, c = H.cell, max = H.max || 1;
    const [vx0, vz0, vx1, vz1] = this.viewRect();
    for (const [k, v] of H.bins) {
      const i = k.indexOf(','), cx = +k.slice(0, i), cz = +k.slice(i + 1), x = cx * c, z = cz * c;
      if (x + c < vx0 || x > vx1 || z + c < vz0 || z > vz1) continue;
      const t = Math.sqrt(v / max);
      // ink -> rust -> amber -> bone
      const r = Math.round(t < 0.5 ? 120 + 220 * t : 230 + 20 * (t - 0.5)), gg = Math.round(t < 0.5 ? 40 + 120 * t : 100 + 230 * (t - 0.5)), b = Math.round(t < 0.6 ? 20 + 30 * t : 38 + 240 * (t - 0.6));
      g.fillStyle = `rgba(${r},${gg},${b},${0.25 + 0.6 * t})`;
      const [a, bb] = this.w2s(x, z);
      g.fillRect(a, bb, Math.max(1.5, c * s), Math.max(1.5, c * s));
    }
  }

  drawReplay(R, st) {
    const g = this.ctx, S = R.S, C = S.cols, n = S.n, t = R.t;
    if (!n) return;
    // The whole path faint; the last 30 game seconds bright; a gap where the player jumped (teleport, respawn).
    g.lineCap = 'round'; g.lineJoin = 'round';
    const seg = (i0, i1, style, w) => {
      g.strokeStyle = style; g.lineWidth = w; g.beginPath();
      for (let i = i0; i <= i1; i++) { const [a, b] = this.w2s(C.x[i], C.z[i]); if (i === i0 || Math.hypot(C.x[i] - C.x[i - 1], C.z[i] - C.z[i - 1]) > 60) g.moveTo(a, b); else g.lineTo(a, b); }
      g.stroke();
    };
    seg(0, n - 1, 'rgba(201,180,138,0.22)', 2);
    let hi = R.frame?.i ?? 0, lo = hi;
    while (lo > 0 && C.t[lo] > t - 30) lo--;
    seg(lo, hi, 'rgba(240,180,41,0.85)', 3);
    for (const e of S.events) {
      if (e.t > t || !EVENT_STYLE[e.y] || e.y === 'enterVehicle' || e.y === 'exitVehicle') continue;
      const [a, b] = this.w2s(e.x, e.z), sty = EVENT_STYLE[e.y], fresh = t - e.t < 8;
      g.globalAlpha = fresh ? 1 : 0.55;
      g.strokeStyle = sty.col; g.fillStyle = sty.col; g.lineWidth = 2;
      if (sty.icon === 'x') { const q = 5; g.beginPath(); g.moveTo(a - q, b - q); g.lineTo(a + q, b + q); g.moveTo(a + q, b - q); g.lineTo(a - q, b + q); g.stroke(); }
      else { g.beginPath(); g.arc(a, b, fresh ? 5 : 3, 0, TAU); g.fill(); }
      g.globalAlpha = 1;
      this.hits.push({ kind: 'revent', id: e.s, x: a, y: b, r: 7, e });
    }
    const f = R.frame;
    if (f) {
      const [a, b] = this.w2s(f.x, f.z), r = Math.max(7, 0.9 * this.s);
      g.strokeStyle = 'rgba(255,90,60,0.6)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(a, b); g.lineTo(a + Math.sin(f.aim) * 40, b + Math.cos(f.aim) * 40); g.stroke();
      g.save(); g.translate(a, b); g.rotate(-f.h);
      g.fillStyle = (f.flags & 2) ? '#6b5a3a' : '#f3ead6'; g.strokeStyle = '#140f0a'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(0, r * 1.5); g.lineTo(r, -r); g.lineTo(0, -r * 0.45); g.lineTo(-r, -r); g.closePath(); g.fill(); g.stroke();
      g.restore();
      g.font = "800 12px 'Barlow Condensed', sans-serif"; g.textAlign = 'left'; g.fillStyle = '#f3ead6'; g.fillText('REPLAY', a + r + 6, b - r - 6);
    }
  }

  pick(sx, sy) {
    let best = null, bd = Infinity;
    for (const h of this.hits) { const d = Math.hypot(h.x - sx, h.y - sy); if (d <= h.r + 3 && d < bd) { bd = d; best = h; } }
    return best;
  }
}
