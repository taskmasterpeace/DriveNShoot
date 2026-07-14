## THE CARTRIDGE CONTRACT. Individual games own rules and presentation only;
## the deck owns devices, shell, networking, save, and the world around them.
class_name ProtoGameCartridge
extends Control

signal score_changed(score: Dictionary)
signal match_finished(result: Dictionary)
signal request_feedback(kind: String, payload: Dictionary)
signal network_event_requested(event: Dictionary)

var game_row: Dictionary = {}
var context: Dictionary = {}
var game_id := ""
var ruleset := "stock-1"
var seed_value := 0
var seats: Array = []
var tick := 0
var active := false
var paused := false
var finished := false
var last_result: Dictionary = {}
var participant_total := 0
var _session_id := ""


func configure(new_game_row: Dictionary, new_context: Dictionary) -> void:
	game_row = new_game_row.duplicate(true)
	context = new_context.duplicate(true)
	game_id = String(game_row.get("id", ""))
	ruleset = String(game_row.get("ruleset", "stock-1"))


func start_match(new_seed: int, new_seats: Array) -> void:
	seed_value = new_seed
	seats = new_seats.duplicate(true)
	participant_total = new_seats.size()
	tick = 0
	active = true
	paused = false
	finished = false
	last_result.clear()
	_session_id = String(context.get("session_id", "%s-%d-%d" % [game_id, seed_value, get_instance_id()]))


func target_participant_count(minimum: int, maximum: int,
		human_count: int = seats.size()) -> int:
	var safe_minimum := maxi(0, minimum)
	var safe_maximum := maxi(safe_minimum, maximum)
	var requested := int(context.get("actor_count", -1))
	if requested >= 0:
		participant_total = clampi(requested, safe_minimum, safe_maximum)
	elif bool(context.get("bots_enabled", false)):
		participant_total = safe_maximum
	else:
		participant_total = clampi(human_count, safe_minimum, safe_maximum)
	return participant_total


func apply_inputs(_new_tick: int, _snapshots: Array) -> void:
	pass


func apply_event(_event: Dictionary) -> void:
	pass


func snapshot() -> Dictionary:
	return {
		"game_id": game_id,
		"ruleset": ruleset,
		"seed": seed_value,
		"seats": seats.duplicate(true),
		"tick": tick,
		"active": active,
		"paused": paused,
		"finished": finished,
		"session_id": _session_id,
	}


func restore_snapshot(state: Dictionary) -> void:
	seed_value = int(state.get("seed", seed_value))
	seats = (state.get("seats", seats) as Array).duplicate(true)
	tick = int(state.get("tick", tick))
	active = bool(state.get("active", active))
	paused = bool(state.get("paused", paused))
	finished = bool(state.get("finished", finished))
	_session_id = String(state.get("session_id", _session_id))


func pause_match(is_paused: bool) -> void:
	paused = is_paused


func stop_match(_reason: String) -> void:
	active = false
	paused = false


func finish_match(result: Dictionary) -> bool:
	if finished:
		return false
	finished = true
	active = false
	paused = false
	last_result = result.duplicate(true)
	last_result["result_id"] = String(last_result.get("result_id", "%s:%d" % [_session_id, tick]))
	last_result["game_id"] = game_id
	last_result["ruleset"] = ruleset
	last_result["seed"] = seed_value
	last_result["players"] = seats.duplicate(true)
	last_result["tick"] = tick
	last_result["outcome"] = String(last_result.get("outcome", "complete"))
	last_result["ranked"] = bool(last_result.get("ranked", true))
	last_result["source"] = String(last_result.get("source", context.get("source", "solo")))
	match_finished.emit(last_result.duplicate(true))
	return true
