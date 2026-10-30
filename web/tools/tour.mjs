#!/usr/bin/env node
// THE PHOTO TOUR: a named screenshot of every screen and system in the game, from the real game camera, in a real
// headless Chrome (the DOM HUD and every panel are in these, unlike `screenshot`). Re-run it after each landing and look.
//   DL_URL=http://localhost:3508 node tools/tour.mjs [--only screens,vehicles] [--size 1600x900] [--date 2026-10-29]
//                                                    [--list] [--no-latest]
// Writes docs/tour/<date>/<section>-<name>.jpg, copies the run to docs/tour/latest/ (wiped first), and writes
// INDEX.json (one row per shot: section, name, caption, file, status) and INDEX.md next to the shots. Anything it can't
// reach gets a row with status "skipped" and the reason, never a missing line.
// Safe: a fresh page per section, god mode for staging, it only reads and stages through the existing commands (and the
// panels' own open calls), it never edits game code. It uses the dev server at DL_URL (or starts one), its own throwaway
// Chrome profile, and stops exactly what it started (by PID).
import { mkdirSync, readFileSync, writeFileSync, rmSync, copyFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, startHarness, cdp, sleep, reloadPage } from './shard-kit.mjs';

const BASE = process.env.DL_URL ?? 'http://localhost:3141';
const PORT = Number(new URL(BASE).port) || 3141;
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const [W, H] = arg('--size', '1600x900').split('x').map(Number);
const ONLY = arg('--only', '').split(',').filter(Boolean);
const DATE = arg('--date', new Date().toISOString().slice(0, 10));
const TOUR = join(ROOT, '..', 'docs', 'tour');
const OUT = join(TOUR, DATE);
const LATEST = join(TOUR, 'latest');

// ---- the tour: sections of steps ---------------------------------------------------------------------------------------
// A step is { name, caption, run(t) }: run stages the world (t.call = an agent command, t.ev = JS in the page, t.step =
// advance the sim) and returns nothing; the tour then takes the shot. Throw `new Skip('why')` for a thing it can't reach.
class Skip extends Error {}
const SECTIONS = (await import('./tour-sections.mjs')).default({ Skip });

if (process.argv.includes('--list')) {
  for (const s of SECTIONS) console.log(`${s.id.padEnd(12)} ${s.steps.length} steps  ${s.title}`);
  process.exit(0);
}

mkdirSync(OUT, { recursive: true });
// A re-run of the same day starts clean for the sections it runs; a partial run (--only) keeps the other sections' shots and rows.
const prior = ONLY.length && existsSync(join(OUT, 'INDEX.json')) ? JSON.parse(readFileSync(join(OUT, 'INDEX.json'), 'utf8')).rows.filter((r) => !ONLY.includes(r.section)) : [];
const keep = new Set(prior.map((r) => r.file));
for (const f of existsSync(OUT) ? readdirSync(OUT) : []) if (/^(INDEX\.|[a-z0-9]+-.+\.(png|jpg)$)/.test(f) && !keep.has(f)) rmSync(join(OUT, f));

const h = await startHarness(PORT, { path: '/?agent=0', width: W, height: H, log: console.log });
const D = await cdp(h);
await D.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
// A person's tab keeps its game in browser storage and loads it again on reload (inventory, cash, the made survivor): empty it
// before every new document, so a reload really is a fresh page.
await D.send('Page.addScriptToEvaluateOnNewDocument', { source: 'try { localStorage.clear(); sessionStorage.clear(); } catch (e) {}' });
await D.eval('(() => { try { localStorage.clear(); sessionStorage.clear(); } catch (e) {} return true; })()');
const until = async (expr, ms = 90000) => { for (let t = 0; t < ms; t += 250) { if (await D.eval(`(() => { try { return !!(${expr}); } catch { return false; } })()`)) return true; await sleep(250); } throw new Error(`timed out: ${expr}`); };
// A section may stage away from Central Ave (where Rust Haven's own guards shoot raiders and infected on sight): its commands that
// take a world x,z are moved by the same offset, so the steps are written as if the player stood at (0,-40).
let shift = [0, 0];
const SHIFTED = new Set(['spawn', 'infected', 'horde', 'throw', 'spawnVehicle', 'faunaSpawn', 'gadget', 'fire', 'explode']);
const call = async (cmd, args = {}) => { if ((shift[0] || shift[1]) && SHIFTED.has(cmd) && Number.isFinite(args.x) && Number.isFinite(args.z)) args = { ...args, x: args.x + shift[0], z: args.z + shift[1] }; const r = JSON.parse(await D.eval(`(async () => JSON.stringify(await game.api.call(${JSON.stringify(cmd)}, ${JSON.stringify(args)})))()`)); return r; };
// A command that must work: a refusal ({ok:false}) is a reason the shot can't be had.
const need = async (cmd, args = {}) => { const r = await call(cmd, args); if (r?.ok === false) throw new Skip(`${cmd}: ${r.error ?? r.why ?? 'refused'}`); return r; };
const ev = async (js) => { const r = await D.eval(`(async () => { try { return JSON.stringify({ v: await (async () => { ${js} })() ?? null }); } catch (e) { return JSON.stringify({ err: String(e && e.message || e) }); } })()`); const o = JSON.parse(r); if (o.err) throw new Error(o.err); return o.v; };
const step = (seconds = 1) => call('step', { seconds });

const rows = [...prior];
// JPEG at 80: a tour is about 130 shots and lives in git twice (the dated run and latest/), so a shot stays near 150 KB, not 1.3 MB.
D.shotJpeg = async (file) => { const r = await D.send('Page.captureScreenshot', { format: 'jpeg', quality: 80 }); writeFileSync(file, Buffer.from(r.result.data, 'base64')); return file; };
const t = { call, need, ev, step, sleep, D, until, Skip, W, H, h, reload: null };
// Fresh page: a reload, then start (past the title), god mode, a clear mid-morning, the pistol.
let dirty = false; // the first page load is already pristine: reload only once something has been staged
// A new document by navigation (not the bridge's reload, which needs a game that is already answering): storage is emptied first.
async function load(path) {
  await D.navigate(`${h.base}${path}`);
  await sleep(2000);
  await until('window.game && game.hud && game.api');
  await sleep(1500);
}
async function fresh(opts = {}) {
  // The title screen only stays up without ?agent= (that param starts the game for the harness): the title section loads ?shots=creator.
  if (opts.title) { await load('/?shots=creator'); await until('document.querySelector(".title")'); dirty = true; return; }
  if (dirty) await load('/?agent=0');
  dirty = true;
  await call('start'); await call('god', { on: true });
  await call('setTime', { hour: 10 }); await call('setWeather', { key: 'CLEAR', instant: true });
  await call('teleport', { x: shift[0], z: -40 + shift[1] });
  await call('give', { weapon: 'smg', smg: 128, cash: 500 }); await call('equip', { weapon: 'pistol' });
  await call('item', { give: 'backpack' }); await call('item', { wear: 'backpack' }); // a fresh survivor has no pack: room for the kit the steps hand out
  await step(1.5); await sleep(2500); // the HUD fades in on real time
  const sv = await call('save'); base = sv.save ?? sv;
  baseIds = (await call('exec', { code: 'return { v: game.vehicles.map((v) => v.id), c: game.chars.map((c) => c.id) }' })).value; // the section's baseline, put back after every step
}
t.fresh = fresh;
// Put the world back between steps: close every screen and RESTORE the section's baseline save (spawns, weather, wanted,
// bodies and time all go back), then stand down the kit, the posture and the camera.
let base = null, baseIds = null;
async function tidy() {
  await ev(`try { game.qol?.toggleMap?.(false); game.qol?.toggleMenu?.(false); game.hud?.editor?.hide?.(); game.dialogue?.close?.(); } catch {} return true;`).catch(() => {});
  await call('hudLayout', { action: 'edit', on: false }).catch(() => {});
  for (const p of ['workshop', 'pack', 'sheet', 'crew', 'dialogue', 'travel', 'pause']) await call('panelLayout', { action: 'close', panel: p }).catch(() => {});
  await call('pack', { on: false }).catch(() => {});
  await call('workshop', { action: 'close' }).catch(() => {});
  await call('exitVehicle', {}).catch(() => {});
  await call('prone', { on: false }).catch(() => {}); await call('crouch', { on: false }).catch(() => {});
  for (const slot of ['eyes', 'glass', 'beam', 'ears', 'face']) await call('kit', { off: slot }).catch(() => {});
  if (base) await call('load', { save: base }).catch(() => {});
  if (baseIds) await call('exec', { code: `const kv = new Set(${JSON.stringify(baseIds.v)}), kc = new Set(${JSON.stringify(baseIds.c)});
    for (const v of [...game.vehicles]) if (!kv.has(v.id)) game.vehiclesSys.remove(v);
    for (const c of [...game.chars]) if (c !== game.player && !kc.has(c.id)) game.api.call('remove', { id: c.id });
    return true;` }).catch(() => {});
  await call('setTime', { hour: 10 }).catch(() => {}); await call('setWeather', { key: 'CLEAR', instant: true }).catch(() => {});
  await call('heal', { id: 'c1' }).catch(() => {}); await call('god', { on: true }).catch(() => {});
  await call('teleport', { x: shift[0], z: -40 + shift[1] }).catch(() => {}); await call('zoom', { level: 'STREET' }).catch(() => {});
  await step(1);
}
t.tidy = tidy;

const pad = (n) => String(n).padStart(2, '0');
let seq = prior.length;
async function snap(section, name, caption) {
  await sleep(700);
  const file = `${section.id}-${name}.jpg`;
  await D.shotJpeg(join(OUT, file));
  rows.push({ n: ++seq, section: section.id, name, caption, file, status: 'ok' });
  console.log('  shot', file);
}

try {
  await until('window.game && game.hud && game.api');
  await sleep(1500);
  for (const s of SECTIONS) {
    if (ONLY.length && !ONLY.includes(s.id)) continue;
    console.log(`== ${s.id}: ${s.title}`);
    shift = s.stage ? [s.stage[0], s.stage[1] + 40] : [0, 0];
    try { await fresh({ title: s.title_screen }); } catch (e) { console.log('  fresh failed', e.message); }
    let first = true;
    for (const st of s.steps) {
      if (s.freshEach && !first) try { await fresh(); } catch (e) { console.log('  fresh failed', e.message); }
      first = false;
      try {
        await st.run(t);
        await snap(s, st.name, st.caption);
      } catch (e) {
        const skipped = e instanceof Skip;
        rows.push({ n: ++seq, section: s.id, name: st.name, caption: st.caption, file: null, status: skipped ? 'skipped' : 'failed', reason: String(e.message ?? e) });
        console.log(`  ${skipped ? 'skip' : 'FAIL'} ${s.id}-${st.name}: ${e.message}`);
      }
      await tidy();
    }
  }
} finally {
  h.stop();
}

// ---- the index ----------------------------------------------------------------------------------------------------------
const secs = SECTIONS.filter((s) => rows.some((r) => r.section === s.id));
const index = { date: DATE, size: `${W}x${H}`, shots: rows.filter((r) => r.status === 'ok').length, skipped: rows.filter((r) => r.status !== 'ok').length,
  sections: secs.map((s) => ({ id: s.id, title: s.title, blurb: s.blurb })), rows };
writeFileSync(join(OUT, 'INDEX.json'), JSON.stringify(index, null, 2));
const md = [`# Game tour ${DATE}`, '', `${index.shots} shots, ${index.skipped} not reached, ${W}x${H}, from the real game camera. Re-run: \`DL_URL=http://localhost:3508 node tools/tour.mjs\` (from \`web/\`).`, ''];
for (const s of secs) {
  md.push(`## ${s.title}`, '', s.blurb ?? '', '');
  for (const r of rows.filter((x) => x.section === s.id)) {
    if (r.status === 'ok') md.push(`### ${r.name}`, '', `![${r.name}](${r.file})`, '', r.caption, '');
    else md.push(`### ${r.name} (not captured)`, '', `${r.caption}`, '', `**Not captured:** ${r.reason}`, '');
  }
}
writeFileSync(join(OUT, 'INDEX.md'), md.join('\n'));
if (!process.argv.includes('--no-latest')) {
  mkdirSync(LATEST, { recursive: true });
  for (const f of readdirSync(LATEST)) rmSync(join(LATEST, f), { recursive: true, force: true });
  for (const f of readdirSync(OUT)) if (/\.(jpg|json|md)$/.test(f)) copyFileSync(join(OUT, f), join(LATEST, f));
}
console.log(`\ntour: ${index.shots} shots, ${index.skipped} not reached -> ${OUT}`);
process.exit(0);
