// WINDOWS, THE REST for agents (docs/design/WEB_WINDOWS2.md; rows data/interiors.js WINDOW_EXIT.pipe / .roof; the rule
// systems/windowexit.js findUp / interactUp / pipeUp / pipeDown and the roof landing in find; the pipes
// world/citygen/build.js B.pipe): the `pipes` command and the checks.
import { WINDOW_EXIT as WX, validateWindowExit } from '../data/interiors.js';
import { ARCHETYPES } from '../data/citygen.js';
import { layoutTown } from '../world/citygen/layout.js';
import { buildTown } from '../world/citygen/build.js';
import { freeSpot } from './citygen-api.js';

const r1 = (v) => Math.round(v * 10) / 10;

export function windows2Commands(api) {
  const g = api.g;
  return {
    pipes: {
      group: 'world', desc: 'DRAINPIPES AND ROOFS (docs/design/WEB_WINDOWS2.md): a town building with a floor above the street has a drainpipe on its back wall. From the street, at its foot, hold E to climb up and in by the lowest open window on it; upstairs at that window, hold E to climb down it with no fall. A window that looks onto a lower roof you can stand on drops you onto the roof. Returns the pipes within 60 m (foot, wall side, floors served), what the street side offers where you stand (up) and what the window you face offers (out: pipe, roof, drop), and the counts.',
      args: {},
      run: async () => {
        const WE = g.windowExit, p = g.player, near = [];
        for (const t of g.citygen?.live.values() ?? []) for (const R of t.blds) {
          const P = R.B.pipe; if (!P) continue;
          const d = Math.hypot(P.x - p.x, P.z - p.z); if (d > 60) continue;
          near.push({ building: R.B.id, kind: R.B.kind, side: P.side, foot: [r1(P.x + P.nx * WX.pipe.foot), r1(P.z + P.nz * WX.pipe.foot)], floors: P.floors, dist: r1(d) });
        }
        near.sort((a, b) => a.dist - b.dist);
        const U = WE.findUp(p), F = WE.find(p);
        return {
          pipes: near.slice(0, 12),
          up: U ? { floor: U.k, climb: r1(U.climb), into: [r1(U.x), r1(U.z)] } : null,
          out: F ? { blocked: F.blocked, drop: r1(F.drop), pipe: !!F.pipe, roof: !!F.roof, land: [r1(F.land.x), r1(F.land.z), r1(F.land.y)] } : null,
          counts: WE.counts, rows: { pipe: WX.pipe, roof: WX.roof },
        };
      },
    },
  };
}

export async function windows2Checks({ g, api, C, check }) {
  const WE = g.windowExit, p = g.player, CG = g.citygen;
  const hold = { key: (k) => k === 'KeyE', hit: () => false }, idle = { key: () => false, hit: () => false };

  await check('windows 2: the rows and the pipes - the pipe and roof rows validate (a pipe too slow and a roof landing nearer than the wall are each caught); over 6 towns built headless at least nine in ten whole buildings with stairs and a floor above the street have a drainpipe and no other building has one; every pipe serves a real window hole on each floor it lists, stands on an outside wall that is not the front, never in or beside a street-floor door or bay, and no collider was made for one', async () => {
    const a = validateWindowExit();
    const b = validateWindowExit({ ...WX, pipe: { ...WX.pipe, speed: 0.1 } }), c = validateWindowExit({ ...WX, roof: { ...WX.roof, reach: 0.5 } });
    let multi = 0, piped = 0; const bad = [];
    const archs = Object.keys(ARCHETYPES).slice(0, 6);
    for (let i = 0; i < archs.length; i++) {
      const T = layoutTown({ arch: archs[i], seed: 3000 + i * 41, x: 40000 + i * 1500, z: -40000 }), built = buildTown(T);
      if (built.boxes.some((q) => /pipe/.test(q.tag) && q.tag !== 'cg-pipe-none')) bad.push(`${archs[i]}: a pipe collider`);
      for (const R of built.blds) {
        const B = R.B;
        if (B.n < 2 || B.ruined || B.open || !R.S) { if (B.pipe) bad.push(`${B.id}: a pipe on a ruin, an open deck or a building with no stairs`); continue; }
        multi++;
        const P = B.pipe; if (!P) continue;
        piped++;
        if (B.doors.some((q) => q.side === P.side && Math.abs(q.at - P.at) < q.w / 2 + 0.8)) bad.push(`${B.id}: the pipe stands in a doorway or a bay`);
        // the window it serves is a real hole in that wall on every floor it lists
        for (const k of P.floors) { const band = built.boxes.find((q) => q.tag === 'cg-wall' && q.holes && Math.abs(q.base - B.Y[k]) < 0.01 && (q.holeX ? Math.abs((q.minZ + q.maxZ) / 2 - P.wz) < 0.3 : Math.abs((q.minX + q.maxX) / 2 - P.wx) < 0.3) && (() => { const c = q.holeX ? P.wx : P.wz; for (let i = 0; i < q.holes.length; i += 2) if (c > q.holes[i] && c < q.holes[i + 1]) return true; return false; })()); if (!band) bad.push(`${B.id}: no window at the pipe on floor ${k}`); }
        if (!P.floors.length || P.floors.some((k) => k < 1 || k >= B.n)) bad.push(`${B.id}: floors ${P.floors}`);
        if (P.side === B.front) bad.push(`${B.id}: the pipe is on the front`);
        const onWall = P.side === 'N' ? Math.abs(P.z - B.z0) < 0.5 : P.side === 'S' ? Math.abs(P.z - B.z1) < 0.5 : P.side === 'W' ? Math.abs(P.x - B.x0) < 0.5 : Math.abs(P.x - B.x1) < 0.5;
        if (!onWall || P.x < B.x0 - 0.5 || P.x > B.x1 + 0.5 || P.z < B.z0 - 0.5 || P.z > B.z1 + 0.5) bad.push(`${B.id}: the pipe is off its wall`);
      }
    }
    const ok = a.length === 0 && b.length === 1 && c.length === 1 && !bad.length && multi >= 30 && piped / multi >= 0.9;
    return ok || JSON.stringify({ a, b, c, bad: bad.slice(0, 5), multi, piped });
  });

  await check('windows 2: up the pipe and down it - in a live town, at the foot of a drainpipe the street side offers the climb (a prompt naming the pipe) and holding E for the row\'s time takes you up and in: you stand on that floor inside the building by the window, unhurt, and a tap does not; from there, facing the window, the way out is the pipe (not a drop) and holding E brings you to the pipe\'s foot on the street, unhurt, where a drop from that floor would have cost health or thrown you down; nobody else can use the pipe (an infected at its foot stays in the street)', async () => {
    await C('start'); g.godMode = false;
    const s = freeSpot(g, -5600, -12400, 280); if (!s) return 'no ground';
    const t = CG.stampAt({ id: 'cg-selftest-pipes', arch: 'sonoran_sprawl', seed: 4242, x: s.x, z: s.z });
    const made = [];
    try {
      // a pipe whose foot is clear and whose lowest window is open
      let R = null, U = null;
      for (const q of t.blds) {
        const P = q.B.pipe; if (!P || !q.S) continue;
        const fx = P.x + P.nx * WX.pipe.foot, fz = P.z + P.nz * WX.pipe.foot;
        if (g.statics.raycast(fx - 0.3, fz, 1, 0, 0.6, 0, -1) < 0.6 || g.storeys.at(fx, fz) || CG.buildingAt(fx, fz)) continue;
        await C('teleport', { x: fx, z: fz }); await api._step(20);
        for (const c of [...g.chars]) if (c !== p && !c.npc && Math.hypot(c.x - p.x, c.z - p.z) < 60) g.removeChar(c);
        if (Math.hypot(p.x - fx, p.z - fz) > 0.5 || p.storey) continue;
        U = WE.findUp(p); if (U) { R = q; break; }
      }
      if (!R) return 'no pipe with a clear foot and an open window';
      const P = R.B.pipe, S = R.S, hp0 = p.hp, need = WX.hold + U.climb / WX.pipe.speed, k = U.k, floorY = S.Y[k];
      // the prompt, a tap, the hold
      WE.interactUp(p, idle, 1 / 60); const prompt = g.hud.s?.prompt ?? '';
      WE.interactUp(p, hold, 0.2); WE.interactUp(p, idle, 1 / 60);
      const afterTap = { storey: !!p.storey, gy: r1(p.gy ?? 0) };
      let steps = 0; while (!p.storey && steps++ < 2000) WE.interactUp(p, hold, 1 / 60);
      WE.interactUp(p, idle, 1 / 60);
      await api._step(5);
      const up = { storey: p.storey === S, gy: Math.abs((p.gy ?? 0) - floorY) < 0.05, inside: p.x > R.minX && p.x < R.maxX && p.z > R.minZ && p.z < R.maxZ, hp: p.hp, time: r1(steps / 60), need: r1(need), count: WE.counts.pipeUp };
      // from inside, face the window: the way out is the pipe
      p.face = Math.atan2(P.nx, P.nz); await api._step(2);
      const F = WE.find(p);
      if (!F) return 'upstairs, the window is not a way out: ' + JSON.stringify(up);
      const out = { pipe: !!F.pipe, blocked: F.blocked, dropWouldHurt: Math.round(WE.damageOf(Math.max(0, (p.gy ?? 0) - F.land.y - WX.hang))) };
      const needDown = WX.hold + Math.max(0.5, (p.gy ?? 0) - F.foot.y) / WX.pipe.speed;
      WE.interact(p, idle, 1 / 60); const promptDown = g.hud.s?.prompt ?? '';
      steps = 0; while (p.storey && steps++ < 2000) WE.interact(p, hold, 1 / 60);
      WE.interact(p, idle, 1 / 60); await api._step(5);
      const fx = P.x + P.nx * WX.pipe.foot, fz = P.z + P.nz * WX.pipe.foot;
      const down = { street: !p.storey, at: r1(Math.hypot(p.x - fx, p.z - fz)), hp: p.hp, time: r1(steps / 60), need: r1(needDown), count: WE.counts.pipeDown, knock: p.knockT > 0 };
      // an infected at the foot does not climb
      const z = g.addChar({ x: fx, z: fz + 0.2, faction: 'zombie', weapon: null, hp: 100, name: 'Pipe watcher (selftest)', flag: 'US' }); made.push(z);
      g.godMode = true; await C('teleport', { x: fx + P.nx * 30 + 40, z: fz + P.nz * 30 }); await api._step(60 * 4);
      const zed = { storey: !!z.storey, gy: r1((z.gy ?? 0) - (S.y0 ?? 0)) };
      const ok = /pipe/i.test(prompt) && !afterTap.storey && up.storey && up.gy && up.inside && up.hp === hp0 && Math.abs(up.time - up.need) < 0.2 && up.count >= 1 &&
        out.pipe && !out.blocked && /pipe/i.test(promptDown) && down.street && down.at < 0.3 && down.hp === hp0 && Math.abs(down.time - down.need) < 0.2 && !down.knock && !zed.storey && zed.gy < 1;
      return ok || JSON.stringify({ kind: R.B.kind, k, prompt, afterTap, up, out, promptDown, down, zed });
    } finally { for (const c of made) if (g.chars.includes(c)) g.removeChar(c); CG.remove('cg-selftest-pipes'); g.godMode = false; p.hp = p.maxHp; await C('teleport', { x: 0, z: -40 }); await api._step(3); }
  });

  await check('windows 2: onto a lower roof - where an upstairs window looks onto a lower roof you can stand on, the way out lands you ON THAT ROOF (inside its edge, on its deck, that building now under your feet), the drop is your floor less the roof less the hang (not the height to the street), and it costs what that drop costs; where the roof is level with your floor or higher nothing is offered through it', async () => {
    await C('start'); g.godMode = false;
    const s = freeSpot(g, -5600, -12400, 280); if (!s) return 'no ground';
    let found = null, tries = 0;
    try {
      for (const [arch, seed] of [['rustbelt_mill', 1185], ['sonoran_sprawl', 4242], ['sonoran_sprawl', 9182], ['rustbelt_mill', 1037]]) {
        const t = CG.stampAt({ id: 'cg-selftest-roofs', arch, seed, x: s.x, z: s.z }); tries++;
        await C('teleport', { x: s.x, z: s.z }); await api._step(30);
        // every upstairs window spot of every building: does it look onto a lower walkable roof?
        const cands = [];
        for (const R of t.blds) {
          const S = R.S; if (!S || R.B.ruined || R.B.open || S.n < 2 || cands.length >= 12) continue;
          for (let k = 1; k < R.B.n && !found; k++) for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const lo = nx ? R.minZ + 1 : R.minX + 1, hi = nx ? R.maxZ - 1 : R.maxX - 1;
            for (let a = lo; a < hi && !found; a += 0.25) {
              const x = nx ? (nx > 0 ? R.maxX - 1.0 : R.minX + 1.0) : a, z = nz ? (nz > 0 ? R.maxZ - 1.0 : R.minZ + 1.0) : a;
              p.x = x; p.z = z; p.gy = S.Y[k]; p.storey = S; p.face = Math.atan2(nx, nz); g.standOn(p);
              if (p.storey !== S || Math.abs((p.gy ?? 0) - S.Y[k]) > 0.05) continue;
              const F = WE.find(p);
              if (F && F.roof && !F.blocked) { cands.push({ R, S, k, x, z, nx, nz, roof: F.roof, land: { ...F.land }, drop: F.drop }); a += 3; }
            }
          }
        }
        // a spot you can really stand at (a few frames of the game leave you there, and the roof is still the way out)
        for (const c of cands) {
          p.x = c.x; p.z = c.z; p.gy = c.S.Y[c.k]; p.storey = c.S; p.face = Math.atan2(c.nx, c.nz); g.standOn(p); await api._step(3);
          p.face = Math.atan2(c.nx, c.nz);
          const F = p.storey === c.S && Math.abs((p.gy ?? 0) - c.S.Y[c.k]) < 0.05 ? WE.find(p) : null;
          if (F && F.roof === c.roof && !F.blocked) { found = { ...c, x: p.x, z: p.z }; break; }
        }
        if (found) break;
        CG.remove('cg-selftest-roofs');
      }
      if (!found) return `no window onto a lower roof in ${tries} towns`;
      const { S, k, roof } = found, roofY = roof.Y[roof.n], hp0 = p.hp;
      p.x = found.x; p.z = found.z; p.gy = S.Y[k]; p.storey = S; p.face = Math.atan2(found.nx, found.nz); g.standOn(p);
      for (const c of [...g.chars]) if (c !== p && !c.npc && Math.hypot(c.x - p.x, c.z - p.z) < 60) g.removeChar(c);
      const F = WE.find(p), wantDrop = Math.max(0, S.Y[k] - roofY - WX.hang), street = S.Y[k] - (S.y0 ?? 0), cost = Math.round(WE.damageOf(wantDrop));
      const before = { roof: F?.roof === roof, drop: r1(F?.drop ?? -1), wantDrop: r1(wantDrop), street: r1(street), lower: roofY <= S.Y[k] - WX.roof.min };
      WE.interact(p, idle, 1 / 60); // (the hold starts from a fresh press)
      let steps = 0; while (p.storey === S && steps++ < 600) WE.interact(p, { key: (q) => q === 'KeyE', hit: () => false }, 1 / 60);
      WE.interact(p, idle, 1 / 60); await api._step(5);
      const B2 = roof.b, after = { on: p.storey === roof, gy: Math.abs((p.gy ?? 0) - roofY) < 0.05, inside: p.x > B2.minX + WX.roof.in - 0.05 && p.x < B2.maxX - WX.roof.in + 0.05 && p.z > B2.minZ + WX.roof.in - 0.05 && p.z < B2.maxZ - WX.roof.in + 0.05, lost: Math.round(hp0 - p.hp), cost, roofs: WE.counts.roofs };
      // a roof level with you or higher: nothing through it (the rule's own test, on the same pair, from a floor not above the roof)
      let level = 'no lower floor to test from';
      for (let j = 0; j <= S.n; j++) if (S.Y[j] - WX.roof.min < roofY && j < found.R.B.n) { p.x = found.x; p.z = found.z; p.gy = S.Y[j]; p.storey = S; p.face = Math.atan2(found.nx, found.nz); g.standOn(p); const F2 = Math.abs((p.gy ?? 0) - S.Y[j]) < 0.05 ? WE.find(p) : null; level = !F2 || !F2.roof; break; }
      const ok = before.roof && before.lower && Math.abs(before.drop - before.wantDrop) < 0.11 && before.drop < before.street - 1 && after.on && after.gy && after.inside && Math.abs(after.lost - after.cost) <= 1 && after.roofs >= 1 && level !== false;
      return ok || JSON.stringify({ kind: found.R.B.kind, k, before, after, level });
    } finally { if (CG.byId?.get('cg-selftest-roofs')) CG.remove('cg-selftest-roofs'); g.godMode = false; p.hp = p.maxHp; await C('teleport', { x: 0, z: -40 }); await api._step(3); }
  });
}
