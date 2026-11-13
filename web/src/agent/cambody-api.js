// THE BODY VIEWS' checks (docs/design/WEB_CAMERA_BODY.md; rows data/camera.js CAMERA.body; the rule systems/camrig.js):
// THIRD (behind you) and SHOULDER (over one shoulder). Every check puts the view back to TOPDOWN when it is done: the
// rest of the battery runs on the top-down view.
import * as THREE from 'three';
import { CAMERA, validateCameraBody, SKY_DOME, validateSkyDome } from '../data/camera.js';
import { RAY_SIGHT } from '../engine/collision.js';
import { nearFor } from '../engine/depthlayers.js';

const r2 = (v) => Math.round(v * 100) / 100;
const _v = new THREE.Vector3();

export async function camBodyChecks({ g, api, C, check }) {
  const R = g.cam, P = () => g.player, I = g.input;
  const back = async () => { R.setView('TOPDOWN', true); R.override = null; R.shoulder = 1; I.mouse.right = false; g.updateCamera(10); await api._step(2); };
  // the camera as placed for one orbit and pitch (deg): where it is, and whether it broke a rule
  const probe = (b, orbit, pitch, ceil) => {
    R.orbit = (orbit * Math.PI) / 180; R.pitch = (pitch * Math.PI) / 180;
    g.updateCamera(0.5); g.updateCamera(0.5);
    const p = P(), c = g.camera.position, B = CAMERA.body, Bd = R.body(), feet = p.gy ?? 0;
    const up = p.storey || p.ug ? feet - (p.storey?.y0 ?? 0) : 0;
    const inside = !b || (c.x > b.minX && c.x < b.maxX && c.z > b.minZ && c.z < b.maxZ);
    const los = g.statics.lineOfSight(R.pivot.x, R.pivot.z, c.x, c.z, RAY_SIGHT, up + Bd.eye - 0.25);
    const yOk = c.y >= feet + B.floor - 0.02 && (!ceil || c.y <= feet + B.ceil - B.ceilGap + 0.02);
    return { inside, los, yOk, boom: R.boom, y: r2(c.y - feet) };
  };

  await check('camera body: the rows validate; the views are TOPDOWN, ANGLED, ISO, CHASE, THIRD, SHOULDER and the game starts on TOPDOWN; a bad pitch range, a boom shorter than its hard minimum and a ceiling under head height are each caught', () => {
    const a = validateCameraBody(), B = CAMERA.body, keep = { p: B.pitch, d: B.THIRD.dMin, c: B.ceil };
    B.pitch = [20, -20]; const b = validateCameraBody(); B.pitch = keep.p;
    B.THIRD.dMin = 0.1; const c = validateCameraBody(); B.THIRD.dMin = keep.d;
    B.ceil = 1.2; const d = validateCameraBody(); B.ceil = keep.c;
    const ok = a.length === 0 && b.length >= 1 && c.length >= 1 && d.length >= 1 && CAMERA.views.join() === 'TOPDOWN,ANGLED,ISO,CHASE,THIRD,SHOULDER' && CAMERA.start === 'TOPDOWN' && validateCameraBody().length === 0;
    return ok || { a, b, c, d, views: CAMERA.views, start: CAMERA.start };
  });

  await check('camera body: THIRD and SHOULDER indoors never leave the room - in a Rust Haven shop and on floor 4 of the six-storey tower, at 12 turns x 3 pitches each, the camera is inside the building, nothing stands between your head and it, and it is under the ceiling and over the floor; in the open the boom runs its full length', async () => {
    await C('start'); g.godMode = true;
    const bad = [], seen = { n: 0, shortest: 9, full: 0 };
    try {
      const shop = g.world.buildings.find((b) => b.enterable && b.programme === 'clinic'), S = g.storeys.list.slice().sort((a, b) => b.Y.length - a.Y.length)[0];
      const spots = [{ name: 'clinic', b: shop, x: (shop.minX + shop.maxX) / 2, z: (shop.minZ + shop.maxZ) / 2 }, { name: 'tower floor 4', b: S.b, x: (S.b.minX + S.b.maxX) / 2, z: (S.b.minZ + S.b.maxZ) / 2, floor: 3 }];
      for (const view of ['THIRD', 'SHOULDER']) for (const s of spots) {
        await C('teleport', s.floor ? { x: s.x, z: s.z, floor: s.floor } : { x: s.x, z: s.z }); await api._step(4);
        R.setView(view, true);
        for (let o = 0; o < 360; o += 30) for (const pt of [-35, -5, 30]) {
          const q = probe(s.b, o, pt, true); seen.n++; seen.shortest = Math.min(seen.shortest, q.boom);
          if (!q.inside || !q.los || !q.yOk) bad.push({ view, at: s.name, o, pt, ...q });
        }
      }
      // in the open: nothing behind you, so the boom is as long as you set it
      await C('teleport', { x: 0, z: -40 }); await api._step(4);
      R.setView('THIRD', true);
      let far = 0; for (let o = 0; o < 360; o += 45) { const q = probe(null, o, -10, false); far = Math.max(far, q.boom); if (!q.yOk) bad.push({ open: o, ...q }); }
      seen.full = far;
      const ok = !bad.length && seen.n === 144 && seen.shortest < 2 && Math.abs(far - R.mem.THIRD.foot) < 0.3;
      return ok || JSON.stringify({ bad: bad.slice(0, 4), nBad: bad.length, n: seen.n, shortest: r2(seen.shortest), full: r2(far), want: R.mem.THIRD.foot });
    } finally { g.godMode = false; await back(); }
  });

  await check('camera body: you walk and aim the way the view faces - in SHOULDER turned east, W walks you east and the aim point lies straight ahead with the reticle on screen; somebody standing 6 m in front of you takes the aim point, and looking down brings it in to the ground you look at; the mouse is wanted while the hands are on the game and let go the moment they are not; holding aim pulls the boom in; the other shoulder puts the camera on the other side; on TOPDOWN upstairs the floor shown is the floor you stand on and the roof is lifted, in THIRD the building is drawn whole and the camera is under the deck above; at the wheel THIRD reads as CHASE; back on TOPDOWN the old camera is exactly as it was', async () => {
    await C('start'); g.godMode = true;
    let car = null, dummy = null; const moved = [];
    try {
      await C('teleport', { x: 0, z: -40 }); await api._step(4);
      g.updateCamera(10);
      const before = { th: r2(R.theta), yaw: r2(R.yaw), far: g.camera.far, near: r2(g.camera.near), viewR: Math.round(g.viewR) };
      R.setView('SHOULDER', true);
      R.orbit = -Math.PI / 2; R.pitch = -0.1; // the view faces east (+x)
      g.updateCamera(0.5); await api._step(2);
      const p = P(), x0 = p.x, z0 = p.z;
      I.keyDown('KeyW'); await api._step(40); I.keyUp('KeyW'); await api._step(2);
      const dx = p.x - x0, dz = p.z - z0, walked = Math.hypot(dx, dz), east = dx / Math.max(1e-6, walked);
      const ax = g.aim.x - p.x, az = g.aim.z - p.z, ahead = ax / Math.max(1e-6, Math.hypot(ax, az));
      // somebody 6 m in front of you: the aim point lands on them (not on the wall 30 m behind them); looking down
      // at the ground brings it in to where you look; the mouse is wanted only while the hands are on the game
      for (const c of g.chars) if (c !== p && Math.hypot(c.x - p.x, c.z - p.z) < 40) { moved.push([c, c.x, c.z]); c.z += 80; } // nobody else on the line: everyone near is stood aside, and put back when this is done
      dummy = g.addChar({ x: p.x + 6, z: p.z, faction: 'drifter', weapon: null, hp: 400, name: 'Aim target (selftest)', flag: 'US' }); dummy.hold = true;
      await api._step(2);
      const onThem = Math.hypot(g.aim.x - dummy.x, g.aim.z - dummy.z);
      g.removeChar(dummy); dummy = null;
      R.pitch = -0.6; await api._step(2);
      const lookDown = Math.hypot(g.aim.x - p.x, g.aim.z - p.z), wantDown = CAMERA.body.SHOULDER.eye / Math.tan(0.6);
      R.pitch = -0.1; await api._step(2);
      for (const [c, x, z] of moved) { c.x = x; c.z = z; } moved.length = 0;
      // the mouse: wanted while the hands are on the game; a blackout (a real frame of one) lets it go; so does the crew panel's flag
      const wanted = I.wantLock === true, bo = g.needs.blackout; g.needs.blackout = 1; await api._step(1); const letGo = I.wantLock === false; g.needs.blackout = bo ?? 0;
      const cu = g.crewUI.open; g.crewUI.open = true; await api._step(1); const letGo2 = I.wantLock === false; g.crewUI.open = cu; await api._step(2);
      const cr = g.crewUI.radial; g.crewUI.radial = true; await api._step(1); const letGo3 = I.wantLock === false; g.crewUI.radial = cr; await api._step(2);
      const back2 = I.wantLock === true; I.mouse.lockDeniedT = 0;
      const ret = { x: R.reticle.x, y: R.reticle.y }, onScreen = ret.x > 0 && ret.x < innerWidth && ret.y > 0 && ret.y < innerHeight;
      const side1 = (R.pos.x - p.x) * 0 + (R.pos.z - p.z); // facing east, your right is south (+z)
      R.shoulder = -1; g.updateCamera(0.5); g.updateCamera(0.5);
      const side2 = R.pos.z - p.z;
      R.shoulder = 1; g.updateCamera(0.5); g.updateCamera(0.5);
      const loose = R.boom;
      I.mouse.right = true; R.aiming = true; g.updateCamera(0.5); g.updateCamera(0.5);
      const tight = R.boom;
      I.mouse.right = false; R.aiming = false;
      // the floor shown is the floor you stand on (the tower, floor 3), and the camera is under the next deck
      const S = g.storeys.list.slice().sort((a, b) => b.Y.length - a.Y.length)[0];
      await C('teleport', { x: (S.b.minX + S.b.maxX) / 2, z: (S.b.minZ + S.b.maxZ) / 2, floor: 2 }); await api._step(6);
      // TOPDOWN there: the floor shown is the floor you stand on (the floors above are lifted off)
      R.setView('TOPDOWN', true); g.updateInterior(); await api._step(2);
      const lvl = g.storeys.levelOf(S, P().gy ?? 0), shown = g.storeys.viewS === S ? g.storeys.viewL : -9, liftedTop = g.roofLifted === g.insideBuilding && !!g.insideBuilding;
      // THIRD there: the building is drawn whole (the deck above is your ceiling) and the camera stays under it
      R.setView('THIRD', true); R.pitch = 0.5; g.updateCamera(0.5); await api._step(2);
      const whole = g.storeys.viewS === null && (g.roofLifted ?? null) === null;
      const under = g.camera.position.y < (S.Y[3] ?? 1e9) - 0.1 && g.camera.position.y > S.Y[2];
      // at the wheel
      await C('teleport', { x: 0, z: -40 }); await api._step(3);
      R.setView('THIRD', true);
      for (const v of [...g.vehicles]) if (Math.hypot(v.x - 6, v.z + 40) < 5) g.vehiclesSys.remove(v); // nothing parked on the spot (a run before this one)
      const n0 = g.vehicles.length; await C('spawnVehicle', { type: 'sedan', x: 6, z: -40 });
      car = g.vehicles.length > n0 ? g.vehicles[g.vehicles.length - 1] : null;
      if (car) await C('enterVehicle', { id: car.id, force: true });
      await api._step(4);
      const drive = { eff: R.eff(), body: !!R.body(), in: !!P().inVehicle };
      if (P().inVehicle) g.exitVehicle(true);
      await api._step(3);
      await back(); await C('teleport', { x: 0, z: -40 }); await api._step(3); g.updateCamera(10);
      const after = { th: r2(R.theta), yaw: r2(R.yaw), far: g.camera.far, near: r2(g.camera.near), viewR: Math.round(g.viewR) };
      const ok = walked > 1.5 && east > 0.95 && ahead > 0.99 && onThem < 0.5 && Math.abs(lookDown - wantDown) < 0.4 && wanted && letGo && letGo2 && letGo3 && back2 && onScreen && side1 > 0.2 && side2 < -0.2 && tight < loose - 0.3
        && shown === lvl && lvl === 2 && liftedTop && whole && under && drive.in && drive.eff === 'CHASE' && !drive.body
        && after.th === before.th && after.yaw === before.yaw && after.far === before.far && Math.abs(after.near - before.near) < 0.02 && Math.abs(after.viewR - before.viewR) <= 1 && before.far === CAMERA.far && Math.abs(before.near - nearFor(R.D)) < 0.05;
      return ok || JSON.stringify({ onThem: r2(onThem), lookDown: r2(lookDown), wantDown: r2(wantDown), wanted, letGo, letGo2, letGo3, back2, walked: r2(walked), east: r2(east), ahead: r2(ahead), onScreen, side1: r2(side1), side2: r2(side2), loose: r2(loose), tight: r2(tight), lvl, shown, liftedTop, whole, under, drive, before, after });
    } finally { g.godMode = false; if (P().inVehicle) g.exitVehicle(true); if (car) g.vehiclesSys.remove(car); if (dummy) g.removeChar(dummy); for (const [c, x, z] of moved) { c.x = x; c.z = z; } await back(); }
  });

  await check('sky dome: the rows validate (a purple zenith and a dome past the far plane are each caught); on TOPDOWN there is no dome; in THIRD there is one, centred on the lens, its horizon the haze colour and its zenith another colour by day and near black by night; below the street there is none; back on TOPDOWN it is gone', async () => {
    const a = validateSkyDome(), keep = { day: SKY_DOME.day, r: SKY_DOME.radius };
    SKY_DOME.day = '#8040c0'; const b = validateSkyDome(); SKY_DOME.day = keep.day;
    SKY_DOME.radius = 5000; const c = validateSkyDome(); SKY_DOME.radius = keep.r;
    await C('start');
    const SD = g.skyDome, hour0 = g.sky.time, wx0 = g.sky.weatherKey ?? 'CLEAR';
    try {
      await C('setWeather', { key: 'CLEAR', instant: true }); // dust or ash pull the zenith all the way to the haze: the check is of a clear sky
      await C('teleport', { x: 0, z: -40 }); await C('setTime', { hour: 13 }); await api._step(4);
      g.updateCamera(0.5); const top = SD.view().on;
      R.setView('THIRD', true); g.updateCamera(0.5); await api._step(3);
      const day = SD.view(), cam = g.camera.position, at = Math.hypot(SD.mesh.position.x - cam.x, SD.mesh.position.y - cam.y, SD.mesh.position.z - cam.z);
      const fog = `#${g.sky.fog.color.getHexString()}`;
      await C('setTime', { hour: 0.5 }); await api._step(30); g.updateCamera(0.5);
      const night = SD.view(), lum = (h) => { const n = parseInt(h.slice(1), 16); return ((n >> 16) + ((n >> 8) & 255) + (n & 255)) / 3; };
      const p = P(), ug = p.ug; p.ug = { fake: true }; SD.update(); const under = SD.view().on; p.ug = ug;
      await back(); const gone = SD.view().on;
      const ok = a.length === 0 && b.length === 1 && c.length === 1 && validateSkyDome().length === 0 && top === false && day.on === true && at < 0.01 && day.horizon === fog && day.zenith !== day.horizon
        && lum(night.zenith) < 40 && lum(day.zenith) > lum(night.zenith) + 40 && under === false && gone === false;
      return ok || JSON.stringify({ a, b, c, top, day, at, fog, night, under, gone });
    } finally { await C('setTime', { hour: hour0 }); await C('setWeather', { key: wx0, instant: true }); await back(); }
  });

  await check('camera turn: on TOPDOWN and ANGLED holding ] turns the view round you (about 110 degrees a second) and [ turns it back; W still walks up the screen whatever way it is turned; Home snaps it north-up; ISO still turns in 90 degree steps and Home squares it', async () => {
    await C('start'); g.godMode = true;
    const deg = Math.PI / 180, p = P();
    const yawOf = () => Math.round(R.yaw / deg);
    const upScreen = async () => { const q = (c) => { _v.set(c.x, 0, c.z).project(g.camera); return { x: _v.x, y: _v.y }; }; g.updateCamera(0); const a = q(p); I.keyDown('KeyW'); await api._step(36); I.keyUp('KeyW'); g.updateCamera(0); await api._step(2); const b = q(p); return { up: b.y - a.y, side: Math.abs(b.x - a.x) }; };
    try {
      await C('teleport', { x: 0, z: -40 }); await api._step(4);
      const out = {};
      for (const view of ['TOPDOWN', 'ANGLED']) {
        R.setView(view, true); R.spin = 0; g.updateCamera(10);
        const y0 = yawOf();
        I.keyDown('BracketRight'); await api._step(60); I.keyUp('BracketRight'); g.updateCamera(10);
        const y1 = yawOf();
        // the look point trails you by design, so walk long enough that the camera's own lag is not the measure
        g.updateCamera(10); const w = await upScreen();
        I.keyDown('BracketLeft'); await api._step(30); I.keyUp('BracketLeft'); g.updateCamera(10);
        const y2 = yawOf();
        I.keyDown('Home'); await api._step(2); I.keyUp('Home'); g.updateCamera(10);
        out[view] = { y0, y1, y2, north: yawOf(), w };
      }
      R.setView('ISO', true); R.isoYaw = 0; g.updateCamera(10);
      I.keyDown('BracketRight'); await api._step(2); I.keyUp('BracketRight'); g.updateCamera(10);
      const iso1 = yawOf();
      I.keyDown('Home'); await api._step(2); I.keyUp('Home'); g.updateCamera(10);
      const iso0 = yawOf();
      const ok = ['TOPDOWN', 'ANGLED'].every((v) => { const o = out[v]; return o.y0 === 0 && Math.abs(o.y1 - CAMERA.turn) < 14 && Math.abs(o.y2 - CAMERA.turn / 2) < 14 && o.north === 0; })
        && out.ANGLED.w.up > 0.03 && out.ANGLED.w.side < out.ANGLED.w.up * 0.5 && iso1 === 90 && iso0 === 0;
      return ok || JSON.stringify({ out, iso1, iso0 });
    } finally { g.godMode = false; R.spin = 0; R.isoYaw = 0; I.keyUp('KeyW'); await back(); }
  });
}
