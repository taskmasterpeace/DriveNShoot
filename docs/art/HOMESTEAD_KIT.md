# Roadstead homestead kit

Original Blender-authored DRIVN assets, created through the installed **Blender MCP** addon and MCP stdio server on 2026-09-05. These are exported game models, not concept images. The preview renders are Blender studio renders; they are not gameplay screenshots.

## Assets

| GLB in `game/assets/models/homestead/` | Triangles | Mesh nodes | Purpose |
|---|---:|---:|---|
| roadstead_cottage.glb | 22,938 | 2 | Weathered clapboard cottage, porch, furniture and removable roof |
| parcel_mailbox.glb | 1,736 | 1 | Address/property interaction marker |
| freight_kiosk.glb | 7,432 | 2 | Road Office job board and radio |
| delivery_crate.glb | 2,660 | 1 | Sealed freight cargo |

Materials are embedded, authored flat-color PBR surfaces with mesh-built wear, trim and lettering. No downloaded textures, marketplace assets, paid generation, or remote providers were used. No additional third-party asset attribution is required by this kit; the repository's existing licensing still applies. Font lettering uses Blender's bundled Bfont converted to geometry. No font file is redistributed.

Source: `tools/blenderforge/sources/homestead_kit.blend`.
Reproducible generator: `tools/blenderforge/gen_homestead.py`.
Five inspected renders: `tools/blenderforge/previews/homestead/`.

## Runtime contract

- Metres, ground-centered origin; Blender front -Y exports to Godot front +Z.
- Cottage wall footprint is 10m X by 8m Z. Roof overhang expands width to about 11m. Porch and steps extend to roughly Z=6.8m. Overall roof/chimney height is about 6m.
- Cottage meshes begin `Body` and `Roof` (Blender numeric suffixes are allowed). Hide the `Roof` mesh for cutaway. Body, furniture, walls and porch remain visible.
- Centered front doorway has at least 1.3m usable width and 2.2m clearance above its raised floor. The floor is about 0.35m above ground. Collision and a walkable porch/step transition belong to runtime, not decorative mesh bevels.
- GLBs deliberately contain no collision. Runtime should use a small authored compound shell and ramp, not complex decorative trimesh collision everywhere. The asset regression uses a trimesh only to check actual doorway geometry against adjacent walls.
- Front windows have openings. Side glazing is decorative, not an escape route. Furniture is visual, not an implemented bed/workbench interaction.
- Each material surface is a draw submission; mesh-node count is **not** draw-call count. No LODs, texture atlas, lightmap UV pass or measured large-neighborhood performance certification yet.

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

- Python GLB contract: one test, four asset subcases, **PASS**. Checks embedded resources, scene/mesh hierarchy, primitive triangle budgets, finite metre-scale bounds and cottage roof/front contract.
- Godot 4.5.1 reimport: exit 0. Existing dialogue-manager invalid-UID fallback warnings remain; no new asset import failure.
- Godot actual PackedScene/physics check: **26 passed, 0 failed**, clean output. Nine rays through the real imported doorway are clear; the adjacent wall positive control blocks its ray. Hiding the roof preserves the body.
- Initial tests failed for missing assets. An intermediate export unintentionally included earlier scenes; `use_active_scene=True` fixed that. Triangle-budget failures drove text/bevel optimization. Final cottage went from 54,362 to 22,938 triangles without losing the wall/door geometry contract.

These tests do not prove a character can climb the porch or that the game loop is integrated. The runtime milestone owns those checks and real-camera captures.
