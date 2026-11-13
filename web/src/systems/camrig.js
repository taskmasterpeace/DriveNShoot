import * as THREE from 'three';
import { ZOOM, CAMERA } from '../data/camera.js';
import { nearFor } from '../engine/depthlayers.js';
import { RAY_SIGHT, RAY_BULLET } from '../engine/collision.js';

// The play camera: one boom, four views, a continuous zoom that remembers itself per view and per mode
// (data/camera.js; docs/design/WEB_CAMERA.md).
//   update(dt)      main.js updateCamera: input (wheel, Z steps, O, [ ], the pad's VIEW + right stick), then the boom
//   wheel(n)        n notches (+ out, - in) on the current view and mode
//   setStop(i)      one of the five named stops (Z / Shift+Z / - / =, `zoom level=`)
//   cycleView()     O: TOPDOWN -> ANGLED -> ISO -> CHASE (CHASE only at the wheel)
//   setView(name)   the `camera view=` command
//   toWorld(x, z)   a screen-relative move (W = up the screen) to the world, through the current yaw
// g.zoomLevel reads the nearest stop and writes a stop (old scripts and checks keep working).
const R = Math.PI / 180;
const _d = new THREE.Vector3(), _w = { x: 0, z: 0 };
const NDC = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
const smooth = (t) => t * t * (3 - 2 * t);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const _look = new THREE.Vector3(), _ret = new THREE.Vector3(), _aim = { x: 0, z: 0, d: 0 };
const AGENT_TAB = (() => { try { return new URLSearchParams(location.search).has('agent'); } catch { return false; } })();

export class CamRig {
  constructor(g) {
    this.g = g;
    this.view = CAMERA.start;
    this.mem = {};
    for (const v of CAMERA.views) this.mem[v] = { foot: CAMERA.body[v]?.dStart ?? CAMERA.foot.dStart, drive: v === 'CHASE' ? CAMERA.view.CHASE.dStart : CAMERA.drive.dStart };
    // the body views (THIRD, SHOULDER): where the view faces (orbit: the boom's yaw), up and down (pitch: + up), which shoulder
    this.orbit = 0; this.pitch = CAMERA.body.pitchStart * R; this.shoulder = 1; this.aiming = false; this.handsT = -9;
    this.reticle = { x: 0, y: 0 }; this.pos = { x: 0, y: 0, z: 0 }; this.pivot = { x: 0, y: 0, z: 0 };
    this.D = CAMERA.foot.dStart;                 // the boom as it is (smoothed)
    this.theta = CAMERA.view.TOPDOWN.theta * R;  // pitch off vertical (rad)
    this.yaw = 0;                                // 0 = camera south of the look point (north up)
    this.isoYaw = 0;
    this.looking = false; this.padLookT = 0; this.baseR = 30;     // look far (held), the pad's full-throw timer
    this.override = null;                        // `camera d= theta=`: { d, theta } held until the view changes
    this.corners = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    Object.defineProperty(g, 'zoomLevel', { configurable: true, get: () => this.stop(), set: (i) => this.setStop(i, true) });
  }

  mode() { return this.g.player?.inVehicle ? 'drive' : 'foot'; }
  // The view in force: CHASE is a driving view (on foot it reads as ANGLED); THIRD and SHOULDER are on-foot views (at
  // the wheel they read as CHASE).
  eff(m = this.mode()) { const v = this.view; return v === 'CHASE' && m !== 'drive' ? 'ANGLED' : (v === 'THIRD' || v === 'SHOULDER') && m === 'drive' ? 'CHASE' : v; }
  // The body view's row while one is in force (on foot), else null.
  body(m = this.mode()) { const v = this.view; return (v === 'THIRD' || v === 'SHOULDER') && m !== 'drive' ? CAMERA.body[v] : null; }
  limits(ev, m) {
    if (ev === 'CHASE') return CAMERA.view.CHASE;
    if (CAMERA.body[ev] && m !== 'drive') return CAMERA.body[ev];
    return m === 'drive' ? CAMERA.drive : CAMERA.foot;
  }
  get d() { const m = this.mode(); return this.mem[this.eff(m)][m]; }
  set d(v) { const m = this.mode(), ev = this.eff(m), L = this.limits(ev, m); this.mem[ev][m] = Math.max(L.dMin, Math.min(L.dMax, v)); }

  wheel(n) { if (n) { this.d = this.d * Math.pow(CAMERA.wheelStep, n); this.override = null; } }

  stop() {
    const m = this.mode(), d = this.d;
    let best = 0, bd = Infinity;
    ZOOM.levels.forEach((l, i) => { const e = Math.abs(Math.log(l[m] / d)); if (e < bd) { bd = e; best = i; } });
    return best;
  }
  setStop(i, quiet = false) {
    const n = Math.max(0, Math.min(ZOOM.levels.length - 1, i | 0)), m = this.mode();
    this.d = ZOOM.levels[n][m];
    this.override = null;
    if (!quiet) { this.g.hud?.toast(`ZOOM · ${ZOOM.levels[n].name}`); this.g.emit?.('zoom', { level: n, name: ZOOM.levels[n].name }); }
    return n;
  }

  setView(name, quiet = false) {
    const v = String(name).toUpperCase();
    if (!CAMERA.views.includes(v)) return false;
    this.view = v; this.override = null;
    if (CAMERA.body[v]) { const p = this.g.player; this.orbit = wrap((p?.face ?? 0) + Math.PI); this.pitch = CAMERA.body.pitchStart * R; } // behind you, looking where you face
    if (!quiet && !AGENT_TAB && this.g.qol?.settings) { this.g.qol.settings.camView = v; this.g.qol.saveSettings?.(); } // remembered (never for the agent's page: the battery runs on TOPDOWN)
    if (!quiet) { this.g.hud?.toast(`VIEW · ${v}${v === 'CHASE' && this.mode() !== 'drive' ? ' (at the wheel)' : ''}`); this.g.emit?.('cameraView', { view: v }); }
    return true;
  }
  cycleView() {
    const V = CAMERA.views, drive = this.mode() === 'drive';
    let i = V.indexOf(this.view);
    do i = (i + 1) % V.length; while ((V[i] === 'CHASE' && !drive) || (CAMERA.body[V[i]] && drive)); // CHASE is the wheel's; THIRD and SHOULDER are on-foot views
    this.setView(V[i]);
  }

  // How far the look point may lean toward the cursor (m): the normal lean, or look-far's share of the view radius (the
  // cursor's ground point walks out as the view follows it, so holding it scouts past the edge of where you were).
  leanMax() {
    if (this.looking) return Math.max(CAMERA.leanMax * Math.max(1, this.D / 33), CAMERA.lookFar * this.baseR);
    return CAMERA.leanMax * Math.max(1, this.D / 33);
  }

  toWorld(x, z) {
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    _w.x = x * c + z * s; _w.z = -x * s + z * c;
    return _w;
  }

  // Player input for the camera (main.js frame, after the pad poll; never while a panel has the hands).
  input(I, dt) {
    const g = this.g;
    if (!this._restored) { this._restored = true; const sv = g.qol?.settings?.camView; if (!AGENT_TAB && sv && sv !== this.view && CAMERA.views.includes(sv)) this.setView(sv, true); }
    const Bd = this.body(), M = I.mouse;
    if (Bd) {
      const B = CAMERA.body, S = g.qol?.settings, inv = S?.camInvertY ? -1 : 1, sens = B.sens * (S?.camSens ?? 1);
      if (this.hands && (M.locked || M.right || M.middle) && (M.dx || M.dy)) { this.orbit = wrap(this.orbit - M.dx * sens); this.pitch = clamp(this.pitch - M.dy * sens * inv, B.pitch[0] * R, B.pitch[1] * R); }
      const C1 = g.controls;
      if (C1?.device === 'pad' && C1.aimStick.mag > 0.15 && !C1.btn?.('back')) { this.orbit = wrap(this.orbit - C1.aimStick.x * B.padRate * dt); this.pitch = clamp(this.pitch - C1.aimStick.z * B.padRate * 0.7 * dt * inv, B.pitch[0] * R, B.pitch[1] * R); }
      if (I.hit('Semicolon')) this.shoulder = -this.shoulder;
      this.aiming = !!M.right;
    } else this.aiming = false;
    M.dx = 0; M.dy = 0;
    if (I.wheel) this.wheel(I.wheel);
    if (Bd) { // a body view's boom is short: the named stops are top-down heights, so Z / - / = step the boom like the wheel
      if (I.hit('KeyZ')) this.wheel(I.key('ShiftLeft') || I.key('ShiftRight') ? -2 : 2);
      if (I.hit('Minus')) this.wheel(2);
      if (I.hit('Equal')) this.wheel(-2);
    } else {
      if (I.hit('KeyZ')) this.setStop(this.stop() + (I.key('ShiftLeft') || I.key('ShiftRight') ? -1 : 1));
      if (I.hit('Minus')) this.setStop(this.stop() + 1);
      if (I.hit('Equal')) this.setStop(this.stop() - 1);
    }
    if (I.hit('KeyO')) this.cycleView();
    if (this.eff() === 'ISO') {
      if (I.hit('BracketLeft')) this.isoYaw = wrap(this.isoYaw - CAMERA.view.ISO.yawSnap * R);
      if (I.hit('BracketRight')) this.isoYaw = wrap(this.isoYaw + CAMERA.view.ISO.yawSnap * R);
    }
    const C0 = g.controls;
    this.padLookT = C0?.device === 'pad' && C0.aimStick.mag >= CAMERA.padAt ? this.padLookT + dt : 0;
    this.looking = !!C0?.held?.('look') || this.padLookT >= CAMERA.padHold;
    // The pad has no wheel: VIEW held + the right stick up/down zooms continuously (VIEW then doesn't open the map).
    const C = g.controls;
    if (C?.device === 'pad' && C.btn?.('back') && Math.abs(C.aimStick.z) > 0.35) {
      this.d = this.d * Math.exp(C.aimStick.z * dt * 1.6); this.override = null; C.backUsed = true;
    }
  }

  // The boom: D, θ, ψ toward their targets, then the camera on the arm, then the true view radius (gap §4.2).
  update(dt, look, floorY, insideBuilding) {
    const g = this.g, p = g.player, v = p.inVehicle, m = this.mode(), ev = this.eff(m), L = this.limits(ev, m);
    const Bd = this.body(m);
    if (Bd) return this.updateBody(dt, Bd, insideBuilding);
    let dT = this.mem[ev][m];
    if (v) dT = Math.min(L.dMax, dT + g.vehiclesSys.speed(v) * CAMERA.drive.speedLift * (ev === 'CHASE' ? 0.35 : 1));
    if (insideBuilding && !v) dT = Math.min(dT, CAMERA.indoor.dMax);
    if (g.droneCam?.active) dT = Math.max(dT, g.droneCam.h / Math.cos(this.theta || 0)); // flying the drone: at least its eye height (systems/drones.js)
    if (this.override?.d) dT = this.override.d;
    const k = 1 - Math.exp(-dt * ZOOM.heightRate);
    this.D += (dT - this.D) * k;
    let th;
    if (ev === 'ANGLED') {
      const A = CAMERA.view.ANGLED[m], s = Math.max(0, Math.min(1, Math.log(this.D / L.dMin) / Math.log(L.dMax / L.dMin)));
      th = A.thetaClose + (A.thetaFar - A.thetaClose) * smooth(s);
    } else th = CAMERA.view[ev].theta;
    if (insideBuilding && !v) th = Math.min(th, CAMERA.indoor.thetaMax);
    if (this.override?.theta !== undefined) th = this.override.theta;
    th = Math.max(0.5, Math.min(CAMERA.thetaSum - CAMERA.vfov / 2, th)) * R;
    this.theta += (th - this.theta) * (1 - Math.exp(-dt * CAMERA.thetaRate));
    const yT = ev === 'ISO' ? this.isoYaw : ev === 'CHASE' && v ? wrap(v.h + Math.PI) : 0;
    this.yaw = wrap(this.yaw + wrap(yT - this.yaw) * (1 - Math.exp(-dt * CAMERA.yawRate)));
    g.camHeight = this.D * Math.cos(this.theta);

    const cam = g.camera, s = g.hud.shakeV, K = g.look?.kick, sx = (Math.random() - 0.5) * s * 1.2 + (K?.x ?? 0), sz = (Math.random() - 0.5) * s * 1.2 + (K?.z ?? 0); // + the calibre's kick (systems/lookfeel.js)
    const hz = this.D * Math.sin(this.theta);
    cam.position.set(look.x + sx + hz * Math.sin(this.yaw), g.camHeight + floorY, look.z + sz + hz * Math.cos(this.yaw));
    cam.lookAt(look.x + sx, floorY, look.z + sz);
    const far = ev === 'TOPDOWN' ? CAMERA.far : CAMERA.farTilted;
    // The near plane follows the boom (engine/depthlayers.js nearFor): depth precision on the ground goes as near / D², so a
    // 1 m near plane at the widest zoom made 2 mm layers flicker. Re-projected only when it moves more than 5%.
    const near = nearFor(this.D);
    if (cam.far !== far || Math.abs(cam.near - near) > cam.near * 0.05) { cam.far = far; cam.near = near; cam.updateProjectionMatrix(); }
    cam.updateMatrixWorld();
    g.viewR = this.viewRadius(cam, look, floorY);
    this.baseR = g.viewR;
  }

  // THE BODY VIEWS: the camera on a short boom behind your head (or your shoulder), turned by the mouse. The boom stops
  // short of the first wall behind you and under the ceiling of the floor you stand on, so it never looks through either.
  updateBody(dt, Bd, insideBuilding) {
    const g = this.g, p = g.player, B = CAMERA.body, cam = g.camera, ST = g.statics;
    let dT = this.mem[this.view].foot;
    if (this.aiming && Bd.aimD) dT = Math.min(dT, Bd.aimD);
    if (this.override?.d) dT = this.override.d;
    this.D += (dT - this.D) * (1 - Math.exp(-dt * B.rate));
    this.yaw = this.orbit;
    const pit = this.pitch, cp = Math.cos(pit), sp = Math.sin(pit), sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const fx = -sy * cp, fy = sp, fz = -cy * cp, hx = -sy, hz = -cy, rx = cy, rz = -sy; // forward (pitched), forward on the flat, right
    const feet = p.gy ?? 0, up = p.storey || p.ug ? feet - (p.storey?.y0 ?? g.under?.y0 ?? 0) : 0, rayY = up + Bd.eye - 0.25; // the ray's height in the building's own frame
    let px = p.x, pz = p.z; const py = feet + Bd.eye;
    const side = Bd.side * this.shoulder;
    if (side) { const sg = Math.sign(side), t = ST.raycast(p.x, p.z, rx * sg, rz * sg, Math.abs(side) + B.pad, RAY_SIGHT, rayY), s = Math.max(0, Math.min(Math.abs(side), t - B.pad)); px += rx * sg * s; pz += rz * sg * s; }
    let d = this.D;
    if (cp > 1e-3) { const t = ST.raycast(px, pz, -hx, -hz, d * cp + B.pad, RAY_SIGHT, rayY); if (t < d * cp + B.pad) d = Math.max(B.hardMin, (t - B.pad) / cp); }
    const lo = feet + B.floor, hi = insideBuilding ? feet + B.ceil - B.ceilGap : Infinity;
    let cyy = py - fy * d;
    if ((cyy > hi || cyy < lo) && Math.abs(fy) > 1e-3) { d = Math.max(B.hardMin, Math.min(d, (py - clamp(cyy, lo, hi)) / fy)); cyy = clamp(py - fy * d, lo, hi); }
    const s = g.hud.shakeV, K = g.look?.kick, sx = (Math.random() - 0.5) * s * 0.4 + (K?.x ?? 0) * 0.3, sz = (Math.random() - 0.5) * s * 0.4 + (K?.z ?? 0) * 0.3;
    const cx = px - fx * d, cz = pz - fz * d;
    cam.position.set(cx + sx, cyy, cz + sz);
    _look.set(px + fx * 20 + sx, py + fy * 20, pz + fz * 20 + sz); cam.lookAt(_look);
    if (cam.far !== CAMERA.farTilted || Math.abs(cam.near - B.near) > 1e-4) { cam.far = CAMERA.farTilted; cam.near = B.near; cam.updateProjectionMatrix(); }
    cam.updateMatrixWorld();
    this.pos.x = cx; this.pos.y = cyy; this.pos.z = cz; this.pivot.x = px; this.pivot.y = py; this.pivot.z = pz; this.boom = d;
    this.theta = Math.PI / 2 + pit;
    g.camHeight = Math.max(1, cyy - feet);
    g.viewR = B.viewR; this.baseR = g.viewR;
    // the reticle: where the round goes (the flat line from you along the view, at chest height on your floor), on screen
    const a = this.aimPoint(p);
    _ret.set(a.x, feet + 1.3, a.z).project(cam);
    this.reticle.x = (_ret.x + 1) / 2 * innerWidth; this.reticle.y = (1 - _ret.y) / 2 * innerHeight;
  }
  // The mouse is held by the game (pointer lock) only while a body view has the hands. main.js says each frame whether
  // they do (no menu, panel, talk, screen, sleep or drone); anything else lets the mouse go at once, paused or not.
  lock(hands) {
    const I = this.g.input; if (!I) return;
    this.hands = hands;
    I.wantLock = hands && !!this.body();
    if (!I.wantLock && I.mouse.locked) { try { document.exitPointerLock?.(); } catch { /* not locked */ } }
  }
  // Where you aim in a body view: straight out from you the way the view faces, to the first of: a wall that stops a
  // round, somebody or a vehicle standing on the line, the ground where you are looking (when you look down), or
  // aimRange. So the aim point lands ON the person in front of you (a hold-up, aim assist, a witness's read of your gun
  // all measure from it), and looking down brings it in close (a throw, an order to a dog or a crew member).
  // Shots stay on your floor (the game's law): looking up or down moves the view, not the round.
  aimPoint(p) {
    const g = this.g, B = CAMERA.body, hx = -Math.sin(this.orbit), hz = -Math.cos(this.orbit);
    const up = p.storey || p.ug ? (p.gy ?? 0) - (p.storey?.y0 ?? g.under?.y0 ?? 0) : 0;
    let t = g.statics.raycast(p.x, p.z, hx, hz, B.aimRange, RAY_BULLET, up > 0.5 || up < -0.5 ? up + 1.3 : -1);
    if (this.pitch < -0.05) t = Math.min(t, (this.body()?.eye ?? 1.55) / Math.tan(-this.pitch)); // where your look meets the ground
    for (const c of g.chars) { // the nearest body on the line (same floor), at its centre
      if (c === p || !c.alive || c.inVehicle || c.hidden || Math.abs((c.gy ?? 0) - (p.gy ?? 0)) > 1.6) continue;
      const rx = c.x - p.x, rz = c.z - p.z, al = rx * hx + rz * hz;
      if (al < 0.4 || al > t) continue;
      const off = Math.abs(rx * hz - rz * hx);
      if (off < (c.radius ?? 0.4) + 0.25) t = al;
    }
    for (const v of g.vehicles) {
      if (v.dead && !v.len) continue;
      const rx = v.x - p.x, rz = v.z - p.z, al = rx * hx + rz * hz;
      if (al < 0.6 || al > t) continue;
      if (Math.abs(rx * hz - rz * hx) < (v.wid ?? 2) * 0.6) t = Math.max(0.6, al - (v.wid ?? 2) * 0.5);
    }
    const d = Math.max(1.2, Math.min(B.aimRange, t));
    _aim.x = p.x + hx * d; _aim.z = p.z + hz * d; _aim.d = d;
    return _aim;
  }

  // The farthest frustum corner on the ground from the look point (a corner above the horizon counts at the far plane).
  viewRadius(cam, look, y) {
    let r = 0;
    for (let i = 0; i < 4; i++) {
      _d.set(NDC[i][0], NDC[i][1], 0.5).unproject(cam).sub(cam.position).normalize();
      const C = this.corners[i];
      if (_d.y < -1e-3) {
        const t = Math.min(cam.far, (y - cam.position.y) / _d.y);
        C.copy(cam.position).addScaledVector(_d, t);
      } else C.copy(cam.position).addScaledVector(_d, cam.far);
      C.y = y;
      r = Math.max(r, Math.hypot(C.x - look.x, C.z - look.z));
    }
    return r * 1.05;
  }

  status() {
    const m = this.mode();
    const Bd = this.body(m);
    return { body: Bd ? { orbit: +(this.orbit / R).toFixed(1), pitch: +(this.pitch / R).toFixed(1), shoulder: this.shoulder, aiming: this.aiming, boom: +(this.boom ?? 0).toFixed(2), pos: [+this.pos.x.toFixed(2), +this.pos.y.toFixed(2), +this.pos.z.toFixed(2)], pivot: [+this.pivot.x.toFixed(2), +this.pivot.y.toFixed(2), +this.pivot.z.toFixed(2)] } : null,
      view: this.view, eff: this.eff(m), mode: m, looking: this.looking, d: +this.D.toFixed(2), dTarget: +this.d.toFixed(2), theta: +(this.theta / R).toFixed(2), yaw: +(this.yaw / R).toFixed(1), height: +this.g.camHeight.toFixed(2), viewR: +this.g.viewR.toFixed(1), stop: ZOOM.levels[this.stop()].name, mem: this.mem };
  }
}
