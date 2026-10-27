import { OVERRUN } from '../data/citygen.js';
import { AMBIENT_RESERVE } from './zombies.js';
import { outfit } from './characters.js';

// OVERRUN (docs/design/WEB_CITYGEN.md §3.6): the dead against the living, settlement by settlement.
//   infestation  every settlement's 0..1 value (systems/citygen.js plan records): a horde at its edge pushes it up past what
//                its defense holds back; kills inside its footprint and quiet nights bring it down
//   hordes       RECORDS walking the country (strength = bodies) toward a settlement - a noisy one first, the nearest
//                otherwise - at dusk; near you (OVERRUN.horde.bodyR) up to `bodies` of them stand in the street as real
//                infected (the 160-character cap and the ambient reserve are never broken), the rest stay a number;
//                bodies that die take strength off the record
//   siege        a horde at a settlement fights its defense every tick: the defense kills, the excess presses in
//   fall         past OVERRUN.overrun the town is OVERRUN: its gates open, its residents run (a share) or turn (the rest),
//                its unsearched boxes are picked over (loot shifts), the map marks it, an event goes out
//   retake       clear it: infected killed inside drain it; under OVERRUN.retake with none left inside, it is RETAKEN
export class Overrun {
  constructor(cg) {
    this.cg = cg; this.g = cg.g;
    this.hordes = [];
    this.t = 0; this.nid = 0;
    this.auto = true;          // migrating hordes rise on their own at dusk (the battery and tests switch it off)
    this.autoT = 60;
    this.counts = { falls: 0, retakes: 0, hordes: 0, bodies: 0, killedInTowns: 0 };
  }

  night() { const h = this.g.sky?.time ?? 12; return h >= OVERRUN.dusk || h < OVERRUN.dawn; }

  // ---- residents: a holding town has people at its doors; they run or turn when it falls ----------------------------
  populate(t) {
    const g = this.g, rec = t.rec;
    if (rec.state === 'overrun') { this.infestLive(t, Math.min(12, Math.round(6 + rec.infestation * 10))); return; }
    if (rec.kind === 'base') return; // a base's garrison is the bases lane's (systems/bases.js)
    const want = Math.min(rec.kind === 'rural' ? 2 : 6, Math.max(0, Math.floor((g.freeSlots?.length ?? 0) - AMBIENT_RESERVE - 8) / 2));
    const doors = t.built.doors.filter((d) => d.kind === 'door');
    for (let i = 0; i < want && doors.length; i++) {
      const d = doors[(i * 7 + (rec.seed % 13)) % doors.length];
      const warden = !!t.T.wall && i % 2 === 0;
      const c = g.addChar({ x: d.x + (d.side === 'E' ? 1.6 : d.side === 'W' ? -1.6 : 0), z: d.z + (d.side === 'S' ? 1.6 : d.side === 'N' ? -1.6 : 0), faction: warden ? 'warden' : 'drifter', weapon: warden ? 'smg' : null, hp: 100, colors: outfit(warden ? 'warden' : 'drifter'), name: warden ? 'Town Guard' : 'Townsfolk', flag: g.randomFlag(Math.random) });
      if (!c) break;
      c.cgTown = rec.id; c.home = { x: c.x, z: c.z };
      t.chars.push(c);
    }
  }
  depopulate(t) {
    for (const c of t.chars) if (this.g.chars.includes(c)) this.g.removeChar(c);
    t.chars.length = 0;
  }
  infestLive(t, n) {
    const g = this.g, Z = g.zombies;
    if (!Z) return;
    const doors = t.built.doors;
    for (let i = 0; i < n && doors.length; i++) {
      if ((g.freeSlots?.length ?? 0) <= AMBIENT_RESERVE) break;
      const d = doors[(i * 5 + 3) % doors.length];
      const c = Z.spawn(d.x + (Math.random() - 0.5) * 6, d.z + (Math.random() - 0.5) * 6, Math.random() < 0.15);
      if (c) { c.cgTown = t.rec.id; t.chars.push(c); }
    }
  }

  // ---- the levers (commands, scenarios) ------------------------------------------------------------------------------
  setLevel(rec, v) {
    rec.infestation = Math.max(0, Math.min(1, v));
    if (rec.infestation >= OVERRUN.overrun && rec.state !== 'overrun') this.fall(rec, 'set');
    else if (rec.infestation < OVERRUN.retake && rec.state === 'overrun') this.retake(rec, 'set');
    return rec;
  }
  spawnHorde({ x, z, size = 60, toward = null, force = false }) {
    const target = toward ? this.cg.byId.get(toward) : this.nearestTown(x, z);
    const H = { id: `horde-${++this.nid}`, x, z, strength: Math.max(1, Math.round(size)), size0: Math.round(size), target: target?.id ?? null, state: 'walk', bodies: [], force, born: this.g.time ?? 0, sieged: 0 };
    this.hordes.push(H);
    this.counts.hordes++;
    this.g.emit?.('hordeRisen', { id: H.id, x: Math.round(x), z: Math.round(z), size: H.strength, toward: H.target });
    return H;
  }
  nearestTown(x, z) {
    let best = null, bd = OVERRUN.horde.seek;
    for (const r of this.cg.near(x, z, OVERRUN.horde.seek)) { if (r.state === 'overrun') continue; const d = Math.hypot(r.x - x, r.z - z); if (d < bd) { bd = d; best = r; } }
    return best;
  }
  onNoise(x, z, r) {
    if (r < 20) return;
    const rec = this.cg.recAt(x, z, 20);
    if (!rec) return;
    for (const H of this.hordes) if (H.state === 'walk' && Math.hypot(H.x - x, H.z - z) < OVERRUN.noise.draw) H.target = rec.id;
  }

  // ---- falls and retakes -----------------------------------------------------------------------------------------------
  fall(rec, why = 'horde') {
    if (rec.state === 'overrun') return;
    rec.state = 'overrun'; rec.fellAt = this.g.time ?? 0;
    if (rec.infestation < OVERRUN.overrun) rec.infestation = OVERRUN.overrun;
    this.counts.falls++;
    for (const g2 of rec.gates ?? []) g2.open = true;
    const t = this.cg.live.get(rec.id);
    if (t) {
      // residents: a share run (out of the gate, away), the rest turn where they stand
      let i = 0;
      for (const c of [...t.chars]) {
        if (!c.alive || c.faction === 'zombie') continue;
        if ((i++ % 10) / 10 < OVERRUN.fleeShare) { c.flee = 30; c.fleeX = rec.x; c.fleeZ = rec.z; c.cgFled = true; }
        else { const x = c.x, z = c.z; this.g.removeChar(c); t.chars.splice(t.chars.indexOf(c), 1); const zc = this.g.zombies?.spawn(x, z, false); if (zc) { zc.cgTown = rec.id; t.chars.push(zc); zc.name = 'Turned'; } }
      }
      // the boxes nobody has searched are picked over: the dead's own tables
      for (const q of t.built.loot) { const b = this.g.inventory?.boxes.get(q.id); if (b && !b.rolled) b.kind = OVERRUN.loot.overrun; }
    }
    this.g.emit?.('settlementOverrun', { id: rec.id, name: rec.name, x: rec.x, z: rec.z, why });
    this.g.hud?.toast?.(`${rec.name} HAS FALLEN`);
  }
  retake(rec, why = 'cleared') {
    if (rec.state !== 'overrun') return;
    rec.state = 'retaken'; rec.retakenAt = this.g.time ?? 0;
    rec.infestation = Math.min(rec.infestation, OVERRUN.retake * 0.5);
    for (const g2 of rec.gates ?? []) g2.open = false;
    this.counts.retakes++;
    this.g.emit?.('settlementRetaken', { id: rec.id, name: rec.name, why });
    this.g.hud?.toast?.(`${rec.name} RETAKEN`);
  }

  // ---- per frame: a 1 s tick ---------------------------------------------------------------------------------------------
  update(dt) {
    this.t -= dt;
    if (this.t > 0) return;
    const tick = 1 - this.t; this.t = 1;
    const g = this.g, P = g.player, O = OVERRUN, HO = O.horde, night = this.night();
    // dead infected inside a fallen town drain it; a town with none left inside and low enough is retaken
    for (const c of g.chars) {
      if (c.alive || c.faction !== 'zombie' || c.cgCounted) continue;
      c.cgCounted = true;
      const rec = this.cg.recAt(c.x, c.z, 4);
      if (rec) { rec.infestation = Math.max(0, rec.infestation - O.perKill); this.counts.killedInTowns++; }
      for (const H of this.hordes) { const i = H.bodies.indexOf(c); if (i >= 0) { H.bodies.splice(i, 1); H.strength = Math.max(0, H.strength - 1); } }
    }
    for (const t of this.cg.live.values()) {
      const rec = t.rec;
      if (rec.state !== 'overrun') continue;
      if (rec.infestation < O.retake) {
        let inside = 0;
        for (const c of g.chars) if (c.alive && c.faction === 'zombie' && Math.abs(c.x - rec.x) < rec.half && Math.abs(c.z - rec.z) < rec.half) inside++;
        if (!inside) this.retake(rec);
      }
    }
    // quiet settlements heal a little
    for (const rec of this.cg.plan) if (rec.state !== 'overrun' && rec.infestation > 0 && !this.hordes.some((H) => H.target === rec.id && H.state === 'siege')) rec.infestation = Math.max(0, rec.infestation - O.decay * tick);
    // hordes
    for (let i = this.hordes.length - 1; i >= 0; i--) {
      const H = this.hordes[i];
      if (H.strength <= 0) { this.dematerialize(H); this.hordes.splice(i, 1); g.emit?.('hordeSpent', { id: H.id }); continue; }
      const rec = H.target ? this.cg.byId.get(H.target) : null;
      // where the record is: the bodies' middle while they stand in the street
      const live = H.bodies.filter((c) => c.alive);
      if (live.length) { let sx = 0, sz = 0; for (const c of live) { sx += c.x; sz += c.z; } H.x = sx / live.length; H.z = sz / live.length; }
      const dP = Math.hypot(H.x - P.x, H.z - P.z);
      if (dP < HO.bodyR && H.bodies.length < Math.min(HO.bodies, H.strength)) this.materialize(H);
      else if (dP > HO.bodyR * 1.6 && H.bodies.length) this.dematerialize(H);
      if (!rec) { H.target = this.nearestTown(H.x, H.z)?.id ?? null; continue; }
      const dT = Math.hypot(rec.x - H.x, rec.z - H.z), edge = rec.half + HO.arrive;
      if (dT > edge) {
        H.state = 'walk';
        if (!night && !H.force) continue; // by day they stop and dig in
        if (!live.length) { const k = Math.min(1, (HO.speed * tick) / dT); H.x += (rec.x - H.x) * k; H.z += (rec.z - H.z) * k; }
        for (const c of live) if (!c.ztarget) { c.wx = rec.x + (Math.random() - 0.5) * 20; c.wz = rec.z + (Math.random() - 0.5) * 20; c.timer = 5; c.zSpeedBoost = 1; }
        continue;
      }
      // the siege: the defense kills, the excess presses in
      if (H.state !== 'siege') { H.state = 'siege'; g.emit?.('hordeAtGates', { id: H.id, town: rec.id, strength: H.strength }); }
      H.sieged += tick;
      if (rec.state === 'overrun') { H.state = 'feed'; continue; }
      const D = rec.defense ?? 0.25, held = D * HO.hold;
      const kills = Math.min(H.strength, D * HO.kill * tick);
      H.strength = Math.max(0, H.strength - kills);
      rec.infestation = Math.min(1, rec.infestation + Math.max(0, H.strength - held) * HO.press * tick);
      if (rec.infestation >= O.overrun) this.fall(rec, H.id);
    }
    // migrating hordes rise by themselves at dusk, out on the road toward a settlement near you
    if (this.auto && night && !g.society?.director?.paused) {
      this.autoT -= tick;
      if (this.autoT <= 0) {
        this.autoT = 240 + Math.random() * 240;
        const near = this.cg.near(P.x, P.z, 2500).filter((r) => r.state !== 'overrun' && r.kind !== 'base');
        if (near.length && this.hordes.length < 3) {
          const r = near[Math.floor(Math.random() * near.length)], a = Math.random() * Math.PI * 2, d = 1600 + Math.random() * 1400;
          this.spawnHorde({ x: r.x + Math.cos(a) * d, z: r.z + Math.sin(a) * d, size: 20 + Math.floor(Math.random() * 100), toward: r.id });
        }
      }
    }
  }
  materialize(H) {
    const g = this.g, Z = g.zombies, HO = OVERRUN.horde;
    if (!Z) return;
    const want = Math.min(HO.bodies, Math.round(H.strength)) - H.bodies.length;
    for (let i = 0; i < want; i++) {
      if ((g.freeSlots?.length ?? 0) <= AMBIENT_RESERVE + 4) break;
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 14;
      const c = Z.spawn(H.x + Math.cos(a) * r, H.z + Math.sin(a) * r, Math.random() < 0.15);
      if (!c) break;
      c.horde = H.id; H.bodies.push(c); this.counts.bodies++;
    }
  }
  dematerialize(H) {
    for (const c of H.bodies) if (c.alive && this.g.chars.includes(c)) this.g.removeChar(c);
    H.bodies.length = 0;
  }
  clear() { for (const H of this.hordes) this.dematerialize(H); this.hordes.length = 0; }
  view() { return this.hordes.map((H) => ({ id: H.id, x: Math.round(H.x), z: Math.round(H.z), strength: Math.round(H.strength), size0: H.size0, target: H.target, state: H.state, bodies: H.bodies.filter((c) => c.alive).length })); }
}
