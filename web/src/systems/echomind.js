import { ECHO_MIND as EM } from '../data/hordes.js';
import { INFECTED } from '../data/infected.js';

// THE SMART ECHO (rows: data/hordes.js ECHO_MIND; docs/design/WEB_DEATHS.md §3.1). The neon-green-veined Echo once it
// KNOWS of you: it stalks out of your view, slips away when you turn to it, waits at the door you were heading for, calls
// out to lure you, and learns from its own encounters. Law 6: everything it acts on is its own model of you - c.zm (where
// its senses last put you) and c.em (the facing and heading it SAW, the doors it SAW). It never reads where you truly are.
// zombies.echo() asks think() first; false means it knows nothing of you and goes back to working its door.

const D2R = Math.PI / 180, FOV = Math.cos(EM.fov * D2R), BEAM = Math.cos(EM.beamHalf * D2R), RING = 12;
const BEAM_LEN = 15.5; // main.js buildFlashlight: the cone's plane reaches 15.5 m before its scale
// At its work (going to its boards or on them) it is ABSORBED: its eyes reach only `near` (your steps, your smell and a hurt still reach it). So an
// Echo at work that has not noticed you freezes while you watch it, as it always did; one that has, hunts.
const ABSORBED = { ...INFECTED.echo, sense: { ...INFECTED.echo.sense, sight: INFECTED.echo.sense.near, night: INFECTED.echo.sense.near, lit: INFECTED.echo.sense.near } };
const ang = (a, b) => { let d = Math.abs(a - b) % (Math.PI * 2); return d > Math.PI ? Math.PI * 2 - d : d; };

export class EchoMind {
  constructor(game, zombies) {
    this.g = game; this.Z = zombies;
    this.counts = { stalks: 0, hides: 0, lures: 0, luresDrew: 0, ambushes: 0, ambushHits: 0, trapsFailed: 0, learned: 0, held: 0 };
  }
  mind(c) {
    return c.em ?? (c.em = {
      state: 'work', senseT: EM.sense, spot: { x: 0, z: 0, ok: false }, spotT: 0, hideT: 0, waitT: 0, cool: 0, unseenT: 0,
      sx: 0, sz: 0, st: -1e9, beamT: -1e9, ax: 0, az: 0, at: -1e9, hx: 0, hz: 0, ht: -1e9, face: 0, faceT: -1e9,
      known: new Set(), door: null, lureAt: -1e9, lure: { x: 0, z: 0, t: -1e9, d: 0, on: false },
      lessons: { keep: 0, lure: 0, ambush: 0 },
    });
  }
  set(c, m, state, why) {
    if (m.state === state) return;
    m.state = state; m.spotT = 0; m.spot.ok = false;
    if (state === 'hide') { m.hideT = EM.hideFor; this.counts.hides++; }
    if (state === 'stalk') this.counts.stalks++;
    if (state === 'ambush') { m.waitT = 0; this.counts.ambushes++; c.phraseT = Math.min(c.phraseT ?? 1, 1); } // it calls the dead to the door as it goes
    if (state !== 'ambush') m.door = null;
    this.g.emit('echoMind', { id: c.id, state, why });
  }
  learn(c, m, what, by) {
    const L = m.lessons;
    if (what === 'keep') L.keep = Math.min(EM.keepMax - EM.keep, L.keep + by);
    else L[what] += by;
    this.counts.learned++;
    this.g.emit('echoLearned', { id: c.id, what, by, lessons: { keep: L.keep, lure: L.lure, ambush: L.ambush } });
  }

  // Where its model puts you, and which way it last saw you facing (null: it has not seen you lately - any way at all).
  facing(m) { return this.g.time - m.faceT < 8 ? m.face : null; }
  // Would you see this spot, by its model of you (your view cone, then cover)? Past `seen` m it counts as unseen.
  exposed(c, m, x, z) {
    const zm = c.zm, px = zm.x, pz = zm.z, dx = x - px, dz = z - pz, d = Math.hypot(dx, dz);
    if (this.night()) {
      // In the dark you see `seenNight` m, and down your beam if it has seen it burning lately.
      const B = this.g.time - m.beamT < 3 ? this.beam() : null;
      if (d > EM.seenNight && !(B && this.inBeam(B, x, z))) return false;
      return this.g.los(B ? B.x : px, B ? B.z : pz, x, z);
    }
    if (d > EM.seen) return false;
    const f = this.facing(m);
    if (f !== null && d > 2 && (dx * Math.sin(f) + dz * Math.cos(f)) / d < FOV) return false;
    return this.g.los(px, pz, x, z);
  }

  night() { return (this.g.sky?.night ?? 0) > 0.55 && !this.g.player.ug; }
  // Your beam as anyone can see it (main.js's cone): from you along your face. null: no lit beam.
  beam() {
    const g = this.g, P = g.player;
    if (!((g.flashMat?.opacity ?? 0) > 0.05) || P.inVehicle || !P.alive) return null;
    const B = this._b ?? (this._b = { x: 0, z: 0, f: 0, len: 0 });
    B.x = P.x; B.z = P.z; B.f = P.face; B.len = BEAM_LEN * (g.flashlight?.scale.z ?? 1);
    return B;
  }
  inBeam(B, x, z) { const dx = x - B.x, dz = z - B.z, d = Math.hypot(dx, dz); return d < 0.5 || (d < B.len && (dx * Math.sin(B.f) + dz * Math.cos(B.f)) / d > BEAM); }
  // It sees the beam (a lit stretch of it in a clear line, inside beamSee): it knows where it starts and which way it points.
  watchBeam(c, m) {
    const g = this.g, B = this.beam();
    if (!B || !this.night()) return;
    const sf = Math.sin(B.f), cf = Math.cos(B.f);
    let seen = false;
    for (const k of [0.35, 0.7]) { const x = B.x + sf * B.len * k, z = B.z + cf * B.len * k; if (Math.abs(x - c.x) < EM.beamSee && Math.abs(z - c.z) < EM.beamSee && Math.hypot(x - c.x, z - c.z) < EM.beamSee && g.los(c.x, c.z, x, z)) { seen = true; break; } }
    if (!seen) return;
    const fresh = g.time - m.beamT > 1;
    m.beamT = g.time;
    if (c.zsee === g.player) return; // it sees you yourself: saw() has it
    this.Z.remember(c, B.x, B.z, 'light', g.player);
    this.fix(c, m, B.x, B.z, B.f);
    if (fresh) g.emit('echoSawBeam', { id: c.id, x: +B.x.toFixed(1), z: +B.z.toFixed(1), face: +B.f.toFixed(2) });
  }
  // A sighting of you: where, which way you were going (from two sightings `move` m apart), which way you faced.
  saw(c, m) {
    const g = this.g, P = g.player, v = P.inVehicle;
    if ((g.flashMat?.opacity ?? 0) > 0.05 && !v) m.beamT = g.time; // it sees you, so it sees your light
    this.fix(c, m, v ? v.x : P.x, v ? v.z : P.z, v ? (v.h ?? 0) : Math.atan2(g.aim.x - P.x, g.aim.z - P.z)); // where your eyes (your gun) point
  }
  // A fix on you (seen, or read off your beam): where you were, which way you were going, which way you faced.
  fix(c, m, x, z, face) {
    const g = this.g, t = g.time;
    if (t - m.at > 4) { m.ax = x; m.az = z; m.at = t; }
    else { const dx = x - m.ax, dz = z - m.az, d = Math.hypot(dx, dz); if (d >= EM.move) { m.hx = dx / d; m.hz = dz / d; m.ht = t; m.ax = x; m.az = z; m.at = t; } }
    m.sx = x; m.sz = z; m.st = t;
    m.face = face; m.faceT = t;
    const L = m.lure;
    if (L.on && t - L.t < EM.lureWin && Math.hypot(x - L.x, z - L.z) < L.d - EM.lureDrew) { L.on = false; this.counts.luresDrew++; this.learn(c, m, 'lure', 1); }
  }
  // The doors it has SEEN itself: inside its sight and a clear line from where it stands.
  look(c, m, R) {
    const g = this.g, r = (g.sky?.night ?? 0) > 0.55 ? R.sense.night : R.sense.sight;
    for (const d of g.interiors?.doors ?? []) {
      if (m.known.has(d) || Math.abs(d.x - c.x) > r || Math.abs(d.z - c.z) > r || (d.ug ?? null) !== (c.ug ?? null)) continue;
      if (Math.hypot(d.x - c.x, d.z - c.z) < r && (g.los(c.x, c.z, d.x + d.nx * 0.6, d.z + d.nz * 0.6) || g.los(c.x, c.z, d.x - d.nx * 0.6, d.z - d.nz * 0.6))) m.known.add(d);
    }
  }
  // The door you were going for: one it knows, ahead of where it last saw you along the way you were going.
  predict(m) {
    if (this.g.time - m.ht > 8 || m.lessons.ambush <= -2) return null;
    let best = null, bs = -1e9;
    for (const d of m.known) {
      const dx = d.x - m.sx, dz = d.z - m.sz, dd = Math.hypot(dx, dz);
      if (dd < 2 || dd > EM.ambushR) continue;
      const cos = (dx * m.hx + dz * m.hz) / dd;
      if (cos < EM.align) continue;
      const s = cos - dd * 0.004;
      if (s > bs) { bs = s; best = d; }
    }
    return best;
  }

  // One frame. True: it knows of you and acted; false: it knows nothing (zombies.echo works its door).
  think(c, dt) {
    const g = this.g, Z = this.Z, P = g.player, R = INFECTED.echo, m = this.mind(c);
    if ((m.senseT -= dt) <= 0) {
      m.senseT = EM.sense;
      Z.sense(c, m.state === 'work' && c.work ? ABSORBED : R);
      if (c.zsee === P) this.saw(c, m);
      if (!(m.state === 'work' && c.work)) this.watchBeam(c, m); // absorbed at its work, it does not look up at a light
      this.look(c, m, R);
    }
    const zm = c.zm;
    if (!P.alive || !zm || zm.src === null || !Z.fresh(c) || (zm.who !== P.id && zm.src !== 'hurt')) {
      if (m.state !== 'work') this.set(c, m, 'work', 'lost you');
      return false;
    }
    // You are behind the door or the boarded window it is pressed against: breaking it IS the hunt (zombies.echo works it).
    const B = this.Z.blocker(c);
    if (B && ((zm.x - B.x) * B.nx + (zm.z - B.z) * B.nz) * ((c.x - B.x) * B.nx + (c.z - B.z) * B.nz) < 0 && Math.hypot(zm.x - B.x, zm.z - B.z) < 10) {
      if (m.state !== 'work') this.set(c, m, 'work', 'at your door');
      return false;
    }
    if (m.state === 'work') { c.work = null; c.handsUp = false; c.frozen = false; this.set(c, m, 'stalk', zm.src); }
    c.frozen = false; c.handsUp = false;
    const seeing = c.zsee === P;
    m.unseenT = seeing ? 0 : m.unseenT + dt;
    const px = zm.x, pz = zm.z, dP = Math.hypot(px - c.x, pz - c.z);
    m.cool -= dt;
    // Within reach and you are not facing it (or it lay in wait): it claws.
    if (seeing && dP < EM.strike && (m.state === 'ambush' || !this.faced(c, m))) { this.claw(c, m, px, pz, dP); return true; }
    // You turned to it (it sees you doing it): it breaks your line of sight.
    if ((seeing || this.night()) && m.state !== 'hide' && this.faced(c, m) && g.sees(P, c)) this.set(c, m, 'hide', this.night() ? 'beam' : 'faced');
    if (m.state === 'hide') {
      if (!m.spot.ok || (m.spotT -= dt) <= 0) { this.hideSpot(c, m, px, pz); m.spotT = 1; }
      m.hideT -= dt;
      if (this.walk(c, m, EM.flee, dt, false) && m.hideT <= 0) this.set(c, m, 'stalk', 'hidden');
      return true;
    }
    if (m.state === 'ambush') {
      const D = m.door;
      m.waitT += dt;
      if (m.waitT > EM.wait) { this.learn(c, m, 'ambush', -1); this.counts.trapsFailed++; m.ht = -1e9; this.set(c, m, 'stalk', 'nobody came'); return true; }
      if (!m.spot.ok) this.doorSpot(c, m, D);
      if (this.walk(c, m, EM.stalk, dt, true)) { c.crouch = true; c.face = Math.atan2(D.x - c.x, D.z - c.z); }
      return true;
    }
    // STALK: an ambush if it can read where you were going; else keep off, out of your view; call out when it lost you.
    const D = this.predict(m);
    if (D) { m.door = D; this.set(c, m, 'ambush', D.id); return true; }
    if (m.unseenT > EM.lureAfter && g.time >= m.lureAt) this.call(c, m, dP);
    if (m.lure.on && g.time - m.lure.t > EM.lureWin) { m.lure.on = false; this.learn(c, m, 'lure', -1); }
    if (!m.spot.ok || (m.spotT -= dt) <= 0 || Math.hypot(m.spot.x - c.x, m.spot.z - c.z) < 0.8 && m.spotT < 0.5) { this.stalkSpot(c, m, px, pz); m.spotT = 1.5; }
    if (this.walk(c, m, EM.stalk, dt, true)) { c.crouch = true; c.face = Math.atan2(px - c.x, pz - c.z); }
    return true;
  }
  faced(c, m) {
    const g = this.g, P = g.player, f = Math.atan2(g.aim.x - P.x, g.aim.z - P.z), d = Math.hypot(c.x - P.x, c.z - P.z);
    if (this.night()) { const B = this.beam(); return !P.inVehicle && (B ? this.inBeam(B, c.x, c.z) : false) || (d < EM.seenNight && ang(f, Math.atan2(c.x - P.x, c.z - P.z)) < EM.fov * D2R); }
    return !P.inVehicle && d < EM.seen && ang(f, Math.atan2(c.x - P.x, c.z - P.z)) < EM.fov * D2R;
  }
  // Toward its spot. guard: a step that would put it in your view (by its model) it does not take. True: it is there.
  walk(c, m, pace, dt, guard) {
    const dx = m.spot.x - c.x, dz = m.spot.z - c.z, d = Math.hypot(dx, dz);
    if (d < 0.8) { c.speed = 0; return true; }
    c.crouch = false;
    if (guard) {
      const k = Math.min(d, 1.2) / d, nx = c.x + dx * k, nz = c.z + dz * k;
      if (this.exposed(c, m, nx, nz) && !this.exposed(c, m, c.x, c.z)) { c.speed = 0; c.crouch = true; this.counts.held++; m.spotT = Math.min(m.spotT, 0.6); return false; }
    }
    this.g.ai.move(c, dx, dz, pace, dt);
    if (guard) c.face = Math.atan2(c.zm.x - c.x, c.zm.z - c.z); // stalking, it sidles with its eyes on you (and so sees you go)
    return false;
  }
  // On a ring round you at keep m: out of your view, behind your facing if it can be, the nearest such to it.
  stalkSpot(c, m, px, pz) {
    const g = this.g, keep = EM.keep + m.lessons.keep, f = this.facing(m), cur = Math.atan2(c.x - px, c.z - pz);
    let bs = -1e9, bx = c.x, bz = c.z;
    for (let k = 0; k < RING; k++) {
      const a = cur + (k - RING / 2) * (Math.PI / RING) * 1.6, x = px + Math.sin(a) * keep, z = pz + Math.cos(a) * keep;
      if (!g.nav.foot.free(x, z) || this.exposed(c, m, x, z)) continue;
      const s = (f === null ? 0 : ang(a, f) * 0.6) - Math.hypot(x - c.x, z - c.z) * 0.05;
      if (s > bs) { bs = s; bx = x; bz = z; }
    }
    // Nowhere unseen on the ring: stay where it is if that is unseen, else back off.
    if (bs === -1e9 && this.exposed(c, m, c.x, c.z)) { const d = Math.hypot(c.x - px, c.z - pz) || 1; bx = px + (c.x - px) / d * EM.seen * 1.1; bz = pz + (c.z - pz) / d * EM.seen * 1.1; }
    m.spot.x = bx; m.spot.z = bz; m.spot.ok = true;
  }
  // Out of your line of sight (cover first), away from you.
  hideSpot(c, m, px, pz) {
    const g = this.g, away = Math.atan2(c.x - px, c.z - pz), d0 = Math.hypot(c.x - px, c.z - pz);
    let bs = -1e9, bx = c.x + Math.sin(away) * 20, bz = c.z + Math.cos(away) * 20;
    for (let k = 0; k < 14; k++) {
      const a = away + (k - 7) * 0.28, r = d0 + 4 + (k % 3) * 5, x = px + Math.sin(a) * r, z = pz + Math.cos(a) * r;
      if (!g.nav.foot.free(x, z)) continue;
      const s = (this.exposed(c, m, x, z) ? 0 : 4) + (g.los(px, pz, x, z) ? 0 : 1) - Math.hypot(x - c.x, z - c.z) * 0.08; // out of your view (its model: cone, beam, cover), cover best
      if (s > bs) { bs = s; bx = x; bz = z; }
    }
    m.spot.x = bx; m.spot.z = bz; m.spot.ok = true;
  }
  // Flat to the wall beside the door, on the side you were coming from, out of your line from there if it can be.
  doorSpot(c, m, D) {
    const g = this.g, s = (m.sx - D.x) * D.nx + (m.sz - D.z) * D.nz >= 0 ? 1 : -1, tx = -D.nz, tz = D.nx;
    let px = D.x + D.nx * s, pz = D.z + D.nz * s, hid = false;
    for (const side of [1, -1]) {
      const x = D.x + D.nx * s * 0.7 + tx * side * 1.5, z = D.z + D.nz * s * 0.7 + tz * side * 1.5;
      if (!g.nav.foot.free(x, z) || hid) continue;
      px = x; pz = z; hid = !g.los(m.sx, m.sz, x, z); // the side your line from there misses, if one does
    }
    m.spot.x = px; m.spot.z = pz; m.spot.ok = true;
  }
  // Its lure: a voice from where it stands (pan and floater at its own x,z), so a sharp player can find it by ear.
  call(c, m, dP) {
    const g = this.g, pan = g.pan(c.x), L = m.lure;
    m.lureAt = g.time + EM.lureEvery * (m.lessons.lure > 0 ? 0.5 : m.lessons.lure < 0 ? 2 : 1);
    L.x = c.x; L.z = c.z; L.t = g.time; L.d = Math.hypot(m.sx - c.x, m.sz - c.z) || dP; L.on = true;
    g.audio.murmur?.(pan, Math.min(25, dP * 0.4));
    g.feedback?.floater(c.x, c.z, EM.lureLine, 'bark');
    this.counts.lures++;
    g.emit('echoLure', { id: c.id, x: +c.x.toFixed(2), z: +c.z.toFixed(2), pan: +pan.toFixed(3) });
  }
  claw(c, m, px, pz, d) {
    const g = this.g, P = g.player;
    c.speed = 0; c.crouch = false; c.face = Math.atan2(px - c.x, pz - c.z);
    if (m.cool > 0) return;
    m.cool = EM.cool;
    g.combat.damage(P, INFECTED.shambler.claw * EM.claw, c, (px - c.x) / (d || 1), (pz - c.z) / (d || 1), 'bite');
    if (P.alive && !g.godMode) g.survival?.bitten();
    if (m.state === 'ambush') { this.counts.ambushHits++; this.learn(c, m, 'ambush', 1); g.emit('echoAmbush', { id: c.id, door: m.door?.id ?? null }); this.set(c, m, 'hide', 'struck'); }
  }
  // Hurt by you: it keeps further off from now on, and slips away.
  hurt(c, by) {
    if (by !== this.g.player || !c.alive) return;
    const m = this.mind(c);
    this.learn(c, m, 'keep', EM.learnKeep);
    if (m.state !== 'work') this.set(c, m, 'hide', 'hurt');
  }
  view(c) {
    const m = c.em;
    if (!m) return { state: 'work' };
    return { state: m.state, beamSeen: this.g.time - m.beamT < 3, door: m.door?.id ?? null, knownDoors: m.known.size, spot: m.spot.ok ? { x: +m.spot.x.toFixed(1), z: +m.spot.z.toFixed(1) } : null, heading: this.g.time - m.ht < 8 ? { x: +m.hx.toFixed(2), z: +m.hz.toFixed(2) } : null, unseen: +m.unseenT.toFixed(1), lessons: { ...m.lessons } };
  }
}
