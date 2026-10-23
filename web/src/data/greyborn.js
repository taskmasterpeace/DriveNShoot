// THE GREYBORN and their traps, as rows (docs/design/WEB_GREYBORN_GRAPEVINE.md §3.1-3.2). The Greyborn are infected
// that kept a society: a nest-town with trappers, watchers, kin and an elder. Every number here is a knob for
// systems/greyborn.js and systems/traps.js.

// Traps. spot: base spot range (m); r: trigger radius (m); disarm: hold-E seconds; slip: the chance a disarm sets it
// off; dmg: damage to whoever springs it; hold: seconds it keeps them (snare, pit); knock: seconds flat on the ground;
// noise: radius of the racket (tripwire); salvage: what a clean disarm gives you (data/items.js ids).
export const TRAPS = {
  snare: { name: 'Snare', spot: 4.0, r: 0.75, disarm: 2.2, slip: 0.15, dmg: 6, hold: 4, salvage: 'scrap' },
  deadfall: { name: 'Deadfall', spot: 5.5, r: 0.9, disarm: 3.0, slip: 0.2, dmg: 38, knock: 2.2, salvage: 'scrap' },
  pit: { name: 'Stake pit', spot: 3.2, r: 0.9, disarm: 2.6, slip: 0.1, dmg: 24, hold: 6, knock: 1.4 },
  tripwire: { name: 'Tripwire', spot: 2.6, r: 0.8, disarm: 1.6, slip: 0.25, dmg: 0, noise: 70, salvage: 'scrap' },
  bait: { name: 'Bait', spot: 9.0, r: 1.1, disarm: 1.0, slip: 0, dmg: 0, lure: 40 },
};
// How trapcraft grows (a skill learned by doing): xp per spot, per disarm, per time a trap got you. level = floor(√(xp/4)).
export const TRAPCRAFT = { spot: 1, disarm: 2, sprung: 1, max: 10, look: 0.5, cone: 70 };

// The roles. hp, claw (damage per cut), pace (m/s walking), run (m/s when defending), and the name on the tag.
export const GREYBORN = {
  skin: ['#8d8f88', '#7f827c', '#9a9b93', '#87857d'], // ash grey, never green: they are not the herd
  roles: {
    elder: { name: 'the Elder', hp: 160, claw: 16, pace: 0.9, run: 3.2 },
    watcher: { name: 'Greyborn Watcher', hp: 85, claw: 12, pace: 1.2, run: 4.6 },
    trapper: { name: 'Greyborn Trapper', hp: 80, claw: 12, pace: 1.4, run: 4.4 },
    kin: { name: 'Greyborn', hp: 80, claw: 13, pace: 1.1, run: 4.2 },
  },
  alarmFor: 0.8,      // seconds a watcher must see you before the call goes up (0 once they know you)
  watchR: 45,         // a watcher's eye by day (m); night takes 55% of it unless you carry a light
  call: 90,           // the alarm carries this far as a noise (the herd hears it too)
  relay: 90,          // seconds before a trapper re-lays a sprung or disarmed trap
  rememberDays: 7,    // how long a settlement knows an intruder it saw
};

// Settlements (nest-towns). x, z: the fire; territory/leash (m); promoteR/demoteR (m, like the ring's households);
// members by role; traps: the ring of trap spots (kind, angle in degrees, distance from the fire).
export const GREYBORN_TOWNS = [
  {
    id: 'ash_hollow', name: 'ASH HOLLOW', x: 125, z: 415, territory: 70, leash: 110, promoteR: 150, demoteR: 210,
    members: { elder: 1, watcher: 2, trapper: 2, kin: 4 },
    huts: 6,
    traps: [
      ['snare', 200, 38], ['tripwire', 225, 44], ['pit', 250, 40], ['snare', 275, 36], ['deadfall', 300, 42],
      ['tripwire', 160, 46], ['snare', 120, 40], ['pit', 90, 44], ['snare', 50, 38], ['tripwire', 20, 45],
      ['bait', 235, 30],
    ],
  },
];
