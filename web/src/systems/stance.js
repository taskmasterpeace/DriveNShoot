import { STANCES, PRONE, CONCEAL, FOOTING } from '../data/stance.js';
import { RAY_SIGHT } from '../engine/collision.js';
import { brushField } from '../world/brush.js';

// STANCES (data/stance.js; docs/design/WEB_DECKS_STANCE.md): standing, crouched, prone, for everyone (the player, a crew
// member, a raider in the grass). One place answers the questions every other system asks about a body:
//   kind(c)               'stand' | 'crouch' | 'prone' (c.prone wins over c.crouch)
//   seenRange(o, range, crouchMul, viewer)   how far a watcher with normal range `range` picks o out. The watcher keeps its
//                         own crouch number (ai.js 0.6, bases.js crouchMul, fauna.js 0.55, deeds.js 0.6...); prone is the
//                         row's 0.25, and a prone body in cover or grass is unseen past PRONE.hiddenPast (D2)
//   fit(c, p, face)       pushes a prone body's capsule (head, hips, feet) out of every wall: nothing sticks through
//   footing(c)            QUICKNESS x the stance's brace: how hard a moving floor has to be to throw them (D3)
//   setProne(c, on)       down / up, with the rules (never in a seat, a cabin, water, mid-dive)
// Everything is read per call from fields the body already has: no allocation, no per-frame list.
const _p = { x: 0, z: 0 }, _q = { x: 0, z: 0 };
const D2R = Math.PI / 180, ENDS = [1, -1], ALL3 = [1, 0, -1];
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export class Stance {
  constructor(game) { this.g = game; this.stats = { downs: 0, refused: 0, pushes: 0 }; }

  kind(c) { return c.prone ? 'prone' : c.crouch ? 'crouch' : 'stand'; }
  row(c) { return STANCES[this.kind(c)]; }
  speed(c) { return this.row(c).speed; }

  // ---- getting down and up ---------------------------------------------------------------------------------------
  // Why c can't lie down right here, or null. D2: never in a cabin; never in a seat, swimming, wading, mid-dive.
  refuse(c) {
    if (!c.alive) return 'down already';
    if (c.inVehicle) return 'in a seat';
    if (c.onTrain || c.grabbing) return 'hanging on';
    if (c.onDeck && !c.onDeck.D.open) return 'no room to lie down in here';
    if (c.swim || c.underwater) return 'in deep water';
    if (c === this.g.player && this.g.water?.stateAt?.(c.x, c.z, c.gy) === 'wade') return 'in the water';
    if (c.dive > 0 || c.vault || c.knockT > 0) return 'not now';
    return null;
  }
  setProne(c, on) {
    if (!!c.prone === !!on) return { ok: true, prone: !!c.prone };
    if (on) {
      const why = this.refuse(c);
      if (why) { this.stats.refused++; return { ok: false, why }; }
      c.prone = true; c.crouch = false; c.proneH = c.face ?? 0; c.proneT = PRONE.downT;
      this.stats.downs++;
      this.fitNow(c);
    } else { c.prone = false; c.proneT = PRONE.downT; }
    this.g.emit('stance', { id: c.id, stance: this.kind(c) });
    return { ok: true, prone: !!c.prone };
  }

  // A prone body turns toward where it aims (outside the arc) or where it crawls, never faster than turnRate; the gun
  // points within aimArc of the body. Returns the clamped aim (world heading). dt 0: just the clamp.
  steer(c, aimAng, moveAng, dt) {
    if (!c.prone) return aimAng;
    const arc = PRONE.aimArc * D2R, want = moveAng ?? aimAng;
    let off = wrap(want - c.proneH);
    if (moveAng !== null && moveAng !== undefined && Math.abs(off) > Math.PI / 2) off = wrap(off - Math.PI); // crawling back: feet first
    const need = moveAng !== null && moveAng !== undefined ? off : Math.abs(off) > arc ? off - Math.sign(off) * arc : 0;
    if (need && dt > 0) {
      const step = Math.sign(need) * Math.min(Math.abs(need), PRONE.turnRate * dt), h0 = c.proneH;
      c.proneH = wrap(c.proneH + step);
      if (!this.fitNow(c)) c.proneH = h0; // a turn that would put the head through a wall doesn't happen
    }
    const a = wrap(aimAng - c.proneH);
    return wrap(c.proneH + Math.max(-arc, Math.min(arc, a)));
  }

  // ---- the body ------------------------------------------------------------------------------------------------------
  // Push the capsule (head, hips, feet circles along c.proneH) out of the street's boxes, moving the hips. True when it
  // fits (nothing left inside a wall). A deck rider's capsule is the deck's (systems/decks.js resolve), not the street's.
  fitNow(c) {
    if (!c.prone || c.onDeck || c.inVehicle) return true;
    const b = STANCES.prone.body, S = this.g.statics, fx = Math.sin(c.proneH), fz = Math.cos(c.proneH);
    let ok = true;
    for (let it = 0; it < 3; it++) {
      let moved = false;
      for (const k of ENDS) {
        _p.x = c.x + fx * b.len * k; _p.z = c.z + fz * b.len * k;
        _q.x = _p.x; _q.z = _p.z;
        if (S.resolveBody(_p, b.r, c, null) > 0) { c.x += _p.x - _q.x; c.z += _p.z - _q.z; moved = true; this.stats.pushes++; }
      }
      _p.x = c.x; _p.z = c.z;
      if (S.resolveBody(_p, b.r, c, null) > 0) { c.x = _p.x; c.z = _p.z; moved = true; }
      if (!moved) { ok = true; break; }
      ok = false;
    }
    if (!ok) ok = !this.penetrates(c);
    return ok;
  }
  // Does any of the capsule's three circles overlap a box? (The selftest's "nothing sticks through" probe, and fitNow's
  // last word.)
  penetrates(c, h = c.proneH) {
    const b = STANCES.prone.body, S = this.g.statics, fx = Math.sin(h), fz = Math.cos(h);
    for (const k of ALL3) { _p.x = c.x + fx * b.len * k; _p.z = c.z + fz * b.len * k; if (S.resolveBody(_p, b.r - 0.02, c, null) > 0) return true; }
    return false;
  }
  // Collision radius for the body's hips (main.js walks the hips; fitNow does the rest).
  radius(c) { return c.prone ? STANCES.prone.body.r : (c.radius ?? 0.4); }

  // ---- being seen ----------------------------------------------------------------------------------------------------
  // How hidden c's spot is (0 open .. 1 thick): the biome's grass, THE BRUSH's painted undergrowth and woods. Cached per
  // body (refreshed every CONCEAL.refresh s of game time): a watcher's scan asks this a dozen times a frame.
  conceal(c) {
    const t = this.g.time ?? 0;
    if (c._cnT !== undefined && t - c._cnT < CONCEAL.refresh && Math.abs((c._cnX ?? 0) - c.x) < 1 && Math.abs((c._cnZ ?? 0) - c.z) < 1) return c._cn;
    let v = 0;
    const W = this.g.streamer?.W, letter = W?.biomeAt?.(c.x, c.z);
    if (letter && CONCEAL.biome[letter] !== undefined) v = CONCEAL.biome[letter];
    for (const L in CONCEAL.brush) { const b = brushField.layerAt?.(L, c.x, c.z) ?? 0; if (b * CONCEAL.brush[L] > v) v = b * CONCEAL.brush[L]; }
    if (c.concealOverride !== undefined) v = c.concealOverride; // a staged patch (the selftest), or a hide a system lays
    c._cn = v; c._cnT = t; c._cnX = c.x; c._cnZ = c.z;
    return v;
  }
  // Is prone o in cover from (vx, vz)? A sight line at prone height (a low wall, a crate, a car's flank) stops.
  inCover(o, vx, vz) {
    return !this.g.statics.lineOfSight(vx, vz, o.x, o.z, RAY_SIGHT, (o.gy ?? 0) + PRONE.coverY);
  }
  // The range a watcher at (vx, vz) with normal range `range` sees o at. crouchMul: that watcher's own crouch number.
  // viewer (optional): who is looking - someone aboard o's own vehicle sees over the rail.
  seenRange(o, range, crouchMul, vx, vz, viewer = null) {
    if (o.prone) {
      let r = range * STANCES.prone.seen;
      const deck = o.onDeck;
      if (deck && PRONE.railHide && deck.D.open && viewer?.onDeck?.v !== deck.v && viewer?.inVehicle !== deck.v) return 0; // below the rail
      // In grass (or, with a watcher's position, behind something low): closer still, and never past hiddenPast.
      const cn = this.conceal(o), cover = vx !== undefined && cn < PRONE.concealAt && this.inCover(o, vx, vz);
      if (cn >= PRONE.concealAt || cover) r = Math.min(r * (1 - PRONE.grassCut * (cover ? 1 : cn)), PRONE.hiddenPast);
      return r;
    }
    if (o.crouch) return range * (STANCES.crouch.seen ?? crouchMul);
    return range;
  }

  // ---- footing on a moving floor (D3) --------------------------------------------------------------------------------
  // The rider's QUICKNESS (the player's sheet; a crew member's own; 5 for anyone without one), +-30%, times the stance's
  // brace. Every throw and stagger line of DECK_RULES is multiplied by this.
  quick(c) {
    if (c === this.g.player) return this.g.deep?.attrs?.[FOOTING.attr] ?? 5;
    return c.sheet?.attrs?.[FOOTING.attr] ?? c.attrs?.[FOOTING.attr] ?? 5;
  }
  agility(c) { const q = this.quick(c); return Math.max(FOOTING.min, Math.min(FOOTING.max, 1 + ((q - 5) / 5) * FOOTING.spread)); }
  footing(c) { return this.agility(c) * this.row(c).brace; }
  // The HUD word for how near the throw line a rider is (felt / line), and the share.
  band(share) { for (const [at, word] of FOOTING.bands) if (share < at) return word; return FOOTING.bands[FOOTING.bands.length - 1][1]; }

  view(c = this.g.player) {
    return { stance: this.kind(c), prone: !!c.prone, proneH: c.prone ? +c.proneH.toFixed(3) : null, speed: this.speed(c), body: this.row(c).body, conceal: +this.conceal(c).toFixed(2),
      footing: +this.footing(c).toFixed(3), agility: +this.agility(c).toFixed(3), quickness: this.quick(c), stats: this.stats };
  }
}
