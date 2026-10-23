---
name: dsoa-look
description: Use when judging or changing how the DIVIDED STATES OF AMERICA web game looks - light, night, colour, roofs, walls, trees, a town, a screenshot review, "too dark", "ugly", "boring rooftops", "doesn't read from above" - or before calling any visual work done. The critic's method: game-camera shots, measured luma, the top-down read, the budget, and the running list of known look debts.
---

# Judging the look of DSOA (the top-down critic)

The camera is GTA2-high, looking down. Things must READ from above: silhouettes, shadows, roofs, ground. A green
selftest is blind to looks. Nothing visual is done until you have looked at a game-camera screenshot.

## Method
1. **Shoot from the game camera**, same spot, same hour, same zoom, before and after:
   `node tools/dl.mjs teleport x= z=` (or `town=`, or `region action=start` for Florida), `setTime hour=`,
   `setWeather key=CLEAR instant=true`, `step seconds=0.5`, `screenshot --out <path>.jpg`.
   Agent pages start at 18:36; a person's new game starts at 08:00 in Meridian (that is the first impression).
2. **Measure, don't eyeball, light:** mean luma of the play area (PIL: grayscale, crop the middle 60%, `ImageStat`).
   Reference points: noon ~160/255; the default night ("Dark and scary") ~20-25 in a lit town; Pitch ~7; the old
   too-bright night was 90 (dusk). Night level is the pause menu's Night setting (`sky.js NIGHT_I`).
3. **Read it as a critic:** name the three worst things. Ask: does it read as THAT thing from above? Would Robert
   call it generic or ugly? Is anything purple (never)? Is every person shown with their real flag?
4. **Budget:** < 150 draw calls at the widest zoom (`perf`), no new lights (flashlight and glows are additive cones),
   procedural surfaces in shaders (`world/surfaces.js`: roofs, walls, ground) cost no draw calls.
5. **Record:** renders in `docs/renders/web/<topic>/`, and the change in `docs/design/WEB_LOOK.md` (8 sections).

## Known look debts (2026-10-23, fix these next)
- Street palms read as spiky green stars from straight above (Meridian, Rust Haven).
- Painted forest crowns are huge faceted icosahedra ("green gems"); the floor is fixed, the crowns are not.
- Ambient crows (`systems/ambient.js`) are black planks from the camera.
- Meridian is still a street grid; burnt shells have no charred wall tops; corrugated roof kind 0 is a sheet mosaic.
- Rivers: the ripple texture repeats; banks are one hard pale line; desert rivers need a riparian green band.
- Farm sugarcane is a perfectly regular carpet; farmstead yard pads read as parking lots (roadside lane).
- Military base cores are sparse inside big fences; roofs use town roof kinds (bases lane).
- Mule deer ears read as antlers; the island lake's bank is a crude dark wedge.

## Laws already paid for
- three.js r170 lights are not multiplied by pi: brightness comes from intensity + exposure + albedo together.
- Colour written in display space must be linearised (`pow(c, 2.2)`) inside shaders.
- A new pool or a light per object is how the budget dies: instance and batch.
