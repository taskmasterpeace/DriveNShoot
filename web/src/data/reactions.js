// GUNFIRE REACTIONS (docs/design/WEB_GUNFIRE_REACTIONS.md; systems/reactions.js). Robert, 2026-10-29: "the sound of
// gunshots should make different people react different ways."
//
// A shot is HEARD, never known (WEB_DEPTH_PLAN §0 law 6): each listener gets a loudness (distance, the gun, walls in
// between), a heard BEARING with an error that grows with distance and with buildings in the way, and a guess at how far
// off it was. Everything a person then does - run away, go and look, call it in - aims at that heard spot, never at the
// shooter's true position. Seeing the shooter is the one exception (return fire needs a line of sight inside seeR).
//
// Who does what is a PROFILE (first row of PROFILES that matches: a child, a parent, the law, a medic, a trader...),
// shaded by TEMPERAMENT (a drunk ignores it, a coward drops everything and runs, a devout one prays), by the loudness
// BAND it was heard at (near / mid / far), by whether they are armed, by the hour (asleep wakes slower) and by how jumpy
// the PLACE is (repeated shots make a town jumpy; a quiet town relaxes).

// ---- the rules ---------------------------------------------------------------------------------------------------------
export const REACT = {
  earMul: 3,             // heard out to the shot's noise radius x this x the gun's loudness (a pistol's 45 m noise: 135 m)
  loud: { pistol: 1, auto: 1, smg: 1.05, rifle: 1.3, shotgun: 1.2, pump: 1.2, default: 1 },
  wallMul: 0.55,         // a building between the shot and the ear: heard out to this share of the range
  sleepEar: 1,           // asleep: x TOWN_NIGHT.hearAsleep / earMul - the town's own law (data/survival.js: 0.45 of the 45 m
                         // noise, about 20 m: gunfire at the town wall doesn't wake the far side of town); this scales it
  bands: { near: 0.62, mid: 0.3 }, // loudness (1 at the muzzle, 0 at the edge of hearing): >= near is near, >= mid is mid, else far
  errBase: 5,            // degrees of bearing error at the muzzle...
  errPerM: 0.22,         // ...plus this per metre...
  errWall: 1.8,          // ...x this with a building between...
  errMax: 70,            // ...never more than this
  distErr: 0.35,         // the guessed distance is off by up to this share of the true one (x 1.5 through a wall)
  delay: [0.25, 0.7],    // s before an awake person reacts (x the temperament's nerve, cut by jumpiness)
  wake: [2.6, 5],        // s before a sleeper is up and reacting (x the temperament's rouse)
  seeR: 40, seeRNight: 18, // m: a shooter seen inside this (and in line of sight) can be shot back at
  barkEvery: 0.45,       // s between reaction barks (the street does not shout in chorus)
  barkR: 70,             // m from you a bark is worth saying
  screamR: 55,           // m: a scream's noise to the infected (zombies.onNoise)
  doorR: 24,             // m: the farthest door someone runs to to get inside
  bedR: 20,              // m: the farthest bed a child runs to to get under
  inside: 2.6,           // m past the door's line, inside, where they stand once in
  kinR: 70,              // m: the farthest a parent runs to their family
  shortLeg: 40,          // m (|dx| + |dz|): a leg this short is always path-planned, even if the nav window has to move for it
  hop: 35,               // m: the longest leg one foot path plans when going to look (the nav window holds still)
  callR: 400,            // m: a call it in reaches the radio sets inside this
  maxPerShot: 48,        // listeners one shot can move (the nearest first)
  jump: {                // a place's jumpiness (0..1): repeated shots raise it, quiet lets it decay
    cell: 300,           // m: the grid a "place" is
    perShot: 0.16,       // added per shot heard there (x the loudest ear's loudness)
    max: 1,
    halfLife: 90,        // s of quiet for it to halve
    delayCut: 0.5,       // reaction delay x (1 - delayCut x j)
    secsAdd: 0.8,        // how long they keep it up x (1 + secsAdd x j)
    calmCut: 0.85,       // calm reactions' weight x (1 - calmCut x j)
    scareAdd: 1,         // flee / hide / cover weight x (1 + scareAdd x j)
    earAdd: 0.25,        // a jumpy town hears further: range x (1 + earAdd x j)
  },
};

// ---- reactions ---------------------------------------------------------------------------------------------------------
// pose:  stand | crouch | prone | handsUp | kneel (crouch + hands up) | aim | stoop
// move:  none | away (from the heard bearing) | cover (a dash away, then down) | toward (the heard spot) | door (inside,
//        and bar it) | bed (under the nearest bed) | kin (to their family, then inside together) | fight (return fire)
// secs:  how long they keep it up      speed: m/s moving      calm: does not count as scared (jumpiness thins these)
// (calm: they carry on with what they were doing; the reaction is only the bark and a few seconds of not caring)
// scared: weighted up by jumpiness     scream: makes noise for the infected     callIn: a fact into the knowledge model
// needs: 'armed' (only someone carrying a gun)     lines: barks (one picked; said through the voice system)
export const REACTIONS = {
  freeze:       { pose: 'stand', move: 'none', secs: [2, 4], speed: 0, lines: ['...was that a shot?', 'Nobody move.', 'Shh!'] },
  cover:        { pose: 'crouch', move: 'cover', secs: [5, 9], speed: 4.2, scared: true, lines: ['Get down!', 'Down, down!', 'Find cover!'] },
  flee:         { pose: 'stand', move: 'away', secs: [5, 9], speed: 5.8, scared: true, lines: ['Run!', 'Go, go!', 'Not again!'] },
  drop_run:     { pose: 'stand', move: 'away', secs: [8, 12], speed: 6.6, scared: true, drop: true, lines: ['I\'m out of here!', 'Forget it, forget all of it!'] },
  hide:         { pose: 'stand', move: 'door', secs: [25, 45], speed: 4.8, scared: true, bar: true, lines: ['Inside! Bar the door!', 'Closing up!', 'Get in, get in!'] },
  hide_low:     { pose: 'prone', move: 'bed', secs: [20, 40], speed: 4.4, scared: true, lines: ['Under the bed...', 'Mama!'] },
  run_kin:      { pose: 'stand', move: 'kin', secs: [25, 45], speed: 5.6, scared: true, lines: ['Where are you?!', 'Come here, now!', 'Stay with me!'] },
  look:         { pose: 'aim', move: 'toward', secs: [14, 22], speed: 3.4, needs: 'armed', lines: ['Shots. Over that way.', 'Going to take a look.', 'Who\'s shooting?'] },
  tend:         { pose: 'stoop', move: 'toward', secs: [14, 22], speed: 3, wait: 1.5, lines: ['Somebody\'s hit - get my bag.', 'Anyone hurt?!'] },
  return_fire:  { pose: 'aim', move: 'fight', secs: [0, 0], speed: 0, needs: 'armed', lines: ['Contact!', 'There - shooter!'] },
  call_in:      { pose: 'stand', move: 'none', secs: [3, 5], speed: 0, callIn: true, lines: ['Shots fired, {dir} of here!', 'Calling it in - gunfire {dir}.'] },
  scream:       { pose: 'handsUp', move: 'away', secs: [4, 7], speed: 5.2, scared: true, scream: true, lines: ['AAAH!', 'HELP! SOMEBODY!'] },
  wail:         { pose: 'handsUp', move: 'none', secs: [4, 8], speed: 0, scared: true, scream: true, lines: ['MAMA!', 'AAAAH!'] }, // a child screams where they stand
  pray:         { pose: 'kneel', move: 'none', secs: [6, 12], speed: 0, lines: ['Lord, not here...', 'Keep us. Keep us.'] },
  keep_working: { pose: 'stand', move: 'none', secs: [2, 4], speed: 0, calm: true, lines: ['Not my business.', 'Every night, this.'] },
  ignore:       { pose: 'stand', move: 'none', secs: [2, 4], speed: 0, calm: true, lines: ['Fireworks... *hic*', 'Somebody\'s celebrating.'] },
};

// ---- temperaments ------------------------------------------------------------------------------------------------------
// w: how common (people without a set temper get one by a hash of who they are)
// nerve: reaction delay / (nerve)   rouse: wake time x rouse   ear: hearing range x ear
// override: replaces whatever the profile picked (unless the profile is firm)   swap: { picked: becomes }
// calmMul: calm reactions' weight x this
export const TEMPERAMENTS = {
  steady:  { w: 3, nerve: 1, rouse: 1, ear: 1 },
  nervous: { w: 2, nerve: 1.4, rouse: 0.8, ear: 1.1, calmMul: 0.4 },
  brave:   { w: 1.2, nerve: 1.1, rouse: 1, ear: 1, swap: { flee: 'cover', freeze: 'cover', scream: 'cover' } },
  coward:  { w: 0.7, nerve: 1.5, rouse: 0.9, ear: 1, override: 'drop_run' },
  drunk:   { w: 0.6, nerve: 0.5, rouse: 2, ear: 0.7, override: 'ignore' },
  devout:  { w: 0.7, nerve: 1, rouse: 1, ear: 1, swap: { freeze: 'pray', cover: 'pray', keep_working: 'pray' } },
  hothead: { w: 0.6, nerve: 1.3, rouse: 1, ear: 1, swap: { hide: 'look', cover: 'return_fire', freeze: 'look' } },
};

// ---- profiles ----------------------------------------------------------------------------------------------------------
// The first row whose `when` matches is the person's profile. when: (all given keys must hold)
//   child: true          the person is a child (c.child)
//   kin: true            has family to run to (c.kin, or another member of a ring family household)
//   armed: true|false    carries a gun
//   any: [...]           at least one of: occ:<occupation key> | faction:<faction> | title:<word in their title>
// firm: the temperament cannot override it (a parent runs to their child, drunk or not)
// pick: { near|mid|far|any: { reaction: weight } } (a band with no row uses `any`)
export const PROFILES = [
  { id: 'child', when: { child: true }, firm: true, pick: { near: { hide_low: 3, wail: 1 }, mid: { hide_low: 4, freeze: 1 }, far: { hide_low: 2, freeze: 2 } } },
  { id: 'parent', when: { kin: true, armed: false }, firm: true, pick: { any: { run_kin: 1 } } },
  { id: 'lawman', when: { any: ['faction:warden', 'occ:guard', 'occ:night_watch', 'occ:sentry', 'occ:tollman', 'occ:lookout', 'occ:bouncer', 'occ:drill_sergeant', 'title:deputy', 'title:sheriff', 'title:marshal', 'title:constable', 'title:guard'] },
    pick: { near: { return_fire: 3, look: 1 }, mid: { look: 5, call_in: 1 }, far: { look: 3, call_in: 2 } } },
  { id: 'medic', when: { any: ['occ:medic', 'occ:vet', 'title:medic', 'title:doctor', 'title:nurse'] }, pick: { near: { cover: 2, tend: 1 }, mid: { tend: 3, cover: 1 }, far: { tend: 2, keep_working: 1 } } },
  { id: 'veteran', when: { any: ['occ:scout', 'occ:hunter', 'occ:gator_hunter', 'occ:quartermaster', 'occ:caravan_hand', 'occ:armorer', 'occ:rancher', 'title:veteran', 'title:soldier'] },
    pick: { near: { return_fire: 3, cover: 2 }, mid: { cover: 3, look: 2 }, far: { look: 1, cover: 1, keep_working: 1 } } },
  { id: 'trader', when: { any: ['occ:storekeeper', 'occ:barkeep', 'occ:innkeeper', 'occ:fuel_seller', 'occ:company_clerk', 'occ:card_dealer', 'occ:assayer', 'occ:cook', 'title:trader', 'title:merchant', 'title:shop'] },
    pick: { near: { hide: 3, cover: 1 }, mid: { hide: 4, freeze: 1 }, far: { hide: 2, keep_working: 1 } } },
  { id: 'faithful', when: { any: ['occ:preacher', 'occ:grave_digger', 'title:preacher', 'title:priest'] }, pick: { near: { pray: 2, cover: 1 }, mid: { pray: 3, hide: 1 }, far: { pray: 1, keep_working: 1 } } },
  { id: 'wire', when: { any: ['occ:radio_operator', 'occ:newsman', 'occ:harbourmaster', 'occ:judge', 'title:radio'] }, pick: { near: { cover: 1, call_in: 2 }, any: { call_in: 3, hide: 1 } } },
  { id: 'hand', when: { any: ['occ:digger', 'occ:powder_man', 'occ:woodcutter', 'occ:smith', 'occ:millhand', 'occ:refinery_hand', 'occ:pumper', 'occ:salt_raker', 'occ:dockhand', 'occ:harvest_crew', 'occ:mechanic', 'occ:chop_mechanic', 'occ:carpenter', 'occ:tanner', 'occ:porter', 'occ:shipwright'] },
    pick: { near: { cover: 2, flee: 2 }, mid: { freeze: 2, cover: 1, keep_working: 1 }, far: { keep_working: 3, freeze: 1 } } },
  { id: 'armed', when: { armed: true }, pick: { near: { return_fire: 2, cover: 2 }, mid: { look: 2, cover: 1 }, far: { look: 1, keep_working: 1 } } },
  { id: 'civilian', when: {}, pick: { near: { flee: 3, cover: 2, scream: 1, freeze: 1 }, mid: { flee: 2, hide: 2, freeze: 1 }, far: { freeze: 1, keep_working: 2, hide: 1 } } },
];

export const REACT_ROWS = { REACT, REACTIONS, TEMPERAMENTS, PROFILES };

// ---- validation (the World Forge's) ------------------------------------------------------------------------------------
const POSES = ['stand', 'crouch', 'prone', 'handsUp', 'kneel', 'aim', 'stoop'];
const MOVES = ['none', 'away', 'cover', 'toward', 'door', 'bed', 'kin', 'fight'];
const BANDS = ['near', 'mid', 'far', 'any'];
const num = (v) => typeof v === 'number' && Number.isFinite(v);
export function validateReactions(rows = REACT_ROWS) {
  const errors = [], R = rows.REACT ?? {}, X = rows.REACTIONS ?? {}, T = rows.TEMPERAMENTS ?? {}, P = rows.PROFILES ?? [];
  for (const k of ['earMul', 'wallMul', 'sleepEar', 'errBase', 'errPerM', 'errWall', 'errMax', 'distErr', 'seeR', 'seeRNight', 'screamR', 'doorR', 'kinR', 'hop', 'shortLeg', 'maxPerShot']) if (!num(R[k]) || R[k] < 0) errors.push(`REACT.${k} must be a number >= 0`);
  if (!(R.bands?.near > R.bands?.mid && R.bands?.mid > 0 && R.bands?.near < 1)) errors.push('REACT.bands: 0 < mid < near < 1');
  for (const k of ['delay', 'wake']) if (!Array.isArray(R[k]) || !(R[k][0] >= 0 && R[k][1] >= R[k][0])) errors.push(`REACT.${k}: [lo, hi] with 0 <= lo <= hi`);
  if (R.wake && R.delay && !(R.wake[0] > R.delay[1])) errors.push('REACT.wake must start after REACT.delay ends (a sleeper wakes slower)');
  if (!(R.wallMul > 0 && R.wallMul <= 1)) errors.push('REACT.wallMul in (0, 1]');
  if (!(R.jump?.cell > 0 && R.jump?.halfLife > 0 && R.jump?.perShot > 0 && R.jump?.max > 0)) errors.push('REACT.jump: cell, halfLife, perShot, max > 0');
  for (const [id, x] of Object.entries(X)) {
    if (!POSES.includes(x.pose)) errors.push(`reaction ${id}: pose ${x.pose} not one of ${POSES.join('|')}`);
    if (!MOVES.includes(x.move)) errors.push(`reaction ${id}: move ${x.move} not one of ${MOVES.join('|')}`);
    if (!Array.isArray(x.secs) || !(x.secs[0] >= 0 && x.secs[1] >= x.secs[0])) errors.push(`reaction ${id}: secs [lo, hi]`);
    if (!num(x.speed) || x.speed < 0 || x.speed > 8) errors.push(`reaction ${id}: speed 0..8`);
    if (x.move !== 'none' && x.move !== 'fight' && !(x.speed > 0)) errors.push(`reaction ${id}: a moving reaction needs a speed`);
    if (!Array.isArray(x.lines) || !x.lines.length) errors.push(`reaction ${id}: at least one bark line`);
    if (x.needs && x.needs !== 'armed') errors.push(`reaction ${id}: needs is 'armed' or nothing`);
  }
  let wsum = 0;
  for (const [id, t] of Object.entries(T)) {
    if (!(t.w > 0)) errors.push(`temperament ${id}: w > 0`); else wsum += t.w;
    for (const k of ['nerve', 'rouse', 'ear']) if (!(t[k] > 0)) errors.push(`temperament ${id}: ${k} > 0`);
    if (t.override && !X[t.override]) errors.push(`temperament ${id}: override ${t.override} is no reaction`);
    for (const [a, b] of Object.entries(t.swap ?? {})) if (!X[a] || !X[b]) errors.push(`temperament ${id}: swap ${a}->${b} names no reaction`);
  }
  if (!(wsum > 0)) errors.push('no temperaments');
  const ids = new Set();
  P.forEach((p, i) => {
    if (!p.id || ids.has(p.id)) errors.push(`profile ${i}: id missing or repeated`); ids.add(p.id);
    for (const k of Object.keys(p.when ?? {})) if (!['child', 'kin', 'armed', 'any'].includes(k)) errors.push(`profile ${p.id}: unknown when.${k}`);
    for (const a of p.when?.any ?? []) if (!/^(occ|faction|title):[a-z_]+$/.test(a)) errors.push(`profile ${p.id}: any entry ${a} is not occ:|faction:|title:`);
    const bands = Object.keys(p.pick ?? {});
    if (!bands.length) errors.push(`profile ${p.id}: no pick`);
    if (!p.pick?.any && !['near', 'mid', 'far'].every((b) => p.pick?.[b])) errors.push(`profile ${p.id}: give near, mid and far, or any`);
    for (const b of bands) {
      if (!BANDS.includes(b)) errors.push(`profile ${p.id}: band ${b}`);
      for (const [r, w] of Object.entries(p.pick[b])) { if (!X[r]) errors.push(`profile ${p.id}.${b}: no reaction ${r}`); if (!(w > 0)) errors.push(`profile ${p.id}.${b}.${r}: weight > 0`); }
    }
  });
  const last = P[P.length - 1];
  if (!last || Object.keys(last.when ?? {}).length) errors.push('the last profile must match everyone (when: {})');
  return { ok: !errors.length, errors, counts: { reactions: Object.keys(X).length, temperaments: Object.keys(T).length, profiles: P.length } };
}
