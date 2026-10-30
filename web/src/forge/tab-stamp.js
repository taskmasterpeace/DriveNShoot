// STAMP (docs/design/WEB_WORLD_TOOLS.md §3.2): lay a state out with tools, never hand placement. Six stamps, each a ROW in
// src/data/stamps.json written through the row law (src/forge/rows.js: field-preserving, checked, per-tab undo):
//   REGION   drag a box: biome look, climate, danger, faction lean; its interstates come from the usmap and meet a
//            neighbour region's on the shared edge (the seam law)
//   CITY     click a usmap town (or a spot): size class -> the neighbourhoods it tiles (citygen inputs)
//   HOOD     click inside a city: downtown, residential, industrial, trailer park, GATED COMMUNITY (walls, gate, guards)
//   EXIT     click beside a region's interstate: the mile is where you clicked; fuel, motel, truck stop, diner, nothing
//   OUTSIDE  click a spot (one farm, church, prison...) or write a region's DENSITY row (per km of road, by class)
//   BASE     the state's military base row (data/milbases.js), moved onto drivable ground with a click
// Every stamp PREVIEWS before it is written: the fold runs in this page with the engine's own code (world/stamps.js ->
// WorldIndex, citygen's planWorld) and draws dashed; COMMIT writes it, Ctrl Z takes it back.
import { F, el, esc, svg, patch, toast, modal, cmd, on, addPalette, loadDoc, confirmBox } from './core.js';
import { MapView, drawNetwork, Labeler, polyline, toWorld, toUsmap } from './mapview.js';
import { STAMPS, resetFold } from '../world/stamps.js';
import { LOOKS, CLIMATES, CITY_SIZES, HOOD_KINDS, EXIT_OFFERS, OUTSIDE_KINDS, OUTSIDE_DENSITY, LEAN_FACTIONS, STAMP_COLLS, validateStamps, GAME_MILE } from '../data/worldtools.js';
import { MILBASES } from '../data/milbases.js';
import { REGIONS } from '../data/regions.js';
import { BIOMES as CG_BIOMES } from '../data/citygen.js';

const TOOLS = [
  ['region', 'REGION', 'R', 'layers', 'drag a box: a region (biome look, climate, danger, faction lean)'],
  ['city', 'CITY', 'T', 'city', 'click a town: a city stamp (size class -> its neighbourhoods)'],
  ['hood', 'HOOD', 'H', 'town', 'click inside a city: a neighbourhood (downtown, residential, industrial, trailer park, gated)'],
  ['exit', 'EXIT', 'E', 'pin', 'click beside a region\'s interstate: an exit at that mile and what stands at it'],
  ['outside', 'OUTSIDE', 'O', 'site', 'click a spot: a farm, ranch, compound, church, school, prison, quarry or junkyard'],
  ['base', 'BASE', 'B', 'check', 'click: the state\'s military base, moved here'],
];
const COL = { region: '#e3a72f', city: '#f0c060', hood: { downtown: '#d9643a', residential: '#c9b98a', industrial: '#8c8478', trailer_park: '#b9a27a', gated: '#9cc46a' }, exit: '#7fd1c4', outside: '#c9a27a', base: '#9fb6c2' };
const COLL = { region: 'regions', city: 'cities', hood: 'hoods', exit: 'exits', outside: 'outside', base: 'bases' };

export function stampTab() {
  const S = { tool: 'region', drag: null, pending: null, sel: null, W: null, plan: null, busy: false, errors: [] };
  const pane = el('section', { class: 'pane pane-brush pane-stamp', id: 'pane-stamp' });
  const rail = el('nav', { class: 'rail plate' });
  for (const [id, label, k, icon, tip] of TOOLS) rail.append(el('button', { class: `tool${id === S.tool ? ' on' : ''}`, 'data-tool': id, title: `${label} (${k}): ${tip}`, html: `${svg(icon)}<span class="k">${k}</span>`, onclick: () => setTool(id) }));
  const wrap = el('div', { class: 'mapwrap' });
  const readout = el('div', { class: 'readout' }, '—'), hint = el('div', { class: 'toolhint' });
  const zoomer = el('div', { class: 'zoomer' },
    el('button', { class: 'btn icon', title: 'Zoom in', onclick: () => mv.zoomAt(mv.w / 2, mv.hgt / 2, mv.view.s * 1.6) }, '+'),
    el('button', { class: 'btn icon', title: 'Zoom out', onclick: () => mv.zoomAt(mv.w / 2, mv.hgt / 2, mv.view.s / 1.6) }, '−'),
    el('button', { class: 'btn icon', title: 'Florida and Georgia', html: svg('fit'), onclick: () => mv.fit(-9000, 4000, 2000, 22500, 30) }));
  wrap.append(zoomer, readout, hint);
  const stampPlate = el('section', { class: 'plate' }), listPlate = el('section', { class: 'plate grow' }), checkPlate = el('section', { class: 'plate' });
  pane.append(rail, wrap, el('aside', { class: 'side' }, stampPlate, checkPlate, listPlate));
  const mv = new MapView(wrap, { cx: -4500, cy: 11000, s: 0.05 });
  const doc = () => F.docs.stamps?.doc;

  function setTool(id) { S.tool = id; rail.querySelectorAll('.tool').forEach((b) => b.classList.toggle('on', b.dataset.tool === id)); const T = TOOLS.find((t) => t[0] === id); hint.innerHTML = `<b>${T[1]}</b> · ${T[4]} · shift-drag pans`; mv.canvas.style.cursor = 'crosshair'; }

  // ---- the fold, in this page (the engine's own code over the rows on disk + the pending one) -------------------------
  async function fold(d = doc(), quiet = false) {
    if (!d) return;
    S.busy = true; if (!quiet) renderCheck('folding…');
    try {
      for (const c of STAMP_COLLS) { STAMPS[c].length = 0; STAMPS[c].push(...(d[c] ?? [])); }
      resetFold();
      const [{ WorldIndex }, { planWorld }, { ARCHETYPES, RURAL }, { MILBASES_BY_ID }] = await Promise.all([import('../world/worldindex.js'), import('../systems/citygen.js'), import('../data/citygen.js'), import('../data/milbases.js')]);
      S.W = new WorldIndex();
      S.plan = planWorld(S.W);
      const v = validateStamps(d, { usmap: F.docs.usmap.doc, regions: REGIONS, milbases: MILBASES_BY_ID, archetypes: ARCHETYPES, rural: RURAL });
      S.errors = v.errors; S.counts = v.counts;
    } catch (e) { S.errors = [{ coll: '*', id: '*', msg: `fold failed: ${e.message ?? e}` }]; console.error(e); }
    S.busy = false; renderCheck(); mv.redraw();
  }
  // The doc as it would be with the pending row (preview), or as on disk.
  const withPending = () => { const d = JSON.parse(JSON.stringify(doc())); const p = S.pending; if (p) { const L = d[COLL[p.kind]]; const i = L.findIndex((r) => r.id === p.row.id); if (i >= 0) L[i] = p.row; else L.push(p.row); } return d; };

  // ---- the pointer ---------------------------------------------------------------------------------------------------
  mv.h.down = (e, p) => { if (e.button !== 0 || S.tool !== 'region') return false; S.drag = { a: [p.ux, p.uy], b: [p.ux, p.uy] }; mv.redraw(); return true; };
  mv.h.move = (e, p) => { mv.mouse = p; if (S.drag) { S.drag.b = [p.ux, p.uy]; mv.redraw(); } };
  mv.h.up = async (e, p) => {
    if (S.tool !== 'region' || !S.drag) return;
    const d0 = S.drag; S.drag = null;
    const r500 = (v) => Math.round(v / 100) * 100; // boxes snap to 100 usmap m (so two regions can share an edge exactly)
    const box = { x0: r500(Math.min(d0.a[0], d0.b[0])), x1: r500(Math.max(d0.a[0], d0.b[0])), y0: r500(Math.min(d0.a[1], d0.b[1])), y1: r500(Math.max(d0.a[1], d0.b[1])) };
    if (box.x1 - box.x0 < 1000 || box.y1 - box.y0 < 1000) { mv.redraw(); return; }
    // snap an edge onto a neighbour's within 400 usmap m (the seam law wants them exact)
    for (const R of [...Object.values(REGIONS), ...(doc().regions ?? [])].filter((q) => q.box)) for (const [k, o] of [['x0', 'x1'], ['x1', 'x0'], ['y0', 'y1'], ['y1', 'y0']]) if (Math.abs(box[k] - R.box[o]) < 400) box[k] = R.box[o];
    await stampRegion({ box });
  };
  mv.h.click = async (e, p) => {
    if (S.tool === 'region') return;
    const [x, z] = toWorld([p.ux, p.uy]);
    if (S.tool === 'city') return stampCity(p);
    if (S.tool === 'hood') return stampHood(x, z);
    if (S.tool === 'exit') return stampExit(x, z);
    if (S.tool === 'outside') return stampOutside(p);
    if (S.tool === 'base') return stampBase(p);
  };
  mv.h.hover = (e, p) => { mv.mouse = p; const [x, z] = toWorld([p.ux, p.uy]); const R = S.W?.regionOf(x, z); readout.innerHTML = `usmap <b>${Math.round(p.ux)}, ${Math.round(p.uy)}</b> · world <b>${Math.round(x)}, ${Math.round(z)}</b>${R ? ` · <b>${R.name}</b>` : ''}${S.W?.stateAt(x, z) ? ` · ${S.W.stateAt(x, z)}` : ''}`; mv.redraw(); };
  mv.h.leave = () => { mv.mouse = null; readout.textContent = '—'; mv.redraw(); };

  // ---- the stamps: a modal, a preview, a commit ---------------------------------------------------------------------
  const regionsAll = () => [...Object.entries(REGIONS).filter(([, r]) => r.box).map(([id, r]) => ({ id, name: r.name })), ...(doc().regions ?? []).map((r) => ({ id: r.id, name: r.name }))];
  const uid = (coll, base) => { let n = 1, id = base; while ((doc()[coll] ?? []).some((r) => r.id === id)) id = `${base}-${++n}`; return id; };
  async function ask(kind, title, fields, build, help) {
    const v = await modal({ title, ok: 'PREVIEW', wide: true, body: help ? `<p class="help">${help}</p>` : null, fields, validate: (x) => { try { build(x); return null; } catch (e) { return e.message; } } });
    if (!v) return;
    S.pending = { kind, row: build(v) };
    await fold(withPending());
    renderStamp();
  }
  async function commit() {
    const p = S.pending; if (!p) return;
    const coll = COLL[p.kind], exists = (doc()[coll] ?? []).some((r) => r.id === p.row.id);
    const mine = S.errors.filter((e) => e.coll === coll && e.id === p.row.id);
    if (mine.length && !(await confirmBox('THE STAMP HAS FINDINGS', `${mine.map((e) => e.msg).join('; ')}. Write it anyway?`, 'WRITE', 'CANCEL'))) return;
    const r = await patch('stamps', [exists ? { op: 'set', coll, id: p.row.id, set: p.row } : { op: 'add', coll, row: p.row }], { label: `stamp ${p.kind} ${p.row.id}`, tab: 'stamp' });
    if (r.ok) { S.sel = { kind: p.kind, id: p.row.id }; S.pending = null; }
  }
  function discard() { S.pending = null; fold(doc(), true); renderStamp(); }
  const num = (v, what, lo = -Infinity, hi = Infinity) => { const n = Number(v); if (!Number.isFinite(n) || n < lo || n > hi) throw new Error(`${what}: a number ${lo}..${hi}`); return n; };
  const lean = (s) => Object.fromEntries(String(s ?? '').split(',').map((q) => q.trim()).filter(Boolean).map((q) => { const [k, w] = q.split(':'); if (!LEAN_FACTIONS.includes(k)) throw new Error(`lean: ${k}? (${LEAN_FACTIONS.join(', ')})`); return [k, Number(w ?? 1)]; }));

  async function stampRegion({ box, row = null }) {
    const [cx, cy] = [(box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2], [wx, wz] = toWorld([cx, cy]);
    const state = row?.state ?? S.W?.stateAt(wx, wz) ?? '';
    await ask('region', 'REGION STAMP', [
      { key: 'id', label: 'Id', value: row?.id ?? uid('regions', state.toLowerCase().replace(/[^a-z]+/g, '_') || 'region') },
      { key: 'name', label: 'Name (the HUD and the map)', value: row?.name ?? state },
      { key: 'state', label: 'State (usmap state legend)', value: state },
      { key: 'box', label: 'Box x0,x1,y0,y1 (usmap m)', value: `${box.x0},${box.x1},${box.y0},${box.y1}` },
      { key: 'look', label: 'Look', type: 'select', options: Object.entries(LOOKS).map(([k, L]) => [k, L.name]), value: row?.look ?? 'southeast_pine' },
      { key: 'climate', label: 'Climate', type: 'select', options: Object.entries(CLIMATES).map(([k, c]) => [k, c.name]), value: row?.climate ?? 'humid_subtropical' },
      { key: 'danger', label: 'Danger 0-5', type: 'number', value: row?.danger ?? 2 },
      { key: 'lean', label: 'Faction lean (id:weight, ...)', value: Object.entries(row?.lean ?? { free_counties: 2, raider: 1 }).map(([k, w]) => `${k}:${w}`).join(', '), help: LEAN_FACTIONS.join(' · ') },
    ], (v) => { const b = v.box.split(',').map(Number); if (b.length !== 4 || !b.every(Number.isFinite)) throw new Error('box: four numbers'); return { id: v.id.trim(), name: v.name.trim().toUpperCase(), state: v.state.trim().toUpperCase(), box: { x0: b[0], x1: b[1], y0: b[2], y1: b[3] }, look: v.look, climate: v.climate, danger: num(v.danger, 'danger', 0, 5), lean: lean(v.lean) }; },
    'A region is a box of the one plane the streamer lays out. Its interstates come from the usmap; where it shares an edge with a region (Florida), the road runs on through on that region\'s line: no wall, no fog.');
  }
  async function stampCity(p, row = null) {
    const t = F.docs.usmap.doc.towns.map((q) => ({ q, d: Math.hypot(q.pos[0] - p.ux, q.pos[1] - p.uy) })).sort((a, b) => a.d - b.d)[0];
    const snap = t && t.d * mv.view.s < 18 ? t.q : null;
    const [x, z] = toWorld([p.ux, p.uy]), R = S.W?.regionOf(x, z);
    await ask('city', 'CITY STAMP', [
      { key: 'id', label: 'Id', value: row?.id ?? uid('cities', snap?.id ?? 'city') },
      { key: 'name', label: 'Name', value: row?.name ?? snap?.name ?? 'NEW CITY' },
      { key: 'region', label: 'Region', type: 'select', options: regionsAll().map((r) => [r.id, r.name]), value: row?.region ?? R?.id ?? '' },
      { key: 'town', label: 'usmap town (blank: the clicked spot)', value: row?.town ?? snap?.id ?? '' },
      { key: 'size', label: 'Size class', type: 'select', options: Object.entries(CITY_SIZES).map(([k, s]) => [k, `${s.name} (${s.across} m, ${s.ring.length} hoods unless you stamp them)`]), value: row?.size ?? (snap?.kind === 'city' ? 'city' : 'town') },
      { key: 'biome', label: 'Citygen biome (blank: the region look picks by the ground under each hood)', type: 'select', options: [['', '(the look decides)'], ...Object.keys(CG_BIOMES).map((b) => [b, b.replace(/_/g, ' ')])], value: row?.biome ?? '' },
    ], (v) => ({ id: v.id.trim(), name: v.name.trim().toUpperCase(), region: v.region, ...(v.town.trim() ? { town: v.town.trim() } : { pos: [Math.round(p.ux), Math.round(p.uy)] }), size: v.size, ...(v.biome ? { biome: v.biome } : {}) }),
    'A city is a cluster of neighbourhoods, each laid by citygen. Stamp none and the size class tiles its own ring; stamp hoods (H) and only those stand.');
  }
  const cityCentre = (c) => { const t = c.town ? F.docs.usmap.doc.towns.find((q) => q.id === c.town) : null; const p = c.pos ?? t?.pos; return p ? toWorld(p) : null; };
  async function stampHood(x, z, row = null) {
    const cs = (doc().cities ?? []).map((c) => ({ c, w: cityCentre(c) })).filter((q) => q.w).map((q) => ({ ...q, d: Math.hypot(q.w[0] - x, q.w[1] - z) })).sort((a, b) => a.d - b.d);
    const C = row ? cs.find((q) => q.c.id === row.city) : cs[0];
    if (!C || C.d > (CITY_SIZES[C.c.size]?.across ?? 1500) * 1.1) { toast('Stamp a city first (T), then click inside it', 'warn'); return; }
    await ask('hood', 'NEIGHBOURHOOD STAMP', [
      { key: 'id', label: 'Id', value: row?.id ?? uid('hoods', `${C.c.id}-hood`) },
      { key: 'city', label: 'City', value: C.c.id },
      { key: 'kind', label: 'Kind', type: 'select', options: Object.entries(HOOD_KINDS).map(([k, h]) => [k, `${h.name}${h.walls ? ' (walled, gate guards)' : ''}`]), value: row?.kind ?? 'residential' },
      { key: 'at', label: 'Offset from the city centre dx,dz (world m)', value: row ? row.at.join(',') : `${Math.round(x - C.w[0])},${Math.round(z - C.w[1])}` },
      { key: 'size', label: 'Side (m, blank: the kind\'s range)', value: row?.size ?? '' },
    ], (v) => { const a = v.at.split(',').map(Number); if (a.length !== 2 || !a.every(Number.isFinite)) throw new Error('at: dx,dz'); return { id: v.id.trim(), city: v.city, kind: v.kind, at: a.map(Math.round), ...(v.size ? { size: num(v.size, 'size', 120, 700) } : {}) }; });
  }
  async function stampExit(x, z, row = null) {
    let best = null;
    for (const R of Object.values(S.W?.regions ?? {})) for (const cor of R.corridors) { const q = cor.project(x, z, 3000); if (q.d < (best?.d ?? 3000)) best = { R, cor, q }; }
    if (!best && !row) { toast('Click beside a region\'s interstate', 'warn'); return; }
    const mile = row?.mile ?? Math.max(1, Math.round(best.q.s / GAME_MILE));
    const side = row?.side ?? (Math.abs(best.q.x - x) > Math.abs(best.q.z - z) ? (x > best.q.x ? 'E' : 'W') : (z > best.q.z ? 'S' : 'N'));
    await ask('exit', 'EXIT STAMP', [
      { key: 'id', label: 'Id', value: row?.id ?? uid('exits', `${best.R.id}-${best.cor.id}-${mile}`.toLowerCase()) },
      { key: 'region', label: 'Region', value: row?.region ?? best.R.id },
      { key: 'road', label: 'Road', value: row?.road ?? best.cor.id },
      { key: 'mile', label: 'Mile (the exit number: miles from the region\'s south end)', type: 'number', value: mile },
      { key: 'town', label: 'Serves a usmap town (blank: none; its number is where the town projects)', value: row?.town ?? '' },
      { key: 'name', label: 'Name (as the sign reads)', value: row?.name ?? `EXIT ${mile}` },
      { key: 'offers', label: 'What stands at it', type: 'select', options: Object.entries(EXIT_OFFERS).map(([k, o]) => [k, `${k.replace('_', ' ')}${o.structures?.length ? `: ${o.structures.join(', ')}` : ''}`]), value: row?.offers ?? 'fuel' },
      { key: 'side', label: 'Side E|W|N|S', value: side },
      { key: 'm', label: 'Off the road (world m)', type: 'number', value: row?.m ?? 560 },
      { key: 'risk', label: 'Risk 1-5', type: 'number', value: row?.risk ?? 2 },
    ], (v) => ({ id: v.id.trim(), region: v.region, road: v.road, ...(v.town.trim() ? { town: v.town.trim() } : { mile: num(v.mile, 'mile', 1, 500) }), name: v.name.trim().toUpperCase(), offers: v.offers, side: v.side.trim().toUpperCase(), m: num(v.m, 'm', 120, 3000), risk: num(v.risk, 'risk', 1, 5) }),
    'The interchange is the I-10 law at real size: deceleration lane, ramp, deck, the stop and the access road to what stands there.');
  }
  async function stampOutside(p, row = null) {
    const [x, z] = toWorld([p.ux, p.uy]), R = S.W?.regionOf(x, z);
    await ask('outside', 'OUTSIDE-CITY STAMP', [
      { key: 'id', label: 'Id', value: row?.id ?? uid('outside', `${R?.id ?? 'x'}-place`) },
      { key: 'region', label: 'Region', type: 'select', options: regionsAll().map((r) => [r.id, r.name]), value: row?.region ?? R?.id ?? '' },
      { key: 'kind', label: 'Kind', type: 'select', options: Object.entries(OUTSIDE_KINDS).map(([k, o]) => [k, o.name]), value: row?.kind ?? 'farm' },
      { key: 'pos', label: 'Where (usmap m)', value: (row?.pos ?? [Math.round(p.ux), Math.round(p.uy)]).join(',') },
      { key: 'name', label: 'Name (blank: the kind\'s)', value: row?.name ?? '' },
    ], (v) => { const q = v.pos.split(',').map(Number); return { id: v.id.trim(), region: v.region, kind: v.kind, pos: q.map(Math.round), ...(v.name.trim() ? { name: v.name.trim().toUpperCase() } : {}) }; });
  }
  async function stampDensity(row = null) {
    const R = regionsAll().find((r) => r.id === (row?.region ?? doc().regions?.[0]?.id)) ?? regionsAll()[0];
    const mix = row?.mix?.interstate ?? OUTSIDE_DENSITY.interstate;
    await ask('outside', 'OUTSIDE-CITY DENSITY', [
      { key: 'id', label: 'Id', value: row?.id ?? uid('outside', `${R.id}-roadside`) },
      { key: 'region', label: 'Region', type: 'select', options: regionsAll().map((r) => [r.id, r.name]), value: R.id },
      ...Object.keys(OUTSIDE_KINDS).map((k) => ({ key: `k_${k}`, label: `${OUTSIDE_KINDS[k].name} per km of interstate (both sides)`, type: 'number', value: mix[k] ?? 0 })),
    ], (v) => ({ id: v.id.trim(), region: v.region, mix: { interstate: Object.fromEntries(Object.keys(OUTSIDE_KINDS).map((k) => [k, num(v[`k_${k}`], k, 0, 2)]).filter(([, n]) => n > 0)) } }),
    'A density row puts the region\'s farms, churches, junkyards and the rest along its roads at these rates, never near a town, a city or an exit\'s community, never two within 520 m.');
  }
  async function stampBase(p, row = null) {
    const [x, z] = toWorld([p.ux, p.uy]), st = S.W?.stateAt(x, z);
    const ab = Object.fromEntries(Object.entries({ GEORGIA: 'GA', FLORIDA: 'FL', ALABAMA: 'AL', ARIZONA: 'AZ' }));
    const code = row?.state ?? ab[st] ?? '';
    const rows = MILBASES.filter((m) => !code || m.state === code);
    await ask('base', 'MILITARY BASE STAMP', [
      { key: 'id', label: 'Id', value: row?.id ?? uid('bases', `${code.toLowerCase() || 'state'}-base`) },
      { key: 'state', label: 'State (two letters)', value: code },
      { key: 'milbase', label: 'The base row (data/milbases.js)', type: 'select', options: rows.map((m) => [m.id, `${m.name} (${m.state}, ${m.cls ?? m.class ?? ''} ${m.status})`]), value: row?.milbase ?? rows[0]?.id ?? '' },
      { key: 'at', label: 'Stand it at (usmap m; blank: its real point)', value: (row?.at ?? [Math.round(p.ux), Math.round(p.uy)]).join(',') },
    ], (v) => ({ id: v.id.trim(), state: v.state.trim().toUpperCase(), milbase: v.milbase, ...(v.at.trim() ? { at: v.at.split(',').map((q) => Math.round(Number(q))) } : {}) }),
    'One base a state. Its real installation may sit past the drivable box: this moves it onto ground inside, near your click (citygen finds free ground within 6 km).');
  }

  // ---- the side ---------------------------------------------------------------------------------------------------
  function renderStamp() {
    stampPlate.innerHTML = '';
    const p = S.pending;
    stampPlate.append(el('header', { class: 'ph' }, el('h2', {}, 'STAMP'), el('span', { class: 'sub' }, p ? `PREVIEW · ${p.kind} ${p.row.id}` : TOOLS.find((t) => t[0] === S.tool)[1]), el('span', { class: 'grow' }),
      el('button', { class: 'btn mini', title: 'A region\'s outside-city density row', html: `${svg('site')}<span>DENSITY</span>`, onclick: () => stampDensity() })));
    if (!p) { stampPlate.append(el('div', { class: 'empty', style: { padding: '10px 16px 16px' } }, el('span', {}, TOOLS.find((t) => t[0] === S.tool)[4] + '. Every stamp previews on the map (dashed) before you write it.'))); return; }
    const mine = S.errors.filter((e) => e.coll === COLL[p.kind] && e.id === p.row.id);
    stampPlate.append(el('pre', { class: 'rowjson', style: { maxHeight: '160px', overflow: 'auto', fontSize: '11px', margin: '0 16px', whiteSpace: 'pre-wrap' } }, JSON.stringify(p.row, null, 1)));
    stampPlate.append(el('div', { class: 'field' }, mine.length ? el('span', { style: { color: '#d9643a' } }, mine.map((e) => e.msg).join(' · ')) : el('span', { style: { color: '#9cc46a' } }, 'valid: the engine folds it as drawn')));
    stampPlate.append(el('div', { class: 'field', style: { display: 'flex', gap: '8px' } },
      el('button', { class: 'btn on', html: `${svg('check')}<span>COMMIT</span>`, onclick: commit }),
      el('button', { class: 'btn ghost', onclick: discard }, 'DISCARD')));
  }
  function renderCheck(msg) {
    checkPlate.innerHTML = '';
    const R = Object.values(S.W?.regions ?? {});
    checkPlate.append(el('header', { class: 'ph' }, el('h2', {}, 'THE FOLD'), el('span', { class: 'sub' }, msg ?? (S.errors.length ? `${S.errors.length} finding${S.errors.length > 1 ? 's' : ''}` : 'every stamp valid'))));
    if (msg) return;
    const rep = S.plan?.stampReport;
    const lines = [
      ...R.filter((r) => r.row.stamped).map((r) => `${r.name}: ${r.corridors.map((c) => `${c.id} ${(c.L / GAME_MILE).toFixed(1)} mi, ${c.exits.length} exits`).join(' · ')}${r.open.length ? ` · open to ${r.open.map((o) => o.with).join(', ')}` : ''}`),
      rep ? `cities ${rep.cities.length} · hoods ${rep.hoods} · outside ${rep.outside}${rep.density.map((d) => ` (${d.id}: ${d.placed})`).join('')} · bases moved ${rep.bases.length}` : null,
      S.W?.warnings?.length ? `engine: ${S.W.warnings.slice(0, 3).join('; ')}` : null,
      ...S.errors.slice(0, 8).map((e) => `✗ ${e.coll}/${e.id}: ${e.msg}`),
    ].filter(Boolean);
    checkPlate.append(el('div', { class: 'field', style: { fontSize: '12px', lineHeight: 1.45 } }, ...lines.map((l) => el('div', { style: { color: l.startsWith('✗') ? '#d9643a' : 'var(--text)' } }, l))));
  }
  function renderList() {
    listPlate.innerHTML = '';
    const d = doc(); if (!d) return;
    const n = STAMP_COLLS.reduce((s, c) => s + (d[c]?.length ?? 0), 0);
    listPlate.append(el('header', { class: 'ph' }, el('h2', {}, 'STAMPS'), el('span', { class: 'sub' }, `${n} rows · stamps.json`), el('span', { class: 'grow' }),
      el('button', { class: 'btn mini', title: 'Push the stamps into the game (cities re-plan live; regions and exits need a reload)', html: `${svg('push')}<span>PUSH</span>`, onclick: async () => { const { push } = await import('./core.js'); push('stamps'); } })));
    if (!n) { listPlate.append(el('div', { class: 'empty' }, el('div', { class: 'circ', html: svg('layers') }), el('b', {}, 'NOTHING STAMPED YET'), el('span', {}, 'Drag a REGION box beside Florida, then stamp its cities, exits, the land between and the state\'s base.'))); return; }
    const ol = el('ol', { class: 'strokes' });
    for (const [kind, coll] of Object.entries(COLL)) for (const r of d[coll] ?? []) {
      const c = kind === 'hood' ? COL.hood[r.kind] : COL[kind];
      const sub = kind === 'region' ? `${r.state} · ${r.look} · danger ${r.danger}` : kind === 'city' ? `${r.size} · ${r.town ?? r.pos}` : kind === 'hood' ? `${r.kind} · ${r.city}` : kind === 'exit' ? `${r.road} mile ${r.mile} · ${r.offers}` : kind === 'outside' ? (r.mix ? `density · ${Object.keys(r.mix.interstate ?? {}).length} kinds` : r.kind) : `${r.state} · ${r.milbase}`;
      ol.append(el('li', { class: `stroke${S.sel?.id === r.id && S.sel?.kind === kind ? ' sel' : ''}`, onclick: () => { S.sel = { kind, id: r.id }; flyTo(kind, r); renderList(); mv.redraw(); } },
        el('i', { style: { background: c } }), el('div', {}, el('b', {}, `${kind.toUpperCase()} ${r.id}`), el('span', {}, ` ${sub}`)),
        el('button', { class: 'x', title: 'Delete this stamp (undo brings it back)', onclick: async (e) => { e.stopPropagation(); await patch('stamps', [{ op: 'remove', coll, id: r.id }], { label: `delete ${kind} ${r.id}`, tab: 'stamp' }); } }, '×')));
    }
    listPlate.append(el('div', { class: 'scroll' }, ol));
  }
  function flyTo(kind, r) {
    if (kind === 'region') return mv.fit(r.box.x0, r.box.y0, r.box.x1, r.box.y1, 40);
    const rec = S.plan?.find((q) => q.stampId === r.id || q.city === r.id);
    if (rec) { const u = toUsmap(rec.x, rec.z); return mv.flyTo(u[0], u[1], Math.max(mv.view.s, 0.6)); }
    const p = r.pos ?? r.at; if (p && kind !== 'hood') mv.flyTo(p[0], p[1], Math.max(mv.view.s, 0.3));
  }

  // ---- drawing ------------------------------------------------------------------------------------------------------
  const box = (g, b, color, dash, w = 1.6) => { g.strokeStyle = color; g.lineWidth = w; g.setLineDash(dash ? [6, 5] : []); g.strokeRect(mv.sx(b.x0), mv.sy(b.y0), (b.x1 - b.x0) * mv.view.s, (b.y1 - b.y0) * mv.view.s); g.setLineDash([]); };
  const wsq = (g, x, z, half, color, fill, dash) => { const a = toUsmap(x - half, z - half), b = toUsmap(x + half, z + half); g.fillStyle = fill; g.fillRect(mv.sx(a[0]), mv.sy(a[1]), (b[0] - a[0]) * mv.view.s, (b[1] - a[1]) * mv.view.s); box(g, { x0: a[0], y0: a[1], x1: b[0], y1: b[1] }, color, dash, 1.2); };
  mv.layers.push({ id: 'stamp', draw: (g) => {
    const d = F.docs.usmap?.doc; if (!d) return;
    drawNetwork(g, mv, d, { alpha: 0.55, streets: mv.view.s > 0.3 });
    const lab = new Labeler(), pend = S.pending;
    // regions: the hand ones (Florida) faint, the stamped ones amber, open seams in teal
    for (const R of Object.values(S.W?.regions ?? {})) {
      const b = R.row.box, isP = pend?.kind === 'region' && pend.row.id === R.id;
      box(g, b, R.row.stamped ? COL.region : 'rgba(239,230,204,0.45)', isP, R.row.stamped ? 2 : 1.2);
      for (const o of R.open) { g.strokeStyle = '#7fd1c4'; g.lineWidth = 3.5; const ns = o.side === 'N' || o.side === 'S', y = o.side === 'N' ? b.y0 : b.y1, x = o.side === 'W' ? b.x0 : b.x1; g.beginPath(); if (ns) { const a0 = toUsmap(o.a0, 0)[0], a1 = toUsmap(o.a1, 0)[0]; g.moveTo(mv.sx(a0), mv.sy(y)); g.lineTo(mv.sx(a1), mv.sy(y)); } else { const a0 = toUsmap(0, o.a0)[1], a1 = toUsmap(0, o.a1)[1]; g.moveTo(mv.sx(x), mv.sy(a0)); g.lineTo(mv.sx(x), mv.sy(a1)); } g.stroke(); }
      lab.text(g, `${R.name}${R.row.stamped ? '' : ' (hand)'}`, mv.sx(b.x0) + 6, mv.sy(b.y0) + 14, { font: '700 13px "Barlow Condensed", sans-serif' });
      for (const cor of R.corridors) {
        g.strokeStyle = R.row.stamped ? 'rgba(255,214,120,0.95)' : 'rgba(239,230,204,0.5)'; g.lineWidth = 2.4;
        const pts = []; for (let i = 0; i < cor.cl.n; i += 40) pts.push(toUsmap(cor.cl.x[i], cor.cl.z[i])); pts.push(toUsmap(cor.cl.x[cor.cl.n - 1], cor.cl.z[cor.cl.n - 1]));
        polyline(g, mv, pts); g.stroke();
        for (const X of cor.exits) { const u = toUsmap(X.x, X.z), v = toUsmap(X.dest.x, X.dest.z), isX = X.row?.stamp && pend?.kind === 'exit' && pend.row.id === X.row.stamp; g.fillStyle = COL.exit; g.save(); g.translate(mv.sx(u[0]), mv.sy(u[1])); g.rotate(Math.PI / 4); g.fillRect(-4, -4, 8, 8); g.restore(); g.strokeStyle = COL.exit; g.setLineDash(isX ? [4, 3] : [2, 3]); g.beginPath(); g.moveTo(mv.sx(u[0]), mv.sy(u[1])); g.lineTo(mv.sx(v[0]), mv.sy(v[1])); g.stroke(); g.setLineDash([]); if (mv.view.s > 0.08) lab.text(g, `${X.number} ${X.name}`, mv.sx(u[0]) + 7, mv.sy(u[1]) - 4, { font: '600 11px "Barlow Condensed", sans-serif' }); }
      }
    }
    // the plan's stamped records: hoods by kind, outside places, the moved base
    for (const r of S.plan ?? []) {
      if (!(r.stampId || (r.milbase && r.stampedAt))) continue;
      const isP = pend && (pend.row.id === r.stampId || pend.row.id === r.city || (pend.kind === 'base' && pend.row.milbase === r.milbase));
      const c = r.hood ? COL.hood[r.hood] : r.outside ? COL.outside : COL.base;
      wsq(g, r.x, r.z, r.half - (r.hood ? 30 : 0), c, `${c}33`, isP);
      if (r.gated) { const u = toUsmap(r.x, r.z); g.fillStyle = COL.hood.gated; g.font = '700 10px sans-serif'; g.fillText('GATED', mv.sx(u[0]) - 14, mv.sy(u[1]) + 3); }
      if (mv.view.s > 0.25) { const u = toUsmap(r.x, r.z + r.half); lab.text(g, r.name, mv.sx(u[0]), mv.sy(u[1]) + 10, { font: '600 11px "Barlow Condensed", sans-serif' }); }
    }
    for (const t of d.towns) { const x = mv.sx(t.pos[0]), y = mv.sy(t.pos[1]); if (x < -50 || y < -20 || x > mv.w + 20 || y > mv.hgt + 20) continue; g.fillStyle = t.kind === 'city' ? '#e3a72f' : '#d9643a'; g.beginPath(); g.arc(x, y, 3.5, 0, 7); g.fill(); lab.text(g, t.name, x, y, { font: '700 12px "Barlow Condensed", sans-serif' }); }
    if (S.drag) { const a = S.drag.a, b = S.drag.b; box(g, { x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]), y0: Math.min(a[1], b[1]), y1: Math.max(a[1], b[1]) }, COL.region, true, 2); }
    if (S.busy) { g.fillStyle = 'rgba(16,13,9,0.6)'; g.fillRect(12, mv.hgt - 40, 120, 26); g.fillStyle = '#e3a72f'; g.font = '700 12px sans-serif'; g.fillText('FOLDING…', 22, mv.hgt - 22); }
  } });

  on('doc', ({ file }) => { if (file === 'stamps' && doc() && F.tab === 'stamp') { renderList(); if (!S.pending) fold(doc(), true); } });
  addPalette(() => [
    ...TOOLS.map(([id, label, k]) => ({ label: `STAMP: ${label}`, hint: k, tag: 'STAMP', run: () => { F.show('stamp'); setTool(id); } })),
    { label: 'STAMP: outside-city density row', hint: 'per km of road', tag: 'STAMP', run: () => { F.show('stamp'); stampDensity(); } },
  ]);
  function onKey(e) {
    if (e.target.closest('input, textarea, select, dialog')) return false;
    const T = TOOLS.find((t) => t[2].toLowerCase() === e.key.toLowerCase()); if (T && !e.ctrlKey) { setTool(T[0]); return true; }
    if (e.key === 'Enter' && S.pending) { commit(); return true; }
    if (e.key === 'Escape' && S.pending) { discard(); return true; }
    return false;
  }
  return {
    id: 'stamp', label: 'Stamp', icon: 'layers', pane, undoFile: 'stamps', onKey,
    async init() {
      if (!F.docs.usmap) await loadDoc('usmap');
      mv.setGrid(F.docs.usmap.doc);
      await loadDoc('stamps');
      setTool('region'); renderStamp(); renderList();
      await fold(doc());
    },
    onShow() { mv.resize(); mv.redraw(); },
    // agents and forge-shots drive the tab through these
    S, mv, fold, commit, discard, setTool,
    preview: async (kind, row) => { S.pending = { kind, row }; await fold(withPending()); renderStamp(); return { errors: S.errors.filter((e) => e.coll === COLL[kind] && e.id === row.id) }; },
    fit: (x0, y0, x1, y1) => mv.fit(x0, y0, x1, y1, 30),
  };
}
