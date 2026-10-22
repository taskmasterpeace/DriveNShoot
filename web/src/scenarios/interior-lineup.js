// The interiors photo booth: the Mechanic's in Rust Haven dressed in every door and window state, so a
// change to doors, locks, glass or boards can be judged by eye. A shut double front door with one leaf
// flung wide, a padlocked inner door, glass intact, cracked and shot out, boards nailed up from inside
// and from outside, and a drifter flat on the floor from a door to the face. Frozen in photo mode so the
// shot holds still; re-running re-dresses it.
//   node tools/dl.mjs scenario name=interior-lineup
//   node tools/dl.mjs screenshot --out interiors.jpg            (photo mode frames it from above)
//   node tools/dl.mjs screenshot tilt=0.7 zoom=22 --out walls.jpg   (from an angle: the wall faces)
//   node tools/dl.mjs photo on=false                             (let the world run again)
export default async (DL, game) => {
  const I = game.interiors;
  const bi = game.world.buildings.findIndex((b) => b.shopName?.startsWith('Mechanic'));
  const b = game.world.buildings[bi];
  const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
  if (game.qol.photo) game.qol.togglePhoto(false);
  await DL.setTime({ hour: 12 });
  await DL.setWeather({ key: 'CLEAR', instant: true });
  for (const c of [...game.chars]) if (c !== game.player && !c.npc && (c.booth || (c.x > b.minX && c.x < b.maxX && c.z > b.minZ && c.z < b.maxZ))) game.removeChar(c);
  await DL.teleport({ x: cx + 2.5, z: cz + 4 }); // inside, so the roof lifts away

  const doors = I.doors.filter((d) => d.bi === bi), wins = I.windows.filter((w) => w.bi === bi);
  const front = doors.find((d) => d.kind === 'front'), inner = doors.find((d) => d.kind === 'inner');
  await DL.door({ id: front.id, action: 'close' });
  const leaf = front.leaves[1];
  leaf.th = 1.35; I.orient(leaf); I.flush();
  if (inner) await DL.door({ id: inner.id, action: 'lock' });

  // Round the walls: intact, cracked, shot out, boarded from inside, boarded from outside, and again.
  const looks = ['intact', 'cracked', 'shattered', 'boardedIn', 'boardedOut'];
  const dressed = wins.map((w, k) => {
    const look = looks[k % looks.length];
    w.state = 'intact'; w.hp = 40; w.boardHp = 0; I.syncGlass(w); I.syncBoards(w);
    if (look === 'cracked') I.damageGlass(w, 26, w.nx, w.nz, null);
    if (look === 'shattered' || look.startsWith('boarded')) I.shatter(w, -w.nx, -w.nz, null);
    if (look === 'boardedIn') I.board(w, -1);
    if (look === 'boardedOut') I.board(w, 1);
    return { id: w.id, look };
  });

  // Someone who stood behind the inner door when it was kicked open.
  const c = game.addChar({ x: inner ? inner.x + 1.6 : cx, z: inner ? inner.z + 1.2 : cz, faction: 'drifter', weapon: 'pistol', colors: { skin: '#a86b45', hair: '#2a1a12', shirt: '#7a3e2a', pants: '#3b3a36', hatStyle: 'cap', hat: '#5a3f24' }, name: 'Doored', flag: 'MX' });
  c.booth = true; c.face = -Math.PI / 2;
  I.knockDown(c, 999); c.knockT = 990;

  await DL.step({ seconds: 0.1 });
  if (!game.qol.photo) game.qol.togglePhoto(true);
  Object.assign(game.qol.photo, { x: cx, z: cz, h: 30, tilt: 0.14 });
  game.qol.placePhotoCamera();
  return { building: b.shopName, doors: doors.map((d) => ({ id: d.id, kind: d.kind, locked: d.locked })), windows: dressed, look: { x: +cx.toFixed(1), z: +cz.toFixed(1), zoom: 30 } };
};
