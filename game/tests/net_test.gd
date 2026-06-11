extends Node

## Headless multiplayer connection test. Set env CARWORLD_NET=server to host, =client to join.
## Prints NET: lines and exits. Driven by tools/net_test.sh (launches a server + a client).

var _server_vehicle: Node = null
var _client_vehicle: Node = null

func _ready() -> void:
	var mode: String = OS.get_environment("CARWORLD_NET")
	var nm = get_node_or_null("/root/NetworkManager")
	if not nm:
		print("NET: no NetworkManager autoload")
		get_tree().quit(2)
		return

	if mode == "server":
		var ok: bool = nm.host_server()
		print("NET: server_started=", ok)
		nm.peer_joined.connect(func(id): print("NET: peer_joined=", id))
		nm.player_registered.connect(func(id):
			print("NET: players=", nm.player_count())
			# Spawn a server-side networked vehicle controlled by this peer.
			_server_vehicle = load("res://entities/vehicles/vehicle_entity.tscn").instantiate()
			_server_vehicle.network_peer_id = id
			_server_vehicle.data = load("res://data/vehicles/vehicle_balanced.tres")
			add_child(_server_vehicle)
			_server_vehicle.is_active = true
			# A second networked vehicle (a stand-in "other player", id 999) the server's auto-sync
			# will broadcast for clients to render.
			var ghost: Node = load("res://entities/vehicles/vehicle_entity.tscn").instantiate()
			ghost.network_peer_id = 999
			ghost.data = load("res://data/vehicles/vehicle_balanced.tres")
			add_child(ghost)
			ghost.global_position = Vector2(9000, -500))
		nm.input_received.connect(func(id):
			print("NET: input throttle=", nm.get_input_for(id).get("throttle", -1))
			# Server auto-sync (NetworkManager._physics_process) broadcasts state; no manual call.
			await get_tree().create_timer(0.15).timeout
			if is_instance_valid(_server_vehicle):
				print("NET: vehicle_throttle=", _server_vehicle.input_throttle))
		# Stay alive; --quit-after ends it.
	elif mode == "client":
		nm.joined_server.connect(func(): print("NET: client_connected"))
		nm.state_synced.connect(func(): print("NET: state_synced keys=", nm.remote_states.size()))
		nm.spawned_as.connect(func(id):
			print("NET: spawned_as=", id)
			# Render a remote player's vehicle (id 999) from synced state — should interpolate
			# toward the server's position (y -500), proving client-side state application.
			_client_vehicle = load("res://entities/vehicles/vehicle_entity.tscn").instantiate()
			_client_vehicle.network_peer_id = 999
			_client_vehicle.data = load("res://data/vehicles/vehicle_balanced.tres")
			add_child(_client_vehicle)
			_client_vehicle.global_position = Vector2(0, 0)
			# Send a frame of input to the server to verify input replication.
			nm.send_input(1.0, 0.0, 0.5, false, true)
			await get_tree().create_timer(1.2).timeout
			if is_instance_valid(_client_vehicle):
				print("NET: client_state_applied=", _client_vehicle.global_position.y < -50.0)
			get_tree().quit(0))
		nm.connection_failed.connect(func():
			print("NET: client_failed")
			get_tree().quit(1))
		var ok: bool = nm.join_server("127.0.0.1")
		print("NET: join_attempt=", ok)
	else:
		print("NET: no CARWORLD_NET mode set")
		get_tree().quit(0)
