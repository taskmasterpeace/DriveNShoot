// KEEPING THE KEYBOARD. The game reads keys on window (engine/input.js), so anything that takes focus away from the page
// strands the player: Robert, 2026-10-29 playtest, "I clicked off of it, and now I hit I and it won't close", and R would
// not reload. Three rules:
//   1. A click on anything that is not a text field gives focus back to the game canvas, so a clicked button, slider or
//      checkbox never holds the keys (Space would press that button again, arrows would move that slider).
//   2. A dropdown keeps focus while it is open and gives it back once you pick.
//   3. While the window itself has lost focus (you clicked another window, the taskbar, the browser's bar), a small note
//      says so: CLICK TO RESUME. Keys pressed elsewhere never reach the game, and now that is visible.
// Never on an agent's tab (?agent): a headless tab never has window focus, and the note would sit in every screenshot.

const AGENT_TAB = (() => { try { return new URLSearchParams(location.search).has('agent'); } catch { return false; } })();
const TEXT_TYPES = new Set(['text', 'search', 'email', 'password', 'number', 'url', 'tel']);

// A field you type into: it keeps the keys (a name, a chat line, an import box).
export function typesText(el) {
  if (!el || el === document.body) return false;
  if (el.isContentEditable) return true;
  if (el.tagName === 'TEXTAREA') return !el.readOnly;
  if (el.tagName === 'INPUT') return TEXT_TYPES.has((el.type || 'text').toLowerCase()) && !el.readOnly;
  return false;
}

export class FocusKeeper {
  constructor(canvas, ui) {
    this.canvas = canvas;
    if (!canvas.hasAttribute('tabindex')) canvas.tabIndex = -1; // focusable from a script, never by Tab
    canvas.style.outline = 'none';
    this.reclaims = 0; // how many times a click gave the keys back (the selftest reads it)
    this.note = document.createElement('div');
    this.note.className = 'focus-note hidden';
    this.note.innerHTML = '<b>CLICK TO RESUME</b><span>the game lost the keyboard</span>';
    (ui ?? document.body).appendChild(this.note);
    if (!document.getElementById('focus-css')) {
      const st = document.createElement('style'); st.id = 'focus-css';
      st.textContent = `.focus-note{position:fixed;left:50%;top:38%;transform:translateX(-50%);z-index:9000;display:grid;gap:2px;justify-items:center;padding:10px 18px 9px;pointer-events:none;
background:linear-gradient(oklch(0.2 0.012 60 / 0.92),oklch(0.14 0.01 60 / 0.94));border:1px solid oklch(0.08 0.01 60);box-shadow:inset 0 1px 0 oklch(0.42 0.02 70 / 0.5),4px 5px 0 rgba(0,0,0,.5)}
.focus-note b{font:700 18px var(--display,system-ui);letter-spacing:.2em;color:var(--gold,#e0a83a)}.focus-note span{font:600 12px var(--road,system-ui);letter-spacing:.06em;color:var(--sand,#c9b48a)}.focus-note.hidden{display:none}`;
      document.head.appendChild(st);
    }
    // After the click lands (so the button's own handler runs first), hand focus back unless a text field or an open
    // dropdown has it.
    addEventListener('pointerup', (e) => { if (!typesText(e.target) && e.target?.tagName !== 'SELECT' && e.target?.tagName !== 'OPTION') queueMicrotask(() => this.reclaim()); }, true);
    addEventListener('change', (e) => { if (e.target?.tagName === 'SELECT' || (e.target?.tagName === 'INPUT' && !typesText(e.target))) this.reclaim(); }, true);
    addEventListener('blur', () => this.show());
    addEventListener('focus', () => this.show());
    document.addEventListener('visibilitychange', () => this.show());
    this.show();
  }

  // Give the keys back to the game: blur whatever control holds focus and focus the canvas.
  reclaim() {
    const a = document.activeElement;
    if (typesText(a)) return false;
    if (a && a !== document.body && a !== this.canvas && a.blur) a.blur();
    if (document.activeElement !== this.canvas) { try { this.canvas.focus({ preventScroll: true }); } catch { /* old engine: blur was enough */ } }
    this.reclaims++;
    this.show();
    return true;
  }

  // The note shows while the window does not have focus (a real player only).
  show() {
    const lost = !AGENT_TAB && !document.hidden && !document.hasFocus();
    this.note.classList.toggle('hidden', !lost);
  }
}
