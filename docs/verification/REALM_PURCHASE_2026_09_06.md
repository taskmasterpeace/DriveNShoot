# Realm purchase independent-process verification — 2026-09-06

## Result

The bounded loopback identity/purchase/recovery slice passes in separate Godot
processes. Two final executions used new random fixture directories, independent
APPDATA/LOCALAPPDATA profiles, distinct child PIDs and `127.0.0.1` only:

| Fresh evidence directory | Acceptance | Interrupted outcome before retry |
|---|---:|---|
| `build/realm-purchase-09e526b08eae402fa212afdd3ec91f6e` | 57 passed, 0 failed | authority had applied; winner balance 50 |
| `build/realm-purchase-3e7d5591415f4d0d87ccb8fc6637bee5` | 57 passed, 0 failed | authority had applied; winner balance 50 |

Each run inspected every child stdout/stderr file after task-owned cleanup and
found no `SCRIPT ERROR`, parse error, `ERROR` line or leak diagnostic. Full
fixtures, generated credential hashes and process logs remain under ignored
`build/`; credentials are not reproduced here.

## What the process proof observes

- A separate explicitly flagged authority and separate clients use production
  `ProtoRealmLink` for normal traffic. Controller command files are not network
  authority. Test-only raw peers send malformed/forged bytes that production
  client validation would otherwise reject locally.
- Alice and Bob each begin with a durable literal balance of 500. A shared-future
  race for the 150-scrip first roadstead produces one success, one exact
  `already_owned` receipt, balances 350/500 and one durable owner.
- Both normal client message histories contain hand-checked private projections:
  exact top-level keys, exact three parcel keys, complementary `self`/`other`, and
  no raw owner IDs, accounts, receipts, guests or stored items.
- Exact replay leaves authority bytes unchanged; redirecting the same successful
  request to the second parcel returns `receipt_conflict`. Forged identity, funds,
  cargo and location fields, unsupported kinds, malformed JSON and oversized
  authentication/command packets cannot mutate authority.
- Unknown and already-expired credentials receive no view. A short-lived identity
  is first admitted with a real view, then an actual post-expiry command disconnects
  without mutation.
- An exclusive Windows file lock forces `persistence_failed`, no success receipt,
  unchanged client view and byte-identical storage. Releasing the lock lets the
  same request debit exactly 225 once.
- The server is forcibly terminated only after an acknowledged purchase. A new
  process opens the same file; replacement clients observe the durable balances
  and deeds, and the original receipt still replays without a debit.
- A fresh client sends a real purchase packet and exits without recording a
  success receipt. The controller records the durable pre-retry outcome, then a
  replacement client retries the same request; final authority contains one
  300-scrip debit and one owner.
- Holding a normal client's result artifact under an exclusive Windows lock
  deterministically forces fixture publication retries. The actual replay receipt
  and view remain buffered in memory and publish after release without another
  network event. This is why acceptance never substitutes controller state for
  received messages.
- Case, separator, dot-segment and config-path aliases are compared under
  canonical Windows path identity before ledger open. Fresh-run sentinels prove
  aliases fail without creating authority or overwriting config/READY state.
- Every owned child receives a finite cleanup wait. A retained failure probe
  deliberately times out one owned handle, proves cleanup continues to the next,
  surfaces a nonzero result, then completes final cleanup of both probe children.
- Corrupt existing authority bytes remain identical after startup rejection.
  Omitting `--realm-test-server` creates no ledger/READY marker and leaves the
  selected loopback port available.

The Windows release preset has a tested static exclusion for
`proto3d/tests/realm_fixture_*`, so these provisioning fixtures are not selected
by that configuration. This run did not build and inspect a new export; actual
packaged absence remains for the next package verification.

## Commands and counts

```powershell
pwsh -NoProfile -File tools/realm_loopback.ps1
# 57 passed, 0 failed (fresh run 1)

pwsh -NoProfile -File tools/realm_loopback.ps1
# 57 passed, 0 failed (fresh run 2)

Godot_v4.5.1-stable_win64_console.exe --headless --path game --import
# exit 0; two pre-existing Dialogue Manager invalid-UID fallback warnings

$profile = Resolve-Path build/realm-purchase-task2-fix1/isolated-regression-profile-be2779981d8747ce93fb58c05dae9110
$env:APPDATA = Join-Path $profile "Roaming"
$env:LOCALAPPDATA = Join-Path $profile "Local"

Godot_v4.5.1-stable_win64_console.exe --headless --audio-driver Dummy --path game res://proto3d/tests/realm_protocol_sim.tscn
# 49 passed, 0 failed
Godot_v4.5.1-stable_win64_console.exe --headless --audio-driver Dummy --path game res://proto3d/tests/realm_link_sim.tscn
# 54 passed, 0 failed
Godot_v4.5.1-stable_win64_console.exe --headless --audio-driver Dummy --path game res://proto3d/tests/property_ledger_sim.tscn
# 67 passed, 0 failed
Godot_v4.5.1-stable_win64_console.exe --headless --audio-driver Dummy --path game res://proto3d/tests/road_life_sim.tscn
# 71 passed, 0 failed
```

The four isolated post-proof regressions total 241 passed, 0 failed. The exact
environment and command record is
`build/realm-purchase-task2-fix1/isolated-final-regression-env.json`; retained
outputs are `isolated-final-realm_protocol_sim.log`,
`isolated-final-realm_link_sim.log`, `isolated-final-property_ledger_sim.log`, and
`isolated-final-road_life_sim.log`. The two complete workflow outputs are retained
beside them as `final-process-workflow-1.log` and `final-process-workflow-2.log`.

An earlier component gate inherited the normal Godot profile, and its road-life
test changed the existing `user://drivn.save`. Those results are not used as the
isolated regression evidence above. The affected files were preserved under
`build/save-isolation-incident-f257d9f30f1a4eff8e8c987816a44cf4`; no restore,
delete, or further normal-profile mutation was attempted.

## Exact boundary

This is local loopback purchase authority with disposable hashed test credentials.
It is not production/public authentication, server-authenticated or encrypted
transport, a realm-connected property UI, door/world authority, road-job reward
minting, backpack/storage transfer recovery, guest revocation, AOI filtering,
multi-writer storage, operations readiness or MMO capacity evidence. The current
property panel remains offline/local and must never be described as a realm client.
