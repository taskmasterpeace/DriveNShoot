# WEB_ROOM_SCAN: your real room as a DSOA house

## 1. Overview
Opened 2026-11-05 on Machine King's go (WEB_DEPTH_PLAN §9). A phone scan of a real room becomes an **authored building
row** (world/authored.js v1, the Building Lab's format, WEB_BUILDING_LAB.md). Everything the engine already does for
buildings comes free: walls, a front door, windows, doorways, collision, the foot nav grid, the roof, furniture you can
loot and sleep in, and the reachability proof.

```
iPhone (Scaniverse, free; LiDAR on a Pro)  ->  scan.glb / .obj / .ply / .usdz
  web/tools/room-scan/scan2room.py          ->  room.json + topdown.png + room-shell.glb
  web/tools/room-scan/room2row.mjs          ->  row.json (an authored row with rooms[].pieces)
  node tools/dl.mjs author row=... lot=...  ->  standing on a Phoenix ring house lot, proved
```
One command: `node tools/room-scan/make-room.mjs <scan> --name "MY ROOM" --place lot=R-12.-4.2`.
Python needs `trimesh scipy shapely pillow fast_simplification`; USDZ goes through headless Blender first.

## 2. Player Fantasy
"That's MY living room." You walk off a dead Phoenix street into a house with your room's shape, your sofa where your
sofa is, your shelves on the wall they're on. It is the base you board up, sleep in and defend.

## 3. Detailed Rules
**scan2room.py (reading the scan)**
1. Load, make Y-up (glTF/USD are Y-up; a raw PLY/OBJ takes the axis with the most flat faces), floor at 0. Colours dropped.
2. Floor and ceiling heights from flat faces. The strongest wall direction (mod 90°) turns to X/Z.
3. Top-down grid of `CELL` cells from 900k surface samples: floor hits, vertical coverage in four bands (0.15–0.85,
   0.95–1.75, 1.75–1.95, above the door head), and the highest up-facing surface below 1.95 m.
4. Footprint: standable floor plus what stands on it, closed then opened with a 40 cm square, traced, then
   orthogonalised (every edge along X or Z).
5. Each outline edge, every cell: **wall** (mid bands covered) / **door** (nothing low or mid, a lintel above or floor
   beyond) / **window** (sill and head, hole between) / **open** (nothing). Majority-smoothed over 5 samples.
6. Furniture: raised-surface blobs inside, split at thin bridges, named by shape (§4).

**room2row.mjs (making the building)**
1. Outline lines closer than `SNAP` merge. The outline's box is the footprint, wall centre lines half a wall out (the
   scanned room keeps its real inner size).
2. Box cells not scanned are the **rest of the house**: hall (under 2.6 m across) or den rooms behind partitions,
   joined to the scanned room by an inner doorway: where the scan saw a door/opening, else mid-wall; spots whose clear
   zone hits scanned furniture are skipped.
3. A rest pocket under `POCKET` across, or whose only doorway would hit furniture, joins the scanned room (open plan).
4. Front door in the scanned room's outside wall: a seen door/opening first, else the longest stretch. All door
   centres on nav cell centres (whole metres + 0.5).
5. Room type: bed → bedroom, sofa → living, table → dining, else den.
6. Each furniture blob → a FURNITURE row at its own rectangle in `rooms[].pieces: [{ kind, x0, z0, x1, z1 }]`.

**Engine (world/authored.js, world/ring.js)**
- `place()` turns `pieces` with the row; `compile()` passes them on; `checkRow()` refuses a non-FURNITURE piece.
- `furnish()`: a room with `pieces` gets exactly those (not its row's list), each through `placeOne()` with its own
  spot then `NUDGE` steps as candidates, `gap` 0.02 m between pieces. Every piece is still proved on the NavProbe.
- `geo.pieces = { want, placed }`; the `author` command returns `pieces: { want, placed, kinds }`.
- No `pieces` anywhere (every building today): nothing changes.

## 4. Formulas
- Grid: `cell(x) = floor((x - lo) / CELL)`, CELL = 0.08 m. A 7 m room is ~88 cells across.
- Floor height: the 4 cm histogram bin with the most up-facing area in the lowest 40% of heights, + 0.02 m.
- Squaring yaw: `argmax` of the area-weighted histogram of `atan2(nz, nx) mod 90°` (0.5° bins, 5-bin smooth).
  Sample: 33.2°.
- Sofa test: heights `h` of a blob's top cells; `backed = share(h < 0.52) > 0.25 and share(h > 0.62) > 0.2`.
  Sample sofa: seat 0.4 m, rim 0.7–0.8 m → backed.
- Furniture kind (h = 85th pct top height, big/small = footprint sides, m):
  sofa if backed, big > 1.3, small < 1.3 · bed if h < 0.8, big > 1.7, small > 0.8 · table if 0.6 < h < 0.95, big > 0.7,
  or h < 0.6, big ≥ 0.8 · shelf if h ≥ 1.2, small < 0.75 · stool if h < 0.6, big < 0.8 · chair if h < 1.15, big < 0.9 ·
  else cabinet. Sample: a 2.16 x 1.12 x 0.77 blob → sofa → couch.
- Row mapping: bed → `bed` (small ≥ 1.2) or `sbed`; sofa → `couch`; table → `table` (h < 0.7), `dtable` (big > 1.6),
  else `desk`; chair → `armchair`; stool → `nightstand`; shelf → `shelf`; cabinet → `shelf` (h > 1.2) else `dresser`.
- Doorway spots: `p = k + 0.5` with `a0 + pad + w/2 <= p <= a1 - pad - w/2`, pad = 0.35 (+ T/2 inside).
- Wall height: `clamp(scan ceiling, 2.8, 3.6)` m (a door needs 2.03 m plus the lintel).

## 5. Edge Cases
- Scan fuzz making two wall lines 10 cm apart: merged by SNAP; zero-width rooms cannot happen.
- No outside wall of the scanned room long enough for a 2.4 m front door: room2row exits 2 with that message; no row.
- The front door prefers a spot whose 1.3 m clear zone misses every scanned piece, over a seen opening that would bump one.
- A piece whose own spot and every nudge fail (doorway zone, overlap, or it would seal a pocket): left out; `author`
  reports `placed < want`. Sample: 1 of 10 left out.
- A rest pocket with no possible doorway: joins the scanned room (no sealed room ever reaches the proof).
- Footprint bigger than the lot: `author` refuses ("does not fit lot"); pick a bigger lot or x,z.
- Ceiling not scanned: height falls back to the 99.5th percentile of all faces, then clamped to 2.8–3.6 m.
- Glass, mirrors: read as holes (window/open). The guide tells the scanner to cover mirrors.

## 6. Dependencies
- Uses: WEB_BUILDING_LAB.md (authored rows, `author`, prove), WEB_FLOORPLANS.md (ROOMS rows, placeOne/NavProbe),
  data/ring.js FURNITURE, the ring lots (WEB_STREAMING §1.3), WEB_DEPTH_PLAN §9 (privacy rules).
- Used by: WEB_CAMPS_BASES.md bases (a scanned house is a claimable house like any other); the future base-control app.
  WEB_BUILDING_LAB.md lists `pieces` as a row field (see world/authored.js header).

## 7. Tuning Knobs
| Knob | Where | Value | Safe range | Affects |
|---|---|---|---|---|
| CELL | scan2room.py | 0.08 m | 0.05–0.12 | detail vs noise; smaller is slower |
| WALL_MIN_H band | scan2room.py bands | 0.95–1.95 m | ±0.2 | what counts as wall vs tall furniture |
| orthogonalise tol | scan2room.py | 0.22 m | 0.1–0.4 | how many small jogs the walls keep |
| crumb area | scan2room.py | 0.15 m² | 0.08–0.4 | how small an object becomes a piece |
| SNAP | room2row.mjs snapLines | 0.3 m | 0.2–0.5 | merging double-seen walls |
| POCKET | room2row.mjs | 2.0 m | 1.8–2.6 | when a back pocket joins the room |
| NUDGE | world/ring.js | 0.15–0.6 m | ≤ 0.8 | how far a piece may move to stand |
| gap | world/ring.js own pieces | 0.02 m | 0–0.3 | how tight scanned pieces may sit |

## 8. Acceptance Criteria
- `node tools/dl.mjs selftest only="room scan"` passes: LAB_SAMPLES.scanroom stands on a house lot, proof ok, ≥ 8 of 10
  pieces with the couch, each within 0.65 m of its scanned spot, `moveTo` from the street gets inside, removed cleanly.
- The full selftest stays green; buildings without `pieces` are unchanged.
- `make-room.mjs` on a GLB prints rooms, pieces stood and "every room reached from the front door".
- The row holds no colour, texture, photo or location data (sizes only).

**Proof 2026-11-05:** Apple ARKitScenes 41069025 (public iPad LiDAR living room, CC BY-NC-SA, test only) → lot
R-12.-4.2, THE DEAD HOUSES: proof clean, 9/10 pieces (the 10th would have sealed a corner), walk-in arrived. Pictures and clip in
`N:/recordings/alpine-swift/2026-11-05-room-scan/`; the phone guide is `HOW-TO-SCAN-YOUR-ROOM.html` there.

**Not done yet:** the engine still picks its own window spots; one room per scan (whole house = several scans); names
are shape guesses (the Oct 30 SAM 3.1 cut-out at N:/scans/2026-10-30-room-sam could name them); the base-control app;
a real Scaniverse export has not been run yet.
