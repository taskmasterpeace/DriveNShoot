#!/usr/bin/env node
// The shard's two-client proof (docs/design/WEB_SHARD.md §8). Self-contained: it starts a throwaway shard (its own data
// folder, never the dev accounts), two game harnesses (Vite + headless Chrome on :3270 and :3271), runs the checks, takes
// the screenshots, and stops exactly what it started.
//   node tools/shard-test.mjs [--shots docs/renders/web/shard] [--keep]
// Checks:
//   1. a person's path: on page A, the title's LOG IN, CREATE ACCOUNT, NEW CHARACTER (name + flag), the card -> in the world
//   2. page B the agent's way (shardLogin create=true, shardNewChar, shardEnter)
//   3. both walk (moveTo, held-key A* walking); each sees the other within 1 m of where that page has them
//   4. A logs out, the page is booted fresh, A logs back in: where they left, with the same pack and money
//   5. B breaks and boards a window; A sees it boarded live; the shard restarts (a graceful stop and start); both pages
//      come back on their own; a fresh page A logs in and the window is still boarded
import { mkdtempSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { ROOT, sleep, startShard, stopShard, startHarness, reloadPage, cdp, shardGet } from './shard-kit.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const SHOTS = join(ROOT, '..', arg('shots', 'docs/renders/web/shard'));
mkdirSync(SHOTS, { recursive: true });
const DATA = mkdtempSync(join(tmpdir(), 'dsoa-shard-test-'));
const results = [];
const check = (name, pass, detail) => { results.push({ name, pass: !!pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail !== undefined ? `  ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`); };
const rnd = () => randomBytes(15).toString('base64url');
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const shardLog = [];

let shard, A, B;
async function main() {
  console.log(`[test] shard data: ${DATA}`);
  shard = await startShard({ port: 3280, data: DATA, log: (l) => shardLog.push(l) });
  [A, B] = await Promise.all([startHarness(3270, { path: '/' }), startHarness(3271, { path: '/?agent=1' })]);
  const users = { a: { user: `test_a_${randomBytes(2).toString('hex')}`, pass: rnd() }, b: { user: `test_b_${randomBytes(2).toString('hex')}`, pass: rnd() } };

  // ---- 1. page A the way a person does it ------------------------------------------------------------------------
  const ca = await cdp(A);
  for (let i = 0; i < 40 && !(await ca.eval('!!document.querySelector(".title .sh-open")')); i++) await sleep(250);
  check('title shows LOG IN when a shard is up', await ca.eval('!!document.querySelector(".title .sh-open") && document.querySelector(".title .play").textContent === "PLAY OFFLINE"'));
  await ca.shot(join(SHOTS, '01-title-shard-online.png'));
  await ca.eval('document.querySelector(".title .sh-open").click(), true');
  await sleep(400);
  await ca.eval(`(() => { const f = document.querySelector('.sh-modal form'); f.user.value = ${JSON.stringify(users.a.user)}; f.pass.value = 'x'.repeat(14); return true; })()`);
  await ca.shot(join(SHOTS, '02-login-modal.png'));
  await ca.eval(`(() => { const f = document.querySelector('.sh-modal form'); f.pass.value = ${JSON.stringify(users.a.pass)}; f.querySelector('[data-act=create]').click(); return true; })()`);
  for (let i = 0; i < 40 && !(await ca.eval('!!document.querySelector(".sh-card.new")')); i++) await sleep(250);
  check('create account through the modal', await ca.eval('!!document.querySelector(".sh-card.new")'));
  await ca.eval('document.querySelector(".sh-card.new").click(), true');
  await sleep(300);
  await ca.eval(`(() => { const f = document.querySelector('.sh-modal form'); f.name.value = 'Alder'; document.querySelector('.sh-flag[data-code=MX]').click(); return true; })()`);
  await ca.shot(join(SHOTS, '03-new-character.png'));
  await ca.eval('document.querySelector(".sh-modal form").requestSubmit(), true');
  for (let i = 0; i < 40 && !(await ca.eval('document.querySelectorAll(".sh-card:not(.new)").length')); i++) await sleep(250);
  await ca.shot(join(SHOTS, '04-pick-character.png'));
  await ca.eval('document.querySelector(".sh-card:not(.new)").click(), true');
  for (let i = 0; i < 60 && (await A.call('shard')).state !== 'inworld'; i++) await sleep(250);
  const sa = await A.call('shard');
  check('A is in the world through the login screen', sa.state === 'inworld' && sa.char?.name === 'Alder', { state: sa.state, char: sa.char?.name });

  // ---- 2. page B the agent's way ----------------------------------------------------------------------------------------
  let r = await B.call('shardLogin', { user: users.b.user, pass: users.b.pass, create: true });
  check('B makes an account (shardLogin create=true)', r.ok, r.error);
  r = await B.call('shardNewChar', { name: 'Birch', flag: 'JP' });
  check('B makes a character', r.ok, r.error);
  r = await B.call('shardEnter', { char: 'Birch' });
  check('B enters and sees A already there', r.ok && r.players?.includes('Alder'), r.players ?? r.error);
  const wrong = await B.call('shardLogin', { user: users.a.user, pass: 'not the password at all' });
  check('a wrong password is refused', !wrong.ok && /wrong username or password/.test(wrong.error), wrong.error);
  await B.call('shardEnter', { char: 'Birch' }); // the failed login left B logged in as itself

  // ---- 3. both walk; each sees the other --------------------------------------------------------------------------------
  const [ma, mb] = await Promise.all([A.call('moveTo', { x: -8, z: -36, wait: true }), B.call('moveTo', { x: -13, z: -33, wait: true })]);
  check('both walked (moveTo)', ma.ok && mb.ok, { a: ma.arrived ?? ma.error, b: mb.arrived ?? mb.error });
  await Promise.all([A.call('step', { seconds: 1 }), B.call('step', { seconds: 1 })]);
  await sleep(500);
  await Promise.all([A.call('step', { seconds: 0.5 }), B.call('step', { seconds: 0.5 })]);
  const [stA, stB, whoA, whoB] = await Promise.all([A.call('state'), B.call('state'), A.call('shardWho'), B.call('shardWho')]);
  const bOnA = whoA.players?.find((p) => p.name === 'Birch'), aOnB = whoB.players?.find((p) => p.name === 'Alder');
  const dB = bOnA?.shown ? dist(bOnA.shown, stB.player) : Infinity, dA = aOnB?.shown ? dist(aOnB.shown, stA.player) : Infinity;
  check('A sees B within 1 m of where B is', dB < 1, { shown: bOnA?.shown, true: { x: stB.player.x, z: stB.player.z }, m: +dB.toFixed(3) });
  check('B sees A within 1 m of where A is', dA < 1, { shown: aOnB?.shown, true: { x: stA.player.x, z: stA.player.z }, m: +dA.toFixed(3) });
  const who = await shardGet('/who');
  check('the shard lists both online', who.online.length === 2, who.online.map((o) => `${o.name}(${o.flag})@${o.x},${o.z}`));
  // B draws a gun so the plate says so; then look at A's page with B in it (by day, close in).
  for (const h of [A, B]) { await h.call('setTime', { hour: 10.5 }); await h.call('zoom', { level: 'CLOSE' }); }
  await Promise.all([A.call('step', { seconds: 2 }), B.call('step', { seconds: 2 })]);
  await B.call('give', { weapon: 'shotgun' }); await B.call('equip', { weapon: 'shotgun' }); await B.call('aim', { x: -8, z: -36 }); await B.call('step', { seconds: 0.5 });
  await A.call('aim', { x: -13, z: -33 }); await A.call('step', { seconds: 0.5 });
  await sleep(600);
  await ca.shot(join(SHOTS, '05-two-players-from-alder.png'));
  const cb = await cdp(B);
  await cb.shot(join(SHOTS, '06-two-players-from-birch.png'));
  const tagA = await ca.eval('[...document.querySelectorAll(".sh-tag")].map((t) => t.textContent)');
  check('A draws a name plate for B', tagA?.some((t) => /birch/i.test(t)), tagA);

  // ---- 4. log out, fresh page, log back in: same place, same pack --------------------------------------------------
  await A.call('item', { give: 'jerky', n: 2 }); await A.call('item', { give: 'crowbar' }); await A.call('give', { cash: 37 });
  const before = await A.call('state'), invBefore = await A.call('inventory');
  const packBefore = invBefore.carried.items.map((i) => `${i.id}x${i.n ?? i.count ?? 1}`).sort();
  r = await A.call('shardLogout');
  check('A logs out (saved)', r.ok && r.left, r.error);
  await reloadPage(A);
  const fresh = await A.call('state');
  check('the fresh page is not where A was (it really is fresh)', dist(fresh.player, before.player) > 5, { fresh: { x: fresh.player.x, z: fresh.player.z } });
  r = await A.call('shardLogin', { user: users.a.user, pass: users.a.pass });
  check('A logs back in', r.ok, r.error);
  r = await A.call('shardEnter', { char: 'Alder' });
  const after = await A.call('state'), invAfter = await A.call('inventory');
  const packAfter = invAfter.carried.items.map((i) => `${i.id}x${i.n ?? i.count ?? 1}`).sort();
  check('A is where they left', dist(after.player, before.player) < 0.5, { before: { x: before.player.x, z: before.player.z }, after: { x: after.player.x, z: after.player.z } });
  check('A has the same pack', JSON.stringify(packAfter) === JSON.stringify(packBefore), { before: packBefore, after: packAfter });
  check('A has the same money', after.cash === before.cash, { before: before.cash, after: after.cash });
  await sleep(800); await B.call('step', { seconds: 0.5 });
  const whoB2 = await B.call('shardWho');
  check('B sees A again after A came back', !!whoB2.players?.find((p) => p.name === 'Alder' && p.shown));

  // ---- 6. a house claim everybody sees ------------------------------------------------------------------------------
  const blds = await A.call('query', { type: 'building', radius: 140, limit: 60 });
  const house = blds.items?.find((b) => b.enterable && !b.name && b.w > 8 && b.d > 8);
  await A.call('teleport', { x: house.x, z: house.z }); await A.call('step', { seconds: 0.5 });
  const claim = await A.call('shardClaim');
  check('A claims the house it stands in', claim.ok && claim.claim?.name === 'Alder', claim.error ?? claim.key);
  const ev0 = (await B.call('events', { type: 'toast' })).last;
  await B.call('teleport', { x: house.x, z: house.z }); await B.call('step', { seconds: 1.5 }); await sleep(300); await B.call('step', { seconds: 1.2 });
  const toasts = (await B.call('events', { since: ev0, type: 'toast' })).events.map((e) => e.text);
  check('B walking in is told whose place it is', toasts.some((t) => /ALDER'S PLACE/.test(t)), toasts.filter((t) => /PLACE|HOME/.test(t)));
  await Promise.all([A.call('teleport', { x: -8, z: -36 }), B.call('teleport', { x: -13, z: -33 })]);

  // ---- 7. the car you drive is yours: others see you in it, the town loses it, it waits where you parked it ----------
  const cars = await B.call('query', { type: 'vehicle', radius: 120, limit: 30 });
  const car = cars.items?.find((v) => /^v\d+$/.test(v.id) && !v.driver && ['interceptor', 'pickup', 'buggy'].includes(v.type));
  r = await B.call('enterVehicle', { id: car.id, force: true });
  await B.call('drive', { throttle: 0.5, seconds: 1.5 }); await B.call('drive', { throttle: -1, seconds: 1 }); await B.call('step', { seconds: 1.2 });
  await sleep(500); await A.call('step', { seconds: 0.5 });
  const seenCar = (await A.call('shardWho')).players.find((p) => p.name === 'Birch');
  check(`A sees B driving the ${car.type}`, seenCar?.shown?.vehicle === car.type, seenCar?.shown);
  const goneOnA = await A.call('exec', { code: `!game.vehicles.some((v) => v.id === ${JSON.stringify(car.id)})` });
  check('the town car B took is gone from A\'s town', goneOnA.value === true);
  await B.call('exitVehicle'); await B.call('step', { seconds: 1 });
  const parkedAt = (await B.call('exec', { code: 'game.shard.myCar && { id: game.shard.myCar.id, x: game.shard.myCar.x, z: game.shard.myCar.z }' })).value;
  await B.call('shardLogout'); await reloadPage(B);
  await B.call('shardLogin', { user: users.b.user, pass: users.b.pass }); r = await B.call('shardEnter', { char: 'Birch' });
  const carBack = (await B.call('exec', { code: 'game.shard.myCar && { id: game.shard.myCar.id, type: game.shard.myCar.type, x: game.shard.myCar.x, z: game.shard.myCar.z }' })).value;
  check('B\'s car is where B parked it after a fresh login', carBack && carBack.type === car.type && dist(carBack, parkedAt) < 1, { parkedAt, carBack });
  const seedOnB = await B.call('exec', { code: `!game.vehicles.some((v) => v.id === ${JSON.stringify(car.id)})` });
  check('and the town copy of it is not standing there twice', seedOnB.value === true);
  await B.call('teleport', { x: -13, z: -33 });

  // ---- 8. a named person killed for good stays dead for everyone -------------------------------------------------------
  const victim = (await A.call('exec', { code: 'const c = game.chars.find((c) => c.npc && !c.npc.essential && c.alive); game.combat.damage(c, 9999, game.player, 1, 0, "bullet"); return { id: c.npc.id, name: c.npc.name };' })).value;
  await A.call('step', { seconds: 1.2 }); await sleep(500); await B.call('step', { seconds: 0.3 });
  const deadOnB = await B.call('exec', { code: `!game.chars.find((c) => c.npc?.id === ${JSON.stringify(victim.id)}).alive` });
  check(`A kills ${victim.name}; B's copy of them is dead too`, deadOnB.value === true);
  const deeds = (await B.call('shardWorld')).chronicle.filter((d) => d.verb === 'kill' && d.name === 'Alder');
  check('the deed is on the shard\'s chronicle', deeds.length > 0, deeds.slice(-1));

  // ---- 5. a boarded window outlives the shard -----------------------------------------------------------------------
  const wins = await B.call('windows', { radius: 60, state: 'intact', limit: 5 });
  const win = wins.items?.[0];
  check('B finds an intact window near it', !!win, wins.error);
  await B.call('window', { id: win.id, action: 'break' });
  const boarded = await B.call('window', { id: win.id, action: 'board', force: true });
  check('B breaks and boards it', boarded.state === 'boarded', boarded.state);
  await B.call('step', { seconds: 1.5 }); await sleep(600); await A.call('step', { seconds: 0.3 });
  const onA = await A.call('window', { id: win.id });
  check('A sees the window boarded, live', onA.state === 'boarded', onA.state);
  await stopShard(shard.child);
  const saved = JSON.parse(readFileSync(join(DATA, 'world.json'), 'utf8'));
  check('the shard wrote the window to world.json on the way down', saved.interiors.w[win.id]?.s === 'boarded', saved.interiors.w[win.id]);
  shard = await startShard({ port: 3280, data: DATA, log: (l) => shardLog.push(l) });
  let back = 0;
  for (let i = 0; i < 40; i++) {
    const [x, y] = await Promise.all([A.call('shard'), B.call('shard')]);
    back = (x.state === 'inworld' && x.stats.reconnects > 0 ? 1 : 0) + (y.state === 'inworld' && y.stats.reconnects > 0 ? 1 : 0);
    if (back === 2) break;
    await sleep(500);
  }
  check('both pages come back on their own after the restart', back === 2, back);
  await reloadPage(A);
  const local = await A.call('window', { id: win.id });
  check('a fresh page has the window intact before logging in', local.state === 'intact', local.state);
  await A.call('shardLogin', { user: users.a.user, pass: users.a.pass });
  await A.call('shardEnter', { char: 'Alder' });
  const again = await A.call('window', { id: win.id });
  check('after the restart, logging in shows it boarded', again.state === 'boarded', again.state);
  const afterRestart = (await A.call('exec', { code: `({ dead: !game.chars.find((c) => c.npc?.id === ${JSON.stringify(victim.id)}).alive, claims: Object.values(game.shard.claims).map((c) => c.name) })` })).value;
  check('and the named dead and the claim came back with it', afterRestart.dead && afterRestart.claims.includes('Alder'), afterRestart);
  await sleep(800); await A.call('step', { seconds: 0.5 }); await B.call('step', { seconds: 0.5 });
  const whoEnd = await A.call('shardWho');
  check('they still see each other after the restart', !!whoEnd.players?.find((p) => p.name === 'Birch' && p.shown));
}

main().catch((e) => check('the test ran to the end', false, String(e.stack ?? e))).finally(async () => {
  const passed = results.filter((x) => x.pass).length;
  console.log(`\n${passed}/${results.length} passed`);
  console.log(`[test] screenshots in ${SHOTS}`);
  if (results.some((x) => !x.pass)) console.log(`[test] shard log tail:\n  ${shardLog.slice(-25).join('\n  ')}`);
  if (!process.argv.includes('--keep')) { A?.stop(); B?.stop(); if (shard) await stopShard(shard.child); }
  process.exit(passed === results.length ? 0 : 1);
});
