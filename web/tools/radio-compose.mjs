#!/usr/bin/env node
// RADIO COMPOSE: the radio stations' music, composed and rendered here (docs/design/WEB_VOICE_STATS.md §3.6).
// Original music made by code - plucked strings (Karplus-Strong), an organ, a bass, a brass section, drums - from a
// seed per track, so a rebuild makes the same songs. Ours outright: no samples, no model, no license to track.
//   node tools/radio-compose.mjs build [--only <station>]   -> public/music/<station>/<n>.ogg + src/data/music-manifest.json
//   node tools/radio-compose.mjs size
import { writeFileSync, readFileSync, mkdirSync, existsSync, readdirSync, statSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = join(HERE, '..');
const OUT = join(WEB, 'public', 'music');
const MANIFEST = join(WEB, 'src', 'data', 'music-manifest.json');
const SR = 32000; // plenty for a car radio; the encoder resamples to 48 kHz Opus
const argv = process.argv.slice(2), cmd = argv[0] ?? 'build';
const only = argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : null;

// ---- a seeded random ---------------------------------------------------------------------------------------------------
const rng = (seed) => { let s = seed >>> 0 || 1; return () => { s = Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) >>> 0; s = (s + 0x6d2b79f5) >>> 0; let t = Math.imul(s ^ (s >>> 13), 0x5bd1e995) >>> 0; return ((t ^ (t >>> 16)) >>> 0) / 4294967296; }; };
const midi = (n) => 440 * 2 ** ((n - 69) / 12);

// ---- instruments (each adds into a stereo buffer L/R at time t seconds) ------------------------------------------------
function pluck(L, R, t, f, dur, vol, pan = 0, bright = 0.5) {
  const n = Math.floor(SR / f), buf = new Float32Array(n), r = rng(Math.floor(t * 1000 + f));
  for (let i = 0; i < n; i++) buf[i] = r() * 2 - 1;
  const start = Math.floor(t * SR), len = Math.floor(dur * SR), damp = 0.4985 + bright * 0.0013;
  let i = 0;
  for (let k = 0; k < len && start + k < L.length; k++) {
    const j = i % n, nx = (i + 1) % n, v = buf[j];
    buf[j] = (buf[j] + buf[nx]) * damp; i++;
    const env = Math.min(1, (len - k) / (SR * 0.05));
    L[start + k] += v * vol * env * (1 - pan) ; R[start + k] += v * vol * env * (1 + pan);
  }
}
function tone(L, R, t, f, dur, vol, { type = 'sine', att = 0.01, rel = 0.1, pan = 0, vib = 0, harm = null, lp = 1 } = {}) {
  const start = Math.floor(t * SR), len = Math.floor(dur * SR);
  let ph = 0, y = 0;
  for (let k = 0; k < len && start + k < L.length; k++) {
    const tt = k / SR, env = Math.min(1, tt / att) * Math.min(1, (dur - tt) / rel);
    ph += (2 * Math.PI * f * (1 + vib * Math.sin(2 * Math.PI * 5.5 * tt))) / SR;
    let v;
    if (harm) { v = 0; for (let h = 0; h < harm.length; h++) v += harm[h] * Math.sin(ph * (h + 1)); }
    else if (type === 'saw') v = ((ph / Math.PI) % 2) - 1;
    else if (type === 'tri') v = 2 * Math.abs(((ph / Math.PI) % 2) - 1) - 1;
    else v = Math.sin(ph);
    y += lp * (v - y); // a one-pole low-pass (lp 1 = open)
    const s = y * vol * env;
    L[start + k] += s * (1 - pan); R[start + k] += s * (1 + pan);
  }
}
function drum(L, R, t, kind, vol, r) {
  const start = Math.floor(t * SR);
  if (kind === 'kick') { let ph = 0; for (let k = 0; k < SR * 0.25 && start + k < L.length; k++) { const tt = k / SR; ph += 2 * Math.PI * (45 + 90 * Math.exp(-tt * 30)) / SR; const v = Math.sin(ph) * Math.exp(-tt * 9) * vol; L[start + k] += v; R[start + k] += v; } return; }
  const len = kind === 'snare' ? 0.18 : kind === 'brush' ? 0.22 : 0.05, decay = kind === 'hat' ? 60 : kind === 'brush' ? 14 : 22;
  let hp = 0, prev = 0;
  for (let k = 0; k < SR * len && start + k < L.length; k++) {
    const tt = k / SR, n = r() * 2 - 1;
    hp = 0.9 * (hp + n - prev); prev = n; // a high-pass for the hat's hiss
    let v = (kind === 'hat' ? hp : n) * Math.exp(-tt * decay) * vol;
    if (kind === 'snare') v += Math.sin(2 * Math.PI * 190 * tt) * Math.exp(-tt * 30) * vol * 0.6;
    L[start + k] += v * 0.9; R[start + k] += v;
  }
}
const ORGAN = [1, 0.5, 0.3, 0.12, 0.08, 0.05];
const BRASS = [1, 0.7, 0.5, 0.35, 0.25, 0.15, 0.1];

// ---- the genres: chords (scale degrees in a key), a groove, the voices -------------------------------------------------
const MAJ = [0, 2, 4, 5, 7, 9, 11], MIN = [0, 2, 3, 5, 7, 8, 10], PENT_MAJ = [0, 2, 4, 7, 9], PENT_MIN = [0, 3, 5, 7, 10];
const triad = (scale, deg) => [0, 2, 4].map((s) => { const i = deg + s; return scale[i % 7] + 12 * Math.floor(i / 7); });
export const GENRES = {
  // Dust country: boom-chick bass, a strummed guitar, a picked lead over the changes, shuffle hats.
  dust: { bpm: [94, 112], scale: MAJ, lead: PENT_MAJ, keys: [43, 45, 40, 38], progs: [[0, 3, 4, 0], [0, 0, 3, 4], [0, 5, 3, 4], [0, 3, 0, 4]], drums: 'shuffle' },
  // Night blues off the relay: minor, slow, an organ under a guitar that takes its time.
  relay: { bpm: [62, 76], scale: MIN, lead: PENT_MIN, keys: [40, 45, 38, 43], progs: [[0, 0, 3, 0, 4, 3, 0, 4], [0, 5, 3, 4], [0, 3, 5, 4]], drums: 'brush', organ: true },
  // The Remnant's march: a brass line over a snare that never stops.
  march: { bpm: [108, 118], scale: MAJ, lead: MAJ, keys: [46, 48, 43], progs: [[0, 3, 4, 0], [0, 4, 0, 4, 3, 4, 0, 0]], drums: 'march', brass: true },
};

function compose(genre, seed, seconds) {
  const G = GENRES[genre], r = rng(seed), pick = (a) => a[Math.floor(r() * a.length)];
  const bpm = G.bpm[0] + r() * (G.bpm[1] - G.bpm[0]), beat = 60 / bpm, bar = beat * 4, key = pick(G.keys), prog = pick(G.progs);
  const bars = Math.max(8, Math.round(seconds / bar)), L = new Float32Array(Math.ceil((bars * bar + 2) * SR)), R = new Float32Array(L.length);
  let leadNote = 2;
  const motif = Array.from({ length: 8 }, () => (r() < 0.25 ? null : Math.floor(r() * 3) - 1)); // a phrase to come back to
  for (let b = 0; b < bars; b++) {
    const t0 = b * bar, deg = prog[b % prog.length], chord = triad(G.scale, deg).map((n) => n + key), root = chord[0];
    const section = Math.floor(b / 8) % 3; // verse, verse, a lift
    // Bass.
    if (genre === 'dust') for (let q = 0; q < 4; q++) tone(L, R, t0 + q * beat, midi(root - 12 + (q % 2 ? 7 : 0)), beat * 0.9, 0.22, { type: 'tri', rel: 0.08, lp: 0.3 });
    else if (genre === 'relay') { tone(L, R, t0, midi(root - 12), beat * 1.9, 0.2, { type: 'tri', lp: 0.2 }); tone(L, R, t0 + beat * 2, midi(root - 12 + (r() < 0.5 ? 7 : 5)), beat * 1.9, 0.18, { type: 'tri', lp: 0.2 }); }
    else for (let q = 0; q < 4; q += 2) tone(L, R, t0 + q * beat, midi(root - 12), beat * 1.6, 0.22, { type: 'tri', lp: 0.25 });
    // Harmony.
    if (genre === 'dust') for (let q = 1; q < 4; q += 2) for (let i = 0; i < 3; i++) pluck(L, R, t0 + q * beat + i * 0.012, midi(chord[i] + 12), beat * 0.9, 0.16, -0.3, 0.6); // the chick
    if (G.organ) for (const n of chord) tone(L, R, t0, midi(n + 12), bar, 0.05, { harm: ORGAN, att: 0.15, rel: 0.3, vib: 0.003, pan: 0.2 });
    if (genre === 'relay') for (let q = 0; q < 8; q++) if (r() < 0.6) pluck(L, R, t0 + q * beat * 0.5, midi(chord[q % 3] + 12), beat * 1.2, 0.12, -0.25, 0.3); // arpeggio
    if (G.brass) for (const n of chord) tone(L, R, t0, midi(n + 12), beat * 1.6, 0.04, { harm: BRASS, att: 0.04, rel: 0.2, lp: 0.35, pan: -0.15 });
    // Lead: a walk on the pentatonic, back to the motif every other bar, quieter in the verses.
    const steps = genre === 'relay' ? 4 : 8, len = bar / steps;
    for (let s = 0; s < steps; s++) {
      if (section === 0 && b % 2 === 0) continue; // room to breathe
      const m = motif[s % motif.length];
      if (m === null && r() < 0.6) continue;
      leadNote = Math.max(0, Math.min(9, leadNote + (b % 2 ? Math.floor(r() * 3) - 1 : m ?? 0)));
      const deg2 = G.lead[leadNote % G.lead.length] + 12 * Math.floor(leadNote / G.lead.length);
      const f = midi(key + 12 + deg2), t = t0 + s * len;
      if (G.brass) tone(L, R, t, f, len * 0.95, 0.07, { harm: BRASS, att: 0.03, rel: 0.06, lp: 0.45, vib: 0.004, pan: 0.2 });
      else pluck(L, R, t, f, len * (genre === 'relay' ? 2 : 1.4), genre === 'relay' ? 0.2 : 0.17, 0.3, 0.8);
    }
    // Drums.
    const dr = rng(seed + b * 31);
    for (let q = 0; q < 4; q++) {
      const t = t0 + q * beat;
      if (G.drums === 'shuffle') { if (q % 2 === 0) drum(L, R, t, 'kick', 0.5, dr); else drum(L, R, t, 'snare', 0.22, dr); drum(L, R, t, 'hat', 0.08, dr); drum(L, R, t + beat * 0.66, 'hat', 0.05, dr); }
      else if (G.drums === 'brush') { if (q === 0) drum(L, R, t, 'kick', 0.35, dr); drum(L, R, t, 'brush', q % 2 ? 0.1 : 0.05, dr); }
      else { if (q % 2 === 0) drum(L, R, t, 'kick', 0.45, dr); drum(L, R, t, 'snare', 0.16, dr); drum(L, R, t + beat * 0.5, 'snare', 0.07, dr); if (q === 3 && b % 4 === 3) for (let k = 1; k < 4; k++) drum(L, R, t + beat * k * 0.25, 'snare', 0.09, dr); }
    }
  }
  // An ending: the last bar rings out.
  return { L, R, bpm: +bpm.toFixed(1), key, bars };
}

// ---- the stations' playlists (data/radio.js names them; this file only makes the music) --------------------------------
const PLAYLISTS = {
  kdst: { genre: 'dust', tracks: 5, seconds: [80, 100] },
  relay: { genre: 'relay', tracks: 4, seconds: [90, 110] },
  remnant: { genre: 'march', tracks: 3, seconds: [60, 75] },
};

function encode(L, R, out) {
  // Normalise to -1 dBFS, soft-clip, interleave 16-bit, and pipe to ffmpeg -> stereo Opus 48 kb/s.
  let pk = 0; for (let i = 0; i < L.length; i++) pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i]));
  const g = 0.89 / Math.max(1e-6, pk), pcm = Buffer.alloc(L.length * 4);
  for (let i = 0; i < L.length; i++) { pcm.writeInt16LE(Math.round(Math.tanh(L[i] * g) * 32767), i * 4); pcm.writeInt16LE(Math.round(Math.tanh(R[i] * g) * 32767), i * 4 + 2); }
  const r = spawnSync(process.env.FFMPEG ?? 'ffmpeg', ['-hide_banner', '-nostdin', '-y', '-f', 's16le', '-ar', String(SR), '-ac', '2', '-i', 'pipe:0', '-af', 'afade=t=in:d=0.5,areverse,afade=t=in:d=2.5,areverse', '-c:a', 'libopus', '-b:a', '48k', out], { input: pcm, maxBuffer: 64 << 20 });
  if (r.status !== 0) throw new Error(String(r.stderr).split('\n').slice(-3).join(' '));
}

function build() {
  const man = existsSync(MANIFEST) && only ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : { v: 1, stations: {} };
  man.note = 'tools/radio-compose.mjs writes this: original music composed by code (ours outright). data/radio.js reads it.';
  for (const [id, P] of Object.entries(PLAYLISTS)) {
    if (only && only !== id) continue;
    const dir = join(OUT, id); mkdirSync(dir, { recursive: true });
    for (const f of readdirSync(dir)) if (f.endsWith('.ogg')) rmSync(join(dir, f));
    const tracks = [];
    for (let n = 0; n < P.tracks; n++) {
      const seed = 1000 * (Object.keys(PLAYLISTS).indexOf(id) + 1) + n * 7 + 3, r = rng(seed);
      const secs = P.seconds[0] + r() * (P.seconds[1] - P.seconds[0]);
      const c = compose(P.genre, seed, secs), out = join(dir, `${n}.ogg`);
      encode(c.L, c.R, out);
      tracks.push({ f: `${id}/${n}.ogg`, dur: +(c.L.length / SR).toFixed(2), bpm: c.bpm, key: c.key, seed, bytes: statSync(out).size });
      console.log(`${id}/${n}.ogg  ${(c.L.length / SR).toFixed(0)} s  ${c.bpm} bpm  ${(statSync(out).size / 1024).toFixed(0)} KB`);
    }
    man.stations[id] = { genre: P.genre, tracks };
  }
  man.bytes = Object.values(man.stations).flatMap((s) => s.tracks).reduce((n, t) => n + t.bytes, 0);
  writeFileSync(MANIFEST, JSON.stringify(man, null, 1));
  console.log(`music: ${(man.bytes / 1048576).toFixed(2)} MB (budget 60)`);
}

if (cmd === 'build') build();
else if (cmd === 'size') { let n = 0; const walk = (d) => { if (!existsSync(d)) return; for (const f of readdirSync(d)) { const p = join(d, f); const s = statSync(p); if (s.isDirectory()) walk(p); else n += s.size; } }; walk(OUT); console.log(JSON.stringify({ mb: +(n / 1048576).toFixed(2), budgetMb: 60 })); }
else console.log('usage: radio-compose.mjs build [--only <station>] | size');
