# LASTLINE / KESTREL — original transport art

Asset checkpoint: `c5c2eca`. These are imported art assets, **not playable public
transport**. The full [delivery contract](../design/PUBLIC_TRANSPORT.md) remains
open after this geometry/import step. The [screenshot review](../verification/TRANSIT_VISUAL_REVIEW_2026_09_07.md)
shows the actual outputs and the problems corrected through inspection.

## Source and provenance

Authored with the installed Blender MCP 1.28.1 stdio server through
`tools/blenderforge/mcp_client.py`, talking to the task-owned Blender 5.1 session
at literal `127.0.0.1:19876`. This was a real `execute_blender_code` call, not a
claim that a registered native Blender tool was available. Telemetry was disabled.
Only the worktree's disposable profile and source were written; no user scene or
preferences were replaced.
After verification, the exact owned Blender PID was checked against its executable,
bootstrap command and loopback listener, then stopped; port 19876 was confirmed closed.

Generator: `tools/blenderforge/gen_transit.py`. Editable source:
`tools/blenderforge/sources/transit_kit.blend`. It reuses the original homestead
mesh/material helpers without executing or rewriting that kit. No downloaded
models, raster textures, marketplace assets, paid providers or external font
files; the service lettering is Blender's built-in Bfont converted to mesh.
This provenance is not a blanket legal certification for the entire game's assets.

## Runtime contract

| Model in `game/assets/models/transit/` | Triangles | Mesh parts | Attachment nodes | Full bounds W × H × L |
|---|---:|---:|---:|---|
| `lastline_coach.glb` | 10,488 | 7 | 9 | 3.165 × 3.520 × 8.622 m |
| `kestrel_courier.glb` | 5,521 | 5 | 6 | 9.880 × 3.380 × 10.170 m |

Helicopter dimensions include the complete stationary rotor span. Coach width
includes mirrors and fixed boarding steps; it is not a proposed road-lane width.
Both roots are at wheel/skid ground contact. Blender +Y front exports to Godot
-Z; Godot +Y is up and +X is the right-hand boarding side. No external buffers,
images, studio cameras, lights or floor geometry are in either GLB.

- Coach: `Body_coach`, `Roof_coach`, `Door_passenger`, `Wheel_FL`, `Wheel_FR`,
  `Wheel_RL`, `Wheel_RR`. Wheel pivots are at axle height 0.50 m; spin about local
  X. The passenger door is hinged at its forward stile; roof and door are
  separate meshes. Steps stay with the body, not the door.
- Helicopter: `Body_helicopter`, `Roof_cabin`, `Door_passenger`, `Rotor_main`,
  `Rotor_tail`. Main rotor spins about local Y at `(0, 3.31, 0.16)`; tail rotor
  about local X at `(0.34, 2.49, 4.72)`. The cabin door is a separate sliding part.
- Both: `Seat_driver`, numbered `Seat_passenger_XX`, `Boarding`, `Exit` are
  non-rendering Node3D attachments. Coach has six passenger anchors; helicopter
  has three. The driver is additional, not included in those counts.

GLB names are canonical. Blender's editable source uses an asset-ID prefix and
stores `drivn_runtime_name`; this prevents global object names in one scene from
forcing `.001` suffixes in another model's exported attachments. Regenerate
through the generator; a manual source re-export must honor those canonical keys.

## Reproduce safely

Use PowerShell 7 to invoke `tools/transit_asset_check.ps1 -Mode import`, then
`-Mode headless` or `-Mode capture`. The runner creates unique APPDATA and
LOCALAPPDATA directories under this worktree's `build/`, rejects reparse
ancestors, records process/source hashes and enforces a 120-second wall budget.
The scene also refuses a profile outside that build root. Do not launch the
test directly against the normal player profile.

`-Mode scale-probe` deliberately shrinks only the instantiated test models by
half; exit 1 and four failed height/length checks are the expected negative
control, not a passing normal run. Python geometry coverage is
`python -m unittest discover -s tools/blenderforge/tests -v`.

The source meshes have no service collision bodies, ticket/state scripts or
network authority. Sampled doorway rays and rear-seat headroom catch the fixed
slabs seen in the first screenshots; they do **not** prove a walking capsule,
moving-door clearance, passenger animation fit, flight safety or road handling.
Those remain runtime integration gates. The models retain a stylized, boxy
silhouette and coarse wear; they have not met a final AAA art/performance bar.
