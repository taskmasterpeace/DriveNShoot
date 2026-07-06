# CarWorld — Multiplayer Implementation Plan (up to 32 players)

> **STATUS 2026-07-06: 3D CO-OP SLICE LIVE.** `game/proto3d/net.gd` (ProtoNet): ENet host/join
> (F7/F8), remote players spawn as real `combatant` bodies, client-authoritative state sync ~20Hz.
> Proven: `net_sim` (seams, in-process) + `tools/net_loopback.sh` (two live ENet processes connect).
> v2 (2026-07-06): VEHICLE sync (driving peers show a real rig), snapshot INTERPOLATION
> (seq-guarded 2-3 state buffer, no rubber-band), HOST-AUTHORITATIVE enemies (host streams
> the pack, clients ghost it + suppress their own director) — `net_sim` 16 checks.
> Remaining: interest management (AoI) for 32-scale, host-authoritative ring/world, a
> main-menu host/join flow. The 2D NetworkManager below is the prior-art reference.

## STATUS (2026-06-11): core netcode protocol BUILT + verified cross-process

`NetworkManager` autoload (`scripts/autoloads/network_manager.gd`) implements and `tools/net_test.sh`
verifies (launching a real headless server + client) the full server-authoritative round-trip:
- **Connection**: `host_server` / `join_server` over ENet (32 max). ✓
- **Roster**: server-authoritative `players` dict (host + each peer). ✓
- **Spawn handshake**: server RPCs each new client a spawn assignment (`_client_spawn`). ✓
- **Input replication**: client `send_input` → server `submit_input` RPC stores per-peer input. ✓
- **State sync**: server `broadcast_state` → client `receive_state` RPC applies the snapshot. ✓

Also DONE (entity-level, verified cross-process by net_test):
- `VehicleEntity.network_peer_id`: server drives networked vehicles from `get_input_for(peer)`;
  clients interpolate to `remote_states` (owning client forwards local input). ✓
- Server **auto-broadcasts** all networked vehicle states each ~3 frames (`NetworkManager._physics_process`). ✓

The server-authoritative netcode is functionally COMPLETE and self-running. Remaining is SCENE
INTEGRATION (needs the editor for scene nodes + multi-instance visual test):
- Add a `MultiplayerSpawner` under the world to spawn a player vehicle per peer at a town spawn,
  setting each one's `network_peer_id`.
- Main-menu host/join flow + connecting it to load the world.
- Per-peer persistence + interest management (reuse RoadManager region streaming) for 32-scale.

---


This is the concrete plan for System 5 from `MASTER_PROMPT.md`. It was NOT implemented in the
combat/world session (a server-authoritative 32-player layer is a multi-week build and was not
attempted without an editor to verify). This document grounds it in the actual codebase so the
next session — ideally with Godot open — can execute it directly.

## Why the current architecture is well-suited

The combat work was deliberately built to make this tractable:

- **Vehicles are input-driven.** `VehicleEntity` exposes `input_throttle`, `input_braking`,
  `input_steering`, `input_handbrake` (set by driver OR AI). This is exactly the seam for
  server-authoritative simulation: clients send these four inputs; the server runs the existing
  `_physics_process` and syncs the resulting transform back. No physics rewrite needed.
- **Every combatant already has a `team`** (0 = friendly, 1 = hostile). Extend this to a per-player
  `peer_id` for ownership and friendly-fire/scoring. Projectiles already carry `team` + `source`.
- **Damage is centralized**: `VehicleEntity.take_damage`, `CharacterEntity.health_controller`,
  and the generic `take_damage` (Bandit) — all server-authoritative damage flows through these.
- **Region streaming exists** (`RoadManager` chunk spawn/despawn): the basis for interest
  management so each client only syncs nearby entities — the key to 32 players scaling.

## Target model: dedicated-server-authoritative

- One headless server simulates the world; clients are thin (send input, render synced state).
- Use Godot 4.5 high-level multiplayer: `ENetMultiplayerPeer` + `MultiplayerSpawner` +
  `MultiplayerSynchronizer`.

## Phased steps

1. **Connection layer** (autoload `NetworkManager`):
   - `host_server(port)` → `ENetMultiplayerPeer.create_server(port, 32)`.
   - `join_server(ip, port)` → `create_client(ip, port)`.
   - Handle `peer_connected` / `peer_disconnected`; main menu → host/join flow.

2. **Player spawning** (`MultiplayerSpawner` under the world):
   - On `peer_connected`, server spawns a `player.tscn` instance, sets its `peer_id`, and assigns
     authority: `player.set_multiplayer_authority(1)` (server) for simulation, but read that peer's
     INPUT via RPC. Spawn at a town spawn point.
   - Tag each player vehicle/character with its `peer_id`; keep `team` for friend/foe.

3. **Input replication** (the core seam):
   - On each client, gather the four vehicle inputs (or on-foot move/aim/fire) and send them to the
     server every physics frame: `@rpc("any_peer", "unreliable_ordered") func push_input(throttle,
     braking, steering, handbrake, firing, aim_angle)`.
   - Server writes them into that peer's `VehicleEntity.input_*` / fires its weapons. The existing
     `get_input()` player branch becomes "use replicated input" on the server.

4. **State sync** (`MultiplayerSynchronizer` per networked entity):
   - Sync `global_position`, `rotation`, `velocity` (for interpolation), `hp`, current weapon/ammo.
   - Projectiles: spawn server-side via `MultiplayerSpawner`; clients render. Damage resolves only
     on the server (already team/source-aware), then `hp` syncs back.

5. **Interest management** (makes 32 players viable):
   - Reuse `RoadManager`'s active region concept: only replicate entities within ~N units of a
     given peer. Set `MultiplayerSynchronizer.visibility` per peer based on distance, or use
     `set_visibility_for(peer_id, bool)`. Despawn far entities for that peer.

6. **Per-player persistence**:
   - Key the existing `GameState` save (scrap, upgrades, unlocks) by peer identity instead of a
     single profile. Server owns the authoritative economy per player.

7. **AI ownership**:
   - Pursuers/bandits/convoys are simulated ONLY on the server (their `_physics_process` runs
     server-side); clients receive synced transforms. Guard AI `_physics_process` with
     `if not multiplayer.is_server(): return`.

## Acceptance test
Two+ local instances connect to one server, drive the same world, see each other move and shoot,
and combat/loot resolves consistently server-side. Then scale-test toward 32 peers with interest
management on.

## Gotchas to watch
- Don't run AI or spawn projectiles on clients — only the server. Clients render synced results.
- The vehicle physics is frame-rate sensitive; run the server at a fixed physics tick and
  interpolate on clients using the synced `velocity`.
- `team`/`source` friendly-fire checks already prevent self-hits; extend `source` comparison to
  per-peer ownership so teammates (if PvE co-op) don't damage each other unless PvP is enabled.
