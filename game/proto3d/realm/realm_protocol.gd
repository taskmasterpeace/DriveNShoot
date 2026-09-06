class_name ProtoRealmProtocol
extends RefCounted
## Exact JSON command schema and detached per-account authority projection.

const VERSION: int = 1
const REQUEST_ID_MAX: int = 48
const REALM_ID_MAX: int = 64


static func command_error(value: Variant) -> String:
	if not value is Dictionary:
		return "command_not_object"
	var command: Dictionary = value
	if command.size() != 4:
		return "command_fields"
	for field: String in ["version", "kind", "request_id", "parcel_id"]:
		if not command.has(field):
			return "command_fields"
	if not _version_one(command.version):
		return "command_version"
	if not command.kind is String or command.kind != "purchase":
		return "command_kind"
	if not _valid_id(command.request_id, REQUEST_ID_MAX):
		return "request_id"
	if not _valid_id(command.parcel_id, REALM_ID_MAX):
		return "parcel_id"
	return ""


static func receipt_key(account_id: String, request_id: String) -> String:
	# The account length makes the two variable fields independently decodable.
	return "%d:%s:%s" % [account_id.length(), account_id, request_id]


static func project(state: Dictionary, account_id: String) -> Dictionary:
	var accounts: Variant = state.get("accounts")
	var parcels: Variant = state.get("parcels")
	if not accounts is Dictionary or not parcels is Dictionary or not accounts.has(account_id):
		return {}
	var account: Variant = accounts[account_id]
	if not account is Dictionary or not account.get("scrip") is int:
		return {}
	var projected_parcels: Dictionary = {}
	for parcel_id: Variant in parcels:
		if not parcel_id is String:
			return {}
		var parcel: Variant = parcels[parcel_id]
		if not parcel is Dictionary or not parcel.get("owner_id") is String or not parcel.get("guests") is Dictionary:
			return {}
		var owner_id: String = parcel.owner_id
		projected_parcels[parcel_id] = {
			"ownership": "unowned" if owner_id.is_empty() else ("self" if owner_id == account_id else "other"),
			"can_access": owner_id == account_id or parcel.guests.has(account_id)
		}
	return {
		"version": VERSION,
		"kind": "view",
		"balance": int(account.scrip),
		"parcels": projected_parcels
	}


static func _version_one(value: Variant) -> bool:
	if not (value is int or value is float):
		return false
	return is_finite(float(value)) and float(value) == 1.0


static func _valid_id(value: Variant, maximum: int) -> bool:
	if not value is String or value.is_empty() or value.length() > maximum:
		return false
	for index: int in value.length():
		var code: int = value.unicode_at(index)
		if not (code >= 48 and code <= 57 or code >= 65 and code <= 90 or code >= 97 and code <= 122 or code in [45, 46, 58, 95]):
			return false
	return true
