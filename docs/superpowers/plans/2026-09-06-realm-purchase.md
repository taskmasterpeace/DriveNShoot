# Roadstead Authenticated Purchase Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Verify separate authenticated clients purchasing persistent homes through a dedicated authority, toward the full DRIVN realm mission.

**Architecture:** Independent SceneMultiplayer raw-JSON link isolates persistent purchase authority from existing co-op. Reuse the real property ledger and expose only narrow per-peer views. Test-only process entrypoints provision credentials outside game resources.

**Tech Stack:** Godot 4.5.1, typed GDScript, PowerShell 7, existing ENet and ledger.

**Spec:** docs/superpowers/specs/2026-09-06-realm-purchase-design.md

## Global Constraints

- Godot 4.5.1, typed GDScript, no new dependencies, no changes to local saves/co-op.
- SceneMultiplayer object decoding and server relay disabled; authentication timeout 3 seconds.
- Only bind/connect to 127.0.0.1; no public deployment or account-provider claim.
- Credentials and fixture provisioning stay outside exported game resources; fixture server code lives under tests and requires an explicit flag.
- Every acceptance result must exercise real production code; network proof uses separate processes and durable disk evidence.
- Preserve the full-game goal and remaining ROADSTEAD_REALM_NEXT gates.

## Task 1: Strict production realm protocol and authenticated link

**Files:** Create `game/proto3d/realm/realm_protocol.gd`, `realm_link.gd`; create `game/proto3d/tests/realm_protocol_sim.gd/.tscn` and `realm_link_sim.gd/.tscn` (plus generated UIDs). Do not modify existing ledger or local gameplay.

**Interfaces:**
- `ProtoRealmProtocol.command_error(value: Variant) -> String`: empty only for exact command schema.
- `ProtoRealmProtocol.receipt_key(account_id: String, request_id: String) -> String`: collision-free, ledger-compatible, at most 128 chars.
- `ProtoRealmProtocol.project(state: Dictionary, account_id: String) -> Dictionary`: exact private view described in spec.
- `ProtoRealmLink extends Node`; signals `authenticated()`, `disconnected(reason: String)`, `message_received(message: Dictionary)`.
- `start_server(authority: ProtoPropertyLedger, verifier: Callable, port: int) -> Error`; verifier accepts credential String and returns verified identity Dictionary or empty rejection.
- `connect_loopback(port: int, credential: String) -> Error`; `send_command(command: Dictionary) -> Error`; `close() -> void`.
- Link owns an independently polled SceneMultiplayer, not SceneTree.multiplayer. Duplicate starts reject without replacing live connection; close is safe and frees its peer.

- [ ] Write tests first. The RED test dynamically loads missing script only after checking ResourceLoader.exists so missing functionality is an assertion failure, not parse failure. Catch these realistic bugs: unknown fields accepted, bool/fraction version accepted, request overflow, colon-based receipt collisions, raw account leakage, shared view mutation, unverified/expired accounts admitted, unauthenticated commands accepted, stale-session mutations, ignored packet limits and leaked network API replacement.

```gdscript
check("realm protocol exists", ResourceLoader.exists("res://proto3d/realm/realm_protocol.gd"))
var purchase := {"version":1, "kind":"purchase", "request_id":"buy-1", "parcel_id":"roadstead_001"}
# After loading production code: command_error(purchase) == "";
# command_error(purchase.merged({"account_id":"victim"})) != "".
# receipt_key("a:b", "c") != receipt_key("a", "b:c").
```

- [ ] Run RED with isolated APPDATA and the installed console Godot; retain exact failing output. Import new class names before later runs.
- [ ] Implement strict protocol and link. Parse size-bounded UTF-8 JSON before routing. The core mutation path must remain:

```gdscript
# peer_id comes from SceneMultiplayer.peer_packet, never client JSON.
var identity: Dictionary = admitted[peer_id]
# Reject expired identity and invalid exact schema before ledger call.
var result: Dictionary = ledger.purchase(identity.account_id, command.parcel_id,
    ProtoRealmProtocol.receipt_key(identity.account_id, command.request_id))
# Send receipt only after the real ledger returns; project separately for each peer.
```

- [ ] Run focused unit/local-wire sims GREEN plus `property_ledger_sim`. Real loopback clients may share a test process here, but call them component checks, not the Task 2 multi-process proof. Use temporary ports/files, no external services, and bounded watchdogs.
- [ ] Self-review, report exact RED/GREEN commands/output and files, commit only owned code/tests. Parent dispatches task review before Task 2 implementation.

## Task 2: Dedicated process race, restart, rejection and write-failure proof

**Files:** Create `game/proto3d/tests/realm_fixture_server.gd/.tscn`, `realm_fixture_client.gd/.tscn`, and `tools/realm_loopback.ps1`; add `docs/verification/REALM_PURCHASE_2026_09_06.md`; update current status in `docs/design/ROADSTEAD_REALM_NEXT.md`, `docs/HANDOFF.md`. Do not alter Task 1 interfaces or production gameplay without a parent ruling.

**Interfaces:** Consume Task 1 signatures exactly. Test server reads `--realm-test-server --config=<absolute path>`; test client reads `--config=<absolute path>`. PowerShell creates fresh isolated fixture paths and controls only its own child processes. Server config supplies ledger path, port, credential hash rows with account/expiry, stop marker, ready path; clients receive a single raw credential and unique profile, not other credentials.

- [ ] Write the PowerShell acceptance workflow first so it fails with the missing fixture scene before implementation. Use Start-Process Hidden with redirected logs, bounded waits, and own-process cleanup in finally. Require pwsh 7. No downloads, global process kills or secret logging.
- [ ] Implement fixture server: explicit flag or exit failure; validate complete config/hash rows before opening ledger; seed 500 test scrip per known account with stable fixture receipts before READY; corrupt existing store is never reset; verifier hashes supplied token and compares fixture expiry; bind loopback through production link.
- [ ] Implement fixture client: connect through production link, report admission/disconnect, retain actual incoming messages in result JSON; read numbered command files from its own fixture path and send exact requested packets. Test controller files are never network authority. Provide a common future send timestamp for the two-client race.

```powershell
# Hand-derived independent expectations after both real clients race:
if ($state.accounts.alice.scrip + $state.accounts.bob.scrip -ne 850) { throw 'Wrong debit' }
if ($state.parcels.roadstead_001.owner_id -notin @('alice','bob')) { throw 'No durable winner' }
# Both client views must show complementary self/other and balances 350/500.
# Repeating the winner request preserves that exact authority; reusing its request
# with roadstead_002 returns receipt_conflict without changes.
```

- [ ] Exercise every numbered acceptance in the design: racing, projections, exact replay and conflict, forged schema, bad/expired tokens, expiry after admission, oversized packet, real exclusive write lock and retry, forced task-server termination after acknowledgment and recovery, corrupt-state startup, omitted explicit flag. Tests must inspect the actual store and both clients' received messages. Do not claim interrupted backpack/guest/AOI proof.
- [ ] Run the complete workflow twice with fresh fixtures and retain outputs, checks and per-process logs under ignored build directories. Copy non-secret acceptance summaries into verification docs. Run the existing property ledger and local road-life regressions after network proof.
- [ ] Document exact passing/failed counts and limitations, commit only owned code/docs, request task review and whole-milestone review. Leave full-game goal active.

## Task 3: Fail-closed road-life regression profile guard (incident remediation)

An unisolated component invocation wrote to the existing normal player save.
See `docs/verification/TEST_SAVE_ISOLATION_INCIDENT_2026_09_06.md`; recovery is
unresolved and must not be hidden by passing assertions. Add a guard before the
road-life harness loads the game or reads a save, accepting only user-data paths
inside this checkout's designated `build/` or `.superpowers/sdd/` test roots.

**Files:** `game/proto3d/tests/road_life_sim.gd`, new
`tools/road_life_profile_guard.ps1`; update only incident prevention status.

- [ ] Test first with a fresh disposable normal-like profile outside approved
  roots and a save sentinel. Explicit APPDATA/LOCALAPPDATA apply even to RED.
  Preserve evidence that old behavior modifies only this owned sentinel.
- [ ] Refuse unsafe paths before either exercise or restart-check; normalize
  Windows case, separators and dot segments; require full component containment.
- [ ] GREEN proves rejected-profile sentinel unchanged and allowed fresh-profile
  real-input road-life71/0. Hidden owned processes, bounded waits and no deletion.
- [ ] Retain exact commands/profile paths/logs, self-review, commit owned files,
  independent task review, then whole-milestone review. Do not claim save recovery.
