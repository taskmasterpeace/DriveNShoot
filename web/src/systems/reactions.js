import { REACT, REACTIONS, TEMPERAMENTS, PROFILES } from '../data/reactions.js';
import { OCCUPATIONS } from '../data/occupations.js';
import { CHANNELS } from '../data/pulls.js';
import { hash32 } from '../world/geo.js';
import { angleLerp } from '../engine/rng.js';
import { TOWN_NIGHT } from '../data/survival.js';

// GUNFIRE REACTIONS (docs/design/WEB_GUNFIRE_REACTIONS.md; rows in data/reactions.js). A shot fired is HEARD by the
// people in earshot, each at their own loudness, bearing and error (law 6: nobody knows what they weren't told), and each
// does what their profile, temperament, the band they heard it at, their gun, the hour and their town's nerves say.
//   onShot(x, z, wkey, src)  combat.fire, before g.noise: who heard it, what they make of it, what they will do
//   think(c, dt)             ai.update, for someone with c.rx: the reaction itself (true = handled this frame)
//   update(dt)               per frame: the doors they barred come unbarred when they come out
//   profileOf(c) / temperOf(c) / place(x, z)   the picks (the `react` command reads them)
// c.rx is a person's reaction: { seq, kind, row, profile, temper, band, loud, err, heard: {x, z, bearing, d}, t0, t1, ... }.
// (c.react is ai.js's aim delay; never share it.)
const D2R = Math.PI / 180, R2D = 180 / Math.PI;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const DIRS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
// The heading (x = sin, z = cos) as a compass word; -z is north on the map (world/geo.js convention).
export const dirWord = (ang) => DIRS[((Math.round(wrap(Math.PI - ang) / (Math.PI / 4)) % 8) + 8) % 8];
const TEMPER_IDS = Object.keys(TEMPERAMENTS), TEMPER_W = TEMPER_IDS.reduce((s, k) => s + TEMPERAMENTS[k].w, 0);
const u01 = (h) => (h >>> 0) / 4294967296;
const strHash = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; };

export class Reactions {
  constructor(game) {
    this.g = game;
    this.enabled = true;
    this.seq = 0;                // shots heard so far (each listener's error rolls from it)
    this.places = new Map();     // place key -> { j, t, shots, x, z }
    this.barred = [];            // doors barred by someone hiding: { door, by, wasLocked }
    this.barkAt = -9;
    this.last = null;            // the last shot's summary (the `react` command, the selftest)
    this.stats = { shots: 0, heard: 0, kinds: {}, callIns: 0, screams: 0, barred: 0, slams: 0, woke: 0 };
    this._near = [];             // scratch: [d, c] pairs for the nearest-first cut (pooled: an SMG fires a dozen times a second)
    this._pairs = [];
    this._raised = new Map();    // scratch: place key -> the loudest ear there, this shot
  }

  // ---- the picks -------------------------------------------------------------------------------------------------------
  temperOf(c) {
    if (c.rxTemper && TEMPERAMENTS[c.rxTemper]) return c.rxTemper;
    const key = c.npc?.id ?? c.occRec?.seed ?? c.res?.m?.seed ?? c.name ?? c.id;
    let u = u01(hash32(strHash(String(key)), 0x7e3)) * TEMPER_W;
    for (const k of TEMPER_IDS) { u -= TEMPERAMENTS[k].w; if (u <= 0) return k; }
    return 'steady';
  }
  occOf(c) { return c.occRec?.occ ?? c.occ ?? null; }
  kinOf(c) {
    const g = this.g;
    if (c.kin) { const k = typeof c.kin === 'string' ? g.chars.find((o) => o.id === c.kin) : c.kin; return k?.alive ? k : null; }
    const rec = c.res?.rec;
    if (rec?.kind !== 'family' || !rec.members) return null;
    let best = null, bd = REACT.kinR;
    for (const m of rec.members) { const o = m.c; if (!o || o === c || !o.alive || o.weapon) continue; const d = Math.hypot(o.x - c.x, o.z - c.z); if (d < bd) { bd = d; best = o; } }
    return best;
  }
  matches(c, when, kin) {
    if (when.child !== undefined && !!c.child !== when.child) return false;
    if (when.kin !== undefined && !!kin !== when.kin) return false;
    if (when.armed !== undefined && !!c.weapon !== when.armed) return false;
    if (when.any) {
      const occ = this.occOf(c), title = String(c.title ?? c.npc?.role ?? c.npc?.title ?? '').toLowerCase();
      let hit = false;
      for (const a of when.any) {
        const i = a.indexOf(':'), k = a.slice(0, i), v = a.slice(i + 1);
        if ((k === 'occ' && occ === v) || (k === 'faction' && c.faction === v) || (k === 'title' && title.includes(v))) { hit = true; break; }
      }
      if (!hit) return false;
    }
    return true;
  }
  profileOf(c, kin = this.kinOf(c)) {
    if (c.rxProfile) { const p = PROFILES.find((r) => r.id === c.rxProfile); if (p) return p; }
    for (const p of PROFILES) if (this.matches(c, p.when ?? {}, kin)) return p;
    return PROFILES[PROFILES.length - 1];
  }

  // A place's jumpiness now (decayed by the quiet since it was last raised).
  placeKey(x, z) { const s = REACT.jump.cell; return `${Math.floor(x / s)},${Math.floor(z / s)}`; }
  place(x, z) {
    const P = this.places.get(this.placeKey(x, z));
    if (!P) return 0;
    return P.j * Math.pow(0.5, Math.max(0, this.g.time - P.t) / REACT.jump.halfLife);
  }
  raise(key, x, z, amt) {
    let P = this.places.get(key);
    if (!P) { P = { j: 0, t: this.g.time, shots: 0, x, z }; this.places.set(key, P); }
    const now = P.j * Math.pow(0.5, Math.max(0, this.g.time - P.t) / REACT.jump.halfLife);
    P.j = Math.min(REACT.jump.max, now + amt); P.t = this.g.time; P.shots++;
    if (this.places.size > 200) for (const [k, q] of this.places) if (q.j * Math.pow(0.5, (this.g.time - q.t) / REACT.jump.halfLife) < 0.01) this.places.delete(k);
  }

  // What this person would pick at a band (weights after temperament, gun and jumpiness), and the pick for a roll u.
  weights(c, prof, temper, band, j) {
    const T = TEMPERAMENTS[temper], row = prof.pick[band] ?? prof.pick.any, out = {};
    for (const [k0, w0] of Object.entries(row)) {
      let k = T.swap?.[k0] ?? k0, w = w0;
      const X = REACTIONS[k];
      if (X.needs === 'armed' && !c.weapon) { k = X.move === 'fight' ? 'cover' : 'freeze'; }
      const Y = REACTIONS[k];
      if (Y.calm || k === 'freeze') w *= (T.calmMul ?? 1) * (1 - REACT.jump.calmCut * j);
      if (Y.scared) w *= 1 + REACT.jump.scareAdd * j;
      if (w > 0) out[k] = (out[k] ?? 0) + w;
    }
    if (T.override && !prof.firm) return { [T.override]: 1 };
    return out;
  }
  pick(w, u) {
    let s = 0; for (const k in w) s += w[k];
    let t = u * s;
    for (const k in w) { t -= w[k]; if (t <= 0) return k; }
    return Object.keys(w)[0] ?? 'freeze';
  }

  // Who is in this system's hands: the town's people (drifters, the law, the named, the ring's households, the workers).
  // Fighters (raiders, soldiers, a base's garrison), your crew, the infected and the animals keep their own minds.
  listens(c, src) {
    const g = this.g;
    if (!c.alive || c === g.player || c === src || c.inVehicle || c.ug || c.hidden || c.dragged || c.captive) return false;
    if (c.faction === 'zombie' || c.fauna || c.gv || c.crewRec || c.follower || c.baseId || c.mbId || c.ugRole || c.telling || c.trundle || c.husk || c.perch) return false;
    if (c.crewCand || c.storyM || c.storyCamp || c.storyGarrison || c.pullRec || c.barRole || c.wild || c.hunt || c.trailing || c.picker) return false;
    if (c.target) return false; // already in a fight: the fight's brain has them
    return c.faction === 'drifter' || c.faction === 'warden' || !!c.npc || !!c.res || !!c.occRec || !!c.rxProfile;
  }

  // ---- a shot ----------------------------------------------------------------------------------------------------------
  // (x, z): where the gun went off. r: its noise radius (combat.js: 45). wkey: the gun (loudness). src: who fired.
  onShot(x, z, r = 45, wkey = null, src = null) {
    if (!this.enabled) return null;
    const g = this.g, seq = ++this.seq;
    this.stats.shots++;
    const loudMul = REACT.loud[wkey] ?? REACT.loud.default, night = g.ai?.night?.() ?? false;
    const base = r * REACT.earMul * loudMul;
    const near = this._near, pool = this._pairs; near.length = 0;
    for (const c of g.chars) {
      const dx = x - c.x, dz = z - c.z;
      if (Math.abs(dx) > base * 1.5 || Math.abs(dz) > base * 1.5 || !this.listens(c, src)) continue;
      const pr = pool[near.length] ?? (pool[near.length] = [0, null]);
      pr[0] = Math.hypot(dx, dz); pr[1] = c; near.push(pr);
    }
    near.sort((a, b) => a[0] - b[0]);
    const sum = { seq, x: Math.round(x), z: Math.round(z), wkey, by: src?.id ?? null, at: +g.time.toFixed(2), heard: [], deaf: 0, deafs: [], kinds: {} };
    const raised = this._raised; raised.clear();
    let moved = 0;
    for (const [d, c] of near) {
      const T = TEMPERAMENTS[this.temperOf(c)];
      const j = this.place(c.x, c.z);
      const wall = !g.los(c.x, c.z, x, z);
      let range = base * T.ear * (1 + REACT.jump.earAdd * j) * (wall ? REACT.wallMul : 1) * (c.sleeping ? REACT.sleepEar * TOWN_NIGHT.hearAsleep / REACT.earMul : 1); // asleep: the town's own half an ear (about 20 m for a pistol)
      if (d >= range) { sum.deaf++; if (sum.deafs.length < 12) sum.deafs.push({ id: c.id, d: Math.round(d), range: Math.round(range), wall, asleep: !!c.sleeping }); continue; }
      if (moved >= REACT.maxPerShot) break;
      const loud = 1 - d / range, band = loud >= REACT.bands.near ? 'near' : loud >= REACT.bands.mid ? 'mid' : 'far';
      const k = this.placeKey(c.x, c.z); raised.set(k, Math.max(raised.get(k) ?? 0, loud));
      // Already reacting: a moving reaction takes the new bearing (they heard it too) and keeps going longer; a calm one
      // (or a freeze) is reconsidered at the new loudness.
      const old = c.rx;
      if (old && !old.row.calm && old.kind !== 'freeze' && !old.done) { this.hear(c, old, x, z, d, wall, seq); old.t1 = Math.max(old.t1, g.time + old.row.secs[0] * 0.5); continue; }
      this.react(c, x, z, d, wall, seq, loud, band, j, night, src);
      moved++;
      sum.heard.push({ id: c.id, kind: c.rx?.kind ?? null, band, d: Math.round(d) });
      if (c.rx) sum.kinds[c.rx.kind] = (sum.kinds[c.rx.kind] ?? 0) + 1;
    }
    for (const [k, loud] of raised) this.raise(k, x, z, REACT.jump.perShot * Math.max(0.25, loud));
    for (const pr of near) pr[1] = null; // let the pool forget who was in it
    this.stats.heard += sum.heard.length;
    this.last = sum;
    g.emit('shotHeard', { seq, x: sum.x, z: sum.z, by: sum.by, n: sum.heard.length, kinds: sum.kinds });
    return sum;
  }

  // What c heard of this shot: the bearing with its error, the guessed distance, the spot they think it came from.
  hear(c, rx, x, z, d, wall, seq) {
    const h = hash32(strHash(c.id), seq, 0x51ab);
    const u1 = u01(h) * 2 - 1, u2 = u01(hash32(h, 7)) * 2 - 1;
    const bound = Math.min(REACT.errMax, (REACT.errBase + REACT.errPerM * d) * (wall ? REACT.errWall : 1));
    const truth = Math.atan2(x - c.x, z - c.z), err = bound * u1;
    const bearing = wrap(truth + err * D2R), dGuess = Math.max(4, d * (1 + REACT.distErr * (wall ? 1.5 : 1) * u2));
    rx.err = +err.toFixed(2); rx.errBound = +bound.toFixed(2); rx.d = +d.toFixed(1); rx.wall = wall; rx.seqHeard = seq;
    const H = rx.heard ?? (rx.heard = { x: 0, z: 0, bearing: 0, d: 0 });
    H.bearing = bearing; H.d = dGuess; H.x = c.x + Math.sin(bearing) * dGuess; H.z = c.z + Math.cos(bearing) * dGuess;
  }

  react(c, x, z, d, wall, seq, loud, band, j, night, src) {
    const g = this.g, temper = this.temperOf(c), T = TEMPERAMENTS[temper], kin = this.kinOf(c), prof = this.profileOf(c, kin);
    const roll = u01(hash32(strHash(c.id), seq, 0x9e37));
    const w = this.weights(c, prof, temper, band, j);
    let kind = c.rxPick && REACTIONS[c.rxPick] ? c.rxPick : this.pick(w, roll);
    // Return fire needs the shooter in sight (inside the sight range for the hour); otherwise they go and look.
    let seen = false;
    if (REACTIONS[kind].move === 'fight') {
      const sr = night ? REACT.seeRNight : REACT.seeR;
      seen = !!src && src.alive && d < sr && g.sees(c, src) && g.ai.hostile(c, src); // a friend's shot (or yours at the dead) is looked into, never shot back at
      if (!seen) kind = c.weapon ? 'look' : 'cover';
    }
    if (REACTIONS[kind].move === 'kin' && !kin) kind = 'hide';
    const row = REACTIONS[kind];
    this.clearPose(c);
    const rx = c.rx = { seq, kind, row, profile: prof.id, temper, band, loud: +loud.toFixed(2), j: +j.toFixed(2), heard: null, route: null, ri: 0, t0: 0, t1: 0, started: false, done: false,
      asleep: !!c.sleeping, door: null, phase: 0, kin: kin?.id ?? null, kinC: kin, follow: null, pose: null, src: seen ? src : null, said: false };
    this.hear(c, rx, x, z, d, wall, seq);
    const r2 = u01(hash32(strHash(c.id), seq, 0x2c1b));
    const delay = c.sleeping ? (REACT.wake[0] + (REACT.wake[1] - REACT.wake[0]) * r2) * T.rouse
      : (REACT.delay[0] + (REACT.delay[1] - REACT.delay[0]) * r2) * T.nerve * (1 - REACT.jump.delayCut * j);
    rx.delay = +delay.toFixed(2);
    rx.t0 = g.time + delay;
    const secs = (row.secs[0] + (row.secs[1] - row.secs[0]) * u01(hash32(strHash(c.id), seq, 0x77))) * (1 + REACT.jump.secsAdd * j);
    rx.secs = +secs.toFixed(1);
    rx.t1 = rx.t0 + secs;
    this.stats.kinds[kind] = (this.stats.kinds[kind] ?? 0) + 1;
    g.emit('gunReact', { id: c.id, name: c.npc?.name ?? c.name, kind, profile: prof.id, temper, band, d: Math.round(d), err: rx.err, delay: rx.delay, asleep: rx.asleep, j: rx.j });
    return rx;
  }

  // ---- the reaction, per frame (ai.update) -----------------------------------------------------------------------------
  think(c, dt) {
    const rx = c.rx, g = this.g;
    if (!rx) return false;
    if (!c.alive || c.inVehicle) { this.end(c); return false; }
    if (rx.kind === 'follow') return this.followThink(c, dt);
    if (c.target && c.weapon) { this.end(c); return false; } // a hostile in sight (ai.scan): the fight comes first
    if (c.telling || c.crewRec || c.follower) { this.end(c); return false; } // a witness now running home to tell it, or taken on as crew: theirs, not ours
    const now = g.time;
    if (now < rx.t0) { // not yet: a sleeper sleeps on; the awake carry on with what they were doing
      if (rx.asleep && c.sleeping) { c.speed = 0; return true; }
      return false;
    }
    if (!rx.started) this.start(c, rx);
    if (rx.done) return false;
    const row = rx.row;
    if (row.calm) { if (now >= rx.t1) this.end(c); return false; } // they carry on: whatever had them before still has them
    if (now >= rx.t1 && !(row.move === 'kin' && rx.phase < 2)) { this.end(c); return false; }
    c.flee = 0; c.work = false;
    switch (row.move) {
      case 'none': c.speed = 0; c.face = angleLerp(c.face, rx.heard.bearing, Math.min(1, dt * 5)); break;
      case 'away': this.away(c, rx, row.speed, dt); break;
      case 'cover':
        if (now - rx.t0 < 1.1) this.away(c, rx, row.speed, dt);
        else { c.speed = 0; c.crouch = true; c.face = angleLerp(c.face, rx.heard.bearing, Math.min(1, dt * 4)); }
        break;
      case 'toward': this.toward(c, rx, row, dt); break;
      case 'door': this.toDoor(c, rx, row, dt); break;
      case 'bed': this.toBed(c, rx, row, dt); break;
      case 'kin': this.toKin(c, rx, row, dt); break;
      default: this.end(c); return false;
    }
    this.pose(c, rx);
    return true;
  }

  start(c, rx) {
    const g = this.g;
    rx.started = true;
    if (c.sleeping) { g.ai.wake(c, 'gunfire'); this.stats.woke++; }
    if (rx.row.move === 'fight') {
      if (rx.src?.alive) { c.target = rx.src; c.state = 'fight'; c.grudge = c.grudge ?? null; }
      this.bark(c, rx); rx.done = true; c.rx = null; return;
    }
    if (rx.row.scream) { g.zombies?.onNoise(c.x, c.z, REACT.screamR); this.stats.screams++; }
    if (rx.row.callIn) this.callIn(c, rx);
    if (rx.row.drop && c.occRec) c.work = false;
    this.bark(c, rx);
  }

  bark(c, rx) {
    const g = this.g, P = g.player;
    if (rx.said || g.time - this.barkAt < REACT.barkEvery || Math.hypot(c.x - P.x, c.z - P.z) > REACT.barkR) return;
    rx.said = true; this.barkAt = g.time;
    const L = rx.row.lines, line = L[hash32(strHash(c.id), rx.seq) % L.length].replace('{dir}', dirWord(rx.heard.bearing));
    g.feedback?.floater(c.x, c.z, line, 'bark');
    g.voice?.speak(c, line, { kind: 'bark' });
  }

  // Call it in: what they HEARD (their guess of the spot and their bearing, never the truth) becomes a fact in the
  // knowledge model, broadcast to every radio set in range and carried into the nearest town's talk.
  callIn(c, rx) {
    const g = this.g, K = g.pulls?.k;
    if (!K) return null;
    const hid = `rx:${c.id}`, name = c.npc?.name ?? c.name ?? 'somebody';
    K.holder(hid, { name, kind: 'person', x: c.x, z: c.z, radio: true });
    const dir = dirWord(rx.heard.bearing);
    const f = K.record({ what: 'gunfire', text: `Shots fired ${dir} of ${name}`, where: { x: rx.heard.x, z: rx.heard.z }, life: 3, data: { by: c.id, bearing: +(rx.heard.bearing * R2D).toFixed(1), err: rx.err, guessD: Math.round(rx.heard.d) } });
    K.put(hid, f, { channel: 'heard', from: hid, fromName: name, at: { x: Math.round(c.x), z: Math.round(c.z) } }, CHANNELS.heard?.conf ?? 0.6, 0);
    const heard = K.broadcast(f, c.x, c.z, REACT.callR, name);
    const town = g.pulls.nearestNode?.(c.x, c.z, 600);
    if (town) K.put(`town:${town.id}`, f, { channel: 'radio', from: hid, fromName: name }, (CHANNELS.radio?.conf ?? 0.85) * (CHANNELS.heard?.conf ?? 0.6), 1);
    rx.fact = f.id;
    this.stats.callIns++;
    g.emit('shotCalledIn', { id: c.id, fact: f.id, where: [Math.round(rx.heard.x), Math.round(rx.heard.z)], heard: heard.length, town: town?.id ?? null });
    return f;
  }

  // Away from the heard bearing (not from the shooter: from where they think it was).
  away(c, rx, speed, dt) {
    const b = rx.heard.bearing;
    this.g.ai.move(c, -Math.sin(b), -Math.cos(b), speed, dt);
  }
  // Along a foot path; true when there. Planned when there is none (a new leg sets rx.route = null), and re-planned at
  // most every 1.5 s when the goal has drifted more than `drift` m (a heard spot re-heard, a child on the move) or they
  // are stuck. (Re-planning on every shot heard made an SMG fight plan a path per frame per listener.)
  walk(c, rx, gx, gz, speed, dt, arrive = 1.2, drift = 0.5) {
    const g = this.g;
    if (Math.hypot(gx - c.x, gz - c.z) < arrive) { c.speed = 0; return true; }
    rx.repath = (rx.repath ?? 0) - dt;
    if (!rx.route || (rx.repath <= 0 && (Math.abs(rx.gx - gx) + Math.abs(rx.gz - gz) > drift || (c.stuck ?? 0) > 0.6))) {
      // A long leg outside the shared nav window walks straight (dragging the window made tactics pay a rebuild); a short
      // one (a door, a bed, family a street away) is always planned: straight there runs a mother into the wall between.
      rx.route = this.inWindow(c.x, c.z, gx, gz) || Math.abs(gx - c.x) + Math.abs(gz - c.z) < REACT.shortLeg ? g.footPath?.(c.x, c.z, gx, gz) ?? null : null;
      if (!rx.route?.length) rx.route = [{ x: gx, z: gz }];
      rx.ri = 0; rx.gx = gx; rx.gz = gz; rx.repath = 1.5;
    }
    let wp = rx.route[rx.ri];
    while (rx.ri < rx.route.length - 1 && Math.hypot(wp.x - c.x, wp.z - c.z) < 1.2) wp = rx.route[++rx.ri];
    g.ai.move(c, wp.x - c.x, wp.z - c.z, speed, dt);
    return false;
  }
  // Is the box round both ends already inside the foot nav window (engine/nav.js ensureCovers' own test, margin 24 m)?
  inWindow(ax, az, bx, bz) {
    const n = this.g.nav?.foot;
    if (!n) return false;
    const M = 24, m = n.cell * 2;
    return Math.min(ax, bx) - M >= n.ox + m && Math.max(ax, bx) + M < n.ox + n.W - m && Math.min(az, bz) - M >= n.oz + m && Math.max(az, bz) + M < n.oz + n.W - m;
  }
  // Go and look (the law, a gun) or go and help (a medic): to the HEARD spot, then a look round. In hops of at most
  // REACT.hop m along the heard line (a short path each; the window stays where the fights are).
  toward(c, rx, row, dt) {
    const H = rx.heard;
    if (row.wait && this.g.time - rx.t0 < row.wait) { c.speed = 0; return; } // the kit first
    if (rx.phase === 0) {
      const dx = H.x - c.x, dz = H.z - c.z, d = Math.hypot(dx, dz), k = d > REACT.hop ? REACT.hop / d : 1;
      if (!rx.hopX || Math.hypot(rx.hopX - c.x, rx.hopZ - c.z) < 3 || Math.abs(rx.hopH - H.x) + Math.abs(rx.hopHz - H.z) > 6) { rx.hopX = c.x + dx * k; rx.hopZ = c.z + dz * k; rx.hopH = H.x; rx.hopHz = H.z; rx.route = null; }
      if (this.walk(c, rx, rx.hopX, rx.hopZ, row.speed, dt, 3, 6) && k === 1) rx.phase = 1;
    }
    if (rx.phase === 1) { c.speed = 0; c.face = wrap(c.face + dt * 0.9); }
  }
  // Inside and bar the door: the nearest unlocked door within reach, through it, and shut it hard behind them.
  toDoor(c, rx, row, dt) {
    const g = this.g;
    if (!rx.door && rx.phase === 0) {
      rx.door = this.doorNear(c, rx.follow ? REACT.doorR * 2 : REACT.doorR); // with family in tow they go further for a door
      rx.phase = !rx.door ? 3 : (c.x - rx.door.x) * rx.door.nx + (c.z - rx.door.z) * rx.door.nz < -0.3 ? 2 : 1; // already inside: straight to the door's inner side
    }
    const D = rx.door;
    if (rx.phase === 3) { if (g.time - rx.t0 < 1.1) this.away(c, rx, row.speed, dt); else { c.speed = 0; c.crouch = true; } return; } // no door: down where they are
    if (rx.phase === 1 && this.walk(c, rx, D.x + D.nx * 1.3, D.z + D.nz * 1.3, row.speed, dt, 0.9)) { rx.phase = 2; rx.route = null; }
    if (rx.phase === 2 && this.walk(c, rx, D.x - D.nx * REACT.inside, D.z - D.nz * REACT.inside, row.speed * 0.7, dt, 0.8)) {
      rx.phase = 4;
      if (rx.follow) for (const o of g.chars) if (o.rx?.follow === c.id && Math.hypot(o.x - D.x, o.z - D.z) > 4) { rx.phase = 2.5; break; } // the family is not in yet
      if (rx.phase === 4) this.slam(c, rx, D);
    }
    if (rx.phase === 2.5) { c.speed = 0; let all = true; for (const o of g.chars) if (o.rx?.follow === c.id && o.alive && Math.hypot(o.x - D.x, o.z - D.z) > 4) all = false; if (all || g.time - rx.t0 > 12) { rx.phase = 4; this.slam(c, rx, D); } }
    if (rx.phase === 4) { c.speed = 0; c.face = angleLerp(c.face, Math.atan2(D.x - c.x, D.z - c.z), Math.min(1, dt * 4)); }
  }
  doorNear(c, R = REACT.doorR) {
    const I = this.g.interiors;
    if (!I) return null;
    let best = null, bd = R;
    for (const d of I.doors) {
      if (d.ug || d.broken || d.locked || d.rxBar || d.kind === 'stair' || (d.y ?? 0) > 0.5) continue;
      const ddx = d.x - c.x, ddz = d.z - c.z;
      if (Math.abs(ddx) > bd || Math.abs(ddz) > bd) continue;
      const dd = Math.hypot(ddx, ddz);
      if (dd < bd && !this.barred.some((b) => b.door === d)) { bd = dd; best = d; }
    }
    return best;
  }
  slam(c, rx, D) {
    const g = this.g;
    if (D.locked || D.rxBar) return; // locked already, or somebody else got it barred first
    g.audio?.thud?.(g.pan(D.x));
    this.bar(D, true);
    this.barred.push({ door: D, by: c.id, c, at: g.time });
    this.stats.slams++; this.stats.barred++;
    g.emit('doorSlam', { door: D.id, by: c.id, barred: true });
  }
  // Barred from inside: the leaves slammed shut and held (jamT: a jammed leaf refuses every push, interiors.circle),
  // the plank across it drawn with the padlock slot's own instance. NOT a lock: a lock is saved and stamped into the nav
  // grid (interiors.setLocked), and a bar that lasts seconds must never outlive its moment - a save taken while one held
  // reloaded it as a lock for good and sealed a home. A kick still breaks it (interiors.fling zeroes jamT).
  bar(D, on) {
    const I = this.g.interiors;
    if (on) {
      for (const L of D.leaves) { L.th = 0; L.w = 0; L.jamT = 1; I.orient(L); }
      D.rxBar = true; D.locked = true; I.syncLock(D); D.locked = false; // the plank shows; the door is not locked
    } else {
      if (!D.rxBar) return;
      D.rxBar = false;
      for (const L of D.leaves) L.jamT = 0;
      I.syncLock(D); // unlocked: the plank comes off
    }
    I.flush();
  }
  // A child under the nearest bed (or flat on the floor where they are, with no bed near).
  toBed(c, rx, row, dt) {
    const g = this.g;
    if (rx.phase === 0) {
      let best = null, bd = REACT.bedR;
      for (const b of g.world.spawns.beds ?? []) { if (b.upstairs || b.ring) continue; const d = Math.hypot(b.x - c.x, b.z - c.z); if (d < bd) { bd = d; best = b; } }
      rx.bed = best; rx.phase = best ? 1 : 2;
    }
    if (rx.phase === 1 && this.walk(c, rx, rx.bed.x, rx.bed.z, row.speed, dt, 0.7)) rx.phase = 2;
    if (rx.phase === 2) c.speed = 0;
  }
  // To their family; there, take them in (the child follows, the parent finds a door and bars it behind them both).
  toKin(c, rx, row, dt) {
    const g = this.g, k = rx.kinC;
    if (!k?.alive) { rx.kind = 'hide'; rx.row = REACTIONS.hide; rx.phase = 0; rx.route = null; return; }
    if (rx.phase === 0 && this.walk(c, rx, k.x, k.z, row.speed, dt, 1.6, 2.5)) {
      rx.phase = 1; rx.reached = g.time;
      g.emit('kinReached', { id: c.id, kin: k.id });
      // The one they came for goes with them.
      this.clearPose(k);
      k.rx = { seq: rx.seq, kind: 'follow', row: REACTIONS.run_kin, profile: 'kin', temper: this.temperOf(k), band: rx.band, loud: rx.loud, j: rx.j, heard: rx.heard, route: null, ri: 0, t0: g.time, t1: g.time + rx.secs, started: true, done: false, asleep: false, phase: 0, follow: c.id, followC: c, pose: null, said: true };
      rx.follow = true;
      rx.kind = 'hide'; rx.row = REACTIONS.hide; rx.door = null; rx.phase = 0; rx.route = null; rx.t1 = Math.max(rx.t1, g.time + REACTIONS.hide.secs[0]);
    }
  }
  // Someone being taken in by family: stay at their heels.
  followThink(c, dt) {
    const g = this.g, rx = c.rx, P = rx.followC;
    if (!P?.alive || g.time >= rx.t1) { this.end(c); return false; }
    c.flee = 0;
    const d = Math.hypot(P.x - c.x, P.z - c.z);
    if (d > 1.3) g.ai.move(c, P.x - c.x, P.z - c.z, Math.min(6, 4 + d * 0.5), dt); else { c.speed = 0; c.face = angleLerp(c.face, P.face, Math.min(1, dt * 4)); }
    return true;
  }

  // ---- body language ----------------------------------------------------------------------------------------------------
  pose(c, rx) {
    const p = rx.row.pose;
    rx.pose = p;
    switch (p) {
      case 'crouch': c.crouch = true; break;
      case 'handsUp': c.handsUp = true; break;
      case 'kneel': c.crouch = true; c.handsUp = true; break;
      case 'aim': if (c.weapon) c.aiming = true; break;
      case 'stoop': c.stoop = c.speed < 0.5; break;
      case 'prone': if (c.speed < 0.3) { c.crouch = true; c.stoop = true; } break;
      default: break;
    }
  }
  clearPose(c) {
    const rx = c.rx;
    if (!rx?.pose) return;
    c.crouch = false; c.handsUp = false; c.stoop = false; c.aiming = false;
    rx.pose = null;
  }
  end(c) {
    const rx = c.rx;
    if (!rx) return;
    this.clearPose(c);
    rx.done = true;
    c.rx = null;
    this.g.emit('reactEnd', { id: c.id, kind: rx.kind });
  }

  // ---- per frame: the barred doors come open when the one who barred them comes out (or is gone) --------------------
  update(dt) {
    if (!this.barred.length) return;
    const g = this.g;
    for (let i = this.barred.length - 1; i >= 0; i--) {
      const b = this.barred[i], c = b.c, D = b.door;
      let shut = !D.locked; for (const L of D.leaves) if (L.th > 0.05 || L.th < -0.05) shut = false;
      if (shut && c.alive && g.chars.indexOf(c) >= 0 && c.rx?.door === D && g.time - b.at < 300) { for (const L of D.leaves) if (L.jamT < 0.5) L.jamT = 0.5; continue; }
      if (!shut) g.emit('barBroken', { door: D.id, by: c.id });
      this.bar(D, false);
      this.barred.splice(i, 1);
    }
  }

  // ---- reads -------------------------------------------------------------------------------------------------------------
  view(c) {
    const rx = c.rx;
    if (!rx) return null;
    return { kind: rx.kind, profile: rx.profile, temper: rx.temper, band: rx.band, loud: rx.loud, j: rx.j, err: rx.err, errBound: rx.errBound, d: rx.d, wall: rx.wall, delay: rx.delay, secs: rx.secs,
      started: rx.started, asleep: rx.asleep, phase: rx.phase, heard: rx.heard ? { x: +rx.heard.x.toFixed(1), z: +rx.heard.z.toFixed(1), bearing: +(rx.heard.bearing * R2D).toFixed(1), d: +rx.heard.d.toFixed(1) } : null,
      door: rx.door?.id ?? null, kin: rx.kin ?? null, follow: rx.follow ?? null, fact: rx.fact ?? null, left: +Math.max(0, rx.t1 - this.g.time).toFixed(1) };
  }
  // What this person is and would do at each band (no shot needed).
  profileView(c) {
    const temper = this.temperOf(c), kin = this.kinOf(c), prof = this.profileOf(c, kin), j = this.place(c.x, c.z), out = {};
    for (const b of ['near', 'mid', 'far']) { const w = this.weights(c, prof, temper, b, j), s = Object.values(w).reduce((a, v) => a + v, 0); out[b] = Object.fromEntries(Object.entries(w).map(([k, v]) => [k, +(v / s).toFixed(2)])); }
    return { id: c.id, name: c.npc?.name ?? c.name, flag: c.flag, faction: c.faction, occ: this.occOf(c), occName: OCCUPATIONS[this.occOf(c)]?.name ?? c.title ?? null, armed: !!c.weapon, asleep: !!c.sleeping,
      profile: prof.id, firm: !!prof.firm, temper, kin: kin?.id ?? null, child: !!c.child, jumpy: +j.toFixed(2), odds: out, now: this.view(c) };
  }
  summary() {
    const places = [...this.places.entries()].map(([k, P]) => ({ place: k, x: Math.round(P.x), z: Math.round(P.z), jumpy: +this.place(P.x, P.z).toFixed(3), shots: P.shots, quietFor: +(this.g.time - P.t).toFixed(1) })).filter((p) => p.jumpy > 0.005).sort((a, b) => b.jumpy - a.jumpy);
    const live = this.g.chars.filter((c) => c.rx).map((c) => ({ id: c.id, name: c.npc?.name ?? c.name, ...this.view(c) }));
    return { enabled: this.enabled, stats: { ...this.stats, kinds: { ...this.stats.kinds } }, reacting: live.length, live: live.slice(0, 40), places: places.slice(0, 20), barred: this.barred.map((b) => b.door.id), last: this.last };
  }
  clear() {
    for (const c of this.g.chars) if (c.rx) this.end(c);
    this.update(0);
    for (const b of this.barred) this.bar(b.door, false);
    this.barred.length = 0;
  }
}
