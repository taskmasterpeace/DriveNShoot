---
name: dsoa-land
description: Use when merging a lane branch into the DIVIDED STATES OF AMERICA web game (carworld/web), running the selftest battery, chasing a check that fails only in the full battery, or landing to feat/web-engine / main. Covers the merge recipe (no-dedupe conflict resolution), the battery script, the flake policy, stage() neutrality, and the fast-forward landing.
---

# Landing a branch in DSOA (the lead's playbook)

The web game lives in `web/` (three.js). Work happens on lane branches (`feat/web-<lane>`), gets merged onto the
session branch, proven by the selftest battery, then fast-forwarded to `feat/web-engine` and `main`.

## 1. The harness
- `cd web && npm run agent` (background) serves the game on **:3141** with a headless Chrome tab. CLI: `node tools/dl.mjs <cmd>`.
- Every agent/lane harness uses its OWN port (`DL_URL=http://localhost:34xx` on EVERY call: an unset one hits :3141).
- If `dl.mjs status` says `connected: false` for minutes, the headless page hung: TaskStop the harness, kill its
  `agent.mjs`, vite and chrome **by exact PID** (never by pattern: every harness Chrome has a `dsoa-` profile), restart.
- A tab you open in your own browser on :3141 does not steal commands while the headless tab is alive.

## 2. The battery
- Selftest is the gate: `node tools/dl.mjs selftest` (budget 1800 s; ~280 checks, ~10 min on a loaded machine).
  `only=a|b|c` runs matching checks in battery order; `skip=` runs all but them.
- Always on a FRESH page (reload, confirm `game.time < 40`): keep the lead's scripts in `scratchpad/lead/`
  (`fresh.sh`, `battery.sh <tag>` = two runs). Agents share the scratchpad root and will overwrite anything there.
- **Never edit `web/src` while a battery runs** on the same harness: vite reloads the page and kills the run.
- Write commit and docs-only changes outside `web/` freely during a battery.

## 3. Merging a lane
1. `git merge --no-ff feat/web-<lane>`. Conflicts in `api.js`, `main.js`, `chunkgen.js`, `worldindex.js` are normal.
2. Recreate with `git checkout --conflict=diff3 <file>` (clean block boundaries), then resolve **whole blocks**:
   concatenate ours+theirs for additive blocks (imports, commands, checks, save fields). **Never dedupe lines** in code:
   a repeated `});` or `await stage();` dropped from theirs is silent corruption.
3. Real choices (two lanes solved the same thing: reverse speed, steering, water, a species): pick one law, keep the
   other's useful factor, and write the decision in the merge commit message.
4. Generated files: `docs/COMMANDS.md` take ours, then regenerate from the LIVE page (`node tools/gen-commands.mjs`,
   wait ~20 s after a vite.config change). `src/data/usmap.json`: re-run `node tools/import-usmap.mjs` (it carries
   World Forge edits over).
5. Prove nothing was lost: every `await check('...` name on either side is in the result
   (`comm -23 side.txt result.txt` must be empty). `node --check` every touched file. Boot: `game.errors` empty.

## 4. When a check fails only in the full battery
It is almost always STATE an earlier check left, not the newest merge. Find it fast:
- Run the failing check alone (`only=`). Passes alone → order problem. Then `only="<suspects>|<the check>"`.
- Look at the player's state at the failure point: `dialogue.active` (freezes you AND runs the sim at dt 0),
  `invUI.open` (PACK screen: you stand still), `arms.stance` (a raised gun slows you; a click on a lowered gun only
  raises it), `gunpoint` holds, `onDeck` (a stale deck applies a van's window rules to any gun), current gun + cylinder,
  `sky.time` (night changes aim and sight), where the player stands (a car 4 km away is not simulated).
- Fix at the source when it is a real bug (a talk whose person is gone now closes; a removed vehicle drops its riders),
  and make `stage()` leave the player neutral. A check that does not call `stage()` must stage what it needs itself.
- Wall-clock is the enemy: the battery's OWN budget once ran out mid-battery and read as "walking" failures.

## 5. Flake policy and landing
- The bar: two fresh-page full runs. A run that fails ONE check that passed in the other run and passes on a targeted
  rerun is a load flake: land, and note it. A check that fails twice in a set is a pattern: fix it before landing.
- Land exactly the commit the battery tested:
  ```
  cd D:/git/carworld/.worktrees/web-engine
  git fetch && git merge-base --is-ancestor feat/web-engine <tested> && git merge --ff-only <tested> && git push origin feat/web-engine
  ```
- main: `git merge-base --is-ancestor origin/main feat/web-engine && git push origin feat/web-engine:main` (a pure
  fast-forward; never touch the main checkout `D:\git\carworld`, it holds someone else's work).
- After a landing, tell running lane agents to `git merge feat/web-engine` before their final batteries.

## Red flags
- Landing on one green run, or on runs where the same check failed twice.
- "Fixing" a check by weakening what it proves (retry the *staging*, never the claim).
- Resolving a code conflict by keeping one side's lines when the other side added code.
- Killing processes by name/pattern; doing an agent's refused action for it (permission laundering: surface it).
