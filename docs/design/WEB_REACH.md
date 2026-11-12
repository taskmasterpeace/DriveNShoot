# WEB_REACH — no hand through a wall

**Status:** BUILT 2026-11-12 on `feat/web-zed-wallreach`.
**Code:** the rule is `web/src/systems/reach.js` (`g.reach`); rows in `web/src/data/reach.js` (`REACH`, `validateReach`);
the agent surface is `web/src/agent/reach-api.js` (the `reach` command and five named checks).
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
  Boxes no taller than that are reached over: a shop counter, a sandbag row, a low fence. Upstairs and below the street
  the line runs at that level's height, by the same convention as sight (`main.js losAt`).
- **A hand** (containers, bodies, piles, beds, cars, dogs, carcasses, roadside work spots, a base's generator and log, a
  casino's charger pad, doors and windows) is a SOLID line. Glass and boards stop it. An empty window frame (shattered
  glass) does not: you can take from a shelf right inside a broken window.
- **A word** (talk to, wake, pay a witness) is a SIGHT line. It passes glass and an open or ajar door, so a keeper behind
  a window still trades. It never passes a wall, a shut door or boards.
- **The thing's own body never blocks.** The line may end inside the box that holds the thing's point (a shelf's or a
  crate's own collider), if that box is furniture: not tagged as a wall (`REACH.wallTags`) and no longer than
  `REACH.ownMax`. The door or window you are working lets its own leaves and panes through.
- **Arm's length.** Inside `REACH.touch` (0.8 m) no line is cast.
- **Floors.** A thing more than `LEVEL.same` (1.6 m) above or below the reacher's feet is out of reach.
- **Cars.** The line stops at the car's flank (`pad` = half its width), so the car's own body is not in its way.
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
| E: a roadside spot (fill caps, a hulk, a tank, the dam's wheel) | `roadside.js spotNear` | hand |
| E: a base's generator and duty log | `milbases.js interact` | hand |
| E: a casino's charger pad | `casinos.js interact` | hand |
| Dragging a body (the box must be the body's own) | `rites.js` | hand |

- **Not changed** (already line-of-sight or contact rules of their own): shooting (`fire` refuses through walls),
  gunpoint (it is aimed), melee (`combat.js` wall law), fences (the fence is the thing), seats at a table (1.1 m),
  manhole lids (1.5 m), ladders, a vehicle deck's own spots.

## 4. Formulas
| Name | Formula | Variables | Example |
|---|---|---|---|
| Reach | `ok = d − pad < touch ∨ ray(p → thing, mode, y) ≥ d − pad − 0.05 ∨ ownBody(hit)` | d = flat distance (0–4.5 m); pad = a car's half width (0.6–1.3) or a spot's body (1.2), else 0; mode SOLID (hand) or SIGHT (word) | A crate 2.3 m off through a 0.2 m wall: the ray stops at 1.9 m, the wall is not the crate's body → **false** |
| Hand height | `y = floor + hand` | floor = 0 on the street, the storey's or level's height otherwise; hand = 1.3 | A 1.0 m counter between you and the keeper's shelf: 1.0 ≤ 1.3, flown over → **true** |
| Own body | `tag ∉ wallTags ∧ max(side) ≤ ownMax ∧ point within `own` of the box` | own = 0.12 m, ownMax = 3.4 m | A 1.2 × 0.5 m shelf holding its own point → true. A wall 0.3 m from that point → 0.3 > 0.12, false |
| Touch bound | `touch < wall + body + half shelf` | 0.2 + 0.4 + 0.25 = 0.85 | touch 0.8 passes; the validator refuses 0.86 and up |
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
- **The PACK screen left open while you walk round the wall:** the opened box stops being "the other side" once the line
  is blocked (it falls back to the car you stand at, then the ground). A trader's counter opened from a talk stays (the
  keeper hands things across).
- **Riding a vehicle's deck:** the line starts at the street's hand height; the deck's own spots have their own rule.
- **Below the street:** the line is cast on that level's own grid (`statics.under`).
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
| `systems/dogs.js`, `fauna.js`, `roadside.js`, `milbases.js`, `casinos.js`, `rites.js` | one `reach.to` each | — |
| `data/storeys.js` (WEB_STOREYS.md) | — | `LEVEL.same` |
| `systems/underground.js` | — | `under.y0` for the level's height |
| `systems/zombies.js` (WEB_ZOMBIES.md) | a shut door now truly hides you from a search and a talk; the infected still smell through it | — |

## 7. Tuning knobs
| Knob | Default | Safe range | Affects |
|---|---|---|---|
| `REACH.hand` | 1.3 m | 1.05–1.6 | What you reach over. Under 1.05 a counter blocks trade; over 1.6 you reach over tall furniture, and at 2.0 over a door's head |
| `REACH.touch` | 0.8 m | 0–0.85 | The no-line zone. Past 0.85 a hand goes through a thin wall |
| `REACH.own` | 0.12 m | 0–0.2 | How loosely a thing's point sits in its own collider |
| `REACH.ownMax` | 3.4 m | 1–5 | The longest piece of furniture that can be a thing's own body |
| `REACH.wallTags` | wall, partition, fence, gate, rail, tower | must hold `wall` | Box tags that are never a thing's own body |

## 8. Acceptance criteria (selftest, `node tools/dl.mjs selftest only="reach:"`)
1. **Rows:** `validateReach` is clean; a touch of 1.4 and a hand of 0.6 are each caught.
2. **The rule on a bare grid:** a wall stops a hand and a word; a 1.0 m counter does not; a shelf's own body does not; the
   same shelf from behind its wall does; a floor between does (`why: floor`); 0.75 m passes.
3. **No loot through a wall:** at a real island building, 2.3 m or less from a container on the far side of its wall: E
   does not open it, `pack on=true` does not make it the other side, `findNear()` does not list it, and it is neither
   rolled nor changed. From a spot with a clear line the same container opens and is listed (the control).
4. **Nobody, no bed, no car through a wall:** a stranger 2.8 m or less away behind the wall gets no Talk prompt and no
   dialogue; a bed and a car there are refused. With a clear line each is offered.
5. **Doors:** every island door (up to 40) is reachable from 1.2 m in front of it on both sides.

Before / after: `docs/renders/web/reach/zed-wallreach-before.jpg` (the PACK screen opens the cantina's crate from the
street) and `zed-wallreach-after.jpg` (the same spot opens the ground).
