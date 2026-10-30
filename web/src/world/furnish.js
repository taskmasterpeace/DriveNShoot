// Furniture for the Phoenix island's planned buildings (world/city.js) and their floors above (world/storeys.js), with
// the ring's own placement and proof (world/ring.js furnish / placeOne, FURNITURE rows in data/ring.js, the NavProbe in
// world/floorplan.js). The ring's methods are borrowed as they are, on a furnisher of their own: nothing in ring.js moved,
// so the ring's buildings come out byte for byte as before (selftest "floor plans: the ring's plans are unchanged").
//
//   furnishRooms(L, g, rooms, K, Z, rng) -> the ring's furnish context ({ probe, starts, spots, placed, on, ... })
//     L      { x0, z0, x1, z1 }   the building's wall centre lines (the probe's window)
//     g      { doors, inner, boxes, props, beds, boxesIn }   doors [{ x, z, nx, nz, w }] on the wall line, inner partitions
//            in floorplan()'s format, boxes the walls as { x0, z0, x1, z1, h, base }; props/beds/boxesIn are filled
//     rooms  [{ type, x0, z0, x1, z1, ui, frontRoom }]   rows from data/floorplans.js ROOMS
//     K, Z   { label, loot } / { loot: [[table, w]] }   a container's label suffix and fallback loot table
//     rng    rngOf(...) (int, pick, range)
import { Ring } from './ring.js';

let F = null; // made on first use: ring.js and city.js import each other's module graph, so not at load time
export function furnishRooms(L, g, rooms, K, Z, rng) {
  if (!F) { F = Object.create(Ring.prototype); F.seed = 0x15a1d; F.noRare = true; }
  return F.furnish(L, g, rooms, K, Z, rng, []);
}
// One piece into a room through the same rules (opt as ring.js placeOne: aisle, gap, cands, defer). ctx from furnishRooms,
// or a bare one for a floor with no probe ({ zones, zr: new Map(), placed: [], spots: [], on: false }).
export function placePiece(t, room, g, K, Z, rng, ctx, opt) {
  if (!F) { F = Object.create(Ring.prototype); F.seed = 0x15a1d; F.noRare = true; }
  return F.placeOne(t, room, g, K, Z, rng, ctx, opt);
}
