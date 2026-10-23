// The engine, in the forge page (docs/design/WEB_FORGE.md §3.2 "validate with the engine's own checks, preview with its
// own generators"): the same WorldIndex, BrushField and chunk generator the game runs, fed the rows the forge holds.
// Nothing here is a mock: an exit the forge says the engine will skip is one WorldIndex skipped; a chunk preview is
// layoutChunk's own output.
import USMAP from '../data/usmap.json';
import { reloadBrush, brushField } from '../world/brush.js';

let W = null, Wkey = null, gen = null;
// Put rows into this page's copy of the module the engine reads (the game's copy is pushed separately: forgePush).
function adopt(doc) { for (const k of Object.keys(doc)) USMAP[k] = doc[k]; }

// A WorldIndex over these rows (cached by the file's hash). Its warnings are the engine's own verdicts.
export async function worldOf(doc, hash) {
  if (W && Wkey === hash) return W;
  const { WorldIndex } = await import('../world/worldindex.js');
  adopt(doc);
  const t0 = performance.now();
  W = new WorldIndex();
  W.forgeMs = +(performance.now() - t0).toFixed(1);
  Wkey = hash;
  return W;
}
export async function engineCheck(doc, hash) {
  const w = await worldOf(doc, hash);
  return { warnings: w.warnings.slice(), exitsBuilt: w.exits.length, townsBuilt: w.towns.filter((t) => t.built).length, ribbons: w.ribbons.length, buildings: w.buildings.length, signs: w.signs.length, ms: w.forgeMs };
}

// One chunk laid out by the game's generator with these brush rows (and, for the "before", with none).
export async function layout(W2, cx, cz) {
  gen ??= await import('../world/chunkgen.js');
  const tiles = { foot: { a: new Uint8Array(256 * 256), any: false }, car: { a: new Uint8Array(128 * 128), any: false } };
  const g = gen.layoutChunk(W2, cx, cz, tiles, null, gen.makeScratch());
  let r; do r = g.next(); while (!r.done);
  return r.value;
}
export function setBrush(doc) { return reloadBrush(JSON.parse(JSON.stringify(doc))); }
export { brushField };
