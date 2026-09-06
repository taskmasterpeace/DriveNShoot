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

Whole-branch review and the final broad sweep remain in progress; this is not an all-green release certification.

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
