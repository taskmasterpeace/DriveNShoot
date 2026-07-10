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

**Next up (iteration 2):**
1. **THE VEHICLE DAMAGE DOLL** — new `damage_doll.gd` Control: top-down silhouette drawn
   from spec rows (chassis/cabin/bed/wheels), 5 part-glyphs tinted by live tier
   (engine/tires/battery/fuel_tank/chassis) + 4 armor-face edge strips (front/rear/side
   rows) — mounts in the dash where the static thumbnail sits. Sim + render_ui proof.
2. Smoke puffs that GROW and FADE over life (scale_amount_curve / color_ramp) — boxes
   popping in/out is the cheapest-looking thing on screen right now.
3. Body doll on the K sheet over `body_doll.png` (6-part wound tints).
4. Phone-skin polish pass from the render_ui shot (LCD rect fine-tune if needed).
