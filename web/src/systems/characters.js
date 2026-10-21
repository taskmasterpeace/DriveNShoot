import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// All humans share ~19 InstancedMeshes (one per body part / hat / gear variant).
// 160 characters still cost the same ~19 draw calls. Limb geometry is built with
// its pivot at the joint, so a limb transform is just base * T(joint) * R(swing).
export const MAX_CHARS = 160;

const _base = new THREE.Matrix4();
const _m = new THREE.Matrix4();
const _t = new THREE.Matrix4();
const _r = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _one = new THREE.Vector3(1, 1, 1);
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const _c = new THREE.Color();
const _blood = new THREE.Color('#4a0606');
const _soot = new THREE.Color('#141110');

export const HATS = ['short', 'cap', 'cowboy', 'mohawk', 'wrap'];
export const GEAR = ['none', 'vest', 'pack', 'pads'];

export class Character {
  constructor(slot, opts) {
    this.slot = slot;
    this.x = opts.x; this.z = opts.z;
    this.vx = 0; this.vz = 0;
    this.face = opts.face ?? Math.random() * Math.PI * 2;
    this.hp = opts.hp ?? 100;
    this.maxHp = this.hp;
    this.faction = opts.faction ?? 'drifter';
    this.name = opts.name ?? null;
    this.npc = opts.npc ?? null;           // dialogue definition for named NPCs
    this.weapon = opts.weapon ?? null;      // weapon key or null
    this.colors = opts.colors;
    this.alive = true;
    this.walk = 0;
    this.speed = 0;
    this.aiming = false;
    this.radius = 0.4;
    this.home = { x: opts.x, z: opts.z };
    this.state = 'idle';
    this.timer = Math.random() * 3;
    this.target = null;
    this.cool = 0;
    this.mag = 0;
    this.reloading = 0;
    this.deadTime = 0;
    this.inVehicle = null;
    this.hidden = false;
    this.bleed = 0;
    this.blood = 0;          // 0..1 how soaked the clothes are
    this.headless = false;   // head popped (explosions, point-blank shotgun, harpoon yank)
    this.neckSpray = 0;
    this.lastAttacker = null;
    this.dragged = null;
    this.flee = 0;
    this.wx = this.x; this.wz = this.z;
  }
}

// ---- geometry ---------------------------------------------------------------------
function tinted(geo, hex) {
  const c = new THREE.Color(hex), n = geo.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  if (geo.index) geo = geo.toNonIndexed();
  return geo;
}
const ni = (g) => (g.index ? g.toNonIndexed() : g);

function buildGeometries() {
  const G = {};
  G.torso = new RoundedBoxGeometry(0.6, 0.66, 0.34, 1, 0.09);
  G.hips = new RoundedBoxGeometry(0.54, 0.24, 0.32, 1, 0.07);
  G.head = new THREE.SphereGeometry(0.205, 10, 7); G.head.scale(1, 1.12, 1.02);
  // Face: eyes, brow, nose — dark, facing +z so you can read where someone looks.
  G.face = mergeGeometries([
    ni(new THREE.BoxGeometry(0.06, 0.035, 0.03).translate(-0.075, 0.03, 0.195)),
    ni(new THREE.BoxGeometry(0.06, 0.035, 0.03).translate(0.075, 0.03, 0.195)),
    ni(new THREE.BoxGeometry(0.2, 0.025, 0.03).translate(0, 0.085, 0.19)),
    ni(new THREE.BoxGeometry(0.045, 0.07, 0.05).translate(0, -0.03, 0.21)),
  ]);
  // Legs: thigh+shin capsule with a boot (vertex-tinted dark), pivot at the hip.
  G.leg = mergeGeometries([
    tinted(new THREE.CapsuleGeometry(0.11, 0.6, 2, 7).translate(0, -0.41, 0), '#ffffff'),
    tinted(new RoundedBoxGeometry(0.22, 0.14, 0.34, 1, 0.04).translate(0, -0.79, 0.05), '#3a3a3a'),
  ]);
  // Arms: sleeve capsule, pivot at the shoulder. Hands are their own (skin-coloured) mesh.
  G.arm = new THREE.CapsuleGeometry(0.075, 0.44, 2, 6).translate(0, -0.3, 0);
  G.hand = new THREE.SphereGeometry(0.075, 6, 4).translate(0, -0.6, 0);
  // Hats / hair variants (pivot at head centre).
  G.short = new THREE.SphereGeometry(0.215, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2.1).translate(0, 0.04, -0.01);
  G.cap = mergeGeometries([
    ni(new THREE.SphereGeometry(0.218, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2.2).translate(0, 0.05, 0)),
    ni(new THREE.BoxGeometry(0.26, 0.025, 0.16).translate(0, 0.07, 0.24)),
  ]);
  G.cowboy = mergeGeometries([
    ni(new THREE.CylinderGeometry(0.4, 0.4, 0.03, 16).translate(0, 0.12, 0)),
    ni(new THREE.CylinderGeometry(0.15, 0.19, 0.19, 12).translate(0, 0.22, 0)),
  ]);
  G.mohawk = new THREE.BoxGeometry(0.06, 0.13, 0.36).translate(0, 0.24, -0.02);
  G.wrap = new THREE.SphereGeometry(0.24, 12, 8, 0, Math.PI * 2, 0, Math.PI / 1.6).translate(0, 0.02, -0.02);
  // Gear.
  G.vest = new RoundedBoxGeometry(0.64, 0.5, 0.4, 1, 0.06).translate(0, 0.04, 0);
  G.pack = mergeGeometries([
    ni(new RoundedBoxGeometry(0.42, 0.48, 0.2, 1, 0.06).translate(0, 0.02, -0.27)),
    ni(new THREE.CylinderGeometry(0.07, 0.07, 0.42, 8).rotateZ(Math.PI / 2).translate(0, 0.3, -0.27)),
  ]);
  const spike = (x) => ni(new THREE.ConeGeometry(0.045, 0.16, 6).translate(x, 0.43, 0));
  G.pads = mergeGeometries([
    ni(new RoundedBoxGeometry(0.24, 0.12, 0.3, 1, 0.04).translate(-0.33, 0.33, 0)),
    ni(new RoundedBoxGeometry(0.24, 0.12, 0.3, 1, 0.04).translate(0.33, 0.33, 0)),
    spike(-0.36), spike(-0.28), spike(0.28), spike(0.36),
  ]);
  G.gun = mergeGeometries([
    ni(new THREE.BoxGeometry(0.08, 0.1, 0.5)),
    ni(new THREE.BoxGeometry(0.07, 0.16, 0.08).translate(0, -0.1, -0.12)),
    ni(new THREE.CylinderGeometry(0.025, 0.025, 0.18, 6).rotateX(Math.PI / 2).translate(0, 0.02, 0.33)),
  ]);
  return G;
}

export class CharacterRenderer {
  constructor(scene) {
    const G = buildGeometries();
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.82 });
    const vmat = new THREE.MeshStandardMaterial({ roughness: 0.82, vertexColors: true });
    const make = (geo, material = mat, colored = true) => {
      const mesh = new THREE.InstancedMesh(geo, material, MAX_CHARS);
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      for (let i = 0; i < MAX_CHARS; i++) { mesh.setMatrixAt(i, ZERO); if (colored) mesh.setColorAt(i, _c.set('#888')); }
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(mesh);
      return mesh;
    };
    this.meshes = {
      torso: make(G.torso), hips: make(G.hips), head: make(G.head),
      face: make(G.face, new THREE.MeshStandardMaterial({ color: '#1c1410', roughness: 0.9 }), false),
      legL: make(G.leg, vmat), legR: make(G.leg, vmat), armL: make(G.arm), armR: make(G.arm),
      handL: make(G.hand), handR: make(G.hand),
      gun: make(G.gun, new THREE.MeshStandardMaterial({ color: '#1d1d1d', metalness: 0.6, roughness: 0.4 }), false),
    };
    for (const h of HATS) this.meshes[`hat_${h}`] = make(G[h]);
    for (const g of GEAR.slice(1)) this.meshes[`gear_${g}`] = make(G[g]);
    // Small parts don't need their own shadows from a top-down camera: skip them in the shadow pass.
    for (const k of ['face', 'handL', 'handR', 'gun', 'hat_short', 'hat_mohawk', 'hat_cap', 'gear_pads', 'gear_vest', 'hips']) this.meshes[k].castShadow = false;
  }

  // Colours: clothes darken toward dried-blood as the character gets hurt.
  paint(ch) {
    const c = ch.colors, M = this.meshes, i = ch.slot;
    const b = Math.min(0.75, ch.blood * 0.85), ch2 = Math.min(0.9, ch.charred ?? 0);
    const set = (mesh, hex, bloody = true) => { _c.set(hex); if (bloody && b > 0) _c.lerp(_blood, b); if (ch2 > 0) _c.lerp(_soot, ch2); mesh.setColorAt(i, _c); mesh.instanceColor.needsUpdate = true; };
    set(M.torso, c.shirt); set(M.armL, c.shirt); set(M.armR, c.shirt);
    set(M.hips, c.pants); set(M.legL, c.pants, b > 0.3); set(M.legR, c.pants, b > 0.3);
    set(M.head, c.skin, b > 0.5); set(M.handL, c.skin); set(M.handR, c.skin);
  }

  part(mesh, slot, x, y, z, rx = 0, rz = 0) {
    _t.makeTranslation(x, y, z);
    if (rx || rz) { _e.set(rx, 0, rz); _q.setFromEuler(_e); _r.makeRotationFromQuaternion(_q); _m.multiplyMatrices(_base, _t).multiply(_r); }
    else _m.multiplyMatrices(_base, _t);
    mesh.setMatrixAt(slot, _m);
  }

  sync(chars) {
    const M = this.meshes;
    let maxSlot = 0;
    this.packed = {};
    for (const h of HATS) this.packed[`hat_${h}`] = 0;
    for (const gk of GEAR.slice(1)) this.packed[`gear_${gk}`] = 0;
    for (const ch of chars) {
      const i = ch.slot;
      maxSlot = Math.max(maxSlot, i + 1);
      const sp = ch.inVehicle ? ch.seatPose : null; // exposed seat: bike saddle / truck bed
      if (ch.hidden || (ch.inVehicle && !sp)) { for (const k in M) if (!(k in this.packed)) M[k].setMatrixAt(i, ZERO); continue; }
      if (sp) {
        // Ride the vehicle's yaw, wheelie pitch and lean.
        _e.set(sp.pitch ?? 0, sp.h, sp.lean ?? 0, 'YXZ'); _q.setFromEuler(_e);
        _base.compose(_v.set(sp.x, sp.y, sp.z), _q, _one);
      } else if (ch.alive) {
        _base.makeRotationY(ch.face).setPosition(ch.x, 0, ch.z);
        if (ch.dive > 0) {
          // Diving: body thrown flat forward, then sliding on the belly.
          const k = Math.min(1, ch.dive * 3);
          _r.makeRotationX(1.35 * k); _t.makeTranslation(0, -0.55 * k, 0);
          _base.multiply(_t).multiply(_r);
        } else if (ch.crouch) { _t.makeTranslation(0, -0.32, 0); _base.multiply(_t); }
        if (ch.underwater) { _t.makeTranslation(0, -1.6, 0); _base.multiply(_t); }
        else if (ch.swim) { _r.makeRotationX(1.2); _t.makeTranslation(0, -0.95, 0); _base.multiply(_t).multiply(_r); } // swimming: flat, head up
      } else {
        // Lying on the back, head away from the killer.
        _q.setFromEuler(_e.set(0, ch.face, 0));
        _base.compose(_v.set(ch.x, 0.18, ch.z), _q, _one);
        _r.makeRotationX(-Math.PI / 2);
        _t.makeTranslation(0, -0.95, 0);
        _base.multiply(_r).multiply(_t);
      }
      const k = Math.min(1, ch.speed / 3);
      const sw = ch.alive ? Math.sin(ch.walk) * k * 0.75 : 0;
      const bob = ch.alive ? Math.abs(Math.cos(ch.walk)) * k * 0.06 : 0;
      const lean = ch.alive ? Math.min(0.22, ch.speed * 0.025) : 0;
      this.part(M.hips, i, 0, 0.94 + bob, 0);
      this.part(M.torso, i, 0, 1.3 + bob, 0, lean);
      const headless = ch.headless;
      if (headless) { M.head.setMatrixAt(i, ZERO); M.face.setMatrixAt(i, ZERO); }
      else { this.part(M.head, i, 0, 1.86 + bob, lean * 0.4); this.part(M.face, i, 0, 1.86 + bob, lean * 0.4); }
      // Variant meshes are PACKED: only wearers are drawn (no zero-scale instances on the GPU).
      const hat = ch.colors.hatStyle ?? 'short';
      if (!headless) {
        const hm = M[`hat_${hat}`], k = this.packed[`hat_${hat}`]++;
        this.part(hm, k, 0, 1.86 + bob, lean * 0.4);
        hm.setColorAt(k, _c.set(hat === 'short' || hat === 'mohawk' ? ch.colors.hair : ch.colors.hat ?? ch.colors.hair));
      }
      const gear = ch.colors.gearStyle ?? 'none';
      if (gear !== 'none') {
        const gm = M[`gear_${gear}`], k = this.packed[`gear_${gear}`]++;
        this.part(gm, k, 0, 1.3 + bob, 0, lean);
        gm.setColorAt(k, _c.set(ch.colors.gear ?? '#3a3128'));
      }
      if (sp?.kind === 'bike') {
        // Astride: legs forward to the pegs, hands on the bars (unless aiming out).
        this.part(M.legL, i, -0.2, 0.92, 0, -1.15, 0.12); this.part(M.legR, i, 0.2, 0.92, 0, -1.15, -0.12);
        if (!ch.aiming) {
          this.part(M.armL, i, -0.3, 1.5, 0, -1.25, 0.3); this.part(M.armR, i, 0.3, 1.5, 0, -1.25, -0.3);
          this.part(M.handL, i, -0.3, 1.5, 0, -1.25, 0.3); this.part(M.handR, i, 0.3, 1.5, 0, -1.25, -0.3);
          M.gun.setMatrixAt(i, ZERO);
          continue;
        }
      }
      this.part(M.legL, i, -0.14, 0.92, 0, sp?.kind === 'bike' ? -1.15 : sw);
      this.part(M.legR, i, 0.14, 0.92, 0, sp?.kind === 'bike' ? -1.15 : -sw);
      if (ch.alive && ch.faction === 'zombie') {
        // Rotter: arms reaching forward, a lurching sway, no gun.
        const lurch = Math.sin(ch.walk * 0.5) * 0.18;
        this.part(M.armL, i, -0.33, 1.56 + bob, 0, -Math.PI / 2 + 0.25 + lurch, 0.12);
        this.part(M.armR, i, 0.33, 1.56 + bob, 0, -Math.PI / 2 + 0.15 - lurch, -0.12);
        this.part(M.handL, i, -0.33, 1.56 + bob, 0, -Math.PI / 2 + 0.25 + lurch, 0.12);
        this.part(M.handR, i, 0.33, 1.56 + bob, 0, -Math.PI / 2 + 0.15 - lurch, -0.12);
        M.gun.setMatrixAt(i, ZERO);
      } else if (ch.alive && ch.weapon && ch.aiming) {
        // Two-handed aim: both arms forward to the gun.
        this.part(M.armL, i, -0.33, 1.56 + bob, 0, -Math.PI / 2 + 0.08, 0.38);
        this.part(M.armR, i, 0.33, 1.56 + bob, 0, -Math.PI / 2, -0.12);
        this.part(M.handL, i, -0.33, 1.56 + bob, 0, -Math.PI / 2 + 0.08, 0.38);
        this.part(M.handR, i, 0.33, 1.56 + bob, 0, -Math.PI / 2, -0.12);
        this.part(M.gun, i, 0.1, 1.55 + bob, 0.78);
      } else {
        const armSw = ch.alive ? -sw * 0.8 : -0.5;
        this.part(M.armL, i, -0.38, 1.56 + bob, 0, armSw, 0.1);
        this.part(M.armR, i, 0.38, 1.56 + bob, 0, -armSw, -0.1);
        this.part(M.handL, i, -0.38, 1.56 + bob, 0, armSw, 0.1);
        this.part(M.handR, i, 0.38, 1.56 + bob, 0, -armSw, -0.1);
        if (ch.weapon && ch.alive) this.part(M.gun, i, 0.47, 0.98, 0.12, Math.PI / 2.4);
        else M.gun.setMatrixAt(i, ZERO);
      }
    }
    for (const key in M) {
      M[key].count = key in this.packed ? this.packed[key] : maxSlot;
      M[key].instanceMatrix.needsUpdate = true;
      if (key in this.packed && M[key].instanceColor) M[key].instanceColor.needsUpdate = true;
    }
  }

  clear(slot) { for (const k in this.meshes) this.meshes[k].setMatrixAt(slot, ZERO); }
}

// Wasteland wardrobe.
const SKINS = ['#f1c9a5', '#e0ac85', '#c68863', '#a86b45', '#8d5532', '#6e3f22', '#4f2c17'];
const HAIR = ['#1b1410', '#3b2516', '#6a4428', '#a0794a', '#c9b48a', '#7a7672', '#2a2a2a'];
const SHIRT = { drifter: ['#7d6a52', '#5f6a5a', '#8a5a3a', '#6b6156', '#4f5a62', '#9a7a52'], raider: ['#2b2420', '#4a2018', '#3a3530', '#5a3020'], warden: ['#4d5a3e', '#56603f'], player: ['#2f4a52'] };
const PANTS = { drifter: ['#3b3a36', '#4c4232', '#2f3438', '#5a4a36'], raider: ['#1f1c1a', '#2a2622', '#3a2a20'], warden: ['#2e3328'], player: ['#2a2622'] };
const HAT_COLORS = ['#5a3f24', '#3d3530', '#6b5a3a', '#7a4a2a', '#2f3b42'];
const STYLE = {
  drifter: { hats: ['short', 'short', 'cap', 'wrap', 'cowboy'], gear: ['none', 'none', 'pack', 'vest'] },
  raider: { hats: ['mohawk', 'mohawk', 'wrap', 'short'], gear: ['pads', 'pads', 'vest'] },
  warden: { hats: ['cowboy', 'cap'], gear: ['vest', 'pack'] },
  player: { hats: ['cap'], gear: ['vest'] },
};

export function outfit(faction, rng = Math.random) {
  const pick = (a) => a[Math.floor(rng() * a.length)];
  const st = STYLE[faction] ?? STYLE.drifter;
  if (faction === 'zombie') return {
    skin: pick(['#8a9a74', '#7d8a6a', '#9a9f86', '#6f7a5e', '#a3a08a']), hair: pick(['#2a2a24', '#4a463c', '#6a665a']),
    shirt: pick(['#4a4038', '#3d4248', '#5a4a3a', '#6a5a4a']), pants: pick(['#2e2c28', '#3a3630']),
    hat: '#3a3630', hatStyle: pick(['short', 'short', 'wrap']), gearStyle: 'none', gear: '#2a2622',
  };
  return {
    skin: pick(SKINS), hair: faction === 'raider' && rng() < 0.4 ? '#b0301e' : pick(HAIR),
    shirt: pick(SHIRT[faction] ?? SHIRT.drifter), pants: pick(PANTS[faction] ?? PANTS.drifter),
    hat: pick(HAT_COLORS), hatStyle: pick(st.hats), gearStyle: pick(st.gear),
    gear: faction === 'raider' ? '#2a2420' : faction === 'warden' ? '#3d4a32' : '#4a3a2a',
  };
}
