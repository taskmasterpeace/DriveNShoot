# WEB_DECKS_STANCE — walk on moving vehicles, prone, footing, the turret seat

Lane: DECKS-STANCE (WEB_DEPTH_PLAN.md §2 Wave 1). Branch `feat/web-decks-stance`. Builds on `WEB_WALK_VEHICLES.md`.
Code: `web/src/data/decks.js`, `web/src/systems/decks.js`, `web/src/data/stance.js`, `web/src/systems/stance.js`,
`web/src/systems/seats.js` (turret seat). Checks: `web/src/agent/decks-stance-selftest.js`.

## 1. Overview

Robert, 2026-10-28: *"you should be able to walk on moving vehicles. So let's say you get on a boat, you get on the back
of a pickup truck, you're inside of an RV... standing on the back of a pickup as it turns, you would fall off... if you
crouch, depend on some existing stat... if you go prone, you're not even visible to other people. But make sure we don't
have a collision where you're sticking out."* And: *"the passenger got to be able to shoot out the window if they want,
and it's going to be multiplayer."*

This lane adds:

- **More decks.** The airboat and the raider gunboat get open decks that rock and throw spray. The trundle (the bus) gets
  a real aisle between its benches. The van, the RV and the trundle get **walkable roofs**, climbed by a ladder.
- **Prone**, a third stance with its own collision body (a capsule of head, hips and feet), its own speed and aim arc,
  and its own spotting rule (D2), wired into the same watchers crouch already was.
- **Footing**, the D3 balance. Every throw-out and stagger line on a moving deck is multiplied by the rider's QUICKNESS
  (the sheet's agility attribute, ±30%) times the stance's brace (crouch ×1.6, prone ×3). The HUD prompt shows it.
- **The turret seat.** A passenger, the player or a crew member, can man the roof turret (the workshop's `top` mount,
  trigger group 3). They aim and fire it on their own while the driver drives. Passengers keep their window fire.

## 2. Player fantasy

You stand on the back of a pickup, rifle up, as your partner throws it round a corner. You feel the pull. The prompt
reads **FOOTING · SWAYING**, so you crouch, and it settles to **SURE FOOTING**. On the airboat's deck the hull slaps the
chop and spray comes over the bow. You climb the RV's ladder onto the roof to look over the brush, and you know a hard
turn up there will put you in the dirt. You lie flat in the swamp grass and a raider walks past at twenty metres without
seeing you. You ride shotgun in a truck with a gun on the roof, hold the right mouse button, and the turret swings where
you look while your driver keeps it on the road.

## 3. Detailed rules

### 3.1 Decks (data/decks.js `DECKS`)

| Deck | Vehicle | Kind | What's on it |
|---|---|---|---|
| `airboatDeck` | airboat (`deck`) | open, floor 0.67 m | the raised driver's chair (solid), a cooler (container). The fan cage closes the stern. `chop 0.55`, spray |
| `gunboatDeck` | gunboat (`deck`) | open aft deck, floor 0.7 m | the steel wheelhouse is its front wall (you take the wheel at its back door), fuel drums, a lockbox. Waist-high bulwarks (cover 0.8). `chop 0.4`, spray |
| `busAisle` | trundle (`deck`, `systems/travel.js`) | cabin, floor 0.65 m, ceil 2.25 | the kerb door up front, the driver's seat, four rows of benches each side of a 0.72 m aisle, luggage racks at the back. Its roof cuts away while you are inside |
| `vanRoof` | van (`roofDeck`) | open roof, 2.04 m | a ladder up the left flank by the back, the rack and its bags |
| `rvRoof` | RV (`roofDeck`) | open roof, 3.16 m | the existing rear ladder, the solar panel and vent (walkable) |
| `busRoof` | trundle (`roofDeck`) | open roof, 3.04 m | the existing rear ladder, the rack and its seven bags (solid) |

- A vehicle can have two decks: its `deck` and its `roofDeck`. A rider is on one of them (`c.onDeck.D`). Room is counted
  per deck.
- **Ladders** belong to the roof deck: `{ at: [x, z] }` is the foot of the ladder on the ground outside, and `top` is
  where you step off. E within 1 m of either end climbs. The vehicle must be slower than 2 m/s. The prompt reads
  "Climb the ladder onto the RV's roof" or "Climb down the ladder".
- The **roof cuts away** only while you are inside a cabin deck. It stays on while you stand on top of it.
- **Ceilings.** A cabin lower than you stand (`ceil` < stand height 1.8 m) makes you stoop. The pose crouches and your
  head never comes through the roof. The van (1.4 m) makes you stoop; the RV (2.1 m) and the trundle (2.25 m) don't. A
  stoop doesn't slow you down.
- **Boats.** On the water a boat deck adds a felt rocking to the turn: `chop × speed × (0.55 + 0.45 sin(2.6 t))`. Spray
  (pooled `fx` particles) comes off the bow while riders are aboard at more than 6 m/s.
- **Roofs** are worse to ride than a bed with sides. `throwMul 0.75–0.8` lowers every throw line, and being thrown off a
  roof hurts ×1.4.
- Getting up from a trundle bench (a seat row with `at`) puts you in the aisle beside it, not at the wheel.

### 3.2 Prone (data/stance.js `STANCES.prone`, `PRONE`; D2)

- **Toggle:** Alt, or VIEW+LT on the pad (the `prone` controls row). Space from prone stands you up instead of diving.
  Going down or getting up takes 0.35 s, with no shooting and no crawling in that time.
- **Refused:** in a seat, hanging on, in a cabin (D2), swimming, wading, mid-dive, knocked down, or vaulting. Walking into
  water stands you up.
- **The body** is a capsule of three circles along its own heading (`c.proneH`): the hips (r 0.26), the head 0.85 m ahead
  and the feet 0.85 m behind (r 0.26). It stands 0.45 m tall.
  - On the street, `stance.fitNow` pushes the hips until no circle is inside a box, and a turn that would put the head
    through a wall doesn't happen.
  - On a deck, `decks.fitProne` keeps all three circles on the floor and out of the furniture. If the floor is too short
    for the body (a pickup bed with its toolbox), the body turns in 15° steps up to 90° until it fits. If it fits no way,
    the knees draw up (`c.proneLen` shortens). Nothing is ever over a rail or inside a box.
- **Speed** is 0.8 m/s. A crawl never pushes a door open.
- **Aim:** the gun points within ±40° of the body. Outside that arc, the body crawls round toward the aim at 1.6 rad/s.
  Crawling, it turns toward where you move (feet first if you crawl backwards).
- **On a deck:**
  - The body's heading is kept in the vehicle's frame, so it turns with the vehicle.
  - Prone is never thrown off an open deck; only a crash or a hard landing staggers it.
  - A round from off the vehicle never reaches a prone rider in an open bed (`covered`). Up on a roof there is no rail,
    so this doesn't apply.
- **Spotting** (`stance.seenRange`), wired into `ai.scan`, `bases.spotRange`, `fauna.sense`, `deeds.ranges` (the
  witnesses), `grapevine.sightOf` and `greyborn.watch`:
  - In the open: the watcher's range × 0.25.
  - In grass, or behind something low: × 0.25 × (1 − 0.6 × concealment), and never past 12 m. "Something low" means a
    sight line at 0.35 m that a wall, crate or rail stops.
  - On an open deck, a watcher off the vehicle never sees a prone rider past the rail.
- **Concealment** (0..1) is the highest of:
  - the biome's grass (usmap legend letter: Florida swamp 0.8, wetland 0.85, flatwoods and prairie 0.7, scrub 0.55,
    desert 0.1);
  - THE BRUSH's painted `brush` and `forest` layers (`brushField.layerAt`);
  - a staged `c.concealOverride`.

  It is re-read at most every 0.25 s per body.
- **Crouch keeps each watcher's own number.** Each watcher already had its own crouch multiplier (ai 0.6, bases
  `crouchMul`, fauna 0.55, deeds 0.6, grapevine 0.75, greyborn 0.7), so the stance row's crouch `seen` is `null`.

### 3.3 Footing (D3; data/stance.js `FOOTING`)

- `footing = clamp(1 + (QUICKNESS − 5)/5 × 0.3, 0.7, 1.3) × brace`, where brace is stand 1, crouch 1.6, prone 3. Every
  throw and stagger line of `DECK_RULES.open` and `.cabin` is multiplied by `footing`, and by `throwMul` on a roof.
- QUICKNESS is the player's `g.deep.attrs.quickness`, or a crew member's `c.sheet.attrs.quickness`. Anyone else counts
  as 5.
- **HUD:** while you ride an open deck and the floor pulls more than 35% of your throw line (or you are crouched or
  prone), the prompt shows `FOOTING · SURE FOOTING | SWAYING | LOSING FOOTING | GOING OVER`, your stance, its ×footing,
  and the keys to brace harder. It is red past 80%.
- A follower on an open deck crouches when the vehicle goes fast, or when you crouch or go prone.

### 3.4 The turret seat (data/decks.js `TURRET_SEAT`; systems/seats.js)

- A vehicle with a roof turret (a workshop `top` mount) has one turret owner, `v.turretBy`, a character id.
- **A passenger takes it** by holding RMB (`fireTurret`) while it's free. It then fires group 3 at the passenger's own
  aim and slews to it, whatever the driver does. A crew passenger takes a free turret and engages the nearest hostile
  within 40 m with line of sight, 0.12–0.25 s between pulls, ±0.05 rad error. The mount's own rate and its ammo still
  cap every shot.
- **The driver** fires it from the wheel only while nobody mans it, which is how it worked before.
- **Your own crew** hands it to you when you take it.
- **Release:** leaving the seat, death, the vehicle wrecked, or the mount removed (`turretOwner` checks every call).
- **Passengers keep window fire:** LMB still shoots out of their window, and the follower-passenger branch in `ai.js`
  now runs. It used to be skipped for everyone in a seat.
- **Shard shape (law 5):**
  - **Owner:** `v.turretBy`. One claim at a time, first claim wins, released as above. The shard server arbitrates the
    claim like a seat claim.
  - **What's saved:** the claim rides the vehicle (`turretBy`). The mount's ammo and yaw are already the workshop's.
  - **What another player sees:** the mount's `yaw` (`vehicle.turret.yaw` in the agent view) and the rounds it fires.
    The owner's client aims and fires; other clients render the yaw and the shots.
  - **Not replicated yet:** this lane has no net transport. The fields above are what the replication layer has to
    carry.

## 4. Formulas, with an example

- **Felt pull** on a deck = |filtered floor acceleration| + `chop × speed × (0.55 + 0.45 sin)` on the water.
- **Thrown out** (open deck, not prone) when the felt pull > `throwA (40) × footing × throwMul` and speed > 12 m/s, or
  when a crash > `throwImpact (9) × …`, or when a landing > `throwLand (8.5) × …`.
- **Example:** a pickup bed, a 52 m/s² staged pull (40 × 1.3).
  - An ordinary standing rider (QUICKNESS 5, footing 1): line 40 → thrown.
  - Crouched (footing 1.6): line 64 → stays aboard.
  - Prone (footing 3, and never thrown anyway) → stays aboard.
  - At a 46 m/s² pull: a QUICKNESS 10 rider (footing 1.3, line 52) keeps their feet, and a QUICKNESS 5 rider (line 40)
    goes over.
- **Spotting example:** a raider (scan range 34 m) and a prone player in swamp grass (concealment 0.8).
  - Range = min(34 × 0.25 × (1 − 0.6 × 0.8), 12) = 4.4 m. At 20 m: unseen. At 3 m: seen.
  - Standing at 20 m: seen.
  - In the open desert (0.1), prone: 8.5 m.

## 5. Edge cases

| Case | What happens |
|---|---|
| Going prone in a van, RV or the trundle's aisle | Refused: "no room to lie down in here" |
| Mounted prone into a cabin by a command | Stood up |
| Prone body across a pickup bed (2.2 m of body, 2.04 m of bed) | It turns or curls to fit. The selftest lies it across on purpose |
| A prone rider aiming behind them | The body crawls round. In a tight bed the fit keeps it on the floor (it may turn back) |
| Ladder while moving | Refused over 2 m/s, with the prompt saying so |
| Climbing down onto a road | Down at the ladder's foot, pushed out of any box |
| Roof rider when the vehicle is removed or wrecked | Down where they stand (`dismount 'gone' / 'wreck'`) |
| The turret owner dies or leaves | `turretBy` released (`turretSeat` event `on:false`), and the driver can fire it again |
| Player takes the turret from their own crew gunner | The crew passenger yields and goes back to the window |
| Save/load | Riders keep their deck (`deck` key) and prone flag. An old save (no `deck` key) puts riders on the main deck |
| A boat beached or on land | No chop, no spray |
| A swimmer pressing Alt | Refused (in deep water) |

## 6. Dependencies, both ways

- **Reads:**
  - `systems/vehicles.js` rows (`deck`, `roofDeck`) and `systems/travel.js` (the bus row);
  - `systems/workshop.js` `fireMount` (group 3, `top`);
  - `systems/stats.js` `g.deep.attrs` (QUICKNESS);
  - `world/brush.js` `layerAt` (added, no allocation) and `streamer.W.biomeAt` (concealment);
  - `engine/collision.js` `resolveBody` and `lineOfSight` at height (the capsule, cover).
- **Read by:**
  - `ai.js`, `bases.js`, `fauna.js`, `deeds.js`, `grapevine.js`, `greyborn.js` (spotting);
  - `combat.js` `covered` / `muzzleClear`, called through decks, with no edit to combat.js;
  - `characters.js` (the prone and stoop poses);
  - `main.js` (input, HUD).
- **Other lanes:**
  - BALLISTICS owns `combat.js`. A prone target's 0.45 m height is in `STANCES.prone.body.h` for its projectile/height
    hit test to read. Not wired here.
  - LSW-BODIES (Wave 3) shares the pose code: prone lives in `characters.js` `pose()`, behind the `prone` flag. Shipped
    (`WEB_LSW_BODIES.md`): the 24 nearest people's LSW bodies are driven from these same prone, crouch and deck joints.

## 7. Tuning knobs (safe ranges)

| Knob | Where | Default | Safe range |
|---|---|---|---|
| `STANCES.prone.seen` | data/stance.js | 0.25 | 0.1–0.5 |
| `PRONE.hiddenPast` | data/stance.js | 12 m | 6–25 |
| `PRONE.grassCut` | data/stance.js | 0.6 | 0–0.9 |
| `PRONE.concealAt` | data/stance.js | 0.45 | 0.3–0.7 |
| `PRONE.aimArc` | data/stance.js | 40° | 25–70 |
| `PRONE.turnRate` | data/stance.js | 1.6 rad/s | 0.8–3 |
| `STANCES.*.brace` | data/stance.js | 1 / 1.6 / 3 | 1–5 (prone > crouch) |
| `FOOTING.spread` | data/stance.js | 0.3 | 0–0.5 |
| `CONCEAL.biome.*` | data/stance.js | per letter | 0–1 |
| deck `chop` | data/decks.js | 0.4–0.55 | 0–1 (> 1.2 staggers standing riders at cruise) |
| deck `throwMul` | data/decks.js | roofs 0.75–0.8 | 0.5–1 |
| `DECK_RULES.ladderSafe` | data/decks.js | 2 m/s | 0.5–4 |
| `TURRET_SEAT.crewRange` / `crewCool` / `crewSpread` | data/decks.js | 40 / 0.12–0.25 / 0.05 | 20–60 / 0.08–0.6 / 0–0.15 |

`validateDecks()` and `validateStance()` guard the shapes. The `posture` command returns both validators' complaints.

## 8. Acceptance criteria (the selftest checks, `decks-stance:`)

1. **The rows are valid.** Every walkable rig carries its decks, the roofs have ladders, and the D3 braces are 1.6 and 3.
2. **Boat deck through a turn.** Crouched on the airboat's deck, the boat goes to speed and through more than a half
   turn on the lake. You are never off the floor rectangle, always perched above the water, the chop is felt, and the
   footing line appeared on the HUD prompt.
3. **Trundle aisle walk.** On held keys you walk in the kerb door and down the aisle to the luggage. The roof cuts away,
   you are never inside a bench, and you don't stoop.
4. **Stoop.** In a van you stoop (its ceiling is below standing height); in the RV you don't.
5. **Roof climb.** For both the RV and the trundle: E at the ladder's foot puts you on the roof deck (height > 2.9 m, roof
   still on), W walks it, and E at the top puts you back on the ground.
6. **Prone hidden at 20 m in grass.** A raider 20 m off never targets a prone body in grass (concealment 0.8) in 3 s, and
   its range is < 20 m. Standing there, it targets you. Prone at 3 m, it still targets you.
7. **The prone capsule never penetrates a rail.** You lie prone across a pickup bed through a driven turn (> 6 m/s, more
   than 1 rad) while the aim moves round. The worst overhang of any capsule circle off the floor or into the toolbox
   stays < 1 cm and you are never thrown. On the street, crawling and aiming round against a wall for 6 s, no capsule
   circle is ever inside the wall.
8. **Crouch vs stand throw-out with the stat.** One staged pull through the real `decks.feel`: it throws a standing
   ordinary rider, not a crouched one and not a prone one (at 4× the line). At a smaller pull, QUICKNESS 10 keeps their
   feet and QUICKNESS 5 doesn't.
9. **Passenger turret while the driver steers.** As a passenger holding RMB, you own the turret and it fires (ammo
   drops) at your aim (yaw within 0.3 rad) while your driver turns more than 0.4 rad. Then, with you at the wheel, a crew
   passenger takes the free turret and fires it at a raider.

Screenshots from the game camera: `docs/renders/web/decks-stance/`.


**Used by WEB_WATER_LIFE (2026-10-28):** a boat's deck riders also feel the swell (`v.waveFelt`, world/waves.js ride) added to the felt force, and a waterbike/airboat back in off a crest (`v.waveLand`) counts as a landing. New deck rows: `raftDeck`, `ferryDeck` (the cable ferry, systems/waterplace.js).

**Used by WEB_SEMIS (2026-10-29):** the decks law extended to vehicles - a car in a trailer's hold keeps its pose in the trailer's frame (systems/semis.js). Hooks here: a door row may carry `needs` (open only while that vehicle flag is set: a trailer's `rampDown`), and `resolve`/`settle` push riders out of `v.cargoBoxes` (the cars in a hold).
