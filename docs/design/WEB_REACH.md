# WEB_REACH — no hand through a wall

**Status:** BUILT 2026-11-12 on `feat/web-zed-wallreach`.
**Code:** the rule is `web/src/systems/reach.js` (`g.reach`); rows in `web/src/data/reach.js` (`REACH`, `validateReach`);
the agent surface is `web/src/agent/reach-api.js` (the `reach` command and seven named checks).
**Source of the ask:** Robert's playtest, 2026-11-12: "right now too it looks like you can do stuff through the walls,
bro. Like you can grab stuff through the walls. It's kind of weird."

## 1. Overview
Every "within N metres" interaction was a distance test and nothing else. The PACK screen's NEAR list
(`ui/inventory.js findNear`) took every container within 2.6 m and searched it; E offered the nearest crate, bed, person
or car by distance alone. Standing in the street against a shop's wall, you could empty the crate on the far side.

Now one rule answers "can a hand get there": a line from the reacher to the thing at hand height on the collision grid.
A wall, a shut door, glass, boards or a floor in the way stops it. The player's E, the PACK screen, the sleep key and the
agent commands all ask the same rule, so nobody (and no agent) reaches where a body could not.

## 2. Player fantasy
A locked shop is a locked shop. You can see the shelves through the window and you have to break in to get at them. The
man behind the wall can't be talked to until you find his door. A crate in the next room is in the next room. A counter is
still a counter: you lean over it to trade.

## 3. Detailed rules
- **The line.** From the reacher's position to the thing's position, at `REACH.hand` (1.3 m) above the reacher's floor.
  Boxes no taller than that are reached over: a shop counter, a sandbag row, a low fence. Upstairs the height is
  measured from the building's own ground (`storey.y0`: a town lifted onto real terrain keeps its boxes on its own
  floor, as `collision.js resolveBody` does). On a flight of stairs you count as on the street floor until you are
  `LEVEL.same` up it. Below the street the line is cast at that level's height.
- **A hand** (containers, bodies, piles, beds, cars, dogs, carcasses, roadside work spots, a base's generator and log, a
  casino's charger pad, doors and windows) is a SOLID line. Glass and boards stop it. An empty window frame (shattered
  glass) does not: you can take from a shelf right inside a broken window.
- **A word** (talk to, wake, pay a witness) is a SIGHT line. It passes glass and an open or ajar door, so a keeper behind
  a window still trades. It never passes a wall, a shut door or boards.
- **The thing's own body never blocks.** The line may end inside the box that holds the thing's point (a shelf's or a
  crate's own collider), if that box is furniture: not tagged as a wall (`REACH.wallTags`) and no longer than
  `REACH.ownMax`. The door or window you are working lets its own leaves and panes through.
- **Arm's length.** Within `REACH.touch` (0.4 m) of the edge of your own body no line is cast: 0.8 m from your centre
  standing (radius 0.4), 0.66 m prone (radius 0.26).
- **A big fixture** (a junkyard hulk, the dam's cistern, a base's generator, a casino's office safe) is reached on its
  own collider whatever its size (`reach.fixture`): you work it from beside it.
- **Floors.** A container, a body (to search it or to drag it), a pile, a bed, a person or a dog more than `LEVEL.same`
  (1.6 m) above or below your feet is out of reach. Doors, windows, cars, carcasses and fixtures have no floor test of their own (they are on the
  floor you stand on, or the line at your height meets that floor's walls).
- **Cars.** A car is not on the collision grid, so the line stops at its flank (`pad` = half its width). For the same
  reason a parked car never blocks a hand: you reach over a bonnet.
- **Nearest reachable wins.** `inventory.nearest(…, who)` and the door search skip what can't be reached, so a crate behind
  the wall never hides the one beside you.
- **Where it is asked** (each is one call):

| Interaction | File | Kind |
|---|---|---|
| E: crate, shelf, body, pile | `main.js` → `inventory.nearest(…, p)` | hand |
| PACK screen: the other side, the NEAR list, the trunk you stand at | `ui/inventory.js pickOther`, `findNear`, `carAt` | hand |
| E / N: a bed | `main.js bedNear(…, who)` | hand |
| E: talk, wake, pay a witness | `main.js` → `reach.person` | word |
| F / C / G: a car | `main.js` → `reach.vehicle` | hand |
| E: a door or window (kick, pick, smash, climb, board) | `interiors.js nearest` → `reach.opening` | hand |
| E: a dog | `dogs.js nearFor` | hand |
| E: a carcass | `fauna.js nearFor` | hand |
| E: a roadside spot (fill caps, a hulk, a tank, the cistern, the dam's wheel) | `roadside.js spotNear` | hand (fixture) |
| E: a base's generator (fixture) and duty log | `milbases.js interact` | hand |
| E: a casino's charger pad and its office safe (fixture) | `casinos.js interact` | hand |
| Hold E: drag, bury or burn a body | `rites.js bodyNear(…, who)` → `inReach`: on your floor (the corpse's own height: the ground, a hill, an upper floor or its level below the street), a clear line, the nearest one you can reach | hand |
| The ground at your feet (a drop, the PACK's ground side) | `inventory.js groundAt`: a pile within 1.6 m that your hand can get to, else a fresh one where you stand | hand |
| The PACK screen left open (a box, a body, a pile) | `ui/inventory.js update` (four times a second) | hand |
| The agent's `rites action=drag` (`rites.inReach`: floor and line) and the safe's own rule (`casinos.workSafe`) | the same `g.reach` | hand |

- **Not changed** (already line-of-sight or contact rules of their own): shooting (`fire` refuses through walls),
  gunpoint (it is aimed), melee (`combat.js` wall law), fences (the fence is the thing), seats at a table (1.1 m),
  manhole lids (1.5 m), ladders, a vehicle deck's own spots.
- **Not covered yet** (distance only; none hands you an item): a base's blast-door keypad (3.4 m), reviving or dragging
  a downed crew member (`crew.downedNear`), the look-around that reveals small piles (`actions.lookKey`; picking them up
  is covered), a travel board (4.5 m, read not taken) and a vat counter, a casino cage hold-up.

## 4. Formulas
| Name | Formula | Variables | Example |
|---|---|---|---|
| Reach | `ok = d < radius + touch ∨ d ≤ pad ∨ ray(p → thing, mode, y) ≥ d − pad − 0.05 ∨ ownBody(hit)` | d = flat distance (0–5.2 m); radius = your body's (0.4 standing, 0.26 prone); pad = a car's half width (0.6–1.3), else 0; mode SOLID (hand) or SIGHT (word) | A crate 2.3 m off through a 0.2 m wall: the ray stops at 1.9 m, the wall is not the crate's body → **false** |
| Hand height | `y = (gy − storey.y0 > LEVEL.same ? gy − storey.y0 : 0) + hand` | gy = your feet; storey.y0 = the building's own ground; hand = 1.3 | A 1.0 m counter between you and the keeper's shelf: 1.0 ≤ 1.3, flown over → **true** |
| Own body | `tag ∉ wallTags ∧ (fixture ∨ max(side) ≤ ownMax) ∧ point within `own` of the box` | own = 0.12 m, ownMax = 3.4 m | A 1.2 × 0.5 m shelf holding its own point → true. A wall 0.3 m from that point → 0.3 > 0.12, false |
| Touch bound | `touch < thinnest wall + half shelf` | 0.2 + 0.25 = 0.45 | touch 0.4 passes; the validator refuses 0.45 and up. Prone against a 0.2 m wall: 0.26 + 0.2 + 0.25 = 0.71 ≥ 0.66, so the line is cast and the wall stops it |
| Floor | `|thing.y − p.gy| ≤ LEVEL.same` | LEVEL.same = 1.6 m | A crate on the floor above (3.2 m up): **false**, why `floor` |

## 5. Edge cases
- **A shelf against a wall, you on the other side:** blocked. The shelf's point is 0.25 m or more past the wall's face,
  further than `own`.
- **A tall shelf between you and the next shelf:** blocked until you step in front of the one you want (the nearest
  reachable one is offered instead).
- **A shattered window:** a hand passes through the frame. A boarded or intact one stops it; a word passes intact glass.
- **A door you just shut on someone:** you can't talk to or search them through it. Its own prompt (kick, pick) still shows.
- **A door ajar:** SIGHT passes it past `DOOR.nearClosed`; a hand line meets the leaf wherever it stands, so reach round
  an open door from the doorway.
- **The PACK screen left open while you walk round the wall:** within a quarter second of the line being blocked the
  opened box, body or pile stops being "the other side". It falls back to the nearest container you can reach, then the
  car you stand at, then the ground at your feet.
- **A pile just through a thin wall:** it is not "the ground here". Dropping something makes a fresh pile where you stand. A trader's counter opened from a talk stays (the
  keeper hands things across).
- **Riding a vehicle's deck:** the line starts at the street's hand height; the deck's own spots have their own rule.
- **Below the street:** the line is cast on that level's own grid (`statics.under`). A pile made down there keeps its
  level's height (before, only upstairs piles kept theirs, so a pile underground was never found again from its own
  level). A ragdoll below the street keeps the level it died on (`deaths.js track`: it used to be clamped up to the street's
  zero, which put every corpse down there out of reach, the infected first: they carry no box).
- **A person in a car:** not talked to at all (unchanged).
- **The agent's `talk` command** keeps its 4 m rule and its `force=true`; it is a test verb, not the player's E.

## 6. Dependencies
| System | What it needs from reach | What reach needs from it |
|---|---|---|
| `engine/collision.js` | — | `raycast` (SOLID / SIGHT at a height), `hit.box` (tag, op, bounds) |
| `main.js` | `reach.person`, `reach.vehicle`, `reach.to` in the E chain and `bedNear` | constructed before `stance`; `storeys.sameFloor` |
| `systems/inventory.js` (WEB_INVENTORY.md) | `nearest(…, who)` skips unreachable boxes | `boxes` (x, z, y) |
| `ui/inventory.js` (the PACK screen) | `pickOther`, `findNear`, `carAt` | — |
| `systems/interiors.js` | `nearest(p)` asks `reach.opening` per candidate | door / window records, `ops.ray` |
| `systems/dogs.js`, `fauna.js`, `roadside.js`, `milbases.js`, `casinos.js`, `rites.js` | one `reach.to` / `reach.fixture` each | — |
| `systems/stance.js` | — | `radius(p)`: a prone body is narrower, so its arm's length is shorter |
| `world/storeys.js`, `systems/citygen.js` | — | `storey.y0`: the building's own ground under an upper floor |
| `data/storeys.js` (WEB_STOREYS.md) | — | `LEVEL.same` |
| `systems/underground.js` | — | `under.y0` for the level's height |
| `systems/zombies.js` (WEB_ZOMBIES.md) | a shut door now truly hides you from a search and a talk; the infected still smell through it | — |

## 7. Tuning knobs
| Knob | Default | Safe range | Affects |
|---|---|---|---|
| `REACH.hand` | 1.3 m | 1.05–1.6 | What you reach over. Under 1.05 a counter blocks trade; over 1.6 you reach over tall furniture, and at 2.0 over a door's head |
| `REACH.touch` | 0.4 m | 0–0.44 | The no-line zone past your own body. From 0.45 a hand goes through a 0.2 m wall |
| `REACH.body` | 0.4 m | 0.2–0.6 | The radius assumed for a reacher that has none |
| `REACH.own` | 0.12 m | 0–0.2 | How loosely a thing's point sits in its own collider |
| `REACH.ownMax` | 3.4 m | 1–5 | The longest piece of furniture that can be a thing's own body |
| `REACH.wallTags` | wall, partition, fence, gate, rail, tower | must hold `wall` | Box tags that are never a thing's own body |

## 8. Acceptance criteria (selftest, `node tools/dl.mjs selftest only="reach:"`)
1. **Rows:** `validateReach` is clean; a touch of 0.6 and a hand of 0.6 are each caught.
2. **The rule on a bare grid:** a wall stops a hand and a word; a 1.0 m counter does not; a shelf's own body does not; the
   same shelf from behind its wall does, pressed to the wall standing and prone against a 0.2 m wall; a floor between
   does (`why: floor`); 0.7 m in the open passes; a 7.8 m cistern is reached as a fixture from 4.3 m and refused as a plain
   point; a car against the far side of a thin wall is refused and one beside you is not; upstairs in a town lifted 6 m
   a partition on the building's own ground stops the hand; 1.2 m up a flight the street floor's wall still does.
3. **No loot through a wall:** at a real island building, 2.3 m or less from a container on the far side of its wall: E
   does not open it, `pack on=true` does not make it the other side, `findNear()` does not list it, and it is neither
   rolled nor changed. From a spot with a clear line the same container opens and is listed (the control). Left open,
   then you step back round the wall: within 40 frames it is not the other side.
4. **Nobody, no bed, no car through a wall:** a stranger 2.8 m or less away behind the wall gets no Talk prompt and no
   dialogue; a bed and a car there are refused. With a clear line each is offered.
5. **Doors:** up to 40 island doors: each reaches from 1.2 m in front on both sides and is what `interiors.nearest`
   offers there; with a wall slab stood 0.55 m in front of it the same search stops offering it (`why: wall`); with the
   slab taken away it is offered again. At least 20 walled cases.
6. **The other hands:** at a bare stretch of a real wall with a dead man 1.7 m off on its far side: `rites.bodyNear`
   finds him by distance and not for your hand, and three 1.5 s holds of E start no drag; a pile against the wall's far
   face is not the ground at your feet and the PACK screen does not list it. From his own side the pile is the ground
   there and the same hold drags him (the control). At a junkyard hulk and at the dam's cistern (both required),
   `roadside.spotNear` offers the spot from every side you can stand at. Staged body records at the same wall: one
   0.5 m off on the floor above is passed over, one 1.7 m off through the wall is passed over, and the one 1.1 m off
   beside you is the one `bodyNear(…, you)` returns; with it gone, none.
7. **Below the street:** on Red Rock Cave's first level below the mouth (`level: 1`) the PACK screen held open on the ground keeps the one pile for
   120 frames (no new box, no new pile, the pile's height below −0.5), and a dead man 1 m off on that level is found for
   your hand and dragged by holding E. So is one of the infected killed there (no box of its own, its ragdoll settled
   for 90 frames, its height within 1.6 m of yours).

Before / after: `docs/renders/web/reach/zed-wallreach-before.jpg` (the PACK screen opens the cantina's crate from the
street) and `zed-wallreach-after.jpg` (the same spot opens the ground).

Critic review 2026-11-12. Fourth pass FAIL, one item, fixed in the sixth commit: the infected dead below the street
(no box) could not be dragged. Third pass FAIL, two items, fixed in the fourth commit: below the street bodies could not be
dragged (the corpse's own height is reset by its ragdoll) and the PACK's ground side re-picked a fresh pile four times a
second (a pile underground kept no height). Second pass FAIL, three items, fixed in the third commit: a ground pile taken through a
wall, a body dragged through a floor (and a nearer unreachable body hiding a reachable one), a drag check with no
control. First pass FAIL, seven items, fixed in the second commit: the cistern and hulks refused
(`ownMax` on fixtures), the upstairs height ignoring `storey.y0`, a body dragged through a wall, the casino safe, the
PACK screen left open, the prone body's shorter arm's length, a doors check that passed with the rule removed.
