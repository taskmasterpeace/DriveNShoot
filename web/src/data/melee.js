// MELEE AS ROWS (docs/design/WEB_MELEE.md). Fast, readable, lethal hand to hand: every weapon is a row, every rule a
// number here, and the player and every NPC fight by the same rows (law 1: nobody cheats).
//
// A WEAPON row (MELEE_WEAPONS):
//   name      what the HUD calls it          item   the inventory item it is (null: your bare hands, always there)
//   kind      blunt | blade                  hands  1 | 2 (a two-hander can't be held with a hostage)
//   dmg       base damage of a clean light hit (before the body part, the block and strength)
//   windup    s from the press to the moment of contact (READABLE: the pose draws back the whole time)
//   recover   s after contact before you can act again        reach  m from the chest      arc  half-angle, rad
//   stamina   share of the bar a light swing costs             noise  m it carries (a bat on a skull is loud)
//   knock     [chance, s]: a light hit puts them down this often, for this long (a head hit doubles the chance)
//   push      m a hit drives them back (an impulse on the body, not a teleport: it slides and can trip on furniture)
//   bleed     bleeding a hit opens          bone   chance a hit on an arm or leg breaks it (blunt)
//   sever     chance a heavy blade hit on a limb takes it off (only when the part is already hurt or the hit is huge)
//   aim       odds of the body part a hit lands on: head torso arms legs (a block puts it on the arms)
//   parts     damage multiplier per part
//   heavy     the held swing: dmg x mul, windup x wind, knock chance + knockAdd, stamina x sta
//   block     how well it blocks WITH it: soak (share of the hit it eats) and arm (share of what's left that the arm takes)
//   dur       hits before it breaks (null: hands don't break; a broken forearm is the hands' durability)
//   finish    damage on a downed body (the finisher: a stomp for the hands, the weapon brought down for the rest)
//   model     the instanced prop: len (m), the head box [w, h, d], colours (never purple)
export const MELEE_WEAPONS = {
  fists: { name: 'FISTS', item: null, kind: 'blunt', hands: 1, dmg: 9, windup: 0.1, recover: 0.24, reach: 1.15, arc: 0.9, stamina: 0.06, noise: 6,
    knock: [0.04, 0.9], push: 0.25, bleed: 0, bone: 0.02, sever: 0, aim: { head: 0.45, torso: 0.45, arms: 0.1, legs: 0 }, parts: { head: 1.3, torso: 1, arms: 0.6, legs: 0.7 },
    heavy: { mul: 1.7, wind: 2.2, knockAdd: 0.6, sta: 2.2 }, block: { soak: 0.6, arm: 1 }, dur: null, finish: 34, model: null },
  knuckles: { name: 'BRASS KNUCKLES', item: 'brass_knuckles', kind: 'blunt', hands: 1, dmg: 17, windup: 0.1, recover: 0.24, reach: 1.15, arc: 0.85, stamina: 0.065, noise: 7,
    knock: [0.12, 1.1], push: 0.35, bleed: 0.05, bone: 0.08, sever: 0, aim: { head: 0.5, torso: 0.4, arms: 0.1, legs: 0 }, parts: { head: 1.4, torso: 1, arms: 0.6, legs: 0.7 },
    heavy: { mul: 1.7, wind: 2.2, knockAdd: 0.6, sta: 2.2 }, block: { soak: 0.62, arm: 1 }, dur: 400, finish: 40, model: { len: 0.06, head: [0.1, 0.05, 0.04], grip: '#b08a3a', metal: '#c9a24a' } },
  knife: { name: 'KNIFE', item: 'knife', kind: 'blade', hands: 1, dmg: 24, windup: 0.09, recover: 0.28, reach: 1.2, arc: 0.7, stamina: 0.07, noise: 3,
    knock: [0, 0], push: 0.1, bleed: 0.35, bone: 0, sever: 0, aim: { head: 0.2, torso: 0.6, arms: 0.15, legs: 0.05 }, parts: { head: 1.6, torso: 1.1, arms: 0.6, legs: 0.7 },
    heavy: { mul: 1.6, wind: 1.8, knockAdd: 0, sta: 1.8 }, block: { soak: 0.3, arm: 0.8 }, dur: 160, finish: 70, model: { len: 0.12, head: [0.025, 0.012, 0.16], grip: '#2a2420', metal: '#b9b4a8' } },
  machete: { name: 'MACHETE', item: 'machete', kind: 'blade', hands: 1, dmg: 30, windup: 0.2, recover: 0.36, reach: 1.55, arc: 0.85, stamina: 0.11, noise: 5,
    knock: [0.05, 1], push: 0.3, bleed: 0.45, bone: 0.05, sever: 0.35, aim: { head: 0.25, torso: 0.4, arms: 0.25, legs: 0.1 }, parts: { head: 1.7, torso: 1, arms: 0.8, legs: 0.8 },
    heavy: { mul: 1.7, wind: 1.9, knockAdd: 0.15, sta: 2 }, block: { soak: 0.65, arm: 0.5 }, dur: 140, finish: 90, model: { len: 0.14, head: [0.05, 0.012, 0.52], grip: '#3a2a1c', metal: '#a9a59a' } },
  bat: { name: 'BASEBALL BAT', item: 'baseball_bat', kind: 'blunt', hands: 2, dmg: 28, windup: 0.32, recover: 0.42, reach: 1.75, arc: 1.15, stamina: 0.13, noise: 9,
    knock: [0.4, 1.8], push: 0.9, bleed: 0.05, bone: 0.35, sever: 0, aim: { head: 0.4, torso: 0.4, arms: 0.2, legs: 0 }, parts: { head: 1.8, torso: 1, arms: 0.9, legs: 0.9 },
    heavy: { mul: 1.6, wind: 1.6, knockAdd: 0.35, sta: 1.8 }, block: { soak: 0.7, arm: 0.45 }, dur: 120, finish: 95, model: { len: 0.3, head: [0.075, 0.075, 0.62], grip: '#6a4a2a', metal: '#b88a52' } },
  crowbar: { name: 'CROWBAR', item: 'crowbar', kind: 'blunt', hands: 1, dmg: 24, windup: 0.24, recover: 0.38, reach: 1.5, arc: 0.95, stamina: 0.11, noise: 8,
    knock: [0.25, 1.4], push: 0.6, bleed: 0.15, bone: 0.3, sever: 0, aim: { head: 0.4, torso: 0.35, arms: 0.25, legs: 0 }, parts: { head: 1.8, torso: 1, arms: 0.9, legs: 0.9 },
    heavy: { mul: 1.6, wind: 1.7, knockAdd: 0.3, sta: 1.9 }, block: { soak: 0.7, arm: 0.45 }, dur: 600, finish: 85, model: { len: 0.1, head: [0.03, 0.03, 0.62], grip: '#3a3532', metal: '#5a5650' } },
  pipe: { name: 'LEAD PIPE', item: 'lead_pipe', kind: 'blunt', hands: 1, dmg: 21, windup: 0.22, recover: 0.38, reach: 1.45, arc: 0.95, stamina: 0.1, noise: 8,
    knock: [0.25, 1.4], push: 0.55, bleed: 0.05, bone: 0.28, sever: 0, aim: { head: 0.4, torso: 0.4, arms: 0.2, legs: 0 }, parts: { head: 1.7, torso: 1, arms: 0.9, legs: 0.9 },
    heavy: { mul: 1.6, wind: 1.7, knockAdd: 0.3, sta: 1.9 }, block: { soak: 0.68, arm: 0.45 }, dur: 300, finish: 80, model: { len: 0.1, head: [0.04, 0.04, 0.52], grip: '#4a4a46', metal: '#6e6c66' } },
  sledge: { name: 'SLEDGEHAMMER', item: 'sledgehammer', kind: 'blunt', hands: 2, dmg: 48, windup: 0.62, recover: 0.7, reach: 1.8, arc: 0.9, stamina: 0.24, noise: 11,
    knock: [0.75, 2.4], push: 1.5, bleed: 0.1, bone: 0.6, sever: 0, aim: { head: 0.35, torso: 0.45, arms: 0.2, legs: 0 }, parts: { head: 2, torso: 1, arms: 1, legs: 1 },
    heavy: { mul: 1.5, wind: 1.4, knockAdd: 0.2, sta: 1.6 }, block: { soak: 0.72, arm: 0.5 }, dur: 260, finish: 140, model: { len: 0.7, head: [0.12, 0.12, 0.24], grip: '#6a4a2a', metal: '#4a4844' } },
};
export const WEAPON_IDS = Object.keys(MELEE_WEAPONS);

// The new carried things (data/items.js folds them in: inventory rows like any other, found in the world's loot).
export const MELEE_ITEMS = {
  baseball_bat: { name: 'Baseball bat', kind: 'tool', kg: 0.95, bulk: 1.1, stack: 1, value: 16, tags: ['melee'], desc: 'Ash, taped at the handle, the barrel dented from something that wasn\'t a ball.' },
  brass_knuckles: { name: 'Brass knuckles', kind: 'tool', kg: 0.25, bulk: 0.05, stack: 1, value: 20, tags: ['melee'], desc: 'Four rings of cast brass. Every punch lands like a hammer.' },
  lead_pipe: { name: 'Lead pipe', kind: 'tool', kg: 1.4, bulk: 0.7, stack: 1, value: 6, tags: ['melee', 'steel'], desc: 'A length of old plumbing, heavy at one end where the joint is still on.' },
  sledgehammer: { name: 'Sledgehammer', kind: 'tool', kg: 4.5, bulk: 2.2, stack: 1, value: 24, tags: ['melee', 'steel', 'pry'], desc: 'Ten pounds of steel on a hickory handle. Slow. Final.' },
};
// Where they turn up (rows appended to data/items.js LOOT tables): [item, weight, min, max].
export const MELEE_LOOT = { raider: [['baseball_bat', 2, 1, 1], ['brass_knuckles', 1, 1, 1], ['lead_pipe', 2, 1, 1]], garage: [['lead_pipe', 2, 1, 1], ['sledgehammer', 1, 1, 1]] };

// ---- the rules --------------------------------------------------------------------------------------------------------
export const MELEE_RULES = {
  // BLOCK (hold): you face the blow and take it on the forearms (bare) or the weapon in your hands. A blocked hit lands on
  // the arms, cut by the block's soak; the arm takes what is left (arm hp below), and a blocked BLUNT hit can still break
  // a bare forearm (x bone of the weapon x boneBare). A blade blocked bare cuts your arms (bleed x cutBare).
  block: {
    arcDeg: 75,          // the blow must come from inside this half-angle of where you face, or the guard doesn't cover it
    moveMul: 0.55,       // you shuffle with your guard up
    staminaPerHit: 0.09, // each blocked blow costs this share of the bar (x the attacker's dmg / 25); empty, the guard breaks
    guardBreakStagger: 0.8,
    boneBare: 0.5,       // a bare-armed block of a blunt weapon breaks the forearm at this share of the weapon's bone chance
    cutBare: 1.4,        // a blade on bare arms opens this many times its own bleed
    vsBladeBare: 0.55,   // a bare arm soaks a blade only to this share of its blunt soak
    blockedStagger: 0.28,// s the blocker reels from any blocked blow (heavy: x2)
    turnRate: 10,        // rad/s the guard swings to face an attacker
  },
  // PARRY: the block raised inside this window before the moment of contact turns the blow aside: no damage, and the
  // attacker is OPEN (staggered: no guard, can't act, takes x openMul from the next hit).
  parry: { window: 0.2, stagger: 1.05, openMul: 1.5, stamina: 0.02 },
  // Arm hp (each person, both forearms as one guard): a block's arm damage fills it; past `hurtAt` the guard is weaker,
  // at `breakAt` (or on a bone roll) the forearm is BROKEN: block soak x brokenSoak, punches x brokenDmg, for the player a
  // real fracture wound (data/survival.js INJURIES: a splint fixes it).
  arm: { hp: 60, hurtAt: 0.5, hurtSoak: 0.8, breakAt: 1, brokenSoak: 0.35, brokenDmg: 0.55, heal: 0.4 /* hp/s while not fighting */ },
  // Hits on someone who is knocked down: the finisher. A downed body takes the weapon's `finish` at the head.
  finish: { reach: 1.6, windup: 0.32, recover: 0.5, noise: 7, stamina: 0.12 },
  // GRAB: a hand on someone in reach. From BEHIND and UNSEEN it is a NECK GRAB (the hostage hold); from the front a CLINCH.
  grab: {
    reach: 1.25, behindDeg: 110,     // you are behind them when the angle from their facing to you is past this
    windup: 0.12, recover: 0.4, stamina: 0.1,
    hold: { dist: 0.48, moveMul: 0.55 }, // the held stand this far in front of you; you walk them at this share of a walk
    choke: { secs: 6, outSecs: 40, noise: 2 }, // a choke held this long (struggle won't be lost) puts them out cold
    release: { push: 0.9 },
    clinch: { secs: 3, throwKnock: 1.6 },   // a clinch is a short struggle: the winner throws the other down
  },
  // STRUGGLE: a bar from -1 (the held breaks free) to +1 (the holder wins). Each side pushes with its POWER:
  //   power = strength (1 + 0.08 x Strength level) x (0.35 + 0.65 x stamina) x (0.4 + 0.6 x hp share) x (broken arm: 0.6)
  //           x effort (the player: mash rate share of `mashFull` presses/s; an NPC: `npcEffort` +- noise)
  // bar += (holder - held) x rate x dt; a neck grab from behind starts at `neckStart` (the holder's edge), a clinch at 0.
  // A choke only closes while the holder is winning (bar > 0), at (0.3 + 0.7 x bar) of its full pace.
  //   the player's effort = min(1, presses/s / mashFull) x mashMax; holding a neck it never drops under holdEffort.
  struggle: { rate: 0.7, neckStart: 0.35, mashFull: 6, mashMax: 1.8, holdEffort: 0.6, npcEffort: [0.55, 0.9], drain: 0.06 /* stamina/s each side */,
    breakFree: { elbow: 0.55, bite: 0.25 /* else a shove */, elbowDmg: 8, biteDmg: 6, stagger: 0.7 } },
  // Bodies: a hit is an impulse (m/s = push / slide) that slides the body and decays; slamming into something solid on the
  // slide puts them down (they fall over the table, the car, the wall).
  body: { slide: 0.22, tripSpeed: 2.2, tripKnock: 1.2 },
  // Feel (systems/lookfeel.js and the camera): hit-stop ms by how hard it landed, camera shake, bone crack.
  // A light jab never freezes the frame (a chain of them must stay crisp); heavies, parries and bones do.
  feel: { stopLight: 0, stopHeavy: 70, stopParry: 90, stopBone: 80, shakeLight: 0.15, shakeHeavy: 0.32 },
  combo: { window: 0.75, mul: 1.6, at: 3 },
  heavyAt: 0.3,       // s the attack is held before letting go is a heavy (a kick with bare hands)
  lunge: 0.35,
  infectedKnock: 0.7,
};

// ---- the AI (law 1: the same rules; only reaction and judgment differ) -------------------------------------------------
// per faction: react (s before they read a wind-up), block (chance they raise a guard against one they read), parry
// (share of guards timed into a parry), grab (chance an unseen approach from behind ends in a neck grab instead of a
// blow), hostage (chance a neck grab is held as a shield when others are near), flee (hp share they run at),
// reckless (share of the faction who will shoot THROUGH a hostage), brawl (they fight in reach rather than back off).
export const MELEE_AI = {
  raider: { react: 0.28, block: 0.45, parry: 0.2, grab: 0.55, hostage: 0.7, flee: 0.22, reckless: 0.3, brawl: true },
  drifter: { react: 0.38, block: 0.35, parry: 0.1, grab: 0.2, hostage: 0.2, flee: 0.45, reckless: 0.05, brawl: false },
  warden: { react: 0.25, block: 0.55, parry: 0.25, grab: 0.3, hostage: 0.1, flee: 0.2, reckless: 0, brawl: true },
  soldier: { react: 0.22, block: 0.6, parry: 0.3, grab: 0.4, hostage: 0.15, flee: 0.15, reckless: 0.08, brawl: true },
  ally: { react: 0.3, block: 0.5, parry: 0.2, grab: 0.3, hostage: 0, flee: 0.2, reckless: 0, brawl: true },
  default: { react: 0.35, block: 0.35, parry: 0.12, grab: 0.25, hostage: 0.2, flee: 0.35, reckless: 0.1, brawl: false },
  think: { closeSpeed: 4.4, sneakSpeed: 1.5, sneakFrom: 9, holdShieldSecs: 12 },
  // The world: the share of ambient raiders who are bruisers (no gun, a melee weapon they carry) and what they carry.
  world: { bruiserShare: 0.2, bruiserWeapons: ['bat', 'pipe', 'machete', 'crowbar', 'knuckles', 'bat', 'pipe'] },
};

const PARTS = ['head', 'torso', 'arms', 'legs'];
const hueOf = (hex) => {
  const n = parseInt(hex.slice(1), 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (d < 0.08) return null; // a grey: no hue
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
};

// The World Forge's check (and the selftest's): every row whole and sane, no purple prop, the rules in their ranges.
export function validateMelee(weapons = MELEE_WEAPONS, rules = MELEE_RULES, ai = MELEE_AI, items = MELEE_ITEMS) {
  const errors = [];
  const num = (v, lo, hi, what) => { if (typeof v !== 'number' || !(v >= lo && v <= hi)) errors.push(`${what} = ${v} (want ${lo}..${hi})`); };
  if (!weapons.fists) errors.push('no fists row: bare hands must always be there');
  for (const [id, w] of Object.entries(weapons)) {
    const at = `weapon ${id}`;
    if (!w.name) errors.push(`${at}: no name`);
    if (w.kind !== 'blunt' && w.kind !== 'blade') errors.push(`${at}: kind ${w.kind}`);
    if (w.hands !== 1 && w.hands !== 2) errors.push(`${at}: hands ${w.hands}`);
    num(w.dmg, 1, 120, `${at}.dmg`); num(w.windup, 0.05, 1.2, `${at}.windup`); num(w.recover, 0.1, 1.5, `${at}.recover`);
    num(w.reach, 0.8, 2.4, `${at}.reach`); num(w.arc, 0.3, 1.6, `${at}.arc`); num(w.stamina, 0.01, 0.4, `${at}.stamina`);
    num(w.push, 0, 2.5, `${at}.push`); num(w.bleed, 0, 1, `${at}.bleed`); num(w.bone, 0, 1, `${at}.bone`); num(w.sever, 0, 1, `${at}.sever`);
    if (!Array.isArray(w.knock) || w.knock.length !== 2) errors.push(`${at}.knock: [chance, s]`); else { num(w.knock[0], 0, 1, `${at}.knock chance`); num(w.knock[1], 0, 4, `${at}.knock s`); }
    const s = PARTS.reduce((a, p) => a + (w.aim?.[p] ?? NaN), 0);
    if (!(Math.abs(s - 1) < 0.02)) errors.push(`${at}.aim: odds sum ${s} (want 1)`);
    for (const p of PARTS) num(w.parts?.[p], 0.1, 3, `${at}.parts.${p}`);
    num(w.heavy?.mul, 1, 3, `${at}.heavy.mul`); num(w.heavy?.wind, 1, 4, `${at}.heavy.wind`);
    num(w.block?.soak, 0, 0.95, `${at}.block.soak`); num(w.block?.arm, 0, 1, `${at}.block.arm`);
    num(w.finish, 1, 300, `${at}.finish`);
    if (w.dur !== null) num(w.dur, 5, 5000, `${at}.dur`);
    if (w.item !== null && !(w.item in items) && !['knife', 'machete', 'crowbar'].includes(w.item)) errors.push(`${at}: item ${w.item} is not an item row`);
    if (w.kind === 'blade' && w.sever > 0 && w.bleed <= 0) errors.push(`${at}: a blade that takes limbs must bleed`);
    if (w.model) for (const c of [w.model.grip, w.model.metal]) { const h = hueOf(c ?? '#000000'); if (h !== null && h >= 270 && h <= 320) errors.push(`${at}: model colour ${c} is purple`); }
  }
  num(rules.parry.window, 0.05, 0.5, 'parry.window'); num(rules.parry.stagger, 0.2, 3, 'parry.stagger');
  num(rules.block.arcDeg, 30, 120, 'block.arcDeg'); num(rules.grab.reach, 0.6, 2, 'grab.reach'); num(rules.grab.behindDeg, 60, 170, 'grab.behindDeg');
  num(rules.struggle.rate, 0.05, 3, 'struggle.rate'); num(rules.struggle.neckStart, -1, 1, 'struggle.neckStart');
  num(rules.grab.choke.secs, 1, 30, 'grab.choke.secs');
  for (const [f, r] of Object.entries(ai)) { if (f === 'think' || f === 'world') continue; for (const k of ['block', 'parry', 'grab', 'hostage', 'flee', 'reckless']) num(r[k], 0, 1, `ai.${f}.${k}`); num(r.react, 0.05, 2, `ai.${f}.react`); }
  return { ok: errors.length === 0, errors, weapons: Object.keys(weapons).length };
}
