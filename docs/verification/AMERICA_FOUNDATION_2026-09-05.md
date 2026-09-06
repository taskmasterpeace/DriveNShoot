# America foundation — verification record

Scope: the isolated `codex/america-foundation` branch based on `f1290de`, not a public deployment. This record distinguishes component proofs from actual gameplay and multiplayer proofs.

## Reviewed component milestones

| Component | Final checked revision | Evidence | Result |
|---|---|---|---|
| Durable property authority | `72f4a4e` | Real Godot file I/O, commands, restart, buyer serialization, permissions, replay and rejected publication | 67 passed / 0 failed, exit 0, clean |
| Original Blender homestead exports | `1f2452d` | Independent Python binary-vertex contract, four GLB subcases | PASS, exit 0 |
| Cottage physical geometry | `1f2452d` | Real imported Body triangle-mesh rays, wall/ground/floor/jamb/header positive controls | 44 passed / 0 failed, exit 0, clean |
| Existing shared input map | `ed97f3e` | 71 registered actions, keyboard and pad bindings, persistence/reset | 15 passed / 0 failed, exit 0, clean |
| Existing save system baseline | Before runtime integration | Full save/load, pocket migration and duplicate-load checks | 21 passed / 0 failed, exit 0, clean |
| Existing homebase baseline | Before runtime integration | Real upgrade costs, bed, kennel, garage and raid checks | 11 passed / 0 failed, exit 0; teardown warnings below |

The property authority's initial missing-component test failed explicitly (0 passed / 1 failed). Its Windows publication-boundary regression failed on real truncated and same-length-corrupted temporary files before the fix; the final 67 assertions passed. Publication reopens and checks closed bytes before replacing the destination. This does **not** certify physical power-loss durability, hostile filesystem races or multiple writers.

The cottage clearance regression exposed a real 2.105m floor-relative doorway obstruction: 40 passed / 4 failed before fixing the siding's lower edge, then 44 / 0 after regeneration. Final measured floor is 0.355m, doorway width 1.40m, headroom 2.280m. Deliberately narrow (`--probe-narrow`), shrunken (`--probe-shrunken`) and floating (`--probe-floating`) versions each fail as expected; they are negative controls, not broken production assets. Asset clearance is distinct from the separate runtime capsule/ramp test.

Independent task review accepted both components after one fix round each. The asset review also corrected documentation: no authored LODs, Godot automatic LOD generation enabled; mesh-object count is not draw-call count; original geometry provenance is not blanket commercial legal clearance.

## Reproduce the component checks

From the isolated checkout, use a separate process-local APPDATA directory so save/input tests cannot overwrite the normal DRIVN profile:

```powershell
$env:APPDATA = Join-Path $PWD '.verification-appdata'
New-Item -ItemType Directory -Force -Path $env:APPDATA | Out-Null
$godot = 'C:/Users/taskm/Downloads/projects/Godot/Godot_v4.5.1-stable_win64_console.exe'
& $godot --headless --path game --import
& $godot --headless --path game res://proto3d/tests/property_ledger_sim.tscn
& $godot --headless --path game res://proto3d/tests/homestead_asset_sim.tscn
& $godot --headless --path game res://proto3d/tests/input_map_sim.tscn
& 'C:/Users/taskm/AppData/Roaming/uv/tools/blender-mcp/Scripts/python.exe' -m unittest discover -s tools/blenderforge/tests -v
```

These paths are machine-specific. Check each exit code separately; the last command succeeding does not certify earlier commands. Test profiles used during development lived in the plan's ignored scratch directory, not the ordinary user profile.

## Blender and visual evidence

Four original GLBs, an editable `.blend` source, generator and five previews were produced through the installed **Blender MCP** stdio server: SDK initialization, tool-schema listing, `get_scene_info`, and `execute_blender_code`. A separate factory-startup Blender instance hosted the addon on loopback port 19876. No existing user scene, global MCP configuration or paid asset provider was used. See [the kit contract](../art/HOMESTEAD_KIT.md) for files, provenance and exact triangle counts.

The existing Godot `world_photobooth` produced [21 real-camera baseline images](../renders/world/roadstead_before/meridian_main.png) with clean stdout/stderr. These are explicitly **before** images. Blender studio previews demonstrate asset appearance, not live-game polish or performance. No FPS, supported player count or AAA score has been measured.

## Reviewed runtime milestone

Runtime implementation `781f390`, reviewed WAIT fix `b27628c`: the Road Office, three contracts, three deed/storage cottages, household provisions and existing lurker encounter are connected through the real main scene. The [play guide](../PLAY_ROADSTEAD.md) describes the separate-profile source launcher and exact controls. Five [normal-camera images](../renders/roadstead/03_cottage_porch.png) show the actual integration. They retain the current world's lighting and terrain weaknesses.

The task review found a real modal bug: polled physical T advanced the world by 0.500000 game-hours over 30 physics frames whether the menu was open or closed. RED: 58 passed / 2 failed. After gating WAIT through the shared body-input lock, GREEN: 60 / 0; the open-menu interval advances 0.008333h, while normal waiting after close still advances 0.500000h. Separate-process receipt recovery passes 5 / 0; existing life/wait and input-map regressions pass 19 / 0 and 15 / 0. The scoped re-review accepted the fix. Some restart/life runs retain audio-resource teardown diagnostics.

The runtime checks include actual GUI/mouse/controller inputs, cargo/destination requirements, one-time reward, purchase, storage, failed writes, corrupt-present rejection, whole-checkpoint rewind, all three doorway traversals and a real weapon kill producing ordinary corpse loot. The local guest key is an offline ledger demonstration, not an authenticated guest player. Physical entry is open; storage is permission-controlled.

Whole-branch review is complete. The consolidated final fix wave `a0ff3cd` and scoped independent re-review closed all five findings: receipt-conflict coverage, row-driven objective/encounter behavior, PNG error propagation, outer porch collision and stale status wording. The final runtime check is **71 passed / 0 failed**, with **5 / 0** for separate-process restart. The image-failure regression is **4 / 0** with expected negative-control diagnostics; a real GUI capture exits 1 when a PNG path is blocked and exits 0 when all five files write successfully. See [the review/decision record](roadstead/REVIEW.md) and [final fix report](roadstead/task-4-report.md).

The controller independently repeated the final runtime (71 / 0), ledger (67 / 0), asset geometry (44 / 0) and screenshot-error (4 / 0) checks within the broad sweep. A **new process using that runtime test's actual profile** recovered its persisted checkpoint and passed 5 / 0; its established three-resource shutdown diagnostic remains visible in [the raw restart log](roadstead/controller-final-restart.log). The independent Python binary-geometry contract passed again, exit 0, in [its raw log](roadstead/controller-final-python.log). These are 191 focused Godot assertions plus the Python contract, not an MMO proof.

## Completed broad sweep and targeted comparison

The controller ran all **264 `*_sim.tscn` scenes**, sequentially, against frozen runtime `a0ff3cd`, beginning 2026-09-06 01:13:42 UTC (September 5 local time). Each scene used a fresh, separate APPDATA profile and Dummy audio. The runner checked process exit and assertion output, stopped only its own process tree on script errors or a 240-second watchdog, and verified that every scene restored the original map/motions/strikes bytes. No watchdog timeout occurred; two scenes were stopped early for script errors.

| Initial sweep result | Scenes |
|---|---:|
| Assertions passed, no reported diagnostics | 199 |
| Assertions passed, with diagnostics | 44 |
| Failed | 21 |
| Total | 264 |

The overall runner exited **1**, not success. [Machine-readable results](roadstead/full-suite-a0ff3cd-results.json) and [all stdout/stderr plus results](roadstead/full-suite-a0ff3cd-logs.zip) are preserved. All 529 ZIP entries were read back and SHA-256 matched to the originals. This scene sweep is not the separate shell network-loopback test, a manual usability playtest, packaged-app verification or a capacity benchmark.

The clean starting revision was tested in 25 targeted scenes across two batches: the initial six failures below, then 15 additional failures and four non-shutdown diagnostic cases. [Additional results](roadstead/baseline-f1290de-additional-results.json) and [all 50 baseline stdout/stderr files](roadstead/baseline-f1290de-logs.zip) are retained; archive bytes were verified. **Do not label all 21 failures identical baseline failures.** The comparison found:

| Scene(s) | Comparison and remaining issue |
|---|---|
| `audio`, `car`, `container`, `coop_fun`, `creatures`, `items` | Same failure assertions as the initial clean-base batch documented below |
| `drive_in`, `drone_scout`, `frontier`, `gator`, `ground_integrity`, `library`, `nav`, `roadside_band`, `station` | Same failure summaries at clean base: projector return, scout launch, exit budgets, missing dictionary `pos`, manual counts, capped waypoint-ring expectation, billboards, radio keys |
| `dive` | Same two bullet-hit expectations fail; starting HP values differ |
| `horse` | Both mount/parent assertions fail at base too; base additionally failed its later remount |
| `tv` | Initial branch run failed open and reopen; repeat and base failed only initial open. This is variable, not identical output |
| `world_walkthrough` | Initial branch run drove only 337m. Both branch repeat and base drove 500m but failed the creature-count check (2, expected at least 3). The initial distance failure is intermittent and not certified fixed or baseline-only |
| `drag`, `drone_remote` | Pass at base (12 / 0 and 29 / 0), initially fail repeatedly on the branch. Instrumentation proves queued E events can arrive after the tests assert their outcomes; reviewed harness correction below |

The [unchanged-source repeat](roadstead/focus-repeat-a0ff3cd-results.json) and its [eight raw output files](roadstead/focus-repeat-a0ff3cd-logs.zip) are preserved, rather than replacing the original results with a favorable rerun. Temporary [drag](roadstead/trace-drag.stdout.log) and [remote](roadstead/trace-drone-remote.stdout.log) traces show the production input handler receiving the events after the premature assertions. During the drag trace, the player is FOOT/NORMAL, the target is correct, and title/briefing/Roadstead panel locks are false. Late release opens the chest after the harness already called close, contaminating the next hold step. All temporary production instrumentation was removed by exact patches; the runtime diff against `a0ff3cd` was empty afterward.

### Bounded harness follow-up

Task 5 is complete in `ba1cab8`, independently reviewed with no Critical or Important findings. Only the two harnesses changed: await the process/input boundary after each queued physical E edge, retaining their physics-duration waits and all behavior assertions. The [task report and raw logs](roadstead/task-5-report.md) record three separate-profile passes per scene (drag 12 / 0, remote 29 / 0), plus bounded omitted-event controls that fail the intended assertions. One initial drag run has a non-repeated cleanup diagnostic; it remains preserved. An exploratory unbounded negative control reached a downstream nil error/watchdog and was explicitly rejected in favor of the bounded control.

The controller independently reran both with the **original sweep's exact Dummy-driver helper**, verified actual Godot log files under two distinct process-local APPDATA roots, and obtained 12 / 0 and 29 / 0, exit 0, no diagnostics. [Exact-driver results](roadstead/controller-task5-results.json), [drag output](roadstead/controller-task5-drag_sim.stdout.log) and [remote output](roadstead/controller-task5-drone_remote_sim.stdout.log) are retained. This is a focused follow-up, **not a second 264-scene sweep**.

Review's cross-diff source-freeze question was resolved with `git diff --exit-code a0ff3cd -- game tools PLAY_ROADSTEAD.bat .gitignore` excluding only the two owned tests: exit 0, no output. For ephemeral-run questions, the controller obtained the implementer's explicit profile paths and exact omitted-event mutations and checked them against the report/log outcomes. Historical worker profiles were used once and cleaned afterward; no separate pre-creation absence check was recorded, so those historical execution details remain reported provenance rather than an independently preserved OS audit. The controller's own isolated-profile verification is direct evidence. No runtime, binding, asset or map change was made to obtain these passes.

Final real-front-door smoke at `ba1cab8`: `Godot_console --headless --path game --audio-driver Dummy res://proto3d/proto3d.tscn --quit-after 120`, a new disposable APPDATA, exit 0 with [clean engine output](roadstead/controller-final-frontdoor.log). The profile contained zero `.save` files after title-only boot. This does not claim a manual graphical playtest or a packaged Windows application.

### Diagnostics are not all shutdown noise

The 44 diagnostic-bearing passes include resource/RID cleanup warnings; intentional duplicate-media, unknown-structure and failed-PNG negative controls; and actual non-shutdown errors. Clean-base runs reproduce the same categories in `aim` (coincident look-at), `carousel_portal` (transform requested outside the tree), `map` (drawing outside the draw notification), and `track_piece` (tweening nonexistent `modulate:a` on a 3D mesh). Those are retained repair items, not pristine passing output. No blanket claim that every resource leak has been diagnosed is made.

## Clean pre-change comparison

The preliminary broad sweep was paused after 38 completed scenes to fix the modal WAIT issue. Its results are partial, not a full suite. Rather than infer baseline status from unchanged filenames, the controller exported `f1290de`'s `game/` with `git archive`, unpacked it into a separate test-only directory, performed a fresh Godot import, and ran the six failing scenes sequentially with isolated profiles. All six reproduced:

| Baseline scene | Observed failure at `f1290de` |
|---|---|
| `audio_sim` | Repeated `pitch_scale` access on Nil at line 80; stopped only its test process after script errors |
| `car_sim` | 9 passed / 5 failed: dry-tank, smoking, fire, cook-meter and salvage expectations |
| `container_sim` | 9 / 2: chest prompt and chest panel expectations |
| `coop_fun_sim` | 15 / 1: F6-to-FFA expectation |
| `creatures_sim` | 52 / 3: warning delivery and starving hunt expectations |
| `items_sim` | 26 / 1: missing prices for `game_cart_rust_runners` and `game_cart_black_grid` |

These failures predate the milestone; that does not make them acceptable production behavior. They remain a separate repair queue. The test-only helper checks process exit codes as well as assertion summaries, classifies shutdown diagnostics separately, terminates only its launched process tree, and verifies that tests restore the tracked map/motions/strikes bytes. It does not use the existing runner's scene-name-wide process deletion.

## Known baseline diagnostics and unproven boundaries

The existing homebase sim passed all assertions but reported `ObjectDB instances leaked at exit` and a resource-in-use error at teardown (one resource in the recorded baseline run). Import reported existing dialogue-manager invalid-UID/path-fallback warnings. These outputs are not described as pristine.

Sequential buyers in a component sim do not establish network contention, authentication or MMO capacity. The [next persistent-realm gate](../design/ROADSTEAD_REALM_NEXT.md) remains unimplemented. Countrywide road reachability, broad content rollout, signed release packaging, real-player usability and production load/recovery testing remain open.
