import { GUNPOINT as GP, STANCE } from '../data/arms.js';
import { VERBS } from '../data/society.js';
import { angleLerp } from '../engine/rng.js';

// Gunpoint as a STATE (docs/design/WEB_CONTROLLER.md §3.5). A raised gun held steadily on a person inside GUNPOINT.range
// holds them, and they answer by their nerve: comply (hands up), plead (on their knees), run, or draw on you (a standoff).
// Held, they do what you say: E hands it over (a robbery), opens the door near them, hold E walks them with you (a
// prisoner). A standoff is several people with guns on you and yours on one of them: nobody wants to fire first. Every
// hold is a `threaten` deed and every robbery a `rob` deed through deeds.js, so the witness pass, the rumors, the
// runners home (witnesses.js) and the named people's memories (memory.js) all hear of it: towns remember.
//
// People running home to tell on you (c.telling) are witnesses.js's: a gun on them is handled there (cow), not here.
//   update(dt)                 per frame (main.js, after ambient): who is under the aim, the held, the standoff
//   playerInteract(p, I, dt)   main.js before its own E: the verbs on a held person (true when it took the key)
//   busy()                     arms.js: somebody is held (the gun does not drop on its own)
export class Gunpoint {
  constructor(game) {
    this.g = game;
    this.held = [];          // { c, state, t0, nerve, score, lapse, tension, downT, robbed, door }
    this.cand = null; this.candT = 0;
    this.standoff = null;    // { t0, ids, peak }
    this.last = null;        // the last standoff, resolved: { outcome, secs, ids }
    this.eT = 0; this.eOn = null;
    this.counts = { held: 0, comply: 0, plead: 0, run: 0, draw: 0, robbed: 0, doors: 0, prisoners: 0, escaped: 0, standoffs: 0, stoodDown: 0, fired: 0 };
  }

  lines(kind) { const L = GP.barks[kind]; return L ? L[Math.floor(Math.random() * L.length)] : null; }
  bark(c, kind) { const t = this.lines(kind); if (t) this.g.feedback?.floater(c.x, c.z, t, 'bark'); }
  busy() { return this.held.length > 0; }
  entry(c) { return this.held.find((h) => h.c === c) ?? null; }
  nerveOf(c) { return c.nerve ?? c.npc?.nerve ?? (c.npc ? GP.nerve.npc : GP.nerve[c.faction] ?? GP.nerve.default); }
  slack(d) { return GP.slack + GP.slackPerM * d; }

  // ---- per frame ----------------------------------------------------------------------------------------------------
  update(dt) {
    const g = this.g, P = g.player, A = g.arms;
    for (let i = this.held.length - 1; i >= 0; i--) { const h = this.held[i]; if (!h.c.alive || !g.chars.includes(h.c)) this.drop(h, h.c.alive ? 'gone' : 'dead'); }
    const armed = P.alive && !P.inVehicle && !P.grabbing && !P.onTrain && A?.stance === 'raised' && A.drawT <= 0 && !!P.weapon && !g.dialogue.active;

    // Who is under the aim (the one nearest the aim point, within its slack).
    let cand = null;
    // The aim from your hands (mouse, stick) or the gunpoint command; an agent's raw `aim` override is a test hook and
    // never puts a gun on anybody by itself.
    if (armed && (!g.aimOverride || this.agentAim)) {
      let bd = Infinity;
      for (const c of g.chars) {
        if (c === P || !c.alive || c.inVehicle || c.hidden || c.faction === 'zombie' || c.faction === 'ally' || c.telling || c.knockT > 0) continue;
        const dx = c.x - P.x, dz = c.z - P.z;
        if (Math.abs(dx) > GP.range || Math.abs(dz) > GP.range) continue;
        const d = Math.hypot(dx, dz);
        if (d > GP.range || d < 0.6) continue;
        const off = Math.hypot(g.aim.x - c.x, g.aim.z - c.z);
        if (off > this.slack(d) || off >= bd) continue;
        if (!g.storeys.sameFloor(P, c) || !g.sees(P, c)) continue;
        bd = off; cand = c;
      }
    }
    if (cand !== this.cand) { this.cand = cand; this.candT = 0; }
    if (cand) {
      A.engagedT = g.time; // you are covering somebody: the gun stays up
      const h = this.entry(cand);
      if (!h && !(cand.target === P && cand.state === 'fight')) {
        this.candT += dt;
        // A tense guard who sees the muzzle come round to him doesn't wait.
        if (this.candT >= GP.aimFor || (cand.tenseT > 0 && A.isGuard(cand) && this.candT >= 0.15)) this.hold(cand);
      }
    }

    for (const h of [...this.held]) if (this.held.includes(h)) this.step(h, dt, armed); // a step can end others (a standoff breaking)
    this.updateStandoff(dt);
  }

  // A person comes under the gun: their nerve decides.
  hold(c) {
    const g = this.g, P = g.player, d = Math.hypot(c.x - P.x, c.z - P.z);
    const nerve = this.nerveOf(c);
    let friends = 0;
    for (const o of g.chars) if (o !== c && o.alive && o.weapon && o.faction === c.faction && Math.abs(o.x - c.x) < 12 && Math.abs(o.z - c.z) < 12) friends++;
    const score = nerve + (c.weapon ? GP.armed : 0) + GP.backup * Math.min(3, friends) - GP.close * (1 - d / GP.range) + GP.jitter * (Math.random() * 2 - 1);
    const guard = g.arms.isGuard(c);
    const state = c.weapon && (score >= GP.draw || guard) ? 'draw' : score >= GP.run ? 'run' : score < GP.plead ? 'plead' : 'comply';
    const h = { c, state, t0: g.time, nerve, score: +score.toFixed(3), lapse: 0, tension: 0, downT: 0, robbed: false, guard, d: +d.toFixed(1) };
    this.held.push(h);
    this.counts.held++; this.counts[state]++;
    c.flee = 0; c.restless = 30;
    if (c.sleeping) g.ai.wake(c, 'a gun');
    if (state === 'run') { c.flee = 9; c.fleeX = P.x; c.fleeZ = P.z; c.hold = 0; }
    this.bark(c, state === 'draw' && guard ? 'guardDraw' : state);
    // The deed: you put a gun on somebody. The witness pass sees it; a named person remembers it.
    if (!(c.faction === 'raider' && c.target === P)) {
      g.society?.deeds?.record('threaten', { target: c, m: VERBS.threaten, cause: 'gunpoint' });
      if (c.npc) g.society?.memory?.remember(c.npc.id, 'threatened');
    }
    g.emit('gunpoint', { id: c.id, name: c.npc?.name ?? c.name, faction: c.faction, reaction: state, nerve: +nerve.toFixed(2), score: h.score, armed: !!c.weapon, dist: h.d });
    return h;
  }

  // One held person, one frame.
  step(h, dt, armed) {
    const g = this.g, P = g.player, c = h.c, A = g.arms;
    const d = Math.hypot(c.x - P.x, c.z - P.z);
    const covered = armed && Math.hypot(g.aim.x - c.x, g.aim.z - c.z) <= this.slack(d) * 1.7 && g.sees(P, c);
    h.lapse = covered ? 0 : h.lapse + dt;
    const face = () => { c.face = angleLerp(c.face, Math.atan2(P.x - c.x, P.z - c.z), Math.min(1, dt * 8)); };
    switch (h.state) {
      case 'run':
        if (c.flee <= 0 && d < GP.runFar && armed) { c.flee = 4; c.fleeX = P.x; c.fleeZ = P.z; }
        if (d >= GP.runFar || (c.flee <= 0 && !armed)) { this.counts.escaped++; g.emit('gunpointEscaped', { id: c.id, dist: Math.round(d) }); this.drop(h, 'escaped'); }
        return;
      case 'draw': {
        // A standoff: they hold their gun on you; nobody fires first while you cover them.
        if (!c.weapon) { h.state = 'comply'; return; }
        c.hold = 0.3; c.aiming = true; c.flee = 0; c.handsUp = false; face();
        if (!armed) {
          // You lowered yours: a beat, then they lower theirs.
          if ((h.downT += dt) >= GP.standDown) { c.aiming = false; c.hold = 1.5; this.bark(c, 'standDown'); this.counts.stoodDown++; g.emit('stoodDown', { id: c.id }); this.drop(h, 'stood down'); }
          return;
        }
        h.downT = 0;
        h.tension = Math.max(0, h.tension + (covered ? -GP.tenseDown : GP.tenseUp) * dt);
        const guardDone = h.guard && covered && g.time - h.t0 > GP.guardFireAfter;
        if (h.tension >= 1 + h.nerve || guardDone || A.lastShotT > h.t0) this.open(h, guardDone ? 'the guard fired' : A.lastShotT > h.t0 ? 'you fired' : 'nerves broke');
        return;
      }
      case 'prisoner': {
        if (!armed && A.stance === 'holstered') { this.release(h, 'let go'); return; }
        if (d > GP.leash) { c.hold = 0; c.flee = 8; c.fleeX = P.x; c.fleeZ = P.z; c.handsUp = false; this.counts.escaped++; g.emit('gunpointEscaped', { id: c.id, prisoner: true }); this.drop(h, 'bolted'); return; }
        // Walk behind you with their hands up.
        c.hold = 0.3; c.handsUp = true; c.crouch = false;
        const bx = P.x - Math.sin(P.face) * 2.4, bz = P.z - Math.cos(P.face) * 2.4, dd = Math.hypot(bx - c.x, bz - c.z);
        if (dd > 0.6) g.ai.move(c, bx - c.x, bz - c.z, Math.min(5.2, 1.4 + dd * 1.2), dt); else c.speed = 0;
        return;
      }
      default: { // comply, plead
        if (!armed || h.lapse > GP.lapse || d > GP.keep) { this.release(h, armed ? 'looked away' : 'gun down'); return; }
        c.hold = 0.3; c.handsUp = true; c.crouch = h.state === 'plead'; c.speed = 0; c.flee = 0; face();
      }
    }
  }

  // Somebody's nerve went (or you fired): everyone drawn on you fires.
  open(h0, why) {
    const g = this.g, P = g.player;
    for (const h of [...this.held]) {
      if (h.state !== 'draw') continue;
      const c = h.c;
      c.hold = 0; c.aiming = true; c.grudge = P; c.target = P; c.state = 'fight'; c.react = 0.05;
      this.drop(h, 'fired');
    }
    this.counts.fired++;
    g.emit('standoffBroke', { by: h0.c.id, why });
  }

  release(h, why) {
    const c = h.c;
    c.handsUp = false; c.crouch = false;
    // Let go: a timid one runs, the rest stand shaking a moment.
    if (h.nerve < 0.3 && why !== 'let go') { c.hold = 0; c.flee = 5; c.fleeX = this.g.player.x; c.fleeZ = this.g.player.z; }
    else { c.hold = 0; c.cowerT = 1.2; }
    this.drop(h, why);
  }
  drop(h, why) {
    const i = this.held.indexOf(h);
    if (i < 0) return;
    this.held.splice(i, 1);
    if (h.state === 'comply' || h.state === 'plead' || h.state === 'prisoner') { h.c.handsUp = false; }
    this.g.emit('gunpointEnded', { id: h.c.id, state: h.state, why, secs: +(this.g.time - h.t0).toFixed(1) });
  }

  updateStandoff(dt) {
    const g = this.g, drawn = this.held.filter((h) => h.state === 'draw');
    if (drawn.length && !this.standoff) {
      this.standoff = { t0: g.time, ids: drawn.map((h) => h.c.id), peak: drawn.length };
      this.counts.standoffs++;
      g.hud?.toast?.(drawn.length > 1 ? `STANDOFF · ${drawn.length} GUNS ON YOU · NOBODY WANTS TO FIRE FIRST` : 'STANDOFF · COVER THEM, OR LOWER IT (H)', 'hot');
      g.emit('standoff', { ids: this.standoff.ids });
    } else if (this.standoff) {
      for (const h of drawn) if (!this.standoff.ids.includes(h.c.id)) this.standoff.ids.push(h.c.id);
      this.standoff.peak = Math.max(this.standoff.peak, drawn.length);
      if (!drawn.length) {
        const S = this.standoff, ended = g.events.slice(-12).reverse().find((e) => e.type === 'gunpointEnded' && S.ids.includes(e.id));
        const outcome = ended?.why === 'fired' ? 'fired' : ended?.why === 'stood down' ? 'stood down' : ended?.why === 'dead' ? 'killed' : ended?.why ?? 'over';
        this.last = { outcome, secs: +(g.time - S.t0).toFixed(1), ids: S.ids, peak: S.peak };
        this.standoff = null;
        g.hud?.toast?.(outcome === 'stood down' ? 'STANDOFF OVER · EVERYBODY WALKS' : outcome === 'fired' ? 'STANDOFF BROKE' : 'STANDOFF OVER', outcome === 'stood down' ? 'job' : 'hot');
        g.emit('standoffOver', this.last);
      }
    }
    void dt;
  }

  // ---- the verbs on a held person (main.js, before its own E) ---------------------------------------------------------
  target() {
    const P = this.g.player;
    let best = null, bd = GP.reach;
    for (const h of this.held) {
      if (h.state !== 'comply' && h.state !== 'plead' && h.state !== 'prisoner') continue;
      const d = Math.hypot(h.c.x - P.x, h.c.z - P.z);
      if (d < bd) { bd = d; best = h; }
    }
    return best;
  }
  lockedDoorNear(c) {
    const I = this.g.interiors;
    if (!I) return null;
    let best = null, bd = GP.doorR;
    for (const d of I.doors) { if (!d.locked) continue; const k = Math.hypot(d.x - c.x, d.z - c.z); if (k < bd) { bd = k; best = d; } }
    return best;
  }
  playerInteract(p, I, dt) {
    const g = this.g, h = this.target();
    if (!h || g.arms.stance !== 'raised') { this.eOn = null; this.eT = 0; return false; }
    const c = h.c, name = c.npc?.name ?? c.name ?? 'them', door = this.lockedDoorNear(c);
    const tap = h.state === 'prisoner' ? 'Let them go (holster)' : !h.robbed ? `Make ${name} hand it over` : door ? 'Make them open the door' : null;
    g.hud.prompt(`${tap ? `<kbd>E</kbd> ${tap} · ` : ''}${h.state === 'prisoner' ? '' : '<b>hold</b> <kbd>E</kbd> Walk with me'}`.replace(/ · $/, ''));
    g.qol.highlight(c);
    if (I.key('KeyE')) {
      if (this.eOn !== c) { this.eOn = c; this.eT = 0; }
      this.eT += dt;
      if (this.eT >= 0.45 && h.state !== 'prisoner') { this.prisoner(h); this.eT = -99; }
    } else if (this.eOn === c) {
      if (this.eT > 0 && this.eT < 0.45) {
        if (h.state === 'prisoner') g.arms.holster('let go');
        else if (!h.robbed) this.rob(h);
        else if (door) this.openDoor(h, door);
      }
      this.eOn = null; this.eT = 0;
    }
    return true;
  }

  // Hand it over: their cash goes in your pocket, what they carry lands at their feet. A robbery, in the book.
  rob(h) {
    const g = this.g, c = h.c, [lo, hi] = GP.cash[c.faction] ?? GP.cash.default;
    const cash = c.npc ? Math.round(hi * 1.5) : lo + Math.floor(Math.random() * (hi - lo + 1));
    h.robbed = true; c.robbed = true;
    g.cash += cash;
    const kind = c.faction === 'raider' ? 'raider' : c.faction === 'soldier' ? 'soldier' : 'person';
    const box = g.inventory.place(`drop:${c.id}:${this.counts.robbed}`, kind, c.x + Math.sin(c.face) * 0.6, c.z + Math.cos(c.face) * 0.6, 12, `WHAT ${(c.npc?.name ?? c.name ?? 'THEY').toUpperCase()} HANDED OVER`);
    if ((c.gy ?? 0) > 0.5 && c.storey) box.y = c.gy;
    this.counts.robbed++;
    this.bark(c, 'robbed');
    g.audio?.pickup?.();
    g.hud.toast(`+$${cash} · ${(c.npc?.name ?? c.name ?? 'THEY').toUpperCase()} EMPTIED THEIR POCKETS`, 'hot');
    const lawful = c.faction !== 'raider';
    g.society?.deeds?.record('rob', { target: c, stars: lawful ? 1 : 0, cause: 'gunpoint' });
    if (c.npc) g.society?.memory?.remember(c.npc.id, 'robbedMe');
    g.emit('robbed', { id: c.id, cash, box: box.id });
    return { cash, box: box.id };
  }
  openDoor(h, door) {
    const g = this.g, c = h.c;
    g.interiors.unlock(door, 'key', c);
    this.counts.doors++;
    this.bark(c, 'door');
    g.emit('gunpointDoor', { id: c.id, door: door.id });
    return door.id;
  }
  prisoner(h) {
    h.state = 'prisoner'; this.counts.prisoners++;
    this.bark(h.c, 'prisoner');
    this.g.hud.toast('PRISONER · THEY WALK WITH YOU WHILE YOUR GUN IS UP · HOLSTER TO LET THEM GO', 'job');
    this.g.emit('prisoner', { id: h.c.id });
  }

  view() {
    const g = this.g, P = g.player;
    return {
      covering: this.cand ? { id: this.cand.id, name: this.cand.npc?.name ?? this.cand.name, secs: +this.candT.toFixed(2) } : null,
      held: this.held.map((h) => ({ id: h.c.id, name: h.c.npc?.name ?? h.c.name, faction: h.c.faction, state: h.state, nerve: +h.nerve.toFixed(2), score: h.score, tension: +h.tension.toFixed(2), robbed: h.robbed, dist: +Math.hypot(h.c.x - P.x, h.c.z - P.z).toFixed(1), secs: +(g.time - h.t0).toFixed(1) })),
      standoff: this.standoff ? { secs: +(g.time - this.standoff.t0).toFixed(1), ids: this.standoff.ids, peak: this.standoff.peak } : null,
      last: this.last, counts: { ...this.counts }, needs: { stance: 'raised', range: GP.range, aimFor: GP.aimFor, guards: STANCE.guards },
    };
  }
  clear() { for (const h of [...this.held]) { h.c.hold = 0; this.drop(h, 'cleared'); } this.standoff = null; this.cand = null; }
}
