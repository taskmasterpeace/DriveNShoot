# LSW BODIES: Living Superweapon's faceted people, on DSOA's skeleton

Robert, 2026-10-28: *"include the living super weapon models too ... Like the character models? Not the cars."* And:
*"keep our same everything else."* Then, reviewing the first cut (round Quaternius bodies): *"These are the old model...
The right models are like cubed. The arms are cubed, not round."* This doc covers the second cut, the **faceted** bodies.

Plan: `WEB_DEPTH_PLAN.md` §4. Code: `web/src/systems/lswbodies.js` (the renderer), `web/src/data/lswbodies.js` (the rows and
the generator), `web/src/agent/lswbodies-api.js` (the `bodies` command and the checks), `web/src/scenarios/lsw-bodies.js`
(the photo set), `web/tools/lsw-faceted-ingest.mjs` (the asset ingest). Assets: `web/public/models/lsw-faceted/` (see its
`PROVENANCE.md`). Renders: `docs/renders/web/lsw-faceted/` (classic | faceted | the old round body, side by side).

## 1. Overview
The 24 people nearest you wear LSW's **faceted** bodies: the cubed `modular-hero` kit (46 modules on the 53-bone
`ual-deform-v1` skeleton; boxy limbs, square head, a block face) that LSW builds its FACETNPC1 civilians from. Everyone
else stays on the classic instanced rig. The source is LSW branch `alpine/facetnpc1-kc21df3d3` (2026-10-23), the only
LSW branch or worktree with `body.faceted*` packages; every worktree under `C:/lswwt` and every recent branch of every LSW
repo was searched.

LSW doesn't ship six fixed civilians, it **generates** them: a recipe says which kit modules show, a frame, muscle, hair,
glasses, head size and a face (`facetnpc-variants.js` → `generateCivilian` → `validateModularRecipe` →
`applyModularRecipe`). DSOA does the same, per person (`facetRecipe`), so **every DSOA person gets their own faceted
body**, with LSW's six variants as the presets it starts from.

There is **no second animation system**. `CharacterRenderer.pose()` solves every joint exactly as before, and
`LswBodies.drive()` turns that solution into 53 skin matrices. All faceted bodies draw in **one instanced call**: the skin
matrices, the person's colours and their recipe live in one float-texture row per person, and the vertex shader skins
from it. Hats, gear, guns and scars are still the classic rig's instanced pieces, scaled to the kit's head and trunk.
A **real flag patch** (from the `ui/portrait.js` FLAGS atlas) rides every left shoulder. The cars are untouched.

## 2. Player fantasy
The people around you are LSW people: cubed shoulders and forearms, a square head with LSW's drawn face, the hair LSW
gives them (swept, an afro, a bun, braids), a woman's waist on the women, an old man's glasses, and their flag on their
shoulder. No two strangers on a street are the same. They move exactly the way DSOA people always moved, because the
same solver drives them. At the far edge of the screen the crowd is the familiar classic cartoon, which keeps the frame
cheap. In the pause menu (SETTINGS → People) Robert can flip between the faceted bodies and the classic rig.

## 3. Detailed rules
1. **Who.** Each frame, `choose()` ranks every drawable person by distance to the player. It skips the hidden, those in a
   closed cabin, animals with their own mesh, and anyone culled above your storey. The nearest `near` (24) are near.
   Someone already near ranks at 0.8 × their distance, so the edge doesn't flicker. The pool is 32 GPU rows (`maxNear`).
2. **The recipe** (`facetRecipe(ch, female)`; cached per slot until the slot is reused):
   - **Sex** follows the **voice**: a named NPC's `VOICES[id].gender`, else `genderOf(name)`, so look and sound agree.
   - **Preset:** grey or white hair (light and nearly colourless) → `elder` (glasses, the elder face); else a woman →
     `nurse`; else by faction: warden / player / ally → `cop-off-duty`; raider / dustwolves → `gang-member`; everyone else
     (drifters, soldiers, remnants, the infected) → `worker`. `kid` exists but DSOA has no children yet, so nothing maps
     to it.
   - **Frame** (LSW `MODULAR_FRAMES`, x and z only): the build (`build.w ≥ 1.08` heavy, `≤ 0.92` agile, a made
     character's `look.build` by `BUILD_TO_FRAME`), else the preset's (workers half hero, half heavy by the seed).
   - **Muscle** 0.8–1.3: the preset's, +0.12 for fighters (raiders, soldiers, remnants), ±0.05 by the seed. It drives
     LSW's own `muscleSmall` / `muscleLarge` morphs (`(1 − m) / 0.2`, `(m − 1) / 0.3`). Women get the `waistNarrow` morph.
   - **Hair:** DSOA's hair styles become kit modules: `short` → swept (an afro for about one man in four), `long` → a bun
     on women, braids or swept on men, `bald` → none. Gang members wear braids. Then the **classic hair piece steps
     aside** (`ownsHair`). A hat or a mohawk keeps the classic piece on the faceted head.
   - **Head** width, height and depth 0.93–1.07 by the seed (LSW allows 0.85–1.15).
   - **Face:** the preset's (LSW's six faces were drawn by its face-kit code and baked into the GLBs; DSOA uses the PNGs).
   - **Modules shown:** head, neck, face, torso, waist, legs, arms, deltoids, forearms, hands, fingertips, boots, plus the
     hair module and the glasses. Vest, backpack, helmet, cape and the rest stay off: DSOA's own gear pieces cover that.
3. **The retarget** is bind-space calibration, LSW's own method in `hero-skin.js`. The kit shares the Quaternius body's
   conventions (metres, +z forward, +x the body's left, a T-pose), so the round body's retarget carried over:
   - **Rigid regions.** Pelvis = leg frame × T(hip height) × S(frame x, 1, frame z) × T(−bind hip centre). Trunk (spine,
     shoulders, neck) = DSOA's upper-body frame × S × T(−bind waist). Head = the head frame × S(recipe head) × T(−bind head
     centre).
   - **Limb segments** (thigh, shin, upper arm, forearm) = T(DSOA joint) × swing × stretch × T(−bind joint). The swing is
     the shortest rotation onto the posed bone, under the parent's rotation, so there is no twist.
   - **Ends.** Hands ride the forearm, and the fingers close by a precomputed curl when the hand holds something. Feet
     ride DSOA's boot frame (the leg frame pitched at the ankle), lifted so the kit's sole meets the ground.
   - **The legs** use DSOA's hip, knee and ankle exactly.
   - **The arms** are re-solved by two-bone IK from the kit's shoulder to DSOA's hand point less one palm, bending toward
     DSOA's elbow, stretching up to ×1.35 for a far grip. A hanging arm (no IK, no gun in that hand) moves 0.7 × the
     shoulder difference inward, so it hangs from the kit's narrower shoulder; that moved point is what the solver record
     (and the check) holds.
4. **Classic steps aside.** After `drive()`, the slot's classic torso, hips, head, face and limbs are zeroed by
   `hideSlot`. Hats, gear and guns stay, placed from the solver frames with the head frame scaled by `hatScale` and the
   gear frame by `gearScale`.
5. **Colour.** Each module wears one of seven colours (LSW's material slots): shirt (torso, arms, deltoids), trousers
   (legs, waist), boots, skin (head, neck, hands), forearm (the sleeve, or skin when sleeves are short), hair, trim
   (glasses). Every frame these are read straight from the classic rig's instance colours, so blood, soot, burns, the
   infected skin and the rot tint arrive identical and nothing pops at the hand-off. The face is LSW's PNG, cut out by
   its alpha.
6. **The dead decay on the faceted body** (DEATH-RITES, `systems/rites.js`). It keeps the dead; nothing is handed back
   to the classic rig. While a corpse is still a Character, rites sets `c.rot` and `paint()` lerps the classic colours
   toward the rot tint, and the faceted body reads those colours. The *swell* exists only on rites' far **folded** body
   (its own boxes, never a Character). At the bones stage, rites removes the Character for its bone pile.
7. **The infected** keep faceted bodies. The ZOMBIES lane's poses ride existing solver flags: the crawler is `prone`, the
   fall and get-up is `knockT`, overheating is `crouch`, the lunge is a speed burst.
   **The vein infected** (branch `feat/web-faceted-veins`). Robert's ask was relayed by the DEATHS lane on 2026-10-29: "the
   models from the other game with the veins". Robert then set the colours himself the same day: red for the shamblers,
   black for another breed, and neon green, "radioactive", for the smart ones. A near infected person's BARE skin wears a
   vein tile multiplied over its own already-infected complexion. Bare skin means the skin slot, or a forearm the skin's
   colour. LSW's `modular-surfaces.js infectionTexture` is ported line for line as `veinAtlas()`. By breed:
   - a shambler wears **rupture**: thick red veins and three open wounds, the fissures glowing #ff2a1a;
   - a sprinter wears **black** veins, which do not glow;
   - an echo wears **neon** green veins, glowing #3dff6e;
   - a greyborn wears **hollow**: no map, and the skin lerps 30% toward #857b74;
   - the Choir-Touched and the living wear none.
   The glow is 0.9. The clothes of every veined breed take 14% of #5b4a38. The baked face quad keeps its own eyes: LSW's
   #f5f4dc infected eyes are not ported, because the faces are baked PNGs.
8. **Breath.** An idle, living chest rises 1.2% at 0.25 Hz. No LSW motion clip is used.
9. **Switching.** `bodies action=mode value=classic` (or the pause-menu select, saved in `dsoa.settings`) empties the near
   set; the next frame is byte-identical to the classic rig (a check proves it).

## 4. Formulas, with an example
- Segment skin matrix: `M = T(pA) · R · (W·I + (L − W)·d·dᵀ) · T(−bA)`; `L = |pB − pA| / |bB − bA|` (posed over bind
  length, ≈0.8–1.35); `W = width × (frame.x + frame.z) / 2` (0.8–1.5); `R = swing(R_parent·d, (pB − pA)/|pB − pA|) · R_parent`.
- Trunk width: `S = (width × frame.x, breath, width × frame.z)`, frame from `FACET_FRAMES` (agile 0.83 / 0.88, hero 1 / 1,
  heavy 1.38 / 1.18).
- Arm reach: `reach = (0.6 − palm)·build.h / (|upper| + |fore|)` (kit arm 0.547 m → ≈0.99); if `|wrist − shoulder| >
  0.995·reach·(|upper| + |fore|)`, then `reach ×= min(stretch, ratio)`.
- Morphs: `muscleSmall = max(0, (1 − m) / 0.2)`, `muscleLarge = max(0, (m − 1) / 0.3)`, `waistNarrow = female ? 1 : 0`.
- Hat scale: `k = headScale · max(headHalfX / 0.19, (faceZ − headC.z) / 0.185)`; the kit head sits inside at `headScale / k`.
- Veins (per fragment, bare skin only): `atlas uv = ((fract(u) + style − 1) / 3, fract(v) / 2)`; `colour = skin ×
  map(uv)`; `emissive = 0.9 × glow(uv + (0, ½)).rgb` (the glow row is drawn in the style's own glow colour). Styles in `VEIN_STYLES` order (1 rupture, 2 black, 3 neon, 4 hollow); hollow instead
  `skin = mix(skin, #857b74, 0.3)` per vertex. Clothes: `mix(c, #5b4a38, 0.14)`. *Example:* a sprinter's skin #8f817b
  under a vein pixel #bb1725 reads ≈#6a0c12 (multiply), and the same texel's glow adds 0.9 × #ff2a1a.
- *Example:* a male raider of standard build. Preset gang-member; frame agile (0.83, 0.88); muscle 0.89 + 0.12 = 1.01 ±
  0.05 → `muscleLarge ≈ 0.03`; hair `short` → braids; face gang-member. His trunk is `1.15 × 0.83 = 0.95` wide, his
  limbs `1.15 × 0.855 = 0.98`. Aiming an SMG two-handed, each hand sits one palm (0.06 m ± 3 cm) from its grip.

## 5. Edge cases
- **Assets still loading or failed:** `ready` is false, nobody is near, everyone is classic; `bodies` reports `error`.
- **Pool full** (more than 32 near): `drive()` returns false and that person stays classic.
- **Headless:** the head bone collapses to zero (face and hair with it), like the classic head.
- **Hidden in a cabin, culled above your storey, an animal's own mesh:** never near, never drawn.
- **Dead:** the sprawl pose, which `ik` solves, so the hands are exact. **Knocked down, asleep, swimming, diving:** the
  classic root frame carries the whole body.
- **A hat over hair:** the hair module is off and the classic hat is drawn, so nothing pokes through a cap.
- **A mohawk:** the kit has no mohawk module; the classic mohawk piece rides the faceted head.
- **A slot reused by a new person:** the recipe cache keys on the person's `colors` object, so it is rebuilt.
- **An infected breed with no row in `VEIN_BY_BREED`** (or a plain shambler with no `zkind`) wears red rupture veins.
  A dormant sprinter already shows black veins up close, so it no longer passes for a shambler near the camera. Robert
  chose that legibility over the canon's surprise. At the classic distance it still looks like the rest.
- **An infected in long sleeves:** the forearm is not the skin's colour, so only the head and hands vein; the sleeve
  takes the 14% grave tint.
- **Photo mode, paused:** `sync(chars, 0)` still runs the pose pass, so photos show faceted bodies.
- **WebGL's 16-attribute limit:** the kit's per-vertex data is 6 attributes (+4 for the instance matrix). Colours and the
  recipe ride the bone texture row (9 extra texels), and the morph deltas ride a second texture fetched by
  `gl_VertexID`.

## 6. Dependencies, both ways
- **WEB_DEATHS.md (2026-10-29)**: a dying or dead body is drawn by `characters.js ragPose` from the ragdoll's 12 points, and calls `drive()` with those frames, so LSW keeps the dead. A body missing a limb (`c.lost`) is drawn by the classic rig, which shows the stump.

- **Reads:** `systems/characters.js` (the solver's frames and joints, the classic instance colours, `hideSlot`),
  `data/voices.js` (`VOICES`, `genderOf`), `systems/rites.js` (indirectly: the rot tint through `paint()`),
  `ui/portrait.js` (`FLAGS`, `FLAG_KEYS`), `ui/qol.js` (the `bodies` setting), `main.js` (`charR.lsw.focus = player`).
- **Read by:** `CharacterRenderer` (owns one `LswBodies`, calls `choose`, `drive`, `finish`, `ownsHair`), the agent (the
  `bodies` command), the selftest. `WEB_DECKS_STANCE.md` lists this doc as a dependency.
- **Shared-file hooks (minimal):**
  - `systems/characters.js`: +16 lines from the first cut (import, constructor, choose/finish, `near`, head height, hat
    and gear scale, `drive`), and **+1 condition** in this cut (the classic hair piece skips when `ownsHair`).
  - `main.js`: +1 (focus). `ui/qol.js`: +3 (default, the select, apply). `agent/api.js`: +3 (import, commands, checks).
  - `docs/COMMANDS.md`: regenerated.

## 7. Tuning knobs (`data/lswbodies.js`; safe ranges)
| Knob | Default | Safe range | What it does |
| --- | --- | --- | --- |
| `near` | 24 | 0–32 | how many wear faceted bodies (0 = all classic) |
| `keep` | 0.8 | 0.6–1 | hysteresis at the edge of the near set |
| `width` | 1.15 | 1.0–1.3 | all bodies wider than the kit, to read from the top-down camera |
| `headScale` | 1.25 | 1.0–1.4 | head size (hats scale with it) |
| `stretch` | 1.35 | 1–1.5 | the most an arm lengthens to reach a far grip (the kit's arm is 0.547 m) |
| `palm` | 0.06 | 0.04–0.08 | wrist to grip |
| `grip` / `relax` | [1.1, 1.35, 1.1] / 0.25 | 0–1.6 / 0–0.5 | finger curl (rad per joint) |
| `breath` | 0.012 | 0–0.03 | idle chest rise |
| `flag` | 0.12 × 0.08 m | 0.08–0.16 m wide | the shoulder patch |
| `FACET_PRESETS.*.muscle` | 0.85–0.89 | 0.8–1.3 (validated) | LSW's muscle morphs |
| `FACTION_PRESET`, `HAIR_MODULE`, `BUILD_TO_FRAME` | — | must name a preset / module / frame (validated) | who wears what |
| `VEIN_BY_BREED` | shambler rupture (red), sprinter black, echo neon (green), greyborn hollow, choir none | a `VEIN_STYLES` key or null | which veins a breed wears |
| `VEIN_STYLES.*.width` / `glow` | 13 / 9 / 7 px; #ff2a1a / none / #3dff6e | 3–16 px; any hue outside 260–330° | vein thickness and the colour they glow |
| `VEIN_RULES.glowIntensity` | 0.9 | 0.4–1.5 | how hard glowing veins glow |
| `VEIN_RULES.clothesMix` | 0.14 | 0–0.3 | how much the clothes take the grave colour |

## 8. Acceptance criteria (the named selftest checks, `lsw-bodies:`)
1. **Kit.** The rows validate; the kit loads with 53 bones, 46 modules and six faces; `PROVENANCE.md` names the
   Proprietary-Internal licence and the source sha256; no superhero part is in the kit.
2. **The generator.** A warden wears the cop preset, a raider the gang preset with braids, a woman (by voice) the nurse
   preset with a bun and the narrow waist, grey hair the elder with glasses; a short-haired head drops the classic hair
   piece; 12 drifters give 12 distinct bodies and more than one frame.
3. **Nearest N.** Exactly the 24 nearest are near, their classic bodies are hidden, the far ones drawn classic.
4. **Poses.** Standing, crouched, prone, bike, pickup bed, dead: hip, knee and ankle within 3 cm of the solver; every hand
   one palm (±3 cm) from its hand point.
5. **Hands on the gun.** A two-hand SMG aim, a one-hand pistol, a rifle at low ready.
6. **Feet on the terrain.** The toes sit at the ground the solver stood them on, within 6 cm.
7. **Flags.** One patch per body, each showing that person's own flag.
8. **The infected.** A crawler, a fallen one getting up, an overheated one, a shambler: legs on the solver within 3 cm.
8b. **The vein infected.** A near shambler's GPU row carries rupture, a sprinter's black, an echo's neon, the
    Choir-Touched's and a living drifter's none; the vein atlas has vein pixels in every cell but hollow, glow pixels in
    the rupture (≥80% red) and neon (≥80% green) cells only, and no pixel in the purple range. Render pair: `docs/renders/web/lsw-faceted/veins-*.jpg`.
9. **Decay.** A bloated body (rot 0.6) wears exactly the classic rig's rotted shirt, trousers and skin, and the tint
   really changes them.
10. **Budget.** With 160 people, draw calls stay under 150, faceted bodies add at most 3, 24 are drawn, and the CPU cost
    is under 2 ms per frame.
11. **Classic restore.** classic → faceted → classic gives byte-identical classic matrices and colours, and the faceted
    mesh and patches are gone.

**Measured:** `scenario name=stress` (160 people, 24 near), back-to-back fresh pages in one session: faceted
6.93 / 6.84 ms, 92 / 90 draws; classic 5.87 / 6.42 ms, 88 / 90 draws; so **≈+0.4–1.0 ms/frame and +2 draws** on a PC shared
with other lanes (±1 ms run to run). The round body read 7.35 ms on the previous head. The CPU retarget is ≈0.21 ms/frame
(`bodies` stats). The kit is 4,126 triangles (the round body was 14–15 k), so the GPU side got cheaper; one mesh replaces
two, so the bodies add 3 draw calls (lit, shadow, flag patches) instead of 5. Full selftest: **565/565 twice** on fresh
pages (head 3be16098 on main c9376990).

**Where the bodies read** (D = camera height in m; renders `close-*`, `default-*`, `extreme-closeup`): at the angled
close view (D ≈ 6–7) and top-down D 8–9 the cubed body is unmistakable (square head and face, boxy forearms). At the
default D 22 a person is about 25 px tall, and it reads as a blockier classic. The first cut's proposal stands: tie
`near` to zoom (24 below D 18, 0 by D 24), and a closer default camera or the ANGLED view is how Robert will see them
(a camera-lane call).

**Not done / known limits:**
- No cross-fade at the near edge (hysteresis plus identical colours hide most of it).
- The far crowd stays classic (no baked vertex animation).
- Palms don't twist to face the grip.
- LSW's outfit textures (camo, stripes), tattoos, emblems, coats, hoodies and skirts are not ported; DSOA's own gear and
  colours dress the body. The face is one of LSW's six baked PNGs, not LSW's live face-kit drawing.
