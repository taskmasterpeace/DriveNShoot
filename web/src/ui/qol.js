import * as THREE from 'three';
import { HALF, locationName } from '../world/city.js';
import { snapshot, restore } from '../agent/api.js';
import { paintPaper, paintPin } from './hudart.js';
import { NPCS } from '../data/npcs.js';
import { ROLE_TIERS, ROLE_RULES } from '../data/roles.js';
import { DRIVING } from '../systems/vehicles.js';

// Quality-of-life layer: objective tracker + GPS route, full map with click-to-waypoint,
// pause menu with persistent settings, quick save/load, hit markers, interaction ring.

const SETTINGS_KEY = 'dsoa.settings';
const SAVE_KEY = 'dsoa.quicksave';
const AUTO_KEY = 'dsoa.autosave';
// The engine's old code name keyed storage as 'deathlands.*': carry players' settings and saves over once.
for (const k of ['settings', 'quicksave', 'autosave']) {
  try { const old = localStorage.getItem(`deathlands.${k}`); if (old !== null && localStorage.getItem(`dsoa.${k}`) === null) localStorage.setItem(`dsoa.${k}`, old); } catch { /* storage blocked */ }
}
const AUTOSAVE_EVERY = 180; // seconds of play
// steer: 'screen' = A turns toward the left of the SCREEN whichever way the car points (Robert: "left is left"); 'car' = A
// turns the car to its own left, GTA2's tank steering (systems/vehicles.js DRIVING.screenSteer).
const DEFAULTS = { volume: 0.55, shadows: true, renderScale: 1, showFps: false, autoReload: true, aimAssist: true, difficulty: 'normal', steer: 'screen' };
const DIFFICULTY = { story: 0.35, normal: 0.7, hard: 1 };

const load = (k, d) => { try { return { ...d, ...JSON.parse(localStorage.getItem(k) ?? '{}') }; } catch { return { ...d }; } };

export class QOL {
  saveSettings() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings)); } catch { /* storage blocked */ } }

  constructor(game, root) {
    this.g = game;
    this.settings = load(SETTINGS_KEY, DEFAULTS);
    this.waypoint = null;
    this.route = null;
    this.routeT = 0;
    this.routeKey = '';
    this.menuOpen = false;
    this.mapOpen = false;

    // The objective is a pinned paper ORDERS tag at the top of the HUD's left column (or loose in the root).
    (game.hud?.el?.objSlot ?? root).insertAdjacentHTML('beforeend', `
      <div class="objective hidden"><canvas class="obj-paper"></canvas><canvas class="obj-pin"></canvas><div class="obj-label">ORDERS</div><div class="obj-text"></div><div class="obj-dist"></div></div>`);
    root.insertAdjacentHTML('beforeend', `
      <div class="bigmap hidden"><div class="bigmap-card"><div class="bigmap-head"><b>ARIZONA · THE SUN COURT</b><span>Click to set a waypoint · right-click clears · M closes</span></div><canvas width="760" height="760"></canvas></div></div>
      <div class="pausemenu hidden"><div class="pm-card">
        <div class="pm-title">PAUSED</div>
        <div class="pm-buttons">
          <button data-a="resume">Resume</button>
          <button data-a="save">Quick save <kbd>F5</kbd></button>
          <button data-a="load">Quick load <kbd>F9</kbd></button>
          <button data-a="autoload">Load autosave</button>
          <button data-a="photo">Photo mode <kbd>K</kbd></button>
          <button data-a="map">Map <kbd>M</kbd></button>
        </div>
        <div class="pm-section">WHAT THEY CALL YOU</div>
        <div class="pm-roles"></div>
        <div class="pm-section">SETTINGS</div>
        <label>Difficulty <select data-s="difficulty"><option value="story">Story (35% damage taken)</option><option value="normal">Normal (70%)</option><option value="hard">Hard (100%)</option></select></label>
        <label>Volume <input type="range" min="0" max="1" step="0.05" data-s="volume"></label>
        <label>Render scale <select data-s="renderScale"><option value="0.6">0.6× (fast)</option><option value="0.8">0.8×</option><option value="1">1× </option><option value="1.5">1.5× (sharp)</option></select></label>
        <label><input type="checkbox" data-s="shadows"> Sun shadows</label>
        <label>Steering <select data-s="steer"><option value="screen">Left is screen-left (whichever way the car points)</option><option value="car">Left is the car's left (classic top-down)</option></select></label>
        <label><input type="checkbox" data-s="autoReload"> Auto-reload when empty</label>
        <label><input type="checkbox" data-s="aimAssist"> Aim assist (snaps to targets near the cursor)</label>
        <label><input type="checkbox" data-s="showFps"> Performance overlay</label>
        <div class="pm-section">CONTROLS</div>
        <div class="pm-keys">WASD move · Mouse aim · LMB shoot · Shift sprint/boost · Ctrl crouch · Space dive/handbrake · R reload · 1-3 weapons · Q hold+release throw · X next throwable · E talk/horn/kick a door/smash glass/climb through (hold E: board up a broken window) · F drive/exit · C ride/swap seat · G hang on/board train · H harpoon · I/Tab pack · V patch up/drink/eat · N sleep (a bed, a bedroll, a parked car) · B drop oil/caltrops · M map · Z zoom out (Shift+Z or = in, - out) · L flashlight · K photo mode · T fast time · Y weather · F5/F9 save/load · Esc pause</div>
      </div></div>`);
    const q = (s) => root.querySelector(s);
    this.el = { obj: q('.objective'), objText: q('.obj-text'), objDist: q('.obj-dist'), map: q('.bigmap'), mapCanvas: q('.bigmap canvas'), menu: q('.pausemenu'), roles: q('.pm-roles') };
    for (const [sel, art] of [['.obj-paper', paintPaper(316, 252)], ['.obj-pin', paintPin()]]) {
      const c = q(sel); c.width = art.width; c.height = art.height; c.getContext('2d').drawImage(art, 0, 0);
    }

    this.el.menu.addEventListener('click', (e) => {
      const a = e.target.closest('button')?.dataset.a;
      if (a === 'resume') this.toggleMenu(false);
      if (a === 'save') this.quickSave();
      if (a === 'load') { this.quickLoad(); this.toggleMenu(false); }
      if (a === 'map') { this.toggleMenu(false); this.toggleMap(true); }
      if (a === 'autoload') { this.quickLoad(AUTO_KEY); this.toggleMenu(false); }
      if (a === 'photo') { this.toggleMenu(false); this.togglePhoto(true); }
    });
    for (const inp of this.el.menu.querySelectorAll('[data-s]')) {
      const k = inp.dataset.s;
      if (inp.type === 'checkbox') inp.checked = !!this.settings[k]; else inp.value = this.settings[k];
      inp.addEventListener('input', () => {
        this.settings[k] = inp.type === 'checkbox' ? inp.checked : inp.tagName === 'SELECT' && Number.isNaN(Number(inp.value)) ? inp.value : Number(inp.value);
        this.saveSettings();
        this.apply();
      });
    }
    this.el.mapCanvas.addEventListener('mousedown', (e) => {
      const r = this.el.mapCanvas.getBoundingClientRect(), u = (e.clientX - r.left) / r.width, v = (e.clientY - r.top) / r.height;
      // In Phoenix the map is the island; out on the corridor it is a regional map around you (drawRegion).
      const R = this.region;
      const x = R ? R.x0 + u * R.span : u * HALF * 2 - HALF, z = R ? R.z0 + v * R.span : v * HALF * 2 - HALF;
      if (e.button === 2) this.setWaypoint(null);
      else this.setWaypoint({ x, z });
      this.drawBigMap();
    });
    this.el.mapCanvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // Interaction ring under whatever E/F would act on.
    const ring = new THREE.RingGeometry(0.75, 0.95, 40); ring.rotateX(-Math.PI / 2);
    this.ring = new THREE.Mesh(ring, new THREE.MeshBasicMaterial({ color: '#f5b21a', transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false }));
    this.ring.renderOrder = 5;
    this.ring.visible = false;
    game.scene.add(this.ring);
    this.apply();
  }

  damageTaken() { return DIFFICULTY[this.settings.difficulty] ?? 0.7; }

  apply() {
    const g = this.g, s = this.settings;
    g.sky.sun.castShadow = !!s.shadows;
    g.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5) * s.renderScale);
    g.renderer.setSize(innerWidth, innerHeight);
    if (g.audio.master) g.audio.master.gain.value = s.volume;
    g.audio.volume = s.volume;
    g.showStats = !!s.showFps;
    DRIVING.screenSteer = s.steer !== 'car';
    g.hud.el.stats.classList.toggle('hidden', !g.showStats);
  }

  // ---- objectives -------------------------------------------------------------------
  objective() {
    const g = this.g, q = g.quests;
    if (this.customObjective) return this.customObjective;
    const sheriff = g.chars.find((c) => c.npc?.id === 'okonkwo');
    const nearestCamp = () => g.world.spawns.camps.reduce((b, c) => (Math.hypot(c.x - g.player.x, c.z - g.player.z) < Math.hypot(b.x - g.player.x, b.z - g.player.z) ? c : b));
    if (!q.bounty) return { text: 'Talk to Sheriff Okonkwo at Rust Haven\'s north gate', target: sheriff };
    if (q.bounty === 'active') {
      const k = g.stats.raiderKills - q.bountyStart;
      if (k < 6) return { text: `Kill Dustwolves on the Glass Flats (${k}/6)`, target: nearestCamp() };
      return { text: 'Return to Sheriff Okonkwo for your $250', target: sheriff };
    }
    if (q.cache === 'active') return { text: 'Find the bunker cache under the gas station, far east on Route 66', target: { x: 420, z: 8 } };
    return { text: 'The wasteland is yours. Mags has rumors; Ike has guns.', target: null };
  }

  setWaypoint(p) {
    this.waypoint = p;
    this.routeKey = '';
    this.g.hud.toast(p ? `Waypoint set (${Math.round(p.x)}, ${Math.round(p.z)})` : 'Waypoint cleared');
    this.g.emit('waypoint', p ?? { cleared: true });
  }

  // GPS: A* over the nav grid sized for whatever the player is in.
  updateRoute(dt) {
    const g = this.g, p = g.player;
    const obj = this.objective();
    const tgt = this.waypoint ?? obj.target;
    this.routeT -= dt;
    if (!tgt) { this.route = null; return obj; }
    const sx = p.inVehicle ? p.inVehicle.x : p.x, sz = p.inVehicle ? p.inVehicle.z : p.z;
    const key = `${Math.round(tgt.x)},${Math.round(tgt.z)},${!!p.inVehicle}`;
    if (this.routeT <= 0 || key !== this.routeKey) {
      this.routeT = 1.2;
      this.routeKey = key;
      const grid = p.inVehicle ? g.nav.car : g.nav.foot;
      const path = grid.find(sx, sz, tgt.x, tgt.z, 60000);
      this.route = path ? [{ x: sx, z: sz }, ...path] : null;
    } else if (this.route) this.route[0] = { x: sx, z: sz };
    return obj;
  }

  routeLength() {
    if (!this.route) return null;
    let d = 0;
    for (let i = 1; i < this.route.length; i++) d += Math.hypot(this.route[i].x - this.route[i - 1].x, this.route[i].z - this.route[i - 1].z);
    return d;
  }

  drawRoute(c, toScreen, width = 3) {
    const r = this.route;
    if (!r || r.length < 2) return;
    c.save();
    c.strokeStyle = '#f5b21a'; c.lineWidth = width; c.lineJoin = 'round'; c.lineCap = 'round';
    c.setLineDash([width * 2.4, width * 1.6]);
    c.beginPath();
    r.forEach((pt, i) => { const [x, y] = toScreen(pt.x, pt.z); if (i) c.lineTo(x, y); else c.moveTo(x, y); });
    c.stroke();
    const [ex, ey] = toScreen(r[r.length - 1].x, r[r.length - 1].z);
    c.setLineDash([]); c.fillStyle = '#f5b21a'; c.beginPath(); c.arc(ex, ey, width * 1.8, 0, 7); c.fill();
    c.restore();
  }

  // Out past the island the big map is regional: 24 km around you, the interstate, its exits and their communities,
  // the towns the road reaches, the dust wall, the waypoint (docs/design/WEB_STREAMING.md §3.9; the atlas is P4).
  drawRegion(px, pz) {
    const g = this.g, W = g.streamer.W, c = this.el.mapCanvas.getContext('2d'), S = 760, span = 24000;
    // Snapped to 400 m so the ground layer is painted once per 400 m moved, not every frame the map is open.
    const x0 = Math.round((px - span / 2) / 400) * 400, z0 = Math.round((pz - span / 2) / 400) * 400, k = S / span, T = (x, z) => [(x - x0) * k, (z - z0) * k];
    this.region = { x0, z0, span };
    const key = `${x0},${z0}`;
    if (this.regionBg?.key !== key) {
      const bg = this.regionBg?.canvas ?? document.createElement('canvas');
      bg.width = bg.height = S;
      const b2 = bg.getContext('2d');
      // Biome and relief, coarse: one cell per 400 m.
      for (let j = 0; j < 60; j++) for (let i = 0; i < 60; i++) {
        const x = x0 + (i + 0.5) * 400, z = z0 + (j + 0.5) * 400, b = W.biomeAt(x, z), rel = W.reliefAt(x, z);
        const base = b === 'f' ? [62, 58, 40] : b === 'u' ? [64, 58, 52] : b === 'm' ? [78, 52, 36] : b === '.' ? [40, 56, 62] : b === 'w' ? [52, 50, 46] : [70, 52, 34];
        const l = 1 + rel * 0.35;
        b2.fillStyle = `rgb(${base[0] * l | 0},${base[1] * l | 0},${base[2] * l | 0})`; b2.fillRect(i * 400 * k, j * 400 * k, 400 * k + 1, 400 * k + 1);
      }
      this.regionBg = { key, canvas: bg };
    }
    c.drawImage(this.regionBg.canvas, 0, 0);
    // The dust wall.
    const [ox, oz] = T(0, 0);
    c.strokeStyle = 'rgba(200,150,90,0.8)'; c.lineWidth = 3; c.setLineDash([8, 6]); c.beginPath(); c.arc(ox, oz, 45000 * k, 0, 7); c.stroke(); c.setLineDash([]);
    // Phoenix.
    // The metro round it (world/ring.js): its lobed edge, then the island.
    const RG = W.ring;
    if (RG) { c.fillStyle = 'rgba(78,64,50,0.9)'; c.beginPath(); for (let a = 0; a <= 64; a++) { const th = (a / 64) * Math.PI * 2, r = RG.edgeAt(Math.cos(th), Math.sin(th)); const [x, y] = T(Math.cos(th) * r, Math.sin(th) * r); if (a) c.lineTo(x, y); else c.moveTo(x, y); } c.fill(); }
    c.fillStyle = '#5e4a36'; c.fillRect(...T(-464, -464), 928 * k, 928 * k);
    // The interstate and the exits' roads.
    c.lineCap = 'round'; c.lineJoin = 'round';
    for (const rb of W.ribbons) {
      if (rb.x1 < x0 || rb.x0 > x0 + span || rb.z1 < z0 || rb.z0 > z0 + span) continue;
      c.strokeStyle = rb.kind === 'hwy' ? '#d8b066' : '#a88a5a'; c.lineWidth = rb.kind === 'hwy' ? 3 : 1.6;
      c.beginPath();
      const step = Math.max(1, Math.floor(rb.n / 600));
      for (let i = 0; i < rb.n; i += step) { const [x, y] = T(rb.x[i], rb.z[i]); if (i) c.lineTo(x, y); else c.moveTo(x, y); }
      c.stroke();
    }
    c.font = '700 12px Barlow Condensed'; c.textAlign = 'left'; c.lineWidth = 3; c.strokeStyle = '#1b1410';
    for (const X of W.exits) {
      const [x, y] = T(X.x, X.z);
      c.fillStyle = X.dead ? '#8a8270' : '#7fbf6a'; c.beginPath(); c.arc(x, y, 5, 0, 7); c.fill();
      const label = `EXIT ${X.number} · ${X.name}`; c.strokeText(label, x + 8, y - 6); c.fillStyle = '#f2e6d0'; c.fillText(label, x + 8, y - 6);
      if (X.community) { const [cx, cy] = T(X.dest.x, X.dest.z); c.fillStyle = '#c9a46a'; c.fillRect(cx - 4, cy - 4, 8, 8); }
    }
    for (const t of W.towns) {
      if (!t.built && t.id !== 'phoenix') continue;
      const [x, y] = T(t.x, t.z);
      c.fillStyle = '#f5c542'; c.beginPath(); c.arc(x, y, 6, 0, 7); c.fill();
      c.font = '700 14px Barlow Condensed'; c.strokeText(t.name, x + 9, y + 5); c.fillStyle = '#f5c542'; c.fillText(t.name, x + 9, y + 5);
    }
    this.drawLayers(c, T); // your husk and car, the poles and knots (systems/clone.js, systems/travel.js)
    if (this.waypoint) { const [x, y] = T(this.waypoint.x, this.waypoint.z); c.strokeStyle = '#f5b21a'; c.lineWidth = 3; c.beginPath(); c.arc(x, y, 9, 0, 7); c.stroke(); }
    const p = g.player, [ax, ay] = T(px, pz);
    c.save(); c.translate(ax, ay); c.rotate(-(p.inVehicle ? p.inVehicle.h : p.face) + Math.PI);
    c.fillStyle = '#f5b21a'; c.strokeStyle = '#1b1410'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(0, -11); c.lineTo(8, 9); c.lineTo(0, 4); c.lineTo(-8, 9); c.closePath(); c.fill(); c.stroke(); c.restore();
    c.font = '700 13px Barlow Condensed'; c.fillStyle = '#f2e6d0'; c.textAlign = 'right';
    c.fillText(`${W.regionAt(px, pz)} · 24 KM ACROSS`, S - 10, S - 12);
  }

  // In the Phoenix ring the big map is the metro (world/ring.js): Rust Haven's island map in the middle and every street,
  // block and building of the dead city round it, 3.8 km across. The city layer is painted once (the first time the map
  // opens out here: ~0.1 s while the game is paused under it); the live marks go on top every time.
  drawMetro(px, pz) {
    const g = this.g, W = g.streamer.W, RG = W.ring, c = this.el.mapCanvas.getContext('2d'), S = 760, span = 3800, x0 = -span / 2, z0 = -span / 2, k = S / span;
    const T = (x, z) => [(x - x0) * k, (z - z0) * k];
    this.region = { x0, z0, span };
    if (!this.metroBg) {
      const bg = document.createElement('canvas'); bg.width = bg.height = S * 2;
      const b2 = bg.getContext('2d'), K2 = k * 2, T2 = (x, z) => [(x - x0) * K2, (z - z0) * K2];
      b2.fillStyle = '#3a2c1f'; b2.fillRect(0, 0, S * 2, S * 2);
      // The city's footprint, then each block tinted by its zone.
      const ZT = { residential: '#4a3a2a', industrial: '#3d3b38', strip: '#4e4232', ruins: '#352c24' };
      const n = RG.kMax;
      for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) {
        const b = RG.block(i, j);
        if (!b.city) continue;
        b2.fillStyle = ZT[b.zone] ?? '#4a3a2a'; const [a, c2] = T2(b.x0 - 3, b.z0 - 3); b2.fillRect(a, c2, (b.x1 - b.x0 + 6) * K2, (b.z1 - b.z0 + 6) * K2);
      }
      b2.fillStyle = '#16171a';
      for (const s of RG.streets(-RG.reach, -RG.reach, RG.reach, RG.reach)) { const [a, c2] = T2(s.x0, s.z0); b2.fillRect(a, c2, Math.max(1, (s.x1 - s.x0) * K2), Math.max(1, (s.z1 - s.z0) * K2)); }
      // The interstate.
      b2.strokeStyle = '#2a2622'; b2.lineWidth = 26 * K2; b2.lineCap = 'round'; b2.beginPath();
      const cl = W.cl; let on = false;
      for (let i = 0; i < cl.n; i += 2) { const x = cl.x[i], z = cl.z[i]; if (Math.abs(x) > 2100 || Math.abs(z) > 2100) { on = false; continue; } const [a, c2] = T2(x, z); if (on) b2.lineTo(a, c2); else { b2.moveTo(a, c2); on = true; } }
      b2.stroke();
      // The Iron Line on through the yards.
      b2.fillStyle = '#6a5a40';
      for (let z = -RG.reach; z < RG.reach; z += 8) if (Math.abs(z) > 472 && RG.inCity(-360, z, 40)) { const [a, c2] = T2(-361.5, z); b2.fillRect(a, c2, 3 * K2, 8 * K2 + 0.5); }
      // Every building (a ruin paler, open to the sky).
      const m = Math.ceil(RG.reach / 256) + 1;
      for (let cx = -m; cx <= m; cx++) for (let cz = -m; cz <= m; cz++) for (const L of RG.owned(cx, cz)) {
        b2.fillStyle = L.ruined ? '#6c6358' : L.zone === 'industrial' ? '#77706a' : L.zone === 'strip' ? '#9a7a52' : '#8e6a48';
        const [a, c2] = T2(L.x0, L.z0); b2.fillRect(a, c2, (L.x1 - L.x0) * K2, (L.z1 - L.z0) * K2);
      }
      // Rust Haven's island in the middle, from its own map.
      const isl = g.world.minimap, H = 450; { const [a, c2] = T2(-H, -H); b2.drawImage(isl, a, c2, H * 2 * K2, H * 2 * K2); }
      // Names of the parts of the city.
      b2.font = '700 26px Barlow Condensed'; b2.textAlign = 'center'; b2.lineWidth = 6; b2.strokeStyle = '#1b1410'; b2.fillStyle = '#e8d6b0';
      const label = (t, x, z) => { const [a, c2] = T2(x, z); b2.strokeText(t, a, c2); b2.fillText(t, a, c2); };
      // One name per zone per quarter of the city, at the middle of its blocks there.
      const acc = new Map();
      for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) {
        const b = RG.block(i, j);
        if (!b.city) continue;
        const key = `${b.zone}${b.cx > 0 ? 'E' : 'W'}${b.cz > 0 ? 'S' : 'N'}`, a = acc.get(key) ?? { n: 0, x: 0, z: 0, name: b.Z.name };
        a.n++; a.x += b.cx; a.z += b.cz; acc.set(key, a);
      }
      for (const a of acc.values()) if (a.n >= 14) label(a.name, a.x / a.n, a.z / a.n);
      this.metroBg = bg;
    }
    c.drawImage(this.metroBg, 0, 0, S, S);
    for (const camp of g.world.spawns.camps) { const [x, y] = T(camp.x, camp.z); c.fillStyle = '#ff4a3a'; c.font = 'bold 14px Barlow Condensed'; c.textAlign = 'center'; c.fillText('✕', x, y + 5); }
    this.drawRoute(c, T, 2);
    this.drawLayers(c, T); // your husk and car, the poles and knots (systems/clone.js, systems/travel.js)
    if (this.waypoint) { const [x, y] = T(this.waypoint.x, this.waypoint.z); c.strokeStyle = '#f5b21a'; c.lineWidth = 3; c.beginPath(); c.arc(x, y, 9, 0, 7); c.stroke(); }
    const p = g.player, [ax, ay] = T(px, pz);
    c.save(); c.translate(ax, ay); c.rotate(-(p.inVehicle ? p.inVehicle.h : p.face) + Math.PI);
    c.fillStyle = '#f5b21a'; c.strokeStyle = '#1b1410'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(0, -11); c.lineTo(8, 9); c.lineTo(0, 4); c.lineTo(-8, 9); c.closePath(); c.fill(); c.stroke(); c.restore();
    c.font = '700 13px Barlow Condensed'; c.fillStyle = '#f2e6d0'; c.textAlign = 'right';
    const here = locationName(px, pz);
    c.fillText(`${(/^phoenix/i.test(here) ? here : `Phoenix · ${here}`).toUpperCase()} · 3.8 KM ACROSS`, S - 10, S - 12); // the ring's names already start "Phoenix": never twice
  }
  // Systems that mark the big map draw themselves with its world->canvas transform (the travel network, your husk).
  drawLayers(c, T) { for (const L of [this.g.travel, this.g.clone]) L?.drawMap?.(c, T); }
  drawBigMap() {
    const g = this.g, pp = g.player, px = pp.inVehicle ? pp.inVehicle.x : pp.x, pz = pp.inVehicle ? pp.inVehicle.z : pp.z;
    this.region = null;
    if (g.streamer && (Math.abs(px) > 464 || Math.abs(pz) > 464)) {
      // In the Phoenix ring (and a little past its edge) the metro map; farther out, the regional one.
      if (g.streamer.W.ring?.inCity(px, pz, 300)) this.drawMetro(px, pz); else this.drawRegion(px, pz);
      return;
    }
    const c = this.el.mapCanvas.getContext('2d'), S = 760, k = S / (HALF * 2);
    const T = (x, z) => [(x + HALF) * k, (z + HALF) * k];
    c.drawImage(g.world.minimap, 0, 0, S, S);
    for (const camp of g.world.spawns.camps) { const [x, y] = T(camp.x, camp.z); c.fillStyle = '#ff4a3a'; c.font = 'bold 16px Barlow Condensed'; c.textAlign = 'center'; c.fillText('✕', x, y + 5); }
    // Jump sites (data/stunts.js): a little ramp glyph and the name.
    for (const s of Object.values(g.stunts?.sites ?? {})) {
      const [x, y] = T(s.x, s.z);
      c.fillStyle = '#d9a441'; c.strokeStyle = '#1b1410'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(x - 7, y + 4); c.lineTo(x + 6, y + 4); c.lineTo(x + 6, y - 4); c.closePath(); c.fill(); c.stroke();
      c.font = '700 11px Barlow Condensed'; c.textAlign = 'left'; c.lineWidth = 3; c.strokeText(s.name, x + 10, y + 4); c.fillText(s.name, x + 10, y + 4);
    }
    // Military bases (data/bases.js): a five-point star in the Remnant's olive, the name, red while the post is on alert.
    for (const s of g.bases?.sites ?? []) {
      const [x, y] = T((s.fence.x0 + s.fence.x1) / 2, (s.fence.z0 + s.fence.z1) / 2);
      c.fillStyle = s.alert === 'hostile' ? '#d8452e' : '#a8b070'; c.strokeStyle = '#1b1410'; c.lineWidth = 2;
      c.beginPath();
      for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? 3.2 : 8; c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
      c.closePath(); c.fill(); c.stroke();
      c.font = '700 11px Barlow Condensed'; c.textAlign = 'left'; c.lineWidth = 3; c.strokeText(s.name, x + 11, y + 4); c.fillText(s.name, x + 11, y + 4);
    }
    for (const ch of g.chars) if (ch.npc && ch.alive) {
      const [x, y] = T(ch.x, ch.z);
      c.fillStyle = '#f5c542'; c.beginPath(); c.arc(x, y, 4, 0, 7); c.fill();
      c.fillStyle = '#f2e6d0'; c.font = '600 11px Barlow Condensed'; c.textAlign = 'left'; c.fillText(ch.npc.name.split(' ').slice(-1)[0], x + 6, y + 4);
    }
    for (const v of g.vehicles) if (!v.dead && !v.driver) { const [x, y] = T(v.x, v.z); c.fillStyle = '#e8e2d4'; c.fillRect(x - 2, y - 2, 4, 4); }
    this.drawRoute(c, T, 3);
    this.drawLayers(c, T); // your husk and car, the poles and knots (systems/clone.js, systems/travel.js)
    if (this.waypoint) { const [x, y] = T(this.waypoint.x, this.waypoint.z); c.strokeStyle = '#f5b21a'; c.lineWidth = 3; c.beginPath(); c.arc(x, y, 9, 0, 7); c.stroke(); }
    const p = g.player;
    const [x, y] = T(px, pz);
    c.save(); c.translate(x, y); c.rotate(-(p.inVehicle ? p.inVehicle.h : p.face) + Math.PI);
    c.fillStyle = '#f5b21a'; c.strokeStyle = '#1b1410'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(0, -11); c.lineTo(8, 9); c.lineTo(0, 4); c.lineTo(-8, 9); c.closePath(); c.fill(); c.stroke(); c.restore();
  }

  // ---- menus --------------------------------------------------------------------------
  toggleMenu(on = !this.menuOpen) {
    if (document.querySelector('.title')) return;
    this.menuOpen = on;
    if (on) { this.toggleMap(false); this.renderRoles(); }
    this.el.menu.classList.toggle('hidden', !on);
    this.g.paused = on || this.mapOpen;
  }

  // What the world calls you (systems/roles.js), drawn when the menu opens: each role you are known for (or on your
  // way to), how far along, why, and what it has opened. Roles you have no renown in stay off the list.
  renderRoles() {
    const R = this.g.roles, el = this.el.roles;
    if (!R || !el) return;
    const v = R.view(null, NPCS);
    const rows = v.roles.filter((r) => r.renown >= 3 || r.tier !== 'none').sort((a, b) => ROLE_TIERS.indexOf(b.tier) - ROLE_TIERS.indexOf(a.tier) || b.renown - a.renown);
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
    el.innerHTML = rows.length ? rows.map((r) => {
      const state = r.suspended ? `SUSPENDED · ${r.suspended}` : r.tier === 'none' ? 'TALK OF IT' : r.tier.toUpperCase();
      const why = r.why.filter((w) => w.renown > 0.05).slice(0, 2).map((w) => w.what).join(', ');
      const F = this.g.society?.factions, o = r.opens, seen = new Set(), k = ROLE_RULES.scale[ROLE_TIERS.indexOf(r.active)] || ROLE_RULES.scale[2];
      const fname = (fid) => (fid === '*' ? 'every trader' : (F?.row(fid)?.short ?? F?.row(fid)?.name ?? fid).replace(/^The /, ''));
      const opens = [
        ...Object.entries(o.factions).filter(([, f]) => f.holdFire || f.shootOnSight).map(([fid, f]) => `${fname(fid)} ${f.holdFire ? 'hold fire' : 'shoot on sight'}`),
        ...o.offices.map((f) => f.name),
        ...o.dialogue.filter((d) => d.choice && !seen.has(d.npc) && seen.add(d.npc)).map((d) => `${d.short}: "${d.choice}"`),
        ...Object.entries(o.prices).map(([fid, m]) => { const pct = Math.round((m - 1) * k * 100); return `${fname(fid)} ${pct < 0 ? '' : '+'}${pct}% prices`; }),
      ].slice(0, 3).join(' · ');
      return `<div class="pm-role${r.tier === 'none' ? ' faint' : ''}${r.suspended ? ' susp' : ''}" style="--rc:${r.color}">
        <div class="pm-role-head"><b>${esc(r.name)}</b><span>${esc(state)}</span></div>
        <div class="pm-role-bar"><i style="width:${r.renown.toFixed(1)}%"></i>${r.tiers.map((t) => `<u style="left:${t}%"></u>`).join('')}</div>
        <div class="pm-role-why">${esc(why ? `For: ${why}.` : r.blurb)}${opens ? ` <em>Opens: ${esc(opens)}</em>` : ''}</div>
      </div>`;
    }).join('') : '<div class="pm-role-none">Nobody calls you anything yet. Do something worth talking about.</div>';
  }
  toggleMap(on = !this.mapOpen) {
    if (document.querySelector('.title')) return;
    this.mapOpen = on;
    this.el.map.classList.toggle('hidden', !on);
    if (on) { this.routeT = 0; this.updateRoute(0); this.drawBigMap(); }
    this.g.paused = on || this.menuOpen;
  }

  quickSave() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(snapshot(this.g))); this.g.hud.toast('GAME SAVED', 'job'); this.g.emit('saved'); }
    catch (e) { this.g.hud.toast(`Save failed: ${e.message}`, 'warn'); }
  }
  autoSave() {
    try { localStorage.setItem(AUTO_KEY, JSON.stringify(snapshot(this.g))); this.g.hud.toast('AUTOSAVED', 'info'); this.g.emit('autosaved'); }
    catch { /* storage full or blocked: skip silently, quick save still works */ }
  }
  quickLoad(key = SAVE_KEY) {
    const raw = localStorage.getItem(key);
    if (!raw) { this.g.hud.toast(key === AUTO_KEY ? 'No autosave yet' : 'No quick save yet (F5 saves)', 'warn'); return; }
    try { restore(this.g, JSON.parse(raw)); this.g.hud.toast('GAME LOADED', 'job'); this.g.emit('loaded'); }
    catch (e) { this.g.hud.toast(`Load failed: ${e.message}`, 'warn'); }
  }

  hit(kill) {
    const r = this.g.hud.el.reticle;
    r.classList.remove('hit', 'kill');
    void r.offsetWidth;
    r.classList.add(kill ? 'kill' : 'hit');
  }

  highlight(target) {
    if (!target) { this.ring.visible = false; return; }
    this.ring.visible = true;
    const s = target.len ? target.len * 0.45 : 1;
    this.ring.position.set(target.x, 0.18, target.z);
    this.ring.scale.setScalar(s * (1 + Math.sin(performance.now() * 0.006) * 0.06));
  }

  // Keys that work even while paused. Returns nothing; flips g.paused.
  input(I) {
    if (I.hit('Escape') && !this.g.dialogue.active && !this.photo && !this.g.invUI?.open) { if (this.mapOpen) this.toggleMap(false); else this.toggleMenu(); }
    if (I.hit('KeyP')) this.toggleMenu();
    if (I.hit('KeyM')) this.toggleMap();
    if (I.hit('F5')) this.quickSave();
    if (I.hit('F9')) this.quickLoad();
    if (I.hit('KeyK') && !document.querySelector('.title') && !this.menuOpen && !this.mapOpen) this.togglePhoto();
  }

  // Photo mode: freeze the world, hide every HUD layer, fly a free camera.
  // WASD pan · wheel zoom · Q/E tilt · Shift faster · K or Esc to leave.
  togglePhoto(on = !this.photo) {
    const g = this.g;
    if (on) this.photo = { x: g.camLook.x, z: g.camLook.z, h: g.camHeight, tilt: 0.14 };
    else this.photo = null;
    document.getElementById('ui').classList.toggle('photo', !!on);
    g.paused = !!on || this.menuOpen || this.mapOpen;
    g.emit('photoMode', { on: !!on });
  }
  updatePhoto(dt, I) {
    const ph = this.photo, g = this.g;
    if (I.hit('Escape')) { this.togglePhoto(false); return; }
    const sp = (I.key('ShiftLeft') ? 60 : 22) * (ph.h / 33) * dt;
    if (I.key('KeyW')) ph.z -= sp; if (I.key('KeyS')) ph.z += sp;
    if (I.key('KeyA')) ph.x -= sp; if (I.key('KeyD')) ph.x += sp;
    if (I.wheel) ph.h = Math.max(6, Math.min(160, ph.h * (I.wheel > 0 ? 1.12 : 0.89)));
    if (I.key('KeyQ')) ph.tilt = Math.max(0, ph.tilt - dt * 0.6);
    if (I.key('KeyE')) ph.tilt = Math.min(1.6, ph.tilt + dt * 0.6);
    this.placePhotoCamera();
  }
  // Also called by the agent's screenshot, so a photo-mode shot keeps its framing.
  placePhotoCamera() {
    const ph = this.photo, cam = this.g.camera;
    cam.position.set(ph.x, ph.h, ph.z + ph.h * ph.tilt);
    cam.lookAt(ph.x, 0, ph.z);
  }

  update(dt) {
    if (this.photo) { this.updatePhoto(dt, this.g.input); return; }
    // Autosave on a timer, never mid-fight, in a car crash or while dead.
    const g = this.g;
    if (!g.paused && !document.querySelector('.title')) {
      this.autoT = (this.autoT ?? 0) + dt;
      const calm = g.player.alive && !g.chars.some((c) => c.alive && c.target === g.player) && !g.dialogue.active;
      if (this.autoT > AUTOSAVE_EVERY && calm) { this.autoT = 0; this.autoSave(); }
    }
    const obj = this.updateRoute(dt);
    const p = this.g.player;
    if (!this.titleGone) this.titleGone = !document.querySelector('.title'); // the title never comes back
    const has = !!obj.text && this.titleGone;
    if (has !== this.objShown) { this.objShown = has; this.el.obj.classList.toggle('hidden', !has); }
    if (has) {
      const txt = this.waypoint ? 'Waypoint' : obj.text;
      if (txt !== this.objTxt) {
        this.objTxt = txt;
        this.el.objText.textContent = txt;
        // a typed order shrinks to fit the tag
        const n = txt.length;
        this.el.objText.style.fontSize = `${n <= 10 ? 40 : n <= 18 ? 31 : n <= 32 ? 25 : n <= 52 ? 21 : 18}px`;
        this.el.obj.animate?.([{ transform: 'rotate(-1.4deg) scale(1.06)', filter: 'brightness(1.35)' }, { transform: 'rotate(-1.4deg) scale(1)', filter: 'brightness(1)' }], { duration: 320, easing: 'ease-out' });
      }
      // distance: only rebuilt when the rounded figure or the mode changes
      const len = this.routeLength();
      const fig = len === null ? (obj.target || this.waypoint ? -1 : -2) : len > 1000 ? Math.round(len / 100) * 100 : Math.round(len), mode = p.inVehicle ? 1 : 0;
      if (fig !== this.objFig || mode !== this.objMode) {
        this.objFig = fig; this.objMode = mode;
        this.el.objDist.textContent = len !== null ? `${len > 1000 ? (len / 1000).toFixed(1) + ' km' : Math.round(len) + ' m'} - ${p.inVehicle ? 'road route' : 'on foot'}` : (obj.target || this.waypoint ? 'no route' : '');
      }
      if (this.waypoint && len !== null && len < 6) this.setWaypoint(null);
    }
    if (this.mapOpen) this.drawBigMap();
  }
}
