import * as THREE from 'three';
import './creator.css';
import {
  CREATOR, ATTRS, ATTR_COST, RANKS, BACKGROUNDS, TRAITS, FLAWS, STATES, STATE_KEYS, BUILDS, HANDS, SKIN, HAIR, HAIR_STYLES, HAT_COLORS,
  FACES, SCARS, SCAR_STORIES, SHIRTS, PANTS, BOOTS, PER_RANK, tally, validate, effects, lookColors, buildOf, backgroundById, traitById, isFlaw, priceOfTrait,
} from '../data/creator.js';
import { FLAGS, FLAG_KEYS, drawFlag } from './portrait.js';
import { paintClothFlag } from './hudart.js';
import { RULERS } from '../data/atlas.js';
import { ITEMS } from '../data/items.js';
import { GEAR } from '../data/gear.js';
import { NPCS } from '../data/npcs.js';
import { Character, CharacterRenderer } from '../systems/characters.js';
import { WEAPONS } from '../systems/combat.js';

// THE CREATOR, the screen (docs/design/WEB_CREATOR.md). Six steps over the system's draft (systems/creator.js), a live
// card with the REAL in-engine body turning in front of the flag, and a BEGIN that makes the player.
//   Pad first: d-pad / left stick moves and changes, A picks, B goes back, LB / RB change steps, Y randomizes, X rolls a
//   name (or a new look on LOOK), START begins. Keyboard: arrows or WASD, Enter / Space, Esc / Backspace, Q / E, R.
//   Mouse: everything is a button.
// The pad is read here (navigator.getGamepads, or a virtual pad an agent or the controller's `pad` command sets, the
// same { axes, buttons } shape), so the creator works with or without the controller layer.
const STEPS = [
  { id: 'origin', label: 'NAME & ORIGIN', note: 'who you are and where you are from' },
  { id: 'background', label: 'BACKGROUND', note: 'what you did before, or since' },
  { id: 'attributes', label: 'ATTRIBUTES', note: 'each rank costs more than the last' },
  { id: 'traits', label: 'TRAITS', note: 'good ones cost; flaws pay back' },
  { id: 'look', label: 'LOOK', note: 'the body you walk out in' },
  { id: 'kit', label: 'KIT', note: 'what you carry, and who knows you' },
];
const BTN = { a: 0, b: 1, x: 2, y: 3, lb: 4, rb: 5, lt: 6, rt: 7, back: 8, start: 9, l3: 10, r3: 11, up: 12, down: 13, left: 14, right: 15 };
const NB = 17;
const REPEAT = { first: 0.34, next: 0.11 }, STICK = 0.55;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SVG = {
  l: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
  r: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>',
  ok: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
};
const pad = (k, round = false) => `<span class="cr-pad${round ? ' round' : ''}">${k}</span>`;
const cyc = (arr, i, d) => ((i + d) % arr.length + arr.length) % arr.length;
const kg = (id, n) => (ITEMS[id]?.kg ?? 0) * n;

// ---- the live body: the in-engine CharacterRenderer on its own small canvas ---------------------------------------------
class Preview {
  constructor(canvas) {
    this.canvas = canvas;
    this.r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
    this.r.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.r.toneMapping = THREE.ACESFilmicToneMapping; this.r.toneMappingExposure = 1.15;
    this.scene = new THREE.Scene();
    this.cam = new THREE.PerspectiveCamera(28, 1, 0.1, 40);
    this.scene.add(new THREE.HemisphereLight('#fff0d8', '#3a2a1a', 1.35));
    const key = new THREE.DirectionalLight('#ffe0b0', 2.4); key.position.set(2.2, 4, 3.2); this.scene.add(key);
    const rim = new THREE.DirectionalLight('#e0a050', 1.6); rim.position.set(-3, 2.5, -2.5); this.scene.add(rim);
    // A soft dark pool under the feet.
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const gg = c.getContext('2d'), gr = gg.createRadialGradient(64, 64, 4, 64, 64, 62);
    gr.addColorStop(0, 'rgba(10,6,3,0.75)'); gr.addColorStop(1, 'rgba(10,6,3,0)'); gg.fillStyle = gr; gg.fillRect(0, 0, 128, 128);
    this.tex = new THREE.CanvasTexture(c);
    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.9), new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false }));
    this.floor.rotation.x = -Math.PI / 2; this.floor.position.y = 0.005; this.scene.add(this.floor);
    this.charR = new CharacterRenderer(this.scene, WEAPONS);
    this.ch = new Character(0, { x: 0, z: 0, face: 0.5, hp: 100, faction: 'player', weapon: 'pistol', colors: lookColors({}) });
    this.ch.timer = 0;
    this.list = [this.ch]; // what sync() draws, made once (no allocation per frame)
    this.spin = 0.5; this.drag = null;
    this.size = [0, 0]; this.reserved = -1;
    this.reserve = () => 0.36; // the share of the card's height its papers cover at the bottom (the screen measures it)
    canvas.addEventListener('pointerdown', (e) => { this.drag = e.clientX; canvas.setPointerCapture?.(e.pointerId); });
    canvas.addEventListener('pointermove', (e) => { if (this.drag !== null) { this.spin += (e.clientX - this.drag) * 0.012; this.drag = e.clientX; } });
    canvas.addEventListener('pointerup', () => { this.drag = null; });
  }
  set(picks, weapon) {
    const ch = this.ch;
    ch.colors = lookColors(picks);
    const b = buildOf(picks); ch.build = b.w === 1 && b.h === 1 ? null : b;
    ch.hand = picks.look?.hand === 'L' ? 'L' : 'R';
    ch.weapon = WEAPONS[weapon] ? weapon : 'pistol';
    this.charR.paint(ch);
  }
  frame(dt) {
    const w = this.canvas.clientWidth | 0, h = this.canvas.clientHeight | 0;
    if (!w || !h) return;
    const res = Math.round(Math.min(0.6, Math.max(0, this.reserve())) * 100) / 100;
    if (w !== this.size[0] || h !== this.size[1] || res !== this.reserved) {
      this.size[0] = w; this.size[1] = h; this.reserved = res;
      this.r.setSize(w, h, false);
      this.cam.aspect = w / h; this.cam.updateProjectionMatrix();
      // Frame the whole body above the card's papers, whatever the card's shape: the body (2 m with a hat) fills TALL
      // of the height, its middle at HIGH of the way down.
      const free = 1 - res, TALL = Math.max(0.36, free - 0.1), HIGH = 0.04 + TALL / 2, fov = this.cam.fov * Math.PI / 360;
      let hv = 2.3 / TALL / 2;                                 // half the visible height at the body (2 m and a hat, in perspective)
      hv = Math.max(hv, 1.0 / Math.max(0.3, w / h) / 2 / 0.8); // and wide enough for the arms on a narrow card
      const d = hv / Math.tan(fov), ty = 1.0 - (0.5 - HIGH) * 2 * hv;
      this.cam.position.set(0, ty + d * 0.1, d); this.cam.lookAt(0, ty, 0);
    }
    if (this.drag === null) this.spin += dt * 0.55;
    this.ch.face = this.spin;
    this.charR.sync(this.list, dt);
    this.r.render(this.scene, this.cam);
  }
  dispose() {
    this.scene.traverse((o) => { o.geometry?.dispose?.(); const m = o.material; if (m) (Array.isArray(m) ? m : [m]).forEach((x) => x.dispose?.()); });
    this.tex.dispose();
    this.r.dispose(); this.r.forceContextLoss?.();
  }
}

// ---- the screen ----------------------------------------------------------------------------------------------------------
export class CreatorUI {
  constructor(g) {
    this.g = g; this.C = g.creator;
    this.open_ = false; this.step = 0; this.focus = 0; this.rows = [];
    this.pad = { axes: [0, 0, 0, 0], v: new Float32Array(NB), prev: new Float32Array(NB), connected: false };
    this.virtual = null;  // { axes, buttons: { a: 1 } } from an agent (the `creator press=` command) or the controller's pad
    this.hold = { dir: null, t: 0 };
    this.titleWas = new Float32Array(NB);
    this.pressed = 0;     // pad presses handled (the agent's proof that the pad drove it)
    this.loop = this.loop.bind(this); this.last = 0; this.raf = 0;
    this.onKey = this.onKey.bind(this);
    this.build();
    this.attachTitle();
    // The title has no screen of its own to poll the pad from: watch it while it is up (A: make a survivor, X: quick start).
    this.titlePoll = setInterval(() => this.pollTitle(), 50);
  }

  // ---- the title's button ----------------------------------------------------------------------------------------------
  attachTitle() {
    const inner = document.querySelector('.title .title-inner');
    if (!inner || inner.querySelector('.cr-make')) return;
    const play = inner.querySelector('.play');
    const b = document.createElement('button');
    b.className = 'cr-make'; b.innerHTML = `MAKE A SURVIVOR${pad('A', true)}`;
    b.onclick = () => this.open({ fromTitle: true });
    play.before(b);
    play.classList.add('cr-quick');
    if (!/OFFLINE/.test(play.textContent)) play.innerHTML = `QUICK START: A DRIFTER ${pad('X', true)}`;
  }
  pollTitle() {
    if (!document.querySelector('.title')) { clearInterval(this.titlePoll); this.titlePoll = 0; return; } // the title is gone for good
    if (this.open_ || !document.querySelector('.title .cr-make')) return;
    this.readPad();
    const v = this.pad.v, was = this.titleWas;
    if (v[BTN.a] > 0.5 && !(was[BTN.a] > 0.5)) this.open({ fromTitle: true });
    else if (v[BTN.x] > 0.5 && !(was[BTN.x] > 0.5)) document.querySelector('.title .play')?.click();
    was.set(v);
  }

  build() {
    const el = this.el = document.createElement('div');
    el.className = 'cr hidden';
    el.innerHTML = `
      <div class="cr-top">
        <div class="cr-brand"><h2>MAKE A SURVIVOR</h2><div class="sub">POINT BY POINT · EVERYBODY HAS A FLAW</div></div>
        <div class="cr-steps">${pad('LB')}${STEPS.map((s, i) => `<button class="cr-tab" data-step="${i}"><b>${i + 1}</b>${s.label}</button>`).join('')}${pad('RB')}</div>
        <div class="cr-points cr-plate"><div class="n">0</div><div class="l">POINTS LEFT</div><div class="brk"></div></div>
      </div>
      <div class="cr-body">
        <div class="cr-panel cr-plate"><div class="cr-head"><h3></h3><div class="note"></div></div><div class="cr-rows"></div><div class="cr-detail"></div></div>
        <div class="cr-card cr-plate">
          <canvas class="cr-flagbg"></canvas>
          <canvas class="cr-model"></canvas>
          <div class="cr-id"><div class="cr-tape"></div><div class="cr-meta"></div><div class="cr-stats"></div><div class="cr-line2"></div></div>
        </div>
      </div>
      <div class="cr-foot">
        <div class="cr-hints">
          <span>${pad('↕')} MOVE</span><span>${pad('↔')} CHANGE</span><span>${pad('A', true)} PICK</span><span>${pad('B', true)} BACK</span>
          <span>${pad('LB')}${pad('RB')} STEP</span><span>${pad('Y', true)} RANDOMIZE</span><span>${pad('X', true)} ROLL</span><span>${pad('START')} BEGIN</span>
        </div>
        <div class="cr-btns">
          <button class="cr-btn steel" data-act="random">${pad('Y', true)}RANDOMIZE</button>
          <button class="cr-btn steel" data-act="back">${pad('B', true)}BACK</button>
          <button class="cr-btn gold" data-act="next">NEXT${pad('RB')}</button>
        </div>
        <div class="cr-errs"></div>
      </div>`;
    document.getElementById('ui').appendChild(el);
    const q = (s) => el.querySelector(s);
    this.$ = { tabs: [...el.querySelectorAll('.cr-tab')], pts: q('.cr-points .n'), brk: q('.cr-points .brk'), h3: q('.cr-head h3'), note: q('.cr-head .note'),
      rows: q('.cr-rows'), detail: q('.cr-detail'), flag: q('.cr-flagbg'), model: q('.cr-model'), id: q('.cr-id'), tape: q('.cr-tape'), meta: q('.cr-meta'), stats: q('.cr-stats'),
      line2: q('.cr-line2'), errs: q('.cr-errs'), next: q('[data-act="next"]'), back: q('[data-act="back"]') };
    for (const t of this.$.tabs) t.onclick = () => this.goStep(+t.dataset.step);
    q('[data-act="random"]').onclick = () => this.randomize();
    this.$.back.onclick = () => this.backStep();
    this.$.next.onclick = () => this.nextOrBegin();
    // Rows: one delegated listener (arrows change, the row picks).
    this.$.rows.addEventListener('click', (e) => {
      const rowEl = e.target.closest('.cr-row'); if (!rowEl) return;
      const i = +rowEl.dataset.i, row = this.rows[i]; if (!row) return;
      this.focus = i;
      const a = e.target.closest('[data-arrow]')?.dataset.arrow;
      if (e.target.tagName === 'INPUT') { this.paintFocus(); return; }
      if (e.target.closest('[data-roll]')) this.C.rollName();
      else if (row.kind === 'text') { this.paintFocus(); rowEl.querySelector('input')?.focus(); return; }
      else if (a === 'l') row.left?.(); else if (a === 'r') row.right?.(); else (row.press ?? row.right)?.();
      this.refresh();
    });
    this.$.detail.addEventListener('click', (e) => {
      const f = e.target.closest('[data-pickflag]')?.dataset.pickflag;
      if (f && !this.C.lock) { this.C.set({ flag: f }); this.refresh(); }
    });
    this.$.rows.addEventListener('input', (e) => {
      if (e.target.dataset.name === undefined) return;
      this.C.set({ name: e.target.value });
      this.refresh(false);
    });
  }

  get isOpen() { return this.open_; }

  open({ fromTitle = false, shard = false, onBegin = null } = {}) {
    if (this.open_) return;
    this.mode = { fromTitle: fromTitle && !!document.querySelector('.title'), shard, onBegin };
    this.pausedWas = this.g.paused;
    this.g.paused = true;
    this.step = 0; this.focus = 0;
    this.el.classList.remove('hidden');
    // One preview for the page's life: a WebGL context made and lost on every open would leak or fail to come back.
    // No WebGL at all: the screen still works, the card shows the flag and the papers without the body.
    if (!this.preview && !this.noPreview) try { this.preview = new Preview(this.$.model); this.preview.reserve = () => this.$.id.offsetHeight / Math.max(1, this.$.model.clientHeight); } catch (e) { this.noPreview = String(e?.message ?? e); }
    this.open_ = true;
    this.flagShown = null;
    addEventListener('keydown', this.onKey, true);
    this.refresh();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
    this.g.emit('creatorOpen', { shard });
  }

  close(begun = false) {
    if (!this.open_) return;
    this.open_ = false;
    cancelAnimationFrame(this.raf);
    removeEventListener('keydown', this.onKey, true);
    this.el.classList.add('hidden');
    if (!begun) { this.g.paused = this.mode?.fromTitle ? true : this.pausedWas; this.C.lock = null; }
    this.g.emit('creatorClose', { begun });
  }

  loop(now) {
    if (!this.open_) return;
    const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    this.padFrame(dt);
    if (this.open_) this.preview?.frame(dt);
    if (this.open_) this.raf = requestAnimationFrame(this.loop);
  }

  // ---- the pad ----------------------------------------------------------------------------------------------------------
  readPad() {
    const P = this.pad;
    let src = this.virtual ?? this.g.controls?.virtual ?? null;
    if (!src && typeof navigator !== 'undefined' && navigator.getGamepads) { for (const gp of navigator.getGamepads()) if (gp?.connected) { src = gp; break; } }
    P.prev.set(P.v);
    if (!src) { P.connected = false; P.v.fill(0); P.axes[0] = P.axes[1] = P.axes[2] = P.axes[3] = 0; return; }
    P.connected = true;
    for (let i = 0; i < 4; i++) P.axes[i] = +(src.axes?.[i] ?? 0) || 0;
    const B = src.buttons;
    if (Array.isArray(B) || (B && typeof B.length === 'number')) for (let i = 0; i < NB; i++) { const b = B[i]; P.v[i] = typeof b === 'number' ? b : b ? (b.pressed ? Math.max(b.value ?? 1, 0.99) : b.value ?? 0) : 0; }
    else { P.v.fill(0); for (const k in B ?? {}) if (k in BTN) P.v[BTN[k]] = +B[k] || 0; }
  }
  hit(name) { const i = BTN[name]; return this.pad.v[i] > 0.5 && !(this.pad.prev[i] > 0.5); }

  // One frame of the pad: edges for the buttons, a repeating direction from the d-pad or the left stick.
  padFrame(dt) {
    this.readPad();
    const P = this.pad, v = P.v;
    if (!P.connected) { this.hold.dir = null; return; }
    const before = this.pressed;
    if (this.hit('a')) { this.pressed++; this.press(); }
    else if (this.hit('b')) { this.pressed++; this.backStep(); }
    else if (this.hit('lb')) { this.pressed++; this.goStep(this.step - 1); }
    else if (this.hit('rb')) { this.pressed++; this.goStep(this.step + 1); }
    else if (this.hit('y')) { this.pressed++; this.randomize(); }
    else if (this.hit('x')) { this.pressed++; this.roll(); }
    else if (this.hit('start')) { this.pressed++; this.nextOrBegin(true); }
    if (!this.open_) return;
    const lx = P.axes[0], ly = P.axes[1];
    const dir = v[BTN.up] > 0.5 || ly < -STICK ? 'up' : v[BTN.down] > 0.5 || ly > STICK ? 'down' : v[BTN.left] > 0.5 || lx < -STICK ? 'left' : v[BTN.right] > 0.5 || lx > STICK ? 'right' : null;
    if (dir !== this.hold.dir) { this.hold.dir = dir; this.hold.t = REPEAT.first; if (dir) { this.pressed++; this.move(dir); } }
    else if (dir && (this.hold.t -= dt) <= 0) { this.hold.t = REPEAT.next; this.pressed++; this.move(dir); }
    if (this.pressed !== before && this.open_) this.refresh();
  }

  // ---- the keyboard (capture phase: the game's own keys never see it while the screen is up) ------------------------
  onKey(e) {
    if (!this.open_) return;
    const typing = e.target?.tagName === 'INPUT';
    e.stopPropagation();
    const k = e.code;
    if (typing) {
      if (k === 'Enter' || k === 'ArrowDown' || k === 'Tab' || k === 'Escape') { e.preventDefault(); e.target.blur(); if (k !== 'Escape') this.move('down'); this.refresh(); }
      return;
    }
    const map = { ArrowUp: () => this.move('up'), KeyW: () => this.move('up'), ArrowDown: () => this.move('down'), KeyS: () => this.move('down'),
      ArrowLeft: () => this.move('left'), KeyA: () => this.move('left'), ArrowRight: () => this.move('right'), KeyD: () => this.move('right'),
      Enter: () => this.press(), Space: () => this.press(), NumpadEnter: () => this.press(), Escape: () => this.backStep(), Backspace: () => this.backStep(),
      KeyQ: () => this.goStep(this.step - 1), PageUp: () => this.goStep(this.step - 1), KeyE: () => this.goStep(this.step + 1), PageDown: () => this.goStep(this.step + 1),
      KeyR: () => this.randomize(), KeyF: () => this.roll(), Tab: () => this.goStep(this.step + (e.shiftKey ? -1 : 1)) };
    const fn = map[k];
    if (!fn) return;
    e.preventDefault();
    fn();
    if (this.open_) this.refresh();
  }

  // ---- verbs --------------------------------------------------------------------------------------------------------------
  move(dir) {
    const row = this.rows[this.focus];
    if (dir === 'up') this.focus = Math.max(0, this.focus - 1);
    else if (dir === 'down') this.focus = Math.min(this.rows.length - 1, this.focus + 1);
    else if (dir === 'left') row?.left?.();
    else if (dir === 'right') row?.right?.();
  }
  press() {
    const row = this.rows[this.focus];
    if (!row) return;
    if (row.kind === 'text') {
      // The keyboard types; the pad rolls a name off the road (no on-screen keyboard to fight with).
      if (this.pad.connected && this.pad.v[BTN.a] > 0.5) this.roll();
      else this.$.rows.querySelector('input[data-name]')?.focus();
      return;
    }
    (row.press ?? row.right)?.();
  }
  roll() {
    if (STEPS[this.step].id === 'look') this.C.randomizeLook();
    else this.C.rollName();
  }
  randomize() { this.C.randomize(); this.flash = 'RANDOMIZED INSIDE THE BUDGET'; }
  goStep(i) {
    const n = Math.max(0, Math.min(STEPS.length - 1, i));
    if (n === this.step) return;
    this.step = n; this.focus = 0;
    this.refresh();
  }
  backStep() {
    if (this.step > 0) { this.goStep(this.step - 1); return; }
    if (this.mode?.shard) return; // a shard character has to be made: there is nowhere to go back to
    this.close(false);
  }
  nextOrBegin(fromStart = false) {
    if (this.step < STEPS.length - 1) { this.goStep(fromStart ? STEPS.length - 1 : this.step + 1); return; }
    this.begin();
  }
  begin() {
    const r = this.C.begin();
    if (!r.ok) { this.flash = r.errors[0]; this.refresh(); return r; }
    const mode = this.mode;
    this.close(true);
    const play = mode?.fromTitle ? document.querySelector('.title .play') : null;
    if (play) play.click(); else this.g.paused = false;
    const bg = backgroundById(this.C.sheet.picks.background);
    this.g.hud?.toast(`${r.name.toUpperCase()} · ${bg.label} OUT OF ${STATES[this.C.sheet.picks.state].toUpperCase()}`, 'job');
    if (r.knowing?.[0]) this.g.hud?.subtitle?.(r.knowing[0], 7);
    mode?.onBegin?.(r);
    return r;
  }

  // ---- the rows of each step ----------------------------------------------------------------------------------------------
  stepRows() {
    const C = this.C, P = C.draft, id = STEPS[this.step].id, rows = [];
    const lock = !!C.lock;
    if (id === 'origin') {
      rows.push({ kind: 'text', label: 'NAME', sub: lock ? 'the shard already knows you by it' : 'type it, or roll one off the road', html: `<input data-name maxlength="${CREATOR.nameMax}" spellcheck="false" placeholder="WHO ARE YOU" value="${esc(P.name)}"${lock ? ' disabled' : ''}>`,
        cost: lock ? '' : `<button class="cr-arrow" data-roll title="roll a name">${pad('X', true)}</button>`, press: () => C.rollName() });
      const fi = Math.max(0, FLAG_KEYS.indexOf(P.flag));
      rows.push({ kind: 'cycle', label: 'COUNTRY', sub: 'the flag you carry', html: `<canvas class="cr-flagthumb" data-flag="${P.flag}"></canvas><span class="txt">${esc(FLAGS[P.flag]?.name ?? P.flag).toUpperCase()}</span>`,
        left: () => !lock && C.set({ flag: FLAG_KEYS[cyc(FLAG_KEYS, fi, -1)] }), right: () => !lock && C.set({ flag: FLAG_KEYS[cyc(FLAG_KEYS, fi, 1)] }), locked: lock });
      const si = STATE_KEYS.indexOf(P.state);
      rows.push({ kind: 'cycle', label: 'HOME STATE', sub: 'what your papers say', html: `<span class="txt">${esc(STATES[P.state]).toUpperCase()}</span>`,
        left: () => C.set({ state: STATE_KEYS[cyc(STATE_KEYS, si, -1)] }), right: () => C.set({ state: STATE_KEYS[cyc(STATE_KEYS, si, 1)] }) });
    } else if (id === 'background') {
      for (const b of BACKGROUNDS) rows.push({ kind: 'pick', label: b.label, sub: Object.entries(b.skills).map(([k, n]) => `+${n} ${k}`).join(' · '), on: P.background === b.id,
        html: `<span class="txt">${esc(b.kit.guns.map(([w]) => WEAPONS[w]?.name ?? w).join(', '))}${b.kit.wear.length ? ` · ${esc(b.kit.wear.map((x) => GEAR[x]?.name ?? x).join(', '))}` : ''}</span>`,
        press: () => C.set({ background: b.id }), right: () => C.set({ background: b.id }), bg: b });
    } else if (id === 'attributes') {
      for (const a of ATTRS) {
        const r = P.attrs[a.k], up = r < CREATOR.rankMax ? ATTR_COST[r + 1] - ATTR_COST[r] : null;
        rows.push({ kind: 'stepper', label: a.label, sub: a.does, attr: a,
          html: `<span class="cr-pips">${Array.from({ length: CREATOR.rankMax }, (_, i) => `<i class="${i < r ? `f${i >= 4 ? ' hi' : ''}` : ''}"></i>`).join('')}</span><span class="cr-rank">${RANKS[r]}</span>`,
          cost: up === null ? '<span class="cr-cost">MAX</span>' : `<span class="cr-cost ${up <= tally(P).left ? 'pay' : ''}">+1 · ${up}p</span>`,
          left: () => C.bump(a.k, -1), right: () => C.bump(a.k, 1), press: () => C.bump(a.k, 1), noLeft: r <= CREATOR.rankMin, noRight: r >= CREATOR.rankMax });
      }
    } else if (id === 'traits') {
      const T = tally(P);
      rows.push({ group: 'GOOD · THEY COST' });
      for (const t of TRAITS) {
        const on = P.traits.includes(t.id), price = priceOfTrait(P, t.id, !on), blocked = !on && ((t.not ?? []).some((x) => P.traits.includes(x)) || price > T.left || P.traits.filter((x) => !isFlaw(x)).length >= CREATOR.maxGood);
        rows.push({ kind: 'toggle', label: t.label, on, off: blocked, html: `<span class="cr-check">${SVG.ok}</span><span class="dsc">${esc(t.d)}</span>`, cost: `<span class="cr-cost pay">${t.cost}p</span>`, press: () => C.setTrait(t.id), trait: t });
      }
      rows.push({ group: `FLAWS · THEY PAY BACK (${CREATOR.minFlaws}-${CREATOR.maxFlaws}, ${CREATOR.refundCap}p AT MOST)` });
      for (const t of FLAWS) {
        const on = P.traits.includes(t.id), blocked = !on && P.traits.filter(isFlaw).length >= CREATOR.maxFlaws;
        rows.push({ kind: 'toggle', flaw: true, label: t.label, on, off: blocked, html: `<span class="cr-check">${SVG.ok}</span><span class="dsc">${esc(t.d)}</span>`, cost: `<span class="cr-cost back">+${t.refund}p</span>`, press: () => C.setTrait(t.id), trait: t });
      }
    } else if (id === 'look') {
      const L = P.look, setL = (o) => C.set({ look: o });
      const cyl = (label, sub, list, key, show) => {
        const i = typeof L[key] === 'number' ? L[key] : Math.max(0, list.findIndex((x) => (x.id ?? x) === L[key]));
        const val = (j) => (typeof L[key] === 'number' ? j : list[j].id ?? list[j]);
        rows.push({ kind: 'cycle', label, sub, html: show(list[i], i), left: () => setL({ [key]: val(cyc(list, i, -1)) }), right: () => setL({ [key]: val(cyc(list, i, 1)) }) });
      };
      const sw = (c) => `<span class="cr-swatch" style="background:${c}"></span>`;
      cyl('BUILD', 'how you carry your weight', BUILDS, 'build', (b) => `<span class="txt">${b.label}</span>`);
      cyl('GUN HAND', 'which side the gun rides on', HANDS, 'hand', (h) => `<span class="txt">${h.label}</span>`);
      cyl('SKIN', '', SKIN, 'skin', (c, i) => `${sw(c)}<span class="txt">TONE ${i + 1}</span>`);
      cyl('HAIR · HAT', 'what is on your head', HAIR_STYLES, 'hairStyle', (h) => `<span class="txt">${h.label}</span>`);
      const hatOn = !['short', 'long', 'mohawk', 'bald'].includes(L.hairStyle);
      if (!hatOn) cyl('HAIR COLOUR', '', HAIR, 'hair', (c) => `${sw(c)}`);
      else cyl('HAT COLOUR', 'a cap, a brim, a wrap', HAT_COLORS, 'hat', (c) => `${sw(c)}`);
      cyl('FACE', '', FACES, 'face', (f) => `<span class="txt">${f.label}</span>`);
      cyl('SCAR', '', SCARS, 'scar', (s) => `<span class="txt">${s.label}</span>`);
      if (L.scar !== 'none') cyl('HOW YOU GOT IT', 'what you say when they ask', SCAR_STORIES, 'scarStory', (s) => `<span class="txt">${esc(s).toUpperCase()}</span>`);
      cyl('SHIRT', '', SHIRTS, 'shirt', (c) => sw(c));
      cyl('TROUSERS', '', PANTS, 'pants', (c) => sw(c));
      cyl('BOOTS', '', BOOTS, 'boots', (c) => sw(c));
      cyl('SLEEVES', '', ['long', 'short'], 'sleeves', (s) => `<span class="txt">${s.toUpperCase()}</span>`);
    } else if (id === 'kit') {
      const errs = validate(P);
      rows.push({ kind: 'button', label: errs.length ? 'NOT YET' : 'BEGIN', sub: errs.length ? errs[0] : 'walk out into it', html: `<span class="txt">${errs.length ? `${errs.length} thing${errs.length > 1 ? 's' : ''} to fix` : 'ready'}</span>`, cost: pad('START'), press: () => this.begin(), off: !!errs.length, go: !errs.length });
    }
    return rows;
  }

  // ---- drawing ----------------------------------------------------------------------------------------------------------
  refresh(rebuildRows = true) {
    if (!this.open_) return;
    const C = this.C, P = C.draft, T = tally(P), step = STEPS[this.step];
    if (rebuildRows) {
      const all = this.stepRows();
      this.rows = all.filter((r) => !r.group);
      this.focus = Math.max(0, Math.min(this.rows.length - 1, this.focus));
      let i = 0;
      this.$.rows.innerHTML = all.map((r) => {
        if (r.group) return `<div class="cr-group">${esc(r.group)}</div>`;
        const k = i++, arrows = r.kind === 'cycle' || r.kind === 'stepper';
        return `<div class="cr-row${k === this.focus ? ' focus' : ''}${r.go ? ' go' : ''}${r.on ? ' on' : ''}${r.flaw ? ' flaw' : ''}${r.off || r.locked ? ' off' : ''}" data-i="${k}">
          <div class="lab">${esc(r.label)}${r.sub ? `<small>${esc(r.sub)}</small>` : ''}</div>
          <div class="val">${arrows ? `<button class="cr-arrow" data-arrow="l"${r.noLeft ? ' aria-disabled="true"' : ''}>${SVG.l}</button>` : ''}${r.html ?? ''}${arrows ? `<button class="cr-arrow" data-arrow="r"${r.noRight ? ' aria-disabled="true"' : ''}>${SVG.r}</button>` : ''}</div>
          <div>${r.cost ?? ''}</div></div>`;
      }).join('');
      if (step.id === 'kit') { this.$.rows.insertAdjacentHTML('afterbegin', this.kitHTML()); }
      for (const cv of this.$.rows.querySelectorAll('canvas[data-flag]')) { const src = drawFlag(cv.dataset.flag, 72, 48); cv.width = 72; cv.height = 48; cv.getContext('2d').drawImage(src, 0, 0); }
      this.$.rows.querySelector('.cr-row.focus')?.scrollIntoView?.({ block: 'nearest' });
    }
    // tabs, points, head
    this.$.tabs.forEach((t, i) => { t.classList.toggle('on', i === this.step); t.classList.toggle('done', this.stepDone(i)); });
    this.$.pts.textContent = T.left;
    this.$.pts.className = `n${T.left === 0 ? ' zero' : T.left <= 3 ? ' low' : ''}`;
    this.$.brk.textContent = `ATTRIBUTES ${T.attrs} · TRAITS ${T.good} · FLAWS +${T.refund}`;
    this.$.h3.textContent = `${this.step + 1} · ${step.label}`;
    this.$.note.textContent = step.note;
    this.$.detail.innerHTML = this.detailHTML();
    for (const cv of this.$.detail.querySelectorAll('canvas[data-flag]')) { const src = drawFlag(cv.dataset.flag, 72, 48); cv.width = 72; cv.height = 48; cv.getContext('2d').drawImage(src, 0, 0); }
    for (const cv of this.$.detail.querySelectorAll('canvas[data-cloth]')) { const src = paintClothFlag(FLAGS[cv.dataset.cloth] ? cv.dataset.cloth : 'US', 168, 110); cv.width = src.width; cv.height = src.height; cv.getContext('2d').drawImage(src, 0, 0); }
    const errs = validate(P);
    this.$.errs.textContent = this.flash ?? (this.step === STEPS.length - 1 && errs.length ? errs.join('  ·  ') : '');
    this.flash = null;
    const last = this.step === STEPS.length - 1;
    this.$.next.innerHTML = last ? `BEGIN${pad('START')}` : `NEXT${pad('RB')}`;
    this.$.next.setAttribute('aria-disabled', last && errs.length ? 'true' : 'false');
    this.$.back.setAttribute('aria-disabled', this.step === 0 && this.mode?.shard ? 'true' : 'false');
    this.paintCard();
  }
  paintFocus() { this.$.rows.querySelectorAll('.cr-row').forEach((r) => r.classList.toggle('focus', +r.dataset.i === this.focus)); }
  stepDone(i) {
    const P = this.C.draft, id = STEPS[i].id;
    if (id === 'origin') return String(P.name).trim().length >= CREATOR.nameMin;
    if (id === 'traits') return P.traits.some(isFlaw);
    if (id === 'kit') return !validate(P).length;
    return true;
  }

  detailHTML() {
    const C = this.C, P = C.draft, id = STEPS[this.step].id, row = this.rows[this.focus], V = C.view();
    if (id === 'origin') {
      const kin = [...new Set(NPCS.filter((n) => n.id && n.flag === P.flag).map((n) => n.name))].slice(0, 3);
      return `<div class="cr-paper cr-papers"><canvas data-cloth="${P.flag}"></canvas><div><div class="big">${P.name ? esc(P.name) : '<span class="dim">no name yet</span>'}</div><div class="kv" style="margin-top:6px">
        <span>COUNTRY</span><span>${esc(FLAGS[P.flag]?.name ?? P.flag)}${kin.length ? ` <span class="dim">· ${esc(kin.join(', '))} ${kin.length > 1 ? 'are' : 'is'} from there too, and will warm to you.</span>` : ' <span class="dim">· nobody in town is from there. You will stand out.</span>'}</span>
        <span>HOME STATE</span><span>${esc(STATES[P.state])} <span class="dim">· held by ${esc(RULERS[P.state] ?? 'nobody')}.</span>${P.state === 'AZ' ? ' <span class="dim">A local: Rust Haven knows the accent.</span>' : ''}</span>
        <span>KNOWN TO</span><span>${esc(backgroundById(P.background)?.knowing.line ?? '')} <span class="dim">(your background: step 2)</span></span></div></div></div>
        <div class="cr-flags">${FLAG_KEYS.map((k) => `<button class="cr-flagpick${k === P.flag ? ' on' : ''}"${C.lock ? ' aria-disabled="true"' : ''} data-pickflag="${k}" title="${esc(FLAGS[k].name)}"><canvas data-flag="${k}"></canvas><span>${esc(FLAGS[k].name)}</span></button>`).join('')}</div>`;
    }
    if (id === 'background') {
      const b = row?.bg ?? backgroundById(P.background), k = b.kit;
      return `<div class="cr-paper"><b>${esc(b.label)}</b> <span class="dim">${esc(b.blurb)}</span><div class="kv" style="margin-top:6px">
        <span>CARRIES</span><span>${esc(k.guns.map(([w, r]) => `${WEAPONS[w]?.name ?? w} (${r} rounds)`).join(', '))} · ${esc(k.items.map(([i, n]) => `${n > 1 ? `${n} × ` : ''}${ITEMS[i]?.name ?? i}`).join(', '))}${k.wear.length ? ` · wearing ${esc(k.wear.map((x) => GEAR[x]?.name ?? x).join(', '))}` : ''}</span>
        <span>KNOWN TO</span><span>${esc(b.knowing.line)}</span></div></div>`;
    }
    if (id === 'attributes') {
      const a = row?.attr ?? ATTRS[0], r = P.attrs[a.k], fx = V.effects, sk = V.skills;
      const now = {
        strength: `starts STRENGTH at level ${sk.strength}: carries ${(24 + 3.5 * sk.strength).toFixed(1)} kg before the load slows you`,
        endurance: `starts ENDURANCE at level ${sk.endurance}, sprint drain x${(1 - 0.04 * sk.endurance).toFixed(2)}; max hp ${V.maxHp}`,
        dexterity: `starts DEXTERITY at level ${sk.dexterity}: spread x${(1 - 0.035 * sk.dexterity).toFixed(2)}, reloads x${(1 - 0.03 * sk.dexterity).toFixed(2)}`,
        perception: `asleep you wake to danger at ${(12 * fx.wakeMul).toFixed(1)} m; ${fx.luck ? `${fx.luck} more find${fx.luck > 1 ? 's' : ''} the first time you search a box` : `rank ${PER_RANK.luckAt[0]} finds more in a box`}`,
        wits: `counter prices x${fx.priceMul.toFixed(2)}, repairs ${fx.repair >= 0 ? '+' : ''}${Math.round(fx.repair * 100)}%`,
        nerve: `aim spread at night x${fx.nightSpreadMul.toFixed(2)}`,
      }[a.k];
      return `<div class="cr-paper"><b>${esc(a.label)} ${r} · ${RANKS[r]}</b> <span class="dim">${esc(a.does)}.</span><br>${esc(now)}.<br><span class="dim">Rank costs, held: ${ATTR_COST.slice(1).map((c, i) => `${i + 1}=${c}`).join('  ')} points. Skills still grow by doing, to 10.</span></div>`;
    }
    if (id === 'traits') {
      const t = row?.trait, T = V.tally;
      return `<div class="cr-paper">${t ? `<b>${esc(t.label)}</b> <span class="dim">${esc(t.d)}.</span>${t.not?.length ? ` <span class="dim">Not with ${esc(t.not.map((x) => traitById(x)?.label).join(', '))}.</span>` : ''}<br>` : ''}
        Good traits ${P.traits.filter((x) => !isFlaw(x)).length}/${CREATOR.maxGood} · flaws ${P.traits.filter(isFlaw).length}/${CREATOR.maxFlaws} · paid back ${T.refund}${T.refundRaw > T.refund ? ` <span class="dim">(of ${T.refundRaw}: capped at ${CREATOR.refundCap})</span>` : ''}.</div>`;
    }
    if (id === 'look') return `<div class="cr-paper"><span class="dim">The body on the card is the one the game draws. Drag it to turn it. ${pad('X', true)} or F rolls a whole new look.</span>${P.look.scar !== 'none' ? `<br>The scar: ${esc(SCAR_STORIES[P.look.scarStory] ?? '')}.` : ''}</div>`;
    return '';
  }

  kitHTML() {
    const C = this.C, P = C.draft, V = C.view(), K = V.kit;
    const kgTotal = K.items.reduce((s, [i, n]) => s + kg(i, n), 0) + (ITEMS[K.pack]?.kg ?? 0);
      return `<div class="cr-kit">
        <div class="cr-paper"><b>ON YOU</b><ul>${K.guns.map(([w, r, c]) => `<li>${esc(WEAPONS[w]?.name ?? w)} · ${r} rounds · ${Math.round(c * 100)}% kept</li>`).join('')}
          <li>${esc(ITEMS[K.pack]?.name ?? K.pack)}: ${esc(K.items.map(([i, n]) => `${n > 1 ? `${n} × ` : ''}${ITEMS[i]?.name ?? i}`).join(', '))}</li>
          ${K.wear.length ? `<li>wearing ${esc(K.wear.map((x) => GEAR[x]?.name ?? x).join(', '))}</li>` : ''}
          ${Object.entries(K.throwables).filter(([k, n]) => k !== 'rock' && n > 0).map(([k, n]) => `<li>${n} × ${esc(window.__THROW_NAMES?.[k] ?? k)}</li>`).join('')}
          <li>$${K.cash} scrip <span class="dim">(${V.tally.left > 0 ? `${V.tally.left} unspent point${V.tally.left > 1 ? 's' : ''} x ${CREATOR.scripPerPoint}` : 'no points left over'})</span></li></ul>
          <span class="dim">about ${kgTotal.toFixed(1)} kg in the pack</span></div>
        <div class="cr-paper"><b>WHO KNOWS YOU</b><ul>${V.knowing.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
          <b>THE SHEET</b><br>hp ${V.maxHp} · STR ${V.skills.strength} · END ${V.skills.endurance} · DEX ${V.skills.dexterity} <span class="dim">(skill levels; they grow by doing)</span><br>
          ${P.traits.length ? esc(P.traits.map((x) => traitById(x)?.label).join(', ')) : '<span class="dim">no traits</span>'}${P.look.scar !== 'none' ? `<br><span class="dim">A scar ${esc(SCARS.find((x) => x.id === P.look.scar)?.label.toLowerCase())}: ${esc(SCAR_STORIES[P.look.scarStory] ?? '')}.</span>` : ''}</div>
        <div class="cr-paper wide"><b>WHAT IT ALL ADDS UP TO</b><div class="cr-nums">${this.numbers(V).map(([k, v, good]) => `<span class="${good === true ? 'up' : good === false ? 'down' : ''}"><i>${esc(k)}</i>${esc(v)}</span>`).join('')}</div></div>
      </div>`;
  }

  // The live numbers the sheet moves, beside the engine's default (good: better than a fresh drifter's).
  numbers(V) {
    const fx = V.effects, sk = V.skills, mul = (x, lowGood = true) => [`x${x.toFixed(2)}`, Math.abs(x - 1) < 1e-9 ? null : (x < 1) === lowGood];
    const carry = 24 + 3.5 * sk.strength + fx.carryKg;
    return [
      ['MAX HP', `${V.maxHp}`, V.maxHp === 100 ? null : V.maxHp > 100],
      ['CARRY', `${carry.toFixed(1)} kg`, null],
      ['SPREAD', ...mul((1 - 0.035 * sk.dexterity) * fx.spreadMul)],
      ['AT NIGHT', ...mul(fx.nightSpreadMul)],
      ['RELOAD', ...mul((1 - 0.03 * sk.dexterity) * fx.reloadMul)],
      ['SPRINT COST', ...mul((1 - 0.04 * sk.endurance) * fx.sprintDrainMul)],
      ['SPEED', ...mul(fx.speedMul, false)],
      ['SPOTTED AT', ...mul(fx.seenMul)],
      ['PRICES', ...mul(fx.priceMul)],
      ['REPAIRS', `${fx.repair >= 0 ? '+' : ''}${Math.round(fx.repair * 100)}%`, fx.repair ? fx.repair > 0 : null],
      ['FINDS', `+${fx.luck}`, fx.luck ? true : null],
      ['WAKES AT', `${(12 * fx.wakeMul).toFixed(1)} m`, Math.abs(fx.wakeMul - 1) < 1e-9 ? null : fx.wakeMul > 1],
      ['THIRST', ...mul(fx.drain.water)],
      ['HUNGER', ...mul(fx.drain.food)],
    ];
  }

  paintCard() {
    const P = this.C.draft, b = backgroundById(P.background), V = this.C.view();
    if (this.flagShown !== P.flag) {
      this.flagShown = P.flag;
      const src = paintClothFlag(FLAGS[P.flag] ? P.flag : 'US', 520, 340), cv = this.$.flag;
      cv.width = src.width; cv.height = src.height; cv.getContext('2d').drawImage(src, 0, 0);
    }
    const name = String(P.name ?? '').trim();
    this.$.tape.textContent = name ? name.toUpperCase() : 'NO NAME YET';
    this.$.tape.classList.toggle('empty', !name);
    this.$.meta.innerHTML = `${esc(b?.label ?? '')} <span>· ${esc(STATES[P.state]?.toUpperCase() ?? '')} · ${esc((FLAGS[P.flag]?.name ?? '').toUpperCase())}</span>`;
    this.$.stats.innerHTML = ATTRS.map((a) => `<div class="cr-stat"><b>${P.attrs[a.k]}</b><i>${a.short}</i></div>`).join('');
    const flaws = P.traits.filter(isFlaw).map((x) => traitById(x)?.label), goods = P.traits.filter((x) => !isFlaw(x)).map((x) => traitById(x)?.label);
    this.$.line2.innerHTML = `<span><b>HP</b>${V.maxHp}</span><span><b>SCRIP</b>$${V.kit.cash}</span>${goods.length ? `<span><b>+</b>${esc(goods.join(', '))}</span>` : ''}${flaws.length ? `<span><b>−</b>${esc(flaws.join(', '))}</span>` : ''}`;
    this.preview?.set(P, b?.kit.guns[0]?.[0] ?? 'pistol');
  }

  view() { return { open: this.open_, step: STEPS[this.step].id, stepIndex: this.step, focus: this.focus, row: this.rows[this.focus]?.label ?? null, rows: this.rows.length, padPresses: this.pressed, mode: this.mode ? { fromTitle: this.mode.fromTitle, shard: this.mode.shard } : null }; }
}

export { STEPS };
