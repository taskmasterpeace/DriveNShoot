import { GRAPEVINE as GV, GRAPEVINE_PACKS } from '../data/grapevine.js';
import { WEAPONS } from './combat.js';
import { hash32, rngOf } from '../world/geo.js';

// THE GRAPEVINE (docs/design/WEB_GREYBORN_GRAPEVINE.md §3.3; rows in data/grapevine.js). Hunters who look like people.
// Each pack keeps a MODEL of the player built only from what one of its members SAW (g.sees, inside its sight range) or
// HEARD (a shot from where you stand, inside its hearing), or what another pack TOLD it. A pack that never saw or heard
// you knows nothing, and a pack that knows nothing never strikes: it stalks to learn. It strikes only when a window is
// open that it can see (you reloading, wounded, asleep, out of rounds by its own count) and its power beats your threat
// as it has learned it; it runs when it is outmatched; it eats the dead.
//
// A pack is a RECORD (its members' hp and deaths, its model) promoted to characters near its hunting ground at night.
const r1 = (v) => +v.toFixed(1);
const ang = (a, b) => { let d = Math.abs(a - b) % (Math.PI * 2); return d > Math.PI ? Math.PI * 2 - d : d; };
export const emptyModel = () => ({
  watched: 0, sightings: 0, lastSeen: -1e9, lastX: 0, lastZ: 0,
  weapons: {}, shotsHeard: 0, shotsSeen: 0, reach: 0,
  chain: 0, chainOk: true, magEst: 0, magCycles: 0,
  reloadsSeen: 0, reloadTime: 0, runs: 0, nightS: 0, light: 0,
  lowestHp: 1, woundedSeen: 0, allies: 0, sleepsSeen: 0, told: 0,
});
// Is there anything in it at all (a check proves a pack that saw nothing has nothing).
export const knows = (m) => m.watched > 0 || m.sightings > 0 || m.shotsHeard > 0 || m.shotsSeen > 0 || m.reloadsSeen > 0 || m.told > 0 || Object.keys(m.weapons).length > 0;

export class Grapevine {
  constructor(game) {
    this.g = game;
    this.enabled = true;
    this.packs = GRAPEVINE_PACKS.map((row) => this.make(row));
    this.scanT = 0; this.decideT = 0; this.tellT = 0; this.day = -1;
    this.rounds = null; this.reloadingWas = 0; this.reloadSeenNow = false;
    this.clues = [];
    this.stats = { strikes: 0, retreats: 0, eaten: 0, told: 0 };
  }

  make(row) {
    const g = this.g, seed = hash32(row.id.length * 131, row.x | 0, row.z | 0);
    const pk = { id: row.id, row, seed, members: [], model: emptyModel(), state: 'home', stateT: 0, why: '', live: false, hitAt: -99, lure: null, base: 0, feed: null, x: row.x, z: row.z, strikeAt: -99, window: null };
    for (let n = 0; n < row.size; n++) { const ms = hash32(seed, n, 0x47525650), mr = rngOf(ms); pk.members.push({ n, seed: ms, flag: g.randomFlag(mr), maxHp: GV.hp, hp: GV.hp, dead: false, c: null }); }
    return pk;
  }
  byId(id) { return this.packs.find((p) => p.id === id) ?? null; }
  alive(pk) { const out = []; for (const m of pk.members) if (m.c?.alive) out.push(m.c); return out; } // the living characters

  // ---- promote / demote --------------------------------------------------------------------------------------------
  promote(pk, at = null) {
    const g = this.g, x0 = at?.x ?? pk.row.x, z0 = at?.z ?? pk.row.z;
    for (const m of pk.members) {
      if (m.c || m.dead) continue;
      if (!g.wilds.room(1)) break;
      const mr = rngOf(m.seed), a = mr() * Math.PI * 2, r = 2 + mr() * 5;
      const colors = { skin: GV.skin[m.seed % GV.skin.length], hair: '#1e1a16', shirt: GV.shirt[(m.seed >> 3) % GV.shirt.length], pants: GV.pants[(m.seed >> 5) % GV.pants.length], boots: '#2a2420', hat: '#3a342c', hatStyle: ['wrap', 'long', 'short', 'beanie'][(m.seed >> 7) % 4], gearStyle: 'pack', gear: '#3a3026', accStyle: 'mask', mask: '#2e2a26', sleeves: 'long' };
      const c = g.addChar({ x: x0 + Math.cos(a) * r, z: z0 + Math.sin(a) * r, faction: 'grapevine', weapon: null, hp: m.maxHp, colors, name: GV.name, flag: m.flag });
      if (!c) break;
      c.fid = 'infected'; g.society.factions.assign(c); // never a witness to the living's gossip
      c.maxHp = m.maxHp; c.hp = m.hp; c.wild = true; c.home = { x: pk.row.x, z: pk.row.z };
      c.gv = { pack: pk.id, pk, m, spot: null, spotT: 0, watchedT: 0, cut: 0, k: m.n };
      g.standOn(c); g.charR.paint(c);
      m.c = c;
    }
    pk.live = pk.members.some((m) => m.c);
    if (pk.state === 'home') this.set(pk, 'roam', 'promoted');
    g.emit('grapevinePromoted', { pack: pk.id, members: this.alive(pk).length, knows: knows(pk.model) });
  }
  demote(pk) {
    const g = this.g;
    for (const m of pk.members) if (m.c) { if (!m.c.alive) m.dead = true; m.hp = m.c.alive ? Math.max(1, Math.round(m.c.hp)) : 0; if (g.chars.includes(m.c)) g.removeChar(m.c); m.c = null; }
    pk.live = false; this.set(pk, 'home', 'demoted');
    if (pk.lure) { const t = g.traps.byId(pk.lure); if (t) g.traps.remove(t); pk.lure = null; }
  }
  set(pk, state, why) {
    if (pk.state === state) return;
    pk.state = state; pk.stateT = 0; pk.why = why;
    for (const m of pk.members) if (m.c) { m.c.gv.spot = null; m.c.crouch = false; m.c.handsUp = false; }
    if (state === 'strike') { this.stats.strikes++; pk.strikeAt = this.g.time; }
    if (state === 'retreat') this.stats.retreats++;
    this.g.emit('grapevine', { pack: pk.id, state, why });
  }

  // ---- what the pack perceives (each scan) -------------------------------------------------------------------------
  sightOf(c) {
    const g = this.g, n = g.sky?.night ?? 0, lit = n > 0.3 && g.flashMat?.opacity > 0;
    return (GV.sightDay * (1 - n) + GV.sightNight * n) * (lit ? GV.lit : 1) * (g.player.crouch ? 0.75 : 1);
  }
  seesPlayer(c) {
    const g = this.g, P = g.player;
    if (!c.alive || !P.alive || P.hidden || P.underwater) return false;
    const px = P.inVehicle ? P.inVehicle.x : P.x, pz = P.inVehicle ? P.inVehicle.z : P.z;
    const d = Math.hypot(px - c.x, pz - c.z);
    if (d > this.sightOf(c)) return false;
    return P.inVehicle ? g.los(c.x, c.z, px, pz) : g.sees(c, P);
  }
  // Rounds on you: a drop between frames is shots fired (a reload moves rounds, it doesn't spend them).
  countRounds() { const I = this.g.inv; let n = 0; for (const k in I.mag) n += I.mag[k] || 0; for (const k in I.ammo) n += +I.ammo[k] || 0; return n; }

  observe(dt) {
    const g = this.g, P = g.player, M = (pk) => pk.model, now = g.time;
    // Shots this frame (by the rounds you carry) and the reload's edges.
    const r = this.countRounds();
    const shots = this.rounds === null ? 0 : Math.max(0, this.rounds - r);
    this.rounds = r;
    const fired = shots > 0 && shots <= 3 ? shots : 0;
    const rl = P.reloading > 0 && !P.clearing ? P.reloading : 0, started = rl > 0 && !(this.reloadingWas > 0), ended = !(rl > 0) && this.reloadingWas > 0;
    this.reloadingWas = rl;
    const k = g.inv.current, night = g.sky?.night ?? 0, lit = night > 0.3 && g.flashMat?.opacity > 0;
    for (const pk of this.packs) {
      if (!pk.live) continue;
      const m = M(pk), live = this.alive(pk);
      if (!live.length) continue;
      let seeing = null, nearest = Infinity, toward = 0;
      for (const c of live) {
        const d = Math.hypot(c.x - P.x, c.z - P.z);
        nearest = Math.min(nearest, d);
        if (!seeing && this.seesPlayer(c)) seeing = c;
        if (fired && ang(Math.atan2(c.x - P.x, c.z - P.z), P.face) < 0.35) toward = Math.max(toward, d); // you fired our way
      }
      pk.seeing = !!seeing;
      pk.nearest = nearest;
      if (seeing) {
        if (now - m.lastSeen > 20) m.sightings++;
        m.watched += dt; m.lastSeen = now; m.lastX = P.x; m.lastZ = P.z;
        const w = (m.weapons[P.inVehicle ? 'car' : k] ??= { held: 0, shots: 0 });
        w.held += dt;
        if (night > 0.5) { m.nightS += dt; if (lit) m.light += dt; }
        const hpk = P.hp / (P.maxHp || 100);
        m.lowestHp = Math.min(m.lowestHp, hpk); if (hpk <= GV.wounded) m.woundedSeen += dt;
        m.allies = g.chars.filter((o) => o.alive && o.follower && Math.hypot(o.x - P.x, o.z - P.z) < 15).length;
        if (g.survival?.sleep) { if (!pk.sawSleep) { m.sleepsSeen++; pk.sawSleep = true; } } else pk.sawSleep = false;
        if ((P.speed ?? 0) > 5.5 && now - (pk.runAt ?? -9) > 3) {
          // Running away from something: from us, or from the herd.
          const from = live.concat(g.chars.filter((o) => o.alive && o.faction === 'zombie' && Math.abs(o.x - P.x) < 25 && Math.abs(o.z - P.z) < 25));
          const vx = Math.sin(P.face), vz = Math.cos(P.face);
          if (from.some((o) => (P.x - o.x) * vx + (P.z - o.z) * vz > 0)) { m.runs++; pk.runAt = now; }
        }
        if (rl > 0) pk.reloadSeen = true;
      }
      if (fired) {
        if (seeing) { m.shotsSeen += fired; m.weapons[k].shots += fired; if (toward) m.reach = Math.max(m.reach, toward); m.chain += fired; }
        else if (nearest <= GV.hear) { m.shotsHeard += fired; m.chain += fired; }
        else m.chainOk = false; // a shot they missed: their count of your rounds is broken
      }
      if (started) { pk.reloadSeen = !!seeing; pk.reloadFrom = now; }
      if (ended) {
        if (pk.reloadSeen) {
          m.reloadTime = m.reloadsSeen ? (m.reloadTime * m.reloadsSeen + (now - (pk.reloadFrom ?? now))) / (m.reloadsSeen + 1) : now - (pk.reloadFrom ?? now);
          m.reloadsSeen++;
          if (m.chainOk && m.chain > 0) { m.magEst = Math.max(m.magEst, m.chain); m.magCycles++; }
          g.emit('grapevineLearned', { pack: pk.id, what: 'reload', reloadsSeen: m.reloadsSeen, magEst: m.magEst });
        }
        m.chain = 0; m.chainOk = true; pk.reloadSeen = false;
      }
    }
  }

  // ---- the odds (§4) --------------------------------------------------------------------------------------------
  danger(m) {
    let d = 0;
    for (const [k, w] of Object.entries(m.weapons)) if (w.held > 0 || w.shots > 0) d = Math.max(d, GV.danger[k] ?? (k === 'car' ? 1.4 : 1.2));
    if (!d && (m.shotsHeard || m.shotsSeen)) d = 1.2; // a gun they've heard and never seen
    return d || GV.danger.none;
  }
  // The windows open right now, as this pack sees them.
  windows(pk) {
    const g = this.g, P = g.player, m = pk.model, out = [];
    if (!pk.seeing) return out;
    const learned = m.reloadsSeen >= GV.learnReloads;
    if (learned && P.reloading > 0 && !P.clearing) out.push('reloading');
    if (learned && m.magCycles >= 2 && m.chainOk && m.magEst > 0 && m.chain >= m.magEst) out.push('dry'); // by their own count your gun is empty
    if (P.hp / (P.maxHp || 100) <= GV.wounded) out.push('wounded');
    if (g.survival?.sleep) out.push('asleep');
    if (pk.lure) { const t = g.traps.byId(pk.lure); if (t && (t.state === 'sprung' || Math.hypot(t.x - P.x, t.z - P.z) < 3)) out.push('lure'); }
    return out;
  }
  odds(pk) {
    const g = this.g, m = pk.model, live = this.alive(pk), W = this.windows(pk);
    const power = live.reduce((s, c) => s + c.hp / 100, 0) * GV.power;
    const base = this.danger(m) * (1 + 0.6 * m.allies) * (m.allies ? 1 : GV.windows.alone);
    const mul = W.reduce((k, w) => Math.min(k, GV.windows[w] ?? 1), 1);
    void g;
    return { power: +power.toFixed(2), threat: +(base * mul).toFixed(2), threat0: +base.toFixed(2), windows: W };
  }

  // ---- the pack's mind (each decide tick) --------------------------------------------------------------------------
  decide(pk, dt) {
    const g = this.g, P = g.player, m = pk.model, live = this.alive(pk);
    pk.stateT += dt;
    if (!live.length) return;
    pk.x = live.reduce((s, c) => s + c.x, 0) / live.length; pk.z = live.reduce((s, c) => s + c.z, 0) / live.length;
    const d = Math.hypot(P.x - pk.x, P.z - pk.z), o = this.odds(pk); pk.lastOdds = o;
    const lost = pk.members.filter((q) => q.dead || (q.c && !q.c.alive)).length;
    const hit = live.some((c) => (c.hitAt ?? -99) > g.time - 3);
    const window = o.windows.length > 0;
    if (lost >= Math.ceil(pk.members.length / 2) && pk.state !== 'retreat') { this.set(pk, 'retreat', 'half of them down'); pk.goHome = true; return; }
    switch (pk.state) {
      case 'roam': case 'feed': case 'ambush':
        if (pk.seeing && P.alive) { this.set(pk, 'stalk', 'saw you'); return; }
        if (pk.state === 'roam' && this.findFeed(pk)) return;
        if (pk.state === 'ambush' && pk.stateT > 60) this.set(pk, 'roam', 'the lure went cold');
        return;
      case 'stalk': {
        if (!P.alive) { this.set(pk, 'roam', 'you are dead'); return; }
        if (hit && !window) { this.set(pk, 'retreat', 'hit with no window'); return; }
        const watchedHard = live.some((c) => c.gv.watchedT > GV.watchedFor);
        if (o.power < GV.retreatAt * o.threat0 && d < m.reach + 5 && watchedHard) { this.set(pk, 'retreat', 'outmatched'); return; }
        if (window && o.power >= o.threat && m.watched >= GV.minWatch && d < 45) { pk.window = o.windows[0]; this.set(pk, 'strike', o.windows.join('+')); g.emit('grapevineStrike', { pack: pk.id, windows: o.windows, power: o.power, threat: o.threat, reloading: P.reloading > 0 }); return; }
        if (g.time - m.lastSeen > 25) { this.set(pk, 'roam', 'lost you'); return; }
        if (!pk.lure && m.watched > GV.ambushAfter && !P.inVehicle && (P.speed ?? 0) > 1.5) this.layLure(pk);
        return;
      }
      case 'strike':
        if (!P.alive) { this.set(pk, 'feed', 'you went down'); return; }
        if (hit && !window && pk.stateT > 1.5) { this.set(pk, 'retreat', 'the window shut on them'); return; }
        if (!window && pk.stateT > 6) this.set(pk, 'stalk', 'the window shut');
        return;
      case 'retreat':
        if (d > 50 && !pk.seeing) {
          pk.hide = (pk.hide ?? 0) + dt;
          if (pk.hide > GV.regroup) { pk.hide = 0; if (pk.goHome) { pk.goHome = false; this.set(pk, 'roam', 'went home'); } else this.set(pk, 'stalk', 'regrouped'); }
        }
        return;
    }
  }
  // A body near the pack, nobody living near it: dinner.
  findFeed(pk) {
    const g = this.g;
    let best = null, bd = GV.feedR;
    for (const c of g.chars) {
      if (c.alive || c === g.player || c.npc || c.res || c.gv || c.deadTime < 1 || c.inVehicle) continue;
      const d = Math.hypot(c.x - pk.x, c.z - pk.z);
      if (d >= bd) continue;
      let safe = true;
      for (const o of g.chars) if (o.alive && !o.gv && o.faction !== 'zombie' && Math.abs(o.x - c.x) < GV.safeR && Math.abs(o.z - c.z) < GV.safeR && Math.hypot(o.x - c.x, o.z - c.z) < GV.safeR) { safe = false; break; }
      if (safe) { bd = d; best = c; }
    }
    if (!best) return false;
    pk.feed = { body: best, t: 0 };
    this.set(pk, 'feed', `a body ${Math.round(bd)} m off`);
    return true;
  }
  layLure(pk) {
    const g = this.g, P = g.player, a = P.face, x = P.x + Math.sin(a) * 32, z = P.z + Math.cos(a) * 32;
    if (!g.nav.foot.free(x, z)) return;
    const t = g.traps.place('bait', x, z, pk.id, a);
    if (!t) return;
    pk.lure = t.id;
    this.set(pk, 'ambush', 'laid a lure');
  }
  onTrap(t, c) { const pk = this.byId(t.owner); if (pk && c === this.g.player && pk.state === 'ambush') pk.model.watched += 0; }

  // ---- each member (ai.update hands faction grapevine here) ---------------------------------------------------------
  think(c, dt) {
    const g = this.g, S = c.gv, pk = S.pk, P = g.player;
    c.aiming = false;
    if (!pk.live) { c.speed = 0; return; }
    const px = P.inVehicle ? P.inVehicle.x : P.x, pz = P.inVehicle ? P.inVehicle.z : P.z, d = Math.hypot(px - c.x, pz - c.z);
    // Being looked at: you aim within 25 degrees of it, with a clear line.
    const looked = P.alive && d < 45 && ang(Math.atan2(c.x - P.x, c.z - P.z), Math.atan2(g.aim.x - P.x, g.aim.z - P.z)) < 0.44 && g.sees(P, c);
    S.watchedT = looked ? S.watchedT + dt : 0;
    switch (pk.state) {
      case 'strike': {
        c.crouch = false;
        if (d < 1.3 && !P.inVehicle) {
          c.speed = 0; c.face = Math.atan2(px - c.x, pz - c.z);
          if ((S.cut -= dt) <= 0) { S.cut = GV.cutEvery; g.combat.damage(P, GV.claw, c, (px - c.x) / (d || 1), (pz - c.z) / (d || 1), 'cut'); }
        } else g.ai.move(c, px - c.x, pz - c.z, GV.run, dt);
        return;
      }
      case 'retreat': {
        c.crouch = false;
        if (!S.spot || (S.spotT -= dt) <= 0) { S.spot = this.hideSpot(c, px, pz, 60); S.spotT = 2; }
        const dx = S.spot.x - c.x, dz = S.spot.z - c.z;
        if (Math.hypot(dx, dz) > 1) g.ai.move(c, dx, dz, GV.run, dt); else { c.speed = 0; c.crouch = true; }
        return;
      }
      case 'stalk': {
        // Keep stalkD off, where it can still see you; looked at too long, break your line of sight.
        const want = Math.max(GV.stalkD[0], Math.min(GV.stalkD[1], pk.model.reach + 8));
        if (S.watchedT > GV.watchedFor) { if (!S.hiding) { S.spot = this.hideSpot(c, px, pz, Math.max(want, d + 6)); S.spotT = 3; S.hiding = true; } }
        else if (!S.spot || (S.spotT -= dt) <= 0) { S.hiding = false; S.spot = this.stalkSpot(c, pk, px, pz, want); S.spotT = 1.5; }
        if (S.hiding && (S.spotT -= dt) <= 0) S.hiding = false;
        const dx = S.spot.x - c.x, dz = S.spot.z - c.z, dd = Math.hypot(dx, dz);
        if (dd > 1) { c.crouch = false; g.ai.move(c, dx, dz, dd > 8 ? GV.stalk : GV.pace, dt); }
        else { c.speed = 0; c.crouch = true; c.face = Math.atan2(px - c.x, pz - c.z); }
        return;
      }
      case 'feed': {
        const F = pk.feed, b = F?.body;
        if (!b || !g.chars.includes(b)) { this.set(pk, 'roam', 'nothing left'); return; }
        const dx = b.x - c.x, dz = b.z - c.z, dd = Math.hypot(dx, dz);
        if (dd > 1.1) { c.crouch = false; g.ai.move(c, dx, dz, GV.stalk, dt); return; }
        c.speed = 0; c.crouch = true; c.handsUp = true; c.face = Math.atan2(dx, dz);
        if (S.k === this.alive(pk)[0]?.gv.k) { F.t += dt; if (Math.random() < dt * 2) g.fx.decal(b.x + (Math.random() - 0.5), b.z + (Math.random() - 0.5), 0.3, '#3a0606'); }
        if (F.t >= GV.feedFor) this.eat(pk, b);
        return;
      }
      case 'ambush': {
        const t = g.traps.byId(pk.lure);
        if (!t) { this.set(pk, 'roam', 'no lure'); return; }
        const a = S.k * 1.7 + 0.5, sx = t.x + Math.sin(a) * 11, sz = t.z + Math.cos(a) * 11;
        if (Math.hypot(sx - c.x, sz - c.z) > 1) g.ai.move(c, sx - c.x, sz - c.z, GV.stalk, dt); else { c.speed = 0; c.crouch = true; c.face = Math.atan2(t.x - c.x, t.z - c.z); }
        return;
      }
      default: {
        // Roaming their ground.
        c.crouch = false;
        if (!S.spot || Math.hypot(S.spot.x - c.x, S.spot.z - c.z) < 1 || (S.spotT -= dt) <= 0) { const mr = Math.random() * Math.PI * 2, r = 4 + Math.random() * 18; S.spot = { x: pk.row.x + Math.cos(mr) * r, z: pk.row.z + Math.sin(mr) * r }; S.spotT = 6 + Math.random() * 6; }
        g.ai.move(c, S.spot.x - c.x, S.spot.z - c.z, GV.pace, dt);
      }
    }
  }
  // Where to stand while stalking: on a ring round you at `want`, spread by member, behind your facing if it can be.
  stalkSpot(c, pk, px, pz, want) {
    const g = this.g, P = g.player, behind = P.face + Math.PI;
    // Spread round you, each member its own place in the line (a pack fans out; it doesn't huddle).
    const n = Math.max(1, this.alive(pk).length), idx = this.alive(pk).indexOf(c);
    const cur = Math.atan2(pk.x - px, pk.z - pz) + (idx - (n - 1) / 2) * 0.42;
    let best = null, bs = -1e9;
    for (let k = -3; k <= 3; k++) {
      const a = cur + k * 0.35, x = px + Math.sin(a) * want, z = pz + Math.cos(a) * want;
      if (!g.nav.foot.free(x, z)) continue;
      const s = -ang(a, behind) * 0.6 - Math.abs(k) * 0.25 + (g.los(x, z, px, pz) ? 0.5 : -1.5);
      if (s > bs) { bs = s; best = { x, z }; }
    }
    return best ?? { x: c.x, z: c.z };
  }
  // Somewhere out of your line of sight, at least `far` from you.
  hideSpot(c, px, pz, far) {
    const g = this.g, away = Math.atan2(c.x - px, c.z - pz);
    let best = null, bs = -1e9;
    for (let k = 0; k < 12; k++) {
      const a = away + (k - 6) * 0.3, r = far + (k % 3) * 6, x = px + Math.sin(a) * r, z = pz + Math.cos(a) * r;
      if (!g.nav.foot.free(x, z)) continue;
      const s = (g.los(px, pz, x, z) ? 0 : 3) - Math.abs(k - 6) * 0.15 - Math.hypot(x - c.x, z - c.z) * 0.02;
      if (s > bs) { bs = s; best = { x, z }; }
    }
    return best ?? { x: c.x + Math.sin(away) * 20, z: c.z + Math.cos(away) * 20 };
  }
  // The body is gone; a stain and a scatter of bone are what's left.
  eat(pk, b) {
    const g = this.g, x = b.x, z = b.z;
    if (!g.rites?.eaten(b)) g.removeChar(b); // the flesh goes; the bones and what was on them stay (systems/rites.js)
    g.fx.decal(x, z, 1.6, '#2a0505'); g.fx.decal(x + 0.4, z - 0.3, 0.9, '#3a0808');
    for (let k = 0; k < 6; k++) g.fx.decal(x + (Math.random() - 0.5) * 2, z + (Math.random() - 0.5) * 2, 0.18, '#d8d0b8');
    this.clues.push({ x: r1(x), z: r1(z), t: r1(g.time), pack: pk.id, who: b.name });
    if (this.clues.length > 40) this.clues.shift();
    this.stats.eaten++; pk.feed = null;
    g.emit('bodyEaten', { pack: pk.id, body: b.id, name: b.name, x: r1(x), z: r1(z) });
    this.set(pk, 'roam', 'fed');
  }

  // The grapevine itself: what one pack knows, another hears (at toldW).
  tell(from, to) {
    const a = from.model, b = to.model, w = GV.toldW;
    for (const k of ['watched', 'sightings', 'shotsHeard', 'shotsSeen', 'reloadsSeen', 'runs', 'nightS', 'light', 'sleepsSeen']) b[k] = Math.max(b[k], a[k] * w);
    b.reach = Math.max(b.reach, a.reach); b.magEst = Math.max(b.magEst, a.magEst); b.lowestHp = Math.min(b.lowestHp, a.lowestHp);
    for (const [k, v] of Object.entries(a.weapons)) { const t = (b.weapons[k] ??= { held: 0, shots: 0 }); t.held = Math.max(t.held, v.held * w); t.shots = Math.max(t.shots, v.shots * w); }
    if (knows(a)) { b.told++; this.stats.told++; this.g.emit('grapevineTold', { from: from.id, to: to.id }); }
  }

  update(dt) {
    const g = this.g, P = g.player;
    if (!this.enabled) return;
    this.observe(dt);
    // Promote at night near their ground (or when they're on you already); demote by day or far off.
    if ((this.scanT -= dt) <= 0) {
      this.scanT = 0.5;
      const night = g.sky?.night ?? 0, px = P.inVehicle ? P.inVehicle.x : P.x, pz = P.inVehicle ? P.inVehicle.z : P.z;
      for (const pk of this.packs) {
        for (const m of pk.members) if (m.c && !g.chars.includes(m.c)) { m.dead = !m.c.alive; m.c = null; }
        pk.live = pk.members.some((m) => m.c);
        const dg = Math.hypot(px - pk.row.x, pz - pk.row.z), dp = Math.hypot(px - pk.x, pz - pk.z);
        if (!pk.live && !pk.pinned && night > 0.5 && dg < pk.row.promoteR && pk.members.some((m) => !m.dead)) this.promote(pk);
        else if (pk.live && !pk.pinned && ((night < 0.25 && pk.state !== 'strike' && pk.state !== 'stalk') || (dg > pk.row.leash && dp > pk.row.demoteR) || dp > pk.row.demoteR + 200)) this.demote(pk);
      }
      // Dawn: packs within tellR pass on what they know.
      const day = g.society?.day ?? 0;
      if (this.day !== day) { if (this.day >= 0) for (const a of this.packs) for (const b of this.packs) if (a !== b && Math.hypot(a.row.x - b.row.x, a.row.z - b.row.z) < GV.tellR) this.tell(a, b); this.day = day; }
      if ((this.tellT -= 0.5) <= 0) { this.tellT = 60; for (const a of this.packs) for (const b of this.packs) if (a !== b && a.live && b.live && Math.hypot(a.x - b.x, a.z - b.z) < GV.tellNear) this.tell(a, b); }
    }
    if ((this.decideT -= dt) <= 0) { const step = 0.25 - this.decideT; this.decideT = 0.25; for (const pk of this.packs) if (pk.live) this.decide(pk, step); }
    // Eyeshine: at night their eyes catch your light at the edge of the beam.
    const night = g.sky?.night ?? 0;
    if (night > 0.5 && g.wilds) for (const pk of this.packs) if (pk.live) for (const m of pk.members) {
      const c = m.c; if (!c?.alive) continue;
      const d = Math.hypot(c.x - P.x, c.z - P.z);
      if (d > 34 || d < 3) continue;
      // Brighter the more of your light falls their way (you facing them), never nothing: you see the eyes before the shape.
      const toThem = Math.atan2(c.x - P.x, c.z - P.z), k = 0.55 + 0.45 * Math.max(0, Math.cos(toThem - P.face));
      const fx = Math.sin(c.face), fz = Math.cos(c.face), sx = Math.cos(c.face) * 0.11, sz = -Math.sin(c.face) * 0.11, y = (c.crouch ? 1.12 : 1.62) + (c.gy ?? 0);
      const col = k > 0.85 ? '#fff0a8' : '#e0c870';
      g.wilds.glint(c.x + fx * 0.3 + sx, y, c.z + fz * 0.3 + sz, 0.08 * k + 0.025, col);
      g.wilds.glint(c.x + fx * 0.3 - sx, y, c.z + fz * 0.3 - sz, 0.08 * k + 0.025, col);
    }
  }

  view(pk) {
    const P = this.g.player, m = pk.model;
    return {
      id: pk.id, name: pk.row.name, promoted: pk.live, state: pk.state, why: pk.why, alive: pk.members.filter((q) => (q.c ? q.c.alive : !q.dead)).length,
      d: r1(Math.hypot(P.x - pk.x, P.z - pk.z)), knows: knows(m), odds: pk.live ? this.odds(pk) : null, seeing: !!pk.seeing,
      model: { ...m, watched: r1(m.watched), nightS: r1(m.nightS), light: r1(m.light), woundedSeen: r1(m.woundedSeen), reloadTime: +m.reloadTime.toFixed(2), lowestHp: +m.lowestHp.toFixed(2), lastSeen: m.lastSeen < 0 ? null : r1(m.lastSeen), weapons: Object.fromEntries(Object.entries(m.weapons).map(([k, w]) => [k, { held: r1(w.held), shots: w.shots }])) },
      members: pk.members.map((q) => q.c?.id ?? null),
    };
  }
  save() { return this.packs.map((pk) => ({ id: pk.id, model: pk.model, members: pk.members.map((m) => ({ n: m.n, hp: m.c ? (m.c.alive ? Math.round(m.c.hp) : 0) : m.hp, dead: m.c ? !m.c.alive : m.dead })) })); }
  load(s) {
    for (const pk of this.packs) if (pk.live) this.demote(pk);
    this.rounds = null; this.reloadingWas = 0;
    if (!Array.isArray(s)) return;
    for (const d of s) {
      const pk = this.byId(d.id);
      if (!pk) continue;
      pk.model = { ...emptyModel(), ...(d.model ?? {}) };
      for (const sm of d.members ?? []) { const m = pk.members[sm.n]; if (m) { m.hp = sm.hp; m.dead = sm.dead; } }
    }
  }
}
void WEAPONS;
