// THE CAVALRY COMPANY (VEHICLES V2 slice 6, Robert 11-12: "we definitely need horses as mounts... we definitely need a
// cavalry mounted faction"). WEB_ATLAS.md #33 THE CAVALRY POST ("a mercenary company rides out of the old fort on
// horseback, in the uniforms of an army two centuries dead") and the Hired Colonel (a mercenary captain whose company holds
// an old fort, "commands from a horse"). Our own world: no names from anywhere else.
// systems/cavalry.js runs it: the post is built where the row says, its garrison and patrols are placed ONCE (dead stays
// dead, a stolen horse stays stolen: nothing regenerates), the riders sit on real horses from the horses ledger
// (systems/horses.js) and shoot from the saddle. Pure data: tools/cavalry.test.mjs validates it in node.

// The society faction (systems/factions.js register): paid riders. They hunt the Dustwolves and the infected for the
// bounty, keep their distance from the Remnant (a rival for the same contracts), leave Rust Haven and the drifters be.
// Toward you, standing decides like any faction: a little wary to start.
export const COMPANY = {
  name: 'The Cavalry Company', short: 'Company', archetype: 'military', color: '#8a5a32', start: -10, stars: false, forgivesSelfDefense: true,
  cohesion: 0.8, memoryDays: 21, rumorDelay: [20, 45], hub: [-3150, 380], leaders: [], home: 'cavalry_post',
  relations: { dustwolves: -100, infected: -100, remnant: -30, rusthaven: 10, drifters: 5 },
  values: { 'kill:self': -10, 'hurt:self': -3, 'steal:self': -6, 'rob:self': -5, 'kill:dustwolves': 1, 'kill:infected': 0.4, 'trade:self': 1, 'heal:self': 3 },
};

// The rider: how they fight from the saddle (a horse's aim tax is systems/horses.js aimTax: trot 1.25x the spread, a
// gallop worse), how far they see, how close they let a target come.
export const RIDER = {
  hp: 130, weapons: { rifle: 0.65, pistol: 0.2, shotgun: 0.15 }, sight: 60, keep: [18, 34], spread: 0.08,
  colors: { coat: '#4a3a2a', trim: '#b88a3a', hat: '#2e2620' }, // a dead army's blues gone brown in the sun, brass buttons (never purple)
  names: ['Sgt. Abara', 'Cpl. Lindqvist', 'Trooper Haddad', 'Trooper Moreno', 'Trooper Oyelaran', 'Sgt. Petrakis', 'Trooper Quist', 'Cpl. Salgado', 'Trooper Tanaka', 'Trooper Vance'],
  flags: ['US', 'NG', 'SE', 'LB', 'MX', 'GR', 'NO', 'CO', 'JP', 'IE'], // everybody's from somewhere
};

// The posts. A row: where, the walls' square (half-size), the gate's side, the garrison (riders at the post: their horses
// tied at the corral rail), the patrols (riders in file on a loop of waypoints, relative to the post, at a gait).
export const CAVALRY_POSTS = [
  {
    id: 'cavalry_post', name: 'THE CAVALRY POST', region: 'west', x: -3150, z: 380, half: 18, gate: 'S',
    garrison: [{ breed: 'quarter' }, { breed: 'mustang' }, { breed: 'quarter' }],
    patrols: [
      { id: 'south_loop', riders: [{ breed: 'quarter' }, { breed: 'mustang' }], gait: 'trot', route: [[0, -30], [150, -130], [210, -30], [150, 100], [50, 70], [35, -25]] },
    ],
  },
];

// The rules: when the post is built and its people placed, when they are put away again (their state kept), the file.
export const CAVALRY = { liveR: 240, dropR: 360, fileGap: 6, arrive: 6, reloadSecs: 2.2 };

const purple = (hex) => { const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b); if (mx === mn) return false; let h = mx === r ? ((g - b) / (mx - mn)) % 6 : mx === g ? (b - r) / (mx - mn) + 2 : (r - g) / (mx - mn) + 4; h = (h * 60 + 360) % 360; return h >= 270 && h <= 320 && mx - mn > 30; };
export function validateCavalry(BREEDS = null) {
  const bad = [];
  if (purple(COMPANY.color)) bad.push('the company colour is purple');
  for (const c of Object.values(RIDER.colors)) if (purple(c)) bad.push(`rider colour ${c} is purple`);
  if (RIDER.names.length !== RIDER.flags.length) bad.push('every rider name needs a flag');
  if (Math.abs(Object.values(RIDER.weapons).reduce((a, b) => a + b, 0) - 1) > 1e-6) bad.push('rider weapons must sum to 1');
  const ids = new Set();
  for (const P of CAVALRY_POSTS) {
    if (ids.has(P.id)) bad.push(`post ${P.id} twice`); ids.add(P.id);
    if (!(P.half > 4)) bad.push(`${P.id}: walls too small`);
    for (const h of [...P.garrison, ...P.patrols.flatMap((t) => t.riders)]) if (BREEDS && !BREEDS[h.breed]) bad.push(`${P.id}: no breed ${h.breed}`);
    for (const t of P.patrols) {
      if (t.route.length < 3) bad.push(`${P.id}/${t.id}: a loop needs 3 points`);
      if (!['walk', 'trot', 'canter'].includes(t.gait)) bad.push(`${P.id}/${t.id}: gait ${t.gait}`);
      for (const [x, z] of t.route) if (Math.hypot(x, z) > CAVALRY.liveR) bad.push(`${P.id}/${t.id}: waypoint ${x},${z} past liveR`);
    }
  }
  return bad;
}
