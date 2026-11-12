// Doors and windows as data (systems/interiors.js runs them, world/city.js places them).
// A new door material or window kind is a row here, not a code path.

// Door leaf materials. kicks: boots it takes to burst the lock. lockHp: rounds into the lock
// (a .45 does 38 a hit, so a few rounds). The leaf itself (what the infected's fists must take off a SHUT door before it
// comes off its hinges) is the materials system's: data/materials.js hpM2 x the door's area (wood 60/m2: about 135 for a
// 1 m door; steel does not break). docs/design/WEB_DOOR_POUND.md colors: the leaf (picked per door; light enough to read
// against a dark floor from above), lock: the chain and hasp barring a locked door.
export const DOOR_MATERIALS = {
  wood: { name: 'wooden door', kicks: 2, lockHp: 70, bulletSlap: 0.025, colors: ['#a5743f', '#94653a', '#b3824c', '#8c5e34'], lock: '#d08a2c' },
  metal: { name: 'steel door', kicks: 3, lockHp: 95, bulletSlap: 0.012, colors: ['#8c948e', '#9a7a62', '#7f8a86', '#a0805e'], lock: '#d8902e' },
};

// One table for the leaf physics and the bash.
export const DOOR = {
  thick: 0.1,          // leaf thickness (m)
  height: 2.25,        // leaf height (m)
  maxAngle: 1.83,      // ~105° either way: it swings both ways and stops on its hinge
  damping: 2.4,        // 1/s: keeps its angle once it stops (no spring), slows a fling to rest
  yieldPerson: 0.8,    // share of a walker's push the leaf takes (the rest holds them back a touch)
  maxSpin: 14,         // rad/s cap
  kickSpin: 11,        // rad/s a kicked-open door flies at
  bashSpeed: 3.0,      // m/s of leaf at the point of contact that knocks a person down
  knockDown: 1.7,      // seconds on the floor after a door to the face
  bashDamage: 6,
  nearClosed: 0.45,    // rad: closer than this, a leaf blocks sight and bullets
  simRadius: 85,       // m from the player: doors beyond it are not simulated (pushes just set the angle)
  kickNoise: 30,       // m: a boot on a door is loud
  kickReach: 2.2,      // m: how close you stand to kick
  kickCool: 0.55,      // s between kicks
  // THE SHUT DOOR (WEB_DOOR_POUND.md): the infected cannot work a latch.
  shutAngle: 0.14,     // rad: every leaf this near closed and the door is SHUT (on its latch) to the infected
  shutReach: 2.0,      // m: how close you stand to pull an open door shut
  shutClear: 0.5,      // m: a body this near the closed leaf's line is in the way (the door will not shut on them)
  shutNoise: 7,        // m: a door pulled shut is heard
  shake: 0.32,         // s a leaf shudders after a blow
  shakeAngle: 0.07,    // rad: how far it jumps in its frame
  crackAt: 0.5,        // share of its hp left when the panel splits (a sound, splinters, the leaf darkens)
  braceReach: 1.5,     // m: lean on a shut door from this close (hold E)
  braceMul: 0.45,      // a blow on a door someone leans on does this share of its damage
  braceFresh: 0.3,     // s a lean lasts after the key (so a frame without the key does not drop it)
  poundNoise: 16,      // m a fist on a door carries (the others hear it and come)
  frenzyNoise: 26,     // m: a sprinter's frenzy carries further
  underAttack: 4,      // s after the last blow a door still reads as being pounded (the prompt, the HUD line)
};

// Window kinds. hp: glass that takes a few rounds (cracks, then shatters). boardHp: boards that stop
// most rounds and break under heavy damage. leakEvery: every Nth round finds a gap between planks.
export const WINDOW = {
  width: 1.6, sill: 0.95, top: 2.55,
  hp: 40, boardHp: 150, boardBulletMul: 0.7, leakEvery: 5,
  boardTime: 2.2,      // s of holding interact to board one up
  unboardTime: 1.6,
  holdTap: 0.3,        // s: a shorter press is a tap (climb through), a longer one starts boarding
  vaultTime: 0.85,     // s to climb through a broken window (a dive goes through in 0.35)
  vaultPush: 0.22,     // s of walking into a broken window before you climb
  smashNoise: 22,      // m
  clawEvery: 0.9,      // s: the infected claw at glass and boards they press against
  clawGlass: 12, clawBoards: 9,
  diveCut: 7,          // damage from diving through intact glass
};

// What a window looks like (systems/interiors.js buildMeshes): a window was a slot from the sill to the roof with a thin
// slab of glass in it, and from the game camera it read as a gap in the wall (Robert, 2026-10-23: "this doesn't have
// good windows... make sure they look like windows"). Now: the wall closes over it (a lintel in the building's own
// colour), a painted frame round the opening, a mullion and a transom across the glass (gone with the glass when it is
// shot out), a sill that sticks out, and in Rust Haven painted shutters. A ruin's frame is bare and a shutter may hang
// off one hinge. Colours: no purple (hue 270-320 is banned).
export const WINDOW_LOOK = {
  frame: { w: 0.09, depth: 0.5, town: ['#e8dcc0', '#d9c9a4', '#f0e6cf', '#2f6f78'], ruins: ['#8a857c', '#7a746a', '#9a8f7c'] },
  sill: { out: 0.22, depth: 0.3, h: 0.07, color: '#d8cfbc' },
  bars: { w: 0.06, transom: 0.68, color: '#4a3a2a' },   // mullion and transom; transom at this share of the opening
  shutter: { town: 0.6, ruins: 0.15, w: 0.55, out: 0.27, colors: ['#2f7f8a', '#3f6fa8', '#5f7f22', '#b8452f', '#d9861a', '#e8dcc0'] },
};

// The Phoenix ring's doors and windows (systems/interiors.js, the streamed section). The ring has thousands of buildings,
// so their openings are real (leaves that swing, glass that breaks, boards, climbing through) only round the player: a
// building's openings attach within `near` m of you and detach past `far` (checked every `every` s), into a fixed pool
// (`windows`, `doors`) so nothing allocates a mesh at runtime. What happened to them is kept by id (a shattered window
// stays shattered when you come back, and in the save). Past `far` a ring opening is the gap it always was.
//   innerOpen: the share of a ring building's inside doors left standing open (nobody shuts doors in a dead city)
export const RING_OPENINGS = { near: 110, far: 150, every: 0.5, buildPerScan: 6, wide: 1.75, windows: 480, doors: 220, innerOpen: 0.6, ajar: 0.35, metal: 0.2 };

// Opening states at boot, per district: [intact, shattered, boarded] weights.
export const WINDOW_MIX = {
  town: [0.72, 0.0, 0.28],
  ruins: [0.38, 0.37, 0.25],
  ruined: [0.12, 0.62, 0.26],
};
