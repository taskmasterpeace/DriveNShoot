import { EVENTS } from '../data/events.js';
import { outfit } from './characters.js';
import { K } from './chronicle.js';
import { HALF } from '../world/city.js';

// The director (docs/design/WEB_WORLD_MEMORY.md §3.6, phase 3): events that answer what the world knows. It reads
// standings, tallies and the chronicle - never the whole log per frame - evaluates every 10 s, paces itself (no
// threat while someone is already shooting at you, never more than two threats, never past the character budget)
// and writes every outcome back into the chronicle.
const EVAL_EVERY = 10, MIN_FREE_SLOTS = 10, MAX_THREATS = 2;

export class Director {
  constructor(game) {
    this.g = game;
    this.active = [];
    this.cool = {};          // key → sim time it is free again
    this.nextEval = 20;
    this.checkT = 0;
    this.paused = false;
    this.seq = 0;
    this.lastNewsSeq = 0;
    this.lastTiers = null;
  }

  get S() { return this.g.society; }

  update(dt) {
    if ((this.checkT -= dt) <= 0) { this.checkT = 0.5; this.track(); }
    if (this.paused) return;
    if ((this.nextEval -= dt) <= 0) { this.nextEval = EVAL_EVERY; this.evaluate(); }
  }

  // ---- eligibility -------------------------------------------------------------------------------------
  calm() {
    const P = this.g.player;
    for (const c of this.g.chars) if (c.alive && c.target === P) return false;
    return true;
  }

  threats() { return this.active.filter((e) => EVENTS[e.tpl].pace === 'threat').length; }

  cooled(key) { return (this.cool[key] ?? 0) <= this.g.time; }

  // Which templates could fire now, with their bindings. why: a map of template → the reason it can't.
  eligible(why = {}) {
    const g = this.g, P = g.player, out = [];
    if (!P.alive || g.dialogue.active) { why.all = !P.alive ? 'player down' : 'in a conversation'; return out; }
    for (const [tpl, def] of Object.entries(EVENTS)) {
      if (!this.cooled(`tpl:${tpl}`)) { why[tpl] = 'cooling down'; continue; }
      if (def.pace === 'threat') {
        if (!this.cooled('global')) { why[tpl] = 'global cooldown'; continue; }
        if (this.threats() >= MAX_THREATS) { why[tpl] = 'two threats already running'; continue; }
        if (g.freeSlots.length < MIN_FREE_SLOTS) { why[tpl] = 'character budget'; continue; }
        if (!this.calm()) { why[tpl] = 'already under fire'; continue; }
      } else if (this.threats() > 0) { why[tpl] = 'a threat is running'; continue; }
      const bind = this[`bind_${tpl}`]?.(def, why);
      if (bind) out.push({ tpl, weight: def.weight ?? 1, bind });
    }
    return out;
  }

  bind_hunters(def, why) {
    const F = this.S.factions, P = this.g.player;
    let best = null;
    for (let i = 0; i < F.ids.length; i++) {
      const row = F.rows[i], s = F.standing[i];
      if (!row.hunters || s > def.angerAtMost || s > row.start - def.angerBelowStart) continue;
      if (!this.cooled(`hunters:${row.id}`)) continue;
      if (row.home && this.S.placeAt(P.x, P.z) === row.home) continue; // in their own town they just shoot you
      if (!best || s < F.standing[best.i]) best = { i, fid: row.id };
    }
    if (!best) why.hunters = 'no faction angry enough to hunt';
    return best;
  }

  bind_dead_draw_dead(def, why) {
    const g = this.g, P = g.player;
    if ((g.sky.night ?? 0) < def.nightAtLeast) { why.dead_draw_dead = 'daylight'; return null; }
    const place = this.S.placeAt(P.x, P.z), day = this.S.chronicle.digests.at(-1);
    const n = day && day.day === this.S.day ? day.placeKills?.[place] ?? 0 : 0;
    if (n < def.killsToday) { why.dead_draw_dead = `${n}/${def.killsToday} kills here today`; return null; }
    return { place };
  }

  bind_radio_news(def, why) {
    const item = this.newsItem(def);
    if (!item) why.radio_news = 'nothing new to report';
    return item;
  }

  // ---- picking and firing ----------------------------------------------------------------------------
  evaluate() {
    const list = this.eligible();
    if (!list.length) return null;
    let r = Math.random() * list.reduce((s, e) => s + e.weight, 0);
    for (const e of list) if ((r -= e.weight) <= 0) return this.fire(e.tpl, e.bind);
    return this.fire(list[0].tpl, list[0].bind);
  }

  // Fire a template now (bind optional: computed when missing). Returns the event, or throws a readable reason.
  fire(tpl, bind) {
    const def = EVENTS[tpl];
    if (!def) throw new Error(`unknown event; known: ${Object.keys(EVENTS).join(',')}`);
    if (!bind) { const why = {}; bind = this[`bind_${tpl}`]?.(def, why); if (!bind) throw new Error(`${tpl} has nothing to bind: ${why[tpl] ?? 'no reason given'}`); }
    const ev = { id: `ev${++this.seq}`, tpl, bind, t0: this.g.time, members: [], outcome: null };
    this[`spawn_${tpl}`](def, ev);
    this.cool[`tpl:${tpl}`] = this.g.time + def.cooldown.self;
    if (def.pace === 'threat') this.cool.global = this.g.time + def.cooldown.global;
    if (def.timeout || ev.members.length) this.active.push(ev);
    this.g.emit('director', { event: ev.id, tpl, phase: 'start', bind: this.plainBind(ev), members: ev.members.map((c) => c.id) });
    return ev;
  }

  plainBind(ev) { const b = ev.bind; return b.fid ? { faction: b.fid } : b.place ? { place: b.place } : b.seq ? { record: b.seq } : {}; }

  ringPoint(lo, hi) {
    const g = this.g, P = g.player, p = { x: 0, z: 0 };
    for (let k = 0; k < 16; k++) {
      const a = Math.random() * Math.PI * 2, r = lo + Math.random() * (hi - lo);
      p.x = P.x + Math.sin(a) * r; p.z = P.z + Math.cos(a) * r;
      if (Math.abs(p.x) > HALF - 12 || Math.abs(p.z) > HALF - 12) continue;
      if ((g.water?.depthAt(p.x, p.z) ?? 0) > 0.3) continue;
      const x0 = p.x, z0 = p.z;
      g.statics.resolveCircle(p, 0.6);
      if (Math.hypot(p.x - x0, p.z - z0) < 0.5) return p;
    }
    return null;
  }

  spawn_hunters(def, ev) {
    const g = this.g, F = this.S.factions, row = F.row(ev.bind.fid), hd = row.hunters, P = g.player;
    const tierBelow = F.tiers[F.index[row.id]] === 'hunted' ? 1 : 0;
    const n = Math.min(def.squad.max, def.squad.base + def.squad.perTierBelowHostile * tierBelow + ((g.sky.night ?? 0) > 0.6 ? def.squad.night : 0));
    const at = this.ringPoint(def.ring[0], def.ring[1]);
    if (!at) throw new Error('no open ground to send hunters from');
    const pick = () => { let r = Math.random(); for (const [w, p] of Object.entries(hd.weapons)) if ((r -= p) <= 0) return w; return Object.keys(hd.weapons)[0]; };
    for (let k = 0; k < n; k++) {
      const x = at.x + (Math.random() - 0.5) * 6, z = at.z + (Math.random() - 0.5) * 6, weapon = pick();
      const c = hd.faction === 'raider' ? g.spawnRaider(x, z, Math.random, weapon)
        : g.addChar({ x, z, faction: hd.faction, weapon, hp: hd.hp ?? 100, colors: outfit(hd.faction), name: hd.name, flag: g.randomFlag(Math.random) });
      if (!c) break;
      c.name = hd.name; c.fid = row.id; F.assign(c);
      if (hd.hp) c.hp = c.maxHp = hd.hp;
      Object.assign(c, { target: P, grudge: P, state: 'fight', leash: def.leash, hunterOf: ev.id, react: 1 });
      ev.members.push(c);
    }
    const name = row.name.toUpperCase();
    g.hud?.toast?.(def.toast.replace('{faction}', name), 'hot');
    this.radio(def.radio.replace('{faction}', row.name), 3);
  }

  spawn_dead_draw_dead(def, ev) {
    const g = this.g, at = this.ringPoint(def.distance, def.distance + 20);
    if (!at) throw new Error('no open ground for the herd');
    const n = def.herd.count[0] + Math.floor(Math.random() * (def.herd.count[1] - def.herd.count[0] + 1));
    const ids = g.zombies.horde(at.x, at.z, n, def.herd.runners, def.herd.radius) ?? [];
    for (const id of ids) { const c = g.chars.find((x) => x.id === id); if (c) { c.ztarget = g.player; ev.members.push(c); } }
    const place = this.S.places[ev.bind.place]?.name ?? 'the flats';
    g.hud?.toast?.(def.toast, 'hot');
    this.radio(def.radio.replace('{place}', place), 2);
  }

  spawn_radio_news(def, ev) {
    this.radio(ev.bind.line, 0);
    if (ev.bind.seq) this.lastNewsSeq = Math.max(this.lastNewsSeq, ev.bind.seq);
    if (ev.bind.tiers) this.lastTiers = ev.bind.tiers;
  }

  radio(line, delay) {
    const say = () => { this.g.hud?.subtitle?.(`${EVENTS.radio_news.station} — ${line}`, 7); this.g.emit('radio', { line }); };
    if (delay > 0) setTimeout(say, delay * 1000); else say();
  }

  // The newest notable thing nobody has broadcast: a legend record, or a faction that changed its mind about you.
  newsItem(def) {
    const S = this.S, F = S.factions, L = def.lines;
    const tiers = F.ids.map((_, i) => F.tiers[i]).join(',');
    if (this.lastTiers && this.lastTiers !== tiers) {
      const before = this.lastTiers.split(',');
      for (let i = 0; i < F.ids.length; i++) {
        if (before[i] && before[i] !== F.tiers[i] && F.rows[i].memory !== 'none') {
          return { line: L.tier.replace('{faction}', F.rows[i].name).replace('{tier}', F.tiers[i]), tiers };
        }
      }
    }
    if (!this.lastTiers) this.lastTiers = tiers;
    for (let i = S.chronicle.legend.length - 1; i >= 0; i--) {
      const r = S.chronicle.legend[i];
      if (r.seq <= this.lastNewsSeq) break;
      if (r.src === 'rumor' || r.k & K.director) continue;
      const set = r.a !== 'player' ? L.world : r.k & K.unwitnessed ? L.unwitnessed : L.witnessed;
      const t = set[r.v];
      if (!t) continue;
      const who = r.on || 'somebody', place = S.places[r.p]?.name ?? 'the flats', faction = F.row(r.of)?.name ?? 'their people';
      return { seq: r.seq, line: t.replaceAll('{who}', who).replaceAll('{place}', place).replaceAll('{faction}', faction) };
    }
    return null;
  }

  // ---- outcomes ----------------------------------------------------------------------------------------
  track() {
    if (!this.active.length) return;
    const g = this.g;
    for (const ev of [...this.active]) {
      const def = EVENTS[ev.tpl], alive = ev.members.filter((c) => c.alive && g.chars.includes(c));
      let outcome = null;
      if (ev.members.length && !alive.length) outcome = 'success';
      else if (!g.player.alive) outcome = 'fail';
      else if (def.timeout && g.time - ev.t0 > def.timeout) outcome = 'timeout';
      if (outcome) this.resolve(ev, outcome, alive);
    }
  }

  resolve(ev, outcome, alive = []) {
    const g = this.g, def = EVENTS[ev.tpl], F = this.S.factions;
    ev.outcome = outcome;
    this.active.splice(this.active.indexOf(ev), 1);
    if (ev.bind.fid) this.cool[`hunters:${ev.bind.fid}`] = g.time + (def.cooldown.perFaction ?? 0);
    if (outcome === 'fail' && def.onPlayerDeath?.standing && ev.bind.fid) F.add(ev.bind.fid, def.onPlayerDeath.standing);
    if (outcome === 'timeout' || outcome === 'cancelled') {
      // The trail goes cold: the ones still out there go home (out of sight, they simply leave).
      for (const c of alive) {
        if (Math.hypot(c.x - g.player.x, c.z - g.player.z) > 60 || outcome === 'cancelled') g.removeChar(c);
        else { c.leash = undefined; c.hunterOf = undefined; }
      }
    }
    if (def.pace === 'threat') {
      this.S.chronicle.add({ t: +g.time.toFixed(2), day: this.S.day, hr: +g.sky.time.toFixed(2), a: ev.bind.fid ?? 'world', af: ev.bind.fid ?? '', v: `${ev.tpl}_${outcome}`,
        o: 'player', on: 'you', of: 'player', p: this.S.placeAt(g.player.x, g.player.z), x: +g.player.x.toFixed(1), z: +g.player.z.toFixed(1), m: ev.members.length, w: [], ws: 0, un: 0, k: K.director, src: 'director' });
    }
    g.emit('director', { event: ev.id, tpl: ev.tpl, phase: 'end', outcome, bind: this.plainBind(ev) });
  }

  cancel(id) {
    const ev = this.active.find((e) => e.id === id);
    if (!ev) return null;
    const alive = ev.members.filter((c) => c.alive && this.g.chars.includes(c));
    this.resolve(ev, 'cancelled', alive);
    return { cancelled: id, despawned: alive.length };
  }

  view() {
    const g = this.g, why = {};
    return {
      paused: this.paused, nextEvalIn: +this.nextEval.toFixed(1), calm: this.calm(), freeSlots: g.freeSlots.length,
      active: this.active.map((e) => ({ id: e.id, tpl: e.tpl, bind: this.plainBind(e), alive: e.members.filter((c) => c.alive).length, members: e.members.length, age: +(g.time - e.t0).toFixed(1) })),
      cooldowns: Object.fromEntries(Object.entries(this.cool).filter(([, t]) => t > g.time).map(([k, t]) => [k, +(t - g.time).toFixed(0)])),
      eligible: this.eligible(why).map((e) => ({ tpl: e.tpl, weight: e.weight, bind: e.bind.fid ? { faction: e.bind.fid } : e.bind.place ? { place: e.bind.place } : { line: e.bind.line } })),
      blocked: why,
    };
  }

  save() { return { cool: Object.fromEntries(Object.entries(this.cool).map(([k, t]) => [k, +(t - this.g.time).toFixed(1)])), lastNewsSeq: this.lastNewsSeq, lastTiers: this.lastTiers, seq: this.seq }; }

  load(s) {
    if (!s) return;
    this.active = [];
    this.cool = Object.fromEntries(Object.entries(s.cool ?? {}).map(([k, dt]) => [k, this.g.time + dt]));
    this.lastNewsSeq = s.lastNewsSeq ?? 0; this.lastTiers = s.lastTiers ?? null; this.seq = s.seq ?? this.seq;
  }
}
