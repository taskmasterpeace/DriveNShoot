// THE SKY ABOVE THE HORIZON (docs/design/WEB_SKY_DOME.md; rows data/camera.js SKY_DOME). The top-down views never see
// the horizon, so the world's background was one flat colour (the haze). THIRD and SHOULDER look out at it: this is one
// dome round the camera, drawn only in those views. One draw call, no texture.
//   horizon   the haze colour itself (systems/sky.js fog colour), so the far ground melts into it as before
//   zenith    the day's blue, dimmed by cloud, dust and ash, down to the night's near-black
//   the sun   a disc on the light's own direction (the moon by night: the same light, paler)
//   stars     a few hundred points, by night only, steady (a hash of the direction: no texture, no per-frame work)
import * as THREE from 'three';
import { SKY_DOME as D } from '../data/camera.js';

const _dir = new THREE.Vector3();

export class SkyDome {
  constructor(g) {
    this.g = g;
    this.mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
      uniforms: {
        horizon: { value: new THREE.Color('#c8b08a') }, zenith: { value: new THREE.Color(D.day) }, sunDir: { value: new THREE.Vector3(0, 1, 0) },
        sunCol: { value: new THREE.Color('#fff4e0') }, sunSize: { value: D.sun.size }, night: { value: 0 }, lift: { value: D.lift },
      },
      vertexShader: 'varying vec3 vDir; void main() { vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w; }',
      fragmentShader: `
        uniform vec3 horizon; uniform vec3 zenith; uniform vec3 sunDir; uniform vec3 sunCol; uniform float sunSize; uniform float night; uniform float lift;
        varying vec3 vDir;
        float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        void main() {
          vec3 d = normalize(vDir);
          float h = clamp(d.y, 0.0, 1.0);
          vec3 col = mix(horizon, zenith, pow(h, lift));
          float s = dot(d, normalize(sunDir));
          col = mix(col, sunCol, smoothstep(1.0 - sunSize * 4.0, 1.0 - sunSize, s) * 0.35); // the glow round it
          col = mix(col, sunCol, smoothstep(1.0 - sunSize, 1.0 - sunSize * 0.6, s));         // the disc
          if (night > 0.3 && d.y > 0.02) { vec3 c = floor(d * 520.0); float st = step(0.99955, hash(c)); col += vec3(0.8, 0.85, 0.9) * st * (night - 0.3) * 1.3 * smoothstep(0.02, 0.3, d.y); }
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.56), this.mat); // the upper half and a lip under the horizon
    this.mesh.scale.setScalar(D.radius);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000; // behind everything: drawn first, never writes depth
    this.mesh.visible = false;
    g.scene.add(this.mesh);
    this._day = new THREE.Color(D.day); this._dusk = new THREE.Color(D.dusk); this._nightC = new THREE.Color(D.night); this._moon = new THREE.Color(D.moon);
  }

  // After the camera is placed (main.js frame): shown only in the body views; colours from the sky's own state.
  update() {
    const g = this.g, on = !!g.cam?.body?.() && !g.player?.ug;
    if (this.mesh.visible !== on) this.mesh.visible = on;
    if (!on) return;
    const S = g.sky, U = this.mat.uniforms, cam = g.camera;
    this.mesh.position.copy(cam.position);
    U.horizon.value.copy(S.fog.color);
    const n = S.night ?? 0, c = S.cur ?? {}, murk = Math.min(1, (c.clouds ?? 0) * D.murk.clouds + (c.dust ?? 0) * D.murk.dust + (c.ash ?? 0) * D.murk.ash);
    // the zenith: day blue -> (low sun) dusk -> night; weather pulls it toward the haze
    const Z = U.zenith.value;
    Z.copy(this._day).lerp(this._dusk, Math.max(0, Math.min(1, (S.low ?? 0) * (1 - n) * D.duskMix))).lerp(this._nightC, n).lerp(S.fog.color, murk);
    // the sun (or the moon): the light's own direction
    _dir.copy(S.sun.position).sub(S.sun.target.position).normalize();
    U.sunDir.value.copy(_dir);
    U.sunCol.value.copy(S.sun.color).lerp(this._moon, n).lerp(S.fog.color, murk * 0.8);
    U.sunSize.value = D.sun.size * (n > 0.5 ? D.sun.moon : 1);
    U.night.value = n * (1 - murk);
  }

  view() {
    const U = this.mat.uniforms, hex = (c) => `#${c.getHexString()}`;
    return { on: this.mesh.visible, horizon: hex(U.horizon.value), zenith: hex(U.zenith.value), sun: hex(U.sunCol.value), sunDir: [+U.sunDir.value.x.toFixed(2), +U.sunDir.value.y.toFixed(2), +U.sunDir.value.z.toFixed(2)], night: +U.night.value.toFixed(2), radius: this.mesh.scale.x };
  }
}
