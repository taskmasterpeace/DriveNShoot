# RESUME HERE: web engine (updated 2026-10-22, 11:45)

Worktree `D:/git/carworld/.worktrees/web-engine`, branch `feat/web-engine` → origin `taskmasterpeace/DriveNShoot`.
The plan is in `docs/WEB_ENGINE_PLAN.md`. The agent guide is `web/AGENTS.md`. Don't touch carworld's dirty main checkout.

## Land the 2026-10-22 session first
That session ran in an isolated app worktree (`D:/git/carworld/.claude/worktrees/animation-fix-30c929`, branch
`claude/web-engine-handoff-2fceb5`), because the desktop app's edit guard blocks writes into `.worktrees/web-engine`.
Its work is **not on `feat/web-engine` yet**. Its first commit `014493f` is only a byte-identical mirror of
`feat/web-engine@a8f9a2e`, so land everything after it. In `.worktrees/web-engine`:
```
git cherry-pick 014493f..claude/web-engine-handoff-2fceb5
git push
```

## Start it again
```
cd web && npm run agent          # dev server :3141 + headless Chrome
node tools/dl.mjs selftest       # 39/39 green (2026-10-22)
node tools/dl.mjs scenario name=stress   # 52 draw calls, 2.6 ms/frame (budget: < 150 draw calls)
```
Gotchas:
- **Vite can serve a stale transform** after rapid multi-edits. A symptom is "X is not defined" even though the import exists. Fix: `touch src/main.js`.
- **Don't keep a second game tab open** during selftest. The bridge then sees `tabs: 2` and results get scrambled.
- **The bridge's active tab is the one it saw first most recently**, so a Browser-pane tab can lose to the headless one
  even after a reload (check: `exec code=navigator.userAgent`). The `screenshot` command can't see the DOM HUD, so for
  HUD screenshots stop the headless Chrome (by PID, not by name) and drive ONE tab. Playwright `browser_take_screenshot`
  saves native-resolution PNGs; the Browser pane returns 800 px wide, too small to judge HUD text.
- Game-loop exceptions appear in `node tools/dl.mjs status` → `recentErrors` (kind `runtime`).

## Done
- Blocks A–C: vehicle damage, seats, motorcycles, throwables, diving, terrain (mesas), water, boats.
- **Block D** `547ebdd`: Iron Line freight train (`train.js`, `world/rail.js`) and Dustwolf convoys (`convoy.js`).
- **Block E (QOL sweep)** `a8f9a2e`, now verified: feedback layer (`hud`), ambient details (`ambient`, `honk`), brake
  lights, autosave, photo mode (`photo`). Those four commands are now in `web/docs/COMMANDS.md` (68 commands).
- **2026-10-22: the NaN bug is closed.** `nanGuard(phase)` now runs after every system that moves entities (player, ai,
  vehicles, train, convoy, late). Before, it ran once, after `ambient.update`, so vultures and tumbleweeds read the
  poisoned position that same frame and were never repaired. It also sanitizes NaN facing, aim and vehicle
  heading/velocity (a NaN facing was a live path to a NaN dive via `startDive`), ambient objects self-heal, and the
  report names the first phase that saw the NaN, so a recurrence bisects its own culprit. New selftest check.

## In flight: the HUD redesign (dream-loop)
- **Target:** `docs/design/hud-target-2026-10-22.jpg`, a Nano Banana 2.1 edit of the live baseline (same scene and
  layout, HUD only). Direction, "salvaged military hardware": manila ORDERS tag with a pin; engraved brass compass tape;
  riveted clock plate with stenciled WANTED stars; cash on an embossed license plate; rugged GPS bezel with screws;
  green interstate sign (street name + PHOENIX - ARIZONA); segmented blood-red HEALTH with its number; amber STAMINA;
  analog FOOD and WATER dials; sewn US flag patch; chamfered riveted ammo plate with brass cartridges and dog-tag
  weapon slots; kill feed as narrow stamped plates with real flags.
- **Loop** (achimala/dream-loop, Pro mode; installed as the `dream-loop` skill): build → capture 1600×900 →
  a fresh judge subagent scores composition / lighting / materials / details against the target → fix everything it
  lists → repeat until 8/10 or more. Baseline and target live in the gitignored `web/.dream-loop/`.
- **Constraints:** no downloaded assets, so every texture is procedural (CSS gradients, SVG `feTurbulence`, canvas
  dials). Fonts must be OFL; verified on Google Fonts: Big Shoulders Stencil (Display), Saira Stencil One,
  Allerta Stencil, Black Ops One, Share Tech Mono. FOOD/WATER dials wait on the survival block below.

## Research banked 2026-10-22 (three subagent reports, condensed)
1. **The repos Robert named are all MIT.** `achimala/dream-loop` is the fidelity loop above. `rehan-remade/universal-modder`
   is a fal / ComfyUI / Blender → top-down sprite pipeline (installed as a plugin), good for gritty props and vehicles.
   `morluto/rea` is reverse engineering: clean-room *study* only, never ship anything it extracts.
2. **10 Miles To Safety** (public sources only, nothing decompiled). It has **no real driving**: cars are loot boxes.
   Our cars as the escape and extraction tool is the differentiator. Steal the structure: a distance-to-safety spine
   with player-set pace; danger AND loot both rise with distance; day = loot, night = fortify a building (board
   windows and doors, which is also Robert's ask); a HUD that survives chaos with miles-to-safety, a nightfall
   countdown, ammo and a noise ring.
3. **Inventory + survival spec.** Weight-based containers (volume optional), prototype + instance items
   `{proto, count, dur, meta}` (durability, loaded ammo and attachments live in `meta`: that is the Dwarf-Fortress
   depth), and a small equipped loadout. NOT a Tetris grid: it fights an action game and a gamepad.
   Needs: hunger 5 and thirst 8 per game hour, faster in heat and when sprinting. At 0, drain HP and tank stamina
   regen; no instant death. STR and DEX run 1-10 with 4 as the ×1.0 baseline: carry 11 + 3.5·STR kg, melee
   ×(0.7 + 0.075·STR), max stamina 80 + 5·STR, aim sway / reload / action stamina ×(1.3 − 0.075·DEX).
   Encumbrance over 1.0 = ×0.85 move speed; over 1.25 = ×0.6 and no sprint. Licenses: GLoot (MIT) and Terasology
   (Apache-2.0) are reusable; Cataclysm DDA (CC-BY-SA) and Veloren (GPL-3.0) are study only.

## Robert's 2026-10-22 vision memo (the next blocks)
- **Hotline Miami indoors:** multiple stories, roofs, basements, doors and locks, windows that open, close, get
  boarded up and BREAK (glass), sneaking, diving; blood; gun combat.
- **Military:** bases and military vehicles. Vehicles must FEEL good: jump things, motorcycles, ATVs, and a terrain law
  (vehicles can't drive through forest).
- **Zoom out.** `Z` is binary today (33 m ↔ 72 m camera height); a scaled USA needs a multi-level zoom.
- **Gritty, grounded, realistic. Never cartoony.** The HUD is the first step (above).
- **Survival:** hunger, thirst, strength, dexterity; an inventory with Dwarf-Fortress depth (spec above).
- **Mad Max / Car Wars / Autoduel:** bolt things onto cars past a level gate; engineering; a power suit; jets;
  watercraft for rivers, lakes and streams.
- **Redo America, scaled up.** The rule: the fastest ground vehicle drives Miami→Orlando in **10 real minutes**.
  The fastest rig today is the interceptor at 46 m/s (103 mph), so 600 s ≈ 27.6 km in-game against ≈ 378 km of
  real road: **world scale ≈ 1:14** (coast to coast ≈ 2 real hours at top speed). Expressways with exits.
- A **role system** (to define with Robert).
- **Everything licensable:** OFL fonts, MIT/Apache code only, generated or owned assets.

## Next blocks
- Finish the HUD dream-loop (in flight above), then the **survival block** (needs + STR/DEX + weight inventory), which
  also lights up the HUD's FOOD/WATER dials.
- Multi-level zoom; the military layer (faction rows, a base set-piece, military vehicles as content packs).
- E, continued: turn signals, a reverse beeper, mud splash, birds scattering on the ground, a weapon wheel,
  quick-travel, a map legend.
- F: CarWorld data adapters (`game/data/*.json` → content packs) and the WarWorld soldier/AI ports.
- Then Phase 5, the CarWorld world import (usmap, Arizona first), at the 1:14 scale above.
