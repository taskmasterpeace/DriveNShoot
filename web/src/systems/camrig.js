import * as THREE from 'three';
import { ZOOM, CAMERA } from '../data/camera.js';

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

export class CamRig {
  constructor(g) {
    this.g = g;
    this.view = CAMERA.start;
    this.mem = {};
    for (const v of CAMERA.views) this.mem[v] = { foot: CAMERA.foot.dStart, drive: v === 'CHASE' ? CAMERA.view.CHASE.dStart : CAMERA.drive.dStart };
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
  // The view in force: CHASE is a driving view; on foot it reads as ANGLED.
  eff(m = this.mode()) { return this.view === 'CHASE' && m !== 'drive' ? 'ANGLED' : this.view; }
  limits(ev, m) {
    if (ev === 'CHASE') return CAMERA.view.CHASE;
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
    if (!quiet) { this.g.hud?.toast(`VIEW · ${v}${v === 'CHASE' && this.mode() !== 'drive' ? ' (at the wheel)' : ''}`); this.g.emit?.('cameraView', { view: v }); }
    return true;
  }
  cycleView() {
    const V = CAMERA.views, drive = this.mode() === 'drive';
    let i = V.indexOf(this.view);
    do i = (i + 1) % V.length; while (V[i] === 'CHASE' && !drive);
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
    if (I.wheel) this.wheel(I.wheel);
    if (I.hit('KeyZ')) this.setStop(this.stop() + (I.key('ShiftLeft') || I.key('ShiftRight') ? -1 : 1));
    if (I.hit('Minus')) this.setStop(this.stop() + 1);
    if (I.hit('Equal')) this.setStop(this.stop() - 1);
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
    let dT = this.mem[ev][m];
    if (v) dT = Math.min(L.dMax, dT + g.vehiclesSys.speed(v) * CAMERA.drive.speedLift * (ev === 'CHASE' ? 0.35 : 1));
    if (insideBuilding && !v) dT = Math.min(dT, CAMERA.indoor.dMax);
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

    const cam = g.camera, s = g.hud.shakeV, sx = (Math.random() - 0.5) * s * 1.2, sz = (Math.random() - 0.5) * s * 1.2;
    const hz = this.D * Math.sin(this.theta);
    cam.position.set(look.x + sx + hz * Math.sin(this.yaw), g.camHeight + floorY, look.z + sz + hz * Math.cos(this.yaw));
    cam.lookAt(look.x + sx, floorY, look.z + sz);
    const far = ev === 'TOPDOWN' ? CAMERA.far : CAMERA.farTilted;
    if (cam.far !== far) { cam.far = far; cam.updateProjectionMatrix(); }
    cam.updateMatrixWorld();
    g.viewR = this.viewRadius(cam, look, floorY);
    this.baseR = g.viewR;
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
    return { view: this.view, eff: this.eff(m), mode: m, looking: this.looking, d: +this.D.toFixed(2), dTarget: +this.d.toFixed(2), theta: +(this.theta / R).toFixed(2), yaw: +(this.yaw / R).toFixed(1), height: +this.g.camHeight.toFixed(2), viewR: +this.g.viewR.toFixed(1), stop: ZOOM.levels[this.stop()].name, mem: this.mem };
  }
}
