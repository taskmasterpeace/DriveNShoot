// THE SENTRY GUN for agents (docs/design/WEB_SENTRY.md; rows data/gadgets.js turret_kit.sentry; the rule
// systems/gadgets.js sentry / sentryLoad / sentryBreak): the `sentry` command and the checks.
import { GADGETS } from '../data/gadgets.js';
import { ITEMS } from '../data/items.js';
import { RECIPE_BY_ID, matterOf } from '../data/recipes.js';
import { FORTIFY } from '../data/homes.js';
import { freeSpot } from './citygen-api.js';

const r1 = (v) => Math.round(v * 10) / 10;

export function sentryCommands(api) {
  const g = api.g;
  return {
    sentry: {
      group: 'world', desc: 'THE SENTRY GUN (docs/design/WEB_SENTRY.md): the turret kit you built at a forge, set down (USE it from the pack) and loaded with your own rifle rounds. It turns to the nearest enemy inside its fan that it can see on its own floor and fires; every round is one of yours and carries 45 m; the infected that reach it tear it down. This lists every sentry set (where, which way it faces, rounds, hp, what it tracks, shots and hits), your rifle rounds, and the rows.',
      args: {},
      run: async () => {
        const S = GADGETS.turret_kit.sentry, GX = g.gadgets;
        return {
          sentries: GX.list.filter((p) => p.def.sentry).map((p) => ({ id: p.id, state: p.state, x: r1(p.x), z: r1(p.z), floor: r1(p.gy ?? 0), faces: Math.round((p.rot * 180) / Math.PI), aims: Math.round(((p.aim ?? p.rot) * 180) / Math.PI), ammo: p.ammo ?? 0, hp: Math.round(p.hp ?? S.hp), target: p.target ?? null, shots: p.shots ?? 0 })),
          rounds: g.inv.ammo[S.ammo] ?? 0, kits: g.inventory.carried.count('turret_kit'),
          counts: { shots: GX.counts.sentryShots ?? 0, hits: GX.counts.sentryHits ?? 0, broken: GX.counts.sentryBroken ?? 0 }, rows: S,
        };
      },
    },
  };
}

export async function sentryChecks({ g, api, C, check, hush }) {
  const GX = g.gadgets, P = () => g.player, S = GADGETS.turret_kit.sentry, inv = g.inventory;
  const zed = (x, z, hp = 100) => { const c = g.addChar({ x, z, faction: 'zombie', weapon: null, hp, name: 'Sentry target (selftest)', flag: 'US' }); c.hold = true; c.timer = 999; c.speed = 0; c.zSpeed = 0; return c; };
  const clear = () => { for (const p of [...GX.list]) if (p.def.sentry) GX.remove(p); };
  const piles = (x, z, id) => { let n = 0; for (const b of inv.boxes.values()) if (b.kind === 'ground' && Math.hypot(b.x - x, b.z - z) < 2.5) for (const q of b.slots) if (q.id === id) n += q.n; return n; };

  await check('sentry: the rows - the sentry gun is the built turret kit (one item: a base\'s turret takes the same one), it is a thing you carry and USE, its recipe eats more than it makes and needs a rifle, its numbers are sane (a fan under a half circle, a magazine, hp, a chance to hit that falls with range)', () => {
    const R = RECIPE_BY_ID.build_turret, m = R ? matterOf(R, ITEMS) : null, it = ITEMS.turret_kit;
    const ok = !!GADGETS.turret_kit && GADGETS.turret_kit.trigger === 'sentry' && it?.use?.act === 'gadget' && it.kg >= 15 && !!R && m.net <= 0 && R.inputs.some(([id]) => id === 'gun_rifle')
      && FORTIFY.turret.cost.some(([id]) => id === 'turret_kit') && S.arc > 20 && S.arc < 180 && S.mag >= 10 && S.hp > 0 && S.hitNear > S.hitFar && S.hitFar > 0 && S.hitNear <= 1 && S.every > 0.1 && S.noise >= 20 && !GADGETS.turret_kit.source.craft;
    return ok || JSON.stringify({ it, m, S });
  });

  await check('sentry: it shoots what comes into its fan with YOUR rounds - set down with no rifle rounds on you it is empty and does not fire (it says so once); loaded, it takes rounds from your pockets up to its magazine, turns to an infected 8 m in front of it and kills it, each round one fewer in it and heard 45 m off; one standing behind it is not shot and one behind a wall is not; USED from a pack with a stack of rounds before it, exactly one kit leaves the pack; taking it up gives the kit and every unfired round back; a save keeps its rounds and its hp', async () => hush(async () => {
    await C('start'); g.godMode = true;
    const made = []; const ammo0 = g.inv.ammo[S.ammo] ?? 0, kits0 = inv.carried.count('turret_kit');
    try {
      clear();
      // open ground with a clear line east
      const spot = freeSpot(g, -6000, -12000, 60) ?? { x: 0, z: -40 }; // empty ground: nobody of a town shoots the targets for it
      await C('teleport', { x: spot.x, z: spot.z }); await api._step(30);
      const p = P(); let dir = null;
      for (let a = 0; a < 16 && !dir; a++) { const dx = Math.sin(a * 0.3927), dz = Math.cos(a * 0.3927); if (g.statics.raycast(p.x, p.z, dx, dz, 18, 0, -1) >= 18 && !g.vehicles.some((v) => { const rx = v.x - p.x, rz = v.z - p.z, al = rx * dx + rz * dz; return al > -4 && al < 20 && Math.abs(rx * dz - rz * dx) < 4; })) dir = { dx, dz, a: a * 0.3927 }; }
      if (!dir) return 'no clear line';
      for (const c of [...g.chars]) if (c !== p && !c.npc && Math.hypot(c.x - p.x, c.z - p.z) < 40) g.removeChar(c);
      p.face = dir.a; g.aimOverride = { x: p.x + dir.dx * 6, z: p.z + dir.dz * 6 }; await api._step(3);
      g.inv.ammo[S.ammo] = 0;
      inv.stow('turret_kit', 1);
      const placed = GX.place('turret_kit', p.x + dir.dx * 1.1, p.z + dir.dz * 1.1, dir.a, p, { gy: p.gy ?? 0, hp: S.hp, ammo: 0 });
      const T = placed?.id ? placed : null; if (!T) return 'it did not go down';
      GX.sentryLoad(T, p);
      const emptyAt = T.ammo;
      await api._step(Math.ceil(60 * (GADGETS.turret_kit.arm + 0.3)));
      const armed = T.state;
      const z1 = zed(T.x + dir.dx * 8, T.z + dir.dz * 8); made.push(z1);
      const ev0 = g.eventSeq; await api._step(120);
      const dry = { shots: T.shots ?? 0, hp: z1.hp, told: g.events.filter((e) => e.seq > ev0 && e.type === 'sentryDry').length };
      // load it: 100 on you, 60 go in
      g.inv.ammo[S.ammo] = 100;
      const took = GX.sentryLoad(T, p), left = g.inv.ammo[S.ammo];
      const back = zed(T.x - dir.dx * 6, T.z - dir.dz * 6), ev1 = g.eventSeq; made.push(back);
      await api._step(60 * 6);
      const shots = T.shots ?? 0, ev = g.events.filter((e) => e.seq > ev1), shotEv = ev.filter((e) => e.type === 'sentryShot').length;
      const killed = !z1.alive, ammoNow = T.ammo, backHp = back.hp;
      // behind a wall: a body 6 m out with something solid between
      let walled = 'no wall near';
      const W = g.world.buildings.find((b) => b.enterable && !b.ruined && b.maxX - b.minX > 8);
      if (W) {
        clear();
        // a stretch of its north wall with no window or door in it: the gun 3 m outside, a body 3 m inside, dead ahead
        let wx = null; const wz = W.minZ - 3, iz = W.minZ + 3;
        for (let x = W.minX + 1.5; x < W.maxX - 1.5 && wx === null; x += 0.5) if (!g.statics.lineOfSight(x, wz, x, iz, 1, -1) && !g.statics.lineOfSight(x - 0.4, wz, x - 0.4, iz, 1, -1) && !g.statics.lineOfSight(x + 0.4, wz, x + 0.4, iz, 1, -1)) wx = x;
        if (wx !== null) {
          await C('teleport', { x: wx, z: wz - 5 }); await api._step(20);
          for (const c of [...g.chars]) if (c !== p && !c.npc && Math.hypot(c.x - wx, c.z - wz) < 40) g.removeChar(c);
          const T2 = GX.place('turret_kit', wx, wz, 0, p, { gy: 0, hp: S.hp, ammo: 20 }); T2.state = 'armed'; T2.t = 9; // faces +z, at the wall
          const inside = zed(wx, iz, 400); made.push(inside);
          const seen = g.statics.lineOfSight(T2.x, T2.z, inside.x, inside.z, 1, -1);
          await api._step(180);
          walled = { seen, shots: T2.shots ?? 0, d: r1(Math.hypot(inside.x - T2.x, inside.z - T2.z)) };
          GX.remove(T2);
          await C('teleport', { x: spot.x, z: spot.z }); await api._step(20);
        }
      }
      // THE PLAYER'S OWN USE, with a stack of 30 rifle rounds in the pack BEFORE the kit (the rounds' slot empties as the gun
      // loads): exactly one kit leaves the pack, the gun holds the 30, and taking it up gives back one kit, not two
      clear();
      for (let n = inv.carried.count('turret_kit'); n > 0; n--) inv.spend('turret_kit', 1);
      for (const b of inv.boxes.values()) if (b.kind === 'ground' && Math.hypot(b.x - p.x, b.z - p.z) < 3) for (let i = b.slots.length - 1; i >= 0; i--) if (b.slots[i].id === 'turret_kit') inv.take(b, i, b.slots[i].n);
      g.inv.ammo[S.ammo] = 0; g.inv.ammo[S.ammo] = 30;
      const cap0 = inv.carried.cap; inv.carried.cap = Math.max(cap0, 60); // a frame ruck's room for the test (the kit is 30 bulk)
      const added = inv.add(inv.carried, 'turret_kit', 1);
      const ki = inv.carried.slots.findIndex((q) => q.id === 'turret_kit'), ai = inv.carried.slots.findIndex((q) => q.id === 'ammo_rifle');
      const used = ki >= 0 ? inv.use(ki) : { ok: false, why: 'no kit in the pack' };
      await api._step(6);
      const TU = GX.list.find((q) => q.def.sentry) ?? null;
      const use = { added, order: ai >= 0 && ai < ki, ok: used?.ok !== false, kitsLeft: inv.carried.count('turret_kit') + piles(p.x, p.z, 'turret_kit'), in: TU?.ammo ?? -1, pocket: g.inv.ammo[S.ammo] ?? 0 };
      if (TU) { TU.state = 'armed'; GX.pickUp(TU, p); }
      use.kitsBack = inv.carried.count('turret_kit') + piles(p.x, p.z, 'turret_kit'); use.pocketBack = g.inv.ammo[S.ammo] ?? 0;
      for (let n = inv.carried.count('turret_kit'); n > 0; n--) inv.spend('turret_kit', 1); // out of the pack again before its room goes back to what it was
      inv.carried.cap = cap0;
      // a save keeps it; taking it up gives everything back
      clear();
      const T3 = GX.place('turret_kit', p.x + dir.dx * 1.1, p.z + dir.dz * 1.1, dir.a, p, { gy: p.gy ?? 0, hp: 123, ammo: 17 }); T3.state = 'armed'; T3.t = 9;
      const sv = GX.save(), rec = sv.list.find((r) => r.k === 'turret_kit');
      const rounds = () => (g.inv.ammo[S.ammo] ?? 0) + piles(p.x, p.z, `ammo_${S.ammo}`); // in your pockets, or at your feet when the pack is full
      const pocket0 = rounds(), k0 = inv.carried.count('turret_kit') + piles(p.x, p.z, 'turret_kit');
      const up = GX.pickUp(T3, p);
      const pocket1 = rounds(), k1 = inv.carried.count('turret_kit') + piles(p.x, p.z, 'turret_kit');
      const ok = emptyAt === 0 && armed === 'armed' && dry.shots === 0 && dry.hp === 100 && dry.told === 1
        && took === S.mag && left === 100 - S.mag && killed && shots >= 2 && shotEv === shots && ammoNow === S.mag - shots && backHp === 100
        && typeof walled === 'object' && walled.seen === false && walled.shots === 0 && walled.d < S.range
        && use.added === 1 && use.order && use.ok && use.kitsLeft === 0 && use.in === 30 && use.pocket === 0 && use.kitsBack === 1 && use.pocketBack === 30
        && rec?.am === 17 && rec?.hp === 123 && up.ok && pocket1 === pocket0 + 17 && k1 === k0 + 1;
      return ok || JSON.stringify({ use, emptyAt, armed, dry, took, left, killed, shots, shotEv, ammoNow, backHp, walled, rec, up, pocket0, pocket1, k0, k1 });
    } finally {
      clear(); for (const c of made) if (g.chars.includes(c)) g.removeChar(c);
      g.aimOverride = null; g.godMode = false; g.inv.ammo[S.ammo] = ammo0; await C('teleport', { x: 0, z: -40 }); await api._step(3);
      for (let n = inv.carried.count('turret_kit'); n > kits0; n--) inv.spend('turret_kit', 1);
      for (const b of inv.boxes.values()) if (b.kind === 'ground' && Math.hypot(b.x - P().x, b.z - P().z) < 3) for (let i = b.slots.length - 1; i >= 0; i--) if (b.slots[i].id === 'turret_kit') inv.take(b, i, b.slots[i].n);
    }
  }));

  await check('sentry: it can be torn down - three infected at its feet take its hp off at the row\'s rate and it breaks: the kit is gone, what lies there is its scrap and every round it still held (nothing more), and it fires no more', async () => hush(async () => {
    await C('start'); g.godMode = true;
    const made = [];
    try {
      clear();
      const spot = freeSpot(g, -6000, -12000, 60) ?? { x: 0, z: -40 }; // empty ground: nobody of a town shoots the targets for it
      await C('teleport', { x: spot.x, z: spot.z }); await api._step(30);
      const p = P();
      for (const c of [...g.chars]) if (c !== p && !c.npc && Math.hypot(c.x - p.x, c.z - p.z) < 40) g.removeChar(c);
      const sx = p.x + 6, sz = p.z + 6;
      const sc0 = piles(sx, sz, 'scrap'), am0 = piles(sx, sz, `ammo_${S.ammo}`);
      const T = GX.place('turret_kit', sx, sz, 0, p, { gy: p.gy ?? 0, hp: S.hp, ammo: 9 }); T.state = 'armed'; T.t = 9;
      // three at its feet BEHIND it (outside its fan, so it cannot shoot them off itself)
      for (const [ox, oz] of [[-0.8, -0.7], [0, -1.0], [0.8, -0.7]]) made.push(zed(T.x + ox, T.z + oz, 400));
      const ev0 = g.eventSeq, t0 = g.time;
      let broke = -1;
      for (let i = 0; i < 60 * 12 && broke < 0; i += 6) { await api._step(6); if (!GX.list.includes(T)) broke = g.time - t0; }
      const want = S.hp / (S.maxClaw * S.claw);
      const ev = g.events.filter((e) => e.seq > ev0), brokeEv = ev.filter((e) => e.type === 'sentryBroken'), shots = ev.filter((e) => e.type === 'sentryShot').length;
      const sc1 = piles(sx, sz, 'scrap'), am1 = piles(sx, sz, `ammo_${S.ammo}`), kit = piles(sx, sz, 'turret_kit');
      const scrapRow = S.scrap.find(([id]) => id === 'scrap')?.[1] ?? 0;
      const ok = broke > 0 && Math.abs(broke - want) < 1.2 && brokeEv.length === 1 && brokeEv[0].left === 9 && shots === 0 && sc1 - sc0 === scrapRow && am1 - am0 === 9 && kit === 0;
      // tidy what it left
      for (const b of inv.boxes.values()) if (b.kind === 'ground' && Math.hypot(b.x - sx, b.z - sz) < 3) for (let i = b.slots.length - 1; i >= 0; i--) if (['scrap', `ammo_${S.ammo}`].includes(b.slots[i].id)) inv.take(b, i, b.slots[i].n);
      return ok || JSON.stringify({ broke: r1(broke), want: r1(want), brokeEv, shots, scrap: sc1 - sc0, ammo: am1 - am0, kit });
    } finally { clear(); for (const c of made) if (g.chars.includes(c)) g.removeChar(c); g.godMode = false; await C('teleport', { x: 0, z: -40 }); await api._step(3); }
  }));
}
