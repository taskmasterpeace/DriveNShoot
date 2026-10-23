// THE GRAPEVINE, as rows (docs/design/WEB_GREYBORN_GRAPEVINE.md §3.3). Hunters counted with the infected who look like
// people. They watch, learn, strike only when their model of you says they win, run when it doesn't, and eat the dead.
// Their model of you is built ONLY from what a member saw or heard, or what another pack told them.
export const GRAPEVINE = {
  name: 'Grapevine',
  hp: 90, claw: 15, cutEvery: 0.7,
  pace: 1.6, stalk: 3.4, run: 7.4,       // m/s: drifting, keeping pace, the rush and the scatter
  sightDay: 60, sightNight: 22, lit: 2.2, // m; at night a lit flashlight shows you this many times farther off
  hear: 110,                              // m: a shot from where you stand
  scan: 0.25,                             // s between looks (each member, staggered)
  learnReloads: 2,                        // reloads seen before a reload means "now"
  minWatch: 4,                            // s of watching before they will ever strike
  wounded: 0.45,                          // your hp share at or under which you are wounded to them
  danger: { pistol: 1, smg: 1.7, shotgun: 1.6, rifle: 1.8, none: 0.4 },
  windows: { reloading: 0.15, dry: 0.1, asleep: 0.05, wounded: 0.5, alone: 0.85, lure: 0.4 },
  power: 0.75,                            // per member at full hp
  retreatAt: 0.6,                         // power under this share of your threat (no window) inside your reach: run
  regroup: 10,                            // s out of sight before stalking again
  watchedFor: 0.6,                        // s of you looking at a member before they break your line of sight
  stalkD: [18, 38],                       // clamp of reach + 8
  feedR: 70, safeR: 35, feedFor: 6,       // m, m, s
  toldW: 0.5, tellR: 600, tellNear: 60,   // the grapevine itself
  ambushAfter: 40,                        // s watched before they lay a lure
  skin: ['#b89a7c', '#8a6a52', '#c9a88a', '#6e5240', '#a07c5e'],
  shirt: ['#3a3630', '#4a4034', '#2e2b26', '#544638'], pants: ['#2a2724', '#3a342c', '#2f2a22'],
};

// Packs and their hunting grounds. A pack is promoted at night when you come within promoteR of its ground (or by day
// when it is already on you) and goes home past demoteR.
export const GRAPEVINE_PACKS = [
  { id: 'mile_marker', name: 'the mile-marker pack', x: -410, z: 30, size: 4, promoteR: 170, demoteR: 260, leash: 420 },
  { id: 'dry_wash', name: 'the dry-wash pack', x: -290, z: 425, size: 3, promoteR: 170, demoteR: 260, leash: 420 },
];
