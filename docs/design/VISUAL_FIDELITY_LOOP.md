# THE VISUAL FIDELITY LOOP — ledger

**Owner directive (2026-07-10 /goal):** damage dolls (vehicle-class silhouette showing the
directional/part damage + a body-parts doll for the character), tailpipe smoke out the
SIDE (was pouring from the middle), a 9:16 cell-phone GPS variant alongside the handheld,
PixelLab for UI art (never name the game in prompts), a 30-minute loop with an honest
Steam-style visual rating each pass, **until it's a 10/10. VISUALS ONLY** — another worker
shares the repo, so this loop lives in its own worktree and merges through origin/main.

## Rules of engagement
- Worktree `worktree-visual-fidelity` (`.claude/worktrees/visual-fidelity`). Each iteration:
  `git fetch` + merge `origin/main` FIRST, work, prove, then push `HEAD:main`.
- Every visual change lands with a sim proof AND a LOOK proof (carbooth / render_ui PNGs,
  actually viewed — a green sim is blind to art).
- PixelLab: subscription generations are exhausted (2073/2000) — running on ~$79 of
  credits. Keep batches purposeful; dismiss review packs that miss.
- Tools: **carbooth** (`res://proto3d/tools/carbooth.tscn`, windowed) renders staged
  damage-state vehicles top-down + rear-3/4; **render_ui** covers HUD/GPS/pack/sheet.

---

## Iteration 1 — 2026-07-10 ~06:00

**Shipped:**
- **Tailpipe law** (`car_3d.gd`): smoke now leaves along the PIPE AXIS — the old emitter
  fired straight up from inside the trunk, which read as "middle of the car" from the
  game camera. Per-class `tailpipe` rows moved to true bumper-edge pipe exits; semi keeps
  its vertical stack via new `exhaust_dir` row; every 4-wheel class grew a visible
  `exhaust_tip` mesh at the exact emitter point; husks now smolder wide-and-upward from
  the hull center (wreck mode) instead of out the pipe. **exhaust_sim NEW: 16/16.**
  Carbooth LOOK proof: top-down + rear-3/4 confirm the rear-left plume.
- **9:16 PHONE device skin** (`world_stream.gd`): `DEVICE_SKINS` rows (gps brick 448x512 /
  phone 181x288) — one screen law, per-skin LCD rect + buttons; PixelLab phone art
  cropped + LCD cross-section-scanned to `assets/ui/device/phone.png`; a 📱/📟 LCD chip
  swaps handhelds live, keeping the current view (phone is all-touch — no physical
  hotspots). **map_sim 45/45** (4 new device checks).
- **Carbooth** dev tool (photobooth's sibling for rigs).
- Banked art: `assets/ui/doll/body_doll.png` (clean neutral front-facing body silhouette,
  picked from 4 candidates) for the body-parts doll next iteration.

**PixelLab spend:** ~140 generations (credits). 3 vehicle-silhouette packs dismissed —
perspective sprites + baked damage, wrong shape language for a status doll. Verdict
locked: **the vehicle doll draws itself from the same spec rows that build the 3D body**
(chassis/cabin/wheels/armor) — auto-matches every current and future row; PixelLab stays
on device bezels/panels/body art where it's strong.

**Steam rating: 6.0/10** (was ~5.5). The authored low-poly-box look is consistent and the
exhaust/damage read is now honest, gauges are real art — but the dash damage row is still
emoji-text, there's no damage doll yet, particles are bare gray boxes with no fade/growth,
and night/impact feedback is thin. A Steam reviewer says "charming prototype aesthetic,
UI half-dressed."

**Next up (iteration 2):** ~~vehicle damage doll · smoke grow/fade · body doll · phone
polish~~ → executed below.

---

## Iteration 2 — 2026-07-10 ~06:50

**Shipped:**
- **THE VEHICLE DAMAGE DOLL** (`damage_doll.gd`, class_name ProtoDamageDoll): top-down
  rig silhouette DRAWN FROM SPEC ROWS (`ProtoCar3D.doll_spec_for` — chassis/cabin/
  visible-wheels/armor, cached per class) so every present/future row gets a doll that
  matches its rig. Live tints: chassis = the outline, engine hood / battery box / fuel
  tank slab as panels, TIRES on corner-proud wheels (inside the chassis box they
  vanished — first gallery render caught it); vehicles.json armor rows draw as steel
  FACE STRIPS (front/rear/sides — the directional read); ON-FIRE flickers the hood
  (process only runs while burning). Healthy = QUIET slate; tier 1+ shouts in the shared
  HUD palette on the house dark-plate-amber-edge backing. Mounts left of the dash block,
  rides the same dashboard dict ("doll" absent = hidden — P1 contract kept, proven).
  **dashboard_sim 30/30 (4 new), gauge_hud 44/44, exhaust 18/18.**
- **Smoke puffs grow + fade** (scale_amount_curve 0.5→1.7, alpha ramp in/out) — the
  popcorn read is tamed; deeper particle pass still queued.
- **render_doll.gd** — the doll's own acceptance GALLERY (classes × damage states, one
  strip): healthy-quiet / beat-up-loud / fire-glow / shot-tires-red all verified by eye.

**Steam rating: 6.5/10** (was 6.0). The dash now has a real instrument that answers
"where am I hurt" at a glance, and directional armor is finally visible. Holding it
back: the character has no visual damage read yet, particles are still gray boxes,
the doll's 2px outline is subtle at 1× (loud states carry it), bike wheel read weak.

**Next up (iteration 3):** ~~body doll · doll juice · bike wheels~~ → executed below.

---

## Iteration 3 — 2026-07-10 ~07:40

**Shipped:**
- **THE BODY DOLL on the K sheet** (`body_doll.gd`, ProtoBodyDoll): the character's
  6-part paper-doll made visible — the PixelLab silhouette top-right of the sheet with
  each wound region tinted by its live Damageable tier. The craft move: per-part WHITE
  MASKS baked once from the art's own alpha (first render showed floating programmer
  rectangles — masked tints follow the body's real shape: a red leg paints THE LEG).
  Anchors are fractions of the figure's alpha-bbox (self-calibrating to regenerated
  art). Wired through `toggle_sheet(text, body_tiers)` + proto3d's `_body_tiers()`;
  real-K-press flow proven. **bodydoll_sim NEW 10/10** (incl. the headless-frames≠
  real-time flash-decay gotcha), dashboard 30/30 stays green.
- **Doll juice**: a vehicle part that WORSENS pulses white for 0.7s (the hit you feel
  on the instrument, self-stopping clock); two-wheeler tires now draw flush at nose/
  tail OVER the hull (they vanished under it, then bled off the plate — both caught
  by the gallery, both fixed).
- **render_doll** grew the body gallery strip; **render_ui** grew the SHEET_body
  in-game shot (staged torso WORN + r_leg CRITICAL — text rows and doll agree).

**Steam rating: 7.0/10** (was 6.5). Damage now has a face on BOTH bodies — the rig
and the driver — with one shared tier grammar, and instruments react to hits. Still
holding it back: smoke is gray boxes (curves help, mesh doesn't), the swap-chip emoji
is mush, world lighting/night feedback flat, muzzle/impact effects thin.

**Nits parked:** bike doll tires sit slightly right of center (they mirror the rig's
real visible-wheel x — could center for the read); sheet shows "HP 100/69 (cap)"
when staged wounds drop the cap below current hp (pre-existing, cosmetic).

**Next up (iteration 4):** ~~smoke deep pass · chip pictogram · muzzle probe · doll
nits~~ → executed below.

---

## Iteration 4 — 2026-07-10 ~08:30

**Shipped:**
- **SMOKE DEEP PASS** — the exhaust is finally SMOKE: billboarded soft discs off a
  shared runtime radial-gradient sprite (`ProtoFX.puff_texture/puff_material` — the
  craft home every gray-box system upgrades through), 36 puffs × 2.2s, wind whisper in
  the gravity, severity tint WHITE-worry → BLACK-death on each car's own material,
  husks burn black. Verified by render: a real billowing plume.
- **THE BLACK BALL HUNT** (the iteration's real work): a pure-black disc pinned at the
  pipe survived ramp rebuilds, alpha floors, fixed amounts, billboard-mode swaps, and
  full-cycle waits. Isolation ladder: 5x crop → hide-the-emitter probe (ball is the
  smoke system) → pixel probe (0.00,0.00,0.00 exactly) → **root cause: CPUParticles3D's
  per-instance color path (vertex_color_use_as_albedo + color/color_ramp) renders one
  zero-data instance as an opaque black disc at the emitter.** LAW (sim-enforced): puff
  emitters tint via their OWN material's albedo_color, never per-instance color.
  **exhaust_sim 22/22** incl. the no-instance-color-path check. Side effect: severity
  smoke-density buckets replaced by the color read (amount changes restart emission
  and park instances at origin — same artifact family, also outlawed).
- **Device swap chip pictograms** in primitives — brick glyph on the phone, phone glyph
  on the brick, both crop-verified crisp (the 14px emoji mush is gone).
- **Muzzle/hit probe done**: ProtoFX already answers every shot (flash/casing/blood/
  impact/swing/skull) — the upgrade path is quality (soft-sprite blood + impact via
  puff_material, flash shape), queued below.
- Doll nit: two-wheel tires centered on the doll's axis.

**Steam rating: 7.3/10** (was 7.0). The smoke column is the single most-seen effect in
the game and it finally looks authored; every dial on the screen now agrees on one
grammar. Holding it back: blood/impact FX still box-particles, night/headlight
atmosphere flat, world materials untouched, doll outline subtle at 1x.

**Next up (iteration 5):** ~~FX pass 2 · night probe~~ → executed below; doll icons +
car-GPS skin deferred (queued below).

---

## Iteration 5 — 2026-07-10 ~09:20

**Shipped:**
- **FX PASS 2 on the puff system** (`fx.gd`): BLOOD = dark soft droplets that burst,
  thin and fall (puff sprite on its OWN material — the black-ball law holds); IMPACT =
  a blooming DUST kick + a pinch of hot emissive SPARK chips (two fire-and-forget
  emitters); MUZZLE FLASH grew a soft HOT-GLOW CORE disc behind the blade + light.
  All fx groups intact — **combat_feel 15/15, gunfeel 37/37, exhaust 22/22.**
- **render_fx.gd** — THE FX BOOTH (new tool): flash/blood/impact staged and captured
  MID-LIFE (the flash lives 70ms — the booth slows Engine.time_scale to 0.05 to catch
  it mid-bloom, restoring the previous value per the house law). Strip verified: the
  flash reads hot blade + glow core + light pool; blood splats; dust blooms w/ sparks.
- **NIGHT PROBE done** (render_ui NIGHT_world @ 22:30): the night floor is honest, the
  HUD/gauges/doll stay readable, warm light pools look right. FINDINGS for the queue:
  (a) parked/AI cars are nearly INVISIBLE at night — they need a faint glint/rim or
  idle tail-glow at distance; (b) the headlight-cone judgment needs a DRIVING night
  shot (probe was on foot); (c) dash could take a subtle warm night-glow backing.

**Steam rating: 7.5/10** (was 7.3). Every combat answer now photographs like an
effect instead of debris cubes, and the game's most-seen particle systems share one
authored sprite language. Holding it back: night-parked cars vanish, world materials/
biome ground still flat, doll outline subtle at 1x, no in-cabin night glow.

**Next up (iteration 6):** ~~night pass~~ → executed below; doll icons + CAR-GPS skin
roll forward.

---

## Iteration 6 — 2026-07-10 ~10:00

**Shipped:**
- **THE NIGHT GLOW LAW** (`ProtoCar3D.night_glow`, set by main off daynight): every
  intact rig's tail boxes idle 2x brighter in the dark — a car now reads at distance
  from BEHIND (headlights already answered the dark facing forward). Which exposed a
  real bug the new sim check caught: `_update_tail_lights()` sat BELOW the parked
  early-return, so parked cars' glow state was frozen at build forever — moved above
  the gate; parked rigs now answer brakes/night like the rest. **exhaust_sim 24/24.**
- **Carbooth NIGHT STAGE**: subjects carry a night flag (moonlit void, own headlights,
  night glow, restored after). The night_drive shots are the look-proof: hot tail
  lamps + warm halo pool from behind; twin soft cones throwing far up-screen from
  top-down. **Cone verdict: no tuning needed** — the flat-long-throw law reads
  authored as-is. Dash night backing: SKIPPED on evidence (probe shows the cluster
  readable at night; don't gild).
- **Rolling DUST on the puff system** (caught while reading the drive block): the
  most-seen driving effect was still box-particles with a DEAD `color` line (the
  instance-color path, ignored without the material flag). Soft sprites + growth
  curve, tint on its own material. Struggle/dirt recolors still write `_dust.color`
  (dead writes — harmless, queued to route onto the material next touch).
- **PixelLab check-in**: $78.72 of $79.44 remaining — five iterations of art cost
  ~$0.72 total (~$0.005/gen). ART IS CHEAP; spend freely where a surface needs it.

**Steam rating: 7.7/10** (was 7.5). Night is now a place: rigs glow, cones throw,
pools warm — and it's all diegetic. Holding it back: flat world/biome ground
materials (the next big lever), struggle-dust recolor dead-write, doll outline at 1x,
no impact decals/scorch marks.

**Next up (iteration 7):** ~~ground probe + patchwork · dust law~~ → executed below;
doll icons + CAR-GPS skin roll again.

---

## Iteration 7 — 2026-07-10 ~10:40

**Shipped:**
- **THE GROUND READ PROBE** (render_ui GROUND_farmland/forest/desert — permanent
  acceptance shots): staged biome teleports from the game camera. Three probe
  lessons paid for: a bare position set loses to the fall/void-net (PIN each frame
  at `ground_y`), the harness boots IN the car so pin the ACTIVE CAR (the seat
  anchor owns the player), and a 30 km snap needs ~2 s for the camera lerp to
  close. Probe verdict: the triplanar grain WORKS; the real gaps were (a) zero
  mid-scale variance — fields one flat sheet at 10-50 m — and (b) the vision-cone
  pool washing visible ground to lemon-bright (finding logged, not yolo'd).
- **THE PATCHWORK** (`ProtoWorldBuilder.chunk_tint` + world_stream `_ground_col`):
  deterministic per-chunk tint nudge (±5.5% value, quantized to 5 shades so the
  material cache stays bounded), applied to relief floors, flat floors and biome
  ground visuals. Fields now read as a QUILT — verified in the after-probe (tonal
  parcels with chunk seams reading as field edges). **ground_texture_sim 15/15**
  (3 new patchwork checks: deterministic, 2-5 shades, subtle).
- **THE DUST LAW FIXES**: `_dust.amount = 56/28` toggled EVERY FRAME while
  struggling — a live amount-change violation (restart + origin-parked instances)
  on the most-seen driving effect; now fixed at 40 and struggle reads through the
  dust's own material tint (the old `_dust.color` writes were dead — no material
  ever read them).

**Steam rating: 7.9/10** (was 7.7). The world floor finally has scale texture:
grain up close, parcels at distance — and the dust system can't stutter-restart
mid-drive anymore. Holding it back: the vision-pool lemon wash (needs a careful
cone-shader touch), biome tints could separate more (farmland golden vs forest
deep), chunk seams could dither, doll outline at 1x.

**Next up (iteration 8):** ~~cone wash + biome tints~~ → executed below; doll icons
CLOSED (skip with reasoning); CAR-GPS skin rolls with a concrete sketch.

---

## Iteration 8 — 2026-07-10 ~11:15

**Shipped:**
- **THE CONE WASH, diagnosis FLIPPED**: the vision shader (vision_cone.gd) only DIMS
  outside the pool (×0.68) — the pool doesn't brighten anything; it shows the TRUE
  ground color. The lemon was the BIOME TINTS themselves under the 1.25x warm noon
  sun. The cone is gameplay information and stays untouched.
- **BIOME TINT SEPARATION** (BIOME_GROUND retune, ~10% value down + hue separation):
  farmland → WHEAT-gold, forest → deep woodland floor, plains → dry sage, scrub/
  desert/swamp nudged warm/murky; mountains/urban/water untouched; the GPS map
  palette (MAP_BIOME) untouched on purpose — it's its own read. Before/after GROUND
  probes: the lemon is GONE, farmland reads golden, forest reads green, the
  patchwork parcels carry through. **ground_texture 15/15 (incl. no-purple guard),
  map_sim 45/45.**
- **Doll part icons: CLOSED as SKIP** — at 1x the dash doll is ~96 px; part glyphs
  land at ~3 px (mush by arithmetic, no render needed). The doll's spatial anatomy
  IS the label (hood = engine, slab = tank, corners = tires). Revisit only if the
  doll ever gets a zoomed inspect state.

**Steam rating: 8.1/10** (was 7.9). The world's floor now has honest, differentiated
color under real daylight — golden farms, green woods, warm sand — with grain and
parcels at every scale. Crossing 8: the game photographs like a place now. Holding
it back: structures/streets still flat-material, weather visuals unprobed, CAR GPS
mini-panel bezel-less, skid/scorch decals absent.

**Next up (iteration 9):** ~~CAR GPS bezel · weather probe · street probe · doll
stroke~~ → executed below.

---

## Iteration 9 — 2026-07-10 ~11:50

**Shipped:**
- **CAR GPS device cohesion**: the mini panel joins the handheld family — device-round
  corners (4→7), a slim inner bezel line, a speaker slit, and a live amber power LED,
  all primitives in `_draw_cargps`. CARGPS shot verified: reads as dash HARDWARE.
- **Doll loud-state stroke**: chassis outline 2px→3px at tier>=2 (the 1x whisper fix).
- **WEATHER READ probe** (new permanent WEATHER_rain / WEATHER_dust shots):
  **DUST works** — amber grade + crushed vision read as a storm; gap = no airborne
  motes (queued). **RAIN IS INVISIBLE** — banner says RAIN, world reads sunny: no
  streaks, no cool grade, no wet-ground darkening. The biggest weather gap.
- **STREET READ probe** (STREET_meridian): landed INSIDE a building (bonus: the
  roof-fade interior read works, strays/traders visible). Confirmed finding:
  **buildings are flat single-color slabs** — walls/roofs/trim share one tone. Next
  frontier. (Probe fix for next pass: place ON the road, e.g. off the road polyline.)

**Steam rating: 8.2/10** (was 8.1). Small pass — instruments now read as one hardware
family and the probes bought the next two big tickets. Holding it back: invisible
rain, flat buildings, no dust motes, no decals.

**Next up (iteration 10):** ~~rain visible · dust motes · force(clear) fix~~ →
executed below; BUILDING READ is now the firm lead for 11 (rolled twice).

---

## Iteration 10 — 2026-07-10 ~12:30

**Shipped:**
- **THE WEATHER MADE VISIBLE** (`weather.gd` grows its visual layer): RAIN = 220
  billboarded streak quads sheeting down over the probe (own material, fixed amount —
  both laws hold); DUST = 150 amber puff motes streaming sideways; both emitters ride
  a probe-anchored root and toggle off intensity (>0.12), working through BOTH the
  field and the fiat-pin paths.
- **THE SKY GRADE**: `ProtoWeather.sky_dim/sky_tint/sky_tint_amt` static channels
  (the grip_now pattern) — rain cools+dims 15%, dust warms, heat glows faintly;
  daynight applies them to the DAY term only, so **the night floor stays un-dimmed**
  (never blind, storm or not — sim-proven at midnight).
- **force("clear") BUG FIXED**: the old filter removed only "clear"-kind systems
  (none exist) — the storm disc survived and re-derived RAIN a frame later (the
  probe's stuck banner). The fiat now clears the sky; regression-proven (stays clear
  through 40 frames).
- **weather_fx_sim NEW: 10/10** (streaks/motes on-off per kind, material law, grade
  values, midnight floor, clear-stays-clear). Rain streaks widened 0.03→0.05 m after
  the first render read ~1px at the gameplay camera.

**Steam rating: 8.4/10** (was 8.2). Weather is now a picture, not a stat line: rain
sheets down with a cool damp grade, dust storms drift amber haze. Holding it back:
flat buildings (the last big slab), no wet-ground darkening, no storm audio-visual
sync check, doll outline nits.

**Next up (iteration 11):** ~~building read core~~ → executed below; town look-proof
+ wet ground + storm edge roll.

---

## Iteration 11 — 2026-07-10 ~13:05

**Shipped:**
- **THE BUILDING PATCHWORK** (`structure_builder.materialize` gains `tint_seed`):
  per-placement wall-tint jitter through the same quantized law as the ground quilt
  (seed = hash of the placement position, wired at BOTH placement callsites; seed 0
  = byte-identical for every other caller — all builder sims stay green untouched).
  A street of same-category shells stops being one repeated swatch.
  **ground_texture_sim 16/16** (new: distinct wall swatches across seeds).
- **THE ROOF READS**: massing blocks (junkyards/monuments/compounds) were one swatch
  wall-to-top — now capped with a warm roof tone (visual-only, no collision), so the
  top-down camera separates WALLS from ROOF.
- **STREET probe repointed onto the road** via `usmap.road_near` — landed on the
  I-95_X1 off-ramp: a genuinely good ROAD read (centerline paint, forest parcels
  flanking). For the TOWN street with several buildings in frame (the jitter/roof
  look-proof), next pass queries a "street"-kind road near Meridian center instead.

**Steam rating: 8.5/10** (was 8.4). Structures now vary like the land under them and
roofs read as roofs — sim-proven; the town-frame look-proof rides next pass. Holding
it back: town look-proof pending, wet ground, storm-edge transition unprobed, dash/
sheet plates still primitive-styled.

**Next up (iteration 12):** ~~town proof · wet air · PixelLab check~~ → executed
below; storm-edge probe rolls with reasoning.

---

## Iteration 12 — 2026-07-10 ~13:40

**Shipped:**
- **THE TOWN LOOK-PROOF** (STREET probe v3 — placement-cluster centroid instead of
  road_near/rect-center): Meridian center with 6+ shells in frame, and the building
  patchwork READS — cool gray / tan / cream / warm brown across the block, open-top
  interiors honest, long clean shadows. The street stopped being one swatch. Probe
  shot is the permanent acceptance now.
- **WET AIR** (in place of wet-ground darkening): a `fog_mult` grade channel — rain
  x2.3, dust x3.2, heat x1.15 distance-haze thickening, applied in daynight next to
  the other channels. Rationale: ground darkening required swapping cached shared
  materials across live chunks (heavy churn); the sky grade already dims 15% and
  thicker air sells WET at distance for one env write. **weather_fx_sim 12/12** (2
  new fog checks).
- **PixelLab check-in**: $78.72 still (nothing spent since it.1 — the loop's wins
  have been code-drawn). Verdict: no HUD surface currently reads thin enough to
  need generated art; the next worthy PixelLab surface is the TITLE/menu backdrop
  (out of the 30-min loop scope — flagged for the owner).
- **Storm-edge probe ROLLED with reasoning**: proving the gradient read needs a
  driven crossing (static 3-point shots don't show the transition); the drive-sim
  staging (real held keys — the DRIVE poller gotcha) deserves its own pass.

**Steam rating: 8.6/10** (was 8.5). The town finally photographs like a town.
Remaining ladder to ~9: storm-edge motion read, decals (skid/scorch/impact), menu/
title art, interior furnishing density at street scale, doll art polish.

**Next up (iteration 13):** ~~storm-edge probe · decals · doll strips~~ → executed
below; TITLE screen awaits the owner's word.

---

## Iteration 13 — 2026-07-10 ~14:15

**Shipped:**
- **THE MARK** (decals inventory → cheapest win): skid decals + screech already
  existed; gunfire left NO memory. Now a world hit leaves a dark pock aligned to the
  surface normal (weapon's ray already carried it), random-rotated against
  repetition, lingering 9 s then fading — fire-and-forget, grouped `fx_mark`.
  Cars/companions keep their old read (ZERO normal = burst only, compat default).
  FX booth grew a late-capture "mark" tile: the pock persists after the burst dies.
- **STORM-EDGE drive probe** (env-guarded PROBE_STORM=1 in render_ui, ~15 s extra):
  a small staged rain cell dead ahead, REAL held-W drive (the poller law), 3 frames
  across the gradient. **The transition reads beautifully** — at the edge the storm
  interior darkens with streaks + thickened haze while the near field stays bright;
  no popping. Speedo 67 mph in-frame proves the real drive.
- **Doll armor strips**: alpha floor 0.16→0.24 — the directional read carries at 1x.

**Steam rating: 8.7/10** (was 8.6). Firefights now leave scars on the world and
storms have real edges you can see coming. Remaining ladder to ~9: title/menu art
(owner-gated), interior density at street scale, water/shoreline read, character/
puppet material polish, minimap/atlas cohesion extras.

**Next up (iteration 14):** ~~water probe + material · puppet probe · ladder~~ →
executed below; TITLE still owner-gated.

---

## Iteration 14 — 2026-07-10 ~14:50

**Shipped:**
- **WATER READS** (probe: lakes photographed as flat painted boxes; the razor
  land-water edge + no depth band logged): new cached `water_material` — the shared
  noise normal at gentle 0.35 for lit RIPPLE + roughness 0.12 for a sun-glint lane,
  zero new geometry; wired into the wet-chunk build. After-probe: the sheet reads
  rippled. Deeper wins (shore wet-band, depth tint) logged for a dedicated pass.
  **ground_texture_sim 19/19** (3 new water checks), map 45/45.
- **PUPPET probe verdict: NO CHANGE** — the photobooth game-view shows the mannequin
  reading clean and cohesive at game distance (head/jacket/pants/boots separation
  already carries). The style IS the authored look; polish would be gilding. The one
  real candidate — NPC wardrobe variance in crowds — queued as a probe (needs a
  crowd shot, not a solo).
- **THE RATINGS LADDER** (for the owner):

  | It. | Rating | The lever |
  |----|--------|-----------|
  | 1  | 6.0 | pipe law (exhaust out the side) + 9:16 phone GPS |
  | 2  | 6.5 | THE VEHICLE DAMAGE DOLL (spec-row silhouette, armor faces) |
  | 3  | 7.0 | THE BODY DOLL on the K sheet (masked wound tints) |
  | 4  | 7.3 | smoke deep pass + the black-ball law |
  | 5  | 7.5 | FX pass 2 (blood/impact/flash on soft sprites) |
  | 6  | 7.7 | night glow law + night stage |
  | 7  | 7.9 | ground patchwork + dust law |
  | 8  | 8.1 | biome tint separation (the lemon fix) |
  | 9  | 8.2 | CAR GPS device cohesion + probes |
  | 10 | 8.4 | WEATHER MADE VISIBLE (streaks/motes/grade/fog) |
  | 11 | 8.5 | building patchwork + roof caps |
  | 12 | 8.6 | town look-proof + wet air |
  | 13 | 8.7 | THE MARK (firefight memory) + storm-edge proof |
  | 14 | 8.8 | water ripple/glint + puppet verdict |

**Steam rating: 8.8/10** (was 8.7). The remaining distance to 10 is mostly OWNED
surfaces (title/menu art — owner-gated; UI is the owner's lane per MAP-FIRST) and
larger art passes (interior density, NPC wardrobe variance, shore bands, decal
variety). The loop continues mining honest wins.

**Next up (iteration 15):** ~~wardrobe law · shore bands · probes~~ → executed below.

---

## Iteration 15 — 2026-07-10 ~15:40

**Shipped:**
- **THE WARDROBE LAW** (crowd probe verdict: 8 authored looks, but within an
  archetype every NPC was an exact clone): `ProtoPuppet.look(name, jitter_seed)` —
  a stable per-spawn hue/value nudge on cloth+pants ONLY (colors are DATA, the rig
  is sacred; seed 0 = the exact authored row so the player, named looks, and the
  lurker's all-black stay untouched). Wired at the two crowd callsites (motorists,
  npcs). **bodydoll_sim 14/14** (4 new wardrobe checks: authored-exact, varies,
  spawns differ, subtle).
- **SHORE BANDS**: a wet-sand grain rim wherever a land chunk borders water (4
  biome probes per chunk, thin visual strips, no collision) — the coast stops
  being a razor edge. Look-proven: a warm beach line runs the whole coast now.
  map_sim 45/45, npc_drive 11/11.
- **Probe results**: roof caps read in-game (massing blocks in the interior frame);
  the interior-density question rolled with a better target (the probed diner/
  police are ROOFED — aim at an open-top walkin house next pass). A live dust
  storm crossed the probe shot — the amber grade holding up in the wild.
- Ladder: | 15 | 8.9 | wardrobe law + shore bands |

**Steam rating: 8.9/10** (was 8.8). Crowds stop being clones and coasts have
beaches. Remaining honest levers: interior density (open-shell target), decal
variety, NPC crowd LOOK-shot (in-world), title/menu (owner-gated).

**Next up (iteration 16):** ~~interior take 2 · crowd shot · decal variety~~ →
executed below.

---

## Iteration 16 — 2026-07-10 ~16:10

**Shipped:**
- **CROWD LOOK-PROOF**: four same-archetype scavs with seeded wardrobes lined up
  in-world — the tint differences photograph (darker gray → warm tan across the
  line), and Meridian's own residents wander the same frame with their authored
  looks. The wardrobe law is real on screen, not just in the sim.
- **INTERIOR DENSITY, answered**: the open-top house shows its BED and crates
  clearly from the game camera — furniture READS at street scale. Density itself
  (pieces per set) is a furnisher-ROW content question, not a visual defect —
  logged as a content-side note for the owner, not a loop item.
- **Decal variety**: impact marks jitter size (0.24-0.40 m) and alpha (0.5-0.72)
  — no two pocks identical. combat_feel 15/15, gunfeel 37/37.
- Ladder: | 16 | 9.0 | crowd + interior proofs, decal variety |

**Steam rating: 9.0/10** (was 8.9). The world now photographs ALIVE: varied crowds,
furnished interiors, varied battle scars, beaches, storms with edges, towns with
character. What separates 9 from 10 is owner-lane and content-scale work:
- TITLE/menu art (PixelLab backdrop — STILL AWAITING THE OWNER'S YES).
- UI deep-styling (the owner's declared lane — MAP-FIRST ruling).
- Furnisher set density + more structure archetypes (content rows).
- Bigger art passes (real texture sets, model detail) beyond the box-authored style.
The loop has mined the honest code-drawn wins; the remaining levers need either the
owner's word or content-scale investment. The loop CONTINUES probing + polishing.

**Next up (iteration 17):** ~~full sweep · night husk · juice recheck~~ → executed
below.

---

## Iteration 17 — 2026-07-10 ~16:55

**Shipped:**
- **FULL-SUITE SWEEP: 287/287 GREEN** across all 12 visual-domain sims (exhaust 25
  after the ember check, map 45, gauge 44, dash 30, bodydoll 14, combat_feel 15,
  gunfeel 37, ground 19, weather_fx 12, silhouette 21, interior_skin 15, npc_drive
  11) + every acceptance render re-shot and spot-checked. ZERO drift after 16
  iterations of changes.
- **THE DYING EMBER** (the one gap the sweep found): a night husk read as a hole in
  the dark — now a faint emissive ember sits on the burnt deck (mesh, no light —
  husks are many), and from the game camera a wreck reads silhouette + ember +
  smolder. Booth note: the night-husk tile shows headlight cones (studio-only —
  in-game main forces lights off on dead cars every frame).
- **Doll juice recheck, resolved by evidence**: the flash path is already sim-proven
  end-to-end (tier flow in dashboard_sim, arm/decay in bodydoll_sim); whether the
  0.7 s pulse FEELS right at 60 mph is a human-playtest question — owner-noted, not
  fabricated into a sim.
- Ladder: | 17 | 9.0 | stability sweep + the dying ember |

**Steam rating: 9.0/10** (held — a stability pass, honestly rated). The loop's
remaining levers stand as stated in it.16: title/menu (owner-gated), UI lane
(owner's), content rows, big-art passes.

**Next up (iteration 18):**
1. **Playtest-facing polish sweep**: walk the PLAYTEST_GUIDE's DO→EXPECT script eyes
   (boot → drive → fight → night) via renders; catch anything a fresh player sees
   in minute one that the probes haven't.
2. **The smoking gun check**: SMOKING fire_state (chassis <40%) — is there tail
   smoke AND engine smoke separation? (fire at engine, smoke at pipe — verify the
   read mid-spiral.)
3. TITLE backdrop: only on the owner's yes.
4. Consider: loop cadence — with the code-mine worked, propose slowing to 60-min
   iterations (more per-pass depth) in the report; owner decides.
