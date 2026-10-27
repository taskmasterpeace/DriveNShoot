// THE WILDS' COMMANDS rows (docs/design/WEB_WILDS.md; systems/outdoors.js, data/outdoors.js): track, hunt, fish,
// forage, trap, camp, outdoors. buildCommands() in api.js spreads these into COMMANDS like the fauna layer's rows
// (fauna, faunaSpawn, faunaKill, butcher, cook live in faunatools.js).
import { FISH, FORAGE, TALENTS, TRACK_KINDS } from '../data/outdoors.js';
import { SPECIES } from '../data/fauna.js';
import { ITEMS } from '../data/items.js';

const r1 = (v) => Math.round(v * 10) / 10;

export function outdoorsCommands(api, need) {
  const g = api.g;
  const P = () => g.player;
  const O = () => g.outdoors;
  const at = (s, x, z) => {
    if (typeof s === 'string' && s.includes(',')) { const [a, b] = s.split(',').map(Number); if (Number.isFinite(a) && Number.isFinite(b)) return { x: a, z: b }; }
    return { x: Number.isFinite(x) ? x : P().x, z: Number.isFinite(z) ? z : P().z };
  };
  // Step the game until fn() is true or s real seconds pass (a cast's wait, a search).
  const until = async (fn, s) => { const t0 = g.time; while (!fn() && g.time - t0 < s) await api._step(6); return fn(); };

  async function fishRun({ react, casts, set, check, all, force }) {
    const S = O(), inv = g.inventory;
    if (force) { for (const [id, n] of [['fishing_rod', 1], ['fish_hook', 5], ['grubs', 10]]) if (inv.carried.count(id) < n) inv.stow(id, n - inv.carried.count(id)); }
    if (set) { if (force) inv.stow(set === 'net' ? 'gill_net' : 'fish_trap', 1); const r = S.setFishTrap(set); need(r.ok, r.why); return r; }
    if (check) { const r = S.checkTraps(all); need(r.ok, r.why); return r; }
    const log = [];
    for (let i = 0; i < casts; i++) {
      const c = S.cast();
      need(c.ok || log.length, c.why);
      if (!c.ok) { log.push({ cast: i + 1, why: c.why }); break; }
      const ok = await until(() => !S.fishing || S.fishing.phase === 'bite', c.wait + 2);
      if (!S.fishing) { log.push({ cast: i + 1, water: c.water, got: null, why: 'the line came in' }); continue; }
      if (!ok) { S.fishing = null; log.push({ cast: i + 1, water: c.water, got: null, why: 'no bite' }); continue; }
      await until(() => !S.fishing || S.fishing.bt >= react, react + 0.5);
      if (!S.fishing) { log.push({ cast: i + 1, water: c.water, got: null, why: 'it got away (too slow)' }); continue; }
      const r = S.strike();
      log.push({ cast: i + 1, water: c.water, waitS: r1(c.wait), got: r.items ?? null });
      if (r.items?.some((x) => !x.trash)) break;
    }
    const fish = log.flatMap((l) => l.got ?? []).filter((x) => !x.trash);
    return { casts: log.length, caught: fish.length > 0, fish: fish.map((x) => x.fish), log, skill: S.lv('fishing') };
  }

  return {
    track: {
      group: 'player', desc: `Read the ground (TRACKING): at="x,z" (or x= z=; default where you stand), radius= (default 14 m). Every mover leaves sign in one pool (${Object.keys(TRACK_KINDS).join(', ')}); what you can read is your tracking level against its age, the ground (sand and mud hold, rock and pavement barely) and the rain. One line per kind of maker: what, how many (the Count-the-feet talent; "more than one" before it), how fresh, which way it was heading, who is bleeding (Read-the-blood). follow=<id>: every print one maker left that you can still see, oldest first (a wounded animal's blood trail: kind=blood). dog=true puts your dogs on a trail (who= a maker's id, default the freshest sign near you): they follow it to its end and point. lay=<kind> stages sign (testing): who=, species=, age= (game hours old), n= prints along face= from x,z, step= m apart, bleed=true adds blood. level= reads as that tracking level instead of yours.`,
      args: { at: { type: 'string' }, x: { type: 'number' }, z: { type: 'number' }, radius: { type: 'number', default: 14 }, follow: { type: 'string' }, kind: { type: 'string' }, dog: { type: 'boolean' }, who: { type: 'string' }, lay: { type: 'string' }, species: { type: 'string' }, age: { type: 'number', default: 0 }, n: { type: 'number', default: 1 }, face: { type: 'number', default: 0 }, step: { type: 'number', default: 1.6 }, bleed: { type: 'boolean' }, level: { type: 'number' } },
      run: async ({ at: s, x, z, radius, follow, kind, dog, who, lay, species, age, n, face, step, bleed, level }) => {
        const S = O(), p = at(s, x, z);
        if (lay) {
          need(TRACK_KINDS[lay], `unknown track kind ${lay}; kinds: ${Object.keys(TRACK_KINDS).join(', ')}`);
          const w = who ?? `staged${++S.seq}`, out = [];
          for (let i = 0; i < n; i++) {
            const px = p.x + Math.sin(face) * step * i, pz = p.z + Math.cos(face) * step * i, ageI = Math.max(0, age - (n > 1 ? (i / (n - 1)) * Math.min(age, 0.05 * n) : 0)); // the far end a little fresher
            S.lay(lay, px, pz, face, w, species ?? (lay === 'boot' ? 'person' : lay), ageI);
            if (bleed) S.lay('blood', px + 0.2, pz, face, w, species ?? lay, ageI);
            out.push({ x: r1(px), z: r1(pz), ageH: +ageI.toFixed(3) });
          }
          return { laid: out.length, who: w, kind: lay, first: out[0], last: out[out.length - 1] };
        }
        if (dog) { const r = S.trackOrder(who ?? null, p); need(r.ok, r.why); return r; }
        if (follow) {
          const L = level ?? S.lv('tracking'), t = S.trail(follow, L, kind ?? null);
          return { who: follow, level: L, prints: t.length, blood: t.filter((o) => o.kind === 'blood').length, trail: t.map(({ t: _, ...o }) => o), from: t[0] ?? null, to: t[t.length - 1] ?? null };
        }
        const L = level ?? S.lv('tracking');
        const lines = S.read(p.x, p.z, radius, L, level !== undefined ? +(L >= 3) : S.fx.countFeet, level !== undefined ? +(L >= 6) : S.fx.readBlood);
        return { at: { x: r1(p.x), z: r1(p.z) }, level: L, biome: S.biomeAt(p.x, p.z), raining: S.raining(), sign: lines, said: lines.length ? lines.map((l) => l.text).join(' | ') : 'nothing you can read here' };
      },
    },
    hunt: {
      group: 'player', desc: 'The hunt: no args (status=true) - your hunting skill and talents, what is about (game within radius= 60 m: live, aloft, carcasses to butcher), what you have done (kills, birds shot down, butchered). shoot=<animal id | bird> aims the mouse at it (a bird in the air: at its height, the way the cursor on it would) and fires your gun shots= times (default 1), stepping the sim: returns hit/killed and, for a bird, where it came down. Shotguns are the bird gun.',
      args: { status: { type: 'boolean' }, radius: { type: 'number', default: 60 }, shoot: { type: 'string' }, shots: { type: 'number', default: 1 } },
      run: async ({ radius, shoot, shots }) => {
        const F = g.fauna, S = O(), p = P();
        if (shoot) {
          const a = shoot === 'bird' ? F.live.filter((o) => o.form === 'bird' && o.air && !o.dead).sort((u, v) => Math.hypot(u.x - p.x, u.z - p.z) - Math.hypot(v.x - p.x, v.z - p.z))[0] : F.live.find((o) => o.id === shoot);
          need(a, `no animal ${shoot}${shoot === 'bird' ? ' in the air' : ''}`);
          need(!a.dead, `${a.S.name} is already dead`);
          need(p.alive && p.weapon, 'you need a gun in your hands');
          const seq = g.eventSeq, hp0 = a.hp;
          try {
            for (let i = 0; i < shots && !a.dead; i++) {
              g.aimOverride = { x: a.x, z: a.z, y: a.air ? a.alt : 0 }; g.arms?.setStance?.('raised');
              await api._step(8);
              g.aimOverride = { x: a.x, z: a.z, y: a.air ? a.alt : 0 };
              const r = await api.call('fire', { x: a.x, z: a.z, shots: 1 });
              if (r && r.ok === false) need(false, r.error);
              await api._step(4);
            }
          } finally { g.aimOverride = null; }
          await until(() => !a.dead || (!a.air && a.y <= 0.02), 4);
          const hits = g.events.filter((e) => e.seq > seq && e.type === 'faunaHit' && e.id === a.id).length;
          return { id: a.id, species: a.sp, hits, hp: Math.max(0, Math.round(a.hp)), hp0: Math.round(hp0), killed: a.dead, down: a.dead ? { x: r1(a.x), z: r1(a.z), y: +a.y.toFixed(2), onGround: a.y <= 0.02 } : null, alt: a.form === 'bird' ? r1(a.alt) : undefined };
        }
        const near = F.live.filter((a) => Math.hypot(a.x - p.x, a.z - p.z) <= radius);
        return {
          skill: S.lv('hunting'), talents: S.talents().filter((t) => t.skill === 'hunting'),
          about: near.filter((a) => !a.dead).map((a) => ({ id: a.id, species: a.sp, dist: r1(Math.hypot(a.x - p.x, a.z - p.z)), aloft: a.air ? r1(a.alt) : undefined, state: a.state, hp: Math.round(a.hp), bleeding: a.hp < a.maxHp * 0.7 || undefined })),
          carcasses: near.filter((a) => a.dead && !a.butchered && a.S.butcher).map((a) => ({ id: a.id, species: a.sp, dist: r1(Math.hypot(a.x - p.x, a.z - p.z)) })),
          done: { killed: F.stats.killed, butchered: F.stats.butchered, birdsDowned: S.stats.birdsDowned, fetched: S.stats.fetched },
          gun: p.weapon ?? null,
        };
      },
    },
    fish: {
      group: 'player', desc: `Fish (a rod, a hook and bait on you, facing water: the water authority says what kind - river, lake, creek, canal, swamp, sea; a dry wash has none): casts, waits for the bite (stepping the sim) and strikes react= seconds after it (default 0.3; the window is ~0.65 s + 0.04 a FISHING level: too slow and it gets away, sometimes with the hook). casts= tries up to that many times until something lands. Fish by water and region: ${FISH.map((f) => f.id).join(', ')}; now and then a boot. set=fishtrap|net sinks a trap ahead of you that fills on the game clock; check=true empties the traps within reach (all=true: every one). face= turns you first (radians). force=true gives you a rod, hooks and grubs (testing).`,
      args: { react: { type: 'number', default: 0.3 }, casts: { type: 'number', default: 1 }, set: { type: 'string' }, check: { type: 'boolean' }, all: { type: 'boolean' }, face: { type: 'number' }, force: { type: 'boolean' } },
      run: async ({ react, casts, set, check, all, face, force }) => {
        // face=: look that way, the aim held there while the line is out (as a player's mouse would be).
        const hold = Number.isFinite(face) ? { x: P().x + Math.sin(face) * 6, z: P().z + Math.cos(face) * 6 } : null;
        if (hold) { g.aimOverride = hold; await api._step(12); P().face = face; }
        try { return await fishRun({ react, casts, set, check, all, force }); } finally { if (hold) g.aimOverride = null; }
      },
    },
    forage: {
      group: 'player', desc: `Search the ground where you stand (FORAGING; crouch + E in the game): ~6 s standing still, then what the biome grows turns up by its chance x your skill x how picked-over the patch is (patches grow back on the game clock). Rows: ${FORAGE.map((r) => r.item).join(', ')}. Pale caps are poison: without the Mushroom-lore talent you may pick them. times= searches in a row (moving 30 m on between them with spread=true).`,
      args: { times: { type: 'number', default: 1 }, spread: { type: 'boolean', default: false } },
      run: async ({ times, spread }) => {
        const S = O(), out = [];
        for (let i = 0; i < times; i++) {
          if (spread && i) { const p = P(); p.x += 30; p.vx = p.vz = 0; await api._step(2); }
          const seq = g.eventSeq, r = S.startForage();
          need(r.ok, r.why);
          await until(() => !S.job, r.seconds + 2);
          const e = g.events.find((x) => x.seq > seq && x.type === 'foraged');
          need(e || out.length, 'the search stopped before it was done (you moved?)');
          if (e) out.push({ biome: e.biome, region: e.region, items: e.items, left: e.left, patch: e.patch });
        }
        return { searches: out.length, found: out.flatMap((o) => o.items), left: out.flatMap((o) => o.left), results: out, skill: S.lv('foraging') };
      },
    },
    trap: {
      group: 'player', desc: 'Trapping: set=snare puts a snare (snare wire from your pack) on the ground a stride ahead; it fills on the game clock while you are away (a chance an hour by the ground\'s small game x your TRAPPING skill x its talents). check=true empties the traps within reach (all=true every one: snares and fish traps). list (no args): every trap of yours, what it holds right now. force=true gives you a snare wire first.',
      args: { set: { type: 'string' }, check: { type: 'boolean' }, all: { type: 'boolean' }, force: { type: 'boolean' } },
      run: async ({ set, check, all, force }) => {
        const S = O();
        if (set) { need(set === 'snare', 'set=snare (fish traps and nets: fish set=fishtrap|net)'); if (force) g.inventory.stow('snare_wire', 1); const r = S.setSnare(); need(r.ok, r.why); return r; }
        if (check) { const r = S.checkTraps(all); need(r.ok, r.why); return r; }
        for (const t of S.traps) S.fill(t);
        return { traps: S.view().traps, skill: S.lv('trapping') };
      },
    },
    camp: {
      group: 'player', desc: 'The camp kit (living outside a city): build=firepit (3 deadwood; lit: cook on it, `cook`) | rack (4 deadwood: raw meat and fish dry into dried meat on the game clock) | catcher (a tarp: fills with rain, tops up your water). At the nearest within reach: fuel=true (a deadwood on the fire), hang=true (your raw meat onto the rack), take=true (the dried meat off it), fill=true (your bottles from the catcher). No args: every camp piece (fuel, rack, water). force=true gives you what a build costs first.',
      args: { build: { type: 'string' }, fuel: { type: 'boolean' }, hang: { type: 'boolean' }, take: { type: 'boolean' }, fill: { type: 'boolean' }, force: { type: 'boolean' } },
      run: async ({ build, fuel, hang, take, fill, force }) => {
        const S = O(), p = P();
        if (build) {
          if (force) for (const [id, n] of build === 'catcher' ? [['tarp', 1]] : [['deadwood', build === 'rack' ? 4 : 3]]) g.inventory.stow(id, n);
          const r = S.build(build); need(r.ok, r.why); return r;
        }
        const verb = fuel ? 'firepit' : hang || take ? 'rack' : fill ? 'catcher' : null;
        if (verb) {
          const o = S.campNear(p.x, p.z, verb);
          need(o, `no ${verb} of yours within reach`);
          const r = fuel ? S.fuel(o) : hang ? S.rackLoad(o) : take ? S.rackTake(o) : S.refill(o);
          need(r.ok, r.why);
          return { ...r, camp: S.campView(o) };
        }
        return { camp: S.view().camp, skill: S.lv('outdoorsman') };
      },
    },
    outdoors: {
      group: 'observe', desc: 'Living off the land at a glance (docs/design/WEB_WILDS.md): the eight outdoor skill levels (tracking, hunting, fishing, foraging, trapping, animal handling, cooking, outdoorsman), the talents open and every talent row (talents=true), the numbers they change (fx), the track pool, a line in the water, a search in progress, the camp, the traps, the counts. level=<skill>:<n> sets a skill\'s level (testing; xp kept at 0).',
      args: { talents: { type: 'boolean' }, level: { type: 'string' } },
      run: async ({ talents, level }) => {
        const S = O();
        if (level) {
          const [k, v] = level.split(':'); const n = Math.max(0, Math.min(10, Math.round(Number(v))));
          need(g.skillsSys?.lv && k in g.skillsSys.lv, `unknown skill ${k}`); need(Number.isFinite(n), 'level=<skill>:<0..10>');
          g.skillsSys.lv[k] = n; g.skillsSys.xp[k] = 0; S.recompute();
        }
        const v = S.view();
        return talents ? { ...v, rows: TALENTS.map((t) => ({ ...t, open: S.lv(t.skill) >= t.at })) } : v;
      },
    },
  };
}
// The items and species these commands mention, for a reader of the generated COMMANDS.md.
export const OUTDOOR_REFS = { fish: FISH.map((f) => ITEMS[f.item]?.name), birds: ['crow', 'dove', 'duck', 'goose', 'vulture', 'heron'].filter((s) => SPECIES[s]) };
