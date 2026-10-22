import * as THREE from 'three';
import { coneTexture, radialGlow } from '../world/textures.js';

// Every lamp on every vehicle, in two InstancedMeshes: 2 draw calls for all traffic, day or night.
//   beams - headlight cones painted on the road, apex AT each headlamp lens, toed out a touch
//           the way real lamps are aimed;
//   glows - lens halos: headlamps, tail lamps (brighter and bigger under braking), white
//           reversing lamps, and amber turn signals on AI cars turning at a junction.
// The lenses themselves are body geometry placed at v.anchors (vehicles.js lampAnchors); this is
// the light they throw. Lamp damage (vehicledamage.js) sets v.lampL / v.lampR / v.tailsOn, so a
// smashed front can leave a one-eyed car.

const MAX_BEAMS = 192, MAX_GLOWS = 640;
const TOE = 0.07; // radians each beam splays outward
const HEAD = new THREE.Color('#fff1cc'), TAIL = new THREE.Color('#ff2a1a'), REVERSE = new THREE.Color('#f2efe6'), AMBER = new THREE.Color('#ffa01e');
const _veh = new THREE.Matrix4(), _l = new THREE.Matrix4(), _s = new THREE.Vector3(), _c = new THREE.Color();

export class VehicleLights {
  constructor(game) {
    this.g = game;
    const beamGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5); // apex (texture v=1) at the origin, opening along +z
    const glowGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const mat = (map) => new THREE.MeshBasicMaterial({ map, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    this.beams = new THREE.InstancedMesh(beamGeo, mat(coneTexture()), MAX_BEAMS);
    this.glows = new THREE.InstancedMesh(glowGeo, mat(radialGlow()), MAX_GLOWS);
    for (const m of [this.beams, this.glows]) {
      m.frustumCulled = false; m.renderOrder = 3;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.setColorAt(0, _c.setRGB(0, 0, 0)); // allocates instanceColor
      m.instanceColor.setUsage(THREE.DynamicDrawUsage);
      m.count = 0;
      game.scene.add(m);
    }
    this.nb = 0; this.ng = 0;
  }

  // Both write in the frame of the vehicle being processed (_veh).
  glow(x, y, z, size, color, k) {
    if (this.ng >= MAX_GLOWS) return;
    _l.makeTranslation(x, y, z).scale(_s.set(size, 1, size)).premultiply(_veh);
    this.glows.setMatrixAt(this.ng, _l);
    this.glows.setColorAt(this.ng++, _c.copy(color).multiplyScalar(k));
  }

  beam(x, z, toe, w, len, k) {
    if (this.nb >= MAX_BEAMS) return;
    _l.makeRotationY(toe).setPosition(x, 0.15, z).scale(_s.set(w, 1, len)).premultiply(_veh);
    this.beams.setMatrixAt(this.nb, _l);
    this.beams.setColorAt(this.nb++, _c.copy(HEAD).multiplyScalar(k));
  }

  // After every vehicle has its final position for the frame.
  update(night, time) {
    this.nb = this.ng = 0;
    const beamK = 0.03 + night * 0.5, headK = 0.22 + night * 0.85, tailK = 0.2 + night * 0.6;
    const beams = night > 0.08; // by day a beam on sunlit sand is invisible: don't spend the draw call
    const halo = 0.7 + night * 0.45; // a lit lens is a glint by day, a halo by night
    const blink = Math.sin(time * Math.PI * 3) > 0; // turn signals at 1.5 Hz
    for (const v of this.g.vehicles) {
      const A = v.anchors;
      if (v.dead || v.sunk || !A) continue;
      const lit = !!v.driver;
      if (!lit && !v.braking) continue;
      const fwd = v.vx * Math.sin(v.h) + v.vz * Math.cos(v.h);
      _veh.makeRotationY(v.h).setPosition(v.x, 0, v.z);
      if (lit) for (let k = 0; k < A.head.length; k++) {
        if (k === 0 ? v.lampL === false : v.lampR === false) continue;
        const a = A.head[k];
        if (beams) this.beam(a[0], a[2] - 0.08, A.head.length > 1 ? Math.sign(a[0]) * TOE : 0, A.beamW, A.beamL, beamK);
        this.glow(a[0], a[1] + 0.04, a[2], A.halo * halo, HEAD, headK);
      }
      if (v.tailsOn !== false) for (let k = 0; k < A.tail.length; k++) {
        const a = A.tail[k];
        this.glow(a[0], a[1], a[2], v.braking ? 1.05 : 0.7, TAIL, tailK + (v.braking ? 0.85 : 0));
        if (lit && v.throttle < 0 && fwd < -0.3) this.glow(a[0] * 0.55, a[1], a[2], 0.55, REVERSE, 0.45 + night * 0.5);
      }
      // AI traffic signals its turns at junctions (the player has no stalk to flick).
      if (lit && blink && v.driver !== this.g.player && !v.bike && !v.boat && Math.abs(v.steer) > 0.35 && Math.abs(fwd) < 14) {
        const sx = Math.sign(v.steer) * (v.wid / 2 - 0.1);
        this.glow(sx, A.head[0][1], v.len / 2, 0.55, AMBER, 0.95);
        this.glow(sx, A.head[0][1], -v.len / 2, 0.55, AMBER, 0.95);
      }
    }
    this.beams.count = this.nb; this.glows.count = this.ng;
    this.beams.visible = this.nb > 0; this.glows.visible = this.ng > 0; // an empty pool costs no draw call
    this.beams.instanceMatrix.needsUpdate = this.glows.instanceMatrix.needsUpdate = true;
    this.beams.instanceColor.needsUpdate = this.glows.instanceColor.needsUpdate = true;
  }

  view() { return { beams: this.nb, glows: this.ng }; }
}
