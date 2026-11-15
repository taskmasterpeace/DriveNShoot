// ENGINE-NEUTRAL DATA TABLES: the loader (docs/design/WEB_DATA_TABLES.md).
//
// A table is a CSV (header row, one key column named `Name`, flat rows) plus a `<Table>.schema.json` beside it. The
// CSV is what Unreal's DataTable importer reads; the schema carries what a CSV cannot: types, units, allowed values,
// which column is the key, and (for this game) where each column lands in the object the three.js game reads.
// Nested values are SEPARATE tables joined by key (a child table has a parent column + an Index), never packed into a
// cell. This file reads both, checks every row against its schema, and rebuilds the game's own object shapes, so a
// data/*.js export can be a thin wrapper over a table.
//
// A bad row is a TableError naming the file and the line: `vehicles/Vehicles.csv:7: Len_m: "abc" is not a float`.
//
// Works in Vite (the CSVs come in as ?raw text via import.meta.glob) and in plain node (tests, tools: fs).

export class TableError extends Error {}

// ---- reading the files ---------------------------------------------------------------------------------------------
let RAW = null;
try { RAW = import.meta.glob('./**/*.{csv,json}', { query: '?raw', import: 'default', eager: true }); } catch { RAW = null; }

function nodeFiles() {
  const P = process.getBuiltinModule, fs = P('node:fs'), path = P('node:path'), url = P('node:url');
  const root = path.dirname(url.fileURLToPath(import.meta.url));
  const out = {};
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) walk(f);
      else if (/\.(csv|json)$/.test(e.name)) out['./' + path.relative(root, f).split(path.sep).join('/')] = fs.readFileSync(f, 'utf8');
    }
  };
  walk(root);
  return out;
}
export function tableFiles() { return RAW ?? (RAW = nodeFiles()); }

// ---- CSV (RFC 4180: quotes, doubled quotes, commas and newlines inside quotes) ------------------------------------
// Returns [{ line, cells }] with `line` the 1-based line the record starts on.
export function parseCsv(text, file = 'table.csv') {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const recs = [];
  let cells = [], cell = '', q = false, line = 1, start = 1, i = 0;
  const end = () => { cells.push(cell); cell = ''; };
  const endRec = () => { end(); if (!(cells.length === 1 && cells[0] === '')) recs.push({ line: start, cells }); cells = []; };
  for (; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else { if (c === '\n') line++; cell += c; }
    } else if (c === '"') {
      if (cell !== '') throw new TableError(`${file}:${line}: a quote in the middle of a cell`);
      q = true;
    } else if (c === ',') end();
    else if (c === '\n') { endRec(); line++; start = line; }
    else if (c === '\r') { /* CRLF: the \n ends the record */ }
    else cell += c;
  }
  if (q) throw new TableError(`${file}:${start}: unterminated quote`);
  if (cell !== '' || cells.length) endRec();
  return recs;
}

// ---- schemas -------------------------------------------------------------------------------------------------------
export const TYPES = ['string', 'float', 'int', 'bool'];
const KEY_RE = /^[A-Za-z0-9_]+$/;

export function checkSchema(s, file = 'schema') {
  const bad = [];
  const need = (c, m) => { if (!c) bad.push(`${file}: ${m}`); };
  need(s && typeof s === 'object', 'not an object');
  if (bad.length) return bad;
  need(typeof s.table === 'string' && KEY_RE.test(s.table), 'table must be a name');
  need(typeof s.family === 'string', 'family');
  need(s.key === 'Name', 'the key column is always `Name`');
  need(typeof s.description === 'string' && s.description.length > 10, 'description');
  need(Array.isArray(s.columns) && s.columns.length > 1, 'columns');
  const names = new Set();
  for (const c of s.columns ?? []) {
    need(typeof c.name === 'string' && KEY_RE.test(c.name), `column name ${JSON.stringify(c.name)}`);
    need(!names.has(c.name), `column ${c.name} twice`); names.add(c.name);
    need(TYPES.includes(c.type), `column ${c.name}: type ${c.type}`);
    if (c.type === 'float' || c.type === 'int') need(typeof c.unit === 'string', `column ${c.name}: a number needs a unit ("" if dimensionless)`);
    need(c.path === null || typeof c.path === 'string', `column ${c.name}: path (null = table-only metadata)`);
    if (c.enum) need(Array.isArray(c.enum) && c.enum.length, `column ${c.name}: enum`);
    if (c.ref) need(c.ref.table && c.ref.column, `column ${c.name}: ref`);
  }
  need(names.has('Name'), 'no Name column');
  need(names.has('Source'), 'no Source column (every row carries one)');
  if (s.parent) {
    need(s.parent.table && names.has(s.parent.column) && names.has(s.parent.orderColumn) && typeof s.parent.path === 'string', 'parent {table, column, orderColumn, path}');
    need(['values', 'rows', 'tuples'].includes(s.parent.kind), 'parent.kind');
  }
  return bad;
}

// ---- loading one table ---------------------------------------------------------------------------------------------
function parseCell(col, raw, where) {
  switch (col.type) {
    case 'string': return raw;
    case 'bool':
      if (raw === 'true') return true;
      if (raw === 'false') return false;
      throw new TableError(`${where}: ${col.name}: ${JSON.stringify(raw)} is not a bool (true|false)`);
    default: {
      const n = raw === 'Infinity' ? Infinity : raw === '-Infinity' ? -Infinity : /^-?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(raw) ? Number(raw) : NaN;
      if (Number.isNaN(n)) throw new TableError(`${where}: ${col.name}: ${JSON.stringify(raw)} is not a ${col.type}`);
      if (col.type === 'int' && !Number.isInteger(n)) throw new TableError(`${where}: ${col.name}: ${raw} is not a whole number (the schema says int)`);
      if (col.min !== undefined && n < col.min) throw new TableError(`${where}: ${col.name}: ${raw} is under the minimum ${col.min}`);
      if (col.max !== undefined && n > col.max) throw new TableError(`${where}: ${col.name}: ${raw} is over the maximum ${col.max}`);
      return n;
    }
  }
}

// -> { schema, file, rows: [{ line, name, cells: {col: parsedValue (absent when empty)} }] }
export function readTable(schema, csvText, file) {
  const recs = parseCsv(csvText, file);
  if (!recs.length) throw new TableError(`${file}:1: empty file (no header)`);
  const head = recs[0].cells, cols = new Map(schema.columns.map((c) => [c.name, c]));
  const dup = head.find((h, i) => head.indexOf(h) !== i);
  if (dup) throw new TableError(`${file}:1: column ${dup} twice`);
  for (const h of head) if (!cols.has(h)) throw new TableError(`${file}:1: column ${h} is not in ${schema.table}.schema.json`);
  for (const c of schema.columns) if (!head.includes(c.name)) throw new TableError(`${file}:1: schema column ${c.name} is missing from the header`);
  const rows = [], seen = new Map();
  for (const r of recs.slice(1)) {
    const where = `${file}:${r.line}`;
    if (r.cells.length !== head.length) throw new TableError(`${where}: ${r.cells.length} cells, the header has ${head.length}`);
    const cells = {};
    head.forEach((h, i) => {
      const col = cols.get(h), raw = r.cells[i];
      if (raw === '') {
        if (col.required || h === 'Name' || h === 'Source') throw new TableError(`${where}: ${h} is required`);
        return;
      }
      const v = parseCell(col, raw, where);
      if (col.enum && !col.enum.includes(v)) throw new TableError(`${where}: ${h}: ${JSON.stringify(v)} is not one of ${col.enum.join('|')}`);
      cells[h] = v;
    });
    const name = cells.Name;
    if (!KEY_RE.test(name)) throw new TableError(`${where}: Name ${JSON.stringify(name)} must be letters, digits and _ only (an Unreal row name)`);
    if (seen.has(name)) throw new TableError(`${where}: Name ${name} already used on line ${seen.get(name)}`);
    seen.set(name, r.line);
    rows.push({ line: r.line, name, cells });
  }
  return { schema, file, rows };
}

// ---- a family: every table in a folder, joined -----------------------------------------------------------------------
const FAMILIES = new Map();

export function loadFamily(family) {
  if (FAMILIES.has(family)) return FAMILIES.get(family);
  const files = tableFiles(), tables = new Map();
  for (const [p, text] of Object.entries(files)) {
    const m = p.match(/^\.\/([^/]+)\/([^/]+)\.schema\.json$/);
    if (!m || m[1] !== family) continue;
    let schema;
    try { schema = JSON.parse(text); } catch (e) { throw new TableError(`${family}/${m[2]}.schema.json: not JSON (${e.message})`); }
    const bad = checkSchema(schema, `${family}/${m[2]}.schema.json`);
    if (bad.length) throw new TableError(bad.join('; '));
    if (schema.table !== m[2] || schema.family !== family) throw new TableError(`${family}/${m[2]}.schema.json: table/family do not match the file name and folder`);
    const csv = files[`./${family}/${m[2]}.csv`];
    if (csv === undefined) throw new TableError(`${family}/${m[2]}.schema.json: no ${m[2]}.csv beside it`);
    tables.set(schema.table, readTable(schema, csv, `${family}/${m[2]}.csv`));
  }
  for (const p of Object.keys(files)) {
    const m = p.match(/^\.\/([^/]+)\/([^/]+)\.csv$/);
    if (m && m[1] === family && !tables.has(m[2])) throw new TableError(`${family}/${m[2]}.csv: no ${m[2]}.schema.json beside it`);
  }
  // references: a ref column names a row that exists
  for (const t of tables.values()) for (const c of t.schema.columns) if (c.ref) {
    const target = tables.get(c.ref.table);
    if (!target) throw new TableError(`${t.file}: ${c.name} refers to table ${c.ref.table}, which is not in ${family}`);
    const keys = new Set(target.rows.map((r) => (c.ref.column === 'Name' ? r.name : r.cells[c.ref.column])));
    for (const r of t.rows) if (r.cells[c.name] !== undefined && !keys.has(r.cells[c.name])) throw new TableError(`${t.file}:${r.line}: ${c.name} ${JSON.stringify(r.cells[c.name])} is not a ${c.ref.table}.${c.ref.column}`);
  }
  for (const t of tables.values()) if (t.schema.parent) {
    const P = tables.get(t.schema.parent.table);
    if (!P) throw new TableError(`${t.file}: parent table ${t.schema.parent.table} is not in ${family}`);
    const keys = new Set(P.rows.map((r) => r.name));
    for (const r of t.rows) if (!keys.has(r.cells[t.schema.parent.column])) throw new TableError(`${t.file}:${r.line}: ${t.schema.parent.column} ${JSON.stringify(r.cells[t.schema.parent.column])} is not a row of ${P.schema.table}`);
  }
  FAMILIES.set(family, tables);
  return tables;
}

// ---- rebuilding the game's objects ---------------------------------------------------------------------------------
function put(obj, segs, v) {
  let o = obj;
  for (let i = 0; i < segs.length - 1; i++) {
    const s = segs[i];
    o = o[s] ??= (/^\d+$/.test(segs[i + 1]) ? [] : {});
  }
  o[segs[segs.length - 1]] = v;
}

function build(tables, name, memo) {
  if (memo.has(name)) return memo.get(name);
  const t = tables.get(name), out = new Map();
  const dataCols = t.schema.columns.filter((c) => c.path);
  const byName = new Map();
  for (const r of t.rows) {
    const row = r.cells;
    let obj;
    if (t.schema.parent?.kind === 'values') obj = row[dataCols[0].name];
    else {
      obj = dataCols.length && /^\d+$/.test(dataCols[0].path.split('.')[0]) ? [] : {};
      for (const c of dataCols) if (row[c.name] !== undefined) put(obj, c.path.split('.'), row[c.name]);
    }
    byName.set(r.name, obj);
    out.set((t.schema.keyAlias && row[t.schema.keyAlias]) || r.name, obj);
  }
  for (const ct of tables.values()) {
    const p = ct.schema.parent;
    if (!p || p.table !== name) continue;
    const kids = build(tables, ct.schema.table, memo).byName, group = new Map();
    for (const r of ct.rows) {
      const owner = r.cells[p.column];
      if (!group.has(owner)) group.set(owner, []);
      group.get(owner).push([r.cells[p.orderColumn], kids.get(r.name)]);
    }
    for (const [owner, obj] of byName) {
      const list = (group.get(owner) ?? []).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
      if (list.length || p.emptyWhenMissing) put(obj, p.path.split('.'), list);
    }
  }
  const res = { out, byName };
  memo.set(name, res);
  return res;
}

// The game's object for every row of a ROOT table, in file order: { [Name]: object }.
export function tableObjects(family, table) {
  const tables = loadFamily(family);
  if (!tables.has(table)) throw new TableError(`${family}/${table}: no such table`);
  if (tables.get(table).schema.parent) throw new TableError(`${family}/${table}: a child table is read through its parent`);
  const out = {};
  for (const [k, v] of build(tables, table, new Map()).out) out[k] = v;
  return out;
}

// Same, with the metadata columns (path null) beside the object: [{ name, obj, meta: { Group, ... } }].
export function tableRows(family, table) {
  const tables = loadFamily(family), t = tables.get(table);
  const objs = build(tables, table, new Map()).byName;
  const meta = t.schema.columns.filter((c) => c.path === null).map((c) => c.name);
  return t.rows.map((r) => ({ name: r.name, obj: objs.get(r.name), meta: Object.fromEntries(meta.filter((m) => r.cells[m] !== undefined).map((m) => [m, r.cells[m]])) }));
}

// One-row tables (the knob sets: DRIVING, HITCH ...): the single row's object.
export function tableOne(family, table, key = 'default') {
  const o = tableObjects(family, table);
  if (!(key in o)) throw new TableError(`${family}/${table}: no row ${key}`);
  return o[key];
}

// Every family folder that has tables: the generator check loads each one.
export function allFamilies() {
  const fams = new Set();
  for (const p of Object.keys(tableFiles())) { const m = p.match(/^\.\/([^/]+)\//); if (m) fams.add(m[1]); }
  return [...fams];
}
