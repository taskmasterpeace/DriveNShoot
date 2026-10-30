import * as THREE from 'three';
import { HALF, locationName } from '../world/city.js';
import { layerMesh } from '../engine/depthlayers.js';
import { snapshot, restore } from '../agent/api.js';
import { paintPaper, paintPin } from './hudart.js';
import { NPCS } from '../data/npcs.js';
import { ROLE_TIERS, ROLE_RULES } from '../data/roles.js';
import { DRIVING, VEHICLES } from '../systems/vehicles.js';

// Quality-of-life layer: objective tracker + GPS route, full map with click-to-waypoint,
// pause menu with persistent settings, quick save/load, hit markers, interaction ring.

const SETTINGS_KEY = 'dsoa.settings';
const SAVE_KEY = 'dsoa.quicksave';
const AUTO_KEY = 'dsoa.autosave';
// The engine's old code name keyed storage as 'deathlands.*': carry players' settings and saves over once.
for (const k of ['settings', 'quicksave', 'autosave']) {
  try { const old = localStorage.getItem(`deathlands.${k}`); if (old !== null && localStorage.getItem(`dsoa.${k}`) === null) localStorage.setItem(`dsoa.${k}`, old); } catch { /* storage blocked */ }
}
const TIMES_KEY = 'dsoa.saveTimes'; // when the quick save and the autosave were last written (the pause menu's "3 min ago")
// steer: 'screen' = A turns toward the left of the SCREEN whichever way the car points (Robert: "left is left"); 'car' = A
// turns the car to its own left, GTA2's tank steering (systems/vehicles.js DRIVING.screenSteer).
// The 2026-10-27 polish pass added: autosaveMin (0 = off), pauseOnBlur, muteOnBlur, hudScale, nameTags (aim|near|off),
// killFeed, dmgNumbers.
const DEFAULTS = { volume: 0.55, musicVol: 0.8, sfxVol: 1, shadows: true, renderScale: 1, showFps: false, autoReload: true, aimAssist: true, difficulty: 'normal', steer: 'screen', nightLight: 0.12,
  autosaveMin: 3, pauseOnBlur: true, muteOnBlur: false, hudScale: 1, nameTags: 'aim', killFeed: true, dmgNumbers: true, bodies: 'lsw',
  grade: 1, hitStop: 1, camKick: 1, crashDirt: 1 }; // LOOK-FEEL (systems/lookfeel.js): each 0 off, 0.5 half, 1 full
const LOG_MAX = 14;     // messages kept for the pause menu's RECENT list
const FOOT_MPS = 4.2;   // the ORDERS tag's on-foot ETA: a walk with some running
const AGENT_TAB = (() => { try { return new URLSearchParams(location.search).has('agent'); } catch { return false; } })();
const ago = (ms) => { const s = (Date.now() - ms) / 1000; return s < 60 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86400)} d ago`; };
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
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
    this.log = [];  // the last LOG_MAX toasts, with the game clock they arrived at
    this.run = { t: 0, foot: 0, drive: 0, earned: 0, spent: 0, px: null, pz: null, cash: null, kills0: game.stats?.kills ?? 0, deaths0: game.stats?.deaths ?? 0 };
    this.hudHidden = false;
    // Every toast also lands in the RECENT log (one wrap of the HUD's toast; the HUD is built before this layer).
    const toast = game.hud?.toast?.bind(game.hud);
    if (toast) game.hud.toast = (text, kind = 'info') => { this.log.unshift({ text: String(text), kind, at: game.sky?.clock ?? '' }); if (this.log.length > LOG_MAX) this.log.length = LOG_MAX; toast(text, kind); };

    // The objective is a pinned paper ORDERS tag at the top of the HUD's left column (or loose in the root).
    (game.hud?.el?.objSlot ?? root).insertAdjacentHTML('beforeend', `
      <div class="objective hidden"><canvas class="obj-paper"></canvas><canvas class="obj-pin"></canvas><div class="obj-label">ORDERS</div><div class="obj-text"></div><div class="obj-dist"></div></div>`);
    root.insertAdjacentHTML('beforeend', `
      <div class="bigmap hidden"><div class="bigmap-card"><div class="bigmap-head"><b>ARIZONA · THE SUN COURT</b><span>Click to set a waypoint · right-click clears · M closes</span></div><canvas width="760" height="760"></canvas></div></div>
      <div class="pausemenu hidden"><div class="pm-card">
        <div class="pm-title">PAUSED</div>
        <div class="pm-tabs" role="tablist"><button data-tab="game" class="on">GAME</button><button data-tab="you">YOU</button><button data-tab="log">LOG</button><button data-tab="settings">SETTINGS</button><button data-tab="controls">CONTROLS</button></div>
        <div class="pm-pane" data-pane="game">
        <div class="pm-buttons">
          <button data-a="resume">Resume</button>
          <button data-a="save">Quick save <kbd>F5</kbd></button>
          <button data-a="load">Quick load <kbd>F9</kbd><small class="pm-ago" data-k="quick"></small></button>
          <button data-a="autoload">Load autosave<small class="pm-ago" data-k="auto"></small></button>
          <button data-a="photo">Photo mode <kbd>K</kbd></button>
          <button data-a="map">Map <kbd>M</kbd></button>
          <button data-a="hud">Hide HUD <kbd>F1</kbd></button>
          <button data-a="hudedit">Edit HUD layout <kbd>F6</kbd></button>
        </div>
        <div class="pm-section">THIS RUN</div>
        <div class="pm-run"></div>
        </div>
        <div class="pm-pane hidden" data-pane="you"><div class="pm-section">WHAT THEY CALL YOU</div><div class="pm-roles"></div></div>
        <div class="pm-pane hidden" data-pane="log"><div class="pm-section">RECENT</div><div class="pm-log"></div></div>
        <div class="pm-pane hidden" data-pane="settings">
        <div class="pm-section">SETTINGS <button class="pm-reset" data-a="reset">Reset to defaults</button></div>
        <div class="pm-settings">
        <label>Difficulty <select data-s="difficulty"><option value="story">Story (35% damage taken)</option><option value="normal">Normal (70%)</option><option value="hard">Hard (100%)</option></select></label>
        <label>Volume <input type="range" min="0" max="1" step="0.05" data-s="volume"></label>
        <label>Music <input type="range" min="0" max="1" step="0.05" data-s="musicVol"></label>
        <label>Effects <input type="range" min="0" max="1" step="0.05" data-s="sfxVol"></label>
        <label>Render scale <select data-s="renderScale"><option value="0.6">0.6× (fast)</option><option value="0.8">0.8×</option><option value="1">1× </option><option value="1.5">1.5× (sharp)</option></select></label>
        <label><input type="checkbox" data-s="shadows"> Sun shadows</label>
        <label>People <select data-s="bodies"><option value="lsw">LSW bodies (the nearest 24)</option><option value="classic">Classic rig</option></select></label>
        <label>Night <select data-s="nightLight"><option value="0">Pitch dark (only your light)</option><option value="0.12">Dark and scary</option><option value="0.5">Readable</option><option value="1">Bright</option></select></label>
        <label>Colour grade <select data-s="grade"><option value="0">Off</option><option value="0.5">Soft</option><option value="1">Full (by region and hour)</option></select></label>
        <label>Hit-stop <select data-s="hitStop"><option value="0">Off</option><option value="0.5">Half</option><option value="1">Full</option></select></label>
        <label>Camera kick <select data-s="camKick"><option value="0">Off</option><option value="0.5">Half</option><option value="1">Full (by calibre)</option></select></label>
        <label>Crash dirt <select data-s="crashDirt"><option value="0">Off</option><option value="0.5">Half</option><option value="1">Full</option></select></label>
        <label>Steering <select data-s="steer"><option value="screen">Left is screen-left (whichever way the car points)</option><option value="car">Left is the car's left (classic top-down)</option></select></label>
        <label><input type="checkbox" data-s="autoReload"> Auto-reload when empty</label>
        <label><input type="checkbox" data-s="aimAssist"> Aim assist (snaps to targets near the cursor)</label>
        <label><input type="checkbox" data-s="showFps"> Performance overlay</label>
        <label>HUD size <select data-s="hudScale"><option value="0.8">Small</option><option value="0.9">Compact</option><option value="1">Normal</option><option value="1.12">Large</option><option value="1.25">Huge</option></select></label>
        <label>Name tags <select data-s="nameTags"><option value="aim">Near your aim</option><option value="near">Everyone close by</option><option value="off">Off</option></select></label>
        <label><input type="checkbox" data-s="dmgNumbers"> Damage numbers on hits</label>
        <label><input type="checkbox" data-s="killFeed"> Kill feed</label>
        <label>Autosave <select data-s="autosaveMin"><option value="0">Off</option><option value="2">Every 2 min</option><option value="3">Every 3 min</option><option value="5">Every 5 min</option><option value="10">Every 10 min</option></select></label>
        <label><input type="checkbox" data-s="pauseOnBlur"> Pause when the window loses focus</label>
        <label><input type="checkbox" data-s="muteOnBlur"> Mute when the window loses focus</label>
        </div></div>
        <div class="pm-pane hidden" data-pane="controls"><div class="pm-section">CONTROLS</div>
        <div class="pm-keys">F1 hide HUD · click the ORDERS tag for the map (right-click clears the waypoint) · WASD move · Mouse aim · LMB shoot · Shift sprint/boost · Ctrl crouch · Space dive/handbrake · R reload · 1-3 weapons · Q hold+release throw · X next throwable · E talk/horn/kick a door/smash glass/climb through (hold E: board up a broken window) · F drive/exit · C ride/swap seat · G hang on/board train · H harpoon · I/Tab pack · V patch up/drink/eat · N sleep (a bed, a bedroll, a parked car) · B drop oil/caltrops · M map · Z zoom out (Shift+Z or = in, - out) · L flashlight · K photo mode · T fast time · Y weather · F5/F9 save/load · Esc pause</div>
      </div></div></div>`);
    const q = (s) => root.querySelector(s);
    this.el = { obj: q('.objective'), objText: q('.obj-text'), objDist: q('.obj-dist'), map: q('.bigmap'), mapCanvas: q('.bigmap canvas'), menu: q('.pausemenu'), roles: q('.pm-roles'), run: q('.pm-run'), log: q('.pm-log'), mapHead: q('.bigmap-head span') };
    this.ui = root;
    for (const [sel, art] of [['.obj-paper', paintPaper(316, 252)], ['.obj-pin', paintPin()]]) {
      const c = q(sel); c.width = art.width; c.height = art.height; c.getContext('2d').drawImage(art, 0, 0);
    }

    this.tabs = ['game', 'you', 'log', 'settings', 'controls'];
    this.tabRender = {};
    this.el.menu.addEventListener('click', (e) => {
      const tb = e.target.closest('.pm-tabs button')?.dataset.tab;
      if (tb) { this.showTab(tb); return; }
      const a = e.target.closest('button')?.dataset.a;
      if (a === 'resume') this.toggleMenu(false);
      if (a === 'save') this.quickSave();
      if (a === 'load') { this.quickLoad(); this.toggleMenu(false); }
      if (a === 'map') { this.toggleMenu(false); this.toggleMap(true); }
      if (a === 'autoload') { this.quickLoad(AUTO_KEY); this.toggleMenu(false); }
      if (a === 'photo') { this.toggleMenu(false); this.togglePhoto(true); }
      if (a === 'hud') { this.toggleMenu(false); this.toggleHud(true); }
      if (a === 'hudedit') { this.toggleMenu(false); game.hud.editor?.show(); } // the HUD layout editor (ui/hudedit.js)
      if (a === 'reset') { this.settings = { ...DEFAULTS }; this.saveSettings(); this.syncInputs(); this.apply(); game.hud.toast('Settings reset to defaults'); }
    });
    this.syncInputs();
    for (const inp of this.el.menu.querySelectorAll('[data-s]')) {
      const k = inp.dataset.s;
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
    this.el.mapHead.textContent = 'Click: waypoint · right-click: clear · M closes  —  ◆ waypoint  ✕ raider camp  ★ base  ● people  ▪ empty car';
    // The ORDERS tag is a button: click opens the map, right-click clears a waypoint you set.
    this.el.obj.addEventListener('mousedown', (e) => { if (e.button === 2) { if (this.waypoint) this.setWaypoint(null); } else this.toggleMap(true); });
    this.el.obj.addEventListener('contextmenu', (e) => e.preventDefault());
    // Focus: pause (and/or mute) when the window loses it. Never on an agent's tab; never over the title.
    addEventListener('blur', () => {
      if (AGENT_TAB || !this.titleGone) return;
      if (this.settings.muteOnBlur && game.audio.master) game.audio.master.gain.value = 0;
      if (this.settings.pauseOnBlur && !this.menuOpen && !this.photo && !game.dialogue?.active) this.toggleMenu(true);
    });
    addEventListener('focus', () => { if (game.audio.master) game.audio.master.gain.value = this.settings.volume; });
    // F1 is the browser's help key: the HUD toggle takes it.
    addEventListener('keydown', (e) => { if (e.code === 'F1') e.preventDefault(); });

    // Interaction ring under whatever E/F would act on.
    const ring = new THREE.RingGeometry(0.75, 0.95, 40); ring.rotateX(-Math.PI / 2);
    this.ring = new THREE.Mesh(ring, new THREE.MeshBasicMaterial({ color: '#f5b21a', transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false }));
    layerMesh(this.ring, 'ring'); // engine/depthlayers.js
    this.ring.visible = false;
    game.scene.add(this.ring);
    this.apply();
  }

  damageTaken() { return DIFFICULTY[this.settings.difficulty] ?? 0.7; }

  // The pause menu is tabs, never one long scroll (Robert, 2026-10-27: "just use tabs"). Other systems add their own:
  // qol.addTab('insurance', 'INSURANCE', (el) => { el.innerHTML = ... }) — the render runs each time the tab is shown.
  addTab(id, label, render) {
    if (this.tabs.includes(id)) { this.tabRender[id] = render; return; }
    this.tabs.push(id); this.tabRender[id] = render;
    const b = document.createElement('button'); b.dataset.tab = id; b.textContent = label;
    this.el.menu.querySelector('.pm-tabs').appendChild(b);
    const pane = document.createElement('div'); pane.className = 'pm-pane hidden'; pane.dataset.pane = id;
    this.el.menu.querySelector('.pm-card').appendChild(pane);
  }
  showTab(id) {
    if (!this.tabs.includes(id)) return;
    this.tab = id;
    for (const b of this.el.menu.querySelectorAll('.pm-tabs button')) b.classList.toggle('on', b.dataset.tab === id);
    for (const p of this.el.menu.querySelectorAll('.pm-pane')) p.classList.toggle('hidden', p.dataset.pane !== id);
    const pane = this.el.menu.querySelector(`.pm-pane[data-pane="${id}"]`);
    try { this.tabRender[id]?.(pane, this.g); } catch (e) { pane.textContent = `This tab failed to draw: ${e.message}`; }
  }

  syncInputs() {
    for (const inp of this.el.menu.querySelectorAll('[data-s]')) {
      const k = inp.dataset.s;
      if (inp.type === 'checkbox') inp.checked = !!this.settings[k]; else inp.value = String(this.settings[k]);
    }
  }

  toggleHud(on = !this.hudHidden) {
    this.hudHidden = on;
    this.ui.classList.toggle('hud-hidden', on);
    if (on) this.g.hud.toast('HUD hidden - F1 brings it back');
  }

  // Save times live beside the saves, so "3 min ago" survives a reload.
  saveTimes() { try { return JSON.parse(localStorage.getItem(TIMES_KEY) ?? '{}'); } catch { return {}; } }
  stampSave(k) { try { localStorage.setItem(TIMES_KEY, JSON.stringify({ ...this.saveTimes(), [k]: Date.now() })); } catch { /* storage blocked */ } }

  // The pause menu's THIS RUN block: what this sitting has added up to.
  runView() {
    const g = this.g, R = this.run;
    return { minutes: Math.round(R.t / 6) / 10, footKm: +(R.foot / 1000).toFixed(2), driveKm: +(R.drive / 1000).toFixed(2), earned: Math.round(R.earned), spent: Math.round(R.spent),
      kills: (g.stats?.kills ?? 0) - R.kills0, deaths: (g.stats?.deaths ?? 0) - R.deaths0 };
  }
  renderRun() {
    const v = this.runView();
    this.el.run.innerHTML = [['Played', `${v.minutes} min`], ['On foot', `${v.footKm} km`], ['Driven', `${v.driveKm} km`], ['Earned', `$${v.earned}`], ['Spent', `$${v.spent}`], ['Kills', v.kills], ['Deaths', v.deaths]]
      .map(([k, x]) => `<span><em>${k}</em><b>${x}</b></span>`).join('');
  }
  renderLog() {
    this.el.log.innerHTML = this.log.length ? this.log.map((m) => `<div class="pm-log-row k-${esc(m.kind)}"><em>${esc(m.at)}</em>${esc(m.text)}</div>`).join('') : '<div class="pm-role-none">Nothing yet.</div>';
  }
  renderAgo() {
    const T = this.saveTimes();
    for (const el of this.el.menu.querySelectorAll('.pm-ago')) { const t = T[el.dataset.k]; el.textContent = t ? ` · ${ago(t)}` : ' · none yet'; }
  }
  // Rough time to the target: road speed in a car (70% of the rig's top speed), a walk-run on foot.
  eta(len) {
    const v = this.g.player.inVehicle, mps = v ? Math.max(8, (VEHICLES[v.type]?.maxSpeed ?? 30) * 0.7) : FOOT_MPS;
    return len / mps;
  }
  view() {
    return { settings: { ...this.settings }, run: this.runView(), log: this.log.slice(0, 5), hudHidden: this.hudHidden, saveTimes: this.saveTimes(), menuOpen: this.menuOpen };
  }

  apply() {
    const g = this.g, s = this.settings;
    g.sky.sun.castShadow = !!s.shadows;
    g.charR.lsw?.setMode(s.bodies); // LSW-BODIES (systems/lswbodies.js)
    g.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5) * s.renderScale);
    g.renderer.setSize(innerWidth, innerHeight);
    g.audio.setVolumes?.({ master: s.volume, music: s.musicVol ?? 0.8, sfx: s.sfxVol ?? 1 }); // the volume row (systems/audio.js buses)
    if (g.audio.master) g.audio.master.gain.value = s.volume;
    g.audio.volume = s.volume;
    g.showStats = !!s.showFps;
    DRIVING.screenSteer = s.steer !== 'car';
    g.sky.nightLight = Math.max(0, Math.min(1, Number(s.nightLight ?? 0.12)));
    if (g.look) { const L = g.look.settings, n = (v) => Math.max(0, Math.min(1, Number(v ?? 1))); L.grade = n(s.grade); L.hitStop = n(s.hitStop); L.kick = n(s.camKick); L.dirt = n(s.crashDirt); }
    g.hud.el.stats.classList.toggle('hidden', !g.showStats);
    g.hud.rescale?.(); // the HUD size setting multiplies the screen-fit scale (ui/hud.js)
    this.ui?.classList.toggle('no-killfeed', !s.killFeed);
  }

  // ---- objectives -------------------------------------------------------------------
  objective() {
    const g = this.g, q = g.quests;
    if (this.customObjective) return this.customObjective;
    // In Florida (systems/regions.js): Meridian's own chain - Sheriff Duarte's canal job (data/meridian-talk.js), not Rust
    // Haven's. The sheriff is a person only while the town is promoted; otherwise the clinic door stands in for the town.
    const P = g.player, R = g.streamer?.W?.regionOf?.(P.x, P.z, 3000);
    if (R && g.regions) {
      const duarte = g.chars.find((c) => c.npc?.id === 'mer_sheriff' && c.alive), door = g.regions.clinic('meridian')?.door ?? null, at = duarte ?? door;
      const gators = (g.stats.gators ?? 0) - (q.canalStart ?? 0);
      if (!q.canal) return { text: `Talk to Sheriff Duarte: the office on Meridian's Main Street`, target: at };
      if (q.canal === 'active') return gators < 2 ? { text: `Clear the canal: gators in the reeds by the pumps, west of I-95 (${gators}/2)`, target: null } : { text: 'Back to Sheriff Duarte for your $120', target: at };
      return { text: 'Meridian knows your name. The SALT LINE runs north from the knot; the clone bay presses you a spare.', target: null };
    }
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

  setWaypoint(p, arrived = false) {
    this.waypoint = p;
    this.routeKey = '';
    this.g.hud.toast(p ? `Waypoint set (${Math.round(p.x)}, ${Math.round(p.z)})` : arrived ? 'ARRIVED' : 'Waypoint cleared', arrived ? 'job' : 'info');
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
    this.drawWaypoint(c, T, px, pz);
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
    this.drawWaypoint(c, T, px, pz);
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
    this.drawWaypoint(c, T, px, pz);
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
    if (on) { this.toggleMap(false); this.renderRoles(); this.renderRun(); this.renderLog(); this.renderAgo(); this.showTab(this.tab ?? 'game'); }
    this.el.menu.classList.toggle('hidden', !on);
    this.g.paused = on || this.mapOpen;
    this.g.hud?.layout?.refresh(); // the HUD's 'menu' situation (data/hudlayout.js)
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
    this.g.hud?.layout?.refresh();
  }

  quickSave() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(snapshot(this.g))); this.stampSave('quick'); this.g.hud.toast('GAME SAVED', 'job'); this.g.emit('saved'); }
    catch (e) { this.g.hud.toast(`Save failed: ${e.message}`, 'warn'); }
  }
  autoSave() {
    try { localStorage.setItem(AUTO_KEY, JSON.stringify(snapshot(this.g))); this.stampSave('auto'); this.g.hud.toast('AUTOSAVED', 'info'); this.g.emit('autosaved'); }
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
    this.ring.position.set(target.x, (this.g.fx?.ground?.(target.x, target.z) ?? 0) + 0.18, target.z); // on the land under it
    this.ring.scale.setScalar(s * (1 + Math.sin(performance.now() * 0.006) * 0.06));
  }

  // Keys that work even while paused. Returns nothing; flips g.paused.
  input(I) {
    const E = this.g.hud?.editor; // the HUD layout editor owns the keys while it is open (its own Esc / F6 close it)
    if (E?.open) return;
    if (E && this.g.controls?.hit('hudEdit') && !document.querySelector('.title') && !this.photo) { E.show(); return; }
    if (I.hit('Escape') && !this.g.dialogue.active && !this.photo && !this.g.invUI?.open) { if (this.mapOpen) this.toggleMap(false); else this.toggleMenu(); }
    if (I.hit('KeyP')) this.toggleMenu();
    if (this.menuOpen && (I.hit('KeyQ') || I.hit('KeyE'))) { const i = this.tabs.indexOf(this.tab ?? 'game'), n = this.tabs.length; this.showTab(this.tabs[(i + (I.hit('KeyE') ? 1 : n - 1)) % n]); }
    if (I.hit('KeyM')) this.toggleMap();
    if (I.hit('F5')) this.quickSave();
    if (I.hit('F9')) this.quickLoad();
    if (I.hit('F1') && !this.photo) this.toggleHud();
    if (I.hit('KeyK') && !document.querySelector('.title') && !this.menuOpen && !this.mapOpen) this.togglePhoto();
  }

  // THIS RUN: distance on foot and driven (teleports > 40 m in a frame don't count), money in and out, time played.
  // The cash plate shows each change as a small +$/−$ that rises off it.
  trackRun(dt) {
    const g = this.g, R = this.run, p = g.player, x = p.inVehicle?.x ?? p.x, z = p.inVehicle?.z ?? p.z;
    R.t += dt;
    if (R.px !== null) { const d = Math.hypot(x - R.px, z - R.pz); if (d < 40) { if (p.inVehicle) R.drive += d; else R.foot += d; } }
    R.px = x; R.pz = z;
    if (R.cash !== null && g.cash !== R.cash) {
      const dc = g.cash - R.cash;
      if (dc > 0) R.earned += dc; else R.spent -= dc;
      this.cashDelta(dc);
    }
    R.cash = g.cash;
  }
  cashDelta(dc) {
    const plate = this.g.hud?.el?.cash?.parentElement;
    if (!plate || AGENT_TAB && this.g.paused) return;
    const el = document.createElement('div');
    el.className = `cash-delta ${dc > 0 ? 'up' : 'down'}`;
    el.textContent = `${dc > 0 ? '+' : '−'}$${Math.abs(dc).toLocaleString('en-US')}`;
    plate.appendChild(el);
    while (plate.querySelectorAll('.cash-delta').length > 3) plate.querySelector('.cash-delta').remove();
    setTimeout(() => el.remove(), 1500);
  }

  // The waypoint on the big map: the ring, and how far it is in a straight line.
  drawWaypoint(c, T, px, pz) {
    if (!this.waypoint) return;
    const [x, y] = T(this.waypoint.x, this.waypoint.z), d = Math.hypot(this.waypoint.x - px, this.waypoint.z - pz);
    c.strokeStyle = '#f5b21a'; c.lineWidth = 3; c.beginPath(); c.arc(x, y, 9, 0, 7); c.stroke();
    c.font = '700 13px Barlow Condensed'; c.textAlign = 'left'; c.lineWidth = 3; c.strokeStyle = '#1b1410'; c.fillStyle = '#f5b21a';
    const t = d > 1000 ? `${(d / 1000).toFixed(1)} KM` : `${Math.round(d)} M`;
    c.strokeText(t, x + 12, y + 4); c.fillText(t, x + 12, y + 4);
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
    this.g.hud?.layout?.situate(); // a panel opening pauses the world: the HUD still steps out of its way (data/hudlayout.js 'panel')
    // Autosave on a timer, never mid-fight, in a car crash or while dead.
    const g = this.g;
    if (!g.paused && !document.querySelector('.title')) {
      this.autoT = (this.autoT ?? 0) + dt;
      const calm = g.player.alive && !g.chars.some((c) => c.alive && c.target === g.player) && !g.dialogue.active;
      const every = Number(this.settings.autosaveMin) * 60; // 0 = autosave off
      if (every > 0 && this.autoT > every && calm) { this.autoT = 0; this.autoSave(); }
      this.trackRun(dt);
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
        const eta = len !== null && len > 40 ? ` · ~${mmss(this.eta(len))}` : '';
        this.el.objDist.textContent = len !== null ? `${len > 1000 ? (len / 1000).toFixed(1) + ' km' : Math.round(len) + ' m'} - ${p.inVehicle ? 'road route' : 'on foot'}${eta}` : (obj.target || this.waypoint ? 'no route' : '');
      }
      if (this.waypoint && len !== null && len < 6) this.setWaypoint(null, true);
    }
    if (this.mapOpen) this.drawBigMap();
  }
}
