import * as THREE from 'three';
import { HALF } from '../world/city.js';
import { snapshot, restore } from '../agent/api.js';
import { paintPaper, paintPin } from './hudart.js';

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
const DEFAULTS = { volume: 0.55, shadows: true, renderScale: 1, showFps: false, autoReload: true, aimAssist: true, difficulty: 'normal' };
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
        <div class="pm-section">SETTINGS</div>
        <label>Difficulty <select data-s="difficulty"><option value="story">Story (35% damage taken)</option><option value="normal">Normal (70%)</option><option value="hard">Hard (100%)</option></select></label>
        <label>Volume <input type="range" min="0" max="1" step="0.05" data-s="volume"></label>
        <label>Render scale <select data-s="renderScale"><option value="0.6">0.6× (fast)</option><option value="0.8">0.8×</option><option value="1">1× </option><option value="1.5">1.5× (sharp)</option></select></label>
        <label><input type="checkbox" data-s="shadows"> Sun shadows</label>
        <label><input type="checkbox" data-s="autoReload"> Auto-reload when empty</label>
        <label><input type="checkbox" data-s="aimAssist"> Aim assist (snaps to targets near the cursor)</label>
        <label><input type="checkbox" data-s="showFps"> Performance overlay</label>
        <div class="pm-section">CONTROLS</div>
        <div class="pm-keys">WASD move · Mouse aim · LMB shoot · Shift sprint/boost · Ctrl crouch · Space dive/handbrake · R reload · 1-3 weapons · Q hold+release throw · X next throwable · E talk/horn · F drive/exit · C ride/swap seat · G hang on/board train · H harpoon · M map · Z zoom · L flashlight · K photo mode · T fast time · Y weather · F5/F9 save/load · Esc pause</div>
      </div></div>`);
    const q = (s) => root.querySelector(s);
    this.el = { obj: q('.objective'), objText: q('.obj-text'), objDist: q('.obj-dist'), map: q('.bigmap'), mapCanvas: q('.bigmap canvas'), menu: q('.pausemenu') };
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
      const r = this.el.mapCanvas.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * HALF * 2 - HALF, z = ((e.clientY - r.top) / r.height) * HALF * 2 - HALF;
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

  drawBigMap() {
    const g = this.g, c = this.el.mapCanvas.getContext('2d'), S = 760, k = S / (HALF * 2);
    const T = (x, z) => [(x + HALF) * k, (z + HALF) * k];
    c.drawImage(g.world.minimap, 0, 0, S, S);
    for (const camp of g.world.spawns.camps) { const [x, y] = T(camp.x, camp.z); c.fillStyle = '#ff4a3a'; c.font = 'bold 16px Barlow Condensed'; c.textAlign = 'center'; c.fillText('✕', x, y + 5); }
    for (const ch of g.chars) if (ch.npc && ch.alive) {
      const [x, y] = T(ch.x, ch.z);
      c.fillStyle = '#f5c542'; c.beginPath(); c.arc(x, y, 4, 0, 7); c.fill();
      c.fillStyle = '#f2e6d0'; c.font = '600 11px Barlow Condensed'; c.textAlign = 'left'; c.fillText(ch.npc.name.split(' ').slice(-1)[0], x + 6, y + 4);
    }
    for (const v of g.vehicles) if (!v.dead && !v.driver) { const [x, y] = T(v.x, v.z); c.fillStyle = '#e8e2d4'; c.fillRect(x - 2, y - 2, 4, 4); }
    this.drawRoute(c, T, 3);
    if (this.waypoint) { const [x, y] = T(this.waypoint.x, this.waypoint.z); c.strokeStyle = '#f5b21a'; c.lineWidth = 3; c.beginPath(); c.arc(x, y, 9, 0, 7); c.stroke(); }
    const p = g.player, px = p.inVehicle ? p.inVehicle.x : p.x, pz = p.inVehicle ? p.inVehicle.z : p.z;
    const [x, y] = T(px, pz);
    c.save(); c.translate(x, y); c.rotate(-(p.inVehicle ? p.inVehicle.h : p.face) + Math.PI);
    c.fillStyle = '#f5b21a'; c.strokeStyle = '#1b1410'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(0, -11); c.lineTo(8, 9); c.lineTo(0, 4); c.lineTo(-8, 9); c.closePath(); c.fill(); c.stroke(); c.restore();
  }

  // ---- menus --------------------------------------------------------------------------
  toggleMenu(on = !this.menuOpen) {
    if (document.querySelector('.title')) return;
    this.menuOpen = on;
    if (on) this.toggleMap(false);
    this.el.menu.classList.toggle('hidden', !on);
    this.g.paused = on || this.mapOpen;
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
    if (I.hit('Escape') && !this.g.dialogue.active && !this.photo) { if (this.mapOpen) this.toggleMap(false); else this.toggleMenu(); }
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
        this.el.objText.style.fontSize = `${n <= 10 ? 36 : n <= 18 ? 30 : n <= 32 ? 25 : n <= 52 ? 21 : 18}px`;
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
