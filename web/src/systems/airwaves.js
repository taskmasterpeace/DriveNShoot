// THE AIRWAVES (docs/design/WEB_WORLD_VOICE.md §3.3): the ONE broadcast source. Every transmission in the world is a
// row here, made once, where it was sent from; the listeners only hear rows. Nothing reaches a radio or a scanner
// any other way.
//   scanner        a key-up (systems/kit.js: a convoy's lead, a party's car set, the bulls' dispatcher). Heard by the
//                  scanner you carry (kit.hearKey: a live cell, switched on, inside its range)
//   station:<id>   a feed station's line read at its mast (systems/feed.js air: only copies the mast's town holds).
//                  Heard by every set tuned to it inside the station's range, yours included (feed.hearStation)
// A row: { id, channel, fact (the copy as sent), x, z (the transmitter), from, fromName, text, at (game hours), t,
// heard (holder ids that took a copy), copy (the scanner's copy, if any) }. The log is a fixed ring.
const LOG = 64;
const r1 = (v) => Math.round(v * 10) / 10;

export class Airwaves {
  constructor(g) {
    this.g = g;
    this.log = []; this.seq = 0;
    this.stats = { sent: 0, heard: 0, unheard: 0, byChannel: {} };
  }
  hours() { return this.g.pulls?.k?.hours?.() ?? (this.g.society?.day ?? 0) * 24 + (this.g.sky?.time ?? 0); }
  // Who hears a channel: the one routing table (a new kind of set is a line here).
  listeners(ch) {
    const g = this.g;
    if (ch === 'scanner') return g.kit ? [(tx) => { const c = g.kit.hearKey(tx.fact, tx.x, tx.z, tx.from); tx.copy = c; return c ? ['player'] : []; }] : [];
    if (ch.startsWith('station:')) return g.feed ? [(tx) => g.feed.hearStation(tx)] : [];
    return [];
  }
  send(o) {
    const tx = { id: `tx${++this.seq}`, channel: o.channel, fact: o.fact, x: Math.round(o.x), z: Math.round(o.z), from: o.from, fromName: o.fromName ?? o.from,
      text: o.text ?? o.fact?.text ?? '', at: r1(this.hours()), t: r1(this.g.time ?? 0), heard: [], copy: null, meta: o.meta ?? null };
    for (const L of this.listeners(tx.channel)) for (const h of L(tx) ?? []) tx.heard.push(h);
    this.log.push(tx); if (this.log.length > LOG) this.log.shift();
    this.stats.sent++; this.stats.heard += tx.heard.length; if (!tx.heard.length) this.stats.unheard++;
    this.stats.byChannel[tx.channel.split(':')[0]] = (this.stats.byChannel[tx.channel.split(':')[0]] ?? 0) + 1;
    this.g.emit?.('airwave', { id: tx.id, channel: tx.channel, fact: tx.fact?.id, from: tx.from, heard: tx.heard.length });
    return tx;
  }
  find(o = {}) { return this.log.filter((t) => (!o.channel || t.channel === o.channel || t.channel.startsWith(`${o.channel}:`)) && (!o.fact || t.fact?.id === o.fact)); }
  view(t) { return { id: t.id, channel: t.channel, fact: t.fact?.id, what: t.fact?.what, from: t.fromName, at: t.at, x: t.x, z: t.z, text: t.text, heard: t.heard.length, you: t.heard.includes('player') }; }
  clear() { this.log.length = 0; }
}
