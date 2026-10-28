import * as THREE from 'three';
import { SWAMP } from '../data/sealife.js';

// THE NASTY WATER (docs/design/WEB_WATER_LIFE.md §3; rows in data/sealife.js SWAMP). A swamp's or a canal's water is
// murky green-brown and opaque (world/waves.js shades scum, duckweed, algae and rot on it); this dresses it round you:
// lily pads and cypress knees standing in it, weed and kelp strands swaying just under the surface, bubbles of rot coming
// up, and low fog lying on it at dawn and by night. Wading or swimming in it with an open wound dirties the wound
// (systems/survival.js turns a dirty wound into an infection: the survival cost). Everything is pooled and instanced:
// four meshes, hidden when there is no swamp water near you.
const TAU = Math.PI * 2;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _c = new THREE.Color();
// A cell's own seeded numbers (a pure function of where it is: the dressing never shuffles when you come back).
function hsh(a, b, k) { let h = Math.imul(a | 0, 0x27d4eb2f) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(k | 0, 0x9e3779b1); h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; return ((h >>> 0) % 100000) / 100000; }

export class Swamp {
  constructor(game) {
    this.g = game;
    game.swamp = this;
    this.stats = { pads: 0, knees: 0, weed: 0, fog: 0, bubbles: 0, dirtied: 0 };
    this.near = false; this.cellX = 1e9; this.cellZ = 1e9;
    const scene = game.scene;
    const mk = (geo, mat, n, order = 0, shadow = false) => {
      const m = new THREE.InstancedMesh(geo, mat, n);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.count = 0; m.visible = false; m.frustumCulled = false; m.renderOrder = order; m.castShadow = shadow;
      m.material.userData.noCut = true;
      scene?.add(m); return m;
    };
    const S = SWAMP;
    // Lily pads: a notched disc lying on the surface.
    const pad = new THREE.CircleGeometry(0.5, 12, 0.35, TAU - 0.5).rotateX(-Math.PI / 2);
    this.pads = mk(pad, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.7, side: THREE.DoubleSide }), S.pads, 3);
    this.pads.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(S.pads * 3), 3);
    // Cypress knees: knobbly cones standing out of the water.
    this.knees = mk(new THREE.ConeGeometry(0.22, 1, 6).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: S.colour.knee, roughness: 0.95 }), S.knees, 0, true);
    // Weed and kelp: dark strands just under the surface (drawn over the opaque sheet, faint: you see them at the top).
    this.weed = mk(new THREE.PlaneGeometry(0.16, 1).translate(0, 0, -0.5).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: S.colour.weed, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }), S.weed, 2);
    // Fog: soft quads lying on the water, drifting (dawn and night).
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const x = cv.getContext('2d'), gr = x.createRadialGradient(32, 32, 2, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    this.fogMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), color: S.colour.fog, transparent: true, opacity: 0, depthWrite: false, fog: false });
    this.fog = mk(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), this.fogMat, S.fog, 5);
    this.fogA = new Float32Array(S.fog * 2); // drift phases
    for (let i = 0; i < S.fog; i++) { this.fogA[i * 2] = Math.random() * TAU; this.fogA[i * 2 + 1] = Math.random(); }
    this.cols = S.colour.pads.map((h) => new THREE.Color(h));
    this.bubT = 0;
  }
  // Is this swamp-class water (a slough, a canal, a lake gone to weed)?
  nasty(kind) { return kind === 'swamp' || kind === 'canal'; }

  // Re-lay the dressing round (cx, cz): every 6 m cell with nasty water rolls its own pads, knees and weed.
  relay(cx, cz) {
    const W = this.g.waves, S = SWAMP, C = S.cell, R = S.radius;
    let np = 0, nk = 0, nw = 0;
    for (let gx = Math.floor((cx - R) / C); gx <= Math.floor((cx + R) / C); gx++) for (let gz = Math.floor((cz - R) / C); gz <= Math.floor((cz + R) / C); gz++) {
      const x0 = gx * C + C * hsh(gx, gz, 1), z0 = gz * C + C * hsh(gx, gz, 2);
      const w = W.kindAt(x0, z0);
      if (!this.nasty(w.kind)) continue;
      const y0 = (this.g.water?.surfaceAt?.(x0, z0, 0) ?? 0);
      const r = hsh(gx, gz, 3);
      if (r < S.padChance && np < S.pads) {
        const n = 1 + Math.floor(hsh(gx, gz, 4) * 4);
        for (let k = 0; k < n && np < S.pads; k++) {
          const px = x0 + (hsh(gx, gz, 10 + k) - 0.5) * 2.4, pz = z0 + (hsh(gx, gz, 20 + k) - 0.5) * 2.4, sc = 0.55 + hsh(gx, gz, 30 + k) * 0.8;
          _p.set(px, y0 + 0.03, pz); _q.setFromEuler(_e.set(0, hsh(gx, gz, 40 + k) * TAU, 0)); _s.set(sc, 1, sc); _m.compose(_p, _q, _s);
          this.pads.setMatrixAt(np, _m); this.pads.setColorAt(np, this.cols[(k + gx) % this.cols.length]); np++;
        }
      }
      if (w.kind === 'swamp' && r > 1 - S.kneeChance && nk < S.knees) {
        for (let k = 0; k < 3 && nk < S.knees; k++) {
          const px = x0 + (hsh(gx, gz, 50 + k) - 0.5) * 1.6, pz = z0 + (hsh(gx, gz, 60 + k) - 0.5) * 1.6, h = 0.35 + hsh(gx, gz, 70 + k) * 0.7;
          _p.set(px, y0 - 0.3, pz); _q.identity(); _s.set(1 + h * 0.4, h + 0.3, 1 + h * 0.4); _m.compose(_p, _q, _s); this.knees.setMatrixAt(nk++, _m);
        }
      }
      if (hsh(gx, gz, 5) < S.weedChance && nw < S.weed) {
        for (let k = 0; k < 4 && nw < S.weed; k++) this.weedRec[nw++] = { x: x0 + (hsh(gx, gz, 80 + k) - 0.5) * 3, z: z0 + (hsh(gx, gz, 90 + k) - 0.5) * 3, h: hsh(gx, gz, 100 + k) * TAU, len: 1.2 + hsh(gx, gz, 110 + k) * 2.2, ph: hsh(gx, gz, 120 + k) * TAU, y: y0 };
      }
    }
    this.np = np; this.nk = nk; this.nw = nw;
    this.pads.count = np; this.pads.visible = np > 0; this.pads.instanceMatrix.needsUpdate = true; if (np) this.pads.instanceColor.needsUpdate = true;
    this.knees.count = nk; this.knees.visible = nk > 0; this.knees.instanceMatrix.needsUpdate = true;
    this.stats.pads = np; this.stats.knees = nk; this.stats.weed = nw;
  }

  update(dt) {
    const g = this.g, W = g.waves, S = SWAMP;
    if (!W) return;
    this.weedRec ??= new Array(S.weed);
    const f = g.camLook ?? g.player, p = g.player;
    // Near nasty water at all? (a few samples round you, every half second)
    this.chkT = (this.chkT ?? 0) - dt;
    if (this.chkT <= 0) {
      this.chkT = 0.5;
      let any = false;
      for (let i = 0; i < 9 && !any; i++) { const a = (i / 8) * TAU, r = i ? S.radius * 0.6 : 0; any = this.nasty(W.kindAt(f.x + Math.sin(a) * r, f.z + Math.cos(a) * r).kind); }
      this.near = any;
      if (!any) { this.pads.visible = this.knees.visible = this.weed.visible = this.fog.visible = false; this.stats.pads = this.stats.knees = this.stats.weed = 0; this.cellX = 1e9; }
    }
    if (!this.near) return;
    const cx = Math.round(f.x / 12) * 12, cz = Math.round(f.z / 12) * 12;
    if (cx !== this.cellX || cz !== this.cellZ) { this.cellX = cx; this.cellZ = cz; this.relay(cx, cz); }
    // Weed sways.
    const t = W.t;
    for (let i = 0; i < this.nw; i++) {
      const w = this.weedRec[i];
      _p.set(w.x, w.y + 0.06, w.z); _q.setFromEuler(_e.set(0, w.h + Math.sin(t * 0.7 + w.ph) * 0.35, 0)); _s.set(1, 1, w.len); _m.compose(_p, _q, _s);
      this.weed.setMatrixAt(i, _m);
    }
    this.weed.count = this.nw; this.weed.visible = this.nw > 0; if (this.nw) this.weed.instanceMatrix.needsUpdate = true;
    // Fog: thickest at night and in the first light (the sky's hour), drifting on the water round you.
    const hr = g.sky?.time ?? 12, night = g.sky?.night ?? 0, dawn = Math.max(0, 1 - Math.abs(hr - 6) / 1.8);
    const k = Math.min(1, night * 0.85 + dawn);
    this.fogMat.opacity = k * S.fogOpacity;
    let nf = 0;
    if (k > 0.03) {
      for (let i = 0; i < S.fog; i++) {
        const a = this.fogA[i * 2] + t * 0.02, r = S.radius * (0.15 + this.fogA[i * 2 + 1] * 0.85), x = f.x + Math.sin(a) * r, z = f.z + Math.cos(a * 1.3) * r;
        if (!this.nasty(W.kindAt(x, z).kind)) continue;
        const y0 = (g.water?.surfaceAt?.(x, z, 0) ?? 0), sc = 9 + this.fogA[i * 2 + 1] * 12;
        _p.set(x, y0 + 0.6 + this.fogA[i * 2 + 1] * 0.8, z); _q.setFromEuler(_e.set(0, a, 0)); _s.set(sc, 1, sc * 0.6); _m.compose(_p, _q, _s);
        this.fog.setMatrixAt(nf++, _m);
      }
    }
    this.fog.count = nf; this.fog.visible = nf > 0; if (nf) this.fog.instanceMatrix.needsUpdate = true;
    this.stats.fog = nf;
    // Rot coming up: bubbles (pooled foam puffs) here and there in the scum.
    this.bubT -= dt;
    if (this.bubT <= 0) {
      this.bubT = S.bubbleEvery * (0.5 + Math.random());
      const a = Math.random() * TAU, r = Math.random() * S.radius * 0.7, x = f.x + Math.sin(a) * r, z = f.z + Math.cos(a) * r;
      if (this.nasty(W.kindAt(x, z).kind)) { const y0 = g.water?.surfaceAt?.(x, z, 0) ?? 0; for (let i = 0; i < 3; i++) W.puff(x + (Math.random() - 0.5) * 0.6, z + (Math.random() - 0.5) * 0.6, y0, 0, 0, 0.1, 0.25, 1.4, 0.7); this.stats.bubbles++; }
    }
    // The survival cost: in this water with an open wound, the wound takes dirt (survival.js: dirt >= 1 -> infection).
    const wet = g.water.stateAt(p.x, p.z, p.gy);
    if (wet !== 'dry' && !p.inVehicle && !p.onDeck && this.nasty(W.kindAt(p.x, p.z).kind)) {
      const N = g.needs;
      let open = false;
      for (const w of N?.wounds ?? []) if (w.open !== false && !w.clean) { w.dirt = Math.min(1, (w.dirt ?? 0) + S.dirtPerSec * dt * (wet === 'swim' ? 1.6 : 1)); open = true; }
      if (open) { this.stats.dirtied += dt; if (!this.warned) { this.warned = true; g.hud?.toast?.('FILTHY WATER IN AN OPEN WOUND', 'warn'); g.emit?.('swampWound', {}); } }
      p.swampSlow = S.wadeSlow;
    } else { p.swampSlow = 1; this.warned = false; }
  }
  summary() { return { near: this.near, ...this.stats }; }
}
