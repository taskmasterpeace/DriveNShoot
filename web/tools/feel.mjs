#!/usr/bin/env node
// THE FEEL REPORT (docs/design/WEB_FEEL.md): runs `feel part=all` against a running game (npm run agent), shoots three
// frame strips from the game camera (a handbrake turn, a slalom, a firefight) and writes
// docs/renders/web/feel/report.md: every number beside its band and its BEFORE (docs/renders/web/feel/baseline.json).
//   node tools/feel.mjs                 numbers + strips + report
//   node tools/feel.mjs --no-strips     numbers + report only
//   node tools/feel.mjs --shots 60      rounds per gun cell (default 40)
//   node tools/feel.mjs --strips-only   reuse last.json's numbers, shoot the strips again
// Env: DL_URL=http://localhost:<port> (default 3141), DL_TAB=<tab id>.
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.env.DL_URL ?? 'http://localhost:3141', TAB = process.env.DL_TAB;
const ROOT = fileURLToPath(new URL('../..', import.meta.url)), OUT = join(ROOT, 'docs/renders/web/feel');
const argv = process.argv.slice(2), flag = (k) => argv.includes(k), opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const SHOTS = Number(opt('--shots', 40));

async function call(cmd, args = {}) {
  for (let tries = 0; ; tries++) { // a busy machine: the tab can miss a poll or reload; wait for it rather than give up
    const r = await fetch(`${BASE}/agent/cmd`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ cmd, args, ...(TAB ? { tab: TAB } : {}) }) });
    const j = await r.json();
    if (j.ok === false && /no game tab/i.test(j.error ?? '') && tries < 20) { await new Promise((res) => setTimeout(res, 3000)); continue; }
    if (j.ok === false) throw new Error(`${cmd}: ${j.error} ${j.hint ?? ''}`);
    return j;
  }
}
async function shot(file) {
  const j = await call('screenshot', { width: 480, height: 270, quality: 0.78 });
  writeFileSync(join(OUT, file), Buffer.from(j.image.split(',')[1], 'base64'));
  return file;
}

// Each strip: a stage, then (control, label) frames - drive/step for the beat, then a picture of where it got to.
const STRIPS = {
  handbrake: [
    ['drive', { throttle: 0, steer: 1, handbrake: true, seconds: 0.2 }, 'pull'], ['drive', { throttle: 0, steer: 1, handbrake: true, seconds: 0.25 }, 'swing'],
    ['drive', { throttle: 0, steer: 1, handbrake: true, seconds: 0.3 }, 'slide'], ['drive', { throttle: 0.6, steer: 0, seconds: 0.25 }, 'let go'],
    ['drive', { throttle: 0.8, steer: 0, seconds: 0.4 }, 'caught'],
  ],
  slalom: [
    ['drive', { throttle: 1, steer: 1, seconds: 0.5 }, 'left'], ['drive', { throttle: 1, steer: -1, seconds: 0.6 }, 'right'],
    ['drive', { throttle: 1, steer: 1, seconds: 0.6 }, 'left'], ['drive', { throttle: 1, steer: -1, seconds: 0.6 }, 'right'], ['drive', { throttle: 1, steer: 0, seconds: 0.5 }, 'out'],
  ],
  firefight: [
    ['step', { seconds: 0.3 }, '0.3 s'], ['step', { seconds: 0.4 }, '0.7 s'], ['step', { seconds: 0.5 }, '1.2 s'], ['step', { seconds: 0.6 }, '1.8 s'], ['step', { seconds: 0.8 }, '2.6 s'],
  ],
};

async function strips() {
  const out = {};
  for (const [scene, frames] of Object.entries(STRIPS)) {
    try {
      const st = await call('feel', { part: 'stage', scene });
      const row = [{ file: await shot(`${scene}-0.jpg`), label: scene === 'firefight' ? 'he sees you' : `${st.speed ?? '?'} m/s` }];
      for (let i = 0; i < frames.length; i++) { const [cmd, a, label] = frames[i]; await call(cmd, a); row.push({ file: await shot(`${scene}-${i + 1}.jpg`), label }); }
      out[scene] = row;
    } catch (e) { out[scene] = { error: String(e.message ?? e) }; }
  }
  try { await call('god', { on: false }); } catch {}
  return out;
}

const f = (v) => (v === null || v === undefined ? '—' : typeof v === 'number' ? String(+v.toFixed(2)) : String(v));
const band = (b) => (b ? `${b[0] ?? '…'}–${b[1] ?? '…'}` : '');
const ba = (b, a) => (b === undefined ? f(a) : f(b) === f(a) ? f(a) : `${f(b)} → **${f(a)}**`);

function report(m, base, S) {
  const B = m.bands, L = [];
  L.push('# FEEL report', '', `Written by \`node tools/feel.mjs\` on ${new Date().toISOString().slice(0, 16).replace('T', ' ')}. Numbers through the real code`,
    '(`feel` command, `web/src/agent/feel-api.js`); bands are rows in `web/src/data/feel.js`; BEFORE is `baseline.json` beside this page.', '');
  L.push(`**Outside a band:** ${m.outside.length ? m.outside.join('; ') : 'nothing'}`, '');
  L.push(`**Rows in force:** steering \`DRIVING.steerRate ${m.rows.steerRate}/s\`, \`steerReturn ${m.rows.steerReturn}/s\`; slide \`DRIVING.slide ${JSON.stringify(m.rows.slide)}\`; sway cap \`SWAY.cap\` (data/survival.js).`, '');
  L.push('## Driving (BEFORE → **AFTER**)', '', '| row | 0-60 s | top m/s | turn r m | steer delay s | corner slip m/s | handbrake slide m/s | swing ° | catch s | rev 5 m/s s | slalom m/s, slip |', '|---|---|---|---|---|---|---|---|---|---|---|');
  for (const [k, r] of Object.entries(m.drive)) {
    if (k === 'surfaces') continue;
    const b = base.drive?.[k] ?? {};
    L.push(`| ${k} | ${ba(b.t060, r.t060)} | ${ba(b.top, r.top)} | ${ba(b.turnRadius, r.turnRadius)} | ${ba(b.steerDelay, r.steerDelay)} | ${ba(b.cornerSlip, r.cornerSlip)} | ${ba(b.hbSlide, r.hbSlide)} | ${ba(b.hbSwing, r.hbSwing)} | ${ba(b.catchT, r.catchT)} | ${f(r.rev5)} | ${f(r.slalomSpeed)}, ${ba(b.slalomSlip, r.slalomSlip)} |`);
  }
  L.push('', `Bands (LAWMAN, sedan): steer delay ${band(B.drive.steerDelay)} s · corner slip ${band(B.drive.cornerSlip)} · handbrake slide ${band(B.drive.hbSlide)} · swing ${band(B.drive.hbSwing)}° · catch ${band(B.drive.catchT)} s. 0-60 per row: ${Object.entries(B.t060).map(([k, b]) => `${k} ${band(b)}`).join(', ')}.`, '');
  L.push('### Surfaces (LAWMAN; data/citygen.js grip rows)', '', '| surface | grip | corner slip | handbrake slide | swing ° | catch s |', '|---|---|---|---|---|---|');
  for (const [k, r] of Object.entries(m.drive.surfaces ?? {})) L.push(`| ${k} | ${r.grip} | ${f(r.cornerSlip)} | ${f(r.hbSlide)} | ${f(r.hbSwing)} | ${f(r.catchT)} |`);
  const CAM = Object.entries(m.camera ?? {}).filter(([k]) => k.startsWith('at'));
  L.push('', '### The camera', '', `On foot (settled, default zoom) the frame reaches **${f(m.camera?.footAcross)} m** across and **${f(m.camera?.footUpDown)} m** up or down the screen from you: a shooter further than that straight above or below you is off screen.`, '',
    'At speed (LAWMAN, flat out): how far ahead of the car the view centres (m), by speed (m/s):', '',
    `| ${CAM.map(([k]) => k.replace('at', '')).join(' | ')} |`, `|${CAM.map(() => '---').join('|')}|`, `| ${CAM.map(([, v]) => f(v)).join(' | ')} |`, '');
  const G = m.guns, bg = base.guns ?? {};
  L.push('## Gunplay (BEFORE → **AFTER**)', '', `Measured for a rested, healthy shooter (the gun's own feel). The live player at this run: sway ×${G.shooter?.sway}, skill ×${G.shooter?.spreadMul}; BEFORE was the live player after a long session (sway ×${bg.shooter?.sway}, skill ×${bg.shooter?.spreadMul}), which is what Robert felt.`, '',
    '| gun | rate s | reload s | mag | hit 5 m | hit 15 m | hit 30 m |', '|---|---|---|---|---|---|---|');
  for (const k of ['pistol', 'smg']) { const r = G[k], b = bg[k] ?? {}; L.push(`| ${k} | ${r.rate} | ${r.reload} | ${r.mag} | ${ba(b.hit5, r.hit5)} | ${ba(b.hit15, r.hit15)} | ${ba(b.hit30, r.hit30)} |`); }
  L.push('', `**The enemy** (an angry Dustwolf with a revolver, 20 m, 12 s): first shot ${f(G.enemy.firstShot)} s · ${G.enemy.shots} shots · ${G.enemy.hits} hit you (${f(G.enemy.hitRate)}) · ${f(G.enemy.onScreen)} of them fired from on screen, **${f(G.enemy.told)}** you could place (on screen, or an edge marker from a near miss or hit).`, '');
  if (S) {
    L.push('## Frame strips (the game camera)', '');
    for (const [scene, row] of Object.entries(S)) {
      if (row.error) { L.push(`**${scene}:** ${row.error}`, ''); continue; }
      L.push(`**${scene}**`, '', `| ${row.map((x) => x.label).join(' | ')} |`, `|${row.map(() => '---').join('|')}|`, `| ${row.map((x) => `![](${x.file})`).join(' | ')} |`, '');
    }
  }
  return L.join('\n') + '\n';
}

mkdirSync(OUT, { recursive: true });
const base = existsSync(join(OUT, 'baseline.json')) ? JSON.parse(readFileSync(join(OUT, 'baseline.json'), 'utf8')) : {};
console.log(`[feel] measuring (${BASE}) ...`);
const m = flag('--strips-only') && existsSync(join(OUT, 'last.json')) ? JSON.parse(readFileSync(join(OUT, 'last.json'), 'utf8')) : await call('feel', { part: 'all', shots: SHOTS });
writeFileSync(join(OUT, 'last.json'), JSON.stringify(m, null, 1));
const S = flag('--no-strips') ? null : (console.log('[feel] strips ...'), await strips());
writeFileSync(join(OUT, 'report.md'), report(m, base, S));
console.log(`[feel] wrote docs/renders/web/feel/report.md · outside a band: ${m.outside.length ? m.outside.join('; ') : 'nothing'}`);
