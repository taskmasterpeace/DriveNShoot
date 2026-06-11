extends Node
## NetworkManager — hosts/joins multiplayer sessions over ENet. Foundation for the 32-player
## co-op/PvP vision (see docs/MULTIPLAYER_PLAN.md). Single-player ignores this entirely.

const DEFAULT_PORT: int = 27015
const MAX_PLAYERS: int = 32

signal server_started
signal joined_server
signal connection_failed
signal peer_joined(id: int)
signal peer_left(id: int)
signal session_ended
signal player_registered(id: int)
signal player_unregistered(id: int)
signal spawned_as(id: int) ## Client-side: the server assigned us this peer id and told us to spawn.

var peer: ENetMultiplayerPeer = null
var players: Dictionary = {} ## peer_id -> info. Server-authoritative roster of connected players.

func _ready() -> void:
	# These multiplayer signals are global; wire them once.
	multiplayer.peer_connected.connect(_on_peer_connected)
	multiplayer.peer_disconnected.connect(_on_peer_disconnected)
	multiplayer.connected_to_server.connect(_on_connected_to_server)
	multiplayer.connection_failed.connect(_on_connection_failed)
	multiplayer.server_disconnected.connect(_on_server_disconnected)

## Start hosting. Returns true on success.
func host_server(port: int = DEFAULT_PORT) -> bool:
	peer = ENetMultiplayerPeer.new()
	var err: int = peer.create_server(port, MAX_PLAYERS)
	if err != OK:
		push_warning("NetworkManager: host failed (%d)" % err)
		peer = null
		return false
	multiplayer.multiplayer_peer = peer
	players.clear()
	players[1] = {"name": "Host"} # the server is player 1
	server_started.emit()
	return true

## Connect to a host. Returns true if the attempt started (success is async via joined_server).
func join_server(address: String = "127.0.0.1", port: int = DEFAULT_PORT) -> bool:
	peer = ENetMultiplayerPeer.new()
	var err: int = peer.create_client(address, port)
	if err != OK:
		push_warning("NetworkManager: join failed (%d)" % err)
		peer = null
		return false
	multiplayer.multiplayer_peer = peer
	return true

func disconnect_session() -> void:
	if peer:
		peer.close()
		peer = null
	multiplayer.multiplayer_peer = null
	session_ended.emit()

func is_active() -> bool:
	return multiplayer.multiplayer_peer != null

func is_server() -> bool:
	return is_active() and multiplayer.is_server()

func local_id() -> int:
	return multiplayer.get_unique_id() if is_active() else 0

# --- internal signal relays ---
func _on_peer_connected(id: int) -> void:
	peer_joined.emit(id)
	# Server authoritatively registers the new player and tells them to spawn.
	if multiplayer.is_server():
		players[id] = {"name": "Player %d" % id}
		player_registered.emit(id)
		_client_spawn.rpc_id(id, id)

func _on_peer_disconnected(id: int) -> void:
	if multiplayer.is_server() and players.has(id):
		players.erase(id)
		player_unregistered.emit(id)
	peer_left.emit(id)

## Sent by the server to a freshly-connected client: "you are peer `my_id`, spawn yourself."
@rpc("authority", "call_remote", "reliable")
func _client_spawn(my_id: int) -> void:
	spawned_as.emit(my_id)

func player_count() -> int:
	return players.size()

func _on_connected_to_server() -> void:
	joined_server.emit()

func _on_connection_failed() -> void:
	peer = null
	multiplayer.multiplayer_peer = null
	connection_failed.emit()

func _on_server_disconnected() -> void:
	peer = null
	multiplayer.multiplayer_peer = null
	session_ended.emit()
