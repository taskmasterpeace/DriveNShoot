# CarWorld / DRIVN — MASTER PLAN

**Set:** 2026-07-06. Executed autonomously, in order, commit after each goal, tests stay green.

**North-star strategy:** tokens are scarce — build a **toolified suite** so other models (and humans)
can build and tune content + data. **Never one-off content.** Everything becomes data + an editor.

---

## GOAL 1 — DATA SPINE
Build the data schema layer (`DataVehicle`, `DataBuilding`, `DataItem`, `DataNPC`, `DataLootTable`)
+ a JSON→`.tres` stamper. Migrate existing vehicles into `DataVehicle` rows with fields:
`class`, `trunk_volume`, `passenger_seats`, `tire_grip`, `engine_force`, `mounts`.
Add **PICKUP TRUCK** and **SUV** rows to prove new vehicles are pure data.

## GOAL 2 — MAPFORGE v2
Upgrade `tools/mapforge` into a real world editor:
- (a) zoom to town level; edit road segments — drag, draw, delete; create interstate **EXITS**.
- (b) an **authored-placement layer** to pin specific buildings/structures at exact coordinates
  while biomes stay procedural around them.
- (c) a **town-template stamper**.
All edits write to `data/usmap.json`.
**PROOF CASE:** fix the starting town's road so it connects to the interstate exit properly.

## GOAL 3 — VEHICLE FORGE
Add a vehicle-editing tab to MapForge (or a sibling tool) that reads/writes the `DataVehicle` rows —
tune stats, cargo, seats without code. A full **car editor**: design cars, show per-car stats,
add a pickup truck, edit vehicles **programmatically** (AI-readable/editable, like the model rows).
Make it feel **AAA**: **armor rates front and center**, and a **compare** view.

## GOAL 4 — LORE BIBLE (brief)
Write `docs/DIVIDED_STATES.md` — this is the **DIVIDED STATES OF AMERICA**. All 50 states, each ruled
differently (Barons, Kings, Presidents, Chiefs, CEOs — one-line identity + ruler + 1–3 landmarks each).
**THE CAROUSEL** = the continuation-of-government military teleport network linking military bases;
it fully replaces the Deathlands Redoubt / MAT-TRANS concept. Propose original replacements for
remaining Deathlands terms (Jack currency, Villes) and do a rename sweep across `docs/`. Make it OURS.

## GOAL 5 — SOUNDFORGE BATCH
Use SoundForge/ElevenLabs to batch-generate the full SFX library: per-class engine loops, impact crunch,
tire scream, fire whoomp, dog bark/growl alerts, UI clicks, ambient wasteland wind. Wire what's easy,
bank the rest to disk.
