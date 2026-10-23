// The streamed regions' life (docs/design/WEB_FLORIDA.md): where a new character starts and wakes, a holdout's people,
// the region's animals and its infected. Rows: data/regions.js (REGIONS, START, FAUNA), data/holdouts.js (HOLDOUTS,
// PEOPLE), data/meridian-talk.js (what Meridian's people say). World: world/regions.js, world/holdout.js.
//   start    ?start=florida|phoenix picks where a new game begins. Players start in Florida, at Meridian, on the clinic's
//            doorstep; the agent harness and the selftest stage in Phoenix as they always have (START rows).
//   people   a holdout's people are records: promoted to characters within promoteR of its centre (named keepers at their
//            counters, deputies on the gates, townsfolk at their work), written back past demoteR (the dead stay dead,
//            the essential come back as Rust Haven's do). Traders own their shop's shelves (systems/trade.js).
//   fauna    FAUNA rows at the lairs a hot chunk's layout found (world/chunkgen.js out.life): alligators that bask on the
//            bank by day, lie in the water at night, lunge and bite what comes close, and keep to their water. A row the
//            fauna layer (WEB_WORLD_EDITOR_PLAN §3.5) absorbs: kind, where, density, and the think below.
//   infected the region's density row: herds out of sight, never inside a holdout.
//   clone    clinic(id): the clone agent's hook: the clinic's door, the clone bay's room, the wake point.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { REGIONS, START, FAUNA } from '../data/regions.js';
import { HOLDOUTS, PEOPLE } from '../data/holdouts.js';
import { MERIDIAN_TALK } from '../data/meridian-talk.js';
import { TRADERS } from '../data/trade.js';
import { outfit } from './characters.js';
import { randomName } from '../data/npcs.js';
import { waterDepth } from '../world/water.js';
import { chunkKey } from '../world/geo.js';

const pickW = (rows, r = Math.random()) => { let t = 0; for (const q of rows) t += q[1]; let p = r * t; for (const q of rows) if ((p -= q[1]) < 0) return q[0]; return rows[rows.length - 1][0]; };
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ'), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();

// Where a new game starts: the URL's ?start=, else the agent harness's row (phoenix) or the player's (florida).
export function startRegion() {
  try {
    const q = new URLSearchParams(location.search), s = q.get('start');
    if (s === 'florida' || s === 'phoenix') return s;
    return q.has('agent') || q.has('autostart') ? START.agent : START.player;
  } catch { return START.agent; }
}

// An alligator, built from boxes (nose along +z, 3.4 m long), vertex-coloured: one draw (+ shadow) for every one alive.
function gatorGeometry() {
  const parts = [];
  const B = (w, h, l, x, y, z, col, ry = 0) => { const g = new THREE.BoxGeometry(w, h, l); g.rotateY(ry); g.translate(x, y, z); const c = new THREE.Color(col), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); parts.push(g); };
  const back = '#40502c', dark = '#2c3820', belly = '#b8b08a';
  B(0.82, 0.34, 1.35, 0, 0.26, 0.1, back);           // body
  B(0.7, 0.08, 1.2, 0, 0.1, 0.1, belly);             // belly plate
  B(0.52, 0.26, 0.62, 0, 0.27, 0.98, back);          // head
  B(0.34, 0.15, 0.62, 0, 0.21, 1.56, dark);          // snout
  B(0.36, 0.05, 0.5, 0, 0.13, 1.55, belly);          // jaw
  for (const s of [-1, 1]) B(0.1, 0.1, 0.12, s * 0.2, 0.43, 1.12, '#c8b24a');  // eyes on top of the head
  B(0.56, 0.28, 0.72, 0, 0.24, -0.88, back);         // tail, tapering
  B(0.38, 0.21, 0.68, 0, 0.21, -1.55, back);
  B(0.2, 0.14, 0.6, 0, 0.18, -2.15, dark);
  for (let k = 0; k < 7; k++) for (const s of [-1, 1]) B(0.09, 0.08, 0.16, s * 0.18 * (1 - k / 9), 0.45 - k * 0.025, 0.55 - k * 0.42, dark); // scutes
  for (const [x, z, r] of [[0.5, 0.5, 0.6], [-0.5, 0.5, -0.6], [0.5, -0.35, -0.5], [-0.5, -0.35, 0.5]]) B(0.36, 0.16, 0.2, x, 0.1, z, back, r); // splayed legs
  const g = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  return g;
}

export class Regions {
  constructor(game) {
    this.g = game;
    this.W = game.streamer.W;
    this.start = startRegion();
    // Factions: each holdout's own, and the wild (animals: nobody's people, killing one is no deed against anyone).
    const F = game.society.factions;
    F.register('wildlife', { name: 'Wildlife', archetype: 'loose', color: '#6a7a4a', start: 0, memory: 'none', relations: { '*': 0 }, values: {} });
    for (const H of Object.values(HOLDOUTS)) F.register(H.faction.id, { name: H.faction.name, archetype: 'town', color: H.faction.color, start: H.faction.start, stars: true, forgivesSelfDefense: true,
      cohesion: 0.7, memoryDays: 14, hub: null, leaders: PEOPLE[H.id]?.named.filter((p) => p.essential).map((p) => p.id) ?? [],
      relations: { infected: -100, dustwolves: -100, drifters: 30, rusthaven: 20, wildlife: 0 },
      values: { 'kill:self': -9, 'hurt:self': -2, 'carjack:self': -4, 'steal:self': -3, 'destroy:self': -3, 'rob:self': -5, 'kill:enemy': 1, 'rescue:self': 5, 'deliver:self': 4, 'trade:self': 0.5, 'defend:self': 4, 'pay:self': 2, 'heal:self': 3, 'heal:any': 1 } });
    // A holdout's traders deal like Rust Haven's (data/trade.js rows, by the person's id).
    for (const P of Object.values(PEOPLE)) for (const n of P.named) if (n.trades) TRADERS[n.id] = { name: n.name.split(' ')[0], deals: n.trades.deals };
    // Holdouts' records.
    this.towns = this.W.holdouts.map((H) => this.makeTown(H));
    this.fauna = new Map();   // lair key -> { c, kind, dead: day it died }
    this.spawnT = 3; this.herdT = 6; this.ownT = 0; this.seq = 0;
    this.stats = { faunaSpawned: 0, faunaKilled: 0, herds: 0, promoted: 0 };
    // The animals' renderer.
    const geo = gatorGeometry();
    this.gatorMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.02 });
    this.gatorMesh = new THREE.InstancedMesh(geo, this.gatorMat, 48);
    this.gatorMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(48 * 3).fill(1), 3);
    this.gatorMesh.count = 0; this.gatorMesh.visible = false; this.gatorMesh.frustumCulled = false; this.gatorMesh.castShadow = true; this.gatorMesh.receiveShadow = true;
    this.gatorMesh.name = 'fauna:gator';
    game.scene.add(this.gatorMesh);
  }

  // ---- a holdout's people as records ------------------------------------------------------------------------------
  makeTown(H) {
    const P = PEOPLE[H.id], recs = [];
    if (!P) return { H, recs, live: false };
    let seed = H.seed;
    const rnd = () => { seed = (Math.imul(seed ^ (seed >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0; return seed / 4294967296; };
    for (const n of P.named) recs.push({ id: n.id, named: n, kind: 'named', at: n.at, alive: true });
    const D = P.deputies;
    for (let i = 0; i < D.count; i++) recs.push({ id: `${H.id}_dep${i}`, kind: 'deputy', spot: D.spots[i % D.spots.length], weapon: pickW(D.weapon, rnd()), hp: D.hp, name: randomName(rnd), flag: pickW(P.flags, rnd()), alive: true });
    for (const f of P.folk) for (let i = 0; i < f.count; i++) recs.push({ id: `${H.id}_${f.job.replace(/\W+/g, '')}${i}`, kind: 'folk', job: f.job, spot: f.spot, n: i, name: randomName(rnd), flag: pickW(P.flags, rnd()), alive: true, jit: [rnd() - 0.5, rnd() - 0.5] });
    return { H, P, recs, live: false };
  }

  // Inside a lot: a point just in from its front door (a keeper's post at the counter side of the front room).
  postOf(L) {
    const geo = this.W.ring.geo(L), d = geo.doors.find((q) => q.kind === 'front' || q.kind === 'bay') ?? geo.doors[0];
    if (!d) return { x: L.cx, z: L.cz, face: 0 };
    return { x: d.x - d.nx * 2.2, z: d.z - d.nz * 2.2, face: Math.atan2(d.nx, d.nz), door: { x: d.x + d.nx * 2.4, z: d.z + d.nz * 2.4 } };
  }

  promote(T) {
    const g = this.g, H = T.H;
    T.live = true;
    for (const r of T.recs) {
      if (r.c || (!r.alive && !(r.named?.essential))) continue;
      let x, z, face = 0, hold = false;
      if (r.kind === 'named') { const L = H.lotOf(r.at); if (!L) continue; const p = this.postOf(L); x = p.x; z = p.z; face = p.face; hold = true; r.lot = L; }
      else { const list = H.spots[r.spot], sp = list?.[(r.n ?? 0) % list.length]; if (!sp) continue; const j = r.jit ?? [Math.random() - 0.5, Math.random() - 0.5]; x = sp.x + j[0] * (sp.r ?? 4) * 1.6; z = sp.z + j[1] * (sp.r ?? 4) * 1.6; hold = r.kind === 'deputy' || r.job === 'patient' || r.job === 'stallkeeper'; }
      const n = r.named;
      const arche = r.kind === 'deputy' || n?.job === 'sheriff' ? 'warden' : 'drifter';
      const opts = { x, z, faction: arche, weapon: n ? n.weapon ?? null : r.weapon ?? (r.kind === 'folk' && r.job === 'pit fighter' ? null : null), hp: n ? 140 : r.hp ?? 100, name: n ? n.name : r.name, flag: n ? n.flag : r.flag };
      if (n) {
        const p = n.portrait, talk = MERIDIAN_TALK[n.id] ?? { start: 'hi', nodes: { hi: { text: 'Not now.', choices: [{ t: '[Leave]', end: true }] } } };
        opts.npc = { id: n.id, name: n.name, title: n.title, flag: n.flag, faction: arche, essential: !!n.essential, portrait: p, ...talk };
        opts.colors = { skin: p.skin, hair: p.hair, shirt: p.shirt ?? '#5a4a38', pants: '#2f2a24', boots: '#2b241e', hat: '#5a3f24',
          hatStyle: ['cowboy', 'cap', 'mohawk', 'wrap', 'long', 'bald'].includes(p.hat) ? p.hat : 'short',
          gearStyle: p.gear === 'bandolier' ? 'bandolier' : arche === 'warden' ? 'vest' : 'none', gear: '#3a3128',
          accStyle: { goggles: 'goggles', bandana: 'mask', eyepatch: 'eyepatch' }[p.gear] ?? 'none', mask: '#6a2a1e', sleeves: 'short' };
      } else opts.colors = outfit(arche);
      const c = g.addChar(opts);
      if (!c) continue;
      c.fid = H.faction?.id ?? H.row.faction.id; g.society.factions.assign(c);
      c.face = face; c.home = { x, z }; c.holdout = H.id; c.rec = r.id;
      if (hold) c.hold = true;
      if (r.kind === 'deputy') c.post = { x, z };
      if (!r.alive && n?.essential) r.alive = true; // the essential are back on their feet (as Rust Haven's)
      r.c = c;
      this.stats.promoted++;
    }
    // The town's vehicles, once: a pickup in the garage's yard, the boats at the landing.
    if (!T.vehicles) {
      T.vehicles = [];
      const pk = H.parking;
      if (pk) T.vehicles.push(g.vehiclesSys.spawn('pickup', pk.x, pk.z, 0, '#56603f'));
      for (const b of H.boats ?? []) T.vehicles.push(g.vehiclesSys.spawn(b.type, b.x, b.z, b.h, b.paint));
    }
    g.emit('holdoutPromoted', { holdout: H.id, people: T.recs.filter((r) => r.c).length });
  }
  demote(T) {
    const g = this.g;
    T.live = false;
    for (const r of T.recs) {
      if (!r.c) continue;
      r.alive = r.c.alive || (r.c.downedT > 0);
      if (g.chars.includes(r.c)) g.removeChar(r.c);
      r.c = null;
    }
  }

  // A trader's shelves and crates are theirs while they keep shop (the island's rule, systems/inventory.js).
  claimShelves(T) {
    const inv = this.g.inventory;
    if (!inv) return;
    for (const r of T.recs) {
      if (!r.c?.alive || !r.named?.trades || !r.lot) continue;
      const L = r.lot;
      for (const box of inv.boxes.values()) if (box.ring && !box.owner && box.x > L.x0 && box.x < L.x1 && box.z > L.z0 && box.z < L.z1) { box.owner = r.c.id; box.ownerName = r.named.name; }
    }
  }

  // ---- where a new character starts, and wakes -------------------------------------------------------------------
  // The clone agent's hook: the clinic of holdout id (default the first) - its front door outside, the clone bay's room
  // and a wake point in it, the doctor's id. Pure: the holdout's layout and the ring's geo.
  clinic(id) {
    const T = id ? this.towns.find((t) => t.H.id === id) : this.towns[0];
    if (!T) return null;
    const H = T.H, C = H.row.clinic, L = H.lotOf(C.lot), B = H.lotOf(C.bay);
    if (!L) return null;
    const p = this.postOf(L), bay = B ? this.W.ring.geo(B).rooms.find((r) => r.type === 'clonebay') ?? null : null;
    return { holdout: H.id, door: p.door ?? { x: L.cx, z: L.z1 + 3 }, inside: { x: p.x, z: p.z }, lot: L.id, bay: bay ? { x0: bay.x0, z0: bay.z0, x1: bay.x1, z1: bay.z1, wake: { x: (bay.x0 + bay.x1) / 2, z: (bay.z0 + bay.z1) / 2 }, lot: B.id } : null, doctor: C.doctor, fee: C.fee };
  }
  // Put the player at a holdout's clinic door (a new game, ?start=florida). Lays the ground out first.
  placeAtStart(where = this.start) {
    if (where !== 'florida') return false;
    const g = this.g, H = this.W.holdouts.find((h) => h.R.id === 'florida');
    if (!H) return false;
    // Lay out the town first (its geo is what the clinic's door is read from).
    g.streamer.ensureHot(H.cx, H.cz, 'load');
    const cl = this.clinic(H.id), d = cl?.door ?? { x: H.cx, z: H.cz };
    g.streamer.ensureHot(d.x, d.z, 'load');
    const p = g.player;
    if (p.inVehicle) g.exitVehicle(true);
    const pos = { x: d.x, z: d.z };
    g.statics.resolveCircle(pos, 0.5);
    p.x = pos.x; p.z = pos.z; p.gy = 0; p.storey = null; p.face = 0;
    g.camLook.x = p.x; g.camLook.z = p.z; g.camPos.x = p.x; g.camPos.z = p.z + 6;
    const T = this.towns.find((t) => t.H === H);
    if (T && !T.live) this.promote(T);
    this.startedAt = H.id;
    g.emit('regionStart', { region: 'florida', holdout: H.id, x: +p.x.toFixed(1), z: +p.z.toFixed(1) });
    return true;
  }
  // Where the player wakes after going down: a region's holdout clinic when they fell in that region.
  respawnPoint(p) {
    const R = this.W.regionOf(p.x, p.z, 3000);
    if (!R) return null;
    const T = this.towns.find((t) => t.H.R === R);
    const cl = T && this.clinic(T.H.id);
    if (!cl) return null;
    this.g.streamer.ensureHot(cl.door.x, cl.door.z, 'load');
    const doc = PEOPLE[T.H.id]?.named.find((n) => n.id === cl.doctor);
    return { x: cl.door.x, z: cl.door.z, fee: cl.fee, who: doc?.name ?? 'The clinic', holdout: T.H.id };
  }
  // The title's line and the first toasts for where the game starts.
  intro() {
    if (this.start !== 'florida') return null;
    return { tag: 'OF AMERICA · MERIDIAN, FLORIDA · THE UNION IS GONE. THE ROADS REMAIN.', toast: 'You wake up in Meridian, Florida. Sheriff Duarte keeps the peace from the office on Main Street.', sub: 'The garage has a pickup in its yard. Lucien says bring it back with gas in it.' };
  }

  // ---- per frame ------------------------------------------------------------------------------------------------------
  update(dt) {
    const g = this.g, P = g.player, S = g.streamer;
    // Holdouts' people: in when you come near, back on their records when you leave.
    for (const T of this.towns) {
      if (!T.P) continue;
      const d = Math.hypot(P.x - T.H.cx, P.z - T.H.cz);
      if (!T.live && d < T.P.promoteR && S.hot.size) this.promote(T);
      else if (T.live && d > T.P.demoteR) this.demote(T);
    }
    if ((this.ownT -= dt) <= 0) { this.ownT = 1; for (const T of this.towns) if (T.live) this.claimShelves(T); }
    // Kills of the region's animals (for the jobs that count them).
    for (let i = g.events.length - 1; i >= 0 && g.events[i].seq > this.seq; i--) {
      const e = g.events[i];
      // (the fauna layer's gators count too: systems/fauna.js faunaKilled)
      if ((e.type === 'kill' && e.faction === 'fauna') || (e.type === 'faunaKilled' && e.species === 'gator')) { this.stats.faunaKilled++; if (e.by === P.id) { g.stats.gators = (g.stats.gators ?? 0) + 1; if (g.quests.canal === 'active') { const k = g.stats.gators - (g.quests.canalStart ?? 0); g.hud.toast(k >= 2 ? 'CANAL CLEAR - back to Sheriff Duarte' : `Clear the Canal ${k}/2`, 'job'); } } }
    }
    this.seq = g.eventSeq;
    const R = S.region;
    if ((this.spawnT -= dt) <= 0) { this.spawnT = 1.5; this.faunaPass(R); }
    if (R?.row.life?.infected && (this.herdT -= dt) <= 0) { this.herdT = R.row.life.infected.every; this.herdPass(R); }
    this.render(dt);
  }

  // The animals: spawn at the lairs of hot chunks near you, despawn far away. A lair's animal killed stays dead that day.
  faunaPass(R) {
    const g = this.g, P = g.player, S = g.streamer, day = g.society?.day ?? 0;
    for (const [key, f] of this.fauna) {
      const c = f.c;
      if (c && (!g.chars.includes(c) || (c.alive && Math.hypot(c.x - P.x, c.z - P.z) > 360))) { if (g.chars.includes(c)) g.removeChar(c); f.c = null; }
      if (c && !c.alive && f.dead === undefined) f.dead = day;
      if (!f.c && f.dead !== undefined && f.dead !== day) this.fauna.delete(key);
    }
    if (!R?.row.life) return;
    if (g.fauna?.enabled) return; // the fauna layer (systems/fauna.js) spawns the region's animals from these same rows
    let live = 0; for (const f of this.fauna.values()) if (f.c?.alive) live++;
    const cap = R.row.life.fauna[0]?.max ?? 12;
    for (const L of S.hot.values()) {
      if (!L.life) continue;
      for (let i = 0; i < L.life.length && live < cap; i++) {
        const lr = L.life[i], key = `${L.key}:${i}`;
        if (this.fauna.has(key)) continue;
        if (Math.hypot(lr.x - P.x, lr.z - P.z) > 260) continue;
        const c = this.spawnFauna(lr.kind, lr.x, lr.z);
        if (c) { this.fauna.set(key, { c, kind: lr.kind }); live++; }
      }
    }
  }
  spawnFauna(kind, x, z) {
    const g = this.g, F = FAUNA[kind];
    if (!F) return null;
    const c = g.addChar({ x, z, faction: 'fauna', weapon: null, hp: F.hp, colors: outfit('drifter'), name: F.name, flag: 'US' });
    if (!c) return null;
    c.ownMesh = true; c.fauna = F; c.faunaKind = kind; c.lair = { x, z }; c.radius = 0.85;
    c.size = F.size[0] + Math.random() * (F.size[1] - F.size[0]);
    c.tint = F.colors[Math.floor(Math.random() * F.colors.length)];
    c.fid = 'wildlife'; g.society.factions.assign(c);
    c.fs = { state: 'rest', t: 0, cool: 0 };
    c.face = Math.random() * 6.283;
    this.stats.faunaSpawned++;
    g.emit('faunaSpawned', { id: c.id, kind, x: +x.toFixed(1), z: +z.toFixed(1) });
    return c;
  }

  // An alligator's mind (ai.js hands every `fauna` character here). Basks on the bank by day, lies in the water at night;
  // notices the living that come close to its water, closes in (fast in water, slower on land), lunges and bites, and
  // goes back to its water when the target is gone or it has strayed past its leash.
  think(c, dt) {
    const g = this.g, F = c.fauna, s = c.fs, night = g.sky?.night ?? 0;
    s.cool -= dt; s.t -= dt;
    const inWater = waterDepth(c.x, c.z) > 0.3;
    const leashD = Math.hypot(c.x - c.lair.x, c.z - c.lair.z);
    // The nearest living thing (not its own kind, not in a car, not in a building) within notice.
    if (s.t <= 0 || !s.target?.alive) {
      s.t = 0.5;
      let best = null, bd = F.notice * (night > 0.5 ? 1.4 : 1);
      for (const o of g.chars) {
        if (!o.alive || o.fauna || o.hidden || o.inVehicle || o === c) continue;
        const d = Math.hypot(o.x - c.x, o.z - c.z);
        if (d < bd && Math.hypot(o.x - c.lair.x, o.z - c.lair.z) < F.leash) { bd = d; best = o; }
      }
      s.target = best;
    }
    const t = s.target;
    if (s.state === 'lunge') {
      // A short burst straight at where it was going.
      g.ai.move(c, s.lx - c.x, s.lz - c.z, F.lunge, dt);
      if (t && Math.hypot(t.x - c.x, t.z - c.z) < 1.0 + c.size * 0.35 && s.cool <= 0) {
        const d = Math.hypot(t.x - c.x, t.z - c.z) || 1;
        g.combat.damage(t, F.bite, c, (t.x - c.x) / d, (t.z - c.z) / d, 'bite');
        s.cool = F.biteEvery; s.state = 'back'; s.t2 = 2.5;
        g.emit('faunaBite', { id: c.id, target: t.id });
      }
      if ((s.lt -= dt) <= 0) { s.state = 'back'; s.t2 = 1.5; }
      return;
    }
    if (t && leashD < F.leash && s.state !== 'back') {
      const d = Math.hypot(t.x - c.x, t.z - c.z);
      c.face = Math.atan2(t.x - c.x, t.z - c.z);
      if (d < F.lungeRange + c.size * 0.3 && s.cool <= 0) { s.state = 'lunge'; s.lt = 0.45; s.lx = t.x + (t.x - c.x) / (d || 1) * 1.5; s.lz = t.z + (t.z - c.z) / (d || 1) * 1.5; g.emit('faunaLunge', { id: c.id, target: t.id }); return; }
      g.ai.move(c, t.x - c.x, t.z - c.z, inWater ? F.swim * 1.5 : F.land, dt);
      s.state = 'stalk';
      return;
    }
    if (s.state === 'back') { if ((s.t2 -= dt) <= 0) s.state = 'rest'; }
    // Rest: back to the lair (the water), then by day crawl out onto the nearest bank and lie still; by night drift.
    if (leashD > 6) { g.ai.move(c, c.lair.x - c.x, c.lair.z - c.z, inWater ? F.swim : F.land * 0.7, dt); return; }
    if (night < 0.5 && !s.bank) {
      // Find a bank spot a few metres off, once.
      for (let k = 0; k < 10 && !s.bank; k++) { const a = Math.random() * 6.283, r = 4 + Math.random() * 6, x = c.lair.x + Math.cos(a) * r, z = c.lair.z + Math.sin(a) * r; if (waterDepth(x, z) <= 0.05 && g.nav.foot.free?.(x, z) !== false) s.bank = { x, z }; }
    }
    const goal = night < 0.5 && s.bank ? s.bank : null;
    if (goal && Math.hypot(goal.x - c.x, goal.z - c.z) > 1) g.ai.move(c, goal.x - c.x, goal.z - c.z, F.land * 0.35, dt);
    else c.speed = 0;
  }

  // The infected in the region: herds at the region's density, out of sight, never inside a holdout or on the water.
  herdPass(R) {
    const g = this.g, P = g.player, I = R.row.life.infected, night = g.sky.night;
    if (g.time < 180 || !g.zombies?.enabled) return; // a new arrival gets a quiet start (main.js ARRIVAL_QUIET)
    let n = 0; for (const c of g.chars) if (c.faction === 'zombie' && c.alive && Math.hypot(c.x - P.x, c.z - P.z) < 260) n++;
    const cap = Math.round(I.cap * (night > 0.6 ? 1 : 0.45));
    if (n >= cap || g.freeSlots.length <= 12) return;
    for (let tries = 0; tries < 10; tries++) {
      const a = Math.random() * 6.283, r = Math.max(70, (g.viewR ?? 0) + 14) + Math.random() * 70, x = P.x + Math.cos(a) * r, z = P.z + Math.sin(a) * r;
      if (!R.inBox(x, z, -300) || waterDepth(x, z) > 0.2) continue;
      if (R.holdouts.some((h) => h.inCity(x, z, 90))) continue;
      if (g.nav.foot.free && !g.nav.foot.free(x, z)) continue;
      const [lo, hi] = night > 0.6 ? I.nightHerds : I.dayHerds, k = lo + Math.floor(Math.random() * (hi - lo + 1));
      g.zombies.horde(x, z, Math.round(k * I.density / 1.6), I.runners, 6);
      this.stats.herds++;
      g.emit('hordeSpawned', { x: Math.round(x), z: Math.round(z), region: R.id });
      break;
    }
  }

  // The animals on screen: one instanced mesh, low in the water when they are in it, belly up when dead.
  render(dt) {
    const m = this.gatorMesh;
    let n = 0;
    for (const f of this.fauna.values()) {
      const c = f.c;
      if (!c || n >= 48) continue;
      const wet = waterDepth(c.x, c.z), sub = Math.min(0.24, wet * 0.3), k = c.size / 3.4;
      c._sw = (c._sw ?? 0) + dt * (c.speed > 0.2 ? 6 : 0.6);
      const wig = c.alive ? Math.sin(c._sw) * (c.speed > 0.2 ? 0.12 : 0.02) : 0;
      _e.set(0, c.face + wig, c.alive ? 0 : Math.PI, 'YXZ'); _q.setFromEuler(_e);
      _m.compose(_p.set(c.x, (c.alive ? -sub : 0.32 * k) + (c.gy ?? 0), c.z), _q, _s.set(k, k, k));
      m.setMatrixAt(n, _m);
      _c.set(c.tint ?? '#40502c'); _c.r = Math.min(1, _c.r * 2.4); _c.g = Math.min(1, _c.g * 2.4); _c.b = Math.min(1, _c.b * 2.4);
      m.setColorAt(n, _c);
      n++;
    }
    m.count = n; m.visible = n > 0; // no animals, no draw call
    if (n) { m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; }
  }

  // ---- reports ----------------------------------------------------------------------------------------------------
  view() {
    const g = this.g, P = g.player;
    return {
      start: this.start, startedAt: this.startedAt ?? null, region: g.streamer.region?.id ?? 'arizona',
      holdouts: this.towns.map((T) => ({ id: T.H.id, live: T.live, distance: Math.round(Math.hypot(P.x - T.H.cx, P.z - T.H.cz)),
        people: T.recs.map((r) => ({ id: r.id, kind: r.kind, name: r.named?.name ?? r.name, job: r.named?.job ?? r.job ?? (r.kind === 'deputy' ? 'deputy' : null), flag: r.named?.flag ?? r.flag, alive: r.c ? r.c.alive : r.alive, char: r.c?.id ?? null, x: r.c ? +r.c.x.toFixed(1) : null, z: r.c ? +r.c.z.toFixed(1) : null })) })),
      fauna: [...this.fauna.entries()].map(([key, f]) => ({ lair: key, kind: f.kind, id: f.c?.id ?? null, alive: !!f.c?.alive, x: f.c ? +f.c.x.toFixed(1) : null, z: f.c ? +f.c.z.toFixed(1) : null, state: f.c?.fs?.state ?? null, dead: f.dead ?? null })),
      stats: { ...this.stats },
      rows: { fauna: Object.keys(FAUNA), regions: Object.keys(REGIONS) },
    };
  }
}

export { chunkKey };
