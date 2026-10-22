import * as THREE from 'three';
import { clamp, lerp, smoothstep } from '../engine/rng.js';

// Time of day + weather. One directional light plays sun by day and moon by night.
export const WEATHER = {
  CLEAR:    { label: 'CLEAR',      fog: 0.0028, clouds: 0.0, rain: 0, dust: 0, ash: 0, storm: 0, tint: '#c8b08a' },
  OVERCAST: { label: 'OVERCAST',   fog: 0.0045, clouds: 0.6, rain: 0, dust: 0, ash: 0, storm: 0, tint: '#9a978e' },
  RAIN:     { label: 'RAIN',       fog: 0.0065, clouds: 0.85, rain: 1, dust: 0, ash: 0, storm: 0, tint: '#7d817f' },
  STORM:    { label: 'ACID STORM', fog: 0.0085, clouds: 1.0, rain: 1.6, dust: 0, ash: 0, storm: 1, tint: '#6b706a' },
  DUST:     { label: 'DUST STORM', fog: 0.022, clouds: 0.35, rain: 0, dust: 1, ash: 0, storm: 0, tint: '#b47a46' },
  FOG:      { label: 'FOG',        fog: 0.026, clouds: 0.5, rain: 0, dust: 0, ash: 0, storm: 0, tint: '#a8a59c' },
  ASHFALL:  { label: 'ASHFALL',    fog: 0.012, clouds: 0.7, rain: 0, dust: 0, ash: 1, storm: 0, tint: '#7c7872' },
};
const ORDER = ['CLEAR', 'OVERCAST', 'RAIN', 'STORM', 'DUST', 'FOG', 'ASHFALL'];

const RAIN_N = 2600, MOTE_N = 2400, BOX = 110, BOX_H = 50;

export class Sky {
  constructor(scene, audio) {
    this.scene = scene;
    this.audio = audio;
    this.time = 18.6;          // hours; start at dusk so night arrives fast
    this.timeScale = 1 / 30;   // in-game hours per real second (= 2 game min / s)
    this.fast = false;
    this.weatherKey = 'CLEAR';
    this.target = { ...WEATHER.CLEAR };
    this.cur = { ...WEATHER.CLEAR };
    this.curTint = new THREE.Color(WEATHER.CLEAR.tint);
    this.nextWeatherIn = 60 * 4;
    this.flash = 0;
    this.thunderQueue = [];
    this.night = 0;

    this.hemi = new THREE.HemisphereLight('#d9c7a6', '#4a3626', 0.9);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#fff2dc', 2.5);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 1; sc.far = 260;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.04;
    scene.add(this.sun, this.sun.target);

    this.fog = new THREE.FogExp2('#c8b08a', 0.003);
    scene.fog = this.fog;
    scene.background = new THREE.Color('#c8b08a');

    // Rain: streaks as line segments in a box that follows the camera.
    const rp = new Float32Array(RAIN_N * 6);
    this.rainSeed = new Float32Array(RAIN_N * 3);
    for (let i = 0; i < RAIN_N; i++) {
      this.rainSeed[i * 3] = (Math.random() - 0.5) * BOX;
      this.rainSeed[i * 3 + 1] = Math.random() * BOX_H;
      this.rainSeed[i * 3 + 2] = (Math.random() - 0.5) * BOX;
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(rp, 3).setUsage(THREE.DynamicDrawUsage));
    this.rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: '#b9c4c8', transparent: true, opacity: 0.45, depthWrite: false }));
    this.rain.frustumCulled = false;
    scene.add(this.rain);

    // Dust / ash motes.
    const mp = new Float32Array(MOTE_N * 3);
    this.moteSeed = new Float32Array(MOTE_N * 3);
    for (let i = 0; i < MOTE_N; i++) {
      this.moteSeed[i * 3] = (Math.random() - 0.5) * BOX;
      this.moteSeed[i * 3 + 1] = Math.random() * 30;
      this.moteSeed[i * 3 + 2] = (Math.random() - 0.5) * BOX;
    }
    const mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.BufferAttribute(mp, 3).setUsage(THREE.DynamicDrawUsage));
    this.motes = new THREE.Points(mg, new THREE.PointsMaterial({ color: '#c99a62', size: 0.35, transparent: true, opacity: 0.7, depthWrite: false }));
    this.motes.frustumCulled = false;
    scene.add(this.motes);
    this.windX = 6; this.windZ = 2;
  }

  setWeather(key) {
    this.weatherKey = key;
    this.target = { ...WEATHER[key] };
    this.nextWeatherIn = 60 * (3 + Math.random() * 5);
  }
  cycleWeather() { this.setWeather(ORDER[(ORDER.indexOf(this.weatherKey) + 1) % ORDER.length]); }
  get label() { return WEATHER[this.weatherKey].label; }
  get clock() {
    const h = Math.floor(this.time) % 24, m = Math.floor((this.time % 1) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  get phase() {
    const t = this.time;
    if (t >= 5 && t < 7.5) return 'DAWN';
    if (t >= 7.5 && t < 17.5) return 'DAY';
    if (t >= 17.5 && t < 20) return 'DUSK';
    return 'NIGHT';
  }

  update(dt, center, ground, roads) {
    const gameHours = dt * this.timeScale * (this.fast ? 40 : 1);
    this.time = (this.time + gameHours) % 24;
    this.nextWeatherIn -= dt * (this.fast ? 40 : 1);
    if (this.nextWeatherIn <= 0) {
      const roll = Math.random();
      this.setWeather(roll < 0.35 ? 'CLEAR' : ORDER[1 + Math.floor(Math.random() * (ORDER.length - 1))]);
    }

    // Ease weather parameters (~6s blend).
    const k = 1 - Math.exp(-dt / 2.5);
    for (const p of ['fog', 'clouds', 'rain', 'dust', 'ash', 'storm']) this.cur[p] = lerp(this.cur[p], this.target[p], k);
    this.curTint.lerp(new THREE.Color(this.target.tint), k);

    // Sun path: up at 6:00, zenith at 12:00, down at 18:00.
    const ang = ((this.time - 6) / 12) * Math.PI;
    const elev = Math.sin(ang);
    const day = smoothstep(-0.12, 0.22, elev);
    this.night = 1 - day;
    const c = this.cur;
    const cloudDim = 1 - 0.65 * c.clouds;

    let dirX, dirY, dirZ;
    if (elev > -0.05) { dirX = Math.cos(ang) * 0.8; dirY = Math.max(0.18, elev); dirZ = 0.35; }
    else { const ma = ang - Math.PI; dirX = Math.cos(ma) * 0.6; dirY = Math.max(0.35, Math.sin(ma)); dirZ = -0.3; }
    const len = Math.hypot(dirX, dirY, dirZ);
    this.sun.position.set(center.x + (dirX / len) * 120, (dirY / len) * 120, center.z + (dirZ / len) * 120);
    this.sun.target.position.set(center.x, 0, center.z);

    const low = 1 - smoothstep(0.05, 0.5, elev);
    const sunCol = new THREE.Color('#fff4e0').lerp(new THREE.Color('#ff9a52'), low * 0.85);
    const moonCol = new THREE.Color('#a3b6cc');
    this.sun.color.copy(sunCol).lerp(moonCol, this.night);
    this.sun.intensity = lerp(1.1, 2.7, day) * lerp(1, cloudDim, day * 0.7 + 0.3) * (1 - c.dust * 0.4);

    // Lightning.
    if (c.storm > 0.5 && Math.random() < dt * 0.12) {
      this.flash = 1;
      this.thunderQueue.push(0.4 + Math.random() * 1.8);
    }
    this.flash = Math.max(0, this.flash - dt * 3.2);
    for (let i = this.thunderQueue.length - 1; i >= 0; i--) {
      this.thunderQueue[i] -= dt;
      if (this.thunderQueue[i] <= 0) { this.audio?.thunder(); this.thunderQueue.splice(i, 1); }
    }
    const flicker = this.flash > 0 ? this.flash * (0.6 + Math.random() * 0.4) : 0;

    this.hemi.intensity = lerp(1.0, 1.05, day) * (1 - 0.25 * c.clouds) + flicker * 2.5;
    this.hemi.color.set('#d9c7a6').lerp(new THREE.Color('#5c7189'), this.night);
    this.hemi.groundColor.set('#5a4230').lerp(new THREE.Color('#2a2622'), this.night);

    // Fog / sky colour.
    const dayFog = new THREE.Color('#d6bf96').lerp(this.curTint, Math.min(1, c.clouds + c.dust + c.ash));
    dayFog.lerp(new THREE.Color('#e08850'), low * day * 0.35);
    const nightFog = new THREE.Color('#1c232b').lerp(this.curTint.clone().multiplyScalar(0.2), 0.4);
    const fogCol = dayFog.lerp(nightFog, this.night);
    if (flicker) fogCol.lerp(new THREE.Color('#dfe8ee'), flicker * 0.6);
    this.fog.color.copy(fogCol);
    this.scene.background.copy(fogCol);
    this.fog.density = c.fog * (1 + this.night * 0.25);

    // Wet ground in rain.
    const wet = clamp(c.rain, 0, 1);
    ground.roughness = lerp(0.96, 0.55, wet);
    roads.roughness = lerp(0.9, 0.28, wet);
    roads.metalness = lerp(0, 0.25, wet);
    ground.color.setScalar(lerp(1, 0.72, wet));
    roads.color.setScalar(lerp(1, 0.68, wet));

    this.updateRain(dt, center, c.rain);
    this.updateMotes(dt, center, c.dust, c.ash);
  }

  updateRain(dt, center, amount) {
    const n = Math.floor(clamp(amount / 1.6, 0, 1) * RAIN_N);
    this.rain.geometry.setDrawRange(0, n * 2);
    this.rain.visible = n > 0;
    if (!n) return;
    const pos = this.rain.geometry.attributes.position.array;
    const s = this.rainSeed;
    const fall = 46 * dt, wx = -0.18, wz = 0.06;
    for (let i = 0; i < n; i++) {
      let y = s[i * 3 + 1] - fall;
      if (y < 0) y += BOX_H;
      s[i * 3 + 1] = y;
      let x = s[i * 3] + fall * wx, z = s[i * 3 + 2] + fall * wz;
      if (x < -BOX / 2) x += BOX; if (z > BOX / 2) z -= BOX;
      s[i * 3] = x; s[i * 3 + 2] = z;
      const o = i * 6;
      pos[o] = center.x + x; pos[o + 1] = y; pos[o + 2] = center.z + z;
      pos[o + 3] = center.x + x - wx * 2.2; pos[o + 4] = y + 2.2; pos[o + 5] = center.z + z - wz * 2.2;
    }
    this.rain.geometry.attributes.position.needsUpdate = true;
  }

  updateMotes(dt, center, dust, ash) {
    const amt = Math.max(dust, ash);
    const n = Math.floor(clamp(amt, 0, 1) * MOTE_N);
    this.motes.geometry.setDrawRange(0, n);
    this.motes.visible = n > 0;
    if (!n) return;
    const m = this.motes.material;
    m.color.set(dust > ash ? '#c99a62' : '#bdbab4');
    m.size = dust > ash ? 0.32 : 0.42;
    m.opacity = (dust > ash ? 0.75 : 0.85) * (1 - this.night * 0.55);
    const pos = this.motes.geometry.attributes.position.array;
    const s = this.moteSeed;
    const speedX = dust > ash ? 26 : 2, speedZ = dust > ash ? 8 : 1, fall = dust > ash ? -1.5 : 3;
    const t = performance.now() * 0.001;
    for (let i = 0; i < n; i++) {
      let x = s[i * 3] + speedX * dt, y = s[i * 3 + 1] - fall * dt, z = s[i * 3 + 2] + speedZ * dt + Math.sin(t + i) * 0.02;
      if (x > BOX / 2) x -= BOX; if (z > BOX / 2) z -= BOX;
      if (y < 0) y += 30; if (y > 30) y -= 30;
      s[i * 3] = x; s[i * 3 + 1] = y; s[i * 3 + 2] = z;
      pos[i * 3] = center.x + x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = center.z + z;
    }
    this.motes.geometry.attributes.position.needsUpdate = true;
  }
}
