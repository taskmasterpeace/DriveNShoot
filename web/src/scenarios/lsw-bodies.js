import { outfit } from '../systems/characters.js';
import { freeSlots } from './gait-strip.js';

// The LSW-BODIES photo set (docs/design/WEB_LSW_BODIES.md §7): a street crowd, a gunfight, a pickup-bed rider, a prone
// shooter, a rider at the bars, a body on the ground - all inside the 24 nearest you, frozen in photo mode.
//   node tools/dl.mjs scenario name=lsw-bodies
//   node tools/dl.mjs screenshot x=<spot.x> z=<spot.z> zoom=14 --out lsw.jpg
//   node tools/dl.mjs bodies action=mode value=classic        (the same frame on the classic rig)
//   node tools/dl.mjs photo on=false
const FLAGS = ['US', 'MX', 'NG', 'JP', 'IE', 'HT', 'CU', 'VN', 'PH', 'DE', 'JM', 'BR', 'IN', 'CA'];

export default async (DL, game) => {
  const g = game;
  if (g.qol.photo) g.qol.togglePhoto(false);
  await DL.teleport({ x: 0, z: -70 });
  const cx = g.player.x, cz = g.player.z;
  for (const c of [...g.chars]) if (c !== g.player && (c.lswShot || (!c.npc && !c.inVehicle && Math.hypot(c.x - cx, c.z - cz) < 40))) g.removeChar(c);
  for (const v of [...g.vehicles]) if (v.lswShot) g.vehiclesSys.remove(v);
  freeSlots(g, 24);
  let n = 0;
  const add = (faction, x, z, face, set = {}, weapon = null) => {
    const c = g.addChar({ x: cx + x, z: cz + z, faction, weapon, colors: outfit(faction, seeded(n * 17 + 3)), hp: 100, name: set.name ?? `${faction} ${n}`, flag: FLAGS[n % FLAGS.length] });
    n++;
    if (!c) return null;
    Object.assign(c, { lswShot: true, hold: true, face, vx: 0, vz: 0, target: null, state: 'idle', aiming: false, crouch: false }, set);
    c.home = { x: c.x, z: c.z }; c.wx = c.x; c.wz = c.z;
    g.charR.paint(c);
    return c;
  };
  // The street crowd: people standing about and walking through.
  for (let k = 0; k < 8; k++) add('drifter', -9 + (k % 4) * 1.7, -3 + Math.floor(k / 4) * 2.2, k * 0.8, k % 3 === 0 ? { speed: 2.4, walk: k * 0.7 } : {}, k === 5 ? 'pistol' : null);
  // The gunfight: wardens behind cover (one crouched) and raiders aiming back.
  const fight = { x: 7, z: -2 };
  for (let k = 0; k < 3; k++) add('warden', fight.x - 2, fight.z - 2 + k * 1.6, Math.PI / 2, { aiming: true, crouch: k === 1, aimD: 8 }, 'smg');
  for (let k = 0; k < 3; k++) add('raider', fight.x + 5, fight.z - 2 + k * 1.6, -Math.PI / 2, { aiming: true, oneHand: k === 2, aimD: 8 }, k === 2 ? 'pistol' : 'rifle');
  // The prone shooter.
  const prone = add('warden', 2, 6, 0, { aiming: true, name: 'prone shooter' }, 'rifle');
  if (prone) g.stance.setProne(prone, true);
  // The body on the ground.
  const dead = add('drifter', -2, -6, 1.2, { name: 'the dead' });
  if (dead) { dead.alive = false; dead.hp = 0; dead.deadTime = 5; dead.blood = 0.6; g.charR.paint(dead); }
  // The pickup-bed rider and a rider at the bars.
  const truck = g.vehiclesSys.spawn('pickup', cx - 5, cz + 9, 0.3, '#5a4a32'); truck.lswShot = true; truck.ai = null; truck.throttle = 0;
  const bed = add('drifter', -5, 7, 0.3, { name: 'bed rider', aiming: false }, 'smg');
  const bike = g.vehiclesSys.spawn('bike', cx + 7, cz + 8, -0.4, '#3a3530'); bike.lswShot = true; bike.ai = null; bike.throttle = 0;
  const rider = add('raider', 7, 6, -0.4, { name: 'bike rider' });
  await DL.step({ seconds: 0.2 });
  if (bed) g.decks.mount(bed, truck, 0, -1.4, 'test');
  if (rider) g.seats.board(rider, bike, 0);
  await DL.step({ seconds: 0.2 });
  for (const c of g.chars) if (c.lswShot && c.alive && !c.inVehicle) { c.vx = c.vz = 0; }
  if (!g.qol.photo) g.qol.togglePhoto(true);
  Object.assign(g.qol.photo, { x: cx, z: cz + 1, h: 30, tilt: 0.14 });
  const at = (x, z) => ({ x: +(cx + x).toFixed(1), z: +(cz + z).toFixed(1) });
  // For a player: the camera sits on the set; `.` and `,` step it from the whole street to each shot in turn.
  const labels = { crowd: 'the street crowd', gunfight: 'the gunfight', bed: 'the pickup-bed rider', prone: 'the prone shooter', driver: 'the rider at the bars', dead: 'the body on the ground' };
  const spotsAt = { crowd: at(-6.5, -2), gunfight: at(8.5, -2), bed: at(-5, 8.5), prone: at(2, 6), driver: at(7, 8), dead: at(-2, -6) };
  g.qol.lookStops([{ x: cx, z: cz + 1, h: 26, tilt: 0.14, label: 'BODIES IN ACTION: the whole set' }, ...Object.entries(spotsAt).map(([k, s]) => ({ x: s.x, z: s.z, h: 11, tilt: 0.14, label: labels[k] }))], 0);
  return {
    people: n, center: at(0, 0),
    spots: { crowd: at(-6.5, -2), gunfight: at(fight.x + 1.5, fight.z), bed: at(-5, 8.5), prone: at(2, 6), driver: at(7, 8), dead: at(-2, -6) },
  };
};

function seeded(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
