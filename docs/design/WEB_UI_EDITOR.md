# WEB UI EDITOR: the HUD as named rows, and the editor to move them

**Lane:** UI-EDITOR (`feat/web-ui-editor`), 2026-10-28. **Spec:** `docs/design/WEB_DEPTH_PLAN.md` §8.
**Rows:** `web/src/data/hudlayout.js` · **Live layout + editor:** `web/src/ui/hudedit.js`, `hudedit.css` · **Agent:** `hudLayout` command, `web/src/agent/hudlayout-api.js` · **Sheet:** `web/tools/hud-sheet.mjs` → `docs/renders/web/ui-editor/`
**Reference:** the LSW touch-layout editor Robert already likes (`docs/reference/lsw/touch-layout.js`).

Robert, 2026-10-28: *"a lot of the stuff that you got right now is too big on the screen... have an interactive UI editor. So I can slide stuff around where it should be, but you got to be able to also allow me to change the situation... and then you got to name the different stuff. Like, we want to standardize the UI and people get used to seeing certain things, certain places. And because it's going to be multiplayer, we have to keep in mind how things are."*

## 1. Overview

Every HUD element is a **row**: a stable id, a human name, the screen corner or edge it hangs from, an offset, its own scale, a visible flag and the **situations** it shows in. The HUD lifts each element into its own wrapper and places it from its row, so it stays anchored at any window size or aspect. The **Default** layout is 75% of the old HUD.

The **HUD editor** (F6, or EDIT HUD LAYOUT in the pause menu) pauses the game and outlines and names every element. You can drag, resize, snap, re-anchor, hide, reset and undo. A **situation strip** previews the HUD on foot, driving, as a passenger or turret gunner, on a deck, prone, in a menu, at night and dead. Four **presets** (Default, Compact, Streamer, Controller) sit under a player's own edits. A layout saves per player and exports as JSON in the rows file's own shape, so a new standard is one paste.

## 2. Player Fantasy

*The screen is mine, and the HUD is the same everywhere I look.* The world comes first: the plates sit small in the corners like gauges bolted to a dash, and nothing big sits between you and the road. A veteran knows where the cash plate is without looking, and so does the stranger in their co-op game, because every element has a name and a standard place. A streamer gets a clear corner for their camera, and a couch player gets bigger plates. Nobody has to code anything.

## 3. Detailed Rules

**3.1 Rows.** `HUD_LAYOUT` has 23 rows (ids are permanent; saves and the command use them):

| id | name | hangs from | shows in |
|---|---|---|---|
| minimap | Minimap | bottom left | all living, unpaused |
| sign | Location sign | bottom left | + menu |
| compass | Compass ribbon | top centre | living |
| objective | Orders (objective) | top left | living |
| clock | Clock, weather and wanted | top right | everywhere |
| respect | Respect chips | top right | on foot, passenger, deck, prone, night, menu |
| cash | Cash plate | top right | living + menu |
| killfeed | Kill feed | top right | living + dead |
| feed | Messages | top left | everywhere |
| status | Health and stamina | bottom left | living |
| needs | Food, water and rest | bottom left | living |
| flag | Your flag | bottom left | living + menu |
| ailments | Ailments | bottom left | living |
| telltales | Telltales (needs and ailments) | top centre | living |
| roles | Role tapes | bottom left | own-gun situations |
| breath | Breath | bottom left | own-gun situations |
| footing | Footing | bottom centre | deck, prone |
| weapon | Weapon plate | bottom right | own-gun situations |
| weaponbar | Weapon bar | bottom right | own-gun situations |
| reticle | Reticle | the pointer | living |
| speedo | Speedometer and dash | bottom right | driving, passenger |
| prompt | Action prompt | bottom centre | living |
| subtitle | Subtitles | top centre | everywhere |

"Living" means on foot, driving, passenger, deck, prone and night. "Own-gun situations" means on foot, passenger, deck, prone and night.

**3.2 What changed in the HUD.** The needs dials have their own plate (`.needs-plate`) beside the vitals plate. Before, the two were one 670 px plate, so they could not move apart. Footing on a deck has its own chip (`.footing`), so the prompt keeps showing the one verb you can use. The clock, weather and wanted stars stay one plate, because they are one painted object. The clusters `.hud-tl/-tr/-bl/-br` remain as fallbacks: an element that fails to bind stays where it was.

**3.3 Situations.** These are exclusive, and the first match wins: dead > menu (pause, map, pack) > driving > passenger (any seat but the wheel, including the turret) > deck > prone > night (on foot after dark) > on foot. They are read at 4 Hz in the HUD's slow lane. The pause menu and the map refresh them when they open or close. An element shows only when its row is visible **and** lists the current situation. The game's own hiding still applies on top (for example, the weapon plate hides whenever you're in a vehicle).

**3.4 Placement.** Each element sits in an absolutely positioned wrapper (`.hl`) with `transform: translate(x, y) scale(k)`. The wrapper reserves a minimum slot (`w`, `h`), so an empty kill feed still has a place. Inside it, the element is aligned to the anchor's side. A `ResizeObserver` re-places one element when its own size changes, and a window resize re-places them all. Nothing runs per frame. The wrappers are inserted before the vignette, so the hurt flash, the sleep screen and the dead screen still cover the HUD as before.

**3.5 The editor.**
- **Open:** F6 (the `hudEdit` row in `data/controls.js`) or EDIT HUD LAYOUT in the pause menu. Opening pauses the game. While the editor is open it owns the keys.
- **Close:** Esc, F6, ✕ or DONE. Closing restores the pause state exactly.
- **Move:** drag. Edges and centres snap within 8 px to the screen's edges and centre and to every other shown element. Hold Shift to skip snapping. Arrow keys nudge 1 px (Shift: 10 px).
- **Size:** the corner grip, the SIZE slider (40-250%), the wheel, or `=` / `-`.
- **Anchor:** a 3×3 grid of buttons. The element **stays where it is on screen**: its offset is recomputed from the new corner.
- **Hide:** the Visible checkbox, H, or Delete. A hidden element shows as a grey ghost while editing.
- **Situation:** the strip previews each situation (or LIVE). While you preview, the elements the game has hidden right now (the dash on foot, an empty prompt) are shown with their last content or a sample line, and put back exactly afterwards. "Show when <situation>" adds the selected element to that situation or removes it.
- **Reset and undo:** RESET ELEMENT, RESET ALL (it can be undone), and UNDO / REDO (Ctrl Z / Ctrl Y), 60 steps.
- **Presets:** choosing one replaces your edits (it can be undone).
- **Export / Import:** a JSON modal. An import is refused if anything in it fails `validateHudLayout`, and the refusal names the problems.

**3.6 Saving.** A player's layout is `{ preset, edits }` in `localStorage['dsoa.hudlayout']` (wrapped in try/catch). Edits hold only the fields that differ from the preset (`diffLayout`). EXPORT also includes `rows`, which is the full resolved `HUD_LAYOUT` shape.

**3.7 Multiplayer.** A layout is per player and local. It is never sent to the shard, and no other player sees it. What *is* shared is the standard: the row ids, the names, and the Default positions everyone starts from. That is how "people get used to seeing certain things, certain places" holds across a co-op session. The `situations` follow your own seat, so a passenger sees their gun plate and the dash while the driver beside them sees the dash only.

## 4. Formulas

**Layout scale** `L = fit(W, H) × hudSize × presetScale`, where `fit(W, H) = clamp(0.62, 1.35, min(W/1600, H/900))`.
- `hudSize` is the pause-menu HUD size setting: 0.8, 0.9, 1, 1.12 or 1.25.
- `presetScale` is 0.75 (Default), 0.62 (Compact), 0.70 (Streamer) or 0.85 (Controller).
- Example: at 1600×900 with Normal HUD size and Default, `L = 1 × 1 × 0.75 = 0.75`. The old HUD was 1.0, so Default is 75%. At 1280×720, `fit = 0.8` and `L = 0.6`.

**Element scale on screen** `k = L × row.scale`.

**Placement** for an anchor `(ax, ay)` ∈ {0, 0.5, 1}², a natural size `w × h` and offsets `x, y` in design px:
`left = ax·(W − w·k) + s(ax)·x·L`, `top = ay·(H − h·k) + s(ay)·y·L`, where `s(1) = −1` and `s(0) = s(0.5) = +1`. The result is then clamped to `[0, W − w·k]` (and the same vertically).
- Example: the cash plate (`tr`, x 12, y 280, 226×112) at 1600×900 under Default. `k = 0.75`, `w·k = 169.5`, `left = 1·(1600 − 169.5) − 12·0.75 = 1421.5`, `top = 0 + 280·0.75 = 210`.

**Anchor change, same spot** (`offsetFor`): `x = (ax = 1 ? W − bw − left : left − ax·(W − bw)) / L`, and the same for y.

**Resize by the grip:** `scale' = scale₀ × (1 + (dx·sx + dy·sy) / (bw + bh))`. Here `sx = −1` when the element hangs from the right, `2` when it is centred and `1` otherwise (sy likewise). The result is clamped to 0.4-2.5.

## 5. Edge Cases

- **Window smaller than the design** (below about 992 px wide, where `fit` clamps at 0.62): the clamp in `placeRect` keeps every box on screen. Boxes may then touch each other. The selftest proves 1280×720 and 2560×1440 fit *without* relying on the clamp.
- **An element bigger than the screen** (scale 2.5 on a tiny window) is pinned to its anchor's edge, never off the far side.
- **An element built after the HUD** (the compass, the weapon bar, the telltale rail) binds on the first 4 Hz tick after it exists. Until then it sits in its old place.
- **An element whose size changes while hidden** (`display: none` reports 0×0): the last real size is kept, so it reappears where it was.
- **A corrupt or hand-edited save:** `load()` validates the resolved rows. If anything is bad, the save is ignored and Default stands. The save is not deleted, so a bad hand edit can still be fixed.
- **An import that names an element this build doesn't have** is refused with the unknown ids, and nothing changes.
- **Opening the editor during the title screen:** refused, because there is no HUD yet. From the pause menu or map, it closes them first.
- **The editor is open and the player is killed:** impossible, because the game is paused while the editor is open.
- **A conversation starts:** rows with `talkHide` (the bottom plates, the prompt, the subtitle) fade out, as the clusters did before.
- **The reticle** follows the pointer. Its row controls only its scale and whether it shows (`anchor: 'mouse'`, and the validator allows that anchor only for the reticle).
- **Two rows share a slot by design:** the weapon plate and speedometer (never shown together), and the breath tab and role tapes (the HUD hides the tapes while you swim).

## 6. Dependencies

| This | Depends on / is used by | Direction |
|---|---|---|
| `ui/hud.js` | Builds the elements, creates `HudLayout` and `HudEditor`, calls `layout.apply()` on rescale and `layout.tick()` at 4 Hz; new `footing(text)`; needs plate split | both |
| `ui/qol.js` | HUD size (`hudScale`) feeds `L`. Pause menu **EDIT HUD LAYOUT** button. `toggleMenu` / `toggleMap` refresh the situation. `input()` yields to the editor and opens it on the `hudEdit` row | both |
| `data/controls.js` | New row `hudEdit` (F6, rebindable in CONTROLS) | used by qol |
| `main.js` | `hud.footing(footingText(p))` each frame. The prompt no longer carries the footing text | uses |
| `ui/feedback.js`, `ui/weaponbar.js`, `ui/telltales.js` (via `systems/survival.js`) | Build `.fb-compass`, `.kill-slot .fb-kills`, `.wbar` and `.tt-rail`; the layout lifts them by selector. **Rename a class there → update its row's `sel`** (the selftest names any row with no element) | they are used |
| `systems/decks.js`, `systems/stance.js` | `p.onDeck` and `p.prone` decide the deck and prone situations | used |
| `agent/api.js` | Spreads `hudCommands` and calls `hudChecks` after the QoL checks | uses |
| `UI_DESIGN_LANGUAGE.md` §11 (layout anchors) | That table is now **these rows**. A new HUD element is a new row here, not a new cluster | this supersedes §11 for the web HUD |
| `WEB_DEPTH_PLAN.md` §8 | The spec this delivers | — |

## 7. Tuning Knobs

| Knob | Where | Safe range | Affects |
|---|---|---|---|
| Preset scale | `HUD_PRESETS.*.scale` | 0.55-1.0 (validator: 0.3-2) | How much of the screen the HUD takes. Below 0.55 the plate text (11-12 px fonts) stops reading at 1280×720 |
| Row scale | `row.scale` / editor SIZE | 0.4-2.5 | One element against the rest |
| Row offsets | `row.x/y` | keep within the 2133×1200 design space Default sees at 16:9 (1600/0.75) | Gaps between plates. The overlap checks use these |
| Slot size | `row.w/h` | the element's real size ±20% | The drag target and outline for an empty element. The minimap-overlap check uses max(real, slot) |
| Snap distance | `SNAP` in `ui/hudedit.js` | 4-14 px | How sticky dragging feels. Above 14 it fights fine placement |
| Situation read rate | the HUD's slow lane (0.25 s) | 0.1-0.5 s | How fast the HUD changes when you get in a car. Faster costs nothing visible |
| Undo depth | `push()` (60) | 20-200 | Memory only |
| Fit clamp | `fitScale` 0.62..1.35 | unchanged from the old HUD | Small and 4K screens |

## 8. Acceptance Criteria

Named selftest checks (`selftest only=hud`, 9 checks), each returning true or a JSON diagnostic:
1. **hud layout: the rows validate, a broken row is named, and every preset names only real rows.**
2. **hud layout: every row maps to a live element in its own anchored wrapper (named, not orphaned).** All 23 ids, the selector found, the element inside a wrapper carrying its name.
3. **hud layout: set, export and import round-trip (and a bad import is refused, changing nothing).** Both the `{preset, edits}` and the rows-only shapes are tested.
4. **hud layout: Default is smaller than the old HUD.** `L(1600×900) = 0.75`. Every element draws below 0.8× the old scale, and the weapon plate is narrower than 0.8× its old width.
5. **hud layout: every preset survives 1280×720 and 2560×1440 (and 1600×900).** Every visible element is on screen without the clamp, and no element that shares a situation with the minimap overlaps it.
6. **hud layout: each situation shows its elements and hides the rest.** All 8 situations, all 23 rows.
7. **hud editor: opens paused with every element named, a drag moves one, undo puts it back, Esc closes.** This also checks that the wheel resizes and that the pause state is restored.
8. **hud editor: changing the anchor keeps the element where it is on screen.**
9. **hud: the hudLayout command lists, sets, presets, previews a situation and resets.**

The full battery must stay green twice on fresh pages, `scenario name=stress` must not regress, and ip-lint must report 0 deny. The sheet `docs/renders/web/ui-editor/` (INDEX.md) has edit mode with names on for each preset and each situation, the editor panel, the live HUD before and after, the live HUD driving, and the layout at 1280×720 and 2560×1440.
