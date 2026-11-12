import { outfit } from '../systems/characters.js';
import { freeSlots } from './gait-strip.js';

// The people photo booth: one of every look and pose, frozen in photo mode so the shot holds still.
// Row A faces the camera, row B (same cast) shows their backs. Re-running replaces the booth.
//   node tools/dl.mjs scenario name=people-lineup
//   node tools/dl.mjs screenshot zoom=9 --out people.jpg        (the scenario frames it in photo mode)
//   node tools/dl.mjs photo on=false                             (let the world run again)
const BOOTH = { x0: -62, x1: -18, z0: 337, z1: 357 };
const ROW_A = 343, ROW_B = 349, X0 = -58;

// [faction, weapon, pose, hatStyle?, gearStyle?]
const CAST = [
  ['drifter', 'pistol', 'idle', 'short', 'none'],
  ['drifter', 'pistol', 'aim', 'cap', 'pack'],
  ['raider', 'smg', 'aim', 'mohawk', 'pads'],
  ['warden', 'shotgun', 'idle', 'cowboy', 'vest'],
  ['warden', 'smg', 'crouchAim', 'cap', 'vest'],
  ['drifter', null, 'walk', 'wrap', 'none'],
  ['raider', 'pistol', 'run', 'short', 'vest'],
  ['drifter', null, 'cower', 'short', 'none'],
  ['zombie', null, 'shamble'],
  ['zombie', null, 'sprint'],
  ['drifter', 'smg', 'dead', 'cap', 'pack'],
];

const POSE = {
  idle: { speed: 0, walk: 0 },
  aim: { speed: 0, walk: 0, aiming: true },
  crouchAim: { speed: 0, walk: 0, aiming: true, crouch: true },
  walk: { speed: 2.6, walk: 1.1 },
  run: { speed: 6, walk: 0.55 },
  cower: { speed: 0, walk: 0.3, handsUp: true, crouch: true },
  shamble: { speed: 2.2, walk: 2.4 },
  sprint: { speed: 5.5, walk: 0.7 },
  dead: {},
};

export default async (DL, game) => {
  const inBooth = (o) => o.x > BOOTH.x0 && o.x < BOOTH.x1 && o.z > BOOTH.z0 && o.z < BOOTH.z1;
  for (const c of [...game.chars]) if (c !== game.player && !c.inVehicle && (c.booth || inBooth(c))) game.removeChar(c);
  for (const v of [...game.vehicles]) if (inBooth(v) && game.player.inVehicle !== v) game.vehiclesSys.remove(v);
  if (inBooth(game.player)) await DL.teleport({ x: -40, z: 362 });
  freeSlots(game, CAST.length * 2);

  const cast = [];
  for (const [row, face] of [[ROW_A, 0], [ROW_B, Math.PI]]) {
    CAST.forEach(([faction, weapon, pose, hat, gear], k) => {
      const x = X0 + k * 3.4;
      const colors = outfit(faction, mulberry(k * 31 + 7));
      if (hat) colors.hatStyle = hat;
      if (gear) colors.gearStyle = gear;
      const c = faction === 'zombie'
        ? game.zombies.spawn(x, row, pose === 'sprint')
        : game.addChar({ x, z: row, faction, weapon, colors, hp: 100, name: `${faction} ${pose}`, flag: ['US', 'MX', 'CA', 'IE', 'NG', 'VN', 'PH', 'DE', 'JM', 'BR', 'IN'][k] });
      if (!c) return;
      c.booth = true;
      c.x = x; c.z = row; c.face = face; c.vx = c.vz = 0;
      c.target = null; c.state = 'idle';
      if (faction === 'zombie') c.colors = colors;
      if (pose === 'dead') { c.alive = false; c.hp = 0; c.deadTime = 5; }
      Object.assign(c, { aiming: false, crouch: false, handsUp: false }, POSE[pose]);
      game.charR?.paint?.(c);
      cast.push({ id: c.id, faction, weapon, pose, x, z: row });
    });
  }
  // Freeze the world (AI would walk them off their marks) and frame both rows.
  if (!game.qol.photo) game.qol.togglePhoto(true);
  // For a player: the camera sits on the lineup (not where you stand); `.` and `,` step it person to person, fronts then backs.
  const stops = [{ x: X0 + 17, z: 346, h: 16, tilt: 0.14, label: 'PEOPLE LINEUP: faces in the front row, backs in the one behind' }];
  for (const [row, side] of [[ROW_A, 'front'], [ROW_B, 'back']]) CAST.forEach(([faction, , pose], k) => stops.push({ x: X0 + k * 3.4, z: row, h: 7, tilt: 0.14, label: `${faction} · ${pose} · ${side}` }));
  Object.assign(game.qol.photo, { x: X0 + 17, z: 346, h: 16, tilt: 0.14 });
  game.qol.lookStops(stops, 0);
  return { cast: cast.length, rows: { faceCamera: ROW_A, backs: ROW_B }, look: { x: X0 + 17, z: 346, zoom: 16 } };
};

// Small seeded RNG so every run dresses the cast the same way.
function mulberry(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
