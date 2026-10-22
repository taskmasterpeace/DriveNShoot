# RESUME HERE: web engine (updated 2026-10-22, late)

The game is **DIVIDED STATES OF AMERICA** (three.js, `web/`). The plan is `docs/WEB_ENGINE_PLAN.md`; the agent guide is
`web/AGENTS.md` (every command, the architecture map, the invariants). Don't touch carworld's main checkout
(`D:/git/carworld`): it has someone else's unfinished changes.

## Landed
The 2026-10-22 session is on `feat/web-engine` and pushed (`a8f9a2e..866d3ef`): the merge `d486d05` (byte-identical to
the session branch for `web/` and `docs/`), then two fixes found by running the selftest on the landed tree:
`5a9abea` (no director threats in the first 150 s of play: a raid could hit Rust Haven 20 s into a new game; the raid
check stages around pacing) and `866d3ef` (selftest staging cancels director events already running). 73/73 on the
landed tree, twice (once with a live raid out before the battery, once started 30 s after boot); stress 67 draw calls,
2.5 ms/frame. The session branch `claude/web-engine-handoff-2fceb5` now equals `feat/web-engine`; keep working there
and land with `git merge --ff-only claude/web-engine-handoff-2fceb5` inside `.worktrees/web-engine`.

## Start it again
```
cd web && npm run agent                  # dev server :3141 + headless Chrome
node tools/dl.mjs selftest               # 73/73 green (2026-10-22, fresh page, several runs)
node tools/dl.mjs scenario name=stress   # 68 draw calls, ~2.4 ms/frame (budget: < 150 draw calls)
node tools/ip-lint.mjs                   # 0 deny, 0 review
```
Gotchas (all paid for):
- **Run the selftest on a fresh page:** `exec code="(setTimeout(() => location.reload(), 50), 'reloading')"`, wait ~15 s.
- **One game tab.** The bridge is sticky to the tab that has the job; a second tab (the Browser pane) sits on standby,
  so commands keep going to the headless tab. To look at the DOM (the HUD, the PACK screen) open the pane at
  `localhost:3141/?agent=1` and drive *that* page with the Browser tool's JavaScript (`window.DL`, `window.game`);
  the `screenshot` command only renders the 3D canvas. Close the pane tab afterwards.
- **A dev reload restores the game state** (snapshot in sessionStorage). A bad object you created survives the reload
  with it (a character with no colours broke every frame once; `addChar` now paints anyone unpainted).
- **Patch scripts:** `node -e` inside bash strips backslashes (`\b` became a backspace byte in a regex once). Write
  scripts and code snippets to files and splice them in; the Edit tool is fine on CRLF files.
- **Vite can serve a stale transform** after rapid multi-edits ("X is not defined" with the import present):
  `touch src/main.js`.
- Game-loop exceptions: `node tools/dl.mjs status` → `recentErrors`.

## What the 2026-10-22 session built (newest first)
| Area | What | Doc | Commit |
|---|---|---|---|
| Inventory 2a | every crate and shelf in a building is searchable (114), shopkeepers own theirs (taking is a `steal` deed the owner remembers), lockpicks (silent) and crowbar (loud) work the locks | WEB_INVENTORY | 15afe7f |
| Interiors (subagent) | a door in every doorway (swing, bash, 12 locked: kick, shoot, blast), 493 windows (crack, shatter, climb, board up) | web/AGENTS.md | 318f5c2 |
| The pack | 33 item rows (water, food, meds, tools, parts, packs, valuables), weight + litres, uses, spoilage on the game clock, tools need tags; PACK screen (I/Tab); V quick-use; searchable dead; trunks; ground piles; tools act on cars | WEB_INVENTORY | 143c8d1 |
| Morning digest | STATIC 1660 AM reads yesterday back at dawn; witnessed feats join the legend | WEB_WORLD_MEMORY | 5be7ef7 |
| Jumps | ramps/berms/tables as rows, ride-height springs, takeoff by physics, landings graded by closing speed; the Thrill Show (Wreck Row, the Table, the Whoops) and the Dunes; named jumps pay and are told about | WEB_JUMPS | eac5ddd |
| HUD (subagent) | the stamped-steel HUD to the dream target: ORDERS tag, brass compass, riveted clock/wanted, licence-plate cash, GPS bezel, street sign, segmented vitals, food/water dials, cloth flag, cartridge weapon plate, analog dash, respect chips | web/AGENTS.md | 76b5ff1 |
| ATV, garage | a quad you sit like a bike; armour by facing, a hood gun, oil/caltrops/smoke off the tail (Kenji) | web/AGENTS.md | 4a15a58, b893e3f |
| Survival, skills | water and food on the game clock (pips, effects); STR/DEX/END grown by doing; carried weight | web/AGENTS.md | 558148b, 2747de5 |
| World memory 1-4 | deeds, witnesses, rumors, factions, the chronicle; people remember (refusals, vendettas); the director (hunters, raids, radio); the faction sim (the world moves without you) | WEB_WORLD_MEMORY | a406754 … 55e9a43 |
| Fan service + IP | the clean-room bible (what crosses the wall), the streaming spec (the USA at 1:14), ip-lint | WEB_FAN_SERVICE_BIBLE, WEB_STREAMING | 484df92, 90fb173 |
| Playtest fixes | gun centred in the hand, every window detailed, cars steer about the rear axle, lights leave the lamps; people rebuilt (knees, elbows, planted boots, a gun per weapon); vehicle bodies and glass that read from above | — | 03011b2, aa501f7, a40291e |

## Robert's answers (2026-10-22)
- **Scale:** ten minutes Miami→Orlando is **flat out**. (Still open: the MOTORCYCLE at 52 m/s or the LAWMAN at 46 as the
  reference; WEB_STREAMING uses the LAWMAN, ~1:14.)
- **Signs read miles**, and **exit ramps must feel real** (real-size ramps; the road between exits is what compresses).
- **The role system must be highly dynamic and versatile:** not a class picked once. Direction until it gets a spec:
  roles are earned and lost by what you do (deeds, skills, standing, jobs), several can be held at once, and each one
  opens its own dialogue, jobs, prices and enemies - the world memory, skills and faction layers are its raw material.

## Open questions for Robert
1. Which vehicle sets the scale (bike 52 m/s or LAWMAN 46)? How far an exit's access road may run? Bigger cities?
2. **Housekeeping:** the interiors subagent left an untracked `.basecopy/` folder in
   `D:/git/carworld/.claude/worktrees/agent-a50561b0595ce1484` (a baseline copy for its A/B). It was not allowed to
   delete it, so it's yours to remove (or let the app clean up the worktree).

## Next blocks (from the 2026-10-22 memo, in a sensible order)
- **A military base:** a subagent got most of the way before the session ended. Its branch
  `worktree-agent-a32f586079c0fca88` (worktree `.claude/worktrees/agent-a32f586079c0fca88`) has four commits - military
  vehicles as rows (a patrol truck, an armored carrier), the Federal Remnant faction and soldiers, **Outpost Nine** (a
  fenced base in the north-west Glass Flats), a `base` command with five checks - plus uncommitted edits to `api.js`,
  `society.js`, `bases.js` and `hud.js`. Not merged and not verified: resume the agent (or finish it here), then merge.
- **Inventory 2b:** guns and rounds as items (condition, jams), trade at standing-adjusted prices, a portable radio
  item, refilling bottles and fuel cans, search time and its noise.
- **Multi-level zoom** (Z is binary today) and **multi-storey buildings / basements**.
- **World memory phase 5, rest:** witnesses who run home to report (interceptable), rumors hopping between allies.
- **The USA at scale:** WEB_STREAMING phase P1 (the I-10 corridor out of Phoenix).
- Then the power suit, jets, more watercraft, the role system (after question 3).
