import { TOPICS, NEWS, ROAD, YOU } from '../data/talk.js';
import { K } from './chronicle.js';

// What a stranger talks about (data/talk.js): three topics drawn from the live world, not canned lines. ui/dialogue.js
// offers them after a stranger's opening line; each reply is built when it is asked for.
//   news(c)   the newest thing c could know: a deed of yours they saw (the chronicle names them a witness), one their
//             people heard (deeds' heard mask), or a named death in the world's own history.
//   road(c)   the nearest thing worth a warning: a herd near them, the relay's Choir, a Dustwolf camp, the weather.
//   you(c)    how their people read you (the tier), and what you are known as (roles.js).
const DIRS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];

export class Talk {
  constructor(game) { this.g = game; }

  topics(c) {
    return [
      { t: TOPICS.news, reply: () => this.say(c, 'news', this.news(c)) },
      { t: TOPICS.road, reply: () => this.say(c, 'road', this.road(c)) },
      { t: TOPICS.you, reply: () => this.say(c, 'you', this.you(c)) },
    ];
  }

  say(c, topic, line) { this.g.emit('talk', { id: c.id, topic, line }); return line; }

  // A compass word from c toward (x, z) (north is -z).
  dir(c, x, z) { const a = Math.atan2(x - c.x, -(z - c.z)); return DIRS[(((Math.round(a / (Math.PI / 4))) % 8) + 8) % 8]; }

  news(c) {
    const S = this.g.society, F = S.factions, fi = F.index[c.fid];
    const fill = (t, r) => t.replaceAll('{who}', r.on || 'somebody').replaceAll('{place}', S.places[r.p]?.name ?? 'the flats');
    for (const r of S.chronicle.query({ limit: 80 })) {
      if (r.src === 'rumor') continue; // the word of a deed is not the deed
      if (r.a === 'player') {
        if (r.w?.includes(c.id) && NEWS.saw[r.v]) return fill(NEWS.saw[r.v], r);
        const heard = fi >= 0 && ((S.deeds.heard.get(r.seq) ?? 0) & (1 << fi));
        if (heard && NEWS.heard[r.v]) return fill(NEWS.heard[r.v], r);
      } else if (r.v === 'kill' && r.on && (r.k & K.named || r.of === c.fid)) {
        return fill(r.k & K.downed ? NEWS.world.downed : NEWS.world.kill, r); // one of theirs, or someone with a name
      }
    }
    return NEWS.none;
  }

  road(c) {
    const g = this.g, N = ROAD.near;
    let n = 0, sx = 0, sz = 0;
    for (const o of g.chars) {
      if (o.faction !== 'zombie' || !o.alive || Math.abs(o.x - c.x) > N.herd || Math.abs(o.z - c.z) > N.herd || Math.hypot(o.x - c.x, o.z - c.z) > N.herd) continue;
      n++; sx += o.x; sz += o.z;
    }
    if (n >= 2) return ROAD.herd.replace('{n}', String(n)).replace('{dir}', this.dir(c, sx / n, sz / n));
    for (const s of g.zombies?.sites ?? []) if (Math.hypot(s.x - c.x, s.z - c.z) < N.choir) return ROAD.choir.replace('{dir}', this.dir(c, s.x, s.z));
    let camp = null, bd = N.camp;
    (g.world.spawns.camps ?? []).forEach((k, i) => { const d = Math.hypot(k.x - c.x, k.z - c.z); if (d < bd && g.society.places[`camp_${i}`]?.owner === 'dustwolves') { bd = d; camp = k; } });
    if (camp) return ROAD.camp.replace('{dir}', this.dir(c, camp.x, camp.z));
    // Out in the Phoenix ring: the nest in the Burn, the chop shop in the yards (systems/residents.js households).
    for (const kind of ['nest', 'chopshop']) {
      const h = g.residents?.nearest(kind, c.x, c.z, kind === 'nest' ? N.nest : N.chop);
      if (h && h.id !== c.house) return ROAD[kind === 'nest' ? 'nest' : 'chop'].replace('{dir}', this.dir(c, h.cx, h.cz));
    }
    return ROAD.weather[g.sky.weatherKey] ?? ROAD.quiet;
  }

  you(c) {
    const F = this.g.society.factions, i = F.index[c.fid];
    const line = YOU[i >= 0 ? F.tiers[i] : 'neutral'] ?? YOU.neutral;
    const known = this.g.roles?.lineFor(c);
    return known ? `${line} ${known.line}` : line;
  }
}
