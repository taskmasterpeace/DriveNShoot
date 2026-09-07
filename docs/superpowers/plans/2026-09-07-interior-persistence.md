# Persistent Interior Containers — implementation plan

> For agentic workers: use superpowers:subagent-driven-development task by task.
> This is queued behind public transport, not a second active implementation.
> Refresh the save/lifecycle preflight against the completed transport HEAD
> before dispatch. No furniture/room-density changes are authorized by this plan.

**Goal:** Open, take from and deposit into a fixed cabinet; return after furniture
sleep, actual chunk unloading or a saved run, and find the exact remaining items.

**Design:** `docs/design/INTERIOR_PERSISTENCE.md` is the binding record/identity
contract. `INHABITED_ROAD_WORLD.md` supplies the larger gameplay purpose.
Keep `ProtoContainer` and the existing transfer UI as the only inventory engine.

## Global constraints

- Only `D:/git/carworld/.worktrees/america-foundation`, branch
  `codex/america-foundation`. Explicit working directory for every command.
- Preserve unrelated edits. One implementation/engine owner at a time. Scoped
  local commits; no push, merge, export, public listener or normal player profile.
- Every engine/import uses the guarded runner with fresh UUID build directory,
  both APPDATA and LOCALAPPDATA and reparse-path rejection. Preserve original
  process caps; every main-scene scenario has a watchdog and source-hash record.
- Real input for gameplay assertions; initial staging is labeled. Direct pure
  record/container calls are appropriate unit checks, not travel evidence.
- No loot reroll on LOD, no per-cabinet files, no automatic save during the two
  halves of an inventory transfer, no separate reward or ownership system.
- Preserve existing resolver seeds, law-last resolution, locking, furniture
  footprints, ordinary transfer limits and3-per-chunk interior admission.
- Task-level RED→GREEN evidence, covering checks, source-matched captures and
  independent review. Full-game/MMO/release gates remain separate.

## Producer / consumer preflight

| Producer | Consumer | Exact agreement |
| --- | --- | --- |
| Authored root `placement_id` | Furnisher identity builder | Stable placement string, not rounded coordinates or seed |
| Existing `uid` strings | Existing loot resolver | Byte-identical first-roll seed |
| Furniture-set order | Persistent occurrence | Count only earlier occurrences of the same furniture ID |
| Main `interior_loot` store | Furniture open | Same canonical `ProtoContainer` shared by all live views |
| Full-run capture | Checkpoint writer | Current backpack and all touched contents in one synchronous snapshot |
| Incoming record validation | Existing recovery transaction | Validate before transit or player publication; publish new store only after successful recovery |
| JSON identity | Native checkpoint counts | Normalize only parsed identity occurrence; version/count fields remain native strict ints |

Known map candidates, subject to actual approach/clearance preflight:
`meridian-gas` at140,-302.5 for furniture LOD; `richmond-slot-2`
(`gas_station_small`) at1395,-237, rotation3.142 for actual streamed-chunk return.
The Richmond placement is outside the permanent authored-building zone, not an
invented duplicate. Its floor being inside the permanent12km slab does not make
its authored shell/furniture immune to chunk unload. Prove actual root lifetime.
No national map row changes are required or authorized.

## Task1 — canonical touched-container store

**Own:** new `game/proto3d/interior_loot.gd` and UID; new
`game/proto3d/tests/interior_loot_sim.gd/.tscn/.gd.uid`; narrow explicit runner
allowlist mapping for this scene in `tools/transit_runtime_check.ps1`.

**Interface:** `class_name ProtoInteriorLoot extends RefCounted`.

- `static identity(kind: String, owner_id: String, furniture_id: String,
  occurrence: int) -> String`: canonical JSON array; invalid input returns empty.
- `valid_record(value: Variant) -> bool`: exact schema/identity/known-row/item
  checks from the design, no mutation or resolver calls.
- `restore(value: Dictionary) -> bool`: reject invalid state without mutation;
  valid state replaces the store with fresh canonical containers, not aliases
  into the caller's serialized dictionary.
- `record() -> Dictionary`: deep snapshot of only touched entries.
- `open(identity_key: String, furniture_id: String, building_type: String,
  resolve_first: Callable) -> ProtoContainer`: return the existing canonical
  container or resolve once into a new one. The callable returns the existing
  resolver's item dictionary; no second random/loot implementation. Reject invalid
  identity/metadata without rolling. Locks are checked by furniture before open.

- [ ] Write behavioral failures for missing store, exact shared-container
  identity, first resolver count1, emptied container staying empty, transfer
  conservation and snapshots that cannot mutate live inventory.
- [ ] Cover every malformed-present shape: extra fields, wrong native types,
  version, unknown rows/items, nonpositive/fractional counts, mismatched key/FID,
  empty owner, negative/fractional/noncanonical JSON occurrence. Include actual
  identity producer→JSON parse→validation round trip; JSON numbers are floats.
- [ ] Implement the focused store with `ProtoContainer`, no disk or autoload.
- [ ] Run isolated store checks, self-review, scoped local commit and review.

## Task2 — furniture identities, real LOD and atomic run integration

**Own:** `furniture.gd`, `furnisher.gd`, `house.gd`, narrow `proto3d.gd`
save/init/load integration; new `tests/interior_loot_run_sim.gd/.tscn/.gd.uid`;
narrow runner scenario mapping. Task1 store only for reviewed integration needs.
No room geometry, content rows, main-loop restructuring or second inventory UI.

- [ ] Reproduce current refill by actual E/UI transfer, real walk beyond55m and
  return within40m. Record old node invalid/new node distinct and original loot
  restored on unfixed code. Do not substitute direct `_sleep()` calls for this
  gameplay RED; direct lifecycle calls may supplement unit coverage.
- [ ] Add an optional persistent-identity argument to `ProtoFurniture.create`,
  default empty so unrelated callers remain ephemeral. Furnisher resolves its
  authored parent metadata before wake; safehouse uses explicit fixed identity.
  Count same-FID occurrences across its furniture set and later gun rack so the
  rack cannot collide with a set member. Keep every old resolver UID unchanged.
- [ ] Bind through the current main store before the local `_rolled` early
  return on every successful interaction. This prevents an existing node keeping
  an old container after loading another run. Locked interactions never roll or
  add a record. Two views share one container, not copies.
- [ ] Initialize main store before furniture interaction. Include `interior_loot`
  in capture. Validate incoming sibling before any existing recovery transaction;
  omitted legacy state is explicitly empty, malformed present rejects whole load.
  Publish the prepared new store and close main's ordinary container panel only
  after existing recovery commits successfully. Failed recovery preserves old
  store, panel references, wallet, character and ticket. Refresh exact save order
  after transport completion before editing it.
- [ ] Verify actual take/deposit/empty, LOD return, F5/F9 and legacy-load reset.
  Exercise duplicate live views, colocated different authored IDs, untouched and
  locked cabinets, changed law after opening and carried-inventory conservation.
- [ ] Define a bounded denied-write fixture against the actual ordinary F5 path
  before implementing it. Use only the isolated run's owned files/handles; no
  normal-save manipulation, production test switch or per-cabinet writer.
  A failed ordinary write preserves the old disk checkpoint but does not roll
  back live inventory; denied staged recovery preserves live state too.
- [ ] Run furniture_container, furnisher, furnisher_lod, law_loot_override and
  relevant save/transport recovery coverage once on frozen final source. Retain
  existing warnings/failures honestly. Commit and independent task review.

## Task3 — actual chunk return, fresh-process continuity and visual proof

**Own:** the new run sim/runner continuation fixture, and verification docs only;
production changes require a named reproduced bug and regression.

- [ ] Preflight the real `richmond-slot-2` doorway, furniture admission and clear
  vehicle approach. Actual drive away must cross the stream's unload boundary,
  logging chunk/root removal, then actual return recreates that authored root.
  Use normal controls/forces on the real road; no shell recreation helper or
  out/back transform assignment. Keep each bounded scenario within existing caps.
- [ ] Open/take/deposit before travel, compare exact remaining inventory on
  return, then F5 and start a fresh isolated engine with that explicitly supplied
  fixture checkpoint. The runner may copy this owned checkpoint into a fresh
  profile after hash verification; never adopt a human play save.
- [ ] Assert no refill, duplication, forgotten empty container or leaked old
  store. Report touched-entry count, serialized bytes and reference-memory
  estimate. Preserve the existing full-run64MiB writer limit; no silent eviction.
- [ ] Capture actual approach, open/take/deposit, departure and returned cabinet
  from ordinary player camera. Label all staging; keep unedited PNG/raw hashes.
  Parent inspects every image. These prove persistence, not new room art.
- [ ] Final review of this plan's whole range; update HANDOFF truthfully. Only
  then dispatch the room-kit/functional-building plan.

## Explicit queued preflight gates

Transport is still being implemented. Before this plan becomes active, confirm
the then-current main save order and store lifetime, exact root metadata at both
selected placements, real UI action selectors, denied-F5 fixture mechanics and
guarded runner ownership. A draft is not permission to overlap the active worker.
Any changed contracts are ruled and recorded before dispatch, not improvised in
the middle of inventory persistence implementation.
