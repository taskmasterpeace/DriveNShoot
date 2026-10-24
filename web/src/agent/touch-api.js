import { TOUCH } from '../ui/touch.js';

// The touch controls' agent command and selftest check (ui/touch.js). Kept out of api.js so the shared file gains two
// lines. Both drive the controls with real PointerEvents on the same elements a thumb hits, so the whole path runs:
// the DOM event, the stick's tilt, the virtual pad, the controller's poll, the player.
const r1 = (v) => Math.round(v * 10) / 10;

// A synthetic thumb: pointerdown on an element at a spot, pointermoves on the controls, pointerup.
function thumb(el, id) {
  const T = el.closest('.touch');
  const ev = (type, x, y, on = el) => on.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', isPrimary: id === 1, clientX: x, clientY: y, bubbles: true, cancelable: true }));
  const r = el.getBoundingClientRect();
  const at = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  return {
    down(x = at.x, y = at.y) { at.x = x; at.y = y; ev('pointerdown', x, y); return this; },
    drag(dx, dy) { ev('pointermove', at.x + dx, at.y + dy, T); return this; },
    up() { ev('pointerup', at.x, at.y, T); return this; },
  };
}

export function touchCommands(api) {
  const g = api.g;
  const need = (ok, msg) => { if (!ok) throw new Error(msg); };
  return {
    touch: {
      group: 'player', desc: 'The on-screen touch controls (ui/touch.js; shown on a touch device, ?touch=1, or the first real touch): a floating move stick on the left half, an aim stick on the right (pushed past its ring it fires), and big buttons for where you are (on foot USE/DRIVE RELOAD DIVE CROUCH GUN HEAL; at the wheel GAS BRAKE FIRE OUT HANDBRAKE GUN; riding OUT RELOAD GUN), plus PACK MAP pause. on=true|false shows or hides them. Drive them with real pointer events: move=dx,dy and aim=dx,dy hold a stick tilted that many pixels, press=<button id> holds a button (gas, brake, use, reload, pack…), seconds=N holds it all while the sim steps, then lets go. Returns what is shown, the context, the virtual pad and the labels.',
      args: { on: { type: 'boolean' }, move: { type: 'string' }, aim: { type: 'string' }, press: { type: 'string' }, seconds: { type: 'number', default: 0.5 } },
      run: async ({ on, move, aim, press, seconds }) => {
        const T = g.touch;
        if (on !== undefined) { T.show(on); T.set = null; await api._step(1); }
        if (!move && !aim && !press) return T.view();
        need(T.on, 'the touch controls are hidden (touch on=true)');
        const xy = (s) => { const [dx, dy] = s.split(',').map(Number); need(Number.isFinite(dx) && Number.isFinite(dy), `want dx,dy pixels, got "${s}"`); return [dx, dy]; };
        const held = [];
        try {
          if (move) held.push(thumb(T.el.zones.move, 11).down().drag(...xy(move)));
          if (aim) held.push(thumb(T.el.zones.aim, 12).down().drag(...xy(aim)));
          if (press) {
            T.update();
            const b = T.el.root.querySelector(`[data-b="${press}"]`);
            need(b, `no "${press}" button here (${T.view().ctx}); there are ${[...T.el.root.querySelectorAll('[data-b]')].map((e) => e.dataset.b).join(', ')}`);
            held.push(thumb(b, 13).down());
          }
          await api._step(Math.max(1, Math.round(seconds * 60)));
          const v = T.view();
          return { ...v, player: { x: r1(g.player.x), z: r1(g.player.z) }, inVehicle: !!g.player.inVehicle };
        } finally { for (const h of held) h.up(); await api._step(2); }
      },
    },
  };
}

export async function touchChecks(x) {
  const { api, g, C, check, stage, hush } = x;
  const secs = (s) => api._step(Math.max(1, Math.round(s * 60)));
  await check('touch controls: a thumb on the left half walks you, the right stick past its ring fires, GAS at the wheel drives, USE reads DRIVE by a car, and they hide while the PACK is open', async () => hush(async () => {
    await stage();
    const T = g.touch, CT = g.controls, p = g.player, was = T.on;
    T.show(true); T.set = null;
    const fx = [];
    try {
      await secs(0.1);
      const shown = T.view().shown && T.view().ctx === 'foot';
      // walk: a thumb down on the left half and dragged right a full stick's reach (east; west if something stands east)
      let x0 = p.x, sx = 1;
      let m = thumb(T.el.zones.move, 21).down().drag(TOUCH.stickR, 0); await secs(1); m.up(); await secs(0.1);
      let walked = p.x - x0;
      if (walked < 2) { sx = -1; x0 = p.x; m = thumb(T.el.zones.move, 21).down().drag(-TOUCH.stickR, 0); await secs(1); m.up(); await secs(0.1); walked = x0 - p.x; }
      const device = CT.device;
      // aim: a short push aims without firing, past the ring fires (an SMG in hand, ammo to spare)
      await C('give', { weapon: 'smg', smg: 120 }); await C('equip', { weapon: 'smg' }).catch(() => null); g.inv.mag.smg = 30; // a full magazine, whatever an earlier check left
      const a = thumb(T.el.zones.aim, 22).down().drag(TOUCH.stickR * 0.4, 0); await secs(0.4);
      const aimOnly = !T.firing && !T.pad.buttons.rt;
      const s0 = g.combat.shotsFired ?? null, am0 = g.inv.mag?.smg;
      a.drag(TOUCH.stickR, 0); await secs(0.6);
      const firing = T.firing && !!T.pad.buttons.rt;
      const am1 = g.inv.mag?.smg, s1 = g.combat.shotsFired ?? null;
      const fired = (am0 != null && am1 < am0) || (s0 != null && s1 > s0);
      a.up(); await secs(0.2);
      const stopped = !T.firing && !T.pad.buttons.rt;
      // a car in reach: USE reads DRIVE; at the wheel GAS drives it and the buttons are the wheel's
      const v = (await C('spawnVehicle', { type: 'pickup', x: p.x + 3.2 * sx, z: p.z, ai: 'none' })).id, car = api.findVeh(v);
      fx.push(car);
      await secs(0.2);
      const drive = T.view().labels.includes('DRIVE');
      await C('enterVehicle', { id: v, force: true }); await secs(0.2);
      const wheel = T.view().ctx === 'drive' && T.view().labels.includes('GAS');
      const cx = car.x, cz = car.z;
      const gb = thumb(T.el.root.querySelector('[data-b="gas"]'), 23).down(); await secs(1.5); gb.up(); await secs(0.1);
      const gas = Math.hypot(car.x - cx, car.z - cz);
      const ob = thumb(T.el.root.querySelector('[data-b="out"]'), 24).down(); await secs(0.05); ob.up(); await secs(0.4);
      const out = !p.inVehicle;
      // the PACK takes the screen: the sticks and buttons step aside
      const pk = thumb(T.el.root.querySelector('[data-b="pack"]'), 25).down(); await secs(0.05); pk.up(); await secs(0.3);
      const packOpen = !!g.invUI?.open || CT.ctx === 'menu';
      const hidden = !T.view().shown;
      if (packOpen) { CT.virtual = null; g.invUI?.toggle?.(false); await secs(0.2); }
      const back = T.view().shown;
      const ok = shown && walked > 2.5 && device === 'pad' && aimOnly && firing && fired && stopped && drive && wheel && gas > 3 && out && packOpen && hidden && back;
      return ok ? true : JSON.stringify({ shown, walked: r1(walked), device, aimOnly, firing, fired, am0, am1, stopped, drive, wheel, gas: r1(gas), out, packOpen, hidden, back, view: T.view() });
    } finally {
      T.release(); T.show(was); T.set = null; CT.virtual = null;
      if (p.inVehicle) g.exitVehicle(true);
      for (const c of fx) g.vehiclesSys.remove?.(c);
      await secs(0.05);
    }
  }));
}
