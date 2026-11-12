// TANKS (VEHICLES V2 slice 8; rows in data/tanks.js). Registers the two tracked bodies where the engine looks for them
// (VEHICLES rows, CHASSIS rows, the guns in MOUNT_WEAPONS, the shells in AMMO_ITEMS and ITEMS, the hulls in HULLS - which
// vehiclebodies.buildBody asks first) and puts the placed ones in the world the first time you come near (once: a tank
// destroyed or driven off is gone for good). The turret is the top mount's (systems/garage.js draws a mount row's
// `turret` and `barrel` at the chassis mount's `at`, turned to where it last aimed; workshop.muzzle fires from there).
import { VEHICLES } from './vehicles.js';
import { HULLS } from './movetowbodies.js';
import { CHASSIS, MOUNT_WEAPONS, AMMO_ITEMS } from '../data/workshop.js';
import { ITEMS } from '../data/items.js';
import { TANK_ROWS, TANK_GUNS, TANK_AMMO, TANK_CHASSIS, TANKS_PLACED } from '../data/tanks.js';

for (const [k, r] of Object.entries(TANK_ROWS)) VEHICLES[k] ??= r;
for (const [k, r] of Object.entries(TANK_CHASSIS)) CHASSIS[k] ??= r;
for (const [k, r] of Object.entries(TANK_GUNS)) MOUNT_WEAPONS[k] ??= r;
for (const [k, r] of Object.entries(TANK_AMMO)) { AMMO_ITEMS[k] ??= r; ITEMS[k] ??= r; }
HULLS.tank_old ??= (parts, s, paint, K) => tankBody(parts, s, paint, K, 'old');
HULLS.tank_new ??= (parts, s, paint, K) => tankBody(parts, s, paint, K, 'new');

export class Tanks {
  constructor(game) { this.g = game; game.tanks = this; this.placed = new Set(); this.counts = { placed: 0 }; }
  // The nearest clear, dry ground to `near` for a body this size (rings of 4 m out to r).
  clearSpot(near, r, row) {
    const S = this.g.statics, W = this.g.water, half = Math.max(row.len, row.wid) / 2 + 1.5;
    const ok = (x, z) => { for (let dx = -half; dx <= half; dx += 2) for (let dz = -half; dz <= half; dz += 2) if (S.pointBlocked(x + dx, z + dz, 0.8) || (W?.depthAt?.(x + dx, z + dz) ?? 0) > 0.05) return false; return !this.g.vehicles.some((v) => Math.hypot(v.x - x, v.z - z) < half + 4); };
    for (let d = 0; d <= r; d += 4) for (let a = 0; a < 8; a++) { const x = near.x + Math.cos(a * Math.PI / 4) * d, z = near.z + Math.sin(a * Math.PI / 4) * d; if (ok(x, z)) return { x, z }; if (!d) break; }
    return null;
  }
  place(P) {
    const g = this.g, row = TANK_ROWS[P.type], at = this.clearSpot(P.near, P.r, row);
    if (!at) { g.emit?.('tankNotPlaced', { id: P.id, why: 'no clear ground' }); return null; } // tried again next time you come near
    this.placed.add(P.id);
    const v = g.vehiclesSys.spawn(P.type, at.x, at.z, P.h, P.paint);
    if (!v) return null;
    v.tankRow = P.id;
    for (const face of ['top', 'front']) { const kind = P.kit[face]; if (kind && !g.garage.canMount(v, face, kind)) g.garage.setMount(v, face, kind); }
    if (v.mounts?.top) v.mounts.top.ammo = P.kit.rounds; // what is in the gun (the old one's is empty: find shells)
    if (v.mounts?.front) v.mounts.front.ammo = P.kit.frontRounds ?? 0; // and in the hull gun (nothing comes free)
    v.fuel = (v.fuelCap ?? 0) * P.fuel; // the old one's tank is dry
    this.counts.placed++;
    g.emit?.('tankPlaced', { id: P.id, vehicle: v.id, type: P.type, x: Math.round(at.x), z: Math.round(at.z) });
    return v;
  }
  update() {
    const p = this.g.player;
    for (const P of TANKS_PLACED) if (!this.placed.has(P.id) && Math.hypot(p.x - P.near.x, p.z - P.near.z) < 260) {
      if (this.g.vehicles.some((q) => q.tankRow === P.id)) { this.placed.add(P.id); continue; } // already standing (a load brought it back)
      this.place(P);
    }
  }
  view() { return this.g.vehicles.filter((v) => TANK_ROWS[v.type]).map((v) => ({ id: v.id, type: v.type, row: v.tankRow ?? null, x: Math.round(v.x), z: Math.round(v.z), gun: v.mounts?.top?.kind ?? null, rounds: v.mounts?.top?.ammo ?? 0, fuel: Math.round(v.fuel ?? 0), hp: Math.round(v.hp) })); }
  // Which vehicle is which placed tank, and its fuel (a vehicle's litres are not in the save on this branch: a dry tank
  // must load dry), ride the save.
  save() { return { placed: [...this.placed], rows: this.g.vehicles.filter((v) => v.tankRow).map((v) => [v.id, v.tankRow, Math.round((v.fuel ?? 0) * 10) / 10]) }; }
  load(s) {
    this.placed = new Set(s?.placed ?? []);
    for (const [id, row, fuel] of s?.rows ?? []) { const v = this.g.vehicles.find((q) => q.id === id); if (v) { v.tankRow = row; if (Number.isFinite(fuel)) v.fuel = fuel; } }
    if (!s) for (const v of this.g.vehicles) if (v.tankRow) this.placed.add(v.tankRow);
  }
}

// ---- the hulls (body frame: +z forward, +x the driver's left). Tracks and road wheels, a sloped glacis, the engine deck,
// a hatch; the turret is the gun mount's (garage.js), so the hull wears its ring.
const TRACK = '#22211f', LINK = '#3a3834', WHEEL = '#2e2c28', RIVET = '#2a2d22';
function tankBody(parts, s, paint, K, era) {
  const { slab, beam, wheel, PART } = K, L = s.len, hw = s.wid / 2, old = era === 'old';
  const tw = old ? 0.5 : 0.62, yTop = old ? 1.55 : 1.45, yDeck = old ? 1.15 : 1.0, r = old ? 0.36 : 0.4;
  // Tracks: a long dark belt each side with guide horns along the top, road wheels inside it, a drive sprocket at the back.
  for (const sd of [1, -1]) {
    const x0 = sd * (hw - tw), x1 = sd * hw;
    parts.push(slab(Math.min(x0, x1), Math.max(x0, x1), 0.05, 0.22, -L / 2 + 0.25, L / 2 - 0.25, TRACK));
    parts.push(slab(Math.min(x0, x1), Math.max(x0, x1), 0.9, 1.02, -L / 2 + 0.55, L / 2 - 0.55, TRACK));
    for (let k = 0; k < 14; k++) { const z = -L / 2 + 0.6 + k * ((L - 1.2) / 13); parts.push(slab(Math.min(x0, x1) - 0.01, Math.max(x0, x1) + 0.01, 1.0, 1.05, z - 0.05, z + 0.05, LINK)); }
    const n = old ? 5 : 6;
    for (let k = 0; k < n; k++) {
      const z = -L / 2 + 1.0 + k * ((L - 2.0) / (n - 1)), part = k === 0 ? (sd > 0 ? PART.wheelRL : PART.wheelRR) : k === n - 1 ? (sd > 0 ? PART.wheelFL : PART.wheelFR) : PART.frame;
      wheel(parts, sd * (hw - tw / 2), z, r, tw * 0.8, part);
    }
    parts.push(slab(sd * (hw + (old ? 0.04 : 0.02)), sd * (hw + 0.1), 0.6, 1.1, -L / 2 + 0.4, L / 2 - 0.4, old ? RIVET : paint)); // the side skirt
  }
  // The hull between the tracks: belly, the upper hull, a sloped front (glacis), the engine deck at the back.
  const hx = hw - tw - 0.02;
  parts.push(slab(-hx, hx, 0.3, yDeck, -L / 2 + 0.3, L / 2 - 0.3, paint));
  parts.push(slab(-hw + 0.02, hw - 0.02, yDeck, yTop, -L / 2 + 0.2, L / 2 - (old ? 1.2 : 1.6), paint));
  const steps = 5;
  for (let k = 0; k < steps; k++) { // the glacis: a stepped slope from the deck down to the nose
    const z0 = L / 2 - (old ? 1.2 : 1.6) + k * ((old ? 1.0 : 1.4) / steps), z1 = z0 + (old ? 1.0 : 1.4) / steps, y1 = yTop - (yTop - 0.75) * ((k + 1) / steps);
    parts.push(slab(-hw + 0.04, hw - 0.04, 0.3, y1, z0, z1, paint, k === steps - 1 ? PART.bumperF : PART.hood));
  }
  if (old) for (const z of [-L / 2 + 0.5, -0.5, 0.8, L / 2 - 1.3]) for (const sd of [1, -1]) parts.push(slab(sd * (hw - 0.04), sd * (hw + 0.01), yTop - 0.12, yTop - 0.04, z - 0.05, z + 0.05, RIVET)); // rivet rows
  // The engine deck: grilles and an exhaust; the driver's hatch and vision block at the front; the turret ring.
  for (let k = 0; k < 4; k++) parts.push(slab(-hw + 0.5, hw - 0.5, yTop, yTop + 0.03, -L / 2 + 0.4 + k * 0.35, -L / 2 + 0.55 + k * 0.35, '#1e1d1b'));
  parts.push(slab(old ? 0.5 : 0.7, old ? 0.95 : 1.15, yTop, yTop + 0.18, L / 2 - (old ? 1.6 : 2.1), L / 2 - (old ? 1.2 : 1.7), '#2a2826', PART.doorL)); // the driver's hatch
  parts.push(beam([0, yTop + 0.02, -0.25 - (old ? 0 : 0.3)], [0, yTop + 0.06, -0.25 - (old ? 0 : 0.3)], old ? 1.0 : 1.3, '#2b2a27', PART.frame)); // the turret ring
  parts.push(slab(-hw + 0.3, -hw + 0.6, yDeck + 0.1, yDeck + 0.5, -L / 2 - 0.05, -L / 2 + 0.1, '#3a3632', PART.bumperR)); // tow eyes and the stowage box
  parts.push(slab(hw - 0.9, hw - 0.3, yTop - 0.05, yTop + 0.3, -L / 2 + 0.1, -L / 2 + 0.6, '#4e4a3a', PART.bumperR));
  if (!old) parts.push(slab(-hw + 0.2, -hw + 0.9, yTop, yTop + 0.42, -L / 2 + 0.3, -L / 2 + 1.2, '#3e4a32', PART.bumperR)); // a bustle rack
}
