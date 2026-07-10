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
## Every in-world cartridge shares this one generic invite/input/event/snapshot
## bridge. It is a child named Arcade so every ENet peer gets the same RPC path.
var arcade: Node = null

## PROXIMITY VOICE (owner goal): one ProtoVoice runs locally — it captures MY
## mic + owns RX playback for every remote peer. Created when a session starts
## (host or client), torn down on leave(). A body's speaker attaches/detaches
## off this SAME peer_joined/peer_left pair proto3d.gd's remote bodies use —
## deferred one frame so _net_spawn_peer (in _main) has already made the body
## by the time we go looking for it (no assumption about listener order).
var voice: ProtoVoice = null


static func create(main: Node) -> ProtoNet:
	var n := ProtoNet.new()
	n._main = main
	n.name = "ProtoNet"
	var arcade_script := load("res://proto3d/games/game_net.gd") as GDScript
	n.arcade = arcade_script.create(n)
	n.add_child(n.arcade)
	n.peer_joined.connect(n._on_voice_peer_joined)
	n.peer_left.connect(n._on_voice_peer_left)
	return n


func is_server() -> bool:
	return online and multiplayer.has_multiplayer_peer() and multiplayer.is_server()


func my_id() -> int:
	return multiplayer.get_unique_id() if (online and multiplayer.has_multiplayer_peer()) else 1


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
	_ensure_local_voice()
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
		_ensure_local_voice()
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
	if arcade != null:
		arcade.clear_session()
	_teardown_local_voice()


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


# --- THE FUN PASS (COOP_PVP_MOBILE Track A+B): horn pings, PvP rules ------------
# Send helpers are GUARDED so sims can drive the receive handlers directly
# (the ingest_state pattern) without a socket. net_loopback proves the wire.

## Comedy AND navigation: the horn carries over the net (a friend is honking).
@rpc("any_peer", "reliable", "call_remote")
func horn_ping(pos: Array) -> void:
	if _main.has_method("net_horn_ping"):
		_main.net_horn_ping(multiplayer.get_remote_sender_id(), Vector3(pos[0], pos[1], pos[2]))


func send_horn_ping() -> void:
	if online and multiplayer.has_multiplayer_peer():
		var p: Vector3 = _main.player.global_position
		horn_ping.rpc([p.x, p.y, p.z])


## PvP: MY machine saw MY iron land on YOUR body — you take it under YOUR law
## (the victim's machine applies or refuses; late/foul packets can't hurt at home).
@rpc("any_peer", "reliable", "call_remote")
func pvp_hit(amount: float) -> void:
	if _main.has_method("net_pvp_hit"):
		_main.net_pvp_hit(multiplayer.get_remote_sender_id(), amount)


func send_pvp_hit(victim_peer: int, amount: float) -> void:
	if online and multiplayer.has_multiplayer_peer():
		pvp_hit.rpc_id(victim_peer, amount)


## PvP: I died to killer_id — the whole room reads the consequence.
@rpc("any_peer", "reliable", "call_remote")
func pvp_death(killer_id: int) -> void:
	if _main.has_method("net_pvp_death"):
		_main.net_pvp_death(multiplayer.get_remote_sender_id(), killer_id)


func send_pvp_death(killer_id: int) -> void:
	if online and multiplayer.has_multiplayer_peer():
		pvp_death.rpc(killer_id)


## The HOST sets the session's PvP rules; every peer reads the same law.
@rpc("authority", "reliable", "call_remote")
func sync_pvp(mode: String) -> void:
	if _main.has_method("net_set_pvp"):
		_main.net_set_pvp(mode)


func send_pvp_mode(mode: String) -> void:
	if is_server():
		sync_pvp.rpc(mode)


# --- PROXIMITY VOICE CHAT: capture -> VAD -> unreliable frames -> per-peer -----
# 3D playback (docs owner goal). ONE ProtoVoice runs locally per session: it
# captures MY mic and hosts RX for every remote peer. tx_sink hands captured
# frames straight to the broadcast RPC below — voice.gd never touches the net.

func _ensure_local_voice() -> void:
	if voice != null and is_instance_valid(voice):
		return
	voice = ProtoVoice.create()
	add_child(voice)
	voice.tx_sink = Callable(self, "_on_local_voice_frame")
	# Late joiners already in remote_players (a client connecting into a room
	# that's mid-session) get a speaker retroactively — not just future joins.
	for id in _main.remote_players:
		var body: Node = _main.remote_players[id]
		if body is Node3D and is_instance_valid(body):
			voice.attach_speaker(id, body)


func _teardown_local_voice() -> void:
	if voice != null and is_instance_valid(voice):
		voice.queue_free()
	voice = null


func _on_local_voice_frame(seq: int, pcm: PackedByteArray) -> void:
	if online and multiplayer.has_multiplayer_peer():
		voice_frame.rpc(seq, ProtoVoice.pack_frame(seq, pcm))


## Any client -> everyone: a talk-frame from the sender's mic. Unreliable — a
## dropped voice packet is just a dropped syllable, never worth a resend.
@rpc("any_peer", "unreliable", "call_remote")
func voice_frame(_seq: int, data: PackedByteArray) -> void:
	if voice != null and is_instance_valid(voice):
		voice.rx(multiplayer.get_remote_sender_id(), data)


## peer_joined/peer_left fire the same frame _net_spawn_peer/_net_despawn_peer
## (in _main) run on — deferred one call so the remote body already exists by
## the time we look it up (no assumption about which listener runs first).
func _on_voice_peer_joined(id: int) -> void:
	call_deferred("_attach_voice_for_peer", id)


func _attach_voice_for_peer(id: int) -> void:
	if voice == null or not is_instance_valid(voice):
		return
	var body: Node = _main.remote_players.get(id)
	if body is Node3D and is_instance_valid(body):
		voice.attach_speaker(id, body)


func _on_voice_peer_left(id: int) -> void:
	if voice != null and is_instance_valid(voice):
		voice.detach_speaker(id)
