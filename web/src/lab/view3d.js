// The Building Lab's 3D view: the building as the game builds it - world/ring.js geo() for the street storey (walls with
// doorways and windows, floor finishes, furniture by room, yard, roof), world/authored.js for the floors above and the
// stairs - drawn with the game's own materials (world/surfaces.js: stucco/block/brick walls, the five roofs), one
// InstancedMesh per material like the streamer's pools. Cutaway: floors above the one being edited are not drawn.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { wallSurface, roofSurface } from '../world/surfaces.js';
import { sandTexture } from '../world/textures.js';

const _o = new THREE.Object3D(), _c = new THREE.Color();
const BOX = new THREE.BoxGeometry(1, 1, 1);

export class View3D {
  constructor(canvas) {
    this.canvas = canvas;
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true }));
    r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
    const s = (this.scene = new THREE.Scene());
    s.background = new THREE.Color('#1d1813');
    s.fog = new THREE.Fog('#1d1813', 90, 220);
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.5, 600);
    this.camera.position.set(28, 34, 38);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true; this.controls.maxPolarAngle = Math.PI * 0.49; this.controls.minDistance = 6; this.controls.maxDistance = 180;
    this.controls.addEventListener('change', () => this.dirty = true);
    s.add(new THREE.HemisphereLight('#f4e6cc', '#5a4632', 0.85));
    const sun = (this.sun = new THREE.DirectionalLight('#ffe2b8', 2.3));
    sun.position.set(-30, 60, -18); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
    s.add(sun, sun.target);
    const sand = sandTexture(); sand.wrapS = sand.wrapT = THREE.RepeatWrapping; sand.repeat.set(14, 14); sand.colorSpace = THREE.SRGBColorSpace;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(260, 260).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: sand, roughness: 0.96 }));
    ground.receiveShadow = true; ground.position.y = -0.01; s.add(ground);
    const std = (o) => new THREE.MeshStandardMaterial(o);
    this.mats = {
      walls: wallSurface(std({ roughness: 0.92, metalness: 0.04 })),
      roofs: roofSurface(std({ roughness: 0.85, metalness: 0.1 })),
      props: std({ roughness: 0.88, metalness: 0.08 }),
      floors: std({ roughness: 0.95 }),
      trunks: std({ roughness: 0.95 }), crowns: std({ roughness: 1, flatShading: true }),
      mark: new THREE.MeshBasicMaterial({ color: '#ff4a2a', transparent: true, opacity: 0.5, depthWrite: false }),
      sel: new THREE.LineBasicMaterial({ color: '#f5b21a' }),
    };
    this.geos = { box: BOX, trunk: new THREE.CylinderGeometry(0.16, 0.3, 1, 6), crown: new THREE.IcosahedronGeometry(1, 1) };
    this.group = new THREE.Group(); s.add(this.group);
    this.dirty = true;
    const loop = () => { requestAnimationFrame(loop); this.controls.update(); this.resize(); if (this.dirty) { this.dirty = false; this.renderer.render(this.scene, this.camera); } };
    loop();
  }
  resize() {
    const c = this.canvas, w = c.clientWidth | 0, h = c.clientHeight | 0;
    if (!w || !h || (c.width === Math.round(w * this.renderer.getPixelRatio()) && c.height === Math.round(h * this.renderer.getPixelRatio()))) return;
    this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.dirty = true;
  }
  // entries [x, y, z, sx, sy, sz, hex, rot, shade] -> one InstancedMesh.
  inst(list, mat, geo = BOX, { cast = true, receive = true } = {}) {
    if (!list.length) return null;
    const m = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((e, i) => {
      _o.position.set(e[0], e[1], e[2]); _o.rotation.set(0, e[7] ?? 0, 0); _o.scale.set(Math.max(0.001, e[3]), Math.max(0.001, e[4]), Math.max(0.001, e[5])); _o.updateMatrix();
      m.setMatrixAt(i, _o.matrix);
      _c.set(e[6]); const s = e[8] ?? 1; _c.setRGB(Math.min(1, _c.r * s), Math.min(1, _c.g * s), Math.min(1, _c.b * s));
      m.setColorAt(i, _c);
    });
    m.castShadow = cast; m.receiveShadow = receive;
    this.group.add(m);
    return m;
  }
  clear() {
    for (const c of [...this.group.children]) { this.group.remove(c); if (c.geometry && !Object.values(this.geos).includes(c.geometry)) c.geometry.dispose(); if (c.dispose) c.dispose(); }
  }
  // geo: ring.geo(L); uppers[k]: authored upperFloor(); shell: the outside walls above the street storey; view: { floor, roof }
  build({ row, geo, uppers, shell, view, marks = [], sel = null }) {
    this.clear();
    const f = view.floor, top = row.floors.length - 1, Y = (k) => (k < row.floors.length ? row.floors[k].y : row.top ?? row.h);
    const cutY = f >= top ? Infinity : Y(f + 1);
    const walls = geo.walls.slice(), props = geo.props.concat(geo.decor), floors = [geo.floor], roofs = [];
    for (const e of shell) if (e[1] < cutY) walls.push(e);
    for (let k = 1; k <= Math.min(f, top); k++) {
      const U = uppers[k];
      if (!U) continue;
      walls.push(...U.walls); props.push(...U.props, ...U.rails); floors.push(...U.deck);
    }
    if (view.roof && f >= top) roofs.push(...geo.roof, ...geo.canopy);
    else roofs.push(...geo.canopy);
    // Cutaway: the walls cut 1.5 m above the floor being viewed (a dollhouse cut), so its rooms, stairs and doorways show.
    const cut = view.roof ? Infinity : Y(f) + 1.5;
    const clamp = (e) => { const y0 = e[1] - e[4] / 2, y1 = Math.min(e[1] + e[4] / 2, cut); return y1 - y0 < 0.02 ? null : [e[0], (y0 + y1) / 2, e[2], e[3], y1 - y0, e[5], e[6], e[7], e[8]]; };
    if (cut < Infinity) { const kept = walls.map(clamp).filter(Boolean); walls.length = 0; walls.push(...kept); }
    this.inst(walls, this.mats.walls);
    this.inst(roofs, this.mats.roofs);
    this.inst(props, this.mats.props);
    this.inst(floors, this.mats.floors, BOX, { cast: false });
    this.inst(geo.trunks ?? [], this.mats.trunks, this.geos.trunk);
    this.inst(geo.crowns ?? [], this.mats.crowns, this.geos.crown);
    // Problems: a red sheet over each unreachable room (on the floor being viewed and below).
    const my = (k) => Y(k) + 0.2;
    // (a red volume a metre and a half deep: it shows over the cut walls from any side)
    const red = marks.filter((m) => m.floor <= f && (m.floor === f || view.roof === false)).map((m) => [(m.x0 + m.x1) / 2, Y(m.floor) + 0.85, (m.z0 + m.z1) / 2, m.x1 - m.x0 - 0.05, 1.5, m.z1 - m.z0 - 0.05, '#ff4a2a', 0, 1]);
    if (red.length) { const m = this.inst(red, this.mats.mark, BOX, { cast: false, receive: false }); if (m) m.renderOrder = 3; }
    if (sel) {
      const y = my(sel.floor) + 0.05, pts = [[sel.x0, sel.z0], [sel.x1, sel.z0], [sel.x1, sel.z1], [sel.x0, sel.z1], [sel.x0, sel.z0]].map(([x, z]) => new THREE.Vector3(x, y, z));
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), this.mats.sel); line.renderOrder = 4; this.group.add(line);
    }
    // The sun's shadow box round the building.
    const cx = (row.x0 + row.x1) / 2, cz = (row.z0 + row.z1) / 2, R = Math.max(row.x1 - row.x0, row.z1 - row.z0) * 0.75 + 12;
    const sc = this.sun.shadow.camera; sc.left = -R; sc.right = R; sc.top = R; sc.bottom = -R; sc.near = 1; sc.far = 200; sc.updateProjectionMatrix();
    this.sun.position.set(cx - 30, 60, cz - 18); this.sun.target.position.set(cx, 0, cz);
    this.dirty = true;
  }
  frame(row, mode = 'orbit') {
    const cx = (row.x0 + row.x1) / 2, cz = (row.z0 + row.z1) / 2, W = row.x1 - row.x0 + 8, D = row.z1 - row.z0 + 8;
    // Far enough that the building and its lot fit the narrower of the two fields of view.
    const c = this.camera, vf = (c.fov * Math.PI) / 180, hf = 2 * Math.atan(Math.tan(vf / 2) * c.aspect);
    const R = 0.5 * Math.hypot(W, D, row.top ?? row.h), dist = (R / Math.sin(Math.min(vf, hf) / 2)) * 1.02;
    this.controls.target.set(cx, (row.top ?? row.h) * 0.3, cz);
    if (mode === 'top') this.camera.position.set(cx, dist * 1.05, cz + 0.01);
    else {
      // From the street side, a little off square (the façade and its front door toward you).
      const f = row.front, nx = f === 'W' ? -1 : f === 'E' ? 1 : 0, nz = f === 'N' ? -1 : f === 'S' ? 1 : 0, px = nz ? 1 : 0, pz = nx ? 1 : 0;
      const d = new THREE.Vector3(nx * 0.56 + px * 0.42, 0.72, nz * 0.56 + pz * 0.42).normalize().multiplyScalar(dist);
      this.camera.position.set(cx + d.x, d.y, cz + d.z);
    }
    this.controls.update(); this.dirty = true;
  }
}
