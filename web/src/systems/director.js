import { EVENTS } from '../data/events.js';
import { outfit } from './characters.js';
import { K } from './chronicle.js';
import { HALF } from '../world/city.js';

// The director (docs/design/WEB_WORLD_MEMORY.md §3.6, phase 3): events that answer what the world knows. It reads
// standings, tallies and the chronicle - never the whole log per frame - evaluates every 10 s, paces itself (no
// threat while someone is already shooting at you, never more than two threats, never past the character budget)
// and writes every outcome back into the chronicle.
// ARRIVAL_GRACE: seconds of play before the director sends any threat. The game opens at dusk with "find the
// sheriff"; without it a Dustwolf raid could hit Rust Haven 20 s into a new game. (fireEvent skips pacing.)
const EVAL_EVERY = 10, MIN_FREE_SLOTS = 10, MAX_THREATS = 2, ARRIVAL_GRACE = 150;

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
    this.digestDay = null;   // a day whose digest is due at dawn
  }

  get S() { return this.g.society; }

  update(dt) {
    if ((this.checkT -= dt) <= 0) { this.checkT = 0.5; this.track(); }
    // The morning digest waits for dawn on the day after (and is dropped if the clock has run past that day).
    if (this.digestDay !== null && this.S.day === this.digestDay + 1 && this.g.sky.time >= EVENTS.radio_news.digest.at) this.readDigest();
    else if (this.digestDay !== null && this.S.day > this.digestDay + 1) this.digestDay = null;
    if (this.paused) return;
    if ((this.nextEval -= dt) <= 0) { this.nextEval = EVAL_EVERY; this.evaluate(); }
  }

  // ---- the morning digest (phase 5) --------------------------------------------------------------------
  newDay(day) { this.digestDay = day - 1; }

  // Yesterday in one breath, from the chronicle's day totals and its records of that day: how many died, where it
  // was worst, a camp that changed hands, a fight between factions, a feat. Returns the lines (open, body, close).
  digestLines(day) {
    const S = this.S, F = S.factions, T = EVENTS.radio_news.digest, C = S.chronicle;
    const d = C.digests.find((x) => x.day === day);
    const name = (fid) => (F.row(fid)?.name ?? 'somebody').replace(/^The /, 'the '); // mid-sentence: "the Dustwolves"
    const place = (p) => S.places[p]?.name ?? 'the flats';
    const ofDay = (verb) => C.query({ verb, limit: 64 }).filter((r) => r.day === day);
    const parts = [];
    const dead = d ? Object.values(d.kills).reduce((a, b) => a + b, 0) : 0;
    parts.push(dead < T.dead.length - 1 ? T.dead[dead] : T.dead[T.dead.length - 1].replace('{n}', dead));
    if (d?.worst && dead > 0 && d.worst.p) parts.push(T.worst.replace('{place}', place(d.worst.p)));
    const took = ofDay('took')[0];
    if (took) parts.push(T.took.replace('{a}', name(took.af)).replace('{place}', took.on || place(took.p)).replace('{b}', name(took.of)));
    else { const sk = ofDay('skirmish')[0]; if (sk) parts.push(T.skirmish.replace('{a}', name(sk.af)).replace('{b}', name(sk.of))); }
    const stunt = ofDay('stunt').find((r) => !(r.k & K.unwitnessed));
    if (stunt) parts.push(T.stunt.replace('{who}', stunt.on || 'a row of dead cars'));
    if (parts.length === 1 && dead === 0) parts[0] = T.quiet;
    const body = parts.join(', ').replace(/^./, (c) => c.toUpperCase()) + '.';
    return [T.open, body, T.close[day % T.close.length]];
  }

  readDigest() {
    const day = this.digestDay;
    this.digestDay = null;
    const lines = this.digestLines(day);
    lines.forEach((l, i) => this.radio(l, i * 7));
    this.g.emit('radioDigest', { day, lines });
    return lines;
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
        if (g.time < ARRIVAL_GRACE) { why[tpl] = 'the stranger only just got here'; continue; }
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

  bind_raid(def, why) {
    const g = this.g, F = this.S.factions, sim = this.S.sim, P = g.player;
    if ((g.sky.night ?? 0) < def.nightAtLeast) { why.raid = 'raiders ride after dark'; return null; }
    for (let i = 0; i < F.ids.length; i++) {
      const row = F.rows[i], target = row.sim?.raids, ti = F.index[target];
      if (!target || ti === undefined) continue;
      if (F.rel[i * 16 + ti] > -50) continue;
      if (sim.strength[i] < def.strengthAtLeast || sim.resources[i] < def.resourcesAtLeast) { why.raid = `${row.name} too weak to raid (${Math.round(sim.strength[i])} strong)`; continue; }
      const home = this.S.places[F.rows[ti].home]?.rect;
      const cx = home ? (home[0] + home[2]) / 2 : 0, cz = home ? (home[1] + home[3]) / 2 : 0;
      if (Math.hypot(P.x - cx, P.z - cz) > def.playerWithin) { why.raid = `you're too far from ${F.rows[ti].name} to answer`; continue; }
      if (!this.cooled(`raid:${row.id}`)) continue;
      return { fid: row.id, target, cx, cz };
    }
    why.raid ??= 'nobody strong enough at war';
    return null;
  }

  spawn_raid(def, ev) {
    const g = this.g, F = this.S.factions, b = ev.bind, row = F.row(b.fid), tgt = F.row(b.target);
    let at = null;
    for (let k = 0; k < 16 && !at; k++) {
      const a = Math.random() * Math.PI * 2, r = def.ring[0] + Math.random() * (def.ring[1] - def.ring[0]);
      const p = { x: b.cx + Math.sin(a) * r, z: b.cz + Math.cos(a) * r }, x0 = p.x, z0 = p.z;
      if (Math.abs(p.x) > HALF - 12 || Math.abs(p.z) > HALF - 12) continue;
      g.statics.resolveCircle(p, 0.6);
      if (Math.hypot(p.x - x0, p.z - z0) < 0.5 && Math.hypot(p.x - g.player.x, p.z - g.player.z) > 60) at = p;
    }
    if (!at) throw new Error('no open ground to raid from');
    const n = def.squad[0] + Math.floor(Math.random() * (def.squad[1] - def.squad[0] + 1));
    // They ride for the edge of the town facing them, and fight whatever's hostile on the way in.
    const d = Math.hypot(at.x - b.cx, at.z - b.cz) || 1, edge = 84;
    const gx = b.cx + ((at.x - b.cx) / d) * edge, gz = b.cz + ((at.z - b.cz) / d) * edge;
    for (let k = 0; k < n; k++) {
      const c = g.spawnRaider(at.x + (Math.random() - 0.5) * 8, at.z + (Math.random() - 0.5) * 8, Math.random);
      if (!c) break;
      c.home = { x: gx + (Math.random() - 0.5) * 10, z: gz + (Math.random() - 0.5) * 10 }; c.wx = c.home.x; c.wz = c.home.z; c.timer = 99;
      c.leash = def.leash; c.raidOf = ev.id;
      ev.members.push(c);
    }
    this.cool[`raid:${b.fid}`] = g.time + def.cooldown.self;
    const say = (s) => s.replaceAll('{raider}', row.name).replaceAll('{target}', tgt.name);
    g.hud?.toast?.(say(def.toast).toUpperCase(), 'hot');
    this.radio(say(def.radio), 2);
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
    if (ev.tpl === 'raid') {
      // A beaten raid costs the band fighters and stores; one that runs its course empties the town's.
      const sim = this.S.sim, ri = F.index[ev.bind.fid], ti = F.index[ev.bind.target], e = outcome === 'success' ? def.beaten : outcome === 'timeout' ? def.took : null;
      if (e) {
        if (e.raiderStrength) sim.strength[ri] = Math.max(0, sim.strength[ri] + e.raiderStrength);
        if (e.raiderResources) sim.resources[ri] = Math.max(0, sim.resources[ri] + e.raiderResources);
        if (e.targetResources) sim.resources[ti] = Math.max(0, Math.min(100, sim.resources[ti] + e.targetResources));
      }
    }
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

  save() { return { cool: Object.fromEntries(Object.entries(this.cool).map(([k, t]) => [k, +(t - this.g.time).toFixed(1)])), lastNewsSeq: this.lastNewsSeq, lastTiers: this.lastTiers, seq: this.seq, digestDay: this.digestDay }; }

  load(s) {
    if (!s) return;
    this.active = [];
    this.cool = Object.fromEntries(Object.entries(s.cool ?? {}).map(([k, dt]) => [k, this.g.time + dt]));
    this.lastNewsSeq = s.lastNewsSeq ?? 0; this.lastTiers = s.lastTiers ?? null; this.seq = s.seq ?? this.seq;
    this.digestDay = s.digestDay ?? null;
  }
}
