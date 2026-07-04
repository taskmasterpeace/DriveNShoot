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

## 2. Body & Health System (Stage 3) — built on `DamageableComponent`

Project-Zomboid-grade, but leaner. The player body is a set of DamageableComponents (same class
as car parts — multi-use principle) arranged as a **paper-doll**: head, torso, L/R arm, L/R leg.

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

### 2.3 Treatment = gameplay, not a button
"What treating your arm looks like": open the Body Panel → click the injured part → available
treatments show given your inventory + Medical skill → a **timed action** (you're vulnerable
during it — the Zomboid tension, and the hook the dogs/ambush attach to). Bandage stops bleeding;
splint restores limb function; disinfect gates infection; painkillers mask penalties temporarily.

### 2.4 Permadeath
Death ends the run (Deathlands stakes). Open thread (Stage 3 decision): what, if anything,
carries between runs — reputation? stash at a home base? a fresh character each time? *Flagged.*

---

## 3. Inventory & Containers (Stage 3) — one `Container` system, many uses

- **Container** = a resource with slots + weight cap. The SAME class backs: **backpack**,
  **car trunk** ("put stuff in your trunk"), world crates/cabinets, corpse loot, vendor stock.
- **Model:** weight + slot hybrid (Zomboid-ish); encumbrance scales with STR; over-weight = slow.
- **UX:** two-panel transfer (you ↔ container), drag/drop, quick-move, right-click context.
- **Drop / place** ("ability to put stuff down"): drop from inventory into the world as a physical
  item; place-mode for deployables (traps, campfire, drone, later fort pieces).
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

## 6. Combat Feel (Stage 4)

- **Aim = intent, accuracy = a cone.** The mouse marks where you *want* to hit; the shot lands
  within a **spread cone** whose width is set by **Marksmanship skill**, stance, movement, and
  weapon. Low skill = wide cone (you might miss the raider next to you); Grandmaster = near-laser.
  *(Cone math + how to communicate it — reticle bloom, tracers — from research subagent.)*
- **Visible projectiles** — you see rounds/tracers travel (ties to the Arsenal's PROJECTILE
  behavior; hitscan guns still spawn a tracer for readability).
- **Feedback:** reticle blooms with movement/recoil and tightens when steady; hit markers; the
  cone is *shown* so imperfect aim feels fair, not broken.
- Unified with vehicle weapons (one weapon system, `mount_type: handheld|vehicle`).

---

*Cross-refs: `STAGES.md` (order), `PROGRESSION.md` (Marksmanship/Medical skills),
`loops/LOOP2_LIVING_CAR.md` (glyph HUD + arsenal this builds on), `ENGINE.md` (DamageableComponent).*
