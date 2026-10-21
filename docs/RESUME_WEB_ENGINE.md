# RESUME HERE: web engine (paused 2026-10-21)

Worktree `D:/git/carworld/.worktrees/web-engine`, branch `feat/web-engine` → origin `taskmasterpeace/DriveNShoot`.
The plan is in `docs/WEB_ENGINE_PLAN.md`. The agent guide is `web/AGENTS.md`. Don't touch carworld's dirty main checkout.

## Start it again
```
cd web && npm run agent          # dev server :3141 + headless Chrome
node tools/dl.mjs selftest       # last run: 38/38 green (before the NaN sentinel was added)
```
Gotchas from this session:
- **Vite can serve a stale transform** after rapid multi-edits. A symptom is "X is not defined" even though the import exists. Fix: `touch src/main.js`.
- **Don't keep a second game tab open** (for example the Browser pane at localhost:3141). The bridge then sees `tabs: 2` and selftest results get scrambled. Close it before running tests.
- Game-loop exceptions now appear in `node tools/dl.mjs status` → `recentErrors` (kind `runtime`).

## Done (all pushed except the last block)
- Blocks A–C: vehicle damage, seats, motorcycles, throwables, diving, terrain (mesas), water, boats.
- **Block D** `547ebdd`: Iron Line freight train (`train.js`, `world/rail.js`) and Dustwolf convoys (`convoy.js`).
- **Block E (QOL sweep), committed as WIP and not fully verified:**
  - `ui/feedback.js`: damage-direction arcs, kill feed with flags, floating loot text, flag name tags, compass ribbon, blood on the lens, low-ammo flash, heartbeat. Agent command: `hud`.
  - `systems/ambient.js`: tyre tracks, dust trails, brass casings, tumbleweeds, vultures, horn makes people dive aside (`honk`), civilians cower with hands up. Agent command: `ambient`.
  - Per-vehicle brake lights (`vehicles.js`). Autosave every 3 minutes when calm, plus "Load autosave" in the pause menu. Photo mode (K, or the `photo` command). Updated title and pause control lists.
  - `Game.nanGuard()` in main.js: restores and reports any non-finite position.

## Open issue being chased when paused
- **Player position became NaN** once during a manual run. The sequence: setTime 16, teleport -200,-250, spawn a buggy and drive it, exit, spawn a raider nearby, `fire id=hostile` ×6, step 8. That left vultures with NaN positions and tumbleweeds stuck far away. A second run did not reproduce it.
  The new `nanGuard` now reports `NaN position on <id> ...` with context. Re-run that sequence, check `status`/`game.errors`, and fix the root cause.
- After that fix: re-run selftest (expect 38+), then `scenario name=stress` (budget under 150 draw calls; it was 49), then `node tools/gen-commands.mjs`, update AGENTS.md (feedback/ambient/photo/hud/honk commands), and commit and push.

## Next blocks (from the plan)
- E, continued: turn signals, a reverse beeper, mud splash, birds scattering on the ground, a weapon wheel, quick-travel, a map legend.
- F: CarWorld data adapters (`game/data/*.json` → content packs) and the WarWorld soldier/AI ports.
- Then Phase 5, the CarWorld world import (usmap, Arizona first).
