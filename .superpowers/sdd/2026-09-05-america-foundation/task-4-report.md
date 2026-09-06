# Task 4 — consolidated final-review fix report

Date: 2026-09-05. Isolated checkout: `D:/git/carworld/.worktrees/america-foundation`. Branch: `codex/america-foundation`; fix wave started at reviewed base `f8ba565`.

This wave addresses all five Minor findings in `final-review-findings.md`. It does not approve the branch, claim a globally green suite, repair established baseline failures, or implement any deferred realm/MMO work. No paid call, network write, push, external checkout edit, broad lighting change, asset reauthoring, or GLB modification was performed.

## Fixes and regression coverage

1. **Runtime receipt conflict:** `road_life_sim.gd` now probes `sim:take` while its receipt is still live, before the old-save rewind. It asserts that the receipt exists, the mismatched replay returns exactly `receipt_conflict`, and complete backpack and ledger snapshots remain unchanged. The assertion no longer passes through an absent stored item.
2. **Rows control advertised behavior:** `ProtoRoadLife` selects the first unowned site using each site's row ID, gates the objective on that row's price, and displays its row name/price. The encounter trigger reads the active job definition's `encounter` flag and corresponding receiver instead of naming `last_light` in code. Runtime row variations cover a zero-priced/renamed first parcel, a renamed/repriced second parcel after the first is owned, and an active LAST LIGHT row with encounter disabled.
3. **Capture failures are process failures:** the photobooth checks output-directory setup, rejects an empty viewport image, accumulates successful and failed PNG writes, and exits nonzero unless all five captures succeed. `--output=...` permits disposable verification without rewriting published renders. The focused regression explicitly covers an empty source and a real `save_png` failure; the hidden-GUI process was also run with one PNG path deliberately occupied by a directory.
4. **Full visible porch support:** the porch box now spans the authored plank edges, X `-4.90..4.90` (9.8 m), while retaining its existing depth/height/ramp geometry. The runtime sim stages on the deck, then uses actual `InputEventAction` left/right motion to reach X approximately `-4.623/+4.623`. Both edges settle at the same raised floor Y `0.400`; the pre-fix collider settled at ground height.
5. **Status wording:** `AMERICA_FOUNDATION_STATUS.md` now distinguishes the exported-geometry checks from the separate completed runtime collision/ramp/doorway/full-porch proof.

The tracked Task 3 report was moved with patch history to `docs/verification/roadstead/task-3-report.md`. Its cited `task3-*.log` files were copied alongside it so the durable report no longer points at disposable scratch evidence.

All 21 copied logs have SHA-256 hashes identical to their scratch originals. Full `git diff --cached --check` therefore retains one historical trailing space in `task3-property_ledger_sim.log` (`invalid ID rejected:`). The scoped check excluding byte-preserved `task3-*.log` evidence is clean; source, tests, reports and status prose have no whitespace errors.

## RED evidence

All Godot runs used task-local `APPDATA` directories below this plan scratch area.

Focused capture regression before production change:

```powershell
Godot_console --headless --path game res://proto3d/tests/roadstead_photobooth_failure_sim.tscn
```

`task4-capture-red.log`: `0 passed, 1 failed`, exit 1 because the checked image-save/accounting boundary did not exist.

Runtime after adding the corrected conflict check, row variations, edge traversal and encounter-disable probe, before production changes:

```powershell
Godot_console --headless --path game res://proto3d/tests/road_life_sim.tscn
```

`task4-runtime-red2.log`: `66 passed, 4 failed`, exit 1. Only the intended new behaviors failed: row-driven objective, left edge support, right edge support, and encounter disable. The new conflict assertions already passed with a present receipt, exact error and unchanged state.

After adding the next-unowned selection assertion, a temporary mutation changed `_selected_site()` back to first-site-only behavior. `task4-selection-mutation-red.log` reports `70 passed, 1 failed`, exit 1, specifically `objective selects next unowned parcel by row id`. The real loop was then restored before final verification.

## Final verification evidence

Godot executable: `C:/Users/taskm/Downloads/projects/Godot/Godot_v4.5.1-stable_win64_console.exe`.

Fresh import:

```powershell
Godot_console --headless --path game --import
```

`task4-final-import.log`: exit 0. Existing Dialogue Manager invalid-UID path-fallback warnings remain.

Covering runtime and separate-process restart, using the same disposable APPDATA so the second process consumes the first process's checkpoint:

```powershell
Godot_console --headless --path game res://proto3d/tests/road_life_sim.tscn
Godot_console --headless --path game res://proto3d/tests/road_life_sim.tscn -- --restart-check
```

- `task4-final-runtime.log`: **71 passed, 0 failed**, exit 0, clean final output. It includes exact conflict state, both physical porch edges and all row variations.
- `task4-final-restart.log`: **5 passed, 0 failed**, exit 0. It retains the established `ObjectDB instances leaked` / three resources-in-use shutdown diagnostics; no clean-output claim is made for restart.

Asset geometry contracts:

```powershell
Godot_console --headless --path game res://proto3d/tests/homestead_asset_sim.tscn
C:/Users/taskm/AppData/Local/Programs/Python/Python313/python.exe tools/blenderforge/tests/test_homestead_contract.py
```

- `task4-final-homestead-asset.log`: **44 passed, 0 failed**, exit 0, clean.
- `task4-final-python-asset.log`: one unittest ran, `OK`, exit 0.

The first Python attempt used the unavailable bare `python` command. PowerShell then displayed a stale `$LASTEXITCODE=0`; that wrapper output is explicitly rejected as evidence. The absolute interpreter command above was independently rerun and is the cited proof.

Focused source/write failure check:

```powershell
Godot_console --headless --path game res://proto3d/tests/roadstead_photobooth_failure_sim.tscn
```

`task4-final-capture-failure.log`: **4 passed, 0 failed**, exit 0. Expected error diagnostics show empty-source error 30 and blocked-output `save_png` error 12; the assertions verify two accumulated failures, zero successes, and a nonzero photobooth completion result.

Actual hidden-GUI photobooth checks used the GUI Godot sibling, `--audio-driver Dummy`, task-local APPDATA, disposable output folders, `Start-Process -WindowStyle Hidden`, and no published-render rewrite:

- `task4-actual-capture-fail.stdout.log` / `.stderr.log`: one target PNG path was an existing directory. Four writes returned 0, `01_road_office` returned error 12, the summary reported `4 succeeded, 1 failed`, and the real process exited **1**.
- `task4-actual-capture-success.stdout.log` / `.stderr.log`: five PNG files were written, all five returned error 0, the real process printed `5 real runtime captures complete`, and exited **0**. It retains the observed one-resource shutdown diagnostic; no clean-output claim is made.

## Scope and limits

The published `road_jobs.json`, `properties.json`, runtime PNGs and four homestead GLBs are unchanged. The porch collider follows the current authored 9.8 m plank width; no mesh or visual asset was regenerated. Photography still uses positional staging by design; the runtime sim separately proves player motion using input.

Known independently reproduced baseline failures and audio shutdown noise remain out of scope. Country connectivity, authenticated dedicated realms, multi-process purchase contention, secure identity/RPCs, production operations and capacity testing remain unimplemented and unproven. A scoped re-review and parent-owned broad sweep remain required before any broader integration statement.

## Handoff audit

After all import, headless, hidden-GUI and subprocess work, a process inventory reported `ACTIVE_GODOT_PROCESSES=0`. The isolated branch worktree was clean after the scoped commit. No import server or capture process remains active.
