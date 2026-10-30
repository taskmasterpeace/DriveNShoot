// FEEL (docs/design/WEB_FEEL.md): driving and gunplay measured the way a player feels them. The driving half runs each
// vehicle row through the real driving model (Vehicles.drive) on a sandbox car at a fixed 60 Hz: 0-60 mph, top speed,
// steering delay, turn radius at speed, a handbrake swing and how long the slide takes to catch, reverse, a slalom. The
// combat half stands a still Dustwolf at 5/15/30 m and fires the real gun at it, then turns an angry one loose on you
// (god mode) and times its first shot, its hit rate, and how many of its shots came from on screen.
// args: rows (comma list), combat (default true), seconds (enemy duel, default 12).
import { VEHICLES } from '../systems/vehicles.js';
import { WEAPONS } from '../systems/combat.js';

const DT = 1 / 60, MPH60 = 26.82;

function probe(g, type) {
  const v = g.vehiclesSys.spawn(type, 9000, 9000, 0);
  v.driver = { id: 'feel-probe' }; v.feelProbe = true; v.ai = null;
  return v;
}
const fwdOf = (v) => v.vx * Math.sin(v.h) + v.vz * Math.cos(v.h);
const sideOf = (v) => v.vx * Math.cos(v.h) - v.vz * Math.sin(v.h);
function run(g, v, secs, ctl, each) {
  for (let t = 0; t < secs; t += DT) {
    v.throttle = ctl.throttle ?? 0; v.steer = ctl.steer ?? 0; v.handbrake = !!ctl.handbrake;
    g.vehiclesSys.drive(v, DT);
    if (each && each(t + DT) === true) return t + DT;
  }
  return null;
}
function reset(v, speed = 0) { v.x = 9000; v.z = 9000; v.h = 0; v.av = 0; v.vx = 0; v.vz = speed; v.steerIn = 0; }

function driveRow(g, type) {
  const v = probe(g, type), r = {};
  reset(v); r.t060 = run(g, v, 20, { throttle: 1 }, () => fwdOf(v) >= MPH60);
  reset(v); run(g, v, 40, { throttle: 1 }); r.top = fwdOf(v);
  // Steering delay: at 15 m/s, full lock; the time until the turn rate reaches 90% of where it settles.
  const s0 = Math.min(15, r.top * 0.8);
  reset(v, s0); run(g, v, 2, { throttle: 0.4, steer: 1 }); const avSet = Math.abs(v.av);
  r.turnRadius = +(Math.abs(fwdOf(v)) / Math.max(0.01, avSet)).toFixed(1);
  reset(v, s0); r.steerDelay = run(g, v, 2, { throttle: 0.4, steer: 1 }, () => Math.abs(v.av) >= avSet * 0.9);
  // Handbrake: at 20 m/s, full lock + handbrake for 0.8 s: how far it swings; then let go and count to a caught slide.
  const s1 = Math.min(20, r.top * 0.9); let maxSide = 0;
  reset(v, s1); run(g, v, 0.8, { throttle: 0, steer: 1, handbrake: true }, () => { maxSide = Math.max(maxSide, Math.abs(sideOf(v))); });
  r.hbSwingDeg = Math.round(Math.abs(v.h) * 180 / Math.PI); r.hbSlide = +maxSide.toFixed(1);
  r.catchT = run(g, v, 4, { throttle: 0.6, steer: 0 }, () => Math.abs(sideOf(v)) < 1);
  // Reverse: from rest, full reverse: its top and the time to 5 m/s.
  reset(v); r.rev5 = run(g, v, 8, { throttle: -1 }, () => fwdOf(v) <= -5); run(g, v, 8, { throttle: -1 }); r.revTop = -fwdOf(v);
  // Slalom: full throttle, the wheel flicked left/right every 0.6 s for 6 s: the speed kept and the worst slide.
  reset(v, s0); let peak = 0;
  run(g, v, 6, { throttle: 1, steer: 1 }, (t) => { v.steer = Math.floor(t / 0.6) % 2 ? -1 : 1; peak = Math.max(peak, Math.abs(sideOf(v))); });
  r.slalomSpeed = +Math.abs(fwdOf(v)).toFixed(1); r.slalomSlide = +peak.toFixed(1);
  g.vehiclesSys.remove(v);
  for (const k of ['t060', 'steerDelay', 'catchT', 'rev5']) r[k] = r[k] === null ? null : +r[k].toFixed(2);
  r.top = +r.top.toFixed(1); r.revTop = +r.revTop.toFixed(1);
  return r;
}

export default async function (DL, game, args = {}) {
  const g = game, out = { driving: {}, combat: {} };
  await DL.start(); await DL.god({ on: true });
  await DL.setTime({ hour: 12 }); await DL.setWeather({ key: 'CLEAR', instant: true });
  const rows = String(args.rows ?? 'interceptor,sedan,buggy,pickup,van,patrol,rv,rig,apc,bike,atv').split(',');
  for (const t of rows) if (VEHICLES[t] && !VEHICLES[t].boat) out.driving[t] = driveRow(g, t);
  if (args.combat === false || args.combat === 'false') return out;

  // ---- combat: a still target at 5/15/30 m, the revolver and the SMG -----------------------------------------------
  g.zombies.enabled = false; g.raiderTimer = 1e9;
  const AT = { x: 0, z: -70 };
  await DL.teleport(AT);
  for (const c of [...g.chars]) if (c !== g.player && Math.hypot(c.x - AT.x, c.z - AT.z) < 90) g.removeChar(c);
  const fireLog = []; const realFire = g.combat.fire.bind(g.combat);
  g.combat.fire = (ch, ...a) => { fireLog.push({ who: ch, t: g.time }); return realFire(ch, ...a); };
  try {
    for (const gun of ['pistol', 'smg']) {
      await DL.give({ weapon: gun, [WEAPONS[gun].ammo]: 400 }); await DL.equip({ weapon: gun });
      const row = WEAPONS[gun], res = { rate: row.rate, reload: row.reload, mag: row.mag };
      for (const d of [5, 15, 30]) {
        const c = g.spawnRaider(AT.x, AT.z - d, Math.random, 'pistol');
        let hits = 0; const N = 16;
        for (let i = 0; i < N; i++) {
          c.x = AT.x; c.z = AT.z - d; c.state = 'idle'; c.target = null; c.grudge = null; c.hp = c.maxHp ?? 100; c.alive = true;
          g.player.x = AT.x; g.player.z = AT.z;
          const hp0 = c.hp; await DL.fire({ x: c.x, z: c.z }); await DL.step({ seconds: 0.25 });
          if (c.hp < hp0 || !c.alive) hits++;
          if (!c.alive) break;
        }
        res[`hit${d}m`] = +(hits / N).toFixed(2);
        g.removeChar(c);
      }
      out.combat[gun] = res;
    }
    // ---- the enemy: an angry Dustwolf at 20 m; you stand (god mode) --------------------------------------------------
    const secs = Number(args.seconds ?? 12);
    const foe = g.spawnRaider(AT.x + 6, AT.z - 19, Math.random, 'pistol');
    foe.grudge = g.player; foe.target = g.player; foe.state = 'fight';
    const t0 = g.time, n0 = fireLog.length, seq = g.eventSeq;
    let onScreen = 0;
    for (let t = 0; t < secs; t += 0.25) { await DL.step({ seconds: 0.25 }); g.player.x = AT.x; g.player.z = AT.z; }
    const theirs = fireLog.slice(n0).filter((f) => f.who === foe);
    for (const f of theirs) if (Math.hypot(foe.x - g.player.x, foe.z - g.player.z) < (g.viewR ?? 40) * 0.8) onScreen++;
    const hurts = g.events.filter((e) => e.seq > seq && e.type === 'hurt' && e.by === foe.id).length;
    out.combat.enemy = {
      firstShot: theirs.length ? +(theirs[0].t - t0).toFixed(2) : null, shots: theirs.length, hits: hurts,
      hitRate: theirs.length ? +(hurts / theirs.length).toFixed(2) : 0, onScreenShare: theirs.length ? +(onScreen / theirs.length).toFixed(2) : 0,
      tracers: !!g.ballistics?.on,
    };
    g.removeChar(foe);
  } finally { g.combat.fire = realFire; }
  return out;
}
