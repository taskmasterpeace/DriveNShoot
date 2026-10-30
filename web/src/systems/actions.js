// TIMED ACTIONS (docs/design/WEB_TIMED_ACTIONS.md; rows in data/actions.js). One system runs every interaction that takes
// time: searching a crate or a body, looking round the ground, kicking, picking, prying, cutting or smashing a lock,
// ducking under a jammed roll-up, climbing a ladder, setting one up. Each runs off its row the same way:
//   - the interact key held keeps it going; let go and it stops (progress kept on the target where the row says keep)
//   - a hit, walking off, or a hostile coming into sight cancels it (the row's stop)
//   - it is heard while it runs (noise) and when it lands (bang): the infected and raiders come to the sound
//   - the body holds the row's pose on the shared solver (ch.act -> systems/actposes.js)
//   - the HUD shows a progress ring (data/hudlayout.js 'actring'), and the prompt says what is happening
//   - a tool wears (slot.wear 0..1, broken at 1); attributes and the deep sheet speed it (row.attr / row.fx)
// It also owns what those verbs need in the world: what a container shows when only opened (CONCEAL), the small
// things lying unseen on the ground until someone looks (lost), ladders (pieces + climbing), padlocks, half-open
// roll-ups, and the marks a break-in leaves. Everything is drawn in one instanced mesh.
// main.js calls: update(dt) every frame; busyBody(p, I, dt) before the player moves (climbing, ducking under);
// ladderKey / boxKey / lookKey in the E chain; interiors.playerInteract calls doorKey, citygen.bayInteract bayKey.
import * as THREE from 'three';
import { ACTIONS, HURT, LOCK_KINDS, SLEDGE_HITS, PADLOCKS, BREAK_MARKS, CONCEAL, CONCEAL_SIZE, HIDDEN, LOOK, LADDER, LADDER_KINDS, LADDER_PLACE, ROLLUP, RING } from '../data/actions.js';
import { ITEMS } from '../data/items.js';
import { WINDOW } from '../data/interiors.js';

const HOLD_TAP = WINDOW.holdTap; // a shorter press is a tap (open, one kick, climb on)
const MAXI = 1400;               // instanced world pieces (ladder rails and rungs, padlocks, splinters, a fallen leaf)
const r1 = (v) => Math.round(v * 10) / 10, r2 = (v) => Math.round(v * 100) / 100;
const h01 = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };
const _o = new THREE.Object3D(), _c = new THREE.Color(), ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const NOTHING = [];
const MARK_OF = { kicked: 'kicked', picked: 'picked', pried: 'pried', cut: 'cut', sledged: 'sledged', blast: 'sledged' };

export class Actions {
  constructor(game) {
    this.g = game;
    this.cur = null;               // the player's running action
    this.hold = 0; this.holdOn = null; // E held on a target (tap vs hold)
    this.prefer = null;            // a verb the next held E at a lock tries first (the agent's act verb=, or a tool chosen)
    this.prog = new Map();         // target key -> kept seconds of progress
    this.marks = new Map();        // door / bay id -> mark kind (BREAK_MARKS)
    this.ladders = [];             // world ladders: { id, kind, x, z, nx, nz, y0, y1, tx, tz, retracted, town, owner }
    this.lost = new Map();         // unseen small things: pile id -> { id, town, item, n }
    this.lostDone = new Set();     // seeded lost things found (or taken): never seeded again (no regeneration)
    this.found = [];               // the last look-around's finds (the act command reports them)
    this.towns = new Set();        // citygen towns already dressed (ladders, jams, lost things)
    this.scanT = 0; this.drawT = 0; this.dirty = true; this.lastSince = 99; this.threatT = 0; this.threat = null;
    this.counts = { started: 0, done: 0, cancelled: 0, released: 0, searches: 0, bodySearches: 0, finds: 0, kicks: 0, picks: 0, pries: 0, cuts: 0, sledges: 0, ducks: 0, rungs: 0, falls: 0, ladders: 0, hurt: 0, shotsBlocked: 0 };
    this.log = [];                 // the last actions: { id, ok, why, secs }
    this.buildRing();
    this.buildMesh(game.scene);
  }

  // ---- the running action ------------------------------------------------------------------------------------------
  // How long a row takes this person: base x the target's own multiplier x attribute x deep-sheet fx.
  factor(row, by = this.g.player) {
    let k = 1;
    const D = this.g.deep;
    if (row.attr && D?.attrs && by === this.g.player) k *= Math.max(0.5, 1 - (row.mul ?? 0) * ((D.attrs[row.attr] ?? 5) - 5));
    if (row.fx && D?.fx && by === this.g.player) k *= D.fx[row.fx] ?? 1;
    return k;
  }

  // Start (or carry on) an action. o: { key (progress key), kindMul, onDone, onHit, hits, target, x, z (work spot to face) }
  start(id, o = {}) {
    const g = this.g, p = g.player, row = ACTIONS[id];
    if (!row) return null;
    if (this.cur?.id === id && this.cur.key === o.key) return this.cur;
    if (this.cur) this.stop('replaced');
    const need = row.dur * (o.kindMul ?? 1) * this.factor(row, p);
    const kept = row.keep && o.key ? this.prog.get(o.key) ?? 0 : 0;
    this.cur = { id, row, key: o.key ?? null, t: kept, wall: 0, need, x0: p.x, z0: p.z, noiseT: 0, hitT: 0, hits: 0, o, target: o.target ?? null, fx: o.x ?? p.x, fz: o.z ?? p.z };
    p.act = { pose: row.pose, t: 0, k: need > 0 ? kept / need : 0, rung: 0, dur: row.dur * this.factor(row, p) };
    this.lastSince = p.sinceHit ?? 99;
    this.counts.started++;
    g.emit('actionStart', { id, key: o.key ?? null, need: r2(need), kept: r2(kept) });
    return this.cur;
  }

  // Stop the running action. why: done | released | damage | moved | threat | replaced | gone
  stop(why) {
    const c = this.cur, g = this.g;
    if (!c) return;
    if (c.row.keep && c.key && why !== 'done') this.prog.set(c.key, c.t);
    if (why === 'done' && c.key) this.prog.delete(c.key);
    this.cur = null;
    g.player.act = null;
    if (why !== 'done' && why !== 'released') this.hold = -1; // cancelled: the key must come up and go down again before it starts over
    if (why === 'done') this.counts.done++; else if (why === 'released') this.counts.released++; else this.counts.cancelled++;
    this.log.push({ id: c.id, why, secs: r2(c.wall), t: r2(c.t), need: r2(c.need) }); if (this.log.length > 20) this.log.shift();
    g.emit('actionEnd', { id: c.id, why, secs: r2(c.wall), progress: c.need > 0 ? r2(Math.min(1, c.t / c.need)) : 1 });
    if (why !== 'done' && why !== 'released' && why !== 'replaced') g.hud?.toast?.(`${c.row.label.toUpperCase()} · ${why === 'damage' ? 'HIT, STOPPED' : why === 'threat' ? 'SOMETHING\'S COMING' : why === 'moved' ? 'STOPPED' : 'STOPPED'}`, 'warn');
    this.ring(null);
  }

  // Advance the running action one frame. held: the key is down. Returns the action or null (it ended).
  tick(dt, held) {
    const c = this.cur, g = this.g, p = g.player;
    if (!c) return null;
    if (!held) { this.stop('released'); return null; }
    const S = c.row.stop;
    if (S.damage && (p.sinceHit ?? 99) < this.lastSince - 1e-6) { this.lastSince = p.sinceHit; this.stop('damage'); return null; }
    this.lastSince = p.sinceHit ?? 99;
    if (S.move !== false && Math.hypot(p.x - c.x0, p.z - c.z0) > S.move) { this.stop('moved'); return null; }
    if (S.threat && this.threatInSight(S.threat)) { this.stop('threat'); return null; }
    const R = c.row;
    c.wall += dt;
    p.speed = 0; p.aiming = false;
    p.face = Math.atan2(c.fx - p.x, c.fz - p.z) || p.face;
    if (R.noise[0] > 0) { c.noiseT -= dt; if (c.noiseT <= 0) { c.noiseT = R.noise[1] || 1; g.noise(p.x, p.z, R.noise[0], p); } }
    if (R.per === 'hit') {
      c.hitT += dt;
      p.act.t = c.hitT;
      if (c.hitT >= c.need) {
        c.hitT -= c.need; c.hits++;
        const fin = c.o.onHit?.(c);
        if (fin) { this.stop('done'); c.o.onDone?.(c); return null; }
      }
      this.ring(c.o.label ?? R.label, c.o.hits ? Math.min(1, (c.hits + c.hitT / c.need) / c.o.hits) : (c.hitT / c.need));
      return c;
    }
    if (R.per === 'scan') { p.act.t += dt; return c; } // look-around runs its own finds (lookKey)
    c.t += dt;
    p.act.t += dt; p.act.k = c.need > 0 ? Math.min(1, c.t / c.need) : 1;
    this.ring(c.o.label ?? R.label, p.act.k);
    if (c.t >= c.need) { this.stop('done'); c.o.onDone?.(c); return null; }
    return c;
  }

  // A hostile in sight inside r m: the living infected, raiders, anyone hunting you; same floor, a clear line. Checked
  // 4x a second (the answer is held between checks).
  threatInSight(r) {
    const g = this.g, p = g.player;
    if ((this.threatT -= g.dt ?? 1 / 60) > 0) return !!this.threat;
    this.threatT = 0.25; this.threat = null;
    for (const c of g.chars) {
      if (c === p || !c.alive || (c.faction !== 'zombie' && c.faction !== 'raider' && c.target !== p)) continue;
      if (c.crewOf || c.faction === 'ally') continue;
      const d = Math.hypot(c.x - p.x, c.z - p.z);
      if (d > r || (g.storeys && !g.storeys.sameFloor(p, c))) continue;
      if (g.statics?.lineOfSight && !g.statics.lineOfSight(p.x, p.z, c.x, c.z)) continue;
      this.threat = c; return true;
    }
    return false;
  }

  // The tap/hold split on E for a target: returns 'tap' on a release before HOLD_TAP, 'hold' while held past it, null.
  press(target, I, dt) {
    const down = I.key('KeyE');
    if (this.holdOn !== target) { this.hold = 0; this.holdOn = target; if (this.cur && this.cur.target !== target && this.cur.id !== 'climb') this.stop('gone'); }
    if (down) { if (this.hold >= 0) this.hold += dt; return this.hold >= HOLD_TAP ? 'hold' : null; }
    const was = this.hold; this.hold = 0;
    return was > 0 && was < HOLD_TAP ? 'tap' : null;
  }
  // Every frame, after the player's update (main.js frame). An E chain that did not reach us this frame (walked off,
  // a menu opened, something else took the key) lets go of the target and ends what was running on it.
  update(dt) {
    const g = this.g;
    if (this.cur?.o.auto) this.tick(dt, true); // set going from the pack (a ladder): runs on its own while you stand there
    else if (!this.touched) { this.holdOn = null; this.hold = 0; if (this.cur && !g.player.duck) this.stop('gone'); }
    this.touched = false;
    // The marks: every lock that gives, by any hand and any path (the agent's kick, an Echo at the boards), leaves one.
    const ev = g.events;
    for (let i = ev.length - 1; i >= 0 && ev[i].seq > (this.evSeq ?? 0); i--) {
      const e = ev[i];
      if (e.type === 'doorUnlocked' && MARK_OF[e.how]) { const d = g.interiors?.byId.get(e.door); if (d && !this.marks.has(d.id)) this.mark(d.id, MARK_OF[e.how], this.doorAt(d)); }
    }
    if (ev.length) this.evSeq = ev[ev.length - 1].seq;
    if ((this.scanT -= dt) <= 0) { this.scanT = 1; this.dress(); }
    if ((this.drawT -= dt) <= 0 || this.dirty) { this.drawT = 0.5; this.draw(); }
  }
  touch() { this.touched = true; }

  // ---- tools --------------------------------------------------------------------------------------------------------
  toolSlot(id) { return this.g.inventory?.carried.slots.find((s) => s.id === id && (s.left === undefined || s.left > 0)) ?? null; }
  has(id) { return !!this.toolSlot(id); }
  // A completion wears the tool (row.wear); at 1 it breaks.
  wear(id, amount) {
    const inv = this.g.inventory, s = this.toolSlot(id);
    if (!s || !(amount > 0)) return s ? s.wear ?? 0 : null;
    s.wear = r2((s.wear ?? 0) + amount);
    if (s.wear >= 1) { inv.take(inv.carried, inv.carried.slots.indexOf(s), 1); this.g.hud?.toast?.(`YOUR ${ITEMS[id].name.toUpperCase()} BROKE`, 'warn'); this.g.emit('toolBroke', { item: id }); }
    inv.changed?.();
    return s.wear;
  }

  // ---- OPEN vs SEARCH -----------------------------------------------------------------------------------------------
  concealOf(box) { return box.id.startsWith('body:') ? CONCEAL.body : CONCEAL[box.kind] ?? CONCEAL.default; }
  // First look into a box: what is on top shows, small things may be out of sight (box.hidden) until it is searched.
  // Decided per slot from the box's own seed, once (no reroll): the split is part of what the box is.
  // Each slot is decided once, from the box's own seed, and marked in place (s.hid true/false): the flags ride in the box's
  // own slots, so a save, a ring chunk going away and coming back, an NPC going through it all carry them. The PACK screen
  // lists only the slots without s.hid (ui/inventory.js vis). Every slot carrying the flag = this box has been looked into.
  sorted(box) { return box.searched || box.slots.some((q) => q.hid !== undefined); }
  hiddenN(box) { let n = 0; for (const q of box.slots) if (q.hid) n++; return n; }
  conceal(box) {
    if (this.sorted(box) || !this.concealable(box)) return box;
    const C = this.concealOf(box);
    box.slots.forEach((s, i) => {
      const it = ITEMS[s.id];
      const big = !it || it.kind === 'gun' || (it.bulk ?? 0) >= CONCEAL_SIZE.BIG || it.pack;
      const always = HIDDEN.includes(s.id);
      const small = (it?.bulk ?? 0) < CONCEAL_SIZE.SMALL;
      const roll = h01(`${box.id}:${box.seed}:${i}:${s.id}`);
      s.hid = !big && (always || C.hide >= 1 || (small && roll < C.hide) || (!small && roll < C.hide * 0.35));
    });
    return box;
  }
  // Only the world's own stock is out of sight on a first look: a box rolled from its loot table right now, a body, or a
  // crate the world stocked (box.stocked). Whatever a person put in a box (your husk, a locker, a trunk, a pile) shows.
  concealable(box) { return !box.husk && box.kind !== 'ground' && box.kind !== 'person' && box.kind !== 'trunk' && (box.id.startsWith('body:') || box.stocked || !box.rolled); }
  // Open a box the way the PACK screen does (ui/inventory.js pickOther): its roll (first time), then the top only.
  openTop(box) { const inv = this.g.inventory; const c = this.concealable(box); inv.open(box); if (c) this.conceal(box); inv.opened = box; return box; }
  // A full search: everything out of sight comes out.
  reveal(box) {
    const inv = this.g.inventory;
    const c = this.concealable(box);
    if (!box.rolled) { inv.open(box); inv.opened = null; }
    if (c) this.conceal(box);
    const n = this.hiddenN(box);
    for (const q of box.slots) q.hid = false;
    box.searched = true;
    this.g.emit('searched', { id: box.id, body: box.id.startsWith('body:'), found: n });
    return n;
  }
  needsSearch(box) { return !box.searched && (this.sorted(box) ? this.hiddenN(box) > 0 : this.concealable(box)); }
  // E at a container (main.js box branch): tap opens it (the top), hold searches it properly. Returns true when handled.
  boxKey(box, I, dt) {
    const g = this.g, p = g.player;
    this.touch();
    const body = box.id.startsWith('body:'), id = body ? 'search_body' : 'search_box', label = body ? 'Patting down the body' : `Searching the ${box.label.split(' · ')[0].toLowerCase()}`;
    const what = box.kind === 'ground' ? 'Pick through what\'s here' : box.husk ? 'Go through your husk' : body ? 'Go through the body' : `Open the ${box.label.split(' · ')[0].toLowerCase()}`;
    const owner = box.owner ? ` · <b class="warn">${box.ownerName}'s</b>` : '';
    if (!this.needsSearch(box)) {
      g.hud.prompt(`<kbd>E</kbd> ${what}${owner}`);
      if (I.hit('KeyE')) { this.holdOn = box; this.hold = -1; g.invUI.toggle(true); g.hud.prompt(null); }
      return true;
    }
    const k = this.press(box, I, dt);
    if (k === 'tap') { g.invUI.toggle(true); g.hud.prompt(null); return true; }
    if (k === 'hold') {
      const c = this.start(id, { key: `box:${box.id}`, kindMul: this.concealOf(box).dur, target: box, x: box.x, z: box.z, label,
        onDone: () => { const n = this.reveal(box); this.counts[body ? 'bodySearches' : 'searches']++; g.hud.toast(n ? `FOUND ${n} MORE` : 'NOTHING ELSE IN THERE', 'job'); this.hold = -1; g.invUI.toggle(true); } });
      if (c) this.tick(dt, true);
      if (this.cur) g.hud.prompt(`${label}… ${Math.round(Math.min(1, this.cur.t / this.cur.need) * 100)}%`);
      return true;
    }
    if (this.cur?.target === box) this.tick(dt, false);
    const kept = this.prog.get(`box:${box.id}`);
    g.hud.prompt(`<kbd>E</kbd> ${what} · hold <kbd>E</kbd> ${body ? 'Pat them down' : 'Search it properly'}${kept ? ` (${Math.round((kept / (ACTIONS[id].dur * this.concealOf(box).dur * this.factor(ACTIONS[id]))) * 100)}% done)` : ''}${owner}`);
    return true;
  }

  // ---- LOOK AROUND --------------------------------------------------------------------------------------------------
  // Something small, dropped, lying unseen until someone looks (a world placement; a seeded one is never seeded twice).
  dropSmall(item, n, x, z, y = 0, o = {}) {
    const inv = this.g.inventory, id = o.id ?? `lost:${++this.lostN || (this.lostN = 1)}`;
    if (inv.boxes.has(id)) return inv.boxes.get(id);
    const b = inv.place(id, 'ground', x, z, 999, 'THE GROUND', o.seed);
    if (y > 0.5) b.y = y;
    b.rolled = true; b.unseen = true;
    inv.add(b, item, n);
    this.lost.set(id, { id, town: o.town ?? null, item, n });
    return b;
  }
  lookRadius() { return LOOK.radius + LOOK.eyeRadius * ((this.g.deep?.attrs?.eye ?? 5) - 5); }
  // The unseen pile nearest (x, z) within r on your floor, not yet found.
  nextUnseen(x, z, r, y) {
    let best = null, bd = r;
    for (const id of this.lost.keys()) {
      const b = this.g.inventory.boxes.get(id);
      if (!b?.unseen || Math.abs((b.y ?? 0) - y) > 1.5) continue;
      const d = Math.hypot(b.x - x, b.z - z);
      if (d <= bd) { bd = d; best = b; }
    }
    return best ? { b: best, d: bd } : null;
  }
  // E held with nothing else in reach: head down, scanning the ground. Finds come one at a time, nearest first.
  lookKey(p, I, dt) {
    const g = this.g;
    this.touch();
    const k = this.press('look', I, dt);
    if (k !== 'hold') { if (this.cur?.id === 'look_around') this.tick(dt, false); return false; }
    if (!this.cur || this.cur.id !== 'look_around') { this.start('look_around', { target: 'look', x: p.x + Math.sin(p.face), z: p.z + Math.cos(p.face) }); this.found = []; this.lookT = 0; this.lookOn = null; }
    if (!this.tick(dt, true)) return true;
    const R = this.lookRadius(), n = this.nextUnseen(p.x, p.z, R, p.gy ?? 0);
    const f = this.factor(ACTIONS.look_around);
    if (n && this.found.length < LOOK.maxFinds) {
      if (this.lookOn !== n.b) { this.lookOn = n.b; this.lookT = 0; }
      this.lookT += dt;
      const need = (LOOK.base + LOOK.perM * n.d) * f;
      this.cur.fx = n.b.x; this.cur.fz = n.b.z;
      this.ring('Looking around', Math.min(1, this.lookT / need));
      if (this.lookT >= need) {
        n.b.unseen = false; this.lookOn = null;
        const L = this.lost.get(n.b.id); if (L) this.lostDone.add(n.b.id);
        const s = n.b.slots[0], name = s ? ITEMS[s.id]?.name ?? s.id : 'something';
        this.found.push({ id: n.b.id, item: s?.id ?? null, n: s?.n ?? 0, d: r1(n.d), secs: r2(this.cur.wall) });
        this.counts.finds++;
        g.inventory.drawPiles?.();
        g.hud.toast(`SPOTTED: ${name.toUpperCase()}${s?.n > 1 ? ` x${s.n}` : ''}`, 'job');
        g.emit('lookFound', { id: n.b.id, item: s?.id ?? null, d: r1(n.d) });
      }
      g.hud.prompt(`Looking around… <b>${R.toFixed(1)} m</b>`);
    } else {
      const tr = LOOK.tracks ? g.outdoors?.tracksNear?.(p.x, p.z, R) : null;
      this.ring('Looking around', (this.cur.wall % 1.5) / 1.5);
      g.hud.prompt(tr ? `Looking around… ${tr}` : 'Looking around… nothing here');
    }
    return true;
  }

  // ---- BREAK-INS ------------------------------------------------------------------------------------------------------
  lockKind(door) { return door.padlock ? 'padlock' : 'door'; }
  // The verbs open to you at a lock: what works on its kind, and what you carry (kick needs no tool).
  verbsFor(kind) { return LOCK_KINDS[kind].verbs.filter((v) => !ACTIONS[v].tool || this.has(ACTIONS[v].tool)); }
  pick(kind) { const vs = this.verbsFor(kind); return this.prefer && vs.includes(this.prefer) ? this.prefer : vs[0] ?? null; }
  verbWord(v) { return { pick: 'Pick the lock (quiet)', pry: 'Pry it (loud)', cut: 'Cut the chain', sledge: 'Smash it in (very loud)', kick: 'Keep kicking' }[v] ?? v; }
  mark(id, kind, at) { this.marks.set(id, { kind, x: at.x, z: at.z, y: at.y ?? 0, nx: at.nx ?? 0, nz: at.nz ?? 0, ux: at.ux ?? 1, uz: at.uz ?? 0, w: at.w ?? 1 }); this.dirty = true; this.g.emit('breakIn', { id, how: kind }); }
  doorAt(d) { return { x: d.lockX ?? d.x, z: d.lockZ ?? d.z, y: d.y ?? 0, nx: d.nx, nz: d.nz, ux: d.ux ?? (d.axis === 'x' ? 1 : 0), uz: d.uz ?? (d.axis === 'x' ? 0 : 1), w: d.width }; }
  // One kick at a door (the tap, and each hit of the held kick): strength may take an extra kick out of it, and a boot
  // on a locked door can hurt you.
  kickOnce(door, p) {
    const g = this.g, I = g.interiors, brawn = g.deep?.attrs?.brawn ?? 5;
    if (door.locked && !door.padlock && door.kicks > 1 && Math.random() < Math.max(0, (brawn - 5) * 0.1)) door.kicks--; // a big man takes two out of it
    const r = I.kick(door, p);
    if (!r.kicked) return r;
    this.counts.kicks++;
    if (door.locked || r.padlock) {
      const H = HURT.kick, ch = Math.max(0.01, H.chance - H.perBrawn * (brawn - 5));
      if (Math.random() < ch) { g.combat?.damage?.(p, H.hp, null, 0, 0, 'kick'); this.counts.hurt++; g.hud?.toast?.(H.why.toUpperCase(), 'warn'); }
    }
    return r;
  }
  // E at a door (interiors.playerInteract hands its door here). Unlocked: a tap kicks it open. Locked: a tap kicks (a
  // padlock holds against a boot), a hold works the lock with the best verb you have (quietest first).
  doorKey(p, I, dt, door) {
    const g = this.g;
    this.touch();
    if (!door.locked) { if (I.hit('KeyE')) { this.hold = -1; this.holdOn = door; this.kickOnce(door, p); } g.hud.prompt('<kbd>E</kbd> Kick the door open'); return; }
    door.wasLocked = true;
    const kind = this.lockKind(door), verb = this.pick(kind), K = LOCK_KINDS[kind];
    const k = this.press(door, I, dt);
    if (k === 'tap') { this.kickOnce(door, p); if (door.padlock) g.hud.toast('THE CHAIN HOLDS', 'warn'); return; }
    if (k === 'hold' && verb) { this.runLock(door, verb, dt); return; }
    if (this.cur?.target === door) this.tick(dt, false);
    const tap = kind === 'padlock' ? '<kbd>E</kbd> Rattle the chain' : `<kbd>E</kbd> Kick the door in · locked (${door.kicks} more)`;
    g.hud.prompt(`${tap}${verb && verb !== 'kick' ? ` · hold <kbd>E</kbd> ${this.verbWord(verb)}` : verb === 'kick' ? ' · hold <kbd>E</kbd> Keep kicking' : ` · ${K.name}: you need bolt cutters`}`);
  }
  // Run a lock verb on a door this frame (held). The verb's row does the timing; this says what landing it means.
  runLock(door, verb, dt) {
    const g = this.g, p = g.player, R = ACTIONS[verb], at = this.doorAt(door);
    const key = `${verb}:${door.id}`;
    const opts = { key, target: door, x: door.x, z: door.z, label: R.label };
    if (verb === 'kick') { opts.hits = Math.max(1, door.kicks); opts.onHit = () => { this.kickOnce(door, p); return !door.locked; }; }
    else if (verb === 'sledge') {
      opts.hits = SLEDGE_HITS[door.material] ?? SLEDGE_HITS.default;
      opts.onHit = (c) => {
        g.noise(door.x, door.z, R.bang, p); g.audio?.thud?.(g.pan(door.x)); g.fx?.dust?.(door.x, door.z, 3); g.hud?.shake?.(0.35);
        if (c.hits < opts.hits) return false;
        door.padlock = false; g.interiors.unlock(door, 'sledged', p, true); door.broken = true; g.materials?.brokenDoors?.add(door.id); g.interiors.flush?.();
        this.wear('sledgehammer', R.wear); this.counts.sledges++;
        return true;
      };
    } else opts.onDone = () => {
      if (R.bang) g.noise(door.x, door.z, R.bang, p);
      if (verb === 'pick') { g.inventory.forceLock(door, 'pick'); this.counts.picks++; }
      else if (verb === 'pry') { g.inventory.forceLock(door, 'pry'); this.wear('crowbar', R.wear); this.counts.pries++; }
      else if (verb === 'cut') { door.padlock = false; g.interiors.unlock(door, 'cut', p, false); g.audio?.burst?.({ dur: 0.1, freq: 2400, type: 'bandpass', q: 4, vol: 0.3, decay: 0.08 }); this.wear('bolt_cutters', R.wear); this.counts.cuts++; }
      g.emit('lockBroken', { door: door.id, how: verb });
      this.hold = -1;
    };
    if (verb === 'pick' && door.padlock) opts.kindMul = 1.2; // a padlock's pins are smaller
    if (this.start(verb, opts)) this.tick(dt, true);
    if (this.cur) g.hud.prompt(`${R.label}…${this.cur.row.per === 'hit' ? ` ${this.cur.hits}/${opts.hits}` : ` ${Math.round(Math.min(1, this.cur.t / this.cur.need) * 100)}%`}`);
  }

  // ---- ROLL-UP BAYS (citygen.bayInteract hands a bay here first; null falls through to its own up/down) -------------------
  bayKey(p, I, dt, t, b) {
    const g = this.g;
    if (b.half && !b.open) {
      this.touch();
      const k = this.press(b, I, dt);
      if (k === 'tap') g.hud.toast('JAMMED · IT WON\'T GO HIGHER', 'warn');
      if (k === 'hold' || this.cur?.id === 'duck_under') { if (!p.duck) this.startDuck(p, b); return { x: b.x, z: b.z, len: Math.min(4, b.w) }; }
      g.hud.prompt('Jammed half up · hold <kbd>E</kbd> Duck under');
      return { x: b.x, z: b.z, len: Math.min(4, b.w) };
    }
    if (b.locked && !b.open) {
      this.touch();
      const verb = this.pick('bay'), k = this.press(b, I, dt);
      if (k === 'hold' && verb) {
        const R = ACTIONS[verb], at = { x: b.x, z: b.z, nx: b.nx, nz: b.nz, ux: b.nz ? 1 : 0, uz: b.nz ? 0 : 1, w: b.w };
        const opts = { key: `${verb}:${b.id}`, target: b, x: b.x, z: b.z, label: R.label };
        const land = () => { t && g.citygen.setBay(t, b, false, false); this.mark(b.id, verb === 'sledge' ? 'sledged' : verb === 'pick' ? 'picked' : 'cut', at); this.hold = -1; };
        if (verb === 'sledge') { opts.hits = 2; opts.onHit = (c) => { g.noise(b.x, b.z, R.bang, p); g.hud?.shake?.(0.3); if (c.hits < 2) return false; land(); this.wear('sledgehammer', R.wear); this.counts.sledges++; return true; }; }
        else opts.onDone = () => { if (R.bang) g.noise(b.x, b.z, R.bang, p); if (verb === 'pick') { const s = this.toolSlot('lockpicks'); if (s && --s.left <= 0) g.inventory.take(g.inventory.carried, g.inventory.carried.slots.indexOf(s), 1); this.counts.picks++; } else { this.wear('bolt_cutters', R.wear); this.counts.cuts++; } land(); };
        if (this.start(verb, opts)) this.tick(dt, true);
        if (this.cur) g.hud.prompt(`${R.label}… ${this.cur.row.per === 'hit' ? `${this.cur.hits}/2` : `${Math.round(Math.min(1, this.cur.t / this.cur.need) * 100)}%`}`);
      } else {
        if (this.cur?.target === b) this.tick(dt, false);
        g.hud.prompt(verb ? `Padlocked roll-up door · hold <kbd>E</kbd> ${this.verbWord(verb)}` : 'Padlocked roll-up door · bolt cutters, picks or a sledge');
      }
      return { x: b.x, z: b.z, len: Math.min(4, b.w) };
    }
    return null;
  }
  // Duck under a jammed bay: bent double, through the gap to the other side (the action moves you; no walking off).
  startDuck(p, b) {
    const side = (p.x - b.x) * b.nx + (p.z - b.z) * b.nz >= 0 ? 1 : -1;
    const ux = b.nz ? 1 : 0, uz = b.nz ? 0 : 1, along = Math.max(-b.w / 2 + 0.6, Math.min(b.w / 2 - 0.6, (p.x - b.x) * ux + (p.z - b.z) * uz));
    const ax = b.x + ux * along, az = b.z + uz * along;
    p.duck = { b, x0: p.x, z0: p.z, x1: ax - b.nx * side * 1.1, z1: az - b.nz * side * 1.1 };
    this.start('duck_under', { key: null, target: b, x: p.duck.x1, z: p.duck.z1, label: 'Ducking under',
      onDone: () => { p.duck = null; this.counts.ducks++; this.g.emit('duckedUnder', { bay: b.id }); } });
  }

  // ---- LADDERS ----------------------------------------------------------------------------------------------------
  rungsOf(L) { return Math.max(2, Math.round((L.y1 - L.y0) / LADDER.rung)); }
  footOf(L) { return { x: L.x + L.nx * LADDER.standOff, z: L.z + L.nz * LADDER.standOff }; }
  addLadder(o) {
    const L = { id: o.id ?? `ladder:${(this.ladN = (this.ladN ?? 0) + 1)}`, kind: o.kind ?? 'wall', x: o.x, z: o.z, nx: o.nx, nz: o.nz, y0: o.y0 ?? 0, y1: o.y1, tx: o.tx, tz: o.tz,
      retracted: o.retracted ?? !!LADDER_KINDS[o.kind ?? 'wall']?.retracted, town: o.town ?? null, owner: o.owner ?? null };
    const old = this.ladders.findIndex((q) => q.id === L.id); if (old >= 0) this.ladders.splice(old, 1);
    this.ladders.push(L); this.dirty = true; this.counts.ladders++;
    return L;
  }
  removeLadder(L) { const i = this.ladders.indexOf(L); if (i >= 0) this.ladders.splice(i, 1); this.dirty = true; }
  // The ladder whose foot (on the ground) or top (up where you step off) is within reach of p, on p's level.
  ladderNear(p, r = LADDER.reach) {
    let best = null, bd = r, end = null;
    const y = p.gy ?? 0;
    for (const L of this.ladders) {
      if (Math.abs(L.x - p.x) > 6 || Math.abs(L.z - p.z) > 6) continue;
      const f = this.footOf(L);
      if (Math.abs(y - L.y0) < 0.6) { const d = Math.hypot(f.x - p.x, f.z - p.z); if (d < bd) { bd = d; best = L; end = 'foot'; } }
      if (Math.abs(y - L.y1) < 0.8) { const d = Math.hypot(L.tx - p.x, L.tz - p.z); if (d < bd) { bd = d; best = L; end = 'top'; } }
    }
    return best ? { L: best, end, d: bd } : null;
  }
  // E at a ladder (main.js E chain, before doors). Foot: tap climbs on (a retracted one: hold pulls it down; a portable
  // you set: hold takes it back). Top: tap climbs on to go down (a retracted one: tap kicks it down first).
  ladderKey(p, I, dt) {
    const g = this.g, q = this.ladderNear(p);
    if (!q) return null;
    this.touch();
    const { L, end } = q, K = LADDER_KINDS[L.kind], ring = { x: end === 'foot' ? this.footOf(L).x : L.tx, z: end === 'foot' ? this.footOf(L).z : L.tz, len: 1.2 };
    const k = this.press(L, I, dt);
    if (end === 'foot' && L.retracted) {
      if (k === 'hold') {
        if (this.start('pull_down', { key: null, target: L, x: L.x, z: L.z, onDone: () => { L.retracted = false; this.dirty = true; g.noise(L.x, L.z, ACTIONS.pull_down.bang, p); g.audio?.thud?.(g.pan(L.x)); this.hold = -1; g.emit('ladderDown', { id: L.id, from: 'below' }); } })) this.tick(dt, true);
        if (this.cur) g.hud.prompt(`Jumping for the bottom rung… ${Math.round(Math.min(1, this.cur.t / this.cur.need) * 100)}%`);
      } else { if (this.cur?.target === L) this.tick(dt, false); g.hud.prompt(`The ${K.name} is drawn up · hold <kbd>E</kbd> Jump and pull it down`); }
      return ring;
    }
    if (end === 'top' && L.retracted) {
      g.hud.prompt(`<kbd>E</kbd> Kick the ${K.name} down`);
      if (k === 'tap') { L.retracted = false; this.dirty = true; g.noise(L.x, L.z, ACTIONS.kick_down.bang, p); g.emit('ladderDown', { id: L.id, from: 'above' }); }
      return ring;
    }
    if (end === 'foot' && L.kind === 'portable' && k === 'hold') {
      if (this.start('take_ladder', { key: null, target: L, x: L.x, z: L.z, onDone: () => { this.removeLadder(L); g.inventory.stow('ladder_portable', 1); this.hold = -1; g.emit('ladderTaken', { id: L.id }); } })) this.tick(dt, true);
      if (this.cur) g.hud.prompt(`Taking the ladder down… ${Math.round(Math.min(1, this.cur.t / this.cur.need) * 100)}%`);
      return ring;
    }
    if (this.cur?.target === L && k !== 'hold') this.tick(dt, false);
    g.hud.prompt(`<kbd>E</kbd> Climb ${end === 'foot' ? 'the' : 'down the'} ${K.name}${L.kind === 'portable' && end === 'foot' ? ' · hold <kbd>E</kbd> Take it down' : ''}`);
    if (k === 'tap') this.mount(p, L, end);
    return ring;
  }
  mount(p, L, end) {
    const n = this.rungsOf(L), f = this.footOf(L);
    p.climb = { L, rung: end === 'foot' ? 0 : n, prog: 0, n };
    p.x = f.x; p.z = f.z; p.face = Math.atan2(-L.nx, -L.nz); p.speed = 0; p.dive = 0;
    p.perchY = L.y0 + p.climb.rung * LADDER.rung || 0.001;
    p.act = { pose: 'climb', t: 0, k: 0, rung: p.climb.rung, dur: ACTIONS.climb.dur };
    this.climbT = 0; this.climbRungs = 0;
    this.g.emit('climbStart', { ladder: L.id, from: end, rungs: n });
  }
  dismount(p, where) {
    const c = p.climb, L = c.L;
    p.climb = null; p.act = null; p.perchY = 0;
    this.ring(null);
    if (where === 'top') { p.x = L.tx; p.z = L.tz; p.gy = L.y1; }
    else { const f = this.footOf(L); p.x = f.x + L.nx * 0.3; p.z = f.z + L.nz * 0.3; p.gy = L.y0; }
    this.g.standOn?.(p);
    this.g.emit('climbEnd', { ladder: L.id, at: where, rungs: this.climbRungs, secs: r2(this.climbT ?? 0), gy: r2(p.gy ?? 0) });
  }
  // Knocked off: down to the foot, hurt by the fall past the safe height, on the floor for a moment.
  fall(p) {
    const c = p.climb, L = c.L, h = (p.perchY || L.y0) - L.y0;
    this.dismount(p, 'foot');
    const dmg = Math.max(0, h - LADDER.fall.safe) * LADDER.fall.hpPerM;
    this.counts.falls++;
    if (dmg > 0) this.g.combat?.damage?.(p, dmg, null, 0, 0, 'fall');
    p.knockT = p.knockMax = 1.2;
    this.g.emit('ladderFall', { ladder: L.id, h: r1(h), dmg: Math.round(dmg) });
    this.g.hud?.toast?.('KNOCKED OFF THE LADDER', 'warn');
  }
  // While climbing or ducking under, this is the player's whole update (main.js, before moving): no walking, no gun.
  busyBody(p, I, dt) {
    if (p.duck) {
      const c = this.cur;
      if (!c || c.id !== 'duck_under') { p.duck = null; return false; }
      const d = p.duck, k = Math.min(1, (c.t + dt) / c.need), e = k * k * (3 - 2 * k);
      p.x = d.x0 + (d.x1 - d.x0) * e; p.z = d.z0 + (d.z1 - d.z0) * e;
      p.crouch = true;
      this.tick(dt, true);
      if (this.cur?.id !== 'duck_under' && p.duck) { p.duck = null; }
      if (I.mouse?.left || I.mouse?.leftPressed) this.counts.shotsBlocked++;
      this.g.hud.prompt('Ducking under…');
      return true;
    }
    if (!p.climb) return false;
    const g = this.g, c = p.climb, L = c.L, R = ACTIONS.climb;
    this.touch(); this.holdOn = L;
    if ((p.sinceHit ?? 99) < this.lastSince - 1e-6) { this.lastSince = p.sinceHit; this.fall(p); return true; }
    this.lastSince = p.sinceHit ?? 99;
    if (I.mouse?.left || I.mouse?.leftPressed) this.counts.shotsBlocked++; // the hands are on the rungs
    p.speed = 0; p.aiming = false;
    // Up: the key toward the wall (or W when the ladder runs east-west); down: away (or S).
    let mx = 0, mz = 0;
    if (I.key('KeyW') || I.key('ArrowUp')) mz -= 1; if (I.key('KeyS') || I.key('ArrowDown')) mz += 1;
    if (I.key('KeyA') || I.key('ArrowLeft')) mx -= 1; if (I.key('KeyD') || I.key('ArrowRight')) mx += 1;
    const pm = g.controls?.move; if (pm?.mag) { mx += pm.x; mz += pm.z; }
    let dir = 0;
    const along = -(mx * L.nx + mz * L.nz);
    if (along > 0.3) dir = 1; else if (along < -0.3) dir = -1;
    else if (Math.abs(L.nz) < 0.5 && mz) dir = mz < 0 ? 1 : -1;
    const f = this.footOf(L); p.x = f.x; p.z = f.z; p.face = Math.atan2(-L.nx, -L.nz);
    if (dir) {
      c.prog += dt / (R.dur * this.factor(R));
      this.climbT = (this.climbT ?? 0) + dt;
      if (c.prog >= 1) {
        c.prog = 0; c.rung += dir; this.climbRungs++; this.counts.rungs++;
        g.noise(p.x, p.z, R.noise[0], p); g.audio?.burst?.({ dur: 0.05, freq: 900, type: 'bandpass', q: 3, vol: 0.12, decay: 0.05 });
        g.emit('rung', { ladder: L.id, rung: c.rung });
      }
    }
    if (c.rung >= c.n) { this.dismount(p, 'top'); return true; }
    if (c.rung < 0 || (c.rung === 0 && dir < 0)) { this.dismount(p, 'foot'); return true; }
    p.perchY = L.y0 + (c.rung + (dir ? c.prog * dir : 0)) * LADDER.rung || 0.001;
    p.gy = p.perchY;
    p.act.t += dir ? dt : 0; p.act.rung = c.rung;
    this.ring(`Climbing · rung ${c.rung}/${c.n}`, c.rung / c.n);
    g.hud.prompt(`${LADDER_KINDS[L.kind].name.toUpperCase()} · ${(p.perchY - L.y0).toFixed(1)} m · up/down to climb · <kbd>E</kbd> let go${c.rung <= 1 ? ' (step off)' : ''}`);
    if (I.hit('KeyE') && c.rung <= 1) this.dismount(p, 'foot');
    return true;
  }
  // Set a carried ladder against the wall in front of you: needs a roof you can stand on within its reach.
  placeLadder(p) {
    const g = this.g, S = g.storeys, fx = Math.sin(p.face), fz = Math.cos(p.face);
    if (!this.has('ladder_portable')) return { ok: false, why: 'you carry no ladder' };
    let best = null;
    for (const d of [0.9, 1.4, 2.0]) {
      const rec = S?.at(p.x + fx * d, p.z + fz * d);
      if (rec && !rec.escape && rec.n >= 1 && rec.Y?.length > rec.n) { best = rec; break; }
    }
    if (!best) return { ok: false, why: 'nothing here to lean it on with a roof you could stand on' };
    const top = best.Y[best.n] - (best.y0 ?? 0);
    if (top > LADDER_KINDS.portable.maxH) return { ok: false, why: `that roof is ${top.toFixed(1)} m up: the ladder reaches ${LADDER_KINDS.portable.maxH} m` };
    // Which wall: the side of the record nearest you.
    const sides = [[best.ix0, null, -1, 0], [best.ix1, null, 1, 0], [null, best.iz0, 0, -1], [null, best.iz1, 0, 1]];
    let side = null, sd = 9;
    for (const s of sides) { const d = s[0] !== null ? Math.abs(p.x - s[0]) : Math.abs(p.z - s[1]); if (d < sd) { sd = d; side = s; } }
    const [wx, wz, nx, nz] = side, x = wx !== null ? wx + nx * 0.06 : Math.max(best.ix0 + 0.8, Math.min(best.ix1 - 0.8, p.x)), z = wz !== null ? wz + nz * 0.06 : Math.max(best.iz0 + 0.8, Math.min(best.iz1 - 0.8, p.z));
    const y0 = best.y0 ?? 0;
    return { ok: true, at: { kind: 'portable', x, z, nx, nz, y0, y1: best.Y[best.n], tx: x - nx * LADDER.stepIn, tz: z - nz * LADDER.stepIn, owner: p.id } };
  }

  // From the pack (inventory.act 'place_ladder'): pick the wall, then set it up over the row's seconds.
  beginPlace() {
    const g = this.g, p = g.player, r = this.placeLadder(p);
    if (!r.ok) return r;
    this.start('place_ladder', { auto: true, key: null, target: 'ladder', x: r.at.x, z: r.at.z,
      onDone: () => { const s = this.toolSlot('ladder_portable'); if (!s) return; g.inventory.take(g.inventory.carried, g.inventory.carried.slots.indexOf(s), 1); const L = this.addLadder(r.at); g.emit('ladderPlaced', { id: L.id, h: r2(L.y1 - L.y0) }); g.hud?.toast?.('LADDER UP', 'job'); } });
    return { ok: true, text: 'SETTING THE LADDER' };
  }

  // ---- the world: dressing generated towns -----------------------------------------------------------------------
  // Once a second: towns that came live get their ladders, jammed bays and lost things; towns gone lose theirs; locked
  // gates get their padlocks (seeded by id: the same gate is padlocked every time it is hung).
  dress() {
    const g = this.g, CG = g.citygen;
    const live = new Set();
    if (CG?.live) for (const [id, t] of CG.live) { live.add(id); if (!this.towns.has(id)) { this.towns.add(id); this.dressTown(id, t); } }
    for (const id of [...this.towns]) if (!live.has(id)) { this.towns.delete(id); this.undressTown(id); }
    const I = g.interiors;
    if (I?.ringOpen) for (const rec of I.ringOpen.values()) for (const d of rec.doors ?? NOTHING) {
      if (d._ta) continue; d._ta = true;
      if (d.locked && d.gate && h01(`${d.id}:padlock`) < PADLOCKS.gate) { d.padlock = true; this.dirty = true; }
    }
  }
  dressTown(id, t) {
    const P = LADDER_PLACE;
    for (const R of t.blds ?? NOTHING) {
      const B = R.B, S = R.S;
      if (!B || !S || B.ruined || !(B.parapet > 0) || S.n < 1 || !(S.Y?.length > S.n)) continue;
      const share = P.wallKinds.includes(B.kind) ? P.wallShare : P.anyShare;
      if (h01(`${B.id}:ladder`) >= share) continue;
      const avoid = new Set([B.front, B.escape?.side, S.side].filter(Boolean));
      const opts = ['N', 'S', 'E', 'W'].filter((s) => !avoid.has(s));
      if (!opts.length) continue;
      const side = opts[Math.floor(h01(`${B.id}:side`) * opts.length)];
      const nx = side === 'W' ? -1 : side === 'E' ? 1 : 0, nz = side === 'N' ? -1 : side === 'S' ? 1 : 0;
      const wx = side === 'W' ? S.ix0 : side === 'E' ? S.ix1 : null, wz = side === 'N' ? S.iz0 : side === 'S' ? S.iz1 : null;
      const u = 0.25 + 0.5 * h01(`${B.id}:at`);
      const x = wx ?? S.ix0 + 1 + (S.ix1 - S.ix0 - 2) * u, z = wz ?? S.iz0 + 1 + (S.iz1 - S.iz0 - 2) * u;
      const g = this.g, fx = x + nx * (LADDER.standOff + 0.1), fz = z + nz * (LADDER.standOff + 0.1);
      if (g.nav?.foot?.free && g.nav.foot.covers?.(fx, fz) && !g.nav.foot.free(fx, fz)) continue;
      const y0 = S.y0 ?? 0, y1 = S.Y[S.n];
      const kind = S.n >= 2 ? 'dropdown' : 'wall';
      this.addLadder({ id: `ladder:${B.id}`, kind, x: x + nx * 0.06, z: z + nz * 0.06, nx, nz, y0, y1, tx: x - nx * LADDER.stepIn, tz: z - nz * LADDER.stepIn, town: id });
    }
    // Jammed half-open bays: some of a town's unlocked roll-ups are stuck half up (seeded by the bay's id). Not in an agent's
    // ad-hoc stamp (the citygen audit drives a car through every bay of its own test town), except this lane's own.
    if (!t.rec?.adhoc || String(id).startsWith('ta-')) for (const b of t.built?.bays ?? NOTHING) {
      if (b.locked || b.half) continue;
      if (h01(`${b.id}:jam`) < ROLLUP.jammed) this.jam(t, b);
    }
    // Lost things: a few small things dropped in the town's streets and yards (a world placement, rolled once).
    const rng = (k) => h01(`${id}:lost:${k}`);
    const LOSTS = [['ammo_pistol', 3, 9], ['door_key', 1, 1], ['scrap_note', 1, 1], ['ammo_shells', 2, 5], ['battery_cell', 1, 1], ['bandage', 1, 1]];
    const doors = [];
    for (const R of t.blds ?? NOTHING) for (const d of R.B?.doors ?? NOTHING) if (d.kind !== 'bay' && R.B.x0 !== undefined) doors.push(R.B);
    const n = Math.min(6, Math.floor(doors.length / 4));
    for (let k = 0; k < n; k++) {
      const lid = `lost:${id}:${k}`;
      if (this.lostDone.has(lid) || this.g.inventory.boxes.has(lid)) continue;
      const B = doors[Math.floor(rng(k) * doors.length)], [item, lo, hi] = LOSTS[Math.floor(rng(k + 50) * LOSTS.length)];
      if (!ITEMS[item]) continue;
      const side = Math.floor(rng(k + 100) * 4), off = 1.6 + rng(k + 150) * 2.5, along = rng(k + 200);
      const x = side < 2 ? B.x0 + (B.x1 - B.x0) * along : side === 2 ? B.x0 - off : B.x1 + off, z = side >= 2 ? B.z0 + (B.z1 - B.z0) * along : side === 0 ? B.z0 - off : B.z1 + off;
      this.dropSmall(item, lo + Math.floor(rng(k + 250) * (hi - lo + 1)), x, z, B.y0 ?? 0, { id: lid, town: id, seed: Math.floor(rng(k + 300) * 1e9) });
    }
  }
  undressTown(id) {
    for (const L of [...this.ladders]) if (L.town === id) this.removeLadder(L);
    for (const [lid, L] of [...this.lost]) if (L.town === id) { const b = this.g.inventory.boxes.get(lid); if (b && b.unseen) this.g.inventory.boxes.delete(lid); else if (b && !b.slots.length) this.lostDone.add(lid); this.lost.delete(lid); }
  }
  jam(t, b) {
    b.half = true; b.open = false; if (b.box) b.box.base = 0; // stuck: a wall to a car, a gap to a person bent double
    const it = t.built.items?.[b.panel];
    if (it) { it.half = true; it.down = true; if (it.idx !== undefined) { this.g.citygen.place(it.idx, true); this.g.citygen.mesh.instanceMatrix.needsUpdate = true; } }
  }

  // ---- drawing: one instanced mesh (ladders, padlocks, marks) ---------------------------------------------------------
  buildMesh(scene) {
    if (!scene) return;
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0.35 }), MAXI);
    for (let i = 0; i < MAXI; i++) { this.mesh.setMatrixAt(i, ZERO); this.mesh.setColorAt(i, _c.set('#777777')); }
    this.mesh.count = 0; this.mesh.frustumCulled = false; this.mesh.castShadow = false; this.mesh.receiveShadow = false;
    scene.add(this.mesh);
  }
  put(x, y, z, sx, sy, sz, ry, col, rx = 0) {
    if (this.n >= MAXI) return;
    _o.position.set(x, y, z); _o.rotation.set(rx, ry, 0); _o.scale.set(sx, sy, sz); _o.updateMatrix();
    this.mesh.setMatrixAt(this.n, _o.matrix); this.mesh.setColorAt(this.n, _c.set(col)); this.n++;
  }
  draw() {
    const m = this.mesh, g = this.g, p = g.player;
    if (!m || !p) return;
    if (!this.dirty && this.drawnAt && Math.hypot(p.x - this.drawnAt.x, p.z - this.drawnAt.z) < 12) return;
    this.dirty = false; this.drawnAt = { x: p.x, z: p.z }; this.n = 0;
    const near = (x, z, r) => Math.abs(x - p.x) < r && Math.abs(z - p.z) < r;
    for (const L of this.ladders) {
      if (!near(L.x, L.z, 110)) continue;
      const K = LADDER_KINDS[L.kind], ry = Math.atan2(L.nx, L.nz), ux = L.nz, uz = -L.nx, w = LADDER.width / 2;
      const lo = L.retracted ? L.y0 + (K.upFrom ?? 1.6) + 0.6 : L.y0, hi = L.y1 + 0.9, h = hi - lo, cx = L.x + L.nx * 0.12, cz = L.z + L.nz * 0.12;
      for (const s of [-1, 1]) this.put(cx + ux * w * s, lo + h / 2, cz + uz * w * s, 0.06, h, 0.06, ry, K.color);
      for (let y = lo + 0.25; y < hi - 0.2 && this.n < MAXI - 40; y += LADDER.rung) this.put(cx, y, cz, LADDER.width, 0.04, 0.05, ry, K.color);
      if (L.kind === 'portable') this.put(L.x + L.nx * 0.7, L.y0 + 0.02, L.z + L.nz * 0.7, 0.6, 0.03, 0.25, ry, '#3a332a'); // its feet on a scuffed patch
    }
    const I = g.interiors;
    if (I?.ringOpen) for (const rec of I.ringOpen.values()) for (const d of rec.doors ?? NOTHING) {
      if (!d.padlock || !d.locked || !near(d.x, d.z, 90)) continue;
      const lx = d.lockX ?? d.x, lz = d.lockZ ?? d.z, ry = d.axis === 'x' ? 0 : Math.PI / 2, y = (d.y ?? 0);
      for (const s of [1, -1]) { this.put(lx + d.nx * 0.12 * s, y + 1.05, lz + d.nz * 0.12 * s, 0.5, 0.05, 0.05, ry, '#55524c'); }
      this.put(lx + d.nx * 0.16, y + 0.92, lz + d.nz * 0.16, 0.11, 0.14, 0.06, ry, '#2c2a26');
    }
    for (const [id, M] of this.marks) {
      if (!near(M.x, M.z, 90)) continue;
      const B = BREAK_MARKS[M.kind], ry = Math.atan2(M.ux, M.uz) + Math.PI / 2, y = M.y;
      const s0 = h01(id);
      for (let k = 0; k < B.splinters; k++) {
        const a = h01(`${id}:${k}`), side = k % 2 ? 1 : -1;
        this.put(M.x + M.nx * 0.08 * side + M.ux * (a - 0.5) * 0.3, y + 0.7 + a * 0.9, M.z + M.nz * 0.08 * side + M.uz * (a - 0.5) * 0.3, 0.05, 0.28 + a * 0.3, 0.035, ry, B.color, (a - 0.5) * 0.9);
      }
      if (M.kind === 'kicked') this.put(M.x + M.nx * 0.07, y + 0.55, M.z + M.nz * 0.07, 0.16, 0.26, 0.02, ry, '#3a2e22'); // a boot print by the lock
      if (M.kind === 'cut') for (let k = 0; k < 4; k++) this.put(M.x + M.nx * (0.4 + k * 0.08), y + 0.03, M.z + M.nz * (0.3 + s0 * 0.2) + M.uz * (k - 1.5) * 0.12, 0.12, 0.03, 0.05, ry + k, '#6d6d68');
      if (B.offHinges) this.put(M.x - M.nx * 1.3, y + 0.06, M.z - M.nz * 1.3, M.w * 0.9, 0.08, 2.1, ry + 0.25, '#7a5a3a'); // the leaf on the floor inside
    }
    m.count = this.n; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }

  // ---- the HUD ring (data/hudlayout.js 'actring') ----------------------------------------------------------------
  buildRing() {
    if (typeof document === 'undefined') return;
    const ui = document.getElementById('ui') ?? document.body;
    const R = RING.size, rr = R / 2 - 6, C = 2 * Math.PI * rr;
    const el = document.createElement('div');
    el.className = 'actring hidden';
    el.style.cssText = `position:absolute;width:${R + 220}px;display:flex;align-items:center;gap:10px;pointer-events:none;font:600 13px/1.2 Inter,system-ui,sans-serif;color:#f3e6c8;text-shadow:0 1px 2px #000;letter-spacing:0.02em;`;
    el.innerHTML = `<svg width="${R}" height="${R}" viewBox="0 0 ${R} ${R}" style="flex:none;filter:drop-shadow(0 2px 3px rgba(0,0,0,.6))"><circle cx="${R / 2}" cy="${R / 2}" r="${rr}" fill="rgba(20,16,12,0.35)" stroke="${RING.track}" stroke-width="7"/><circle class="ar-fill" cx="${R / 2}" cy="${R / 2}" r="${rr}" fill="none" stroke="${RING.fill}" stroke-width="7" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C}" transform="rotate(-90 ${R / 2} ${R / 2})"/><text class="ar-pct" x="50%" y="54%" text-anchor="middle" dominant-baseline="middle" fill="#f3e6c8" font-size="14" font-weight="700">0</text></svg><span class="ar-label"></span>`;
    ui.appendChild(el);
    this.ringEl = { el, fill: el.querySelector('.ar-fill'), pct: el.querySelector('.ar-pct'), label: el.querySelector('.ar-label'), C, on: false, lastK: -1, lastL: '' };
    this.ringState = { label: null, k: 0 };
  }
  ring(label, k = 0) {
    this.ringState = { label, k };
    const R = this.ringEl;
    if (!R) return;
    if (!label) { if (R.on) { R.el.classList.add('hidden'); R.on = false; } return; }
    if (!R.on) { R.el.classList.remove('hidden'); R.on = true; }
    const kk = Math.round(Math.max(0, Math.min(1, k)) * 100);
    if (kk !== R.lastK) { R.fill.setAttribute('stroke-dashoffset', String(R.C * (1 - kk / 100))); R.pct.textContent = String(kk); R.lastK = kk; }
    if (label !== R.lastL) { R.label.textContent = label; R.lastL = label; }
  }

  // ---- views, save --------------------------------------------------------------------------------------------------
  view() {
    const p = this.g.player, c = this.cur;
    return {
      running: c ? { id: c.id, label: c.o.label ?? c.row.label, t: r2(c.t), need: r2(c.need), wall: r2(c.wall), hits: c.hits, of: c.o.hits ?? null, pose: c.row.pose } : null,
      climbing: p.climb ? { ladder: p.climb.L.id, rung: p.climb.rung, of: p.climb.n, y: r2(p.perchY ?? 0) } : null,
      ducking: !!p.duck, ring: this.ringState, prefer: this.prefer,
      tools: Object.fromEntries(['lockpicks', 'crowbar', 'bolt_cutters', 'sledgehammer', 'hammer_nails', 'ladder_portable'].map((id) => { const s = this.toolSlot(id); return [id, s ? { wear: s.wear ?? 0, left: s.left ?? null } : null]; })),
      ladders: this.ladders.length, lost: [...this.lost.keys()].filter((id) => this.g.inventory.boxes.get(id)?.unseen).length, marks: this.marks.size, kept: this.prog.size,
      counts: this.counts, log: this.log.slice(-6), found: this.found,
    };
  }
  save() {
    return { marks: [...this.marks], prog: [...this.prog], lostDone: [...this.lostDone],
      ladders: this.ladders.filter((L) => L.kind === 'portable').map((L) => ({ ...L })),
      down: this.ladders.filter((L) => L.town && LADDER_KINDS[L.kind].retracted && !L.retracted).map((L) => L.id) };
  }
  load(s) {
    if (!s) return;
    this.marks = new Map(s.marks ?? []); this.prog = new Map(s.prog ?? []); this.lostDone = new Set(s.lostDone ?? []);
    for (const L of [...this.ladders]) if (L.kind === 'portable') this.removeLadder(L);
    for (const L of s.ladders ?? []) this.addLadder(L);
    this.downIds = new Set(s.down ?? []);
    for (const L of this.ladders) if (this.downIds.has(L.id)) L.retracted = false;
    this.dirty = true;
  }
}
