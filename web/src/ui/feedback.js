import * as THREE from 'three';
import { drawFlag, FLAGS } from './portrait.js';
import { RAIL } from '../world/rail.js';
import { paintRibbon } from './hudart.js';

// The feedback layer: everything that tells you what just happened without a toast.
// Damage-direction arcs, a kill feed (with flags), floating loot text, name tags with
// flags over people near your aim, a bearing ribbon with markers, blood on the lens,
// a low-ammo flash and a heartbeat when you're nearly dead. Driven by the event log,
// so anything that emits an event gets feedback for free. All DOM is pooled.

const _v = new THREE.Vector3();
// NAME TAGS (Robert's playtest 10-29: "when you're looking down, you shouldn't see the flag covering the person"). The flag
// lives ON the person (the faceted body's back patch, systems/lswbodies.js); the floating tag is small, beside the body
// (never over it), and only for who matters: the one you aim at (within `aim` m of the aim point), anyone within `near` m
// (`nearAll` with the Name tags setting on "Everyone close by"), and a running witness. At most `max`, fading in and out
// at `fade` per second. `side` is how far beside the body's middle the tag starts (m, toward the camera's right).
const TAGS = { aim: 2.2, near: 4, nearAll: 9, max: 4, fade: 6, side: 0.5, chest: 1.25 };
const FACTION_COL = { raider: 'var(--blood)', ally: 'var(--green)', zombie: 'oklch(0.62 0.12 125)', drifter: 'var(--muted)', town: 'var(--bone)' };
const BEARINGS = [['N', 0], ['NE', 45], ['E', 90], ['SE', 135], ['S', 180], ['SW', 225], ['W', 270], ['NW', 315]];
// The brass ribbon: 540 px of plate, a 488 px window, 3 px per degree (about ±80° in view).
const RIBBON_W = 540, CW = 488, PXD = 3, EDGE = 71;
const MARKS = 4; // waypoint, train, convoy, and your parked car while you're on foot
const rel = (b, head) => ((b - head + 540) % 360) - 180; // signed degrees from the heading

export class Feedback {
  constructor(game, root) {
    this.g = game;
    root.insertAdjacentHTML('beforeend', `
      <div class="fb">
        <div class="fb-lens"></div>
        <div class="fb-vig"></div>
        <div class="fb-reload hidden"><kbd>R</kbd> RELOAD</div>
        <div class="fb-dirs"></div>
        <div class="fb-tags"></div>
        <div class="fb-float"></div>
        <div class="fb-kills"></div>
        <div class="fb-compass"><canvas class="fb-ctex"></canvas><div class="fb-cwin"><div class="fb-cticks"></div>${BEARINGS.map(([n]) => `<span class="fb-cb${n.length === 1 ? ' major' : ''}">${n}</span>`).join('')}${'<span class="fb-cm"><b></b><small></small></span>'.repeat(MARKS)}</div><div class="fb-cnotch"></div><div class="fb-cread"></div></div>
      </div>`);
    const q = (s) => root.querySelector(s);
    this.el = { vig: q('.fb-vig'), reload: q('.fb-reload'), lens: q('.fb-lens'), dirs: q('.fb-dirs'), tags: q('.fb-tags'), float: q('.fb-float'), kills: q('.fb-kills'), ticks: q('.fb-cticks'), read: q('.fb-cread') };
    // The kill feed hangs under the cash plate in the HUD's right column when the HUD offers a slot.
    game.hud?.el?.killSlot?.appendChild(this.el.kills);
    const tex = q('.fb-ctex'), rib = paintRibbon(RIBBON_W, 36);
    tex.width = rib.width; tex.height = rib.height; tex.getContext('2d').drawImage(rib, 0, 0);
    this.cLabels = [...root.querySelectorAll('.fb-cb')].map((el) => ({ el, x: null, vis: true }));
    this.cMarkEls = [...root.querySelectorAll('.fb-cm')].map((el) => ({ el, b: el.firstChild, small: el.lastChild, key: '', x: null, d: null, vis: true }));
    this.seq = 0;
    this.dirs = [];   // {el, t, ang}
    this.floats = []; // {el, x, z, t, y0}
    this.kills = [];  // {el, t}
    this.tags = Array.from({ length: 8 }, () => { const el = document.createElement('div'); el.className = 'fb-tag'; el.innerHTML = '<img><span></span>'; this.el.tags.appendChild(el); return { el, img: el.firstChild, name: el.lastChild, id: null }; });
    this.flagUrl = {};
    this.heartT = 0;
    // compass markers: a fixed pool of rows, filled in place every frame (no per-frame allocation)
    this.markPool = Array.from({ length: MARKS }, () => ({ b: 0, label: '', cls: '', d: 0, out: false, side: 1, x: 0 }));
    this.markN = 0;
    this.lastTags = [];
  }
  get compassMarks() { return this.markPool.slice(0, this.markN); }

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

  // A number off whoever you hit (gold for a head shot), when the setting is on. combat.js calls it after the hit lands.
  damage(c, dmg, part) {
    if (!this.g.qol?.settings?.dmgNumbers || dmg < 0.5) return;
    this.floater(c.x + (Math.random() - 0.5) * 0.6, c.z + (Math.random() - 0.5) * 0.6, String(Math.round(dmg)), part === 'head' ? 'dmg head' : 'dmg');
  }

  killRow(e) {
    const g = this.g, p = g.player;
    if (g.qol?.settings?.killFeed === false) return;
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
    this.updateTags(dt);
    this.updateCompass();
    // Low ammo flash + heartbeat.
    const w = g.inv?.current, mag = g.inv?.mag?.[w];
    const size = { pistol: 6, smg: 32, shotgun: 2 }[w] ?? 6;
    g.hud.el.wmag.classList.toggle('low', mag !== undefined && mag <= Math.max(1, Math.floor(size * 0.25)));
    // An empty gun with auto-reload off says how to fix it; under 30% health the screen edge pulses red.
    const dry = !p.inVehicle && mag === 0 && g.qol?.settings?.autoReload === false && p.alive;
    if (dry !== this.dry) { this.dry = dry; this.el.reload.classList.toggle('hidden', !dry); }
    const low = p.alive && p.hp < p.maxHp * 0.3;
    if (low !== this.lowHp) { this.lowHp = low; this.el.vig.classList.toggle('on', low); }
    if (p.alive && p.hp < p.maxHp * 0.3) {
      this.heartT -= dt;
      if (this.heartT <= 0) { g.audio.heartbeat?.(1 - p.hp / (p.maxHp * 0.3)); this.heartT = 0.55 + (p.hp / (p.maxHp * 0.3)) * 0.5; }
    }
  }

  updateTags(dt = 0) {
    const g = this.g, p = g.player, aim = g.aim;
    const cand = [], mode = g.qol?.settings?.nameTags ?? 'aim'; // aim | near | off (the pause menu's Name tags)
    let aimed = null, aimD = TAGS.aim;
    for (const c of g.chars) {
      if (c === p || !c.alive || c.hidden || c.underwater) continue;
      const dp = Math.hypot(c.x - p.x, c.z - p.z);
      if (c.telling && dp < 60) { cand.push({ c, s: -10 }); continue; } // a witness running home: always tagged, first
      if (mode === 'off' || dp > 34) continue;
      const da = Math.hypot(c.x - aim.x, c.z - aim.z);
      if (da < aimD) { aimD = da; aimed = c; }
      if (dp < (mode === 'near' ? TAGS.nearAll : TAGS.near)) cand.push({ c, s: dp });
    }
    if (aimed && !cand.some((e) => e.c === aimed)) cand.push({ c: aimed, s: -1 }); // the one under your aim, before the rest
    cand.sort((a, b) => a.s - b.s);
    if (cand.length > TAGS.max) cand.length = TAGS.max;
    this.lastTags = [];
    // Wanted tags keep their slot (so a fade is one tag's), new ones take a slot that has faded out.
    const k = Math.min(1, dt * TAGS.fade);
    for (const t of this.tags) { t.want = false; if (t.c) for (const e of cand) if (e.c === t.c) { t.want = true; e.slot = t; } }
    for (const e of cand) {
      if (e.slot) continue;
      const t = this.tags.find((x) => !x.want && !(x.a > 0.02));
      if (t) { t.c = e.c; t.want = true; t.a = 0; t.id = null; e.slot = t; }
    }
    const cam = g.camera.matrixWorld.elements, rx = cam[0], ry = cam[1], rz = cam[2]; // the camera's right
    for (const t of this.tags) {
      t.a = (t.a ?? 0) + ((t.want ? 1 : 0) - (t.a ?? 0)) * (dt > 0 ? k : 1);
      const c = t.c;
      if (!c || t.a < 0.02 || (!t.want && (!c.alive || c.hidden))) { t.el.style.display = 'none'; if (!t.want) { t.c = null; t.id = null; t.a = 0; } continue; }
      const key = c.telling ? c.id + ':w' : c.name === 'Sprinter' ? c.id + ':s' : c.id; // a tag re-reads when what it says changes
      if (t.id !== key) {
        t.id = key;
        t.img.src = this.flag(c.flag);
        t.name.textContent = (c.telling ? 'WITNESS · ' : '') + (c.npc?.name ?? c.name ?? '');
        t.el.style.setProperty('--acc', c.telling ? 'var(--blood, #ff3b3b)' : c.npc ? 'var(--gold)' : FACTION_COL[c.faction] ?? 'var(--muted)');
        t.el.classList.toggle('runner', !!c.telling);
      }
      // Beside the body: the chest's screen point, pushed right by what `side` metres are on screen there, the tag's
      // left edge at that point and its middle at chest height. It never sits on the person.
      const y = (c.seatPose?.y ?? 0) + TAGS.chest;
      const [sx, sy, on] = this.screen(c.x, y, c.z), [bx] = this.screen(c.x + rx * TAGS.side, y + ry * TAGS.side, c.z + rz * TAGS.side);
      t.el.style.display = on ? '' : 'none';
      t.el.style.transform = `translate(${(sx + Math.max(10, bx - sx) + 4).toFixed(0)}px, ${sy.toFixed(0)}px) translate(0, -50%)`;
      t.el.style.opacity = (c.telling ? 1 : t.a * 0.92).toFixed(2);
      if (t.want) this.lastTags.push({ id: c.id, name: t.name.textContent, flag: c.flag, faction: c.faction, runner: !!c.telling, aimed: c === aimed });
    }
  }

  updateCompass() {
    const g = this.g, p = g.player;
    const ox = p.inVehicle?.x ?? p.x, oz = p.inVehicle?.z ?? p.z;
    // Facing: the vehicle's nose when driving, else where you aim.
    const fx = p.inVehicle ? Math.sin(p.inVehicle.h) : g.aim.x - ox, fz = p.inVehicle ? Math.cos(p.inVehicle.h) : g.aim.z - oz;
    const head = (Math.atan2(fx, -fz) * 180 / Math.PI + 360) % 360; // 0 = north
    this.markN = 0;
    const wp = g.qol.waypoint ?? g.qol.objective()?.target;
    if (wp) this.addMark(ox, oz, wp.x, wp.z, '◆', 'wp');
    if (g.train?.present) this.addMark(ox, oz, RAIL.x, Math.max(g.train.head - g.train.length, Math.min(g.train.head, oz)), 'TRAIN', 'train');
    const cv = g.convoy?.active;
    if (cv) { const l = cv.members.find((m) => !m.v.dead); if (l) this.addMark(ox, oz, l.v.x, l.v.z, 'CONVOY', 'convoy'); }
    const car = !p.inVehicle && g.lastVehicle;
    if (car && !car.dead && Math.hypot(car.x - ox, car.z - oz) > 14) this.addMark(ox, oz, car.x, car.z, 'CAR', 'car');
    // Tick marks are two repeating gradients slid under the window: one style write while you turn.
    const off = Math.round((CW / 2 - head * PXD) * 10) / 10;
    if (off !== this.cOff) { this.cOff = off; this.el.ticks.style.backgroundPositionX = `${off}px, ${off}px`; }
    // Markers first: on the ribbon at their bearing, or pinned to the edge and queued inward so they never overlap.
    let stackL = 0, stackR = 0;
    for (let i = 0; i < this.markN; i++) {
      const m = this.markPool[i], r0 = rel(m.b, head);
      m.out = Math.abs(r0) > EDGE; m.side = r0 < 0 ? -1 : 1;
      const n = m.out ? (m.side < 0 ? stackL++ : stackR++) : 0;
      m.x = Math.round(CW / 2 + Math.max(-EDGE, Math.min(EDGE, r0)) * PXD - m.side * n * 50);
    }
    // A bearing letter steps aside for a named marker sitting on it (TRAIN due west hides the W); the waypoint's
    // needle runs behind the letters instead.
    for (let i = 0; i < BEARINGS.length; i++) {
      const L = this.cLabels[i], r = rel(BEARINGS[i][1], head), x = Math.round(CW / 2 + r * PXD);
      let vis = Math.abs(r) < 86;
      for (let k = 0; vis && k < this.markN; k++) { const m = this.markPool[k]; if (m.cls !== 'wp' && Math.abs(m.x - x) < 34) vis = false; }
      if (vis !== L.vis) { L.vis = vis; L.el.style.display = vis ? '' : 'none'; }
      if (vis && x !== L.x) { L.x = x; L.el.style.transform = `translateX(${x}px)`; }
    }
    for (let i = 0; i < MARKS; i++) {
      const M = this.cMarkEls[i], m = i < this.markN ? this.markPool[i] : null;
      if (!m) { if (M.vis) { M.vis = false; M.el.style.display = 'none'; } continue; }
      if (!M.vis) { M.vis = true; M.el.style.display = ''; }
      const out = m.out, side = m.side;
      const key = out ? (side < 0 ? 'L' : 'R') + m.cls : m.cls;
      if (key !== M.key) {
        M.key = key;
        M.el.className = `fb-cm ${m.cls}${out ? (side < 0 ? ' out l' : ' out r') : ''}`;
        // the waypoint is drawn (a red needle and diamond); named markers keep their words
        const arrow = side < 0 ? '‹' : '›';
        M.b.textContent = m.cls === 'wp' ? (out ? arrow : '') : out ? (side < 0 ? `‹ ${m.label}` : `${m.label} ›`) : m.label;
      }
      if (!out && m.d !== M.d) { M.d = m.d; M.small.textContent = `${m.d}M`; }
      if (m.x !== M.x) { M.x = m.x; M.el.style.transform = `translateX(${m.x}px)`; }
    }
    const r = Math.round(head);
    if (r !== this.lastHead) { this.el.read.textContent = String(r).padStart(3, '0'); this.lastHead = r; }
  }
  addMark(ox, oz, x, z, label, cls) {
    if (this.markN >= MARKS) return;
    const m = this.markPool[this.markN++];
    m.b = (Math.atan2(x - ox, -(z - oz)) * 180 / Math.PI + 360) % 360; m.label = label; m.cls = cls; m.d = Math.round(Math.hypot(x - ox, z - oz));
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
