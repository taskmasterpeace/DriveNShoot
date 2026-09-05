# Roadstead homestead kit

Original Blender-authored DRIVN assets, created through the installed **Blender MCP** addon and MCP stdio server on 2026-09-05. These are exported game models, not concept images. The preview renders are Blender studio renders; they are not gameplay screenshots.

## Assets

| GLB in `game/assets/models/homestead/` | Triangles | Mesh nodes | Purpose |
|---|---:|---:|---|
| roadstead_cottage.glb | 22,982 | 2 | Weathered clapboard cottage, porch, furniture and removable roof |
| parcel_mailbox.glb | 1,736 | 1 | Address/property interaction marker |
| freight_kiosk.glb | 7,432 | 2 | Road Office job board and radio |
| delivery_crate.glb | 2,660 | 1 | Sealed freight cargo |

Materials are embedded, authored flat-color PBR surfaces with mesh-built wear, trim and lettering. No downloaded textures, marketplace assets, paid generation, or remote providers were used. No external asset packs or font files are redistributed. Font lettering uses Blender's bundled Bfont converted to geometry. Blender documents commercial use of created artwork on its [license page](https://www.blender.org/about/license/); this provenance statement is not a blanket third-party licensing guarantee. The repository's existing licensing still applies.

Source: `tools/blenderforge/sources/homestead_kit.blend`.
Reproducible generator: `tools/blenderforge/gen_homestead.py`.
Five inspected renders: `tools/blenderforge/previews/homestead/`.

## Runtime contract

- Metres, ground-centered origin; Blender front -Y exports to Godot front +Z.
- Cottage nominal wall footprint is 10m X by 8m Z, centered on X=Z=0. At Y=3m, actual wall surfaces are X=+/-5.05m and Z=+/-4.05m; regression tolerance is 0.06m per surface for siding thickness/bevel/trim, with empty exterior controls beyond +/-5.12m and +/-4.12m. This is not an overall decorative bounding-box measurement. Roof overhang expands width to about 11m. Porch and steps extend to roughly Z=6.8m. Overall roof/chimney height is about 6m.
- Cottage meshes begin `Body` and `Roof` (Blender numeric suffixes are allowed). Hide the `Roof` mesh for cutaway. Body, furniture, walls and porch remain visible.
- Centered front doorway has at least 1.3m usable width and 2.2m clearance above its raised floor. Regression measures the actual finished floor (0.355m, tolerance 0.01m), jambs (approximately +/-0.70m, center tolerance 0.01m), and overhead obstruction from mesh rays. Foundation bottom is -0.04m; grounded-body tolerance is [-0.06, +0.02]m. Porch top is 0.40m, so collision and a walkable porch/step transition belong to runtime, not decorative mesh bevels.
- GLBs deliberately contain no collision. Runtime should use a small authored compound shell and ramp, not complex decorative trimesh collision everywhere. The asset regression uses a trimesh only to check actual doorway geometry against adjacent walls.
- Front windows have openings. Side glazing is decorative, not an escape route. Furniture is visual, not an implemented bed/workbench interaction.
- Each material surface is a draw submission; mesh-node count is **not** draw-call count. No authored LODs; Godot automatic LOD generation is enabled in the import settings. No texture atlas, lightmap UV pass or measured large-neighborhood performance certification yet.

## Actual MCP route

This task had no exposed Blender tool, so a small adapter used the installed Python MCP SDK (`ClientSession`/`stdio_client`) to initialize the installed `blender-mcp.exe`, list tool schemas, and call `get_scene_info` and `execute_blender_code`. The latter runs the checked-in generator inside Blender with `runpy.run_path`. This is the actual MCP protocol, not a socket-only substitute.

The task started a separate hidden GUI Blender 5.1 process with `--factory-startup --python tools/blenderforge/mcp_bootstrap.py`. Blender MCP requires a GUI event loop and rejects background mode. The addon binds only `127.0.0.1:19876`. A previously tried port was occupied; no unrelated process was stopped. MCP telemetry is disabled only for the child process. User MCP configuration, saved scenes and preferences were not edited. Only scenes tagged as this generator's own assets may be replaced on regeneration.

Local installed dependencies (override paths for another machine):

```powershell
$blender = 'D:/Program Files/Blender Foundation/Blender 5.1/blender.exe'
$python = 'C:/Users/taskm/AppData/Roaming/uv/tools/blender-mcp/Scripts/python.exe'
$bootstrap = (Resolve-Path 'tools/blenderforge/mcp_bootstrap.py').Path
Start-Process -FilePath $blender -WindowStyle Hidden -ArgumentList @('--factory-startup', '--python', ('"' + $bootstrap + '"'))
# Wait for the addon-ready line before these calls. Do not start a second server on an occupied port.
& $python tools/blenderforge/mcp_client.py --list
& $python tools/blenderforge/mcp_client.py
& $python tools/blenderforge/mcp_client.py --code tools/blenderforge/gen_homestead.py
```

`DRIVN_BLENDER_ADDON` and `DRIVN_BLENDER_PORT` override bootstrap paths/port; client `--server` and `--port` override its installed executable/port. Bootstrap and client must use the same port. Do not expose this code-execution addon to the internet.

Successful MCP response reported all four asset paths and counts above, `Saved as "homestead_kit.blend"`, and `DRIVN_HOMESTEAD_KIT_COMPLETE`.

## Verified 2026-09-05

```powershell
& $python -m unittest discover -s tools/blenderforge/tests -v
& 'C:/Users/taskm/Downloads/projects/Godot/Godot_v4.5.1-stable_win64_console.exe' --headless --path game --import
& 'C:/Users/taskm/Downloads/projects/Godot/Godot_v4.5.1-stable_win64_console.exe' --headless --path game res://proto3d/tests/homestead_asset_sim.tscn
```

- Python GLB contract: one test, four asset subcases, **PASS**. Reads actual binary POSITION vertices through node transforms (not accessor min/max or declared metadata). Checks embedded resources, hierarchy, triangle budgets, metre-scale bounds, grounded body and roof/front contract.
- Godot 4.5.1 reimport: exit 0. Existing dialogue-manager invalid-UID fallback warnings remain; no new asset import failure.
- Godot actual PackedScene/physics check: **44 passed, 0 failed**, clean output. Actual floor Y=0.355m, jambs approximately +/-0.700m, doorway clear height=2.280m. Nine clear doorway rays plus solid jamb/header and empty exterior controls guard against vacuous misses. The lowest ray starts at Z=4.01m, inside the porch step at Z=4.02m; middle/head rays cross from Z=4.4m to 3.65m. Hiding the roof preserves the body.
- Negative-control runs append `-- --probe-narrow`, `-- --probe-shrunken`, or `-- --probe-floating` to the Godot sim command. Each deliberately transforms the imported mesh and must exit 1: respectively **37 passed/7 failed**, **29/12**, **39/5**. The narrowed doorway measures about 1.260m and fails its width assertion; the 0.8-scale building misses all four footprint controls; the +0.2m translated building fails grounded-body/floor checks. These flags affect only the test instance, never the asset files.
- Initial tests failed for missing assets. An intermediate export unintentionally included earlier scenes; `use_active_scene=True` fixed that. Triangle-budget failures drove text/bevel optimization. Review regression then measured only 2.105m headroom in the 22,938-triangle cottage: the first uncut siding row extended below its center. Cutting by the board's lower surface fixes clearance, producing the current 22,982 triangles.

These tests do not prove a character can climb the porch or that the game loop is integrated. The runtime milestone owns those checks and real-camera captures.
