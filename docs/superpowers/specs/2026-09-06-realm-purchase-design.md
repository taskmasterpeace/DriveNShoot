# Roadstead authenticated purchase authority

This implements the identity/purchase/recovery portion of
`docs/design/ROADSTEAD_REALM_NEXT.md`, not the whole realm gate or full-game goal.
The current local RoadLife game and co-op remain unchanged during this proof.

## Decision

Use an independently polled Godot SceneMultiplayer connection with a strict JSON
message protocol and the existing single-writer ProtoPropertyLedger. This keeps
the existing client-authored co-op transforms out of persistent transactions.
Reusing co-op RPCs would mix trust models; a new external backend would introduce
deployment and identity-provider dependencies before the basic authority proof.

The initial link only binds/connects to `127.0.0.1`. Credentials are verified by
an injected application verifier before admission. The separate test server uses
temporary high-entropy credential hashes and expiry rows, never a client account ID.
This is a reusable authority connection with test-only identity provisioning,
not public account authentication or encrypted/server-authenticated transport.

## Contracts

- Godot 4.5.1, typed GDScript, no new dependencies, no changes to local saves/co-op.
- SceneMultiplayer object decoding and server relay disabled; authentication timeout 3 seconds.
- Authentication wire payload: exactly `{version:1, credential:String}`; at most 1024 bytes.
- Verified identity: exactly `{account_id:String, expires_at:int}` from the verifier.
  Account must already exist in the authority; expiry checked on admission and every command.
- Command payload: exactly `{version:1, kind:"purchase", request_id:String, parcel_id:String}`.
  IDs use ASCII letters/digits plus `-._:`; request length 1..48, parcel/account 1..64.
  No funds, identity, location, cargo, credit, storage, or guest commands are accepted.
- JSON command packets limited to 2048 bytes. More than 32 commands in a rolling
  one-second peer window disconnects the peer; no unbounded request history in memory.
- Receipt namespace encodes account length before account and request, preventing
  cross-account collisions even when IDs contain colons. Ledger persist precedes success.
- Server reply receipt: `{version:1, kind:"receipt", request_id:String, ok:bool, error:String}`.
  Invalid schemas return an empty request ID, never echo arbitrary client content.
- Per-peer view: `{version:1, kind:"view", balance:int, parcels:Dictionary}`; each parcel
  includes only `ownership` (self/other/unowned) and `can_access` (bool). Never transmit
  raw owner IDs, all account balances, stored items, guests, receipts, or whole snapshots.
- Admission and every purchase result send a fresh own view; successful purchases
  additionally update other admitted peers. Reconnection reads durable current state.
- Teardown closes only the link's peer/API. A link must not replace SceneTree's existing
  multiplayer API. No RPC methods or object serialization are needed for this protocol.

## Observable acceptance

Unit behavior checks cover strict schemas, length/type bounds, detached private views,
receipt collision resistance, authentication expiry and unknown-account rejection.
The wire proof uses a headless realm and two independent real client processes:

1. Both admitted, both see unowned parcel and 500 scrip. Their actual network commands
   race for roadstead_001 (150). Exactly one succeeds; durable balances total 850.
2. Both observe complementary self/other ownership. Winner replays without debit;
   changed parcel with the same receipt is rejected. Invalid/expired credentials fail.
3. Forged account, funds, cargo, location and malformed/oversize packets do not mutate.
4. Exclusive write lock on the authority file causes no success acknowledgment or
   memory/disk change; releasing it lets the same request succeed once.
5. Terminate the task-owned server after acknowledged purchase, restart against the
   same store, reconnect independent clients and replay; funds/ownership are identical.
6. Corrupt store and omitted explicit test-server flag fail before listening; sessions
   expiring after admission cannot mutate. Client-side optimistic state is not evidence.

The test server and command-driving clients live under tests. Only the production
link/protocol belong under realm. Fixtures and credentials live in fresh ignored
build directories and must not be committed, printed, or exported as configured accounts.
No forced cleanup of other processes or existing user files is allowed.

## Still open

This does not connect the local game UI to a shared realm, authorize world movement,
mint road-job rewards, transfer backpacks, implement guest revocation over the wire,
filter world regions, coordinate multiple storage writers, or prove MMO capacity.
Those remain required by the full contract. Persist/rename is the existing verified
process-restart guarantee, not a claim of power-loss durability or database replication.

API references: [SceneMultiplayer authentication and raw messages](https://docs.godotengine.org/en/4.5/classes/class_scenemultiplayer.html),
[ENet binding and capacity caveats](https://docs.godotengine.org/en/4.5/classes/class_enetmultiplayerpeer.html).
