# Solid blocks look boarded up (web engine)

**Status:** built 2026-11-13 on `feat/web-zed-boarded` (on top of `feat/web-zed-windows2`).
**Asked by:** the coordinator for Robert, 11-12: "boarded-up shells that look boarded up". From my audit
(`docs/status/INTERIORS_AUDIT.md` §"Shells on purpose"): 33 of the first island's 113 buildings are solid blocks you
cannot enter, and they were blank boxes.
**Files:** rows `web/src/data/interiors.js` (`BOARDED`); the rule `web/src/world/city.js` (`boardUp`, called by
`makeSolid`); check `web/src/agent/boarded-api.js`.

## 1. Overview

A building you cannot enter is still a building. On the first island the tower stumps and sealed blocks were plain
boxes: no door, no window, nothing to say why you cannot go in. Now each face of each block has a doorway nailed over
with four planks and rows of dark window openings up its first three storeys, the street row boarded and about a third
of the ones above. It reads as shut on purpose.

Nothing about what you can do changes: the block is still one solid collider.

## 2. Player fantasy

You run along a street of the old city looking for a way in. Most doors are planked over and you can see they are,
from across the road, so you do not waste the run on them.

## 3. Detailed rules

1. **Every solid block** the island builder makes (`makeSolid`: the tower stumps that fill a block, and the sealed
   buildings in the ruin lots) is boarded on all four faces.
2. **The doorway:** one a face, 1.7 m wide and 2.4 m tall, dark, somewhere along the middle half of the face, with
   four planks across it, each a little off line.
3. **The windows:** a row every 3.4 m of height for up to three rows, an opening every 5.5 m along the face, 1.3 m
   wide and 1.5 m tall, dark. The street row carries two planks each. About a third of the openings above do too.
   None stands over the doorway; none rises past the top of a short block.
4. **Where each thing goes is a hash of the block's place.** It draws no number from the city's own random stream,
   so no other building, wreck or person on the island moves because of it.
5. **Looks only.** No collider, no door to work, nothing to break or loot. A round stops on the block as it did.

## 4. Formulas

- Rows on a block `h` m tall: `min(3, floor((h − 0.6) / 3.4))`, at least 1.
- Openings along a face `L` m long: `floor((L − 3) / 5.5)`, at least 1, spaced evenly inside 1.5 m of each corner.
- Boxes added for a block: per face, 5 for the doorway plus, per opening, 1 (dark) and 2 more if boarded.
  A 40 x 40 m stump 30 m tall: 6 openings a face, 3 rows: about `4 × (5 + 6 × 3 + 6 × 2 + 12 × 0.35 × 2) ≈ 175`.
- The island has 33 solid blocks: about 3,200 boxes in the walls' one mesh (one draw call, as before).

## 5. Edge cases

- **A block beside another building:** lots stand 2 m or more apart, so that face is seen from the alley and is
  boarded like the rest.
- **A short block (under 4 m) or a narrow face (under 8.5 m)** cannot be made by the island builder today (blocks are
  7 to 42 m tall and 14 to 52 m wide). The rule still guards them: one row, nothing past the top, one window or none.
- **Top-down view:** the planks' outer faces stand 20 cm off the wall, so from above they are thin lines at the wall's foot; the
  look is for the angled, third-person and shoulder views.
- **Not covered:** the holdouts' back-yard shacks and sheds and the bases' igloos, pump houses and tanks are also
  solid and are not boarded by this (they are built by other builders; an igloo has its steel door and a crate at it
  already). Boards here cannot be pried off: the block has no inside.

## 6. Dependencies

- `world/city.js` (`makeSolid`, the `walls` box batch). Nothing reads `BOARDED` but `boardUp`.
- The interiors' own boards on windows you can break (`WEB_DOOR_POUND.md`, `systems/interiors.js`) are a different
  thing: those are real and come off. This doc depends on nothing of theirs and they on nothing here.
- Draw calls: none added. Boxes: about 3,200 in the island's wall mesh.

## 7. Tuning knobs (`BOARDED`)

| Knob | Value | Safe range | What it changes |
|---|---|---|---|
| `door` | 1.7 x 2.4 m | – | The nailed-over doorway |
| `doorPlanks` | 4 | 2–6 | Planks across it |
| `win` | 1.3 x 1.5 m | – | A window opening |
| `every` | 5.5 m | 3–10 | Windows along a face (box count) |
| `storey` / `floors` | 3.4 m / 3 | 1–6 rows | How far up the rows go (box count) |
| `upBoarded` | 0.35 | 0–1 | Share of upstairs openings with planks |
| `dark`, `wood` | `#221f1c`; three browns | never purple | Colours |

## 8. Acceptance criteria (selftest, `only="boarded:"`)

1. The rows are sane and no colour is purple.
2. Every solid block of the island (there are at least 20) carries four nailed-over doorways with exactly
   `doorPlanks` planks each, at least four window openings with planks on some, every box's centre outside the block
   with its outer face between 5 and 30 cm off the wall, and nothing above its top; no building you can enter carries
   any; the whole island adds fewer than 6,000 boxes. These numbers are the builder's own tally, measured from the
   coordinates it handed to the wall mesh; they are not read back from the mesh. The pictures are the proof it looks
   right.

Pictures: `docs/renders/web/boarded/` (a tower stump before and after, from the street).
