# RESUME HERE: web engine (updated 2026-10-22, late)

The game is **DIVIDED STATES OF AMERICA** (three.js, `web/`). The plan is `docs/WEB_ENGINE_PLAN.md`; the agent guide is
`web/AGENTS.md` (every command, the architecture map, the invariants). Don't touch carworld's main checkout
(`D:/git/carworld`): it has someone else's unfinished changes.

## Land the 2026-10-22 session first (needs Robert's OK)
All of it lives on branch `claude/web-engine-handoff-2fceb5` (app worktree `D:/git/carworld/.claude/worktrees/
animation-fix-30c929`), **not on `feat/web-engine` yet**. Its first commit `014493f` is a byte-identical mirror of
`feat/web-engine@a8f9a2e`'s `web/`; everything after it (45 commits, two of them merges of subagent branches) is new.
Cherry-picking the range no longer works (it contains merges). Merge instead; this was dry-run with
`git merge-tree --write-tree -X theirs feat/web-engine claude/web-engine-handoff-2fceb5` and the result is
byte-identical to the branch for `web/` and `docs/`:
```
cd D:/git/carworld/.worktrees/web-engine
git status                      # must be clean
git merge -X theirs claude/web-engine-handoff-2fceb5 -m "merge: the 2026-10-22 session"
cd web && npm run agent         # then, in a second shell:
node tools/dl.mjs selftest      # expect 73/73
git push
```

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

## Open questions for Robert
1. **The scale rule's "fastest ground vehicle":** the MOTORCYCLE tops out at 52 m/s, the LAWMAN at 46. WEB_STREAMING
   assumed the LAWMAN (Miami→Orlando in 10 real minutes ⇒ ~1:14). Which one, and flat-out or a typical trip?
2. **Exit roads:** how long an exit ramp runs and what units the signs use (miles, like real US signs?).
3. **The "role system"** from the memo: what is a role (a job you take, a class you are, a crew position)?
4. **Housekeeping:** the interiors subagent left an untracked `.basecopy/` folder in
   `D:/git/carworld/.claude/worktrees/agent-a50561b0595ce1484` (a baseline copy for its A/B). It was not allowed to
   delete it, so it's yours to remove (or let the app clean up the worktree).

## Next blocks (from the 2026-10-22 memo, in a sensible order)
- **A military base** (now unblocked: doors and locks exist): fenced compound, watchtowers, an armory behind a steel
  door, a motor pool (military vehicles as rows), soldiers as a faction row, `military` loot already in data/items.js.
- **Inventory 2b:** guns and rounds as items (condition, jams), trade at standing-adjusted prices, a portable radio
  item, refilling bottles and fuel cans, search time and its noise.
- **Multi-level zoom** (Z is binary today) and **multi-storey buildings / basements**.
- **World memory phase 5, rest:** witnesses who run home to report (interceptable), rumors hopping between allies.
- **The USA at scale:** WEB_STREAMING phase P1 (the I-10 corridor out of Phoenix).
- Then the power suit, jets, more watercraft, the role system (after question 3).
