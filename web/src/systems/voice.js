import { LINES, DIRECTION, fillLine } from '../data/dialogue.js';
import { castVoice, clipKey, hash32, RADIO_VOICE } from '../data/voices.js';

// Voices (docs/design/WEB_VOICE.md). The one place a person's words become sound:
//   say(c, key, vars, opts)  pick a variation of a situation row for c (data/dialogue.js), fill it from the live world,
//                            put it on the subtitle line and speak it. The API the gunpoint state calls.
//   line(c, key, vars)       the same pick and fill, text only (talk.js builds its replies with it).
//   speak(c, text, opts)     voice an exact line if the forge rendered it for c's voice (public/voice/manifest.json);
//                            text only when it did not. Positioned at c, fading with distance like every other sound.
//   radio(text)              STATIC 1660 AM: the station's voice through a radio filter, heard everywhere.
// Rules: nobody talks over themselves (a line waits, or cuts their own lower line); gunfire near a speaker cuts a
// calm line short; a missing or broken file is never an error, it is a subtitle.
const RANGE = 42;          // m: past this a voice is not heard
const SUB_RANGE = 18;      // m: a bark this close also takes the subtitle line
const CUT_RANGE = 35;      // m: a shot this close to a speaker cuts a calm line
const MAX_LINES = 6;       // voices at once; the farthest is dropped
const PRIO = { bark: 0, talk: 1, radio: 1, gunpoint: 2, death: 3 };
const DIRS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];

// Rows by key, once.
const BY_KEY = new Map();
for (const r of LINES) { if (!BY_KEY.has(r.key)) BY_KEY.set(r.key, []); BY_KEY.get(r.key).push(r); }

export class Voice {
  constructor(game) {
    this.g = game;
    this.manifest = null;       // { clips: { key: { file, voice, dur } } }
    this.buffers = new Map();   // file -> AudioBuffer | Promise | 'failed'
    this.decks = new Map();     // `${speaker}|${key}` -> { order, i, round }
    this.lines = [];            // what is being said right now
    this.queue = new Map();     // speaker -> the one line waiting for them to finish
    this.lastKill = game.eventSeq ?? 0;
    this.subAt = -1;
    this.stats = { said: 0, played: 0, textOnly: 0, cut: 0, busy: 0, missing: 0, failed: 0 };
    this.log = [];              // the last 40 lines: what, who, played or why not (the `voice` command reads it)
    this.base = (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || '/';
    // Placeholder clips (provider flite: robotic, proves the pipe) are heard only with ?voicedev in the URL or
    // `voice dev=true`; a player hears the cast or the subtitle, never the robot.
    this.allowDev = typeof location !== 'undefined' && /[?&]voicedev\b/.test(location.search ?? '');
    this.ready = this.loadManifest();
  }

  async loadManifest(url = `${this.base}voice/manifest.json`) {
    try {
      const r = await fetch(url, { cache: 'no-cache' });
      this.manifest = r.ok ? await r.json() : { clips: {} };
    } catch { this.manifest = { clips: {} }; }
    this.manifest.clips ??= {};
    return this.manifest;
  }

  // ---- picking a line ---------------------------------------------------------------------------------------------
  archetype(c) { return { rusthaven: 'warden', warden: 'warden', raider: 'raider', dustwolves: 'raider', soldier: 'soldier', remnant: 'soldier' }[c.faction] ?? (c.faction === 'drifter' ? 'drifter' : c.faction); }
  tier(c) { const F = this.g.society?.factions, i = F?.index?.[c.fid]; return i >= 0 ? F.tiers[i] : 'neutral'; }
  mood(c) {
    if (c.downedT > 0 || (c.maxHp && c.hp < c.maxHp * 0.4)) return 'hurt';
    if (c.vendetta || ['hostile', 'hunted'].includes(this.tier(c))) return 'angry';
    if (this.g.time - (c.shotNearAt ?? -99) < 10) return 'scared';
    return 'calm';
  }
  matches(r, c) {
    const who = Array.isArray(r.who) ? r.who : [r.who];
    let spec = -1;
    if (c?.npc && who.includes(c.npc.id)) spec = 3;
    else if (c && who.includes(this.archetype(c))) spec = 2;
    else if (c === 'radio' && who.includes('radio')) spec = 3;
    else if (who.includes('*') && c !== 'radio') spec = 1;
    if (spec < 0) return -1;
    const w = r.when;
    if (w && c && c !== 'radio') {
      if (w.mood && ![].concat(w.mood).includes(this.mood(c))) return -1;
      if (w.tier && ![].concat(w.tier).includes(this.tier(c))) return -1;
      if (w.night !== undefined && (this.g.sky?.night > 0.5) !== w.night) return -1;
      spec += 0.5; // a row whose conditions hold beats one with none
    }
    return spec;
  }
  rows(c, key) {
    let best = -1, out = [];
    for (const r of BY_KEY.get(key) ?? []) {
      const s = this.matches(r, c);
      if (s > best) { best = s; out = [r]; } else if (s === best && s >= 0) out.push(r);
    }
    return best < 0 ? [] : out;
  }
  speakerId(c) { return c === 'radio' ? 'radio' : c?.npc?.id ?? c?.name ?? c?.id ?? 'someone'; }

  // A shuffled deck per speaker and key: every variation once before any comes round again, never the same twice running.
  deal(c, key, n) {
    const id = `${this.speakerId(c)}|${key}`;
    let d = this.decks.get(id);
    const shuffle = (round, avoid) => {
      const o = [...Array(n).keys()];
      let s = hash32(`${id}|${round}`);
      for (let i = n - 1; i > 0; i--) { s = Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) >>> 0; const j = s % (i + 1); [o[i], o[j]] = [o[j], o[i]]; }
      if (n > 1 && o[0] === avoid) [o[0], o[1]] = [o[1], o[0]];
      return o;
    };
    if (!d || d.order.length !== n) { d = { order: shuffle(0, -1), i: 0, round: 0 }; this.decks.set(id, d); }
    if (d.i >= n) { const last = d.order[n - 1]; d.round++; d.order = shuffle(d.round, last); d.i = 0; }
    return d.order[d.i++];
  }

  // The live world's words for a line's {tokens}: where the speaker stands, which way the trouble is, how many.
  vars(c, text, given = {}) {
    const v = { ...given }, g = this.g, need = (k) => v[k] === undefined && text.includes(`{${k}}`);
    if (need('you')) v.you = 'stranger';
    if (need('me')) v.me = String(c?.npc?.name ?? c?.name ?? 'me').split(' ')[0];
    if (need('place') && c?.x !== undefined) { const S = g.society; v.place = S?.places?.[S.placeAt(c.x, c.z)]?.name ?? 'the flats'; }
    if ((need('dir') || need('n')) && c?.x !== undefined) {
      let n = 0, best = null, bd = 300;
      for (const o of g.chars) {
        if (!o.alive || o === c || !(o.faction === 'zombie' || o.faction === 'raider')) continue;
        const d = Math.hypot(o.x - c.x, o.z - c.z);
        if (d < 150 && o.faction === 'zombie') n++;
        if (d < bd) { bd = d; best = o; }
      }
      if (!best) { let cd = 900; for (const k of g.world?.spawns?.camps ?? []) { const d = Math.hypot(k.x - c.x, k.z - c.z); if (d < cd) { cd = d; best = k; } } } // else the nearest raider camp
      const t = best ?? g.player;
      if (need('dir')) v.dir = t ? DIRS[(((Math.round(Math.atan2(t.x - c.x, -(t.z - c.z)) / (Math.PI / 4))) % 8) + 8) % 8] : 'north';
      if (need('n')) v.n = n;
    }
    if (need('who')) v.who = 'somebody';
    if (need('about')) v.about = 'people';
    return v;
  }

  // Pick and fill, text only. null when nobody could say it (no row for this key and speaker).
  line(c, key, vars = {}) {
    const rows = this.rows(c, key);
    if (!rows.length) return null;
    const all = rows.flatMap((r) => r.lines.map((t) => ({ t, r })));
    const pick = all[this.deal(c, key, all.length)];
    return { text: fillLine(pick.t, this.vars(c, pick.t, vars)), row: pick.r, template: pick.t };
  }

  // THE API: voice.say(c, key, vars). Returns what was said (and whether it was heard as audio), or null.
  say(c, key, vars = {}, opts = {}) {
    if (!c || (c !== 'radio' && (c.faction === 'zombie' || c === this.g.player || c.drone))) return null; // a drone (systems/underground.js) has no voice
    const l = this.line(c, key, vars);
    if (!l) return null;
    const kind = opts.kind ?? l.row.kind ?? DIRECTION[key]?.kind ?? 'talk';
    if (c === 'radio') { const r = this.radio(l.text); return { ...r, key, text: l.text }; }
    const near = Math.hypot(c.x - this.g.player.x, c.z - this.g.player.z) < SUB_RANGE;
    const sub = opts.subtitle ?? (near && !this.g.dialogue?.active && (kind !== 'bark' || this.g.time - this.subAt > 1.5));
    if (sub) { this.subAt = this.g.time; this.g.hud?.subtitle?.(`${c.npc?.name ?? c.name}: ${l.text}`, opts.secs ?? 3.5); }
    const s = this.speak(c, l.text, { ...opts, kind });
    this.g.emit?.('voice', { id: c.id, key, line: l.text, row: l.row.id, played: s.played, why: s.why ?? null });
    return { key, row: l.row.id, text: l.text, voice: s.voice, played: s.played, why: s.why ?? null };
  }

  // ---- making sound -----------------------------------------------------------------------------------------------
  clipFor(voice, text) {
    const e = voice && this.manifest?.clips?.[clipKey(voice, text)];
    return e && (e.provider !== 'flite' || this.allowDev) ? e : null;
  }

  buffer(file) {
    const b = this.buffers.get(file);
    if (b) return b;
    const A = this.g.audio;
    if (!A?.ctx) return null;
    const p = fetch(`${this.base}voice/${file}`).then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.arrayBuffer(); })
      .then((ab) => A.ctx.decodeAudioData(ab))
      .then((buf) => { this.buffers.set(file, buf); return buf; })
      .catch(() => { this.buffers.set(file, 'failed'); this.stats.failed++; return 'failed'; });
    this.buffers.set(file, p);
    if (this.buffers.size > 96) this.buffers.delete(this.buffers.keys().next().value); // a small cache
    return p;
  }

  note(rec) { this.log.push(rec); if (this.log.length > 40) this.log.shift(); }

  // Speak an exact line for c. opts: kind (bark|talk|gunpoint|death|radio), after (wait for their current line instead of
  // being dropped), interrupt (cut their own current line whatever it is).
  speak(c, text, opts = {}) {
    const voice = c === 'radio' ? RADIO_VOICE : castVoice(c);
    const kind = opts.kind ?? 'talk', prio = PRIO[kind] ?? 1;
    this.stats.said++;
    const rec = { t: +this.g.time.toFixed(2), who: this.speakerId(c), voice, text, kind, played: false };
    const clip = this.clipFor(voice, text);
    if (!clip) { this.stats.textOnly++; this.stats.missing++; rec.why = voice ? 'no clip' : 'no voice'; this.note(rec); return { played: false, voice, why: rec.why }; }
    const A = this.g.audio;
    if (!A?.ctx) { this.stats.textOnly++; rec.why = 'audio off'; this.note(rec); return { played: false, voice, why: 'audio off' }; }
    const cur = this.lines.find((l) => l.c === c && !l.done);
    if (cur) {
      if (opts.interrupt || prio > cur.prio) this.stop(cur, 'cut by their own line');
      else if (opts.after) { this.queue.set(this.speakerId(c), { c, text, opts }); rec.why = 'queued'; this.note(rec); return { played: false, voice, why: 'queued', queued: true }; }
      else { this.stats.busy++; rec.why = 'busy'; this.note(rec); return { played: false, voice, why: 'busy' }; }
    }
    const line = { c, text, voice, kind, prio, file: clip.file, dur: clip.dur ?? 0, rec, started: false, done: false, t0: this.g.time, gain: 0, dist: 0, pan: 0 };
    this.lines.push(line);
    if (this.lines.filter((l) => !l.done).length > MAX_LINES) {
      const far = this.lines.filter((l) => !l.done && l.c !== 'radio').sort((a, b) => this.distTo(b.c) - this.distTo(a.c))[0];
      if (far) this.stop(far, 'crowded');
    }
    const b = this.buffer(clip.file);
    const go = (buf) => {
      if (line.done) return;
      if (buf === 'failed' || !buf) { line.done = true; rec.why = 'load failed'; this.stats.textOnly++; this.note(rec); return; }
      this.start(line, buf);
    };
    if (b && typeof b.then === 'function') { line.loading = true; b.then(go); rec.why = 'loading'; }
    else go(b);
    return { played: !line.done, voice, file: clip.file, why: line.done ? rec.why : undefined };
  }

  distTo(c) { const p = this.g.player; return c === 'radio' || !c ? 0 : Math.hypot(c.x - p.x, c.z - p.z); }

  start(line, buf) {
    const A = this.g.audio, ctx = A.ctx, t = ctx.currentTime;
    line.loading = false;
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(), gain = ctx.createGain();
    if (line.c === 'radio') {
      f.type = 'bandpass'; f.frequency.value = 1700; f.Q.value = 0.8; gain.gain.value = 0.7;
      src.connect(f).connect(gain).connect(A.master);
    } else {
      f.type = 'lowpass'; f.frequency.value = 8000;
      const pan = ctx.createStereoPanner();
      src.connect(f).connect(gain).connect(pan).connect(A.master);
      line.panner = pan;
    }
    line.src = src; line.filter = f; line.amp = gain; line.started = true; line.t0 = this.g.time; line.at = t;
    line.dur = buf.duration;
    this.place(line, true);
    src.onended = () => { if (!line.done) { line.done = true; line.rec.ended = true; } };
    src.start(t);
    A.count('voice');
    this.stats.played++;
    line.rec.played = true; delete line.rec.why;
    this.note(line.rec);
  }

  // Where the listener is (the player, like every other sound): gain falls off with distance, and the high end dulls.
  place(line, now = false) {
    if (line.c === 'radio' || !line.started) return;
    const g = this.g, c = line.c, d = Math.hypot(c.x - g.player.x, c.z - g.player.z);
    const fall = Math.max(0, 1 - d / RANGE), air = Math.max(0.35, 1 - d / 60);
    line.dist = d; line.gain = 0.95 * fall * (c.alive || line.kind === 'death' ? 1 : 0); line.pan = g.pan ? g.pan(c.x) : 0;
    line.x = c.x; line.z = c.z;
    const t = g.audio.ctx.currentTime, k = now ? 0.005 : 0.06;
    line.amp.gain.setTargetAtTime(line.gain, t, k);
    line.filter.frequency.setTargetAtTime(600 + 7400 * air * air, t, k);
    line.panner.pan.setTargetAtTime(Math.max(-1, Math.min(1, line.pan || 0)), t, k);
  }

  stop(line, why = 'stopped') {
    if (!line || line.done) return;
    line.done = true; line.rec.cut = why;
    if (line.started) {
      this.stats.cut++;
      try { const t = this.g.audio.ctx.currentTime; line.amp.gain.setTargetAtTime(0, t, 0.03); line.src.stop(t + 0.12); } catch { /* already stopped */ }
    }
  }
  // Stop whatever c is saying (and what they were waiting to say).
  hush(c) { for (const l of this.lines) if (l.c === c) this.stop(l, 'hushed'); this.queue.delete(this.speakerId(c)); }

  radio(text) { return this.speak('radio', text, { kind: 'radio', interrupt: true }); }

  // A shot fired at (x, z): calm lines nearby are cut short, and somebody near it may shout.
  onShot(x, z, shooter) {
    const g = this.g;
    for (const l of this.lines) {
      if (l.done || l.c === 'radio' || l.prio >= PRIO.gunpoint || l.c === shooter) continue;
      if (Math.hypot(l.c.x - x, l.c.z - z) < CUT_RANGE) this.stop(l, 'gunfire');
    }
    if ((this.fireBarkAt ?? -9) > g.time) return;
    let who = null, bd = 16;
    for (const c of g.chars) {
      if (!c.alive || c === shooter || c === g.player || c.faction === 'zombie' || c.sleeping || c.inVehicle) continue;
      const d = Math.abs(c.x - x) < bd && Math.abs(c.z - z) < bd ? Math.hypot(c.x - x, c.z - z) : 99;
      if (d < bd) { c.shotNearAt = g.time; if ((c.barkFireAt ?? -9) < g.time) { bd = d; who = c; } }
    }
    if (who) { who.barkFireAt = g.time + 7; this.fireBarkAt = g.time + 1.2; this.say(who, 'under_fire', {}, { kind: 'gunpoint' }); }
  }

  // Each frame: move the voices with their speakers, start what was waiting, and hear the dying.
  update() {
    const g = this.g;
    let i = g.events.length;
    while (i > 0 && g.events[i - 1].seq > this.lastKill) i--;
    for (; i < g.events.length; i++) {
      const e = g.events[i];
      this.lastKill = e.seq;
      if (e.type !== 'kill') continue;
      const c = g.chars.find((x) => x.id === e.victim);
      if (c && c !== g.player && c.faction !== 'zombie' && Math.hypot(c.x - g.player.x, c.z - g.player.z) < RANGE) this.say(c, 'death', {}, { kind: 'death', interrupt: true });
    }
    for (const l of this.lines) if (!l.done && l.started) this.place(l);
    if (this.lines.length > 24) this.lines = this.lines.filter((l) => !l.done);
    for (const [id, q] of this.queue) {
      if (this.lines.some((l) => l.c === q.c && !l.done)) continue;
      this.queue.delete(id);
      if (q.c === 'radio' || q.c.alive) this.speak(q.c, q.text, { ...q.opts, after: false });
    }
  }

  view() {
    const live = this.lines.filter((l) => !l.done).map((l) => ({ who: this.speakerId(l.c), voice: l.voice, text: l.text, kind: l.kind, file: l.file, loading: !!l.loading, started: l.started,
      gain: +l.gain.toFixed(3), dist: +l.dist.toFixed(1), pan: +(l.pan ?? 0).toFixed(2), x: l.x, z: l.z, dur: +(l.dur ?? 0).toFixed(2) }));
    return { manifest: this.manifest ? Object.keys(this.manifest.clips).length : null, provider: this.manifest?.provider ?? null, rows: LINES.length, keys: BY_KEY.size, stats: { ...this.stats }, live, queued: [...this.queue.keys()], log: this.log.slice(-12) };
  }
}
