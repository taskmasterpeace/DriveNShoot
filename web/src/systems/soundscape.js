import { BARK_SAMPLE } from '../data/barks.js';
import { setFor } from '../data/audiosets.js';

// THE SOUNDSCAPE (docs/design/WEB_VOICE_STATS.md §2-3): the per-frame half of the sound sets.
//   listener    the audio's ears follow the player (and know when you are under a roof: a wall between you and a
//               sound closes its low-pass)
//   beds        the ambience of where you stand and when: desert, the ruins, swamp, a town's market, a base's gate,
//               day or night, and a weather layer (rain, wind) - crossfaded, checked once a second
//   engine      the vehicle you drive, its own engine class and pitch (data/audiosets.js ENGINES), by rpm and load
//   barks       the fight turning, heard: a fighter who has just seen you, reloads, runs, loses a friend, hurts you,
//               or sees three of their own on you calls it out (data/barks.js), in a rendered voice when the forge made
//               one, else the subtitle over the faction's own wordless bark
// No allocations per frame: the bark pass runs 4x a second over a reused array; state rides on the characters.
const BARK_R = 60;        // m: fighters this close to you bark
const BARK_GAP = 3.5;     // s: one bark per fighter at most this often
const FLANK_GAP = 12;     // s: a faction calls a flank at most this often
const TAUNT_GAP = 6;
const PAIN_GAP = 1.1;

export class Soundscape {
  constructor(game) {
    this.g = game;
    this.bedT = 0; this.barkT = 0;
    this.place = null;
    this.lastSeq = game.eventSeq ?? 0;
    this.flankAt = {};
    this.stats = { barks: 0, voiced: 0, wordless: 0, pain: 0, byKey: {} };
    this.log = [];
    this.on = true;
  }

  // What a footfall lands on (data/audiosets.js STEPS): a deck is metal, a floor indoors wood, the tunnels concrete,
  // shallow water splashes; outdoors the ground the cars read (systems/lookfeel.js surfaceUnder: pavement, mud, sand,
  // grass, dirt), snow over it when it is lying. Asked once a footfall, never per frame.
  footSurface(p, wet = 'dry') {
    const g = this.g;
    if (p.onDeck) return 'metal';
    if (wet === 'wade' || wet === 'swim') return 'water';
    if (p.ug) return 'road';
    if (g.insideBuilding || p.storey) return 'floor';
    const s = g.look?.surfaceUnder ? g.look.surfaceUnder(p) : 'dirt';
    const base = s === 'road' || s === 'wet' ? 'road' : s === 'mud' ? 'mud' : s === 'sand' ? 'sand' : s === 'grass' ? 'grass' : 'dirt';
    return base !== 'road' && (g.sky?.cur?.snow ?? 0) > 0.3 ? 'snow' : base;
  }

  // Where a place's ambience comes from (data/audiosets.js BEDS).
  placeAt(x, z) {
    const g = this.g;
    if (x > 150000) return Math.hypot(x - (g.regions?.townX ?? 0), z - (g.regions?.townZ ?? 0)) < 200 ? 'market' : 'swamp'; // Florida
    const ax = Math.abs(x), az = Math.abs(z);
    if (ax < 88 && az < 88) return 'market';                                   // Rust Haven inside its wall
    for (const b of g.bases?.list ?? g.bases?.bases ?? []) if (b.x !== undefined && Math.hypot(b.x - x, b.z - z) < 120) return 'gate';
    if (x > -330 && x < -250 && z > -440 && z < -350) return 'gate';            // Outpost Nine's wire
    if (ax < 250 && az < 250) return 'ruins';                                   // the Phoenix ruins
    if (ax < 470 && az < 470) return 'desert';                                  // the Glass Flats
    if (Math.hypot(x, z) < 1600) return 'ruins';                                // the dead city ring
    return 'desert';
  }

  update(dt) {
    const g = this.g, A = g.audio, p = g.player;
    if (!A || !p) return;
    A.listener.x = p.x; A.listener.z = p.z; A.listener.indoor = !!g.insideBuilding;
    p.indoor = !!g.insideBuilding;
    if (!this.on) return;
    // The engine you drive.
    const v = p.inVehicle;
    if (v && A.ctx) {
      const sp = Math.abs(g.vehiclesSys?.speed?.(v) ?? 0), rpm = Math.min(1, A.rpm ?? sp / Math.max(1, v.maxSpeed ?? 40));
      A.engine(v.type, rpm, Math.max(0, v.throttle ?? 0));
    } else if (A.eng) A.engine(null);
    // The bed, once a second.
    if ((this.bedT -= dt) <= 0) {
      this.bedT = 1;
      this.place = this.placeAt(p.x, p.z);
      const s = g.sky?.cur, weather = s && s.rain > 0.35 ? 'rain' : s && Math.max(s.dust ?? 0, s.ash ?? 0) > 0.45 ? 'wind' : null;
      A.bed(this.place, (g.sky?.night ?? 0) > 0.5, weather);
    }
    if ((this.barkT -= dt) <= 0) { this.barkT = 0.25; this.barkPass(); }
  }

  // One bark: the line through the voice system (data/barks.js rows), and if no clip carried it, the wordless half.
  bark(c, key) {
    const g = this.g;
    if (!c?.alive || c === g.player || c.faction === 'zombie') return null;
    if ((c.barkAt ?? -9) > g.time) return null;
    c.barkAt = g.time + BARK_GAP;
    const r = g.voice?.say(c, key, {}, { kind: 'bark', key }) ?? null;
    this.stats.barks++; this.stats.byKey[key] = (this.stats.byKey[key] ?? 0) + 1;
    if (r?.played) this.stats.voiced++;
    this.log.push({ t: +g.time.toFixed(1), id: c.id, faction: c.faction, key, text: r?.text ?? null, voiced: !!r?.played });
    if (this.log.length > 30) this.log.shift();
    return r;
  }
  // The wordless half on its own (voice.js calls this when a bark line has no rendered clip).
  wordless(c, key) {
    const kind = BARK_SAMPLE[key];
    if (!kind || !this.g.audio) return false;
    this.stats.wordless++;
    return this.g.audio.sample(setFor(c), kind, { x: c.x, z: c.z, range: 60, indoor: !!c.indoor });
  }

  barkPass() {
    const g = this.g, p = g.player;
    // Events since the last pass: a friend dropped (man down), you were hurt (a taunt).
    let i = g.events.length;
    while (i > 0 && g.events[i - 1].seq > this.lastSeq) i--;
    for (; i < g.events.length; i++) {
      const e = g.events[i]; this.lastSeq = e.seq;
      if (e.type === 'kill' && e.faction && e.faction !== 'zombie') {
        const dead = g.chars.find((x) => x.id === e.victim);
        if (dead && Math.hypot(dead.x - p.x, dead.z - p.z) < BARK_R) {
          let best = null, bd = 30;
          for (const c of g.chars) if (c.alive && c !== dead && c !== p && c.faction === e.faction && c.weapon) { const d = Math.hypot(c.x - dead.x, c.z - dead.z); if (d < bd) { bd = d; best = c; } }
          if (best) this.bark(best, 'combat.man_down');
        }
      } else if (e.type === 'hurt' && e.by) {
        const c = g.chars.find((x) => x.id === e.by);
        if (c && c.faction !== 'zombie' && (c.tauntAt ?? -9) < g.time) { c.tauntAt = g.time + TAUNT_GAP; this.bark(c, 'combat.taunt'); }
      }
    }
    // The fighters near you: a state change is a bark.
    const fighting = {};
    for (const c of g.chars) {
      if (!c.alive || c === p || c.faction === 'zombie' || c.npc?.quiet) continue;
      if (Math.abs(c.x - p.x) > BARK_R || Math.abs(c.z - p.z) > BARK_R) { c.bkState = c.state; continue; }
      const was = c.bkState, rel = c.bkRel ?? 0, fled = c.bkFlee ?? 0, hp0 = c.bkHp ?? c.hp;
      if (c.state === 'fight' && c.target && was !== 'fight') this.bark(c, 'combat.alert');
      else if (c.reloading > 0 && rel <= 0 && c.target) this.bark(c, 'combat.reload');
      else if (c.weapon && c.flee > 0 && fled <= 0) this.bark(c, c.maxHp && c.hp < c.maxHp * 0.3 ? 'combat.surrender' : 'combat.retreat');
      if (c.hp < hp0 - 1 && (c.painAt ?? -9) < g.time) { c.painAt = g.time + PAIN_GAP; this.stats.pain++; this.g.audio?.sample(setFor(c), 'bark.pain', { x: c.x, z: c.z, range: 50 }); }
      if (c.state === 'fight' && c.target === p) fighting[c.faction] = (fighting[c.faction] ?? 0) + 1;
      c.bkState = c.state; c.bkRel = c.reloading ?? 0; c.bkFlee = c.flee ?? 0; c.bkHp = c.hp;
    }
    for (const f in fighting) {
      if (fighting[f] < 3 || (this.flankAt[f] ?? -99) > g.time) continue;
      this.flankAt[f] = g.time + FLANK_GAP;
      let caller = null; for (const c of g.chars) if (c.alive && c.faction === f && c.state === 'fight' && c.target === p) { caller = c; break; }
      if (caller) { caller.barkAt = -9; this.bark(caller, 'combat.flank'); }
    }
  }

  view() {
    const A = this.g.audio;
    return { on: this.on, place: this.place, bed: A?.beds?.a?.id ?? null, weather: A?.beds?.b?.id ?? null, engine: A?.eng?.key ?? null,
      listener: A ? { x: +A.listener.x.toFixed(1), z: +A.listener.z.toFixed(1), indoor: A.listener.indoor } : null,
      samples: A?.sampleStats ?? null, voices: A?.voices?.filter((v) => !v.done).length ?? 0, barks: this.stats, recent: this.log.slice(-8) };
  }
}
