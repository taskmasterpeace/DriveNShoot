// REACH: can a person put a hand on that? (docs/design/WEB_REACH.md; rows data/reach.js)
// Every "within N metres" interaction asks here, so a wall, a shut door, a boarded or glazed window or a floor between you
// and the thing stops your hand the way it stops your body. One rule for the player's E, the PACK screen's NEAR list, the
// agent commands and anyone else who reaches (the answer never depends on who is asking).
//
// The line: from the reacher to the thing at HAND height (REACH.hand above their floor), so a counter, a low fence or a
// sandbag row is reached over and a wall is not. A hand (kind 'hand') is a SOLID ray: glass stops it, an empty window frame
// does not. A word (kind 'talk') is a SIGHT ray: you can talk through glass and across a counter, never through a wall or
// a shut door. The thing's own body never blocks it: the box the line ends inside (a shelf's or a crate's own collider)
// and the door or window being worked are let through.
// No allocations: one line per call on the collision grid, and only for the few things already inside reach.
import { RAY_SOLID, RAY_SIGHT } from '../engine/collision.js';
import { LEVEL } from '../data/storeys.js';
import { REACH } from '../data/reach.js';

export class Reach {
  constructor(game) {
    this.g = game;
    this.counts = { asked: 0, blocked: 0, floor: 0 }; // since boot (the reach command reads them)
    this.last = { ok: true, why: null, tag: null, d: 0 }; // the last answer, for the reach command and the checks
  }

  // The height of a person's hand line as the collision grid wants it (the same convention as main.js losAt).
  // Upstairs the boxes stand on the BUILDING's own ground (storey.y0: a town lifted onto real terrain), so the height is
  // measured from it, as collision.js resolveBody does. On a flight of stairs you are on the street floor until you are
  // LEVEL.same up it (its doors, windows and shelves still stop your hand).
  handY(p) {
    const g = this.g;
    if (p.ug) return (p.gy ?? 0) - (g.under?.y0 ?? 0) + REACH.hand; // below the street: that level's walls
    const up = p.storey ? (p.gy ?? 0) - (p.storey.y0 ?? 0) : 0;
    if (up > LEVEL.same) return up + REACH.hand; // an upper floor
    return REACH.hand; // the street (a dune or a ramp under you changes nothing: the boxes stand on the same ground)
  }

  // Can p reach the point (x, z)? opts: kind 'hand' (default) | 'talk'; y = the thing's floor height (skipped when
  // undefined); op = the door or window record being worked (its own leaves and panes never block); pad = metres of the
  // thing's own body to stop short of (a car's flank: a car is not on the collision grid); big = the thing is a big
  // fixture standing on its own collider (a cistern, a hulk, a generator): that collider is its body whatever its size.
  to(p, x, z, opts = undefined) {
    const g = this.g, L = this.last, C = this.counts;
    C.asked++;
    L.ok = true; L.why = null; L.tag = null;
    const y = opts?.y;
    if (y !== undefined && Math.abs(y - (p.gy ?? 0)) > LEVEL.same) { C.blocked++; C.floor++; L.ok = false; L.why = 'floor'; return false; }
    const dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz);
    L.d = d;
    if (d < (g.stance?.radius?.(p) ?? p.radius ?? REACH.body) + REACH.touch) return true; // at arm's length nothing fits between you (from the edge of YOUR body: prone you are narrower)
    const len = d - (opts?.pad ?? 0);
    if (len <= 0) return true; // inside the thing's own flank
    const S = g.statics, mode = opts?.kind === 'talk' ? RAY_SIGHT : RAY_SOLID;
    const t = S.raycast(p.x, p.z, dx / d, dz / d, len, mode, this.handY(p));
    if (t >= len - 0.05) return true;
    const b = S.hit.box;
    if (b !== null) {
      const op = opts?.op;
      if (b.op !== null) { if (op !== undefined && op !== null && (b.op === op || b.op.door === op)) return true; } // the door you are working
      else if (x > b.minX - REACH.own && x < b.maxX + REACH.own && z > b.minZ - REACH.own && z < b.maxZ + REACH.own && this.ownBody(b, opts?.big === true)) return true; // the thing's own collider
    }
    C.blocked++;
    L.ok = false; L.why = b?.op ? (b.op.kind === 'leaf' ? 'door' : 'window') : 'wall'; L.tag = b?.tag ?? null;
    return false;
  }

  // A box the line may END inside: furniture (a shelf, a crate, a counter), never a wall. A wall is long or it is tagged
  // as one; furniture is small.
  ownBody(b, big = false) {
    if (REACH.wallTags.includes(b.tag)) return false;
    return big || Math.max(b.maxX - b.minX, b.maxZ - b.minZ) <= REACH.ownMax;
  }

  // A person (to talk to, to wake, to pay): on your floor and a clear line for a voice.
  person(p, c) { return this.g.storeys.sameFloor(p, c) && this.to(p, c.x, c.z, TALK); }
  // A container, a body, a pile (on your floor).
  box(p, b) { if (b.x === undefined) return true; BOX.y = b.y ?? 0; return this.to(p, b.x, b.z, BOX); } // (a trunk has no place of its own: the car is asked, reach.vehicle)
  // A big fixture standing on its own collider (a roadside spot, a generator).
  fixture(p, x, z) { return this.to(p, x, z, BIG); }
  // A vehicle: the line stops at its flank.
  vehicle(p, v) { PAD.pad = Math.max(0.6, (v.wid ?? 2) * 0.5); return this.to(p, v.x, v.z, PAD); }
  // A door or window record (systems/interiors.js).
  opening(p, o) { OP.op = o; const r = this.to(p, o.x, o.z, OP); OP.op = null; return r; }
}
const TALK = { kind: 'talk' }, PAD = { pad: 0 }, OP = { op: null }, BOX = { y: 0 }, BIG = { big: true };
