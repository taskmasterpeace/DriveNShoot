# PLAYTEST FIX SPEC — 2026-07-09

**Source:** Robert's live playtest, 2026-07-09 (drove the corridor, used the drone, opened chests, got hit by traffic → crash).
**What this is:** every issue from that session, grounded in the actual code (root cause + `file:line`), prioritized, with a fix direction and effort tag for each. This is the fix list — not a re-transcription. Where the code disagrees with the complaint, that's noted honestly.

**How to read the tags:**
- **Severity:** P0 crash/blocker · P1 core verb broken · P2 missing surfacing/QoL · P3 feature/big lift
- **Effort:** ⚡ quick (single session) · 🔧 medium · 🏗 deep/multi-session
- Every fix that touches a system ships with a **sim** per house rules.

---

## ⭐ KEEP THESE (things you liked — don't regress)
- **The road network on the MAP view** — "I love the roads on the map." That's the `road_graph.gd` planning graph (971 junctions, fully connected). Untouched by any road fix below.
- **The drone in flight** — "This is really fucking good." The pilot/split-view is a keeper; we only fix how you *get* into it and how you get it *back*.

---

## MASTER TABLE (priority order)

| # | Item | Sev | Effort | One-line root cause |
|---|------|-----|--------|---------------------|
| 1 | Car-hit crash | **P0** | ⚡ | Traffic car promotes to real car *inside* the physics collision callback → tree-mutation mid-flush faults |
| 2 | Handbrake (SPACE) won't stop the car | P1 | ⚡ | Brake force never cancels the gas; nets ~1 m/s²; only rear-grip drop shows, and only in turns |
| 3 | Jump-out-of-car flings you too far | P1 | ⚡ | Exit places you 2.3 m off the car's **center** + drops you in from +0.3 y |
| 4 | Every chest = same loot, no weapons | P1 | 🔧 | World chests use hardcoded `{scrap, 9mm ammo, bandage}` dicts; never touch loot tables; guns are locked in your home only |
| 5 | Buildings unlabeled ("don't know what this is") | P1 | 🔧 | Buildings DO have name signs — the reader only ever scans 3 hardcoded safehouse signs, so streamed signs never turn on |
| 6 | Drone needs two "use" presses | P1 | ⚡ | 1st press deploys an autonomous PATROL bird (drifts off-screen = "nothing"); 2nd press (the remote) is what pilots it |
| 7 | No drone recall / fly-back | P2 | 🔧 | No recall command exists at all; only "land in place" on E while piloting |
| 8 | Signs unreadable + no mouse-hover | P2 | 🔧 | Exit signs never register with the reader; no hover/tooltip exists on any world object |
| 9 | Spectacles missing | P2 | 🔧 | Betting + race-board engine is built but placed **nowhere** in the playable world |
| 10 | F10 dev panel stale | P2 | 🔧 | Panel is frozen at the ~2026-07-04 era; missing ~15 newer systems |
| 11 | Teleport: pick city, nothing happens | P2 | ⚡ | GO button IS wired — you drop onto unstreamed terrain / list built once at boot |
| 12 | Spawn is 700 m from the Meridian testbed | P2 | ⚡ | The 23 test structures ARE grouped tight; you just spawn up the highway from them |
| 13 | Compass | P2 | 🔧 | None exists; only a single waypoint arrow |
| 14 | Radar/minimap ("radiant") | P2 | 🔧 | No minimap exists; the PiP module has a hook reserved for it |
| 15 | Remove binoculars | P3 | ⚡ | Always-on hold that hijacks the mouse/aim; kill the bind |
| 16 | Roads disconnect when driving | P3 | 🏗 | 61 grade-separated crossings get NO physical geometry (the "M2" deck pass was never built) |
| 17 | Rideable train | P3 | 🏗 | There is no train — what you saw is dirt-road twin ruts read from top-down |
| 18 | Car dashboard UI (speedo/fuel) | P3 | 🔧 | Your lane — spec'd below so the HUD hooks are ready for you |

---

## P0 — CRASH (fix first)

### 1. Getting hit by a traffic car crashes the game ⚡
**You said:** "I got hit by a car, and then the game crashed."
**What's really happening:** Bumping an ambient traffic car "promotes" it into a real drivable car. That promotion is called **synchronously from the collision callback** (`Area3D.body_entered`), i.e. the exact instant of the hit — which is *during Godot's physics flush*. `promote()` then does `main.add_child(car)` (registering a VehicleBody3D + wheels into the physics space) mid-flush, which Godot forbids ("Can't change this state while flushing queries"). It's compounded by the new car spawning **overlapping your car** at the contact point.
**Why no sim caught it:** `traffic_sim` only ever promotes via the `take_damage()` door (bullets), which runs *outside* the flush. The bumper/`body_entered` path is never exercised headlessly. Classic "green director-sim ≠ walked player path."
**Refs:** `game/proto3d/traffic.gd:509-511` (sync promote in callback), `:564-565` (add_child mid-flush + overlap spawn), `:100-102` (the safe door sims use).
**Fix:** Defer the promotion out of the signal — `call_deferred("promote", ag, 0.0)` (or a pending-promotions queue drained at the top of `_tick`), and nudge the spawned car off the contact normal + match velocity so it doesn't spawn inside you.
**Sim:** new `traffic_bump_sim` that drives a real physical contact (not `take_damage`) so this path is covered going forward.

---

## P1 — BROKEN CORE VERBS

### 2. Handbrake (SPACE) doesn't stop you ⚡
**You said:** "hit space bar by itself, it doesn't stop… feels like it does something while turning, but the handbrake is not handbraking."
**Root cause:** The handbrake applies **no wheel brake**. It (a) drops rear grip 5.0→2.4 and (b) adds a weak central decel = 8 m/s² — but it **never zeroes `engine_force`**. Cruising = gas held (~7 m/s² of push on the scavenger), so net deceleration ≈ 1 m/s². And the rear-grip drop is only *visible* under lateral load — hence "only does something while turning." The export even carries a stale playtest comment: *"didn't brake unless you turned."*
**Refs:** `game/proto3d/car_3d.gd:1534-1542` (decel force), `:1480` (rear-grip only), `:1517-1520` (engine_force never zeroed), `:1379` (input), `:96` (default). Bind: `input_bindings.json:13` `jump`=SPACE.
**Fix:** In the `if input_handbrake:` block set `engine_force = 0.0` (ignore throttle) and apply a real rear-axle `brake`; bump `handbrake_decel` to ~14–18. Deep version: lock rear wheels, keep fronts steering, so both the straight stop AND the drift read right.
**Sim:** extend the driving sim — hold handbrake at speed on a straight, assert velocity → ~0 within N frames.

### 3. Jumping out of the car throws you too far ⚡
**You said:** "when you jump out of the car, it goes way too far."
**Root cause:** Exit teleports you to `car_center − side × 2.3 m` and adds `y += 0.3`. A car flank is ~1 m from center, so you land ~1 m clear of the door *and* drop in from above — reads as being flung. It's a placement offset, not an impulse (your velocity is zeroed same frame); the number is just too big.
**Refs:** `game/proto3d/proto3d.gd:4465` (offset ×2.3), `:4466` (y+0.3), `:4468` (velocity zeroed).
**Fix:** Shrink to `chassis.x*0.5 + 0.6` (~1.3–1.6 m) and ground-snap Y with a short downward ray instead of +0.3 (also fixes exiting on slopes).

### 4. Every chest has the same loot, and no weapons 🔧
**You said:** "Every chest I open got the same shit… you didn't leave any weapons anywhere." (You're getting 9mm *ammo* but nothing to fire it.)
**Root cause — two real problems:**
1. **The chests you find in the world bypass the loot-table system entirely.** They're built from hardcoded inline dicts: ambient cache = `{scrap 1-3, 9mm 4-10, bandage 0-1}` + one biome-flavor item; ruin stash = `{scrap 2-5, 9mm 3-8}`; town cache = `{scrap 3-6, bandage 1, 9mm 6-14}`. Same spine every time. They never call `roll_loot()` or the layered resolver, so biome/type variety is skipped.
2. **The weapons exist but are unreachable.** 30+ weapon items are defined (`pistol, shotgun, machete, axe, bat, wrench…`), and there ARE tables containing them — but `cache_rare` (axe/bat/medkit) is a **dead table referenced nowhere**, and `gun_safe`/`police_locker`/`desk` are furniture that only spawns inside your **home safehouse**, behind a `locked + Scavenging 2` gate. So field chests can never yield a gun.
**Refs:** `world_stream.gd:512-527 / :1117 / :1137` (the hardcoded dicts), `container.gd:109` (`roll_loot`, unused by world chests), `container.gd:14-57` (all 30+ weapons defined), `loot_resolver.gd:85`, `game/data/loot_tables.json` (`cache_rare` dead; weapon furniture locked), `furniture.gd:73-74` (skill gate).
**Fix:**
- Route world chests through `ProtoContainer.roll_loot(<table>, rng)` so they inherit variety + can carry weapons.
- Revive `cache_rare`, add sidearms (`pistol/wrench/machete`), and give ambient caches a small chance to upgrade to it.
- Pick the table by biome/archetype (farmland vs urban ruin vs roadside vs police) — the data already supports it, the dispatch is missing.
- Seed at least one **early, unlocked** pistol source in the field so you're not hoarding ammo with no gun.
**Sim:** `loot_variety_sim` — roll N caches across biomes, assert distinct item sets + a nonzero weapon rate.

### 5. Buildings are unlabeled — "I don't know what the fuck this is" 🔧
**You said:** standing at a building with no idea what it is.
**Root cause:** Buildings DO get a name sign (`ProtoStructureBuilder` builds "glyph + display_name" out front). But the sign's **words are hidden** until `set_readable(true)` fires — and the reader that fires it (`_update_signs`) iterates **only** the `signs` array, which is filled with just **3 hardcoded safehouse signs**. Streamed building signs and exit signs are never registered, so their names never turn on — you only ever see the emoji glyph. (Same root bug as #8.) Generic placements with no profile are just brown boxes with no sign at all.
**Refs:** `structure_builder.gd:95-100` (sign built), `sign.gd:53 / :65-70` (words hidden until readable), `proto3d.gd:4164-4174` (only 3 signs registered), `proto3d.gd:4180-4199` (reader scans only that array), `world_stream.gd:641-656` (exit signs go to a group nothing reads).
**Fix:** Register streamed structure + exit signs with the reader (append on chunk-stream, or make `_update_signs` scan the `structure`/`exit_sign` groups). Plus a HUD readout naming the building you're aimed at / standing in — the fastest path to "I know what this is."
**Sim:** `sign_reader_sim` — stream a chunk, walk to a building, assert its name becomes visible.

### 6. Drone takes two "use" presses ⚡
**You said:** "I hit use. I hit use again… I don't think you should have to hit it twice."
**Root cause:** It's two separate actions by design, and the first is invisible. Press 1 (`USE drone`) spawns an **autonomous PATROL** bird that drifts up to 8 m and circles — from your top-down view it floats off-frame = "nothing happened" — and drops a `drone_remote` into your pack. Press 2 (`USE drone_remote`) is what actually puts you at the stick (pilot + split-view). The bc3c350 fix removed the old *impossible* flow but kept the two-action shape.
**Refs:** `proto3d.gd:2042-2049` (deploy → PATROL), `drone.gd:24` (defaults PATROL), `proto3d.gd:2050-2054` → `_take_the_stick` `:2953-2966` → `enter_drone_pilot` `:2969-2984`.
**Fix:** In the deploy branch, after spawning, set `piloted=true; parked=false` and call `enter_drone_pilot()` (guarded on being on-foot, which `_take_the_stick` already checks), keep `return true`. One USE = deploy **and** grab the stick. (Dock-scout launch is already single-press.)
**Sim:** update `drone_remote_sim` — assert one deploy press ends with `state == FLYING`.

---

## P2 — MISSING SURFACING / QoL
*(Cross-cutting theme you nailed: "we added a lot of systems… but we ain't looking at nothing." Items 7–14 are all systems that exist in code but were never wired to a surface you can see. This is the biggest bucket.)*

### 7. Drone auto-fly-back / recall 🔧
**You said:** "we need that fly back feature too… a button to automatically fly back."
**Root cause:** No recall exists. The only wired command is E → "land in place" while piloting. The dock ROUTE-scout self-returns on battery/apex, but you can't trigger the turn-for-home.
**Refs:** `drone_pilot.gd:68-74` (land-in-place on E), `drone.gd:176-184` (ROUTE_BACK homing — reusable).
**Fix:** Add an input row + `recall_drone()` that flips the live bird to `ROUTE_BACK` so it self-flies home and docks via existing code. Caveat: a pack-deployed bird has no dock, so it needs a "return to player and land" target rather than the dock path.

### 8. Signs — read them, and mouse-hover to read from afar 🔧
**You said:** "put your mouse over it… get the words… we should be able to get that."
**Root cause:** (a) Exit signs never register with the reader, so their green "EXIT N — NAME" text is hidden at every distance (only the 📜 glyph shows); (b) there's **no mouse-hover/tooltip on any world object** — the only mouse ray is the aim raycast.
**Refs:** `world_stream.gd:641-656` (exit signs unregistered), `sign.gd:35-53`, `proto3d.gd:2267` (aim ray).
**Fix:** Register streamed exit signs (shares the #5 fix), then add a camera-ray hover: point the mouse at a sign → show `sign.text` in a tooltip regardless of your character's sight line. That's exactly the "I can't see it but I can read it" you asked for.

### 9. Spectacles — placed nowhere 🔧
**You said:** "Where's all the spectacles? That was one thing I was looking forward to."
**Root cause:** `docs/design/SPECTACLES.md` is greenlit but **not executed**. The substrate shipped — `betting.gd` (odds/pari-mutuel) and `race_board.gd` (`ProtoRaceBoard`: E cycles `races.json`, second E starts a race) — but it is instantiated **nowhere** in the playable world; the `grandstand` is a catalog row only. The sole reachable racing is the dev-only Proving Grounds scene the front door never routes to.
**Refs:** `betting.gd` (only used by `betting_sim`), `race_board.gd` / `race_controller.gd`, `data/world/structure_profiles.json` (`grandstand` = catalog only).
**Fix (the spec's "S1"):** Place a `ProtoRaceBoard` + betting window at a real spot (the Meridian grandstand at ~(120,−380), which already exists), add it to the interactable group, and announce it on radio + the atlas so you can actually find and bet on a spectacle.

### 10. F10 dev panel is stale 🔧
**You said:** "you haven't updated it… doesn't have any of the stuff in it anymore."
**Root cause:** The panel is frozen at the ~2026-07-04/06 era: TIME / TELEPORT / SPAWN(howler,lurker,dog,chest,car) / GIVE(arsenal,scrip,meds,fuel,heal) / FORGE-reload. **Missing:** weather, infected/FIRST CHOIR, wildlife/ecosystem/gator, bandits/convoys, traffic toggle, carousel jump, races/spectacles, events (caravan/blood-moon/state-at-war/ring), respect/standing, wanted/heat, skills/XP/level, hunger, mud/seasons, drone dock, horse/mount, crew, empire/cloning, books/media.
**Refs:** whole of `game/proto3d/devmode.gd`; toggle `proto3d.gd:701-707`.
**Fix:** Add a `d._row(...)` per new director calling its real entry point — this doubles as your "look at the systems we added" panel. (Pairs naturally with the debug-surfacing you're asking for.)

### 11. Teleport does nothing when you pick a city ⚡
**You said:** "you can choose the city, but you can't choose the teleport there."
**Root cause — nuance:** The GO button IS present and wired to the picker; coordinates are correct world-meters. The real failure is (a) the town list is populated only if the map was ready at panel-create time, and GO silently returns if nothing's selected, or (b) it *does* teleport but drops you onto sparse/not-yet-streamed terrain and the void-net bounces you — so it reads as "nothing happened."
**Refs:** `devmode.gd:59-69` (picker+GO), `:131-138` (`_teleport_town`), `:142-150` (`_teleport`).
**Fix:** Rebuild the town list on panel-*open* (not just first create), and after teleport settle the player onto the streamed floor (raycast down / defer a frame) so you land IN the named place.

### 12. Spawn is 700 m from the Meridian testbed ⚡
**You said:** "I thought the fairgrounds, you could organize everything and keep it here so I could test everything… but you just moved everything, everything is far as fuck away."
**Root cause — honest correction:** Nothing was moved. I diffed the Meridian redo (commit b5a8e0e) against its parent: the 23 test structures are byte-for-byte the same positions, and they ARE tightly grouped in one ~166×151 m town (civic row, main-street row, fight pit, derby bowl, grandstand, junkyard — plus the safehouse gear). The problem is **you spawn on the interstate at ~(6, 388), about 700 m NORTH of the town at ~(121, −305).** So it's a spawn-gap, not scatter. (Note: the MERIDIAN_LIVE pond/paddock/quarantine test gear is still spec-only — not placed yet.)
**Refs:** `usmap.json` `placements[]`; `proto3d.gd:204` (spawn), `:3696` (safehouse at 110,−323); `world_stream.gd:16` (authored rect).
**Fix:** Move the player/car spawn to the Meridian town edge (or add a dev "start in town" warp) so "test everything in one spot" drops you INTO the consolidated testbed. This likely resolves most of the "everything is far" feeling directly.

### 13. Compass 🔧
**You said:** "we need a compass."
**Root cause:** None exists. Closest aid is the single edge-pinned waypoint arrow (points at a target, not north).
**Refs:** `hud_3d.gd:748-782` (`update_nav`).
**Fix:** A thin top-of-screen compass ribbon driven by camera yaw — ticking N/E/S/W and pinning waypoint bearings. Reuses the existing `update_nav` bearing math.

### 14. Radar / minimap ("radiant") 🔧
**You said:** "my radiant need to be improved a lot." *(Interpreting "radiant" as radar/minimap — please confirm, see below.)*
**Root cause:** No minimap/radar exists. The PiP module literally reserves the slot — its header says "Scopes/radar/minimap later bolt onto the SAME module" — but only REARVIEW/DRONE/CAMS are implemented.
**Refs:** `secondary_view.gd:5-6` (the reserved hook), `:94-130` (modes).
**Fix:** Add an `SVMode.MINIMAP` (top-down ortho camera over the player) or a corner radar plotting the same groups the binocular recon scan already gathers.

---

## P3 — FEATURES / BIG LIFTS

### 15. Remove the binoculars ⚡
**You said:** "get rid of the binoculars, they don't work right."
**Root cause:** They're a no-item always-on hold bound to **B + right-mouse + R3**. RMB raises them instead of aiming (hides the reticle), and the mouse simultaneously drives aim *and* pans the camera up to 240 m off your body — so it fights the twin-stick and feels unmoored.
**Refs:** `input_bindings.json:21` (bind), `proto3d.gd:929-945` (poll), `:1064` (recon), `hud_3d.gd:815-817`.
**Fix (cleanest):** Clear the `drivn_binoculars` keys/pad in `input_bindings.json:21` — data-only, can never fire. Full strip = also remove the poll block + recon call + HUD. (Note: the recon *entity-naming* it does is genuinely useful — worth folding into the future radar #14 rather than losing entirely.)

### 16. Roads disconnect / clunky when driving 🏗
**You said:** "the layout of the roads is really messed up, super clunky, it disconnects." (But you love the map view — that's the planning graph, kept.)
**Root cause:** Flat tee/cross junctions DO get a paved slab. But **61 grade-separated crossings get NO physical geometry** — "the roads pass without meeting until M2 decks them" — and that M2 bridge-deck pass **was never built**. Divided-highway medians only open at explicit `gap` junctions; exits are right-in/right-out and by law never break the median. So on an interstate you're walled into your carriageway except at sparse gaps, and ramps meet at 8–15° painted slabs rather than smooth spline merges. The spec even flags `I-95×I-40` ~900 m from Meridian as "the first grade-sep the player will actually see" — currently an unbroken wall.
**Refs:** `world_stream.gd:325-326` (61 pending get nothing), `:687-741` (median gaps only at `gap`), `road_graph.gd:6-9` (planning-only), `docs/design/THE_AMERICAN_ROAD.md:78` (M2 unshipped).
**Fix:** Execute **M2** — deck the 61 `separated_pending` crossings into real over/underpasses (or at minimum gap+slab them) so the drivable surface matches the connected graph the map already draws. This is the single biggest driving-feel win, and it's a real chunk of work.

### 17. Rideable train 🏗
**You said:** "you added a train track? we need to be able to ride that motherfucker."
**Root cause — honest correction:** There is **no train and no rail** anywhere in the game. Exhaustive search found only flavor: a ruler titled "Rail Baron" and a town named "RAIL YARD SEVEN" (whose buildings are generic). **What you saw is almost certainly dirt roads** — they render as two parallel ruts, and from the top-down camera twin parallel lines read exactly like railroad track. There are 75 dirt roads.
**Fix:** A rideable train is net-new: add a `rail` track kind + a rail-follower train vehicle (can reuse the motorist/autopilot path-follow) with a board/ride interact. Fun, but greenfield — flagging scope honestly.

### 18. Car dashboard UI — speedometer / fuel gauge (your lane) 🔧
**You said:** "I can make car UI stuff… speedometers and fuel gauges and all that."
**Support plan:** The data's already live — `car_3d.gd` exposes speed and the 5-part damage/fuel state, and `hud_3d.gd` is where in-car overlays draw. I'll spec the exact getter hooks + a `data/` row format for gauge widgets so your speedo/fuel art drops in without engine edits (data-driven, house rules). Say the word and I'll stub the mount + a sample gauge you can restyle.

---

## ❓ NEEDS YOUR CONFIRMATION (2 items I couldn't pin down)
1. **"The dog comes all the way down."** — Not sure what this means. The dog's **bond** decaying to zero? Its **HP/health bar**? It physically **follows you down** somewhere (into water/a pit)? Tell me which and I'll trace it.
2. **"My radiant needs improving."** — I read this as **radar/minimap** (item #14). If you meant the **radio**, the **HUD in general**, or something else, correct me and I'll re-aim it.

---

## "A SPEC OF WHAT WE'RE SUPPOSED TO BE DOING"
You also asked for a sheet of what the player is *supposed* to do. Good news: the spine exists — **THE FIRST RUN** (`objectives.gd`, the NEW-GAME onboarding chain) and **THE CIRCUIT** (scavenge→upgrade→push→node) — it's just not surfaced strongly, which is the same disease as everything in P2. Proposed: a persistent, glanceable **"WHAT TO DO" panel** (current objective + the Circuit loop + nearest reachable spectacle/base) so the goal is always on screen. There's also `docs/PLAYTEST_GUIDE.md` (the DO→EXPECT script) I can refresh to match today's build. Flagging this as its own follow-up spec rather than burying it in the fix list.

---

## SUGGESTED ORDER OF ATTACK
1. **Quick-win sweep (one session, ⚡):** #1 crash → #2 handbrake → #3 exit-throw → #6 drone one-press → #11 teleport → #12 spawn-in-town → #15 kill binoculars. Seven of your complaints gone, all low-risk, all sim-covered.
2. **Loot + labels (🔧):** #4 loot variety/weapons and #5/#8 sign reader — this is the heart of the scavenge loop and the "I know what this is" feeling.
3. **Surfacing pass (🔧):** #7 recall, #9 spectacles placement, #10 dev panel, #13 compass, #14 radar — "look at the systems we added."
4. **Big lifts (🏗):** #16 road M2 decks, then #17 train / #18 dashboard as you choose.
