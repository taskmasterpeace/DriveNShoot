# HANDOFF — THE VISUAL FIDELITY LOOP (2026-07-10 → 07-11)

**Scope of this document:** the complete status of the VISUAL FIDELITY arc (owner
/goal, 19 iterations over ~12 hours) plus the repo state it leaves behind. For the
project-wide have-vs-should map, `docs/HANDOFF.md` remains the authority; this doc
is the visual arc's chapter of it.

---

## 1. TL;DR

- **Everything is ON MAIN.** Last arc commit: `77dbf67`. 19 iterations, each one
  merged through `origin/main` per the merge law (definition of done). Nothing is
  stranded on a branch; the worktree is clean.
- **Visual rating: 9.1/10** (self-assessed Steam-review style, honestly held —
  started at ~5.5). The full per-iteration ladder with one lever per row lives in
  `docs/design/VISUAL_FIDELITY_LOOP.md` (THE LEDGER — the arc's complete truth).
- **The loop is STOOD DOWN** (owner called the handoff). To restart it, see §7.
- **All sims green**: the full 12-sim visual battery was 287/287 at iteration 17;
  every later change re-gated its touched sims (final pass: combat_feel 15/15,
  gunfeel 37/37, exhaust 25/25, menu 7/7, input_map 15/15).
- **Two decisions wait on the owner**: the PixelLab TITLE backdrop (~$0.30, offer
  made three times with photographic evidence) and the 60-min loop cadence
  proposal. UI deep-styling stays the owner's lane (MAP-FIRST ruling).

## 2. Repo state

- **Main**: `77dbf67` on `origin/main` — includes all 19 visual iterations.
- **Worktree**: `.claude/worktrees/visual-fidelity` (branch `worktree-visual-fidelity`),
  clean, fully pushed. Safe to delete or keep for the loop's restart.
- **The playing checkout** (`D:\git\carworld`, branch `codex/specticles-games`) does
  NOT see this work until someone merges/pulls `origin/main` into it — PLAY.bat runs
  that checkout. This was true all session (flagged in iteration 1's report).
- **PixelLab**: $78.72 of credits remain; the entire arc cost ~$0.72 (~$0.005/gen).
  Subscription generations exhausted (2073/2000) — credit fallback works fine.

## 3. What shipped (by system)

**Damage dolls (the owner's headline ask):**
- `damage_doll.gd` (ProtoDamageDoll) — the VEHICLE damage doll on the dash: top-down
  silhouette DRAWN FROM THE SPEC ROWS (chassis/cabin/visible-wheels/armor via
  `ProtoCar3D.doll_spec_for`, cached per class) so every present and future vehicle
  row gets a matching doll free. Live part tints (engine hood, battery box, fuel-tank
  slab, corner-proud tires, chassis outline), vehicles.json armor rows as directional
  FACE STRIPS, fire flicker, flash-on-worsen pulse (self-stopping clock). Rides the
  dashboard dict; absent key = hidden (P1 contract).
- `body_doll.gd` (ProtoBodyDoll) — the BODY doll on the K sheet: the PixelLab
  silhouette (assets/ui/doll/body_doll.png) with 6-part wound tints ALPHA-MASKED
  from the art itself (a red leg paints THE LEG); anchors self-calibrate to the
  figure's bbox. Wired via `toggle_sheet(text, body_tiers)`.

**Vehicles & FX:**
- THE PIPE LAW: exhaust smoke leaves along the pipe axis from true bumper-edge
  tailpipe rows (semi = vertical stack via `exhaust_dir`); visible exhaust_tip
  meshes; husks smolder from the hull with a DYING EMBER (emissive, no light);
  severity reads WHITE-worry → BLACK-death on each car's own material.
- THE SOFT-PUFF SYSTEM (`ProtoFX.puff_texture/puff_material`): one shared runtime
  radial sprite behind exhaust, dust, weather, blood, impact — every box-particle
  system upgraded through it.
- FIRE IS ORANGE: engine flames had rendered as WHITE cubes since the fire system
  shipped (the instance-color path — silently ignored). Emissive ember cubes now.
- THE MARK + THE POOL (`ProtoFX.surface_mark` — one law for every lingering stain):
  bullet pocks on walls/ground (size/alpha jittered) and blood pools under flesh
  hits (floor raycast). The world remembers the fight.
- Muzzle flash grew a hot glow core; impact = dust bloom + emissive sparks.
- NIGHT: `ProtoCar3D.night_glow` — every intact rig's tails idle 2x brighter in the
  dark (rear-aspect read); fixed a real bug (parked cars' light state was frozen at
  build — the tail update sat below the parked early-return).

**World:**
- THE PATCHWORK: deterministic per-chunk ground tint (quantized, cache-bounded) —
  fields read as a quilt; same law applied per-BUILDING (`materialize` tint_seed
  wired at both placement callsites) and warm ROOF CAPS on massing blocks.
- BIOME TINT SEPARATION: the "lemon wash" was the tints under the 1.25x noon sun —
  farmland wheat-gold, forest deep, desert warm sand (the vision cone only DIMS
  outside; it was never the culprit — gameplay info untouched).
- WATER: cached `water_material` (lit ripple + sun-glint lane) + SHORE BANDS (a
  wet-sand rim wherever land borders water — the razor edge is gone).
- WEATHER MADE VISIBLE: rain = 220 streak quads; dust = 150 amber motes; the SKY
  GRADE (`sky_dim/sky_tint/sky_tint_amt/fog_mult` static channels, the grip_now
  pattern) dims/cools/warms/thickens with local intensity — the night floor stays
  un-dimmed (never blind). Fixed `force("clear")` (never removed the storm disc —
  the stuck-banner bug). Storm EDGES proven by a driven crossing.
- THE WARDROBE LAW: `ProtoPuppet.look(name, jitter_seed)` — same-archetype NPCs
  stop being clones (cloth/pants nudge; seed 0 = authored-exact, player/named/lurker
  untouched); wired at motorist + npc callsites.

**Devices/UI (visual only — deep styling is the owner's lane):**
- 9:16 PHONE GPS skin (`DEVICE_SKINS` in world_stream; PixelLab art cropped + LCD
  cross-section-scanned; 📱/📟 primitive-drawn LCD chip swaps skins keeping the view).
- CAR GPS device cohesion (rounded bezel, speaker slit, power LED).
- THE PURPLE PURGE: 🎮 renders purple → 🕹 at all four UI sites (house law #1).

## 4. THE LAWS (paid for — do not re-pay)

1. **The particle-color law** (iterations 4 + 18, the arc's hardest lesson):
   CPUParticles3D per-instance color (`vertex_color_use_as_albedo`, `color`,
   `color_ramp`) renders one zero-data instance as a PINNED OPAQUE BLACK DISC at
   the emitter; the same `color` on a bare mesh with no vertex-color material is
   SILENTLY IGNORED (fire was white for months). Runtime `amount` changes restart
   emission and park instances at the origin (dust toggled 56/28 every frame —
   live violation, killed). **Tint via the mesh's OWN material albedo only;
   amounts are fixed.** exhaust_sim enforces it.
2. **Probe lessons**: pin teleports at `ground_y` EVERY frame (the void-net wins a
   single set); pin the ACTIVE CAR (harnesses boot driving — the seat anchor owns
   the player); give a 30 km snap ~2 s of camera lerp; drive probes need REAL held
   keys (the poller stomps direct throttle writes); PROBE_STORM=1 gates the storm
   drive (~15 s extra).
3. **Booth notes**: night-husk headlight cones are studio-only (in-game, main
   forces lights off on dead cars every frame); `box_body()` wants a Node3D parent
   (a SubViewport isn't one); headless frames spin faster than real time (decay
   checks wait on the CLOCK, not frames); Engine.time_scale slow-mo catches
   sub-100ms FX (restore the PREVIOUS value).
4. **Refactor surgery**: extracting a helper mid-function can land the new func
   INSIDE the old body — parse survives, semantics break downstream (impact lost
   its dust; a distant skull check failed). The sim gate caught it; read the whole
   function after such edits.
5. **The wardrobe law**: seed 0 = authored-exact — never jitter the player, named
   looks, or the lurker.
6. **Emoji are icons**: 🎮 renders purple — the no-purple law covers glyphs.

## 5. The tools (all in `game/proto3d/tools/`, run WITHOUT --headless)

| Tool | What it proves | Output |
|---|---|---|
| `carbooth.tscn` | vehicles in staged damage/night states (7 subjects: smoking, mid-spiral, on-fire, semi stack, husk, night drive, night husk), top-down + rear-3/4 | scratchpad/carbooth/*.png |
| `render_doll.tscn` | damage-doll gallery (classes × states) + body-doll strip | doll_gallery.png, body_gallery.png |
| `render_fx.tscn` | flash/blood/impact/mark/pool/swing/skull tiles (slow-mo for sub-100ms FX; collidable floor for pools) | fx_gallery.png |
| `render_ui.tscn` | the full acceptance set: GPS (all modes + phone skin + debug), HUD drive (doll in place), K sheet w/ wounds, skill tree, pack, CARGPS, NIGHT, GROUND_{farmland,forest,desert}, WEATHER_{rain,dust}, STREET (town cluster), INTERIOR, CROWD, WATER_shore, MENU_boot; PROBE_STORM=1 adds the storm-edge drive | scratchpad/photobooth/*.png |

All output paths point at THIS session's scratchpad (`C:/WINDOWS/TEMP/claude/D--git-carworld/0f71b692-.../scratchpad`)
— a successor session should repoint the OUT consts (photobooth.gd precedent: each
session repoints).

## 6. The sims (the regression net — all green at handoff)

exhaust 25 · map 45 · gauge_hud 44 · dashboard 30 · bodydoll 14 · combat_feel 15 ·
gunfeel 37 · ground_texture 19 · weather_fx 12 · silhouette 21 · interior_skin 15 ·
npc_drive 11 · menu 7 · input_map 15. New this arc: exhaust_sim, bodydoll_sim,
weather_fx_sim (+ checks grown in dashboard/map/ground_texture/gauge suites).

## 7. Open items & how to continue

**Waiting on the owner:**
1. TITLE backdrop — one PixelLab pass (~$0.30) for the menu's plain dark backdrop;
   MENU_boot render shows the current state. Say yes and any session can execute
   (prompt rule: never name the game to PixelLab).
2. Loop cadence — 30-min iterations mined the code wins; 60-min passes were
   proposed for deeper art/content work. Owner decides.
3. Furnisher set density + more structure archetypes — content ROWS (not visual
   defects); the interior probe shows furniture reads fine, sets are just lean.
4. The doll flash-at-speed FEEL and storm-edge feel — human playtest items.

**To restart the loop:** open a session in the worktree (or a fresh one from
origin/main), read `docs/design/VISUAL_FIDELITY_LOOP.md` (the ledger holds the
"Next up" queue and every law), and run the iteration cycle: fetch+merge origin/main
→ execute queue → sims + LOOK renders (view the PNGs; crop-zoom when in doubt) →
ledger append → push HEAD:main → ScheduleWakeup 1800s. The ledger's iteration-18/19
entries carry the exact continuation prompt shape in this doc's git history.

**Also in memory** (`~/.claude/projects/D--git-carworld/memory/visual-fidelity-loop.md`):
the loop's laws + state for cross-session recall.

## 8. The ladder (the arc at a glance)

6.0 pipe law + phone GPS → 6.5 vehicle doll → 7.0 body doll → 7.3 smoke + black-ball
law → 7.5 FX pass 2 → 7.7 night glow → 7.9 ground patchwork + dust law → 8.1 biome
tints (lemon fix) → 8.2 device cohesion → 8.4 weather visible → 8.5 building
patchwork → 8.6 town proof + wet air → 8.7 THE MARK + storm edges → 8.8 water +
puppet verdict → 8.9 wardrobe + shore bands → 9.0 crowd/interior proofs → 9.1 fire
is orange + purple purge → 9.1 blood pools + fight tiles (handoff).
