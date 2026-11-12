// THE MONSTER TRUCK (VEHICLES V2 slice 9; rows in data/monster.js). Registers its row, chassis and body (HULLS, which
// vehiclebodies.buildBody asks first; its cab glass in GREENHOUSE), lets it wear the workshop's MONSTER TYRES as built in
// (UTILITY.monster: the lift, the tread, climbing over cars and caving their roofs - systems/workshop.js), and parks one at
// the Dust Bowl the first time you come near (once).
import { VEHICLES } from './vehicles.js';
import { HULLS } from './movetowbodies.js';
import { CHASSIS, UTILITY } from '../data/workshop.js';
import { MONSTER_ROW, MONSTER_GLASS, MONSTER_CHASSIS, MONSTERS } from '../data/monster.js';

VEHICLES.monster_truck ??= MONSTER_ROW;
CHASSIS.monster_truck ??= MONSTER_CHASSIS;
if (UTILITY.monster?.chassis && !UTILITY.monster.chassis.includes('monster_truck')) UTILITY.monster.chassis.push('monster_truck');
HULLS.monster_truck ??= monsterBody;

export class Monsters {
  constructor(game) { this.g = game; game.monsters = this; this.placed = new Set(); this.nextTry = 0; }
  // Every monster truck wears its tyres: a spawn, a load, a ghost from a friend's page (a cheap test a frame).
  kit(v) { // (an old save can hold another set too: it comes off, one tread set a car)
    if (v.utility?.monster) return;
    v.utility ??= {};
    for (const u of MONSTER_ROW.builtIn.utility) { const set = UTILITY[u]?.set; if (set) for (const k of Object.keys(v.utility)) if (UTILITY[k]?.set === set) delete v.utility[k]; v.utility[u] = {}; }
    this.g.garage?.retune(v);
  }
  clearSpot(near, r) { // dry, open ground (the Dust Bowl has a pond), clear of buildings and other cars
    const S = this.g.statics, half = MONSTER_ROW.len / 2 + 2;
    const ok = (x, z) => { for (let dx = -half; dx <= half; dx += 2) for (let dz = -half; dz <= half; dz += 2) if (S.pointBlocked(x + dx, z + dz, 0.8) || (this.g.water?.depthAt(x + dx, z + dz) ?? 0) > 0.05) return false; return !this.g.vehicles.some((v) => Math.hypot(v.x - x, v.z - z) < half + 4); };
    for (let d = 0; d <= r; d += 4) for (let a = 0; a < 8; a++) { const x = near.x + Math.cos(a * Math.PI / 4) * d, z = near.z + Math.sin(a * Math.PI / 4) * d; if (ok(x, z)) return { x, z }; if (!d) break; }
    return null;
  }
  update() {
    const g = this.g, p = g.player;
    for (const v of g.vehicles) if (v.type === 'monster_truck' && !v.utility?.monster) this.kit(v);
    for (const M of MONSTERS) {
      if (this.placed.has(M.id) || Math.hypot(p.x - M.near.x, p.z - M.near.z) > 260) continue;
      if (g.vehicles.some((q) => q.monsterRow === M.id)) { this.placed.add(M.id); continue; } // already standing (a load brought it back)
      if (g.time < this.nextTry) continue; // the ground search is not cheap: once a second while it finds none
      const at = this.clearSpot(M.near, M.r); if (!at) { this.nextTry = g.time + 1; continue; }
      const v = g.vehiclesSys.spawn('monster_truck', at.x, at.z, M.h, M.paint); if (!v) continue;
      this.placed.add(M.id); v.monsterRow = M.id; v.fuel = (v.fuelCap ?? 0) * M.fuel; this.kit(v); // on fumes (data/monster.js)
      g.emit?.('monsterPlaced', { id: M.id, vehicle: v.id });
    }
  }
  // Which vehicle is the Dust Bowl's and what is in its tank (a save re-makes vehicles full: the row's fuel comes back here).
  save() { return { placed: [...this.placed], rows: this.g.vehicles.filter((v) => v.monsterRow).map((v) => [v.id, v.monsterRow, Math.round((v.fuel ?? 0) * 10) / 10]) }; }
  load(s) { this.placed = new Set(s?.placed ?? []); for (const [id, row, fuel] of s?.rows ?? []) { const v = this.g.vehicles.find((q) => q.id === id); if (v) { v.monsterRow = row; if (Number.isFinite(fuel)) v.fuel = fuel; } } }
}

// ---- the body: a short bulbous show truck on a tube frame (the tyres are the garage's monster tyres, drawn round it)
const FRAME = '#2a2826', SHOCK = '#c8c2b0', STACK = '#9a948a', BAR = '#1c1b19', CHROME = '#b8b2a6';
function monsterBody(parts, s, paint, K) {
  K.GREENHOUSE.monster_truck ??= MONSTER_GLASS;
  const { slab, beam, greenhouse, PART } = K, G = K.GREENHOUSE.monster_truck, L = s.len, hw = s.wid / 2, yB = 0.95, yHood = 1.42;
  // The tube frame low between the wheels, the long-travel shocks up to the body at each corner.
  for (const sd of [1, -1]) {
    parts.push(beam([sd * 0.55, 0.55, -L / 2 + 0.2], [sd * 0.55, 0.55, L / 2 - 0.2], 0.07, FRAME, PART.frame));
    for (const z of [L / 2 - 0.8, -L / 2 + 0.8]) for (const dz of [-0.18, 0.18]) parts.push(beam([sd * (hw - 0.2), 0.22, z + dz], [sd * (hw - 0.35), yB + 0.15, z + dz * 0.6], 0.06, SHOCK, PART.frame)); // from the axle up to the body
  }
  // The body: a high, rounded tub with a bulging hood and wheel arches cut as wide flares.
  const zb0 = -L / 2 + 0.25, zb1 = G.zC - 0.05; // the bed, behind the cab
  parts.push(slab(-hw + 0.3, hw - 0.3, yB, yHood - 0.06, zb1, L / 2 - 0.1, paint)); // the tub: the cab and the nose
  parts.push(slab(-hw + 0.4, hw - 0.4, yHood - 0.06, yHood + 0.02, G.zA + 0.02, L / 2 - 0.2, paint, PART.hood));
  parts.push(slab(-0.42, 0.42, yHood + 0.02, yHood + 0.24, G.zA + 0.3, L / 2 - 0.55, '#3a3632', PART.hood)); // the blower scoop
  // The axles sit where garage.js draws the tyres (UTILITY.monster: x out past the body, z at len/2 - 0.8, hub low).
  const ax = L / 2 - 0.8, hubY = 0.19, tyreOut = hw + 0.68;
  for (const z of [ax, -ax]) for (const sd of [1, -1]) {
    parts.push(slab(sd * (hw - 0.32), sd * (tyreOut + 0.05), yB + 0.06, yB + 0.16, z - 0.85, z + 0.85, paint)); // the flare, as wide as the tread
    parts.push(slab(sd * (tyreOut - 0.03), sd * (tyreOut + 0.05), yB - 0.16, yB + 0.16, z - 0.85, z + 0.85, paint)); // its turned-down lip, just clear of the tyre
    parts.push(beam([sd * 0.5, hubY, z], [sd * (hw - 0.05), hubY, z], 0.12, FRAME, PART.frame)); // the axle tube out to the hub
    parts.push(beam([sd * 0.55, 0.55, z], [sd * 0.5, hubY, z], 0.08, FRAME, PART.frame)); // the frame down to it
  }
  parts.push(slab(-hw + 0.4, hw - 0.4, yB + 0.05, yHood - 0.12, L / 2 - 0.12, L / 2 - 0.04, '#1c1b19')); // the grille
  parts.push(slab(-hw - 0.05, hw + 0.05, yB - 0.08, yB + 0.14, L / 2 - 0.06, L / 2 + 0.18, '#2a2826', PART.bumperF));
  // The cab: doors, a small greenhouse high up, the roll cage through it.
  for (const sd of [1, -1]) parts.push(slab(sd * (hw - 0.3), sd * (hw - 0.2), yB + 0.04, G.yB, G.zC + 0.04, G.zA - 0.04, paint, sd > 0 ? PART.doorL : PART.doorR)); // proud of the tub
  greenhouse(parts, G, paint, paint);
  for (const sd of [1, -1]) {
    parts.push(beam([sd * 0.7, G.yB, G.zA - 0.1], [sd * 0.62, G.yR + 0.12, G.roofF], 0.05, BAR, PART.frame));
    parts.push(beam([sd * 0.7, G.yB, G.zC + 0.1], [sd * 0.62, G.yR + 0.12, G.roofR], 0.05, BAR, PART.frame));
  }
  // A light bar on the roof; the short bed; twin stacks behind the cab; the tail.
  parts.push(slab(-0.7, 0.7, G.yR + 0.1, G.yR + 0.2, G.roofF - 0.15, G.roofF - 0.02, BAR));
  for (let k = -2; k <= 2; k++) parts.push(slab(k * 0.27 - 0.09, k * 0.27 + 0.09, G.yR + 0.11, G.yR + 0.19, G.roofF - 0.03, G.roofF + 0.01, '#f0e8c8', PART.light));
  for (const sd of [1, -1]) parts.push(slab(sd * (hw - 0.4), sd * (hw - 0.3), yB, yHood - 0.06, zb0 + 0.08, zb1, paint)); // the bed sides
  parts.push(slab(-hw + 0.4, hw - 0.4, yB, yB + 0.08, zb0 + 0.08, zb1, FRAME)); // the bed floor
  parts.push(slab(-hw + 0.3, hw - 0.3, yB, yHood - 0.06, zb0, zb0 + 0.08, paint, PART.bumperR)); // the tailgate
  for (const sd of [1, -1]) parts.push(beam([sd * 0.45, yB + 0.2, G.zC - 0.2], [sd * 0.45, G.yR + 0.55, G.zC - 0.25], 0.07, STACK, PART.frame));
  parts.push(slab(-hw - 0.05, hw + 0.05, yB - 0.1, yB + 0.12, -L / 2 - 0.15, -L / 2 + 0.05, CHROME, PART.bumperR));
}
