# Divided States of America: status

Checked on 2026-10-26 for DSAFIX1. This page describes the rename branch based on main; the other open PRs are checked separately.

## What works

- Main's browser-game tests passed: `node tools/dl.mjs selftest` in `web/`: 276 passed, 0 failed, in a fresh private Chrome session.
- The shared build repair passed `npm run build` in `web/`. Forge startup now waits inside a function that the production build supports.
- `node tools/ip-lint.mjs`: 0 denied names, 0 names for review.
- Rename branch: `npm run build` passed (1 build, 0 failures); `node tools/dl.mjs selftest` passed 277 of 277 checks, with 0 failures, in a fresh private Chrome session on port 3152.
- That full run exercised walking, combat, driving, the pack, saving and loading, and the map through the automated checks.
- `node --test tools/fixed-step.test.mjs tools/selftest-exit.test.mjs`: 5 passed, 0 failed, on separate test ports 3203 and 3204.
- The title and app names fit at 1280 by 720, 390 by 844, and 844 by 390. The pause menu, manifest and tool page titles also show the new name; screenshots were checked.
- `node tools/dl.mjs scenario name=stress`: 91 draw calls, 6.28 milliseconds per frame in that run, below the game's 150-draw-call limit.

## What's broken

- Unchanged main fails `npm run build` because the Forge page waits at the top of its module. The build error was reproduced before the repair included here.
- Before the clock repairs included here, a slow startup could make the screen flash white, and a request for 600 test frames actually ran 659 because two clocks were running. Both were measured before fixing them.
- PR #9 needs a coordinated phone status display and touch-button layout. Browser captures at 844 by 390, 667 by 375, and 390 by 844 show buttons covering the weapon, speedometer or health panels, plus status and subtitle overlaps. Small layout changes left unreadable text and more overlaps, so that PR was left unpushed with a comment explaining why. PR #5 alone does not solve this.
- `npm ci` reported 3 dependency findings: 1 moderate and 2 high. Dependency changes are outside this title update.
- Godot gameplay and real phones have not been checked in this pass. No claim is made that those checks passed.

## The next 5 jobs

1. Review the eight open PRs using their new build and test results.
2. Redesign the phone status display and touch controls together, then check both orientations on a real phone.
3. Check the PACK changes on a real phone, including buying, taking all and a full pack.
4. Review the three dependency findings and update affected packages with tests.
5. Run the Godot menu and save checks in a separate test save folder.
