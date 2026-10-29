// CASINOS as ROWS (docs/design/WEB_CASINOS.md; systems/casinos.js, systems/cards.js, systems/chess.js, ui/tablepanel.js).
// The stakes ladder, the games' rules, the opponents, the house's people and locks, the security drones. Change a number
// here, not the code. validateCasinos(rows) names every broken row (the World Forge and the selftest call it).
//
// THE LAWS these rows serve (WEB_DEPTH_PLAN.md §0):
//   - the house's money is real and finite: a venue's cage and safe are rolled ONCE from its building's id; after that
//     they move only by bets won and lost, a robbery, or cash a guard actually carries between the safe and the cage.
//   - nobody knows what they weren't told: a guard reacts to a robbery only when he, a camera that is watched, a drone,
//     or a witness who runs to him saw or heard it; the bounty board learns of it only when a witness walks in.

// ---- the stakes ladder --------------------------------------------------------------------------------------------------
// where     which building of a live town becomes the room (the first that fits, rolled from the building's id)
//   saloon     every saloon's back-room card table (the bar's own: pulls.js); its till is the house
//   hotel      a town's first hotel (any town that has one)
//   strip      the tallest hotel of a casino strip or a major city (citygen ARCHETYPES boom_strip / major)
// min, max    the bet at one hand ($)
// cage        the cash at the cashier's cage, rolled once [lo, hi]; null = the bar's own till (pulls BAR)
// safe        the cash in the back office's safe, rolled once [lo, hi]
// floatAt     when the cage falls under this, a guard walks the money from the safe (law 1: carried, never minted)
// carry       what that guard carries in one trip
// entry       who gets a seat: fee ($ at the door, once a day), minCash (shown at the door), dress (a worn slot that counts
//             as dressed: coat | chest), wanted (most stars let in), standing (the town's lowest standing to sit)
// tables      blackjack, chess (and dice) seats laid out on the floor
// guards      armed people on posts (door, cage, office) plus patrollers; cameras; drones over the property
export const STAKES = {
  backroom: { name: 'Back-room card table', where: 'saloon', min: 1, max: 10, cage: null, safe: null, floatAt: 0, carry: 0,
    entry: { fee: 0, minCash: 0, dress: null, wanted: 5, standing: -60 },
    tables: { blackjack: 1, chess: 0, dice: 0 }, guards: { post: [], patrol: 0, weapon: null }, cameras: 0, drones: 0, felt: '#2f6a3a' },
  floor: { name: 'Saloon gaming floor', where: 'hotel', min: 5, max: 100, cage: [700, 1600], safe: [1800, 4200], floatAt: 300, carry: 600,
    entry: { fee: 5, minCash: 0, dress: null, wanted: 1, standing: -30 },
    tables: { blackjack: 3, chess: 1, dice: 0 }, guards: { post: ['door', 'cage', 'office'], patrol: 1, weapon: 'shotgun' }, cameras: 2, drones: 1, felt: '#2d6b45' },
  highroller: { name: 'High-roller room', where: 'strip', min: 50, max: 1000, cage: [4500, 9000], safe: [12000, 26000], floatAt: 2500, carry: 4000,
    entry: { fee: 100, minCash: 500, dress: ['coat', 'chest'], wanted: 0, standing: 0 },
    tables: { blackjack: 4, chess: 2, dice: 0 }, guards: { post: ['door', 'cage', 'office', 'office'], patrol: 2, weapon: 'smg' }, cameras: 4, drones: 3, felt: '#1f5a3c' },
};

// ---- the games ----------------------------------------------------------------------------------------------------------
// decks (52 x decks in the shoe), pen (the cut card: dealt this share before a reshuffle), dealerHitsSoft17 (false =
// the dealer stands on every 17), bjPays (a natural pays bjPays : 1), doubleAny (double on any first two), splitMax
// (re-splits), splitAcesOneCard.
export const BLACKJACK = {
  backroom: { decks: 1, pen: 0.6, dealerHitsSoft17: true, bjPays: 1.2, doubleAny: false, splitMax: 1, splitAcesOneCard: true },
  floor: { decks: 6, pen: 0.75, dealerHitsSoft17: false, bjPays: 1.5, doubleAny: true, splitMax: 1, splitAcesOneCard: true },
  highroller: { decks: 8, pen: 0.7, dealerHitsSoft17: false, bjPays: 1.5, doubleAny: true, splitMax: 3, splitAcesOneCard: true },
};

// Chess opponents: their skill IS the row. depth (1..3 plies of alpha-beta), blunder (the chance of the second-best
// move), stake [lo, hi] they put up out of their own purse, purse rolled once.
export const CHESS_PLAYERS = {
  drunk: { name: 'A drunk with a pocket set', depth: 1, blunder: 0.35, stake: [2, 10], purse: [10, 40] },
  regular: { name: 'The house regular', depth: 2, blunder: 0.12, stake: [10, 50], purse: [60, 200] },
  shark: { name: 'The chess shark', depth: 3, blunder: 0.02, stake: [50, 300], purse: [300, 900] },
};
export const CHESS_AT = { backroom: ['drunk'], floor: ['drunk', 'regular'], highroller: ['regular', 'shark'] };

// ---- the dealer's eye: counting and cheating ----------------------------------------------------------------------------
// The dealer keeps the Hi-Lo count too. A hand where your bet jumps (>= spread x your table average) when the true count
// is >= hot adds eye x jump suspicion; a quiet hand takes off decay. At 1 the pit boss asks you to leave (barred: that
// room refuses you a seat for barDays). A palmed card is caught with chance catch[0] + eye x catch[1]: barred, and the
// guards are on you (worse).
export const EYE = { spread: 3, hot: 2, jump: 0.34, decay: 0.05, barDays: 7, catch: [0.15, 0.6] };
export const DEALER_EYE = { backroom: 0.35, floor: 0.6, highroller: 0.9 };

// ---- the house's people -------------------------------------------------------------------------------------------------
// hp, the weapon by stakes row; sight (m by day / by night; a guard sees inside his own room, by line of sight); hear: how
// far a gunshot carries to him (m); leash: how far a guard follows out of the room.
export const GUARD = { hp: 130, sight: [26, 12], hear: 45, leash: 70, names: ['Floor man', 'Door man', 'Cage guard', 'Pit boss', 'House gun'] };
// A camera: a cone on a wall (deg, m). It only tells if the office has someone watching the monitor (the office guard alive
// and at his post).
export const CAMERA = { cone: 70, range: 18 };
// The cage: robbed at gunpoint (your gun up at the cashier for `hold` s), or by the till opened with a pry bar.
export const CAGE = { hold: 2.2, reach: 2.6 };
// The safe in the back office, by how you open it: needs (an item you carry), time (s, held E), noise (m it carries:
// guards inside it hear it), uses (spent).
export const SAFE = {
  pick: { needs: 'lockpicks', time: 9, noise: 0, uses: 1, words: 'Working the dial' },
  pry: { needs: 'crowbar', time: 5, noise: 30, uses: 0, words: 'Prying the door' },
  blow: { needs: 'breach_charge', time: 2, noise: 90, uses: 1, words: 'Setting the charge' },
};
// A robbery's witnesses: anyone in the room who saw it runs to the town's board (the Tally's board) at speed m/s; the
// bounty is posted when they arrive, paid out of the house's money (law 2), at bounty x what was taken (clamped).
export const WITNESS = { speed: 3.2, arrive: 6, bounty: 0.5, min: 40, max: 2500 };

// ---- security drones (systems/drones.js's frame, the house's own) --------------------------------------------------------
// The house buys them; so does whoever owns the house (their home: the town's biggest house). They fly a loop over the
// property on the schedule (hours on), see by line of sight only (law 6: a body inside a building is under a roof),
// MARK what they see and call the guards to where they saw it. Shot down (hp), jammed (a jammer in your pack within jam
// m: it loses you and goes home), or avoided (crouch, the dark, a roof).
export const SEC_DRONE = { name: 'Security drone', hp: 26, speed: 6, alt: 7, sight: [30, 14], crouchMul: 0.6, mark: 8, hours: [18, 7], jam: 22, homeRest: 30, color: '#3a3a36', eye: '#ff3b2a' };
export const JAMMER = { jammer: { name: 'Signal jammer', kind: 'gadget', kg: 0.9, bulk: 0.8, stack: 1, value: 180, tags: ['jammer'],
  desc: 'A box of coils off a pre-war cab radio. Within twenty paces no little flier hears its master.' } };

// ---- words --------------------------------------------------------------------------------------------------------------
export const CASINO_NAMES = {
  floor: ['The Lucky Spur', 'The Brass Horseshoe', 'The Last Chance', 'Silver Dollar Hall', 'The Ace of Spades'],
  highroller: ['The Crown Room', 'The Gold Vault', 'The Sky Room'],
};

const PURPLE = (hex) => { const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? ''); if (!m) return false; const n = parseInt(m[1], 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b); if (mx === mn) return false; let h = mx === r ? (g - b) / (mx - mn) : mx === g ? 2 + (b - r) / (mx - mn) : 4 + (r - g) / (mx - mn); h = (h * 60 + 360) % 360; return h >= 270 && h <= 320; };
const pair = (a) => Array.isArray(a) && a.length === 2 && a.every(Number.isFinite) && a[0] <= a[1];

// Every row that would break the rooms. Returns a list of errors (empty: good).
export function validateCasinos(rows = { STAKES, BLACKJACK, CHESS_PLAYERS, CHESS_AT, EYE, DEALER_EYE, SAFE, SEC_DRONE, WITNESS }, items = null) {
  const e = [], S = rows.STAKES ?? {};
  for (const [id, s] of Object.entries(S)) {
    if (!['saloon', 'hotel', 'strip'].includes(s.where)) e.push(`stakes ${id}: where ${s.where}`);
    if (!(s.min >= 1 && s.max >= s.min)) e.push(`stakes ${id}: min ${s.min} max ${s.max}`);
    if (s.cage !== null && !pair(s.cage)) e.push(`stakes ${id}: cage must be [lo, hi] or null`);
    if (s.cage && s.cage[0] < s.max * 4) e.push(`stakes ${id}: the cage cannot cover a max bet split and doubled (${s.cage[0]} < ${s.max * 4})`);
    if (s.safe !== null && !pair(s.safe)) e.push(`stakes ${id}: safe must be [lo, hi] or null`);
    if (s.cage && !(s.carry > 0 && s.floatAt >= 0)) e.push(`stakes ${id}: a cage needs a carry and a floatAt`);
    if (!rows.BLACKJACK?.[id]) e.push(`stakes ${id}: no blackjack rules`);
    if (!(s.tables?.blackjack >= 0 && s.tables?.chess >= 0)) e.push(`stakes ${id}: tables`);
    if (s.tables?.chess && !(rows.CHESS_AT?.[id] ?? []).length) e.push(`stakes ${id}: chess tables but no players (CHESS_AT)`);
    if (s.drones && !s.cage) e.push(`stakes ${id}: drones need a house that can buy them (a cage)`);
    if (PURPLE(s.felt)) e.push(`stakes ${id}: felt ${s.felt} is purple (felt is green)`);
    if (s.entry?.dress && !Array.isArray(s.entry.dress)) e.push(`stakes ${id}: dress is a list of slots`);
  }
  for (const [id, b] of Object.entries(rows.BLACKJACK ?? {})) {
    if (!(Number.isInteger(b.decks) && b.decks >= 1 && b.decks <= 8)) e.push(`blackjack ${id}: decks ${b.decks}`);
    if (!(b.pen > 0.3 && b.pen < 0.95)) e.push(`blackjack ${id}: pen ${b.pen}`);
    if (!(b.bjPays >= 1 && b.bjPays <= 2)) e.push(`blackjack ${id}: bjPays ${b.bjPays}`);
    if (typeof b.dealerHitsSoft17 !== 'boolean') e.push(`blackjack ${id}: dealerHitsSoft17`);
  }
  for (const [id, p] of Object.entries(rows.CHESS_PLAYERS ?? {})) {
    if (!(Number.isInteger(p.depth) && p.depth >= 1 && p.depth <= 3)) e.push(`chess ${id}: depth ${p.depth} (1..3, it runs in the page)`);
    if (!(p.blunder >= 0 && p.blunder <= 1)) e.push(`chess ${id}: blunder ${p.blunder}`);
    if (!pair(p.stake) || !pair(p.purse)) e.push(`chess ${id}: stake and purse are [lo, hi]`);
  }
  for (const [k, list] of Object.entries(rows.CHESS_AT ?? {})) for (const p of list) if (!rows.CHESS_PLAYERS?.[p]) e.push(`chess_at ${k}: no player ${p}`);
  for (const [k, s] of Object.entries(rows.SAFE ?? {})) {
    if (!(s.time > 0 && s.noise >= 0)) e.push(`safe ${k}: time ${s.time} noise ${s.noise}`);
    if (items && !items[s.needs]) e.push(`safe ${k}: needs ${s.needs}, not an item`);
  }
  const D = rows.SEC_DRONE ?? {};
  if (!(D.hp > 0 && D.speed > 0 && Array.isArray(D.sight) && D.sight.length === 2 && D.sight[1] > 0 && D.sight[1] <= D.sight[0])) e.push('sec_drone: hp, speed, sight [day, night] (night no further than day)');
  if (PURPLE(D.color) || PURPLE(D.eye)) e.push('sec_drone: purple');
  if (!(rows.WITNESS?.speed > 0 && rows.WITNESS?.bounty > 0)) e.push('witness: speed and bounty');
  for (const [k, v] of Object.entries(rows.DEALER_EYE ?? {})) if (!(v >= 0 && v <= 1)) e.push(`dealer eye ${k}: ${v}`);
  return e;
}
