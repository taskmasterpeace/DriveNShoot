// CASINOS as COMMANDS rows and the selftest share (docs/design/WEB_CASINOS.md; systems/casinos.js, systems/cards.js,
// systems/chess.js, ui/tablepanel.js; rows in data/casinos.js).
import { STAKES, BLACKJACK, CHESS_PLAYERS, CHESS_AT, EYE, DEALER_EYE, SAFE, SEC_DRONE, WITNESS, validateCasinos } from '../data/casinos.js';
import { ITEMS } from '../data/items.js';
import { Shoe, Blackjack, total, SUITS, RANKS } from '../systems/cards.js';
import * as Chess from '../systems/chess.js';
import { freeSpot } from './citygen-api.js';

const r1 = (v) => Math.round(v * 10) / 10;
// The house edge, about, against basic strategy: a six-deck S17 3:2 double-any game is 0.44%, moved by the rules
// (standard published adjustments: decks, hitting soft 17, a 6:5 natural, doubling only 9-11, re-splits).
export function edgeOf(rule) {
  const deck = { 1: -0.48, 2: -0.19, 4: -0.06, 6: 0, 8: 0.02 }[rule.decks] ?? 0;
  const e = 0.44 + deck + (rule.dealerHitsSoft17 ? 0.22 : 0) + (rule.bjPays < 1.5 ? (1.5 - rule.bjPays) * 4.6 : 0) + (rule.doubleAny ? 0 : 0.09) - (rule.splitMax > 1 ? 0.03 : 0);
  return Math.round(e * 100) / 100;
}

export function casinoCommands(api, need) {
  const g = api.g;
  const V = (id) => { const C = g.casinos; const v = id ? C.venues.get(id) : [...C.venues.values()].filter((x) => x.live).sort((a, b) => Math.hypot(a.x - g.player.x, a.z - g.player.z) - Math.hypot(b.x - g.player.x, b.z - g.player.z))[0]; need(v, id ? `no room ${id}` : 'no gaming room near you (go to a town; citygen action=stamp archetype=boom_strip builds a casino strip)'); return v; };
  return {
    casino: {
      group: 'world', desc: `Gaming rooms (docs/design/WEB_CASINOS.md; rows data/casinos.js STAKES: ${Object.keys(STAKES).join(', ')}). action=list: every room in the towns built near you (stakes, min/max, the house's cash, the safe, guards, cameras, drones, alarm, whether you are barred), the rich homes and every security drone, your seat and the counts. action=info venue=: one room in full (the robbery, the float being carried). action=sit venue= table= [goto=true: staging, put you at the seat]: sit down (the entry rules: barred, wanted, standing, cash shown, dress or the door fee); opens the table panel. action=play bet=<$>: deal a blackjack hand; move=hit|stand|double|split|palm, or a chess move e2e4 | resign. action=leave: stand up. action=odds venue= table=: the table's rules, the house edge (about), the shoe left, the stakes. action=plan venue=: the ways in (front door, back door, storm drain) and what is inside. action=rob venue= target=cage|safe how=pick|pry|blow: the cage needs your gun up at the cashier; the safe holds E for its time (the world runs while you work). The guards learn of it only by sight, sound, a watched camera, a drone, or a witness who runs to them; the board learns of it only when a witness walks in.`,
      args: { action: { type: 'string', default: 'list', enum: ['list', 'info', 'sit', 'play', 'leave', 'odds', 'plan', 'rob'] }, venue: { type: 'string' }, table: { type: 'number', default: 0 }, goto: { type: 'boolean' }, bet: { type: 'number' }, move: { type: 'string' }, target: { type: 'string', enum: ['cage', 'safe'] }, how: { type: 'string', enum: Object.keys(SAFE) } },
      run: async (a) => {
        const C = g.casinos, act = a.action ?? 'list';
        if (act === 'list') return C.view();
        if (act === 'info') return C.vView(V(a.venue), true);
        if (act === 'leave') { const r = C.leave('agent'); need(r.ok, r.why); return r; }
        if (act === 'plan') return C.plan(V(a.venue));
        if (act === 'odds') {
          const v = V(a.venue), t = v.tables[a.table ?? 0]; need(t, `no table ${a.table}`);
          if (t.game === 'chess') { const P = CHESS_PLAYERS[t.opp]; return { venue: v.id, table: t.i, game: 'chess', opponent: P.name, depth: P.depth, blunder: P.blunder, stake: P.stake, purse: t.purse }; }
          const R = BLACKJACK[v.kind];
          return { venue: v.id, table: t.i, game: 'blackjack', rules: R, edgePct: edgeOf(R), min: v.row.min, max: v.row.max, shoe: { decks: R.decks, cards: t.shoe.size, left: t.shoe.left(), cut: Math.floor(t.shoe.size * R.pen) }, house: C.house(v), entry: v.row.entry, eye: v.susp > 0.5 ? 'the pit boss is watching you' : 'nobody is watching you' };
        }
        if (act === 'sit') {
          const v = V(a.venue), t = v.tables[a.table ?? 0]; need(t, `no table ${a.table}`);
          if (a.goto) { if (g.player.inVehicle) g.exitVehicle(true); g.player.x = t.seat.x; g.player.z = t.seat.z; g.standOn?.(g.player); }
          const r = C.sit(v, t); need(r.ok, r.why); return r;
        }
        if (act === 'play') {
          need(C.seat, 'sit down first (action=sit)');
          let r;
          if (a.bet !== undefined) r = C.bet(a.bet);
          else if (C.seat.game === 'blackjack') r = C.act(a.move);
          else r = a.move === 'resign' ? C.resign() : C.move(a.move);
          g.tablePanel?.render();
          need(r.ok, r.why); return { ...r, cash: g.cash, house: C.house(C.seat?.v ?? V(a.venue)) };
        }
        if (act === 'rob') {
          const v = V(a.venue);
          if ((a.target ?? 'cage') === 'cage') {
            if (g.player.weapon && g.arms) g.arms.stance = 'raised'; // you put the gun up
            const r = C.robCage(v); need(r.ok, r.why); return r;
          }
          const how = a.how ?? C.safeTools()[0]; need(how, 'you carry nothing that opens a safe (lockpicks, a crowbar, a breach charge)');
          for (let k = 0; k < 400; k++) {
            const r = C.workSafe(v, how, 0.25); need(r.ok, r.why);
            if (r.working === undefined) return r;
            await api.call('step', { seconds: 0.25 });
          }
          need(false, 'the safe did not open');
        }
        return C.view();
      },
    },
  };
}

// ---- the selftest share ---------------------------------------------------------------------------------------------
// A casino strip stamped on free ground (citygen.stampAt: the real towns' path); its high-roller room and its floor are
// the rooms under test. Positions are staged (teleports, a rigged shoe order, a guard moved off his post); everything
// else is the real path: the table's bet, the house's cage, the alarm, the runners' feet, the board.
export async function casinoChecks(api, check, C) {
  const g = api.g, P = g.player, CS = g.casinos;
  const sv = (await C('save')).save;
  const was = { cash: g.cash, wanted: g.wanted, z: g.zombies.enabled, r: g.raiderTimer, convoy: g.convoy.next, stories: g.stories.enabled, enabled: CS.enabled };
  g.zombies.enabled = false; g.raiderTimer = 1e9; g.convoy.despawn?.(); g.convoy.next = 1e9; g.stories.enabled = true; CS.enabled = true;
  const ID = 'cg-casinos';
  let town = null, hi = null, fl = null;
  const stand = async (x, z) => { if (P.inVehicle) g.exitVehicle(true); if (Math.hypot(P.x - x, P.z - z) > 100) await C('teleport', { x, z }); P.x = x; P.z = z; g.standOn?.(P); P.vx = 0; P.vz = 0; g.camLook.x = x; g.camLook.z = z; await C('step', { seconds: 0.3 }); };
  const leave = () => { if (CS.seat) CS.leave('test'); };
  const rig = (shoe, cards) => { shoe.shuffle(); const rest = shoe.cards.slice(); for (const c of cards) { const i = rest.indexOf(c); rest.splice(i, 1); } shoe.cards.length = 0; shoe.cards.push(...cards, ...rest); shoe.i = 0; shoe.running = 0; };
  const setup = async () => {
    if (town && g.citygen.live.has(ID)) return true;
    const spot = freeSpot(g, 6000, -9000, 260); if (!spot) return false;
    for (const seed of [44, 7, 301, 12]) {
      town = g.citygen.stampAt({ id: ID, arch: 'boom_strip', seed, x: spot.x, z: spot.z });
      await stand(spot.x + 30, spot.z + 30); CS.scanT = 0; await C('step', { seconds: 1.2 });
      const vs = [...CS.venues.values()].filter((v) => v.town === ID);
      hi = vs.find((v) => v.kind === 'highroller'); fl = vs.find((v) => v.kind === 'floor');
      if (hi && fl) break;
      g.citygen.remove(ID);
    }
    return !!(hi && fl);
  };
  const atRoom = async (v) => { await stand(v.x, v.z); CS.scanT = 0; await C('step', { seconds: 1.2 }); return v.live; };
  try {
    await check('casinos: the rows validate - the stakes ladder, blackjack rules, chess players, the eye, the safe\'s tools as real items, the drones, no purple felt; a broken row set trips named errors', async () => {
      const e = validateCasinos(undefined, ITEMS);
      const bad = validateCasinos({ STAKES: { x: { ...STAKES.floor, where: 'moon', felt: '#7a3ac8', cage: [10, 20] } }, BLACKJACK: { x: { ...BLACKJACK.floor, decks: 0 } }, CHESS_PLAYERS: { y: { ...CHESS_PLAYERS.shark, depth: 9 } }, CHESS_AT: { x: ['nobody'] }, SAFE: { pick: { ...SAFE.pick, needs: 'moonbeam' } }, SEC_DRONE: { ...SEC_DRONE, eye: '#a040d0' }, WITNESS, EYE, DEALER_EYE }, ITEMS);
      return e.length === 0 && bad.length >= 7 ? true : JSON.stringify({ e, bad });
    });

    await check('casinos: a casino strip has its rooms - the tallest hotel is a high-roller room, another hotel a gaming floor, every saloon a back room; tables on open floor, guards on their posts, the cage and the safe rolled once from the building, drones over the house and over its owner\'s home', async () => {
      if (!(await setup())) return 'no casino strip with a high-roller room and a floor';
      const live = await atRoom(hi);
      const v2 = CS.make({ rec: g.citygen.byId.get(ID) }, hi.B, 'highroller'); // the same building rolls the same money
      CS.venues.set(hi.id, hi);
      const same = v2.cage === hi.cage && v2.safe.cash === hi.safe.cash; CS.dropDrones(v2);
      // every table on open floor: no collision box of the building's own under a table, a seat or a dealer
      const tablesFree = hi.tables.every((t) => [t, t.seat, t.dealerAt].every((q) => g.statics.lineOfSight(q.x - 0.3, q.z, q.x + 0.3, q.z)));
      const guards = CS.guardsOf(hi).length, drones = CS.drones.filter((d) => d.owner === hi).length, home = [...CS.homes.values()].some((h) => h.town === ID);
      const ok = live && same && guards === STAKES.highroller.guards.post.length + STAKES.highroller.guards.patrol && drones === STAKES.highroller.drones && home && hi.cage >= STAKES.highroller.cage[0] && hi.tables.length >= 4 && hi.tables.some((x) => x.game === 'chess') && tablesFree;
      return ok ? true : JSON.stringify({ live, same, guards, drones, home, cage: hi.cage, tables: hi.tables.length, tablesFree });
    });

    await check('casinos: blackjack deals from a real 52 x N shoe and pays 3:2 on a natural - the shoe holds 4 x decks of every rank in every suit, every card dealt over 300 hands is one of the shoe\'s, and a natural on a $100 bet puts back $250 (the cage down $150, your pocket up $150)', async () => {
      if (!(await setup())) return 'no strip';
      await atRoom(hi);
      const t = hi.tables.find((x) => x.game === 'blackjack'), sh = t.shoe, rule = BLACKJACK.highroller;
      const census = sh.census(), full = sh.cards.length === 52 * rule.decks && RANKS.every((r) => census[r] === 4 * rule.decks) && SUITS.every((s) => sh.cards.filter((c) => c.endsWith(s)).length === 13 * rule.decks);
      // 300 hands straight off the engine on a copy of the shoe: every card dealt is in a fresh deck set, the shoe reshuffles at its cut card
      const test = new Shoe(rule.decks, rule.pen, () => 0.37 * Math.random()), deck = new Set(test.cards); let foreign = 0, shuffles0 = test.shuffles;
      for (let i = 0; i < 300; i++) { const B = new Blackjack(rule, test); let r = B.deal(10); for (const h of B.hands) for (const c of h.cards) if (!deck.has(c)) foreign++; while (!r.done) r = total(B.hand().cards).t < 17 ? B.hit() : B.stand(); }
      const reshuffled = test.shuffles > shuffles0;
      // a natural through the real table: player A K, dealer 9 7
      g.cash = Math.max(g.cash, 2000); hi.paid = Math.floor(CS.hours() / 24); hi.susp = 0;
      await stand(t.seat.x, t.seat.z);
      const s = CS.sit(hi, t); if (!s.ok) return `sit: ${s.why}`;
      rig(sh, ['AS', '9H', 'KD', '7C']);
      const cash0 = g.cash, house0 = CS.house(hi);
      const r = CS.bet(100);
      const ok = full && foreign === 0 && reshuffled && r.ok && r.hand.hands[0].result === 'blackjack' && g.cash - cash0 === 150 && house0 - CS.house(hi) === 150;
      leave();
      return ok ? true : JSON.stringify({ full, foreign, reshuffled, r: r.ok ? r.hand?.hands?.[0] : r.why, dCash: g.cash - cash0, dHouse: house0 - CS.house(hi) });
    });

    await check('casinos: the dealer stands on 17 per the row - in the high-roller room (S17) the dealer stands on a soft 17 (A 6) and on a hard 17; in a back room (H17) the same A 6 draws', async () => {
      if (!(await setup())) return 'no strip';
      await atRoom(hi);
      const t = hi.tables.find((x) => x.game === 'blackjack');
      await stand(t.seat.x, t.seat.z); hi.susp = 0;
      const s = CS.sit(hi, t); if (!s.ok) return `sit: ${s.why}`;
      rig(t.shoe, ['10S', 'AH', '8D', '6C', '5S']); // you 18, the dealer A 6 = soft 17, a 5 waiting
      const a = CS.bet(50); const b = a.ok ? CS.act('stand') : a;
      const dS17 = b.hand?.dealer; leave();
      // the back-room row on the engine: the same cards, the dealer hits soft 17
      const sh = new Shoe(BLACKJACK.backroom.decks, BLACKJACK.backroom.pen); rig(sh, ['10S', 'AH', '8D', '6C', '5S']);
      const B = new Blackjack(BLACKJACK.backroom, sh); B.deal(5); const r2 = B.stand();
      // a hard 17 stands everywhere
      const sh3 = new Shoe(6, 0.75); rig(sh3, ['10S', '10H', '8D', '7C', '4S']); const B3 = new Blackjack(BLACKJACK.backroom, sh3); B3.deal(5); B3.stand();
      const ok = b.ok && dS17?.length === 2 && total(dS17).t === 17 && r2.done && B.dealer.length >= 3 && B.dealer[2] === '5S' && B3.dealer.length === 2;
      return ok ? true : JSON.stringify({ floor: dS17, back: B.dealer, hard: B3.dealer, why: b.why });
    });

    await check('casinos: the chess NPC never makes an illegal move and loses to a mate-in-one when its skill is low - three games of random legal play against each row with every reply legal; at the table the drunk takes the bait and is mated, the shark sees it and does not', async () => {
      let illegal = 0, replies = 0;
      for (const id of Object.keys(CHESS_PLAYERS)) {
        const R = CHESS_PLAYERS[id];
        for (let gm = 0; gm < (id === 'shark' ? 1 : 3); gm++) {
          let S = Chess.start();
          for (let ply = 0; ply < 40 && ['play', 'check'].includes(Chess.status(S)); ply++) {
            if (S.turn === 'w') { const L = Chess.legal(S); S = Chess.play(S, L[Math.floor(Math.random() * L.length)]); continue; }
            const m = Chess.think(S, { ...R, depth: Math.min(R.depth, 2) }); replies++;
            if (!Chess.isLegal(S, m)) illegal++;
            S = Chess.play(S, m);
          }
        }
      }
      if (!(await setup())) return 'no strip';
      await atRoom(hi);
      const t = hi.tables.find((x) => x.game === 'chess'); if (!t) return 'no chess table';
      const play = async (opp) => {
        t.opp = opp; t.purse = Math.max(t.purse, 400); g.cash = Math.max(g.cash, 2000);
        await stand(t.seat.x, t.seat.z);
        const s = CS.sit(hi, t); if (!s.ok) return { why: s.why };
        t.chess.S = Chess.fromFEN('6k1/5ppp/2n5/8/1P6/8/5PPP/R5K1 w - -'); // staged: a back rank with a knight eyeing a free pawn
        const a = CS.move('g1h1'), reply = a.reply, b = CS.move('a1a8');
        const out = { reply, over: t.chess.over, illegal: t.chess.illegal ?? 0, b: b.ok ? b.status : b.why };
        leave(); return out;
      };
      const low = await play('drunk'), high = await play('shark');
      const ok = illegal === 0 && replies > 40 && low.reply === 'c6b4' && low.over === 'you won' && low.illegal === 0 && high.reply !== 'c6b4' && high.over !== 'you won';
      return ok ? true : JSON.stringify({ illegal, replies, low, high });
    });

    await check('casinos: the house pool changes by exactly the bets - 40 hands of $25 to $200 (hits, stands, doubles, splits): the cage moves by (bets in - paid back) to the dollar and your pocket by the opposite', async () => {
      if (!(await setup())) return 'no strip';
      await atRoom(hi);
      const t = hi.tables.find((x) => x.game === 'blackjack');
      g.cash = Math.max(g.cash, 20000); hi.susp = 0; hi.avgBet = 0;
      await stand(t.seat.x, t.seat.z);
      const s = CS.sit(hi, t); if (!s.ok) return `sit: ${s.why}`;
      const cash0 = g.cash, house0 = CS.house(hi), in0 = hi.stats.betIn, out0 = hi.stats.paidOut;
      let staked = 0, paid = 0, splits = 0, doubles = 0;
      for (let i = 0; i < 40; i++) {
        hi.susp = 0;
        const r = CS.bet(50 + (i % 4) * 50); if (!r.ok) return `bet ${i}: ${r.why}`;
        let guard = 0;
        while (t.bj.phase === 'play' && guard++ < 12) {
          const B = t.bj, h = B.hand(), tt = total(h.cards).t;
          if (B.canSplit() && i % 3 === 0) { CS.act('split'); splits++; } else if (B.canDouble() && (tt === 10 || tt === 11)) { CS.act('double'); doubles++; } else CS.act(tt < 16 ? 'hit' : 'stand');
        }
        staked += t.last.staked; paid += t.last.paid;
      }
      leave();
      const dHouse = CS.house(hi) - house0, dCash = g.cash - cash0;
      const ok = dHouse === staked - paid && dCash === -dHouse && hi.stats.betIn - in0 === staked && hi.stats.paidOut - out0 === paid;
      return ok ? true : JSON.stringify({ dHouse, dCash, staked, paid, splits, doubles });
    });

    await check('casinos: counting cards gets you shown the door - betting the max on hot shoes after a run of minimum bets: the dealer\'s eye adds up, you are barred, and the room refuses you a seat', async () => {
      if (!(await setup())) return 'no strip';
      await atRoom(hi);
      const t = hi.tables.find((x) => x.game === 'blackjack');
      g.cash = Math.max(g.cash, 20000); hi.susp = 0; hi.avgBet = 0; hi.recent = []; delete CS.barred[hi.id];
      await stand(t.seat.x, t.seat.z);
      if (!CS.sit(hi, t).ok) return 'sit';
      let hands = 0;
      for (let i = 0; i < 30 && CS.seat; i++) {
        const hot = i % 2 === 1;
        t.shoe.running = hot ? 30 : -4; // staged: the shoe runs hot every other hand
        const r = CS.bet(hot ? STAKES.highroller.max : STAKES.highroller.min); if (!r.ok) break; hands++;
        while (t.bj?.phase === 'play' && CS.seat) CS.act('stand');
      }
      const barred = (CS.barred[hi.id] ?? -1) > CS.hours(), refused = !CS.entry(hi).ok;
      delete CS.barred[hi.id]; hi.susp = 0; leave();
      return barred && refused && hands >= 3 ? true : JSON.stringify({ barred, refused, hands, susp: hi.susp });
    });

    // ---- the robbery ----
    const restoreRoom = async (v) => { v.alarm = 'calm'; v.lastSeen = null; for (const c of CS.guardsOf(v)) { c.grudge = null; c.target = null; c.state = 'idle'; } g.wanted = 0; };
    let robA = null;
    await check('casinos: a robbery alerts guards only when someone sees or hears it - the cage robbed with every guard out of sight and earshot (cameras dark): nobody comes; the cashier who saw it runs to a guard, and only then is the house on you, at the spot the cashier saw', async () => {
      if (!(await setup())) return 'no strip';
      await atRoom(fl); await restoreRoom(fl);
      if (!fl.cage) fl.cage = 500;
      // staged: every guard walked out of the building's sight, 60 m off behind its walls; the cameras' office watcher away from his post
      const L = CS.layout(fl), far = L.at(-60, 0);
      for (const [i, c] of CS.guardsOf(fl).entries()) { c.x = far.x + i * 1.5; c.z = far.z; c.post = { x: c.x, z: c.z, face: 0 }; c.loop = null; }
      for (const t of fl.tables) if (t.dealer.c) { t.dealer.c.x = far.x + 20; t.dealer.c.z = far.z + 20; t.dealer.c.post = { x: t.dealer.c.x, z: t.dealer.c.z, face: 0 }; }
      await stand(fl.cagePos.x + L.inX * 1.2, fl.cagePos.z + L.inZ * 1.2);
      g.switchWeapon?.('pistol'); if (!P.weapon) P.weapon = 'pistol';
      const cash0 = g.cash, cage0 = fl.cage;
      const r = await C('casino', { action: 'rob', venue: fl.id, target: 'cage' });
      const calmAt = fl.alarm === 'calm', took = g.cash - cash0 === cage0 && fl.cage === 0, runner = CS.runners.find((x) => x.v === fl);
      const toGuard = runner?.stops[0]?.guard ?? null;
      const sawAt = runner ? { ...runner.sawAt } : null;
      // the player walks away; the runner runs
      await stand(fl.x + 70, fl.z + 70);
      let t = 0; while (fl.alarm === 'calm' && t < 60) { await C('step', { seconds: 1 }); t++; }
      robA = { fl, R: fl.robbery, runner };
      const ok = r.guards.length === 0 && !r.camera && calmAt && took && runner && toGuard && fl.alarm === 'alert' && fl.lastSeen && Math.hypot(fl.lastSeen.x - sawAt.x, fl.lastSeen.z - sawAt.z) < 0.5 && Math.hypot(fl.lastSeen.x - P.x, fl.lastSeen.z - P.z) > 30;
      return ok ? true : JSON.stringify({ guards: r.guards, camera: r.camera, calmAt, took, runner: !!runner, toGuard: !!toGuard, alarm: fl.alarm, t, lastSeen: fl.lastSeen, sawAt });
    });

    await check('casinos: the bounty board gets the robbery only after a witness reaches it - nothing on the town board while the witness is on the road; when they walk in, a bounty on you for the robbery, paid out of the house\'s money', async () => {
      if (!robA?.runner) return 'no runner from the robbery check';
      const R = robA.R, run = robA.runner, SS = g.stories, place = run.stops.at(-1).board, board = SS.boardOf(place);
      const before = R.posted === null && !SS.bounties.some((b) => b.deed.seq === R.seq);
      const house0 = robA.fl.cage + robA.fl.safe.cash;
      let t = 0; while (!R.posted && run.c.alive && t < 120) { await C('step', { seconds: 1 }); t++; }
      const b = R.posted ? SS.bounty(R.posted.bounty) : null;
      const onBoard = b && SS.k.holds(board, b.fact);
      const arrived = Math.hypot(run.c.x - place.x, run.c.z - place.z) < WITNESS.arrive + 2;
      const paidByHouse = b && house0 - (robA.fl.cage + robA.fl.safe.cash) === b.pay;
      const ok = before && b && b.target.kind === 'player' && onBoard && arrived && paidByHouse && b.deed.seq === R.seq;
      return ok ? true : JSON.stringify({ before, posted: R.posted, fail: R.postFail, onBoard, arrived, paidByHouse, t, seq: R.seq });
    });

    await check('casinos: a guard who sees it or hears it raises the alarm at once - the cage robbed in front of the cage guard; the office safe blown with the office guard out of sight but inside the blast\'s earshot', async () => {
      if (!(await setup())) return 'no strip';
      await atRoom(hi); await restoreRoom(hi);
      if (!hi.cage) hi.cage = 2000;
      const L = CS.layout(hi);
      await stand(hi.cagePos.x + L.inX * 1.2, hi.cagePos.z + L.inZ * 1.2);
      if (!P.weapon) P.weapon = 'pistol';
      const cageGuard = hi.guards.find((q) => q.role === 'cage')?.c;
      if (cageGuard) { cageGuard.x = hi.cagePos.x + L.inX * 3.5; cageGuard.z = hi.cagePos.z + L.inZ * 3.5; }
      if (g.arms) g.arms.stance = 'raised';
      const r1_ = CS.robCage(hi);
      const seen = r1_.ok && r1_.guards.includes(cageGuard?.id) && hi.alarm === 'alert';
      // the safe: every guard but one walked out; the office guard behind the partition (no line of sight), 12 m off
      await restoreRoom(hi);
      for (const c of CS.guardsOf(hi)) { c.x = hi.x + 200; c.z = hi.z + 200; c.post = { x: c.x, z: c.z, face: 0 }; c.loop = null; }
      for (const t of hi.tables) if (t.dealer.c) { t.dealer.c.x = hi.x + 220; t.dealer.c.z = hi.z + 220; t.dealer.c.post = { x: t.dealer.c.x, z: t.dealer.c.z, face: 0 }; }
      for (const s of hi.staff) if (s.c) { s.c.x = hi.x + 230; s.c.z = hi.z + 230; s.c.post = { x: s.c.x, z: s.c.z, face: 0 }; }
      const og = CS.guardsOf(hi)[0];
      const behind = L.at(-6, L.width / 2 - 1.2); og.x = behind.x; og.z = behind.z; og.post = { x: og.x, z: og.z, face: 0 };
      await stand(hi.safePos.x + L.inX * 1.0, hi.safePos.z + L.inZ * 1.0);
      g.inventory.stow('breach_charge', 1); hi.safe.state = 'locked'; hi.safe.work = 0; if (!hi.safe.cash) hi.safe.cash = 5000; hi.cage = Math.max(hi.cage, 5000); hi.carrying = null; // a full cage: no guard comes for the float mid-test
      const los = g.los(og.x, og.z, P.x, P.z);
      const cash0 = g.cash, safe0 = hi.safe.cash;
      const r2 = await C('casino', { action: 'rob', venue: hi.id, target: 'safe', how: 'blow' });
      const heard = r2.guards.includes(og.id) && hi.alarm === 'alert' && g.cash - cash0 === safe0 && hi.safe.state === 'blown';
      await restoreRoom(hi);
      return seen && heard && !los ? true : JSON.stringify({ seen, heard, los, g1: r1_.guards, g2: r2.guards, og: og.id, alarm: hi.alarm });
    });

    await check('casinos: a security drone spots by line of sight only - out in the open with a gun up it marks you and calls the guards to where it saw you; behind the building\'s wall, under its roof, or jammed, it does not', async () => {
      if (!(await setup())) return 'no strip';
      await atRoom(hi); await restoreRoom(hi);
      const d = CS.drones.find((x) => x.owner === hi); if (!d) return 'no drone';
      g.sky.time = 13; if (!P.weapon) P.weapon = 'pistol'; if (g.arms) g.arms.stance = 'raised';
      const L = CS.layout(hi), out = L.at(L.depth + 6, 0), back = L.at(-3, 0);
      // open ground in front of the door, the drone 12 m off over the street side
      const hold = (x, z) => { d.x = x; d.z = z; d.state = 'patrol'; d.seen = null; d.hp = SEC_DRONE.hp; d.jamT = 0; };
      await stand(out.x, out.z); hold(out.x + L.ax * 10, out.z + L.az * 10); // along the front, over the street side
      if (g.arms) g.arms.stance = 'raised'; // the gun up now (a staged step lets the arm drop)
      const open = CS.droneSees(d, P); CS.updateDrones(0.05);
      const called = d.state === 'track' && hi.alarm === 'alert' && Math.hypot(hi.lastSeen.x - P.x, hi.lastSeen.z - P.z) < 0.5 && P.marked > g.time;
      await restoreRoom(hi);
      // behind the building: the drone in front, you at the back wall, the building between
      await stand(back.x, back.z); hold(L.at(L.depth + 2, 0).x, L.at(L.depth + 2, 0).z);
      const dist = Math.hypot(d.x - P.x, d.z - P.z), wall = !CS.droneSees(d, P) && dist < SEC_DRONE.sight[0];
      // inside the building, under its roof, the drone right over you
      await stand(hi.x, hi.z); hold(hi.x + 2, hi.z);
      const roof = !CS.droneSees(d, P);
      // jammed: open ground again, a jammer in your pack
      await stand(out.x, out.z); hold(out.x + L.ax * 8, out.z + L.az * 8);
      g.inventory.stow('jammer', 1); CS.updateDrones(0.05); const jammed = d.state === 'jammed' && hi.alarm === 'calm';
      g.inventory.spend('jammer', 1); d.state = 'patrol'; await restoreRoom(hi); if (g.arms) g.arms.stance = 'lowered';
      return open && called && wall && roof && jammed ? true : JSON.stringify({ open, called, wall, dist: r1(dist), roof, jammed, state: d.state });
    });

    await check('casinos: a security drone can be shot down - rounds from your gun at it take its hp and it falls; the house\'s count of drones down goes up', async () => {
      if (!(await setup())) return 'no strip';
      const d = CS.drones.find((x) => x.owner === hi && x.state !== 'gone'); if (!d) return 'no drone';
      const L = CS.layout(hi), out = L.at(L.depth + 12, 0);
      await stand(out.x, out.z); d.x = out.x + 6; d.z = out.z; d.state = 'patrol'; d.hp = SEC_DRONE.hp; d.live = true;
      const down0 = CS.counts.dronesDown;
      for (let i = 0; i < 12 && d.state !== 'falling' && d.state !== 'gone'; i++) { d.x = out.x + 6; d.z = out.z; g.combat.hitscan(P, P.x, P.z, 1, 0, 30, 10, 'ammo_pistol', 0, null); await C('step', { seconds: 0.1 }); }
      await restoreRoom(hi);
      return (d.state === 'falling' || d.state === 'gone') && CS.counts.dronesDown === down0 + 1 ? true : JSON.stringify({ state: d.state, hp: d.hp });
    });

    await check('casinos: draw calls stay under budget with a casino strip live (rooms, tables and drones are two instanced meshes)', async () => {
      if (!(await setup())) return 'no strip';
      await atRoom(hi); g.render(0); const p = await C('perf');
      return p.drawCalls < 150 ? true : `drawCalls=${p.drawCalls}`;
    });
  } finally {
    leave();
    if (g.citygen.byId.has(ID)) g.citygen.remove(ID);
    for (const v of [...CS.venues.values()]) if (v.town === ID) { CS.demote(v); CS.venues.delete(v.id); CS.dropDrones(v); }
    for (const h of [...CS.homes.values()]) if (h.town === ID) { CS.homes.delete(h.id); CS.dropDrones(h); }
    CS.runners.length = 0;
    await C('load', { save: sv });
    g.cash = was.cash; g.wanted = was.wanted; g.zombies.enabled = was.z; g.raiderTimer = was.r; g.convoy.next = was.convoy; g.stories.enabled = was.stories; CS.enabled = was.enabled;
  }
}
