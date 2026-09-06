extends Node
## Independent fixture process. Normal mode uses ProtoRealmLink; raw mode bypasses
## client validation solely to pressure the production server's wire boundary.

const SERVER_PEER_ID: int = 1
const RESULT_RETRY_LIMIT: int = 200
const RESULT_RETRY_MSEC: int = 25
const COMMAND_READ_RETRY_LIMIT: int = 200

var _config: Dictionary = {}
var _result: Dictionary = {
	"pid": OS.get_process_id(),
	"authenticated": false,
	"disconnected": false,
	"disconnect_reason": "",
	"messages": [],
	"messages_received": 0,
	"auth_packet_sent": false,
	"sent_serials": [],
	"publish_failures": 0,
	"last_publish_error": 0,
}
var _link: ProtoRealmLink
var _raw_api: SceneMultiplayer
var _raw_peer: ENetMultiplayerPeer
var _next_serial: int = 1
var _command_read_failures: int = 0
var _pending_exit: bool = false
var _result_dirty: bool = true
var _next_result_retry_msec: int = 0


func _ready() -> void:
	var config_path: String = _argument_value(OS.get_cmdline_user_args(), "--config=")
	_config = _read_config(config_path)
	if _config.is_empty() or not _valid_config(_config):
		_fail("invalid_config")
		return
	_try_publish_result()
	if bool(_config.raw_peer):
		_start_raw()
	else:
		_start_production_link()
	set_process(true)


func _process(_delta: float) -> void:
	if _result_dirty and Time.get_ticks_msec() >= _next_result_retry_msec:
		_try_publish_result()
	if _raw_api != null:
		var poll_error: Error = _raw_api.poll()
		if poll_error != OK and not bool(_result.disconnected):
			_disconnect("poll_failed:%d" % poll_error)
	if FileAccess.file_exists(String(_config.stop_path)):
		_close()
		get_tree().quit(0)
		return
	if _pending_exit:
		if _result_dirty:
			return
		_close()
		get_tree().quit(0)
		return
	_process_next_command()


func _start_production_link() -> void:
	_link = ProtoRealmLink.new()
	_link.name = "RealmLink"
	add_child(_link)
	_link.authenticated.connect(_on_authenticated)
	_link.disconnected.connect(_disconnect)
	_link.message_received.connect(_on_message)
	var error: Error = _link.connect_loopback(int(_config.port), String(_config.credential))
	if error != OK:
		_fail("connect_failed:%d" % error)


func _start_raw() -> void:
	_raw_peer = ENetMultiplayerPeer.new()
	var error: Error = _raw_peer.create_client("127.0.0.1", int(_config.port))
	if error != OK:
		_fail("raw_connect_failed:%d" % error)
		return
	_raw_api = SceneMultiplayer.new()
	_raw_api.allow_object_decoding = false
	_raw_api.server_relay = false
	_raw_api.auth_timeout = 3.0
	_raw_api.root_path = get_path()
	_raw_api.auth_callback = _on_raw_auth_data
	_raw_api.peer_authenticating.connect(_on_raw_peer_authenticating)
	_raw_api.peer_authentication_failed.connect(func(_peer_id: int) -> void: _disconnect("authentication_failed"))
	_raw_api.peer_connected.connect(_on_raw_peer_connected)
	_raw_api.peer_disconnected.connect(func(_peer_id: int) -> void: _disconnect("peer_disconnected"))
	_raw_api.peer_packet.connect(_on_raw_peer_packet)
	_raw_api.connection_failed.connect(func() -> void: _disconnect("connection_failed"))
	_raw_api.server_disconnected.connect(func() -> void: _disconnect("server_disconnected"))
	_raw_api.multiplayer_peer = _raw_peer


func _on_raw_peer_authenticating(peer_id: int) -> void:
	var override: String = String(_config.raw_auth_packet)
	var packet: PackedByteArray = override.to_utf8_buffer() if not override.is_empty() else JSON.stringify({"version": 1, "credential": String(_config.credential)}).to_utf8_buffer()
	var send_error: Error = _raw_api.send_auth(peer_id, packet)
	if send_error == OK:
		_result.auth_packet_sent = true
		_mark_result_dirty()
	if send_error != OK or _raw_api.complete_auth(peer_id) != OK:
		_disconnect("authentication_send_failed")


func _on_raw_auth_data(_peer_id: int, _packet: PackedByteArray) -> void:
	pass


func _on_raw_peer_connected(peer_id: int) -> void:
	if peer_id == SERVER_PEER_ID:
		_on_authenticated()


func _on_raw_peer_packet(_peer_id: int, packet: PackedByteArray) -> void:
	var decoded: Variant = JSON.parse_string(packet.get_string_from_utf8())
	if decoded is Dictionary:
		_on_message(decoded)


func _on_authenticated() -> void:
	_result.authenticated = true
	_mark_result_dirty()


func _on_message(message: Dictionary) -> void:
	_result.messages.append(message.duplicate(true))
	_result.messages_received = int(_result.messages_received) + 1
	_mark_result_dirty()


func _disconnect(reason: String) -> void:
	if bool(_result.disconnected):
		return
	_result.disconnected = true
	_result.disconnect_reason = reason
	_mark_result_dirty()


func _process_next_command() -> void:
	if not bool(_result.authenticated) or bool(_result.disconnected):
		return
	var path: String = String(_config.command_dir).path_join("%06d.json" % _next_serial)
	if not FileAccess.file_exists(path):
		return
	var file: FileAccess = FileAccess.open(path, FileAccess.READ)
	if file == null:
		_retry_command_read(FileAccess.get_open_error())
		return
	var text: String = file.get_as_text()
	var read_error: Error = file.get_error()
	file.close()
	var json := JSON.new()
	var parse_error: Error = json.parse(text) if read_error == OK else read_error
	if parse_error != OK:
		_retry_command_read(parse_error)
		return
	var parsed: Variant = json.data
	if not parsed is Dictionary or not _valid_command_file(parsed, _next_serial):
		_fail("invalid_command_file:%d" % _next_serial)
		return
	_command_read_failures = 0
	var command: Dictionary = parsed
	var not_before: int = int(command.not_before_msec)
	if _unix_msec() < not_before:
		return
	var send_error: Error
	if bool(_config.raw_peer):
		var packet: PackedByteArray = String(command.raw_packet).to_utf8_buffer() if command.has("raw_packet") else JSON.stringify(command.payload).to_utf8_buffer()
		send_error = _raw_api.send_bytes(packet, SERVER_PEER_ID, MultiplayerPeer.TRANSFER_MODE_RELIABLE, 0)
	else:
		send_error = _link.send_command(command.payload)
	if send_error != OK:
		_fail("send_failed:%d:%d" % [_next_serial, send_error])
		return
	_result.sent_serials.append(_next_serial)
	_next_serial += 1
	_mark_result_dirty()
	if bool(command.exit_after_send):
		# The packet has entered the real transport. Exit on the next frame without
		# waiting for or recording a receipt; reconnection resolves the outcome.
		_pending_exit = true


func _valid_command_file(value: Dictionary, serial: int) -> bool:
	if value.size() != 4 or not value.has("serial") or not value.has("not_before_msec") or not value.has("exit_after_send"):
		return false
	if not _integer(value.serial, serial, serial) or not _integer(value.not_before_msec, 0, 4102444800000) or not value.exit_after_send is bool:
		return false
	var has_payload: bool = value.has("payload") and value.payload is Dictionary
	var has_raw: bool = value.has("raw_packet") and value.raw_packet is String
	return has_payload != has_raw


func _retry_command_read(error: Error) -> void:
	_command_read_failures += 1
	print("REALM_FIXTURE_CLIENT_COMMAND_RETRY serial=%d failures=%d error=%d" % [_next_serial, _command_read_failures, error])
	if _command_read_failures >= COMMAND_READ_RETRY_LIMIT:
		_fail("command_read_exhausted:%d:%d" % [_next_serial, error])


func _valid_config(config: Dictionary) -> bool:
	var expected: Array[String] = ["command_dir", "credential", "port", "raw_auth_packet", "raw_peer", "result_path", "stop_path"]
	if config.size() != expected.size():
		return false
	for field: String in expected:
		if not config.has(field):
			return false
	if not _integer(config.port, 1, 65535) or not config.credential is String or String(config.credential).length() > 4096 or not config.raw_peer is bool or not config.raw_auth_packet is String:
		return false
	for field: String in ["command_dir", "result_path", "stop_path"]:
		if not config[field] is String or not String(config[field]).is_absolute_path() or String(config[field]).length() > 4096:
			return false
	return true


func _read_config(path: String) -> Dictionary:
	if path.is_empty() or not path.is_absolute_path() or not FileAccess.file_exists(path):
		return {}
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(path))
	return parsed if parsed is Dictionary else {}


func _mark_result_dirty() -> void:
	_result_dirty = true
	_try_publish_result()


func _try_publish_result() -> void:
	if not _result_dirty or _config.is_empty():
		return
	var error: Error = _publish_result()
	if error == OK:
		_result_dirty = false
		return
	_result.publish_failures = int(_result.publish_failures) + 1
	_result.last_publish_error = int(error)
	_next_result_retry_msec = Time.get_ticks_msec() + RESULT_RETRY_MSEC
	print("REALM_FIXTURE_CLIENT_RESULT_RETRY failures=%d error=%d messages=%d receipts=%d views=%d" % [
		int(_result.publish_failures), error, int(_result.messages_received),
		_message_kind_count("receipt"), _message_kind_count("view")
	])
	if int(_result.publish_failures) >= RESULT_RETRY_LIMIT:
		print("REALM_FIXTURE_CLIENT_REJECT result_publish_exhausted:%d" % error)
		_close()
		get_tree().quit(1)


func _publish_result() -> Error:
	var path: String = String(_config.result_path)
	var temporary: String = "%s.tmp.%d" % [path, OS.get_process_id()]
	var file: FileAccess = FileAccess.open(temporary, FileAccess.WRITE)
	if file == null:
		return FileAccess.get_open_error()
	file.store_string(JSON.stringify(_result))
	file.flush()
	var error: Error = file.get_error()
	file.close()
	if error == OK:
		error = DirAccess.rename_absolute(temporary, path)
	if error != OK:
		DirAccess.remove_absolute(temporary)
	return error


func _message_kind_count(kind: String) -> int:
	var count: int = 0
	for value: Variant in _result.messages:
		if value is Dictionary and value.get("kind") == kind:
			count += 1
	return count


func _close() -> void:
	if _link != null:
		_link.close()
	if _raw_peer != null:
		_raw_peer.close()
	if _raw_api != null:
		_raw_api.multiplayer_peer = null
	_raw_peer = null
	_raw_api = null


func _argument_value(arguments: PackedStringArray, prefix: String) -> String:
	var found: String = ""
	for argument: String in arguments:
		if argument.begins_with(prefix):
			if not found.is_empty():
				return ""
			found = argument.trim_prefix(prefix)
	return found


func _integer(value: Variant, minimum: int, maximum: int) -> bool:
	return (value is int or value is float) and is_finite(float(value)) and float(value) == floor(float(value)) and value >= minimum and value <= maximum


func _unix_msec() -> int:
	return int(Time.get_unix_time_from_system() * 1000.0)


func _fail(reason: String) -> void:
	set_process(false)
	_close()
	print("REALM_FIXTURE_CLIENT_REJECT %s" % reason)
	get_tree().quit(1)
