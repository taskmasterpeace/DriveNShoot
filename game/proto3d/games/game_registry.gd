## ONE CATALOG, ONE WIRE: validates every in-world cartridge row without ever
## making a missing future scene fatal to DRIVN. Rights notices are a runtime
## gate: an installed scene is not enabled until every declared notice ships.
class_name ProtoGameRegistry
extends RefCounted

const GAMES_PATH := "res://data/games.json"
const SOURCES_PATH := "res://data/game_sources.json"
const DEVICES_PATH := "res://data/game_devices.json"
const LEADERBOARDS_PATH := "res://data/game_leaderboards.json"
const ALLOWED_ASPECTS := ["1:1", "9:16", "16:9"]
const ALLOWED_PLATFORMS := ["handheld", "console"]
const ALLOWED_DIRECTIONS := ["high", "low"]

var rows: Dictionary = {}
var order: Array = []
var sources: Dictionary = {}
var devices: Dictionary = {}
var house_boards: Array = []
var load_warnings: Array = []


static func load_catalog(games_path: String = GAMES_PATH,
		sources_path: String = SOURCES_PATH,
		devices_path: String = DEVICES_PATH) -> ProtoGameRegistry:
	var out := ProtoGameRegistry.new()
	out._load_sources(sources_path)
	out._load_devices(devices_path)
	out._load_games(games_path)
	out._load_boards(LEADERBOARDS_PATH)
	return out


func _read_array(path: String, key: String) -> Array:
	if not FileAccess.file_exists(path):
		_warn("missing %s" % path)
		return []
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(path))
	if not (parsed is Dictionary) or not ((parsed as Dictionary).get(key, null) is Array):
		_warn("malformed %s (expected '%s' array)" % [path, key])
		return []
	return (parsed as Dictionary)[key]


func _load_sources(path: String) -> void:
	for value in _read_array(path, "sources"):
		if not (value is Dictionary):
			_warn("source row is not a dictionary")
			continue
		var row := (value as Dictionary).duplicate(true)
		var id := String(row.get("id", ""))
		if id == "" or sources.has(id):
			_warn("source id is empty or duplicate: '%s'" % id)
			continue
		if String(row.get("url", "")) == "" or String(row.get("notice_path", "")) == "":
			_warn("source '%s' lacks url or notice_path" % id)
			continue
		sources[id] = row


func _load_devices(path: String) -> void:
	for value in _read_array(path, "devices"):
		if not (value is Dictionary):
			_warn("device row is not a dictionary")
			continue
		var row := (value as Dictionary).duplicate(true)
		var id := String(row.get("id", ""))
		var resolution: Array = row.get("resolution", [])
		if id == "" or devices.has(id):
			_warn("device id is empty or duplicate: '%s'" % id)
			continue
		if not ALLOWED_PLATFORMS.has(String(row.get("platform", ""))) \
				or not ALLOWED_ASPECTS.has(String(row.get("aspect", ""))) \
				or resolution.size() != 2 or int(resolution[0]) <= 0 or int(resolution[1]) <= 0:
			_warn("device '%s' has an invalid platform, aspect, or resolution" % id)
			continue
		devices[id] = row


func _load_games(path: String) -> void:
	for value in _read_array(path, "games"):
		if not (value is Dictionary):
			_warn("game row is not a dictionary")
			continue
		var row := (value as Dictionary).duplicate(true)
		var reason := _game_error(row)
		if reason != "":
			_warn(reason)
			continue
		var id := String(row["id"])
		rows[id] = row
		order.append(id)


func _game_error(row: Dictionary) -> String:
	var id := String(row.get("id", ""))
	if id == "" or rows.has(id):
		return "game id is empty or duplicate: '%s'" % id
	if int(row.get("phase", 0)) not in [1, 2]:
		return "game '%s' has invalid phase" % id
	var platform := String(row.get("platform", ""))
	var aspect := String(row.get("aspect", ""))
	if not ALLOWED_PLATFORMS.has(platform) or not ALLOWED_ASPECTS.has(aspect):
		return "game '%s' has invalid platform or aspect" % id
	var device_id := String(row.get("device_id", ""))
	if not devices.has(device_id):
		return "game '%s' names unknown device '%s'" % [id, device_id]
	var device: Dictionary = devices[device_id]
	if String(device.get("platform", "")) != platform or String(device.get("aspect", "")) != aspect:
		return "game '%s' does not match device '%s'" % [id, device_id]
	if String(row.get("title", "")) == "" or String(row.get("cartridge_scene", "")) == "":
		return "game '%s' lacks title or cartridge_scene" % id
	var players: Variant = row.get("players", null)
	if not (players is Dictionary):
		return "game '%s' lacks players dictionary" % id
	var player_row := players as Dictionary
	if int(player_row.get("min", 0)) < 1 or int(player_row.get("max", 0)) < int(player_row.get("min", 0)):
		return "game '%s' has invalid player range" % id
	var score: Variant = row.get("score", null)
	if not (score is Dictionary) or String((score as Dictionary).get("primary", "")) == "" \
			or not ALLOWED_DIRECTIONS.has(String((score as Dictionary).get("direction", ""))):
		return "game '%s' has invalid score contract" % id
	var source_ids: Variant = row.get("source_ids", null)
	if not (source_ids is Array) or (source_ids as Array).is_empty():
		return "game '%s' lacks source ids" % id
	for source_id in source_ids as Array:
		if not sources.has(String(source_id)):
			return "game '%s' names unknown source '%s'" % [id, source_id]
	for field in ["controls_profile", "manual_book_id", "unlock_type", "ruleset", "help", "about_world"]:
		if String(row.get(field, "")) == "":
			return "game '%s' lacks required field '%s'" % [id, field]
	if platform == "console" and float(row.get("local_radius_m", 0.0)) <= 0.0:
		return "console game '%s' lacks local radius" % id
	return ""


func _load_boards(path: String) -> void:
	for value in _read_array(path, "boards"):
		if value is Dictionary:
			house_boards.append((value as Dictionary).duplicate(true))


func _warn(message: String) -> void:
	load_warnings.append(message)
	push_warning("GameRegistry: %s" % message)


func get_game(id: String) -> Dictionary:
	return rows.get(id, {})


func get_source(id: String) -> Dictionary:
	return sources.get(id, {})


func get_device(id: String) -> Dictionary:
	return devices.get(id, {})


func phase_rows(phase: int) -> Array:
	var out: Array = []
	for id in order:
		var row: Dictionary = rows[id]
		if int(row.get("phase", 0)) == phase:
			out.append(row)
	return out


func installed(id: String) -> bool:
	var row := get_game(id)
	return not row.is_empty() and ResourceLoader.exists(String(row.get("cartridge_scene", "")))


func enabled(id: String) -> bool:
	var row := get_game(id)
	if not installed(id):
		return false
	for source_id in row.get("source_ids", []):
		var source: Dictionary = sources.get(String(source_id), {})
		if source.is_empty() or not FileAccess.file_exists(String(source.get("notice_path", ""))):
			return false
	return true


func cartridge_contract_error(id: String) -> String:
	var row := get_game(id)
	if row.is_empty():
		return "unknown cartridge"
	var scene_path := String(row.get("cartridge_scene", ""))
	if not ResourceLoader.exists(scene_path):
		return "not installed"
	var packed := load(scene_path) as PackedScene
	if packed == null:
		return "scene does not load"
	var instance := packed.instantiate()
	if not (instance is Control):
		instance.free()
		return "root is not Control"
	for method in ["configure", "start_match", "apply_inputs", "pause_match", "snapshot",
			"restore_snapshot", "stop_match", "debug_force_finish"]:
		if not instance.has_method(method):
			instance.free()
			return "missing method %s" % method
	instance.free()
	return ""
