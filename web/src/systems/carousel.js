import * as THREE from 'three';
import { RING, SICK, JUMP_KINDS, STATIONS, KEY_ITEM, KEYS_EXTRA, keyId, KEY_LOOT, KEY_SEED, KEY_TRADE, RINGBORN } from '../data/carousel.js';
import { ITEMS, LOOT } from '../data/items.js';
import { UG_LOOT } from '../data/underground.js';
import { TRADERS } from '../data/trade.js';
import { ATLAS_XZ } from '../data/atlas.js';
import { CREW_BY_ID } from '../data/crew.js';
import { STREAM } from '../data/streaming.js';
import { genLevel } from '../world/undergen.js';
import { CarouselUI } from '../ui/carousel.js';

// THE CAROUSEL at runtime (docs/design/WEB_CAROUSEL.md; rows in data/carousel.js). A station is an underground site of
// kind `station` (systems/underground.js builds and runs it: the hatch, the levels, the generator, the keyed blast door,
// the dead who live there, the logs that teach the ring's code); this file is the machine in its deepest room:
//   - the ring's look, one set of meshes moved to the live station's ring room (6 draw calls, no lights: it glows with
//     its own colours under the underground's dark), reading its state - dormant, pending, armed, spinning (building,
//     then frantic), live, catching (the afterglow of an arrival);
//   - the console (E at either console in the ring room: ui/carousel.js): arm the ring with its code, then PAIR (a key you
//     carry), ROULETTE (a ring in another streamed region, sometimes badly), BACKSPIN (the last ring, no key, +1 stack);
//   - the throw: you, the crew on the deck's level within RING.crewR, your dogs - never a vehicle (your rig stays where
//     you left it, recorded with its state) - stood round the far ring; its blast door grinds open after a breath of black;
//   - ring-sickness (WEB_DEATHLANDS_GAP §4.5): stacks fold into the REST look (systems/survival.js reads sickFx()), the
//     screen sways and its edges swim, one stack goes every 20 game minutes of rest;
//   - access keys as items (looted, traded, cut by a keycutter at a console), Ring-born (a new game that opens mid-throw),
//     and a save of all of it.
// No per-frame allocations: every colour and vector the frame needs is made here once.

const _c = new THREE.Color(), _o = new THREE.Object3D();
const BOARD_WORDS = { dormant: 'NO POWER', pending: 'STANDBY - CODE', armed: 'ARMED - READY', building: 'SPINNING UP', frantic: 'SPIN CRITICAL', live: 'THROW', catching: 'RECEIVING' };
const r1 = (v) => Math.round(v * 10) / 10;
const title = (s) => s.toLowerCase().replace(/(^|\s|-)([a-z])/g, (m, a, b) => a + b.toUpperCase());

export class Carousel {
  constructor(game, root) {
    const g = this.g = game;
    this.W = g.streamer?.W ?? null;
    // ---- rows into the shared tables (items, loot, trade) ----
    for (const S of STATIONS) ITEMS[keyId(S.id)] ??= { ...KEY_ITEM, tags: [...KEY_ITEM.tags], name: `Ring key: ${title(S.name)}`, station: S.id,
      desc: `A stamped steel bar with a ring's plate cut into its end: ${S.name}. On that ring's console it is the way home; on any other it is a destination.` };
    for (const [k, X] of Object.entries(KEYS_EXTRA)) ITEMS[k] ??= X;
    for (const [t, T] of Object.entries(KEY_LOOT)) {
      const row = { ...T, rows: T.rows.map(([id, ...r]) => [id.startsWith('key:') ? keyId(id.slice(4)) : id, ...r]) };
      UG_LOOT[t] ??= row; LOOT[t] ??= UG_LOOT[t];
    }
    for (const [t, r] of KEY_SEED) { const T = LOOT[t]; if (T && !T.rows.some((x) => x[0] === r[0])) T.rows.push([...r]); }
    for (const [who, keeps] of Object.entries(KEY_TRADE.keeps)) { const T = TRADERS[who]; if (!T) continue; T.keeps ??= []; for (const k of keeps) if (!T.keeps.some((x) => x[0] === k[0])) T.keeps.push([...k]); }
    // ---- the stations: where each one is, whether the streamer lays out its region, its underground site ----
    this.stations = STATIONS.map((S) => this.resolve(S));
    this.byId = new Map(this.stations.map((s) => [s.id, s]));
    const U = g.under;
    for (const s of this.stations) {
      if (!s.reach) continue;
      s.site = { id: `ring_${s.id}`, name: s.name, kind: 'station', entrance: 'hatch', x: s.x, z: s.z, dir: s.row.dir, levels: 2, seed: s.row.seed,
        power: false, fuel: s.row.fuel ?? 0, place: true, station: s.id };
      if (U && !U.byId.has(s.site.id)) { U.sites.push(s.site); U.byId.set(s.site.id, s.site); }
    }
    // ---- state (the save) ----
    this.reset();
    this.spin = null;         // the live throw: { kind, to, from, t, bad }
    this.catchT = 0;          // the arrival ring's afterglow
    this.cold = null;         // the cold-open after an arrival: { t, door, station, ringborn }
    this.lastH = null; this.calmT = 0; this.calm = true; this.downed = [];
    this.counts = { throws: 0, bad: 0, aborted: 0, keysCut: 0, arms: 0 };
    this.fx = { spread: 1, vig: 0, micro: false };
    this.ui = new CarouselUI(g, root, this);
    this.buildLook();
    this.live = null;         // { station, P, room, cx, cz, y, consoles, door }
    this.attachTitle();
  }

  reset() {
    this.st = { last: null, known: [], armed: [], sick: 0, restMin: 0, rig: null, ringborn: false, throws: 0, bad: 0 };
    this.spin = null; this.catchT = 0; this.cold = null;
  }

  // Where a row stands (world metres) and whether the world lays it out.
  resolve(S) {
    let xz = null;
    if (S.at) xz = { x: S.at[0], z: S.at[1] };
    else if (S.near) { const H = this.W?.holdouts?.find((h) => h.id === S.near); if (H) xz = { x: H.cx + S.d[0], z: H.cz + S.d[1] }; }
    else if (S.base) { const v = ATLAS_XZ.bases?.[S.base]; if (v) xz = { x: v[0], z: v[1] }; }
    const reach = !!xz && !!this.W && this.W.inWorld(xz.x, xz.z, -200);
    const region = !xz || !this.W ? null : this.W.regionOf(xz.x, xz.z)?.id ?? (Math.hypot(xz.x, xz.z) < STREAM.dustWall ? 'arizona' : null);
    return { id: S.id, name: S.name, row: S, x: xz?.x ?? NaN, z: xz?.z ?? NaN, reach, region: region ?? S.region, site: null };
  }

  // ---- the look -------------------------------------------------------------------------------------------------------
  buildLook() {
    const L = RING.look, R = RING.platformR, grp = this.group = new THREE.Group();
    grp.visible = false; grp.name = 'carousel-ring';
    const lam = (c) => new THREE.MeshLambertMaterial({ color: c });
    this.cDim = new THREE.Color(L.dim); this.cGlow = new THREE.Color(L.glow); this.cHot = new THREE.Color(L.hot); this.cOff = new THREE.Color('#000000');
    // the deck: a low round platform, its edge a strip that glows with the ring's state
    const deck = new THREE.Mesh(new THREE.CylinderGeometry(R, R + 0.15, 0.1, 48), lam(L.deck));
    deck.position.y = 0.05; grp.add(deck);
    this.edgeMat = new THREE.MeshBasicMaterial({ color: L.dim });
    const edge = new THREE.Mesh(new THREE.TorusGeometry(R + 0.04, 0.07, 6, 64).rotateX(Math.PI / 2), this.edgeMat);
    edge.position.y = 0.12; grp.add(edge);
    // the ring itself, hanging over the deck, and eight pylons holding it (one instanced draw)
    this.haloMat = new THREE.MeshLambertMaterial({ color: L.halo, emissive: '#000000' });
    this.halo = new THREE.Mesh(new THREE.TorusGeometry(R - 0.25, 0.2, 8, 56).rotateX(Math.PI / 2), this.haloMat);
    this.halo.position.y = 2.45; grp.add(this.halo);
    this.pylonMat = new THREE.MeshLambertMaterial({ color: L.pylon, emissive: '#000000' });
    const py = new THREE.InstancedMesh(new THREE.BoxGeometry(0.32, 2.5, 0.32), this.pylonMat, 8);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + Math.PI / 8; _o.position.set(Math.cos(a) * (R + 0.05), 1.25, Math.sin(a) * (R + 0.05)); _o.rotation.set(0, -a, 0); _o.updateMatrix(); py.setMatrixAt(i, _o.matrix); }
    grp.add(py);
    // the vortex: a spiral painted once, turned and faded by the state (additive, no depth write)
    const cv = document.createElement('canvas'); cv.width = cv.height = 256;
    const x = cv.getContext('2d');
    const core = x.createRadialGradient(128, 128, 4, 128, 128, 126);
    core.addColorStop(0, 'rgba(255,241,200,0.95)'); core.addColorStop(0.25, 'rgba(255,154,46,0.55)'); core.addColorStop(0.7, 'rgba(120,60,16,0.25)'); core.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = core; x.fillRect(0, 0, 256, 256);
    // seven thin, uneven arms of light, smeared (a storm in a drain, not a target); a fixed seed so every page draws the same
    let sd = 7103; const rnd = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
    x.filter = 'blur(3px)'; x.globalCompositeOperation = 'lighter'; x.lineCap = 'round';
    for (let arm = 0; arm < 7; arm++) {
      const a0 = (arm / 7) * Math.PI * 2 + rnd() * 0.5, twist = 2.2 + rnd() * 1.2, w = 1.5 + rnd() * 3;
      for (let s = 0; s < 60; s++) {
        const t0 = s / 60, t1 = (s + 1) / 60, ra = 8 + t0 * 112, rb = 8 + t1 * 112, aa = a0 + t0 * Math.PI * twist, ab = a0 + t1 * Math.PI * twist;
        x.strokeStyle = `rgba(${255},${200 - 110 * t0 | 0},${120 - 100 * t0 | 0},${0.75 * (1 - t0) * (0.6 + 0.4 * rnd())})`;
        x.lineWidth = w * (1.4 - t0);
        x.beginPath(); x.moveTo(128 + Math.cos(aa) * ra, 128 + Math.sin(aa) * ra); x.lineTo(128 + Math.cos(ab) * rb, 128 + Math.sin(ab) * rb); x.stroke();
      }
    }
    x.filter = 'none'; x.globalCompositeOperation = 'source-over';
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    this.vortexMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.vortex = new THREE.Mesh(new THREE.CircleGeometry(R - 0.35, 48).rotateX(-Math.PI / 2), this.vortexMat);
    this.vortex.position.y = 1.15; this.vortex.renderOrder = 2; grp.add(this.vortex);
    // the status boards: one canvas, laid on the two consoles' tops (one instanced draw)
    this.boardCv = document.createElement('canvas'); this.boardCv.width = 512; this.boardCv.height = 192;
    this.boardTex = new THREE.CanvasTexture(this.boardCv); this.boardTex.colorSpace = THREE.SRGBColorSpace;
    this.boards = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.8, 0.62), new THREE.MeshBasicMaterial({ map: this.boardTex }), 2);
    this.boards.frustumCulled = false; grp.add(this.boards);
    this.boardKey = '';
    for (const m of grp.children) { m.castShadow = false; m.receiveShadow = false; }
    this.g.scene.add(grp);
  }

  paintBoard(lines, live) {
    const key = lines.join('|') + live;
    if (key === this.boardKey) return;
    this.boardKey = key;
    const x = this.boardCv.getContext('2d'), L = RING.look;
    x.fillStyle = L.board; x.fillRect(0, 0, 512, 192);
    x.strokeStyle = live ? L.boardText : L.boardDead; x.lineWidth = 6; x.strokeRect(6, 6, 500, 180);
    x.fillStyle = live ? L.boardText : L.boardDead; x.font = 'bold 44px monospace'; x.textBaseline = 'top';
    lines.forEach((s, i) => x.fillText(s.slice(0, 20), 22, 20 + i * 56));
    this.boardTex.needsUpdate = true;
  }

  // The ring room of a promoted station level: its centre (the core pylon), its consoles, its door.
  ringOf(P) {
    const L = P.L, room = L.rooms.find((r) => r.type === 'ringdeck' || r.type === 'ringroom');
    if (!room) return null;
    const inR = (q) => (q.x0 + q.x1) / 2 > room.x0 && (q.x0 + q.x1) / 2 < room.x1 && (q.z0 + q.z1) / 2 > room.z0 && (q.z0 + q.z1) / 2 < room.z1;
    const core = L.props.find((q) => q.kind === 'pylon' && inR(q));
    const cx = core ? (core.x0 + core.x1) / 2 : (room.x0 + room.x1) / 2, cz = core ? (core.z0 + core.z1) / 2 : (room.z0 + room.z1) / 2;
    const consoles = L.props.filter((q) => q.kind === 'console' && inR(q)).map((q) => ({ x: (q.x0 + q.x1) / 2, z: (q.z0 + q.z1) / 2, along: q.x1 - q.x0 >= q.z1 - q.z0, h: q.h }));
    const door = P.doors.find((d) => d.room === room.id) ?? null;
    return { P, room, cx, cz, y: L.y, consoles, door };
  }

  // The station you stand in now, live (its ring level promoted), or null.
  liveStation() {
    const A = this.g.under?.A;
    if (!A?.site.station) return null;
    const s = this.byId.get(A.site.station), P = A.levels.get(2);
    if (!s || !P) return null;
    if (this.live?.P !== P) {
      const R = this.ringOf(P);
      this.live = R ? { station: s, ...R } : null;
      if (this.live) this.placeLook(this.live);
    }
    return this.live;
  }

  placeLook(R) {
    this.group.position.set(R.cx, R.y, R.cz);
    for (let i = 0; i < 2; i++) {
      const c = R.consoles[i] ?? R.consoles[0];
      if (!c) { _o.position.set(0, -50, 0); _o.updateMatrix(); this.boards.setMatrixAt(i, _o.matrix); continue; }
      _o.position.set(c.x - R.cx, c.h + 0.04, c.z - R.cz);
      _o.rotation.set(-Math.PI / 2, 0, c.along ? 0 : Math.PI / 2);
      _o.updateMatrix(); this.boards.setMatrixAt(i, _o.matrix);
    }
    this.boards.instanceMatrix.needsUpdate = true;
    this.boardKey = ''; this.board = null;
  }

  // ---- the state a ring is in (what the look and the console read) ----------------------------------------------------
  rec(s) { return s?.site ? this.g.under.rec(s.site) : null; }
  powered(s) { return !!this.rec(s)?.power; }
  codeKnown(s) { return !!this.rec(s)?.codes.includes('ring'); }
  code(s) { return this.g.under.codes(s.site).ring; }
  armed(s) { return this.st.armed.includes(s.id) && this.powered(s); }
  stateOf(s) {
    if (this.spin && this.spin.from === s.id) return this.spin.t < RING.spin * RING.build ? 'building' : this.spin.t < RING.spin ? 'frantic' : 'live';
    if (this.catchT > 0 && this.cold?.station === s.id) return 'catching';
    if (!this.powered(s)) return 'dormant';
    return this.armed(s) ? 'armed' : 'pending';
  }
  keysCarried() { const inv = this.g.inventory; return this.stations.filter((s) => inv?.carried.count(keyId(s.id)) > 0).map((s) => s.id); }
  reachable(from = null) { return this.stations.filter((s) => s.reach && s.site && s.id !== from); }

  onDeck(c, R = this.live) {
    if (!R || !c) return false;
    return Math.hypot(c.x - R.cx, c.z - R.cz) < RING.platformR + 0.6 && Math.abs((c.gy ?? 0) - R.y) < 1.2;
  }

  // ---- the console --------------------------------------------------------------------------------------------------------
  // systems/underground.js playerInteract asks this first, below a station: E at a console opens the ring's panel.
  interact(p, I, dt, P) {
    const R = this.liveStation();
    if (!R || R.P !== P || this.ui.open) return null;
    let near = null, bd = RING.consoleR;
    for (const c of R.consoles) { const d = Math.hypot(c.x - p.x, c.z - p.z); if (d < bd) { bd = d; near = c; } }
    if (!near) return null;
    const ring = this._ring ?? (this._ring = { x: 0, z: 0, len: 2.4 });
    ring.x = near.x; ring.z = near.z;
    const s = R.station, st = this.stateOf(s);
    this.g.hud.prompt(`<kbd>E</kbd> The ring console · ${st === 'dormant' ? 'DEAD (no power)' : st === 'pending' ? 'STANDBY' : st === 'armed' ? 'ARMED' : st.toUpperCase()}`);
    if (I.hit('KeyE')) this.ui.show(s);
    return ring;
  }

  // The panel's rows (ui/carousel.js draws them; the agent's `carousel action=console` reads them).
  options(s) {
    const out = [], pw = this.powered(s), armed = this.armed(s), keys = this.keysCarried(), inv = this.g.inventory;
    if (this.spin) { out.push({ id: 'none', label: 'THE RING IS SPINNING', sub: 'stay on the deck', off: true }); return out; }
    if (!pw) out.push({ id: 'none', label: 'THE RING IS DARK', sub: 'nothing wakes without the station\'s generator', off: true });
    else if (!armed) out.push(this.codeKnown(s) ? { id: 'arm', label: `ARM THE RING · KEY IN ${this.code(s)}`, sub: 'everyone on the deck first' } : { id: 'none', label: 'ARM THE RING', sub: 'the console wants a code (a card somewhere below)', off: true });
    for (const k of keys) {
      if (k === s.id) continue;
      const d = this.byId.get(k);
      out.push({ id: `pair:${k}`, label: `PAIR · ${d.name}`, sub: !d.reach ? 'that ring is dark: nothing answers from there yet' : armed ? `${d.region.toUpperCase()} · you hold its key` : 'arm the ring first', off: !armed || !d.reach });
    }
    out.push({ id: 'roulette', label: 'ROULETTE', sub: armed ? 'anywhere a ring answers - far, and sometimes badly' : 'arm the ring first', off: !armed });
    const last = this.st.last && this.st.last !== s.id ? this.byId.get(this.st.last) : null;
    out.push({ id: 'backspin', label: last ? `BACKSPIN · ${last.name}` : 'BACKSPIN', sub: !last ? 'no last ring: you have not come out of one' : pw ? 'no key, no code - and it hurts (+1 ring-sick)' : 'the ring is dark', off: !last || !pw });
    if (inv?.carried.count('keycutter') > 0) out.push({ id: 'cut', label: `CUT A KEY · ${s.name}`, sub: inv.carried.count('key_blank') > 0 ? 'a blank from your pack' : 'you have no blank', off: !(inv.carried.count('key_blank') > 0) || !pw });
    out.push({ id: 'leave', label: 'LEAVE THE CONSOLE', sub: '' });
    return out;
  }

  choose(s, id) {
    if (id === 'arm') return this.arm(s);
    if (id === 'roulette') return this.start('roulette');
    if (id === 'backspin') return this.start('backspin');
    if (id === 'cut') return this.cutKey(s);
    if (id.startsWith('pair:')) return this.start('pair', id.slice(5));
    return { ok: false, why: 'nothing' };
  }

  arm(s) {
    if (!this.powered(s)) return { ok: false, why: 'the ring is dark: start the generator' };
    if (!this.codeKnown(s)) return { ok: false, why: 'the console wants a code you do not have' };
    if (!this.st.armed.includes(s.id)) this.st.armed.push(s.id);
    this.counts.arms++;
    this.g.audio?.beep?.(0); this.g.audio?.tone?.(110, 0.6, 0.12, 'sawtooth', 0.4);
    this.g.hud?.toast?.(`THE RING IS ARMED · ${s.name}`, 'job');
    this.g.emit('ringArmed', { station: s.id });
    return { ok: true, armed: s.id };
  }

  cutKey(s) {
    const inv = this.g.inventory;
    if (!this.powered(s)) return { ok: false, why: 'the plate reader is dark: start the generator' };
    if (!(inv.carried.count('keycutter') > 0)) return { ok: false, why: 'you need a keycutter\'s kit' };
    if (!(inv.carried.count('key_blank') > 0)) return { ok: false, why: 'you need a key blank' };
    inv.spend('key_blank', 1);
    inv.stow(keyId(s.id), 1);
    this.counts.keysCut++;
    this.g.hud?.toast?.(`KEY CUT · ${s.name}`, 'job');
    this.g.emit('ringKeyCut', { station: s.id });
    return { ok: true, key: keyId(s.id) };
  }

  // ---- a throw ------------------------------------------------------------------------------------------------------------
  // Starts the spin from the live station's console. The ring throws at the end of it (update), if you are still on the deck.
  start(kind, to = null) {
    const g = this.g, K = JUMP_KINDS[kind], R = this.liveStation(), p = g.player;
    if (!K) return { ok: false, why: `no kind ${kind}` };
    if (!R) return { ok: false, why: 'you are not at a ring' };
    const s = R.station;
    if (this.spin) return { ok: false, why: 'the ring is already spinning' };
    if (!this.powered(s)) return { ok: false, why: 'the ring is dark: start the generator' };
    if (K.needsCode && !this.armed(s)) return { ok: false, why: 'arm the ring first (its code)' };
    if (!this.onDeck(p, R)) return { ok: false, why: 'stand on the deck' };
    let dest = null;
    if (K.to === 'key') {
      dest = this.byId.get(to);
      if (!dest) return { ok: false, why: `no ring ${to}` };
      if (dest.id === s.id) return { ok: false, why: 'that is this ring' };
      if (!(g.inventory.carried.count(keyId(dest.id)) > 0)) return { ok: false, why: `PAIR needs ${dest.name}'s key in your pack` };
      if (!dest.reach || !dest.site) return { ok: false, why: `${dest.name} is dark: nothing answers from ${dest.region}` };
    } else if (K.to === 'last') {
      dest = this.st.last ? this.byId.get(this.st.last) : null;
      if (!dest || dest.id === s.id) return { ok: false, why: 'no last ring to spin back to' };
      if (!dest.reach || !dest.site) return { ok: false, why: `${dest.name} is dark` };
    } else if (!this.reachable(s.id).length) return { ok: false, why: 'no other ring answers' };
    this.spin = { kind, to: dest?.id ?? null, from: s.id, t: 0, bad: false };
    g.audio?.tone?.(RINGBORN.hum.hz, RING.spin + RING.live, 0.16, 'sawtooth', 0.8);
    g.audio?.tone?.(RINGBORN.hum.hz * 2, RING.spin + RING.live, 0.06, 'sine', 1.6);
    g.hud?.toast?.(`THE RING WAKES · ${K.name} · STAY ON THE DECK`, 'hot');
    g.emit('ringSpin', { station: s.id, kind, to: dest?.id ?? null });
    return { ok: true, kind, from: s.id, to: dest?.id ?? null, secs: RING.spin + RING.live };
  }

  // The ring's chance of throwing badly, and where ROULETTE lands (long: another region when one answers).
  badChance(s) { return SICK.bad0 + SICK.badDamaged * (s.row.damaged ?? 0); }
  rouletteFrom(s, rnd = Math.random) {
    let pool = this.reachable(s.id);
    if (RING.rouletteLong) { const far = pool.filter((d) => d.region !== s.region); if (far.length) pool = far; }
    return pool[Math.floor(rnd() * pool.length) % pool.length] ?? null;
  }

  // Who goes: you, the crew on the ring's level within crewR (standing; a downed one only if you are dragging them), your
  // dogs within crewR. Never a vehicle.
  travellers(R) {
    const g = this.g, out = { crew: [], dogs: [] };
    for (const m of g.crew?.members ?? []) {
      const c = m.c;
      if (!c || m.away) continue;
      const dragged = g.crew.drag === m;
      if ((!c.alive || m.down) && !dragged) continue;
      if (Math.hypot(c.x - R.cx, c.z - R.cz) < RING.crewR && Math.abs((c.gy ?? 0) - R.y) < 1.5 && !c.inVehicle) out.crew.push(m);
    }
    for (const d of g.dogs?.mine?.() ?? []) if (!d.dead && Math.hypot(d.x - R.cx, d.z - R.cz) < RING.crewR && Math.abs((d.y ?? 0) - R.y) < 1.5) out.dogs.push(d);
    return out;
  }

  throwNow() {
    const g = this.g, S = this.spin, R = this.live, from = this.byId.get(S.from);
    this.spin = null;
    const dest = S.kind === 'roulette' ? this.rouletteFrom(from) : this.byId.get(S.to);
    if (!dest) return { ok: false, why: 'nothing answered' };
    const bad = S.kind === 'roulette' && Math.random() < this.badChance(from);
    const who = this.travellers(R);
    // the rig stays: what you drove last, where you left it, as it is
    const v = g.lastVehicle;
    if (v && !v.dead && g.vehicles.includes(v)) this.st.rig = { id: v.id, type: v.type, x: r1(v.x), z: r1(v.z), hp: Math.round(v.hp), fuel: v.fuel !== undefined ? +v.fuel.toFixed(2) : null, station: from.id, region: from.region, day: g.society?.day ?? 0 };
    const arrived = this.arrive(dest, who, { bad });
    const gain = (SICK.gain[S.kind] ?? 1) + (bad ? SICK.badExtra : 0);
    this.addSick(gain);
    if (bad) { this.st.bad++; this.counts.bad++; const hurt = (c) => { if (c?.alive) c.hp = Math.max(1, c.hp - RING.badHurt); }; hurt(g.player); for (const m of who.crew) hurt(m.c); }
    this.st.last = from.id;
    this.st.throws++; this.counts.throws++;
    this.know(dest.id);
    const res = { ok: true, kind: S.kind, from: from.id, to: dest.id, region: dest.region, bad, sick: this.st.sick, crew: who.crew.map((m) => m.id), dogs: who.dogs.map((d) => d.id), rig: this.st.rig, ...arrived };
    g.emit('ringThrow', { kind: S.kind, from: from.id, to: dest.id, region: dest.region, bad, crew: who.crew.length, dogs: who.dogs.length, sick: this.st.sick });
    this.lastThrow = res;
    return res;
  }

  // Stand people round a station's ring (its site made live, its ring level promoted, its blast door to open after the hold).
  arrive(dest, who, { bad = false, ringborn = false } = {}) {
    const g = this.g, U = g.under, p = g.player;
    if (p.inVehicle) g.exitVehicle(true);
    if (p.onDeck) g.decks?.dismount?.(p, 'thrown', true);
    if (U.A && U.A.site !== dest.site) U.deactivate();
    g.streamer?.ensureHot(dest.x, dest.z, 'teleport');
    U.place(dest.site);
    U.activate(dest.site);
    const P = U.promote(2);
    U.A.wantT.set(2, g.time);
    const R = this.ringOf(P);
    this.live = { station: dest, ...R }; this.placeLook(this.live);
    // places round the core: you first, facing the door; the crew and the dogs after
    const slots = this.slots(R, 1 + who.crew.length + who.dogs.length);
    const put = (c, i) => { c.x = slots[i].x; c.z = slots[i].z; c.gy = R.y; c.storey = null; c.path = null; c.vx = 0; c.vz = 0; g.standOn(c); };
    put(p, 0);
    if (R.door) p.face = Math.atan2(R.door.x - p.x, R.door.z - p.z);
    // the crew come to on the steel: down (the knockdown state) until a breath after the door opens, then on their feet
    this.downed.length = 0;
    who.crew.forEach((m, i) => { put(m.c, 1 + i); m.holdAt = null; if (m.c.alive) { m.c.knockT = Math.max(m.c.knockT ?? 0, (ringborn ? RINGBORN.black : RING.arrivalHold) + 1.2); this.downed.push({ c: m.c, k: m.c.knockT }); } });
    who.dogs.forEach((d, i) => { const s = slots[1 + who.crew.length + i]; d.x = s.x; d.z = s.z; d.y = R.y; d.path = null; });
    if (g.crew?.drag) g.crew.stopDrag?.();
    g.camLook.x = p.x; g.camLook.z = p.z; g.camFloor = p.gy;
    g.updateCamera?.(0.016);
    this.catchT = RING.afterglow;
    this.cold = { t: ringborn ? RINGBORN.black : RING.arrivalHold, station: dest.id, door: R.door?.id ?? null, ringborn, opened: false };
    this.ui.black(ringborn ? 1 : 0.85, ringborn ? RINGBORN.black : RING.arrivalHold);
    g.hud?.toast?.(ringborn ? RINGBORN.toast : `${bad ? 'THE RING SPAT YOU OUT WRONG · ' : ''}${dest.name} · ${dest.region.toUpperCase()}`, bad ? 'hot' : 'job');
    return { at: { x: r1(p.x), z: r1(p.z), gy: r1(p.gy) }, site: dest.site.id, ug: p.ug ?? null };
  }

  // Places on the deck: you between the core and the blast door, facing it; the crew and the dogs ahead of you, fanned out
  // toward the door - inside your flashlight's cone, the only light down here when the ring dies back.
  slots(R, n) {
    const out = [], room = R.room, m = 0.9;
    const a0 = R.door ? Math.atan2(R.door.x - R.cx, R.door.z - R.cz) : 0, ux = Math.sin(a0), uz = Math.cos(a0), vx = uz, vz = -ux;
    const fan = [[1.8, 0], [3.0, 1.0], [3.0, -1.0], [2.4, 2.0], [2.4, -2.0], [1.5, 2.6], [1.5, -2.6], [3.3, 0], [0.6, 3.1], [0.6, -3.1]];
    for (const [a, b] of fan) {
      if (out.length >= n) break;
      const x = R.cx + ux * a + vx * b, z = R.cz + uz * a + vz * b;
      if (x < room.x0 + m || x > room.x1 - m || z < room.z0 + m || z > room.z1 - m) continue;
      out.push({ x, z });
    }
    for (let k = 0; out.length < n && k < 64; k++) { // round the core, whatever is left
      const a = a0 + k * 2.399963, r = k < 10 ? 1.7 : 2.6, x = R.cx + Math.sin(a) * r, z = R.cz + Math.cos(a) * r;
      if (x > room.x0 + m && x < room.x1 - m && z > room.z0 + m && z < room.z1 - m) out.push({ x, z });
    }
    while (out.length < n) out.push({ x: R.cx + ux * 1.8, z: R.cz + uz * 1.8 });
    return out;
  }

  openDoor() {
    const g = this.g, C = this.cold, R = this.live;
    C.opened = true;
    if (!R || R.station.id !== C.station) return;
    const d = R.door;
    if (d && d.locked) {
      g.interiors.unlock(d, 'ring', g.player, true, R.cx, R.cz);
      for (const P of g.under.A?.levels.values() ?? []) g.under.paint(P);
    }
    g.audio?.tone?.(70, 1.4, 0.2, 'sawtooth', -0.3); g.audio?.hiss?.(0);
    g.emit('ringDoor', { station: C.station, door: d?.id ?? null });
    if (C.ringborn) g.hud?.subtitle?.(RINGBORN.sub, 6);
  }

  // ---- ring-sickness -------------------------------------------------------------------------------------------------------
  addSick(n) { this.st.sick = Math.max(0, Math.min(SICK.max, this.st.sick + n)); this.st.restMin = 0; this.applySick(); }
  setSick(n) { this.st.sick = Math.max(0, Math.min(SICK.max, Math.round(n))); this.applySick(); }
  // What systems/survival.js folds in (the one consumer of each): aim spread, darkened edges, the microsleep.
  sickFx() {
    const n = this.st.sick;
    if (!n) return null;
    const F = this.fx;
    F.spread = 1 + SICK.spread * n; F.vig = SICK.vignette * n; F.micro = n >= SICK.microAt;
    return F;
  }
  applySick() { this.ui.sick(this.st.sick); }
  know(id) { if (!this.st.known.includes(id)) this.st.known.push(id); }

  // ---- every frame ---------------------------------------------------------------------------------------------------------
  update(simDt, dt) {
    const g = this.g, p = g.player;
    const R = this.liveStation();
    this.group.visible = !!R && (p.ug === R.station.site.id || !!this.spin);
    if (R && p.ug === R.station.site.id) this.know(R.station.id);
    // the spin
    if (this.spin && simDt > 0) {
      this.spin.t += simDt;
      if (!R || !this.onDeck(p, R)) {
        this.spin = null; this.counts.aborted++;
        g.hud?.toast?.('YOU STEPPED OFF THE DECK · THE RING SPINS DOWN', 'warn'); g.emit('ringAbort', {});
      } else if (this.spin.t >= RING.spin + RING.live) this.throwNow();
    }
    // the crew who came to on the steel get up: a member the AI pass does not tick (the crew's own brain) is ticked here
    for (let i = this.downed.length - 1; i >= 0; i--) {
      const D = this.downed[i], c = D.c;
      if (!(c.knockT > 0) || !c.alive) { this.downed.splice(i, 1); continue; }
      if (c.knockT === D.k && simDt > 0) c.knockT = Math.max(0, c.knockT - simDt);
      D.k = c.knockT;
    }
    if (this.catchT > 0) this.catchT -= dt;
    if (this.cold && !this.cold.opened && (this.cold.t -= simDt > 0 ? simDt : 0) <= 0) this.openDoor();
    if (this.group.visible) this.drawRing(dt);
    // ring-sickness: one stack per decayMin game minutes of rest
    const h = (g.society?.day ?? 0) * 24 + (g.sky?.time ?? 0);
    if (this.lastH !== null && this.st.sick > 0) {
      const dh = h - this.lastH;
      if (dh > 0 && dh < 12) {
        if ((this.calmT -= dt) <= 0) { this.calmT = 1; this.calm = this.isCalm(); }
        if (this.calm) {
          this.st.restMin += dh * 60 * (g.survival?.sleep ? SICK.sleepMul : 1);
          while (this.st.restMin >= SICK.decayMin && this.st.sick > 0) { this.st.restMin -= SICK.decayMin; this.st.sick--; this.applySick(); g.emit('ringSick', { n: this.st.sick, why: 'rest' }); }
        }
      }
    }
    if (this.st.sick === 0) this.st.restMin = 0;
    this.lastH = h;
    this.ui.update(dt);
  }

  // Resting: not running, and nobody after you near by.
  isCalm() {
    const g = this.g, p = g.player;
    if ((p.speed ?? 0) > 5.5) return false;
    for (const c of g.chars) if (c.alive && c !== p && (c.target === p || c.ztarget === p) && Math.abs(c.x - p.x) < 40 && Math.abs(c.z - p.z) < 40) return false;
    return true;
  }

  drawRing(dt) {
    const R = this.live, s = R.station, st = this.stateOf(s), t = this.g.time;
    let k = 0, vort = 0, spinV = 0, hot = 0;
    if (st === 'dormant') k = 0.04;
    else if (st === 'pending') k = 0.25 + 0.15 * Math.sin(t * 1.4);
    else if (st === 'armed') k = 0.75 + 0.05 * Math.sin(t * 2.2);
    else if (st === 'building') { const u = this.spin.t / (RING.spin * RING.build); k = 0.55 + 0.45 * Math.abs(Math.sin(t * (2 + 8 * u))); vort = 0.15 * u; spinV = 0.6 + 2 * u; }
    else if (st === 'frantic') { const u = (this.spin.t - RING.spin * RING.build) / (RING.spin * (1 - RING.build)); k = Math.random() < 0.25 ? 0.4 : 1; hot = u; vort = 0.25 + 0.6 * u; spinV = 3 + 6 * u; }
    else if (st === 'live') { k = 1; hot = 1; vort = 1; spinV = 10; }
    else if (st === 'catching') { const u = Math.max(0, this.catchT / RING.afterglow); k = 0.3 + 0.7 * u; hot = u; vort = u; spinV = 6 * u; }
    _c.lerpColors(this.cDim, this.cGlow, Math.min(1, k)); if (hot > 0) _c.lerp(this.cHot, hot * 0.7);
    this.edgeMat.color.copy(_c);
    this.pylonMat.emissive.copy(_c).multiplyScalar(0.55 * k);
    this.haloMat.emissive.copy(_c).multiplyScalar(0.35 * k);
    this.vortexMat.opacity = vort;
    this.vortex.visible = vort > 0.01;
    this.vortex.rotation.y -= spinV * dt;
    this.halo.rotation.y += spinV * 0.12 * dt;
    const sc = 0.85 + 0.15 * vort + (st === 'frantic' ? 0.04 * Math.sin(t * 40) : 0);
    this.vortex.scale.set(sc, 1, sc);
    // the boards repaint only when what they say changes (no strings made on a quiet frame)
    const B = this.board ?? (this.board = { s: null, st: null, last: null, known: -1 });
    if (B.s !== s || B.st !== st || B.last !== this.st.last || B.known !== this.st.known.length) {
      B.s = s; B.st = st; B.last = this.st.last; B.known = this.st.known.length;
      this.paintBoard([s.name, BOARD_WORDS[st], this.st.last && this.st.last !== s.id ? `LAST ${this.byId.get(this.st.last).name}` : `RINGS KNOWN ${this.st.known.length}`], st !== 'dormant');
    }
  }

  // ---- Ring-born ------------------------------------------------------------------------------------------------------------
  // A new game that opens mid-throw: a random ring that answers, a starter crew on the deck with you, ring-sick, black, the
  // hum, then the blast door.
  ringBorn({ station = null, rnd = Math.random } = {}) {
    const g = this.g, K = g.crew, pool = this.reachable();
    const dest = station ? this.byId.get(station) : pool[Math.floor(rnd() * pool.length) % pool.length];
    if (!dest?.site) return { ok: false, why: `no ring ${station}` };
    const p = g.player;
    if (p.inVehicle) g.exitVehicle(true);
    // the starter crew, made beside you and joined (they wake on the deck with you)
    const crew = [];
    for (const rowId of RINGBORN.crew) {
      if (K.members.length >= 5) break;
      const Rw = CREW_BY_ID[rowId];
      if (!Rw || !K.canJoin(Rw).ok) continue; // the caps say no (a card already with you)
      const n = K.members.length;
      const c = g.addChar({ x: p.x + 2 + n, z: p.z + 2, faction: 'drifter', weapon: Rw.weapon, hp: Rw.hp, name: Rw.names[(n * 7 + K.nextRec) % Rw.names.length], flag: Rw.flags[n % Rw.flags.length], colors: K.colors(Rw, n * 31 + K.nextRec) });
      if (!c) continue;
      const r = K.joinChar(c, 'api', rowId);
      if (r.ok) crew.push(K.members[K.members.length - 1]); else g.removeChar(c);
    }
    for (const [id, n] of RINGBORN.kit) g.inventory.stow(id, n);
    // the station that caught you is running on its last fuel (its fans on: the air is good for now, the lights low)
    const rec = g.under.rec(dest.site); rec.power = true; rec.fuel = Math.max(rec.fuel, RINGBORN.fuel);
    const arrived = this.arrive(dest, { crew, dogs: [] }, { ringborn: true });
    this.st.ringborn = true; this.st.last = null;
    this.know(dest.id);
    this.setSick(RINGBORN.sick); this.st.restMin = 0;
    g.audio?.tone?.(RINGBORN.hum.hz, RINGBORN.hum.secs, 0.2, 'sawtooth', -0.4);
    g.audio?.tone?.(RINGBORN.hum.hz * 1.5, RINGBORN.hum.secs, 0.07, 'sine', -0.6);
    g.emit('ringBorn', { station: dest.id, region: dest.region, crew: crew.length });
    return { ok: true, station: dest.id, region: dest.region, crew: crew.map((m) => ({ id: m.id, name: m.name, row: m.rowId, flag: m.flag })), ...arrived };
  }

  // The title's RING-BORN button (beside MAKE A SURVIVOR and QUICK START; the pad's Y on the title) and ?start=ringborn.
  attachTitle() {
    if (typeof document === 'undefined') return;
    let was = false;
    const tick = () => {
      const inner = document.querySelector('.title .title-inner');
      if (!inner) { if (this.titleSeen) { clearInterval(this.titlePoll); this.titlePoll = 0; } return; }
      this.titleSeen = true;
      const play = inner.querySelector('.play');
      if (play && !inner.querySelector('.ring-born')) {
        const b = document.createElement('button');
        b.className = 'ring-born'; b.innerHTML = 'RING-BORN <span class="rb-sub">wake on a ring platform, nowhere you know</span> <span class="rb-pad">Y</span>';
        b.onclick = () => this.ringBornFromTitle();
        play.after(b);
        try { if (new URLSearchParams(location.search).get('start') === 'ringborn') { const go = play.onclick; play.onclick = (e) => { go?.(e); this.ringBorn(); }; } } catch { /* no URL */ }
      }
      const pad = navigator.getGamepads?.()?.find?.((q) => q);
      const y = !!pad?.buttons?.[3]?.pressed;
      if (y && !was && !document.querySelector('.cr:not(.hidden)')) this.ringBornFromTitle();
      was = y;
    };
    this.titlePoll = setInterval(tick, 60);
  }
  ringBornFromTitle() {
    const play = document.querySelector('.title .play');
    if (!play) return null;
    play.click();
    return this.ringBorn();
  }

  // ---- save / load ----------------------------------------------------------------------------------------------------------
  save() {
    const S = this.st;
    return { v: 1, last: S.last, known: [...S.known], armed: [...S.armed], sick: S.sick, restMin: +S.restMin.toFixed(2), rig: S.rig ? { ...S.rig } : null, ringborn: S.ringborn, throws: S.throws, bad: S.bad };
  }
  load(s) {
    if (!s || s.v !== 1) return;
    this.st = { last: s.last ?? null, known: [...(s.known ?? [])], armed: [...(s.armed ?? [])], sick: s.sick ?? 0, restMin: s.restMin ?? 0, rig: s.rig ? { ...s.rig } : null, ringborn: !!s.ringborn, throws: s.throws ?? 0, bad: s.bad ?? 0 };
    this.spin = null; this.cold = null; this.catchT = 0; this.live = null; this.lastH = null;
    this.applySick();
    // The crew came back beside you on the street floor (systems/crew.js load): below, on your level with you.
    const g = this.g, p = g.player;
    if (p.ug) {
      let i = 0;
      for (const m of g.crew?.members ?? []) {
        const c = m.c; if (!c || m.away || c.ug === p.ug) continue;
        const a = (i++ / 6) * Math.PI * 2;
        c.x = p.x + Math.sin(a) * 1.2; c.z = p.z + Math.cos(a) * 1.2; c.gy = p.gy; c.path = null; g.standOn(c);
      }
    }
  }

  // ---- what the agent sees -----------------------------------------------------------------------------------------------
  view(detail = false) {
    const g = this.g, R = this.liveStation(), inv = g.inventory;
    const one = (s) => {
      const r = s.site ? g.under.recs.get(s.site.id) : null;
      const o = { id: s.id, name: s.name, region: s.region, reach: s.reach, site: s.site?.id ?? null, x: Number.isFinite(s.x) ? Math.round(s.x) : null, z: Number.isFinite(s.z) ? Math.round(s.z) : null,
        known: this.st.known.includes(s.id), power: !!r?.power, code: !!r?.codes?.includes('ring'), armed: s.site ? this.armed(s) : false, key: inv?.carried.count(keyId(s.id)) ?? 0, damaged: s.row.damaged ?? 0,
        badChance: +this.badChance(s).toFixed(3), dist: Number.isFinite(s.x) ? Math.round(Math.hypot(s.x - g.player.x, s.z - g.player.z)) : null };
      if (detail && s.site) o.state = this.stateOf(s);
      return o;
    };
    return {
      stations: this.stations.map(one),
      live: R ? { station: R.station.id, state: this.stateOf(R.station), centre: { x: r1(R.cx), z: r1(R.cz), y: r1(R.y) }, consoles: R.consoles.map((c) => ({ x: r1(c.x), z: r1(c.z) })), door: R.door ? { id: R.door.id, locked: !!R.door.locked, keypad: R.door.keypad ?? null } : null,
        onDeck: this.onDeck(g.player, R), visible: this.group.visible } : null,
      spin: this.spin ? { ...this.spin, t: +this.spin.t.toFixed(2) } : null,
      sick: this.st.sick, restMin: +this.st.restMin.toFixed(1), fx: this.st.sick ? { ...this.sickFx() } : null, last: this.st.last, known: [...this.st.known], armed: [...this.st.armed], rig: this.st.rig,
      ringborn: this.st.ringborn, throws: this.st.throws, bad: this.st.bad, counts: { ...this.counts }, keys: this.keysCarried(), ui: this.ui.open,
    };
  }
}
