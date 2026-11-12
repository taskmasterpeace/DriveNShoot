// STOREYS v2 for agents (docs/design/WEB_STOREYS.md §9): the ring's towers (world/ringrise.js), the facade kit
// (world/facades.js) and the floors-as-places law across buildings (world/storeys.js across / floorShare).
import { RING_RISE, MAX_ABOVE, ACROSS, DANGER, FACADE } from '../data/storeys.js';

const r1 = (n) => Math.round(n * 10) / 10;

export function storeysCommands(api, need) {
  const g = api.g, P = () => g.player;
  const RR = () => g.ringrise;
  return {
    rise: {
      group: 'world',
      desc: 'The Phoenix ring\'s towers (STOREYS v2, data/storeys.js RING_RISE, world/ringrise.js): the lots that stand 2-6 storeys - the DOWNTOWN belt of hotels, offices and apartment blocks round the island (4-6), the Strip (2-3), the dead houses (2), the Burn\'s adobe shells (2-3) - built by the generated-town builder in each HOT ring chunk (stairs to every floor and up to the roof, parapets, fire escapes, plank bridges between facing roofs, loot per floor richer upstairs) and dressed by the facade kit. No args: the system\'s counts and every live riser within radius (default 300 m) of x,z (default you): id, kind, zone, storeys, floor heights, a walkable roof, its fire escape (side, landings), its roof bridges, its rooftop rifleman. id=<riser id> one in full; go=true with id= stands you in it: floor=<k> (0 = outside its street door, k = that floor beside a window on its front wall, -1 = its roof, behind the parapet); escape=true: at the foot of its fire escape. bridges=true lists the live roof bridges (ends, heights). on=false takes every tower down (the ring as it was: one storey), on=true builds them again.',
      args: { x: { type: 'number' }, z: { type: 'number' }, radius: { type: 'number' }, id: { type: 'string' }, go: { type: 'boolean' }, floor: { type: 'number' }, escape: { type: 'boolean' }, bridges: { type: 'boolean' }, on: { type: 'boolean' } },
      run: async ({ x, z, radius = 300, id, go, floor = 0, escape, bridges, on } = {}) => {
        const R = RR();
        need(R, 'no ring towers in this world');
        if (on !== undefined) {
          R.enabled = !!on;
          if (!on) R.clear(); else for (const L of g.streamer.hot.values()) if (L.ring) R.chunkOn(L);
          return R.status();
        }
        if (bridges) return { bridges: R.bridges().map((b) => ({ ...b, S: undefined, x0: r1(b.x0), z0: r1(b.z0), x1: r1(b.x1), z1: r1(b.z1) })) };
        if (id) {
          const q = R.record(id);
          need(q, `no live riser "${id}" (rise lists the ones near you; a riser is built only while its chunk is hot)`);
          const v = R.view().find((o) => o.id === id);
          if (go) {
            const B = q.R.B, S = q.R.S, p = P();
            if (p.inVehicle) g.exitVehicle(true);
            let at;
            if (escape) {
              need(q.R.E, `${id} has no fire escape`);
              const f0 = q.R.E.flights[0]; at = { x: f0.bottomOut.x, z: f0.bottomOut.z, y: 0 };
            } else if (floor === 0) {
              const d = B.doors.find((o) => o.kind === 'door' && o.side === B.front) ?? B.doors[0];
              at = { x: d.side === 'W' ? B.x0 - 1.5 : d.side === 'E' ? B.x1 + 1.5 : d.at, z: d.side === 'N' ? B.z0 - 1.5 : d.side === 'S' ? B.z1 + 1.5 : d.at, y: 0 };
            } else {
              need(S, `${id} has no stairs`);
              const roof = floor < 0, k = roof ? S.n : floor;
              need(k >= 1 && k <= S.n, `floor ${floor}: ${id} has floors 1..${S.n}${S.n === B.n ? ' (-1: the roof)' : ''}`);
              need(!roof || S.n === B.n, `${id}'s roof is not reached by its stairs`);
              const f = B.front, out = f === 'N' || f === 'W' ? -1 : 1, horiz = f === 'N' || f === 'S', fixed = f === 'N' ? B.z0 : f === 'S' ? B.z1 : f === 'W' ? B.x0 : B.x1;
              const w = (q.e.built.upWins ?? []).filter((o) => o.b === B.id && o.k === k && (horiz ? o.nz === out : o.nx === out));
              const A = S.area, clear = (px, pz) => !(A && px > A.minX - 0.8 && px < A.maxX + 0.8 && pz > A.minZ - 0.8 && pz < A.maxZ + 0.8);
              const wc = w.map((o) => (horiz ? o.x : o.z)).find((c) => clear(horiz ? c : fixed - out * 0.9, horiz ? fixed - out * 0.9 : c)) ?? (horiz ? (B.x0 + B.x1) / 2 : (B.z0 + B.z1) / 2);
              const ins = roof ? 1.0 : 0.75;
              at = { x: horiz ? wc : fixed - out * ins, z: horiz ? fixed - out * ins : wc, y: S.Y[k] };
            }
            if (Math.hypot(p.x - at.x, p.z - at.z) > 150) await api.call('teleport', { x: at.x, z: at.z });
            p.x = at.x; p.z = at.z; p.gy = at.y; p.vx = 0; p.vz = 0; g.standOn(p);
            g.camLook.x = p.x; g.camLook.z = p.z; g.camFloor = p.gy;
            await api._step(2);
            return { ...v, stood: { x: r1(p.x), z: r1(p.z), gy: r1(p.gy ?? 0), inside: g.storeys.at(p.x, p.z) === S, floor: S ? g.storeys.levelOf(S, p.gy ?? 0) : 0 } };
          }
          return v;
        }
        const px = x ?? P().x, pz = z ?? P().z;
        return { ...R.status(), rows: { maxAbove: MAX_ABOVE, belt: RING_RISE.belt, zones: Object.fromEntries(Object.entries(RING_RISE).filter(([k]) => k !== 'belt').map(([k, v]) => [k, v ? { share: v.share, storeys: v.storeys, kinds: v.kinds } : null])) },
          risers: R.view(px, pz, radius).sort((a, b) => Math.hypot(a.x - px, a.z - pz) - Math.hypot(b.x - px, b.z - pz)) };
      },
    },
    facades: {
      group: 'world',
      desc: 'The facade kit (STOREYS v2, data/storeys.js FACADE, world/facades.js): what dresses every storeyed building\'s outside - each upper window bay glass (a cracked pane left in its top), boarded (planks with a firing slit at eye height), blown (soot up the wall) or open, a lamp behind some after dark (an emissive pane, never a light), a ledge at every floor line, a cornice, roof water tanks, HVAC boxes and sandbag nests (colliders on a roof you can stand on), hand-painted shop signs and a hotel\'s rooftop sign, rebar-and-hole damage, tin lean-tos and laundry lines. Five instanced meshes for the whole world. No args: the sources (the island, each live town, each hot ring chunk), instances used per mesh, the counts by kind, whether the lamps are on, its draw calls. on=false hides it all (an A/B), on=true shows it.',
      args: { on: { type: 'boolean' } },
      run: async ({ on } = {}) => { const F = g.facades; need(F, 'no facade kit'); if (on !== undefined) F.setEnabled(on); return { ...F.status(), rows: { window: FACADE.window, roof: FACADE.roof } }; },
    },
    floors: {
      group: 'world',
      desc: 'Floors as places to fight (STOREYS v2, data/storeys.js ACROSS, world/storeys.js across / floorShare): between two people a= and b= (ids; b defaults to you): their heights and buildings, whether they share a floor, the window law (someone up a building within ACROSS.window.reach m of the wall they look out of - roof m of a roof\'s edge - sees and is seen from the street and other buildings, at their own floor\'s height: -1 = no), whether a sees b now, and how much of a noise / a blast at a\'s height reaches b (1 same floor, 0.5 one floor apart, 0 two).',
      args: { a: { type: 'string' }, b: { type: 'string' } },
      run: async ({ a, b } = {}) => {
        const A = g.chars.find((c) => c.id === a), B = b ? g.chars.find((c) => c.id === b) : P();
        need(A && B, 'a= and b= are people (ids from query)');
        const S = g.storeys, who = (c) => ({ id: c.id, x: r1(c.x), z: r1(c.z), gy: r1(c.gy ?? 0), building: S.at(c.x, c.z)?.id ?? (S.at(c.x, c.z) ? 'island' : null) });
        const ay = A.gy ?? 0;
        return { a: who(A), b: who(B), sameFloor: S.sameFloor(A, B), across: r1(S.across(A, B)), sees: g.sees(A, B), noise: S.floorShare(ay, A.x, A.z, B), blast: S.floorShare(ay, A.x, A.z, B, ACROSS.blast), rows: ACROSS, danger: DANGER };
      },
    },
  };
}
