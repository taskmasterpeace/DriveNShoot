import { VERBS } from '../data/society.js';
import { K } from './chronicle.js';

// Deeds: what the player does, who saw it, and the word that spreads (docs/design/WEB_WORLD_MEMORY.md §3.1-3.3).
// A deed runs a witness pass at the moment it happens (live positions); each witness who could name the player takes
// a rumor slot and reports after a delay - unless they die first. Factions learn from reports, not from omniscience,
// and wanted stars rise only on the word of a faction that keeps the law (rows with `stars`).
// Fixed pools, no per-frame work beyond one comparison (`nextDue`).

const MAX_RUMORS = 64, MAX_WITNESSES = 8;
const SIGHT_DAY = 42, SIGHT_NIGHT = 16, ID_FRACTION = 0.55, NEAR = 8, FACING_COS = Math.cos((110 * Math.PI) / 180), HURT_WINDOW = 4;
const NO_ONE = Object.freeze([]);

export class Deeds {
  constructor(game, chronicle, factions) {
    this.g = game; this.chron = chronicle; this.F = factions;
    this.rumors = Array.from({ length: MAX_RUMORS }, () => ({ live: false, echo: false, seq: 0, due: 0, witness: null, wid: '', fid: '', verb: '', of: '', o: '', on: '', onpc: '', downed: false, p: '', x: 0, z: 0, m: 0, learn: 1, sd: false, stars: 0 }));
    this.pending = 0; this.nextDue = Infinity;
    this.scratch = []; this.sawOnly = 0;
    this.landed = 0; this.silenced = 0; this.overflow = 0;
    this.hurtLast = new Map(); // victim → { t, rec } so a burst of hits is one deed
    this.witnessMsMax = 0; this.deeds = 0;
  }

  // How far a witness can see the deed, and how close they must be to put a name to the face.
  ranges(actor = this.g.player) {
    const sky = this.g.sky, fogK = Math.max(0, Math.min(0.7, ((sky.cur?.fog ?? 0.0028) - 0.0028) / 0.033));
    let sight = (SIGHT_DAY + (SIGHT_NIGHT - SIGHT_DAY) * (sky.night ?? 0)) * (1 - fogK);
    if (actor.crouch) sight *= 0.6;
    if (actor.inVehicle) sight *= 1.2;
    const flash = actor === this.g.player && this.g.flashMat?.opacity > 0;
    return { sight, idRange: ID_FRACTION * sight + (flash ? 6 : 0), night: +(sky.night ?? 0).toFixed(2), fogK: +fogK.toFixed(2), crouch: !!actor.crouch };
  }

  // Everyone who saw a deed at (x, z). Identified witnesses fill this.scratch (≤ 8); the rest count in sawOnly.
  witnessPass(x, z, actor, victim) {
    const t0 = performance.now(), g = this.g, P = g.player, { sight, idRange } = this.ranges(actor);
    const room = actor === P ? g.insideBuilding : null;
    this.scratch.length = 0; this.sawOnly = 0;
    for (const c of g.chars) {
      if (!c.alive || c === actor || c === P || c.faction === 'ally' || (c.inVehicle && !c.seatPose)) continue;
      if (!(c.fi >= 0) || this.F.rows[c.fi].memory === 'none') continue; // the infected never testify
      const dx = x - c.x, dz = z - c.z;
      if (Math.abs(dx) + Math.abs(dz) > sight * 1.415) continue;
      const d = Math.hypot(dx, dz);
      if (d > sight) continue;
      if (c !== victim && d > NEAR && (Math.sin(c.face) * dx + Math.cos(c.face) * dz) / d < FACING_COS) continue; // looking away
      if (room && !(c.x > room.minX && c.x < room.maxX && c.z > room.minZ && c.z < room.maxZ)) continue;
      if (d > 1 && !g.los(c.x, c.z, x, z)) continue; // walls and smoke
      if (d <= idRange && this.scratch.length < MAX_WITNESSES) this.scratch.push(c); else this.sawOnly++;
    }
    this.witnessMsMax = Math.max(this.witnessMsMax, performance.now() - t0);
    return this.scratch;
  }

  // Record a deed. o: { actor, target, x, z, m, witness, src, flags, tf (target faction), stars (wanted stars it is
  // worth to a lawful faction), sd (self-defense), label (what the record names when there is no target: a jump) }.
  // Returns the chronicle record.
  record(verb, o = {}) {
    const g = this.g, P = g.player, actor = o.actor ?? P, target = o.target ?? null;
    const x = o.x ?? target?.x ?? actor?.x, z = o.z ?? target?.z ?? actor?.z;
    if (!Number.isFinite(x) || !Number.isFinite(z)) { g.emit('error', { where: 'deeds.record', verb, why: 'non-finite position' }); return null; }
    const tf = o.tf ?? target?.fid ?? (target ? this.F.fidFor(target) : '') ?? '';
    const mine = actor === P;
    const seen = o.witness !== false && mine ? this.witnessPass(x, z, actor, target) : NO_ONE;
    let k = (o.flags ?? 0) | ((g.sky.night ?? 0) > 0.6 ? K.night : 0) | (target?.npc ? K.named : 0);
    if (mine && o.witness !== false && !seen.length) k |= K.unwitnessed;
    const rec = this.chron.add({
      t: +g.time.toFixed(2), day: g.society?.day ?? 0, hr: +(g.sky.time ?? 0).toFixed(2),
      a: mine ? 'player' : actor?.id ?? '', af: mine ? 'player' : actor?.fid ?? '', v: verb,
      o: target?.id ?? '', on: target?.npc?.name ?? target?.name ?? o.label ?? '', of: tf ?? '', p: g.society?.placeAt(x, z) ?? '',
      x: +x.toFixed(1), z: +z.toFixed(1), m: o.m ?? VERBS[verb] ?? 1, w: seen.map((c) => c.id), ws: seen.length, un: mine ? this.sawOnly : 0, k, src: o.src ?? (mine ? 'deed' : 'world'),
    });
    this.deeds++;
    if (mine && seen.length) {
      // The law answers at once to what its own armed people saw; the rest of the word travels.
      let starsNow = false;
      const mem = g.society?.memory;
      for (const c of seen) {
        if (c.npc && mem) mem.witnessed(c, verb, target); // a named witness remembers it firsthand
        const row = this.F.rows[c.fi], lawful = row.stars && (o.stars ?? 0) > 0;
        if (lawful && c.weapon && !starsNow) { g.raiseWanted(o.stars); starsNow = true; }
        this.queue(rec, c, target, lawful && !c.weapon ? o.stars : 0, o.sd);
      }
    }
    g.emit('deed', { record: rec.seq, verb, target: rec.o || null, targetName: rec.on || null, faction: rec.of || null, place: rec.p, mag: rec.m, witnesses: rec.ws, unidentified: rec.un, unwitnessed: !!(rec.k & K.unwitnessed), cause: o.cause });
    return rec;
  }

  // One witness's report, due after the faction's delay, longer the farther they are from home.
  queue(rec, c, target, stars, sd) {
    const slot = this.rumors.find((r) => !r.live);
    if (!slot) { this.overflow++; rec.k |= K.overflow; return; }
    const row = this.F.rows[c.fi], [lo, hi] = row.rumorDelay ?? [20, 45];
    const hub = row.hub, far = hub ? Math.hypot(c.x - hub[0], c.z - hub[1]) : 200;
    Object.assign(slot, {
      live: true, echo: false, seq: rec.seq, due: this.g.time + (lo + Math.random() * (hi - lo)) * Math.max(0.5, Math.min(2, far / 200)),
      witness: c, wid: c.id, fid: c.fid, verb: rec.v, of: rec.of, o: rec.o, on: rec.on, p: rec.p, x: rec.x, z: rec.z, m: rec.m,
      onpc: target?.npc?.id ?? '', downed: (target?.downedT ?? 0) > 0,
      learn: c === target ? 1 : row.cohesion ?? 0.5, sd: !!sd, stars: stars ?? 0,
    });
    this.pending++;
    if (slot.due < this.nextDue) this.nextDue = slot.due;
  }

  update() {
    const t = this.g.time;
    if (t < this.nextDue) return;
    let next = Infinity;
    for (const r of this.rumors) {
      if (!r.live) continue;
      if (r.due <= t) this.land(r);
      if (r.live && r.due < next) next = r.due;
    }
    this.nextDue = next;
  }

  land(r) {
    const g = this.g, w = r.witness;
    if (w && !w.alive && w.downedT > 0) { r.due = g.time + 5; return; } // down but not out: they tell it when they're up
    r.live = false; this.pending--;
    if (!w || !w.alive || !g.chars.includes(w)) {
      this.silenced++;
      const rec = this.find(r.seq); if (rec) rec.k |= K.silenced;
      g.emit('rumorSilenced', { record: r.seq, witness: r.wid, faction: r.fid, verb: r.verb });
      return;
    }
    this.landed++;
    const rec = this.find(r.seq); if (rec) rec.k |= K.reported;
    if (r.echo) return; // their faction already heard this one
    for (const o of this.rumors) if (o.live && o.seq === r.seq && o.fid === r.fid) o.echo = true;
    const before = this.F.standing[this.F.index[r.fid]];
    const d = this.F.learn(r.fid, r.verb, r.of, r.m, r.learn, r.sd);
    if (r.stars) g.raiseWanted(r.stars);
    g.society?.memory?.heard(r); // the victim's kin and friends, and the faction's leaders, hear it too
    this.chron.add({ t: +g.time.toFixed(2), day: g.society?.day ?? 0, hr: +(g.sky.time ?? 0).toFixed(2), a: 'player', af: 'player', v: r.verb, o: r.o, on: r.on, of: r.of, p: r.p, x: r.x, z: r.z, m: r.m, w: [w.id], ws: 1, k: K.reported, src: 'rumor' });
    const row = this.F.row(r.fid);
    if (d) g.hud?.toast?.(`WORD SPREADS — ${row.name.toUpperCase()} HEARD`, d < 0 ? 'hot' : 'job');
    g.emit('rumor', { record: r.seq, witness: w.id, witnessName: w.npc?.name ?? w.name, faction: r.fid, verb: r.verb, delta: +d.toFixed(1), standing: +(before + d).toFixed(1) });
  }

  // A job done or a deal struck face to face: the counterparty is the witness, so their people learn at once.
  direct(verb, c, m) {
    const g = this.g, fid = c?.fid;
    if (!fid) return null;
    const rec = this.record(verb, { target: c, m, witness: false, src: 'dialogue' });
    const d = this.F.learn(fid, verb, fid, rec?.m ?? 0, 1);
    g.society?.memory?.dealt(c, verb);
    if (rec) rec.k |= K.reported;
    g.emit('dealt', { verb, npc: c.npc?.id ?? c.id, faction: fid, delta: +d.toFixed(1) });
    return rec;
  }

  find(seq) { const c = this.chron; for (let n = 0; n < c.size; n++) { const r = c.ring[(c.head - 1 - n + c.cap) % c.cap]; if (r.seq === seq) return r; if (r.seq < seq) break; } return null; }

  // A witness to someone else's trouble. A victim's own pending report (of the hit that killed them) doesn't make the
  // killing a "silence": that's still a kill, and the report dies quietly with them.
  holdsRumor(c) { for (const r of this.rumors) if (r.live && r.witness === c && r.o !== c.id) return true; return false; }

  // ---- hooks ------------------------------------------------------------------------------------------
  onKill(c, attacker, cause) {
    const g = this.g, P = g.player;
    if (c.fid && !(c.downedT > 0)) g.society?.sim?.lost(c.fid); // one fewer fighter for their side, whoever did it
    if (attacker !== P) {
      // The world's own violence is history, not gossip about you.
      if (c.faction !== 'zombie' && attacker) this.record('kill', { actor: attacker, target: c, witness: false, src: 'world', flags: c.downedT > 0 ? K.downed : 0 });
      return;
    }
    const silencing = this.holdsRumor(c);
    const sd = c.target === P || c.ztarget === P || (c.grudge === P && !!c.weapon);
    const leader = !!(c.fid && this.F.row(c.fid)?.leaders?.includes(c.npc?.id));
    const m = (silencing ? 6 : 4) * (c.npc ? 2 : 1) * (leader ? 3 : 1) * (sd ? 0.25 : 1);
    const lawful = c.faction !== 'raider' && c.faction !== 'zombie';
    const flags = (leader ? K.leader : 0) | (sd ? K.selfDefense : 0) | (c.downedT > 0 ? K.downed : 0);
    this.record(silencing ? 'silence' : 'kill', { target: c, m, flags, sd, stars: lawful && !sd ? (c.npc ? 3 : 2) : 0, cause });
    // Whoever the dead was attacking, if they were no threat to you, you just saved.
    const prey = c.target ?? c.ztarget;
    if (prey && prey !== P && prey.alive && prey.faction !== c.faction && !(prey.fi >= 0 && this.F.playerHostile[prey.fi])) {
      this.record('rescue', { target: prey, x: c.x, z: c.z });
    }
  }

  // A hit on someone. A burst of hits on the same victim within 4 s is one deed whose magnitude grows.
  onHurt(c, attacker) {
    const g = this.g, P = g.player;
    if (attacker !== P || !c.alive || c.faction === 'zombie') return;
    const last = this.hurtLast.get(c);
    if (last && g.time - last.t < HURT_WINDOW && last.rec.seq > this.chron.seq - this.chron.cap) { last.t = g.time; last.rec.m += 1; last.rec.k |= K.coalesced; return; }
    const sd = c.target === P || c.grudge === P; // they started it (the old rule: no stars against a grudge)
    const rec = this.record('hurt', { target: c, sd, flags: sd ? K.selfDefense : 0, stars: c.faction !== 'raider' && !sd ? 1 : 0 });
    if (rec) this.hurtLast.set(c, { t: g.time, rec });
    if (this.hurtLast.size > 64) for (const [k, v] of this.hurtLast) if (g.time - v.t > HURT_WINDOW) this.hurtLast.delete(k);
  }

  view() {
    return {
      pending: this.rumors.filter((r) => r.live).map((r) => ({ seq: r.seq, verb: r.verb, witness: r.wid, witnessName: r.witness?.npc?.name ?? r.witness?.name ?? null, faction: r.fid, dueIn: +(r.due - this.g.time).toFixed(1), alive: !!r.witness?.alive, echo: r.echo })),
      landed: this.landed, silenced: this.silenced, overflow: this.overflow,
    };
  }

  save() { return this.rumors.filter((r) => r.live).map((r) => ({ seq: r.seq, dueIn: +(r.due - this.g.time).toFixed(2), wid: r.wid, fid: r.fid, verb: r.verb, of: r.of, o: r.o, on: r.on, onpc: r.onpc, downed: r.downed, p: r.p, x: r.x, z: r.z, m: r.m, learn: r.learn, sd: r.sd, stars: r.stars, echo: r.echo })); }

  load(list) {
    for (const r of this.rumors) r.live = false;
    this.pending = 0; this.nextDue = Infinity;
    for (const s of list ?? []) {
      const slot = this.rumors.find((r) => !r.live);
      if (!slot) break;
      Object.assign(slot, s, { live: true, due: this.g.time + s.dueIn, witness: this.g.chars.find((c) => c.id === s.wid) ?? null });
      this.pending++;
      if (slot.due < this.nextDue) this.nextDue = slot.due;
    }
  }
}
