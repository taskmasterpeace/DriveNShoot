// The IP lint's term lists (tools/ip-lint.mjs): pure data with no node imports, so the game's selftest (the voice
// check: no dialogue row may carry a DENY term) and tools/voiceforge read the same lists the lint does.

// Grouped by source so a reviewer can see why each term is here.
export const DENY = {
  'Deathlands (Axler)': ['deathlands', 'mutie', 'muties', 'stickie', 'stickies', 'nukecaust', 'skydark', 'fireblast', 'mat-trans', 'mattrans', 'sec man', 'sec men', 'gaudy house', 'jump dark', 'war wag', 'war wags', 'cawdor', 'krysty', 'doc tanner', 'jak lauren', 'mildred wyeth', 'jack lauren'],
  'Mad Max': ['war rig', 'fury road', 'immortan', 'witness me', 'bullet farm', 'gas town', 'thunderdome', 'bartertown', 'rockatansky', 'furiosa', 'war boy', 'war boys', 'doof warrior', 'pursuit special', 'v8 interceptor'],
  'Grand Theft Auto': ['grand theft auto', 'kill frenzy', 'liberty city', 'vice city', 'san andreas', 'anywhere city', 'zaibatsu'],
  'Project Zomboid': ['zomboid', 'moodle', 'moodles', 'knox event', 'knox county', 'muldraugh', 'this is how you died', 'spiffo'],
  "We're Alive": ["we're alive", 'scratchers', 'scratcher'],
  '28 Days Later': ['28 days later', 'rage virus'],
  'Car Wars / Autoduel': ['car wars', 'autoduel', 'aada', 'american autoduel association', "uncle al's", 'uncle albert', 'dueltrack'],
  'Fallout': ['fallout', 'vault-tec', 'vault boy', 'pip-boy', 'pipboy', 'nuka', 'brotherhood of steel', 'super mutant', 'deathclaw', 'radaway', 'rad-x'],
  'Walking Dead / Left 4 Dead / Twisted Metal': ['rick grimes', 'negan', 'left 4 dead', 'sweet tooth', 'calypso'],
  // Our own canon (docs/design/THE_INFECTED.md): the infected are living; the Z-word never reaches the screen.
  'DSOA canon - never on screen': ['zombie', 'zombies', 'rotter', 'rotters', 'undead'],
  'Deathlands slang (more)': ['scalie', 'scalies', 'cannie', 'cannies', 'chem storm', 'chem-storm', 'chem storms', 'j.b. dix', 'jb dix', 'dean cawdor', 'front royal', 'deathlander', 'deathlanders'],
  'Mad Max (more)': ['humungus', 'toecutter', 'feral kid', 'immortan joe', 'rictus erectus', 'nux', 'the wretched'],
  'Car Wars (more)': ['duel track', 'gold cross', 'midville', 'autoduellist', 'autoduellists'],
  'Fallout (more)': ['stimpak', 'stimpaks', 'stimpack', 'stimpacks', 'mentats', 'feral ghoul', 'feral ghouls', 'nuka-cola'],
  // Trademarks that read like plain words. A licensed game can't ship them unlicensed.
  'Real-world trademarks': ['jet ski', 'jet skis', 'waverunner', 'wave runner', 'sea-doo', 'seadoo', 'police interceptor', 'humvee', 'humvees', 'hummer', 'jeep', 'jeeps', 'kevlar', 'taser', 'tasers', 'zippo', 'band-aid', 'uzi', 'uzis', 'glock', 'glocks', 'kalashnikov', 'winnebago', 'peterbilt', 'kenworth', 'mack truck', 'harley-davidson', 'harley', 'airstream', 'thermos', 'jacuzzi', 'styrofoam', 'kdth'],
};

export const REVIEW = {
  'Mad Max (the V8 car) / Ford trademark': ['interceptor', 'citadel', 'valhalla'],
  'GTA death/arrest screens': ['wasted', 'busted'],
  'Deathlands slang that is also plain English': ['ville', 'jolt', 'dark night', 'redoubt', 'blaster', 'blasters'],
  "Left 4 Dead special infected": ['boomer', 'smoker', 'spitter', 'jockey', 'witch', 'charger'],
  'Walking Dead zombie word': ['walker', 'walkers'],
  'Walking Dead / We\'re Alive creature and gang names': ['biter', 'biters', 'roamer', 'roamers', 'lurker', 'lurkers', 'burner', 'burners', 'big ones', 'screamer', 'screamers'],
  'GTA2 gang names that are also words': ['loonies', 'zaibatsu corporation'],
  'Fallout 3 faction name that is also a word': ['regulator', 'regulators'],
};

const re = (t) => new RegExp(`(?<![a-z0-9])${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z0-9])`, 'i');
// The DENY terms found in one string of player-facing text (empty when clean).
export const denyHits = (s) => Object.entries(DENY).flatMap(([src, terms]) => terms.filter((t) => re(t).test(s)).map((t) => ({ term: t, source: src })));
