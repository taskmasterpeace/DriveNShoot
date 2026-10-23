# RESUME HERE: web engine (updated 2026-10-22, night)

The game is **DIVIDED STATES OF AMERICA** (three.js, `web/`). The plan is `docs/WEB_ENGINE_PLAN.md`; the agent guide is
`web/AGENTS.md` (every command, the architecture map, the invariants). Don't touch carworld's main checkout
(`D:/git/carworld`): it has someone else's unfinished changes.

## Landed
`feat/web-engine` (origin `taskmasterpeace/DriveNShoot`) is at **`5226f237`** (storeys; 112/112 twice on fresh pages): everything below, landed by fast-forward
from the session branch `claude/web-engine-handoff-2fceb5` (which equals it). Land later work the same way, inside
`.worktrees/web-engine`: `git fetch`, `git merge-base --is-ancestor origin/feat/web-engine claude/web-engine-handoff-2fceb5`,
`git merge --ff-only claude/web-engine-handoff-2fceb5`, push. A fast-forward lands the exact commit the selftest ran on;
a real merge (a subagent branch) gets its selftest on the merged tree, twice, on fresh pages.

## Start it again
```
cd web && npm run agent                  # dev server :3141 + headless Chrome
node tools/dl.mjs selftest               # 115/115 green (2026-10-22, fresh page, twice)
node tools/dl.mjs scenario name=stress   # ~70 draw calls; ms/frame depends on machine load - compare A/B, see below
node tools/ip-lint.mjs                   # 0 deny, 0 review
```
Gotchas (all paid for):
- **Run the selftest on a fresh page:** `exec code="(setTimeout(() => location.reload(), 50), 'reloading')"`, wait ~15 s.
  Don't edit `web/src` while it runs (vite reloads the page mid-battery).
- **A reload right after a long command can be lost** (the bridge answers 503 for ~25 s): confirm `game.time` is small
  before a battery (scratchpad `fresh.sh` retries until it is).
- **A long-lived headless Chrome measures stress 0.3-0.5 ms/frame slower than a fresh one:** A/B with fresh browsers
  on both sides, in ABBA order (the first A/B of the role merge read +0.5 ms; fresh browsers, ABBA: +0.15, inside
  noise; per-system timers and an on/off toggle confirmed no cost).
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
| The infected's kinds | the canon's taxonomy as rows (data/infected.js): Sprinter (a shambler until something living runs inside 20 m or a shot goes off: 6 s at 9 m/s, 3 s bent double, a shambler again), Echo (works at boarded windows and locked doors only unobserved, never advances), Choir-Touched at the dead relay mast (hum 45 m, aura x1.25 + shared target 30 m); `infected` command | WEB_INFECTED | (pending) |
| Storeys | 18 Phoenix buildings rise (30% of intact town houses one storey, 45% of the larger ruins 1-3): stairs you walk up, floors that are separate places (collision, sight, bullets, bites, reach, witnesses by floor), the floors above you hidden inside, saves keep your height; `storeys`, `teleport floor=` | WEB_STOREYS §0 | 5226f237 |
| Streamed Arizona (subagent) | WEB_STREAMING P1: chunks, pools, chunked collision, a 1 km nav window, I-10 from Los Angeles to El Paso through Phoenix with real interchanges (deceleration lanes, gores, EXIT signs in miles), mesas, convoys on the interstate, radar + big map past the island; 9 checks; 60 s flat out on the bike = 2.6 km with 0 stalls, ~73 draw calls | WEB_STREAMING §1.2 | a85b2092 |
| Long commands | the CLI and the MCP server wait out a scenario (node:http, not fetch's 300 s) | web/AGENTS.md | 61967fa6 |
| Golden hour, siege, minimap ring | the hour around sunset stays readable from above (sky fill); zombie-siege waits for the first pane; a running witness reads on the minimap | — | da4d36e3 · 51f008e5 · 1ea6cd88 |
| Word that hops | when a faction first learns a deed, the factions on speaking terms with it (relation ≥ 30) hear it secondhand 1-2.5 minutes later at cohesion x relation/100 (Rust Haven hears a drifter killing from the drifters at 0.28); no stars, one hop, a faction learns a deed once; Rust Haven and the drifters now mind each other's dead | WEB_WORLD_MEMORY §3.8 | 3a86f7b3 |
| Witnesses run home | a witness to a theft, carjack, robbery or killing runs to their people's hub to tell it (red ring on the minimap, WITNESS tag); the word lands when they arrive. Stop them: kill them (a silence), hold a gun on them (most fold: a threat in the book instead), or catch them and pay ($20 + $15 a deed's weight, x2 named). `runners` command | WEB_WORLD_MEMORY §3.7 | 25d4d3e6 |
| Roles (subagent) | ten roles you become by what you keep doing (wheelman, medic, scavenger, deputy, Dustwolf rider, trader, stunt driver, ghost, good Samaritan, butcher): renown, tiers with hysteresis, game-clock fading, standing bias, prices, refusals, greetings, jobs and offices, the role call, role tapes on the HUD, WHAT THEY CALL YOU in the pause menu | WEB_ROLES | 18745046 |
| The town sleeps | 22:00-06:00 townsfolk go to bed (a mattress near home or a floor spot of their own, on a bedroll mat); asleep they witness nothing and traders keep no counter; noise within 45% of its reach, pain, a fight or someone at the bedside wakes them | WEB_SURVIVAL | 2855e98c |
| Sleep in a parked car | N sleeps at a bed, on a bedroll or in a parked car seat (held on the handbrake) | WEB_SURVIVAL | bda48cd3 |
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

## In flight
Nothing: streaming P1 merged (a85b2092). Its own list of what P1 left out (people/traffic/loot past Phoenix, saves out
there, routes past one nav window, El Paso's at-grade crossings) is in WEB_STREAMING §1.2.

## Robert's answers (2026-10-22)
- **Scale:** ten minutes Miami→Orlando is **flat out**. (Still open: the MOTORCYCLE at 52 m/s or the LAWMAN at 46 as the
  reference; WEB_STREAMING uses the LAWMAN, ~1:14.)
- **Signs read miles**, and **exit ramps must feel real** (real-size ramps; the road between exits is what compresses).
- **The role system must be highly dynamic and versatile:** not a class picked once; earned and lost by what you do,
  several at once, each opening its own dialogue, jobs, prices and enemies.

## Open questions for Robert
1. **Scale, measured** (streaming P1): no rig reaches its row's top speed flat out on I-10 - LAWMAN 37.5 m/s (row 46),
   MOTORCYCLE 44.7 (row 52), DUNE BUGGY 35.5. Which vehicle sets the scale, and do we scale to the measured speed
   (K ~4.2 on the LAWMAN, 5.05 on the bike) or tune the driving model up to the rows? Cap exit access roads (the data's
   median is 2.7 km)? Bigger cities (towns are the Godot layout's few hundred metres)? Is I-10 ending at Los Angeles'
   first street fine until P4?
2. **The Federal Remnant:** should it join the off-screen faction sim (skirmishes with the Dustwolves, places to lose)?
   Should storms and fog shorten a sentry's sight? Should the garrison replace its dead, and should stealing the
   ARMORED CARRIER send troopers after you?
3. **Housekeeping:** the interiors subagent left an untracked `.basecopy/` folder in
   `D:/git/carworld/.claude/worktrees/agent-a50561b0595ce1484`; it was not allowed to delete it, so it's yours to remove.
   The role subagent was likewise denied `rm` for its two A/B baseline copies and moved them to the session
   scratchpad (`...\scratchpad\roles\abbase_worktree_copy`, `abbase2_worktree_copy`); they are yours to delete too.
4. **Roles** (from the role system's builder): the jump role is called **Stunt Driver** (not "Daredevil": a Marvel
   hero's name) - fine? Are the paces right (Medic rumoured after 3 patients, known after ~7; Wheelman ~10 minutes of
   fast driving to rumoured)? Fast time (T) fades roles 40x faster in real time because fading runs on the game clock -
   keep it? Should the Federal Remnant get a role (a contractor)? Are permanent bars (the deputy's four-killings gate)
   wanted?

## Next blocks
- Storeys v2: basements, shooting between floors through windows, noise and blasts through floors (WEB_STOREYS §0.4).
- **Then the Phoenix ring** (Robert, 2026-10-22: metros ~3 km, cities ~1.5 km, holdouts as they are; WEB_STREAMING
  decision 5): the 920 m island stays downtown, a generated living ring out to ~1.5 km, then LA, El Paso, the cities.
- **bounty-run no longer completes** (critic sweep, 2026-10-22): 3/6 kills, $0. The game outgrew the scenario - Ike
  asleep behind a locked door at night (it retried for game days), walking into a firefight, every camp empty on a full
  lap (the faction sim moves the Dustwolves), `walk` while still in a car. Make it play like a person (wake/kick, engage,
  find live Dustwolves through `map`/`query`, exit before walking) so it's a real end-to-end check again.
- Merge and land the two subagent branches (above).
- **Multi-storey buildings and basements** (WEB_STOREYS spec; after the streaming merge: it shares collision, nav,
  city, characters, interiors).
- World memory phase 5 is complete (witnesses who run home, word that hops).
- The military continued (checkpoints, the Remnant in the faction sim, the answers to question 2).
- Then the power suit, jets, more watercraft.
