// THE WORLD FORGE as COMMANDS rows (docs/design/WEB_FORGE.md §3.7): every forge action an agent can take from the shell.
// The forge page (web/forge.html) writes through the same server routes (tools/forge-io.mjs) with the same row ops
// (src/forge/rows.js) and pushes live with the same code (src/forge/live.js), so a click and a command are one thing.
//   forge        what the forge holds: its files, rows, the brush, the open map findings, where the page is
//   forgePatch   any row ops on a forge file (the forge's undo and redo are this with the inverse ops a patch returns)
//   forgePush    the rows on disk into this running game (only the chunks they reach are laid out again)
//   mapEdit      one national-map edit in world metres or usmap metres: move / insert / delete a vertex, add, set, remove
//   mapCheck     the map's findings: dead ends, orphans, unbridged water crossings, and the engine's own warnings
//   brush        the painted layers at a point (and the chunk's counts), or the strokes
//   brushPaint   paint a stroke of forest, canopy, brush, ruin or rad (world metres), or remove one
import USMAP from '../data/usmap.json';
import { STREAM } from '../data/streaming.js';
import { brushField } from '../world/brush.js';
import { toUsmap, toWorld, chunkOf, chunkKey } from '../world/geo.js';
import { FILES, fnv, findRow, BRUSH_LAYERS, BRUSH_OPS } from '../forge/rows.js';
import { checkMap } from '../forge/validate.js';
import { fetchRows, patchRows, pushUsmap, pushBrush, pushSeasons } from '../forge/live.js';
import { rowToWorld, worldToRow } from '../forge/frame.js';

const r1 = (v) => Math.round(v * 10) / 10;
const pt1 = (p) => [r1(p[0]), r1(p[1])];
const rowHash = (row) => (row ? fnv(JSON.stringify(row)) : 'none');
const list = (v) => (v === undefined || v === null || v === '' ? [] : Array.isArray(v) ? v.map(String) : String(v).split(',').map((s) => s.trim()).filter(Boolean));

export function forgetoolsCommands(api, need) {
  const g = api.g;
  const DEV = !!import.meta.env?.DEV;
  const dev = () => need(DEV, 'the World Forge writes files through the dev server (npm run dev / npm run agent); a production build has no disk');
  const json = (v, what) => {
    if (v === undefined || v === null || v === '') return undefined;
    if (typeof v === 'object') return v;
    try { return JSON.parse(v); } catch { need(false, `${what} must be JSON`); }
    return undefined;
  };
  const patch = async (file, ops, { expect, force, push = true, who = 'agent' } = {}) => {
    const r = await patchRows(file, ops, { expect, force, who });
    need(r.ok, `${r.error ?? `HTTP ${r.status}`}${r.conflict ? ` (rows: ${r.rows.join(', ')})` : ''}`);
    const live = push ? (file === 'usmap' ? await pushUsmap(g, Object.keys(r.rows ?? {})) : await pushBrush(g)) : null;
    return { r, live };
  };
  const brushCounts = (L) => (L ? { brush: L.brush ?? null, trees: Object.entries(L.counts ?? {}).filter(([k]) => k.startsWith('fl_')).reduce((s, [, n]) => s + n, 0), shrubs: L.counts?.shrubs ?? 0, glows: L.counts?.glows ?? 0, barrels: L.counts?.barrels ?? 0, hash: L.hash } : null);

  return {
    forge: {
      group: 'forge', desc: 'THE WORLD FORGE (docs/design/WEB_FORGE.md): the unified world editor at /forge.html (tabs MAP, TERRAIN, BRUSH, TOWN, BUILDING, SITE, LIFE, VOICE, OBSERVE). Reports the files it writes (web/src/data/usmap.json, web/src/data/brush.json: bytes, content hash, rows per collection, whether the file round-trips byte for byte), the last writes, the brush (strokes by layer, version, hash) and the map findings (dead ends, orphans, unbridged crossings). Every forge click is one of: forgePatch, forgePush, mapEdit, mapCheck, brush, brushPaint (and terrain, author, the observer\'s rows).',
      args: {},
      run: async () => {
        dev();
        const st = await (await fetch('/forge/status', { cache: 'no-store' })).json();
        const byLayer = {}; for (const s of brushField.data.strokes ?? []) byLayer[s.layer] = (byLayer[s.layer] ?? 0) + 1;
        const { doc } = await fetchRows('usmap');
        const c = checkMap(doc, { K: STREAM.K, engineWarnings: g.streamer.W.warnings });
        return { page: `${location.origin}/forge.html`, files: st.files, lastWrites: st.log, brush: { version: brushField.version, hash: brushField.hash, strokes: brushField.strokes.length, byLayer, layers: BRUSH_LAYERS }, map: c.counts, live: { usmapRows: Object.fromEntries(Object.entries(USMAP).filter(([, v]) => Array.isArray(v) && v[0]?.id).map(([k, v]) => [k, v.length])) } };
      },
    },
    forgePatch: {
      group: 'forge', desc: 'Apply row ops to a World Forge file, field-preserving (src/forge/rows.js: set, vertex, insert, delete, add, remove; usmap metres), checked, written, and pushed into this game (push=false: disk only). expect={"coll/id": rowHash} guards rows against someone else\'s edit since you read them (a conflict refuses unless force=true). Returns the new content hash, the rows changed with their hashes, and the INVERSE ops: send those back to undo.',
      args: { file: { type: 'string', enum: Object.keys(FILES) }, ops: { type: 'string' }, expect: { type: 'string' }, force: { type: 'boolean', default: false }, push: { type: 'boolean', default: true } },
      run: async ({ file, ops, expect, force, push }) => {
        dev();
        need(FILES[file], `file must be one of ${Object.keys(FILES).join(', ')}`);
        const o = json(ops, 'ops'); need(Array.isArray(o) && o.length, 'ops: a JSON list, e.g. [{"op":"set","coll":"towns","id":"elpaso","set":{"name":"EL PASO"}}]');
        const { r, live } = await patch(file, o, { expect: json(expect, 'expect'), force, push });
        return { file, hash: r.hash, bytes: r.bytes, changed: r.changed, rows: r.rows, inverse: r.inverse, live };
      },
    },
    forgePush: {
      group: 'forge', desc: 'Read a World Forge file back from disk into this running game, without a reload: usmap rows go into the module the engine holds and WorldIndex rebuilds the corridor, exits, towns and signs from them; brush rows reload the brush field. Only the chunks the changed rows reach are laid out again (rows=coll/id,... for usmap; none = all). I-10 moved inside the Phoenix ring needs a page reload (the ring buckets it at boot): it says so.',
      args: { file: { type: 'string', enum: ['usmap', 'brush', 'seasons', 'all'], default: 'all' }, rows: { type: 'string' } },
      run: async ({ file, rows }) => {
        dev();
        const out = {};
        if (file === 'usmap' || file === 'all') out.usmap = await pushUsmap(g, rows ? list(rows) : null);
        if (file === 'brush' || file === 'all') out.brush = await pushBrush(g);
        if (file === 'seasons' || file === 'all') out.seasons = await pushSeasons(g);
        return out;
      },
    },
    mapEdit: {
      group: 'forge', desc: 'One edit to the national map (web/src/data/usmap.json, the rows the engine streams), as the World Forge MAP tab makes it: op=move (a vertex i of a line row, or a point row\'s pos / dest with field=), insert (a vertex before i), delete (vertex i), add (row=<json>; x,z set its pos), set (set=<json> merges fields; unset=a,b drops them), remove. Points in WORLD metres (x,z, or dx,dz to nudge; a town\'s streets and slots go through the town\'s own frame, as the engine lays them) or usmap metres (ux,uy). coll: interstates, roads, streets, rails, rivers, towns, exits, placements. Field-preserving: every other field and row is written back as it was. Pushed live (push=false: disk only). Returns the row after, where the point lands in the world, the inverse ops (undo) and the push report.',
      args: { op: { type: 'string', enum: ['move', 'insert', 'delete', 'add', 'set', 'remove'], default: 'move' }, coll: { type: 'string' }, id: { type: 'string' }, i: { type: 'number' }, field: { type: 'string' },
        x: { type: 'number' }, z: { type: 'number' }, dx: { type: 'number' }, dz: { type: 'number' }, ux: { type: 'number' }, uy: { type: 'number' },
        row: { type: 'string' }, set: { type: 'string' }, unset: { type: 'string' }, push: { type: 'boolean', default: true }, force: { type: 'boolean', default: false } },
      run: async ({ op = 'move', coll, id, i, field, x, z, dx, dz, ux, uy, row, set, unset, push, force }) => {
        dev();
        const spec = FILES.usmap.colls;
        need(spec[coll], `coll must be one of ${Object.keys(spec).join(', ')}`);
        const { doc } = await fetchRows('usmap');
        const point = (cur) => {
          if (ux !== undefined || uy !== undefined) { need(Number.isFinite(ux) && Number.isFinite(uy), 'ux and uy together'); return pt1([ux, uy]); }
          if (dx !== undefined || dz !== undefined) { need(cur, 'dx/dz nudge an existing point'); const w = rowToWorld(doc, coll, id, cur); return pt1(worldToRow(doc, coll, id, w[0] + (dx ?? 0), w[1] + (dz ?? 0))); }
          need(Number.isFinite(x) && Number.isFinite(z), 'a point: x,z (world metres), dx,dz (a nudge) or ux,uy (usmap metres)');
          return pt1(worldToRow(doc, coll, id, x, z));
        };
        let ops, expect;
        if (op === 'add') {
          const r = json(row, 'row'); need(r && typeof r.id === 'string', 'row=<json> with an id');
          if (spec[coll].geom === 'point' && !r.pos && Number.isFinite(x)) r.pos = pt1(worldToRow(doc, coll, r.id, x, z));
          ops = [{ op: 'add', coll, row: r }];
          id = r.id;
        } else {
          const { row: cur } = findRow(doc, coll, id);
          need(cur, `no ${coll} row "${id}" (mapCheck and forge list what is there)`);
          if (op === 'move') {
            const f = field ?? (Array.isArray(cur.pts) ? 'pts' : 'pos');
            const was = f === 'pts' ? cur.pts?.[i | 0] : cur[f];
            need(was, f === 'pts' ? `vertex i=${i} out of range 0..${(cur.pts?.length ?? 1) - 1}` : `the row has no ${f}`);
            ops = [{ op: 'vertex', coll, id, i: i | 0, field: f, pt: point(was) }];
          } else if (op === 'insert') {
            need(Array.isArray(cur.pts), 'insert needs a line row (pts)');
            const at = Number.isFinite(i) ? i | 0 : cur.pts.length;
            ops = [{ op: 'insert', coll, id, i: at, pt: point(null) }];
          } else if (op === 'delete') ops = [{ op: 'delete', coll, id, i: i | 0 }];
          else if (op === 'set') ops = [{ op: 'set', coll, id, set: json(set, 'set') ?? {}, unset: list(unset) }];
          else if (op === 'remove') ops = [{ op: 'remove', coll, id }];
          else need(false, `op ${op}`);
          expect = { [`${coll}/${id}`]: rowHash(cur) };
        }
        const { r, live } = await patch('usmap', ops, { expect, force, push });
        const after = (await fetchRows('usmap')).doc;
        const now = findRow(after, coll, id).row;
        const at = now ? (Array.isArray(now.pts) ? now.pts.map((p) => rowToWorld(after, coll, id, p).map(r1)) : now.pos ? rowToWorld(after, coll, id, now.pos).map(r1) : null) : null;
        return { op, coll, id, row: now, world: at, hash: r.hash, inverse: r.inverse, live };
      },
    },
    mapCheck: {
      group: 'forge', desc: 'The national map\'s findings, as the World Forge MAP tab lists them (src/forge/validate.js on the rows on disk): dead ends (an interstate or county road that stops short of any road, town, exit or coast), orphans (a street or placement no town claims, an exit off its highway past the engine\'s 400 m or on a missing highway, a town street network nothing reaches), water crossings (a road over a river or open water, and whether a bridge row covers it: the rivers-and-bridges layer builds them), plus WorldIndex\'s own warnings. kind=deadEnds|orphans|crossings|engine to list one; limit per list. Points come in usmap and world metres.',
      args: { kind: { type: 'string', enum: ['all', 'deadEnds', 'orphans', 'crossings', 'engine'], default: 'all' }, limit: { type: 'number', default: 12 } },
      run: async ({ kind, limit }) => {
        dev();
        const { doc, hash } = await fetchRows('usmap');
        const c = checkMap(doc, { K: STREAM.K, engineWarnings: g.streamer.W.warnings });
        const w = (f) => ({ ...f, world: f.pt ? toWorld(f.pt).map(Math.round) : null });
        const out = { hash, counts: c.counts, ok: c.ok, ms: c.ms };
        for (const k of ['deadEnds', 'orphans', 'crossings']) if (kind === 'all' || kind === k) out[k] = c[k].slice(0, limit).map(w);
        if (kind === 'all' || kind === 'engine') out.engine = c.engine.slice(0, limit);
        return out;
      },
    },
    brush: {
      group: 'forge', desc: 'THE BRUSH (docs/design/WEB_FORGE.md §3.4, web/src/data/brush.json): density painted over the land that the chunk generator reads: forest (tree stems), canopy (crown size, tall trees), brush (undergrowth), ruin (the corridor buildings\' ruined share), rad (radiation: sick ground, dead trees, glowing seeps, leaking drums). No args: the strokes by layer, the version and hash, the knobs and palettes. With x,z: every layer there, the strokes that reach it, and the resident chunk\'s counts (trees, shrubs, glows, drums, its hash). list=true: every stroke.',
      args: { x: { type: 'number' }, z: { type: 'number' }, list: { type: 'boolean', default: false } },
      run: async ({ x, z, list: all }) => {
        const F = brushField;
        if (x !== undefined || z !== undefined) {
          const px = x ?? g.player.x, pz = z ?? g.player.z, v = F.at(px, pz), L = g.streamer.layouts.get(chunkKey(chunkOf(px), chunkOf(pz)));
          return { x: px, z: pz, usmap: toUsmap(px, pz).map(r1), ...Object.fromEntries(Object.entries(v).map(([k, n]) => [k, typeof n === 'number' ? +n.toFixed(3) : n])), chunk: chunkKey(chunkOf(px), chunkOf(pz)), resident: brushCounts(L) };
        }
        const byLayer = {}; for (const s of F.data.strokes ?? []) byLayer[s.layer] = (byLayer[s.layer] ?? 0) + 1;
        return { version: F.version, hash: F.hash, strokes: F.strokes.length, byLayer, knobs: F.knobs, palettes: Object.keys(F.palettes), ...(all ? { rows: F.data.strokes } : {}) };
      },
    },
    brushPaint: {
      group: 'forge', desc: 'Paint one stroke on THE BRUSH (web/src/data/brush.json) as the World Forge BRUSH tab does: layer=forest|canopy|brush|ruin|rad, v 0..1 (default 1), r the brush radius in WORLD metres (default 120), op=add|sub|set, soft 0..1 (how much of r fades), at x,z (world metres; default where you are) or along pts=[[x,z],...] (world). Written field-preserving and pushed live: the chunks it reaches are laid out again, so the trees (or the hot zone) are there at once. Returns the row (usmap metres), the chunks it reaches and their counts before and after. remove=<id> deletes a stroke.',
      args: { layer: { type: 'string', enum: BRUSH_LAYERS }, v: { type: 'number', default: 1 }, r: { type: 'number', default: 120 }, op: { type: 'string', enum: BRUSH_OPS, default: 'add' }, soft: { type: 'number', default: 0.5 },
        x: { type: 'number' }, z: { type: 'number' }, pts: { type: 'string' }, id: { type: 'string' }, note: { type: 'string' }, remove: { type: 'string' }, push: { type: 'boolean', default: true } },
      run: async ({ layer, v, r, op, soft, x, z, pts, id, note, remove, push }) => {
        dev();
        if (remove) {
          const { r: res, live } = await patch('brush', [{ op: 'remove', coll: 'strokes', id: remove }], { push });
          return { removed: remove, hash: res.hash, inverse: res.inverse, live };
        }
        need(BRUSH_LAYERS.includes(layer), `layer must be one of ${BRUSH_LAYERS.join(', ')}`);
        need(r > 0 && r < 60000, 'r: the radius in world metres');
        const wp = json(pts, 'pts') ?? [[x ?? g.player.x, z ?? g.player.z]];
        need(Array.isArray(wp) && wp.every((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1])), 'pts: [[x,z],...] in world metres');
        const row = { id: id ?? `${layer}-${Date.now().toString(36)}`, layer, op, v: +Math.max(0, Math.min(1, v)).toFixed(3), r: r1(r / STREAM.K), soft: +Math.max(0, Math.min(1, soft)).toFixed(2), pts: wp.map((p) => pt1(toUsmap(p[0], p[1]))), ...(note ? { note } : {}) };
        const keys = [...brushField.chunksOf([row])];
        const before = Object.fromEntries(keys.slice(0, 16).map((k) => [k, brushCounts(g.streamer.layouts.get(k))]));
        const { r: res, live } = await patch('brush', [{ op: 'add', coll: 'strokes', row }], { push });
        const after = Object.fromEntries(keys.slice(0, 16).map((k) => [k, brushCounts(g.streamer.layouts.get(k))]));
        return { row, chunks: keys, before, after, hash: res.hash, inverse: res.inverse, live };
      },
    },
  };
}
