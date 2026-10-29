import * as THREE from 'three';
import { ITEMS } from '../data/items.js';
import { DECAL_Y, layerMesh } from '../engine/depthlayers.js';
import { SPECIES, PHASES } from '../data/fauna.js';
import { BREEDS } from '../data/dogs.js';
import { LAKE } from '../world/water.js';
import {
  TRACK_KINDS, TRACK_OF, GROUND_HOLD, TRACKS, FISH, FISH_TRASH, FISHING, FORAGE, FORAGING, TRAPPING, CAMP,
  OUTDOOR_XP, OUTDOOR_PER_LEVEL as PL, TALENTS, FX0, DOG_TRAITS, DOG_TRAIL,
} from '../data/outdoors.js';

// THE WILDS (docs/design/WEB_WILDS.md): living off the land. Made and stepped by systems/wilds.js (g.outdoors).
//   tracks    every mover leaves sign (boots, paws, hooves, a drag, tyres, blood) in one pool, drawn as one decal mesh;
//             what you can read of it is your TRACKING skill against its age, the ground and the weather
//   fishing   cast at water (THE water authority says what kind), wait for the bite, strike inside the window
//   foraging  search the ground for what the biome grows; patches thin and grow back
//   trapping  snares and fish traps that fill on the game clock while you are away
//   camp      a fire pit (a real fire: cook on it), a drying rack, a rain catcher
//   dogs      a dog of yours works a scent trail (SEEK on a track); a bird dog flushes birds and fetches what you shoot
//   hunters   anybody told to trail someone (a skip tracer, a hunter who lost sight of you) follows their sign
// Talents (data/outdoors.js TALENTS) fold into `fx`, recomputed twice a second: every consumer reads fx and lv().
const KINDS = Object.keys(TRACK_KINDS), KIDX = Object.fromEntries(KINDS.map((k, i) => [k, i]));
const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const ISLAND = 464;
const _o = new THREE.Object3D(), _c = new THREE.Color();
export const compass = (dx, dz) => COMPASS[((Math.round(Math.atan2(dx, -dz) / (Math.PI / 4)) % 8) + 8) % 8]; // +z is south
const r1 = (v) => Math.round(v * 10) / 10;
const pick = (rows, wOf) => { let s = 0; for (const r of rows) s += wOf(r); let k = Math.random() * s; for (const r of rows) { k -= wOf(r); if (k <= 0) return r; } return rows[rows.length - 1] ?? null; };
const roll = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));
const phaseOf = (hour) => { const h = ((hour % 24) + 24) % 24; for (const P of PHASES) if (P.from < P.to ? h >= P.from && h < P.to : h >= P.from || h < P.to) return P.id; return 'day'; };
// dogSeek's answer, reused (no allocation a frame).
const NOSE = { r: 0, ageH: 0, speed: 0 };
const GO = { x: 0, z: 0, v: 0, face: undefined, state: '' };
const go = (x, z, v, state, face = undefined) => { GO.x = x; GO.z = z; GO.v = v; GO.state = state; GO.face = face; return GO; };

export class Outdoors {
  constructor(game) {
    const g = (this.g = game);
    game.outdoors = this;
    // The track pool: structure of arrays, a ring (the oldest go first). t is the game hour it was laid.
    const N = TRACKS.pool;
    this.tx = new Float32Array(N); this.tz = new Float32Array(N); this.tf = new Float32Array(N); this.tt = new Float64Array(N);
    this.tk = new Uint8Array(N); this.tside = new Int8Array(N); this.th = new Float32Array(N); this.tw = new Array(N).fill(null); this.ts = new Array(N).fill(null);
    this.head = 0; this.count = 0;
    this.layT = 0; this.drawT = 0; this.slowT = 0; this.fxT = 0;
    this.fx = { ...FX0 };
    this.camp = []; this.traps = []; this.patches = new Map(); this.downed = [];
    this.fishing = null; this.job = null; this.seq = 0;
    this.stats = { laid: 0, reads: 0, birdsDowned: 0, casts: 0, fish: 0, trash: 0, missed: 0, foraged: 0, snared: 0, fishTrapped: 0, dogTrails: 0, fetched: 0, dried: 0, built: 0, trailed: 0 };
    if (game.scene) {
      const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
      this.cell = new THREE.InstancedBufferAttribute(new Float32Array(TRACKS.draw), 1);
      geo.setAttribute('aCell', this.cell);
      this.mesh = new THREE.InstancedMesh(geo, printMaterial(), TRACKS.draw);
      this.mesh.count = 0; this.mesh.visible = false; this.mesh.frustumCulled = false; layerMesh(this.mesh, 'groundDecal'); // engine/depthlayers.js
      this.mesh.setColorAt(0, _c.set('#000000'));
      game.scene.add(this.mesh);
      this.campMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95 }), CAMP.max);
      this.campMesh.count = 0; this.campMesh.visible = false; this.campMesh.frustumCulled = false; this.campMesh.castShadow = true;
      this.campMesh.setColorAt(0, _c.set('#000000'));
      game.scene.add(this.campMesh);
    }
    this.recompute();
  }

  // ---- skills and talents ---------------------------------------------------------------------------------------------
  lv(k) { return this.g.skillsSys?.lv?.[k] ?? 0; }
  gain(k, xp) { this.g.skillsSys?.gain?.(k, xp); }
  per(key, skill) { return PL[key] * this.lv(skill); }
  recompute() {
    const F = this.fx;
    for (const k in FX0) F[k] = FX0[k];
    for (const T of TALENTS) {
      if (this.lv(T.skill) < T.at) continue;
      for (const k in T.fx) F[k] = FX0[k] === 1 ? F[k] * T.fx[k] : F[k] + T.fx[k];
    }
  }
  talents() { return TALENTS.map((T) => ({ skill: T.skill, at: T.at, id: T.id, name: T.name, what: T.what, open: this.lv(T.skill) >= T.at })); }
  hours() { return this.g.inventory?.hours?.() ?? 0; }
  biomeAt(x, z) { return this.g.fauna?.biomeAt?.(x, z) ?? 'd'; }
  regionAt(x, z) { return this.g.fauna?.regionAt?.(x, z) ?? 'west'; }
  raining() { return (this.g.sky?.cur?.rain ?? 0) > 0.3; }

  // ---- tracks ---------------------------------------------------------------------------------------------------------
  // One print into the pool. ageH: laid that many game hours ago (staging). life: x its lifetime (the ground's hold,
  // a pathfinder's own sign).
  lay(kind, x, z, face, who, sp, ageH = 0, life = null, side = 0) {
    const i = this.head;
    this.head = (i + 1) % TRACKS.pool; if (this.count < TRACKS.pool) this.count++;
    this.tx[i] = x; this.tz[i] = z; this.tf[i] = face; this.tt[i] = this.hours() - ageH; this.tk[i] = KIDX[kind] ?? 0; this.tside[i] = side;
    this.th[i] = life ?? (GROUND_HOLD[this.biomeAt(x, z)] ?? 1);
    this.tw[i] = who; this.ts[i] = sp;
    this.stats.laid++;
    return i;
  }
  // A mover since its last print: one more every `every` metres; blood drops by their own spacing while it bleeds.
  // The marker fields live on the mover (_tkx, _tkz, _tkb): no allocation.
  maker(o, kind, who, sp, bleed, life = null, bloodKind = 'blood') {
    if (o._tkx === undefined) { o._tkx = o.x; o._tkz = o.z; o._tkb = 0; return; }
    const dx = o.x - o._tkx, dz = o.z - o._tkz, d = Math.hypot(dx, dz);
    if (d > 25) { o._tkx = o.x; o._tkz = o.z; return; } // a teleport, a ride: no line of prints across the map
    const K = TRACK_KINDS[kind];
    if (d >= K.every) {
      o._tks = o._tks > 0 ? -1 : 1; // left foot, right foot
      this.lay(kind, o.x, o.z, Math.atan2(dx, dz), who, sp, 0, life === null ? null : life * (GROUND_HOLD[this.biomeAt(o.x, o.z)] ?? 1), K.stagger ? o._tks : 0);
      if (bleed) { o._tkb += d; if (o._tkb >= TRACK_KINDS[bloodKind].every) { o._tkb = 0; this.lay(bloodKind, o.x + (Math.random() - 0.5) * 0.3, o.z + (Math.random() - 0.5) * 0.3, Math.atan2(dx, dz), who, sp); } }
      if (kind === TRACK_OF.infected && !this.raining() && DUSTY.includes(this.biomeAt(o.x, o.z)) && Math.random() < 0.6) this.g.fx?.spawn(2, o.x - dx / d * 0.3 + (Math.random() - 0.5) * 0.4, 0.2, o.z - dz / d * 0.3 + (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.6, 0.35 + Math.random() * 0.3, (Math.random() - 0.5) * 0.6, 1.4 + Math.random() * 0.8, 0.7 + Math.random() * 0.5, '#e2d2b0', -0.05); // a pale haze kicked up behind the shuffle, settling as it fades
      o._tkx = o.x; o._tkz = o.z;
    }
  }
  layPass() {
    const g = this.g, P = g.player, R = TRACKS.makerR, near = (o) => Math.abs(o.x - P.x) < R && Math.abs(o.z - P.z) < R;
    if (P.alive && !P.inVehicle && !P.swim && !((P.gy ?? 0) > 0.5)) this.maker(P, 'boot', P.id, 'person', (P.bleed ?? 0) > 0.05, this.fx.ownTrackMul !== 1 ? this.fx.ownTrackMul : null);
    for (const c of g.chars) {
      if (c === P || !c.alive || c.inVehicle || c.hidden || c.swim || (c.gy ?? 0) > 0.5 || !near(c)) continue;
      if (c.faction === 'zombie') { this.maker(c, c.crawl ? TRACK_OF.infectedCrawl : TRACK_OF.infected, c.id, 'infected', (c.bleed ?? 0) > 0.05 || c.hp < (c.maxHp ?? 75) * 0.6, null, TRACK_OF.infectedBlood); continue; }
      this.maker(c, 'boot', c.id, 'person', (c.bleed ?? 0) > 0.05);
    }
    for (const d of g.dogs?.dogs ?? []) if (!d.dead && !d.ride && near(d)) this.maker(d, 'paw', d.id, 'dog', d.downed || d.hp < (d.p?.hp ?? 50) * 0.5);
    for (const a of g.fauna?.live ?? []) {
      if (a.dead || a.held || a.form === 'swarm' || a.form === 'stilt' || (a.form === 'bird' && a.air) || !near(a)) continue;
      const kind = TRACK_OF.paws.includes(a.sp) ? 'paw' : TRACK_OF[a.form] ?? 'paw';
      this.maker(a, kind, a.id, a.sp, a.hp < a.maxHp * TRACKS.wounded);
    }
    for (const v of g.vehicles) {
      if (v.dead || v.sunk || !near(v)) continue;
      if (Math.hypot(v.vx ?? 0, v.vz ?? 0) < 1.5) { v._tkx = v.x; v._tkz = v.z; continue; }
      this.maker(v, 'tyre', v.id, v.type ?? 'vehicle', false);
    }
  }
  // How old a print may be and still be seen by a reader of tracking level L (game hours). Blood reads longer.
  maxAge(i, L, extraH = 0) {
    const K = TRACK_KINDS[KINDS[this.tk[i]]], blood = !!K.blood;
    const skill = (TRACKS.ageH + TRACKS.perLevelH * L + extraH) * K.base * (blood ? TRACKS.bleedFresh + 1 : 1) * (blood ? this.fx.bloodAgeMul : 1);
    return Math.min(K.lifeH, skill) * this.th[i] * (this.raining() ? TRACKS.rainMul : 1);
  }
  visible(i, L, now, extraH = 0) { return now - this.tt[i] <= this.maxAge(i, L, extraH); }
  whatOf(sp) { return SPECIES[sp]?.name ?? (sp === 'person' ? 'people' : sp === 'infected' ? 'the infected' : sp === 'dog' ? 'a dog' : sp); }

  // Read the ground round x,z as a reader of level L (the player's TRACKING by default): one line per kind of maker.
  read(x, z, r = TRACKS.readR, L = this.lv('tracking'), countFeet = this.fx.countFeet, readBlood = this.fx.readBlood) {
    const now = this.hours(), by = new Map();
    for (let n = 0; n < this.count; n++) {
      if (Math.abs(this.tx[n] - x) > r || Math.abs(this.tz[n] - z) > r || Math.hypot(this.tx[n] - x, this.tz[n] - z) > r) continue;
      if (!this.visible(n, L, now)) continue;
      const who = this.tw[n];
      let m = by.get(who);
      if (!m) by.set(who, (m = { who, sp: this.ts[n], kind: null, prints: 0, blood: 0, t: -Infinity, t0: Infinity, f: 0, x: 0, z: 0 }));
      const k = KINDS[this.tk[n]];
      if (TRACK_KINDS[k].blood) m.blood++;
      else { m.kind = k; m.prints++; }
      if (this.tt[n] > m.t) { m.t = this.tt[n]; m.f = this.tf[n]; m.x = this.tx[n]; m.z = this.tz[n]; }
      m.t0 = Math.min(m.t0, this.tt[n]);
    }
    const groups = new Map();
    for (const m of by.values()) {
      const key = m.sp;
      let G = groups.get(key);
      if (!G) groups.set(key, (G = { what: this.whatOf(m.sp), species: m.sp, kind: m.kind, makers: 0, bleeding: 0, blood: 0, t: -Infinity, t0: Infinity, hx: 0, hz: 0, whos: [] }));
      G.makers++; G.whos.push(m.who); G.kind ??= m.kind;
      if (m.blood) { G.bleeding++; G.blood += m.blood; }
      G.t = Math.max(G.t, m.t); G.t0 = Math.min(G.t0, m.t0);
      G.hx += Math.sin(m.f); G.hz += Math.cos(m.f);
    }
    const out = [];
    for (const G of groups.values()) {
      const ageMin = Math.max(0, Math.round((now - G.t) * 60)), heading = G.kind ? compass(G.hx, G.hz) : null;
      const count = countFeet ? G.makers : G.makers > 1 ? 'more than one' : 'one';
      const bleed = G.blood ? (readBlood ? `${G.bleeding === G.makers ? (G.makers > 1 ? 'all' : 'it\'s') : `${G.bleeding} of them`} bleeding` : 'blood') : null;
      const sign = G.kind ? TRACK_KINDS[G.kind].name : 'blood drops';
      out.push({
        what: G.what, species: G.species, sign, makers: count, ageMin, oldestMin: Math.round((now - G.t0) * 60), heading, bleeding: G.blood ? (readBlood ? G.bleeding : true) : 0,
        who: countFeet ? G.whos : undefined,
        text: `${G.what}${countFeet && G.makers > 1 ? ` x${G.makers}` : ''} · ${sign} · ${ageMin < 2 ? 'fresh' : ageMin < 90 ? `${ageMin} min` : `${r1(ageMin / 60)} h`}${heading ? ` · heading ${heading}` : ''}${bleed ? ` · ${bleed}` : ''}`,
      });
    }
    out.sort((a, b) => a.ageMin - b.ageMin);
    if (out.length && L === this.lv('tracking')) { this.stats.reads++; if (this.g.time - (this.readXpT ?? -99) > 5) { this.readXpT = this.g.time; this.gain('tracking', OUTDOOR_XP.tracking.read * out.length); } }
    return out;
  }
  // Every print one maker left that a reader of level L can still see, oldest first (a blood trail to follow).
  trail(who, L = this.lv('tracking'), kind = null) {
    const now = this.hours(), out = [];
    for (let n = 0; n < this.count; n++) {
      if (this.tw[n] !== who || (kind && KINDS[this.tk[n]] !== kind) || !this.visible(n, L, now)) continue;
      out.push({ kind: KINDS[this.tk[n]], x: r1(this.tx[n]), z: r1(this.tz[n]), ageMin: Math.round((now - this.tt[n]) * 60), t: this.tt[n] });
    }
    out.sort((a, b) => a.t - b.t);
    return out;
  }

  // The decals: what the player can read near where the camera looks, faded by age (one draw call).
  drawTracks() {
    const m = this.mesh;
    if (!m) return;
    const g = this.g, F = g.camLook ?? g.player, now = this.hours(), L = this.lv('tracking'), R = TRACKS.drawR, ground = g.fx?.ground;
    let n = 0;
    for (let k = 0; k < this.count && n < TRACKS.draw; k++) {
      const i = (this.head - 1 - k + TRACKS.pool) % TRACKS.pool; // newest first
      const x = this.tx[i], z = this.tz[i];
      if (Math.abs(x - F.x) > R || Math.abs(z - F.z) > R) continue;
      const max = this.maxAge(i, L), age = now - this.tt[i];
      if (age > max) continue;
      const K = TRACK_KINDS[KINDS[this.tk[i]]], fade = 1 - (age / Math.max(1e-3, max)) * 0.75;
      const f = this.tf[i], side = this.tside[i] * (K.stagger ?? 0), px = x + Math.cos(f) * side, pz = z - Math.sin(f) * side;
      _o.position.set(px, DECAL_Y + (ground ? ground(px, pz) : 0), pz); _o.rotation.set(0, f, 0); // over a building's floor and rugs too (engine/depthlayers.js)
      _o.scale.set(K.w ?? K.size * 0.6, 1, K.size); _o.updateMatrix();
      m.setMatrixAt(n, _o.matrix);
      m.setColorAt(n, _c.set(K.colour).lerp(_c2.set('#ffffff'), (1 - fade) * 1.1)); // it multiplies the ground: white is no mark at all, so an old print fades away, never pale
      this.cell.setX(n, K.cell ?? 0);
      n++;
    }
    m.count = n; m.visible = n > 0;
    if (n) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; this.cell.needsUpdate = true; }
  }

  // ---- hunters and skip tracers: anybody told to trail someone follows their sign ----------------------------------------
  // ai.js asks this before its idle wander (c.trailing = the quarry's id). Returns true while it is working the trail.
  trailStep(c, dt) {
    const g = this.g, who = c.trailing, q = who === g.player.id ? g.player : g.chars.find((o) => o.id === who);
    if (!q?.alive) { c.trailing = null; return false; }
    if (g.ai?.hostile?.(c, q) && Math.hypot(q.x - c.x, q.z - c.z) < 30 && g.sees?.(c, q)) { c.target = q; c.state = 'fight'; c.trailing = null; g.emit('trailEnd', { by: c.id, who, found: true }); return false; }
    if ((c.trT = (c.trT ?? 0) - dt) <= 0) {
      c.trT = 0.6;
      const L = c.trackSkill ?? 5, now = this.hours(), nose = c.trackR ?? 22;
      let best = -1, bt = c.trAt ?? -Infinity;
      for (let n = 0; n < this.count; n++) {
        if (this.tw[n] !== who || this.tt[n] <= bt || Math.abs(this.tx[n] - c.x) > nose || Math.abs(this.tz[n] - c.z) > nose || !this.visible(n, L, now)) continue;
        bt = this.tt[n]; best = n; // the newest it can reach from here: it follows the line forward
      }
      if (best >= 0) { c.trX = this.tx[best]; c.trZ = this.tz[best]; c.trAt = this.tt[best]; c.lostT = 0; }
      else if ((c.lostT = (c.lostT ?? 0) + 0.6) > 25) { g.emit('trailEnd', { by: c.id, who, found: false }); c.trailing = null; return false; }
    }
    if (c.trX === undefined) return false;
    const dx = c.trX - c.x, dz = c.trZ - c.z;
    if (Math.hypot(dx, dz) > 0.8) g.ai.move(c, dx, dz, c.trackSpeed ?? 3.4, dt); else c.speed = 0;
    c.state = 'trailing';
    return true;
  }

  // ---- dogs: a scent trail, and fetching what you shoot --------------------------------------------------------------------
  dogTraits(d) { return BREEDS[d.breed]?.traits ?? []; }
  dogNose(d) {
    const t = this.dogTraits(d), tr = t.includes('tracker') ? DOG_TRAITS.tracker : null;
    NOSE.r = DOG_TRAIL.noseR * (tr?.noseMul ?? 1) * (d.p?.noseR > 0 ? 1 : 0.7) * (1 + this.per('dogNose', 'animal_handling'));
    NOSE.ageH = (DOG_TRAIL.trailAgeH + (tr?.trailAgeH ?? 0)) * this.fx.dogTrailAgeMul;
    NOSE.speed = DOG_TRAIL.speed * (tr?.trailSpeed ?? 1);
    return NOSE; // reused: read it before the next call
  }
  // Put your dogs on a trail: who's (default: the freshest sign near you that is not yours or a dog's). The trail starts
  // at that maker's print nearest you.
  trackOrder(who = null, from = this.g.player) {
    const g = this.g, P = g.player, now = this.hours();
    const mine = g.dogs?.mine?.().filter((d) => !d.downed && !d.dead) ?? [];
    if (!mine.length) return { ok: false, why: 'no dog of yours to put on it' };
    const nose = this.dogNose(mine[0]);
    let start = -1, bd = 12;
    for (let n = 0; n < this.count; n++) {
      const w = this.tw[n];
      if (w === P.id || this.ts[n] === 'dog' || (who && w !== who) || now - this.tt[n] > nose.ageH) continue;
      const k = Math.hypot(this.tx[n] - from.x, this.tz[n] - from.z);
      if (k < bd) { bd = k; start = n; }
    }
    if (start < 0) return { ok: false, why: who ? `no sign of ${who} near you that a dog could still smell` : 'no fresh sign near you' };
    const W = this.tw[start];
    for (const d of mine) { d.seek = { kind: 'track', who: W, t: this.tt[start] - 1e-6, x: this.tx[start], z: this.tz[start], sp: this.ts[start], steps: 0 }; g.dogs.order(d, 'seek'); }
    g.hud?.toast?.(`*WHISTLE ×3* · ON THE TRAIL · ${this.whatOf(this.ts[start]).toUpperCase()}`, 'job');
    g.emit('dogTrail', { dogs: mine.map((d) => d.id), who: W, species: this.ts[start], x: r1(this.tx[start]), z: r1(this.tz[start]) });
    return { ok: true, who: W, species: this.ts[start], dogs: mine.map((d) => d.id), start: { x: r1(this.tx[start]), z: r1(this.tz[start]) } };
  }
  // dogs.js SEEK asks this for a track or a fetch: where to go now ({ x, z, v, face }), or null (done: back to heel).
  dogSeek(d, s, dt) {
    const g = this.g, P = g.player, k = Math.hypot(s.x - d.x, s.z - d.z);
    if (s.kind === 'fetch') {
      const a = s.ref;
      if (!a || !g.fauna.live.includes(a)) return null;
      if (!s.carry) { if (k > 0.9) return go(s.x, s.z, 7, 'fetch'); s.carry = true; }
      a.x = d.x + Math.sin(d.face) * 0.5; a.z = d.z + Math.cos(d.face) * 0.5; a.y = 0.35;
      const pk = Math.hypot(P.x - d.x, P.z - d.z);
      if (pk > 1.6) return go(P.x, P.z, 7, 'fetch');
      a.y = 0; a.x = P.x + Math.sin(P.face) * 0.8; a.z = P.z + Math.cos(P.face) * 0.8;
      this.stats.fetched++; this.gain('animal_handling', OUTDOOR_XP.animal_handling.fetch);
      g.emit('dogFetched', { dog: d.id, id: a.id, species: a.sp });
      g.hud?.toast?.(`${d.name.toUpperCase()} BRINGS BACK THE ${a.S.name.toUpperCase()}`, 'job');
      return null;
    }
    if (s.kind !== 'track') return null;
    if (s.end) {
      if ((s.endT = (s.endT ?? 0) + dt) > 10 || Math.hypot(P.x - d.x, P.z - d.z) < 3.5) return null;
      return go(d.x, d.z, 0, 'point', s.face ?? d.face);
    }
    if (k < 1.2) {
      const nose = this.dogNose(d), now = this.hours();
      let best = -1, bt = Infinity;
      for (let n = 0; n < this.count; n++) {
        if (this.tw[n] !== s.who || this.tt[n] <= s.t || now - this.tt[n] > nose.ageH || Math.abs(this.tx[n] - s.x) > nose.r || Math.abs(this.tz[n] - s.z) > nose.r) continue;
        if (this.tt[n] < bt && Math.hypot(this.tx[n] - s.x, this.tz[n] - s.z) <= nose.r) { bt = this.tt[n]; best = n; } // the next print along
      }
      if (best >= 0) { s.x = this.tx[best]; s.z = this.tz[best]; s.t = bt; s.steps++; }
      else {
        // The end of the line: the maker itself (alive, close), or where the sign runs out.
        const q = g.fauna?.live.find((a) => a.id === s.who) ?? g.chars.find((c) => c.id === s.who) ?? g.dogs?.dogs.find((o) => o.id === s.who);
        const found = !!q && !q.butchered && Math.hypot(q.x - d.x, q.z - d.z) < DOG_TRAIL.quarryR;
        s.end = true; s.face = found ? Math.atan2(q.x - d.x, q.z - d.z) : d.face;
        this.stats.dogTrails++; this.gain('animal_handling', OUTDOOR_XP.animal_handling.dogTrail); this.gain('tracking', OUTDOOR_XP.tracking.dogTrail);
        g.emit('dogTrailEnd', { dog: d.id, who: s.who, species: s.sp, steps: s.steps, found, x: r1(d.x), z: r1(d.z), quarry: found ? (q.dead ? 'carcass' : 'alive') : null });
        g.dogs?.bark?.(d, 'WOOF');
        g.hud?.toast?.(`${d.name.toUpperCase()} ${found ? `HAS FOUND THE ${this.whatOf(s.sp).toUpperCase()}` : 'LOSES THE SCENT HERE'}`, 'job');
        return go(d.x, d.z, 0, 'point', s.face);
      }
    }
    return go(s.x, s.z, this.dogNose(d).speed, 'track');
  }
  // A bird you shot came down: a fetching dog of yours goes for it once it lands.
  onBirdDown(a, by) {
    if (by !== this.g.player) return;
    this.stats.birdsDowned++;
    this.gain('hunting', OUTDOOR_XP.hunting.bird);
    if (this.downed.length < 8) this.downed.push(a);
  }
  birdsPass() {
    const g = this.g, P = g.player;
    for (let i = this.downed.length - 1; i >= 0; i--) {
      const a = this.downed[i];
      if (!g.fauna.live.includes(a)) { this.downed.splice(i, 1); continue; }
      if (a.air || a.y > 0.02) continue;
      this.downed.splice(i, 1);
      g.emit('birdLanded', { id: a.id, species: a.sp, x: r1(a.x), z: r1(a.z), dist: r1(Math.hypot(a.x - P.x, a.z - P.z)) });
      const dog = g.dogs?.mine?.().find((d) => !d.downed && !d.seek && !d.sic && (this.dogTraits(d).includes('bird_dog') || this.fx.fetch) && Math.hypot(d.x - a.x, d.z - a.z) < 60);
      if (dog) { dog.seek = { kind: 'fetch', ref: a, x: a.x, z: a.z }; g.dogs.order(dog, 'seek'); }
    }
    // A bird dog ranging puts up the ground birds it comes on.
    for (const d of g.dogs?.mine?.() ?? []) {
      if (d.downed || !this.dogTraits(d).includes('bird_dog')) continue;
      for (const a of g.fauna?.live ?? []) if (a.form === 'bird' && !a.air && !a.dead && Math.hypot(a.x - d.x, a.z - d.z) < DOG_TRAITS.bird_dog.flushR) g.fauna.bolt(a, d.x, d.z, 6, d, 'dog');
    }
  }

  // ---- water ---------------------------------------------------------------------------------------------------------------
  // What water is at x,z (THE water authority: world/water.js depthAt, the streamed world's body rows), or null if dry.
  waterKind(x, z) {
    const g = this.g, d = g.water?.depthAt?.(x, z) ?? 0;
    if (!(d > 0)) return null;
    if (Math.abs(x) <= ISLAND && Math.abs(z) <= ISLAND) return Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r ? 'lake' : 'river';
    const q = g.streamer?.W?.water?.sample?.(x, z), body = q?.body;
    if (body?.kind) return body.kind === 'wash' ? 'creek' : body.kind;
    if (this.regionAt(x, z) === 'florida') return this.biomeAt(x, z) === '.' ? 'sea' : 'swamp';
    return 'river';
  }
  // The first point ahead of p with fishing depth in it (between reach[0] and reach[1] m), or null.
  waterAhead(p, reach = FISHING.reach, min = FISHING.minDepth) {
    const fx = Math.sin(p.face), fz = Math.cos(p.face);
    for (let k = reach[0]; k <= reach[1]; k += 0.5) {
      const x = p.x + fx * k, z = p.z + fz * k;
      if ((this.g.water?.depthAt?.(x, z) ?? 0) >= min) return { x, z, k, kind: this.waterKind(x, z) };
    }
    return null;
  }
  bait() { for (const id of Object.keys(FISHING.bait)) if (this.g.inventory.carried.count(id)) return id; return null; }

  // ---- fishing -------------------------------------------------------------------------------------------------------------
  cast() {
    const g = this.g, P = g.player, inv = g.inventory;
    if (P.inVehicle || P.swim) return { ok: false, why: 'not from here' };
    if (!inv.carried.count('fishing_rod')) return { ok: false, why: 'you need a fishing rod' };
    if (!inv.carried.count('fish_hook')) return { ok: false, why: 'no hooks: a rod without one catches nothing' };
    const bait = this.bait();
    if (!bait) return { ok: false, why: 'no bait: grubs (forage for them), raw meat or a small fish' };
    const w = this.waterAhead(P);
    if (!w) return { ok: false, why: (g.water?.depthAt?.(P.x + Math.sin(P.face) * 4, P.z + Math.cos(P.face) * 4) ?? 0) > 0 ? 'too shallow to fish here' : 'no water in front of you to cast into' };
    inv.spend(bait, 1);
    const ph = phaseOf(g.sky?.time ?? 12);
    const wait = (FISHING.biteS[0] + Math.random() * (FISHING.biteS[1] - FISHING.biteS[0])) * Math.max(0.35, 1 + this.per('biteWait', 'fishing')) * (FISHING.bait[bait] ?? 1) * (FISHING.hourMul[ph] ?? 1);
    this.fishing = { x: w.x, z: w.z, kind: w.kind, px: P.x, pz: P.z, t: 0, biteAt: wait, phase: 'wait', bt: 0, window: FISHING.window + this.per('strikeWindow', 'fishing'), bait };
    this.stats.casts++;
    g.emit('fishCast', { x: r1(w.x), z: r1(w.z), water: w.kind, bait, wait: r1(wait) });
    return { ok: true, text: `LINE IN THE ${(w.kind ?? 'WATER').toUpperCase()} · WAIT FOR THE BITE · E TO STRIKE`, water: w.kind, wait };
  }
  // Strike: inside the window it lands; before the bite you pull the bait out of its mouth.
  strike() {
    const g = this.g, F = this.fishing;
    if (!F) return { ok: false, why: 'no line in the water' };
    if (F.phase === 'wait') { this.fishing = null; g.emit('fishMissed', { why: 'early' }); return { ok: false, why: 'too early: nothing on it yet (the bait came off)' }; }
    this.fishing = null;
    const got = this.landCatch(F);
    return { ok: true, text: `CAUGHT · ${got.map((x) => `${x.n} ${ITEMS[x.item].name.toUpperCase()}`).join(' · ')}`, items: got, water: F.kind };
  }
  catchRow(kind, region) {
    const rows = FISH.filter((f) => f.waters.includes(kind) && f.regions.includes(region));
    return pick(rows.length ? rows : FISH.filter((f) => f.waters.includes(kind)), (f) => f.w * (f.rare ? this.fx.rareMul : 1));
  }
  landCatch(F) {
    const g = this.g, inv = g.inventory, region = this.regionAt(F.x, F.z), got = [];
    if (Math.random() < Math.max(0.02, FISHING.trash + this.per('trash', 'fishing'))) {
      const [id] = pick(FISH_TRASH, (r) => r[1]);
      inv.stow(id, 1); got.push({ item: id, n: 1, trash: true }); this.stats.trash++; this.gain('fishing', OUTDOOR_XP.fishing.trash);
    } else {
      const n = Math.random() < this.fx.doubleCatch ? 2 : 1;
      for (let i = 0; i < n; i++) { const f = this.catchRow(F.kind, region); if (!f) continue; inv.stow(f.item, 1, { made: this.hours() }); got.push({ item: f.item, n: 1, fish: f.id }); }
      this.stats.fish += got.length; this.gain('fishing', OUTDOOR_XP.fishing.catch * got.length);
    }
    g.emit('fishCaught', { water: F.kind, region, items: got });
    g.hud?.toast?.(`ON THE BANK · ${got.map((x) => ITEMS[x.item].name.toUpperCase()).join(' · ')}`, 'job');
    return got;
  }
  fishStep(dt) {
    const g = this.g, P = g.player, F = this.fishing;
    if (!P.alive || P.inVehicle || Math.hypot(P.x - F.px, P.z - F.pz) > FISHING.moveCancel) { this.fishing = null; g.emit('fishMissed', { why: 'moved' }); return; }
    F.t += dt;
    const bob = F.phase === 'bite' ? Math.sin(F.bt * 30) * 0.06 - 0.05 : Math.sin(F.t * 2.5) * 0.02;
    g.wilds?.glint?.(F.x, 0.08 + bob + (g.water?.surfaceAt?.(F.x, F.z, 0) ?? 0), F.z, 0.07, F.phase === 'bite' ? '#ff5a3a' : '#f2ead2');
    if (F.phase === 'wait' && F.t >= F.biteAt) { F.phase = 'bite'; F.bt = 0; g.emit('fishBite', { window: r1(F.window) }); g.hud?.toast?.('BITE · E TO STRIKE', 'warn'); g.audio?.burst?.({ dur: 0.15, freq: 900, type: 'bandpass', vol: 0.15, decay: 0.12 }); }
    else if (F.phase === 'bite' && (F.bt += dt) > F.window) {
      this.fishing = null; this.stats.missed++;
      const hook = Math.random() < FISHING.hookLoss;
      if (hook) g.inventory.spend('fish_hook', 1);
      g.emit('fishMissed', { why: 'late', hook });
      g.hud?.toast?.(`IT GOT AWAY${hook ? ' · WITH THE HOOK' : ''}`, 'warn');
    }
  }
  // A fish trap or a gill net into the water ahead of you.
  setFishTrap(kind) {
    const g = this.g, P = g.player, T = FISHING.traps[kind];
    if (!g.inventory.carried.count(T.item)) return { ok: false, why: `no ${ITEMS[T.item].name.toLowerCase()} on you` };
    const w = this.waterAhead(P, [1, 5], 0.4);
    if (!w) return { ok: false, why: 'set it in water: face a bank' };
    g.inventory.spend(T.item, 1);
    const t = { id: `t${++this.seq}`, kind, x: r1(w.x), z: r1(w.z), water: w.kind, region: this.regionAt(w.x, w.z), lastAt: this.hours(), acc: 0, held: [] };
    this.traps.push(t);
    g.emit('trapSet', { id: t.id, kind, x: t.x, z: t.z, water: t.water });
    return { ok: true, text: `${ITEMS[T.item].name.toUpperCase()} SET · COME BACK FOR IT`, trap: t.id };
  }

  // ---- trapping: snares that fill on the game clock --------------------------------------------------------------------------
  setSnare() {
    const g = this.g, P = g.player;
    const max = TRAPPING.maxSnares + this.fx.maxSnares, n = this.traps.filter((t) => t.kind === 'snare').length;
    if (n >= max) return { ok: false, why: `you have ${n} snares out already (the most you can tend)` };
    if (!g.inventory.carried.count('snare_wire')) return { ok: false, why: 'no snare wire on you' };
    if (P.inVehicle || (g.water?.depthAt?.(P.x, P.z) ?? 0) > 0) return { ok: false, why: 'set a snare on dry ground' };
    g.inventory.spend('snare_wire', 1);
    const x = P.x + Math.sin(P.face) * 1.2, z = P.z + Math.cos(P.face) * 1.2;
    const t = { id: `t${++this.seq}`, kind: 'snare', x: r1(x), z: r1(z), biome: this.biomeAt(x, z), lastAt: this.hours(), acc: 0, held: [] };
    this.traps.push(t);
    this.gain('trapping', OUTDOOR_XP.trapping.set);
    g.emit('trapSet', { id: t.id, kind: 'snare', x: t.x, z: t.z, biome: t.biome });
    return { ok: true, text: 'SNARE SET ON THE GAME TRAIL · CHECK IT TOMORROW', trap: t.id };
  }
  // Bring a trap up to the clock: what it caught while nobody watched.
  fill(t) {
    const now = this.hours(), dH = Math.max(0, now - t.lastAt);
    t.lastAt = now;
    if (t.kind === 'snare') {
      if (t.held.length) return;
      t.acc += dH * TRAPPING.perHour * (TRAPPING.biomeGame[t.biome] ?? 0.8) * (1 + this.per('snareRate', 'trapping')) * this.fx.snareRateMul;
      if (t.acc >= 1 || Math.random() < t.acc * 0.15) { t.acc = 0; const c = pick(TRAPPING.catch, (r) => r.w); t.held.push(c.name); }
      return;
    }
    const T = FISHING.traps[t.kind];
    t.acc += dH * T.perHour * this.fx.trapFillMul * (1 + this.per('snareRate', 'trapping'));
    while (t.acc >= 1 && t.held.length < T.max) { t.acc -= 1; const f = this.catchRow(t.water, t.region); if (f) t.held.push(f.id); }
    if (t.held.length >= T.max) t.acc = 0;
  }
  // Empty the traps within reach (all=true: every one, an agent's shortcut). Returns what came out.
  checkTraps(all = false) {
    const g = this.g, P = g.player, inv = g.inventory, got = [], seen = [];
    for (const t of this.traps) {
      if (!all && Math.hypot(t.x - P.x, t.z - P.z) > CAMP.reach + 1.5) continue;
      this.fill(t); seen.push(t.id);
      for (const name of t.held) {
        if (t.kind === 'snare') {
          const c = TRAPPING.catch.find((r) => r.name === name);
          for (const [id, lo, hi] of [...c.items, ...(this.fx.snareDressed ? c.dressed : [])]) { const n = roll(lo, hi); inv.stow(id, n, { made: this.hours() }); got.push({ trap: t.id, item: id, n }); }
          this.stats.snared++;
        } else { const f = FISH.find((r) => r.id === name); inv.stow(f.item, 1, { made: this.hours() }); got.push({ trap: t.id, item: f.item, n: 1 }); this.stats.fishTrapped++; }
        this.gain('trapping', OUTDOOR_XP.trapping.catch);
      }
      t.held.length = 0;
    }
    if (!seen.length) return { ok: false, why: 'no trap of yours within reach' };
    g.emit('trapsChecked', { traps: seen, items: got });
    if (got.length) g.hud?.toast?.(`TRAPS · ${got.map((x) => `${x.n} ${ITEMS[x.item].name.toUpperCase()}`).join(' · ')}`, 'job');
    return { ok: true, text: got.length ? 'TRAPS EMPTIED' : 'NOTHING IN THEM YET', items: got, traps: seen };
  }

  // ---- foraging -------------------------------------------------------------------------------------------------------------
  patch(x, z) {
    const C = FORAGING.cell, key = `${Math.floor(x / C)},${Math.floor(z / C)}`, now = this.hours();
    let p = this.patches.get(key);
    if (!p) this.patches.set(key, (p = { r: 1, at: now }));
    p.r = Math.min(1, p.r + ((now - p.at) / 24) * FORAGING.regrowPerDay * this.fx.regrowMul); p.at = now;
    return p;
  }
  startForage() {
    const g = this.g, P = g.player;
    if (P.inVehicle || P.swim) return { ok: false, why: 'not from here' };
    if (this.job) return { ok: true, text: 'STILL SEARCHING', seconds: this.job.need - this.job.t };
    const need = FORAGING.seconds * Math.max(0.5, 1 + this.per('campTime', 'outdoorsman'));
    this.job = { t: 0, need, x: P.x, z: P.z };
    g.emit('forageStart', { x: r1(P.x), z: r1(P.z), seconds: r1(need), biome: this.biomeAt(P.x, P.z) });
    return { ok: true, text: `SEARCHING THE GROUND · ${Math.ceil(need)} S`, seconds: need };
  }
  forageStep(dt) {
    const g = this.g, P = g.player, J = this.job;
    if (!P.alive || P.inVehicle || Math.hypot(P.x - J.x, P.z - J.z) > FORAGING.moveCancel) { this.job = null; g.emit('forageStop', {}); return; }
    if ((J.t += dt) >= J.need) { this.job = null; this.finishForage(J.x, J.z); }
  }
  finishForage(x, z) {
    const g = this.g, inv = g.inventory, b = this.biomeAt(x, z), region = this.regionAt(x, z), wet = (g.water?.depthAt?.(x, z) ?? 0) > 0 || this.nearWater(x, z);
    const rows = FORAGE.filter((r) => r.biomes.includes(b) && (!r.region || r.region === region) && (!r.wet || wet));
    const P = this.patch(x, z), got = [], left = [], tries = FORAGING.rolls + this.fx.forageRolls, mul = (1 + this.per('forageP', 'foraging')) * P.r;
    for (let i = 0; i < tries && rows.length; i++) {
      const r = pick(rows, (o) => o.p);
      if (Math.random() >= Math.min(0.95, r.p * mul * 1.6)) continue;
      if (r.poison && this.fx.knowPoison) { left.push(r.item); continue; }
      const n = roll(r.n[0], r.n[1]);
      inv.stow(r.item, n, { made: this.hours() }); got.push({ item: r.item, n, med: !!r.med || undefined });
      this.gain('foraging', r.med ? OUTDOOR_XP.foraging.med : OUTDOOR_XP.foraging.find);
    }
    P.r = Math.max(0, P.r - FORAGING.take);
    this.stats.foraged += got.length;
    g.emit('foraged', { biome: b, region, items: got, left, patch: +P.r.toFixed(2) });
    g.hud?.toast?.(got.length ? `FOUND · ${got.map((o) => `${o.n} ${ITEMS[o.item].name.toUpperCase()}`).join(' · ')}${left.length ? ' · LEFT THE PALE CAPS' : ''}` : P.r < 0.3 ? 'PICKED OVER · TRY FURTHER OUT' : 'NOTHING HERE WORTH TAKING', got.length ? 'job' : 'warn');
    return { biome: b, region, items: got, left, patch: P.r };
  }
  nearWater(x, z, r = 12) { for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; if ((this.g.water?.depthAt?.(x + Math.sin(a) * r, z + Math.cos(a) * r) ?? 0) > 0) return true; } return false; }

  // ---- the camp kit --------------------------------------------------------------------------------------------------------------
  build(kind) {
    const g = this.g, P = g.player, inv = g.inventory, C = CAMP[kind];
    if (!C || kind === 'reach' || kind === 'max') return { ok: false, why: `build what? ${['firepit', 'rack', 'catcher'].join(' | ')}` };
    if (P.inVehicle || P.swim || (g.water?.depthAt?.(P.x, P.z) ?? 0) > 0) return { ok: false, why: 'build on dry ground' };
    if (this.camp.length >= CAMP.max) return { ok: false, why: 'you have built all the camp you can keep' };
    const cost = C.cost.map(([id, n]) => [id, Math.max(1, n + (kind === 'firepit' && id === 'deadwood' ? this.fx.fireWood : 0))]);
    for (const [id, n] of cost) if (inv.carried.count(id) < n) return { ok: false, why: `a ${C.name} takes ${cost.map(([i, k]) => `${k} ${ITEMS[i].name.toLowerCase()}`).join(' and ')}` };
    for (const [id, n] of cost) inv.spend(id, n);
    const x = P.x + Math.sin(P.face) * 1.5, z = P.z + Math.cos(P.face) * 1.5;
    const o = { id: `k${++this.seq}`, kind, x: r1(x), z: r1(z), face: +P.face.toFixed(2), at: this.hours(), lastAt: this.hours(), fuel: 0, slots: [], water: 0, fire: null };
    if (kind === 'firepit') o.fuel = 3 * C.hoursPerWood * this.fx.fireHoursMul;
    this.camp.push(o); this.stats.built++;
    this.gain('outdoorsman', OUTDOOR_XP.outdoorsman.build);
    g.emit('campBuilt', { id: o.id, kind, x: o.x, z: o.z, cost: cost.map(([id, n]) => ({ item: id, n })) });
    return { ok: true, text: `${C.name.toUpperCase()} BUILT${kind === 'firepit' ? ' AND LIT' : ''}`, id: o.id, camp: this.campView(o) };
  }
  campNear(x, z, kind = null, reach = CAMP.reach) { let best = null, bd = reach; for (const o of this.camp) { if (kind && o.kind !== kind) continue; const k = Math.hypot(o.x - x, o.z - z); if (k < bd) { bd = k; best = o; } } return best; }
  fuel(o) {
    const inv = this.g.inventory;
    if (!inv.carried.count('deadwood')) return { ok: false, why: 'no deadwood on you' };
    inv.spend('deadwood', 1);
    o.fuel += CAMP.firepit.hoursPerWood * this.fx.fireHoursMul;
    this.g.emit('campFueled', { id: o.id, fuel: r1(o.fuel) });
    return { ok: true, text: `ON THE FIRE · ${r1(o.fuel)} H OF FIRE` };
  }
  // Everything raw in your pack onto the rack (as many as it holds).
  rackLoad(o) {
    const g = this.g, inv = g.inventory, C = inv.carried, R = CAMP.rack, done = this.hours() + R.hours * this.fx.rackHoursMul;
    let n0 = o.slots.reduce((k, s) => k + s.n, 0), put = 0;
    for (let i = C.slots.length - 1; i >= 0 && n0 < R.slots; i--) {
      const s = C.slots[i], it = ITEMS[s.id];
      if (!it?.raw || !it.cooks || it.hot) continue;
      const t = inv.take(C, i, Math.min(s.n, R.slots - n0));
      o.slots.push({ item: t.id, n: t.n, doneAt: done }); n0 += t.n; put += t.n;
    }
    if (!put) return { ok: false, why: 'nothing raw on you to hang' };
    inv.changed?.();
    g.emit('rackLoaded', { id: o.id, n: put, doneAt: +done.toFixed(2) });
    return { ok: true, text: `${put} ON THE RACK · DRY IN ${r1(R.hours * this.fx.rackHoursMul)} H` };
  }
  rackTake(o) {
    const g = this.g, inv = g.inventory, now = this.hours(), got = [];
    for (let i = o.slots.length - 1; i >= 0; i--) { const s = o.slots[i]; if (s.doneAt > now) continue; inv.stow(CAMP.rack.makes, s.n, { made: now }); got.push({ from: s.item, n: s.n }); o.slots.splice(i, 1); }
    if (!got.length) return { ok: false, why: o.slots.length ? `not dry yet: ${r1(Math.min(...o.slots.map((s) => s.doneAt)) - now)} h more` : 'nothing on the rack' };
    const n = got.reduce((k, s) => k + s.n, 0);
    this.stats.dried += n; this.gain('cooking', OUTDOOR_XP.cooking.rack * n);
    g.emit('rackTaken', { id: o.id, items: got, made: CAMP.rack.makes, n });
    return { ok: true, text: `${n} ${ITEMS[CAMP.rack.makes].name.toUpperCase()} OFF THE RACK`, n };
  }
  // A rain catcher's water into everything you carry that holds water.
  refill(o) {
    const g = this.g, inv = g.inventory, PER = 0.25; // litres a use
    let used = 0;
    for (const s of inv.carried.slots) {
      const it = ITEMS[s.id];
      if (it?.refill !== 'water' || !it.uses) continue;
      while ((s.left ?? it.uses) < it.uses && o.water - used >= PER) { s.left = (s.left ?? it.uses) + 1; used += PER; }
    }
    if (!used) return { ok: false, why: o.water < PER ? 'the catcher is dry: it fills when it rains' : 'nothing on you to fill (or it is all full)' };
    o.water -= used; inv.changed?.();
    g.emit('catcherDrawn', { id: o.id, litres: r1(used), left: r1(o.water) });
    return { ok: true, text: `FILLED · ${r1(used)} L FROM THE CATCHER` };
  }
  // The clock on the camp: fires burn their wood, rain fills the catchers. Once a second.
  campPass() {
    const g = this.g, now = this.hours(), F = g.throwables?.fires;
    for (const o of this.camp) {
      const dH = Math.max(0, now - o.lastAt); o.lastAt = now;
      if (o.kind === 'firepit') {
        o.fuel = Math.max(0, o.fuel - dH);
        const lit = o.fire && F?.includes(o.fire);
        if (o.fuel > 0 && !lit && F) { o.fire = { x: o.x, z: o.z, r: CAMP.firepit.r, t: 1, dur: 1e9, by: null, pit: o.id }; F.push(o.fire); }
        else if (o.fuel <= 0 && lit) { o.fire.t = o.fire.dur + 1; o.fire = null; g.emit('campOut', { id: o.id }); }
      } else if (o.kind === 'catcher') {
        const rain = Math.min(1.6, g.sky?.cur?.rain ?? 0);
        if (rain > 0.05) o.water = Math.min(CAMP.catcher.cap, o.water + dH * CAMP.catcher.perHour * rain * this.fx.catcherMul);
      }
    }
  }
  campView(o) {
    const now = this.hours();
    return { id: o.id, kind: o.kind, x: o.x, z: o.z, dist: r1(Math.hypot(o.x - this.g.player.x, o.z - this.g.player.z)), fuelH: o.kind === 'firepit' ? r1(o.fuel) : undefined, lit: o.kind === 'firepit' ? !!o.fire : undefined,
      rack: o.kind === 'rack' ? o.slots.map((s) => ({ item: s.item, n: s.n, readyInH: r1(Math.max(0, s.doneAt - now)) })) : undefined, water: o.kind === 'catcher' ? r1(o.water) : undefined };
  }
  drawCamp() {
    const m = this.campMesh;
    if (!m) return;
    const ground = this.g.fx?.ground;
    let n = 0;
    for (const o of this.camp) {
      const C = CAMP[o.kind], [sx, sy, sz] = C.size;
      _o.position.set(o.x, sy / 2 + (ground ? ground(o.x, o.z) : 0), o.z); _o.rotation.set(0, o.face, 0); _o.scale.set(sx, sy, sz); _o.updateMatrix();
      m.setMatrixAt(n, _o.matrix); m.setColorAt(n, _c.set(o.kind === 'catcher' && o.water > 0.5 ? '#4e6a72' : C.colour)); n++;
    }
    for (const t of this.traps) { // a stake at a snare, a float over a trap
      if (n >= CAMP.max) break;
      _o.position.set(t.x, t.kind === 'snare' ? 0.25 : 0.06, t.z); _o.rotation.set(0, 0, 0); _o.scale.set(0.12, t.kind === 'snare' ? 0.5 : 0.12, 0.12); _o.updateMatrix();
      m.setMatrixAt(n, _o.matrix); m.setColorAt(n, _c.set(t.held.length ? '#c8a040' : '#8a7a5a')); n++;
    }
    m.count = n; m.visible = n > 0;
    if (n) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
  }

  // ---- E (fauna.nearFor asks us when there is no carcass and nothing to cook) ------------------------------------------------
  nearFor(p) {
    const g = this.g;
    if (this.fishing) return { verb: 'strike', text: this.fishing.phase === 'bite' ? '<b class="warn">BITE</b> · strike!' : 'Line in the water · wait for the bite (moving reels in)' };
    if (this.job) return { verb: 'busy', text: `Searching the ground · ${Math.round((this.job.t / this.job.need) * 100)}% · move to stop` };
    const o = this.campNear(p.x, p.z);
    if (o) {
      const inv = g.inventory;
      if (o.kind === 'firepit') return inv.carried.count('deadwood') ? { verb: 'fuel', o, text: `Put deadwood on the fire pit (${r1(o.fuel)} h left)` } : { verb: 'none', text: `Fire pit · ${o.fuel > 0 ? `${r1(o.fuel)} h of fire` : 'out · deadwood lights it'}` };
      if (o.kind === 'rack') { const now = this.hours(); if (o.slots.some((s) => s.doneAt <= now)) return { verb: 'rackTake', o, text: 'Take the dried meat off the rack' }; if (g.fauna?.rawCount?.()) return { verb: 'rackLoad', o, text: 'Hang your raw meat on the drying rack' }; return { verb: 'none', text: `Drying rack · ${o.slots.length ? `${r1(Math.min(...o.slots.map((s) => s.doneAt)) - now)} h to dry` : 'empty'}` }; }
      if (o.kind === 'catcher') return { verb: 'refill', o, text: `Fill up from the rain catcher (${r1(o.water)} L)` };
    }
    if (this.traps.some((t) => Math.hypot(t.x - p.x, t.z - p.z) < CAMP.reach + 1.5)) return { verb: 'traps', text: 'Check your trap' };
    if (g.inventory.carried.count('fishing_rod') && this.waterAhead(p)) return { verb: 'cast', text: 'Cast your line' };
    if ((p.crouch || p.crouched) && !p.inVehicle && !(g.water?.depthAt?.(p.x, p.z) > 0)) return { verb: 'forage', text: 'Search the ground (forage)' };
    return null;
  }
  interact(o) {
    if (o.verb === 'strike') return this.strike();
    if (o.verb === 'busy') return { ok: true, text: 'STILL SEARCHING' };
    if (o.verb === 'fuel') return this.fuel(o.o);
    if (o.verb === 'rackLoad') return this.rackLoad(o.o);
    if (o.verb === 'rackTake') return this.rackTake(o.o);
    if (o.verb === 'refill') return this.refill(o.o);
    if (o.verb === 'traps') return this.checkTraps();
    if (o.verb === 'cast') return this.cast();
    if (o.verb === 'forage') return this.startForage();
    return { ok: false, why: o.text ?? 'nothing here' };
  }
  // The PACK screen's use verbs (inventory.act asks us last).
  act(verb) {
    if (verb === 'fish') return this.fishing ? this.strike() : this.cast();
    if (verb === 'fishtrap') return this.setFishTrap('fishtrap');
    if (verb === 'net') return this.setFishTrap('net');
    if (verb === 'catcher') return this.build('catcher');
    return null;
  }

  // ---- the loop ---------------------------------------------------------------------------------------------------------------
  update(dt) {
    const g = this.g;
    if ((this.fxT -= dt) <= 0) { this.fxT = 0.5; this.recompute(); }
    if ((this.layT -= dt) <= 0) { this.layT = TRACKS.layEvery; this.layPass(); }
    if (this.fishing) this.fishStep(dt);
    if (this.job) this.forageStep(dt);
    if ((this.slowT -= dt) <= 0) {
      this.slowT = 1;
      this.campPass();
      if (this.downed.length || g.dogs?.mine?.().length) this.birdsPass();
      // A hunter who lost sight of you works your trail.
      for (const c of g.chars) if (c.alive && c.hunterOf && !c.target && !c.trailing && c !== g.player) { c.trailing = g.player.id; c.trackSkill ??= 5; this.stats.trailed++; }
    }
    if ((this.drawT -= dt) <= 0) { this.drawT = 0.25; this.drawTracks(); this.drawCamp(); }
  }

  view() {
    const P = this.g.player, skills = {};
    for (const k of ['tracking', 'hunting', 'fishing', 'foraging', 'trapping', 'animal_handling', 'cooking', 'outdoorsman']) skills[k] = this.lv(k);
    return {
      skills, talents: this.talents().filter((t) => t.open).map((t) => t.id), fx: Object.fromEntries(Object.entries(this.fx).filter(([k, v]) => v !== FX0[k])),
      tracks: { pool: this.count, drawn: this.mesh?.count ?? 0, laid: this.stats.laid },
      fishing: this.fishing ? { phase: this.fishing.phase, water: this.fishing.kind, waitS: r1(this.fishing.biteAt - this.fishing.t) } : null,
      foraging: this.job ? { done: +(this.job.t / this.job.need).toFixed(2) } : null,
      camp: this.camp.map((o) => this.campView(o)),
      traps: this.traps.map((t) => ({ id: t.id, kind: t.kind, x: t.x, z: t.z, dist: r1(Math.hypot(t.x - P.x, t.z - P.z)), water: t.water, biome: t.biome, held: t.held.length })),
      stats: { ...this.stats },
    };
  }

  // Tracks are not saved (sign is for now); the camp, the traps and the picked-over patches are.
  save() {
    return { seq: this.seq, camp: this.camp.map((o) => ({ ...o, fire: null, slots: o.slots.map((s) => ({ ...s })) })), traps: this.traps.map((t) => ({ ...t, held: [...t.held] })), patches: [...this.patches].map(([k, p]) => [k, +p.r.toFixed(3), +p.at.toFixed(2)]) };
  }
  load(s) {
    for (const o of this.camp) if (o.fire) o.fire.t = o.fire.dur + 1;
    this.camp = []; this.traps = []; this.patches.clear(); this.fishing = null; this.job = null; this.downed.length = 0;
    this.count = 0; this.head = 0;
    if (!s) return;
    this.seq = s.seq ?? 0;
    for (const o of s.camp ?? []) this.camp.push({ ...o, fire: null, slots: (o.slots ?? []).map((x) => ({ ...x })) });
    for (const t of s.traps ?? []) this.traps.push({ ...t, held: [...(t.held ?? [])] });
    for (const [k, r, at] of s.patches ?? []) this.patches.set(k, { r, at });
  }
}
const _c2 = new THREE.Color();
// Dry ground a shuffle kicks dust up off (usmap biome letters: desert, scrub, dead sprawl, mountain dirt, open plain).
const DUSTY = ['d', 'a', 'u', '.', 'm', 'p'];

// THE PRINT ATLAS: four shapes on one 256 px canvas (2 x 2 cells of 128), the mask in red (0 no mark .. 1 full). In a
// cell the bottom is the FRONT of the print (the way it went), the top its back. 0 a boot sole (heel and tread),
// 1 a shuffling scuff (the ball of the foot, the toe dragged back into a streak), 2 a long drag or smear (a crawler's
// belly, hands clawing at the front; a tyre; blood), 3 a round splat (drops, paws, hooves). Drawn once, in code.
function printAtlas() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 256;
  const x = cv.getContext('2d');
  x.fillStyle = '#000'; x.fillRect(0, 0, 256, 256);
  const cell = (k, fn) => { x.save(); x.translate((k % 2) * 128, 128 - Math.floor(k / 2) * 128); x.beginPath(); x.rect(0, 0, 128, 128); x.clip(); fn(); x.restore(); };
  const blob = (cx, cy, rx, ry, a, blur = 6) => { x.save(); x.filter = `blur(${blur}px)`; x.globalAlpha = a; x.fillStyle = '#fff'; x.beginPath(); x.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); x.fill(); x.restore(); };
  cell(0, () => { // boot: forefoot at the front (bottom), a waist, the heel at the back; tread lines lighter
    blob(64, 86, 30, 34, 0.85, 4); blob(64, 58, 22, 22, 0.55, 5); blob(64, 30, 24, 20, 0.8, 4);
    x.save(); x.globalCompositeOperation = 'source-atop'; x.strokeStyle = 'rgba(0,0,0,0.45)'; x.lineWidth = 4;
    for (let y = 70; y < 116; y += 10) { x.beginPath(); x.moveTo(40, y); x.lineTo(88, y); x.stroke(); }
    for (let y = 18; y < 44; y += 9) { x.beginPath(); x.moveTo(44, y); x.lineTo(84, y); x.stroke(); }
    x.restore();
  });
  cell(1, () => { // scuff: a whole sole pressed in unevenly (the ball heavy, the heel light), the toe dragged back into a smear
    blob(64, 96, 26, 26, 0.95, 3); blob(64, 66, 18, 16, 0.6, 4); blob(62, 44, 20, 16, 0.5, 4);
    const gr = x.createLinearGradient(0, 100, 0, 4); gr.addColorStop(0, 'rgba(255,255,255,0.75)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    x.save(); x.filter = 'blur(4px)'; x.fillStyle = gr; x.beginPath(); x.moveTo(50, 104); x.quadraticCurveTo(54, 50, 58, 4); x.lineTo(70, 4); x.quadraticCurveTo(76, 50, 80, 104); x.fill(); x.restore();
  });
  cell(2, () => { // drag: a long streak, heavier at the front, with claw lines where the hands dug in
    const gr = x.createLinearGradient(0, 124, 0, 2); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.75, 'rgba(255,255,255,0.8)'); gr.addColorStop(1, 'rgba(255,255,255,0.25)');
    x.save(); x.filter = 'blur(4px)'; x.fillStyle = gr; x.beginPath(); x.ellipse(64, 64, 36, 62, 0, 0, Math.PI * 2); x.fill(); x.restore();
    x.save(); x.filter = 'blur(1.5px)'; x.strokeStyle = 'rgba(255,255,255,0.9)'; x.lineWidth = 4;
    for (const dx of [-26, -12, 12, 26]) { x.beginPath(); x.moveTo(64 + dx, 124); x.lineTo(64 + dx * 0.8, 92); x.stroke(); }
    x.restore();
  });
  cell(3, () => { // splat: a few overlapping soft drops
    for (const [cx, cy, r, a] of [[64, 64, 30, 0.85], [44, 52, 14, 0.7], [84, 76, 12, 0.7], [70, 40, 10, 0.6], [50, 84, 9, 0.6]]) blob(cx, cy, r, r * 0.9, a, 4);
  });
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.NoColorSpace; t.anisotropy = 4;
  return t;
}
// The sign's material: a print MULTIPLIES the ground under it (a print can only darken it, never read as paper), the
// shape from the atlas cell the instance names (aCell). One material, one draw call; fog and tone mapping off so an
// unmarked texel stays exactly white (= no change to the ground).
function printMaterial() {
  const m = new THREE.MeshBasicMaterial({ color: '#ffffff', map: typeof document !== 'undefined' ? printAtlas() : null, transparent: true, premultipliedAlpha: true, blending: THREE.MultiplyBlending, depthWrite: false, fog: false, toneMapped: false });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aCell;\nvarying vec2 vCellUv;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvCellUv = (uv + vec2(mod(aCell, 2.0), floor(aCell / 2.0))) * 0.5;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vCellUv;')
      .replace('#include <map_fragment>', '')
      .replace('#include <color_fragment>', '#include <color_fragment>\n#ifdef USE_MAP\ndiffuseColor.rgb = mix(vec3(1.0), diffuseColor.rgb, texture2D(map, vCellUv).r);\n#endif');
  };
  return m;
}
