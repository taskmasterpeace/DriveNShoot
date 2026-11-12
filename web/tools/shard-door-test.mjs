#!/usr/bin/env node
// THE SHUT DOOR between two players (docs/design/WEB_DOOR_POUND.md §3.6): a real shard and two game pages. Page B pulls a
// door shut and something beats on it; page A must see it shut, as hurt, hear the blows, and see it off its hinges when
// it goes; the shard must keep it. `node tools/shard-door-test.mjs` (ports 3280, 3272, 3273). Exit 0 = all passed.
// Its own small tool so it runs whatever state the long two-client proof (tools/shard-test.mjs) is in.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { sleep, startShard, stopShard, startHarness, shardGet } from './shard-kit.mjs';

const DATA = mkdtempSync(join(tmpdir(), 'dsoa-shard-door-'));
const results = [];
const check = (name, pass, detail) => { results.push({ name, pass: !!pass }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail !== undefined ? `  ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`); };
const rnd = () => randomBytes(15).toString('base64url');
let shard, A, B;

async function main() {
  shard = await startShard({ port: 3280, data: DATA, log: () => {} });
  [A, B] = await Promise.all([startHarness(3272, { path: '/?agent=1' }), startHarness(3273, { path: '/?agent=1' })]);
  for (const [P, name, flag] of [[A, 'Alder', 'MX'], [B, 'Birch', 'JP']]) {
    const user = `door_${name.toLowerCase()}_${randomBytes(2).toString('hex')}`;
    let r = await P.call('shardLogin', { user, pass: rnd(), create: true });
    if (r.ok) r = await P.call('shardNewChar', { name, flag });
    if (r.ok) r = await P.call('shardEnter', { char: name });
    check(`${name} is in the world`, r.ok, r.error);
  }
  await Promise.all([A.call('teleport', { x: -8, z: -36 }), B.call('teleport', { x: -13, z: -33 })]);
  await Promise.all([A.call('step', { seconds: 1 }), B.call('step', { seconds: 1 })]);
  const id = (await B.call('exec', { code: 'const I = game.interiors, p = game.player; const d = I.doors.filter((d) => !d.locked && !d.broken && !d.ug && !d.ring && d.material === "wood" && d.leaves.length === 1).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0]; return d.id;' })).value;
  const Q = JSON.stringify(id);
  const openIt = `const I = game.interiors, d = I.byId.get(${Q}); for (const L of d.leaves) { L.th = 1.3; L.w = 0; I.orient(L); } I.flush(); return I.isShut(d);`;
  const [oa, ob] = await Promise.all([A.call('exec', { code: openIt }), B.call('exec', { code: openIt })]);
  check(`door ${id} stands open on both pages`, oa.value === false && ob.value === false, { a: oa.value, b: ob.value });
  const evA = (await A.call('events', {})).last;
  const hit = (await B.call('exec', { code: `const I = game.interiors, d = I.byId.get(${Q}); const r = I.shutDoor(d, game.player); I.pound(d, null, 40, 'frenzy'); const H = I.doorHp(d); return { ok: r.ok, hp: H.hp, max: H.max };` })).value;
  check('B pulls it shut and it takes a blow', hit?.ok && hit.hp < hit.max, hit);
  await B.call('step', { seconds: 1.6 }); await sleep(700); await A.call('step', { seconds: 0.6 });
  const onA = (await A.call('exec', { code: `const I = game.interiors, d = I.byId.get(${Q}); return { shut: I.isShut(d), hp: I.doorHp(d).hp, under: I.underAttack(d) };` })).value;
  const heard = (await A.call('events', { since: evA })).events.filter((e) => e.type === 'shardPound' || e.type === 'shardLeaf').map((e) => e.type);
  check('A sees it shut and as hurt', onA?.shut && onA.hp === hit.hp, { onA, want: hit.hp });
  check('A heard the blow (the door shuddered there)', heard.includes('shardPound') && heard.includes('shardLeaf'), heard);
  const offB = (await B.call('exec', { code: `const I = game.interiors, d = I.byId.get(${Q}); I.pound(d, null, 9999, 'slam'); return !!d.broken;` })).value;
  await B.call('step', { seconds: 1.6 }); await sleep(700); await A.call('step', { seconds: 0.6 });
  const offA = (await A.call('exec', { code: `return !!game.interiors.byId.get(${Q}).broken;` })).value;
  check('beaten off its hinges on B, it is off them on A', offB === true && offA === true, { offB, offA });
  const kept = (await shardGet('/world')).leaves ?? {};
  check('the shard keeps the door as off its hinges', kept[id]?.p === 0, kept[id]);
  // a hostile or stale page cannot put it back on its hinges
  await A.call('exec', { code: `game.shard.sendWorld({ leaves: { ${Q}: { p: 150, s: 1 } } }); return true;` });
  await sleep(600);
  const still = (await shardGet('/world')).leaves ?? {};
  check('a later patch cannot put it back', still[id]?.p === 0, still[id]);
}

main().catch((e) => { check('the test ran to the end', false, String(e?.stack ?? e)); }).finally(async () => {
  for (const h of [A, B]) { try { h?.stop(); } catch {} } // each harness stops its own vite and Chrome (exact child handles)
  try { if (shard) await stopShard(shard.child); } catch {}
  const n = results.filter((r) => r.pass).length;
  console.log(`${n}/${results.length} passed`);
  process.exit(n === results.length ? 0 : 1);
});
