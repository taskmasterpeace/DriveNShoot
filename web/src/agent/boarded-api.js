// SOLID BLOCKS LOOK BOARDED UP, for agents (docs/design/WEB_BOARDED.md; rows data/interiors.js BOARDED; the rule
// world/city.js boardUp): the checks.
import { BOARDED } from '../data/interiors.js';

const purple = (hex) => { const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255; return b > g + 24 && r > g + 24; };

export async function boardedChecks({ g, check }) {
  await check('boarded: the rows are sane - a doorway a body would fit, windows smaller than the gap between them, one to six rows, a share between 0 and 1, colours that are colours and never purple', async () => {
    const K = BOARDED, cols = [K.dark, ...K.wood];
    const ok = K.door[0] >= 1 && K.door[0] <= 3 && K.door[1] >= 2 && K.door[1] <= 3 && K.doorPlanks >= 2 && K.doorPlanks <= 6 && K.win[0] < K.every - 1 && K.win[1] < K.storey - 0.5 &&
      K.floors >= 1 && K.floors <= 6 && K.upBoarded >= 0 && K.upBoarded <= 1 && K.plank > 0.05 && K.plank < 0.5 && K.thick > 0.02 && K.thick <= 0.2 && K.sill >= 0.6 &&
      cols.every((c) => /^#[0-9a-f]{6}$/i.test(c) && !purple(c)) && K.wood.length >= 1;
    return ok || JSON.stringify(K);
  });

  await check('boarded: every solid block of the island is nailed shut - each of the buildings you cannot enter carries four boarded doorways, at least four window openings and at least four planks a doorway; nothing stands more than 0.3 m off its wall or above its top; no building you can enter carries any; the island adds fewer than 6,000 boxes for it', async () => {
    const W = g.world, solid = W.buildings.filter((b) => b.boarded), open = W.buildings.filter((b) => b.enterable);
    const bad = []; let boxes = 0;
    for (const b of solid) {
      const T = b.boarded;
      if (b.enterable) { bad.push('a building you can enter is boarded'); continue; }
      boxes += T.boxes;
      if (T.doors !== 4 || T.wins < 4 || T.planks < 4 * BOARDED.doorPlanks || T.off > 0.3 || T.top > b.h + 1e-6) bad.push(JSON.stringify({ h: Math.round(b.h), w: Math.round(b.maxX - b.minX), ...T }));
    }
    const ok = solid.length >= 20 && !bad.length && !open.some((b) => b.boarded) && boxes > 500 && boxes < 6000;
    return ok || JSON.stringify({ solid: solid.length, bad: bad.slice(0, 4), nBad: bad.length, boxes });
  });
}
