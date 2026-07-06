## PROTONET — the multiplayer transport for the 3D mainline (docs/MULTIPLAYER_PLAN).
## The whole engine was built for this: input packets (the body consumes a struct),
## the ONE DAMAGE LAW (every fighter is a `combatant`), player_record (the
## join-in-progress snapshot), and seat anchors (a rider = one int). This layer
## just moves bytes.
##
## MODEL: client-authoritative players (the doc's endorsed pragmatic rule). Each
## client simulates ITS OWN body from real input and broadcasts its state ~20 Hz;
## every peer holds the others as REMOTE bodies that lerp to the last state. The
## host owns the world (enemies, the ring) — those broadcast from the server.
## Co-op first; PvP damage already works through the one damage law.
class_name ProtoNet
extends Node

signal peer_joined(id: int)
signal peer_left(id: int)

const PORT := 24555
const MAX_PEERS := 31
const SYNC_HZ := 20.0

var _main: Node = null
var online: bool = false
var _sync_t: float = 0.0
## peer_id -> {pos, byaw, ayaw, hurt, armed} last-known state (for late spawns + lerp).
var peer_state: Dictionary = {}


static func create(main: Node) -> ProtoNet:
	var n := ProtoNet.new()
	n._main = main
	n.name = "ProtoNet"
	return n


func is_server() -> bool:
	return online and multiplayer.is_server()


func my_id() -> int:
	return multiplayer.get_unique_id() if online else 1


# --- Connect --------------------------------------------------------------------

func host(port: int = PORT) -> bool:
	var peer := ENetMultiplayerPeer.new()
	var err := peer.create_server(port, MAX_PEERS)
	if err != OK:
		_main.notify("🌐 Host FAILED (port %d busy?)" % port)
		return false
	multiplayer.multiplayer_peer = peer
	_wire_signals()
	online = true
	_main.notify("🌐 HOSTING on :%d — friends can JOIN your IP. You are player 1." % port)
	return true


func join(ip: String = "127.0.0.1", port: int = PORT) -> bool:
	var peer := ENetMultiplayerPeer.new()
	var err := peer.create_client(ip, port)
	if err != OK:
		_main.notify("🌐 Join FAILED (%s:%d)" % [ip, port])
		return false
	multiplayer.multiplayer_peer = peer
	_wire_signals()
	multiplayer.connected_to_server.connect(func() -> void:
		online = true
		_main.notify("🌐 CONNECTED — you're in the wasteland with %d others" % peer_state.size()))
	multiplayer.connection_failed.connect(func() -> void:
		_main.notify("🌐 Could not reach the host"))
	return true


func leave() -> void:
	if multiplayer.multiplayer_peer != null:
		multiplayer.multiplayer_peer.close()
	multiplayer.multiplayer_peer = null
	online = false
	peer_state.clear()


func _wire_signals() -> void:
	if not multiplayer.peer_connected.is_connected(_on_peer_connected):
		multiplayer.peer_connected.connect(_on_peer_connected)
		multiplayer.peer_disconnected.connect(_on_peer_disconnected)


func _on_peer_connected(id: int) -> void:
	peer_joined.emit(id)
	_main.notify("🌐 Player %d joined the wasteland" % id)


func _on_peer_disconnected(id: int) -> void:
	peer_state.erase(id)
	peer_left.emit(id)
	_main.notify("🌐 Player %d dropped" % id)


# --- Replication ----------------------------------------------------------------

## Called by main each frame: throttle to SYNC_HZ, then broadcast MY body's state.
func tick(delta: float) -> void:
	if not online:
		return
	_sync_t += delta
	if _sync_t < 1.0 / SYNC_HZ:
		return
	_sync_t = 0.0
	push_state.rpc(local_state())
	# The HOST owns the shared world: it streams the enemies so every client
	# fights the SAME howler pack, not its own private copy.
	if is_server():
		var es: Array = _main.net_enemy_states()
		if not es.is_empty() or _last_enemy_count > 0:
			_last_enemy_count = es.size()
			sync_enemies.rpc(es)


var _last_enemy_count: int = 0


## MY body this frame — on foot OR at the wheel. A driving peer syncs the CAR
## (class + transform) so the others see a real rig on the road, not a body
## frozen where it parked. Stamped with a monotonic seq for interpolation.
func local_state() -> Dictionary:
	_seq += 1
	var p: ProtoPlayer3D = _main.player
	var st := {"seq": _seq, "hurt": p.hurt}
	if _main.mode == _main.Mode.DRIVE and _main.active_car != null and is_instance_valid(_main.active_car):
		var c: ProtoCar3D = _main.active_car
		st["drive"] = true
		st["vclass"] = c.vclass
		st["pos"] = [c.global_position.x, c.global_position.y, c.global_position.z]
		st["byaw"] = c.global_rotation.y
	else:
		st["drive"] = false
		st["pos"] = [p.global_position.x, p.global_position.y, p.global_position.z]
		st["byaw"] = p.body_yaw
		st["ayaw"] = p.aim_yaw
		st["armed"] = p._gun != null and p._gun.visible
	return st

var _seq: int = 0


## Any client → everyone: here is my body this frame. (The sender's id is implicit.)
@rpc("any_peer", "unreliable_ordered", "call_remote")
func push_state(st: Dictionary) -> void:
	ingest_state(multiplayer.get_remote_sender_id(), st)


## Host → clients: the authoritative enemy roster (id → {kind, pos, byaw, hp}).
@rpc("authority", "unreliable_ordered", "call_remote")
func sync_enemies(states: Array) -> void:
	if _main.has_method("net_apply_enemies"):
		_main.net_apply_enemies(states)


## Apply a peer's state (also the seam sims drive directly, no socket needed).
func ingest_state(from: int, st: Dictionary) -> void:
	# INTERPOLATION BUFFER: keep the last two states per peer + a wall-clock stamp
	# so the body plays motion BETWEEN snapshots instead of snapping to the newest
	# (kills the 20 Hz rubber-band). Out-of-order packets are dropped by seq.
	var buf: Array = peer_buffer.get(from, [])
	if not buf.is_empty() and int(st.get("seq", 0)) <= int(buf[-1].get("seq", 0)):
		return # stale/duplicate
	buf.append(st)
	while buf.size() > 3:
		buf.pop_front()
	peer_buffer[from] = buf
	peer_state[from] = st
	if _main.has_method("net_apply_peer"):
		_main.net_apply_peer(from, st)


var peer_buffer: Dictionary = {} ## peer_id -> [recent states] for interpolation
