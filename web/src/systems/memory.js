import { MEMORY_KINDS } from '../data/society.js';

// People remember (docs/design/WEB_WORLD_MEMORY.md §3.6, phase 2). A named character keeps up to 12 memories of the
// player - what they saw, what was done to them or theirs, what they heard - each fading on its own half-life.
// Opinion = 0.3 · their faction's standing + Σ memories, recomputed lazily (on a new memory or a new day), never per
// frame. Low enough and they won't deal with you; a memory with revenge in it makes an armed one shoot on sight.
const MAX_MEMS = 12;

export class Memory {
  constructor(game, factions) {
    this.g = game; this.F = factions;
    this.byNpc = new Map(); // npc id → { mems, vendetta, opinion, dirty, day }
  }

  now() { return (this.g.society?.day ?? 0) + (this.g.sky?.time ?? 0) / 24; }

  entry(id) {
    let e = this.byNpc.get(id);
    if (!e) { e = { mems: [], vendetta: false, opinion: 0, dirty: true, day: -1 }; this.byNpc.set(id, e); }
    return e;
  }

  charFor(id) { for (const c of this.g.chars) if (c.npc?.id === id) return c; return null; }

  // id: a named character's npc id. o: { weight, about (who it concerns, a name), heard (secondhand), seq }
  remember(id, kind, { weight = 1, about = '', heard = false, seq = 0 } = {}) {
    const def = MEMORY_KINDS[kind];
    if (!def || !id) return null;
    const e = this.entry(id), t = this.now();
    if (def.clears) e.mems = e.mems.filter((m) => m.kind !== def.clears);
    let m = e.mems.find((x) => x.kind === kind);
    if (m) {
      m.day = t; m.heard = m.heard && heard; m.about = about || m.about; m.seq = seq || m.seq;
      m.weight = def.stack ? Math.min(def.stack, m.weight + weight) : Math.max(m.weight, weight);
    } else {
      m = { kind, day: t, weight, about, heard, seq };
      e.mems.push(m);
      if (e.mems.length > MAX_MEMS) { e.mems.sort((a, b) => this.weightOf(b, t) - this.weightOf(a, t)); e.mems.length = MAX_MEMS; }
    }
    e.dirty = true;
    this.g.emit('memory', { npc: id, kind, heard, about: about || null });
    if ((def.revenge ?? 0) >= 0.8 && !e.vendetta) {
      e.vendetta = true;
      const c = this.charFor(id);
      if (c) c.vendetta = true;
      this.g.emit('vendetta', { npc: id, name: c?.npc?.name ?? id, kind, about: about || null });
    }
    return m;
  }

  forget(id, kind) {
    const e = this.byNpc.get(id);
    if (!e) return false;
    const n = e.mems.length;
    e.mems = kind ? e.mems.filter((m) => m.kind !== kind) : [];
    if (!e.mems.some((m) => (MEMORY_KINDS[m.kind].revenge ?? 0) >= 0.8)) { e.vendetta = false; const c = this.charFor(id); if (c) c.vendetta = false; }
    e.dirty = true;
    return e.mems.length !== n;
  }

  // How much one memory is still worth right now, in opinion points (signed).
  value(m, t = this.now()) { const d = MEMORY_KINDS[m.kind]; return d.base * m.weight * (m.heard ? 0.6 : 1) * 0.5 ** (Math.max(0, t - m.day) / d.days); }
  weightOf(m, t) { return Math.abs(this.value(m, t)); }

  opinion(c) {
    const standing = c.fi >= 0 ? this.F.reading(c.fi) : 0; // their people's reading of you: standing as your roles colour it
    const id = c.npc?.id, e = id && this.byNpc.get(id);
    if (!e) return 0.3 * standing;
    const day = Math.floor(this.now());
    if (e.dirty || e.day !== day) {
      let s = 0;
      const t = this.now();
      for (const m of e.mems) s += this.value(m, t);
      e.memSum = s; e.day = day; e.dirty = false;
    }
    return Math.max(-100, Math.min(100, 0.3 * standing + e.memSum));
  }

  refuses(c) { return !!c?.npc && this.opinion(c) < (c.npc.refuseBelow ?? -40); }

  // The memory that weighs most right now, and the line that goes with it.
  top(c) {
    const e = c?.npc && this.byNpc.get(c.npc.id);
    if (!e?.mems.length) return null;
    const t = this.now();
    let best = null, bv = 0;
    for (const m of e.mems) { const v = this.value(m, t); if (Math.abs(v) > Math.abs(bv)) { best = m; bv = v; } }
    if (!best) return null;
    return { kind: best.kind, value: bv, about: best.about, heard: best.heard, line: (MEMORY_KINDS[best.kind].say ?? '').replaceAll('{about}', best.about || 'people') };
  }

  // What they say when you walk up to talk, at most once a day per memory: the one that weighs most.
  remark(c) {
    const e = c?.npc && this.byNpc.get(c.npc.id), top = this.top(c);
    if (!e || !top?.line || Math.abs(top.value) < 12) return null;
    const day = Math.floor(this.now());
    if (e.saidDay === day && e.saidKind === top.kind) return null;
    e.saidDay = day; e.saidKind = top.kind;
    return top.line;
  }

  // A named person near the player says the thing on their mind - once a minute at most, only if it matters. With
  // nothing personal to say, they say what you are known for (roles.js: once a game day per role).
  maybeBark(c) {
    c.barkAt = this.g.time + 60;
    const top = this.top(c);
    if (!top || !top.line || Math.abs(top.value) < 18) {
      const line = this.g.roles?.greet(c);
      if (!line) return false;
      this.g.hud?.subtitle?.(`${c.npc.name}: ${line}`, 4);
      this.g.emit('bark', { npc: c.npc.id, kind: 'role', line });
      return true;
    }
    this.g.hud?.subtitle?.(`${c.npc.name}: ${top.line}`, 4);
    this.g.emit('bark', { npc: c.npc.id, kind: top.kind, line: top.line });
    return true;
  }

  // Hooks from deeds.js -------------------------------------------------------------------------------
  // What a named witness takes away from seeing a deed firsthand.
  witnessed(w, verb, target) {
    const id = w.npc?.id;
    if (!id || !target) return;
    const tid = target.npc?.id, about = target.npc?.name ?? target.name ?? '';
    const kin = tid && w.npc.kin?.includes(tid), friend = tid && w.npc.friends?.includes(tid);
    const downed = target.downedT > 0;
    if (target === w) {
      if (verb === 'hurt' || verb === 'kill') this.remember(id, 'shotMe');
      else if (verb === 'carjack' || verb === 'steal' || verb === 'rob') this.remember(id, 'robbedMe');
      else if (verb === 'rescue') this.remember(id, 'savedMe');
      else if (verb === 'heal') this.remember(id, 'helped'); // you patched them up (roles: the medic's work)
    } else if (kin) {
      if (verb === 'kill') this.remember(id, downed ? 'shotKin' : 'killedKin', { about });
      else if (verb === 'hurt') this.remember(id, 'shotKin', { about, weight: 0.6 });
      else if (verb === 'rescue') this.remember(id, 'savedKin', { about });
      else if (verb === 'heal') this.remember(id, 'savedKin', { about, weight: 0.5 });
    } else if (friend) {
      if (verb === 'kill') this.remember(id, downed ? 'shotKin' : 'killedFriend', { about, weight: downed ? 0.6 : 1 });
      else if (verb === 'rescue') this.remember(id, 'helped', { about });
    } else if (target.fid && target.fid === w.fid) {
      if (verb === 'kill' || verb === 'silence') this.remember(id, 'sawKill', { about });
      else if (verb === 'rescue') this.remember(id, 'helped', { about });
    }
  }

  // Word reaches the people it concerns: the victim's kin and friends, and the leaders of the faction that heard.
  heard(r) {
    if (!r.onpc && r.verb !== 'kill') return;
    for (const c of this.g.chars) {
      const n = c.npc;
      if (!n || c === r.witness) continue;
      const kin = r.onpc && n.kin?.includes(r.onpc), friend = r.onpc && n.friends?.includes(r.onpc);
      const leader = r.fid && c.fid === r.fid && this.F.row(r.fid)?.leaders?.includes(n.id);
      if (kin) this.remember(n.id, r.verb === 'kill' && !r.downed ? 'killedKin' : r.verb === 'rescue' ? 'savedKin' : 'shotKin', { about: r.on, heard: true, seq: r.seq });
      else if (friend && (r.verb === 'kill' || r.verb === 'hurt')) this.remember(n.id, r.verb === 'kill' && !r.downed ? 'killedFriend' : 'shotKin', { about: r.on, heard: true, seq: r.seq, weight: 0.8 });
      else if (leader && r.verb === 'kill' && r.of === r.fid) this.remember(n.id, 'sawKill', { about: r.on, heard: true, seq: r.seq });
    }
  }

  // A deal or a job done face to face: no witnesses needed, they were there.
  dealt(c, verb) {
    const id = c?.npc?.id;
    if (!id) return;
    if (verb === 'deliver' || verb === 'defend') this.remember(id, 'helped');
    else if (verb === 'trade') this.remember(id, 'traded');
    else if (verb === 'pay') this.remember(id, 'paidDebt');
    else if (verb === 'betray') this.remember(id, 'betrayed');
  }

  view(id) {
    const e = this.byNpc.get(id), c = this.charFor(id), t = this.now();
    return {
      npc: id, name: c?.npc?.name ?? id, faction: c?.fid ?? null, present: !!c,
      opinion: c ? +this.opinion(c).toFixed(1) : null, refuses: c ? this.refuses(c) : null, vendetta: !!e?.vendetta,
      top: c ? this.top(c) : null,
      memories: (e?.mems ?? []).map((m) => ({ kind: m.kind, day: +m.day.toFixed(2), weight: m.weight, about: m.about || null, heard: m.heard, now: +this.value(m, t).toFixed(1) })),
    };
  }

  save() { return [...this.byNpc].map(([id, e]) => ({ id, vendetta: e.vendetta, mems: e.mems })); }

  load(list) {
    this.byNpc.clear();
    for (const s of list ?? []) this.byNpc.set(s.id, { mems: s.mems ?? [], vendetta: !!s.vendetta, opinion: 0, dirty: true, day: -1 });
    for (const c of this.g.chars) if (c.npc) c.vendetta = !!this.byNpc.get(c.npc.id)?.vendetta;
  }
}
