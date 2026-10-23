// THE WORLD FORGE's file side (docs/design/WEB_FORGE.md §3.2): a Vite plugin on the game's own dev server. Every forge
// tab writes DATA ROWS through here; nothing else in the forge touches the disk.
//   GET  /forge/status                 the files: path, bytes, mtime, content hash, row counts; recent writes
//   GET  /forge/data?file=usmap|brush  the file as it is on disk (x-forge-hash: its content hash)
//   POST /forge/patch {file, ops, expect?, force?, who?}
//        applies the ops (src/forge/rows.js: field-preserving) to the file AS IT IS ON DISK, checks it, writes it.
//        expect: {"coll/id": rowHash} for every row the client last saw; a row that changed on disk since is a 409
//        conflict (MapForge's mtime guard, per row) unless force. Returns the new hash, what changed, and the inverse ops.
//   POST /forge/restore {file, raw}    put back an exact earlier text (the selftest's clean-up; undo to a snapshot)
//   GET  /forge/file?path=docs/renders/web/...   read-only reference files (the terrain profile, flora previews)
//   GET  /forge/log                    the last 60 writes (who, file, rows)
// A forge write must not reload the game tab mid-play (or mid-selftest): the plugin marks the files it wrote and tells
// Vite's HMR to skip them; their modules are invalidated, so the next page load reads the new rows. Pushing rows into
// a running game is the page's job (the `forgePush` command, src/forge/live.js).
import { readFileSync, writeFileSync, renameSync, statSync, existsSync } from 'node:fs';
import { join, resolve, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FILES, applyOps, serialize, fnv, checkFile, stampEdits, findRow } from '../src/forge/rows.js';

const WEB = fileURLToPath(new URL('..', import.meta.url));
const REPO = resolve(WEB, '..');
const READONLY = ['docs/renders/web/', 'docs/design/', 'docs/skills/', 'web/public/models/flora/flora.json'];
const norm = (p) => normalize(p).replace(/\\/g, '/').toLowerCase();
// Keep the file's own line ends (a Windows checkout may hand us CRLF): an untouched file must round-trip byte for byte.
const ser = (doc, style, raw) => { const out = serialize(doc, style); return raw?.includes('\r\n') ? out.replace(/\r?\n/g, '\r\n') : out; };

export function forgeIO() {
  const recent = new Map(); // normalized abs path -> ms of our last write
  const log = [];
  let server = null;
  const json = (res, code, body) => { res.statusCode = code; res.setHeader('content-type', 'application/json'); res.setHeader('cache-control', 'no-store'); res.end(JSON.stringify(body)); };
  const readBody = (req) => new Promise((ok) => { let b = ''; req.setEncoding?.('utf8'); req.on('data', (c) => (b += c)); req.on('end', () => { try { ok(b ? JSON.parse(b) : {}); } catch { ok(null); } }); });
  const pathOf = (name) => join(WEB, FILES[name].path);
  const read = (name) => { const p = pathOf(name); const raw = existsSync(p) ? readFileSync(p, 'utf8') : null; return { p, raw, doc: raw ? JSON.parse(raw) : null }; };
  const rowHash = (row) => (row ? fnv(JSON.stringify(row)) : 'none');
  const write = (name, raw) => {
    const p = pathOf(name), tmp = `${p}.forge-tmp`;
    recent.set(norm(p), Date.now());
    writeFileSync(tmp, raw);
    renameSync(tmp, p);
    // Fresh page loads must read the new rows (the watcher would do this too; doing it now closes the race).
    for (const m of server?.moduleGraph.getModulesByFile(p.replace(/\\/g, '/')) ?? []) server.moduleGraph.invalidateModule(m);
    return statSync(p);
  };
  const counts = (doc, spec) => Object.fromEntries(Object.keys(spec.colls).filter((k) => Array.isArray(doc?.[k])).map((k) => [k, doc[k].length]));
  const status = () => Object.fromEntries(Object.entries(FILES).map(([name, spec]) => {
    try {
      const { p, raw, doc } = read(name); if (!raw) return [name, { path: `web/${spec.path}`, missing: true }];
      const st = statSync(p);
      return [name, { path: `web/${spec.path}`, bytes: st.size, mtime: st.mtimeMs, hash: fnv(raw), rows: counts(doc, spec), roundTrips: ser(doc, spec.style, raw) === raw }];
    } catch (e) { return [name, { path: `web/${spec.path}`, error: String(e.message) }]; }
  }));

  return {
    name: 'dsoa-forge-io',
    configureServer(s) {
      server = s;
      s.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url, 'http://x');
        if (!url.pathname.startsWith('/forge/')) return next();
        try {
          if (url.pathname === '/forge/status') return json(res, 200, { ok: true, files: status(), log: log.slice(-12) });
          if (url.pathname === '/forge/log') return json(res, 200, { ok: true, log });
          // The shard's health for the forge's dot (server-side: no CORS to argue with). ?port= (default 3280).
          if (url.pathname === '/forge/shard') {
            const port = Number(url.searchParams.get('port') ?? 3280);
            try { const r = await fetch(`http://localhost:${port}/health`, { signal: AbortSignal.timeout(1200) }); return json(res, 200, { ...(await r.json()), port }); }
            catch { return json(res, 200, { ok: false, port, error: `no shard on :${port} (node tools/shard.mjs start)` }); }
          }
          if (url.pathname === '/forge/data') {
            const name = url.searchParams.get('file') ?? '';
            if (!FILES[name]) return json(res, 400, { ok: false, error: `file must be one of ${Object.keys(FILES).join(', ')}` });
            const { raw } = read(name);
            if (raw === null) return json(res, 404, { ok: false, error: `web/${FILES[name].path} does not exist` });
            res.setHeader('content-type', 'application/json'); res.setHeader('cache-control', 'no-store'); res.setHeader('x-forge-hash', fnv(raw));
            return res.end(raw);
          }
          if (url.pathname === '/forge/file') {
            const rel = (url.searchParams.get('path') ?? '').replace(/\\/g, '/');
            const abs = resolve(REPO, rel);
            if (!READONLY.some((p) => rel.startsWith(p)) || rel.includes('..') || !abs.startsWith(REPO + sep) || !existsSync(abs)) return json(res, 404, { ok: false, error: `not a forge reference file (${READONLY.join(', ')})` });
            const ext = rel.split('.').pop().toLowerCase();
            res.setHeader('content-type', { json: 'application/json', md: 'text/plain; charset=utf-8', png: 'image/png', jpg: 'image/jpeg', svg: 'image/svg+xml' }[ext] ?? 'application/octet-stream');
            res.setHeader('cache-control', 'max-age=60');
            return res.end(readFileSync(abs));
          }
          if (url.pathname === '/forge/patch' && req.method === 'POST') {
            const body = await readBody(req);
            if (!body) return json(res, 400, { ok: false, error: 'body must be JSON: {"file":"usmap","ops":[...]}' });
            const spec = FILES[body.file];
            if (!spec) return json(res, 400, { ok: false, error: `file must be one of ${Object.keys(FILES).join(', ')}` });
            if (!Array.isArray(body.ops) || !body.ops.length) return json(res, 400, { ok: false, error: 'ops: a non-empty list (see src/forge/rows.js)' });
            const { raw, doc } = read(body.file);
            if (!doc) return json(res, 404, { ok: false, error: `web/${spec.path} does not exist` });
            // The per-row conflict guard.
            const conflicts = [];
            for (const [key, h] of Object.entries(body.expect ?? {})) {
              const [coll, ...rest] = key.split('/'), { row } = findRow(doc, coll, rest.join('/'));
              if (rowHash(row) !== h) conflicts.push(key);
            }
            if (conflicts.length && !body.force) return json(res, 409, { ok: false, conflict: true, rows: conflicts, hash: fnv(raw), error: `changed on disk since you opened it: ${conflicts.join(', ')}`, hint: 'reload the rows (or send force=true to write over them)' });
            const r = applyOps(doc, body.ops, spec);
            if (!r.ok) return json(res, 422, { ok: false, error: r.errors.join('; '), applied: 0 });
            const errors = checkFile(body.file, doc);
            if (errors.length) return json(res, 422, { ok: false, error: `the file would not be valid: ${errors.join('; ')}` });
            const when = new Date().toISOString();
            const removed = body.ops.filter((o) => o.op === 'remove').map((o) => ({ coll: o.coll, id: o.id }));
            if (body.file === 'usmap') stampEdits(doc, r.changed.filter((c) => !removed.some((x) => x.coll === c.coll && x.id === c.id)), when, removed);
            if (body.file === 'brush') { doc.version = (doc.version ?? 0) + 1; }
            const out = ser(doc, spec.style, raw);
            const st = write(body.file, out);
            const rows = {};
            for (const c of r.changed) rows[`${c.coll}/${c.id}`] = rowHash(findRow(doc, c.coll, c.id).row);
            log.push({ at: when, who: String(body.who ?? 'forge').slice(0, 40), file: body.file, ops: body.ops.length, rows: Object.keys(rows).slice(0, 20) });
            if (log.length > 60) log.shift();
            return json(res, 200, { ok: true, file: body.file, path: `web/${spec.path}`, hash: fnv(out), bytes: st.size, mtime: st.mtimeMs, applied: r.applied, changed: r.changed, rows, inverse: r.inverse, forced: conflicts.length ? conflicts : undefined });
          }
          if (url.pathname === '/forge/restore' && req.method === 'POST') {
            const body = await readBody(req);
            const spec = FILES[body?.file];
            if (!spec || typeof body.raw !== 'string') return json(res, 400, { ok: false, error: '{file, raw}' });
            let doc; try { doc = JSON.parse(body.raw); } catch { return json(res, 422, { ok: false, error: 'raw is not JSON' }); }
            const errors = checkFile(body.file, doc);
            if (errors.length) return json(res, 422, { ok: false, error: errors.join('; ') });
            const st = write(body.file, body.raw);
            log.push({ at: new Date().toISOString(), who: String(body.who ?? 'forge').slice(0, 40), file: body.file, ops: 0, rows: ['(restored)'] });
            return json(res, 200, { ok: true, hash: fnv(body.raw), bytes: st.size });
          }
          return json(res, 404, { ok: false, error: `no forge route ${url.pathname}` });
        } catch (e) {
          return json(res, 500, { ok: false, error: String(e?.message ?? e) });
        }
      });
    },
    // Our own writes do not hot-reload the game: the forge pushes rows live itself (src/forge/live.js).
    handleHotUpdate(ctx) {
      const t = recent.get(norm(ctx.file));
      if (t && Date.now() - t < 6000) return [];
    },
  };
}
