// ROOMS FOR GENERATED BUILDINGS, for agents (docs/design/WEB_CG_ROOMS.md; rows data/cgrooms.js; the rule
// world/citygen/rooms.js): the `rooms` command (the rooms of the generated building you stand in) and the checks.
import { KIND_ROOMS, PIECES, ROOM_TYPES, CG_ROOMS, validateCgRooms } from '../data/cgrooms.js';
import { KINDS, ARCHETYPES } from '../data/citygen.js';
import { layoutTown, layoutBase } from '../world/citygen/layout.js';
import { buildTown } from '../world/citygen/build.js';
import { TownProbe } from '../world/citygen/audit.js';
import { freeSpot } from './citygen-api.js';
import { REACH } from '../data/reach.js';

const r1 = (v) => Math.round(v * 10) / 10;
const inR = (R, x, z) => x > R.minX && x < R.maxX && z > R.minZ && z < R.maxZ;

export function cgRoomsCommands(api, need) {
  const g = api.g;
  return {
    rooms: {
      group: 'world', desc: 'ROOMS OF A GENERATED BUILDING (docs/design/WEB_CG_ROOMS.md; rows data/cgrooms.js): the country-town, base or ring-tower building at x,z (default: where you stand): its kind, its layout row, and every room on every floor (floor, type, name, size, how many pieces stand in it, how many of the floor\'s containers live in a piece). No building there: the nearest one within 60 m. rows=true: the rows and their problems.',
      args: { x: { type: 'number' }, z: { type: 'number' }, rows: { type: 'boolean' } },
      run: async ({ x, z, rows }) => {
        if (rows) return { kinds: Object.keys(KIND_ROOMS).length, roomTypes: Object.keys(ROOM_TYPES).length, pieces: Object.keys(PIECES).length, numbers: CG_ROOMS, problems: validateCgRooms(Object.keys(KINDS)) };
        const p = g.player; x ??= p.x; z ??= p.z;
        let best = null, bd = 60, town = null;
        for (const t of g.citygen.live.values()) for (const R of t.blds) {
          const d = inR(R, x, z) ? 0 : Math.hypot((R.minX + R.maxX) / 2 - x, (R.minZ + R.maxZ) / 2 - z);
          if (d < bd) { bd = d; best = R; town = t; }
        }
        need(best, 'no generated building within 60 m (teleport to a country town, a base or a ring tower)');
        const furn = town.built.boxes.filter((b) => b.tag === 'cg-furn' && b.minX > best.minX && b.maxX < best.maxX && b.minZ > best.minZ && b.maxZ < best.maxZ);
        const loot = town.built.loot.filter((l) => l.b === best.B.id);
        return {
          id: best.B.id, kind: best.B.kind, name: best.B.name, storeys: best.B.n, ruined: !!best.B.ruined, row: KIND_ROOMS[best.B.kind] ?? null,
          at: { x: r1((best.minX + best.maxX) / 2), z: r1((best.minZ + best.maxZ) / 2) }, dist: r1(bd),
          rooms: (best.rooms ?? []).map((q) => ({ floor: q.k, type: q.type, name: q.name, w: r1(q.maxX - q.minX), d: r1(q.maxZ - q.minZ), x: r1((q.minX + q.maxX) / 2), z: r1((q.minZ + q.maxZ) / 2),
            pieces: furn.filter((b) => Math.abs(b.base - (best.B.Y[q.k] ?? 0)) < 0.05 && (b.minX + b.maxX) / 2 > q.minX && (b.minX + b.maxX) / 2 < q.maxX && (b.minZ + b.maxZ) / 2 > q.minZ && (b.minZ + b.maxZ) / 2 < q.maxZ).length })),
          containers: { all: loot.length, inPieces: loot.filter((l) => l.inPiece).length, loose: loot.filter((l) => !l.inPiece).length },
        };
      },
    },
  };
}

export async function cgRoomsChecks({ g, api, C, check }) {
  await check('cg rooms: the rows validate - every one of the building kinds has a rooms row, every room type and piece it names exists; an unknown layout, an unknown piece, a purple piece and a loot-holding piece shallow enough to be reached through a partition are each caught', () => {
    const a = validateCgRooms(Object.keys(KINDS));
    const keep = { k: KIND_ROOMS.house, p: ROOM_TYPES.living.wall, c: PIECES.sofa.col, bd: PIECES.basin.d };
    KIND_ROOMS.house = { street: ['maze', 'living'], up: keep.k.up }; const b = validateCgRooms();
    KIND_ROOMS.house = keep.k; ROOM_TYPES.living.wall = ['hovercraft']; const c = validateCgRooms();
    ROOM_TYPES.living.wall = keep.p; PIECES.sofa.col = '#8040c0'; const d = validateCgRooms();
    PIECES.sofa.col = keep.c;
    const e = validateCgRooms(['house', 'moon_base']);
    PIECES.basin.d = 0.3; const f = validateCgRooms(); PIECES.basin.d = keep.bd;
    return (a.length === 0 && b.length === 1 && c.length === 1 && d.length === 1 && e.length === 1 && f.length === 1 && validateCgRooms(null, 0.4 + REACH.touch).length === 0 && validateCgRooms(Object.keys(KINDS)).length === 0) || { a, b, c, d, e, f };
  });

  await check('cg rooms: 8 towns and a base built headless - every building you can enter has rooms on every floor you can reach; a house has a kitchen, a bedroom and a bathroom, a gas station a shop floor and a stock room, a school classrooms off a corridor; no piece stands in a wall, on another piece, at a street window or in a doorway; every room of every floor with a stair to it is walked into from the front door, and every street-floor container is within reach of walked floor with no partition between; no container in a piece is within a hand of the far side of a partition; the same containers as before (ids unique)', () => {
    const ids = Object.keys(ARCHETYPES), bad = [], seen = { blds: 0, rooms: 0, upRooms: 0, pieces: 0, loot: 0, inPiece: 0, kinds: new Set() };
    const want = { house: ['kitchen', 'bedroom', 'bath'], gas_station: ['sales', 'stock'], school: ['classroom', 'corridor'] }, had = {};
    const towns = [];
    for (let i = 0; i < 8; i++) towns.push(layoutTown({ arch: ids[(i * 5 + 1) % ids.length], seed: 500 + i * 61, x: 40000 + i * 1200, z: -30000 }));
    towns.push(layoutBase({ seed: 77, x: 60000, z: -30000 }));
    const over = (f, b, pad = -0.02) => f.minX < b.maxX + pad && f.maxX > b.minX - pad && f.minZ < b.maxZ + pad && f.maxZ > b.minZ - pad;
    for (const T of towns) {
      let built; try { built = buildTown(T); } catch (e) { bad.push(`${T.id}: threw ${e.message}`); continue; }
      const P = new TownProbe(built), lootIds = new Set();
      for (const l of built.loot) { if (lootIds.has(l.id)) bad.push(`${l.id}: twice`); lootIds.add(l.id); }
      for (const R of built.blds) {
        const B = R.B; if (B.open) continue;
        seen.blds++; seen.kinds.add(B.kind);
        const floors = B.ruined ? B.n : (R.S ? R.S.n : 0) + 1, rooms = R.rooms ?? [];
        for (let k = 0; k < Math.min(floors, B.n); k++) if (!rooms.some((q) => q.k === k)) bad.push(`${B.id}(${B.kind}): floor ${k} has no room`);
        seen.rooms += rooms.length;
        if (want[B.kind]) { const types = new Set(rooms.map((q) => q.type)); if (want[B.kind].every((t) => types.has(t))) had[B.kind] = true; }
        const mine = built.boxes.filter((b) => b.maxX > R.minX && b.minX < R.maxX && b.maxZ > R.minZ && b.minZ < R.maxZ);
        const furn = mine.filter((b) => b.tag === 'cg-furn'), part = mine.filter((b) => b.inner), street = furn.filter((f) => Math.abs(f.base - (B.Y[0] ?? 0)) < 0.05);
        seen.pieces += furn.length;
        for (const f of furn) {
          const lvl = (b) => b !== f && Math.abs(b.base - f.base) < 0.6;
          if (part.some((b) => b.base <= f.base + 0.05 && lvl(b) && over(f, b))) bad.push(`${B.id}: a piece in a partition`);
          if (furn.some((b) => lvl(b) && over(f, b))) bad.push(`${B.id}: two pieces overlap`);
        }
        // a doorway between rooms and the space inside a street window stay empty
        for (const q of built.innerGaps.filter((q) => q.b === B.id)) {
          const z = q.nz ? { minX: q.x - q.w / 2, maxX: q.x + q.w / 2, minZ: q.z - 0.9, maxZ: q.z + 0.9 } : { minX: q.x - 0.9, maxX: q.x + 0.9, minZ: q.z - q.w / 2, maxZ: q.z + q.w / 2 };
          if (street.some((f) => over(f, z))) bad.push(`${B.id}(${B.kind}): a piece in a doorway`);
        }
        for (const w of built.windows.filter((w) => w.b === B.id)) {
          const hw = w.width / 2, z = w.axis === 'x' ? { minX: w.x - hw, maxX: w.x + hw, minZ: Math.min(w.z, w.z - w.nz * 1.0), maxZ: Math.max(w.z, w.z - w.nz * 1.0) } : { minZ: w.z - hw, maxZ: w.z + hw, minX: Math.min(w.x, w.x - w.nx * 1.0), maxX: Math.max(w.x, w.x - w.nx * 1.0) };
          if (street.some((f) => over(f, z))) bad.push(`${B.id}(${B.kind}): a piece at a window`);
        }
        // on foot from the front door: into every room (every floor a stair reaches), and to each street container from
        // inside its own room
        const door = B.doors.find((d) => d.kind === 'door') ?? B.doors[0], loot = built.loot.filter((l) => l.b === B.id);
        seen.loot += loot.length; seen.inPiece += loot.filter((l) => l.inPiece).length;
        if (door) {
          const o = door.side === 'N' ? [door.at, B.z0 - 1.6] : door.side === 'S' ? [door.at, B.z1 + 1.6] : door.side === 'W' ? [B.x0 - 1.6, door.at] : [B.x1 + 1.6, door.at];
          const W = { x0: B.x0 - 8, z0: B.z0 - 8, x1: B.x1 + 8, z1: B.z1 + 8 };
          if (R.E) { const e = R.E.b; W.x0 = Math.min(W.x0, e.minX - 2); W.x1 = Math.max(W.x1, e.maxX + 2); W.z0 = Math.min(W.z0, e.minZ - 2); W.z1 = Math.max(W.z1, e.maxZ + 2); }
          const F = P.flood(o[0], o[1], W, 0.4), levels = R.S ? R.S.n : 0;
          const inRoom = (q, x, z, m = 0) => x > q.minX - m && x < q.maxX + m && z > q.minZ - m && z < q.maxZ + m;
          for (const q of rooms) {
            if (q.k > levels) continue; // a ruin's floor with no stair to it (it had loot and no way up before rooms, too)
            if (q.k > 0) seen.upRooms++;
            const y = B.Y[q.k] ?? 0;
            if (!F.states.some(([x, z, yy]) => Math.abs(yy - y) < 0.3 && inRoom(q, x, z))) bad.push(`${B.id}(${B.kind}): the ${q.name} on floor ${q.k} is never walked into`);
          }
          for (const l of loot) {
            if ((l.k ?? 0) !== 0) continue;
            // a walked cell within reach with no partition between it and the container (a doorway beside it counts; a wall does not)
            const walls0 = part.filter((b) => b.base <= (B.Y[0] ?? 0) + 0.05);
            const cut = (x0, z0, x1, z1) => walls0.some((b) => { let t0 = 0, t1 = 1; const dx = x1 - x0, dz = z1 - z0; for (const [pp, dd, lo, hi] of [[x0, dx, b.minX, b.maxX], [z0, dz, b.minZ, b.maxZ]]) { if (Math.abs(dd) < 1e-9) { if (pp < lo || pp > hi) return false; } else { let a = (lo - pp) / dd, c = (hi - pp) / dd; if (a > c) [a, c] = [c, a]; t0 = Math.max(t0, a); t1 = Math.min(t1, c); if (t0 > t1) return false; } } return true; });
            if (!F.states.some(([x, z, y]) => y < 0.6 && Math.hypot(x - l.x, z - l.z) < 1.75 && !cut(x, z, l.x, l.z))) bad.push(`${B.id}(${B.kind}): container ${l.id} not reached without a partition in the way`);
          }
        }
        // no hand through a partition: a container in a piece is further than the touch distance from the far face
        for (const l of loot) {
          if (!l.inPiece) continue;
          const y = B.Y[l.k ?? 0] ?? 0;
          for (const w of part) {
            if (Math.abs(w.base - y) > 0.05) continue;
            const horiz = w.maxX - w.minX > w.maxZ - w.minZ, wc = horiz ? (w.minZ + w.maxZ) / 2 : (w.minX + w.maxX) / 2, t = (horiz ? w.maxZ - w.minZ : w.maxX - w.minX) / 2;
            const off = Math.abs((horiz ? l.z : l.x) - wc), along = horiz ? l.x : l.z;
            if (along < (horiz ? w.minX : w.minZ) || along > (horiz ? w.maxX : w.maxZ)) continue;
            if (off + t + 0.4 < REACH.touch + 0.4 + 0.04) bad.push(`${B.id}: container ${l.id} is ${(off + t + 0.4).toFixed(2)} m from someone pressed to the far side of a partition`);
          }
        }
      }
    }
    const missing = Object.keys(want).filter((k) => !had[k]);
    const ok = !bad.length && !missing.length && seen.blds > 300 && seen.rooms > seen.blds * 2 && seen.upRooms > 500 && seen.pieces > seen.blds * 4 && seen.inPiece > seen.loot * 0.5;
    return ok || JSON.stringify({ bad: bad.slice(0, 6), nBad: bad.length, missing, blds: seen.blds, rooms: seen.rooms, upRooms: seen.upRooms, pieces: seen.pieces, loot: seen.loot, inPiece: seen.inPiece, kinds: seen.kinds.size });
  });

  await check('cg rooms: in a live town - a container that lives in a shelf is in your reach from inside its room and NOT from the room next door through the partition (the reach rule holds for the new walls); the `rooms` command names the rooms of the building you stand in', async () => {
    const CG = g.citygen, p = g.player;
    const s = freeSpot(g, -6000, -12000, 280); if (!s) return 'no ground';
    const t = CG.stampAt({ id: 'cg-selftest-rooms', arch: 'sonoran_sprawl', seed: 4242, x: s.x, z: s.z });
    try {
      await C('teleport', { x: s.x, z: s.z }); await api._step(6);
      const boxes = t.built.boxes;
      let pick = null;
      for (const l of t.built.loot) {
        if (!l.inPiece || (l.k ?? 0) !== 0 || pick) continue;
        const R = t.blds.find((q) => q.B.id === l.b); if (!R || R.B.ruined) continue;
        for (const w of boxes) {
          if (!w.inner || w.base > 0.05 || pick) continue;
          const horiz = w.maxX - w.minX > w.maxZ - w.minZ, wc = horiz ? (w.minZ + w.maxZ) / 2 : (w.minX + w.maxX) / 2;
          const off = horiz ? l.z - wc : l.x - wc, along = horiz ? l.x : l.z;
          if (Math.abs(off) > 0.7 || along < (horiz ? w.minX : w.minZ) + 0.5 || along > (horiz ? w.maxX : w.maxZ) - 0.5) continue;
          const sg = Math.sign(off) || 1, same = horiz ? { x: l.x, z: l.z + sg * 1.3 } : { x: l.x + sg * 1.3, z: l.z }, far = horiz ? { x: l.x, z: wc - sg * 0.8 } : { x: wc - sg * 0.8, z: l.z };
          const clear = (q) => inR(R, q.x, q.z) && !(R.roomSolids ?? []).some((b) => q.x + 0.4 > b.minX && q.x - 0.4 < b.maxX && q.z + 0.4 > b.minZ && q.z - 0.4 < b.maxZ);
          if (clear(same) && clear(far)) pick = { l, R, same, far };
        }
      }
      if (!pick) return 'no shelf against a partition with clear floor both sides';
      const y0 = t.rec.y ?? 0, box = g.inventory.boxes.get(pick.l.id), by = box?.y ?? y0;
      const at = async (q) => { p.x = q.x; p.z = q.z; p.gy = y0; g.standOn?.(p); p.vx = 0; p.vz = 0; await api._step(2); };
      await at(pick.same);
      const near = g.reach.to(p, pick.l.x, pick.l.z, { y: by }), nearWhy = g.reach.last.why;
      await at(pick.far);
      const through = g.reach.to(p, pick.l.x, pick.l.z, { y: by }), why = g.reach.last.why, d = Math.hypot(p.x - pick.l.x, p.z - pick.l.z);
      const view = await C('rooms', {});
      const ok = !!box && near === true && through === false && why === 'wall' && d < 1.6 && view.id === pick.R.B.id && view.rooms.length >= 1 && view.containers.inPieces >= 1;
      return ok || JSON.stringify({ box: !!box, by, gy: r1(p.gy ?? 0), near, nearWhy, through, why, d: r1(d), view: { id: view.id, rooms: view.rooms?.length, c: view.containers }, b: pick.R.B.kind });
    } finally { CG.remove('cg-selftest-rooms'); }
  });

  await check('cg rooms: the doorways between rooms have doors - in a live town, standing in a building, its inner doorways carry real leaves (one per doorway, no more than the doorways it has), some standing open and some shut; one pulled shut stops the line of sight through that doorway; the outside doors are still there; a shut leaf stops a body walking through; 70 m away the inner leaves are given back and the outside doors are not; a door you barred is still barred, with one bar on it, when you go 70 m and come back', async () => {
    const CG = g.citygen, p = g.player, I = g.interiors;
    const s = freeSpot(g, -6400, -12400, 280); if (!s) return 'no ground';
    const t = CG.stampAt({ id: 'cg-selftest-indoors', arch: 'sonoran_sprawl', seed: 4242, x: s.x, z: s.z });
    try {
      // a building with at least three inner doorways that is whole
      const gaps = (R) => (t.built.innerGaps ?? []).filter((q) => q.b === R.B.id);
      const R = t.blds.filter((q) => !q.B.ruined && !q.B.open).sort((a, b) => gaps(b).length - gaps(a).length)[0];
      if (!R || gaps(R).length < 3) return 'no building with three inner doorways';
      const at = R.clearSpot ?? { x: (R.minX + R.maxX) / 2, z: (R.minZ + R.maxZ) / 2 };
      await C('teleport', { x: at.x, z: at.z }); await api._step(90);
      CG.openings(p.x, p.z); await api._step(10); // the town's own scan hangs the doors round you (asked for here so the check does not wait on its timer)
      const inner = () => I.doors.filter((d) => String(d.id).startsWith(`cg:${R.B.id}:in:`)), outer = () => I.doors.filter((d) => String(d.id).startsWith(`cg:${R.B.id}:d`));
      const n = inner().length, nGaps = gaps(R).length, nOut = outer().length;
      const openN = inner().filter((d) => !I.isShut(d)).length;
      // shut one: nothing sees through it
      const d = inner()[0];
      let blocked = null, walled = null;
      if (d) { I.shutDoor(d, p); await api._step(20); blocked = !g.statics.lineOfSight(d.x - d.nx * 0.8, d.z - d.nz * 0.8, d.x + d.nx * 0.8, d.z + d.nz * 0.8, 1, -1); walled = g.statics.raycast(d.x - d.nx * 0.8, d.z - d.nz * 0.8, d.nx, d.nz, 1.6, 0) < 1.6; }
      await C('teleport', { x: at.x + 70 + (R.maxX - R.minX), z: at.z }); await api._step(90);
      CG.openings(p.x, p.z); await api._step(10);
      const farIn = inner().length, farOut = outer().length;
      // bar one, go away and come back: it is the same door, still barred, and the bar is on it (not on a dead leaf)
      await C('teleport', { x: at.x, z: at.z }); await api._step(60); CG.openings(p.x, p.z); await api._step(10);
      const d2 = inner()[0], bar = d2 ? g.gadgets.barricade(d2, 'planks', p, false) : null;
      await C('teleport', { x: at.x + 70 + (R.maxX - R.minX), z: at.z }); await api._step(60); CG.openings(p.x, p.z); await api._step(10);
      const heldFar = inner().length;
      await C('teleport', { x: at.x, z: at.z }); await api._step(60); CG.openings(p.x, p.z); await api._step(10);
      const d3 = I.byId.get(d2?.id), still = !!d3 && d3 === d2 && d3.locked === true, bars = g.gadgets.barred.filter((q) => q.door === d3).length;
      if (d3) g.gadgets.unbarricade(d3, p);
      const ok = n >= 3 && n <= nGaps && nOut >= 1 && openN >= 1 && blocked === true && walled === true && farIn === 0 && farOut === nOut && bar?.ok === true && heldFar >= 1 && still && bars === 1;
      return ok || JSON.stringify({ kind: R.B.kind, n, nGaps, nOut, openN, blocked, walled, farIn, farOut, bar, heldFar, still, bars });
    } finally { for (const q of [...g.gadgets.barred]) if (String(q.door?.id).startsWith('cg:') && q.door.ring && t.blds.some((R) => q.door.ring === `cg:${R.B.id}:in`)) g.gadgets.unbarricade(q.door, g.player); CG.remove('cg-selftest-indoors'); await C('teleport', { x: 0, z: -40 }); await api._step(3); }
  });
}
