import * as THREE from 'three';
import { CAMPFIRE as CF, CAMP_LINES } from '../data/worldvoice.js';
import { FACTIONS } from '../data/society.js';
import { BOND_RULES } from '../data/crewtalk.js';

// THE CAMPFIRE (docs/design/WEB_WORLD_VOICE.md §3.5). Stop at night, out of the car, with your crew near and nothing
// hunting you, and after a few still seconds somebody makes a fire. The crew sit, and the talk is picked from what is
// real: a chronicle row near you in the last day (a raid, a skirmish, the one you shot), something you heard far off,
// a line you heard on the radio, your own state (hurt, hungry, flush, wanted, low) and the land you are on. Each line
// goes out through the crew's own voice path (systems/crew.js say: the subtitle, the voice layer, the LLM hook) with
// its ref, so the voice lane can swap in a generated line from the same facts. The clock moves on with every exchange,
// and the fire gives rest and morale. Walk off, hit daylight or trouble, and it is left to burn down: a cold ring of
// ash stays (systems/marks.js).
// Light: one light of the fx's fixed pool kept lit while the fire burns, plus additive glow quads (no new light).
// Draws: two small instanced meshes, only while a fire is lit.
const r1 = (v) => Math.round(v * 10) / 10;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();

function glowTex() {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), grd = g.createRadialGradient(32, 32, 1, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,236,190,1)'); grd.addColorStop(0.3, 'rgba(255,170,80,0.75)'); grd.addColorStop(1, 'rgba(255,120,40,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class Campfire {
  constructor(g) {
    this.g = g;
    this.on = true;
    this.fire = null;          // { id, x, z, y, lit, lines, nextT, used: Set, log: [] }
    this.nid = 0; this.still = 0; this.lx = 0; this.lz = 0; this.checkT = 0; this.lightT = 0;
    this.last = null;          // the last fire's record (for the commands)
    this.stats = { lit: 0, lines: 0, refs: 0, out: 0 };
    this.logs = null; this.glow = null;
  }
  hours() { return this.g.pulls?.k?.hours?.() ?? (this.g.society?.day ?? 0) * 24 + (this.g.sky?.time ?? 0); }
  crewHere(x, z) { return (this.g.crew?.members ?? []).filter((m) => m.c?.alive && !m.down && !m.away && Math.hypot(m.c.x - x, m.c.z - z) < CF.crewR); }

  // Can a fire be made here, now? -> null or why not.
  why() {
    const g = this.g, p = g.player;
    if (!p?.alive) return 'dead';
    if ((g.sky?.night ?? 0) < CF.needNight) return 'not night';
    if (p.inVehicle) return 'in a vehicle';
    if (g.insideBuilding || p.ug || p.swim) return 'not out here';
    if (!this.crewHere(p.x, p.z).length) return 'no crew with you';
    const t = g.survival?.threat?.(30); if (t) return `${t} too close`;
    return null;
  }
  light({ force = false } = {}) {
    const g = this.g, p = g.player;
    if (this.fire) return { ok: false, why: 'a fire is already burning' };
    const no = this.why(); if (no && !force) return { ok: false, why: no };
    const a = p.face ?? 0, x = p.x + Math.sin(a) * 2.6, z = p.z + Math.cos(a) * 2.6;
    const here = this.crewHere(p.x, p.z);
    this.fire = { id: `fire${++this.nid}`, x: r1(x), z: r1(z), y: g.rites?.ground?.(x, z) ?? 0, lit: r1(this.hours()), lines: 0, nextT: g.time + 2, used: new Set(), log: [], members: here.map((m) => m.id), morale: false };
    // The crew sit round it (they walk to their places; crew.camp keeps them there and hushes their own camp talk).
    if (g.crew) { this.campWas = g.crew.camp; g.crew.camp = { x: this.fire.x, z: this.fire.z, day: g.society?.day ?? 0 }; this.campAtWas = g.crew.campAt; g.crew.campAt = g.time + 1e6; }
    here.forEach((m, i) => { const t = (i + 1) / (here.length + 1) * Math.PI * 2 + a; m.fireSeat = { x: x + Math.sin(t) * CF.sitR, z: z + Math.cos(t) * CF.sitR }; });
    this.stats.lit++;
    g.hud?.toast?.('A FIRE · THE CREW SIT DOWN', 'job');
    g.emit?.('campfireLit', { id: this.fire.id, x: this.fire.x, z: this.fire.z, crew: here.length });
    return { ok: true, fire: this.view() };
  }
  out(why = 'burned down') {
    const g = this.g, F = this.fire; if (!F) return null;
    this.fire = null;
    if (g.crew) { g.crew.camp = this.campWas ?? null; g.crew.campAt = g.time + 30; }
    for (const m of g.crew?.members ?? []) { m.fireSeat = null; if (m.c) m.c.crouch = false; }
    g.marks?.ash(F.x, F.z, F.id);
    if (this.logs) { this.logs.visible = false; this.glow.visible = false; }
    this.last = { ...F, used: undefined, why, out: r1(this.hours()) };
    this.stats.out++;
    g.emit?.('campfireOut', { id: F.id, why, lines: F.lines });
    return this.last;
  }

  // ---- what they talk about ---------------------------------------------------------------------------------------------
  placeName(r) {
    const g = this.g;
    return r.on && r.v !== 'kill' && r.v !== 'silence' ? r.on : g.society?.places?.[r.p]?.name ?? g.citygen?.byId?.get(r.p)?.name ?? g.pulls?.nearestNode?.(r.x, r.z, 4000)?.name ?? 'the flats';
  }
  // The world as the fire knows it: recent rows near, what you heard far off, what the radio told you, your state, the land.
  context() {
    const g = this.g, p = g.player, now = this.hours(), out = { events: [], heard: [], news: [], stat: {}, area: g.farsound?.biome ?? 'desert' };
    for (const r of g.society?.chronicle?.query({ limit: 80 }) ?? []) {
      if (r.src === 'rumor') continue;
      const h = (r.day ?? 0) * 24 + (r.hr ?? 0);
      if (now - h > CF.recentH) break;
      if ((r.x || r.z) && Math.hypot(r.x - p.x, r.z - p.z) > CF.recentR) continue;
      out.events.push(r);
    }
    const realNow = g.time;
    for (const e of g.farsound?.heard(20) ?? []) if (['shot', 'volley', 'engine', 'explosion'].includes(e.kind) && realNow - e.heard < CF.recentH * 30) out.heard.push(e);
    for (const c of g.pulls?.k?.holders.get('player')?.facts ?? []) if (c.source?.channel === 'radio' && now - c.heard < CF.recentH) out.news.push(c);
    const N = g.needs ?? {};
    out.stat = { hp: (p.hp ?? 100) / (p.maxHp ?? 100), food: N.food ?? 1, cash: g.cash ?? 0, kills: g.stats?.kills ?? 0, wanted: g.wanted ?? 0, morale: g.deep?.moraleNow?.() ?? 0 };
    return out;
  }
  // Rows that fit, each with what it would say and the real thing it came from. -> [{ row, text, ref, w }]
  candidates(cx = this.context()) {
    const out = [], n = this.fire?.lines ?? 0, fname = (id) => (FACTIONS[id]?.name ?? (id || 'somebody')).replace(/^The /, 'the ');
    const pickT = (row, k) => row.text[(k + n) % row.text.length];
    for (const row of CAMP_LINES) {
      if (this.fire?.used.has(row.id)) continue;
      const [type, arg, who] = row.when.split(':');
      if (type === 'event') {
        const verbs = arg.split('|');
        const r = cx.events.find((e) => verbs.includes(e.v) && (who === 'you' ? e.a === 'player' : arg === 'kill' ? e.a !== 'player' : true));
        if (!r) continue;
        const vars = { place: this.placeName(r), target: r.on || 'that one', by: fname(r.af || r.a), other: fname(r.of) };
        out.push({ row, vars, ref: { type: 'chronicle', seq: r.seq, v: r.v, on: r.on, place: vars.place }, w: row.w + 2 });
      } else if (type === 'heard') {
        const e = cx.heard[0]; if (!e) continue;
        out.push({ row, vars: { dir: e.dir === 'N' ? 'north' : e.dir === 'S' ? 'south' : e.dir === 'E' ? 'east' : e.dir === 'W' ? 'west' : { NE: 'north-east', NW: 'north-west', SE: 'south-east', SW: 'south-west' }[e.dir] }, ref: { type: 'heard', seq: e.seq, kind: e.kind, dir: e.dir }, w: row.w + 1 });
      } else if (type === 'news') {
        const c = cx.news[cx.news.length - 1]; if (!c) continue;
        out.push({ row, vars: { heard: (c.text ?? '').replace(/\.$/, '').replace(/^\w/, (m) => m.toLowerCase()) }, ref: { type: 'fact', fact: c.id }, w: row.w });
      } else if (type === 'stat') {
        const m = /^(\w+)([<>])([\d.]+)$/.exec(arg); if (!m) continue;
        const v = cx.stat[m[1]]; if (v === undefined || !(m[2] === '<' ? v < +m[3] : v > +m[3])) continue;
        out.push({ row, vars: { kills: cx.stat.kills, cash: cx.stat.cash }, ref: { type: 'stat', stat: m[1], value: +(+v).toFixed(2) }, w: row.w });
      } else if (type === 'area') {
        if (!arg.split('|').includes(cx.area)) continue;
        out.push({ row, vars: { area: cx.area }, ref: { type: 'area', biome: cx.area }, w: row.w });
      } else if (type === 'any') out.push({ row, vars: {}, ref: null, w: row.w });
    }
    for (const c of out) c.text = pickT(c.row, (c.ref?.seq ?? 0)).replace(/\{(\w+)\}/g, (mm, k) => c.vars[k] ?? (k === 'you' ? 'boss' : mm));
    return out.sort((a, b) => b.w - a.w);
  }
  // One exchange: the best line nobody has said tonight, by the member it suits (the one with the strongest feeling for
  // a deed of yours speaks of it), then the clock, the rest, the bonds.
  exchange() {
    const g = this.g, F = this.fire; if (!F) return null;
    const here = this.crewHere(F.x, F.z); if (!here.length) { this.out('the crew walked off'); return null; }
    const C = this.candidates(); if (!C.length) return null;
    const c = C[0], m = here[F.lines % here.length];
    F.used.add(c.row.id); F.lines++;
    g.crew?.say(m, c.text, true, 'camp', null, { campfire: F.id, line: c.row.id, ref: c.ref });
    const rec = { n: F.lines, rec: m.id, name: m.name, line: c.row.id, text: c.text, ref: c.ref, hour: r1(this.hours()) };
    F.log.push(rec); this.stats.lines++; if (c.ref) this.stats.refs++;
    // the clock moves, and the night does them good
    this.advance(CF.hoursPerLine);
    if (g.needs) g.needs.rest = Math.min(1, (g.needs.rest ?? 0) + CF.rest);
    for (const mm of here) mm.needs.rest = Math.min(1, mm.needs.rest + CF.rest);
    if (!F.morale) { g.deep?.moraleAdd?.(CF.morale); F.morale = true; }
    if (here.length > 1) g.crew?.moveBond?.(m, here[(F.lines) % here.length], BOND_RULES.campNudge);
    g.emit?.('campfireLine', { fire: F.id, name: m.name, line: c.row.id, ref: c.ref });
    return rec;
  }
  advance(h) {
    const g = this.g;
    g.sky.time += h; if (g.sky.time >= 24) g.sky.time -= 24;
    g.society?.update?.(0); g.pulls?.tick?.(0);
  }

  // ---- the look ---------------------------------------------------------------------------------------------------------
  gpu() {
    if (this.logs || !this.g.scene) return;
    const logs = (this.logs = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: '#5a4630', roughness: 0.95 }), 16));
    logs.name = 'campfire'; logs.frustumCulled = false; logs.visible = false;
    const gm = new THREE.MeshBasicMaterial({ map: glowTex(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: CF.glow.color });
    const glow = (this.glow = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), gm, 3)); glow.name = 'campfire-glow'; glow.frustumCulled = false; glow.visible = false;
    this.g.scene.add(logs); this.g.scene.add(glow);
  }
  place() {
    const F = this.fire; this.gpu(); if (!this.logs) return;
    let i = 0;
    for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; _e.set(0.35, a, 0, 'YXZ'); _q.setFromEuler(_e); _p.set(F.x + Math.sin(a) * 0.35, F.y + 0.14, F.z + Math.cos(a) * 0.35); _s.set(0.14, 0.14, 0.9); _m.compose(_p, _q, _s); this.logs.setMatrixAt(i++, _m); }
    for (let k = 0; k < 9; k++) { const a = k / 9 * Math.PI * 2; _e.set(0, a, 0); _q.setFromEuler(_e); _p.set(F.x + Math.sin(a) * 0.75, F.y + 0.08, F.z + Math.cos(a) * 0.75); _s.set(0.26, 0.16, 0.2); _m.compose(_p, _q, _s); this.logs.setMatrixAt(i++, _m); }
    this.logs.count = i; this.logs.instanceMatrix.needsUpdate = true; this.logs.visible = true; this.glow.visible = true;
  }
  flicker() {
    const F = this.fire, G = this.glow; if (!G) return;
    const t = this.g.time, f = 1 + Math.sin(t * 13.1) * CF.glow.flicker * 0.6 + Math.sin(t * 7.3) * CF.glow.flicker * 0.4;
    _e.set(-Math.PI / 2, 0, 0, 'XYZ'); _q.setFromEuler(_e); _p.set(F.x, F.y + 0.05, F.z); _s.set(CF.glow.r * 2 * f, CF.glow.r * 2 * f, 1); _m.compose(_p, _q, _s); G.setMatrixAt(0, _m);
    _e.set(-0.25, 0, 0, 'XYZ'); _q.setFromEuler(_e); _p.set(F.x, F.y + 0.75, F.z); _s.set(1.1 * f, 1.6 * f, 1); _m.compose(_p, _q, _s); G.setMatrixAt(1, _m);
    _e.set(-Math.PI / 2, 0, t, 'XYZ'); _q.setFromEuler(_e); _p.set(F.x, F.y + 0.3, F.z); _s.set(1.7 * f, 1.7 * f, 1); _m.compose(_p, _q, _s); G.setMatrixAt(2, _m);
    G.count = 3; G.instanceMatrix.needsUpdate = true;
  }

  update(dt) {
    const g = this.g, p = g.player;
    if (!this.on || !p) return;
    const F = this.fire;
    if (!F) {
      // still, at night, with the crew: after CF.stillSecs a fire is made
      if (Math.abs(p.x - this.lx) + Math.abs(p.z - this.lz) > 0.4) { this.lx = p.x; this.lz = p.z; this.still = 0; }
      else this.still += dt;
      if ((this.checkT -= dt) <= 0) { this.checkT = 0.5; if (this.still >= CF.stillSecs && !this.why()) this.light(); }
      return;
    }
    if (!this.logs?.visible) this.place();
    this.flicker();
    if ((this.lightT -= dt) <= 0) { this.lightT = 0.35; g.fx?.light?.(F.x, 1.1, F.z, CF.glow.color, 26, 0.5); }
    for (const m of g.crew?.members ?? []) if (m.fireSeat && m.c?.alive && Math.hypot(m.c.x - m.fireSeat.x, m.c.z - m.fireSeat.z) < 1.4) m.c.crouch = true; // sat down
    if (Math.hypot(p.x - F.x, p.z - F.z) > CF.leaveR || p.inVehicle) { this.out('you walked off'); return; }
    if ((g.sky?.night ?? 0) < 0.3) { this.out('dawn'); return; }
    const t = g.survival?.threat?.(30); if (t) { this.out(`${t} came`); return; }
    if (g.time >= F.nextT) {
      F.nextT = g.time + CF.gapSecs;
      if (F.lines >= CF.exchanges) { this.out('burned down'); return; }
      this.exchange();
    }
  }
  view() {
    const F = this.fire ?? this.last;
    return { burning: !!this.fire, why: this.fire ? null : this.why(), still: r1(this.still), fire: F ? { id: F.id, x: F.x, z: F.z, lit: F.lit, lines: F.lines, log: F.log, out: F.out ?? null, why: F.why ?? null } : null, stats: this.stats };
  }
}
