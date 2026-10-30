// SHOT READ's command and checks (data/shotread.js, systems/shotread.js, docs/design/WEB_SHOT_READ.md): a shot fired at
// the player is seen (a bigger flash, a streak on every round), heard (the crack or whiz) and placed (dust where it lands
// near you, a marker at the screen's edge toward where it came from); and the world's first stock holds a few more rounds.
import { SHOT_READ, validateShotRead } from '../data/shotread.js';
import { BALLISTICS as BL } from '../data/ballistics.js';
import { LOOT } from '../data/items.js';
import { WEAPONS } from '../systems/combat.js';
import { RAY_BULLET } from '../engine/collision.js';
import * as THREE from 'three';

const r2 = (v) => +(+v).toFixed(2);
const _v = new THREE.Vector3();
const COMMON = ['ammo_pistol', 'ammo_smg', 'ammo_shells', 'ammo_rifle'];
// The common rounds a container held on average before the raise (origin/play/845's rows: tools in scratchpad), so the
// check measures the raise instead of trusting it.
export const AMMO_BEFORE = { bedroom: 0, garage: 0, person: 0, raider: 5.79, soldier: 7.69, gunsmith: 28.59, trunk_patrol: 0 };

// The common rounds one container of this table holds on average (rolls x the share of each ammo row x its mean count).
export function expectedRounds(table, ids = COMMON) {
  const T = LOOT[table];
  if (!T) return 0;
  const total = T.none + T.rows.reduce((a, r) => a + r[1], 0), rolls = (T.rolls[0] + T.rolls[1]) / 2;
  return rolls * T.rows.filter((r) => ids.includes(r[0])).reduce((a, r) => a + (r[1] / total) * (r[2] + r[3]) / 2, 0);
}

export function shotReadCommands(api) {
  const g = api.g;
  return {
    shotread: {
      group: 'world', desc: 'SHOT READ (systems/shotread.js, docs/design/WEB_SHOT_READ.md): how a shot fired at the player reads. The markers up now (kind miss|hit, who fired, where from, their bearing on screen in degrees, 0 = right, clockwise), the counters (shots at you, near misses, dust puffs, hits, markers raised), the knobs (data/shotread.js), and the common rounds an average container of each table holds (ammo).',
      args: {},
      run: async () => ({ ...g.shotRead.view(), bad: validateShotRead(), ammo: Object.fromEntries(Object.keys(AMMO_BEFORE).map((t) => [t, { now: r2(expectedRounds(t)), before: AMMO_BEFORE[t] }])) }),
    },
  };
}

// A straight clear line on the island's flats (heading +z), no box within 3 m, dry.
function clearStrip(g, len) {
  const S = g.statics;
  for (let x = -420; x <= 420; x += 37) for (let z = 280; z + len <= 440; z += 23) {
    let ok = true;
    for (const b of S.boxes) if (b.maxX > x - 3 && b.minX < x + 3 && b.maxZ > z - 3 && b.minZ < z + len + 3) { ok = false; break; }
    if (ok) { S.raycast(x, z, 0, 1, len, RAY_BULLET, -1); if (S.hit.box) ok = false; }
    if (ok && g.water.depthAt(x, z) <= 0 && g.water.depthAt(x, z + len) <= 0) return { x, z };
  }
  return null;
}

// ---- selftest ------------------------------------------------------------------------------------------------------------
export async function shotReadChecks(ctx) {
  const { g, api, C, check, extra } = ctx;
  const B = g.ballistics, R = g.shotRead, S = SHOT_READ;
  const cast = [];
  const settle = async (max = 240) => { for (let k = 0; k < max && B.inFlight(); k++) await api._step(1, 1 / 60); };
  const L = clearStrip(g, 40);
  const stage = async () => {
    if (!L) throw new Error('no clear strip on the flats');
    if (g.player.inVehicle) g.exitVehicle(true);
    for (const c of [...g.chars]) if (c !== g.player && !c.npc && Math.abs(c.x - L.x) < 14 && c.z > L.z - 12 && c.z < L.z + 50) g.removeChar(c);
    await C('teleport', { x: L.x, z: L.z }); await api._step(2);
    g.player.x = L.x; g.player.z = L.z; g.player.face = 0;
    R.clear();
  };
  // A shooter up the strip, 26 m north of the player, holding still.
  const shooter = (dz = 26) => { const c = extra('raider', L.x, L.z + dz, { hold: true, hp: 5000 }); c.x = L.x; c.z = L.z + dz; c.hold = true; c.target = null; cast.push(c); return c; };
  const at = (c, x, z) => Math.atan2(x - c.x, z - c.z);
  const fire = (c, k, ang) => g.combat.fire(c, k, ang, { ...WEAPONS[k], spread: 0 });

  try {
    await check('shot read: the knobs validate, and the first stock holds more common rounds - a bedroom\'s nightstand box, a passer-by\'s pockets, a patrol car\'s trunk, more on raiders, soldiers and the gun shop (rows rolled once, never refilled)', async () => {
      const bad = validateShotRead(), now = Object.fromEntries(Object.keys(AMMO_BEFORE).map((t) => [t, r2(expectedRounds(t))]));
      const broken = validateShotRead({ ...S, reach: -1, extra: 1 }).length >= 2; // the validator catches a bad row
      const raised = now.bedroom >= 1 && now.person >= 0.5 && now.trunk_patrol >= 15
        && ['raider', 'soldier', 'gunsmith'].every((t) => now[t] >= AMMO_BEFORE[t] * 1.4);
      // A patrol car's trunk: rolled the first time it is opened, from the car's own seed; emptied, it stays empty.
      const inv = g.inventory, cars = Array.from({ length: 8 }, (_, i) => ({ id: `shotread-patrol-${i}`, type: 'patrol', name: 'TEST CRUISER' }));
      let rounds = 0, again = null, same = null;
      try {
        for (const v of cars) rounds += COMMON.reduce((a, id) => a + inv.trunk(v).count(id), 0);
        const t = inv.trunk(cars[0]); t.slots.length = 0;
        again = inv.trunk(cars[0]).slots.length; same = inv.trunk(cars[0]) === t;
      } finally { for (const v of cars) inv.trunks.delete(v.id); }
      const ok = !bad.length && broken && raised && rounds / cars.length >= 8 && again === 0 && same;
      return ok ? true : JSON.stringify({ bad, broken, now, perTrunk: r2(rounds / cars.length), again, same });
    });

    await check('shot read: a raider\'s rifle round that passes a metre beside you is drawn (every round at you, not one in N), longer and wider than its own tracer yet short, cracks past, and raises a marker at the screen\'s edge pointing back at him; a shot he fires away is not drawn as one, and the flash of the shot at you is bigger', async () => {
      await stage();
      const p = g.player, c = shooter();
      await api._step(2);
      const flashes = [], fx = g.fx, orig = fx.flash;
      fx.flash = function (x, y, z, s, life) { if (Math.hypot(x - c.x, z - c.z) < 2) flashes.push(s); return orig.call(this, x, y, z, s, life); };
      let away, past, len = 0, wide = 0;
      try {
        c._tracerN = { 556: 0 }; // the next round of his would NOT be his every-Nth streak
        const n0 = B.stats.launched;
        fire(c, 'rifle', at(c, p.x, p.z + 60)); // north, away from the player
        away = B.pool.find((q) => q.id === n0 + 1);
        const awayRead = away?.read, awayTracer = away?.tracer;
        await settle();
        const m0 = R.stats.misses, c0 = B.stats.cracks;
        c._tracerN = { 556: 0 };
        fire(c, 'rifle', at(c, p.x + 1.1, p.z));
        past = B.pool.find((q) => q.id === n0 + 2);
        const id = past?.id;
        for (let k = 0; k < 20 && past?.live && past.id === id; k++) {
          await api._step(1, 1 / 120);
          if (past.live && past.id === id && past.flown > S.minLen + 0.3 && !len) { len = B.streakLen(past); const m = new THREE.Matrix4(), s = new THREE.Vector3(); B.mesh.getMatrixAt(past.i, m); m.decompose(new THREE.Vector3(), new THREE.Quaternion(), s); wide = s.x; }
        }
        await settle();
        const mk = R.view().marks.find((m) => m.by === c.id);
        // Where he is on screen from the player, measured on its own.
        _v.set(c.x, 1.2, c.z).project(g.camera); const sx = _v.x, sy = _v.y; _v.set(p.x, 1.2, p.z).project(g.camera);
        const want = ((Math.atan2(-(sy - _v.y) * innerHeight, (sx - _v.x) * innerWidth) * 180) / Math.PI + 360) % 360;
        const dDeg = mk ? Math.abs(((mk.screenDeg - want + 540) % 360) - 180) : 999;
        const row = past?.row;
        const out = { awayRead, awayTracer, read: past?.read, len: r2(len), own: r2(Math.min(row?.tracerLen ?? 0, (past?.sp0 ?? 0) * BL.streakT)), wide: r2(wide), rowW: row?.tracerW, misses: R.stats.misses - m0, cracks: B.stats.cracks - c0, mk, want: Math.round(want), dDeg: Math.round(dDeg), flashes: flashes.map(r2) };
        const ok = awayRead === false && awayTracer === false && past?.read === true && len >= S.minLen - 0.05 && len <= S.maxLen + 0.05
          && wide >= row.tracerW * S.wMul * 0.95 && out.misses >= 1 && out.cracks >= 1 && mk && mk.kind === 'miss'
          && Math.hypot(mk.from.x - c.x, mk.from.z - c.z) < 1 && dDeg <= 12 && flashes.length >= 2 && flashes[1] >= flashes[0] * S.flashMul * 0.99;
        return ok ? true : JSON.stringify(out);
      } finally { fx.flash = orig; }
    });

    await check('shot read: a round that slaps into the wall in front of you kicks up dust there and still marks where it came from; a hit on you marks him in red', async () => {
      await stage();
      const p = g.player, c = shooter(), M = g.materials;
      await api._step(2);
      const wall = M.build('block_wall', L.x, L.z + 4, 'x', 3);
      const hp0 = p.hp, god = g.godMode, grace = p.graceT;
      try {
        const u0 = R.stats.puffs;
        fire(c, 'pistol', at(c, p.x, p.z));
        await settle();
        const puffs = R.stats.puffs - u0, mk1 = R.view().marks.find((m) => m.by === c.id);
        M.unbuild(wall);
        R.clear();
        g.godMode = false; p.graceT = 0; p.hp = Math.max(p.hp, 90);
        const h0 = R.stats.hits;
        fire(c, 'pistol', at(c, p.x, p.z));
        await settle();
        const hits = R.stats.hits - h0, mk2 = R.view().marks.find((m) => m.by === c.id);
        const ok = puffs >= 1 && mk1?.kind === 'miss' && hits >= 1 && mk2?.kind === 'hit';
        return ok ? true : JSON.stringify({ puffs, mk1, hits, mk2, hurt: r2(hp0 - p.hp) });
      } finally {
        M.unbuild(wall); // (a no-op when it is already down)
        g.godMode = god; p.graceT = grace; p.hp = Math.max(p.hp, hp0);
        R.clear();
      }
    });
  } finally {
    for (const c of cast) if (g.chars.includes(c)) g.removeChar(c);
  }
}
