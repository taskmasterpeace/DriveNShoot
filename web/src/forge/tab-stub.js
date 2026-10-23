// The tabs other agents are building the systems for (docs/design/WEB_FORGE.md §3.7): TOWN, SITE, LIFE, VOICE. Each says
// exactly what it will edit, what the game already holds there today (counted from the rows), how an agent drives it now,
// and where its design lives. When a system lands, its tab grows from this card into an editor on the same model.
import { el, svg, showDoc } from './core.js';
import { ZONES, KINDS, RING, RESIDENTS } from '../data/ring.js';
import { ATLAS_SITES, ATLAS_BASES, ATLAS_CAST, ATLAS_SITUATIONS } from '../data/atlas.js';
import { BASES } from '../data/bases.js';
import { INFECTED } from '../data/infected.js';
import { FACTIONS } from '../data/society.js';
import { BREEDS } from '../data/dogs.js';
import { NPCS, BARKS } from '../data/npcs.js';
import { TOPICS } from '../data/talk.js';

const nodes = NPCS.reduce((n, p) => n + Object.keys(p.nodes ?? p.def?.nodes ?? {}).length, 0);
const STUBS = {
  town: {
    label: 'Town', icon: 'town', title: 'TOWN', tagline: 'A city\'s zones, blocks, lots and landmarks, as rows the ring generator reads.',
    edits: ['zones and their rules (which kinds stand where, density, ruin share, loot, palettes)', 'blocks and lots: pin, merge, clear; a landmark row per town', 'kinds and units (footprints, plans, bays, back doors)', 'who lives there (households, squats, nests) by zone'],
    today: [`the Phoenix ring: ${Object.keys(ZONES).length} zones, ${Object.keys(KINDS).length} building kinds, radius ~${RING.radius} m with a lobed edge`, `residents as rows: ${Object.keys(RESIDENTS).length} household kinds`, 'corridor towns from usmap placements (MAP tab edits their slots and streets)', 'authored buildings from the Building Lab (BUILDING tab)'],
    agent: ['ring', 'ring x= z=', 'residents', 'author row= x= z='],
    docs: ['docs/design/WEB_STREAMING.md', 'docs/design/WEB_FLOORPLANS.md', 'docs/design/WEB_LOOK.md'],
  },
  site: {
    label: 'Site', icon: 'site', title: 'SITE', tagline: 'The atlas\'s places, the fifty bases, caves, bunkers and the secret facilities under them.',
    edits: ['atlas sites: kind, holder, situation, footprint, where it stands (lat/lon, projected)', 'a base per state: fence, gate, towers, buildings, posts, patrols, boxes', 'caves and bunker levels (storeys going down), secret facilities and their projects', 'radiation zones round them (painted on BRUSH today)'],
    today: [`${ATLAS_SITES.length} atlas sites, ${ATLAS_BASES.length} bases (one a state), ${ATLAS_CAST.length} cast archetypes, ${Object.keys(ATLAS_SITUATIONS).length} fight situations`, `${Object.keys(BASES).length} base built in the game: OUTPOST NINE (data/bases.js)`, 'all of them drawn on the MAP tab (ATLAS SITES, 50 BASES layers)'],
    agent: ['base', 'map', 'node tools/atlas-project.mjs'],
    docs: ['docs/design/WEB_ATLAS.md', 'docs/design/WEB_MILITARY.md', 'docs/design/WEB_STOREYS.md'],
  },
  life: {
    label: 'Life', icon: 'life', title: 'LIFE', tagline: 'Who and what lives where: animals by biome, the infected, factions, and when they spawn.',
    edits: ['fauna rows by biome x region x time (Florida first: gators, hogs, deer, panthers, snakes, birds)', 'the infected: the Greyborn\'s societies and traps, the Grapevine\'s hunting grounds', 'factions: territory, strength, relations; the director\'s event rows', 'spawn budgets per chunk, density x time of day x (1 - human presence)'],
    today: [`${Object.keys(INFECTED).length} infected kinds as rows`, `${Object.keys(FACTIONS).length} factions with standing and memory`, `${Object.keys(BREEDS).length} dog breeds, stray packs and caches`, 'the director: hunters, raids, the dead drawn to a bloody night'],
    agent: ['factions', 'dogs', 'director', 'spawn kind= count='],
    docs: ['docs/design/WEB_INFECTED.md', 'docs/design/THE_INFECTED.md', 'docs/design/WEB_WORLD_MEMORY.md', 'docs/design/WEB_DOGS.md', 'docs/design/LIVING_WOUND_ECOSYSTEM.md'],
  },
  voice: {
    label: 'Voice', icon: 'voice', title: 'VOICE', tagline: 'Every line a living person says, its variations, who voices it, and the audio waiting to be made.',
    edits: ['dialogue rows: lines, choices, conditions, effects (the content-pack schema)', 'variations per line (mood, standing, time, role) so nobody repeats', 'voice casting: one locked voice per character', 'the generated-audio queue: what is missing, what is stale, what is approved'],
    today: [`${NPCS.length} named people with ${nodes} dialogue nodes`, `${Object.keys(BARKS).length} bark sets, ${Object.keys(TOPICS).length} talk topics`, 'content packs (content/*.json) add people and their trees without code'],
    agent: ['talk id=', 'registerNpc', 'content packs: content/*.json'],
    docs: ['docs/design/WEB_WORLD_EDITOR_PLAN.md', 'docs/design/WEB_FAN_SERVICE_BIBLE.md', 'docs/skills/em3/SKILL.md'],
  },
};

export function stubTab(id) {
  const s = STUBS[id];
  const pane = el('section', { class: 'pane pane-stub', id: `pane-${id}` });
  const card = el('div', { class: 'plate stubcard' },
    el('div', { class: 'bigicon', html: svg(s.icon) }),
    el('h2', {}, s.title, el('span', { class: 'badge' }, 'PLANNED · BEING BUILT')),
    el('div', { class: 'tagline' }, s.tagline),
    el('div', { style: { color: 'var(--muted)', fontSize: '12.5px' } }, 'This tab will write data rows the game reads live, validate them with the engine\'s own checks and push them into the running game, the way MAP and BRUSH do. Until its system lands, here is what it covers.'),
    el('div', { class: 'stubcols' },
      el('section', {}, el('h3', {}, 'IT WILL EDIT'), el('ul', {}, s.edits.map((t) => el('li', {}, t)))),
      el('section', {}, el('h3', {}, 'IN THE GAME TODAY'), el('ul', {}, s.today.map((t) => el('li', {}, t)))),
      el('section', {}, el('h3', {}, 'DRIVE IT NOW'), el('ul', {}, s.agent.map((t) => el('li', {}, el('code', {}, t)))))),
    el('div', { class: 'doclinks' }, s.docs.map((d) => el('button', { class: 'btn mini', html: `${svg('doc')}<span>${d.split('/').pop().replace('.md', '')}</span>`, onclick: () => showDoc(d) }))));
  pane.append(card);
  return { id, label: s.label, icon: s.icon, pane, stub: true, async init() {}, onShow() {} };
}
