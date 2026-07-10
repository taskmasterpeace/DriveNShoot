## Save-free scoring for repeatable Physics Lab bouts. Damage is recorded here,
## never in ProtoCharacter, so depletion means a round card rather than death.
class_name ProtoLabRound
extends RefCounted

signal round_ended(card: Dictionary)
signal match_ended(winner_id: String)
signal reset_requested

const ROUND_CARD_S := 1.2

var phase: String = "idle"
var winner: String = ""
var last_card: Dictionary = {}
var reset_count: int = 0
var freeze_remaining: float = 0.0
var round_index: int = 1
var rounds_to_win: int = 2
var max_health: float = 100.0
var fighters: Dictionary = {}
var fighter_order: Array[String] = []


func setup(ids: Array, health_in: float = 100.0, rounds_to_win_in: int = 2) -> void:
	max_health = maxf(1.0, health_in)
	rounds_to_win = maxi(1, rounds_to_win_in)
	fighter_order.clear()
	fighters.clear()
	for raw_id in ids:
		var id := String(raw_id)
		fighter_order.append(id)
		fighters[id] = _fresh_fighter()
	phase = "active"
	winner = ""
	last_card.clear()
	reset_count = 0
	freeze_remaining = 0.0
	round_index = 1


func _fresh_fighter() -> Dictionary:
	return {"health": max_health, "rounds": 0, "points": 0,
		"knockdowns": 0, "hits": 0, "damage_taken": 0.0}


func health(id: String) -> float:
	return float((fighters.get(id, {}) as Dictionary).get("health", 0.0))


func rounds(id: String) -> int:
	return int((fighters.get(id, {}) as Dictionary).get("rounds", 0))


func points(id: String) -> int:
	return int((fighters.get(id, {}) as Dictionary).get("points", 0))


func commands_frozen() -> bool:
	return phase != "active"


func opponent_of(id: String) -> String:
	for candidate in fighter_order:
		if candidate != id:
			return candidate
	return ""


func hit(fighter_id: String, amount: float, tags: Dictionary = {}) -> Dictionary:
	if phase != "active" or not fighters.has(fighter_id) or amount <= 0.0:
		return snapshot()
	var fighter := fighters[fighter_id] as Dictionary
	fighter["health"] = maxf(0.0, float(fighter["health"]) - amount)
	fighter["damage_taken"] = float(fighter["damage_taken"]) + amount
	var attacker: String = String(tags.get("attacker", opponent_of(fighter_id)))
	if fighters.has(attacker):
		var scorer := fighters[attacker] as Dictionary
		scorer["hits"] = int(scorer.get("hits", 0)) + 1
	if float(fighter["health"]) <= 0.0:
		_end_round(attacker, fighter_id, String(tags.get("kind", "depletion")).to_upper())
	return snapshot()


func knockdown(fighter_id: String, attacker_id: String = "") -> void:
	if phase != "active" or not fighters.has(fighter_id):
		return
	var attacker: String = attacker_id if attacker_id != "" else opponent_of(fighter_id)
	if not fighters.has(attacker):
		return
	var victim := fighters[fighter_id] as Dictionary
	var scorer := fighters[attacker] as Dictionary
	victim["knockdowns"] = int(victim["knockdowns"]) + 1
	scorer["points"] = int(scorer["points"]) + 2


func score(fighter_id: String, event: String) -> void:
	if phase != "active" or not fighters.has(fighter_id):
		return
	var fighter := fighters[fighter_id] as Dictionary
	match event:
		"clean_combo": fighter["points"] = int(fighter["points"]) + 1
		"knockdown": fighter["points"] = int(fighter["points"]) + 2


func ring_out(fighter_id: String, attacker_id: String = "") -> void:
	if phase != "active" or not fighters.has(fighter_id):
		return
	var attacker: String = attacker_id if attacker_id != "" else opponent_of(fighter_id)
	_end_round(attacker, fighter_id, "RING OUT")


func _end_round(scorer_id: String, defeated_id: String, reason: String) -> void:
	if not fighters.has(scorer_id):
		return
	var scorer := fighters[scorer_id] as Dictionary
	scorer["rounds"] = int(scorer["rounds"]) + 1
	last_card = {"round": round_index, "winner": scorer_id,
		"defeated": defeated_id, "reason": reason, "hold_s": ROUND_CARD_S}
	freeze_remaining = ROUND_CARD_S
	if int(scorer["rounds"]) >= rounds_to_win:
		winner = scorer_id
		phase = "match_end"
		match_ended.emit(winner)
	else:
		phase = "round_end"
	round_ended.emit(last_card.duplicate(true))


func tick(delta: float) -> void:
	if phase != "round_end":
		return
	freeze_remaining = maxf(0.0, freeze_remaining - delta)
	if freeze_remaining <= 0.0:
		reset_round()


func reset_round() -> void:
	for id in fighter_order:
		(fighters[id] as Dictionary)["health"] = max_health
	phase = "active"
	freeze_remaining = 0.0
	round_index += 1
	reset_count += 1
	reset_requested.emit()


func reset_match() -> void:
	for id in fighter_order:
		fighters[id] = _fresh_fighter()
	phase = "active"
	winner = ""
	last_card.clear()
	freeze_remaining = 0.0
	round_index = 1
	reset_requested.emit()


func snapshot() -> Dictionary:
	return {"nonlethal": true, "phase": phase, "winner": winner,
		"round": round_index, "freeze_remaining": freeze_remaining,
		"last_card": last_card.duplicate(true), "fighters": fighters.duplicate(true)}


func restore_snapshot(state: Dictionary) -> bool:
	if not bool(state.get("nonlethal", false)) or not state.has("fighters"):
		return false
	phase = String(state.get("phase", "active"))
	winner = String(state.get("winner", ""))
	round_index = int(state.get("round", 1))
	freeze_remaining = float(state.get("freeze_remaining", 0.0))
	last_card = (state.get("last_card", {}) as Dictionary).duplicate(true)
	fighters = (state["fighters"] as Dictionary).duplicate(true)
	return true
