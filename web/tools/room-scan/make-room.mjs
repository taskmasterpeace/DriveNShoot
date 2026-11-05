#!/usr/bin/env node
// ROOM SCAN, one command (docs/design/WEB_ROOM_SCAN.md): a phone scan in, a building row out, and (with --place) the room
// standing in the running game.
//
//   node tools/room-scan/make-room.mjs <scan.glb|.obj|.ply|.usdz> --name "MY LIVING ROOM" [--place lot=R-12.-4.2]
//
// Writes next to the scan: room.json (what the scan was read as), topdown.png (the check picture: white walls, green
// doors, blue windows, red openings, gold furniture), row.json (the authored building row). --place runs the `author`
// command against the game at DL_URL (default http://localhost:3141) and prints the proof.
// Needs Python 3 with trimesh, scipy, shapely, pillow and fast_simplification:  pip install trimesh scipy shapely pillow fast_simplification
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)), web = join(here, '..', '..');
const args = process.argv.slice(2), flag = (k) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : null; };
const scan = args[0];
if (!scan || scan.startsWith('--')) { console.error('usage: make-room.mjs <scan file> --name "MY ROOM" [--place lot=<id> | --place x=<m>,z=<m>]'); process.exit(1); }
const name = flag('name') ?? basename(scan, extname(scan)).toUpperCase();
const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const out = join(dirname(scan), `${slug}-room`);
const run = (cmd, a) => { const r = spawnSync(cmd, a, { stdio: 'inherit', cwd: web }); if (r.status !== 0) process.exit(r.status ?? 1); };

console.log(`1/3 reading the scan (a minute or two for a big one)...`);
run(process.platform === 'win32' ? 'python' : 'python3', ['-P', join(here, 'scan2room.py'), scan, out, '--name', slug]);
console.log(`2/3 making the building row...`);
run(process.execPath, [join(here, 'room2row.mjs'), join(out, 'room.json'), '--out', join(out, 'row.json'), '--id', `scan-${slug}`, '--name', name]);
console.log(`   check picture: ${join(out, 'topdown.png')}`);
const place = flag('place');
if (!place) { console.log(`3/3 skipped (no --place). To stand it in a running game:\n   node tools/dl.mjs author row="$(cat ${join(out, 'row.json')})" lot=R-12.-4.2`); process.exit(0); }
console.log(`3/3 standing it in the game...`);
const where = Object.fromEntries(place.split(',').map((kv) => kv.split('=')));
const row = JSON.stringify(JSON.parse(readFileSync(join(out, 'row.json'), 'utf8')));
const r = spawnSync(process.execPath, [join(web, 'tools', 'dl.mjs'), 'author', `row=${row}`, ...Object.entries(where).map(([k, v]) => `${k}=${v}`)], { cwd: web, encoding: 'utf8' });
let res = null; try { res = JSON.parse(r.stdout); } catch { console.error(r.stdout || r.stderr); process.exit(1); }
if (!res.ok) { console.error(`the game said no: ${res.error}`); process.exit(1); }
console.log(`   stands at ${res.x0},${res.z0} .. ${res.x1},${res.z1}, front door ${res.front}, street point ${res.street.x},${res.street.z}`);
console.log(`   rooms: ${res.rooms.join(', ')}`);
if (res.pieces) console.log(`   scanned furniture standing: ${res.pieces.placed} of ${res.pieces.want} (${res.pieces.kinds.join(', ')})`);
console.log(`   walk-in proof: ${res.proof.ok ? 'every room reached from the front door' : res.proof.problems.join('; ')}`);
console.log(`   go there: node tools/dl.mjs teleport x=${res.street.x} z=${res.street.z}`);
