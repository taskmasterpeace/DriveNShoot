extends Node

## Headless multiplayer connection test. Set env CARWORLD_NET=server to host, =client to join.
## Prints NET: lines and exits. Driven by tools/net_test.sh (launches a server + a client).

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
		nm.player_registered.connect(func(_id): print("NET: players=", nm.player_count()))
		nm.input_received.connect(func(id): print("NET: input throttle=", nm.get_input_for(id).get("throttle", -1)))
		# Stay alive; --quit-after ends it.
	elif mode == "client":
		nm.joined_server.connect(func(): print("NET: client_connected"))
		nm.spawned_as.connect(func(id):
			print("NET: spawned_as=", id)
			# Send a frame of input to the server to verify input replication.
			nm.send_input(1.0, 0.0, 0.5, false, true)
			await get_tree().create_timer(1.0).timeout
			get_tree().quit(0))
		nm.connection_failed.connect(func():
			print("NET: client_failed")
			get_tree().quit(1))
		var ok: bool = nm.join_server("127.0.0.1")
		print("NET: join_attempt=", ok)
	else:
		print("NET: no CARWORLD_NET mode set")
		get_tree().quit(0)
