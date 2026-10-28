import { resolve, setFor, SPATIAL, AUDIO_BASE, ENGINES, BEDS, BED_GAIN } from '../data/audiosets.js';

// WebAudio. Two layers (docs/design/WEB_VOICE_STATS.md §2):
//   the SYNTH (every method below: instant boot, no files) - always there, the fallback for everything;
//   the SAMPLES: the studio library's recordings (data/audiosets.js, public/audio/), loaded lazily per kind. A method
//   asks sample(set, kind, at) first; when the files are not loaded yet (or a kind has none) it synthesizes as before.
// Samples are positional (spatial(): inverse-distance falloff to a hard range, a low-pass that closes with distance and
// with a wall between you and the source), rotate their variants (never the same take twice running), jitter their
// pitch, and stop at a voice cap (the quietest gives way).
// The pure part of positioning, shared with the selftest: how loud and how bright a sound at dist m is.
export function spatial(dist, range = SPATIAL.range.default, occluded = false) {
  const S = SPATIAL, d = Math.max(0, dist);
  if (d >= range) return { gain: 0, cutoff: S.cutoffMin };
  const inv = S.ref / (S.ref + S.rolloff * Math.max(0, d - S.ref));
  const edge = 1 - (d / range) ** 2;
  let gain = inv * edge, cutoff = S.cutoffMin + (S.cutoffMax - S.cutoffMin) * (1 - d / range) ** 1.6;
  if (occluded) { gain *= S.indoorGain; cutoff = Math.min(cutoff, S.indoorCut); }
  return { gain, cutoff };
}

export class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.rainGain = null;
    this.counts = {}; // telemetry for agents: what has been played
    this.bank = new Map();    // file -> AudioBuffer | Promise | 'failed'
    this.decks = new Map();   // 'set/kind' -> { order, i } variant rotation
    this.voices = [];         // sample voices playing: { src, level, t, done }
    this.sampleStats = { played: 0, synth: 0, capped: 0, loading: 0, failed: 0 };
    this.useSamples = true;
    this.listener = { x: 0, z: 0, indoor: false }; // systems/soundscape.js moves it with the player each frame
    this.base = (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || '/';
    this.lastSample = null;   // what the last sample() call decided (the audioTest command reads it)
    this.beds = { a: null, b: null };
    this.eng = null;          // the sampled engine: { key, pitch, layers: {idle, rev, strain} }
  }

  // ---- the sample layer ------------------------------------------------------------------------------------------
  load(file) {
    let b = this.bank.get(file);
    if (b) return b;
    if (!this.ctx || typeof fetch === 'undefined') return null;
    this.sampleStats.loading++;
    b = fetch(`${this.base}${AUDIO_BASE}${file}`).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((ab) => this.ctx.decodeAudioData(ab)).then((buf) => { this.bank.set(file, buf); return buf; })
      .catch(() => { this.bank.set(file, 'failed'); this.sampleStats.failed++; return 'failed'; });
    this.bank.set(file, b);
    return b;
  }
  // Warm a whole set/kind (every variant) so its first play is not the silent one.
  preload(set, kind) { const r = resolve(set, kind); if (r) for (const x of r.files) this.load(x.f); return r ? r.files.map((x) => this.bank.get(x.f)) : []; }
  // A shuffled rotation per set/kind: every take once before any comes round again, never the same twice running.
  pick(key, n) {
    let d = this.decks.get(key);
    const shuffle = (avoid) => { const o = [...Array(n).keys()]; for (let i = n - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; } if (n > 1 && o[0] === avoid) [o[0], o[1]] = [o[1], o[0]]; return o; };
    if (!d || d.order.length !== n) { d = { order: shuffle(-1), i: 0 }; this.decks.set(key, d); }
    if (d.i >= n) { d.order = shuffle(d.order[n - 1]); d.i = 0; }
    return d.order[d.i++];
  }
  // Play one take of set/kind. at: { x, z } (positional, from the listener) or { dist, pan }; range (m), vol, rate,
  // indoor (the source is inside), prio. Returns true when a sample was started (false: the caller synthesizes).
  sample(set, kind, at = {}) {
    const r = resolve(set, kind);
    const why = (w) => { this.lastSample = { set, kind, played: false, why: w, via: r?.via ?? null }; return false; };
    if (!r) return why('no files for this kind');
    if (!this.useSamples) return why('samples off');
    if (!this.ctx) return why('audio off');
    const L = this.listener, range = at.range ?? SPATIAL.range.default;
    const dist = at.x !== undefined ? Math.hypot(at.x - L.x, at.z - L.z) : (at.dist ?? 0);
    const pan = at.x !== undefined ? Math.max(-1, Math.min(1, (at.x - L.x) / 30)) : (at.pan ?? 0);
    const sp = spatial(dist, range, !!at.indoor !== !!L.indoor);
    const level = sp.gain * (at.vol ?? 1) * r.gain;
    if (level < 0.004) return why('out of range');
    const take = r.files[this.pick(`${r.via}|${kind}`, r.files.length)];
    const buf = this.bank.get(take.f);
    if (!buf || buf === 'failed' || typeof buf.then === 'function') { for (const x of r.files) this.load(x.f); return why(buf === 'failed' ? 'load failed' : 'loading'); }
    // The voice cap: past it the quietest voice gives way (or this one, if it is the quietest).
    if (this.voices.length >= SPATIAL.voiceCap) this.voices = this.voices.filter((v) => !v.done);
    if (this.voices.length >= SPATIAL.voiceCap) {
      let q = null; for (const v of this.voices) if (!q || v.level < q.level) q = v;
      if (q.level >= level) { this.sampleStats.capped++; return why('voice cap'); }
      try { q.src.stop(); } catch { /* already stopped */ }
      q.done = true; this.sampleStats.capped++;
      this.voices = this.voices.filter((v) => !v.done);
    }
    const ctx = this.ctx, src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = r.pitch * (at.rate ?? 1) * (1 + (Math.random() * 2 - 1) * SPATIAL.jitter);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = sp.cutoff; f.Q.value = 0.5;
    const g = ctx.createGain(); g.gain.value = Math.min(1.4, level);
    src.connect(f).connect(g); this.out(g, pan);
    const v = { src, level, t: ctx.currentTime, done: false };
    src.onended = () => { v.done = true; };
    src.start();
    this.voices.push(v);
    this.sampleStats.played++; this.count(`sample:${set}/${kind}`);
    this.lastSample = { set, kind, played: true, via: r.via, file: take.f, dist: +dist.toFixed(1), gain: +level.toFixed(3), cutoff: Math.round(sp.cutoff), pitch: +src.playbackRate.value.toFixed(3), voices: this.voices.length };
    return true;
  }
  // c's own set (data/audiosets.js setFor): a warden's revolver, a Dustwolf's yelp, a sprinter's scream.
  sampleFor(c, kind, at = {}) { return this.sample(setFor(c), kind, c && at.x === undefined && at.dist === undefined ? { ...at, x: c.x, z: c.z } : at); }

  // ---- beds and engines (loops; systems/soundscape.js drives them) ---------------------------------------------------
  loopNode(buf, vol, rate = 1) {
    const ctx = this.ctx, src = ctx.createBufferSource(); src.buffer = buf; src.loop = true; src.playbackRate.value = rate;
    const g = ctx.createGain(); g.gain.value = 0; src.connect(g).connect(this.master); src.start(0, Math.random() * Math.max(0.01, buf.duration - 0.1));
    g.gain.setTargetAtTime(vol, ctx.currentTime, 1.2);
    return { src, g };
  }
  fadeOut(node, secs = 0.8) { if (!node) return; node.g.gain.setTargetAtTime(0, this.ctx.currentTime, secs); const s = node.src; setTimeout(() => { try { s.stop(); } catch { /* gone */ } }, secs * 5000); }
  // The ambience bed for a place (data/audiosets.js BEDS) and time, crossfading when it changes, plus a weather layer.
  // key: 'desert' | 'ruins' | ... | null; night: bool; weather: 'rain' | 'wind' | null.
  bed(key, night, weather = null) {
    if (!this.ctx) return null;
    const want = key && BEDS[key] ? `${BEDS[key]}/${night ? 'night' : 'day'}` : null;
    const swap = (slot, id, vol) => {
      const cur = this.beds[slot];
      if ((cur?.id ?? null) === id) return;
      if (!id) { this.fadeOut(cur); this.beds[slot] = null; return; }
      const [set, kind] = id.split('/'), r = resolve(set, kind);
      if (!r) return;
      const take = r.files[this.pick(id, r.files.length)], buf = this.bank.get(take.f);
      if (!buf || buf === 'failed' || typeof buf.then === 'function') { this.load(take.f); return; } // try again next tick
      this.fadeOut(cur);
      this.beds[slot] = { id, ...this.loopNode(buf, vol) };
      this.count(`bed:${id}`);
    };
    swap('a', want, BED_GAIN[key] ?? 0.5);
    swap('b', weather ? `bed.weather/${weather}` : null, BED_GAIN[weather] ?? 0.5);
    return { bed: this.beds.a?.id ?? null, weather: this.beds.b?.id ?? null };
  }
  // A sampled engine for the vehicle you drive: idle, rev and strain loops crossfaded by rpm, their rate following it.
  // type: a vehicles.js row (null stops it). rpm 0..1, load 0..1 (throttle against the road).
  engine(type, rpm = 0, load = 0) {
    if (!this.ctx) return false;
    const E = type ? ENGINES[type] ?? ['engine.car', 1] : null;
    if (!E) { if (this.eng) { for (const l of Object.values(this.eng.layers)) this.fadeOut(l, 0.2); this.eng = null; } return false; }
    const key = `${E[0]}|${E[1]}`;
    if (!this.eng || this.eng.key !== key) {
      if (this.eng) this.engine(null);
      const bufs = {};
      for (const k of ['idle', 'rev', 'strain']) {
        const r = resolve(E[0], k); if (!r) return false;
        const b = this.bank.get(r.files[0].f);
        if (!b || b === 'failed' || typeof b.then === 'function') { this.load(r.files[0].f); return false; }
        bufs[k] = b;
      }
      const layers = {}; for (const k in bufs) layers[k] = this.loopNode(bufs[k], 0, E[1]);
      this.eng = { key, pitch: E[1], layers };
      this.count('engine:sample');
    }
    const t = this.ctx.currentTime, L = this.eng.layers, p = this.eng.pitch;
    const wIdle = Math.max(0, 1 - rpm * 2.2), wStrain = Math.min(1, Math.max(0, load * (rpm - 0.35) * 1.6)), wRev = Math.max(0, 1 - wIdle - wStrain * 0.6);
    L.idle.g.gain.setTargetAtTime(0.32 * wIdle, t, 0.08); L.rev.g.gain.setTargetAtTime(0.3 * wRev, t, 0.08); L.strain.g.gain.setTargetAtTime(0.28 * wStrain, t, 0.08);
    const rate = p * (0.85 + rpm * 0.6);
    L.idle.src.playbackRate.setTargetAtTime(p * (0.95 + rpm * 0.3), t, 0.06); L.rev.src.playbackRate.setTargetAtTime(rate, t, 0.06); L.strain.src.playbackRate.setTargetAtTime(rate * 0.95, t, 0.06);
    return true;
  }
  count(k) { this.counts[k] = (this.counts[k] ?? 0) + 1; }

  start() {
    if (this.ctx) return;
    const ctx = (this.ctx = new (window.AudioContext || window.webkitAudioContext)());
    ctx.resume?.();
    this.master = ctx.createGain();
    this.master.gain.value = 0.55;
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(ctx.destination);
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // Ambient loops: rain hiss and wind.
    const loop = (freq, q, type) => {
      const src = ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
      const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = ctx.createGain(); g.gain.value = 0;
      src.connect(f).connect(g).connect(this.master); src.start();
      return g;
    };
    this.rainGain = loop(2600, 0.4, 'highpass');
    this.windGain = loop(380, 0.8, 'bandpass');
    // Engine: sawtooth through lowpass.
    this.engOsc = ctx.createOscillator(); this.engOsc.type = 'sawtooth'; this.engOsc.frequency.value = 40;
    const ef = ctx.createBiquadFilter(); ef.type = 'lowpass'; ef.frequency.value = 420;
    this.engGain = ctx.createGain(); this.engGain.gain.value = 0;
    this.engOsc.connect(ef).connect(this.engGain).connect(this.master); this.engOsc.start();
  }

  // Route a node through a stereo panner (-1 left .. 1 right) into the master bus.
  out(node, pan = 0) {
    if (!pan) { node.connect(this.master); return; }
    const p = this.ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan));
    node.connect(p).connect(this.master);
  }

  burst({ dur = 0.2, freq = 1200, q = 0.7, type = 'lowpass', vol = 0.6, decay = 0.15, pitchDrop = 0, at = 0, pan = 0 }) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + at;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (pitchDrop) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * pitchDrop), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + decay);
    src.connect(f).connect(g);
    this.out(g, pan);
    src.start(t, Math.random() * 1.5, dur);
  }

  tone(freq, dur, vol = 0.2, type = 'square', slide = 0, pan = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); this.out(g, pan); o.start(t); o.stop(t + dur);
  }

  // shooter (optional): whose gun - their faction's own recordings (data/audiosets.js); far off, the distant crack.
  gun(kind, dist = 0, pan = 0, shooter = null) {
    this.count(`gun:${kind}`);
    if (shooter) {
      const indoor = !!shooter.indoor, range = kind === 'mg' ? SPATIAL.range.mg : SPATIAL.range.shot;
      if (dist > 90 && this.sample('common', 'shot.far', { dist, pan, range: SPATIAL.range.far, indoor, vol: 0.9 })) return;
      if (this.sample(setFor(shooter), `shot.${kind}${indoor ? '.in' : ''}`, { dist, pan, range, indoor })) return;
    }
    this.sampleStats.synth++;
    const fall = Math.max(0.05, 1 - dist / 90);
    // Distant shots lose their top end: lower filter cutoff with range.
    const air = Math.max(0.35, 1 - dist / 120);
    if (kind === 'pistol') { this.burst({ dur: 0.35, freq: 2200 * air, vol: 0.9 * fall, decay: 0.28, pitchDrop: 0.15, pan }); this.tone(110, 0.12, 0.3 * fall, 'sine', 0.4, pan); }
    else if (kind === 'smg') { this.burst({ dur: 0.12, freq: 3000 * air, vol: 0.55 * fall, decay: 0.09, pitchDrop: 0.3, pan }); }
    else if (kind === 'rifle') { this.burst({ dur: 0.2, freq: 2600 * air, vol: 0.75 * fall, decay: 0.15, pitchDrop: 0.22, pan }); this.tone(150, 0.07, 0.2 * fall, 'sine', 0.5, pan); } // a sharper crack
    else { this.burst({ dur: 0.5, freq: 1400 * air, vol: 1.1 * fall, decay: 0.42, pitchDrop: 0.1, pan }); this.tone(70, 0.2, 0.4 * fall, 'sine', 0.4, pan); }
  }
  // A base alarm: a siren winding up and down three times, fading with distance.
  siren(dist = 0) {
    this.count('siren');
    if (this.sample('common', 'alarm.siren', { dist, range: SPATIAL.range.alarm, vol: 0.8 })) return;
    const v = Math.max(0, 0.22 * (1 - dist / 260));
    if (v < 0.01) return;
    for (let k = 0; k < 3; k++) setTimeout(() => { this.tone(330, 0.9, v, 'sawtooth', 1.9); setTimeout(() => this.tone(620, 0.9, v, 'sawtooth', 0.55), 900); }, k * 1800);
  }
  glass(pan = 0) {
    this.count('glass');
    if (this.sample('common', 'glass.break', { dist: 6, pan, range: SPATIAL.range.glass })) return;
    this.burst({ dur: 0.35, freq: 5200, type: 'highpass', vol: 0.55, decay: 0.32, pan });
    for (let i = 0; i < 4; i++) setTimeout(() => this.tone(2600 + Math.random() * 2400, 0.12, 0.05, 'sine', 0.8, pan), 40 + i * 55);
  }
  thud(pan = 0) { this.count('thud'); if (this.sample('common', 'impact.wood', { dist: 4, pan, vol: 0.7 })) return; this.burst({ dur: 0.12, freq: 420, vol: 0.28, decay: 0.1, pan }); }
  groan(pan = 0, dist = 0) {
    const v = Math.max(0, 0.16 * (1 - dist / 32));
    if (v < 0.01) return;
    this.count('groan');
    if (this.sample('shambler', Math.random() < 0.8 ? 'idle' : 'attack', { dist, pan, range: 34 })) return;
    this.tone(70 + Math.random() * 40, 0.9, v, 'sawtooth', 0.7, pan);
    this.burst({ dur: 0.8, freq: 380, type: 'bandpass', q: 4, vol: v * 1.4, decay: 0.75, pan });
  }
  // The infected (data/infected.js). hum: the Choir-Touched - two low tones a fraction apart, a broadcast heard wrong
  // (k = distance / its reach). wheeze: a sprinter overheating. murmur: an Echo's phrase, a voice with no words left.
  hum(pan = 0, k = 0) {
    const v = Math.max(0, 0.09 * (1 - k));
    if (v < 0.005) return;
    this.count('hum');
    if (this.sample('choir', 'idle', { dist: k * 60, pan, range: 60, vol: 0.7 })) return;
    this.tone(213, 2.2, v, 'sine', 0.985, pan); this.tone(240, 2.2, v * 0.8, 'sine', 1.01, pan);
  }
  wheeze(pan = 0, dist = 0) {
    const v = Math.max(0, 0.12 * (1 - dist / 30));
    if (v < 0.01) return;
    this.count('wheeze');
    if (this.sample('sprinter', 'idle', { dist, pan, range: 30 })) return;
    this.burst({ dur: 0.5, freq: 1900, type: 'bandpass', q: 6, vol: v, decay: 0.45, pitchDrop: 0.7, pan });
    this.burst({ dur: 0.6, freq: 1400, type: 'bandpass', q: 5, vol: v * 0.8, decay: 0.55, pitchDrop: 1.2, at: 0.55, pan });
  }
  murmur(pan = 0, dist = 0) {
    const v = Math.max(0, 0.1 * (1 - dist / 26));
    if (v < 0.005) return;
    this.count('murmur');
    if (this.sample('echo', 'idle', { dist, pan, range: 26 })) return;
    for (let i = 0; i < 4; i++) this.burst({ dur: 0.22, freq: 500 + Math.random() * 400, type: 'bandpass', q: 7, vol: v, decay: 0.2, pitchDrop: 0.85, at: i * 0.26, pan });
  }
  throwWhoosh(pan = 0) { this.count('throw'); this.burst({ dur: 0.22, freq: 900, type: 'bandpass', q: 2, vol: 0.18, decay: 0.2, pitchDrop: 1.8, pan }); }
  clink(pan = 0) { this.count('clink'); this.tone(1400 + Math.random() * 500, 0.06, 0.06, 'triangle', 0.7, pan); }
  beep(pan = 0) { this.count('beep'); this.tone(1800, 0.05, 0.08, 'square', 0, pan); }
  whoomp(pan = 0) { this.count('whoomp'); this.burst({ dur: 0.9, freq: 300, vol: 0.7, decay: 0.85, pitchDrop: 0.5, pan }); }
  hiss(pan = 0) { this.count('hiss'); this.burst({ dur: 1.6, freq: 3200, type: 'highpass', vol: 0.25, decay: 1.5, pan }); }
  bang(dist = 0) { this.count('bang'); if (this.sample('common', 'explosion.near', { dist, range: 120, vol: 0.8 })) return; const f = Math.max(0.1, 1 - dist / 60); this.burst({ dur: 0.6, freq: 4000, vol: 1.2 * f, decay: 0.5 }); this.tone(3100, 2.2 * f, 0.05 * f, 'sine'); }
  tyrePop(pan = 0) { this.count('tyrePop'); this.burst({ dur: 0.25, freq: 1100, vol: 0.8, decay: 0.2, pitchDrop: 0.3, pan }); }
  backfire(pan = 0) { this.count('backfire'); this.burst({ dur: 0.18, freq: 600, vol: 0.5, decay: 0.15, pitchDrop: 0.4, pan }); }
  whiz(pan = 0) {
    this.count('whiz'); if (this.sample('common', 'whiz', { dist: 2, pan })) return; this.burst({ dur: 0.18, freq: 2600, type: 'bandpass', q: 8, vol: 0.35, decay: 0.16, pitchDrop: 0.4, pan }); }
  ricochet(pan = 0, dist = 0) {
    this.count('ricochet'); if (this.sample('common', 'ricochet', { dist, pan, range: SPATIAL.range.impact })) return; const v = Math.max(0, 0.18 * (1 - dist / 60)); if (v > 0.01) this.tone(1800 + Math.random() * 1600, 0.22, v, 'sine', 0.35, pan); }
  step(surface = 'sand', pan = 0) {
    this.count(`step:${surface}`);
    if (this.sample('common', `step.${surface}`, { dist: 1.5, pan, range: SPATIAL.range.step, vol: surface === 'sand' ? 0.45 : 0.6 })) return;
    const f = surface === 'road' ? 2400 : surface === 'floor' ? 900 : 600;
    this.burst({ dur: 0.07, freq: f, type: surface === 'floor' ? 'bandpass' : 'lowpass', q: surface === 'floor' ? 3 : 0.7, vol: surface === 'sand' ? 0.07 : 0.1, decay: 0.06, pan });
  }
  hit() {
    this.count('hit'); this.burst({ dur: 0.08, freq: 500, vol: 0.35, decay: 0.07 }); }
  death() { this.tone(180, 0.35, 0.08, 'sawtooth', 0.4); }
  explosion(dist = 0) {
    this.count('explosion');
    if (this.sample('common', dist > 110 ? 'explosion.far' : 'explosion.near', { dist, range: SPATIAL.range.explosion, vol: 1.2 })) return;
    const fall = Math.max(0.1, 1 - dist / 140);
    this.burst({ dur: 1.4, freq: 900, vol: 1.3 * fall, decay: 1.3, pitchDrop: 0.06 });
    this.tone(48, 0.8, 0.6 * fall, 'sine', 0.5);
  }
  thunder() {
    this.burst({ dur: 2.5, freq: 260, vol: 1.0, decay: 2.4, pitchDrop: 0.3 });
    this.burst({ dur: 0.4, freq: 1800, vol: 0.4, decay: 0.3, at: 0.02 });
  }
  // A vehicle coming down off a jump: the springs bottoming out (a low boom) and the body slapping its stops; k 0..1.
  land(k = 0.5) {
    this.count('land');
    this.burst({ dur: 0.35, freq: 150 + k * 60, vol: 0.25 + k * 0.55, decay: 0.3, pitchDrop: 0.45 });
    this.tone(48 + k * 20, 0.18, 0.12 + k * 0.2, 'sine', 0.6);
    if (k > 0.45) this.burst({ dur: 0.18, freq: 2600, type: 'bandpass', q: 3, vol: 0.12 + (k - 0.45) * 0.5, decay: 0.16, at: 0.03 }); // metal on metal
  }
  crash(k = 0.5) { if (this.sample('common', 'vehicle.crash', { dist: 3, vol: 0.5 + k * 0.6 })) return; this.burst({ dur: 0.5, freq: 700, vol: Math.min(1, 0.4 + k), decay: 0.45, pitchDrop: 0.4 }); this.burst({ dur: 0.3, freq: 4000, type: 'highpass', vol: 0.3 * k, decay: 0.3 }); }
  skid(k) { if (Math.random() < 0.15) this.burst({ dur: 0.15, freq: 1500, type: 'bandpass', q: 6, vol: Math.min(0.25, k * 0.2), decay: 0.14 }); }
  horn(dist = 0) { const v = Math.max(0, 0.15 * (1 - dist / 40)); this.tone(392, 0.35, v, 'square'); this.tone(330, 0.35, v, 'square'); }
  trainHorn(pan = 0, dist = 0) { this.count('trainHorn'); const v = Math.max(0, 0.32 * (1 - dist / 260)); if (!(v >= 0.01)) return; if (!Number.isFinite(pan)) pan = 0; for (const f of [277, 349, 415]) this.tone(f, 1.6, v, 'sawtooth', 0, pan); }
  // A fevered breath (BITE FEVER, canon: a low breathing loop): in, then out - filtered noise that swells and falls,
  // just under notice. k 0..1: how hard the fever is breathing (treated breathes easier).
  breath(k = 1) {
    if (!this.ctx) return;
    this.count('breath');
    const ctx = this.ctx, v = 0.05 + 0.06 * k;
    const swell = (at, dur, freq, vol) => {
      const t = ctx.currentTime + at;
      const src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 0.9;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + dur * 0.45); g.gain.linearRampToValueAtTime(0.0001, t + dur);
      src.connect(f).connect(g);
      this.out(g, 0);
      src.start(t, Math.random() * 1.5, dur);
    };
    swell(0, 0.8, 900, v);          // in: a little higher
    swell(1.0, 1.1, 520, v * 0.85); // out: lower and longer
  }

  heartbeat(k = 0.5) { this.count('heartbeat'); const v = 0.18 + k * 0.22; this.tone(52, 0.14, v, 'sine', 0.3); setTimeout(() => this.tone(46, 0.16, v * 0.8, 'sine', 0.3), 170); }
  harpoon() { this.burst({ dur: 0.3, freq: 600, vol: 0.8, decay: 0.25, pitchDrop: 0.3 }); this.tone(220, 0.25, 0.2, 'sawtooth', 2.5); }
  clank() { this.tone(820, 0.15, 0.25, 'square', 0.6); this.burst({ dur: 0.1, freq: 3500, type: 'highpass', vol: 0.4, decay: 0.09 }); }
  yank() { this.tone(90, 0.5, 0.35, 'sawtooth', 0.4); this.burst({ dur: 0.6, freq: 1100, vol: 0.8, decay: 0.55, pitchDrop: 0.2 }); }
  blip() { this.tone(660, 0.05, 0.05, 'square'); }
  pickup() { this.tone(880, 0.08, 0.08, 'square'); this.tone(1320, 0.1, 0.06, 'square'); }
  reload(kind = 'pistol') { if (this.sample('common', `reload.${kind === 'shells' || kind === 'shotgun' ? 'shotgun' : kind === 'rifle' || kind === 'smg' ? 'rifle' : 'pistol'}`, { dist: 1, vol: 0.6 })) return; this.tone(300, 0.05, 0.08, 'square'); setTimeout(() => this.tone(240, 0.06, 0.08, 'square'), 120); }
  empty() { if (this.sample('common', 'dry', { dist: 1, vol: 0.6 })) return; this.tone(1200, 0.03, 0.06, 'square'); }
  // Dogs (systems/dogs.js): a bark is a short voiced yelp over a noise chuff; a big dog barks lower. growl, yelp, whine.
  dog(kind, scale = 1, dist = 0, pan = 0) {
    this.count(`dog:${kind}`);
    const f = Math.max(0, 1 - dist / 60), lo = 1 / Math.max(0.5, scale);
    if (f <= 0.01) return;
    if ((kind === 'bark' || kind === 'growl') && this.sample('fauna.dog', kind === 'bark' ? 'idle' : 'attack', { dist, pan, range: 60, rate: lo })) return;
    if (kind === 'bark') { this.tone(420 * lo, 0.11, 0.12 * f, 'sawtooth', 0.55, pan); this.burst({ dur: 0.1, freq: 900 * lo, type: 'bandpass', q: 1.5, vol: 0.35 * f, decay: 0.09, pitchDrop: 0.6, pan }); }
    else if (kind === 'growl') this.tone(95 * lo, 0.6, 0.1 * f, 'sawtooth', 0.85, pan);
    else if (kind === 'yelp') this.tone(1150 * lo, 0.18, 0.1 * f, 'triangle', 0.5, pan);
    else if (kind === 'whine') { this.tone(780 * lo, 0.9, 0.07 * f, 'sine', 0.7, pan); }
  }
  // Your whistle: one short, two, three (higher), a long one, four sharp.
  whistle(call) {
    this.count('whistle');
    const n = { heel: 1, guard: 2, seek: 3, shield: 4 }[call] ?? 0, f = call === 'seek' ? 2300 : 2000;
    if (call === 'sic') { this.tone(1900, 0.7, 0.06, 'sine', 1.25); return; }
    for (let i = 0; i < n; i++) setTimeout(() => this.tone(f, 0.12, 0.06, 'sine', 1.08), i * 150);
  }

  // free: 0..1, the driven wheels are off the ground under throttle (a jump) - nothing to push on, the revs flare.
  ambience(rain, dust, engine, free = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.rainGain.gain.setTargetAtTime(Math.min(1, rain) * 0.35, t, 0.5);
    this.windGain.gain.setTargetAtTime(dust * 0.5 + 0.04, t, 0.5);
    if (engine !== null && engine !== undefined && engine !== false) {
      // Five-speed box: rpm climbs through each gear band, drops on the shift.
      const sp = Math.abs(engine), bands = [0, 9, 17, 25, 33, 60];
      let gear = 0; while (gear < 4 && sp > bands[gear + 1]) gear++;
      const rpm = Math.min(1, (sp - bands[gear]) / (bands[gear + 1] - bands[gear]) + free * 0.55);
      this.engGain.gain.setTargetAtTime(this.eng ? 0 : 0.06 + rpm * 0.05 + free * 0.02, t, 0.1); // the sampled engine (engine()) speaks instead
      this.rpm = rpm;
      this.engOsc.frequency.setTargetAtTime(34 + rpm * 70 + gear * 6, t, 0.06);
    } else this.engGain.gain.setTargetAtTime(0, t, 0.2);
  }
}
