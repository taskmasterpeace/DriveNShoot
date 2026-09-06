class_name ProtoRealmLink
extends Node
## Independently polled, loopback-only authenticated connection to one realm authority.

signal authenticated()
signal disconnected(reason: String)
signal message_received(message: Dictionary)

const AUTH_BYTES_MAX: int = 1024
const COMMAND_BYTES_MAX: int = 2048
const REPLY_BYTES_MAX: int = 2 * 1024 * 1024
const COMMANDS_PER_SECOND: int = 32
const SERVER_PEER_ID: int = 1

var _api: SceneMultiplayer
var _peer: ENetMultiplayerPeer
var _ledger: ProtoPropertyLedger
var _verifier: Callable
var _credential: String = ""
var _server: bool = false
var _authenticated: bool = false
var _admitted: Dictionary = {}
var _command_times: Dictionary = {}


func start_server(authority: ProtoPropertyLedger, verifier: Callable, port: int) -> Error:
	if _peer != null:
		return ERR_ALREADY_IN_USE
	if authority == null or not verifier.is_valid() or port < 1 or port > 65535:
		return ERR_INVALID_PARAMETER
	var peer := ENetMultiplayerPeer.new()
	peer.set_bind_ip("127.0.0.1")
	var error: Error = peer.create_server(port, 64)
	if error != OK:
		peer.close()
		return error
	_ledger = authority
	_verifier = verifier
	_server = true
	_activate(peer)
	return OK


func connect_loopback(port: int, credential: String) -> Error:
	if _peer != null:
		return ERR_ALREADY_IN_USE
	if port < 1 or port > 65535:
		return ERR_INVALID_PARAMETER
	var auth_packet: PackedByteArray = JSON.stringify({"version": 1, "credential": credential}).to_utf8_buffer()
	if auth_packet.size() > AUTH_BYTES_MAX:
		return ERR_INVALID_DATA
	var peer := ENetMultiplayerPeer.new()
	var error: Error = peer.create_client("127.0.0.1", port)
	if error != OK:
		peer.close()
		return error
	_credential = credential
	_server = false
	_activate(peer)
	return OK


func send_command(command: Dictionary) -> Error:
	if _peer == null or _server or not _authenticated or _api == null:
		return ERR_UNAUTHORIZED
	if not ProtoRealmProtocol.command_error(command).is_empty():
		return ERR_INVALID_DATA
	var packet: PackedByteArray = JSON.stringify(command).to_utf8_buffer()
	if packet.size() > COMMAND_BYTES_MAX:
		return ERR_INVALID_DATA
	return _api.send_bytes(packet, SERVER_PEER_ID, MultiplayerPeer.TRANSFER_MODE_RELIABLE, 0)


func close() -> void:
	_authenticated = false
	_admitted.clear()
	_command_times.clear()
	if _peer != null:
		_peer.close()
	if _api != null:
		_api.multiplayer_peer = null
	_peer = null
	_api = null
	_ledger = null
	_verifier = Callable()
	_credential = ""
	_server = false
	set_process(false)


func _exit_tree() -> void:
	close()


func _process(_delta: float) -> void:
	if _api == null:
		return
	var error: Error = _api.poll()
	if error != OK and not _server:
		_fail_local("poll_failed:%d" % error)


func _activate(peer: ENetMultiplayerPeer) -> void:
	_peer = peer
	_api = SceneMultiplayer.new()
	_api.allow_object_decoding = false
	_api.server_relay = false
	_api.auth_timeout = 3.0
	_api.root_path = get_path()
	_api.auth_callback = _on_auth_data
	_api.peer_authenticating.connect(_on_peer_authenticating)
	_api.peer_authentication_failed.connect(_on_peer_authentication_failed)
	_api.peer_connected.connect(_on_peer_connected)
	_api.peer_disconnected.connect(_on_peer_disconnected)
	_api.peer_packet.connect(_on_peer_packet)
	_api.connected_to_server.connect(_on_connected_to_server)
	_api.connection_failed.connect(_on_connection_failed)
	_api.server_disconnected.connect(_on_server_disconnected)
	_api.multiplayer_peer = peer
	set_process(true)


func _on_peer_authenticating(peer_id: int) -> void:
	if _server:
		return
	var packet: PackedByteArray = JSON.stringify({"version": 1, "credential": _credential}).to_utf8_buffer()
	if packet.size() > AUTH_BYTES_MAX or _api.send_auth(peer_id, packet) != OK:
		_fail_local("authentication_send_failed")
		return
	# This proof trusts the configured loopback endpoint; the server separately
	# completes its side only after credential verification.
	if _api.complete_auth(peer_id) != OK:
		_fail_local("authentication_complete_failed")


func _on_auth_data(peer_id: int, packet: PackedByteArray) -> void:
	if not _server or _api == null:
		return
	var decoded: Variant = _decode_json(packet, AUTH_BYTES_MAX)
	if not decoded is Dictionary:
		_reject_peer(peer_id)
		return
	var auth: Dictionary = decoded
	if auth.size() != 2 or not auth.has("version") or not auth.has("credential") or not ProtoRealmProtocol.valid_version(auth.version) or not auth.credential is String:
		_reject_peer(peer_id)
		return
	var verified: Variant = _verifier.call(String(auth.credential))
	if not _valid_identity(verified):
		_reject_peer(peer_id)
		return
	var identity: Dictionary = verified.duplicate(true)
	var state: Dictionary = _ledger.snapshot()
	if not state.get("accounts", {}).has(identity.account_id):
		_reject_peer(peer_id)
		return
	_admitted[peer_id] = identity
	if _api.complete_auth(peer_id) != OK:
		_admitted.erase(peer_id)
		_reject_peer(peer_id)


func _on_peer_connected(peer_id: int) -> void:
	if _server:
		if _admitted.has(peer_id):
			_send_view(peer_id)
		return
	if peer_id == SERVER_PEER_ID and not _authenticated:
		_authenticated = true
		authenticated.emit()


func _on_connected_to_server() -> void:
	# peer_connected is the authenticated boundary; the transport signal alone
	# never admits command traffic.
	pass


func _on_peer_authentication_failed(peer_id: int) -> void:
	if _server:
		_admitted.erase(peer_id)
		_command_times.erase(peer_id)
	else:
		_fail_local("authentication_failed")


func _on_peer_disconnected(peer_id: int) -> void:
	if _server:
		_admitted.erase(peer_id)
		_command_times.erase(peer_id)
	elif peer_id == SERVER_PEER_ID:
		_fail_local("peer_disconnected")


func _on_connection_failed() -> void:
	if not _server:
		_fail_local("connection_failed")


func _on_server_disconnected() -> void:
	if not _server:
		_fail_local("server_disconnected")


func _on_peer_packet(peer_id: int, packet: PackedByteArray) -> void:
	if not _server:
		var reply: Variant = _decode_json(packet, REPLY_BYTES_MAX)
		if reply is Dictionary and _valid_server_message(reply):
			message_received.emit(reply.duplicate(true))
		else:
			_fail_local("invalid_server_message")
		return
	if not _admitted.has(peer_id):
		_reject_peer(peer_id)
		return
	if not _within_rate_limit(peer_id):
		_reject_peer(peer_id)
		return
	var identity: Dictionary = _admitted[peer_id]
	if int(identity.expires_at) <= int(Time.get_unix_time_from_system()):
		_reject_peer(peer_id)
		return
	var decoded: Variant = _decode_json(packet, COMMAND_BYTES_MAX)
	if not decoded is Dictionary:
		_reject_peer(peer_id)
		return
	var command: Dictionary = decoded
	var schema_error: String = ProtoRealmProtocol.command_error(command)
	if not schema_error.is_empty():
		_send_receipt(peer_id, "", false, schema_error)
		_send_view(peer_id)
		return
	var result: Dictionary = _ledger.purchase(
		identity.account_id,
		command.parcel_id,
		ProtoRealmProtocol.receipt_key(identity.account_id, command.request_id)
	)
	_send_receipt(peer_id, command.request_id, bool(result.ok), String(result.error))
	_send_view(peer_id)
	if result.ok:
		for other_peer_id: Variant in _admitted:
			if int(other_peer_id) != peer_id:
				_send_view(int(other_peer_id))


func _send_receipt(peer_id: int, request_id: String, ok: bool, error: String) -> void:
	_send_message(peer_id, {
		"version": 1,
		"kind": "receipt",
		"request_id": request_id,
		"ok": ok,
		"error": error
	})


func _send_view(peer_id: int) -> void:
	if not _admitted.has(peer_id):
		return
	var identity: Dictionary = _admitted[peer_id]
	var view: Dictionary = ProtoRealmProtocol.project(_ledger.snapshot(), identity.account_id)
	if view.is_empty():
		_reject_peer(peer_id)
		return
	_send_message(peer_id, view)


func _send_message(peer_id: int, message: Dictionary) -> void:
	if _api == null:
		return
	var packet: PackedByteArray = JSON.stringify(message).to_utf8_buffer()
	if packet.size() > REPLY_BYTES_MAX or _api.send_bytes(packet, peer_id, MultiplayerPeer.TRANSFER_MODE_RELIABLE, 0) != OK:
		_reject_peer(peer_id)


func _within_rate_limit(peer_id: int) -> bool:
	var now: int = Time.get_ticks_msec()
	var times: Array = _command_times.get(peer_id, [])
	while not times.is_empty() and int(times[0]) <= now - 1000:
		times.pop_front()
	if times.size() >= COMMANDS_PER_SECOND:
		_command_times.erase(peer_id)
		return false
	times.append(now)
	_command_times[peer_id] = times
	return true


func _reject_peer(peer_id: int) -> void:
	_admitted.erase(peer_id)
	_command_times.erase(peer_id)
	if _api != null:
		_api.disconnect_peer(peer_id)


func _fail_local(reason: String) -> void:
	if _peer == null:
		return
	_authenticated = false
	disconnected.emit(reason)
	close()


func _decode_json(packet: PackedByteArray, maximum: int) -> Variant:
	if packet.is_empty() or packet.size() > maximum:
		return null
	var text: String = packet.get_string_from_utf8()
	if text.to_utf8_buffer() != packet:
		return null
	var json := JSON.new()
	if json.parse(text) != OK:
		return null
	return json.data


func _valid_identity(value: Variant) -> bool:
	if not value is Dictionary:
		return false
	var identity: Dictionary = value
	if identity.size() != 2 or not identity.has("account_id") or not identity.has("expires_at"):
		return false
	if not ProtoRealmProtocol.valid_id(identity.account_id, ProtoRealmProtocol.REALM_ID_MAX) or not identity.expires_at is int:
		return false
	return int(identity.expires_at) > int(Time.get_unix_time_from_system())


func _valid_server_message(value: Dictionary) -> bool:
	if not ProtoRealmProtocol.valid_version(value.get("version")) or not value.get("kind") is String:
		return false
	if value.kind == "receipt":
		if value.size() != 5 or not value.has("request_id") or not value.has("ok") or not value.has("error"):
			return false
		if not value.request_id is String or not value.ok is bool or not value.error is String:
			return false
		return value.request_id.is_empty() or ProtoRealmProtocol.valid_id(value.request_id, ProtoRealmProtocol.REQUEST_ID_MAX)
	if value.kind != "view" or value.size() != 4 or not value.has("balance") or not value.has("parcels"):
		return false
	if not _integer(value.balance, 0, 1000000000000) or not value.parcels is Dictionary or value.parcels.size() > 10000:
		return false
	for parcel_id: Variant in value.parcels:
		if not ProtoRealmProtocol.valid_id(parcel_id, ProtoRealmProtocol.REALM_ID_MAX):
			return false
		var parcel: Variant = value.parcels[parcel_id]
		if not parcel is Dictionary or parcel.size() != 2 or not parcel.has("ownership") or not parcel.has("can_access"):
			return false
		if not parcel.ownership is String or not parcel.can_access is bool or not parcel.ownership in ["self", "other", "unowned"]:
			return false
		if parcel.ownership == "self" and not parcel.can_access or parcel.ownership == "unowned" and parcel.can_access:
			return false
	return true


func _integer(value: Variant, minimum: int, maximum: int) -> bool:
	if not (value is int or value is float):
		return false
	return is_finite(float(value)) and value >= minimum and value <= maximum and float(value) == floor(float(value))
