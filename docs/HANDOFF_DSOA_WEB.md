# HANDOFF: DIVIDED STATES OF AMERICA (web build), 2026-10-30

Paused by Robert on 2026-10-30 at about 9 AM ("We're going to be done with it for right now"). Everything is committed and
pushed. Nothing is running: no lead loop, no batteries, no game servers, and every lane is idle. This doc is where a future
session starts.

Repo: **https://github.com/taskmasterpeace/DriveNShoot**. The game is `web/` (three.js). The Godot build in `game/` is reference only.

## 1. Read these first (in order)

1. **`docs/design/WEB_LIVING_WORLD_GOAL.md`**: the approved goal (Robert, 2026-10-30): 12 world targets, 10 game goals, and
   gates in order with **no dates**. Every new lane brief names the T/P numbers it moves.
2. **`docs/design/WEB_DEPTH_PLAN.md`**: the laws (§0; never break them), the run loop, the lanes, the Version 2 roadmap (§10),
   and the parked room-scan base (§9).
3. `web/AGENTS.md` and `web/CLAUDE.md` (the agent API, `node tools/dl.mjs`, scenarios), then `docs/design/INDEX.md` (81 WEB_*.md
   design docs, 8 sections each).
4. The lead playbooks: `.claude/skills/dsoa-land/SKILL.md` (landing) and `.claude/skills/dsoa-lane/SKILL.md` (briefing a lane).

## 2. The laws (short form; full text in WEB_DEPTH_PLAN §0)

1. Nobody cheats: no teleports, no free supplies; NPCs carry real items, keys, fuel and ammo.
2. No loot regeneration: a container rolls once; restock only by a visible delivery.
3. The world clock runs only while someone is logged in.
4. Our own world: genre problems, **never Deathlands names, slang, characters or plot**. `node tools/ip-lint.mjs` must show 0 deny.
5. Multiplayer first.
6. Nobody knows what they weren't told: facts carry a source and an age.
7. Tooling over hand-tuning: rows, a `validate*`, and a forge surface.

Robert's own rules: **no purple ever**; a **real flag on every person** (worn on the shoulders in-world; big on cards, the talk box
and rosters); portraits are the **real in-game model**; no "Co-Authored-By" lines in commits; kill processes **only by exact PID**.

## 3. Where the code is

| Branch | Commit | What it is |
|---|---|---|
| `main` | `ca1d5c4d` | The last landed state (2026-10-29 afternoon). |
| **`integrate/deathlands`** | **`b33166da`** | **Everything since**, waiting for its landing battery (§5). Includes: your 8:45 PM play build (melee, police/SWAT, body doll + Pack, timed actions, gunfire reactions, moves/boats/towing, burial fix, timing fixes, photo tour), casinos, camps/bases/houses, calibers + forensics, every playtest fix (classic steering incl. the pause-menu setting, new character screen, plain HUD names, keys/focus/R, real-model portraits, flags on shoulders, headlights light people, shot readability + more ammo, sprinters chase, the sound pass), feel harness, long road, fan nods, the semis fix, the Test Lab page, and the goal doc. |
| `play/latest` | `64f1df28` | The frozen copy Robert played in the Test Lab (`D:/git/DriveNShoot/.worktrees/play`, `PLAY-DSOA.bat`, port 3400). |
| `feat/web-look-feel` | `422e87bc` | **Not merged yet:** 48-minute day (a setting: 12/24/48/96), night default 0.35, long dusk, a Brightness slider, and the torch beam from the hand or gun instead of the feet. |
| `feat/web-testlab` | `b00fbb1e` | **Not merged yet:** 8 new playable Test Lab scenarios (towing/boats, semis, melee yard, casino night, long road, police, moves, body doll) and photo-booth lineups that step along their row. 13 checks pass. |
| `feat/web-world-tools` | `8514ed7a` | **Paused mid-lane:** travel math + stamp tools (region, city, neighbourhood/gated community, exits, rural buildings, military base per state). Code, data and doc are done; tested in node only. Not done: the in-game Georgia pass, screenshots, batteries. |
| `feat/web-seasons` | `ed6a8284` | A compressed year by latitude (snow, grip, forage, forecasts); owns the calendar API. Needs batteries. |
| `feat/web-horses` | `48b678aa` | Riding, feed, water, saddlebags, theft, wild herds. Needs batteries. |
| `feat/web-crafting` | `daa18d41` | The recipe engine: benches, tool wear. Needs batteries. |
| `feat/web-farming` | `fbffc391` | House garden, watering, blight, chickens, cooking (37 checks). Must merge seasons first. |

The integrate worktree is `D:/git/DriveNShoot/.worktrees/integrate`. Lane worktrees are under `D:/git/DriveNShoot/.claude/worktrees/`.

## 4. The order to resume (this is gate G0 of the goal)

1. **Land `integrate/deathlands` on main.** The last run (`b33166da`'s parent `64f1df28`) passed **774/786**. The misses:
   - Scripted-driving checks: road chain, buried mine, nitrous, harpoon winch, hub spikes, the steep I-10 climb. They pass **alone**, so they're order or state flakes. The feel lane found and fixed one leak (god mode switched off by its gun check); look for more.
   - `steering: left is screen-left`: it now needs to set the screen mode itself, since classic steering is the default.
   - hordes radio report, back-lots fence, understreet manhole, react parent-to-child, crew FOLLOW.
   Fix what fails twice, rerun two batteries, and fast-forward main.
2. Merge `feat/web-look-feel` and `feat/web-testlab`, then run a battery.
3. Land seasons, then farming, then horses and crafting, one at a time, each with a battery.
4. Resume world-tools (G1): the Georgia or Alabama pass with tools only, travel math within ±15% on 5 city pairs.
5. Build the audit commands the goal names (`worldAudit`, `cheatAudit`, `knowledgeAudit`, `stockLedger`) so the pane shows real numbers.

## 5. How to run batteries here (paid-for lessons)

- **Use `scratchpad/lead/battery2.sh <tag>`** (integrate worktree): two runs, each on a **freshly launched Chrome**.
  `location.reload()` once hung the page for good. Budget: `{"budget":5400}` and `timeoutMs 5600000`. The suite is about 786
  checks and needs more than 50 minutes under load.
- **Never edit `web/src` in the integrate checkout while a battery runs.** Vite reloads the page and the run dies (done by
  mistake on 10/30). Make quick fixes in the play copy or on a lane branch.
- **Breadcrumbs:** `scratchpad/lead/crumbs.json` (battery2.sh reads `/tmp/crumbs.json`; copy it there first) posts the latest check name to
  `/agent/client-error` as `kind: progress` every 2 s. Then `curl localhost:3410/agent/status` shows where a run is, and where it
  died. During a selftest the page doesn't poll, so `connected:false` is normal.
- **Stopping a harness:** TaskStop on `node tools/agent.mjs` does NOT kill its vite and Chrome. Record the PIDs at launch
  (`scratchpad/lead/harness-pids.txt`) and kill exactly those (`scratchpad/lead/relaunch.ps1` finds the lead's own :3410 Chrome
  and agent by command line). Three stale tabs on one port froze a whole night's battery.
- **CPU:** at most about 4 lanes running batteries at once. About 15 at once made every battery time out. Lanes run only their
  own checks (`only=`); the lead runs the combined battery.
- **Merging:** `scratchpad/lead/merge_int.sh <lane...>` merges `origin/feat/web-<lane>` and auto-resolves add/add conflicts.
  Real overlaps (two lanes rewriting the same function) go back to the lane that knows the code.

## 6. What Robert sees

- **Status pane** (a Claude Code mod): `C:/Users/taskm/.claude/dev-mods/7ccde5c4-.../dsoa-status/`. It reads
  `integrate/docs/status/dsoa-status.json` and has priorities (P1-P4 badges, ▲▼⏫, 🎯 Focus, 📨 send) saved to
  `docs/status/priorities.json`. Only the pane writes that file. The status JSON is untracked; lead scripts in
  `scratchpad/lead/` (status_live.py, patch_*.py) update it. A guide for using the pane in any project is `D:/git/PROJECT-STATUS-MOD.md`.
- **Test Lab:** `http://localhost:<port>/testlab.html`. Every scenario is a card (PLAY / WATCH / LOOK); `?scenario=<name>` skips
  the title. Start the play copy with `PLAY-DSOA.bat` in `.worktrees/play`, or preview_start `dsoa-play` (D:/git/.claude/launch.json).
- **Open questions in the pane:** "the improved trains" (unclear voice note), sovereign, the bus start, VR "what if you could play it…",
  the hud-protos, pulls-next and the dot-thing.

## 7. Robert's playtest notes not yet confirmed fixed in play

- Cars "drive backwards depending on direction": fixed (the pause-menu steering setting overrode the default). Not yet driven by Robert.
- "Very very dark", "time goes too fast", "the light comes from his feet": fixed on `feat/web-look-feel`, not merged.
- Sound "horrible": the sound pass replaced all 219 BBC/Gamemaster files with Sonniss/CC0 (443 files). Not yet heard by Robert.
- "Is everything just built but not put together?": the Test Lab answers it; 8 more scenarios wait on `feat/web-testlab`.
- Known small bugs: holding the sword cane offers "CANE BLADE" as a separate weapon in the cycle. Ike sometimes keeps his counter
  open asleep (the bedside-wake cause is ruled out; the check now logs his wakes).

## 8. Decisions on record

- Feature freeze: the Version 2 list (WEB_DEPTH_PLAN §10) stays roadmap, except the green-lit horses, seasons, house and garden,
  crafting and fan nods.
- World-building tools were green-lit (10/30) to run after the main landing; the country opens only after the tools and travel math.
- Order after v1: persistent server, then **VR**, then **mobile last** (Google phones, landscape, tested by emulation).
- The room-scan base is parked until Robert says go.
- Fan nods: real-world objects and genre situations only (a tinted-glass room, an antique two-barrel revolver and a sword cane,
  a broad jungle blade, a lapel rad badge, an armoured trade convoy, an orange-green burning storm, January calendars,
  self-heating rations). No names.

## 9. The lead's scripts

`scratchpad/` is gitignored. Copies of the lead scripts are kept in **`docs/lead-tools/`**: battery2.sh, relaunch.ps1,
merge_int.sh, resolve_additive.py, crumbs.json and status_live.py. To use them, copy them to `scratchpad/lead/` in the integrate
worktree (their paths point there), and `crumbs.json` to `/tmp/`.
