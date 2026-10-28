# LSW BODIES: Robert's Living Superweapon people, on DSOA's skeleton

Robert, 2026-10-28: *"include the living super weapon models too. I always like those models a lot better ... Like the
character models? Not the cars. I love the cars in this."* And: *"keep our same everything else."*

Plan: `WEB_DEPTH_PLAN.md` §4. Code: `web/src/systems/lswbodies.js` (the renderer), `web/src/data/lswbodies.js` (the rows),
`web/src/agent/lswbodies-api.js` (the `bodies` command and the checks), `web/src/scenarios/lsw-bodies.js` (the photo set),
`web/tools/lsw-bodies-ingest.mjs` (the asset ingest). Assets: `web/public/models/lsw/` (see its `PROVENANCE.md`).
Renders: `docs/renders/web/lsw-bodies/`.

## 1. Overview
The 24 people nearest you wear the bodies LSW uses: Quaternius's *Universal Base Characters* (Superhero Male and Female,
CC0), skinned meshes with 65 bones. Everyone else stays on the classic instanced rig. There is **no second animation
system**. `CharacterRenderer.pose()` solves every joint exactly as before: IK feet, two-hand grips, crouch, prone, deck
riding, the bike saddle, the death sprawl, dragging. `LswBodies.drive()` then turns that solution into 65 skin matrices.
All the LSW bodies of one mesh draw in **one instanced call**. The skin matrices live in a float texture, one row per
person, and the vertex shader skins from it. Hats, hair, gear, guns and scars are still the classic rig's instanced
variants, scaled to the LSW head and trunk. A **real flag patch** (from the `ui/portrait.js` FLAGS atlas) rides every
LSW left shoulder. The cars are untouched.

## 2. Player fantasy
The people around you look like people: real shoulders, elbows, hands that close on the grip, booted feet, a woman's
body on the women, and their flag on their shoulder. They move exactly the way DSOA people always moved, because the same
solver drives them. At the far edge of the screen the crowd is the familiar classic cartoon, which keeps the frame cheap.
In the pause menu (SETTINGS → People), Robert can flip between LSW bodies and the classic rig in the same frame.

## 3. Detailed rules
1. **Who.** Each frame, `choose()` ranks every drawable person by distance to the player. It skips the hidden, those in a
   closed cabin, animals with their own mesh, and anyone culled above your storey. The nearest `LSW_RULES.near` (24) are
   near. Someone already near ranks at 0.8 × their distance, so a person at the edge doesn't flicker between the two
   rigs. The pool is 32 GPU rows per mesh (`maxNear`).
2. **Which body.** The mesh follows the person's **voice**: a named NPC's `VOICES[id].gender`, else `genderOf(name)`
   (`data/voices.js`). How someone looks and how they sound therefore never disagree. The row comes from the build:
   `build.w ≥ 1.08` is heavy, `≤ 0.92` is lean, else standard. These are LSW's own `body.hero-{standard,
   standard-female, lean, heavy}` packages, carried as width ratios.
3. **The retarget** is bind-space calibration, LSW's own method in `hero-skin.js`. There are three kinds of bone:
   - **Rigid regions.** Pelvis = leg frame × T(hip height) × S(width) × T(−bind hip centre). Trunk (spine, clavicles,
     neck) = DSOA's upper-body frame (lean, twist, prone, seat) × S × T(−bind waist). Head = the head frame × S ×
     T(−bind head centre).
   - **Limb segments** (thigh, calf, upper arm, forearm) = T(DSOA joint) × swing × stretch × T(−bind joint). The swing is
     the shortest rotation that turns the bind bone onto the posed bone, applied under the parent's rotation. It carries
     no twist, so knees and elbows hinge naturally. The stretch scales by length along the bone and by `width × row.limb`
     across it.
   - **Ends.** Hands ride the forearm, and the fingers close by a precomputed curl when the hand holds something (the
     gun hand, both hands on a two-hand hold, low ready, the bars, a tool, fists). Feet ride DSOA's boot frame (the leg
     frame pitched at the ankle), booted (`boot` scale) and lifted so the sole meets the ground.
   - **The legs** use DSOA's hip, knee and ankle exactly.
   - **The arms** are re-solved by two-bone IK from the LSW shoulder (narrower than DSOA's 0.33 m) to DSOA's hand point
     less one palm, bending toward DSOA's elbow. So a hand on a gun stays on the gun. If the grip is out of reach (the
     bike bars, a sprawl), the arm stretches to reach it, up to ×1.25. A hanging arm (forward kinematics, no gun in that
     hand) moves inward with the shoulder.
4. **Classic steps aside.** After `drive()`, the slot's classic torso, hips, head, face and limbs are zeroed with the same
   `hideSlot` that hides people in cabins. Hats, gear and guns stay; they were already placed from the solver frames, with
   the head frame scaled by `hatScale` and the gear frame by `gearScale`.
5. **Colour** is read every frame straight from the classic rig's instance colours: shirt, trousers, boots, skin, and the
   forearm (which is skin when the sleeves are short). Blood, soot and burns therefore arrive identical, and nothing pops
   at the hand-off. The fragment shader cuts the cloth regions in bind space per fragment (waist, boot tops, neck, wrists,
   elbows; LSW's anti-sawtooth rule). It adds cloth cues: a belt, hems, a collar, a fine weave, matte cloth against
   slightly glossy skin. A shirt's normal leans to a smooth barrel, so the source's sculpted chest doesn't read as bare.
6. **Breath.** An idle, living chest rises 1.2% at 0.25 Hz. This is the one thing DSOA had no pose for. No LSW motion clip
   is used (see `PROVENANCE.md` for why and each clip's licence).
7. **Switching.** `bodies action=mode value=classic` (or the pause-menu select, saved in `dsoa.settings`) empties the near
   set. The next frame is byte-identical to the classic rig (a check proves it).

## 4. Formulas, with an example
- Segment skin matrix: `M = T(pA) · R · (W·I + (L − W)·d·dᵀ) · T(−bA)`, where `L = |pB − pA| / |bB − bA|` and
  `R = swing(R_parent·d, (pB − pA)/|pB − pA|) · R_parent`.
- Arm reach: `reach = (0.6 − palm)·build.h / (|upper| + |fore|)`. If `|wrist − shoulder| > 0.995·reach·(|upper| + |fore|)`,
  then `reach ×= min(stretch, ratio)`.
- Hat scale: `k = headScale · max(headHalfX / 0.19, (faceZ − headC.z) / 0.185)`.
- *Example:* a warden aiming an SMG two-handed. DSOA puts the gun hand at (−0.13, 0.54, 0.36) in the upper-body frame
  (world ≈ y 1.54). The LSW right shoulder is at x −0.212 × 1.2. The forearm runs 0.25 m to the wrist 6 cm short of the
  grip. Both hands close (grip 1.1 / 1.35 / 1.1 rad per joint). The selftest measures each hand at 0.06 ± 0.03 m from its
  grip.

## 5. Edge cases
- **Assets still loading** (or failed): `ready` is false, nobody is near, and everyone is classic. `bodies` reports `error`.
- **Pool full** (more than 32 of one mesh): `drive()` returns false and that person stays classic.
- **Headless:** the LSW head bones collapse to zero, like the classic head.
- **Hidden in a cabin, culled above your storey, an animal's own mesh:** never near, never drawn.
- **Dead:** the sprawl pose, which `ik` solves, so the hands are exact. **Knocked down, asleep, swimming, diving:** the
  classic root frame carries the whole body.
- **Lefties:** the grip side follows `ch.hand`. **Zombies** wear LSW bodies too: their infected skin and torn clothes
  come through the same colours.
- **Photo mode, paused:** `sync(chars, 0)` still runs the pose pass, so photos show LSW bodies.

## 6. Dependencies, both ways
- **Reads:** `systems/characters.js` (the solver's frames and joints, the classic instance colours, `hideSlot`),
  `data/voices.js` (`VOICES`, `genderOf`), `ui/portrait.js` (`FLAGS`, `FLAG_KEYS`), `ui/qol.js` (the `bodies` setting),
  `main.js` (`charR.lsw.focus = player`).
- **Read by:** `CharacterRenderer` (owns one `LswBodies`, calls `choose`, `drive` and `finish`), the agent (`bodies`
  command), the selftest.
- **Shared-file hooks (minimal):**
  - `systems/characters.js`: +16 lines (import, constructor, choose/finish, `near` flag, head height and hat scale,
    gear scale, the `drive` call and its grip flags).
  - `main.js`: +1 (focus).
  - `ui/qol.js`: +3 (default, the select, apply).
  - `agent/api.js`: +3 (import, the commands spread, the checks call).
  - `docs/COMMANDS.md`: regenerated.
- **ZFIGHT** may add a depth-layer line to the characters.js materials. LSW body materials are separate
  (`lswbodies.js`); give them the same line if needed.

## 7. Tuning knobs (`data/lswbodies.js` LSW_RULES; safe ranges)
| Knob | Default | Safe range | What it does |
| --- | --- | --- | --- |
| `near` | 24 | 0–32 | how many wear LSW bodies (0 = all classic) |
| `keep` | 0.8 | 0.6–1 | hysteresis at the edge of the near set |
| `width` | 1.2 | 1.0–1.3 | all LSW bodies wider than the source, to read from the top-down camera |
| `headScale` | 1.3 | 1.0–1.4 | head size (hats and hair scale with it) |
| `boot` | [1.3, 1.25, 1.12] | 1–1.5 each | bare source feet as boots |
| `stretch` | 1.25 | 1–1.4 | the most an arm lengthens to reach a far grip |
| `palm` | 0.06 | 0.04–0.08 | wrist to grip |
| `grip` / `relax` | [1.1, 1.35, 1.1] / 0.25 | 0–1.6 / 0–0.5 | finger curl (rad per joint) |
| `breath` | 0.012 | 0–0.03 | idle chest rise |
| `flag` | 0.12 × 0.08 m | 0.08–0.16 m wide | the shoulder patch |
| row `limb` / `chest` | 0.88–1.13 | 0.7–1.4 (validated) | build widths |

## 8. Acceptance criteria (the named selftest checks, `lsw-bodies:`)
1. The rows are valid, both CC0 bodies load with 65 bones, and the provenance on disk says Quaternius CC0-1.0.
2. **Nearest N.** The near set is exactly the 24 nearest people, their classic bodies are hidden, the far people are drawn
   classic, and there are 24 GPU rows.
3. **Poses.** Standing, crouched-aiming, prone-aiming, the bike rider, the pickup-bed rider and the dead: every LSW hip,
   knee and ankle is within 3 cm of the solver's joint, and every hand is one palm from its grip, ±3 cm.
4. **Hands on the gun.** A two-hand SMG aim, a one-hand pistol and a rifle at low ready.
5. **Feet on the terrain.** The balls of the feet sit at the ground the solver stood them on, within 6 cm.
6. **Flags.** One patch per LSW body, each showing that person's own flag from the atlas.
7. **Budget.** With 160 people, draw calls stay under 150, the LSW bodies add at most 5, 24 are drawn, and the skinned
   CPU cost is under 2 ms per frame.
8. **Classic restore.** classic → lsw → classic gives byte-identical classic instance matrices and colours, the LSW meshes
   and patches are gone, and the `bodies` command and setting both switch it.

**Measured** (stress scene, 160 people, 24 near, A/B interleaved in one session with `gl.finish`): pose pass 1.42 → 1.74 ms,
render 3.09 → 3.23 ms, so **+0.45 ms/frame**, of which the skinned bodies' CPU retarget is ≈0.27 ms. The LSW meshes add 3
draw calls (one lit, one shadow, the flags) and ≈0.7 M triangles across both passes. `scenario name=stress`: before
5.86–6.48 ms / 88 draws. With LSW, back-to-back runs in the same loaded session read classic 7.96–8.97 ms and LSW
9.03–9.91 ms / 89–92 draws. Other lanes share the CPU, so wall time swings by ±1 ms run to run; the interleaved A/B
above is the number to trust.

**Not done / known limits:**
- There is no cross-fade at the near edge. The swap is hidden by hysteresis and identical colours, but the silhouette
  changes.
- The far crowd stays classic (baked vertex animation of the LSW body was not built).
- Palms don't twist to face the grip.
- The source is a superhero physique: lean is narrower, not thinner-limbed.
