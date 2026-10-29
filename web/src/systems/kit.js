import * as THREE from 'three';
import { KIT, CELLS, HEAT, AIR_ZONES, CHEM_ZONES, CHATTER } from '../data/gadgets.js';
import { UTILITY } from '../data/workshop.js';
import { DOG_GEAR } from '../data/dogs.js';
import { CHANNELS } from '../data/pulls.js';
import { radialGlow } from '../world/textures.js';

// GADGETS-2: THE KIT YOU WEAR AND LOOK THROUGH (docs/design/WEB_GADGETS2.md). Rows: data/gadgets.js KIT, CELLS, HEAT,
// AIR_ZONES, CHEM_ZONES, CHATTER; data/workshop.js UTILITY hubspikes / spotlight / winch; data/dogs.js DOG_GEAR.
//   optics    night goggles and the heat scope: a clip-space overlay pass (a fullscreen triangle that ignores the camera,
//             so screenshots get it too) multiplying the frame into green or dim amber, the renderer's exposure for the
//             gain, an additive glare pass for the whiteout and the halos round bright things. No light is added.
//   heat      every body's temperature (living warm, the infected cold, corpses cooling on HEAT.tau): one instanced
//             mesh of blobs drawn over brush, coloured on the white-hot ramp, shown only where your eyes have a line of
//             sight (leaves don't stop heat; walls do)
//   glass     binoculars and the scope: the camera rises and leans out along your aim (g.droneCam, the same follow the
//             drone uses), and what is in its cone, in range and in LINE OF SIGHT is marked (c.marked / v.kitMarked)
//   beam      the flashlight cone in main.js now needs a carried light with charge; a lit body is seen further at night
//   scanner   a channel (data/pulls.js CHANNELS.scanner): only real key-ups (a rolling convoy's lead, the bulls'
//             dispatcher) inside range, with a live cell, become copies you hold (law 6)
//   air       smoke, chemical ground, dead air underground: the mask breathes for you while a filter lasts
//   dog gear  a vest that soaks, a lamp that lights the ground round it, a bark collar that marks what the dog sensed
//   car       hub spikes shred a car alongside, a roof spotlight (seen further), the winch pulls doors and gates, the
//             nitrous burst's flame
// Every cell and filter is an item found in the world and spent here (law 2). Nothing allocates per frame.
const MAX_HEAT = 96, MAX_DECOR = 160, MAX_GLOW = 24, GLARE_PTS = 8, D2R = Math.PI / 180;
const _o = new THREE.Object3D(), _c = new THREE.Color(), _v = new THREE.Vector3();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const r1 = (v) => Math.round(v * 10) / 10;
const SLOTS = ['eyes', 'glass', 'beam', 'ears', 'face'];
const RAMP = HEAT.ramp.map(([t, c]) => [t, new THREE.Color(c)]);

const VERT = 'varying vec2 vUv; void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }';
// The multiply pass: CustomBlending dst*src + src*dst = 2*src*dst, so a src of 0.5 leaves the frame as it was, 1.0
// doubles it (the tubes' amplification, clipped where it blows out), a tint below 0.5 pulls that channel down.
const MUL_FRAG = `uniform vec3 tint; uniform float grain, t, vig, scan; varying vec2 vUv;
  float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  void main(){
    float n = h(floor(gl_FragCoord.xy * 0.5) + fract(t * 7.0) * 91.0);
    float d = length(vUv - 0.5) * 1.42;
    float v = 1.0 - vig * smoothstep(0.55, 1.05, d);
    float s = 1.0 - scan * (0.5 + 0.5 * sin(gl_FragCoord.y * 1.9));
    gl_FragColor = vec4(tint * (1.0 - grain + grain * 2.0 * n) * v * s, 1.0);
  }`;
// The glare pass (additive): the whiteout when the tubes are blinded, and a soft halo round each bright thing on screen.
const GLARE_FRAG = `uniform vec3 col, lift; uniform float blind, aspect; uniform vec3 pts[${GLARE_PTS}]; varying vec2 vUv;
  void main(){
    float a = blind * 0.92;
    for (int i = 0; i < ${GLARE_PTS}; i++) { vec2 d = (vUv - pts[i].xy) * vec2(aspect, 1.0); a += pts[i].z * 0.16 / (0.02 + dot(d, d) * 18.0); }
    gl_FragColor = vec4(col * min(a, 1.6) + lift, 1.0);
  }`;

export class Kit {
  constructor(game) {
    const g = (this.g = game);
    this.staged = false; // the selftest battery: cells hold their charge and the beam needs no torch (runSelfTest; our checks clear it)
    this.on = { eyes: null, glass: 'auto', beam: 'auto', ears: null, face: 'auto' }; // what is switched on (an item id, 'auto', or null)
    this.charge = { flashlight: KIT.flashlight.power.life }; // seconds left in the cell (or filter) now in each device (the start kit's torch has one in)
    this.look = false; this.lookT = 0; this.glassT = 0;       // the glass held to the eye
    this.blind = 0; this.heard = []; this.air = null; this.airT = 0; this.coughT = 0;
    this.convoyRef = null; this.convoyT = 0; this.dispatched = 0;
    this.winchLine = null; // { v, door, len } while the winch holds a door or a gate
    this.counts = { cells: 0, filters: 0, marked: 0, heardScanner: 0, choked: 0, chokeDmg: 0, slashed: 0, doorsPulled: 0, barkMarks: 0, blinded: 0, soaked: 0 };
    this.chemArmed = true;
    this.build();
    this.chip();
  }

  // ---- the meshes (5 draw calls at most, each hidden when it has nothing to draw) ------------------------------------
  build() {
    const g = this.g, tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    const quad = (frag, uniforms, blending) => {
      const m = new THREE.Mesh(tri, new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false, transparent: true, toneMapped: false, ...blending }));
      m.frustumCulled = false; m.visible = false; g.scene.add(m); return m;
    };
    this.mul = quad(MUL_FRAG, { tint: { value: new THREE.Vector3(0.5, 0.5, 0.5) }, grain: { value: 0 }, t: { value: 0 }, vig: { value: 0.6 }, scan: { value: 0.06 } },
      { blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.DstColorFactor, blendDst: THREE.SrcColorFactor });
    this.mul.renderOrder = 990;
    this.glarePts = Array.from({ length: GLARE_PTS }, () => new THREE.Vector3());
    this.glare = quad(GLARE_FRAG, { col: { value: new THREE.Color('#bfffc4') }, lift: { value: new THREE.Color(0, 0, 0) }, blind: { value: 0 }, aspect: { value: 16 / 9 }, pts: { value: this.glarePts } }, { blending: THREE.AdditiveBlending });
    this.glare.renderOrder = 991;
    // Heat: soft blobs over everything (brush, smoke, roofs over the street), under the overlay's own order.
    const blob = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.heatMesh = new THREE.InstancedMesh(blob, new THREE.MeshBasicMaterial({ map: radialGlow(), transparent: true, depthTest: false, depthWrite: false, toneMapped: false }), MAX_HEAT);
    this.heatMesh.renderOrder = 992; this.heatMesh.frustumCulled = false; this.heatMesh.count = 0; this.heatMesh.visible = false;
    this.heatMesh.setColorAt(0, _c.set('#000')); g.scene.add(this.heatMesh);
    // Decor: dog vests and lamps, hub spikes, the spotlight's can, the winch drum and its cable.
    this.decor = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0.25 }), MAX_DECOR);
    this.decor.count = 0; this.decor.frustumCulled = false; this.decor.setColorAt(0, _c.set('#000')); g.scene.add(this.decor);
    // Glow: additive ground pools (a dog's lamp, the spotlight's throw, the nitrous flame). No light of their own.
    this.glow = new THREE.InstancedMesh(blob, new THREE.MeshBasicMaterial({ map: radialGlow(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), MAX_GLOW);
    this.glow.count = 0; this.glow.frustumCulled = false; this.glow.renderOrder = 4; this.glow.setColorAt(0, _c.set('#000')); g.scene.add(this.glow);
    // Chemical ground: one stain plane per zone row (merged into one mesh).
    const cv = typeof document !== 'undefined' ? document.createElement('canvas') : null;
    if (cv && CHEM_ZONES.length) {
      cv.width = cv.height = 128; const x = cv.getContext('2d'), Z = CHEM_ZONES[0];
      const gr = x.createRadialGradient(64, 64, 8, 64, 64, 64); gr.addColorStop(0, Z.look.stain); gr.addColorStop(0.7, Z.look.edge); gr.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
      for (let i = 0; i < 90; i++) { x.fillStyle = i % 3 ? 'rgba(40,34,14,0.35)' : 'rgba(150,150,60,0.3)'; const a = (i * 2.39) % 6.28, r = (i * 37) % 52; x.beginPath(); x.arc(64 + Math.cos(a) * r, 64 + Math.sin(a) * r, 2 + (i % 5), 0, 6.28); x.fill(); }
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
      this.chemMesh = new THREE.InstancedMesh(blob, new THREE.MeshLambertMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.85 }), CHEM_ZONES.length);
      CHEM_ZONES.forEach((z, i) => { _o.position.set(z.x, 0.035, z.z); _o.rotation.set(0, i * 1.3, 0); _o.scale.set(z.r * 2.1, 1, z.r * 2.1); _o.updateMatrix(); this.chemMesh.setMatrixAt(i, _o.matrix); });
      this.chemMesh.renderOrder = 1; this.chemMesh.receiveShadow = true; g.scene.add(this.chemMesh);
    }
  }

  // The HUD chip (data/hudlayout.js row `kit`): what is switched on and what is left in it.
  chip() {
    this.chipEl = null; this.chipKey = '';
    if (typeof document === 'undefined') return;
    const st = document.createElement('style');
    st.textContent = `.kit-chip{display:flex;gap:6px;flex-wrap:wrap;max-width:300px;pointer-events:none;font:700 11px var(--display,system-ui);letter-spacing:.06em;color:var(--bone,#efe6d2)}
.kit-chip span{padding:3px 7px;background:rgba(26,20,14,.78);border:1px solid #4a3a26;border-radius:3px}.kit-chip span.lo{color:#ff6a3a;border-color:#7a2a1a}.kit-chip span.g{color:#9dff9a}.kit-chip:empty{display:none}`;
    document.head.appendChild(st);
    this.chipEl = document.createElement('div'); this.chipEl.className = 'kit-chip';
    (document.getElementById('ui') ?? document.body).appendChild(this.chipEl);
  }
  refreshChip() {
    if (!this.chipEl) return;
    const parts = [];
    for (const s of SLOTS) {
      const id = this.active(s); if (!id) continue;
      const K = KIT[id], pct = K.power ? Math.round(100 * this.level(id)) : null;
      parts.push(`<span class="${pct !== null && pct < 15 ? 'lo' : s === 'eyes' && id === 'nvg' ? 'g' : ''}">${K.name.toUpperCase()}${pct !== null ? ` ${pct}%` : ''}</span>`);
    }
    if (this.air) parts.push(`<span class="lo">${AIR_ZONES[this.air].name}${this.masked ? ' · MASK' : ''}</span>`);
    const key = parts.join('');
    if (key !== this.chipKey) { this.chipKey = key; this.chipEl.innerHTML = key; }
  }

  // ---- what you carry and what is on ----------------------------------------------------------------------------------
  carried(id) { return this.g.inventory?.carried?.count?.(id) ?? 0; }
  // The item switched on in a slot right now (null: nothing, or nothing carried that could be).
  active(slot) {
    const want = this.on[slot];
    if (!want) return null;
    if (want !== 'auto') return this.carried(want) ? want : null;
    for (const [id, K] of Object.entries(KIT)) if (K.slot === slot && this.carried(id)) return id; // auto: the first one you carry
    return null;
  }
  level(id) { const K = KIT[id]; return K?.power ? Math.max(0, Math.min(1, (this.charge[id] ?? 0) / K.power.life)) : 1; }
  // Is there charge in it? A flat one thumbs a fresh cell (or filter) in from the pack, which is then gone.
  powered(id) {
    const K = KIT[id];
    if (!K?.power || this.staged) return true;
    if ((this.charge[id] ?? 0) > 0) return true;
    const inv = this.g.inventory;
    if (inv?.carried?.count(K.power.cell) > 0 && inv.spend(K.power.cell, 1)) {
      this.charge[id] = K.power.life;
      if (K.power.cell === 'mask_filter') this.counts.filters++; else this.counts.cells++;
      this.g.emit('kitCell', { device: id, cell: K.power.cell, left: inv.carried.count(K.power.cell) });
      this.g.hud?.toast?.(`${K.name.toUpperCase()}: FRESH ${CELLS[K.power.cell].name.toUpperCase()}`, 'job');
      return true;
    }
    return false;
  }
  drain(id, dt) { if (!this.staged && KIT[id]?.power) this.charge[id] = Math.max(0, (this.charge[id] ?? 0) - dt); }
  // Live: switched on, carried, and with charge.
  live(slot) { const id = this.active(slot); return id && this.powered(id) ? id : null; }

  set(slot, id) {
    if (id && id !== 'auto' && KIT[id]?.slot !== slot) return { ok: false, why: `${id} is not a ${slot} piece` };
    this.on[slot] = id;
    if (slot === 'glass' && !id) this.endLook();
    return { ok: true };
  }
  toggle(id) {
    const K = KIT[id], s = K.slot;
    const was = this.active(s) === id && this.on[s] !== null;
    if (s === 'glass') { this.on.glass = id; this.setLook(!this.look); return { ok: true, text: this.look ? `${K.name.toUpperCase()} UP` : `${K.name.toUpperCase()} DOWN` }; }
    this.on[s] = was ? null : id;
    if (!was && K.power && !this.powered(id)) { this.on[s] = null; return { ok: false, why: `the ${K.name.toLowerCase()} is flat and you carry no ${CELLS[K.power.cell].name.toLowerCase()}` }; }
    return { ok: true, text: `${K.name.toUpperCase()} ${was ? 'OFF' : 'ON'}` };
  }
  // The PACK screen's use: switch a kit piece, or put a piece of dog gear on your nearest dog.
  useItem(verb, id) {
    if (verb === 'kit' && KIT[id]) return this.toggle(id);
    if (verb === 'doggear' && DOG_GEAR[id]) return this.dress(id);
    return { ok: false, why: 'not a kit piece' };
  }

  // ---- the glass ----------------------------------------------------------------------------------------------------
  setLook(on) {
    const P = this.g.player;
    if (on && (!this.active('glass') || P.inVehicle?.driver === P || this.g.drones?.piloting)) return false;
    this.look = !!on; this.glassT = 0;
    if (!on) this.endLook();
    return this.look;
  }
  endLook() { this.look = false; const C = this.g.droneCam; if (C && !this.g.drones?.d) C.active = false; }
  glass(dt) {
    const g = this.g, P = g.player, id = this.look ? this.active('glass') : null;
    if (!id || !P.alive || P.inVehicle?.driver === P || g.drones?.piloting) { if (this.look) this.endLook(); return; }
    const K = KIT[id], a = this.aimAngle(), fx = Math.sin(a), fz = Math.cos(a), C = g.droneCam;
    C.active = true; C.x = P.x + fx * K.lean; C.z = P.z + fz * K.lean; C.h = K.h;
    if ((this.glassT -= dt) > 0) return;
    this.glassT = K.every;
    this.markCone(P.x, P.z, a, K);
  }
  aimAngle() { const g = this.g, P = g.player; return this.aimOverride ?? Math.atan2(g.aim.x - P.x, g.aim.z - P.z); }
  // Mark what the glass sees: in range, in the cone, and with nothing solid between your eyes and it. Returns the count.
  markCone(x, z, a, K) {
    const g = this.g, P = g.player, cs = Math.cos(K.cone), fx = Math.sin(a), fz = Math.cos(a), until = g.time + K.mark;
    let n = 0;
    const sees = (tx, tz) => {
      const dx = tx - x, dz = tz - z, d = Math.hypot(dx, dz);
      return d > 1 && d <= K.range && (dx * fx + dz * fz) / d >= cs && g.los(x, z, tx, tz);
    };
    for (const c of g.chars) {
      if (!c.alive || c === P || c.inVehicle || c.hidden || c.underwater || (c.ug ?? null) !== (P.ug ?? null)) continue;
      if (!sees(c.x, c.z)) continue;
      if (!(c.marked > g.time)) { n++; g.emit('kitMarked', { id: c.id, kind: 'person', faction: c.faction, d: r1(Math.hypot(c.x - x, c.z - z)), by: 'glass' }); }
      c.marked = until;
    }
    for (const v of g.vehicles) {
      if (v === P.inVehicle || v.sunk || !sees(v.x, v.z)) continue;
      if (!(v.kitMarked > g.time)) { n++; g.emit('kitMarked', { id: v.id, kind: 'vehicle', d: r1(Math.hypot(v.x - x, v.z - z)), by: 'glass' }); }
      v.kitMarked = until;
    }
    this.counts.marked += n;
    return n;
  }

  // ---- the beam (main.js's cone) and being seen ------------------------------------------------------------------------
  beamOk() { return this.staged || !!this.live('beam'); }
  beamReach() { const id = this.active('beam'); return id ? KIT[id].reach : 1; }
  // How much further a watcher picks the player out tonight: a lit torch or a car with its roof spotlight burning.
  seenMul() {
    const g = this.g, P = g.player, night = g.sky?.night ?? 0;
    if (night <= 0.55) return 1;
    const v = P.inVehicle;
    if (v) return v.kitSpot ? UTILITY.spotlight.beam.seen : 1;
    if ((g.flashMat?.opacity ?? 0) > 0.05) { const id = this.active('beam'); return id ? KIT[id].seen : KIT.flashlight.seen; }
    return 1;
  }

  // The world's colour grade (systems/lookfeel.js) steps aside while the goggles or the heat scope draw their own picture:
  // a tube's green or a heat camera's amber is the device's, not the region's. (Lens dirt still shows.)
  gradeMul() { return this.mul?.visible ? 0 : 1; }

  // ---- heat ------------------------------------------------------------------------------------------------------------
  airC() { const n = this.g.sky?.night ?? 0; return HEAT.air.day + (HEAT.air.night - HEAT.air.day) * n; }
  heatOf(c) {
    const air = this.airC();
    if (!c) return air;
    if (c.burning > 0) return HEAT.fire;
    if (c.faction === 'zombie' || c.zkind) return air + HEAT.infected; // nothing in there runs warm, alive or put down
    if (c.alive === false || c.dead) return air + (HEAT.living - air) * Math.exp(-(c.deadTime ?? c.deadT ?? 0) / HEAT.tau);
    return c.isDog ? HEAT.living + 1.5 : HEAT.living;
  }
  rampColor(t, out) {
    if (t <= RAMP[0][0]) return out.copy(RAMP[0][1]);
    for (let i = 1; i < RAMP.length; i++) if (t <= RAMP[i][0]) { const [a, ca] = RAMP[i - 1], [b, cb] = RAMP[i]; return out.copy(ca).lerp(cb, (t - a) / (b - a)); }
    return out.copy(RAMP[RAMP.length - 1][1]);
  }

  // ---- the air ---------------------------------------------------------------------------------------------------------
  // The bad air at (x, z) for a person (null: clean). smoke > chem > under, the worst first.
  airAt(c) {
    const g = this.g;
    if (c.ug) {
      const A = g.under?.A, S = A?.site, U = AIR_ZONES.under;
      if (S && (U.kinds.includes(S.kind) || (U.unpowered && S.power !== undefined && !A.rec?.power))) return 'under';
    }
    for (const z of CHEM_ZONES) if (Math.hypot(c.x - z.x, c.z - z.z) < z.r) return 'chem';
    for (const s of g.throwables?.smokes ?? []) if (s.t < s.dur && Math.hypot(c.x - s.x, c.z - s.z) < s.r * 0.85) return 'smoke';
    return null;
  }
  breathe(dt) {
    const g = this.g, P = g.player;
    if ((this.airT -= dt) > 0) return;
    const step = 0.25; this.airT = step;
    this.air = P.alive && !P.inVehicle && !P.underwater ? this.airAt(P) : null;
    this.masked = false;
    if (!this.air) return;
    const Z = AIR_ZONES[this.air], mask = this.active('face');
    if (mask && this.powered(mask)) { this.masked = true; this.drain(mask, step); return; }
    // No mask, or a dry one: it gets into you.
    const hp0 = P.hp;
    g.combat.damage(P, Z.dps * step, null, 0, 0, 'gas');
    const took = Math.max(0, hp0 - P.hp) || (g.godMode ? Z.dps * step : 0);
    this.counts.chokeDmg += Z.dps * step; this.counts.choked++;
    P.shake = Math.max(P.shake ?? 0, Z.shake);
    if ((this.coughT -= step) <= 0) {
      this.coughT = Z.cough; g.noise?.(P.x, P.z, 9, P);
      g.hud?.toast?.(`${Z.name}: YOU CAN'T BREATHE${this.carried('gas_mask') ? ' · THE MASK IS DRY' : ''}`, 'warn');
      g.emit('kitChoke', { zone: this.air, dmg: r1(Z.dps * Z.cough), hp: Math.round(P.hp), took: r1(took) });
    }
  }

  // ---- the scanner -------------------------------------------------------------------------------------------------------
  // A transmitter at (x, z) keyed up: f is the world's fact. It goes on THE AIRWAVES (systems/airwaves.js, the one
  // broadcast source the radio feed shares); the scanner hears it from there (hearKey). Returns your copy, or null.
  keyUp(f, x, z, from) {
    const A = this.g.airwaves;
    return A ? A.send({ channel: 'scanner', fact: f, x, z, from, text: f.text }).copy : this.hearKey(f, x, z, from);
  }
  // The scanner's ear (the airwaves' listener for `scanner`): only with a live scanner switched on, inside its range.
  hearKey(f, x, z, from) {
    const g = this.g, P = g.player, k = g.pulls?.k ?? g.knowledge, id = this.live('ears');
    this.lastKeyUp = { fact: f.id, x: Math.round(x), z: Math.round(z), from, at: r1(g.time) };
    if (!id || !k) return null;
    const range = Math.min(KIT[id].range, CHANNELS.scanner?.range ?? KIT[id].range);
    if (Math.hypot(P.x - x, P.z - z) > range) return null;
    k.holder('player', { x: P.x, z: P.z, name: 'you' });
    const copy = k.put('player', f, { channel: 'scanner', from, fromName: from, at: { x: Math.round(P.x), z: Math.round(P.z) } }, CHANNELS.scanner?.conf ?? 0.8, 1);
    if (copy) {
      this.counts.heardScanner++;
      this.heard.push({ fact: f.id, text: f.text, from, at: r1(g.time), x: Math.round(x), z: Math.round(z) }); if (this.heard.length > 12) this.heard.shift();
      g.hud?.subtitle?.(`SCANNER · ${f.text}`, 4);
      g.emit('scannerHeard', { fact: f.id, from, text: f.text, d: Math.round(Math.hypot(P.x - x, P.z - z)) });
    }
    return copy;
  }
  say(row, o) { return CHATTER[row].say.replace(/\{(\w+)\}/g, (_, w) => o[w] ?? ''); }
  listen(dt) {
    const g = this.g, k = g.pulls?.k ?? g.knowledge;
    if (!k) return;
    if (this.on.ears && this.live('ears')) this.drain(this.active('ears'), dt);
    // A rolling convoy: the lead checks in a moment after it sets off, then every CHATTER.convoy.every s, from where it is.
    const a = g.convoy?.active;
    if (a !== this.convoyRef) { this.convoyRef = a; this.convoyT = 2; }
    if (a && (this.convoyT -= dt) <= 0) {
      this.convoyT = CHATTER.convoy.every;
      const lead = g.convoy.lead?.();
      if (lead) {
        const n = a.members.filter((m) => !m.v.dead).length, place = g.streamer?.W?.placeName?.(lead.x, lead.z) ?? `${Math.round(lead.x)}, ${Math.round(lead.z)}`;
        const f = k.record({ what: 'chatter', subject: 'convoy', text: this.say('convoy', { road: Math.abs(lead.x) > 464 ? 'I-10' : 'Route 66', dir: a.dir > 0 ? 'east' : 'west', n, place }), where: { x: lead.x, z: lead.z }, life: CHATTER.convoy.life, data: { lead: lead.id, n } });
        this.keyUp(f, lead.x, lead.z, 'the convoy\'s lead');
      }
    }
    // SITE STORIES parties that drive (systems/sitestories.js movers): the set in their car keys up from the record's spot.
    const PR = CHATTER.party;
    for (const m of g.stories?.enabled ? g.stories.movers : []) {
      if (m.state !== 'road' || !m.car || !PR.kinds.includes(m.kind)) continue;
      if ((m.kitT = (m.kitT ?? 2 + (m.seed % 30)) - dt) > 0) continue;
      m.kitT = PR.every;
      const to = g.stories.place(m.to)?.name ?? 'the next town', n = m.people.filter((q) => !q.dead).length;
      const f = k.record({ what: 'chatter', subject: `party:${m.id}`, text: this.say('party', { who: m.kind === 'raiders' ? 'raiders' : 'a trade party', to, n }), where: { x: m.x, z: m.z }, life: PR.life, data: { mover: m.id, kind: m.kind } });
      this.keyUp(f, m.x, m.z, m.kind === 'raiders' ? 'a raider\'s set' : 'a trader\'s set');
    }
    // The bulls' dispatcher: a car sent is said on the air, from the station.
    const S = g.security, n = S?.counts?.dispatched ?? 0;
    if (n > this.dispatched) {
      this.dispatched = n;
      const r = S.responses?.[S.responses.length - 1], T = S.towns?.[0], st = T ? S.stationOf(T) : null;
      if (st) {
        const P = g.player, f = k.record({ what: 'chatter', subject: 'bulls', text: this.say('bulls', { place: `${Math.round(P.x)}, ${Math.round(P.z)}`, why: r?.mode ?? 'a report' }), where: { x: P.x, z: P.z }, life: CHATTER.bulls.life });
        this.keyUp(f, st.x, st.z, 'the bulls\' dispatcher');
      }
    } else this.dispatched = n;
  }

  // ---- dog gear ------------------------------------------------------------------------------------------------------
  myDogs() { return this.g.dogs?.mine?.() ?? []; }
  dress(id, d = null) {
    const R = DOG_GEAR[id], P = this.g.player;
    d ??= this.myDogs().sort((a, b) => Math.hypot(a.x - P.x, a.z - P.z) - Math.hypot(b.x - P.x, b.z - P.z))[0];
    if (!d) return { ok: false, why: 'no dog of yours to put it on' };
    if (Math.hypot(d.x - P.x, d.z - P.z) > 8) return { ok: false, why: `${d.name} is too far off: call it to heel` };
    d.kit ??= {};
    if (d.kit[R.part]) return { ok: false, why: `${d.name} already wears a ${DOG_GEAR[d.kit[R.part]].name.toLowerCase()}` };
    if (!this.g.inventory.spend(id, 1)) return { ok: false, why: `you carry no ${R.name.toLowerCase()}` };
    d.kit[R.part] = id;
    if (R.power) this.charge[`dog:${d.id}`] = R.power.life;
    this.g.emit('dogGear', { dog: d.id, gear: id });
    return { ok: true, text: `${R.name.toUpperCase()} ON ${d.name.toUpperCase()}` };
  }
  undress(d, part) { const id = d.kit?.[part]; if (!id) return false; delete d.kit[part]; this.g.inventory.stow(id, 1); return true; }
  dogSoak(d) { const id = d?.kit?.vest; if (!id) return 1; this.counts.soaked++; return 1 - DOG_GEAR[id].soak; }
  // The collar marks what YOUR DOG sensed (dogs.sense sets d.threat from its own nose and ears): nothing else.
  collars() {
    const g = this.g;
    for (const d of this.myDogs()) {
      if (!d.kit?.collar) { d.kitLast = null; continue; }
      const t = d.threat;
      if (t && t !== d.kitLast && t.alive) {
        t.marked = Math.max(t.marked ?? 0, g.time + DOG_GEAR[d.kit.collar].mark);
        this.counts.barkMarks++;
        g.emit('barkMark', { dog: d.id, target: t.id, faction: t.faction, d: r1(Math.hypot(t.x - d.x, t.z - d.z)) });
      }
      d.kitLast = t ?? null;
    }
  }

  // ---- car gadgets ----------------------------------------------------------------------------------------------------
  cars(dt) {
    const g = this.g, night = g.sky?.night ?? 0, VD = g.vehDamage;
    for (const v of g.vehicles) {
      const U = v.utility;
      v.kitSpot = !!(U?.spotlight && v.driver && !v.dead && (v.spotOn ?? night > 0.45));
      if (v.kitSpot && v.power) v.power.e = Math.max(0, v.power.e - UTILITY.spotlight.beam.power * dt);
      if (!U?.hubspikes || v.dead || !VD) continue;
      if ((v.slashT = (v.slashT ?? 0) - dt) > 0) continue;
      const S = UTILITY.hubspikes.slash;
      if (Math.hypot(v.vx ?? 0, v.vz ?? 0) < 2) continue;
      const cs = Math.cos(v.h), sn = Math.sin(v.h);
      for (const o of g.vehicles) {
        if (o === v || o.dead || !o.dmg) continue;
        const dx = o.x - v.x, dz = o.z - v.z;
        if (Math.abs(dx) > 8 || Math.abs(dz) > 8) continue;
        const lx = dx * cs - dz * sn, lz = dx * sn + dz * cs; // o in v's frame (+x the driver's left, +z forward)
        if (Math.abs(lz) > (v.len + o.len) * 0.42 || Math.abs(lx) > (v.wid + o.wid) / 2 + S.r) continue;
        // The tyres of o on the side facing v.
        const oc = Math.cos(o.h), os = Math.sin(o.h), ox = -dx * oc + dz * os, side = ox > 0 ? 'L' : 'R';
        for (const t of ['F' + side, 'R' + side]) if (o.dmg.tyres[t] > 0) { VD.popTyre(o, t); this.counts.slashed++; g.emit('hubSlash', { by: v.id, vehicle: o.id, tyre: t }); break; }
        v.slashT = S.every;
      }
    }
    // The winch holding a door or a gate: drive away and it comes down.
    const W = this.winchLine;
    if (W) {
      const v = W.v, D = W.door, d = Math.hypot(v.x - D.x, v.z - D.z);
      if (v.dead || D.broken || !g.vehicles.includes(v)) this.winchLine = null;
      else if (d > W.len + UTILITY.winch.pull.slack) {
        g.gadgets?.breach(D, v.driver ?? null);
        D.pulled = true; this.counts.doorsPulled++; this.winchLine = null;
        g.audio?.yank?.(); g.hud?.shake?.(0.5);
        g.emit('winchPulled', { door: D.id, gate: !!D.gate, vehicle: v.id });
      }
    }
  }
  hasWinch(v) { return !!v?.utility?.winch; }
  // The harpoon's yank (vehicles.yank calls this first): a car with the winch pulls the hooked car's near door off.
  winchYank(h) {
    const g = this.g, v = h?.from, t = h?.target;
    if (!this.hasWinch(v) || h.kind !== 'veh' || !t?.dmg) return false;
    const cs = Math.cos(t.h), sn = Math.sin(t.h), dx = v.x - t.x, dz = v.z - t.z, lx = dx * cs - dz * sn;
    const side = lx > 0 ? 'left' : 'right', parts = side === 'left' ? ['doorL', 'doorL2'] : ['doorR', 'doorR2'];
    const part = parts.find((p) => !t.dmg.off[p]);
    if (!part) return false;
    g.vehDamage.detach(t, part, side, 1);
    t.dmg.zones[side] = Math.max(t.dmg.zones[side] ?? 0, 0.5);
    this.counts.doorsPulled++;
    g.audio?.yank?.(); g.hud?.toast?.('DOOR TORN OFF', 'hot');
    g.emit('winchDoor', { vehicle: t.id, part, by: v.id });
    return true;
  }
  // A harpoon that strikes a wall by a door (or the `kit winch=door` command): the winch takes the door.
  hookDoor(v, x, z, r = 2.5) {
    const I = this.g.interiors;
    if (!this.hasWinch(v) || !I) return null;
    let best = null, bd = r;
    for (const d of I.doors) { if (d.broken) continue; const k = Math.hypot(d.x - x, d.z - z); if (k < bd) { bd = k; best = d; } }
    if (!best) return null;
    this.winchLine = { v, door: best, len: Math.hypot(v.x - best.x, v.z - best.z) };
    this.g.emit('winchHooked', { door: best.id, gate: !!best.gate, vehicle: v.id });
    this.g.hud?.toast?.('WINCH ON THE DOOR · DRIVE AWAY', 'hot');
    return best;
  }

  // ---- night goggles' blinding ----------------------------------------------------------------------------------------
  // The glare in view: flares and fires near you, headlights pointed at you. Writes the halos; returns the blind target.
  glareIn() {
    const g = this.g, P = g.player, B = KIT.nvg.blind, cam = g.camera;
    let want = 0, n = 0;
    const halo = (x, y, z, s) => {
      if (n >= GLARE_PTS) return;
      _v.set(x, y, z).project(cam);
      if (_v.z > 1 || Math.abs(_v.x) > 1.2 || Math.abs(_v.y) > 1.2) return;
      this.glarePts[n++].set(_v.x * 0.5 + 0.5, _v.y * 0.5 + 0.5, s);
    };
    for (const p of g.gadgets?.list ?? []) {
      if (!(p.lit > 0)) continue;
      const d = Math.hypot(p.x - P.x, p.z - P.z);
      if (d < B.flare) { want += 1.4 * (1 - d / B.flare); halo(p.x, 0.6, p.z, 1); }
    }
    for (const f of g.throwables?.fires ?? []) {
      const d = Math.hypot(f.x - P.x, f.z - P.z);
      if (d < B.fire) { want += 0.8 * (1 - d / B.fire); halo(f.x, 0.6, f.z, 0.7); }
    }
    if ((g.sky?.night ?? 0) > 0.4) for (const v of g.vehicles) {
      if (!v.driver || v.dead || v === P.inVehicle) continue;
      const dx = P.x - v.x, dz = P.z - v.z, d = Math.hypot(dx, dz);
      if (d > B.headlights || d < 0.5) continue;
      if ((dx * Math.sin(v.h) + dz * Math.cos(v.h)) / d < B.cone) continue; // only a car pointed at you
      want += 1.2 * (1 - d / B.headlights); halo(v.x + Math.sin(v.h) * v.len * 0.5, 0.7, v.z + Math.cos(v.h) * v.len * 0.5, 0.9);
    }
    for (let i = n; i < GLARE_PTS; i++) this.glarePts[i].set(0, 0, 0);
    return Math.min(B.max, want);
  }

  // ---- the clock ------------------------------------------------------------------------------------------------------
  update(dt) {
    if (!(dt > 0)) return;
    const g = this.g, I = g.controls;
    if (I && !g.dialogue?.active) {
      if (I.hit('optics')) this.cycleOptics();
      if (I.hit('glass') && this.active('glass')) this.setLook(!this.look);
      if (I.hit('scanner') && this.active('ears')) { const r = this.toggle(this.active('ears')); g.hud?.toast?.(r.text ?? r.why, r.ok ? 'job' : 'warn'); }
    }
    // The optics drink their cell; the goggles go white in a bright light.
    const eyes = this.on.eyes ? this.live('eyes') : null;
    if (eyes) this.drain(eyes, dt);
    if (eyes === 'nvg') {
      const want = this.glareIn(), B = KIT.nvg.blind;
      if (want > this.blind) { const was = this.blind; this.blind = Math.min(want, this.blind + B.rate * dt); if (was < 0.6 && this.blind >= 0.6) { this.counts.blinded++; g.emit('nvgBlinded', { blind: r1(this.blind) }); } }
      else this.blind = Math.max(want, this.blind - dt / B.recover);
    } else this.blind = Math.max(0, this.blind - dt);
    if (this.on.beam && (g.flashMat?.opacity ?? 0) > 0.05) { const b = this.active('beam'); if (b) this.drain(b, dt); }
    this.glass(dt);
    this.breathe(dt);
    this.listen(dt);
    this.collars();
    this.cars(dt);
    for (const d of this.myDogs()) if (d.kit?.lamp && (g.sky?.night ?? 0) > 0.45) { const k = `dog:${d.id}`; this.charge[k] = Math.max(0, (this.charge[k] ?? 0) - (this.staged ? 0 : dt)); }
  }
  cycleOptics() {
    const have = ['nvg', 'thermal_scope'].filter((k) => this.carried(k));
    if (!have.length) { this.g.hud?.toast?.('No goggles or heat scope on you', 'warn'); return; }
    const cur = this.on.eyes, i = cur ? have.indexOf(cur) : -1, next = i + 1 < have.length ? have[i + 1] : null;
    this.on.eyes = next;
    if (next && !this.powered(next)) { this.on.eyes = null; this.g.hud?.toast?.(`${KIT[next].name.toUpperCase()} IS FLAT · NO CELLS`, 'warn'); return; }
    this.g.hud?.toast?.(next ? `${KIT[next].name.toUpperCase()} ON` : 'OPTICS OFF', 'job');
  }

  // ---- every frame (also while paused): the overlay, the heat, the decor ---------------------------------------------
  frame(dt) {
    const g = this.g, P = g.player, R = g.renderer, eyes = this.on.eyes && this.carried(this.on.eyes) && (this.staged || (this.charge[this.on.eyes] ?? 0) > 0) ? this.on.eyes : null;
    this.baseExposure ??= R.toneMappingExposure;
    const U = this.mul.material.uniforms;
    U.t.value = g.time;
    if (eyes === 'nvg') {
      const K = KIT.nvg, w = 0.5; // 2 * 0.5 = the frame as it was, before the tint and the gain
      U.tint.value.set(K.tint[0] * w * 1.4, K.tint[1] * w * 1.4, K.tint[2] * w * 1.4); U.grain.value = K.grain; U.vig.value = 0.75; U.scan.value = 0.08;
      R.toneMappingExposure = this.baseExposure * (1 + (K.gain - 1) * (g.sky?.night ?? 0.5));
      this.mul.visible = true; this.glare.visible = true;
      this.glare.material.uniforms.blind.value = this.blind; this.glare.material.uniforms.lift.value.setRGB(0, 0, 0); this.glare.material.uniforms.aspect.value = (R.domElement.width || 16) / (R.domElement.height || 9);
    } else if (eyes === 'thermal_scope') {
      U.tint.value.set(HEAT.world[0], HEAT.world[1], HEAT.world[2]); U.grain.value = 0.08; U.vig.value = 0.55; U.scan.value = 0.03;
      R.toneMappingExposure = this.baseExposure * (1 + (HEAT.gain - 1) * (g.sky?.night ?? 0.5)); // the ground reads as mid amber, so a cold body is a black hole in it
      this.mul.visible = true; this.glare.visible = true; // the glare pass as a floor of warmth: leaves and shade read as cool amber,
      const Gu = this.glare.material.uniforms; Gu.blind.value = 0; Gu.lift.value.setRGB(HEAT.floor[0], HEAT.floor[1], HEAT.floor[2]); // and a cold body (drawn after) is a black hole in it
      for (const q of this.glarePts) q.set(0, 0, 0);
    } else {
      if (this.mul.visible) R.toneMappingExposure = this.baseExposure;
      this.mul.visible = false; this.glare.visible = false;
    }
    this.drawHeat(eyes === 'thermal_scope');
    this.drawDecor();
    if ((this.chipT = (this.chipT ?? 0) - dt) <= 0) { this.chipT = 0.5; this.refreshChip(); }
  }
  drawHeat(on) {
    const g = this.g, P = g.player, M = this.heatMesh;
    if (!on) { if (M.visible) { M.visible = false; M.count = 0; } return; }
    const R = KIT.thermal_scope.range;
    let n = 0;
    const put = (x, y, z, s, t) => {
      if (n >= MAX_HEAT) return;
      _o.position.set(x, y, z); _o.rotation.set(0, 0, 0); _o.scale.set(s, 1, s * 1.35); _o.updateMatrix();
      M.setMatrixAt(n, _o.matrix); M.setColorAt(n++, this.rampColor(t, _c));
    };
    for (const c of g.chars) {
      if (c === P || c.inVehicle || c.underwater || (c.ug ?? null) !== (P.ug ?? null)) continue;
      if (Math.abs(c.x - P.x) > R || Math.abs(c.z - P.z) > R || !g.statics.lineOfSight(P.x, P.z, c.x, c.z)) continue; // heat goes through leaves and smoke, never a wall
      const t = this.heatOf(c); put(c.x, (c.gy ?? 0) + 1.6, c.z, t < this.airC() + 4 ? 2.6 : c.alive ? 1.5 : 1.8, t); // the cold drawn a little wider: a hole is harder to see than a glow
    }
    for (const d of g.dogs?.dogs ?? []) {
      if (Math.abs(d.x - P.x) > R || Math.abs(d.z - P.z) > R || !g.statics.lineOfSight(P.x, P.z, d.x, d.z)) continue;
      const air = this.airC();
      put(d.x, (d.y ?? 0) + 1.2, d.z, 1.0, d.dead ? air + (HEAT.living - air) * Math.exp(-(d.deadT ?? 0) / HEAT.tau) : HEAT.living + 1.5);
    }
    for (const v of g.vehicles) if (v.driver && !v.dead && Math.abs(v.x - P.x) < R && Math.abs(v.z - P.z) < R) put(v.x + Math.sin(v.h) * v.len * 0.32, 1.4, v.z + Math.cos(v.h) * v.len * 0.32, v.wid * 0.9, HEAT.engine);
    put(P.x, (P.gy ?? 0) + 1.6, P.z, 1.5, HEAT.living);
    M.count = n; M.visible = n > 0;
    M.instanceMatrix.needsUpdate = true; if (M.instanceColor) M.instanceColor.needsUpdate = true;
  }
  drawDecor() {
    const g = this.g, P = g.player, D = this.decor, G = this.glow, night = g.sky?.night ?? 0;
    let n = 0, k = 0;
    const box = (x, y, z, rot, sx, sy, sz, col) => {
      if (n >= MAX_DECOR) return;
      _o.position.set(x, y, z); _o.rotation.set(0, rot, 0); _o.scale.set(sx, sy, sz); _o.updateMatrix();
      D.setMatrixAt(n, _o.matrix); D.setColorAt(n++, _c.set(col));
    };
    const pool = (x, z, rot, sx, sz, col, y = 0.08) => {
      if (k >= MAX_GLOW) return;
      _o.position.set(x, y, z); _o.rotation.set(0, rot, 0); _o.scale.set(sx, 1, sz); _o.updateMatrix();
      G.setMatrixAt(k, _o.matrix); G.setColorAt(k++, _c.set(col));
    };
    // Your dogs' gear is drawn by the dog renderer as parts of the dog's own body (systems/dogs.js gear); here only the
    // lamp's pool of light on the ground ahead of it at night.
    for (const d of this.myDogs()) {
      if (!d.kit?.lamp || night <= 0.45 || !((this.charge[`dog:${d.id}`] ?? 0) > 0) || Math.abs(d.x - P.x) > 90 || Math.abs(d.z - P.z) > 90) continue;
      const f = d.face ?? 0, r = DOG_GEAR[d.kit.lamp].glow;
      pool(d.x + Math.sin(f) * 2.4, d.z + Math.cos(f) * 2.4, f, r, r * 1.3, '#6a5a38');
    }
    // The car kit.
    for (const v of g.vehicles) {
      const U = v.utility;
      if (Math.abs(v.x - P.x) > 110 || Math.abs(v.z - P.z) > 110 || v.sunk) continue;
      const f = v.h, fx = Math.sin(f), fz = Math.cos(f), ax = Math.cos(f), az = -Math.sin(f), L = v.len, W = v.wid;
      const at = (lx, lz) => [v.x + ax * lx + fx * lz, v.z + az * lx + fz * lz];
      if (U?.hubspikes) for (const [lx, lz] of [[W / 2 - 0.05, L / 2 - 0.92], [-(W / 2 - 0.05), L / 2 - 0.92], [W / 2 - 0.05, -(L / 2 - 0.92)], [-(W / 2 - 0.05), -(L / 2 - 0.92)]]) {
        const [x, z] = at(lx + Math.sign(lx) * 0.22, lz); box(x, 0.42, z, f, 0.42, 0.07, 0.07, '#b8b0a0'); box(x, 0.42, z, f + Math.PI / 2, 0.07, 0.07, 0.3, '#8a8478');
      }
      if (U?.spotlight) {
        const [x, z] = at(0.35, 0.2), roof = (v.tall ?? 1.8) * 0.96;
        box(x, roof + 0.14, z, f, 0.34, 0.26, 0.4, '#3a3632'); box(x + fx * 0.21, roof + 0.14, z + fz * 0.21, f, 0.28, 0.2, 0.03, v.kitSpot ? '#fff6d8' : '#6a665e');
        if (v.kitSpot) { const R = UTILITY.spotlight.beam.reach; pool(v.x + fx * (L / 2 + 9 * R), v.z + fz * (L / 2 + 9 * R), f, 8 * R, 16 * R, '#5a5236'); }
      }
      if (U?.winch) {
        const [x, z] = at(0, L / 2 + 0.1); box(x, 0.66, z, f, W * 0.5, 0.3, 0.3, '#4a3a26'); box(x, 0.66, z, f, W * 0.52, 0.12, 0.12, '#2a2622');
      }
      if ((v.nitroUntil ?? 0) > g.time && !v.dead) {
        const flick = 0.85 + 0.3 * Math.sin(g.time * 40 + v.x), [x, z] = at(0.45, -L / 2 - 1.1 * flick);
        pool(x, z, f, 0.9, 2.6 * flick, '#ff7a1c', 0.6); pool(x - fx * 0.6, z - fz * 0.6, f, 0.5, 1.4 * flick, '#fff0c0', 0.62);
        const [x2, z2] = at(-0.45, -L / 2 - 1.1 * flick); pool(x2, z2, f, 0.9, 2.6 * flick, '#ff7a1c', 0.6);
      }
    }
    // The winch's cable to the door it holds.
    const Wl = this.winchLine;
    if (Wl) {
      const v = Wl.v, D = Wl.door, mx = (v.x + D.x) / 2, mz = (v.z + D.z) / 2, d = Math.hypot(D.x - v.x, D.z - v.z);
      box(mx, 0.7, mz, Math.atan2(D.x - v.x, D.z - v.z), 0.05, 0.05, d, '#1e1c1a');
    }
    D.count = n; D.visible = n > 0; D.instanceMatrix.needsUpdate = true; if (D.instanceColor) D.instanceColor.needsUpdate = true;
    G.count = k; G.visible = k > 0; G.instanceMatrix.needsUpdate = true; if (G.instanceColor) G.instanceColor.needsUpdate = true;
  }

  drawMinimap(c, px, pz, scale, R) {
    const g = this.g;
    c.lineWidth = 1.6; c.strokeStyle = '#f5b21a';
    for (const v of g.vehicles) {
      if (!(v.kitMarked > g.time)) continue;
      const x = R + (v.x - px) * scale, y = R + (v.z - pz) * scale;
      if ((x - R) ** 2 + (y - R) ** 2 > (R - 10) ** 2) continue;
      c.beginPath(); c.moveTo(x, y - 5); c.lineTo(x + 5, y + 4); c.lineTo(x - 5, y + 4); c.closePath(); c.stroke();
    }
  }

  view() {
    const g = this.g, P = g.player;
    const kit = {};
    for (const [id, K] of Object.entries(KIT)) { const n = this.carried(id); if (n) kit[id] = { name: K.name, slot: K.slot, charge: K.power ? r1(this.charge[id] ?? 0) : null, of: K.power?.life ?? null, cell: K.power?.cell ?? null }; }
    return {
      kit, on: Object.fromEntries(SLOTS.map((s) => [s, this.active(s)])), live: Object.fromEntries(SLOTS.map((s) => [s, !!(this.active(s) && (this.staged || !KIT[this.active(s)].power || (this.charge[this.active(s)] ?? 0) > 0))])),
      cells: this.carried('battery_cell'), filters: this.carried('mask_filter'), staged: this.staged,
      blind: r1(this.blind), looking: this.look, air: this.air, masked: !!this.masked, beamOk: this.beamOk(), seenMul: +this.seenMul().toFixed(2),
      marked: { people: g.chars.filter((c) => c.alive && c.marked > g.time).map((c) => c.id), vehicles: g.vehicles.filter((v) => v.kitMarked > g.time).map((v) => v.id) },
      heard: this.heard.slice(-6), lastKeyUp: this.lastKeyUp ?? null, winch: this.winchLine ? { vehicle: this.winchLine.v.id, door: this.winchLine.door.id } : null,
      dogs: this.myDogs().map((d) => ({ id: d.id, name: d.name, gear: d.kit ?? {} })), counts: { ...this.counts }, heatHere: r1(this.heatOf(P)), airC: r1(this.airC()),
    };
  }
}
