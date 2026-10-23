import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { HOT_GROUND, HOT_FAUNA, DOSE } from '../data/hotground.js';
import { hash32, rngOf } from '../world/geo.js';

// HOT GROUND (docs/design/WEB_GREYBORN_GRAPEVINE.md §3.4; rows in data/hotground.js). A zone poisons the ground: your
// dose climbs while you stand in it (half in a car, double near the Lantern) and falls slowly outside; the DOSE row is
// the need hook the survival system can absorb whole (until then this module caps your hp by the band's cut). Each zone
// has its look (a sick yellow-olive ground, fused glass, dead husks, rusted drums, a ground glow by night) and its
// creatures: Glasslings buried in the sand that come up under you, and the Lantern that follows.
export class HotGround {
  constructor(game) {
    this.g = game;
    this.enabled = true;
    this.dose = 0; this.rate = 0; this.inZone = null; this.clickT = 0; this.cut = 0; this.band = 'CLEAN';
    this.zones = HOT_GROUND.map((row) => ({ row, live: false, fauna: [], seed: hash32(row.id.length * 313, row.x | 0, row.z | 0) }));
    this.build();
  }

  build() {
    const g = this.g, geos = [];
    const tint = (geo, hex) => { geo = geo.index ? geo.toNonIndexed() : geo; const n = geo.attributes.position.count, c = new THREE.Color(hex), a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } geo.setAttribute('color', new THREE.BufferAttribute(a, 3)); return geo; };
    const stains = [];
    for (const Z of this.zones) {
      const R = Z.row, L = R.look, rng = rngOf(Z.seed);
      // The sick ground: a painted stain (blotches thicker toward the middle, cracks, a ragged edge that fades out),
      // one textured plane per zone. Its canvas doubles as the night glow's mask, so the glow is patchy too.
      const cv = document.createElement('canvas'); cv.width = cv.height = 512;
      const cx = cv.getContext('2d');
      for (let k = 0; k < 260; k++) {
        const a = rng() * 6.28, rr = Math.sqrt(rng()) * 210 * (k < 60 ? 0.5 : 1), x = 256 + Math.sin(a) * rr, y = 256 + Math.cos(a) * rr, s = 14 + rng() * 46;
        const grd = cx.createRadialGradient(x, y, 0, x, y, s), col = new THREE.Color(L.stain[k % L.stain.length]);
        const al = (0.16 + rng() * 0.22) * (1 - rr / 260);
        grd.addColorStop(0, `rgba(${(col.r * 255) | 0},${(col.g * 255) | 0},${(col.b * 255) | 0},${al.toFixed(3)})`); grd.addColorStop(1, `rgba(${(col.r * 255) | 0},${(col.g * 255) | 0},${(col.b * 255) | 0},0)`);
        cx.fillStyle = grd; cx.fillRect(x - s, y - s, s * 2, s * 2);
      }
      // Fine crazing in the fused crust (short, thin, faint: from above it reads as texture, not lines).
      cx.strokeStyle = 'rgba(40,36,18,0.32)'; cx.lineWidth = 0.8;
      for (let k = 0; k < 90; k++) { const a = rng() * 6.28, rr = Math.sqrt(rng()) * 150; let x = 256 + Math.sin(a) * rr, y = 256 + Math.cos(a) * rr; cx.beginPath(); cx.moveTo(x, y); for (let j = 0; j < 4; j++) { x += (rng() - 0.5) * 12; y += (rng() - 0.5) * 12; cx.lineTo(x, y); } cx.stroke(); }
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
      // The glow's own mask: the same kind of blotches, stronger, gathered toward the middle.
      const gv = document.createElement('canvas'); gv.width = gv.height = 256;
      const gx = gv.getContext('2d');
      for (let k = 0; k < 70; k++) {
        const a = rng() * 6.28, rr = Math.sqrt(rng()) * 95, x = 128 + Math.sin(a) * rr, y = 128 + Math.cos(a) * rr, s = 10 + rng() * 26;
        const grd = gx.createRadialGradient(x, y, 0, x, y, s), al = (0.25 + rng() * 0.35) * (1 - rr / 120);
        grd.addColorStop(0, `rgba(255,255,255,${al.toFixed(3)})`); grd.addColorStop(1, 'rgba(255,255,255,0)');
        gx.fillStyle = grd; gx.fillRect(x - s, y - s, s * 2, s * 2);
      }
      const gtex = new THREE.CanvasTexture(gv);
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(R.r * 2.4, R.r * 2.4).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 1 }));
      plane.position.set(R.x, 0.06, R.z); plane.rotation.y = rng() * 6.28; plane.receiveShadow = true; plane.renderOrder = 1;
      g.scene.add(plane); stains.push({ plane, tex: gtex });
      // Fused glass: small irregular plates, pale green-yellow, scattered thickest in the middle.
      for (let k = 0; k < R.glass; k++) {
        const a = rng() * 6.28, r = Math.sqrt(rng()) * R.r * 0.8, b = new THREE.CircleGeometry(0.25 + rng() * 0.55, 5 + Math.floor(rng() * 3));
        b.scale(1, 0.4 + rng() * 0.6, 1); b.rotateZ(rng() * 3); b.rotateX(-Math.PI / 2 + (rng() - 0.5) * 0.12); b.translate(R.x + Math.sin(a) * r, 0.09, R.z + Math.cos(a) * r);
        geos.push(tint(b, rng() < 0.25 ? '#d4dc9c' : L.glass));
      }
      // Dead husks: bare trunks with a few broken limbs.
      for (let k = 0; k < R.husks; k++) {
        const a = rng() * 6.28, r = 6 + rng() * R.r * 0.9, x = R.x + Math.sin(a) * r, z = R.z + Math.cos(a) * r, h = 3 + rng() * 3.5;
        const t = new THREE.CylinderGeometry(0.08, 0.22, h, 5); t.rotateZ((rng() - 0.5) * 0.25); t.translate(x, h / 2, z); geos.push(tint(t, L.husk));
        for (let j = 0; j < 3; j++) { const l = new THREE.CylinderGeometry(0.03, 0.07, 1.2 + rng(), 4); l.translate(0, 0.6, 0); l.rotateZ(0.7 + rng() * 0.6); l.rotateY(rng() * 6.28); l.translate(x, h * (0.45 + j * 0.15), z); geos.push(tint(l, L.husk)); }
        g.statics.addCentered(x, z, 0.5, 0.5, 'husk', h);
      }
      // Rusted drums, some on their side.
      for (let k = 0; k < R.drums; k++) {
        const a = rng() * 6.28, r = rng() * R.r * 0.7, x = R.x + Math.sin(a) * r, z = R.z + Math.cos(a) * r, d = new THREE.CylinderGeometry(0.42, 0.42, 1.2, 10), side = rng() < 0.4;
        if (side) { d.rotateZ(Math.PI / 2); d.rotateY(rng() * 3); d.translate(x, 0.42, z); } else d.translate(x, 0.6, z);
        geos.push(tint(d, L.drum));
        const band = new THREE.CylinderGeometry(0.44, 0.44, 0.22, 10); if (side) { band.rotateZ(Math.PI / 2); band.translate(x, 0.42, z); } else band.translate(x, 0.75, z); geos.push(tint(band, '#c8b23a')); // the old yellow band
        g.statics.addCentered(x, z, 0.9, 0.9, 'drum', 1.2);
      }
      // A warning sign at the edge, facing the road in.
      const sx = R.x + R.r * 0.95, sz = R.z + 4; const post = new THREE.BoxGeometry(0.12, 2.2, 0.12); post.translate(sx, 1.1, sz); geos.push(tint(post, '#3a3026'));
      const plate = new THREE.BoxGeometry(0.05, 0.9, 1.0); plate.translate(sx + 0.08, 2.0, sz); geos.push(tint(plate, '#c8b23a'));
      const mark = new THREE.BoxGeometry(0.06, 0.35, 0.35); mark.translate(sx + 0.1, 2.0, sz); geos.push(tint(mark, '#1e1a14'));
    }
    if (geos.length) { this.mesh = new THREE.Mesh(mergeGeometries(geos), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.1 })); this.mesh.castShadow = true; this.mesh.receiveShadow = true; g.scene.add(this.mesh); }
    // The glow: a patchy additive sheet over the stain, nearly nothing by day and a sick light at night.
    this.glows = stains.map(({ plane, tex }, i) => {
      const m = new THREE.MeshBasicMaterial({ map: tex, color: this.zones[i].row.look.glow, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
      const p = new THREE.Mesh(plane.geometry, m); p.position.copy(plane.position); p.position.y = 0.12; p.rotation.copy(plane.rotation); p.renderOrder = 3;
      g.scene.add(p);
      return m;
    });
  }

  // Where you are in it: the zone, how deep (0 edge .. 1 centre).
  at(x, z) { for (const Z of this.zones) { const d = Math.hypot(x - Z.row.x, z - Z.row.z); if (d < Z.row.r) return { Z, k: 1 - d / Z.row.r }; } return null; }
  rateAt(x, z, inCar = false) {
    const h = this.at(x, z);
    if (!h) return 0;
    let r = h.Z.row.dose * h.k ** 1.5 * (inCar ? DOSE.carMul : 1);
    for (const c of h.Z.fauna) if (c.alive && c.hf?.kind === 'lantern' && Math.hypot(c.x - x, c.z - z) < HOT_FAUNA.lantern.near) { r *= HOT_FAUNA.lantern.doseMul; break; }
    return r;
  }
  bandOf(dose) { let b = DOSE.bands[0]; for (const q of DOSE.bands) if (dose >= q.at) b = q; return b; }

  // ---- the creatures --------------------------------------------------------------------------------------------
  wake(Z) {
    const g = this.g, R = Z.row, rng = rngOf(Z.seed ^ ((g.society?.day ?? 0) * 7919));
    for (const [kind, n] of Object.entries(R.fauna)) for (let i = 0; i < n; i++) {
      if (!g.wilds.room(1)) break;
      const F = HOT_FAUNA[kind], a = rng() * 6.28, r = kind === 'lantern' ? R.r * 0.6 : 6 + rng() * R.r * 0.8;
      const colors = { skin: F.body.skin, hair: F.body.skin, shirt: F.body.shirt, pants: F.body.pants, boots: F.body.pants, hat: F.body.skin, hatStyle: 'bald', gearStyle: kind === 'glassling' ? 'pack' : 'none', gear: '#c8cfa0', accStyle: 'none', sleeves: 'short' };
      const c = g.addChar({ x: R.x + Math.sin(a) * r, z: R.z + Math.cos(a) * r, faction: 'zombie', weapon: null, hp: F.hp, colors, name: F.name, flag: g.randomFlag(rng) });
      if (!c) break;
      c.zkind = kind; c.zSpeed = F.speed; c.wild = true; c.timer = 0;
      c.hf = { kind, zone: Z, buried: kind === 'glassling', home: { x: c.x, z: c.z } };
      if (kind === 'glassling') { c.hidden = true; c.crouch = true; }
      g.charR.paint(c);
      Z.fauna.push(c);
    }
    Z.live = true;
    g.emit('hotGroundWoke', { zone: R.id, fauna: Z.fauna.length });
  }
  sleep(Z) { const g = this.g; for (const c of Z.fauna) if (g.chars.includes(c)) g.removeChar(c); Z.fauna = []; Z.live = false; }

  // zombies.think hands zkind glassling / lantern here.
  think(c, dt) {
    const g = this.g, H = c.hf, F = HOT_FAUNA[H.kind], R = H.zone.row, P = g.player;
    c.aiming = false;
    if (H.kind === 'lantern') {
      // It follows at a distance, facing you; it never comes closer than `follow`.
      const d = Math.hypot(P.x - c.x, P.z - c.z), inZone = Math.hypot(P.x - R.x, P.z - R.z) < R.r + 25;
      const tx = inZone && d > F.follow ? P.x : H.home.x, tz = inZone && d > F.follow ? P.z : H.home.z;
      if (Math.hypot(tx - c.x, tz - c.z) > (inZone ? F.follow : 1)) g.ai.move(c, tx - c.x, tz - c.z, F.speed, dt); else c.speed = 0;
      c.face = Math.atan2(P.x - c.x, P.z - c.z);
      if ((g.sky?.night ?? 0) > 0.4 && g.wilds) g.wilds.glint(c.x, 1.75 + (c.gy ?? 0), c.z, 0.22, F.body.glow);
      return;
    }
    // A Glassling: buried until something walks near, then it comes up and goes for it; it never leaves its ground.
    if (H.buried) {
      if ((H.scan = (H.scan ?? Math.random() * 0.3) - dt) > 0) { c.speed = 0; return; }
      H.scan = 0.3;
      for (const o of g.chars) {
        if (!o.alive || o.faction === 'zombie' || o.inVehicle || Math.abs(o.x - c.x) > F.wake || Math.abs(o.z - c.z) > F.wake) continue;
        if (Math.hypot(o.x - c.x, o.z - c.z) <= F.wake) { H.buried = false; c.hidden = false; c.ztarget = o; g.fx.dust(c.x, c.z, 4); g.audio.burst?.({ dur: 0.3, freq: 2400, type: 'highpass', vol: 0.25, decay: 0.25, pan: g.pan(c.x) }); g.emit('glasslingRose', { id: c.id, at: o.id }); break; }
      }
      return;
    }
    const t = c.ztarget;
    if (!t || !t.alive || Math.hypot(t.x - R.x, t.z - R.z) > R.r + F.leash * 0.5 || Math.hypot(c.x - H.home.x, c.z - H.home.z) > F.leash) {
      c.ztarget = null;
      if (Math.hypot(H.home.x - c.x, H.home.z - c.z) > 1) g.ai.move(c, H.home.x - c.x, H.home.z - c.z, F.speed * 0.6, dt);
      else { H.buried = true; c.hidden = true; c.speed = 0; } // back under the sand
      return;
    }
    const d = Math.hypot(t.x - c.x, t.z - c.z);
    if (d < 1.1) {
      c.speed = 0; c.face = Math.atan2(t.x - c.x, t.z - c.z);
      if ((c.cool -= dt) <= 0) { c.cool = 0.8; g.combat.damage(t, F.claw, c, (t.x - c.x) / (d || 1), (t.z - c.z) / (d || 1), 'bite'); if (t === P && !g.godMode) this.dose += F.hot; }
    } else g.ai.move(c, t.x - c.x, t.z - c.z, F.speed, dt);
  }

  update(dt) {
    const g = this.g, P = g.player;
    if (!this.enabled) return;
    const px = P.inVehicle ? P.inVehicle.x : P.x, pz = P.inVehicle ? P.inVehicle.z : P.z;
    for (const Z of this.zones) {
      Z.fauna = Z.fauna.filter((c) => g.chars.includes(c));
      const d = Math.hypot(px - Z.row.x, pz - Z.row.z);
      if (!Z.live && d < Z.row.wakeR) this.wake(Z);
      else if (Z.live && d > Z.row.wakeR + 60 && !Z.fauna.some((c) => c.alive && c.ztarget === P)) this.sleep(Z);
    }
    // The dose.
    const h = P.alive ? this.at(px, pz) : null;
    this.rate = P.alive ? this.rateAt(px, pz, !!P.inVehicle) : 0;
    if (this.rate > 0) this.dose += this.rate * dt;
    else this.dose = Math.max(0, this.dose - DOSE.decay * dt * (g.sky?.timeScale ?? 1 / 30) * (g.sky?.fast ? 40 : 1));
    if (h && this.inZone !== h.Z.row.id) { this.inZone = h.Z.row.id; g.hud?.toast(`HOT GROUND · ${h.Z.row.name} · THE DOSIMETER CLICKS`, 'warn'); g.emit('hotGround', { zone: h.Z.row.id, entered: true }); }
    else if (!h && this.inZone) { g.emit('hotGround', { zone: this.inZone, entered: false, dose: Math.round(this.dose) }); this.inZone = null; }
    // The dosimeter: clicks faster as the rate climbs.
    if (this.rate > 0) { this.clickT -= dt * (0.6 + this.rate * 3); if (this.clickT <= 0) { this.clickT = 0.5 + Math.random() * 0.6; g.audio.burst?.({ dur: 0.012, freq: 4200, type: 'highpass', vol: 0.18, decay: 0.01 }); } }
    // What it costs: the band's cut of max hp, as a cap, until survival takes the DOSE row over.
    const b = this.bandOf(this.dose);
    if (b.label !== this.band) { if (b.cut > (this.cut ?? 0)) g.hud?.toast(`RADIATION: ${b.label}`, 'warn'); this.band = b.label; g.emit('dose', { band: b.label, dose: Math.round(this.dose) }); }
    this.cut = b.cut;
    if (this.cut > 0 && P.alive && !g.godMode) { const cap = (P.maxHp || 100) * (1 - this.cut); if (P.hp > cap) P.hp = cap; }
    const glow = 0.03 + 0.62 * (g.sky?.night ?? 0) * (0.85 + 0.15 * Math.sin(g.time * 1.3));
    for (const m of this.glows) m.opacity = glow;
  }

  view() {
    const P = this.g.player;
    return {
      dose: +this.dose.toFixed(1), rate: +this.rate.toFixed(2), band: this.band, cut: this.cut, inZone: this.inZone, need: DOSE,
      zones: this.zones.map((Z) => ({ id: Z.row.id, name: Z.row.name, x: Z.row.x, z: Z.row.z, r: Z.row.r, d: +Math.hypot(P.x - Z.row.x, P.z - Z.row.z).toFixed(1), awake: Z.live, fauna: Z.fauna.map((c) => ({ id: c.id, kind: c.hf.kind, buried: !!c.hf.buried, alive: c.alive })) })),
    };
  }
  save() { return { dose: +this.dose.toFixed(2) }; }
  load(s) { for (const Z of this.zones) this.sleep(Z); this.dose = s?.dose ?? 0; this.inZone = null; }
}
