# Horizon bands (provenance)

The rows live in `src/data/looks.js` `HORIZONS`: mesas, swamp_treeline, ridges, flat_plains and dead_skyline. Each region of
`LOOK_REGIONS` points at one of them.

**No band images were generated (2026-10-29, LOOK-FEEL lane).** The camera law in `src/data/camera.js` (`thetaSum: 80`: the
frame's top edge stays on the ground) keeps the horizon off every view the game has. The most tilted view looks 10° below the
horizontal. A band would never be on screen, so spending Directors Palette points on one would buy nothing.
Directors Palette: 0 generations, 0 points.

The live proof is `look action=horizon` and the selftest check
`look-feel: the horizon is never on screen in any view`.

**If a view ever lifts the law** (a photo mode, a cinematic), make the bands then:
- Use Directors Palette `nano-banana-2`.
- Prompt for a seamless 360° strip of distant land with no sky: a flat key colour you cut to alpha.
- Match it to DSOA's palette, with no purple.
- Save each source as `<id>-source.png` and the cut strip as `<id>.png` here, with the prompt and its generation id in this file.
