#!/usr/bin/env node
// MADE SOUNDS: sound effects generated for the game with the ElevenLabs sound-effects API (Robert, 2026-11-12: "use those
// credits"), for things the studio library has no good take of: the infected pounding a door, a sprinter's scream.
//
//   node tools/audio-make.mjs make [only=<set/kind>]   generate what is missing (raw mp3 kept in --raw), cut to ogg
//   node tools/audio-make.mjs build                    rebuild the ogg files and the manifest from the kept raw takes
//   node tools/audio-make.mjs list                     the rows and which takes exist
//
// Rows: ROWS below (set, kind, n takes, seconds, the prompt). Output: public/audio/<set>/<kind>.<n>.ogg (mono 22.05 kHz
// vorbis, like tools/audio-pick.mjs), src/data/audio-made.json (the same shape as audio-manifest.json; data/audiosets.js
// merges it) and SOUNDS-MADE.md (what was made, from which prompt). The key is read from ~/.config/mkl/elevenlabs.key
// (or ELEVENLABS_API_KEY) and never printed. Raw takes live outside the repo (default N:/assets/audio/made/dsoa).
// No real film, game or brand is named in any prompt (tools/ip-lint.mjs reads this file too).
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`${k}=`)); return a ? a.slice(k.length + 1) : d; };
const RAW = arg('--raw', process.env.DSOA_MADE_RAW ?? 'N:/assets/audio/made/dsoa');
const OUT = join(ROOT, 'public', 'audio');
const MANIFEST = join(ROOT, 'src', 'data', 'audio-made.json');
const FF = process.env.FFMPEG ?? 'ffmpeg';

// set / kind / takes / seconds / gain / the prompt. `v`: one extra phrase per take, so takes differ.
export const ROWS = [
  { set: 'common', kind: 'door.pound.wood', n: 5, dur: 0.6, prompt: 'One single heavy fist blow on a solid wooden house door, heard from inside the room, dry, close, deep thud with a rattle of the frame, no voice, no music', v: ['', 'slightly lower', 'two knuckles and the heel of a hand', 'harder, the latch rattles', 'a shoulder slamming into it'] },
  { set: 'common', kind: 'door.pound.metal', n: 4, dur: 0.6, prompt: 'One single heavy fist blow on a steel fire door, heard from inside, dry, close, a booming metallic clang with a short ring, no voice, no music', v: ['', 'duller', 'harder', 'a body slamming into it'] },
  { set: 'common', kind: 'door.frenzy.wood', n: 3, dur: 2.0, prompt: 'Frantic rapid pounding of two fists on a wooden house door, desperate and violent, uneven rhythm, the door shaking in its frame, heard from inside, dry, no voice, no music', v: ['', 'faster', 'with a scrape of nails between blows'] },
  { set: 'common', kind: 'door.frenzy.metal', n: 2, dur: 2.0, prompt: 'Frantic rapid pounding of two fists on a steel door, violent, uneven rhythm, booming, heard from inside, dry, no voice, no music', v: ['', 'faster'] },
  { set: 'common', kind: 'door.crack', n: 3, dur: 0.9, prompt: 'A wooden door panel cracking and splintering under a blow, sharp dry wood crack, close, no voice, no music', v: ['', 'a longer split', 'a board snapping'] },
  { set: 'common', kind: 'door.break', n: 3, dur: 1.6, prompt: 'A wooden door bursting open off its latch, splintering wood, the door slamming back against a wall, close, violent, no voice, no music', v: ['', 'heavier', 'with debris falling'] },
  { set: 'common', kind: 'door.shut', n: 3, dur: 0.8, prompt: 'A wooden house door pushed shut firmly and the latch clicking, close, dry, no voice, no music', v: ['', 'slammed', 'quietly'] },
  { set: 'sprinter', kind: 'scream', n: 5, dur: 1.6, prompt: 'A feral human scream of rage, raw shredded throat, a sick person who no longer speaks, sudden and close, dry, no words, no music', v: ['', 'a woman', 'a man, hoarse', 'rising in pitch', 'breaking into a rasp'] },
  { set: 'sprinter', kind: 'chase', n: 4, dur: 1.4, prompt: 'A person sprinting and snarling through clenched teeth, ragged fast breath, feral, close, dry, no words, no music', v: ['', 'a woman', 'wet and rasping', 'gasping'] },
  { set: 'sprinter', kind: 'rage', n: 3, dur: 1.2, prompt: 'A short furious human shriek and snarl, thwarted, right behind a closed door, muffled slightly, no words, no music', v: ['', 'a woman', 'hoarse'] },
  { set: 'shambler', kind: 'groan', n: 5, dur: 1.8, prompt: 'A slow low human groan, tired and empty, a sick person exhaling, dry throat, close, no words, no music', v: ['', 'a woman', 'an old man', 'with a wet rattle', 'ending in a sigh'] },
  { set: 'shambler', kind: 'notice', n: 3, dur: 1.2, prompt: 'A dull human moan rising as if noticing something, slow, hungry, close, dry, no words, no music', v: ['', 'a woman', 'hoarse'] },
  { set: 'echo', kind: 'murmur', n: 4, dur: 2.4, prompt: 'A human voice murmuring the same broken half sentence under its breath again and again, flat, absent, like someone talking in their sleep, close, dry, unintelligible, no music', v: ['', 'a woman', 'an old man', 'whispered'] },
  { set: 'echo', kind: 'work', n: 3, dur: 1.0, prompt: 'Fingernails and hands patiently prying at a nailed wooden board, a creak and a small crack of wood, close, dry, no voice, no music', v: ['', 'a nail squealing out', 'a slow creak'] },
];

const key = () => (process.env.ELEVENLABS_API_KEY ?? readFileSync(join(homedir(), '.config', 'mkl', 'elevenlabs.key'), 'utf8')).trim();
const rawOf = (r, i) => join(RAW, r.set, `${r.kind}.${i}.mp3`);
const oggOf = (r, i) => `${r.set}/${r.kind}.${i}.ogg`;
const textOf = (r, i) => (r.v?.[i] ? `${r.prompt}; ${r.v[i]}` : r.prompt);

async function gen(r, i) {
  const res = await fetch('https://api.elevenlabs.io/v1/sound-generation', {
    method: 'POST', headers: { 'xi-api-key': key(), 'content-type': 'application/json' },
    body: JSON.stringify({ text: textOf(r, i), duration_seconds: Math.max(0.5, r.dur), prompt_influence: 0.45 }),
  });
  if (!res.ok) throw new Error(`${r.set}/${r.kind}.${i}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  const f = rawOf(r, i);
  mkdirSync(dirname(f), { recursive: true });
  writeFileSync(f, Buffer.from(await res.arrayBuffer()));
  return f;
}

// mp3 -> trimmed, levelled mono ogg (leading silence off, a short fade so a cut never clicks).
function cut(r, i) {
  const out = join(OUT, oggOf(r, i));
  mkdirSync(dirname(out), { recursive: true });
  const af = `silenceremove=start_periods=1:start_threshold=-45dB,afade=t=out:st=${Math.max(0.1, r.dur - 0.12)}:d=0.12,loudnorm=I=-16:TP=-1.5:LRA=11`;
  const p = spawnSync(FF, ['-y', '-v', 'error', '-i', rawOf(r, i), '-t', String(r.dur + 0.05), '-af', af, '-ac', '1', '-ar', '22050', '-c:a', 'libvorbis', '-q:a', '3', out]);
  if (p.status !== 0) throw new Error(`ffmpeg ${oggOf(r, i)}: ${String(p.stderr).slice(0, 300)}`);
  return statSync(out).size;
}

function build() {
  const sets = {}, lines = [];
  let bytes = 0, files = 0;
  for (const r of ROWS) {
    const list = [];
    for (let i = 0; i < r.n; i++) {
      if (!existsSync(rawOf(r, i))) continue;
      const b = cut(r, i);
      list.push({ f: oggOf(r, i), src: `made/${r.set}/${r.kind}.${i}.mp3`, lic: 'made', at: 0, dur: r.dur, bytes: b });
      lines.push(`| ${oggOf(r, i)} | ${textOf(r, i)} | ${r.dur} |`);
      bytes += b; files++;
    }
    if (list.length) (sets[r.set] ??= {})[r.kind] = { mode: 'shot', files: list };
  }
  writeFileSync(MANIFEST, `${JSON.stringify({ v: 1, note: 'tools/audio-make.mjs writes this (generated sound effects); data/audiosets.js merges it over audio-manifest.json. Files under public/audio/.', sets, bytes }, null, 1)}\n`);
  writeFileSync(join(ROOT, 'SOUNDS-MADE.md'), [
    '# Made sounds (DIVIDED STATES OF AMERICA, web/)', '',
    'Sound effects generated for this game with the ElevenLabs sound-effects API on the studio\'s paid account (commercial use under its terms). Written by `tools/audio-make.mjs build`; do not edit by hand. Raw takes: the NAS, `N:\\assets\\audio\\made\\dsoa\\`. No recording of a real person, film or game was used or named.', '',
    `${files} files, ${Math.round(bytes / 1024)} KB.`, '',
    '| File (public/audio/) | Prompt | Len s |', '|---|---|---:|', ...lines, '',
  ].join('\n'));
  console.log(`built ${files} files, ${Math.round(bytes / 1024)} KB`);
}

const cmd = process.argv[2] ?? 'list';
const only = arg('only', null);
if (cmd === 'list') for (const r of ROWS) console.log(`${r.set}/${r.kind}`.padEnd(28), `${[...Array(r.n).keys()].filter((i) => existsSync(rawOf(r, i))).length}/${r.n}`, `${r.dur}s`);
else if (cmd === 'make') {
  let made = 0;
  for (const r of ROWS) {
    if (only && `${r.set}/${r.kind}` !== only) continue;
    for (let i = 0; i < r.n; i++) { if (existsSync(rawOf(r, i))) continue; await gen(r, i); made++; console.log('made', oggOf(r, i)); }
  }
  console.log(`generated ${made} takes`);
  if (!process.argv.includes('--no-build')) build();
} else if (cmd === 'build') build();
else console.log('make | build | list');
