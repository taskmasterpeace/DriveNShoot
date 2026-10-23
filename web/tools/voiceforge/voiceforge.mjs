#!/usr/bin/env node
// VOICEFORGE: dialogue rows -> voice clips the game plays (docs/design/WEB_VOICE.md §3.3).
//
//   node tools/voiceforge/voiceforge.mjs list                         rows, keys, voices, what is rendered
//   node tools/voiceforge/voiceforge.mjs plan   --batch proof [--provider breeze]   what would render + the cost estimate
//   node tools/voiceforge/voiceforge.mjs render --batch proof --provider breeze --max 40 [--yes]
//   node tools/voiceforge/voiceforge.mjs render --voice okonkwo --key npc.lore --provider gemini --max 1 --yes
//   node tools/voiceforge/voiceforge.mjs check  [--batch proof]       QC every rendered clip again (duration, silence, clipping)
//   node tools/voiceforge/voiceforge.mjs audition --voice okonkwo --provider breeze   design + freeze a Breeze reference
//
// Providers (pick with --provider; the default is breeze, the free self-hosted one):
//   breeze  Breeze TTS 2 on cupcake through mk-gateway (BREEZE_URL, default http://192.168.1.249:8700; Bearer key from
//           the CUPCAKE_GATEWAY_KEY environment variable). Free on our box; research/non-commercial outputs only until the
//           hosted plan renders the ship set (WEB_VOICE.md §6). A voice is designed ONCE (cfg 4, its ledger seed) into
//           refs/<voice>.wav + .ref.txt, then every line is CLONED from that reference (cfg 1, or cfg 4 with the
//           situation's direction): design re-samples identity on every call, the clone keeps it.
//   gemini  google/gemini-3.1-flash-tts on Replicate (REPLICATE_API_TOKEN). About half a cent a line.
//   flite   ffmpeg's built-in flite: robotic, offline, free. A placeholder that proves the pipe; never the cast.
// Keys come from the environment only and are never printed.
//
// The cache: a clip is filed under clipKey(voice, text) (data/voices.js, the same function the game looks it up with)
// and remembers the recipe (provider + the voice's recipe + direction) it was made with. A re-run renders only what is
// new or whose recipe changed. The manifest (public/voice/manifest.json) is written after every clip, so an
// interrupted run resumes where it stopped.
// The budget guard: plan prints the count and a cost estimate; render refuses more than --max (default 40) and will
// not spend money without --yes.
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { LINES, DIRECTION, tokensOf, fillLine } from '../../src/data/dialogue.js';
import { NPCS } from '../../src/data/npcs.js';
import { voiceRow, clipKey, hash32 } from '../../src/data/voices.js';
import { denyHits } from '../ip-terms.mjs';
import { BATCHES } from './batches.mjs';
import { ff, measure, qc, estSec } from './qc.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = join(HERE, '..', '..');
const OUT = join(WEB, 'public', 'voice');
const MANIFEST = join(OUT, 'manifest.json');
const REFS = join(HERE, 'refs');
const TMP = join(tmpdir(), 'voiceforge');
mkdirSync(TMP, { recursive: true });

// ---- args ---------------------------------------------------------------------------------------------------------
const argv = process.argv.slice(2), cmd = argv[0] ?? 'list';
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i < 0 ? d : (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true); };
const PROVIDER = opt('provider', 'breeze');
const MAX = Number(opt('max', 40));
const YES = !!opt('yes', false);

// Cost per line (estimates; WEB_VOICE.md §4). breeze is our own GPU; breeze_hosted is the paid plan at $19/900 min.
const COST = { breeze: () => 0, breeze_hosted: (sec) => (sec / 60) * (19 / 900), gemini: () => 0.005, flite: () => 0 };

// ---- the manifest -------------------------------------------------------------------------------------------------
const loadManifest = () => (existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : { v: 1, note: 'tools/voiceforge/voiceforge.mjs writes this; the game reads it (systems/voice.js)', clips: {} });
const saveManifest = (m) => { mkdirSync(OUT, { recursive: true }); m.updated = new Date().toISOString(); m.provider = [...new Set(Object.values(m.clips).map((c) => c.provider))].join(','); writeFileSync(MANIFEST, JSON.stringify(m, null, 1)); };

// ---- what to render -----------------------------------------------------------------------------------------------
const INSERTS = { you: ['stranger'], dir: ['north', 'east', 'south', 'west', 'north-east', 'north-west', 'south-east', 'south-west'], place: ['Rust Haven', 'the Glass Flats', 'the Old Phoenix ruins'], who: NPCS.map((n) => n.name), n: ['3', '4', '5'], about: ['brother', 'sister', 'friend'] };

// The speaker a voice id stands for, for matching rows: a named npc, or an archetype.
const speakerOf = (voice) => { const n = NPCS.find((x) => x.id === voice); return n ? { npc: n.id, arch: { warden: 'warden', drifter: 'drifter' }[n.faction] ?? 'drifter' } : { npc: null, arch: voice.split('.')[0] }; };
const rowsFor = (key, voice) => {
  const s = speakerOf(voice), mine = (r) => [].concat(r.who);
  const named = LINES.filter((r) => r.key === key && s.npc && mine(r).includes(s.npc));
  if (named.length) return named;
  const arch = LINES.filter((r) => r.key === key && mine(r).includes(s.arch));
  return arch.length ? arch : LINES.filter((r) => r.key === key && mine(r).includes('*'));
};

// A template line rendered with a few inserts: every {token} from INSERTS (or the selector's own), at most `per` each.
function expand(text, inserts = {}, per = 2) {
  const toks = [...new Set(tokensOf(text))];
  let outs = [text];
  for (const t of toks) {
    const vals = (inserts[t] ?? INSERTS[t] ?? []).slice(0, t === 'you' ? 1 : per);
    if (!vals.length) return []; // a token we cannot insert stays text-only in the game
    outs = outs.flatMap((o) => vals.map((v) => fillLine(o, { [t]: v })));
  }
  return outs;
}

// The probe states a dialogue-tree line written as a function is read out of.
const PROBES = [
  { quests: {}, stats: { raiderKills: 0 }, player: { hp: 100, maxHp: 100 }, sky: { label: 'Clear', clock: '12:00' } },
  { quests: { bounty: 'done' }, stats: { raiderKills: 9 }, player: { hp: 40, maxHp: 100 }, sky: { label: 'Clear', clock: '12:00' } },
];
function nodeLines(npcId, nodes) {
  const n = NPCS.find((x) => x.id === npcId);
  const out = [];
  for (const id of nodes) {
    const d = n?.nodes?.[id];
    if (!d) { console.warn(`  ! ${npcId} has no node ${id}`); continue; }
    if (typeof d.text === 'string') { out.push({ text: d.text, key: `npc.${id}`, row: `${npcId}.node.${id}` }); continue; }
    for (const g of PROBES) { try { const t = d.text(g); if (typeof t === 'string' && !/\d/.test(t)) out.push({ text: t, key: `npc.${id}`, row: `${npcId}.node.${id}` }); } catch { /* a probe the line needs more of */ } }
  }
  return out;
}

function jobsFor(sel) {
  const voice = sel.voice, row = voiceRow(voice, NPCS);
  if (!row) { console.warn(`  ! no voice row for ${voice}`); return []; }
  let lines = [];
  if (sel.nodes) lines = nodeLines(voice, sel.nodes);
  else if (sel.text) lines = [{ text: sel.text, key: sel.key ?? 'text', row: 'text' }];
  else if (sel.key) {
    const vars = rowsFor(sel.key, voice).flatMap((r) => r.lines.map((t) => ({ t, r }))).slice(0, sel.take ?? 99);
    for (const { t, r } of vars) for (const text of expand(t, sel.inserts, sel.per ?? 2)) lines.push({ text, key: sel.key, row: r.id, direction: r.direction });
  }
  const seen = new Set();
  return lines.filter((l) => !seen.has(l.text) && seen.add(l.text)).map((l) => ({ ...l, voice, direction: l.direction ?? DIRECTION[l.key]?.direction ?? null, vrow: row }));
}

function selection() {
  if (opt('batch')) { const b = BATCHES[opt('batch')]; if (!b) { console.error(`no batch ${opt('batch')} (have: ${Object.keys(BATCHES).join(', ')})`); process.exit(1); } return b.flatMap(jobsFor); }
  if (opt('voice')) {
    const v = opt('voice'), k = opt('key'), t = opt('text');
    if (k?.startsWith?.('npc.')) return jobsFor({ voice: v, nodes: [k.slice(4)] });
    return jobsFor({ voice: v, key: k, text: t, take: Number(opt('take', 99)) });
  }
  console.error('choose --batch <name> or --voice <id> [--key <key> | --text "<line>"]'); process.exit(1);
}

// The recipe a clip is made with: change any of it and the line renders again.
const recipeOf = (j, provider) => hash32(JSON.stringify([provider, j.vrow[provider === 'breeze_hosted' ? 'breeze' : provider] ?? null, j.direction])).toString(16);
const fileFor = (j) => `clips/${j.voice}/${clipKey(j.voice, j.text)}.mp3`;

// ---- audio: decode, measure (tools/voiceforge/qc.mjs), finish ---------------------------------------------------------
// Trim the ends, level the loudness, encode the clip the game loads (mono mp3, 24 kHz).
function finish(rawWav, outMp3) {
  mkdirSync(dirname(outMp3), { recursive: true });
  ff(['-i', rawWav, '-af', 'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.08,areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.12,areverse,loudnorm=I=-18:TP=-2:LRA=11', '-ar', '24000', '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '64k', outMp3]);
}

// ---- providers ----------------------------------------------------------------------------------------------------
const env = (k) => process.env[k] || null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const AUDITION = 'Out here you learn to listen before you talk. The road takes what it wants, and the rest of us make do with what is left. I have buried friends and I have buried enemies, and I still do not know which hurt more. So sit down, drink something, and tell me where you are headed.';

const breeze = {
  base: () => env('BREEZE_URL') ?? 'http://192.168.1.249:8700',
  headers() {
    const k = env('CUPCAKE_GATEWAY_KEY');
    if (!k) throw new Error('breeze: set CUPCAKE_GATEWAY_KEY in the environment (the cupcake mk-gateway Bearer key); nothing was rendered');
    return { 'content-type': 'application/json', authorization: `Bearer ${k}` };
  },
  // The gateway is single-concurrency and a video render can hold the GPU: wait for running:false && queue_depth:0.
  async free(maxWaitS = 600) {
    for (let t = 0; t < maxWaitS; t += 10) {
      try { const h = await (await fetch(`${this.base()}/v1/health`)).json(); if (!h.running && !h.queue_depth) return true; process.stdout.write(t ? '.' : '  waiting for the GPU (a render owns it)'); } catch (e) { throw new Error(`breeze: gateway unreachable (${e.message})`); }
      await sleep(10000);
    }
    throw new Error('breeze: the GPU stayed busy');
  },
  async post(path, body) {
    for (let tries = 0; tries < 6; tries++) {
      await this.free();
      const r = await fetch(`${this.base()}${path}`, { method: 'POST', headers: this.headers(), body: JSON.stringify(body) });
      if (r.status === 409) { await sleep(15000); continue; }
      if (!r.ok) throw new Error(`breeze ${path}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
      return Buffer.from(await r.arrayBuffer());
    }
    throw new Error(`breeze ${path}: busy after 6 tries`);
  },
  // Design a voice once and freeze it: refs/<voice>.wav + .ref.txt are the voice lock (commit them).
  async ref(v) {
    const wav = join(REFS, `${v.id}.wav`), txt = join(REFS, `${v.id}.ref.txt`);
    if (existsSync(wav) && existsSync(txt)) return { wav, text: readFileSync(txt, 'utf8').trim() };
    if (!v.breeze?.design) throw new Error(`breeze: ${v.id} has no design`);
    mkdirSync(REFS, { recursive: true });
    console.log(`  designing ${v.id} (seed ${v.breeze.seed})`);
    writeFileSync(wav, await this.post('/v1/audio/breeze-design', { text: AUDITION, design: v.breeze.design, cfg_scale: 4, seed: v.breeze.seed }));
    writeFileSync(txt, AUDITION);
    return { wav, text: AUDITION };
  },
  async render(j, out) {
    const ref = await this.ref(j.vrow);
    const body = { text: j.text, ref_audio_b64: readFileSync(ref.wav).toString('base64'), ref_text: ref.text, seed: j.vrow.breeze.seed };
    if (j.direction) Object.assign(body, { instruction: j.direction, cfg_scale: 4 }); else body.cfg_scale = 1; // THE CFG LAW
    writeFileSync(out, await this.post('/v1/audio/breeze-clone', body));
  },
};

const gemini = {
  async render(j, out) {
    const k = env('REPLICATE_API_TOKEN') ?? env('REPLICATE_API_KEY');
    if (!k) throw new Error('gemini: set REPLICATE_API_TOKEN in the environment; nothing was rendered');
    const g = j.vrow.gemini, H = { authorization: `Bearer ${k}`, 'content-type': 'application/json', prefer: 'wait' };
    const prompt = `Voice ONLY the separate line of dialogue. Everything below is DIRECTION and must never be read aloud.\nWHO: ${g.persona}.\n${j.direction ? `NOTES: ${j.direction}` : 'NOTES: natural, in character, no announcer read.'}`;
    let p = await (await fetch('https://api.replicate.com/v1/models/google/gemini-3.1-flash-tts/predictions', { method: 'POST', headers: H, body: JSON.stringify({ input: { text: j.text, prompt, voice: g.voice, language_code: 'en-US' } }) })).json();
    for (let i = 0; i < 60 && p.status !== 'succeeded'; i++) {
      if (p.status === 'failed' || p.status === 'canceled' || p.error) throw new Error(`gemini: ${p.error ?? p.status}`);
      await sleep(1500); p = await (await fetch(p.urls.get, { headers: H })).json();
    }
    const url = Array.isArray(p.output) ? p.output[0] : p.output;
    writeFileSync(out, Buffer.from(await (await fetch(url)).arrayBuffer()));
  },
};

const flite = {
  async render(j, out) {
    const f = j.vrow.flite ?? { voice: 'slt', rate: 1 }, txt = join(TMP, `${clipKey(j.voice, j.text)}.txt`);
    writeFileSync(txt, j.text.replace(/\.\.\./g, ', '));
    // lavfi option values are ':'-separated and escaped with '\'; a temp path in the user's TEMP is plain enough.
    const tf = txt.replace(/\\/g, '/').replace(/:/g, '\\\\:');
    ff(['-f', 'lavfi', '-i', `flite=textfile=${tf}:voice=${f.voice}`, '-af', `atempo=${f.rate ?? 1}`, '-ar', '24000', '-ac', '1', '-f', 'wav', out]);
  },
};
const PROVIDERS = { breeze, breeze_hosted: breeze, gemini, flite };

// ---- commands -----------------------------------------------------------------------------------------------------
function plan(jobs, m) {
  const todo = [], cached = [];
  for (const j of jobs) {
    const e = m.clips[clipKey(j.voice, j.text)];
    (e && e.recipe === recipeOf(j, PROVIDER) && existsSync(join(OUT, e.file)) ? cached : todo).push(j);
  }
  const sec = todo.reduce((s, j) => s + estSec(j.text), 0), cost = todo.reduce((s, j) => s + COST[PROVIDER](estSec(j.text)), 0);
  return { todo, cached, sec, cost };
}

function lint(jobs) {
  const bad = jobs.flatMap((j) => denyHits(j.text).map((h) => `${j.voice}: "${j.text}" carries "${h.term}" (${h.source})`));
  if (bad.length) { console.error('ip-lint DENY in the batch, nothing rendered:\n  ' + bad.join('\n  ')); process.exit(1); }
}

async function main() {
  if (!PROVIDERS[PROVIDER]) { console.error(`unknown provider ${PROVIDER} (breeze | breeze_hosted | gemini | flite)`); process.exit(1); }
  const m = loadManifest();
  if (cmd === 'list') {
    const keys = new Map(); for (const r of LINES) keys.set(r.key, (keys.get(r.key) ?? 0) + r.lines.length);
    console.log(`${LINES.length} rows, ${keys.size} keys, ${LINES.reduce((s, r) => s + r.lines.length, 0)} lines; ${Object.keys(m.clips).length} clips rendered (${m.provider ?? 'none'})`);
    for (const [k, n] of keys) if (!/^(talk|radio|npc|role|memory|refuse\.role)\./.test(k)) console.log(`  ${k.padEnd(22)} ${n} variations`);
    console.log(`batches: ${Object.entries(BATCHES).map(([k, b]) => `${k} (${b.flatMap(jobsFor).length} lines)`).join(', ')}`);
    return;
  }
  if (cmd === 'audition') { const v = voiceRow(opt('voice'), NPCS); if (!v) throw new Error('no such voice'); const r = await breeze.ref(v); console.log(`frozen: ${r.wav}`); return; }
  const jobs = selection();
  lint(jobs);
  if (cmd === 'check') {
    let bad = 0;
    for (const j of jobs) {
      const e = m.clips[clipKey(j.voice, j.text)];
      if (!e) { console.log(`  -  ${j.voice.padEnd(14)} (not rendered) ${j.text}`); continue; }
      const f = join(OUT, e.file);
      if (!existsSync(f)) { bad++; console.log(`  !  ${j.voice.padEnd(14)} MISSING FILE ${e.file}`); continue; }
      const mm = measure(f), iss = qc(mm, j.text);
      if (iss.length) bad++;
      console.log(`  ${iss.length ? '!' : 'ok'} ${j.voice.padEnd(14)} ${String(mm.dur).padStart(5)}s peak ${mm.peakDb} rms ${mm.rmsDb} lead ${mm.leadS} tail ${mm.tailS}${iss.length ? `  << ${iss.join('; ')}` : ''}  ${e.file}`);
    }
    console.log(`check: ${jobs.length} lines, ${bad} flagged`);
    process.exit(bad ? 2 : 0);
  }
  const p = plan(jobs, m);
  console.log(`${cmd}: ${jobs.length} lines in the selection; ${p.cached.length} already rendered with this recipe; ${p.todo.length} to render with ${PROVIDER}`);
  console.log(`  ~${p.sec.toFixed(0)} s of speech, estimated cost $${p.cost.toFixed(3)}${PROVIDER === 'breeze' ? ' (self-hosted: GPU time only)' : ''}`);
  if (cmd === 'plan') { for (const j of p.todo) console.log(`   + ${j.voice.padEnd(14)} ${j.key.padEnd(20)} ${j.text}`); return; }
  if (cmd !== 'render') { console.error(`unknown command ${cmd}`); process.exit(1); }
  if (p.todo.length > MAX) { console.error(`  refused: ${p.todo.length} lines is more than --max ${MAX}. Narrow the selection or raise --max.`); process.exit(1); }
  if (p.cost > 0 && !YES) { console.error('  refused: this spends money. Re-run with --yes once the estimate is right.'); process.exit(1); }
  const P = PROVIDERS[PROVIDER];
  let done = 0, flagged = 0;
  for (const j of p.todo) {
    const key = clipKey(j.voice, j.text), raw = join(TMP, `${key}.raw`), file = fileFor(j), out = join(OUT, file);
    try {
      await P.render(j, raw);
      finish(raw, out);
      const mm = measure(out), iss = qc(mm, j.text);
      if (iss.length) flagged++;
      m.clips[key] = { file, voice: j.voice, key: j.key, row: j.row, text: j.text, provider: PROVIDER, recipe: recipeOf(j, PROVIDER), direction: j.direction ?? undefined, ...mm, qc: iss.length ? iss : 'ok', bytes: statSync(out).size, at: new Date().toISOString() };
      saveManifest(m);
      done++;
      console.log(`  ${iss.length ? '!' : '+'} ${String(done).padStart(3)} ${j.voice.padEnd(14)} ${String(mm.dur).padStart(5)}s ${j.text}${iss.length ? `  << ${iss.join('; ')}` : ''}`);
    } catch (e) {
      console.error(`  x ${j.voice} "${j.text}": ${e.message}`);
      if (/set [A-Z_]+ in the environment|unreachable/.test(e.message)) break; // no key, no box: stop, do not hammer
    } finally { try { rmSync(raw, { force: true }); } catch { /* temp */ } }
  }
  console.log(`render: ${done} rendered, ${flagged} flagged by QC, ${p.todo.length - done} not rendered. Manifest: public/voice/manifest.json`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
