# Task 1 — durable property authority

Archived historical task report. The final review fix below was accepted at `72f4a4e`; later runtime integration shares the verified publication boundary. Original commands/output are retained as chronology, not a claim that scratch profiles still exist. See [current review status](REVIEW.md).

Status: implemented and verified in `D:/git/carworld/.worktrees/america-foundation`, branch `codex/america-foundation`. No runtime integration, existing-save edits, Blender edits, or pushes.

Source commit: `f33ccbc` — `Add durable property authority and regression sim`. The commit contains only the six owned source/content/UID files listed below. A fresh pre-commit focused run again passed 62/62, and `git diff --cached --check` passed.

## Owned files

- `game/proto3d/realm/property_ledger.gd`
- `game/proto3d/realm/property_ledger.gd.uid`
- `game/proto3d/tests/property_ledger_sim.gd`
- `game/proto3d/tests/property_ledger_sim.gd.uid`
- `game/proto3d/tests/property_ledger_sim.tscn`
- `game/data/properties.json`
- This report (left in the intentionally ignored `.superpowers` handoff directory; not part of the source commit).

## API and authority semantics

`ProtoPropertyLedger extends RefCounted` provides every public method in the brief with the exact signatures. Mutation results contain `ok: bool` and `error: String`; success is `{ok:true,error:""}`. Failed persistence returns `persistence_failed:<Godot Error code>`; other errors are stable descriptive codes such as `unknown_account`, `already_owned`, `insufficient_funds`, `receipt_conflict`, `access_denied`, and `storage_full`. `open()` returns Godot `Error` directly.

Account creation starts at zero scrip and durably commits before returning success. Existing accounts are returned as successful no-ops. Credit, account creation, and storage movement are trusted server-side commands, not public authentication or RPC endpoints. Purchases debit exactly the authoritative row price. An owned parcel cannot be purchased again under a new request ID.

All requested mutations validate arguments and permissions, clone private state, apply the change, validate the entire candidate, write and flush a uniquely named sibling temporary file, then replace the destination with `DirAccess.rename_absolute`. The previous authority file is never deleted before replacement. In-memory state is published only after successful replacement. Failed writes remove their temporary file and return failure without changing balances, ownership, items, or receipts. `open()` also stages its state/catalog/path and leaves any previously opened authority intact on failure. Parent directories must already exist.

Successful receipt IDs are global across operations. The stored payload includes the operation and every argument except the receipt ID itself. Same ID + identical payload returns historical success without applying effects; same ID + changed payload rejects. Failed requests are not recorded and can retry after their cause is resolved. In particular, replaying an old guest grant after revocation does not restore permission. Replaying a storage command does not move items again.

Owner and explicitly granted existing guest accounts can use storage. Only the owner can grant/revoke. Guests cannot grant permissions; self-grants are rejected as redundant. Revocation immediately blocks new storage commands. Storage capacity is total item units, not weight or distinct slots. Removing a whole stack erases its key. The existing `res://data/items.json` catalog is read at open; unknown item IDs reject. Catalog changes take effect on the next open.

## Snapshot and saved JSON schema

`snapshot()` returns an independent deep copy of the authority state, including all account balances, parcels, and successful receipts. It is an authority/admin interface, **not a safe public-client projection**. Before a successful open it returns `{}`. No content definitions, coordinates, scene instances, or backpack state appear in it.

```json
{
  "version": 1,
  "accounts": {
    "alice": {"scrip": 50},
    "bob": {"scrip": 200}
  },
  "parcels": {
    "test_home": {
      "owner_id": "alice",
      "guests": {"bob": true},
      "items": {"scrap": 6}
    }
  },
  "receipts": {
    "reward_a": {"payload": ["credit", "alice", 200]},
    "buy_a": {"payload": ["purchase", "alice", "test_home"]},
    "grant": {"payload": ["set_guest", "alice", "test_home", "bob", true]},
    "store": {"payload": ["store_item", "alice", "test_home", "scrap", 6]}
  }
}
```

Unowned parcels use `owner_id: ""`, empty guests, and empty items. Accounts, parcels, and receipts have strict structural validation. Unknown schema versions, malformed types, invalid account references, invalid item IDs/counts, over-capacity contents, malformed receipt payloads, and out-of-bound numeric values reject, not reset. JSON numbers are validated as finite mathematical integers before normalization back to GDScript integers; no rounding of invalid fractions occurs. The saved parcel ID set must match the supplied content set exactly. Prices and capacities come from the supplied authority catalog; they are not copied into the save.

Content uses `{ "properties": [ ... ] }`. Three immutable IDs are shipped:

| ID | Name | Price | Item capacity |
| --- | --- | ---: | ---: |
| roadstead_001 | 1 Roadstead Lane | 150 | 120 |
| roadstead_002 | 2 Roadstead Lane | 225 | 180 |
| roadstead_003 | 3 Roadstead Lane | 300 | 240 |

Each row references `res://assets/models/homestead/roadstead_cottage.glb`. No coordinates or model-loading logic were added. Extra row fields are preserved in the private definitions so Task 2 can add placement metadata.

IDs accept ASCII letters/digits and `- . : _`, up to 64 characters for entities/items and 128 for requests. Amounts are positive integers up to 1,000,000,000. Balances are capped at 1,000,000,000,000; item capacities at 1,000,000 units. Bounds also include 10,000 accounts/parcels, 100,000 successful receipts, and a 16 MiB state file. Names and model paths are bounded to 128/512 characters. Limits fail explicitly; they are implementation safeguards, not measured scale guarantees.

## TDD RED

Tests were authored before the production component and rows. Dynamic loading first checks for the component so absence is an assertion, not a parser error.

Working directory for all commands: `D:/git/carworld/.worktrees/america-foundation`.

```powershell
& 'C:/Users/taskm/Downloads/projects/Godot/Godot_v4.5.1-stable_win64_console.exe' --headless --path game res://proto3d/tests/property_ledger_sim.tscn
```

Initial output, exit **1**:

```text
Godot Engine v4.5.1.stable.official.f62fdbde1 - https://godotengine.org
PROPERTY: FAIL - property authority component exists
PROPERTY: 0 passed, 1 failed
```

First implementation run: 48 passed / 13 failed. Investigation showed successful reopen (`Error 0`) but restored balance type `TYPE_FLOAT` versus original `TYPE_INT`. Godot JSON decoding caused structural snapshot differences and numeric receipt inconsistency. Validated numeric fields are now explicitly normalized on load. An unnecessary NUL string literal also caused Unicode parser diagnostics and was removed. The same behavior suite then passed 61/61 with clean output. A numeric credit replay-after-restart check and printed isolated user-data path brought the final count to 62.

## GREEN commands and results

Import was run to register the new class and generate UIDs:

```powershell
& 'C:/Users/taskm/Downloads/projects/Godot/Godot_v4.5.1-stable_win64_console.exe' --headless --path game --import
```

Exit **0**, registered `ProtoPropertyLedger`. Existing dialogue-manager `files_list.tscn` / `download_update_panel.tscn` emitted invalid-UID/path-fallback warnings; no new script errors.

Final focused run isolates Godot's user data via process-local APPDATA. The printed resolved path verified this before running the save regression:

```powershell
$env:APPDATA = 'D:/git/carworld/.worktrees/america-foundation/.superpowers/sdd/2026-09-05-america-foundation/test-appdata'
New-Item -ItemType Directory -Force -Path $env:APPDATA | Out-Null
& 'C:/Users/taskm/Downloads/projects/Godot/Godot_v4.5.1-stable_win64_console.exe' --headless --path game res://proto3d/tests/property_ledger_sim.tscn
```

Exit **0**, no warnings/errors:

```text
PROPERTY: PASS - property authority component exists
PROPERTY: PASS - property authority can instantiate
PROPERTY: isolated data root D:/git/carworld/.worktrees/america-foundation/.superpowers/sdd/2026-09-05-america-foundation/test-appdata/Godot/app_userdata/DRIVN/property_ledger_sim_13444_218074
PROPERTY: PASS - unopened authority fails closed
PROPERTY: PASS - new authority is durably opened
PROPERTY: PASS - accounts start unfunded
PROPERTY: PASS - second account created
PROPERTY: PASS - unfunded purchase rejected
PROPERTY: PASS - credits fund two buyers
PROPERTY: PASS - first buyer wins
PROPERTY: PASS - second buyer loses without debit
PROPERTY: PASS - one owner and exact winning debit
PROPERTY: PASS - winning purchase receipt replays
PROPERTY: PASS - credit receipt replays without reward
PROPERTY: PASS - altered purchase receipt rejected
PROPERTY: PASS - altered credit receipt rejected
PROPERTY: PASS - cross-operation receipt reuse rejected
PROPERTY: PASS - snapshot is a detached deep copy
PROPERTY: PASS - restart preserves complete authority state
PROPERTY: PASS - receipt survives restart
PROPERTY: PASS - numeric credit receipt survives restart
PROPERTY: PASS - owner access only by default
PROPERTY: PASS - outsider storage denied
PROPERTY: PASS - non-owner cannot grant
PROPERTY: PASS - owner grants existing guest
PROPERTY: PASS - owner stores catalog item
PROPERTY: PASS - guest adds within capacity
PROPERTY: PASS - total item count bounds capacity
PROPERTY: PASS - guest takes and conserves counts
PROPERTY: PASS - storage receipts prevent double movement
PROPERTY: PASS - storage receipt rejects changed quantity
PROPERTY: PASS - cannot remove more than stored
PROPERTY: PASS - taking whole stack removes empty key
PROPERTY: PASS - owner revokes access
PROPERTY: PASS - revoked guest cannot move storage
PROPERTY: PASS - old grant replay does not restore access
PROPERTY: PASS - invalid ID rejected:
PROPERTY: PASS - invalid ID rejected: ../alice
PROPERTY: PASS - invalid ID rejected: a b
PROPERTY: PASS - invalid ID rejected: aaaaaaaaaaaa
PROPERTY: PASS - invalid quantity rejected: 0
PROPERTY: PASS - invalid quantity rejected: -1
PROPERTY: PASS - invalid quantity rejected: 1000000001
PROPERTY: PASS - unknown item rejected
PROPERTY: PASS - unknown account rejected
PROPERTY: PASS - unknown guest rejected
PROPERTY: PASS - unknown parcel rejected
PROPERTY: PASS - rejected commands leave no mutations or receipts
PROPERTY: PASS - account ensure is idempotent
PROPERTY: PASS - storage and revocation persist
PROPERTY: PASS - corrupt JSON fails without reset
PROPERTY: PASS - corrupt version rejected
PROPERTY: PASS - corrupt accounts rejected
PROPERTY: PASS - corrupt parcels rejected
PROPERTY: PASS - corrupt receipts rejected
PROPERTY: PASS - negative saved balance rejected
PROPERTY: PASS - non-writable open preserves live state
PROPERTY: PASS - malformed parcel rows rejected
PROPERTY: PASS - failed durable commit cannot credit
PROPERTY: PASS - failed durable commit cannot create account
PROPERTY: PASS - failed commit preserved previous disk contents
PROPERTY: PASS - failed receipt can retry after IO recovers
PROPERTY: PASS - three shipped properties validate
PROPERTY: 62 passed, 0 failed
```

Existing save regression, isolated process APPDATA:

```powershell
$env:APPDATA = 'D:/git/carworld/.worktrees/america-foundation/.superpowers/sdd/2026-09-05-america-foundation/test-appdata-save'
New-Item -ItemType Directory -Force -Path $env:APPDATA | Out-Null
& 'C:/Users/taskm/Downloads/projects/Godot/Godot_v4.5.1-stable_win64_console.exe' --headless --path game res://proto3d/tests/save_sim.tscn
```

Exit **0**, clean output, including:

```text
SAVE: PASS - the save hit the disk
SAVE: PASS - load succeeds
SAVE: PASS - the pockets came back (72 scrip)
SAVE: PASS - the HOME came back (walls 1)
SAVE: PASS - double-load doesn't duplicate the pack (1 Keeper)
SAVE: PASS - old-save jack lands as scrip, additive (40+2=42)
SAVE RESULTS: 21 passed, 0 failed
SAVE: ALL CHECKS PASSED
```

Existing homebase regression, separate isolated process APPDATA:

```powershell
$env:APPDATA = 'D:/git/carworld/.worktrees/america-foundation/.superpowers/sdd/2026-09-05-america-foundation/test-appdata-homebase'
New-Item -ItemType Directory -Force -Path $env:APPDATA | Out-Null
& 'C:/Users/taskm/Downloads/projects/Godot/Godot_v4.5.1-stable_win64_console.exe' --headless --path game res://proto3d/tests/homebase_sim.tscn
```

Exit **0**:

```text
HOME: PASS - the board stands at home
HOME: PASS - no scrap = no walls (the sink pulls you OUT to scavenge)
HOME: PASS - the whole ladder BUILT (walls 3, 7 upgrades)
HOME: PASS - the costs were REAL (scrap spent: 14 left)
HOME: PASS - the WORKBENCH turns scrap into a bandage
HOME: PASS - the BED sleeps you to DAWN (day 2, 06:00)
HOME: PASS - …and the weight drops (stress 70 → 40)
HOME: PASS - the GARAGE works the parked rig (engine 40 → 56)
HOME: PASS - the KENNEL heals the home dog (20 → 30)
HOME: PASS - KENNEL law: a home dog gets HURT, never taken (hp 8)
HOME: PASS - WALLS III thin the raids (11/100 walled vs 44/100 bare)
HOME RESULTS: 11 passed, 0 failed
HOME: ALL CHECKS PASSED
WARNING: ObjectDB instances leaked at exit (run with --verbose for details).
ERROR: 1 resources still in use at exit (run with --verbose for details).
```

Those homebase teardown diagnostics match the supplied baseline; this isolated authority introduces no scene nodes/resources into the main runtime.

## Self-review and remaining limitations

- Checked all requested public signatures, copy isolation, pre-commit validation, atomic-replace failure path, numeric precision bounds, account/guest references, successful-only receipts, and exact owned-file staging. No broad framework or runtime coupling added.
- Tests invoke actual production authority methods and real Godot file I/O. Buyer competition is sequential commands through one authority (the intended single-writer serialization), not a multithreaded race or MMO load test. No teleported gameplay is claimed.
- This component requires **one authority instance/writer per file**, on one serialized execution path. No interprocess locking, thread synchronization, stale-writer detection, authentication, network adapter, or MMO-scale guarantee exists.
- Flush + same-directory rename is verified with real Windows file replacement. Sudden power-loss durability, parent-directory fsync, hostile filesystem replacement, remote filesystems, disk-full hardware faults, and process-kill fault injection are not certified. Orphaned temp files after a hard crash are not auto-recovered; only the authoritative destination is loaded.
- A single JSON snapshot is rewritten and fully validated per command. The finite receipt/file bounds fail explicitly and require operational rollover/migration before long-lived production use. No automatic receipt pruning occurs because it would break replay guarantees.
- Parcel-set additions/removals and catalog deletions that invalidate stored items/receipts require explicit migration. Current row price changes affect only future purchases; capacity reductions below stored contents cause open to reject. No migration, backup recovery, or salvage reset was invented.
- Stored data is structurally validated, not cryptographically signed or reconstructed from an accounting journal. The file and catalog are trusted server assets, not attacker-supplied authorization evidence.
- `store_item`/`take_item` conserve **ledger** counts; they do not debit/credit backpacks. The runtime adapter must own crash-safe cross-inventory transfer and replay handling. Returning historical success must not cause that adapter to credit a backpack again. That unresolved transaction boundary was explicitly reported to the parent.
- Public quantity signatures are typed `int` as required. Any external adapter must reject fractional/untyped network values before Godot argument coercion. The saved JSON validator itself rejects fractions and non-numeric values.
- All-account snapshots must stay on the trusted authority/admin side; filter account/parcel projections before sharing with clients.
- Shipped model references are content contracts only. Task 2 owns model creation, placement, collision, cutaway, and live interaction.

Task 1 acceptance criteria are covered. Wider America foundation/runtime/MMO completion is not claimed.

## Review fix round 1 — verify closed temporary bytes

Fix commit: `72f4a4e` — `Verify closed property state bytes before atomic publication`.

The Important review finding was verified against the [Godot 4.5.1 Windows file implementation](https://github.com/godotengine/godot/blob/4.5.1-stable/drivers/windows/file_access_windows.cpp): `flush()` does not update the cached error from its stdio flush result. Therefore cached `get_error()` alone was insufficient to protect publication against deferred buffered-write failure.

`_persist()` now serializes once to UTF-8 bytes, checks the supported boolean result of `store_buffer`, flushes/closes, and calls a small production `_replace_verified()` publication helper. The helper reopens the closed temporary file, checks its exact byte length, reads the complete contents and read error, closes the reader, compares every byte with the intended serialization, and only then renames. Truncation, same-length corruption, read failure, store failure, and rename failure cannot publish a successful candidate. Existing `_persist` cleanup and `_commit` publish-after-success semantics remain in place.

No deterministic OS disk-full injection was attempted. Tests instead create actual truncated and same-length-altered temporary files and pass them through the real production publication boundary, which genuinely owns verification and replacement. Fixture writing/restoration is test-only. Both failures assert that the authority destination bytes and detached in-memory snapshot remain unchanged. An exact-content fixture also proves valid output can replace the destination. The existing command-level failed-write checks still prove no balance/account/receipt publication after `_persist` fails.

### RED/GREEN

First extracted the pre-existing rename operation into the publication helper without validation (behavior-preserving), then added the failing incomplete-output fixtures before implementing validation.

Both runs used:

```powershell
$env:APPDATA = 'D:/git/carworld/.worktrees/america-foundation/.superpowers/sdd/2026-09-05-america-foundation/test-appdata'
& 'C:/Users/taskm/Downloads/projects/Godot/Godot_v4.5.1-stable_win64_console.exe' --headless --path game res://proto3d/tests/property_ledger_sim.tscn
```

RED exit **1**, original assertions still passed:

```text
PROPERTY: FAIL - incomplete or altered closed output rejects publication
PROPERTY: FAIL - incomplete output preserves disk and authority memory
PROPERTY: FAIL - incomplete or altered closed output rejects publication
PROPERTY: FAIL - incomplete output preserves disk and authority memory
PROPERTY: PASS - exact closed output can replace authority
PROPERTY: 63 passed, 4 failed
```

GREEN exit **0**, clean Godot output:

```text
PROPERTY: PASS - incomplete or altered closed output rejects publication
PROPERTY: PASS - incomplete output preserves disk and authority memory
PROPERTY: PASS - incomplete or altered closed output rejects publication
PROPERTY: PASS - incomplete output preserves disk and authority memory
PROPERTY: PASS - exact closed output can replace authority
PROPERTY: PASS - failed durable commit cannot credit
PROPERTY: PASS - failed durable commit cannot create account
PROPERTY: PASS - failed commit preserved previous disk contents
PROPERTY: PASS - failed receipt can retry after IO recovers
PROPERTY: PASS - three shipped properties validate
PROPERTY: 67 passed, 0 failed
```

`git diff --check` passed (Git's existing LF-to-CRLF advisory only). Only the ledger and its focused test changed. Existing `save_sim` was not rerun for this fix: it neither calls this component nor shares its persistence implementation, and the main save/runtime path was not modified. Its prior 21/21 result remains the recorded baseline, not a fresh claim. This check establishes complete readable file contents before replacement, not physical-media fsync/power-loss certification or protection against a hostile concurrent writer.
