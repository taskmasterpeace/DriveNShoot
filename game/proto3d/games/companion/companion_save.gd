## Isolated persistence for DRIVN: GAME DECK. This store never discovers,
## reads, or writes the main DRIVN save path.
class_name ProtoCompanionSave
extends RefCounted

const SCHEMA := 1
const DEFAULT_PATH := "user://game_deck_companion_save.json"
const DEFAULT_UI := {
	"last_game_id": "waste_heap",
	"filter": "all",
	"volume": 1.0,
	"fullscreen": false,
	"reduced_motion": false,
	"seen_insert": false,
}

var path := DEFAULT_PATH


func payload(ledger: ProtoScoreLedger, ui_state: Dictionary) -> Dictionary:
	return {
		"schema": SCHEMA,
		"ledger": ledger.serialize(),
		"ui": _normalized_ui(ui_state),
	}


func save_from(ledger: ProtoScoreLedger, ui_state: Dictionary) -> Error:
	var temporary_path := path + ".tmp"
	var file := FileAccess.open(temporary_path, FileAccess.WRITE)
	if file == null:
		return FileAccess.get_open_error()
	file.store_string(JSON.stringify(payload(ledger, ui_state), "\t"))
	file.flush()
	file.close()
	var absolute_target := ProjectSettings.globalize_path(path)
	var absolute_temporary := ProjectSettings.globalize_path(temporary_path)
	if FileAccess.file_exists(path):
		var remove_error := DirAccess.remove_absolute(absolute_target)
		if remove_error != OK:
			DirAccess.remove_absolute(absolute_temporary)
			return remove_error
	var rename_error := DirAccess.rename_absolute(absolute_temporary, absolute_target)
	if rename_error != OK:
		DirAccess.remove_absolute(absolute_temporary)
	return rename_error as Error


func load_into(ledger: ProtoScoreLedger) -> Dictionary:
	if not FileAccess.file_exists(path):
		_unlock_all(ledger)
		return DEFAULT_UI.duplicate(true)
	var parser := JSON.new()
	var parse_error := parser.parse(FileAccess.get_file_as_string(path))
	var parsed: Variant = parser.data if parse_error == OK else null
	if not _valid_envelope(parsed):
		_quarantine_corrupt()
		_unlock_all(ledger)
		return DEFAULT_UI.duplicate(true)
	var envelope := parsed as Dictionary
	ledger.restore(envelope["ledger"] as Dictionary)
	_unlock_all(ledger)
	return _normalized_ui(envelope["ui"] as Dictionary)


func _valid_envelope(value: Variant) -> bool:
	if not (value is Dictionary):
		return false
	var envelope := value as Dictionary
	return int(envelope.get("schema", 0)) == SCHEMA \
		and envelope.get("ledger", null) is Dictionary \
		and envelope.get("ui", null) is Dictionary


func _normalized_ui(value: Dictionary) -> Dictionary:
	var filter_id := String(value.get("filter", DEFAULT_UI["filter"]))
	if filter_id not in ["all", "handheld", "console"]:
		filter_id = "all"
	return {
		"last_game_id": String(value.get("last_game_id", DEFAULT_UI["last_game_id"])),
		"filter": filter_id,
		"volume": clampf(float(value.get("volume", DEFAULT_UI["volume"])), 0.0, 1.0),
		"fullscreen": bool(value.get("fullscreen", DEFAULT_UI["fullscreen"])),
		"reduced_motion": bool(value.get("reduced_motion", DEFAULT_UI["reduced_motion"])),
		"seen_insert": bool(value.get("seen_insert", DEFAULT_UI["seen_insert"])),
	}


func _unlock_all(ledger: ProtoScoreLedger) -> void:
	for game_id_value in ledger.registry.order:
		var game_id := String(game_id_value)
		if not ledger.is_unlocked(game_id):
			ledger.unlock(game_id)


func _quarantine_corrupt() -> bool:
	if not FileAccess.file_exists(path):
		return false
	var absolute_source := ProjectSettings.globalize_path(path)
	var suffix := "%d.%d" % [int(Time.get_unix_time_from_system()), Time.get_ticks_msec()]
	var absolute_bad := absolute_source + ".bad." + suffix
	return DirAccess.rename_absolute(absolute_source, absolute_bad) == OK
