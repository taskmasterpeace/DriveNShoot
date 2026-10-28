import * as THREE from 'three';
import { DIVE } from '../data/waves.js';

// DIVING (docs/design/WEB_WATER_LIFE.md §3; knobs in data/waves.js DIVE). Swimming stays main.js's (wade slow, swim
// slower, no shooting; Ctrl dives under on the breath meter); this adds how DEEP: held under, you sink toward the bottom
// (never past it), the view darkens and closes in with every metre, the world's sound goes thick through the water, your
// breath drains faster the deeper you are, and coming up short of air you gasp (a sound, an event). From above, a diver
// is a silhouette fading with depth (systems/sealife.js draws it).
//
// The darkness is drawn into the frame itself (a full-screen quad in the scene, one draw call while under, none above),
// so a world screenshot shows what the diver sees.
export class Diving {
  constructor(game) {
    this.g = game;
    game.diving = this;
    this.dark = 0;         // how dark the view is now (0..1)
    this.radius = 1;       // the clear circle (share of the screen)
    this.gasps = 0; this.lastGasp = null;
    this.U = { uDark: { value: 0 }, uR: { value: 1 }, uTint: { value: new THREE.Color(DIVE.tint) }, uAsp: { value: 1 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.U, transparent: true, depthTest: false, depthWrite: false, fog: false,
      vertexShader: 'varying vec2 vP; void main() { vP = position.xy; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: /* glsl */`
        uniform float uDark, uR, uAsp; uniform vec3 uTint; varying vec2 vP;
        void main() {
          vec2 q = vec2(vP.x * uAsp, vP.y);
          float e = smoothstep(uR * 0.15, uR * 1.9, length(q));
          float a = clamp(uDark * (0.6 + 0.4 * e) + e * e * uDark * 0.35, 0.0, 0.94);
          gl_FragColor = vec4(uTint * (1.0 - e * 0.85), a);
        }`,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    this.quad.frustumCulled = false; this.quad.renderOrder = 9990; this.quad.visible = false; this.quad.name = 'diving:view';
    game.scene?.add(this.quad);
  }

  // main.js's water block, each frame for the player (after p.underwater is set): depth, darkness, sound, the gasp.
  step(p, dt, wet) {
    const g = this.g;
    const bottom = wet === 'swim' ? g.water.depthAt(p.x, p.z, false, -Infinity) : 0;
    const was = p.diveD ?? 0;
    if (p.underwater) p.diveD = Math.min(Math.max(0, Math.min(DIVE.maxDive, bottom - DIVE.floor)), was + DIVE.descend * dt);
    else p.diveD = Math.max(0, was - DIVE.ascend * dt * (wet === 'swim' ? 1 : 4));
    if (p.underwater && !this.wasUnder) g.waves?.splash(p.x, p.z, 0.5);
    if (!p.underwater && this.wasUnder && (p.breath ?? 1) < DIVE.gaspBelow) this.gasp(p);
    this.wasUnder = !!p.underwater;
    const d = p.diveD;
    const tDark = p.underwater ? Math.min(DIVE.dark[2], DIVE.dark[0] + d * DIVE.dark[1]) : 0;
    this.dark += (tDark - this.dark) * Math.min(1, dt * 4);
    this.radius = p.underwater ? Math.max(DIVE.narrow[2], DIVE.narrow[0] - d * DIVE.narrow[1]) : 1;
    this.U.uDark.value = this.dark; this.U.uR.value = this.radius;
    this.U.uAsp.value = g.camera ? g.camera.aspect : 1;
    this.quad.visible = this.dark > 0.01;
    // The world's sound through the water: thick, low, closer to nothing the deeper you go.
    const k = p.underwater ? Math.min(1, d / DIVE.maxDive) : 0;
    g.audio?.muffle?.(p.underwater ? DIVE.muffle[0] + (DIVE.muffle[1] - DIVE.muffle[0]) * k : 0);
  }
  // How much faster breath drains down here.
  drainMul(p) { return 1 + (p.diveD ?? 0) * DIVE.drainPerM; }
  gasp(p) {
    this.gasps++;
    this.lastGasp = { breath: +(p.breath ?? 1).toFixed(2), t: +(this.g.waves?.t ?? 0).toFixed(2) };
    this.g.audio?.burst?.({ dur: 0.55, freq: 1100, q: 0.9, type: 'bandpass', vol: 0.42, decay: 0.42, pitchDrop: 300 });
    this.g.emit?.('gasp', this.lastGasp);
  }
  view() { return { dark: +this.dark.toFixed(3), radius: +this.radius.toFixed(3), quad: this.quad.visible, gasps: this.gasps, lastGasp: this.lastGasp }; }
}
