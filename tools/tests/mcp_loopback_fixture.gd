extends SceneTree
## Behavioral fixture: no editor startup and no socket before policy availability.

const POLICY_PATH := "res://addons/godot_mcp/loopback_listener.gd"
var passed: int = 0
var failed: int = 0

func _initialize() -> void:
	call_deferred("_run")

func _check(label: String, condition: bool) -> void:
	passed += int(condition)
	failed += int(not condition)
	print("MCP_LOOPBACK: %s - %s" % ["PASS" if condition else "FAIL", label])

func _run() -> void:
	_check("shared loopback listener policy exists before any socket startup", ResourceLoader.exists(POLICY_PATH))
	if failed > 0:
		_finish()
		return
	var args: Dictionary = {}
	for arg: String in OS.get_cmdline_user_args():
		var pair: PackedStringArray = arg.trim_prefix("--").split("=", true, 1)
		if pair.size() == 2:
			args[pair[0]] = pair[1]
	var folder: String = String(args.get("fixture", "")).replace("\\", "/").simplify_path()
	var checkout: String = ProjectSettings.globalize_path("res://").path_join("..").simplify_path().replace("\\", "/").trim_suffix("/")
	_check("fixture output stays inside this checkout build directory", folder.is_absolute_path() and folder.to_lower().begins_with(checkout.to_lower() + "/build/"))
	var mode: String = String(args.get("mode", ""))
	_check("explicit known fixture mode", mode in ["policy", "websocket"])
	if failed > 0:
		_finish()
		return
	var policy: Script = load(POLICY_PATH)
	var server: Node = null
	var listener: TCPServer
	var observed: Dictionary = {"command": false, "send_error": FAILED}
	var result: Error
	if mode == "policy":
		listener = TCPServer.new()
		result = policy.listen(listener, 0)
	else:
		var component: Script = load("res://addons/godot_mcp/websocket_server.gd")
		server = component.new()
		root.add_child(server)
		server.set_port(0)
		server.command_received.connect(func(client_id: int, command: Dictionary) -> void:
			# Godot's JSON decoder represents wire numbers as floats.
			observed.command = command == {"type": "fixture_ping", "value": 17.0}
			observed.send_error = server.send_response(client_id, {"fixture": "loopback", "value": 17})
		)
		result = server.start_server()
		listener = server.get("tcp_server")
	_check("real listener starts successfully", result == OK and listener.is_listening())
	if failed == 0:
		var ready := FileAccess.open(folder.path_join("ready.json"), FileAccess.WRITE)
		_check("owned ready artifact opens", ready != null)
		if ready != null:
			ready.store_string(JSON.stringify({"mode": mode, "pid": OS.get_process_id(), "port": listener.get_local_port()}))
			ready.close()
		var deadline: int = Time.get_ticks_msec() + 20000
		while not FileAccess.file_exists(folder.path_join("release.json")) and Time.get_ticks_msec() < deadline:
			await process_frame
		_check("controller completes actual endpoint and client checks", FileAccess.file_exists(folder.path_join("release.json")))
		if mode == "policy":
			_check("local TCP client reaches the real policy listener", listener.is_connection_available())
			if listener.is_connection_available():
				var connection: StreamPeerTCP = listener.take_connection()
				connection.disconnect_from_host()
		else:
			_check("real websocket parser receives the local command", bool(observed.command))
			_check("real websocket response sends successfully", observed.send_error == OK)
	if server != null:
		server.stop_server()
		server.queue_free()
	else:
		listener.stop()
	await process_frame
	_finish()

func _finish() -> void:
	print("MCP_LOOPBACK: %d passed, %d failed" % [passed, failed])
	quit(0 if failed == 0 else 1)
