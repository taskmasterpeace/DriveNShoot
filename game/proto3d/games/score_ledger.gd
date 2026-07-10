## THE SCORE LEDGER: one validation/idempotency/save path for every cartridge.
## Fictional house records are kept visibly separate from human session data.
class_name ProtoScoreLedger
extends RefCounted

const RECENT_PER_GAME_CAP := 50
const CHALLENGE_CAP := 100
const CARTRIDGE_ITEM_PREFIX := "game_cart_"

var registry: RefCounted
var unlocked: Array = []
var personal_bests: Dictionary = {}
var recent_results: Array = []
var challenges: Array = []
var settings: Dictionary = {}
var seen_help: Array = []
var tournament_records: Dictionary = {}
var _seen_result_ids: Dictionary = {}
var _starter_unlocks: Array = []


func _init(new_registry: RefCounted) -> void:
	registry = new_registry
	for id in registry.order:
		var row: Dictionary = registry.rows[id]
		if String(row.get("unlock_type", "")) == "starter":
			_starter_unlocks.append(String(id))
	unlocked = _starter_unlocks.duplicate()


func is_unlocked(game_id: String) -> bool:
	return unlocked.has(game_id)


func unlock(game_id: String) -> bool:
	if registry.get_game(game_id).is_empty() or unlocked.has(game_id):
		return false
	unlocked.append(game_id)
	return true


func game_id_for_item(item_id: String) -> String:
	if not item_id.begins_with(CARTRIDGE_ITEM_PREFIX):
		return ""
	var game_id := item_id.trim_prefix(CARTRIDGE_ITEM_PREFIX)
	return game_id if not registry.get_game(game_id).is_empty() else ""


func install_item(item_id: String) -> bool:
	var game_id := game_id_for_item(item_id)
	return game_id != "" and unlock(game_id)


func installed_count(phase: int = 1) -> int:
	var count := 0
	for game_id_value in unlocked:
		var row: Dictionary = registry.get_game(String(game_id_value))
		if int(row.get("phase", 0)) == phase:
			count += 1
	return count


func submit(result: Dictionary) -> bool:
	if not _valid_result(result):
		return false
	var result_id := String(result["result_id"])
	if _seen_result_ids.has(result_id):
		return false
	var stored := result.duplicate(true)
	_seen_result_ids[result_id] = true
	recent_results.append(stored)
	var key := _best_key(String(stored["game_id"]), String(stored["ruleset"]))
	var prior: Dictionary = personal_bests.get(key, {})
	var game_row: Dictionary = registry.get_game(String(stored["game_id"]))
	if prior.is_empty() or _better(stored, prior, game_row):
		personal_bests[key] = stored.duplicate(true)
	_cap_game_history(String(stored["game_id"]))
	return true


func _valid_result(result: Dictionary) -> bool:
	var result_id := String(result.get("result_id", ""))
	var game_id := String(result.get("game_id", ""))
	var ruleset := String(result.get("ruleset", ""))
	var primary: Variant = result.get("primary", null)
	if result_id == "" or game_id == "" or ruleset == "":
		return false
	var game_row: Dictionary = registry.get_game(game_id)
	if game_row.is_empty():
		return false
	if ruleset != String(game_row.get("ruleset", "")):
		return false
	if not (primary is int or primary is float):
		return false
	if String(result.get("outcome", "")) != "complete":
		return false
	return true


func _cap_game_history(game_id: String) -> void:
	var count := 0
	for result in recent_results:
		if String((result as Dictionary).get("game_id", "")) == game_id:
			count += 1
	while count > RECENT_PER_GAME_CAP:
		for index in recent_results.size():
			var row: Dictionary = recent_results[index]
			if String(row.get("game_id", "")) == game_id:
				recent_results.remove_at(index)
				count -= 1
				break


func personal_best(game_id: String, ruleset: String) -> Dictionary:
	return personal_bests.get(_best_key(game_id, ruleset), {})


func _best_key(game_id: String, ruleset: String) -> String:
	return "%s|%s" % [game_id, ruleset]


func _better(candidate: Dictionary, incumbent: Dictionary, game_row: Dictionary) -> bool:
	var direction := String((game_row.get("score", {}) as Dictionary).get("direction", "high"))
	var candidate_primary := float(candidate.get("primary", 0.0))
	var incumbent_primary := float(incumbent.get("primary", 0.0))
	if not is_equal_approx(candidate_primary, incumbent_primary):
		return candidate_primary > incumbent_primary if direction == "high" else candidate_primary < incumbent_primary
	var secondary_key := String((game_row.get("score", {}) as Dictionary).get("secondary", ""))
	if secondary_key == "":
		return false
	var candidate_secondary := float((candidate.get("secondary", {}) as Dictionary).get(secondary_key, 0.0))
	var incumbent_secondary := float((incumbent.get("secondary", {}) as Dictionary).get(secondary_key, 0.0))
	var secondary_low := secondary_key.ends_with("_ms") or secondary_key in ["moves", "turns", "errors"]
	return candidate_secondary < incumbent_secondary if secondary_low else candidate_secondary > incumbent_secondary


func create_challenge(result: Dictionary, target_peer: int) -> Dictionary:
	if target_peer <= 0 or not _valid_result(result):
		return {}
	var challenge := {
		"challenge_id": "challenge:%s:%d" % [String(result["result_id"]), target_peer],
		"source_result_id": String(result["result_id"]),
		"game_id": String(result["game_id"]),
		"ruleset": String(result["ruleset"]),
		"seed": int(result.get("seed", 0)),
		"target_peer": target_peer,
		"target_primary": result["primary"],
		"status": "open",
	}
	challenges.append(challenge)
	while challenges.size() > CHALLENGE_CAP:
		challenges.pop_front()
	return challenge.duplicate(true)


func board(game_id: String, ruleset: String, scope: String) -> Array:
	var out: Array = []
	if scope == "house":
		for board_value in registry.house_boards:
			var board_row: Dictionary = board_value
			if String(board_row.get("game_id", "")) != game_id \
					or String(board_row.get("ruleset", "")) != ruleset:
				continue
			for entry_value in board_row.get("entries", []):
				var entry := (entry_value as Dictionary).duplicate(true)
				entry["fictional"] = true
				entry["scope"] = "house"
				out.append(entry)
	elif scope == "personal":
		var best := personal_best(game_id, ruleset)
		if not best.is_empty():
			var entry := best.duplicate(true)
			entry["fictional"] = false
			entry["scope"] = "personal"
			out.append(entry)
	elif scope == "session":
		for result_value in recent_results:
			var result: Dictionary = result_value
			if String(result.get("game_id", "")) == game_id \
					and String(result.get("ruleset", "")) == ruleset \
					and String(result.get("source", "")) == "session":
				var entry := result.duplicate(true)
				entry["fictional"] = false
				entry["scope"] = "session"
				out.append(entry)
	var game_row: Dictionary = registry.get_game(game_id)
	out.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		return _better(a, b, game_row))
	return out


func serialize() -> Dictionary:
	return {
		"unlocked": unlocked.duplicate(),
		"personal_bests": personal_bests.duplicate(true),
		"recent_results": recent_results.duplicate(true),
		"challenges": challenges.duplicate(true),
		"settings": settings.duplicate(true),
		"seen_help": seen_help.duplicate(),
		"tournament_records": tournament_records.duplicate(true),
	}


func restore(data: Dictionary) -> void:
	unlocked.clear()
	for game_id_value in data.get("unlocked", _starter_unlocks):
		var game_id := String(game_id_value)
		if not registry.get_game(game_id).is_empty() and not unlocked.has(game_id):
			unlocked.append(game_id)
	for starter_value in _starter_unlocks:
		if not unlocked.has(starter_value):
			unlocked.append(starter_value)
	personal_bests = (data.get("personal_bests", {}) as Dictionary).duplicate(true)
	recent_results = (data.get("recent_results", []) as Array).duplicate(true)
	challenges = (data.get("challenges", []) as Array).duplicate(true)
	settings = (data.get("settings", {}) as Dictionary).duplicate(true)
	seen_help = (data.get("seen_help", []) as Array).duplicate()
	tournament_records = (data.get("tournament_records", {}) as Dictionary).duplicate(true)
	_seen_result_ids.clear()
	for result_value in recent_results:
		var result: Dictionary = result_value
		var result_id := String(result.get("result_id", ""))
		if result_id != "":
			_seen_result_ids[result_id] = true
