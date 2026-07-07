# MotionForge — the DRIVN motion editor (the next Forge)

DRIVN's animation is **procedural** — sin()-driven box rigs (`puppet.gd`, `quadruped.gd`)
fed **parameter rows**, not keyframed clips (`docs/MOVESET.txt` SPEC B). MotionForge edits
those rows: a web UI + REST API in the proven Forge shape (VehicleForge :8898,
MapForge :8899). Zero npm dependencies, plain `node:http`, one data JSON as source of truth.

The **engine-side reader** (folding `motions.json` over the rig literals at boot) and the
**treadmill preview scene** are separate work — this tool owns the editing surface and the data.

## Run

```
node tools/motionforge/server.mjs        # http://localhost:8896
```

| Env var | Default | Meaning |
|---|---|---|
| `MOTIONFORGE_PORT` | `8896` | HTTP port |
| `MOTIONS_PATH` | `game/data/motions.json` | the data file (created on first save if missing) |

Live preview: run the game (**F10 → FORGE reload**) or the treadmill scene
`res://proto3d/tools/motion_stage.tscn`.

## The data model

`game/data/motions.json` holds **tuned overrides only** — the engine's stock literals stay
in code and this file is folded over them additively (only the params you touched change):

```json
{
  "_comment": "...",
  "rigs": {
    "<rig_id>":   { "<motion_id>": { "<param>": 0.75 } }
  }
}
```

- **Open schema**: any rig / motion / param id matching `[a-z0-9_]+` is accepted — new
  creatures and new motions are just rows. Param values must be **finite numbers**.
- Known rigs today: `puppet` (the biped) and `quadruped` (dogs / howlers).
- *Effective* params = stock (from `/api/defaults`) overlaid with the tuned row.
- A cleared tuned row (`DELETE`) = back to stock. `{"rigs": {}}` means everything is stock.

## The API

JSON in / JSON out. Every mutation writes the file immediately (`writeFileSync`).
Query style matches VehicleForge (`?id=…&motion=…`); the path style
`/api/rig/:id/motion/:m` works too.

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/help` | — | endpoint list, vocabulary, examples |
| GET | `/api/rigs` | — | `{rigs: {<rig>: {motions: [...], tuned: [...]}}}` (defaults merged with tuned) |
| GET | `/api/defaults` | — | the stock param sets (read-only engine literals) |
| GET | `/api/rig?id=puppet&motion=gait` | — | `{params}` (effective = stock ⊕ tuned), `{tuned}` (just the overrides), `{stock}` |
| POST / PATCH | `/api/rig?id=puppet&motion=gait` | `{"stride_amp": 0.75}` | merges into the tuned row, saves, returns the new effective params |
| DELETE | `/api/rig?id=puppet&motion=gait` | — | clears the tuned row (back to stock) |
| POST | `/api/describe` | `{"rig","motion","text"}` | heuristic NL patch — **applies** a ±15% (±30% for *much/way*) diff and returns `{diff, was, rationale}`; unparseable text → **422** with the vocabulary |

```
curl localhost:8896/api/rigs
curl -X PATCH "localhost:8896/api/rig?id=puppet&motion=gait" -d '{"stride_amp":0.75}'
curl -X POST localhost:8896/api/describe \
  -d '{"rig":"quadruped","motion":"gait","text":"make the sniff deeper and slower"}'
curl -X DELETE "localhost:8896/api/rig?id=puppet&motion=gait"
```

### Describe-it (the heuristic patcher — no external AI calls)

Direction words pick an axis and a sign; target words narrow which params move:

- **Directions** — looser/stiffer · wider/narrower · more/less · faster/slower ·
  deeper/shallower · higher/lower/raise/dip · stronger/softer · bigger/smaller
- **Targets** — legs/stride/steps · arms · head/nose/sniff · tail/wag · bob/bounce · lean ·
  cadence/speed/tempo · crouch · breath · launch/jump/leap · tuck · scrape/dig · body
- **Magnitude** — ±15%, or ±30% when the clause says *much / way / a lot*.
- Complaint phrasing (*"too stiff"*, *"looks stiff"*) is read as the **problem** and inverted —
  the patch is the fix. A targeted instruction outranks an untargeted diagnosis in the same
  sentence (*"the run looks stiff, loosen the front legs"* → only `stride_amp` +15%).
- Untargeted *faster/slower* moves the motion's **tempo** (the `cadence_*` params), not every
  speed knob. Depth-style params know their polarity: *"dip the head lower"* **raises**
  `sniff_depth` (value up = nose down).

## The stock params (what the engine's literals are today)

`/api/defaults` serves these read-only so the UI can show **stock vs tuned**.

### `puppet` / `gait` — the biped walk-run cycle

| Param | Stock | Meaning |
|---|---|---|
| `cadence_base` | 2.0 | base step frequency (cycles/sec) at a walk — the floor of the gait tempo |
| `cadence_speed` | 1.15 | how much cadence scales up with movement speed (multiplier per unit speed) |
| `stride_amp` | 0.6 | leg-swing amplitude (radians) — how far the legs reach each step |
| `arm_swing` | 0.85 | arm counter-swing amplitude, as a fraction of the leg swing |
| `step_bob` | 0.12 | vertical body bob per step (meters) — the weight of the walk |
| `breath_amp` | 0.02 | idle chest rise/fall amplitude — keeps a standing puppet alive |
| `lean_turn` | 0.22 | body lean into a turn (radians per unit turn rate) |
| `crouch_drop` | 0.34 | how far the body sinks in the crouch stance (meters) |

### `quadruped` / `gait` — the dog/howler trot (+ sniff + tail)

| Param | Stock | Meaning |
|---|---|---|
| `cadence_base` | 3.0 | base leg-cycle frequency (cycles/sec) — quadrupeds tick faster than bipeds |
| `cadence_speed` | 1.4 | cadence scaling with movement speed |
| `stride_amp` | 0.5 | leg-swing amplitude (radians) |
| `sniff_depth` | 0.25 | head-dip depth while sniffing (value up = nose closer to the ground) |
| `sniff_wobble` | 0.12 | side-to-side nose wobble amplitude during the sniff |
| `body_lilt` | 0.06 | torso roll per stride — the happy little sway |
| `wag_speed_lo` | 4.0 | tail-wag frequency at calm (Hz) |
| `wag_speed_hi` | 16.0 | tail-wag frequency at max excitement (Hz) |
| `wag_amp_lo` | 0.12 | tail-wag amplitude at calm (radians) |
| `wag_amp_hi` | 0.7 | tail-wag amplitude at max excitement (radians) |

### `quadruped` / `leap` — the gap/fence/truck-bed jump

| Param | Stock | Meaning |
|---|---|---|
| `launch_h` | 7.2 | launch impulse height — how hard the leap leaves the ground |
| `tuck_front` | 0.9 | front-leg tuck amount mid-air (radians) |
| `tuck_hind` | 0.8 | hind-leg tuck amount mid-air (radians) |
| `head_up` | 0.35 | head raise during flight (value up = head higher) |

### `quadruped` / `dig` — the buried-loot / grave dig

| Param | Stock | Meaning |
|---|---|---|
| `scrape_hz` | 18.0 | forepaw scrape frequency (Hz) — the frantic-ness of the dig |
| `scrape_amp` | 0.55 | scrape stroke amplitude (radians) |
| `head_down` | 0.4 | head-lowered amount while digging (value up = head lower) |

## Notes

- The UI writes a tuned override for any param you touch, even if you land back on the stock
  value — **↺ RESET TO STOCK** (a `DELETE`) is the way to truly clear a motion.
- New motions for new verbs (crouch, slide, punch, dog-jump — SPEC A's job list) are POSTs
  to `/api/rig` with fresh motion ids; the open schema takes them today.
- No purple. Ever.
