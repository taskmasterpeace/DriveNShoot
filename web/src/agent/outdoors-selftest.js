// Selftest checks for THE WILDS (docs/design/WEB_WILDS.md §8): birds shot out of the sky, THE QUIET, blood trails,
// fishing, butchering, tracking, a dog on a trail, foraging, snares and fish traps, the camp kit, a skip tracer on your
// sign, the draw-call budget. Each check stages its own quiet ground (the open desert far off the interstate; the island
// lake's dock for the water), the fauna director's own spawning off, and takes its animals, camp and traps away after.
// Staged positions and a staged clock on a trap or a rack (set back N game hours) are the documented exceptions; what
// the player does is done through commands (hunt shoot=, fish, forage, track, trap, camp, butcher, cook, moveTo).
import * as THREE from 'three';
import { outfit } from '../systems/characters.js';
import { FORAGE, GROUND_HOLD, TRACKS } from '../data/outdoors.js';
import { FISH } from '../data/outdoors.js';

const STAGE = { x: 1500, z: 900 };  // the open desert 900 m off I-10 (the fauna checks' stage)
const DOCK = { x: 381, z: 382 };    // the end of the island lake's dock (world/water.js DOCK + its 24 m deck)

export async function outdoorsChecks(api, check, C) {
  const g = api.g, F = g.fauna, O = g.outdoors;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const since = (seq, type, pred = () => true) => g.events.filter((e) => e.seq > seq && e.type === type && pred(e));
  const steps = async (s) => { for (let t = 0; t < s; t += 0.5) await C('step', { seconds: Math.min(0.5, s - t) }); };
  const P = () => g.player;
  const LV = ['tracking', 'hunting', 'fishing', 'foraging', 'trapping', 'animal_handling', 'cooking', 'outdoorsman'];
  const stage = async (fn, o = {}) => {
    const zOn = g.zombies.enabled, rt = g.raiderTimer, wOn = g.wilds.enabled;
    g.zombies.enabled = false; g.raiderTimer = 1e9; g.wilds.enabled = false;
    for (const ev of [...g.society.director.active]) g.society.director.cancel(ev.id);
    if (g.player.inVehicle) g.exitVehicle(true);
    if (g.dialogue?.active) g.dialogue.close();
    if (g.invUI?.open) g.invUI.toggle(false);
    const at = o.at ?? STAGE;
    const tp = await C('teleport', at);
    const tpBad = !tp.ok || Math.hypot(g.player.x - at.x, g.player.z - at.z) > 6 ? `the stage teleport to ${at.x},${at.z} failed: ${tp.error ?? `stood at ${g.player.x.toFixed(1)},${g.player.z.toFixed(1)}`}` : null;
    for (const c of [...g.chars]) if (c !== g.player && !c.npc && Math.hypot(c.x - at.x, c.z - at.z) < 140) g.removeChar(c);
    await C('setTime', { hour: o.hour ?? 12 }); await C('setWeather', { key: 'CLEAR', instant: true });
    g.throwables.fires.length = 0;
    F.enabled = true; F.spawning = false; F.clear(); F.bodies.clear(); F.job = null;
    const lv0 = Object.fromEntries(LV.map((k) => [k, [g.skillsSys.lv[k], g.skillsSys.xp[k]]]));
    for (const k of LV) { g.skillsSys.lv[k] = 0; g.skillsSys.xp[k] = 0; }
    O.recompute(); O.fishing = null; O.job = null; O.count = 0; O.head = 0;
    const hp = g.player.hp, cap = g.inventory.carried.cap, dogs0 = new Set(g.dogs.dogs);
    g.inventory.carried.cap = 999;
    try { return tpBad ?? await fn(); }
    finally {
      g.zombies.enabled = zOn; g.raiderTimer = rt; g.wilds.enabled = wOn; g.player.hp = hp; g.aimOverride = null; g.aim.y = 0;
      g.throwables.fires.length = 0;
      for (const a of [...F.live]) F.remove(a);
      F.enabled = false; F.spawning = true; F.bodies.clear(); F.job = null;
      for (const [k, [l, x]] of Object.entries(lv0)) { g.skillsSys.lv[k] = l; g.skillsSys.xp[k] = x; }
      O.camp.length = 0; O.traps.length = 0; O.patches.clear(); O.fishing = null; O.job = null; O.downed.length = 0; O.count = 0; O.head = 0; O.recompute();
      for (const d of [...g.dogs.dogs]) if (!dogs0.has(d)) g.dogs.remove?.(d) ?? g.dogs.dogs.splice(g.dogs.dogs.indexOf(d), 1);
      for (const c of [...g.chars]) if (c.wildsTest) g.removeChar(c);
      g.inventory.carried.cap = cap;
      await C('setWeather', { key: 'CLEAR', instant: true });
    }
  };
  const level = (k, n) => { g.skillsSys.lv[k] = n; g.skillsSys.xp[k] = 0; O.recompute(); };

  // ---- 1. a bird out of the sky --------------------------------------------------------------------------------------------
  await check('wilds: the mouse on a flying vulture aims at it at its height; a round fired flat passes under it, a shotgun aimed at it brings it down as a carcass that falls to the ground and butchers into feathers', async () => stage(async () => {
    const p = P();
    await C('give', { weapon: 'shotgun', shells: 24 }); await C('equip', { weapon: 'shotgun' });
    const [v] = F.spawn('vulture', p.x + 9, p.z + 2, 1, { hold: true, test: true });
    await steps(1);
    const alt = v.alt;
    // The cursor's ray, from the camera through the bird: skyAim takes the bird (and its height) as the aim point.
    g.render(0);
    const cam = g.camera.position, ray = new THREE.Ray(cam.clone(), new THREE.Vector3(v.x - cam.x, v.alt - cam.y, v.z - cam.z).normalize());
    const aim = { x: 0, z: 0, y: 0 }, picked = F.skyAim(ray, aim) === v && Math.abs(aim.y - v.alt) < 0.01 && aim.x === v.x;
    // Flat (the aim on the ground under it): the pellets go under the bird.
    const hp0 = v.hp;
    g.aimOverride = { x: v.x, z: v.z }; await C('step', { seconds: 0.2 });
    await C('fire', { x: v.x, z: v.z, shots: 2 });
    const under = !v.dead && v.hp === hp0;
    g.aimOverride = null;
    const r = await C('hunt', { shoot: v.id, shots: 6 });
    const down = r.ok !== false && r.killed && r.down?.onGround;
    const landed = since(0, 'birdLanded', (e) => e.id === v.id).length > 0 || down;
    if (!g.inventory.carried.count('knife')) g.inventory.stow('knife', 1);
    g.inventory.setCount('feathers', 0);
    const b = down ? await C('butcher', { id: v.id, force: true }) : { ok: false };
    const feathers = g.inventory.carried.count('feathers');
    const ok = alt > 6 && picked && under && down && landed && b.ok !== false && feathers >= 2;
    return ok ? true : JSON.stringify({ alt, picked, aim, under, hp: v.hp, hunt: r, butcher: b.error ?? b.items, feathers }).slice(0, 500);
  }));

  // ---- 2. THE QUIET --------------------------------------------------------------------------------------------------------
  await check('wilds: THE QUIET - a crow flock feeding on the ground lifts as one at a gunshot, then settles again further off', async () => stage(async () => {
    const p = P();
    await C('give', { weapon: 'pistol', pistol: 12 }); await C('equip', { weapon: 'pistol' });
    const flock = F.spawn('crow', p.x + 28, p.z + 4, 6, { test: true });
    await steps(1);
    const grounded = flock.filter((a) => !a.air).length, home = { x: flock[0].x, z: flock[0].z };
    const seq = g.eventSeq;
    await C('fire', { x: p.x, z: p.z - 15, shots: 1 });
    await steps(1);
    const up = flock.filter((a) => a.air).length, scatter = since(seq, 'birdsScatter', (e) => e.species === 'crow').length > 0;
    await steps(16);
    const down = flock.filter((a) => !a.air && !a.dead).length, moved = flock.reduce((k, a) => k + dist(a, home), 0) / flock.length;
    const ok = grounded === 6 && up >= 5 && scatter && down >= 4 && moved > 20;
    return ok ? true : JSON.stringify({ grounded, up, scatter, down, moved: +moved.toFixed(1), states: flock.map((a) => [a.state, +a.alt.toFixed(1)]) }).slice(0, 500);
  }));

  // ---- 3. a blood trail ----------------------------------------------------------------------------------------------------
  await check('wilds: a wounded deer runs off leaving a blood trail you can query (track follow=, kind=blood), and the ground there reads "mule deer, bleeding"', async () => stage(async () => {
    const p = P();
    await C('give', { weapon: 'rifle', rifle: 30 }); await C('equip', { weapon: 'rifle' });
    const [d] = F.spawn('mule_deer', p.x + 16, p.z, 1, { test: true });
    await steps(0.5);
    const seq = g.eventSeq;
    for (let i = 0; i < 8 && !since(seq, 'faunaHit', (e) => e.id === d.id).length; i++) await C('fire', { x: d.x, z: d.z, shots: 1 });
    const hit = since(seq, 'faunaHit', (e) => e.id === d.id).length > 0, wounded = !d.dead && d.hp < d.maxHp * TRACKS.wounded;
    await steps(5);
    const t = await C('track', { follow: d.id, kind: 'blood', level: 6 });
    const mid = t.trail?.[Math.floor((t.trail.length - 1) / 2)];
    const read = mid ? await C('track', { x: mid.x, z: mid.z, radius: 6, level: 6 }) : null;
    const line = read?.sign?.find((l) => l.species === 'mule_deer');
    const away = t.from && t.to && dist(t.to, p) > dist(t.from, p);
    const ok = hit && wounded && t.blood >= 3 && away && line && line.bleeding >= 1;
    return ok ? true : JSON.stringify({ hit, wounded, hp: d.hp, dead: d.dead, blood: t.blood, from: t.from, to: t.to, line: line?.text ?? read?.said }).slice(0, 500);
  }));

  // ---- 4. fishing ----------------------------------------------------------------------------------------------------------
  await check('wilds: fishing off the island dock (rod, hook, grubs) lands a lake fish within 6 casts; the water authority says lake; the dry desert gives nothing to cast into', async () => stage(async () => {
    await steps(1.5); // settle on the deck
    const r = await C('fish', { force: true, casts: 6, react: 0.25, face: 0 });
    const lake = FISH.filter((f) => f.waters.includes('lake') && f.regions.includes('west')).map((f) => f.id);
    const water = r.log?.[0]?.water;
    const goodFish = r.fish?.length && r.fish.every((f) => lake.includes(f));
    await C('teleport', STAGE); await steps(1);
    const dry = await C('fish', { force: true, casts: 1 });
    const ok = r.caught && goodFish && water === 'lake' && dry.ok === false && /water/.test(dry.error ?? '');
    return ok ? true : JSON.stringify({ r, dry }).slice(0, 500);
  }, { at: DOCK }));

  // ---- 5. butchering -------------------------------------------------------------------------------------------------------
  await check('wilds: butchering a mule deer yields venison, a hide, bone and sinew; a HUNTING 6 hunter cuts it a quarter faster and takes one more cut of meat, sinew and bone', async () => stage(async () => {
    const p = P(), inv = g.inventory;
    if (!inv.carried.count('knife')) inv.stow('knife', 1);
    const one = async () => {
      for (const id of ['raw_venison', 'deer_hide', 'torn_hide', 'bone', 'sinew']) inv.setCount(id, 0);
      const [d] = F.spawn('mule_deer', p.x + 3, p.z, 1, { hold: true, test: true });
      await C('faunaKill', { id: d.id });
      const r = await C('butcher', { id: d.id, force: true });
      const c = (id) => inv.carried.count(id);
      F.remove(d);
      return { s: r.seconds, meat: c('raw_venison'), hide: c('deer_hide') + c('torn_hide'), bone: c('bone'), sinew: c('sinew') };
    };
    const a = await one();
    level('hunting', 6);
    const b = await one();
    const ok = a.meat >= 3 && a.hide === 1 && a.bone >= 1 && a.sinew >= 1 && b.s < a.s * 0.8 && b.meat >= 4 && b.sinew >= 2 && b.bone >= 2;
    return ok ? true : JSON.stringify({ a, b }).slice(0, 400);
  }));

  // ---- 6. tracking ---------------------------------------------------------------------------------------------------------
  await check('wilds: a TRACKING raise reveals an older track - a deer\'s line of prints 1.2-1.5 game hours old reads as nothing at level 0 and as "mule deer, one, heading E" at level 5', async () => stage(async () => {
    const p = P(), hold = GROUND_HOLD[O.biomeAt(p.x, p.z)] ?? 1;
    await C('track', { lay: 'hoof', species: 'mule_deer', who: 'deer_old', x: p.x + 2, z: p.z + 3, n: 6, face: Math.PI / 2, step: 1.8, age: 1.5 });
    const r0 = await C('track', { x: p.x + 6, z: p.z + 3, radius: 8, level: 0 });
    const r5 = await C('track', { x: p.x + 6, z: p.z + 3, radius: 8, level: 5 });
    const l5 = r5.sign?.find((l) => l.species === 'mule_deer');
    // And the player's own reading follows the skill: level 0 sees nothing; raised, the same ground reads.
    const mine0 = O.read(p.x + 6, p.z + 3, 8).length;
    level('tracking', 5);
    const mine5 = O.read(p.x + 6, p.z + 3, 8).find((l) => l.species === 'mule_deer');
    const ok = hold >= 0.75 && !r0.sign.some((l) => l.species === 'mule_deer') && l5 && l5.heading === 'E' && l5.makers === 1 && l5.ageMin >= 60 && mine0 === 0 && mine5;
    return ok ? true : JSON.stringify({ hold, r0: r0.said, r5: r5.said, mine0, mine5: mine5?.text }).slice(0, 400);
  }));

  // ---- 7. a dog on a trail -------------------------------------------------------------------------------------------------
  await check('wilds: a dog of yours put on a staged scent trail (track dog=true) follows it print by print to its end and points there', async () => stage(async () => {
    const p = P();
    await C('dog', { spawn: 'bloodhound', x: p.x - 1.5, z: p.z + 1, name: 'Wildstest' });
    const d = g.dogs.dogs.find((o) => o.name === 'Wildstest');
    if (!d) return 'no dog made';
    await C('dog', { id: d.id, bond: 45 });
    await steps(0.5);
    const lay = await C('track', { lay: 'boot', who: 'quarry_t', species: 'person', x: p.x + 3, z: p.z, n: 18, face: Math.PI / 2, step: 1.7, age: 0.4 });
    const seq = g.eventSeq;
    const r = await C('track', { dog: true, who: 'quarry_t' });
    let end = null;
    for (let i = 0; i < 60 && !end; i++) { await C('step', { seconds: 0.5 }); end = since(seq, 'dogTrailEnd', (e) => e.dog === d.id)[0]; }
    const last = lay.last, near = end ? Math.hypot(d.x - last.x, d.z - last.z) : null;
    const ok = r.ok !== false && d.owned && end && end.steps >= 12 && near < 4;
    return ok ? true : JSON.stringify({ r, owned: d.owned, end, near, dog: { x: d.x, z: d.z, cmd: d.cmd, state: d.state }, last }).slice(0, 500);
  }));

  // ---- 8. foraging ---------------------------------------------------------------------------------------------------------
  await check('wilds: foraging in the desert turns up desert rows only, and searching one patch over and over picks it clean', async () => stage(async () => {
    const p = P(), b = O.biomeAt(p.x, p.z);
    const r = await C('forage', { times: 5, spread: true });
    const allowed = new Set(FORAGE.filter((f) => f.biomes.includes(b) && !f.region && !f.wet).map((f) => f.item));
    const bad = r.found?.filter((x) => !allowed.has(x.item)) ?? [];
    const before = O.patch(g.player.x, g.player.z).r;
    await C('forage', { times: 3 });
    const after = O.patch(g.player.x, g.player.z).r;
    const ok = r.searches === 5 && r.found.length >= 2 && !bad.length && after < before && after < 0.05;
    return ok ? true : JSON.stringify({ biome: b, found: r.found, bad, before, after }).slice(0, 400);
  }));

  // ---- 9. talents are rows that move numbers ------------------------------------------------------------------------------------
  await check('wilds: the eight outdoor skills are skill rows and their talents move measurable numbers (count the feet, two hooks, trapline, mushroom lore, iron gut, pathfinder)', async () => stage(async () => {
    const S = g.skillsSys, rows = LV.every((k) => k in S.lv);
    const f0 = { ...O.fx };
    for (const k of LV) level(k, 9);
    const f = O.fx;
    const ok = rows && f0.countFeet === 0 && f.countFeet === 1 && f.doubleCatch === 0.25 && f.maxSnares === 2 && f.knowPoison === 1 && f.rawSickMul === 0 && f.ownTrackMul === 0.4 && f.trackAgeH === 3 && O.per('biteWait', 'fishing') < -0.4;
    return ok ? true : JSON.stringify({ rows, f0, f }).slice(0, 400);
  }));

  // ---- 10. traps on the clock ----------------------------------------------------------------------------------------------------
  await check('wilds: a snare set in the desert and a fish trap sunk off the dock fill while you are away (30 and 12 game hours) and empty into your pack', async () => {
    const snare = await stage(async () => {
      const s = await C('trap', { set: 'snare', force: true });
      if (s.ok === false) return { err: s.error };
      O.traps[0].lastAt -= 30; // away 30 game hours (a staged clock)
      const c = await C('trap', { check: true, all: true });
      return { got: c.items ?? c.error };
    });
    const fish = await stage(async () => {
      const s = await C('fish', { set: 'fishtrap', force: true, face: 0 });
      if (s.ok === false) return { err: s.error };
      O.traps[0].lastAt -= 12;
      const c = await C('fish', { check: true, all: true });
      return { got: c.items ?? c.error };
    }, { at: DOCK });
    const ok = Array.isArray(snare.got) && snare.got.some((x) => x.item === 'raw_game' || x.item === 'raw_fowl') && Array.isArray(fish.got) && fish.got.filter((x) => x.item.startsWith('fish_') || x.item === 'crayfish').length >= 2;
    return ok ? true : JSON.stringify({ snare, fish }).slice(0, 400);
  });

  // ---- 11. the camp kit ------------------------------------------------------------------------------------------------------------
  await check('wilds: the camp kit - a fire pit you cook on, a drying rack that turns raw meat into dried meat on the clock, a rain catcher that fills in the rain and tops up a bottle', async () => stage(async () => {
    const inv = g.inventory;
    const fp = await C('camp', { build: 'firepit', force: true });
    await steps(1.5);
    const lit = g.throwables.fires.some((f) => f.pit === fp.id);
    inv.setCount('raw_venison', 0); inv.setCount('cooked_venison', 0); inv.stow('raw_venison', 2);
    const ck = await C('cook', {});
    const cooked = inv.carried.count('cooked_venison');
    // The rack, a step aside of the fire.
    g.player.x += 3.5; await C('step', { seconds: 0.2 });
    const rk = await C('camp', { build: 'rack', force: true });
    inv.setCount('raw_pork', 0); inv.setCount('dried_meat', 0); inv.stow('raw_pork', 2);
    const hang = await C('camp', { hang: true });
    const early = await C('camp', { take: true });
    for (const s of O.camp.find((o) => o.kind === 'rack').slots) s.doneAt -= 7; // seven game hours on (a staged clock)
    const take = await C('camp', { take: true });
    const dried = inv.carried.count('dried_meat');
    // The catcher, in the rain.
    g.player.x += 3.5; await C('step', { seconds: 0.2 });
    const ct = await C('camp', { build: 'catcher', force: true });
    await C('setWeather', { key: 'RAIN', instant: true });
    const o = O.camp.find((x) => x.kind === 'catcher'); o.lastAt -= 4; // four rainy game hours (staged)
    await steps(1.5);
    const water = o.water;
    for (let i = inv.carried.slots.length - 1; i >= 0; i--) if (inv.carried.slots[i].id === 'water_bottle') inv.take(inv.carried, i, inv.carried.slots[i].n);
    inv.add(inv.carried, 'water_bottle', 1, { left: 0 });
    const fill = await C('camp', { fill: true });
    const left = inv.carried.slots.find((s) => s.id === 'water_bottle')?.left;
    const ok = fp.ok !== false && lit && ck.ok !== false && cooked === 2 && rk.ok !== false && hang.ok !== false && early.ok === false && take.ok !== false && dried === 2 && ct.ok !== false && water > 3 && fill.ok !== false && left === 3;
    return ok ? true : JSON.stringify({ fp: fp.error, lit, ck: ck.error, cooked, rk: rk.error, hang: hang.error, early: early.ok, take: take.error, dried, ct: ct.error, water, fill: fill.error, left }).slice(0, 500);
  }));

  // ---- 12. somebody on YOUR trail -------------------------------------------------------------------------------------------------
  await check('wilds: a skip tracer put on your trail works your boot prints from where you started to where you stand', async () => stage(async () => {
    const p = P(), start = { x: p.x, z: p.z };
    await steps(0.5);
    await C('moveTo', { x: p.x + 44, z: p.z + 6, run: false, maxSeconds: 40 });
    const end = { x: p.x, z: p.z };
    const c = g.addChar({ x: start.x, z: start.z, faction: 'drifter', colors: outfit('drifter'), name: 'Skip Tracer', flag: 'US', hp: 100 });
    c.home = { x: start.x, z: start.z }; c.wx = c.x; c.wz = c.z; c.wildsTest = true; c.trailing = p.id; c.trackSkill = 6;
    const d0 = dist(c, end);
    let dmin = d0;
    for (let i = 0; i < 40 && dmin > 6; i++) { await C('step', { seconds: 0.5 }); dmin = Math.min(dmin, dist(c, end)); }
    const ok = d0 > 40 && dmin < 8 && c.alive;
    return ok ? true : JSON.stringify({ d0, dmin, trailing: c.trailing, state: c.state, at: { x: c.x, z: c.z }, prints: O.trail(p.id, 6).length }).slice(0, 400);
  }));

  // ---- 13. the budget -------------------------------------------------------------------------------------------------------------
  await check('wilds: 400 tracks, a flock aloft, a camp and its traps on screen - the tracks are one draw call and the frame stays under 150', async () => stage(async () => {
    const p = P();
    level('tracking', 10);
    for (let i = 0; i < 400; i++) O.lay(['boot', 'hoof', 'paw', 'blood', 'tyre'][i % 5], p.x + ((i % 20) - 10) * 1.4, p.z + (Math.floor(i / 20) - 10) * 1.4, i, `w${i % 7}`, 'person', (i % 10) * 0.05);
    F.spawn('goose', p.x + 6, p.z - 8, 8, { test: true }).forEach((a) => F.takeOff(a, p.x, p.z));
    await C('camp', { build: 'firepit', force: true }); await C('trap', { set: 'snare', force: true });
    await steps(1);
    g.render(0);
    const perf = await C('perf');
    const n = O.mesh.count, cap = TRACKS.draw;
    const ok = perf.drawCalls < 150 && n > 300 && n <= cap && O.campMesh.count >= 2;
    return ok ? true : JSON.stringify({ calls: perf.drawCalls, drawn: n, cap, camp: O.campMesh.count }).slice(0, 300);
  }));
}
