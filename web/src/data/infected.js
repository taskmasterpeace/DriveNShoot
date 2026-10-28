// The infected, as rows (canon: docs/design/THE_INFECTED.md §3.1 and the counterplay matrix §3.4; the web engine's
// version: docs/design/WEB_ZOMBIES.md). Failed citizens, not monsters. THREE BREEDS (decision D1, WEB_DEPTH_PLAN §3):
// the Shambler, the Sprinter and the Echo. The Choir-Touched is a rare SITE SPECIAL, not a breed (`site: true`).
// Every number is a knob for systems/zombies.js; validateInfected() is what the World Forge and the selftest run.

// SHAMBLER   the horde body. Slow, many, and dangerous only together: alone it thumps a door for a long time.
// SPRINTER   identical to a shambler until it breaks (same name, same walk) - the uncertainty is the point. It breaks
//            when someone living moves faster than `trigger` m/s inside its `ear` (walk is safe, a run is not) or a
//            noise goes off inside it: `burst` s at `burstSpeed`, claws x`claw`, then `overheat` s bent double and
//            wheezing (the window), then dormant again after `rearm` s. A horde rolls its sprinters by its runners share.
// ECHO       the worker: works boarded windows, locked and barricaded doors (much harder than a shambler), never
//            advances on anyone, only works unobserved (`watch` m, `cone` degrees) and freezes mid-motion while watched.
//            It repeats its phrase every `phrase` s, heard to `hear` m, and the phrase CALLS: the infected within `call`
//            m that know of nothing better come to where it works (law 6: they heard it, and that is all they know).
// CHOIR      the Choir-Touched (site special): a signal amplifier, never a commander. Hums to `hum` m; every infected
//            within `aura` m moves x`speed` and shares what IT perceives. Kill it and the hum and the aura die together.
//
// The shared blocks (every breed row carries all of them; a site special may leave out what it never does):
//   sense    what it can know, and for how long (law 6: an infected acts only on what it saw, heard or smelled):
//              sight / night   m it picks out a standing body by day / in the dark (a lit body: `lit` m at night)
//              cone            degrees either side of its facing it sees (inside `near` m it notices anything)
//              steps           x the footstep radius it hears (FOOTSTEPS below; prone is silent)
//              hear            x a noise's radius it hears
//              smell           m it smells the living (no sight needed; the player x1.25)
//              memory          s a last-known spot stays worth walking to; then it is forgotten
//              search / searchR  s spent searching round a cold last-known spot, within that many m
//              scatter         m a HEARD spot is off by (a sound gives a direction and a rough distance, never a point)
//   door     { every, dmg }   one thump every `every` s takes `dmg` off a locked door's lock (planks and furniture add
//                             theirs: data/gadgets.js BARRICADES). Only with something remembered behind it (an Echo
//                             works one regardless: that is what it is)
//   legs     hp of legs: rolled leg hits (data/gear.js HIT_ODDS) past it and it is a CRAWLER (`crawl` m/s, low, bites ankles)
//   lunge    { at, speed, t, cool }  a target it can see this close and it throws itself the last metres
//   fall     { dmg, chance, getUp }  a hit this hard knocks it down `chance` of the time; it gets up after getUp s
//            (and grabs: anyone inside `grab` m of it as it rises is lunged at)
//   fire     m it keeps from a fire (patches, burning cars) - a sprinter mid-burst runs through
//   light    m at night it comes to a light it can see (a flashlight, headlights, a flare, a fire) when it knows of
//            nothing better
export const INFECTED = {
  shambler: {
    name: 'Shambler', hp: 75, speed: [2.0, 2.7], claw: 13,
    sense: { sight: 32, night: 13, lit: 38, cone: 65, near: 5, steps: 1, hear: 1, smell: 4.5, memory: 25, search: 12, searchR: 7, scatter: 5 },
    door: { every: 2.2, dmg: 6 }, legs: 34, crawl: 0.55,
    lunge: { at: 2.8, speed: 5.5, t: 0.4, cool: 3.5 },
    fall: { dmg: 28, chance: 0.5, getUp: 2.4, grab: 1.6 },
    fire: 6, light: 70,
  },
  sprinter: {
    name: 'Shambler', hp: 55, trigger: 5.0, ear: 20, burst: 6, burstSpeed: 9, claw: 1.4, overheat: 3, rearm: 4,
    sense: { sight: 34, night: 14, lit: 40, cone: 70, near: 5, steps: 1.3, hear: 1.2, smell: 4.5, memory: 30, search: 14, searchR: 9, scatter: 4 },
    door: { every: 2.0, dmg: 6 }, legs: 26, crawl: 0.7,
    lunge: { at: 4.0, speed: 10, t: 0.4, cool: 2.5 },
    fall: { dmg: 24, chance: 0.6, getUp: 1.6, grab: 2.0 },
    fire: 6, light: 70,
  },
  echo: {
    name: 'Echo', hp: 75, reach: 12, workEvery: 1.6, boards: 9, watch: 30, cone: 55, phrase: 5.5, hear: 25, call: 32, line: "where's my— where's my—",
    sense: { sight: 26, night: 12, lit: 34, cone: 60, near: 4, steps: 1, hear: 1, smell: 3, memory: 90, search: 20, searchR: 6, scatter: 3 },
    door: { every: 1.4, dmg: 26 }, legs: 40, crawl: 0.45,
    lunge: null,
    fall: { dmg: 30, chance: 0.4, getUp: 2.0, grab: 0 },
    fire: 8, light: 0,
  },
  choir: {
    name: 'Choir-Touched', hp: 90, hum: 45, humEvery: 2.6, aura: 30, speed: 1.25, herd: [5, 8], site: true,
    sense: { sight: 45, night: 30, lit: 45, cone: 180, near: 45, steps: 1.5, hear: 1.5, smell: 6, memory: 40, search: 0, searchR: 0, scatter: 2 },
  },
};

// The three breeds, in the order a horde is made of them.
export const BREEDS = ['shambler', 'sprinter', 'echo'];

// How far the living's own feet carry (m), by what they are doing: the infected hear it (x their `sense.steps`).
// A car's engine is its own noise (main.js / zombies.update), not this.
export const FOOTSTEPS = { stand: 0, walk: 6, run: 16, crouch: 2, prone: 0, swim: 3, runAt: 5.0 };

// Hordes that hear a big noise (systems/overrun.js records and the bodies standing in the street): a walking horde
// within noise r x `perR` turns to it, day or night, and WALKS there on the world clock at OVERRUN.horde.speed (no
// teleport); it stays `linger` s, then goes back to what it was doing. Only noises of `minR` m or more carry that far.
export const DRIFT = { perR: 8, minR: 30, arrive: 25, linger: 90 };

// Who is inside a building when the street is generated, by its kind (Zomboid's lesson: where the dead are says who
// they were). `n` [min, max] bodies on the street storey, `mix` the breed shares. Read by zombies.occupy().
export const INSIDE = {
  house: { n: [0, 2], mix: { shambler: 0.8, sprinter: 0.15, echo: 0.05 } },
  bungalow: { n: [0, 2], mix: { shambler: 0.8, sprinter: 0.15, echo: 0.05 } },
  hospital: { n: [3, 7], mix: { shambler: 0.75, sprinter: 0.2, echo: 0.05 } },
  clinic: { n: [2, 4], mix: { shambler: 0.75, sprinter: 0.2, echo: 0.05 } },
  school: { n: [2, 6], mix: { shambler: 0.6, sprinter: 0.35, echo: 0.05 } },
  church: { n: [1, 5], mix: { shambler: 0.85, sprinter: 0.05, echo: 0.1 } },
  police: { n: [1, 3], mix: { shambler: 0.7, sprinter: 0.25, echo: 0.05 } },
  warehouse: { n: [0, 3], mix: { shambler: 0.7, sprinter: 0.1, echo: 0.2 } },
  motel: { n: [1, 4], mix: { shambler: 0.75, sprinter: 0.15, echo: 0.1 } },
  store: { n: [1, 3], mix: { shambler: 0.8, sprinter: 0.15, echo: 0.05 } },
  default: { n: [0, 2], mix: { shambler: 0.85, sprinter: 0.15, echo: 0 } },
};

// Choir sites (canon §3.2: a silence with an address). The web world has one so far: a dead relay mast in the Glass
// Flats ruins. A herd stands there at night with one Choir-Touched facing the mast; it comes back the next night.
//   near: the player must be this close for the site to wake (it never spawns in view: see zombies.js).
export const CHOIR_SITES = [
  { id: 'dead_relay', name: 'the dead relay', x: -330, z: -250, near: 160 },
];

// The rows' shape, for the World Forge and the selftest. [] = valid.
export function validateInfected(rows = INFECTED, breeds = BREEDS, steps = FOOTSTEPS, drift = DRIFT, inside = INSIDE) {
  const bad = [];
  const num = (k, v, lo, hi) => { if (!(typeof v === 'number' && v >= lo && v <= hi)) bad.push(`${k} = ${v} out of ${lo}..${hi}`); };
  if (breeds.length !== 3) bad.push(`there are ${breeds.length} breeds; D1 says 3`);
  for (const b of breeds) if (!rows[b]) bad.push(`breed ${b} has no row`);
  for (const [k, r] of Object.entries(rows)) {
    const breed = breeds.includes(k);
    if (!breed && !r.site) bad.push(`${k}: neither a breed nor a site special`);
    if (breed && r.site) bad.push(`${k}: a breed can't be a site special`);
    if (typeof r.name !== 'string' || !r.name) bad.push(`${k}: no name`);
    num(`${k}.hp`, r.hp, 10, 400);
    const s = r.sense;
    if (!s) { bad.push(`${k}: no sense block`); continue; }
    num(`${k}.sense.sight`, s.sight, 5, 80); num(`${k}.sense.night`, s.night, 2, s.sight); num(`${k}.sense.lit`, s.lit, s.night, 80);
    num(`${k}.sense.cone`, s.cone, 20, 180); num(`${k}.sense.near`, s.near, 0, 60);
    num(`${k}.sense.steps`, s.steps, 0, 3); num(`${k}.sense.hear`, s.hear, 0, 3); num(`${k}.sense.smell`, s.smell, 0, 20);
    num(`${k}.sense.memory`, s.memory, 1, 600); num(`${k}.sense.search`, s.search, 0, 120); num(`${k}.sense.searchR`, s.searchR, 0, 30);
    num(`${k}.sense.scatter`, s.scatter, 0, 20);
    if (!breed) continue;
    if (k !== 'echo') { num(`${k}.speed[0]`, (r.speed ?? rows.shambler.speed)[0], 0.5, 4); }
    num(`${k}.door.every`, r.door?.every, 0.3, 10); num(`${k}.door.dmg`, r.door?.dmg, 1, 200);
    num(`${k}.legs`, r.legs, 5, 200); num(`${k}.crawl`, r.crawl, 0.1, 2);
    if (r.lunge) { num(`${k}.lunge.at`, r.lunge.at, 1.3, 8); num(`${k}.lunge.speed`, r.lunge.speed, 2, 14); num(`${k}.lunge.t`, r.lunge.t, 0.1, 1.5); num(`${k}.lunge.cool`, r.lunge.cool, 0.5, 20); }
    num(`${k}.fall.dmg`, r.fall?.dmg, 5, 200); num(`${k}.fall.chance`, r.fall?.chance, 0, 1); num(`${k}.fall.getUp`, r.fall?.getUp, 0.3, 10); num(`${k}.fall.grab`, r.fall?.grab, 0, 4);
    num(`${k}.fire`, r.fire, 0, 30); num(`${k}.light`, r.light, 0, 200);
  }
  const sp = rows.sprinter, ec = rows.echo, sh = rows.shambler;
  if (sp) { num('sprinter.trigger', sp.trigger, 4.7, 7.5); num('sprinter.ear', sp.ear, 5, 40); num('sprinter.burstSpeed', sp.burstSpeed, 5, 14); }
  if (ec && sh && !(ec.door.dmg / ec.door.every > (sh.door.dmg / sh.door.every) * 2)) bad.push('an Echo must work a door more than twice as hard as a shambler');
  if (ec) { num('echo.call', ec.call, 0, 80); num('echo.watch', ec.watch, 10, 80); }
  for (const k of ['walk', 'run', 'crouch', 'swim', 'runAt']) num(`FOOTSTEPS.${k}`, steps[k], 0, 40);
  if (steps.prone !== 0) bad.push('a prone body makes no footsteps');
  if (!(steps.crouch < steps.walk && steps.walk < steps.run)) bad.push('footsteps must go crouch < walk < run');
  num('DRIFT.perR', drift.perR, 1, 30); num('DRIFT.minR', drift.minR, 5, 200); num('DRIFT.arrive', drift.arrive, 5, 80); num('DRIFT.linger', drift.linger, 0, 600);
  for (const [k, b] of Object.entries(inside)) {
    if (!(b.n?.[0] >= 0 && b.n[1] >= b.n[0] && b.n[1] <= 12)) bad.push(`INSIDE.${k}.n`);
    const tot = Object.entries(b.mix ?? {}).reduce((s, [m, v]) => { if (!breeds.includes(m)) bad.push(`INSIDE.${k}: ${m} is not a breed`); return s + v; }, 0);
    if (Math.abs(tot - 1) > 1e-6) bad.push(`INSIDE.${k}.mix sums to ${tot}`);
  }
  return bad;
}
