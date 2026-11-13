# The sky above the horizon, and ceilings indoors (web engine)

**Status:** built 2026-11-12 on `feat/web-zed-sky` (on top of `feat/web-zed-vaim`).
**Asked by:** the coordinator for Robert, 11-12: "A sky above the horizon in the two new views, and a ceiling over every
indoor room so a stairwell never shows open sky."
**Files:** rows `web/src/data/camera.js` (`SKY_DOME`, `validateSkyDome`); `web/src/systems/skydome.js`;
`web/src/main.js` (constructed; updated after the camera is placed); `web/src/systems/sky.js` (`this.low`); check in
`web/src/agent/cambody-api.js` (`sky dome:`).

## 1. Overview

THIRD and SHOULDER look out at the horizon. Until now everything above it was the haze colour, one flat tone. Now there
is a sky: the haze at the horizon rising to the day's blue, a sun disc where the light actually comes from, a warm
band when the sun is low, near-black with stars and a pale moon at night. It is one dome round the lens, one draw call,
no texture, and it is drawn only in those two views.

Indoors: the two views draw the building whole (`WEB_CAMERA_BODY.md` §3.7), so the deck above you is your ceiling and
the roof is on. The stills that showed brown walls under open sky were taken before that rule; the new ones are in the
render folder.

## 2. Player fantasy

You step out of a doorway in third-person and there is a sky over the dead town, and you can tell the hour by it.

## 3. Detailed rules

1. **When:** the dome is shown only while a body view is in force and you are not below the street. Every other view
   never sees the horizon (the camera law) and draws nothing extra.
2. **Horizon:** exactly the haze colour (`sky.fog.color`), so distant ground melts into it as before.
3. **Zenith:** `day` (a dusty blue) by day; toward `dusk` when the sun is low (`duskMix`); `night` after dark. Cloud, dust
   and ash each pull it toward the haze (`murk`): under an ashfall the sky is the ash's colour.
4. **The sun and the moon:** a disc and a soft glow on the light's own direction (the same directional light that casts
   the shadows), the light's colour by day, `moon` by night, dimmed by the murk.
5. **Stars:** about a thousand, one or two pixels each, by night only, fixed in the sky (a hash of the direction), fading in as it darkens and out toward the
   horizon and under cloud.
6. **Depth:** the dome is drawn first, writes no depth and is pinned to the far plane, so everything in the world draws
   over it. It follows the lens, so it never comes nearer.

## 4. Formulas

- `colour(dir) = mix(horizon, zenith, clamp(dir.y, 0, 1) ^ lift)`, `lift` 0.38 (the blue starts low).
- `zenith = day → dusk by low × (1 − night) × duskMix → night by night → haze by murk`,
  `murk = min(1, clouds × 0.75 + dust × 0.85 + ash × 0.9)`.
- Sun disc: where `dot(dir, sunDir) > 1 − size` (`size` 0.0012: about 5° across, larger than the real sun so it reads).

## 5. Edge cases

- **Below the street:** no dome (there is no sky down there).
- **Indoors:** the dome is behind the walls and the ceiling; you see it through windows and doorways.
- **Lightning, the burning rain:** the horizon follows the haze colour, which already flashes and turns; the zenith does
  not flash.
- **Photo mode and the screenshot command's own camera** look down; if the view was THIRD or SHOULDER the dome is
  still drawn behind them (it is only ever behind everything).
- **The disc jumps at dusk:** the game's one light switches from the sun's path to the moon's in a frame, and the sun
  never goes below about 10°; the disc follows the light, so it jumps across the sky at that moment.
- **Not covered yet:** clouds as shapes (the weather only tints); the dome does not rotate with the hours (the stars do
  not wheel); a top floor's roof-access stairwell shows sky through its hatch, which is right; a ruin with no roof
  shows sky, which is right; a one-storey building's ceiling is its roof and has no rafters or lamp.

## 6. Dependencies

- `systems/sky.js` (fog colour, `night`, `low`, `cur` weather numbers, the sun light), `systems/camrig.js` (`body()`),
  `main.js` `updateCamera`.
- Draw calls: +1 in THIRD and SHOULDER only.

## 7. Tuning knobs (`SKY_DOME`)

| Knob | Value | Safe range | What it changes |
|---|---|---|---|
| `day` / `dusk` / `night` / `moon` | `#6f9fc4` / `#d8845a` / `#0b121c` / `#c9d6e4` | never purple | The zenith by hour; the moon's disc |
| `lift` | 0.38 | 0.2–1.5 | How low the blue starts above the haze |
| `duskMix` | 0.7 | 0–1 | How warm a low sun makes the sky |
| `murk.clouds / dust / ash` | 0.75 / 0.85 / 0.9 | 0–1 | How much weather hides the blue |
| `sun.size`, `sun.moon` | 0.0012, 0.7 | 0.0003–0.01 | The disc's size |
| `radius` | 1000 m | 300 to under 1200 | The dome (inside the tilted far plane) |

## 8. Acceptance criteria (selftest, `only="sky dome:"`)

1. The rows validate; a purple zenith and a dome past the far plane are each caught.
2. On TOPDOWN there is no dome. In THIRD there is one, centred on the lens, its horizon the haze colour and its zenith a
   different colour by day and near black by night. Below the street there is none. Back on TOPDOWN it is gone.

Pictures: `docs/renders/web/sky-dome/` (a street at noon and at night, before and after; the tower's third-floor
stairwell in THIRD and SHOULDER, before and after).
