// LSW-FACETED ingest (docs/design/WEB_LSW_BODIES.md): Living Superweapon's faceted modular-hero kit -> one packed binary
// the near-body renderer instances. Reads the LSW checkout READ-ONLY (default C:/lswwt/gunkit1, branch
// alpine/facetnpc1-kc21df3d3) and writes public/models/lsw-faceted/:
//   kit.bin   every module of modular-hero.glb merged: position, normal, uv, bone, weight, module id, three morph deltas
//             (muscleSmall, muscleLarge, waistNarrow), index
//   kit.json  layout, the module table (name, slot, hair variant, material), the ual-deform-v1 joints (bind, metres), sha256s
//   faces/    the six baked civilian faces (drawn by LSW's face-kit code, embedded in its body.faceted-civilian-* GLBs)
// Usage: node tools/lsw-faceted-ingest.mjs [lswRoot]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = process.argv[2] ?? process.env.LSW_FACETED_SRC ?? 'C:/lswwt/gunkit1';
const OUT = path.join(here, '..', 'public', 'models', 'lsw-faceted');
const KIT = path.join(SRC, 'public/models/modular-hero/modular-hero.glb');
const FACES = ['worker', 'cop-off-duty', 'nurse', 'kid', 'elder', 'gang-member'];
const MORPHS = ['muscleSmall', 'muscleLarge', 'waistNarrow'];
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

function readGlb(file) {
  const b = fs.readFileSync(file), n = b.readUInt32LE(12), j = JSON.parse(b.subarray(20, 20 + n).toString());
  const bin = b.subarray(20 + n + 8);
  const acc = (i) => {
    const a = j.accessors[i];
    const T = { 5126: Float32Array, 5123: Uint16Array, 5121: Uint8Array, 5125: Uint32Array };
    const C = T[a.componentType], k = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[a.type];
    const view = (bvI, byteOff, count, Ctor) => { const v = j.bufferViews[bvI], o = bin.byteOffset + (v.byteOffset || 0) + (byteOff || 0); return new Ctor(bin.buffer.slice(o, o + count * Ctor.BYTES_PER_ELEMENT)); };
    const raw = a.bufferView != null ? view(a.bufferView, a.byteOffset, a.count * k, C) : new C(a.count * k);
    if (a.sparse) { // morph deltas ship sparse: zeros plus the listed vertices
      const s = a.sparse, ix = view(s.indices.bufferView, s.indices.byteOffset, s.count, T[s.indices.componentType]), vals = view(s.values.bufferView, s.values.byteOffset, s.count * k, C);
      for (let q = 0; q < s.count; q++) for (let c = 0; c < k; c++) raw[ix[q] * k + c] = vals[q * k + c];
    }
    if (a.normalized && C !== Float32Array) { const s = C === Uint8Array ? 255 : 65535; return Float32Array.from(raw, (x) => x / s); }
    return raw;
  };
  return { b, j, bin, acc };
}

const kit = readGlb(KIT), { j } = kit;
const skin = j.skins[0], ibm = kit.acc(skin.inverseBindMatrices);
const parentOf = new Map();
j.nodes.forEach((nd, i) => (nd.children ?? []).forEach((c) => parentOf.set(c, i)));
const joints = skin.joints.map((ni, k) => {
  const p = new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().fromArray(ibm, k * 16).invert());
  const par = skin.joints.indexOf(parentOf.get(ni));
  return { name: j.nodes[ni].name, parent: par, p: p.toArray().map((x) => +x.toFixed(5)) };
});

const mods = [], P = [], N = [], UV = [], BI = [], BW = [], PART = [], M = MORPHS.map(() => []), IDX = [];
for (const nd of j.nodes) {
  if (nd.mesh == null) continue;
  const mesh = j.meshes[nd.mesh], names = mesh.extras?.targetNames ?? [];
  const id = mods.length;
  const [, slot] = nd.name.split('.');
  mods.push({ name: nd.name, slot, variant: nd.extras?.variant ?? null, mat: j.materials[mesh.primitives[0].material].name });
  for (const pr of mesh.primitives) {
    const base = P.length / 3;
    const pos = kit.acc(pr.attributes.POSITION), nor = kit.acc(pr.attributes.NORMAL);
    const uv = pr.attributes.TEXCOORD_0 != null ? kit.acc(pr.attributes.TEXCOORD_0) : null;
    const bj = kit.acc(pr.attributes.JOINTS_0), bw = kit.acc(pr.attributes.WEIGHTS_0);
    const n = pos.length / 3;
    for (let v = 0; v < n; v++) {
      P.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]); N.push(nor[v * 3], nor[v * 3 + 1], nor[v * 3 + 2]);
      UV.push(uv ? uv[v * 2] : 0, uv ? uv[v * 2 + 1] : 0);
      let s = 0; for (let k = 0; k < 4; k++) s += bw[v * 4 + k];
      for (let k = 0; k < 4; k++) { BI.push(bj[v * 4 + k]); BW.push(s > 0 ? bw[v * 4 + k] / s : k === 0 ? 1 : 0); }
      PART.push(id);
    }
    MORPHS.forEach((mn, mi) => {
      const t = names.indexOf(mn), d = t >= 0 && pr.targets?.[t] ? kit.acc(pr.targets[t].POSITION) : null;
      for (let v = 0; v < n; v++) M[mi].push(d ? d[v * 3] : 0, d ? d[v * 3 + 1] : 0, d ? d[v * 3 + 2] : 0);
    });
    const ix = kit.acc(pr.indices);
    for (const x of ix) IDX.push(base + x);
  }
}
if (P.length / 3 > 65535) throw new Error('kit too big for 16-bit indices');

// Pack: each block 4-byte aligned.
const blocks = [
  ['position', Float32Array.from(P)], ['normal', Float32Array.from(N)], ['uv', Float32Array.from(UV)],
  ['bone', Uint8Array.from(BI)], ['weight', Float32Array.from(BW)], ['part', Uint8Array.from(PART)],
  ...MORPHS.map((mn, mi) => [mn, Float32Array.from(M[mi])]), ['index', Uint16Array.from(IDX)],
];
const layout = {}; let off = 0; const parts = [];
for (const [k, a] of blocks) {
  const pad = (4 - (off % 4)) % 4; if (pad) { parts.push(Buffer.alloc(pad)); off += pad; }
  layout[k] = { offset: off, length: a.length }; const buf = Buffer.from(a.buffer, a.byteOffset, a.byteLength); parts.push(buf); off += buf.length;
}
fs.mkdirSync(path.join(OUT, 'faces'), { recursive: true });
const bin = Buffer.concat(parts);
fs.writeFileSync(path.join(OUT, 'kit.bin'), bin);

// The six faces: the PNG each civilian GLB embeds, plus the scene extras (frame, actorScale, headBoneScale) as reference.
const faces = {};
for (const v of FACES) {
  const f = path.join(SRC, `public/authored-assets/body.faceted-civilian-${v}/v1/model.glb`), g = readGlb(f);
  const im = g.j.images[0], bv = g.j.bufferViews[im.bufferView], png = g.bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength);
  fs.writeFileSync(path.join(OUT, 'faces', `${v}.png`), png);
  faces[v] = { file: `faces/${v}.png`, sha256: sha(png), source: { path: `public/authored-assets/body.faceted-civilian-${v}/v1/model.glb`, sha256: sha(g.b) }, extras: g.j.scenes[0].extras };
}
const meta = {
  version: 1, body: 'faceted-v1', skeleton: 'ual-deform-v1', file: 'kit.bin', sha256: sha(bin),
  vertices: P.length / 3, triangles: IDX.length / 3, layout, morphs: MORPHS, modules: mods, joints, faces,
  source: { repo: 'Living Superweapon', root: SRC, branch: 'alpine/facetnpc1-kc21df3d3', path: 'public/models/modular-hero/modular-hero.glb', sha256: sha(kit.b) },
  licence: 'Proprietary-Internal studio geometry (Machine King Studios), runtime embed only; skeleton UAL CC0-1.0. See PROVENANCE.md.',
};
fs.writeFileSync(path.join(OUT, 'kit.json'), JSON.stringify(meta, null, 1));
console.log(`kit: ${meta.vertices} verts, ${meta.triangles} tris, ${mods.length} modules, ${joints.length} joints, ${bin.length} bytes`);
