// One-off MIGRATION helper: turns a legacy JS data object into a CSV + schema (src/data/tables/<family>/).
// After a family is migrated the CSV and the schema are the source of truth; this file only stays so the migration
// can be re-run against the snapshot and so the next family reuses the flattening rules.
//
// Rules (docs/design/WEB_DATA_TABLES.md):
//   scalar        -> a column. Path 'a.b' -> column A_B (+ _unit). `name` -> DisplayName (Name is the key).
//   nested object -> flattened columns.
//   tuple         -> declared in spec.tuples: path 'at' with ['X','Y','Z'] -> At_X, At_Y, At_Z (schema path at.0, at.1 ...).
//   array         -> a CHILD table (Name = <parent>_<i>, <ParentCol>, Index, columns...), joined back by the loader.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const pascal = (s) => s.split('.').map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('_');
const isScalar = (v) => ['number', 'string', 'boolean'].includes(typeof v);
const isPlain = (v) => v && typeof v === 'object' && !Array.isArray(v);
const SUFFIX = { m: 'm', mps: 'mps', mps2: 'mps2', kg: 'kg', t: 't', L: 'L', s: 's', rad: 'rad', radps: 'radps', gh: 'gh', hit_points: 'hp', scrip: 'scrip', per_s: 'per_s' };

export function csvCell(v) {
  if (v === undefined || v === null) return '';
  const s = String(v);
  return /[",\n\r]|^\s|\s$/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

// spec: { family, table, rows: {key: obj}, parentCol, units, descs, tuples, ints, meta: {Group: fn(key,row)}, source: fn(key,row)|string,
//         legacy: 'src/...', description, dir }
export function extract(spec) {
  const tables = new Map(); // name -> { name, parent, cols: Map(name -> {path, vals[], unit, desc}), rows: [] }
  const get = (name, parent) => { if (!tables.has(name)) tables.set(name, { name, parent, cols: new Map(), rows: [] }); return tables.get(name); };
  const unitOf = (T, p) => spec.units?.[`${T}:${p}`] ?? spec.units?.[p];
  const colName = (T, p) => {
    if (p === 'name') return 'DisplayName';
    if (/^\d+$/.test(p)) { const nm = spec.childTuples?.[T]?.[+p]; const u0 = unitOf(T, p); const b = nm ?? `V${p}`; return u0 && SUFFIX[u0] ? `${b}_${SUFFIX[u0]}` : b; }
    const t = spec.tuples?.[`${T}:${p}`] ?? spec.tuples?.[p];
    const m = p.match(/^(.*)\.(\d+)$/);
    let n;
    if (m && (spec.tuples?.[`${T}:${m[1]}`] ?? spec.tuples?.[m[1]])) n = pascal(m[1]) + '_' + (spec.tuples?.[`${T}:${m[1]}`] ?? spec.tuples?.[m[1]])[+m[2]];
    else n = pascal(p);
    void t;
    const u = unitOf(T, p) ?? (m ? unitOf(T, m[1]) : undefined);
    return u && SUFFIX[u] ? `${n}_${SUFFIX[u]}` : n;
  };

  const root = get(spec.table, null);
  const emptyKeys = new Map(); // `${table}|${path}` -> { owners: Set with the key, empties: Set with an empty array }
  const note = (T, path, owner, empty) => {
    const k = `${T}|${path}`; if (!emptyKeys.has(k)) emptyKeys.set(k, { has: new Set(), empty: new Set() });
    emptyKeys.get(k).has.add(owner); if (empty) emptyKeys.get(k).empty.add(owner);
  };
  const childInfo = new Map(); // child table name -> { parentTable, path, kind }

  function fill(T, cells, obj, prefix, owner, source) {
    for (const [k, v] of Object.entries(obj)) {
      if (v === undefined || v === null) continue; // null = absent (an empty cell)
      const path = prefix ? `${prefix}.${k}` : k;
      if (isScalar(v)) { setCell(T, cells, path, v); continue; }
      if (Array.isArray(v)) {
        const tup = spec.tuples?.[`${T.name}:${path}`] ?? spec.tuples?.[path];
        if (tup) { v.forEach((x, i) => setCell(T, cells, `${path}.${i}`, x)); continue; }
        const cname = T.name + pascal(path).replace(/_/g, '');
        note(T.name, path, owner, v.length === 0);
        const C = get(cname, T.name);
        childInfo.set(cname, { parentTable: T.name, path, kind: v.length && v.every(isScalar) ? 'values' : v.length && v.every(Array.isArray) ? 'tuples' : 'rows' });
        v.forEach((el, i) => {
          const ccells = new Map();
          const ci = childInfo.get(cname);
          if (isScalar(el)) setCell(C, ccells, '$', el);
          else if (Array.isArray(el)) el.forEach((x, j) => setCell(C, ccells, String(j), x));
          else fill(C, ccells, el, '', `${owner}_${i}`, source);
          void ci;
          C.rows.push({ name: `${owner}_${i}`, parent: owner, index: i, cells: ccells, source });
        });
        continue;
      }
      if (isPlain(v)) { if (!Object.keys(v).length) throw new Error(`${T.name}.${path}: empty object cannot be a table`); fill(T, cells, v, path, owner, source); continue; }
      throw new Error(`${T.name}.${path}: cannot tabulate ${typeof v}`);
    }
  }
  function setCell(T, cells, path, v) {
    if (!T.cols.has(path)) T.cols.set(path, { path, vals: [], unit: path === '$' ? undefined : (unitOf(T.name, path) ?? unitOf(T.name, path.replace(/\.\d+$/, ''))) });
    T.cols.get(path).vals.push(v);
    cells.set(path, v);
  }

  const safe = (k) => k.replace(/[^A-Za-z0-9_]/g, '_');
  let aliased = false;
  for (const [gameKey, obj] of Object.entries(spec.rows)) {
    const key = safe(gameKey); if (key !== gameKey) aliased = true;
    const cells = new Map();
    const source = typeof spec.source === 'function' ? spec.source(key, obj) : spec.source;
    fill(root, cells, spec.prep ? spec.prep(obj, key) : obj, '', key, source);
    const meta = {};
    for (const [m, fn] of Object.entries(spec.meta ?? {})) meta[m] = fn(key, obj);
    root.rows.push({ name: key, cells, source, meta: { ...meta, ...(key !== gameKey ? { GameKey: gameKey } : {}) } });
  }

  const out = [];
  for (const T of tables.values()) {
    const isChild = !!T.parent, info = childInfo.get(T.name);
    const parentCol = isChild ? (T.parent === spec.table ? spec.parentCol : 'Parent') : null;
    const cols = [];
    cols.push({ name: 'Name', type: 'string', path: null, required: true, description: 'Row key (Unreal row name).' });
    if (isChild) {
      cols.push({ name: parentCol, type: 'string', path: null, required: true, ref: { table: T.parent, column: 'Name' }, description: `The ${T.parent} row this belongs to.` });
      cols.push({ name: 'Index', type: 'int', unit: '', path: null, required: true, min: 0, description: 'Order within the parent (0 first).' });
    }
    for (const m of Object.keys(spec.meta ?? {})) if (!isChild) cols.push({ name: m, type: 'string', path: null, required: true, ...(spec.metaEnum?.[m] ? { enum: spec.metaEnum[m] } : {}), description: spec.metaDesc?.[m] ?? m });
    if (!isChild && aliased) cols.push({ name: 'GameKey', type: 'string', path: null, required: false, description: 'The key the game uses when it is not a safe Unreal row name (Name is the sanitized form).' });
    const used = new Set(cols.map((c) => c.name));
    for (const c of T.cols.values()) {
      let type;
      const t = new Set(c.vals.map((v) => typeof v));
      if (t.size > 1) throw new Error(`${T.name}.${c.path}: mixed types ${[...t]}`);
      const ty = [...t][0];
      type = ty === 'boolean' ? 'bool' : ty === 'string' ? 'string' : (spec.ints?.includes(c.path) || spec.ints?.includes(`${T.name}:${c.path}`)) ? 'int' : 'float';
      let name = c.path === '$' ? 'Value' : colName(T.name, c.path);
      if (used.has(name)) throw new Error(`${T.name}: column ${name} collides (${c.path})`);
      used.add(name);
      const col = { name, type, path: c.path === '$' ? '$' : c.path, required: false };
      if (type === 'float' || type === 'int') col.unit = c.unit ?? '';
      const d = spec.descs?.[`${T.name}:${c.path}`] ?? spec.descs?.[c.path];
      if (d) col.description = d;
      if (type === 'float' || type === 'int') { const mn = Math.min(...c.vals); if (spec.nonneg && mn >= 0 && !c.vals.includes(Infinity)) col.min = 0; }
      col.__vals = c.vals;
      cols.push(col);
    }
    cols.push({ name: 'Source', type: 'string', path: null, required: true, description: 'Where the fact came from: a real source, a doc, or `design` (invented for the game).' });
    // enum for string columns with few distinct values on a big table
    for (const c of cols) { if (c.type === 'string' && c.path && c.__vals && spec.enums?.includes(`${T.name}:${c.path}`)) c.enum = [...new Set(c.__vals)]; }

    // is "required" true: every row of the table has the cell
    for (const c of cols) if (c.__vals) { if (c.__vals.length === T.rows.length && c.path !== '$') c.required = true; delete c.__vals; }

    const schema = {
      $comment: 'Hand-editable. `path` is where the column lands in the game object the three.js code reads (null = table-only metadata); an engine importing the CSV can ignore it. `required: false` + an empty cell = the field is absent.',
      table: T.name, family: spec.family, key: 'Name', rowStruct: `FDsoa${T.name}Row`,
      description: isChild ? `Child table of ${T.parent}: ${spec.childDesc?.[T.name] ?? info.path}. Joined by ${parentCol}, ordered by Index.` : spec.description,
      ...(!isChild && aliased ? { keyAlias: 'GameKey' } : {}),
      legacy: { file: spec.legacy, note: 'migrated from the JS literal; the equality test pins it' },
      columns: cols,
    };
    if (isChild) {
      const owners = emptyKeys.get(`${T.parent}|${info.path}`);
      const parentRows = tables.get(T.parent).rows;
      const emptyWhenMissing = owners.has.size === parentRows.length && owners.empty.size > 0;
      if (owners.empty.size && !emptyWhenMissing) throw new Error(`${T.name}: some parents have [] and some lack the key: resolve by hand`);
      schema.parent = { table: T.parent, column: parentCol, path: info.path, kind: info.kind, orderColumn: 'Index', emptyWhenMissing };
    }
    // the csv
    const header = cols.map((c) => c.name);
    const lines = [header.map(csvCell).join(',')];
    for (const r of T.rows) {
      const row = cols.map((c) => {
        if (c.name === 'Name') return r.name;
        if (c.name === parentCol) return r.parent;
        if (c.name === 'Index') return r.index;
        if (c.name === 'Source') return r.source ?? (typeof spec.source === 'string' ? spec.source : 'design');
        if (c.path === null) return r.meta?.[c.name];
        return r.cells.get(c.path);
      });
      lines.push(row.map(csvCell).join(','));
    }
    out.push({ name: T.name, schema, csv: lines.join('\n') + '\n', rows: T.rows.length });
  }
  return out;
}

export function writeTables(dir, outs) {
  mkdirSync(dir, { recursive: true });
  for (const o of outs) {
    writeFileSync(join(dir, `${o.name}.csv`), o.csv);
    writeFileSync(join(dir, `${o.name}.schema.json`), JSON.stringify(o.schema, null, 2) + '\n');
  }
}
