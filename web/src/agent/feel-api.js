// FEEL's command and checks (data/feel.js, docs/design/WEB_FEEL.md): driving and gunplay measured the way a player feels
// them, through the real code. Driving runs each land row on a sandbox car through Vehicles.drive at a fixed 60 Hz (no
// world, so a building can't spoil a number); the camera's lead and the gun numbers run in the real game on a clear
// strip of the island's flats. `node tools/feel.mjs` turns this into docs/renders/web/feel/report.md with frame strips.
import { FEEL_BANDS as FB, validateFeel } from '../data/feel.js';
import { VEHICLES, DRIVING } from '../systems/vehicles.js';
import { WEAPONS } from '../systems/combat.js';
import { RAY_BULLET } from '../engine/collision.js';

const DT = 1 / 60, MPH60 = 26.82, LAND = ['interceptor', 'sedan', 'buggy', 'pickup', 'van', 'patrol', 'rv', 'rig', 'apc', 'bike', 'atv'];
const r2 = (v) => (v === null ? null : +(+v).toFixed(2));
const inBand = (v, b) => v !== null && v !== undefined && (b[0] === null || v >= b[0]) && (b[1] === null || v <= b[1]);
const fwdOf = (v) => v.vx * Math.sin(v.h) + v.vz * Math.cos(v.h);
const sideOf = (v) => v.vx * Math.cos(v.h) - v.vz * Math.sin(v.h);

// A straight clear line on the island's flats (heading +z), no box within 4 m, dry (as shotread-api.js).
export function feelStrip(g, len = 120) {
  const S = g.statics;
  for (let x = -420; x <= 420; x += 37) for (let z = 280; z + len <= 440; z += 23) {
    let ok = true;
    for (const b of S.boxes) if (b.maxX > x - 4 && b.minX < x + 4 && b.maxZ > z - 4 && b.minZ < z + len + 4) { ok = false; break; }
    if (ok) { S.raycast(x, z, 0, 1, len, RAY_BULLET, -1); if (S.hit.box) ok = false; }
    if (ok && g.water.depthAt(x, z) <= 0 && g.water.depthAt(x, z + len) <= 0) return { x, z };
  }
  return null;
}

// ---- driving: one row on a sandbox car ----------------------------------------------------------------------------------
function run(g, v, secs, ctl, each) {
  for (let t = 0; t < secs; t += DT) {
    v.throttle = ctl.throttle ?? 0; v.steer = ctl.steer ?? 0; v.handbrake = !!ctl.handbrake;
    g.vehiclesSys.drive(v, DT);
    if (each && each(t + DT) === true) return t + DT;
  }
  return null;
}
function reset(v, speed = 0, grip = 1) { v.x = 9000; v.z = 9000; v.h = 0; v.av = 0; v.vx = 0; v.vz = speed; v.steerIn = 0; v.roadGrip = grip; }

export function feelDriveRow(g, type, grip = 1) {
  const v = g.vehiclesSys.spawn(type, 9000, 9000, 0), P = FB.probe, r = { type };
  v.driver = { id: 'feel-probe' }; v.feelProbe = true; v.ai = null;
  try {
    reset(v, 0, grip); r.t060 = run(g, v, 20, { throttle: 1 }, () => fwdOf(v) >= MPH60);
    reset(v, 0, grip); run(g, v, 40, { throttle: 1 }); r.top = fwdOf(v);
    // Steady full-lock corner from P.corner m/s: the turn rate it settles on, the radius, the slip; then the delay.
    const s0 = Math.min(P.corner, r.top * 0.8);
    let slip = 0;
    reset(v, s0, grip); run(g, v, 2, { throttle: 0.4, steer: 1 }, (t) => { if (t > 1.2) slip = Math.max(slip, Math.abs(sideOf(v))); });
    const avSet = Math.abs(v.av);
    r.turnRadius = Math.hypot(v.vx, v.vz) / Math.max(0.01, avSet); r.cornerSlip = slip;
    reset(v, s0, grip); r.steerDelay = run(g, v, 2, { throttle: 0.4, steer: 1 }, () => Math.abs(v.av) >= avSet * 0.9);
    // Handbrake: full lock + handbrake from P.handbrake m/s for P.hbHold s; then let go (wheel straight, a little gas).
    const s1 = Math.min(P.handbrake, r.top * 0.9); let hb = 0;
    reset(v, s1, grip); run(g, v, P.hbHold, { steer: 1, handbrake: true }, () => { hb = Math.max(hb, Math.abs(sideOf(v))); });
    r.hbSwing = Math.abs(v.h) * 180 / Math.PI; r.hbSlide = hb; r.hbSpeed = Math.hypot(v.vx, v.vz);
    r.catchT = Math.abs(sideOf(v)) < 1 ? 0 : run(g, v, 4, { throttle: 0.6 }, () => Math.abs(sideOf(v)) < 1);
    // Reverse from rest: the time to 5 m/s and its top.
    reset(v, 0, grip); r.rev5 = run(g, v, 8, { throttle: -1 }, () => fwdOf(v) <= -5); run(g, v, 8, { throttle: -1 }); r.revTop = -fwdOf(v);
    // Slalom: full throttle, the wheel flicked every 0.6 s for 6 s: the speed it holds, the worst slip.
    reset(v, s0, grip); let pk = 0;
    run(g, v, 6, { throttle: 1, steer: 1 }, (t) => { v.steer = Math.floor(t / 0.6) % 2 ? -1 : 1; pk = Math.max(pk, Math.abs(sideOf(v))); });
    r.slalomSpeed = Math.abs(fwdOf(v)); r.slalomSlip = pk;
  } finally { g.vehiclesSys.remove(v); }
  for (const k of Object.keys(r)) if (typeof r[k] === 'number') r[k] = r2(r[k]);
  return r;
}

export function feelDrive(g, rows = LAND) {
  const out = {};
  for (const t of rows) if (VEHICLES[t] && !VEHICLES[t].boat) out[t] = feelDriveRow(g, t);
  // The surfaces (data/citygen.js grip rows) on the LAWMAN: how the slide and the catch change from blacktop to dirt.
  out.surfaces = {};
  for (const [k, grip] of Object.entries(FB.probe.surfaces)) { const r = feelDriveRow(g, 'interceptor', grip); out.surfaces[k] = { grip, cornerSlip: r.cornerSlip, hbSlide: r.hbSlide, hbSwing: r.hbSwing, catchT: r.catchT, turnRadius: r.turnRadius }; }
  return out;
}

// ---- the real game: the camera's lead at speed, the guns, the enemy -------------------------------------------------------
async function stageClear(g, api, C, L) {
  if (g.player.inVehicle) g.exitVehicle(true);
  g.zombies.enabled = false; g.raiderTimer = 1e9;
  for (const c of [...g.chars]) if (c !== g.player && !c.npc && Math.hypot(c.x - L.x, c.z - L.z - 40) < 90) g.removeChar(c);
  await C('teleport', { x: L.x, z: L.z }); await api._step(2);
}

export async function feelCamera(g, api, C) {
  const L = feelStrip(g, 140); if (!L) return { error: 'no clear strip' };
  await stageClear(g, api, C, L);
  const v = g.vehiclesSys.spawn('interceptor', L.x, L.z, 0);
  g.player.x = L.x; g.player.z = L.z; await C('enterVehicle', { id: v.id, force: true });
  const out = {};
  try {
    let t = 0;
    g.driveOverride = { throttle: 1, steer: 0 };
    for (; t < 3.5; t += 0.5) {
      await api._step(30);
      const sp = Math.hypot(v.vx, v.vz), fx = Math.sin(v.h), fz = Math.cos(v.h);
      out[`at${Math.round(sp)}`] = r2((g.camLook.x - v.x) * fx + (g.camLook.z - v.z) * fz); // m the view's centre leads the car
    }
  } finally { g.driveOverride = null; if (g.player.inVehicle) g.exitVehicle(true); g.vehiclesSys.remove(v); }
  return out;
}

export async function feelGuns(g, api, C, shots = 40) {
  const L = feelStrip(g, 40); if (!L) return { error: 'no clear strip' };
  await stageClear(g, api, C, L);
  const B = g.ballistics, settle = async () => { for (let k = 0; k < 120 && B?.inFlight?.(); k++) await api._step(1, DT); };
  const out = {}, realFire = g.combat.fire.bind(g.combat), log = [];
  g.combat.fire = (ch, ...a) => { log.push({ who: ch, t: g.time }); return realFire(ch, ...a); };
  try {
    for (const gun of ['pistol', 'smg']) {
      await C('give', { weapon: gun, [WEAPONS[gun].ammo]: shots * 4 }); await C('equip', { weapon: gun });
      const row = WEAPONS[gun], res = { rate: row.rate, reload: row.reload, mag: row.mag };
      for (const d of [5, 15, 30]) {
        const c = g.spawnRaider(L.x, L.z + d, Math.random, 'pistol'); let hits = 0;
        for (let i = 0; i < shots; i++) {
          c.x = L.x; c.z = L.z + d; c.state = 'idle'; c.target = null; c.grudge = null; c.hp = 9999; c.alive = true;
          g.player.x = L.x; g.player.z = L.z; g.player.hp = g.player.maxHp ?? 100;
          await api._step(Math.ceil(row.rate * 60) + 1, DT); // a fresh trigger pull each round: rate, not bloom, decides
          const hp0 = c.hp; await C('fire', { x: c.x, z: c.z }); await settle();
          if (c.hp < hp0) hits++;
        }
        res[`hit${d}`] = r2(hits / shots);
        g.removeChar(c);
      }
      out[gun] = res;
    }
    // An angry Dustwolf at 20 m; you stand, topped up (not god: god mode swallows the hurt events this counts).
    await C('god', { on: false });
    const foe = g.spawnRaider(L.x + 6, L.z + 19, Math.random, 'pistol');
    foe.grudge = g.player; foe.target = g.player; foe.state = 'fight';
    const t0 = g.time, n0 = log.length, seq = g.eventSeq; let on = 0, n = 0;
    for (let t = 0; t < 12; t += 0.25) {
      await api._step(15, DT); g.player.x = L.x; g.player.z = L.z; g.player.hp = g.player.maxHp ?? 100;
      for (let k = n0 + n; k < log.length; k++) { n++; if (log[k].who === foe && Math.hypot(foe.x - g.player.x, foe.z - g.player.z) < (g.viewR ?? 40) * 0.8) on++; }
    }
    const theirs = log.slice(n0).filter((f) => f.who === foe);
    const hurts = g.events.filter((e) => e.seq > seq && e.type === 'hurt' && e.by === foe.id).length;
    out.enemy = { firstShot: theirs.length ? r2(theirs[0].t - t0) : null, shots: theirs.length, hits: hurts, hitRate: theirs.length ? r2(hurts / theirs.length) : 0, onScreen: theirs.length ? r2(on / theirs.length) : 0 };
    g.removeChar(foe);
  } finally { g.combat.fire = realFire; await C('god', { on: false }); }
  return out;
}

// Every measured number against its band (data/feel.js): the list of what is outside.
export function feelVerdict(m) {
  const out = [];
  const t = (k, v, b) => { if (b && !inBand(v, b)) out.push(`${k} ${v} not in [${b}]`); };
  if (m.drive) for (const [row, r] of Object.entries(m.drive)) {
    if (row === 'surfaces') continue;
    if (row === 'interceptor' || row === 'sedan') for (const k of Object.keys(FB.drive)) t(`${row}.${k}`, r[k], FB.drive[k]);
    t(`${row}.t060`, r.t060, FB.t060[row]);
  }
  if (m.guns) {
    for (const gk of ['pistol', 'smg']) for (const [k, b] of Object.entries(FB.gun[gk])) t(`${gk}.${k}`, m.guns[gk]?.[k], b);
    t('foe.firstShot', m.guns.enemy?.firstShot, FB.gun.foeFirst); t('foe.onScreen', m.guns.enemy?.onScreen, FB.gun.foeOnScreen);
  }
  return out;
}

export function feelCommands(api) {
  const g = api.g;
  return {
    feel: {
      group: 'script', budget: 900,
      desc: 'FEEL (docs/design/WEB_FEEL.md): measure driving and gunplay the way a player feels them, through the real code. part=drive: every land row on a sandbox car (0-60, top, turn radius, steering delay, corner slip, handbrake slide/swing/catch, reverse, slalom) plus blacktop/gravel/dirt on the LAWMAN; part=camera: how far the view leads a car at speed; part=guns: hit share at 5/15/30 m (revolver, SMG) and an angry raider\'s first shot, hit rate and on-screen share; part=all: everything. Returns the numbers, the bands (data/feel.js) and what is outside them. `node tools/feel.mjs` writes the report with frame strips.',
      args: { part: { type: 'string', default: 'drive', enum: ['drive', 'camera', 'guns', 'all'] }, rows: { type: 'string' }, shots: { type: 'number', default: 40 } },
      run: async ({ part, rows, shots }) => {
        const C = (cmd, a) => api.call(cmd, a), m = {};
        if (part === 'drive' || part === 'all') m.drive = feelDrive(g, rows ? String(rows).split(',') : LAND);
        if (part === 'camera' || part === 'all') m.camera = await feelCamera(g, api, C);
        if (part === 'guns' || part === 'all') m.guns = await feelGuns(g, api, C, Math.max(4, Math.min(200, shots)));
        return { ...m, rows: { steerRate: DRIVING.steerRate, steerReturn: DRIVING.steerReturn, slide: DRIVING.slide }, outside: feelVerdict(m), bands: FB };
      },
    },
  };
}

// ---- selftest: the tuned numbers hold their bands (only=feel) -----------------------------------------------------------
export async function feelChecks(ctx) {
  const { g, api, C, check } = ctx;
  await check('feel: the bands are well-formed rows', () => { const b = validateFeel(); return b.length ? `bad bands: ${b.join(', ')}` : true; });
  let D = null;
  const drive = () => (D ??= feelDrive(g, ['interceptor', 'sedan', 'buggy', 'pickup', 'patrol', 'bike', 'atv']));
  await check('feel: steering eases to the keys (a tap is a nudge, never a twitch)', () => {
    const bad = ['interceptor', 'sedan'].filter((k) => !inBand(drive()[k].steerDelay, FB.drive.steerDelay));
    return bad.length ? `steerDelay ${bad.map((k) => `${k} ${drive()[k].steerDelay}`).join(', ')} not in [${FB.drive.steerDelay}]` : true;
  });
  await check('feel: a corner has weight but no skate', () => {
    const bad = ['interceptor', 'sedan'].filter((k) => !inBand(drive()[k].cornerSlip, FB.drive.cornerSlip));
    return bad.length ? `cornerSlip ${bad.map((k) => `${k} ${drive()[k].cornerSlip}`).join(', ')} not in [${FB.drive.cornerSlip}]` : true;
  });
  await check('feel: the handbrake slides, swings and is caught', () => {
    const bad = [];
    for (const k of ['interceptor', 'sedan']) for (const m of ['hbSlide', 'hbSwing', 'catchT']) if (!inBand(drive()[k][m], FB.drive[m])) bad.push(`${k}.${m} ${drive()[k][m]} not in [${FB.drive[m]}]`);
    return bad.length ? bad.join('; ') : true;
  });
  await check('feel: dirt slides further than blacktop', () => { const s = drive().surfaces; return s.dirt.hbSlide > s.blacktop.hbSlide && s.dirt.catchT >= s.blacktop.catchT ? true : JSON.stringify(s); });
  await check('feel: 0-60 per row holds its band', () => {
    const bad = Object.entries(FB.t060).filter(([k, b]) => drive()[k] && !inBand(drive()[k].t060, b)).map(([k, b]) => `${k} ${drive()[k].t060} not in [${b}]`);
    return bad.length ? bad.join('; ') : true;
  });
  await check('feel: the revolver lands at 5 m and mostly at 15 m', async () => {
    const m = await feelGuns(g, api, C, 24); if (m.error) return m.error;
    const bad = []; for (const [k, b] of Object.entries(FB.gun.pistol)) if (!inBand(m.pistol[k], [b[0] - 0.1, b[1]])) bad.push(`pistol.${k} ${m.pistol[k]}`); // 24 rounds: a 0.1 allowance
    if (!inBand(m.enemy.firstShot, FB.gun.foeFirst)) bad.push(`foe first shot ${m.enemy.firstShot}`);
    return bad.length ? bad.join('; ') : true;
  });
}
