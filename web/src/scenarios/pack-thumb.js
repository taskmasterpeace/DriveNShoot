// The one-thumb PACK (docs/INVENTORY-STUDY.md §8), proven the way a thumb arrives: DOM clicks on the screen's own rows
// and buttons and real key presses, never the agent's item commands.
//   node tools/dl.mjs scenario name=pack-thumb        -> { ok, checks: { ... } }; every check true on a pass
// It checks:
//   1. A tap on a row picks it, and a tap on the row you just picked moves it.
//   2. A lit row (lit at open, or lit with the real arrow keys) is not "picked": one tap on it moves nothing.
//   3. A desktop double-click (click, click, dblclick) moves one row once, never twice.
//   4. The pick is used up by an action: after the MOVE button (and after E), one tap on the thing that slid into
//      that row moves nothing; at a counter, that one tap buys nothing. After CLOSE and reopening, and after the other
//      side switches to another box (walking off), one tap moves nothing, on either side. Taking gear off also spends
//      a pick on the item list.
//   5. TAKE ALL empties a body, and an unowned crate, into your pack (and uses the pick up: one tap after it moves nothing).
//   6. With your pack nearly full, TAKE ALL stops at full and says exactly what is left ("NO ROOM FOR N MORE").
//   7. At a trader's counter and on a shelf nobody minds, TAKE ALL is hidden and R refuses: nothing moves, nothing is
//      stolen.
//   8. CLOSE shuts the screen.
//   9. Sizes: on a touch screen (pointer: coarse) every row, chip and button is a thumb's size (rows, chips, TAKE ALL
//      and CLOSE 44 px, action buttons 48 px); with a mouse, TAKE ALL and CLOSE are not drawn at all (the desktop
//      layout is as it was).
export default async function packThumb(DL, g) {
  const C = (cmd, a) => DL.call(cmd, a);
  await C('start');
  await C('setWeather', { key: 'CLEAR', instant: true });
  await C('setTime', { hour: 10 });
  await C('teleport', { x: 236, z: -110 });
  const inv = g.inventory, ui = g.invUI, P = g.player, checks = {}, notes = {};
  const missing = []; // a row or button that was not there to tap (a check that needs it then fails on its own state)
  const tap = (el, type = 'click') => { if (!el) { missing.push(new Error().stack.split('\n')[2]?.trim().replace(/^.*:(\d+):\d+\)?$/, 'line $1')); return; } el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window })); };
  const key = async (code) => { // a real key: down, one game frame, up (main.js hands it to the PACK while it is open)
    dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true })); await C('step', { seconds: 0.05 });
    dispatchEvent(new KeyboardEvent('keyup', { code, key: code, bubbles: true })); await C('step', { seconds: 0.05 });
  };
  const row = (side, i) => ui.el.lists[side].querySelector(`li[data-i="${i}"]`);
  const rowOf = (side, id) => { const k = ui.box(side).slots.findIndex((s) => s.id === id); return k < 0 ? null : row(side, ui.guns(side).length + k); };
  const moveBtn = () => ui.el.acts.querySelector('button[data-a="move"]');
  const n = (box, id) => box.slots.filter((s) => s.id === id).reduce((a, s) => a + s.n, 0);
  const things = (box) => box.slots.reduce((a, s) => a + s.n, 0);
  const snap = (box) => JSON.stringify(box.slots.map((s) => [s.id, s.n]));
  const empty = () => { inv.carried.slots.length = 0; inv.changed?.(); };
  empty();
  await C('give', { weapon: 'pistol' }); // a gun on you: row 0 of ON YOU, the row lit when the screen opens

  // Somebody dead at your feet; their pockets set to known things.
  const c = g.addChar({ x: P.x + 1.2, z: P.z, faction: 'raider', name: 'Dustwolf Scav (pack-thumb)', flag: 'US', weapon: null });
  await C('kill', { id: c.id });
  await C('step', { seconds: 0.3 });
  const body = inv.boxes.get(`body:${c.id}`) ?? inv.nearest(P.x, P.z, 2.6, true);
  const fill = () => { body.slots.length = 0; inv.add(body, 'bandage', 2); inv.add(body, 'jerky', 3); inv.add(body, 'beans_tin', 1); };
  const reopen = () => { ui.toggle(false); inv.open(body); ui.toggle(true); };
  inv.open(body); fill();
  await C('pack', { on: true });
  notes.other = ui.other?.id;
  checks.bodyIsTheOtherSide = ui.other === body;

  // 1. tap picks, tap again moves
  tap(rowOf(1, 'bandage'));
  const afterOne = n(body, 'bandage');
  tap(rowOf(1, 'bandage'));
  checks.tapPicksTapAgainMoves = afterOne === 2 && n(body, 'bandage') === 0 && n(inv.carried, 'bandage') === 2;

  // 2. a lit row is not picked: the gun lit at open, then the bandages lit with the real arrow keys
  reopen();
  const gunsBefore = g.inv.weapons.length, ground0 = things(inv.groundAt(P.x, P.z));
  tap(row(0, 0)); // the gun in hand: picked now, but not moved
  const want = +rowOf(0, 'bandage').dataset.i;
  for (let k = 0; k < want; k++) await key('ArrowDown');
  notes.arrowLit = ui.sel[0] === want && ui.side === 0;
  tap(rowOf(0, 'bandage'));
  checks.litRowNeedsItsOwnTap = notes.arrowLit && g.inv.weapons.length === gunsBefore && things(body) === 4 && n(inv.carried, 'bandage') === 2 && things(inv.groundAt(P.x, P.z)) === ground0;
  // that tap picked the bandages; the arrow keys move the light off and back: the pick is gone, one tap moves nothing
  await key('ArrowDown'); await key('ArrowUp');
  tap(rowOf(0, 'bandage'));
  checks.arrowKeysDropThePick = ui.sel[0] === want && n(inv.carried, 'bandage') === 2 && things(body) === 4 && things(inv.groundAt(P.x, P.z)) === ground0;

  // 3. a double-click moves one row once
  const jerky0 = n(body, 'jerky'), beans0 = n(body, 'beans_tin');
  tap(rowOf(1, 'jerky')); tap(rowOf(1, 'jerky') ?? row(1, 0)); tap(ui.el.lists[1].querySelector('li[data-i]') ?? ui.el.lists[1], 'dblclick');
  checks.doubleClickMovesOnce = jerky0 === 3 && n(body, 'jerky') === 0 && n(inv.carried, 'jerky') === 3 && n(body, 'beans_tin') === beans0 && beans0 === 1;

  // 4. the pick is used up: after the MOVE button, after E, after CLOSE + reopen, after the other side changes
  empty(); fill(); reopen();
  tap(row(1, 0)); tap(moveBtn()); // bandages taken with the button; the jerky slides up into row 0
  let s0 = snap(body); tap(row(1, 0)); // (that tap picked the jerky)
  checks.oneTapAfterMoveButtonMovesNothing = n(inv.carried, 'bandage') === 2 && snap(body) === s0 && n(body, 'jerky') === 3;
  tap(ui.el.acts.querySelector('button[data-a="use"]')); // USE on the picked jerky: one comes to your hands and is eaten
  ui.side = 1; ui.render(); s0 = snap(body);
  tap(row(1, 0));
  checks.oneTapAfterUseMovesNothing = snap(body) === s0;
  empty(); fill(); reopen();
  tap(row(1, 0)); tap(ui.el.close); reopen(); s0 = snap(body); tap(row(1, 0)); // a pick on their side
  inv.add(inv.carried, 'scrap', 1); ui.render(); tap(rowOf(0, 'scrap')); tap(ui.el.close); reopen(); tap(rowOf(0, 'scrap')); // and on yours
  checks.oneTapAfterCloseAndReopenMovesNothing = ui.open && snap(body) === s0 && n(inv.carried, 'scrap') === 1 && things(inv.carried) === 1;

  // Taking gear off is an action too: it must use up a pick on the item list.
  empty(); fill(); reopen();
  await C('gear', { give: 'soft_vest' }); await C('gear', { wear: 'soft_vest' }); ui.render();
  tap(rowOf(1, 'bandage'));
  tap(ui.el.doll.querySelector('[data-slot="chest"]'));
  const vestOff = !g.gear.worn.chest;
  s0 = snap(body); tap(rowOf(1, 'bandage'));
  checks.oneTapAfterTakingGearOffMovesNothing = vestOff && n(inv.carried, 'soft_vest') === 1 && snap(body) === s0 && n(body, 'bandage') === 2;

  // 5. TAKE ALL empties the body ...
  empty(); fill(); reopen();
  const shown = !ui.el.takeAll.classList.contains('hidden'), before = things(inv.carried);
  const guns5 = g.inv.weapons.length; tap(row(0, 0)); // pick the gun in hand first: TAKE ALL uses the pick up too
  tap(ui.el.takeAll);
  tap(row(0, 0));
  checks.oneTapAfterTakeAllMovesNothing = g.inv.weapons.length === guns5 && guns5 > 0 && body.slots.length === 0;
  checks.takeAllEmptiesTheBody = shown && body.slots.length === 0 && things(inv.carried) === before + 6 && ui.el.say.textContent === 'TOOK 6 · ALL OF IT';
  checks.takeAllHiddenOnAnEmptyBody = ui.el.takeAll.classList.contains('hidden');

  // 6. a nearly full pack: TAKE ALL stops at full and says exactly what is left
  empty(); ui.render();
  const room = Math.floor(inv.room(inv.carried) + 1e-6); // scrap is 1 L a piece
  inv.add(body, 'scrap', Math.min(20, room + 5)); ui.render();
  const scrap0 = n(body, 'scrap');
  tap(ui.el.takeAll);
  notes.room = room; notes.scrap0 = scrap0; notes.say6 = ui.el.say.textContent;
  checks.takeAllStopsAtFull = scrap0 > room && n(inv.carried, 'scrap') === room && n(body, 'scrap') === scrap0 - room
    && ui.el.say.textContent === `TOOK ${room} · NO ROOM FOR ${scrap0 - room} MORE` && ui.el.say.classList.contains('bad');

  // 4 (cont.) and 5 (cont.): an unowned crate. Pick a row on the body, walk to the crate (update() switches the other
  // side to it), one tap on the same row moves nothing; then TAKE ALL empties the crate.
  empty(); fill(); reopen();
  const crate = [...inv.boxes.values()].find((b) => !b.owner && b.kind !== 'ground' && b.kind !== 'trunk' && b.kind !== 'person' && !b.id.startsWith('body:') && Math.abs(b.y ?? 0) < 1 && !g.residents?.ownerOf?.(b));
  notes.crate = crate?.id ?? 'none found';
  if (crate) {
    tap(row(1, 0));
    await C('teleport', { x: crate.x + 0.6, z: crate.z });
    inv.opened = null; ui.update(0.016); // walked off the body: the PACK re-picks what is here
    crate.slots.length = 0; inv.add(crate, 'bandage', 2); inv.add(crate, 'jerky', 1); ui.render();
    notes.crateOther = ui.other?.id;
    s0 = snap(crate); tap(row(1, 0));
    checks.oneTapAfterTheOtherSideChangesMovesNothing = ui.other === crate && snap(crate) === s0 && things(inv.carried) === 0;
    const seq0 = g.eventSeq, crateShown = !ui.el.takeAll.classList.contains('hidden');
    tap(ui.el.takeAll);
    checks.takeAllEmptiesAnUnownedCrate = crateShown && crate.slots.length === 0 && n(inv.carried, 'bandage') === 2 && n(inv.carried, 'jerky') === 1
      && ui.el.say.textContent === 'TOOK 3 · ALL OF IT' && !g.events.some((e) => e.seq > seq0 && e.type === 'stole');

    // A pick on your side is also spent when the destination changes. The item itself stays on you, so checking only
    // its box and identity cannot notice that the next tap would now put it somewhere else.
    await C('teleport', { x: body.x, z: body.z });
    empty(); fill(); reopen(); inv.add(inv.carried, 'scrap', 1); ui.render();
    tap(rowOf(0, 'scrap'));
    await C('teleport', { x: crate.x + 0.6, z: crate.z });
    inv.opened = null; ui.update(0.016);
    s0 = snap(inv.carried); tap(rowOf(0, 'scrap'));
    checks.oneTapOnYourSideAfterTheOtherSideChangesMovesNothing = ui.other === crate && snap(inv.carried) === s0 && n(inv.carried, 'scrap') === 1;
  } else { checks.oneTapAfterTheOtherSideChangesMovesNothing = false; checks.takeAllEmptiesAnUnownedCrate = false; checks.oneTapOnYourSideAfterTheOtherSideChangesMovesNothing = false; }

  // 7. somebody's shelf, two ways: a trader's counter (that would be buying it all) and a shelf with nobody minding it
  // (stealing it all). Both: TAKE ALL hidden, R refuses, nothing moves, nothing stolen. And at the counter, one tap
  // after the BUY button buys nothing more.
  const seq0 = g.eventSeq, stolen = () => g.events.filter((e) => e.seq > seq0 && e.type === 'stole').length;
  const owned = [...inv.boxes.values()].filter((b) => b.owner && b.kind !== 'trunk' && b.kind !== 'ground' && !b.id.startsWith('body:'));
  const shop = owned.find((b) => g.chars.some((ch) => ch.id === b.owner && ch.alive && ch.npc));
  const atShelf = async (shelf) => { ui.toggle(false); empty(); await C('teleport', { x: shelf.x + 0.6, z: shelf.z }); inv.open(shelf); if (!shelf.slots.length) inv.add(shelf, 'bandage', 2); ui.toggle(true); };
  const refuses = async (shelf, tag, wantCounter) => {
    if (!shelf) { notes[tag] = 'none found'; return false; }
    await atShelf(shelf);
    const counter = !!g.trade?.at(shelf), slots0 = JSON.stringify(shelf.slots), hidden = ui.el.takeAll.classList.contains('hidden');
    await key('KeyR');
    notes[tag] = { shelf: shelf.id, counter, say: ui.el.say.textContent };
    return counter === wantCounter && ui.other === shelf && hidden && JSON.stringify(shelf.slots) === slots0 && things(inv.carried) === 0 && stolen() === 0 && ui.el.say.classList.contains('bad');
  };
  // a shop shelf whose keeper is in: with you beside it, it is their counter
  checks.counterRefusesTakeAll = await refuses(shop, 'counter', true);
  if (shop) {
    await atShelf(shop);
    shop.slots.length = 0; inv.add(shop, 'bandage', 1); inv.add(shop, 'jerky', 1); inv.add(shop, 'beans_tin', 1); ui.render();
    g.cash = 500;
    tap(row(1, 0)); tap(moveBtn()); // BUY the first thing with the button
    const cash1 = g.cash, s1 = snap(shop);
    tap(row(1, 0)); // one tap on what slid up
    notes.buy = { cash0: 500, cash1, cash2: g.cash };
    checks.oneTapAfterBuyButtonBuysNothing = cash1 < 500 && g.cash === cash1 && snap(shop) === s1;
  } else checks.oneTapAfterBuyButtonBuysNothing = false;
  // the same shelf with its keeper out of the shop (put back after): taking is stealing
  const keeper = shop && g.chars.find((ch) => ch.id === shop.owner), home = keeper && { x: keeper.x, z: keeper.z };
  if (keeper) { keeper.x += 60; keeper.z += 60; }
  checks.unmindedShelfRefusesTakeAll = await refuses(shop, 'unminded', false);
  if (home) { keeper.x = home.x; keeper.z = home.z; }

  // 9. sizes (before CLOSE, with the screen up)
  const coarse = matchMedia('(pointer: coarse)').matches, H = (el) => el.getBoundingClientRect().height, W = (el) => el.getBoundingClientRect().width;
  const drawn = (el) => getComputedStyle(el).display !== 'none';
  ui.toggle(false); empty(); fill(); await C('teleport', { x: body.x, z: body.z }); inv.open(body); ui.toggle(true);
  if (coarse) {
    const rows = [...ui.el.menu.querySelectorAll('.inv-list li[data-i]')], chips = [...ui.el.doll.querySelectorAll('.doll-slot')];
    const acts = [...ui.el.acts.querySelectorAll('button')].filter(drawn);
    notes.sizes = { mode: 'touch', rows: rows.length, rowMin: Math.min(...rows.map(H)), chips: chips.length, chipMin: Math.min(...chips.map(H)), chipMinW: Math.min(...chips.map(W)),
      takeAll: [W(ui.el.takeAll), H(ui.el.takeAll)], close: [W(ui.el.close), H(ui.el.close)], actMin: Math.min(...acts.map(H)) };
    const S = notes.sizes;
    checks.sizes = rows.length >= 4 && S.rowMin >= 44 && chips.length > 0 && S.chipMin >= 44 && S.chipMinW >= 44 && Math.min(...S.takeAll) >= 44 && Math.min(...S.close) >= 44 && acts.length > 0 && S.actMin >= 48;
  } else {
    notes.sizes = { mode: 'mouse', takeAllDrawn: drawn(ui.el.takeAll), closeDrawn: drawn(ui.el.close), colheadDisplay: getComputedStyle(ui.el.menu.querySelector('.inv-colhead')).display };
    checks.sizes = !notes.sizes.takeAllDrawn && !notes.sizes.closeDrawn && notes.sizes.colheadDisplay === 'contents';
  }
  checks.packOpenFlag = document.body.classList.contains('pack-open');

  // 8. CLOSE shuts the screen (a DOM click works on it with a mouse too, where it is not drawn)
  tap(ui.el.close);
  checks.closeButtonShutsThePack = ui.open === false && !document.body.classList.contains('pack-open');

  checks.everyTapHadItsTarget = !missing.length; if (missing.length) notes.missing = missing;
  return { ok: Object.values(checks).every(Boolean), checks, notes };
}
