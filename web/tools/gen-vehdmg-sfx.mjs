#!/usr/bin/env node
// VEHICLES V2, damage feel: makes the vehicle-damage sound pool with ElevenLabs sound generation, once, offline (never at
// play time). Each kind gets a few takes (the audio rotation never plays the same take twice running); loops are asked for
// as seamless loops. MP3 from the API -> mono OGG (ffmpeg) at public/audio/vehdmg/<kind>.<n>.ogg, listed in
// src/data/audio-manifest.json under the set "vehdmg" (lic: elevenlabs-generated, src: the prompt).
//   node tools/gen-vehdmg-sfx.mjs [--only kind] [--force]
// The key is read from ~/.config/mkl/elevenlabs.key and never printed.
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync, unlinkSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'audio', 'vehdmg');
const MANIFEST = join(ROOT, 'src', 'data', 'audio-manifest.json');
const KEY = readFileSync(join(homedir(), '.config', 'mkl', 'elevenlabs.key'), 'utf8').trim();
const args = process.argv.slice(2), only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null, force = args.includes('--force');

// kind: [takes, seconds, loop, prompt]
export const SFX = {
  'tyre.flap': [3, 2.0, true, 'Close recording of a car driving slowly on a completely flat tire, rhythmic flapping rubber slapping the road, steady loop, no music'],
  'rim.scrape': [3, 2.0, true, 'Metal wheel rim grinding and scraping on asphalt as a car drives on a destroyed tire, harsh metallic grinding, steady loop, no music'],
  'bumper.drag': [3, 2.0, true, 'Loose metal car bumper dragging and scraping along the road under a moving car, rattling scraping metal, steady loop, no music'],
  'steam.hiss': [2, 2.5, true, 'Overheated car engine radiator boiling over, loud steady steam hiss with faint bubbling, steady loop, no music'],
  'brake.grind': [3, 1.2, false, 'Worn out car brakes grinding metal on metal as the car slows down, short harsh brake grind and squeal'],
  'engine.misfire': [3, 0.8, false, 'Single car engine misfire, a sputtering cough and a small backfire pop from the exhaust'],
  'tyre.blowout': [2, 1.0, false, 'Car tire blowout while driving, a loud sharp bang followed by rubber flapping'],
};

async function gen(kind, i) {
  const [, secs, loop, prompt] = SFX[kind];
  const ogg = join(OUT, `${kind}.${i}.ogg`);
  if (existsSync(ogg) && !force) return { f: `vehdmg/${kind}.${i}.ogg`, bytes: statSync(ogg).size, kept: true };
  const body = { text: prompt, duration_seconds: secs, prompt_influence: 0.55, ...(loop ? { loop: true } : {}) };
  const r = await fetch('https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128', { method: 'POST', headers: { 'xi-api-key': KEY, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`${kind}.${i}: HTTP ${r.status} ${(await r.text()).slice(0, 160)}`);
  const mp3 = join(tmpdir(), `vehdmg-${kind}-${i}.mp3`);
  writeFileSync(mp3, Buffer.from(await r.arrayBuffer()));
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', mp3, '-ac', '1', '-ar', '32000', '-c:a', 'libvorbis', '-q:a', '3', ogg]);
  unlinkSync(mp3);
  return { f: `vehdmg/${kind}.${i}.ogg`, bytes: statSync(ogg).size, kept: false };
}

mkdirSync(OUT, { recursive: true });
const M = JSON.parse(readFileSync(MANIFEST, 'utf8'));
M.sets.vehdmg ??= {};
for (const [kind, [takes, secs, loop, prompt]] of Object.entries(SFX)) {
  if (only && kind !== only) continue;
  const files = [];
  for (let i = 0; i < takes; i++) {
    const x = await gen(kind, i);
    files.push({ f: x.f, src: `elevenlabs sound-generation: ${prompt}`, lic: 'elevenlabs-generated', at: 0, dur: secs, bytes: x.bytes, ...(loop ? { loop: true } : {}) });
    console.log(`${x.kept ? 'kept' : 'made'} ${x.f} (${x.bytes} bytes)`);
  }
  M.sets.vehdmg[kind] = { mode: 'generated', files };
}
writeFileSync(MANIFEST, JSON.stringify(M, null, 1) + '\n');
console.log('manifest: vehdmg', Object.keys(M.sets.vehdmg).join(', '));
