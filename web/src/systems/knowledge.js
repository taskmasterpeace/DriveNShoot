import { CHANNELS, FACT_KINDS, PULL_RULES as R } from '../data/pulls.js';

// THE KNOWLEDGE MODEL (law 6: nobody knows what they weren't told; docs/design/WEB_PULLS.md §3.1).
// A HOLDER is anyone who can know a thing: you ('player'), a town ('town:<id>'), its board ('board:<id>'), a barkeep or a
// drinker ('bar:<building>', 'p:<pull>:<n>'), a road person. A FACT is the world's own record of a thing that is so
// (what, where, who, when). A holder never holds the fact itself: it holds a COPY with its own source (the channel, who
// told it, where it was heard), the hour it heard it and a confidence. A copy can only be made from another copy (tell),
// from seeing the thing (see), from a broadcast heard inside its range (broadcast), or from the grapevine's truck once
// the road between two towns has been driven (wire). A copy's where is where the thing was WHEN it was seen: the
// hitchhiker has walked on since, and the copy does not know it.
// Nothing here runs per frame: the pulls system calls tick() on its own half-second, and wire() on the game hour.

let NID = 0;
const r1 = (v) => Math.round(v * 10) / 10;

export class Knowledge {
  constructor(g) {
    this.g = g;
    this.facts = new Map();   // fact id -> the world's own record { id, what, subject, text, where, who, when, life, truth }
    this.holders = new Map(); // holder id -> { id, name, kind, x, z, facts: [copy], cap }
    this.wireQ = [];          // the grapevine's trucks on the road: { fact, from, to, at (arrival hour), hops, conf }
    this.stats = { told: 0, heard: 0, broadcast: 0, wired: 0, arrived: 0, refused: 0 };
  }
  hours() { return (this.g.society?.day ?? 0) * 24 + (this.g.sky?.time ?? 0); }

  // ---- holders ----------------------------------------------------------------------------------------------------------
  holder(id, o = {}) {
    let h = this.holders.get(id);
    if (!h) { h = { id, name: o.name ?? id, kind: o.kind ?? 'person', x: o.x ?? 0, z: o.z ?? 0, facts: [], cap: o.cap ?? R.personHolds, radio: !!o.radio }; this.holders.set(id, h); }
    else { if (o.x !== undefined) { h.x = o.x; h.z = o.z; } if (o.name) h.name = o.name; if (o.radio !== undefined) h.radio = !!o.radio; }
    return h;
  }
  drop(id) { this.holders.delete(id); }

  // ---- facts --------------------------------------------------------------------------------------------------------------
  // The world records a thing that is so. Nobody holds it yet: someone has to see it, or the one it happened to has to say it.
  record(o) {
    const id = o.id ?? `f${++NID}`;
    const f = { id, what: o.what, subject: o.subject ?? null, text: o.text ?? '', where: o.where ? { x: Math.round(o.where.x), z: Math.round(o.where.z), place: o.where.place ?? null } : null, who: o.who ?? null, when: o.when ?? this.hours(), life: o.life ?? FACT_KINDS[o.what]?.life ?? 24, ends: o.ends ?? null, truth: o.truth ?? true, data: o.data ?? null };
    this.facts.set(id, f);
    return f;
  }
  fact(id) { return this.facts.get(id) ?? null; }

  // Does this holder hold a copy of this fact (or, with subject=, any copy about that pull)?
  holds(hid, fid) { const h = this.holders.get(hid); return !!h && h.facts.some((c) => c.id === fid); }
  copyOf(hid, fid) { return this.holders.get(hid)?.facts.find((c) => c.id === fid) ?? null; }
  about(hid, subject) { const h = this.holders.get(hid); return h ? h.facts.filter((c) => c.subject === subject) : []; }

  // Put a copy into a holder. The only door in: see(), tell(), broadcast(), wire() all come through here.
  put(hid, f, src, conf, hops) {
    const h = this.holders.get(hid);
    if (!h || !f) return null;
    const old = h.facts.find((c) => c.id === f.id);
    if (old) { if (conf > old.conf) { old.conf = conf; old.source = src; } return old; } // already known: a better source only firms it up
    const copy = { id: f.id, what: f.what, subject: f.subject, text: f.text, where: f.where ? { ...f.where } : null, who: f.who, when: f.when, life: f.life, ends: f.ends ?? null, heard: this.hours(), source: src, conf: r1(conf * 100) / 100, hops };
    h.facts.push(copy);
    if (h.facts.length > h.cap) h.facts.shift(); // the oldest goes out of mind
    if (hid === 'player') { this.stats.heard++; this.g.emit?.('factHeard', { fact: f.id, what: f.what, channel: src.channel, from: src.from }); }
    return copy;
  }

  // Seeing it: the strongest source there is. (where: the spot it was seen, now.)
  // A fresh sighting of a thing already known moves the copy's spot and hour to now (you saw where it is).
  see(hid, f, where = null) {
    const seen = where ? { ...f, where: { x: Math.round(where.x), z: Math.round(where.z), place: f.where?.place ?? null }, when: this.hours() } : f;
    const src = { channel: 'saw', from: hid, fromName: 'your own eyes', at: where ? { x: Math.round(where.x), z: Math.round(where.z) } : null };
    const old = this.copyOf(hid, f.id);
    if (old) { old.source = src; old.conf = 1; old.hops = 0; if (seen.where) { old.where = seen.where; old.when = seen.when; } return old; }
    return this.put(hid, seen, src, CHANNELS.saw.conf, 0);
  }

  // Telling it face to face. The teller must HOLD it (nobody passes on what they never had) and stand within reach.
  tell(fromId, toId, fid, channel = 'said', { force = false } = {}) {
    const a = this.holders.get(fromId), b = this.holders.get(toId), C = CHANNELS[channel];
    const mine = a?.facts.find((c) => c.id === fid);
    if (!a || !b || !mine || !C) { this.stats.refused++; return null; }
    if (!force && C.range !== undefined && Math.hypot(a.x - b.x, a.z - b.z) > C.range + 2) { this.stats.refused++; return null; }
    if (mine.hops >= R.hopsMax + 2) { this.stats.refused++; return null; }
    const f = this.facts.get(fid) ?? mine;
    // The copy passed on is the teller's copy: its where and when, not the world's (they don't know it moved).
    const out = this.put(toId, { ...f, where: mine.where, when: mine.when, text: mine.text }, { channel, from: fromId, fromName: a.name, at: { x: Math.round(b.x), z: Math.round(b.z) } }, mine.conf * C.conf, mine.hops + 1);
    if (out) this.stats.told++;
    return out;
  }

  // A broadcast: every holder with a set inside the range hears it (the player only with a radio they can hear).
  broadcast(f, x, z, range = CHANNELS.radio.range, from = 'radio') {
    const heard = [];
    for (const h of this.holders.values()) {
      if (Math.hypot(h.x - x, h.z - z) > range) continue;
      const set = h.id === 'player' ? !!this.g.radio?.canHear?.() : h.radio;
      if (!set) continue;
      if (this.put(h.id, f, { channel: 'radio', from, fromName: from, at: { x: Math.round(h.x), z: Math.round(h.z) } }, CHANNELS.radio.conf, 1)) heard.push(h.id);
    }
    this.stats.broadcast++;
    return heard;
  }

  // The grapevine: a town's fresh news goes out on the next truck to each town it trades with. It ARRIVES after the road
  // between them is driven at the grapevine's speed; until then the other town does not have it.
  sendWire(fromId, toId, fid) {
    const a = this.holders.get(fromId), b = this.holders.get(toId), mine = a?.facts.find((c) => c.id === fid);
    if (!a || !b || !mine || mine.hops >= R.hopsMax) return null;
    if (b.facts.some((c) => c.id === fid) || this.wireQ.some((w) => w.fid === fid && w.to === toId)) return null;
    const km = Math.hypot(a.x - b.x, a.z - b.z), at = this.hours() + km / CHANNELS.grapevine.speed;
    const w = { fid, from: fromId, fromName: a.name, to: toId, at, sent: this.hours(), hops: mine.hops + 1, conf: mine.conf * CHANNELS.grapevine.conf, where: mine.where, when: mine.when, text: mine.text };
    this.wireQ.push(w); this.stats.wired++;
    return w;
  }
  // Deliver what has arrived (called on the pulls tick). Returns how many landed.
  deliver() {
    const now = this.hours(); let n = 0;
    for (let i = this.wireQ.length - 1; i >= 0; i--) {
      const w = this.wireQ[i];
      if (w.at > now) continue;
      this.wireQ.splice(i, 1);
      const f = this.facts.get(w.fid); if (!f) continue;
      if (this.put(w.to, { ...f, where: w.where, when: w.when, text: w.text }, { channel: 'grapevine', from: w.from, fromName: w.fromName }, w.conf, w.hops)) { n++; this.stats.arrived++; }
    }
    return n;
  }
  inFlight(fid) { return this.wireQ.filter((w) => w.fid === fid).map((w) => ({ to: w.to, at: r1(w.at), sent: r1(w.sent) })); }

  // A copy as the board shows it: how old the news is, how far its spot is from (x, z), whether its told window is up.
  view(copy, x = null, z = null) {
    const now = this.hours();
    // a told window (a medic call's hours) ends when it ends; a sighting only makes the news fresher
    const age = now - copy.when, left = (copy.ends ?? copy.when + copy.life) - now;
    return {
      id: copy.id, what: copy.what, subject: copy.subject, text: copy.text, who: copy.who, where: copy.where,
      channel: copy.source.channel, from: copy.source.fromName ?? copy.source.from, heardAt: copy.source.at ?? null,
      ageH: r1(age), heardH: r1(now - copy.heard), leftH: r1(left), expired: left <= 0, conf: copy.conf,
      distM: copy.where && x !== null ? Math.round(Math.hypot(copy.where.x - x, copy.where.z - z)) : null,
    };
  }

  // ---- save -------------------------------------------------------------------------------------------------------------
  save() {
    return {
      nid: NID,
      facts: [...this.facts.values()],
      holders: [...this.holders.values()].map((h) => ({ id: h.id, name: h.name, kind: h.kind, x: Math.round(h.x), z: Math.round(h.z), cap: h.cap, radio: h.radio, facts: h.facts })),
      wire: this.wireQ,
    };
  }
  load(s) {
    this.facts.clear(); this.holders.clear(); this.wireQ.length = 0;
    if (!s) return;
    NID = Math.max(NID, s.nid ?? 0);
    for (const f of s.facts ?? []) this.facts.set(f.id, f);
    for (const h of s.holders ?? []) this.holders.set(h.id, { ...h, facts: h.facts ?? [] });
    for (const w of s.wire ?? []) this.wireQ.push(w);
  }
}
