// The chronicle: what happened, in order (docs/design/WEB_WORLD_MEMORY.md §3.5).
//   ring    - 512 pooled records, the oldest overwritten;
//   tally   - actorFaction|verb|targetFaction → {n, m, t}, kept on insert, so losing a record from the ring never
//             loses a count a query relies on;
//   legend  - up to 96 notable records (mag ≥ 8, a named or leader target, a director outcome);
//   digests - per-day totals for the last 30 days (the radio's raw material).
// Records are only written at deed time; nothing here runs per frame.

export const K = { named: 1, leader: 2, night: 4, unwitnessed: 8, reported: 16, silenced: 32, director: 64, coalesced: 128, downed: 256, selfDefense: 512, overflow: 1024 };
const FIELDS = ['seq', 't', 'day', 'hr', 'a', 'af', 'v', 'o', 'on', 'of', 'p', 'x', 'z', 'm', 'w', 'ws', 'un', 'k', 'src'];
const blank = () => ({ seq: 0, t: 0, day: 0, hr: 0, a: '', af: '', v: '', o: '', on: '', of: '', p: '', x: 0, z: 0, m: 0, w: [], ws: 0, un: 0, k: 0, src: '' });
const BLANK = blank();

export class Chronicle {
  constructor(cap = 512, legendCap = 96, digestDays = 30) {
    this.cap = cap; this.legendCap = legendCap; this.digestDays = digestDays;
    this.ring = Array.from({ length: cap }, blank);
    this.head = 0; this.size = 0; this.seq = 0;
    this.tally = new Map();
    this.legend = [];
    this.digests = [];
  }

  // r: any subset of the record fields. Returns the pooled record (valid until the ring wraps past it).
  add(r) {
    const rec = this.ring[this.head];
    for (const f of FIELDS) if (f !== 'w') rec[f] = BLANK[f];
    rec.w.length = 0;
    for (const f in r) if (f === 'w') { for (const id of r.w) rec.w.push(id); } else rec[f] = r[f];
    rec.seq = ++this.seq;
    this.head = (this.head + 1) % this.cap;
    this.size = Math.min(this.size + 1, this.cap);
    const key = `${rec.af}|${rec.v}|${rec.of}`;
    const ty = this.tally.get(key);
    if (ty) { ty.n++; ty.m += rec.m; ty.t = rec.t; } else this.tally.set(key, { n: 1, m: rec.m, t: rec.t });
    if (rec.m >= 8 || rec.k & (K.named | K.leader | K.director)) this.toLegend(rec);
    this.digest(rec);
    return rec;
  }

  toLegend(rec) {
    this.legend.push(this.copy(rec));
    if (this.legend.length > this.legendCap) {
      // Evict the least notable of the oldest half, so a famous night isn't pushed out by small fry.
      let worst = 0;
      for (let i = 1; i < this.legend.length >> 1; i++) if (this.legend[i].m < this.legend[worst].m) worst = i;
      this.legend.splice(worst, 1);
    }
  }

  digest(rec) {
    let d = this.digests[this.digests.length - 1];
    if (!d || d.day !== rec.day) {
      d = { day: rec.day, deeds: 0, kills: {}, verbs: {}, places: {}, placeKills: {}, worst: null };
      this.digests.push(d);
      if (this.digests.length > this.digestDays) this.digests.shift();
    }
    d.deeds++;
    d.verbs[rec.v] = (d.verbs[rec.v] ?? 0) + 1;
    if (rec.v === 'kill' && rec.of) d.kills[rec.of] = (d.kills[rec.of] ?? 0) + 1;
    if ((rec.v === 'kill' || rec.v === 'silence') && rec.p && rec.src !== 'rumor') d.placeKills[rec.p] = (d.placeKills[rec.p] ?? 0) + 1;
    if (rec.p) d.places[rec.p] = (d.places[rec.p] ?? 0) + 1;
    if (!d.worst || rec.m > d.worst.m) d.worst = { seq: rec.seq, v: rec.v, on: rec.on, of: rec.of, p: rec.p, m: rec.m, af: rec.af, unwitnessed: !!(rec.k & K.unwitnessed) };
  }

  copy(rec) { const o = {}; for (const f of FIELDS) o[f] = f === 'w' ? rec.w.slice() : rec[f]; return o; }

  // Newest first. filter: { since (seq), verb, actor, faction (either side), place, legend, limit }
  query({ since = 0, verb, actor, faction, place, legend = false, limit = 25 } = {}) {
    const out = [];
    const match = (r) => r.seq > since && (!verb || r.v === verb) && (!actor || r.a === actor || r.af === actor) && (!faction || r.af === faction || r.of === faction) && (!place || r.p === place);
    if (legend) { for (let i = this.legend.length - 1; i >= 0 && out.length < limit; i--) if (match(this.legend[i])) out.push(this.legend[i]); return out; }
    for (let n = 0; n < this.size && out.length < limit; n++) {
      const r = this.ring[(this.head - 1 - n + this.cap) % this.cap];
      if (match(r)) out.push(r);
    }
    return out;
  }

  last() { return this.size ? this.ring[(this.head - 1 + this.cap) % this.cap] : null; }

  // Saved as positional rows under a column header (about 60 KB for a full ring).
  save() {
    const rows = [];
    for (let n = this.size - 1; n >= 0; n--) { const r = this.ring[(this.head - 1 - n + this.cap) % this.cap]; rows.push(FIELDS.map((f) => (f === 'w' ? r.w.slice() : r[f]))); }
    return { cols: FIELDS, rows, seq: this.seq, tally: [...this.tally], legend: this.legend, digests: this.digests };
  }

  load(s) {
    if (!s) return;
    this.head = 0; this.size = 0;
    const cols = s.cols ?? FIELDS;
    for (const row of s.rows ?? []) {
      const rec = this.ring[this.head];
      cols.forEach((f, i) => { if (f === 'w') { rec.w.length = 0; for (const id of row[i] ?? []) rec.w.push(id); } else rec[f] = row[i]; });
      this.head = (this.head + 1) % this.cap; this.size = Math.min(this.size + 1, this.cap);
    }
    this.seq = s.seq ?? this.seq;
    this.tally = new Map(s.tally ?? []);
    this.legend = s.legend ?? [];
    this.digests = s.digests ?? [];
  }
}
