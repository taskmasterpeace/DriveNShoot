import { AMBIENT_LAYERS, BIOME_AMBIENCE, AMBIENCE, FAR } from '../data/worldvoice.js';
import { BIOMES } from '../data/streaming.js';

// THE FAR SOUND (docs/design/WEB_WORLD_VOICE.md §3.1-3.2): what the land sounds like, and what you hear of things that
// really happened out of sight.
//   ambience   layered synth voices (data/worldvoice.js AMBIENT_LAYERS) mixed by the biome under you, by region, day or
//              night, rain and dust; checked once a second and crossfaded, so a biome border is heard as it is crossed.
//              It rides beside the recorded beds (systems/soundscape.js), never instead of them.
//   far        a shot, a volley, a blast, an engine, the dead, a town's dogs: queued ONLY from a real source (a round
//              fired by a real body, a chronicle row the off-screen sim wrote, a vehicle with a driver, a horde record,
//              a place with people in it), and heard after distance / 343 m/s from its true bearing. Law 6: the sound
//              is real news, so nothing here ever makes one up.
// Fixed pools: the queue and the ledger are preallocated rings; nothing allocates per frame.
const DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const r1 = (v) => Math.round(v * 10) / 10;

export function bearingOf(dx, dz) { const b = (Math.atan2(dx, -dz) * 180 / Math.PI + 360) % 360; return { deg: Math.round(b), dir: DIRS[Math.round(b / 45) % 8] }; } // north is -z (up the screen)

export class FarSound {
  constructor(game) {
    this.g = game;
    this.on = true;
    // ambience
    this.mixT = 0; this.biome = null; this.region = null; this.mix = {}; this.voices = {}; this.bus = null;
    for (const k in AMBIENT_LAYERS) this.mix[k] = 0;
    this.borders = 0;
    // far
    this.q = Array.from({ length: FAR.queueCap }, () => ({ live: false, kind: '', x: 0, z: 0, at: 0, fired: 0, d: 0, src: '', id: '', n: 0, gain: 1 }));
    this.ledger = Array.from({ length: FAR.ledger }, () => null); this.lh = 0; this.heardN = 0;
    this.scanT = 0; this.chronSeq = null; this.lastBy = new Map(); this.dogT = new Map();
    this.stats = { queued: 0, heard: 0, dropped: 0, byKind: {} };
  }

  // ---- ambience ---------------------------------------------------------------------------------------------------------
  // The biome's own name under (x, z) and the region's id (Florida's rows, Arizona's).
  biomeAt(x, z) {
    const W = this.g.streamer?.W;
    if (!W?.biomeAt) return { name: 'desert', region: null };
    const key = W.biomeAt(x, z), R = W.regionOf?.(x, z, 3000) ?? null;
    const B = R ? R.biome?.(key) : BIOMES[key];
    return { name: B?.name ?? BIOMES[key]?.name ?? 'desert', region: R?.id ?? null, key };
  }
  // The mix a place calls for (0..1 per layer): the biome row (region override), day/night blend, weather, roof.
  target(name, region, night, wx, indoor) {
    const row = BIOME_AMBIENCE[region]?.[name] ? { ...BIOME_AMBIENCE[name], ...BIOME_AMBIENCE[region][name] } : BIOME_AMBIENCE[name] ?? BIOME_AMBIENCE.desert;
    const out = {};
    for (const k in AMBIENT_LAYERS) {
      let v = (row.day?.[k] ?? 0) * (1 - night) + (row.night?.[k] ?? 0) * night;
      const insect = AMBIENCE.insects.includes(k);
      if (wx.rain) v *= insect ? AMBIENCE.rain.insects : k === 'frogs' ? AMBIENCE.rain.frogs : k === 'wind' ? AMBIENCE.rain.wind : 1;
      if (wx.dust) v *= insect ? AMBIENCE.dust.insects : k === 'wind' ? AMBIENCE.dust.wind : k === 'gusts' ? AMBIENCE.dust.gusts : 1;
      if (indoor) v *= AMBIENCE.indoor;
      out[k] = Math.round(Math.min(1.5, v) * 1000) / 1000;
    }
    return out;
  }
  ambience(x, z) {
    const g = this.g, b = this.biomeAt(x, z), s = g.sky?.cur;
    const wx = { rain: !!(s && s.rain > 0.35), dust: !!(s && Math.max(s.dust ?? 0, s.ash ?? 0) > 0.45) };
    if (this.biome && b.name !== this.biome) { this.borders++; g.emit?.('biomeSound', { from: this.biome, to: b.name, x: Math.round(x), z: Math.round(z) }); }
    this.biome = b.name; this.region = b.region;
    const t = this.target(b.name, b.region, g.sky?.night ?? 0, wx, !!g.insideBuilding || !!g.player?.ug);
    for (const k in t) this.mix[k] = t[k];
    this.apply();
  }
  // Web Audio: one voice per layer, built the first time it is wanted, its gain eased to the mix.
  apply() {
    const A = this.g.audio, ctx = A?.ctx;
    if (!ctx || !A.noiseBuf) return;
    if (!this.bus) { this.bus = ctx.createGain(); this.bus.gain.value = AMBIENCE.master; this.bus.connect(A.master); }
    const t = ctx.currentTime;
    for (const k in this.mix) {
      const want = this.mix[k] * AMBIENT_LAYERS[k].gain;
      let v = this.voices[k];
      if (!v && want > 0.0005) v = this.voices[k] = this.voice(ctx, A, AMBIENT_LAYERS[k]);
      if (v) v.out.gain.setTargetAtTime(want, t, AMBIENCE.fade);
    }
  }
  voice(ctx, A, L) {
    let src;
    if (L.src === 'noise') { src = ctx.createBufferSource(); src.buffer = A.noiseBuf; src.loop = true; src.playbackRate.value = 0.9 + Math.random() * 0.2; }
    else { src = ctx.createOscillator(); src.type = L.src === 'saw' ? 'sawtooth' : 'sine'; src.frequency.value = L.freq ?? 440; }
    let node = src;
    if (L.filter) { const f = ctx.createBiquadFilter(); f.type = L.filter[0]; f.frequency.value = L.filter[1]; f.Q.value = L.filter[2]; node.connect(f); node = f; }
    const lfo = (spec, into) => { // gain = 1 - depth/2 + depth/2 * wave
      const o = ctx.createOscillator(); o.type = spec[2] === 'square' ? 'square' : 'sine'; o.frequency.value = spec[0] * (0.92 + Math.random() * 0.16);
      const d = ctx.createGain(); d.gain.value = spec[1] / 2; into.gain.value = 1 - spec[1] / 2; o.connect(d).connect(into.gain); o.start();
    };
    if (L.am) { const g = ctx.createGain(); node.connect(g); lfo(L.am, g); node = g; }
    if (L.swell) { const g = ctx.createGain(); node.connect(g); lfo(L.swell, g); node = g; }
    const out = ctx.createGain(); out.gain.value = 0; node.connect(out).connect(this.bus);
    src.start();
    return { out };
  }

  // ---- far: the queue -----------------------------------------------------------------------------------------------
  me() { const p = this.g.player, v = p?.inVehicle; return v ? { x: v.x, z: v.z } : { x: p?.x ?? 0, z: p?.z ?? 0 }; }
  rangeOf(kind) {
    const K = FAR.kinds[kind], s = this.g.sky?.cur;
    let r = K.range;
    if (s && s.rain > 0.35) r *= FAR.weather.rain;
    if (s && Math.max(s.dust ?? 0, s.ash ?? 0) > 0.45) r *= FAR.weather.dust;
    if (this.g.insideBuilding) r *= FAR.indoor;
    return r;
  }
  // A real thing made a sound at (x, z). Queued only if it carries to you and the near sound does not already cover it.
  // src: what made it ('shot' | 'chronicle' | 'vehicle' | 'horde' | 'dogs'), id: which one. Returns the slot or null.
  emit(kind, x, z, src, id, n = 1) {
    const K = FAR.kinds[kind]; if (!K || !this.on) return null;
    const me = this.me(), d = Math.hypot(x - me.x, z - me.z);
    if (d < K.near || d > this.rangeOf(kind)) return null;
    if (K.gap) { const key = `${kind}|${id}`, last = this.lastBy.get(key) ?? -1e9; if (this.g.time - last < K.gap) return null; this.lastBy.set(key, this.g.time); }
    const s = this.q.find((e) => !e.live);
    if (!s) { this.stats.dropped++; return null; }
    s.live = true; s.kind = kind; s.x = x; s.z = z; s.d = d; s.fired = this.g.time; s.at = this.g.time + d / FAR.c; s.src = src; s.id = String(id ?? ''); s.n = n;
    s.gain = K.gain * Math.max(0.12, 1 - d / this.rangeOf(kind));
    this.stats.queued++;
    return s;
  }
  // A round fired by a real body (systems/combat.js fire).
  shot(ch, w) { if (ch) this.emit(w?.pellets > 4 ? 'shot' : 'shot', ch.x, ch.z, 'shot', ch.id ?? 'someone'); }
  blast(x, z, id = 'blast') { this.emit('explosion', x, z, 'blast', id); }

  // Something lands: played from its bearing, written to the ledger (what you heard, when, from where).
  land(s) {
    const g = this.g, A = g.audio, me = this.me(), K = FAR.kinds[s.kind];
    const dx = s.x - me.x, dz = s.z - me.z, d = Math.hypot(dx, dz), b = bearingOf(dx, dz);
    const pan = Math.max(-1, Math.min(1, dx / Math.max(1, d)));
    if (A?.ctx) this.play(A, s, K, d, pan);
    const e = { seq: ++this.heardN, kind: s.kind, src: s.src, id: s.id, x: Math.round(s.x), z: Math.round(s.z), d: Math.round(d), deg: b.deg, dir: b.dir,
      fired: r1(s.fired), heard: r1(g.time), delay: Math.round((g.time - s.fired) * 100) / 100, expect: Math.round(s.d / FAR.c * 100) / 100, n: s.n, caption: `${K.caption} · ${b.dir}` };
    this.ledger[this.lh] = e; this.lh = (this.lh + 1) % FAR.ledger;
    this.stats.heard++; this.stats.byKind[s.kind] = (this.stats.byKind[s.kind] ?? 0) + 1;
    if (s.kind !== 'dogs' && s.kind !== 'engine') g.hud?.subtitle?.(`[${e.caption}]`, 2.4);
    g.emit?.('farHeard', { kind: e.kind, src: e.src, dir: e.dir, d: e.d, delay: e.delay });
    s.live = false;
    return e;
  }
  play(A, s, K, d, pan) {
    const muffle = { dist: d, pan, range: K.range * 1.05, vol: s.gain };
    if (s.kind === 'volley') {
      const n = s.n || 6;
      for (let i = 0; i < n; i++) setTimeout(() => A.sample(K.set[0], K.set[1], muffle) || A.burst({ dur: 0.5, freq: 520, vol: 0.25 * s.gain, decay: 0.45, pan }), (i / n) * K.spread * 1000 + Math.random() * 180);
    } else if (s.kind === 'engine') {
      A.tone(48 + Math.random() * 10, 2.6, 0.05 * s.gain, 'sawtooth', 1.15, pan); A.burst({ dur: 2.4, freq: 220, vol: 0.12 * s.gain, decay: 2.2, pan });
    } else if (K.set) {
      if (!A.sample(K.set[0], K.set[1], { ...muffle, rate: K.pitch })) A.burst({ dur: 0.45, freq: 600, vol: 0.3 * s.gain, decay: 0.4, pan });
    }
  }

  // ---- far: the sources -------------------------------------------------------------------------------------------------
  scan() {
    const g = this.g, me = this.me();
    // Rows the off-screen world wrote since the last look (a skirmish, a raid, a fall): a volley from where it was.
    const C = g.society?.chronicle;
    if (C) {
      if (this.chronSeq === null) this.chronSeq = C.seq;
      if (C.seq > this.chronSeq) {
        for (const r of C.query({ since: this.chronSeq, limit: 24 })) {
          const kind = FAR.verbs[r.v]; if (!kind || !FAR.offscreen.includes(r.src)) continue;
          let x = r.x, z = r.z;
          if (!x && !z && r.p) { const P = g.citygen?.byId?.get(r.p) ?? g.society.places?.[r.p]; x = P?.x ?? P?.circle?.[0] ?? 0; z = P?.z ?? P?.circle?.[1] ?? 0; }
          if (!x && !z) continue;
          const rng = (r.seq * 2654435761) >>> 0, Kv = FAR.kinds[kind];
          this.emit(kind, x, z, 'chronicle', `chron:${r.seq}`, Kv.shots ? Kv.shots[0] + (rng % (Kv.shots[1] - Kv.shots[0] + 1)) : 1);
        }
        this.chronSeq = C.seq;
      }
    }
    // Vehicles with somebody at the wheel, moving: an engine on the wind.
    for (const v of g.vehicles ?? []) {
      if (v === g.player.inVehicle || !v.driver || v.dead) continue;
      const sp = Math.abs(g.vehiclesSys?.speed?.(v) ?? v.speed ?? 0); if (sp < 4) continue;
      const d = Math.abs(v.x - me.x) + Math.abs(v.z - me.z); if (d > FAR.kinds.engine.range * 1.5) continue;
      this.emit('engine', v.x, v.z, 'vehicle', v.id);
    }
    // A record moving on the road (site stories' parties by car, when that system runs).
    for (const m of g.stories?.movers ?? []) if (m.car && m.state === 'road' && !m.live) this.emit('engine', m.x, m.z, 'mover', m.id); // a live party's car is a real vehicle, heard above
    // The dead in a body (systems/overrun.js hordes).
    for (const H of g.citygen?.overrun?.hordes ?? []) if ((H.strength ?? 1) > 0) this.emit('horde', H.x, H.z, 'horde', H.id ?? `${Math.round(H.x)}:${Math.round(H.z)}`);
    // A place with people barks; something real moving near it stirs the dogs.
    this.dogs(me);
  }
  dogs(me) {
    const g = this.g, K = FAR.kinds.dogs, P = g.pulls;
    if (!P?.nodes) return;
    for (const n of P.nodes()) {
      const d = Math.hypot(n.x - me.x, n.z - me.z); if (d < K.near || d > K.range) continue;
      const rec = g.citygen?.byId?.get(n.id);
      if (rec && rec.state === 'overrun') continue; // nobody left to keep a dog
      const stir = this.stirAt(n.x, n.z);
      const night = (g.sky?.night ?? 0) > 0.5;
      if (!stir && !night) continue;               // by day a quiet town's dogs sleep in the shade
      const due = this.dogT.get(n.id) ?? 0;
      if (g.time < due) continue;
      const gap = stir ? K.stirred : K.gap;
      this.dogT.set(n.id, g.time + gap * (0.7 + ((n.x * 7 + g.time) % 1) * 0.6));
      this.emit('dogs', n.x, n.z, stir ? `dogs:${stir}` : 'dogs', n.id);
    }
  }
  // What is really moving near (x, z): a horde, a driven car, a character not of that place. Returns its kind or null.
  stirAt(x, z) {
    const g = this.g, R = FAR.dogsAt.stirR;
    for (const H of g.citygen?.overrun?.hordes ?? []) if (Math.hypot(H.x - x, H.z - z) < R) return 'horde';
    for (const v of g.vehicles ?? []) if (v.driver && Math.abs(v.x - x) < R && Math.abs(v.z - z) < R) return 'vehicle';
    for (const m of g.stories?.movers ?? []) if (m.state === 'road' && Math.hypot(m.x - x, m.z - z) < R) return 'mover';
    return null;
  }

  update(dt) {
    const g = this.g;
    if (!this.on || !g.player) return;
    if ((this.mixT -= dt) <= 0) { this.mixT = AMBIENCE.every; const me = this.me(); this.ambience(me.x, me.z); }
    if ((this.scanT -= dt) <= 0) { this.scanT = FAR.scanEvery; this.scan(); }
    for (const s of this.q) if (s.live && g.time >= s.at) this.land(s);
  }

  heard(limit = 20, kind = null) {
    const out = [];
    for (let n = 1; n <= FAR.ledger && out.length < limit; n++) { const e = this.ledger[(this.lh - n + FAR.ledger) % FAR.ledger]; if (e && (!kind || e.kind === kind)) out.push(e); }
    return out;
  }
  pending() { return this.q.filter((s) => s.live).map((s) => ({ kind: s.kind, src: s.src, id: s.id, d: Math.round(s.d), inS: r1(s.at - this.g.time) })); }
  clear() { for (const s of this.q) s.live = false; this.ledger.fill(null); this.lastBy.clear(); this.dogT.clear(); }
  view() { return { on: this.on, biome: this.biome, region: this.region, borders: this.borders, mix: { ...this.mix }, voices: Object.keys(this.voices), pending: this.pending(), heard: this.heard(8), stats: this.stats }; }
}
