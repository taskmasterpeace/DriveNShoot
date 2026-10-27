// Keyboard + mouse state. `pressed` holds keys that went down this frame.
//
// Two layers (docs/design/WEB_CONTROLLER.md):
//   physical  what the player's hands did: `phys` (keys held), `physHit` (went down this frame), mouse.physLeft/Right.
//   canonical what the game reads (`down`, `pressed`, key(), hit()): the code each verb has always been read by.
// A physical key goes through `remap` (engine/controls.js folds the binding rows into it): a rebound key emits the verb's
// canonical code, and the pad holds canonical codes too. Every code in `down` remembers who holds it, so a key and a pad
// button on the same verb never release each other. Code that writes `down` directly (the selftest's held keys) still
// works: what nobody claimed, nobody releases.
export class Input {
  constructor(canvas) {
    this.down = new Set();
    this.pressed = new Set();
    this.phys = new Set();
    this.physHit = new Set();
    this.holders = new Map();   // canonical code -> Set of holder tags ('k:KeyR', 'pad')
    this.physMap = new Map();   // physical code -> the canonical codes it emitted when it went down
    this.remap = null;          // (physical code) -> array of canonical codes; null: identity
    this.mouse = { x: 0, y: 0, nx: 0, ny: 0, left: false, right: false, leftPressed: false, rightPressed: false, physLeft: false, physRight: false, padLeft: false };
    this.wheel = 0;             // plain wheel notches this frame (+ = toward you = zoom out): the camera's
    this.wheelAlt = 0;          // Alt+wheel notches: the weapon cycle
    this.lastKbT = 0;           // performance.now() of the last key or mouse use (which device has the hands)
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keyDown(e.code);
      if (['Space', 'Tab', 'F3', 'F4'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keyUp(e.code));
    addEventListener('blur', () => { for (const k of [...this.phys]) this.keyUp(k); this.down.clear(); this.holders.clear(); this.mouseButton(0, false); this.mouseButton(2, false); });
    addEventListener('mousemove', (e) => this.mouseMove(e.clientX, e.clientY));
    canvas.addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault(); this.mouseButton(e.button, true); }); // middle: no autoscroll
    addEventListener('mouseup', (e) => this.mouseButton(e.button, false));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    // Only a wheel over the game itself counts: a panel under the pointer (the pack, the map, a menu) keeps its wheel.
    addEventListener('wheel', (e) => {
      if (e.target !== canvas && e.target !== document.body && e.target !== document.documentElement) return;
      if (e.altKey) this.wheelAlt += Math.sign(e.deltaY); else this.wheel += Math.sign(e.deltaY);
      this.lastKbT = performance.now();
    }, { passive: true });
  }

  // ---- the physical layer (DOM events and the selftest's hands both come through here) ---------------------------
  keyDown(code) {
    if (this.phys.has(code)) return;
    this.phys.add(code); this.physHit.add(code);
    this.lastKbT = performance.now();
    const codes = this.remap ? this.remap(code) : [code];
    this.physMap.set(code, codes);
    for (const c of codes) { this.hold(c, `k:${code}`); this.pressed.add(c); }
  }
  keyUp(code) {
    this.phys.delete(code);
    const codes = this.physMap.get(code);
    this.physMap.delete(code);
    if (codes) for (const c of codes) this.release(c, `k:${code}`);
    else this.down.delete(code);
  }
  mouseMove(x, y) {
    this.mouse.x = x; this.mouse.y = y;
    this.mouse.nx = (x / innerWidth) * 2 - 1;
    this.mouse.ny = -(y / innerHeight) * 2 + 1;
    this.lastKbT = performance.now();
  }
  mouseButton(button, on) {
    const m = this.mouse;
    if (button === 0) { if (on && !m.physLeft) m.leftPressed = true; m.physLeft = on; m.left = on || m.padLeft; }
    if (button === 2) { if (on && !m.physRight) m.rightPressed = true; m.physRight = on; m.right = on; }
    if (button === 1) m.middle = on; // held: look far (data/controls.js 'look')
    if (on) this.lastKbT = performance.now();
  }

  // ---- the canonical layer --------------------------------------------------------------------------------------
  hold(code, who) {
    let h = this.holders.get(code);
    if (!h) this.holders.set(code, (h = new Set()));
    h.add(who);
    this.down.add(code);
  }
  release(code, who) {
    const h = this.holders.get(code);
    if (h) { h.delete(who); if (h.size) return; }
    this.down.delete(code);
  }
  key(code) { return this.down.has(code); }
  hit(code) { return this.pressed.has(code); }
  endFrame() {
    this.pressed.clear();
    this.physHit.clear();
    this.mouse.leftPressed = false;
    this.mouse.rightPressed = false;
    this.wheel = 0;
    this.wheelAlt = 0;
  }
}
