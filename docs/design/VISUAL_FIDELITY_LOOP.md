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

**Next up (iteration 4):**
1. **Smoke deep pass** — billboarded soft puffs (QuadMesh + radial-gradient texture or
   SphereMesh), count/lifetime retune, slight wind drift; same treatment for the husk
   smolder. Kill the last popcorn. exhaust_sim guards the law.
2. **Phone swap-chip pictogram** in draw primitives (brick vs phone glyphs, no emoji).
3. **Muzzle flash + hit feedback probe** — inventory what weapon.gd shows on fire/hit
   today; cheapest loud win (a 2-frame flash quad + tracer brightness?) — visuals only.
4. Doll nits: center two-wheel tires; consider part ICONS on the vehicle doll panels.
