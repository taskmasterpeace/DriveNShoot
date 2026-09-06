# Original Roadstead yard kit

Authored 2026-09-06 through the actual installed Blender MCP stdio server using
`tools/blenderforge/mcp_client.py`, with Blender's addon bound to localhost:19876.
New task-owned hidden Blender session; no user scenes/preferences changed.
Closed that process after saving the editable source.

| Asset under game/assets/models/homestead/ | Triangles | Mesh nodes |
|---|---:|---:|
| freight_shelter.glb | 4,368 | 2 (body + cutaway roof) |
| reclaimed_fence.glb | 1,364 | 1 |
| yard_lamp.glb | 484 | 1 |

Generator: `tools/blenderforge/gen_roadstead_yard.py`; editable source:
`tools/blenderforge/sources/roadstead_yard.blend`. Reuses original material/mesh
helpers by import without executing or rewriting the earlier homestead kit.
All geometry/materials authored locally; no downloads, marketplace content,
external textures, paid APIs or external font files. Lettering is Blender Bfont
converted to mesh. See HOMESTEAD_KIT.md for the existing provenance boundary.

Metres; Blender front -Y becomes Godot front +Z. Grounded origin. Shelter canopy
has an independent Roof node. Exported lamp emissive geometry is paired with a
real runtime light through roadstead_yard.json. Collision uses simple row-defined
boxes, not decorative triangle meshes. Fence/roof/lamp detail is visual, not an
unimplemented interaction advertised to the player.

Binary geometry/embedded-resource contracts pass for all three assets. Runtime
yard and existing home tests prove office access, all three house entrances,
fence physical presence and cutaway. No broad draw-call/LOD/large-neighborhood
performance or blanket asset-redistribution certification is claimed.
