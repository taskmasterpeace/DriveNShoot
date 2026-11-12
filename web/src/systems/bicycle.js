// THE BICYCLE (VEHICLES V2 slice 10; rows in data/bicycle.js). Registers the row and its body (HULLS, which
// vehiclebodies.buildBody asks first) and its little dynamo lamp (HULL_LAMPS); turns the rider's stamina into the push
// (v.legs, which vehicledamage.effects multiplies into power and top speed: pedalling drains it, SHIFT stands on the pedals,
// coasting gives it back, winded you creep); and leans a bicycle at each BICYCLES spot the first time you come near (once).
import * as THREE from 'three';
import { VEHICLES } from './vehicles.js';
import { HULLS, HULL_LAMPS } from './movetowbodies.js';
import { BICYCLE_ROW, PEDAL, BICYCLES } from '../data/bicycle.js';

VEHICLES.bicycle ??= BICYCLE_ROW;
HULLS.bicycle ??= bicycleBody;
HULL_LAMPS.bicycle ??= (s) => ({ head: [[0, 0.95, s.len / 2 - 0.3]], tail: [[0, 0.78, -s.len / 2 + 0.12]], beamW: 4, beamL: 10, halo: 0.5 });

export class Bicycles {
  constructor(game) { this.g = game; game.bicycles = this; this.placed = new Set(); }
  // The legs: what the rider has left becomes the push. Any rider (you, a friend's ghost is driven on their page).
  legs(v, dt) {
    const c = v.driver;
    if (!c) { v.legs = 1; return; }
    const st = c.stamina ?? 1, push = Math.abs(v.throttle ?? 0), max = c === this.g.player ? this.g.needs?.maxStamina ?? 1 : 1;
    if (push > 0.05) {
      const stand = !!v.boost && st > PEDAL.low;
      c.stamina = Math.max(0, st - (stand ? PEDAL.standDrain : PEDAL.drain) * push * dt);
      v.legs = st <= PEDAL.low ? PEDAL.winded : stand ? PEDAL.stand : 1;
    } else {
      c.stamina = Math.min(max, st + PEDAL.regen * (c === this.g.player ? this.g.needs?.staminaRegen ?? 1 : 1) * dt);
      v.legs = 1;
    }
  }
  clearSpot(near, r) { // dry, open ground, clear of walls and other vehicles
    const g = this.g, S = g.statics;
    const ok = (x, z) => { for (let dx = -1.5; dx <= 1.5; dx += 1.5) for (let dz = -1.5; dz <= 1.5; dz += 1.5) if (S.pointBlocked(x + dx, z + dz, 0.5) || (g.water?.depthAt(x + dx, z + dz) ?? 0) > 0.05) return false; return !g.vehicles.some((v) => Math.hypot(v.x - x, v.z - z) < 4); };
    for (let d = 0; d <= r; d += 3) for (let a = 0; a < 8; a++) { const x = near.x + Math.cos(a * Math.PI / 4) * d, z = near.z + Math.sin(a * Math.PI / 4) * d; if (ok(x, z)) return { x, z }; if (!d) break; }
    return null;
  }
  update(dt) {
    const g = this.g, p = g.player;
    for (const v of g.vehicles) if (v.pedal) this.legs(v, dt);
    for (const B of BICYCLES) {
      if (this.placed.has(B.id) || Math.hypot(p.x - B.near.x, p.z - B.near.z) > 200) continue;
      if (g.vehicles.some((q) => q.bicycleRow === B.id)) { this.placed.add(B.id); continue; } // a load brought it back
      const at = this.clearSpot(B.near, B.r); if (!at) continue; // no clear ground yet: tried again next frame
      const v = g.vehiclesSys.spawn('bicycle', at.x, at.z, B.h, B.paint); if (!v) continue;
      this.placed.add(B.id); v.bicycleRow = B.id;
      g.emit?.('bicyclePlaced', { id: B.id, vehicle: v.id });
    }
  }
  save() { return { placed: [...this.placed], rows: this.g.vehicles.filter((v) => v.bicycleRow).map((v) => [v.id, v.bicycleRow]) }; }
  load(s) { this.placed = new Set(s?.placed ?? []); for (const [id, row] of s?.rows ?? []) { const v = this.g.vehicles.find((q) => q.id === id); if (v) v.bicycleRow = row; } }
}

// ---- the body: a diamond frame of thin tubes, two spoked wheels, bars, a saddle, a rack over the back wheel
const TYRE = '#161514', RIM = '#9a968e', BAR = '#2a2826', SADDLE = '#1c1a18';
function ring(parts, z, r, K, part) {
  const t = new THREE.TorusGeometry(r, 0.04, 6, 22).rotateY(Math.PI / 2).translate(0, r, z).toNonIndexed();
  parts.push(K.tag(t, TYRE, part));
  const rim = new THREE.TorusGeometry(r - 0.05, 0.015, 4, 22).rotateY(Math.PI / 2).translate(0, r, z).toNonIndexed();
  parts.push(K.tag(rim, RIM, part));
  for (let k = 0; k < 4; k++) { const a = k * Math.PI / 4, dy = Math.cos(a) * (r - 0.06), dz = Math.sin(a) * (r - 0.06); parts.push(K.beam([0, r - dy, z - dz], [0, r + dy, z + dz], 0.012, RIM, part)); }
}
function bicycleBody(parts, s, paint, K) {
  const { beam, coloredBox, PART } = K, L = s.len, r = 0.34, zF = L / 2 - r - 0.02, zR = -L / 2 + r + 0.02;
  ring(parts, zF, r, K, PART.wheelFL);
  ring(parts, zR, r, K, PART.wheelRL);
  // The diamond: seat tube, top tube, down tube, the stays back to the rear hub; the fork down to the front hub.
  const bb = [0, 0.32, -0.05], seat = [0, 0.86, -0.22], head = [0, 0.9, zF - 0.24], headLo = [0, 0.72, zF - 0.2];
  parts.push(beam(bb, seat, 0.045, paint, PART.frame), beam(seat, head, 0.04, paint, PART.frame), beam(bb, headLo, 0.05, paint, PART.frame));
  parts.push(beam(bb, [0, r, zR], 0.03, paint, PART.frame), beam(seat, [0, r, zR], 0.03, paint, PART.frame));
  parts.push(beam(head, [0, r, zF], 0.035, BAR, PART.frame), beam(head, [0, 1.06, zF - 0.3], 0.035, BAR, PART.frame));
  parts.push(coloredBox(0.62, 0.035, 0.035, 0, 1.07, zF - 0.32, BAR, PART.frame)); // the bars
  parts.push(beam(seat, [0, 0.98, -0.26], 0.03, BAR, PART.frame), coloredBox(0.16, 0.06, 0.28, 0, 1.0, -0.27, SADDLE)); // post, saddle
  parts.push(coloredBox(0.06, 0.06, 0.2, 0, 0.32, -0.05, BAR), coloredBox(0.04, 0.16, 0.04, 0.12, 0.26, 0, BAR), coloredBox(0.04, 0.16, 0.04, -0.12, 0.38, -0.1, BAR)); // the crank, the pedals
  parts.push(coloredBox(0.22, 0.02, 0.36, 0, 0.78, zR + 0.04, BAR), beam([0.1, 0.78, zR - 0.12], [0.1, r, zR], 0.02, BAR), beam([-0.1, 0.78, zR - 0.12], [-0.1, r, zR], 0.02, BAR)); // the rack
  parts.push(coloredBox(0.08, 0.08, 0.06, 0, 0.95, zF - 0.24, '#e8e0c4', PART.light)); // the dynamo lamp
}
