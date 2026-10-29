import { SECURITY, SECURITY_TIERS, RUNDOWN } from '../data/gadgets.js';
import { outfit } from './characters.js';

// TOWN SECURITY (docs/design/WEB_GADGETS.md §5; rows in data/gadgets.js SECURITY + SECURITY_TIERS). Every settlement
// that keeps bulls has a station (the cities lane's `security_station` building when it is there, a stub placement till
// then), a run-down patrol car that drives its loop, two officers walking the beat, and THE PAPER LADDER of answers to
// the wanted stars the existing witness system raises (systems/deeds.js -> g.raiseWanted):
//   1-2 stars  TOWN BULLS: one car from the station, they get out and offer the cuffs (holster and stand still) before
//              they shoot; surrender = a fine, or the cell for hours if you can't pay, then you walk out clean
//   3-4        COUNTY POSSE: two cars, and a ROADBLOCK across the road ahead of you if you're driving (two cars side on,
//              a road chain between them, two men behind)
//   5          SKIP TRACERS: a hunter car that rams and follows you out of the county
// The officers are the town's wardens (faction 'warden', so the AI's hostility, the stars and the standing already
// apply); their own driving lives here (v.ai = 'security'), steering through gadgets.steer like any AI driver.
const r1 = (v) => Math.round(v * 10) / 10;
const NEAR_STATION = 200, FAR_STATION = 340, ARREST_R = 5.5;

export class Security {
  constructor(game, gadgets) {
    this.g = game; this.gx = gadgets;
    this.towns = Object.entries(SECURITY).map(([id, row]) => ({ id, row, station: null, patrol: null, beat: [], loopI: 0 }));
    this.responses = [];   // { id, tier, town, cars: [], men: [], mode, at, arrest }
    this.blocks = [];      // roadblocks: { id, cars, men, chain, at }
    this.seq = 0;
    this.lastWanted = 0;
    this.arrest = null;    // the offer on the table: { resp, t, still, hp0 }
    this.ambient = true;   // the patrol car and the beat (off: only the responses)
    this.auto = true;      // new stars send the next rung (off: only the security command does)
    this.counts = { dispatched: 0, roadblocks: 0, arrests: 0, fines: 0, jailed: 0, shootouts: 0, patrols: 0 };
  }

  // Where the station stands: the cities lane's building, else the row's stub.
  stationOf(T) {
    if (T.station) return T.station;
    const want = T.row.station.kind;
    const b = this.g.world?.buildings?.find((x) => x.kind === want || x.use === want || x.lotKind === want);
    const s = T.row.station.stub;
    T.station = b ? { x: (b.minX + b.maxX) / 2, z: b.maxZ + 6, rot: 0, building: true } : { x: s.x, z: s.z, rot: s.rot, building: false };
    const q = { x: T.station.x, z: T.station.z }; this.g.statics.resolveCircle(q, 3); T.station.x = q.x; T.station.z = q.z;
    return T.station;
  }

  townNear(x, z) {
    let best = null, bd = 900;
    for (const T of this.towns) { const s = this.stationOf(T), d = Math.hypot(s.x - x, s.z - z); if (d < bd) { bd = d; best = T; } }
    return best;
  }

  // ---- people and cars -------------------------------------------------------------------------------------------------
  officer(T, x, z, tier, opts = {}) {
    const g = this.g, tr = SECURITY_TIERS[tier] ?? SECURITY_TIERS.bulls;
    let r = Math.random(), weapon = Object.keys(tr.weapons)[0];
    for (const [w, p] of Object.entries(tr.weapons)) if ((r -= p) <= 0) { weapon = w; break; }
    const c = g.addChar({ x, z, faction: 'warden', weapon, hp: tr.hp, colors: outfit(T.row.look ?? 'warden'), name: tier === 'tracers' ? 'Skip Tracer' : tier === 'posse' ? 'County Posse' : 'Town Bull', flag: g.randomFlag(Math.random) });
    if (!c) return null;
    c.hp = c.maxHp = tr.hp;
    c.sec = { town: T.id, tier, ...opts };
    c.leash = tr.leash;
    return c;
  }

  // A run-down patrol car (vehicles.js row bullcar: vehiclebodies.js paints it from RUNDOWN), dents put in.
  car(x, z, h, T) {
    const g = this.g, v = g.vehiclesSys.spawn(T.row.car.type, x, z, h, T.row.car.paint, { ai: 'security' });
    for (const [where, k] of RUNDOWN.dents) {
      const a = where === 'front' ? 0 : where === 'rear' ? Math.PI : Math.PI / 2;
      g.vehDamage.hit(v, x + Math.sin(h + a) * v.len * 0.5, z + Math.cos(h + a) * v.len * 0.5, k, 'ram');
    }
    v.hp = v.maxHp; // the dents are old; the engine runs
    v.sec = { town: T.id };
    return v;
  }

  // ---- the paper ladder --------------------------------------------------------------------------------------------------
  tierFor(stars) { return stars >= SECURITY_TIERS.tracers.stars ? 'tracers' : stars >= SECURITY_TIERS.posse.stars ? 'posse' : 'bulls'; }

  dispatch(tier, why = 'wanted', T = null) {
    const g = this.g, P = g.player, tr = SECURITY_TIERS[tier];
    if (!tr) return { ok: false, why: `tiers: ${Object.keys(SECURITY_TIERS).join(', ')}` };
    T = T ?? this.townNear(P.x, P.z);
    if (!T) return { ok: false, why: 'no town keeps bulls near here' };
    if (this.responses.some((r) => r.tier === tier && r.men.some((m) => m.alive))) return { ok: false, why: `the ${tr.name.toLowerCase()} are already out` };
    const s = this.stationOf(T), resp = { id: `R${++this.seq}`, tier, town: T.id, cars: [], men: [], mode: 'drive', at: g.time, why };
    for (let k = 0; k < tr.cars; k++) {
      const h = Math.atan2(P.x - s.x, P.z - s.z), ox = Math.cos(h) * (k * 5), oz = -Math.sin(h) * (k * 5);
      const v = this.car(s.x + ox, s.z + oz, h, T);
      v.ai = tier === 'tracers' ? 'raider' : 'security';
      resp.cars.push(v);
      for (let m = 0; m < tr.foot; m++) {
        const c = this.officer(T, v.x, v.z, tier, { resp: resp.id });
        if (!c) break;
        g.seats.board(c, v, m);
        resp.men.push(c);
      }
    }
    this.responses.push(resp);
    this.counts.dispatched++;
    g.hud?.toast(`${tr.name.toUpperCase()} ROLLING`, tier === 'bulls' ? 'warn' : 'hot');
    g.emit('securityDispatched', { id: resp.id, tier, town: T.id, cars: resp.cars.map((v) => v.id), men: resp.men.map((c) => c.id), why, from: { x: r1(s.x), z: r1(s.z) } });
    if (tr.roadblock && P.inVehicle) this.roadblock(T, tier);
    return { ok: true, id: resp.id, cars: resp.cars.map((v) => v.id), men: resp.men.map((c) => c.id) };
  }

  // Two cars side on across the road ahead of the car you drive, a road chain between them, two men behind.
  roadblock(T, tier = 'posse', at = null) {
    const g = this.g, P = g.player, pv = P.inVehicle;
    let x, z, h;
    if (at) { x = at.x; z = at.z; h = at.h ?? 0; }
    else {
      const sp = pv ? Math.hypot(pv.vx, pv.vz) : 0, a = pv ? (sp > 2 ? Math.atan2(pv.vx, pv.vz) : pv.h) : P.face;
      x = P.x + Math.sin(a) * 80; z = P.z + Math.cos(a) * 80; h = a;
    }
    const q = { x, z }; g.statics.resolveCircle(q, 3); x = q.x; z = q.z;
    const ax = Math.cos(h), az = -Math.sin(h); // across the road
    const blk = { id: `B${++this.seq}`, cars: [], men: [], chain: null, at: g.time, x, z };
    for (const s of [-1, 1]) {
      const v = this.car(x + ax * s * 4.2, z + az * s * 4.2, h + Math.PI / 2, T);
      v.ai = null; v.lights = true;
      blk.cars.push(v);
      const c = this.officer(T, x + ax * s * 4.2 + Math.sin(h) * 3.5, z + az * s * 4.2 + Math.cos(h) * 3.5, tier, { block: blk.id }); // behind the cars, facing you
      if (c) { c.face = h + Math.PI; blk.men.push(c); }
    }
    const lead = blk.men[0] ?? null;
    blk.chain = this.gx.place('road_chain', x - Math.sin(h) * 5.5, z - Math.cos(h) * 5.5, h, lead, { state: 'armed', armAt: 0 });
    this.blocks.push(blk);
    this.counts.roadblocks++;
    g.hud?.toast('ROADBLOCK AHEAD', 'hot');
    g.emit('roadblock', { id: blk.id, x: r1(x), z: r1(z), cars: blk.cars.map((v) => v.id), chain: blk.chain?.id ?? null });
    return blk;
  }

  // ---- the arrest ------------------------------------------------------------------------------------------------------
  offerArrest(resp) {
    const g = this.g;
    if (this.arrest || !SECURITY_TIERS[resp.tier].arrest) return;
    this.arrest = { resp, t: 0, still: 0, hp0: resp.men.map((c) => c.hp) };
    resp.mode = 'arrest';
    g.hud?.toast('HANDS UP · HOLSTER AND STAND STILL TO SURRENDER', 'warn');
    g.emit('arrestOffered', { id: resp.id, stars: g.wanted });
  }

  // Hands up, holstered, standing still beside them: it is over. A fine if you can pay, the cell if you can't.
  surrender(force = false) {
    const g = this.g, P = g.player, A = this.arrest;
    if (!A && !force) return { ok: false, why: 'nobody is offering you the cuffs' };
    const T = this.towns.find((t) => t.id === A?.resp.town) ?? this.towns[0], row = T.row;
    const stars = Math.max(1, g.wanted), fine = row.fine * stars;
    let out;
    if (g.cash >= fine) {
      g.cash -= fine; this.counts.fines++;
      out = { ok: true, outcome: 'fined', fine, stars };
      g.hud?.toast(`FINED $${fine} · WALK AWAY`, 'warn');
    } else {
      const s = this.stationOf(T), hours = row.jail * stars;
      if (P.inVehicle) g.exitVehicle(true);
      P.x = s.x + 2; P.z = s.z + 2;
      g.sky.time = (g.sky.time + hours) % 24;
      this.counts.jailed++;
      out = { ok: true, outcome: 'jailed', hours, stars, at: { x: r1(P.x), z: r1(P.z) } };
      g.hud?.toast(`${hours} HOURS IN THE CELL · THEY LET YOU OUT`, 'warn');
    }
    g.wanted = 0; g.wantedT = 0; this.lastWanted = 0;
    this.counts.arrests++;
    if (A) { A.resp.mode = 'leave'; for (const c of A.resp.men) if (c.alive) { c.hold = 0; c.target = null; c.state = 'idle'; } }
    this.arrest = null;
    g.emit('arrested', out);
    return out;
  }

  shootout(why) {
    const g = this.g, A = this.arrest;
    if (!A) return;
    A.resp.mode = 'fight';
    for (const c of A.resp.men) if (c.alive) { c.hold = 0; c.target = g.player; c.grudge = g.player; c.state = 'fight'; }
    this.arrest = null; this.counts.shootouts++;
    if (g.wanted < 2) g.raiseWanted(1);
    g.hud?.toast('THEY OPEN UP', 'hot');
    g.emit('shootout', { id: A.resp.id, why });
  }

  stepArrest(dt) {
    const g = this.g, P = g.player, A = this.arrest;
    if (!A) return;
    A.t += dt;
    const men = A.resp.men.filter((c) => c.alive);
    if (!men.length) { this.arrest = null; return; }
    if (!P.alive) { this.arrest = null; return; }
    // Hurt one of them, or run: it is a fight. Only YOUR hit counts (law 6): a bite from the infected or someone else's
    // round is not you, so they take the new hp as it is and keep the arrest (their own AI answers whoever did it).
    for (let i = 0; i < A.resp.men.length; i++) {
      const c = A.resp.men[i];
      if (A.hp0[i] <= 0 || !(c.hp < A.hp0[i] - 0.5 || !c.alive)) continue; // a man already gone from the count
      if (c.lastAttacker === P) { this.shootout('you hurt one of them'); return; }
      g.emit('bullHurtNotByYou', { id: c.id, by: c.lastAttacker?.id ?? null, byFaction: c.lastAttacker?.faction ?? null });
      A.hp0[i] = c.alive ? c.hp : 0;
    }
    let nd = Infinity;
    for (const c of men) {
      const dx = P.x - c.x, dz = P.z - c.z, d = Math.hypot(dx, dz);
      nd = Math.min(nd, d);
      c.hold = 0.3; c.face = Math.atan2(dx, dz); c.aiming = true;
      if (d > 3) g.ai.move(c, dx, dz, d > 12 ? 4.6 : 2.4, dt);
    }
    // Every warden nearby holds fire while the offer stands.
    for (const c of g.chars) if (c.alive && c.faction === 'warden' && !c.sec && Math.abs(c.x - P.x) < 40 && Math.abs(c.z - P.z) < 40) c.hold = Math.max(typeof c.hold === 'number' ? c.hold : 0, 0.3);
    if (nd > 40 || A.t > 30) { this.shootout(nd > 40 ? 'you ran' : 'you took too long'); return; }
    const still = !P.inVehicle && (P.speed ?? 0) < 0.5 && g.arms?.stance === 'holstered';
    if (nd < ARREST_R && still) { A.still += dt; if (A.still > 1.5) this.surrender(); }
    else A.still = 0;
    if (this.arrest) g.hud?.prompt(`<b class="warn">HANDS UP</b> · ${g.arms?.stance === 'holstered' ? 'stand still beside them' : 'holster (hold <kbd>H</kbd>)'} to surrender · run or shoot to fight`);
  }

  // ---- driving (v.ai 'security'): to the target on the car nav, slow near people, park and get out ----------------------
  drive(v, tx, tz, dt, stopAt = 14, cruise = 20) {
    const g = this.g;
    if (!v.driver || v.dead) return true;
    v.routeT = (v.routeT ?? 0) - dt;
    if (v.routeT <= 0 || !v.route) { v.routeT = 2; v.route = g.nav?.car?.find(v.x, v.z, tx, tz) ?? [{ x: tx, z: tz }]; v.ri = 0; }
    let tgt = v.route[v.ri] ?? { x: tx, z: tz };
    if (Math.hypot(tgt.x - v.x, tgt.z - v.z) < 8 && v.ri < v.route.length - 1) { v.ri++; tgt = v.route[v.ri]; }
    const dEnd = Math.hypot(tx - v.x, tz - v.z), want = Math.atan2(tgt.x - v.x, tgt.z - v.z);
    let diff = want - v.h; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    v.steer = Math.max(-1, Math.min(1, diff * 2.2));
    const sp = Math.hypot(v.vx, v.vz);
    let target = dEnd < stopAt ? 0 : Math.min(cruise, 6 + dEnd * 0.4) * (Math.abs(diff) > 0.6 ? 0.5 : 1);
    const fx = Math.sin(v.h), fz = Math.cos(v.h);
    for (const c of g.chars) {
      if (!c.alive || c.inVehicle || Math.abs(c.x - v.x) > 14 || Math.abs(c.z - v.z) > 14) continue;
      const ox = c.x - v.x, oz = c.z - v.z, along = ox * fx + oz * fz;
      if (along > 0 && along < 10 && Math.abs(ox * fz - oz * fx) < v.wid * 0.5 + 1.2) target = 0;
    }
    v.throttle = sp < target ? 0.8 : sp > target + 1.5 ? -0.7 : 0;
    v.handbrake = false;
    this.gx.steer(v, dt); // a chain in the road: brake or go round
    return dEnd < stopAt && sp < 1.5;
  }

  // ---- the loop ----------------------------------------------------------------------------------------------------------
  update(dt) {
    const g = this.g, P = g.player;
    // New stars: send the next rung (from the town whose patch you're in).
    if (this.auto && g.wanted > this.lastWanted && P.alive) {
      const T = this.townNear(P.x, P.z);
      if (T) this.dispatch(this.tierFor(g.wanted), `wanted ${g.wanted}`, T);
    }
    this.lastWanted = g.wanted;
    for (let i = this.responses.length - 1; i >= 0; i--) {
      const r = this.responses[i], men = r.men.filter((c) => c.alive);
      if (!men.length || (r.mode === 'leave' && g.time - r.at > 240)) { this.retire(r); this.responses.splice(i, 1); continue; }
      if (r.tier === 'tracers') continue; // the hunter car drives itself (v.ai 'raider': ram and shoot)
      const px = P.inVehicle ? P.inVehicle.x : P.x, pz = P.inVehicle ? P.inVehicle.z : P.z;
      if (r.mode === 'drive') {
        let arrived = r.cars.length === 0;
        for (const v of r.cars) if (v.driver && !v.dead && this.drive(v, px, pz, dt)) arrived = true;
        if (r.cars.every((v) => v.dead || !v.driver)) arrived = true;
        if (arrived) {
          for (const v of r.cars) for (const o of [...(v.occ ?? [])]) if (o && o !== P) g.seats.leave(o);
          r.mode = 'out'; r.outAt = g.time;
          g.emit('securityArrived', { id: r.id, tier: r.tier, d: r1(Math.hypot(px - (r.cars[0]?.x ?? px), pz - (r.cars[0]?.z ?? pz))) });
        }
      } else if (r.mode === 'out') {
        if (g.wanted > 0 && SECURITY_TIERS[r.tier].arrest && g.wanted <= 2 && !this.arrest) this.offerArrest(r);
        else if (g.wanted > 0) { for (const c of men) if (!c.target) { c.target = P; c.state = 'fight'; } r.mode = 'fight'; }
        else r.mode = 'leave';
      } else if (r.mode === 'leave') {
        // Back in the car and home.
        for (const v of r.cars) if (!v.dead && !v.driver) { const c = men.find((m) => !m.inVehicle && Math.hypot(m.x - v.x, m.z - v.z) < 4); if (c) g.seats.board(c, v, 0); else { const m = men.find((x) => !x.inVehicle); if (m) { m.hold = 0.3; g.ai.move(m, v.x - m.x, v.z - m.z, 3.5, dt); } } }
        const T = this.towns.find((t) => t.id === r.town), s = T && this.stationOf(T);
        for (const v of r.cars) if (v.driver && s && this.drive(v, s.x, s.z, dt, 8, 14)) { r.home = true; }
        if (r.home || Math.hypot(P.x - (r.cars[0]?.x ?? 0), P.z - (r.cars[0]?.z ?? 0)) > FAR_STATION) { this.retire(r); this.responses.splice(i, 1); }
      }
    }
    this.stepArrest(dt);
    for (let i = this.blocks.length - 1; i >= 0; i--) {
      const b = this.blocks[i];
      if (g.time - b.at > 150 || Math.hypot(P.x - b.x, P.z - b.z) > 400) { this.clearBlock(b); this.blocks.splice(i, 1); continue; }
      for (const c of b.men) if (c.alive && !c.target) { c.hold = 0.3; } else if (c.alive && c.target) c.hold = 0;
    }
    if (this.ambient) this.patrol(dt);
  }

  // The car that drives the town's loop and the two who walk the beat: near the station only (they go home past it).
  patrol(dt) {
    const g = this.g, P = g.player;
    for (const T of this.towns) {
      const s = this.stationOf(T), d = Math.hypot(P.x - s.x, P.z - s.z);
      if (d < NEAR_STATION && !T.patrol && g.time > 20) {
        const v = this.car(s.x, s.z, 0, T);
        const c = this.officer(T, s.x, s.z, 'bulls', { patrol: true });
        if (c) g.seats.board(c, v, 0);
        T.patrol = v; T.loopI = 0; this.counts.patrols++;
        for (let k = 0; k < T.row.beat - 1; k++) { const m = this.officer(T, s.x + 3 + k, s.z + 3, 'bulls', { beat: true }); if (m) { m.home = { x: s.x, z: s.z }; T.beat.push(m); } }
        g.emit('patrolOut', { town: T.id, car: v.id });
      } else if (d > FAR_STATION && T.patrol) {
        const v = T.patrol;
        if (!v.dead) { for (const o of [...(v.occ ?? [])]) if (o && o !== P) { g.seats.leave(o, true); g.removeChar(o); } if (P.inVehicle !== v) g.vehiclesSys.remove(v); }
        for (const m of T.beat) if (m.alive && Math.hypot(m.x - P.x, m.z - P.z) > 120) g.removeChar(m);
        T.patrol = null; T.beat = [];
      }
      const v = T.patrol;
      if (v && !v.dead && v.driver && v.driver !== P && v.ai === 'security' && !v.driver.target) {
        const w = T.row.patrol[T.loopI % T.row.patrol.length];
        if (this.drive(v, s.x + w[0], s.z + w[1], dt, 9, 11)) T.loopI++;
      } else if (v && v.driver && v.driver.target) { v.throttle = 0; v.handbrake = true; }
    }
  }

  retire(r) {
    const g = this.g, P = g.player;
    for (const c of r.men) if (c.alive && !c.inVehicle && Math.hypot(c.x - P.x, c.z - P.z) > 60) g.removeChar(c);
    for (const v of r.cars) if (!v.dead && v !== P.inVehicle && Math.hypot(v.x - P.x, v.z - P.z) > 60) { for (const o of [...(v.occ ?? [])]) if (o) { g.seats.leave(o, true); g.removeChar(o); } g.vehiclesSys.remove(v); }
  }

  clearBlock(b) {
    const g = this.g;
    if (b.chain) this.gx.remove(b.chain);
    for (const c of b.men) if (c.alive && Math.hypot(c.x - g.player.x, c.z - g.player.z) > 60) g.removeChar(c);
    for (const v of b.cars) if (!v.dead && v !== g.player.inVehicle) g.vehiclesSys.remove(v);
  }

  // The station stub (until the cities lane's building lands): a signpost, a lamp, the garage pad's paint.
  draw(gx) {
    const P = this.g.player;
    for (const T of this.towns) {
      const s = T.station;
      if (!s || s.building || Math.abs(s.x - P.x) > 140 || Math.abs(s.z - P.z) > 140) continue;
      gx.put(s.x, 0, s.z, s.rot, -4, 1.2, 0, 0.12, 2.4, 0.12, '#3a342c');
      gx.put(s.x, 0, s.z, s.rot, -4, 2.3, 0, 1.6, 0.5, 0.06, '#d9d2c2');
      gx.put(s.x, 0, s.z, s.rot, -4, 2.3, 0.04, 1.3, 0.12, 0.02, '#7a2119');
      for (const lx of [-2.6, 2.6]) gx.put(s.x, 0, s.z, s.rot, lx, 0.015, 3, 0.12, 0.01, 6.5, '#d8c890');
      gx.put(s.x, 0, s.z, s.rot, 0, 0.015, 6.2, 5.3, 0.01, 0.12, '#d8c890');
      gx.put(s.x, 0, s.z, s.rot, 4.5, 2.2, -1, 0.1, 4.4, 0.1, '#2a2622');
      gx.put(s.x, 0, s.z, s.rot, 4.1, 4.3, -1, 0.8, 0.12, 0.3, '#2a2622');
    }
  }

  view() {
    const g = this.g, P = g.player;
    const car = (v) => v && { id: v.id, type: v.type, x: r1(v.x), z: r1(v.z), dead: !!v.dead, driver: v.driver?.id ?? null, d: r1(Math.hypot(v.x - P.x, v.z - P.z)) };
    return {
      wanted: g.wanted, tier: g.wanted ? this.tierFor(g.wanted) : null, ambient: this.ambient,
      towns: this.towns.map((T) => ({ id: T.id, name: T.row.name, station: T.station && { x: r1(T.station.x), z: r1(T.station.z), building: T.station.building }, patrol: car(T.patrol), beat: T.beat.filter((c) => c.alive).map((c) => c.id) })),
      responses: this.responses.map((r) => ({ id: r.id, tier: r.tier, mode: r.mode, why: r.why, cars: r.cars.map(car), men: r.men.map((c) => ({ id: c.id, alive: c.alive, x: r1(c.x), z: r1(c.z), inVehicle: !!c.inVehicle, weapon: c.weapon, flag: c.flag, d: r1(Math.hypot(c.x - P.x, c.z - P.z)) })) })),
      roadblocks: this.blocks.map((b) => ({ id: b.id, x: r1(b.x), z: r1(b.z), cars: b.cars.map(car), chain: b.chain?.id ?? null })),
      arrest: this.arrest && { id: this.arrest.resp.id, t: r1(this.arrest.t), still: r1(this.arrest.still) },
      counts: { ...this.counts },
    };
  }
}
