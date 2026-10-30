import * as THREE from 'three';
import { SHOT_READ as S } from '../data/shotread.js';

// SHOT READ (data/shotread.js; docs/design/WEB_SHOT_READ.md): a shot fired at the player is seen and placed.
//   at(shooter, ox, oz, dx, dz, range)   is this round's line AT the player? (systems/ballistics.js launch, combat.fire)
//   nearMiss(shooter, F)                 a round passed within BALLISTICS.nearMiss (combat.segment; the crack plays there)
//   impact(x, z, shooter, F)             a round landed: within puffR of the player it kicks up dust and marks
//   hit(attacker)                        the player was hit by a round (combat.damage)
//   update(dt)                           the markers: a small chevron at the screen's edge toward where the shot came from
// A marker points at where the round was FIRED from (F: the shooter's spot at the trigger), never at where the shooter is
// now: the player saw a flash and heard a crack there (law 6). Nothing is allocated per frame: the markers are a fixed pool.
const _a = new THREE.Vector3(), _b = new THREE.Vector3();
const CHEVRON = '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M6 3l12 9-12 9 3-9z" fill="currentColor" stroke="#140c08" stroke-width="1.5" stroke-linejoin="round"/></svg>';

export class ShotRead {
  constructor(game, ui = null) {
    this.g = game;
    this.stats = { at: 0, misses: 0, puffs: 0, hits: 0, marks: 0 };
    this.marks = [];
    const root = ui ?? (typeof document !== 'undefined' ? document.getElementById('ui') : null);
    if (root) {
      const box = document.createElement('div');
      box.className = 'shot-read';
      box.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden;';
      root.appendChild(box);
      for (let i = 0; i < S.markMax; i++) {
        const el = document.createElement('div');
        el.style.cssText = 'position:absolute;left:0;top:0;width:26px;height:26px;margin:-13px 0 0 -13px;opacity:0;filter:drop-shadow(0 0 6px rgba(255,120,40,0.85));will-change:transform,opacity;';
        el.innerHTML = CHEVRON;
        box.appendChild(el);
        this.marks.push({ el, on: false, t: 0, x: 0, z: 0, kind: null, by: null, ang: 0, sx: 0, sy: 0, last: -9 });
      }
    } else for (let i = 0; i < S.markMax; i++) this.marks.push({ el: null, on: false, t: 0, x: 0, z: 0, kind: null, by: null, ang: 0, sx: 0, sy: 0, last: -9 });
    this.clock = 0;
  }

  // The player is a target of this line: ahead of the muzzle, inside its reach, within S.reach of it.
  at(shooter, ox, oz, dx, dz, range, count = true) {
    const p = this.g.player;
    if (!shooter || shooter === p || !p?.alive || shooter.dog) return false;
    const px = p.x - ox, pz = p.z - oz, along = px * dx + pz * dz;
    if (along <= 0 || along > range + S.reach) return false;
    if (Math.abs(px * dz - pz * dx) > S.reach) return false;
    if (count) this.stats.at++;
    return true;
  }

  nearMiss(shooter, F) { if (!this.foe(shooter)) return; this.stats.misses++; this.mark(F?.x ?? shooter.x, F?.z ?? shooter.z, 'miss', shooter); }

  impact(x, z, shooter, F) {
    if (!this.foe(shooter)) return;
    const p = this.g.player;
    if (Math.hypot(x - p.x, z - p.z) > S.puffR) return;
    this.stats.puffs++;
    this.g.fx.dust(x, z, S.puffN);
    this.mark(F?.x ?? shooter.x, F?.z ?? shooter.z, 'miss', shooter);
  }

  hit(attacker) { if (!this.foe(attacker)) return; this.stats.hits++; this.mark(attacker.x, attacker.z, 'hit', attacker); }

  foe(s) { const p = this.g.player; return !!s && s !== p && s.x !== undefined && !!p?.alive; }

  // One marker per shooter: a burst refreshes it (at most every markMin s); a new shooter takes a free or the oldest one.
  mark(x, z, kind, by) {
    let m = this.marks.find((k) => k.on && k.by === by);
    if (m) {
      m.t = 0;
      if (kind === 'hit') m.kind = 'hit';
      if (this.clock - m.last >= S.markMin) { m.x = x; m.z = z; m.last = this.clock; this.stats.marks++; }
    } else {
      m = this.marks.find((k) => !k.on) ?? this.marks.reduce((o, k) => (k.t > o.t ? k : o));
      m.on = true; m.t = 0; m.x = x; m.z = z; m.by = by; m.kind = kind; m.last = this.clock;
      this.stats.marks++;
    }
    if (m.el) m.el.style.color = m.kind === 'hit' ? '#ff3b3b' : '#ffb020';
  }

  update(dt) {
    this.clock += dt;
    const g = this.g, cam = g.camera, p = g.player;
    let any = false;
    for (const m of this.marks) if (m.on) { any = true; break; }
    if (!any || !cam || !p) return;
    const W = innerWidth, H = innerHeight;
    _a.set(p.x, 1.2, p.z).project(cam);
    const px = (_a.x * 0.5 + 0.5) * W, py = (-_a.y * 0.5 + 0.5) * H;
    for (const m of this.marks) {
      if (!m.on) continue;
      m.t += dt;
      if (m.t >= S.markLife) { m.on = false; if (m.el) m.el.style.opacity = '0'; continue; }
      _b.set(m.x, 1.2, m.z).project(cam);
      let ux = (_b.x * 0.5 + 0.5) * W - px, uy = (-_b.y * 0.5 + 0.5) * H - py;
      if (_b.z > 1) { ux = -ux; uy = -uy; } // behind the camera: the projection flips
      const l = Math.hypot(ux, uy);
      if (!(l >= 1e-3)) { ux = m.x - p.x; uy = m.z - p.z; } // straight above, or no view to project through (a 0-size page): the world bearing
      const n = Math.hypot(ux, uy) || 1;
      ux /= n; uy /= n;
      m.ang = Math.atan2(uy, ux);
      m.sx = W / 2 + ux * W * S.markEdge; m.sy = H / 2 + uy * H * S.markEdge;
      if (m.el) {
        const half = S.markLife / 2, a = m.t < half ? 1 : 1 - (m.t - half) / half;
        m.el.style.opacity = a.toFixed(2);
        m.el.style.transform = `translate(${m.sx.toFixed(0)}px,${m.sy.toFixed(0)}px) rotate(${m.ang.toFixed(3)}rad) scale(${(m.kind === 'hit' ? 1.15 : 1) * (m.t < 0.12 ? 1.4 - m.t * 3.3 : 1)})`;
      }
    }
  }

  clear() { for (const m of this.marks) { m.on = false; if (m.el) m.el.style.opacity = '0'; } }

  // What the agent sees: the markers up now (their bearing on screen, 0 = right, clockwise) and the counters.
  view() {
    const r = (v) => Math.round(v);
    return {
      stats: { ...this.stats },
      marks: this.marks.filter((m) => m.on).map((m) => ({ kind: m.kind, by: m.by?.id ?? null, from: { x: +m.x.toFixed(1), z: +m.z.toFixed(1) }, screenDeg: r(((m.ang * 180) / Math.PI + 360) % 360), at: { x: r(m.sx), y: r(m.sy) }, age: +m.t.toFixed(2) })),
      cfg: { ...S },
    };
  }
}
