extends Node
## Strict realm wire schema and private projection behavior.

const COMPONENT := "res://proto3d/realm/realm_protocol.gd"

var passed: int = 0
var failed: int = 0


func _check(label: String, condition: bool) -> void:
	passed += int(condition)
	failed += int(not condition)
	print("REALM_PROTOCOL: %s - %s" % ["PASS" if condition else "FAIL", label])


func _finish() -> void:
	print("REALM_PROTOCOL: %d passed, %d failed" % [passed, failed])
	get_tree().quit(0 if failed == 0 else 1)


func _ready() -> void:
	get_tree().create_timer(10.0).timeout.connect(func() -> void: get_tree().quit(1))
	_check("realm protocol exists", ResourceLoader.exists(COMPONENT))
	if failed > 0:
		_finish()
		return
	var protocol: Script = load(COMPONENT)
	_check("realm protocol can instantiate", protocol != null and protocol.can_instantiate())
	if failed > 0:
		_finish()
		return
	_check("shared wire validators are exposed", protocol.has_method("valid_version") and protocol.has_method("valid_id"))
	if failed > 0:
		_finish()
		return
	_check("shared version validator keeps strict numeric semantics",
		protocol.valid_version(1) and protocol.valid_version(1.0)
		and not protocol.valid_version(true) and not protocol.valid_version(1.5)
		and not protocol.valid_version(INF) and not protocol.valid_version(NAN))
	_check("shared ID validator keeps exact alphabet and bounds",
		protocol.valid_id("a:B-0._", 64) and not protocol.valid_id("bad id", 64)
		and not protocol.valid_id("a".repeat(65), 64) and not protocol.valid_id(false, 64))

	var purchase := {"version": 1, "kind": "purchase", "request_id": "buy-1", "parcel_id": "roadstead_001"}
	_check("exact purchase command accepted", protocol.command_error(purchase) == "")
	var decoded: Variant = JSON.parse_string(JSON.stringify(purchase))
	_check("integral JSON version accepted", decoded is Dictionary and decoded.version is float and protocol.command_error(decoded) == "")
	for field: String in ["version", "kind", "request_id", "parcel_id"]:
		var missing: Dictionary = purchase.duplicate(true)
		missing.erase(field)
		_check("missing %s rejected" % field, protocol.command_error(missing) != "")
	for extra: Dictionary in [
		{"account_id": "victim"}, {"funds": 999999}, {"cargo": {}}, {"location": [1, 2]}, {"guest_id": "bob"}
	]:
		_check("unknown field rejected: %s" % extra.keys()[0], protocol.command_error(purchase.merged(extra)) != "")
	for version: Variant in [true, 1.5, INF, NAN, 0, 2, "1"]:
		var bad_version: Dictionary = purchase.duplicate(true)
		bad_version.version = version
		_check("invalid version rejected: %s" % str(version), protocol.command_error(bad_version) != "")
	for bad_kind: Variant in ["credit", "store_item", "guest", 1, null]:
		var bad: Dictionary = purchase.duplicate(true)
		bad.kind = bad_kind
		_check("non-purchase kind rejected: %s" % str(bad_kind), protocol.command_error(bad) != "")
	for bad_request: Variant in ["", "a".repeat(49), "bad request", "slash/no", 7, false]:
		var bad: Dictionary = purchase.duplicate(true)
		bad.request_id = bad_request
		_check("invalid request ID rejected: %s" % str(bad_request).left(16), protocol.command_error(bad) != "")
	for bad_parcel: Variant in ["", "a".repeat(65), "bad parcel", "slash/no", 7, false]:
		var bad: Dictionary = purchase.duplicate(true)
		bad.parcel_id = bad_parcel
		_check("invalid parcel ID rejected: %s" % str(bad_parcel).left(16), protocol.command_error(bad) != "")
	var boundary: Dictionary = {"version": 1, "kind": "purchase", "request_id": "r".repeat(48), "parcel_id": "p".repeat(64)}
	_check("command ID boundaries accepted", protocol.command_error(boundary) == "")

	var collision_a: String = protocol.receipt_key("a:b", "c")
	var collision_b: String = protocol.receipt_key("a", "b:c")
	var longest: String = protocol.receipt_key("a".repeat(64), "r".repeat(48))
	_check("colon-bearing receipt namespaces do not collide", collision_a != collision_b)
	_check("receipt namespace is ledger-compatible", _valid_ledger_id(collision_a) and _valid_ledger_id(collision_b))
	_check("maximum receipt namespace fits ledger", longest.length() <= 128 and _valid_ledger_id(longest))

	var state: Dictionary = {
		"version": 1,
		"accounts": {"alice-secret": {"scrip": 350}, "bob-secret": {"scrip": 500}},
		"parcels": {
			"owned": {"owner_id": "alice-secret", "guests": {}, "items": {"scrap": 9}},
			"guest": {"owner_id": "bob-secret", "guests": {"alice-secret": true}, "items": {}},
			"other": {"owner_id": "bob-secret", "guests": {}, "items": {}},
			"open": {"owner_id": "", "guests": {}, "items": {}}
		},
		"receipts": {"private": {"payload": ["credit", "bob-secret", 500]}}
	}
	var view: Dictionary = protocol.project(state, "alice-secret")
	var expected: Dictionary = {
		"version": 1,
		"kind": "view",
		"balance": 350,
		"parcels": {
			"owned": {"ownership": "self", "can_access": true},
			"guest": {"ownership": "other", "can_access": true},
			"other": {"ownership": "other", "can_access": false},
			"open": {"ownership": "unowned", "can_access": false}
		}
	}
	_check("projection is the exact private view", view == expected)
	_check("projection contains no raw account IDs", not JSON.stringify(view).contains("alice-secret") and not JSON.stringify(view).contains("bob-secret"))
	view.balance = 999999
	view.parcels.owned.ownership = "unowned"
	view.parcels.guest.can_access = false
	_check("projection is detached from authority state", state.accounts["alice-secret"].scrip == 350 and state.parcels.owned.owner_id == "alice-secret" and state.parcels.guest.guests.has("alice-secret"))
	_check("each projection is freshly detached", protocol.project(state, "alice-secret") == expected)
	_check("unknown account receives no projection", protocol.project(state, "nobody").is_empty())
	_finish()


func _valid_ledger_id(value: String) -> bool:
	if value.is_empty() or value.length() > 128:
		return false
	for index: int in value.length():
		var code: int = value.unicode_at(index)
		if not (code >= 48 and code <= 57 or code >= 65 and code <= 90 or code >= 97 and code <= 122 or code in [45, 46, 58, 95]):
			return false
	return true
