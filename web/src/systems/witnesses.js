import { WITNESS_RUN as W, VERBS } from '../data/society.js';

// Witnesses who run home (docs/design/WEB_WORLD_MEMORY.md, phase 5). Somebody who put a name to your face for a deed
// that matters doesn't wait for the gossip to carry it: they run to their people's hub and tell it there, and the report
// (deeds.js) lands when they arrive. So it can be stopped on the way: catch them and kill them (a silence, if anybody
// sees that), hold a gun on them until they give it up, or pay them to forget. A runner who can't get through tells it
// after WITNESS_RUN.fallback seconds anyway.
//   consider(r, c, rec)  deeds.queue asks: does this witness carry this report on foot? (one runner a deed)
//   think(c, dt)         ai.update: a runner runs (true when it handled c this frame)
//   update(dt)           per frame: the player's gun on a runner
//   bribe(c)             main.js: E on a runner you've caught up with
//   onDeath(c)           update() finds a runner dead or gone: they tell nobody (the report settles at once, as silenced;
//                        a named one only down tells it when they're up, deeds.land)
export class Witnesses {
  constructor(game) {
    this.g = game;
    this.runners = [];   // people carrying a report on foot right now
    this.aimAt = null; this.aimT = 0;
    this.ran = 0; this.arrived = 0; this.stopped = { killed: 0, cowed: 0, paid: 0 };
  }

  consider(r, c, rec) {
    const g = this.g, F = g.society.factions, row = F.rows[c.fi];
    if (!row?.hub || c.weapon || c.runner || !c.alive || c.inVehicle || c.sleeping || c.follower || c === g.player) return false;
    if ((VERBS[rec.v] ?? 1) < W.minVerb) return false;
    if (this.runners.some((o) => o.runner?.seq === rec.seq)) return false; // one runner a deed
    const hub = { x: row.hub[0], z: row.hub[1] }, d = Math.hypot(c.x - hub.x, c.z - hub.z);
    if (d <= W.arriveR + 4 || d > W.maxHub) return false;
    c.runner = { seq: rec.seq, slot: r, hub, verb: rec.v, fid: c.fid, t0: g.time, route: null, ri: 0, repath: 0, cowed: 0, brave: false, speed: W.speed };
    r.due = g.time + W.fallback; r.runner = c.id;
    c.flee = 0; c.target = null; c.hold = 0;
    this.runners.push(c);
    this.ran++;
    g.hud?.toast?.(`A WITNESS IS RUNNING TO TELL ${(row.short ?? row.name).toUpperCase()}`, 'hot');
    g.emit('witnessRuns', { id: c.id, name: c.npc?.name ?? c.name, faction: c.fid, verb: rec.v, hub: [hub.x, hub.z], dist: Math.round(d) });
    return true;
  }

  // A runner on their way, along a foot path to the hub (re-planned when they stall). Gunfire close by still sends them
  // to the ground for a moment (ambient.js cowerT, checked before this in ai.update); then they get up and keep running.
  think(c, dt) {
    const R = c.runner, g = this.g;
    if (!R) return false;
    if (c.inVehicle) { this.release(c); return false; }
    if (Math.hypot(R.hub.x - c.x, R.hub.z - c.z) < W.arriveR) { this.arrive(c); return false; }
    c.flee = 0; c.aiming = false;
    R.repath -= dt;
    if (!R.route || (R.repath <= 0 && (c.stuck ?? 0) > 0.3)) {
      R.route = g.footPath(c.x, c.z, R.hub.x, R.hub.z) ?? [R.hub]; R.ri = 0; R.repath = 4;
    }
    let wp = R.route[R.ri];
    while (R.ri < R.route.length - 1 && Math.hypot(wp.x - c.x, wp.z - c.z) < 1.4) wp = R.route[++R.ri];
    g.ai.move(c, wp.x - c.x, wp.z - c.z, R.speed, dt);
    return true;
  }

  // Home: they tell it, and the report lands now.
  arrive(c) {
    const g = this.g, R = c.runner, r = R.slot;
    c.runner = null;
    if (r.live && r.runner === c.id) { r.due = g.time; r.runner = null; this.settle(); }
    this.arrived++;
    g.emit('wordArrived', { id: c.id, name: c.npc?.name ?? c.name, faction: R.fid, verb: R.verb, secs: +(g.time - R.t0).toFixed(1) });
  }

  // Dead (or carried off): the report is settled at once - deeds.land() finds the witness dead and counts it silenced.
  onDeath(c) {
    const R = c.runner;
    if (!R) return;
    c.runner = null;
    if (R.slot.live && R.slot.runner === c.id) { R.slot.due = this.g.time; R.slot.runner = null; this.settle(); }
    this.stopped.killed++;
  }
  release(c) {
    const R = c.runner;
    if (!R) return;
    c.runner = null;
    if (R.slot.live && R.slot.runner === c.id) { R.slot.runner = null; R.slot.due = this.g.time + 30; this.settle(); } // the gossip carries it instead
  }
  settle() { const D = this.g.society.deeds; D.nextDue = Math.min(D.nextDue, this.g.time); }

  // The report a runner carries, given up (a gun, a payment): it never reaches their people. The others of the same
  // people who saw it still tell it, late (they left the telling to the runner: deeds.queue).
  giveUp(c, how) {
    const R = c.runner, D = this.g.society.deeds;
    c.runner = null;
    if (R.slot.live && R.slot.runner === c.id) D.cancel(R.slot, how);
    this.stopped[how]++;
  }

  // ---- per frame: the dead and the gone, and the player's gun on a runner --------------------------------------
  update(dt) {
    const g = this.g, P = g.player;
    if (!this.runners.length) return;
    for (let i = this.runners.length - 1; i >= 0; i--) {
      const c = this.runners[i];
      if (c.runner && (!c.alive || !g.chars.includes(c))) this.onDeath(c);
      else if (c.runner && !(c.runner.slot.live && c.runner.slot.runner === c.id)) c.runner = null; // told some other way (the fallback, a flush)
      if (!c.runner) this.runners.splice(i, 1);
    }
    if (!P.alive || P.inVehicle || !P.weapon || !this.runners.length) { this.aimAt = null; this.aimT = 0; return; }
    let best = null, bd = W.cowerR;
    for (const c of this.runners) {
      const R = c.runner;
      if (R.brave) continue;
      const d = Math.hypot(c.x - P.x, c.z - P.z);
      if (d > bd || Math.hypot(g.aim.x - c.x, g.aim.z - c.z) > W.aimSlack || !g.los(P.x, P.z, c.x, c.z)) continue;
      best = c; bd = d;
    }
    if (best !== this.aimAt) { this.aimAt = best; this.aimT = 0; }
    if (!best || (this.aimT += dt) < W.aimFor) return;
    this.aimT = 0;
    this.cow(best);
  }

  // Held at gunpoint: most give it up; some nerve holds once.
  cow(c) {
    const g = this.g, R = c.runner;
    const nerve = c.npc ? W.nerve.npc : W.nerve[c.faction] ?? W.nerve.default;
    if (Math.random() < nerve) {
      R.brave = true; R.speed = W.speed * 1.15; // past caring: faster
      g.feedback?.floater(c.x, c.z, 'Shoot me then!', 'bark');
      g.hud?.toast?.(`${(c.npc?.name ?? c.name ?? 'THE WITNESS').toUpperCase()} WON'T STOP FOR A GUN`, 'warn');
      g.emit('witnessBrave', { id: c.id });
      return;
    }
    this.giveUp(c, 'cowed');
    c.cowerT = W.cowerSecs; c.flee = 0; // hands up, shaking (ambient.js)
    g.society?.memory?.remember(c.npc?.id, 'threatened');
    g.society?.deeds?.record('threaten', { target: c, m: VERBS.threaten });
    g.feedback?.floater(c.x, c.z, "All right! I didn't see nothing!", 'bark');
    g.emit('witnessCowed', { id: c.id });
  }

  // ---- paying a runner off -------------------------------------------------------------------------------------
  bribeCost(c) { const R = c.runner; return Math.round((W.bribe.base + W.bribe.perVerb * (VERBS[R?.verb] ?? 2)) * (c.npc ? W.bribe.namedMul : 1)); }
  canBribe(c) { const P = this.g.player; return !!c?.runner && c.alive && Math.hypot(c.x - P.x, c.z - P.z) < W.bribe.reach; }
  // The runner within reach of the player, or null (main.js's E prompt).
  near() { for (const c of this.runners) if (this.canBribe(c)) return c; return null; }
  bribe(c) {
    const g = this.g;
    if (!this.canBribe(c)) return { ok: false, why: 'not a witness you can reach' };
    const cost = this.bribeCost(c);
    if (!g.spend(cost)) return { ok: false, why: 'not enough cash' };
    this.giveUp(c, 'paid');
    c.hold = 1.2; // a moment to pocket it
    g.society?.memory?.remember(c.npc?.id, 'bribed');
    g.hud?.toast?.(`$${cost} · THEY SAW NOTHING`, 'job');
    g.emit('witnessPaid', { id: c.id, cost });
    return { ok: true, cost };
  }

  clear() { for (const c of this.runners) c.runner = null; this.runners.length = 0; this.aimAt = null; this.aimT = 0; }

  view() {
    const g = this.g;
    return {
      running: this.runners.filter((c) => c.runner).map((c) => {
        const R = c.runner;
        return { id: c.id, name: c.npc?.name ?? c.name, faction: R.fid, verb: R.verb, x: +c.x.toFixed(1), z: +c.z.toFixed(1), toHub: +Math.hypot(R.hub.x - c.x, R.hub.z - c.z).toFixed(1), secs: +(g.time - R.t0).toFixed(1), dueIn: +(R.slot.due - g.time).toFixed(1), brave: R.brave, bribe: this.bribeCost(c) };
      }),
      ran: this.ran, arrived: this.arrived, stopped: { ...this.stopped },
    };
  }
}
