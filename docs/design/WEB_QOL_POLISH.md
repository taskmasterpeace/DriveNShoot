# DSOA web engine — the 2026-10-27 polish pass (20 quality-of-life items)

**Status:** built on `feat/web-qol`. **Owner:** Robert. **Files:** `web/src/ui/qol.js`, `web/src/ui/feedback.js`,
`web/src/ui/hud.js` (one line), `web/src/ui/hud.css`, `web/src/systems/combat.js` (one hook line),
`web/src/agent/qol-selftest.js`, `web/src/agent/api.js` (the `qol` command + the battery call).

## 1. Overview
Twenty small things a player feels every minute. Each is low-code, sits in the HUD/QoL layer, and is a setting where a
player might disagree.

| # | Item | Where |
|---|---|---|
| 1 | Damage numbers float off whoever you hit (gold on a head shot) — setting | feedback `damage()`, combat hook |
| 2 | THIS RUN in the pause menu: time played, km on foot, km driven, $ earned, $ spent, kills, deaths | qol `trackRun`, `renderRun` |
| 3 | Quick load / Load autosave say how long ago they were written ("3 min ago", survives reloads) | qol `stampSave`, `renderAgo` |
| 4 | Autosave interval setting: Off / 2 / 3 / 5 / 10 min | qol settings `autosaveMin` |
| 5 | Pause when the window loses focus (default on; never on an agent tab, never over the title) | qol blur listener |
| 6 | Mute when the window loses focus (default off) | qol blur/focus listeners |
| 7 | F1 hides/shows the whole HUD (also a pause-menu button) | qol `toggleHud` |
| 8 | HUD size setting (Small 0.8 → Huge 1.25) multiplying the screen-fit scale | hud `rescale` |
| 9 | Name tags setting: near your aim (old) / everyone close / off (witnesses always tagged) | feedback `updateTags` |
| 10 | Kill feed on/off | qol `apply`, feedback `killRow` |
| 11 | Reset settings to defaults | pause menu |
| 12 | RECENT: the last 14 messages with the game clock, in the pause menu | qol toast wrap, `renderLog` |
| 13 | The ORDERS tag is a button: click opens the map, right-click clears your waypoint | qol |
| 14 | ETA on the ORDERS distance line (~m:ss by car or on foot) | qol `eta` |
| 15 | Reaching a waypoint says ARRIVED (instead of "Waypoint cleared") | qol `setWaypoint(…, true)` |
| 16 | Compass marks your parked car (CAR + metres) while you're on foot and >14 m away | feedback `updateCompass` |
| 17 | Low-health edge: under 30% HP the screen edge pulses red (with the existing heartbeat) | feedback `.fb-vig` |
| 18 | Empty gun + auto-reload off: a blinking "R RELOAD" | feedback `.fb-reload` |
| 19 | Cash changes rise off the cash plate (+$40 green / −$15 red) | qol `cashDelta` |
| 20 | Big map: a legend in the header and the waypoint's straight-line distance beside it | qol `drawWaypoint` |

## 2. Player Fantasy
The game never makes you guess: what you hit, how far, how long, where your car is, when you last saved, what just
happened while you were reading the map.

## 3. Detailed Rules
- Settings persist in `localStorage['dsoa.settings']` like the old ones; save times in `dsoa.saveTimes`.
- THIS RUN ignores position jumps > 40 m in one frame (teleports, respawns, loads).
- The toast wrap keeps the HUD's `toast()` behaviour exactly; it only records `{text, kind, at}` first.
- The blur pause opens the pause menu (so resuming is one click/Esc), and only when no dialogue or photo mode is open.

## 4. Formulas
- ETA `t = len / v`; car `v = max(8, 0.7 · VEHICLES[type].maxSpeed)` m/s; foot `v = 4.2` m/s.
  Example: LAWMAN (46 m/s) and a 1.2 km road route → v = 32.2 → t = 37 s → "~0:37".
- HUD scale `--s = clamp(min(W/1600, H/900), 0.62, 1.35) · hudScale`. Example: 1920×1080 at Large → 1.2 · 1.12 = 1.344.
- Autosave fires when `autoT > autosaveMin · 60` and the moment is calm (alive, nobody targeting you, no dialogue).

## 5. Edge Cases
- Agent tabs (`?agent`) never pause or mute on blur (headless batteries keep running).
- A head shot shows the rounded post-armour damage, not the raw roll.
- Autosave set to Off: the timer still counts but never writes.
- A destroyed parked car is never marked.

## 6. Dependencies
`ui/hud.js` (toast, rescale, cash plate) · `ui/feedback.js` (floaters, compass pool, now 4 markers) ·
`systems/combat.js` (`damage()` calls `g.feedback.damage`) · `systems/vehicles.js` (`VEHICLES` for ETA) ·
`agent/api.js` (`qol` command). The camera lane's new views must keep `g.feedback.screen()` working (it projects
through `g.camera`).

## 7. Tuning Knobs
| Knob | Default | Safe range | Effect |
|---|---|---|---|
| `LOG_MAX` | 14 | 8–30 | RECENT length |
| `FOOT_MPS` | 4.2 | 3–6 | on-foot ETA |
| car ETA factor | 0.7 | 0.5–0.9 | road ETA |
| CAR marker min distance | 14 m | 8–30 | when the compass starts marking your car |
| low-HP threshold | 30% | 20–40% | vignette + heartbeat |

## 7b. Item 21: the pause menu is TABS
GAME · YOU · LOG · SETTINGS · CONTROLS, one pane at a time (Q/E cycle while paused), settings in two columns; no scrolling at 1080p. Other systems add tabs with `g.qol.addTab(id, label, render)` (insurance, crew, journal).

## 8. Acceptance Criteria
The 14 `qol:` checks in `web/src/agent/qol-selftest.js` (run with `selftest only=qol:`), each named after what it proves,
plus a full battery green twice on fresh pages. Renders: `docs/renders/web/qol/`.
