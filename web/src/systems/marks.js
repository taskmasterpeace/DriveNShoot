import * as THREE from 'three';
import { MARK_KINDS, MARK_RULES as MR, TAGS, MARK_TEXT, PAINT, NEWS, purple } from '../data/worldvoice.js';
import { FACTIONS } from '../data/society.js';
import { bearingOf } from './farsound.js';

// READABLE LEFTOVERS (docs/design/WEB_WORLD_VOICE.md §3.4): the world writes on itself, and only what really happened.
//   tag      a place raided, taken or fallen carries the raiders' tag: their letters in their colour on its walls and in
//            the street (the chronicle row that says so is the mark's cause)
//   tally    deaths at a place are counted on a wall in strokes of five: every kill row the chronicle holds for it
//   warning  an overrun town's edge says DEAD INSIDE; a site story's sickness or toll says so on a board
//   dontgo   a town that HOLDS news of a place falling (a copy in its holder: law 6) paints DON'T GO <dir> on its road
//            edge, pointing at it. A town that never heard paints nothing
//   grave    a grave dug since the world began running gets a board with the name and how they died
//   ash      a campfire left behind is a cold ring of ash and stones
// All of it: rows of marks (saved), drawn near you as ONE instanced mesh of quads over a painted atlas (each quad reads
// its own slot: aRect, the road signs' trick), plus one instanced mesh of posts under the boards. Two draw calls at most,
// none when nothing is near. The near set is rebuilt only when you move MR.redraw metres or a mark changes.
const SLOT_W = 256, SLOT_H = 128, COLS = 8, ROWS = 8, SLOTS = COLS * ROWS;
const r1 = (v) => Math.round(v * 10) / 10;
const hashS = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const DIRNAME = { N: 'NORTH', NE: 'NORTHEAST', E: 'EAST', SE: 'SOUTHEAST', S: 'SOUTH', SW: 'SOUTHWEST', W: 'WEST', NW: 'NORTHWEST' };

export class Marks {
  constructor(g) {
    this.g = g;
    this.on = true;
    this.list = [];          // every mark ever made (saved)
    this.byKey = new Map();  // cause key -> mark (one mark per cause)
    this.cursor = null;
    this.near = [];          // marks drawn now
    this.at = { x: 1e9, z: 1e9 }; this.dirty = true; this.scanT = 0;
    this.slots = new Map();  // mark id -> atlas slot
    this.slotOwner = new Array(SLOTS).fill(null);
    this.stats = { made: 0, tags: 0, tallies: 0, warnings: 0, dontgo: 0, graves: 0, ash: 0, painted: 0 };
    this.mesh = null; this.posts = null;
  }

  // ---- GPU ------------------------------------------------------------------------------------------------------------
  gpu() {
    if (this.mesh || typeof document === 'undefined' || !this.g.scene) return this.mesh;
    const c = (this.canvas = document.createElement('canvas')); c.width = SLOT_W * COLS; c.height = SLOT_H * ROWS;
    this.ctx2 = c.getContext('2d');
    const tex = (this.tex = new THREE.CanvasTexture(c)); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.06, depthWrite: false, roughness: 0.92, metalness: 0, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aRect;')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\n  vMapUv = aRect.xy + vMapUv * aRect.zw;\n#endif');
    };
    const geo = new THREE.PlaneGeometry(1, 1);
    this.rect = new THREE.InstancedBufferAttribute(new Float32Array(MR.cap * 4), 4); geo.setAttribute('aRect', this.rect);
    const m = (this.mesh = new THREE.InstancedMesh(geo, mat, MR.cap)); m.name = 'world-voice-marks'; m.count = 0; m.visible = false; m.frustumCulled = false; m.renderOrder = 2;
    const pm = new THREE.MeshStandardMaterial({ color: '#4a3826', roughness: 0.95 });
    const p = (this.posts = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), pm, MR.cap)); p.name = 'world-voice-posts'; p.count = 0; p.visible = false; p.frustumCulled = false;
    this.g.scene.add(m); this.g.scene.add(p);
    return m;
  }

  // ---- making marks ---------------------------------------------------------------------------------------------------
  add(o) {
    const key = o.key;
    if (key && this.byKey.has(key)) return this.byKey.get(key);
    const K = MARK_KINDS[o.kind];
    const m = { id: `mk${this.list.length + 1}`, kind: o.kind, lines: o.lines, color: o.color ?? PAINT.red, style: o.style ?? null, place: o.place ?? null,
      x: r1(o.x), z: r1(o.z), on: o.on ?? K.on[0], face: o.face ?? 0, w: o.w ?? K.w, h: o.h ?? K.h, y: o.y ?? null, wall: o.wall ?? null,
      cause: o.cause, by: o.by ?? null, at: r1(this.hours()), n: o.n ?? 0, key, v: 1 };
    this.list.push(m); if (key) this.byKey.set(key, m);
    this.stats.made++; this.stats[{ tag: 'tags', tally: 'tallies', warning: 'warnings', dontgo: 'dontgo', grave: 'graves', ash: 'ash' }[m.kind]]++;
    this.dirty = true;
    this.g.emit?.('markMade', { id: m.id, kind: m.kind, place: m.place, text: m.lines.join(' / '), cause: m.cause });
    return m;
  }
  hours() { return this.g.pulls?.k?.hours?.() ?? (this.g.society?.day ?? 0) * 24 + (this.g.sky?.time ?? 0); }
  ground(x, z) { return this.g.rites?.ground?.(x, z) ?? 0; }
  tagOf(fid) {
    const T = TAGS[fid];
    if (T) return T;
    const F = FACTIONS[fid], name = F?.name ?? fid ?? '?', ini = name.replace(/^The /, '').split(/\s+/).map((w) => w[0]).join('').slice(0, 3).toUpperCase();
    return { text: ini || '?', word: name.replace(/^The /, '').toUpperCase(), color: F?.color && !purple(F.color) ? F.color : TAGS._.color, scrawl: 'cross' };
  }
  placeAt(id) {
    const g = this.g, R = g.citygen?.byId?.get(id);
    if (R) return { id, name: R.name, x: R.x, z: R.z, r: R.half ?? 60, rec: R };
    const P = g.society?.places?.[id];
    if (!P) return null;
    if (P.circle) return { id, name: P.name, x: P.circle[0], z: P.circle[1], r: P.circle[2] ?? 60 };
    if (P.rect) return { id, name: P.name, x: (P.rect[0] + P.rect[2]) / 2, z: (P.rect[1] + P.rect[3]) / 2, r: Math.max(P.rect[2] - P.rect[0], P.rect[3] - P.rect[1]) / 2 };
    return null;
  }
  // The walls of a place you can paint on: building faces with no door on them, south faces first (the camera's side).
  walls(P) {
    const g = this.g, out = [];
    const towns = g.citygen?.live ? [...g.citygen.live.values()] : [];
    for (const t of towns) {
      if (Math.hypot(t.rec.x - P.x, t.rec.z - P.z) > P.r + 120) continue;
      for (const B of t.T.buildings) {
        if (B.outbuilding && out.length > 6) continue;
        for (const side of ['S', 'E', 'W', 'N']) {
          if (side === B.front || B.doors?.some((d) => d.side === side)) continue;
          const len = side === 'N' || side === 'S' ? B.x1 - B.x0 : B.z1 - B.z0;
          if (len < 4) continue;
          out.push({ B, side, len, y0: (t.rec.y ?? 0) });
        }
      }
    }
    out.sort((a, b) => (a.side === 'S' ? 0 : 1) - (b.side === 'S' ? 0 : 1));
    return out;
  }
  // A spot on wall w for mark n of a cause: along the wall, at chest height, a hand's width off it.
  onWall(w, h, mw) {
    const B = w.B, t = 0.2 + ((h >>> 3) % 600) / 1000, off = 0.06;
    let x, z, face;
    if (w.side === 'S') { x = B.x0 + (B.x1 - B.x0) * t; z = B.z1 + off; face = 0; }
    else if (w.side === 'N') { x = B.x0 + (B.x1 - B.x0) * t; z = B.z0 - off; face = Math.PI; }
    else if (w.side === 'E') { x = B.x1 + off; z = B.z0 + (B.z1 - B.z0) * t; face = Math.PI / 2; }
    else { x = B.x0 - off; z = B.z0 + (B.z1 - B.z0) * t; face = -Math.PI / 2; }
    return { x, z, face, y: w.y0 + 1.45 + (mw > 2 ? 0.25 : 0), wall: `${B.id}:${w.side}` };
  }
  // Where a mark of `kind` for place P goes (the k-th of its cause). wall -> a real wall when the place is built near
  // you, else paint on the ground; ground -> the street near its centre; board -> at its edge, on the road side.
  spot(P, kind, k, seed, toward = null) {
    const K = MARK_KINDS[kind], on = K.on[k % K.on.length], h = hashS(`${seed}|${k}`);
    if (on === 'wall') {
      const W = this.walls(P);
      if (W.length) { const w = W[(h + k * 7) % Math.min(W.length, 12)]; return { on, ...this.onWall(w, h, K.w) }; }
    }
    const a = toward !== null ? toward : ((h % 360) * Math.PI) / 180, rr = on === 'board' ? Math.max(18, P.r * 0.8) : Math.min(P.r * 0.45, 14 + (h % 14));
    const x = P.x + Math.sin(a) * rr, z = P.z - Math.cos(a) * rr;
    return { on: on === 'wall' ? 'ground' : on, x, z, face: 0, y: null };
  }

  // A place raided, taken or fallen: the raiders' tag (row: the chronicle row; fid: the raiders' faction).
  tag(row, fid) {
    const P = this.placeAt(row.p); if (!P || !fid) return [];
    const T = this.tagOf(fid), n = MR.tagsPerRaid[0] + (row.seq % (MR.tagsPerRaid[1] - MR.tagsPerRaid[0] + 1)), out = [];
    for (let k = 0; k < n; k++) {
      const s = this.spot(P, 'tag', k, `tag|${row.seq}`);
      out.push(this.add({ kind: 'tag', key: `tag|${row.seq}|${k}`, lines: [T.text, T.word], color: T.color, style: T.scrawl, place: P.id, ...s, cause: { type: 'chronicle', seq: row.seq, v: row.v }, by: fid }));
    }
    return out;
  }
  // Deaths at a place, counted: one tally per place that grows with every kill row for it.
  tally(row) {
    const P = this.placeAt(row.p); if (!P) return null;
    let m = this.byKey.get(`tally|${P.id}`);
    const add = row.v === 'raided' ? Math.max(1, (/(\d+) dead/.exec(row.on ?? '')?.[1] | 0)) : row.v === 'skirmish' ? Math.max(1, Math.round(row.m ?? 1)) : 1;
    if (!m) { const s = this.spot(P, 'tally', 0, `tally|${P.id}`); m = this.add({ kind: 'tally', key: `tally|${P.id}`, lines: ['tally'], color: PAINT.chalk, place: P.id, ...s, cause: { type: 'chronicle', seq: row.seq, v: row.v, rows: [] }, n: 0 }); }
    m.n = Math.min(MR.tallyMax, m.n + add); m.cause.rows.push(row.seq); if (m.cause.rows.length > 40) m.cause.rows.shift(); m.v++;
    this.repaint(m);
    return m;
  }
  // A town that holds news of a fall paints a warning on its road edge, pointing at it.
  dontGo(town, fact, P, dead = false) {
    const key = `dontgo|${town.id}|${P.id}`;
    if (this.byKey.has(key)) return this.byKey.get(key);
    const b = bearingOf(P.x - town.x, P.z - town.z), a = (b.deg * Math.PI) / 180;
    const T = dead ? MARK_TEXT.dontgoDead : MARK_TEXT.dontgo, fill = (s) => s.replace('{DIR}', DIRNAME[b.dir]).replace('{PLACE}', (P.name ?? 'IT').toUpperCase());
    const S = this.spot({ x: town.x, z: town.z, r: this.placeAt(town.id)?.r ?? 60 }, 'dontgo', 0, key, a);
    return this.add({ kind: 'dontgo', key, lines: T.map(fill), color: PAINT.white, style: b.dir, place: town.id, ...S, cause: { type: 'fact', fact: fact.id, holder: `town:${town.id}`, heard: fact.heard }, by: town.id });
  }
  warning(P, what, cause) {
    const key = `warn|${P.id}|${what}`;
    if (this.byKey.has(key)) return this.byKey.get(key);
    const S = this.spot(P, 'warning', 0, key);
    return this.add({ kind: 'warning', key, lines: MARK_TEXT.warning[what], color: what === 'dead' ? PAINT.red : PAINT.white, place: P.id, ...S, cause });
  }
  grave(gr) {
    const key = `grave|${gr.id}`;
    if (this.byKey.has(key)) return this.byKey.get(key);
    const how = MARK_TEXT.how[gr.cause] ?? MARK_TEXT.how._, by = gr.by ? (FACTIONS[gr.by]?.name ?? (gr.by === 'player' ? 'A STRANGER' : String(gr.by))).toUpperCase() : null;
    const lines = [(gr.name ?? 'NO NAME').toUpperCase(), by ? `${how} ${MARK_TEXT.by.replace('{BY}', by)}` : how];
    return this.add({ kind: 'grave', key, lines, color: PAINT.chalk, place: gr.cem ?? null, x: gr.x + 0.9, z: gr.z + 0.35, on: 'board', cause: { type: 'grave', grave: gr.id } });
  }
  ash(x, z, fire) { return this.add({ kind: 'ash', key: `ash|${fire}`, lines: [''], color: '#2a2520', x, z, on: 'ground', cause: { type: 'campfire', fire } }); }

  // ---- reading the world ------------------------------------------------------------------------------------------------
  readChronicle() {
    const C = this.g.society?.chronicle; if (!C) return;
    if (this.cursor === null) { this.cursor = C.seq; return; }
    if (C.seq <= this.cursor) return;
    const rows = C.query({ since: this.cursor, limit: 40 });
    this.cursor = C.seq;
    for (let i = rows.length - 1; i >= 0; i--) {
      const r = rows[i];
      if (r.src === 'rumor' || !r.p) continue;
      const f = MR.tagVerbs[r.v]; if (f && r[f]) this.tag(r, r[f]);
      if (MR.tallyVerbs.includes(r.v)) this.tally(r);
    }
  }
  // Near you (slow): overrun towns warn, story problems warn, towns that hold news of a fall paint DON'T GO, new graves.
  survey() {
    const g = this.g, p = g.player, me = { x: p.x, z: p.z };
    for (const R of g.citygen?.plan ?? []) {
      if (Math.abs(R.x - me.x) > 2500 || Math.abs(R.z - me.z) > 2500) continue;
      if (R.state === 'overrun') this.warning(this.placeAt(R.id), 'dead', { type: 'state', place: R.id, state: 'overrun' });
    }
    for (const S of g.stories?.places?.values?.() ?? []) {
      const w = S.problem && MR.warnFor[S.problem.id ?? S.problem]; if (!w || Math.abs(S.x - me.x) > 2500 || Math.abs(S.z - me.z) > 2500) continue;
      const P = this.placeAt(S.id) ?? { id: S.id, name: S.name, x: S.x, z: S.z, r: 50 };
      this.warning(P, w, { type: 'story', place: S.id, problem: S.problem.id ?? S.problem });
    }
    // DON'T GO: only from what the painting town holds (law 6).
    const k = g.pulls?.k;
    for (const n of g.pulls?.nodes?.() ?? []) {
      if (Math.abs(n.x - me.x) > 3000 || Math.abs(n.z - me.z) > 3000) continue;
      const H = k?.holders.get(`town:${n.id}`); if (!H) continue;
      for (const c of H.facts) {
        const v = c.what === 'news' ? k.fact(c.id)?.data?.v : c.what === 'story' ? (/fallen|fell/i.test(c.text) ? 'fell' : null) : null;
        if (!v || !['fell', 'took', 'raided'].includes(v)) continue;
        const pid = c.where?.place ?? k.fact(c.id)?.data?.place ?? null, P = pid ? this.placeAt(pid) : null;
        if (!P || P.id === n.id || Math.hypot(P.x - n.x, P.z - n.z) > MR.dontgoR) continue;
        this.dontGo(n, c, P, false);
      }
      // a town that saw a neighbour overrun (its own people walked past it) warns of it too
      for (const R of g.citygen?.plan ?? []) if (R.state === 'overrun' && R.id !== n.id && Math.hypot(R.x - n.x, R.z - n.z) < 2600 && k?.holders.get(`town:${n.id}`)?.facts.some((c) => c.where?.place === R.id)) this.dontGo(n, { id: `overrun:${R.id}`, heard: null }, this.placeAt(R.id), true);
    }
    let gn = 0;
    for (let i = (g.rites?.graves?.length ?? 0) - 1; i >= 0 && gn < MR.graveWords * 4; i--) {
      const gr = g.rites.graves[i];
      if (!gr.name || gr.marker === 'ash' || Math.abs(gr.x - me.x) > MR.near || Math.abs(gr.z - me.z) > MR.near) continue;
      this.grave(gr); gn++;
    }
  }

  // ---- drawing ----------------------------------------------------------------------------------------------------------
  slotFor(m) {
    let s = this.slots.get(m.id);
    if (s !== undefined) return s;
    s = this.slotOwner.indexOf(null);
    if (s < 0) { // evict a slot whose mark is not near
      const nearIds = new Set(this.near.map((x) => x.id));
      s = this.slotOwner.findIndex((id) => !nearIds.has(id));
      if (s < 0) return -1;
      this.slots.delete(this.slotOwner[s]);
    }
    this.slotOwner[s] = m.id; this.slots.set(m.id, s); m.pv = 0;
    return s;
  }
  repaint(m) { m.pv = -1; this.dirty = true; }
  paint(m, s) {
    const g = this.ctx2; if (!g) return;
    const x = (s % COLS) * SLOT_W, y = Math.floor(s / COLS) * SLOT_H, w = SLOT_W, h = SLOT_H, hs = hashS(m.id);
    let r = hs; const rnd = () => ((r = Math.imul(r ^ (r >>> 15), 2246822507) >>> 0) % 10000) / 10000;
    g.save(); g.clearRect(x, y, w, h); g.beginPath(); g.rect(x, y, w, h); g.clip();
    const board = m.on === 'board';
    if (board) {
      g.fillStyle = PAINT.board; g.fillRect(x + 4, y + 6, w - 8, h - 12);
      for (let k = 0; k < 4; k++) { g.fillStyle = `rgba(30,20,10,${0.18 + rnd() * 0.12})`; g.fillRect(x + 4, y + 6 + k * (h - 12) / 4, w - 8, 2); }
      g.strokeStyle = PAINT.boardEdge; g.lineWidth = 4; g.strokeRect(x + 5, y + 7, w - 10, h - 14);
    }
    const font = (px, wgt = 900) => `${wgt} ${px}px "Impact", "Haettenschweiler", "Arial Narrow", "Arial Black", sans-serif`;
    const spray = (text, cx, cy, px, color) => {
      g.font = font(px); g.textAlign = 'center'; g.textBaseline = 'middle';
      while (g.measureText(text).width > w - 20 && px > 10) { px -= 2; g.font = font(px); }
      g.fillStyle = color; g.globalAlpha = 0.25; g.fillText(text, cx + 2, cy + 2); g.globalAlpha = 0.92; g.fillText(text, cx, cy); g.globalAlpha = 1;
      if (!board) for (let k = 0; k < 5; k++) { const dx = cx + (rnd() - 0.5) * g.measureText(text).width * 0.9; g.fillStyle = color; g.globalAlpha = 0.7; g.fillRect(dx, cy + px * 0.3, 2, 6 + rnd() * px * 0.5); g.globalAlpha = 1; } // drips
    };
    if (m.kind === 'tally') {
      g.strokeStyle = m.color; g.lineWidth = 5; g.lineCap = 'round';
      const n = m.n, per = 5, gw = 44, rowsN = Math.ceil(n / 25) || 1;
      for (let i = 0; i < n; i++) {
        const grp = Math.floor(i / per), j = i % per, gx = x + 14 + (grp % 5) * gw, gy = y + 12 + Math.floor(grp / 5) * (h - 24) / Math.max(rowsN, 2);
        const gh = (h - 24) / Math.max(rowsN, 2) - 6, jx = rnd() * 2 - 1;
        g.beginPath();
        if (j < 4) { g.moveTo(gx + j * 8 + jx, gy); g.lineTo(gx + j * 8 - jx, gy + gh); }
        else { g.moveTo(gx - 4, gy + gh * 0.85); g.lineTo(gx + 32, gy + gh * 0.15); }
        g.stroke();
      }
    } else if (m.kind === 'ash') {
      const cx = x + h / 2, cy = y + h / 2, R = h * 0.42;
      const grd = g.createRadialGradient(cx, cy, 2, cx, cy, R); grd.addColorStop(0, 'rgba(20,18,16,0.95)'); grd.addColorStop(0.6, 'rgba(46,40,34,0.85)'); grd.addColorStop(1, 'rgba(46,40,34,0)');
      g.fillStyle = grd; g.beginPath(); g.arc(cx, cy, R, 0, 6.3); g.fill();
      for (let k = 0; k < 9; k++) { const a = k / 9 * 6.28 + rnd() * 0.3; g.fillStyle = `rgb(${110 + rnd() * 40},${104 + rnd() * 30},${94 + rnd() * 20})`; g.beginPath(); g.ellipse(cx + Math.cos(a) * R * 0.86, cy + Math.sin(a) * R * 0.86, 7, 5, a, 0, 6.3); g.fill(); }
    } else if (m.kind === 'tag') {
      spray(m.lines[0], x + w * 0.5, y + h * 0.4, 74, m.color);
      g.strokeStyle = m.color; g.lineWidth = 4; g.globalAlpha = 0.85; g.beginPath();
      if (m.style === 'teeth') for (let k = 0; k < 6; k++) { g.moveTo(x + 40 + k * 30, y + h * 0.8); g.lineTo(x + 55 + k * 30, y + h * 0.95); g.lineTo(x + 70 + k * 30, y + h * 0.8); }
      else if (m.style === 'star') { const cx = x + w * 0.86, cy = y + h * 0.25; for (let k = 0; k < 5; k++) { const a = -Math.PI / 2 + k * 4 * Math.PI / 5; g[k ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * 18, cy + Math.sin(a) * 18); } g.closePath(); }
      else if (m.style === 'arrow') { g.moveTo(x + 30, y + h * 0.88); g.lineTo(x + w - 40, y + h * 0.88); g.lineTo(x + w - 58, y + h * 0.78); }
      else { g.moveTo(x + 30, y + h * 0.86); g.lineTo(x + w - 30, y + h * 0.86); }
      g.stroke(); g.globalAlpha = 1;
      g.font = font(20, 700); g.fillStyle = m.color; g.textAlign = 'center'; g.fillText(m.lines[1] ?? '', x + w / 2, y + h * 0.7);
    } else {
      const two = m.lines.length > 1 && m.lines[1];
      spray(m.lines[0], x + w / 2, y + h * (two ? 0.36 : 0.5), two ? 40 : 52, m.color);
      if (two) spray(m.lines[1], x + w / 2, y + h * 0.72, 26, m.kind === 'dontgo' ? PAINT.red : m.color);
      if (m.kind === 'dontgo') { g.strokeStyle = PAINT.red; g.lineWidth = 6; g.beginPath(); g.moveTo(x + 18, y + h - 18); g.lineTo(x + 70, y + h - 18); g.lineTo(x + 58, y + h - 28); g.stroke(); }
    }
    g.restore();
    m.pv = m.v; this.stats.painted++;
    this.texDirty = true;
  }
  draw() {
    const M = this.gpu(); if (!M) return;
    const p = this.g.player;
    this.near.length = 0;
    for (const m of this.list) if (Math.abs(m.x - p.x) < MR.near && Math.abs(m.z - p.z) < MR.near) { this.near.push(m); if (this.near.length >= MR.cap) break; }
    let n = 0, posts = 0;
    for (const m of this.near) {
      const s = this.slotFor(m); if (s < 0) continue;
      if (m.pv !== m.v) this.paint(m, s);
      const sq = m.kind === 'ash', u = (s % COLS) / COLS, v = 1 - (Math.floor(s / COLS) + 1) / ROWS;
      this.rect.setXYZW(n, u, v, (sq ? SLOT_H / SLOT_W : 1) / COLS, 1 / ROWS);
      const gy = m.y ?? this.ground(m.x, m.z);
      if (m.on === 'wall') { _e.set(0, m.face, 0); _p.set(m.x, gy, m.z); _s.set(m.w, m.h, 1); }
      else if (m.on === 'ground') { _e.set(-Math.PI / 2, 0, (m.face ?? 0), 'XYZ'); _p.set(m.x, gy + 0.04, m.z); _s.set(m.w, m.h, 1); }
      else { _e.set(-0.95, m.face ?? 0, 0, 'YXZ'); _p.set(m.x, gy + (m.kind === 'grave' ? 0.42 : 0.85), m.z); _s.set(m.w, m.h, 1); } // a board leaned back to the sky
      _q.setFromEuler(_e); _m.compose(_p, _q, _s); M.setMatrixAt(n, _m);
      if (m.on === 'board' && posts < MR.cap - 1) for (const sx of [-0.4, 0.4]) { _e.set(0, 0, 0); _q.setFromEuler(_e); _p.set(m.x + sx * m.w, gy + (m.kind === 'grave' ? 0.25 : 0.5), m.z - 0.12); _s.set(0.09, m.kind === 'grave' ? 0.5 : 1, 0.09); _m.compose(_p, _q, _s); this.posts.setMatrixAt(posts++, _m); }
      _e.order = 'XYZ';
      n++;
    }
    M.count = n; M.visible = n > 0; M.instanceMatrix.needsUpdate = true; this.rect.needsUpdate = true;
    this.posts.count = posts; this.posts.visible = posts > 0; this.posts.instanceMatrix.needsUpdate = true;
    if (this.texDirty) { this.tex.needsUpdate = true; this.texDirty = false; }
    this.at.x = p.x; this.at.z = p.z; this.dirty = false;
  }

  update(dt) {
    if (!this.on || !this.g.player) return;
    this.readChronicle();
    if ((this.scanT -= dt) <= 0) { this.scanT = 3; this.survey(); }
    const p = this.g.player;
    if (this.dirty || Math.abs(p.x - this.at.x) > MR.redraw || Math.abs(p.z - this.at.z) > MR.redraw) this.draw();
  }
  find(o = {}) { return this.list.filter((m) => (!o.kind || m.kind === o.kind) && (!o.place || m.place === o.place)); }
  view(m) { return { id: m.id, kind: m.kind, text: m.lines.join(' / '), n: m.n || undefined, place: m.place, on: m.on, x: m.x, z: m.z, wall: m.wall, by: m.by, cause: m.cause, at: m.at, color: m.color }; }
  save() { return { list: this.list.map((m) => ({ ...m, pv: undefined })), cursor: this.cursor }; }
  load(s) {
    this.list = []; this.byKey.clear(); this.slots.clear(); this.slotOwner.fill(null);
    if (!s) return;
    for (const m of s.list ?? []) { const c = { ...m, pv: -1 }; this.list.push(c); if (c.key) this.byKey.set(c.key, c); }
    this.cursor = s.cursor ?? null; this.dirty = true;
  }
}
