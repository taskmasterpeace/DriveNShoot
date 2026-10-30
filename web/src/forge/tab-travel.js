// TRAVEL (docs/design/WEB_WORLD_TOOLS.md §3.1): the travel math on the real road graph, in the World Forge. Pick two places
// and a vehicle row: the route (drawn), its km and game miles, minutes at cruise or flat out, litres on the engine's own
// fuel law, tanks and refuels, how far one tank gets on each road class. THE TABLE prices the standard pairs for four
// rigs; THE CHECK holds the math against the long road's measured I-10 drive. The same answers as `trip from= to=`.
import { F, el, svg, toast, on, addPalette, loadDoc, cmd } from './core.js';
import { MapView, drawNetwork, Labeler, polyline, toUsmap } from './mapview.js';
import { STAMPS, resetFold } from '../world/stamps.js';
import { TravelNet } from '../world/travelmath.js';
import { VEHICLES } from '../systems/vehicles.js';
import { MODES, MEASURED, ROAD_CLASSES, STAMP_COLLS, GAME_MILE } from '../data/worldtools.js';

const PAIRS = [['losangeles', 'phoenix'], ['phoenix', 'elpaso'], ['losangeles', 'elpaso'], ['miami', 'meridian'], ['meridian', 'jacksonville'], ['miami', 'atlanta'], ['meridian', 'atlanta'], ['phoenix', 'atlanta']];
const RIGS = ['interceptor', 'pickup', 'rig', 'bike'];

export function travelTab() {
  const S = { N: null, W: null, from: 'meridian', to: 'atlanta', vehicle: 'interceptor', mode: 'cruise', trip: null, table: null };
  const pane = el('section', { class: 'pane pane-brush pane-travel', id: 'pane-travel' });
  const wrap = el('div', { class: 'mapwrap' }), readout = el('div', { class: 'readout' }, 'click a place to set FROM, shift-click for TO');
  wrap.append(readout);
  const formPlate = el('section', { class: 'plate' }), tripPlate = el('section', { class: 'plate' }), tablePlate = el('section', { class: 'plate grow' });
  pane.append(el('nav', { class: 'rail plate' }), wrap, el('aside', { class: 'side' }, formPlate, tripPlate, tablePlate));
  const mv = new MapView(wrap, { cx: -20000, cy: 9000, s: 0.012 });

  async function net() {
    if (S.N) return S.N;
    const d = F.docs.stamps?.doc ?? (await loadDoc('stamps')).doc;
    for (const c of STAMP_COLLS) { STAMPS[c].length = 0; STAMPS[c].push(...(d[c] ?? [])); }
    resetFold();
    const { WorldIndex } = await import('../world/worldindex.js');
    S.W = new WorldIndex(); S.N = new TravelNet(S.W, VEHICLES);
    return S.N;
  }
  async function run() { const N = await net(); S.trip = N.trip(S.from, S.to, S.vehicle, S.mode); renderTrip(); mv.redraw(); if (!S.trip.ok) toast(S.trip.error, 'bad'); }
  async function table() {
    const N = await net(); S.table = PAIRS.flatMap(([a, b]) => RIGS.map((v) => ({ a, b, v, c: N.trip(a, b, v, 'cruise'), f: N.trip(a, b, v, 'flat') })));
    const m = N.trip(MEASURED.i10.from, MEASURED.i10.to, 'interceptor', 'cruise');
    S.check = m.ok ? { miles: m.miles, minutes: m.minutes, want: +(MEASURED.i10.minutes * (m.miles / MEASURED.i10.miles)).toFixed(1), whole: +(S.W.cl.L / GAME_MILE).toFixed(1) } : null;
    renderTable();
  }

  function renderForm() {
    formPlate.innerHTML = '';
    const places = [...new Set((S.N ? [...S.N.places.values()] : []).filter((p) => p.kind !== 'point'))].sort((a, b) => a.name.localeCompare(b.name));
    const sel = (key, opts) => { const s = el('select', { onchange: (e) => { S[key] = e.target.value; run(); } }); for (const [v, l] of opts) s.append(el('option', { value: v, selected: v === S[key] ? true : undefined }, l)); return s; };
    const pl = places.map((p) => [p.id, `${p.name} (${p.kind}${p.built ? '' : ', past the streamed world'})`]);
    formPlate.append(el('header', { class: 'ph' }, el('h2', {}, 'THE TRAVEL MATH'), el('span', { class: 'sub' }, S.N ? `${S.N.counts.nodes} nodes · ${S.N.counts.edges} edges · ${S.N.counts.built} built corridors` : 'building the graph…')));
    formPlate.append(el('div', { class: 'field' }, el('label', {}, 'FROM'), sel('from', pl)), el('div', { class: 'field' }, el('label', {}, 'TO'), sel('to', pl)),
      el('div', { class: 'field' }, el('label', {}, 'VEHICLE'), sel('vehicle', Object.entries(VEHICLES).filter(([, v]) => !v.boat && v.fuelCap > 0).map(([k, v]) => [k, `${v.name} (${v.fuelCap} L)`]))),
      el('div', { class: 'field' }, el('label', {}, 'MODE'), sel('mode', Object.entries(MODES).map(([k, m]) => [k, m.name]))));
  }
  function renderTrip() {
    tripPlate.innerHTML = '';
    const t = S.trip;
    tripPlate.append(el('header', { class: 'ph' }, el('h2', {}, 'THE TRIP'), el('span', { class: 'sub' }, t?.ok ? `${t.from.name} → ${t.to.name}` : '—'), el('span', { class: 'grow' }),
      t?.ok && F.game.alive ? el('button', { class: 'btn mini', title: 'Teleport the game\'s player to the start', html: `${svg('pin')}<span>GO</span>`, onclick: async () => { const P = S.N.place(S.from); const r = await cmd('teleport', { x: Math.round(P.x), z: Math.round(P.z) }); toast(r.ok ? 'Teleported' : r.error, r.ok ? 'ok' : 'bad'); } }) : null));
    if (!t?.ok) { tripPlate.append(el('div', { class: 'empty' }, t?.error ?? 'pick two places')); return; }
    const big = (v, u) => el('div', { class: 'stat' }, el('b', {}, String(v)), el('span', {}, u));
    tripPlate.append(el('div', { class: 'stats', style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', padding: '0 16px' } }, big(t.miles, 'game mi'), big(t.minutes, 'minutes'), big(t.litres, 'litres'), big(t.tanks ?? '—', 'tanks')));
    const rows = Object.entries(t.byClass).map(([c, b]) => `${ROAD_CLASSES[c]?.name ?? c}: ${b.km} km at ${b.mps} m/s, ${b.minutes} min, ${b.litres} L`);
    tripPlate.append(el('div', { class: 'field', style: { fontSize: '12px', lineHeight: 1.5 } },
      el('div', {}, `${t.km} km · ${Math.round(t.built * 100)}% on built road · ${t.refuels ? `${t.refuels} refuel${t.refuels > 1 ? 's' : ''}` : 'one tank'} · ${t.roads.slice(0, 6).join(' → ')}${t.roads.length > 6 ? ' …' : ''}`),
      ...rows.map((r) => el('div', {}, r)),
      el('div', { style: { color: 'var(--muted)' } }, `one tank: ${Object.entries(t.rangeKm).filter(([c]) => c !== 'ramp').map(([c, k]) => `${c} ${k} km`).join(' · ')}`)));
  }
  function renderTable() {
    tablePlate.innerHTML = '';
    tablePlate.append(el('header', { class: 'ph' }, el('h2', {}, 'THE TABLE'), el('span', { class: 'sub' }, 'cruise / flat out · game miles, minutes, litres'), el('span', { class: 'grow' }), el('button', { class: 'btn mini', html: `${svg('measure')}<span>PRICE</span>`, onclick: table })));
    const c = S.check;
    if (c) tablePlate.append(el('div', { class: 'field', style: { fontSize: '12px' } }, el('b', { style: { color: Math.abs(c.minutes - c.want) / c.want <= MEASURED.tolerance ? '#9cc46a' : '#d9643a' } }, `THE CHECK · I-10 as built ${c.whole} mi (the long road measured ${MEASURED.i10.miles}); LA → El Paso ${c.miles} mi in ${c.minutes} min at cruise (measured pace says ${c.want})`)));
    if (!S.table) { tablePlate.append(el('div', { class: 'empty' }, 'PRICE runs every standard pair for four rigs.')); return; }
    const t = el('table', { class: 'grid', style: { width: '100%', fontSize: '11px', borderCollapse: 'collapse' } });
    t.append(el('tr', {}, ...['FROM', 'TO', 'RIG', 'MI', 'MIN', 'L', 'TANKS', 'FLAT MIN'].map((h) => el('th', { style: { textAlign: 'left', padding: '2px 4px', color: 'var(--muted)' } }, h))));
    for (const r of S.table) t.append(el('tr', { style: { cursor: 'pointer' }, onclick: () => { S.from = r.a; S.to = r.b; S.vehicle = r.v; renderForm(); run(); } }, ...(r.c.ok ? [r.c.from.name, r.c.to.name, r.c.vehicleName, r.c.miles, r.c.minutes, r.c.litres, r.c.tanks, r.f.minutes] : [r.a, r.b, r.v, '—', r.c.error, '', '', '']).map((v) => el('td', { style: { padding: '2px 4px', borderTop: '1px solid rgba(239,230,204,0.08)' } }, String(v)))));
    tablePlate.append(el('div', { class: 'scroll' }, t));
  }

  mv.h.click = async (e, p) => {
    const N = await net(); let best = null;
    for (const P of new Set(N.places.values())) { const u = toUsmap(P.x, P.z), d = Math.hypot(mv.sx(u[0]) - p.px, mv.sy(u[1]) - p.py); if (d < 14 && (!best || d < best.d)) best = { P, d }; }
    if (!best) return;
    if (e.shiftKey) S.to = best.P.id; else S.from = best.P.id;
    renderForm(); run();
  };
  mv.layers.push({ id: 'travel', draw: (g) => {
    const d = F.docs.usmap?.doc; if (!d) return;
    drawNetwork(g, mv, d, { alpha: 0.7 });
    if (S.N) { // the built corridors bright: the road as you drive it
      g.strokeStyle = 'rgba(255,214,120,0.9)'; g.lineWidth = 2;
      for (const L of S.N.lines) if (L.built) { polyline(g, mv, L.pts.filter((_, i) => i % 6 === 0 || i === L.pts.length - 1).map((q) => toUsmap(q[0], q[1]))); g.stroke(); }
    }
    const t = S.trip;
    if (t?.ok) { g.strokeStyle = '#7fd1c4'; g.lineWidth = 4; g.lineCap = 'round'; polyline(g, mv, t.pathUsmap); g.stroke(); }
    const lab = new Labeler();
    for (const P of S.N ? new Set(S.N.places.values()) : []) { if (P.kind === 'exit' && mv.view.s < 0.05) continue; const u = toUsmap(P.x, P.z), x = mv.sx(u[0]), y = mv.sy(u[1]); if (x < -40 || y < -20 || x > mv.w + 40 || y > mv.hgt + 20) continue; const on = P.id === S.from || P.id === S.to; g.fillStyle = on ? '#7fd1c4' : P.kind === 'exit' ? '#9fb6c2' : P.built ? '#e3a72f' : '#8c8478'; g.beginPath(); g.arc(x, y, on ? 6 : 3.5, 0, 7); g.fill(); if (on || P.kind !== 'exit') lab.text(g, P.name, x, y, { font: `${on ? 800 : 600} 12px "Barlow Condensed", sans-serif` }); }
  } });
  on('doc', ({ file }) => { if (file === 'stamps') { S.N = null; } });
  addPalette(() => [{ label: 'TRAVEL: price the standard trips', hint: 'the table', tag: 'TRAVEL', run: () => { F.show('travel'); table(); } }]);
  return {
    id: 'travel', label: 'Travel', icon: 'measure', pane, undoFile: null,
    async init() { if (!F.docs.usmap) await loadDoc('usmap'); mv.setGrid(F.docs.usmap.doc); await net(); renderForm(); await run(); await table(); },
    onShow() { mv.resize(); mv.redraw(); },
    S, mv, run, table, set: (o) => { Object.assign(S, o); renderForm(); return run(); },
  };
}
