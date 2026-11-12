// VEHICLES V2 slice 5, THE SUV IN THE 18-WHEELER (Robert 11-12: "the 18-wheeler. You gotta be able to drive an SUV inside
// of it"; docs/status/vehicles-v2.md on docs/web-veh-status): selftest checks. The SUV: systems/suv.js + data/suv.js. The
// ramp and the hold are the semis lane's (systems/semis.js THE HOLD, data/trailers.js).
import { VEHICLES } from '../systems/vehicles.js';
import { TRAILERS, FREIGHT, fitsHold } from '../data/trailers.js';
import { CHASSIS } from '../data/workshop.js';
import { glassLayout, PART as PARTID } from '../systems/vehiclebodies.js';

const r2 = (v) => Math.round(v * 100) / 100;

export async function vehSuvChecks(api, check, C) {
  const g = api.g, vs = () => g.vehiclesSys, S = () => g.semis, I = g.input;
  const keysUp = () => { for (const k of ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'KeyG']) I.down.delete(k); };
  const drop = (...vv) => { if (g.player.inVehicle) g.exitVehicle(true); for (const v of vv) if (v && g.vehicles.includes(v)) { v.carriedBy = null; vs().remove(v); } };

  await check('suv: the SUV is a row and a real body - four doors, the glass to the tailgate, a roof rack, its wheels; a workshop chassis; the built body is no taller than its row says; it fits the LONGHAULER box hold and the freight\'s first box rig carries one', async () => {
    const s = VEHICLES.suv;
    if (!s) return 'no VEHICLES.suv';
    const v = vs().spawn('suv', 0, -60, 0, '#5d6a52');
    try {
      const pa = v.mesh.geometry.attributes.part, P = new Set(pa.array);
      const tris = v.mesh.geometry.attributes.position.count / 3, glass = glassLayout(s, 'suv');
      const fit = fitsHold(TRAILERS.box, s), freight = FREIGHT.rigs.boxes.some((r) => r.cargo?.includes('suv'));
      const doors = ['doorL', 'doorR', 'doorL2', 'doorR2'].every((p) => [...P].includes(PARTID[p]));
      v.mesh.geometry.computeBoundingBox(); const top = v.mesh.geometry.boundingBox.max.y, wide = v.mesh.geometry.boundingBox.max.x * 2; // the built body: no taller than its row says (a box trailer's door)
      return tris > 400 && doors && glass && CHASSIS.suv && fit === null && freight && top <= s.tall + 0.005 && top > s.tall - 0.15 ? true : JSON.stringify({ tris, doors, glass: !!glass, chassis: !!CHASSIS.suv, fit, freight, top: r2(top), tall: s.tall, wide: r2(wide) });
    } finally { drop(v); }
  });

  await check('suv: the SUV drives up the ramp of a parked LONGHAULER box trailer on held keys and rides in the hold, on its floor', async () => {
    const r = S().spawnRig('box', 330, -420, -Math.PI / 2);
    const tip = S().tipZ(r.T), w = { x: r.T.x + Math.sin(r.T.h) * (tip - 8), z: r.T.z + Math.cos(r.T.h) * (tip - 8) };
    const suv = vs().spawn('suv', w.x, w.z, r.T.h, '#5d6a52');
    const R = TRAILERS.box, out = {};
    try {
      S().setRamp(r.T, true); await api._step(Math.ceil(R.ramp.secs * 60) + 10);
      g.enterVehicle(suv); await api._step(2);
      // Ease up the ramp (no faster than ~1.8 m/s) until it is well inside, then brake to a stop.
      for (let f = 0; f < 60 * 12 && !(suv.carry && suv.carry.lz > R.ramp.hinge + 4.5); f++) {
        const sp = suv.vx * Math.sin(suv.h) + suv.vz * Math.cos(suv.h);
        I.down.delete('KeyW'); I.down.delete('KeyS'); if (sp < 1.8) I.down.add('KeyW'); else if (sp > 3.8) I.down.add('KeyS');
        await api._step(1);
      }
      keysUp();
      for (let f = 0; f < 60; f++) { I.down.delete('KeyS'); if ((suv.carry?.lvz ?? 0) > 0.15) I.down.add('KeyS'); await api._step(1); }
      keysUp();
      out.carried = suv.carriedBy === r.T; out.y = r2(suv.y ?? 0); out.lz = r2(suv.carry?.lz ?? NaN); out.cargo = r.T.cargo?.length ?? 0;
      return out.carried && out.y > 0.9 && out.cargo >= 1 ? true : JSON.stringify(out);
    } finally { keysUp(); drop(suv, ...(r.T?.cargo ?? []), r.K, r.T); for (const c of [...g.chars]) if (c.name === 'Hauler (selftest)' && !g.vehicles.includes(c.inVehicle)) g.removeChar?.(c); }
  });
}
