extends Node
## Test-only, explicitly gated loopback authority process for the realm wire proof.

const PARCELS: Array = [
	{"id": "roadstead_001", "name": "Roadstead 001", "price": 150, "item_capacity": 10, "model": "res://assets/models/homestead/roadstead_cottage.glb"},
	{"id": "roadstead_002", "name": "Roadstead 002", "price": 225, "item_capacity": 10, "model": "res://assets/models/homestead/roadstead_cottage.glb"},
	{"id": "roadstead_003", "name": "Roadstead 003", "price": 300, "item_capacity": 10, "model": "res://assets/models/homestead/roadstead_cottage.glb"},
]

var _identities_by_hash: Dictionary = {}
var _link: ProtoRealmLink
var _stop_path: String = ""


func _ready() -> void:
	var arguments: PackedStringArray = OS.get_cmdline_user_args()
	if not arguments.has("--realm-test-server"):
		_fail("explicit_flag_required")
		return
	var config_path: String = _argument_value(arguments, "--config=")
	var config: Dictionary = _read_config(config_path)
	if config.is_empty() or not _valid_config(config, config_path):
		_fail("invalid_config")
		return
	_stop_path = String(config.stop_path)
	for row: Dictionary in config.identities:
		_identities_by_hash[String(row.token_sha256)] = {
			"account_id": String(row.account_id),
			"expires_at": int(row.expires_at),
		}
	var ledger := ProtoPropertyLedger.new()
	var open_error: Error = ledger.open(String(config.ledger_path), PARCELS)
	if open_error != OK:
		_fail("ledger_open_failed:%d" % open_error)
		return
	for row: Dictionary in config.identities:
		var account_id: String = String(row.account_id)
		var ensured: Dictionary = ledger.ensure_account(account_id)
		if not ensured.ok:
			_fail("account_seed_failed:%s" % String(ensured.error))
			return
		var funded: Dictionary = ledger.credit(account_id, 500, _seed_receipt(account_id))
		if not funded.ok:
			_fail("fund_seed_failed:%s" % String(funded.error))
			return
	_link = ProtoRealmLink.new()
	_link.name = "RealmLink"
	add_child(_link)
	var listen_error: Error = _link.start_server(ledger, _verify_credential, int(config.port))
	if listen_error != OK:
		_fail("listen_failed:%d" % listen_error)
		return
	if not _write_json(String(config.ready_path), {"ready": true, "pid": OS.get_process_id(), "port": int(config.port)}):
		_link.close()
		_fail("ready_write_failed")
		return
	print("REALM_FIXTURE_SERVER_READY pid=%d" % OS.get_process_id())
	set_process(true)


func _process(_delta: float) -> void:
	if not _stop_path.is_empty() and FileAccess.file_exists(_stop_path):
		if _link != null:
			_link.close()
		print("REALM_FIXTURE_SERVER_STOPPED")
		get_tree().quit(0)


func _verify_credential(credential: String) -> Dictionary:
	var token_hash: String = _sha256(credential)
	if not _identities_by_hash.has(token_hash):
		return {}
	var identity: Dictionary = _identities_by_hash[token_hash]
	if int(identity.expires_at) <= int(Time.get_unix_time_from_system()):
		return {}
	return identity.duplicate(true)


func _read_config(path: String) -> Dictionary:
	if path.is_empty() or not path.is_absolute_path() or not FileAccess.file_exists(path):
		return {}
	var text: String = FileAccess.get_file_as_string(path)
	var parsed: Variant = JSON.parse_string(text)
	return parsed if parsed is Dictionary else {}


func _valid_config(config: Dictionary, config_path: String) -> bool:
	var expected: Array[String] = ["identities", "ledger_path", "port", "ready_path", "stop_path"]
	if config.size() != expected.size():
		return false
	for field: String in expected:
		if not config.has(field):
			return false
	if not _integer(config.port, 1, 65535) or not config.identities is Array or config.identities.is_empty() or config.identities.size() > 64:
		return false
	var config_identity: String = _canonical_path_identity(config_path)
	if config_identity.is_empty():
		return false
	var paths: Dictionary = {config_identity: true}
	for field: String in ["ledger_path", "ready_path", "stop_path"]:
		if not config[field] is String:
			return false
		var path: String = String(config[field])
		var identity: String = _canonical_path_identity(path)
		if path.is_empty() or path.length() > 4096 or identity.is_empty() or paths.has(identity):
			return false
		paths[identity] = true
	var accounts: Dictionary = {}
	var hashes: Dictionary = {}
	for value: Variant in config.identities:
		if not value is Dictionary:
			return false
		var row: Dictionary = value
		if row.size() != 3 or not row.has("account_id") or not row.has("token_sha256") or not row.has("expires_at"):
			return false
		if not ProtoRealmProtocol.valid_id(row.account_id) or not row.token_sha256 is String or not _valid_hash(String(row.token_sha256)) or not _integer(row.expires_at, 1, 4102444800):
			return false
		if accounts.has(row.account_id) or hashes.has(row.token_sha256):
			return false
		accounts[row.account_id] = true
		hashes[row.token_sha256] = true
	return true


func _canonical_path_identity(value: String) -> String:
	if value.is_empty() or value.length() > 4096 or not value.is_absolute_path():
		return ""
	var normalized: String = value.replace("\\", "/").simplify_path()
	if not normalized.is_absolute_path():
		return ""
	for component: String in normalized.split("/", false):
		# Win32 ignores trailing dots/spaces in ordinary path components. Reject
		# those spellings rather than allowing an alias through validation.
		if component.is_empty() or component.ends_with(".") or component.ends_with(" "):
			return ""
	if OS.get_name() == "Windows":
		normalized = normalized.to_lower()
	return normalized.trim_suffix("/")


func _valid_hash(value: String) -> bool:
	if value.length() != 64 or value != value.to_lower():
		return false
	for index: int in value.length():
		var code: int = value.unicode_at(index)
		if not (code >= 48 and code <= 57 or code >= 97 and code <= 102):
			return false
	return true


func _sha256(value: String) -> String:
	var context := HashingContext.new()
	if context.start(HashingContext.HASH_SHA256) != OK:
		return ""
	if context.update(value.to_utf8_buffer()) != OK:
		return ""
	return context.finish().hex_encode()


func _seed_receipt(account_id: String) -> String:
	return "fixture_seed:%d:%s" % [account_id.length(), account_id]


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


func _write_json(path: String, value: Dictionary) -> bool:
	var temporary: String = "%s.tmp.%d" % [path, OS.get_process_id()]
	var file: FileAccess = FileAccess.open(temporary, FileAccess.WRITE)
	if file == null:
		return false
	file.store_string(JSON.stringify(value))
	file.flush()
	var error: Error = file.get_error()
	file.close()
	if error == OK:
		error = DirAccess.rename_absolute(temporary, path)
	if error != OK:
		DirAccess.remove_absolute(temporary)
	return error == OK


func _fail(reason: String) -> void:
	print("REALM_FIXTURE_SERVER_REJECT %s" % reason)
	get_tree().quit(1)
