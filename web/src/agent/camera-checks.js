// The selftest's camera checks (docs/design/WEB_CAMERA.md §8): the wheel zooms in a car and on foot (Alt+wheel is the
// guns), getting out eases in and getting in eases out, every view is reachable, W is up the screen in a turned view,
// aim is not the walk, the cutaway shows you through a six-storey tower, viewR covers the frustum, the widest views stay
// under 150 draw calls, and the gun rides at the side. Run inside runSelfTest (agent/api.js) with its check() and
// command caller; every check returns true or a JSON diagnostic. The player acts through held keys and the wheel.
import * as THREE from 'three';
import { CAMERA, ZOOM } from '../data/camera.js';

export async function cameraChecks({ api, g, check, C, hush }) {
  const R = g.cam, I = g.input, deg = Math.PI / 180, r2 = (n) => Math.round(n * 100) / 100;
  const SPOT = { x: 250, z: 430 }; // the south-east flats (the walkable-vehicle checks' open desert)
  const step = (n) => api._step(n);
  const reset = () => {
    R.setView('TOPDOWN', true); R.override = null; R.isoYaw = 0; g.cutaway.on = true;
    for (const v of CAMERA.views) { R.mem[v].foot = CAMERA.foot.dStart; R.mem[v].drive = v === 'CHASE' ? CAMERA.view.CHASE.dStart : CAMERA.drive.dStart; }
  };
  const home = async () => {
    g.driveOverride = null; g.aimOverride = null;
    const v = g.player.inVehicle;
    if (v) { g.exitVehicle(true); g.vehiclesSys.remove(v); }
    await C('teleport', { x: SPOT.x, z: SPOT.z });
    reset(); g.updateCamera(10);
  };
  const hold = async (codes, seconds) => {
    codes = [].concat(codes);
    for (const k of codes) { I.down.add(k); I.pressed.add(k); }
    try { for (let f = 0; f < seconds * 60; f++) await step(1); } finally { for (const k of codes) I.down.delete(k); }
  };
  const tap = async (code) => { I.down.add(code); I.pressed.add(code); await step(1); I.down.delete(code); await step(1); };
  const notch = async (n, alt = false) => { for (let k = 0; k < Math.abs(n); k++) { if (alt) I.wheelAlt = Math.sign(n); else I.wheel = Math.sign(n); await step(1); } };
  const car = async () => {
    const v = g.vehiclesSys.spawn('sedan', g.player.x + 4, g.player.z, Math.PI, '#4a4a48');
    // The object itself, not its id: a staged car's id can repeat one the streamed world already uses.
    if (g.player.inVehicle) g.exitVehicle(true);
    g.enterVehicle(v); await step(1);
    if (g.player.inVehicle !== v) throw new Error(`could not get in at ${g.player.x.toFixed(1)},${g.player.z.toFixed(1)} (listed: ${g.vehicles.includes(v)})`);
    return v;
  };
  const thetaFor = (m, D) => { // gap §4.1
    const L = m === 'drive' ? CAMERA.drive : CAMERA.foot, A = CAMERA.view.ANGLED[m];
    const s = Math.max(0, Math.min(1, Math.log(D / L.dMin) / Math.log(L.dMax / L.dMin)));
    return A.thetaClose + (A.thetaFar - A.thetaClose) * s * s * (3 - 2 * s);
  };

  await check('camera: the wheel zooms - 3 notches in at the wheel and on foot = D / 1.15^3 (+-2%), out again; Alt+wheel cycles the gun, the plain wheel never does', async () => {
    await home();
    if (g.inv.weapons.length < 2) await C('give', { weapon: 'smg' });
    const out = {};
    const v = await car();
    try {
      const d0 = R.d; await notch(-3); const d1 = R.d; await notch(3);
      out.drive = { d0: r2(d0), d1: r2(d1), ratio: r2(d0 / d1), back: r2(R.d) };
    } finally { g.exitVehicle(true); g.vehiclesSys.remove(v); }
    const f0 = R.d; await notch(-3); const f1 = R.d; await notch(3);
    out.foot = { d0: r2(f0), d1: r2(f1), ratio: r2(f0 / f1), back: r2(R.d) };
    const gun0 = g.inv.current; await notch(1); const plain = g.inv.current; await notch(1, true); const alt = g.inv.current;
    out.guns = { gun0, plain, alt };
    const want = Math.pow(CAMERA.wheelStep, 3), near = (r) => Math.abs(r / want - 1) < 0.02;
    const zOk = near(out.drive.ratio) && near(out.foot.ratio) && Math.abs(out.drive.back - out.drive.d0) < 0.5 && Math.abs(out.foot.back - out.foot.d0) < 0.5;
    const ok = zOk && plain === gun0 && alt !== gun0;
    if (alt !== gun0) g.switchWeapon(gun0);
    return ok ? true : JSON.stringify(out);
  });

  await check('camera: getting in eases out to the drive D and getting out eases in to the foot D (each within 2 s, +-3 m); on ANGLED theta follows gap 4.1 within 1 degree', async () => {
    await home();
    R.setView('ANGLED', true);
    const v = await car();
    let inCar, outCar;
    try {
      await C('step', { seconds: 2 });
      inCar = { D: r2(R.D), want: R.mem.ANGLED.drive, theta: r2(R.theta / deg), thetaWant: r2(thetaFor('drive', R.D)) };
    } finally { g.exitVehicle(true); g.vehiclesSys.remove(v); }
    await C('step', { seconds: 2 });
    outCar = { D: r2(R.D), want: R.mem.ANGLED.foot, theta: r2(R.theta / deg), thetaWant: r2(thetaFor('foot', R.D)) };
    const ok = [inCar, outCar].every((o) => Math.abs(o.D - o.want) <= 3 && Math.abs(o.theta - o.thetaWant) <= 1) && inCar.want > outCar.want + 20;
    return ok ? true : JSON.stringify({ inCar, outCar });
  });

  await check('camera: every view is reachable - O cycles TOPDOWN, ANGLED, ISO on foot and adds CHASE at the wheel (behind the car, yaw on its heading); [ and ] turn ISO 90 degrees, and W still walks up the screen', async () => {
    await home();
    const foot = [R.view];
    for (let k = 0; k < 3; k++) { await tap('KeyO'); foot.push(R.view); }
    reset();
    const v = await car();
    let drive = [R.view], behind = null;
    try {
      for (let k = 0; k < 4; k++) { await tap('KeyO'); drive.push(R.view); if (R.view === 'CHASE') { await C('step', { seconds: 2.5 }); const fx = Math.sin(v.h), fz = Math.cos(v.h); behind = r2((g.camera.position.x - v.x) * fx + (g.camera.position.z - v.z) * fz); } }
    } finally { g.exitVehicle(true); g.vehiclesSys.remove(v); }
    // ISO, turned a quarter: W walks up the screen (the camera's yaw turns the keys).
    reset(); R.setView('ISO', true); await tap('BracketRight'); await C('step', { seconds: 2 });
    const yaw = r2(R.yaw / deg);
    const scr = () => { const q = new THREE.Vector3(g.player.x, 0, g.player.z).project(g.camera); return q; };
    g.updateCamera(0); const a = scr();
    await hold('KeyW', 0.6);
    g.updateCamera(0); const b = scr();
    const upScreen = r2(b.y - a.y), sideways = r2(Math.abs(b.x - a.x));
    reset();
    const ok = foot.join() === 'TOPDOWN,ANGLED,ISO,TOPDOWN' && drive.join() === 'TOPDOWN,ANGLED,ISO,CHASE,TOPDOWN' && behind < -5 && Math.abs(yaw - 90) < 3 && upScreen > 0.05 && sideways < upScreen * 0.3;
    return ok ? true : JSON.stringify({ foot, drive, behind, yaw, upScreen, sideways });
  });

  await check('camera: aim is not the walk - walking north while aiming east turns the body east, the legs strafe, and the shot goes east (a target east is hit, one north is not)', async () => hush(async () => {
    await home(); R.setView('ANGLED', true);
    const p = g.player;
    const e = (await C('spawn', { kind: 'drifter', x: p.x + 9, z: p.z - 2, hp: 400 })).ids?.[0];
    const n = (await C('spawn', { kind: 'drifter', x: p.x, z: p.z - 11, hp: 400 })).ids?.[0];
    const E = api.findChar(e), N = api.findChar(n);
    let out = {};
    try {
      for (const c of [E, N]) if (c) { c.state = 'idle'; c.speed = 0; c.target = null; c.calm = 99; c.home = { x: c.x, z: c.z }; }
      const z0 = p.z;
      g.aimOverride = { x: p.x + 9, z: p.z - 2 };
      I.down.add('KeyW');
      try {
        for (let f = 0; f < 50; f++) { g.aimOverride.x = p.x + 9; g.aimOverride.z = p.z - 1.2; if (E) { E.x = p.x + 9; E.z = p.z - 1.2; } await step(1); }
      } finally { I.down.delete('KeyW'); }
      const face = r2(p.face / deg), legs = r2((p._legYaw ?? 0) / deg), moved = r2(z0 - p.z);
      const he = E?.hp ?? 0, hn = N?.hp ?? 0;
      g.aimOverride = { x: E.x, z: E.z };
      for (let k = 0; k < 4; k++) { I.mouse.left = true; I.mouse.leftPressed = true; await step(2); I.mouse.left = false; await step(14); }
      out = { face, legs, moved, eHit: r2(he - (E?.hp ?? he)), nHit: r2(hn - (N?.hp ?? hn)), aimD: r2(p.aimD ?? 0) };
    } finally { g.aimOverride = null; for (const c of [E, N]) if (c) g.removeChar(c); }
    // East with the aim 1.2 m north of due east: atan2(9, -1.2) = 97.6 degrees; walking north the legs turn ~82 off the body.
    const off = Math.abs(((out.face - 97.6) % 360 + 540) % 360 - 180);
    const ok = out.moved > 1.5 && off < 15 && Math.abs(Math.abs(out.legs) - 85) < 25 && out.eHit > 0 && out.nHit === 0;
    return ok ? true : JSON.stringify(out);
  }));

  await check('camera: the cutaway - a six-storey tower (19.2 m) between the camera and you, ANGLED close: >= 90% of your screen circle shows you (pixel test against the tower removed; with the cutaway off it does not); the storeys above your floor hide', async () => {
    await home(); R.setView('ANGLED', true); R.mem.ANGLED.foot = 20; g.updateCamera(10);
    const p = g.player;
    // The tower: 12 x 6 m, six storeys, its north face 2 m south of you: between you and the camera (13 m south, 15 m up).
    const tower = new THREE.Mesh(new THREE.BoxGeometry(12, 19.2, 6), new THREE.MeshStandardMaterial({ color: '#7a6a58' }));
    tower.position.set(p.x, 9.6 + (p.gy ?? 0), p.z + 5); tower.castShadow = false; tower.receiveShadow = false;
    g.scene.add(tower); g.cutaway.scan(); g.cutaway.scanT = 1;
    const W = 320, H = Math.round(320 / g.camera.aspect), rt = new THREE.WebGLRenderTarget(W, H), buf = new Uint8Array(W * H * 4);
    const shot = (vis, cut) => {
      tower.visible = vis; g.cutaway.on = cut; g.updateCamera(0); g.cutaway.update(0);
      g.renderer.setRenderTarget(rt); g.renderer.render(g.scene, g.camera); g.renderer.setRenderTarget(null);
      g.renderer.readRenderTargetPixels(rt, 0, 0, W, H, buf);
      return buf.slice();
    };
    let out;
    try {
      g.paused = true; // hold the world still between the three renders
      const truth = shot(false, true), cutOn = shot(true, true), cutOff = shot(true, false);
      // The player's body on screen: from the feet to the head, a circle around the middle.
      const a = new THREE.Vector3(p.x, (p.gy ?? 0) + 0.1, p.z).project(g.camera), b = new THREE.Vector3(p.x, (p.gy ?? 0) + 1.8, p.z).project(g.camera);
      const cx = ((a.x + b.x) / 4 + 0.5) * W, cy = ((a.y + b.y) / 4 + 0.5) * H, rad = Math.max(3, Math.abs(b.y - a.y) * H / 4);
      let n = 0, same = 0, sameOff = 0;
      for (let y = Math.floor(cy - rad); y <= cy + rad; y++) for (let x = Math.floor(cx - rad); x <= cx + rad; x++) {
        if ((x - cx) ** 2 + (y - cy) ** 2 > rad * rad || x < 0 || y < 0 || x >= W || y >= H) continue;
        const i = (y * W + x) * 4, d = (A) => Math.abs(A[i] - truth[i]) + Math.abs(A[i + 1] - truth[i + 1]) + Math.abs(A[i + 2] - truth[i + 2]);
        n++; if (d(cutOn) < 24) same++; if (d(cutOff) < 24) sameOff++;
      }
      out = { px: n, shows: r2(same / Math.max(1, n)), showsWithoutCut: r2(sameOff / Math.max(1, n)) };
    } finally { g.paused = false; g.scene.remove(tower); tower.geometry.dispose(); tower.material.dispose(); rt.dispose(); g.cutaway.on = true; }
    // The storeys: on the top floor of the tallest storeyed building, nothing above that floor is drawn (world/storeys.js setView).
    const S = g.storeys.list.slice().sort((x, y) => y.n - x.n)[0];
    let floors = null;
    if (S) {
      const top = S.n;
      await C('teleport', { x: (S.b.minX + S.b.maxX) / 2, z: (S.b.minZ + S.b.maxZ) / 2, floor: Math.min(1, top) });
      await step(3);
      const L = g.storeys.viewL, hidden = S.idx.filter((i) => g.storeys.items[i].lv > L).length, above = S.idx.filter((i) => g.storeys.items[i].lv > L).length;
      floors = { storeys: top + 1, viewL: L, itemsAbove: above, hidden, inside: g.insideBuilding === S.b };
      await home();
    }
    const ok = out.px > 8 && out.shows >= 0.9 && out.showsWithoutCut < 0.5 && (!floors || (floors.viewL >= 0 && floors.inside));
    return ok ? true : JSON.stringify({ ...out, floors });
  });

  await check('camera: viewR covers the frustum - every view, every stop, foot and drive: each screen-edge ground point lies inside viewR, and a ring at viewR + 10 m is off screen (spawners stay honest)', async () => {
    await home();
    const bad = [], ndc = new THREE.Vector3(), dir = new THREE.Vector3(), q = new THREE.Vector3();
    let tests = 0;
    const probe = (tag) => {
      const cam = g.camera, L = g.camLook, y = g.camFloor ?? 0, r = g.viewR;
      cam.updateMatrixWorld();
      for (let k = 0; k <= 16; k++) for (const [nx, ny] of [[-1 + k / 8, -1], [-1 + k / 8, 1], [-1, -1 + k / 8], [1, -1 + k / 8]]) {
        dir.copy(ndc.set(nx, ny, 0.5).unproject(cam)).sub(cam.position).normalize();
        if (dir.y >= -1e-3) continue; // above the horizon: sky
        const t = Math.min(cam.far, (y - cam.position.y) / dir.y);
        q.copy(cam.position).addScaledVector(dir, t);
        tests++;
        if (Math.hypot(q.x - L.x, q.z - L.z) > r + 0.01) { bad.push(`${tag}: edge ${r2(Math.hypot(q.x - L.x, q.z - L.z))} > ${r2(r)}`); return; }
      }
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        q.set(L.x + Math.cos(a) * (r + 10), y, L.z + Math.sin(a) * (r + 10)).project(g.camera);
        tests++;
        if (q.z < 1 && Math.abs(q.x) < 1 && Math.abs(q.y) < 1) { bad.push(`${tag}: ring point ${k} on screen`); return; }
      }
    };
    for (const mode of ['foot', 'drive']) {
      const v = mode === 'drive' ? await car() : null;
      try {
        for (const view of CAMERA.views) {
          if (view === 'CHASE' && !v) continue;
          R.setView(view, true);
          for (let i = 0; i < ZOOM.levels.length; i++) { R.setStop(i, true); g.updateCamera(10); probe(`${mode}/${view}/${ZOOM.levels[i].name}`); }
        }
      } finally { if (v) { g.exitVehicle(true); g.vehiclesSys.remove(v); } }
    }
    reset(); g.updateCamera(10);
    return !bad.length && tests > 1000 ? true : JSON.stringify({ tests, bad: bad.slice(0, 6) });
  });

  await check('camera: the widest views stay under 150 draw calls (ANGLED and ISO at the foot dMax, CHASE and ANGLED at the drive dMax, over the town)', async () => {
    await C('teleport', { x: 0, z: -40 }); reset();
    const out = {};
    for (const view of ['ANGLED', 'ISO']) { R.setView(view, true); R.mem[view].foot = CAMERA.foot.dMax; g.updateCamera(10); await C('step', { seconds: 1 }); g.render(0); out[`foot_${view}`] = (await C('perf')).drawCalls; }
    const v = await car();
    try {
      for (const view of ['ANGLED', 'CHASE']) { R.setView(view, true); R.mem[view].drive = view === 'CHASE' ? CAMERA.view.CHASE.dMax : CAMERA.drive.dMax; g.updateCamera(10); await C('step', { seconds: 1 }); g.render(0); out[`drive_${view}`] = (await C('perf')).drawCalls; }
    } finally { g.exitVehicle(true); g.vehiclesSys.remove(v); }
    reset(); g.updateCamera(10);
    return Object.values(out).every((n) => n < 150) ? true : JSON.stringify(out);
  });

  await check('camera: look far - holding the middle button leans the view out toward the cursor (much further than the normal lean), letting go brings it back; in CHASE, A turns the car to its own left', async () => {
    await home(); R.setView('ANGLED', true); g.updateCamera(10);
    const p = g.player, out = {};
    g.aimOverride = { x: p.x + 60, z: p.z };
    const lean = () => r2(g.camLook.x - p.x);
    try {
      await C('step', { seconds: 2 }); out.normal = lean();
      I.mouse.middle = true; await C('step', { seconds: 2 }); out.far = lean(); out.looking = R.looking;
      I.mouse.middle = false; await C('step', { seconds: 2 }); out.back = lean();
    } finally { I.mouse.middle = false; g.aimOverride = null; }
    // CHASE: the car's own left, whatever the screen says (vehicles.screenSteer).
    const v = await car();
    try {
      R.setView('CHASE', true); g.updateCamera(10);
      await hold('KeyW', 0.6);
      const h0 = v.h; await hold(['KeyW', 'KeyA'], 0.5);
      const lx = Math.cos(h0), lz = -Math.sin(h0); // the car's left
      out.chaseLeft = r2(Math.sin(v.h) * lx + Math.cos(v.h) * lz);
    } finally { g.exitVehicle(true); g.vehiclesSys.remove(v); reset(); }
    const ok = out.far > out.normal * 1.6 && out.far > 12 && out.looking && out.back < out.normal + 1 && out.chaseLeft > 0.02;
    return ok ? true : JSON.stringify(out);
  });

  await check('camera: the gun at the side - a revolver raised one-handed sits >= 0.15 m off the chest centre on the dominant side, a lefty mirrors it, and its toed-in line still meets the aim point (the round flies the centre line)', async () => hush(async () => {
    await home();
    const p = g.player, A = g.arms, out = {};
    if (!g.inv.weapons.includes('pistol')) await C('give', { weapon: 'pistol' });
    g.switchWeapon('pistol');
    const grip0 = A.gripPref, hand0 = p.hand;
    try {
      A.gripPref = 'one'; A.raise?.('test');
      g.aimOverride = { x: p.x + 10, z: p.z };
      for (const hand of ['R', 'L']) {
        p.hand = hand; await step(20);
        g.combat.fire(p, 'pistol', Math.atan2(g.aimOverride.x - p.x, g.aimOverride.z - p.z), { ...A.row('pistol'), spread: 0, pellets: 1 });
        // The muzzle's side of the chest (+ = the body's left) and how far the shot line passes from the aim point.
        const lx = Math.cos(p.face), lz = -Math.sin(p.face), side = (p._mx - p.x) * lx + (p._mz - p.z) * lz;
        const fx = Math.sin(p._shotAng), fz = Math.cos(p._shotAng), ax = g.aimOverride.x - p._mx, az = g.aimOverride.z - p._mz;
        out[hand] = { gunX: r2(p._gunX ?? 0), muzzleSide: r2(side), miss: r2(Math.abs(ax * fz - az * fx)), pose: p._pose };
      }
    } finally { A.gripPref = grip0; p.hand = hand0; g.aimOverride = null; }
    const ok = out.R.gunX <= -0.15 && out.R.muzzleSide <= -0.15 && out.L.gunX >= 0.15 && out.L.muzzleSide >= 0.15 && out.R.miss < 0.05 && out.L.miss < 0.05 && out.R.pose === 'aim';
    return ok ? true : JSON.stringify(out);
  }));
}
