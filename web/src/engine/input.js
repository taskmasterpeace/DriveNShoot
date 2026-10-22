// Keyboard + mouse state. `pressed` holds keys that went down this frame.
export class Input {
  constructor(canvas) {
    this.down = new Set();
    this.pressed = new Set();
    this.mouse = { x: 0, y: 0, nx: 0, ny: 0, left: false, right: false, leftPressed: false };
    this.wheel = 0;
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const k = e.code;
      this.down.add(k);
      this.pressed.add(k);
      if (['Space', 'Tab', 'F3', 'F4'].includes(k)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.down.delete(e.code));
    addEventListener('blur', () => this.down.clear());
    addEventListener('mousemove', (e) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      this.mouse.nx = (e.clientX / innerWidth) * 2 - 1;
      this.mouse.ny = -(e.clientY / innerHeight) * 2 + 1;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) { this.mouse.left = true; this.mouse.leftPressed = true; }
      if (e.button === 2) this.mouse.right = true;
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) this.mouse.right = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); }, { passive: true });
  }
  key(code) { return this.down.has(code); }
  hit(code) { return this.pressed.has(code); }
  endFrame() {
    this.pressed.clear();
    this.mouse.leftPressed = false;
    this.wheel = 0;
  }
}
