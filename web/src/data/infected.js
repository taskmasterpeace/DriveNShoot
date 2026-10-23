// The infected, as rows (canon: docs/design/THE_INFECTED.md §3.1 and the counterplay matrix §3.4). Failed citizens,
// not monsters: most are shamblers; one in a handful only LOOKS like one. Every number is a knob for systems/zombies.js.

// SHAMBLER   the herd. Smells the living out to `smell` m and comes at its own pace.
// SPRINTER   identical to a shambler until it breaks (same name, same walk) - the uncertainty is the point. It breaks
//            when someone living moves faster than `trigger` m/s inside its ear (walk is safe, a run is not) or a
//            shot goes off inside it: `burst` s at `burstSpeed`, claws x`claw`, then `overheat` s bent double and
//            wheezing (the window), then dormant again after `rearm` s. A horde rolls its sprinters by the share it
//            is given (the `horde` command's runners=).
// ECHO       a worker that waits: always AT something (a boarded window, a locked door), never advancing on anyone.
//            It works only while unobserved (`watch`: within that distance, inside the player's sight line, within
//            `cone` degrees of where they are looking) and freezes mid-motion while watched. Its phrase loops every
//            `phrase` s, heard to `hear` m: the approach tell. It never says whether it remembers.
// CHOIR      the Choir-Touched: a signal amplifier, never a commander. Only at a choir site; hums to `hum` m (the
//            warning outranges the danger); every infected within `aura` m moves x`speed` and shares its loudest
//            target. Kill it and the hum and the aura die in the same frame.
export const INFECTED = {
  shambler: { name: 'Shambler', hp: 75, speed: [2.0, 2.7], smell: 45, claw: 13 },
  sprinter: { name: 'Shambler', hp: 55, trigger: 5.0, ear: 20, burst: 6, burstSpeed: 9, claw: 1.4, overheat: 3, rearm: 4 },
  echo: { name: 'Echo', hp: 75, reach: 12, workEvery: 1.6, boards: 9, kickEvery: 3.5, watch: 30, cone: 55, phrase: 5.5, hear: 25, line: "where's my— where's my—" },
  choir: { name: 'Choir-Touched', hp: 90, hum: 45, humEvery: 2.6, aura: 30, speed: 1.25, herd: [5, 8] },
};

// Choir sites (canon §3.2: a silence with an address). The web world has one so far: a dead relay mast in the Glass
// Flats ruins. A herd stands there at night with one Choir-Touched facing the mast; it comes back the next night.
//   near: the player must be this close for the site to wake (it never spawns in view: see zombies.js).
export const CHOIR_SITES = [
  { id: 'dead_relay', name: 'the dead relay', x: -330, z: -250, near: 160 },
];
