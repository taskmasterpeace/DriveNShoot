// COMMANDS rows for L1 water and its L2 crossings (docs/design/WEB_RIVERS.md): what is here, every river, every bridge.
// Spread into the COMMANDS table by agent/api.js (after its own rows: this `water` replaces the island-only one and
// answers the same questions everywhere, the island included).
import { WATER, WATER_ROWS, validateWater } from '../data/water.js';
import { waveAnswer } from './sealife-api.js';

const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;

export function waterCommands(api, need) {
  const g = api.g;
  const P = () => g.player;
  const W = () => g.streamer?.W;
  const R = () => W()?.water ?? null;
  const ISLAND = { lake: { x: 390, z: 398, r: 52 }, bridge: { x: 416, z: 0 }, dock: { x: 360, z: 382 }, river: 'runs north-south around x≈410-428 on the east edge' };
  return {
    water: {
      group: 'observe',
      desc: 'action=depth (default) | wave | current. Water at x,z (default: you): depth (m) and what it means for a person (dry | wade | swim), the water\'s surface, the carved ground (bed) and the floor a mover stands on (relative to the ground), which body it is (river, creek, canal, wash, lake), whether a bridge deck is over it (and whether the asker is up on it: y=), and the nearest crossing. On the island it lists the island\'s own river, lake, bridge and dock. THE water authority: wading, swimming, drowning, flooding cars, boats and fords all read it (docs/design/WEB_RIVERS.md).',
      args: { x: { type: 'number' }, z: { type: 'number' }, y: { type: 'number' }, action: { type: 'string', enum: ['depth', 'wave', 'current'], default: 'depth' } },
      run: async ({ x, z, y, action = 'depth' }) => {
        const px = x ?? (P().inVehicle?.x ?? P().x), pz = z ?? (P().inVehicle?.z ?? P().z);
        // action=wave: the surface moving here (world/waves.js: kind, amp, height, slope, whitecap pinch, the sea state, the
        // boats riding it); action=current: the river's push here (m/s, downstream).
        if (action === 'wave' || action === 'current') { need(g.waves, 'no waves system'); return waveAnswer(g, action, px, pz); }
        const ay = y ?? (x === undefined ? (P().inVehicle ? P().inVehicle.y : P().gy) : undefined);
        const out = { x: r1(px), z: r1(pz), depth: r2(g.water.depthAt(px, pz, false, ay)), state: g.water.stateAt(px, pz, ay) };
        const inside = Math.abs(px) <= 464 && Math.abs(pz) <= 464;
        if (inside) return { ...out, island: true, places: ISLAND };
        const Rv = R();
        if (!Rv) return { ...out, island: false };
        const q = Rv.sample(px, pz), body = q.body ?? q.dry;
        const deck = Rv.deckAt(px, pz);
        let near = null, nd = Infinity;
        for (const B of Rv.bridges) { const d = Math.hypot(B.x - px, B.z - pz); if (d < nd) { nd = d; near = B; } }
        return { ...out, island: false, depthUnderDeck: deck >= 0 ? r2(q.depth) : undefined, surface: Number.isFinite(q.surf) ? r2(q.surf) : null, bedRel: r2(q.bedRel), floorRel: r2(q.floorRel),
          body: body ? { id: body.id, name: body.name, kind: body.kind, wet: !!body.wet } : null, edge: Number.isFinite(q.edge) ? r1(q.edge) : null,
          deck: deck >= 0 ? { lift: r2(deck), onIt: ay === undefined ? null : Rv.deckAt(px, pz, ay) >= 0 } : null,
          nearestCrossing: near ? { id: near.id, kind: near.kind, name: near.name, dist: Math.round(nd) } : null };
      },
    },
    rivers: {
      group: 'world',
      desc: 'L1 water as rows (data/water.js; the I-10 corridor baked from USGS NHD by tools/water-bake.mjs): every river, creek, canal and wash (kind, wet or dry, width, depth or bed, its ends, its source) and every lake and playa; the validator\'s findings (validateWater: what the World Forge\'s water tab shows); the knobs (ford, gorge, span...); the data sources and their licences. near=true sorts by distance from you.',
      args: { near: { type: 'boolean', default: false }, kind: { type: 'string' } },
      run: async ({ near, kind }) => {
        const Rv = R();
        need(Rv, 'no streamed world (the water rows ride on it)');
        let list = Rv.list();
        if (kind) list = list.filter((b) => b.kind === kind);
        const px = P().x, pz = P().z, d = (b) => Math.hypot((b.from?.[0] ?? b.centre[0]) - px, (b.from?.[1] ?? b.centre[1]) - pz);
        if (near) list.sort((a, b) => d(a) - d(b));
        const towns = W().towns.filter((t) => t.built), exits = W().exits;
        return { count: list.length, bodies: list, fords: Rv.fords.map((f) => ({ id: f.id, kind: f.kind, river: f.river, x: r1(f.x), z: r1(f.z), depth: f.d })),
          problems: validateWater(WATER_ROWS, { phoenix: true }), notes: validateWater(WATER_ROWS, { towns, exits }).filter((p) => /keeps it dry/.test(p)),
          knobs: { ford: WATER.ford, gorge: WATER.gorge, span: WATER.span, approach: WATER.approach, railH: WATER.railH, clearance: WATER.clearance, rampGrade: WATER.rampGrade },
          ground: Rv.T ? 'real terrain' : 'flat', sources: WATER_ROWS.sources.map((s) => ({ name: s.name, licence: s.licence, url: s.url })), buildMs: Rv.buildMs };
      },
    },
    bridges: {
      group: 'world',
      desc: 'L2 crossings (docs/design/WEB_RIVERS.md): every place a road meets the water, generated from the rows: a DECK (water deeper than ford, or ground more than gorge below the road: length, lift, approach fills, piers, the river depth or the drop under it), a CULVERT (a dry wash under the interstate in a fill) or a FORD (the road dips through). id= one in full; near=true sorts by distance from you. hp= / state=standing|damaged|down set a deck\'s condition (the hook the destruction system writes; nothing falls yet).',
      args: { id: { type: 'string' }, near: { type: 'boolean', default: false }, kind: { type: 'string', enum: ['deck', 'culvert', 'ford'] }, hp: { type: 'number' }, state: { type: 'string', enum: ['standing', 'damaged', 'down'] } },
      run: async ({ id, near, kind, hp, state }) => {
        const Rv = R();
        need(Rv, 'no streamed world (the crossings ride on it)');
        if (id) {
          const B = Rv.bridges.find((b) => b.id === id || b.name === id);
          need(B, `no crossing ${id} (bridges lists them)`);
          if (hp !== undefined || state) { need(B.kind === 'deck', `${B.id} is a ${B.kind}: only a deck has hit points`); if (hp !== undefined) B.hp = Math.max(0, Math.min(B.hpMax, hp)); if (state) B.state = state; g.emit('bridge', { id: B.id, hp: B.hp, state: B.state }); }
          return Rv.bridgeList().find((b) => b.id === B.id);
        }
        let list = Rv.bridgeList();
        if (kind) list = list.filter((b) => b.kind === kind);
        if (near) { const px = P().x, pz = P().z; list = list.map((b) => ({ ...b, dist: Math.round(Math.hypot(b.x - px, b.z - pz)) })).sort((a, b) => a.dist - b.dist); }
        return { count: list.length, decks: list.filter((b) => b.kind === 'deck').length, culverts: list.filter((b) => b.kind === 'culvert').length, fords: list.filter((b) => b.kind === 'ford').length, crossings: list, warnings: Rv.warnings };
      },
    },
  };
}
