#!/usr/bin/env node
// THE CREATOR's proof renders (docs/design/WEB_CREATOR.md): a real headless Chrome on the game (the DOM screen and the
// HUD are in these, unlike `screenshot`), every step of the screen with a worked example, then the made survivor in the
// game. Writes docs/renders/web/creator/*.png.
//   DL_URL=http://localhost:3350 node tools/creator-shots.mjs [--size 1600x900] [--only title,kit]
// Uses the dev server already up at DL_URL (or starts one), its own throwaway Chrome profile, and stops exactly what it
// started (by PID). While it runs its tab is the newest, so the bridge talks to it; the harness tab is back after.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, startHarness, cdp, sleep } from './shard-kit.mjs';

const BASE = process.env.DL_URL ?? 'http://localhost:3141';
const PORT = Number(new URL(BASE).port) || 3141;
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const [W, H] = arg('--size', '1600x900').split('x').map(Number);
const ONLY = arg('--only', '');
const OUT = join(ROOT, '..', 'docs', 'renders', 'web', 'creator');
mkdirSync(OUT, { recursive: true });

const h = await startHarness(PORT, { path: '/?shots=creator', width: W, height: H, log: console.log });
const D = await cdp(h);
await D.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
const until = async (expr, ms = 60000) => { for (let t = 0; t < ms; t += 250) { if (await D.eval(`(() => { try { return !!(${expr}); } catch { return false; } })()`)) return true; await sleep(250); } throw new Error(`timed out: ${expr}`); };
const shot = async (name) => { if (ONLY && !ONLY.split(',').some((k) => name.includes(k))) return; await sleep(700); const f = join(OUT, `${name}.png`); await D.shot(f); console.log('wrote', f); };
try {
  await until('window.game && game.creatorUI && document.querySelector(".title .cr-make")');
  await sleep(1500);
  await shot('00-title');
  // The worked example (WEB_CREATOR.md §4): a Haitian-born mechanic out of Florida.
  await D.eval(`(() => {
    const C = game.creator, U = game.creatorUI;
    U.open({ fromTitle: true });
    C.set({ name: 'Mara Quill', flag: 'HT', state: 'FL', background: 'mechanic',
      look: { build: 'broad', skin: 4, hairStyle: 'mohawk', hair: 7, hat: 0, face: 'goggles', scar: 'cheek', scarStory: 2, shirt: 8, pants: 5, boots: 1, sleeves: 'short' } });
    C.setRank('strength', 4); C.setRank('endurance', 3); C.setRank('wits', 3);
    C.setTrait('tinker', true); C.setTrait('bad_back', true); C.setTrait('sour_face', true);
    U.refresh(); return true; })()`);
  const steps = ['origin', 'background', 'attributes', 'traits', 'look', 'kit'];
  const focus = { origin: 1, background: 4, attributes: 0, traits: 1, look: 6, kit: 0 };
  for (let i = 0; i < steps.length; i++) {
    // the body turned three-quarters to the camera and held there (as a drag holds it), so every step shows its face
    await D.eval(`(() => { const U = game.creatorUI; U.goStep(${i}); U.focus = ${focus[steps[i]]}; U.refresh(); if (U.preview) { U.preview.spin = ${[0.45, 0.62, 0.3, 0.55, 0.38, 0.5][i]}; U.preview.drag = 0; } return true; })()`);
    await shot(`0${i + 1}-${steps[i]}`);
  }
  // BEGIN, into the game: the HUD's flag and name tape, the body in the world.
  await D.eval('(() => { const U = game.creatorUI; if (U.preview) U.preview.drag = null; U.begin(); return true; })()');
  await until('!document.querySelector(".title") && !game.paused');
  await D.eval('(async () => { await game.api.call("teleport", { x: 0, z: -40 }); game.setZoom?.(0); return true; })()');
  await sleep(2500);
  await shot('07-in-game');
  // The world render up close (the game's own screenshot: no HUD), the made body standing in the street.
  if (!ONLY || ONLY.includes('body')) {
    const img = await D.eval('(async () => { const p = game.player; p.face = 0.5; const r = await game.api.call("screenshot", { x: p.x, z: p.z + 1.2, zoom: 7, tilt: 0.55, width: 1280, height: 720 }); return r.image; })()');
    if (img) { const f = join(OUT, '07b-in-game-body.jpg'); writeFileSync(f, Buffer.from(img.split(',')[1], 'base64')); console.log('wrote', f); }
  }
  // The same screen at 1280x720 (the smallest it is laid out for).
  await D.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await D.eval('(() => { const C = game.creator, U = game.creatorUI; C.randomize(4242); U.open({}); U.goStep(3); U.focus = 15; U.refresh(); return true; })()');
  await shot('08-traits-1280x720');
  await D.eval('(() => { const U = game.creatorUI; U.goStep(5); U.refresh(); return true; })()');
  await shot('09-kit-1280x720');
  await D.eval('(() => { game.creatorUI.close(false); return true; })()');
} finally {
  h.stop(); // the Chrome it launched (and a dev server, if it had to start one), by PID
}
console.log('done');
