// The world frame (docs/design/WEB_STREAMING.md §3.1, §4 F3-F4). One flat plane in metres, +x east, +z south, Phoenix at
// the origin. A usmap point u lands at (u - PHX) * K: K is one global number, never per region. Distance compresses,
// objects do not: a car is still 4.6 m long, a lane 3.6 m wide. Everything here is a pure function of the knobs.
import { STREAM } from '../data/streaming.js';

export const C = STREAM.C;
export const ISLAND = STREAM.island;

// usmap metres -> world metres, and back (K and PHX from data/streaming.js).
export const toWorldX = (ux) => (ux - STREAM.PHX[0]) * STREAM.K;
export const toWorldZ = (uy) => (uy - STREAM.PHX[1]) * STREAM.K;
export const toWorld = (u) => [toWorldX(u[0]), toWorldZ(u[1])];
export const toUsmap = (x, z) => [x / STREAM.K + STREAM.PHX[0], z / STREAM.K + STREAM.PHX[1]];

// Chunk address (F4): floor, never truncation toward zero. A point exactly on an edge belongs to the positive side.
export const chunkOf = (v) => Math.floor(v / C);
export const chunkKey = (cx, cz) => `${cx},${cz}`;
// Integer key for hot paths (|cx|,|cz| < 32768): no string building per frame.
export const chunkId = (cx, cz) => ((cx + 32768) << 16) | (cz + 32768);

// The Phoenix island rectangle (§3.4): streamed content never goes inside it; it is suppressed by rectangle, never by chunk.
export const inIsland = (x, z, pad = 0) => Math.abs(x) <= ISLAND + pad && Math.abs(z) <= ISLAND + pad;
// Chunks that touch the island are pinned (never evicted).
export const islandChunk = (cx, cz) => cx * C < ISLAND && (cx + 1) * C > -ISLAND && cz * C < ISLAND && (cz + 1) * C > -ISLAND;

// Seeded hashing (FNV-1a on 32-bit ints) and a small deterministic RNG per chunk / per feature.
export function hash32(...ints) {
  let h = 0x811c9dc5;
  for (let i = 0; i < ints.length; i++) {
    let v = ints[i] | 0;
    for (let k = 0; k < 4; k++) { h ^= v & 0xff; h = Math.imul(h, 0x01000193); v >>>= 8; }
  }
  return h >>> 0;
}
export function rngOf(seed) {
  let s = seed >>> 0 || 1;
  const r = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  r.range = (a, b) => a + (b - a) * r();
  r.int = (a, b) => a + Math.floor(r() * (b - a + 1));
  r.pick = (arr) => arr[Math.floor(r() * arr.length)];
  r.chance = (p) => r() < p;
  return r;
}

// A running FNV hash over numbers (rounded to millimetres) and strings: the layout hash and the island golden hash.
export class Hasher {
  constructor() { this.h = 0x811c9dc5; }
  int(v) { v |= 0; for (let k = 0; k < 4; k++) { this.h ^= v & 0xff; this.h = Math.imul(this.h, 0x01000193); v >>>= 8; } return this; }
  num(v) { return this.int(Math.round(v * 1000)); }
  str(s) { for (let i = 0; i < s.length; i++) { this.h ^= s.charCodeAt(i); this.h = Math.imul(this.h, 0x01000193); } return this; }
  hex() { return (this.h >>> 0).toString(16).padStart(8, '0'); }
}

// Value noise for ground tints (deterministic, cheap): smooth 2D noise at a given wavelength.
const nh = (ix, iz, s) => (hash32(ix, iz, s) & 0xffff) / 0xffff;
export function vnoise(x, z, wave, seed) {
  const fx = x / wave, fz = z / wave, ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz;
  const sx = tx * tx * (3 - 2 * tx), sz = tz * tz * (3 - 2 * tz);
  const a = nh(ix, iz, seed), b = nh(ix + 1, iz, seed), c = nh(ix, iz + 1, seed), d = nh(ix + 1, iz + 1, seed);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}
