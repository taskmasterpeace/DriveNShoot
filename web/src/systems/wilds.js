import * as THREE from 'three';
import { Traps } from './traps.js';
import { Greyborn } from './greyborn.js';
import { Grapevine } from './grapevine.js';
import { HotGround } from './hotground.js';

// The wilds facade (docs/design/WEB_GREYBORN_GRAPEVINE.md): traps, the Greyborn's settlements, the Grapevine's packs and
// the hot ground, made and stepped together, saved as one block. Owned by systems/zombies.js (so main.js needs no
// hooks); each part is also on the game as g.traps, g.greyborn, g.grapevine, g.hotground.
//
// glint(): small unlit points drawn this frame only (the Grapevine's eyeshine, the Lantern's head) - one draw call.
const MAX_GLINTS = 48, _o = new THREE.Object3D(), _c = new THREE.Color();

export class Wilds {
  constructor(game) {
    this.g = game;
    game.wilds = this;
    game.traps = this.traps = new Traps(game);
    game.greyborn = this.greyborn = new Greyborn(game);
    game.grapevine = this.grapevine = new Grapevine(game);
    game.hotground = this.hotground = new HotGround(game);
    this.glints = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }), MAX_GLINTS);
    this.glints.count = 0; this.glints.frustumCulled = false; this.glints.renderOrder = 4;
    game.scene.add(this.glints);
    this.nGlint = 0;
  }
  set enabled(v) { this.greyborn.enabled = v; this.grapevine.enabled = v; this.hotground.enabled = v; }
  get enabled() { return this.greyborn.enabled; }

  // Room for `need` more characters above the ambient reserve (zombies.js AMBIENT_RESERVE: the director's events keep
  // their slots). Made by taking, in order: a body long dead out of sight, a ring resident nobody is fighting
  // (residents.yieldSlot), the farthest idle drifter out past 150 m (addChar's own rule, done before it has to).
  room(need, reserve = 16) {
    const g = this.g, P = g.player;
    while (g.freeSlots.length - need < reserve) {
      let best = null, bd = Math.max(70, (g.viewR ?? 0) + 10);
      for (const c of g.chars) if (!c.alive && c !== P && !c.npc && !c.res && !c.wild && c.deadTime > 20) { const d = Math.hypot(c.x - P.x, c.z - P.z); if (d > bd) { bd = d; best = c; } }
      if (!best && g.residents?.yieldSlot()) continue;
      if (!best) { bd = 150; for (const c of g.chars) if (c.alive && c.faction === 'drifter' && !c.npc && !c.res && !c.follower && !c.inVehicle && !c.telling && !c.target) { const d = Math.hypot(c.x - P.x, c.z - P.z); if (d > bd) { bd = d; best = c; } } }
      if (!best) return false;
      g.removeChar(best);
    }
    return true;
  }

  glint(x, y, z, size, color) {
    if (this.nGlint >= MAX_GLINTS) return;
    _o.position.set(x, y, z); _o.rotation.set(0, 0, 0); _o.scale.setScalar(size); _o.updateMatrix();
    this.glints.setMatrixAt(this.nGlint, _o.matrix); this.glints.setColorAt(this.nGlint, _c.set(color)); this.nGlint++;
  }

  update(dt) {
    this.nGlint = 0;
    this.greyborn.update(dt);
    this.grapevine.update(dt);
    this.hotground.update(dt);
    this.traps.update(dt); // last: holds clamp whoever a trap has after everyone moved
    this.glints.count = this.nGlint;
    if (this.nGlint) { this.glints.instanceMatrix.needsUpdate = true; if (this.glints.instanceColor) this.glints.instanceColor.needsUpdate = true; }
  }

  // zombies.think: the kinds that are ours.
  think(c, dt) {
    if (c.zkind === 'greyborn') { this.greyborn.think(c, dt); return true; }
    if (c.hf) { this.hotground.think(c, dt); return true; }
    return false;
  }

  save() { return { traps: this.traps.save(), greyborn: this.greyborn.save(), grapevine: this.grapevine.save(), hotground: this.hotground.save() }; }
  // A load: everyone promoted goes (the records are the truth), then the records come back from the save.
  load(s) {
    this.greyborn.load(s?.greyborn);
    this.grapevine.load(s?.grapevine);
    this.hotground.load(s?.hotground);
    if (s?.traps) this.traps.load(s.traps);
    for (const c of [...this.g.chars]) if (c.wild) this.g.removeChar(c);
  }
}
