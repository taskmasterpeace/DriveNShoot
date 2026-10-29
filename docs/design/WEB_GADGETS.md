# WEB GADGETS — traps you carry, drones, town security, door verbs

**Date:** 2026-10-27 · **Lane:** gadgets (`feat/web-gadgets`, harness :3406) · **Status:** built, sim-proven (12 named selftest checks)
**Rows:** `web/src/data/gadgets.js` · **Systems:** `systems/gadgets.js` (owns `g.drones` = `systems/drones.js`, `g.security` = `systems/security.js`)
**Commands:** `gadget`, `drone`, `security`, `barricade` (`src/agent/gadgets-api.js`) · **Scenarios:** `gadget-range`, `checkpoint-run`

Robert (2026-10-27): *"Gadgets, like drones, the chains that they throw in the street... security people because we got police cars... they should look a little bit run down. Barricade doors, lock doors, all that. Throw stuff. Landmines, spider mines, like all of that. We should go all out."* And: *"Do not get caught up in the visuals."*

## 1. Overview

Three things that were missing between the throwables (7 grenades) and the Greyborn's traps (5 kinds, owned by settlements):

1. **Gadgets you carry and set.** 14 rows: a road chain and a spike strip you throw across a lane, a buried car mine (the same `car_mine` item the workshop's mine dropper loads), a fan mine on a tripwire, a crawler mine that walks to the nearest enemy, a noise box and a bottle (lures), a signal flare (light + lure), smoke and choke gas, a remote charge (` detonates), a breach charge (on a door), a car alarm (on a car) and tripwire bells (an alert).
2. **Drones.** A scout drone and a drop drone launched from the pack and flown with WASD while your body stands where you left it.
3. **Town security — THE PAPER LADDER** (fan-service bible §3.2). A station, a run-down patrol car on a loop, officers on the beat, and answers to the wanted stars: town bulls who offer the cuffs, a county posse with a roadblock, skip tracers who ram and follow.

Plus the door verbs the interiors left open: barricade (wedge, planks, furniture), lock and unlock with keys, breach.

## 2. Player fantasy

GTA2's roadblocks and the Autoduel tail kit, on foot. You are the one who chains the road before the convoy comes, buries a mine in the only ford, strings bells across the back door of the house you sleep in, and sends a cheap camera up to see what is waiting round the corner. The town is not a lawless map: it has bulls in tired cars with primer on the hood and a dead lightbar, and when you steal in front of one, a car comes. You can stand still with your hands empty and pay, or run their roadblock and lose your tyres to their own chain.

EM3 checks: **cost** (every gadget is weight, scrip or a recipe; drones have batteries, signal and hp; a barricade costs planks, time and noise), **interaction** (throw, place, attach, take back, detonate, fly, surrender, run), **proof** (§8), **IP** (our names: *crawler mine*, *fan mine*, *bull car*; no franchise unit or brand names; `ip-lint` 0 deny).

## 3. Detailed rules

### 3.1 A gadget's life
`flying` (thrown: the grenade arc, `throwables.launch`) → `arming` (`arm` s: nothing you just set takes your own foot) → `armed` → it fires → `spent`, or `burning` (lures, flares, gas, alarms keep going), or `tripped` (bells re-arm after `rearm` s). A chain, a strip, bells, or anything still arming can be taken back (hold **E** over it, or `gadget pickup=`).

| Trigger | What sets it off |
|---|---|
| `tyre` | a wheel crossing its line (chain: 2 tyres a car, strip: all 4). It stays armed until taken back. |
| `pressure` | a foot (not mid-leap) or a wheel inside `r` |
| `wire` | a body or a car crossing the wire (fan mine: 1.1 m in front of it, across its facing) |
| `hunt` | the crawler walks (5.2 m/s, `statics.resolveCircle` round walls) to the nearest enemy of its owner with a line of sight inside 22 m and blows inside 0.9 m; after 45 s with nothing, it goes where it sits |
| `timer` / `impact` / `remote` | the fuse / landing / **`** (backquote; `gadget detonate=true`) |
| `touch` | the car alarm: anyone but the owner at the car, a stranger at the wheel, or the car hit |

**Friendly fire is on** (`hurts: 'all'`): a mine doesn't know whose foot it is. Lures and flares hurt nobody.

### 3.2 Effects (through the systems that own them)
Blasts go through `throwables.explode` (people with line of sight, glass, doors, the dead's ears, cars), then the buried-charge extra: `car` damage on every car in reach, tyres within half the radius popped, the car thrown up. Fan mines: a 60° cone, line of sight, cars' windows. Smoke into `throwables.smokes` (it blocks sight like any smoke). Gas: 4 hp/s, `blind` (they shoot wide), the infected unaffected. Lures: `zombies.onNoise` every second and the herd walked to it. Flares: the **fx pool's fixed lights** (`fx.light`, re-lit every 0.2 s; the light count never changes) plus an additive ground glow. Breach: `interiors.unlock(..., 'breach')` and the door flung.

### 3.3 How the AI notices them
- **Drivers** (`gadgets.steer`, called last in `vehicles.aiDrive` and by the bulls' own driving): a chain or a strip ahead inside `notice.spot` (a third of it at night, more with headlights) and in the way: steer round the nearer end if the lateral room needed is under 18% of the distance, else stand on the brakes. Event `gadgetAvoided`.
- **People on foot**: inside `spot` (less at night) with a line of sight, a chance per second; on a sighting their **whole faction** knows it (`p.seen` bitmask) and steps around it from then on. Event `gadgetSpotted`. The infected never notice anything.

### 3.4 Drones
Launch from the pack (the item leaves it; it lands back in it). **WASD** fly (`d.ix/iz`, smoothed velocity), **Shift** boost (2× drain), **E** home, **`** drop (the drop drone's 3 pipe charges, 0.6 s fall). Battery by the second; signal weak past 80% of range (a wobble, the HUD says so), **lost past range: it flies itself home** and lands. Low battery (12%) does the same; flat, it falls. Every 0.5 s it **marks** enemies under it for 8 s (minimap rings). It buzzes (`onNoise` 22 m every 2 s: THE PULL). Armed hostiles who see it inside 35 m shoot at it (hit odds fall with range); 0 hp, it falls and breaks to a piece of scrap on the ground. Your body is frozen where you stood, still shootable.

**Theirs** (`FOE_DRONES`, `drones.foes`, at most 4 up): a **spotter** goes up off the skip tracers' first car when that rung is sent; a **drop drone** is what a raider flies (`drone action=foe foe=dropper`). Each circles what it watches (`orbit` m, at `alt`): you while it sees you (inside `sight`, not standing in smoke), else where it last saw you. A spotter, every `callEvery` s while it sees you, gives its own side's armed and idle people within `call` m of you you as their target (`foeDroneCalled`). A drop drone lets a charge go every `bombEvery` s once within `orbit + 2` m of its mark (`foeDroneBomb`, `on: you|flare`). After `life` s (or with its bombs gone) it turns away and is gone at 120 m. **Counters** (`ANTI_DRONE`): a round whose line passes within `shotR` of it under it hits on `shotHit` of the time (`combat.hitscan` hands every round's line to `drones.shotThrough`; its own side's rounds pass); a **lit signal flare** within `flareR` pulls it off you, so it circles and bombs the flare (`foeDroneDecoyed`); **smoke** you stand in hides you. Shot down it falls and leaves `scrap` on the ground. Red diamonds on the minimap.

**Traders:** Kenji keeps the hardware on his shelves (chain, strip, bells, noise maker, flares, smoke, car alarm, planks, wedges, a scout drone), Ike the bangs (car mines, a fan mine, remote charges, a breach frame); each buys back what he sells (`data/trade.js` `deals`/`keeps`). Under the loot law the keeps are the opening stock; after that only deliveries fill the shelves.

**Saves:** `snapshot().gadgets` keeps every gadget that is arming, armed or tripped (one in the air or burning is a moment, not a record), its owner by id, its door or car by id, how far it had armed, a timer's fuse, who had spotted it; and every barricade by door id. The door's lock strength is the interiors' own save, loaded first; a barricade whose door is no longer locked in the save is dropped. A drone in the air is not saved.

### 3.5 Town security (THE PAPER LADDER)
`SECURITY` rows (one per town: Rust Haven today): station (`security_station` building from the cities lane when present, else a stub placement — a signpost, a lamp, painted garage lines), patrol loop, beat size, fine and jail rates, the car row. Officers are the town's wardens (faction `warden`), so hostility, stars and standing are the existing rules.
- **Ambient:** within 200 m of the station a bull car drives the loop (it slows for people, avoids chains) and two officers walk the beat; past 340 m they go home.
- **The ladder** (new stars from the existing witness path, `deeds.record` → `raiseWanted`):

| Stars | Tier | What comes |
|---|---|---|
| 1-2 | **Town bulls** | one car from the station; they get out and offer the cuffs |
| 3-4 | **County posse** | two cars; a **roadblock** 80 m ahead of the car you drive: two bull cars side on, a road chain on your side, two men behind |
| 5 | **Skip tracers** | a hunter car (`v.ai = 'raider'`: rams, shoots), leash 2 km: it follows you out |

- **Arrest:** while the offer stands, every warden near you holds fire. Holster (hold **H**), stand still within 5.5 m for 1.5 s: a **fine** of `fine × stars` if you can pay, else the **cell** (`jail × stars` game hours pass) and you walk out at the station. Stars to 0. Hurt one of them, run past 40 m, or take over 30 s: a **shootout** (they open up; at least 2 stars).

### 3.6 Doors
`BARRICADES`: wedge (+25 lock hp, +1 kick, 0.8 s, quiet), planks (+300, +3, 4.5 s, loud hammering), furniture (+420, +4, 6 s). It locks the door (`interiors.setLocked`) and adds to what a boot, a shoulder or the infected's fists must take off (`interiors.bang`: 6 hp a blow). When the lock gives, the barricade is gone (`barricadeBroken`, with how long it held). **Keys:** the bull's key ring opens and locks any town door quietly; a door key only its own. AI climbing through broken windows was already in `interiors.windowTouch` (any mover that pushes into a shattered window vaults it); not forked.

## 4. Formulas
Variables: `d` distance (m) from the gadget to the thing, `r` the effect radius (m), `f` falloff 0..1, `night` 0..1
(`g.sky.night`), `along`/`lateral` metres ahead of / beside a car's nose, `range`/`weak` a drone row's, `stars` 0..5.

| Formula | Range | Example |
|---|---|---|
| Chain/strip hit: wheel within `wid/2 + 0.18` of the segment (half length `len/2`); wheel at `(±(W/2 − 0.12), ±(L/2 − 0.92))` in the car frame | band 0.36-0.43 m | LAWMAN (W 2.0, L 4.6) front-left wheel at (0.88, 1.38); a chain (wid 0.5) hits when that wheel is within 0.43 m of its line |
| Blast on a person: `dmg·f² + 10·f`, `f = 1 − d/r` (the grenade's rule) | 0..dmg+10 | crawler (r 4, dmg 240) blowing 0.9 m off: f 0.78 → 146 + 8 = 154 (a raider has 90) |
| Blast on a car: `car · max(0, 1 − max(0, d − W/2)/r)` | 0..car | pressure mine (car 420, r 5.5) under a LAWMAN (d 1.0, W 2): f 1 → 420 vs hp 180: it burns |
| Fan mine: `dmg · (1 − 0.6·d/r)` inside `|angle| < deg/2`, line of sight | 0.4·dmg..dmg | 190 at d 1.5 of r 15: 179 |
| Driver sight `spot · (night > 0.5 ? (lights ? 0.6 : 0.3) : 1)`; swerve if `|room| < max(1.5, 0.18·along)`, else brake | 0..spot | strip (spot 16) at noon, 16 m ahead, room 3.9 m > 2.9 → brake |
| Foot sighting per 0.5 s tick: `P = 0.7 · (1 − d/spot′)`, `spot′ = spot · (1 − 0.65·night)` | 0..0.7 | pressure mine (spot 3.2) at noon, d 1.6: P 0.35 a tick |
| Drone signal `1 − max(0, d − range·weak) / (range·(1 − weak))` | 0..1 | scout (160, 0.8) at 144 m: 0.5 |
| Drone hit odds a shot `0.55 − r/90` | 0.16..0.55 | a raider 20 m off: 0.33, 8 hp (shotgun 14); a scout (30 hp) lasts ~4 hits |
| Barricade hold vs `n` infected: `t ≈ (lockHp + hp) / (n · 6 / 1.1)` (each blow 6 hp a 1.1 s) | s | wood (70) + planks (300) vs 4 beating: ≈ 17 s if all four reach it; measured ≥ 25 s (they crowd) vs 7 s bare |
| Fine `fine · max(1, stars)`; jail `jail · max(1, stars)` game hours | | Rust Haven (40, 6) at 2 stars: $80, or 12 hours |

## 5. Edge cases
- A drone still up holds your car parked (you can't drive and fly). Scenarios clear it first.
- A gadget on a car that dies goes with it; a breach charge set on a door that is already open just flings it.
- Bells re-arm; chains and strips never spend (one strip can take a whole convoy's tyres).
- The bulls never arrest at 3+ stars; the skip tracers never offer.
- The battery turns security's `auto` and `ambient` off (like the director and the fauna), so unrelated checks are not visited by patrol cars; its own checks switch them on.
- Placed gadgets are not in the save yet (see §7).

## 6. Dependencies (the hooks, all one or two lines)
| File | Hook |
|---|---|
| `main.js` | construct `this.gadgets` (after `fauna`'s neighbours), `gadgets.update(simDt)` after `throwables.update`, the drone pilot early-return in `updatePlayer` (body frozen, car held parked), the `droneCam` follow in `updateCamera` (camera lane: one line) |
| `systems/vehicles.js` | `bullcar` row; `g.gadgets?.steer(v, dt)` last in `aiDrive` |
| `systems/vehiclebodies.js` | `s.look === 'rundown'`: primer hood, swapped door panels, a rust trunk, a busted lightbar, a welded ram plate |
| `systems/inventory.js` | `act` routes `gadget`, `drone`, `barricade`, `wedge`, `keys` to `g.gadgets.useItem` |
| `data/items.js` | folds `GADGETS`, `DRONES` (`drone_<kind>`), `DOOR_KIT` into `ITEMS` |
| `data/controls.js` | the `detonate` row (` backquote; pad VIEW+RT). The workshop's row holds U |
| `ui/hud.js` | `g.gadgets?.drawMinimap(...)` before it draws you |
| `agent/api.js` | import, spread the commands, the checks before the perf gate, security off for the battery; `snapshot` writes `gadgets: g.gadgets?.save()`, `restore` calls `g.gadgets?.load(...)` after the interiors |
| `systems/combat.js` | `hitscan` hands every round's line to `g.drones?.shotThrough(...)` first (their drones can be shot) |
| `data/trade.js` | Kenji and Ike's `deals` and `keeps` carry the gadgets |
| `main.js` (kill) | a dead officer's body: `this.security?.onDeath(c, body)` puts the key ring in it |

## 7. Tuning knobs
| Knob (data/gadgets.js) | Default | Safe range | Affects |
|---|---|---|---|
| `road_chain.len` / `spike_strip.len` | 7 / 4.6 m | 3-9 | how much of a road one covers; the strip is short enough to drive round |
| `effect.tyres` (chain / strip) | 2 / 4 | 1-4 | how crippled a car is after one pass |
| `notice.spot` (strip / chain / mine) | 16 / 24 / 3.2 m | 5-40 / 0-8 | how often AI drivers dodge, how often people see a mine |
| `car_mine.effect.blast.car` | 420 | 200-600 | whether one mine kills a car (rigs have more hp) |
| `crawler_mine.hunt / speed / life` | 22 m / 5.2 m/s / 45 s | 10-35 / 3-8 / 20-90 | reach and how hard it is to outrun |
| `DRONES.scout.range / battery` | 160 m / 150 s | 80-300 / 60-300 | how far you can scout, how long |
| `DRONES.*.weak` | 0.8 | 0.6-0.95 | warning margin before the signal goes |
| `BARRICADES.planks.hp` | 300 | 150-500 | how long a barred door holds a herd |
| `SECURITY_TIERS.*.stars` | 1 / 3 / 5 | ladder order only | which rung answers |
| `SECURITY.rust_haven.fine / jail` | 40 / 6 h | 10-100 / 2-12 | the price of giving up |

| `FOE_DRONES.spotter.call / callEvery` | 80 m / 1.5 s | 40-120 / 1-4 | how fast a tracers' spotter brings its side down on you |
| `FOE_DRONES.dropper.bombs / bombEvery` | 2 / 4 s | 1-4 / 2-8 | how much a drop drone can hurt before it turns home |
| `ANTI_DRONE.shotHit / shotR` | 0.5 / 1.0 m | 0.2-0.8 / 0.6-1.6 | how many rounds one of theirs takes (spotter 50 hp: about 3 revolver hits) |
| `ANTI_DRONE.flareR` | 32 m | 15-60 | how close a flare must burn to pull one off you |

Not done: the cities lane's `security_station` building is still not in the tree, so the stub stands at (-44, 40); a drone in the air is not saved; no raider camp sends a drop drone up on its own yet (`drone action=foe` does).

## 8. Acceptance criteria (named selftest checks, `src/agent/gadgets-api.js`)
| Check | Proves |
|---|---|
| `gadgets: every row is whole...` | every row has verb, trigger, effect, hurts, a tell, weight, a source; is an item; recipes name real items |
| `gadgets: a road chain thrown across the road pops the tyres of a car driven over it` | thrown from the roadside, the player drives a LAWMAN over it: ≥ 2 flats |
| `gadgets: an AI driver who sees a strip ... brakes or steers round it` | `gadgetAvoided` fires and its tyres stay whole |
| `gadgets: a crawler mine ... kills it inside 8 s` | the crawler finds, walks to and kills a raider 15 m off |
| `gadgets: a pressure mine buried in the road kills the car` | a car driven over it burns |
| `gadgets: a fan mine fires down its own facing...` | the one in front dies, the one behind lives |
| `gadgets: a remote charge waits for the detonate... flare ... pooled lights` | detonate-key-only detonation; the flare lights one of fx's pooled lights; scene light count unchanged |
| `drones: a scout drone flown past its range loses the signal...` | piloting moves the camera target, it marks a raider, signal lost before range + 20 m, it comes home and is back in the pack |
| `security: a theft a town bull saw ... brings the run-down patrol car` | a witnessed `steal` deed raises a star and a `bullcar` drives from the station to within 22 m |
| `security: hands up beside the bulls ... a fine` | holstered and still: fined, 0 stars |
| `security: a roadblock (posse) ...` | two bull cars and a tyre chain |
| `doors: planks across a locked door hold four of the infected ... 25 s` | the barred door holds 25 s; the same kind of door bare gives first |
| `gadgets: a save carries what is set ...` | a chain, a car mine and a remote charge in `snapshot().gadgets` come back where they lay, armed, owned by you (the charge still answers your detonate), and the barred door is barred again |
| `trade: Kenji's shelves keep the hardware gadgets ...` | Kenji keeps and buys chain, strip, bells, flares, a scout drone; Ike car mines, fan mine, remote and breach charges; every kept id is an item |
| `security: a town bull shot dead leaves the town's key ring ...` | the bull's body box holds 1 key ring; a skip tracer's holds none |
| `drones: theirs - a lit signal flare pulls a raider drop drone off you ...` | a drop drone 26 m off is decoyed by a flare 16 m away and bombs it, you unhurt; a spotter makes a held raider 60 m away target you; revolver rounds fired at it bring it down |

Scenarios: `gadget-range` (every gadget on one stretch, each with a target), `checkpoint-run` (three stars at the wheel, the posse's roadblock ahead). Renders: `docs/renders/web/gadgets/`.
