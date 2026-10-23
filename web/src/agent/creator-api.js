import { CREATOR, ATTRS, ATTR_COST, TRAITS, FLAWS, BACKGROUNDS, SKIN, tally, validate, cleanPicks, freshPicks } from '../data/creator.js';
import { ITEMS } from '../data/items.js';

// THE CREATOR's agent face (docs/design/WEB_CREATOR.md): drive the screen headless - set fields, buy and refund points,
// randomize, press pad buttons or keys through it, BEGIN - and read the sheet the player was made from. Plus its
// selftest checks. Kept out of api.js so the creator's rows and checks travel together.
const fail = (msg) => { throw new Error(msg); };
const need = (c, msg) => { if (!c) fail(msg); };
const r3 = (x) => Math.round(x * 1000) / 1000;
const PAD_TOKENS = ['a', 'b', 'x', 'y', 'lb', 'rb', 'lt', 'rt', 'back', 'start', 'up', 'down', 'left', 'right', 'lsup', 'lsdown', 'lsleft', 'lsright'];

// Press a list of pad tokens through the screen: each one down for two frames, then up for two (a real press has an
// edge both ways). "right*3" repeats; "ls<dir>" is the left stick pushed that way.
function padPresses(ui, list) {
  const toks = String(list).split(/[\s,]+/).filter(Boolean).flatMap((t) => { const [k, n] = t.split('*'); return Array(Math.max(1, Math.min(40, Number(n) || 1))).fill(k.toLowerCase()); });
  for (const t of toks) need(PAD_TOKENS.includes(t), `unknown pad token "${t}" (${PAD_TOKENS.join(' ')}; "right*3" repeats)`);
  const before = ui.pressed;
  for (const t of toks) {
    if (!ui.open_ && !document.querySelector('.title .cr-make')) break;
    const stick = t.startsWith('ls') ? t.slice(2) : null;
    const axes = [stick === 'left' ? -1 : stick === 'right' ? 1 : 0, stick === 'up' ? -1 : stick === 'down' ? 1 : 0, 0, 0];
    ui.virtual = { axes, buttons: stick ? {} : { [t]: 1 } };
    for (let i = 0; i < 2; i++) { if (ui.open_) ui.padFrame(1 / 60); else ui.pollTitle(); }
    ui.virtual = { axes: [0, 0, 0, 0], buttons: {} };
    for (let i = 0; i < 2; i++) { if (ui.open_) ui.padFrame(1 / 60); else ui.pollTitle(); }
  }
  ui.virtual = null;
  return { tokens: toks.length, handled: ui.pressed - before };
}

function keyPresses(list) {
  const toks = String(list).split(/[\s,]+/).filter(Boolean).flatMap((t) => { const [k, n] = t.split('*'); return Array(Math.max(1, Math.min(40, Number(n) || 1))).fill(k); });
  for (const code of toks) {
    // From the page body, as a real key arrives: the screen's capture-phase listener on the window sees it first.
    const at = document.activeElement && document.activeElement !== document.body ? document.activeElement : document.body;
    at.dispatchEvent(new KeyboardEvent('keydown', { code, key: code.replace(/^Key/, '').toLowerCase(), bubbles: true, cancelable: true }));
    at.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
  }
  return { keys: toks.length };
}

export function creatorCommands(api) {
  const g = api.g;
  const sheetView = () => {
    const C = g.creator, p = g.player, S = g.skills, fx = g.sheet?.fx ?? null;
    return {
      made: !!C.sheet, picks: C.sheet ? C.save() : null, fx,
      player: { name: p.name, flag: p.flag, hudFlag: g.hud?.s?.flag ?? null, nameTape: g.hud?.el?.flag?.querySelector('.cr-tape')?.textContent ?? null, maxHp: p.maxHp, hp: Math.round(p.hp), build: p.build ?? null, colors: { ...p.colors } },
      skills: { ...g.skillsSys.lv },
      consumers: { carryKg: r3(S.carryKg), spreadMul: r3(S.spreadMul), reloadMul: r3(S.reloadMul), sprintDrainMul: r3(S.sprintDrainMul), speedMul: r3(S.speedMul),
        seenMul: r3(g.gear.seenMul()), repairMul: r3(g.gear.repairMul()), luckRolls: g.gear.luckRolls(), wakeR: r3(12 * (fx?.wakeMul ?? 1)), priceMul: r3(fx?.priceMul ?? 1), drain: fx?.drain ?? { water: 1, food: 1, rest: 1 } },
      kit: { pack: g.inventory.worn, carried: g.inventory.carried.slots.map((s) => [s.id, s.n]), guns: g.inv.weapons, mag: { ...g.inv.mag }, ammo: Object.fromEntries(Object.keys(g.inv.ammo).map((k) => [k, g.inv.ammo[k]])), worn: g.gear.save().worn, cash: g.cash },
    };
  };
  return {
    creator: {
      group: 'player', budget: 60,
      desc: 'THE CREATOR (docs/design/WEB_CREATOR.md; rows in data/creator.js): make a survivor by point-buy, headless or on the screen. No args: the draft - picks, the points (pool, spent on attributes and good traits, paid back by flaws, left), the errors that hold BEGIN, the live numbers it moves, starting skills, the kit, who knows you, the screen (open, step, focused row). In one call, in this order: reset=true (a fresh draft); open=true (the screen; the title\'s MAKE A SURVIVOR does it in the game); set={name, flag, state, background} and look={build, skin, hair, hairStyle, hat, face, scar, scarStory, shirt, pants, boots, sleeves}; attr=<strength|endurance|dexterity|perception|wits|nerve> with rank=<1-6> or delta=+1/-1 (refused when it would overspend: ok false, nothing changed; a refund gives back exactly what the rank cost); trait=<id> on=true|false (good ones cost, flaws pay back; the caps and clashes are refused); randomize=true seed= (inside the budget); step=<origin|background|attributes|traits|look|kit>; press="a,rb,right*2,lsdown,start" (pad buttons through the open screen, or A / X on the title: the pad alone can finish it); keys="ArrowDown,Enter" (keyboard codes through the screen); begin=true (the draft becomes the player: skills, kit into the pack, gear worn, look, flag and name on the HUD, who knows you; start=false skips the start place); close=true. Lists: backgrounds=true, traits=true.',
      args: { reset: { type: 'boolean' }, open: { type: 'boolean' }, close: { type: 'boolean' }, set: { type: 'object' }, look: { type: 'object' }, attr: { type: 'string' }, rank: { type: 'number' }, delta: { type: 'number' },
        trait: { type: 'string' }, on: { type: 'boolean' }, randomize: { type: 'boolean' }, seed: { type: 'number' }, step: { type: 'string' }, press: { type: 'string' }, keys: { type: 'string' },
        begin: { type: 'boolean' }, start: { type: 'boolean', default: true }, backgrounds: { type: 'boolean' }, traits: { type: 'boolean' } },
      run: async (a) => {
        const C = g.creator, U = g.creatorUI, out = {};
        if (a.backgrounds) return { backgrounds: BACKGROUNDS.map((b) => ({ id: b.id, label: b.label, skills: b.skills, kit: b.kit, knowing: b.knowing })) };
        if (a.traits) return { good: TRAITS.map((t) => ({ id: t.id, label: t.label, cost: t.cost, does: t.d, fx: t.fx, not: t.not ?? [] })), flaws: FLAWS.map((t) => ({ id: t.id, label: t.label, refund: t.refund, does: t.d, fx: t.fx })), rules: { ...CREATOR } };
        if (a.reset) C.reset();
        if (a.open && !U.open_) U.open({});
        if (a.set || a.look) { const r = C.set({ ...(a.set ?? {}), ...(a.look ? { look: a.look } : {}) }); need(r.ok, r.why); if (r.ignored) out.ignored = r.ignored; }
        if (a.attr !== undefined) {
          need(a.rank !== undefined || a.delta !== undefined, 'attr= needs rank= or delta=');
          const r = a.rank !== undefined ? C.setRank(a.attr, a.rank) : C.bump(a.attr, a.delta);
          need(r.ok, r.why); out.cost = r.cost;
        }
        if (a.trait !== undefined) { const r = C.setTrait(a.trait, a.on); need(r.ok, r.why); out.cost = r.cost; }
        if (a.randomize) out.randomized = C.randomize(a.seed !== undefined ? a.seed : undefined).seed;
        if (a.step !== undefined) { need(U.open_, 'step= needs the screen open (open=true)'); const i = ['origin', 'background', 'attributes', 'traits', 'look', 'kit'].indexOf(a.step); need(i >= 0, `no step "${a.step}"`); U.goStep(i); }
        if (U.open_ && (a.set || a.look || a.attr || a.trait || a.randomize || a.reset)) U.refresh();
        if (a.press) out.pad = padPresses(U, a.press);
        if (a.keys) { need(U.open_, 'keys= needs the screen open (open=true)'); out.keyboard = keyPresses(a.keys); }
        if (a.begin) {
          const r = U.open_ ? U.begin() : C.begin(C.draft, { start: a.start });
          need(r.ok, `not ready: ${(r.errors ?? []).join(' ')}`);
          if (!U.open_ && document.querySelector('.title .play') && a.start) document.querySelector('.title .play').click();
          if (a.start) g.paused = false;
          out.begun = r;
        }
        if (a.close && U.open_) U.close(false);
        const V = C.view();
        return { ...out, ...V, ui: U.view() };
      },
    },
    sheet: {
      group: 'player',
      desc: 'The sheet the player was made from (THE CREATOR, docs/design/WEB_CREATOR.md): made (false: the engine\'s default drifter, no numbers moved), the picks, fx (every number it moves: 1 / 0 is no change), the player as it stands (name, flag, the HUD\'s flag and name tape, max hp, build, colours), skill levels, the live consumers (carry, spread - the night one included after dark - reload, sprint drain, speed, how close a hostile spots you, repairs, luck rolls, the sleep wake radius, counter prices, need drains), and the kit (pack, what is carried, guns, rounds, what is worn, scrip). clear=true goes back to the default drifter look and numbers (what you carry stays).',
      args: { clear: { type: 'boolean' } },
      run: async ({ clear }) => { if (clear) g.creator.clear(); return sheetView(); },
    },
  };
}

// ---- the checks -------------------------------------------------------------------------------------------------------
export async function creatorChecks({ api, g, C, check, snapshot, restore, stage, hush }) {
  const save0 = snapshot(g), U = g.creatorUI, K = g.creator;
  const closeUI = () => { if (U.open_) U.close(false); U.virtual = null; };
  try {
    await check('creator: point-buy never overspends, and a refund gives back exactly what the rank cost', async () => {
      closeUI(); await C('creator', { reset: true });
      const left0 = K.left(), seen = [];
      let refused = null;
      for (let i = 0; i < 30; i++) {
        const k = ATTRS[i % ATTRS.length].k, r = await C('creator', { attr: k, delta: 1 });
        if (!r.ok) { refused = { k, err: r.error, rank: K.draft.attrs[k] }; break; }
        seen.push(r.tally.left);
      }
      const leftEnd = K.left(), neverNeg = seen.every((x) => x >= 0) && leftEnd >= 0;
      const spent = ATTRS.reduce((s, a) => s + ATTR_COST[K.draft.attrs[a.k]], 0);
      const books = spent === CREATOR.pool - leftEnd; // no traits: every point spent is in the ranks
      // straight to rank 6 with what is left: refused, nothing moves
      const k6 = ATTRS.find((a) => K.draft.attrs[a.k] < CREATOR.rankMax)?.k, was = { ...K.draft.attrs };
      const r6 = await C('creator', { attr: k6, rank: 6 });
      const unchanged = JSON.stringify(was) === JSON.stringify(K.draft.attrs);
      // refund one rank: exactly its step back
      const kr = ATTRS.find((a) => K.draft.attrs[a.k] > 2).k, rr = K.draft.attrs[kr], l1 = K.left();
      const back = await C('creator', { attr: kr, delta: -1 });
      const refundOk = back.ok && K.left() - l1 === ATTR_COST[rr] - ATTR_COST[rr - 1];
      const ok = left0 === CREATOR.pool - 6 * ATTR_COST[CREATOR.rankStart] && !!refused && /left/.test(refused.err) && neverNeg && books && !r6.ok && unchanged && refundOk;
      return ok ? true : JSON.stringify({ left0, refused, leftEnd, neverNeg, books, r6: r6.ok, unchanged, refundOk, back: back.error ?? back.cost });
    });
    await check('creator: a flaw buys points back, a good trait costs, and the caps and clashes hold', async () => {
      await C('creator', { reset: true });
      const l0 = K.left();
      const f = await C('creator', { trait: 'bad_back', on: true }); const lf = K.left();
      const off = await C('creator', { trait: 'bad_back', on: false }); const lo = K.left();
      const good = await C('creator', { trait: 'steady', on: true }); const lg = K.left();
      const clash = await C('creator', { trait: 'the_shakes', on: true }); // steady hands and the shakes
      // three flaws pay 5+4+4 = 13: capped at 12; a fourth is refused
      await C('creator', { trait: 'marked', on: true }); await C('creator', { trait: 'night_blind', on: true }); await C('creator', { trait: 'bad_back', on: true });
      const T = tally(K.draft), fourth = await C('creator', { trait: 'fumbler', on: true });
      // spend everything, then a good trait it cannot pay for is refused
      for (const a of ATTRS) for (let i = 0; i < 4; i++) await C('creator', { attr: a.k, delta: 1 });
      const broke = K.left(), dear = TRAITS.find((t) => t.cost > broke && !K.draft.traits.includes(t.id) && !(t.not ?? []).some((x) => K.draft.traits.includes(x)));
      const cant = dear ? await C('creator', { trait: dear.id, on: true }) : { ok: false, error: 'left' };
      const ok = f.ok && lf - l0 === 4 && off.ok && lo === l0 && good.ok && l0 - lg === 5 && !clash.ok && /cannot both/.test(clash.error)
        && T.refundRaw === 13 && T.refund === CREATOR.refundCap && !fourth.ok && !cant.ok && K.left() >= 0 && validate(K.draft).every((e) => !/Over/.test(e));
      return ok ? true : JSON.stringify({ l0, lf, lo, lg, clash: clash.error, refund: T, fourth: fourth.error, broke, cant: cant.error, left: K.left() });
    });
    await check('creator: randomize always lands inside the budget with 1-3 flaws (200 seeds)', async () => {
      let bad = null;
      for (let s = 1; s <= 200 && !bad; s++) {
        K.randomize(s * 7919);
        const e = validate(K.draft), T = tally(K.draft), fl = K.draft.traits.filter((x) => FLAWS.some((f) => f.id === x)).length;
        if (e.length || T.left < 0 || fl < 1 || fl > 3) bad = { seed: s * 7919, e, T, fl };
      }
      return bad ? JSON.stringify(bad) : true;
    });
    let made = null;
    await check('creator: BEGIN makes the player from the rows - skills, kit in the pack, gear worn, the look on the body, the flag and name on the HUD, max hp, who knows you', async () => hush(async () => {
      await stage();
      closeUI(); await C('creator', { reset: true });
      const F = g.society.factions, rh0 = F.standing[F.index.rusthaven], kenji0 = g.society.memory.entry('kenji').mems.length, mags0 = g.society.memory.entry('mags').mems.length;
      const look = { build: 'broad', skin: 5, hairStyle: 'mohawk', hair: 7, face: 'goggles', scar: 'cheek', scarStory: 2, shirt: 3, pants: 2, boots: 1, sleeves: 'short' };
      const setr = await C('creator', { set: { name: 'Mara Quill', flag: 'HT', state: 'FL', background: 'mechanic' }, look });
      await C('creator', { attr: 'strength', rank: 4 }); await C('creator', { attr: 'endurance', rank: 3 }); await C('creator', { attr: 'wits', rank: 3 });
      await C('creator', { trait: 'bad_back', on: true }); await C('creator', { trait: 'thick_skin', on: true });
      const leftAtBegin = K.left();
      const b = await C('creator', { begin: true, start: false });
      if (!setr.ok || !b.ok) return JSON.stringify({ set: setr.error, begin: b.error });
      const p = g.player, sv = (await C('sheet')), has = (id, n) => g.inventory.carried.slots.some((s) => s.id === id && s.n >= n);
      const skills = g.skillsSys.lv.strength === 4 && g.skillsSys.lv.endurance === 2 && g.skillsSys.lv.dexterity === 1;
      const kit = g.inventory.worn === 'backpack' && has('wrench', 1) && has('duct_tape', 1) && has('spark_plugs', 2) && has('scrap', 2) && has('water_bottle', 1)
        && g.inv.weapons.join() === 'pistol' && g.inv.mag.pistol === 6 && g.inv.ammo.pistol === 12 && Math.abs(g.inv.cond.pistol - 0.8) < 1e-9;
      const gear = g.gear.worn.bracelet === 'mechanic_wraps' && g.gear.worn.hands === 'work_gloves';
      const lookOk = p.colors.skin === SKIN[5] && p.colors.hatStyle === 'mohawk' && p.colors.accStyle === 'goggles' && p.colors.scar === 'cheek' && p.colors.sleeves === 'short' && p.build?.w === 1.09;
      const flag = p.flag === 'HT' && g.hud.s.flag === 'HT' && sv.player.nameTape === 'MARA QUILL' && p.name === 'Mara Quill';
      const hp = p.maxHp === 100 + 4 + 10 && p.hp === p.maxHp;
      const carry = Math.abs(g.skills.carryKg - (24 + 3.5 * 4 + (g.roles.perk.carryKg ?? 0) + g.gear.carryKg() - 6)) < 1e-6;
      const repair = Math.abs(g.gear.repairMul() - (1 + 0.1 + 0.05)) < 1e-6; // the wraps' 0.1 and WITS 3's 0.05
      const knows = Math.abs(F.standing[F.index.rusthaven] - Math.min(100, rh0 + 4)) < 1e-6
        && g.society.memory.entry('kenji').mems.some((m) => m.kind === 'helped') && g.society.memory.entry('mags').mems.some((m) => m.kind === 'traded') && kenji0 >= 0 && mags0 >= 0;
      const cash = g.cash === CREATOR.cashBase + 15 + leftAtBegin * CREATOR.scripPerPoint;
      // the scar and the build reach the renderer: the scar variant has an instance this frame
      g.charR.sync(g.chars, 0); const scarDrawn = g.charR.packed.scar_cheek >= 1;
      made = snapshot(g);
      const ok = skills && kit && gear && lookOk && flag && hp && carry && repair && knows && cash && scarDrawn && sv.made;
      return ok ? true : JSON.stringify({ skills: g.skillsSys.lv, kit, carried: sv.kit.carried, worn: g.inventory.worn, guns: sv.kit.guns, mag: g.inv.mag, ammo: g.inv.ammo.pistol, gear: g.gear.worn, lookOk, colors: p.colors, build: p.build, flag, hud: g.hud.s.flag, tape: sv.player.nameTape, hp: [p.hp, p.maxHp], carry: g.skills.carryKg, repair: g.gear.repairMul(), knows, cash: [g.cash, leftAtBegin], scarDrawn });
    }));
    await check('creator: the made character survives a save and a load (JSON round trip): sheet, look, flag, hp, skills, kit and gear', async () => {
      if (!made) return 'no made character (the BEGIN check failed)';
      const s = JSON.parse(JSON.stringify(made));
      const want = { picks: JSON.stringify(s.sheet), lv: JSON.stringify(s.skills.lv), carried: JSON.stringify(s.inventory.carried), worn: JSON.stringify(s.gear.worn) };
      // wreck it: back to the default drifter, a different kit
      K.clear(); g.gear.load({ worn: {} }); g.inventory.carried.slots = []; g.skillsSys.lv.strength = 0; g.player.maxHp = 100;
      const cleared = !g.sheet && g.player.name !== 'Mara Quill';
      const r = await C('load', { save: s });
      const p = g.player;
      const ok = r.ok && cleared && JSON.stringify(K.save()) === want.picks && p.name === 'Mara Quill' && p.flag === 'HT' && g.hud.s.flag === 'HT' && p.colors.scar === 'cheek' && p.build?.w === 1.09
        && p.maxHp === 114 && JSON.stringify(g.skillsSys.save().lv) === want.lv && JSON.stringify(g.inventory.save().carried) === want.carried && JSON.stringify(g.gear.save().worn) === want.worn
        && Math.abs(g.gear.repairMul() - 1.15) < 1e-6 && g.sheet?.fx.carryKg === -6;
      // and a save from before the creator (no sheet key) leaves you as you are; one with sheet null clears you
      const old = JSON.parse(JSON.stringify(made)); delete old.sheet;
      await C('load', { save: old }); const keeps = g.player.name === 'Mara Quill';
      const none = JSON.parse(JSON.stringify(made)); none.sheet = null;
      await C('load', { save: none }); const clears = !g.sheet && g.player.name !== 'Mara Quill' && !g.player.build;
      await C('load', { save: s });
      return ok && keeps && clears ? true : JSON.stringify({ r: r.error, cleared, picks: JSON.stringify(K.save()) === want.picks, name: p.name, flag: p.flag, hp: p.maxHp, lv: g.skillsSys.save().lv, keeps, clears });
    });
    await check('creator: each trait moves its one consumer - carry, speed, reload, spread (and after dark), seen, repairs, luck, need drains, counter prices', async () => hush(async () => {
      await stage();
      const base = cleanPicks({ ...freshPicks(), name: 'Test Subject', traits: ['heavy_footed'] });
      const read = (traits) => {
        K.applyIdentity(cleanPicks({ ...base, traits }));
        g.skillsSys.recompute();
        return { carry: g.skills.carryKg, speed: g.skills.speedMul, reload: g.skills.reloadMul, spread: g.skills.spreadMul, seen: g.gear.seenMul(), repair: g.gear.repairMul(), luck: g.gear.luckRolls(), drain: g.sheet.fx.drain, sprint: g.skills.sprintDrainMul };
      };
      await C('setTime', { hour: 12 });
      const a = read(['heavy_footed']), b = read(['pack_mule', 'fleet', 'quick_hands', 'steady', 'tinker', 'lucky', 'iron_gut', 'bad_back']);
      const near = (x, y) => Math.abs(x - y) < 1e-6;
      const day = near(b.carry - a.carry, 5 - 6) && near(b.speed / a.speed, 1.04) && near(b.reload / a.reload, 0.9) && near(b.spread / a.spread, 0.92) && near(a.seen / b.seen, 1.12)
        && near(b.repair - a.repair, 0.12) && b.luck - a.luck === 1 && near(b.drain.food, 0.85);
      // after dark: night eyes against night-blind (the same nerve)
      await C('setTime', { hour: 23 }); await C('step', { seconds: 0.6 });
      const ne = read(['night_eyes', 'the_shakes']), nb = read(['night_blind', 'steady']);
      const night = near(ne.spread / nb.spread, (0.85 * 1.1) / (1.3 * 0.92));
      await C('setTime', { hour: 12 }); await C('step', { seconds: 0.6 });
      // food drains slower on an iron gut: the same game time on the clock, from full
      // (one survival tick of 30 s each, standing still at the same hour: a step's frames let a settling player's speed
      // count as sprinting, which drains on its own)
      const N = g.needs, p0 = g.player, eat = (traits) => { read(traits); p0.speed = 0; N.food = 1; N.water = 1; g.survival.update(30); return 1 - N.food; };
      const fIron = eat(['iron_gut', 'heavy_footed']), fNone = eat(['heavy_footed']), fBig = eat(['big_appetite']);
      const drainOk = fNone > 0 && Math.abs(fIron / fNone - 0.85) < 1e-6 && Math.abs(fBig / fNone - 1.2) < 1e-6;
      // prices at a trader's counter (Ike's, or whoever keeps one standing): a silver tongue against a sour face
      let price = 'no counter';
      for (const id of ['ike', 'kenji', 'mags', 'reyes']) {
        const c = g.chars.find((x) => x.npc?.id === id && x.alive), box = c && [...g.inventory.boxes.values()].find((x) => x.owner === c.id);
        if (!box) continue;
        const sl = c.sleeping; c.sleeping = false;
        g.player.x = c.x + 0.6; g.player.z = c.z;
        read(['silver_tongue', 'heavy_footed']); const lo = g.trade.at(box)?.buy;
        read(['sour_face']); const hi = g.trade.at(box)?.buy;
        c.sleeping = sl;
        price = lo && hi ? near(hi / lo, 1.06 / 0.94) : `${id}: buy ${lo} / ${hi}`;
        if (price === true) break;
      }
      await stage();
      return day && night && drainOk && price === true ? true : JSON.stringify({ a, b, ne: ne.spread, nb: nb.spread, fIron, fNone, fBig, price });
    }));
    await check('creator: a heavy sleeper sleeps through what wakes a light sleeper (the wake radius is the PERCEPTION and the trait)', async () => hush(async () => {
      const S = g.survival, N = g.needs, p = g.player;
      const trial = async (traits) => {
        await stage();
        K.applyIdentity(cleanPicks({ ...freshPicks(), name: 'Test Sleeper', traits }));
        N.rest = 0.3; N.water = 0.9; N.food = 0.9; N.fever = null;
        const lay = S.sleepAt('ground');
        const z = g.zombies.spawn(p.x + 10, p.z, false); z.zSpeed = 0; z.hold = true;
        for (let i = 0; i < 8 && S.sleep; i++) await C('step', { seconds: 0.25 });
        const asleep = !!S.sleep;
        if (S.sleep) S.wake('test');
        g.removeChar(z);
        return { lay: lay.ok, asleep };
      };
      const heavy = await trial(['heavy_sleeper']), light = await trial(['light_sleeper', 'heavy_footed']);
      return heavy.lay && light.lay && heavy.asleep && !light.asleep ? true : JSON.stringify({ heavy, light });
    }));
    await check('creator: the pad alone makes a character - roll a name, a flag, a background, a rank, a good trait, a flaw, a look, START to BEGIN', async () => hush(async () => {
      await stage();
      closeUI(); K.reset(); K.clear();
      const o = await C('creator', { open: true });
      if (!o.ok || !U.open_) return `open: ${o.error ?? 'not open'}`;
      const steps = [];
      const P = async (seq) => { const r = await C('creator', { press: seq }); steps.push([seq, r.ui?.step, r.ui?.row, r.pad?.handled]); return r; };
      await P('a');                         // NAME: A rolls one
      await P('down,right');                // COUNTRY: the next flag
      await P('lsdown,lsleft');             // HOME STATE, with the stick
      await P('rb,down*3,a');               // BACKGROUND: the fourth (FIELD MEDIC)
      await P('rb,right,down,right');       // ATTRIBUTES: STRENGTH 3, ENDURANCE 3
      await P(`rb,a,down*${TRAITS.length},a`); // TRAITS: IRON GUT, then the first flaw (NIGHT-BLIND)
      await P('rb,right,down,right');       // LOOK: a build, a skin
      const pick = JSON.parse(JSON.stringify(K.draft));
      const r = await P('start,start');     // START: to the KIT, START: BEGIN
      const sh = g.sheet?.picks;
      const ok = !U.open_ && !!sh && sh.name.length >= 2 && sh.name === pick.name && sh.flag !== 'US' && sh.background === 'medic' && sh.attrs.strength === 3 && sh.attrs.endurance === 3
        && sh.traits.includes('iron_gut') && sh.traits.includes('night_blind') && sh.look.build !== 'average' && g.player.name === sh.name && g.inventory.carried.slots.some((s) => s.id === 'first_aid') && !g.paused && U.pressed > 0;
      return ok ? true : JSON.stringify({ open: U.open_, sheet: sh, draft: pick, steps, errs: validate(K.draft), ui: r.ui });
    }));
    await check('creator: the sheet rides the shard character record (additive), and a shard character opens the screen with its name and flag locked', async () => hush(async () => {
      await stage();
      if (!made) return 'no made character (the BEGIN check failed)';
      await C('load', { save: JSON.parse(JSON.stringify(made)) });
      const S = g.shard;
      if (!S?.personal) return 'no shard client on this page';
      const rec = JSON.parse(JSON.stringify(S.personal())); // what the shard stores, opaque, in characters.json data
      const carried = rec.sheet?.name === 'Mara Quill' && rec.gear?.worn?.bracelet === 'mechanic_wraps' && !rec.sheetPending;
      K.clear(); g.gear.load({ worn: {} });
      S.applyPersonal(rec, 'selftest');
      const back = g.sheet?.picks.name === 'Mara Quill' && g.player.flag === 'HT' && g.gear.worn.bracelet === 'mechanic_wraps' && g.player.maxHp === 114;
      // a brand-new shard character: the screen, the shard's name and flag held
      closeUI();
      K.forShard({ name: 'Tess Ward', flag: 'IE' });
      const opened = U.open_ && U.mode?.shard && K.pending && JSON.parse(JSON.stringify(S.personal())).sheetPending === true;
      await C('creator', { set: { name: 'Somebody Else', flag: 'MX' } });
      const held = K.draft.name === 'Tess Ward' && K.draft.flag === 'IE';
      await C('creator', { press: 'b' }); const stays = U.open_; // nowhere to go back to
      await C('creator', { trait: 'bad_back', on: true });
      const r = await C('creator', { begin: true });
      const done = r.ok && !U.open_ && !K.pending && !K.lock && g.player.name === 'Tess Ward' && g.player.flag === 'IE' && !g.paused;
      return carried && back && opened && held && stays && done ? true : JSON.stringify({ carried, back, opened, held, stays, done, r: r.error });
    }));
    await check('creator: the keyboard alone drives it too (arrows change, Enter picks, Q/E steps, Escape backs out and closes)', async () => {
      closeUI(); K.reset();
      await C('creator', { open: true });
      const s0 = K.draft.attrs.dexterity;
      await C('creator', { keys: 'KeyE,KeyE,ArrowDown,ArrowDown,ArrowRight' }); // ATTRIBUTES, DEXTERITY +1
      const up = K.draft.attrs.dexterity === s0 + 1 && U.view().step === 'attributes';
      await C('creator', { keys: 'KeyE,Enter' });                              // TRAITS: IRON GUT
      const t = K.draft.traits.includes('iron_gut');
      const r = await C('creator', { keys: 'Escape*4' });                      // back to NAME & ORIGIN, then out
      const closed = !U.open_ && !g.paused;
      return up && t && closed ? true : JSON.stringify({ up, dex: K.draft.attrs.dexterity, step: U.view().step, t, closed, paused: g.paused, ui: r.ui });
    });
  } finally {
    closeUI();
    restore(g, save0);
    K.reset();
    g.paused = false;
  }
}
