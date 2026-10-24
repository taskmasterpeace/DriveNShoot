// The one-thumb PACK (docs/INVENTORY-STUDY.md §8), proven the way a thumb arrives: DOM clicks on the screen's own rows
// and buttons, never the agent's item commands.
//   node tools/dl.mjs scenario name=pack-thumb        -> { ok, checks: { ... } }; every check true on a pass
// It checks six things:
//   1. A tap on a row picks it, and a tap on the row you just picked moves it.
//   2. A lit row (lit at open, or by the arrow keys) is not "picked": one tap on it moves nothing.
//   3. A desktop double-click (click, click, dblclick) moves one row once, never twice.
//   4. TAKE ALL empties a body into your pack.
//   5. With your pack nearly full, TAKE ALL stops at full and says what is left.
//   6. At a trader's counter and on a shelf nobody minds, TAKE ALL is hidden and R refuses: nothing moves, nothing is
//      stolen.
// CLOSE shuts the screen.
export default async function packThumb(DL, g) {
  const C = (cmd, a) => DL.call(cmd, a);
  await C('start');
  await C('setWeather', { key: 'CLEAR', instant: true });
  await C('setTime', { hour: 10 });
  await C('teleport', { x: 236, z: -110 });
  const inv = g.inventory, ui = g.invUI, P = g.player, checks = {}, notes = {};
  const tap = (el, type = 'click') => el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
  const row = (side, i) => ui.el.lists[side].querySelector(`li[data-i="${i}"]`);
  const rowOf = (side, id) => { const k = ui.box(side).slots.findIndex((s) => s.id === id); return k < 0 ? null : row(side, ui.guns(side).length + k); };
  const n = (box, id) => box.slots.filter((s) => s.id === id).reduce((a, s) => a + s.n, 0);
  const things = (box) => box.slots.reduce((a, s) => a + s.n, 0);
  inv.carried.slots.length = 0; inv.changed?.();
  await C('give', { weapon: 'pistol' }); // a slung gun: row 0 of ON YOU, the row lit when the screen opens

  // Somebody dead at your feet; their pockets set to known things.
  const c = g.addChar({ x: P.x + 1.2, z: P.z, faction: 'raider', name: 'Dustwolf Scav (pack-thumb)', flag: 'US', weapon: null });
  await C('kill', { id: c.id });
  await C('step', { seconds: 0.3 });
  const body = inv.boxes.get(`body:${c.id}`) ?? inv.nearest(P.x, P.z, 2.6, true);
  inv.open(body); body.slots.length = 0;
  inv.add(body, 'bandage', 2); inv.add(body, 'jerky', 3); inv.add(body, 'beans_tin', 1);
  await C('pack', { on: true });
  notes.other = ui.other?.id;
  checks.bodyIsTheOtherSide = ui.other === body;

  // 1. tap picks, tap again moves
  tap(rowOf(1, 'bandage'));
  const afterOne = n(body, 'bandage');
  tap(rowOf(1, 'bandage'));
  checks.tapPicksTapAgainMoves = afterOne === 2 && n(body, 'bandage') === 0 && n(inv.carried, 'bandage') === 2;

  // 2. the row lit at open is not picked: one tap moves nothing
  ui.toggle(false); inv.open(body); ui.toggle(true);
  // (the gun in hand is lit at open; and a row lit by the arrow keys is not picked either: its one tap moves nothing)
  const gunsBefore = g.inv.weapons.length, ground0 = things(inv.groundAt(P.x, P.z));
  tap(row(0, 0));
  const lit = rowOf(0, 'bandage'); ui.sel[0] = +lit.dataset.i; ui.render(); // ArrowDown to the bandages
  tap(rowOf(0, 'bandage'));
  checks.litRowNeedsItsOwnTap = g.inv.weapons.length === gunsBefore && things(body) === 4 && n(inv.carried, 'bandage') === 2 && things(inv.groundAt(P.x, P.z)) === ground0;

  // 3. a double-click moves one row once
  const jerky0 = n(body, 'jerky'), beans0 = n(body, 'beans_tin');
  tap(rowOf(1, 'jerky')); tap(rowOf(1, 'jerky') ?? row(1, 0)); tap(ui.el.lists[1].querySelector('li[data-i]') ?? ui.el.lists[1], 'dblclick');
  checks.doubleClickMovesOnce = jerky0 === 3 && n(body, 'jerky') === 0 && n(inv.carried, 'jerky') === 3 && n(body, 'beans_tin') === beans0 && beans0 === 1;

  // 4. TAKE ALL empties the body
  inv.add(body, 'bandage', 1); inv.add(body, 'jerky', 2); ui.render();
  const shown = !ui.el.takeAll.classList.contains('hidden');
  const before = things(inv.carried);
  tap(ui.el.takeAll);
  checks.takeAllEmptiesTheBody = shown && body.slots.length === 0 && things(inv.carried) === before + 4 && /ALL OF IT/.test(ui.el.say.textContent);
  checks.takeAllHiddenOnAnEmptyBody = ui.el.takeAll.classList.contains('hidden');

  // 5. a nearly full pack: TAKE ALL stops at full and says what is left
  const room = Math.floor(inv.room(inv.carried) + 1e-6); // scrap is 1 L a piece
  inv.add(body, 'scrap', Math.min(20, room + 5)); ui.render();
  const scrap0 = n(body, 'scrap');
  tap(ui.el.takeAll);
  notes.room = room; notes.scrap0 = scrap0; notes.say5 = ui.el.say.textContent;
  checks.takeAllStopsAtFull = scrap0 > room && n(inv.carried, 'scrap') === room && n(body, 'scrap') === scrap0 - room && /NO ROOM FOR/.test(ui.el.say.textContent) && ui.el.say.classList.contains('bad');

  // 6. somebody's shelf, two ways: a trader's counter (that would be buying it all) and a shelf with nobody minding it
  // (stealing it all). Both: TAKE ALL hidden, R refuses, nothing moves, nothing stolen.
  const seq0 = g.eventSeq, stolen = () => g.events.filter((e) => e.seq > seq0 && e.type === 'stole').length;
  const owned = [...inv.boxes.values()].filter((b) => b.owner && b.kind !== 'trunk' && b.kind !== 'ground' && !b.id.startsWith('body:'));
  const refuses = async (shelf, tag, wantCounter) => {
    ui.toggle(false); inv.carried.slots.length = 0; inv.changed?.();
    if (!shelf) { notes[tag] = 'none found'; return false; }
    await C('teleport', { x: shelf.x + 0.6, z: shelf.z });
    inv.open(shelf); if (!shelf.slots.length) inv.add(shelf, 'bandage', 2);
    ui.toggle(true);
    const counter = !!g.trade?.at(shelf), slots0 = JSON.stringify(shelf.slots), hidden = ui.el.takeAll.classList.contains('hidden');
    ui.input({ hit: (k) => k === 'KeyR' }); // R, as the keyboard sends it
    notes[tag] = { shelf: shelf.id, counter, say: ui.el.say.textContent };
    return counter === wantCounter && ui.other === shelf && hidden && JSON.stringify(shelf.slots) === slots0 && things(inv.carried) === 0 && stolen() === 0 && ui.el.say.classList.contains('bad');
  };
  // a shop shelf whose keeper is in: with you beside it, it is their counter
  const shop = owned.find((b) => g.chars.some((ch) => ch.id === b.owner && ch.alive && ch.npc));
  checks.counterRefusesTakeAll = await refuses(shop, 'counter', true);
  // the same shelf with its keeper out of the shop (put back after): taking is stealing
  const keeper = shop && g.chars.find((ch) => ch.id === shop.owner), home = keeper && { x: keeper.x, z: keeper.z };
  if (keeper) { keeper.x += 60; keeper.z += 60; }
  checks.unmindedShelfRefusesTakeAll = await refuses(shop, 'unminded', false);
  if (home) { keeper.x = home.x; keeper.z = home.z; }

  // CLOSE shuts the screen
  tap(ui.el.close);
  checks.closeButtonShutsThePack = ui.open === false;

  return { ok: Object.values(checks).every(Boolean), checks, notes };
}
