import * as THREE from 'three';
import { clamp, lerp, smoothstep } from '../engine/rng.js';
import { SICK_SKY } from '../data/fannods.js';
import { SKY_FEEL, timeScaleFor } from '../data/looks.js';

// Time of day + weather. One directional light plays sun by day and moon by night.
export const WEATHER = {
  CLEAR:    { label: 'CLEAR',      fog: 0.0028, clouds: 0.0, rain: 0, dust: 0, ash: 0, storm: 0, tint: '#c8b08a' },
  OVERCAST: { label: 'OVERCAST',   fog: 0.0045, clouds: 0.6, rain: 0, dust: 0, ash: 0, storm: 0, tint: '#9a978e' },
  RAIN:     { label: 'RAIN',       fog: 0.0065, clouds: 0.85, rain: 1, dust: 0, ash: 0, storm: 0, tint: '#7d817f' },
  STORM:    { label: 'ACID STORM', fog: 0.0085, clouds: 1.0, rain: 1.6, dust: 0, ash: 0, storm: 1, tint: '#6b706a' },
  DUST:     { label: 'DUST STORM', fog: 0.022, clouds: 0.35, rain: 0, dust: 1, ash: 0, storm: 0, tint: '#b47a46' },
  FOG:      { label: 'FOG',        fog: 0.026, clouds: 0.5, rain: 0, dust: 0, ash: 0, storm: 0, tint: '#a8a59c' },
  ASHFALL:  { label: 'ASHFALL',    fog: 0.012, clouds: 0.7, rain: 0, dust: 0, ash: 1, storm: 0, tint: '#7c7872' },
  // THE FOUND THINGS (data/fannods.js SICK_SKY): rare, never in ORDER's roll. The sky goes a sick orange-green, the rain
  // comes down yellow and burns bare skin (systems/fannods.js); anyone with sense gets under a roof.
  SICKSKY:  { label: 'BURNING RAIN', fog: 0.0105, clouds: 1.0, rain: 1.35, dust: 0, ash: 0, storm: 0.55, tint: '#9c8f2c', burn: 1 },
};
const ORDER = ['CLEAR', 'OVERCAST', 'RAIN', 'STORM', 'DUST', 'FOG', 'ASHFALL'];

const RAIN_N = 2600, MOTE_N = 2400, BOX = 110, BOX_H = 50;
// update() runs every frame, so its colour blends use these constants and scratch objects instead
// of allocating ~10 THREE.Colors (and regex-parsing hex strings) per frame.
const BLENDED = ['fog', 'clouds', 'rain', 'dust', 'ash', 'storm'];
const RAIN_COL = new THREE.Color('#b9c4c8'), RAIN_BURN = new THREE.Color(SICK_SKY.rain), LIGHT_BURN = new THREE.Color(SICK_SKY.light); // the burning rain comes down yellow, under an orange-green light
const SUN_DAY = new THREE.Color('#fff4e0'), SUN_LOW = new THREE.Color('#ff9a52'), MOON = new THREE.Color('#a3b6cc');
const HEMI_DAY = new THREE.Color('#e4dccb'), HEMI_NIGHT = new THREE.Color('#6a82a0'), HEMI_LOW = new THREE.Color('#f0b884');
// Light levels. three.js r155+ no longer multiplies a light by pi, and these were never raised to match: noon in Rust
// Haven measured a mean of 53/255 on screen and the hour after sunset 11/255 (2026-10-23, Robert: "it's too dark, bro").
// [night, day] for the sun (the moon at night) and the sky fill. The night end is a range, picked by the pause menu's Night
// setting (Robert: nights "truly dark and scary"): NIGHT_I.sun/hemi [pitch, bright] at nightLight 0..1. The old night
// (1.5 / 1.55) is nightLight 1; the default 0.2 needs your light to see past a few metres.
const SUN_I = [1.5, 4.6], HEMI_I = [1.55, 2.0];
export const NEW_GAME_HOUR = 8; // a person's first day starts here (agents keep 18.6)
export const NIGHT_I = { sun: [0.1, 1.5], hemi: [0.16, 1.55], dflt: SKY_FEEL.night }; // the default was 0.12 until 2026-10-30 ("very very dark")
// Golden-hour fill: the camera looks straight down, so nearly everything on screen is flat ground, and a sun a few
// degrees up lights flat ground at a fifth of noon. Without help the hour either side of sunset read nearly black
// (Playwright capture, 17:42). The sky fill rises (x1 + GOLDEN_FILL) and warms while the sun is low but up; the long
// shadows stay, since only the sun's share is shadowed.
const GOLDEN_FILL = 0.75;
const GROUND_DAY = new THREE.Color('#9a7a58'), GROUND_NIGHT = new THREE.Color('#38342e'); // the bounce off sand
const FOG_DAY = new THREE.Color('#d6bf96'), FOG_DUSK = new THREE.Color('#e08850'), FOG_NIGHT = new THREE.Color('#1c232b'), LIGHTNING = new THREE.Color('#dfe8ee');
const _fog = new THREE.Color(), _night = new THREE.Color(), _below = new THREE.Color();

export class Sky {
  constructor(scene, audio) {
    this.scene = scene;
    this.audio = audio;
    // Hours. A person's new game opens on a morning (the first hours by daylight; the dark comes after you know the place,
    // and nights are truly dark now: WEB_LOOK §3.1b). Agents and the selftest (?agent=1, ?autostart) keep the old dusk
    // start their checks were written against. A loaded save brings its own clock.
    const agentPage = typeof location !== 'undefined' && /[?&](agent|autostart)/.test(location.search);
    this.time = agentPage ? 18.6 : NEW_GAME_HOUR;
    this.dayMinutes = SKY_FEEL.dayMinutes; this.testPin = null;
    this.timeScale = timeScaleFor(SKY_FEEL.dayMinutes); // in-game hours per real second (48 min a day = 0.5 game min / s; setDayMinutes)
    this.fast = false;
    this.weatherKey = 'CLEAR';
    this.target = { ...WEATHER.CLEAR };
    this.cur = { ...WEATHER.CLEAR };
    this.curTint = new THREE.Color(WEATHER.CLEAR.tint);
    this.targetTint = new THREE.Color(WEATHER.CLEAR.tint); this.tintKey = WEATHER.CLEAR.tint;
    this.nextWeatherIn = 60 * 4;
    this.flash = 0;
    this.thunderQueue = [];
    this.night = 0;
    this.nightLight = NIGHT_I.dflt; // 0 pitch .. 1 bright (the pause menu's Night setting, ui/qol.js)

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

  // The pause menu's Day length (ui/qol.js): real minutes a game day lasts.
  // The selftest battery pins its own (testPin = SKY_FEEL.testDayMinutes) so a menu apply mid-battery can't change the rate.
  setDayMinutes(m) { this.dayMinutes = Number(m) || SKY_FEEL.dayMinutes; this.timeScale = timeScaleFor(this.testPin ?? this.dayMinutes); return this.timeScale; }

  // viewR: the radius of ground on screen (main.js). The shadow box and the fog follow it, so a wide zoom has shadows
  // to its edges and doesn't wash out under the haze meant for a street-level view.
  update(dt, center, ground, roads, viewR = 30) {
    const half = Math.max(70, viewR * 1.05), sc = this.sun.shadow.camera;
    if (Math.abs(sc.right - half) > 4) {
      sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half; sc.updateProjectionMatrix();
      // Acne without peter-panning (docs/design/WEB_DEPTH_LAYERS.md): the normal offset follows the shadow texel (0.6 of
      // one), so a wide zoom's bigger texels don't stripe the ground and a close one's shadows stay at the foot.
      this.sun.shadow.normalBias = Math.max(0.04, (0.6 * 2 * half) / this.sun.shadow.mapSize.x);
    }
    const gameHours = dt * this.timeScale * (this.fast ? 40 : 1);
    this.time = (this.time + gameHours) % 24;
    this.nextWeatherIn -= dt * (this.fast ? 40 : 1);
    if (this.nextWeatherIn <= 0) {
      const roll = Math.random();
      this.setWeather(Math.random() < SICK_SKY.chance ? 'SICKSKY' : roll < 0.35 ? 'CLEAR' : ORDER[1 + Math.floor(Math.random() * (ORDER.length - 1))]); // the burning rain: rare (data/fannods.js)
    }

    // Ease weather parameters (~6s blend).
    const k = 1 - Math.exp(-dt / 2.5);
    for (let i = 0; i < BLENDED.length; i++) { const p = BLENDED[i]; this.cur[p] = lerp(this.cur[p], this.target[p], k); }
    this.cur.burn = lerp(this.cur.burn ?? 0, this.target.burn ?? 0, k); // the burning rain's (only its row has it)
    this.rain.material.color.copy(RAIN_COL).lerp(RAIN_BURN, this.cur.burn);
    if (this.target.tint !== this.tintKey) { this.tintKey = this.target.tint; this.targetTint.set(this.tintKey); } // parse once per weather change
    this.curTint.lerp(this.targetTint, k);

    // Sun path: up at 6:00, zenith at 12:00, down at 18:00.
    const ang = ((this.time - 6) / 12) * Math.PI;
    const elev = Math.sin(ang);
    const day = smoothstep(SKY_FEEL.twilight[0], SKY_FEEL.twilight[1], elev); // a long, readable dusk and dawn
    this.night = 1 - day;
    const c = this.cur;
    const cloudDim = 1 - 0.65 * c.clouds;

    let dirX, dirY, dirZ;
    if (elev > -0.05) { dirX = Math.cos(ang) * 0.8; dirY = Math.max(0.18, elev); dirZ = 0.35; }
    else { const ma = ang - Math.PI; dirX = Math.cos(ma) * 0.6; dirY = Math.max(0.35, Math.sin(ma)); dirZ = -0.3; }
    const len = Math.hypot(dirX, dirY, dirZ);
    const cy = center.y ?? 0; // real terrain (flag): the ground under the view is not at 0
    this.sun.position.set(center.x + (dirX / len) * 120, cy + (dirY / len) * 120, center.z + (dirZ / len) * 120);
    this.sun.target.position.set(center.x, cy, center.z);

    const low = 1 - smoothstep(0.05, 0.5, elev);
    this.sun.color.copy(SUN_DAY).lerp(SUN_LOW, low * 0.85).lerp(MOON, this.night);
    const nl = this.nightLight;
    this.sun.intensity = lerp(lerp(NIGHT_I.sun[0], NIGHT_I.sun[1], nl), SUN_I[1], day) * lerp(1, cloudDim, day * 0.7 + 0.3) * (1 - c.dust * 0.4);

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

    const golden = low * day; // 0 at noon and in the night, ~0.75 at 17:30
    this.hemi.intensity = lerp(lerp(NIGHT_I.hemi[0], NIGHT_I.hemi[1], nl), HEMI_I[1], day) * (1 + GOLDEN_FILL * golden) * (1 - 0.25 * c.clouds) + flicker * 2.5;
    this.hemi.color.copy(HEMI_DAY).lerp(HEMI_LOW, golden * 0.45).lerp(HEMI_NIGHT, this.night);
    this.hemi.groundColor.copy(GROUND_DAY).lerp(GROUND_NIGHT, this.night);
    if (this.cur.burn > 0.01) { this.hemi.color.lerp(LIGHT_BURN, 0.85 * this.cur.burn); this.sun.color.lerp(LIGHT_BURN, 0.75 * this.cur.burn); } // the burning rain: the light goes orange-green

    // Fog / sky colour.
    _fog.copy(FOG_DAY).lerp(this.curTint, Math.min(1, c.clouds + c.dust + c.ash)).lerp(FOG_DUSK, low * day * 0.35);
    _night.copy(this.curTint).multiplyScalar(0.2).lerp(FOG_NIGHT, 0.6); // night fog: dark blue with 40% of the dimmed weather tint
    _fog.lerp(_night, this.night);
    if (flicker) _fog.lerp(LIGHTNING, flicker * 0.6);
    this.fog.color.copy(_fog);
    this.scene.background.copy(_fog);
    this.fog.density = c.fog * (1 + this.night * 0.25) * Math.max(0.35, Math.min(1, 30 / viewR));

    // Wet ground in rain.
    const wet = clamp(c.rain, 0, 1);
    ground.roughness = lerp(0.96, 0.55, wet);
    roads.roughness = lerp(0.9, 0.28, wet);
    roads.metalness = lerp(0, 0.25, wet);
    ground.color.setScalar(lerp(1, 0.72, wet));
    roads.color.setScalar(lerp(1, 0.68, wet));

    this.updateRain(dt, center, c.rain);
    this.updateMotes(dt, center, c.dust, c.ash);
    // Below the street (systems/underground.js sets below 0..1 and the fill): no sun, no sky, a breath of fill, black fog.
    if (this.below > 0) {
      const b = this.below;
      this.sun.intensity *= 1 - b;
      this.hemi.intensity = lerp(this.hemi.intensity, this.belowFill ?? 0.02, b);
      this.hemi.color.lerp(_below.set(this.belowSky ?? '#2e3236'), b); this.hemi.groundColor.lerp(_below.set(this.belowGround ?? '#120f0c'), b);
      this.fog.color.lerp(_below.set('#000000'), b); this.scene.background.copy(this.fog.color);
      this.fog.density = lerp(this.fog.density, 0.004, b);
      if (b > 0.5) { this.rain.visible = false; this.motes.visible = false; }
    }
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
