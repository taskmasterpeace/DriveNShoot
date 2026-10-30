import { NEWS, FEED } from '../data/worldvoice.js';
import { STATIONS } from '../data/radio.js';
import { CHANNELS } from '../data/pulls.js';
import { FACTIONS } from '../data/society.js';
import { K as CK } from './chronicle.js';

// THE RADIO AS A WORLD FEED (docs/design/WEB_WORLD_VOICE.md §3.3). Built on the knowledge model (systems/knowledge.js):
//   news     a chronicle row becomes a NEWS fact only if somebody was there: the nearest town inside NEWS.witnessR saw
//            it (put as `saw`), or the row's own witnesses carried it to the nearest town. A row nobody saw is never
//            a fact and so never on the air. The pulls' grapevine then carries it town to town at its own speed.
//   market   each morning a town that keeps a market knows its own market is open (it is their market): a fact it holds.
//   air      a feed station (data/radio.js kind 'feed') is a town's set: its mast is the nearest town to you inside the
//            station's range. It reads out a copy THAT town holds (the teller must hold it), with how old the news is,
//            hedged when the copy is shaky and wrong (a count, deterministic per fact) when it is very shaky. What you
//            hear is a `radio` copy from the mast; every holder with a set in range hears the same line.
// Nothing runs per frame: news on new chronicle rows (a cursor), the market on the game hour, the air on the station's gap.
const r1 = (v) => Math.round(v * 10) / 10;
const hashS = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export class Feed {
  constructor(g) {
    this.g = g;
    this.on = true;
    this.cursor = null;      // the chronicle seq read up to
    this.dayDone = -1;       // the game day the markets were opened for
    this.aired = new Map();  // `${mast}|${fid}` -> hour aired
    this.log = [];           // what went out on the air (newest last)
    this.airT = 8;
    this.stats = { facts: 0, unwitnessed: 0, markets: 0, aired: 0, hedged: 0, wrong: 0, heardBy: 0 };
  }
  get k() { return this.g.pulls?.k ?? null; }
  hours() { return this.k?.hours() ?? 0; }
  nodes() { return this.g.pulls?.nodes?.() ?? []; }
  fname(id) { return FACTIONS[id]?.name ?? (id ? cap(id) : 'somebody'); }

  // ---- news from the chronicle ----------------------------------------------------------------------------------------
  where(r) {
    if (r.x || r.z) return { x: r.x, z: r.z };
    const P = this.g.citygen?.byId?.get(r.p) ?? this.g.society?.places?.[r.p];
    if (!P) return null;
    return { x: P.x ?? P.circle?.[0] ?? (P.rect ? (P.rect[0] + P.rect[2]) / 2 : 0), z: P.z ?? P.circle?.[1] ?? (P.rect ? (P.rect[1] + P.rect[3]) / 2 : 0) };
  }
  // Who saw row r: the town that holds it first, or null (nobody: it is not news).
  witnessOf(r, at) {
    let best = null, bd = NEWS.witnessR;
    for (const n of this.nodes()) { const d = Math.hypot(n.x - at.x, n.z - at.z); if (d < bd) { bd = d; best = n; } }
    if (best) return { town: best, how: 'saw' };
    // nobody in earshot: only the row's own witnesses can carry it, to the nearest town (they walk there)
    if ((r.ws ?? 0) > 0 && !(r.k & CK.unwitnessed)) {
      let nb = null, nd = 1e9;
      for (const n of this.nodes()) { const d = Math.hypot(n.x - at.x, n.z - at.z); if (d < nd) { nd = d; nb = n; } }
      if (nb) return { town: nb, how: 'said' };
    }
    return null;
  }
  newsText(r) {
    const T = NEWS.verbs[r.v]; if (!T) return null;
    const place = r.on && r.v !== 'kill' ? r.on : this.g.society?.places?.[r.p]?.name ?? this.g.citygen?.byId?.get(r.p)?.name ?? 'the flats';
    const other = this.g.citygen?.byId?.get(r.o)?.name ?? this.g.society?.places?.[r.o]?.name ?? 'the next town';
    const raid = r.v === 'raided'; // a raided row names the raiders in of (site stories' shape)
    const vars = { place, who: r.on || 'a stranger', by: this.fname(raid ? r.of : r.af || r.a), of: this.fname(raid ? r.af : r.of), other };
    return T.replace(/\{(\w+)\}/g, (m, k) => vars[k] ?? m);
  }
  // Turn the chronicle's new rows into facts held by whoever saw them. Returns the facts made.
  readChronicle() {
    const C = this.g.society?.chronicle, k = this.k;
    if (!C || !k) return [];
    if (this.cursor === null) this.cursor = C.seq;
    if (C.seq <= this.cursor) return [];
    const out = [];
    const rows = C.query({ since: this.cursor, limit: 40 });
    this.cursor = C.seq;
    for (let i = rows.length - 1; i >= 0; i--) {
      const r = rows[i];
      if (r.src === 'rumor' || r.src === 'story' || !NEWS.verbs[r.v]) continue; // site stories carry their own story facts
      const at = this.where(r); if (!at) continue;
      const w = this.witnessOf(r, at);
      if (!w) { this.stats.unwitnessed++; this.g.emit?.('newsUnwitnessed', { seq: r.seq, v: r.v }); continue; }
      const text = this.newsText(r);
      const f = k.record({ id: `news:${r.seq}`, what: 'news', subject: `chron:${r.seq}`, text, where: { x: at.x, z: at.z, place: r.p || null }, when: (r.day ?? this.g.society?.day ?? 0) * 24 + (r.hr ?? 0), life: NEWS.life, data: { seq: r.seq, v: r.v, af: r.af, of: r.of } });
      const hid = `town:${w.town.id}`;
      k.holder(hid, { name: w.town.name, kind: 'town', x: w.town.x, z: w.town.z, radio: true });
      k.put(hid, f, { channel: w.how, from: w.how === 'saw' ? hid : 'witnesses', fromName: w.how === 'saw' ? w.town.name : 'people who saw it' }, w.how === 'saw' ? CHANNELS.saw.conf : CHANNELS.said.conf, w.how === 'saw' ? 0 : 1);
      this.stats.facts++; out.push(f);
    }
    return out;
  }
  // The morning: a town that keeps a market knows it is open.
  markets() {
    const g = this.g, k = this.k, day = g.society?.day ?? 0;
    if (!k || day === this.dayDone || (g.sky?.time ?? 0) < NEWS.market.hour) return 0;
    this.dayDone = day;
    let n = 0;
    for (const t of this.nodes()) {
      const rec = g.citygen?.byId?.get(t.id);
      const keeps = t.id === 'rust_haven' ? NEWS.market.rustHaven : rec && rec.state !== 'overrun' && NEWS.market.arch.includes(rec.arch);
      if (!keeps) continue;
      const f = k.record({ id: `market:${t.id}:${day}`, what: 'market', subject: `market:${t.id}`, text: `market is open at ${t.name}`, where: { x: t.x, z: t.z, place: t.id }, when: day * 24 + NEWS.market.hour, life: NEWS.market.life });
      const hid = `town:${t.id}`;
      k.holder(hid, { name: t.name, kind: 'town', x: t.x, z: t.z, radio: true });
      k.put(hid, f, { channel: 'saw', from: hid, fromName: t.name }, 1, 0);
      n++;
    }
    this.stats.markets += n;
    return n;
  }

  // ---- the air ----------------------------------------------------------------------------------------------------------
  stationFeed(S) { return S?.kind === 'feed'; }
  mastFor(S, x, z) { let b = null, bd = S.range ?? 9000; for (const n of this.nodes()) { const d = Math.hypot(n.x - x, n.z - z); if (d < bd) { bd = d; b = n; } } return b; }
  ageWords(h) { for (const [lim, w] of FEED.ages) if (h <= lim) return w; return 'a while back'; }
  // The copy as the mast reads it: hedged when shaky, a count wrong when very shaky (the same wrong every time).
  read(S, mast, c) {
    const h = hashS(`${c.id}|${mast.id}`), shaky = c.conf < FEED.shaky, wrongish = c.conf < FEED.errorAt;
    let text = c.text ?? '', wrong = null;
    if (wrongish) {
      const m = /\d+/.exec(text);
      if (m) { const n = +m[0], d = 1 + (h % 3), to = h & 8 ? n + d : Math.max(1, n - d); if (to !== n) { wrong = { said: to, was: n }; text = text.replace(m[0], String(to)); } }
    }
    const lead = shaky ? FEED.hedges[h % FEED.hedges.length] : FEED.sure[h % FEED.sure.length];
    const age = this.hours() - c.when, place = this.g.citygen?.byId?.get(c.where?.place)?.name ?? (c.where?.place ? this.nodes().find((n) => n.id === c.where.place)?.name : null) ?? mast.name;
    const T = FEED.lines[c.what] ?? FEED.lines.news;
    const line = cap(T.replace('{lead}', lead).replace('{text}', text).replace('{age}', this.ageWords(age)).replace('{place}', place).replace(/\s+/g, ' ').replace(/^ /, '').trim());
    return { line: line.replace(/^(\w)/, (m) => m.toUpperCase()), shaky, wrong, ageH: r1(age) };
  }
  // What the mast could read now: copies its town holds, of a kind the station airs, still news, not read lately.
  candidates(S, mast) {
    const k = this.k, h = k?.holders.get(`town:${mast.id}`), now = this.hours();
    if (!h) return [];
    // a copy dated after now (a clock wound back by a load) has not happened yet on this clock: never read it
    return h.facts.filter((c) => S.airs.includes(c.what) && c.when <= now + 0.05 && (c.ends ?? c.when + c.life) > now && now - (this.aired.get(`${mast.id}|${c.id}`) ?? -1e9) > FEED.airAgainAfter);
  }
  // One line on the air. force: ignore the gap (a command). Returns the log row or null (nothing to say).
  air(S, { force = false } = {}) {
    const g = this.g, k = this.k, p = g.player;
    if (!k || !this.stationFeed(S)) return null;
    this.readChronicle(); this.markets();
    const me = g.pulls?.me?.() ?? { x: p.x, z: p.z }, mast = this.mastFor(S, me.x, me.z);
    if (!mast) { if (force) g.radio?.say?.(S, 'Static. No mast in reach.'); return null; }
    const C = this.candidates(S, mast);
    if (!C.length) return null;
    const key = (c) => FEED.keyLines.includes(c.what) || FEED.keyLines.includes(k.fact(c.id)?.data?.v);
    C.sort((a, b) => (key(b) - key(a)) || (b.heard - a.heard));
    const c = C[0], R = this.read(S, mast, c), now = this.hours();
    this.aired.set(`${mast.id}|${c.id}`, now);
    // Who hears it goes through THE AIRWAVES (systems/airwaves.js), the one broadcast source the scanner shares: the line
    // is one transmission from the mast, and every set tuned to it in range takes the MAST's copy (hearStation below).
    const f = k.fact(c.id) ?? c, P = k.holders.get('player');
    if (P) { P.x = me.x; P.z = me.z; } // where you are now, not where the last pulls tick saw you
    const sent = { ...f, where: c.where, when: c.when, text: R.line }, meta = { station: S, mastId: mast.id, conf: c.conf, hops: c.hops };
    const tx = g.airwaves ? g.airwaves.send({ channel: `station:${S.id}`, fact: sent, x: mast.x, z: mast.z, from: `mast:${mast.id}`, fromName: `${S.name} (${mast.name})`, text: R.line, meta })
      : { id: null, heard: this.hearStation({ fact: sent, x: mast.x, z: mast.z, from: `mast:${mast.id}`, fromName: `${S.name} (${mast.name})`, meta }) };
    const heard = tx.heard;
    const row = { at: r1(now), t: r1(g.time), station: S.id, freq: S.freq, mast: mast.id, mastName: mast.name, fid: c.id, what: c.what, text: R.line, ageH: R.ageH, conf: c.conf,
      mastHeard: r1(c.heard), fact: { when: r1(f.when) }, shaky: R.shaky, wrong: R.wrong, key: key(c), heardBy: heard.length, you: heard.includes('player'), tx: tx.id };
    this.log.push(row); if (this.log.length > FEED.log) this.log.shift();
    this.stats.aired++; if (R.shaky) this.stats.hedged++; if (R.wrong) this.stats.wrong++; this.stats.heardBy += heard.length;
    if (row.you) this.say(S, R.line, row.key);
    g.emit?.('feedAired', { station: S.id, mast: mast.id, fid: c.id, what: c.what, you: row.you });
    return row;
  }
  // A station's transmission reaching sets (the airwaves' listener for `station:<id>`): you, if you can hear a radio
  // tuned to it, and every holder with a set inside the station's range. Each gets the transmission's copy.
  hearStation(tx) {
    const g = this.g, k = this.k, S = tx.meta.station, heard = [];
    const src = { channel: 'radio', from: tx.from, fromName: tx.fromName, tx: tx.id ?? undefined };
    for (const H of k.holders.values()) {
      if (H.id === `town:${tx.meta.mastId}` || Math.hypot(H.x - tx.x, H.z - tx.z) > (S.range ?? 9000)) continue;
      const set = H.id === 'player' ? !!g.radio?.canHear?.() && g.radio.station === S : H.radio;
      if (!set) continue;
      if (k.put(H.id, tx.fact, src, tx.meta.conf * CHANNELS.radio.conf, tx.meta.hops + 1)) heard.push(H.id);
    }
    return heard;
  }
  // On the speaker: the subtitle and the HUD feed; key lines go to the station voice (a locked, rendered voice when the
  // forge made one: systems/voice.js radio(); never a new generation from here).
  say(S, text, key) {
    const g = this.g;
    g.hud?.subtitle?.(`${S.freq} ${S.name}: ${text}`, 6);
    if (key) g.voice?.radio?.(text);
    g.audio?.sample?.('common', 'radio.stinger', { dist: 1, vol: 0.3 });
    if (g.radio) g.radio.lastLine = { station: S.id, text, at: r1(g.time) };
    g.emit?.('radioLine', { station: S.id, text });
    g.feedUI?.push?.(S, text);
  }
  // radio.update calls this while a feed station is tuned and you can hear it.
  tick(S, dt) {
    if (!this.on) return;
    if ((this.airT -= dt) > 0) return;
    this.airT = FEED.every[0] + Math.random() * (FEED.every[1] - FEED.every[0]);
    if (!this.air(S)) this.g.audio?.sample?.('common', 'radio.static', { dist: 1, vol: 0.18 });
  }
  // The world side, on the game clock (systems/pulls.js already ticks the grapevine): news and markets keep being made
  // whether or not you listen.
  update(dt) {
    if (!this.on || !this.k) return;
    if ((this.newsT = (this.newsT ?? 0) - dt) > 0) return;
    this.newsT = 1;
    this.readChronicle(); this.markets();
  }
  station(id) { return STATIONS.find((s) => s.id === id) ?? null; }
  view() { return { on: this.on, cursor: this.cursor, log: this.log.slice(-8), stats: this.stats, stations: STATIONS.filter((s) => s.kind === 'feed').map((s) => ({ id: s.id, freq: s.freq, airs: s.airs, range: s.range })) }; }
  save() { return { cursor: this.cursor, dayDone: this.dayDone, aired: [...this.aired], log: this.log }; }
  load(s) { if (!s) return; this.cursor = s.cursor ?? null; this.dayDone = s.dayDone ?? -1; this.aired = new Map(s.aired ?? []); this.log = s.log ?? []; }
}
