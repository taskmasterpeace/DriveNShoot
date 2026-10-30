// SEMIS for agents (docs/design/WEB_SEMIS.md; systems/semis.js; rows in data/trailers.js): the `semi` command. The
// selftest's checks are in agent/semis-selftest.js.
import { VEHICLES } from '../systems/vehicles.js';
import { TRAILERS, ROAD_FIT, CLEARANCE, fitsHold, fitsRoad, fitsUnder, validateTrailers } from '../data/trailers.js';
import { validateDecks } from '../data/decks.js';
import { outfit } from '../systems/characters.js';

export function semisCommands(api, need) {
  const g = api.g, P = () => g.player;
  const S = () => { need(g.semis, 'no semis system'); return g.semis; };
  // A rig's tractor from an id that names either half (or the player's own, or the nearest).
  const tractorOf = (id) => {
    const v = id ? api.findVeh(id) : P().inVehicle?.tractor ? P().inVehicle : P().inVehicle?.carriedBy?.towedBy ?? null;
    if (v?.tractor) return v;
    if (v?.towedBy) return v.towedBy;
    if (v?.carriedBy?.towedBy) return v.carriedBy.towedBy;
    if (id) return null;
    let best = null, bd = 60;
    for (const t of g.vehicles) if (t.tractor) { const d = Math.hypot(t.x - P().x, t.z - P().z); if (d < bd) { bd = d; best = t; } }
    return best;
  };
  const trailerOf = (id) => {
    const v = id ? api.findVeh(id) : P().inVehicle?.carriedBy ?? P().onDeck?.v ?? P().inVehicle?.towing ?? null;
    if (v?.trailer) return v;
    if (v?.towing) return v.towing;
    if (v?.carriedBy) return v.carriedBy;
    if (id) return null;
    let best = null, bd = 60;
    for (const t of S().trailers) { const d = Math.hypot(t.x - P().x, t.z - P().z); if (d < bd) { bd = d; best = t; } }
    return best;
  };
  return {
    semi: {
      group: 'vehicle',
      desc: 'SEMIS (docs/design/WEB_SEMIS.md; data/trailers.js): tractor-trailers you drive a car INTO. A LONGHAULER sleeper tractor pulls a trailer joined at its kingpin (the trailer tracks behind it, cuts inside bends, swings the other way backing up, jackknifes if an empty one is braked hard at speed); a BOX TRAILER takes a car, a LAWMAN or a motorcycle up its slide-out ramp; the WIDE-LOAD LOWBOY (about two lanes, WIDE LOAD banners, flags, amber markers, escorted) takes an RV. A car in a hold rides in the trailer\'s frame: it shifts under hard braking unless chocked, its driver gets out and walks round it, and it drives back down the ramp. '
        + 'action=status (default): every trailer, tractor and the freight run. spawn: a hitched rig (trailer=box|wide, x z h, ai=none|traffic|semi, cargo=<vehicle type> loads one into the hold). hitch / unhitch: id=<tractor> (hitch: trailer=<id>; force=true couples it where it stands). ramp: id=<trailer|tractor> down=true|false. load: put vehicle id=<car> into trailer=<id>, chocked. chock: id=<car in a hold> on=true|false. fit: can a rig (id, or trailer=box|wide) use road=<interstate|divided|two-lane|rural|dirt|street> / pass under=<overpass|railBridge|lowBridge>; with no road/under, every class and kind. freight: kind=boxes|wideload a hauler run (near=true: just ahead of you; dir=1|-1). clear: the freight run gone. In the game: at the wheel of a tractor [G] hitches a trailer in reach, then [G] drops or raises its ramp, hold [G] to unhitch; at the wheel of a car in a hold, [G] works the ramp.',
      args: {
        action: { type: 'string', default: 'status', enum: ['status', 'spawn', 'hitch', 'unhitch', 'ramp', 'load', 'chock', 'fit', 'freight', 'clear'] },
        id: { type: 'string' }, trailer: { type: 'string' }, x: { type: 'number' }, z: { type: 'number' }, h: { type: 'number', default: 0 },
        ai: { type: 'string', default: 'none', enum: ['none', 'traffic', 'semi'] }, cargo: { type: 'string' }, paint: { type: 'string' },
        down: { type: 'boolean', default: true }, on: { type: 'boolean', default: true }, force: { type: 'boolean', default: false },
        road: { type: 'string' }, under: { type: 'string' }, kind: { type: 'string', default: 'boxes', enum: ['boxes', 'wideload'] }, near: { type: 'boolean', default: false }, dir: { type: 'number', default: 0 },
      },
      run: async (a) => {
        const s = S();
        const act = a.action;
        if (act === 'status') return { ...s.status(), rows: validateTrailers(VEHICLES, validateDecks) };
        if (act === 'spawn') {
          const kind = a.trailer ?? 'box';
          need(TRAILERS[kind], `trailer must be one of ${Object.keys(TRAILERS).join(', ')}`);
          const x = a.x ?? P().x + 12, z = a.z ?? P().z;
          const rig = s.spawnRig(kind, x, z, a.h, a.paint ?? '#7a4a24', { ai: a.ai === 'none' ? null : a.ai });
          if (a.ai !== 'none') { const d = g.addChar({ x, z, faction: 'drifter', colors: outfit('drifter'), name: 'Hauler', flag: 'US', hp: 150 }); if (d) g.seats.board(d, rig.K, 0); rig.K.ai = a.ai; }
          let loaded = null;
          if (a.cargo) {
            need(VEHICLES[a.cargo], `unknown cargo vehicle ${a.cargo}`);
            const C = g.vehiclesSys.spawn(a.cargo, rig.T.x, rig.T.z, a.h, '#5a5248');
            loaded = s.load(C, rig.T);
            if (!loaded.ok) g.vehiclesSys.remove(C);
          }
          return { ok: true, tractor: s.view(rig.K), trailer: s.view(rig.T), loaded };
        }
        if (act === 'hitch') {
          const K = tractorOf(a.id); need(K, 'no tractor (id=<tractor id>)');
          const T = a.trailer ? api.findVeh(a.trailer) : s.nearTrailer(K)?.T; need(T?.trailer, 'no trailer (trailer=<id>, or back up to one)');
          return { ...s.hitch(K, T, a.force), tractor: s.view(K) };
        }
        if (act === 'unhitch') { const K = tractorOf(a.id); need(K, 'no tractor'); return { ...s.unhitch(K), trailer: s.view(K.towing ?? null) }; }
        if (act === 'ramp') { const T = trailerOf(a.id); need(T, 'no trailer (id=<trailer or tractor id>)'); return { ...s.setRamp(T, a.down), trailer: s.view(T) }; }
        if (act === 'load') {
          const C = api.findVeh(a.id); need(C, 'no vehicle id=<car>');
          const T = trailerOf(a.trailer); need(T, 'no trailer=<id>');
          if (C.carriedBy) s.release(C, 'load');
          return { ...s.load(C, T), trailer: s.view(T) };
        }
        if (act === 'chock') { const C = api.findVeh(a.id); need(C?.carry, 'id must be a car in a hold'); s.chock(C, a.on); return { ok: true, cargo: s.view(C) }; }
        if (act === 'fit') {
          let dims;
          if (a.id) { const K = tractorOf(a.id); need(K, 'no rig'); dims = s.dims(K); }
          else { const R = TRAILERS[a.trailer ?? 'box']; need(R, 'trailer=box|wide'); const t = VEHICLES[R.vehicle], k = VEHICLES.semi; dims = { wid: Math.max(t.wid, k.wid), len: k.len / 2 - k.tractor.fifth + R.kingpin + t.len / 2, tall: Math.max(k.tall, t.tall, a.cargo ? R.floorY + (VEHICLES[a.cargo]?.tall ?? 0) : 0), wide: !!R.wide }; }
          const roads = a.road ? [a.road] : Object.keys(ROAD_FIT), unders = a.under ? [a.under] : Object.keys(CLEARANCE).filter((k) => k !== 'margin');
          return { dims, roads: Object.fromEntries(roads.map((r) => [r, fitsRoad(dims, r) ?? 'fits'])), under: Object.fromEntries(unders.map((u) => [u, fitsUnder(dims.tall, u) ?? 'clears'])), holds: a.cargo ? Object.fromEntries(Object.entries(TRAILERS).map(([k, R]) => [k, fitsHold(R, VEHICLES[a.cargo]) ?? 'fits'])) : undefined };
        }
        if (act === 'freight') { const F = s.spawnFreight(a.kind, { dir: a.dir, near: a.near }); need(F, 'no such freight kind'); return { ok: true, ...s.status().freight }; }
        if (act === 'clear') { s.despawnFreight(); return { ok: true }; }
        return { ok: false, error: `unknown action ${act}` };
      },
    },
  };
}
