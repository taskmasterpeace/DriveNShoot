import { DRIVING } from '../systems/vehicles.js';
import * as THREE from 'three';
import { WEAPONS } from '../systems/combat.js';
import { STANCE, GUNPOINT } from '../data/arms.js';
import { PAD } from '../data/controls.js';
import { outfit } from '../systems/characters.js';

// The controller's agent commands and selftest checks (docs/design/WEB_CONTROLLER.md). Kept out of api.js so the
// shared file only gains two lines: the commands are merged into COMMANDS, the checks run inside runSelfTest.
const r1 = (v) => Math.round(v * 10) / 10;
const _v = new THREE.Vector3();

export function controllerCommands(api) {
  const g = api.g;
  const need = (ok, msg) => { if (!ok) throw new Error(msg); };
  const steps = (s) => api._step(Math.max(1, Math.round(s * 60)));
  return {
    controls: {
      group: 'player', desc: 'The controller (data/controls.js rows, engine/controls.js): every action with its keys and pad buttons by context (foot, drive, ride, talk, menu, radial), who has the hands (keyboard or pad), the pad\'s sticks and the context now. bind=<action> keys=KeyK,mouse:right pad=<button> ctx=foot rebinds (saved on this machine, as the F2 panel does); reset=<action>|all puts the defaults back; id=<action> shows one row and what it clashes with.',
      args: { id: { type: 'string' }, bind: { type: 'string' }, keys: { type: 'string' }, pad: { type: 'string' }, ctx: { type: 'string', default: 'foot' }, reset: { type: 'string' } },
      run: async ({ id, bind, keys, pad, ctx, reset }) => {
        const C = g.controls;
        if (reset) C.reset(reset === 'all' ? undefined : reset);
        if (bind) { const r = C.bind(bind, { keys: keys ? keys.split(',').map((s) => s.trim()) : undefined, pad, ctx }); need(r.ok, r.why); return r; }
        if (id) { need(C.byId[id], `no action "${id}"; actions: ${Object.keys(C.byId).join(', ')}`); return { action: C.view(id), clashes: C.clashes(id) }; }
        return { ...C.state(), actions: C.rows.map((r) => C.view(r.id)) };
      },
    },
    pad: {
      group: 'player', desc: 'Drive a virtual gamepad through the real input path (the same poll a plugged-in pad goes through): lx ly (left stick: move / steer), rx ry (right stick: aim; on the weapon wheel, pick), lt rt (triggers 0..1: throw or brake / fire or gas), buttons=a,rb,up (held: a b x y lb rb lt rt back start l3 r3 up down left right). seconds=N holds it that long while the sim steps, then lets go; without seconds the pad stays as set until off=true. Returns the controller state.',
      args: { lx: { type: 'number', default: 0 }, ly: { type: 'number', default: 0 }, rx: { type: 'number', default: 0 }, ry: { type: 'number', default: 0 }, lt: { type: 'number', default: 0 }, rt: { type: 'number', default: 0 }, buttons: { type: 'string' }, seconds: { type: 'number' }, off: { type: 'boolean', default: false } },
      run: async ({ lx, ly, rx, ry, lt, rt, buttons, seconds, off }) => {
        const C = g.controls;
        if (off) { C.virtual = null; await steps(1 / 60); return C.state(); }
        const b = { lt, rt };
        for (const n of (buttons ?? '').split(',').map((s) => s.trim()).filter(Boolean)) b[n] = 1;
        C.virtual = { id: 'virtual pad', axes: [lx, ly, rx, ry], buttons: b };
        if (seconds) { await steps(seconds); C.virtual = { id: 'virtual pad', axes: [0, 0, 0, 0], buttons: {} }; await steps(2 / 60); }
        return { ...C.state(), player: { x: r1(g.player.x), z: r1(g.player.z), face: +g.player.face.toFixed(2) }, aim: { x: r1(g.aim.x), z: r1(g.aim.z) } };
      },
    },
    stance: {
      group: 'player', desc: 'How you carry your gun (systems/arms.js): raised (aimed: people read it - guards tense, traders shut the counter, the person it points at is held at gunpoint), lowered (in hand, muzzle down), holstered (hands free: doors open ahead of you, windows climbed faster, a touch quicker on your feet). set=raised|lowered|holstered, grip=one|two (your choice; a car seat, hanging on, cooking a throw or a sprint force one hand). Returns the stance, grip and why, the gun as it fires now (mode, burst, rate, spread with grip and recoil), and who has noticed the gun.',
      args: { set: { type: 'string', enum: ['raised', 'lowered', 'holstered'] }, grip: { type: 'string', enum: ['one', 'two'] } },
      run: async ({ set, grip }) => {
        if (set) g.arms.setStance(set);
        if (grip) g.arms.setGrip(grip);
        if (set === 'holstered' || set === 'raised') await steps((STANCE.draw[g.inv.current] ?? 0.5) + 0.05);
        return g.arms.view();
      },
    },
    firemode: {
      group: 'player', desc: 'The fire modes and alternate uses on a weapon row (the weapon bar\'s boxes): pistol SINGLE|FAN, SMG and rifle SEMI|BURST|AUTO, sawn-off BUCK|SLUG. weapon= (default the gun in hand) mode=<id> sets one, step=1 cycles. Returns each mode\'s burst count, cyclic rate and spread.',
      args: { weapon: { type: 'string' }, mode: { type: 'string' }, step: { type: 'number' } },
      run: async ({ weapon, mode, step }) => {
        const k = weapon ?? g.inv.current;
        need(WEAPONS[k], `no weapon "${k}"`);
        if (mode) need(g.arms.setMode(k, mode), `${k} has no mode "${mode}"; it has ${g.arms.modes(k).map((m) => m.id).join('|')}`);
        if (step) g.arms.cycleMode(k, step);
        const cur = g.arms.modeOf(k);
        return { weapon: k, mode: cur.id, modes: g.arms.modes(k).map((m) => ({ id: m.id, name: m.name, burst: m.burst, rate: m.rate, spread: +(WEAPONS[k].spread * (m.spread ?? 1)).toFixed(4), dmg: m.dmg ?? WEAPONS[k].dmg, pellets: m.pellets ?? WEAPONS[k].pellets })) };
      },
    },
    gunpoint: {
      group: 'player', desc: 'Gunpoint as a state (systems/gunpoint.js): who is under your aim and for how long, who is held (comply, plead, run, draw, prisoner) with their nerve and tension, the standoff (several guns on you, nobody firing first) and how the last one ended. id=<person> raises your gun and holds it on them for seconds= (default 1.2): they answer by their nerve. verb=rob|door|prisoner|release acts on the held person in reach (hand it over / open the door near them / walk with me / let go). Every hold is a threaten deed and a robbery a rob deed (the witness pass, rumors, memories).',
      args: { id: { type: 'string' }, seconds: { type: 'number', default: 1.2 }, verb: { type: 'string', enum: ['rob', 'door', 'prisoner', 'release'] } },
      run: async ({ id, seconds, verb }) => {
        const G = g.gunpoint;
        if (id) {
          const c = api.findChar(id);
          need(c && c.alive, `no living person ${id}`);
          const d = Math.hypot(c.x - g.player.x, c.z - g.player.z);
          need(d <= GUNPOINT.range, `${c.name ?? id} is ${d.toFixed(1)} m away; gunpoint reaches ${GUNPOINT.range} m (moveTo id=${id} first)`);
          if (g.arms.stance !== 'raised') { g.arms.raise('command'); if (g.arms.drawT > 0) await steps(g.arms.drawT + 0.05); }
          G.agentAim = true;
          try { for (let t = 0; t < seconds; t += 1 / 60) { g.aimOverride = { x: c.x, z: c.z }; await api._step(1); } }
          finally { G.agentAim = false; g.aimOverride = null; }
        }
        if (verb) {
          const h = verb === 'release' ? G.held[0] : G.target();
          need(h, G.held.length ? 'nobody you hold is within reach (walk up to them)' : 'nobody is held at gunpoint');
          if (verb === 'rob') { need(!h.robbed, 'they already handed it over'); return { robbed: G.rob(h), ...G.view() }; }
          if (verb === 'door') { const d = G.lockedDoorNear(h.c); need(d, 'no locked door near them'); return { door: G.openDoor(h, d), ...G.view() }; }
          if (verb === 'prisoner') { G.prisoner(h); return G.view(); }
          if (verb === 'release') { G.release(h, 'let go'); return G.view(); }
        }
        return G.view();
      },
    },
    melee: {
      group: 'player', desc: 'Hand to hand (systems/melee.js): kind=strike (what is in your hand: fists, the gun\'s butt when it is raised, a knife you carry), kick (heavier, knocks down), shove (a shoulder: knockdown, room to run). id= turns you to face them first (they must be in reach: ~1.2-1.5 m). Waits for the blow to land and returns it: who, damage, knockdown, combo, killed. No rounds spent.',
      args: { kind: { type: 'string', default: 'strike', enum: ['strike', 'kick', 'shove'] }, id: { type: 'string' } },
      run: async ({ kind, id }) => {
        const p = g.player, M = g.melee;
        need(M.can(), 'you cannot swing now (in a car, swimming, down, in a conversation or the pack)');
        if (id) { const c = api.findChar(id); need(c && c.alive, `no living person ${id}`); p.face = Math.atan2(c.x - p.x, c.z - p.z); g.aimOverride = { x: c.x, z: c.z }; }
        try {
          const a = M.swing(kind === 'strike' ? M.strikeKind() : kind);
          need(a, 'a blow is already in flight');
          for (let i = 0; i < 90 && M.act === a; i++) await api._step(1);
        } finally { if (id) g.aimOverride = null; }
        return M.view();
      },
    },
    weaponbar: {
      group: 'player', desc: 'What the weapon bar shows (ui/weaponbar.js): each slot (weapon, loaded rounds, its fire modes and which is on), whether the mode boxes are up over the live slot, the stance and grip tags, and the pad\'s weapon wheel when it is open.',
      run: async () => {
        const q = (s) => document.querySelector(s), A = g.arms;
        return {
          slots: g.inv.weapons.map((k, i) => ({ slot: i + 1, weapon: k, live: k === g.inv.current, loaded: g.inv.mag[k] ?? 0, mode: A.modeOf(k).id, modes: A.modes(k).map((m) => m.name) })),
          boxesUp: !!q('.wb-slot.on .wb-modes.up'), boxes: [...document.querySelectorAll('.wb-slot.on .wb-box')].map((e) => ({ text: e.firstChild?.textContent ?? '', on: e.classList.contains('on') })),
          stanceTag: q('.wb-stance')?.firstChild?.textContent ?? null, gripTag: q('.wb-grip')?.firstChild?.textContent ?? null,
          radial: A.radialOpen ? { slot: A.radialSlot + 1, weapon: g.inv.weapons[A.radialSlot], modes: { ...A.radialMode }, shown: !q('.wradial')?.classList.contains('hidden') } : null,
        };
      },
    },
  };
}

// ---- the selftest checks ---------------------------------------------------------------------------------------------
// Every check drives the player through the real input paths: physical keys (Input.keyDown / keyUp, what a keyboard
// event calls), mouse buttons and moves (Input.mouseButton / mouseMove), and the virtual pad's axes and buttons through
// Controls.poll. Staging positions (teleport, spawning the people) is the only shortcut, as for every other check.
export async function controllerChecks(x) {
  const { api, g, C, check, stage, person, hush } = x;
  const I = g.input, CT = g.controls;
  const frames = (n) => api._step(n);
  const secs = (s) => api._step(Math.max(1, Math.round(s * 60)));
  const key = async (code, s = 1 / 60) => { I.keyDown(code); await secs(s); I.keyUp(code); await frames(1); };
  const pad = (axes = [0, 0, 0, 0], buttons = {}) => { CT.virtual = { id: 'virtual pad (selftest)', axes, buttons }; };
  const padOff = async () => { CT.virtual = null; await frames(2); };
  // The mouse on a spot of ground: project it through the camera to the screen and move the pointer there.
  const mouseAt = (x0, z0) => { _v.set(x0, 1.2, z0).project(g.camera); I.mouseMove(((_v.x + 1) / 2) * innerWidth, ((1 - _v.y) / 2) * innerHeight); };
  const reset = async () => {
    await padOff();
    g.gunpoint.clear(); g.arms.setStance('lowered'); g.arms.setGrip('two'); g.arms.bloom = 0; g.arms.burstLeft = 0;
    for (const k of [...I.phys]) I.keyUp(k);
    I.mouseButton(0, false); I.mouseButton(2, false);
    g.aimOverride = null;
  };
  const cleanup = (list) => { for (const c of list) if (c && g.chars.includes(c)) g.removeChar(c); };

  await check('controller: the pad moves (a light tilt creeps, a full one walks) and the right stick aims; RT is the gas at the wheel and LT the brake; a hit rumbles the pad', async () => hush(async () => {
    await stage(); await reset();
    const p = g.player;
    try {
      const x0 = p.x;
      pad([1, 0, 0, 0]); await secs(1);
      const full = p.x - x0;
      pad([0.32, 0, 0, 0]); await secs(0.1); const x1 = p.x; await secs(1);
      const light = p.x - x1;
      pad([0, 0, 0, 1]); await secs(0.5); // aim south
      const south = { face: +Math.cos(p.face).toFixed(2), aimZ: +(g.aim.z - p.z).toFixed(1), device: CT.device };
      pad([-1, 0, -1, 0]); await secs(0.5); // walk and aim west
      const west = { sin: +Math.sin(p.face).toFixed(2), aimX: +(g.aim.x - p.x).toFixed(1) };
      pad(); await secs(0.2);
      // the wheel: a car beside you, RT for the gas, LT for the brake, the stick steers
      const v = (await C('spawnVehicle', { type: 'pickup', x: p.x + 4, z: p.z, ai: 'none' })).id, car = api.findVeh(v);
      await C('enterVehicle', { id: v, force: true });
      const cx = car.x, cz = car.z;
      pad([0, 0, 0, 0], { rt: 1 }); await secs(1.5);
      const gas = Math.hypot(car.x - cx, car.z - cz), sp = g.vehiclesSys.speed(car);
      pad([0, 0, 0, 0], { lt: 1 });
      let slow = sp;
      for (let i = 0; i < 72; i++) { await frames(1); slow = Math.min(slow, g.vehiclesSys.speed(car)); }
      const braked = slow < sp * 0.4; // (held on, LT then reverses)
      pad([0, 0, 0, 0], { y: 1 }); await frames(2); pad(); await secs(0.3); // Y gets out
      const out = !p.inVehicle;
      g.vehiclesSys.remove?.(car);
      // a hit rumbles the pad
      g.godMode = false; const hp = p.hp; pad(); await frames(2);
      g.combat.damage(p, 5, null, 1, 0); await frames(2);
      const rumble = CT.lastRumble?.kind === 'hurt' && CT.lastRumble.strong > 0.5; p.hp = hp; g.godMode = true;
      const ok = full > 3.5 && light > 0.4 && light < full * 0.6 && south.face > 0.9 && south.aimZ > 3 && south.device === 'pad' && west.sin < -0.9 && west.aimX < -3 && gas > 3 && braked && out && rumble;
      return ok ? true : JSON.stringify({ full: r1(full), light: r1(light), south, west, gas: r1(gas), braked, out, rumble: CT.lastRumble });
    } finally { g.godMode = true; await padOff(); if (p.inVehicle) g.exitVehicle(true); }
  }));

  await check('controller: bindings are rows - a rebound key emits its verb, the old key goes quiet, reset brings it back', async () => {
    await reset();
    try {
      CT.bind('reload', { keys: ['KeyO'] });
      I.keyDown('KeyO'); const viaO = I.key('KeyR'); I.keyUp('KeyO');
      I.keyDown('KeyR'); const viaR = I.key('KeyR'); I.keyUp('KeyR');
      CT.bind('reload', { keys: ['KeyH'] });
      const clash = CT.clashes('reload').some((c) => c.id === 'holster'); // H is the holster's (and the harpoon's)
      CT.reset('reload');
      I.keyDown('KeyR'); const back = I.key('KeyR'); I.keyUp('KeyR');
      I.endFrame();
      return viaO && !viaR && clash && back ? true : JSON.stringify({ viaO, viaR, clash, back });
    } finally { CT.reset('reload'); }
  });

  await check('weapon bar: tapping the slot again steps its mode boxes; the BURST box fires 3 rounds a pull, SEMI 1, AUTO keeps going; the boxes stand over that slot only', async () => hush(async () => {
    await stage(); await reset();
    await C('give', { weapon: 'smg', smg: 200 });
    const W = g.inv.weapons, slot = `Digit${W.indexOf('smg') + 1}`;
    const p = g.player;
    mouseAt(p.x - 12, p.z - 6); // at empty ground
    const pull = async (hold) => {
      g.inv.mag.smg = 32; p.reloading = 0; await secs(0.6); // the burst's pause gone
      const m0 = g.inv.mag.smg;
      mouseAt(p.x - 12, p.z - 6);
      I.mouseButton(0, true); await secs(hold); I.mouseButton(0, false); await secs(0.6);
      return m0 - g.inv.mag.smg;
    };
    try {
      await key(slot);
      const sel = g.inv.current === 'smg' && g.arms.modeOf('smg').id === 'auto';
      await key(slot); // again: the next box
      const semiMode = g.arms.modeOf('smg').id;
      await frames(8);
      const bar = await C('weaponbar');
      const semi = await pull(0.05);
      await key(slot);
      await frames(6); // the bar redraws at 15 Hz
      const burstMode = g.arms.modeOf('smg').id, burstBox = (await C('weaponbar')).boxes.find((b) => b.on)?.text;
      const burst = await pull(0.05);
      const burstHeld = await pull(0.5); // holding the trigger is still one burst
      await key(slot);
      const auto = await pull(0.6);
      const onlyLive = document.querySelectorAll('.wb-modes.up').length === 1;
      const ok = sel && semiMode === 'semi' && bar.boxesUp && semi === 1 && burstMode === 'burst' && burstBox === 'BURST' && burst === 3 && burstHeld === 3 && auto > 5 && onlyLive;
      return ok ? true : JSON.stringify({ sel, semiMode, boxesUp: bar.boxesUp, semi, burstMode, burstBox, burst, burstHeld, auto, onlyLive });
    } finally { g.arms.setMode('smg', 'auto'); await C('equip', { weapon: 'pistol' }); }
  }));

  await check('grip: one hand throws a wider cone than two (and kicks harder); J toggles it; a car seat forces one hand', async () => hush(async () => {
    await stage(); await reset();
    const p = g.player, dirs = [], orig = g.combat.hitscan, origFire = g.combat.fire;
    // A spy on each round's direction against the line it was fired along (instrumentation only: the shots go through the
    // real trigger, and the spread is what combat.fire adds to that line).
    let line = 0;
    g.combat.fire = function (ch, k, ang, w) { if (ch === p) line = ang; return origFire.call(this, ch, k, ang, w); };
    g.combat.hitscan = function (shooter, ox, oz, dx, dz, range, dmg) { if (shooter === p) dirs.push(Math.atan2(Math.sin(Math.atan2(dx, dz) - line), Math.cos(Math.atan2(dx, dz) - line))); return orig.call(this, shooter, ox, oz, dx, dz, range, dmg); };
    const cone = async (n) => {
      dirs.length = 0;
      for (let i = 0; i < n; i++) {
        g.inv.mag.pistol = 6; p.reloading = 0; g.arms.bloom = 0;
        mouseAt(p.x - 14, p.z - 4); await frames(2);
        I.mouseButton(0, true); await frames(1); I.mouseButton(0, false); await secs(0.32);
      }
      return (Math.max(...dirs) - Math.min(...dirs)) / 2; // the cone's half-width as thrown (the spread is uniform)
    };
    try {
      const two = await cone(30), rowTwo = g.arms.row('pistol').spread;
      await key('KeyJ');
      const pref = g.arms.gripPref, rowOne = g.arms.row('pistol').spread;
      const one = await cone(30);
      const kick = g.arms.kickMul();
      await key('KeyJ');
      // a car seat: one hand at the window, whatever you chose
      const v = (await C('spawnVehicle', { type: 'pickup', x: p.x + 4, z: p.z, ai: 'none' })).id, car = api.findVeh(v);
      await C('enterVehicle', { id: v, force: true }); await frames(3);
      const seat = { grip: g.arms.grip, why: g.arms.gripWhy };
      g.exitVehicle(true); g.vehiclesSys.remove?.(car);
      const ok = pref === 'one' && one > two * 1.35 && rowOne > rowTwo * 1.35 && kick > 1.5 && seat.grip === 'one' && seat.why === 'vehicle';
      return ok ? true : JSON.stringify({ two: +two.toFixed(4), one: +one.toFixed(4), rowTwo, rowOne, kick, pref, seat, shots: dirs.length });
    } finally { g.combat.hitscan = orig; g.combat.fire = origFire; g.arms.setGrip('two'); if (p.inVehicle) g.exitVehicle(true); }
  }));

  await check('holster: hands free open a closed door ahead of you (the leaf is wider open when you reach it, and you get through); H taps it up and down, held it holsters', async () => hush(async () => {
    await reset();
    const Id = g.interiors;
    const inRuins = (o) => Math.max(Math.abs(o.x), Math.abs(o.z)) > 100;
    const clearAt = (o, k) => g.nav.foot.free(o.x + o.nx * k, o.z + o.nz * k) && g.nav.foot.free(o.x - o.nx * k, o.z - o.nz * k);
    const d = Id.doors.find((o) => o.kind === 'back' && o.leaves.length === 1 && !o.locked && inRuins(o) && clearAt(o, 3));
    if (!d) return 'no unlocked single back door in the ruins';
    const keyIn = Math.abs(d.nx) > Math.abs(d.nz) ? (d.nx > 0 ? 'KeyA' : 'KeyD') : d.nz > 0 ? 'KeyW' : 'KeyS';
    const outSide = (x0, z0) => (x0 - d.x) * d.nx + (z0 - d.z) * d.nz;
    const run = async () => {
      await C('door', { id: d.id, action: 'close' });
      for (const c of [...g.chars]) if (c !== g.player && !c.npc && Math.hypot(c.x - d.x, c.z - d.z) < 26) g.removeChar(c);
      await C('teleport', { x: d.x + d.nx * 2.6, z: d.z + d.nz * 2.6 }); await frames(3);
      let f = 0, atDoor = null;
      I.keyDown(keyIn);
      try {
        for (; f < 240; f++) {
          await frames(1);
          const o = outSide(g.player.x, g.player.z);
          if (atDoor === null && o < 0.7) atDoor = Math.abs(d.leaves[0].th);
          if (o < -1.4) break;
        }
      } finally { I.keyUp(keyIn); }
      return { frames: f, atDoor: +(atDoor ?? 0).toFixed(2) };
    };
    try {
      await key('KeyH'); // lowered -> raised
      const tapUp = g.arms.stance;
      const raised = await run();
      I.keyDown('KeyH'); await secs(PAD.holdTime + 0.1); I.keyUp('KeyH'); await frames(2); // held: holster
      const held = g.arms.stance;
      const free = await run();
      await key('KeyH'); await secs(0.7); // tapped while holstered: draw
      const drawn = g.arms.stance;
      const ok = tapUp === 'raised' && held === 'holstered' && drawn === 'raised' && free.frames < 240 && free.atDoor > raised.atDoor + 0.25 && g.arms.counts.doorPushes > 0;
      return ok ? true : JSON.stringify({ tapUp, held, drawn, raised, free, pushes: g.arms.counts.doorPushes });
    } finally { await C('door', { id: d.id, action: 'close' }); g.arms.setStance('lowered'); }
  }));

  await check('gunpoint: a timid unarmed man held at gunpoint puts his hands up and hands it over (a threaten and a rob deed, his people can hear of it); a man with nerve runs', async () => hush(async () => {
    await stage(); await reset();
    const p = g.player, timid = person('drifter', 2.4, 0, { nerve: 0.02, hp: 200 }), bold = person('drifter', -7, 3, { nerve: 0.95, hp: 200 });
    const deeds = (c, verb) => g.society.chronicle.query({ verb, limit: 30 }).filter((r) => r.o === c.id && r.a === 'player' && r.src !== 'rumor').length;
    try {
      await key('KeyH'); // gun up
      for (let i = 0; i < 70; i++) { mouseAt(timid.x, timid.z); await frames(1); }
      const h = g.gunpoint.entry(timid);
      const state = h?.state, up = !!timid.handsUp, threatened = deeds(timid, 'threaten');
      const cash0 = g.cash;
      mouseAt(timid.x, timid.z);
      await key('KeyE', 0.1); // tap E: hand it over
      await frames(3);
      const robbed = !!h?.robbed && g.cash > cash0 && deeds(timid, 'rob') === 1 && [...g.inventory.boxes.keys()].some((k) => k.startsWith(`drop:${timid.id}`));
      // the bold one: aim at him and he bolts
      const b0 = { x: bold.x, z: bold.z };
      for (let i = 0; i < 70; i++) { mouseAt(bold.x, bold.z); await frames(1); }
      const bh = g.gunpoint.view().held.find((x) => x.id === bold.id) ?? g.events.slice(-40).find((e) => e.type === 'gunpoint' && e.id === bold.id);
      await secs(1.5);
      const ran = (bh?.state ?? bh?.reaction) === 'run' && Math.hypot(bold.x - b0.x, bold.z - b0.z) > 3 && Math.hypot(bold.x - p.x, bold.z - p.z) > Math.hypot(b0.x - p.x, b0.z - p.z);
      const ok = (state === 'comply' || state === 'plead') && up && threatened === 1 && robbed && ran;
      return ok ? true : JSON.stringify({ state, up, threatened, robbed, robs: deeds(timid, 'rob'), bold: bh, moved: r1(Math.hypot(bold.x - b0.x, bold.z - b0.z)) });
    } finally { g.gunpoint.clear(); cleanup([timid, bold]); }
  }));

  await check('gunpoint: two armed men with nerve draw on you - a standoff where nobody fires first while you cover them; lower your gun and they lower theirs; fire and they open up', async () => hush(async () => {
    await stage(); await reset();
    const p = g.player, mk = (dx, dz) => person('drifter', dx, dz, { nerve: 0.9, hp: 400, weapon: 'pistol', mag: 6 });
    let a = mk(7, -2), b = mk(-6, -4), c2 = null, d2 = null;
    const cover = async (c, s) => { for (let i = 0; i < s * 60; i++) { mouseAt(c.x, c.z); await frames(1); } };
    try {
      await key('KeyH');
      await cover(a, 1.0); await cover(b, 1.0);
      const S = g.gunpoint.standoff, both = !!S && S.ids.length === 2 && a.aiming && b.aiming;
      await cover(b, 1.5);
      const held = g.gunpoint.held.filter((h) => h.state === 'draw').length === 2 && a.mag === 6 && b.mag === 6 && !a.target && !b.target;
      // lower it: hold H holsters; they stand down
      I.keyDown('KeyH'); await secs(PAD.holdTime + 0.1); I.keyUp('KeyH');
      await secs(GUNPOINT.standDown + 0.6);
      const down = !g.gunpoint.standoff && g.gunpoint.last?.outcome === 'stood down' && a.mag === 6 && b.mag === 6 && !a.target && !b.target;
      // A second pair, and this time you fire.
      cleanup([a, b]); a = b = null;
      c2 = mk(7, 2); d2 = mk(-6, 4);
      await key('KeyH'); await secs(0.6);
      await cover(c2, 1.0); await cover(d2, 1.0);
      const again = !!g.gunpoint.standoff;
      mouseAt(p.x + 3, p.z - 12); await frames(1);
      // The trigger held until the round goes (a one-frame click could land in the gun's cooldown or a stance change).
      I.mouseButton(0, true);
      for (let f = 0; f < 30 && g.gunpoint.last?.outcome !== 'fired'; f++) await frames(1);
      I.mouseButton(0, false); await frames(4);
      const fired = g.gunpoint.last?.outcome === 'fired' && c2.target === p && d2.target === p;
      const ok = both && held && down && again && fired;
      return ok ? true : JSON.stringify({ both, held, down, last: g.gunpoint.last, again, fired, targets: [c2?.target?.id ?? null, d2?.target?.id ?? null] });
    } finally { g.gunpoint.clear(); cleanup([a, b, c2, d2]); }
  }));

  await check('gunpoint: a guard you raise a gun near tenses (and draws the moment you point it at him); a trader will not open the counter while it is up, and will once it is holstered', async () => hush(async () => {
    await stage(); await reset();
    const ike = g.chars.find((c) => c.npc?.id === 'ike' && c.alive), box = ike && [...g.inventory.boxes.values()].find((b) => b.owner === ike.id);
    if (!ike || !box) return `ike: ${!!ike}, a shelf of his: ${!!box}`;
    const keep = { x: ike.x, z: ike.z, hold: ike.hold };
    const guard = person('warden', 9, 0, { hp: 400, weapon: 'smg', hold: 0 });
    guard.face = Math.atan2(g.player.x - guard.x, g.player.z - guard.z);
    try {
      await key('KeyH'); // gun up near the guard
      for (let i = 0; i < 60; i++) { mouseAt(g.player.x - 6, g.player.z - 10); await frames(1); }
      const tense = guard.tenseT > 0;
      for (let i = 0; i < 20; i++) { mouseAt(guard.x, guard.z); await frames(1); }
      const drew = g.gunpoint.entry(guard)?.state === 'draw';
      I.keyDown('KeyH'); await secs(PAD.holdTime + 0.1); I.keyUp('KeyH'); await secs(GUNPOINT.standDown + 0.6);
      cleanup([guard]);
      // Ike at his counter: you walk in with the gun up
      await C('teleport', { x: box.x + 0.8, z: box.z }); ike.hold = true;
      // Ike behind his counter, somewhere he can see you (the shelves stand between some spots)
      let spot = null;
      for (let r = 1.5; r <= 4 && !spot; r += 0.5) for (let k = 0; k < 16 && !spot; k++) {
        const q = { x: g.player.x + Math.cos((k / 16) * Math.PI * 2) * r, z: g.player.z + Math.sin((k / 16) * Math.PI * 2) * r };
        if (!g.statics.pointBlocked(q.x, q.z, 0.45) && g.los(q.x, q.z, g.player.x, g.player.z) && Math.hypot(q.x - box.x, q.z - box.z) < 4.5) spot = q;
      }
      if (!spot) return 'no spot in the shop where Ike can see the counter';
      ike.x = spot.x; ike.z = spot.z;
      await key('KeyH', 1 / 60); await secs(0.2);
      if (g.arms.stance !== 'raised') await secs(0.6);
      for (let i = 0; i < 60; i++) { mouseAt(box.x - 6, box.z + 8); await frames(1); }
      const D1 = g.trade.at(box), refused = !!D1 && D1.refuse;
      I.keyDown('KeyH'); await secs(PAD.holdTime + 0.1); I.keyUp('KeyH');
      await secs(STANCE.relax + 0.5);
      const D2 = g.trade.at(box), open = !!D2 && !D2.refuse;
      const ok = tense && drew && refused && open;
      return ok ? true : JSON.stringify({ tense, guardTense: guard.tenseT, drew, refused, open, ikeTense: ike.tenseT, stance: g.arms.stance });
    } finally { ike.x = keep.x; ike.z = keep.z; ike.hold = keep.hold; g.gunpoint.clear(); cleanup([guard]); }
  }));

  await check('melee: a strike lands at its moment of contact (not the click), a held button kicks a man down, a sprint shoves, three quick strikes chain into a knockdown - and a shambler beaten to death costs no rounds', async () => hush(async () => {
    await stage(); await reset();
    const p = g.player, M = g.melee;
    const dummy = person('drifter', 0, 1.05, { hp: 900 });
    const face = () => { mouseAt(dummy.x, dummy.z); };
    const rmb = async (hold) => { face(); await frames(1); I.mouseButton(2, true); for (let i = 0; i < Math.max(1, Math.round(hold * 60)); i++) { face(); await frames(1); } I.mouseButton(2, false); };
    try {
      for (let i = 0; i < 10; i++) { face(); await frames(1); }
      const hp0 = dummy.hp;
      await rmb(0.03); await frames(1);
      const atClick = dummy.hp; // the blow is still winding up
      await secs(0.5);
      const struck = dummy.hp < hp0 && atClick === hp0 && M.last?.hit === dummy.id;
      p.stamina = 1; dummy.knockT = 0; await secs(0.3);
      await rmb(0.45); await secs(0.5);
      const kicked = M.last?.kind === 'kick' && M.last.knock > 0.5;
      // three quick strikes
      dummy.knockT = 0; p.stamina = 1; await secs(0.6);
      const c0 = M.counts.combos;
      for (let k = 0; k < 3; k++) { await rmb(0.03); await secs(0.42); }
      const combo = M.counts.combos > c0 && dummy.knockT > 0;
      // the shove: sprint at him and swing
      dummy.knockT = 0; p.stamina = 1; await secs(0.8);
      await C('teleport', { x: dummy.x - 5, z: dummy.z }); dummy.hold = true; await frames(2);
      I.keyDown('ShiftLeft'); I.keyDown('KeyD');
      let shoved = false;
      try {
        for (let i = 0; i < 80 && !shoved; i++) {
          face(); await frames(1);
          if (Math.hypot(dummy.x - p.x, dummy.z - p.z) < 1.6 && !M.act) { I.mouseButton(2, true); await frames(1); I.mouseButton(2, false); }
          shoved = M.last?.kind === 'shove' && M.last.hit === dummy.id;
        }
      } finally { I.keyUp('KeyD'); I.keyUp('ShiftLeft'); }
      cleanup([dummy]);
      // a shambler: no rounds spent
      const zid = (await C('spawn', { kind: 'zombie', x: p.x + 1.1, z: p.z, hp: 60 })).ids[0], z = api.findChar(zid);
      z.hold = true; z.zSpeed = 0;
      const mag0 = g.inv.mag[g.inv.current], ammo0 = g.inv.ammo.pistol;
      // Each blow's knockback throws it back: stage it within reach again (this proves the rounds, not the reach).
      for (let k = 0; k < 14 && z.alive; k++) { if (Math.hypot(z.x - p.x, z.z - p.z) > 1.3) { z.x = p.x + 1.1; z.z = p.z; z.vx = z.vz = 0; } p.stamina = 1; mouseAt(z.x, z.z); await rmb(0.03); await secs(0.45); }
      const saved = !z.alive && g.inv.mag[g.inv.current] === mag0 && g.inv.ammo.pistol === ammo0;
      cleanup([z]);
      const ok = struck && kicked && combo && shoved && saved;
      return ok ? true : JSON.stringify({ struck, atClick, hp0, kicked, combo, combos: M.counts.combos, shoved, saved, last: M.last });
    } finally { cleanup([dummy]); }
  }));

  await check('pad: the weapon wheel - RB held opens it over the bar, the right stick picks a slot, the D-pad its mode, letting go takes both', async () => hush(async () => {
    await stage(); await reset();
    await C('give', { weapon: 'smg', smg: 64 });
    await C('equip', { weapon: 'pistol' });
    const W = g.inv.weapons, si = W.indexOf('smg'), n = W.length;
    // Point the stick at the smg's wedge: the fan runs from hard left (slot 1) to hard right.
    const th = Math.PI - ((si + 0.5) / n) * Math.PI, rx = Math.cos(th), ry = -Math.sin(th);
    try {
      pad([0, 0, 0, 0], { rb: 1 }); await secs(PAD.holdTime + 0.15);
      const open = g.arms.radialOpen;
      pad([0, 0, rx, ry], { rb: 1 }); await secs(0.2);
      const hover = g.arms.radialSlot === si;
      pad([0, 0, rx, ry], { rb: 1, right: 1 }); await frames(2); pad([0, 0, rx, ry], { rb: 1 }); await frames(2);
      const modePick = g.arms.radialMode.smg;
      const shown = !document.querySelector('.wradial')?.classList.contains('hidden');
      pad([0, 0, 0, 0], {}); await frames(3);
      const took = !g.arms.radialOpen && g.inv.current === 'smg' && g.arms.modeOf('smg').id === modePick && modePick === 'semi';
      // and a tap of RB is just the next gun
      const before = g.inv.current;
      pad([0, 0, 0, 0], { rb: 1 }); await frames(3); pad(); await frames(3);
      const tap = g.inv.current !== before;
      const ok = open && hover && shown && took && tap;
      return ok ? true : JSON.stringify({ open, hover, slot: g.arms.radialSlot, si, modePick, shown, took, current: g.inv.current, tap });
    } finally { await padOff(); g.arms.setMode('smg', 'auto'); await C('equip', { weapon: 'pistol' }); }
  }));

  await check('hands: holding E at a broken window to board it puts the gun down and both hands on the boards, facing the window - no arm toward the aim while the ring is up - and the gun comes back up after', async () => hush(async () => {
    await reset();
    const Id = g.interiors, p = g.player;
    const inRuins = (o) => Math.max(Math.abs(o.x), Math.abs(o.z)) > 100;
    const clearAt = (o, k) => g.nav.foot.free(o.x + o.nx * k, o.z + o.nz * k) && g.nav.foot.free(o.x - o.nx * k, o.z - o.nz * k);
    const w = Id.windows.find((o) => (o.state === 'intact' || o.state === 'shattered') && inRuins(o) && clearAt(o, 3));
    if (!w) return 'no window in the ruins';
    const was = w.state;
    if (w.state === 'intact') await C('window', { id: w.id, action: 'break' });
    for (const c of [...g.chars]) if (c !== p && !c.npc && Math.hypot(c.x - w.x, c.z - w.z) < 26) g.removeChar(c);
    await C('teleport', { x: w.x + w.nx * 1.1, z: w.z + w.nz * 1.1 }); await frames(3);
    // the gun up, aimed off to the side of the window
    const side = { x: p.x + w.nz * 8, z: p.z - w.nx * 8 };
    // H draws (systems/arms.js drawT): wait for the gun to come up, however slow the frames.
    if (g.arms.stance !== 'raised') await key('KeyH');
    for (let i = 0; i < 60 && !(g.arms.stance === 'raised' && p.aiming); i++) { mouseAt(side.x, side.z); await frames(1); }
    for (let i = 0; i < 4; i++) { mouseAt(side.x, side.z); await frames(1); }
    const up0 = g.arms.stance === 'raised' && p.aiming;
    let sampled = 0, bad = [];
    I.keyDown('KeyE');
    try {
      for (let f = 0; f < 240 && w.state !== 'boarded'; f++) {
        mouseAt(side.x, side.z); await frames(1);
        if (Id.hold > 0.3) {
          sampled++;
          const toWin = Math.atan2(w.x - p.x, w.z - p.z), off = Math.abs(Math.atan2(Math.sin(p.face - toWin), Math.cos(p.face - toWin)));
          if (p.aiming || p._pose !== 'work' || g.arms.stance === 'raised' || off > 0.6) bad.push({ aiming: p.aiming, pose: p._pose, stance: g.arms.stance, off: +off.toFixed(2) });
        }
      }
    } finally { I.keyUp('KeyE'); }
    await frames(4);
    const boarded = w.state === 'boarded', back = g.arms.stance === 'raised' && !p.work;
    try {
      const ok = up0 && sampled > 20 && !bad.length && boarded && back;
      return ok ? true : JSON.stringify({ up0, sampled, bad: bad.slice(0, 3), boarded, back, stance: g.arms.stance });
    } finally {
      if (w.state === 'boarded') await C('window', { id: w.id, action: 'unboard', force: true });
      if (was === 'intact') await C('window', { id: w.id, action: 'repair', force: true });
      g.arms.setStance('lowered');
    }
  }));

  await check('driving: left is left - with Steering set to the car own-left mode, A and the stick pushed left turn the car to its own left (west facing north, east facing south, the same on keys and pad), right is right; reverse pulls away briskly', async () => hush(async () => {
    await stage(); await reset();
    const screen0 = DRIVING.screenSteer; DRIVING.screenSteer = false; // this check is the car's-own-left mode (WEB_WALK_VEHICLES tests screen-left)

    const p = g.player, out = {};
    const v = (await C('spawnVehicle', { type: 'pickup', x: p.x + 4, z: p.z, ai: 'none' })).id, car = api.findVeh(v);
    await C('enterVehicle', { id: v, force: true });
    const turn = async (h, how) => {
      await C('teleport', { x: 280, z: -120 }); car.x = 280; car.z = -120; car.h = h; car.vx = car.vz = 0; car.av = 0; await frames(5);
      const x0 = car.x, z0 = car.z, f0x = Math.sin(h), f0z = Math.cos(h);
      if (how.startsWith('pad')) pad([how === 'padL' ? -1 : 1, 0, 0, 0], { rt: 1 });
      else { I.keyDown('KeyW'); I.keyDown(how); }
      await secs(1.6);
      if (how.startsWith('pad')) pad(); else { I.keyUp('KeyW'); I.keyUp(how); }
      // the car's own left of its starting heading: (cos h, -sin h) in this frame (forward is (sin h, cos h), +x east, +z south)
      const dx = car.x - x0, dz = car.z - z0, leftX = Math.cos(h), leftZ = -Math.sin(h);
      return { left: +((dx * leftX + dz * leftZ)).toFixed(1), fwd: +((dx * f0x + dz * f0z)).toFixed(1), east: +dx.toFixed(1) };
    };
    try {
      out.northA = await turn(Math.PI, 'KeyA'); out.northD = await turn(Math.PI, 'KeyD');
      out.southA = await turn(0, 'KeyA'); out.padNorthL = await turn(Math.PI, 'padL'); out.padNorthR = await turn(Math.PI, 'padR');
      await padOff();
      // reverse from a standstill
      car.vx = car.vz = 0; car.av = 0; car.h = Math.PI; await frames(3);
      I.keyDown('KeyS'); await secs(1.5); I.keyUp('KeyS');
      out.reverse = +g.vehiclesSys.speed(car).toFixed(1);
      const ok = out.northA.east < -2 && out.northA.left > 2 && out.northD.east > 2 && out.southA.east > 2 && out.southA.left > 2 && out.padNorthL.east < -2 && out.padNorthR.east > 2 && out.reverse > car.maxSpeed * 0.3;
      return ok ? true : JSON.stringify(out);
    } finally { DRIVING.screenSteer = screen0; await padOff(); if (p.inVehicle) g.exitVehicle(true); g.vehiclesSys.remove(car); }
  }));

  await check('motorcycle: the rider shoots any way - the pad aims all round and LB fires out in every direction, the rider twisting at the waist', async () => hush(async () => {
    await stage(); await reset();
    const p = g.player, dirs = [], orig = g.combat.hitscan;
    const v = (await C('spawnVehicle', { type: 'bike', x: p.x + 3, z: p.z, ai: 'none' })).id, bike = api.findVeh(v);
    await C('enterVehicle', { id: v, force: true });
    g.combat.hitscan = function (shooter, ox, oz, dx, dz, range, dmg) { if (shooter === p) dirs.push(Math.atan2(dx, dz)); return orig.call(this, shooter, ox, oz, dx, dz, range, dmg); };
    const miss = [];
    try {
      for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI) / 4, rx = Math.sin(a), ry = Math.cos(a);
        g.inv.mag.pistol = 6; p.reloading = 0; dirs.length = 0;
        g.arms.setStance('raised'); // up for each round: a slow frame must not let the calm drop the gun between them (the check is the direction)
        pad([0, 0, rx, ry]); await secs(0.5);
        pad([0, 0, rx, ry], { lb: 1 }); await frames(2); pad([0, 0, rx, ry]); await secs(0.3);
        const got = dirs[0], off = got === undefined ? null : Math.abs(Math.atan2(Math.sin(got - a), Math.cos(got - a)));
        if (off === null || off > 0.25) miss.push({ k, off });
      }
      const twist = p._pose === 'aim';
      return !miss.length && twist ? true : JSON.stringify({ miss, pose: p._pose });
    } finally { g.combat.hitscan = orig; await padOff(); if (p.inVehicle) g.exitVehicle(true); g.vehiclesSys.remove(bike); }
  }));
  void outfit;
}
