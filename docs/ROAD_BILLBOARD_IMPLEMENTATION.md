# Road Billboard Implementation Note

Date: 2026-07-09

Commit: `ee1c498 feat(roads): add camera-facing billboards`

## Why This Was Done

During a pass over the active design docs, `docs/design/THE_AMERICAN_ROAD.md`
identified M4b road-address furniture as a live target. The streamer already
implemented several parts of that milestone:

- Mile markers
- Route reassurance shields
- State-line welcome monuments
- Labeled water towers through structure materialization

One promised part was missing: camera-facing interstate billboards with simple
weathered variants for riskier roads.

## What Changed

`game/proto3d/world_stream.gd` now spawns visual-only interstate billboards as
part of the streamed road furniture pass.

The billboard placement is deterministic and based on road arc distance, so it
does not depend on random chunk state. Billboards are placed off the shoulder,
follow the road segment rotation, and use `Label3D` with billboard mode enabled
so their text stays camera-honest from the top-down view.

The implementation includes two visual states:

- Clean roads: `LAST GAS / NEXT EXIT`
- Higher-risk roads: `KEEP DRIVING / NO SERVICE` with small damaged panel marks

The billboards are built from the same low-poly box visual style used by the
current road furniture. They are visual props rather than collision bodies, so
they do not raise the roadside collision budget.

## Test Coverage Added

`game/proto3d/tests/roadside_band_sim.gd` now checks that M4b road-address
furniture includes:

- Route reassurance shields along interstates
- Camera-facing billboards along interstates
- A non-empty billboard label using `BaseMaterial3D.BILLBOARD_ENABLED`

This extends the existing roadside band sim, which already checked utility
poles, fences, verge strips, body budget, dirt-spur exclusion, mile markers,
state-line monuments, and water tower labeling.

## Verification Run

The following sims passed after the change:

- `roadside_band_sim.tscn`: 14 passed, 0 failed
- `road_lane_sim.tscn`: 26 passed, 0 failed
- `world_sim.tscn`: 11 passed, 0 failed

`git diff --check` also passed. Git reported only Windows line-ending
normalization warnings for the touched files.

## Files Changed

- `game/proto3d/world_stream.gd`
- `game/proto3d/tests/roadside_band_sim.gd`

## Result

The M4b road milestone now has visible interstate billboards in the streamed
world, with sim coverage that proves the design-doc requirement stays wired.
