# RESUME HERE: web engine (updated 2026-10-22, night)

The game is **DIVIDED STATES OF AMERICA** (three.js, `web/`). The plan is `docs/WEB_ENGINE_PLAN.md`; the agent guide is
`web/AGENTS.md` (every command, the architecture map, the invariants). Don't touch carworld's main checkout
(`D:/git/carworld`): it has someone else's unfinished changes.

## Landed
`feat/web-engine` (origin `taskmasterpeace/DriveNShoot`) is at **`a242a5db`**: everything below, landed by fast-forward
from the session branch `claude/web-engine-handoff-2fceb5` (which equals it). Land later work the same way, inside
`.worktrees/web-engine`: `git fetch`, `git merge-base --is-ancestor origin/feat/web-engine claude/web-engine-handoff-2fceb5`,
`git merge --ff-only claude/web-engine-handoff-2fceb5`, push. A fast-forward lands the exact commit the selftest ran on;
a real merge (a subagent branch) gets its selftest on the merged tree, twice, on fresh pages.

## Start it again
```
cd web && npm run agent                  # dev server :3141 + headless Chrome
node tools/dl.mjs selftest               # 84/84 green (2026-10-22, fresh page, twice)
node tools/dl.mjs scenario name=stress   # ~70 draw calls; ms/frame depends on machine load - compare A/B, see below
node tools/ip-lint.mjs                   # 0 deny, 0 review
```
Gotchas (all paid for):
- **Run the selftest on a fresh page:** `exec code="(setTimeout(() => location.reload(), 50), 'reloading')"`, wait ~15 s.
  Don't edit `web/src` while it runs (vite reloads the page mid-battery).
- **Perf is an A/B, not a remembered number.** Other agents' headless Chromes moved stress from 2.2 to 4.3 ms/frame in
  one evening. Check out the previous commit inside the session worktree (`git worktree add --detach .ab-base <sha>`;
  esbuild can't walk up through `C:\WINDOWS\TEMP`), junction its `web/node_modules` to the live one (`mklink /J`), run
  it with `DL_URL=http://localhost:3150 node tools/agent.mjs`, and alternate stress runs between :3150 and :3141. Kill
  its vite and Chrome by PID afterwards, `rmdir` the junction, `git worktree remove --force .ab-base`.
- **Seeing the DOM HUD:** the `screenshot` command renders only the 3D canvas. Use Playwright: open
  `localhost:3141/?agent=0`, drive it with `window.DL.call(...)` / `window.game` in `browser_evaluate`, screenshot into
  `.playwright-mcp/` (gitignored), `browser_close` afterwards. Element shots (`target: '.weapon-panel'`) for details.
- **A dev reload restores the game state** (snapshot in sessionStorage). A bad object you created survives the reload.
- **Patch scripts:** `node -e` inside bash strips backslashes; template literals full of `${}` break when nested in
  another template. Write find/replace snippets as files and apply them (scratchpad `edits.mjs`: `{find, repl}` or
  `{from, to, repl}` per entry).
- **Selftest checks** see `C` (commands) and `g`, not `P()`: use `g.player`.
- Game-loop exceptions: `node tools/dl.mjs status` → `recentErrors`.

## What the 2026-10-22 session built (newest first)
| Area | What | Doc | Commit |
|---|---|---|---|
| Rest, sleep, bite fever | REST as a third need (sway, darkened edges, microsleeps that take the screen and the hands, at the wheel too); sleep in a bed, on a bedroll or in a parked car's seat (N) while time runs x40 and danger, pain or noise wakes you; BITE FEVER per the canon (36 game hours of taxes, antibiotics + a full night break it, never a turn, a laboured breath you can hear); a REST dial and ailment tags on the HUD; `sleep`, `fever` commands | WEB_SURVIVAL | a242a5db (+ car sleep, pending) |
| Storeys (spec) | levels as layers (`lv`), stairs as flight rows, the inside view, basements under a dark overlay, per-storey nav | WEB_STOREYS | 35906fa0 |
| Guns and rounds as things | rounds live in the pack (a view the gun code reads), gun condition, wear, jams (R clears, a round lost), broken guns, cleaning kits, Ike's bench; the dead keep their guns (a soldier's rifle is the prize); the PACK screen's slung guns | WEB_INVENTORY | 9d8e644b |
| Trade | a trader's own shelves are the counter while they're there: worth x the standing tier, refusals, daily restock; theft from an owned box to the floor closed | WEB_TRADE | 9d8e644b |
| Zoom | five zoom levels; "out of sight" (spawners, clean-ups) follows the ground on screen | web/AGENTS.md | c462d6e |
| Military (subagent) | Outpost Nine, the Federal Remnant base | WEB_MILITARY | c9f6c43 |
| Inventory 2a | every crate and shelf searchable, owned shelves (theft is a deed), lockpicks and crowbar | WEB_INVENTORY | 15afe7f |
| Interiors (subagent) | doors, locks, 493 windows | web/AGENTS.md | 318f5c2 |
| The pack | 33 items, weight + litres, uses, spoilage, PACK screen, V quick-use, searchable dead, trunks | WEB_INVENTORY | 143c8d1 |
| Morning digest, jumps, HUD, ATV, garage, survival, skills, world memory 1-4, fan service + IP, playtest fixes | see each doc | — | eac5ddd … 03011b2 |

## In flight (subagents, branches of their own)
- **Streaming P1** (`worktree-agent-a222c78142bb03d72`, worktree `.claude/worktrees/agent-a222c78142bb03d72`): streamed
  Arizona (chunks, pools, chunked collision, a nav window, I-10 with real interchanges, the usmap importer). Merged
  feat/web-engine at 9d8e644b into itself; merges into the session branch with no conflicts (preview).
- **Roles** (`feat/web-roles`, worktree `.claude/worktrees/agent-a88fa23d4f7993a96`): roles as data rows earned and lost
  by what you do (renown, tiers with hysteresis), people reacting to them, role tapes on the HUD, eight checks.
  Merging it into the session branch conflicts only in `ui/hud.js` and `ui/hud.css` (the REST dial and ailment tags vs
  the role tapes): keep both.
When each reports: review, merge into the session branch, selftest twice on fresh pages + stress A/B, land.

## Robert's answers (2026-10-22)
- **Scale:** ten minutes Miami→Orlando is **flat out**. (Still open: the MOTORCYCLE at 52 m/s or the LAWMAN at 46 as the
  reference; WEB_STREAMING uses the LAWMAN, ~1:14.)
- **Signs read miles**, and **exit ramps must feel real** (real-size ramps; the road between exits is what compresses).
- **The role system must be highly dynamic and versatile:** not a class picked once; earned and lost by what you do,
  several at once, each opening its own dialogue, jobs, prices and enemies.

## Open questions for Robert
1. Which vehicle sets the scale (bike 52 m/s or LAWMAN 46)? How far an exit's access road may run? Bigger cities?
2. **The Federal Remnant:** should it join the off-screen faction sim (skirmishes with the Dustwolves, places to lose)?
   Should storms and fog shorten a sentry's sight? Should the garrison replace its dead, and should stealing the
   ARMORED CARRIER send troopers after you?
3. **Housekeeping:** the interiors subagent left an untracked `.basecopy/` folder in
   `D:/git/carworld/.claude/worktrees/agent-a50561b0595ce1484`; it was not allowed to delete it, so it's yours to remove.

## Next blocks
- Merge and land the two subagent branches (above).
- **Multi-storey buildings and basements** (WEB_STOREYS spec; after the streaming merge: it shares collision, nav,
  city, characters, interiors).
- NPCs who sleep at night in the town's beds (night burglary: a sleeping shopkeeper sees nothing).
- **World memory phase 5, rest:** witnesses who run home to report (interceptable), rumors hopping between allies.
- The military continued (checkpoints, the Remnant in the faction sim, the answers to question 2).
- Then the power suit, jets, more watercraft.
