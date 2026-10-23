// THE ROW LAW (docs/design/WEB_FORGE.md §3.2): every World Forge write is a list of small operations on DATA ROWS, applied
// to the file as it is on disk, touching only the fields an operation names. Unknown fields, unknown rows, unknown
// collections and the file's own meta ride through untouched (MapForge's lesson: a write must never drop what it does
// not understand). Pure: no DOM, no node; the forge server (tools/forge-io.mjs), the forge page and the agent commands
// (src/agent/forgetools.js) all apply the same ops with this module, so an edit means the same thing everywhere.
//
//   { op: 'set',    coll, id, set: {field: value}, unset?: [field] }   merge fields into one row
//   { op: 'vertex', coll, id, i, pt: [x, y], field? }                  move vertex i of a line (or a point row's `pos`)
//   { op: 'insert', coll, id, i, pt: [x, y] }                          insert a vertex before index i
//   { op: 'delete', coll, id, i }                                      delete vertex i (a line keeps at least 2)
//   { op: 'add',    coll, row, at? }                                   append (or insert at index `at`) a new row
//   { op: 'remove', coll, id }                                         delete a row
// applyOps returns the inverse list too (undo is just another patch), and which rows changed.

// The files the forge writes, their collections and how each row is drawn. `geom`: line rows carry `pts`, point rows
// a `pos` (exits also a `dest`). `engine`: who reads the collection in the game today.
export const FILES = {
  usmap: {
    path: 'src/data/usmap.json', style: 'compact', kind: null,
    colls: {
      interstates: { geom: 'line', label: 'Interstate', engine: 'world/worldindex.js (I-10 streams)' },
      roads: { geom: 'line', label: 'County / dirt road', engine: 'map only (P3 road graph)' },
      streets: { geom: 'line', label: 'Town street', engine: 'world/worldindex.js buildTowns' },
      rails: { geom: 'line', label: 'Rail line', engine: 'map only (the travel network)' },
      rivers: { geom: 'line', label: 'River', engine: 'map only (L1 water)' },
      towns: { geom: 'point', label: 'Town / city / holdout', engine: 'world/worldindex.js buildTowns, locate' },
      exits: { geom: 'point', label: 'Exit', engine: 'world/worldindex.js buildExits (I-10)' },
      placements: { geom: 'point', label: 'Building placement', engine: 'world/worldindex.js buildTowns' },
      structures: { geom: null, label: 'Structure profile' },
      exit_archetypes: { geom: null, label: 'Exit archetype' },
    },
  },
  brush: {
    path: 'src/data/brush.json', style: 'rows', kind: 'dsoa-brush',
    colls: { strokes: { geom: 'line', label: 'Brush stroke', engine: 'world/brush.js -> world/chunkgen.js' } },
  },
};
export const fileOf = (name) => FILES[name] ?? null;

const isPt = (p) => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]);
const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const r1 = (v) => Math.round(v * 10) / 10;
export const roundPt = (p) => [r1(p[0]), r1(p[1])];

export function findRow(doc, coll, id) {
  const list = doc?.[coll];
  if (!Array.isArray(list)) return { list: null, i: -1, row: null };
  const i = list.findIndex((r) => r && r.id === id);
  return { list, i, row: i >= 0 ? list[i] : null };
}

// Apply ops to doc IN PLACE. Returns { ok, applied, inverse, changed: [{coll, id}], errors }. Stops at the first bad
// op (the ones before it stay applied: the server applies to a scratch copy and writes only when ok).
export function applyOps(doc, ops, spec = null) {
  const inverse = [], changed = [], errors = [];
  let applied = 0;
  for (const op of ops ?? []) {
    const err = applyOne(doc, op, spec, inverse, changed);
    if (err) { errors.push(`${op?.op ?? '?'} ${op?.coll ?? ''}/${op?.id ?? op?.row?.id ?? ''}: ${err}`); break; }
    applied++;
  }
  inverse.reverse();
  return { ok: !errors.length, applied, inverse, changed, errors };
}

function applyOne(doc, op, spec, inverse, changed) {
  if (!op || typeof op !== 'object') return 'not an op';
  const { coll } = op;
  if (typeof coll !== 'string' || !/^[a-z_][a-z0-9_]*$/i.test(coll)) return 'coll must name a collection';
  if (spec && !spec.colls[coll]) return `unknown collection (this file has: ${Object.keys(spec.colls).join(', ')})`;
  if (op.op === 'add') {
    const row = op.row;
    if (!row || typeof row !== 'object' || typeof row.id !== 'string' || !row.id) return 'row needs a string id';
    if (!Array.isArray(doc[coll])) { if (doc[coll] !== undefined) return 'not a row list'; doc[coll] = []; }
    if (doc[coll].some((r) => r?.id === row.id)) return `id ${row.id} already exists`;
    const at = Number.isInteger(op.at) ? Math.max(0, Math.min(doc[coll].length, op.at)) : doc[coll].length;
    doc[coll].splice(at, 0, clone(row));
    inverse.push({ op: 'remove', coll, id: row.id });
    changed.push({ coll, id: row.id });
    return null;
  }
  const { list, i: ri, row } = findRow(doc, coll, op.id);
  if (!list) return 'no such collection';
  if (!row) return `no row ${op.id}`;
  switch (op.op) {
    case 'remove': {
      list.splice(ri, 1);
      inverse.push({ op: 'add', coll, row: clone(row), at: ri });
      break;
    }
    case 'set': {
      const set = op.set ?? {}, unset = op.unset ?? [];
      if (typeof set !== 'object' || Array.isArray(set)) return 'set must be an object';
      if (Object.prototype.hasOwnProperty.call(set, 'id') && set.id !== row.id) return 'the id is the key: remove and add to rename';
      const back = {}, backUnset = [];
      for (const k of [...Object.keys(set), ...unset]) { if (Object.prototype.hasOwnProperty.call(row, k)) back[k] = clone(row[k]); else backUnset.push(k); }
      for (const [k, v] of Object.entries(set)) row[k] = clone(v);
      for (const k of unset) delete row[k];
      inverse.push({ op: 'set', coll, id: row.id, set: back, unset: backUnset });
      break;
    }
    case 'vertex': {
      if (!isPt(op.pt)) return 'pt must be [x, y]';
      const field = op.field ?? (Array.isArray(row.pts) ? 'pts' : 'pos');
      if (field === 'pts') {
        if (!Array.isArray(row.pts)) return 'row has no pts';
        const i = op.i | 0; if (i < 0 || i >= row.pts.length) return `vertex ${op.i} out of range 0..${row.pts.length - 1}`;
        inverse.push({ op: 'vertex', coll, id: row.id, i, pt: clone(row.pts[i]), field });
        row.pts[i] = [op.pt[0], op.pt[1], ...row.pts[i].slice(2)]; // keep any extra per-vertex numbers (elev)
      } else {
        if (!isPt(row[field])) return `row has no point ${field}`;
        inverse.push({ op: 'vertex', coll, id: row.id, pt: clone(row[field]), field });
        row[field] = [op.pt[0], op.pt[1], ...row[field].slice(2)];
      }
      break;
    }
    case 'insert': {
      if (!isPt(op.pt)) return 'pt must be [x, y]';
      if (!Array.isArray(row.pts)) return 'row has no pts';
      const i = op.i | 0; if (i < 0 || i > row.pts.length) return `index ${op.i} out of range 0..${row.pts.length}`;
      row.pts.splice(i, 0, [op.pt[0], op.pt[1]]);
      inverse.push({ op: 'delete', coll, id: row.id, i });
      break;
    }
    case 'delete': {
      if (!Array.isArray(row.pts)) return 'row has no pts';
      const i = op.i | 0; if (i < 0 || i >= row.pts.length) return `vertex ${op.i} out of range`;
      if (row.pts.length <= 2) return 'a line keeps at least two vertices (remove the row instead)';
      const [old] = row.pts.splice(i, 1);
      inverse.push({ op: 'insert', coll, id: row.id, i, pt: old });
      break;
    }
    default: return `unknown op "${op.op}" (set, vertex, insert, delete, add, remove)`;
  }
  changed.push({ coll, id: row.id });
  return null;
}

// Serialise the way the file was written, so an untouched file round-trips byte for byte:
//   compact - one line (JSON.stringify: tools/import-usmap.mjs's own output)
//   rows    - the top level one key a line, every row of a row list on its own line (git diffs read row by row)
export function serialize(doc, style) {
  if (style === 'compact') return JSON.stringify(doc);
  const keys = Object.keys(doc);
  const lines = keys.map((k, n) => {
    const v = doc[k], tail = n < keys.length - 1 ? ',' : '';
    if (Array.isArray(v) && v.length && v.every((r) => r && typeof r === 'object' && !Array.isArray(r))) {
      return `  ${JSON.stringify(k)}: [\n${v.map((r, i) => `    ${JSON.stringify(r)}${i < v.length - 1 ? ',' : ''}`).join('\n')}\n  ]${tail}`;
    }
    if (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length) {
      const ek = Object.keys(v);
      return `  ${JSON.stringify(k)}: {\n${ek.map((e, i) => `    ${JSON.stringify(e)}: ${JSON.stringify(v[e])}${i < ek.length - 1 ? ',' : ''}`).join('\n')}\n  }${tail}`;
    }
    return `  ${JSON.stringify(k)}: ${JSON.stringify(v)}${tail}`;
  });
  return `{\n${lines.join('\n')}\n}\n`;
}

// FNV-1a over a string: a short content hash for the UI and the conflict guard.
export function fnv(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
}

// Record which rows the forge has authored (tools/import-usmap.mjs carries these over a re-import: authored rows win).
export function stampEdits(doc, changed, when, removed = []) {
  if (!doc.meta || typeof doc.meta !== 'object') return;
  const f = (doc.meta.forge ??= { note: 'Rows the World Forge has edited (web/forge.html). tools/import-usmap.mjs carries them over a re-import.', edits: {} });
  f.edits ??= {};
  for (const c of changed) f.edits[`${c.coll}/${c.id}`] = when;
  for (const c of removed) f.edits[`${c.coll}/${c.id}`] = `removed ${when}`;
  f.writes = (f.writes ?? 0) + 1;
}

// ---- brush rows (src/data/brush.json, docs/design/WEB_FORGE.md §3.4): what a valid stroke is -------------------------
export const BRUSH_LAYERS = ['forest', 'canopy', 'brush', 'ruin', 'rad'];
export const BRUSH_OPS = ['add', 'sub', 'set'];
export function checkStroke(s) {
  const bad = [];
  if (!s || typeof s !== 'object') return ['not a row'];
  if (typeof s.id !== 'string' || !s.id) bad.push('id');
  if (!BRUSH_LAYERS.includes(s.layer)) bad.push(`layer (one of ${BRUSH_LAYERS.join(', ')})`);
  if (!BRUSH_OPS.includes(s.op ?? 'add')) bad.push(`op (one of ${BRUSH_OPS.join(', ')})`);
  if (!(Number.isFinite(s.v) && s.v >= 0 && s.v <= 1)) bad.push('v (0..1)');
  if (!(Number.isFinite(s.r) && s.r > 0 && s.r <= 20000)) bad.push('r (usmap metres, > 0)');
  if (s.soft !== undefined && !(Number.isFinite(s.soft) && s.soft >= 0 && s.soft <= 1)) bad.push('soft (0..1)');
  if (!Array.isArray(s.pts) || !s.pts.length || !s.pts.every(isPt)) bad.push('pts ([[x, y], ...] usmap metres)');
  return bad;
}

// A whole file's structural check (the server runs it before every write; the engine-level checks live in the page).
export function checkFile(name, doc) {
  const spec = FILES[name], errors = [];
  if (!spec) return [`unknown file ${name}`];
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return ['not a JSON object'];
  if (spec.kind && doc.kind !== spec.kind) errors.push(`kind must be ${spec.kind}`);
  for (const [coll, c] of Object.entries(spec.colls)) {
    const list = doc[coll];
    if (list === undefined) continue;
    if (!Array.isArray(list)) { errors.push(`${coll} is not a list`); continue; }
    const seen = new Set();
    for (const r of list) {
      if (!r || typeof r.id !== 'string') { errors.push(`${coll}: a row without an id`); continue; }
      if (seen.has(r.id)) errors.push(`${coll}: duplicate id ${r.id}`);
      seen.add(r.id);
      if (c.geom === 'line' && !(Array.isArray(r.pts) && r.pts.length >= (coll === 'strokes' ? 1 : 2) && r.pts.every(isPt))) errors.push(`${coll}/${r.id}: pts`);
      if (c.geom === 'point' && !isPt(r.pos)) errors.push(`${coll}/${r.id}: pos`);
      if (name === 'brush') for (const b of checkStroke(r)) errors.push(`strokes/${r.id}: ${b}`);
    }
  }
  return errors.slice(0, 40);
}
