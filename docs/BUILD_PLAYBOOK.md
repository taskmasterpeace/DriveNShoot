# DRIVN — Build Playbook (the loop's operating manual)

**Purpose:** lets a /goal loop work for hours uninterrupted without drifting from the vision.
**Read order at session start:** `CLAUDE.md` (pivot block) → this file → `STAGES.md` → the stage's
deep-dive doc. **Created:** 2026-07-04.

---

## 1. The document map (what governs what)

| Doc | Governs |
|---|---|
| `STAGES.md` ⭐ | build ORDER — beginning→end master map |
| `DESIGN_PILLARS.md` | tiebreaker — when designs compete, more pillars wins |
| `ENGINE.md` | the 8 engine pillars + milestone acceptance |
| `loops/LOOP2_LIVING_CAR.md` | Stage 2 deep-dive (car damage/HUD/arsenal) |
| `systems/INTERFACE_AND_BODY.md` | UI, body/injury, inventory, nav, SecondaryView, aim-cone |
| `systems/COMBAT_AND_GEAR.md` | melee/ranged/throwables/car weapons/loadout |
| `systems/AIM_AND_LOCOMOTION.md` | decoupled feet/gaze/gun, the Look Arc, combat stance |
| `systems/EQUIPMENT_PAPERDOLL.md` | the 19-slot wearable item DB (verbatim user design) |
| `systems/DOGS.md` | dog types/breeds/stress-morale |
| `systems/WORLD_NPCS.md` | PCAS living world, factions, Respect Ledger |
| `systems/TRAVEL_AND_NETCODE.md` | 24× scale, travel modes, MP architecture |
| `systems/CONTENT_PIPELINE.md` | bulk-content: data stamper → AI rows → WFC towns |
| `PROGRESSION.md` | skills/attributes/robotics/taming/farming |

## 2. The iteration protocol (every unit of work)
1. **Pick** the next item: current stage in `STAGES.md` → its deep-dive's acceptance list.
2. **Build** in `game/proto3d/` (until Stage-5 restructure) following `.claude/rules/*`:
   static typing, tabs, data-driven values, signals not UI-reach-ins.
3. **Prove headless** — a sim in `proto3d/tests/` that presses INPUTS (iron rule: no teleporting
   past the mechanic under test; positioning teleports allowed).
4. **Regress**: `drive_sim` + `m1_sim` + `dog_sim` + `walkthrough_sim` + `aim_sim` must stay green.
   New `class_name`s need `--headless --path game --import` first.
5. **Commit + push** (conventional message; no Co-Authored-By). Never >30 min uncommitted.
6. **Surface**: update `FEATURES.md` (player-facing), the stage checklist in `STAGES.md`,
   and the bug ledger (§4). Launch + screenshot at hand-off points.

## 3. Verification commands
```
IMPORT:  <godot-console> --headless --path game --import
SIMS:    <godot-console> --headless --path game res://proto3d/tests/<name>.tscn
         (drive_sim · walkthrough_sim · m1_sim · dog_sim — grep RESULTS/PASS/FAIL/SCRIPT ERROR)
BOOT:    <godot-console> --headless --path game res://proto3d/proto3d.tscn --quit-after 180
PLAY:    <godot> --path game res://proto3d/proto3d.tscn        (leave running for the user)
godot-console = C:\Users\taskm\Downloads\projects\Godot\Godot_v4.5.1-stable_win64_console.exe
```

## 4. Bug ledger (append; strike when fixed + sim-covered)
1. ~~Stairs unclimbable~~ — fixed M1, walk-up sim-tested.
2. ~~World-edge fall~~ — fixed M1 (12 km + last-safe respawn); real fix = Stage 5 streaming.
3. ~~Binoculars snap~~ — fixed (eased view + wheel magnification).
4. ~~Wrong-side car exit~~ — fixed (driver's side).
5. ~~Handbrake 180-spin~~ — the 2026-07-04 "fix" (grip 2.4 + steer trim) did NOT hold: the old
   drive_sim only checked a 1.6 s window (~99°) and never a longer hold, so a real 3 s hold still
   whipped 272°, peak 6.5 rad/s. REAL fix 2026-07-05: brake with a decel FORCE (a wheel-brake
   locks the fronts & kills steering) + a torque yaw-cap (peak now pinned ~2.0 rad/s). drive_sim
   now tests straight-brake decel, a powered drift, AND a long hold.
6. ~~Handbrake "doesn't brake unless you turn"~~ — fixed 2026-07-05: it applied only brake 6/40;
   now a real handbrake_decel (8 m/s2) sheds speed whether you turn or not.
7. Grip baseline "slides a little too much" — now per-surface (2026-07-05): road grip 1.0 / dirt
   0.78; tune the SURFACE table + grip_rear. Dirt intentionally slides more.

## 5. Feel targets (sim-checked numbers)
0-60: 3.0–5.5 s · top ~76 mph · 60-0: 40–50 m · steer @15 m/s: 90–130° in 2.5 s (no spin-out) ·
handbrake STRAIGHT: sheds ≥8 m/s in 2 s & tracks straight · handbrake TURN: drifts ~50–120° in
1.6 s · handbrake LONG hold: bounded, peak yaw ≤ ~2.2 rad/s (NEVER the raw 6.5 whip) · drifting
lays skid marks · dirt grips < road · flips: NEVER · stairs walkable · dive lunge >2 m.

## 6. Vision guardrails (drift check before each commit)
Gritty permadeath (PZ tone) · top-down 3D, readable at a glance · emoji/glyph HUD, amber/bone/
blood/rust, **no purple ever** · data-driven everything (adding content ≠ code) · multi-use
components (ask "what are its 3 uses?") · inputs-only sims · the drive is the game — never make
driving skippable-by-default · every activity feeds the Respect Ledger (Pillar 1) once factions land.

## 7. Current state pointer (update each session)

### ⭐ RESUME CHECKPOINT — 2026-07-05 (read THIS first; history below)
Everything is committed. Codebase is `game/proto3d/` (the 3D mainline).
Run the game: `<godot> --path game res://proto3d/proto3d.tscn`. Console exe for headless/sims:
`C:\Users\taskm\Downloads\projects\Godot\Godot_v4.5.1-stable_win64_console.exe`.

**SHIPPED & sim-proven (Stages 0–6 slice + extras), 22 test suites all green:**
- **Driving pass (2026-07-05):** handbrake **brakes when held straight** (real decel force) and
  **drifts in a controlled arc when you turn — no more 180 whip** (torque yaw-cap: peak 6.5→2.0
  rad/s); **SKID MARKS** under sliding rear wheels (pooled, fade, surface-tinted); **SURFACES**
  (road grips 1.0 / dirt 0.78, browner dust off-road) via `world_builder.surface_at`; the driving
  cone **faces travel not the nose** (a drift no longer reads as "looking sideways"). (drive_sim 7/7)
- **MERIDIAN LIVES (Stage 6 slice):** the **Respect Ledger** (esteem/infamy/notoriety per
  `WORLD_NPCS.md §6`), a TRADER whose shop IS the container panel (moves carry jack, prices =
  base × the town's opinion of you), a SEC-MAN **bounty chain** (offer → live mark + waypoint →
  claim pays jack + esteem → prices drop), and **CRIME**: shoot a townsperson → infamy → SUSPECT
  → no trade, no work, gouged prices. K-sheet shows the ledger. (town_sim 16/16)
- **Drive/Living Car:** VehicleBody3D feel, handbrake drift (no spin), 5-part damage →
  smoke→fire→cook→burnt-husk, salvage, fuel, dashboard glyphs, hotwire, hood-MG mount, flip
  self-recovery. (car/drive/recover sims)
- **On-foot/Combat:** walk/sprint(stamina)/dive, guns (pistol/shotgun/rocket, aim-cone + reticle
  bloom, tracers), melee (wrench/machete, quiet), grenades, **two-way enemies claw back**,
  **KNOCKDOWN + floating combat text**. (arsenal/stage4/fight sims)
- **DECOUPLED AIM — the Look Arc:** feet/gaze/gun are three yaws; strafe & circle-strafe with
  the gun trained; ±60° head arc, past it the body DRAGS at 220°/s — and the **muzzle obeys the
  arc** (no instant back-shots; the round flies the arc edge while you turn). Combat stance
  (×0.7 speed, no sprint, backpedal ×0.6, 2.5 s lull), cone/FADE/lurker-freeze/dog-behind all
  read the GAZE, pinned-aim hot reticle, upper/lower body visual + gun bar. (aim_sim 21/21)
  → `systems/AIM_AND_LOCOMOTION.md`
- **RPG spine:** skills-by-use (Mechanics/Driving/Marksmanship w/ real effects), 6-part body,
  **HEALTH CAP**, character sheet (K), **permadeath** (R restarts). (stage3 sim)
- **Body/Mind:** Stress vital, moodle EMOJI corner (meters deleted), bandage treatment, encumbrance.
- **Dogs + METAWORLD:** 4 types + breeds, rear-smell, **whistle = 4-in-1** (tap heel/double
  guard/triple seek/hold sic), dogs BITE, and the **hydrate/dehydrate metasystem** — guard a dog,
  drive away (it dehydrates to a record), off-screen raid can kill it, drive back to find it gone.
  (dog/dogmeta sims) → `metaworld.gd`, `METASYSTEM.md`.
- **Perception v2 + TRUE LOS OCCLUSION:** world-meter cone (**zoom-independent**), true sight
  RANGE, binoculars extend it, **eye-patch** halves a side, dog-alert reveal snapshot, **the FADE**
  (unseen things fade; seen static things linger as a memory ghost) — and now a **96-ray sight
  fan**: the lit cone STOPS at walls and closed doors, SPILLS through doorways/windows, gates the
  FADE + the lurker's freeze (`main.sight_blocked`), bodies never block (only world statics do),
  and the old flat indoor clamp is DELETED. Dog reveals still pierce walls — smell beats sight.
  (cone/fade/vision/los sims)
- **World:** seeded content streaming + **ground under the far states**, state lines, fog-of-war
  map (M), waypoint arrows (N). Enterable safehouse: door/locks/keys, front-wall fades inside,
  **stairs are now a SOLID RAMP w/ plateau top** you walk up & off. (stage5/m1/walkthrough sims)
- **Audio:** fully synthesized (engine pitches w/ speed, guns, fire, barks) — zero asset files.
- **Feel:** camera trauma-shake, pain flash, dust, moodle pop-in.

**Controls:** WASD move · SHIFT sprint · SPACE dive/handbrake · E interact/adopt · **C** whistle
(tap/2/3/hold) · **G** grenade · **R** reload/restart · **1-3** guns · **K** sheet · **M** map ·
**N** waypoint · **TAB** pack · **B** binoculars · LMB fire · scroll zoom.

**TWO clean NEXT builds (user's choice):**
1. **Stage 6 deepening:** ~~trader + bounty + Respect v1~~ → SHIPPED 2026-07-05 (town_sim).
   Next rungs per `WORLD_NPCS.md`: NPC daily schedules (dawn/dusk stall hours), trader stock
   restock via the metaworld socket (`metaworld.offscreen_event`), gossip v0 (crime seen by ONE
   npc spreads on a timer), Sec-Man turns HOSTILE at Suspect (not just refusal).
2. **Stage 4 finishers:** grenade COOK (hold G — fuse runs in your hand), molotov (reuses the
   car-fire spiral), and NPC parity for the Look Arc (lurkers get a gaze + blind spot you can
   exploit — `AIM_AND_LOCOMOTION.md §9`). ~~Raycast LOS occlusion~~ → SHIPPED 2026-07-05 (los_sim).

**Iron gotchas (paid for — don't re-pay):** sims must RELEASE tapped input actions; redirect sim
output to files (piping `grep|head` on a LIVE sim buffers & HANGS); `var x := main.dyn_call()`
can't type-infer (annotate it); any loop over `dogs[]` must `is_instance_valid` FIRST (dehydration
frees them); stairs = smooth ramp + plateau, NEVER stepped boxes; test the REAL walk path, never
teleport past the mechanic; new `class_name` scripts need a `--headless --import` before sims see them;
NEVER type a var that can hold a FREED instance (`var t: Node3D = bounty.get("target")` THROWS —
use `Variant` + `is_instance_valid`); dogs charge in STRAIGHT lines — never place furniture/NPCs
on a desire path (kennel→chest corridor trapped Lucky; the market moved across the street);
on a VehicleBody3D NEVER write `angular_velocity` directly to steer/limit it — it fights the
wheel solver and ZEROES the drift; use `apply_torque`. A strong wheel `brake` LOCKS the front
wheels and kills steering (a handbrake turn produced 0° yaw) — brake with a decel FORCE instead.
And a bug can pass a sim that only checks a short window (the 180 hid past the old 1.6 s cutoff) —
test the WORST case (long holds), not just the happy path.

---
### History (newest first)
**2026-07-05 (driving pass — playtest fixes):** drive_sim 7/7, battery 22/22. Investigated the
user's "handbrake doesn't brake unless you turn, and then it does a 180." Root causes (both
found by reading + a reproduce sim): the handbrake applied only `brake=6/40` (barely braked) and
NOTHING capped the yaw, so a hold past the old sim's 1.6 s window whipped **272°, peak 6.5 rad/s**.
Fixes in `car_3d.gd`: brake with a **decel force** (a wheel-brake locks the fronts → kills steering,
which had zeroed the drift) + a **torque yaw-cap** (peak pinned ~2.0 rad/s, straight holds settle
to 0). Added **skid marks** (VehicleWheel3D.get_skidinfo/get_contact_point, pooled+faded+surface-
tinted) and a **surface system** (`world_builder.surface_at` from road rects — roads are visual-
only; road grip 1.0 / dirt 0.78 + browner dust). Driving cone now **faces velocity not the nose**
(`proto3d.gd`) so a drift stops reading as "looking sideways." Two hard gotchas paid for (see iron
list). STILL OPEN for the user: the on-foot look model (twin-stick vs the Look Arc) — needs his call.

**2026-07-05 (Stage 6 slice — MERIDIAN LIVES):** town_sim 16/16; battery 22/22. **Respect
Ledger** (`respect.gd`, WORLD_NPCS §6: esteem/infamy/notoriety, standing bands, price_mult),
**ProtoNPC** (`npc.gd` — archetype = a DATA row: Mercy the TRADER, Bridger the SEC-MAN, both
hittable → CRIME), **the shop IS the container panel** (merchant mode: the move is the
transaction, jack flows backward, TAKE-ALL hidden, SELL≫ labels, prices on rows), **bounty
chain** (offer → live lurker mark + BOUNTY waypoint → kill detected the frame it happens →
claim pays 25 jack + 20 esteem → bandage 12→11), **crime closes the town** (60 infamy →
SUSPECT → Mercy refuses the shop, Bridger refuses work, prices gouge 12→17). Standing-change
toasts + K-sheet ledger line. TWO paid-for gotchas entered the iron list: typed vars can't
hold freed instances, and dog desire paths must stay clear of furniture (the market moved
across the street after trapping Lucky mid-SEEK). NEXT: Stage 6 deepening (schedules, restock
via metaworld, gossip v0, hostile Sec-Man) or Stage 4 finishers.

**2026-07-05 (LOS occlusion):** WALLS END SIGHT (los_sim 9/9; battery 21/21). A 96-ray horizontal
sight fan at eye height feeds the cone shader a 1D depth map (`occl_map`) — the lit area stops at
walls/closed doors and spills through the door gap and the upstairs WINDOW; `main.sight_blocked()`
gates the FADE per entity and the lurker's freeze-on-eye-contact (your stare can't freeze what a
wall hides — sim-proven both ways through the actual door, opened by E). Dynamic bodies never
block (bodies aren't walls; sim dummies excluded via the threat group); dog reveals PIERCE walls
by design (smell). The flat "~5.5m indoors" clamp is DELETED — the room's real shape is the clamp
(cone_sim asserts range survives + 4/4 wall dirs stop short). Eye plane at +1.5 m means crates
don't block sight but the stair ramp does — fine at this fidelity. NEXT: Stage 6 Living World,
or Stage 4 finishers (grenade cook / molotov / NPC Look-Arc parity).

**2026-07-05 (aim & locomotion):** THE DECOUPLE shipped (aim_sim 21/21; full battery 20/20):
feet/gaze/gun are three yaws on the player; the **Look Arc** (±60°) gates sight AND the muzzle
— fire/melee/grenade fly `aim_now()`'s CLAMPED gaze, so the first shot at a target behind you
provably MISSES while the body drags around at 220°/s (measured 0.37 s vs 0.36 s analytic).
Combat stance auto-enters on fire (×0.7 speed, sprint refused, backpedal ×0.6 continuous,
2.5 s lull), binoculars ride the same gaze pipe (glassing behind you turns you), and
cone/FADE/lurker-freeze/dog-behind ALL read `sight_facing()` — one rule for sight and aim.
`face_override` + the per-click 180° body snap are DELETED. Visual: upper (head/gun, gaze) /
lower (trunk, feet) split + armed gun bar + pinned-hot reticle ticks. Tunables `@export`ed
(trait/helmet hooks documented). Doc: `systems/AIM_AND_LOCOMOTION.md`. NEXT unchanged:
Stage 6 Living World (trader/bounty/Respect), or raycast-LOS cone occlusion.

**2026-07-05 (perception v2):** cone_sim 6/6 — cone is WORLD-METER based (zoom exploit dead:
55.0m constant across zoom), true sight RANGE added (binoculars now mechanically matter, 120m),
🏴‍☠️ eyepatch item halves the arc via character vision mults (traits/headgear hook LIVE), dog
alerts/nose REVEAL a bubble at the smelled spot (`vision_cone.reveal_at`). Sims: 17 suites.
NEXT: **Stage 6 Living World** — trader + bounty + Respect v1, plugging the aggregate-sim
engine into the metaworld socket (`metaworld.gd` offscreen_event is the plug point).

**2026-07-05 (metasystem slice):** THE METAWORLD is proven (dogmeta_sim 11/11). Guarding dogs
**dehydrate** to records when you leave the AoI bubble, an off-screen roll can wound/kill the
record, and they **hydrate** back on return — come home to find it gone (`metaworld.gd`,
`METASYSTEM.md`). Same engine feeds Stage 6 NPCs + netcode. Also: **whistle = 4-in-1 button**
(tap heel / double guard / triple seek / hold sic), **dog commands** Guard/Sic/Seek + dogs now
BITE (knockdown chance), **combat impact** = floating text (`floater.gd`) + KNOCKDOWN on melee/bite.
GOTCHA: any loop over `dogs[]` MUST `is_instance_valid` FIRST (dogs get freed by dehydration).
NEXT: Stage 6 Living World (trader + bounty + Respect) plugs the aggregate-sim engine into the
metaworld socket; OR the cone-fix pass (zoom-independent cone, eye-patch trait, dog snapshot).

**2026-07-05: STAGE 3 COMPLETE** (12 sims green, + nav_sim 8/8): RPG spine (skills-by-use w/
effects, 6-part body, HEALTH CAP, K sheet, permadeath+R-restart) + waypoint arrow (N cycles
Safehouse/Kennel/Your-Car) + encumbrance (weights, 🎒/🐢 moodle, CARRY_CAP = STR hook).
NEXT: **Stage 4 Combat Depth** — melee (light/heavy, stamina-gated, quiet vs guns), throwables
(grenade arc + molotov reusing car-fire), reticle bloom UI, then car weapon mounts (M3 bridge) —
per `COMBAT_AND_GEAR.md`. After: Stage 5 world streaming (the big one).

**2026-07-04 (Stage 3 core):** RPG spine SHIPPED (stage3_sim 12/12): ProtoCharacter — skills
level by use (Mechanics→faster hotwire, Marksmanship→tighter spread, Driving→by miles), 6-part
body on Damageable, **HEALTH CAP** (wounds drop max hp; bandage treats worst part), character
sheet on **K**, **permadeath** (head/torso broken or hp 0 → death screen, R restarts). Sims now
11: + stage3. REMAINING Stage 3: attributes (STR/DEX/INT/CON/LUCK hooks), navigation arrows/
compass, encumbrance, drop-to-world; then Stage 4 (melee + throwables + reticle bloom UI + car
mounts) per `STAGES.md`.

**2026-07-04 (final):** **STAGE 2 COMPLETE.** Arsenal live (3 guns/3 behaviors, ammo-from-backpack,
tracers, corpse loot), **ProtoAudio** synthesized soundscape (11 streams, engine pitch w/ speed,
fire crackle — zero assets), containers polished (Take All, sorted, blips), dogs unstuck-logic.
Suite (10 sims) all green: m1 21 · dog 12 · car 14 · moodle 9 · vision 6 · container 11 · walk 14
· arsenal 8 · audio 5 · drive in-band. GOTCHAS: pipe `grep|head` on live sims BUFFERS AND HANGS —
always redirect sims to files; `var x := main.dyn_call()` can't infer (type it); convergence
checks > time snapshots. NEXT: **Stage 3** — progression engine (skill xp→thresholds) + body
paper-doll (6-part, health-cap) + character sheet, per `STAGES.md` + `INTERFACE_AND_BODY.md`.

**2026-07-04 (cont):** Stage 0+1 SHIPPED (M1 21/21) · dogs (11/11) + Stress vital · moodle corner
(9/9, meters deleted) · vision cone v1 (6/6) · **Stage 2 Living Car core LANDING:** Damageable
component (multi-use), 5-part anatomy, tier→physics effects (engine power, tire grip, battery/fuel
gate), impact damage, smoke→fire→cook→husk spiral (always burnt), salvage, fuel drain, dashboard
glyphs 🔧🛞🔋⛽🛡️+💥, HOLD-E hotwire. Remaining Stage 2: arsenal (3 guns) + field repair.
Sims: drive · walkthrough · m1 · dog · moodle · vision · car. NEXT after Stage 2: Stage 3
(body/health paper-doll + containers/inventory — the twin pillars) per `STAGES.md`.
