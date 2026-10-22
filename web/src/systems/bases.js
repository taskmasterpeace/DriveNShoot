import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BASES, TOWER, BASE_RULES, BASE_LINES } from '../data/bases.js';
import { DOOR_MATERIALS, WINDOW } from '../data/interiors.js';
import { radialGlow } from '../world/textures.js';
import { HALF as WORLD_HALF } from '../world/city.js';
import { makeRng, angleLerp } from '../engine/rng.js';
import { outfit } from './characters.js';
import { randomName } from '../data/npcs.js';

// Military bases (docs/design/WEB_MILITARY.md), built from the rows in data/bases.js.
//
// BUILD (before the nav grids, like the jumps): one merged, vertex-coloured mesh for every wall, floor, tower, prop
// and piece of furniture of a base; one InstancedMesh for its roofs (so a roof hides when you walk in); one cut-out
// mesh for the chain-link; and two additive InstancedMeshes for the lights (ground pools and searchlight beams) that
// are switched off by day. Everything solid goes into the StaticWorld. The fence and the watchtowers' skirts are
// see-through walls: a box whose whole length is a `hole` (collision.js), so they stop walkers and cars but not sight,
// rounds or a high throw. Enterable buildings join the world's own lists: their door leaves and window glass are rows
// systems/interiors.js hangs, and their records sit in world.buildings, so the roof cut-away and the HUD know them.
//
// RUN: soldiers (faction 'soldier', fid 'remnant') man the posts, stand on the tower decks and walk patrols. The
// trespass rule watches the player: a sentry who can see you inside the wire warns you once; stay `grace` seconds,
// fire a shot near the wire, or hurt one of them and the post opens fire. A Remnant-friendly player is waved through;
// one they already hate is shot on sight. At night the searchlights sweep their quarter of the yard, and a sentry
// picks you out far further in a beam or a floodlight's pool than in the dark.

const WALL_T = 0.5;
const SINGLE_GAP = 1.9, DOUBLE_GAP = 2.6;
const OUT = { N: [0, -1], S: [0, 1], W: [-1, 0], E: [1, 0] };
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler();
const _up = new THREE.Vector3(0, 1, 0), _dir = new THREE.Vector3(), _c = new THREE.Color();
const r1 = (v) => Math.round(v * 10) / 10;
const lerp = (a, b, t) => a + (b - a) * t;

export class Bases {
  constructor(game) {
    this.g = game;
    this.sites = [];
    this.byId = {};
    for (const [id, row] of Object.entries(BASES)) {
      const s = this.build(id, row);
      this.sites.push(s); this.byId[id] = s;
    }
    this.drawOnMinimap(game.world.minimap);
  }

  // ==== build ======================================================================================================
  build(id, row) {
    const g = this.g, statics = g.statics, world = g.world;
    const ox = row.x, oz = row.z;
    const s = {
      id, row, ox, oz, name: row.name, faction: row.faction,
      fence: { x0: ox + row.fence.x0, x1: ox + row.fence.x1, z0: oz + row.fence.z0, z1: oz + row.fence.z1 },
      guards: [], vehicles: [], boxes: [], doors: [], buildings: [], towers: [], pools: [],
      alert: 'calm', why: null, warnT: 0, outT: 0, coolT: 0, warnedAt: -1e9, cleared: false, shotWarned: false,
      seenBy: null, checkT: 0, lastSeen: { x: 0, z: 0, t: -1e9 }, alarms: 0, warnings: 0,
    };
    const solid = [], mesh = [], roofs = [];
    const P = { solid, mesh, roofs, ox, oz };
    this.buildFence(s, row, P, statics);
    for (const t of row.towers) this.buildTower(s, t, P, statics);
    for (const b of row.buildings) this.buildBuilding(s, b, P, statics, world);
    for (const p of row.props) this.buildProp(s, p, P, statics);
    for (const b of row.boxes) this.buildBox(s, b, P, statics);
    for (const t of row.tracks ?? []) {
      // Packed gravel on a scuffed shoulder, two darker ruts where every tyre has run.
      const cx = ox + (t.x0 + t.x1) / 2, cz = oz + (t.z0 + t.z1) / 2, w = t.x1 - t.x0, d = t.z1 - t.z0, along = d >= w;
      solid.push(ground(cx, cz, w + (along ? 1.6 : 0), d + (along ? 0 : 1.6), '#b08f66', 0.014, 3 + t.z0));
      solid.push(ground(cx, cz, w, d, '#9c8665', 0.022, 7 + t.z0));
      for (const sd of [-1, 1]) solid.push(at(box(along ? 0.5 : w, 0.01, along ? d : 0.5, '#86714f'), cx + (along ? sd * 1.15 : 0), 0.027, cz + (along ? 0 : sd * 1.15)));
    }
    this.buildSign(s, row.sign, P);
    this.clearLot(s, row);

    // ---- GPU batches ----
    const scene = g.scene;
    const solidMesh = new THREE.Mesh(mergeGeometries(solid), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0.12 }));
    solidMesh.castShadow = true; solidMesh.receiveShadow = true; solidMesh.name = `base:${id}:solid`;
    scene.add(solidMesh);
    const linkMat = new THREE.MeshStandardMaterial({ map: chainLinkAtlas(), alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.55, metalness: 0.45 });
    const linkMesh = new THREE.Mesh(mergeGeometries(mesh), linkMat);
    linkMesh.receiveShadow = true; linkMesh.name = `base:${id}:chainlink`; // no shadow pass: a solid panel's shadow would lie
    scene.add(linkMesh);
    // Roofs: one instance per roof piece, hidden per building (setRoof) when you walk in.
    s.roofMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.78, metalness: 0.3 }), Math.max(1, roofs.length));
    s.roofMats = roofs.map((r) => r.m);
    roofs.forEach((r, i) => { s.roofMesh.setMatrixAt(i, r.m); s.roofMesh.setColorAt(i, _c.set(r.color)); });
    s.roofMesh.instanceMatrix.needsUpdate = true; s.roofMesh.instanceColor.needsUpdate = true;
    s.roofMesh.castShadow = true; s.roofMesh.receiveShadow = true; s.roofMesh.name = `base:${id}:roofs`;
    s.roofMesh.computeBoundingSphere();
    scene.add(s.roofMesh);
    this.buildLights(s, scene);
    s.meshes = [solidMesh, linkMesh, s.roofMesh];
    return s;
  }

  // Chain-link on posts round the rectangle, a gap for the gate, razor wire along the top. The collision is a
  // see-through wall per run (sight, rounds and a high throw go through; walkers and cars do not).
  buildFence(s, row, P, statics) {
    const F = row.fence, G = row.gate, { ox, oz } = P;
    const H = F.height, gate0 = G.at - G.width / 2, gate1 = G.at + G.width / 2;
    const runs = [
      { side: 'N', horiz: true, fixed: F.z0, a: F.x0, b: F.x1 },
      { side: 'S', horiz: true, fixed: F.z1, a: F.x0, b: F.x1 },
      { side: 'W', horiz: false, fixed: F.x0, a: F.z0, b: F.z1 },
      { side: 'E', horiz: false, fixed: F.x1, a: F.z0, b: F.z1 },
    ];
    for (const r of runs) {
      const spans = r.side === G.side ? [[r.a, gate0], [gate1, r.b]] : [[r.a, r.b]];
      for (const [a, b] of spans) {
        this.seeThrough(statics, r.horiz, r.horiz ? ox : oz, r.horiz ? oz + r.fixed : ox + r.fixed, a, b, H + F.wire, 'fence', H);
        const n = Math.max(1, Math.round((b - a) / F.post));
        for (let k = 0; k <= n; k++) {
          const t = a + ((b - a) * k) / n;
          const [x, z] = r.horiz ? [t, r.fixed] : [r.fixed, t];
          const big = k === 0 || k === n; // corner and gate posts are heavier
          P.solid.push(at(box(big ? 0.16 : 0.1, H + F.wire * 0.9, big ? 0.16 : 0.1, '#5d5f5a'), ox + x, (H + F.wire * 0.9) / 2, oz + z));
          // Outrigger arm leaning out over the wire, three strands of barbed wire hang from it.
          const ax = r.horiz ? 0 : (r.side === 'W' ? -1 : 1) * 0.32, az = r.horiz ? (r.side === 'N' ? -1 : 1) * 0.32 : 0;
          P.solid.push(bar([ox + x, H, oz + z], [ox + x + ax, H + F.wire * 0.8, oz + z + az], 0.05, '#55574f'));
          if (k < n) {
            const t1 = a + ((b - a) * (k + 1)) / n, len = t1 - t, mid = (t + t1) / 2;
            const [mx, mz] = r.horiz ? [mid, r.fixed] : [r.fixed, mid];
            // Top rail, a bottom tension wire, the mesh panel, the strands, the coil.
            P.solid.push(at(box(r.horiz ? len : 0.06, 0.06, r.horiz ? 0.06 : len, '#7a7c74'), ox + mx, H - 0.03, oz + mz));
            P.mesh.push(linkPanel(r.horiz, ox + mx, oz + mz, len, 0.06, H - 0.06));
            for (let w = 1; w <= 3; w++) {
              const f = w / 3.4;
              P.solid.push(at(box(r.horiz ? len : 0.025, 0.025, r.horiz ? 0.025 : len, '#9a9a90'), ox + mx + ax * f, H + F.wire * 0.8 * f, oz + mz + az * f));
            }
            for (let c = 0; c < len / 0.55; c++) {
              const tc = t + 0.275 + c * 0.55;
              if (tc > t1) break;
              const [cx, cz] = r.horiz ? [tc, r.fixed] : [r.fixed, tc];
              P.solid.push(coil(ox + cx + ax * 0.5, H + 0.36, oz + cz + az * 0.5, r.horiz, c));
            }
          }
        }
      }
    }
    // The gate: two heavy posts, both chain-link leaves swung open flat against the fence outside, and a boom arm
    // raised on its post beside the booth.
    const gz = oz + F.z1, g0 = ox + gate0, g1 = ox + gate1;
    for (const x of [g0, g1]) P.solid.push(at(box(0.32, H + 0.6, 0.32, '#4a4c46'), x, (H + 0.6) / 2, gz));
    for (const [hx, dir] of [[g0, -1], [g1, 1]]) {
      const lx = hx + dir * (G.width / 4), z = gz + 0.4;
      P.solid.push(at(box(G.width / 2 - 0.2, 0.06, 0.06, '#7a7c74'), lx, H - 0.1, z), at(box(G.width / 2 - 0.2, 0.06, 0.06, '#7a7c74'), lx, 0.2, z));
      for (const e of [-1, 1]) P.solid.push(at(box(0.06, H - 0.3, 0.06, '#7a7c74'), lx + e * (G.width / 4 - 0.13), H / 2, z));
      P.mesh.push(linkPanel(true, lx, z, G.width / 2 - 0.3, 0.25, H - 0.15));
      this.seeThrough(statics, true, 0, z, lx - G.width / 4, lx + G.width / 4, H, 'fence', H);
    }
    const bx = g1 + 0.45, bz = gz - 1.3;
    P.solid.push(at(box(0.5, 1.1, 0.5, '#3c3e38'), bx, 0.55, bz));
    for (let k = 0; k < 6; k++) P.solid.push(at(box(0.16, 0.62, 0.14, k % 2 ? '#d8d2c2' : '#a3392a'), bx - 0.05, 1.4 + k * 0.6, bz)); // the arm, raised
    statics.addCentered(bx, bz, 0.5, 0.5, 'boom', 1.1);
  }

  // The lot was surveyed clear of every solid thing, but the world scatters loose rubble and boulders (visual only, no
  // collision) on the flats: hide any low piece inside the wire, on the spur road or just around them.
  clearLot(s, row) {
    const B = this.g.world.props;
    if (!B?.mesh) return;
    const rects = [[s.fence.x0 - 6, s.fence.z0 - 6, s.fence.x1 + 6, s.fence.z1 + 6], ...(row.tracks ?? []).map((t) => [s.ox + t.x0 - 2, s.oz + t.z0 - 2, s.ox + t.x1 + 2, s.oz + t.z1 + 2])];
    let n = 0;
    B.items.forEach((it, i) => {
      if (it.cy > 0.6) return;
      for (const r of rects) if (it.cx > r[0] && it.cx < r[2] && it.cz > r[1] && it.cz < r[3]) { B.mesh.setMatrixAt(i, ZERO); n++; return; }
    });
    if (n) B.mesh.instanceMatrix.needsUpdate = true;
    s.rubbleCleared = n;
  }

  // A thin wall that stops movers but not rays: its whole length is a window hole (collision.js `holes`).
  seeThrough(statics, horiz, off, fixed, a, b, height, tag, sill) {
    const t = 0.15;
    const box = horiz ? statics.add(off + a, fixed - t, off + b, fixed + t, tag, height) : statics.add(fixed - t, off + a, fixed + t, off + b, tag, height);
    box.holes = horiz ? [off + a - 0.01, off + b + 0.01] : [off + a - 0.01, off + b + 0.01];
    box.holeX = horiz; box.sill = sill;
    return box;
  }

  // Watchtower: four legs, X-bracing, an open deck behind a parapet, a ladder, a searchlight drum on the inner corner.
  // Its skirt is see-through (nobody walks in under it; the sentry up top still sees and shoots out).
  buildTower(s, t, P, statics) {
    const { ox, oz } = P, x = ox + t.x, z = oz + t.z, T = TOWER, h = T.deck, hs = T.size / 2, leg = hs - 0.2;
    const legs = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (const [a, b] of legs) P.solid.push(bar([x + a * (leg + 0.15), 0, z + b * (leg + 0.15)], [x + a * leg, h, z + b * leg], 0.22, T.legColor));
    for (let i = 0; i < 4; i++) {
      const [a0, b0] = legs[i], [a1, b1] = legs[(i + 1) % 4];
      for (const [y0, y1] of [[0.3, h * 0.5], [h * 0.5, h - 0.2]]) {
        P.solid.push(bar([x + a0 * leg, y0, z + b0 * leg], [x + a1 * leg, y1, z + b1 * leg], 0.08, T.legColor));
        P.solid.push(bar([x + a1 * leg, y0, z + b1 * leg], [x + a0 * leg, y1, z + b0 * leg], 0.08, T.legColor));
      }
    }
    P.solid.push(at(box(T.size, 0.22, T.size, '#4c4639'), x, h - 0.11, z));
    // Parapet: plate on four sides, the yard-facing x side half open where the ladder comes up.
    const cx = Math.sign(-t.x) || 1, cz = Math.sign(-t.z) || 1; // which way is the yard
    for (const [horiz, sx, sz] of [[true, 0, -1], [true, 0, 1], [false, -1, 0], [false, 1, 0]]) {
      const ladder = !horiz && sx === cx;
      const len = ladder ? T.size * 0.5 : T.size;
      const px = x + sx * (hs - 0.04), pz = z + sz * (hs - 0.04) + (ladder ? -cz * T.size * 0.25 : 0);
      P.solid.push(at(box(horiz ? len : 0.08, T.parapet, horiz ? 0.08 : len, T.color), px, h + T.parapet / 2, pz));
      P.solid.push(at(box(horiz ? len + 0.04 : 0.14, 0.06, horiz ? 0.14 : len + 0.04, '#3c372d'), px, h + T.parapet, pz));
    }
    // Sandbags along the outer rail.
    for (let k = 0; k < 5; k++) P.solid.push(at(box(0.55, 0.22, 0.32, k % 2 ? '#8a7c5a' : '#7e7152'), x - cx * (hs - 0.3), h + 0.11, z - cz * (hs - 0.3) + cz * (k * 0.62)));
    // Ladder up the open side.
    const lx = x + cx * (hs + 0.25), lz = z + cz * (hs * 0.45);
    for (const e of [-0.25, 0.25]) P.solid.push(at(box(0.07, h + 1, 0.07, '#3f3c33'), lx, (h + 1) / 2, lz + e));
    for (let y = 0.4; y < h + 0.8; y += 0.4) P.solid.push(at(box(0.06, 0.05, 0.5, '#57524a'), lx, y, lz));
    // Searchlight: a drum on a post at the corner nearest the yard.
    const sx = x + cx * (hs - 0.35), sz = z + cz * (hs - 0.35);
    P.solid.push(at(box(0.12, 0.7, 0.12, '#2e2c28'), sx, h + 0.35, sz));
    P.solid.push(at(cyl(0.32, 0.32, 0.55, '#3a3833', 12, true), sx, T.lamp, sz));
    P.solid.push(at(cyl(0.26, 0.26, 0.04, '#f4ecd2', 12, true), sx + cx * 0.29, T.lamp, sz + cz * 0.29));
    // The skirt: see-through, all four sides.
    for (const [horiz, f, a, b] of [[true, z - hs, x - hs, x + hs], [true, z + hs, x - hs, x + hs], [false, x - hs, z - hs, z + hs], [false, x + hs, z - hs, z + hs]])
      this.seeThrough(statics, horiz, 0, f, a, b, h, 'tower', h);
    s.towers.push({ id: t.id, x, z, face: t.face, sweep: t.sweep, lampX: sx, lampZ: sz, poolX: x, poolZ: z, phase: s.towers.length * 1.9 });
  }

  // An enterable building: walls cut for doors and windows exactly the way world/city.js cuts them, a floor, furniture,
  // roof pieces in the roof batch. Its record joins world.buildings; its doors and windows join world.doors/windows.
  buildBuilding(s, B, P, statics, world) {
    const { ox, oz } = P, cx = ox + B.x, cz = oz + B.z, w = B.w, d = B.d, h = B.h;
    const minX = cx - w / 2, maxX = cx + w / 2, minZ = cz - d / 2, maxZ = cz + d / 2;
    const bi = world.buildings.length;
    const rec = { minX, maxX, minZ, maxZ, enterable: true, roofIdx: [], doors: [], innerDoors: [], ruined: false, district: 'base', h, shopName: `${B.name} · ${s.row.name}`, inside: false, pend: null, baseId: s.id, baseBuilding: B.id };
    const wallsOf = { N: { horiz: true, fixed: minZ, a: minX, b: maxX, c: cx }, S: { horiz: true, fixed: maxZ, a: minX, b: maxX, c: cx }, W: { horiz: false, fixed: minX, a: minZ, b: maxZ, c: cz }, E: { horiz: false, fixed: maxX, a: minZ, b: maxZ, c: cz } };
    const color = B.color, sill = `#${new THREE.Color(color).lerp(new THREE.Color('#c9b896'), 0.32).getHexString()}`;
    for (const side of ['N', 'S', 'W', 'E']) {
      const Wl = wallsOf[side];
      const gaps = [];
      for (const dr of B.doors ?? []) if (dr.side === side) gaps.push({ at: Wl.c + dr.at, w: dr.leaves === 2 ? DOUBLE_GAP : SINGLE_GAP, door: dr });
      for (const by of B.bays ?? []) if (by.side === side) gaps.push({ at: Wl.c + by.at, w: by.width, bay: true });
      gaps.sort((p, q) => p.at - q.at);
      const wins = (B.windows?.[side] ?? []).map((o) => Wl.c + o);
      // Spans between the gaps; corners overlap by half a wall.
      let cur = Wl.a - WALL_T / 2;
      const spans = [];
      for (const gp of gaps) { spans.push([cur, gp.at - gp.w / 2]); cur = gp.at + gp.w / 2; }
      spans.push([cur, Wl.b + WALL_T / 2]);
      for (const [a, b] of spans) {
        if (b - a < 0.05) continue;
        const holes = [];
        let p0 = a;
        for (const c of wins) {
          if (c - WINDOW.width / 2 < a || c + WINDOW.width / 2 > b) continue;
          wallPiece(P.solid, Wl.horiz, Wl.fixed, p0, c - WINDOW.width / 2, 0, h, color);
          wallPiece(P.solid, Wl.horiz, Wl.fixed, c - WINDOW.width / 2, c + WINDOW.width / 2, 0, WINDOW.sill, sill);
          holes.push(c - WINDOW.width / 2, c + WINDOW.width / 2);
          const [wx, wz] = Wl.horiz ? [c, Wl.fixed] : [Wl.fixed, c];
          world.windows.push({ id: `w${world.windows.length + 1}`, x: wx, z: wz, axis: Wl.horiz ? 'x' : 'z', width: WINDOW.width, nx: OUT[side][0], nz: OUT[side][1], state: 'intact', boardSide: -1, b: bi, wallH: h });
          p0 = c + WINDOW.width / 2;
        }
        wallPiece(P.solid, Wl.horiz, Wl.fixed, p0, b, 0, h, color);
        // A darker plinth and a cap along the top so the walls read from above.
        wallPiece(P.solid, Wl.horiz, Wl.fixed, a, b, 0, 0.42, '#4e4b42', 0.06);
        wallPiece(P.solid, Wl.horiz, Wl.fixed, a, b, h - 0.08, h + 0.04, '#5a574c', 0.04);
        const box2 = Wl.horiz ? statics.add(a, Wl.fixed - WALL_T / 2, b, Wl.fixed + WALL_T / 2, 'wall', h) : statics.add(Wl.fixed - WALL_T / 2, a, Wl.fixed + WALL_T / 2, b, 'wall', h);
        if (holes.length) { box2.holes = holes; box2.holeX = Wl.horiz; box2.sill = WINDOW.sill; }
      }
      // Door leaves (interiors.js) and the points just outside each way in.
      for (const gp of gaps) {
        const [x, z] = Wl.horiz ? [gp.at, Wl.fixed] : [Wl.fixed, gp.at];
        const outPt = { x: x + OUT[side][0] * 1.2, z: z + OUT[side][1] * 1.2 };
        if (gp.bay) { rec.doors.push(outPt); P.solid.push(at(box(Wl.horiz ? gp.w : 0.1, 0.35, Wl.horiz ? 0.1 : gp.w, '#2f2d29'), x, h - 0.4, z)); continue; } // rolled-up door drum
        const dr = gp.door, mat = DOOR_MATERIALS[dr.material] ?? DOOR_MATERIALS.wood;
        const row = { id: `d${world.doors.length + 1}`, kind: 'base', x, z, axis: Wl.horiz ? 'x' : 'z', width: gp.w - WALL_T, leaves: dr.leaves ?? 1, hinge: dr.hinge ?? 1,
          material: dr.material, locked: !!dr.locked, open: 0, nx: OUT[side][0], nz: OUT[side][1], b: bi, color: dr.color ?? mat.colors[2] ?? mat.colors[0] };
        world.doors.push(row);
        s.doors.push({ id: row.id, building: B.id, name: B.name, row });
        // A locked door is not a way in: a building whose only door is locked lists none (it is sealed by design).
        if (!row.locked) rec.doors.push(outPt);
      }
    }
    // Floor, furniture, roof.
    P.solid.push(ground(cx, cz, w, d, B.floor ?? '#55524a', 0.12, cx + cz));
    for (const f of B.furniture ?? []) this.buildFurniture(f, P, statics);
    rec.roofIdx = this.buildRoof(B, cx, cz, P.roofs);
    rec.setRoof = (visible) => {
      const M = s.roofMesh;
      for (const i of rec.roofIdx) M.setMatrixAt(i, visible ? s.roofMats[i] : ZERO);
      M.instanceMatrix.needsUpdate = true;
    };
    world.buildings.push(rec);
    s.buildings.push({ id: B.id, name: B.name, rec, index: bi });
  }

  // Roof pieces as instances: a gable of two corrugated slopes with ribs, or a flat slab with a parapet and plant.
  buildRoof(B, cx, cz, roofs) {
    const out = [], h = B.h, w = B.w + 0.5, d = B.d + 0.5, col = B.roofColor ?? '#55594a';
    const rib = `#${new THREE.Color(col).multiplyScalar(0.82).getHexString()}`;
    const add = (x, y, z, sx, sy, sz, color, rx = 0, rz = 0) => {
      _e.set(rx, 0, rz); _q.setFromEuler(_e);
      roofs.push({ m: new THREE.Matrix4().compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz)), color });
      out.push(roofs.length - 1);
    };
    if (B.roof === 'gable') {
      // Ridge along the long axis; each slope tilts 0.16 rad.
      const along = w >= d, half = (along ? d : w) / 2, slope = 0.16, rise = Math.tan(slope) * half;
      for (const sd of [-1, 1]) {
        const off = sd * half / 2, y = h + 0.12 + rise / 2;
        if (along) add(cx, y, cz + off, w, 0.14, half / Math.cos(slope) + 0.04, col, sd * slope, 0);
        else add(cx + off, y, cz, half / Math.cos(slope) + 0.04, 0.14, d, col, 0, -sd * slope);
        // Corrugation ribs.
        const n = Math.floor((along ? w : d) / 0.7);
        for (let k = 0; k <= n; k++) {
          const t = -((along ? w : d) / 2) + 0.2 + k * (((along ? w : d) - 0.4) / n);
          if (along) add(cx + t, y + 0.08, cz + off, 0.07, 0.05, half / Math.cos(slope), rib, sd * slope, 0);
          else add(cx + off, y + 0.08, cz + t, half / Math.cos(slope), 0.05, 0.07, rib, 0, -sd * slope);
        }
      }
      add(cx, h + 0.12 + rise + 0.05, cz, along ? w + 0.05 : 0.3, 0.1, along ? 0.3 : d + 0.05, '#4a4c42'); // ridge cap
      // Vents along the ridge.
      for (let k = -1; k <= 1; k += 2) add(cx + (along ? k * w * 0.28 : 0), h + rise + 0.45, cz + (along ? 0 : k * d * 0.28), 0.6, 0.5, 0.6, '#5e5d55');
    } else {
      add(cx, h + 0.15, cz, w, 0.3, d, col);
      for (const [sx, sz, lx, lz] of [[0, -1, w, 0.3], [0, 1, w, 0.3], [-1, 0, 0.3, d], [1, 0, 0.3, d]]) add(cx + sx * (w / 2 - 0.15), h + 0.45, cz + sz * (d / 2 - 0.15), lx, 0.3, lz, '#47493f');
      // Rooftop plant: an air handler, a vent stack, a hatch.
      add(cx - w * 0.22, h + 0.75, cz - d * 0.15, 1.6, 0.9, 1.2, '#6a6a60');
      add(cx - w * 0.22, h + 1.22, cz - d * 0.15, 1.0, 0.06, 0.9, '#2f2f2b');
      add(cx + w * 0.25, h + 0.55, cz + d * 0.2, 0.9, 0.5, 0.9, '#3e3f39');
      add(cx + w * 0.1, h + 0.65, cz - d * 0.25, 0.35, 0.7, 0.35, '#2c2c28');
    }
    return out;
  }

  buildFurniture(f, P, statics) {
    const { ox, oz } = P, x = ox + f.x, z = oz + f.z, S = P.solid;
    if (f.kind === 'bunk') {
      // Steel bunk: four posts, two frames, two thin mattresses with a rolled blanket each.
      for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) S.push(at(box(0.06, 1.65, 0.06, '#3d4436'), x + a * 0.44, 0.82, z + b * 0.96));
      for (const y of [0.42, 1.32]) {
        S.push(at(box(0.92, 0.07, 1.98, '#3d4436'), x, y, z));
        S.push(at(box(0.8, 0.12, 1.85, '#6b6a52'), x, y + 0.1, z));
        S.push(at(box(0.8, 0.14, 0.3, '#565c45'), x, y + 0.22, z + 0.72));
      }
      statics.addCentered(x, z, 0.95, 2.0, 'bunk', 1.65);
    } else if (f.kind === 'table' || f.kind === 'maptable') {
      S.push(at(box(f.w, 0.08, f.d, '#5a4a36'), x, 0.82, z));
      for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) S.push(at(box(0.07, 0.8, 0.07, '#3a3128'), x + a * (f.w / 2 - 0.08), 0.4, z + b * (f.d / 2 - 0.08)));
      if (f.kind === 'maptable') {
        S.push(at(box(f.w * 0.82, 0.01, f.d * 0.78, '#c9b98e'), x, 0.87, z)); // the map
        for (let k = 0; k < 4; k++) S.push(at(box(0.08, 0.02, 0.08, ['#a3392a', '#2f3a5e', '#a3392a', '#3c3a33'][k]), x - 0.5 + k * 0.33, 0.885, z - 0.2 + (k % 2) * 0.35)); // pins
        for (const sd of [-1, 1]) S.push(at(box(0.42, 0.45, 0.42, '#3a3128'), x + sd * (f.w / 2 + 0.4), 0.23, z));
      } else for (const sd of [-1, 1]) S.push(at(box(f.w, 0.06, 0.3, '#4a3c2c'), x, 0.45, z + sd * (f.d / 2 + 0.35)));
      statics.addCentered(x, z, f.w, f.d, 'table', 0.9);
    } else if (f.kind === 'radio') {
      S.push(at(box(f.w, 0.8, f.d, '#4a4c3e'), x, 0.4, z));
      for (let k = 0; k < 3; k++) S.push(at(box(0.55, 0.32, 0.4, k === 1 ? '#3c4232' : '#2f3329'), x - 0.75 + k * 0.75, 0.97, z));
      S.push(at(box(0.04, 0.9, 0.04, '#222'), x + 0.9, 1.25, z));
      statics.addCentered(x, z, f.w, f.d, 'desk', 1.0);
    } else if (f.kind === 'lockers') {
      S.push(at(box(f.w, f.h, f.d, '#56604a'), x, f.h / 2, z));
      const n = Math.max(1, Math.round(Math.max(f.w, f.d) / 0.6));
      for (let k = 1; k < n; k++) { const t = -Math.max(f.w, f.d) / 2 + k * (Math.max(f.w, f.d) / n); S.push(at(box(f.w > f.d ? 0.02 : f.w + 0.02, f.h - 0.1, f.w > f.d ? f.d + 0.02 : 0.02, '#2f3528'), x + (f.w > f.d ? t : 0), f.h / 2, z + (f.w > f.d ? 0 : t))); }
      statics.addCentered(x, z, f.w, f.d, 'lockers', f.h);
    } else if (f.kind === 'racks') {
      S.push(at(box(f.w, 0.12, f.d, '#3a3a33'), x, 0.3, z), at(box(f.w, 0.1, f.d, '#3a3a33'), x, f.h, z));
      const n = Math.floor(Math.max(f.w, f.d) / 0.38);
      for (let k = 0; k < n; k++) { // rifles standing in the rack, muzzles up
        const t = -Math.max(f.w, f.d) / 2 + 0.2 + k * 0.38;
        S.push(at(box(f.w > f.d ? 0.06 : 0.12, 1.15, f.w > f.d ? 0.12 : 0.06, '#1c1c1a'), x + (f.w > f.d ? t : 0), 0.95, z + (f.w > f.d ? 0 : t)));
      }
      statics.addCentered(x, z, f.w, f.d, 'racks', f.h);
    } else if (f.kind === 'bench') {
      S.push(at(box(f.w, 0.1, f.d, '#4a3c2c'), x, 0.88, z), at(box(f.w - 0.1, 0.8, f.d - 0.1, '#3e4a3a'), x, 0.42, z));
      S.push(at(box(0.25, 0.2, 0.3, '#2a2a28'), x - f.w / 2 + 0.3, 1.02, z), at(box(0.6, 0.15, 0.3, '#7a2a1c'), x + 0.6, 0.98, z)); // vice, a red toolbox
      statics.addCentered(x, z, f.w, f.d, 'bench', 1.0);
    } else if (f.kind === 'engine') {
      S.push(at(box(f.w, 0.6, f.d, '#3a3833'), x, 0.75, z), at(box(f.w * 0.6, 0.25, f.d * 0.9, '#2a2826'), x, 1.17, z));
      for (const sd of [-1, 1]) S.push(at(box(0.08, 0.45, 0.08, '#7a2a1c'), x + sd * f.w * 0.4, 0.22, z));
      statics.addCentered(x, z, f.w, f.d, 'engine', 1.3);
    } else if (f.kind === 'chassis') {
      // A truck stripped to the frame, up on blocks: two rails, axles, no wheels.
      for (const sd of [-1, 1]) S.push(at(box(0.16, 0.22, 4.1, '#2c2b28'), x + sd * 0.55, 0.62, z));
      for (const zz of [-1.3, 1.3]) { S.push(at(box(1.9, 0.14, 0.14, '#33312d'), x, 0.5, z + zz)); for (const sd of [-1, 1]) S.push(at(box(0.4, 0.4, 0.4, '#6a6458'), x + sd * 0.7, 0.2, z + zz)); }
      S.push(at(box(1.0, 0.7, 1.2, '#3a3833'), x, 0.95, z + 1.2), at(box(1.7, 0.08, 0.9, '#55593f'), x, 1.32, z - 1.4)); // engine block, a door panel lying across
      statics.addCentered(x, z, 1.9, 4.2, 'chassis', 1.3);
    } else if (f.kind === 'drum') {
      S.push(at(cyl(0.42, 0.42, 1.0, '#7a3a1c', 12), x, 0.5, z), at(cyl(0.43, 0.43, 0.05, '#4a2a16', 12), x, 0.75, z));
      statics.addCentered(x, z, 0.9, 0.9, 'barrel', 1.0);
    }
  }

  buildBox(s, b, P, statics) {
    const { ox, oz } = P, x = ox + b.x, z = oz + b.z, S = P.solid;
    const col = { crate: '#565c3e', locker: '#4b5640', cabinet: '#6a6c66', chest: '#8a2e20' }[b.look] ?? '#5a5a48';
    S.push(at(box(b.w, b.h, b.d, col), x, b.h / 2, z));
    if (b.look === 'crate') { // rope handles, a stencilled band
      S.push(at(box(b.w + 0.02, 0.08, b.d + 0.02, '#3a3d2a'), x, b.h * 0.7, z));
      S.push(at(box(b.w * 0.5, 0.01, b.d * 0.35, '#c9c0a2'), x, b.h + 0.005, z));
    } else if (b.look === 'cabinet') for (let k = 1; k < 4; k++) S.push(at(box(b.w + 0.02, 0.02, b.d + 0.02, '#4a4c48'), x, (b.h * k) / 4, z));
    else S.push(at(box(b.w + 0.02, 0.05, b.d + 0.02, '#2e322a'), x, b.h * 0.85, z));
    statics.addCentered(x, z, b.w, b.d, 'milbox', b.h);
    s.boxes.push({ id: b.id, key: `box:base:${s.id}:${b.id}`, table: b.table, x, z, cap: b.cap, label: b.label });
  }

  buildProp(s, p, P, statics) {
    const { ox, oz } = P, S = P.solid;
    const x = ox + (p.x ?? 0), z = oz + (p.z ?? 0);
    switch (p.kind) {
      case 'booth': {
        const { w, d, h } = p;
        S.push(at(box(w, 1.0, d, '#7d775f'), x, 0.5, z));                                   // the lower walls
        S.push(at(box(w - 0.1, h - 1.0 - 0.3, d - 0.1, '#2e3a3c'), x, 1.0 + (h - 1.3) / 2, z)); // glass all round
        for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) S.push(at(box(0.1, h, 0.1, '#5c584a'), x + a * (w / 2 - 0.05), h / 2, z + b * (d / 2 - 0.05)));
        S.push(at(box(w + 0.6, 0.18, d + 0.6, '#55594a'), x, h + 0.09, z), at(box(0.5, 0.25, 0.5, '#3a3a34'), x + 0.4, h + 0.3, z - 0.3));
        statics.addCentered(x, z, w, d, 'booth', h);
        break;
      }
      case 'helipad': {
        const n = p.size;
        S.push(ground(x, z, n, n, '#8f8a7d', 0.035, 3));
        S.push(flatRing(x, z, n * 0.4 - 0.35, n * 0.4, '#c9a640', 0.05));
        for (const sd of [-1, 1]) S.push(at(box(0.6, 0.02, 4.2, '#e2dccb'), x + sd * 1.1, 0.05, z));
        S.push(at(box(1.6, 0.02, 0.6, '#e2dccb'), x, 0.05, z));
        for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) S.push(at(box(0.25, 0.18, 0.25, '#c9a640'), x + a * (n / 2 - 0.3), 0.1, z + b * (n / 2 - 0.3)));
        break;
      }
      case 'heliwreck': this.heliWreck(x, z, p.h ?? 0, S, statics); break;
      case 'antenna': {
        const H = p.height, w0 = 0.45;
        for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) S.push(bar([x + a * w0, 0, z + b * w0], [x + a * 0.08, H, z + b * 0.08], 0.06, '#4a4a44'));
        for (let y = 1.2; y < H - 1; y += 1.4) { const k = w0 - (w0 - 0.08) * (y / H); S.push(at(box(k * 2, 0.04, 0.04, '#5a5a52'), x, y, z + k), at(box(k * 2, 0.04, 0.04, '#5a5a52'), x, y, z - k), at(box(0.04, 0.04, k * 2, '#5a5a52'), x + k, y, z), at(box(0.04, 0.04, k * 2, '#5a5a52'), x - k, y, z)); }
        S.push(at(box(0.05, 2.2, 0.05, '#2a2a28'), x, H + 1.1, z), at(box(0.9, 0.05, 0.05, '#2a2a28'), x, H - 0.4, z), at(box(0.05, 0.05, 0.9, '#2a2a28'), x, H - 0.9, z));
        for (const [a, b] of [[1, 0.4], [-0.6, 1], [-0.7, -0.8]]) S.push(bar([x, H * 0.75, z], [x + a * 5, 0.05, z + b * 5], 0.025, '#8a8a80')); // guy wires
        statics.addCentered(x, z, 1.0, 1.0, 'mast', H);
        break;
      }
      case 'generator': {
        S.push(at(box(p.w, 0.9, p.d, '#4d5440'), x, 0.5, z), at(box(p.w + 0.1, 0.1, p.d + 0.1, '#2e2f2a'), x, 0.05, z));
        S.push(at(box(0.04, 0.6, p.d * 0.8, '#1c1c1a'), x - p.w / 2 - 0.02, 0.55, z), at(cyl(0.06, 0.06, 0.8, '#2a2a28', 8), x + p.w * 0.3, 1.3, z));
        statics.addCentered(x, z, p.w, p.d, 'generator', 1.0);
        break;
      }
      case 'flagpole': {
        S.push(at(box(0.7, 0.3, 0.7, '#8f8a7d'), x, 0.15, z), at(cyl(0.065, 0.08, p.height, '#c8c4b8', 8), x, p.height / 2, z), at(cyl(0.12, 0.12, 0.12, '#c9a640', 8), x, p.height + 0.06, z));
        this.flag(x, z, p.height - 0.15, S);
        statics.addCentered(x, z, 0.7, 0.7, 'flagpole', p.height);
        break;
      }
      case 'tent': this.tent(x, z, p.w, p.d, S, statics); break;
      case 'fueltank': {
        const along = p.along === 'x', L = p.len;
        const g2 = new THREE.CylinderGeometry(0.72, 0.72, L, 16).toNonIndexed().rotateZ(along ? Math.PI / 2 : 0).rotateX(along ? 0 : Math.PI / 2);
        S.push(at(paint(g2, '#7c7a64'), x, 1.05, z));
        for (const t of [-L * 0.32, L * 0.32]) S.push(at(box(along ? 0.3 : 1.5, 0.45, along ? 1.5 : 0.3, '#3c3a33'), x + (along ? t : 0), 0.22, z + (along ? 0 : t)));
        S.push(at(box(along ? 2.2 : 0.06, 0.06, along ? 0.06 : 2.2, '#a33a2a'), x, 1.78, z)); // a red band
        S.push(bar([x + (along ? L / 2 : 0), 0.9, z + (along ? 0 : L / 2)], [x + (along ? L / 2 + 0.8 : 0.4), 0.05, z + (along ? 0.6 : L / 2 + 0.8)], 0.07, '#1e1e1c')); // the hose
        for (let k = 0; k < 3; k++) S.push(at(box(0.18, 0.46, 0.32, '#5a6142'), x + (along ? -L / 2 + 0.3 + k * 0.25 : 1.0), 0.23, z + (along ? 1.05 : -L / 2 + 0.3 + k * 0.25))); // jerry cans
        statics.addCentered(x, z, along ? L : 1.5, along ? 1.5 : L, 'tank', 1.8);
        break;
      }
      case 'apron': {
        const ax = ox + (p.x0 + p.x1) / 2, az = oz + (p.z0 + p.z1) / 2, aw = p.x1 - p.x0, ad = p.z1 - p.z0;
        S.push(ground(ax, az, aw, ad, '#8a8579', 0.03, 11));
        for (let t = p.x0 + 2; t < p.x1 - 1; t += 4.6) S.push(at(box(0.15, 0.01, ad * 0.55, '#bfa64a'), ox + t, 0.042, az - ad * 0.1)); // worn parking lines
        for (const [a, b, r] of [[0.3, 0.2, 0.7], [0.62, 0.55, 0.9], [0.8, 0.3, 0.55], [0.66, 0.6, 0.5]]) S.push(flatDisc(ox + p.x0 + aw * a, oz + p.z0 + ad * b, r, '#6b665c', 0.04)); // old oil
        break;
      }
      case 'sandbags': {
        const along = p.along === 'x', L = p.len, n = Math.max(2, Math.round(L / 0.58));
        for (let row2 = 0; row2 < 3; row2++) for (let k = 0; k < n - (row2 % 2); k++) {
          const t = -L / 2 + (L / n) * (k + 0.5 + (row2 % 2) * 0.5);
          const c = ['#8a7c5a', '#7e7152', '#93855f', '#857653'][(k + row2) % 4];
          S.push(at(sandbag(c), x + (along ? t : 0), 0.15 + row2 * 0.28, z + (along ? 0 : t), along ? 0 : Math.PI / 2));
        }
        statics.addCentered(x, z, along ? L : 0.7, along ? 0.7 : L, 'sandbags', 0.95);
        break;
      }
      case 'barrier': {
        const along = p.along === 'x', L = p.len;
        S.push(at(box(along ? L : 0.62, 0.32, along ? 0.62 : L, '#a39d8d'), x, 0.16, z), at(box(along ? L : 0.34, 0.5, along ? 0.34 : L, '#aaa494'), x, 0.57, z), at(box(along ? L : 0.26, 0.04, along ? 0.26 : L, '#8d8778'), x, 0.84, z));
        S.push(at(box(along ? L * 0.98 : 0.36, 0.08, along ? 0.36 : L * 0.98, '#6a6458'), x, 0.36, z)); // grime line
        statics.addCentered(x, z, along ? L : 0.62, along ? 0.62 : L, 'barrier', 0.86);
        break;
      }
      case 'flood': {
        const H = p.height;
        S.push(at(box(0.6, 0.25, 0.6, '#8f8a7d'), x, 0.12, z), at(box(0.18, H, 0.18, '#4a4a44'), x, H / 2, z), at(box(1.6, 0.1, 0.1, '#3a3a34'), x, H, z));
        for (const sd of [-1, 1]) { S.push(at(box(0.5, 0.36, 0.42, '#2e2e2a'), x + sd * 0.62, H - 0.1, z)); S.push(at(box(0.42, 0.04, 0.34, '#fff2cf'), x + sd * 0.62, H - 0.3, z)); }
        statics.addCentered(x, z, 0.45, 0.45, 'mast', H);
        s.pools.push({ kind: 'flood', x, z, r: p.r, color: '#ffe3b0' });
        break;
      }
    }
  }

  // A crashed transport helicopter, burned out, lying on its side off the pad: fuselage, glazing, tail boom snapped,
  // rotor blades in the dirt, skids bent, a scorch round it.
  heliWreck(x, z, h, S, statics) {
    // The airframe is built upright round its own centre (nose +z), then rolled onto its left side.
    const olive = '#4f5339', char = '#2c2a24', glass = '#1f272a', body = [];
    body.push(box(2.2, 1.9, 4.2, olive));                                                         // the cabin
    body.push(box(1.9, 1.35, 1.2, olive).translate(0, -0.2, 2.65));                              // the nose
    body.push(box(1.7, 0.08, 1.1, glass).rotateX(-0.75).translate(0, 0.62, 2.85));               // windshield, smashed dark
    for (const sd of [-1, 1]) body.push(box(0.04, 0.42, 2.6, glass).translate(sd * 1.11, 0.45, -0.1)); // cabin windows
    body.push(box(0.04, 1.4, 1.5, '#16191a').translate(1.11, -0.1, 0.4));                        // the door, slid open
    body.push(box(1.25, 0.7, 2.5, '#454934').translate(0, 1.3, -0.4));                           // engine housing
    body.push(box(0.4, 0.5, 0.4, '#232220').translate(0, 1.85, 0.2));                            // rotor head
    for (const [px, py, pz, sx, sz] of [[0.6, 0.96, -1.3, 1.0, 1.4], [-0.7, 0.5, 1.2, 0.9, 1.2], [0.2, 1.66, -1.0, 0.8, 1.1]]) body.push(box(sx, 0.03, sz, char).translate(px, py, pz)); // scorched
    for (const sd of [-1, 1]) { body.push(box(0.09, 0.09, 3.6, '#2c2c28').translate(sd * 0.95, -1.35, 0.2)); for (const zz of [-0.9, 1.0]) body.push(box(0.07, 0.42, 0.07, '#2c2c28').translate(sd * 0.95, -1.1, zz)); } // skids
    const hull = mergeGeometries(body).rotateZ(1.2).translate(0, 1.25, 0);
    const parts = [flatDiscGeo(0, 0, 4.6, '#3a3128', 0.018), flatDiscGeo(0.8, -1.0, 2.6, '#2a241e', 0.022), hull];
    parts.push(paint(new THREE.CylinderGeometry(0.3, 0.55, 3.6, 8).toNonIndexed().rotateX(-Math.PI / 2), '#454935').rotateZ(1.2).translate(-0.3, 0.75, -3.9)); // tail boom, snapped off here
    parts.push(paint(new THREE.CylinderGeometry(0.22, 0.3, 1.8, 8).toNonIndexed().rotateX(-Math.PI / 2), '#454935').rotateY(0.6).translate(-1.4, 0.3, -6.6)); // ...and the end of it
    parts.push(box(0.12, 1.3, 0.9, '#3d4030').rotateY(0.6).rotateZ(1.3).translate(-2.0, 0.25, -7.3));                           // the fin, flat in the sand
    parts.push(box(0.32, 0.06, 7.0, '#252522').rotateY(0.9).rotateZ(0.1).translate(2.2, 0.32, 1.2)); // a blade in the sand
    parts.push(box(0.32, 0.06, 3.8, '#252522').rotateY(-0.5).rotateX(0.32).translate(-1.9, 0.7, 2.0)); // a blade snapped and propped
    parts.push(box(0.32, 0.06, 2.4, '#252522').rotateY(2.1).translate(3.6, 0.05, -2.4));
    parts.push(box(1.0, 0.04, 0.9, '#1d1b19').translate(2.4, 0.03, -1.6), box(0.6, 0.3, 0.5, '#3a3a34').rotateY(0.6).translate(-2.8, 0.15, 2.6), box(0.5, 0.25, 0.7, olive).rotateY(1.2).translate(3.1, 0.12, 1.0)); // debris
    S.push(mergeGeometries(parts).rotateY(h).translate(x, 0, z));
    statics.addCentered(x, z, 3.2, 5.4, 'wreck', 2.0);
  }

  // The old flag on the pole: thirteen stripes and the canton, hung with a little ripple.
  flag(x, z, top, S) {
    const W = 2.0, H = 1.05, n = 13, strips = 6;
    for (let i = 0; i < strips; i++) {
      const u0 = (i / strips) * W, u1 = ((i + 1) / strips) * W, wave = Math.sin(i * 1.3) * 0.07, cw = 0.4 * W;
      for (let k = 0; k < n; k++) {
        const y0 = top - (k + 1) * (H / n), canton = k < 7 && u1 <= cw + 1e-6;
        S.push(at(box(u1 - u0, H / n + 0.002, 0.02, canton ? '#2f3a5e' : k % 2 ? '#d8d2c2' : '#9a2a2a'), x + 0.08 + (u0 + u1) / 2, y0 + H / n / 2, z + wave));
      }
    }
  }

  tent(x, z, w, d, S, statics) {
    const ridge = 2.6, eave = 1.15, hw = w / 2, ang = Math.atan2(ridge - eave, hw), slope = hw / Math.cos(ang);
    for (const sd of [-1, 1]) {
      S.push(at(box(slope + 0.1, 0.06, d, sd > 0 ? '#5a5f40' : '#646a48'), x + sd * hw / 2, (ridge + eave) / 2, z, 0, 0, -sd * ang));
      S.push(at(box(0.04, eave, d, '#5e6344'), x + sd * hw, eave / 2, z)); // the walls
    }
    for (const sd of [-1, 1]) { // the end walls, stepped up to the ridge
      for (let k = 0; k < 4; k++) { const f = (k + 0.5) / 4, ww = w * (1 - f * 0.85); S.push(at(box(ww, (ridge - 0) / 4, 0.04, '#5b6042'), x, (ridge / 4) * (k + 0.5), z + sd * d / 2)); }
      S.push(at(box(0.9, 1.8, 0.05, '#3e4230'), x, 0.9, z + sd * (d / 2 + 0.01))); // the door flap
    }
    S.push(at(box(0.08, 0.08, d + 0.3, '#3a3a30'), x, ridge + 0.02, z)); // ridge pole
    for (const [a, b] of [[-1, -0.4], [1, -0.4], [-1, 0.4], [1, 0.4]]) S.push(bar([x + a * hw, eave, z + b * d], [x + a * (hw + 1.3), 0.02, z + b * d], 0.025, '#b8ab8a')); // guy lines
    statics.addCentered(x, z, w, d, 'tent', ridge);
  }

  // The gate sign, on the fence's outer face: a plate cut from the chain-link atlas's lower band.
  buildSign(s, sg, P) {
    if (!sg) return;
    const x = P.ox + sg.x, z = P.oz + sg.z, geo = new THREE.PlaneGeometry(sg.w, sg.h);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i), uv.getY(i) * 0.25); // v 0..0.25 is the sign
    geo.translate(x, sg.y, z + 0.06);
    P.mesh.push(geo.toNonIndexed());
    P.solid.push(at(box(sg.w + 0.08, sg.h + 0.08, 0.03, '#3a3a34'), x, sg.y, z + 0.03));
  }

  // ---- the lights: pools on the ground (floodlights fixed, searchlights moving) and searchlight beams ------------
  buildLights(s, scene) {
    for (const t of s.towers) s.pools.push({ kind: 'search', x: t.x, z: t.z, r: BASE_RULES.beamRadius, color: '#eef2ff', tower: t });
    const glowGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    s.poolMat = new THREE.MeshBasicMaterial({ map: radialGlow(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 });
    s.poolMesh = new THREE.InstancedMesh(glowGeo, s.poolMat, s.pools.length);
    s.poolMesh.renderOrder = 2; s.poolMesh.frustumCulled = false; s.poolMesh.visible = false;
    s.poolMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    s.pools.forEach((p, i) => { s.poolMesh.setColorAt(i, _c.set(p.color)); this.writePool(s, i, p.x, p.z, p.r, p.r, 0); });
    s.poolMesh.instanceColor.needsUpdate = true;
    scene.add(s.poolMesh);
    // Beams: open cones, bright at the lamp and fading toward the ground (vertex colour, additive).
    const cone = new THREE.CylinderGeometry(0.06, 1, 1, 14, 1, true);
    const pos = cone.attributes.position, col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) { const k = 0.18 + 0.82 * (pos.getY(i) + 0.5); col[i * 3] = k; col[i * 3 + 1] = k; col[i * 3 + 2] = k; }
    cone.setAttribute('color', new THREE.BufferAttribute(col, 3));
    s.beamMat = new THREE.MeshBasicMaterial({ color: '#f3f1e6', vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 });
    s.beamMesh = new THREE.InstancedMesh(cone, s.beamMat, Math.max(1, s.towers.length));
    s.beamMesh.renderOrder = 3; s.beamMesh.frustumCulled = false; s.beamMesh.visible = false;
    s.beamMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(s.beamMesh);
    // Both move every frame, so neither computes its bounds from its instances: one fixed sphere round the compound
    // (the fence's half-diagonal plus the farthest a beam reaches out of a corner tower when it tracks you) lets the
    // camera cull them, so a base out of view costs no draw call at night.
    const f = s.fence, sphere = new THREE.Sphere(new THREE.Vector3((f.x0 + f.x1) / 2, 3, (f.z0 + f.z1) / 2), Math.hypot(f.x1 - f.x0, f.z1 - f.z0) / 2 + BASE_RULES.beamReach[1] + 16);
    for (const m of [s.poolMesh, s.beamMesh]) { m.boundingSphere = sphere; m.frustumCulled = true; }
  }

  writePool(s, i, x, z, rx, rz, h) {
    _e.set(0, h, 0); _q.setFromEuler(_e);
    s.poolMesh.setMatrixAt(i, _m.compose(_p.set(x, 0.13, z), _q, _s.set(rx * 2, 1, rz * 2)));
  }

  // ==== populate (after the town's people, from its own seed: nobody else's spawns move) =========================
  populate() {
    const g = this.g;
    for (const s of this.sites) {
      const rng = makeRng(7349 + s.id.length * 31);
      const row = s.row, R = BASE_RULES;
      const enlist = (x, z, extra) => {
        let r = rng(), weapon = Object.keys(R.weapons)[0];
        for (const [w, p] of Object.entries(R.weapons)) if ((r -= p) <= 0) { weapon = w; break; }
        const c = this.spawnSoldier(x, z, rng, weapon);
        if (!c) return null;
        Object.assign(c, { baseId: s.id }, extra);
        s.guards.push(c);
        return c;
      };
      for (const p of row.posts) {
        if (p.role === 'tower') {
          const t = s.towers.find((q) => q.id === p.tower);
          const c = enlist(t.x, t.z, { post: { id: p.id, role: 'tower', x: t.x, z: t.z, face: t.face }, perch: true, perchY: TOWER.deck });
          if (c) { c.x = t.x; c.z = t.z; c.face = t.face; }
        } else {
          const x = s.ox + p.x, z = s.oz + p.z;
          const c = enlist(x, z, { post: { id: p.id, role: p.role, x, z, face: p.face } });
          if (c) c.face = p.face;
        }
      }
      for (const pt of row.patrols) {
        const route = pt.route.map(([x, z]) => ({ x: s.ox + x, z: s.oz + z }));
        for (let k = 0; k < pt.size; k++) {
          const ri = Math.floor((k * route.length) / pt.size);
          enlist(route[ri].x, route[ri].z, { route, ri: (ri + 1) % route.length, pace: pt.pace, patrol: pt.id });
        }
      }
      for (const v of row.vehicles) {
        const veh = g.vehiclesSys.spawn(v.type, s.ox + v.x, s.oz + v.z, v.h, v.paint);
        veh.owner = s.faction; veh.baseId = s.id;
        s.vehicles.push(veh);
      }
    }
  }

  spawnSoldier(x, z, rng = Math.random, weapon = 'rifle') {
    const g = this.g, R = BASE_RULES;
    const c = g.addChar({ x, z, faction: 'soldier', weapon, hp: R.hp, colors: outfit('soldier', rng), name: randomName(rng), flag: soldierFlag(g, rng) });
    if (!c) return null;
    c.fid = 'remnant'; g.society.factions.assign(c);
    c.grenades = rng() < 0.3 ? 1 : 0;
    return c;
  }

  // Containers (inventory.js) once it exists: the loot rolls from the table the first time anyone opens one.
  placeBoxes() {
    const inv = this.g.inventory;
    for (const s of this.sites) for (const b of s.boxes) b.box = inv.place(b.key, b.table, b.x, b.z, b.cap, b.label);
  }

  // ==== run ========================================================================================================
  update(dt) {
    const g = this.g, night = g.sky.night;
    for (const s of this.sites) {
      this.updateLights(s, dt, night);
      this.watch(s, dt);
    }
  }

  updateLights(s, dt, night) {
    const g = this.g, on = night > 0.04;
    s.poolMesh.visible = on; s.beamMesh.visible = on;
    if (!on) return;
    const P = g.player, px = P.inVehicle ? P.inVehicle.x : P.x, pz = P.inVehicle ? P.inVehicle.z : P.z, R = BASE_RULES;
    s.poolMat.opacity = Math.min(1, night * 0.95);
    s.beamMat.opacity = night * 0.2;
    const t = g.time, first = s.pools.length - s.towers.length;
    for (let i = 0; i < s.towers.length; i++) {
      const tw = s.towers[i];
      // Slow sweep across the tower's quarter, the reach breathing in and out; on the alarm, the beam finds you.
      const u = 0.5 - 0.5 * Math.cos((2 * Math.PI * t) / R.sweepPeriod + tw.phase);
      const h = lerp(tw.sweep[0], tw.sweep[1], u), reach = lerp(R.beamReach[0], R.beamReach[1], 0.5 + 0.5 * Math.sin(t * 0.37 + tw.phase));
      let tx = tw.x + Math.sin(h) * reach, tz = tw.z + Math.cos(h) * reach;
      if (s.alert === 'hostile' && P.alive && Math.hypot(px - tw.x, pz - tw.z) < R.beamReach[1] + 14) { tx = px; tz = pz; }
      const dx = tx - tw.poolX, dz = tz - tw.poolZ, d = Math.hypot(dx, dz), step = Math.min(d, (s.alert === 'hostile' ? 16 : 7) * dt);
      if (d > 1e-4) { tw.poolX += (dx / d) * step; tw.poolZ += (dz / d) * step; }
      const pool = s.pools[first + i];
      pool.x = tw.poolX; pool.z = tw.poolZ;
      const far = Math.hypot(tw.poolX - tw.lampX, tw.poolZ - tw.lampZ), ang = Math.atan2(tw.poolX - tw.lampX, tw.poolZ - tw.lampZ);
      this.writePool(s, first + i, tw.poolX, tw.poolZ, R.beamRadius, R.beamRadius * (1 + far * 0.04), ang);
      // The beam: from the lamp to the pool's centre, as wide as the pool where it meets the ground.
      _dir.set(tw.lampX - tw.poolX, TOWER.lamp, tw.lampZ - tw.poolZ);
      const len = _dir.length();
      _q.setFromUnitVectors(_up, _dir.multiplyScalar(1 / len));
      s.beamMesh.setMatrixAt(i, _m.compose(_p.set((tw.lampX + tw.poolX) / 2, TOWER.lamp / 2, (tw.lampZ + tw.poolZ) / 2), _q, _s.set(R.beamRadius * 0.9, len, R.beamRadius * 0.9)));
    }
    s.poolMesh.instanceMatrix.needsUpdate = true;
    s.beamMesh.instanceMatrix.needsUpdate = true;
  }

  // Is (x, z) in a lit pool right now (a floodlight's, or under a searchlight)?
  lit(s, x, z) {
    if (this.g.sky.night < 0.3) return false;
    for (const p of s.pools) if (Math.hypot(p.x - x, p.z - z) < p.r * (p.kind === 'search' ? 1.1 : 0.75)) return true;
    return false;
  }

  inside(s, x, z, margin = 0) { const f = s.fence; return x > f.x0 - margin && x < f.x1 + margin && z > f.z0 - margin && z < f.z1 + margin; }

  // How far a sentry picks the player out right now: shorter at night and crouched, longer in a car or a pool of light.
  spotRange(s) {
    const g = this.g, P = g.player, R = BASE_RULES, v = P.inVehicle;
    let range = lerp(R.spotDay, R.spotNight, g.sky.night);
    if (v) range *= R.vehicleMul; else if (P.crouch) range *= R.crouchMul;
    if (this.lit(s, v ? v.x : P.x, v ? v.z : P.z)) range = Math.max(range, R.spotLit);
    return range;
  }

  // A sentry (of `guards`, default all of them) who can see the player right now, or null.
  spotter(s, guards = s.guards) {
    const g = this.g, P = g.player;
    if (!P.alive || P.hidden || P.underwater) return null;
    const v = P.inVehicle, px = v ? v.x : P.x, pz = v ? v.z : P.z;
    let best = null, bd = this.spotRange(s);
    for (const c of guards) {
      if (!c.alive || c.inVehicle) continue;
      const d = Math.hypot(c.x - px, c.z - pz);
      if (d < bd && g.los(c.x, c.z, px, pz)) { bd = d; best = c; }
    }
    return best;
  }

  tier(s) { const F = this.g.society.factions, i = F.index[s.faction]; return i === undefined ? 'neutral' : F.tiers[i]; }

  watch(s, dt) {
    const g = this.g, P = g.player, R = BASE_RULES;
    const v = P.inVehicle, px = v ? v.x : P.x, pz = v ? v.z : P.z;
    const inside = P.alive && this.inside(s, px, pz), near = P.alive && this.inside(s, px, pz, R.nearMargin);
    if (!near && s.alert === 'calm' && !s.seenBy) { s.cleared = false; s.shotWarned = false; return; } // nobody home to watch: cheap
    s.checkT -= dt;
    if (s.checkT <= 0) { s.checkT = 0.2; s.seenBy = near ? this.spotter(s) : null; if (s.seenBy) { s.lastSeen.x = px; s.lastSeen.z = pz; s.lastSeen.t = g.time; } }
    const tier = this.tier(s), friendly = tier === 'friendly' || tier === 'allied', enemy = tier === 'hostile' || tier === 'hunted';
    // Anyone who hurt one of them is a problem whoever they are.
    if (s.alert !== 'hostile') for (const c of s.guards) if (c.alive && c.grudge === P) { this.alarm(s, 'attacked', c); return; }
    if (s.alert === 'calm') {
      if (!s.seenBy) { if (!near) { s.cleared = false; s.shotWarned = false; } return; }
      if (enemy) { this.alarm(s, 'enemy', s.seenBy); return; }
      if (!inside) return;
      if (friendly) { if (!s.cleared) { s.cleared = true; this.say(s, s.seenBy, BASE_LINES.cleared, 'baseCleared'); g.hud.toast(`${s.name}: CLEARED THROUGH`, 'job'); } return; }
      if (g.time - s.warnedAt < R.warnMemory) { this.alarm(s, 'returned', s.seenBy); return; }
      this.warn(s, s.seenBy);
    } else if (s.alert === 'warned') {
      if (enemy) { this.alarm(s, 'enemy', s.seenBy); return; }
      if (friendly) { s.alert = 'calm'; return; } // squared away while you stood there
      if (!inside) { s.outT += dt; if (s.outT > R.warnLeave) { s.alert = 'calm'; g.emit('baseCalm', { base: s.id, why: 'heeded' }); } return; }
      s.outT = 0; s.warnT += dt;
      if (s.warnT >= R.grace) this.alarm(s, 'stayed', s.seenBy);
    } else {
      // Hostile: stand down once you have been gone a while (out of the wire and out of sight), or dead.
      if (!P.alive || (!near && !s.seenBy)) { s.coolT += dt; if (s.coolT > R.calmAfter || (!P.alive && s.coolT > 3)) this.calm(s, P.alive ? 'lost' : 'down'); }
      else s.coolT = 0;
    }
  }

  say(s, c, text, type) {
    const g = this.g, P = g.player;
    if (c) { c.face = Math.atan2(P.x - c.x, P.z - c.z); }
    const who = c?.name ?? 'Sentry';
    g.hud.subtitle(`${who}: "${text}"`, 4);
    g.emit(type, { base: s.id, by: c?.id ?? null, name: who, text });
  }

  warn(s, c) {
    s.alert = 'warned'; s.warnT = 0; s.outT = 0; s.warnedAt = this.g.time; s.warnings++;
    this.say(s, c, BASE_LINES.warn, 'baseWarning');
    this.g.audio.blip?.();
  }

  // The post opens fire: every sentry takes a grudge; those who can see you take you on at once.
  alarm(s, why, by = null, quiet = false) {
    const g = this.g, P = g.player, R = BASE_RULES;
    const first = s.alert !== 'hostile';
    s.alert = 'hostile'; s.why = why; s.coolT = 0; s.alarms += first ? 1 : 0;
    const px = P.inVehicle ? P.inVehicle.x : P.x, pz = P.inVehicle ? P.inVehicle.z : P.z;
    if (P.alive) { s.lastSeen.x = px; s.lastSeen.z = pz; s.lastSeen.t = g.time; }
    let engaged = 0;
    for (const c of s.guards) {
      if (!c.alive) continue;
      c.grudge = P; c.leash = R.leash;
      if (Math.hypot(c.x - px, c.z - pz) < R.engage && g.los(c.x, c.z, px, pz)) { c.target = P; c.state = 'fight'; c.react = 0.25 + Math.random() * 0.5; engaged++; }
    }
    if (!first || quiet) return;
    if (why !== 'enemy' && why !== 'returned') this.say(s, by, why === 'shots' ? BASE_LINES.alarm : why === 'stayed' ? BASE_LINES.alarm : BASE_LINES.alarm, 'baseShout');
    else if (why === 'returned') this.say(s, by, BASE_LINES.returned, 'baseShout');
    g.hud.toast(`${s.name}: ALARM`, 'hot');
    g.audio.siren?.(Math.hypot(px - (s.fence.x0 + s.fence.x1) / 2, pz - (s.fence.z0 + s.fence.z1) / 2));
    // The Remnant remember a trespasser (a deed their own people witness); an enemy they were already shooting at
    // is not news.
    if (why !== 'enemy' && P.alive) g.society.deeds.record('trespass', { x: px, z: pz, tf: s.faction, m: 1, label: s.row.spoken });
    g.emit('baseAlarm', { base: s.id, why, by: by?.id ?? null, engaged, guards: s.guards.filter((c) => c.alive).length });
  }

  calm(s, why, quiet = false) {
    const g = this.g, P = g.player;
    s.alert = 'calm'; s.why = null; s.coolT = 0; s.warnT = 0; s.seenBy = null;
    for (const c of s.guards) {
      if (c.grudge === P) c.grudge = null;
      if (c.target === P) { c.target = null; c.state = 'idle'; }
      c._bp = null;
    }
    if (!quiet) g.emit('baseCalm', { base: s.id, why });
  }

  // Heard something (main.noise): a shot fired by the player inside the wire, or close enough to it, is an attack.
  // A Remnant-friendly player gets one shouted warning first.
  onNoise(x, z, r, src) {
    const g = this.g, P = g.player;
    if (src !== P || !P.alive) return;
    for (const s of this.sites) {
      if (s.alert === 'hostile' || !this.inside(s, x, z, BASE_RULES.shotMargin)) continue;
      let heard = false; // somebody close enough to hear it
      for (const c of s.guards) if (c.alive && Math.hypot(c.x - x, c.z - z) < Math.max(r, 12)) { heard = true; break; }
      if (!heard) continue;
      const tier = this.tier(s);
      if ((tier === 'friendly' || tier === 'allied') && !s.shotWarned) { s.shotWarned = true; this.say(s, this.nearestGuard(s, x, z), BASE_LINES.ceasefire, 'baseShout'); continue; }
      this.alarm(s, 'shots', this.nearestGuard(s, x, z));
    }
  }

  nearestGuard(s, x, z) { let b = null, bd = Infinity; for (const c of s.guards) { if (!c.alive) continue; const d = Math.hypot(c.x - x, c.z - z); if (d < bd) { bd = d; b = c; } } return b; }

  // ---- the soldiers' own feet (ai.js calls this for a base soldier with nothing to shoot at) ----------------------
  think(c, dt) {
    const s = this.byId[c.baseId];
    if (!s) return false;
    const g = this.g, P = g.player, R = BASE_RULES;
    if (c.perch) { c.speed = 0; this.lookAround(c, s.alert === 'calm' ? c.post.face : Math.atan2(s.lastSeen.x - c.x, s.lastSeen.z - c.z), dt, s.alert === 'calm' ? 0.7 : 0.15); return true; }
    if (s.alert === 'warned' && Math.hypot(P.x - c.x, P.z - c.z) < 45) {
      // Watching the trespasser over their sights.
      c.speed = 0; c.aiming = true; c.face = angleLerp(c.face, Math.atan2(P.x - c.x, P.z - c.z), Math.min(1, dt * 6));
      return true;
    }
    if (s.alert === 'hostile' && c.grudge === P && g.time - s.lastSeen.t < 30) {
      // Close on where the trespasser was last seen, inside their leash.
      const home = c.post ?? c.route?.[0] ?? c.home;
      if (Math.hypot(s.lastSeen.x - home.x, s.lastSeen.z - home.z) < R.leash) {
        if (this.goTo(c, s.lastSeen.x, s.lastSeen.z, 4.4, dt, R.hunt)) { c.speed = 0; this.lookAround(c, c.face, dt, 1.2); }
        return true;
      }
    }
    if (c.post) {
      if (this.goTo(c, c.post.x, c.post.z, 2.2, dt)) { c.speed = 0; this.lookAround(c, c.post.face, dt, 0.5); }
      return true;
    }
    if (c.route) {
      const wp = c.route[c.ri];
      if (this.goTo(c, wp.x, wp.z, c.pace ?? 1.4, dt)) { c.ri = (c.ri + 1) % c.route.length; c._bp = null; }
      return true;
    }
    return false;
  }

  lookAround(c, face, dt, amp) { c.face = angleLerp(c.face, face + Math.sin(this.g.time * 0.33 + c.slot * 1.7) * amp, Math.min(1, dt * 2)); }

  // Walk toward (tx, tz) along the walk grid; true once there. The route is planned once per leg (and again when the
  // goal drifts or they stall), so it costs nothing per frame.
  goTo(c, tx, tz, speed, dt, replan = 99) {
    const d = Math.hypot(tx - c.x, tz - c.z);
    if (d < 0.7) { c._bp = null; return true; }
    let p = c._bp;
    const t = this.g.time;
    if (!p || Math.hypot(p.tx - tx, p.tz - tz) > 2.5 || p.stuck > 1.2 || t - p.t > replan) {
      const pts = this.g.nav.foot.find(c.x, c.z, tx, tz);
      c._bp = p = { pts: pts ?? [{ x: tx, z: tz }], i: 0, tx, tz, stuck: 0, t };
    }
    let wp = p.pts[Math.min(p.i, p.pts.length - 1)];
    if (Math.hypot(wp.x - c.x, wp.z - c.z) < 0.6 && p.i < p.pts.length - 1) wp = p.pts[++p.i];
    const x0 = c.x, z0 = c.z;
    this.g.ai.move(c, wp.x - c.x, wp.z - c.z, speed, dt);
    p.stuck = Math.hypot(c.x - x0, c.z - z0) < speed * dt * 0.25 ? p.stuck + dt : 0;
    return false;
  }

  // ==== agent view, map, save ======================================================================================
  view(s) {
    const g = this.g, P = g.player, F = g.society.factions, I = g.interiors, inv = g.inventory;
    const px = P.inVehicle ? P.inVehicle.x : P.x, pz = P.inVehicle ? P.inVehicle.z : P.z;
    const fi = F.index[s.faction];
    return {
      id: s.id, name: s.name, faction: s.faction, x: s.ox, z: s.oz,
      fence: { ...s.fence }, gate: { x: s.ox + s.row.gate.at, z: s.row.gate.side === 'N' ? s.fence.z0 : s.fence.z1, width: s.row.gate.width },
      alert: s.alert, why: s.why, warnedAgo: s.warnedAt > -1e8 ? r1(g.time - s.warnedAt) : null, graceLeft: s.alert === 'warned' ? r1(Math.max(0, BASE_RULES.grace - s.warnT)) : null,
      warnings: s.warnings, alarms: s.alarms,
      player: { inside: this.inside(s, px, pz), seenBy: s.seenBy?.id ?? null, lit: this.lit(s, px, pz), standing: fi === undefined ? null : r1(F.standing[fi]), tier: this.tier(s) },
      guards: s.guards.map((c) => ({ id: c.id, name: c.name, flag: c.flag, post: c.post?.id ?? c.patrol ?? null, role: c.post?.role ?? (c.route ? 'patrol' : null), weapon: c.weapon, alive: c.alive, hp: Math.round(c.hp),
        x: r1(c.x), z: r1(c.z), perched: !!c.perch, hostileToPlayer: c.alive && g.ai.hostile(c, P), fighting: c.target === P })),
      buildings: s.buildings.map((b) => ({ id: b.id, name: b.name, x: r1((b.rec.minX + b.rec.maxX) / 2), z: r1((b.rec.minZ + b.rec.maxZ) / 2), w: r1(b.rec.maxX - b.rec.minX), d: r1(b.rec.maxZ - b.rec.minZ), ways: b.rec.doors.length })),
      doors: s.doors.map((d) => { const door = I?.byId.get(d.id); return { id: d.id, building: d.building, material: d.row.material, name: DOOR_MATERIALS[d.row.material]?.name, locked: door ? door.locked : d.row.locked, kicksLeft: door?.locked ? door.kicks : 0, lockHp: door?.locked ? Math.round(door.lockHp) : 0, x: r1(d.row.x), z: r1(d.row.z) }; }),
      boxes: s.boxes.map((b) => { const box = inv?.boxes.get(b.key); return { id: b.key, label: b.label, table: b.table, x: r1(b.x), z: r1(b.z), searched: !!box?.rolled, items: box?.rolled ? box.slots.map((x) => `${x.id}×${x.n}`) : null }; }),
      vehicles: s.vehicles.map((v) => ({ id: v.id, type: v.type, name: v.name, x: r1(v.x), z: r1(v.z), dead: v.dead, driver: v.driver?.id ?? null, home: Math.hypot(v.x - s.ox, v.z - s.oz) < 45 })),
      lights: { on: s.poolMesh.visible, searchlights: s.towers.map((t) => ({ tower: t.id, x: r1(t.poolX), z: r1(t.poolZ) })), floodlights: s.pools.filter((p) => p.kind === 'flood').length },
    };
  }

  drawOnMinimap(canvas) {
    const gc = canvas.getContext('2d'), k = canvas.width / (WORLD_HALF * 2), T = (v) => (v + WORLD_HALF) * k;
    for (const s of this.sites) {
      const f = s.fence;
      gc.fillStyle = '#3d3b30'; gc.fillRect(T(f.x0), T(f.z0), (f.x1 - f.x0) * k, (f.z1 - f.z0) * k);
      for (const t of s.row.tracks ?? []) { gc.fillStyle = '#4a4236'; gc.fillRect(T(s.ox + t.x0), T(s.oz + t.z0), (t.x1 - t.x0) * k, (t.z1 - t.z0) * k); }
      gc.fillStyle = '#6f6d5a';
      for (const b of s.buildings) gc.fillRect(T(b.rec.minX), T(b.rec.minZ), (b.rec.maxX - b.rec.minX) * k, (b.rec.maxZ - b.rec.minZ) * k);
      gc.strokeStyle = '#9a9a88'; gc.lineWidth = 1.5; gc.setLineDash([3, 2]);
      gc.strokeRect(T(f.x0), T(f.z0), (f.x1 - f.x0) * k, (f.z1 - f.z0) * k);
      gc.setLineDash([]);
    }
  }

  save() {
    const out = {};
    for (const s of this.sites) out[s.id] = { alert: s.alert, why: s.why, warnedAgo: s.warnedAt > -1e8 ? this.g.time - s.warnedAt : null, cleared: s.cleared, warnings: s.warnings, alarms: s.alarms,
      guards: s.guards.map((c) => ({ id: c.id, post: c.post?.id ?? null, patrol: c.patrol ?? null, ri: c.ri ?? 0 })) };
    return out;
  }

  // Restore: the soldiers came back with the characters (by id); re-attach each to its post or patrol.
  load(data) {
    if (!data) return;
    const g = this.g;
    for (const s of this.sites) {
      const d = data[s.id];
      if (!d) continue;
      const byPost = Object.fromEntries(s.guards.filter((c) => c.post).map((c) => [c.post.id, c]));
      const proto = { posts: byPost, patrols: Object.fromEntries(s.guards.filter((c) => c.patrol).map((c) => [c.patrol, c])) };
      const guards = [];
      for (const e of d.guards ?? []) {
        const c = g.chars.find((x) => x.id === e.id);
        if (!c) continue;
        const was = e.post ? proto.posts[e.post] : proto.patrols[e.patrol];
        if (was && was !== c) { c.post = was.post; c.route = was.route; c.pace = was.pace; c.patrol = was.patrol; c.perch = was.perch; c.perchY = was.perchY; }
        c.baseId = s.id; c.ri = e.ri ?? c.ri; c._bp = null;
        c.fid = 'remnant'; g.society.factions.assign(c);
        guards.push(c);
      }
      if (guards.length) s.guards = guards;
      s.warnings = d.warnings ?? 0; s.alarms = d.alarms ?? 0; s.cleared = !!d.cleared;
      s.warnedAt = d.warnedAgo == null ? -1e9 : g.time - d.warnedAgo;
      s.alert = 'calm';
      if (d.alert === 'hostile') this.alarm(s, d.why ?? 'loaded', null, true);
      else if (d.alert === 'warned') { s.alert = 'warned'; s.warnT = 0; }
    }
  }
}

// Federal troops are mostly American; the old army recruited from everywhere.
function soldierFlag(g, rng) { return rng() < 0.62 ? 'US' : g.randomFlag(rng); }

// ---- geometry helpers (vertex-coloured, non-indexed, ready to merge) ----------------------------------------------
function paint(g, color) {
  const c = new THREE.Color(color), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
function box(sx, sy, sz, color) { return paint(new THREE.BoxGeometry(sx, sy, sz).toNonIndexed(), color); }
function cyl(rt, rb, h, color, seg = 10, capped = true) { return paint(new THREE.CylinderGeometry(rt, rb, h, seg, 1, !capped).toNonIndexed(), color); }
function at(g, x, y, z, ry = 0, rx = 0, rz = 0) { if (rx || ry || rz) { _e.set(rx, ry, rz); g.applyQuaternion(_q.setFromEuler(_e)); } return g.translate(x, y, z); }
const _fwd = new THREE.Vector3(0, 0, 1), _bd = new THREE.Vector3(), _bq = new THREE.Quaternion();
function bar(p0, p1, t, color) {
  _bd.set(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
  const g = new THREE.BoxGeometry(t, t, _bd.length()).toNonIndexed();
  g.applyQuaternion(_bq.setFromUnitVectors(_fwd, _bd.normalize()));
  g.translate((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2);
  return paint(g, color);
}
// A wall piece with exact extents along its axis (like world/city.js wallPiece), optional extra thickness.
function wallPiece(out, horizontal, fixed, a0, a1, y0, y1, color, grow = 0) {
  if (a1 - a0 < 0.05) return;
  const t = WALL_T + grow;
  out.push(at(box(horizontal ? a1 - a0 : t, y1 - y0, horizontal ? t : a1 - a0, color), horizontal ? (a0 + a1) / 2 : fixed, (y0 + y1) / 2, horizontal ? fixed : (a0 + a1) / 2));
}
// A flat slab on the ground, tinted in a few patches so concrete and gravel don't read as one flat colour.
function ground(x, z, w, d, color, top, seed) {
  const nx = Math.max(1, Math.round(w / 6)), nz = Math.max(1, Math.round(d / 6)), parts = [];
  const base = new THREE.Color(color);
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const k = 0.93 + 0.14 * frac(Math.sin((i + 1) * 12.9898 + (j + 1) * 78.233 + seed) * 43758.5453);
    _c.copy(base).multiplyScalar(k);
    parts.push(at(box(w / nx + 0.01, 0.04, d / nz + 0.01, `#${_c.getHexString()}`), x - w / 2 + (w / nx) * (i + 0.5), top - 0.02, z - d / 2 + (d / nz) * (j + 0.5)));
  }
  return mergeGeometries(parts);
}
function frac(v) { return v - Math.floor(v); }
function flatRing(x, z, r0, r1, color, y) { return paint(new THREE.RingGeometry(r0, r1, 40).toNonIndexed().rotateX(-Math.PI / 2).translate(x, y, z), color); }
function flatDiscGeo(x, z, r, color, y) { return paint(new THREE.CircleGeometry(r, 20).toNonIndexed().rotateX(-Math.PI / 2).translate(x, y, z), color); }
function flatDisc(x, z, r, color, y) { return flatDiscGeo(x, z, r, color, y); }
// One sandbag: a squashed rounded lump.
function sandbag(color) { return paint(new THREE.SphereGeometry(0.3, 8, 5).toNonIndexed().scale(1.0, 0.45, 0.6), color); }
// A loop of razor wire (concertina), its plane across the fence run, leaning a little each way so the coil reads.
function coil(x, y, z, horiz, k) {
  const g = new THREE.TorusGeometry(0.34, 0.018, 3, 9).toNonIndexed();
  g.rotateY(horiz ? Math.PI / 2 : 0).rotateZ((k % 2 ? 0.35 : -0.35) * (horiz ? 0 : 1)).rotateX((k % 2 ? 0.35 : -0.35) * (horiz ? 1 : 0));
  return paint(g.translate(x, y, z), '#b4b4aa');
}
// A chain-link panel standing on the fence line, UV'd to the atlas's chain-link band (v 0.25..1).
function linkPanel(horiz, x, z, len, y0, y1) {
  const g = new THREE.PlaneGeometry(len, y1 - y0);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.max(1, Math.round(len / 3.2)), 0.25 + uv.getY(i) * 0.75);
  if (!horiz) g.rotateY(Math.PI / 2);
  return g.translate(x, (y0 + y1) / 2, z).toNonIndexed();
}

// The chain-link + sign atlas: the top three quarters are galvanised diamond mesh on transparent (alpha-tested), the
// bottom quarter is the gate sign. Chain-link tiles across a panel (u repeats); the sign never does.
let _atlas = null;
function chainLinkAtlas() {
  if (_atlas) return _atlas;
  const W = 512, H = 512, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.clearRect(0, 0, W, H);
  const band = H * 0.75, step = 24;
  g.strokeStyle = 'rgba(176,178,168,1)'; g.lineWidth = 3;
  g.save(); g.beginPath(); g.rect(0, 0, W, band); g.clip();
  for (let t = -band; t < W + band; t += step) {
    g.beginPath(); g.moveTo(t, 0); g.lineTo(t + band, band); g.stroke();
    g.beginPath(); g.moveTo(t, band); g.lineTo(t + band, 0); g.stroke();
  }
  g.restore();
  g.fillStyle = 'rgba(150,152,144,1)'; g.fillRect(0, 0, W, 6); g.fillRect(0, band - 6, W, 6);
  // The sign: white enamel gone grey, a red band, black lettering.
  const y0 = band + 6;
  g.fillStyle = '#d9d4c4'; g.fillRect(0, y0, W, H - y0);
  g.fillStyle = '#9a2a22'; g.fillRect(0, y0, W, 34);
  g.fillStyle = '#efe9d8'; g.font = 'bold 26px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('WARNING', W / 2, y0 + 18);
  g.fillStyle = '#1e1c1a'; g.font = 'bold 30px Arial, sans-serif';
  g.fillText('FEDERAL INSTALLATION', W / 2, y0 + 56);
  g.font = 'bold 19px Arial, sans-serif';
  g.fillText('NO ENTRY · USE OF DEADLY FORCE AUTHORIZED', W / 2, y0 + 92);
  g.fillStyle = 'rgba(90,60,40,0.35)'; for (let i = 0; i < 40; i++) g.fillRect(Math.random() * W, y0 + Math.random() * (H - y0), 2 + Math.random() * 6, 1 + Math.random() * 3); // rust spots
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.ClampToEdgeWrapping;
  _atlas = tex;
  return tex;
}
