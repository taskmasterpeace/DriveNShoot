# Roadstead: next persistent-realm gate

**Status: partial process proof implemented (2026-09-06).** The authenticated
loopback purchase/race/replay/write-failure/restart slice passes twice in separate
processes; see `docs/verification/REALM_PURCHASE_2026_09_06.md`. The playable
property panel is still offline/local and is not connected to this authority.
Public authentication, encrypted/server-authenticated transport, realm world and
door authority, backpack/guest/AOI behavior, operations and capacity remain open.

## Current boundary

`proto3d/net.gd` configures an ENet host with `MAX_PEERS = 31` and sends local player/vehicle state at `SYNC_HZ = 20`. `push_state` accepts peer-authored transforms; `pvp_hit` accepts a peer-supplied amount. Those are existing co-op design choices, not a measured MMO capacity or a trusted persistent economy. Raising the peer setting does not solve server simulation, authentication, relevance filtering or storage authority.

RoadLife's first checkpoint is deliberately local. Do not add a remotely callable function that accepts an arbitrary account ID, reward amount, item count or claimed destination and delegates straight to its ledger.

## Smallest meaningful process proof — completed subset

Run a **separate headless realm process and two independent clients**, each with its own local profile. Use explicit server startup, dummy audio and test-only identity fixtures. Do not infer server mode merely because a test harness is headless. Godot supports dedicated-server exports that can strip unnecessary visual resources and provide a dedicated feature tag. [Godot 4.5 dedicated-server documentation](https://docs.godotengine.org/en/4.5/tutorials/export/exporting_for_dedicated_servers.html).

The server must map a verified connection to a stable account before accepting gameplay commands. Godot's `SceneMultiplayer` provides an authentication phase; an empty authentication callback accepts peers automatically. Implement credential verification, expiry, rejection and account mapping in the application, rather than treating the callback's existence as authentication. Keep object decoding disabled for untrusted traffic. [Godot 4.5 SceneMultiplayer](https://docs.godotengine.org/en/4.5/classes/class_scenemultiplayer.html).

| Acceptance case | Observable result required |
|---|---|
| Two clients purchase the same parcel | Exactly one owner and one debit, as observed by both clients and the durable authority |
| Repeat/reorder/disconnect during purchase | Stable command receipt, no duplicate charge, coherent reconnection result |
| Restart the server after acknowledgment | Ownership, funds, stored items and revoked access survive |
| Client lies about another account, funds, cargo or location | Server rejects it without authority mutation |
| Guest granted, then revoked | Access works only while authorized; stale UI requests are rejected after revocation |
| Backpack/storage movement interrupted at each commit boundary | No extra items and no acknowledged loss after recovery |
| Distant player changes region | Only relevant world state is delivered; reconnect restores the correct view |
| Save write fails or state is malformed | No success acknowledgment or silent reset; failure is surfaced and recoverable |

Use per-peer projections and spatial relevance rules instead of broadcasting account snapshots or the entire country. Godot's synchronizer supports peer visibility filters, but the actual relevance policy and its performance remain application work. [Godot 4.5 MultiplayerSynchronizer](https://docs.godotengine.org/en/4.5/classes/class_multiplayersynchronizer.html).

## What does not pass this gate

- Two account IDs in one sequential unit test: proves ledger rules, not network identity or multi-process behavior.
- An ENet connection or a port open on localhost: proves connectivity, not authentication or durable authority.
- A client-provided transform near the destination: not sufficient evidence to mint persistent rewards.
- A successful two-client test: not an MMO-scale capacity result.

After this proof, measure server tick time, update bandwidth, memory growth, persistence latency, disconnect recovery and long-running resource leaks on declared hardware. Only then set a supported player count. Public deployment additionally needs operational recovery, account/abuse controls, transport/credential review, release packaging and a deployment authorization; none was provisioned during the Blender/local milestone.

The 2026-09-06 process run satisfies only the purchase-related rows above. Guest
revocation, backpack/storage commit boundaries and distant-region relevance are
still unimplemented acceptance work, as is the adapter that would replace the
offline panel's synchronous full-ledger reads with asynchronous private views.
