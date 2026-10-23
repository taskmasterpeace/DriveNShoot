import { ROLES, ROLE_TIERS, ROLE_RULES as RULES, ROLE_JOBS, ROLE_OFFICES, ROLE_CALLS } from '../data/roles.js';
import { ITEMS } from '../data/items.js';
import { K } from './chronicle.js';
import { MAX_FACTIONS, purple } from './factions.js';
import { slotKg } from './inventory.js';

// Roles (docs/design/WEB_ROLES.md): what the world calls you, earned and lost by what you keep doing. Rows live in
// data/roles.js; this file routes the game's signals to them, keeps each role's renown and tier (with hysteresis),
// and pushes what a role opens into the systems that already exist:
//   factions  a bias on the standing each faction acts on (its reading of you) and a shoot/hold override
//   prices    priceMul(faction) - the trade screen's multiplier (1 = no change)
//   people    greetings, barks, refusals, strangers calling out, the role-gated dialogue and jobs in data/npcs.js
//   director  event weights, the role call (someone comes looking for what you are known for), the radio
// Work happens on events (a deed, a jump, a search) and on the clock (a 1 s sample, the hourly tick), never per frame:
// update() is one subtraction until its second is up.
const TIER = Object.fromEntries(ROLE_TIERS.map((t, i) => [t, i]));
const NOT_FILTERS = new Set(['on', 'pts', 'per', 'div', 'max', 'upTo', 'seen', 'seenBy', 'scale', 'namedMul', 'note', 'while']);
const SIGNALS = ['deed', 'drive', 'jump', 'search', 'loot', 'trade', 'event', 'hour'];
const tierIdx = (t) => (typeof t === 'number' ? t : TIER[t] ?? 2);
const article = (name) => (/^[aeiou]/i.test(name) ? 'AN' : 'A');

export class Roles {
  constructor(game) {
    this.g = game;
    this.rows = {};          // id -> row
    this.ids = [];
    this.st = {};            // id -> { r, tier, active, susp, idle, why }
    this.byOn = {};          // signal -> [{ id, rule, sign }]
    this.hourly = [];        // [{ id, rule }]
    this.jobs = {};          // job id -> { active, n, day }
    this.offices = {};       // office id -> { since, by }
    this.dailyUsed = {};     // a once-a-day favour -> the day it was used
    this.said = new Map();   // npc -> { day, role }: greetings at most once a day per role
    this.news = [];          // role changes the radio has not read yet
    this.version = 0;        // bumps whenever anything a UI shows changes (the HUD compares it: no polling cost)
    this.perk = { idMul: 1, carryKg: 0, healMul: 1, jumpPay: 1, fear: false, carjackFlee: false };
    this.weights = {};
    this.tickT = RULES.sample; this.shoutT = 0;
    this.odoV = null; this.odoX = 0; this.odoZ = 0; this.km = 0;
    this._drive = { on: 'drive', km: 0, fast: 0, vehicle: '' };
    this._bias = new Float32Array(MAX_FACTIONS); this._host = new Float32Array(MAX_FACTIONS);
    this._touched = [];
    this.fxDirty = false;
    for (const [id, def] of Object.entries(ROLES)) this.register(id, def, true);
    this.index();
  }

  // ---- rows ------------------------------------------------------------------------------------------------------
  // Add or replace a role row (a pack's `roles` section, the registerRole command). Returns { id, warnings } or
  // { error }. A role is data: every signal and effect it can name is listed in data/roles.js.
  register(id, def, quiet = false) {
    const warnings = [];
    if (!/^[a-z][a-z0-9_]*$/.test(id ?? '')) return { error: 'role id must be a lowercase word (letters, digits, _)' };
    const base = this.rows[id] ?? ROLES[id] ?? {};
    const row = { tiers: [20, 45, 75], halfLife: 6, earn: [], wear: [], opens: {}, ...base, ...def };
    if (!row.name) return { error: 'a role needs a name' };
    row.short = String(row.short ?? row.name).toUpperCase();
    if (!(Array.isArray(row.tiers) && row.tiers.length === 3 && row.tiers.every((t, i) => t > 0 && t <= 100 && (!i || t > row.tiers[i - 1])))) return { error: 'tiers must be three rising numbers in (0, 100]' };
    if (!(row.halfLife > 0)) return { error: 'halfLife (game days) must be above 0' };
    if (purple(row.color)) { warnings.push(`colour ${row.color} is purple (hue 270-320) - the art law forbids it; using #b89a5a`); row.color = '#b89a5a'; }
    row.color ??= '#b89a5a';
    for (const r of [...row.earn, ...row.wear]) if (!SIGNALS.includes(r.on)) warnings.push(`rule "${r.note ?? '?'}" listens for unknown signal "${r.on}"; known: ${SIGNALS.join(', ')}`);
    const F = this.g.society?.factions;
    for (const fid of Object.keys(row.opens?.factions ?? {})) if (F && F.index[fid] === undefined) warnings.push(`opens.factions.${fid}: no such faction (ignored until one is registered)`);
    for (const [fid, m] of Object.entries(row.opens?.prices ?? {})) if (!(m >= 0.3 && m <= 3)) warnings.push(`opens.prices.${fid}=${m} is outside 0.3..3`);
    const fresh = !this.rows[id];
    this.rows[id] = row;
    if (fresh) { this.ids.push(id); this.st[id] = blank(); }
    if (!quiet) { this.index(); this.apply(true); }
    return { id, warnings };
  }

  // Take a registered role out again (a test's own row; a built-in row stays). Its effects go with it.
  unregister(id) {
    if (!this.rows[id] || ROLES[id]) return false;
    delete this.rows[id]; delete this.st[id];
    this.ids.splice(this.ids.indexOf(id), 1);
    this.news = this.news.filter((n) => n.id !== id);
    this.index(); this.apply(true);
    return true;
  }

  // Signal -> rules, rebuilt when the rows change.
  index() {
    this.byOn = {}; this.hourly = [];
    for (const id of this.ids) {
      const row = this.rows[id];
      for (const [list, sign] of [[row.earn, 1], [row.wear, -1]]) for (const rule of list ?? []) {
        if (rule.on === 'hour') { if (sign > 0) this.hourly.push({ id, rule }); continue; }
        (this.byOn[rule.on] ??= []).push({ id, rule, sign });
      }
    }
  }

  // ---- signals ---------------------------------------------------------------------------------------------------
  // Everything that earns or wears a role arrives here. d: the signal's fields (see data/roles.js).
  signal(on, d = {}) {
    d.on = on;
    const touched = this._touched;
    touched.length = 0;
    for (const e of this.byOn[on] ?? []) {
      if (!this.match(e.rule, d)) continue;
      const p = this.amount(e.rule, d, e.sign);
      if (!(p > 0)) continue;
      if (e.sign > 0) this.gain(e.id, p, e.rule, d); else this.wearOff(e.id, p, e.rule);
      if (!touched.includes(e.id)) touched.push(e.id);
    }
    // The jobs a role opened count their work from the same signals.
    for (const jid in this.jobs) {
      const j = this.jobs[jid], def = ROLE_JOBS[jid];
      if (!j.active || def?.counts?.on !== on || !this.match(def.counts, d)) continue;
      j.n++;
      this.g.emit('jobProgress', { job: jid, n: j.n, need: def.need ?? null });
      if (def.need && j.n === def.need) this.g.hud?.toast?.(`JOB DONE: ${(def.title.split(':')[0]).toUpperCase()} - GO GET PAID`, 'job');
      this.version++;
    }
    for (const id of touched) this.evaluate(id);
    if (this.fxDirty) this.apply();
  }

  match(rule, d) {
    for (const k in rule) {
      if (NOT_FILTERS.has(k)) continue;
      const want = rule[k], have = d[k];
      if (k === 'air') { if (!(have >= want)) return false; }
      else if (Array.isArray(want)) { if (!want.includes(have)) return false; }
      else if (want !== (have ?? (typeof want === 'boolean' ? false : undefined))) return false;
    }
    return true;
  }

  // How much a matched rule is worth. Earning is weighed by who saw it and by the skills a rule names.
  amount(rule, d, sign) {
    let p = rule.pts ?? 1;
    if (rule.per === 'mag') p *= d.mag ?? 1;
    else if (rule.per === 'km') p *= d.km ?? 0;
    else if (rule.per === 'fast') p *= d.fast ?? 0;
    else if (rule.per === 'value') p *= (d.value ?? 0) / (rule.div ?? 30);
    if (rule.max !== undefined) p = Math.min(p, rule.max);
    if (sign > 0) {
      if (d.on === 'deed') p *= this.seenOf(d, rule.seen ?? RULES.seen, rule.seenBy === 'others');
      if (rule.namedMul && d.named) p *= rule.namedMul;
      if (rule.scale) for (const sk in rule.scale) p *= 1 + rule.scale[sk] * (this.g.skillsSys?.lv[sk] ?? 0);
    }
    return p;
  }

  // Who saw it: named you (id), saw something (saw), nobody (none). A deal struck face to face is seen by its counterparty.
  // byOthers (a rule's seenBy: 'others'): the target's own eyes don't count - a ghost's mark who saw your face and
  // then died told nobody.
  seenOf(d, seen, byOthers = false) {
    if (d.src === 'dialogue') return seen.id;
    if ((byOthers ? d.wsOthers : d.ws) > 0) return seen.id;
    if (d.un > 0) return seen.saw;
    return d.unwitnessed || byOthers ? seen.none : seen.saw;
  }

  gain(id, p, rule, d, cap = 100, trickle = false) {
    const s = this.st[id], before = s.r;
    s.r = Math.min(cap, s.r + p * Math.max(0, 1 - s.r / RULES.soft));
    if (!trickle) s.idle = 0;
    const w = (s.why[rule.note ?? rule.on] ??= { n: 0, pts: 0 });
    w.n += rule.per === 'km' ? d?.km ?? 0 : rule.per === 'fast' ? d?.fast ?? 0 : rule.per === 'value' ? d?.value ?? 0 : trickle ? p / Math.max(1e-6, rule.pts ?? 1) : 1;
    w.pts += s.r - before;
  }

  wearOff(id, p, rule) {
    const s = this.st[id];
    if (s.r <= 0) return;
    const before = s.r;
    s.r = Math.max(0, s.r - p);
    const w = (s.why[rule.note ?? rule.on] ??= { n: 0, pts: 0 });
    w.n++; w.pts -= before - s.r;
  }

  // ---- hooks (the systems call these) ----------------------------------------------------------------------------
  // Was this person someone whose people shoot you on sight (asked before the deed's witnesses raise any stars)?
  wasHostile(t) {
    const g = this.g, F = g.society?.factions;
    return !!t && ((t.fi >= 0 && F?.playerHostile[t.fi] === 1) || (t.faction === 'warden' && g.wanted > 0) || t.faction === 'zombie');
  }

  // deeds.js, for every deed of yours, after the witness pass.
  // identified: somebody OTHER than the target put a name to your face (the target's own report dies with them if
  // they do; a survivor's still travels, through ws).
  onDeed(rec, o, target, hostile) {
    let others = 0;
    for (const id of rec.w) if (id !== rec.o) others++;
    this.signal('deed', {
      verb: rec.v, of: rec.of || '', hostile: !!hostile, sd: !!o.sd, named: !!(rec.k & K.named), night: !!(rec.k & K.night),
      cause: o.cause ?? '', src: rec.src, owner: !!o.owner, identified: others > 0, mag: rec.m, ws: rec.ws, wsOthers: others, un: rec.un,
      unwitnessed: !!(rec.k & K.unwitnessed), target: target?.id ?? '',
    });
  }

  // stunts.js, for every landing of yours. fresh: the first clear of that named jump today.
  onJump(res, fresh) {
    this.signal('jump', { named: !!res.jump, cleared: !!res.cleared, grade: res.landing, air: res.air ?? 0, fresh: !!fresh, jump: res.jump ?? '' });
  }

  // inventory.js: a container gone through for the first time (not a shop's shelf: that's browsing, or theft).
  onSearch(box) { if (!box.owner) this.signal('search', { kind: box.id.startsWith('body:') ? 'body' : box.kind }); }
  onLoot(value) { if (value > 0) this.signal('loot', { value }); }

  // director.js: an event ended. A raid counts for you if you were near the town it hit.
  onEvent(ev, outcome) {
    const P = this.g.player, b = ev.bind ?? {};
    const near = b.cx !== undefined ? Math.hypot(P.x - b.cx, P.z - b.cz) < RULES.near : true;
    this.signal('event', { tpl: ev.tpl, outcome, near });
  }

  // ---- the clock -------------------------------------------------------------------------------------------------
  // Every game hour (society.js, and simTick): what you carry and where you spend your time trickle in (never past a
  // rule's upTo), and a role idle past the grace hours fades with its half-life.
  tickHours(h) {
    if (!(h > 0)) return;
    for (const e of this.hourly) {
      const s = this.st[e.id], cap = e.rule.upTo ?? 100;
      if (s.r >= cap || this.cond(e.rule.while)) continue;
      this.gain(e.id, (e.rule.pts ?? 0) * h, e.rule, null, cap, true);
    }
    for (const id of this.ids) {
      const s = this.st[id], i0 = s.idle;
      s.idle += h;
      const over = Math.max(0, s.idle - RULES.grace) - Math.max(0, i0 - RULES.grace);
      if (over > 0 && s.r > 0) {
        const before = s.r;
        s.r *= 2 ** (-over / (24 * this.rows[id].halfLife));
        const w = (s.why['time without doing it'] ??= { n: 0, pts: 0 }); w.n += over; w.pts -= before - s.r;
      }
      this.evaluate(id);
    }
    if (this.fxDirty) this.apply();
  }

  // Once a second of sim: the odometer, the gates (stars and standings move on their own), the street's reaction.
  update(dt) {
    if ((this.tickT -= dt) > 0) return;
    this.tickT = RULES.sample;
    const g = this.g, P = g.player, v = P.alive ? P.inVehicle : null;
    if (v && v.driver === P) {
      if (this.odoV === v) {
        const d = Math.hypot(v.x - this.odoX, v.z - this.odoZ);
        if (d > 0.5 && d < 90) { // a teleport is not a drive
          const D = this._drive;
          D.km = d / 1000; D.fast = g.vehiclesSys.speed(v) > RULES.fast ? RULES.sample : 0; D.vehicle = v.type;
          this.km += D.km;
          this.signal('drive', D);
        }
      }
      this.odoV = v; this.odoX = v.x; this.odoZ = v.z;
    } else this.odoV = null;
    for (const id of this.ids) this.evaluate(id);
    if (this.fxDirty) this.apply();
    this.crowd();
  }

  // Strangers call out to a known role; a renowned butcher empties the street of anyone unarmed.
  crowd() {
    const g = this.g, P = g.player, F = g.society?.factions;
    if (!P.alive || !F) return;
    const bid = this.bestId(2), lines = bid ? this.rows[bid].opens?.shout : null;
    if (lines?.length) this.shoutT -= RULES.sample;
    const shout = lines?.length > 0 && this.shoutT <= 0, fear = this.perk.fear;
    if (!shout && !fear) return;
    const px = P.inVehicle?.x ?? P.x, pz = P.inVehicle?.z ?? P.z;
    let by = null, bd = 14, scared = 0;
    for (const c of g.chars) {
      if (!c.alive || c === P || c.npc || c.inVehicle || c.faction === 'zombie' || c.target === P || c.hold) continue;
      const dx = c.x - px, dz = c.z - pz;
      if (Math.abs(dx) > 14 || Math.abs(dz) > 14) continue;
      if (c.fi >= 0 && F.playerHostile[c.fi]) continue;
      const d = Math.hypot(dx, dz);
      if (fear && !c.weapon && d < 10 && !(c.flee > 0) && scared < 4) { c.flee = 4 + Math.random() * 3; c.fleeX = px; c.fleeZ = pz; scared++; }
      if (shout && d < bd) { bd = d; by = c; }
    }
    if (by) {
      const line = lines[Math.floor(Math.random() * lines.length)];
      g.feedback?.floater(by.x, by.z, line, 'bark');
      g.emit('shout', { by: by.id, role: bid, line });
      this.shoutT = RULES.shoutEvery[0] + Math.random() * (RULES.shoutEvery[1] - RULES.shoutEvery[0]);
    }
    if (scared) g.emit('scattered', { n: scared, role: 'butcher' });
  }

  // ---- tiers -----------------------------------------------------------------------------------------------------
  // Renown to tier, with hysteresis: up at the line, down only under keep x the line. A failed gate suspends what
  // the role opens without touching its renown. Toasts follow the ACTIVE tier (what the world acts on).
  evaluate(id, quiet = false) {
    const row = this.rows[id], s = this.st[id], T = row.tiers, keep = row.keep ?? RULES.keep;
    let t = s.tier;
    while (t < 3 && s.r >= T[t]) t++;
    while (t > 0 && s.r < T[t - 1] * keep) t--;
    const susp = t > 0 && row.requires ? this.cond(row.requires) : null;
    const was = s.tier, wasAct = s.active, act = susp ? 0 : t;
    if (t !== was) this.g.emit('roleTier', { role: id, from: ROLE_TIERS[was], to: ROLE_TIERS[t], renown: +s.r.toFixed(1), suspended: susp });
    const suspChanged = susp !== s.susp;
    s.tier = t; s.susp = susp;
    if (!t) s.wasSusp = false; // faded right out while suspended: earning it again is news, not a reinstatement
    if (act !== wasAct) { s.active = act; this.fxDirty = true; this.announce(id, wasAct, act, susp, quiet); }
    if (t !== was || act !== wasAct || suspChanged) this.version++;
  }

  announce(id, from, to, susp, quiet) {
    const g = this.g, row = this.rows[id], W = RULES.words;
    const say = (tpl, extra = {}) => tpl.replaceAll('{a}', article(row.name)).replaceAll('{NAME}', row.name.toUpperCase()).replaceAll('{why}', String(extra.why ?? '').toUpperCase());
    if (to > from) {
      const back = this.st[id].wasSusp && from === 0;
      if (!quiet) g.hud?.toast?.(back ? say(W.reinstated) : say(W.up[to]), 'job');
      g.emit(from === 0 ? 'roleEarned' : 'roleUp', { role: id, name: row.name, tier: ROLE_TIERS[to], reinstated: back || undefined });
      if (to >= 2 && row.opens?.radio?.news) { this.news = this.news.filter((n) => n.id !== id); this.news.push({ id, tier: to }); }
    } else {
      if (to === 0 && susp) { if (!quiet) g.hud?.toast?.(say(W.suspended, { why: susp }), 'warn'); g.emit('roleSuspended', { role: id, name: row.name, why: susp }); }
      else if (!quiet) g.hud?.toast?.(say(W.down[to]), 'warn');
      g.emit(to === 0 ? 'roleLost' : 'roleDown', { role: id, name: row.name, from: ROLE_TIERS[from], tier: ROLE_TIERS[to], why: susp ?? 'faded' });
    }
    this.st[id].wasSusp = to === 0 && !!susp;
  }

  // ---- what the roles open ---------------------------------------------------------------------------------------
  // Recomputed only when an active tier changes (or a row, a save, an office): faction readings and overrides, perks,
  // director weights. quiet: no tier toasts from the factions (a load, a reset).
  apply(quiet = false) {
    this.fxDirty = false;
    const g = this.g, F = g.society?.factions, bias = this._bias, host = this._host, P = this.perk;
    bias.fill(0); host.fill(0);
    P.idMul = 1; P.carryKg = 0; P.healMul = 1; P.jumpPay = 1; P.fear = false; P.carjackFlee = false;
    this.weights = {};
    for (const id of this.ids) {
      const a = this.st[id].active;
      if (!a) continue;
      const o = this.rows[id].opens ?? {}, k = RULES.scale[a];
      if (F) for (const fid in o.factions ?? {}) {
        const i = F.index[fid], e = o.factions[fid];
        if (i === undefined) continue;
        bias[i] += (e.standing ?? 0) * k;
        if (e.hostile !== undefined && a >= tierIdx(e.from ?? 'known')) host[i] += e.hostile ? k : -k;
      }
      const pk = o.perks;
      if (pk) {
        if (pk.idMul) P.idMul *= 1 + (pk.idMul - 1) * k;
        if (pk.carryKg) P.carryKg += pk.carryKg * k;
        if (pk.healMul) P.healMul *= 1 + (pk.healMul - 1) * k;
        if (pk.jumpPay) P.jumpPay *= 1 + (pk.jumpPay - 1) * k;
        if (pk.fear && a >= tierIdx(pk.fearFrom ?? 'renowned')) P.fear = true;
        if (pk.carjackFlee && a >= tierIdx(pk.carjackFrom ?? 'known')) P.carjackFlee = true;
      }
      for (const tpl in o.director ?? {}) this.weights[tpl] = (this.weights[tpl] ?? 1) * (1 + (o.director[tpl] - 1) * k);
    }
    // Offices: an office's own perks ride on its role; most lapse with it (the sheriff takes the star back).
    for (const off of Object.keys(this.offices)) {
      const def = ROLE_OFFICES[off], a = def ? this.st[def.role]?.active ?? 0 : 0;
      if (def && !def.lasting && !a) { this.strip(off, quiet); continue; }
      if (a && def?.perks?.idMul) P.idMul *= def.perks.idMul;
    }
    if (F) {
      const cap = RULES.biasCap;
      for (let i = 0; i < F.ids.length; i++) { bias[i] = Math.max(-cap, Math.min(cap, bias[i])); host[i] = host[i] > 0.01 ? 1 : host[i] < -0.01 ? -1 : 0; }
      F.setRoleReading(bias, host, quiet);
    }
    g.skillsSys?.recompute?.();
    this.version++;
  }

  // What that faction's traders charge you, as a multiplier (1 = no change). The contract with the trade screen
  // (systems/trade.js): priceMul(trader's faction id, the trader) - buy prices x m, sell prices / m. No faction id:
  // the trader's own; none at all, or one no role names: only roles that change every price ('*') apply.
  priceMul(fid, trader = null) {
    fid ??= trader?.fid ?? null;
    let m = 1;
    for (const id of this.ids) {
      const a = this.st[id].active;
      if (!a) continue;
      const p = this.rows[id].opens?.prices;
      const v = p && (p[fid] ?? p['*']);
      if (v === undefined || v === null) continue;
      m *= 1 + (v - 1) * RULES.scale[a];
    }
    return Math.max(RULES.priceClamp[0], Math.min(RULES.priceClamp[1], m));
  }

  weight(tpl) { return this.weights[tpl] ?? 1; }

  // ---- reading the roles -----------------------------------------------------------------------------------------
  tier(id) { return this.st[id]?.active ?? 0; }
  atLeast(id, t = 'rumoured') { return (this.st[id]?.active ?? 0) >= tierIdx(t); }
  // The best-known active role at or above tier min (id), or null.
  bestId(min = 1) {
    let b = null;
    for (const id of this.ids) {
      const s = this.st[id];
      if (s.active < min) continue;
      if (!b || s.active > this.st[b].active || (s.active === this.st[b].active && s.r > this.st[b].r)) b = id;
    }
    return b;
  }
  // The active roles, best first (the HUD tapes, the PACK header).
  shown(n = 99) {
    return this.ids.filter((id) => this.st[id].active > 0)
      .sort((a, b) => this.st[b].active - this.st[a].active || this.st[b].r - this.st[a].r).slice(0, n)
      .map((id) => ({ id, name: this.rows[id].name, short: this.rows[id].short, tier: this.st[id].active, color: this.rows[id].color }));
  }

  // ---- what people say -------------------------------------------------------------------------------------------
  // A line about your best-known role (known or better) in this person's voice: their own roleLines first, then the
  // role's greeting for their faction, then its general one.
  lineFor(c) {
    const id = this.bestId(2);
    if (!id || !c) return null;
    const own = c.npc?.roleLines?.[id];
    if (own) return { id, line: own };
    const gl = this.rows[id].opens?.greet, lines = gl && (gl[c.fid] ?? gl.any);
    if (!lines?.length) return null;
    return { id, line: lines[((c.slot ?? 0) + this.day()) % lines.length] };
  }
  // At most once a game day per person per role: walking up (dialogue.js) or passing close (memory.js barks).
  greet(c) {
    const r = this.lineFor(c);
    if (!r) return null;
    const key = c.npc?.id ?? c.id, day = this.day(), was = this.said.get(key);
    if (was && was.day === day && was.role === r.id) return null;
    this.said.set(key, { day, role: r.id });
    this.g.emit('greet', { npc: key, role: r.id, line: r.line });
    return r.line;
  }
  // A named person who will not deal with what you are known as. Returns { role, line } or null.
  refusal(c) {
    if (!c?.npc) return null;
    for (const id of this.ids) {
      const a = this.st[id].active, rb = this.rows[id].opens?.refusedBy;
      if (!a || !rb?.ids?.includes(c.npc.id) || a < tierIdx(rb.from ?? 'known')) continue;
      return { role: id, line: c.npc.refuseRole?.[id] ?? rb.line };
    }
    return null;
  }
  // The morning digest names you by your best-known role; a role newly known is news.
  radioDigest() { const id = this.bestId(2); return id ? this.rows[id].opens?.radio?.digest ?? null : null; }
  // The oldest role news still true (a role that faded before the radio got to it is dropped). The director peeks
  // when it weighs what could air, and marks it read only when it does (newsRead).
  peekNews() {
    while (this.news.length) {
      const n = this.news[0], row = this.rows[n.id], s = this.st[n.id];
      const line = row && s.active >= 2 ? row.opens?.radio?.news?.[ROLE_TIERS[Math.min(n.tier, s.active)]] : null;
      if (line) return { role: n.id, line };
      this.news.shift();
    }
    return null;
  }
  newsRead(id) { this.news = this.news.filter((n) => n.id !== id); }
  // The director's role call: the best role somebody would come looking for. Returns { role, call } or null.
  callFor() {
    let best = null;
    for (const id in ROLE_CALLS) {
      const c = ROLE_CALLS[id], s = this.st[id];
      if (!s || s.active < tierIdx(c.from ?? 'known')) continue;
      if (!best || s.r > this.st[best].r) best = id;
    }
    return best ? { role: best, call: ROLE_CALLS[best] } : null;
  }

  // ---- jobs and offices ------------------------------------------------------------------------------------------
  day() { return this.g.society?.day ?? 0; }
  jobOpen(id) {
    const def = ROLE_JOBS[id], j = this.jobs[id];
    if (!def || j?.active || (def.auto && !def.office)) return false;
    if (def.daily && j?.day === this.day()) return false;
    return def.office ? !!this.offices[def.office] : this.atLeast(def.role, def.from ?? 'known');
  }
  jobActive(id) { return !!this.jobs[id]?.active; }
  jobReady(id) {
    const def = ROLE_JOBS[id], j = this.jobs[id];
    if (!def || !j?.active) return false;
    if (def.deliver) return (this.g.inventory?.carried.count(def.deliver) ?? 0) >= (def.deliverN ?? 1);
    return def.each ? j.n > 0 : j.n >= (def.need ?? 1);
  }
  jobStart(id) {
    if (!this.jobOpen(id)) return false;
    const def = ROLE_JOBS[id], g = this.g;
    this.jobs[id] = { active: true, n: 0, day: this.jobs[id]?.day ?? -1 };
    for (const [item, n] of def.kit ?? []) this.handOver(item, n);
    g.hud?.toast?.(`NEW JOB: ${def.title.split(':')[0].toUpperCase()}`, 'job');
    if (g.qol && !g.qol.customObjective) { g.qol.customObjective = { text: def.title, target: null }; this.orders = id; }
    g.emit('jobStarted', { job: id, role: def.role ?? null, office: def.office ?? null });
    this.version++;
    return true;
  }
  // Pay a job out on the giver's word. c: who you are talking to (the deed's counterparty). Returns the pay.
  jobPay(id, c = this.g.dialogue?.npc) {
    if (!this.jobReady(id)) return 0;
    const def = ROLE_JOBS[id], j = this.jobs[id], g = this.g, inv = g.inventory;
    if (def.deliver) for (let k = 0; k < (def.deliverN ?? 1); k++) { const i = inv.carried.slots.findIndex((s) => s.id === def.deliver); if (i >= 0) inv.take(inv.carried, i, 1); }
    if (def.deliver) inv.changed();
    const pay = def.each ? def.each * j.n : def.pay ?? 0;
    if (def.each) j.n = 0; else { j.active = false; j.day = this.day(); this.clearOrders(id); }
    if (pay) g.give({ cash: pay });
    if (def.deed && c) g.society?.deeds?.direct(def.deed.v, c, def.deed.m);
    g.emit('jobPaid', { job: id, pay });
    this.version++;
    return pay;
  }
  clearOrders(id) { if (this.orders === id && this.g.qol) { this.g.qol.customObjective = null; this.orders = null; } }
  // Something handed to you: into your pockets; what will not fit goes in the trunk you're in, else at your feet (with
  // a toast that says so: inventory.stow).
  handOver(item, n) {
    const g = this.g, inv = g.inventory, it = ITEMS[item];
    if (!inv || !it) return 0;
    const state = it.uses ? { left: it.uses } : {};
    if (inv.stow) return inv.stow(item, n, state);
    const put = inv.add(inv.carried, item, n, state);
    if (put < n) inv.add(inv.groundAt(g.player.x, g.player.z), item, n - put, state);
    inv.changed();
    return put;
  }

  office(id) { return !!this.offices[id]; }
  canSwear(id) { const def = ROLE_OFFICES[id]; return !!def && !this.offices[id] && this.atLeast(def.role, def.from ?? 'known'); }
  swear(id, by) {
    if (!this.canSwear(id)) return false;
    const def = ROLE_OFFICES[id], g = this.g;
    this.offices[id] = { since: +(this.day() * 24 + (g.sky?.time ?? 0)).toFixed(2), by: by ?? def.giver };
    if (def.item) this.handOver(def.item, 1);
    for (const [jid, jd] of Object.entries(ROLE_JOBS)) if (jd.office === id && jd.auto) this.jobs[jid] = { active: true, n: 0, day: -1 };
    if (def.sworn) g.hud?.toast?.(def.sworn, 'job');
    g.emit('sworn', { office: id, by: by ?? def.giver });
    this.apply();
    return true;
  }
  strip(id, quiet = false) {
    const def = ROLE_OFFICES[id], g = this.g, inv = g.inventory;
    if (!this.offices[id]) return;
    delete this.offices[id];
    if (def?.item && inv) { inv.carried.slots = inv.carried.slots.filter((s) => s.id !== def.item); inv.changed(); }
    for (const [jid, jd] of Object.entries(ROLE_JOBS)) if (jd.office === id && this.jobs[jid]) { this.jobs[jid].active = false; this.clearOrders(jid); }
    if (!quiet && def?.stripped) g.hud?.toast?.(def.stripped, 'hot');
    g.emit('officeLost', { office: id });
    this.version++;
  }
  // A favour somebody does once a game day (Mags's water for a samaritan). Read with dailyFree, spend with daily.
  dailyFree(key) { return this.dailyUsed[key] !== this.day(); }
  daily(key) { if (!this.dailyFree(key)) return false; this.dailyUsed[key] = this.day(); return true; }

  // ---- conditions ------------------------------------------------------------------------------------------------
  // null when every condition holds, else the first reason it doesn't (in words: the suspension toast reads it).
  cond(c) {
    if (!c) return null;
    const g = this.g, F = g.society?.factions, P = g.player;
    if (c.standing && F) for (const fid in c.standing) {
      const i = F.index[fid];
      if (i !== undefined && F.standing[i] < c.standing[fid]) return `${F.rows[i].short ?? F.rows[i].name} standing ${Math.round(F.standing[i])}, needs ${c.standing[fid]}`;
    }
    if (c.wanted !== undefined && g.wanted > c.wanted) return c.wanted === 0 ? 'wanted' : `wanted ${g.wanted} stars`;
    // The chronicle's tallies (actorFaction|verb|targetFaction, kept forever): at least so many, or fewer than so many.
    const T = g.society?.chronicle?.tally;
    const said = (key, n) => { const [, v, f] = key.split('|'); return `${n} ${v}${n === 1 ? '' : 's'} of ${F?.row(f)?.short ?? F?.row(f)?.name ?? (f || 'nobody')} on record`; };
    if (c.tally && T) for (const key in c.tally) { const n = T.get(key)?.n ?? 0; if (n < c.tally[key]) return `${said(key, n)}, needs ${c.tally[key]}`; }
    if (c.tallyUnder && T) for (const key in c.tallyUnder) { const n = T.get(key)?.n ?? 0; if (n >= c.tallyUnder[key]) return said(key, n); }
    if (c.skill) for (const sk in c.skill) if ((g.skillsSys?.lv[sk] ?? 0) < c.skill[sk]) return `${sk} under ${c.skill[sk]}`;
    if (c.carry && !this.carrying(c.carry)) return 'not carrying it';
    if (c.place) {
      const p = g.society?.placeAt(P.inVehicle?.x ?? P.x, P.inVehicle?.z ?? P.z) ?? '';
      if (!(p === c.place || (c.place.endsWith('_') && p.startsWith(c.place)))) return 'elsewhere';
    }
    if (c.driving) { const v = P.inVehicle; if (!v || v.driver !== P || !c.driving.includes(v.type)) return 'not at the wheel of one'; }
    if (c.night !== undefined && ((g.sky?.night ?? 0) > 0.6) !== c.night) return c.night ? 'daylight' : 'night';
    if (c.office && !this.offices[c.office]) return `no ${c.office}`;
    return null;
  }

  carrying(c) {
    let n = 0, kg = 0, value = 0;
    for (const s of this.g.inventory?.carried.slots ?? []) {
      const it = ITEMS[s.id];
      if (!it) continue;
      const ok = c.ids ? c.ids.includes(s.id) : Array.isArray(c.kind) ? c.kind.includes(it.kind) : c.kind ? it.kind === c.kind : true;
      if (!ok) continue;
      n += s.n; kg += slotKg(s); value += (it.value ?? 0) * s.n;
    }
    return (c.n === undefined || n >= c.n) && (c.kg === undefined || kg >= c.kg) && (c.value === undefined || value >= c.value);
  }

  // ---- agents and UI ---------------------------------------------------------------------------------------------
  // Everything a role opens, in words and numbers: what each faction makes of it now and at renowned, prices, perks,
  // the dialogue and jobs it unlocks (read off the NPC rows: a choice tagged with role/from), offices, director weights.
  opens(id, npcs = []) {
    const row = this.rows[id], o = row.opens ?? {}, a = this.st[id].active, k = RULES.scale[a];
    const factions = {};
    for (const [fid, e] of Object.entries(o.factions ?? {})) factions[fid] = { readsYou: +((e.standing ?? 0) * k).toFixed(1), atRenowned: e.standing ?? 0, ...(e.hostile !== undefined ? { [e.hostile ? 'shootOnSight' : 'holdFire']: `from ${e.from ?? 'known'}` } : {}) };
    const dialogue = [];
    for (const n of npcs) for (const [node, def] of Object.entries(n.nodes ?? {})) for (const ch of def.choices ?? []) if (ch.role === id) dialogue.push({ npc: n.id, who: n.name, short: callName(n.name), choice: typeof ch.t === 'function' ? ch.t(this.g) : ch.t, from: ch.from ?? 'known', node });
    for (const n of npcs) {
      if (n.roleLines?.[id]) dialogue.push({ npc: n.id, who: n.name, short: callName(n.name), greets: n.roleLines[id], from: 'known' });
      if (n.refuseRole?.[id]) dialogue.push({ npc: n.id, who: n.name, short: callName(n.name), refuses: n.refuseRole[id], from: o.refusedBy?.from ?? 'known' });
    }
    return {
      factions, prices: o.prices ?? {}, perks: o.perks ?? {}, director: o.director ?? {}, dialogue,
      jobs: Object.entries(ROLE_JOBS).filter(([, j]) => j.role === id || ROLE_OFFICES[j.office]?.role === id).map(([jid, j]) => ({ job: jid, giver: j.giver, title: j.title, from: j.from ?? (j.office ? `office ${j.office}` : 'known'), pay: j.pay ?? null, each: j.each ?? null, open: this.jobOpen(jid), active: this.jobActive(jid) })),
      offices: Object.entries(ROLE_OFFICES).filter(([, f]) => f.role === id).map(([fid, f]) => ({ office: fid, name: f.name, giver: f.giver, from: f.from, gives: f.gives, held: !!this.offices[fid] })),
      refusedBy: o.refusedBy ?? null, call: ROLE_CALLS[id] ?? null, radio: o.radio?.name ?? null,
    };
  }

  view(id, npcs = []) {
    const one = (rid) => {
      const row = this.rows[rid], s = this.st[rid], keep = row.keep ?? RULES.keep;
      const why = Object.entries(s.why).sort((a, b) => Math.abs(b[1].pts) - Math.abs(a[1].pts)).slice(0, 6).map(([what, w]) => ({ what, amount: +w.n.toFixed(2), renown: +w.pts.toFixed(1) }));
      return {
        id: rid, name: row.name, short: row.short, color: row.color, blurb: row.blurb ?? '',
        tier: ROLE_TIERS[s.tier], active: ROLE_TIERS[s.active], suspended: s.susp, renown: +s.r.toFixed(1),
        next: s.tier < 3 ? { tier: ROLE_TIERS[s.tier + 1], at: row.tiers[s.tier], need: +Math.max(0, row.tiers[s.tier] - s.r).toFixed(1) } : null,
        keepAbove: s.tier ? +(row.tiers[s.tier - 1] * keep).toFixed(1) : null, tiers: row.tiers,
        idleHours: +s.idle.toFixed(1), fadesAfterHours: RULES.grace, halfLifeDays: row.halfLife, requires: row.requires ?? null,
        why, opens: this.opens(rid, npcs),
      };
    };
    if (id) return this.rows[id] ? one(id) : null;
    const F = this.g.society?.factions;
    return {
      held: this.shown().map((r) => ({ id: r.id, name: r.name, tier: ROLE_TIERS[r.tier] })),
      best: this.bestId(1), roles: this.ids.map(one),
      priceMul: F ? Object.fromEntries(F.ids.filter((fid) => F.row(fid).memory !== 'none').map((fid) => [fid, +this.priceMul(fid).toFixed(3)])) : {},
      reading: F ? Object.fromEntries(F.ids.map((fid, i) => [fid, { standing: +F.standing[i].toFixed(1), roleBias: +F.bias[i].toFixed(1), override: F.roleHostile[i] > 0 ? 'shoot on sight' : F.roleHostile[i] < 0 ? 'hold fire' : null, tier: F.tiers[i] }])) : {},
      perks: { ...this.perk }, weights: { ...this.weights },
      jobs: Object.fromEntries(Object.entries(this.jobs).map(([jid, j]) => [jid, { ...j, ready: this.jobReady(jid) }])),
      offices: { ...this.offices }, kmDriven: +this.km.toFixed(2),
    };
  }

  // Set a role's renown directly (agents and tests: like `standing set=`). The tier follows through the normal
  // hysteresis, so this is a staging tool, not a way around the rules.
  setRenown(id, r) {
    const s = this.st[id];
    if (!s) return false;
    s.r = Math.max(0, Math.min(100, r)); s.idle = 0;
    this.evaluate(id);
    if (this.fxDirty) this.apply();
    return true;
  }

  reset() {
    for (const off of Object.keys(this.offices)) this.strip(off, true); // the star goes back too
    if (this.orders) this.clearOrders(this.orders);
    for (const id of this.ids) this.st[id] = blank();
    this.jobs = {}; this.offices = {}; this.dailyUsed = {}; this.news = []; this.said.clear();
    this.odoV = null; this.shoutT = 0;
    this.apply(true);
  }

  save() {
    return {
      st: Object.fromEntries(this.ids.map((id) => { const s = this.st[id]; return [id, { r: +s.r.toFixed(3), tier: s.tier, idle: +s.idle.toFixed(2), why: s.why }]; })),
      rows: this.ids.filter((id) => !ROLES[id]).map((id) => [id, this.rows[id]]), // a pack role travels with the save
      jobs: this.jobs, offices: this.offices, daily: this.dailyUsed, km: +this.km.toFixed(3),
    };
  }

  load(s) {
    if (!s) return;
    for (const [id, row] of s.rows ?? []) if (!this.rows[id]) this.register(id, row, true);
    this.index();
    for (const id of this.ids) {
      const v = s.st?.[id];
      this.st[id] = blank();
      if (v) Object.assign(this.st[id], { r: v.r ?? 0, tier: v.tier ?? 0, idle: v.idle ?? 0, why: v.why ?? {} });
    }
    this.jobs = JSON.parse(JSON.stringify(s.jobs ?? {})); this.offices = JSON.parse(JSON.stringify(s.offices ?? {}));
    this.dailyUsed = { ...(s.daily ?? {}) }; this.km = s.km ?? 0; this.news = []; this.odoV = null;
    // The saved tier stands (it already went through the hysteresis); only the gates are asked again. No toasts.
    for (const id of this.ids) {
      const st = this.st[id], req = this.rows[id].requires;
      st.susp = st.tier > 0 && req ? this.cond(req) : null;
      st.active = st.susp ? 0 : st.tier; st.wasSusp = !!st.susp;
    }
    this.apply(true);
  }
}

function blank() { return { r: 0, tier: 0, active: 0, susp: null, idle: 0, why: {}, wasSusp: false }; }

// What people call a named person: no nickname in quotes, no title ("Doc Lupe Reyes" -> Reyes, "Old Tomás Varela" -> Tomás).
function callName(name = '') {
  const w = name.replace(/"[^"]*"/g, '').trim().split(/\s+/);
  return ['Sheriff', 'Doc'].includes(w[0]) ? w[w.length - 1] : w[0] === 'Old' ? w[1] ?? w[0] : w[0];
}
