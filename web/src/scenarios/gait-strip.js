import { outfit } from '../systems/characters.js';

// The gait strip: one stride frozen at eight phases, per gait, side-on - the reference strip an
// animator reads to catch skating feet, sinking boots and knees that bend the wrong way.
// Rows (south to north): walk 4.6 m/s, sprint 7.6, crouch-walk 2.2, infected shamble 1.6, sprinter 9.
//   node tools/dl.mjs scenario name=gait-strip
//   node tools/dl.mjs screenshot --out gait.jpg          (framed from the south, low, in photo mode)
const BOOTH = { x0: -62, x1: -18, z0: 362, z1: 382 };
const X0 = -56, DX = 1.7, Z0 = 378, DZ = -3.6;
const ROWS = [
  { faction: 'drifter', speed: 4.6, label: 'walk' },
  { faction: 'raider', speed: 7.6, label: 'sprint', weapon: 'pistol' },
  { faction: 'warden', speed: 2.2, label: 'crouch', crouch: true, weapon: 'smg' },
  { faction: 'zombie', speed: 1.6, label: 'shamble' },
  { faction: 'zombie', speed: 9, label: 'sprinter', runner: true },
];

export default async (DL, game) => {
  const inBooth = (o) => o.x > BOOTH.x0 && o.x < BOOTH.x1 && o.z > BOOTH.z0 && o.z < BOOTH.z1;
  for (const c of [...game.chars]) if (c !== game.player && !c.inVehicle && (c.gait || inBooth(c))) game.removeChar(c);
  if (inBooth(game.player)) await DL.teleport({ x: -40, z: 392 });
  freeSlots(game, ROWS.length * 8);
  let n = 0;
  ROWS.forEach((row, r) => {
    for (let k = 0; k < 8; k++) {
      const x = X0 + k * DX, z = Z0 + r * DZ;
      const colors = outfit(row.faction, () => ((r * 7 + 3) % 10) / 10);
      const c = row.faction === 'zombie' ? game.zombies.spawn(x, z, !!row.runner) : game.addChar({ x, z, faction: row.faction, weapon: row.weapon ?? null, colors, name: row.label, flag: 'US' });
      if (!c) continue;
      if (row.faction === 'zombie') { c.colors = colors; c.limp = 0; c.blood = 0; }
      Object.assign(c, { gait: true, x, z, face: Math.PI / 2, speed: row.speed, walk: (k / 8) * Math.PI * 2, crouch: !!row.crouch, aiming: false, handsUp: false, target: null });
      game.charR.paint(c);
      n++;
    }
  });
  if (!game.qol.photo) game.qol.togglePhoto(true);
  Object.assign(game.qol.photo, { x: X0 + 3.5 * DX, z: Z0 + 2 * DZ, h: 9, tilt: 1.45 });
  game.qol.placePhotoCamera();
  return { people: n, rows: ROWS.map((r) => r.label), note: 'each row is one stride, left to right' };
};

// The 160-person budget is usually full, and addChar then recycles the farthest idle drifter - which
// would be the strip's own first row. Free what the strip needs, farthest strangers first.
export function freeSlots(game, need) {
  const p = game.player, far = (c) => Math.hypot(c.x - p.x, c.z - p.z);
  const spare = game.chars.filter((c) => c !== p && !c.npc && !c.inVehicle && !c.booth && !c.gait).sort((a, b) => far(b) - far(a));
  while (game.freeSlots.length < need && spare.length) game.removeChar(spare.shift());
}
