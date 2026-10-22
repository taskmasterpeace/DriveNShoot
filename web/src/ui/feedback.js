import * as THREE from 'three';
import { drawFlag, FLAGS } from './portrait.js';
import { RAIL } from '../world/rail.js';

// The feedback layer: everything that tells you what just happened without a toast.
// Damage-direction arcs, a kill feed (with flags), floating loot text, name tags with
// flags over people near your aim, a bearing ribbon with markers, blood on the lens,
// a low-ammo flash and a heartbeat when you're nearly dead. Driven by the event log,
// so anything that emits an event gets feedback for free. All DOM is pooled.

const _v = new THREE.Vector3();
const FACTION_COL = { raider: 'var(--blood)', ally: 'var(--green)', zombie: 'oklch(0.62 0.12 125)', drifter: 'var(--muted)', town: 'var(--bone)' };
const BEARINGS = [['N', 0], ['NE', 45], ['E', 90], ['SE', 135], ['S', 180], ['SW', 225], ['W', 270], ['NW', 315]];

export class Feedback {
  constructor(game, root) {
    this.g = game;
    root.insertAdjacentHTML('beforeend', `
      <div class="fb">
        <div class="fb-lens"></div>
        <div class="fb-dirs"></div>
        <div class="fb-tags"></div>
        <div class="fb-float"></div>
        <div class="fb-kills"></div>
        <div class="fb-compass"><div class="fb-cstrip"></div><div class="fb-cnotch"></div><div class="fb-cread"></div></div>
      </div>`);
    const q = (s) => root.querySelector(s);
    this.el = { lens: q('.fb-lens'), dirs: q('.fb-dirs'), tags: q('.fb-tags'), float: q('.fb-float'), kills: q('.fb-kills'), strip: q('.fb-cstrip'), read: q('.fb-cread') };
    this.seq = 0;
    this.dirs = [];   // {el, t, ang}
    this.floats = []; // {el, x, z, t, y0}
    this.kills = [];  // {el, t}
    this.tags = Array.from({ length: 8 }, () => { const el = document.createElement('div'); el.className = 'fb-tag'; el.innerHTML = '<img><span></span>'; this.el.tags.appendChild(el); return { el, img: el.firstChild, name: el.lastChild, id: null }; });
    this.flagUrl = {};
    this.heartT = 0;
    this.compassMarks = [];
    this.lastTags = [];
  }

  flag(code) {
    if (!FLAGS[code]) code = 'US';
    return (this.flagUrl[code] ??= drawFlag(code, 30, 20).toDataURL());
  }

  screen(x, y, z) {
    _v.set(x, y, z).project(this.g.camera);
    return [(_v.x * 0.5 + 0.5) * innerWidth, (-_v.y * 0.5 + 0.5) * innerHeight, _v.z < 1];
  }

  // ---- event-driven pieces ---------------------------------------------------------------
  indicator(ax, az, dmg) {
    const p = this.g.player;
    const ang = Math.atan2(ax - p.x, -(az - p.z)); // 0 = screen up, clockwise
    let d = this.dirs.find((k) => Math.abs(Math.atan2(Math.sin(k.ang - ang), Math.cos(k.ang - ang))) < 0.3);
    if (!d) {
      if (this.dirs.length >= 6) { this.dirs[0].el.remove(); this.dirs.shift(); }
      const el = document.createElement('div'); el.className = 'fb-dir';
      this.el.dirs.appendChild(el);
      d = { el, ang, t: 0, k: 0 };
      this.dirs.push(d);
    }
    d.ang = ang; d.t = 0; d.k = Math.min(1, d.k + 0.35 + dmg / 40);
    d.el.style.transform = `rotate(${ang}rad)`;
  }

  splat(strength) {
    // Blood on the lens: a few drops that slide and fade.
    for (let i = 0; i < 2 + Math.round(strength * 4); i++) {
      const el = document.createElement('i');
      const edge = Math.random() < 0.5;
      el.style.left = `${edge ? (Math.random() < 0.5 ? Math.random() * 18 : 82 + Math.random() * 18) : Math.random() * 100}%`;
      el.style.top = `${Math.random() * 100}%`;
      const s = 30 + Math.random() * 120 * strength;
      el.style.width = el.style.height = `${s}px`;
      el.style.animationDuration = `${2.5 + Math.random() * 2}s`;
      this.el.lens.appendChild(el);
      setTimeout(() => el.remove(), 4600);
    }
    while (this.el.lens.childElementCount > 24) this.el.lens.firstChild.remove();
  }

  floater(x, z, text, kind = '') {
    if (this.floats.length >= 16) { this.floats[0].el.remove(); this.floats.shift(); }
    const el = document.createElement('div'); el.className = `fb-floater ${kind}`; el.textContent = text;
    this.el.float.appendChild(el);
    this.floats.push({ el, x, z, t: 0 });
  }

  killRow(e) {
    const g = this.g, p = g.player;
    const killer = e.by ? g.api.findChar(e.by) : null, victim = g.api.findChar(e.victim);
    const near = victim && Math.hypot(victim.x - p.x, victim.z - p.z) < 70;
    if (!(e.by === p.id || e.victim === p.id || near)) return;
    const who = (c, fallback) => c === p ? 'YOU' : (c?.npc?.name ?? c?.name ?? fallback);
    const el = document.createElement('div');
    el.className = `fb-kill${e.by === p.id ? ' mine' : ''}${e.victim === p.id ? ' me' : ''}`;
    const kf = killer ? `<img src="${this.flag(killer.flag)}">` : '';
    const how = e.cause === 'vehicle' ? 'ROADKILL' : e.cause === 'fire' ? 'BURNED' : e.cause === 'explosion' ? 'BLOWN UP' : e.cause === 'drown' ? 'DROWNED' : e.cause === 'bash' ? 'DOORED' : e.cause === 'glass' ? 'CUT' : e.downed ? 'DOWNED' : killer === p ? String(g.inv.current).toUpperCase() : killer?.weapon ? killer.weapon.toUpperCase() : 'KILLED';
    el.innerHTML = `${kf}<b>${who(killer, e.cause === 'vehicle' ? 'TRAFFIC' : 'THE WASTES')}</b><em>${how}</em><img src="${this.flag(victim?.flag)}"><b style="color:${FACTION_COL[e.faction] ?? 'var(--bone)'}">${who(victim, e.victimName ?? '?')}</b>`;
    this.el.kills.prepend(el);
    this.kills.push({ el, t: 0 });
    if (this.kills.length > 5) this.kills.shift().el.remove();
  }

  consume() {
    const g = this.g, p = g.player;
    for (const e of g.events) {
      if (e.seq <= this.seq) continue;
      this.seq = e.seq;
      if (e.type === 'hurt') {
        const a = e.by ? g.api.findChar(e.by) : null;
        if (a && a !== p) this.indicator(a.inVehicle?.x ?? a.x, a.inVehicle?.z ?? a.z, e.amount);
        if (e.cause === 'explosion' || e.cause === 'vehicle' || (a && e.amount >= 14 && Math.hypot(a.x - p.x, a.z - p.z) < 7)) this.splat(Math.min(1, e.amount / 40));
      } else if (e.type === 'kill') this.killRow(e);
      else if (e.type === 'pickup' && e.x !== undefined) this.floater(e.x, e.z, e.text ?? e.kind.toUpperCase(), e.kind);
      else if (e.type === 'convoyLooted') this.floater(e.x, e.z, 'CARGO!', 'cash');
      else if (e.type === 'tankerExploded') this.floater(RAIL.x, e.z, 'KABOOM', 'hot');
    }
  }

  // ---- per-frame ---------------------------------------------------------------------------
  update(dt) {
    const g = this.g, p = g.player;
    this.consume();
    // Direction arcs fade.
    for (let i = this.dirs.length - 1; i >= 0; i--) {
      const d = this.dirs[i]; d.t += dt;
      const a = d.k * Math.max(0, 1 - d.t / 1.6);
      if (a <= 0.01) { d.el.remove(); this.dirs.splice(i, 1); continue; }
      d.el.style.opacity = a.toFixed(2);
    }
    // Floaters rise and fade.
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i]; f.t += dt;
      if (f.t > 1.6) { f.el.remove(); this.floats.splice(i, 1); continue; }
      const [sx, sy, on] = this.screen(f.x, 1.2 + f.t * 2.2, f.z);
      f.el.style.transform = `translate(${sx.toFixed(0)}px, ${sy.toFixed(0)}px) translate(-50%, -50%) scale(${Math.min(1, 0.6 + f.t * 3).toFixed(2)})`;
      f.el.style.opacity = on ? Math.min(1, (1.6 - f.t) * 1.6).toFixed(2) : '0';
    }
    // Kill feed ages out.
    for (let i = this.kills.length - 1; i >= 0; i--) {
      const k = this.kills[i]; k.t += dt;
      if (k.t > 7) { k.el.remove(); this.kills.splice(i, 1); } else if (k.t > 6) k.el.style.opacity = (7 - k.t).toFixed(2);
    }
    this.updateTags();
    this.updateCompass();
    // Low ammo flash + heartbeat.
    const w = g.inv?.current, mag = g.inv?.mag?.[w];
    const size = { pistol: 6, smg: 32, shotgun: 2 }[w] ?? 6;
    g.hud.el.wmag.classList.toggle('low', mag !== undefined && mag <= Math.max(1, Math.floor(size * 0.25)));
    if (p.alive && p.hp < p.maxHp * 0.3) {
      this.heartT -= dt;
      if (this.heartT <= 0) { g.audio.heartbeat?.(1 - p.hp / (p.maxHp * 0.3)); this.heartT = 0.55 + (p.hp / (p.maxHp * 0.3)) * 0.5; }
    }
  }

  updateTags() {
    const g = this.g, p = g.player, aim = g.aim;
    const cand = [];
    for (const c of g.chars) {
      if (c === p || !c.alive || c.hidden || c.underwater) continue;
      const dp = Math.hypot(c.x - p.x, c.z - p.z);
      if (dp > 34) continue;
      const da = Math.hypot(c.x - aim.x, c.z - aim.z);
      const named = !!c.npc;
      if (da < 7 || (named && dp < 12)) cand.push({ c, s: da - (named ? 4 : 0) });
    }
    cand.sort((a, b) => a.s - b.s);
    this.lastTags = [];
    this.tags.forEach((t, i) => {
      const e = cand[i];
      if (!e) { t.el.style.display = 'none'; t.id = null; return; }
      const c = e.c;
      if (t.id !== c.id) {
        t.id = c.id;
        t.img.src = this.flag(c.flag);
        t.name.textContent = c.npc?.name ?? c.name ?? '';
        t.el.style.setProperty('--acc', c.npc ? 'var(--gold)' : FACTION_COL[c.faction] ?? 'var(--muted)');
      }
      const y = c.seatPose?.y ?? 0;
      const [sx, sy, on] = this.screen(c.x, y + 2.3, c.z);
      t.el.style.display = on ? '' : 'none';
      t.el.style.transform = `translate(${sx.toFixed(0)}px, ${sy.toFixed(0)}px) translate(-50%, -100%)`;
      t.el.style.opacity = Math.max(0.35, 1 - e.s / 9).toFixed(2);
      this.lastTags.push({ id: c.id, name: t.name.textContent, flag: c.flag, faction: c.faction });
    });
  }

  updateCompass() {
    const g = this.g, p = g.player;
    const ox = p.inVehicle?.x ?? p.x, oz = p.inVehicle?.z ?? p.z;
    // Facing: the vehicle's nose when driving, else where you aim.
    const fx = p.inVehicle ? Math.sin(p.inVehicle.h) : g.aim.x - ox, fz = p.inVehicle ? Math.cos(p.inVehicle.h) : g.aim.z - oz;
    const head = (Math.atan2(fx, -fz) * 180 / Math.PI + 360) % 360; // 0 = north
    const marks = [];
    const add = (x, z, label, cls) => { const b = (Math.atan2(x - ox, -(z - oz)) * 180 / Math.PI + 360) % 360; marks.push({ b, label, cls, d: Math.round(Math.hypot(x - ox, z - oz)) }); };
    const wp = g.qol.waypoint ?? g.qol.objective()?.target;
    if (wp) add(wp.x, wp.z, '◆', 'wp');
    if (g.train?.present) add(RAIL.x, Math.max(g.train.head - g.train.length, Math.min(g.train.head, oz)), 'TRAIN', 'train');
    const cv = g.convoy?.active;
    if (cv) { const l = cv.members.find((m) => !m.v.dead); if (l) add(l.v.x, l.v.z, 'CONVOY', 'convoy'); }
    this.compassMarks = marks;
    // Strip spans ±90° around the heading, 3 px per degree.
    let html = '';
    const rel = (b) => { let r = b - head; r = ((r + 540) % 360) - 180; return r; };
    for (const [n, b] of BEARINGS) { const r = rel(b); if (Math.abs(r) < 92) html += `<span class="fb-cb${n.length === 1 ? ' major' : ''}" style="left:${(50 + r / 1.8).toFixed(1)}%">${n}</span>`; }
    for (let b = 0; b < 360; b += 15) { const r = rel(b); if (Math.abs(r) < 92 && b % 45) html += `<span class="fb-ct" style="left:${(50 + r / 1.8).toFixed(1)}%"></span>`; }
    // Off-ribbon markers pin to the edge with an arrow, stacked so they never overlap.
    const edge = { l: 0, r: 0 };
    for (const m of marks) {
      const r0 = rel(m.b), out = Math.abs(r0) > 88, side = r0 < 0 ? 'l' : 'r';
      const r = Math.max(-84, Math.min(84, r0));
      const label = out ? (side === 'l' ? `‹ ${m.label}` : `${m.label} ›`) : m.label;
      const lift = out ? `;bottom:${1 + edge[side]++ * 11}px` : '';
      html += `<span class="fb-cm ${m.cls}${out ? ' out' : ''}" style="left:${(50 + r / 1.8).toFixed(1)}%${lift}">${label}${out ? '' : `<small>${m.d}m</small>`}</span>`;
    }
    if (html !== this.lastStrip) { this.el.strip.innerHTML = html; this.lastStrip = html; }
    const r = Math.round(head);
    if (r !== this.lastHead) { this.el.read.textContent = String(r).padStart(3, '0'); this.lastHead = r; }
  }

  view() {
    return {
      killFeed: [...this.el.kills.children].map((k) => k.textContent.replace(/\s+/g, ' ').trim()),
      damageIndicators: this.dirs.map((d) => ({ bearing: Math.round(((d.ang * 180 / Math.PI) + 360) % 360), strength: +d.k.toFixed(2) })),
      nameTags: this.lastTags,
      compass: { heading: this.lastHead ?? 0, markers: this.compassMarks.map((m) => ({ label: m.label, bearing: Math.round(m.b), dist: m.d })) },
      floaters: this.floats.map((f) => f.el.textContent),
      lensBlood: this.el.lens.childElementCount,
    };
  }
}
