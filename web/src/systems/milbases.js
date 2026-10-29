// THE MILITARY BASES, RUN (docs/design/WEB_MILITARY_BASES.md; rows data/military bases in data/milbases.js, the plan
// world/citygen/milbase.js). Citygen stamps a base when you come near and releases it when you leave (systems/citygen.js
// onBuilt / onReleased call here); this runs what lives in it, by the row's state:
//   held     a garrison of the holder's faction at the gates, the towers' feet, the armory door and the HQ, a patrol on the
//            ring road, and a quartermaster at his counter. The gate rule (bases.js's, with its BASE_RULES): a sentry who
//            SEES you inside the wire challenges you once; stay `grace` s, come back inside `warnMemory` s, fire near the
//            wire or hurt one of them and the post opens fire. A friendly player is waved through, a hated one shot on sight.
//   overrun  the infected stand in clusters through the yard. A noise is heard by those in reach (systems/zombies.js, law 6);
//            one that heard it MOANS, and the infected within MB_RULES.horde.relay m hear that after a beat, hop by hop:
//            a gunshot at the gate brings the yard pouring out of it.
//   sealed   nobody home. The generator on the bunker apron is dry (E with a fuel can in your pack starts it); the blast
//            door's code is on the duty log inside the command post (E reads it); the door opens for both, never one.
// Everything persists per base in this.recs (the save): power, the code you read, the blast door, the warning you were
// given, who of the garrison is dead (they are not hired again), how many of the horde fell (they do not come back).
// The armory and every crate roll ONCE (inventory.registerRing keeps their slots across stamps): the loot never refills.
import { MILBASES_BY_ID, MB_RULES, MB_LOOT, MB_TRADER, MB_LINES } from '../data/milbases.js';
import { BASE_RULES } from '../data/bases.js';
import { LOOT } from '../data/items.js';
import { TRADERS } from '../data/trade.js';
import { makeRng, angleLerp } from '../engine/rng.js';
import { outfit } from './characters.js';
import { randomName } from '../data/npcs.js';
import { AMBIENT_RESERVE } from './zombies.js';

const r1 = (v) => Math.round(v * 10) / 10;
const lerp = (a, b, t) => a + (b - a) * t;
const hashS = (s) => { let v = 2166136261; for (let i = 0; i < s.length; i++) { v ^= s.charCodeAt(i); v = Math.imul(v, 16777619); } return v >>> 0; };

export class Milbases {
  constructor(g) {
    this.g = g;
    this.live = new Map();  // base id -> the live site (only while citygen has it stamped)
    this.recs = new Map();  // base id -> what persists (power, code read, blast door, warnings, the dead)
    this.relayQ = [];       // pending moans: { t, x, z, s, hop }
    this.counts = { built: 0, released: 0, warnings: 0, alarms: 0, relays: 0, powered: 0, opened: 0, spawned: 0 };
    for (const [k, T] of Object.entries(MB_LOOT)) if (!LOOT[k]) LOOT[k] = T; // the base tables beside the world's (as the underground's)
    if (!TRADERS[MB_TRADER.id]) TRADERS[MB_TRADER.id] = { name: MB_TRADER.name, deals: MB_TRADER.deals };
  }

  rec(id) {
    let r = this.recs.get(id);
    if (!r) {
      const M = MILBASES_BY_ID.get(id);
      r = { power: M.status !== 'sealed', code: String(1000 + (hashS(`${id}:code`) % 9000)), learned: false, blast: M.status !== 'sealed', warnedAt: -1e9, dead: [], fell: 0 };
      this.recs.set(id, r);
    }
    return r;
  }
  inside(s, x, z, margin = 0) { const f = s.outer; return x > f.x0 - margin && x < f.x1 + margin && z > f.z0 - margin && z < f.z1 + margin; }

  // ---- citygen's hooks ------------------------------------------------------------------------------------------------
  onBuilt(t) {
    const mb = t.T.mb;
    if (!mb) return;
    const g = this.g, M = MILBASES_BY_ID.get(mb.id), R = this.rec(M.id), y = t.built.y0 ?? 0;
    const s = { id: M.id, row: M, t, mb, run: t.built.mb, y, name: M.name, faction: M.holder, outer: mb.fences[0], inner: mb.fences[1],
      guards: [], horde: [], qm: null, alert: 'calm', why: null, warnT: 0, outT: 0, coolT: 0, cleared: false, shotWarned: false,
      seenBy: null, checkT: 0, lastSeen: { x: 0, z: 0, t: -1e9 }, armoryLocked: false, site: null };
    this.live.set(M.id, s);
    this.counts.built++;
    // the doors as this base's record left them
    this.setBlast(s, R.blast, true);
    // the underground level under the command post: the atlas's own state-base site moved under the portal, or a new one
    const U = g.under;
    if (U) {
      const sid = U.byId.has(`base_${M.id}`) ? `base_${M.id}` : `mb_${M.id}`;
      let row = U.byId.get(sid);
      if (!row) { row = { id: sid, name: `${M.name} · BELOW`, kind: 'bunker', entrance: 'hatch', dir: 'S', levels: 2, seed: hashS(sid), base: M.id }; U.sites.push(row); U.byId.set(sid, row); }
      Object.assign(row, { x: mb.hatch.x, z: mb.hatch.z, dir: 'S', place: false, holdout: M.status === 'held' && M.holder === 'remnant' ? 'remnant' : undefined, power: R.power, fuel: R.power ? 0.6 : 0 });
      const ur = U.recs?.get(sid); if (ur) { ur.place = null; ur.power = R.power; }
      s.site = sid;
    }
    if (M.status === 'held') this.garrison(s);
    else if (M.status === 'overrun') this.infest(s);
  }
  onReleased(t) {
    const mb = t.T.mb;
    if (!mb) return;
    const s = this.live.get(mb.id);
    if (!s) return;
    const R = this.rec(s.id), g = this.g;
    for (const c of s.guards) { if (!c.alive && !R.dead.includes(c.mbPost)) R.dead.push(c.mbPost); if (g.chars.includes(c)) g.removeChar(c); }
    for (const c of s.horde) { if (!c.alive) R.fell++; if (g.chars.includes(c)) g.removeChar(c); }
    if (s.qm && g.chars.includes(s.qm)) g.removeChar(s.qm);
    this.live.delete(s.id);
    this.counts.released++;
  }

  // ---- held: the garrison ---------------------------------------------------------------------------------------------
  garrison(s) {
    const g = this.g, M = s.row, G = MB_RULES.garrison, R = this.rec(s.id), rng = makeRng(hashS(`${s.id}:garrison`));
    const raider = M.holder === 'dustwolves';
    const enlist = (key, x, z, extra) => {
      if (R.dead.includes(key)) return null; // the dead stay dead
      let u = rng(), weapon = 'rifle';
      for (const [w, p] of Object.entries(G.weapons)) if ((u -= p) <= 0) { weapon = w; break; }
      const c = g.addChar({ x, z, faction: raider ? 'raider' : 'soldier', weapon, hp: G.hp, colors: outfit(raider ? 'raider' : 'soldier', rng), name: randomName(rng), flag: rng() < 0.6 ? 'US' : g.randomFlag(rng) });
      if (!c) return null;
      c.fid = M.holder; g.society?.factions?.assign?.(c);
      c.mbId = s.id; c.mbPost = key; c.grenades = rng() < 0.3 ? 1 : 0;
      Object.assign(c, extra);
      s.guards.push(c); this.counts.spawned++;
      return c;
    };
    const mb = s.mb;
    mb.posts.forEach((p, i) => { if (p.role === 'qm') return; enlist(`post${i}`, p.x, p.z, { post: { x: p.x, z: p.z, face: p.face, role: p.role }, face: p.face }); });
    // the towers' feet: the four corners first, then every other one, `tower` sentry each
    const towers = [...mb.towers.slice(0, 4), ...mb.towers.slice(4).filter((_, i) => i % 2 === 0)];
    towers.forEach((T, i) => { for (let k = 0; k < G.tower; k++) enlist(`tower${i}.${k}`, T.post.x, T.post.z, { post: { x: T.post.x, z: T.post.z, face: T.face, role: 'tower' }, face: T.face }); });
    for (let k = 0; k < G.patrol; k++) { const ri = Math.floor((k * mb.patrol.length) / G.patrol), wp = mb.patrol[ri]; enlist(`patrol${k}`, wp.x, wp.z, { route: mb.patrol, ri: (ri + 1) % mb.patrol.length, pace: 1.35 }); }
    for (let k = 0; k < G.yard; k++) { const c = mb.clusters[k % mb.clusters.length]; enlist(`yard${k}`, c.x + 2 * k, c.z, { post: { x: c.x + 2 * k, z: c.z, face: 0, role: 'yard' } }); }
    // the quartermaster: a Remnant base's trader (raiders do not run a counter), behind his counter's boxes
    const q = mb.posts.find((p) => p.role === 'qm');
    if (G.quartermaster && !raider && q && !R.dead.includes('qm')) {
      const name = randomName(rng), flag = rng() < 0.6 ? 'US' : g.randomFlag(rng);
      const c = g.addChar({ x: q.x, z: q.z, faction: 'soldier', weapon: 'pistol', hp: 120, colors: outfit('soldier', rng), name, flag,
        npc: { id: MB_TRADER.id, name, title: `Quartermaster · ${M.name}`, flag, faction: M.holder, portrait: { seed: hashS(s.id) % 997, skin: rng.pick(['#9a6a44', '#c08a62', '#6a4a32', '#e0b48a']), hair: '#2a1e18', hat: 'cap', mood: 'neutral', shirt: '#5e6044', gear: 'none' }, ...this.qmTalk(s) } });
      if (c) {
        c.fid = M.holder; g.society?.factions?.assign?.(c);
        c.mbId = s.id; c.mbPost = 'qm'; c.post = { x: q.x, z: q.z, face: q.face, role: 'qm' }; c.face = q.face; c.hold = true;
        s.qm = c; s.guards.push(c);
        const inv = g.inventory;
        if (inv) for (const b of mb.qmBoxes) { let box = inv.boxes.get(b.id); if (!box) box = inv.place(b.id, b.table, b.x, b.z, b.cap, b.label); box.owner = c.id; box.y = s.y; }
      }
    }
  }
  qmTalk(s) {
    const sys = this;
    return { start: 'hi', nodes: {
      hi: { text: () => MB_LINES.qm, choices: [
        { t: 'Let me see the counter.', do: (g) => { const c = sys.live.get(s.id)?.qm; if (c) g.trade?.openCounter(c); }, end: true },
        { t: '[Leave]', end: true },
      ] },
    } };
  }

  // ---- overrun: the horde ------------------------------------------------------------------------------------------------
  infest(s) {
    const g = this.g, Z = g.zombies, H = MB_RULES.horde, R = this.rec(s.id), rng = makeRng(hashS(`${s.id}:horde`));
    if (!Z) return;
    const n = Math.max(0, H.bodies - R.fell), cl = s.mb.clusters.slice(0, Math.max(H.clusters, 1));
    // the gate yards first (whoever stands nearest the gate hears the road), then the yard's clusters
    g.population?.make(n); // room for them: far ambient people fold into records, farthest first (systems/population.js)
    const spots = [...s.mb.gates.map((q) => ({ x: q.x + (q.side === 'W' ? 34 : -34), z: q.z + 12 })), ...cl];
    for (let i = 0; i < n; i++) {
      if ((g.freeSlots?.length ?? 99) <= AMBIENT_RESERVE) break; // never the last slots: the world needs its people
      const c0 = spots[i % spots.length];
      let x = c0.x, z = c0.z, k = 0;
      do { x = c0.x + (rng() - 0.5) * 18; z = c0.z + (rng() - 0.5) * 14; } while (++k < 6 && g.statics.pointBlocked(x, z, 0.5)); // on open ground (the base's boxes are live by now)
      if (k >= 6) continue;
      const c = Z.spawn(x, z, rng() < H.sprinters);
      if (!c) break;
      c.mbId = s.id; c.cgTown = s.t.rec.id; c.wx = c.x; c.wz = c.z; c.timer = 4 + rng() * 10;
      s.horde.push(c); this.counts.spawned++;
    }
  }
  // A moan carries: the infected of this base within `relay` m of the moaner at (x, z) hear it after a beat, and turn the
  // way it is going - toward (tx, tz), the noise it answered, rougher every hop (law 6: they follow the moaning, they never
  // learn where you are) - and moan on.
  relay(s, x, z, hop, from, tx, tz) {
    const H = MB_RULES.horde, g = this.g;
    if (hop > H.hops) return;
    for (const c of s.horde) {
      if (!c.alive || c === from || c.mbHeard > g.time - 6) continue;
      const d = Math.hypot(c.x - x, c.z - z);
      if (d > H.relay) continue;
      c.mbHeard = g.time;
      this.relayQ.push({ t: g.time + lerp(H.relayDelay[0], H.relayDelay[1], Math.random()), c, x: tx, z: tz, s: s.id, hop });
    }
  }

  // ---- the sealed puzzle (the agent commands call these same functions: the real path) --------------------------------
  // Start the generator: a fuel can from your pack, standing at it.
  power(s, by = this.g.player) {
    const g = this.g, R = this.rec(s.id), G = s.mb.generator;
    if (R.power) return { ok: true, already: true };
    if (Math.hypot(by.x - G.x, by.z - G.z) > 3.2) return { ok: false, why: 'not at the generator' };
    const inv = g.inventory;
    if (!inv || inv.carried.count('fuel_can') < MB_RULES.sealed.fuel) return { ok: false, why: 'the generator is dry: it wants a fuel can' };
    inv.spend('fuel_can', MB_RULES.sealed.fuel);
    R.power = true; this.counts.powered++;
    const U = g.under, row = s.site && U?.byId.get(s.site);
    if (row) { row.power = true; const ur = U.rec(row); ur.power = true; ur.fuel = Math.max(ur.fuel ?? 0, 0.5); }
    g.noise?.(G.x, G.z, 24, 'generator');
    g.hud?.toast?.(`${s.name}: THE GENERATOR CATCHES · THE KEYPAD LIGHTS`, 'job');
    g.emit?.('milbasePower', { base: s.id });
    return { ok: true };
  }
  // Read the duty log in the command post: the code is yours from then on.
  read(s, by = this.g.player) {
    const g = this.g, R = this.rec(s.id), L = s.mb.log;
    if (Math.hypot(by.x - L.x, by.z - L.z) > 2.6) return { ok: false, why: 'not at the duty log' };
    R.learned = true;
    const text = MB_LINES.log.replace('{base}', s.name).replace('{code}', R.code);
    g.hud?.subtitle?.(text, 7);
    g.emit?.('milbaseLog', { base: s.id });
    return { ok: true, text, code: R.code };
  }
  // The blast door: power, and the code keyed in (you must have read it).
  keypad(s, code, by = this.g.player) {
    const g = this.g, R = this.rec(s.id), B = s.mb.blast;
    if (R.blast) return { ok: true, already: true };
    if (Math.hypot(by.x - B.x, by.z - B.z) > 3.4) return { ok: false, why: 'not at the blast door' };
    if (!R.power) return { ok: false, why: 'the keypad is dead: no power' };
    if (String(code) !== R.code) return { ok: false, why: 'the keypad buzzes: wrong code' };
    this.setBlast(s, true); R.blast = true; this.counts.opened++;
    g.noise?.(B.x, B.z, 30, 'blastdoor');
    g.hud?.toast?.(`${s.name}: THE BLAST DOOR GRINDS OPEN`, 'job');
    g.emit?.('milbaseBlast', { base: s.id });
    return { ok: true };
  }
  setBlast(s, open, quiet = false) {
    const b = s.run?.blast;
    if (!b) return;
    b.open = open; b.box.base = open ? 99 : 0;
    const it = s.t.built.items[b.panel]; it.down = !open;
    const CG = this.g.citygen;
    if (!quiet && it.idx !== undefined && CG) { CG.place(it.idx, true); CG.mesh.instanceMatrix.needsUpdate = true; }
  }

  // E near the base's own things (main.js, after the doors, windows and roll-ups): the generator, the log, the blast door.
  interact(p, I, dt) {
    if (!this.live.size || p.inVehicle) return null;
    const g = this.g, hud = g.hud, hit = I.hit('KeyE');
    for (const s of this.live.values()) {
      if (!this.inside(s, p.x, p.z, 4)) continue;
      const R = this.rec(s.id), G = s.mb.generator, L = s.mb.log, B = s.mb.blast;
      if (!R.power && Math.hypot(p.x - G.x, p.z - G.z) < 3.2) {
        const has = (g.inventory?.carried.count('fuel_can') ?? 0) >= MB_RULES.sealed.fuel;
        hud?.prompt?.(has ? '<kbd>E</kbd> Pour a fuel can in and start the generator' : 'Generator · dry (it wants a fuel can)');
        if (hit && has) this.power(s, p);
        return { x: G.x, z: G.z, len: 2 };
      }
      if (Math.hypot(p.x - L.x, p.z - L.z) < 2.6 && (p.gy ?? 0) - s.y < 1.5) {
        hud?.prompt?.('<kbd>E</kbd> Read the duty log');
        if (hit) this.read(s, p);
        return { x: L.x, z: L.z, len: 1.2 };
      }
      if (!R.blast && Math.hypot(p.x - B.x, p.z - B.z) < 3.4) {
        hud?.prompt?.(!R.power ? 'Blast door · the keypad is dead (no power)' : R.learned ? `<kbd>E</kbd> Key in ${R.code}` : 'Blast door · the keypad wants a code');
        if (hit && R.power && R.learned) this.keypad(s, R.code, p);
        return { x: B.x, z: B.z, len: B.w };
      }
    }
    return null;
  }

  // ---- per frame ---------------------------------------------------------------------------------------------------------
  update(dt) {
    if (!this.live.size && !this.relayQ.length) return;
    const g = this.g;
    // the moans that have carried
    for (let i = this.relayQ.length - 1; i >= 0; i--) {
      const q = this.relayQ[i];
      if (q.t > g.time) continue;
      this.relayQ.splice(i, 1);
      const c = q.c, s = this.live.get(q.s);
      if (!s || !c.alive) continue;
      const sc = 3 * q.hop, tx = q.x + (Math.random() - 0.5) * 2 * sc, tz = q.z + (Math.random() - 0.5) * 2 * sc;
      g.zombies?.remember(c, tx, tz, 'sound');
      c.wx = tx; c.wz = tz; c.timer = 10;
      this.counts.relays++;
      this.relay(s, c.x, c.z, q.hop + 1, c, q.x, q.z); // and it moans on
    }
    for (const s of this.live.values()) {
      if (s.row.status === 'held') this.watch(s, dt);
      if (!s.armoryLocked) this.lockArmory(s);
    }
  }
  // The armory's doors are locked steel (pick, kick, pry, or a charge): once its doors hang (citygen.openings).
  lockArmory(s) {
    const I = this.g.interiors, A = s.t.blds.find((R) => R.B === s.mb.armory);
    if (!A?.open || !I) return;
    const rec = I.ringOpen.get(A.open);
    if (!rec) return;
    for (const door of rec.doors) I.setLocked(door, true);
    s.armoryLocked = true;
  }

  // ---- the gate rule (bases.js's watch, for a generated base; its BASE_RULES) ---------------------------------------------
  tier(s) { const F = this.g.society?.factions, i = F?.index[s.faction]; return i === undefined ? 'neutral' : F.tiers[i]; }
  spotRange() {
    const g = this.g, P = g.player, R = BASE_RULES, v = P.inVehicle;
    let range = lerp(R.spotDay, R.spotNight, g.sky?.night ?? 0);
    if (v) range *= R.vehicleMul; else if (P.prone && g.stance) range = g.stance.seenRange(P, range, R.crouchMul, P.x, P.z); else if (P.crouch) range *= R.crouchMul;
    return range;
  }
  spotter(s) {
    const g = this.g, P = g.player;
    if (!P.alive || P.hidden || P.underwater || P.ug) return null;
    const v = P.inVehicle, px = v ? v.x : P.x, pz = v ? v.z : P.z;
    let best = null, bd = this.spotRange();
    for (const c of s.guards) {
      if (!c.alive || c.inVehicle || c === s.qm) continue;
      const d = Math.hypot(c.x - px, c.z - pz);
      if (d < bd && g.los(c.x, c.z, px, pz)) { bd = d; best = c; }
    }
    return best;
  }
  watch(s, dt) {
    const g = this.g, P = g.player, R = BASE_RULES, rec = this.rec(s.id);
    const v = P.inVehicle, px = v ? v.x : P.x, pz = v ? v.z : P.z;
    const inside = P.alive && this.inside(s, px, pz), near = P.alive && this.inside(s, px, pz, R.nearMargin);
    if (!near && s.alert === 'calm' && !s.seenBy) { s.cleared = false; s.shotWarned = false; return; }
    s.checkT -= dt;
    if (s.checkT <= 0) { s.checkT = 0.2; s.seenBy = near ? this.spotter(s) : null; if (s.seenBy) { s.lastSeen.x = px; s.lastSeen.z = pz; s.lastSeen.t = g.time; } }
    const tier = this.tier(s), friendly = tier === 'friendly' || tier === 'allied', enemy = tier === 'hostile' || tier === 'hunted';
    if (s.alert !== 'hostile') for (const c of s.guards) if (c.alive && c.grudge === P) { this.alarm(s, 'attacked', c); return; }
    if (s.alert === 'calm') {
      if (!s.seenBy) return;
      if (enemy) { this.alarm(s, 'enemy', s.seenBy); return; }
      if (!inside) return;
      if (friendly) { if (!s.cleared) { s.cleared = true; this.say(s, s.seenBy, MB_LINES.cleared, 'milbaseCleared'); } return; }
      if (g.time - rec.warnedAt < R.warnMemory) { this.alarm(s, 'returned', s.seenBy); return; }
      this.warn(s, s.seenBy);
    } else if (s.alert === 'warned') {
      if (enemy) { this.alarm(s, 'enemy', s.seenBy); return; }
      if (friendly) { s.alert = 'calm'; return; }
      if (!inside) { s.outT += dt; if (s.outT > R.warnLeave) { s.alert = 'calm'; g.emit?.('milbaseCalm', { base: s.id, why: 'heeded' }); } return; }
      s.outT = 0; s.warnT += dt;
      if (s.warnT >= R.grace) this.alarm(s, 'stayed', s.seenBy);
    } else if (!P.alive || (!near && !s.seenBy)) { s.coolT += dt; if (s.coolT > R.calmAfter || (!P.alive && s.coolT > 3)) this.calm(s, P.alive ? 'lost' : 'down'); }
    else s.coolT = 0;
  }
  say(s, c, text, type) {
    const g = this.g, P = g.player;
    if (c) c.face = Math.atan2(P.x - c.x, P.z - c.z);
    g.hud?.subtitle?.(`${c?.name ?? 'Sentry'}: "${text}"`, 4);
    g.emit?.(type, { base: s.id, by: c?.id ?? null, text });
  }
  warn(s, c) {
    s.alert = 'warned'; s.warnT = 0; s.outT = 0; this.rec(s.id).warnedAt = this.g.time; this.counts.warnings++;
    this.say(s, c, MB_LINES.warn, 'milbaseWarning');
    this.g.audio?.blip?.();
  }
  alarm(s, why, by = null) {
    const g = this.g, P = g.player, R = BASE_RULES, first = s.alert !== 'hostile';
    s.alert = 'hostile'; s.why = why; s.coolT = 0;
    const px = P.inVehicle ? P.inVehicle.x : P.x, pz = P.inVehicle ? P.inVehicle.z : P.z;
    if (P.alive) { s.lastSeen.x = px; s.lastSeen.z = pz; s.lastSeen.t = g.time; }
    let engaged = 0;
    for (const c of s.guards) {
      if (!c.alive || c === s.qm) continue;
      c.grudge = P; c.leash = R.leash;
      if (Math.hypot(c.x - px, c.z - pz) < R.engage && g.los(c.x, c.z, px, pz)) { c.target = P; c.state = 'fight'; c.react = 0.25 + Math.random() * 0.5; engaged++; }
    }
    if (!first) return;
    this.counts.alarms++;
    this.say(s, by, why === 'returned' ? MB_LINES.returned : MB_LINES.alarm, 'milbaseShout');
    g.hud?.toast?.(`${s.name}: ALARM`, 'hot');
    if (why !== 'enemy' && P.alive) g.society?.deeds?.record('trespass', { x: px, z: pz, tf: s.faction, m: 1, label: s.name });
    g.emit?.('milbaseAlarm', { base: s.id, why, by: by?.id ?? null, engaged });
  }
  calm(s, why) {
    const P = this.g.player;
    s.alert = 'calm'; s.why = null; s.coolT = 0; s.warnT = 0; s.seenBy = null;
    for (const c of s.guards) { if (c.grudge === P) c.grudge = null; if (c.target === P) { c.target = null; c.state = 'idle'; } c._bp = null; }
    this.g.emit?.('milbaseCalm', { base: s.id, why });
  }

  // Heard something (main.noise). A held base: the player's shot inside the wire or near it is an attack (a friend gets
  // one shout first). An overrun base: those of the horde that heard it (zombies.onNoise already gave them the memory) moan.
  onNoise(x, z, r, src) {
    if (!this.live.size) return;
    const g = this.g, P = g.player;
    for (const s of this.live.values()) {
      if (!this.inside(s, x, z, Math.max(r * 2, 40))) continue;
      if (s.row.status === 'overrun') {
        for (const c of s.horde) {
          if (!c.alive || c.mbHeard > g.time - 6) continue;
          const rr = r * 2 * (c.zkind === 'sprinter' ? 1.2 : 1); // as zombies.onNoise hears it (r x 2 x the row's hear)
          if (Math.hypot(c.x - x, c.z - z) > rr) continue;
          c.mbHeard = g.time;
          this.relay(s, c.x, c.z, 1, c, x, z);
        }
        continue;
      }
      if (s.row.status !== 'held' || src !== P || !P.alive || s.alert === 'hostile' || !this.inside(s, x, z, BASE_RULES.shotMargin)) continue;
      let heard = false;
      for (const c of s.guards) if (c.alive && Math.hypot(c.x - x, c.z - z) < Math.max(r, 12)) { heard = true; break; }
      if (!heard) continue;
      const tier = this.tier(s);
      if ((tier === 'friendly' || tier === 'allied') && !s.shotWarned) { s.shotWarned = true; this.say(s, this.nearest(s, x, z), 'Cease fire inside the wire!', 'milbaseShout'); continue; }
      this.alarm(s, 'shots', this.nearest(s, x, z));
    }
  }
  nearest(s, x, z) { let b = null, bd = Infinity; for (const c of s.guards) { if (!c.alive) continue; const d = Math.hypot(c.x - x, c.z - z); if (d < bd) { bd = d; b = c; } } return b; }

  // ---- the garrison's feet (ai.js, for a base soldier with nothing to shoot at) ------------------------------------------
  think(c, dt) {
    const s = this.live.get(c.mbId);
    if (!s || c.faction === 'zombie') return false;
    const g = this.g, P = g.player, R = BASE_RULES;
    if (c === s.qm) { c.speed = 0; if (c.post) this.goTo(c, c.post.x, c.post.z, 1.6, dt); return true; }
    if (s.alert === 'warned' && Math.hypot(P.x - c.x, P.z - c.z) < 45) { c.speed = 0; c.aiming = true; c.face = angleLerp(c.face, Math.atan2(P.x - c.x, P.z - c.z), Math.min(1, dt * 6)); return true; }
    if (s.alert === 'hostile' && c.grudge === P && g.time - s.lastSeen.t < 30) {
      const home = c.post ?? c.route?.[0] ?? c;
      if (Math.hypot(s.lastSeen.x - home.x, s.lastSeen.z - home.z) < R.leash) { if (this.goTo(c, s.lastSeen.x, s.lastSeen.z, 4.4, dt, R.hunt)) c.speed = 0; return true; }
    }
    if (c.post) { if (this.goTo(c, c.post.x, c.post.z, 2.2, dt)) { c.speed = 0; c.face = angleLerp(c.face, c.post.face + Math.sin(g.time * 0.33 + c.slot * 1.7) * 0.5, Math.min(1, dt * 2)); } return true; }
    if (c.route) { const wp = c.route[c.ri]; if (this.goTo(c, wp.x, wp.z, c.pace ?? 1.4, dt)) { c.ri = (c.ri + 1) % c.route.length; c._bp = null; } return true; }
    return false;
  }
  goTo(c, tx, tz, speed, dt, replan = 99) {
    const d = Math.hypot(tx - c.x, tz - c.z);
    if (d < 0.7) { c._bp = null; return true; }
    let p = c._bp;
    const t = this.g.time;
    if (!p || Math.hypot(p.tx - tx, p.tz - tz) > 2.5 || p.stuck > 1.2 || t - p.t > replan) {
      const pts = this.g.nav?.foot?.find(c.x, c.z, tx, tz);
      c._bp = p = { pts: pts ?? [{ x: tx, z: tz }], i: 0, tx, tz, stuck: 0, t };
    }
    let wp = p.pts[Math.min(p.i, p.pts.length - 1)];
    if (Math.hypot(wp.x - c.x, wp.z - c.z) < 0.6 && p.i < p.pts.length - 1) wp = p.pts[++p.i];
    const x0 = c.x, z0 = c.z;
    this.g.ai.move(c, wp.x - c.x, wp.z - c.z, speed, dt);
    p.stuck = Math.hypot(c.x - x0, c.z - z0) < speed * dt * 0.25 ? p.stuck + dt : 0;
    return false;
  }

  // ---- agents, the map, the save ---------------------------------------------------------------------------------------
  // A row and where it stands (citygen's plan record), with its live state when stamped.
  rowView(M) {
    const CG = this.g.citygen, s = this.live.get(M.id), rec = s?.t.rec ?? CG?.plan.find((r) => r.milbase === M.id), R = this.recs.get(M.id);
    return { id: M.id, state: M.state, name: M.name, cls: M.cls, shape: M.shape, status: M.status, holder: M.holder, lat: M.lat, lon: M.lon, area_km2: M.area_km2, size: M.size,
      anchor: M.xz, x: rec?.x ?? null, z: rec?.z ?? null, rec: rec?.id ?? null, drive: M.drive ?? null, beyond: !!rec?.beyond, live: !!s, kind: M.atlas ? 'state' : 'big',
      record: R ? { power: R.power, learned: R.learned, blast: R.blast, dead: R.dead.length, fell: R.fell } : null };
  }
  view(s) {
    const g = this.g, P = g.player, R = this.rec(s.id), mb = s.mb;
    return { ...this.rowView(s.row), y: r1(s.y), alert: s.alert, why: s.why, guards: s.guards.filter((c) => c.alive).length, horde: s.horde.filter((c) => c.alive).length, quartermaster: s.qm?.alive ? s.qm.id : null,
      gates: s.run.gateLeaves.map((q) => ({ side: q.side, x: q.x, z: q.z, open: q.box.base > 0 })), blast: { x: mb.blast.x, z: mb.blast.z, open: s.run.blast?.box.base > 0 },
      generator: mb.generator, log: mb.log, hatch: mb.hatch, site: s.site, armory: { x: (mb.armory.x0 + mb.armory.x1) / 2, z: (mb.armory.z0 + mb.armory.z1) / 2, locked: s.armoryLocked },
      apron: mb.apron ?? null, runway: mb.runway ?? null, piers: mb.piers.length, igloos: mb.igloos.length, hangars: mb.hangars.length, towers: mb.towers.length, wrecks: mb.wrecks.length,
      fences: mb.fences, power: R.power, learned: R.learned, player: { inside: this.inside(s, P.x, P.z), tier: s.faction ? this.tier(s) : null } };
  }
  save() { const out = {}; for (const [id, r] of this.recs) out[id] = { ...r, dead: [...r.dead] }; return out; }
  load(d) { this.recs.clear(); for (const [id, r] of Object.entries(d ?? {})) if (MILBASES_BY_ID.has(id)) this.recs.set(id, { ...this.rec(id), ...r }); }
}
