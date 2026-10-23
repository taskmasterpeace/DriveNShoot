// THE BUILDING LAB (docs/design/WEB_BUILDING_LAB.md): make places fast, with the engine's own generators.
//   footprint -> floorplan() (world/floorplan.js, rows in data/floorplans.js) -> an authored row (world/authored.js)
//   row -> world/ring.js geo() (the street storey exactly as the game builds it) + authored floors above -> 2D plan + 3D
//   every edit -> prove() (NavProbe, the ring's own reachability rule) -> problems in red
//   export -> the row data/authored.js loads (and the `author` command stands live in the game)
import { KINDS, ZONES, RING } from '../data/ring.js';
import { ROOMS, PLANS } from '../data/floorplans.js';
import { floorplan } from '../world/floorplan.js';
import { Ring } from '../world/ring.js';
import { compile, prove, upperFloor, shellAbove, rowFromPlan, addStorey, removeStorey, landings, AUTHORED_V } from '../world/authored.js';
import * as ED from './edit.js';
import { Plan2D, sameRef } from './plan2d.js';
import { View3D } from './view3d.js';

const $ = (id) => document.getElementById(id);
const clone = (o) => JSON.parse(JSON.stringify(o));
const r1 = (v) => Math.round(v * 10) / 10;
// The kinds and what they are (the ring's own, then the Building Lab's big ones). Any kind with PLANS and KINDS rows shows.
const KIND_INFO = {
  house: ['House', '2-3 bed ranch'], bungalow: ['Bungalow', 'dining room'], duplex: ['Duplex', 'two flats'], shop: ['Workshop', 'bay + office'],
  diner: ['Diner', 'booths, kitchen'], gas: ['Fuel stop', 'sales floor'], mall: ['Strip mall', '3-4 units'],
  offices: ['Office floor', 'corridor, offices'], school: ['School wing', 'classrooms'], motel: ['Motel', 'rooms off a walk'],
  depot: ['Warehouse', '+ mezzanine'], hospital: ['Hospital', 'ward corridor'],
};
const BIG = new Set(['offices', 'school', 'motel', 'depot', 'hospital']);
const ZONE_OF = { house: 'residential', bungalow: 'residential', duplex: 'residential', shop: 'industrial', depot: 'industrial', school: 'residential', hospital: 'residential' };
const ROOM_GROUPS = [
  ['Home', ['living', 'kitchen', 'dining', 'bedroom', 'bath', 'hall']],
  ['Shop & diner', ['floor', 'sales', 'diningroom', 'dkitchen', 'stock', 'office', 'restroom']],
  ['Big buildings', ['corr18', 'corr24', 'officelobby', 'officecell', 'officeopen', 'breakroom', 'washroom', 'supply', 'schoollobby', 'classroom', 'artroom', 'library', 'staffroom', 'motelroom', 'motelbath', 'frontdesk', 'wardroom', 'nursestation', 'treatment', 'dayroom', 'mezzanine']],
];

const ring = new Ring({ seed: 0x1ab, cl: { n: 0, x: [], z: [], s: [] } });
const plan = new Plan2D($('plan2d'));
const view = new View3D($('view3d'));
const S = {
  kind: 'house', w: 12.4, d: 9.6, front: 'N', units: 1, zone: 'residential', seed: 1717,
  row: null, k: 0, tool: 'select', hallW: 1.8, sel: null, hover: null, roof: true, cam: 'orbit',
  undo: [], redo: [], edited: false, L: null, geo: null, uppers: [], proof: null, drag: null, ghost: null,
};
const kindsList = () => Object.keys(PLANS).filter((k) => KINDS[k]);

// ---- generate ---------------------------------------------------------------------------------------------------------
function unitsFor(kind, w) {
  const K = KINDS[kind];
  if (K.unitW) return Math.max(2, Math.round(w / K.unitW));
  return K.units ? Math.round((K.units[0] + K.units[1]) / 2) : 1;
}
function generate() {
  const K = KINDS[S.kind];
  const fp = floorplan({ x0: -S.w / 2, z0: -S.d / 2, x1: S.w / 2, z1: S.d / 2, front: S.front, kind: S.kind, units: S.units, seed: S.seed, T: RING.wall, door: K.bay ?? RING.door, innerDoor: RING.innerDoor, backDoor: RING.backDoor });
  S.row = rowFromPlan({ kind: S.kind, zone: S.zone, front: S.front, w: S.w, d: S.d, seed: S.seed, units: S.units, fp });
  S.k = Math.min(S.k, S.row.floors.length - 1); S.sel = null; S.undo = []; S.redo = []; S.edited = false;
  rebuild({ frame: true });
}
function lotOf(row) {
  const f = row.front, wk = row.walkway ?? 0, fr = 6 + wk, bk = 9, sd = 2.5;
  return f === 'N' ? { x0: row.x0 - sd, x1: row.x1 + sd, z0: row.z0 - fr, z1: row.z1 + bk } : f === 'S' ? { x0: row.x0 - sd, x1: row.x1 + sd, z0: row.z0 - bk, z1: row.z1 + fr }
    : f === 'W' ? { x0: row.x0 - fr, x1: row.x1 + bk, z0: row.z0 - sd, z1: row.z1 + sd } : { x0: row.x0 - bk, x1: row.x1 + fr, z0: row.z0 - sd, z1: row.z1 + sd };
}
// The row as a ring lot, built by ring.geo() on the game's own path.
function build(row) {
  const L = { id: 'LAB', kind: row.kind, zone: row.zone, front: row.front, x0: row.x0, z0: row.z0, x1: row.x1, z1: row.z1, lot: lotOf(row), cx: (row.x0 + row.x1) / 2, cz: (row.z0 + row.z1) / 2,
    seed: row.seed >>> 0, ruined: false, hh: null, authored: compile(row, { shell: false }) };
  const geo = ring.geo(L);
  const uppers = row.floors.map((f, k) => (k ? upperFloor(ring, L, row, k) : null));
  const proof = prove(ring, L, geo);
  return { L, geo, uppers, proof };
}
let raf = 0, want3d = false, wantFrame = false;
function rebuild({ frame = false, three = true } = {}) {
  const t0 = performance.now();
  const b = build(S.row);
  Object.assign(S, b);
  S.ms = performance.now() - t0;
  if (frame) plan.fit(S.row);
  want3d ||= three; wantFrame ||= frame;
  if (!raf) raf = requestAnimationFrame(flush);
}
function flush() {
  raf = 0;
  draw2d();
  if (want3d) draw3d();
  if (wantFrame) view.frame(S.row, S.cam);
  want3d = wantFrame = false;
  panels();
}
function draw2d() { plan.draw({ row: S.row, k: S.k, geo: S.geo, upper: S.uppers[S.k], proof: S.proof, sel: S.sel, hover: S.hover, ghost: S.ghost }); }
function draw3d() {
  const marks = [];
  for (const f of S.proof.floors) for (const q of f.rooms) if (!q.reached) { const r = S.row.floors[f.k].rooms[q.i]; if (r) marks.push({ floor: f.k, ...r }); }
  const sr = S.sel?.room !== undefined ? S.row.floors[S.sel.k]?.rooms[S.sel.room] : null;
  view.build({ row: S.row, geo: S.geo, uppers: S.uppers, shell: shellAbove(S.row, S.L.color), view: { floor: S.roof ? S.row.floors.length - 1 : S.k, roof: S.roof }, marks, sel: sr ? { floor: S.sel.k, ...sr } : null });
}

// ---- edits ------------------------------------------------------------------------------------------------------------
function commit(fn) {
  const before = JSON.stringify(S.row);
  const err = fn(S.row);
  if (err) { toast(err, true); S.row = JSON.parse(before); rebuild(); return false; }
  if (JSON.stringify(S.row) === before) return false;
  S.undo.push(before); S.redo = []; S.edited = true;
  rebuild();
  return true;
}
function undo() { if (!S.undo.length) return; S.redo.push(JSON.stringify(S.row)); S.row = JSON.parse(S.undo.pop()); S.sel = null; S.k = Math.min(S.k, S.row.floors.length - 1); rebuild(); }
function redo() { if (!S.redo.length) return; S.undo.push(JSON.stringify(S.row)); S.row = JSON.parse(S.redo.pop()); S.sel = null; S.k = Math.min(S.k, S.row.floors.length - 1); rebuild(); }

// ---- the plan's pointer -------------------------------------------------------------------------------------------------
const cv = $('plan2d');
const at = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
cv.addEventListener('pointermove', (e) => {
  const [px, pz] = at(e), [x, z] = plan.toM(px, pz);
  if (S.drag) return dragMove(x, z, e);
  S.hover = plan.hit(S, px, pz);
  S.ghost = ghostFor(x, z, e.shiftKey);
  cv.className = S.tool === 'select' && S.hover && !S.hover.room ? 'grab' : '';
  hintFor();
  if (!raf) raf = requestAnimationFrame(flush);
});
cv.addEventListener('pointerleave', () => { if (!S.drag) { S.hover = null; S.ghost = null; if (!raf) raf = requestAnimationFrame(flush); } });
cv.addEventListener('pointerdown', (e) => {
  const [px, pz] = at(e), [x, z] = plan.toM(px, pz), h = plan.hit(S, px, pz);
  cv.setPointerCapture(e.pointerId);
  if (S.tool === 'select') {
    if (h?.door !== undefined || h?.gap !== undefined || h?.flight !== undefined || h?.wall) {
      S.sel = { k: S.k, ...h };
      S.drag = { h, x0: x, z0: z, base: JSON.stringify(S.row), moved: false };
      cv.className = 'moving';
    } else S.sel = h ? { k: S.k, ...h } : null;
    rebuild();
  } else if (S.tool === 'door') {
    if (h?.door !== undefined || h?.gap !== undefined) commit((row) => ED.removeDoor(row, S.k, h.door !== undefined ? { door: h.door } : { i: h.wallOf.i, gap: h.gap }));
    else if (h?.wall) commit((row) => ED.addDoor(row, S.k, h.wall, h.horizontal ? x : z));
    else toast('click on a wall to put a doorway in it');
  } else if (S.tool === 'wall') {
    if (h?.room === undefined) return toast('click inside a room to split it');
    const r = S.row.floors[S.k].rooms[h.room], hz = splitAxis(r, e.shiftKey);
    commit((row) => ED.splitRoom(row, S.k, h.room, hz, hz ? z : x));
  } else if (S.tool === 'hall') {
    if (h?.room === undefined) return toast('press inside a room and drag along where the hall should run');
    S.drag = { hall: h.room, x0: x, z0: z };
  }
});
cv.addEventListener('pointerup', (e) => {
  const d = S.drag; S.drag = null; cv.className = '';
  if (!d) return;
  const [px, pz] = at(e), [x, z] = plan.toM(px, pz);
  if (d.hall !== undefined) {
    const r = S.row.floors[S.k].rooms[d.hall], dx = Math.abs(x - d.x0), dz = Math.abs(z - d.z0);
    const hz = dx + dz < 0.6 ? r.x1 - r.x0 >= r.z1 - r.z0 : dx >= dz; // a click: along the room's long side
    S.ghost = null;
    commit((row) => ED.carveHall(row, S.k, d.hall, hz, hz ? d.z0 : d.x0, S.hallW));
    return;
  }
  if (d.moved) { const now = JSON.stringify(S.row); S.row = JSON.parse(d.base); commit((row) => { Object.assign(row, JSON.parse(now)); return null; }); }
  else rebuild();
});
function dragMove(x, z, e) {
  const d = S.drag;
  if (d.hall !== undefined) {
    const r = S.row.floors[S.k].rooms[d.hall], dx = Math.abs(x - d.x0), dz = Math.abs(z - d.z0), hz = dx >= dz, c = Math.floor(hz ? d.z0 : d.x0) + 0.5, w = S.hallW;
    S.ghost = hz ? { x0: r.x0, x1: r.x1, z0: c - w / 2, z1: c + w / 2, label: `HALL ${w} m` } : { z0: r.z0, z1: r.z1, x0: c - w / 2, x1: c + w / 2, label: `HALL ${w} m` };
    if (!raf) raf = requestAnimationFrame(flush);
    return;
  }
  if (Math.hypot(x - d.x0, z - d.z0) < 0.12 && !d.moved) return;
  d.moved = true;
  const row = JSON.parse(d.base), h = d.h;
  let err = null;
  if (h.door !== undefined) { const q = row.floors[0].doors[h.door]; err = ED.moveDoor(row, 0, { door: h.door }, q.side === 'N' || q.side === 'S' ? x : z); }
  else if (h.gap !== undefined) { const W = row.floors[S.k].walls[h.wallOf.i]; err = ED.moveDoor(row, S.k, { i: h.wallOf.i, gap: h.gap }, W.horizontal ? x : z); }
  else if (h.flight !== undefined) err = ED.moveFlight(row, h.flight, x - d.x0, z - d.z0);
  else if (h.wall) {
    const W = ED.wallsOf(row, S.k).find((w) => sameRef(w.ref, h.wall));
    err = ED.moveWall(row, S.k, h.wall, W.horizontal ? z : x);
    void e;
  }
  if (err) { hint(err); return; }
  S.row = row;
  rebuild({ three: false });
}
function splitAxis(r, shift) { const hz = r.z1 - r.z0 > r.x1 - r.x0; return shift ? !hz : hz; }
function ghostFor(x, z, shift) {
  const h = S.hover;
  if (S.tool === 'wall' && h?.room !== undefined) {
    const r = S.row.floors[S.k].rooms[h.room], hz = splitAxis(r, shift), T = RING.wall;
    return hz ? { x0: r.x0, x1: r.x1, z0: z - T / 2, z1: z + T / 2, label: `${r1(z - r.z0 - T / 2)} | ${r1(r.z1 - z - T / 2)} m` } : { z0: r.z0, z1: r.z1, x0: x - T / 2, x1: x + T / 2, label: `${r1(x - r.x0 - T / 2)} | ${r1(r.x1 - x - T / 2)} m` };
  }
  if (S.tool === 'hall' && h?.room !== undefined) {
    const r = S.row.floors[S.k].rooms[h.room], hz = r.x1 - r.x0 >= r.z1 - r.z0, w = S.hallW, c = Math.floor(hz ? z : x) + 0.5;
    return hz ? { x0: r.x0, x1: r.x1, z0: c - w / 2, z1: c + w / 2, label: `HALL ${w} m · drag to turn it` } : { z0: r.z0, z1: r.z1, x0: c - w / 2, x1: c + w / 2, label: `HALL ${w} m · drag to turn it` };
  }
  return null;
}
const HINTS = {
  select: 'Drag a wall, a doorway or the stairs · click a room to retype it · Del removes',
  wall: 'Click in a room to split it with a wall (Shift: the other way)',
  door: 'Click a wall to add a doorway · click a doorway to remove it',
  hall: 'Press in a room and drag along the hall (width above)',
};
function hintFor() { hint(HINTS[S.tool]); }
function hint(t) { $('hint').textContent = t; }

// ---- keys -----------------------------------------------------------------------------------------------------------
addEventListener('keydown', (e) => {
  if (e.target.closest('input, textarea, select') || !$('modal').hidden) { if (e.key === 'Escape') closeModal(); return; }
  const k = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); redo(); return; }
  if (k === 'v') setTool('select'); else if (k === 'w') setTool('wall'); else if (k === 'd') setTool('door'); else if (k === 'h') setTool('hall');
  else if (k === 'r') reroll();
  else if (k === 'delete' || k === 'backspace') deleteSel();
  else if (k === '[' || k === ']') setFloor(Math.max(0, Math.min(S.row.floors.length - 1, S.k + (k === ']' ? 1 : -1))));
  else if (k === 'escape') { S.sel = null; rebuild(); }
});
function deleteSel() {
  const s = S.sel;
  if (!s) return;
  if (s.door !== undefined) commit((row) => ED.removeDoor(row, s.k, { door: s.door }));
  else if (s.gap !== undefined) commit((row) => ED.removeDoor(row, s.k, { i: s.wallOf.i, gap: s.gap }));
  else if (s.wall && !s.wall.side) commit((row) => ED.removeWall(row, s.k, s.wall.i));
  else return;
  S.sel = null; rebuild();
}

// ---- panels ---------------------------------------------------------------------------------------------------------
function setTool(t) {
  S.tool = t; S.ghost = null;
  for (const b of document.querySelectorAll('[data-tool]')) b.classList.toggle('on', b.dataset.tool === t);
  $('hallW').hidden = t !== 'hall';
  hintFor();
}
for (const b of document.querySelectorAll('[data-tool]')) b.onclick = () => setTool(b.dataset.tool);
for (const b of document.querySelectorAll('#hallW [data-w]')) b.onclick = () => { S.hallW = +b.dataset.w; for (const c of document.querySelectorAll('#hallW [data-w]')) c.classList.toggle('on', c === b); };
function setFloor(k) { S.k = k; S.sel = null; rebuild(); }

function kindsUI() {
  $('kinds').innerHTML = kindsList().map((k) => `<button class="kind${k === S.kind ? ' on' : ''}${BIG.has(k) ? ' big' : ''}" data-k="${k}"><b>${KIND_INFO[k]?.[0] ?? k}</b><small>${KIND_INFO[k]?.[1] ?? `${PLANS[k].length} plans`}</small></button>`).join('');
  for (const b of $('kinds').children) b.onclick = () => guard(() => {
    S.kind = b.dataset.k; const K = KINDS[S.kind];
    S.w = r1((K.w[0] + K.w[1]) / 2); S.d = r1((K.d[0] + K.d[1]) / 2); S.zone = ZONE_OF[S.kind] ?? 'strip'; S.units = unitsFor(S.kind, S.w); S.k = 0;
    footprintUI(); generate();
  });
}
function footprintUI() {
  for (const [id, v] of [['w', S.w], ['d', S.d]]) { $(id).value = v; $(id + 'Out').textContent = `${v.toFixed(1)} m`; }
  for (const b of $('front').children) b.classList.toggle('on', b.dataset.f === S.front);
  $('units').textContent = S.units;
  const multi = !!KINDS[S.kind].units;
  $('uMinus').disabled = !multi; $('uPlus').disabled = !multi;
  $('zones').innerHTML = Object.keys(ZONES).map((z) => `<button class="chip${z === S.zone ? ' on' : ''}" data-z="${z}">${ZONES[z].name.replace('THE ', '').toLowerCase()}</button>`).join('');
  for (const b of $('zones').children) b.onclick = () => guard(() => { S.zone = b.dataset.z; footprintUI(); generate(); });
  $('seed').value = S.seed;
  for (const b of document.querySelectorAll('.kind')) b.classList.toggle('on', b.dataset.k === S.kind);
}
for (const id of ['w', 'd']) {
  $(id).oninput = () => { S[id] = +$(id).value; $(id + 'Out').textContent = `${S[id].toFixed(1)} m`; if (id === 'w' && KINDS[S.kind].unitW) { S.units = unitsFor(S.kind, S.w); $('units').textContent = S.units; } };
  $(id).onchange = () => guard(() => generate(), () => footprintUI());
}
for (const b of $('front').children) b.onclick = () => guard(() => { S.front = b.dataset.f; footprintUI(); generate(); });
$('uMinus').onclick = () => guard(() => { S.units = Math.max(1, S.units - 1); footprintUI(); generate(); });
$('uPlus').onclick = () => guard(() => { S.units = Math.min(14, S.units + 1); footprintUI(); generate(); });
$('seed').onchange = () => guard(() => { S.seed = (+$('seed').value >>> 0) || 1; generate(); });
function reroll() { guard(() => { S.seed = (Math.random() * 1e6) | 0; footprintUI(); generate(); }); }
$('reroll').onclick = reroll; $('reroll2').onclick = reroll;
$('undo').onclick = undo; $('redo').onclick = redo;
// Regenerating throws hand edits away: ask first.
function guard(go, cancel) {
  if (!S.edited) return go();
  modal(`<h2>Replace the hand edits?</h2><p class="lead">This plan has ${S.undo.length} edit${S.undo.length === 1 ? '' : 's'}. A new footprint, kind or seed lays it out again from the generator. Pin it first to keep it.</p>
    <div class="mfoot"><button class="btn" id="mPin">Pin, then replace</button><button class="btn" id="mNo">Keep editing</button><button class="btn primary" id="mGo">Replace</button></div>`);
  $('mGo').onclick = () => { closeModal(); S.edited = false; go(); };
  $('mPin').onclick = () => { pinNow(); closeModal(); S.edited = false; go(); };
  $('mNo').onclick = () => { closeModal(); cancel?.(); footprintUI(); };
}

function floorsUI() {
  const n = S.row.floors.length;
  $('floors').innerHTML = S.row.floors.map((f, k) => `<button class="pill${k === S.k ? ' on' : ''}" data-k="${k}">${k === 0 ? 'Street' : f.deck ? `Mezz ${k}` : `Floor ${k}`}</button>`).join('');
  for (const b of $('floors').children) b.onclick = () => setFloor(+b.dataset.k);
  $('delStorey').disabled = n < 2;
}
$('addStorey').onclick = () => {
  modal(`<h2>Add a storey</h2><p class="lead">Floor ${S.row.floors.length} goes on top at ${r1(S.row.floors.length === 1 ? S.row.h : S.row.floors[S.row.floors.length - 1].y + 3.2)} m. A flight climbs to it by the storeys rules (pitch 3.2 : 4.4, ${1.4} m wide, a 1.4 m landing at each end), placed along a wall clear of the doorways - drag it to move it.</p>
    <div class="choice"><button id="sCopy"><b>Copy the floor below</b><small>Same rooms and doorways (an office floor over an office floor). Retype rooms after.</small></button>
    <button id="sOpen"><b>One open floor</b><small>A single room the size of the building. Split it with Wall and Hall.</small></button></div>`);
  $('sCopy').onclick = () => { closeModal(); storeyUp('copy'); }; $('sOpen').onclick = () => { closeModal(); storeyUp('open'); };
};
function storeyUp(mode) {
  let note = null, err = null;
  const ok = commit((row) => {
    const open = BIG.has(row.kind) ? 'officeopen' : 'living';
    let r = addStorey(row, mode, mode === 'open' ? open : null);
    // A copied floor's walls can stand where the stairs must land: then the new floor is one open room.
    if (typeof r === 'string' && mode === 'copy') { r = addStorey(row, 'open', open); if (typeof r !== 'string') note = 'the stairs could not land inside a copied room, so the new floor is one open room - split it with Wall and Hall'; }
    return (err = typeof r === 'string' ? r : null);
  });
  if (ok) { setFloor(S.row.floors.length - 1); if (note) toast(note); }
  return ok ? (note ?? true) : err;
}
$('delStorey').onclick = () => { commit((row) => { removeStorey(row); return null; }); S.k = Math.min(S.k, S.row.floors.length - 1); rebuild(); };
for (const b of document.querySelectorAll('#roofSeg button')) b.onclick = () => { S.roof = b.dataset.roof === '1'; for (const c of b.parentNode.children) c.classList.toggle('on', c === b); rebuild(); };
for (const b of document.querySelectorAll('#camSeg button')) b.onclick = () => { S.cam = b.dataset.cam; for (const c of b.parentNode.children) c.classList.toggle('on', c === b); view.frame(S.row, S.cam); };

function panels() {
  floorsUI();
  const row = S.row, area = (row.x1 - row.x0) * (row.z1 - row.z0), rooms = row.floors.reduce((s, f) => s + f.rooms.length, 0);
  $('planinfo').innerHTML = `<h2>Plan</h2>
    <div class="stat"><span>Layout</span><span>${row.plan ?? 'hand'}${S.edited ? ' · edited' : ''}</span></div>
    <div class="stat"><span>Footprint</span><span>${r1(row.x1 - row.x0)} × ${r1(row.z1 - row.z0)} m · ${Math.round(area)} m²</span></div>
    <div class="stat"><span>Storeys</span><span>${row.floors.length}${row.floors.length > 1 ? ` · walls to ${r1(row.top)} m` : ` · ${r1(row.h)} m`}</span></div>
    <div class="stat"><span>Rooms</span><span>${rooms} · beds ${S.geo.beds.length + S.uppers.reduce((s, u) => s + (u?.beds.length ?? 0), 0)} · boxes ${S.geo.boxesIn.length + S.uppers.reduce((s, u) => s + (u?.boxesIn.length ?? 0), 0)}</span></div>
    <div class="stat"><span>Built + proved in</span><span>${S.ms.toFixed(1)} ms</span></div>`;
  $('undo').disabled = !S.undo.length; $('redo').disabled = !S.redo.length;
  const P = S.proof, F = (kind) => P.problems.some((p) => p.kind === kind), all = (key, test) => P.floors.every((f) => f[key].every(test));
  const checks = [['Every room reachable', !F('room') && !F('floor')], ['No sealed pockets', !F('cells')], ['Every bed reachable', all('beds', (b) => b.ok)], ['Doorways clear', !F('door')], ['Stairs: landings & run', !F('flight') && !F('floor')], ['Rooms at row sizes', !P.warnings.length, true]];
  $('proof').innerHTML = `<div class="verdict ${P.ok ? 'ok' : 'bad'}"><div class="badge">${P.ok ? '<svg viewBox="0 0 24 24"><path d="M5 12l5 5 9-10"/></svg>' : '<svg viewBox="0 0 24 24"><path d="M12 8v5M12 17h.01M10.3 3.9L2 18a2 2 0 0 0 1.7 3h16.6A2 2 0 0 0 22 18L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>'}</div>
    <div><h3>${P.ok ? 'Reachability proof passes' : `${P.problems.length} problem${P.problems.length === 1 ? '' : 's'}`}</h3><p>NavProbe, the ring's own rule: 1 m cells, walls and furniture grown by a person's 0.45 m, flooded from the doors${row.floors.length > 1 ? ' and up every flight' : ''}.</p></div></div>
    <div class="checks">${checks.map(([t, ok, warn]) => `<div class="check${ok ? '' : warn ? ' warnc' : ' bad'}"><i style="${!ok && warn ? 'background:var(--warn)' : ''}"></i>${t}</div>`).join('')}</div>
    <div class="issues">${P.problems.map((p, i) => `<button class="issue" data-i="${i}">${p.text}</button>`).join('')}${P.warnings.map((p) => `<button class="issue warn" data-w="1" data-f="${p.floor}">${p.text}</button>`).join('')}</div>
    <table class="floorsT"><thead><tr><th>Floor</th><th>Rooms reached</th><th>Beds</th><th>Doorways</th><th>Stairs up</th><th>Sealed m²</th></tr></thead><tbody>${P.floors.map((f) => {
      const rr = f.rooms.filter((q) => q.reached).length, bd = f.beds.filter((q) => q.ok).length, dr = f.doors.filter((q) => q.ok).length;
      const st = f.flights.length ? f.flights.map((q) => (q.foot && q.head ? 'ok' : !q.foot ? 'foot cut off' : 'head off the floor')).join(', ') : '—';
      const c = (ok) => (ok ? '' : ' class="bad"');
      return `<tr data-k="${f.k}"${f.k === S.k ? ' class="cur"' : ''}><td>${f.k ? (row.floors[f.k].deck ? `Mezz ${f.k}` : `Floor ${f.k}`) : 'Street'} <small>${r1(f.y)} m</small></td><td${c(rr === f.rooms.length)}>${rr} / ${f.rooms.length}</td><td${c(bd === f.beds.length)}>${bd} / ${f.beds.length}</td><td${c(dr === f.doors.length)}>${dr} / ${f.doors.length}</td><td${c(st === '—' || !st.includes('cut') && !st.includes('off'))}>${st}</td><td${c(!f.cells.length)}>${f.cells.length}</td></tr>`;
    }).join('')}</tbody></table>
    <p class="legend"><i class="lg red"></i> red hatch: a room nothing reaches · <i class="lg cell"></i> red cells: floor sealed off · ✕ a doorway not clear on both sides · ◯ a bed with no floor beside it. Click a problem to go to its floor.</p>`;
  for (const tr of $('proof').querySelectorAll('tr[data-k]')) tr.onclick = () => setFloor(+tr.dataset.k);
  for (const b of $('proof').querySelectorAll('.issue')) b.onclick = () => { const p = b.dataset.w ? null : P.problems[+b.dataset.i]; const k = p ? p.floor : +b.dataset.f; if (k !== S.k) setFloor(k); };
  $('caption').textContent = `${KIND_INFO[row.kind]?.[0] ?? row.kind} · ${ZONES[row.zone]?.name ?? row.zone} · seed ${row.seed}${S.roof ? '' : ` · cut at ${S.k ? `floor ${S.k}` : 'the street floor'}`}`;
  inspector();
}
function inspector() {
  const s = S.sel, el = $('inspector');
  if (!s) { el.hidden = true; return; }
  el.hidden = false;
  const row = S.row;
  if (s.room !== undefined) {
    const r = row.floors[s.k].rooms[s.room], R = ROOMS[r.type];
    el.innerHTML = `<h3>${R?.name ?? r.type}</h3><p>${r1(r.x1 - r.x0)} × ${r1(r.z1 - r.z0)} m · ${r1((r.x1 - r.x0) * (r.z1 - r.z0))} m² · row min ${R?.fix ?? R?.min ?? '-'} m${R?.loot ? ` · loot: ${R.loot}` : ''}</p>
      <div class="acts2"><button class="btn sm" id="iType">Change type…</button><button class="ghost sm" id="iSplit">Split</button><button class="ghost sm" id="iHall">Hall through</button></div>`;
    $('iType').onclick = () => typePicker(s.k, s.room);
    $('iSplit').onclick = () => { const hz = splitAxis(r, false); commit((rw) => ED.splitRoom(rw, s.k, s.room, hz, hz ? (r.z0 + r.z1) / 2 : (r.x0 + r.x1) / 2)); S.sel = null; };
    $('iHall').onclick = () => { const hz = r.x1 - r.x0 >= r.z1 - r.z0; commit((rw) => ED.carveHall(rw, s.k, s.room, hz, hz ? (r.z0 + r.z1) / 2 : (r.x0 + r.x1) / 2, S.hallW)); S.sel = null; };
  } else if (s.flight !== undefined) {
    const f = row.flights[s.flight], l = landings(f);
    el.innerHTML = `<h3>Stairs: floor ${f.from} → ${f.from + 1}</h3><p>run ${r1(f.axis === 'x' ? f.x1 - f.x0 : f.z1 - f.z0)} m × ${r1(f.axis === 'x' ? f.z1 - f.z0 : f.x1 - f.x0)} m · rise ${r1(row.floors[f.from + 1].y - row.floors[f.from].y)} m · foot (${r1(l.foot[0])}, ${r1(l.foot[1])})</p>
      <div class="acts2"><button class="ghost sm" id="iRev">Climb the other way</button><button class="ghost sm" id="iRe">Re-place by the rules</button></div>`;
    $('iRev').onclick = () => commit((rw) => ED.reverseFlight(rw, s.flight));
    $('iRe').onclick = () => commit((rw) => ED.replaceFlight(rw, s.flight));
  } else if (s.wall) {
    const w = ED.wallsOf(row, s.k).find((q) => sameRef(q.ref, s.wall));
    el.innerHTML = `<h3>${w.ext ? `Outside wall (${s.wall.side})` : w.party ? 'Party wall' : 'Partition'}</h3><p>${r1(w.a1 - w.a0)} m long · drag to move it${w.ext ? ' (the footprint follows, every floor)' : ''}${w.ext ? '' : ' · Del takes it out'}</p>
      ${w.ext ? '' : '<div class="acts2"><button class="ghost sm" id="iDel">Remove wall (merge rooms)</button></div>'}`;
    if (!w.ext) $('iDel').onclick = () => { commit((rw) => ED.removeWall(rw, s.k, s.wall.i)); S.sel = null; rebuild(); };
  } else if (s.door !== undefined || s.gap !== undefined) {
    const d = s.door !== undefined ? row.floors[0].doors[s.door] : null;
    el.innerHTML = `<h3>${d ? `${d.kind[0].toUpperCase() + d.kind.slice(1)} door` : 'Doorway'}</h3><p>${d ? `${d.w} m · side ${d.side}` : `${RING.innerDoor} m`} · drag along the wall (it snaps to the 1 m nav grid)</p>
      <div class="acts2"><button class="ghost sm" id="iDel">Remove</button></div>`;
    $('iDel').onclick = deleteSel;
  }
}
function typePicker(k, i) {
  const cur = S.row.floors[k].rooms[i].type;
  modal(`<h2>Room type</h2><p class="lead">What the room is decides its floor, its furniture (placed and proved by the ring's own furnish), its loot and its minimum size.</p>
    <div class="types">${ROOM_GROUPS.map(([g, list]) => `<h4>${g}</h4>${list.filter((t) => ROOMS[t]).map((t) => `<button class="kind${t === cur ? ' on' : ''}" data-t="${t}"><b>${ROOMS[t].name}</b><small>${t} · min ${ROOMS[t].fix ?? ROOMS[t].min} m</small></button>`).join('')}`).join('')}</div>`);
  for (const b of document.querySelectorAll('[data-t]')) b.onclick = () => { closeModal(); commit((row) => ED.setRoomType(row, k, i, b.dataset.t)); };
}

// ---- pins -------------------------------------------------------------------------------------------------------------
const PIN_KEY = 'buildinglab.pins.v1';
const pins = () => { try { return JSON.parse(localStorage.getItem(PIN_KEY) ?? '[]'); } catch { return []; } };
const savePins = (p) => { try { localStorage.setItem(PIN_KEY, JSON.stringify(p)); } catch { toast('this browser will not keep pins (storage is off)', true); } };
function thumb() {
  const c = document.createElement('canvas'); c.width = 240; c.height = 180;
  const g = c.getContext('2d'); g.fillStyle = '#17130f'; g.fillRect(0, 0, 240, 180);
  const src = $('plan2d'), r = Math.min(240 / src.width, 180 / src.height);
  g.drawImage(src, (240 - src.width * r) / 2, (180 - src.height * r) / 2, src.width * r, src.height * r);
  return c.toDataURL('image/jpeg', 0.7);
}
function pinNow() {
  const p = pins();
  p.unshift({ name: `${KIND_INFO[S.row.kind]?.[0] ?? S.row.kind} · ${r1(S.row.x1 - S.row.x0)}×${r1(S.row.z1 - S.row.z0)}${S.row.floors.length > 1 ? ` · ${S.row.floors.length} fl` : ''}${S.edited ? ' · edited' : ''}`, row: S.row, state: { kind: S.kind, w: S.w, d: S.d, front: S.front, units: S.units, zone: S.zone, seed: S.seed }, thumb: thumb(), at: Date.now() });
  savePins(p.slice(0, 24)); pinsUI(); toast('pinned');
}
$('pin').onclick = pinNow;
function pinsUI() {
  const p = pins();
  $('pinCount').textContent = p.length ? p.length : '';
  if (!p.length) { $('pins').innerHTML = '<p class="empty">Pin a plan you like - it stays here (this browser).</p>'; return; }
  $('pins').innerHTML = p.map((q, i) => `<div class="pinc" data-i="${i}" title="${q.name}"><img src="${q.thumb}" alt=""><span>${q.name}</span><button class="del ghost" data-del="${i}" aria-label="Unpin">×</button></div>`).join('');
  for (const el of $('pins').querySelectorAll('.pinc')) el.onclick = (e) => {
    const i = +el.dataset.i;
    if (e.target.dataset.del !== undefined) {
      e.stopPropagation();
      modal(`<h2>Unpin “${p[i].name}”?</h2><p class="lead">It goes from this browser for good.</p><div class="mfoot"><button class="btn" id="mNo">Keep it</button><button class="btn primary" id="mGo">Unpin</button></div>`);
      $('mNo').onclick = closeModal; $('mGo').onclick = () => { closeModal(); const q = pins(); q.splice(i, 1); savePins(q); pinsUI(); };
      return;
    }
    guard(() => { Object.assign(S, p[i].state); S.row = clone(p[i].row); S.k = 0; S.sel = null; S.undo = []; S.redo = []; S.edited = !!p[i].name.includes('edited'); footprintUI(); kindsUI(); rebuild({ frame: true }); });
  };
}

// ---- export -------------------------------------------------------------------------------------------------------------
function rowText(row) {
  const j = (o) => JSON.stringify(o);
  const { floors, flights, ...head } = row;
  const top = Object.entries(head).map(([k, v]) => `${j(k)}: ${j(v)}`).join(', ');
  const fl = floors.map((f) => `    { "y": ${j(f.y)}, "deck": ${j(f.deck)},\n      "rooms": [\n${f.rooms.map((r) => `        ${j(r)}`).join(',\n')}\n      ],\n      "walls": [\n${f.walls.map((w) => `        ${j(w)}`).join(',\n')}\n      ]${f.doors ? `,\n      "doors": [\n${f.doors.map((d) => `        ${j(d)}`).join(',\n')}\n      ]` : ''} }`).join(',\n');
  return `{ ${top},\n  "floors": [\n${fl}\n  ],\n  "flights": [${flights.map((f) => `\n    ${j(f)}`).join(',')}${flights.length ? '\n  ' : ''}] }`;
}
$('export').onclick = () => {
  const row = S.row;
  if (!row.name) row.name = `${(KIND_INFO[row.kind]?.[0] ?? row.kind).toUpperCase()}`;
  modal(`<h2>Export</h2><p class="lead">The building as a data row the engine loads (world/authored.js, v${AUTHORED_V}). Paste it into <code>web/src/data/authored.js</code> AUTHORED with a <code>site</code> - a lot id or a world position - and it stands in the Phoenix ring in place of what the generator would put there.</p>
    <div class="grid3"><label class="field"><span>Id</span><input id="xId" value="${row.id}"></label><label class="field"><span>Name</span><input id="xName" value="${row.name}"></label>
    <label class="field"><span>Proof</span><input disabled value="${S.proof.ok ? 'passes' : `${S.proof.problems.length} problems`}"></label></div>
    <div class="tabs" id="xTabs"><button class="pill on" data-x="row">Row (JSON)</button><button class="pill" data-x="js">data/authored.js</button><button class="pill" data-x="seed">Recipe (seed)</button><button class="pill" data-x="game">Place in the game</button></div>
    <div id="xBody"></div>`);
  const sync = () => { row.id = $('xId').value.trim() || row.id; row.name = $('xName').value.trim(); };
  const tab = (x) => {
    sync();
    for (const b of $('xTabs').children) b.classList.toggle('on', b.dataset.x === x);
    if (x === 'game') {
      $('xBody').innerHTML = `<p class="lead">Stands it in the running game now (the <code>author</code> command over the agent bridge): the lots of that ring block it covers are cleared, the chunks there laid out again. Keep it inside a ring block (the dead metro round the island, 470-1400 m out).</p>
        <div class="grid3"><label class="field"><span>x (m, east)</span><input id="gX" type="number" value="598"></label><label class="field"><span>z (m, south)</span><input id="gZ" type="number" value="-682"></label>
        <label class="field"><span>Front</span><select id="gF">${['N', 'E', 'S', 'W'].map((f) => `<option${f === row.front ? ' selected' : ''}>${f}</option>`).join('')}</select></label></div>
        <div class="mfoot"><span class="note" id="gNote">Needs the game open on this server (?agent=1).</span><button class="btn primary" id="gGo">Place it</button></div>`;
      $('gGo').onclick = async () => {
        sync();
        try {
          const res = await (await fetch('/agent/cmd', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ cmd: 'author', args: { row: JSON.stringify(row), x: +$('gX').value, z: +$('gZ').value, front: $('gF').value } }) })).json();
          $('gNote').textContent = res.ok ? `Standing: ${res.id} at (${res.x0}, ${res.z0})-(${res.x1}, ${res.z1}) · proof ${res.proof.ok ? 'passes' : `${res.proof.problems.length} problems`} · teleport x=${res.street.x} z=${res.street.z}` : `Refused: ${res.error}`;
        } catch (e) { $('gNote').textContent = `No game on this server: ${e.message}`; }
      };
      return;
    }
    const text = x === 'row' ? rowText(row) : x === 'js'
      ? `// web/src/data/authored.js - inside AUTHORED = [ ... ]:\n${rowText({ ...row, site: { x: 598, z: -682, front: row.front } }).replace(/^/gm, '  ')},`
      : JSON.stringify({ kind: row.kind, w: S.w, d: S.d, front: S.front, units: S.units, zone: S.zone, seed: S.seed, edited: S.edited }, null, 2);
    $('xBody').innerHTML = `<textarea class="code" id="xText" spellcheck="false" readonly>${text.replace(/</g, '&lt;')}</textarea>
      <div class="mfoot"><span class="note">${x === 'seed' ? 'The recipe regenerates the plan - not the hand edits.' : `${text.length.toLocaleString()} characters`}</span><button class="btn" id="xCopy">Copy</button><button class="btn primary" id="xSave">Download</button></div>`;
    $('xCopy').onclick = async () => { try { await navigator.clipboard.writeText(text); toast('copied'); } catch { $('xText').select(); document.execCommand('copy'); toast('copied'); } };
    $('xSave').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: x === 'js' ? 'text/javascript' : 'application/json' })); a.download = `${row.id}.${x === 'js' ? 'js' : 'json'}`; a.click(); URL.revokeObjectURL(a.href); };
  };
  for (const b of $('xTabs').children) b.onclick = () => tab(b.dataset.x);
  tab('row');
};

// ---- modal, toast ---------------------------------------------------------------------------------------------------
function modal(html) { $('modalBody').innerHTML = html; $('modal').hidden = false; }
function closeModal() { $('modal').hidden = true; }
$('modalX').onclick = closeModal;
$('modal').onclick = (e) => { if (e.target === $('modal')) closeModal(); };
let tt = 0;
function toast(t, bad = false) { const el = $('toast'); el.textContent = t; el.className = `toast${bad ? ' bad' : ''}`; el.hidden = false; clearTimeout(tt); tt = setTimeout(() => (el.hidden = true), 2600); }
addEventListener('resize', () => { plan.fit(S.row); if (!raf) raf = requestAnimationFrame(flush); });

// ---- for agents and screenshots: window.LAB ---------------------------------------------------------------------------
window.LAB = {
  S, ED, rebuild, generate, setFloor, setTool, commit, undo, view, plan,
  set(o) { Object.assign(S, o); if (o.kind && !o.w) { const K = KINDS[S.kind]; S.w = r1((K.w[0] + K.w[1]) / 2); S.d = r1((K.d[0] + K.d[1]) / 2); S.zone = o.zone ?? ZONE_OF[S.kind] ?? 'strip'; S.units = o.units ?? unitsFor(S.kind, S.w); } S.edited = false; footprintUI(); kindsUI(); generate(); return S.proof.ok; },
  row: () => clone(S.row), load(row) { S.row = clone(row); S.k = 0; S.sel = null; S.edited = true; rebuild({ frame: true }); return S.proof; },
  addStorey: (mode = 'copy') => storeyUp(mode),
  proof: () => S.proof,
  // Draw now (a background tab gets no animation frames): the plan, the 3D view, the panels.
  draw() { if (raf) cancelAnimationFrame(raf); raf = 0; want3d = true; flush(); view.controls.update(); view.renderer.render(view.scene, view.camera); return true; },
};

// A state from the address (shareable, and how the docs' screenshots are taken): ?kind=offices&w=32&d=14&front=N&seed=131
// &zone=strip&units=1&storeys=1&storey=copy|open&floor=1&roof=0&cam=top&demo=seal (a room's doorways taken out: the proof
// catches it)&tool=hall
function fromURL() {
  const q = new URLSearchParams(location.search);
  if (![...q.keys()].length) return generate();
  const num = (k) => (q.has(k) ? +q.get(k) : undefined);
  if (q.get('kind') && KINDS[q.get('kind')]) { S.kind = q.get('kind'); const K = KINDS[S.kind]; S.w = r1((K.w[0] + K.w[1]) / 2); S.d = r1((K.d[0] + K.d[1]) / 2); S.zone = ZONE_OF[S.kind] ?? 'strip'; }
  S.w = num('w') ?? S.w; S.d = num('d') ?? S.d; S.front = q.get('front') ?? S.front; S.seed = num('seed') ?? S.seed;
  if (q.get('zone') && ZONES[q.get('zone')]) S.zone = q.get('zone');
  S.units = num('units') ?? unitsFor(S.kind, S.w);
  footprintUI(); kindsUI(); generate();
  for (let i = 0; i < (num('storeys') ?? (q.has('storey') ? 1 : 0)); i++) storeyUp(q.get('storey') ?? 'copy');
  if (q.get('demo') === 'seal') {
    // Take out every doorway into one room (a bedroom or an office by preference): nothing reaches it now.
    const F = S.row.floors[0], T = RING.wall;
    const i = Math.max(0, F.rooms.findIndex((r) => r.type === 'bedroom' || r.type === 'officecell' || r.type === 'classroom'));
    const r = F.rooms[i];
    commit((row) => {
      for (const w of row.floors[0].walls) w.gaps = w.gaps.filter((g) => {
        const touches = w.horizontal ? (Math.abs(w.fixed - (r.z0 - T / 2)) < 0.05 || Math.abs(w.fixed - (r.z1 + T / 2)) < 0.05) && g.at > r.x0 && g.at < r.x1 : (Math.abs(w.fixed - (r.x0 - T / 2)) < 0.05 || Math.abs(w.fixed - (r.x1 + T / 2)) < 0.05) && g.at > r.z0 && g.at < r.z1;
        return !touches;
      });
      row.floors[0].doors = row.floors[0].doors.filter((d) => { const hz = d.side === 'N' || d.side === 'S'; return !(hz ? d.at > r.x0 && d.at < r.x1 : d.at > r.z0 && d.at < r.z1) || d.kind !== 'back'; });
      return null;
    });
    S.sel = { k: 0, room: i };
  }
  if (q.has('floor')) S.k = Math.min(S.row.floors.length - 1, num('floor'));
  if (q.get('roof') === '0') { S.roof = false; for (const c of document.querySelectorAll('#roofSeg button')) c.classList.toggle('on', c.dataset.roof === '0'); }
  if (q.get('cam')) { S.cam = q.get('cam'); for (const c of document.querySelectorAll('#camSeg button')) c.classList.toggle('on', c.dataset.cam === S.cam); }
  if (q.get('tool')) setTool(q.get('tool'));
  rebuild({ frame: true });
}
kindsUI(); footprintUI(); setTool('select'); pinsUI(); fromURL();
