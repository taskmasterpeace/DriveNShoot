import * as THREE from 'three';
import { FACADE, STOREY } from '../data/storeys.js';
import { hashStr } from './citygen/build.js';
import { makeRng } from '../engine/rng.js';
import { YARD } from '../data/ring.js';

// THE FACADE KIT (docs/design/WEB_STOREYS.md §9.2; rows in data/storeys.js FACADE). A storeyed building's outside was a
// plain box with holes; now each upper window bay has a state (a cracked pane left in its top, planks with a firing slit
// at eye height, soot up the wall over a blown one, or a lamp behind it after dark), every floor line a ledge, the top a
// cornice, the roof its water tank, HVAC boxes and a sandbag nest, a shop a hand-painted sign over its door, and a share
// of buildings rebar-and-hole damage, a tin lean-to against a side wall and a laundry line between two windows.
//
// Five instanced meshes for the whole world (kit boxes, glass, lit panes, tanks, signs: 5 draw calls + 2 shadow), shared
// by every source: the island's storeyed buildings (once), each live generated town and each hot ring chunk's risers
// (systems/citygen.js stamp / world/ringrise.js). A source is computed once when it comes (its own rolls: the building's
// id), the buffers are rewritten only when the set changes. Nothing here is a light: a lamp is an emissive pane whose
// opacity follows the night (sky.night), so the night stays dark around it. The building you are in hides its kit above
// your floor with its walls (world/storeys.js setView -> view()).
//   addIsland(storeys)        the island's storeyed buildings (world/storeys.js list)
//   addTown(id, T, built)     a generated town or a ring chunk: its buildings; roof clutter and lean-to posts become
//                             colliders in built.boxes (call before the town's grid is built)
//   remove(id)                that source's kit goes
//   update(dt)                rewrite the buffers when dirty; the lamps follow the night
const CAP = { kit: 26000, glass: 7000, lit: 3500, tank: 900, sign: 900 };
const STRIDE = { kit: 12, glass: 12, lit: 9, tank: 12, sign: 10 };
const _o = new THREE.Object3D(), _c = new THREE.Color(), _m = new THREE.Matrix4();
const colCache = new Map();
const rgb = (hex) => { let c = colCache.get(hex); if (!c) { _c.set(hex); c = [_c.r, _c.g, _c.b]; colCache.set(hex, c); } return c; };
const shadeHex = (hex, k) => { _c.set(hex).multiplyScalar(k); return `#${_c.getHexString()}`; };
const HOMES = new Set(['apartment', 'rowhouse', 'house', 'hotel', 'adobe', 'motel', 'boarding']);
const SHOPS = new Set(['shop', 'office', 'hotel', 'saloon', 'diner', 'motel', 'auto_shop']);

// The sign atlas: 16 hand-painted boards (4 x 4), painted once.
function signAtlas() {
  const W = 256, H = 128, c = document.createElement('canvas');
  c.width = W * 4; c.height = H * 4;
  const g = c.getContext('2d'), rng = makeRng(0x5161);
  const boards = ['#d8cbb0', '#a8452e', '#3f6e6a', '#c9963a', '#2e2a26', '#e2d6bc', '#6a7a4a', '#8a3a28'];
  const inks = { '#d8cbb0': '#3a1e14', '#a8452e': '#f0e2c4', '#3f6e6a': '#f2e8d0', '#c9963a': '#2a1a10', '#2e2a26': '#e8c870', '#e2d6bc': '#8a2a1a', '#6a7a4a': '#f4ecd6', '#8a3a28': '#f0d8a0' };
  for (let i = 0; i < 16; i++) {
    const x = (i % 4) * W, y = Math.floor(i / 4) * H, word = FACADE.signs[i % FACADE.signs.length], bd = boards[i % boards.length];
    g.fillStyle = bd; g.fillRect(x, y, W, H);
    // weathered planks and grime
    g.globalAlpha = 0.18; g.fillStyle = '#000';
    for (let p = 1; p < 4; p++) g.fillRect(x, y + (p * H) / 4 - 1, W, 2);
    for (let k = 0; k < 60; k++) { g.globalAlpha = 0.05 + rng() * 0.12; g.fillRect(x + rng() * W, y + rng() * H, 2 + rng() * 14, 1 + rng() * 5); }
    g.globalAlpha = 1;
    g.strokeStyle = inks[bd]; g.lineWidth = 5; g.strokeRect(x + 8, y + 8, W - 16, H - 16);
    // the word, brushed: a little tilt, a heavy face, drips
    g.save(); g.translate(x + W / 2, y + H / 2 + 4); g.rotate((rng() - 0.5) * 0.08);
    g.fillStyle = inks[bd]; g.font = `bold ${word.length > 5 ? 52 : 64}px Impact, "Arial Black", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(word, 0, 0);
    for (let k = 0; k < 5; k++) { const dx = (rng() - 0.5) * W * 0.6; g.fillRect(dx, 20, 3, 6 + rng() * 18); }
    g.restore();
    // sun bleach
    const gr = g.createLinearGradient(x, y, x, y + H); gr.addColorStop(0, 'rgba(255,240,210,0.16)'); gr.addColorStop(1, 'rgba(0,0,0,0.18)');
    g.fillStyle = gr; g.fillRect(x, y, W, H);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

export class Facades {
  constructor(g) {
    this.g = g;
    this.enabled = true;
    this.sources = new Map(); // id -> { parts: { kit: [], ... }, lv: { kit: [] ... }, bi: {...}, blds: [{ key, ranges }] }
    this.byKey = new Map();   // a storeys record (S) -> its building entry
    this.dirty = false;
    this.viewKey = null; this.viewL = -1;
    const box = new THREE.BoxGeometry(1, 1, 1);
    const mk = (name, geo, mat, cap, shadow) => {
      const m = new THREE.InstancedMesh(geo, mat, cap);
      m.name = `facade-${name}`; m.count = 0; m.visible = false; m.frustumCulled = false; m.castShadow = shadow; m.receiveShadow = true;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      g.scene.add(m);
      return m;
    };
    this.M = {
      kit: mk('kit', box, new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0.03 }), CAP.kit, true),
      glass: mk('glass', box, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.18, metalness: 0.55 }), CAP.glass, false),
      lit: mk('lit', box, new THREE.MeshBasicMaterial({ color: FACADE.colors.lit, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }), CAP.lit, false), // not tone-mapped: a lamp's amber stays amber, never bleached white
      tank: mk('tank', new THREE.CylinderGeometry(0.5, 0.5, 1, 12), new THREE.MeshStandardMaterial({ roughness: 0.75, metalness: 0.2 }), CAP.tank, true),
      sign: null,
    };
    for (const k of ['kit', 'glass', 'tank']) { const M = this.M[k]; M.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CAP[k] * 3).fill(1), 3); }
    // the signs: one plane per board, its slot in the atlas per instance (aSign)
    let sg = null;
    try { sg = signAtlas(); } catch { sg = null; } // a page without a canvas (a headless test): signs stay blank
    const sgeo = new THREE.PlaneGeometry(1, 1);
    this.aSign = new THREE.InstancedBufferAttribute(new Float32Array(CAP.sign), 1);
    this.aSign.setUsage(THREE.DynamicDrawUsage);
    sgeo.setAttribute('aSign', this.aSign);
    const smat = new THREE.MeshStandardMaterial({ map: sg, roughness: 0.95 });
    smat.onBeforeCompile = (sh) => {
      sh.vertexShader = 'attribute float aSign;\n' + sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv = vec2((uv.x + mod(aSign, 4.0)) * 0.25, (uv.y + 3.0 - floor(aSign / 4.0)) * 0.25);\n#endif');
    };
    smat.customProgramCacheKey = () => 'facadeSign1';
    this.M.sign = mk('sign', sgeo, smat, CAP.sign, false);
    // the base matrices (a building's kit above your floor is scaled to nothing while you are inside it)
    this.base = {}; for (const k of Object.keys(CAP)) this.base[k] = new Float32Array(CAP[k] * 16);
    this.lvOf = {}; for (const k of Object.keys(CAP)) this.lvOf[k] = new Uint8Array(CAP[k]);
    this.counts = { sources: 0, buildings: 0, windows: 0, glass: 0, boarded: 0, blown: 0, lit: 0, ledges: 0, tanks: 0, hvac: 0, nests: 0, damage: 0, rebar: 0, lean: 0, laundry: 0, signs: 0, yards: 0, colliders: 0, over: 0 };
  }

  // ---- sources ------------------------------------------------------------------------------------------------------
  addIsland(storeys) {
    const bl = [];
    for (const S of storeys.list) {
      const b = S.b, n = S.n + 1;
      bl.push({ key: S, id: `isl:${Math.round(b.minX)}:${Math.round(b.minZ)}`, x0: b.minX, z0: b.minZ, x1: b.maxX, z1: b.maxZ, Y: S.Y, n, top: S.top, roofY: S.top + 0.4, roofWalk: false,
        wins: S.wins ?? [], color: S.color, kind: b.shopName ? 'shop' : b.district === 'town' ? 'house' : 'office', ruined: false, front: null, doors: [], area: S.area, nest: false });
    }
    this.add('island', bl, null);
  }
  addTown(id, T, built) {
    const bl = [];
    for (const R of built.blds) {
      const B = R.B, o = 0.2;
      if (B.n < 2 && !B.ringRow) continue; // one storey: the town's own look (signs only on the Strip's risers)
      const walk = !!(R.S && R.S.n === B.n);
      bl.push({ key: R.S ?? R, id: B.id, x0: B.x0 - o, z0: B.z0 - o, x1: B.x1 + o, z1: B.z1 + o, Y: B.Y, n: B.n, top: B.top, roofY: walk ? B.top : B.top + 0.3, roofWalk: walk,
        wins: built.upWins?.filter((w) => w.b === B.id) ?? [], color: B.color, kind: B.kind, ruined: B.ruined, front: B.front, doors: built.doors.filter((d) => d.b === B.id && d.kind === 'door'),
        area: R.S?.area ?? null, escapeSide: B.escape?.side ?? null, lot: B.ringRow?.area ?? null, B, bridged: built.bridges?.filter((q) => q.br.from === B || q.br.to === B).map((q) => q.br) ?? [] });
    }
    const src = this.add(id, bl, built);
    // the roof bridges: their rails drawn (rope on posts; the colliders are the builder's), so a plank run reads as a
    // bridge from above and not as a stair down a wall
    for (const q of built.bridges ?? []) this.bridgeKit(src, q.br);
  }
  bridgeKit(src, br) {
    const put = (x, y, z, sx, sy, sz, hex) => { const c = rgb(hex); const P = src.parts.kit; P.push(x, y, z, sx, sy, sz, 0, 0, 0, c[0], c[1], c[2]); src.lv.kit.push(0); src.bi.kit.push(-1); };
    const ax = br.axis === 'x', y0 = br.yFrom, y1 = br.yTo, len = ax ? br.x1 - br.x0 : br.z1 - br.z0, n = Math.max(2, Math.round(len / 1.6));
    for (const side of [0, 1]) {
      const c = ax ? (side ? br.z1 : br.z0) : (side ? br.x1 : br.x0);
      for (let i = 0; i <= n; i++) { // posts
        const t = i / n, a = (ax ? br.x0 : br.z0) + t * len, y = y0 + (y1 - y0) * t;
        put(ax ? a : c, y + 0.5, ax ? c : a, 0.08, 1.0, 0.08, '#4a3a2a');
      }
      const ym = (y0 + y1) / 2 + 0.95, am = ax ? (br.x0 + br.x1) / 2 : (br.z0 + br.z1) / 2;
      put(ax ? am : c, ym, ax ? c : am, ax ? len : 0.05, 0.05, ax ? 0.05 : len, '#3a2e22'); // the rope
    }
    this.counts.bridges = (this.counts.bridges ?? 0) + 1;
    this.dirty = true;
  }
  remove(id) { if (this.sources.delete(id)) { this.dirty = true; this.counts.sources = this.sources.size; } }

  add(id, blds, built) {
    const src = { parts: { kit: [], glass: [], lit: [], tank: [], sign: [] }, lv: { kit: [], glass: [], lit: [], tank: [], sign: [] }, bi: { kit: [], glass: [], lit: [], tank: [], sign: [] }, blds };
    blds.forEach((D, i) => this.dress(src, D, i, built));
    this.sources.set(id, src);
    this.counts.sources = this.sources.size;
    this.dirty = true;
    return src;
  }

  // ---- one building -------------------------------------------------------------------------------------------------
  dress(src, D, bi, built) {
    const F = FACADE, C = F.colors, rng = makeRng(hashStr(D.id) ^ 0xfaca);
    const put = (mesh, lv, ...v) => { const P = src.parts[mesh]; for (let i = 0; i < v.length; i++) P.push(v[i]); src.lv[mesh].push(lv); src.bi[mesh].push(bi); };
    const kit = (lv, x, y, z, sx, sy, sz, hex, rx = 0, ry = 0, rz = 0) => { const c = rgb(hex); put('kit', lv, x, y, z, sx, sy, sz, rx, ry, rz, c[0], c[1], c[2]); };
    const solid = (minX, minZ, maxX, maxZ, base, height, tag = 'fk-hvac') => { if (!built) return; built.boxes.push({ minX, minZ, maxX, maxZ, tag, height, mark: 0, op: null, holes: null, holeX: false, sill: 0, base, owner: null }); this.counts.colliders++; };
    const cx = (D.x0 + D.x1) / 2, cz = (D.z0 + D.z1) / 2, W = D.x1 - D.x0, Dd = D.z1 - D.z0, n = D.n, col = D.color;
    this.counts.buildings++;
    // the four outer faces: [horizontal (runs along x), fixed, a0, a1, nx, nz]
    const faces = [[true, D.z0, D.x0, D.x1, 0, -1], [true, D.z1, D.x0, D.x1, 0, 1], [false, D.x0, D.z0, D.z1, -1, 0], [false, D.x1, D.z0, D.z1, 1, 0]];
    // ---- ledges at every floor line, the cornice at the top
    const ledgeCol = shadeHex(col, F.colors.ledge), corCol = shadeHex(col, F.colors.cornice);
    const band = (y, h, proud, hex, lv) => {
      for (const [hz, fx, a0, a1, nx, nz] of faces) {
        const len = a1 - a0 + proud * 2;
        if (hz) kit(lv, (a0 + a1) / 2, y, fx + nz * proud / 2, len, h, proud, hex); else kit(lv, fx + nx * proud / 2, y, (a0 + a1) / 2, proud, h, len, hex);
      }
    };
    if (!D.ruined) {
      for (let k = 1; k < n; k++) { band(D.Y[k] - 0.06, F.ledge.h, F.ledge.proud, ledgeCol, k); this.counts.ledges++; }
      band((D.roofWalk ? D.top : D.roofY) + (D.roofWalk ? 1.1 : 0) - F.cornice.h / 2 + 0.02, F.cornice.h, F.cornice.proud, corCol, n);
    }
    // ---- the window bays above the street
    const homes = HOMES.has(D.kind);
    const byFloorFace = new Map();
    for (const w of D.wins) {
      this.counts.windows++;
      const along = w.nz !== 0, T2 = 0.24, face = along ? w.z + w.nz * T2 : w.x + w.nx * T2; // the wall's outer face
      const px = (o) => (along ? w.x : face + w.nx * o), pz = (o) => (along ? face + w.nz * o : w.z);
      const r = rng(), lv = w.k, mid = w.y + w.h / 2;
      const sx = (a) => (along ? a : 0.05), sz = (a) => (along ? 0.05 : a);
      if (r < F.window.glass) {
        // a cracked pane left in the top of the bay (the rest fell out: sight and rounds pass under it)
        const ph = w.h * (0.28 + rng() * 0.26);
        put('glass', lv, along ? w.x : w.x, w.y + w.h - ph / 2, along ? w.z : w.z, along ? w.w * 0.96 : 0.04, ph, along ? 0.04 : w.w * 0.96, 0, 0, along ? (rng() - 0.5) * 0.06 : 0, ...rgb(C.glass));
        this.counts.glass++;
        if (rng() < F.window.lit) { put('lit', lv, w.x, mid, w.z, along ? w.w * 0.9 : 0.03, w.h * 0.9, along ? 0.03 : w.w * 0.9, 0, 0, 0); this.counts.lit++; }
      } else if (r < F.window.glass + F.window.boarded) {
        // planks nailed across outside, a slit at eye height (sill + 0.18 .. sill + 0.55)
        const bw = w.w + 0.24, boards = C.board;
        for (const [y0, y1] of [[0, 0.18], [0.55, 0.78], [w.h - 0.42, w.h]]) {
          const hh = y1 - y0, tilt = (rng() - 0.5) * 0.12;
          kit(lv, px(0.04), w.y + y0 + hh / 2, pz(0.04), sx(bw), hh, sz(bw), boards[Math.floor(rng() * boards.length)], along ? 0 : tilt, 0, along ? tilt : 0);
        }
        this.counts.boarded++;
      } else if (r < F.window.glass + F.window.boarded + F.window.blown) {
        // blown out: soot licking up the wall over it
        kit(lv, px(0.015), w.y + w.h + 0.45, pz(0.015), sx(w.w * 1.15), 0.9, sz(w.w * 1.15), C.soot);
        kit(lv, px(0.012), w.y + w.h + 1.05, pz(0.012), sx(w.w * 0.7), 0.5, sz(w.w * 0.7), shadeHex(C.soot, 1.6));
        this.counts.blown++;
      } else if (rng() < F.window.lit * 1.4) { put('lit', lv, w.x, mid, w.z, along ? w.w * 0.9 : 0.03, w.h * 0.9, along ? 0.03 : w.w * 0.9, 0, 0, 0); this.counts.lit++; }
      if (homes) { const key = `${w.k}:${w.nx}:${w.nz}`; let L = byFloorFace.get(key); if (!L) byFloorFace.set(key, (L = [])); L.push(w); }
    }
    // ---- laundry: a line between two windows of a home's floor, clothes hung on it
    if (homes && rng() < F.laundry) {
      const lists = [...byFloorFace.values()].filter((L) => L.length >= 2);
      if (lists.length) {
        const L = lists[Math.floor(rng() * lists.length)].sort((a, b) => (a.nz !== 0 ? a.x - b.x : a.z - b.z)), i = Math.floor(rng() * (L.length - 1)), a = L[i], b = L[i + 1];
        const along = a.nz !== 0, d = along ? b.x - a.x : b.z - a.z;
        if (d > 1.5 && d < 6.5) {
          const y = a.y + a.h + 0.1, off = 0.45, fx = along ? a.z + a.nz * (0.24 + off) : a.x + a.nx * (0.24 + off), m = along ? (a.x + b.x) / 2 : (a.z + b.z) / 2;
          kit(a.k, along ? m : fx, y, along ? fx : m, along ? d : 0.03, 0.03, along ? 0.03 : d, '#2a2622');
          for (let s = 0, p = (along ? a.x : a.z) + 0.4; p < (along ? b.x : b.z) - 0.4 && s < 5; s++) {
            const cw = 0.35 + rng() * 0.35, ch = 0.45 + rng() * 0.4, c2 = C.cloth[Math.floor(rng() * C.cloth.length)];
            kit(a.k, along ? p + cw / 2 : fx, y - ch / 2 - 0.02, along ? fx : p + cw / 2, along ? cw : 0.02, ch, along ? 0.02 : cw, c2);
            p += cw + 0.12 + rng() * 0.3;
          }
          this.counts.laundry++;
        }
      }
    }
    // ---- damage: rebar-and-hole patches by the corners (clear of the bays)
    if (D.ruined || rng() < F.damage) {
      const k = 1 + Math.floor(rng() * (D.ruined ? 3 : 2));
      for (let i = 0; i < k; i++) {
        const [hz, fx, a0, a1, nx, nz] = faces[Math.floor(rng() * 4)], fl = 1 + Math.floor(rng() * Math.max(1, n - 1));
        if (fl >= n) continue;
        const atA = rng() < 0.5 ? a0 + 1.0 : a1 - 1.0, y = D.Y[fl] + 0.6 + rng() * 1.4, pw = 0.8 + rng() * 0.6, ph = 0.6 + rng() * 0.6;
        const x = hz ? atA : fx + nx * 0.02, z = hz ? fx + nz * 0.02 : atA;
        kit(fl, x, y, z, hz ? pw : 0.06, ph, hz ? 0.06 : pw, '#14110e');
        kit(fl, x, y + ph / 2 + 0.05, z, hz ? pw * 1.2 : 0.05, 0.12, hz ? 0.05 : pw * 1.2, shadeHex(col, 0.7)); // the broken lip
        for (let j = 0; j < 4; j++) { // rebar bent out of the hole
          const ox = (rng() - 0.5) * pw * 0.8, oy = (rng() - 0.5) * ph * 0.7, len = 0.5 + rng() * 0.6;
          kit(fl, hz ? x + ox : x + nx * len / 2, y + oy, hz ? z + nz * len / 2 : z + ox, hz ? 0.04 : len, 0.04, hz ? len : 0.04, C.rebar, (rng() - 0.5) * 0.9, 0, (rng() - 0.5) * 0.9);
          this.counts.rebar++;
        }
        this.counts.damage++;
      }
    }
    // ---- the roof: HVAC boxes, a water tank on a tall one, a sandbag nest on a roof you can stand on
    if (!D.ruined) {
      const ry = D.roofY, A = D.area, busy = (x, z, r) => (A && x > A.minX - r && x < A.maxX + r && z > A.minZ - r && z < A.maxZ + r);
      const spot = (r) => { for (let i = 0; i < 10; i++) { const x = D.x0 + 1.4 + r + rng() * (W - 2.8 - 2 * r), z = D.z0 + 1.4 + r + rng() * (Dd - 2.8 - 2 * r); if (!busy(x, z, r + 0.8)) return [x, z]; } return null; };
      const hv = F.roof.hvac[0] + Math.floor(rng() * (F.roof.hvac[1] - F.roof.hvac[0] + 1));
      for (let i = 0; i < hv && W > 6 && Dd > 6; i++) {
        const p = spot(1.0); if (!p) continue;
        const hx = 1.2 + rng() * 0.8, hzz = 0.9 + rng() * 0.6, hh = 0.9 + rng() * 0.5, hc = C.hvac[Math.floor(rng() * C.hvac.length)];
        kit(n, p[0], ry + hh / 2, p[1], hx, hh, hzz, hc);
        kit(n, p[0], ry + hh + 0.03, p[1], hx * 0.55, 0.06, hzz * 0.7, '#2e2c2a');
        if (D.roofWalk) solid(p[0] - hx / 2, p[1] - hzz / 2, p[0] + hx / 2, p[1] + hzz / 2, ry, ry + hh);
        this.counts.hvac++;
      }
      if (n >= F.roof.tankMin && W > 8 && Dd > 8) {
        const p = spot(1.6);
        if (p) {
          const tr = 1.0 + rng() * 0.3, th = 1.8 + rng() * 0.6, leg = 1.3, tc = C.tank[Math.floor(rng() * C.tank.length)];
          put('tank', n, p[0], ry + leg + th / 2, p[1], tr * 2, th, tr * 2, 0, 0, 0, ...rgb(tc));
          put('tank', n, p[0], ry + leg + th + 0.25, p[1], tr * 2.05, 0.5, tr * 2.05, 0, 0, 0, ...rgb(shadeHex(tc, 0.7))); // its cone-ish lid
          for (const [sx2, sz2] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) kit(n, p[0] + sx2 * tr * 0.7, ry + leg / 2, p[1] + sz2 * tr * 0.7, 0.14, leg, 0.14, '#3a3430');
          if (D.roofWalk) solid(p[0] - tr, p[1] - tr, p[0] + tr, p[1] + tr, ry, ry + leg + th, 'fk-tank');
          this.counts.tanks++;
        }
      }
      if (D.roofWalk && (rng() < F.roof.nest || n >= 4)) {
        // a sandbag horseshoe behind the street-side parapet, open to the roof: cover for whoever holds it
        const f = D.front ?? 'N', ins = 1.6, t = 0.3 + rng() * 0.4;
        let x = f === 'W' ? D.x0 + 0.2 + ins : f === 'E' ? D.x1 - 0.2 - ins : D.x0 + 2 + t * (W - 4);
        let z = f === 'N' ? D.z0 + 0.2 + ins : f === 'S' ? D.z1 - 0.2 - ins : D.z0 + 2 + t * (Dd - 4);
        if (busy(x, z, 1.4)) { x = f === 'N' || f === 'S' ? cx : x; z = f === 'W' || f === 'E' ? cz : z; }
        if (!busy(x, z, 1.4)) {
          const ux = f === 'W' ? -1 : f === 'E' ? 1 : 0, uz = f === 'N' ? -1 : f === 'S' ? 1 : 0, vx = -uz, vz = ux, rr = 1.15; // u: toward the street, v: along it
          for (let i = 0; i < 7; i++) { // a half ring of bags, two high, open to the roof behind
            const a = -Math.PI / 2 + (i / 6) * Math.PI, ca = Math.cos(a), sa = Math.sin(a);
            const bx = x + rr * (ca * ux + sa * vx), bz = z + rr * (ca * uz + sa * vz), ry2 = Math.atan2(-sa * ux + ca * vx, -sa * uz + ca * vz);
            const sc = C.sand[Math.floor(rng() * C.sand.length)];
            for (let lay = 0; lay < 2; lay++) kit(n, bx, ry + 0.16 + lay * 0.3, bz, 0.66, 0.3, 0.4, sc, 0, ry2 + (lay ? 0.35 : 0), 0);
          }
          // its colliders: the front run and the two arms (the rifleman stands in the open middle)
          const seg = (ax, az, bx2, bz2) => solid(Math.min(ax, bx2) - 0.2, Math.min(az, bz2) - 0.2, Math.max(ax, bx2) + 0.2, Math.max(az, bz2) + 0.2, ry, ry + 0.75, 'sandbags');
          seg(x + ux * rr - vx * 0.8, z + uz * rr - vz * 0.8, x + ux * rr + vx * 0.8, z + uz * rr + vz * 0.8);
          seg(x + vx * rr, z + vz * rr, x + vx * rr + ux * 0.8, z + vz * rr + uz * 0.8);
          seg(x - vx * rr, z - vz * rr, x - vx * rr + ux * 0.8, z - vz * rr + uz * 0.8);
          if (D.B) D.B.nest = { x, z };
          this.counts.nests++;
        }
      }
      // a hotel's rooftop sign, standing on the street edge
      if (D.kind === 'hotel' && D.front) {
        const f = D.front, nx = f === 'W' ? -1 : f === 'E' ? 1 : 0, nz = f === 'N' ? -1 : f === 'S' ? 1 : 0, sw = Math.min(8, (nz ? W : Dd) * 0.5), sh = 1.8;
        const x = nx ? (nx < 0 ? D.x0 + 0.5 : D.x1 - 0.5) : cx, z = nz ? (nz < 0 ? D.z0 + 0.5 : D.z1 - 0.5) : cz, y = ry + 1.3 + sh / 2;
        put('sign', n, x + nx * 0.06, y, z + nz * 0.06, sw, sh, 1, 0, Math.atan2(nx, nz), 0, 6);
        for (const s of [-1, 1]) kit(n, x + (nz ? s * sw * 0.4 : 0), ry + (1.3 + sh) / 2, z + (nx ? s * sw * 0.4 : 0), 0.15, 1.3 + sh, 0.15, '#3a3430');
        kit(n, x - nx * 0.05, y, z - nz * 0.05, nz ? sw + 0.2 : 0.08, sh + 0.2, nz ? 0.08 : sw + 0.2, '#6a5440'); // its weathered board back (from behind it reads as wood, not a hole)
        this.counts.signs++;
      }
    }
    // ---- a hand-painted sign over a shop's street door
    if (SHOPS.has(D.kind) && D.doors?.length) {
      const d = D.doors.find((q) => q.side === D.front) ?? D.doors[0];
      const nx = d.side === 'W' ? -1 : d.side === 'E' ? 1 : 0, nz = d.side === 'N' ? -1 : d.side === 'S' ? 1 : 0, y = Math.max(2.95, Math.min((D.Y[1] ?? 4) - 0.75, 3.6));
      const words = D.kind === 'hotel' ? [6, 7] : D.kind === 'office' ? [8, 10] : [0, 1, 2, 3, 4, 5, 9, 11];
      const idx = words[Math.floor(rng() * words.length)];
      put('sign', 0, d.x + nx * 0.27, y, d.z + nz * 0.27, Math.max(2.4, Math.min(4, (d.w ?? 1.6) + 1.6)), 0.9, 1, 0, Math.atan2(nx, nz), (rng() - 0.5) * 0.05, idx);
      this.counts.signs++;
    }
    // ---- a tin lean-to against a side wall (a ring riser with the side yard for it, not where its escape or a bridge is)
    if (D.lot && rng() < F.lean) {
      const fi = 'NESW'.indexOf(D.front), sides = ['NESW'[(fi + 1) % 4], 'NESW'[(fi + 3) % 4]];
      for (const s of sides) {
        if (s === D.escapeSide) continue;
        const l = D.lot, room = s === 'W' ? D.x0 - l.x0 : s === 'E' ? l.x1 - D.x1 : s === 'N' ? D.z0 - l.z0 : l.z1 - D.z1;
        if (room < 2.8) continue;
        const dep = 2.2, len = Math.min(4.5, (s === 'N' || s === 'S' ? W : Dd) * 0.45), nx = s === 'W' ? -1 : s === 'E' ? 1 : 0, nz = s === 'N' ? -1 : s === 'S' ? 1 : 0;
        const ax = s === 'N' || s === 'S' ? cx : s === 'W' ? D.x0 - dep / 2 : D.x1 + dep / 2, az = s === 'W' || s === 'E' ? cz : s === 'N' ? D.z0 - dep / 2 : D.z1 + dep / 2;
        const tin = C.tin[Math.floor(rng() * C.tin.length)], slope = Math.atan2(0.6, dep);
        // the sheet, pitched down away from the wall (2.6 m at the wall, 2.0 at its edge)
        kit(0, ax, 2.3, az, nz ? len : dep + 0.2, 0.05, nz ? dep + 0.2 : len, tin, nz ? -nz * slope : 0, 0, nx ? nx * slope : 0);
        for (const t of [-1, 1]) {
          const px = nz ? ax + t * (len / 2 - 0.2) : ax + nx * (dep / 2 - 0.15), pz = nz ? az + nz * (dep / 2 - 0.15) : az + t * (len / 2 - 0.2);
          kit(0, px, 1.0, pz, 0.1, 2.0, 0.1, '#4a4642');
          solid(px - 0.1, pz - 0.1, px + 0.1, pz + 0.1, 0, 2.0, 'post');
        }
        kit(0, ax, 0.4, az, nz ? len * 0.4 : 0.6, 0.8, nz ? 0.6 : len * 0.4, '#6a5038'); // junk under it
        this.counts.lean++;
        break;
      }
    }
    // ---- a ring riser's back yard: block walls down both sides from its back corners and across the lot's back (the
    // ring's own yard wall, data/ring.js YARD.wall); the side with a fire escape stays open, the front always does
    if (D.lot && D.front) {
      const l = D.lot, m = 0.4, h = YARD.wall.h, t = YARD.wall.t, wc = YARD.wall.colors[Math.floor(rng() * YARD.wall.colors.length)];
      const wall = (x0, z0, x1, z1) => { if (Math.max(x1 - x0, z1 - z0) < 1) return; kit(0, (x0 + x1) / 2, h / 2, (z0 + z1) / 2, Math.max(t, x1 - x0), h, Math.max(t, z1 - z0), wc); kit(0, (x0 + x1) / 2, h + 0.04, (z0 + z1) / 2, Math.max(t, x1 - x0) + 0.06, 0.08, Math.max(t, z1 - z0) + 0.06, '#d8cfbc'); solid(x0 - t / 2, z0 - t / 2, x1 + t / 2, z1 + t / 2, 0, h, 'fk-wall'); };
      const f = D.front, side = { N: ['W', 'E'], S: ['W', 'E'], W: ['N', 'S'], E: ['N', 'S'] }[f];
      if (f === 'N' || f === 'S') {
        const zb = f === 'N' ? l.z1 - m : l.z0 + m, zf = f === 'N' ? D.z1 : D.z0;
        wall(l.x0 + m, zb, l.x1 - m, zb);
        if (side[0] !== D.escapeSide) wall(l.x0 + m, Math.min(zb, zf), l.x0 + m, Math.max(zb, zf));
        if (side[1] !== D.escapeSide) wall(l.x1 - m, Math.min(zb, zf), l.x1 - m, Math.max(zb, zf));
      } else {
        const xb = f === 'W' ? l.x1 - m : l.x0 + m, xf = f === 'W' ? D.x1 : D.x0;
        wall(xb, l.z0 + m, xb, l.z1 - m);
        if (side[0] !== D.escapeSide) wall(Math.min(xb, xf), l.z0 + m, Math.max(xb, xf), l.z0 + m);
        if (side[1] !== D.escapeSide) wall(Math.min(xb, xf), l.z1 - m, Math.max(xb, xf), l.z1 - m);
      }
      this.counts.yards++;
    }
  }

  // ---- the buffers --------------------------------------------------------------------------------------------------
  rebuild() {
    this.dirty = false;
    this.viewKey = null; this.viewL = -1;
    this.byKey.clear();
    const at = { kit: 0, glass: 0, lit: 0, tank: 0, sign: 0 };
    let over = 0;
    for (const src of this.sources.values()) {
      for (const D of src.blds) { D.ranges = { kit: [0, 0], glass: [0, 0], lit: [0, 0], tank: [0, 0], sign: [0, 0] }; if (D.key) this.byKey.set(D.key, D); }
      for (const mk of Object.keys(at)) {
        const P = src.parts[mk], st = STRIDE[mk], M = this.M[mk], LV = src.lv[mk], BI = src.bi[mk], base = this.base[mk], lvOf = this.lvOf[mk];
        for (let j = 0, q = 0; q < P.length; j++, q += st) {
          const i = at[mk];
          if (i >= CAP[mk]) { over++; break; }
          _o.position.set(P[q], P[q + 1], P[q + 2]); _o.rotation.set(P[q + 6], P[q + 7], P[q + 8]); _o.scale.set(P[q + 3], P[q + 4], P[q + 5]); _o.updateMatrix();
          _o.matrix.toArray(base, i * 16);
          M.setMatrixAt(i, _o.matrix);
          if (st === 12) { _c.setRGB(P[q + 9], P[q + 10], P[q + 11]); M.setColorAt(i, _c); }
          if (mk === 'sign') this.aSign.array[i] = P[q + 9];
          lvOf[i] = LV[j];
          const D = src.blds[BI[j]]; if (D) { const r = D.ranges[mk]; if (r[1] === r[0]) r[0] = i; r[1] = i + 1; }
          at[mk] = i + 1;
        }
      }
    }
    for (const mk of Object.keys(at)) {
      const M = this.M[mk];
      M.count = at[mk]; M.visible = this.enabled && at[mk] > 0 && (mk !== 'lit' || this.litOn);
      M.instanceMatrix.needsUpdate = true;
      if (M.instanceColor) M.instanceColor.needsUpdate = true;
    }
    this.aSign.needsUpdate = true;
    this.counts.over = over;
  }

  // The building you are inside (world/storeys.js setView): its kit above floor L is not drawn.
  view(key, L) {
    if (key === this.viewKey && L === this.viewL) return;
    const show = (D, lv) => {
      if (!D?.ranges) return;
      for (const mk of Object.keys(D.ranges)) {
        const [a, b] = D.ranges[mk], M = this.M[mk], base = this.base[mk], lvOf = this.lvOf[mk];
        if (b <= a) continue;
        for (let i = a; i < b; i++) {
          if (lvOf[i] <= lv) { _m.fromArray(base, i * 16); M.setMatrixAt(i, _m); } else { _m.makeScale(0, 0, 0); M.setMatrixAt(i, _m); }
        }
        M.instanceMatrix.needsUpdate = true;
      }
    };
    if (this.viewKey && this.viewKey !== key) show(this.byKey.get(this.viewKey), 99);
    if (key) show(this.byKey.get(key), L);
    this.viewKey = key; this.viewL = L;
  }

  update() {
    if (this.dirty) this.rebuild();
    // the lamps after dark (an emissive pane; never a light): fade in with the night
    const night = this.g.sky?.night ?? 0, on = this.enabled && night > 0.15;
    const M = this.M.lit;
    if (on !== this.litOn) { this.litOn = on; M.visible = on && M.count > 0; }
    if (on) M.material.opacity = Math.min(0.92, (night - 0.15) * 1.6);
  }
  setEnabled(v) { this.enabled = !!v; for (const mk of Object.keys(this.M)) this.M[mk].visible = this.enabled && this.M[mk].count > 0 && (mk !== 'lit' || this.litOn); }
  status() {
    const used = {}; for (const mk of Object.keys(this.M)) used[mk] = this.M[mk].count;
    return { enabled: this.enabled, sources: [...this.sources.keys()], used, cap: CAP, lampsOn: !!this.litOn, counts: this.counts, drawCalls: Object.values(this.M).filter((m) => m.visible).length };
  }
}
export { STOREY };
