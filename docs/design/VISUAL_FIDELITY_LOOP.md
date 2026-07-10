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

**Next up (iteration 5):**
1. **FX pass 2 — blood + bullet impact on the puff system** (fx.gd: blood gets dark
   soft sprites + gravity, impact gets dust-colored puffs; flash gets a hot diamond
   quad). Sim: fx groups still spawn; carbooth-style render via a staged hit.
2. **Night atmosphere probe** — what does 22:00 look like today (render at night with
   headlights); cheapest wins: headlight cone softness, tail-glow bloom-ish emissive
   tune, dash glow at night. VISUALS ONLY, keep the night-floor law intact.
3. Vehicle doll: subtle part ICONS (engine bolt / battery / pump glyphs at 2px scale)
   if they read at 1x — test in the gallery first.
4. PixelLab: consider a matching 9:16 phone SKIN for THE CAR GPS mini-panel (cohesion).
