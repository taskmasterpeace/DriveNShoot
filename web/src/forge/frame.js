// Where a usmap row lands in the world (docs/design/WEB_STREAMING.md §4 F3): world = (u - PHX) x K, except a town's own
// streets and building slots, which keep their authored scale round the town and are turned square to the world
// (world/worldindex.js buildTowns). These are that transform and its inverse, so the forge and the agent commands can
// talk in world metres (teleport's frame) and still write usmap rows.
import { STREAM } from '../data/streaming.js';
import { toWorld, toUsmap } from '../world/geo.js';

// The town a street (ST-<town>-<name>) or a placement (<town>-...) belongs to, among the doc's towns.
export function townOf(doc, coll, id) {
  if (coll === 'streets') { const m = /^ST-(.+)-[^-]+$/.exec(id); return m ? doc.towns.find((t) => t.id === m[1]) ?? null : null; }
  if (coll === 'placements') return doc.towns.filter((t) => id.startsWith(`${t.id}-`)).sort((a, b) => b.id.length - a.id.length)[0] ?? null;
  return null;
}
// The town frame: centre (world), rotation that squares its main street, scale.
export function townFrame(doc, town) {
  const [x, z] = toWorld(town.pos);
  const main = (doc.streets ?? []).find((r) => r.id === `ST-${town.id}-main`);
  let ang = 0;
  if (main) { const a = main.pts[0], b = main.pts[main.pts.length - 1]; ang = Math.atan2(b[1] - a[1], b[0] - a[0]); }
  const rot = Math.round(ang / (Math.PI / 2)) * (Math.PI / 2) - ang;
  const [tu, tv] = toUsmap(x, z);
  return { x, z, tu, tv, rot, cos: Math.cos(rot), sin: Math.sin(rot), s: STREAM.townScale };
}
// usmap point -> world point for a row of coll/id (the engine's own placement).
export function rowToWorld(doc, coll, id, p) {
  const t = townOf(doc, coll, id);
  if (!t) return toWorld(p);
  const F = townFrame(doc, t), dx = (p[0] - F.tu) * F.s, dz = (p[1] - F.tv) * F.s;
  return [F.x + dx * F.cos - dz * F.sin, F.z + dx * F.sin + dz * F.cos];
}
// world point -> usmap point for a row of coll/id.
export function worldToRow(doc, coll, id, x, z) {
  const t = townOf(doc, coll, id);
  if (!t) return toUsmap(x, z);
  const F = townFrame(doc, t), wx = x - F.x, wz = z - F.z;
  const dx = wx * F.cos + wz * F.sin, dz = -wx * F.sin + wz * F.cos;
  return [F.tu + dx / F.s, F.tv + dz / F.s];
}
