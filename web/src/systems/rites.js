import * as THREE from 'three';
import { DECAY, BODY_FOLD, GRAVE_SICKNESS, FORMULA, YEARS, DANGER, POP, BATTLE_WORDS, CEMETERY_KINDS, CEM_LAYOUT, ARCH_BOOT_HILL, FIXED_CEMETERIES, RING_YARD,
  CALENDAR, CAUSES, EPITAPHS, BURIAL, RITES_ITEMS, SEXTON_LOOT, FUNERAL, DELIVERY } from '../data/rites.js';
import { ITEMS, LOOT } from '../data/items.js';
import { SICKNESS } from '../data/survival.js';
import { ARCHETYPES } from '../data/citygen.js';
import { SITES_BY_ID } from '../data/sites/index.js';
import { RES_NAMES } from '../data/ring.js';
import { makeRng } from '../engine/rng.js';
import { roadLines } from '../world/city.js';
import { C as CHUNK, chunkKey } from '../world/geo.js';
import { mesasOf, mesaNorm, MESA_REACH } from '../world/chunkgen.js';
import { lift } from '../engine/depthlayers.js';

// DEATH RITES (docs/design/WEB_DEATH_RITES.md, rows in data/rites.js). Three things the dead are owed:
//   bodies     a record for everyone who dies (not the infected's own loot: they carry none, but they rot all the same):
//              the game clock ages it fresh -> bloated -> rotting -> bones, faster in heat and water, slower in the cold.
//              Near you the dead character IS the body (its colours go the stage's way, characters.js paint ch.rot); out
//              of view it folds to the record and one instanced mesh draws it (swollen, then a bone pile). Nothing deletes
//              a record: only a burial, a fire or a drag moves it. Its box (body:<id>) keeps exactly what it had.
//   cemeteries every settlement and site citygen plans, the island town and the ring's quarters: sized by the formula
//              (data/rites.js FORMULA), laid out by kind (edge, on-site, family plot, a battle site's mass grave, a
//              bunker's crypt), their old graves a seeded history (names, years, causes) that new graves add to.
//   funerals   a resident who dies with family: within 1-2 game days at their quarter's yard; the family walks there
//              (residents.walk, no teleport), one of them fetches the body first, they stand at the grave, then go home.
//              Standing toward the killer drops; attending, digging and paying for a stone each count.
// What other lanes see: g.rites.onDeath / fold (main.js), graveFromCrew (crew.js), mourn (residents.js think),
// onBuilt / onReleased (citygen.js stamp/release), gone(m) (residents.js promote), deliveries (trade.js).
const CAP = 7000, FLY_CAP = 96, SHADE = 0.85, BLOOD = new THREE.Color('#4a0606'), IVORY = new THREE.Color('#d8d0b8');
const _o = new THREE.Object3D(), _c = new THREE.Color(), _t = new THREE.Color();
const _w = { x: 0, y: 0, z: 0 }, _tl = { p: 0, r: 0 }, iron0 = '#2c2a28';
_o.rotation.order = 'YXZ'; // yaw, then the land's pitch and roll in the box's own frame (tilt())
// A wall's runs in half-size units: x -1/1 = the sides, -2/2 = the gate's posts; z -1 front (the gate's side), 1 back.
const WALL_SIDES = [[-1, -1, -2, -1], [2, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]];
const CORNERS = [[-1, 1], [1, 1], [1, -1], [-1, -1]];
const r1 = (v) => Math.round(v * 10) / 10, r2 = (v) => Math.round(v * 100) / 100;
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
// A marker from a share row { stone, cross, cairn, iron, mound } and a roll in 0..1.
const MARKERS = ['stone', 'cross', 'cairn', 'iron', 'mound'];
// Room past a cemetery's history for the graves the world will dig (data/rites.js CEM_LAYOUT.spare).
const spareOf = (count) => { const [lo, hi, f] = CEM_LAYOUT.spare; return Math.max(lo, Math.min(hi, Math.ceil(count * f))); };
const pickMarker = (mix, u) => { for (const m of MARKERS) if ((u -= mix[m] ?? 0) < 0) return m; return 'mound'; };
const stageOf = (decay) => { const S = DECAY.stages; let i = 0; while (i < S.length - 1 && decay >= S[i + 1].at) i++; return i; };

// Register this lane's items, the sexton's table and the grave sickness (new keys only: nothing that exists changes).
for (const [k, v] of Object.entries(RITES_ITEMS)) if (!ITEMS[k]) ITEMS[k] = v;
if (!LOOT.sexton) LOOT.sexton = SEXTON_LOOT;
if (!SICKNESS[DECAY.sickSickness]) SICKNESS[DECAY.sickSickness] = GRAVE_SICKNESS;

// ---- the formula (pure: a citygen plan record in, the cemetery's inputs and size out) ------------------------------------
export function cemeteryInputs(rec) {
  const rng = makeRng((rec.seed ?? hash(rec.id)) ^ 0x47524156), jit = 1 + (rng() * 2 - 1) * YEARS.jitter;
  let pop, years, danger, kind, battle = false;
  if (rec.kind === 'town') {
    const A = ARCHETYPES[rec.arch] ?? {};
    pop = A.pop ? (A.pop[0] + A.pop[1]) / 2 : 40;
    years = YEARS.age[A.age] ?? 70;
    danger = (A.damage ?? 0.4) * DANGER.town.damage + (1 - (A.defense ?? 0.3)) * DANGER.town.undefended;
    kind = ARCH_BOOT_HILL.includes(rec.arch) ? 'boot_hill' : 'town_cemetery';
  } else if (rec.kind === 'site') {
    const row = SITES_BY_ID.get(rec.site) ?? {};
    const P = row.society?.pop;
    pop = P ? (P[0] + P[1]) / 2 : POP.site[row.kind] ?? 20;
    years = YEARS.kind[row.kind] ?? 60;
    danger = (DANGER.kind[row.kind] ?? 0.3) + (row.hazards?.length ?? 0) * DANGER.perHazard;
    battle = BATTLE_WORDS.test([row.shape, row.notes, ...(row.landmarks ?? []).map((l) => l.kind)].join(' ')) || row.kind === 'fort';
    kind = row.kind === 'military' || rec.stamp === 'bunker' ? 'crypt' : battle ? 'mass_grave' : 'site_plot';
  } else if (rec.kind === 'rural') {
    pop = POP.rural[rec.arch] ?? POP.ruralDefault; years = YEARS.rural; danger = DANGER.rural; kind = 'family_plot';
  } else { // a military base
    pop = POP.base; years = YEARS.base; danger = DANGER.base; kind = 'war_graves';
  }
  years = Math.round(years * jit);
  danger = Math.min(FORMULA.dangerCap, Math.max(0, danger));
  return { pop: r1(pop), years, danger: r2(danger), kind, battle, graves: graveCount(pop, years, danger) };
}
export function graveCount(pop, years, danger) { return Math.max(FORMULA.min, Math.ceil(pop * years * FORMULA.rate * (1 + danger))); }

export class Rites {
  constructor(g) {
    this.g = g;
    this.bodies = new Map();   // record id (the dead character's id) -> body record
    this.cems = new Map();     // cemetery id -> cemetery
    this.graves = [];          // every grave dug since the world began running (the pre-seeded ones are gravesOf(cem))
    this.funerals = [];        // scheduled, under way, done (the last few kept)
    this.holes = [];           // open graves waiting for a body { id, x, z, y, cem, by, at }
    this.keep = new Map();     // 64 m cells -> placed cemeteries (the chunk generator's scatter keeps off: solid())
    if (g.streamer?.W) g.streamer.W.rites = this;
    this.news = [];            // deaths their people have not all learned yet (body records with .news)
    this.deliveries = [];      // goods that arrived at a trader by a visible source (trade.js restock draws from these)
    this.moods = {};           // place id -> gloom 0..1 (a funeral darkens it, the days lift it)
    this.lastH = null; this.tickT = 0; this.smellT = 0; this.linkT = 0; this.drawT = 0;
    this.drag = null; this.ePress = -1; this.dig = null; this.burnT = null;
    this.drawX = Infinity; this.drawZ = Infinity; this.dirty = true;
    this.stats = { died: 0, folded: 0, degraded: 0, buried: 0, burned: 0, dragged: 0, dug: 0, funerals: 0, mourners: 0, eaten: 0, sick: 0 };
    this.nextGrave = 1;
    this.planned = false;
    const scene = g.scene;
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0 }), CAP);
    this.mesh.name = 'rites';
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 3).fill(1), 3);
    this.mesh.count = 0; this.mesh.frustumCulled = false; this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    this.flies = new THREE.InstancedMesh(new THREE.BoxGeometry(0.05, 0.03, 0.05), new THREE.MeshBasicMaterial({ color: '#141210' }), FLY_CAP);
    this.flies.name = 'rites-flies'; this.flies.count = 0; this.flies.frustumCulled = false;
    this.flySrc = []; // the smelling bodies the flies circle this frame (reused)
    if (scene) { scene.add(this.mesh); scene.add(this.flies); }
  }
  hours() { return (this.g.society?.day ?? 0) * 24 + (this.g.sky?.time ?? 0); }
  ground(x, z) { const W = this.g.streamer?.W; return (Math.abs(x) <= 464 && Math.abs(z) <= 464) || !W?.groundAt ? this.g.stunts?.heightAt?.(x, z, 0) ?? 0 : W.groundAt(x, z) ?? 0; }

  // ---- bodies --------------------------------------------------------------------------------------------------------
  // main.onKill (after residents.onKill): a record for the dead, whoever they were. The player's husk is clone.js's.
  onDeath(c, attacker, cause) {
    const g = this.g;
    if (!c || c === g.player || c.npc || this.bodies.has(c.id)) return null;
    const res = c.res && c.faction !== 'zombie' ? c.res : null;
    const boxId = res ? `body:res:${res.m.key}` : c.faction === 'zombie' ? null : `body:${c.id}`;
    const by = attacker === g.player ? 'player' : attacker?.npc?.name ?? attacker?.name ?? attacker?.faction ?? cause ?? 'unknown';
    const R = {
      id: c.id, box: boxId && g.inventory?.boxes.has(boxId) ? boxId : null, name: c.npc?.name ?? c.name ?? 'SOMEBODY', flag: c.flag ?? 'US', faction: c.faction, fid: c.fid ?? null,
      x: c.x, z: c.z, y: c.gy ?? 0, face: c.face ?? 0, at: this.hours(), decay: 0, stage: 0, by, byFaction: attacker?.fid ?? attacker?.faction ?? null, cause: cause ?? 'bullet',
      colors: c.colors ? { shirt: c.colors.shirt, pants: c.colors.pants, skin: c.colors.skin } : null, c, folded: false, wet: false,
      place: this.placeOf(c.x, c.z), house: res ? res.rec.id : null, member: res ? res.m.key : null, handled: 0,
    };
    this.bodies.set(R.id, R);
    c.riteId = R.id;
    this.stats.died++;
    this.cap();
    if (res && FUNERAL.ties.includes(res.rec.kind) && res.rec.members.some((m) => !m.dead)) this.reportable(R, res.rec, c);
    return R;
  }
  // ---- what the living know (WEB_DEPTH_PLAN §0 law 6): a death is NEWS that nobody has until someone learns it --------
  // Every fact has a source, who it came from, when, and whether it names the killer. A funeral is planned from the
  // first fact; the killer's standing moves only on a fact that names them.
  reportable(R, rec, c) {
    const ch = this.g.society?.chronicle;
    let row = null;
    if (ch) for (let n = 0; n < Math.min(ch.size, 40); n++) { const r = ch.ring[(ch.head - 1 - n + ch.cap) % ch.cap]; if ((r.v === 'kill' || r.v === 'silence') && r.o === c.id) { row = r; break; } }
    R.news = { house: rec.id, facts: [], learned: null, w: row ? row.w.slice() : [], named: !!row && row.a !== '' && !row.un, at: this.hours(), told: false, standing: false };
    this.news.push(R);
    // a family member who saw it happen knows now, and knows who did it
    for (const m of rec.members) if (!m.dead && m.c?.alive && R.news.w.includes(m.c.id)) { this.learn(R, { source: 'saw it happen', who: m.name, killer: R.news.named ? R.by : null }); break; }
  }
  learn(R, f) {
    const N = R.news;
    if (!N) return null;
    const fact = { source: f.source, who: f.who ?? null, at: r2(this.hours()), killer: f.killer ?? null };
    N.facts.push(fact);
    const rec = this.g.residents?.recs.get(N.house);
    if (!N.learned && rec) {
      N.learned = fact;
      if (this.holdsFuneral(R, rec)) this.schedule(R, rec, fact);
      else { N.noFuneral = true; this.g.emit('noFuneral', { body: R.id, name: R.name, house: rec.id }); } // mourned at home; the body stays where it is
    }
    if (fact.killer === 'player' && !N.standing && rec) { N.standing = true; this.g.society?.factions?.add(rec.fid, FUNERAL.standing.killer); this.g.emit('killerKnown', { body: R.id, house: N.house, source: fact.source }); }
    this.g.emit('deathLearned', { body: R.id, name: R.name, house: N.house, ...fact });
    this.g.pulls?.deathNews?.(R, fact); // the death as word in their town's talk, and the funeral when one is set (systems/pulls.js, law 6)
    return fact;
  }
  // Once a second: does anyone of theirs learn it? By seeing the body (in sight, 25 m), finding it in their own house
  // (half an hour on: they live there), or being told by someone who saw the killing (a witness, FUNERAL.toldAfter hours on).
  hear() {
    const g = this.g, h = this.hours(), st = g.statics;
    for (let i = this.news.length - 1; i >= 0; i--) {
      const R = this.news[i], N = R.news, rec = g.residents?.recs.get(N.house);
      if (!rec || (N.learned && (N.standing || !N.named || N.told || !N.w.length))) { this.news.splice(i, 1); continue; }
      const bx = R.c ? R.c.x : R.x, bz = R.c ? R.c.z : R.z;
      if (!N.learned) {
        for (const m of rec.members) {
          const c = m.c;
          if (m.dead || !c?.alive || Math.abs(c.x - bx) > 25 || Math.abs(c.z - bz) > 25) continue;
          if (Math.hypot(c.x - bx, c.z - bz) < 25 && (!st?.lineOfSight || st.lineOfSight(c.x, c.z, bx, bz))) { this.learn(R, { source: 'saw the body', who: m.name }); break; }
        }
      }
      if (!N.learned && h - N.at >= 0.5 && rec.members.some((m) => !m.dead) && bx > rec.x0 - 6 && bx < rec.x1 + 6 && bz > rec.z0 - 6 && bz < rec.z1 + 6) this.learn(R, { source: 'found at home', who: rec.members.find((m) => !m.dead)?.name });
      if (!N.told && N.w.length && h - N.at >= FUNERAL.toldAfter) {
        N.told = true;
        const w = g.chars.find((c) => c.id === N.w[0]);
        this.learn(R, { source: 'told by a witness', who: w?.npc?.name ?? w?.name ?? 'someone who saw', killer: N.named ? R.by : null });
      }
    }
  }
  // Somebody tells them (the player, standing at one of the family: rites action=report).
  tell(R, who = 'player') {
    if (!R?.news) return { ok: false, why: 'nobody has family waiting on that one' };
    const f = this.learn(R, { source: who === 'player' ? 'told by you' : `told by ${who}`, who });
    if (!this.news.includes(R)) this.news.push(R);
    return { ok: true, fact: f, funeral: this.funerals.find((F) => F.body === R.id) ?? null };
  }

  // main.removeChar: a dead character leaves the world (far, the budget, a demote): the record keeps the body.
  fold(c) {
    const R = this.bodies.get(c.riteId ?? c.id);
    if (!R || R.c !== c) return;
    R.x = c.x; R.z = c.z; R.y = c.gy ?? R.y; R.face = c.face ?? R.face;
    R.pose = c.rag?.phase === 'still' && !c.rag.on ? Array.from(c.rag.P) : R.pose ?? null; // how it lay (systems/deaths.js), for when it is a character again
    R.c = null; R.folded = true; this.stats.folded++; this.dirty = true;
    const m = this.memberOf(R); if (m) { m.x = r2(R.x); m.z = r2(R.z); if (R.stage >= 3) m.gone = true; } // the household brings the body back as itself near you (link() finds it); bones are ours
  }
  memberOf(R) { if (!R.house) return null; const rec = this.g.residents?.recs.get(R.house); return rec?.members.find((m) => m.key === R.member) ?? null; }
  gone(m) { return !!m?.gone; }
  // The grapevine ate it (grapevine.js eat): the flesh is gone, the bones and whatever was on them stay.
  eaten(c) {
    const R = this.bodies.get(c.riteId ?? c.id);
    if (!R) return false;
    R.decay = Math.max(R.decay, DECAY.stages[3].at); R.stage = 3; R.eaten = true; this.stats.eaten++;
    this.fold(c); this.g.removeChar(c); this.dirty = true;
    return true;
  }
  // Over the cap: the oldest far records skip to bones (said, never silent); bones are never forgotten.
  cap() {
    let flesh = 0;
    for (const R of this.bodies.values()) if (R.stage < 3) flesh++;
    if (flesh <= BODY_FOLD.cap) return;
    const P = this.g.player, old = [...this.bodies.values()].filter((R) => R.stage < 3 && !R.c).sort((a, b) => a.at - b.at);
    for (const R of old) {
      if (flesh <= BODY_FOLD.cap) break;
      if (Math.hypot(R.x - P.x, R.z - P.z) < BODY_FOLD.foldR) continue;
      R.decay = DECAY.stages[3].at; R.stage = 3; flesh--; this.stats.degraded++; this.dirty = true;
      this.g.emit('bodyDegraded', { id: R.id, name: R.name, why: 'cap', x: r1(R.x), z: r1(R.z) });
    }
  }
  climate(hour) {
    const air = this.g.survival?.airAt?.(hour % 24) ?? 20;
    return air >= DECAY.hot ? DECAY.heat : air <= DECAY.cold ? DECAY.coldMul : 1;
  }
  // The clock moved by dh game hours: every record ages by the air each of those hours had (water on top).
  age(dh) {
    if (!(dh > 0) || !this.bodies.size) return;
    const h0 = this.hours() - dh, steps = Math.min(240, Math.ceil(dh));
    let k = 0;
    for (let i = 0; i < steps; i++) k += this.climate(h0 + (i + 0.5) * (dh / steps));
    k = (k / steps) * dh; // climate-weighted hours
    const W = this.g.water;
    for (const R of this.bodies.values()) {
      if (R.stage >= 3 && R.decay >= DECAY.stages[3].at) continue;
      R.wet = (W?.depthAt?.(R.x, R.z) ?? 0) > DECAY.wet;
      R.decay += k * (R.wet ? DECAY.water : 1) * (R.mul ?? 1);
      const s = stageOf(R.decay);
      if (s !== R.stage) this.stageTo(R, s);
    }
  }
  stageTo(R, s) {
    const g = this.g, was = R.stage;
    R.stage = s; this.dirty = true;
    if (s >= 3) { const m = this.memberOf(R); if (m) m.gone = true; }
    g.emit('bodyStage', { id: R.id, name: R.name, stage: DECAY.stages[s].id, was: DECAY.stages[was].id, x: r1(R.x), z: r1(R.z), hours: r1(R.decay) });
    if (R.c) {
      R.c.rot = DECAY.stages[s].k; g.charR?.paint(R.c);
      if (s >= 3 && R.c !== g.player?.dragging) { const m = this.memberOf(R); if (m) m.gone = true; g.removeChar(R.c); } // a skeleton is a bone pile, not a lying person
    }
  }
  // Relink: residents promote a dead member as a character again (their body near you): it is the same record.
  link() {
    for (const c of this.g.chars) {
      if (c.alive || c.riteId || c === this.g.player) continue;
      const key = c.res?.m?.key;
      for (const R of this.bodies.values()) if (!R.c && ((key && R.member === key) || R.id === c.id)) { R.c = c; R.folded = false; c.riteId = R.id; c.rot = DECAY.stages[R.stage].k; if (R.pose) this.g.deaths?.restore(c, R.pose, R.x, R.z); this.g.charR?.paint(c); break; }
    }
  }
  placeOf(x, z) {
    const cg = this.g.citygen, rec = cg?.recAt?.(x, z, 60);
    if (rec) return rec.id;
    return this.g.society?.placeAt?.(x, z) ?? null;
  }

  // ---- per frame -----------------------------------------------------------------------------------------------------
  update(dt) {
    const g = this.g, h = this.hours();
    if (this.lastH === null) this.lastH = h;
    if ((this.tickT -= dt) <= 0 || h - this.lastH >= 1 || h < this.lastH) { // every tick, and at once when the clock jumps (a sleep, a wait)
      this.tickT = DECAY.tick;
      const dh = h - this.lastH; this.lastH = h;
      if (dh > 0) this.age(dh);
      for (const k in this.moods) this.moods[k] = Math.max(0, this.moods[k] - Math.max(0, dh) / 72);
    }
    if ((this.linkT -= dt) <= 0) { this.linkT = 1; this.link(); this.handled(); this.hear(); }
    if ((this.smellT -= dt) <= 0) { this.smellT = DECAY.smellEvery; this.smell(); }
    this.tickDrag(dt);
    this.tickDig(dt);
    this.tickBurn(dt);
    this.tickFunerals(dt);
    const P = g.player, px = P.inVehicle?.x ?? P.x, pz = P.inVehicle?.z ?? P.z;
    this.drawT -= dt;
    if (this.dirty ? this.drawT <= 0.9 : this.drawT <= 0) { // moved 24 m or something changed (at most 10 a second)
      this.drawT = 1;
      if (this.dirty || Math.abs(px - this.drawX) > 24 || Math.abs(pz - this.drawZ) > 24) this.draw(px, pz);
    }
    this.buzz(g.time);
  }
  // The smell draws the infected (a body bloated or rotting, within its radius, pulls a wanderer with no target to it).
  smell() {
    const g = this.g, P = g.player;
    this.flySrc.length = 0;
    for (const R of this.bodies.values()) {
      const S = DECAY.stages[R.stage];
      if (!S.smell) continue;
      const bx = R.c ? R.c.x : R.x, bz = R.c ? R.c.z : R.z;
      if (Math.abs(bx - P.x) > 220 || Math.abs(bz - P.z) > 220) continue;
      if (this.flySrc.length < 12) this.flySrc.push(R);
      for (const c of g.chars) {
        if (c.faction !== 'zombie' || !c.alive || c.ztarget || c.wild || c.ug) continue;
        if (Math.abs(c.x - bx) > S.smell || Math.abs(c.z - bz) > S.smell) continue;
        c.wx = bx + (Math.random() - 0.5) * 3; c.wz = bz + (Math.random() - 0.5) * 3; c.timer = 8; c.smelled = R.id;
      }
    }
  }
  // Handling the dead (going through one, dragging one, burying one) past bloated: a chance of the grave sickness.
  handled() {
    const g = this.g, P = g.player, inv = g.inventory;
    let R = this.drag ?? this.dig?.R ?? null;
    if (!R && inv?.opened?.id?.startsWith('body:')) for (const b of this.bodies.values()) if (b.box === inv.opened.id) { R = b; break; }
    if (!R) return;
    const S = DECAY.stages[R.stage];
    if (!S.sick || g.needs?.sick) return;
    R.handled = (R.handled ?? 0) + 1;
    if (Math.random() < S.sick / 60) { g.survival?.sicken(DECAY.sickSickness); this.stats.sick++; g.emit('graveSickness', { body: R.id, stage: S.id }); }
  }

  // ---- drawing: the folded dead, bone piles, the near cemeteries (one instanced box mesh, one for the flies) -----------
  put(i, x, y, z, sx, sy, sz, ry, hex, k = 0, tint = null, bl = 0, pitch = 0, roll = 0) {
    if (i >= CAP) return i;
    _o.position.set(x, y, z); _o.rotation.set(pitch, ry, roll); _o.scale.set(sx, sy, sz); _o.updateMatrix();
    this.mesh.setMatrixAt(i, _o.matrix);
    _c.set(hex); if (bl > 0) _c.lerp(BLOOD, bl); if (tint && k > 0) _c.lerp(tint, k);
    _c.multiplyScalar(SHADE); // the instanced boxes take the sun harder than the character rig: matched by eye
    this.mesh.setColorAt(i, _c);
    return i + 1;
  }
  // A box rotated about y by `ry` around the grave centre (lx along the grave's right, lz along its length).
  putL(i, cx, cy, cz, ry, lx, ly, lz, sx, sy, sz, hex, k, tint, bl = 0, pitch = 0, roll = 0) {
    const s = Math.sin(ry), c = Math.cos(ry), wx = cx + lx * c + lz * s, wz = cz - lx * s + lz * c;
    return this.put(i, wx, (this.follow ? this.ground(wx, wz) : cy) + ly, wz, sx, sy, sz, ry, hex, k, tint, bl, pitch, roll); // follow: each piece on the land under it
  }
  // The land's tilt under a long flat box at (x, z) turned ry (a mound, a path run, a wall run): its pitch along the
  // box's own z (half-length hz) and roll along its x (hx), so it lies on a slope instead of stepping down it.
  tilt(x, z, ry, hx, hz) {
    _tl.p = 0; _tl.r = 0;
    if (!this.follow) return _tl;
    const s = Math.sin(ry), c = Math.cos(ry);
    if (hz > 0) _tl.p = -Math.atan((this.ground(x + s * hz, z + c * hz) - this.ground(x - s * hz, z - c * hz)) / (2 * hz));
    if (hx > 0) _tl.r = Math.atan((this.ground(x + c * hx, z - s * hx) - this.ground(x - c * hx, z + s * hx)) / (2 * hx));
    return _tl;
  }
  body(i, R) {
    const S = DECAY.stages[R.stage], C = R.colors ?? { shirt: '#5a5048', pants: '#3a342c', skin: '#a07858' };
    _t.set(S.tint);
    const y = (R.y ?? 0) + 0.06, a = (R.face ?? 0) + Math.PI, x = R.x, z = R.z; // head away from the shooter, as the death sprawl lies
    if (R.stage >= 3) { // the skeleton as it lay: a white skull, then thin bones (spine, ribs, pelvis, arms, legs), each a little scattered
      const rng = makeRng(hash(R.id)), j = () => (rng() - 0.5) * 0.06, bone = '#d6ccb0', BT = 0.035;
      i = this.putL(i, x, y, z, a + j(), j(), 0.07, 0.62, 0.15, 0.13, 0.18, '#f4f1e8');                                   // skull (white)
      i = this.putL(i, x, y, z, a, j(), 0.025, 0.56, 0.1, 0.04, 0.06, '#ece6d6');                                        // jaw
      i = this.putL(i, x, y, z, a, 0, 0.02, 0.1, 0.04, BT, 0.78, bone);                                                  // spine
      for (let k = 0; k < 4; k++) i = this.putL(i, x, y, z, a, j(), 0.04, 0.36 - k * 0.07, 0.3 - k * 0.03, 0.025, 0.025, bone); // ribs
      i = this.putL(i, x, y, z, a, 0, 0.032, -0.3, 0.24, 0.04, 0.08, bone);                                              // pelvis
      for (const sd of [-1, 1]) {
        i = this.putL(i, x, y, z, a + sd * (0.35 + j() * 4), sd * 0.24 + j(), 0.018, 0.14, BT, BT, 0.5, bone);            // arm
        i = this.putL(i, x, y, z, a + sd * (0.06 + j()), sd * 0.1 + j(), 0.022, -0.66, BT, BT, 0.7, bone);                // leg
      }
      return i;
    }
    const sw = S.swell, k = S.k;
    i = this.putL(i, x, y, z, a, 0, 0.11 * sw, 0.05, 0.42 * Math.min(1.35, sw), 0.22 * sw, 0.62, C.shirt, k, _t, 0.6);       // torso
    i = this.putL(i, x, y, z, a, 0, 0.1, 0.52, 0.22, 0.2, 0.22, C.skin, Math.min(1, k * 1.3), _t, 0.35);                     // head
    i = this.putL(i, x, y, z, a, -0.13, 0.07, -0.62, 0.14, 0.13 * Math.max(1, sw * 0.9), 0.8, C.pants, k, _t, 0.5);          // legs
    i = this.putL(i, x, y, z, a, 0.13, 0.07, -0.62, 0.14, 0.13 * Math.max(1, sw * 0.9), 0.8, C.pants, k, _t, 0.5);
    i = this.putL(i, x, y, z, a + 0.5, -0.36, 0.06, 0.1, 0.1, 0.1, 0.55, C.shirt, k, _t, 0.6);                               // arms flung
    i = this.putL(i, x, y, z, a - 0.4, 0.36, 0.06, 0.12, 0.1, 0.1, 0.55, C.shirt, k, _t, 0.6);
    return i;
  }
  draw(px, pz) {
    this.drawX = px; this.drawZ = pz; this.dirty = false;
    let i = 0, n = 0;
    // the folded dead and the bone piles nearest first, up to drawMax
    const near = [];
    for (const R of this.bodies.values()) if (!R.c && !R.buried && Math.abs(R.x - px) < BODY_FOLD.drawR && Math.abs(R.z - pz) < BODY_FOLD.drawR) near.push(R);
    near.sort((a, b) => Math.hypot(a.x - px, a.z - pz) - Math.hypot(b.x - px, b.z - pz));
    for (const R of near) { if (n++ >= BODY_FOLD.drawMax) break; i = this.body(i, R); }
    this.drawnBodies = Math.min(near.length, BODY_FOLD.drawMax);
    // open graves (a dark hole, the spoil heaped beside)
    for (const H of this.holes) if (Math.abs(H.x - px) < 200 && Math.abs(H.z - pz) < 200) { i = this.put(i, H.x, H.y + lift('cemGround') - 0.01, H.z, 0.9, 0.02, 1.9, H.a ?? 0, '#120e0a'); i = this.putL(i, H.x, H.y, H.z, H.a ?? 0, 0.9, 0.18, 0, 0.6, 0.36, 1.6, '#5a4630'); }
    // the cemeteries within reach
    this.drawnCems = [];
    for (const cem of this.cemsNear(px, pz, 320)) { const j = this.drawCem(i, cem); if (j > i) this.drawnCems.push(cem.id); i = j; }
    this.mesh.count = Math.min(i, CAP);
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.instances = i;
  }
  drawCem(i, cem) {
    this.resolve(cem);
    const K = CEMETERY_KINDS[cem.kind], slots = this.slots(cem), G = this.gravesOf(cem), y0 = cem.y, a = cem.a, sa = Math.sin(a), ca = Math.cos(a);
    const stone = '#a8a49a', wood = '#4a3624', dirt = '#3a2c1e', fresh = '#2a1f14', iron = '#2c2a28';
    this.follow = K.at !== 'on' || !!cem.outside; // a site's yard lies on its pad; the others on the land as it falls
    const soil = cem.soil ?? (cem.soil = this.soilOf(cem));
    if (K.layout !== 'vault' && !this.follow) i = this.put(i, cem.x, y0 + lift('cemGround') - 0.01, cem.z, cem.w - 0.5, 0.02, cem.d - 0.5, a, soil, 0.5, _t.set('#5a4630')); // the yard's own worked ground (depth row cemGround)
    if (K.layout === 'vault') { // a concrete crypt: floor, four low walls, the niches as plaques on the floor rows
      i = this.put(i, cem.x, y0 + 0.05, cem.z, cem.w, 0.1, cem.d, a, '#6c6a64');
      for (const [lx, lz, sx, sz] of [[0, -cem.d / 2, cem.w, 0.3], [0, cem.d / 2, cem.w, 0.3], [-cem.w / 2, 0, 0.3, cem.d], [cem.w / 2, 0, 0.3, cem.d]]) i = this.putL(i, cem.x, y0, cem.z, a, lx, 0.6, lz, sx, 1.2, sz, '#7a7870');
    }
    if (K.wall) i = this.drawWall(i, cem, K.wall);
    const L = cem.L;
    if (L) { // the paths (gravel in short runs, so each lies on the land), the trees at the edge, the rich plots' kerbs
      for (const [x0, z0, x1, z1, wd] of L.paths) {
        const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / 3)), ry = a + Math.atan2(x1 - x0, z1 - z0);
        for (let q = 0; q < n; q++) {
          const t = (q + 0.5) / n, lx = x0 + (x1 - x0) * t, lz = z0 + (z1 - z0) * t, wx = cem.x + lx * ca + lz * sa, wz = cem.z - lx * sa + lz * ca;
          const T = this.tilt(wx, wz, ry, wd / 2, len / n / 2);
          i = this.put(i, wx, (this.follow ? this.ground(wx, wz) : y0) + lift('cemPath') - 0.06, wz, wd, 0.12, len / n + 0.2, ry, '#9a8a6c', 0.3, _t.set(soil), 0, T.p, T.r); // top: depth row cemPath
        }
      }
      for (const T of L.trees) i = this.drawTree(i, cem, T.lx, T.lz, T.h, soil);
      for (const P of L.plots) {
        if (!P.kerb || P.s0 + P.k > G.length) continue;
        const A = slots[P.s0], B = slots[P.s0 + P.k - 1], cx = (A.lx + B.lx) / 2, cz = (A.lz + B.lz) / 2, half = Math.hypot(B.lx - A.lx, B.lz - A.lz) / 2 + K.sp[0] / 2 - 0.1, hl = K.sp[1] / 2 - 0.05;
        const wx = cem.x + cx * ca + cz * sa, wz = cem.z - cx * sa + cz * ca, ry = a + (A.ra ?? 0);
        for (const [lx, lz, sx, sz] of [[0, -hl + 0.15, half * 2, 0.16], [0, hl + 0.15, half * 2, 0.16], [-half, 0.15, 0.16, hl * 2], [half, 0.15, 0.16, hl * 2]]) i = this.putL(i, wx, y0, wz, ry, lx, lift('cemKerb') / 2, lz, sx, lift('cemKerb'), sz, '#9c968a');
      }
    }
    if (K.layout === 'trench') { // long trenches: the ground worked over, a low hump for each of the dead, a cross post every 4 m
      const per = cem.per ?? 20, T = Math.ceil(G.length / per);
      _t.set(soil);
      for (let t = 0; t < T; t++) {
        const s = slots[t * per], n = Math.min(per, G.length - t * per), len = n * K.sp[0];
        if (!s) break;
        i = this.putL(i, cem.x, y0, cem.z, a, s.lx + len / 2 - K.sp[0] / 2, lift('cemGround') - 0.03, s.lz, len + 0.6, 0.06, 2.6, dirt, 0.35, _t); // top: depth row cemGround
        for (let q = 0; q < n; q++) { const h = hash(`${cem.id}:${t}:${q}`); i = this.putL(i, cem.x, y0, cem.z, a + ((h & 15) - 7) * 0.01, s.lx + q * K.sp[0], 0.1, s.lz + ((h >> 4) & 7) * 0.03, 0.66, 0.16 + ((h >> 8) & 7) * 0.012, 1.9, dirt, 0.15 + ((h >> 12) & 7) * 0.04, _t); }
        for (let q = 0; q < len; q += 4) { i = this.putL(i, cem.x, y0, cem.z, a, s.lx + q, 0.6, s.lz - 1.35, 0.12, 1.2, 0.12, wood); i = this.putL(i, cem.x, y0, cem.z, a, s.lx + q, 0.9, s.lz - 1.35, 0.7, 0.12, 0.12, wood); }
      }
    }
    const all = G.length + cem.added.length, yr = CALENDAR.now;
    for (let n = 0; n < all && i < CAP - 10; n++) {
      const gr = n < G.length ? G[n] : cem.added[n - G.length], s = slots[n];
      if (!s) break;
      if (K.layout === 'trench' && n < G.length) continue; // the old ones lie in the trench
      const m = gr.marker, newish = n >= G.length, h = hash(gr.id), jx = ((h & 255) / 255 - 0.5) * 0.3, jz = (((h >> 8) & 255) / 255 - 0.5) * 0.3, ja = (((h >> 16) & 255) / 255 - 0.5) * 0.1;
      if (K.layout === 'vault') { i = this.putL(i, cem.x, y0, cem.z, a, s.lx, 0.1, s.lz, 0.5, 0.08, 0.36, m === 'none' ? '#5a5852' : '#9a968c'); continue; }
      // each grave about its own middle, lying with its row (s.ra): a section's turn never shifts the far ones
      const lx = s.lx + jx, lz = s.lz + jz, gx = cem.x + lx * ca + lz * sa, gz = cem.z - lx * sa + lz * ca, aa = a + (s.ra ?? 0) + ja;
      // the older the grave the lower and paler its mound (grassed or sanded over); some of the oldest sunk to a hollow
      const age = newish ? 0 : yr - gr.died, old = Math.min(1, age / 60), hollow = !newish && age > CEM_LAYOUT.sunk && (h >> 20) % 3 === 0;
      const down = !newish && old > 0.4 && ((h >> 9) % 100) < CEM_LAYOUT.fall * 100, sink = old * 0.12;
      _t.set(soil);
      const T = this.tilt(gx, gz, aa, 0.45, 1.0);
      // tops on the depth rows (engine/depthlayers.js): a hollow at cemHollow, a mound from cemMound (the oldest) up to 0.25, a fresh one 0.32
      const mTop = hollow ? lift('cemHollow') : newish ? 0.32 : lift('cemMound') + (1 - old) * 0.084;
      if (hollow) i = this.putL(i, gx, y0, gz, aa, 0, mTop - 0.03, 0, 0.9, 0.06, 1.8, '#2a2016', 0.45, _t, 0, T.p, T.r);
      else i = this.putL(i, gx, y0, gz, aa, 0, mTop / 2, 0, 0.95, mTop, 2.0, newish ? fresh : dirt, newish ? 0 : 0.05 + old * 0.2, _t, 0, T.p, T.r);
      if (m === 'stone') {
        const tint = (h >> 3) % 3 ? stone : (h >> 4) % 2 ? '#a8a294' : '#8e8a82', tall = 0.62 + ((h >> 13) % 4) * 0.08, wide = 0.6 + ((h >> 15) % 3) * 0.08;
        if (down) i = this.putL(i, gx, y0, gz, aa + 0.2, 0.1, mTop + 0.06, 1.25, wide, 0.12, tall, tint); // fallen flat at the head, on the mound's end
        else { const lean = (h >> 24) % 7 === 0 ? 0.3 : 0; i = this.putL(i, gx, y0, gz, aa + lean, 0, tall / 2 - sink, 1.05, wide, tall, 0.24, tint); }
      } else if (m === 'cross') {
        if (down) i = this.putL(i, gx, y0, gz, aa + 1.2, 0.3, mTop + 0.05, 0.6, 0.12, 0.1, 1.0, wood);
        else { const lean = (h >> 22) % 5 === 0 ? 0.25 : 0; i = this.putL(i, gx, y0, gz, aa + lean, 0, 0.55 - sink, 1.05, 0.12, 1.1, 0.12, wood); i = this.putL(i, gx, y0, gz, aa + lean, 0, 0.8 - sink, 1.05, 0.62, 0.12, 0.12, wood); }
      } else if (m === 'cairn') { // field stones heaped at the head and laid along the grave
        const c1 = (h >> 5) % 2 ? '#8a8276' : '#7c766c';
        i = this.putL(i, gx, y0, gz, aa + 0.3, 0, 0.12, 1.25, 0.56, 0.24, 0.46, c1); // (heaped past the mound's end, on the ground)
        i = this.putL(i, gx, y0, gz, aa - 0.4, 0.04, 0.32, 1.27, 0.38, 0.2, 0.32, '#948c80');
        if (!down) i = this.putL(i, gx, y0, gz, aa + 0.9, -0.02, 0.48, 1.25, 0.22, 0.16, 0.2, c1);
        i = this.putL(i, gx, y0, gz, aa + 0.5, 0.32, mTop + 0.06, -0.2, 0.24, 0.12, 0.2, '#8a8276'); // laid on the mound
        i = this.putL(i, gx, y0, gz, aa - 0.2, -0.3, mTop + 0.06, 0.3, 0.2, 0.12, 0.24, '#7c766c');
      } else if (m === 'iron') { // a wrought-iron cross; half of them a low railing round the grave
        if (down) i = this.putL(i, gx, y0, gz, aa + 1.3, 0.25, mTop + 0.035, 0.7, 0.07, 0.07, 1.0, iron);
        else { i = this.putL(i, gx, y0, gz, aa, 0, 0.55, 1.05, 0.07, 1.1, 0.07, iron); i = this.putL(i, gx, y0, gz, aa, 0, 0.82, 1.05, 0.5, 0.07, 0.07, iron); i = this.putL(i, gx, y0, gz, aa, 0, 0.82, 1.05, 0.2, 0.2, 0.04, iron); }
        if ((h >> 7) % 2) for (const [ox, oz, sx, sz] of [[-0.55, 0, 0.04, 2.1], [0.55, 0, 0.04, 2.1], [0, -1.05, 1.1, 0.04]]) i = this.putL(i, gx, y0, gz, aa, ox, 0.2, oz, sx, 0.4, sz, iron);
      }
    }
    this.follow = false;
    return i;
  }
  // The wall or fence round a cemetery (data/rites.js CEMETERY_KINDS wall), in short runs that follow the land, with one
  // gate in the middle of the side that faces its place (local -z): two posts (a stone wall's are piers), an iron arch
  // bar over a town's, one leaf swung inward.
  drawWall(i, cem, kind) {
    if (!(cem.w < 1000 && cem.d < 1000)) return i; // a yard with no size (no plan yet) has no wall
    const w = cem.w / 2, d = cem.d / 2, gate = CEM_LAYOUT.gate / 2, a = cem.a, sa = Math.sin(a), ca = Math.cos(a), X = cem.x, Z = cem.z, y0 = cem.y;
    const col = kind === 'stone' ? '#8f877a' : kind === 'iron' ? '#2c2a28' : kind === 'picket' ? '#b8ae98' : '#4a3624';
    const step = kind === 'stone' ? 3 : kind === 'iron' ? 2 : kind === 'wire' ? 4 : 2.5, thin = kind === 'iron' || kind === 'wire';
    const at = (lx, lz) => { _w.x = X + lx * ca + lz * sa; _w.z = Z - lx * sa + lz * ca; _w.y = this.follow ? this.ground(_w.x, _w.z) : y0; return _w; };
    let run = 0, runs = 0;
    for (const [x0, z0, x1, z1] of WALL_SIDES) runs += Math.max(1, Math.round(Math.hypot((x1 === 2 ? gate : x1 === -2 ? -gate : x1 * w) - (x0 === 2 ? gate : x0 === -2 ? -gate : x0 * w), (z1 - z0) * d) / step));
    for (const [x0, z0, x1, z1] of WALL_SIDES) {
      const sx0 = x0 === 2 ? gate : x0 === -2 ? -gate : x0 * w, sx1 = x1 === 2 ? gate : x1 === -2 ? -gate : x1 * w, sz0 = z0 * d, sz1 = z1 * d;
      const len = Math.hypot(sx1 - sx0, sz1 - sz0), n = Math.max(1, Math.round(len / step)), seg = len / n, ry = a + Math.atan2(sx1 - sx0, sz1 - sz0) + Math.PI / 2;
      for (let q = 0; q < n; q++) {
        const t = (q + 0.5) / n, P = at(sx0 + (sx1 - sx0) * t, sz0 + (sz1 - sz0) * t), mx = P.x, mz = P.z, gy = P.y, rl = this.tilt(mx, mz, ry, seg / 2, 0).r;
        // stone: each run a step over or under the one before (overlapping tops of two shades never share a plane; the last
        // run, which meets the first at the corner, takes a third height)
        const hs = 0.72 + 0.014 * (run === runs - 1 && runs % 2 ? 2 : run % 2); run++;
        if (kind === 'stone') { i = this.put(i, mx, gy + hs / 2, mz, seg + 0.05, hs, 0.42, ry, (q * 7 + n) % 3 ? col : '#857e72', 0, null, 0, 0, rl); continue; }
        if (kind === 'wire') { for (const yy of [0.35, 0.6, 0.85]) i = this.put(i, mx, gy + yy, mz, seg, 0.02, 0.02, ry, '#5a5650', 0, null, 0, 0, rl); }
        else for (const yy of kind === 'rail' ? [0.45, 0.85] : kind === 'iron' ? [0.12, 0.82] : [0.3, 0.7]) i = this.put(i, mx, gy + yy, mz, seg, thin ? 0.04 : 0.08, thin ? 0.04 : 0.05, ry, col, 0, null, 0, 0, rl);
        const Q = at(sx0 + (sx1 - sx0) * (q / n), sz0 + (sz1 - sz0) * (q / n));
        i = this.put(i, Q.x, Q.y + 0.5, Q.z, thin ? 0.07 : 0.12, 1.0, thin ? 0.07 : 0.12, ry, col); // a post
        if (kind === 'picket' || kind === 'iron') for (let k = 1; k < 4; k++) { const tt = (q + k / 4) / n, B = at(sx0 + (sx1 - sx0) * tt, sz0 + (sz1 - sz0) * tt); i = this.put(i, B.x, B.y + 0.42, B.z, kind === 'iron' ? 0.025 : 0.09, 0.84, kind === 'iron' ? 0.025 : 0.03, ry, col); }
      }
    }
    // the gate: piers or posts, the arch, one leaf open
    const ps = kind === 'stone' ? 0.6 : 0.2, pc = kind === 'stone' ? '#7e786c' : col;
    for (const sx of [-1, 1]) { const P = at(sx * (gate + ps / 2), -d); i = this.put(i, P.x, P.y + 0.7, P.z, ps, 1.4, ps, a, pc); }
    if (kind === 'stone' || kind === 'iron') { const P = at(0, -d); i = this.put(i, P.x, P.y + 2.1, P.z, CEM_LAYOUT.gate + ps * 2, 0.1, 0.1, a, iron0); i = this.put(i, P.x, P.y + 1.75, P.z, CEM_LAYOUT.gate + ps * 2, 0.06, 0.06, a, iron0); i = this.put(i, P.x, P.y + 1.4, P.z, 0.06, 0.7, 0.06, a, iron0); }
    const leaf = kind === 'stone' || kind === 'iron' ? iron0 : kind === 'wire' ? '#5a5650' : col, lw = gate * 1.9, la = 1.15; // swung in about the left post
    const hx = -gate + (lw / 2) * Math.cos(la), hz = -d + (lw / 2) * Math.sin(la), M = at(hx, hz);
    for (const yy of [0.3, 0.75]) i = this.put(i, M.x, M.y + yy, M.z, lw, 0.06, 0.05, a - la, leaf);
    i = this.put(i, M.x, M.y + 0.52, M.z, 0.05, 0.5, 0.05, a - la, leaf);
    return i;
  }
  // A tree at a cemetery's edge: a trunk, a limb and two crowns (a desert yard's low and sparse).
  drawTree(i, cem, lx, lz, h, soil) {
    const a = cem.a, wx = cem.x + lx * Math.cos(a) + lz * Math.sin(a), wz = cem.z - lx * Math.sin(a) + lz * Math.cos(a), gy = this.follow ? this.ground(wx, wz) : cem.y;
    const dry = soil === '#c8a878', leaf = dry ? '#5a5c34' : soil === '#7a7448' ? '#4a5a2c' : '#344a26', r = (h % 628) / 100, ht = dry ? 2.6 + (h % 7) * 0.15 : 3.6 + (h % 9) * 0.2;
    i = this.put(i, wx, gy + ht / 2, wz, 0.32, ht, 0.32, r, '#4a3a2a');
    i = this.put(i, wx + 0.5 * Math.cos(r), gy + ht * 0.72, wz + 0.5 * Math.sin(r), 0.14, ht * 0.4, 0.14, r + 0.6, '#4a3a2a');
    i = this.put(i, wx, gy + ht + 0.2, wz, dry ? 2.4 : 3.2, dry ? 0.8 : 1.4, dry ? 2.2 : 3.0, r, leaf);
    i = this.put(i, wx + 0.4, gy + ht + (dry ? 0.75 : 1.1), wz - 0.3, dry ? 1.5 : 2.0, dry ? 0.6 : 1.0, dry ? 1.6 : 2.2, r + 0.5, leaf, 0.15, _t.set('#2a3a1c'));
    return i;
  }
  // The ground's own colour round a cemetery (old mounds go back to it): the island's sand, a biome's floor elsewhere.
  soilOf(cem) { const b = cem.rec?.biome ?? ''; return /swamp|delta|forest|pine|rain|appalach|atlantic|gulf/.test(b) ? '#4f5a34' : /plains|prairie|farm/.test(b) ? '#7a7448' : '#c8a878'; }
  // The flies over the smelling dead (allocation-free: a sine swarm round each of the nearest bodies).
  buzz(t) {
    let n = 0;
    for (const R of this.flySrc) {
      const F = DECAY.stages[R.stage].flies, bx = R.c ? R.c.x : R.x, bz = R.c ? R.c.z : R.z, by = (R.c ? R.c.gy ?? 0 : R.y ?? 0) + 0.5;
      for (let k = 0; k < F && n < FLY_CAP; k++, n++) {
        const p = t * (2.2 + k * 0.37) + k * 1.7;
        _o.position.set(bx + Math.sin(p) * (0.4 + (k % 3) * 0.25), by + Math.sin(p * 1.9) * 0.25, bz + Math.cos(p * 1.3) * (0.4 + (k % 2) * 0.3));
        _o.rotation.set(0, 0, 0); _o.scale.set(1, 1, 1); _o.updateMatrix();
        this.flies.setMatrixAt(n, _o.matrix);
      }
    }
    if (n || this.flies.count) { this.flies.count = n; this.flies.instanceMatrix.needsUpdate = true; }
  }

  // ---- cemeteries ------------------------------------------------------------------------------------------------------
  // Every place gets one (lazily, the first time anyone asks: the plan is pure, so the same each boot).
  plan() {
    if (this.planned) return;
    this.planned = true;
    for (const rec of this.g.citygen?.plan ?? []) this.cemFor(rec);
    for (const F of FIXED_CEMETERIES) this.addFixed(F);
    for (const H of this.g.streamer?.W?.holdouts ?? []) this.addFixed({ id: `holdout:${H.id ?? H.name}`, name: (H.name ?? 'HOLDOUT').toUpperCase(), kind: 'town_cemetery', x: H.cx + (H.hw ?? 40) + 26, z: H.cz, pop: H.pop ?? 60, years: 70, danger: 0.3, holdout: true });
  }
  cemFor(rec) {
    const id = `cem:${rec.id}`;
    let cem = this.cems.get(id);
    if (cem) return cem;
    const I = cemeteryInputs(rec);
    cem = { id, place: rec.id, placeName: rec.name, placeKind: rec.kind, site: rec.site ?? null, kind: I.kind, battle: I.battle, pop: I.pop, years: I.years, danger: I.danger, count: I.graves,
      seed: ((rec.seed ?? hash(rec.id)) ^ 0x43454d) >>> 0, x: rec.x, z: rec.z, y: 0, a: 0, w: 0, d: 0, resolved: false, rec, added: [], beyond: !!rec.beyond };
    this.size(cem);
    this.cems.set(id, cem);
    return cem;
  }
  addFixed(F) {
    const id = `cem:${F.id}`;
    if (this.cems.has(id)) return this.cems.get(id);
    const cem = { id, place: F.id, placeName: F.name, placeKind: F.ring ? 'ring' : 'fixed', kind: F.kind, battle: false, pop: F.pop, years: F.years, danger: F.danger, count: graveCount(F.pop, F.years, F.danger),
      seed: hash(F.id), x: F.x, z: F.z, y: 0, a: F.a ?? 0, w: 0, d: 0, resolved: false, fixed: true, added: [], ring: !!F.ring };
    this.size(cem);
    this.cems.set(id, cem);
    return cem;
  }
  size(cem, maxW = Infinity) {
    const K = CEMETERY_KINDS[cem.kind], n = cem.count + spareOf(cem.count); // room for new graves
    if (K.layout === 'trench') { const per = cem.per = Math.max(10, Math.ceil(Math.sqrt(cem.count * K.sp[1] / K.sp[0]))), T = Math.ceil(cem.count / per) + 1; cem.cols = per; cem.rows = T; cem.w = per * K.sp[0] + 4; cem.d = T * K.sp[1] + 4; return; }
    if (K.layout === 'rows') { const L = (cem.L = this.lay(cem, maxW)); cem.w = L.w; cem.d = L.d; cem.sections = L.secs.length; cem.slotList = null; return; }
    const cols = Math.max(3, Math.ceil(Math.sqrt(n * K.sp[1] / K.sp[0]))), rows = Math.ceil(n / cols);
    cem.cols = cols; cem.rows = rows; cem.w = cols * K.sp[0] + 3; cem.d = rows * K.sp[1] + 3;
  }
  // A 'rows' cemetery's plan (pure: its seed and its count; data/rites.js CEM_LAYOUT). Its graves go in family plots of
  // 2..5 with a gap between plots, plots in rows across a section, sections of at most secW x secD either side of a main
  // path from the gate, cross paths between section rows. Each section turns a little and its rows bend (q.ra is the
  // grave's own turn, so it lies with its row). Sections fill from the back: the spare slots (new graves) are by the gate.
  lay(cem, maxW = Infinity) {
    const K = CEMETERY_KINDS[cem.kind], L = CEM_LAYOUT, [sx, sz] = K.sp;
    let rng = makeRng((cem.seed ^ 0x51ab) >>> 0);
    const mg = maxW === Infinity ? L.margin : Math.min(L.margin, 1); // fitted to a lot: a narrow margin, so it stays inside it
    const n = cem.count + spareOf(cem.count), inner = Math.max(3 * sx + L.plotGap, maxW - 2 * mg), area = n * sx * sz * 1.25;
    const small = area <= L.secW * L.secD;
    let secW = Math.min(L.secW, inner), cols = 1;
    if (small && maxW === Infinity) secW = Math.min(secW, Math.max(3 * sx + L.plotGap, Math.sqrt(area))); // fitted to a lot: its full width, so it stays shallow
    else if (2 * secW + L.mainPath <= inner) cols = 2;
    let rowsPer = small ? Infinity : Math.max(2, Math.floor(L.secD / sz));
    let slots = [], plots = [], secs = [];
    for (let pass = 0; pass < 2; pass++) {
      if (pass) { // the rows shared evenly over the sections (the first pass's last one would be half empty)
        const total = secs.reduce((t, q) => t + q.rows, 0);
        if (secs.length < 2) break;
        rowsPer = Math.ceil(total / secs.length); rng = makeRng((cem.seed ^ 0x51ab) >>> 0); slots = []; plots = []; secs = [];
      }
      let left = n;
      while (left > 0) {
        const sec = { i: secs.length, rows: 0, turn: (rng() - 0.5) * 2 * L.turn, ph: rng() * 6.283 };
        for (let r = 0; r < rowsPer && left > 0; r++) {
          let x = 0;
          while (left > 0) {
            const k = Math.min(L.plot[0] + Math.floor(rng() * (L.plot[1] - L.plot[0] + 1)), Math.floor((secW - x + 0.01) / sx), left);
            if (k < 1) break;
            const wv = rng(), wealth = K.uniform ? 1 : wv < L.wealth.share[0] ? 0 : wv < L.wealth.share[0] + L.wealth.share[1] ? 1 : 2;
            plots.push({ s0: slots.length, k, wealth, kerb: wealth === 2 && rng() < L.kerb, sec: sec.i });
            for (let q = 0; q < k; q++) slots.push({ sec: sec.i, r, x: x + (q + 0.5) * sx, plot: plots.length - 1 });
            x += k * sx + L.plotGap; left -= k;
          }
          sec.rows = r + 1;
        }
        secs.push(sec);
      }
    }
    if (secs.length === 1) cols = 1;
    const R = Math.ceil(secs.length / cols), depth = Math.max(...secs.map((q) => q.rows)) * sz;
    const w = cols * secW + (cols - 1) * L.mainPath + 2 * mg, d = R * depth + (R - 1) * L.path + 2 * mg + L.path;
    for (const sec of secs) {
      const c = sec.i % cols, row = Math.floor(sec.i / cols);
      sec.x0 = -w / 2 + mg + c * (secW + L.mainPath); sec.zb = d / 2 - mg - row * (depth + L.path);
      sec.cx = sec.x0 + secW / 2; sec.cz = sec.zb - depth / 2; sec.w = secW; sec.d = depth;
    }
    const k2 = (2 * Math.PI) / L.bendLen;
    for (const q of slots) {
      const sec = secs[q.sec], lx = sec.x0 + q.x, lz = sec.zb - (q.r + 0.5) * sz - 0.2 + L.bend * Math.sin(lx * k2 + sec.ph), slope = L.bend * k2 * Math.cos(lx * k2 + sec.ph);
      const dx = lx - sec.cx, dz = lz - sec.cz, c = Math.cos(sec.turn), sn = Math.sin(sec.turn);
      q.lx = sec.cx + dx * c + dz * sn; q.lz = sec.cz - dx * sn + dz * c; q.ra = sec.turn - Math.atan(slope);
    }
    // the paths: the main one from the gate up the middle (with one column of sections, only to the front section), the
    // cross paths between section rows
    const paths = [], front = -d / 2 + 0.4, back = cols === 2 ? d / 2 - mg / 2 : d / 2 - mg - R * depth - (R - 1) * L.path;
    paths.push([0, front, 0, Math.max(front + 1, back), cols === 2 ? L.mainPath - 0.6 : L.path - 0.4]);
    for (let row = 0; row < R - 1; row++) { const z = d / 2 - mg - (row + 1) * depth - row * L.path - L.path / 2; paths.push([-w / 2 + mg / 2, z, w / 2 - mg / 2, z, L.path - 0.6]); }
    // a tree or two at the corners, just outside the wall (inside the keep-out ring)
    const trees = [], c0 = Math.floor(rng() * 4);
    for (let t = 0; t < (K.trees ?? 0); t++) { const [ux, uz] = CORNERS[(c0 + t * 2 + (t > 1 ? 1 : 0)) % 4]; trees.push({ lx: ux * (w / 2 + 1.6), lz: uz * (d / 2 + 1.6), h: Math.floor(rng() * 100000) }); }
    return { slots, plots, secs, paths, trees, cols, w, d };
  }
  // The chunk generator's question (world/chunkgen.js blocked): is (x, z) inside a placed cemetery or its keep-out ring?
  solid(x, z, r = 0) {
    const L = this.keep.get(Math.floor(x / 64) * 100003 + Math.floor(z / 64));
    if (!L) return false;
    for (const cem of L) {
      const dx = x - cem.x, dz = z - cem.z, s = Math.sin(cem.a), c = Math.cos(cem.a), lx = dx * c - dz * s, lz = dx * s + dz * c, m = CEM_LAYOUT.keep + r;
      if (Math.abs(lx) < cem.w / 2 + m && Math.abs(lz) < cem.d / 2 + m) return true;
    }
    return false;
  }
  // How many of a laid-out chunk's scatter instances and static boxes stand inside a cemetery's wall plus its keep-out.
  scatterIn(L, cem) {
    const s = Math.sin(cem.a), c = Math.cos(cem.a), hw = cem.w / 2 + CEM_LAYOUT.keep, hd = cem.d / 2 + CEM_LAYOUT.keep;
    const inside = (x, z) => { const dx = x - cem.x, dz = z - cem.z; return Math.abs(dx * c - dz * s) < hw && Math.abs(dx * s + dz * c) < hd; };
    let n = 0;
    for (const name in L.inst ?? {}) { const r = L.inst[name]; for (let k = 0; k < r.n; k++) if (inside(r.m[k * 16 + 12], r.m[k * 16 + 14])) n++; }
    for (const b of L.boxes ?? []) if (inside((b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2)) n++;
    return n;
  }
  // A cemetery placed: into the keep-out cells, and the chunks already laid out under it with something standing on its
  // ground are laid out again (the settlement pad's rule, systems/citygen.js stamp), so their rocks, scrub and trees
  // come back off it. A chunk with nothing there (a yard on a pad) is left alone, and a ring lot's never (its neighbours'
  // walls and planting crowd the keep-out ring, and they are the city's, not wild scatter).
  keepOut(cem) {
    for (const L of this.keep.values()) { const k = L.indexOf(cem); if (k >= 0) L.splice(k, 1); }
    const R = Math.hypot(cem.w, cem.d) / 2 + CEM_LAYOUT.keep + 2;
    for (let i = Math.floor((cem.x - R) / 64); i <= Math.floor((cem.x + R) / 64); i++) for (let j = Math.floor((cem.z - R) / 64); j <= Math.floor((cem.z + R) / 64); j++) {
      const key = i * 100003 + j; let L = this.keep.get(key); if (!L) this.keep.set(key, (L = [])); L.push(cem);
    }
    const S = this.g.streamer;
    let n = 0;
    if (S?.layouts && !cem.ring) for (let cx = Math.floor((cem.x - R) / CHUNK); cx <= Math.floor((cem.x + R) / CHUNK); cx++) for (let cz = Math.floor((cem.z - R) / CHUNK); cz <= Math.floor((cem.z + R) / CHUNK); cz++) {
      const k = chunkKey(cx, cz), L = S.layouts.get(k);
      if (L && !S.pinned?.has(k) && this.scatterIn(L, cem)) { S.evict(k); n++; } // only a chunk with something on the yard: a relayout ahead of a fast car is a stall
    }
    cem.relaid = (cem.relaid ?? 0) + n;
    return n;
  }
  // Where it stands (the first time it is near and its place is built: off the buildings, on dry ground).
  resolve(cem) {
    if (cem.resolved) return;
    const K = CEMETERY_KINDS[cem.kind], g = this.g, rec = cem.rec;
    const live = rec ? g.citygen?.live?.get(rec.id) : null;
    if (rec && !live && !cem.fixed) { cem.y = rec.y ?? this.ground(cem.x, cem.z); return; } // not built yet: provisional
    const roads = live?.T?.alleys?.length ? [...live.T.roads, ...live.T.alleys] : live?.T?.roads ?? [], WL = live?.T?.wall ?? null, W = g.streamer?.W, // (a town's service alleys are streets too: BACK LOTS)
      CG = g.statics?.cg, island = (x, z) => Math.abs(x) <= 464 && Math.abs(z) <= 464;
    // the rock the chunk generator stands up near here (mesas, buttes, ridges: pure, world/chunkgen.js mesasOf)
    const rock = [], reach = (rec ? rec.half : 200) + Math.hypot(cem.w, cem.d) + 40, ox = rec?.x ?? cem.x, oz = rec?.z ?? cem.z;
    if (W?.reliefAt) for (let cx = Math.floor((ox - reach) / CHUNK) - 1; cx <= Math.floor((ox + reach) / CHUNK) + 1; cx++) for (let cz = Math.floor((oz - reach) / CHUNK) - 1; cz <= Math.floor((oz + reach) / CHUNK) + 1; cz++) for (const m of mesasOf(W, cx, cz)) if (Math.abs(m.x - ox) < reach + m.r * MESA_REACH && Math.abs(m.z - oz) < reach + m.r * MESA_REACH) rock.push(m);
    // What is under one point: a building (the live towns' 8 m box grid), a street (the town's road rows, the island
    // grid, a corridor), water, the island's statics or the ring's lots.
    const hit = (x, z) => {
      if (CG) for (const b of CG.cell(Math.floor(x / 8), Math.floor(z / 8))) if (x > b.minX - 1 && x < b.maxX + 1 && z > b.minZ - 1 && z < b.maxZ + 1) return true;
      for (const q of roads) if (x > q.x0 - 1.5 && x < q.x1 + 1.5 && z > q.z0 - 1.5 && z < q.z1 + 1.5) return true;
      if (WL && x > WL.x0 - 2 && x < WL.x1 + 2 && z > WL.z0 - 2 && z < WL.z1 + 2 && Math.min(Math.abs(x - WL.x0), Math.abs(x - WL.x1), Math.abs(z - WL.z0), Math.abs(z - WL.z1)) < 2) return true; // its own wall or fence line
      if ((g.water?.depthAt?.(x, z) ?? 0) > 0.05) return true;
      for (const m of rock) if (Math.abs(m.x - x) < m.r * MESA_REACH + 4 && Math.abs(m.z - z) < m.r * MESA_REACH + 4 && mesaNorm(m, x, z) < 1.12) return true;
      if (island(x, z)) { if (Math.abs(z) < 9 || roadLines.some((c) => Math.abs(z - c) < 9 || Math.abs(x - c) < 9)) return true; if (g.statics?.pointBlocked?.(x, z, 0.8)) return true; }
      else if (cem.fixed && !cem.ring && W?.ring?.inCity?.(x, z)) return true;
      return false;
    };
    // A footprint's score: how many of its 7 x 7 sample points land on something (0 = clear ground), and the corridor.
    const isle = cem.fixed && island(cem.x, cem.z) ? (g.statics?.boxes ?? []).filter((b) => Math.abs(b.minX - cem.x) < 280 && Math.abs(b.minZ - cem.z) < 280) : null;
    const score = (x, z, a) => {
      if (!island(x, z) && W?.project) { const pr = W.project(x, z, 80); if (pr && pr.d < Math.max(cem.w, cem.d) / 2 + 24) return 999; }
      const sn = Math.sin(a), cs = Math.cos(a);
      let n = 0;
      for (let u = 0; u < 7; u++) for (let v = 0; v < 7; v++) {
        const lx = (u / 6 - 0.5) * cem.w, lz = (v / 6 - 0.5) * cem.d;
        if (hit(x + lx * cs + lz * sn, z - lx * sn + lz * cs)) n++;
      }
      // on the island, its own scatter (cacti, dead trees, junk: small boxes the 7 x 7 samples step over) counts too
      if (isle) for (const b of isle) { const dx = (b.minX + b.maxX) / 2 - x, dz = (b.minZ + b.maxZ) / 2 - z; if (Math.abs(dx * cs - dz * sn) < cem.w / 2 + CEM_LAYOUT.keep && Math.abs(dx * sn + dz * cs) < cem.d / 2 + CEM_LAYOUT.keep) n++; }
      return n;
    };
    const cands = [];
    if (cem.fixed) { for (let d = 0; d <= 200; d += 8) for (let k = 0; k < 16; k++) cands.push([cem.x + Math.cos(k * 0.3927) * d, cem.z + Math.sin(k * 0.3927) * d, cem.a ?? 0]); }
    else {
      const half = rec.half, base = (cem.seed % 8) * 0.785, r = Math.hypot(cem.w, cem.d) / 2;
      const radii = K.at === 'edge' ? [half - r * 0.4, half + r * 0.2, half - r, half + r * 0.8] : K.at === 'plot' ? [half * 0.55, half * 0.75, half * 0.35] : [half * 0.5, half * 0.3, half * 0.7, half * 0.15, 0];
      for (const rr of radii) for (let k = 0; k < 16; k++) {
        const ang = base + k * 0.3927, x = rec.x + Math.cos(ang) * rr, z = rec.z + Math.sin(ang) * rr, a = Math.round(Math.atan2(x - rec.x, z - rec.z) / (Math.PI / 2)) * (Math.PI / 2);
        cands.push([x, z, a], [x, z, a + Math.PI / 2]);
      }
      if (K.at === 'on') for (const B of live?.T?.blocks ?? []) cands.push([B.cx, B.cz, 0], [B.cx, B.cz, Math.PI / 2]); // a site's own blocks
    }
    let best = cands[0], bs = Infinity;
    for (const c of cands) { const sc = score(c[0], c[1], c[2]); if (sc < bs) { bs = sc; best = c; if (!sc) break; } }
    // a site built solid: outside its walls instead (where the dead of a siege were put)
    if (bs > 2 && rec && K.at === 'on') for (const rr of [rec.half - 6, rec.half + 10, rec.half + 30]) for (let k = 0; k < 16 && bs; k++) {
      const ang = k * 0.3927, x = rec.x + Math.cos(ang) * rr, z = rec.z + Math.sin(ang) * rr;
      for (const a of [0, Math.PI / 2]) { const sc = score(x, z, a); if (sc < bs) { bs = sc; best = [x, z, a]; } }
    }
    cem.x = Math.round(best[0]); cem.z = Math.round(best[1]); cem.a = best[2]; cem.clash = bs; // clash: sample points still on something (0 = clear)
    cem.slotList = null;
    cem.outside = !!(rec && Math.max(Math.abs(cem.x - rec.x), Math.abs(cem.z - rec.z)) > rec.half - 8);
    cem.y = live && K.at === 'on' && !cem.outside ? (rec.y ?? 0) : this.ground(cem.x, cem.z); // on a site: its pad; at the edge: the land itself
    cem.resolved = true;
    this.keepOut(cem);
    this.placeSexton(cem);
    this.g.emit('cemeteryPlaced', { id: cem.id, place: cem.place, kind: cem.kind, x: cem.x, z: cem.z, graves: cem.count, clash: bs });
  }
  // The sexton's box (a shovel, a cross or two) at a town cemetery: rolled once like any box, never refills.
  placeSexton(cem) {
    if (!['town_cemetery', 'boot_hill', 'family_plot'].includes(cem.kind) || !this.g.inventory) return;
    const s = Math.sin(cem.a), c = Math.cos(cem.a), lx = cem.w / 2 + 1.2, x = cem.x + lx * c, z = cem.z - lx * s;
    const id = `sexton:${cem.id}`;
    if (!this.g.inventory.boxes.has(id)) { const b = this.g.inventory.place(id, 'sexton', x, z, 30, `SEXTON'S BOX · ${cem.placeName}`); b.y = cem.y; }
  }
  onBuilt(t) { const cem = this.cemFor(t.rec); cem.resolved = false; this.resolve(cem); this.dirty = true; }
  onReleased() { this.dirty = true; }
  cemsNear(x, z, R) {
    this.plan();
    const out = [];
    for (const cem of this.cems.values()) if (Math.abs(cem.x - x) < R + cem.w && Math.abs(cem.z - z) < R + cem.d) out.push(cem);
    // the ring's quarters: a yard for the quarter you are in, once it has households
    if (!out.some((c) => c.ring)) { const y = this.ringYard(x, z); if (y && Math.abs(y.x - x) < R + y.w && Math.abs(y.z - z) < R + y.d) out.push(y); }
    if (out.length > 4) out.sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z)); // the nearest four
    return out.slice(0, 4);
  }
  // A ring quarter's yard: the empty lot nearest the quarter's middle (data/rites.js RING_YARD).
  ringYard(x, z) {
    const RG = this.g.streamer?.W?.ring;
    if (!RG?.inCity?.(x, z)) return null;
    const Q = 4 * 96, qk = Math.floor(x / Q), qj = Math.floor(z / Q), id = `ring:${qk},${qj}`;
    if (this.cems.has(`cem:${id}`)) return this.cems.get(`cem:${id}`);
    const cx = (qk + 0.5) * Q, cz = (qj + 0.5) * Q;
    let best = null, bd = RING_YARD.maxR;
    RG.blocksOver?.(cx - RING_YARD.maxR, cz - RING_YARD.maxR, cx + RING_YARD.maxR, cz + RING_YARD.maxR, (b) => {
      if (!b.city) return;
      for (const L of b.lots) if (L.empty && L.lot) { const lx = (L.lot.x0 + L.lot.x1) / 2, lz = (L.lot.z0 + L.lot.z1) / 2, d = Math.hypot(lx - cx, lz - cz); if (d < bd) { bd = d; best = { x: lx, z: lz, w: Math.abs(L.lot.x1 - L.lot.x0), d: Math.abs(L.lot.z1 - L.lot.z0) }; } }
    });
    if (!best) return null;
    const cem = this.addFixed({ id, name: `${RG.nameAt?.(cx, cz) ?? 'THE RING'} YARD`, kind: 'lot_yard', x: best.x, z: best.z, pop: RING_YARD.pop, years: RING_YARD.years, danger: RING_YARD.danger, ring: true });
    cem.lot = best; cem.resolved = true; cem.y = this.ground(cem.x, cem.z);
    this.size(cem, best.w); // fit the rows to the lot
    this.keepOut(cem);
    return cem;
  }
  // The grave slots (local to the cemetery: lx across, lz along), row by row from the far side.
  slots(cem) {
    if (cem.slotList) return cem.slotList;
    const K = CEMETERY_KINDS[cem.kind], out = [];
    if (K.layout === 'trench') {
      for (let t = 0; t < cem.rows; t++) for (let q = 0; q < cem.cols; q++) out.push({ lx: -cem.w / 2 + 2 + q * K.sp[0], lz: -cem.d / 2 + 2 + t * K.sp[1] + K.sp[1] / 2 });
    } else if (K.layout === 'rows') return (cem.slotList = (cem.L ?? (this.size(cem), cem.L)).slots);
    else {
      for (let r = 0; r < cem.rows; r++) for (let q = 0; q < cem.cols; q++) out.push({ lx: -cem.w / 2 + 1.5 + (q + 0.5) * K.sp[0], lz: -cem.d / 2 + 1.5 + (r + 0.5) * K.sp[1] - 0.6 });
    }
    return (cem.slotList = out);
  }
  slotWorld(cem, n) { const s = this.slots(cem)[n], a = cem.a, sn = Math.sin(a), c = Math.cos(a); return s ? { x: cem.x + s.lx * c + s.lz * sn, z: cem.z - s.lx * sn + s.lz * c } : { x: cem.x, z: cem.z }; }
  // The history it tells: its old graves (pure, from its seed; never stored).
  gravesOf(cem) {
    if (cem.history) return cem.history;
    const rng = makeRng(cem.seed), K = CEMETERY_KINDS[cem.kind], out = [];
    const W = CAUSES.map(([, w, d]) => Math.max(0.2, w + d * cem.danger)), WT = W.reduce((a, b) => a + b, 0);
    const fam = () => RES_NAMES.last[Math.floor(rng() * RES_NAMES.last.length)], first = () => RES_NAMES.first[Math.floor(rng() * RES_NAMES.first.length)];
    const families = Array.from({ length: Math.max(2, Math.ceil(cem.count / 9)) }, fam);
    const mass = cem.kind === 'mass_grave', year0 = CALENDAR.now - cem.years;
    const battleYear = year0 + Math.floor(rng() * cem.years);
    for (let n = 0; n < cem.count; n++) {
      let p = rng() * WT, ci = 0; while (ci < W.length - 1 && (p -= W[ci]) > 0) ci++;
      const died = mass && rng() < 0.85 ? battleYear : year0 + Math.floor(rng() * cem.years), age = CAUSES[ci][0] === 'old age' ? 55 + Math.floor(rng() * 35) : CAUSES[ci][0] === 'childbirth' ? 17 + Math.floor(rng() * 20) : Math.floor(rng() * 60) + 1;
      const unknown = mass ? rng() < 0.6 : rng() < 0.08;
      const marker = pickMarker(K.mix, rng());
      out.push({ id: `${cem.id}#${n}`, n, name: unknown ? 'UNKNOWN' : `${first()} ${families[Math.floor(rng() * families.length)]}`.toUpperCase(), flag: this.g.randomFlag?.(rng) ?? 'US',
        born: died - age, died, cause: mass && died === battleYear ? 'the fighting' : CAUSES[ci][0], by: null, marker: unknown && marker === 'stone' ? 'cross' : marker,
        epitaph: EPITAPHS[Math.floor(rng() * EPITAPHS.length)], cal: CALENDAR.tag });
    }
    out.sort((a, b) => a.died - b.died);
    out.forEach((r, i) => { r.n = i; r.id = `${cem.id}#${i}`; });
    // a 'rows' yard: each family plot is one family's (their name on its graves), its markers by the family's means
    if (K.layout === 'rows') {
      const Lo = cem.L ?? (this.size(cem), cem.L), W = CEM_LAYOUT.wealth, pf = new Map(), roll = makeRng((cem.seed ^ 0x6d6b) >>> 0);
      out.forEach((r, i) => {
        const q = Lo.slots[i];
        if (!q) return;
        const P = Lo.plots[q.plot];
        if (!K.uniform && r.name !== 'UNKNOWN') { if (!pf.has(q.plot)) pf.set(q.plot, fam().toUpperCase()); r.name = `${r.name.split(' ')[0]} ${pf.get(q.plot)}`; r.family = pf.get(q.plot); }
        r.marker = pickMarker(P.wealth === 0 ? W.poor : P.wealth === 2 ? W.rich : K.mix, roll());
        if (r.name === 'UNKNOWN' && (r.marker === 'stone' || r.marker === 'iron')) r.marker = 'cross';
      });
    }
    return (cem.history = out);
  }
  // The cemetery for a spot: the place you are in (or the nearest within 2 km), else the nearest one at all.
  cemAt(x, z) {
    this.plan();
    const rec = this.g.citygen?.recAt?.(x, z, 300);
    if (rec) return this.cemFor(rec);
    const yard = this.ringYard(x, z);
    if (yard) return yard;
    let best = null, bd = Infinity;
    for (const c of this.cems.values()) { if (c.ring) continue; const d = Math.hypot(c.x - x, c.z - z); if (d < bd) { bd = d; best = c; } }
    return best;
  }

  // ---- burial: drag, dig, bury, burn, mark --------------------------------------------------------------------------
  bodyNear(x, z, reach = 2.2) {
    let best = null, bd = reach;
    for (const R of this.bodies.values()) {
      if (R.buried || R.burned) continue;
      const bx = R.c ? R.c.x : R.x, bz = R.c ? R.c.z : R.z, d = Math.hypot(bx - x, bz - z);
      if (d < bd) { bd = d; best = R; }
    }
    return best;
  }
  startDrag(R, who = this.g.player) {
    if (!R || R.buried || R.burned) return { ok: false, why: 'nobody there to drag' };
    if (R.stage >= 3) return { ok: false, why: 'bones do not drag: bury them where they lie' };
    this.drag = R; R.dragBy = who; who.dragging = R.c ?? R; if (R.c) R.c.dragged = who;
    this.stats.dragged++;
    this.g.emit('bodyDrag', { id: R.id, on: true, by: who.id });
    return { ok: true, text: `DRAGGING ${R.name.toUpperCase()}` };
  }
  stopDrag() {
    const R = this.drag;
    if (!R) return;
    const who = R.dragBy ?? this.g.player;
    if (who.dragging && (who.dragging === R.c || who.dragging === R || who.dragging.riteId === R.id)) who.dragging = null; // whatever it held of this body (it may have folded mid-drag)
    if (R.c) R.c.dragged = null;
    this.drag = null; R.dragBy = null;
    this.moveBox(R);
    this.g.emit('bodyDrag', { id: R.id, on: false, x: r1(R.x), z: r1(R.z) });
  }
  // The body follows behind whoever drags it (a smear of blood, blood.js sees a dead body moving).
  tickDrag(dt) {
    const R = this.drag;
    if (!R) return;
    const who = R.dragBy ?? this.g.player;
    const bx0 = R.c ? R.c.x : R.x, bz0 = R.c ? R.c.z : R.z;
    if (!who.alive || who.inVehicle || Math.hypot(who.x - bx0, who.z - bz0) > 4) { this.stopDrag(); return; } // gone from it (a car, a fall, a teleport): let go
    const back = (who.face ?? 0) + Math.PI, tx = who.x + Math.sin(back) * 1.1, tz = who.z + Math.cos(back) * 1.1;
    const k = Math.min(1, dt * 6);
    R.x += (tx - R.x) * k; R.z += (tz - R.z) * k; R.y = who.gy ?? 0;
    if (R.c) { R.c.x = R.x; R.c.z = R.z; R.c.gy = R.y; } else this.dirty = true;
    if (who === this.g.player && who.speed > BURIAL.dragSpeed) who.speed = BURIAL.dragSpeed;
    const m = this.memberOf(R); if (m) { m.x = r2(R.x); m.z = r2(R.z); }
  }
  moveBox(R) {
    const b = R.box && this.g.inventory?.boxes.get(R.box);
    if (b) { b.x = R.x; b.z = R.z; b.y = R.y; }
  }
  hasShovel(who = this.g.player) { return who === this.g.player ? BURIAL.shovels.some((id) => this.g.inventory?.carried.count(id) > 0) : !!who.shovel; }
  // Start digging a grave at (x, z): a channel of BURIAL.dig seconds (x handMul without a shovel), loud while it lasts.
  startDig(x, z, who = this.g.player, R = null) {
    if (this.dig) return { ok: false, why: 'already digging' };
    if ((this.g.water?.depthAt?.(x, z) ?? 0) > 0.05) return { ok: false, why: 'you cannot dig a grave in water' };
    const s = BURIAL.dig * (this.hasShovel(who) ? 1 : BURIAL.handMul) / (1 + (this.g.skillsSys?.level?.('athletics') ?? 0) * 0.05);
    this.dig = { x, z, y: who.gy ?? this.ground(x, z), who, left: s, total: s, R, noiseT: 0, a: who.face ?? 0 };
    this.g.emit('digStart', { x: r1(x), z: r1(z), seconds: r1(s), shovel: this.hasShovel(who) });
    return { ok: true, seconds: r1(s), text: this.hasShovel(who) ? 'DIGGING' : 'DIGGING WITH YOUR HANDS (A SHOVEL WOULD BE A THIRD OF THE TIME)' };
  }
  tickDig(dt) {
    const D = this.dig;
    if (!D) return;
    const who = D.who;
    if (!who.alive || Math.hypot(who.x - D.x, who.z - D.z) > BURIAL.reach + 1) { this.dig = null; this.g.emit('digStop', { why: 'walked away' }); return; }
    if (who === this.g.player) who.speed = 0;
    D.left -= dt;
    if ((D.noiseT -= dt) <= 0) { D.noiseT = BURIAL.noiseEvery; this.g.noise?.(D.x, D.z, BURIAL.noise, who); }
    if (D.left > 0) return;
    this.dig = null; this.stats.dug++;
    const cem = this.cemAt(D.x, D.z), inCem = cem && cem.resolved && Math.abs(D.x - cem.x) < cem.w / 2 + 2 && Math.abs(D.z - cem.z) < cem.d / 2 + 2;
    const H = { id: `hole:${++this.nextGrave}`, x: D.x, z: D.z, y: D.y, a: D.a, cem: inCem ? cem.id : null, by: who.id, at: r1(this.hours()) };
    this.holes.push(H); this.dirty = true;
    for (const F of this.funerals) if (F.state !== 'done' && F.cem === H.cem && !F.dug) { F.dug = who === this.g.player ? 'player' : who.id; if (who === this.g.player) this.standing(F, FUNERAL.standing.dug, 'dug the grave'); }
    this.g.emit('graveDug', { hole: H.id, x: r1(H.x), z: r1(H.z), cem: H.cem });
    if (D.R) this.bury(D.R, who);
  }
  holeNear(x, z, r = BURIAL.reach) { let best = null, bd = r; for (const H of this.holes) { const d = Math.hypot(H.x - x, H.z - z); if (d < bd) { bd = d; best = H; } } return best; }
  // Bury a body: in an open grave within reach (or dig one first). Writes a grave row; its things go into the grave's
  // box (grave:<id>), not into nothing (digging one up again is the grave robber's deed).
  bury(R, who = this.g.player, opts = {}) {
    const g = this.g;
    if (!R || R.buried || R.burned) return { ok: false, why: 'nothing to bury' };
    const bx = R.c ? R.c.x : R.x, bz = R.c ? R.c.z : R.z;
    let H = opts.hole ?? this.holeNear(bx, bz) ?? this.holeNear(who.x, who.z);
    if (!H) { if (opts.dig === false) return { ok: false, why: 'no open grave: dig one' }; return this.startDig(who.x + Math.sin(who.face ?? 0) * 1.5, who.z + Math.cos(who.face ?? 0) * 1.5, who, R); }
    if (this.drag === R) this.stopDrag();
    this.holes.splice(this.holes.indexOf(H), 1);
    const cem = H.cem ? this.cems.get(H.cem) : null;
    const day = g.society?.day ?? 0, hour = r2(g.sky?.time ?? 0);
    const gr = { id: `grave:${this.nextGrave++}`, cem: cem?.id ?? null, x: r1(H.x), z: r1(H.z), y: r1(H.y), name: R.name, flag: R.flag, faction: R.faction, died: { h: r1(R.at) }, buried: { day, hour },
      cause: R.cause, by: R.by, buriedBy: who === g.player ? 'player' : who.name ?? who.id, marker: opts.marker ?? 'mound', box: null, owner: cem?.place ?? 'nobody', stage: DECAY.stages[R.stage].id, body: R.id };
    // the dead's things go down with them (the box keeps its id's contents, moved under the grave's id)
    const inv = g.inventory, box = R.box && inv?.boxes.get(R.box);
    if (box) { const gb = inv.place(`${gr.id}`, box.kind, H.x, H.z, box.cap, `GRAVE · ${R.name.toUpperCase()}`); gb.slots = box.slots; gb.rolled = box.rolled; if (!box.rolled) gb.seed = box.seed; gb.buried = true; gb.y = H.y; inv.boxes.delete(box.id); if (inv.opened === box) inv.opened = null; gr.box = gb.id; }
    if (cem) { cem.added.push(gr); gr.n = this.gravesOf(cem).length + cem.added.length - 1; const s = this.slotWorld(cem, gr.n); gr.slot = s; }
    // a cross or a stone you carry goes on it
    const mark = opts.marker ? null : Object.keys(BURIAL.mark).find((id) => who === g.player && inv?.carried.count(id) > 0);
    if (mark) { this.takeOne(mark); gr.marker = BURIAL.mark[mark]; }
    this.graves.push(gr);
    R.buried = gr.id; R.grave = gr.id;
    if (R.c) { const c = R.c; R.c = null; g.removeChar(c); }
    const m = this.memberOf(R); if (m) m.gone = true;
    this.stats.buried++; this.dirty = true;
    g.society?.chronicle?.add({ t: +g.time.toFixed(2), day, hr: hour, a: who === g.player ? 'player' : who.id ?? '', af: who === g.player ? 'player' : who.fid ?? '', v: 'buried', o: R.id, on: R.name, of: R.fid ?? R.faction ?? '', p: this.placeOf(H.x, H.z) ?? '', x: r1(H.x), z: r1(H.z), m: 1, k: 0, src: 'rites' });
    for (const F of this.funerals) if (F.body === R.id && F.state !== 'done') F.grave = gr.id;
    g.emit('buried', { grave: gr.id, body: R.id, name: R.name, cem: gr.cem, by: gr.buriedBy, marker: gr.marker, box: gr.box });
    return { ok: true, grave: gr, text: `${R.name.toUpperCase()} IS BURIED${gr.marker !== 'mound' ? ` · A ${gr.marker.toUpperCase()} ON IT` : ''}` };
  }
  takeOne(id) { const C = this.g.inventory.carried, i = C.slots.findIndex((s) => s.id === id); if (i < 0) return false; if (--C.slots[i].n <= 0) C.slots.splice(i, 1); this.g.inventory.changed?.(); return true; }
  // Burn a body: a fuel can's worth, a fire that burns BURIAL.burn.s; ash and bone; what was on it falls to the ground.
  burn(R, who = this.g.player) {
    const g = this.g, inv = g.inventory, B = BURIAL.burn;
    if (!R || R.buried || R.burned) return { ok: false, why: 'nothing to burn' };
    if (who === g.player && !(inv?.carried.count(B.item) > 0)) return { ok: false, why: 'no fuel: a fuel can' };
    if (who === g.player) this.takeOne(B.item);
    if (this.drag === R) this.stopDrag();
    R.burning = B.s; this.burnT = R;
    g.emit('bodyBurn', { id: R.id, name: R.name, x: r1(R.x), z: r1(R.z) });
    return { ok: true, text: `${R.name.toUpperCase()} BURNS` };
  }
  tickBurn(dt) {
    const R = this.burnT, g = this.g;
    if (!R) return;
    const bx = R.c ? R.c.x : R.x, bz = R.c ? R.c.z : R.z;
    if (R.c) R.c.charred = Math.min(1, (R.c.charred ?? 0) + dt / BURIAL.burn.s);
    if (Math.random() < dt * 6) g.fx?.fire?.(bx + (Math.random() - 0.5), 0.3, bz + (Math.random() - 0.5));
    if ((R.burning -= dt) > 0) return;
    this.burnT = null; R.burned = true; R.burning = 0; R.stage = 3; R.decay = Math.max(R.decay, DECAY.stages[3].at); this.stats.burned++; this.dirty = true;
    g.fx?.decal?.(bx, bz, 1.8, BURIAL.burn.ash);
    const inv = g.inventory, box = R.box && inv?.boxes.get(R.box);
    if (box) { if (!box.rolled) { inv.roll(box); box.rolled = true; } const pile = inv.groundAt(bx, bz, R.y ?? 0); for (const s of box.slots) inv.add(pile, s.id, s.n, s); inv.boxes.delete(box.id); if (inv.opened === box) inv.opened = null; inv.changed?.(); }
    if (R.c) { const c = R.c; R.c = null; g.removeChar(c); }
    R.burned = true; R.buried = null;
    const m = this.memberOf(R); if (m) m.gone = true;
    this.graves.push({ id: `pyre:${this.nextGrave++}`, cem: null, x: r1(bx), z: r1(bz), name: R.name, flag: R.flag, died: { h: r1(R.at) }, cause: R.cause, by: R.by, buriedBy: 'fire', marker: 'ash', owner: 'nobody', body: R.id });
    g.society?.chronicle?.add({ t: +g.time.toFixed(2), day: g.society?.day ?? 0, hr: r2(g.sky?.time ?? 0), a: 'player', af: 'player', v: 'burned', o: R.id, on: R.name, of: R.fid ?? R.faction ?? '', p: this.placeOf(bx, bz) ?? '', x: r1(bx), z: r1(bz), m: 1, k: 0, src: 'rites' });
    g.emit('bodyBurned', { id: R.id, name: R.name, x: r1(bx), z: r1(bz) });
  }
  // Put a marker on a grave (the item from your pack, or a stone paid for at a funeral).
  mark(grave, kind) {
    if (!grave) return { ok: false, why: 'no grave' };
    grave.marker = kind; this.dirty = true;
    this.g.emit('graveMarked', { grave: grave.id, marker: kind });
    return { ok: true, text: `A ${kind.toUpperCase()} FOR ${grave.name.toUpperCase()}` };
  }
  // Crew deaths (crew.js bury): the crew's grave is a grave row like any other.
  graveFromCrew(m, x, z, why) {
    const gr = { id: `grave:${this.nextGrave++}`, cem: null, x: r1(x), z: r1(z), name: m.name, flag: m.flag, faction: 'crew', died: { h: r1(this.hours()) }, cause: why, by: null, buriedBy: 'the crew', marker: 'cross', owner: 'player', crew: true };
    this.graves.push(gr);
    return gr;
  }

  // The player's keys (main.js frame, after crew.input): beside a dead body, hold E to drag it (a tap still goes through
  // it); while dragging, E lets go, G buries it here (digs first if there is no open grave; a shovel is faster), F burns it.
  input(I) {
    const g = this.g, p = g.player;
    if (!p.alive || p.inVehicle || g.dialogue?.active || (g.invUI?.open && this.ePress < 0)) { if (this.drag?.dragBy === p) this.stopDrag(); this.ePress = -1; return; }
    if (this.dig?.who === p) { g.hud?.prompt?.(`DIGGING · ${Math.max(0, this.dig.left).toFixed(0)} s`); return; }
    if (this.drag?.dragBy === p) {
      g.hud?.prompt?.(`<kbd>E</kbd> Let go · <kbd>G</kbd> Bury ${this.drag.name}${this.holeNear(p.x, p.z) ? '' : ' (dig)'} · <kbd>F</kbd> Burn`);
      if (I.hit('KeyE')) { I.pressed.delete('KeyE'); this.stopDrag(); }
      else if (I.hit('KeyG')) { I.pressed.delete('KeyG'); const r = this.bury(this.drag, p); g.hud?.toast?.(r.ok ? r.text : r.why.toUpperCase(), r.ok ? 'job' : 'warn'); }
      else if (I.hit('KeyF')) { I.pressed.delete('KeyF'); const r = this.burn(this.drag, p); g.hud?.toast?.(r.ok ? r.text : r.why.toUpperCase(), r.ok ? 'job' : 'warn'); }
      return;
    }
    const F = this.funeralHere(p.x, p.z);
    if (F && !F.stone && I.hit('KeyG')) { I.pressed.delete('KeyG'); const r = this.payStone(F); g.hud?.toast?.(r.ok ? r.text : r.why.toUpperCase(), r.ok ? 'job' : 'warn'); return; }
    const R = this.bodyNear(p.x, p.z, 1.8);
    if (!R) { this.ePress = -1; return; }
    // E is the body's only when nothing else claims it: no door or window in reach (their hold boards or picks), no
    // downed crew member (theirs is a drag too), and the nearest box is this body's own
    const box = g.inventory?.nearest(p.x, p.z, 2.2, true, p.gy ?? 0);
    if (g.interiors?.nearest?.(p) || g.interiors?.hold > 0 || g.crew?.drag || g.crew?.downedNear?.() || (box && box.id !== R.box)) { this.ePress = -1; return; }
    if (I.hit('KeyE')) { this.ePress = g.time; return; } // the tap still reaches main.js's box search
    if (this.ePress >= 0 && I.key('KeyE') && g.time - this.ePress > BURIAL.holdE) { this.ePress = -1; g.invUI?.toggle?.(false); const r = this.startDrag(R, p); g.hud?.toast?.(r.ok ? r.text : r.why.toUpperCase(), r.ok ? 'job' : 'warn'); }
    if (!I.key('KeyE')) this.ePress = -1;
  }

  // ---- funerals ----------------------------------------------------------------------------------------------------
  // Not everybody gets a funeral (FUNERAL.held): a roll on the body, likelier the more of the family is left to stand at
  // the grave. R.funeral (true/false) decides it outright (a test's staging; a story that needs one).
  holdsFuneral(R, rec) {
    if (typeof R.funeral === 'boolean') return R.funeral;
    const H = FUNERAL.held, left = rec.members.filter((m) => !m.dead && m.key !== R.member).length;
    return makeRng(hash(`${R.id}:funeral`))() < Math.min(H.max, H.base + H.mourner * left);
  }
  // A resident with family died: their funeral, 1-2 game days on at FUNERAL.hour, at their quarter's yard.
  schedule(R, rec, fact) {
    const g = this.g, now = this.hours(), rng = makeRng(hash(R.id));
    const after = now + FUNERAL.delay[0] + rng() * (FUNERAL.delay[1] - FUNERAL.delay[0]);
    const day = Math.floor(after / 24), start = day * 24 + FUNERAL.hour + (after % 24 > FUNERAL.hour ? 24 : 0);
    const cem = this.cemAt(R.x, R.z);
    const F = { id: `funeral:${R.id}`, body: R.id, name: R.name, house: rec.id, houseName: rec.ownerName ?? rec.name, fid: rec.fid, cem: cem?.id ?? null, cemName: cem?.placeName ?? null,
      start: r2(Math.min(start, now + FUNERAL.delay[1])), end: 0, state: 'scheduled', mourners: [], arrived: [], attended: false, dug: null, stone: false, grave: null, carrier: null,
      learned: fact, facts: R.news?.facts ?? [], killer: fact?.killer ?? null }; // what they know, from whom, since when (never more)
    if (F.start < now + FUNERAL.delay[0]) F.start = r2(now + FUNERAL.delay[0]);
    F.end = r2(F.start + FUNERAL.length);
    for (const m of rec.members) if (!m.dead && m.key !== R.member) F.mourners.push(m.key);
    this.funerals.push(F); this.stats.funerals++;
    if (this.funerals.length > 40) { const i = this.funerals.findIndex((q) => q.state === 'done'); if (i >= 0) this.funerals.splice(i, 1); }
    const when = `${this.dayName(F.start)} at ${FUNERAL.hour}`;
    g.society?.director?.radio?.(`STATIC 1660. ${F.houseName} bury ${R.name} ${when}, at ${F.cemName ?? 'the yard'}. Come if you knew them.`, 3);
    g.society?.chronicle?.add({ t: +g.time.toFixed(2), day: g.society?.day ?? 0, hr: r2(g.sky?.time ?? 0), a: rec.id, af: rec.fid ?? '', v: 'funeral', o: R.id, on: R.name, of: rec.fid ?? '', p: F.cem ?? '', x: r1(R.x), z: r1(R.z), m: 2, k: 0, src: 'rites' });
    g.emit('funeralScheduled', { id: F.id, name: R.name, house: rec.id, cem: F.cem, start: F.start, mourners: F.mourners.length, source: fact?.source ?? null, killer: F.killer });
    return F;
  }
  dayName(h) { const d = Math.floor(h / 24) - (this.g.society?.day ?? 0); return d <= 0 ? 'today' : d === 1 ? 'tomorrow' : `in ${d} days`; }
  funeralHere(x, z) {
    const h = this.hours();
    for (const F of this.funerals) { if (F.state !== 'under way' || h < F.start) continue; const at = this.funeralSpot(F); if (at && Math.hypot(at.x - x, at.z - z) < FUNERAL.attendR) return F; }
    return null;
  }
  // The grave the funeral stands at (dug for it in the yard).
  funeralSpot(F) {
    if (F.spot) return F.spot;
    const cem = F.cem && this.cems.get(F.cem);
    if (!cem) return null;
    const n = this.gravesOf(cem).length + cem.added.length + this.funerals.indexOf(F) % 6;
    return (F.spot = this.slotWorld(cem, Math.min(n, this.slots(cem).length - 1)));
  }
  // residents.think: a mourner's day. True: rites drives them this frame (walking there, standing at the grave).
  mourn(c, dt) {
    const S = c.res, m = S?.m;
    if (!m || !c.alive || !this.funerals.length) return false;
    const P = this.g.player; if (Math.abs(c.x - P.x) > 400 || Math.abs(c.z - P.z) > 400) return false; // past that the record tier (finish) carries the day
    const h = this.hours();
    for (const F of this.funerals) {
      if (F.state === 'done' || !F.mourners.includes(m.key)) continue;
      const at = this.funeralSpot(F);
      if (!at) continue;
      const R = this.bodies.get(F.body), bx = R ? (R.c ? R.c.x : R.x) : at.x, bz = R ? (R.c ? R.c.z : R.z) : at.z;
      // game hours on foot (a game hour is 60 s); whoever fetches the body walks to it first and drags it back slower
      const fetch = !F.carrier || F.carrier === m.key, far = R && !R.buried && !R.burned && Math.hypot(bx - at.x, bz - at.z) > 3;
      const travel = (fetch && far ? Math.hypot(bx - c.x, bz - c.z) / FUNERAL.walk + Math.hypot(at.x - bx, at.z - bz) / (FUNERAL.walk * 0.8) : Math.hypot(at.x - c.x, at.z - c.z) / FUNERAL.walk) / 60;
      if (h < F.start - travel - 0.25 || h > F.end + (F.waited || this.drag?.id === F.body ? FUNERAL.wait : 0)) continue;
      const res = this.g.residents;
      // the first of them fetches the body (if it still lies anywhere but the grave) and drags it there
      if (R && !R.buried && !R.burned && R.stage < 3 && (!F.carrier || F.carrier === m.key) && Math.hypot(bx - at.x, bz - at.z) > 3) {
        F.carrier = m.key; S.where = 'fetching the body';
        if (this.drag !== R || R.dragBy !== c) { if (Math.hypot(bx - c.x, bz - c.z) > 1.4) { res.walk(c, bx, bz, FUNERAL.walk * 1.2, dt); return true; } if (!this.drag) this.startDrag(R, c); else { c.speed = 0; return true; } }
        S.where = 'carrying the body';
        res.walk(c, at.x, at.z, FUNERAL.walk * 0.8, dt);
        return true;
      }
      if (Math.hypot(at.x - c.x, at.z - c.z) > 2.6) { S.where = 'to the funeral'; res.walk(c, at.x, at.z, FUNERAL.walk, dt); return true; }
      if (!F.arrived.includes(m.key)) { F.arrived.push(m.key); this.stats.mourners++; this.g.emit('mournerArrived', { funeral: F.id, who: m.key, name: m.name }); }
      if (this.drag?.dragBy === c) { this.stopDrag(); }
      S.where = 'mourning'; c.speed = 0; c.face = Math.atan2(at.x - c.x, at.z - c.z); c.crouch = h > F.start && ((h * 60) % 8) < 3;
      return true;
    }
    return false;
  }
  tickFunerals() {
    const g = this.g, h = this.hours(), P = g.player;
    for (const F of this.funerals) {
      if (F.state === 'done') continue;
      if (F.state === 'scheduled' && h >= F.start) { F.state = 'under way'; g.emit('funeralStarted', { id: F.id, name: F.name, cem: F.cem, mourners: F.mourners.length, arrived: F.arrived.length }); }
      if (F.state !== 'under way') continue;
      const at = this.funeralSpot(F);
      if (at && P.alive && Math.hypot(P.x - at.x, P.z - at.z) < FUNERAL.attendR && !F.attended) { F.attended = true; this.standing(F, FUNERAL.standing.attended, 'came to the funeral'); if (g.needs?.mood) g.needs.mood.gloom = Math.min(1, (g.needs.mood.gloom ?? 0) + FUNERAL.mood.gloom); g.emit('funeralAttended', { id: F.id }); }
      if (h < F.end) continue;
      // the body still on its way in someone's arms: they wait for it (up to FUNERAL.wait hours)
      if (this.drag?.id === F.body && this.drag.dragBy?.res && h < F.end + FUNERAL.wait) { F.waited = true; continue; }
      this.finish(F);
    }
  }
  // The funeral ends: the body goes in the ground (theirs, if it was brought; the record's own fold tier if the family is
  // off the map), the town's mood darkens, the mourners go home (residents.think takes them back once mourn says no).
  finish(F) {
    const g = this.g, R = this.bodies.get(F.body), at = this.funeralSpot(F);
    F.state = 'done';
    const rec = g.residents?.recs.get(F.house);
    const live = rec && rec.members.some((m) => m.c && F.mourners.includes(m.key));
    if (R && !R.buried && !R.burned && at) {
      const near = Math.hypot((R.c ? R.c.x : R.x) - at.x, (R.c ? R.c.z : R.z) - at.z) < 4;
      // Brought to the grave (seen), or the family off the map: the record tier carries it there on the same clock.
      if (near || !live) {
        if (!near) { R.x = at.x; R.z = at.z; if (R.c) { const c = R.c; R.c = null; g.removeChar(c); } }
        const hole = { id: `hole:${++this.nextGrave}`, x: at.x, z: at.z, y: this.ground(at.x, at.z), a: 0, cem: F.cem, by: F.house };
        this.bury(R, { id: F.house, name: F.houseName, x: at.x, z: at.z, face: 0 }, { hole, marker: F.stone ? 'stone' : 'cross' });
      }
    } else if (R?.grave && F.stone) { const gr = this.graves.find((q) => q.id === R.grave); if (gr) this.mark(gr, 'stone'); }
    if (this.drag && this.drag.id === F.body) this.stopDrag();
    const place = F.cem ?? F.house;
    this.moods[place] = Math.min(1, (this.moods[place] ?? 0) + FUNERAL.mood.gloom * (1 + F.arrived.length * 0.2));
    g.emit('funeralDone', { id: F.id, name: F.name, arrived: F.arrived.length, mourners: F.mourners.length, attended: F.attended, grave: F.grave ?? R?.grave ?? null, offscreen: !live });
  }
  standing(F, d, why) { this.g.society?.factions?.add(F.fid, d); this.g.emit('funeralStanding', { id: F.id, d, why }); }
  payStone(F) {
    if (!F || F.stone) return { ok: false, why: 'a stone is already paid for' };
    if (!this.g.spend?.(BURIAL.stoneCost)) return { ok: false, why: `a stone costs $${BURIAL.stoneCost}` };
    F.stone = true; this.standing(F, FUNERAL.standing.stone, 'paid for a stone');
    const R = this.bodies.get(F.body);
    if (R?.grave) { const gr = this.graves.find((q) => q.id === R.grave); if (gr) this.mark(gr, 'stone'); }
    return { ok: true, text: `A STONE FOR ${F.name.toUpperCase()} · -$${BURIAL.stoneCost}` };
  }

  // ---- the loot law: a trader's goods only from a visible delivery (trade.js restock / keep) --------------------------
  deliver(trader, items, source) {
    if (!DELIVERY.sources.includes(source?.kind)) return { ok: false, why: `a delivery needs a source: ${DELIVERY.sources.join(', ')}` };
    this.deliveries.push({ trader, items: items.map((s) => ({ ...s })), source: { kind: source.kind, id: source.id ?? null }, at: r1(this.hours()) });
    this.g.emit('delivered', { trader, n: items.length, source: source.kind });
    return { ok: true };
  }
  takeDelivery(trader) { const i = this.deliveries.findIndex((d) => d.trader === trader); return i < 0 ? null : this.deliveries.splice(i, 1)[0]; }

  // ---- for agents and the shard ---------------------------------------------------------------------------------------
  bodyView(R) {
    const P = this.g.player, bx = R.c ? R.c.x : R.x, bz = R.c ? R.c.z : R.z, box = R.box && this.g.inventory?.boxes.get(R.box);
    return { id: R.id, name: R.name, flag: R.flag, faction: R.faction, stage: DECAY.stages[R.stage].id, hours: r1(R.decay), since: r1(this.hours() - R.at), x: r1(bx), z: r1(bz), d: r1(Math.hypot(bx - P.x, bz - P.z)),
      folded: !R.c, wet: R.wet, by: R.by, cause: R.cause, box: R.box, items: box ? (box.rolled ? box.slots.map((s) => `${s.id}x${s.n}`) : 'unsearched') : null, buried: R.buried ?? null, burned: !!R.burned, eaten: !!R.eaten, dragging: this.drag === R, smell: DECAY.stages[R.stage].smell };
  }
  cemView(cem, full = false) {
    this.resolve(cem);
    const G = this.gravesOf(cem);
    const v = { id: cem.id, place: cem.place, name: `${cem.placeName} · ${CEMETERY_KINDS[cem.kind].name}`, kind: cem.kind, placeKind: cem.placeKind, x: cem.x, z: cem.z, y: r1(cem.y), w: r1(cem.w), d: r1(cem.d), resolved: cem.resolved, clash: cem.clash ?? null,
      pop: cem.pop, years: cem.years, danger: cem.danger, formula: `max(${FORMULA.min}, ceil(${cem.pop} x ${cem.years} x ${FORMULA.rate} x (1 + ${cem.danger})))`, graves: cem.count, expected: graveCount(cem.pop, cem.years, cem.danger), history: G.length, added: cem.added.length, battle: cem.battle, mood: r2(this.moods[cem.id] ?? 0) };
    if (full) { v.oldest = G.slice(0, 5); v.newest = [...G.slice(-3), ...cem.added.slice(-5)]; v.causes = {}; for (const r of G) v.causes[r.cause] = (v.causes[r.cause] ?? 0) + 1; }
    return v;
  }
  summary() {
    this.plan();
    const by = {};
    for (const R of this.bodies.values()) by[DECAY.stages[R.stage].id] = (by[DECAY.stages[R.stage].id] ?? 0) + 1;
    const kinds = {}; for (const c of this.cems.values()) kinds[c.kind] = (kinds[c.kind] ?? 0) + 1;
    return { bodies: this.bodies.size, byStage: by, folded: [...this.bodies.values()].filter((R) => !R.c).length, cemeteries: this.cems.size, cemKinds: kinds, graves: this.graves.length, holes: this.holes.length,
      funerals: this.funerals.map((F) => ({ id: F.id, name: F.name, state: F.state, start: F.start, mourners: F.mourners.length, arrived: F.arrived.length, learned: F.learned?.source ?? null })), unreported: this.news.filter((R) => !R.news.learned).map((R) => ({ id: R.id, name: R.name, house: R.news.house, hours: r1(this.hours() - R.news.at) })), drawn: { instances: this.instances ?? 0, bodies: this.drawnBodies ?? 0, cems: this.drawnCems ?? [] }, stats: { ...this.stats } };
  }
  save() {
    const bodies = [];
    for (const R of this.bodies.values()) {
      const box = R.box && this.g.inventory?.boxes.get(R.box);
      bodies.push({ id: R.id, box: R.box, boxKind: box?.kind, boxSeed: box?.seed, boxLabel: box?.label, name: R.name, flag: R.flag, faction: R.faction, fid: R.fid, x: r2(R.c ? R.c.x : R.x), z: r2(R.c ? R.c.z : R.z), y: r2(R.y), face: r2(R.face), at: R.at, decay: r2(R.decay), stage: R.stage,
        by: R.by, cause: R.cause, colors: R.colors, house: R.house, member: R.member, news: R.news ?? null, buried: R.buried ?? null, burned: !!R.burned, eaten: !!R.eaten });
    }
    return { bodies, graves: this.graves, added: [...this.cems.values()].filter((c) => c.added.length).map((c) => ({ id: c.id, added: c.added.map((g) => g.id) })), funerals: this.funerals, news: this.news.map((R) => R.id), holes: this.holes, moods: this.moods, next: this.nextGrave, deliveries: this.deliveries, stats: this.stats };
  }
  load(s) {
    if (!s) return;
    const inv = this.g.inventory;
    this.bodies.clear();
    for (const b of s.bodies ?? []) {
      const R = { ...b, c: null, folded: true, handled: 0 };
      // a body never searched was not in the inventory save: its box again, same seed, same loot when opened
      if (b.box && inv && !b.member && !inv.boxes.has(b.box) && !b.buried && !b.burned && b.boxKind) { const box = inv.place(b.box, b.boxKind, b.x, b.z, 20, b.boxLabel, b.boxSeed); box.y = b.y; }
      this.bodies.set(R.id, R);
    }
    this.graves = s.graves ?? [];
    this.plan();
    for (const a of s.added ?? []) { const cem = this.cems.get(a.id) ?? (a.id.startsWith('cem:ring:') ? null : null); if (cem) cem.added = a.added.map((id) => this.graves.find((g) => g.id === id)).filter(Boolean); }
    this.news = (s.news ?? []).map((id) => this.bodies.get(id)).filter((R) => R?.news);
    this.funerals = s.funerals ?? []; this.holes = s.holes ?? []; this.moods = s.moods ?? {}; this.nextGrave = s.next ?? 1; this.deliveries = s.deliveries ?? [];
    this.lastH = null; this.drag = null; this.dig = null; this.burnT = null; this.dirty = true;
    for (const c of this.g.chars) c.riteId = null;
    this.link();
  }
}
