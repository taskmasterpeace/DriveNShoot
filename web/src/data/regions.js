// REGIONS as rows (docs/design/WEB_FLORIDA.md). The streamed world is one plane and one K (WEB_STREAMING §3.1): a region
// is a part of it the streamer is allowed to lay out, with its own corridors, exits, biome look, flora, water, life and
// edge. Arizona (P1: I-10 from Los Angeles to El Paso through Phoenix, the dust wall 45 km out) keeps every number it had
// in data/streaming.js; it is listed here only so the region rules have a name for it. Florida is the start region
// (Robert, EM3 Briefing 2026-10-23: "START IN FLORIDA").
// Everything is data: change a row, not world/worldindex.js or world/chunkgen.js. Positions are usmap metres (the Godot
// game's map, game/data/usmap.json) unless a row says metres: the engine carries them through toWorld like every other row.
// No purple (hue 270-320 is banned), no brand names. Real places are ours to use (the IP wall: WEB_FAN_SERVICE_BIBLE).

export const REGIONS = {
  arizona: { id: 'arizona', name: 'ARIZONA', p1: true }, // the P1 corridor: the dust wall circle in data/streaming.js
  florida: {
    id: 'florida', name: 'FLORIDA', state: 'FLORIDA',
    // The playable box (usmap metres): the Georgia line to past Miami, the Gulf shore to the Atlantic. Outside it the
    // squall line: rain and green-grey murk thicken over `fade` metres, then nothing gets through (the dust wall's rule).
    box: { x0: -7200, x1: 1500, y0: 11400, y1: 22300 },
    wall: { name: 'THE SQUALL LINE', fade: 2500, color: '#4f5e58', sign: ['SQUALL LINE AHEAD', 'NOTHING PAST HERE', 'TURN BACK'],
      toast: 'THE SQUALL LINE: GREEN WATER AND WIND. NOTHING GETS THROUGH. TURN BACK.' },
    // The interstates (WEB_FLORIDA §3.1). Each runs SOUTH to NORTH, so a corridor's arc length is miles from Miami and an
    // exit's number is its milepost (the real Florida rule). pts: the overlay line in usmap metres. I-95 hugs the
    // Atlantic (the Godot row ran straight from Jacksonville to Miami, 10-20 km inland: the adapter bends it to the coast);
    // I-75 is the Godot row with its south end turned into ALLIGATOR ALLEY across the swamp. They meet at Miami.
    corridors: [
      { id: 'I-95', dirs: ['NORTH', 'SOUTH'], salt: 95, startTown: 'miami',
        pts: [[-2000, 20500], [-1820, 20250], [-1640, 19900], [-1380, 19450], [-1200, 19000], [-1080, 18550], [-900, 18100], [-700, 17600], [-640, 17000],
          [-760, 16300], [-1000, 15600], [-1300, 15000], [-1700, 14300], [-2300, 13700], [-3000, 13650], [-3700, 13250], [-4000, 12750], [-3687, 11813], [-3531, 11344]],
        canal: { side: -1, off: 46, half: 6.5, depth: 2.3 } }, // a drainage canal along the inland (west) side, the Florida look
      { id: 'I-75', dirs: ['NORTH', 'SOUTH'], salt: 75, startTown: 'miami',
        pts: [[-2000, 20500], [-2400, 20150], [-3000, 19900], [-4200, 19850], [-4800, 19300], [-5100, 18300], [-5050, 17400], [-5000, 16750], [-5400, 15600], [-5920, 12979], [-5986, 12707], [-6050, 11300]],
        canal: { side: 1, off: 44, half: 7, depth: 2.6 } },  // Alligator Alley's canal on the north side
    ],
    // Exits. mile: where on its corridor (an exit's number IS its mile); town: an exit for a town row (its mile is where
    // the town projects onto the road, its dest is the town); side E|W and m: how far off the road its community stands
    // (world metres); holdout: the exit serves a walled holdout (data HOLDOUTS) instead of a community.
    exits: [
      { road: 'I-95', mile: 2, name: 'LITTLE RIVER', archetype: 'neighborhood', tier: 'T2', tags: ['market', 'water'], risk: 2, side: 'W', m: 760 },
      { road: 'I-95', mile: 5, name: 'THE CANAL LOCKS', archetype: 'industrial', tier: 'T1', tags: ['parts', 'fuel'], risk: 3, side: 'W', m: 640 },
      { road: 'I-95', mile: 9, name: 'MERIDIAN', archetype: 'county_seat', tier: 'T3', tags: ['law', 'medical', 'market', 'jobs'], risk: 1, holdout: 'meridian' },
      { road: 'I-95', mile: 14, name: 'SEBASTIAN', archetype: 'service', tier: 'T1', tags: ['fuel', 'food'], risk: 2, side: 'W', m: 560 },
      { road: 'I-95', mile: 19, name: 'TITUSVILLE', archetype: 'dead', tier: 'T1', tags: [], risk: 4 },
      { road: 'I-95', mile: 24, name: 'DAYTONA', archetype: 'neighborhood', tier: 'T2', tags: ['market', 'parts'], risk: 3, side: 'E', m: 820 },
      { road: 'I-95', mile: 29, name: 'ST. AUGUSTINE', archetype: 'service', tier: 'T1', tags: ['fuel', 'water'], risk: 2, side: 'E', m: 600 },
      { road: 'I-95', town: 'rosewood', name: 'ROSEWOOD', archetype: 'county_seat', tier: 'T3', tags: ['law', 'market'], risk: 2 },
      { road: 'I-75', mile: 6, name: 'THE SAWGRASS', archetype: 'dead', tier: 'T1', tags: [], risk: 4 },
      { road: 'I-75', mile: 12, name: 'ALLIGATOR ALLEY', archetype: 'service', tier: 'T1', tags: ['fuel', 'airboats', 'bait'], risk: 4, side: 'N', m: 520 },
      { road: 'I-75', town: 'the-dry-dock', name: 'THE DRY DOCK', archetype: 'county_seat', tier: 'T2', tags: ['market', 'parts'], risk: 3 },
    ],
    // The towns Godot built here keep their rows (streets, placements: tools/import-usmap.mjs). Meridian's row lives in
    // Virginia in the Godot map (usmap 110,-325): Florida moves it to its exit here and builds it as a walled holdout.
    relocate: { meridian: 'holdout' },

    // The look: biome rows by usmap legend letter (the 500 m grid). tint multiplies a neutral ground texture (so these
    // are the colours); scatter per hectare; flora: [species, weight] (world/flora.js SPECIES); dense: share of the
    // shrubs that are palmetto (the rest sawgrass); rock is 0 everywhere (Florida is flat: no mesas).
    ground: 'marsh',
    biomes: {
      s: { name: 'swamp', tint: [0.4, 0.5, 0.29], shrubs: 46, trees: 12, boulders: 0.1, rock: 0, palmetto: 0.45,
        flora: [['cypress', 5], ['sabal', 3], ['slashpine', 1.2], ['deadtree', 0.8]], sloughs: 1 },
      F: { name: 'pine flatwoods', tint: [0.47, 0.53, 0.31], shrubs: 44, trees: 15, boulders: 0.1, rock: 0, palmetto: 0.85,
        flora: [['slashpine', 8], ['sabal', 2], ['liveoak', 1.2]], sloughs: 0.35 },
      f: { name: 'scrub', tint: [0.6, 0.6, 0.4], shrubs: 36, trees: 7, boulders: 0.1, rock: 0, palmetto: 0.9,
        flora: [['slashpine', 3], ['sabal', 2], ['liveoak', 2]], sloughs: 0.15 },
      a: { name: 'groves', tint: [0.5, 0.58, 0.33], shrubs: 18, trees: 9, boulders: 0, rock: 0, palmetto: 0.3,
        flora: [['citrus', 6], ['sabal', 1]], rows: true, sloughs: 0.1 },
      p: { name: 'prairie', tint: [0.56, 0.58, 0.36], shrubs: 30, trees: 4.5, boulders: 0, rock: 0, palmetto: 0.5,
        flora: [['sabal', 3], ['liveoak', 2]], sloughs: 0.5 },
      u: { name: 'the dead suburbs', tint: [0.56, 0.58, 0.42], shrubs: 22, trees: 6, boulders: 0.3, rock: 0, palmetto: 0.4, ruins: 1.1,
        flora: [['sabal', 3], ['fanpalm', 2], ['liveoak', 1.5], ['deadtree', 1]], sloughs: 0.2 },
      w: { name: 'wetland', tint: [0.38, 0.47, 0.3], shrubs: 40, trees: 10, boulders: 0, rock: 0, palmetto: 0.2,
        flora: [['cypress', 6], ['deadtree', 1]], sloughs: 1.6 },
      '.': { name: 'the coast', tint: [0.98, 0.92, 0.74], shrubs: 10, trees: 1.2, boulders: 0.2, rock: 0, palmetto: 0.2,
        flora: [['sabal', 3], ['fanpalm', 1]], sloughs: 0 },
      d: null, m: null, // never in Florida: fall back to scrub
    },
    sand: [0.98, 0.92, 0.74], mud: [0.42, 0.4, 0.3], wet: [0.58, 0.6, 0.46], // the beach, a bank, the ground round a pond
    shrubs: { palmetto: '#5e7a34', sawgrass: '#a8a05a' },

    // Water (WEB_FLORIDA §3.3), THE water authority past the island (world/water.js asks the region). Metres.
    water: {
      // The Atlantic shore: the usmap x where the open beach stands (0 here: the grid's own coast), bent west into Biscayne
      // Bay at Miami; a barrier island of `barrier` metres, then a lagoon of `lagoon` metres to the mainland shore.
      // Inlets break the barrier island every `inletEvery` metres. Noise wobbles both shores.
      atlantic: { u: 0, bay: { y0: 19400, y1: 20600, u: -1500 }, barrier: [300, 470], lagoon: [1250, 1700], inletEvery: 9000, inlet: 140,
        noise: { wave: [2600, 700], amp: [160, 40] }, beach: 36, ocean: { slope: 30, max: 9 }, lagoonDepth: [1.2, 2.4], inletDepth: 2.8 },
      // Grid ocean cells elsewhere (the Gulf): a bilinear field over the 500 m cells, shored by noise.
      gulf: { wave: 900, amp: 0.28, slope: 40, max: 8 },
      // Sloughs and gator holes: still water in the swamp where noise pools it (scaled by the biome's `sloughs`).
      slough: { wave: 210, cut: 0.69, depth: 7, max: 1.9, clearRoad: 70, clearTown: 140 },
    },

    // Life (L5, WEB_WORLD_EDITOR_PLAN §3.1). Rows another agent's fauna layer absorbs: `kind` names a FAUNA row.
    life: {
      fauna: [{ kind: 'gator', where: 'water', biomes: ['s', 'w', 'F', 'p'], perKm2: 3.2, night: 1.5, near: 'slough|canal|lagoon', max: 14 }],
      // The infected in Florida (data/infected.js kinds): denser than the desert by `density`, worse at night, herds
      // drift out of the dead suburbs and along the canals. Spawned out of sight by systems/regions.js.
      infected: { density: 1.6, dayHerds: [2, 4], nightHerds: [4, 7], every: 9, cap: 28, runners: 0.2, never: 'holdout' },
    },

    // A new character starts here (WEB_FLORIDA §3.5): at the holdout, at the doorstep of its clinic (the clone bay is
    // inside: the clone agent's hook, data HOLDOUTS.meridian.clinic).
    start: { holdout: 'meridian', at: 'clinic' },
  },
};

// The streamer's region for the start flag (?start=florida|phoenix): players start in Florida, the agent harness and the
// selftest in Phoenix (their checks stage there), unless the URL says otherwise.
export const START = { player: 'florida', agent: 'phoenix' };

// Fauna rows (L5). The fauna agent's layer takes these over; systems/regions.js runs them until then.
//   gator: an alligator. Basks at the water's edge by day, lies in the water at night; hp, bite, how fast on land and in
//   water, how far it notices you, how far it lunges, how long between bites. Size in metres (nose to tail).
export const FAUNA = {
  gator: { name: 'Alligator', hp: 160, bite: 26, land: 3.2, swim: 2.4, lunge: 9.5, lungeRange: 4.2, notice: 14, leash: 45, biteEvery: 1.6,
    size: [2.6, 3.9], colors: ['#3a4a2a', '#2f3d24', '#46502e', '#38402a'], belly: '#b8b08a', drag: 0.6 },
};
