# Interior persistence — fixed containers remember

Status: next-delivery design, not implemented or accepted. Execute after the
active public-transport plan; refresh its save-integration references then.

Implements the first building gate in `INHABITED_ROAD_WORLD.md` and the persistence
law in `THE_BUILDING_BOOK_ROOMS_AND_LOOT.md`. This is a local-run storage contract,
not authenticated online inventory authority or room-kit delivery.

## The defect and the boundary

`ProtoFurniture` resolves loot once per live node. `ProtoFurnisher._sleep()` frees
those nodes, so returning creates fresh containers with the original loot.
`capture_save()` currently stores dragged furniture transforms, not fixed
container contents. Merely deterministic loot is not persistent loot.

Keep `ProtoContainer` as the sole inventory container. Add a main-owned, non-node
store of touched fixed containers; it survives LOD and chunk lifetimes. Do not
introduce a second transfer implementation, per-cabinet save files, an autoload,
or a disk write in the middle of `transfer_to()`'s remove/add pair. Existing full
run checkpoints must contain both the carried inventory and remaining interior
contents from the same synchronous capture. An ordinary failed F5 preserves the
previous disk checkpoint and reports failure; it does not secretly roll back
live play. Transactions that already stage/commit a full run retain their own
atomic rules.

Owned Roadstead storage remains the property ledger's responsibility. Do not
give an owned cottage a fresh generated jackpot. Preserve the existing safehouse
pieces and their resolver behavior during this persistence-only delivery.

## Stable identity, separate from the loot seed

Keep the current `_uid` as the resolver seed so adding persistence does not
unnecessarily change existing first-open loot. Give a fixed container a separate
persistent identity made from a canonical JSON string of an array, not ambiguous
delimiter concatenation:

`["placement", placement_id, furniture_id, occurrence]`

The authored root's existing `placement_id` is the authority. Resolve it before
the furnisher wakes; never use instance IDs, child node names, load order or
rounded coordinates for authored placements. `occurrence` is the zero-based
occurrence of that furniture ID in the existing set, not its overall array
index. Adding an unrelated cabinet therefore cannot rename the fridge.

The eager original safehouse uses `["fixed", building_id, furniture_id,
occurrence]`, with its existing explicit `safehouse` building ID. Future room
kits must replace occurrence with an explicit stable room/slot identity through
a versioned migration; never silently renumber persisted contents.

Non-authored preview/test shells may retain the current position-derived seed
and ephemeral contents. They must not accidentally enter the durable namespace.
Tests that require persistence provide explicit authored/fixed identity, just
as production callers must. Two authored roots at the same rounded coordinates
must still have independent containers. Two live views of the same identity
must share one canonical `ProtoContainer`, not two copies that can be looted.

## Local checkpoint shape

New optional full-run sibling:

```text
interior_loot = {
  version: 1,
  entries: {
    <canonical identity>: {
      furniture_id: <known furniture row ID>,
      building_type: <known building row ID>,
      slots: {<known item ID>: <positive integer count>}
    }
  }
}
```

Only first successfully opened containers create entries. Absence means never
rolled; an entry with empty `slots` means opened and emptied, not permission to
reroll. Locked interactions must not resolve loot or register an entry. Resolve
new contents through the existing furniture → building → law pipeline; once
opened, a later law change does not rewrite stored items.

Validate exact keys, version/type, canonical identity shape, matching furniture
ID, nonnegative integer occurrence, nonempty identity component, known content
rows and item IDs, and strictly positive integer counts (not bool/float). Reject
extra keys and malformed present state without partial application. A missing
`interior_loot` on an older save means an empty store; an explicitly malformed
present value is not an old save. Deep-copy serialized snapshots so callers
cannot mutate the store through a returned dictionary.

Canonical-key parsing must account for Godot's JSON number representation:
validate a finite, whole, nonnegative occurrence no greater than9007199254740991
before conversion, normalize it to an int, then require byte-for-byte equality
with the canonical array serialization. Reject booleans, fractional/negative
values, numeric strings and alternate/noncanonical encodings. This normalization
is for the JSON identity only; native full-run version and item counts remain
strict ints. Cover producer→parse→validation round trips instead of requiring
`is int` directly on a decoded JSON number. See the official
[Godot4.5 JSON parser behavior](https://docs.godotengine.org/en/4.5/classes/class_json.html).

Validate this sibling before *any* existing transit recovery, wallet publication
or other live save mutation. A later recovery write failure must leave the old
store and every live view untouched. On successful load, close an open ordinary
container panel and replace the store generation; live furniture must rebind
before its next interaction rather than keeping an obsolete container. Loading
an older checkpoint intentionally restores its corresponding inventory and
contents together. Loading a legacy checkpoint clears the previous run's store.

Do not evict touched entries by LOD or arbitrary visit-count trimming: that
reintroduces the exploit. Unopened shells carry no record. Measure serialized
size and touched-container memory in the test report; any future content-scale
limit needs an explicit migration/failure policy rather than silent data loss.

## Evidence required before room density grows

1. A deterministic regression reproduces a cabinet refilling after sleep on the
   old implementation. Unit checks may call the pure store/transfer interfaces;
   gameplay proof must press actual input to open and transfer through the
   existing panel, using process frames so GUI events really land.
2. Take some loot, deposit one carried item, walk beyond55m and return within40m.
   Confirm the original node was freed, a new node appeared, and exact contents
   plus the player's inventory survived. An empty container stays empty too.
3. Use an existing eligible authored placement on the actual map. Drive far
   enough for its real chunk to unload, then return; log both chunk identities
   and continuous travel. Calling `_spawn_chunk()` or teleporting out/back is
   only a fixture, not traversal proof.
4. F5/F9 and a fresh isolated engine process restore exact contents. Cover a
   previously untouched cabinet, a law-locked cabinet, two colocated but
   differently identified placements and two live views of one identity.
5. Exercise missing legacy state, malformed present variants, a denied ordinary
   write and a denied existing transit recovery write. Verify disk preservation
   and no partial store/player/ticket changes appropriate to each operation.
6. Run the existing furniture/container, furnisher, LOD, law-override and save
   regressions. No relaxation of door/stair clearance, the per-chunk interior
   cap, transfer capacity or law-last behavior. Correct touched tests to restore
   their previous time scale, not blindly1.0.

Capture the actual approach, open/take/deposit, leave and return views. Label any
initial position fixture. Keep raw logs, environment/source hashes and before/
after screenshots; render-quality room improvements are a subsequent gate.
Use the existing dual-profile isolated runner, with a narrow explicit sim
allowlist extension after transport ownership is released. All runs remain
inside this worktree's build directory with owned-process timeouts. The normal
player profile and unrecovered save incident remain out of bounds.
