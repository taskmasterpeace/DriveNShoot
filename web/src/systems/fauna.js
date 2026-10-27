import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { SPECIES, HABITATS, ACTIVE, PHASES, PRESENCE, FAUNA_RULES as R, REGION_OF_STATE, habitatsFromRegion } from '../data/fauna.js';
import { GAIT } from '../data/dogs.js';
import { TRAPS } from '../data/greyborn.js';
import { ITEMS } from '../data/items.js';
import { DogRenderer } from './dogs.js';
import { RAY_SOLID, rayCircle } from '../engine/collision.js';
import { brushField } from '../world/brush.js';
import { angleLerp } from '../engine/rng.js';

// L5 LIFE (docs/design/WEB_FAUNA.md; rows in data/fauna.js). The fauna director spawns animals by the formula
//   per chunk = perKm2 x chunk km² x biome share x ACTIVE[pattern][phase] x (1 - presence)
// from the biome under each streamed chunk near you, the hour, and how much of man is about (towns, the road, recent
// gunfire). A chunk's animals are RECORDS (rolled from the chunk, the day and the phase of it: a pure function), given
// bodies while the chunk is near you and written back when you leave, like the ring's residents. An animal is never a
// Character: it takes none of the 160 slots. Brains by temper: prey graze and bolt (and run into the road), predators
// stalk the weak and back off fire and a lit beam, territorial hogs warn and charge, ambushers wait (a rattlesnake
// warns first, a gator lunges off the bank and rolls), vultures find the dead and circle over them, wading birds scatter
// ahead of whatever is coming. Butcher a carcass with E and a blade, cook the meat over a fire or on a camped RV's stove.
// The hot ground's Glasslings and the Lantern (systems/hotground.js, characters there) get their real bodies here.
const TAU = Math.PI * 2;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const KM2 = (R.chunk * R.chunk) / 1e6;
const REGION_ALIAS = { arizona: 'west', phoenix: 'west', p1: 'west' };
const SIDES = [-1, 1];
const TIMERS = ['atkCd', 'alarmT', 'fleeT', 'frozenT', 'backT', 'strikeT', 'lungeT', 'hitCd', 'infT'];
// One small seeded stream (mulberry32): a chunk's roll is a pure function of its key, the day and the phase.
function rng32(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function hash3(a, b, c) { let h = 0x9e3779b1 ^ Math.imul(a | 0, 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) ^ Math.imul(b | 0, 0x27d4eb2f); h = Math.imul(h ^ (h >>> 16), 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b9); return (h ^ (h >>> 15)) >>> 0; }
const phaseIndex = (hour) => { const h = ((hour % 24) + 24) % 24; for (let i = 0; i < PHASES.length; i++) { const P = PHASES[i]; if (P.from < P.to ? h >= P.from && h < P.to : h >= P.from || h < P.to) return i; } return 2; };
// Where an animal wants to be this frame, in its own object (no garbage).
function W(a, x, z, v, face = undefined) { const w = a.w; w.x = x; w.z = z; w.v = v; w.face = face; return w; }
const _p = { x: 0, z: 0 }, HIT = { t: 0, animal: null }, _pick = { t: null, d: 0, k: null };

export class Fauna {
  constructor(game) {
    this.g = game;
    game.fauna = this;
    this.enabled = true;
    this.spawning = true;     // false: the director rolls and promotes nothing (a test's stage holds only its own animals)
    this.cells = new Map();  // chunk key -> { key, cx, cz, roll, recs: [], live: bool, awayAt }
    this.live = [];           // animals with bodies
    this.heat = new Map();    // noise heat: cell key -> { v, h (game hour it was set) }
    this.bodies = new Map();  // vultures' interest: body key -> { x, z, since, due, called, ref }
    this.extra = [];          // habitat rows absorbed from a region layer (habitatsFromRegion)
    this.seq = 0; this.t = 0; this.tickT = 0; this.lastSeq = 0; this.frame = 0;
    this.job = null;          // the butchering in progress
    this.stats = { spawned: 0, despawned: 0, killed: 0, butchered: 0, roadkill: 0, strikes: 0, rattles: 0, lunges: 0, rolls: 0, scatters: 0, cooked: 0, yips: 0, charges: 0, vultures: 0, trapped: 0 };
    this.r = game.scene ? new FaunaRenderer(game.scene) : null;
  }

  // ---- the world under a chunk ---------------------------------------------------------------------------------------
  hours() { return this.g.inventory?.hours?.() ?? (this.g.society?.day ?? 0) * 24 + (this.g.sky?.time ?? 12); }
  day() { return this.g.society?.day ?? 0; }
  hour() { return this.g.sky?.time ?? 12; }
  biomeAt(x, z) { return this.g.streamer?.W?.biomeAt?.(x, z) ?? 'd'; }
  // The region a point is in: the region layer's own answer when there is one (another agent's Florida: data/regions.js),
  // else the state under it (WorldIndex.stateAt) through REGION_OF_STATE, else the West.
  regionAt(x, z) {
    const g = this.g;
    let r = null;
    try { r = g.streamer?.W?.regionOf?.(x, z) ?? g.regions?.regionAt?.(x, z) ?? null; } catch { r = null; }
    const id = typeof r === 'string' ? r : r?.id ?? null;
    if (id) return REGION_ALIAS[id] ?? id;
    const st = g.streamer?.W?.stateAt?.(x, z);
    return (st && REGION_OF_STATE[st]) || 'west';
  }
  depthAt(x, z) { return this.g.water?.depthAt?.(x, z) ?? 0; }
  // Hot ground: a hotground.js zone (0 edge .. 1 centre) or a BRUSH rad stroke.
  hotAt(x, z) { const h = this.g.hotground?.at?.(x, z); return Math.max(h ? 0.3 + 0.7 * h.k : 0, brushField.radAt?.(x, z) ?? 0); }
  // A water's edge here: dry footing with water deeper than 0.6 m within 6 m.
  edgeAt(x, z) {
    if (this.depthAt(x, z) > 0.25) return false;
    for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; if (this.depthAt(x + Math.sin(a) * 6, z + Math.cos(a) * 6) > 0.6) return true; }
    return false;
  }

  // Human presence 0..1 (data/fauna.js PRESENCE): the largest of a town, the island's ruins, the road, the noise heat.
  presence(x, z) {
    const P = PRESENCE, g = this.g;
    const rh = Math.hypot(x - P.rustHaven.x, z - P.rustHaven.z);
    let p = 1 - clamp01((rh - P.rustHaven.r) / P.rustHaven.fade);
    if (Math.abs(x) <= 464 && Math.abs(z) <= 464 && rh < P.ruins.r) p = Math.max(p, P.ruins.v);
    const W0 = g.streamer?.W;
    if (W0?.towns) for (const t of W0.towns) {
      if (!t.built || t.id === 'phoenix') continue;
      const d = Math.abs(t.x - x) + Math.abs(t.z - z);
      if (d > (P.town.r + P.town.fade) * 1.5) continue;
      p = Math.max(p, P.town.v * (1 - clamp01((Math.hypot(t.x - x, t.z - z) - P.town.r) / P.town.fade)));
    }
    // A region's walled holdouts (world/holdout.js: Meridian) count as towns: full inside the walls, fading past them.
    if (W0?.holdouts) for (const H of W0.holdouts) {
      if (H.cx === undefined || Math.abs(H.cx - x) > 2000 || Math.abs(H.cz - z) > 2000) continue;
      const half = Math.max(H.hw ?? 0, H.hd ?? 0), d = Math.hypot(H.cx - x, H.cz - z);
      p = Math.max(p, 1 - clamp01((d - half - 40) / P.town.fade));
    }
    if (W0?.project && (Math.abs(x) > 464 || Math.abs(z) > 464)) { const pr = W0.project(x, z, 160); if (pr.d < Infinity) p = Math.max(p, P.road.v * (1 - clamp01((pr.d - P.road.d) / P.road.fade))); }
    p = Math.max(p, Math.min(1, this.heatAt(x, z) * P.heat.heatK));
    return clamp01(p);
  }
  heatAt(x, z) {
    const H = PRESENCE.heat, c = this.heat.get(`${Math.floor(x / H.cell)},${Math.floor(z / H.cell)}`);
    return c ? c.v * Math.pow(0.5, Math.max(0, this.hours() - c.h) / H.halfLife) : 0;
  }
  addHeat(x, z, v) {
    const H = PRESENCE.heat, k = `${Math.floor(x / H.cell)},${Math.floor(z / H.cell)}`;
    const now = this.hours(), c = this.heat.get(k);
    const cur = c ? c.v * Math.pow(0.5, Math.max(0, now - c.h) / H.halfLife) : 0;
    this.heat.set(k, { v: Math.min(H.max, cur + v), h: now });
    if (this.heat.size > 600) for (const [kk, cc] of this.heat) if (cc.v * Math.pow(0.5, (now - cc.h) / H.halfLife) < 0.05) this.heat.delete(kk);
  }

  habitats() { return this.extra.length ? HABITATS.concat(this.extra) : HABITATS; }
  // Another region layer's life rows (Florida's data/regions.js `life.fauna`) as habitat rows.
  absorbRegion(regionId, life) { const rows = habitatsFromRegion(regionId, life); for (const r of rows) if (!this.extra.some((e) => e.region === r.region && e.species === r.species)) this.extra.push(r); return rows.length; }

  // The formula for one chunk: every habitat row's terms and its expected animals. at: { hour, presence } overrides.
  density(cx, cz, at = {}) {
    const C = R.chunk, n = R.samples, x0 = cx * C, z0 = cz * C;
    const mx = x0 + C / 2, mz = z0 + C / 2;
    const region = at.region ?? this.regionAt(mx, mz);
    const letters = [];
    let hot = 0;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const x = x0 + ((i + 0.5) / n) * C, z = z0 + ((j + 0.5) / n) * C; letters.push(this.biomeAt(x, z)); hot += this.hotAt(x, z) > 0.25 ? 1 : 0; }
    const hotShare = hot / (n * n);
    // Water's edge: a finer scan (8 x 8) for wet and dry cells; an edge when both are there.
    let wet = 0, dry = 0;
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { const d = this.depthAt(x0 + ((i + 0.5) / 8) * C, z0 + ((j + 0.5) / 8) * C); if (d > 0.4) wet++; else dry++; }
    const edge = wet && dry ? Math.min(1, (Math.min(wet, dry) / 64) * 6) : 0;
    const hour = at.hour ?? this.hour(), ph = PHASES[phaseIndex(hour)].id;
    const presence = at.presence ?? this.presence(mx, mz);
    const rows = [];
    let total = 0;
    for (const H of this.habitats()) {
      const S = SPECIES[H.species];
      if (!S) continue;
      let share;
      if (H.hot) share = hotShare;
      else { if (H.region !== region) continue; let k = 0; for (const L of letters) if (H.biomes.includes(L)) k++; share = k / letters.length; if (hotShare > 0.5) share *= 0.2; }
      if (H.near === 'water') share *= edge;
      if (share <= 0) continue;
      const tod = ACTIVE[S.active]?.[ph] ?? 1;
      const expected = H.perKm2 * KM2 * share * tod * (1 - presence);
      rows.push({ species: H.species, perKm2: H.perKm2, km2: +KM2.toFixed(4), share: +share.toFixed(3), tod, presence: +presence.toFixed(3), expected: +expected.toFixed(4), group: S.group.size });
      total += expected;
    }
    // The pool budget: a chunk never holds more than chunkBudget (scaled down, row by row alike).
    const k = total > R.chunkBudget ? R.chunkBudget / total : 1;
    if (k < 1) for (const r of rows) r.expected = +(r.expected * k).toFixed(4);
    return { cx, cz, region, biomes: letters.join(''), hot: +hotShare.toFixed(2), edge: +edge.toFixed(2), phase: ph, hour: +hour.toFixed(2), presence: +presence.toFixed(3), rows, total: +(total * k).toFixed(3), budget: R.chunkBudget, capped: k < 1 };
  }

  // How many of each a roll gives (no placement): groups ~ expected / mean group size, each its own size. The
  // expectation of the animals is the formula's number.
  rollCounts(D, seed) {
    const rnd = rng32(seed), out = {};
    let left = R.chunkBudget;
    for (const r of D.rows) {
      const [a, b] = r.group, mean = (a + b) / 2, G = r.expected / mean;
      let ng = Math.floor(G) + (rnd() < G - Math.floor(G) ? 1 : 0), n = 0;
      while (ng-- > 0 && left > 0) { const s = Math.min(left, a + Math.floor(rnd() * (b - a + 1))); n += s; left -= s; }
      if (n) out[r.species] = n;
    }
    return out;
  }

  // ---- records ----------------------------------------------------------------------------------------------------------
  cellKey(cx, cz) { return `${cx},${cz}`; }
  cell(cx, cz) { const k = this.cellKey(cx, cz); let c = this.cells.get(k); if (!c) { c = { key: k, cx, cz, roll: null, recs: [], live: false, awayAt: -1e9 }; this.cells.set(k, c); } return c; }
  rollId(day, ph) { return `${day}:${ph}`; }

  // Roll a chunk's animals for this day and phase: who, how many, where (records; bodies come later).
  roll(cell) {
    const D = this.density(cell.cx, cell.cz), day = this.day(), ph = phaseIndex(this.hour());
    const seed = hash3(cell.cx * 7919 + ph, cell.cz * 104729 + 17, day * 31 + 0x5f);
    const counts = this.rollCounts(D, seed), rnd = rng32(seed ^ 0xa5a5a5);
    const recs = cell.recs.filter((r) => (r.dead && !r.gone) || r.test); // carcasses stay where they fell (and a test's own)
    const C = R.chunk, x0 = cell.cx * C, z0 = cell.cz * C;
    for (const [sp, n] of Object.entries(counts)) {
      const S = SPECIES[sp], H = this.habitats().find((h) => h.species === sp && (h.hot || h.region === D.region));
      let left = n;
      while (left > 0) {
        const [a, b] = S.group.size, size = Math.min(left, Math.max(1, a + Math.floor(rnd() * (b - a + 1))));
        left -= size;
        const spot = this.findSpot(rnd, x0, z0, C, S, H, D.region);
        if (!spot) continue;
        const grp = `g${cell.key}:${sp}:${left}`;
        for (let i = 0; i < size; i++) {
          const ang = rnd() * TAU, rr = size > 1 ? 1.5 + rnd() * (S.form === 'bird' ? 3 : 5) : 0;
          recs.push({ id: `f${++this.seq}`, sp, x: spot.x + Math.sin(ang) * rr, z: spot.z + Math.cos(ang) * rr, hx: spot.x, hz: spot.z, hp: null, dead: false, grp, lead: i === 0, buck: S.bucks ? rnd() < S.bucks : false, var: rnd(), cell: cell.key });
        }
      }
    }
    cell.recs = recs; cell.roll = this.rollId(day, ph);
    return counts;
  }

  // A spot in the chunk that suits it: its biome (or hot ground), a bank if it wants water, not deep in a town, not in
  // a wall, never in water for a land animal.
  findSpot(rnd, x0, z0, C, S, H, region) {
    for (let k = 0; k < 14; k++) {
      const x = x0 + 8 + rnd() * (C - 16), z = z0 + 8 + rnd() * (C - 16);
      if (H?.hot) { if (this.hotAt(x, z) < 0.25) continue; }
      else if (H && !H.biomes.includes(this.biomeAt(x, z))) continue;
      if (H?.near === 'water') { const e = this.bankNear(x, z, 26); if (!e) continue; return e; }
      if (this.depthAt(x, z) > 0.3) continue;
      if (this.presence(x, z) > 0.92) continue;
      _p.x = x; _p.z = z; this.g.statics?.resolveCircle?.(_p, 0.6);
      if (Math.hypot(_p.x - x, _p.z - z) > 0.05) continue; // inside something
      return { x, z };
    }
    return null;
  }
  // The nearest bank to (x, z) within r: dry footing at a water's edge (and the water point just off it).
  bankNear(x, z, r = 20) {
    let best = null, bd = Infinity;
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * TAU, rr = (0.25 + (i % 4) * 0.25) * r, px = x + Math.sin(a) * rr, pz = z + Math.cos(a) * rr;
      if (this.depthAt(px, pz) > 0.2) continue;
      for (let j = 0; j < 8; j++) {
        const b = (j / 8) * TAU, wx = px + Math.sin(b) * 3.5, wz = pz + Math.cos(b) * 3.5;
        if (this.depthAt(wx, wz) > 0.7) { const d = Math.hypot(px - x, pz - z); if (d < bd) { bd = d; best = { x: px, z: pz, wx, wz }; } break; }
      }
    }
    return best;
  }

  // ---- bodies ----------------------------------------------------------------------------------------------------------
  // A body for a record (or a fresh one for an agent's spawn). Returns the animal or null (over a budget).
  make(rec) {
    const S = SPECIES[rec.sp];
    if (!S || this.live.length >= R.maxLive + 12) return null;
    const f = S.form, cap = f === 'quad' ? R.maxQuads : f === 'snake' ? R.maxSnakes : f === 'bird' ? R.maxBirds : f === 'gator' ? R.maxGators : f === 'swarm' ? R.maxSwarms : R.maxCrawl;
    let n = 0; for (const o of this.live) if (o.S.form === f && !o.dead) n++;
    if (n >= cap) return null;
    const B0 = S.body ?? {}, v = rec.var ?? 0.5;
    const body = { ...B0 };
    if (B0.coats) body.coat = B0.coats[Math.floor(v * B0.coats.length) % B0.coats.length];
    const scale = (B0.scale ?? 1) * (0.9 + v * 0.2);
    const a = {
      isFauna: true, id: rec.id, sp: rec.sp, S, rec, cell: rec.cell, form: f,
      x: rec.x, z: rec.z, y: 0, vx: 0, vz: 0, vy: 0, face: v * TAU, speed: 0, air: false,
      hp: rec.hp ?? S.hp ?? 30, maxHp: S.hp ?? 30, alive: !rec.dead, dead: !!rec.dead, deadT: rec.dead ? 999 : 0, deadAt: rec.deadAt ?? null, butchered: !!rec.butchered, picked: rec.picked ?? 0,
      state: rec.dead ? 'dead' : 'idle', stT: 0, grp: null, home: { x: rec.hx ?? rec.x, z: rec.hz ?? rec.z }, goal: null, goalT: 0,
      threat: null, tk: null, tdist: Infinity, alarmT: 0, fleeT: 0, fx: 0, fz: 0, frozenT: 0, backT: 0, bx: 0, bz: 0,
      target: null, tkind: null, atkCd: 0, warnT: 0, warned: false, strikeT: 0, lungeT: 0, hold: null, rollT: 0, rollDmg: 0, held: null,
      sensT: Math.random() * R.senseEvery, eatT: 0, eatOn: null, leaving: false, hitCd: 0, infT: 0, zz: 0, zzT: 0,
      alt: 0, circ: null, perch: false, landT: 0, pin: !!rec.pin, chased: false, tailC: null,
      antlers: rec.buck ? 1 : 0, len: Array.isArray(B0.len) ? B0.len[0] + v * (B0.len[1] - B0.len[0]) : B0.len ?? 1,
      p: { scale }, B: body, seed: Math.floor(v * 1e6), var: v,
      w: { x: 0, z: 0, v: 0, face: undefined },
      a: { phase: v, gait: 0, head: 0, wag: 0, wagAmp: 0.03, tuck: 0, tail: 0.3, crouch: 0, sit: 0, dig: 0, eat: 0, mark: 0, flinch: 0, bark: 0, air: 0, lie: rec.dead ? 1 : 0, flap: 0, jaw: 0, roll: 0, coil: 1 },
      trail: f === 'snake' ? new Float32Array(16 * 2) : null, trailN: 0,
      sw: f === 'swarm' ? { r: B0.r ?? 1.6 } : null,
    };
    if (f === 'snake') for (let i = 0; i < 16; i++) { a.trail[i * 2] = a.x - Math.sin(a.face) * i * 0.08; a.trail[i * 2 + 1] = a.z - Math.cos(a.face) * i * 0.08; }
    if (f === 'gator') { const b = this.bankNear(a.x, a.z, 10); a.bank = b ?? { x: a.x, z: a.z, wx: a.x, wz: a.z }; if (rec.hx === undefined || !b) { a.home.x = a.bank.x; a.home.z = a.bank.z; } a.water = this.depthAt(a.x, a.z) > 0.5; }
    if (f === 'bird' && S.body.soar) { a.alt = B0.alt[0] + v * (B0.alt[1] - B0.alt[0]) + 2; a.air = true; }
    rec.hp = a.hp;
    this.live.push(a);
    this.stats.spawned++;
    return a;
  }

  // Agents and tests: a group of one species at x,z now (its own records, in the chunk it stands in). Returns the bodies.
  spawn(sp, x, z, count = null, o = {}) {
    const S = SPECIES[sp];
    if (!S) return [];
    const n = count ?? S.group.size[0];
    const cell = this.cell(Math.floor(x / R.chunk), Math.floor(z / R.chunk));
    if (!cell.roll) cell.roll = this.rollId(this.day(), phaseIndex(this.hour()));
    cell.live = true;
    const grp = `g${cell.key}:${sp}:spawn${++this.seq}`, out = [];
    for (let i = 0; i < n; i++) {
      const ang = (i / Math.max(1, n)) * TAU, rr = n > 1 ? 2 + (i % 3) : 0;
      const rec = { id: `f${++this.seq}`, sp, x: x + Math.sin(ang) * rr, z: z + Math.cos(ang) * rr, hx: o.hx ?? x, hz: o.hz ?? z, hp: null, dead: false, grp, lead: i === 0, buck: o.buck ?? (S.bucks ? i === 0 : false), var: ((i * 0.37 + 0.2) % 1), cell: cell.key, pin: !!o.hold, test: !!o.test };
      cell.recs.push(rec);
      const a = this.make(rec);
      if (a) { if (o.hold) a.pin = true; if (o.test) a.test = true; out.push(a); }
    }
    this.groupUp();
    return out;
  }

  remove(a, keepRec = false) {
    const i = this.live.indexOf(a);
    if (i >= 0) this.live.splice(i, 1);
    if (!keepRec) { const c = this.cells.get(a.cell); if (c) { const j = c.recs.indexOf(a.rec); if (j >= 0) c.recs.splice(j, 1); } }
    if (this.job?.a === a) this.job = null;
  }
  // Every live animal back into its record (a save, a demote).
  writeBack(a) { const r = a.rec; r.x = +a.x.toFixed(2); r.z = +a.z.toFixed(2); r.hp = Math.round(a.hp); r.dead = a.dead; r.deadAt = a.deadAt; r.butchered = a.butchered; r.picked = a.picked; r.hx = a.home.x; r.hz = a.home.z; }

  // Groups: members of one record group share a brain object (a herd's alarm, a pack's quarry and mode).
  groupUp() {
    const G = new Map();
    for (const a of this.live) {
      if (a.dead) continue;
      let gr = G.get(a.rec.grp);
      if (!gr) { gr = a.grp && a.grp.id === a.rec.grp ? a.grp : { id: a.rec.grp, members: [], lead: null, quarry: null, qk: null, mode: 'roam', modeT: 0, stalkT: 0, yipT: 4 + Math.random() * 10, alarmT: 0, ax: 0, az: 0 }; gr.members = []; G.set(a.rec.grp, gr); }
      gr.members.push(a); a.grp = gr;
    }
    for (const gr of G.values()) gr.lead = gr.members.find((m) => m.rec.lead) ?? gr.members[0];
  }

  // ---- the director ----------------------------------------------------------------------------------------------------
  focus() { const P = this.g.player; return P.inVehicle ?? P; }
  inView(x, z) { const c = this.g.camLook ?? this.focus(), r = (this.g.viewR ?? 30) * 1.8 + R.viewPad; return Math.abs(x - c.x) < r && Math.abs(z - c.z) < r; }

  direct() {
    const F = this.focus(), C = R.chunk;
    const cx0 = Math.floor((F.x - R.liveR) / C), cx1 = Math.floor((F.x + R.liveR) / C), cz0 = Math.floor((F.z - R.liveR) / C), cz1 = Math.floor((F.z + R.liveR) / C);
    const now = this.hours(), roll = this.rollId(this.day(), phaseIndex(this.hour()));
    // Near chunks come alive: rolled (if the roll is stale), then their records get bodies out of your sight.
    if (this.spawning) for (let cx = cx0; cx <= cx1; cx++) for (let cz = cz0; cz <= cz1; cz++) {
      const mx = (cx + 0.5) * C, mz = (cz + 0.5) * C;
      if (Math.hypot(mx - F.x, mz - F.z) > R.liveR) continue;
      const cell = this.cell(cx, cz);
      if (!cell.live) {
        if (cell.roll !== roll) this.roll(cell); // a new phase (or never rolled): who lives here now; else the same animals
        cell.live = true;
      } else if (cell.roll !== roll) this.refresh(cell);
      this.promote(cell);
    }
    // Far chunks go back to records.
    for (const cell of this.cells.values()) {
      if (!cell.live) continue;
      if (Math.hypot((cell.cx + 0.5) * C - F.x, (cell.cz + 0.5) * C - F.z) > R.dropR) this.demote(cell);
    }
    // Old records are dropped (rolled again when you come back).
    if (this.cells.size > 160) for (const [k, c] of this.cells) if (!c.live && now - c.awayAt > R.recordHours) this.cells.delete(k);
    this.vultureCall();
  }

  // The phase turned while you were here: the new roll's animals come in out of sight; the ones it no longer has drift
  // off and are gone once nobody sees them. Animals already about keep their bodies when the new roll still has them.
  refresh(cell) {
    this.roll(cell);
    const fresh = cell.recs;
    for (const a of this.live) {
      if (a.cell !== cell.key || a.dead) continue;
      if (a.test || a.pin) { if (!fresh.includes(a.rec)) fresh.push(a.rec); continue; }
      const m = fresh.find((r) => r.sp === a.sp && !r.bound && !r.dead && !r.test);
      if (m) { m.bound = true; Object.assign(m, { id: a.id, x: a.x, z: a.z, hp: a.hp, hx: a.home.x, hz: a.home.z, var: a.rec.var }); a.rec = m; }
      else { a.leaving = true; if (!fresh.includes(a.rec)) fresh.push(a.rec); }
    }
    for (const r of fresh) delete r.bound;
    this.groupUp();
  }

  promote(cell) {
    let made = false;
    for (const r of cell.recs) {
      if (r.gone || this.live.some((a) => a.rec === r)) continue;
      if (r.dead && this.hours() - (r.deadAt ?? 0) > R.carcassHours) { r.gone = true; continue; }
      if (!r.dead && this.inView(r.x, r.z)) continue; // never pops in where you can see: it walks in later
      if (this.live.length >= R.maxLive && !r.dead) break;
      if (this.make(r)) made = true;
    }
    if (made) this.groupUp();
  }

  demote(cell) {
    const F = this.focus();
    for (let i = this.live.length - 1; i >= 0; i--) {
      const a = this.live[i];
      if (a.cell !== cell.key) continue;
      // One that followed you (a pack on your trail) moves house to the chunk it is in instead of vanishing.
      if (!a.dead && Math.hypot(a.x - F.x, a.z - F.z) < R.liveR * 0.7) { this.rehome(a); continue; }
      this.writeBack(a);
      this.live.splice(i, 1); this.stats.despawned++;
    }
    cell.live = false; cell.awayAt = this.hours();
  }
  rehome(a) {
    const c = this.cell(Math.floor(a.x / R.chunk), Math.floor(a.z / R.chunk));
    const old = this.cells.get(a.cell);
    if (old) { const j = old.recs.indexOf(a.rec); if (j >= 0) old.recs.splice(j, 1); }
    c.recs.push(a.rec); a.rec.cell = c.key; a.cell = c.key;
    if (!c.roll) c.roll = this.rollId(this.day(), phaseIndex(this.hour()));
    c.live = true;
  }

  // ---- vultures: the dead draw them ------------------------------------------------------------------------------------
  vultureCall() {
    const g = this.g, F = this.focus(), V = R.vulture, now = this.hours();
    // Bodies: the dead (people and the infected), and carcasses.
    for (const c of g.chars) {
      if (c.alive || c === g.player || c.underwater || (c.deadTime ?? 0) > V.freshMin) continue;
      const k = `c:${c.id}`;
      if (!this.bodies.has(k) && Math.hypot(c.x - F.x, c.z - F.z) < V.bodyR) this.bodies.set(k, { x: c.x, z: c.z, since: now, due: now + (V.arrive[0] + Math.random() * (V.arrive[1] - V.arrive[0])) / 60, called: false, ref: c, kind: 'char' });
    }
    for (const a of this.live) {
      if (!a.dead || a.butchered || a.S.form === 'swarm' || a.S.form === 'bird') continue;
      const k = `a:${a.id}`;
      if (!this.bodies.has(k)) this.bodies.set(k, { x: a.x, z: a.z, since: now, due: now + (V.arrive[0] + Math.random() * (V.arrive[1] - V.arrive[0])) / 60, called: false, ref: a, kind: 'animal' });
    }
    for (const [k, b] of this.bodies) {
      const gone = b.kind === 'char' ? !g.chars.includes(b.ref) || b.ref.alive : !this.live.includes(b.ref) || b.ref.butchered;
      if (gone || now - b.since > R.carcassHours) { this.bodies.delete(k); for (const a of this.live) if (a.circ?.body === b) a.circ.body = null; continue; }
      if (b.called || now < b.due || !this.enabled) continue;
      if (Math.hypot(b.x - F.x, b.z - F.z) > V.bodyR) continue;
      let flying = 0; for (const a of this.live) if (a.sp === 'vulture' && !a.dead) flying++;
      if (flying >= V.max * 2) continue;
      b.called = true;
      const n = Math.min(V.max, V.perBody[0] + Math.floor(Math.random() * (V.perBody[1] - V.perBody[0] + 1)));
      // In from out of sight, high up, on the side away from you.
      const away = Math.atan2(b.x - F.x, b.z - F.z) + (Math.random() - 0.5), d = (g.viewR ?? 30) * 1.8 + R.viewPad + 25;
      const sx = b.x + Math.sin(away) * d, sz = b.z + Math.cos(away) * d;
      const birds = this.spawn('vulture', sx, sz, n);
      for (const v of birds) { v.alt = v.B.alt[1] + 2 + Math.random() * 3; v.altTo = v.B.alt[0] + Math.random() * (v.B.alt[1] - v.B.alt[0]); v.circ = { body: b, x: b.x, z: b.z, r: 6 + Math.random() * 5, ang: Math.random() * TAU, dir: Math.random() < 0.5 ? -1 : 1, until: now + (V.circle[0] + Math.random() * (V.circle[1] - V.circle[0])) / 60 }; v.state = 'inbound'; v.rec.body = k; }
      this.stats.vultures += birds.length;
      g.emit('vulturesCalled', { body: k, x: +b.x.toFixed(1), z: +b.z.toFixed(1), n: birds.length });
    }
  }

  // ---- the sim ---------------------------------------------------------------------------------------------------------
  update(dt) {
    const g = this.g;
    this.t += dt;
    this.pollEvents();
    if (!this.enabled) { if (this.live.length) this.clear(); this.job = null; return; }
    if ((this.tickT -= dt) <= 0) { this.tickT = R.tick; try { this.direct(); } catch (e) { g.reportError?.(e); } }
    // Far off (past `lodR`, out of any view), an animal thinks every fourth frame on the time it saved up.
    const Fo = this.focus(), lod = R.lodR;
    this.frame = (this.frame + 1) | 0;
    for (let i = this.live.length - 1; i >= 0; i--) {
      const a = this.live[i];
      if (!a) continue;
      let step = dt;
      if (!a.dead && (Math.abs(a.x - Fo.x) > lod || Math.abs(a.z - Fo.z) > lod)) {
        a.lodDt = (a.lodDt ?? 0) + dt;
        if (((this.frame + a.seed) & 3) !== 0) continue;
        step = Math.min(0.1, a.lodDt); a.lodDt = 0;
      } else a.lodDt = 0;
      try { this.tick(a, step); } catch (e) { g.reportError?.(e); }
    }
    this.trapPass();
    if (this.job) this.butcherStep(dt);
  }

  clear() { for (const a of this.live) this.writeBack(a); this.live.length = 0; for (const c of this.cells.values()) c.live = false; }

  tick(a, dt) {
    const g = this.g, S = a.S;
    if (a.dead) {
      a.deadT += dt; a.speed = 0; a.a.lie = Math.min(1, a.a.lie + dt * 3);
      if (a.air || a.y > 0.02) { a.vy -= 13 * dt; a.y = Math.max(0, a.y + a.vy * dt); a.alt = a.y; if (a.y <= 0) { a.air = false; a.vy = 0; } }
      if (S.form === 'swarm' || (a.deadT > 30 && (a.butchered || S.butcher === null) && !this.inView(a.x, a.z))) this.remove(a);
      return;
    }
    for (const k of TIMERS) if (a[k] > 0) a[k] -= dt;
    a.stT += dt; a.a.flinch = Math.max(0, a.a.flinch - dt * 5);
    if (a.held) { this.heldStep(a, dt); this.animate(a, dt); return; }
    this.hazards(a, dt);
    if (!a.alive) return;
    if ((a.sensT -= dt) <= 0) { a.sensT = R.senseEvery; this.sense(a); }
    let want = null;
    if (a.pin) want = W(a, a.x, a.z, 0);
    else switch (S.form === 'bird' ? 'bird' : S.form === 'gator' ? 'gator' : S.form === 'snake' ? 'snake' : S.form === 'swarm' ? 'swarm' : S.temper) {
      case 'prey': want = this.brainPrey(a, dt); break;
      case 'predator': case 'scavenger': want = this.brainPredator(a, dt); break;
      case 'territorial': want = this.brainTerritorial(a, dt); break;
      case 'snake': want = this.brainSnake(a, dt); break;
      case 'gator': want = this.brainGator(a, dt); break;
      case 'bird': want = this.brainBird(a, dt); break;
      case 'swarm': want = this.brainSwarm(a, dt); break;
      default: want = null;
    }
    if (a.leaving && !this.inView(a.x, a.z)) { this.remove(a); return; }
    if (S.form === 'bird' && a.air) this.fly(a, dt, want); else this.move(a, dt, want);
    this.animate(a, dt);
  }

  // ---- senses ----------------------------------------------------------------------------------------------------------
  // What it is afraid of (prey) or what is coming (everyone): people, the infected, dogs, a predator, a car on the move.
  sense(a) {
    const g = this.g, P = g.player, S = a.S, night = g.sky?.night ?? 0;
    const sight = S.senses.sight * (1 - (1 - (S.senses.night ?? 0.6)) * night), hear = S.senses.hear, smell = S.senses.smell;
    let best = null, bd = Infinity, bk = null;
    const look = Math.max(sight, smell * 0.6) + 4;
    for (const c of g.chars) {
      if (!c.alive || c.hidden || c.inVehicle || Math.abs(c.x - a.x) > look || Math.abs(c.z - a.z) > look) continue;
      if (c.hf || c.fauna) continue; // the hot ground's own, and a region's animals (systems/regions.js)
      let d = Math.hypot(c.x - a.x, c.z - a.z);
      const crouch = c === P ? ((P.crouch || P.crouched) ? 0.55 : 1) * (g.outdoors?.fx.preyNoticeMul ?? 1) : 1; // the still hunter's talent (systems/outdoors.js)
      const seen = d < sight * crouch && g.statics.lineOfSight(a.x, a.z, c.x, c.z, RAY_SOLID);
      const smelt = d < smell * 0.5 * crouch;
      if (!seen && !smelt) continue;
      if (c.speed > 4) d *= 0.8; // running: louder, closer than it is
      if (d < bd) { bd = d; best = c; bk = c.faction === 'zombie' ? 'zombie' : 'person'; }
    }
    for (const d of g.dogs?.dogs ?? []) {
      if (d.dead || d.ride || Math.abs(d.x - a.x) > look || Math.abs(d.z - a.z) > look) continue;
      const k = Math.hypot(d.x - a.x, d.z - a.z);
      if (k < Math.max(sight, smell * 0.5) && k * 1.2 < bd) { bd = k * 1.2; best = d; bk = 'dog'; }
    }
    if (S.temper === 'prey' || S.form === 'bird') for (const o of this.live) {
      if (o === a || o.dead || (o.S.temper !== 'predator' && o.S.form !== 'gator' && o.sp !== 'twinback') || Math.abs(o.x - a.x) > look || Math.abs(o.z - a.z) > look) continue;
      if (o.form === 'gator' && o.water && o.state !== 'lunge') continue; // a gator under the water is not seen
      const k = Math.hypot(o.x - a.x, o.z - a.z);
      if (k < sight * 0.8 && k < bd) { bd = k; best = o; bk = 'animal'; }
    }
    // A car coming: heard before it is seen.
    for (const v of g.vehicles) {
      if (v.dead || v.sunk || Math.abs(v.x - a.x) > 60 || Math.abs(v.z - a.z) > 60) continue;
      const sp = Math.hypot(v.vx ?? 0, v.vz ?? 0);
      if (sp < 3 && !v.driver) continue;
      const k = Math.hypot(v.x - a.x, v.z - a.z) * (sp > 8 ? 0.6 : 0.85);
      if (k < Math.min(hear, 45) && k < bd) { bd = k; best = v; bk = 'car'; }
    }
    a.threat = best; a.tk = bk; a.tdist = bd;
    // A flashlight or headlights on it at night (eyeshine, a deer frozen in the beam, a coyote backing out of it).
    a.lit = night > 0.35 ? this.litBy(a) : 0;
  }

  // 1: in your flashlight's beam; 2: in a driven car's headlights; 0: dark.
  litBy(a) {
    const g = this.g, P = g.player;
    if (P.alive && !P.inVehicle && (g.flashMat?.opacity ?? 0) > 0.05) {
      const dx = a.x - P.x, dz = a.z - P.z, d = Math.hypot(dx, dz);
      if (d < 16 && d > 0.3 && (dx * Math.sin(P.face) + dz * Math.cos(P.face)) / d > 0.86) return 1;
    }
    for (const v of g.vehicles) {
      if (!v.driver || v.dead || Math.abs(v.x - a.x) > 30 || Math.abs(v.z - a.z) > 30) continue;
      const dx = a.x - v.x, dz = a.z - v.z, d = Math.hypot(dx, dz);
      if (d < 26 && (dx * Math.sin(v.h) + dz * Math.cos(v.h)) / (d || 1) > 0.88) return 2;
    }
    return 0;
  }
  fireNear(x, z, pad) {
    for (const f of this.g.throwables?.fires ?? []) if (Math.hypot(f.x - x, f.z - z) < f.r + pad) return f;
    for (const v of this.g.vehicles) if ((v.onFire > 0 || v.burn > 0) && !v.dead && Math.hypot(v.x - x, v.z - z) < 6 + pad) return { x: v.x, z: v.z, r: 6 };
    return null;
  }

  // ---- prey: graze, look up, bolt ----------------------------------------------------------------------------------------
  brainPrey(a, dt) {
    const g = this.g, S = a.S, A = a.a, gr = a.grp, P = g.player;
    A.eat = Math.max(0, A.eat - dt * 2);
    // Frozen in a beam at night: a beat, then it bolts.
    if (a.frozenT > 0) { a.state = 'frozen'; A.head = 0.3; if (a.frozenT <= dt * 1.5) this.bolt(a, a.fx, a.fz, 7); return W(a, a.x, a.z, 0, Math.atan2(a.fx - a.x, a.fz - a.z)); }
    const t = a.threat;
    // Something too near: the herd goes.
    if (t && a.fleeT <= 0) {
      const near = a.tdist < (S.alarm ?? 20) * (a.tk === 'car' ? 1.2 : 1);
      if (a.lit && a.tk !== 'animal' && a.alarmT <= 0 && !near) { a.frozenT = 0.8 + Math.random() * 0.8; a.fx = t.x; a.fz = t.z; a.alarmT = 6; return W(a, a.x, a.z, 0); }
      if (near) this.bolt(a, t.x, t.z, 6 + Math.random() * 3, t, a.tk);
      else if (a.tdist < (S.alarm ?? 20) * 1.6) { a.state = 'alert'; A.head = Math.min(0.4, A.head + dt * 3); return W(a, a.x, a.z, 0, Math.atan2(t.x - a.x, t.z - a.z)); }
    }
    if (gr && gr.alarmT > 0 && a.fleeT <= 0) this.bolt(a, gr.ax, gr.az, 5 + Math.random() * 3);
    // Running: away from what scared it, the herd together; a jackrabbit jinks. A car: across its path, to the side the
    // herd is on (the deer that crosses in front of you).
    if (a.fleeT > 0) {
      a.state = 'flee';
      if (S.flag) a.tailC = S.body.flagC; // the white flag up
      let dx = a.x - a.fx, dz = a.z - a.fz;
      const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      if (a.carFlee) { dx = a.carFlee.x; dz = a.carFlee.z; }
      if (gr && gr.lead && gr.lead !== a && !gr.lead.dead) { const lx = gr.lead.x - a.x, lz = gr.lead.z - a.z, ll = Math.hypot(lx, lz); if (ll > 6) { dx = dx * 0.6 + (lx / ll) * 0.4; dz = dz * 0.6 + (lz / ll) * 0.4; } }
      if (S.zigzag) { if ((a.zzT -= dt) <= 0) { a.zzT = 0.35 + Math.random() * 0.3; a.zz = (Math.random() < 0.5 ? -1 : 1) * 0.7; } const c = Math.cos(a.zz), s = Math.sin(a.zz); const ox = dx; dx = dx * c - dz * s; dz = ox * s + dz * c; }
      A.head = 0.1;
      return W(a, a.x + dx * 10, a.z + dz * 10, S.speed.run * (0.85 + (a.var ?? 0) * 0.15));
    }
    a.carFlee = null; a.tailC = null;
    return this.graze(a, dt);
  }
  // Graze and drift: the herd keeps to its leader, the leader to its ground.
  graze(a, dt) {
    const A = a.a, gr = a.grp, S = a.S;
    a.state = 'graze';
    const L = gr?.lead && gr.lead !== a && !gr.lead.dead ? gr.lead : null;
    if (L) {
      const k = Math.hypot(L.x - a.x, L.z - a.z);
      if (k > 7) { A.eat = 0; return W(a, L.x + Math.sin(a.seed) * 3, L.z + Math.cos(a.seed) * 3, k > 14 ? S.speed.walk * 2.2 : S.speed.walk); }
    }
    a.goalT -= dt;
    if (!a.goal || a.goalT <= 0) {
      const ang = Math.random() * TAU, rr = Math.random() * (L ? 5 : 24);
      a.goal = { x: (L ? L.x : a.home.x) + Math.sin(ang) * rr, z: (L ? L.z : a.home.z) + Math.cos(ang) * rr, v: S.speed.walk * (0.4 + Math.random() * 0.5) };
      a.goalT = 5 + Math.random() * 9;
    }
    const k = Math.hypot(a.goal.x - a.x, a.goal.z - a.z);
    if (k < 1 || a.goalT > 3) { A.eat = Math.min(1, A.eat + dt * 2); return W(a, a.x, a.z, 0); } // head down, eating
    A.eat = Math.max(0, A.eat - dt * 3);
    return W(a, a.goal.x, a.goal.z, a.goal.v);
  }
  // The herd bolts from (x, z). by/kind: what it ran from (a car makes it cross).
  bolt(a, x, z, secs, by = null, kind = null) {
    const g = this.g, gr = a.grp, now = this.t;
    const list = gr?.members ?? [a];
    for (const m of list) {
      if (m.dead || m.S.temper === 'predator') continue;
      m.fleeT = Math.max(m.fleeT, secs * (0.85 + Math.random() * 0.3)); m.fx = x; m.fz = z; m.frozenT = 0;
      m.home.x = m.x + (m.x - x) * 0.6; m.home.z = m.z + (m.z - z) * 0.6; // it will graze somewhere else after this
      if (kind === 'car' && by) {
        // Across the car's path, toward the side the herd is on: the one that crosses in front of you.
        const fx = Math.sin(by.h), fz = Math.cos(by.h), sx = -fz, sz = fx;
        const hx = (gr?.lead ?? m).x - by.x, hz = (gr?.lead ?? m).z - by.z, side = hx * sx + hz * sz >= 0 ? 1 : -1;
        const herdSide = Math.random() < 0.35 ? -side : side;
        m.carFlee = { x: sx * herdSide * 0.85 + fx * 0.3, z: sz * herdSide * 0.85 + fz * 0.3 };
      } else m.carFlee = null;
      if (m.form === 'bird' && !m.air) this.takeOff(m, x, z);
    }
    if (gr) { gr.alarmT = 0.6; gr.ax = x; gr.az = z; }
    if (!a.boltT || now - a.boltT > 3) {
      a.boltT = now;
      g.emit('faunaFlee', { id: a.id, species: a.sp, from: kind ?? (by?.id ?? 'noise'), herd: list.length, x: +a.x.toFixed(1), z: +a.z.toFixed(1) });
      this.voice(a, 'snort');
      this.dogsChase(a);
    }
  }
  // A dog of yours on heel sees game run: it goes after it (a hunter nearly always, the rest sometimes).
  dogsChase(a) {
    const g = this.g;
    if (!g.dogs || a.chased) return;
    for (const d of g.dogs.mine()) {
      if (d.downed || d.ride || d.cmd !== 'heel' || Math.hypot(d.x - a.x, d.z - a.z) > 26) continue;
      if (Math.random() < (d.type === 'hunter' ? 0.85 : 0.35)) { d.sic = a; d.cmd = 'sic'; a.chased = true; g.emit('dogChasesGame', { dog: d.id, animal: a.id, species: a.sp }); break; }
    }
  }

  // ---- predators and scavengers: pick the weak, stalk, rush, back off fire and a beam ---------------------------------------
  // The pack's quarry (scored by how weak, how alone, asleep), chosen by its leader once a second.
  quarry(a) {
    const g = this.g, P = g.player, S = a.S, gr = a.grp, night = g.sky?.night ?? 0;
    const pack = gr ? gr.members.filter((m) => !m.dead).length : 1;
    const R0 = Math.max(S.senses.smell, S.senses.sight);
    let best = null, bs = 0.35, bk = null;
    const consider = (t, k, score) => { if (score > bs) { bs = score; best = t; bk = k; } };
    for (const c of g.chars) {
      if (!c.alive || c.inVehicle || c.hidden || c.hf || c.fauna || Math.abs(c.x - a.x) > R0 || Math.abs(c.z - a.z) > R0) continue;
      const d = Math.hypot(c.x - a.x, c.z - a.z);
      if (d > R0) continue;
      if (c.faction === 'zombie') { if (S.temper === 'predator' && pack >= 2) consider(c, 'zombie', 0.2 + (1 - c.hp / (c.maxHp || 100)) * 0.3); continue; }
      if (pack < (S.courage ?? 1)) continue;
      const hurt = 1 - c.hp / (c.maxHp || 100);
      let alone = true;
      for (const o of g.chars) if (o !== c && o.alive && o.faction !== 'zombie' && !o.inVehicle && Math.abs(o.x - c.x) < 12 && Math.abs(o.z - c.z) < 12) { alone = false; break; }
      if (alone && c === P) for (const dg of g.dogs?.mine() ?? []) if (!dg.dead && Math.hypot(dg.x - c.x, dg.z - c.z) < 10) { alone = false; break; }
      const asleep = !!c.sleeping;
      let s = (hurt * 2 + (alone ? 0.8 : 0) + (asleep ? 2 : 0) + night * 0.3) * 0.5;
      if (hurt < 0.25 && !asleep) s *= 0.25; // a whole, upright person is watched, not hunted
      if (S.temper === 'scavenger' && hurt < 0.4 && !asleep) s *= 0.3;
      consider(c, 'person', s - d * 0.004);
    }
    for (const d of g.dogs?.dogs ?? []) {
      if (d.dead || d.ride || Math.abs(d.x - a.x) > R0 || Math.abs(d.z - a.z) > R0 || pack < 2) continue;
      consider(d, 'dog', 0.45 + (1 - d.hp / d.maxHp) * 0.8 - Math.hypot(d.x - a.x, d.z - a.z) * 0.004);
    }
    for (const o of this.live) {
      if (o === a || o.dead || o.sp === a.sp || o.S.temper === 'predator' || o.S.form === 'swarm' || o.form === 'gator' || (o.form === 'bird' && o.air) || Math.abs(o.x - a.x) > R0 || Math.abs(o.z - a.z) > R0) continue;
      const size = o.p.scale ?? 1, hurt = 1 - o.hp / o.maxHp;
      const s = (S.temper === 'scavenger' ? 0.3 : 0.6) + hurt * 0.8 + (size < 0.6 ? 0.4 : size > 1.2 ? (a.sp === 'panther' ? 0.3 : -0.3) : 0);
      consider(o, 'animal', s - Math.hypot(o.x - a.x, o.z - a.z) * 0.006);
    }
    return { t: best, k: bk, s: bs };
  }
  // A body to eat (the dead, a carcass): scavengers first, predators when not hunting.
  meal(a) {
    const g = this.g, R0 = a.S.senses.smell;
    let best = null, bd = R0;
    for (const c of g.chars) {
      if (c.alive || c === g.player || c.underwater || (c.deadTime ?? 0) > 1200 || Math.abs(c.x - a.x) > bd || Math.abs(c.z - a.z) > bd) continue;
      const d = Math.hypot(c.x - a.x, c.z - a.z); if (d < bd) { bd = d; best = c; }
    }
    for (const o of this.live) {
      if (!o.dead || o.butchered || o === a || o.S.form === 'swarm' || Math.abs(o.x - a.x) > bd || Math.abs(o.z - a.z) > bd) continue;
      const d = Math.hypot(o.x - a.x, o.z - a.z); if (d < bd) { bd = d; best = o; }
    }
    return best;
  }

  brainPredator(a, dt) {
    const g = this.g, S = a.S, A = a.a, gr = a.grp ?? { members: [a], lead: a, mode: 'roam', modeT: 0, stalkT: 0, yipT: 9 };
    a.grp ??= gr;
    const night = g.sky?.night ?? 0, active = (ACTIVE[S.active]?.[PHASES[phaseIndex(this.hour())].id] ?? 1) >= 0.6 || S.active === 'any';
    A.crouch = Math.max(0, A.crouch - dt * 2); A.eat = Math.max(0, A.eat - dt * 2);
    // Fire: never near it, whatever it was after.
    const fire = this.fireNear(a.x, a.z, S.fear.fire);
    if (fire) { a.backT = Math.max(a.backT, 3); a.bx = fire.x; a.bz = fire.z; if (a.bfrom !== 'fire') a.bfrom = 'fire', g.emit('faunaBackoff', { id: a.id, species: a.sp, from: 'fire', x: +a.x.toFixed(1), z: +a.z.toFixed(1) }); }
    // A lit beam on it at night, close: it backs out of it (a coyote; the panther holds longer).
    if (a.lit && a.tdist < S.fear.beam && a.backT <= 0.5 && !fire) { a.backT = 2.5; a.bfrom = 'beam'; const src = a.lit === 1 ? g.player : a.threat ?? g.player; a.bx = src.x; a.bz = src.z; g.emit('faunaBackoff', { id: a.id, species: a.sp, from: a.lit === 1 ? 'flashlight' : 'headlights', x: +a.x.toFixed(1), z: +a.z.toFixed(1) }); }
    if (a.backT <= 0) a.bfrom = null;
    if (a.backT > 0) {
      a.state = 'backoff';
      const dx = a.x - a.bx, dz = a.z - a.bz, l = Math.hypot(dx, dz) || 1;
      return W(a, a.x + (dx / l) * 6, a.z + (dz / l) * 6, S.speed.run * 0.55, Math.atan2(-dx, -dz));
    }
    if (a.fleeT > 0) { a.state = 'flee'; const dx = a.x - a.fx, dz = a.z - a.fz, l = Math.hypot(dx, dz) || 1; return W(a, a.x + (dx / l) * 10, a.z + (dz / l) * 10, S.speed.run); }
    // The pack's mind, kept by its leader.
    if (gr.lead === a || gr.lead?.dead) {
      gr.lead = a;
      gr.modeT += dt;
      if ((gr.qT = (gr.qT ?? 0) - dt) <= 0) {
        gr.qT = 1;
        const q = active ? this.quarry(a) : { t: null };
        const was = gr.quarry;
        if (q.t && (!was || q.s > (gr.qs ?? 0) + 0.3 || !was.alive)) { gr.quarry = q.t; gr.qk = q.k; gr.qs = q.s; if (gr.mode === 'roam' || gr.mode === 'feed') { gr.mode = 'stalk'; gr.modeT = 0; gr.stalkT = 4 + Math.random() * 4; g.emit('faunaStalk', { id: a.id, species: a.sp, target: q.t.id ?? null, kind: q.k, pack: gr.members.length, score: +q.s.toFixed(2) }); } }
        if (gr.quarry && (!gr.quarry.alive || gr.quarry.dead || gr.quarry.inVehicle || Math.hypot(gr.quarry.x - a.x, gr.quarry.z - a.z) > 75)) { gr.quarry = null; gr.mode = 'roam'; }
        if (!gr.quarry && gr.mode !== 'feed') { const m = this.meal(a); if (m && (S.temper === 'scavenger' || !active || Math.random() < 0.5)) { gr.mode = 'feed'; gr.meal = m; } else if (gr.mode !== 'roam') gr.mode = 'roam'; }
        if (gr.mode === 'stalk' && gr.modeT > gr.stalkT && gr.quarry) { const s = gr.qs ?? 0; if (s > 0.85 || gr.qk === 'animal' || gr.qk === 'dog' || gr.quarry.sleeping) { gr.mode = 'attack'; gr.modeT = 0; g.emit('faunaAttackRun', { id: a.id, species: a.sp, target: gr.quarry.id ?? null }); } }
        // Hurt pack, or a big gun close by: it leaves.
        if (gr.members.some((m) => !m.dead && m.hp / m.maxHp < S.flee)) { for (const m of gr.members) { m.fleeT = 8; m.fx = gr.quarry?.x ?? a.x; m.fz = gr.quarry?.z ?? a.z; } gr.mode = 'roam'; gr.quarry = null; }
      }
      // The night chorus: a pack yips now and then while it hunts, or just because it is dark.
      if (night > 0.5 && S.voice === 'yip' && (gr.yipT -= dt) <= 0) { gr.yipT = gr.mode === 'stalk' ? 14 + Math.random() * 12 : 28 + Math.random() * 30; this.voice(a, 'yip'); this.stats.yips++; g.emit('yip', { id: a.id, species: a.sp, pack: gr.members.length, x: +a.x.toFixed(1), z: +a.z.toFixed(1) }); }
    }
    const q = gr.quarry, idx = Math.max(0, gr.members.indexOf(a));
    if (gr.mode === 'feed' && gr.meal) {
      const m = gr.meal, k = Math.hypot(m.x - a.x, m.z - a.z);
      if (m.alive && !m.dead) { gr.mode = 'roam'; gr.meal = null; }
      else if (k > 1.4) { a.state = 'toFood'; return W(a, m.x + Math.sin(idx * 2.1) * 0.9, m.z + Math.cos(idx * 2.1) * 0.9, k > 8 ? S.speed.run * 0.5 : S.speed.walk); }
      else { a.state = 'eat'; A.eat = Math.min(1, A.eat + dt * 4); a.eatT += dt; if (m.isFauna) m.picked = (m.picked ?? 0) + dt; if (a.eatT > R.scavenge[1]) { a.eatT = 0; gr.mode = 'roam'; gr.meal = null; g.emit('faunaAte', { id: a.id, species: a.sp, body: m.id ?? null }); } return W(a, a.x, a.z, 0, Math.atan2(m.x - a.x, m.z - a.z)); }
    }
    if (q && gr.mode === 'stalk') {
      // Out at stalking distance, each on its own flank, low and slow, closing.
      const k = Math.hypot(q.x - a.x, q.z - a.z), bear = Math.atan2(a.x - q.x, a.z - q.z), off = (idx - (gr.members.length - 1) / 2) * 0.9;
      const r0 = Math.max(S.stalk * (1 - Math.min(0.5, gr.modeT / 40)), 7);
      a.state = 'stalk'; A.crouch = Math.min(0.55, A.crouch + dt * 3);
      const tx = q.x + Math.sin(bear + off * 0.5) * r0, tz = q.z + Math.cos(bear + off * 0.5) * r0;
      return W(a, tx, tz, k > r0 + 12 ? S.speed.run * 0.45 : S.speed.walk * 1.3, Math.atan2(q.x - a.x, q.z - a.z));
    }
    if (q && gr.mode === 'attack') {
      const k = Math.hypot(q.x - a.x, q.z - a.z);
      a.state = 'attack';
      // Hit and run: in, a bite, out a few metres, in again.
      if (a.atkCd > S.attack.every * 0.4) { const dx = a.x - q.x, dz = a.z - q.z, l = Math.hypot(dx, dz) || 1; return W(a, q.x + (dx / l) * 5, q.z + (dz / l) * 5, S.speed.run * 0.7); }
      if (k <= S.attack.reach && a.atkCd <= 0) this.strike(a, q, gr.qk);
      if (S.attack.kind === 'pounce' && k < 6 && k > 2 && a.atkCd <= 0 && !a.air) { a.vy = 4.5; a.air = true; const v = Math.max(9, S.speed.run * 0.8); a.vx = ((q.x - a.x) / k) * v; a.vz = ((q.z - a.z) / k) * v; a.pounce = q; }
      return W(a, q.x, q.z, S.speed.run, Math.atan2(q.x - a.x, q.z - a.z));
    }
    // Roaming (or resting by day): a nocturnal hunter lies up while the sun is high.
    if (!active && a.state !== 'flee') {
      const t = a.threat;
      if (t && a.tdist < 18) { const dx = a.x - t.x, dz = a.z - t.z, l = Math.hypot(dx, dz) || 1; a.state = 'shy'; return W(a, a.x + (dx / l) * 8, a.z + (dz / l) * 8, S.speed.run * 0.6); }
      a.state = 'rest'; A.sit = Math.min(1, A.sit + dt); return W(a, a.x, a.z, 0);
    }
    A.sit = Math.max(0, A.sit - dt * 3);
    const L = gr.lead !== a && !gr.lead.dead ? gr.lead : null;
    if (L) { const k = Math.hypot(L.x - a.x, L.z - a.z); a.state = 'roam'; if (k > 5) return W(a, L.x + Math.sin(idx * 2.4) * 2.5, L.z + Math.cos(idx * 2.4) * 2.5, k > 12 ? S.speed.run * 0.5 : S.speed.walk * 1.6); return null; }
    a.state = 'roam';
    a.goalT -= dt;
    if (!a.goal || a.goalT <= 0 || Math.hypot(a.goal.x - a.x, a.goal.z - a.z) < 1.5) { const ang = Math.random() * TAU, rr = 10 + Math.random() * 40; a.goal = { x: a.home.x + Math.sin(ang) * rr, z: a.home.z + Math.cos(ang) * rr }; a.goalT = 8 + Math.random() * 10; }
    return W(a, a.goal.x, a.goal.z, S.speed.walk * 1.4);
  }

  // ---- territorial: a warning, then the charge ------------------------------------------------------------------------------
  brainTerritorial(a, dt) {
    const g = this.g, S = a.S, A = a.a, t = a.threat, gr = a.grp;
    if (a.charge) {
      const c = a.charge, q = c.t;
      c.T -= dt;
      if (!q || q.dead || q.alive === false || c.T <= 0 || (q.inVehicle)) { a.charge = null; a.wheelT = 1.2; }
      else {
        const k = Math.hypot(q.x - a.x, q.z - a.z);
        a.state = 'charge';
        if (k <= S.attack.reach + 0.2 && a.atkCd <= 0) { this.strike(a, q, c.k); c.T = Math.min(c.T, 0.5); a.wheelT = 1.4; }
        return W(a, q.x + (q.x - a.x) * 0.3, q.z + (q.z - a.z) * 0.3, S.speed.run);
      }
    }
    if (a.wheelT > 0) { a.wheelT -= dt; a.state = 'wheel'; return W(a, a.x + Math.sin(a.face) * 4, a.z + Math.cos(a.face) * 4, S.speed.run * 0.6); }
    if (a.fleeT > 0) { a.state = 'flee'; const dx = a.x - a.fx, dz = a.z - a.fz, l = Math.hypot(dx, dz) || 1; return W(a, a.x + (dx / l) * 10, a.z + (dz / l) * 10, S.speed.run * 0.9); }
    // Something on its ground: the boldest warn (a huff, a stamp), then charge; the rest of the sounder bolts.
    const terr = S.territory * (t === g.player ? g.outdoors?.fx.territorialMul ?? 1 : 1); // the calm hand's talent (systems/outdoors.js)
    if (t && a.tk !== 'car' && a.tdist < terr) {
      const bold = !gr || gr.members.indexOf(a) < 2;
      if (!bold) { a.fleeT = 4; a.fx = t.x; a.fz = t.z; return null; }
      if (!a.warned) { a.warned = true; a.warnT = 0; this.voice(a, 'grunt'); g.emit('faunaWarn', { id: a.id, species: a.sp, target: t.id ?? null, kind: 'huff' }); }
      a.warnT += dt;
      a.state = 'warn'; A.head = -0.15 + Math.sin(this.t * 14) * 0.08;
      if (a.warnT > 1.1 || a.tdist < terr * 0.55) { a.charge = { t, k: a.tk, T: 3.5 }; a.warned = false; this.stats.charges++; g.emit('faunaCharge', { id: a.id, species: a.sp, target: t.id ?? null, kind: a.tk, dist: +a.tdist.toFixed(1) }); this.voice(a, 'squeal'); }
      return W(a, a.x, a.z, 0, Math.atan2(t.x - a.x, t.z - a.z));
    }
    a.warned = false;
    return this.graze(a, dt);
  }

  // ---- snakes: coiled, a warning, the strike ------------------------------------------------------------------------------
  brainSnake(a, dt) {
    const g = this.g, S = a.S, A = a.a;
    // The nearest thing on the ground within its warning range (people, the infected, dogs, game).
    let t = null, k = Infinity, tk = null;
    for (const c of g.chars) { if (!c.alive || c.inVehicle || c.hf || c.fauna || Math.abs(c.x - a.x) > 6 || Math.abs(c.z - a.z) > 6) continue; const d = Math.hypot(c.x - a.x, c.z - a.z); if (d < k) { k = d; t = c; tk = c.faction === 'zombie' ? 'zombie' : 'person'; } }
    for (const d of g.dogs?.dogs ?? []) { if (d.dead || d.ride || Math.abs(d.x - a.x) > 6 || Math.abs(d.z - a.z) > 6) continue; const e = Math.hypot(d.x - a.x, d.z - a.z); if (e < k) { k = e; t = d; tk = 'dog'; } }
    for (const o of this.live) { if (o === a || o.dead || o.form === 'bird' || o.form === 'swarm' || o.form === 'snake' || Math.abs(o.x - a.x) > 6 || Math.abs(o.z - a.z) > 6) continue; const e = Math.hypot(o.x - a.x, o.z - a.z); if (e < k) { k = e; t = o; tk = 'animal'; } }
    const WN = S.warn;
    if (a.fleeT > 0) { a.state = 'flee'; A.coil = Math.max(0, A.coil - dt * 3); const dx = a.x - a.fx, dz = a.z - a.fz, l = Math.hypot(dx, dz) || 1; return W(a, a.x + (dx / l) * 3, a.z + (dz / l) * 3, S.speed.run); }
    if (t && k < WN.r) {
      A.coil = Math.min(1, A.coil + dt * 4);
      if (!a.warned) { a.warned = true; a.warnT = 0; this.stats.rattles++; g.emit('rattle', { id: a.id, species: a.sp, sound: WN.sound, target: t.id ?? null, dist: +k.toFixed(2) }); }
      a.warnT += dt;
      a.state = WN.sound === 'rattle' ? 'rattle' : 'gape';
      if (WN.sound === 'rattle') { if ((a.rattleT = (a.rattleT ?? 0) - dt) <= 0) { a.rattleT = 0.09; this.voice(a, 'rattle'); } }
      else { A.jaw = Math.min(1, A.jaw + dt * 6); if ((a.rattleT = (a.rattleT ?? 0) - dt) <= 0) { a.rattleT = 0.9; this.voice(a, 'hiss'); } }
      // The strike: only after the warning has run its time, and only at what is in reach.
      if (a.warnT >= WN.hold && k <= S.attack.reach && a.atkCd <= 0) { a.strikeT = 0.25; this.strike(a, t, tk); this.stats.strikes++; }
      return W(a, a.x, a.z, 0, Math.atan2(t.x - a.x, t.z - a.z));
    }
    A.jaw = Math.max(0, A.jaw - dt * 3);
    if (a.warned && (!t || k > WN.r + 1.5)) { a.warned = false; a.warnT = 0; }
    // Now and then it moves to somewhere new, slowly; otherwise it lies coiled.
    a.goalT -= dt;
    if (!a.goal && a.goalT <= 0 && Math.random() < dt * 0.02) { const ang = Math.random() * TAU; a.goal = { x: a.home.x + Math.sin(ang) * 6, z: a.home.z + Math.cos(ang) * 6 }; }
    if (a.goal) {
      const d = Math.hypot(a.goal.x - a.x, a.goal.z - a.z);
      if (d < 0.5) { a.goal = null; a.goalT = 30 + Math.random() * 40; }
      else { a.state = 'crawl'; A.coil = Math.max(0, A.coil - dt * 2); return W(a, a.goal.x, a.goal.z, S.speed.walk); }
    }
    a.state = 'coiled'; A.coil = Math.min(1, A.coil + dt);
    return W(a, a.x, a.z, 0);
  }

  // ---- the gator: basks, lurks at the edge, lunges, rolls ----------------------------------------------------------------
  brainGator(a, dt) {
    const g = this.g, S = a.S, A = a.a, b = a.bank, AT = S.attack, night = g.sky?.night ?? 0;
    a.water = this.depthAt(a.x, a.z) > 0.45;
    if (a.hold) return this.rollStep(a, dt);
    if (a.state === 'lunge' && a.lungeT > 0) {
      const q = a.target;
      if (q && (q.alive !== false) && !q.dead) {
        const k = Math.hypot(q.x - a.x, q.z - a.z);
        A.jaw = 1;
        if (k < 1.5) { this.bite(a, q, a.tkind); return W(a, a.x, a.z, 0); }
        return W(a, q.x, q.z, AT.reach > 0 ? S.speed.run : 8, Math.atan2(q.x - a.x, q.z - a.z));
      }
    }
    if (a.state === 'lunge') { a.state = 'return'; a.target = null; }
    A.jaw = Math.max(0, A.jaw - dt * 2);
    // Something on the bank within its lunge: off the edge it comes.
    const P0 = _pick; P0.t = null; P0.d = AT.reach; P0.k = null; // (one scratch object: nothing allocated a frame)
    for (const c of g.chars) if (c.alive && !c.inVehicle && !c.hf && !c.fauna && Math.abs(c.x - a.x) < 6 && Math.abs(c.z - a.z) < 6) this.pick(a, c, c.faction === 'zombie' ? 'zombie' : 'person');
    for (const d of g.dogs?.dogs ?? []) if (!d.dead && !d.ride && Math.abs(d.x - a.x) < 6 && Math.abs(d.z - a.z) < 6) this.pick(a, d, 'dog');
    for (const o of this.live) if (o !== a && !o.dead && o.form !== 'gator' && o.form !== 'swarm' && !(o.form === 'bird' && o.air) && Math.abs(o.x - a.x) < 6 && Math.abs(o.z - a.z) < 6) this.pick(a, o, 'animal');
    const best = P0.t, bd = P0.d, bk = P0.k;
    if (best && a.atkCd <= 0 && Math.hypot(a.x - a.home.x, a.z - a.home.z) < S.leash) {
      a.state = 'lunge'; a.lungeT = 0.7; a.target = best; a.tkind = bk; a.atkCd = AT.every; this.stats.lunges++;
      this.voice(a, 'hiss');
      g.emit('faunaLunge', { id: a.id, species: a.sp, target: best.id ?? null, kind: bk, dist: +bd.toFixed(2), fromWater: a.water });
      // The birds on the bank go up at once.
      for (const o of this.live) if (o.form === 'bird' && !o.dead && !o.air && Math.hypot(o.x - a.x, o.z - a.z) < 25) this.bolt(o, a.x, a.z, 6, a, 'animal');
      return W(a, best.x, best.z, S.speed.run, Math.atan2(best.x - a.x, best.z - a.z));
    }
    // Hurt or shot at: into the deep.
    if (a.fleeT > 0) { a.state = 'dive'; return W(a, b.wx + (b.wx - b.x) * 1.5, b.wz + (b.wz - b.z) * 1.5, S.speed.walk * 1.2); }
    // Day: bask on the bank (nose to the water); night: lie in the water at the edge, just the eyes out. Something
    // walking close on land by day: it hisses and slides in.
    const t = a.threat;
    if (!night || night < 0.5) {
      if (t && a.tk !== 'car' && a.tdist < 9 && !a.water) { a.state = 'slide'; if (!a.hissed) { a.hissed = true; this.voice(a, 'hiss'); g.emit('faunaWarn', { id: a.id, species: a.sp, target: t.id ?? null, kind: 'hiss' }); } return W(a, b.wx, b.wz, S.speed.walk); }
      if (!t || a.tdist > 16) a.hissed = false;
      if (a.water && (!t || a.tdist > 14) && Math.random() < dt * 0.05) { a.state = 'haulout'; }
      if (a.state === 'haulout' || (!a.water && a.state !== 'slide')) { const k = Math.hypot(b.x - a.x, b.z - a.z); a.state = k > 0.6 ? 'haulout' : 'bask'; return k > 0.6 ? W(a, b.x, b.z, S.speed.walk * 0.6) : W(a, a.x, a.z, 0, Math.atan2(b.wx - b.x, b.wz - b.z)); }
    }
    const k = Math.hypot(b.wx - a.x, b.wz - a.z);
    a.state = 'lurk';
    return k > 0.6 ? W(a, b.wx, b.wz, S.speed.walk * 0.7) : W(a, a.x, a.z, 0, Math.atan2(b.x - b.wx, b.z - b.wz));
  }
  // The gator's pick: the nearest thing standing on the bank (not out in deep water) within its lunge.
  pick(a, t, k) { const d = Math.hypot(t.x - a.x, t.z - a.z); if (d < _pick.d && this.depthAt(t.x, t.z) < 0.9) { _pick.d = d; _pick.t = t; _pick.k = k; } }
  // A gator's bite that holds: the death roll, then back into the water with what it can drag.
  bite(a, q, kind) {
    const g = this.g, S = a.S, AT = S.attack;
    a.lungeT = 0;
    this.hit(a, q, AT.dmg, kind, 'bite');
    if ((q.alive !== false && !q.dead) && kind !== 'zombie') { a.hold = { q, k: kind, T: AT.roll, dmg: 0, hp0: a.hp }; a.state = 'roll'; this.stats.rolls++; g.emit('faunaRoll', { id: a.id, target: q.id ?? null, kind, secs: AT.roll }); if (q === g.player) g.hud?.toast?.('THE GATOR HAS YOU · SHOOT IT OR MASH E', 'hot'); }
    else a.state = 'return';
  }
  rollStep(a, dt) {
    const g = this.g, H = a.hold, q = H.q, AT = a.S.attack, P = g.player;
    H.T -= dt * (q === P && g.input?.hit?.('KeyE') ? 4 : 1);
    a.state = 'roll'; a.a.roll += dt * 9;
    // It drags what it holds toward the water.
    const b = a.bank, dx = b.wx - a.x, dz = b.wz - a.z, l = Math.hypot(dx, dz);
    if (l > 0.4) { a.x += (dx / l) * AT.drag * dt; a.z += (dz / l) * AT.drag * dt; }
    if (q && (q.alive !== false) && !q.dead) {
      q.x = a.x + Math.sin(a.face) * 1.2; q.z = a.z + Math.cos(a.face) * 1.2; if ('speed' in q) q.speed = 0;
      if ((H.tick = (H.tick ?? 0) - dt) <= 0) { H.tick = 0.5; this.hit(a, q, AT.rollDps * 0.5, H.k, 'bite', true); }
    }
    if (H.T <= 0 || a.hp < H.hp0 - 30 || !q || q.alive === false || q.dead) { g.emit('faunaRelease', { id: a.id, target: q?.id ?? null, held: +(AT.roll - Math.max(0, H.T)).toFixed(2) }); a.hold = null; a.state = 'return'; a.atkCd = 3; a.fleeT = 3; }
    return W(a, a.x, a.z, 0);
  }

  // ---- birds: vultures circle and come down; wading birds wade and scatter --------------------------------------------------
  brainBird(a, dt) {
    const g = this.g, S = a.S, A = a.a, B = S.body, F = this.focus();
    if (a.air) {
      // Vultures: inbound, circling a body, then down to it if nobody is near.
      const c = a.circ;
      if (c && !c.body && c.until !== undefined && !a.leaving) { a.leaving = true; a.state = 'fly'; a.home = { x: a.x + Math.sin(a.face) * 400, z: a.z + Math.cos(a.face) * 400 }; }
      if (c?.body) {
        const k = Math.hypot(c.x - a.x, c.z - a.z);
        if (a.state === 'inbound' && k < c.r + 4) a.state = 'circle';
        if (a.state === 'circle') {
          c.ang += (c.dir * 7.5 / c.r) * dt;
          const now = this.hours();
          if (now > c.until) {
            let near = false;
            for (const o of g.chars) if (o.alive && o.faction !== 'zombie' && Math.hypot(o.x - c.x, o.z - c.z) < R.vulture.land) { near = true; break; }
            if (!near) { a.state = 'landing'; a.perchAt = { x: c.x + Math.sin(c.ang) * 1.4, z: c.z + Math.cos(c.ang) * 1.4 }; }
          }
          return W(a, c.x + Math.sin(c.ang) * c.r, c.z + Math.cos(c.ang) * c.r, 7.5);
        }
        if (a.state === 'landing') { const p = a.perchAt, kk = Math.hypot(p.x - a.x, p.z - a.z); a.altTo = kk < 3 ? 0 : Math.min(a.alt, 4 + kk * 0.6); if (a.alt < 0.15 && kk < 1.2) { a.air = false; a.alt = 0; a.y = 0; a.state = 'feed'; } return W(a, p.x, p.z, Math.max(2.5, Math.min(7, kk))); }
        return W(a, c.x, c.z, 9);
      }
      // A heron going somewhere to land; a vulture with nothing to circle drifts off.
      if (a.state === 'scatter' || a.state === 'fly') {
        if (a.fleeT <= 0 && a.landAt) { const p = a.landAt, kk = Math.hypot(p.x - a.x, p.z - a.z); a.altTo = kk < 4 ? 0 : 7; if (a.alt < 0.2 && kk < 2) { a.air = false; a.alt = 0; a.y = 0; a.state = B.wader ? 'wade' : 'perch'; } return W(a, p.x, p.z, Math.min(S.speed.run, 2 + kk)); }
        return W(a, a.x + (a.x - a.fx) * 2, a.z + (a.z - a.fz) * 2, S.speed.run);
      }
      if (B.soar) { a.state = 'soar'; a.ang = (a.ang ?? 0) + 0.25 * dt; if (!a.circ) a.circ = { x: a.home.x, z: a.home.z, r: 18 + (a.var ?? 0) * 14, ang: a.var * TAU, dir: 1 }; a.circ.ang += (6 / a.circ.r) * dt; return W(a, a.circ.x + Math.sin(a.circ.ang) * a.circ.r, a.circ.z + Math.cos(a.circ.ang) * a.circ.r, 6); }
      a.state = 'fly'; return W(a, a.home.x, a.home.z, S.speed.run);
    }
    // On the ground: a vulture at a body pecks at it; someone close and it goes back up. A wading bird wades.
    const t = a.threat;
    if (t && a.tdist < (a.state === 'feed' ? R.vulture.flush : S.alarm)) { this.bolt(a, t.x, t.z, 5 + Math.random() * 3, t, a.tk); return null; }
    if (a.state === 'feed' && a.circ?.body) { A.eat = Math.min(1, A.eat + dt * 3); const b = a.circ.body.ref; if (b?.isFauna) b.picked = (b.picked ?? 0) + dt; return W(a, a.x, a.z, 0, Math.atan2(a.circ.x - a.x, a.circ.z - a.z)); }
    if (a.state === 'feed' && !a.circ?.body) { this.takeOff(a, a.x - 1, a.z); return null; }
    a.state = B.wader ? 'wade' : 'perch';
    A.eat = 0.5 + Math.sin(this.t * 1.3 + a.seed) * 0.5;
    a.goalT -= dt;
    if (!a.goal || a.goalT <= 0) { const ang = Math.random() * TAU; a.goal = { x: a.home.x + Math.sin(ang) * 5, z: a.home.z + Math.cos(ang) * 5 }; a.goalT = 6 + Math.random() * 8; }
    if (B.wader && this.depthAt(a.goal.x, a.goal.z) > 0.55) a.goal = null;
    return a.goal ? W(a, a.goal.x, a.goal.z, S.speed.walk) : W(a, a.x, a.z, 0);
  }
  takeOff(a, x, z) {
    const g = this.g;
    a.air = true; a.alt = Math.max(a.alt, 0.3); a.altTo = 6 + Math.random() * 6; a.state = 'scatter'; a.fx = x; a.fz = z; a.fleeT = Math.max(a.fleeT, 4 + Math.random() * 3);
    if (a.circ?.body) { a.state = 'circle'; a.altTo = a.B.alt ? a.B.alt[0] + Math.random() * (a.B.alt[1] - a.B.alt[0]) : 9; a.circ.until = this.hours() + 30 / 60; } // up again; down again in half a game hour if it is quiet
    else if (a.S.body.ground) { const k = Math.hypot(a.home.x - x, a.home.z - z) || 1, d = 35 + Math.random() * 25, s = Math.random() < 0.5 ? -1 : 1; a.landAt = { x: a.home.x + ((a.home.x - x) / k) * d + ((a.home.z - z) / k) * 12 * s, z: a.home.z + ((a.home.z - z) / k) * d - ((a.home.x - x) / k) * 12 * s }; a.home.x = a.landAt.x; a.home.z = a.landAt.z; } // a ground flock settles again further off
    else if (a.S.body.wader) { const b = this.bankNear(a.home.x + (a.home.x - x) * 0.8, a.home.z + (a.home.z - z) * 0.8, 30); a.landAt = b ?? { x: a.home.x + (a.home.x - x), z: a.home.z + (a.home.z - z) }; a.home.x = a.landAt.x; a.home.z = a.landAt.z; }
    if (!a.scT || this.t - a.scT > 4) {
      a.scT = this.t;
      let n = 0; for (const m of a.grp?.members ?? [a]) if (m.air) n++;
      this.stats.scatters++;
      const P = g.player, byYou = Math.hypot(x - P.x, z - P.z) < 6;
      g.emit('birdsScatter', { id: a.id, species: a.sp, x: +a.x.toFixed(1), z: +a.z.toFixed(1), from: { x: +x.toFixed(1), z: +z.toFixed(1) }, n, byYou });
      this.voice(a, 'flap');
      // The warning: birds going up off the water near you, and it was not you that put them up.
      if ((a.S.body.wader || a.S.body.ground) && !byYou && Math.hypot(a.x - P.x, a.z - P.z) < 70 && this.t - (this.scToastT ?? -99) > 40) { this.scToastT = this.t; g.hud?.toast?.(a.S.body.wader ? 'BIRDS GO UP OFF THE WATER · SOMETHING IS COMING' : 'BIRDS GO UP ALL AT ONCE · SOMETHING IS COMING', 'warn'); g.emit('theQuiet', { species: a.sp, x: +a.x.toFixed(1), z: +a.z.toFixed(1), from: { x: +x.toFixed(1), z: +z.toFixed(1) } }); }
    }
  }

  // ---- the swarm: up off the seeps at night, onto anything warm, turned by fire ------------------------------------------
  brainSwarm(a, dt) {
    const g = this.g, S = a.S, night = g.sky?.night ?? 0;
    if (night < 0.35) { a.state = 'settled'; return W(a, a.home.x, a.home.z, S.speed.walk); }
    const fire = this.fireNear(a.x, a.z, S.fear.fire);
    if (fire) { a.state = 'scattered'; const dx = a.x - fire.x, dz = a.z - fire.z, l = Math.hypot(dx, dz) || 1; return W(a, a.x + (dx / l) * 8, a.z + (dz / l) * 8, S.speed.run * 1.4); }
    let t = null, k = S.senses.smell, tk = null;
    for (const c of g.chars) { if (!c.alive || c.hf || c.fauna || c.faction === 'zombie' || (c.inVehicle && !c.seatPose) || Math.abs(c.x - a.x) > k || Math.abs(c.z - a.z) > k) continue; const d = Math.hypot(c.x - a.x, c.z - a.z); if (d < k) { k = d; t = c; tk = 'person'; } }
    for (const d of g.dogs?.dogs ?? []) { if (d.dead || d.ride || Math.abs(d.x - a.x) > k || Math.abs(d.z - a.z) > k) continue; const e = Math.hypot(d.x - a.x, d.z - a.z); if (e < k) { k = e; t = d; tk = 'dog'; } }
    if (t && Math.hypot(t.x - a.home.x, t.z - a.home.z) < S.leash) {
      a.state = 'swarm';
      if (k < S.attack.reach && a.atkCd <= 0) this.strike(a, t, tk);
      return W(a, t.x, t.z, S.speed.run);
    }
    a.state = 'hover';
    return W(a, a.home.x + Math.sin(this.t * 0.3 + a.seed) * 2, a.home.z + Math.cos(this.t * 0.4 + a.seed) * 2, S.speed.walk);
  }

  // ---- attacks ---------------------------------------------------------------------------------------------------------
  strike(a, t, kind) {
    const S = a.S, AT = S.attack;
    if (!AT || a.atkCd > 0) return false;
    a.atkCd = AT.every;
    if (AT.kind !== 'sting' && t.x !== undefined && !this.g.statics.lineOfSight(a.x, a.z, t.x, t.z, RAY_SOLID)) return false;
    this.hit(a, t, AT.dmg, kind, AT.kind === 'charge' ? 'bash' : 'bite');
    return true;
  }
  // One hit from an animal on anything: a person (the one damage law), a dog, another animal.
  hit(a, t, dmg, kind, cause, quiet = false) {
    const g = this.g, P = g.player, AT = a.S.attack ?? {};
    const k = Math.hypot(t.x - a.x, t.z - a.z) || 1, dx = (t.x - a.x) / k, dz = (t.z - a.z) / k;
    if (t.isFauna) this.hurt(t, dmg, a, dx, dz, cause);
    else if (kind === 'dog' || (t.breed && t.bond !== undefined)) g.dogs?.hurt(t, dmg, null, dx, dz, 'bite');
    else {
      g.combat.damage(t, dmg, null, dx, dz, cause);
      if (t.alive && t !== P && AT.kd && Math.random() < AT.kd && t.faction !== 'zombie') { t.knockT = 1.2; t.knockMax = 1.2; }
      if (t === P && !g.godMode) {
        if (AT.venom && !quiet) g.survival?.sicken?.(AT.venom);
        if (AT.hot && g.hotground) g.hotground.dose += AT.hot;
      }
    }
    if (!quiet) { g.emit('faunaAttack', { id: a.id, species: a.sp, target: t.id ?? null, kind, dmg: Math.round(dmg), how: AT.kind ?? cause }); if (AT.kind !== 'sting') this.voice(a, a.S.voice ?? 'bite'); }
  }

  // Hurt an animal (bullets, blasts, fire, a car, a dog's teeth, another animal). by: who did it.
  hurt(a, dmg, by = null, dx = 0, dz = 0, cause = 'bullet', dog = null) {
    const g = this.g, S = a.S;
    if (!a || !(dmg > 0)) return;
    if (a.dead) { if (cause === 'bullet') g.fx?.bloodSpray(a.x, 0.3, a.z, dx, dz, 3, 0.4); return; }
    if (S.onlyBy && !S.onlyBy.includes(cause)) return; // a swarm: bullets go through it
    a.hp -= dmg; a.a.flinch = 1; a.rec.hp = a.hp;
    if (cause !== 'fire' && S.form !== 'swarm') { g.fx?.bloodSpray(a.x, 0.35 + a.y + (a.p.scale ?? 1) * 0.2, a.z, dx, dz, 4, 0.5); if (Math.random() < 0.4) g.fx?.decal(a.x, a.z, 0.22, '#5a0606'); }
    if (by === g.player) g.emit('faunaHit', { id: a.id, species: a.sp, dmg: Math.round(dmg), hp: Math.max(0, Math.round(a.hp)), cause });
    if (a.hp <= 0) { this.die(a, by, cause); return; }
    // How it takes it: prey bolt, a hurt predator leaves, a hog turns on what hurt it, a bird goes up, a gator goes under.
    const sx = by?.x ?? a.x - dx * 5, sz = by?.z ?? a.z - dz * 5;
    if (a.hold) a.hold.dmg += dmg;
    if (S.form === 'bird') { if (!a.air) this.takeOff(a, sx, sz); }
    else if (S.temper === 'prey') this.bolt(a, sx, sz, 8, by, by?.h !== undefined ? 'car' : null);
    else if (S.temper === 'territorial' && a.hp / a.maxHp > S.flee && by && by.x !== undefined && !by.inVehicle && Math.hypot(by.x - a.x, by.z - a.z) < 18) { a.charge = { t: by, k: by.isFauna ? 'animal' : by.breed ? 'dog' : 'person', T: 3.5 }; this.stats.charges++; g.emit('faunaCharge', { id: a.id, species: a.sp, target: by.id ?? null, kind: 'revenge', dist: +Math.hypot(by.x - a.x, by.z - a.z).toFixed(1) }); }
    else if (a.hp / a.maxHp < S.flee || S.form === 'gator') { a.fleeT = 6; a.fx = sx; a.fz = sz; }
    else if (S.form === 'snake') { a.fleeT = 3; a.fx = sx; a.fz = sz; }
  }

  die(a, by, cause) {
    const g = this.g, S = a.S;
    a.alive = false; a.dead = true; a.deadT = 0; a.deadAt = this.hours(); a.speed = 0; a.hold = null; a.held = null;
    a.rec.dead = true; a.rec.deadAt = a.deadAt;
    this.stats.killed++;
    if (S.form === 'bird' && a.air) { a.vy = 0; a.y = a.alt; g.outdoors?.onBirdDown(a, by); } // it falls (tick) and lies as a carcass
    if (by === g.player && S.form !== 'bird') g.outdoors?.gain('hunting', 4);
    const byId = by === g.player ? g.player.id : by?.isFauna ? `animal:${by.sp}` : by?.id ?? null;
    g.emit('faunaKilled', { id: a.id, species: a.sp, by: byId, cause, x: +a.x.toFixed(1), z: +a.z.toFixed(1), roadkill: cause === 'vehicle' });
    if (cause === 'vehicle') { this.stats.roadkill++; g.emit('roadkill', { id: a.id, species: a.sp, vehicle: by?.id ?? null, x: +a.x.toFixed(1), z: +a.z.toFixed(1) }); }
    if (by === g.player && S.butcher && Math.hypot(a.x - g.player.x, a.z - g.player.z) < 40) g.hud?.toast?.(`${S.name.toUpperCase()} DOWN · E WITH A BLADE TO BUTCHER IT`, 'job');
  }

  blast(x, z, r, dmg, by) {
    for (const a of this.live) {
      if (a.dead || (a.form === 'bird' && a.alt > 4)) continue;
      const k = Math.hypot(a.x - x, a.z - z);
      if (k > r || !this.g.statics.lineOfSight(x, z, a.x, a.z)) continue;
      const f = 1 - k / r;
      this.hurt(a, dmg * f * f + 10 * f, by, (a.x - x) / (k || 1), (a.z - z) / (k || 1), 'explosion');
      if (!a.dead && a.form !== 'gator') { a.vx += ((a.x - x) / (k || 1)) * f * 7; a.vz += ((a.z - z) / (k || 1)) * f * 7; }
    }
  }

  // A round's line (combat.js hitscan): the nearest animal it crosses before maxT. One result object, reused.
  // slope: a round aimed up at something in the sky (aimLift: metres up a metre out, from the muzzle's 1.45 m) meets a
  // flying bird where its height matches the bird's, and passes over anything on the ground once past head height.
  raycast(ox, oz, dx, dz, maxT, slope = 0) {
    let best = null, bt = maxT;
    for (const a of this.live) {
      const high = a.form === 'bird' && a.alt > 2.2;
      if (a.dead || a.S.onlyBy || (high && !slope)) continue;
      const span = a.B.span ?? 1, r = a.form === 'gator' ? 0.55 : a.form === 'snake' ? 0.28 : a.form === 'bird' ? (high ? 0.3 + span * 0.3 : 0.3) : 0.24 + 0.22 * (a.p.scale ?? 1) * (a.B.lenK ?? 1);
      const t = rayCircle(ox, oz, dx, dz, a.x, a.z, r, bt);
      if (!(t >= 0.3 && t < bt)) continue;
      const h = 1.45 + slope * t;
      if (high ? Math.abs(h - a.alt) > 0.35 + span * 0.3 : slope > 0 && h > 2.6) continue;
      bt = t; best = a;
    }
    if (!best) return null;
    HIT.t = bt; HIT.animal = best;
    return HIT;
  }

  // The mouse is where you aim, in the sky too (main.js, after the mouse ray meets the ground): a flying bird under the
  // cursor's ray (within its own size of it) becomes the aim point, at its height. out: g.aim ({ x, z, y }).
  skyAim(ray, out) {
    let best = null, bd = Infinity;
    const o = ray.origin, d = ray.direction;
    for (const a of this.live) {
      if (a.dead || a.form !== 'bird' || !a.air || a.alt <= 2.2) continue;
      const vx = a.x - o.x, vy = a.alt - o.y, vz = a.z - o.z, t = vx * d.x + vy * d.y + vz * d.z;
      if (t <= 0) continue;
      const k = Math.sqrt(Math.max(0, vx * vx + vy * vy + vz * vz - t * t));
      if (k < 0.7 + (a.B.span ?? 1) * 0.5 && k < bd) { bd = k; best = a; }
    }
    if (best) { out.x = best.x; out.z = best.z; out.y = best.alt; } else out.y = 0;
    return best;
  }
  // The rise a shot from ch needs to meet the aim point's height (combat.fire): 0 when the aim is on the ground.
  aimLift(ch) {
    const aim = this.g.aim, y = aim?.y ?? 0;
    if (!(y > 2.2)) return 0;
    return (y - 1.45 - (ch.gy ?? 0)) / Math.max(1, Math.hypot(aim.x - ch.x, aim.z - ch.z));
  }

  // An animal near an aim point (the dogs' SIC: systems/dogs.js sicTarget).
  nearAim(x, z, r = 5) {
    let best = null, bd = r;
    for (const a of this.live) { if (a.dead || (a.form === 'bird' && a.air) || a.form === 'swarm') continue; const k = Math.hypot(a.x - x, a.z - z); if (k < bd) { bd = k; best = a; } }
    return best;
  }

  // ---- what hurts an animal out there: fire, cars, the infected, traps ------------------------------------------------------
  hazards(a, dt) {
    const g = this.g, S = a.S;
    if (a.form === 'bird' && a.air) return;
    for (const f of g.throwables?.fires ?? []) if (Math.hypot(f.x - a.x, f.z - a.z) < f.r) this.hurt(a, (S.form === 'swarm' ? 30 : 7) * dt, f.by ?? null, 0, 0, 'fire');
    if (!a.alive) return;
    // The infected bite what gets close (they do not hunt animals; an animal that fights them pays for it).
    if (a.infT <= 0 && S.form !== 'swarm' && (a.zT = (a.zT ?? 0) - dt) <= 0) for (const c of (a.zT = 0.2, g.chars)) { // looked for five times a second
      if (c.faction !== 'zombie' || !c.alive || c.hf || Math.abs(c.x - a.x) > 1.3 || Math.abs(c.z - a.z) > 1.3) continue;
      if (Math.hypot(c.x - a.x, c.z - a.z) < 1.15) { a.infT = R.infectedEvery; this.hurt(a, R.infectedBite, c, a.x - c.x, a.z - c.z, 'bite'); break; }
    }
    // A car that hits it: thrown and hurt, and the car takes the dent (a deer through your grille).
    if (a.hitCd > 0 || S.form === 'swarm') return;
    for (const v of g.vehicles) {
      if (v.dead || v.sunk || Math.abs(v.x - a.x) > 6 || Math.abs(v.z - a.z) > 6) continue;
      const sp = Math.hypot(v.vx ?? 0, v.vz ?? 0);
      if (sp < 3) continue;
      const rad = a.form === 'gator' ? 0.7 : a.form === 'snake' ? 0.3 : 0.25 + 0.25 * (a.p.scale ?? 1);
      for (const s of SIDES) {
        const cx = v.x + Math.sin(v.h) * v.len * 0.25 * s, cz = v.z + Math.cos(v.h) * v.len * 0.25 * s;
        if (Math.hypot(cx - a.x, cz - a.z) < v.wid * 0.55 + rad) {
          a.hitCd = 0.6;
          const size = a.form === 'gator' ? 1.6 : a.form === 'snake' ? 0.05 : (a.p.scale ?? 1) * (a.B.wideK ?? 1);
          this.hurt(a, sp * R.carHitK * (a.form === 'gator' ? 0.7 : 1), v.driver ?? v, v.vx / sp, v.vz / sp, 'vehicle');
          const k = sp * R.carDent * size;
          if (size > 0.3) { g.vehDamage?.hit?.(v, a.x, a.z, k, 'crash'); g.vehiclesSys?.damage?.(v, sp * 0.4 * size, null); g.audio?.crash?.(Math.min(1, size * 0.4)); }
          g.emit('faunaCarHit', { id: a.id, species: a.sp, vehicle: v.id, speed: +sp.toFixed(1), dead: a.dead, dent: +k.toFixed(2) });
          a.vx = v.vx * 0.8; a.vz = v.vz * 0.8;
          return;
        }
      }
    }
  }
  // The Greyborn's traps (and your snares) catch animals too: a deer in a snare, a coyote under a deadfall.
  trapPass() {
    const T = this.g.traps;
    if (!T?.list?.length) return;
    for (const t of T.list) {
      if (t.state !== 'armed') continue;
      const r = TRAPS[t.kind]?.r ?? 0.8;
      for (const a of this.live) {
        if (a.dead || a.held || a.form === 'bird' || a.form === 'swarm' || Math.abs(a.x - t.x) > r + 0.3 || Math.abs(a.z - t.z) > r + 0.3) continue;
        if (Math.hypot(a.x - t.x, a.z - t.z) > r + 0.15) continue;
        const row = TRAPS[t.kind];
        T.spring(t, null);
        t.by = a.id;
        this.stats.trapped++;
        if (row.dmg) this.hurt(a, row.dmg, null, 0, 0, 'trap');
        if (a.alive && (row.hold || row.knock)) a.held = { x: t.x, z: t.z, until: this.t + Math.max(row.hold ?? 0, row.knock ?? 0) * (a.form === 'gator' ? 2 : 20), trap: t.id };
        this.g.emit('faunaTrapped', { id: a.id, species: a.sp, trap: t.id, kind: t.kind, dead: a.dead });
        break;
      }
    }
  }
  heldStep(a, dt) {
    const H = a.held;
    if (this.t > H.until || a.dead) { a.held = null; a.fleeT = 5; a.fx = H.x; a.fz = H.z; return; }
    a.state = 'trapped'; a.speed = 0; a.x = H.x + Math.sin(this.t * 9 + a.seed) * 0.12; a.z = H.z + Math.cos(this.t * 7) * 0.12; a.a.flinch = 0.5;
    if (Math.random() < dt * 2) this.voice(a, a.S.voice ?? 'snort');
  }

  // ---- moving ----------------------------------------------------------------------------------------------------------
  ground(a) { return this.g.stunts?.heightAt?.(a.x, a.z, a.y) ?? 0; }
  move(a, dt, want) {
    const g = this.g, S = a.S;
    let tx = want?.x ?? a.x, tz = want?.z ?? a.z, v = want?.v ?? 0;
    const dx0 = tx - a.x, dz0 = tz - a.z, dist = Math.hypot(dx0, dz0);
    let wx = 0, wz = 0;
    if (dist > 0.15 && v > 0) { const s = Math.min(v, dist * 3); wx = (dx0 / dist) * s; wz = (dz0 / dist) * s; }
    // Clear of fire, of each other, and (calm) of a car coming at it. A panicking animal does not look.
    let rx = 0, rz = 0;
    for (const f of g.throwables?.fires ?? []) { const ex = a.x - f.x, ez = a.z - f.z, e = Math.hypot(ex, ez), keep = f.r + (S.fear?.fire ?? 4) * 0.6; if (e < keep) { const k = ((keep - e) / keep) * 9; rx += (ex / (e || 1)) * k; rz += (ez / (e || 1)) * k; } }
    if (a.fleeT <= 0 && S.form !== 'swarm') for (const c of g.vehicles) {
      if (c.dead || Math.abs(c.x - a.x) > R.carDodge + 4 || Math.abs(c.z - a.z) > R.carDodge + 4) continue;
      const sp = Math.hypot(c.vx ?? 0, c.vz ?? 0), ex = a.x - c.x, ez = a.z - c.z, e = Math.hypot(ex, ez) || 1, fx = Math.sin(c.h), fz = Math.cos(c.h);
      if (sp > 3 && e < R.carDodge && (ex * fx + ez * fz) / e > 0.4) { const sx = -fz, sz = fx, sd = ex * sx + ez * sz >= 0 ? 1 : -1; rx += sx * sd * 10; rz += sz * sd * 10; }
    }
    if (a.grp && a.grp.members.length > 1) for (const o of a.grp.members) {
      if (o === a || o.dead || Math.abs(o.x - a.x) > 1.4 || Math.abs(o.z - a.z) > 1.4) continue;
      const ex = a.x - o.x, ez = a.z - o.z, e = Math.hypot(ex, ez) || 0.01, keep = 0.6 + 0.5 * (a.p.scale ?? 1);
      if (e < keep) { rx += (ex / e) * (keep - e) * 4; rz += (ez / e) * (keep - e) * 4; }
    }
    wx += rx; wz += rz;
    const top = (S.speed?.run ?? 6) * 1.25, wl = Math.hypot(wx, wz);
    if (wl > top) { wx *= top / wl; wz *= top / wl; }
    if (!a.air) { const k = Math.min(1, dt * (a.state === 'lunge' || a.state === 'charge' ? 9 : 5)); a.vx += (wx - a.vx) * k; a.vz += (wz - a.vz) * k; }
    // The turn: a body swings round at its own rate (a hog wheels wide, a jackrabbit on a coin).
    const sp0 = Math.hypot(a.vx, a.vz);
    if (sp0 > 0.3 && !a.air && S.form !== 'swarm') {
      const wf = Math.atan2(a.vx, a.vz), d = Math.atan2(Math.sin(wf - a.face), Math.cos(wf - a.face)), mx = (S.turn ?? 6) * dt * (sp0 > 4 ? 1 : 1.6);
      a.face += Math.max(-mx, Math.min(mx, d));
      if (Math.abs(d) > 1.2 && sp0 > 2) { a.vx = Math.sin(a.face) * sp0 * 0.7; a.vz = Math.cos(a.face) * sp0 * 0.7; } // it cannot run sideways: it slows into the turn
    } else if (want?.face !== undefined) a.face = angleLerp(a.face, want.face, Math.min(1, dt * 6));
    const pos = _p; pos.x = a.x + a.vx * dt; pos.z = a.z + a.vz * dt;
    // Water: land animals stop at the bank; a gator swims; a wading bird wades the shallows; the swarm flies.
    const deep = this.depthAt(pos.x, pos.z), wade = S.form === 'gator' ? 99 : S.body?.wader ? 0.55 : S.form === 'swarm' ? 99 : 0.75;
    if (deep > wade) { pos.x = a.x; pos.z = a.z; a.vx *= 0.3; a.vz *= 0.3; }
    if (S.form !== 'swarm') g.statics.resolveCircle(pos, a.form === 'gator' ? 0.5 : 0.22 + 0.15 * (a.p.scale ?? 1), null, a.air ? a.y - 0.05 : -Infinity);
    const moved = Math.hypot(pos.x - a.x, pos.z - a.z);
    a.x = pos.x; a.z = pos.z;
    if (a.air) {
      a.y += a.vy * dt; a.vy -= 13 * dt;
      const gr = this.ground(a);
      if (a.y <= gr) { a.y = gr; a.vy = 0; a.air = false; a.vx *= 0.4; a.vz *= 0.4; if (a.pounce) { const q = a.pounce; a.pounce = null; if ((q.alive !== false) && !q.dead && Math.hypot(q.x - a.x, q.z - a.z) < S.attack.reach + 0.8) { a.atkCd = 0; this.strike(a, q, q.isFauna ? 'animal' : q.breed ? 'dog' : 'person'); } } }
    } else a.y = S.form === 'gator' && a.water ? -0.16 : this.ground(a);
    a.speed = moved / Math.max(dt, 1e-4);
    // Stuck on a wall: a new way round.
    if (v > 0.8 && dist > 1.5 && a.speed < 0.25 && !a.air) { if ((a.stuckT = (a.stuckT ?? 0) + dt) > 0.6) { a.stuckT = 0; a.goal = null; const s = Math.random() < 0.5 ? 1 : -1, ang = Math.atan2(dx0, dz0) + s * Math.PI / 2; a.vx += Math.sin(ang) * 3; a.vz += Math.cos(ang) * 3; } } else a.stuckT = 0;
    // A snake's body follows its head.
    if (a.trail) this.slither(a);
  }
  // Birds in the air: no walls, an altitude that eases to where it wants to be, a banking turn.
  fly(a, dt, want) {
    const S = a.S, B = S.body;
    const tx = want?.x ?? a.x, tz = want?.z ?? a.z, v = want?.v ?? 4;
    const dx = tx - a.x, dz = tz - a.z, d = Math.hypot(dx, dz);
    const wantF = d > 0.2 ? Math.atan2(dx, dz) : a.face, dd = Math.atan2(Math.sin(wantF - a.face), Math.cos(wantF - a.face));
    const mx = (S.turn ?? 1.5) * dt * (B.soar ? 1 : 2.5);
    a.face += Math.max(-mx, Math.min(mx, dd));
    a.bank = Math.max(-0.3, Math.min(0.3, dd * 1.2));
    const spd = d < 0.3 ? 0 : Math.min(v, d * 2 + 1.5);
    a.vx = Math.sin(a.face) * spd; a.vz = Math.cos(a.face) * spd;
    a.x += a.vx * dt; a.z += a.vz * dt;
    const to = a.altTo ?? (B.soar ? B.alt[0] + (a.rec?.var ?? 0.5) * (B.alt[1] - B.alt[0]) : 7);
    a.alt += (to - a.alt) * Math.min(1, dt * (B.soar ? 0.5 : 1.4));
    if (a.alt < 0) a.alt = 0;
    a.y = a.alt; a.speed = spd;
  }
  slither(a) {
    const T = a.trail, seg = (a.len ?? 1) / 15;
    const hx = T[0], hz = T[1], k = Math.hypot(a.x - hx, a.z - hz);
    if (k >= seg) { for (let i = 15; i > 0; i--) { T[i * 2] = T[i * 2 - 2]; T[i * 2 + 1] = T[i * 2 - 1]; } }
    T[0] = a.x; T[1] = a.z;
  }

  // ---- the body's state for the renderers ---------------------------------------------------------------------------------
  animate(a, dt) {
    const A = a.a, S = a.S;
    if (a.form === 'quad') {
      const v = a.air ? 0 : a.speed, legK = (a.B.legK ?? 1) * (a.p.scale ?? 1);
      const gk = v <= GAIT.walk.upTo * Math.max(0.6, legK) ? 0 : v <= GAIT.trot.upTo * Math.max(0.6, legK) ? 1 : 2;
      A.gait += (gk - A.gait) * Math.min(1, dt * 6);
      const per = gk === 0 ? GAIT.walk.perM : gk === 1 ? GAIT.trot.perM : GAIT.lope.perM;
      A.phase = (A.phase + v * dt * per / Math.max(0.35, legK)) % 1;
      A.air = a.air ? Math.min(1, A.air + dt * 9) : Math.max(0, A.air - dt * 7);
      const alert = a.state === 'alert' || a.state === 'frozen' || a.state === 'warn' || a.state === 'stalk' || a.state === 'attack' || a.state === 'charge';
      A.tail += ((a.tailC ? 1.2 : alert ? 0.8 : a.state === 'flee' ? 0.7 : 0.25) - A.tail) * Math.min(1, dt * 5);
      A.tuck += ((a.state === 'backoff' || a.state === 'shy' ? 0.7 : 0) - A.tuck) * Math.min(1, dt * 5);
      A.wag += dt * 3; A.wagAmp = 0.03;
      let head = alert ? 0.32 : a.state === 'flee' ? 0.12 : 0;
      head -= A.eat * 0.75;
      if (a.state === 'stalk') head = -0.12;
      A.head += (head - A.head) * Math.min(1, dt * 6);
      if (a.state !== 'rest') A.sit = Math.max(0, A.sit - dt * 3);
    } else if (a.form === 'bird') {
      A.flap = (A.flap + dt * (a.air ? (S.body.soar && a.state !== 'scatter' && a.alt > 6 ? 0.6 : 3.4) : 0)) % 1;
      A.wing = a.air ? (S.body.soar && a.alt > 6 && a.state !== 'scatter' ? 0 : 1) : 0;
    } else if (a.form === 'gator') {
      A.phase = (A.phase + a.speed * dt * 0.9) % 1;
      if (a.state !== 'roll') A.roll *= Math.max(0, 1 - dt * 6);
    } else if (a.form === 'snake') {
      A.phase = (A.phase + (a.speed + 0.15) * dt * 2.2) % 1;
      A.strike = a.strikeT > 0 ? Math.sin((1 - a.strikeT / 0.25) * Math.PI) : 0;
    }
  }

  // ---- your verbs: butcher, cook, set a snare ---------------------------------------------------------------------------------
  bladeOf() {
    const inv = this.g.inventory, B = R.butcher.blades;
    let best = null, bk = Infinity;
    for (const s of inv?.carried?.slots ?? []) { const k = B[s.id]; if (k !== undefined && k < bk) { bk = k; best = s.id; } else if (k === undefined && ITEMS[s.id]?.tags?.includes('blade') && 1.5 < bk) { bk = 1.5; best = s.id; } }
    return best ? { id: best, k: bk } : null;
  }
  carcassNear(x, z, reach = R.butcher.reach) {
    let best = null, bd = reach;
    for (const a of this.live) { if (!a.dead || a.butchered || !a.S.butcher || a.form === 'swarm') continue; const k = Math.hypot(a.x - x, a.z - z); if (k < bd) { bd = k; best = a; } }
    return best;
  }
  rawCount() { let n = 0; for (const s of this.g.inventory?.carried?.slots ?? []) if (ITEMS[s.id]?.raw && ITEMS[s.id]?.cooks) n += s.n; return n; }
  // What heats a pan near you: a fire (a flare, a molotov's fire, a burning car) or a camped RV's stove.
  heatNear(x, z) {
    const g = this.g, C = R.cook;
    for (const f of g.throwables?.fires ?? []) if (Math.hypot(f.x - x, f.z - z) < f.r + C.reach) return { kind: 'fire', x: f.x, z: f.z };
    for (const v of g.vehicles) {
      if (v.dead) continue;
      if ((v.onFire > 0 || v.burn > 0) && Math.hypot(v.x - x, v.z - z) < 6 + C.reach) return { kind: 'burning car', x: v.x, z: v.z };
      if (v.camp && Math.hypot(v.x - x, v.z - z) < C.rvReach) return { kind: 'stove', x: v.x, z: v.z, v };
    }
    return null;
  }
  // E's offer (main.js interaction chain): butcher the carcass at your feet, or cook what you carry at the fire.
  nearFor(p) {
    if (!p.alive || p.inVehicle) return null;
    const a = this.carcassNear(p.x, p.z);
    if (a) {
      if (this.job?.a === a) return { a, verb: 'busy', text: `Butchering the ${a.S.name.toLowerCase()} · ${Math.round((this.job.t / this.job.need) * 100)}% · move to stop` };
      const b = this.bladeOf();
      return b ? { a, verb: 'butcher', text: `Butcher the ${a.S.name.toLowerCase()} (${ITEMS[b.id].name.toLowerCase()})` } : { a, verb: 'none', text: `A dead ${a.S.name.toLowerCase()} · you need a blade to butcher it` };
    }
    const n = this.rawCount();
    if (n) { const h = this.heatNear(p.x, p.z); if (h) return { verb: 'cook', heat: h, text: `Cook ${n} raw meat on the ${h.kind}` }; }
    return this.g.outdoors?.nearFor(p) ?? null; // a line to cast, a trap, the camp, the ground to search (systems/outdoors.js)
  }
  interact(o) {
    if (!o) return { ok: false, why: 'nothing here' };
    if (o.verb === 'butcher') return this.startButcher(o.a);
    if (o.verb === 'cook') return this.cook();
    if (o.verb === 'busy' && o.a) return { ok: true, text: 'STILL CUTTING' };
    if (!o.a && o.verb !== 'cook' && this.g.outdoors) return this.g.outdoors.interact(o);
    return { ok: false, why: o.text };
  }
  startButcher(a) {
    const g = this.g, P = g.player, S = a.S;
    if (!a.dead || a.butchered || !S.butcher) return { ok: false, why: 'nothing to butcher' };
    const b = this.bladeOf();
    if (!b) return { ok: false, why: 'you need a blade: a knife, a machete, an axe' };
    const dex = g.skillsSys?.lv?.dexterity ?? 0;
    const O = g.outdoors; // the hunting skill (systems/outdoors.js)
    const need = S.butcher.time * b.k * Math.max(0.5, 1 - R.butcher.timeDex * dex) * Math.max(0.5, 1 + (O ? O.per('butcherTime', 'hunting') : 0));
    this.job = { a, t: 0, need, x: P.x, z: P.z, blade: b.id, dex };
    g.emit('butcherStart', { id: a.id, species: a.sp, seconds: +need.toFixed(1), blade: b.id });
    return { ok: true, text: `BUTCHERING THE ${S.name.toUpperCase()} · ${Math.ceil(need)} S`, seconds: need };
  }
  butcherStep(dt) {
    const g = this.g, P = g.player, J = this.job, a = J.a;
    if (!P.alive || P.inVehicle || Math.hypot(P.x - J.x, P.z - J.z) > R.butcher.moveCancel || !this.live.includes(a) || a.butchered) { g.emit('butcherStop', { id: a.id, done: +(J.t / J.need).toFixed(2) }); this.job = null; return; }
    J.t += dt;
    P.face = Math.atan2(a.x - P.x, a.z - P.z);
    if (Math.random() < dt * 3) g.fx?.decal?.(a.x + (Math.random() - 0.5), a.z + (Math.random() - 0.5), 0.18, '#4a0606');
    if (J.t >= J.need) this.finishButcher();
  }
  finishButcher() {
    const g = this.g, J = this.job, a = J.a, S = a.S, inv = g.inventory, B = R.butcher;
    this.job = null;
    const dex = J.dex, picked = Math.min(0.6, (a.picked ?? 0) / 60); // what the vultures and coyotes already had
    const O = g.outdoors, X = O?.fx; // the hunting skill and its talents (systems/outdoors.js)
    const hideOk = Math.random() < Math.min(0.97, (B.base + B.perDex * dex + (O ? O.per('hideChance', 'hunting') : 0)) / Math.max(0.6, (R.butcher.blades[J.blade] ?? 1.5)));
    let meatBonus = X?.meatBonus ?? 0;
    const got = [];
    for (const [id, lo, hi] of S.butcher.yields) {
      let n = lo + Math.floor(Math.random() * (hi - lo + 1));
      const it = ITEMS[id];
      if (it?.kind === 'food') { n = Math.max(lo ? 1 : 0, Math.round(n * (1 - picked) + (dex >= 5 ? 1 : 0)) + meatBonus); meatBonus = 0; }
      else if (id === 'sinew') n += X?.sinewBonus ?? 0;
      else if (id === 'bone') n += X?.boneBonus ?? 0;
      let item = id;
      if (S.butcher.hide === id && !hideOk) item = 'torn_hide';
      if (n > 0) { inv.stow(item, n, { made: inv.hours() }); got.push({ item, n }); }
    }
    a.butchered = true; a.rec.butchered = true;
    g.skillsSys?.gain?.('dexterity', B.xp);
    O?.gain('hunting', 3);
    this.stats.butchered++;
    inv.changed?.();
    g.emit('butchered', { id: a.id, species: a.sp, items: got, hide: S.butcher.hide ? (hideOk ? 'clean' : 'torn') : null, seconds: +J.need.toFixed(1), blade: J.blade });
    g.hud?.toast?.(`BUTCHERED · ${got.map((x) => `${x.n} ${ITEMS[x.item].name.toUpperCase()}`).join(' · ')}${S.butcher.hide && !hideOk ? ' · THE HIDE TORE' : ''}`, 'job');
    return got;
  }
  // Raw meat in your pack onto the fire: the same weight comes off cooked, fresh again on the clock.
  cook() {
    const g = this.g, P = g.player, inv = g.inventory, h = this.heatNear(P.x, P.z);
    if (!h) return { ok: false, why: 'no fire or camp stove within reach' };
    const C = inv.carried, out = [];
    for (let i = C.slots.length - 1; i >= 0; i--) {
      const s = C.slots[i], it = ITEMS[s.id];
      if (!it?.raw || !it.cooks) continue;
      const t = inv.take(C, i, s.n);
      if (!t) continue;
      inv.add(C, it.cooks, t.n, { made: inv.hours() + (g.outdoors ? g.outdoors.per('cookKeepH', 'cooking') : 0) }); // a good cook's food keeps longer
      g.outdoors?.gain('cooking', t.n);
      out.push({ from: t.id, to: it.cooks, n: t.n });
    }
    if (!out.length) return { ok: false, why: 'nothing raw to cook' };
    inv.changed?.();
    this.stats.cooked += out.reduce((k, x) => k + x.n, 0);
    g.emit('cooked', { source: h.kind, items: out, vehicle: h.v?.id ?? null });
    g.hud?.toast?.(`COOKED ON THE ${h.kind.toUpperCase()} · ${out.map((x) => `${x.n} ${ITEMS[x.to].name.toUpperCase()}`).join(' · ')}`, 'job');
    g.audio?.burst?.({ dur: 0.9, freq: 2600, type: 'highpass', vol: 0.12, decay: 0.8 }); // the sizzle
    return { ok: true, items: out, source: h.kind, text: 'COOKED' };
  }
  // Snare wire from the PACK screen (inventory.js act 'snare'): a snare a stride ahead of you, yours, spotted.
  setSnare() {
    const g = this.g, P = g.player, T = g.traps;
    if (!T || P.inVehicle) return { ok: false, why: 'not from in here' };
    const x = P.x + Math.sin(P.face) * 1.4, z = P.z + Math.cos(P.face) * 1.4;
    const t = T.place('snare', x, z, null, P.face);
    if (!t) return { ok: false, why: 'no room for a snare here' };
    t.spotted = true; t.mine = true; T.dirty = true;
    g.emit('snareSet', { trap: t.id, x: +x.toFixed(1), z: +z.toFixed(1) });
    return { ok: true, text: 'SNARE SET · STEP AROUND IT' };
  }
  // What you ate: raw meat may turn your stomach (not off a stove), hot meat raises your dose.
  pollEvents() {
    const g = this.g, E = g.events;
    if (!E?.length) return;
    let i = E.length - 1;
    while (i > 0 && E[i - 1].seq > this.lastSeq) i--;
    for (; i < E.length; i++) {
      const e = E[i];
      if (e.seq <= this.lastSeq) continue;
      this.lastSeq = e.seq;
      if (e.type !== 'itemUsed') continue;
      const it = ITEMS[e.item];
      if (it?.poison && !g.godMode) { g.survival?.sicken?.('poisoning'); g.emit('poisoned', { item: e.item }); } // a pale cap (data/outdoors.js)
      if (!it?.raw) continue;
      const stove = E.some((x) => x.type === 'cooked' && x.item === e.item && Math.abs(x.t - e.t) < 0.05);
      if (it.hot && g.hotground && !g.godMode) g.hotground.dose += R.cook.hotDose;
      if (!stove && Math.random() < R.cook.rawSick * (g.outdoors?.fx.rawSickMul ?? 1) && !g.godMode) { g.survival?.sicken?.('poisoning'); g.emit('rawMeat', { item: e.item, sick: true }); }
    }
  }

  // ---- the world's hooks ----------------------------------------------------------------------------------------------------
  // A loud noise (main.js noise): the area heats up (fewer animals come), prey bolt, predators back off, birds go up.
  onNoise(x, z, r, src) {
    const H = PRESENCE.heat;
    if (r >= H.minR) this.addHeat(x, z, H.perShot * Math.min(2, r / 60));
    if (r < 30 || !this.enabled) return;
    for (const a of this.live) {
      if (a.dead) continue;
      const S = a.S, k = Math.hypot(a.x - x, a.z - z), gun = S.fear?.gun ?? 0;
      if (!gun || k > Math.min(r, gun)) continue;
      if (S.temper === 'prey' || S.form === 'bird') this.bolt(a, x, z, 7 + Math.random() * 3, src ?? null, 'noise');
      else if (S.temper === 'predator' || S.temper === 'scavenger') { a.backT = Math.max(a.backT, 4); a.bx = x; a.bz = z; }
      else if (S.temper === 'territorial' && !a.charge) { a.fleeT = Math.max(a.fleeT, 5); a.fx = x; a.fz = z; }
      else if (S.form === 'gator' && !a.hold && a.state !== 'lunge') { a.fleeT = 4; }
    }
  }

  voice(a, kind) {
    const g = this.g, P = g.player, d = Math.hypot(a.x - P.x, a.z - P.z), A = g.audio;
    if (!A || d > 70) return;
    const f = Math.max(0, 1 - d / 70), pan = g.pan?.(a.x) ?? 0;
    A.count?.(`fauna:${kind}`);
    if (kind === 'rattle') A.burst?.({ dur: 0.05, freq: 5200, type: 'highpass', vol: 0.22 * f, decay: 0.04, pan });
    else if (kind === 'yip') { for (let i = 0; i < 4; i++) A.tone?.(620 + Math.random() * 380, 0.09, 0.05 * f, 'triangle', 1.6, pan); }
    else if (kind === 'grunt' || kind === 'squeal') A.burst?.({ dur: kind === 'squeal' ? 0.35 : 0.22, freq: kind === 'squeal' ? 900 : 180, q: 3, type: 'bandpass', vol: 0.4 * f, decay: 0.2, pitchDrop: 0.3, pan });
    else if (kind === 'hiss') A.burst?.({ dur: 0.7, freq: 3400, type: 'highpass', vol: 0.18 * f, decay: 0.65, pan });
    else if (kind === 'snort') A.burst?.({ dur: 0.12, freq: 700, q: 1, type: 'bandpass', vol: 0.25 * f, decay: 0.1, pan });
    else if (kind === 'flap') { for (let i = 0; i < 3; i++) A.burst?.({ dur: 0.06, freq: 900, type: 'lowpass', vol: 0.2 * f, decay: 0.05, at: i * 0.09, pan }); }
    else if (kind === 'squawk') A.tone?.(760, 0.18, 0.06 * f, 'sawtooth', -0.5, pan);
    else if (kind === 'caw') A.tone?.(520, 0.22, 0.07 * f, 'sawtooth', -0.6, pan);
    else if (kind === 'quack' || kind === 'honk') A.tone?.(kind === 'honk' ? 330 : 440, 0.16, 0.07 * f, 'square', -0.3, pan);
    else if (kind === 'coo') A.tone?.(380, 0.3, 0.04 * f, 'sine', -0.1, pan);
    else if (kind === 'growl') A.tone?.(90, 0.5, 0.12 * f, 'sawtooth', 0.2, pan);
    else A.burst?.({ dur: 0.15, freq: 400, vol: 0.2 * f, decay: 0.12, pan });
  }

  // ---- the agent's view ------------------------------------------------------------------------------------------------------
  view(a) {
    const P = this.g.player;
    return {
      id: a.id, species: a.sp, name: a.S.name, form: a.form, temper: a.S.temper, state: a.dead ? (a.butchered ? 'bones' : 'carcass') : a.state,
      x: +a.x.toFixed(1), z: +a.z.toFixed(1), y: +a.y.toFixed(2), alt: a.form === 'bird' ? +a.alt.toFixed(1) : undefined, air: a.air || undefined,
      hp: Math.max(0, Math.round(a.hp)), maxHp: a.maxHp, dist: +Math.hypot(a.x - P.x, a.z - P.z).toFixed(1), face: +a.face.toFixed(2), speed: +a.speed.toFixed(1),
      group: a.grp ? { id: a.grp.id, size: a.grp.members.length, mode: a.grp.mode, quarry: a.grp.quarry?.id ?? null, lead: a.grp.lead === a } : null,
      threat: a.threat ? { id: a.threat.id ?? null, kind: a.tk, dist: +a.tdist.toFixed(1) } : null, lit: a.lit || 0, held: !!a.held, hold: a.hold ? a.hold.q?.id ?? true : undefined,
      cell: a.cell, butchered: a.butchered || undefined, antlers: a.antlers || undefined, circling: a.circ?.body ? { x: +a.circ.x.toFixed(1), z: +a.circ.z.toFixed(1), r: +a.circ.r.toFixed(1) } : undefined,
    };
  }
  summary() {
    const by = {};
    for (const a of this.live) { const k = a.sp; by[k] ??= { alive: 0, dead: 0 }; by[k][a.dead ? 'dead' : 'alive']++; }
    let recs = 0, liveCells = 0; for (const c of this.cells.values()) { recs += c.recs.length; if (c.live) liveCells++; }
    return { enabled: this.enabled, live: this.live.length, bySpecies: by, cells: this.cells.size, liveCells, records: recs, budget: { chunk: R.chunkBudget, maxLive: R.maxLive }, bodies: this.bodies.size, job: this.job ? { id: this.job.a.id, done: +(this.job.t / this.job.need).toFixed(2) } : null, stats: { ...this.stats } };
  }

  save() {
    for (const a of this.live) this.writeBack(a);
    const cells = [];
    for (const c of this.cells.values()) if (c.recs.length) cells.push({ key: c.key, cx: c.cx, cz: c.cz, roll: c.roll, awayAt: c.live ? this.hours() : c.awayAt, recs: c.recs.filter((r) => !r.gone).map((r) => ({ ...r })) });
    const heat = []; for (const [k, v] of this.heat) heat.push([k, +v.v.toFixed(3), +v.h.toFixed(2)]);
    return { seq: this.seq, cells, heat, stats: { ...this.stats } };
  }
  load(s) {
    if (!s) return;
    this.live.length = 0; this.cells.clear(); this.bodies.clear(); this.job = null;
    this.seq = s.seq ?? 0;
    for (const c of s.cells ?? []) this.cells.set(c.key, { key: c.key, cx: c.cx, cz: c.cz, roll: c.roll, recs: (c.recs ?? []).map((r) => ({ ...r })), live: false, awayAt: -1e9 });
    this.heat.clear(); for (const [k, v, h] of s.heat ?? []) this.heat.set(k, { v, h });
    if (s.stats) Object.assign(this.stats, s.stats);
    this.tickT = 0;
  }

  draw(dt) { this.r?.sync(this, this.g.camLook ?? this.g.player, dt); }
}

// ======================================================================================================================
// The bodies. Four-legged game wears the dogs' body (systems/dogs.js DogRenderer: one more instance of it, its head kinds
// for deer, hogs, cats, hares and the twinback); everything else is one rounded-box mesh posed per part (snakes, birds,
// gators, the Glassling's six legs and glass, the Lantern's stilts), one additive mesh for what glows (eyeshine in a beam,
// the swarm, the Lantern's lamp). A flying bird's shadow is its own (the parts cast shadows). Empty meshes cost no draw call.
const MAXP = 900, MAXG = 220, MAXW = 96;
// Draw only what was posed this frame and upload only that much (an empty mesh, twice in a row, uploads nothing).
export function finish(m, n) {
  m.count = n; m.visible = n > 0;
  if (n === 0 && m._n === 0) return;
  m._n = n;
  const A = m.instanceMatrix; A.clearUpdateRanges(); A.addUpdateRange(0, Math.max(1, n) * 16); A.needsUpdate = true;
  const C = m.instanceColor; if (C) { C.clearUpdateRanges(); C.addUpdateRange(0, Math.max(1, n) * 3); C.needsUpdate = true; }
}
// A bird's wing from above: x out from the shoulder (0..1), z along the body; a broad root tapering to a narrower tip,
// the same fore and aft (so the left wing is the right one turned round, never mirrored: its face stays up and lit).
// x is scaled by the half-span, z by the chord.
function wingGeo() {
  const sh = new THREE.Shape([[0, 0.5], [0.45, 0.46], [0.8, 0.3], [1, 0.15], [1, -0.15], [0.8, -0.3], [0.45, -0.46], [0, -0.5]].map(([x, y]) => new THREE.Vector2(x, y)));
  return new THREE.ShapeGeometry(sh).rotateX(-Math.PI / 2);
}
// A gator along its spine, nose (+) to tail (-): [offset, length, width, height] at 3.4 m long.
const GATOR_SEG = [[1.22, 0.5, 0.34, 0.15], [0.82, 0.42, 0.52, 0.22], [0.35, 0.6, 0.72, 0.28], [-0.18, 0.5, 0.62, 0.26], [-0.6, 0.42, 0.42, 0.2], [-0.98, 0.4, 0.3, 0.16], [-1.34, 0.36, 0.2, 0.12], [-1.66, 0.32, 0.12, 0.08]];
const _M = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

class FaunaRenderer {
  constructor(scene) {
    this.quad = new DogRenderer(scene, { max: 40, heads: ['up', 'deer', 'hog', 'cat', 'hare', 'twin'], limbs: 20, props: false });
    const mk = (geo, mat, n, shadow) => {
      const m = new THREE.InstancedMesh(geo, mat, n);
      m.castShadow = shadow; m.receiveShadow = false; m.frustumCulled = false;
      for (let i = 0; i < n; i++) { m.setMatrixAt(i, ZERO); m.setColorAt(i, _c.set('#888')); }
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.count = 0; m.visible = false;
      scene.add(m);
      return m;
    };
    this.parts = mk(new RoundedBoxGeometry(1, 1, 1, 2, 0.28), new THREE.MeshStandardMaterial({ roughness: 0.82, metalness: 0.02 }), MAXP, true);
    this.glow = mk(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false, fog: false, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }), MAXG, false);
    this.glow.renderOrder = 4;
    this.wing = mk(wingGeo(), new THREE.MeshStandardMaterial({ roughness: 0.9, side: THREE.DoubleSide }), MAXW, true);
    this.quads = []; this.np = 0; this.ng = 0; this.nw = 0;
  }

  done(m, n) { finish(m, n); }

  // One part: a rounded box at (x, y, z) in world space, sized (sx, sy, sz), yaw/pitch/roll.
  part(x, y, z, sx, sy, sz, yaw, pitch, roll, hex) {
    if (this.np >= MAXP) return;
    _e.set(pitch, yaw, roll, 'YXZ'); _q.setFromEuler(_e);
    _M.compose(_v.set(x, y, z), _q, _s.set(sx, sy, sz));
    this.parts.setMatrixAt(this.np, _M); this.parts.setColorAt(this.np++, _c.set(hex));
  }
  // A part between two points (a leg, a neck): from (ax, ay, az) to (bx, by, bz), thickness w.
  link(ax, ay, az, bx, by, bz, w, hex, over = 1.2) {
    const dx = bx - ax, dy = by - ay, dz = bz - az, l = Math.hypot(dx, dy, dz);
    if (l < 1e-4) return;
    const yaw = Math.atan2(dx, dz), pitch = -Math.asin(Math.max(-1, Math.min(1, dy / l)));
    this.part((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2, w, w, l + w * (over - 1), yaw, pitch, 0, hex); // a little overlap so a chain reads as one body
  }
  glint(x, y, z, r, hex) { if (this.ng >= MAXG) return; _M.compose(_v.set(x, y, z), _q.identity(), _s.set(r, r, r)); this.glow.setMatrixAt(this.ng, _M); this.glow.setColorAt(this.ng++, _c.set(hex)); }

  sync(sys, cam, dt) {
    this.np = this.ng = this.nw = 0;
    const g = sys.g, cx = cam.x, cz = cam.z, Rr = R.drawR, t = sys.t, night = g.sky?.night ?? 0;
    this.quads.length = 0;
    for (const a of sys.live) {
      if (Math.abs(a.x - cx) > Rr || Math.abs(a.z - cz) > Rr) continue;
      if (a.form === 'quad') { if (a.dead && a.butchered) this.bones(a); else this.quads.push(a); if (!a.dead && night > 0.4 && a.B.eyes && (a.lit || Math.hypot(a.x - g.player.x, a.z - g.player.z) < R.eyes.near)) this.eyes(a); }
      else if (a.form === 'snake') this.snake(a, t);
      else if (a.form === 'bird') this.bird(a, t);
      else if (a.form === 'gator') this.gator(a, t);
      else if (a.form === 'swarm') this.swarm(a, t, night);
    }
    // The hot ground's creatures (characters in hotground.js): drawn here, the stand-in person hidden.
    for (const Z of g.hotground?.zones ?? []) for (const c of Z.fauna) {
      c.ownMesh = true; // characters.js skips its person (the engine's flag for an animal drawn by its own renderer)
      if (Math.abs(c.x - cx) > Rr || Math.abs(c.z - cz) > Rr) continue;
      const kind = c.hf?.kind;
      if (kind === 'glassling') this.crawler(c, t, night);
      else if (kind === 'lantern') this.stilt(c, t, night);
    }
    this.quad.drawList(this.quads, t);
    this.done(this.parts, this.np); this.done(this.glow, this.ng); this.done(this.wing, this.nw);
  }

  bones(a) { // what is left once you have butchered it: a ribcage and a stain
    const s = a.p.scale ?? 1;
    for (let i = 0; i < 4; i++) this.part(a.x + Math.sin(a.face) * (i - 1.5) * 0.12 * s, 0.04, a.z + Math.cos(a.face) * (i - 1.5) * 0.12 * s, 0.32 * s, 0.05, 0.04, a.face + Math.PI / 2, 0, 0, '#d8d0bc');
  }
  eyes(a) {
    const s = a.p.scale ?? 1, f = a.face, up = (0.62 + 0.25 * (a.B.neckK ?? 1)) * s * (a.B.legK ?? 1), fw = (0.42 + 0.1 * (a.B.neckK ?? 1)) * s * (a.B.lenK ?? 1);
    const hx = a.x + Math.sin(f) * fw, hz = a.z + Math.cos(f) * fw, sx = Math.cos(f) * 0.06 * s, sz = -Math.sin(f) * 0.06 * s;
    const r = 0.06 * (a.lit ? 1.25 : 0.8);
    this.glint(hx + sx, up, hz + sz, r, a.B.eyes); this.glint(hx - sx, up, hz - sz, r, a.B.eyes);
    if (a.B.head === 'twin') { const ox = Math.cos(f) * 0.21 * s, oz = -Math.sin(f) * 0.21 * s; this.glint(hx + ox + sx, up, hz + oz + sz, r, a.B.eyes); this.glint(hx - ox - sx, up, hz - oz - sz, r, a.B.eyes); }
  }

  // A snake: segments along its trail (crawling) or wound into a coil (resting, warning); the head up and back to strike.
  snake(a, t) {
    const B = a.B, A = a.a, T = a.trail, n = 15, len = a.len ?? 1, seg = len / n, gw = B.girth ?? 0.07;
    const coil = a.dead ? 0 : A.coil ?? 0, cx = a.x, cz = a.z;
    let px = 0, pz = 0;
    for (let i = 0; i <= n; i++) {
      // Coiled: a flat spiral round where it lies, the head on top; crawling: its trail, with a sideways wave.
      const ang = a.face + Math.PI + i * 0.62, rr = 0.05 + i * 0.0135 * (len / 1.2);
      const kx = cx + Math.sin(ang) * rr, kz = cz + Math.cos(ang) * rr;
      const ti = Math.min(15, i);
      const wave = Math.sin(A.phase * TAU * 2 - i * 0.9) * 0.05 * (1 - coil);
      const lx = T[ti * 2] + Math.cos(a.face) * wave, lz = T[ti * 2 + 1] - Math.sin(a.face) * wave;
      const x = lx + (kx - lx) * coil, z = lz + (kz - lz) * coil;
      if (i > 0) {
        const k = i / n, w = gw * (k < 0.15 ? 0.85 + k : k > 0.8 ? 1 - (k - 0.8) * 3 : 1);
        const col = i >= n - 1 && B.tip ? B.tip : i % 3 === 1 ? B.dark : B.coat; // a darker blotch every third: the pattern down its back
        const h = 0.03 + w * 0.5 + (1 - k) * coil * 0.06;
        this.link(px, h, pz, x, h, z, w * 1.5, col);
      }
      px = x; pz = z;
    }
    // The head: raised in the S of a warning, out on the strike.
    const rise = a.dead ? 0 : (a.state === 'rattle' || a.state === 'gape' ? 0.14 : 0.02), st = A.strike ?? 0;
    const hx = cx + Math.sin(a.face) * (0.05 + st * 0.55), hz = cz + Math.cos(a.face) * (0.05 + st * 0.55);
    this.part(hx, 0.05 + rise, hz, gw * 2.2, gw * 1.3, gw * 3, a.face, -st * 0.2, a.dead ? Math.PI : 0, B.head ?? B.dark);
    if (B.mouth && (A.jaw ?? 0) > 0.3) this.part(hx + Math.sin(a.face) * gw * 1.4, 0.07 + rise, hz + Math.cos(a.face) * gw * 1.4, gw * 1.8, gw * 0.6, gw * 1.6, a.face, -0.5, 0, B.mouth);
    if (a.state === 'rattle') { const tx = T[30], tz = T[31], j = Math.sin(t * 80) * 0.012; this.part(cx + Math.sin(a.face + Math.PI) * 0.05 + j, 0.2, cz + Math.cos(a.face + Math.PI) * 0.05, gw * 1.2, gw * 3, gw * 1.2, a.face, 0, 0, B.tip ?? B.coat); void tx; void tz; }
  }

  // A bird: a body and a fanned tail, a head and beak, two wings in two panels (broad inner, swept outer) with the
  // primaries spread like fingers at the tips - spread and still to soar, beating to climb - and a wader's legs and neck.
  // In the sun its real shadow (castShadow) lies on the ground: the clue you see before you look up.
  bird(a, t) {
    const B = a.B, A = a.a, f = a.face, y = a.dead ? Math.max(0.06, a.y) : Math.max(0.05, a.y), span = B.span ?? 1.6, L = B.len ?? 0.65;
    const fx = Math.sin(f), fz = Math.cos(f), rx = Math.cos(f), rz = -Math.sin(f);
    const standing = !a.air && !a.dead, wader = B.wader, bodyY = standing && wader ? 0.85 : y + (standing ? 0.3 : 0);
    const roll = a.air ? -(a.bank ?? 0) : 0;
    this.part(a.x, bodyY, a.z, 0.2, 0.16, L, f, standing ? -0.25 : 0, roll, B.coat);
    if (a.air || a.dead) this.part(a.x - fx * L * 0.62, bodyY, a.z - fz * L * 0.62, 0.26, 0.04, 0.26, f, 0, roll, B.wing); // the tail fan
    // Head and beak (a heron stands with its neck up; in the air both tuck in).
    if (wader && standing) {
      const nx = a.x + fx * 0.12, nz = a.z + fz * 0.12, dip = A.eat ?? 0, hx = a.x + fx * (0.25 + dip * 0.25), hz = a.z + fz * (0.25 + dip * 0.25), hy = 1.45 - dip * 0.55;
      this.link(nx, bodyY + 0.08, nz, hx, hy, hz, 0.06, B.coat);
      this.part(hx, hy, hz, 0.08, 0.08, 0.13, f, 0, 0, B.head);
      this.part(hx + fx * 0.14, hy - 0.02, hz + fz * 0.14, 0.03, 0.03, 0.2, f, 0.15, 0, B.beak ?? '#c8a040');
      for (const s of SIDES) this.link(a.x + rx * 0.05 * s, bodyY - 0.05, a.z + rz * 0.05 * s, a.x + rx * 0.08 * s - fx * 0.05, 0.02, a.z + rz * 0.08 * s - fz * 0.05, 0.025, B.legs ?? '#2a2620');
    } else {
      const hx = a.x + fx * (L * 0.55), hz = a.z + fz * (L * 0.55), hy = bodyY + (standing ? 0.12 : 0.02);
      this.part(hx, hy, hz, 0.1, 0.09, 0.14, f, 0, roll, B.head);
      this.part(hx + fx * 0.09, hy - 0.01, hz + fz * 0.09, 0.04, 0.04, 0.08, f, 0.3, 0, wader ? B.beak ?? '#c8a040' : '#d8d0b8');
      if (wader && a.air) this.link(a.x - fx * L * 0.4, bodyY - 0.02, a.z - fz * L * 0.4, a.x - fx * L * 1.1, bodyY - 0.04, a.z - fz * L * 1.1, 0.025, B.legs ?? '#2a2620');
    }
    // The wings: one tapered, swept panel each (its own mesh), hinged at the shoulder and raised round the body's axis;
    // the primaries spread like fingers past the tip. Folded along the back on the ground.
    const beat = (A.wing ?? 0) > 0.5 ? Math.sin(A.flap * TAU) * 0.8 : 0.08, half = span / 2 - 0.12, k = span / 1.6;
    for (const s of SIDES) {
      if (standing || a.dead) { this.part(a.x + rx * 0.1 * s - fx * 0.04, bodyY + 0.03, a.z + rz * 0.1 * s - fz * 0.04, 0.08, 0.1, L * 0.85, f, 0, 0.3 * s, B.wing); continue; }
      const up = beat - roll * s, c = Math.cos(up), sn = Math.sin(up);
      const sx = a.x + rx * s * 0.07, sz = a.z + rz * s * 0.07;
      this.wingAt(sx, bodyY, sz, half, 0.42 * k, s > 0 ? f : f + Math.PI, up, B.wing);
      // the primaries: three fingers spread past the tip (pale on a vulture's wing)
      const tx = sx + rx * s * half * c - fx * 0.03, tz = sz + rz * s * half * c - fz * 0.03, ty = bodyY + half * sn;
      for (let i = 0; i < 3; i++) { const sp = (i - 1) * 0.3 - 0.12, fd = f + s * (Math.PI / 2) - s * sp; this.part(tx + Math.sin(fd) * 0.09 * k, ty, tz + Math.cos(fd) * 0.09 * k, 0.045 * k, 0.015, 0.2 * k, fd, 0, s * up, B.tipc ?? B.wing); }
    }
  }
  wingAt(x, y, z, sx, chord, yaw, roll, hex) {
    if (this.nw >= MAXW) return;
    _e.set(0, yaw, roll, 'YXZ'); _q.setFromEuler(_e);
    _M.compose(_v.set(x, y, z), _q, _s.set(sx, 1, chord));
    this.wing.setMatrixAt(this.nw, _M); this.wing.setColorAt(this.nw++, _c.set(hex));
  }

  // A gator: a long low body in segments (the tail swings as it swims), a flat snout that opens, four splayed legs; in
  // the water only its back and eyes break the surface. In a death roll the whole of it turns over.
  gator(a, t) {
    const B = a.B, A = a.a, f = a.face, fx = Math.sin(f), fz = Math.cos(f), rx = Math.cos(f), rz = -Math.sin(f);
    const K = (a.len ?? 3.2) / 3.4, y0 = a.dead ? 0.1 : a.y + 0.13 * K, roll = a.dead ? Math.PI : A.roll ?? 0;
    const col = Array.isArray(B.coat) ? B.coat[Math.floor((a.var ?? 0) * B.coat.length) % B.coat.length] : B.coat;
    const sway = a.speed > 0.2 ? 0.9 : 0.15;
    // Along the spine, nose (+) to tail (-): [offset, length, width, height]
    const SEG = GATOR_SEG;
    let ang = f, px = a.x - fx * 0.18 * K, pz = a.z - fz * 0.18 * K;
    for (let i = 0; i < SEG.length; i++) {
      const [o, l, w, h] = SEG[i];
      let x, z, yaw = f;
      if (o >= -0.2) { x = a.x + fx * o * K; z = a.z + fz * o * K; }
      else {
        // The tail: each segment hangs off the last, swinging a little more than the one before.
        ang += Math.sin(A.phase * TAU - i * 0.8) * sway * 0.3;
        const step = (SEG[i - 1][1] + l) * 0.5 * K;
        px -= Math.sin(ang) * step; pz -= Math.cos(ang) * step; x = px; z = pz; yaw = ang;
      }
      if (i === 3) { px = x; pz = z; }
      this.part(x, y0, z, w * K, h * K, l * K * 1.3, yaw, 0, roll, col); // overlapped: one long body, not a string of beads
      // The scutes: a dark ridge of plates down the back and the tail.
      if (i >= 1 && i <= 6) this.part(x, y0 + h * K * 0.45, z, w * K * 0.45, h * K * 0.25, l * K * 1.1, yaw, 0, roll, B.ridge ?? col);
    }
    // The snout: long, flat and paler on top at the tip.
    this.part(a.x + fx * 1.62 * K, y0 - 0.01, a.z + fz * 1.62 * K, 0.2 * K, 0.1 * K, 0.36 * K, f, 0.04, roll, col);
    // The jaw: the lower half of the snout drops when it opens.
    if ((A.jaw ?? 0) > 0.1) this.part(a.x + fx * 1.25 * K, y0 - 0.06 * K, a.z + fz * 1.25 * K, 0.22 * K, 0.06 * K, 0.48 * K, f, A.jaw * 0.6, roll, B.belly);
    // Eyes: two bumps behind the snout (all you see at night, in the water).
    for (const s of SIDES) this.part(a.x + fx * 0.95 * K + rx * 0.11 * s * K, y0 + 0.08 * K, a.z + fz * 0.95 * K + rz * 0.11 * s * K, 0.07 * K, 0.06 * K, 0.08 * K, f, 0, 0, '#1a2214');
    // Legs: short, out to the sides, stepping as it walks.
    if (!a.water || a.dead) for (let i = 0; i < 4; i++) {
      const front = i < 2, s = i % 2 ? 1 : -1, o = front ? 0.62 : -0.2, step = Math.sin(A.phase * TAU + (front ? 0 : Math.PI) + (s > 0 ? Math.PI : 0)) * 0.12 * (a.speed > 0.2 ? 1 : 0);
      const hx = a.x + fx * o * K + rx * 0.24 * s * K, hz = a.z + fz * o * K + rz * 0.24 * s * K;
      this.link(hx, y0 - 0.02, hz, hx + rx * 0.22 * s * K + fx * step, 0.03, hz + rz * 0.22 * s * K + fz * step, 0.11 * K, col);
    }
  }

  // The swarm: sparks in a churning cloud round its centre (a pure function of time, nothing stored).
  swarm(a, t, night) {
    if (a.state === 'settled' || night < 0.3) return;
    const B = a.B, n = B.n ?? 36, r = a.sw?.r ?? 1.6;
    for (let i = 0; i < n; i++) {
      const p = i * 2.399 + a.seed, u = t * (0.7 + (i % 5) * 0.17) + p;
      const x = a.x + Math.sin(u) * r * (0.35 + 0.65 * Math.abs(Math.sin(p * 1.7))), z = a.z + Math.cos(u * 1.13) * r * (0.35 + 0.65 * Math.abs(Math.cos(p))), y = 0.6 + Math.sin(u * 1.7 + p) * 0.5 + (i % 3) * 0.25;
      this.glint(x, y, z, 0.035 + (i % 4) * 0.008, i % 4 ? B.glow : B.core);
    }
  }

  // The Glassling: a flat pale crawler on six jointed legs with plates of fused glass on its back. Buried, all you see
  // is a few glass edges flush with the sand.
  crawler(c, t, night) {
    const S = SPECIES.glassling, B = S.body, f = c.face ?? 0, fx = Math.sin(f), fz = Math.cos(f), rx = Math.cos(f), rz = -Math.sin(f);
    const buried = !!c.hf?.buried && c.alive, dead = !c.alive, y0 = dead ? 0.12 : 0.34;
    c._fp = ((c._fp ?? 0) + (c.speed ?? 0) * 0.02 * 2.2) % 1;
    if (buried) { for (let i = 0; i < 4; i++) this.part(c.x + rx * (i - 1.5) * 0.18, 0.02, c.z + rz * (i - 1.5) * 0.18 + fz * ((i % 2) * 0.1), 0.2, 0.03, 0.12, f + i * 0.4, 0, 0.3, B.glass); return; }
    this.part(c.x, y0, c.z, 0.62, 0.2, 0.95, f, 0, dead ? Math.PI : 0, B.coat);
    this.part(c.x + fx * 0.55, y0 + 0.02, c.z + fz * 0.55, 0.3, 0.16, 0.26, f, 0.15, 0, B.dark);
    // The glass on its back: plates set at angles, catching the light.
    for (let i = 0; i < 5; i++) { const o = (i - 2) * 0.17, side = (i % 2 ? 1 : -1) * 0.09; this.part(c.x + fx * o + rx * side, y0 + 0.17, c.z + fz * o + rz * side, 0.2, 0.04, 0.16, f + (i - 2) * 0.35, 0.35 * (i % 2 ? 1 : -1), 0.5 * (i % 2 ? -1 : 1), i % 2 ? B.glass : B.shine); }
    // Six legs: a tripod gait (three down while three swing).
    for (let i = 0; i < 6; i++) {
      const s = i % 2 ? 1 : -1, row = Math.floor(i / 2), o = (1 - row) * 0.3, ph = (c._fp + (((i + row) % 2) ? 0.5 : 0)) * TAU;
      const sw = Math.sin(ph) * 0.14 * Math.min(1, (c.speed ?? 0) / 1.2), lift = Math.max(0, Math.cos(ph)) * 0.08 * Math.min(1, (c.speed ?? 0) / 1.2);
      const hx = c.x + fx * o + rx * 0.28 * s, hz = c.z + fz * o + rz * 0.28 * s;
      const kx = hx + rx * 0.3 * s + fx * sw * 0.5, kz = hz + rz * 0.3 * s + fz * sw * 0.5;
      const ex = hx + rx * 0.55 * s + fx * sw, ez = hz + rz * 0.55 * s + fz * sw;
      this.link(hx, y0, hz, kx, dead ? 0.2 : y0 + 0.2, kz, 0.06, B.dark);
      this.link(kx, dead ? 0.2 : y0 + 0.2, kz, ex, dead ? 0.15 : 0.02 + lift, ez, 0.045, B.coat);
    }
    if (night > 0.4 && !dead) for (const s of SIDES) this.glint(c.x + fx * 0.68 + rx * 0.07 * s, y0 + 0.06, c.z + fz * 0.68 + rz * 0.07 * s, 0.03, B.eyes);
  }

  // The Lantern: a small pale body slung low between four long jointed stilts (from above, a great four-armed cross), a
  // thin neck, and the lamp of a head that lights at night.
  stilt(c, t, night) {
    const S = SPECIES.lantern, B = S.body, f = c.face ?? 0, fx = Math.sin(f), fz = Math.cos(f), rx = Math.cos(f), rz = -Math.sin(f);
    const dead = !c.alive, by = dead ? 0.3 : 1.45 + Math.sin(t * 1.3) * 0.04;
    c._fp = ((c._fp ?? 0) + (c.speed ?? 0) * 0.016 * 0.9) % 1;
    this.part(c.x, by, c.z, 0.36, 0.3, 0.5, f, dead ? 1.4 : 0.1, 0, B.coat);
    this.part(c.x - fx * 0.36, by - 0.12, c.z - fz * 0.36, 0.28, 0.26, 0.42, f, -0.2, 0, B.dark);
    for (let i = 0; i < 4; i++) {
      const s = i % 2 ? 1 : -1, front = i < 2, ph = (c._fp + (i === 0 || i === 3 ? 0 : 0.5)) * TAU, lift = Math.max(0, Math.sin(ph)) * 0.25 * Math.min(1, (c.speed ?? 0) / 0.6);
      const hx = c.x + fx * (front ? 0.15 : -0.15) + rx * 0.14 * s, hz = c.z + fz * (front ? 0.15 : -0.15) + rz * 0.14 * s;
      const o = front ? 1 : -1, kx = hx + rx * 0.85 * s + fx * 0.6 * o, kz = hz + rz * 0.85 * s + fz * 0.6 * o;
      const ex = hx + rx * 1.5 * s + fx * 1.15 * o + fx * Math.cos(ph) * 0.2, ez = hz + rz * 1.5 * s + fz * 1.15 * o + fz * Math.cos(ph) * 0.2;
      this.link(hx, by, hz, kx, dead ? 0.6 : 2.5, kz, 0.07, B.coat);
      this.link(kx, dead ? 0.6 : 2.5, kz, ex, dead ? 0.05 : 0.02 + lift, ez, 0.05, B.dark);
    }
    const hx = c.x + fx * 0.06, hz = c.z + fz * 0.06, hy = dead ? 0.3 : 1.75; // the lamp rides over the body (hotground.js's glint is there too)
    this.link(c.x + fx * 0.2, by + 0.1, c.z + fz * 0.2, hx, hy, hz, 0.06, B.coat);
    this.part(hx, hy, hz, 0.2, 0.22, 0.2, f, 0, 0, dead ? B.dark : '#f2f0d8');
    if (!dead) this.glint(hx, hy, hz, 0.12 + 0.12 * night, B.glow);
  }
}
