extends Node
## Component-level loopback proof for the independently polled realm link.

const COMPONENT := "res://proto3d/realm/realm_link.gd"
const LEDGER_COMPONENT := "res://proto3d/realm/property_ledger.gd"

var passed: int = 0
var failed: int = 0
var root: String
var ledger: Variant
var link_script: Script
var credentials: Dictionary = {}
var clients: Array[Node] = []
var inboxes: Dictionary = {}
var auth_counts: Dictionary = {}
var disconnect_counts: Dictionary = {}
var alice_credential: String
var bob_credential: String
var unknown_credential: String
var expired_credential: String
var extra_credential: String


func _check(label: String, condition: bool) -> void:
	passed += int(condition)
	failed += int(not condition)
	print("REALM_LINK: %s - %s" % ["PASS" if condition else "FAIL", label])


func _finish() -> void:
	for client: Node in clients:
		client.close()
	ledger = null
	for file: String in ["ledger.json"]:
		DirAccess.remove_absolute(root + "/" + file)
	DirAccess.remove_absolute(root)
	print("REALM_LINK: %d passed, %d failed" % [passed, failed])
	get_tree().quit(0 if failed == 0 else 1)


func _ready() -> void:
	get_tree().create_timer(25.0).timeout.connect(func() -> void: get_tree().quit(1))
	_check("realm link exists", ResourceLoader.exists(COMPONENT))
	if failed > 0:
		_finish()
		return
	link_script = load(COMPONENT)
	_check("realm link can instantiate", link_script != null and link_script.can_instantiate())
	if failed > 0:
		_finish()
		return
	root = "user://realm_link_sim_%s_%s" % [OS.get_process_id(), Time.get_ticks_usec()]
	DirAccess.make_dir_recursive_absolute(root)
	var ledger_script: Script = load(LEDGER_COMPONENT)
	ledger = ledger_script.new()
	var rows: Array = [{"id": "roadstead_001", "name": "Roadstead", "price": 150,
		"item_capacity": 10, "model": "res://assets/models/homestead/roadstead_cottage.glb"}]
	_check("test authority opens", ledger.open(root + "/ledger.json", rows) == OK)
	_check("test accounts exist", ledger.ensure_account("alice-secret").ok and ledger.ensure_account("bob-secret").ok)
	_check("test accounts funded", ledger.credit("alice-secret", 500, "fund_alice").ok and ledger.credit("bob-secret", 500, "fund_bob").ok)
	alice_credential = _new_credential()
	bob_credential = _new_credential()
	unknown_credential = _new_credential()
	expired_credential = _new_credential()
	extra_credential = _new_credential()
	credentials[alice_credential] = {"account_id": "alice-secret", "expires_at": int(Time.get_unix_time_from_system()) + 60}
	credentials[bob_credential] = {"account_id": "bob-secret", "expires_at": int(Time.get_unix_time_from_system()) + 60}
	credentials[unknown_credential] = {"account_id": "unknown-secret", "expires_at": int(Time.get_unix_time_from_system()) + 60}
	credentials[expired_credential] = {"account_id": "alice-secret", "expires_at": int(Time.get_unix_time_from_system()) - 1}
	credentials[extra_credential] = {"account_id": "alice-secret", "expires_at": int(Time.get_unix_time_from_system()) + 60, "role": "admin"}
	await _run_wire_checks()
	_finish()


func _run_wire_checks() -> void:
	var tree_api: MultiplayerAPI = get_tree().get_multiplayer()
	var port: int = 32000 + int(OS.get_process_id()) % 20000
	var server: Node = _new_link("server")
	_check("server starts on loopback", server.start_server(ledger, _verify, port) == OK)
	_check("link does not replace SceneTree multiplayer", get_tree().get_multiplayer() == tree_api)
	_check("duplicate server start rejects without API replacement", server.start_server(ledger, _verify, port + 1) == ERR_ALREADY_IN_USE and get_tree().get_multiplayer() == tree_api)
	var oversized_auth: Node = _new_link("oversized_auth")
	_check("oversized authentication payload rejected before connect", oversized_auth.connect_loopback(port, "x".repeat(1025)) == ERR_INVALID_DATA)

	var rejected: Node = _new_link("rejected")
	_check("unverified client begins connection", rejected.connect_loopback(port, _new_credential()) == OK)
	await _wait_until(func() -> bool: return _disconnects("rejected") > 0, 4.0)
	_check("unverified credential is not admitted", _auths("rejected") == 0 and _disconnects("rejected") > 0)
	_check("authentication failure releases private peer and API", rejected.get("_peer") == null and rejected.get("_api") == null)
	_check("link can reconnect after failure", rejected.connect_loopback(port, alice_credential) == OK)
	await _wait_until(func() -> bool: return _auths("rejected") == 1, 4.0)
	_check("reused link authenticates after failure", _auths("rejected") == 1)
	rejected.close()
	var expired: Node = _new_link("expired")
	_check("expired client begins connection", expired.connect_loopback(port, expired_credential) == OK)
	await _wait_until(func() -> bool: return _disconnects("expired") > 0, 4.0)
	_check("expired identity is not admitted", _auths("expired") == 0 and _disconnects("expired") > 0)
	var unknown: Node = _new_link("unknown")
	_check("unknown-account client begins connection", unknown.connect_loopback(port, unknown_credential) == OK)
	await _wait_until(func() -> bool: return _disconnects("unknown") > 0, 4.0)
	_check("unknown account is not admitted", _auths("unknown") == 0 and _disconnects("unknown") > 0)
	var extra: Node = _new_link("extra")
	_check("extra-identity client begins connection", extra.connect_loopback(port, extra_credential) == OK)
	await _wait_until(func() -> bool: return _disconnects("extra") > 0, 4.0)
	_check("non-exact verified identity is not admitted", _auths("extra") == 0 and _disconnects("extra") > 0)

	var alice: Node = _new_link("alice")
	var bob: Node = _new_link("bob")
	_check("valid clients begin loopback connections", alice.connect_loopback(port, alice_credential) == OK and bob.connect_loopback(port, bob_credential) == OK)
	var pre_auth_command: Dictionary = {"version": 1, "kind": "purchase", "request_id": "too-soon", "parcel_id": "roadstead_001"}
	_check("unauthenticated command is rejected", alice.send_command(pre_auth_command) == ERR_UNAUTHORIZED and bob.send_command(pre_auth_command) == ERR_UNAUTHORIZED)
	await _wait_until(func() -> bool: return _auths("alice") == 1 and _auths("bob") == 1 and _messages("alice").size() >= 1 and _messages("bob").size() >= 1, 5.0)
	_check("valid clients authenticate once", _auths("alice") == 1 and _auths("bob") == 1)
	_check("admission sends private views", _has_view("alice", 500, "unowned") and _has_view("bob", 500, "unowned"))
	_check("wire views do not leak account IDs", not JSON.stringify(_messages("alice")).contains("alice-secret") and not JSON.stringify(_messages("alice")).contains("bob-secret"))
	var before_forgery: Dictionary = ledger.snapshot()
	var bob_api: SceneMultiplayer = bob.get("_api")
	var forged_command: PackedByteArray = JSON.stringify({
		"version": 1, "kind": "purchase", "request_id": "forge-wire",
		"parcel_id": "roadstead_001", "account_id": "alice-secret"
	}).to_utf8_buffer()
	_check("test client sends forged raw command", bob_api.send_bytes(forged_command, 1) == OK)
	await _wait_until(func() -> bool: return _has_receipt("bob", "", false), 4.0)
	_check("server rejects forged raw command without echo or mutation", _has_receipt("bob", "", false) and ledger.snapshot() == before_forgery and not JSON.stringify(_messages("bob")).contains("forge-wire"))
	_check("duplicate connect rejects without dropping live session", alice.connect_loopback(port + 1, "alice-token") == ERR_ALREADY_IN_USE)
	_check("exact purchase command sends", alice.send_command({"version": 1, "kind": "purchase", "request_id": "buy-1", "parcel_id": "roadstead_001"}) == OK)
	await _wait_until(func() -> bool: return _has_receipt("alice", "buy-1", true) and _has_view("alice", 350, "self") and _has_view("bob", 500, "other"), 5.0)
	_check("real authority purchase returns durable receipt", _has_receipt("alice", "buy-1", true) and ledger.snapshot().accounts["alice-secret"].scrip == 350)
	_check("success refreshes buyer and other peer views", _has_view("alice", 350, "self") and _has_view("bob", 500, "other"))
	_check("forged identity and funds rejected locally", alice.send_command({"version": 1, "kind": "purchase", "request_id": "forge", "parcel_id": "roadstead_001", "account_id": "bob-secret", "funds": 999}) != OK)

	var before_oversize: Dictionary = ledger.snapshot()
	var oversized: PackedByteArray = ("{" + "x".repeat(2050) + "}").to_utf8_buffer()
	var alice_api: SceneMultiplayer = alice.get("_api")
	_check("test sends malicious oversized raw packet", alice_api != null and alice_api.send_bytes(oversized, 1) == OK)
	await _wait_until(func() -> bool: return _disconnects("alice") > 0, 4.0)
	_check("oversized packet disconnects without mutation", _disconnects("alice") > 0 and ledger.snapshot() == before_oversize)

	var stale_port: int = port + 2
	var stale_server: Node = _new_link("stale_server")
	_check("second loopback server starts", stale_server.start_server(ledger, _verify, stale_port) == OK)
	credentials["stale-token"] = {"account_id": "bob-secret", "expires_at": int(Time.get_unix_time_from_system()) + 1}
	var stale: Node = _new_link("stale")
	_check("short session begins connection", stale.connect_loopback(stale_port, "stale-token") == OK)
	await _wait_until(func() -> bool: return _auths("stale") == 1, 4.0)
	_check("short session admitted before expiry", _auths("stale") == 1)
	await get_tree().create_timer(1.2).timeout
	var before_stale: Dictionary = ledger.snapshot()
	_check("stale client can place packet on its live transport", stale.send_command({"version": 1, "kind": "purchase", "request_id": "stale-buy", "parcel_id": "roadstead_001"}) == OK)
	await _wait_until(func() -> bool: return _disconnects("stale") > 0, 4.0)
	_check("expired admitted session cannot mutate", _disconnects("stale") > 0 and ledger.snapshot() == before_stale and not _has_receipt("stale", "stale-buy", true))
	stale_server.close()

	var rate_port: int = port + 3
	var rate_server: Node = _new_link("rate_server")
	_check("rate-limit server starts", rate_server.start_server(ledger, _verify, rate_port) == OK)
	var rate: Node = _new_link("rate")
	_check("rate-limit client begins connection", rate.connect_loopback(rate_port, bob_credential) == OK)
	await _wait_until(func() -> bool: return _auths("rate") == 1, 4.0)
	var replay: Dictionary = {"version": 1, "kind": "purchase", "request_id": "rate-replay", "parcel_id": "roadstead_001"}
	for index: int in 33:
		rate.send_command(replay)
	await _wait_until(func() -> bool: return _disconnects("rate") > 0, 4.0)
	_check("more than 32 commands in one second disconnects peer", _disconnects("rate") > 0)
	_check("rate limit stores only a bounded rolling window", rate_server.get("_command_times").size() == 0)
	rate_server.close()

	var bob_peer_id: int = 0
	var admitted: Dictionary = server.get("_admitted")
	for candidate: Variant in admitted:
		if admitted[candidate].account_id == "bob-secret":
			bob_peer_id = int(candidate)
	var server_api: SceneMultiplayer = server.get("_api")
	var malformed_reply: PackedByteArray = JSON.stringify({
		"version": 1, "kind": "view", "balance": 500, "parcels": {},
		"account_id": "bob-secret"
	}).to_utf8_buffer()
	_check("test server sends malformed private reply", bob_peer_id > 0 and server_api.send_bytes(malformed_reply, bob_peer_id) == OK)
	await _wait_until(func() -> bool: return _disconnects("bob") > 0, 4.0)
	_check("client rejects malformed server message", _disconnects("bob") > 0 and not JSON.stringify(_messages("bob")).contains("account_id"))
	server.close()
	server.close()
	_check("close is idempotent and preserves SceneTree multiplayer", get_tree().get_multiplayer() == tree_api)


func _new_link(label: String) -> Node:
	var link: Node = link_script.new()
	link.name = label
	add_child(link)
	clients.append(link)
	inboxes[label] = []
	auth_counts[label] = 0
	disconnect_counts[label] = 0
	link.authenticated.connect(func() -> void: auth_counts[label] = _auths(label) + 1)
	link.disconnected.connect(func(_reason: String) -> void: disconnect_counts[label] = _disconnects(label) + 1)
	link.message_received.connect(func(message: Dictionary) -> void: _messages(label).append(message.duplicate(true)))
	return link


func _verify(credential: String) -> Dictionary:
	return credentials.get(credential, {}).duplicate(true)


func _new_credential() -> String:
	return Crypto.new().generate_random_bytes(32).hex_encode()


func _wait_until(predicate: Callable, seconds: float) -> void:
	var deadline: int = Time.get_ticks_msec() + int(seconds * 1000.0)
	while Time.get_ticks_msec() < deadline and not predicate.call():
		await get_tree().process_frame


func _messages(label: String) -> Array:
	return inboxes[label]


func _auths(label: String) -> int:
	return int(auth_counts[label])


func _disconnects(label: String) -> int:
	return int(disconnect_counts[label])


func _has_receipt(label: String, request_id: String, ok: bool) -> bool:
	for message: Dictionary in _messages(label):
		if message.get("kind") == "receipt" and message.get("request_id") == request_id and message.get("ok") == ok:
			return true
	return false


func _has_view(label: String, balance: int, ownership: String) -> bool:
	for message: Dictionary in _messages(label):
		if message.get("kind") == "view" and message.get("balance") == balance and message.get("parcels", {}).get("roadstead_001", {}).get("ownership") == ownership:
			return true
	return false
