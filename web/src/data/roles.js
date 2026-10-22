// Roles (docs/design/WEB_ROLES.md): what the world calls you. Nobody picks a class at a menu: you become what you keep
// doing, the world notices, and it treats you accordingly. A role is a ROW (a pack's `roles` section or the registerRole
// command adds one): what earns it, what wears it away, its tiers, and what it opens. Several are held at once.
//
// RENOWN (0..100 per role) is how well the world knows you for it. A signal that matches an `earn` rule adds
//   pts · per · seen · skill scale · (1 − renown / soft)
// and a `wear` rule takes pts · per away flat. Time wears it too: once a role has gone `grace` game hours without
// earning anything, its renown halves every `halfLife` game days. A tier is reached at its line in `tiers`
// [rumoured, known, renowned] and lost only when renown falls under keep × that line (hysteresis: no flicker).
//
// SIGNALS (systems/roles.js routes them; a rule matches when every filter it names matches):
//   deed   one of your deeds, as the chronicle wrote it. Filters: verb, of (the target's faction), hostile (their
//          people shot you on sight), sd (they were shooting at you), named, night, cause ('vehicle', 'explosion'...),
//          src ('deed' | 'dialogue' | 'stunt'), owner (taken from somebody's shelf), identified (a witness put a name to
//          your face). per 'mag' multiplies by the deed's size. seen: what a deed counts for by who saw it
//          { id: named you, saw: saw something, none: nobody } (default ROLE_RULES.seen; the ghost turns it around).
//   drive  every second at the wheel: per 'km' (filter vehicle: types) or per 'fast' second over ROLE_RULES.fast m/s.
//   jump   a landing (stunts.js): named, cleared, grade (clean | rough | hard | crash), air (at least, seconds),
//          fresh (the first clear of that jump today), jump (its id).
//   search a container gone through for the first time (never a shop's shelf): kind - its loot table (kitchen |
//          bathroom | bedroom | garage | office | military | wreck | desert), or body for the dead.
//   loot   things taken out of a box nobody owns: per 'value' (scrip / div), at most `max` a time.
//   trade  a deal: g.roles.signal('trade', { faction, value, sell }) - the trade screen calls it. per 'value'.
//   event  a director outcome: tpl, outcome, near (you were within ROLE_RULES.near m of the town it hit).
//   hour   every game hour `while` a condition holds: pts per hour, never past `upTo` renown.
// CONDITIONS (`requires` gates a role: while one fails its effects are suspended; `while` gates an hour rule):
//   standing { faction: min } (the raw standing, never the role-coloured reading) · wanted (max stars) ·
//   skill { name: min } · carry { kind | ids, n | kg | value } · place (an id, or a prefix like 'camp_') ·
//   driving [types] · night · office (an id).
//
// OPENS (scaled by tier: ROLE_RULES.scale [none, rumoured, known, renowned]; numbers are the renowned values):
//   factions { id: { standing, hostile: true|false, from } } - added to the standing that faction acts on (its reading
//            of you), and from tier `from` (default known) whether they shoot on sight anyway or hold fire anyway
//   prices   { id | '*': mul } - what that faction's traders charge you: g.roles.priceMul(faction)
//   perks    idMul (how close a witness must be to name you) · carryKg · healMul (patching people up) · jumpPay
//            (named jumps pay) · fear (unarmed people run, from perks.fearFrom) · carjackFlee (drivers you pull out
//            run instead of fighting, from known)
//   director { template: weight } - how much likelier an event is while you hold the role
//   refusedBy { ids: [npc ids], from, line } - named people who will not deal with you (an NPC row's refuseRole
//            overrides the line)
//   greet    { faction | 'any': [lines] } - what a named person says when you walk up (your best-known role, known+);
//            an NPC row's roleLines[role] is their own voice
//   shout    [lines] - what a stranger calls out as you pass (known+)
//   radio    { name, digest, news: { known, renowned } } - how STATIC 1660 AM names you

export const ROLE_TIERS = ['none', 'rumoured', 'known', 'renowned'];

export const ROLE_RULES = {
  soft: 110,                 // gain · (1 − renown / soft): the last stretch to renowned comes slowest
  keep: 0.75,                // a tier is kept until renown falls under keep × its line
  grace: 12,                 // game hours a role rests before time starts wearing it
  scale: [0, 0.4, 0.7, 1],   // how much of what a role opens each tier gets
  seen: { id: 1, saw: 0.6, none: 0.35 },
  fast: 22,                  // m/s that counts as driving fast (about 50 mph)
  near: 150,                 // metres from a raided town that counts as standing with it
  sample: 1,                 // seconds of sim between odometer samples, gate checks and crowd reactions
  biasCap: 50,               // the most all your roles together can move one faction's reading
  priceClamp: [0.5, 2],
  shoutEvery: [14, 26],      // seconds between strangers calling out to a known role
  shownOnHud: 3,
  words: {
    up: ['', "THEY SAY YOU'RE {a} {NAME}", 'KNOWN AS {a} {NAME}', 'RENOWNED {NAME}'],
    down: ['NOBODY CALLS YOU {a} {NAME} NOW', '{NAME}: ONLY A RUMOUR NOW', '{NAME}: KNOWN, NO LONGER RENOWNED'],
    suspended: '{NAME}: SUSPENDED ({why})',
    reinstated: '{NAME}: BACK IN GOOD STANDING',
  },
};

export const ROLES = {
  wheelman: {
    name: 'Wheelman', short: 'WHEELMAN', color: '#c98a2a',
    blurb: 'Lives behind the wheel. Every mile, every car taken, every body under the bumper adds up.',
    tiers: [20, 45, 75], halfLife: 6,
    earn: [
      { on: 'drive', per: 'km', pts: 1, note: 'km at the wheel' },
      { on: 'drive', per: 'fast', pts: 0.02, note: 'seconds flat out' },
      { on: 'deed', verb: 'carjack', pts: 2.5, note: 'cars taken' },
      { on: 'deed', verb: 'kill', cause: 'vehicle', pts: 3, note: 'run down' },
      { on: 'jump', air: 0.8, pts: 1, note: 'time in the air' },
    ],
    wear: [],
    opens: {
      factions: { dustwolves: { standing: 10 }, remnant: { standing: -6 } },
      prices: { drifters: 0.95 },
      perks: { carjackFlee: true },
      greet: {
        any: ['You drive like the road owes you money.', 'Heard about your driving. Keep it off my street.'],
        dustwolves: ['Nice driving, stranger. You would do well out with us.'],
        rusthaven: ['Wheelman. Slow down inside the wall.'],
      },
      shout: ["That's the wheelman.", 'Nice wheels!', 'Slow down!'],
      radio: {
        name: 'the Wheelman', digest: 'and the stranger they call the Wheelman was out on the roads again',
        news: { known: 'Word on the flats: there is a new wheelman on the roads. Fast hands, faster car. Mind your mirrors.', renowned: 'If you hear an engine screaming out past the ruins tonight, that is the Wheelman. Pull over and let it pass.' },
      },
    },
  },

  medic: {
    name: 'Medic', short: 'MEDIC', color: '#c4513a',
    blurb: 'Patches people up. Out here that makes you rarer than water.',
    tiers: [20, 45, 75], halfLife: 8,
    earn: [
      { on: 'deed', verb: 'heal', pts: 8, scale: { dexterity: 0.05 }, note: 'people patched up' },
      { on: 'deed', verb: 'rescue', pts: 2, note: 'people pulled out of a fight' },
      { on: 'deed', verb: 'deliver', of: 'drifters', src: 'dialogue', pts: 1.5, per: 'mag', note: "Doc Reyes's shifts" },
      { on: 'hour', while: { carry: { kind: 'med', n: 3 } }, pts: 0.5, upTo: 18, note: 'hours carrying a full kit' },
    ],
    wear: [
      { on: 'deed', verb: 'kill', hostile: false, sd: false, pts: 12, note: 'killed somebody harmless' },
    ],
    opens: {
      factions: { drifters: { standing: 10 }, rusthaven: { standing: 8 }, dustwolves: { standing: 6 }, remnant: { standing: 4 } },
      prices: { drifters: 0.95, rusthaven: 0.97 },
      perks: { healMul: 1.5 },
      director: { role_call: 1.5 },
      greet: {
        any: ['You are the one who patches people up. Bless you.', 'Doc Reyes says you have good hands.'],
        dustwolves: ['Even wolves bleed, medic. Remember that.'],
        remnant: ['Medic. The Remnant could use one. So could I.'],
      },
      shout: ['Medic!', 'Bless you, medic.', 'Over here, medic!'],
      radio: {
        name: 'the stranger who patches people up', digest: 'and somebody was patching people up out there for nothing',
        news: { known: 'Static here. There is a stranger on the flats stitching up whoever is bleeding, no questions asked. If you are hurt, wave them down.', renowned: "Folks are calling them Doc Reyes's second pair of hands now. The flats have a medic. Try not to need one." },
      },
    },
  },

  scavenger: {
    name: 'Scavenger', short: 'SCAVENGER', color: '#8f8a4a',
    blurb: 'Goes through what the dead and the gone left behind. Knows which crates are worth the time.',
    tiers: [20, 45, 75], halfLife: 6,
    earn: [
      { on: 'search', kind: 'body', pts: 2.5, scale: { strength: 0.04 }, note: 'the dead gone through' },
      { on: 'search', kind: ['kitchen', 'bathroom', 'bedroom', 'garage', 'office', 'desert'], pts: 2, scale: { strength: 0.04 }, note: 'crates and shelves gone through' },
      { on: 'search', kind: ['military', 'wreck'], pts: 4, scale: { strength: 0.04 }, note: 'wrecks and army crates gone through' },
      { on: 'loot', per: 'value', div: 30, max: 3, pts: 1, note: 'salvage carried off' },
      { on: 'hour', while: { carry: { kind: ['part', 'valuable'], kg: 5 } }, pts: 0.3, upTo: 18, note: 'hours hauling salvage' },
      { on: 'hour', while: { place: 'old_phoenix' }, pts: 0.3, upTo: 16, note: 'hours in the ruins' },
    ],
    wear: [
      { on: 'deed', verb: 'steal', owner: true, pts: 3, note: "took from a living person's shelf" },
    ],
    opens: {
      factions: { drifters: { standing: -4 }, dustwolves: { standing: 4 } },
      perks: { carryKg: 4 },
      greet: {
        any: ['Find anything good out there?', 'You smell like the ruins. Find anything?'],
        drifters: ['Do not go through my things, scavenger.'],
      },
      shout: ['Scavenger.', 'Lock your doors.', 'Find anything?'],
      radio: {
        name: 'the scavenger', digest: 'and somebody picked the ruins clean again',
        news: { known: 'Word from the ruins: somebody is going through every crate in Old Phoenix. If you left something behind, it is gone.', renowned: 'There is not a cupboard in the ruins that stranger has not opened. Static salutes a professional.' },
      },
    },
  },

  deputy: {
    name: 'Deputy of Rust Haven', short: 'DEPUTY', color: '#d9a441',
    blurb: "Keeps Rust Haven's peace: puts down Dustwolves, carries the sheriff's jobs, stands on the wall when they ride.",
    tiers: [20, 45, 75], halfLife: 10,
    requires: { standing: { rusthaven: 20 }, wanted: 1 },
    earn: [
      { on: 'deed', verb: 'kill', of: 'dustwolves', pts: 4, note: 'Dustwolves put down' },
      { on: 'deed', verb: 'deliver', of: 'rusthaven', per: 'mag', pts: 2.5, note: "the sheriff's jobs done" },
      { on: 'deed', verb: 'rescue', of: ['rusthaven', 'drifters'], pts: 4, note: 'townsfolk saved' },
      { on: 'deed', verb: 'defend', pts: 6, note: 'stood your ground for them' },
      { on: 'event', tpl: 'raid', outcome: 'success', near: true, pts: 15, note: 'raids beaten off' },
      { on: 'hour', while: { place: 'rust_haven', standing: { rusthaven: 20 } }, pts: 0.25, upTo: 18, note: 'hours inside the wall' },
    ],
    wear: [
      { on: 'deed', verb: 'hurt', of: 'rusthaven', pts: 8, note: 'hurt townsfolk' },
      { on: 'deed', verb: ['kill', 'silence'], of: 'rusthaven', pts: 30, note: 'killed townsfolk' },
      { on: 'deed', verb: ['carjack', 'steal', 'rob'], of: 'rusthaven', pts: 8, note: 'robbed townsfolk' },
    ],
    opens: {
      factions: { rusthaven: { standing: 15 }, drifters: { standing: 5 }, dustwolves: { standing: -15 }, remnant: { standing: 5 } },
      prices: { rusthaven: 0.9 },
      director: { raid: 1.5 },
      greet: {
        rusthaven: ['Deputy.', 'Morning, deputy. Quiet on the wall so far.'],
        drifters: ['Deputy. Thank you for the wall.'],
        dustwolves: ["Sheriff's dog. Walk careful out here."],
        any: ['You are the one keeping Rust Haven safe, they say.'],
      },
      shout: ['Deputy!', 'Morning, deputy.'],
      radio: {
        name: "Rust Haven's new deputy", digest: "and Rust Haven's new deputy was keeping the peace",
        news: { known: 'Static here. Sheriff Okonkwo has a new hand on the wall, folks say. Dustwolves, take note.', renowned: 'The deputy at Rust Haven has put down more Dustwolves than the whole wall. The wolves are not laughing.' },
      },
    },
  },

  rider: {
    name: 'Dustwolf Rider', short: 'RIDER', color: '#b0301e',
    blurb: "Rides with the Dustwolves: takes cars, takes what is in them, flies what is left. The wolves let a rider into camp.",
    tiers: [20, 45, 75], halfLife: 8,
    requires: { standing: { dustwolves: -79 } },
    earn: [
      { on: 'deed', verb: 'carjack', pts: 3, note: 'cars taken' },
      { on: 'deed', verb: 'rob', pts: 4, note: 'people robbed' },
      { on: 'deed', verb: 'kill', of: ['rusthaven', 'drifters', 'remnant'], sd: false, pts: 4, note: "killed the wolves' enemies" },
      { on: 'jump', named: true, cleared: true, pts: 3, note: 'jumps the wolves heard about' },
      { on: 'drive', vehicle: ['buggy', 'atv', 'bike'], per: 'km', pts: 1.5, note: 'km on a wolf ride' },
      { on: 'hour', while: { place: 'camp_' }, pts: 0.5, upTo: 25, note: 'hours at a Dustwolf camp' },
    ],
    wear: [
      { on: 'deed', verb: 'kill', of: 'dustwolves', pts: 25, note: 'killed a Dustwolf' },
      { on: 'deed', verb: 'hurt', of: 'dustwolves', pts: 6, note: 'shot a Dustwolf' },
      { on: 'deed', verb: 'deliver', of: 'rusthaven', pts: 10, note: 'worked for Rust Haven' },
    ],
    opens: {
      factions: { dustwolves: { standing: 40, hostile: false, from: 'known' }, rusthaven: { standing: -15 }, drifters: { standing: -10 }, remnant: { standing: -10 } },
      prices: { dustwolves: 0.85, rusthaven: 1.1, drifters: 1.05 },
      greet: {
        dustwolves: ['Rider. Camp is that way. Bring us something next time.'],
        rusthaven: ['I know whose company you keep. Keep it outside my wall.'],
        drifters: ['You ride with the wolves. Stay away from me.'],
        any: ['You ride with the Dustwolves now, they say.'],
      },
      shout: ['Wolf rider!', 'Hide the water!'],
      radio: {
        name: "the Dustwolves' new rider", digest: 'and the Dustwolves have a new rider on the flats',
        news: { known: 'Static here with a warning: the Dustwolves have a new rider, and this one is not one of their own. Stranger, I hope it was worth it.', renowned: 'The wolves ride behind that stranger now. God help the convoys.' },
      },
    },
  },

  trader: {
    name: 'Trader', short: 'TRADER', color: '#b89a5a',
    blurb: 'Buys, sells, carries. Knows what everything is worth to whoever wants it.',
    tiers: [20, 45, 75], halfLife: 8,
    earn: [
      { on: 'deed', verb: 'trade', pts: 2, note: 'deals struck' },
      { on: 'trade', per: 'value', div: 25, max: 6, pts: 1, note: 'scrip changing hands' },
      { on: 'deed', verb: 'deliver', pts: 2, note: 'goods delivered' },
      { on: 'hour', while: { carry: { kind: 'valuable', value: 120 } }, pts: 0.3, upTo: 18, note: 'hours carrying valuables' },
    ],
    wear: [
      { on: 'deed', verb: 'rob', pts: 8, note: 'robbed somebody' },
      { on: 'deed', verb: 'steal', pts: 4, note: 'stole' },
    ],
    opens: {
      factions: { drifters: { standing: 5 }, rusthaven: { standing: 3 } },
      prices: { '*': 0.92 },
      greet: {
        any: ['Trader. What are you carrying?'],
        drifters: ['Got anything to sell, trader?'],
        rusthaven: ['Trader. Pay the gate toll and welcome.'],
      },
      shout: ['What are you selling?', 'Trader!'],
      radio: {
        name: 'the trader on the flats', digest: 'and a trader was working the roads between the holdouts',
        news: { known: 'Word is there is a new trader working the roads. Fair prices, they say. Static will believe it when Static sees it.', renowned: 'Every holdout from here to the river knows that trader by now. Get a good price while it lasts.' },
      },
    },
  },

  // Named jumps (stunts.js) are the stunt driver's work. ("Daredevil" stays off the screen: it is a comic hero's name.)
  stuntdriver: {
    name: 'Stunt Driver', short: 'STUNT DRIVER', color: '#e07a2a',
    blurb: 'Flies cars at the old thrill show for the crowd and the cash. The Dustwolves respect a driver who can fly.',
    tiers: [20, 45, 75], halfLife: 6,
    earn: [
      { on: 'jump', named: true, cleared: true, grade: 'clean', fresh: true, pts: 9, note: 'named jumps landed clean' },
      { on: 'jump', named: true, cleared: true, grade: ['rough', 'hard'], fresh: true, pts: 5, note: 'named jumps cleared' },
      { on: 'jump', named: true, cleared: true, fresh: false, pts: 2.5, note: 'the same jump again' },
      { on: 'jump', named: false, air: 1, pts: 1.5, note: 'time in the air' },
      { on: 'deed', verb: 'stunt', identified: true, pts: 2, seen: { id: 1, saw: 0.5, none: 0 }, note: 'jumps somebody saw' },
    ],
    wear: [],
    opens: {
      factions: { dustwolves: { standing: 12 }, drifters: { standing: 3 } },
      perks: { jumpPay: 1.25 },
      greet: {
        any: ['Saw you fly Wreck Row. Or heard about it. Same thing.'],
        dustwolves: ['Driver who flies. Respect.'],
      },
      shout: ['Do a jump!', "That's the one who flew Wreck Row!"],
      radio: {
        name: 'the stunt driver from the old thrill show', digest: 'and the stunt driver from the old thrill show was in the air again',
        news: { known: 'The old thrill show off Route 66 has a stunt driver again. Folks are bringing chairs.', renowned: 'If you have never seen a car fly, go out to the thrill show at sundown. The stranger out there does not land so much as arrive.' },
      },
    },
  },

  ghost: {
    name: 'Ghost', short: 'GHOST', color: '#7d8c90',
    blurb: 'Things happen and nobody sees who. Nobody can say your name, but everybody knows there is one.',
    tiers: [20, 45, 75], halfLife: 4,
    requires: { wanted: 0 },
    earn: [
      { on: 'deed', verb: ['kill', 'silence'], sd: false, pts: 6, seen: { id: 0, saw: 0.3, none: 1 }, note: 'work nobody saw' },
      { on: 'deed', verb: 'steal', pts: 3, seen: { id: 0, saw: 0.3, none: 1 }, note: 'things gone, nobody saw who' },
      { on: 'deed', verb: ['hurt', 'carjack', 'destroy'], pts: 2, seen: { id: 0, saw: 0.3, none: 1 }, note: 'trouble nobody can pin on you' },
    ],
    wear: [
      { on: 'deed', identified: true, src: ['deed', 'stunt'], pts: 6, note: 'seen and named' },
    ],
    opens: {
      perks: { idMul: 0.75 },
      greet: { any: ['Folks talk about somebody nobody ever sees. Funny, I never see you coming.'] },
      shout: [],
      radio: {
        name: 'somebody nobody ever sees', digest: 'and somebody nobody ever sees was working the dark again',
        news: { known: 'Static here. Bodies turning up with nobody to say who. There is a ghost on the flats.', renowned: 'Folks lock their doors twice now. Whoever the ghost is, they are good at it.' },
      },
    },
  },

  samaritan: {
    name: 'Good Samaritan', short: 'SAMARITAN', color: '#6f9a5c',
    blurb: 'Pulls strangers out of bad fights for nothing. The holdouts remember who stopped to help.',
    tiers: [20, 45, 75], halfLife: 10,
    earn: [
      { on: 'deed', verb: 'rescue', pts: 6, note: 'strangers pulled out of a fight' },
      { on: 'deed', verb: 'heal', pts: 4, note: 'strangers patched up' },
      { on: 'deed', verb: 'defend', pts: 6, note: 'stood up for people' },
      { on: 'event', tpl: 'raid', outcome: 'success', near: true, pts: 8, note: 'raids beaten off' },
      { on: 'deed', verb: 'pay', pts: 2, note: 'debts paid' },
    ],
    wear: [
      { on: 'deed', verb: ['kill', 'silence'], hostile: false, sd: false, pts: 20, note: 'killed somebody harmless' },
      { on: 'deed', verb: 'rob', pts: 10, note: 'robbed somebody' },
      { on: 'deed', verb: 'steal', pts: 5, note: 'stole' },
      { on: 'deed', verb: 'carjack', pts: 4, note: 'pulled somebody out of their car' },
    ],
    opens: {
      factions: { drifters: { standing: 12 }, rusthaven: { standing: 8 }, remnant: { standing: 4 } },
      prices: { drifters: 0.9, rusthaven: 0.95 },
      director: { role_call: 1 },
      greet: {
        any: ['You are the one who helps people. Do not stop.'],
        drifters: ['People like you are why I still open my door.'],
      },
      shout: ['God bless you.', 'Thank you, stranger!'],
      radio: {
        name: 'a good samaritan', digest: 'and a good samaritan pulled somebody out of a bad spot',
        news: { known: 'Good news for once: there is a stranger out there pulling people out of trouble for nothing. Pass it on.', renowned: 'If you are in trouble on the flats, holler. That samaritan always seems to hear it.' },
      },
    },
  },

  butcher: {
    name: 'Butcher', short: 'BUTCHER', color: '#8a2416',
    blurb: 'Kills people who never raised a hand. Fear opens some doors and closes most.',
    tiers: [20, 45, 75], halfLife: 14,
    earn: [
      { on: 'deed', verb: ['kill', 'silence'], hostile: false, sd: false, pts: 7, namedMul: 1.5, seen: { id: 1, saw: 0.7, none: 0.5 }, note: 'killed people who never raised a hand' },
    ],
    wear: [
      { on: 'deed', verb: 'rescue', pts: 6, note: 'saved somebody' },
      { on: 'deed', verb: 'heal', pts: 4, note: 'patched somebody up' },
    ],
    opens: {
      factions: { drifters: { standing: -20 }, rusthaven: { standing: -20, hostile: true, from: 'renowned' }, remnant: { standing: -15 }, dustwolves: { standing: 10 } },
      prices: { drifters: 1.3, rusthaven: 1.2 },
      perks: { fear: true, fearFrom: 'renowned' },
      director: { hunters: 1.5, dead_draw_dead: 1.3 },
      refusedBy: { ids: ['ike', 'mags', 'kenji'], from: 'known', line: 'I do not sell to butchers. Get out.' },
      greet: {
        any: ['...Just take what you want and go.'],
        dustwolves: ['Butcher. You would fit right in.'],
      },
      shout: ['Butcher!', 'Get inside, get inside!', 'Run!'],
      radio: {
        name: 'the butcher of the flats', digest: 'and the butcher of the flats was out there, God help us',
        news: { known: 'Static here, and I wish I were not: somebody is killing people who never raised a hand. Folks are calling them the butcher.', renowned: 'Lock your doors. Bury your dead. The butcher is still out there.' },
      },
    },
  },
};

// Jobs a role opens, as rows. A named person offers one in their own words (data/npcs.js; a pack choice uses
// ifJob / job effects); the role engine counts the work from its own signals and pays on the giver's word.
//   role/from    the role (and tier) the offer needs        office  ...or an office you hold instead
//   counts       a signal filter, like an earn rule          need    how many before it pays (each: pay per one)
//   kit          [[item, n]] handed over when it starts      deliver an item id handed in to finish (to: who takes it)
//   daily        offered once a game day                     title   what the ORDERS tag says while it runs
export const ROLE_JOBS = {
  medic_shift: { role: 'medic', from: 'known', giver: 'reyes', counts: { on: 'deed', verb: 'heal' }, need: 3, pay: 90, daily: true,
    kit: [['first_aid', 1], ['bandage', 2]], deed: { v: 'deliver', m: 2 }, title: "Doc Reyes's shift: patch up three people (bandages: talk to the hurt)" },
  wreck_show: { role: 'stuntdriver', from: 'known', giver: 'kenji', counts: { on: 'jump', jump: 'wreckrow', cleared: true, grade: 'clean' }, need: 1, pay: 150, daily: true,
    deed: { v: 'deliver', m: 2 }, title: "Kenji's crowd: clear Wreck Row clean, about 40 mph at the lip" },
  water_run: { role: 'trader', from: 'known', giver: 'mags', to: 'tomas', kit: [['water_can', 1]], deliver: 'water_can', pay: 60, daily: true,
    deed: { v: 'deliver', m: 2 }, title: "Mags's water run: carry the can to Old Tomás on the flats" },
  deputy_bounty: { office: 'deputy', giver: 'okonkwo', counts: { on: 'deed', verb: 'kill', of: 'dustwolves' }, each: 20, auto: true,
    title: "Deputy's bounty: $20 a Dustwolf, paid at the gate" },
};

// Offices: what a named person makes official once a role is known. Held until the role lapses (suspended or lost).
export const ROLE_OFFICES = {
  deputy: { role: 'deputy', from: 'known', giver: 'okonkwo', name: 'Sworn deputy of Rust Haven', item: 'tin_star',
    gives: 'a star in your pack; the bulls give a deputy one wanted star of slack; the deputy bounty ($20 a Dustwolf)',
    sworn: 'SWORN IN: DEPUTY OF RUST HAVEN', stripped: 'RUST HAVEN TOOK BACK YOUR STAR' },
  vo_lesson: { role: 'ghost', from: 'known', giver: 'vo', name: "Vo's lesson", perks: { idMul: 0.85 },
    gives: 'witnesses must stand closer still to put a name to you',
    sworn: 'VO TAUGHT YOU TO MOVE UNSEEN', stripped: '' },
};

// What a director role call looks like for each role that has one (data/events.js role_call; systems/director.js).
export const ROLE_CALLS = {
  medic: { from: 'known', hp: 0.3, line: 'Are you the one who patches people up? I am bleeding bad.', toast: 'SOMEBODY NEEDS A MEDIC' },
  samaritan: { from: 'known', hp: 0.35, line: 'They said you help people. Please. I am hurt.', toast: 'SOMEBODY IS LOOKING FOR YOU' },
};
