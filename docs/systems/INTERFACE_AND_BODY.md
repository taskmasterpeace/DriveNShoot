# DRIVN — Interface, Body & Combat Systems

**Status:** DESIGN · **Created:** 2026-07-04 · **Primary stages:** 3 (Interface/Body), 4 (Combat), 7 (SecondaryView)
**Note:** research subagents are deepening the SecondaryView, combat aim-cone, and body/treatment
sections; findings fold in here + `CONTENT_PIPELINE.md` when they land.

> The designer's callout: *"I don't see you talking about the UI at all."* — correct, and fixed
> here. This doc owns everything the player SEES and how the body/health SIM feeds it. Tone:
> gritty, Project Zomboid, permadeath.

---

## 1. The UI Framework (born in Stage 3)

A single themeable UI layer (Godot `Control`/`CanvasLayer`), warm-wasteland palette (amber/bone/
blood/rust — **no purple**, per house rules), emoji/glyph-forward so it reads in half a second.

**Screens:**
- **Character Sheet** — attributes (STR/DEX/INT/CON/LUCK), skills w/ progress bars to next
  threshold, the 700-pt cap meter, active traits.
- **Inventory & Containers** — see §3.
- **Body / Health Panel** — see §2 (the paper-doll).
- **Repair screens** — "what repairing a car/motorcycle looks like": the 5-part anatomy as a
  clickable diagram; select a broken component → shows required materials (scrap/tire/battery) +
  a timed action; motorcycle = same system, fewer/different parts (2 tires, exposed rider = less
  chassis). One repair UI, data-driven by the vehicle's component list.
- **World Map** (Stage 5) — country→state→local, fog-of-war.

**In-world HUD (always on):**
- **StatusGlyph strip** (the moodle system) — car parts 🔧🛞🔋⛽🛡️ when driving; player
  afflictions 🤒(sick) 🩸(bleeding) 🦴(fracture) 🥶(cold) ☢️(rads) when on foot; buffs.
- ❤️ health, stamina, 🔫 ammo (`mag/reserve`), 💥 cook-% (car on fire), interact prompts (M1).
- **Navigation:** §4.

---

## 2. Body & Health System (Stage 3) — built on `DamageableComponent` *(researched)*

Project-Zomboid tension, Escape-from-Tarkov structure, leaner than both. The player body is
**6 DamageableComponents** (research says steal EFT's 6–7, not PZ's 13, for a readable HUD):
**Head, Torso, L Arm, R Arm, L Leg, R Leg** (+ optional Neck crit-slot). **Head/Torso → 0 = death;
a limb → 0 = crippled, not dead** (destroyed leg = heavy slow, arm = shaky aim). Same class as car
parts — multi-use principle.

**⭐ The signature dread mechanic (near-free, adopt it): the HEALTH CAP.** Injuries lower your
*maximum* HP, not just current — `max_hp = base - Σ(injury_severity)`. You win the fight but limp
home at a 60% ceiling, so the **extraction drive back to town becomes the real gauntlet.** One
clamp line; it's the emotional core of survival-extraction. Hit location is a **weighted table**
(torso most likely), not per-limb hitboxes — cheap and reads fine top-down.

### 2.1 Injuries (localized, from a cause)
| Injury | Cause | Effect | Treatment (gameplay) |
|---|---|---|---|
| 🩸 Bleeding wound | gunshot, cut, glass | HP drains over time | bandage (stops); disinfect (prevents infection) |
| 🦴 Fracture | crash, fall, heavy hit | that limb impaired (leg→slow, arm→worse aim/reload) | **splint** (needs splint mat + time); heals slowly |
| 🔥 Burn | fire, explosion | pain, infection risk | ointment/bandage |
| 🤕 Deep trauma | severe | knockdown, downed state | field surgery (Medical 70) |

### 2.2 Afflictions (systemic, over time)
🤒 Cold/flu (slower, sneeze = noise), 🦠 Infection (untreated wound → fever → worse), ☢️ Radiation
(from hot zones → CON drain), hunger/thirst/fatigue (tunable; gritty default ON but forgiving).

### 2.3 Treatment = gameplay, not a button *(PZ/EFT-proven UX)*
"What treating your arm looks like": open the Body Panel (`H`) → **paper-doll + per-part status
list**, parts **color-coded** (copy PZ literally): **flashing red** = untreated/needs action,
**white** = bandaged/handled, **orange** = bandage dirty/replace it, blood-drop icon = bleeding,
blacked-out = destroyed limb. → **click the injured part → a menu of only the valid treatments**
(Bandage / Disinfect / Stitch / Splint / Painkiller) → a **timed, interruptible action** (you're
vulnerable during it — the Zomboid tension, and the hook the dogs/ambush attach to).
- Bandage stops light bleed; **heavy/deep wounds need Stitch (needle+thread)**; splint restores
  limb function; disinfect gates infection; painkillers **mask** penalties without healing (risky
  trade). **Self-treatment penalty:** treating your *own* arm is slower/weaker than a leg you can
  see or an ally treating you — one multiplier, big flavor. Medical skill improves all of it.
- Color-state does ~80% of the communication for near-zero art. Drive the panel purely off a
  `part_state_changed` signal — never poll.

### 2.4 Permadeath
Death ends the run (Deathlands stakes). Open thread (Stage 3 decision): what, if anything,
carries between runs — reputation? stash at a home base? a fresh character each time? *Flagged.*

---

## 3. Inventory & Containers (Stage 3) — one `Container` system, many uses

- **Container** = a resource with a grid + weight cap. The SAME class backs: **backpack**,
  **car trunk** ("put stuff in your trunk"), world crates/cabinets, corpse loot, vendor stock —
  *the #1 ranked foundational system* (biggest reuse multiplier in the whole game).
- **Model: grid + weight hybrid (EFT).** Items have W×H shapes → stowing is a spatial puzzle
  (a 6×2 rifle vs a 1×1 can), plus a per-container weight cap; encumbrance scales with STR. Ship
  weight-only first if time-boxed; the Container abstraction lets us add the grid later without
  touching call sites. Godot's built-in `Control` drag-drop (`_get_drag_data`/`_can_drop_data`/
  `_drop_data`) handles transfer natively.
- **⭐ Cargo "insecurity" (Pacific Drive — perfect for a driving game, and we can beat the
  reference):** overstuffed/loose loot enters an *insecure* state and **rough driving can fling it
  out of the trunk and lose it.** Wire cargo-loss probability to our existing **speed / collision /
  heat** signals — Pacific Drive only half-implemented this; we won't. Inventory ↔ driving, tied.
- **UX:** two-panel transfer (you ↔ container), drag/drop, Take-All, Ctrl=one/Shift=stack, weight
  bar, red-ghost invalid placement, right-click context (Use/Equip/Drop/Split).
- **Drop / place** ("ability to put stuff down"): drop into the world as a physical item;
  place-mode for deployables (traps, campfire, drone, later fort pieces).
- **Equip slots:** head/body/hands/holster/back; quick-slots 1–4.

---

## 4. Navigation ("map stuff, arrow stuff")

- **Waypoint arrow** — a world-space or edge-pinned arrow to the active objective/contract.
- **Off-screen indicators** — chevrons at screen edge for tagged entities (ally, target, your car).
- **Compass bar** — heading + nearby POI ticks (know which way is "west to the water").
- **Gadget-driven markers** — an electronic detector pings direction to nearby entities (feeds
  the SecondaryView radar, §5). Data-driven "tracked target" list → the HUD renders arrows.

---

## 5. The SecondaryView System (Stage 7) — ONE module, many uses ⭐ *(architecture researched & verified)*

The designer's "second window" idea, generalized into a reusable engine module. Research
confirmed all four uses collapse into **three Godot primitives**, driven by a
`SecondaryViewConfig` resource + `mode` enum (`DRONE|SCOPE|MINIMAP|RADAR`):

| Use | Technique (verified Godot 4.5) | Camera | Perf |
|---|---|---|---|
| 🚁 **Drone takeover** | **swap the MAIN camera** — `drone_cam.make_current()`, cache & restore prior cam on exit. No extra viewport (full-screen = free & sharp). | drone `Camera3D` | free (reuses main viewport) |
| 🎯 **Scope / PiP** | `SubViewport` + `SubViewportContainer` (or `ViewportTexture` on a sight prop), narrow `fov` = optical zoom. | dedicated eye cam | `UPDATE_ALWAYS` only while raised, else `UPDATE_DISABLED` |
| 📡 **Electronic sight / radar** | **NOT a rendered viewport** — pure `Camera3D.unproject_position()` math → arrow/blip `Control`s. Reads the *current* camera so it still works during a drone takeover. | (reads active cam) | ~free (matrix mult/target) |
| 🗺️ **Minimap** | `SubViewport` + top-down **orthogonal** `Camera3D` → `TextureRect`; or an abstract projected-blip disc (same as radar). | orthographic cam | throttled `UPDATE_ONCE` @ ~12 Hz, not always |

**The one gotcha (baked into the design):** `unproject_position()` returns garbage for points
*behind* the camera — always gate on `is_position_behind()` first; for behind/off-screen targets
compute a bearing and clamp the arrow to a screen-edge ellipse (standard off-screen-indicator
recipe). **Perf rules:** `render_target_update_mode` is the master dial (hidden SubViewports cost
~0 by default); `SubViewportContainer.stretch_shrink 2–4` downsamples cheaply; avoid 3+
simultaneous `UPDATE_ALWAYS` 3D viewports — which is *why* the drone is a camera-swap, not a
second live render. A true second OS `Window` (`force_native`) is reserved ONLY for a deliberate
second-monitor feature; in-game, SubViewport always wins.

**Build order:** Scope → Drone → Radar → Minimap. **Design rule realized:** build SecondaryView
once; drone/scope/radar/minimap are just configs. Appears **dynamically** (raise binoculars →
scope; deploy drone → takeover; equip detector → radar). *Full skeleton + API notes: research
transcript; will land as `secondary_view.gd` + `SecondaryViewConfig` when Stage 7 builds.*

---

## 6. Combat Feel (Stage 4) *(researched — model chosen)*

- **Aim = intent, accuracy = a cone.** The mouse marks where you *want* to hit; the shot lands
  within a **spread cone** set by **Marksmanship skill**, stance, movement, and weapon. Low skill =
  wide cone (you might miss the raider next to you); Grandmaster = near-laser.
- **Use BLOOM, not fixed spray patterns.** CS/Valorant-style learnable recoil patterns reward
  muscle-memory drill and don't read from top-down — wrong for a skill-stat-driven RPG. Bloom
  (Fortnite/Warframe) = each shot lands randomly in the cone; the cone **grows per shot** and
  **recovers when you stop** → rewards pacing, and a *stat* governs it. **First shot from rest is
  near-perfect** (aimed shots feel skillful, full-auto feels sloppy — the risk/reward).
- **Top-down cone math is ONE random angle** (simpler than 3D): rotate the aim vector by a
  triangular-distributed random angle within the current half-spread; **skill multiplies the whole
  envelope** (novice ~1.6× → expert ~0.6×). Tune min ~0.5–2°, max ~8–15°; shotgun = wide fixed
  cone + N pellets.
- **Visible projectiles fly along the ROLLED vector, not the mouse line** — seeing a round go wide
  teaches the cone better than any number. Hitscan guns still spawn a tracer for readability.
  **Pool bullets** (per CLAUDE.md — no per-shot `instantiate`).
- **Reticle = the cone made visible:** 4 arcs whose gap = current spread; blooms on fire/move,
  tightens when steady → imperfect aim feels *fair*, not broken. Plus impact decals + part-based
  blood (ties to §2).
- Unified with vehicle weapons (one weapon system, `mount_type: handheld|vehicle`).

---

## 7. Build order — foundational systems ranked by payoff *(researched)*

Ranked by (reuse × survival-payoff ÷ effort). Build top-down when Stage 3/4 opens:

| # | System | Why top-ranked | Effort |
|---|---|---|---|
| 1 | **Container abstraction** (one Resource) | powers backpack, **trunk**, loot, corpses, stash — biggest reuse multiplier; unlocks the whole loot/extraction loop | Med |
| 2 | **Per-body-part HealthComponent + injury Resources** | heart of survival-permadeath; **6-part + health-cap** defines the feel | Med |
| 3 | **Signal-driven status HUD** (paper-doll + bars + color states) | renders health/afflictions/weight/ammo off one signal bus; color does the talking | Low |
| 4 | **Data-driven affliction/effect table** (`.tres` rows) | one tick-engine drives bleed/infection/rads/cold/pain *and* buffs; new status = one row | Low-Med |
| 5 | **Waypoint / offscreen-indicator NavHUD** | one list + renderer for objectives/extraction/town/contracts/gadget; slots into existing bounty HUD | Low |
| 6 | **Weapon spread/bloom component + pooled projectiles + reticle** | makes shooting feel skill-driven (~30 lines of cone math) | Med |
| 7 | **Attributes + learn-by-doing skills** | low content cost, ties body/combat/driving/loot into one growth spine | Low-Med |

**#1 and #2 are the twin pillars — everything hangs off the Container abstraction and the
per-part HealthComponent.** Ship #3 alongside so both are legible.

**Two signature mechanics that differentiate DRIVN (near-free, genre-perfect):** the **PZ health
cap** (§2) and **Pacific Drive cargo insecurity** (§3) — both wire survival directly into the
*drive*, which is our whole genre.

---

*Cross-refs: `STAGES.md` (order), `PROGRESSION.md` (Marksmanship/Medical skills),
`loops/LOOP2_LIVING_CAR.md` (glyph HUD + arsenal this builds on), `ENGINE.md` (DamageableComponent).
Research transcripts (bulk-content, SecondaryView, body/combat) — 2026-07-04 subagents.*
