import { FN_MELEE } from './fannods.js';
// How a gun is carried and how a fight goes hand to hand (docs/design/WEB_CONTROLLER.md §3). Rows and numbers only; the
// rules live in systems/arms.js (stance, grip, fire modes, recoil), systems/gunpoint.js and systems/melee.js.

// ---- stance: holstered, lowered (in hand, muzzle down), raised (aimed) ----------------------------------------------
// raised   the gun is up and pointed: it fires, people read it (guards tense, traders shut the counter, the person it
//          points at is held at gunpoint). Tap H (pad: D-pad up) or pull the trigger to raise; a strong right-stick
//          throw raises it too.
// lowered  in hand, muzzle at the ground: the start of the game, and where a raised gun drops after `calm` s with no
//          shot, nobody covered and nobody hunting you within `calmR` m. Pulling the trigger raises and fires at once.
// holstered put away (hold H): both hands free - doors open ahead of you, windows are climbed faster, you move a touch
//          quicker and sprint longer. Pulling the trigger draws (the gun's `draw` s) before it fires.
export const STANCE = {
  start: 'lowered',
  calm: 6, calmR: 45,
  draw: { pistol: 0.28, smg: 0.42, shotgun: 0.45, rifle: 0.55, default: 0.45 },
  move: { holstered: 1.05, lowered: 1.0 },           // speed share by stance (raised: the grip's own, below)
  sprintDrain: { holstered: 0.85 },                  // stamina a sprint costs, x
  vault: { holstered: 1.6, lowered: 1.15, raised: 1 }, // how fast a window is climbed, x
  // Free hands on a door: a closed leaf within `reach` m ahead of you as you walk into it is pushed open at `spin`
  // rad/s (holstered only), so you keep your stride; with a gun up you shoulder it and lose a step.
  doorHand: { reach: 1.25, spin: 5.5, cone: 0.55 },
  // People read a raised gun (systems/arms.js notice): within `seeR` m, on your floor, seeing you, after `notice` s.
  // A guard (warden, soldier) tenses: turns to you, says so, and draws at once if you then point it at them. A trader
  // won't open the counter while it lasts (trade.js). It fades `relax` s after the gun goes down.
  seeR: 14, notice: 0.6, relax: 3,
  guards: ['warden', 'soldier'],
};

// ---- the grip: one hand or two --------------------------------------------------------------------------------------
// One hand: faster on your feet, works from a car window, while hanging on, while cooking a throw, on the run - with a
// wider cone and more kick. Two hands: steadier, slower. `oneHand` (per gun) scales the one-handed penalty: a revolver is
// made for it, a rifle is not. `heft` scales how much two hands slow you.
export const GRIP = {
  one: { spread: 1.7, kick: 1.75, recover: 2.6 },
  two: { spread: 1.0, kick: 1.0, recover: 4.2 },
  moveTwo: 0.22, moveOne: 0.04,                       // speed lost, x heft
  guns: {
    pistol: { oneHand: 1.0, heft: 0.45 },
    smg: { oneHand: 1.3, heft: 0.7 },
    shotgun: { oneHand: 1.45, heft: 0.8 },
    rifle: { oneHand: 2.0, heft: 1.0 },
    default: { oneHand: 1.4, heft: 0.8 },
  },
  // Forced one hand (whatever you chose): any seat in a vehicle, hanging on, cooking a throw, sprinting.
  sprintAt: 6.0,
  // Recoil bloom: each shot adds its mode's kick x the grip's kick; it bleeds off at `recover`/s; the cone is
  // x (1 + bloom), bloom capped at `max`.
  bloomMax: 2.2,
};

// ---- gunpoint: a raised gun held on a person is a state ---------------------------------------------------------------
// Aim within `slack` m of a person (plus `slackPerM` per metre away) inside `range` m, on your floor, in sight, for `aimFor`
// s (a tense guard: at once) and they are HELD. They answer by their nerve:
//   nerve   per faction (named people have their own `nerve` or `npc`); + `armed` if they carry a gun, + `backup` for
//           each armed friend within 12 m, - `close` x (1 - d / range) (a muzzle in your face is hard to argue with),
//           +- `jitter`.
//   draw    armed and nerve >= draw        - they raise theirs: a standoff
//   run     nerve >= run (and unarmed)     - they run (and a run past `runFar` m is a clean getaway)
//   plead   nerve < plead                  - down on their knees, hands up, begging
//   comply  otherwise                      - hands up, they do what you say
// Held people stay held while the gun stays raised within `keep` m and you don't look away for more than `lapse` s.
// Their verbs (E on a held person within `reach` m): hand it over (a robbery: cash and what they carry drop at their
// feet), open the door (a locked door within `doorR` m of them), hold E: walk with me (a prisoner; they follow with
// their hands up until you holster, or you get more than `leash` m ahead).
// A standoff: everyone drawn on you holds fire while you cover one of them. Their `tension` climbs at `tenseUp`/s while
// your aim is on somebody else and falls at `tenseDown`/s while it is on them; at (1 + nerve) they fire. Lower or
// holster your gun and after `standDown` s they lower theirs; fire and they all fire.
export const GUNPOINT = {
  range: 13, slack: 1.1, slackPerM: 0.06, aimFor: 0.7, keep: 18, lapse: 1.6, reach: 2.8, doorR: 7, leash: 14, runFar: 30,
  nerve: { drifter: 0.25, warden: 0.85, soldier: 0.9, raider: 0.6, npc: 0.45, default: 0.35 },
  armed: 0.25, backup: 0.12, close: 0.25, jitter: 0.08,
  draw: 0.7, run: 0.62, plead: 0.15,
  tenseUp: 0.32, tenseDown: 0.5, standDown: 1.2, guardFireAfter: 5,
  cash: { drifter: [4, 30], raider: [8, 45], warden: [10, 40], soldier: [5, 25], default: [2, 20] },
  barks: {
    comply: ["Easy! Easy, I'm not armed.", 'Okay, okay. Hands up.', "Don't shoot. Whatever you want."],
    plead: ["Please - I've got people waiting on me.", "Don't do this. Please.", "I'm nobody. Please."],
    run: ['Not today!', "You won't shoot me in the back.", 'Help! Gun!'],
    draw: ['Your move.', 'Go on, then.', "Two can play, stranger."],
    guardDraw: ['Lower it. Now.', 'Drop the iron or I drop you.'],
    tense: ['Easy with that.', 'Put that away in here.', "Holster it, friend."],
    standDown: ['Smart.', 'Walk away.', 'That was close.'],
    robbed: ['Take it. Just take it.', "That's all I've got."],
    door: ['All right, all right, it opens.'],
    prisoner: ['Okay. I\'m walking.'],
  },
};

// ---- melee: rounds are scarce, hands are not --------------------------------------------------------------------------
// Tap: a strike with what is in your hand (fists, the butt of the gun, a knife you carry). Hold and let go: a kick (heavier,
// more stamina, knocks people down). Sprinting into it: a shoulder shove (no damage to speak of, a knockdown, room to run).
// windup  s before the blow lands (contact-timed: the damage happens at the hit, not the click)
// recover s after it before the next
// reach   m, in a cone of `arc` radians either side of where you face
// stamina what it costs (no stamina: weak and slow, x0.5 damage)
// knock   s on the floor for whoever takes it (0: none); push: m they are driven back
// Combo: strikes landed inside `combo.window` s of the last chain; the third lands x `combo.mul` and knocks down.
export const MELEE = {
  fists: { name: 'FISTS', dmg: 9, windup: 0.1, recover: 0.26, reach: 1.15, arc: 0.9, stamina: 0.06, knock: 0, push: 0.25, noise: 6 },
  butt: { name: 'GUN BUTT', dmg: 16, windup: 0.16, recover: 0.38, reach: 1.35, arc: 0.8, stamina: 0.09, knock: 0.6, push: 0.4, noise: 8 },
  knife: { name: 'KNIFE', dmg: 26, windup: 0.09, recover: 0.3, reach: 1.2, arc: 0.7, stamina: 0.07, knock: 0, push: 0.1, noise: 3, bleed: 0.35 },
  kick: { name: 'KICK', dmg: 15, windup: 0.22, recover: 0.5, reach: 1.45, arc: 0.7, stamina: 0.16, knock: 1.1, push: 1.1, noise: 7 },
  shove: { name: 'SHOVE', dmg: 3, windup: 0.08, recover: 0.45, reach: 1.4, arc: 0.85, stamina: 0.12, knock: 1.3, push: 1.6, noise: 5 },
  combo: { window: 0.75, mul: 1.6, at: 3 },
  heavyAt: 0.3,      // s held before a release is a kick, not a strike
  lunge: 0.35,       // m you step into a blow
  infectedKnock: 0.7, // the infected stagger for less (they don't feel it)
};
Object.assign(MELEE, FN_MELEE); // the found things' cane and blades (data/fannods.js)

// ---- the carry: the gun at the side, on the dominant hand (docs/design/WEB_CAMERA.md §3.6; gap G2) -------------------
// Aimed, a gun sits off the body's centre line on the shooter's dominant side (m, from the chest centre):
//   pistolOneHand  arm out from the shoulder, the gun at `height` m off the ground, `reach` m in front
//   pistolTwoHand  both hands on a short gun: it comes in toward the middle
//   longGun        a rifle, shotgun or SMG shouldered on the dominant side (stock in the shoulder pocket)
// The muzzle ray still converges on the aim point: the shot toes in by atan(lateral / distance), never more than
// `toeInMax` degrees (a target nearer than ~3 m is shot from the hip line). `leftShare`: the share of people who are
// left-handed (stable per person from their name; the player picks in the creator). A lefty mirrors every carry.
export const CARRY = {
  pistolOneHand: { lateral: 0.20, height: 1.35, reach: 0.55 },
  pistolTwoHand: { lateral: 0.10 },
  longGun: { lateral: 0.16, stockAtShoulder: true },
  toeInMax: 4,
  toeInDefault: 15, // m: the distance a shot toes in to when the shooter has no aim point or target
  leftShare: 0.08,
};
