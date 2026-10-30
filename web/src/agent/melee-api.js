// HAND TO HAND's commands and checks (systems/melee.js, data/melee.js, docs/design/WEB_MELEE.md).
// The checks drive the player through the real inputs (mouse buttons, keys, the virtual pad) and NPCs through their real
// minds; staging positions and facings is the only shortcut, as for every other check.
import * as THREE from 'three';
import { MELEE_WEAPONS as MW, MELEE_RULES as R, MELEE_AI, validateMelee, WEAPON_IDS } from '../data/melee.js';
import { outfit } from '../systems/characters.js';

const _v = new THREE.Vector3();
const r2 = (v) => +(+v).toFixed(2);

export function meleeCommands(api) {
  const g = api.g;
  const need = (ok, msg) => { if (!ok) throw new Error(msg); };
  const M = () => { need(g.melee, 'no melee system'); return g.melee; };
  const find = (id) => { const c = api.findChar(id); need(c && c.alive, `no living person ${id}`); return c; };
  return {
    fight: {
      group: 'player', desc: `Hand to hand (systems/melee.js; rows in data/melee.js; docs/design/WEB_MELEE.md). FISTS UP is the holstered stance (or no gun): PUNCH (LMB/RT; hold and let go: a heavy), BLOCK (hold RMB/LT; raised inside ${R.parry.window} s of the blow landing it is a PARRY), GRAB (G/X: from behind and unseen the neck - walk them as a shield, hold G to choke, tap to let go; from the front a clinch). action=view (default): what is in your hand, the guard, the arm, holds, the last blow, block and struggle, counts. action=wield weapon=<${WEAPON_IDS.join('|')}> give=true puts it in your pack first (and holsters your gun: fists up). action=attack|heavy|finish id= faces them and swings (waits for it to land). action=grab id= (faces them; the rules still decide neck or clinch). action=release. action=arm id= weapon= gives an NPC a melee weapon (it carries it: its body drops it). action=spawn kind= weapon= x= z= (or dx/dz from you) a fighter with one. action=person id=: their guard, arm, bones, limbs, stagger, holds. action=rows: the weapon table and the validator. action=clear: every fight and hold ended.`,
      args: { action: { type: 'string', default: 'view', enum: ['view', 'wield', 'attack', 'heavy', 'finish', 'grab', 'release', 'arm', 'spawn', 'person', 'rows', 'clear'] },
        id: { type: 'string' }, weapon: { type: 'string' }, give: { type: 'boolean', default: false }, kind: { type: 'string', default: 'raider' }, x: { type: 'number' }, z: { type: 'number' }, dx: { type: 'number' }, dz: { type: 'number' }, hp: { type: 'number' } },
      run: async (a) => {
        const S = M(), p = g.player, act = a.action ?? 'view';
        if (act === 'view') return S.view();
        if (act === 'rows') return { ...validateMelee(), table: Object.fromEntries(Object.entries(MW).map(([k, w]) => [k, { name: w.name, kind: w.kind, hands: w.hands, dmg: w.dmg, windup: w.windup, recover: w.recover, reach: w.reach, knock: w.knock, bone: w.bone, sever: w.sever, bleed: w.bleed, dur: w.dur, finish: w.finish, heavy: w.heavy.mul }])) };
        if (act === 'clear') { S.clear(); return S.view(); }
        if (act === 'wield') {
          const w = a.weapon ?? 'fists'; need(MW[w], `no weapon ${w}; weapons: ${WEAPON_IDS.join(', ')}`);
          if (a.give && MW[w].item && !S.carries(p, w)) g.inventory.add(g.inventory.carried, MW[w].item, 1);
          need(S.wield(w), `you carry no ${MW[w].name.toLowerCase()} (give=true puts one in your pack)`);
          if (p.weapon && g.arms.stance !== 'holstered') g.arms.holster('fists');
          await api._step(2);
          return S.view();
        }
        if (act === 'person') return S.person(find(a.id));
        if (act === 'arm') { const c = find(a.id), w = a.weapon ?? 'bat'; need(MW[w], `no weapon ${w}`); c.meleeW = w === 'fists' ? null : w; return S.person(c); }
        if (act === 'spawn') {
          const w = a.weapon ?? 'bat'; need(MW[w], `no weapon ${w}`);
          const x = a.x ?? p.x + (a.dx ?? 3), z = a.z ?? p.z + (a.dz ?? 0), kind = a.kind ?? 'raider';
          const c = g.addChar({ x, z, faction: kind, weapon: null, colors: outfit(kind), name: `${kind} with a ${MW[w].name.toLowerCase()}`, flag: 'US', hp: a.hp ?? 100 });
          c.home = { x, z }; c.wx = x; c.wz = z; c.face = Math.atan2(p.x - x, p.z - z); c.meleeW = w === 'fists' ? null : w;
          g.society.factions.assign(c);
          return { id: c.id, ...S.person(c) };
        }
        if (act === 'release') { const H = p.m?.hold; need(H, 'you are holding nobody'); S.release(H, 'let go'); return S.view(); }
        // attack | heavy | finish | grab: face them, act, wait for it to land.
        if (a.id) { const c = find(a.id); p.face = Math.atan2(c.x - p.x, c.z - p.z); g.aimOverride = { x: c.x, z: c.z }; }
        try {
          if (act === 'grab') { const r = S.grab(p, a.id ? find(a.id) : null); need(r, 'you cannot grab now'); await api._step(2); return { ...r, ...S.view() }; }
          need(S.fistsUp(), 'fists are not up: holster the gun first (fight action=wield, or hold H)');
          const x = S.attack(p, { heavy: act === 'heavy', kind: act === 'finish' ? 'finish' : undefined });
          need(x, 'you cannot swing now (mid-blow, staggered, held, down)');
          for (let i = 0; i < 120 && p.m?.act === x; i++) await api._step(1);
          return S.view();
        } finally { if (a.id) g.aimOverride = null; }
      },
    },
  };
}

// ---- the selftest checks ---------------------------------------------------------------------------------------------
export async function meleeChecks(x) {
  const { api, g, C, check, stage, person, hush } = x;
  const I = g.input, CT = g.controls, S = g.melee;
  const frames = (n) => api._step(n);
  const secs = (s) => api._step(Math.max(1, Math.round(s * 60)));
  const mouseAt = (x0, z0) => { _v.set(x0, 1.2, z0).project(g.camera); I.mouseMove(((_v.x + 1) / 2) * innerWidth, ((1 - _v.y) / 2) * innerHeight); };
  const cleanup = (list) => { for (const c of list) if (c && g.chars.includes(c)) g.removeChar(c); };
  const fistsUp = async () => { S.clear(); for (const k of [...I.phys]) I.keyUp(k); I.mouseButton(0, false); I.mouseButton(2, false); g.aimOverride = null; g.arms.holster('test'); S.wield('fists'); const m = g.player.m; if (m) { m.arm = 0; m.armBroken = false; m.stagT = 0; m.dur = {}; } await frames(3); };
  const done = async () => { S.clear(); I.mouseButton(0, false); I.mouseButton(2, false); for (const k of [...I.phys]) I.keyUp(k); g.arms.setStance('lowered'); g.godMode = true; await frames(2); };
  // The player faces c through the mouse, every frame of a wait.
  const faceFor = async (c, s) => { for (let i = 0; i < Math.max(1, Math.round(s * 60)); i++) { mouseAt(c.x, c.z); await frames(1); } };
  const tapLmb = async (c, hold = 0.03) => { mouseAt(c.x, c.z); await frames(1); I.mouseButton(0, true); await faceFor(c, hold); I.mouseButton(0, false); await frames(1); };
  // A fighter staged in front of you, looking at you, standing its ground (hold) until its mind is wanted.
  const fighter = (kind, w, dx, dz, extra = {}) => { const c = person(kind, dx, dz, { hp: 900, noGuard: true, ...extra }); c.meleeW = w; c.weapon = null; return c; };
  // An NPC's swing at a target, through its real resolver (the AI's own call), waited until it lands and recovers.
  const npcSwing = async (c, t, heavy = false, onWind = null) => {
    c.face = Math.atan2(t.x - c.x, t.z - c.z);
    const a = S.attack(c, { heavy }); if (!a) return null; a.target = t;
    for (let i = 0; i < 120 && c.m.act === a; i++) { if (onWind) await onWind(a); mouseAt(c.x, c.z); await frames(1); }
    return a;
  };

  await check('melee rows: every weapon row validates (no purple prop), the arm/parry/grab rules sit in range, and PUNCH, BLOCK and GRAB are control rows on the keyboard and the pad', async () => {
    const v = validateMelee();
    const rows = ['punch', 'block', 'grab'].map((id) => CT.byId[id]);
    const bad = validateMelee({ ...MW, x: { ...MW.bat, kind: 'goo', model: { ...MW.bat.model, metal: '#8a2be2' } } });
    const ok = v.ok && rows.every((r) => r && r.keys.length && r.pad.foot) && !bad.ok && bad.errors.some((e) => /purple/.test(e)) && bad.errors.some((e) => /kind goo/.test(e));
    return ok ? true : JSON.stringify({ errors: v.errors, rows: rows.map((r) => r && { id: r.id, keys: r.keys, pad: r.pad }), bad: bad.errors });
  });

  await check('melee block: a bat blocked on bare arms does less than half the damage of an unblocked one, lands on the arms and hurts them', async () => hush(async () => {
    await stage(); await fistsUp();
    const p = g.player, b = fighter('raider', 'bat', 0, 1.3);
    try {
      g.godMode = false;
      const clean = [], blocked = [], hp = [];
      for (let k = 0; k < 4; k++) {
        p.hp = p.maxHp; p.stamina = 1; p.knockT = 0; if (b.m) b.m.sta = 1; p.m.arm = 0; p.m.armBroken = false; p.m.stagT = 0; p.m.vx = p.m.vz = 0; b.x = p.x; b.z = p.z + 1.3; await faceFor(b, 0.2);
        const h0 = p.hp; await npcSwing(b, p); hp.push(r2(h0 - p.hp));
        if (S.last?.by === b.id && !S.last.blocked) clean.push(S.last.dmg);
        await secs(0.3);
      }
      const armHits = [];
      for (let k = 0; k < 4; k++) {
        p.hp = p.maxHp; p.stamina = 1; p.knockT = 0; b.m.sta = 1; p.m.arm = 0; p.m.armBroken = false; p.m.stagT = 0; p.m.vx = p.m.vz = 0; b.x = p.x; b.z = p.z + 1.3;
        I.mouseButton(2, true); await faceFor(b, 0.35); // the guard up well before the blow: a block, not a parry
        await npcSwing(b, p);
        if (S.lastBlock?.by === b.id && S.lastBlock.blocked) { blocked.push(S.lastBlock.dmg); armHits.push(S.lastBlock.arm); }
        I.mouseButton(2, false); await secs(0.4);
      }
      const mean = (a) => a.reduce((s, v) => s + v, 0) / Math.max(1, a.length);
      const ok = clean.length >= 3 && blocked.length === 4 && mean(blocked) < mean(clean) * 0.5 && armHits.every((a) => a > 0) && S.lastBlock.part === 'arms';
      return ok ? true : JSON.stringify({ clean, blocked, armHits, hp, last: S.last, lastBlock: S.lastBlock });
    } finally { cleanup([b]); await done(); }
  }));

  await check('melee parry: a guard raised just as the bat lands turns it aside (no damage) and staggers the swinger open; the next blow on him hits harder', async () => hush(async () => {
    await stage(); await fistsUp();
    const p = g.player, b = fighter('raider', 'bat', 0, 1.3);
    try {
      g.godMode = false; p.hp = p.maxHp; p.stamina = 1; await faceFor(b, 0.2);
      const h0 = p.hp, par0 = S.counts.parried;
      let raised = false;
      // RMB goes down 0.1 s before contact (inside the parry window).
      await npcSwing(b, p, false, async (a) => { if (!raised && a.windup - a.t <= 0.1) { I.mouseButton(2, true); raised = true; } });
      const parried = S.counts.parried === par0 + 1 && p.hp === h0 && S.lastBlock?.parried === true;
      const stag = b.m.stagT, open = b.m.openT;
      I.mouseButton(2, false); await frames(2);
      // While he is open, a punch: x openMul.
      const hpB = b.hp; await tapLmb(b); await secs(0.3);
      const opened = S.last?.hit === b.id && S.last.dmg >= MW.fists.dmg * R.parry.openMul * 0.5 * 0.9;
      const ok = parried && stag > 0.3 && open > 0.3 && opened && b.hp < hpB;
      return ok ? true : JSON.stringify({ parried, h0, hp: p.hp, stag, open, opened, last: S.last, lastBlock: S.lastBlock });
    } finally { cleanup([b]); await done(); }
  }));

  await check('melee grab: from behind an unaware man, G takes the neck (he walks in front of you); from the front it is a clinch the stronger wins; tap G lets go', async () => hush(async () => {
    await stage(); await fistsUp();
    const p = g.player, d = person('drifter', 0, 1.0, { hp: 100 });
    try {
      d.face = Math.atan2(d.x - p.x, d.z - p.z); // looking away from you
      await faceFor(d, 0.2);
      I.keyDown('KeyG'); await frames(2); I.keyUp('KeyG'); await frames(3);
      const neck = p.m.hold?.mode === 'neck' && d.m?.heldBy === p.m.hold;
      // Walk him a step: he stays in front.
      I.keyDown('KeyD'); await secs(0.6); I.keyUp('KeyD'); await frames(2);
      const front = p.m.hold ? Math.hypot(d.x - (p.x + Math.sin(p.face) * R.grab.hold.dist), d.z - (p.z + Math.cos(p.face) * R.grab.hold.dist)) < 0.3 : false;
      await secs(0.3);
      I.keyDown('KeyG'); await frames(3); I.keyUp('KeyG'); await frames(3); // a tap: let go
      const letGo = !p.m.hold && !d.m.heldBy;
      // The front: he looks at you.
      await secs(0.6); S.clear();
      d.x = p.x; d.z = p.z + 1.0; d.face = Math.atan2(p.x - d.x, p.z - d.z); await faceFor(d, 0.2);
      I.keyDown('KeyG'); await frames(2); I.keyUp('KeyG'); await frames(3);
      const clinch = p.m.hold?.mode === 'clinch';
      const ok = neck && front && letGo && clinch;
      return ok ? true : JSON.stringify({ neck, front, letGo, clinch, hold: S.holdView(p.m.hold), dface: r2(d.face), pface: r2(p.face), counts: S.counts });
    } finally { cleanup([d]); await done(); }
  }));

  await check('melee hostage: his armed friend will not fire through the man you hold by the neck; a reckless one does, and the hostage takes it', async () => hush(async () => {
    await stage(); await fistsUp();
    const p = g.player, hostage = person('warden', 0, 0.9, { hp: 400, weapon: null }), shooter = person('warden', 0, 12, { hp: 400 });
    try {
      g.godMode = true;
      hostage.face = Math.atan2(hostage.x - p.x, hostage.z - p.z);
      await faceFor(hostage, 0.15);
      const r = S.grab(p, hostage); await frames(2);
      const neck = r?.mode === 'neck';
      shooter.hold = false; shooter.mag = 30; shooter.target = p; shooter.grudge = p; shooter.state = 'fight'; shooter.tac = null;
      shooter.reckless = false;
      const h0 = hostage.hp, held0 = S.counts.heldFire, mag0 = shooter.mag;
      for (let i = 0; i < 150; i++) { mouseAt(shooter.x, shooter.z); shooter.target = p; shooter.x = p.x; shooter.z = p.z + 12; await frames(1); }
      const spared = hostage.hp === h0 && S.counts.heldFire > held0;
      const careful = { firedRounds: mag0 - shooter.mag, hostageHp: Math.round(hostage.hp) };
      shooter.reckless = true;
      let hit = false;
      for (let i = 0; i < 240 && !hit; i++) { mouseAt(shooter.x, shooter.z); shooter.target = p; shooter.x = p.x; shooter.z = p.z + 12; if (shooter.mag <= 0) shooter.mag = 30; await frames(1); hit = hostage.hp < h0; }
      const ok = neck && spared && hit;
      return ok ? true : JSON.stringify({ neck, spared, careful, hit, hp: [h0, Math.round(hostage.hp)], heldFire: S.counts.heldFire - held0, hold: S.holdView(p.m.hold) });
    } finally { cleanup([hostage, shooter]); await done(); }
  }));

  await check('melee struggle: in a clinch the stronger man wins far more often than not (as holder and as the held)', async () => hush(async () => {
    await stage(); await fistsUp();
    const p = g.player;
    let strongWins = 0, n = 0;
    const list = [];
    try {
      for (let k = 0; k < 10; k++) {
        const a = person('drifter', 6, 1, { hp: 100 }), b = person('drifter', 6, 2, { hp: 100 }); list.push(a, b);
        a.strength = k % 2 ? 1.5 : 0.8; b.strength = k % 2 ? 0.8 : 1.5;
        a.face = Math.atan2(b.x - a.x, b.z - a.z); b.face = Math.atan2(a.x - b.x, a.z - b.z);
        const r = S.grab(a, b);
        if (r?.mode !== 'clinch') continue;
        for (let i = 0; i < 60 * (R.grab.clinch.secs + 0.5) && (a.m.hold || b.m.heldBy); i++) await frames(1);
        const L = S.lastStruggle; n++;
        const strong = a.strength > b.strength ? a : b;
        if (L?.winner === strong.id) strongWins++;
        cleanup([a, b]);
      }
      const ok = n >= 8 && strongWins >= Math.ceil(n * 0.7);
      return ok ? true : JSON.stringify({ n, strongWins, last: S.lastStruggle });
    } finally { cleanup(list); await done(); }
  }));

  await check('melee finish: a man knocked down by a bat is finished where he lies (PUNCH on a downed body is the finisher)', async () => hush(async () => {
    await stage(); await fistsUp();
    const p = g.player, r = fighter('raider', null, 0, 1.2, { hp: 60 });
    try {
      g.inventory.add(g.inventory.carried, 'baseball_bat', 1); S.wield('bat'); await frames(2);
      r.knockT = 0; r.knockMax = 0;
      // Swing until he is down (a bat's knockdown is a chance), then the finisher.
      for (let k = 0; k < 8 && !(r.knockT > 0) && r.alive; k++) { r.hp = 60; p.stamina = 1; r.x = p.x; r.z = p.z + 1.2; if (r.m) r.m.vx = r.m.vz = 0; await tapLmb(r); await secs(0.85); }
      const down = r.knockT > 0 || !r.alive;
      if (r.alive) { r.knockT = Math.max(r.knockT, 3); r.knockMax = r.knockT; r.x = p.x; r.z = p.z + 1.2; if (r.m) r.m.vx = r.m.vz = 0; } // he stays down where you stand over him (staging)
      const f0 = S.counts.finishers; p.stamina = 1; r.hp = 60;
      await tapLmb(r); await secs(0.9);
      const finished = S.counts.finishers === f0 + 1 && S.last?.kind === 'finish' && !r.alive;
      const ok = down && finished;
      return ok ? true : JSON.stringify({ down, finished, last: S.last, hp: r.hp, knockT: r.knockT });
    } finally { cleanup([r]); const i = g.inventory.carried.slots.findIndex((s) => s.id === 'baseball_bat'); if (i >= 0) g.inventory.take(g.inventory.carried, i, 1); await done(); }
  }));

  await check('melee knuckles: six jabs in brass knuckles out-damage six bare-fisted jabs', async () => hush(async () => {
    await stage(); await fistsUp();
    const p = g.player, d = person('drifter', 0, 1.0, { hp: 2000, noGuard: true });
    try {
      const jab = async () => { let t = 0; for (let k = 0; k < 6; k++) { p.stamina = 1; d.knockT = 0; d.hp = 2000; const h0 = d.hp; await tapLmb(d); await secs(0.4); t += h0 - d.hp; d.x = p.x; d.z = p.z + 1.0; } return t; };
      const bare = await jab();
      g.inventory.add(g.inventory.carried, 'brass_knuckles', 1); S.wield('knuckles'); await secs(0.8);
      const brass = await jab();
      const ok = bare > 0 && brass > bare * 1.3 && S.last?.weapon === 'knuckles';
      return ok ? true : JSON.stringify({ bare: Math.round(bare), brass: Math.round(brass), last: S.last });
    } finally { cleanup([d]); const i = g.inventory.carried.slots.findIndex((s) => s.id === 'brass_knuckles'); if (i >= 0) g.inventory.take(g.inventory.carried, i, 1); await done(); }
  }));

  await check('melee machete: heavy machete blows bleed a man and take a limb off (the pose drops it); a blade blocked on bare arms cuts them', async () => hush(async () => {
    await stage(); await fistsUp();
    const p = g.player, d = person('drifter', 0, 1.1, { hp: 3000, noGuard: true });
    try {
      g.inventory.add(g.inventory.carried, 'machete', 1); S.wield('machete'); await frames(2);
      let off = null;
      for (let k = 0; k < 30 && !off; k++) {
        p.stamina = 1; d.knockT = 0; d.hp = 3000; d.x = p.x; d.z = p.z + 1.1;
        mouseAt(d.x, d.z); await frames(1); I.mouseButton(0, true); await faceFor(d, R.heavyAt + 0.05); I.mouseButton(0, false); await faceFor(d, 0.9);
        if (S.last?.severed) off = S.last.severed;
      }
      const lostShown = !!off && !!d.lost?.[off] && (off.endsWith('arm') ? d.lostArm === off : d.lostLeg === off);
      const bled = d.bleed > 0.5;
      // The blade on bare arms: a raider's machete on your guard opens your arms.
      cleanup([d]);
      const r = fighter('raider', 'machete', 0, 1.3); await fistsUp();
      g.godMode = false; p.hp = p.maxHp; p.bleed = 0; p.knockT = 0;
      I.mouseButton(2, true); await faceFor(r, 0.35); await npcSwing(r, p); I.mouseButton(2, false);
      const cut = S.lastBlock?.blocked && p.bleed > 0;
      cleanup([r]);
      const ok = off && lostShown && bled && cut;
      return ok ? true : JSON.stringify({ off, lostShown, lost: d.lost, bled: r2(d.bleed), cut, lastBlock: S.lastBlock });
    } finally { cleanup([d]); const i = g.inventory.carried.slots.findIndex((s) => s.id === 'machete'); if (i >= 0) g.inventory.take(g.inventory.carried, i, 1); g.player.bleed = 0; await done(); }
  }));

  await check('melee ai: a raider with a pipe closes and swings by the same rules; one that creeps up behind you takes your neck, and mashing breaks free', async () => hush(async () => {
    await stage(); await fistsUp();
    const p = g.player, list = [];
    try {
      g.godMode = true;
      const a = fighter('raider', 'pipe', 5, 0); a.hold = false; a.face = Math.atan2(p.x - a.x, p.z - a.z); list.push(a);
      const s0 = S.counts.swings;
      let swung = false;
      for (let i = 0; i < 300 && !swung; i++) { await frames(1); swung = S.counts.swings > s0 && a.m?.act?.wid === 'pipe' || (S.last?.by === a.id); }
      const closed = Math.hypot(a.x - p.x, a.z - p.z) < MW.pipe.reach + 0.6;
      cleanup([a]); await secs(0.2); S.clear();
      // Behind you, you looking away: he creeps in.
      const k = fighter('raider', 'knife', 0, -5); k.hold = false; list.push(k); k.m = null;
      p.face = 0; const fwd = { x: p.x, z: p.z + 6 }; p.hp = p.maxHp; p.knockT = 0; if (p.m) { p.m.armBroken = false; p.m.arm = 0; }
      for (let i = 0; i < 20; i++) { mouseAt(fwd.x, fwd.z); await frames(1); }
      const g0 = S.counts.npcGrabs;
      k.target = p; S.think(k, 0); k.m.plan = 'grab';
      let grabbed = false;
      for (let i = 0; i < 600 && !grabbed; i++) { mouseAt(fwd.x, fwd.z); if (k.m.plan !== 'grab' && !k.m.hold) k.m.plan = 'grab'; await frames(1); grabbed = p.m?.heldBy?.a === k; }
      const neck = grabbed && p.m.heldBy.mode === 'neck' && S.counts.npcGrabs > g0;
      // Mash to break free.
      let free = false;
      const samples = [];
      for (let i = 0; i < 600 && grabbed && !free; i++) { if (i % 5 === 0) I.mouseButton(0, true); else if (i % 5 === 2) I.mouseButton(0, false); p.stamina = 1; await frames(1); free = !p.m.heldBy; if (i % 60 === 30) samples.push({ ...S.holdView(p.m.heldBy), mash: r2(S.mashRate), knockT: r2(p.knockT ?? 0), hp: Math.round(p.hp) }); }
      I.mouseButton(0, false);
      const broke = free && S.lastStruggle?.winner === p.id;
      const ok = swung && closed && neck && broke;
      return ok ? true : JSON.stringify({ swung, closed, neck, grabbed, broke, free, samples, struggle: S.lastStruggle, kPlan: k.m?.plan, kd: r2(Math.hypot(k.x - p.x, k.z - p.z)) });
    } finally { cleanup(list); await done(); }
  }));
}
