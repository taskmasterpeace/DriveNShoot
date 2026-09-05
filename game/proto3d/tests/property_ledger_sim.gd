## Real authority commands and disk IO, isolated from the player's saves.
extends Node

const COMPONENT := "res://proto3d/realm/property_ledger.gd"
var passed: int = 0
var failed: int = 0
var root: String


func _check(label: String, condition: bool) -> void:
	passed += int(condition)
	failed += int(not condition)
	print("PROPERTY: %s - %s" % ["PASS" if condition else "FAIL", label])


func _finish() -> void:
	print("PROPERTY: %d passed, %d failed" % [passed, failed])
	get_tree().quit(0 if failed == 0 else 1)


func _ready() -> void:
	get_tree().create_timer(30.0).timeout.connect(func() -> void: get_tree().quit(1))
	_check("property authority component exists", FileAccess.file_exists(COMPONENT))
	if failed > 0:
		_finish()
		return
	var component: Script = load(COMPONENT)
	_check("property authority can instantiate", component != null and component.can_instantiate())
	if failed > 0:
		_finish()
		return
	root = "user://property_ledger_sim_%s_%s" % [OS.get_process_id(), Time.get_ticks_usec()]
	print("PROPERTY: isolated data root %s" % ProjectSettings.globalize_path(root))
	DirAccess.make_dir_recursive_absolute(root)
	var rows: Array = [{"id": "test_home", "name": "Test home", "price": 150,
		"item_capacity": 10, "model": "res://assets/models/homestead/roadstead_cottage.glb"}]
	var ledger: Variant = component.new()
	_check("unopened authority fails closed", not ledger.ensure_account("alice").ok)
	_check("new authority is durably opened", ledger.open(root + "/ledger.json", rows) == OK)
	_check("accounts start unfunded", ledger.ensure_account("alice").ok and ledger.snapshot().accounts.alice.scrip == 0)
	_check("second account created", ledger.ensure_account("bob").ok)
	_check("unfunded purchase rejected", not ledger.purchase("alice", "test_home", "poor").ok)
	_check("credits fund two buyers", ledger.credit("alice", 200, "reward_a").ok and ledger.credit("bob", 200, "reward_b").ok)
	_check("first buyer wins", ledger.purchase("alice", "test_home", "buy_a").ok)
	_check("second buyer loses without debit", not ledger.purchase("bob", "test_home", "buy_b").ok and ledger.snapshot().accounts.bob.scrip == 200)
	_check("one owner and exact winning debit", ledger.snapshot().parcels.test_home.owner_id == "alice" and ledger.snapshot().accounts.alice.scrip == 50)
	var purchased: Dictionary = ledger.snapshot()
	_check("winning purchase receipt replays", ledger.purchase("alice", "test_home", "buy_a").ok and ledger.snapshot() == purchased)
	_check("credit receipt replays without reward", ledger.credit("alice", 200, "reward_a").ok and ledger.snapshot() == purchased)
	_check("altered purchase receipt rejected", not ledger.purchase("bob", "test_home", "buy_a").ok)
	_check("altered credit receipt rejected", not ledger.credit("alice", 201, "reward_a").ok)
	_check("cross-operation receipt reuse rejected", not ledger.credit("alice", 1, "buy_a").ok)
	var exposed: Dictionary = ledger.snapshot()
	exposed.accounts.alice.scrip = 9999
	exposed.parcels.test_home.guests["bob"] = true
	_check("snapshot is a detached deep copy", ledger.snapshot() == purchased)
	var reloaded: Variant = component.new()
	var reopen_error: Error = reloaded.open(root + "/ledger.json", rows)
	_check("restart preserves complete authority state", reopen_error == OK and reloaded.snapshot() == purchased)
	ledger = reloaded
	_check("receipt survives restart", ledger.purchase("alice", "test_home", "buy_a").ok and ledger.snapshot() == purchased)
	_check("numeric credit receipt survives restart", ledger.credit("alice", 200, "reward_a").ok and ledger.snapshot() == purchased)
	_check("owner access only by default", ledger.can_access("alice", "test_home") and not ledger.can_access("bob", "test_home"))
	_check("outsider storage denied", not ledger.store_item("bob", "test_home", "scrap", 1, "steal").ok)
	_check("non-owner cannot grant", not ledger.set_guest("bob", "test_home", "bob", true, "grant_bad").ok)
	_check("owner grants existing guest", ledger.set_guest("alice", "test_home", "bob", true, "grant").ok and ledger.can_access("bob", "test_home"))
	_check("owner stores catalog item", ledger.store_item("alice", "test_home", "scrap", 6, "store").ok)
	_check("guest adds within capacity", ledger.store_item("bob", "test_home", "bandage", 4, "guest_store").ok)
	_check("total item count bounds capacity", not ledger.store_item("alice", "test_home", "scrap", 1, "overflow").ok)
	_check("guest takes and conserves counts", ledger.take_item("bob", "test_home", "scrap", 2, "take").ok and ledger.snapshot().parcels.test_home.items.scrap == 4)
	var stored: Dictionary = ledger.snapshot()
	_check("storage receipts prevent double movement", ledger.store_item("alice", "test_home", "scrap", 6, "store").ok and ledger.take_item("bob", "test_home", "scrap", 2, "take").ok and ledger.snapshot() == stored)
	_check("storage receipt rejects changed quantity", not ledger.take_item("bob", "test_home", "scrap", 3, "take").ok)
	_check("cannot remove more than stored", not ledger.take_item("alice", "test_home", "scrap", 5, "underflow").ok)
	_check("taking whole stack removes empty key", ledger.take_item("alice", "test_home", "scrap", 4, "empty").ok and not ledger.snapshot().parcels.test_home.items.has("scrap"))
	_check("owner revokes access", ledger.set_guest("alice", "test_home", "bob", false, "revoke").ok and not ledger.can_access("bob", "test_home"))
	_check("revoked guest cannot move storage", not ledger.take_item("bob", "test_home", "bandage", 1, "revoked_take").ok and not ledger.store_item("bob", "test_home", "scrap", 1, "revoked_store").ok)
	_check("old grant replay does not restore access", ledger.set_guest("alice", "test_home", "bob", true, "grant").ok and not ledger.can_access("bob", "test_home"))
	var valid: Dictionary = ledger.snapshot()
	for bad_id: String in ["", "../alice", "a b", "a".repeat(129)]:
		_check("invalid ID rejected: %s" % bad_id.left(12), not ledger.ensure_account(bad_id).ok and not ledger.credit("alice", 1, bad_id).ok)
	for quantity: int in [0, -1, 1000000001]:
		_check("invalid quantity rejected: %d" % quantity, not ledger.credit("alice", quantity, "bad_credit").ok and not ledger.store_item("alice", "test_home", "scrap", quantity, "bad_store").ok and not ledger.take_item("alice", "test_home", "bandage", quantity, "bad_take").ok)
	_check("unknown item rejected", not ledger.store_item("alice", "test_home", "invented_item", 1, "bad_item").ok)
	_check("unknown account rejected", not ledger.credit("nobody", 1, "bad_account").ok)
	_check("unknown guest rejected", not ledger.set_guest("alice", "test_home", "nobody", true, "bad_guest").ok)
	_check("unknown parcel rejected", not ledger.purchase("alice", "missing", "bad_parcel").ok)
	_check("rejected commands leave no mutations or receipts", ledger.snapshot() == valid)
	_check("account ensure is idempotent", ledger.ensure_account("alice").ok and ledger.snapshot() == valid)
	_check("storage and revocation persist", reloaded.open(root + "/ledger.json", rows) == OK and reloaded.snapshot() == valid)
	# Corrupt JSON/schema must never replace an already open authority.
	_write(root + "/corrupt.json", "{broken")
	_check("corrupt JSON fails without reset", ledger.open(root + "/corrupt.json", rows) != OK and ledger.snapshot() == valid)
	for field: String in ["version", "accounts", "parcels", "receipts"]:
		var broken: Dictionary = valid.duplicate(true)
		broken[field] = null
		_write(root + "/corrupt.json", JSON.stringify(broken))
		_check("corrupt %s rejected" % field, ledger.open(root + "/corrupt.json", rows) != OK and ledger.snapshot() == valid)
	var broken_balance: Dictionary = valid.duplicate(true)
	broken_balance.accounts.alice.scrip = -1
	_write(root + "/corrupt.json", JSON.stringify(broken_balance))
	_check("negative saved balance rejected", ledger.open(root + "/corrupt.json", rows) != OK and ledger.snapshot() == valid)
	_write(root + "/blocker", "not a directory")
	_check("non-writable open preserves live state", ledger.open(root + "/blocker/ledger.json", rows) != OK and ledger.snapshot() == valid)
	var bad_rows: Array = rows.duplicate(true)
	bad_rows[0].price = -1
	_check("malformed parcel rows rejected", ledger.open(root + "/ledger.json", bad_rows) != OK and ledger.snapshot() == valid)
	# Replace the destination with a directory to force a real rename failure.
	# Keep the old file beside it; no user saves are involved.
	var disk_before: String = FileAccess.get_file_as_string(root + "/ledger.json")
	DirAccess.rename_absolute(root + "/ledger.json", root + "/preserved.json")
	DirAccess.make_dir_absolute(root + "/ledger.json")
	_check("failed durable commit cannot credit", not ledger.credit("alice", 5, "io_fail").ok and ledger.snapshot() == valid)
	_check("failed durable commit cannot create account", not ledger.ensure_account("charlie").ok and ledger.snapshot() == valid)
	DirAccess.remove_absolute(root + "/ledger.json")
	DirAccess.rename_absolute(root + "/preserved.json", root + "/ledger.json")
	_check("failed commit preserved previous disk contents", FileAccess.get_file_as_string(root + "/ledger.json") == disk_before)
	_check("failed receipt can retry after IO recovers", ledger.credit("alice", 5, "io_fail").ok and ledger.snapshot().accounts.alice.scrip == 55)
	var content: Variant = JSON.parse_string(FileAccess.get_file_as_string("res://data/properties.json"))
	_check("three shipped properties validate", content is Dictionary and content.get("properties", []).size() == 3 and component.new().open(root + "/content.json", content.properties) == OK)
	# Remove only explicit temporary files created by this test.
	for file: String in ["ledger.json", "corrupt.json", "blocker", "content.json"]:
		DirAccess.remove_absolute(root + "/" + file)
	DirAccess.remove_absolute(root)
	_finish()


func _write(path: String, value: String) -> void:
	var file: FileAccess = FileAccess.open(path, FileAccess.WRITE)
	file.store_string(value)
	file.close()
