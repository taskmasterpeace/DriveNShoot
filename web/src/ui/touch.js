// THE TOUCH CONTROLS: a phone's two thumbs, played through the controller as a virtual pad (engine/controls.js reads
// `controls.virtual` exactly as it reads a plugged-in pad, so every verb, context and rebind works the same way).
//
//   left half    a floating MOVE stick: put a thumb down anywhere and drag (on foot: walk / run; at the wheel: steer)
//   right half   a floating AIM stick: drag to aim; push past the ring (TOUCH.fireAt) and the gun fires while you hold it
//   buttons      the verbs for where you are (TOUCH_SETS: on foot, at the wheel, riding along), big and labelled
//
// Shown only on a touch device (a coarse pointer, `?touch=1`, or the first real touch on the page), and hidden while
// the PACK, a talk or the weapon wheel has the screen (those are tapped directly). The `touch` command drives it in tests
// with real PointerEvents on the same elements a thumb hits.
export const TOUCH = { stickR: 58, fireAt: 0.62, deadR: 6 };
// A button: label, the pad button it holds, and an optional `big`. USE turns into DRIVE when a car is in reach (the pad's
// smart Y). GAS and BRAKE are the triggers, as on a pad.
export const TOUCH_SETS = {
  foot: [
    { id: 'use', label: 'USE', pad: 'y', big: true }, { id: 'reload', label: 'RELOAD', pad: 'x' }, { id: 'dive', label: 'DIVE', pad: 'a' },
    { id: 'crouch', label: 'CROUCH', pad: 'b' }, { id: 'gun', label: 'GUN', pad: 'rb' }, { id: 'heal', label: 'HEAL', pad: 'right' },
  ],
  drive: [
    { id: 'gas', label: 'GAS', pad: 'rt', big: true }, { id: 'brake', label: 'BRAKE', pad: 'lt', big: true }, { id: 'fire', label: 'FIRE', pad: 'lb' },
    { id: 'out', label: 'OUT', pad: 'y' }, { id: 'hand', label: 'E-BRAKE', pad: 'a' }, { id: 'gun', label: 'GUN', pad: 'rb' },
  ],
  ride: [
    { id: 'out', label: 'OUT', pad: 'y', big: true }, { id: 'reload', label: 'RELOAD', pad: 'x' }, { id: 'gun', label: 'GUN', pad: 'rb' },
  ],
};
// Always there (top right, small): the PACK, the MAP, PAUSE.
export const TOUCH_BAR = [{ id: 'pack', label: 'PACK', pad: 'down' }, { id: 'map', label: 'MAP', pad: 'back' }, { id: 'pause', label: '❚❚', pad: 'start' }];

export function touchDevice() {
  try {
    if (new URLSearchParams(location.search).get('touch') === '1') return true;
    return matchMedia('(pointer: coarse)').matches;
  } catch { return false; }
}

export class TouchControls {
  constructor(game, root) {
    this.g = game;
    this.pad = { id: 'touch', axes: [0, 0, 0, 0], buttons: {} };
    this.sticks = { move: null, aim: null }; // pointerId -> { id, x0, y0, x, y }
    this.held = new Map(); // pointerId -> button id
    this.linger = new Map(); // pad button -> frames left: a tap quicker than a frame still reaches one poll
    this.on = false; this.set = null; this.firing = false;
    root.insertAdjacentHTML('beforeend', `
      <div class="touch hidden">
        <div class="t-zone t-left" data-zone="move"><div class="t-base"><div class="t-knob"></div></div></div>
        <div class="t-zone t-right" data-zone="aim"><div class="t-base"><i class="t-ring"></i><div class="t-knob"></div></div></div>
        <div class="t-btns"></div>
        <div class="t-bar">${TOUCH_BAR.map((b) => `<button class="t-btn small" data-b="${b.id}" data-pad="${b.pad}">${b.label}</button>`).join('')}</div>
      </div>`);
    const el = root.querySelector('.touch');
    this.el = { root: el, btns: el.querySelector('.t-btns'), zones: { move: el.querySelector('.t-left'), aim: el.querySelector('.t-right') } };
    this.el.base = { move: this.el.zones.move.querySelector('.t-base'), aim: this.el.zones.aim.querySelector('.t-base') };
    this.el.knob = { move: this.el.zones.move.querySelector('.t-knob'), aim: this.el.zones.aim.querySelector('.t-knob') };
    // Pointer events (a thumb is a pointer), and the touch events stopped too, so no mouse events follow a tap (they
    // would hand the controls back to the keyboard-and-mouse path).
    for (const t of ['touchstart', 'touchmove', 'touchend']) el.addEventListener(t, (e) => { if (e.cancelable) e.preventDefault(); }, { passive: false });
    el.addEventListener('pointerdown', (e) => this.down(e));
    el.addEventListener('pointermove', (e) => this.move(e));
    for (const t of ['pointerup', 'pointercancel']) el.addEventListener(t, (e) => this.up(e));
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    // A touch laptop or a tablet with a mouse: the first real touch on the page shows them.
    addEventListener('touchstart', () => { if (!this.on) this.show(true); }, { passive: true, once: true });
    if (touchDevice()) this.show(true);
  }

  show(on) {
    this.on = on;
    this.el.root.classList.toggle('hidden', !on);
    document.getElementById('ui')?.classList.toggle('touch-on', on);
    if (!on) this.release();
  }

  // ---- the thumbs -----------------------------------------------------------------------------------------------
  down(e) {
    const b = e.target.closest('[data-pad]');
    try { e.target.setPointerCapture?.(e.pointerId); } catch { /* synthetic events */ }
    if (b) { this.held.set(e.pointerId, b.dataset.pad); b.classList.add('down'); this.feed(); return; }
    const z = e.target.closest('[data-zone]')?.dataset.zone;
    if (!z || this.sticks[z]) return;
    this.sticks[z] = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY };
    const B = this.el.base[z], r = this.el.zones[z].getBoundingClientRect();
    B.style.left = `${e.clientX - r.left}px`; B.style.top = `${e.clientY - r.top}px`; B.classList.add('live');
    this.feed();
  }
  move(e) {
    for (const z of ['move', 'aim']) {
      const s = this.sticks[z];
      if (s?.id !== e.pointerId) continue;
      s.x = e.clientX; s.y = e.clientY;
      this.feed();
    }
  }
  up(e) {
    if (this.held.has(e.pointerId)) {
      const pad = this.held.get(e.pointerId); this.held.delete(e.pointerId); this.linger.set(pad, 2);
      if (![...this.held.values()].includes(pad)) this.el.root.querySelectorAll(`[data-pad="${pad}"]`).forEach((b) => b.classList.remove('down'));
    }
    for (const z of ['move', 'aim']) if (this.sticks[z]?.id === e.pointerId) { this.sticks[z] = null; this.el.base[z].classList.remove('live', 'fire'); this.el.base[z].style.left = ''; this.el.base[z].style.top = ''; this.el.knob[z].style.transform = ''; }
    this.feed();
  }
  release() { this.sticks.move = this.sticks.aim = null; this.held.clear(); this.linger.clear(); this.feed(); }

  // A stick's tilt, -1..1 on each axis, clamped to its ring (screen up is north, as on a pad).
  tilt(z) {
    const s = this.sticks[z], R = TOUCH.stickR;
    if (!s) return [0, 0, 0];
    let dx = s.x - s.x0, dy = s.y - s.y0;
    const d = Math.hypot(dx, dy);
    if (d < TOUCH.deadR) return [0, 0, 0];
    if (d > R) { dx *= R / d; dy *= R / d; }
    this.el.knob[z].style.transform = `translate(${dx.toFixed(0)}px, ${dy.toFixed(0)}px)`;
    return [dx / R, dy / R, Math.min(1, d / R)];
  }

  // The virtual pad the controller polls: the sticks' tilts, the held buttons, and the aim stick past the ring as RT.
  feed() {
    const P = this.pad, [lx, ly] = this.tilt('move'), [rx, ry, rm] = this.tilt('aim');
    P.axes[0] = lx; P.axes[1] = ly; P.axes[2] = rx; P.axes[3] = ry;
    const b = {};
    for (const n of this.held.values()) b[n] = 1;
    for (const n of this.linger.keys()) b[n] = 1;
    this.firing = rm >= TOUCH.fireAt && this.g.controls?.ctx !== 'drive';
    if (this.firing) b.rt = 1;
    this.el.base.aim.classList.toggle('fire', this.firing);
    P.buttons = b;
    if (this.g.controls) this.g.controls.virtual = P;
  }

  // ---- per frame: which buttons (only when where you are changes, or USE becomes DRIVE) ------------------------------
  // Called each frame before the controller polls.
  update() {
    if (!this.on) return;
    if (this.linger.size) { for (const [n, f] of this.linger) if (f <= 1) this.linger.delete(n); else this.linger.set(n, f - 1); this.feed(); }
    const C = this.g.controls, ctx = C?.ctx ?? 'foot', shown = TOUCH_SETS[ctx] ? ctx : null;
    this.el.root.classList.toggle('t-off', !shown);
    if (!shown) { if (this.held.size || this.sticks.move || this.sticks.aim) this.release(); return; }
    const car = ctx === 'foot' && !!C?.carInReach?.();
    const key = `${ctx}:${car}`;
    if (key === this.set) return;
    this.set = key;
    this.el.root.dataset.ctx = ctx;
    // The small verbs in a grid on top, the big ones in a row under the thumb (the first big one sits at the right edge).
    const btn = (b) => `<button class="t-btn${b.big ? ' big' : ''}" data-b="${b.id}" data-pad="${b.pad}">${b.id === 'use' && car ? 'DRIVE' : b.label}</button>`;
    const set = TOUCH_SETS[ctx];
    this.el.btns.innerHTML = `<div class="t-small">${set.filter((b) => !b.big).map(btn).join('')}</div><div class="t-big">${set.filter((b) => b.big).reverse().map(btn).join('')}</div>`;
  }

  view() {
    const r2 = (v) => +v.toFixed(2);
    return { on: this.on, ctx: this.el.root.dataset.ctx ?? null, shown: this.on && !this.el.root.classList.contains('t-off'), firing: this.firing, axes: this.pad.axes.map(r2), buttons: Object.keys(this.pad.buttons), labels: [...this.el.btns.querySelectorAll('.t-btn')].map((b) => b.textContent) };
  }
}
