// THE CREW (docs/design/WEB_CREW.md; the gap spec docs/design/WEB_DEATHLANDS_GAP.md G3 + §4.4; rows in data/crew.js,
// data/crewjobs.js). A crew you assemble, lead and lose: 1 to 6 counting you, a new game starts solo.
//   records    a member is a RECORD (this.members: name, flag, card, trust, needs, order, job, rounds) with a body while
//              they are on the map (rec.c / c.crewRec); a scavenge run takes the body off the map and the record waits
//   joining    talk (a dialogue choice), hire (scrip a day), rescue (cut a captive loose), earn (a role at renowned draws a
//              matching card): candidates are seeded rows (data/crew.js CREW_SEEDS) promoted to people near you
//   caps       CREW_RULES.cap (6 with you) and archetypeCap (4 of the 8 CREW CARDS): the dialogue choice greys or hides
//   orders     FOLLOW · HOLD HERE · TAKE COVER · WEDGE / FILE / SPREAD · FOCUS MY TARGET · FREE / HOLD FIRE · FALL BACK TO
//              THE RIG · MAN THE GUN · LOOT THIS · STAND WATCH (ui/crew.js: hold U for the radial, tap U for the panel)
//   jobs       on the road, at camp, at a base (data/crewjobs.js), on the game clock
//   trust      §4.4: every deed you do (the chronicle) moves each member's trust by their own values, weighted, x1 seen
//              or x0.4 heard; drift toward 0 by 2 a day; refusals, leaving at dawn with a share, betrayal, the last stand
//   mortality  down (not dead) -> a bleed-out clock -> patch them up (E) or drag them clear (hold E) -> or they die: a
//              grave, a memorial line, a chronicle record, the radio's obituary
//   save       per-player state: in the save and in the shard snapshot (net/shard.js)
// Allocation: nothing per frame but the scans' loops; records and plans are made when things happen.
import { CREW_RULES as R, CREW_BY_ID, CREW_ROWS, CREW_SEEDS, CREW_EVENTS, JOIN_TRUST } from '../data/crew.js';
import { CREW_JOBS, CREW_JOB_BY_ID, CREW_RUN_LOOT } from '../data/crewjobs.js';
import { VERBS } from '../data/society.js';
import { BARKS, CAMP_DEED, CAMP_PAIR, CAMP_FLAW, INTERJECT, BOND_RULES as BR, FLAW_CLASH } from '../data/crewtalk.js';
import { WEAPONS } from './combat.js';
import { ITEMS, AMMO_ITEM, GUN_ITEM } from '../data/items.js';

export const ORDERS = ['follow', 'holdpos', 'cover', 'wedge', 'file', 'spread', 'focus', 'freefire', 'holdfire', 'fallback', 'mangun', 'loot', 'watch'];
export const ORDER_NAMES = { follow: 'FOLLOW', holdpos: 'HOLD HERE', cover: 'TAKE COVER', wedge: 'WEDGE', file: 'FILE', spread: 'SPREAD', focus: 'FOCUS MY TARGET', freefire: 'FREE FIRE', holdfire: 'HOLD FIRE', fallback: 'FALL BACK TO THE RIG', mangun: 'MAN THE GUN', loot: 'LOOT THIS', watch: 'STAND WATCH' };
const RISKY = new Set(['focus', 'mangun', 'loot', 'holdpos']); // refused under refuseBelow trust
const FORMATION = new Set(['wedge', 'file', 'spread']);
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const SAY_GAP = 9;

export class Crew {
  constructor(game) {
    this.g = game;
    this.members = [];        // records, in join order (the formation slot)
    this.cands = new Map();   // key -> candidate { key, row, how, where, line, state, c, cid }
    this.graves = [];         // { x, z, name, flag, card, day, why }
    this.memorial = [];       // the safehouse wall: { name, card, flag, day, days, saves, why }
    this.pins = [];           // { x, z, label, by, day }
    this.formation = 'wedge';
    this.camp = null;         // { x, z, day }: made by STAND WATCH, a bed, or the camp command
    this.base = null;         // { x, z, name, day }: a claimed building (the base lane plugs in here)
    this.seq = 0;             // chronicle records read up to here
    this.nextRec = 1;
    this.hourMark = null;     // the game hour last ticked
    this.scanT = 0; this.slowT = 0; this.sayAt = 0;
    this.drag = null;         // the member you are dragging
    this.ePress = -1;         // when E went down beside a downed member
    this.fight = { t0: -1e9, kills: 0, foes: 0, won: -1e9 };
    this.stats = { joined: 0, left: 0, died: 0, saved: 0, refused: 0, trustEvents: 0, jobsDone: 0, runs: 0 };
    this.seeded = false;
    this.bonds = new Map();   // 'a|b' (record ids) -> -100..100: how two members feel about each other
    this.heard = [];          // the last lines the crew said (the LLM context's short memory)
    this.campAt = 0;          // game time of the next camp line
    this.took = [];           // scratch: who took a deed which way
  }

  // ---- candidates ---------------------------------------------------------------------------------------------------
  seed() {
    if (this.seeded) return;
    this.seeded = true;
    for (const s of CREW_SEEDS) this.cands.set(s.key, { ...s, state: 'waiting', c: null, cid: null });
    this.promoteNear(true);
  }

  // Where a seed stands in the world (null: not here yet, e.g. a holdout that is not laid out).
  seedPos(s) {
    const g = this.g, w = s.where;
    if (w.camp !== undefined) { const camp = g.world.spawns.camps?.[w.camp]; return camp ? { x: camp.x + w.dx, z: camp.z + w.dz } : null; }
    if (w.holdout) { const cl = g.regions?.clinic?.(w.holdout); return cl ? { x: cl.door.x + w.dx, z: cl.door.z + w.dz } : null; }
    return { x: w.x, z: w.z };
  }

  // The island never streams out: its candidates stand there for good (Rust Haven's, the camp's captives).
  onIsland(s) { const w = s.where; return w.camp !== undefined || (w.x !== undefined && Math.abs(w.x) < 464 && Math.abs(w.z) < 464); }

  promoteNear(force = false) {

    const g = this.g, p = g.player;
    for (const s of this.cands.values()) {
      if (s.state !== 'waiting') continue;
      if (s.c) {
        if (!s.c.alive) { s.state = 'gone'; g.emit('crewCandidateLost', { key: s.key, why: 'killed' }); continue; }
        if (!force && Math.hypot(s.c.x - p.x, s.c.z - p.z) > R.seekR + 60 && !this.onIsland(s)) { g.removeChar(s.c); s.c = null; s.cid = null; }
        continue;
      }
      const pos = this.seedPos(s);
      if (!pos) continue;
      if (!this.onIsland(s) && Math.hypot(pos.x - p.x, pos.z - p.z) > R.seekR) continue;
      this.spawnCandidate(s, pos.x, pos.z);
    }
  }

  // A person for a seed (or an earned card): looks, name and flag from the row and the key's hash, a talk tree that offers
  // the way in.
  spawnCandidate(s, x, z) {
    const g = this.g, row = CREW_BY_ID[s.row], h = hash(s.key);
    const name = s.name ?? row.names[h % row.names.length], flag = s.flag ?? row.flags[(h >>> 8) % row.flags.length];
    const c = g.addChar({ x, z, faction: 'drifter', weapon: s.how === 'rescue' ? null : row.weapon, hp: row.hp, name, flag, colors: this.colors(row, h), npc: this.candidateTalk(s, row, name, flag, h) });
    if (!c) return null;
    c.home = { x: c.x, z: c.z };
    c.crewCand = s.key;
    if (s.how === 'rescue') { c.hold = true; c.captive = true; } // tied up at the camp
    s.c = c; s.cid = c.id; s.name = name; s.flag = flag;
    g.emit('crewCandidate', { key: s.key, id: c.id, name, card: row.name, how: s.how, x: +c.x.toFixed(1), z: +c.z.toFixed(1) });
    return c;
  }

  colors(row, h) {
    const L = row.look;
    return { skin: L.skin, hair: L.hair, shirt: L.shirt, pants: L.pants, boots: '#2b241e', hat: '#5a3f24', hatStyle: L.hatStyle ?? 'short', gearStyle: L.gearStyle ?? 'none', gear: '#3a3128', accStyle: L.accStyle ?? 'none', mask: '#6a2a1e', sleeves: (h & 1) ? 'long' : 'short' };
  }

  portrait(row, h, flag) {
    const hat = { cowboy: 'cowboy', cap: 'cap', wrap: 'wrap', long: 'long', bald: 'bald' }[row.look.hatStyle] ?? 'short';
    const gear = { eyepatch: 'eyepatch', goggles: 'goggles', mask: 'bandana' }[row.look.accStyle] ?? (row.look.gearStyle === 'bandolier' ? 'bandolier' : 'none');
    return { seed: h % 9973, skin: row.look.skin, hair: row.look.hair, hat, mood: 'neutral', shirt: row.look.shirt, gear, flag };
  }

  candidateTalk(s, row, name, flag, h) {
    const crew = this, how = s.how;
    const title = `${row.name.toUpperCase()} · ${how === 'hire' ? 'FOR HIRE' : how === 'rescue' ? 'CAPTIVE' : how === 'earn' ? 'CAME LOOKING FOR YOU' : 'ON THE ROAD'}`;
    const joinChoice = how === 'hire'
      ? { t: `Hire on: $${row.pay} a day.`, req: (g) => crew.canJoin(row).ok, next: 'joined', do: (g) => { if (g.spend(row.pay)) crew.joinChar(g.chars.find((c) => c.crewCand === s.key), 'hire'); else g.hud.toast('NOT ENOUGH SCRIP', 'warn'); } }
      : how === 'rescue'
        ? { t: 'Cut them loose. "Ride with me."', req: (g) => crew.canJoin(row).ok, next: 'joined', do: (g) => crew.rescue(s.key) }
        : { t: 'Ride with me.', req: (g) => crew.canJoin(row).ok, next: 'joined', do: (g) => crew.joinChar(g.chars.find((c) => c.crewCand === s.key), how) };
    const freeOnly = how === 'rescue' ? [{ t: 'Cut them loose and let them go.', req: (g) => !crew.canJoin(row).ok, end: true, do: (g) => crew.rescue(s.key, false) }] : [];
    return {
      id: `crew_${s.key}`, name, title, flag, faction: 'drifter', portrait: this.portrait(row, h, flag), start: 'hi', crewTalk: true,
      nodes: {
        hi: { text: s.line, choices: [
          joinChoice,
          // Edge cases (gap §5): a full crew greys the choice; the 5th archetype never sees it at all.
          { t: '(The crew is full: six. Swap someone out at the CREW panel, U.)', req: (g) => crew.canJoin(row).why === 'full', end: true },
          ...freeOnly,
          { t: 'What can you do?', next: 'about' },
          { t: '[Leave]', end: true },
        ] },
        about: { text: `${row.signature.text[0].toUpperCase()}${row.signature.text.slice(1)}. Fair warning: ${row.flaw.text}.`, choices: [joinChoice, { t: '[Leave]', end: true }] },
        joined: { text: how === 'rescue' ? 'Thank you. I will not forget it.' : how === 'hire' ? 'Paid by the day, dawn to dawn. Lead on.' : 'Then let us go.', choices: [{ t: '[Leave]', end: true }] },
      },
    };
  }

  // A member's own talk: how they feel about you, rounds, dismissal.
  memberTalk(rec) {
    const crew = this, row = rec.row, h = hash(rec.name);
    return {
      id: `crew_m${rec.id}`, name: rec.name, title: `${row.name.toUpperCase()} · YOUR CREW`, flag: rec.flag, faction: 'ally', portrait: this.portrait(row, h, rec.flag), start: 'hi', crewTalk: true,
      nodes: {
        hi: { text: (g) => crew.mood(rec), choices: [
          { t: 'Take some rounds.', req: (g) => crew.ammoFor(rec) > 0, next: 'hi', do: (g) => crew.giveRounds(rec) },
          { t: 'Hand me your gun for a while.', req: () => !!rec.c?.weapon, next: 'hi', do: () => crew.takeGun(rec) },
          { t: 'Here: carry my gun.', req: (g) => !rec.c?.weapon && g.inv.current && g.inv.weapons.length > 1, next: 'hi', do: () => crew.giveGun(rec) },
          { t: 'You are free to go. Take your share.', next: 'bye', do: () => crew.dismiss(rec, 'dismissed') },
          { t: '[Leave]', end: true },
        ] },
        bye: { text: 'Watch the road.', choices: [{ t: '[Leave]', end: true }] },
      },
    };
  }

  mood(rec) {
    const T = rec.trust;
    if (T > R.lastStandAbove) return "I'd walk into the fire for you. You know that.";
    if (T > 20) return 'We are good. Where to?';
    if (T > -10) return 'I am still here. Ask me again tomorrow.';
    if (T > R.leaveBelow) return 'I do not like where this is going.';
    return 'Come dawn, I may not be here.';
  }

  // ---- joining ------------------------------------------------------------------------------------------------------
  size() { return 1 + this.members.length; } // you count
  archetypes() { let n = 0; for (const m of this.members) if (m.row.archetype) n++; return n; }
  canJoin(row) {
    if (this.size() >= R.cap) return { ok: false, why: 'full' };
    if (row.archetype && this.archetypes() >= R.archetypeCap) return { ok: false, why: 'archetype' };
    if (row.archetype && this.members.some((m) => m.row.id === row.id)) return { ok: false, why: 'archetype' };
    return { ok: true };
  }

  rescue(key, join = true) {
    const g = this.g, s = this.cands.get(key), c = s?.c;
    if (!c) return { ok: false, why: 'no captive' };
    c.hold = 0; c.captive = false;
    g.society?.deeds?.record('rescue', { target: c, x: c.x, z: c.z }); // a rescue the world can see and talk about
    if (!join) { s.state = 'freed'; c.crewCand = null; c.home = { x: c.x + 200, z: c.z }; c.flee = 6; c.fleeX = g.player.x; c.fleeZ = g.player.z; g.emit('crewFreed', { key }); return { ok: true, freed: true }; }
    return this.joinChar(c, 'rescue');
  }

  // Someone (a candidate, or anyone through the API) joins. how: talk | hire | rescue | earn | api.
  joinChar(c, how = 'talk', rowId = null) {
    const g = this.g;
    if (!c || !c.alive) return { ok: false, why: 'nobody to join' };
    if (c.crewRec) return { ok: false, why: `${c.crewRec.name} already rides with you` };
    if (c === g.player) return { ok: false, why: 'that is you' };
    const s = c.crewCand ? this.cands.get(c.crewCand) : null;
    const row = CREW_BY_ID[rowId ?? s?.row ?? this.guessRow(c)];
    const can = this.canJoin(row);
    if (!can.ok) { g.hud.toast(can.why === 'full' ? 'THE CREW IS FULL (6)' : 'THAT KIND ALREADY RIDES WITH YOU', 'warn'); return { ok: false, why: can.why }; }
    const rec = {
      id: this.nextRec++, cid: c.id, row, rowId: row.id, name: c.npc?.name ?? c.name, flag: c.flag, how,
      trust: this.startTrust(row, how),
      day: g.society?.day ?? 0, needs: { food: 0.85, water: 0.85, rest: 0.85 }, order: 'follow', job: null, jobP: 0, away: null,
      down: false, bleed: 0, saves: 0, kills: 0, sayAt: 0, fallbackAsked: 0, pay: how === 'hire' ? row.pay : 0, hp: row.hp, lastStand: false,
      holdAt: null, lootAt: null, colors: c.colors,
    };
    if (s) { s.state = 'joined'; c.crewCand = null; }
    for (const o of this.members) this.startBond(rec, o);
    this.members.push(rec);
    this.attach(rec, c);
    c.mag = row.weapon ? WEAPONS[row.weapon].mag : 0;
    rec.rounds = row.rounds ?? 0;
    this.stats.joined++;
    g.emit('crewJoined', { id: c.id, rec: rec.id, name: rec.name, card: row.name, archetype: row.archetype, how, trust: rec.trust, size: this.size() });
    g.hud.toast(`${rec.name.toUpperCase()} (${row.name.toUpperCase()}) RIDES WITH YOU · CREW ${this.size()}/${R.cap}`, 'job');
    return { ok: true, rec: rec.id, id: c.id, name: rec.name, card: row.name, trust: rec.trust, size: this.size() };
  }

  // §4.4: hires start at 10, the rescued at 35, a card that came looking for you at least 50; a card's own row otherwise.
  startTrust(row, how) {
    if (how === 'earn') return Math.max(row.trustStart ?? 0, JOIN_TRUST.earn);
    if (how === 'hire' || how === 'rescue') return row.archetype ? JOIN_TRUST[how] : row.trustStart ?? JOIN_TRUST[how];
    return row.trustStart ?? JOIN_TRUST[how] ?? 20;
  }

  guessRow(c) {
 return c.weapon === 'rifle' ? 'wall_veteran' : c.weapon === 'smg' ? 'sutler_guard' : c.weapon === 'shotgun' ? 'shotgun_rider' : c.weapon ? 'drifter_gun' : 'drifter_scav'; }

  // A body takes the record: follower flags (systems/seats.js), the talk tree, the tactics unit.
  attach(rec, c) {
    rec.c = c; rec.cid = c.id; c.crewRec = rec;
    c.faction = 'ally'; c.follower = true; c.grudge = null; c.target = null; c.flee = 0; c.hold = 0; c.captive = false; c.leash = 60;
    c.weapon ??= rec.row.weapon;
    c.maxHp = rec.row.hp; if (c.hp > c.maxHp) c.hp = c.maxHp;
    c.npc = this.memberTalk(rec);
    c.grenades = rec.row.ai.grenades ?? 0;
    this.g.society?.factions?.assign?.(c);
  }

  leave(rec, why = 'left', share = true) {
    const g = this.g, c = rec.c, i = this.members.indexOf(rec);
    if (i < 0) return { ok: false };
    this.members.splice(i, 1);
    let took = 0;
    if (share && why !== 'died') { took = Math.floor(g.cash / (this.members.length + 2)); g.cash -= took; }
    if (c) {
      c.crewRec = null; c.follower = false; c.npc = null; c.tac && (c.tac.force = null, c.tac.holdFire = false);
      if (c.alive) { if (c.inVehicle) g.seats.leave(c); c.faction = why === 'betrayed' ? 'raider' : 'drifter'; c.home = { x: c.x + 60, z: c.z }; g.society?.factions?.assign?.(c); if (why === 'betrayed') { c.grudge = g.player; c.target = g.player; c.state = 'fight'; } }
    }
    if (this.drag === rec) this.stopDrag();
    this.stats.left++;
    g.emit('crewLeft', { rec: rec.id, id: c?.id ?? null, name: rec.name, why, took, size: this.size() });
    if (why !== 'died') g.hud.toast(`${rec.name.toUpperCase()} ${why === 'betrayed' ? 'TURNS ON YOU' : why === 'dismissed' ? 'GOES THEIR OWN WAY' : 'IS GONE AT DAWN'}${took ? ` · TOOK $${took}` : ''}`, why === 'betrayed' ? 'hot' : 'warn');
    return { ok: true, took };
  }
  dismiss(rec, why = 'dismissed') { return this.leave(rec, why, why !== 'dismissed'); }

  byAny(id) {
    if (id === undefined || id === null || id === '') return null;
    const s = String(id).toLowerCase();
    return this.members.find((m) => String(m.id) === s || m.cid === id || m.name.toLowerCase() === s || m.name.toLowerCase().startsWith(s) || m.rowId === s) ?? null;
  }

  // ---- orders -------------------------------------------------------------------------------------------------------
  // who: a record, or null = everyone. Returns { ok, refused: [...] }.
  order(order, who = null, at = null) {
    const g = this.g, p = g.player;
    if (!ORDERS.includes(order)) return { ok: false, why: `unknown order; one of ${ORDERS.join(', ')}` };
    const list = who ? [who] : this.members;
    const refused = [], took = [];
    const aim = at ?? { x: g.aim?.x ?? p.x, z: g.aim?.z ?? p.z };
    if (FORMATION.has(order)) this.formation = order;
    if (order === 'watch') this.camp = { x: p.x, z: p.z, day: g.society?.day ?? 0 };
    for (const m of list) {
      if (m.away || m.down) continue;
      if (RISKY.has(order) && m.trust < R.refuseBelow) { refused.push(m.name); this.bark(m, 'refuse'); this.stats.refused++; continue; }
      // The Prospect's flaw: FALL BACK only sticks when you say it twice.
      if (order === 'fallback' && m.row.flaw.id === 'brave' && g.time - m.fallbackAsked > 6) { m.fallbackAsked = g.time; refused.push(m.name); this.say(m, 'I can take them!'); continue; }
      took.push(m.name);
      const U = m.c ? g.tactics.unit(m.c) : null;
      switch (order) {
        case 'holdfire': if (U) U.holdFire = true; m.fire = 'hold'; break;
        case 'freefire': if (U) U.holdFire = false; m.fire = 'free'; break;
        case 'holdpos': m.order = order; m.holdAt = { x: m.c?.x ?? p.x, z: m.c?.z ?? p.z }; break;
        case 'cover': m.order = order; m.holdAt = { x: m.c?.x ?? p.x, z: m.c?.z ?? p.z }; if (U) { U.force = 'cover'; U.anchorX = m.holdAt.x; U.anchorZ = m.holdAt.z; } break;
        case 'focus': { m.order = 'follow'; const t = this.targetNear(aim.x, aim.z); if (t && m.c) { m.c.target = t; m.c.grudge = t; m.c.state = 'fight'; m.focus = t.id; } break; }
        case 'loot': m.order = 'loot'; m.lootAt = this.boxNear(aim.x, aim.z); if (!m.lootAt) { m.order = 'follow'; refused.push(m.name); } break;
        case 'watch': m.order = 'watch'; m.holdAt = { x: m.c?.x ?? p.x, z: m.c?.z ?? p.z }; break;
        default: m.order = FORMATION.has(order) ? 'follow' : order; m.holdAt = null;
      }
      if (order !== 'holdfire' && order !== 'freefire' && order !== 'cover' && U) U.force = order === 'holdpos' ? 'holdpos' : null;
      if (order === 'holdpos' && U) { U.anchorX = m.holdAt.x; U.anchorZ = m.holdAt.z; }
    }
    g.emit('crewOrder', { order, took, refused, formation: this.formation });
    g.hud.toast(`${ORDER_NAMES[order]}${refused.length ? ` · ${refused.join(', ').toUpperCase()} WON'T` : ''}`, refused.length ? 'warn' : 'job');
    return { ok: true, order, took, refused, formation: this.formation };
  }

  targetNear(x, z) {
    const g = this.g;
    let best = null, bd = 9;
    for (const o of g.chars) { if (!o.alive || o === g.player || o.crewRec) continue; if (!(g.ai.hostile(g.player, o) || o.faction === 'raider' || o.target === g.player || o.faction === 'zombie')) continue; const d = Math.hypot(o.x - x, o.z - z); if (d < bd) { bd = d; best = o; } }
    if (!best) for (const o of g.chars) { if (!o.alive || o === g.player || o.crewRec || !(o.faction === 'raider' || o.target === g.player)) continue; const d = Math.hypot(o.x - g.player.x, o.z - g.player.z); if (d < 60 && (!best || d < bd)) { bd = d; best = o; } }
    return best;
  }
  boxNear(x, z) {
    const inv = this.g.inventory; let best = null, bd = 6;
    if (!inv) return null;
    for (const b of inv.boxes.values()) { if (b.x === undefined || b.owner) continue; const d = Math.hypot(b.x - x, b.z - z); if (d < bd) { bd = d; best = b; } }
    return best ? { id: best.id, x: best.x, z: best.z } : null;
  }

  // ---- the brain, per member, from ai.js (true: handled; false: let the fight block run) --------------------------------
  think(c, dt) {
    const g = this.g, m = c.crewRec, p = g.player;
    if (!m || m.down) return true;
    m.thinks = (m.thinks ?? 0) + 1;
    if (this.drag === m) return true;
    // A fight: the tactics brain has them (ai.js), unless the order says otherwise.
    if (c.target) {
      if (m.order === 'fallback') { c.target = null; }
      else if (c.inVehicle) return false; // the window gunners (ai.js hands passengers to seats.followThink)
      else {
        // The Thrown Man drifts off mid-fight; somebody has to fetch him.
        if (m.row.ai.stray > 0 && !m.straying && Math.random() < dt * m.row.ai.stray * 0.05) { m.straying = 4 + Math.random() * 4; this.say(m, 'Look at that... the old relay box. Still warm.'); }
        if (m.straying > 0) { m.straying -= dt; c.aiming = false; g.ai.move(c, Math.sin(m.id * 1.7), Math.cos(m.id * 1.7), 1.4, dt); return true; }
        return false;
      }
    }
    if (m.away) return true;
    const job = m.job ? CREW_JOB_BY_ID[m.job] : null;
    if (job && this.jobBody(m, job, c, dt)) return true;
    switch (m.order) {
      case 'holdpos': case 'cover': case 'watch': {
        if (c.inVehicle) { g.seats.leave(c); return true; }
        const h = m.holdAt ?? { x: c.x, z: c.z }, d = Math.hypot(h.x - c.x, h.z - c.z);
        if (d > 0.8) g.ai.move(c, h.x - c.x, h.z - c.z, 4.2, dt); else { c.speed = 0; c.crouch = m.order === 'cover'; if (m.order === 'watch') c.face += dt * 0.4; }
        return true;
      }
      case 'fallback': case 'mangun': {
        const v = p.inVehicle ?? p.onDeck?.v ?? g.lastVehicle;
        if (!v || v.dead) { m.order = 'follow'; return false; }
        // Aboard (a seat, or the bed of a pickup): they stay with the rig and work a gun from it.
        if (c.inVehicle === v || c.onDeck?.v === v) { this.gunnery(m, c, v, dt); return true; }
        const d = Math.hypot(v.x - c.x, v.z - c.z);
        if (d < v.len * 0.5 + 2.5) {
          const seat = g.seats.freeSeat(v, { passengerOnly: true });
          if (seat >= 0) g.seats.board(c, v, seat); else if (g.decks?.room(v)) g.decks.climb(c, v); else { c.speed = 0; c.crouch = true; }
          return true;
        }

        g.ai.move(c, v.x - c.x, v.z - c.z, 5.4, dt);
        return true;
      }
      case 'loot': {
        const L = m.lootAt;
        if (!L) { m.order = 'follow'; return false; }
        const d = Math.hypot(L.x - c.x, L.z - c.z);
        if (d > 1.4) { g.ai.move(c, L.x - c.x, L.z - c.z, 4.2, dt); return true; }
        this.lootBox(m, L.id); m.order = 'follow'; m.lootAt = null;
        return true;
      }
    }
    // FOLLOW in the formation (on foot), else the old follower brain (boarding, window fire, the chauffeur).
    if (c.inVehicle || p.inVehicle || p.onDeck || c.onDeck) return g.seats.followThink(c, dt);
    const slot = this.members.indexOf(m), F = R.formations[this.formation] ?? R.formations.wedge, off = F[Math.min(slot, F.length - 1)];
    const h = p.face, cs = Math.cos(h), sn = Math.sin(h);
    // Leader frame: forward = (sin h, cos h); right = (-cos h, sin h) on screen... x right, z back.
    const tx = p.x + (-cs) * off[0] - sn * off[1], tz = p.z + sn * off[0] - cs * off[1];
    const d = Math.hypot(tx - c.x, tz - c.z), pd = Math.hypot(p.x - c.x, p.z - c.z);
    if (d > 1.2) g.ai.move(c, tx - c.x, tz - c.z, pd > R.followGap.run ? 7 : d > 4 ? 5 : 3.2, dt); else { c.speed = 0; c.face = p.face; }
    c.crouch = !!p.crouch;
    // The Sleeper's flaw: she stops to treat anyone hurt nearby (and the healer in her gains you nothing in trust: it's hers).
    if (m.row.flaw.id === 'healer' && Math.random() < dt * 0.2) this.flawHeal(m, c);
    return true;
  }

  // A member in a seat: MAN THE GUN / FALL BACK / the GUNNER job work a gun; the DRIVER job takes the wheel from you;
  // anyone else shoots from their window and gets out when you do (seats.js's follower rule).
  ride(m, c, v, dt) {
    const g = this.g, p = g.player, J = m.job ? CREW_JOB_BY_ID[m.job] : null;
    if (v.driver === c) return; // the chauffeur: vehicles.js drives
    if (J?.effect === 'drive' && v.driver === p && p.inVehicle === v) { g.seats.cycle(p); return; }
    if (m.order === 'mangun' || m.order === 'fallback' || J?.effect === 'gun' || p.inVehicle === v) this.gunnery(m, c, v, dt);
    if (m.order === 'follow' && !p.inVehicle && !p.onDeck && !(J?.where === 'road')) g.seats.leave(c);
  }

  flawHeal(m, c) {

    const g = this.g;
    for (const o of g.chars) {
      if (!o.alive || o === c || o === g.player || o.faction === 'zombie' || o.faction === 'raider' || o.hp >= (o.maxHp ?? 100) * 0.6) continue;
      if (Math.abs(o.x - c.x) > 10 || Math.abs(o.z - c.z) > 10) continue;
      o.hp = Math.min(o.maxHp ?? 100, o.hp + 20); o.bleed = 0;
      this.say(m, 'Hold still. This will sting.');
      g.emit('crewFlaw', { rec: m.id, flaw: 'healer', patched: o.id });
      return;
    }
  }

  gunnery(m, c, v, dt) {
    const g = this.g;
    m.gunCool = (m.gunCool ?? 0) - dt;
    if (m.gunCool > 0) return;
    let best = null, bd = 48 + 4 * m.row.skills.shooting;
    for (const o of g.chars) { if (!o.alive || o.inVehicle || !g.ai.hostile(c, o)) continue; const d = Math.hypot(o.x - v.x, o.z - v.z); if (d < bd && g.statics.lineOfSight(v.x, v.z, o.x, o.z)) { bd = d; best = o; } }
    if (!best) return;
    const ang = Math.atan2(best.x - v.x, best.z - v.z), spread = 0.16 - 0.025 * m.row.skills.shooting;
    // The workshop's mounted weapons (systems/workshop.js: groups by arc) first, then the old hood gun, then their own gun.
    if (v.mounts && g.workshop?.fireMount) { const r = g.workshop.fireMount(v, 1, ang + (Math.random() - 0.5) * spread, c); if (r?.fired) { m.gunCool = 0.12; return; } }
    if (v.mounts?.front && Math.abs(((ang - v.h + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < 0.6 && g.garage.fireFront?.(v, c, ang + (Math.random() - 0.5) * spread)) { m.gunCool = 0.12; return; }
    if (!c.weapon || c.tac?.holdFire) return;
    const w = WEAPONS[c.weapon];
    // A rider's own gun: the magazine, then a reload out of their spare rounds (ai.js reloads only those on their feet).
    if (c.mag <= 0) { const n = Math.min(w.mag, m.rounds); if (n <= 0) return; m.rounds -= n; c.mag = n; m.gunCool = w.reload * 1.2; return; }
    const a = ang + (Math.random() - 0.5) * spread;
    if (c.onDeck) { c.face = a; c.aiming = true; if (!g.combat.fire(c, c.weapon, a)) return; }
    else g.carCombat.fireFromVehicle(c, v, c.weapon, a);
    c.mag--;
    m.gunCool = w.auto ? w.rate * 1.6 : w.rate * 2.2 + Math.random() * 0.3;
  }


  lootBox(m, id) {
    const g = this.g, inv = g.inventory, box = inv?.boxes.get(id);
    if (!box) return 0;
    if (!box.rolled) { inv.roll(box, 0); box.rolled = true; }
    let moved = 0;
    for (let i = box.slots.length - 1; i >= 0; i--) {
      const s = box.slots[i], fit = inv.add(inv.carried, s.id, s.n, s);
      if (fit > 0) { inv.take(box, i, fit); moved += fit; }
    }
    if (m.row.flaw.id === 'hoarder') this.say(m, 'Got it all. Even the bent one.');
    else this.say(m, moved ? 'Grabbed what was worth carrying.' : 'Nothing in there.');
    g.emit('crewLooted', { rec: m.id, box: id, items: moved });
    return moved;
  }

  // ---- jobs ---------------------------------------------------------------------------------------------------------
  assignJob(m, jobId) {
    const g = this.g;
    if (!jobId || jobId === 'none') { m.job = null; m.jobP = 0; g.emit('crewJob', { rec: m.id, job: null }); return { ok: true, job: null }; }
    const J = CREW_JOB_BY_ID[jobId];
    if (!J) return { ok: false, why: `no job ${jobId}; one of ${CREW_JOBS.map((j) => j.id).join(', ')}` };
    if (J.where === 'base' && !this.base) return { ok: false, why: 'claim a base first (crewJob claimBase=true, or CLAIM on the CREW panel inside a building)' };
    if (m.away) return { ok: false, why: `${m.name} is out on a run` };
    m.job = jobId; m.jobP = 0;
    if (J.where === 'camp' && !this.camp) this.camp = { x: g.player.x, z: g.player.z, day: g.society?.day ?? 0 };
    if (J.offscreen) this.startRun(m, J);
    g.emit('crewJob', { rec: m.id, name: m.name, job: jobId, where: J.where });
    g.hud.toast(`${m.name.toUpperCase()}: ${J.name}`, 'job');
    return { ok: true, job: jobId, where: J.where, skill: J.skill, level: m.row.skills[J.skill] };
  }

  skillMul(m, J) { return 0.5 + 0.25 * (m.row.skills[J.skill] ?? 1); }

  // Is the job's place in play? road: you are driving and they ride; camp: stopped near the camp; base: they are at the base.
  jobLive(m, J) {
    const g = this.g, p = g.player;
    if (J.where === 'road') return !!(p.inVehicle || p.onDeck) && !!(m.c?.inVehicle || m.c?.onDeck);
    if (J.where === 'camp') { const cp = this.camp; if (!cp) return false; const v = p.inVehicle; return (!v || g.vehiclesSys.speed(v) < 2) && Math.hypot(p.x - cp.x, p.z - cp.z) < 45; }
    if (J.where === 'base') return !!this.base && (!m.c || Math.hypot(m.c.x - this.base.x, m.c.z - this.base.z) < 40);
    return false;
  }

  // The body's part of a job (walking to the base, holding the gate). true: handled.
  jobBody(m, J, c, dt) {
    const g = this.g;
    if (J.where === 'base' && this.base) {
      const B = this.base, d = Math.hypot(B.x - c.x, B.z - c.z);
      if (c.inVehicle) { g.seats.leave(c); return true; }
      if (d > (J.effect === 'guard' ? 1 : 6)) { g.ai.move(c, B.x - c.x, B.z - c.z, 4.4, dt); return true; }
      c.speed = 0; if (J.effect === 'guard') c.face += dt * 0.3;
      return true;
    }
    if (J.effect === 'drive') {
      const p = g.player, v = p.inVehicle;
      if (v && c.inVehicle === v && v.driver === p) g.seats.cycle(p); // you slide over; they take the wheel (seats.js chauffeur)
      return false;
    }
    if (J.effect === 'gun' && c.inVehicle) { this.gunnery(m, c, c.inVehicle, dt); return true; }
    if (J.where === 'camp' && this.camp && this.jobLive(m, J)) {
      const cp = this.camp, d = Math.hypot(cp.x - c.x, cp.z - c.z);
      if (c.inVehicle) return false;
      if (d > 5) { g.ai.move(c, cp.x - c.x, cp.z - c.z, 3.2, dt); return true; }
      c.speed = 0; if (J.effect === 'watch') c.face += dt * 0.35;
      return true;
    }
    return false;
  }

  // Game-clock job work: hours elapsed this tick.
  tickJobs(hrs) {
    const g = this.g;
    for (const m of this.members) {
      if (!m.job || m.down) continue;
      const J = CREW_JOB_BY_ID[m.job];
      if (J.offscreen) continue; // runs are timed by their own clock (tickRuns)
      if (!J.hours || !this.jobLive(m, J)) continue;
      if (J.effect === 'navigate' && !(g.player.inVehicle && g.vehiclesSys.speed(g.player.inVehicle) > 4)) continue;
      m.jobP += (hrs / J.hours) * this.skillMul(m, J);
      while (m.jobP >= 1) { m.jobP -= 1; if (!this.jobCycle(m, J)) { m.jobP = 0; break; } }
    }
  }

  // One cycle of a job: inputs in, outputs out. false: no inputs (the job waits).
  jobCycle(m, J) {
    const g = this.g, inv = g.inventory, mul = this.skillMul(m, J), p = g.player;
    if (J.effect === 'feed' && g.cooking) { // a recipe from the real stock first (systems/cooking.js); else the plain meal below
      const meal = g.cooking.crewCook(m, mul);
      if (meal) {
        for (const x of this.members) { x.needs.food = Math.min(1, x.needs.food + meal.per); if (meal.off && x.c?.alive) x.c.hp = Math.max(1, x.c.hp - 6); }
        if (g.needs) g.needs.food = Math.min(1, g.needs.food + meal.per * 0.5);
        if (!meal.off) this.trustEvent('fedCrew', null, true);
        this.stats.jobsDone++; g.emit('crewJobDone', { rec: m.id, job: J.id, what: meal.text });
        this.say(m, meal.off ? `cook: ${meal.text}. Somebody should not have kept that food.` : `cook: ${meal.text} for everyone.`, true);
        return true;
      }
    }
    if (J.inputs) for (const [id, n] of Object.entries(J.inputs)) if (!this.takeItem(id, n)) { this.say(m, `Out of ${id === 'any_food' ? 'food' : ITEMS[id]?.name.toLowerCase() ?? id}.`, true); return false; }
    const O = J.outputs ?? {};
    let what = '';
    switch (J.effect) {
      case 'feed': for (const x of this.members) x.needs.food = Math.min(1, x.needs.food + O.food * mul); if (g.needs) g.needs.food = Math.min(1, g.needs.food + O.food * 0.5 * mul); what = 'a hot meal'; this.trustEvent('fedCrew', null, true); break;
      case 'heal': { const n = O.hp * mul; p.hp = Math.min(p.maxHp ?? 100, p.hp + n); for (const x of this.members) if (x.c?.alive) x.c.hp = Math.min(x.c.maxHp, x.c.hp + n); what = 'wounds dressed'; break; }
      case 'clean': for (const k of g.inv.weapons) { g.inv.cond[k] = Math.min(1, (g.inv.cond[k] ?? 1) + O.cond * mul); g.inv.jam[k] = false; } what = 'guns cleaned'; break;
      case 'mend': { const G = g.gear; let n = 0; if (G?.worn) for (const s of Object.values(G.worn)) if (s && s.cond !== undefined) { s.cond = Math.min(1, s.cond + O.cond * mul); n++; } for (const k of g.inv.weapons) g.inv.cond[k] = Math.min(1, (g.inv.cond[k] ?? 1) + O.cond * 0.4 * mul); what = 'gear mended'; break; }
      case 'repair': { const v = this.vehicleNear(this.base, 30) ?? g.lastVehicle; if (v && !v.dead) { v.hp = Math.min(v.maxHp, v.hp + v.maxHp * O.hp * mul); g.vehDamage?.repair?.(v); what = `${v.name ?? 'the rig'} patched`; } break; }
      case 'ammo': { const n = Math.round(O.ammo_pistol * mul); this.deliver('ammo_pistol', n); what = `${n} hand-loads`; break; }
      case 'farm': { const r = g.farming?.crewTend(m, mul); if (!r?.ok) { this.say(m, r?.why ?? 'There is no garden to tend.', true); return false; } what = r.what; break; }
      case 'navigate': case 'radio': this.pinNear(m, J.effect); what = 'a mark on the map'; break;
    }
    this.stats.jobsDone++;
    g.emit('crewJobDone', { rec: m.id, job: J.id, what });
    if (what) this.say(m, `${J.name.toLowerCase()}: ${what}.`, true);
    return true;
  }

  takeItem(id, n) {
    const inv = this.g.inventory;
    if (!inv) return false;
    const slots = inv.carried.slots;
    for (let i = 0; i < slots.length; i++) {
      const it = ITEMS[slots[i].id];
      if (id === 'any_food' ? it?.kind === 'food' : slots[i].id === id) { inv.take(inv.carried, i, n); return true; }
    }
    return false;
  }

  // Into the base's stash when there is a base and you are away from it; else into your pack.
  deliver(id, n) {
    const g = this.g, inv = g.inventory;
    if (!inv || !ITEMS[id] || n <= 0) return 0;
    if (this.base && Math.hypot(g.player.x - this.base.x, g.player.z - this.base.z) > 30) { const box = this.stash(); return inv.add(box, id, n); }
    return inv.add(inv.carried, id, n);
  }
  stash() {
    const inv = this.g.inventory, B = this.base;
    let box = inv.boxes.get('crew:stash');
    if (!box) { box = inv.place('crew:stash', 'crate', B.x, B.z, 400, 'CREW STASH'); box.rolled = true; }
    box.x = B.x; box.z = B.z;
    return box;
  }

  vehicleNear(at, r) { if (!at) return null; let best = null, bd = r; for (const v of this.g.vehicles) { if (v.dead) continue; const d = Math.hypot(v.x - at.x, v.z - at.z); if (d < bd) { bd = d; best = v; } } return best; }

  pinNear(m, why) {
    const g = this.g, p = g.player, v = p.inVehicle, h = v ? v.h : p.face;
    const seed = hash(`${m.id}:${Math.floor(this.hours())}`), dist = 300 + (seed % 500), a = h + (((seed >>> 9) % 100) / 100 - 0.5) * 1.2;
    const x = p.x + Math.sin(a) * dist, z = p.z + Math.cos(a) * dist;
    const label = why === 'radio' ? ['a distress call', 'a cache on the band', 'a trader calling prices'][seed % 3] : ['a place worth a look', 'tracks off the road', 'a dead rig, maybe loaded'][seed % 3];
    this.pins.push({ x: +x.toFixed(0), z: +z.toFixed(0), label, by: m.name, day: g.society?.day ?? 0 });
    if (this.pins.length > 24) this.pins.shift();
    g.emit('crewPin', { by: m.name, x: Math.round(x), z: Math.round(z), label });
  }

  // ---- the off-screen scavenge run ------------------------------------------------------------------------------------
  startRun(m, J) {
    const g = this.g, c = m.c;
    m.away = { job: J.id, until: this.hours() + J.hours / this.skillMul(m, J) * 1.0, seed: hash(`${m.id}:${Math.floor(this.hours())}`), left: this.hours() };
    m.hp = c?.hp ?? m.hp;
    if (c) { if (c.inVehicle) g.seats.leave(c, true); c.crewRec = null; g.removeChar(c); }
    m.c = null; m.cid = null;
    this.stats.runs++;
    g.emit('crewRun', { rec: m.id, name: m.name, back: +m.away.until.toFixed(1) });
  }

  tickRuns() {
    const g = this.g, now = this.hours();
    for (const m of [...this.members]) {
      if (!m.away || now < m.away.until) continue;
      const J = CREW_JOB_BY_ID[m.away.job], seed = m.away.seed;
      let s = seed; const rnd = () => { s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0; return s / 4294967296; };
      const risk = J.risk * (1.25 - 0.1 * m.row.skills.scavenge), trouble = rnd() < risk, lost = trouble && rnd() < risk;
      m.away = null; m.job = null;
      if (lost) { this.members.splice(this.members.indexOf(m), 1); this.bury(m, null, 'did not come back from a run', false); continue; }
      const loot = [];
      for (let k = 0; k < (J.outputs.rolls ?? 3); k++) {
        let tot = 0; for (const r of CREW_RUN_LOOT) tot += r[1];
        let pick = rnd() * tot; const r = CREW_RUN_LOOT.find((x) => (pick -= x[1]) < 0) ?? CREW_RUN_LOOT[0];
        const n = r[2] + Math.floor(rnd() * (r[3] - r[2] + 1));
        loot.push({ id: r[0], n }); this.deliver(r[0], n);
      }
      if (rnd() < (J.outputs.pin ?? 0)) this.pinNear(m, 'run');
      m.hp = trouble ? Math.max(15, m.hp * 0.45) : m.hp;
      const at = this.base ?? { x: g.player.x + 4, z: g.player.z + 4 };
      const c = this.respawn(m, at.x + 2, at.z + 2);
      if (c) c.hp = m.hp;
      g.emit('crewRunBack', { rec: m.id, name: m.name, hurt: trouble, loot });
      g.hud.toast(`${m.name.toUpperCase()} IS BACK FROM THE RUN${trouble ? ' · HURT' : ''} · ${loot.map((l) => `${l.n} ${(ITEMS[l.id]?.name ?? l.id).toLowerCase()}`).join(', ')}`, trouble ? 'warn' : 'job');
    }
  }

  respawn(m, x, z) {
    const g = this.g;
    const c = g.addChar({ x, z, faction: 'ally', weapon: m.row.weapon, hp: m.row.hp, name: m.name, flag: m.flag, colors: m.colors ?? this.colors(m.row, hash(m.name)) });
    if (!c) return null;
    this.attach(m, c);
    c.mag = c.weapon ? WEAPONS[c.weapon].mag : 0;
    return c;
  }

  // ---- gear between you and them ------------------------------------------------------------------------------------
  ammoFor(m) { const w = WEAPONS[m.c?.weapon]; if (!w) return 0; return this.g.inventory?.carried.count(AMMO_ITEM[w.ammo]) ?? 0; }
  giveRounds(m, n = 30) {
    const g = this.g, w = WEAPONS[m.c?.weapon]; if (!w) return { ok: false, why: 'no gun to load' };
    const id = AMMO_ITEM[w.ammo], inv = g.inventory, slots = inv.carried.slots;
    let moved = 0;
    for (let i = slots.length - 1; i >= 0 && moved < n; i--) if (slots[i].id === id) { const k = Math.min(n - moved, slots[i].n); inv.take(inv.carried, i, k); moved += k; }
    m.rounds += moved;
    g.emit('crewGear', { rec: m.id, gave: id, n: moved });
    return { ok: moved > 0, rounds: m.rounds, moved };
  }
  takeGun(m) {
    const g = this.g, c = m.c; if (!c?.weapon) return { ok: false, why: 'no gun' };
    const k = c.weapon, inv = g.inventory;
    const fit = inv.add(inv.carried, GUN_ITEM[k], 1, { cond: 0.9 });
    if (!fit) return { ok: false, why: 'your pack is full' };
    if (m.rounds > 0) { inv.add(inv.carried, AMMO_ITEM[WEAPONS[k].ammo], m.rounds); m.rounds = 0; }
    c.weapon = null; c.mag = 0;
    if (m.row.flaw.id === 'hoarder') this.trustEvent('unpaid', m, true);
    g.emit('crewGear', { rec: m.id, took: k });
    return { ok: true, took: k };
  }
  giveGun(m) {
    const g = this.g, c = m.c, k = g.inv.current; if (!c || c.weapon) return { ok: false, why: c ? 'they are already armed' : 'not here' };
    if (g.inv.weapons.length < 2) return { ok: false, why: 'that is your only gun' };
    g.inv.weapons = g.inv.weapons.filter((x) => x !== k); g.inv.current = g.inv.weapons[0]; g.player.weapon = g.inv.current;
    c.weapon = k; c.mag = WEAPONS[k].mag; m.rounds += g.inv.mag[k] ?? 0;
    g.emit('crewGear', { rec: m.id, gave: k });
    return { ok: true, gave: k };
  }
  // Rounds come out of their own pool: a member reloads from rec.rounds (ai.js refills mag; we pay for it here).
  payReloads() {
    for (const m of this.members) {
      const c = m.c; if (!c?.alive || !c.weapon) continue;
      const w = WEAPONS[c.weapon];
      if (c.reloading > 0 && !m.reloadPaid) { m.reloadPaid = true; const need = w.mag - Math.max(0, c.mag); if (m.rounds < need) { c.mag = Math.max(0, c.mag) - need + m.rounds; m.rounds = 0; } else m.rounds -= need; }
      if (!(c.reloading > 0)) m.reloadPaid = false;
      if (m.rounds <= 0 && c.mag <= 0 && !m.dry) { m.dry = true; this.bark(m, 'dry', null, true); this.g.emit('crewDry', { rec: m.id, name: m.name }); }
      if (m.rounds > 0) m.dry = false;
      if (m.dry && c.mag <= 0) { c.reloading = 0; c.target = null; }
    }
  }

  // ---- trust (§4.4) -------------------------------------------------------------------------------------------------
  // ΔT = weight · value(member, kind) · (1 seen | heardMul heard)
  applyTrust(m, kind, weight, seen) {
    const v = m.row.values[kind] ?? 0;
    if (!v) return 0;
    const d = weight * v * (seen ? 1 : R.heardMul);
    m.trust = clamp(m.trust + d, R.trustMin, R.trustMax);
    this.stats.trustEvents++;
    if (Math.abs(d) >= 6) this.bark(m, d > 0 ? 'approve' : 'disapprove', null, true);
    return d;
  }

  trustEvent(kind, only = null, seen = true, x = null, z = null) {
    const g = this.g, W = CREW_EVENTS[kind]?.weight ?? 1, out = [];
    for (const m of only ? [only] : this.members) {
      if (m.away) continue;
      const s = x === null ? seen : this.sawIt(m, x, z);
      const d = this.applyTrust(m, kind, W, s);
      if (d) out.push({ rec: m.id, d: +d.toFixed(2), trust: +m.trust.toFixed(2) });
    }
    if (out.length) g.emit('crewTrust', { kind, seen, changes: out });
    return out;
  }

  sawIt(m, x, z) {
    const c = m.c, g = this.g;
    if (!c?.alive || m.down) return false;
    const d = Math.hypot(c.x - x, c.z - z);
    return d < R.witnessR && (d < 3 || g.los(c.x, c.z, x, z));
  }

  // Read new chronicle records: every deed you did moves each member's trust by their values.
  readDeeds() {
    const g = this.g, C = g.society?.chronicle;
    if (!C || C.seq === this.seq) return;
    const from = this.seq; this.seq = C.seq;
    if (!this.members.length) return;
    const n = Math.min(C.seq - from, C.size);
    for (let k = n; k >= 1; k--) {
      const rec = C.ring[(C.head - k + C.cap * 2) % C.cap];
      if (rec.seq <= from || rec.a !== 'player') continue;
      const w = clamp(Math.round(rec.m || VERBS[rec.v] || 1), 1, 4);
      const target = rec.o ? g.chars.find((c) => c.id === rec.o) : null;
      const kinds = [rec.v];
      if (target?.crewRec && (rec.v === 'hurt' || rec.v === 'kill')) kinds.length = 0, kinds.push('shotCrew');
      if (rec.v === 'kill' && target && !target.weapon && target.faction !== 'zombie') kinds.push('killUnarmed');
      if (rec.v === 'kill' && (rec.of === 'dustwolves' || target?.faction === 'raider')) kinds.push('killRaider');
      const took = this.took; took.length = 0;
      for (const m of this.members) {
        if (m.away) continue;
        const seen = this.sawIt(m, rec.x, rec.z);
        let sum = 0;
        for (const k of kinds) { const d = this.applyTrust(m, k, k in CREW_EVENTS ? CREW_EVENTS[k].weight : w, seen); if (d) { sum += d; this.remember(m, k, rec.v, d, rec); g.emit('crewTrust', { kind: k, verb: rec.v, record: rec.seq, rec: m.id, d: +d.toFixed(2), trust: +m.trust.toFixed(2), seen }); } }
        if (sum && seen) took.push([m, sum]);
      }
      // Two who saw it and took it the same way grow closer; opposite ways, apart (the seed of a quarrel).
      for (let i = 0; i < took.length; i++) for (let j = i + 1; j < took.length; j++) {
        const same = (took[i][1] > 0) === (took[j][1] > 0), v = this.moveBond(took[i][0], took[j][0], same ? BR.agree : -BR.disagree);
        g.emit('crewBond', { a: took[i][0].id, b: took[j][0].id, why: rec.v, same, bond: +v.toFixed(1) });
      }
    }
  }

  // A fight you won outnumbered: hostiles down by you and yours inside 25 s at least the crew's size + 2.
  onKill(victim, by) {
    if (!this.members.length || !by || !(by === this.g.player || by.crewRec)) return;
    if (!(victim.faction === 'raider' || victim.faction === 'zombie' || victim.target === this.g.player)) return;
    if (by.crewRec) by.crewRec.kills++;
    const F = this.fight, t = this.g.time;
    if (t - F.t0 > 25) { F.t0 = t; F.kills = 0; }
    F.kills++;
    if (F.kills >= this.size() + 2 && t - F.won > 120) { F.won = t; this.trustEvent('winOutnumbered', null, true); }
  }

  // ---- down, bleed, drag, death -------------------------------------------------------------------------------------
  goDown(m) {
    const g = this.g, c = m.c;
    if (c.headless || c.charred) return this.die(m, 'killed outright');
    m.down = true; m.bleed = R.bleedOut; c.downedT = 0; // ours to handle: no Doc Reyes walk home (ai.js)
    c.target = null; if (c.inVehicle) g.seats.leave(c, true);
    g.hud.toast(`${m.name.toUpperCase()} IS DOWN · ${R.bleedOut}s TO PATCH THEM UP (E) OR DRAG THEM CLEAR (HOLD E)`, 'hot');
    g.emit('crewDown', { rec: m.id, id: c.id, name: m.name, bleed: R.bleedOut });
    this.bark(m, 'down', null, true);
  }

  stabilize(m, item = null) {
    const g = this.g, c = m.c;
    if (!m.down || !c) return { ok: false, why: 'not down' };
    m.down = false; m.bleed = 0; m.saves++;
    c.alive = true; c.hp = Math.round(c.maxHp * R.stabilizeHp); c.deadTime = 0; c.bleed = 0; c.blood = 0.4; c.downedT = 0;
    g.charR.paint(c);
    if (this.drag === m) this.stopDrag();
    this.stats.saved++;
    this.trustEvent('savedCrew', null, true, c.x, c.z);
    g.hud.toast(`${m.name.toUpperCase()} IS BACK UP${item ? ` · ${(ITEMS[item]?.name ?? item).toUpperCase()}` : ''}`, 'job');
    g.emit('crewSaved', { rec: m.id, id: c.id, saves: m.saves, item });
    return { ok: true, saves: m.saves };
  }

  die(m, why = 'bled out') {
    const g = this.g, c = m.c, far = c ? Math.hypot(c.x - g.player.x, c.z - g.player.z) : 0;
    const i = this.members.indexOf(m); if (i >= 0) this.members.splice(i, 1);
    if (this.drag === m) this.stopDrag();
    if (c) { c.alive = false; c.downedT = 0; c.crewRec = null; c.follower = false; c.npc = null; }
    if (why === 'bled out' && far > 40) this.trustEvent('abandonCrew', null, false);
    this.bury(m, c, why, true);
  }

  bury(m, c, why, body) {
    const g = this.g, day = g.society?.day ?? 0, x = c?.x ?? this.base?.x ?? g.player.x, z = c?.z ?? this.base?.z ?? g.player.z;
    this.graves.push({ x: +(x + 1.2).toFixed(1), z: +z.toFixed(1), name: m.name, flag: m.flag, card: m.row.name, day, why });
    g.rites?.graveFromCrew(m, x + 1.2, z, why); // a grave row like anyone's (systems/rites.js)
    this.memorial.push({ name: m.name, card: m.row.name, flag: m.flag, day, days: day - m.day, saves: m.saves, kills: m.kills, why });
    this.stats.died++;
    // The chronicle remembers it (the day's digest and the radio read from it).
    g.society?.chronicle?.add({ t: +g.time.toFixed(2), day, hr: +(g.sky.time ?? 0).toFixed(2), a: 'player', af: 'player', v: 'crewDied', o: c?.id ?? '', on: m.name, of: 'crew', p: g.society?.placeAt?.(x, z) ?? '', x: +x.toFixed(1), z: +z.toFixed(1), m: 3, k: 1, src: 'crew' });
    const line = `STATIC 1660. The road took ${m.name} today, ${m.row.name}, ${m.days ?? Math.max(0, day - m.day)} days riding. ${why === 'did not come back from a run' ? 'Went out alone and the wastes kept them.' : 'Somebody dig a straight hole.'}`;
    g.society?.director?.radio?.(line, 2);
    this.obituary = line;
    g.hud.toast(`${m.name.toUpperCase()} (${m.row.name.toUpperCase()}) IS GONE · A GRAVE, A NAME ON THE WALL`, 'hot');
    g.emit('crewDied', { rec: m.id, id: c?.id ?? null, name: m.name, card: m.row.name, why, grave: this.graves.at(-1), obituary: line });
  }

  stopDrag() { const p = this.g.player; if (p.dragging === this.drag?.c) p.dragging = null; if (this.drag?.c) this.drag.c.dragged = null; this.drag = null; }
  startDrag(m) { const p = this.g.player; this.drag = m; p.dragging = m.c; m.c.dragged = p; this.g.emit('crewDrag', { rec: m.id, on: true }); }

  downedNear(r = R.reviveReach) { const p = this.g.player; for (const m of this.members) if (m.down && m.c && Math.hypot(m.c.x - p.x, m.c.z - p.z) < r) return m; return null; }

  bandage() { const inv = this.g.inventory; if (!inv) return null; for (const id of ['first_aid', 'suture_kit', 'bandage', 'rag']) { const i = inv.carried.slots.findIndex((s) => s.id === id); if (i >= 0) { inv.take(inv.carried, i, 1); return id; } } return null; }

  // Before the player moves (main.js frame): E beside a downed member is ours. Tap: patch up. Hold: drag / drop.
  input(I) {
    const g = this.g, p = g.player;
    if (!this.members.length || !p.alive || p.inVehicle) { if (this.drag) this.stopDrag(); return; }
    const m = this.drag ?? this.downedNear();
    if (!m) { this.ePress = -1; return; }
    if (I.hit('KeyE')) { I.pressed.delete('KeyE'); this.ePress = g.time; if (this.drag) { this.stopDrag(); this.ePress = -1; } return; }
    if (this.ePress >= 0 && I.key('KeyE')) { if (g.time - this.ePress > 0.4 && !this.drag) { this.startDrag(m); this.ePress = -1; } return; }
    if (this.ePress >= 0 && !I.key('KeyE')) {
      this.ePress = -1;
      if (!this.drag) { const item = this.bandage(); if (item) this.stabilize(m, item); else g.hud.toast('NOTHING TO PATCH THEM WITH: A BANDAGE, A RAG, A KIT', 'warn'); }
    }
  }

  // ---- per frame ----------------------------------------------------------------------------------------------------
  hours() { return (this.g.society?.day ?? 0) * 24 + (this.g.sky.time ?? 0); }

  update(dt) {
    const g = this.g, p = g.player;
    // Down members: the clock runs; whoever is dragged comes along.
    for (const m of [...this.members]) {
      const c = m.c;
      if (!c || m.away) continue;
      if (!c.alive && !m.down) this.goDown(m);
      if (m.down) {
        m.bleed -= dt * (this.drag === m ? 0.6 : 1);
        if (m.bleed <= 0) { this.die(m, 'bled out'); continue; }
        if (this.drag === m) {
          const back = 1.1, h = p.face, tx = p.x - Math.sin(h) * back, tz = p.z - Math.cos(h) * back;
          c.x += (tx - c.x) * Math.min(1, dt * 8); c.z += (tz - c.z) * Math.min(1, dt * 8);
        }
      }
    }
    // Riders: ai.js skips anyone in a seat, so the crew in your rig are worked here (guns, the wheel, getting out).
    for (const m of this.members) if (m.c?.inVehicle && m.c.alive && !m.down) this.ride(m, m.c, m.c.inVehicle, dt);
    if (this.drag && p.speed > R.dragSpeed) p.speed = R.dragSpeed; // dragging a body is slow (systems/arms.js: hands busy)
    this.payReloads();
    // Low-rate work.
    if ((this.scanT -= dt) <= 0) {
      this.scanT = 0.5;
      this.readDeeds();
      this.lookout();
      if (this.members.some((m) => m.trust > R.lastStandAbove)) this.lastStand();
    }
    if ((this.slowT -= dt) <= 0) {
      this.slowT = 1;
      this.promoteNear();
      this.earn();
      const hrs = this.hours();
      if (this.hourMark === null) this.hourMark = hrs;
      const dh = hrs - this.hourMark;
      if (dh > 0) {
        this.hourMark = hrs;
        if (dh < 48) {
          this.drainNeeds(dh);
          this.tickJobs(dh);
          this.tickRuns();
          const d0 = Math.floor((hrs - dh - 6) / 24), d1 = Math.floor((hrs - 6) / 24);
          for (let d = d0; d < d1; d++) this.dawn();
        }
      }
      if (g.survival?.sleep && !this.camp) this.camp = { x: p.x, z: p.z, day: g.society?.day ?? 0 };
      // Camp talk: at the camp, at night or while you sleep, a line every 35-70 s.
      if (this.members.length && this.campLive() && ((g.sky.night ?? 0) > 0.5 || g.survival?.sleep) && g.time >= this.campAt) {
        this.campAt = g.time + BR.campEvery[0] + Math.random() * (BR.campEvery[1] - BR.campEvery[0]);
        this.campTalk();
      }
    }
  }

  drainNeeds(hrs) {
    const N = R.needsPerHour;
    for (const m of this.members) { if (m.away) continue; m.needs.food = Math.max(0, m.needs.food - N.food * hrs); m.needs.water = Math.max(0, m.needs.water - N.water * hrs); m.needs.rest = Math.max(0, m.needs.rest - N.rest * hrs * (this.g.survival?.sleep ? -2 : 1)); m.needs.rest = Math.min(1, m.needs.rest); }
  }

  // Dawn: the day's drift, the wages, the hungry, and who walks.
  dawn() {
    const g = this.g;
    for (const m of [...this.members]) {
      m.trust += m.trust > 0 ? -Math.min(R.trustDecayPerDay, m.trust) : Math.min(R.trustDecayPerDay, -m.trust);
      if (m.pay > 0 && !m.away) { if (g.spend?.(m.pay)) this.trustEvent('paid', m, true); else this.trustEvent('unpaid', m, true); }
      if (m.needs.food < R.hungerTrust || m.needs.water < R.hungerTrust) this.trustEvent('starved', m, true);
      // Water from the canteen: a member drinks at dawn if you carry water (the cook job feeds them; water is simpler).
      if (m.needs.water < 0.6 && this.takeItem('canteen', 1)) m.needs.water = 1;
      if (m.trust < R.betrayBelow && this.rivalNear()) { this.leave(m, 'betrayed', true); continue; }
      if (m.trust < R.leaveBelow && !m.away) this.leave(m, 'left', true);
    }
    g.emit('crewDawn', { day: g.society?.day ?? 0, crew: this.members.map((m) => ({ rec: m.id, trust: +m.trust.toFixed(1) })) });
  }
  rivalNear() { const g = this.g, p = g.player; for (const c of g.world.spawns.camps ?? []) if (Math.hypot(c.x - p.x, c.z - p.z) < 500) return true; return false; }

  // Trust over 60: the last stand. A member steps between you and the shooter when you are low.
  lastStand() {
    const g = this.g, p = g.player;
    if (p.hp > (p.maxHp ?? 100) * 0.3) return;
    const shooter = g.chars.find((o) => o.alive && o.target === p && Math.hypot(o.x - p.x, o.z - p.z) < 40);
    if (!shooter) return;
    for (const m of this.members) {
      if (m.trust <= R.lastStandAbove || m.down || !m.c?.alive || m.c.inVehicle) continue;
      const c = m.c, t = 0.4;
      c.x += ((p.x + (shooter.x - p.x) * 0.12) - c.x) * t; c.z += ((p.z + (shooter.z - p.z) * 0.12) - c.z) * t;
      c.target = shooter;
      if (!m.lastStand) { m.lastStand = true; this.bark(m, 'lastStand', null, true); g.emit('crewLastStand', { rec: m.id, name: m.name }); }
      return;
    }
  }

  // LOOKOUT / STAND WATCH: name trouble before it opens up.
  lookout() {
    const g = this.g, p = g.player;
    for (const m of this.members) {
      if (!m.job || m.down || m.away || !m.c) continue;
      const J = CREW_JOB_BY_ID[m.job];
      if (J.effect !== 'lookout' && J.effect !== 'watch' && J.effect !== 'guard') continue;
      if (!this.jobLive(m, J) && J.effect !== 'guard') continue;
      const R2 = (J.effect === 'lookout' ? 60 : 40) * (0.6 + 0.1 * m.row.skills.scout);
      let best = null, bd = R2;
      for (const o of g.chars) { if (!o.alive || o.called === m.id || !(o.faction === 'raider' || o.faction === 'zombie' || o.target === p)) continue; const d = Math.hypot(o.x - m.c.x, o.z - m.c.z); if (d < bd) { bd = d; best = o; } }
      if (!best) continue;
      best.called = m.id;
      const dir = ['NORTH', 'NORTH-EAST', 'EAST', 'SOUTH-EAST', 'SOUTH', 'SOUTH-WEST', 'WEST', 'NORTH-WEST'][((Math.round(Math.atan2(best.x - p.x, -(best.z - p.z)) / (Math.PI / 4)) % 8) + 8) % 8];
      const what = best.faction === 'zombie' ? 'INFECTED' : best.faction === 'raider' ? 'DUSTWOLVES' : 'TROUBLE';
      this.bark(m, 'callout', { what, dir, d: Math.round(bd) }, true);
      if (J.effect === 'watch' && g.survival?.sleep) g.survival.wake('your watch woke you');
      g.emit('crewCallout', { rec: m.id, job: J.id, what, dir, d: Math.round(bd), target: best.id });
    }
  }

  // EARN: a role at renowned draws the card that likes it (once each).
  earn() {
    const g = this.g, Rl = g.roles;
    if (!Rl?.atLeast) return;
    for (const row of CREW_ROWS) {
      if (!row.role || this.cands.has(`earn_${row.id}`) || !Rl.atLeast(row.role, 'renowned')) continue;
      if (!this.canJoin(row).ok) continue;
      const p = g.player, a = p.face + Math.PI, s = { key: `earn_${row.id}`, row: row.id, how: 'earn', where: { x: p.x + Math.sin(a) * 12, z: p.z + Math.cos(a) * 12 }, line: `They say you are the one people talk about. I came a long way to ride with you.`, state: 'waiting' };
      this.cands.set(s.key, s);
      this.spawnCandidate(s, s.where.x, s.where.z);
      g.hud.toast(`SOMEONE CAME LOOKING FOR YOU: ${row.name.toUpperCase()}`, 'job');
    }
  }

  // Every crew line goes out here: the subtitle, the voice layer, and the `crewSay` event the voice/LLM lane reads (kind,
  // who it is to, the context it came from) to voice it or swap in a generated line.
  say(m, line, force = false, kind = 'bark', to = null, ctx = null) {
    const g = this.g;
    if (!force && g.time - (m.sayAt ?? -1e9) < SAY_GAP) return false;
    m.sayAt = g.time;
    g.hud?.subtitle?.(`${m.name}: ${line}`, 3);
    if (m.c) g.voice?.speak?.(m.c, line, { kind: kind === 'camp' ? 'talk' : 'bark', after: kind === 'camp' });
    g.emit('crewSay', { rec: m.id, name: m.name, kind, line, to: to?.id ?? to ?? null, ctx });
    this.heard.push({ t: +g.time.toFixed(1), rec: m.id, name: m.name, kind, line });
    if (this.heard.length > 12) this.heard.shift();
    return true;
  }

  // A bark row (data/crewtalk.js BARKS): the card's style first, else any; turned round so it is not the same line twice.
  bark(m, kind, vars = null, force = false) {
    const B = BARKS[kind]; if (!B) return false;
    const list = B[m.row.ai.style] ?? B.any;
    m.barkN = (m.barkN ?? 0) + 1;
    return this.say(m, this.fill(list[(m.barkN + m.id) % list.length], m, vars), force, kind, null, vars);
  }

  fill(line, m, v = null, other = null) {
    return line.replace(/\{(\w+)\}/g, (_, k) => k === 'name' ? m.name : k === 'other' ? other?.name ?? 'you' : k === 'you' ? 'boss' : v?.[k] ?? (k === 'place' ? 'back there' : k === 'target' ? 'them' : ''));
  }

  // ---- bonds between members (pairwise -100..100) ------------------------------------------------------------------
  bondKey(a, b) { return a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`; }
  bond(a, b) { return this.bonds.get(this.bondKey(a, b)) ?? 0; }
  moveBond(a, b, d) { const k = this.bondKey(a, b), v = clamp((this.bonds.get(k) ?? 0) + d, -100, 100); this.bonds.set(k, v); return v; }
  // Two new to each other: how alike their values are, and whether their flaws rub.
  startBond(a, b) {
    let s = 0;
    for (const [k, v] of Object.entries(a.row.values)) if (b.row.values[k]) s += v * b.row.values[k] * BR.like;
    s = clamp(s, -BR.startClamp, BR.startClamp);
    const fa = a.row.flaw.id, fb = b.row.flaw.id;
    s += FLAW_CLASH[`${fa}|${fb}`] ?? FLAW_CLASH[`${fb}|${fa}`] ?? 0;
    this.bonds.set(this.bondKey(a, b), clamp(s, -100, 100));
  }

  remember(m, kind, verb, d, rec) {
    (m.memory ??= []).push({ kind, verb, sign: d > 0 ? '+' : '-', d: +d.toFixed(1), place: rec?.p || '', target: rec?.on || '', day: this.g.society?.day ?? 0 });
    if (m.memory.length > BR.memory) m.memory.shift();
  }

  // ---- camp talk ------------------------------------------------------------------------------------------------------
  campLive() {
    const g = this.g, p = g.player, cp = this.camp;
    if (!cp || Math.hypot(p.x - cp.x, p.z - cp.z) > 45) return false;
    const v = p.inVehicle; return !v || g.vehiclesSys.speed(v) < 2;
  }

  // One camp exchange: a memory of your deeds, else two members by their bond, else a flaw's small talk. Returns the lines.
  campTalk() {
    const g = this.g, here = this.members.filter((m) => m.c?.alive && !m.down && !m.away);
    if (!here.length) return [];
    const n = this.campN = (this.campN ?? 0) + 1, out = [];
    const say = (m, line, to = null, ctx = null) => { if (this.say(m, line, true, 'camp', to, ctx)) out.push({ rec: m.id, name: m.name, line }); };
    // A deed one of them still turns over (the strongest they remember and have not told).
    let best = null, bm = null;
    for (const m of here) for (const x of m.memory ?? []) if (CAMP_DEED[x.kind]?.[x.sign] && !x.told && (!best || Math.abs(x.d) > Math.abs(best.d))) { best = x; bm = m; }
    if (best && (n % 2 === 1 || here.length < 2)) {
      const L = CAMP_DEED[best.kind][best.sign]; best.told = true;
      say(bm, this.fill(L[n % L.length], bm, best), null, { memory: best });
    } else if (here.length >= 2) {
      // The pair with the strongest feeling either way.
      let pa = null, pb = null, pv = 0;
      for (let i = 0; i < here.length; i++) for (let j = i + 1; j < here.length; j++) { const v = this.bond(here[i], here[j]); if (!pa || Math.abs(v) > Math.abs(pv)) { pa = here[i]; pb = here[j]; pv = v; } }
      const kind = pv <= BR.quarrelBelow ? 'quarrel' : pv < 0 ? 'rivals' : 'friends';
      const L = CAMP_PAIR[kind][n % CAMP_PAIR[kind].length];
      L.forEach((line, i) => { const sp = i % 2 ? pb : pa, other = i % 2 ? pa : pb; say(sp, this.fill(line, sp, null, other), other, { bond: +pv.toFixed(1), kind }); });
      this.moveBond(pa, pb, pv >= 0 ? BR.campNudge : -BR.campNudge);
      g.emit('crewBondTalk', { a: pa.id, b: pb.id, kind, bond: +this.bond(pa, pb).toFixed(1) });
    } else {
      const m = here[n % here.length], L = CAMP_FLAW[m.row.flaw.id] ?? CAMP_FLAW.none;
      say(m, L[n % L.length]);
    }
    if (out.length) g.emit('crewCampTalk', { lines: out });
    return out;
  }

  // ---- interjections: someone speaks up while you talk to a person --------------------------------------------------
  interject() {
    const g = this.g, D = g.dialogue, c = D?.active ? D.npc : null;
    if (c === this.talkingTo) return null;
    this.talkingTo = c;
    if (!c || c.crewRec || c.crewCand || g.time - (this.interAt ?? -1e9) < BR.interjectGap) return null;
    const hurt = c.hp < (c.maxHp ?? 100) * 0.6, trader = !!c.npc?.trades || /trad|smith|store|counter|garage/i.test(c.npc?.title ?? '');
    for (const row of INTERJECT) {
      const when = row.when === 'hurt' ? hurt : row.when === 'trader' ? trader : row.when === 'warden' ? c.faction === 'warden' : c.faction === row.when;
      if (!when) continue;
      for (const m of this.members) {
        if (!m.c?.alive || m.down || (m.row.values[row.verb] ?? 0) < row.need || Math.hypot(m.c.x - c.x, m.c.z - c.z) > 14) continue;
        this.interAt = g.time;
        const line = row.lines[(m.id + Math.floor(g.time)) % row.lines.length];
        this.say(m, line, true, 'interject', c, { when: row.when });
        g.emit('crewInterject', { rec: m.id, to: c.id, when: row.when, line });
        return line;
      }
    }
    return null;
  }

  // Everything a voice or LLM layer needs to write this member's next line.
  context(m) {
    return { name: m.name, card: m.row.name, flag: m.flag, flaw: m.row.flaw.text, signature: m.row.signature.text, style: m.row.ai.style, values: m.row.values,
      trust: +m.trust.toFixed(1), needs: { ...m.needs }, order: m.order, job: m.job, memories: (m.memory ?? []).map((x) => ({ ...x })),
      bonds: this.members.filter((o) => o !== m).map((o) => ({ rec: o.id, name: o.name, card: o.row.name, bond: +this.bond(m, o).toFixed(1) })),
      heard: this.heard.slice(-6) };
  }

  claimBase(x, z, name = null) {
    const g = this.g;
    const b = g.insideBuilding;
    this.base = { x: +x.toFixed(1), z: +z.toFixed(1), name: name ?? (b ? 'the claimed building' : 'the claimed spot'), day: g.society?.day ?? 0 };
    g.emit('crewBase', { ...this.base });
    g.hud.toast(`BASE CLAIMED · ${this.base.name.toUpperCase()}`, 'job');
    return { ok: true, base: this.base };
  }

  // ---- the read the panel and the command use ------------------------------------------------------------------------
  view(m) {
    const c = m.c, J = m.job ? CREW_JOB_BY_ID[m.job] : null;
    return {
      rec: m.id, id: c?.id ?? null, name: m.name, flag: m.flag, card: m.row.name, row: m.rowId, archetype: !!m.row.archetype, how: m.how,
      hp: c ? Math.max(0, Math.round(c.hp)) : Math.round(m.hp), maxHp: m.row.hp, alive: !!c?.alive || m.down || !!m.away, down: m.down, bleed: m.down ? +m.bleed.toFixed(1) : 0, away: m.away ? { job: m.away.job, back: +m.away.until.toFixed(1) } : null,
      needs: { food: +m.needs.food.toFixed(2), water: +m.needs.water.toFixed(2), rest: +m.needs.rest.toFixed(2) },
      gun: c?.weapon ?? null, mag: c?.mag ?? 0, rounds: m.rounds, trust: +m.trust.toFixed(1), flaw: m.row.flaw.text, signature: m.row.signature.text,
      order: m.order, fire: m.fire ?? 'free', job: J ? { id: J.id, name: J.name, where: J.where, live: this.jobLive(m, J), progress: +m.jobP.toFixed(2) } : null,
      skills: m.row.skills, saves: m.saves, kills: m.kills, pay: m.pay, x: c ? +c.x.toFixed(1) : null, z: c ? +c.z.toFixed(1) : null,
      inVehicle: c?.inVehicle?.id ?? null,
    };
  }

  // ---- save / load (per player: the save file and the shard snapshot) -------------------------------------------------
  // portable: for the shard snapshot (another page's character ids mean nothing here): no body ids, the bodies are made
  // again round you at load.
  save({ portable = false } = {}) {
    const plain = (m) => ({ id: m.id, cid: portable ? null : m.cid, row: m.rowId, name: m.name, flag: m.flag, how: m.how, trust: m.trust, day: m.day, needs: { ...m.needs }, order: m.order, fire: m.fire ?? 'free', job: m.job, jobP: m.jobP,
      memory: (m.memory ?? []).map((x) => ({ ...x })), away: m.away ? { ...m.away } : null, down: m.down, bleed: m.bleed, saves: m.saves, kills: m.kills, pay: m.pay, hp: m.c ? m.c.hp : m.hp, rounds: m.rounds, holdAt: m.holdAt, colors: m.colors });
    return {
      v: 1, members: this.members.map(plain), formation: this.formation, camp: this.camp, base: this.base, nextRec: this.nextRec,
      cands: [...this.cands.values()].map((s) => ({ key: s.key, row: s.row, how: s.how, where: s.where, line: s.line, state: s.state, cid: portable ? null : s.c?.id ?? null, name: s.name, flag: s.flag })),
      graves: this.graves.map((x) => ({ ...x })), memorial: this.memorial.map((x) => ({ ...x })), pins: this.pins.map((x) => ({ ...x })),
      bonds: [...this.bonds],
    };
  }

  load(s) {
    const g = this.g;
    if (!s || s.v !== 1) return;
    if (this.drag) this.stopDrag();
    // Bodies of the old crew who are not in the save: back to plain people.
    for (const m of this.members) if (m.c && !s.members.some((x) => x.cid === m.c.id)) { m.c.crewRec = null; m.c.follower = false; }
    this.members = [];
    for (const x of s.members) {
      const row = CREW_BY_ID[x.row];
      if (!row) continue;
      const m = { ...x, row, rowId: x.row, c: null, holdAt: x.holdAt ?? null, lootAt: null, sayAt: 0, fallbackAsked: 0 };
      this.members.push(m);
      if (m.away) continue;
      const c = (x.cid ? g.chars.find((o) => o.id === x.cid && o.alive !== undefined) : null) ?? this.respawn(m, g.player.x + 2 + this.members.length, g.player.z + 2);
      if (!c) continue;
      this.attach(m, c);
      if (x.hp !== undefined) c.hp = x.hp;
      if (m.down) { c.alive = false; c.hp = 0; c.downedT = 0; }
      if (m.fire === 'hold') g.tactics.unit(c).holdFire = true;
    }
    this.formation = s.formation ?? 'wedge'; this.camp = s.camp ?? null; this.base = s.base ?? null; this.nextRec = Math.max(this.nextRec, s.nextRec ?? 1);
    this.bonds = new Map(s.bonds ?? []);
    this.graves = (s.graves ?? []).map((x) => ({ ...x })); this.memorial
 = (s.memorial ?? []).map((x) => ({ ...x })); this.pins = (s.pins ?? []).map((x) => ({ ...x }));
    // Candidates: their people again (the restore brought the bodies back without a talk tree).
    // Candidate bodies the save does not know by id (a shard login: this page's own seeds) go; the save's stand again.
    const keepIds = new Set((s.cands ?? []).map((x) => x.cid).filter(Boolean));
    for (const c of [...g.chars]) if (c.crewCand && !keepIds.has(c.id) && !c.crewRec) g.removeChar(c);
    for (const c of g.chars) if (c.crewCand) c.crewCand = null;
    this.cands.clear();

    for (const x of s.cands ?? []) {
      const cand = { ...x, c: null };
      this.cands.set(x.key, cand);
      if (cand.state !== 'waiting') continue;
      const c = x.cid ? g.chars.find((o) => o.id === x.cid) : null;
      if (c && c.alive) {
        const row = CREW_BY_ID[x.row], h = hash(x.key);
        c.npc = this.candidateTalk(cand, row, x.name ?? c.name, x.flag ?? c.flag, h); c.crewCand = x.key; cand.c = c;
        if (x.how === 'rescue') { c.hold = true; c.captive = true; }
      }
    }
    this.seeded = true;
    this.seq = g.society?.chronicle?.seq ?? 0; this.hourMark = null;
    this.promoteNear(); // waiting candidates with no body here (a shard login, an old save) stand again where they wait

    g.emit('crewLoaded', { members: this.members.length });
  }
}
