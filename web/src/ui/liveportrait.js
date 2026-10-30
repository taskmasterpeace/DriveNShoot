import * as THREE from 'three';
import { Character, CharacterRenderer } from '../systems/characters.js';
import { WEAPONS } from '../systems/combat.js';
import { FLAGS } from './portrait.js';

// THE LIVE PORTRAIT (docs/design/WEB_LSW_BODIES.md "Portraits"): the talk box shows the person you talk to as the REAL
// in-game model, never a drawn stand-in. A small renderer of its own (made once for the page's life, like the creator's
// preview) holds one Character that copies the person's look (the fields below: what CharacterRenderer and the faceted
// bodies read), drawn by the same CharacterRenderer and LswBodies as the world, in the world's body mode. Their face, hair,
// frame, clothes, colours, hats and gear come out of the same generator, keyed on the same name and colours. Head and
// shoulders over their flag, turning a little, breathing. Until the faceted kit has loaded only the flag is shown.
const LOOK = ['colors', 'build', 'look', 'hand', 'faction', 'name', 'npc', 'flag', 'weapon', 'holstered', 'oneHand', 'zkind', 'rot', 'blood', 'charred'];
export const PORTRAIT = { w: 200, h: 240, fov: 22, frameH: 0.78, faceAt: 0.42, face: 0.32, sway: 0.12 };

export class LivePortrait {
  constructor(P = PORTRAIT) {
    this.P = P;
    this.canvas = document.createElement('canvas'); this.canvas.width = P.w; this.canvas.height = P.h;
    this.r = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
    this.r.setPixelRatio(1); this.r.setSize(P.w, P.h, false); this.r.setClearColor(0x000000, 0);
    this.r.toneMapping = THREE.ACESFilmicToneMapping; this.r.toneMappingExposure = 1.15;
    this.scene = new THREE.Scene();
    this.cam = new THREE.PerspectiveCamera(P.fov, P.w / P.h, 0.1, 20);
    this.scene.add(new THREE.HemisphereLight('#fff0d8', '#3a2a1a', 1.35)); // the creator's light: the body reads the same in both
    const key = new THREE.DirectionalLight('#ffe0b0', 2.4); key.position.set(2.2, 4, 3.2); this.scene.add(key);
    const rim = new THREE.DirectionalLight('#e0a050', 1.6); rim.position.set(-3, 2.5, -2.5); this.scene.add(rim);
    this.charR = new CharacterRenderer(this.scene, WEAPONS);
    this.charR.lsw.focus = { x: 0, z: 0 }; // the one person stands here: nearest, so they wear the faceted body
    this.ch = null; this.list = []; this.who = null;
    this.t = 0; this.headY = 0; this.back = null; this.backFlag = null;
  }

  get ready() { const L = this.charR.lsw; return L.mode !== 'lsw' || L.ready || !!L.error; }

  // Take on this person's look. mode: the world's body mode (lsw | classic), so the portrait is what you saw.
  show(c, mode = 'lsw') {
    const ch = this.ch ?? (this.ch = new Character(0, { x: 0, z: 0, face: 0, hp: 100, faction: c.faction, colors: c.colors }));
    for (const k of LOOK) ch[k] = c[k] ?? null;
    ch.faction ??= 'drifter'; ch.hand ??= 'R'; ch.blood ??= 0; ch.rot ??= 0; ch.flag ??= 'US'; ch.alive = true; ch.x = 0; ch.z = 0; ch.gy = 0; ch.timer = 0; ch.state = 'idle'; ch.aiming = false;
    this.list[0] = ch;
    this.charR.lsw.setMode(mode);
    this.charR.paint(ch);
    this.who = c; this.t = 0; this.headY = 0;
    if (this.backFlag !== ch.flag) { this.back = backdrop(ch.flag, this.P.w, this.P.h); this.backFlag = ch.flag; }
  }

  // Draw one frame of the portrait into a 2D context (the talk box's canvas): the flag, then the live body over it.
  frame(dt, out) {
    const P = this.P, ch = this.ch;
    out.clearRect(0, 0, P.w, P.h);
    if (this.back) out.drawImage(this.back, 0, 0);
    if (!ch || !this.ready) return false;
    this.t += dt;
    ch.face = P.face + Math.sin(this.t * 0.6) * P.sway;
    this.charR.sync(this.list, dt);
    if (!this.headY) { // where the head is, once: the faceted head, or the classic rig's by build
      const b = this.charR.lsw.bones(ch, ['head']);
      this.headY = b?.head?.[1] ?? 1.62 * (ch.build?.h ?? 1);
    }
    const hv = P.frameH / 2, d = hv / Math.tan(P.fov * Math.PI / 360), cy = this.headY - (0.5 - P.faceAt) * 2 * hv; // the head sits faceAt of the way down
    this.cam.position.set(0, cy + 0.06, d); this.cam.lookAt(0, cy, 0);
    this.r.render(this.scene, this.cam);
    out.drawImage(this.canvas, 0, 0); // same task as the render: the WebGL canvas still holds the frame
    return true;
  }
}

// The flag behind them, weathered as the old drawn portrait's was: a dark wash and a vignette, so the body reads in front.
function backdrop(flag, w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  (FLAGS[flag] ?? FLAGS.US).draw(g, w, h);
  g.fillStyle = 'rgba(20,14,8,0.42)'; g.fillRect(0, 0, w, h);
  const vg = g.createRadialGradient(w / 2, h * 0.45, h * 0.2, w / 2, h * 0.5, h * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.75)');
  g.fillStyle = vg; g.fillRect(0, 0, w, h);
  return c;
}
