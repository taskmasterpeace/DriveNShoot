class_name ProtoPropertyLedger
extends RefCounted
## Trusted, single-writer realm authority. Never expose arbitrary account IDs as RPCs.
## Storage changes only this ledger; the runtime must transact backpack transfers.
## snapshot() is a detached authority/admin view, not a public client projection.

const VERSION: int = 1
const MAX_AMOUNT: int = 1000000000
const MAX_BALANCE: int = 1000000000000
const MAX_CAPACITY: int = 1000000
const MAX_ACCOUNTS: int = 10000
const MAX_RECEIPTS: int = 100000
const MAX_BYTES: int = 16 * 1024 * 1024
const ITEM_CATALOG: String = "res://data/items.json"

var _path: String = ""
var _state: Dictionary = {}
var _parcels: Dictionary = {}
var _items: Dictionary = {}
var _embedded_writer: Callable

## Trusted local runtime adapter: validates before replacing live authority.
## The callback must durably commit the entire run BEFORE returning OK.
func open_embedded(parcels: Array, state: Dictionary, writer: Callable) -> Error:
	var definitions: Dictionary = _parcel_definitions(parcels)
	var catalog: Dictionary = _item_catalog()
	if definitions.is_empty() or catalog.is_empty() or not _valid_state(state, definitions, catalog):
		return ERR_FILE_CORRUPT
	_state = state.duplicate(true)
	_normalize_numbers(_state)
	_parcels = definitions
	_items = catalog
	_path = ""
	_embedded_writer = writer
	return OK


func open(path: String, parcels: Array) -> Error:
	if path.is_empty() or path.length() > 4096:
		return ERR_INVALID_PARAMETER
	var definitions: Dictionary = _parcel_definitions(parcels)
	if definitions.is_empty():
		return ERR_INVALID_DATA
	var catalog: Dictionary = _item_catalog()
	if catalog.is_empty():
		return ERR_INVALID_DATA
	var candidate: Dictionary = {}
	if FileAccess.file_exists(path):
		var file: FileAccess = FileAccess.open(path, FileAccess.READ)
		if file == null:
			return FileAccess.get_open_error()
		if file.get_length() > MAX_BYTES:
			file.close()
			return ERR_FILE_CORRUPT
		var json: JSON = JSON.new()
		var parse_error: Error = json.parse(file.get_as_text())
		file.close()
		if parse_error != OK or not json.data is Dictionary:
			return ERR_FILE_CORRUPT
		candidate = json.data
		if not _valid_state(candidate, definitions, catalog):
			return ERR_FILE_CORRUPT
		_normalize_numbers(candidate)
	else:
		candidate = {"version": VERSION, "accounts": {}, "parcels": {}, "receipts": {}}
		for parcel_id: String in definitions:
			candidate.parcels[parcel_id] = {"owner_id": "", "guests": {}, "items": {}}
		var write_error: Error = _persist(path, candidate)
		if write_error != OK:
			return write_error
	# A failed open must leave the previous authority/path/catalog intact.
	_path = path
	_parcels = definitions
	_items = catalog
	_state = candidate
	_embedded_writer = Callable()
	return OK


func ensure_account(account_id: String) -> Dictionary:
	if _state.is_empty():
		return _failure("not_open")
	if not _valid_id(account_id):
		return _failure("invalid_account_id")
	if _state.accounts.has(account_id):
		return _success()
	if _state.accounts.size() >= MAX_ACCOUNTS:
		return _failure("account_limit")
	var candidate: Dictionary = _state.duplicate(true)
	candidate.accounts[account_id] = {"scrip": 0}
	return _commit(candidate)


func credit(account_id: String, amount: int, receipt_id: String) -> Dictionary:
	return _command(["credit", account_id, amount], receipt_id)


func purchase(account_id: String, parcel_id: String, request_id: String) -> Dictionary:
	return _command(["purchase", account_id, parcel_id], request_id)


func set_guest(owner_id: String, parcel_id: String, guest_id: String, allowed: bool, request_id: String) -> Dictionary:
	return _command(["set_guest", owner_id, parcel_id, guest_id, allowed], request_id)


func store_item(account_id: String, parcel_id: String, item_id: String, quantity: int, request_id: String) -> Dictionary:
	return _command(["store_item", account_id, parcel_id, item_id, quantity], request_id)


func take_item(account_id: String, parcel_id: String, item_id: String, quantity: int, request_id: String) -> Dictionary:
	return _command(["take_item", account_id, parcel_id, item_id, quantity], request_id)


func snapshot() -> Dictionary:
	return _state.duplicate(true)


func can_access(account_id: String, parcel_id: String) -> bool:
	if _state.is_empty() or not _state.accounts.has(account_id) or not _state.parcels.has(parcel_id):
		return false
	var parcel: Dictionary = _state.parcels[parcel_id]
	return parcel.owner_id == account_id or parcel.guests.has(account_id)


func _command(payload: Array, request_id: String) -> Dictionary:
	if _state.is_empty():
		return _failure("not_open")
	if not _valid_id(request_id, 128) or not _valid_payload(payload):
		return _failure("invalid_request")
	if _state.receipts.has(request_id):
		# Global receipt namespace, including operation and every payload field.
		# Replays acknowledge historical success; they do not reapply permissions.
		var receipt: Dictionary = _state.receipts[request_id]
		return _success() if receipt.payload == payload else _failure("receipt_conflict")
	if _state.receipts.size() >= MAX_RECEIPTS:
		return _failure("receipt_limit")
	var account_id: String = payload[1]
	if not _state.accounts.has(account_id):
		return _failure("unknown_account")
	var candidate: Dictionary = _state.duplicate(true)
	var account: Dictionary = candidate.accounts[account_id]
	var operation: String = payload[0]
	if operation == "credit":
		var amount: int = int(payload[2])
		if int(account.scrip) > MAX_BALANCE - amount:
			return _failure("balance_limit")
		account.scrip = int(account.scrip) + amount
	else:
		var parcel_id: String = payload[2]
		if not _parcels.has(parcel_id):
			return _failure("unknown_parcel")
		var parcel: Dictionary = candidate.parcels[parcel_id]
		var definition: Dictionary = _parcels[parcel_id]
		match operation:
			"purchase":
				if not String(parcel.owner_id).is_empty():
					return _failure("already_owned")
				if int(account.scrip) < int(definition.price):
					return _failure("insufficient_funds")
				account.scrip = int(account.scrip) - int(definition.price)
				parcel.owner_id = account_id
			"set_guest":
				if parcel.owner_id != account_id:
					return _failure("owner_required")
				var guest_id: String = payload[3]
				if not candidate.accounts.has(guest_id) or guest_id == account_id:
					return _failure("invalid_guest")
				if payload[4]:
					parcel.guests[guest_id] = true
				else:
					parcel.guests.erase(guest_id)
			"store_item", "take_item":
				if not can_access(account_id, parcel_id):
					return _failure("access_denied")
				var item_id: String = payload[3]
				var quantity: int = int(payload[4])
				if not _items.has(item_id):
					return _failure("unknown_item")
				var count: int = int(parcel.items.get(item_id, 0))
				if operation == "store_item":
					if _item_count(parcel.items) + quantity > int(definition.item_capacity):
						return _failure("storage_full")
					parcel.items[item_id] = count + quantity
				else:
					if count < quantity:
						return _failure("insufficient_items")
					if count == quantity:
						parcel.items.erase(item_id)
					else:
						parcel.items[item_id] = count - quantity
	candidate.receipts[request_id] = {"payload": payload.duplicate(true)}
	return _commit(candidate)


func _commit(candidate: Dictionary) -> Dictionary:
	if not _valid_state(candidate, _parcels, _items):
		return _failure("invalid_state")
	var error: Error = _embedded_writer.call(candidate.duplicate(true)) if _embedded_writer.is_valid() else _persist(_path, candidate)
	if error != OK:
		return _failure("persistence_failed:%d" % error)
	_state = candidate
	return _success()


func _persist(path: String, candidate: Dictionary) -> Error:
	var serialized: String = JSON.stringify(candidate)
	var expected: PackedByteArray = serialized.to_utf8_buffer()
	if expected.size() > MAX_BYTES:
		return ERR_OUT_OF_MEMORY
	# Same-directory rename; never delete the previous authoritative file first.
	var temporary: String = "%s.tmp.%d.%d" % [path, OS.get_process_id(), Time.get_ticks_usec()]
	var file: FileAccess = FileAccess.open(temporary, FileAccess.WRITE)
	if file == null:
		return FileAccess.get_open_error()
	var stored: bool = file.store_buffer(expected)
	file.flush()
	var error: Error = file.get_error()
	file.close()
	if not stored and error == OK:
		error = ERR_FILE_CANT_WRITE
	if error == OK:
		error = _replace_verified(temporary, path, expected)
	if error != OK:
		DirAccess.remove_absolute(temporary)
	return error


func _replace_verified(temporary: String, path: String, expected: PackedByteArray) -> Error:
	# Windows flush()/close() may hide deferred stdio errors. Reopen the CLOSED
	# file and compare complete bytes before publishing, not just cached errors.
	var file: FileAccess = FileAccess.open(temporary, FileAccess.READ)
	if file == null:
		return FileAccess.get_open_error()
	if file.get_length() != expected.size():
		file.close()
		return ERR_FILE_CORRUPT
	var actual: PackedByteArray = file.get_buffer(expected.size())
	var error: Error = file.get_error()
	file.close()
	if error != OK:
		return error
	if actual != expected:
		return ERR_FILE_CORRUPT
	return DirAccess.rename_absolute(temporary, path)


func _valid_state(state: Dictionary, definitions: Dictionary, catalog: Dictionary) -> bool:
	if state.size() != 4 or not _integer(state.get("version"), VERSION, VERSION):
		return false
	for key: String in ["accounts", "parcels", "receipts"]:
		if not state.get(key) is Dictionary:
			return false
	if state.accounts.size() > MAX_ACCOUNTS or state.receipts.size() > MAX_RECEIPTS or state.parcels.size() != definitions.size():
		return false
	for account_id: Variant in state.accounts:
		var account: Variant = state.accounts[account_id]
		if not _valid_id(account_id) or not account is Dictionary or account.size() != 1 or not _integer(account.get("scrip"), 0, MAX_BALANCE):
			return false
	for parcel_id: Variant in state.parcels:
		if not definitions.has(parcel_id):
			return false
		var parcel: Variant = state.parcels[parcel_id]
		if not parcel is Dictionary or parcel.size() != 3 or not parcel.get("owner_id") is String or not parcel.get("guests") is Dictionary or not parcel.get("items") is Dictionary:
			return false
		var owner_id: String = parcel.owner_id
		if owner_id.is_empty():
			if not parcel.guests.is_empty() or not parcel.items.is_empty():
				return false
		elif not state.accounts.has(owner_id):
			return false
		for guest_id: Variant in parcel.guests:
			if guest_id == owner_id or not state.accounts.has(guest_id) or not parcel.guests[guest_id] is bool or parcel.guests[guest_id] != true:
				return false
		for item_id: Variant in parcel.items:
			if not catalog.has(item_id) or not _integer(parcel.items[item_id], 1, MAX_CAPACITY):
				return false
		if _item_count(parcel.items) > int(definitions[parcel_id].item_capacity):
			return false
	for request_id: Variant in state.receipts:
		var receipt: Variant = state.receipts[request_id]
		if not _valid_id(request_id, 128) or not receipt is Dictionary or receipt.size() != 1 or not _valid_payload(receipt.get("payload")):
			return false
		var payload: Array = receipt.payload
		if not state.accounts.has(payload[1]):
			return false
		if payload[0] != "credit" and not definitions.has(payload[2]):
			return false
		if payload[0] == "set_guest" and not state.accounts.has(payload[3]):
			return false
		if payload[0] in ["store_item", "take_item"] and not catalog.has(payload[3]):
			return false
	return true


func _valid_payload(payload: Variant) -> bool:
	if not payload is Array or payload.size() < 3 or not _valid_id(payload[1]):
		return false
	match payload[0]:
		"credit":
			return payload.size() == 3 and _integer(payload[2], 1, MAX_AMOUNT)
		"purchase":
			return payload.size() == 3 and _valid_id(payload[2])
		"set_guest":
			return payload.size() == 5 and _valid_id(payload[2]) and _valid_id(payload[3]) and payload[4] is bool
		"store_item", "take_item":
			return payload.size() == 5 and _valid_id(payload[2]) and _valid_id(payload[3]) and _integer(payload[4], 1, MAX_AMOUNT)
	return false


func _normalize_numbers(state: Dictionary) -> void:
	# JSON numbers arrive as floats. Validation precedes conversion, so fractions
	# and out-of-range amounts can never be silently rounded into valid balances.
	state.version = int(state.version)
	for account: Dictionary in state.accounts.values():
		account.scrip = int(account.scrip)
	for parcel: Dictionary in state.parcels.values():
		for item_id: String in parcel.items:
			parcel.items[item_id] = int(parcel.items[item_id])
	for receipt: Dictionary in state.receipts.values():
		var payload: Array = receipt.payload
		if payload[0] == "credit":
			payload[2] = int(payload[2])
		elif payload[0] in ["store_item", "take_item"]:
			payload[4] = int(payload[4])


func _parcel_definitions(rows: Array) -> Dictionary:
	var definitions: Dictionary = {}
	if rows.size() > 10000:
		return {}
	for row: Variant in rows:
		if not row is Dictionary or not _valid_id(row.get("id")) or definitions.has(row.id):
			return {}
		if not row.get("name") is String or row.name.is_empty() or row.name.length() > 128:
			return {}
		if not _integer(row.get("price"), 1, MAX_AMOUNT) or not _integer(row.get("item_capacity"), 1, MAX_CAPACITY):
			return {}
		if not row.get("model") is String or not row.model.begins_with("res://") or row.model.length() > 512:
			return {}
		definitions[row.id] = row.duplicate(true)
	return definitions


func _item_catalog() -> Dictionary:
	var data: Variant = JSON.parse_string(FileAccess.get_file_as_string(ITEM_CATALOG))
	var catalog: Dictionary = {}
	if not data is Dictionary or not data.get("items") is Array:
		return catalog
	for row: Variant in data.items:
		if not row is Dictionary or not _valid_id(row.get("id")) or catalog.has(row.id):
			return {}
		catalog[row.id] = true
	return catalog


func _valid_id(value: Variant, maximum: int = 64) -> bool:
	if not value is String or value.is_empty() or value.length() > maximum:
		return false
	for index: int in value.length():
		var code: int = value.unicode_at(index)
		if not (code >= 48 and code <= 57 or code >= 65 and code <= 90 or code >= 97 and code <= 122 or code in [45, 46, 58, 95]):
			return false
	return true


func _integer(value: Variant, minimum: int, maximum: int) -> bool:
	if not (value is int or value is float):
		return false
	return is_finite(float(value)) and value >= minimum and value <= maximum and float(value) == floor(float(value))


func _item_count(items: Dictionary) -> int:
	var total: int = 0
	for count: Variant in items.values():
		total += int(count)
	return total


func _success() -> Dictionary:
	return {"ok": true, "error": ""}


func _failure(reason: String) -> Dictionary:
	return {"ok": false, "error": reason}
