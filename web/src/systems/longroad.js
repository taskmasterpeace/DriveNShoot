// THE LONG ROAD, live (docs/design/WEB_LONG_ROAD.md; rows in data/longroad.js). Three jobs:
//   - the GAP AUDIT: walk the built I-10 at a fixed step and list, per game mile, what a driver can see or meet within
//     sight of the road (the signs, the exits, the towns, THE ROADSIDE's sites and billboards, and the wayside beats),
//     then the dead stretches: longer than LONG_ROAD.maxGapS seconds at cruise with nothing in them.
//   - the WAYSIDE: beats placed only into the stretches the audit found dead (audited WITHOUT beats, so nothing doubles a
//     site), a pure function of the rows, the seed and the road; made real when the player is inside `wake` and outside
//     `view` (nothing spawns in view), back to their record past `far`. People who die stay dead; a cache taken stays taken.
//   - the TRIP LOG: from the town you left to the town you stopped at, the miles, the minutes, what you met, what it cost.
import { LONG_ROAD as LR, BIOME_MIX, WAYSIDE, TRAVELLERS } from '../data/longroad.js';
import { STREAM } from '../data/streaming.js';
import { hash32, rngOf } from '../world/geo.js';

const r1 = (v) => Math.round(v * 10) / 10;

export class LongRoadSys {
  constructor(game) {
    this.g = game;
    this.beats = null;   // placed beats (built once, from the road)
    this.live = {};      // beat id -> { chars: [c], wrecks: true }
    this.dead = {};      // traveller id -> true
    this.taken = {};     // beat id -> true (its cache)
    this.met = {};       // beat id -> true (passed on some trip)
    this.trip = null;    // the journey under way
    this.trips = [];     // finished journeys (the last 12)
    this.t = 0;
    this.stats = { promoted: 0, demoted: 0, inView: 0, trips: 0, searched: 0 };
  }
  get W() { return this.g.streamer?.W ?? null; }

  // ---- the gap audit ------------------------------------------------------------------------------------------------------
  // Everything seen from the road, as s positions along I-10 with a kind and a name.
  features(withBeats = true) {
    const W = this.W, out = [], see = (x, z, kind, name) => { const p = W.project(x, z, LR.sight * 4); if (p && p.d <= LR.sight) out.push({ s: p.s, kind, name }); };
    for (const sg of W.signs ?? []) see(sg.x, sg.z, 'sign', sg.lines?.[0] ?? sg.kind ?? 'sign');
    for (const t of W.towns ?? []) { const p = W.project(t.x, t.z, 4000); if (p && p.d < 2500) out.push({ s: p.s, kind: 'town', name: t.name }); }
    for (const e of W.exits ?? []) if (e.x !== undefined) see(e.x, e.z, 'exit', e.name ?? 'exit');
    const R = W.roadside;
    if (R) { for (const s of R.sites) see(s.x, s.z, s.kind, s.name); for (const b of R.billboards) see(b.x, b.z, 'billboard', b.id); for (const h of R.hazards) see(h.x, h.z, 'hazard', h.id); }
    for (const h of W.holdouts ?? []) if (h.x !== undefined) see(h.x, h.z, 'holdout', h.name ?? h.id);
    if (withBeats) for (const b of this.build()) out.push({ s: b.s, kind: 'beat:' + b.kind, name: b.name });
    return out.sort((a, b) => a.s - b.s);
  }
  // Per mile what was seen, and the dead stretches (seconds at cruise).
  audit(withBeats = true) {
    const W = this.W, L = W.L, f = this.features(withBeats), MI = STREAM.mile, miles = [];
    for (let m = 0; m * MI < L; m++) miles.push({ mile: m, seen: [] });
    for (const q of f) miles[Math.min(miles.length - 1, Math.floor(q.s / MI))].seen.push(q.kind);
    const gaps = []; let last = LR.edge;
    for (const q of [...f.filter((q) => q.s > LR.edge && q.s < L - LR.edge), { s: L - LR.edge, kind: 'end' }]) {
      const sec = (q.s - last) / LR.cruise;
      if (sec > LR.maxGapS) gaps.push({ from: r1(last / MI), to: r1(q.s / MI), seconds: Math.round(sec) });
      last = Math.max(last, q.s);
    }
    const worst = gaps.reduce((a, g) => Math.max(a, g.seconds), 0);
    const kinds = {}; for (const q of f) kinds[q.kind] = (kinds[q.kind] ?? 0) + 1;
    return { road: W.road?.id ?? 'I-10', miles: r1(L / MI), driveMin: Math.round(L / LR.cruise / 60), features: f.length, kinds, dead: gaps.length, deadMin: Math.round(gaps.reduce((a, g) => a + g.seconds, 0) / 60), worstS: worst, gaps, perMile: miles.map((m) => m.seen.length) };
  }

  // ---- the wayside beats --------------------------------------------------------------------------------------------------
  build() {
    if (this.beats) return this.beats;
    const W = this.W, beats = (this.beats = []);
    if (!W?.cl) return beats;
    const f = this.features(false), L = W.L, towns = (W.towns ?? []).map((t) => ({ t, p: W.project(t.x, t.z, 4000) })).filter((o) => o.p && o.p.d < 2500).sort((a, b) => a.p.s - b.p.s);
    const rng = rngOf(hash32(W.seed ?? 1, 4410));
    let last = LR.edge, n = 0;
    const fill = (a, b) => {
      const step = LR.everyS * LR.cruise;
      for (let s = a + step * (1 + (rng() - 0.5) * LR.jitter); s < b - step * 0.4; s += step * (1 + (rng() - 0.5) * LR.jitter)) {
        if (towns.some((o) => Math.abs(o.p.s - s) < LR.townClear)) continue;
        const at = W.at(s), side = rng() < 0.5 ? 1 : -1, off = LR.offset[0] + rng() * (LR.offset[1] - LR.offset[0]);
        const x = at.x + at.nx * off * side, z = at.z + at.nz * off * side, biome = W.biomeAt(x, z);
        const mix = BIOME_MIX[biome] ?? BIOME_MIX.d, tot = Object.values(mix).reduce((q, v) => q + v, 0);
        let pick = rng() * tot, kind = 'wreck';
        for (const [k, v] of Object.entries(mix)) { pick -= v; if (pick <= 0) { kind = k; break; } }
        const dir = rng() < 0.5 ? 1 : -1; // which way its travellers are heading along the road
        const behind = towns.filter((o) => (o.p.s - s) * dir < 0).sort((p, q) => Math.abs(p.p.s - s) - Math.abs(q.p.s - s))[0];
        const ahead = towns.filter((o) => (o.p.s - s) * dir > 0).sort((p, q) => Math.abs(p.p.s - s) - Math.abs(q.p.s - s))[0];
        const id = `lr-${n++}`, row = WAYSIDE[kind];
        const people = (row.people ?? []).map((role, i) => { const T = TRAVELLERS[role], [name, flag] = T.names[Math.floor(rng() * T.names.length)]; return { id: `${id}-${i}`, role, name, flag }; });
        beats.push({ id, kind, name: row.name, s, x, z, side, rot: Math.atan2(at.tx, at.tz), biome, dir, mile: r1(s / STREAM.mile),
          from: behind?.t.name ?? (dir > 0 ? 'THE WEST' : 'THE EAST'), to: ahead?.t.name ?? (dir > 0 ? 'THE EAST' : 'THE WEST'),
          people, source: `gap audit: I-10 mile ${r1(a / STREAM.mile)}-${r1(b / STREAM.mile)} had nothing for ${Math.round((b - a) / LR.cruise)} s` });
      }
    };
    for (const q of [...f.filter((q) => q.s > LR.edge && q.s < L - LR.edge), { s: L - LR.edge }]) {
      if ((q.s - last) / LR.cruise > LR.maxGapS) fill(last, q.s);
      last = Math.max(last, q.s);
    }
    return beats;
  }
  beatById(id) { return this.build().find((b) => b.id === id) ?? null; }

  promote(b) {
    const g = this.g, row = WAYSIDE[b.kind], live = (this.live[b.id] = { chars: [], wrecks: false });
    const c0 = Math.cos(b.rot), s0 = Math.sin(b.rot);
    const recs = (row.wrecks ?? []).map(([type, state, dx, dz, rot], i) => ({ x: b.x + dx * c0 + dz * s0, z: b.z - dx * s0 + dz * c0, rot: b.rot + rot, type, state, paint: (hash32(i, b.s | 0) % 6) }));
    if (recs.length && g.wrecks) { g.wrecks.add(`longroad:${b.id}`, recs, g.streamer?.W?.groundAt?.(b.x, b.z) ?? 0); live.wrecks = true; }
    b.people.forEach((p, i) => {
      if (this.dead[p.id]) return;
      const T = TRAVELLERS[p.role], P = T.portrait, a = (i / Math.max(1, b.people.length)) * 6.28;
      const x = b.x + Math.cos(a) * 2.6 - b.side * (p.role === 'raider' ? -6 : 0), z = b.z + Math.sin(a) * 2.6;
      const line = T.line.replace('{from}', b.from).replace('{to}', b.to);
      const c = g.addChar({ x, z, faction: T.faction, weapon: T.weapon, hp: T.hp, name: p.name, flag: p.flag,
        npc: T.hostile ? undefined : { id: p.id, name: p.name, title: T.title, flag: p.flag, faction: T.faction, portrait: P, lines: [line], greet: line },
        colors: { skin: P.skin, hair: P.hair, shirt: P.shirt, pants: '#2f2a24', boots: '#2b241e', hat: '#5a3f24', hatStyle: P.hat, gearStyle: P.gear === 'bandolier' ? 'bandolier' : 'none', gear: '#3a3128',
          accStyle: { goggles: 'goggles', bandana: 'mask' }[P.gear] ?? 'none', mask: '#6a2a1e', sleeves: 'short' } });
      if (!c) return;
      c.home = { x, z }; c.hold = !T.hostile; c.longroad = b.id; c.traveller = { id: p.id, from: b.from, to: b.to, source: b.source };
      if (T.hostile) { c.angry = false; c.ambush = true; }
      live.chars.push(c);
    });
    this.stats.promoted++;
  }
  demote(b) {
    const g = this.g, L = this.live[b.id];
    if (!L) return;
    for (const c of L.chars) { if (!c.alive && !(c.downedT > 0)) this.dead[c.traveller.id] = true; if (g.chars.includes(c)) g.removeChar(c); }
    if (L.wrecks) g.wrecks?.remove(`longroad:${b.id}`);
    delete this.live[b.id]; this.stats.demoted++;
  }
  // E beside a beat's cache (on foot): what is in it goes into your pack, once.
  search(b, force = false) {
    const g = this.g, row = WAYSIDE[b.kind], P = g.player;
    if (!row.cache) return { ok: false, why: 'nothing to take here' };
    if (this.taken[b.id]) return { ok: false, why: 'already picked clean' };
    if (!force && (P.inVehicle || Math.hypot(P.x - b.x, P.z - b.z) > 3.2)) return { ok: false, why: 'get out and stand by it' };
    const got = {};
    for (const [id, n] of Object.entries(row.cache)) { const k = g.inventory.add(g.inventory.carried, id, n); if (k) got[id] = k; }
    g.inventory.changed?.();
    this.taken[b.id] = true; this.stats.searched++;
    if (this.trip) this.trip.found += Object.values(got).reduce((a, v) => a + (+v || 0), 0);
    g.hud?.toast(`${row.name}: TOOK ${Object.entries(got).map(([k, v]) => `${v} ${k.replace('_', ' ')}`).join(', ').toUpperCase()}`, 'job');
    return { ok: true, got };
  }

  // ---- the trip log -------------------------------------------------------------------------------------------------------
  townNear(x, z, r = 2600) { let best = null, bd = r; for (const t of this.W?.towns ?? []) { const d = Math.hypot(t.x - x, t.z - z); if (d < bd) { bd = d; best = t; } } return best; }
  tripTick(dt) {
    const g = this.g, v = g.player.inVehicle;
    if (!this.trip) {
      if (!v || Math.hypot(v.vx ?? 0, v.vz ?? 0) < 6) return;
      const t = this.townNear(v.x, v.z, 6000);
      this.trip = { from: t?.name ?? 'THE OPEN ROAD', m: 0, s: 0, met: [], found: 0, fuel0: v.fuel ?? null, hp0: v.hp ?? null, lx: v.x, lz: v.z, still: 0, day: g.society?.day ?? 0, hour: r1(g.sky?.time ?? 0) };
      return;
    }
    const T = this.trip, p = v ?? g.player, d = Math.hypot(p.x - T.lx, p.z - T.lz);
    if (d < 400) T.m += d; // a respawn or a dev teleport is not distance driven
    T.lx = p.x; T.lz = p.z; T.s += dt; T.v = v ?? T.v;
    for (const b of this.build()) if (!T.met.includes(b.id) && Math.abs(b.x - p.x) < LR.metPass && Math.hypot(b.x - p.x, b.z - p.z) < LR.metPass) { T.met.push(b.id); this.met[b.id] = true; }
    const slow = !v || Math.hypot(v.vx ?? 0, v.vz ?? 0) < 1;
    T.still = slow ? T.still + dt : 0;
    const town = T.still > LR.tripStopS ? this.townNear(p.x, p.z, 1600) : null;
    if (town && town.name !== T.from && T.m > LR.tripMinM) this.endTrip(town.name);
    else if (town && T.m <= LR.tripMinM) this.trip = null;
  }
  endTrip(to) {
    const T = this.trip, v = T.v, g = this.g;
    const log = { from: T.from, to, miles: r1(T.m / STREAM.mile), minutes: r1(T.s / 60), met: T.met.map((id) => this.beatById(id)?.name).filter(Boolean), found: T.found,
      fuel: v && T.fuel0 != null && v.fuel != null ? r1(T.fuel0 - v.fuel) : null, damage: v && T.hp0 != null && v.hp != null ? Math.round(T.hp0 - v.hp) : null, day: T.day, hour: T.hour };
    this.trips.push(log); if (this.trips.length > 12) this.trips.shift();
    this.trip = null; this.stats.trips++;
    g.hud?.toast(`${log.from} TO ${log.to}: ${log.miles} MI · ${log.minutes} MIN · MET ${log.met.length}${log.fuel != null ? ` · ${log.fuel} L` : ''}${log.damage ? ` · ${log.damage} DMG` : ''}`, 'job');
    return log;
  }

  update(dt) {
    this.t += dt;
    if (this.t < 0.5) return;
    const step = this.t; this.t = 0;
    const W = this.W; if (!W?.cl) return;
    const P = this.g.player, x = P.inVehicle?.x ?? P.x, z = P.inVehicle?.z ?? P.z;
    for (const b of this.build()) {
      const dx = b.x - x, dz = b.z - z;
      if (Math.abs(dx) > LR.far + 50 && Math.abs(dz) > LR.far + 50 && !this.live[b.id]) continue;
      const d = Math.hypot(dx, dz);
      if (this.live[b.id]) { if (d > LR.far) this.demote(b); }
      else if (d < LR.wake) { if (d > LR.view) this.promote(b); }
    }
    if (this.g.input?.pressed?.has('KeyE') && !P.inVehicle) for (const id of Object.keys(this.live)) { const b = this.beatById(id); if (b && Math.hypot(P.x - b.x, P.z - b.z) < 3.2 && WAYSIDE[b.kind].cache && !this.taken[id]) { this.search(b); break; } }
    this.tripTick(step);
  }

  save() { return { dead: { ...this.dead }, taken: { ...this.taken }, met: { ...this.met }, trips: this.trips.map((t) => ({ ...t, met: [...t.met] })) }; }
  load(s) {
    for (const id of Object.keys(this.live)) { const b = this.beatById(id); if (b) this.demote(b); }
    this.dead = { ...(s?.dead ?? {}) }; this.taken = { ...(s?.taken ?? {}) }; this.met = { ...(s?.met ?? {}) }; this.trips = (s?.trips ?? []).map((t) => ({ ...t })); this.trip = null;
  }
}
