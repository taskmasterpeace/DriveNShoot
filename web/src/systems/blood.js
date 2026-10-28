import * as THREE from 'three';
import { RAY_BULLET, rayCircle } from '../engine/collision.js';
import { makeRng } from '../engine/rng.js';
import { BLOOD } from '../data/materials.js';

// Marks that stick to what they land on (docs/design/WEB_MATERIALS.md §Blood):
//   - blood on walls: a hit person sprays along the round's line onto the nearest wall, door, crate or car behind them
//     within BLOOD.reach (a splash, drips running down it to a stain at its foot), and the floor takes the rest
//     (systems/fx.js already throws the floor splatter, the pools under the downed and the drip trails);
//   - bullet holes, chips and scorch on the faces of whatever a round or a blast met (systems/materials.js);
//   - smears behind a body that is dragged (any body that moves while dead: the harpoon, a car pushing it);
//   - drying: every blood mark, on a wall or on the floor (fx's decals too), darkens from fresh arterial red toward
//     brown over game hours; rain washes away what is outdoors (not under a roof).
// One InstancedMesh (a ring of BLOOD.wallMax quads, any orientation) with a painted 8-tile atlas; no allocation after boot.

const TILE = { spray: 0, spray2: 1, drips: 2, smear: 3, hole_masonry: 4, hole_wood: 5, hole_metal: 6, scorch: 7 };
export const DECAL_TILE = TILE;
const _o = new THREE.Object3D(), _c = new THREE.Color(), _c2 = new THREE.Color(), _m = new THREE.Matrix4();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const FRESH = new THREE.Color(BLOOD.fresh), DRY = new THREE.Color(BLOOD.dry);
const r2 = (v) => Math.round(v * 100) / 100;
const WASH_E = [0, 1, 2, 8, 9, 10]; // a floor decal's x and z scale columns in its instance matrix

// The atlas: 4 x 2 tiles of 128 px. Blood tiles are white shapes (the instance colour makes them blood); the marks are
// grey (a dark hole, a pale crater) the instance colour tints.
function decalAtlas() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  const rng = makeRng(4242);
  // Tile t sits at canvas (t % 4) * 128, row 1 at the top (the texture's v runs bottom-up).
  const at = (t) => [(t % 4) * 128, (t < 4 ? 1 : 0) * 128];
  const blob = (x, y, r) => { g.beginPath(); g.arc(x, y, Math.max(0.5, r), 0, Math.PI * 2); g.fill(); };
  const spray = (t, seed) => {
    const [ox, oy] = at(t), R = makeRng(seed);
    g.save(); g.translate(ox, oy); g.fillStyle = '#fff'; g.strokeStyle = '#fff'; g.lineCap = 'round';
    blob(44, 64, 17); blob(54, 60, 12); blob(36, 70, 10);
    // Droplets and streaks flung along +u (the round's way), thinning out.
    for (let i = 0; i < 70; i++) {
      const d = R.range(8, 78), a = R.range(-0.55, 0.55) * (1 - d / 120);
      blob(44 + Math.cos(a) * d, 64 + Math.sin(a) * d * 0.8, R.range(0.8, 5) * (1 - d / 95));
    }
    for (let i = 0; i < 9; i++) {
      const a = R.range(-0.35, 0.35), d = R.range(40, 80);
      g.lineWidth = R.range(1.2, 3.2);
      g.beginPath(); g.moveTo(48, 64); g.lineTo(48 + Math.cos(a) * d, 64 + Math.sin(a) * d * 0.7); g.stroke();
    }
    g.restore();
  };
  spray(TILE.spray, 11); spray(TILE.spray2, 23);
  { // drips: a smear at the top, runs down the face
    const [ox, oy] = at(TILE.drips); g.save(); g.translate(ox, oy); g.fillStyle = '#fff'; g.strokeStyle = '#fff'; g.lineCap = 'round';
    blob(64, 22, 14); blob(52, 26, 9); blob(76, 24, 8);
    for (let i = 0; i < 7; i++) {
      const x = 46 + i * 6 + rng.range(-2, 2), len = rng.range(30, 98);
      g.lineWidth = rng.range(1.5, 3.8);
      g.beginPath(); g.moveTo(x, 24); g.lineTo(x + rng.range(-2, 2), 24 + len); g.stroke();
      blob(x, 24 + len, g.lineWidth * 0.8);
    }
    g.restore();
  }
  { // smear: a body dragged along +u
    const [ox, oy] = at(TILE.smear); g.save(); g.translate(ox, oy); g.fillStyle = '#fff';
    for (let x = 4; x < 124; x += 2) {
      const w = 22 + Math.sin(x * 0.07) * 6 + rng.range(-3, 3);
      g.globalAlpha = 0.35 + 0.5 * rng(); g.fillRect(x, 64 - w / 2 + rng.range(-2, 2), 3, w);
    }
    g.globalAlpha = 1; for (let i = 0; i < 18; i++) blob(rng.range(6, 122), 64 + rng.range(-16, 16), rng.range(1, 3.5));
    g.restore();
  }
  const hole = (t, kind) => {
    const [ox, oy] = at(t); g.save(); g.translate(ox, oy);
    if (kind === 'masonry') {
      g.fillStyle = 'rgba(235,232,225,0.95)'; // the pale crater where the face chipped off
      g.beginPath(); for (let i = 0; i <= 18; i++) { const a = (i / 18) * Math.PI * 2, r = 30 + rng.range(-9, 9); g.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r); } g.fill();
      g.strokeStyle = 'rgba(40,36,32,0.7)'; g.lineWidth = 1.5;
      for (let i = 0; i < 6; i++) { const a = rng() * Math.PI * 2; g.beginPath(); g.moveTo(64 + Math.cos(a) * 14, 64 + Math.sin(a) * 14); g.lineTo(64 + Math.cos(a) * rng.range(34, 54), 64 + Math.sin(a) * rng.range(34, 54)); g.stroke(); }
      g.fillStyle = 'rgba(55,50,45,1)'; blob(64, 64, 15);
    } else if (kind === 'wood') {
      g.fillStyle = 'rgba(240,220,190,0.95)'; // raw wood torn out round it
      for (let i = 0; i < 9; i++) { const a = rng.range(-0.4, 0.4) + (i % 2 ? Math.PI : 0); g.beginPath(); g.moveTo(64, 64); g.lineTo(64 + Math.cos(a - 0.12) * rng.range(30, 56), 64 + Math.sin(a - 0.12) * 18); g.lineTo(64 + Math.cos(a + 0.12) * rng.range(30, 56), 64 + Math.sin(a + 0.12) * 18); g.fill(); }
      g.fillStyle = 'rgba(30,22,16,1)'; blob(64, 64, 12);
    } else {
      g.strokeStyle = 'rgba(250,248,240,0.95)'; g.lineWidth = 7; g.beginPath(); g.arc(64, 64, 22, 0, Math.PI * 2); g.stroke(); // bright dented ring
      g.fillStyle = 'rgba(25,24,22,1)'; blob(64, 64, 12);
    }
    g.restore();
  };
  hole(TILE.hole_masonry, 'masonry'); hole(TILE.hole_wood, 'wood'); hole(TILE.hole_metal, 'metal');
  { // scorch: a soft black blotch
    const [ox, oy] = at(TILE.scorch); g.save(); g.translate(ox, oy);
    const gr = g.createRadialGradient(64, 64, 6, 64, 64, 60); gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128); g.restore();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return tex;
}

export class Blood {
  constructor(game) {
    this.g = game;
    const N = BLOOD.wallMax;
    this.N = N;
    this.hours = 0;      // game hours since boot (drying and washing run on this; in the save)
    this.dryT = 0;
    const geo = new THREE.PlaneGeometry(1, 1);
    this.aTile = new THREE.InstancedBufferAttribute(new Float32Array(N), 1);
    this.aFade = new THREE.InstancedBufferAttribute(new Float32Array(N), 1);
    geo.setAttribute('aTile', this.aTile); geo.setAttribute('aFade', this.aFade);
    const mat = new THREE.MeshLambertMaterial({ map: decalAtlas(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aTile;\nattribute float aFade;\nvarying float vFade;')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\n vMapUv = (vMapUv + vec2(mod(aTile, 4.0), floor(aTile / 4.0))) * vec2(0.25, 0.5);\n#endif\n vFade = aFade;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vFade;')
        .replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.a *= vFade;');
    };
    mat.customProgramCacheKey = () => 'decalAtlas1';
    this.mesh = new THREE.InstancedMesh(geo, mat, N);
    for (let i = 0; i < N; i++) { this.mesh.setMatrixAt(i, ZERO); this.mesh.setColorAt(i, _c.set(0, 0, 0)); }
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    this.mesh.renderOrder = 3;
    this.mesh.count = 0;
    this.mesh.visible = false;
    game.scene.add(this.mesh);
    // Per decal (struct of arrays): where, which way it faces, its size and roll, its tile, its fresh colour, when it
    // was laid (game hours), how washed it is, whether it is blood, outdoors (-1 not yet asked) and alive.
    this.d = {
      x: new Float32Array(N), y: new Float32Array(N), z: new Float32Array(N), nx: new Float32Array(N), ny: new Float32Array(N), nz: new Float32Array(N),
      w: new Float32Array(N), h: new Float32Array(N), roll: new Float32Array(N), tile: new Uint8Array(N), rgb: new Float32Array(N * 3),
      born: new Float32Array(N), wash: new Float32Array(N), blood: new Uint8Array(N), out: new Int8Array(N), alive: new Uint8Array(N), k: new Float32Array(N),
    };
    this.next = 0; this.used = 0;
    this.attached = []; // { i, v, lx, lz, rot } decals riding on a car's roof
    // Bodies being dragged: last place each dead body was seen.
    this.bodies = new Map(); this.bodyT = 0;
    // fx's floor decals (blood ones dry and wash too): what we last wrote, per index.
    const D = game.fx.dBlood.length;
    this.fxK = new Float32Array(D).fill(-1); this.fxBorn = new Float32Array(D).fill(-1); this.fxOut = new Int8Array(D); this.fxScale = new Float32Array(D).fill(1);
    this.stats = { wall: 0, car: 0, smear: 0, washed: 0 };
    game.fx.scorch = (x, z, size, color) => this.scorch(x, z, size, color); // explosions burn the ground softly too
  }

  // ---- laying a decal ----------------------------------------------------------------------------------------------
  // A quad at (x, y, z) facing (nx, ny, nz) (a wall's face, or straight up for the floor), w x h, rolled about its normal.
  add(tile, x, y, z, nx, ny, nz, w, h, roll, color, blood = false) {
    const i = this.next, d = this.d;
    this.next = (i + 1) % this.N;
    if (!d.alive[i]) this.used++;
    for (let k = this.attached.length - 1; k >= 0; k--) if (this.attached[k].i === i) this.attached.splice(k, 1);
    d.x[i] = x; d.y[i] = y; d.z[i] = z; d.nx[i] = nx; d.ny[i] = ny; d.nz[i] = nz; d.w[i] = w; d.h[i] = h; d.roll[i] = roll; d.tile[i] = tile;
    _c.set(color); d.rgb[i * 3] = _c.r; d.rgb[i * 3 + 1] = _c.g; d.rgb[i * 3 + 2] = _c.b;
    d.born[i] = this.hours; d.wash[i] = 0; d.blood[i] = blood ? 1 : 0; d.out[i] = -1; d.alive[i] = 1; d.k[i] = 0;
    this.aTile.array[i] = tile; this.aFade.array[i] = 1;
    this.aTile.needsUpdate = true; this.aFade.needsUpdate = true;
    this.write(i);
    this.mesh.setColorAt(i, _c);
    this.mesh.instanceColor.needsUpdate = true;
    if (i + 1 > this.mesh.count) this.mesh.count = i + 1;
    this.mesh.visible = true;
    return i;
  }

  write(i, m = null) {
    const d = this.d;
    if (d.ny[i] > 0.5) _o.rotation.set(-Math.PI / 2, 0, d.roll[i]); // on the floor (or a roof): roll is its heading
    else _o.rotation.set(0, Math.atan2(d.nx[i], d.nz[i]), d.roll[i]);
    _o.position.set(d.x[i], d.y[i], d.z[i]);
    _o.scale.set(d.w[i], d.h[i], 1);
    _o.updateMatrix();
    if (m) _o.matrix.premultiply(m);
    this.mesh.setMatrixAt(i, _o.matrix);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  kill(i) {
    const d = this.d;
    if (!d.alive[i]) return;
    d.alive[i] = 0; this.used--;
    this.mesh.setMatrixAt(i, ZERO); this.mesh.instanceMatrix.needsUpdate = true;
  }

  // A mark on a face where a round or a blast met it (systems/materials.js).
  mark(tile, x, y, z, nx, nz, size, color) {
    return this.add(tile, x + nx * 0.03, y, z + nz * 0.03, nx, 0, nz, size, size, Math.random() * 6.283, color, false);
  }

  // A burn on the floor: a soft black blotch (a fire's scorch, the ash where something burnt down).
  scorch(x, z, size, color = '#15110e') {
    return this.add(TILE.scorch, x, 0.135, z, 0, 1, 0, size, size * (0.8 + Math.random() * 0.3), Math.random() * 6.283, color, false);
  }

  // ---- a hit person bleeds onto what is behind them -------------------------------------------------------------
  // (dx, dz) the round's way (unit), dmg how hard; big = a killing blow. Returns what took the blood.
  splash(c, dx, dz, dmg, big = false) {
    const g = this.g, S = g.statics;
    const dl = Math.hypot(dx, dz);
    if (dl < 0.1) return null;
    if (c._splashT === g.time && !big && Math.random() < 0.7) return null; // a shotgun's pellets: not a splash each
    c._splashT = g.time;
    dx /= dl; dz /= dl;
    const fy = c.storey ? c.gy ?? 0 : 0, fyr = fy - (c.storey?.y0 ?? 0), up = fyr > 0.5; // fyr: the floor above its own ground (a building on raised land, WEB_SITES_TERRAIN)
    const ox = c.x + dx * 0.3, oz = c.z + dz * 0.3, reach = BLOOD.reach;
    let t = S.raycast(ox, oz, dx, dz, reach, RAY_BULLET, up ? fyr + 1.3 : -1);
    const box = S.hit.box;
    let nx = S.hit.nx, nz = S.hit.nz;
    // A car behind them takes it on its roof and doors (it rides along with the car).
    let car = null;
    if (!up) for (const v of g.vehicles) {
      if (v === c.inVehicle || Math.abs(v.x - c.x) > 6 || Math.abs(v.z - c.z) > 6) continue;
      const tv = rayCircle(ox, oz, dx, dz, v.x, v.z, v.wid * 0.6, t);
      if (tv >= 0 && tv < t) { t = tv; car = v; }
    }
    const s = (0.55 + Math.min(1.2, dmg / 50)) * (1.15 - (t / reach) * 0.45) * (big ? 1.35 : 1);
    if (car) {
      const hx = ox + dx * t, hz = oz + dz * t, lx = hx - car.x, lz = hz - car.z, ch = Math.cos(car.h), sh = Math.sin(car.h);
      const i = this.add(Math.random() < 0.5 ? TILE.spray : TILE.spray2, hx, 1.45, hz, 0, 1, 0, s * 1.3, s, Math.atan2(-dz, dx), BLOOD.fresh, true);
      // Car frame: x across (cos h, -sin h), z along (sin h, cos h).
      this.attached.push({ i, v: car, lx: lx * ch - lz * sh, lz: lx * sh + lz * ch, rot: Math.atan2(-dz, dx) - car.h });
      this.stats.car++;
      return { on: 'car', id: car.id, t: r2(t) };
    }
    if (!box || t >= reach) return null;
    const hx = ox + dx * t, hz = oz + dz * t;
    if (box.op) { nx = g.interiors.nx; nz = g.interiors.nz; }
    const cosI = -(dx * nx + dz * nz); // 1: square on
    const along = dx * nz - dz * nx;   // which way along the face the spray runs (the tile's +u is (nz, -nx))
    const y = fy + 1.4 + (Math.random() - 0.5) * 0.35 - t * 0.1; // chest height, falling off with the distance it flew
    const w = s * (1.25 + (1 - Math.max(0.2, cosI)) * 1.2), h = s * 0.85;
    const roll = along >= 0 ? -0.22 : Math.PI + 0.22;
    this.add(Math.random() < 0.5 ? TILE.spray : TILE.spray2, hx + nx * 0.04, y, hz + nz * 0.04, nx, 0, nz, w, h, roll, BLOOD.fresh, true);
    if (big || dmg > 14) {
      // It runs down the face and pools at its foot (the floor decal is what reads from straight above).
      const dh = Math.min(y - fy - 0.05, s * 1.5);
      this.add(TILE.drips, hx + nx * 0.045, y - dh * 0.42, hz + nz * 0.045, nx, 0, nz, s * 0.7, dh, 0, BLOOD.fresh, true);
      g.fx.decal(hx + nx * 0.3, hz + nz * 0.3, s * (big ? 1.0 : 0.65), '#4e0303', Math.random() * 6.283, fy + 0.13);
    }
    this.stats.wall++;
    return { on: box.op ? box.op.kind : box.tag, t: r2(t), x: r2(hx), z: r2(hz) };
  }

  // Take away every mark on a stretch of face that is gone (a breach, a crate that broke): inside the box (grown by 0.1).
  clearIn(x0, z0, x1, z1, y0 = -1, y1 = 99) {
    const d = this.d;
    for (let i = 0; i < this.N; i++) {
      if (!d.alive[i] || d.ny[i] > 0.5) continue;
      if (d.x[i] > x0 - 0.1 && d.x[i] < x1 + 0.1 && d.z[i] > z0 - 0.1 && d.z[i] < z1 + 0.1 && d.y[i] >= y0 && d.y[i] <= y1) this.kill(i);
    }
  }

  // ---- the clock: drying, washing, smears, riding cars ------------------------------------------------------------
  update(dt) {
    const g = this.g, sky = g.sky;
    this.hours += dt * (sky.timeScale ?? 1 / 60) * (sky.fast ? 40 : 1);
    g.fx.clock = this.hours;
    // Decals riding on a car.
    for (let k = this.attached.length - 1; k >= 0; k--) {
      const a = this.attached[k], v = a.v;
      if (!this.d.alive[a.i] || !g.vehicles.includes(v)) { this.kill(a.i); this.attached.splice(k, 1); continue; }
      const ch = Math.cos(v.h), sh = Math.sin(v.h);
      const d = this.d;
      d.x[a.i] = v.x + a.lx * ch + a.lz * sh; d.z[a.i] = v.z - a.lx * sh + a.lz * ch; d.roll[a.i] = a.rot + v.h;
      this.write(a.i);
    }
    // Dragged bodies leave smears.
    this.bodyT -= dt;
    const seen = this.bodyT <= 0;
    if (seen) this.bodyT = 2;
    for (const c of g.chars) {
      if (c.alive || c.inVehicle || c.hidden) continue;
      const p = this.bodies.get(c);
      if (!p) { this.bodies.set(c, { x: c.x, z: c.z, acc: 0, t: g.time }); continue; }
      p.t = g.time;
      const mx = c.x - p.x, mz = c.z - p.z, m = Math.hypot(mx, mz);
      if (m < 0.04) continue;
      if (m > 4) { p.x = c.x; p.z = c.z; p.acc = 0; continue; } // teleported, not dragged
      p.acc += m;
      if (p.acc >= BLOOD.smearEvery && (c.blood ?? 1) > 0.15) {
        const fy = c.storey ? c.gy ?? 0 : 0;
        this.add(TILE.smear, (c.x + p.x) / 2 - mx * 0.0, fy + 0.15, (c.z + p.z) / 2, 0, 1, 0, p.acc + 0.35, 0.55, Math.atan2(-mz, mx), BLOOD.fresh, true);
        this.stats.smear++;
        p.acc = 0;
      }
      p.x = c.x; p.z = c.z;
    }
    if (seen) for (const [c, p] of this.bodies) if (g.time - p.t > 1.5) this.bodies.delete(c);
    this.dryT -= dt;
    if (this.dryT <= 0) { this.dryT = 0.5; this.dryPass(); }
  }

  outdoors(x, z) {
    const g = this.g;
    const isl = Math.abs(x) < 464 && Math.abs(z) < 464;
    if (isl) {
      for (const b of g.world.buildings) if (x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ) return !!b.ruined;
      return true;
    }
    const r = g.streamer?.ringBuildingAt?.(x, z);
    return r ? !!r.ruined : true;
  }

  dryPass() {
    const g = this.g, d = this.d, H = this.hours, rain = Math.min(1, g.sky.cur?.rain ?? 0);
    const dh = this.lastDry === undefined ? 0 : Math.max(0, H - this.lastDry);
    this.lastDry = H;
    let col = false, fade = false;
    for (let i = 0; i < this.N; i++) {
      if (!d.alive[i]) continue;
      if (rain > 0.05 && dh > 0) {
        if (d.out[i] < 0) d.out[i] = this.outdoors(d.x[i] + d.nx[i] * 0.4, d.z[i] + d.nz[i] * 0.4) ? 1 : 0;
        if (d.out[i] === 1 && (d.blood[i] || d.tile[i] === TILE.scorch)) {
          d.wash[i] += dh * BLOOD.washPerHour * rain;
          if (d.wash[i] >= 1) { this.kill(i); this.stats.washed++; continue; }
          this.aFade.array[i] = 1 - d.wash[i]; fade = true;
        }
      }
      if (!d.blood[i]) continue;
      const k = 1 - Math.exp(-(H - d.born[i]) / BLOOD.dryHours);
      if (k - d.k[i] < 0.01) continue;
      d.k[i] = k;
      _c.setRGB(d.rgb[i * 3], d.rgb[i * 3 + 1], d.rgb[i * 3 + 2]).lerp(DRY, k);
      this.mesh.setColorAt(i, _c); col = true;
    }
    if (col) this.mesh.instanceColor.needsUpdate = true;
    if (fade) this.aFade.needsUpdate = true;
    // The floor's blood (systems/fx.js decals): dry it, and shrink what the rain washes.
    const fx = g.fx, M = fx.dMesh, cArr = M.instanceColor.array, mArr = M.instanceMatrix.array;
    let fcol = false, fmat = false;
    for (let i = 0; i < fx.dBlood.length; i++) {
      if (!fx.dBlood[i]) continue;
      if (this.fxBorn[i] !== fx.dBorn[i]) { this.fxBorn[i] = fx.dBorn[i]; this.fxK[i] = -1; this.fxOut[i] = -1; this.fxScale[i] = 1; }
      const k = 1 - Math.exp(-(H - fx.dBorn[i]) / BLOOD.dryHours);
      if (k - this.fxK[i] >= 0.01) {
        this.fxK[i] = k;
        _c2.setRGB(fx.dRGB[i * 3], fx.dRGB[i * 3 + 1], fx.dRGB[i * 3 + 2]).lerp(DRY, k);
        cArr[i * 3] = _c2.r; cArr[i * 3 + 1] = _c2.g; cArr[i * 3 + 2] = _c2.b; fcol = true;
      }
      if (rain > 0.05 && dh > 0 && this.fxScale[i] > 0) {
        if (this.fxOut[i] < 0) this.fxOut[i] = this.outdoors(mArr[i * 16 + 12], mArr[i * 16 + 14]) ? 1 : 0;
        let growing = false;
        for (let q = 0; q < fx.growing.length; q++) if (fx.growing[q].i === i) { growing = true; break; }
        if (this.fxOut[i] === 1 && !growing) {
          const s0 = this.fxScale[i], s1 = Math.max(0, s0 - dh * BLOOD.washPerHour * rain);
          const r = s0 > 0 ? s1 / s0 : 0;
          for (let e = 0; e < 6; e++) mArr[i * 16 + WASH_E[e]] *= r;
          this.fxScale[i] = s1; fmat = true;
          if (s1 <= 0) { fx.dBlood[i] = 0; this.stats.washed++; }
        }
      }
    }
    if (fcol) M.instanceColor.needsUpdate = true;
    if (fmat) M.instanceMatrix.needsUpdate = true;
  }

  // ---- agent view + save --------------------------------------------------------------------------------------------
  // How dry a decal is (0 fresh .. 1 brown) and its colour now.
  info(i) {
    const d = this.d;
    this.mesh.getColorAt(i, _c);
    return { i, tile: Object.keys(TILE).find((k) => TILE[k] === d.tile[i]), x: r2(d.x[i]), y: r2(d.y[i]), z: r2(d.z[i]), facing: d.ny[i] > 0.5 ? 'up' : { x: r2(d.nx[i]), z: r2(d.nz[i]) },
      blood: !!d.blood[i], ageHours: r2(this.hours - d.born[i]), dry: r2(d.k[i]), washed: r2(d.wash[i]), outdoors: d.out[i] < 0 ? null : !!d.out[i], color: `#${_c.getHexString()}`, value: +Math.max(_c.r, _c.g, _c.b).toFixed(4) };
  }
  near(x, z, r = 4, blood = null) {
    const d = this.d, out = [];
    for (let i = 0; i < this.N; i++) if (d.alive[i] && (blood === null || !!d.blood[i] === blood) && Math.hypot(d.x[i] - x, d.z[i] - z) <= r) out.push(i);
    return out;
  }
  view(x, z, r = 6) {
    const near = this.near(x, z, r);
    return { hours: r2(this.hours), alive: this.used, cap: this.N, stats: { ...this.stats }, near: near.length, items: near.slice(-20).map((i) => this.info(i)) };
  }
  save() {
    const d = this.d, list = [];
    for (let k = 0; k < this.N; k++) {
      const i = (this.next + k) % this.N; // oldest first, so the ring comes back in the same order
      if (!d.alive[i] || this.attached.some((a) => a.i === i)) continue;
      _c.setRGB(d.rgb[i * 3], d.rgb[i * 3 + 1], d.rgb[i * 3 + 2]);
      list.push([d.tile[i], r2(d.x[i]), r2(d.y[i]), r2(d.z[i]), r2(d.nx[i]), r2(d.ny[i]), r2(d.nz[i]), r2(d.w[i]), r2(d.h[i]), r2(d.roll[i]), _c.getHexString(), r2(d.born[i]), r2(d.wash[i]), d.blood[i]]);
    }
    return { hours: r2(this.hours), d: list };
  }
  load(s) {
    for (let i = 0; i < this.N; i++) this.kill(i);
    this.attached.length = 0; this.next = 0; this.used = 0; this.mesh.count = 0; this.bodies.clear();
    this.hours = s?.hours ?? this.hours;
    this.fxK.fill(-1); this.fxBorn.fill(-1);
    for (const q of s?.d ?? []) {
      const i = this.add(q[0], q[1], q[2], q[3], q[4], q[5], q[6], q[7], q[8], q[9], `#${q[10]}`, !!q[13]);
      this.d.born[i] = q[11]; this.d.wash[i] = q[12]; this.aFade.array[i] = 1 - q[12];
    }
    this.aFade.needsUpdate = true;
    this.lastDry = undefined;
    this.dryPass();
    if (!this.used) this.mesh.visible = false;
  }
}
