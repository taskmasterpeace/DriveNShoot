// Doors and windows as data (systems/interiors.js runs them, world/city.js places them).
// A new door material or window kind is a row here, not a code path.

// Door leaf materials. kicks: boots it takes to burst the lock. lockHp: rounds into the lock
// (a .45 does 38 a hit, so a few rounds). colors: the leaf (picked per door; light enough to read
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

// Opening states at boot, per district: [intact, shattered, boarded] weights.
export const WINDOW_MIX = {
  town: [0.72, 0.0, 0.28],
  ruins: [0.38, 0.37, 0.25],
  ruined: [0.12, 0.62, 0.26],
};
