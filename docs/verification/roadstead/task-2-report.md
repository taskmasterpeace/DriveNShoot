# Task 2 report

Archived historical task report. The final geometry fix below was accepted at `1f2452d`; runtime integration and physical traversal were subsequently completed. The task-owned Blender process mentioned below was stopped after its command line was verified; it is not an active connection. Original intermediate counts/statuses are retained as chronology. See [current review status](REVIEW.md).

Status: DONE, pending independent task review. Base 72f4a4e. Parent implemented the independent Blender asset task while the delegated ledger task ran; no runtime files touched.

Owned files: tools/blenderforge/{mcp_bootstrap.py,mcp_client.py,gen_homestead.py,tests/test_homestead_contract.py,sources/homestead_kit.blend,sources/.gitignore,previews/homestead/*.png}, game/assets/models/homestead/*.glb and their new import files, game/proto3d/tests/homestead_asset_sim.{gd,gd.uid,tscn}, docs/art/HOMESTEAD_KIT.md. Existing tracked import files were not staged.

Production code: real MCP SDK stdio adapter to installed blender-mcp server, isolated loopback Blender addon, procedural original modeling and export, saved editable source plus five rendered previews. Final counts: cottage22938, mailbox1736, kiosk7432, crate2660. Embedded PBR materials, Body/Roof split, active-scene-only exports, typed real Godot import/doorway tests.

RED: Python unittest initially failed all four subcases for absent GLBs. Intermediate RED found previous scenes exported into subsequent props; active scene filtering fixed it. Later RED found cottage54362 above40000 triangle budget. Reduced bevel segments/text tessellation; final GREEN below budgets40000/4000/12000/6000.

Final actual runs:

`& 'C:/Users/taskm/AppData/Roaming/uv/tools/blender-mcp/Scripts/python.exe' -m unittest discover -s tools/blenderforge/tests -v`

Output: `test_four_portable_original_game_assets ... ok`; `Ran 1 test in 0.003s`; `OK`. Exit0. Four subcases.

`& 'C:/Users/taskm/Downloads/projects/Godot/Godot_v4.5.1-stable_win64_console.exe' --headless --path game --import`

Output: all four homestead GLBs imported, exit0. Existing dialogue-manager UID fallback warnings. No new parse or import errors.

`& 'C:/Users/taskm/Downloads/projects/Godot/Godot_v4.5.1-stable_win64_console.exe' --headless --path game res://proto3d/tests/homestead_asset_sim.tscn`

Output: twelve import/load/compact hierarchy checks, Body/Roof split, cutaway, metre-scale width/front, nine doorway rays at x=-.6/0/.6 and y=.6/1.4/2.25, adjacent wall control. `HOMESTEAD RESULTS: 26 passed, 0 failed`. Exit0, clean output.

All five latest Blender preview images visually inspected. Kiosk/mailbox framing corrected; worn clapboard, porch furniture, roof seams, crate text and kiosk signage readable. Cottage cutaway renders actual interior. These are Blender renders, NOT gameplay screenshots.

Limitations: no LOD/lightmap UV/atlas pass, per-material surfaces still multiple draw calls, no FPS claims, no physical character traversal/runtime integration until Task3. Installed local MCP paths require overrides on another machine; actual code-execution server must remain loopback. Source/.blend regeneration removes only tagged scenes matching owned asset IDs. No paid providers, remote assets, persistent config edit or user scene overwrite.

## Review fix round 1 resumed — 2026-09-05

Status: implemented and verified, pending parent's scoped review. Resumed the three-file uncommitted work without restarting or reverting it. Changes are confined to assigned tests/generator, four regenerated GLBs, source .blend, five previews and kit documentation. Existing .import files needed no changes. Parent's status document and before captures were untouched. This report remains an ignored local coordination artifact.

RED before regeneration (actual Godot command below): `HOMESTEAD RESULTS: 40 passed, 4 failed`, exit 1. Mesh ray measurements: `floor=0.355 doorway_height=2.105 jambs=[-0.69999992847443, 0.69989991188049]`. Failing assertions: measured 2.2m clearance and all three upper doorway rays at floor+2.2m. Root cause: selecting front siding by board center closed the opening at Y=2.460m, not the required >=2.555m. Retained prior fix selecting the board's lower surface (`z - .09 <= door_clear_top`); first intact row now starts at 2.635m.

An initial regeneration attempt found original task Blender PID58384 gone and port19876 unbound. Started a new separate hidden `--factory-startup --python tools/blenderforge/mcp_bootstrap.py` Blender session, PID41636, loopback127.0.0.1:19876. No other Blender processes were stopped. Real MCP SDK stdio initialized BlenderMCP1.28.1 and called execute_blender_code. First geometry validation rejected the lowest ray because it began inside the 0.400m-high porch. Corrected that ray's start to Z=4.01m, inside the porch edge at4.02m; its interior floor remains measured at0.355m. Mid/head rays still cross the whole wall. Re-ran the unchanged old GLB and confirmed the same 40/4 RED before regeneration.

Actual final commands and outputs (PowerShell, workdir `D:/git/carworld/.worktrees/america-foundation`):

```powershell
& 'C:/Users/taskm/AppData/Roaming/uv/tools/blender-mcp/Scripts/python.exe' tools/blenderforge/mcp_client.py --code tools/blenderforge/gen_homestead.py
# Connected to Blender at 127.0.0.1:19876; status: success; Code executed successfully
# roadstead_cottage 22982 triangles/2 parts; parcel_mailbox 1736/1;
# freight_kiosk 7432/2; delivery_crate 2660/1.
# Saved as "homestead_kit.blend"; DRIVN_HOMESTEAD_KIT_COMPLETE; exit 0.
& 'C:/Users/taskm/AppData/Roaming/uv/tools/blender-mcp/Scripts/python.exe' -m unittest discover -s tools/blenderforge/tests -v
# test_four_portable_original_game_assets ... ok; Ran 1 test in 0.157s; OK; exit 0.
& 'C:/Users/taskm/Downloads/projects/Godot/Godot_v4.5.1-stable_win64_console.exe' --headless --path game --import
# Four homestead assets reimported; exit 0. Two existing dialogue-manager invalid-UID fallback warnings; no new parse/import failures.
& 'C:/Users/taskm/Downloads/projects/Godot/Godot_v4.5.1-stable_win64_console.exe' --headless --path game res://proto3d/tests/homestead_asset_sim.tscn
# HOMESTEAD GEOMETRY: floor=0.355 doorway_height=2.280 jambs=[-0.69999992847443, 0.69989991188049]
# HOMESTEAD RESULTS: 44 passed, 0 failed; exit 0; clean output.
```

Negative-control actual runs used the same sim command with each suffix, modifying only its imported test instance:

- `-- --probe-narrow`: X scale0.90, jambs[-0.630,0.630], measured width1.260m fails >=1.3m; four edge rays and two footprint checks also fail. `37 passed, 7 failed`, expected exit1.
- `-- --probe-shrunken`: uniform scale0.80; all four footprint controls fail along with missing jamb/header controls and floor height. `29 passed, 12 failed`, expected exit1.
- `-- --probe-floating`: Y translation+0.20m; grounded-body and measured-floor checks fail (floor0.555m). `39 passed, 5 failed`, expected exit1.

Geometry proof: Python reads embedded binary POSITION vertices, applies node transforms and computes bounds (not accessor min/max or extras). Godot queries actual imported Body trimesh, not metadata. Nominal10x8m wall shell is centered at X=Z=0; surface probes target +/-5.05m and +/-4.05m at Y3m with0.06m per-surface tolerance for thickness/bevel/trim, and require exterior emptiness beyond +/-5.12m, +/-4.12m. Grounded body allows[-0.06,+0.02]m (actual foundation-0.04m), floor0.355m +/-0.01m, opening width[1.30,1.44]m, center +/-0.01m and height[2.20,2.35]m. Actual headroom2.280m. No giant GLB triangle parser added; Godot owns precise geometry queries.

All five regenerated Blender previews inspected: cottage exterior and cutaway retain material/wear/porch/interior detail; kiosk/mailbox/crate lettering remains readable. These are studio previews, not gameplay captures. Cottage adds44 triangles; all four assets remain below original budgets. Docs now accurately say no authored LODs, Godot automatic LOD generation enabled (verified all four `meshes/generate_lods=true`); removed blanket attribution guarantee in favor of no external asset packs/font files redistributed, Bfont converted to geometry, and Blender's official commercial-artwork license page. Remaining limitation: runtime owns the porch/floor ramp and gameplay traversal proof. No push performed.

Fix commit: `1f2452d5282941dc26c122e7ede791b0265147e4` (`fix: verify homestead dimensions from exported geometry`), 14 owned files. Immediately before commit, repeated normal Godot sim44/0 and Python unittest1/4-subcases OK (0.154s), cached diff check exit0. Post-commit status contains only parent's two untracked paths. Task Blender PID41636 remains available for review/regeneration.
