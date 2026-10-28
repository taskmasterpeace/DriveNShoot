#!/usr/bin/env node
// LSW-BODIES ingest: Robert's Living Superweapon hero bodies -> compact runtime binaries for DSOA (docs/design/WEB_LSW_BODIES.md).
//   node tools/lsw-bodies-ingest.mjs [--lsw D:/lsw]
// Reads (never writes) LSW's bundled bank `src/data/hero-body-bank.json`: a transcription of Quaternius's Universal Base
// Characters (Superhero_Male_FullBody / Superhero_Female_FullBody), CC0 1.0 - see public/models/lsw/PROVENANCE.md.
// Writes public/models/lsw/<body>.bin + bodies.json: the three source meshes (body, eyes, eyebrows) merged into ONE
// geometry (one draw call per body), a per-vertex `part` (0 body, 1 eyes, 2 brows), 4 bone weights, and the 65 joints'
// bind positions + parents. Runtime: src/systems/lswbodies.js.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const LSW = arg('lsw', 'D:/lsw');
const OUT = fileURLToPath(new URL('../public/models/lsw/', import.meta.url));
mkdirSync(OUT, { recursive: true });

const bankPath = join(LSW, 'src/data/hero-body-bank.json');
const bankBytes = readFileSync(bankPath);
const bank = JSON.parse(bankBytes);
const out = { version: 1, source: { bank: 'D:/lsw/src/data/hero-body-bank.json', bankSha256: createHash('sha256').update(bankBytes).digest('hex') }, bodies: {} };

for (const [id, b] of Object.entries(bank.bodies)) {
  const parts = ['body', 'eyes', 'eyebrows'].map((m) => b.meshes.find((x) => x.material === m));
  const nv = parts.reduce((a, m) => a + m.position.length / 3, 0), ni = parts.reduce((a, m) => a + m.index.length, 0);
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), wt = new Float32Array(nv * 4), bi = new Uint8Array(nv * 4), part = new Uint8Array(nv), idx = new Uint16Array(ni);
  if (nv > 65535) throw new Error(`${id}: ${nv} vertices do not fit 16-bit indices`);
  let v0 = 0, i0 = 0;
  parts.forEach((m, k) => {
    const n = m.position.length / 3;
    pos.set(m.position, v0 * 3); nor.set(m.normal, v0 * 3);
    for (let v = 0; v < n; v++) {
      // Keep the 4 weights, renormalised (the source already carries at most 4 influences per vertex).
      let s = 0;
      for (let c = 0; c < 4; c++) s += m.skinWeight[v * 4 + c];
      for (let c = 0; c < 4; c++) { wt[(v0 + v) * 4 + c] = s > 0 ? m.skinWeight[v * 4 + c] / s : c === 0 ? 1 : 0; bi[(v0 + v) * 4 + c] = m.skinIndex[v * 4 + c]; }
      part[v0 + v] = k;
    }
    for (let i = 0; i < m.index.length; i++) idx[i0 + i] = m.index[i] + v0;
    v0 += n; i0 += m.index.length;
  });
  const layout = {}; let off = 0;
  for (const [name, a] of [['position', pos], ['normal', nor], ['weight', wt], ['bone', bi], ['part', part], ['index', idx]]) {
    off = Math.ceil(off / 4) * 4; layout[name] = { offset: off, length: a.length, type: a.constructor.name }; off += a.byteLength;
  }
  const buf = Buffer.alloc(off);
  for (const [name, a] of Object.entries({ position: pos, normal: nor, weight: wt, bone: bi, part, index: idx })) Buffer.from(a.buffer, a.byteOffset, a.byteLength).copy(buf, layout[name].offset);
  writeFileSync(join(OUT, `${id}.bin`), buf);
  out.bodies[id] = {
    file: `${id}.bin`, bytes: buf.length, sha256: createHash('sha256').update(buf).digest('hex'), vertices: nv, triangles: ni / 3, layout,
    joints: b.joints.map((j) => ({ name: j.name, parent: j.parent, p: [j.matrix[12], j.matrix[13], j.matrix[14]].map((x) => +x.toFixed(5)) })),
    source: b.source,
  };
  console.log(`${id}: ${nv} verts, ${ni / 3} tris, ${b.joints.length} joints -> ${buf.length} bytes`);
}
writeFileSync(join(OUT, 'bodies.json'), JSON.stringify(out, null, 1));
copyFileSync(join(LSW, 'assets-src/quaternius/LICENSE.txt'), join(OUT, 'LICENSE-CC0.txt'));
console.log('wrote', OUT);
