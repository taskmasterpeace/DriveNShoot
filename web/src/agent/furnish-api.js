// THE FURNISHING PASS for agents (docs/design/WEB_FURNISH.md; rows data/cgrooms.js PIECES[*].parts, DECOR, FRONTS; the
// rule systems/decor.js and world/citygen/build.js): the `decor` command and the checks.
import { PIECES, ROOM_TYPES, DECOR, FRONTS, validateCgRooms } from '../data/cgrooms.js';
import { KINDS, ARCHETYPES } from '../data/citygen.js';
import { layoutTown } from '../world/citygen/layout.js';
import { buildTown } from '../world/citygen/build.js';
import { auditTown } from '../world/citygen/audit.js';
import { freeSpot } from './citygen-api.js';

const r1 = (v) => Math.round(v * 10) / 10;

export function furnishCommands(api) {
  const g = api.g;
  return {
    decor: {
      group: 'world', desc: 'THE DETAIL ON THE FURNITURE (docs/design/WEB_FURNISH.md): the register on a counter, the goods on a shelf, the bottles in a cooler are drawn only for the town buildings within DECOR.near of you, from one pool of boxes (one draw call, looks only). Returns how many buildings are dressed, how many parts are drawn and how many are free, and for the building you stand in its kind, its pieces by name and what it wears on its street face.',
      args: {},
      run: async () => {
        const D = g.decor, p = g.player;
        let here = null;
        for (const [R, rec] of D.open) if (p.x > R.minX && p.x < R.maxX && p.z > R.minZ && p.z < R.maxZ) {
          const by = {}; for (const sol of R.B.floorSolids ?? []) for (const b of sol ?? []) if (b.piece) by[b.piece] = (by[b.piece] ?? 0) + 1;
          here = { id: R.B.id, kind: R.B.kind, parts: rec.slots.length, cut: R.cut ?? -1, pieces: by, front: FRONTS[R.B.kind] ?? null };
        }
        return { ...D.view(), here, rows: { near: DECOR.near, far: DECOR.far, max: DECOR.max } };
      },
    },
  };
}

export async function furnishChecks({ g, api, C, check }) {
  await check('furnish: the rows - every part of every piece validates (seven numbers, inside its piece, a colour or a palette); a part with a purple colour, a part with an unknown palette and a malformed part are each caught; a shop floor has a counter and a cooler, a workshop tyres and a drum, a warehouse pallets in the middle; the gas station is a shop-fronted building (no drive bays) with a canopy, two pumps, a sign board and a price sign', async () => {
    const a = validateCgRooms(Object.keys(KINDS));
    const keep = PIECES.shelf.parts;
    PIECES.shelf.parts = [[0, 0.5, 0.35, 0.9, 0.08, 0.3, '#8040c0']]; const b = validateCgRooms();
    PIECES.shelf.parts = [[0, 0.5, 0.35, 0.9, 0.08, 0.3, 'sweets']]; const c = validateCgRooms();
    PIECES.shelf.parts = [[0, 0.5, 0.35]]; const d = validateCgRooms();
    PIECES.shelf.parts = keep;
    const rows = ROOM_TYPES.sales.wall.includes('counter') && ROOM_TYPES.sales.wall.includes('cooler') && ROOM_TYPES.workshop.wall.includes('tyres') && ROOM_TYPES.workshop.wall.includes('drum') && ROOM_TYPES.warehouse.centre === 'pallet';
    const gas = !KINDS.gas_station.bays && KINDS.gas_station.canopy === true && FRONTS.gas_station.pumps === 2 && !!FRONTS.gas_station.board && !!FRONTS.gas_station.price;
    const withParts = Object.values(PIECES).filter((q) => q.parts?.length).length;
    return (a.length === 0 && b.length === 1 && c.length === 1 && d.length === 1 && validateCgRooms().length === 0 && rows && gas && withParts >= 24) || JSON.stringify({ a: a.slice(0, 3), b, c, d, rows, gas, withParts });
  });

  await check('furnish: 8 towns built headless - every town still audits clean; every piece of furniture knows what it is and which wall it backs onto; every whole gas station has a front door on its street side, a counter, and a cooler or shelves on its street floor; at least half the gas stations have pumps (a forecourt canopy, or a lean-to on a tight street) and every one that has them has two; no shop is bare and nine in ten have a counter; in every town at least one shop floor has rows of shelving in the middle', async () => {
    const bad = []; let gas = 0, two = 0, canopies = 0, shops = 0, counters = 0, towns = 0, rowsTowns = 0, furn = 0;
    const archs = Object.keys(ARCHETYPES).slice(0, 8);
    for (let i = 0; i < archs.length; i++) {
      const T = layoutTown({ arch: archs[i], seed: 2000 + i * 53, x: 30000 + i * 1500, z: -30000 });
      const built = buildTown(T), A = auditTown(built, T); towns++;
      const nPumps = built.boxes.filter((b) => b.tag === 'cg-pump').length, said = T.buildings.reduce((n, B) => n + (B.pumps ?? 0), 0);
      if (nPumps !== said) bad.push(`${archs[i]}: ${nPumps} pump colliders for ${said} pumps`);
      if (!A.ok) bad.push(`${archs[i]}: audit ${A.bad[0]}`);
      let rows = false;
      for (const B of T.buildings) {
        const sol = B.floorSolids?.[0] ?? [], names = sol.filter((b) => b.tag === 'cg-furn').map((b) => b.piece);
        for (const b of sol) if (b.tag === 'cg-furn') { furn++; if (!PIECES[b.piece] || !(b.side >= -1 && b.side <= 3)) bad.push(`${B.id}: a piece with no name or wall`); }
        if (B.ruined || B.open) continue;
        if (B.kind === 'gas_station') {
          gas++;
          if (!B.doors.some((d) => d.kind === 'door' && d.side === B.front)) bad.push(`${B.id}: gas station with no front door`);
          if (!names.includes('counter') || !(names.includes('cooler') || names.includes('shelf'))) bad.push(`${B.id}: gas station floor is ${names.join(' ') || 'bare'}`);
          if (B.pumps) { canopies++; if (B.pumps >= 2) two++; }
        }
        if (B.kind === 'shop') { shops++; if (names.includes('counter')) counters++; if (!names.length) bad.push(`${B.id}: a bare shop`); if (names.filter((q) => q === 'aisle').length >= 2) rows = true; }
      }
      if (rows || !T.buildings.some((B) => B.kind === 'shop' && !B.ruined)) rowsTowns++;
    }
    const ok = !bad.length && gas >= 4 && shops >= 20 && furn > 2000 && canopies / gas >= 0.5 && two === canopies && counters / shops >= 0.9 && rowsTowns === towns;
    return ok || JSON.stringify({ bad: bad.slice(0, 5), nBad: bad.length, gas, canopies, two, shops, counters, furn, towns, rowsTowns });
  });

  await check('furnish: in a live town - standing in a gas station its furniture is dressed: the parts drawn for it are exactly the parts its pieces name, every one stands inside the building between its floor and its ceiling (the town\'s raised ground counted), and the detail is one mesh in the scene, however many buildings are dressed; with the cutaway at the street floor an upstairs piece\'s parts are not drawn; 90 m away the building\'s parts are back in the pool; when the town is removed nothing of it is left dressed', async () => {
    const CG = g.citygen, D = g.decor, p = g.player;
    const s = freeSpot(g, -5600, -12400, 280); if (!s) return 'no ground';
    const meshes = () => g.scene.children.filter((o) => o === D.mesh).length;
    const t = CG.stampAt({ id: 'cg-selftest-furnish', arch: 'interstate_exit', seed: 4242, x: s.x, z: s.z });
    try {
      const R = t.blds.find((q) => q.B.kind === 'gas_station' && !q.B.ruined && !q.B.open);
      if (!R) return 'no gas station in the town';
      const at = R.clearSpot ?? { x: (R.minX + R.maxX) / 2, z: (R.minZ + R.maxZ) / 2 };
      await C('teleport', { x: at.x + 200, z: at.z }); await api._step(40);
      const free0 = D.free.length;
      await C('teleport', { x: at.x, z: at.z }); await api._step(60);
      const rec = D.open.get(R); if (!rec) return 'the building was not dressed: ' + JSON.stringify(D.view());
      let want = 0; for (const sol of R.B.floorSolids ?? []) for (const b of sol ?? []) if (b.piece) want += PIECES[b.piece]?.parts?.length ?? 0;
      const y0 = t.built.y0 ?? 0; let out = 0;
      for (let j = 0; j < rec.slots.length; j++) { const q = j * 6, x = rec.m[q], y = rec.m[q + 1], z = rec.m[q + 2]; if (x < R.minX - 0.3 || x > R.maxX + 0.3 || z < R.minZ - 0.3 || z > R.maxZ + 0.3 || y < y0 - 0.01 || y > y0 + R.B.top + 0.2) out++; }
      const a = { parts: rec.slots.length, want, out, meshes: meshes(), used: free0 - D.free.length };
      // an upstairs floor under the cutaway: a two-storey building near, cut at 0
      let cutOk = 'no two-storey building dressed';
      for (const [R2, rec2] of D.open) {
        if (!rec2.lv.some((k) => k >= 1)) continue;
        const keep = R2.cut; R2.cut = 0; D.update(0); await api._step(1);
        const M = D.mesh.instanceMatrix.array; let upShown = 0, downShown = 0;
        for (let j = 0; j < rec2.slots.length; j++) { const sc = Math.abs(M[rec2.slots[j] * 16]) + Math.abs(M[rec2.slots[j] * 16 + 5]); if (rec2.lv[j] >= 1) { if (sc > 1e-6) upShown++; } else if (sc > 1e-6) downShown++; }
        R2.cut = keep; D.update(0);
        cutOk = upShown === 0 && downShown > 0 ? true : JSON.stringify({ upShown, downShown });
        break;
      }
      await C('teleport', { x: at.x + 90 + (R.maxX - R.minX), z: at.z }); await api._step(60);
      const far = { open: D.open.has(R) };
      await C('teleport', { x: at.x, z: at.z }); await api._step(60);
      const again = D.open.has(R);
      CG.remove('cg-selftest-furnish'); await api._step(40);
      const left = [...D.open.keys()].filter((q) => t.blds.includes(q)).length;
      const ok = a.parts === want && want >= 8 && a.out === 0 && a.meshes === 1 && a.used >= want && (cutOk === true || cutOk === 'no two-storey building dressed') && far.open === false && again === true && left === 0;
      return ok || JSON.stringify({ a, cutOk, far, again, left });
    } finally { if (CG.byId?.get('cg-selftest-furnish')) CG.remove('cg-selftest-furnish'); await C('teleport', { x: 0, z: -40 }); await api._step(3); }
  });
}
