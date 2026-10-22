import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// People: one articulated low-poly body for everyone, drawn by InstancedMeshes shared by all 160
// characters (left+right limbs pack into one mesh; hat, gear, accessory and gun variants pack only
// their wearers, and an unused variant costs no draw call).
// Every limb is two segments with a real knee and elbow. A pose is solved each frame as JOINT
// POSITIONS in the character's root frame (feet on y = 0, +z forward, +x = the character's LEFT):
// feet are planted on the ground by IK (a crouch folds the knees instead of sinking the legs), hands
// are placed by IK on the gun they hold, and each segment is drawn from its joint to the next. The
// torso turns to the aim while the legs walk where the body is actually going (strafe, backpedal).
export const MAX_CHARS = 160;

// ---- the body, in metres --------------------------------------------------------------------------
const HIP_X = 0.125, HIP_Y = 0.92, THIGH = 0.44, SHIN = 0.4, ANKLE_Y = 0.08;
const WAIST_UP = 0.08, SHOULDER_X = 0.33, SHOULDER_UP = 0.56, UPPER = 0.3, FORE = 0.3, HEAD_UP = 0.86;
const AIM_Y = 0.55; // hands and gun when aiming: above the waist, so 1.55 m standing

// Weapon models. Origin at the grip (where the firing hand closes), +z down the barrel, +y up.
// grip/support: how far in front of the chest the firing and support hands hold it at the aim;
// muzzle: the barrel tip, so the shot (combat.fire) leaves from the real end of the real gun.
const GUN_MODELS = {
  revolver: { muzzle: 0.25, grip: 0.5, support: 0.5, carry: 'hand' },
  smg: { muzzle: 0.34, grip: 0.36, support: 0.52, carry: 'low' },
  sawnoff: { muzzle: 0.36, grip: 0.34, support: 0.54, carry: 'low' },
  rifle: { muzzle: 0.68, grip: 0.26, support: 0.53, carry: 'low' },
};
const GUN_KEYS = Object.keys(GUN_MODELS);
// A weapon row may name its model; otherwise its ammo says what it looks like.
export function gunModel(w) {
  if (!w) return null;
  return GUN_MODELS[w.model] ? w.model : { pistol: 'revolver', smg: 'smg', shells: 'sawnoff', rifle: 'rifle' }[w.ammo] ?? 'smg';
}
export function muzzleForward(w) { const m = GUN_MODELS[gunModel(w) ?? 'revolver']; return m.grip + m.muzzle; }
export const MUZZLE_FORWARD = muzzleForward({ ammo: 'pistol' });

// Gait: step length grows with speed, so cadence stays human (2 steps/s shuffling, 4 sprinting).
// The walk phase advances π per step; movers call stridePhase instead of a fixed rate.
export const stepLength = (v) => Math.min(2.1, Math.max(0.6, 0.55 + 0.17 * v));
export const stridePhase = (v, dt) => (Math.PI * v * dt) / stepLength(v);

export const HATS = ['short', 'cap', 'cowboy', 'mohawk', 'wrap', 'long', 'beanie', 'helmet', 'bandana', 'bald'];
export const GEAR = ['none', 'vest', 'pack', 'pads', 'bandolier', 'poncho'];
export const ACCESSORIES = ['none', 'goggles', 'mask', 'eyepatch'];
const HAIR_STYLES = new Set(['short', 'mohawk', 'long']); // drawn in the hair colour, the rest in the hat colour

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

// ---- geometry --------------------------------------------------------------------------------------
function tinted(geo, hex) {
  if (geo.index) geo = geo.toNonIndexed();
  const c = new THREE.Color(hex), n = geo.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo;
}
const ni = (g) => (g.index ? g.toNonIndexed() : g);
const merge = (list) => mergeGeometries(list.map(ni));
const box = (w, h, d, x, y, z, rx = 0) => { const g = new THREE.BoxGeometry(w, h, d); if (rx) g.rotateX(rx); return g.translate(x, y, z); };
const rbox = (w, h, d, r, x, y, z) => new RoundedBoxGeometry(w, h, d, 1, r).translate(x, y, z);

// A limb segment hanging from its joint (y = 0) down to -len, tapering, with a ball over the joint.
function limb(len, rTop, rBot, ball) {
  const parts = [new THREE.CylinderGeometry(rTop, rBot, len, 8, 1).translate(0, -len / 2, 0)];
  if (ball) parts.push(new THREE.SphereGeometry(ball, 7, 4));
  return merge(parts);
}

// A square bar from p0 to p1 (straps, rails).
const _bq = new THREE.Quaternion(), _bz = new THREE.Vector3(0, 0, 1), _bd = new THREE.Vector3();
function bar(p0, p1, w, d) {
  _bd.set(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
  const g = new THREE.BoxGeometry(w, d, _bd.length());
  g.applyQuaternion(_bq.setFromUnitVectors(_bz, _bd.normalize()));
  return g.translate((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2);
}

function torsoGeo() {
  // Shoulders wider than the waist and a little chest: a V, not a crate. Pivot at the waist.
  const g = new RoundedBoxGeometry(0.58, 0.64, 0.32, 1, 0.08), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i), t = (0.32 - y) / 0.64; // 0 at the shoulders, 1 at the waist
    p.setX(i, p.getX(i) * (1 - 0.2 * t));
    if (p.getZ(i) > 0 && y > 0) p.setZ(i, p.getZ(i) + 0.025 * (y / 0.32));
  }
  g.computeVertexNormals();
  return ni(g).translate(0, 0.3, 0);
}

function headGeo() {
  const skull = new THREE.SphereGeometry(0.19, 10, 7).scale(1, 1.12, 1.04);
  return merge([
    skull,
    box(0.19, 0.11, 0.19, 0, -0.12, 0.03),                              // jaw
    new THREE.CylinderGeometry(0.068, 0.078, 0.22, 8).translate(0, -0.23, -0.01), // neck
    box(0.035, 0.08, 0.06, 0.19, -0.01, -0.01), // ears
    box(0.035, 0.08, 0.06, -0.19, -0.01, -0.01),
    box(0.045, 0.07, 0.05, 0, -0.02, 0.2),                               // nose
  ]);
}

function gunGeos() {
  const M = '#2b2b2a', D = '#191919', W = '#5c3b22';
  const b = (w, h, d, x, y, z, c, rx = 0) => tinted(box(w, h, d, x, y, z, rx), c);
  const tube = (r, len, x, y, z, c) => tinted(new THREE.CylinderGeometry(r, r, len, 8).rotateX(Math.PI / 2).translate(x, y, z), c);
  return {
    revolver: mergeGeometries([
      b(0.034, 0.055, 0.12, 0, 0.045, 0.01, M),            // frame
      tube(0.042, 0.065, 0, 0.045, 0.03, D),              // cylinder
      tube(0.016, 0.17, 0, 0.06, 0.165, M),               // barrel
      b(0.03, 0.105, 0.045, 0, -0.03, -0.035, W, 0.3),    // grip, raked back
      b(0.012, 0.03, 0.02, 0, 0.08, -0.05, M),            // hammer
    ]),
    smg: mergeGeometries([
      b(0.055, 0.075, 0.3, 0, 0.05, 0.08, M),             // receiver
      tube(0.022, 0.12, 0, 0.055, 0.28, D),               // barrel shroud
      b(0.034, 0.17, 0.045, 0, -0.06, 0.12, D, -0.15),    // magazine, raked forward
      b(0.034, 0.1, 0.045, 0, -0.025, -0.02, M, 0.25),    // pistol grip
      b(0.012, 0.012, 0.25, 0.022, 0.035, -0.18, M),      // wire stock
      b(0.012, 0.012, 0.25, -0.022, 0.035, -0.18, M),
      b(0.055, 0.075, 0.018, 0, 0.025, -0.3, M),          // butt plate
      b(0.02, 0.025, 0.04, 0, 0.1, 0.2, D),               // front sight
    ]),
    sawnoff: mergeGeometries([
      tube(0.022, 0.31, 0.023, 0.062, 0.2, M),            // twin barrels
      tube(0.022, 0.31, -0.023, 0.062, 0.2, M),
      b(0.07, 0.07, 0.11, 0, 0.05, 0, D),                 // action
      b(0.06, 0.03, 0.15, 0, 0.026, 0.13, W),             // fore-end
      b(0.045, 0.11, 0.11, 0, -0.02, -0.09, W, 0.45),     // sawn-down grip stock
    ]),
    rifle: mergeGeometries([
      tube(0.015, 0.5, 0, 0.06, 0.43, M),                 // barrel
      b(0.05, 0.07, 0.24, 0, 0.05, 0.06, D),              // receiver
      b(0.052, 0.045, 0.32, 0, 0.022, 0.3, W),            // fore-end
      b(0.045, 0.09, 0.36, 0, 0, -0.2, W, -0.12),         // stock
      b(0.04, 0.05, 0.2, 0, 0.115, 0.08, D),              // scope
    ]),
  };
}

function buildGeometries() {
  const G = {};
  G.torso = torsoGeo();
  // Pelvis with a belt (vertex-tinted dark; the instance colour is the trousers).
  G.hips = mergeGeometries([tinted(rbox(0.5, 0.26, 0.3, 0.07, 0, 0, 0), '#ffffff'), tinted(box(0.52, 0.06, 0.32, 0, 0.1, 0), '#3a3028')]);
  G.head = headGeo();
  // Face: eyes, brows, mouth - dark, facing +z so you can read where someone looks.
  G.face = merge([
    box(0.055, 0.03, 0.02, -0.07, 0.03, 0.185), box(0.055, 0.03, 0.02, 0.07, 0.03, 0.185),
    box(0.19, 0.02, 0.02, 0, 0.08, 0.178), box(0.08, 0.012, 0.02, 0, -0.1, 0.172),
  ]);
  G.thigh = limb(THIGH, 0.11, 0.085, 0);
  G.shin = limb(SHIN, 0.08, 0.062, 0.085);
  G.boot = ni(box(0.125, 0.13, 0.29, 0, -0.015, 0.05));
  G.upper = limb(UPPER, 0.076, 0.062, 0.085);
  G.fore = limb(FORE - 0.05, 0.06, 0.048, 0.064);
  G.hand = ni(box(0.085, 0.12, 0.055, 0, -FORE, 0));
  // Hair and hats, pivot at the head centre.
  G.short = new THREE.SphereGeometry(0.205, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2.1).translate(0, 0.04, -0.01);
  G.cap = merge([new THREE.SphereGeometry(0.21, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2.2).translate(0, 0.05, 0), box(0.26, 0.025, 0.16, 0, 0.07, 0.24)]);
  G.cowboy = merge([new THREE.CylinderGeometry(0.4, 0.4, 0.03, 16).translate(0, 0.12, 0), new THREE.CylinderGeometry(0.15, 0.19, 0.19, 12).translate(0, 0.22, 0)]);
  G.mohawk = box(0.06, 0.13, 0.36, 0, 0.24, -0.02);
  G.wrap = new THREE.SphereGeometry(0.235, 12, 8, 0, Math.PI * 2, 0, Math.PI / 1.6).translate(0, 0.02, -0.02);
  G.long = merge([new THREE.SphereGeometry(0.21, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.03, -0.01), rbox(0.3, 0.36, 0.09, 0.03, 0, -0.15, -0.16)]);
  G.beanie = merge([new THREE.SphereGeometry(0.212, 12, 7, 0, Math.PI * 2, 0, Math.PI / 1.9).scale(1, 1.18, 1).translate(0, 0.02, 0), new THREE.CylinderGeometry(0.218, 0.218, 0.06, 14, 1, true).translate(0, 0.02, 0)]);
  G.helmet = merge([new THREE.SphereGeometry(0.245, 12, 7, 0, Math.PI * 2, 0, Math.PI / 2.1).scale(1, 0.9, 1.06).translate(0, 0.04, -0.01), new THREE.CylinderGeometry(0.262, 0.262, 0.022, 14).translate(0, 0.045, -0.01)]);
  G.bandana = merge([new THREE.CylinderGeometry(0.205, 0.2, 0.07, 14, 1, true).translate(0, 0.07, -0.005), bar([0, 0.07, -0.2], [0.05, -0.08, -0.26], 0.05, 0.015), bar([0, 0.07, -0.2], [-0.04, -0.06, -0.25], 0.05, 0.015)]);
  // Gear on the torso, pivot at the torso centre.
  G.vest = merge([rbox(0.62, 0.5, 0.38, 0.06, 0, 0.04, 0), box(0.11, 0.13, 0.05, -0.16, -0.06, 0.2), box(0.11, 0.13, 0.05, 0, -0.06, 0.2), box(0.11, 0.13, 0.05, 0.16, -0.06, 0.2)]);
  G.pack = merge([rbox(0.42, 0.48, 0.2, 0.06, 0, 0.02, -0.27), new THREE.CylinderGeometry(0.07, 0.07, 0.42, 8).rotateZ(Math.PI / 2).translate(0, 0.3, -0.27)]);
  const spike = (x) => new THREE.ConeGeometry(0.045, 0.16, 6).translate(x, 0.43, 0);
  G.pads = merge([rbox(0.24, 0.12, 0.3, 0.04, -0.33, 0.33, 0), rbox(0.24, 0.12, 0.3, 0.04, 0.33, 0.33, 0), spike(-0.36), spike(-0.28), spike(0.28), spike(0.36)]);
  // Bandolier: a strap from the left shoulder to the right hip, front and back, cartridges along it.
  const shells = [];
  for (let k = 0; k < 7; k++) { const t = 0.12 + k * 0.11; shells.push(box(0.03, 0.055, 0.03, 0.22 - 0.44 * t, 0.27 - 0.54 * t, 0.205)); }
  G.bandolier = merge([bar([0.22, 0.3, 0.19], [-0.22, -0.28, 0.19], 0.07, 0.02), bar([0.22, 0.3, -0.18], [-0.22, -0.28, -0.18], 0.07, 0.02), ...shells]);
  G.poncho = new THREE.CylinderGeometry(0.15, 0.6, 0.48, 4, 1, true).rotateY(Math.PI / 4).scale(1, 1, 0.8).translate(0, 0.1, 0);
  // Accessories on the head.
  G.goggles = merge([new THREE.CylinderGeometry(0.212, 0.212, 0.035, 14, 1, true).translate(0, 0.1, 0), box(0.07, 0.05, 0.04, -0.06, 0.12, 0.2), box(0.07, 0.05, 0.04, 0.06, 0.12, 0.2)]);
  G.mask = new THREE.CylinderGeometry(0.2, 0.17, 0.15, 12, 1, true, -Math.PI / 2, Math.PI).rotateY(Math.PI).translate(0, -0.1, 0.03);
  G.eyepatch = merge([box(0.07, 0.06, 0.02, -0.07, 0.03, 0.195), bar([-0.11, 0.05, 0.17], [0.19, 0.11, -0.02], 0.012, 0.012)]);
  Object.assign(G, gunGeos());
  return G;
}

// ---- pose scratch (no allocation per frame) --------------------------------------------------------
const V = () => new THREE.Vector3();
const _root = new THREE.Matrix4(), _U = new THREE.Matrix4(), _LF = new THREE.Matrix4(), _m = new THREE.Matrix4(), _t = new THREE.Matrix4(), _r = new THREE.Matrix4(), _g = new THREE.Matrix4(), _H = new THREE.Matrix4(), _G = new THREE.Matrix4();
const PAIRS = new Set(['thigh', 'shin', 'boot', 'upper', 'fore', 'hand']);
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = V(), _w = V(), _dir = V(), _n = V(), _pole = V(), _one = new THREE.Vector3(1, 1, 1);
const _DOWN = new THREE.Vector3(0, -1, 0), _X = V(), _Y = V(), _Z = V();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const _c = new THREE.Color(), _blood = new THREE.Color('#4a0606'), _soot = new THREE.Color('#141110');
// Joints, index 0 = left (+x), 1 = right (-x). Legs live in the leg frame, arms in the root frame.
const hip = [V(), V()], knee = [V(), V()], ankle = [V(), V()], sh = [V(), V()], el = [V(), V()], hand = [V(), V()], tgt = [V(), V()];
const footPitch = [0, 0], SIDE = [1, -1];
const TAU = Math.PI * 2;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const wrap = (a) => a - TAU * Math.round(a / TAU);

// Two-bone IK: from joint a toward target, segments la and lb, bending toward the pole direction.
// Writes the middle joint (knee/elbow) and the end (ankle/hand, clamped to reach).
function ik2(a, target, la, lb, pole, outMid, outEnd) {
  _dir.subVectors(target, a);
  let d = _dir.length();
  if (d < 1e-5) { _dir.set(0, -1, 0); d = 1e-5; } else _dir.divideScalar(d);
  d = Math.min(la + lb - 1e-4, Math.max(Math.abs(la - lb) + 1e-4, d));
  const ca = (la * la + d * d - lb * lb) / (2 * la * d), sa = Math.sqrt(Math.max(0, 1 - ca * ca));
  _n.copy(pole).addScaledVector(_dir, -pole.dot(_dir));
  if (_n.lengthSq() < 1e-8) _n.set(0, 0, 1); else _n.normalize();
  outMid.copy(a).addScaledVector(_dir, la * ca).addScaledVector(_n, la * sa);
  outEnd.copy(a).addScaledVector(_dir, d);
}

// Forward kinematics for a hanging arm (in the upper-body frame): shoulder pitch (forward +),
// elbow flex (hand comes forward), splay (out from the body).
function armFK(s, pitch, flex, splay, outEl, outHand) {
  const sp = Math.sin(splay), cp = Math.cos(splay);
  outEl.set(s * SHOULDER_X + s * sp * UPPER, SHOULDER_UP - Math.cos(pitch) * cp * UPPER, Math.sin(pitch) * cp * UPPER);
  const a = pitch + flex;
  outHand.set(outEl.x + s * sp * 0.5 * FORE, outEl.y - Math.cos(a) * FORE, outEl.z + Math.sin(a) * FORE);
}

export class CharacterRenderer {
  constructor(scene, weapons = {}) {
    this.weapons = weapons;
    const G = buildGeometries();
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.82 });
    const vmat = new THREE.MeshStandardMaterial({ roughness: 0.82, vertexColors: true });
    const gearMat = new THREE.MeshStandardMaterial({ roughness: 0.85, side: THREE.DoubleSide });
    const make = (geo, material = mat, count = MAX_CHARS, colored = true) => {
      const mesh = new THREE.InstancedMesh(geo, material, count);
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      for (let i = 0; i < count; i++) { mesh.setMatrixAt(i, ZERO); if (colored) mesh.setColorAt(i, _c.set('#888')); }
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(mesh);
      return mesh;
    };
    const pair = MAX_CHARS * 2;
    this.meshes = {
      torso: make(G.torso), hips: make(G.hips, vmat), head: make(G.head),
      face: make(G.face, new THREE.MeshStandardMaterial({ color: '#1c1410', roughness: 0.9 }), MAX_CHARS, false),
      thigh: make(G.thigh, mat, pair), shin: make(G.shin, mat, pair), boot: make(G.boot, mat, pair),
      upper: make(G.upper, mat, pair), fore: make(G.fore, mat, pair), hand: make(G.hand, mat, pair),
    };
    // Variants are PACKED: only wearers are drawn.
    this.variant = [];
    const variant = (key, geo, material) => { this.meshes[key] = make(geo, material); this.variant.push(key); };
    for (const h of HATS) if (h !== 'bald') variant(`hat_${h}`, G[h], h === 'bandana' || h === 'beanie' ? gearMat : mat);
    for (const g of GEAR.slice(1)) variant(`gear_${g}`, G[g], gearMat);
    for (const a of ACCESSORIES.slice(1)) variant(`acc_${a}`, G[a], gearMat);
    const gunMat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.35, roughness: 0.5 });
    for (const k of GUN_KEYS) { const m = make(G[k], gunMat, MAX_CHARS, false); this.meshes[`gun_${k}`] = m; this.variant.push(`gun_${k}`); }
    // Small parts don't need shadows from a top-down camera: skip them in the shadow pass.
    for (const k of ['face', 'hand', 'boot', 'fore', 'hips', 'hat_short', 'hat_mohawk', 'hat_cap', 'hat_bandana', 'gear_pads', 'gear_vest', 'gear_bandolier', 'acc_goggles', 'acc_mask', 'acc_eyepatch', ...GUN_KEYS.map((k) => `gun_${k}`)]) this.meshes[k].castShadow = false;
    this.packed = {};
  }

  // Colours: clothes darken toward dried blood as the character gets hurt, and char black in fire.
  paint(ch) {
    const c = ch.colors, M = this.meshes, i = ch.slot;
    const b = Math.min(0.75, ch.blood * 0.85), burnt = Math.min(0.9, ch.charred ?? 0);
    const set = (mesh, idx, hex, bloody = true) => { _c.set(hex); if (bloody && b > 0) _c.lerp(_blood, b); if (burnt > 0) _c.lerp(_soot, burnt); mesh.setColorAt(idx, _c); mesh.instanceColor.needsUpdate = true; };
    const sleeve = c.sleeves === 'short' ? c.skin : c.shirt;
    set(M.torso, i, c.shirt); set(M.hips, i, c.pants); set(M.head, i, c.skin, b > 0.5);
    for (const k of [0, 1]) {
      const j = i * 2 + k;
      set(M.upper, j, c.shirt); set(M.fore, j, sleeve, c.sleeves !== 'short' || b > 0.4); set(M.hand, j, c.skin);
      set(M.thigh, j, c.pants, b > 0.3); set(M.shin, j, c.pants, b > 0.3); set(M.boot, j, c.boots ?? '#2b241e', false);
    }
  }

  // One segment from joint `from` to joint `to`, in frame F (geometry hangs along -y).
  seg(mesh, idx, F, from, to) {
    _dir.subVectors(to, from).normalize();
    _q.setFromUnitVectors(_DOWN, _dir);
    _m.compose(from, _q, _one).premultiply(F);
    mesh.setMatrixAt(idx, _m);
    return _m;
  }

  // A packed variant instance at frame F * T(x, y, z) * Rx(rx).
  put(key, F, x, y, z, rx, color) {
    const mesh = this.meshes[key], k = this.packed[key]++;
    _t.makeTranslation(x, y, z);
    if (rx) _t.multiply(_r.makeRotationX(rx));
    mesh.setMatrixAt(k, _m.multiplyMatrices(F, _t));
    if (color && mesh.instanceColor) mesh.setColorAt(k, _c.set(color));
  }

  hideSlot(i) {
    const M = this.meshes;
    for (const k of ['torso', 'hips', 'head', 'face']) M[k].setMatrixAt(i, ZERO);
    for (const k of ['thigh', 'shin', 'boot', 'upper', 'fore', 'hand']) { M[k].setMatrixAt(i * 2, ZERO); M[k].setMatrixAt(i * 2 + 1, ZERO); }
  }

  sync(chars, dt = 1 / 60) {
    const M = this.meshes;
    let maxSlot = 0;
    for (const k of this.variant) this.packed[k] = 0;
    for (const ch of chars) {
      const i = ch.slot;
      maxSlot = Math.max(maxSlot, i + 1);
      const sp = ch.inVehicle ? ch.seatPose : null; // exposed seat: bike saddle / truck bed / train roof
      if (ch.hidden || (ch.inVehicle && !sp)) { this.hideSlot(i); ch._rx = undefined; continue; }
      this.pose(ch, sp, dt);
    }
    for (const key in M) {
      const n = key in this.packed ? this.packed[key] : PAIRS.has(key) ? maxSlot * 2 : maxSlot;
      M[key].count = n;
      M[key].visible = n > 0; // an unused variant costs no draw call
      M[key].instanceMatrix.needsUpdate = true;
      if (key in this.packed && M[key].instanceColor) M[key].instanceColor.needsUpdate = true;
    }
  }

  pose(ch, sp, dt) {
    const M = this.meshes, i = ch.slot, alive = ch.alive;
    const w = ch.weapon ? this.weapons[ch.weapon] : null, model = w ? gunModel(w) : null, gm = model ? GUN_MODELS[model] : null;
    const infected = ch.faction === 'zombie', bike = sp?.kind === 'bike';

    // ---- root frame --------------------------------------------------------------------------
    let lying = false;
    if (sp) {
      _e.set(sp.pitch ?? 0, sp.h, sp.lean ?? 0, 'YXZ'); _q.setFromEuler(_e);
      _root.compose(_v.set(sp.x, sp.y, sp.z), _q, _one);
    } else if (alive) {
      _root.makeRotationY(ch.face).setPosition(ch.x, 0, ch.z);
      if (ch.dive > 0) {
        const k = Math.min(1, ch.dive * 3);
        _root.multiply(_t.makeTranslation(0, -0.55 * k, 0)).multiply(_r.makeRotationX(1.35 * k));
      }
      if (ch.underwater) _root.multiply(_t.makeTranslation(0, -1.6, 0));
      else if (ch.swim) _root.multiply(_t.makeTranslation(0, -0.95, 0)).multiply(_r.makeRotationX(1.2));
    } else {
      // Lying on the back, head away from the killer.
      lying = true;
      _q.setFromEuler(_e.set(0, ch.face, 0, 'XYZ'));
      _root.compose(_v.set(ch.x, 0.16, ch.z), _q, _one);
      _root.multiply(_r.makeRotationX(-Math.PI / 2)).multiply(_t.makeTranslation(0, -0.95, 0));
    }

    // ---- gait --------------------------------------------------------------------------------
    // The legs face where the body is going; the torso faces ch.face. Backpedalling walks the
    // cycle in reverse instead of twisting the hips round.
    let legYaw = 0, dirSign = 1;
    const moving = alive && !sp && !ch.swim && !ch.dive && ch.speed > 0.4;
    if (moving && ch._rx !== undefined) {
      const dx = ch.x - ch._rx, dz = ch.z - ch._rz;
      if (dx * dx + dz * dz > 1e-6) {
        let a = wrap(Math.atan2(dx, dz) - ch.face);
        if (Math.abs(a) > 1.75) { a = wrap(a - Math.PI); dirSign = -1; }
        ch._legYawT = a; ch._back = dirSign;
      }
      dirSign = ch._back ?? 1;
    }
    ch._rx = ch.x; ch._rz = ch.z;
    if (moving) legYaw = ch._legYaw = (ch._legYaw ?? 0) + wrap((ch._legYawT ?? 0) - (ch._legYaw ?? 0)) * Math.min(1, dt * 12);
    else ch._legYaw = 0;

    const v = moving ? ch.speed : 0;
    const k = clamp01(v / 1.2), run = clamp01((v - 3.2) / 3.2);
    const crouch = alive && !sp && ch.crouch ? 1 : 0;
    const aim = alive && !!gm && ch.aiming && !ch.handsUp && !(infected);
    const limp = infected ? (ch.limp ?? (i % 5 < 2 ? (i % 2 ? 1 : -1) : 0)) : 0; // ~40% of the infected drag a leg
    const phase = ch.walk * dirSign;
    const sigma = 0.6 - 0.24 * run;                       // stance share of the cycle
    const reachA = crouch ? 0.26 : 0.4 - 0.1 * run; // a runner's foot lands under the hip, not out in front
    const A = Math.min(reachA, sigma * stepLength(v)) * k; // foot travel ahead of / behind the hip
    const lift = (0.09 + 0.14 * run) * k;

    // ---- legs (leg frame) --------------------------------------------------------------------
    let hipY = (crouch ? 0.56 : HIP_Y - 0.012) - 0.05 * run;
    let stanceZ = 0;
    for (let s = 0; s < 2; s++) {
      const side = SIDE[s], f = tgt[s];
      const lame = limp === side;
      const u = (((phase + (s ? Math.PI : 0)) / TAU) % 1 + 1) % 1;
      const a = lame ? A * 0.45 : A;
      let zf, yf = 0, pitch = 0;
      if (u < sigma) { zf = a * (1 - (2 * u) / sigma); if (Math.abs(zf) > Math.abs(stanceZ)) stanceZ = zf; } // the widest planted foot sets the pelvis
      else {
        const t = (u - sigma) / (1 - sigma), e = t * t * (3 - 2 * t);
        zf = -a + 2 * a * e;
        yf = Math.sin(Math.PI * t) * (lame ? 0.012 : lift);   // a lame leg drags its toe
        pitch = (lame ? 0.35 : -0.3 * Math.sin(Math.PI * t)) * k;
      }
      f.set(side * (HIP_X + 0.012), ANKLE_Y + yf, zf);
      footPitch[s] = pitch;
    }
    if (crouch && !moving) { tgt[0].z = 0.1; tgt[1].z = -0.08; tgt[0].x += 0.04; tgt[1].x -= 0.04; } // staggered squat
    if (sp?.kind === 'stand') { tgt[0].x += 0.08; tgt[1].x -= 0.08; tgt[0].z = 0.08; tgt[1].z = -0.06; } // braced on a moving deck
    if (bike) { hipY = HIP_Y; for (let s = 0; s < 2; s++) { tgt[s].set(SIDE[s] * 0.21, 0.26, 0.14); footPitch[s] = 0.2; } }
    if (lying) {
      tgt[0].set(0.2, ANKLE_Y, 0.02); tgt[1].set(-0.12, 0.34, 0.32); // one knee up
    }
    if (ch.swim || ch.underwater) {
      const kick = Math.sin(ch.walk * 3) * 0.12;
      tgt[0].set(0.14, ANKLE_Y + 0.05, kick); tgt[1].set(-0.14, ANKLE_Y + 0.05, -kick);
    }
    // The pelvis rides on the stance leg: it dips when the feet are far apart, so a planted boot
    // stays planted instead of floating at the end of each stride.
    if (moving && !crouch) hipY = Math.min(hipY, ANKLE_Y + Math.sqrt(Math.max(0, 0.832 * 0.832 - stanceZ * stanceZ)));
    _pole.set(0, 0, 1);
    for (let s = 0; s < 2; s++) {
      const side = SIDE[s];
      hip[s].set(side * HIP_X, hipY, 0);
      _pole.set(side * 0.15, 0, 1);
      ik2(hip[s], tgt[s], THIGH, SHIN, _pole, knee[s], ankle[s]);
    }
    _LF.copy(_root);
    if (legYaw) _LF.multiply(_r.makeRotationY(legYaw));
    for (let s = 0; s < 2; s++) {
      const j = i * 2 + s;
      this.seg(M.thigh, j, _LF, hip[s], knee[s]);
      this.seg(M.shin, j, _LF, knee[s], ankle[s]);
      _t.makeTranslation(ankle[s].x, ankle[s].y, ankle[s].z);
      if (footPitch[s]) _t.multiply(_r.makeRotationX(footPitch[s]));
      M.boot.setMatrixAt(j, _m.multiplyMatrices(_LF, _t));
    }
    M.hips.setMatrixAt(i, _m.multiplyMatrices(_LF, _t.makeTranslation(0, hipY + 0.02, 0)));

    // ---- upper body (root frame through _U) -----------------------------------------------------
    let lean = alive ? 0.05 * k + 0.2 * run + 0.28 * crouch : 0, twist = 0, headTilt = 0;
    if (aim) lean = 0.03 + 0.12 * crouch;
    else if (infected && alive) { lean = 0.32 + 0.2 * run; headTilt = 0.22 * Math.sin(ch.walk * 0.5 + i); }
    else if (moving && !gm) twist = -0.1 * Math.sin(phase) * k;
    if (bike) lean = 0.7;
    if (ch.swim || ch.underwater) lean = 0;
    _U.makeTranslation(0, hipY + WAIST_UP, 0);
    if (twist) _U.multiply(_r.makeRotationY(twist));
    if (lean) _U.multiply(_r.makeRotationX(lean));
    _g.multiplyMatrices(_root, _U); // world frame of the upper body
    M.torso.setMatrixAt(i, _g);
    const headless = ch.headless;
    // The head stays level when the body leans (eyes on the road), and lolls on the infected.
    _t.makeTranslation(0, HEAD_UP, 0).multiply(_r.makeRotationX(-lean * 0.6));
    if (headTilt) _t.multiply(_r.makeRotationZ(headTilt));
    const headFrame = _H.multiplyMatrices(_g, _t);
    if (headless) { M.head.setMatrixAt(i, ZERO); M.face.setMatrixAt(i, ZERO); }
    else { M.head.setMatrixAt(i, headFrame); M.face.setMatrixAt(i, headFrame); }
    const c = ch.colors;
    if (!headless) {
      const hat = c.hatStyle ?? 'short';
      if (hat !== 'bald' && M[`hat_${hat}`]) this.put(`hat_${hat}`, headFrame, 0, 0, 0, 0, HAIR_STYLES.has(hat) ? c.hair : c.hat ?? c.hair);
      const acc = c.accStyle ?? 'none';
      if (acc !== 'none' && M[`acc_${acc}`]) this.put(`acc_${acc}`, headFrame, 0, 0, 0, 0, acc === 'mask' ? c.mask ?? '#6a2a1e' : '#2a2622');
    }
    const gear = c.gearStyle ?? 'none';
    if (gear !== 'none' && M[`gear_${gear}`]) this.put(`gear_${gear}`, _g, 0, 0.3, 0, 0, c.gear ?? '#3a3128');

    // ---- arms ----------------------------------------------------------------------------------
    // Targets are set in the upper-body frame, then everything is solved in the root frame.
    let mode = 'swing';
    if (!alive) mode = 'dead';
    else if (bike && !(aim)) mode = 'bars';
    else if (ch.handsUp) mode = 'handsUp';
    else if (infected) mode = 'infected';
    else if (ch.swim || ch.underwater) mode = 'swim';
    else if (ch.dive > 0) mode = 'dive';
    else if (aim) mode = 'aim';
    else if (gm && gm.carry === 'low') mode = 'low';
    let gunKey = null, gunHand = false;
    for (let s = 0; s < 2; s++) sh[s].set(SIDE[s] * SHOULDER_X, SHOULDER_UP, 0);
    const ikArm = (s, x, y, z) => { tgt[s].set(x, y, z); };
    let useIK = true;
    switch (mode) {
      case 'aim': {
        ikArm(1, -0.03, AIM_Y - 0.01, gm.grip);
        ikArm(0, gm.support === gm.grip ? 0.03 : 0.02, AIM_Y, gm.support);
        gunKey = model;
        break;
      }
      case 'low': {
        // Low ready: the gun across the body, muzzle down and to the left, finger off the trigger.
        _X.set(0.3, -0.4, 0.87).normalize();
        ikArm(1, -0.12, 0.14, 0.22);
        ikArm(0, -0.12 + _X.x * (gm.support - gm.grip + 0.06), 0.14 + _X.y * (gm.support - gm.grip + 0.06), 0.22 + _X.z * (gm.support - gm.grip + 0.06));
        gunKey = model;
        break;
      }
      case 'handsUp': {
        const tr = Math.sin(ch.walk * 9 + i) * 0.03;
        ikArm(0, 0.19, 0.98 + tr, 0.08); ikArm(1, -0.19, 0.98 - tr, 0.08);
        break;
      }
      case 'bars': {
        // Hands on the bars, 0.78 m ahead of the saddle at 0.98 m: authored in the leaned frame.
        ikArm(0, 0.34, 0.49, 0.6); ikArm(1, -0.34, 0.49, 0.6);
        break;
      }
      case 'dead': {
        ikArm(0, 0.6, 1.0, 0.1); ikArm(1, -0.88, 0.32, 0.14);
        break;
      }
      default: useIK = false;
    }
    if (useIK) {
      // IK in the upper-body frame (targets were authored there), elbows down and out.
      for (let s = 0; s < 2; s++) {
        _pole.set(SIDE[s] * 0.75, -0.55, mode === 'handsUp' ? 0.3 : -0.35);
        ik2(sh[s], tgt[s], UPPER, FORE, _pole, el[s], hand[s]);
      }
    } else {
      // Forward kinematics: walking swing, running pump, the infected lurch, swimming strokes.
      for (let s = 0; s < 2; s++) {
        const side = SIDE[s], ph = phase + (s ? Math.PI : 0);
        let pitch, flex, splay = 0.07;
        if (mode === 'infected') {
          const sway = Math.sin(ch.walk * 0.5 + s * 1.7 + i) * 0.18;
          pitch = run > 0.2 ? -Math.sin(ph) * (0.7 + 0.5 * run) : 0.32 + sway + (s ? 0.1 : -0.05);
          flex = run > 0.2 ? 0.9 + 0.5 * run : 0.35 + sway * 0.5;
          splay = 0.14;
        } else if (mode === 'swim') {
          pitch = 1.3 + Math.sin(ch.walk * 1.5 + s * Math.PI) * 1.1; flex = 0.4;
        } else if (mode === 'dive') {
          pitch = 2.7; flex = 0.15; splay = 0.12;
        } else {
          pitch = -Math.sin(ph) * (0.42 * k + 0.4 * run) + 0.05 * crouch;
          flex = 0.18 + 0.2 * k + 1.15 * run + 0.4 * crouch;
        }
        armFK(side, pitch, flex, splay, el[s], hand[s]);
      }
      // A one-handed gun hangs in the right hand, muzzle down and forward.
      if (gm && gm.carry === 'hand' && (mode === 'swing')) { gunKey = model; gunHand = true; }
    }
    // Write the arms: upper body frame → world.
    for (let s = 0; s < 2; s++) {
      const j = i * 2 + s;
      this.seg(M.upper, j, _g, sh[s], el[s]);
      const fm = this.seg(M.fore, j, _g, el[s], hand[s]);
      M.hand.setMatrixAt(j, fm);
      if (gunHand && s === 1) {
        // The revolver in the right fist: grip at the hand, barrel along the forearm, tipped forward.
        _t.makeTranslation(0, -FORE, 0).multiply(_r.makeRotationX(1.25));
        const key = `gun_${gunKey}`;
        M[key].setMatrixAt(this.packed[key]++, _G.multiplyMatrices(fm, _t));
      }
    }
    if (gunKey && !gunHand) {
      if (mode === 'aim') this.put(`gun_${gunKey}`, _g, 0, AIM_Y, gm.grip, -lean, null); // level, even from a crouch
      else {
        // Low ready: orient the gun along its carry line through the right hand.
        _Z.set(0.3, -0.4, 0.87).normalize(); _X.crossVectors(_v.set(0, 1, 0), _Z).normalize(); _Y.crossVectors(_Z, _X);
        _t.makeBasis(_X, _Y, _Z).setPosition(-0.12, 0.14, 0.22);
        const key = `gun_${gunKey}`, k2 = this.packed[key]++;
        M[key].setMatrixAt(k2, _m.multiplyMatrices(_g, _t));
      }
    }
  }

  clear(slot) {
    this.hideSlot(slot);
  }
}

// ---- wardrobe --------------------------------------------------------------------------------------
const SKINS = ['#f1c9a5', '#e0ac85', '#c68863', '#a86b45', '#8d5532', '#6e3f22', '#4f2c17'];
const HAIR = ['#1b1410', '#3b2516', '#6a4428', '#a0794a', '#c9b48a', '#7a7672', '#2a2a2a'];
const SHIRT = { drifter: ['#7d6a52', '#5f6a5a', '#8a5a3a', '#6b6156', '#4f5a62', '#9a7a52', '#7a3e2a', '#5a5040'], raider: ['#2b2420', '#4a2018', '#3a3530', '#5a3020', '#3d2a1e'], warden: ['#4d5a3e', '#56603f'], player: ['#2f4a52'] };
const PANTS = { drifter: ['#3b3a36', '#4c4232', '#2f3438', '#5a4a36', '#3e4a52'], raider: ['#1f1c1a', '#2a2622', '#3a2a20'], warden: ['#2e3328'], player: ['#2a2622'] };
const BOOTS = ['#2b241e', '#3a2a1c', '#1c1a18', '#5a4630'];
const HAT_COLORS = ['#5a3f24', '#3d3530', '#6b5a3a', '#7a4a2a', '#2f3b42', '#4a4a38'];
const STYLE = {
  drifter: { hats: ['short', 'short', 'cap', 'wrap', 'cowboy', 'long', 'beanie', 'bald'], gear: ['none', 'none', 'pack', 'vest', 'poncho', 'bandolier'], acc: ['none', 'none', 'none', 'goggles', 'mask'], bare: 0.35 },
  raider: { hats: ['mohawk', 'mohawk', 'bandana', 'short', 'bald', 'long'], gear: ['pads', 'pads', 'vest', 'bandolier'], acc: ['none', 'goggles', 'mask', 'eyepatch'], bare: 0.7 },
  warden: { hats: ['cowboy', 'cap', 'helmet'], gear: ['vest', 'vest', 'pack'], acc: ['none'], bare: 0.1 },
  player: { hats: ['cap'], gear: ['vest'], acc: ['none'], bare: 0 },
};
// The infected wear what they turned in: civilian, worker and soldier clothes, torn and stained.
const INFECTED_SHIRTS = ['#4a4038', '#3d4248', '#5a4a3a', '#6a5a4a', '#7a5a2a', '#4a4f38', '#6b6048', '#5a3a3a'];

export function outfit(faction, rng = Math.random) {
  const pick = (a) => a[Math.floor(rng() * a.length)];
  if (faction === 'zombie') return {
    skin: pick(['#8a9a74', '#7d8a6a', '#9a9f86', '#6f7a5e', '#a3a08a', '#8a8070']), hair: pick(['#2a2a24', '#4a463c', '#6a665a', '#1b1410']),
    shirt: pick(INFECTED_SHIRTS), pants: pick(['#2e2c28', '#3a3630', '#3e4a52', '#4a4f38']), boots: pick(BOOTS),
    hat: pick(['#3a3630', '#4a4f38']), hatStyle: pick(['short', 'short', 'long', 'bald', 'beanie', 'cap', 'helmet']), gearStyle: pick(['none', 'none', 'none', 'none', 'pack']), gear: '#2a2622',
    accStyle: 'none', sleeves: rng() < 0.6 ? 'short' : 'long',
  };
  const st = STYLE[faction] ?? STYLE.drifter;
  return {
    skin: pick(SKINS), hair: faction === 'raider' && rng() < 0.4 ? '#b0301e' : pick(HAIR),
    shirt: pick(SHIRT[faction] ?? SHIRT.drifter), pants: pick(PANTS[faction] ?? PANTS.drifter), boots: pick(BOOTS),
    hat: faction === 'warden' ? pick(['#4a4f38', '#5a3f24']) : pick(HAT_COLORS), hatStyle: pick(st.hats), gearStyle: pick(st.gear), accStyle: pick(st.acc),
    gear: faction === 'raider' ? '#2a2420' : faction === 'warden' ? '#3d4a32' : pick(['#4a3a2a', '#5a4a32', '#3a3a30', '#6a5034']),
    mask: pick(['#6a2a1e', '#3a3a3a', '#5a4a32']), sleeves: rng() < st.bare ? 'short' : 'long',
  };
}
