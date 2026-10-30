import { INVESTIGATE as IV } from '../data/police.js';
import { TRACK_KINDS } from '../data/outdoors.js';

// INVESTIGATE (docs/design/WEB_POLICE_RESPONSE.md §3 "Investigation"; rows in data/police.js INVESTIGATE). One shared
// behaviour for anyone who has to FIND someone from what they can perceive: the town's police on a call, a bounty hunter
// on a tip, a guard who heard something. Robert (2026-10-29): "no cheating, but the AI needs the tools that they need in
// order to be able to do stuff like find you and investigate stuff."
// A PARTY is a few people and a last known spot. They never get your true position; they get only:
//   brass      shell casings lying near the spot: the shooter stood where the brass lies (systems/ambient.js shells)
//   witnesses  people near the spot who SAW you (their own eyes: c.lastSawP, recorded here only from g.sees) tell where
//              you were last, when the party reaches them and asks
//   blood      a blood trail laid after the incident (systems/outdoors.js track pool): followed print to print, forward
//   prints     boot prints the same way, but only by a party with a real tracker (skill >= INVESTIGATE.bootSkill)
//   hiding     the obvious places round the spot: inside the nearest buildings, behind the cover, beside parked cars, the
//              back yards; checked one by one, the party splitting them up
//   sweep      rings outward from the spot (or from the newest clue), split between them
//   sight      any of them seeing you (g.sees, inside their sight range: night, crouch and prone shorten it) is FOUND
// and it ends: found (they remember a description of you), or given up after `until` s without a fresh clue.
//   start(o)   o: { members: [chars], x, z, target (default the player), side (who remembers), trackSkill, until, r,
//              t0 (the incident's game time: older sign is not this), onFound(p, by), onBackup(p, why), onEnd(p) }
//   stop(p)    call it off (the members go back to their own AI)
// Each member is moved by the party (c.hold keeps the AI's own thinking off them) and released when it ends.
const r1 = (v) => Math.round(v * 10) / 10;
const KINDS = Object.keys(TRACK_KINDS); // the track pool's kind index (systems/outdoors.js keeps the same order)

export class Investigate {
  constructor(g) {
    this.g = g;
    this.parties = [];
    this.seq = 0; this.sawT = 0;
    this.known = new Map(); // side -> the description they keep of you: { weapon, vehicle, flag, x, z, t, by }
    this.counts = { started: 0, found: 0, gaveUp: 0, clues: { brass: 0, witness: 0, blood: 0, prints: 0 }, hiding: 0, backup: 0 };
  }

  start(o) {
    const g = this.g, members = (o.members ?? []).filter((c) => c?.alive);
    if (!members.length) return null;
    const p = { id: `I${++this.seq}`, members, x: o.x, z: o.z, cx: o.x, cz: o.z, target: o.target ?? g.player, side: o.side ?? members[0].faction,
      trackSkill: o.trackSkill ?? IV.trackSkill, until: o.until ?? IV.until, r: o.r ?? IV.hideR, t0: o.t0 ?? g.time, t: 0, lastClue: 0, sinceH: o.sinceH ?? ((g.outdoors?.hours?.() ?? 0) - IV.lookbackH),
      queue: [], qi: 0, goals: new Map(), log: [], trail: null, trailAt: -Infinity, asked: new Set(), clues: [], found: null, done: false, backup: false,
      onFound: o.onFound ?? null, onBackup: o.onBackup ?? null, onEnd: o.onEnd ?? null, scanT: 0 };
    this.plan(p, p.x, p.z, 'the reported spot');
    this.parties.push(p); this.counts.started++;
    g.emit('investigateStart', { id: p.id, side: p.side, at: { x: r1(p.x), z: r1(p.z) }, members: members.map((c) => c.id), hiding: p.queue.filter((q) => q.why !== 'sweep').length });
    return p;
  }
  stop(p, why = 'called off') {
    if (p.done) return;
    p.done = true;
    const i = this.parties.indexOf(p); if (i >= 0) this.parties.splice(i, 1);
    for (const c of p.members) if (c.alive) { c.invParty = null; c.hold = 0; }
    p.onEnd?.(p, why);
  }

  // The queue: the spot itself, then the obvious hiding places nearest first, then rings outward.
  plan(p, x, z, why) {
    const g = this.g, Q = [{ x, z, why, look: IV.look }], R = p.r;
    const hides = [];
    // Inside the buildings round the spot (the live towns' and the island's).
    for (const t of g.citygen?.live?.values() ?? []) for (const B of t.blds ?? []) {
      const bx = (B.minX + B.maxX) / 2, bz = (B.minZ + B.maxZ) / 2, d = Math.hypot(bx - x, bz - z);
      if (d < R + 12) hides.push({ x: bx, z: bz, why: 'inside a building', d, look: IV.look * 1.5 });
    }
    for (const B of g.world?.buildings ?? []) {
      if (B.minX === undefined) continue;
      const bx = (B.minX + B.maxX) / 2, bz = (B.minZ + B.maxZ) / 2, d = Math.hypot(bx - x, bz - z);
      if (d < R + 12) hides.push({ x: bx, z: bz, why: 'inside a building', d, look: IV.look * 1.5 });
    }
    // Behind the cover: the far side of each wall, crate or wreck (its normal points away from the spot).
    const cov = g.citygen?.coverNear?.(x, z, R, undefined, this.scratch ??= []) ?? [];
    for (const C of cov) { if (C.kind !== 'crate' && C.kind !== 'wreck' && C.kind !== 'half_wall' && C.kind !== 'pump') continue; const s = Math.sign((C.x - x) * C.nx + (C.z - z) * C.nz) || 1; hides.push({ x: C.x + C.nx * 1.2 * s, z: C.z + C.nz * 1.2 * s, why: 'behind cover', d: Math.hypot(C.x - x, C.z - z), look: IV.look }); }
    // Beside the parked cars (the side away from the spot).
    for (const v of g.vehicles) {
      if (v.dead || Math.hypot(v.vx ?? 0, v.vz ?? 0) > 1 || v.pol) continue;
      const d = Math.hypot(v.x - x, v.z - z); if (d > R) continue;
      const ux = (v.x - x) / (d || 1), uz = (v.z - z) / (d || 1);
      hides.push({ x: v.x + ux * 2.6, z: v.z + uz * 2.6, why: 'beside a car', d, look: IV.look });
    }
    // The back yards (systems/backlots: the yards behind the houses).
    for (const t of g.citygen?.live?.values() ?? []) for (const Y of t.T?.yards ?? []) {
      const yx = Y.x ?? (Y.x0 + Y.x1) / 2, yz = Y.z ?? (Y.z0 + Y.z1) / 2; if (!Number.isFinite(yx)) continue;
      const d = Math.hypot(yx - x, yz - z); if (d < R) hides.push({ x: yx, z: yz, why: 'a back yard', d, look: IV.look });
    }
    hides.sort((a, b) => a.d - b.d);
    for (const h of hides.slice(0, IV.maxHides)) Q.push(h);
    // Then the sweep: rings outward, split between them.
    for (const rr of IV.rings) for (let k = 0; k < IV.perRing; k++) { const a = (k / IV.perRing) * Math.PI * 2 + rr * 0.07; Q.push({ x: x + Math.cos(a) * rr, z: z + Math.sin(a) * rr, why: 'sweep', look: IV.look * 0.5 }); }
    p.queue = Q; p.qi = 0; p.cx = x; p.cz = z;
    for (const c of p.members) p.goals.delete(c);
  }

  // Their eyes: how far a member picks the target out (sky, crouch, prone: systems/stance.js).
  sightOf(c, T) {
    const g = this.g, night = g.sky?.night ?? 0;
    let R = IV.sightDay + (IV.sightNight - IV.sightDay) * night;
    if (T.prone && g.stance) R = g.stance.seenRange(T, R, 0.6, c.x, c.z, c); else if (T.crouch) R *= 0.6;
    return R;
  }
  // Clues near the lead, read with their own eyes: brass, someone who saw, blood, boots (a tracker only).
  scan(p) {
    const g = this.g, T = p.target, lead = p.members.find((c) => c.alive);
    if (!lead) return;
    // Brass on the ground near the spot (at the start): the shooter stood there.
    if (!p.brassRead) {
      p.brassRead = true;
      let n = 0, sx = 0, sz = 0;
      for (const s of g.ambient?.shells ?? []) if (s?.rest && Math.hypot(s.x - p.x, s.z - p.z) < IV.brassR) { n++; sx += s.x; sz += s.z; }
      if (n >= 2) this.clue(p, 'brass', sx / n, sz / n, `${n} casings`);
    }
    // Someone nearby who saw the target since the incident: go and ask (once each).
    for (const c of g.chars) {
      if (!c.alive || c === T || c.invParty || p.asked.has(c.id) || !c.lastSawP || c.lastSawP.t < p.t0) continue;
      if (Math.hypot(c.x - lead.x, c.z - lead.z) > IV.askR) continue;
      p.asked.add(c.id);
      p.queue.splice(p.qi, 0, { x: c.x, z: c.z, why: 'asking a witness', look: IV.ask, witness: c });
      for (const m of p.members) p.goals.delete(m);
      break;
    }
    // The ground: the freshest sign laid after the incident by someone not of the party.
    const O = g.outdoors;
    if (!O?.count) return;
    const now = O.hours(), since = p.sinceH, mine = new Set(p.members.map((c) => c.id));
    let best = -1, bt = p.trailAt;
    for (let n = 0; n < O.count; n++) {
      const who = O.tw[n]; if (!who || mine.has(who)) continue;
      if (Math.abs(O.tx[n] - lead.x) > IV.noseR || Math.abs(O.tz[n] - lead.z) > IV.noseR) continue;
      if (O.tt[n] < since || O.tt[n] <= bt) continue;
      if (p.trail && who !== p.trail) continue;
      const k = KINDS[O.tk[n]], blood = !!TRACK_KINDS[k]?.blood;
      if (!blood && !(p.trackSkill >= IV.bootSkill && k === 'boot')) continue;
      if (!O.visible(n, p.trackSkill, now)) continue;
      bt = O.tt[n]; best = n;
    }
    if (best >= 0) {
      const k = KINDS[O.tk[best]], first = !p.trail;
      p.trail = O.tw[best]; p.trailAt = O.tt[best];
      if (first) this.clue(p, /blood/.test(k) ? 'blood' : 'prints', O.tx[best], O.tz[best], /blood/.test(k) ? 'a blood trail' : 'fresh boot prints');
      else { p.lastClue = p.t; p.queue.splice(p.qi, 0, { x: O.tx[best], z: O.tz[best], why: 'following the trail', look: 0.2 }); for (const m of p.members) p.goals.delete(m); }
    }
  }
  clue(p, kind, x, z, text) {
    const g = this.g;
    p.clues.push({ kind, x: r1(x), z: r1(z), t: r1(g.time), text }); p.lastClue = p.t;
    this.counts.clues[kind]++;
    g.emit('investigateClue', { id: p.id, kind, at: { x: r1(x), z: r1(z) }, text });
    if (!p.backup && (kind === 'blood' || kind === 'brass')) { p.backup = true; this.counts.backup++; p.onBackup?.(p, kind); g.emit('investigateBackup', { id: p.id, why: kind }); }
    this.plan(p, x, z, kind === 'witness' ? 'where the witness saw them' : text); // the search moves to the clue
  }

  step(p, dt) {
    const g = this.g, T = p.target, men = p.members.filter((c) => c.alive);
    if (!men.length) { this.stop(p, 'nobody left'); return; }
    p.t += dt;
    // Sight: any of them, with their own eyes.
    if (T?.alive) for (const c of men) {
      if (c.inVehicle) continue;
      const d = Math.hypot(T.x - c.x, T.z - c.z);
      if (d < this.sightOf(c, T) && g.sees(c, T)) { this.found(p, c); return; }
    }
    if ((p.scanT -= dt) <= 0) { p.scanT = IV.scanEvery; this.scan(p); }
    if (p.t - p.lastClue > p.until) { this.counts.gaveUp++; g.emit('investigateEnd', { id: p.id, found: false, secs: r1(p.t), clues: p.clues.length, checked: p.qi }); this.stop(p, 'gave up'); return; }
    // Each takes the next place on the list (splitting them up), goes, looks, takes the next.
    men.forEach((c, j) => {
      if (c.inVehicle) return;
      c.invParty = p.id;
      let G = p.goals.get(c);
      if (!G) {
        if (p.qi >= p.queue.length) { this.plan(p, p.cx, p.cz, 'again'); }
        const q = p.queue[p.qi++];
        G = { ...q, x: q.x + (j % 2 ? 1.2 : -1.2) * (q.why === 'following the trail' ? j : 0), z: q.z, lookT: q.look, t: 0 };
        p.goals.set(c, G);
        p.log.push({ who: c.id, why: G.why, x: r1(G.x), z: r1(G.z), t: r1(g.time) }); if (p.log.length > 60) p.log.shift();
        if (G.why !== 'sweep' && G.why !== 'following the trail' && G.why !== 'asking a witness') this.counts.hiding++;
      }
      G.t += dt;
      const d = this.walk(c, G.x, G.z, G.why === 'following the trail' ? IV.trailSpeed : IV.speed, dt);
      if (G.witness && d < 2.5) { // asked: they tell where they last saw you
        const w = G.witness, s = w.lastSawP;
        w.hold = Math.max(typeof w.hold === 'number' ? w.hold : 0, 1);
        p.goals.delete(c);
        if (s && s.t >= p.t0) this.clue(p, 'witness', s.x, s.z, `${w.npc?.name ?? w.name ?? 'someone'} saw them there`);
        return;
      }
      if (d < 1.4 || G.t > IV.giveGoal) { if ((G.lookT -= dt) <= 0) p.goals.delete(c); else { c.hold = 0.3; c.speed = 0; c.face += dt * 1.2; } }
    });
  }
  found(p, by) {
    const g = this.g, T = p.target;
    p.found = { by: by.id, x: r1(T.x), z: r1(T.z), t: r1(g.time) };
    this.counts.found++;
    if (T === g.player) this.known.set(p.side, { weapon: T.weapon ?? null, vehicle: T.inVehicle?.type ?? null, flag: T.flag, x: r1(T.x), z: r1(T.z), t: r1(g.time), by: by.id });
    g.emit('investigateFound', { id: p.id, by: by.id, at: { x: r1(T.x), z: r1(T.z) }, secs: r1(p.t), clues: p.clues.map((c) => c.kind) });
    const cb = p.onFound;
    this.stop(p, 'found');
    cb?.(p, by);
  }
  walk(c, x, z, speed, dt) {
    const d = Math.hypot(x - c.x, z - c.z);
    c.hold = 0.3; c.aiming = false;
    if (d < 0.6) { c.speed = 0; return d; }
    if (d > 6) {
      const o = c.polPath ??= {};
      if (!o.path || o.pathX !== x || o.pathZ !== z || (o.repath = (o.repath ?? 0) - dt) <= 0) { o.path = this.g.footPath(c.x, c.z, x, z) ?? [{ x, z }]; o.pi = 0; o.pathX = x; o.pathZ = z; o.repath = 5; }
      let w = o.path[o.pi];
      while (o.pi < o.path.length - 1 && Math.hypot(w.x - c.x, w.z - c.z) < 1.4) w = o.path[++o.pi];
      this.g.ai.move(c, w.x - c.x, w.z - c.z, speed, dt);
    } else this.g.ai.move(c, x - c.x, z - c.z, speed, dt);
    return d;
  }

  // Who saw the target, by their own eyes (only while a party is out: nobody else needs it). Twice a second.
  witness(dt) {
    const g = this.g, P = g.player;
    if ((this.sawT -= dt) > 0) return;
    this.sawT = 0.5;
    if (!P.alive) return;
    for (const c of g.chars) {
      if (!c.alive || c === P || c.faction === 'zombie' || c.invParty || c.sleeping || Math.abs(c.x - P.x) > IV.witnessR || Math.abs(c.z - P.z) > IV.witnessR) continue;
      if (Math.hypot(c.x - P.x, c.z - P.z) < IV.witnessR && g.sees(c, P)) { const s = c.lastSawP ??= { x: 0, z: 0, t: 0 }; s.x = P.x; s.z = P.z; s.t = g.time; }
    }
  }
  update(dt) {
    if (!this.parties.length) return;
    this.witness(dt);
    for (let i = this.parties.length - 1; i >= 0; i--) { const p = this.parties[i]; if (!p.done) this.step(p, dt); }
  }
  view() {
    return { parties: this.parties.map((p) => ({ id: p.id, side: p.side, at: { x: r1(p.cx), z: r1(p.cz) }, members: p.members.filter((c) => c.alive).map((c) => c.id), secs: r1(p.t), sinceClue: r1(p.t - p.lastClue), queue: p.queue.length, next: p.qi, trail: p.trail, clues: p.clues, recent: p.log.slice(-8) })),
      known: Object.fromEntries(this.known), counts: JSON.parse(JSON.stringify(this.counts)) };
  }
}
