// The fauna layer's COMMANDS rows (docs/design/WEB_FAUNA.md; systems/fauna.js, data/fauna.js): fauna (the list, what is
// near, one animal, the formula for a chunk, on/off), faunaSpawn, faunaKill, butcher, cook. buildCommands() in api.js
// spreads these into COMMANDS, so help, the CLI, the MCP tools and docs/COMMANDS.md see them like any other row.
import { SPECIES, FAUNA_RULES } from '../data/fauna.js';
import { ITEMS } from '../data/items.js';

export function faunaCommands(api, need) {
  const g = api.g;
  const P = () => g.player;
  const F = () => g.fauna;
  const byId = (id) => {
    const L = F().live, p = P();
    if (id === 'nearest' || id === 'carcass') { let b = null, bd = Infinity; for (const a of L) { if (id === 'carcass' ? !a.dead || a.butchered : a.dead) continue; const k = Math.hypot(a.x - p.x, a.z - p.z); if (k < bd) { bd = k; b = a; } } return b; }
    return L.find((a) => a.id === id) ?? null;
  };
  const near = (radius, species) => F().live.filter((a) => (!species || a.sp === species) && Math.hypot(a.x - P().x, a.z - P().z) <= radius).sort((a, b) => Math.hypot(a.x - P().x, a.z - P().z) - Math.hypot(b.x - P().x, b.z - P().z));

  return {
    fauna: {
      group: 'world', desc: 'Regional animals (data/fauna.js, docs/design/WEB_FAUNA.md): L5 of the world. No args: the summary (live bodies by species, chunk records, the budget, the vultures\' bodies, the butchering in progress, counts: spawned, killed, butchered, roadkill, rattles, strikes, lunges, death rolls, scatters, yips, charges, cooked) and every animal within radius (default 80 m): id, species, form, temper, state (graze, alert, frozen, flee, roam, rest, shy, stalk, attack, backoff, feed, eat, warn, charge, wheel, coiled, crawl, rattle, gape, bask, lurk, lunge, roll, slide, haulout, return, dive, circle, inbound, landing, soar, wade, perch, scatter, fly, swarm, hover, settled, trapped, carcass, bones), hp, distance, its group (mode, quarry), its threat, lit (1 = in your flashlight, 2 = headlights). species= filters. id=<animal id | nearest | carcass> for one. density=true: the formula for the chunk at x,z (default yours): region, biome letters, hot and water-edge shares, phase, presence, and per habitat row perKm2 x km2 x share x time factor x (1 - presence) = expected (hour= and presence= override). on=false stops the director and takes every body away (records kept); on=true starts it again. clear=true takes the bodies away now.',
      args: { id: { type: 'string' }, radius: { type: 'number', default: 80 }, species: { type: 'string' }, density: { type: 'boolean' }, x: { type: 'number' }, z: { type: 'number' }, hour: { type: 'number' }, presence: { type: 'number' }, on: { type: 'boolean' }, clear: { type: 'boolean' } },
      run: async ({ id, radius, species, density, x, z, hour, presence, on, clear }) => {
        const S = F();
        if (on !== undefined) { S.enabled = on; if (!on) S.clear(); }
        if (clear) S.clear();
        if (density) {
          const px = Number.isFinite(x) ? x : P().x, pz = Number.isFinite(z) ? z : P().z, C = FAUNA_RULES.chunk;
          return { density: S.density(Math.floor(px / C), Math.floor(pz / C), { hour, presence }) };
        }
        if (id) { const a = byId(id); need(a, `no animal ${id}`); return { animal: S.view(a) }; }
        if (species) need(SPECIES[species], `unknown species ${species}; species: ${Object.keys(SPECIES).join(', ')}`);
        return { ...S.summary(), animals: near(radius, species).map((a) => S.view(a)) };
      },
    },
    faunaSpawn: {
      group: 'world', desc: `Put animals in the world now (testing, staging): species=<${Object.keys(SPECIES).filter((k) => SPECIES[k].group).join('|')}> at x,z (default 25 m ahead of you), count= (default its smallest group). hold=true pins them where they stand (a photo, a target); buck=true gives the first deer its rack. They are records in the chunk they stand in, like any.`,
      args: { species: { type: 'string', required: true }, x: { type: 'number' }, z: { type: 'number' }, count: { type: 'number' }, hold: { type: 'boolean', default: false }, buck: { type: 'boolean' } },
      run: async ({ species, x, z, count, hold, buck }) => {
        need(SPECIES[species]?.group, `unknown species ${species}; species: ${Object.keys(SPECIES).filter((k) => SPECIES[k].group).join(', ')}`);
        const p = P(), px = Number.isFinite(x) ? x : p.x + Math.sin(p.face) * 25, pz = Number.isFinite(z) ? z : p.z + Math.cos(p.face) * 25;
        const list = F().spawn(species, px, pz, count ?? null, { hold, buck, test: true });
        need(list.length, `no room: the ${SPECIES[species].form} budget is full`);
        return { spawned: list.map((a) => F().view(a)) };
      },
    },
    faunaKill: {
      group: 'world', desc: 'Kill animals (testing): id=<animal id | nearest>, or species= within radius (default 30 m), or all=true every live one. They become carcasses where they stand (butcher them with E or `butcher`).',
      args: { id: { type: 'string' }, species: { type: 'string' }, radius: { type: 'number', default: 30 }, all: { type: 'boolean' } },
      run: async ({ id, species, radius, all }) => {
        const S = F();
        const list = id ? [byId(id)].filter(Boolean) : all ? S.live.filter((a) => !a.dead) : near(radius, species).filter((a) => !a.dead);
        need(list.length, id ? `no animal ${id}` : 'nothing alive there');
        for (const a of list) S.hurt(a, 1e6, null, 0, 0, 'bullet');
        return { killed: list.map((a) => a.id) };
      },
    },
    butcher: {
      group: 'player', desc: 'Butcher a carcass (the E key at a dead animal with a blade on you: a knife, a machete, an axe): id=<animal id> or the nearest carcass. It takes the species\' butcher time, shortened by dexterity (a machete is quicker, an axe slower); you must stay put (moving off ends it). Steps the game until it is done and returns what came off it (meat, a hide - torn on a failed skill check - bone) into your pack (what will not fit at your feet). Raw meat spoils on the game clock: cook it (`cook`). You must be within 2.4 m (force=true puts you beside it, testing).',
      args: { id: { type: 'string', default: 'carcass' }, force: { type: 'boolean', default: false } },
      run: async ({ id, force }) => {
        const S = F(), a = byId(id), p = P();
        need(a, `no carcass ${id === 'carcass' ? 'near you' : id}`);
        need(a.dead && !a.butchered, `${a.S.name} ${a.dead ? 'is already butchered' : 'is alive'}`);
        if (force) { p.x = a.x + 1.2; p.z = a.z; p.vx = p.vz = 0; }
        const k = Math.hypot(a.x - p.x, a.z - p.z);
        need(k <= FAUNA_RULES.butcher.reach, `the ${a.S.name.toLowerCase()} is ${k.toFixed(1)} m away: stand within ${FAUNA_RULES.butcher.reach} m (moveTo x=${a.x.toFixed(1)} z=${a.z.toFixed(1)})`);
        const r = S.startButcher(a);
        need(r.ok, r.why);
        const t0 = g.time, seq0 = g.eventSeq;
        while (S.job && g.time - t0 < r.seconds + 5) await api._step(15);
        const ev = g.events.find((e) => e.seq > seq0 && e.type === 'butchered' && e.id === a.id);
        need(ev, 'the butchering stopped before it was done');
        return { butchered: a.id, species: a.sp, seconds: ev.seconds, blade: ev.blade, items: ev.items, hide: ev.hide, carrying: ev.items.map((x) => ({ item: x.item, carried: g.inventory.carried.count(x.item) })) };
      },
    },
    cook: {
      group: 'player', desc: 'Cook the raw meat you carry (E at a fire with raw meat on you): a fire within reach (a flare you struck, a molotov\'s fire, a burning car) or a camped RV\'s stove. Each raw cut becomes its cooked one (venison, roast pork, cooked game, fried gator), fresh again on the clock and worth far more food. light=true strikes a flare at your feet first (testing: no flare needed).',
      args: { light: { type: 'boolean', default: false } },
      run: async ({ light }) => {
        const S = F(), p = P();
        if (light) g.throwables.startFire(p.x + Math.sin(p.face) * 0.9, p.z + Math.cos(p.face) * 0.9, 0.7, 60, p);
        const r = S.cook();
        need(r.ok, r.why);
        return { cooked: r.items, source: r.source, carrying: r.items.map((x) => ({ item: x.to, name: ITEMS[x.to].name, carried: g.inventory.carried.count(x.to) })) };
      },
    },
  };
}
