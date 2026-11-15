// Migration: tools/fixtures/tables/infected.legacy.json -> src/data/tables/infected/*.csv + schemas. Run: node tools/tables/extract-infected.mjs
import { readFileSync } from 'node:fs';
import { extract, writeTables } from './extract.mjs';

const snap = JSON.parse(readFileSync(new URL('../fixtures/tables/infected.legacy.json', import.meta.url), 'utf8'));
const OUT = new URL('../../src/data/tables/infected/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const outs = [];
const add = (spec) => outs.push(...extract({ family: 'infected', ...spec }));
const SRC = 'design: docs/design/THE_INFECTED.md';
const SRC_H = 'design: docs/design/WEB_DEATHS.md';

add({
  table: 'Infected', rows: snap.INFECTED, parentCol: 'Breed', legacy: 'src/data/infected.js INFECTED',
  description: 'The infected, one row per breed (shambler, sprinter, echo, and the choir special): hit points, speed, senses, door work, legs, lunge, fall, fire and light. Sparse: a column applies to the breeds that use it. Claw: damage for a shambler or echo, a damage MULTIPLIER for a sprinter (as the legacy row has it).',
  tuples: { speed: ['Min', 'Max'], herd: ['Min', 'Max'] },
  units: { herd: 'count', hp: 'hit_points', speed: 'mps', trigger: 'mps', ear: 'm', wake: 'm', burst: 's', chase: 's', burstSpeed: 'mps', overheat: 's', rearm: 's', reach: 'm', workEvery: 's', boards: '', watch: 'm', cone: 'deg', phrase: 's', hear: 'm', call: 'm',
    hum: 'm', humEvery: 's', aura: 'm', legs: 'hit_points', crawl: 'mps', fire: 'm', light: 'm', 'sense.sight': 'm', 'sense.night': 'm', 'sense.lit': 'm', 'sense.cone': 'deg', 'sense.near': 'm', 'sense.steps': '', 'sense.hear': '', 'sense.smell': 'm', 'sense.memory': 's', 'sense.search': 's', 'sense.searchR': 'm', 'sense.scatter': 'm',
    'door.every': 's', 'door.dmg': 'hit_points', 'lunge.at': 'm', 'lunge.speed': 'mps', 'lunge.t': 's', 'lunge.cool': 's', 'fall.dmg': 'hit_points', 'fall.chance': '', 'fall.getUp': 's', 'fall.grab': 'm', claw: '' },
  ints: ['boards', 'herd.0', 'herd.1'], source: SRC,
  descs: { claw: 'Shambler and echo: damage per claw (hp). Sprinter: a damage MULTIPLIER on top (dimensionless). One legacy field, two meanings; split when the rows are next touched.', 'sense.steps': 'Multiplier on the footstep radius it hears (FootstepSettings).', 'sense.hear': 'Multiplier on a noise radius it hears.', 'sense.cone': 'Half-angle either side of its facing it sees (degrees).', herd: 'Bodies in the herd round a choir-touched one.', boards: 'Boards it can work off a window per visit.' },
});
add({
  table: 'HordeBreeds', rows: Object.fromEntries(snap.BREEDS.map((b, i) => [b, { order: i }])), parentCol: 'Breed', legacy: 'src/data/infected.js BREEDS',
  description: 'The breeds in the order a horde is made of them (Order 0 first).', units: { order: '' }, ints: ['order'], source: SRC,
});
add({
  table: 'FootstepSettings', rows: { default: snap.FOOTSTEPS }, parentCol: 'Setting', legacy: 'src/data/infected.js FOOTSTEPS',
  description: 'How far the living feet carry, by what they are doing (the infected hear it x their sense.steps); runAt is the speed that counts as running. One row.',
  units: { stand: 'm', walk: 'm', run: 'm', crouch: 'm', prone: 'm', swim: 'm', runAt: 'mps' }, source: SRC,
});
add({
  table: 'DriftSettings', rows: { default: snap.DRIFT }, parentCol: 'Setting', legacy: 'src/data/infected.js DRIFT',
  description: 'Hordes that hear a big noise: a horde within noise radius x PerR turns to it; only noises of MinR metres or more carry; it stays Linger seconds. One row.',
  units: { perR: '', minR: 'm', arrive: 'm', linger: 's' }, source: SRC,
});
add({
  table: 'InsideBuildings', rows: snap.INSIDE, parentCol: 'Kind', legacy: 'src/data/infected.js INSIDE',
  description: 'Who is inside a building when the street is generated, by building kind: bodies on the street storey N_Min..N_Max, and the breed shares (Mix_*, sum 1).',
  tuples: { n: ['Min', 'Max'] }, units: { n: 'count', 'mix.shambler': '', 'mix.sprinter': '', 'mix.echo': '' }, ints: ['n.0', 'n.1'], source: SRC,
});
add({
  table: 'ChoirSites', rows: Object.fromEntries(snap.CHOIR_SITES.map(({ id, ...r }) => [id, r])), parentCol: 'Site', legacy: 'src/data/infected.js CHOIR_SITES (an array in the game: Name is the id)',
  description: 'Choir sites: a silence with an address. Position in world metres; the player must be within Near metres for it to wake.', units: { x: 'm', z: 'm', near: 'm' }, source: SRC,
});
add({
  table: 'BreedAnswers', rows: snap.BREED_ANSWERS, parentCol: 'Breed', legacy: 'src/data/hordes.js BREED_ANSWERS',
  description: 'The ANSWER each breed demands (crowd, reflex, stealth) and the numbers that make it demand it. Sparse per breed.',
  units: { latchBelow: 'mps', windup: 's', steer: 'radps', overshoot: 'm', skid: 's', carLeap: 'm', hear: 'm', minR: 'm', delay: 's', gain: '', every: 's' }, source: SRC_H,
});
add({
  table: 'EchoMind', rows: { default: snap.ECHO_MIND }, parentCol: 'Setting', legacy: 'src/data/hordes.js ECHO_MIND',
  description: 'The smart Echo: stalk, hide, ambush, lure, night, learn (systems/echomind.js). One row.',
  units: { sense: '', keep: 'm', keepMax: 'm', learnKeep: 'm', seen: 'm', fov: 'deg', stalk: 'mps', flee: 'mps', hideFor: 's', move: 'm', ambushR: 'm', align: '', strike: 'm', claw: '', cool: 's', wait: 's', lureAfter: 's', lureEvery: 's', lureWin: 's', lureDrew: 'm', seenNight: 'm', beamSee: 'm', beamHalf: 'deg' }, source: SRC_H,
});
add({
  table: 'WarningSettings', rows: { default: snap.WARNINGS }, parentCol: 'Setting', legacy: 'src/data/hordes.js WARNINGS',
  description: 'Readable warnings: the groan, the sprinter scream, the dust a crowd kicks up. One row.',
  tuples: { 'groan.every': ['Min', 'Max'], 'dust.size': ['Min', 'Max'] },
  units: { 'groan.range': 'm', 'groan.every': 's', 'scream.range': 'm', 'dust.crowd': 'count', 'dust.radius': 'm', 'dust.every': 's', 'dust.scan': 's', 'dust.size': 'm' }, ints: ['dust.crowd'], source: SRC_H,
});
add({
  table: 'MigrationSettings', rows: { default: snap.MIGRATION }, parentCol: 'Setting', legacy: 'src/data/hordes.js MIGRATION',
  description: 'Hordes as events: a horde migrates down a highway. Speed, game hours between migrations, size, length, start distance, dust and witness ranges. One row.',
  tuples: { every: ['Min', 'Max'], size: ['Min', 'Max'], from: ['Min', 'Max'] },
  units: { speed: 'mps', every: 'gh', size: 'count', length: 'm', from: 'm', dustSeen: 'm', witness: 'm', report: 'game_min', lane: 'm', maxLive: 'count' }, ints: ['maxLive', 'size.0', 'size.1'], source: SRC_H,
});
writeTables(OUT, outs);
console.log(outs.map((o) => `${o.name}:${o.rows}`).join(' '));
console.log('rows', outs.reduce((a, o) => a + o.rows, 0), 'tables', outs.length);
