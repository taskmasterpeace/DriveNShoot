// TERRAIN (docs/design/WEB_TERRAIN.md, docs/design/WEB_FORGE.md §3.5): the real land under the streamed world, as the bake
// left it (src/data/terrain/i10.bin: public elevation and landcover strip-mapped onto our I-10, held to THE GRADE), the
// I-10 profile (the real road against ours: the bake's own chart data, and the survey this page runs on the rows now),
// and the flag that puts the game on the land or back on the flat, live (`terrain on=`). Its knobs are rows in
// src/data/terrain.js; the bake is `node tools/terrain-bake.mjs`.
import { F, el, esc, svg, cmd, toast, on, addPalette, loadDoc, showDoc } from './core.js';
import { BIOME_COL } from './mapview.js';
import { worldOf } from './engine.js';
import { getLand } from './land.js';
import { TERRAIN, BIOME_CODES } from '../data/terrain.js';
import { STREAM } from '../data/streaming.js';

const KNOB_NOTES = {
  cell: 'world metres between baked samples', band: 'world metres each side of the road the strip map follows', bandOut: 'past the band, lateral offsets squashed by this',
  blurPasses: 'binomial passes after the grade: rounds the creases', frameSigma: 'the game frame: the corridor smoothed this much', realSigma: 'the real road smoothed this much for its normals',
  demZoom: 'AWS Terrain Tiles zoom', g: 'THE GRADE: the steepest any land is', hUnit: 'metres per stored height unit', batter: 'cut and fill side slopes and pad edges',
  formation: 'half-width of the graded road bed', formationX: '... through an interchange', formationXs: '... this far either side of an exit', vcurve: 'vertical curves: the profile smoothed over this length',
  padMargin: 'a town pad reaches this far past its last building', gridLRU: 'per-chunk height grids kept',
};
const BIOME_NAME = { d: 'desert', f: 'scrub', u: 'urban', m: 'mountains', p: 'plains', a: 'farmland', w: 'riverbed', F: 'forest', s: 'swamp', '.': 'sea' };

export function terrainTab() {
  const S = { asset: null, img: null, view: null, flag: null, prof: null, hover: null, W: null, T: null, shot: null };
  const pane = el('section', { class: 'pane pane-terrain', id: 'pane-terrain' });
  const land = el('div', { class: 'landwrap' }), lc = el('canvas'); land.append(lc);
  const readout = el('div', { class: 'readout' }, 'loading the baked land…'), scale = el('div', { class: 'scalebar' });
  const legend = el('div', { class: 'maptools' }, el('div', { class: 'layers', html: Object.entries(BIOME_NAME).filter(([k]) => k !== '.').map(([k, n]) => `<span class="chip on" style="cursor:default"><i style="background:rgb(${BIOME_COL[k].join(',')})"></i>${n.toUpperCase()}</span>`).join('') }));
  land.append(legend, readout, scale);
  const prof = el('section', { class: 'plate profile' }), pc = el('canvas');
  prof.append(el('header', { class: 'ph' }, el('h2', {}, 'THE I-10 PROFILE'), el('span', { class: 'sub', id: 'profSub' }, 'Los Angeles to El Paso · real miles from Los Angeles'), el('span', { class: 'grow' }),
    el('span', { class: 'sub', html: '<span style="color:#e9dfc4">━ real I-10</span> &nbsp; <span style="color:#ecaa48">━ our road</span> &nbsp; <span style="color:#7f8f58">▆ our land under it</span>' })), pc);
  const sideP = el('aside', { class: 'side terrside' }), flag = el('section', { class: 'plate' }), info = el('section', { class: 'plate grow' });
  sideP.append(flag, info);
  pane.append(land, sideP, prof);
  const g = lc.getContext('2d'), gp = pc.getContext('2d');
  let W = 0, H = 0, dpr = 1;
  new ResizeObserver(() => { const r = land.getBoundingClientRect(); dpr = Math.min(2, devicePixelRatio || 1); W = r.width; H = r.height; lc.width = W * dpr; lc.height = H * dpr; fit(false); drawLand(); }).observe(land);
  new ResizeObserver(() => drawProfile()).observe(prof);

  // ---- the baked land, painted once: biome colour x hypsometric light x hillshade ---------------------------------------------
  async function loadLand() {
    const L = await getLand();
    S.asset = L.asset; S.img = L.canvas; S.range = L.range; S.loadMs = L.ms;
    readout.innerHTML = 'hover the land for its height and cover · wheel zooms · drag pans · <b>click</b> for the game\'s camera there';
    fit(true); drawLand(); renderInfo();
  }
  // world <-> canvas
  const x0 = () => S.asset.header.x0, z0 = () => S.asset.header.z0, wx = () => S.asset.header.nx * S.asset.header.cell, wz = () => S.asset.header.nz * S.asset.header.cell;
  function fit(reset) { if (!S.asset || !W || !H) return; if (reset || !S.view || !(S.view.s > 0) || !Number.isFinite(S.view.s)) { const s = Math.min(W / wx(), H / wz()) * 0.98; S.view = { cx: x0() + wx() / 2, cz: z0() + wz() / 2, s }; } }
  const tx = (x) => (x - S.view.cx) * S.view.s + W / 2, tz = (z) => (z - S.view.cz) * S.view.s + H / 2;
  const ix = (px) => (px - W / 2) / S.view.s + S.view.cx, iz = (py) => (py - H / 2) / S.view.s + S.view.cz;
  function drawLand() {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#100d0a'; g.fillRect(0, 0, W, H);
    if (!S.img) return;
    g.imageSmoothingEnabled = true;
    g.drawImage(S.img, tx(x0()), tz(z0()), wx() * S.view.s, wz() * S.view.s);
    const Wi = S.W;
    if (Wi) {
      // The road: our I-10 centreline, coloured by its grade on the land (when the survey ran here).
      const cl = Wi.cl, yr = S.T?.yr;
      g.lineCap = 'round'; g.lineJoin = 'round';
      g.lineWidth = 5; g.strokeStyle = 'rgba(16,12,8,0.9)'; g.beginPath(); for (let i = 0; i < cl.n; i += 4) { const x = tx(cl.x[i]), y = tz(cl.z[i]); if (i) g.lineTo(x, y); else g.moveTo(x, y); } g.stroke();
      for (let i = 4; i < cl.n; i += 4) {
        const gr = yr ? Math.abs(yr[i] - yr[i - 4]) / Math.max(1, cl.s[i] - cl.s[i - 4]) : 0;
        g.strokeStyle = gr > 0.08 ? '#d9643a' : gr > 0.05 ? '#e3c34a' : '#ecaa48'; g.lineWidth = 2.6;
        g.beginPath(); g.moveTo(tx(cl.x[i - 4]), tz(cl.z[i - 4])); g.lineTo(tx(cl.x[i]), tz(cl.z[i])); g.stroke();
      }
      g.font = '700 12px "Barlow Condensed", sans-serif'; g.textBaseline = 'middle';
      for (const t of Wi.towns) { if (!t.built && t.id !== 'phoenix') continue; const x = tx(t.x), y = tz(t.z); if (x < -20 || x > W + 20 || y < -20 || y > H + 20) continue; g.fillStyle = '#e3a72f'; g.strokeStyle = '#1a120a'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, 5, 0, 7); g.fill(); g.stroke(); g.lineWidth = 3; g.strokeStyle = 'rgba(16,12,8,0.85)'; g.strokeText(t.name, x + 8, y); g.fillStyle = '#f5e7c0'; g.fillText(t.name, x + 8, y); }
      for (const X of Wi.exits) { const x = tx(X.x), y = tz(X.z); g.fillStyle = '#efe6cc'; g.fillRect(x - 2, y - 2, 4, 4); }
    }
    if (S.hover) { const x = tx(S.hover.x), y = tz(S.hover.z); g.strokeStyle = '#7fd1c4'; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, 7, 0, 7); g.stroke(); }
    const mPerPx = 1 / S.view.s, target = 140 * mPerPx, pow = Math.pow(10, Math.floor(Math.log10(target))), n = [1, 2, 5, 10].find((k) => k * pow >= target / 1.6) * pow;
    scale.innerHTML = `${n >= 1000 ? `${n / 1000} km` : `${n} m`} <small style="opacity:.6">world</small><i style="width:${n * S.view.s}px"></i>`;
  }
  let drag = null;
  lc.addEventListener('wheel', (e) => { if (!S.view) return; e.preventDefault(); const r = lc.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top, x = ix(px), z = iz(py); S.view.s = Math.max(0.004, Math.min(2, S.view.s * Math.exp(-e.deltaY * 0.0018))); S.view.cx = x - (px - W / 2) / S.view.s; S.view.cz = z - (py - H / 2) / S.view.s; drawLand(); }, { passive: false });
  lc.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, cx: S.view?.cx, cz: S.view?.cz, moved: 0 }; lc.setPointerCapture(e.pointerId); });
  lc.addEventListener('pointermove', (e) => {
    if (!S.view) return;
    if (drag) { drag.moved = Math.hypot(e.clientX - drag.x, e.clientY - drag.y); S.view.cx = drag.cx - (e.clientX - drag.x) / S.view.s; S.view.cz = drag.cz - (e.clientY - drag.y) / S.view.s; drawLand(); return; }
    const r = lc.getBoundingClientRect(), x = ix(e.clientX - r.left), z = iz(e.clientY - r.top), h = S.asset.header;
    const i = Math.round((x - h.x0) / h.cell), j = Math.round((z - h.z0) / h.cell);
    if (i < 0 || j < 0 || i >= h.nx || j >= h.nz) { readout.textContent = 'outside the bake'; return; }
    const e2 = S.asset.heights[j * h.nx + i] * h.hUnit, b = S.asset.biome[j * h.nx + i];
    readout.innerHTML = `world <b>${(x / 1000).toFixed(1)}, ${(z / 1000).toFixed(1)} km</b> · land <b>${Math.round(e2)} m</b> about Phoenix · real <b>${Math.round(e2 + h.datum)} m</b> · ${BIOME_NAME[BIOME_CODES[b]] ?? 'no data (the usmap grid answers)'}${S.T ? ` · ground ${Math.round(S.T.at(x, z))} m` : ''}`;
  });
  lc.addEventListener('pointerup', async (e) => {
    const d = drag; drag = null;
    if (!d || d.moved > 4 || !S.view) return;
    const r = lc.getBoundingClientRect(); S.hover = { x: ix(e.clientX - r.left), z: iz(e.clientY - r.top) }; drawLand(); shoot();
  });

  // ---- the profile ----------------------------------------------------------------------------------------------------
  async function loadProfile() {
    try { S.prof = await (await fetch('/forge/file?path=docs/renders/web/terrain/i10-profile.json')).json(); } catch { S.prof = null; }
    drawProfile();
  }
  function drawProfile() {
    const r = pc.getBoundingClientRect(); if (!r.width) return;
    const d2 = Math.min(2, devicePixelRatio || 1); pc.width = r.width * d2; pc.height = r.height * d2;
    gp.setTransform(d2, 0, 0, d2, 0, 0);
    const w = r.width, h = r.height, P = S.prof;
    gp.fillStyle = 'rgba(0,0,0,0.18)'; gp.fillRect(0, 0, w, h);
    if (!P) { gp.fillStyle = '#8c8478'; gp.font = '600 13px "Barlow Condensed"'; gp.fillText('no profile data (run node tools/terrain-bake.mjs)', 16, 24); return; }
    // The bake's columns (tools/terrain-bake.mjs §9): real [real mi, m]; ours [real mi, game mi, land m, road m, x, z].
    const L = 54, R = 14, T = 10, B = 24, maxX = Math.max(P.real[P.real.length - 1][0], P.ours[P.ours.length - 1][0]);
    let lo = Infinity, hi = -Infinity; for (const p of P.real) { lo = Math.min(lo, p[1]); hi = Math.max(hi, p[1]); } for (const p of P.ours) { lo = Math.min(lo, p[2], p[3]); hi = Math.max(hi, p[2], p[3]); }
    lo = Math.floor((lo - 50) / 250) * 250; hi = Math.ceil((hi + 50) / 250) * 250;
    const X = (km) => L + (km / maxX) * (w - L - R), Y = (m) => T + (1 - (m - lo) / (hi - lo)) * (h - T - B);
    gp.font = '600 10.5px "Barlow Condensed", sans-serif'; gp.fillStyle = '#8c8478'; gp.strokeStyle = 'rgba(232,222,196,0.08)'; gp.lineWidth = 1; gp.textBaseline = 'middle';
    for (let m = lo; m <= hi; m += 250) { gp.beginPath(); gp.moveTo(L, Y(m)); gp.lineTo(w - R, Y(m)); gp.stroke(); gp.fillText(`${m} m`, 8, Y(m)); }
    for (let mi = 0; mi <= maxX; mi += 100) { gp.fillText(`${mi} mi`, X(mi) - 14, h - 10); }
    // our land under the road
    gp.fillStyle = 'rgba(127,143,88,0.35)'; gp.beginPath(); gp.moveTo(X(P.ours[0][0]), Y(lo)); for (const p of P.ours) gp.lineTo(X(p[0]), Y(p[2])); gp.lineTo(X(P.ours[P.ours.length - 1][0]), Y(lo)); gp.closePath(); gp.fill();
    gp.lineJoin = 'round';
    gp.strokeStyle = 'rgba(233,223,196,0.8)'; gp.lineWidth = 1.4; gp.beginPath(); P.real.forEach((p, i) => (i ? gp.lineTo(X(p[0]), Y(p[1])) : gp.moveTo(X(p[0]), Y(p[1])))); gp.stroke();
    gp.strokeStyle = '#ecaa48'; gp.lineWidth = 2.4; gp.beginPath(); P.ours.forEach((p, i) => (i ? gp.lineTo(X(p[0]), Y(p[3])) : gp.moveTo(X(p[0]), Y(p[3])))); gp.stroke();
    // the pinned stretches (the pads the road is held flat through)
    const MI = STREAM.mile, sToKm = (sm) => { const o = P.ours; for (let i = 1; i < o.length; i++) if (o[i][1] * MI >= sm) { const a = o[i - 1], b = o[i], t = (sm - a[1] * MI) / ((b[1] - a[1]) * MI || 1); return a[0] + (b[0] - a[0]) * t; } return o[o.length - 1][0]; };
    gp.font = '700 11px "Barlow Condensed", sans-serif';
    for (const pn of P.pinned ?? []) { const a = X(sToKm(pn.s0)), b = X(sToKm(pn.s1)); gp.fillStyle = 'rgba(227,167,47,0.15)'; gp.fillRect(a, T, Math.max(2, b - a), h - T - B); gp.fillStyle = '#e3a72f'; gp.fillText(pn.id.toUpperCase(), a + 3, T + 9); }
    const sub = pane.querySelector('#profSub');
    if (sub && P.survey) sub.textContent = `Los Angeles to El Paso · max grade ${(P.survey.maxGrade * 100).toFixed(1)}% · deepest cut ${P.survey.maxCut} m · highest fill ${P.survey.maxFill} m (the last bake)`;
  }

  // ---- the flag (live, in the attached game) ---------------------------------------------------------------------------
  async function readFlag() { const r = await cmd('terrain', {}, { timeoutMs: 8000 }); S.flag = r.ok ? r : { error: r.error }; renderFlag(); }
  async function setFlag(onv) {
    S.flag = { ...(S.flag ?? {}), busy: true }; renderFlag();
    const r = await cmd('terrain', { on: onv }, { timeoutMs: 90000 });
    if (!r.ok) toast(r.error, 'bad', 'TERRAIN');
    else toast(`real terrain ${r.on ? 'ON' : 'OFF'} · every chunk laid out again${r.ms ? ` in ${r.ms} ms` : ''}`, 'ok', 'TERRAIN');
    await readFlag(); shoot();
  }
  function renderFlag() {
    flag.innerHTML = '';
    const f = S.flag, onv = !!f?.on;
    flag.append(el('header', { class: 'ph' }, el('h2', {}, 'REAL TERRAIN'), el('span', { class: 'sub' }, F.game.alive ? `in tab ${F.game.active}` : 'no game attached')));
    const sw = el('button', { class: `switch${onv ? ' on' : ''}`, title: 'terrain on=true|false: lay every chunk out again on the land, or back on the flat (the island never moves)', disabled: !F.game.alive || f?.busy ? true : undefined, onclick: () => setFlag(!onv) });
    flag.append(el('div', { class: 'bigflag' }, el('div', {}, el('b', { class: onv ? 'on' : 'off' }, f?.busy ? '…' : onv ? 'ON' : 'OFF'), el('div', { style: { color: 'var(--muted)', fontSize: '12px', marginTop: '4px' } }, onv ? 'the streamed world stands on the baked land' : 'the streamed world is flat (the default)')), sw));
    if (f?.error) flag.append(el('div', { class: 'field' }, el('span', { class: 'err', style: { color: 'var(--rust)' } }, f.error)));
    const ig = el('div', { class: 'ingame' }, el('span', { class: 'tag' }, 'IN GAME'));
    if (S.shot?.image) ig.append(el('img', { src: S.shot.image })); else ig.append(S.shot?.loading ? 'the game\'s camera…' : S.shot?.error ? S.shot.error : 'click the land for the game\'s camera there');
    flag.append(ig);
  }
  async function shoot() {
    if (!S.hover) return;
    if (!F.game.alive) { S.shot = { error: 'no game tab attached' }; renderFlag(); return; }
    S.shot = { loading: true }; renderFlag();
    const r = await cmd('screenshot', { x: Math.round(S.hover.x), z: Math.round(S.hover.z), zoom: 140, tilt: 0.9, width: 960, height: 540, quality: 0.8 }, { timeoutMs: 30000 });
    S.shot = r.ok ? { image: r.image } : { error: r.error }; renderFlag();
  }
  function renderInfo() {
    info.innerHTML = '';
    const a = S.asset?.header, f = S.flag;
    info.append(el('header', { class: 'ph' }, el('h2', {}, 'THE BAKE'), el('span', { class: 'sub' }, 'src/data/terrain/i10.bin'), el('span', { class: 'grow' }), el('button', { class: 'btn mini', html: `${svg('doc')}<span>WEB_TERRAIN</span>`, onclick: () => showDoc('docs/design/WEB_TERRAIN.md') })));
    const rows = a ? [['grid', `${a.nx} × ${a.nz} at ${a.cell} m`], ['datum', `${a.datum.toFixed(1)} m (Phoenix = 0)`], ['the grade', `${((a.g ?? TERRAIN.g) * 100).toFixed(0)}%`], ['land range', `${Math.round(S.range[0])} .. ${Math.round(S.range[1])} m about Phoenix`], ['decoded', `${(S.asset.bytes / 1048576).toFixed(2)} MB in ${S.loadMs} ms`], ['sources', (a.sources ?? []).map((s) => s.name ?? s).join(' · ')]] : [['asset', 'loading…']];
    if (S.T) rows.push(['survey (rows now)', `max grade ${(S.T.stats.maxGrade * 100).toFixed(1)}% · cut ${S.T.stats.maxCut} m · fill ${S.T.stats.maxFill} m · ${S.T.surveyMs} ms`]);
    if (f?.road) rows.push(['in game', `max grade ${(f.road.maxGrade * 100).toFixed(1)}% · cut ${f.road.maxCut} m · fill ${f.road.maxFill} m`]);
    info.append(el('div', { class: 'scroll' }, el('dl', { class: 'kv', html: rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('') }),
      el('h3', { style: { font: '800 13px var(--display)', letterSpacing: '0.16em', color: 'var(--amber)', margin: '14px 0 6px' } }, 'KNOBS · src/data/terrain.js'),
      el('table', { class: 'knobs', html: Object.entries(TERRAIN).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td><td>${esc(KNOB_NOTES[k] ?? '')}</td></tr>`).join('') }),
      el('p', { style: { color: 'var(--muted)', fontSize: '12px' }, html: 'Bake knobs take <code>node tools/terrain-bake.mjs</code> (30-40 s from the cache, <code>--offline</code> refuses to fetch); engine knobs take a reload. <code>node tools/terrain-check.mjs</code> proves the asset offline.' })));
  }

  async function survey() {
    // The engine's own survey of our road onto the land, over the rows the forge holds now (an edited I-10 shows here).
    try {
      const d = F.docs.usmap?.doc ?? (await loadDoc('usmap')).doc;
      S.W = await worldOf(d, F.docs.usmap.hash);
      if (S.asset) { const { RealTerrain } = await import('../world/realterrain.js'); S.T = new RealTerrain(S.asset, S.W); }
    } catch (e) { console.warn('survey', e); }
    drawLand(); renderInfo();
  }
  on('game', () => readFlag());
  on('doc', ({ file }) => { if (file === 'usmap' && S.asset && F.tab === 'terrain') survey(); });
  addPalette(() => [{ label: 'TERRAIN: real terrain ON', hint: 'terrain on=true', tag: 'TERRAIN', run: () => { F.show('terrain'); setFlag(true); } }, { label: 'TERRAIN: real terrain OFF', hint: 'terrain on=false', tag: 'TERRAIN', run: () => { F.show('terrain'); setFlag(false); } }]);
  let started = false;
  return {
    id: 'terrain', label: 'Terrain', icon: 'terrain', pane,
    async init() {},
    async onShow() {
      if (!started) { started = true; renderFlag(); renderInfo(); await loadLand(); loadProfile(); await survey(); }
      readFlag(); drawLand(); drawProfile();
    },
    S, setFlag, readFlag, look: (x, z) => { S.hover = { x, z }; drawLand(); return shoot(); },
  };
}
