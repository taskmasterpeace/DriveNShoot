// BRUSH (docs/design/WEB_FORGE.md §3.4): paint density over the land as rows the chunk generator reads (src/data/brush.json
// -> src/world/brush.js -> src/world/chunkgen.js). Forest and canopy (Robert: "forests gotta be thick, canopies"),
// undergrowth, the corridor's ruin share, radiation zones. A stroke is one row: written field-preserving, pushed live so
// the chunks it reaches are laid out again in the game at once. The heat on the map is the engine's own BrushField; the
// chunk preview is the engine's own generator, before and after; IN GAME is the game's own camera.
import { F, el, esc, svg, patch, toast, modal, cmd, on, addPalette, loadDoc, confirmBox } from './core.js';
import { MapView, drawNetwork, Labeler, polyline, toWorld, toUsmap } from './mapview.js';
import { BrushField } from '../world/brush.js';
import { worldOf, layout, setBrush } from './engine.js';
import { STREAM } from '../data/streaming.js';
import { getLand } from './land.js';
import { roundPt } from './rows.js';

const LAYERS = [
  ['forest', 'FOREST', [64, 128, 52], 'tree stems: 0 none .. 1 a closed wood (pine, oak, cypress by state; the understory under them)'],
  ['canopy', 'CANOPY', [38, 110, 92], 'crown size and the share of tall canopy trees, where there is forest'],
  ['brush', 'BRUSH', [150, 150, 70], 'undergrowth: olive clumps, creosote, tumbleweed'],
  ['ruin', 'RUIN', [176, 96, 64], 'the share of the corridor\'s buildings left as ruined shells (0 all standing .. 1 all ruins)'],
  ['rad', 'RAD', [206, 236, 64], 'radiation: sick yellow ground, dead trees, glowing seeps, leaking drums (radAt for the systems that care)'],
];
const OPS = [['add', 'paint', 'PAINT'], ['sub', 'erase', 'ERASE'], ['set', 'set', 'SET']];

export function brushTab() {
  const S = { layer: 'forest', op: 'add', r: 260, v: 1, soft: 0.5, stroke: null, sel: null, chunk: null, heat: { key: '', canvas: null }, preview: null, shot: null };
  const pane = el('section', { class: 'pane pane-brush', id: 'pane-brush' });
  const rail = el('nav', { class: 'rail plate' });
  for (const [op, icon, label] of OPS) rail.append(el('button', { class: `tool${op === S.op ? ' on' : ''}`, 'data-op': op, title: `${label} (${label[0]})`, html: `${svg(icon)}<span class="k">${label[0]}</span>`, onclick: () => setOp(op) }));
  rail.append(el('hr'));
  rail.append(el('button', { class: 'tool', 'data-op': 'probe', title: 'PROBE: click a spot to read every layer and preview its chunk (C)', html: `${svg('eye')}<span class="k">C</span>`, onclick: () => setOp('probe') }));
  const wrap = el('div', { class: 'mapwrap' });
  const readout = el('div', { class: 'readout' }, '—'), scale = el('div', { class: 'scalebar' }), hint = el('div', { class: 'toolhint' });
  const zoomer = el('div', { class: 'zoomer' },
    el('button', { class: 'btn icon', title: 'Zoom in', onclick: () => mv.zoomAt(mv.w / 2, mv.hgt / 2, mv.view.s * 1.6) }, '+'),
    el('button', { class: 'btn icon', title: 'Zoom out', onclick: () => mv.zoomAt(mv.w / 2, mv.hgt / 2, mv.view.s / 1.6) }, '−'),
    el('button', { class: 'btn icon', title: 'The I-10 corridor', html: svg('fit'), onclick: () => fitCorridor() }));
  const layerBar = el('div', { class: 'layers' });
  for (const [id, label, c] of LAYERS) layerBar.append(el('button', { class: `layerpill${id === S.layer ? ' on' : ''}`, 'data-layer': id, title: LAYERS.find((x) => x[0] === id)[3], html: `<i style="background:rgb(${c.join(',')})"></i>${label}`, onclick: () => setLayer(id) }));
  wrap.append(el('div', { class: 'maptools' }, layerBar), zoomer, readout, scale, hint);
  const brushPlate = el('section', { class: 'plate' }), strokesPlate = el('section', { class: 'plate grow' }), previewPlate = el('section', { class: 'plate' });
  pane.append(rail, wrap, el('aside', { class: 'side' }, brushPlate, previewPlate, strokesPlate));
  const mv = new MapView(wrap, { cx: -42400, cy: 7600, s: 0.12 });
  mv.cursor = 'none';
  let field = new BrushField({ strokes: [] });
  const doc = () => F.docs.brush?.doc;

  function setOp(op) { S.op = op; rail.querySelectorAll('.tool').forEach((b) => b.classList.toggle('on', b.dataset.op === op)); paintHint(); mv.cursor = op === 'probe' ? 'crosshair' : 'none'; mv.canvas.style.cursor = mv.cursor; }
  function setLayer(id) { S.layer = id; layerBar.querySelectorAll('.layerpill').forEach((b) => b.classList.toggle('on', b.dataset.layer === id)); S.heat.key = ''; mv.redraw(); paintHint(); renderBrush(); }
  function paintHint() {
    const L = LAYERS.find((x) => x[0] === S.layer);
    hint.innerHTML = S.op === 'probe' ? '<b>PROBE</b> · click a spot: every layer there, its chunk before and after, and the game\'s camera' : `<b>${OPS.find((o) => o[0] === S.op)[2]} ${L[1]}</b> · drag to paint a stroke (${S.r} m, ${Math.round(S.v * 100)}%) · shift-drag pans · [ ] radius`;
  }

  // ---- painting ----------------------------------------------------------------------------------------------------
  mv.h.down = (e, p) => {
    if (e.button !== 0) return false;
    if (S.op === 'probe') return true;
    S.stroke = { pts: [[p.ux, p.uy]] };
    mv.redraw(); return true;
  };
  mv.h.move = (e, p) => {
    mv.mouse = p;
    if (!S.stroke) return;
    const last = S.stroke.pts[S.stroke.pts.length - 1], rU = S.r / STREAM.K;
    if (Math.hypot(p.ux - last[0], p.uy - last[1]) > rU * 0.35) S.stroke.pts.push([p.ux, p.uy]);
    mv.redraw();
  };
  mv.h.up = async (e, p) => {
    if (S.op === 'probe') { probe(p); return; }
    const st = S.stroke; S.stroke = null;
    if (!st) return;
    const d = doc(); let n = (d?.strokes?.length ?? 0) + 1;
    while (d?.strokes?.some((s) => s.id === `${S.layer}-${n}`)) n++;
    const row = { id: `${S.layer}-${n}`, layer: S.layer, op: S.op, v: +S.v.toFixed(2), r: +(S.r / STREAM.K).toFixed(1), soft: +S.soft.toFixed(2), pts: simplify(st.pts, S.r / STREAM.K * 0.25).map(roundPt) };
    const r = await patch('brush', [{ op: 'add', coll: 'strokes', row }], { label: `${S.op === 'sub' ? 'erase' : 'paint'} ${S.layer} (${row.pts.length} pt${row.pts.length > 1 ? 's' : ''})`, tab: 'brush' });
    if (r.ok) { S.sel = row.id; const c = st.pts[Math.floor(st.pts.length / 2)]; probe({ ux: c[0], uy: c[1] }, true); }
  };
  mv.h.hover = (e, p) => { mv.mouse = p; readoutAt(p); mv.redraw(); };
  mv.h.leave = () => { mv.mouse = null; mv.redraw(); readout.textContent = '—'; };
  mv.h.view = () => { S.heat.key = ''; paintScale(); };
  mv.h.click = (e, p) => { if (S.op === 'probe') probe(p); };
  function simplify(pts, tol) { if (pts.length < 3) return pts; const out = [pts[0]]; for (let i = 1; i < pts.length - 1; i++) { const a = out[out.length - 1]; if (Math.hypot(pts[i][0] - a[0], pts[i][1] - a[1]) >= tol) out.push(pts[i]); } out.push(pts[pts.length - 1]); return out; }

  // ---- probe: the layers at a spot, its chunk before and after (the engine's generator), the game's camera -------------------
  async function probe(p, quiet) {
    const [x, z] = toWorld([p.ux, p.uy]), cx = Math.floor(x / 256), cz = Math.floor(z / 256);
    S.chunk = { x, z, cx, cz, at: field.at(x, z) };
    renderPreview('laying out…');
    try {
      const d = F.docs.usmap?.doc ?? (await loadDoc('usmap')).doc;
      const W = await worldOf(d, F.docs.usmap.hash);
      const bd = doc();
      setBrush({ ...bd, strokes: [] }); const before = await layout(W, cx, cz);
      setBrush(bd); const after = await layout(W, cx, cz);
      S.preview = { before, after, cx, cz };
    } catch (e) { S.preview = { error: String(e.message ?? e) }; }
    renderPreview();
    if (!quiet || F.game.alive) shoot();
  }
  async function shoot() {
    if (!S.chunk) return;
    if (!F.game.alive) { S.shot = { error: 'no game tab attached' }; renderPreview(); return; }
    if (Math.hypot(S.chunk.x, S.chunk.z) > STREAM.dustWall) { S.shot = { error: 'past the dust wall: not streamed yet' }; renderPreview(); return; }
    S.shot = { loading: true }; renderPreview();
    const r = await cmd('screenshot', { x: Math.round(S.chunk.x), z: Math.round(S.chunk.z), zoom: 90, quality: 0.8, width: 960, height: 540 }, { timeoutMs: 30000 });
    S.shot = r.ok ? { image: r.image, x: S.chunk.x, z: S.chunk.z } : { error: r.error };
    renderPreview();
  }
  function count(L) { const c = L?.counts ?? {}; let trees = 0; for (const [k, n] of Object.entries(c)) if (k.startsWith('fl_')) trees += n; return { trees, shrubs: c.shrubs ?? 0, glows: c.glows ?? 0, barrels: c.barrels ?? 0 }; }
  // A chunk from above as the generator laid it out: its ground colours, then every instance as its footprint.
  function drawChunk(cv, L) {
    const g = cv.getContext('2d'), N = cv.width, k = N / 256;
    g.fillStyle = '#18140e'; g.fillRect(0, 0, N, N);
    if (!L) return;
    const G = L.surf.ground;
    if (G) { const n = 33; for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) { const v = (j * n + i) * 3; g.fillStyle = `rgb(${G.col[v] * 168},${G.col[v + 1] * 140},${G.col[v + 2] * 100})`; g.fillRect(i * 8 * k, j * 8 * k, 8 * k + 1, 8 * k + 1); } }
    const R = L.surf.road; if (R) { g.fillStyle = 'rgba(64,60,56,0.9)'; for (let t = 0; t < R.ni; t += 3) { const a = R.idx[t] * 3, b = R.idx[t + 1] * 3, c = R.idx[t + 2] * 3; g.beginPath(); g.moveTo(R.pos[a] * k, R.pos[a + 2] * k); g.lineTo(R.pos[b] * k, R.pos[b + 2] * k); g.lineTo(R.pos[c] * k, R.pos[c + 2] * k); g.fill(); } }
    const ox = L.cx * 256, oz = L.cz * 256;
    const pools = Object.entries(L.inst).sort(([a], [b]) => (a.startsWith('fl_') ? 1 : 0) - (b.startsWith('fl_') ? 1 : 0));
    for (const [name, r] of pools) {
      for (let i = 0; i < r.n; i++) {
        const o = i * 16, x = (r.m[o + 12] - ox) * k, z = (r.m[o + 14] - oz) * k, sx = Math.hypot(r.m[o], r.m[o + 2]), sz = Math.hypot(r.m[o + 8], r.m[o + 10]);
        const c = r.c ? [r.c[i * 3], r.c[i * 3 + 1], r.c[i * 3 + 2]] : [1, 1, 1];
        if (name.startsWith('fl_')) {
          const kind = name.slice(3), rad = ({ oak: 4.4, pine: 3.2, cypress: 4.2, mesquite: 3.6, paloverde: 3.2, deadtree: 2.4, saguaro: 1, joshua: 2.2, fanpalm: 2.8, datepalm: 4.5 }[kind] ?? 1.5) * sx * k;
          const base = { oak: [70, 112, 44], pine: [44, 84, 46], cypress: [92, 112, 58], deadtree: [130, 120, 108], mesquite: [62, 88, 40], paloverde: [140, 160, 72] }[kind] ?? [90, 110, 60];
          g.fillStyle = `rgba(${base[0] * c[0]},${base[1] * c[1]},${base[2] * c[2]},0.92)`; g.beginPath(); g.arc(x, z, Math.max(1, rad), 0, 7); g.fill();
          g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.arc(x + rad * 0.25, z + rad * 0.25, Math.max(0.6, rad * 0.55), 0, 7); g.fill();
        } else if (name === 'glows') { g.fillStyle = `rgba(190,240,60,0.35)`; g.beginPath(); g.arc(x, z, Math.max(2, sx * k * 0.5), 0, 7); g.fill(); }
        else if (name === 'barrels') { g.fillStyle = '#c9b23a'; g.fillRect(x - 1.5, z - 1.5, 3, 3); }
        else if (name === 'walls' || name === 'roofs') { g.fillStyle = `rgba(${c[0] * 200},${c[1] * 190},${c[2] * 170},0.95)`; g.fillRect(x - sx * k / 2, z - sz * k / 2, Math.max(1, sx * k), Math.max(1, sz * k)); }
        else if (name === 'shrubs' || name === 'boulders' || name === 'cacti') { g.fillStyle = `rgba(${c[0] * 255},${c[1] * 255},${c[2] * 255},0.9)`; g.beginPath(); g.arc(x, z, Math.max(0.7, sx * k * 0.6), 0, 7); g.fill(); }
      }
    }
  }

  // ---- the side panels ---------------------------------------------------------------------------------------------
  function renderBrush() {
    brushPlate.innerHTML = '';
    const L = LAYERS.find((x) => x[0] === S.layer);
    brushPlate.append(el('header', { class: 'ph' }, el('h2', {}, 'THE BRUSH'), el('span', { class: 'sub' }, L[1]), el('span', { class: 'grow' }),
      el('button', { class: 'btn mini', title: 'The brush\'s knobs and palettes (rows in brush.json)', html: `${svg('knobs')}<span>KNOBS</span>`, onclick: editKnobs })));
    brushPlate.append(el('div', { class: 'field', style: { paddingTop: 0 } }, el('span', { class: 'help', style: { color: 'var(--muted)', fontSize: '12px' } }, L[3])));
    const slider = (label, key, min, max, step, fmt) => {
      const out = el('b', {}, fmt(S[key]));
      const inp = el('input', { type: 'range', min, max, step, value: S[key], oninput: (e) => { S[key] = Number(e.target.value); out.textContent = fmt(S[key]); paintHint(); mv.redraw(); } });
      return el('div', { class: 'field' }, el('label', {}, label, out), inp);
    };
    brushPlate.append(slider('Radius (world)', 'r', 20, 3000, 10, (v) => (v >= 1000 ? `${(v / 1000).toFixed(1)} km` : `${v} m`)), slider('Strength', 'v', 0.05, 1, 0.05, (v) => `${Math.round(v * 100)}%`), slider('Soft edge', 'soft', 0, 1, 0.05, (v) => `${Math.round(v * 100)}%`));
  }
  function renderStrokes() {
    strokesPlate.innerHTML = '';
    const d = doc(), list = d?.strokes ?? [];
    const by = {}; for (const s of list) by[s.layer] = (by[s.layer] ?? 0) + 1;
    strokesPlate.append(el('header', { class: 'ph' }, el('h2', {}, 'STROKES'), el('span', { class: 'sub' }, `${list.length} rows · v${d?.version ?? 0}`), el('span', { class: 'grow' }),
      el('button', { class: 'btn mini', title: 'Push every brush row into the game now (forgePush file=brush)', html: `${svg('push')}<span>PUSH</span>`, onclick: async () => { const { push } = await import('./core.js'); push('brush'); } })));
    if (!list.length) { strokesPlate.append(el('div', { class: 'empty' }, el('div', { class: 'circ', html: svg('brush') }), el('b', {}, 'NOTHING PAINTED YET'), el('span', {}, 'Pick FOREST, drag across the land beside I-10, and the woods are in the game the moment you let go.'))); return; }
    const ol = el('ol', { class: 'strokes' });
    for (const s of [...list].reverse()) {
      const c = LAYERS.find((x) => x[0] === s.layer)?.[2] ?? [200, 200, 200];
      ol.append(el('li', { class: `stroke${S.sel === s.id ? ' sel' : ''}`, onclick: () => { S.sel = s.id; const m = s.pts[Math.floor(s.pts.length / 2)]; mv.flyTo(m[0], m[1], Math.max(mv.view.s, Math.min(1.2, 120 / (s.r * 2)))); renderStrokes(); mv.redraw(); probe({ ux: m[0], uy: m[1] }, true); } },
        el('i', { style: { background: `rgb(${c.join(',')})` } }),
        el('div', {}, el('b', {}, s.id), el('span', {}, ` ${s.op ?? 'add'} ${Math.round(s.v * 100)}% · r ${Math.round(s.r * STREAM.K)} m · ${s.pts.length} pt${s.pts.length > 1 ? 's' : ''}${s.note ? ` · ${s.note}` : ''}`)),
        el('button', { class: 'x', title: 'Delete this stroke (undo brings it back)', onclick: async (e) => { e.stopPropagation(); await patch('brush', [{ op: 'remove', coll: 'strokes', id: s.id }], { label: `delete stroke ${s.id}`, tab: 'brush' }); } }, '×')));
    }
    strokesPlate.append(el('div', { class: 'scroll' }, ol));
  }
  function renderPreview(msg) {
    previewPlate.innerHTML = '';
    const c = S.chunk;
    previewPlate.append(el('header', { class: 'ph' }, el('h2', {}, 'PREVIEW'), el('span', { class: 'sub' }, c ? `chunk ${c.cx},${c.cz} · the engine's generator` : 'probe a spot (C)'), el('span', { class: 'grow' }),
      c ? el('button', { class: 'btn mini', title: 'Teleport the game\'s player here', html: `${svg('pin')}<span>GO</span>`, onclick: async () => { const r = await cmd('teleport', { x: Math.round(c.x), z: Math.round(c.z) }); toast(r.ok ? 'Teleported' : r.error, r.ok ? 'ok' : 'bad'); shoot(); } }) : null));
    if (!c) { previewPlate.append(el('div', { class: 'empty', style: { padding: '10px 16px 16px' } }, el('span', {}, 'Paint, or pick PROBE and click: the chunk there laid out by the game\'s own generator, without the paint and with it, and the game\'s camera over it.'))); return; }
    const at = c.at;
    previewPlate.append(el('div', { class: 'field', style: { paddingTop: 0 } }, el('span', { style: { color: 'var(--muted)', fontSize: '12px' } }, LAYERS.map(([k, l]) => `${l} ${at[k] === null || at[k] === undefined ? '—' : Math.round(at[k] * 100) + '%'}`).join(' · '))));
    if (msg) { previewPlate.append(el('div', { class: 'empty' }, msg)); return; }
    if (S.preview?.error) previewPlate.append(el('div', { class: 'empty' }, `preview: ${S.preview.error}`));
    else if (S.preview) {
      const b = count(S.preview.before), a = count(S.preview.after);
      const cb = el('canvas', { width: 256, height: 256 }), ca = el('canvas', { width: 256, height: 256 });
      drawChunk(cb, S.preview.before); drawChunk(ca, S.preview.after);
      previewPlate.append(el('div', { class: 'preview' },
        el('figure', {}, cb, el('figcaption', {}, 'UNPAINTED', el('b', {}, `${b.trees} trees`))),
        el('figure', {}, ca, el('figcaption', {}, 'PAINTED', el('b', {}, `${a.trees} trees${a.glows ? ` · ${a.glows} seeps` : ''}`)))));
    }
    const ig = el('div', { class: 'ingame' }, el('span', { class: 'tag' }, 'IN GAME'));
    if (S.shot?.image) ig.append(el('img', { src: S.shot.image, alt: 'the game camera over the probed spot' }));
    else ig.append(S.shot?.loading ? 'the game\'s camera…' : S.shot?.error ? `in game: ${S.shot.error}` : el('button', { class: 'btn mini', html: `${svg('camera')}<span>SHOW IN GAME</span>`, onclick: shoot }));
    if (S.shot?.image) ig.append(el('button', { class: 'btn mini', style: { position: 'absolute', right: '8px', bottom: '8px' }, html: `${svg('camera')}<span>AGAIN</span>`, onclick: shoot }));
    previewPlate.append(ig);
  }
  async function editKnobs() {
    const d = doc(); if (!d) return;
    const k = d.knobs;
    const v = await modal({ title: 'BRUSH KNOBS', ok: 'WRITE', wide: true, body: '<p class="help">Rows in web/src/data/brush.json (knobs): how a painted layer turns into things in a chunk. Values are JSON. A change lays out every painted chunk again.</p>',
      fields: Object.keys(k).map((key) => ({ key, label: key, value: JSON.stringify(k[key]) })), validate: (x) => { for (const key of Object.keys(x)) { try { JSON.parse(x[key]); } catch { return `${key}: not JSON`; } } return null; } });
    if (!v) return;
    const set = {}; for (const key of Object.keys(v)) { const nv = JSON.parse(v[key]); if (JSON.stringify(nv) !== JSON.stringify(k[key])) set[key] = nv; }
    if (!Object.keys(set).length) return toast('Nothing changed', 'warn');
    await patch('brush', [{ op: 'top', key: 'knobs', set }], { label: `knobs ${Object.keys(set).join(', ')}`, tab: 'brush' });
  }

  // ---- drawing -----------------------------------------------------------------------------------------------------
  // The heat: the engine's BrushField sampled on a coarse screen grid, the current layer coloured, the others faint.
  function heat() {
    const key = `${mv.view.cx.toFixed(1)},${mv.view.cy.toFixed(1)},${mv.view.s.toFixed(5)},${mv.w},${mv.hgt},${field.hash},${S.layer}`;
    if (S.heat.key === key) return S.heat.canvas;
    const st = 5, W = Math.ceil(mv.w / st), H = Math.ceil(mv.hgt / st);
    const cv = S.heat.canvas ?? document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d'), img = g.createImageData(W, H), d = img.data;
    if (field.strokes.length) for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const [x, z] = toWorld([mv.ux(i * st + st / 2), mv.uy(j * st + st / 2)]);
      const at = field.at(x, z);
      let r = 0, gg = 0, b = 0, a = 0;
      for (const [L, , c] of LAYERS) {
        const v = at[L]; if (!v) continue;
        const w = (L === S.layer ? 0.62 : 0.25) * v;
        r += c[0] * w; gg += c[1] * w; b += c[2] * w; a += w;
      }
      if (a > 0) { const o = (j * W + i) * 4; d[o] = r / a; d[o + 1] = gg / a; d[o + 2] = b / a; d[o + 3] = Math.min(220, a * 255); }
    }
    g.putImageData(img, 0, 0);
    S.heat = { key, canvas: cv };
    return cv;
  }
  mv.layers.push({ id: 'brush', draw: (g) => {
    const d = F.docs.usmap?.doc; if (!d) return;
    const hc = heat();
    g.imageSmoothingEnabled = true; g.drawImage(hc, 0, 0, mv.w, mv.hgt);
    drawNetwork(g, mv, d, { alpha: 0.7, streets: true });
    const lab = new Labeler();
    for (const t of d.towns) { const x = mv.sx(t.pos[0]), y = mv.sy(t.pos[1]); if (x < -50 || y < -20 || x > mv.w + 20 || y > mv.hgt + 20) continue; g.fillStyle = '#e3a72f'; g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill(); lab.text(g, t.name, x, y, { font: '700 12px "Barlow Condensed", sans-serif' }); }
    // Stroke outlines (the selected one bright).
    for (const s of doc()?.strokes ?? []) {
      const on = s.id === S.sel; if (!on && mv.view.s < 0.05) continue;
      g.strokeStyle = on ? 'rgba(255,214,120,0.95)' : 'rgba(239,230,204,0.25)'; g.lineWidth = on ? 1.8 : 1; g.setLineDash(on ? [] : [3, 4]);
      if (s.pts.length === 1) { g.beginPath(); g.arc(mv.sx(s.pts[0][0]), mv.sy(s.pts[0][1]), s.r * mv.view.s, 0, 7); g.stroke(); }
      else { g.lineWidth = Math.max(1, on ? 1.8 : 1); polyline(g, mv, s.pts); g.stroke(); }
      g.setLineDash([]);
    }
    // The stroke being painted and the brush cursor.
    const rpx = (S.r / STREAM.K) * mv.view.s;
    if (S.stroke) { const c = LAYERS.find((x) => x[0] === S.layer)[2]; g.strokeStyle = `rgba(${c.join(',')},0.55)`; g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = rpx * 2; polyline(g, mv, S.stroke.pts); g.stroke(); }
    if (mv.mouse && S.op !== 'probe') {
      const x = mv.mouse.px, y = mv.mouse.py;
      g.strokeStyle = S.op === 'sub' ? '#d9643a' : '#ffd678'; g.lineWidth = 1.6; g.beginPath(); g.arc(x, y, Math.max(3, rpx), 0, 7); g.stroke();
      if (S.soft > 0) { g.setLineDash([3, 3]); g.beginPath(); g.arc(x, y, Math.max(2, rpx * (1 - S.soft)), 0, 7); g.stroke(); g.setLineDash([]); }
      g.fillStyle = g.strokeStyle; g.beginPath(); g.arc(x, y, 1.6, 0, 7); g.fill();
    }
    // The probed chunk.
    if (S.chunk) { const x0 = toUsmap(S.chunk.cx * 256, S.chunk.cz * 256), x1 = toUsmap(S.chunk.cx * 256 + 256, S.chunk.cz * 256 + 256); g.strokeStyle = '#7fd1c4'; g.lineWidth = 1.5; g.strokeRect(mv.sx(x0[0]), mv.sy(x0[1]), (x1[0] - x0[0]) * mv.view.s, (x1[1] - x0[1]) * mv.view.s); }
  } });
  function readoutAt(p) {
    const [x, z] = toWorld([p.ux, p.uy]), at = field.at(x, z);
    readout.innerHTML = `world <b>${Math.round(x)}, ${Math.round(z)}</b> · ${LAYERS.map(([k, l]) => `${l} <b>${at[k] === null ? '—' : Math.round((at[k] ?? 0) * 100)}</b>`).join(' · ')}`;
  }
  function paintScale() {
    const mPerPx = mv.worldPerPx(), target = 120 * mPerPx, pow = Math.pow(10, Math.floor(Math.log10(target))), n = [1, 2, 5, 10].find((k) => k * pow >= target / 1.6) * pow;
    scale.innerHTML = `${n >= 1000 ? `${n / 1000} km` : `${n} m`} <small style="opacity:.6">world</small><i style="width:${n / mPerPx}px"></i>`;
  }
  function fitCorridor() { const a = toUsmap(-42000, -3000), b = toUsmap(42000, 3000); mv.fit(a[0], a[1], b[0], b[1], 30); }

  on('doc', ({ file }) => {
    if (file === 'usmap' && F.docs.usmap) { mv.setGrid(F.docs.usmap.doc); }
    if (file === 'brush' && doc()) { field = new BrushField(doc()); S.heat.key = ''; renderStrokes(); mv.redraw(); }
  });
  addPalette(() => [
    ...LAYERS.map(([id, label]) => ({ label: `BRUSH: paint ${label}`, hint: 'layer', tag: 'BRUSH', run: () => { F.show('brush'); setLayer(id); setOp('add'); } })),
    { label: 'BRUSH: probe a spot', hint: 'C', tag: 'BRUSH', run: () => { F.show('brush'); setOp('probe'); } },
    { label: 'BRUSH: knobs', hint: 'forestPerHa, spread, tints…', tag: 'BRUSH', run: () => { F.show('brush'); editKnobs(); } },
  ]);
  function onKey(e) {
    if (e.target.closest('input, textarea, select, dialog')) return false;
    const k = e.key.toLowerCase();
    if (k === 'p') { setOp('add'); return true; } if (k === 'e') { setOp('sub'); return true; } if (k === 's' && !e.ctrlKey) { setOp('set'); return true; } if (k === 'c') { setOp('probe'); return true; }
    if (k === '[' || k === ']') { S.r = Math.max(20, Math.min(3000, Math.round(S.r * (k === ']' ? 1.25 : 0.8)))); renderBrush(); paintHint(); mv.redraw(); return true; }
    const n = Number(k); if (n >= 1 && n <= 5) { setLayer(LAYERS[n - 1][0]); return true; }
    return false;
  }
  return {
    id: 'brush', label: 'Brush', icon: 'brush', pane, undoFile: 'brush', onKey,
    async init() {
      if (!F.docs.usmap) await loadDoc('usmap');
      mv.setGrid(F.docs.usmap.doc);
      await loadDoc('brush');
      setOp('add'); renderBrush(); renderPreview(); paintScale();
      getLand().then((L) => { mv.land = L; mv.landFrom = 0.01; mv.redraw(); }).catch((e) => console.warn('land', e));
    },
    onShow() { mv.resize(); mv.redraw(); },
    S, mv, probe: (x, z) => { const u = toUsmap(x, z); return probe({ ux: u[0], uy: u[1] }, true); }, shoot, fit: (x, z, s) => { const u = toUsmap(x, z); mv.flyTo(u[0], u[1], s ?? mv.view.s, 1); }, setLayer, setOp,
  };
}
