## Standalone WATCH · BET · ENTER tournament state. Physical bout adaptation is
## delegated to the lab; this node owns the one bracket, book, and settlement.
class_name ProtoLabSpectacle
extends Node

signal changed(facts: Dictionary)

const DATA_PATH := "res://data/spectacles.json"
const OPPONENT_PATH := "res://data/lab_opponents.json"
const STARTING_BANKROLL: int = 1000

var lab: Node3D = null
var card_id: String = ""
var seed: int = 0
var row: Dictionary = {}
var mode: String = "watch"
var phase: String = "disabled"
var entrants: Array = []
var matches: Array = []
var match_index: int = 0
var selected_index: int = 0
var stake: int = 10
var bankroll: int = STARTING_BANKROLL
var betting_card: Dictionary = {}
var ticket: Dictionary = {}
var champion: String = ""
var payout: int = 0
var status: String = ""
var _round_connected: bool = false


func setup(lab_in: Node3D, card_id_in: String, seed_in: int) -> bool:
	lab = lab_in
	card_id = card_id_in
	seed = seed_in
	var rows: Dictionary = _load_rows()
	if not rows.has(card_id):
		phase = "disabled"
		status = "CARD NOT FOUND"
		return false
	var candidate: Dictionary = (rows[card_id] as Dictionary).duplicate(true)
	var validation: Dictionary = validate_row(candidate)
	if not bool(validation["ok"]):
		phase = "disabled"
		status = String(validation["error"])
		return false
	row = candidate
	if lab != null and "lab_round" in lab and lab.lab_round != null and not _round_connected:
		lab.lab_round.match_ended.connect(_on_physical_match_ended)
		_round_connected = true
	_reset_state()
	return true


func _load_rows() -> Dictionary:
	if not FileAccess.file_exists(DATA_PATH):
		return {}
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(DATA_PATH))
	return (parsed as Dictionary).get("spectacles", {}) if parsed is Dictionary else {}


func _opponent_ids() -> Array[String]:
	var ids: Array[String] = []
	if not FileAccess.file_exists(OPPONENT_PATH):
		return ids
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(OPPONENT_PATH))
	if parsed is Dictionary:
		for id in ((parsed as Dictionary).get("opponents", {}) as Dictionary):
			ids.append(String(id))
	return ids


func validate_row(candidate: Dictionary) -> Dictionary:
	if not bool(candidate.get("nonlethal", false)):
		return {"ok":false, "error":"LETHAL CARDS ARE DISABLED"}
	var modes: Array = candidate.get("modes", [])
	for required in ["watch", "bet", "enter"]:
		if required not in modes:
			return {"ok":false, "error":"MISSING MODE %s" % required.to_upper()}
	var field: Array = candidate.get("entrants", [])
	if field.size() != 4:
		return {"ok":false, "error":"SHOOTOUT REQUIRES FOUR ENTRANTS"}
	var seen: Dictionary = {}
	var prohibited: Array = candidate.get("prohibited_groups", ["dog", "infected"])
	var opponent_ids: Array[String] = _opponent_ids()
	for raw_entrant in field:
		var entrant: Dictionary = raw_entrant
		var id: String = String(entrant.get("id", ""))
		if id == "" or seen.has(id):
			return {"ok":false, "error":"ENTRANT IDS MUST BE UNIQUE"}
		seen[id] = true
		if float(entrant.get("strength", 0.0)) <= 0.0:
			return {"ok":false, "error":"STRENGTH MUST BE POSITIVE"}
		if String(entrant.get("group", "human")) in prohibited:
			return {"ok":false, "error":"PROHIBITED ENTRANT GROUP"}
		if String(entrant.get("weapon_id", "")) not in ProtoWeapon.WEAPONS:
			return {"ok":false, "error":"UNKNOWN WEAPON"}
		if String(entrant.get("opponent_row", "")) not in opponent_ids:
			return {"ok":false, "error":"UNKNOWN OPPONENT ROW"}
	var minimum: int = int(candidate.get("stake_min", 0))
	var maximum: int = int(candidate.get("stake_max", 0))
	var step: int = int(candidate.get("stake_step", 0))
	if minimum < 1 or maximum < minimum or step < 1:
		return {"ok":false, "error":"INVALID STAKE BAND"}
	return {"ok":true, "error":""}


func _reset_state() -> void:
	mode = "watch"
	phase = "ready"
	match_index = 0
	selected_index = 0
	stake = int(row["stake_min"])
	bankroll = STARTING_BANKROLL
	ticket.clear()
	champion = ""
	payout = 0
	status = "CHOOSE WATCH OR ENTER · BET BEFORE START"
	_build_field_and_bracket()
	_emit_changed()


func _build_field_and_bracket() -> void:
	var source: Array = (row["entrants"] as Array).duplicate(true)
	var rotation: int = posmod(seed, source.size())
	entrants.clear()
	for i in source.size():
		entrants.append((source[(i + rotation) % source.size()] as Dictionary).duplicate(true))
	if mode == "enter":
		entrants[0] = {"id":"player", "name":"YOU", "strength":1.0,
			"opponent_row":"duel", "weapon_id":"pistol", "group":"human"}
	betting_card = ProtoBetting.open_card(String(row["venue"]), seed, entrants)
	var odds: Dictionary = {}
	for entrant in entrants:
		var id: String = String(entrant["id"])
		entrant["share"] = ProtoBetting.implied_share(betting_card, id)
		entrant["odds"] = ProtoBetting.decimal_odds(betting_card, id)
		odds[id] = entrant["odds"]
	var ids: Array[String] = []
	for entrant in entrants:
		ids.append(String(entrant["id"]))
	matches = [
		{"id":"semi_a", "round":"SEMIFINAL", "left":ids[0], "right":ids[3], "winner":""},
		{"id":"semi_b", "round":"SEMIFINAL", "left":ids[1], "right":ids[2], "winner":""},
		{"id":"final", "round":"FINAL", "left":"", "right":"", "winner":""},
	]


func select_mode(value: String) -> bool:
	if phase != "ready" or not ticket.is_empty() or value not in ["watch", "enter"]:
		return false
	mode = value
	selected_index = 0
	_build_field_and_bracket()
	status = "ENTER FIELD READY" if mode == "enter" else "WATCH FIELD READY"
	_emit_changed()
	return true


func cycle_entrant(step_in: int) -> void:
	if phase != "ready" or not ticket.is_empty():
		return
	selected_index = posmod(selected_index + step_in, entrants.size())
	_emit_changed()


func change_stake(step_in: int) -> void:
	if phase != "ready" or not ticket.is_empty():
		return
	stake = clampi(stake + step_in * int(row["stake_step"]),
		int(row["stake_min"]), int(row["stake_max"]))
	_emit_changed()


func place_bet() -> Dictionary:
	if phase != "ready":
		return _failure("BETTING IS CLOSED")
	if not ticket.is_empty():
		return _failure("ONE TICKET PER BRACKET")
	if stake < int(row["stake_min"]) or stake > int(row["stake_max"]) \
			or (stake - int(row["stake_min"])) % int(row["stake_step"]) != 0:
		return _failure("INVALID STAKE")
	if stake > bankroll:
		return _failure("NOT ENOUGH LAB CREDITS")
	var id: String = String(entrants[selected_index]["id"])
	ticket = ProtoBetting.place(betting_card, id, stake)
	bankroll -= stake
	status = "TICKET: %s · %d @ %.2f" % [id.to_upper(), stake, float(ticket["odds"])]
	_emit_changed()
	return {"ok":true, "error":"", "ticket":ticket.duplicate(true)}


func start_tournament() -> bool:
	if phase != "ready":
		return false
	phase = "running"
	match_index = 0
	status = "SEMIFINAL A LIVE"
	if lab != null:
		_start_current_match()
	_emit_changed()
	return true


func record_match_winner(winner_id: String) -> bool:
	if phase != "running" or match_index < 0 or match_index >= matches.size():
		return false
	var match_row: Dictionary = matches[match_index]
	if winner_id not in [String(match_row["left"]), String(match_row["right"])] \
			or String(match_row["winner"]) != "":
		return false
	match_row["winner"] = winner_id
	if match_index == 0:
		(matches[2] as Dictionary)["left"] = winner_id
		match_index = 1
		status = "SEMIFINAL B LIVE"
	elif match_index == 1:
		(matches[2] as Dictionary)["right"] = winner_id
		match_index = 2
		status = "FINAL LIVE"
	else:
		champion = winner_id
		phase = "settled"
		ProtoBetting.settle(betting_card, champion)
		payout = int(ticket.get("paid", 0)) if not ticket.is_empty() else 0
		bankroll += payout
		status = "CHAMPION %s · PAYOUT %d" % [champion.to_upper(), payout]
	_emit_changed()
	return true


func reset_tournament() -> void:
	if lab != null and lab.has_method("clear_spectacle_fighters"):
		lab.clear_spectacle_fighters()
	_reset_state()


func _start_current_match() -> void:
	if lab == null or phase != "running" or not lab.has_method("configure_spectacle_match"):
		return
	var current: Dictionary = current_match()
	if current.is_empty():
		return
	var left: Dictionary = entrant_by_id(String(current["left"]))
	var right: Dictionary = entrant_by_id(String(current["right"]))
	lab.lab_round.setup([String(current["left"]), String(current["right"])],
		float(row.get("round_health", 100.0)), int(row.get("rounds_to_win", 2)))
	lab.configure_spectacle_match(left, right, mode)


func _on_physical_match_ended(winner_id: String) -> void:
	if phase != "running" or not record_match_winner(winner_id):
		return
	if phase == "running":
		call_deferred("_start_current_match")
	elif lab != null and lab.has_method("clear_spectacle_fighters"):
		lab.call_deferred("clear_spectacle_fighters")


func current_match() -> Dictionary:
	return (matches[match_index] as Dictionary).duplicate(true) \
		if phase == "running" and match_index >= 0 and match_index < matches.size() else {}


func entrant_by_id(id: String) -> Dictionary:
	for entrant in entrants:
		if String(entrant["id"]) == id:
			return (entrant as Dictionary).duplicate(true)
	return {}


func facts() -> Dictionary:
	var odds: Dictionary = {}
	for entrant in entrants:
		odds[String(entrant["id"])] = float(entrant.get("odds", 0.0))
	return {"card_id":card_id, "name":String(row.get("name", "")),
		"venue":String(row.get("venue", "")), "nonlethal":bool(row.get("nonlethal", false)),
		"modes":(row.get("modes", []) as Array).duplicate(), "mode":mode, "phase":phase,
		"entrants":entrants.duplicate(true), "matches":matches.duplicate(true),
		"current_match":current_match(), "selected_entrant":String(entrants[selected_index]["id"])
			if not entrants.is_empty() else "", "odds":odds, "stake":stake,
		"bankroll":bankroll, "ticket":ticket.duplicate(true), "champion":champion,
		"payout":payout, "status":status, "seed":seed}


func readout() -> String:
	var f: Dictionary = facts()
	return "%s · %s\n%s · STAKE %d · BANK %d\n%s" % [String(f["name"]),
		String(f["venue"]), String(f["mode"]).to_upper(), int(f["stake"]),
		int(f["bankroll"]), String(f["status"])]


func _failure(message: String) -> Dictionary:
	status = message
	_emit_changed()
	return {"ok":false, "error":message}


func _emit_changed() -> void:
	changed.emit(facts())
