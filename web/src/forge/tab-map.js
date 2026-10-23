// MAP (docs/design/WEB_FORGE.md §3.3): the national map editor over web/src/data/usmap.json, the rows the engine streams.
// Pan and zoom from the whole country to a town's street; every row drawn from the file (interstates, county and dirt
// roads, town streets, rails, rivers, towns and holdouts, exits, building slots), the atlas's sites and the fifty bases
// as layers; select anything and read every field (the ones the forge does not know shown, kept, never dropped); move,
// insert and delete vertices, add exits, place cities and holdouts, draw rails and roads. Every edit is a row op
// (forgePatch / mapEdit), checked (dead ends, orphans, unbridged crossings, the engine's own warnings) and pushed live.
import { F, el, esc, svg, $, patch, toast, modal, confirmBox, cmd, on, addPalette, updateStatus, loadDoc } from './core.js';
import { MapView, drawNetwork, drawShields, drawGameFrame, Labeler, KIND_COL, BASE_COL, polyline, rowBox, toWorld, toUsmap } from './mapview.js';
import { FILES, roundPt, fnv } from './rows.js';
import { checkMap } from './validate.js';
import { engineCheck } from './engine.js';
import { rowToWorld } from './frame.js';
import { ATLAS_SITES, ATLAS_BASES, ATLAS_XZ, HOLDERS, RULERS } from '../data/atlas.js';
import { STREAM } from '../data/streaming.js';
import { getLand } from './land.js';
import { brushField } from '../world/brush.js';

const KNOWN = {
  interstates: ['id', 'nickname', 'family', 'lanes', 'divided', 'danger', 'surface', 'pts'], roads: ['id', 'kind', 'lanes', 'surface', 'danger', 'leads_to', 'pts'],
  streets: ['id', 'lanes', 'pts'], rails: ['id', 'name', 'kind', 'note', 'pts'], rivers: ['id', 'pts'],
  towns: ['id', 'name', 'kind', 'pos', 'landmark', 'landmark_kind'], placements: ['id', 'building', 'pos', 'rot'],
  exits: ['id', 'highway_id', 'exit_number', 'name', 'archetype', 'community_tier', 'service_tags', 'risk_rating', 'has_return_ramp', 'pos', 'dest', 'ramp_ids', 'town_id'],
};
const LINE = new Set(['interstates', 'roads', 'streets', 'rails', 'rivers']);
const TOOLS = [
  ['select', 'select', 'V', 'SELECT · MOVE: click a row; drag its handles (vertices, a town, an exit and its destination)'],
  ['insert', 'insert', 'I', 'INSERT VERTEX: click on the selected line where the new vertex goes'],
  ['delete', 'del', 'X', 'DELETE VERTEX: click a vertex of the selected line'],
  null,
  ['exit', 'exit', 'E', 'ADD EXIT: click beside an interstate, on the side the community stands'],
  ['town', 'city', 'T', 'PLACE A CITY: click where it stands'],
  ['holdout', 'holdout', 'H', 'PLACE A HOLDOUT: click where it stands'],
  ['rail', 'rail', 'R', 'DRAW A RAIL LINE: click its points, double-click (or Enter) to finish'],
  ['road', 'road', 'D', 'DRAW A COUNTY ROAD: click its points, double-click (or Enter) to finish'],
  null,
  ['measure', 'measure', 'M', 'MEASURE: click two points (world km, game miles, minutes at speed)'],
];
const LAYERS = [
  ['states', 'STATES', '#e9dfc4'], ['rivers', 'RIVERS', '#68aac4'], ['interstates', 'INTERSTATES', '#ecaa48'], ['roads', 'ROADS', '#d6c496'], ['streets', 'STREETS', '#efe6cc'],
  ['rails', 'RAILS', '#1e1812'], ['towns', 'TOWNS', '#e3a72f'], ['exits', 'EXITS', '#efe6cc'], ['placements', 'SLOTS', '#b9ad92'],
  ['sites', 'ATLAS SITES', '#7fd1c4'], ['bases', '50 BASES', '#9cc46a'], ['brush', 'BRUSH', '#5f8f3a'], ['checks', 'CHECKS', '#d9643a'], ['game', 'GAME', '#9cc46a'],
];

export function mapTab() {
  const S = { tool: 'select', sel: null, layers: new Set(['states', 'rivers', 'interstates', 'roads', 'streets', 'rails', 'towns', 'exits', 'placements', 'sites', 'bases', 'checks', 'game']),
    drag: null, draft: null, measure: null, check: null, engine: null, findTab: 'deadEnds', game: null, hoverHit: null };
  const pane = el('section', { class: 'pane pane-map', id: 'pane-map' });
  const rail = el('nav', { class: 'rail plate' });
  for (const t of TOOLS) {
    if (!t) { rail.append(el('hr')); continue; }
    const [id, icon, key, tip] = t;
    rail.append(el('button', { class: `tool${id === S.tool ? ' on' : ''}`, 'data-tool': id, title: `${tip} (${key})`, html: `${svg(icon)}<span class="k">${key}</span>`, onclick: () => setTool(id) }));
  }
  const wrap = el('div', { class: 'mapwrap' });
  const layersBox = el('div', { class: 'layers' });
  for (const [id, label, col] of LAYERS) layersBox.append(el('button', { class: `chip${S.layers.has(id) ? ' on' : ''}`, 'data-layer': id, html: `<i style="background:${col}"></i>${label}`, onclick: (e) => { S.layers.has(id) ? S.layers.delete(id) : S.layers.add(id); e.currentTarget.classList.toggle('on'); mv.showStates = S.layers.has('states'); mv.redraw(); } }));
  const zoomer = el('div', { class: 'zoomer' },
    el('button', { class: 'btn icon', title: 'Zoom in', onclick: () => mv.zoomAt(mv.w / 2, mv.hgt / 2, mv.view.s * 1.6) }, '+'),
    el('button', { class: 'btn icon', title: 'Zoom out', onclick: () => mv.zoomAt(mv.w / 2, mv.hgt / 2, mv.view.s / 1.6) }, '−'),
    el('button', { class: 'btn icon', title: 'The whole country (0)', html: svg('fit'), onclick: () => fitUSA() }),
    el('button', { class: 'btn icon', title: 'The game (where the player is; G)', html: svg('pin'), onclick: () => flyToGame() }));
  const readout = el('div', { class: 'readout' }, '—'), scale = el('div', { class: 'scalebar' }), hover = el('div', { class: 'hover hidden' }), hint = el('div', { class: 'toolhint' });
  wrap.append(el('div', { class: 'maptools' }, layersBox), zoomer, readout, scale, hover, hint);
  const inspector = el('section', { class: 'plate grow' }), finds = el('section', { class: 'plate', style: { maxHeight: '44%' } });
  const side = el('aside', { class: 'side' }, inspector, finds);
  pane.append(rail, wrap, side);
  const mv = new MapView(wrap, { cx: -25000, cy: -2200, s: 0.016 });

  const doc = () => F.docs.usmap?.doc;
  const rowOf = (coll, id) => doc()?.[coll]?.find((r) => r.id === id) ?? null;
  const atlasPos = (kind, id) => { const v = ATLAS_XZ[kind]?.[id]; return v ? toUsmap(v[0], v[1]) : null; };

  // ---- tools -------------------------------------------------------------------------------------------------------
  function setTool(id) {
    S.tool = id; S.draft = null; S.measure = null;
    rail.querySelectorAll('.tool').forEach((b) => b.classList.toggle('on', b.dataset.tool === id));
    const t = TOOLS.find((x) => x && x[0] === id);
    hint.innerHTML = `<b>${esc(t[3].split(':')[0])}</b>${esc(t[3].slice(t[3].indexOf(':')))}`;
    mv.cursor = id === 'select' ? 'default' : 'crosshair'; mv.canvas.style.cursor = mv.cursor;
    mv.redraw();
  }

  // ---- picking -----------------------------------------------------------------------------------------------------
  const segDist = (px, py, ax, ay, bx, by) => { const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy; let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0; t = Math.max(0, Math.min(1, t)); return { d: Math.hypot(px - ax - dx * t, py - ay - dy * t), t }; };
  function handles() {
    const s = S.sel; if (!s?.coll) return [];
    const r = rowOf(s.coll, s.id); if (!r) return [];
    if (r.pts) return r.pts.map((p, i) => ({ field: 'pts', i, p }));
    const out = r.pos ? [{ field: 'pos', p: r.pos }] : [];
    if (r.dest) out.push({ field: 'dest', p: r.dest });
    return out;
  }
  function pick(p, opt = {}) {
    const d = doc(); if (!d) return null;
    const px = p.px, py = p.py, near = (u) => Math.hypot(mv.sx(u[0]) - px, mv.sy(u[1]) - py);
    if (!opt.noHandles) for (const h of handles()) if (near(h.p) < 9) return { ...S.sel, handle: h };
    const pts = [];
    if (S.layers.has('exits') && mv.view.s > 0.03) for (const r of d.exits) pts.push(['exits', r.id, r.pos]);
    if (S.layers.has('towns')) for (const r of d.towns) pts.push(['towns', r.id, r.pos]);
    if (S.layers.has('placements') && mv.view.s > 0.5) for (const r of d.placements) pts.push(['placements', r.id, r.pos]);
    if (S.layers.has('sites')) for (const r of ATLAS_SITES) { const u = atlasPos('sites', r.id); if (u) pts.push(['site', r.id, u]); }
    if (S.layers.has('bases')) for (const r of ATLAS_BASES) { const u = atlasPos('bases', r.id); if (u) pts.push(['base', r.id, u]); }
    let best = null, bd = 11;
    for (const [coll, id, u] of pts) { const dd = near(u); if (dd < bd) { bd = dd; best = { coll, id }; } }
    if (best) return best;
    bd = 7;
    for (const coll of ['rails', 'streets', 'interstates', 'roads', 'rivers']) {
      if (!S.layers.has(coll) || (coll === 'streets' && mv.view.s < 0.08)) continue;
      for (const r of d[coll] ?? []) {
        const b = rowBox(r); if (!mv.visible(b[0], b[1], b[2], b[3], 10)) continue;
        for (let i = 1; i < r.pts.length; i++) { const q = segDist(px, py, mv.sx(r.pts[i - 1][0]), mv.sy(r.pts[i - 1][1]), mv.sx(r.pts[i][0]), mv.sy(r.pts[i][1])); if (q.d < bd) { bd = q.d; best = { coll, id: r.id, seg: i, t: q.t }; } }
      }
    }
    return best;
  }

  // ---- pointer -----------------------------------------------------------------------------------------------------
  mv.h.down = (e, p) => {
    if (e.button !== 0) return false;
    if (S.tool === 'select') {
      const hit = pick(p);
      if (hit?.handle && hit.coll && LINE.has(hit.coll) || hit?.handle) { S.drag = { hit, from: hit.handle.p.slice(), to: [p.ux, p.uy] }; return true; }
      if (hit && ['towns', 'exits', 'placements'].includes(hit.coll) && S.sel?.id === hit.id) { const r = rowOf(hit.coll, hit.id); S.drag = { hit: { ...hit, handle: { field: 'pos', p: r.pos } }, from: r.pos.slice(), to: [p.ux, p.uy] }; return true; }
      return false;
    }
    return true; // the edit tools take every left press (click handled on up)
  };
  mv.h.move = (e, p) => { if (S.drag) { S.drag.to = [p.ux, p.uy]; mv.redraw(); readoutAt(p); } };
  mv.h.up = async (e, p, moved) => {
    if (S.drag) {
      const D = S.drag; S.drag = null;
      if (moved < 3) { select(D.hit); return; }
      const h = D.hit.handle, pt = roundPt(D.to);
      const op = h.field === 'pts' ? { op: 'vertex', coll: D.hit.coll, id: D.hit.id, i: h.i, pt } : { op: 'vertex', coll: D.hit.coll, id: D.hit.id, field: h.field, pt };
      await write([op], `move ${D.hit.id} ${h.field === 'pts' ? `vertex ${h.i}` : h.field}`, D.hit);
      S.sel = { coll: D.hit.coll, id: D.hit.id, v: h.i };
      return;
    }
    await toolClick(e, p);
  };
  mv.h.click = (e, p) => { if (S.tool === 'select') select(pick(p)); };
  mv.h.dbl = (e, p) => { if (S.draft) finishDraft(); else if (S.tool === 'select') { const hit = pick(p, { noHandles: true }); if (hit) focusRow(hit); } };
  mv.h.hover = (e, p) => { readoutAt(p); const hit = S.tool === 'select' || S.tool === 'insert' || S.tool === 'delete' ? pick(p) : null; S.hoverHit = hit; showHover(hit, p); if (S.draft || S.measure) mv.redraw(); };
  mv.h.leave = () => { hover.classList.add('hidden'); readout.textContent = '—'; };
  mv.h.view = () => paintScale();

  async function toolClick(e, p) {
    const d = doc(); const pt = roundPt([p.ux, p.uy]);
    if (S.tool === 'insert') {
      const hit = pick(p, { noHandles: true });
      if (!hit?.seg || !LINE.has(hit.coll)) return toast('Click on a line (a road, a street, a rail) where the new vertex goes', 'warn');
      const r = rowOf(hit.coll, hit.id), a = r.pts[hit.seg - 1], b = r.pts[hit.seg];
      const q = roundPt([a[0] + (b[0] - a[0]) * hit.t, a[1] + (b[1] - a[1]) * hit.t]);
      await write([{ op: 'insert', coll: hit.coll, id: hit.id, i: hit.seg, pt: q }], `insert a vertex in ${hit.id}`, hit);
      S.sel = { coll: hit.coll, id: hit.id, v: hit.seg }; renderInspector();
    } else if (S.tool === 'delete') {
      const hit = pick(p);
      if (!hit?.handle || hit.handle.field !== 'pts') return toast('Select a line first, then click one of its vertices', 'warn');
      await write([{ op: 'delete', coll: hit.coll, id: hit.id, i: hit.handle.i }], `delete vertex ${hit.handle.i} of ${hit.id}`, hit);
    } else if (S.tool === 'exit') await addExit(pt);
    else if (S.tool === 'town' || S.tool === 'holdout') await addTown(pt, S.tool === 'holdout' ? 'holdout' : 'city');
    else if (S.tool === 'rail' || S.tool === 'road') { S.draft ??= { kind: S.tool, pts: [] }; S.draft.pts.push(pt); mv.redraw(); }
    else if (S.tool === 'measure') { if (!S.measure || S.measure.b) S.measure = { a: pt }; else S.measure.b = pt; mv.redraw(); if (S.measure.b) showMeasure(); }
  }

  // ---- writes ------------------------------------------------------------------------------------------------------
  async function write(ops, label, hit) {
    const expect = hit?.coll && rowOf(hit.coll, hit.id) ? { [`${hit.coll}/${hit.id}`]: fnv(JSON.stringify(rowOf(hit.coll, hit.id))) } : undefined;
    const r = await patch('usmap', ops, { label, tab: 'map', expect });
    if (r.ok) { runChecks(); renderInspector(); mv.redraw(); }
    return r;
  }
  async function addExit(pt) {
    const d = doc();
    let best = null;
    for (const r of d.interstates) for (let i = 1; i < r.pts.length; i++) { const a = r.pts[i - 1], b = r.pts[i], q = segDist(pt[0], pt[1], a[0], a[1], b[0], b[1]); if (!best || q.d < best.d) best = { r, i, ...q, a, b }; }
    if (!best || best.d * mv.view.s > 60) return toast('Click beside an interstate (within a finger of it)', 'warn');
    const { r, a, b, t } = best, on = roundPt([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / len, ny = (b[0] - a[0]) / len, side = Math.sign((pt[0] - on[0]) * nx + (pt[1] - on[1]) * ny) || 1;
    const mine = d.exits.filter((e) => e.highway_id === r.id), n = mine.reduce((m, e) => Math.max(m, Number(/_X(\d+)$/.exec(e.id)?.[1] ?? 0)), 0) + 1;
    const num = mine.reduce((m, e) => Math.max(m, e.exit_number ?? 0), 0) + 1;
    const v = await modal({ title: `ADD AN EXIT ON ${r.id}`, ok: 'ADD EXIT', fields: [
      { key: 'id', label: 'Id', value: `${r.id}_X${n}` }, { key: 'exit_number', label: 'Exit number (the sign)', type: 'number', value: num },
      { key: 'name', label: 'Name (in our own words)', value: 'DRY CREEK RD' },
      { key: 'archetype', label: 'Archetype', type: 'select', value: 'service', options: d.exit_archetypes.map((x) => [x.id, `${x.name} (${x.id})`]) },
      { key: 'community_tier', label: 'Community', type: 'select', value: 'T1', options: [['T1', 'T1 · a handful of buildings'], ['T2', 'T2 · a strip'], ['T3', 'T3 · a town']] },
      { key: 'risk_rating', label: 'Risk 1-5', type: 'number', value: 2 },
      { key: 'dest', label: 'Community distance off the road (usmap m)', type: 'number', value: 300, help: `${r.id === 'I-10' ? 'I-10 streams: the engine builds the ramps, the bridge, the access road and the community the moment it is pushed.' : 'Not on the streamed corridor yet: kept as a row for the road graph.'}` },
    ], validate: (x) => (!/^[A-Za-z0-9_-]+$/.test(x.id) ? 'id: letters, digits, _ and -' : d.exits.some((e) => e.id === x.id) ? `${x.id} exists` : !x.name.trim() ? 'a name' : null) });
    if (!v) return;
    const arch = d.exit_archetypes.find((x) => x.id === v.archetype);
    const off = Number(v.dest) || 300, dest = roundPt([on[0] + nx * side * off, on[1] + ny * side * off]);
    const row = { id: v.id, highway_id: r.id, exit_number: Number(v.exit_number), name: v.name.trim().toUpperCase(), archetype: v.archetype, community_tier: v.community_tier, service_tags: arch?.service_tags ?? [], risk_rating: Number(v.risk_rating), has_return_ramp: true, pos: on, dest, ramp_ids: [], town_id: null };
    const res = await write([{ op: 'add', coll: 'exits', row }], `add exit ${row.id}`);
    if (res.ok) { S.sel = { coll: 'exits', id: row.id }; renderInspector(); }
  }
  async function addTown(pt, kind) {
    const d = doc();
    const v = await modal({ title: kind === 'holdout' ? 'PLACE A HOLDOUT' : 'PLACE A CITY', ok: 'PLACE', fields: [
      { key: 'name', label: 'Name', value: kind === 'holdout' ? 'NEW HOLDOUT' : 'NEW CITY' },
      { key: 'id', label: 'Id (lower case; streets are ST-<id>-..., slots <id>-...)', value: '' },
      { key: 'landmark_kind', label: 'Landmark', type: 'select', value: 'water_tower', options: ['water_tower', 'grain_elevator', 'church_steeple', 'radio_mast', 'none'] },
      { key: 'landmark', label: 'Landmark name', value: 'THE RUSTED WATER TOWER' },
    ], validate: (x) => { const id = (x.id || x.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); return !id ? 'a name' : d.towns.some((t) => t.id === id) ? `${id} exists` : null; } });
    if (!v) return;
    const id = (v.id || v.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const row = { id, name: v.name.trim().toUpperCase(), kind, pos: pt, ...(v.landmark_kind !== 'none' ? { landmark: v.landmark.trim().toUpperCase(), landmark_kind: v.landmark_kind } : {}) };
    const r = await write([{ op: 'add', coll: 'towns', row }], `place ${kind} ${id}`);
    if (r.ok) { S.sel = { coll: 'towns', id }; renderInspector(); }
  }
  async function finishDraft() {
    const D = S.draft; S.draft = null;
    if (!D || D.pts.length < 2) { mv.redraw(); return toast('A line needs two points at least', 'warn'); }
    const d = doc(), coll = D.kind === 'rail' ? 'rails' : 'roads', base = D.kind === 'rail' ? 'RL' : 'CR';
    let n = 1; while ((d[coll] ?? []).some((r) => r.id === `${base}-forge-${n}`)) n++;
    const v = await modal({ title: D.kind === 'rail' ? 'A NEW RAIL LINE' : 'A NEW COUNTY ROAD', ok: 'ADD', fields: [
      { key: 'id', label: 'Id', value: `${base}-forge-${n}` },
      ...(D.kind === 'rail' ? [{ key: 'name', label: 'Name', value: 'THE NEW LINE' }, { key: 'kind', label: 'Kind', type: 'select', value: 'freight', options: ['freight', 'passenger', 'military'] }]
        : [{ key: 'kind', label: 'Kind', type: 'select', value: 'county', options: ['county', 'dirt'] }, { key: 'surface', label: 'Surface', type: 'select', value: 'gravel', options: ['asphalt', 'gravel', 'dirt'] }, { key: 'danger', label: 'Danger 1-5', type: 'number', value: 2 }]),
    ], validate: (x) => ((d[coll] ?? []).some((r) => r.id === x.id) ? `${x.id} exists` : null) });
    if (!v) { mv.redraw(); return; }
    const row = D.kind === 'rail' ? { id: v.id, name: v.name.toUpperCase(), kind: v.kind, pts: D.pts } : { id: v.id, kind: v.kind, lanes: 2, surface: v.surface, danger: Number(v.danger), pts: D.pts };
    const r = await write([{ op: 'add', coll, row }], `draw ${coll === 'rails' ? 'rail' : 'road'} ${v.id}`);
    if (r.ok) { S.sel = { coll, id: v.id }; renderInspector(); }
  }
  async function editFields() {
    const s = S.sel, r = rowOf(s.coll, s.id); if (!r) return;
    const keys = Object.keys(r).filter((k) => k !== 'id' && k !== 'pts');
    const v = await modal({ title: `EDIT ${s.id}`, ok: 'WRITE', wide: keys.length > 8, body: `<p class="help">Only the fields you change are written; every other field and row stays as it is. Values are JSON (a string in quotes, a number, true, [..], {..}).</p>`,
      fields: [...keys.map((k) => ({ key: k, label: `${k}${KNOWN[s.coll]?.includes(k) ? '' : ' · not known to the forge (kept)'}`, value: JSON.stringify(r[k]), type: JSON.stringify(r[k]).length > 60 ? 'textarea' : 'text' })), { key: '__new', label: 'Add a field (name=json)', value: '' }],
      validate: (x) => { for (const k of keys) { try { JSON.parse(x[k]); } catch { return `${k}: not JSON`; } } if (x.__new && !/^[a-z_][a-z0-9_]*=.+$/i.test(x.__new)) return 'new field: name=json'; if (x.__new) { try { JSON.parse(x.__new.slice(x.__new.indexOf('=') + 1)); } catch { return 'new field: the value is not JSON'; } } return null; } });
    if (!v) return;
    const set = {};
    for (const k of keys) { const nv = JSON.parse(v[k]); if (JSON.stringify(nv) !== JSON.stringify(r[k])) set[k] = nv; }
    if (v.__new) { const i = v.__new.indexOf('='); set[v.__new.slice(0, i)] = JSON.parse(v.__new.slice(i + 1)); }
    if (!Object.keys(set).length) return toast('Nothing changed', 'warn');
    await write([{ op: 'set', coll: s.coll, id: s.id, set }], `edit ${Object.keys(set).join(', ')} of ${s.id}`, s);
  }
  async function removeRow() {
    const s = S.sel; if (!s?.coll || !FILES.usmap.colls[s.coll]) return;
    if (!(await confirmBox('DELETE THIS ROW?', `${s.coll}/${s.id} goes from usmap.json (undo brings it back).`, 'DELETE'))) return;
    const r = await write([{ op: 'remove', coll: s.coll, id: s.id }], `delete ${s.coll}/${s.id}`, s);
    if (r.ok) { S.sel = null; renderInspector(); }
  }

  // ---- checks ------------------------------------------------------------------------------------------------------
  let checkTimer = null;
  function runChecks() {
    clearTimeout(checkTimer);
    checkTimer = setTimeout(async () => {
      const d = doc(); if (!d) return;
      S.check = checkMap(d, { K: STREAM.K });
      try { S.engine = await engineCheck(d, F.docs.usmap.hash); S.check.engine = S.engine.warnings; S.check.counts.engine = S.engine.warnings.length; } catch (e) { S.engine = { error: String(e.message ?? e) }; }
      const c = S.check.counts;
      F.check = { ok: !c.deadEnds && !c.orphans && !c.unbridged && !c.engine, text: `${c.deadEnds} dead ends · ${c.orphans} orphans · ${c.unbridged} unbridged · ${c.engine} engine` };
      updateStatus(); renderFinds(); mv.redraw();
    }, 120);
  }
  const FT = [['deadEnds', 'DEAD ENDS', '#d9643a'], ['orphans', 'ORPHANS', '#e3c34a'], ['crossings', 'CROSSINGS', '#68aac4'], ['engine', 'ENGINE', '#c2402e']];
  function renderFinds() {
    const c = S.check;
    finds.innerHTML = '';
    finds.append(el('header', { class: 'ph' }, el('h2', {}, 'CHECKS'), el('span', { class: 'sub' }, 'the map\'s findings'), el('span', { class: 'grow' }),
      el('button', { class: 'btn mini', title: 'Run the checks again (and the engine\'s WorldIndex over the rows)', html: `${svg('check')}<span>VALIDATE</span>`, onclick: () => runChecks() })));
    if (!c) return finds.append(el('div', { class: 'empty' }, 'checking…'));
    const tabs = el('div', { class: 'findtabs' });
    for (const [k, l, col] of FT) {
      const n = k === 'crossings' ? c.counts.unbridged : c.counts[k];
      tabs.append(el('button', { class: `chip${S.findTab === k ? ' on' : ''}`, html: `<i style="background:${col}"></i>${l} <span class="ct">${n}</span>`, onclick: () => { S.findTab = k; renderFinds(); } }));
    }
    finds.append(tabs);
    const list = el('ol', { class: 'finds' }), items = (c[S.findTab] ?? []);
    const col = FT.find((x) => x[0] === S.findTab)[2];
    if (S.findTab === 'engine') {
      if (!items.length) list.append(el('li', { class: 'empty' }, el('b', {}, 'THE ENGINE IS HAPPY'), el('span', {}, `WorldIndex built ${S.engine?.exitsBuilt ?? '?'} I-10 exits and ${S.engine?.townsBuilt ?? '?'} towns from these rows in ${S.engine?.ms ?? '?'} ms, and skipped nothing.`)));
      for (const w of items) list.append(el('li', { class: 'find' }, el('i', { style: { background: col } }), el('div', {}, el('b', {}, 'WorldIndex'), el('span', {}, w))));
    } else {
      if (!items.length) list.append(el('li', { class: 'empty' }, el('b', {}, 'NONE'), el('span', {}, 'nothing of this kind on the map')));
      for (const f of items.slice(0, 200)) list.append(el('li', { class: 'find', onclick: () => { S.sel = { coll: f.coll, id: f.id }; renderInspector(); mv.flyTo(f.pt[0], f.pt[1], Math.max(mv.view.s, 0.12)); } },
        el('i', { style: { background: f.bridged ? '#9cc46a' : col } }), el('div', {}, el('b', {}, `${f.id}${f.over ? ` × ${f.over}` : ''}`), el('span', {}, f.why ?? (f.kind === 'water' ? `crosses ${f.over} for ${f.span} m with no bridge row` : `crosses the ${f.over} with ${f.bridged ? 'a bridge row' : 'no bridge row'}`)))));
    }
    finds.append(el('div', { class: 'scroll' }, list));
  }

  // ---- the inspector -----------------------------------------------------------------------------------------------
  const GLYPH = { interstates: 'road', roads: 'road', streets: 'road', rails: 'rail', rivers: 'map', towns: 'city', exits: 'exit', placements: 'building', site: 'site', base: 'holdout' };
  function select(hit) { S.sel = hit ? { coll: hit.coll, id: hit.id, v: hit.handle?.i } : null; renderInspector(); mv.redraw(); }
  function renderInspector() {
    inspector.innerHTML = '';
    const s = S.sel;
    if (!s) {
      inspector.append(el('header', { class: 'ph' }, el('h2', {}, 'INSPECTOR'), el('span', { class: 'sub' }, 'nothing selected')));
      const d = doc(), counts = d ? Object.entries(FILES.usmap.colls).filter(([k]) => Array.isArray(d[k])).map(([k, c]) => `<dt>${esc(c.label)}</dt><dd>${d[k].length} rows</dd>`).join('') : '';
      inspector.append(el('div', { class: 'empty' }, el('div', { class: 'circ', html: svg('map') }), el('b', {}, 'PICK ANYTHING ON THE MAP'), el('span', {}, 'a road, a town, an exit, a site, a base. Double-click flies to it. Ctrl+K finds a town by name.')));
      inspector.append(el('div', { class: 'scroll' }, el('dl', { class: 'kv', html: `${counts}<dt>Atlas sites</dt><dd>${ATLAS_SITES.length}</dd><dt>Bases</dt><dd>${ATLAS_BASES.length} (one a state)</dd><dt>File</dt><dd>web/src/data/usmap.json · ${F.files.usmap?.hash ?? ''}</dd>` })));
      return;
    }
    if (s.coll === 'site' || s.coll === 'base') return inspectAtlas(s);
    const r = rowOf(s.coll, s.id);
    if (!r) { S.sel = null; return renderInspector(); }
    const spec = FILES.usmap.colls[s.coll];
    const name = r.name ?? r.nickname ?? r.id;
    inspector.append(el('header', { class: 'ph' }, el('h2', {}, 'INSPECTOR'), el('span', { class: 'sub' }, spec.label)));
    inspector.append(el('div', { class: 'selhead' }, el('div', { class: 'glyph', html: svg(GLYPH[s.coll] ?? 'map') }), el('div', {}, el('b', {}, name), el('small', {}, `${s.coll} / ${r.id}`))));
    const kv = el('dl', { class: 'kv' });
    for (const [k, v] of Object.entries(r)) {
      const known = KNOWN[s.coll]?.includes(k) ?? true;
      let txt;
      if (k === 'pts') { let L = 0; for (let i = 1; i < v.length; i++) { const a = rowToWorld(doc(), s.coll, r.id, v[i - 1]), b = rowToWorld(doc(), s.coll, r.id, v[i]); L += Math.hypot(b[0] - a[0], b[1] - a[1]); } txt = `${v.length} vertices · ${(L / 1000).toFixed(1)} km in the world`; }
      else if (k === 'pos' || k === 'dest') { const w = rowToWorld(doc(), s.coll, r.id, v); txt = `[${v.join(', ')}] · world ${Math.round(w[0])}, ${Math.round(w[1])}`; }
      else txt = typeof v === 'object' ? JSON.stringify(v) : String(v);
      kv.append(el('dt', { title: k }, k), el('dd', { class: known ? '' : 'unknown', title: known ? '' : 'a field the forge does not know: kept exactly as it is on every write' }, txt));
    }
    if (s.v !== undefined && r.pts?.[s.v]) { const w = rowToWorld(doc(), s.coll, r.id, r.pts[s.v]); kv.append(el('dt', {}, `vertex ${s.v}`), el('dd', {}, `[${r.pts[s.v].join(', ')}] · world ${Math.round(w[0])}, ${Math.round(w[1])}`)); }
    kv.append(el('dt', {}, 'read by'), el('dd', {}, spec.engine ?? '—'));
    const edits = doc()?.meta?.forge?.edits?.[`${s.coll}/${r.id}`];
    if (edits) kv.append(el('dt', {}, 'forge edit'), el('dd', {}, String(edits)));
    inspector.append(el('div', { class: 'scroll grow' }, kv));
    inspector.append(el('div', { class: 'actions' },
      el('button', { class: 'btn mini', html: `${svg('edit')}<span>EDIT FIELDS</span>`, onclick: editFields }),
      el('button', { class: 'btn mini', html: `${svg('fit')}<span>FOCUS</span>`, onclick: () => focusRow(s) }),
      el('button', { class: 'btn mini', title: 'Teleport the attached game\'s player there (teleport)', html: `${svg('pin')}<span>OPEN IN GAME</span>`, onclick: () => openInGame(s) }),
      el('button', { class: 'btn mini danger', html: `${svg('trash')}<span>DELETE</span>`, onclick: removeRow })));
  }
  function inspectAtlas(s) {
    const isSite = s.coll === 'site', r = (isSite ? ATLAS_SITES : ATLAS_BASES).find((x) => x.id === s.id), xz = ATLAS_XZ[isSite ? 'sites' : 'bases']?.[s.id];
    inspector.append(el('header', { class: 'ph' }, el('h2', {}, 'INSPECTOR'), el('span', { class: 'sub' }, isSite ? 'atlas site (read only here)' : 'military base (read only here)')));
    inspector.append(el('div', { class: 'selhead' }, el('div', { class: 'glyph', html: svg(isSite ? 'site' : 'holdout') }), el('div', {}, el('b', {}, r.name), el('small', {}, `${r.state} · ${r.kind}${r.dsoa ? ` · ${r.dsoa}` : ''}`))));
    const holder = r.holder === 'ruler' ? RULERS[r.state] ?? 'the ruler' : HOLDERS[r.holder]?.name ?? r.holder;
    const rows = isSite ? [['real', r.real], ['what', r.what], ['terrain', r.terrain], ['biome', r.biome], ['situation', r.situation], ['held by', holder], ['lat, lon', `${r.lat}, ${r.lon}`]]
      : [['real', r.name], ['what', r.what], ['area', `${r.area_km2} km²`], ['kind', r.kind], ['held by', holder], ['lat, lon', `${r.lat}, ${r.lon}`]];
    if (xz) rows.push(['world', `${xz[0]}, ${xz[1]}${xz[2] ? ` (moved ${xz[2]} cells by the state law)` : ''}`]);
    rows.push(['edited in', 'SITE (planned): data/atlas.js + tools/atlas-project.mjs']);
    inspector.append(el('div', { class: 'scroll grow' }, el('dl', { class: 'kv', html: rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('') })));
    inspector.append(el('div', { class: 'actions' }, el('button', { class: 'btn mini', html: `${svg('pin')}<span>OPEN IN GAME</span>`, onclick: () => xz && teleport(xz[0], xz[1]) })));
  }
  function focusRow(s) {
    if (s.coll === 'site' || s.coll === 'base') { const u = atlasPos(s.coll === 'site' ? 'sites' : 'bases', s.id); if (u) mv.flyTo(u[0], u[1], 0.12); return; }
    const r = rowOf(s.coll, s.id); if (!r) return;
    if (r.pts) { const b = rowBox(r); mv.fit(b[0], b[1], b[2], b[3], 80); } else mv.flyTo(r.pos[0], r.pos[1], s.coll === 'placements' ? 1.5 : 0.25);
  }
  async function teleport(x, z) {
    const r = await cmd('teleport', { x: Math.round(x), z: Math.round(z) });
    toast(r.ok ? `${r.location ?? ''} · ${Math.round(x)}, ${Math.round(z)}` : r.error, r.ok ? 'ok' : 'bad', r.ok ? 'TELEPORTED' : 'NO TELEPORT');
    pollGame(true);
  }
  function openInGame(s) {
    const r = rowOf(s.coll, s.id); if (!r) return;
    const p = r.pts ? r.pts[s.v ?? Math.floor(r.pts.length / 2)] : r.dest ?? r.pos, w = rowToWorld(doc(), s.coll, r.id, p);
    if (Math.hypot(w[0], w[1]) > STREAM.dustWall) return toast(`That is ${Math.round(Math.hypot(w[0], w[1]) / 1000)} km out: past the dust wall, the game does not stream it yet (P1 streams the I-10 corridor)`, 'warn');
    teleport(w[0], w[1]);
  }

  // ---- hover, readout, scale ---------------------------------------------------------------------------------------
  function readoutAt(p) {
    const d = doc(); const [wx, wz] = toWorld([p.ux, p.uy]);
    let where = '';
    if (d) { const i = Math.floor((p.ux - d.world_offset[0]) / d.cell_m), j = Math.floor((p.uy - d.world_offset[1]) / d.cell_m); if (i >= 0 && j >= 0 && i < d.w && j < d.h) where = ` · ${d.state_legend[d.states_grid[j][i]] ?? 'SEA'} · ${d.legend[d.grid[j][i]] ?? ''} · relief ${d.relief[j][i]}`; }
    readout.innerHTML = `usmap <b>${Math.round(p.ux)}, ${Math.round(p.uy)}</b> · world <b>${(wx / 1000).toFixed(2)}, ${(wz / 1000).toFixed(2)} km</b>${esc(where)}`;
  }
  function paintScale() {
    const mPerPx = mv.worldPerPx(), target = 120 * mPerPx, pow = Math.pow(10, Math.floor(Math.log10(target))), n = [1, 2, 5, 10].find((k) => k * pow >= target / 1.6) * pow;
    scale.innerHTML = `${n >= 1000 ? `${n / 1000} km` : `${n} m`} <small style="opacity:.6">world</small><i style="width:${n / mPerPx}px"></i>`;
  }
  function showHover(hit, p) {
    if (!hit || S.drag) { hover.classList.add('hidden'); return; }
    let h = '';
    if (hit.coll === 'site') { const r = ATLAS_SITES.find((x) => x.id === hit.id); h = `<b>${esc(r.name)}</b><small>${esc(r.real)} · ${esc(r.kind)}</small>`; }
    else if (hit.coll === 'base') { const r = ATLAS_BASES.find((x) => x.id === hit.id); h = `<b>${esc(r.name)}</b><small>${esc(r.state)} · ${esc(r.dsoa)} · ${r.area_km2} km²</small>`; }
    else { const r = rowOf(hit.coll, hit.id); if (!r) return; h = `<b>${esc(r.name ?? r.nickname ?? r.id)}</b><small>${esc(FILES.usmap.colls[hit.coll]?.label ?? hit.coll)} · ${esc(r.id)}${hit.handle ? ` · ${hit.handle.field === 'pts' ? `vertex ${hit.handle.i}` : hit.handle.field} (drag to move)` : ''}</small>`; }
    hover.innerHTML = h; hover.classList.remove('hidden');
    hover.style.left = `${Math.min(p.px + 16, mv.w - 260)}px`; hover.style.top = `${p.py + 14}px`;
  }
  function showMeasure() {
    const { a, b } = S.measure, wa = toWorld(a), wb = toWorld(b), d = Math.hypot(wb[0] - wa[0], wb[1] - wa[1]);
    toast(`${(d / 1000).toFixed(2)} km in the world · ${(d / STREAM.mile).toFixed(1)} game miles · ${(d / 30 / 60).toFixed(1)} min at 30 m/s (108 km/h)`, '', 'MEASURE');
  }

  // ---- drawing -----------------------------------------------------------------------------------------------------
  const brushHeat = { key: null, canvas: null };
  mv.layers.push({ id: 'rows', draw: (g) => {
    const d = doc(); if (!d) return;
    const s = mv.view.s, sel = S.sel;
    if (S.layers.has('brush') && brushField.strokes.length) drawBrushStrokes(g, mv);
    drawNetwork(g, mv, d, { rivers: S.layers.has('rivers'), roads: S.layers.has('roads'), streets: S.layers.has('streets'), rails: S.layers.has('rails'), interstates: S.layers.has('interstates'), hot: S.hoverHit?.coll === 'interstates' ? S.hoverHit.id : null });
    // The row being dragged, previewed where it is going.
    if (S.drag) {
      const h = S.drag.hit.handle, r = rowOf(S.drag.hit.coll, S.drag.hit.id);
      if (r?.pts && h.field === 'pts') { const pts = r.pts.map((q, i) => (i === h.i ? S.drag.to : q)); g.strokeStyle = 'rgba(255,214,120,0.95)'; g.lineWidth = 3; g.setLineDash([6, 4]); polyline(g, mv, pts); g.stroke(); g.setLineDash([]); }
      g.fillStyle = '#ffd678'; g.beginPath(); g.arc(mv.sx(S.drag.to[0]), mv.sy(S.drag.to[1]), 6, 0, Math.PI * 2); g.fill();
    }
    if (S.layers.has('interstates') && s < 0.35) drawShields(g, mv, d);
    const lab = new Labeler();
    // Town labels first: they claim the space, everything else fits round them.
    if (S.layers.has('towns')) { const sorted = [...d.towns].sort((a, b) => (a.kind === 'city' ? 0 : 1) - (b.kind === 'city' ? 0 : 1)); for (const t of sorted) { const x = mv.sx(t.pos[0]), y = mv.sy(t.pos[1]); if (x < -80 || y < -20 || x > mv.w + 20 || y > mv.hgt + 20) continue; lab.text(g, t.name, x, y, { font: t.kind === 'city' ? `800 ${s > 0.05 ? 15 : 13}px "Barlow Condensed", sans-serif` : '700 12px "Barlow Condensed", sans-serif', fill: t.kind === 'city' ? '#f5e7c0' : '#f0b08a', dx: 9 }); } }
    // Selection glow.
    if (sel?.coll && LINE.has(sel.coll)) { const r = rowOf(sel.coll, sel.id); if (r) { g.strokeStyle = 'rgba(255,214,120,0.55)'; g.lineWidth = 10; g.lineCap = 'round'; polyline(g, mv, r.pts); g.stroke(); } }
    // Towns.
    if (S.layers.has('towns')) for (const t of d.towns) {
      const x = mv.sx(t.pos[0]), y = mv.sy(t.pos[1]); if (x < -40 || y < -40 || x > mv.w + 40 || y > mv.hgt + 40) continue;
      const on = sel?.coll === 'towns' && sel.id === t.id;
      if (t.kind === 'holdout') { hexMark(g, x, y, on ? 8 : 6.5, '#d9643a'); }
      else { g.fillStyle = on ? '#ffd678' : '#e3a72f'; g.strokeStyle = '#1a120a'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, on ? 7 : 5.5, 0, Math.PI * 2); g.fill(); g.stroke(); }
    }
    // Exits.
    if (S.layers.has('exits') && s > 0.03) for (const e of d.exits) {
      const x = mv.sx(e.pos[0]), y = mv.sy(e.pos[1]); if (x < -20 || y < -20 || x > mv.w + 20 || y > mv.hgt + 20) continue;
      const on = sel?.coll === 'exits' && sel.id === e.id;
      if (e.dest && s > 0.08) { g.strokeStyle = 'rgba(239,230,204,0.45)'; g.setLineDash([3, 3]); g.lineWidth = 1; g.beginPath(); g.moveTo(x, y); g.lineTo(mv.sx(e.dest[0]), mv.sy(e.dest[1])); g.stroke(); g.setLineDash([]); g.fillStyle = 'rgba(239,230,204,0.7)'; g.fillRect(mv.sx(e.dest[0]) - 2.5, mv.sy(e.dest[1]) - 2.5, 5, 5); }
      g.save(); g.translate(x, y); g.rotate(Math.PI / 4); g.fillStyle = on ? '#ffd678' : e.archetype === 'dead' ? '#8c8478' : '#2d5a3e'; g.strokeStyle = '#efe6cc'; g.lineWidth = 1.4; g.fillRect(-4, -4, 8, 8); g.strokeRect(-4, -4, 8, 8); g.restore();
      if (s > 0.12) lab.text(g, `${e.exit_number} ${e.name}`, x, y, { font: '600 11px "Barlow Condensed", sans-serif', fill: '#e9dfc4' });
    }
    // Building slots.
    if (S.layers.has('placements') && s > 0.5) for (const p of d.placements) {
      const x = mv.sx(p.pos[0]), y = mv.sy(p.pos[1]); if (x < -10 || y < -10 || x > mv.w + 10 || y > mv.hgt + 10) continue;
      const st = d.structures.find((q) => q.id === p.building), fw = (st?.footprint_m?.[0] ?? 10) * s, fd = (st?.footprint_m?.[1] ?? 10) * s;
      g.save(); g.translate(x, y); g.rotate(p.rot ?? 0); g.fillStyle = sel?.id === p.id ? 'rgba(255,214,120,0.9)' : 'rgba(185,173,146,0.75)'; g.strokeStyle = 'rgba(20,14,8,0.8)'; g.lineWidth = 1; g.fillRect(-fw / 2, -fd / 2, fw, fd); g.strokeRect(-fw / 2, -fd / 2, fw, fd); g.restore();
    }
    // Atlas sites and bases.
    if (S.layers.has('bases')) for (const b of ATLAS_BASES) { const u = atlasPos('bases', b.id); if (!u) continue; const x = mv.sx(u[0]), y = mv.sy(u[1]); if (x < -20 || y < -20 || x > mv.w + 20 || y > mv.hgt + 20) continue; if (s < 0.022 && sel?.id !== b.id) { g.fillStyle = BASE_COL[b.dsoa] ?? '#d6c9a8'; g.fillRect(x - 2.5, y - 2.5, 5, 5); continue; } baseMark(g, x, y, BASE_COL[b.dsoa] ?? '#d6c9a8', sel?.id === b.id); if (s > 0.05) lab.text(g, b.name.toUpperCase(), x, y, { font: '600 10.5px "Barlow Condensed", sans-serif', fill: '#cfe0b0', dx: 10 }); }
    if (S.layers.has('sites')) for (const r of ATLAS_SITES) { const u = atlasPos('sites', r.id); if (!u) continue; const x = mv.sx(u[0]), y = mv.sy(u[1]); if (x < -20 || y < -20 || x > mv.w + 20 || y > mv.hgt + 20) continue; if (s < 0.022 && sel?.id !== r.id) { g.fillStyle = KIND_COL[r.kind] ?? '#7fd1c4'; g.beginPath(); g.arc(x, y, 2.2, 0, 7); g.fill(); continue; } siteMark(g, x, y, KIND_COL[r.kind] ?? '#7fd1c4', sel?.id === r.id); if (s > 0.035) lab.text(g, r.name, x, y, { font: '600 10.5px "Barlow Condensed", sans-serif', fill: '#bfe6df', dx: 9 }); }
    // Rivers' names at mid zoom.
    if (S.layers.has('rivers') && s > 0.01 && s < 0.2) for (const r of d.rivers) { const m = r.pts[Math.floor(r.pts.length / 2)]; lab.text(g, r.id, mv.sx(m[0]), mv.sy(m[1]), { font: 'italic 600 11px "Barlow Condensed", sans-serif', fill: '#a6d4e6', dx: 6 }); }
    // Handles of the selection.
    for (const h of handles()) { const x = mv.sx(h.p[0]), y = mv.sy(h.p[1]); g.fillStyle = h.i === sel?.v && h.field === 'pts' ? '#ffd678' : h.field === 'dest' ? '#efe6cc' : '#1a120a'; g.strokeStyle = '#ffd678'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, h.field === 'pts' ? 4.5 : 6, 0, Math.PI * 2); g.fill(); g.stroke(); }
    // Checks.
    if (S.layers.has('checks') && S.check) {
      const ring = (pt, col, r = 9) => { const x = mv.sx(pt[0]), y = mv.sy(pt[1]); if (x < -20 || y < -20 || x > mv.w + 20 || y > mv.hgt + 20) return; g.strokeStyle = col; g.lineWidth = 2.2; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke(); };
      for (const f of S.check.deadEnds) ring(f.pt, '#d9643a', 10);
      for (const f of S.check.orphans) if (f.coll !== 'placements' || s > 0.3) ring(f.pt, '#e3c34a', 7);
      for (const f of S.check.crossings) if (!f.bridged) { const x = mv.sx(f.pt[0]), y = mv.sy(f.pt[1]); if (x < -20 || y < -20 || x > mv.w + 20 || y > mv.hgt + 20) continue; g.fillStyle = '#68aac4'; g.strokeStyle = '#0c1a20'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x, y - 7); g.lineTo(x + 6, y + 5); g.lineTo(x - 6, y + 5); g.closePath(); g.fill(); g.stroke(); }
    }
    // A line being drawn, a measure.
    if (S.draft) { const pts = mv.mouse ? [...S.draft.pts, [mv.mouse.ux, mv.mouse.uy]] : S.draft.pts; g.strokeStyle = S.draft.kind === 'rail' ? '#efe6cc' : '#d6c496'; g.lineWidth = 3; g.setLineDash([8, 5]); polyline(g, mv, pts); g.stroke(); g.setLineDash([]); for (const p of S.draft.pts) { g.fillStyle = '#ffd678'; g.beginPath(); g.arc(mv.sx(p[0]), mv.sy(p[1]), 4, 0, 7); g.fill(); } }
    if (S.measure) { const b = S.measure.b ?? (mv.mouse ? [mv.mouse.ux, mv.mouse.uy] : S.measure.a); g.strokeStyle = '#ffd678'; g.lineWidth = 2; g.setLineDash([4, 4]); polyline(g, mv, [S.measure.a, b]); g.stroke(); g.setLineDash([]); const wa = toWorld(S.measure.a), wb = toWorld(b); new Labeler().text(g, `${(Math.hypot(wb[0] - wa[0], wb[1] - wa[1]) / 1000).toFixed(2)} km`, mv.sx(b[0]), mv.sy(b[1]), { fill: '#ffd678', dx: 10 }); }
    if (S.layers.has('game')) drawGameFrame(g, mv, d, S.game);
  } });
  function drawBrushStrokes(g, mv2) {
    const col = { forest: 'rgba(62,110,46,0.5)', canopy: 'rgba(40,90,70,0.4)', brush: 'rgba(120,128,60,0.4)', ruin: 'rgba(160,90,60,0.45)', rad: 'rgba(200,230,60,0.45)' };
    for (const s of brushField.data.strokes ?? []) { g.strokeStyle = col[s.layer] ?? 'rgba(200,200,200,0.4)'; g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = Math.max(2, s.r * 2 * mv2.view.s); if (s.pts.length === 1) { g.fillStyle = g.strokeStyle; g.beginPath(); g.arc(mv2.sx(s.pts[0][0]), mv2.sy(s.pts[0][1]), Math.max(2, s.r * mv2.view.s), 0, 7); g.fill(); } else { polyline(g, mv2, s.pts); g.stroke(); } }
  }
  function hexMark(g, x, y, r, col) { g.beginPath(); for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + (k * Math.PI) / 3; g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } g.closePath(); g.fillStyle = col; g.fill(); g.strokeStyle = '#1a120a'; g.lineWidth = 2; g.stroke(); }
  function siteMark(g, x, y, col, on) { g.save(); g.translate(x, y); g.rotate(Math.PI / 4); g.fillStyle = on ? '#ffd678' : col; g.strokeStyle = '#0d1414'; g.lineWidth = 1.5; g.fillRect(-3.6, -3.6, 7.2, 7.2); g.strokeRect(-3.6, -3.6, 7.2, 7.2); g.restore(); }
  function baseMark(g, x, y, col, on) { g.fillStyle = '#10140a'; g.fillRect(x - 6, y - 6, 12, 12); g.strokeStyle = on ? '#ffd678' : col; g.lineWidth = 1.6; g.strokeRect(x - 6, y - 6, 12, 12); g.fillStyle = on ? '#ffd678' : col; g.beginPath(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + (k * Math.PI) / 5, r = k % 2 ? 2 : 4.6; g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } g.closePath(); g.fill(); }

  // ---- the game on the map ------------------------------------------------------------------------------------------
  let lastGame = 0;
  async function pollGame(force) {
    if (!F.game.alive || F.game.busy || (!force && (F.tab !== 'map' || !S.layers.has('game') || Date.now() - lastGame < 2500))) return; // never queue reads behind a long command
    lastGame = Date.now();
    const r = await cmd('state', {}, { timeoutMs: 3000 });
    if (r.ok && r.player) { S.game = { player: { x: r.player.x, z: r.player.z }, label: `YOU · ${r.location ?? r.player.location ?? ''}`.trim() }; mv.redraw(); }
  }
  setInterval(() => pollGame(false), 1000);
  function flyToGame() { if (!S.game) return toast('No game position yet (attach a game tab)', 'warn'); const u = toUsmap(S.game.player.x, S.game.player.z); mv.flyTo(u[0], u[1], 0.6); }
  mv.autoFit = () => fitUSA(true);
  function fitUSA() { const d = doc(); mv.moved = false; if (d) mv.fit(d.world_offset[0], d.world_offset[1], d.world_offset[0] + d.w * d.cell_m, d.world_offset[1] + d.h * d.cell_m, 20, true); }

  // ---- the palette ---------------------------------------------------------------------------------------------------
  addPalette((q) => {
    const d = doc(); if (!d || q.length < 2) return [];
    const go = (coll, id, u, s2) => () => { F.show('map'); S.sel = { coll, id }; renderInspector(); mv.flyTo(u[0], u[1], s2); };
    return [
      ...d.towns.map((t) => ({ label: t.name, hint: `${t.kind} · ${t.id}`, tag: 'TOWN', run: go('towns', t.id, t.pos, 0.2) })),
      ...d.exits.map((e) => ({ label: `${e.highway_id} EXIT ${e.exit_number} ${e.name}`, hint: e.id, tag: 'EXIT', run: go('exits', e.id, e.pos, 0.3) })),
      ...ATLAS_SITES.map((r) => ({ label: r.name, hint: r.real, tag: 'SITE', run: () => { const u = atlasPos('sites', r.id); if (u) go('site', r.id, u, 0.12)(); } })),
      ...ATLAS_BASES.map((r) => ({ label: r.name, hint: `${r.state} base`, tag: 'BASE', run: () => { const u = atlasPos('bases', r.id); if (u) go('base', r.id, u, 0.12)(); } })),
      ...d.interstates.map((r) => ({ label: `${r.id} ${r.nickname ?? ''}`, hint: 'interstate', tag: 'ROAD', run: () => { F.show('map'); S.sel = { coll: 'interstates', id: r.id }; renderInspector(); focusRow(S.sel); } })),
    ];
  });
  addPalette(() => [
    { label: 'MAP: validate the map', hint: 'dead ends, orphans, crossings, the engine', tag: 'MAP', run: () => { F.show('map'); runChecks(); } },
    { label: 'MAP: the whole country', hint: '0', tag: 'MAP', run: () => { F.show('map'); fitUSA(); } },
    { label: 'MAP: fly to the player', hint: 'G', tag: 'MAP', run: () => { F.show('map'); flyToGame(); } },
    ...TOOLS.filter(Boolean).map(([id, , key, tip]) => ({ label: `MAP tool: ${tip.split(':')[0]}`, hint: key, tag: 'TOOL', run: () => { F.show('map'); setTool(id); } })),
  ]);

  // ---- keys --------------------------------------------------------------------------------------------------------
  const keymap = Object.fromEntries(TOOLS.filter(Boolean).map(([id, , k]) => [k.toLowerCase(), id]));
  function onKey(e) {
    if (e.target.closest('input, textarea, select, dialog')) return false;
    const k = e.key.toLowerCase();
    if (keymap[k] && !e.ctrlKey && !e.metaKey) { setTool(keymap[k]); return true; }
    if (k === 'escape') { if (S.draft || S.measure) { S.draft = null; S.measure = null; mv.redraw(); } else select(null); return true; }
    if (k === 'enter' && S.draft) { finishDraft(); return true; }
    if (k === '0') { fitUSA(); return true; }
    if (k === 'g') { flyToGame(); return true; }
    if (k === 'f' && S.sel) { focusRow(S.sel); return true; }
    if ((k === 'delete' || k === 'backspace') && S.sel) {
      if (S.sel.v !== undefined && rowOf(S.sel.coll, S.sel.id)?.pts) write([{ op: 'delete', coll: S.sel.coll, id: S.sel.id, i: S.sel.v }], `delete vertex ${S.sel.v} of ${S.sel.id}`, S.sel);
      else removeRow();
      return true;
    }
    return false;
  }

  on('doc', ({ file }) => { if (file === 'usmap') { const d = doc(); if (!mv.doc || mv.doc.grid !== d.grid) mv.setGrid(d); mv.redraw(); renderInspector(); } if (file === 'brush') mv.redraw(); });
  on('written', ({ file }) => { if (file === 'usmap') runChecks(); });

  const api = {
    id: 'map', label: 'Map', icon: 'map', pane, undoFile: 'usmap', onKey,
    async init() {
      await loadDoc('usmap');
      mv.setGrid(doc()); mv.showStates = true;
      setTool('select'); renderInspector(); runChecks(); paintScale();
      requestAnimationFrame(() => { if (!mv.moved) fitUSA(); });
      getLand().then((L) => { mv.land = L; mv.redraw(); }).catch((e) => console.warn('land', e));
    },
    onShow() { mv.resize(); mv.redraw(); pollGame(true); },
    stats() { const d = doc(); return { interstates: d?.interstates?.length ?? 0, towns: d?.towns?.length ?? 0, exits: d?.exits?.length ?? 0, drawn: (d?.interstates?.length ?? 0) + (d?.roads?.length ?? 0) + (d?.streets?.length ?? 0) + (d?.towns?.length ?? 0) + (d?.exits?.length ?? 0) + ATLAS_SITES.length + ATLAS_BASES.length, view: { ...mv.view }, check: S.check?.counts ?? null }; },
    S, mv, select: (coll, id) => { S.sel = { coll, id }; renderInspector(); mv.redraw(); }, focus: (coll, id) => focusRow({ coll, id }), fitUSA, runChecks, setTool,
  };
  return api;
}
