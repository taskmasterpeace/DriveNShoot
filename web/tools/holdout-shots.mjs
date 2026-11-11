#!/usr/bin/env node
// THE HOLDOUTS' renders (docs/design/WEB_HOLDOUTS.md): a real headless Chrome on the game at 1920x1080 through the game
// camera (the DOM HUD and the Keyholder card are in these, unlike `screenshot`). The wide frame is framed to match
// docs/renders/gap-2026-10-27/target_town_wide.png (a walled town of stacked husks and containers, gate towers, from
// high and to one side). Writes docs/renders/web/holdouts/*.png.
//   DL_URL=http://localhost:3422 node tools/holdout-shots.mjs [--size 1920x1080] [--only 01,02]
// Uses the dev server already up at DL_URL, its own throwaway Chrome profile, and stops exactly what it started (by PID).
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, startHarness, cdp, sleep } from './shard-kit.mjs';

const BASE = process.env.DL_URL ?? 'http://localhost:3141';
const PORT = Number(new URL(BASE).port) || 3141;
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const [W, H] = arg('--size', '1920x1080').split('x').map(Number);
const ONLY = arg('--only', null)?.split(',');
const OUT = join(ROOT, '..', 'docs', 'renders', 'web', 'holdouts');
mkdirSync(OUT, { recursive: true });

const h = await startHarness(PORT, { path: '/?agent=0', width: W, height: H, log: console.log });
const D = await cdp(h);
await D.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
const until = async (expr, ms = 90000) => { for (let t = 0; t < ms; t += 250) { if (await D.eval(`(() => { try { return !!(${expr}); } catch { return false; } })()`)) return true; await sleep(250); } throw new Error(`timed out: ${expr}`); };
const shot = async (name, wait = 900) => { if (ONLY && !ONLY.some((o) => name.startsWith(o))) return; await sleep(wait); const f = join(OUT, `${name}.png`); await D.shot(f); console.log('wrote', f); };
const call = (cmd, args = {}) => D.eval(`(async () => JSON.stringify(await game.api.call(${JSON.stringify(cmd)}, ${JSON.stringify(args)})))()`);
const js = (code) => D.eval(`(async () => JSON.stringify(await (async () => { ${code} })()))()`);
// Stand somewhere, let the town come in, frame the camera (view, boom, pitch), let it settle.
const frame = async (x, z, cam, hour = 9.5) => {
  await call('teleport', { x, z });
  await call('setTime', { hour }); await call('setWeather', { key: 'CLEAR', instant: true });
  await js(`const L = game.holdoutLaw, H = L.holdoutAt(${x}, ${z}, 200); if (H) { const T = game.regions.towns.find((t) => t.H === H); if (!T.live) game.regions.promote(T); } return 1;`);
  await call('step', { seconds: 1.5 });
  if (cam.d > 140) await js(`const m = await import('/src/data/camera.js'); m.CAMERA.foot.dMax = Math.max(m.CAMERA.foot.dMax, ${cam.d}); return 1;`); // a wide frame wants a longer boom than play allows
  await call('camera', { ...cam, settle: true });
  await call('step', { seconds: 0.6 });
};
try {
  await until('window.game && game.holdoutLaw && game.api');
  await sleep(2500);
  await call('start'); await call('god', { on: true });
  await js('game.holdoutLaw.enabled = false; game.zombies.enabled = false; game.raiderTimer = 1e9; if (game.wilds) game.wilds.enabled = false; game.society.director.paused = true; return 1;');
  const T = JSON.parse(await js('return Object.fromEntries(game.holdoutLaw.towns.map((H) => [H.id, { cx: H.cx, cz: H.cz, hw: H.hw, hd: H.hd, gate: (({ x, z, side }) => ({ x, z, side }))(game.holdoutLaw.mainGate(H)) }]));'));
  // 01. The wide frame (target_town_wide.png): Furnace Mile in the Arizona desert, from high to the south-west, the whole
  //     wall of husks and containers and its gate towers in frame.
  { const t = T.furnace_mile; await frame(t.cx - 30, t.cz + 40, { view: 'ANGLED', d: 330, theta: 48 }, 9); await shot('01-wide-furnace-mile', 1500); }
  // 02. Sebastian (Florida) the same way: the water boss's town by the lagoon.
  { const t = T.sebastian; await frame(t.cx, t.cz + 30, { view: 'ANGLED', d: 320, theta: 46 }, 10); await shot('02-wide-sebastian', 1500); }
  // 03. The gate from outside at street level: the gate towers, the wall kit up close, the gatemen in the mouth.
  { const t = T.sebastian, g = t.gate, o = { W: [-1, 0], E: [1, 0], N: [0, -1], S: [0, 1] }[g.side]; await frame(g.x + o[0] * 16, g.z + o[1] * 16, { view: 'ISO', d: 44, yaw: 90 }, 9); await shot('03-gate-sebastian', 1200); }
  // 04. The gate check: stopped at the gate, the HOUSE RULES read (the dialogue panel, its words the subtitles).
  { const t = T.sebastian, g = t.gate, o = { W: [-1, 0], E: [1, 0], N: [0, -1], S: [0, 1] }[g.side];
    await js('game.holdoutLaw.enabled = true; game.holdoutLaw.st = {}; return 1;');
    await call('teleport', { x: g.x + o[0] * 20, z: g.z + o[1] * 20 }); await call('step', { seconds: 0.4 });
    await call('teleport', { x: g.x + o[0] * 3.2, z: g.z + o[1] * 3.2 + 0.4 }); await call('step', { seconds: 0.5 });
    await call('camera', { view: 'ISO', d: 26, yaw: 90, settle: true });
    await js('game.dialogue.shown = game.dialogue.full.length; game.dialogue.textEl.textContent = game.dialogue.full; game.dialogue.choicesEl.style.opacity = 1; return 1;');
    await shot('04-gate-check', 1200);
    const d = JSON.parse(await call('dialogue'));
    const i = d.choices?.findIndex((c) => /^Comply/.test(c.text)) ?? -1;
    if (i >= 0) { await call('choose', { index: i }); await call('choose', { index: 0 }); }
    await js('game.holdoutLaw.enabled = false; return 1;'); }
  // 05. The Keyholder's card on entry (the flag behind it), on Main Street.
  { const t = T.sebastian; await frame(t.cx + 50, t.cz + 4, { view: 'ANGLED', d: 40, theta: 48 }, 11); await js('game.holdoutLaw.card.show(game.holdoutLaw.byId.sebastian, 30); return 1;'); await shot('05-keyholder-card', 1200); }
  // 06. The Swap (the market) and 07. the pit, from the street.
  { const t = T.las_palmas; await js(`const H = game.holdoutLaw.byId.las_palmas, b = H.blocks.find((q) => q.open === 'market'); window.__m = { x: (b.x0 + b.x1) / 2, z: (b.z0 + b.z1) / 2 }; return 1;`);
    const m = JSON.parse(await js('return window.__m;')); await frame(m.x, m.z + 10, { view: 'ANGLED', d: 70, theta: 44 }, 10); await js('game.holdoutLaw.card.hide(); return 1;'); await shot('06-the-swap', 1200); }
  { await js(`const H = game.holdoutLaw.byId.las_palmas, b = H.blocks.find((q) => q.open === 'pit'); window.__m = { x: (b.x0 + b.x1) / 2, z: (b.z0 + b.z1) / 2 }; return 1;`);
    const m = JSON.parse(await js('return window.__m;')); await frame(m.x, m.z + 10, { view: 'ANGLED', d: 70, theta: 44 }, 16); await shot('07-the-pit', 1200); }
  // 09. The wall kit up close: Furnace Mile's south wall from outside (husks stacked, containers, tin, a gate tower).
  { const t = T.furnace_mile; await frame(t.cx + 60, t.cz + t.hd + 16, { view: 'ANGLED', d: 46, theta: 56 }, 9.5); await shot('09-wall-kit', 1500); }
  // 08. Little River (the Broker's town, large) wide at dusk.
  { const t = T.little_river; await frame(t.cx, t.cz + 40, { view: 'ANGLED', d: 380, theta: 46 }, 18.2); await shot('08-wide-little-river-dusk', 1500); }
} finally {
  h.stop();
}
console.log('done');
