import { ROUNDS, calOf } from '../data/ballistics.js';
import { compass } from './outdoors.js';

// FORENSICS (docs/design/WEB_CALIBERS.md §5). "If they find a body, they know what kind of gun it came from."
// A bullet that lands in a man (combat.segment) leaves a wound that remembers its calibre (data/ballistics.js ROUNDS),
// the line it came in on and how far it flew; a fired gun drops a casing of its calibre (systems/ambient.js brass).
// Nobody reads either for free (law 6): the player reads a body by going through it (inventory.open, the search; the
// timed search of the TIMED-ACTIONS lane ends in the same open), an NPC investigator by examining it here, and each
// keeps only what they examined.
//
//   wound(c, cal, dx, dz, shooter, hx, hz, P)  combat.segment: a round of `cal` met c going (dx, dz)
//   wounds(body)                               the wounds on a body (a character, a body box or a rites record)
//   report(wounds)                             { lines: [{ cal, name, short, n, from, range }], text } (what a searcher learns)
//   onSearch(box)                              inventory.open: the player went through a body; the report is theirs
//   casingsNear(x, z, r)                       the casings lying within r m: { cal: count }
//   examine(who, body)                         an investigator (the police, a bounty hunter) reads a body: their clue
//   examineScene(who, x, z, r)                 an investigator reads the ground: the casings there become their clue
//   cluesOf(who)                               what someone has examined (theirs only)
// Allocation: a wound is one small object per bullet hit (never per frame); the clue lists are capped.
const MAX_WOUNDS = 8, MAX_CLUES = 12;
// Range bands a searcher can tell from a wound: powder burns and stippling up close, a clean hole further off.
export const RANGES = [{ max: 3, word: 'close range' }, { max: 25, word: 'from nearby' }, { max: Infinity, word: 'from a distance' }];
const NUM = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];
const WORDS = { N: 'the north', NE: 'the north-east', E: 'the east', SE: 'the south-east', S: 'the south', SW: 'the south-west', W: 'the west', NW: 'the north-west' };
const rangeWord = (d) => (d === null || d === undefined ? 'at a range nobody can tell' : RANGES.find((r) => d <= r.max).word);

export class Forensics {
  constructor(game) {
    this.g = game;
    this.found = new Map(); // body box id -> the report the player read off it (their knowledge)
    this.stats = { wounds: 0, searched: 0, examined: 0, scenes: 0 };
  }

  // ---- the record -----------------------------------------------------------------------------------------------------
  // (dx, dz): the round's line; the wound remembers where it came FROM (the reverse). P: the round in flight
  // (systems/ballistics.js), whose flown distance is the range; a hitscan round measures from its shooter.
  wound(c, cal, dx, dz, shooter, hx, hz, P = null) {
    const k = calOf(cal);
    if (!c || !k) return null;
    const d = P ? P.flown + Math.hypot(hx - P.x, hz - P.z) : shooter ? Math.hypot(shooter.x - hx, shooter.z - hz) : null;
    const w = { cal: k, fx: -dx, fz: -dz, d: d === null ? null : +d.toFixed(2), t: this.g.time ?? 0, by: shooter?.id ?? null };
    const L = (c.shotBy ??= []);
    if (L.length >= MAX_WOUNDS) L.shift();
    L.push(w);
    this.stats.wounds++;
    return w;
  }

  // The body behind a box, a character, or a rites record (systems/rites.js keeps the character on its record).
  bodyChar(body) {
    const g = this.g;
    if (!body) return null;
    if (body.shotBy || body.alive !== undefined) return body;
    if (body.c) return body.c;
    const id = body.id ?? null;
    if (typeof id !== 'string' || !id.startsWith('body:')) return null;
    for (const R of g.rites?.bodies?.values() ?? []) if (R.box === id) return R.c ?? null;
    const cid = id.slice(5);
    return g.chars.find((c) => String(c.id) === cid) ?? null;
  }
  wounds(body) { return this.bodyChar(body)?.shotBy ?? []; }

  // What a searcher reads off the wounds: one line per calibre, how many, the way most of them came from, the range.
  report(wounds) {
    const by = new Map();
    for (const w of wounds) {
      const L = by.get(w.cal) ?? { cal: w.cal, n: 0, sx: 0, sz: 0, dMin: Infinity, dKnown: false };
      L.n++; L.sx += w.fx; L.sz += w.fz;
      if (w.d !== null) { L.dMin = Math.min(L.dMin, w.d); L.dKnown = true; }
      by.set(w.cal, L);
    }
    const lines = [...by.values()].sort((a, b) => b.n - a.n).map((L) => {
      const R = ROUNDS[L.cal], len = Math.hypot(L.sx, L.sz), from = len > 0.3 * L.n ? compass(L.sx, L.sz) : null;
      return { cal: L.cal, name: R.name, short: R.short, n: L.n, from, fromWord: from ? WORDS[from] : 'more than one way', range: L.dKnown ? rangeWord(L.dMin) : rangeWord(null), closest: L.dKnown ? +L.dMin.toFixed(1) : null };
    });
    const text = lines.length
      ? lines.map((l) => `${NUM[l.n] ?? l.n} ${l.short} wound${l.n === 1 ? '' : 's'} from ${l.fromWord}, ${l.range}`).join('; ')
      : 'no gunshot wounds';
    return { lines, text };
  }

  // ---- the player's search ----------------------------------------------------------------------------------------------
  // inventory.open on a body box: going through the pockets you see the holes. The first look tells you; it is yours.
  onSearch(box) {
    if (!box?.id?.startsWith('body:')) return null;
    const W = this.wounds(box);
    if (!W.length) return null;
    const rep = this.report(W), seen = this.found.get(box.id);
    if (seen?.text === rep.text) return seen;
    this.found.set(box.id, rep);
    this.stats.searched++;
    box.findings = rep.text;
    const g = this.g, cap = rep.text.charAt(0).toUpperCase() + rep.text.slice(1);
    g.hud?.toast?.(`${(box.label ?? 'THE BODY').split(' · ')[0]}: ${cap}`, 'info');
    g.emit?.('forensics', { box: box.id, by: 'player', text: rep.text, lines: rep.lines.map((l) => ({ cal: l.cal, n: l.n, from: l.from, range: l.range })) });
    return rep;
  }

  // ---- the ground -----------------------------------------------------------------------------------------------------
  casingsNear(x, z, r = 8, out = {}) {
    for (const s of this.g.ambient?.shells ?? []) if (s?.rest && s.cal && Math.abs(s.x - x) < r && Math.abs(s.z - z) < r && Math.hypot(s.x - x, s.z - z) < r) out[s.cal] = (out[s.cal] ?? 0) + 1;
    return out;
  }

  // ---- investigators (law 6) ------------------------------------------------------------------------------------------
  // The police (the SWAT/police lane), the bounty guild: they know what they examined, nothing else. `who` must stand
  // within reach of the body to read it.
  examine(who, body, reach = 3) {
    const c = this.bodyChar(body);
    const at = c ?? body;
    if (!who || !at || Math.hypot(who.x - at.x, who.z - at.z) > reach) return null;
    const rep = this.report(c?.shotBy ?? []);
    this.stats.examined++;
    return this.clue(who, { kind: 'body', of: c?.id ?? body.id ?? null, x: at.x, z: at.z, text: rep.text, cals: rep.lines.map((l) => l.cal), lines: rep.lines });
  }
  examineScene(who, x = who?.x, z = who?.z, r = 8) {
    if (!who || Math.hypot(who.x - x, who.z - z) > r) return null;
    const n = this.casingsNear(x, z, r), cals = Object.keys(n);
    this.stats.scenes++;
    const text = cals.length ? cals.map((k) => `${NUM[n[k]] ?? n[k]} ${ROUNDS[k].short} casing${n[k] === 1 ? '' : 's'}`).join(', ') : 'no casings';
    return this.clue(who, { kind: 'scene', x, z, text, cals, casings: n });
  }
  clue(who, c) {
    const L = (who.clues ??= []);
    if (L.length >= MAX_CLUES) L.shift();
    c.t = this.g.time ?? 0;
    L.push(c);
    this.g.emit?.('clue', { by: who.id ?? null, kind: c.kind, text: c.text, cals: c.cals });
    return c;
  }
  cluesOf(who) { return who?.clues ?? []; }

  view() {
    return { stats: { ...this.stats }, found: [...this.found.entries()].map(([id, r]) => ({ box: id, text: r.text })) };
  }
}
