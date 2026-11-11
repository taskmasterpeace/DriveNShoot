// THE HOLDOUTS' LAW (docs/design/WEB_HOLDOUTS.md): every generated holdout (world/holdoutgen.js, laid out by
// world/holdout.js, its people brought in by systems/regions.js) is its own little kingdom.
//   the gate     two gatemen hold the main gate. Come within GATE.trigger m of its mouth from outside and the nearer one
//                stops you and reads the HOUSE RULES (the dialogue panel: their words are its subtitles). Comply (guns into
//                the gate locker, the toll in house paper, the water tithe, the car left outside), bribe, lie (a Persuade
//                check: ui/dialogue.js `req`), fight, or turn back. A pass lasts until you leave past GATE.leaveR.
//   the rules    each holdout keeps 1-2 HOUSE RULES (data/holdoutgen.js) and THE GATE (in by the gate check). A break is a
//                deed: the existing witness pass (systems/deeds.js) says who saw it; if a bull, a gateman or the Keyholder
//                of that town put a name to your face, you are wanted THERE (local wanted 0..3: their bulls and their
//                Keyholder shoot on sight), nowhere else. Out of sight, nothing happens.
//   the bulls    armed with real guns and the rounds they carry: every reload comes out of their pockets, and their body
//                holds exactly what was left (nobody cheats).
//   the paper    each town's own scrip: worth face at home, discounted by distance from home (SCRIP).
//   the card     the Keyholder's card (title, vice, law, the flag as its backdrop), shown when you pass the gate.
// Save/load: standing (local wanted, passes, the gate lockers) and the paper you carry.
import { GATE, WANTED, SCRIP, HOUSE_RULES, THE_GATE, NIGHT } from '../data/holdoutgen.js';
import { WEAPONS } from './combat.js';
import { GUN_ITEM, AMMO_ITEM, ITEMS } from '../data/items.js';
import { HoldoutCard } from '../ui/holdoutcard.js';

const SIDE_IN = { W: [1, 0], E: [-1, 0], N: [0, 1], S: [0, -1] };

export class HoldoutLaw {
  constructor(game, ui) {
    this.g = game;
    this.W = game.streamer.W;
    this.towns = this.W.holdouts.filter((H) => H.gen);
    this.byId = Object.fromEntries(this.towns.map((H) => [H.id, H]));
    this.st = {};          // holdout id -> standing
    this.wallet = {};      // holdout id -> notes of its paper you carry
    this.guards = [];      // live guards and Keyholders (c.guardOf)
    this.t = 0; this.drank = 0; this.lastSeq = 0;
    this.stats = { stops: 0, passes: { comply: 0, bribe: 0, lie: 0, fine: 0 }, fights: 0, breaks: 0, seen: 0, unseen: 0, reloads: 0, dry: 0, bodies: 0 };
    this.card = ui ? new HoldoutCard(game, ui) : null;
    this.enabled = true;
  }

  S(id) { return (this.st[id] ??= { wanted: 0, pass: false, how: null, inside: false, entered: false, locker: null, tithe: false, toll: false, parked: null, episode: {}, last: null, seenCount: 0, unseen: 0 }); }
  holdoutAt(x, z, m = 0) { for (const H of this.towns) if (H.inCity(x, z, m)) return H; return null; }
  mainGate(H) { return H.gates.find((g) => g.main) ?? H.gates[0]; }
  rulesOf(H) { return H.gen?.rules ?? []; }
  night() { const h = this.g.sky?.time ?? 12; return h >= NIGHT.from || h < NIGHT.to; }

  // ---- the people (systems/regions.js promote) -----------------------------------------------------------------------
  // Where gateman n stands: just inside the main gate, to one side of its mouth, facing out.
  gatePost(H, n) {
    const g = this.mainGate(H), [ix, iz] = SIDE_IN[g.side], s = n % 2 ? 1 : -1;
    return { x: g.x + ix * GATE.inside + iz * s * GATE.aside, z: g.z + iz * GATE.inside + ix * s * GATE.aside, face: Math.atan2(-ix, -iz) };
  }
  // A guard (gateman, bull) or a Keyholder takes up their town's law.
  enlist(c, H, r) {
    c.guardOf = H.id; c.guardKind = r?.guard ? r.kind : 'keyholder';
    if (r?.guard) { c.rounds = r.rounds ?? 0; c.rec = r.id; r.c = c; }
    if (!this.guards.includes(c)) this.guards.push(c);
    if (this.S(H.id).wanted > 0 && c.guardKind !== 'gateman') this.hunt(c);
  }
  hunt(c) { if (!c.weapon) return; c.vendetta = true; c.hold = false; }
  standDown(c) { c.vendetta = false; if (c.grudge === this.g.player) c.grudge = null; if (c.target === this.g.player) { c.target = null; c.state = 'idle'; } if (c.post) c.hold = true; }

  // The named people's talk (data trees, ui/dialogue.js): the Keyholder states the law and the rules; the sutler changes
  // paper; the rest a word in passing.
  talkFor(H, n) {
    if (!H.gen) return null;
    const G = H.gen, C = G.card, self = this;
    if (n.keyholder) return {
      start: 'hi',
      nodes: {
        hi: { text: `${C.name}. ${C.title} of ${H.name}. ${C.law}`, choices: [{ t: 'What are the house rules?', next: 'rules' }, { t: 'What do they say about you on the road?', next: 'lore' }, { t: '[Leave]', end: true }] },
        rules: { text: `${this.rulesOf(H).map((k) => HOUSE_RULES[k].line).join(' ')} And everybody comes in by the gate.`, choices: [{ t: 'Understood.', next: 'hi' }, { t: '[Leave]', end: true }] },
        lore: { text: `They say I ${C.vice}. ${C.lore}`, choices: [{ t: 'I heard different.', next: 'hi' }, { t: '[Leave]', end: true }] },
      },
    };
    if (n.job === 'trader') return {
      start: 'hi',
      nodes: {
        hi: { text: `House paper here is ${G.scrip.name}. I change yours, at what it's worth this far from home.`, get choices() { return self.paperChoices(H, 'hi'); } },
      },
    };
    const lines = { doctor: `Sit down before you fall down. ${C.title} pays for the bandages, so mind the house rules.`, barkeep: `First drink's water and it isn't free. ${C.name} sees to that.` };
    return { start: 'hi', nodes: { hi: { text: lines[n.job] ?? 'Not now.', choices: [{ t: '[Leave]', end: true }] } } };
  }
  paperChoices(H, back) {
    const g = this.g, G = H.gen, out = [];
    const buy = 10, cost = Math.ceil(buy * SCRIP.face * SCRIP.buy);
    out.push(g.cash >= cost ? { t: `Buy ${buy} ${G.scrip.name} for $${cost}`, do: () => this.exchange(H.id, buy, 'buy'), next: back } : { t: `Buy ${buy} ${G.scrip.name} for $${cost}`, locked: `you have $${g.cash}` });
    for (const [id, n] of Object.entries(this.wallet)) {
      if (!n || !this.byId[id]) continue;
      const q = this.quote(id, n, H.cx, H.cz, id === H.id ? SCRIP.cashOut : 1 - SCRIP.cut);
      out.push({ t: `Sell ${n} ${this.byId[id].gen.scrip.name} for $${q}`, do: () => this.exchange(id, n, 'sell', H), next: back });
    }
    out.push({ t: '[Leave]', end: true });
    return out;
  }

  // ---- house paper ----------------------------------------------------------------------------------------------------
  // What n notes of holdout id's paper are worth (dollars) at (x, z): face at home, less SCRIP.perKm a km from home.
  rate(id, x, z) { const H = this.byId[id]; if (!H) return 0; const km = Math.hypot(x - H.cx, z - H.cz) / 1000; return SCRIP.face * Math.max(SCRIP.floor, 1 - SCRIP.perKm * Math.max(0, km - Math.max(H.hw, H.hd) / 1000)); }
  quote(id, n, x, z, k = 1) { return Math.floor(n * this.rate(id, x, z) * k); }
  // buy: dollars for the house's own paper (at its gate or its sutler). sell: paper for dollars where you stand (at, the
  // holdout you are dealing in: its own paper back at cashOut, anybody else's at its worth here less the cut).
  exchange(id, n, mode, at = null) {
    const g = this.g, H = this.byId[id];
    if (!H || !(n > 0)) return { ok: false, why: 'no such paper' };
    if (mode === 'buy') {
      const cost = Math.ceil(n * SCRIP.face * SCRIP.buy);
      if (g.cash < cost) return { ok: false, why: `costs $${cost}, you have $${g.cash}` };
      g.cash -= cost; this.wallet[id] = (this.wallet[id] ?? 0) + n;
      g.emit('scrip', { holdout: id, mode, n, dollars: -cost });
      return { ok: true, cost, wallet: this.wallet[id] };
    }
    const have = this.wallet[id] ?? 0;
    if (have < n) return { ok: false, why: `you carry ${have}` };
    const P = g.player, where = at ?? this.holdoutAt(P.x, P.z, 40), k = where?.id === id ? SCRIP.cashOut : 1 - SCRIP.cut;
    const dollars = this.quote(id, n, where?.cx ?? P.x, where?.cz ?? P.z, k);
    this.wallet[id] = have - n; g.cash += dollars;
    g.emit('scrip', { holdout: id, mode, n, dollars, at: where?.id ?? null });
    return { ok: true, dollars, wallet: this.wallet[id] };
  }

  // ---- the gate check ---------------------------------------------------------------------------------------------------
  // What the gate asks of you, by the town's rules: guns, toll, water, park.
  demands(H) { return this.rulesOf(H).map((k) => HOUSE_RULES[k].gate).filter(Boolean); }
  stop(H, gm) {
    const g = this.g, S = this.S(H.id);
    S.stopped = g.time; this.stats.stops++;
    gm.npc = this.gateNpc(H, gm); gm.gateTalk = true;
    gm.face = Math.atan2(g.player.x - gm.x, g.player.z - gm.z);
    g.dialogue.open(gm);
    g.emit('gateStop', { holdout: H.id, gateman: gm.id, rules: this.rulesOf(H), wanted: S.wanted });
  }
  gateNpc(H, gm) {
    const G = H.gen, C = G.card, self = this, gate = G.gate;
    const rules = this.rulesOf(H).map((k) => HOUSE_RULES[k]);
    const asks = this.demands(H);
    const say = { guns: 'Your guns stay with me.', toll: `Toll is ${gate.toll} ${G.scrip.name}.`, water: 'One water to the house.', park: 'The car stays outside.' };
    return {
      id: `${H.id}_gate`, name: gm.name, title: `Gateman · ${H.name}`, flag: gm.flag, faction: 'drifter', portrait: { seed: 7 },
      start: this.S(H.id).wanted > 0 ? 'wanted' : 'gate',
      nodes: {
        gate: {
          text: `Hold it. This is ${H.name}, and ${C.title} ${C.name} keeps the key. House rules: ${rules.map((r, i) => `${i + 1}. ${r.name}.`).join(' ')} ${asks.map((a) => say[a]).join(' ') || 'Mind them and you are welcome.'}`,
          get choices() { return self.gateChoices(H, gm); },
        },
        wanted: {
          text: `You. ${H.name} wants you for ${self.S(H.id).last?.rule ? HOUSE_RULES[self.S(H.id).last.rule]?.name ?? 'running the gate' : 'what you did'}. Fine is $${WANTED.fine * Math.ceil(self.S(H.id).wanted)}, or the bulls settle it.`,
          get choices() { const f = WANTED.fine * Math.ceil(self.S(H.id).wanted); return [g0(self.g.cash >= f, { t: `Pay the fine ($${f})`, do: () => self.payFine(H), next: 'gate' }, `you have $${self.g.cash}`), { t: '[Draw on him]', do: () => self.fight(H, gm), end: true }, { t: '[Turn back]', end: true }]; },
        },
        in: { text: `In you go. Mind the house rules: the bulls are watching.`, choices: [{ t: '[Go in]', end: true }] },
      },
    };
  }
  gateChoices(H, gm) {
    const g = this.g, G = H.gen, gate = G.gate, asks = this.demands(H), out = [];
    // Comply: what you can hand over; locked with the reason when you cannot.
    if (asks.length) {
      const why = this.cannotComply(H);
      const what = asks.map((a) => ({ guns: `hand over ${g.inv.weapons.length} gun${g.inv.weapons.length === 1 ? '' : 's'}`, toll: `pay ${gate.toll} paper`, water: 'tithe one water', park: 'leave the car' }[a])).join(', ');
      out.push(g0(!why, { t: `Comply: ${what}`, do: () => this.comply(H), next: 'in' }, why));
      if (asks.includes('toll') && (this.wallet[H.id] ?? 0) < gate.toll) {
        const cost = Math.ceil(gate.toll * SCRIP.face * SCRIP.buy);
        out.push(g0(g.cash >= cost, { t: `Buy ${gate.toll} ${G.scrip.name} at the gate ($${cost})`, do: () => this.exchange(H.id, gate.toll, 'buy'), next: 'gate' }, `you have $${g.cash}`));
      }
    } else out.push({ t: 'Understood.', do: () => this.pass(H, 'comply'), next: 'in' });
    // Bribe: dollars for a blind eye (not at an incorruptible Keyholder's gate).
    if (asks.length) out.push(gate.incorruptible ? { t: `Slip him $${gate.bribe}`, locked: `${G.card.title} hangs gatemen who take money` } : g0(g.cash >= gate.bribe, { t: `Slip him $${gate.bribe} to look the other way`, do: () => this.bribe(H, gm), next: 'in' }, `you have $${g.cash}`));
    // Lie: a Persuade check (the dialogue gates it; a failure stays on screen, greyed, with the reason).
    if (asks.length) {
      const lie = asks.includes('guns') ? '"I am not carrying."' : asks.includes('toll') ? '"I paid at this gate this morning."' : asks.includes('water') ? '"I tithed on my way out yesterday."' : '"That car is not mine."';
      out.push({ t: lie, req: { skill: { persuade: gate.lie } }, do: () => this.pass(H, 'lie'), next: 'in' });
    }
    out.push({ t: '[Draw on him]', do: () => this.fight(H, gm), end: true });
    out.push({ t: '[Turn back]', end: true });
    return out;
  }
  cannotComply(H) {
    const g = this.g, gate = H.gen.gate;
    for (const a of this.demands(H)) {
      if (a === 'toll' && (this.wallet[H.id] ?? 0) < gate.toll) return `you carry ${this.wallet[H.id] ?? 0}/${gate.toll} house paper`;
      if (a === 'water' && this.waterSlot() < 0 && g.cash < GATE.waterValue) return 'you carry no water';
    }
    return null;
  }
  waterSlot() { const C = this.g.inventory?.carried; if (!C) return -1; return C.slots.findIndex((s) => ITEMS[s.id]?.kind === 'water' && (s.left ?? 1) > 0); }
  comply(H) {
    const g = this.g, S = this.S(H.id), gate = H.gen.gate, inv = g.inventory;
    for (const a of this.demands(H)) {
      if (a === 'guns') this.checkGuns(H);
      if (a === 'toll') { this.wallet[H.id] -= gate.toll; S.toll = true; }
      if (a === 'water') { const i = this.waterSlot(); if (i >= 0) inv.take(inv.carried, i, 1); else g.cash -= GATE.waterValue; S.tithe = true; inv.changed?.(); }
      if (a === 'park' && g.player.inVehicle) { S.parked = g.player.inVehicle.id; g.exitVehicle(true); }
    }
    this.pass(H, 'comply');
  }
  // Guns into the gate locker (back at the gate on the way out): the ones in your hands and any spares you carry.
  checkGuns(H) {
    const g = this.g, I = g.inv, inv = g.inventory, S = this.S(H.id);
    const L = (S.locker ??= { guns: [], items: [], current: I.current });
    for (const k of I.weapons) L.guns.push({ k, cond: I.cond[k] ?? 1, mag: I.mag[k] ?? 0 });
    I.weapons = []; for (const k of Object.keys(I.mag)) I.mag[k] = 0; I.cond = {}; I.jam = {};
    I.current = null; g.player.weapon = null; g.player.reloading = 0;
    const C = inv?.carried;
    if (C) for (let i = C.slots.length - 1; i >= 0; i--) { const s = C.slots[i]; if (ITEMS[s.id]?.kind === 'gun') { const t = inv.take(C, i, s.n); L.items.push(t); } }
    inv?.changed?.();
    g.arms?.holster?.('gate');
    g.emit('gunsChecked', { holdout: H.id, guns: L.guns.map((q) => q.k), items: L.items.length });
  }
  returnGuns(H) {
    const g = this.g, I = g.inv, inv = g.inventory, S = this.S(H.id), L = S.locker;
    if (!L) return 0;
    for (const q of L.guns) if (!I.weapons.includes(q.k)) { I.weapons.push(q.k); I.cond[q.k] = q.cond; I.mag[q.k] = q.mag; } else inv?.stow?.(GUN_ITEM[q.k], 1, { cond: q.cond, loaded: q.mag });
    for (const t of L.items) inv?.add(inv.carried, t.id, t.n ?? 1, t);
    const cur = I.weapons.includes(L.current) ? L.current : I.weapons[0] ?? null;
    I.current = null; if (cur) g.switchWeapon(cur);
    S.locker = null; inv?.changed?.();
    g.hud?.toast?.(`THE GATEMAN HANDS BACK YOUR GUNS · ${H.name}`, 'info');
    g.emit('gunsReturned', { holdout: H.id, guns: L.guns.map((q) => q.k) });
    return L.guns.length;
  }
  bribe(H, gm) {
    const g = this.g, b = H.gen.gate.bribe;
    g.cash -= b;
    g.society?.deeds.direct?.('pay', gm, 1);
    this.pass(H, 'bribe');
  }
  pass(H, how) {
    const g = this.g, S = this.S(H.id);
    S.pass = true; S.how = how; S.passT = g.time; S.entered = false; S.episode = {};
    this.stats.passes[how] = (this.stats.passes[how] ?? 0) + 1;
    this.card?.show(H, 9);
    g.emit('gatePassed', { holdout: H.id, how });
  }
  payFine(H) {
    const g = this.g, S = this.S(H.id), f = WANTED.fine * Math.ceil(S.wanted);
    if (g.cash < f) return false;
    g.cash -= f; this.stats.passes.fine++;
    this.clearWanted(H, 'fine');
    return true;
  }
  // Draw on the gateman: a threat in front of the gate (the deed and its witnesses), and the town's bulls come.
  fight(H, gm) {
    const g = this.g;
    this.stats.fights++;
    const rec = g.society?.deeds.record('threaten', { target: gm, tf: H.row.faction.id, src: 'gate' });
    this.raise(H, 2, 'fight', gm, rec);
    for (const c of this.guards) if (c.alive && c.guardOf === H.id && c.weapon) { c.vendetta = true; c.hold = false; c.grudge = g.player; c.target = g.player; c.state = 'fight'; }
    g.arms?.raise?.('gate');
  }

  // ---- the law: local wanted -----------------------------------------------------------------------------------------
  raise(H, heat, rule, by, rec = null) {
    const g = this.g, S = this.S(H.id), was = S.wanted;
    S.wanted = Math.min(WANTED.max, S.wanted + heat);
    S.last = { rule, t: +g.time.toFixed(2), day: g.society?.day ?? 0, by: by?.id ?? null, record: rec?.seq ?? null };
    S.pass = rule === 'fight' ? false : S.pass;
    for (const c of this.guards) if (c.alive && c.guardOf === H.id && c.guardKind !== 'gateman') this.hunt(c);
    if (was === 0) g.hud?.toast?.(`WANTED IN ${H.name}: ${rule === 'fight' ? 'YOU DREW ON THE GATE' : (HOUSE_RULES[rule]?.name ?? THE_GATE.name)}`, 'hot');
    g.emit('holdoutWanted', { holdout: H.id, wanted: S.wanted, was, rule, by: by?.id ?? null, record: rec?.seq ?? null });
  }
  clearWanted(H, why) {
    const S = this.S(H.id);
    S.wanted = 0; S.episode = {};
    for (const c of this.guards) if (c.guardOf === H.id) this.standDown(c);
    this.g.emit('holdoutCleared', { holdout: H.id, why });
  }
  // A break of rule (a HOUSE_RULES id, or THE_GATE's id): the witness pass decides. Seen by a guard of the town
  // (deeds.witnessPass: sight, facing, walls, night): the deed goes on the record and the town wants you. Unseen: nothing.
  breach(H, rule) {
    const g = this.g, P = g.player, S = this.S(H.id), D = g.society?.deeds;
    if (!D) return null;
    this.stats.breaks++;
    const saw = D.witnessPass(P.x, P.z, P, null).filter((c) => c.guardOf === H.id);
    if (!saw.length) { S.unseen++; this.stats.unseen++; g.emit('houseRuleUnseen', { holdout: H.id, rule }); return { seen: false }; }
    const name = HOUSE_RULES[rule]?.name ?? THE_GATE.name;
    const rec = D.record('trespass', { x: P.x, z: P.z, tf: H.row.faction.id, label: `${name} · ${H.name}`, stars: 0, src: 'houseRule' });
    S.seenCount++; this.stats.seen++;
    this.raise(H, HOUSE_RULES[rule]?.heat ?? THE_GATE.heat, rule, saw[0], rec);
    g.emit('houseRuleBroken', { holdout: H.id, rule, by: saw.map((c) => c.id), record: rec?.seq ?? null });
    return { seen: true, by: saw.map((c) => c.id) };
  }
  // Is rule k being broken right now (the player inside H)?
  breaking(H, k, S) {
    const g = this.g, P = g.player, A = g.arms, gunUp = !!g.inv.current && (A?.stance === 'raised' || (A?.lastShotT ?? -1e9) > g.time - 2);
    switch (HOUSE_RULES[k]?.inside) {
      case 'gunOut': return gunUp;
      case 'dogLoose': return this.night() && (g.dogs?.mine?.() ?? []).some((d) => H.inCity(d.x, d.z) && Math.hypot(d.x - P.x, d.z - P.z) > 6);
      case 'drinkUntithed': return !S.tithe && this.drank > 0;
      case 'abroadAtNight': return this.night() && !g.insideBuilding && !P.inVehicle;
      case 'driving': return !!P.inVehicle && Math.hypot(P.inVehicle.vx ?? 0, P.inVehicle.vz ?? 0) > 1;
      case 'armedInSwap': { const m = H.blocks.find((b) => b.open === 'market'); return !!m && gunUp && P.x > m.x0 && P.x < m.x1 && P.z > m.z0 && P.z < m.z1; }
      default: return false;
    }
  }

  // ---- per frame -----------------------------------------------------------------------------------------------------
  update(dt) {
    if (!this.enabled || !this.towns.length) return;
    const g = this.g, P = g.player;
    this.accountRounds();
    // Drinks since the last look (the water tithe).
    for (let i = g.events.length - 1; i >= 0 && g.events[i].seq > this.lastSeq; i--) { const e = g.events[i]; if (e.type === 'consumed' && e.need === 'water') this.drank++; }
    this.lastSeq = g.eventSeq;
    // The gateman's talk is only theirs while the gate check is open (a body with a talk tree drops nothing).
    if (!g.dialogue?.active) for (const c of this.guards) if (c.gateTalk) { c.gateTalk = false; c.npc = null; }
    if ((this.t -= dt) > 0) return;
    this.t = 0.25;
    const hrs = 0.25 * (g.sky?.timeScale ?? 1 / 30) * (g.sky?.fast ? 40 : 1); // game hours in this look
    for (const H of this.towns) {
      const S = this.S(H.id), near = Math.abs(P.x - H.cx) < H.hw + 500 && Math.abs(P.z - H.cz) < H.hd + 500;
      // Cool off while away from the wall.
      if (S.wanted > 0 && !H.inCity(P.x, P.z, WANTED.seenR)) { S.wanted = Math.max(0, S.wanted - WANTED.cool * hrs); if (S.wanted === 0) this.clearWanted(H, 'cooled'); }
      if (!near) continue;
      const inside = H.inCity(P.x, P.z, -0.5);
      // The gate check: at the gate's mouth from outside, not already through, a gateman on his feet.
      const gt = this.mainGate(H), [ix, iz] = SIDE_IN[gt.side], mx = gt.x - ix * 3, mz = gt.z - iz * 3;
      if (!H.inCity(P.x, P.z, -2) && !S.pass && !g.dialogue?.active && Math.hypot(P.x - mx, P.z - mz) < GATE.trigger && (!S.stopped || g.time - S.stopped > 6)) {
        const gm = this.guards.filter((c) => c.alive && c.guardOf === H.id && c.guardKind === 'gateman' && !c.vendetta).sort((a, b) => Math.hypot(a.x - P.x, a.z - P.z) - Math.hypot(b.x - P.x, b.z - P.z))[0];
        if (gm && Math.hypot(gm.x - P.x, gm.z - P.z) < GATE.talk) { this.stop(H, gm); continue; }
      }
      // Out past the wall: the pass ends, the locker opens (the car you left is where you left it).
      if (!inside && (S.pass || S.locker) && !H.inCity(P.x, P.z, GATE.leaveR)) { if (S.locker) this.returnGuns(H); S.pass = false; S.tithe = false; S.toll = false; S.entered = false; S.episode = {}; }
      if (!inside && S.locker && S.pass && Math.hypot(P.x - mx, P.z - mz) < GATE.trigger + 4 && S.entered) this.returnGuns(H);
      if (inside && !S.inside) { S.inside = true; if (S.pass) S.entered = true; g.emit('holdoutEntered', { holdout: H.id, pass: S.pass, how: S.how }); }
      if (!inside && S.inside) { S.inside = false; g.emit('holdoutLeft', { holdout: H.id }); }
      if (!inside) continue;
      // THE GATE: inside without passing the check.
      if (!S.pass && !S.wanted) this.episode(H, S, THE_GATE.id, true);
      for (const k of this.rulesOf(H)) { const R = HOUSE_RULES[k]; if (R.when === 'night' && !this.night()) { S.episode[k] = null; continue; } this.episode(H, S, k, this.breaking(H, k, S)); }
      this.drank = 0;
    }
  }
  // A rule's episode: while it is broken, the witness pass runs once a second until a guard sees it (then once: you are
  // wanted for it, not once a frame); it closes when the break stops.
  episode(H, S, k, now) {
    if (!now) { S.episode[k] = null; return; }
    const e = (S.episode[k] ??= { t0: this.g.time, next: 0, seen: false });
    if (e.seen || this.g.time < e.next) return;
    e.next = this.g.time + 1;
    const r = this.breach(H, k);
    if (r?.seen) e.seen = true;
  }

  // Nobody cheats: a guard's reload comes out of the rounds they carry; dry, they fight with what is left. Their body
  // holds their gun with what was in it and the rounds they had left (main.js armed it from the faction's table: put right).
  accountRounds() {
    const g = this.g;
    for (let i = this.guards.length - 1; i >= 0; i--) {
      const c = this.guards[i];
      if (!g.chars.includes(c)) { if (!c.alive) this.fixBody(c); this.guards.splice(i, 1); continue; }
      if (!c.alive) { this.fixBody(c); continue; }
      if (!c.weapon || c.guardKind === 'keyholder') continue;
      const W = WEAPONS[c.weapon];
      if (c.reloading > 0 && c._load === undefined) {
        const need = W.mag - Math.max(0, c.mag), load = Math.min(need, c.rounds ?? 0);
        c.rounds -= load; c._load = Math.max(0, c.mag) + load; this.stats.reloads++;
      } else if (!(c.reloading > 0) && c._load !== undefined) {
        // The reload finished (ai.js filled the magazine): what was really loaded, less anything fired since.
        c.mag = Math.min(c.mag, c._load - (W.mag - c.mag)); c._load = undefined;
        if (c.mag <= 0 && (c.rounds ?? 0) <= 0) { c.dryWeapon = c.weapon; c.weapon = null; c.mag = 0; this.stats.dry++; g.emit('guardDry', { id: c.id, holdout: c.guardOf }); }
      }
    }
  }
  fixBody(c) {
    if (c._bodyFixed) return;
    const box = this.g.inventory?.boxes.get(`body:${c.id}`);
    if (!box) return;
    c._bodyFixed = true;
    const k = c.weapon ?? c.dryWeapon, W = WEAPONS[k];
    box.slots = box.slots.filter((s) => ITEMS[s.id]?.kind !== 'gun' && !Object.values(AMMO_ITEM).includes(s.id));
    if (W && GUN_ITEM[k]) { this.g.inventory.add(box, GUN_ITEM[k], 1, { cond: 0.8, loaded: Math.max(0, c.mag ?? 0) }); if ((c.rounds ?? 0) > 0 && AMMO_ITEM[W.ammo]) this.g.inventory.add(box, AMMO_ITEM[W.ammo], c.rounds); }
    this.stats.bodies++;
  }

  // ---- reports, save ----------------------------------------------------------------------------------------------------
  view(id) {
    const P = this.g.player;
    const one = (H) => {
      const S = this.S(H.id), G = H.gen;
      return { id: H.id, name: H.name, region: H.R.id, centre: [H.cx, H.cz], size: G.row.size, mainGate: H.mainGate, gate: this.mainGate(H) && { x: +this.mainGate(H).x.toFixed(1), z: +this.mainGate(H).z.toFixed(1) },
        exit: H.exit?.name ?? null, distance: Math.round(Math.hypot(P.x - H.cx, P.z - H.cz)), card: G.card, rules: G.rules.map((k) => ({ id: k, name: HOUSE_RULES[k].name, gate: HOUSE_RULES[k].gate, inside: HOUSE_RULES[k].inside })),
        scrip: { ...G.scrip, carried: this.wallet[H.id] ?? 0, rateHere: +this.rate(H.id, P.x, P.z).toFixed(3) }, gateTerms: G.gate, wealth: G.wealth,
        standing: { wanted: +S.wanted.toFixed(2), pass: S.pass, how: S.how, inside: S.inside, locker: S.locker ? S.locker.guns.map((q) => q.k) : null, last: S.last, seen: S.seenCount, unseen: S.unseen },
        guards: this.guards.filter((c) => c.guardOf === H.id).map((c) => ({ id: c.id, kind: c.guardKind, name: c.name, flag: c.flag, alive: c.alive, weapon: c.weapon, mag: c.mag, rounds: c.rounds ?? null, vendetta: !!c.vendetta, x: +c.x.toFixed(1), z: +c.z.toFixed(1) })),
        lots: H.lots.length, programmes: [...new Set(H.lots.map((L) => L.programme))] };
    };
    if (id) { const H = this.byId[id]; return H ? one(H) : null; }
    return { towns: this.towns.map(one), wallet: { ...this.wallet }, stats: JSON.parse(JSON.stringify(this.stats)) };
  }
  save() {
    const st = {};
    for (const [id, S] of Object.entries(this.st)) st[id] = { wanted: +S.wanted.toFixed(3), pass: S.pass, how: S.how, locker: S.locker, tithe: S.tithe, toll: S.toll, parked: S.parked, last: S.last, seenCount: S.seenCount, unseen: S.unseen };
    return { v: 1, st, wallet: { ...this.wallet } };
  }
  load(s) {
    for (const H of this.towns) { const S = this.S(H.id); if (S.wanted > 0) for (const c of this.guards) if (c.guardOf === H.id) this.standDown(c); }
    this.st = {}; this.wallet = {};
    if (!s) return;
    for (const [id, q] of Object.entries(s.st ?? {})) if (this.byId[id]) Object.assign(this.S(id), q, { episode: {}, inside: false, entered: false });
    for (const [id, n] of Object.entries(s.wallet ?? {})) if (this.byId[id]) this.wallet[id] = n;
    for (const H of this.towns) if (this.S(H.id).wanted > 0) for (const c of this.guards) if (c.alive && c.guardOf === H.id && c.guardKind !== 'gateman') this.hunt(c);
  }
}

// A choice that is open, or locked with the reason (ui/dialogue.js shows a locked one greyed).
function g0(ok, ch, why) { return ok ? ch : { t: ch.t, locked: why }; }
