import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WATER } from '../data/water.js';

// Water: the Colorado Remnant (a river down the east flank, under the Route 66 bridge)
// emptying into Lake Mead Remnant in the south-east corner. depthAt() is THE water
// authority: wading, swimming, diving, drowning, flooding cars, boats, zombie behaviour.
// Past the island (|x| or |z| > 464) it hands over to the streamed world's L1 water (world/rivers.js, rows in
// data/water.js): the same questions, the same answers (dry | wade | swim), real rivers, washes and lakes.
const OUT = 464; // the island rectangle (world/geo.js ISLAND)
const outside = (x, z) => x > OUT || x < -OUT || z > OUT || z < -OUT;

export const RIVER = [[418, -452], [424, -360], [410, -280], [428, -190], [414, -110], [420, -40], [416, 0], [412, 60], [428, 150], [418, 240], [406, 320], [399, 348]]; // ends at the lake shore (no overlap → no z-fighting)
const RIVER_HALF = 11;
export const LAKE = { x: 390, z: 398, r: 52, depth: 7 };
export const BRIDGE = { x: 416, z: 0, halfW: 7.6, halfL: 16 };
export const DOCK = { x: 360, z: 382 };

// Past the island ONE authority answers (the streamer plugs it in: WorldIndex.depthAt -> world/rivers.js depthAt): L1's
// rows (rivers, washes, canals, lakes: data/water.js) and a region's own water (Florida's sea, lagoon, canals and
// sloughs: world/regions.js), the deeper of the two, a river bridge's deck dry for whoever is up on it.
// depth(x, z, y, ignoreDeck); surface(x, z) -> the water's surface height, or NaN. The island's own water is untouched.
export const EXT = { depth: null, surface: null, dry: null }; // dry(x, z): dry ground standing in the water (a key: systems/waterplace.js)
// Standalone so world generation can keep props out of the water before the Water object exists.
export function waterDepth(x, z, ignoreBridge = false) {
  if (EXT.depth && outside(x, z)) return EXT.dry?.(x, z) ? 0 : EXT.depth(x, z, undefined, ignoreBridge);
  if (x < 300 || z < -460) return 0; // fast reject: all water is on the east side
  if (!ignoreBridge && Math.abs(z - BRIDGE.z) < BRIDGE.halfW && Math.abs(x - BRIDGE.x) < BRIDGE.halfL) return 0; // on the deck
  let d = 0;
  const ld = Math.hypot(x - LAKE.x, z - LAKE.z);
  if (ld < LAKE.r) d = Math.max(d, Math.min(LAKE.depth, (1 - ld / LAKE.r) * LAKE.depth * 1.6));
  for (let i = 0; i < RIVER.length - 1; i++) {
    const [ax, az] = RIVER[i], [bx, bz] = RIVER[i + 1];
    if (z < Math.min(az, bz) - RIVER_HALF || z > Math.max(az, bz) + RIVER_HALF) continue;
    const sd = segDist(x, z, ax, az, bx, bz);
    if (sd < RIVER_HALF) d = Math.max(d, 2.8 * (1 - (sd / RIVER_HALF) ** 2));
  }
  return d;
}
// Within m metres of any water (for keeping props & terrain clear of the banks).
export function nearWater(x, z, m = 4) {
  if (x < 290) return false;
  return waterDepth(x, z, true) > 0 || waterDepth(x + m, z, true) > 0 || waterDepth(x - m, z, true) > 0 || waterDepth(x, z + m, true) > 0 || waterDepth(x, z - m, true) > 0;
}
export const WATER_AVOID = [...RIVER.map(([x, z]) => ({ x, z, r: RIVER_HALF + 14 })), { x: 390, z: 398, r: 64 }];

function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2));
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

export class Water {
  constructor(game) {
    this.g = game;
    this.time = 0;
    // Normal map: scrolling ripples so sun & moon glint off the surface.
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d'), img = x.createImageData(128, 128);
    for (let j = 0; j < 128; j++) for (let i = 0; i < 128; i++) {
      // Integer wave numbers over the 128px period → the texture tiles seamlessly (no checker grid).
      const T = (Math.PI * 2) / 128;
      const a = Math.sin(i * T * 4) * Math.cos(j * T * 3) + Math.sin((i + j) * T * 2) * 0.6 + Math.sin(i * T * 1 - j * T * 5) * 0.4;
      const b = Math.cos(i * T * 2 + j * T * 1) * 0.8 + Math.sin(j * T * 4) * 0.5 + Math.cos((i - j) * T * 3) * 0.3;
      const k = (j * 128 + i) * 4;
      img.data[k] = 128 + a * 40; img.data[k + 1] = 128 + b * 40; img.data[k + 2] = 255; img.data[k + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    this.normal = new THREE.CanvasTexture(c);
    this.normal.wrapS = this.normal.wrapT = THREE.RepeatWrapping;
    this.normal.repeat.set(1, 1); // UVs are world-space metres / 7 (see tint)
    // White base: the depth tint comes from vertex colours. No metalness (there's no sky to reflect,
    // metal water reads as tar); low roughness gives sun/moon glints off the ripples.
    this.mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.18, metalness: 0, normalMap: this.normal, normalScale: new THREE.Vector2(0.45, 0.45), vertexColors: true }); // opaque: overlapping river/lake pieces would double-darken
    // The streamed world's water sheets (world/rivers.js, drawn per chunk by the streamer): the same ripples, scrolled
    // along each river's own length (UV v = metres downstream / 7), so they run with the current.
    this.flowTex = this.normal.clone();
    this.flowTex.wrapS = this.flowTex.wrapT = THREE.RepeatWrapping; this.flowTex.needsUpdate = true;
    this.streamMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.4, metalness: 0, normalMap: this.flowTex, normalScale: new THREE.Vector2(0.18, 0.18), vertexColors: true }); // silty water: a duller glint than the island's
    // Its colour per pixel: the sheet's vertex colour carries (signed metres from the water's edge, depth) instead of a
    // colour (world/chunkgen.js), so the shore's foam line is crisp and the depth bands follow the real shore.
    const C = WATER.colour, lin = (h) => new THREE.Color(h);
    // The same layer draws a dry wash's bed (vertex blue = 1): pale sand and gravel, a dark lip at its edge, no ripples,
    // no shine.
    // And a region's water (blue 0.4 + kind / 100: Florida's swamp, canal, lagoon, sea): shallow to deep by kind.
    const RG = [1, 2, 3, 4].map((k) => C.region[k]);
    const U = { uShallow: { value: lin(C.shallow) }, uMid: { value: lin(C.mid) }, uDeep: { value: lin(C.deep) }, uFoam: { value: lin(C.foam) }, uSand: { value: lin(C.washBed) }, uLip: { value: lin(C.washLip) },
      uRg0: { value: RG.map((c) => lin(c[0])) }, uRg1: { value: RG.map((c) => lin(c[1])) } };
    this.streamMat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
uniform vec3 uShallow, uMid, uDeep, uFoam, uSand, uLip;
uniform vec3 uRg0[4], uRg1[4];
float wH2(vec2 q) { return fract(sin(dot(q, vec2(12.9898, 78.233))) * 43758.5453); }
float wVn(vec2 q) { vec2 i = floor(q), f = fract(q); f = f * f * (3.0 - 2.0 * f); return mix(mix(wH2(i), wH2(i + vec2(1.0, 0.0)), f.x), mix(wH2(i + vec2(0.0, 1.0)), wH2(i + 1.0), f.x), f.y); }`)
        .replace('#include <color_fragment>', `#if defined( USE_COLOR )
  float wEdge = vColor.r, wDepth = vColor.g;
  vec3 wc;
  if (vColor.b > 0.95) {
    // A wash's bed (uv = metres across / 6, along / 6): braided streaks of finer and coarser sand along the flow,
    // gravel speckle, and the dark lip of the cut bank at its edge.
    vec2 p = vNormalMapUv * 6.0;
    float braid = wVn(vec2(p.x * 0.32, p.y * 0.045)) * 0.65 + wVn(vec2(p.x * 0.9, p.y * 0.12)) * 0.35;
    float grit = step(0.82, wH2(floor(p * 2.6)));
    wc = uSand * (0.8 + 0.3 * braid) * (1.0 - 0.18 * grit);
    wc = mix(uLip, wc, smoothstep(0.5, 3.2, wEdge));
  } else if (vColor.b > 0.35) {
    // A region's water (world/regions.js WK): shallow to deep over 2.2 m (the sea over 6 m).
    int k = int(floor((vColor.b - 0.4) * 100.0 + 0.5)) - 1;
    vec3 c0 = uRg0[0], c1 = uRg1[0];
    if (k == 1) { c0 = uRg0[1]; c1 = uRg1[1]; } else if (k == 2) { c0 = uRg0[2]; c1 = uRg1[2]; } else if (k >= 3) { c0 = uRg0[3]; c1 = uRg1[3]; }
    wc = mix(c0, c1, min(1.0, wDepth / (k >= 3 ? 6.0 : 2.2)));
  } else {
    wc = mix(uShallow, uMid, smoothstep(0.15, 1.5, wDepth));
    wc = mix(wc, uDeep, smoothstep(1.5, 4.0, wDepth));
    float foam = 1.0 - smoothstep(0.0, 1.4, wEdge);
    wc = mix(wc, uFoam, foam * 0.75);
  }
  diffuseColor.rgb *= wc;
#endif`)
        // No ripples on a wash's sand (blue 1); a lake's (blue 0.2) calmer than a river's; a region's as a river's.
        .replace('#include <normal_fragment_maps>', `if (vColor.b < 0.95) {\n${THREE.ShaderChunk.normal_fragment_maps.replace('mapN.xy *= normalScale;', 'mapN.xy *= normalScale * (vColor.b > 0.1 && vColor.b < 0.35 ? 0.4 : 1.0);')}\n}`)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nif (vColor.b > 0.95) roughnessFactor = 1.0; else if (vColor.b > 0.1) roughnessFactor = 0.5;');
    };
    this.streamMat.customProgramCacheKey = () => 'dsoa-stream-water-5';

    // River ribbon + lake disc, vertex-tinted deeper toward the middle; one mesh.
    const geos = [];
    for (let i = 0; i < RIVER.length - 1; i++) {
      const [ax, az] = RIVER[i], [bx, bz] = RIVER[i + 1];
      const len = Math.hypot(bx - ax, bz - az), ang = Math.atan2(bx - ax, bz - az);
      const g = new THREE.PlaneGeometry(RIVER_HALF * 2 + 4, len + RIVER_HALF * 1.2, 8, Math.max(2, Math.round(len / 4)));
      g.rotateX(-Math.PI / 2); g.rotateY(ang); g.translate((ax + bx) / 2, 0.015, (az + bz) / 2);
      geos.push(this.tint(g));
    }
    const lake = new THREE.CircleGeometry(LAKE.r + 2, 64); lake.rotateX(-Math.PI / 2); lake.translate(LAKE.x, 0.015, LAKE.z);
    geos.push(this.tint(lake));
    this.mesh = new THREE.Mesh(mergeGeometries(geos), this.mat);
    this.mesh.receiveShadow = true;
    this.mesh.renderOrder = 1;
    game.scene.add(this.mesh);

    // Wet-sand shoreline: a darker band just outside the water.
    const shore = [];
    for (let i = 0; i < RIVER.length - 1; i++) {
      const [ax, az] = RIVER[i], [bx, bz] = RIVER[i + 1];
      const len = Math.hypot(bx - ax, bz - az), ang = Math.atan2(bx - ax, bz - az);
      const g = new THREE.PlaneGeometry(RIVER_HALF * 2 + 9, len + RIVER_HALF * 1.6); g.rotateX(-Math.PI / 2); g.rotateY(ang); g.translate((ax + bx) / 2, 0.008, (az + bz) / 2);
      shore.push(g);
    }
    const ring = new THREE.CircleGeometry(LAKE.r + 7, 64); ring.rotateX(-Math.PI / 2); ring.translate(LAKE.x, 0.008, LAKE.z); shore.push(ring);
    const sm = new THREE.Mesh(mergeGeometries(shore), new THREE.MeshStandardMaterial({ color: '#5e4430', roughness: 0.6, transparent: true, opacity: 0.55, depthWrite: false }));
    sm.receiveShadow = true; sm.renderOrder = 0;
    game.scene.add(sm);

    this.buildBridge(game);
    this.buildDock(game);
  }

  tint(g) {
    const pos = g.attributes.position, col = new Float32Array(pos.count * 3), deep = new THREE.Color('#2a6468'), shallow = new THREE.Color('#6aa598'), t = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const d = this.depthAt(pos.getX(i), pos.getZ(i), true);
      t.copy(shallow).lerp(deep, Math.min(1, d / 4));
      col[i * 3] = t.r; col[i * 3 + 1] = t.g; col[i * 3 + 2] = t.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    // World-space UVs so ripples run continuously across river segments and the lake.
    const uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) { uv[i * 2] = pos.getX(i) / 7; uv[i * 2 + 1] = pos.getZ(i) / 7; }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    if (g.index) g = g.toNonIndexed();
    return g;
  }

  // Depth of water at a point (0 = dry). ignoreBridge for rendering the channel under the deck.
  // y (optional, absolute): how high the asker is. Past the island a bridge deck counts only for someone up on it (a
  // swimmer under it is still in the river); without y a deck is dry ground (the 2-D question, as on the island).
  depthAt(x, z, ignoreBridge = false, y) {
    if (outside(x, z)) return EXT.dry?.(x, z) ? 0 : EXT.depth ? EXT.depth(x, z, y, ignoreBridge) : 0; // THE authority past the island (see EXT)
    return waterDepth(x, z, ignoreBridge);
  }
  // How the surface over that depth is moving (world/waves.js: heave, slopes, whitecap pinch); boats ride it.
  waveAt(x, z, t, out) { return this.g.waves ? this.g.waves.waveAt(x, z, t, out) : { h: 0, sx: 0, sz: 0, j: 1, vy: 0, amp: 0 }; }
  // The water's surface height at (x, z) (absolute; the island's is 0), or `fallback` where there is none.
  surfaceAt(x, z, fallback = 0) {
    if (!outside(x, z)) return 0;
    const s = EXT.surface ? EXT.surface(x, z) : NaN;
    return Number.isFinite(s) ? s : fallback;
  }

  // The road itself runs across (it's drawn above the water); the bridge adds what makes it
  // read as a bridge from above: rails, edge girders, a shadow on the water, piers.
  buildBridge(game) {
    const { x, z, halfW, halfL } = BRIDGE;
    const steel = new THREE.MeshStandardMaterial({ color: '#5a554e', roughness: 0.7, metalness: 0.3 });
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(halfL * 2, halfW * 2 + 5).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#0a1a1c', transparent: true, opacity: 0.45, depthWrite: false }));
    shadow.position.set(x, 0.02, z + 1.2); game.scene.add(shadow); // cast onto the water beside the deck
    for (const s of [-1, 1]) {
      const girder = new THREE.Mesh(new THREE.BoxGeometry(halfL * 2 + 2, 0.5, 0.6), steel);
      girder.position.set(x, 0.2, z + s * (halfW + 0.3)); girder.castShadow = true; game.scene.add(girder);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(halfL * 2 + 2, 0.12, 0.12), steel);
      rail.position.set(x, 1.05, z + s * (halfW + 0.35)); game.scene.add(rail);
      for (let k = -halfL; k <= halfL; k += 2.5) { // rail posts
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.9, 0.12), steel);
        post.position.set(x + k, 0.6, z + s * (halfW + 0.35)); post.castShadow = true; game.scene.add(post);
      }
      game.statics.addCentered(x, z + s * (halfW + 0.3), halfL * 2 + 2, 0.6, 'rail', 1);
    }
  }

  buildDock(game) {
    const { x, z } = DOCK;
    const wood = new THREE.MeshStandardMaterial({ color: '#6a4a30', roughness: 0.95 });
    const pier = new THREE.Mesh(new THREE.BoxGeometry(4, 0.35, 22), wood);
    pier.position.set(x + 12, 0.35, z); pier.rotation.y = Math.PI / 2; pier.castShadow = true; pier.receiveShadow = true;
    game.scene.add(pier);
    this.dockDeck = { minX: x, maxX: x + 24, minZ: z - 2, maxZ: z + 2 };
  }

  // Wading/swimming state for a character at its position.
  stateAt(x, z, y) {
    if (this.dockDeck && x > this.dockDeck.minX && x < this.dockDeck.maxX && z > this.dockDeck.minZ && z < this.dockDeck.maxZ) return 'dry';
    const d = this.depthAt(x, z, false, y);
    return d <= 0.25 ? 'dry' : d < WATER.swimDepth ? 'wade' : 'swim';
  }

  update(dt) {
    this.time += dt;
    this.normal.offset.set(this.time * 0.012, this.time * 0.007);
    this.flowTex.offset.set(Math.sin(this.time * 0.13) * 0.02, -this.time * WATER.flow / 7); // downstream, with a little wander
  }

  drawOnMinimap(canvas, half) {
    const g = canvas.getContext('2d'), k = canvas.width / (half * 2);
    g.strokeStyle = '#2f5a5c'; g.lineWidth = RIVER_HALF * 2 * k; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); RIVER.forEach(([x, z], i) => (i ? g.lineTo((x + half) * k, (z + half) * k) : g.moveTo((x + half) * k, (z + half) * k))); g.stroke();
    g.fillStyle = '#2f5a5c'; g.beginPath(); g.arc((LAKE.x + half) * k, (LAKE.z + half) * k, LAKE.r * k, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#6e6a62'; g.fillRect((BRIDGE.x - BRIDGE.halfL + half) * k, (BRIDGE.z - BRIDGE.halfW + half) * k, BRIDGE.halfL * 2 * k, BRIDGE.halfW * 2 * k);
  }
}
