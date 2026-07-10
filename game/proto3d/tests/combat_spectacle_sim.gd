## L3 combat Spectacles: legal deterministic bracket, honest one-ticket book,
## real WATCH/ENTER bodies, nonlethal settlement, and standalone isolation.
## Run: Godot --headless --path game res://proto3d/tests/combat_spectacle_sim.tscn
extends Node

const RUNTIME_PATH := "res://proto3d/tools/physics_lab/lab_spectacle.gd"

var passed: int = 0
var failed: int = 0


func _check(label: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("SPECTACLE: %s - %s" % ["PASS" if ok else "FAIL", label])


func _ready() -> void:
	print("SPECTACLE: start")
	get_tree().create_timer(45.0).timeout.connect(func() -> void:
		print("SPECTACLE: WATCHDOG")
		get_tree().quit(1))
	if not ResourceLoader.exists(RUNTIME_PATH):
		_check("focused Spectacle runtime exists", false)
		_finish()
		return
	var runtime: Node = (load(RUNTIME_PATH) as Script).new()
	add_child(runtime)
	if not runtime.has_method("setup"):
		_check("runtime exposes the approved public contract", false)
		_finish()
		return
	_check("valid shootout row loads", runtime.setup(null, "wasteland_shootout", 8401))
	var opening: Dictionary = runtime.facts()
	var entrants: Array = opening.get("entrants", [])
	var ids: Array[String] = []
	for entrant in entrants:
		ids.append(String(entrant.get("id", "")))
	_check("card has four unique legal named entrants and WATCH/BET/ENTER",
		entrants.size() == 4 and ids.duplicate().all(func(id: String) -> bool:
			return id != "" and ids.count(id) == 1)
		and opening.get("modes", []).has("watch") and opening.get("modes", []).has("bet")
		and opening.get("modes", []).has("enter") and bool(opening.get("nonlethal", false)))
	_check("single-elimination opening is two semifinals plus an empty final",
		(opening.get("matches", []) as Array).size() == 3
		and String(opening["matches"][0]["round"]) == "SEMIFINAL"
		and String(opening["matches"][1]["round"]) == "SEMIFINAL"
		and String(opening["matches"][2]["round"]) == "FINAL"
		and String(opening["matches"][2]["left"]) == ""
		and String(opening["matches"][2]["right"]) == "")

	var twin: Node = (load(RUNTIME_PATH) as Script).new()
	add_child(twin)
	twin.setup(null, "wasteland_shootout", 8401)
	_check("same card seed reproduces entrants, strengths, bracket, and equipment",
		twin.facts()["entrants"] == opening["entrants"]
		and twin.facts()["matches"] == opening["matches"])

	var valid_row: Dictionary = runtime.row.duplicate(true)
	var lethal: Dictionary = valid_row.duplicate(true); lethal["nonlethal"] = false
	var dog: Dictionary = valid_row.duplicate(true); dog["entrants"][0]["group"] = "dog"
	var infected: Dictionary = valid_row.duplicate(true); infected["entrants"][1]["group"] = "infected"
	var duplicate_id: Dictionary = valid_row.duplicate(true)
	duplicate_id["entrants"][1]["id"] = duplicate_id["entrants"][0]["id"]
	var bad_weapon: Dictionary = valid_row.duplicate(true); bad_weapon["entrants"][2]["weapon_id"] = "missing"
	var short_field: Dictionary = valid_row.duplicate(true); short_field["entrants"].pop_back()
	_check("validator rejects lethal, dog, infected, duplicate, bad-weapon, and short cards",
		not bool(runtime.validate_row(lethal)["ok"])
		and not bool(runtime.validate_row(dog)["ok"])
		and not bool(runtime.validate_row(infected)["ok"])
		and not bool(runtime.validate_row(duplicate_id)["ok"])
		and not bool(runtime.validate_row(bad_weapon)["ok"])
		and not bool(runtime.validate_row(short_field)["ok"]))

	var share_sum: float = 0.0
	for entrant in entrants:
		share_sum += float(entrant.get("share", 0.0))
	_check("visible win shares are honest and sum to one", absf(share_sum - 1.0) < 0.001)
	var selected_id: String = String(opening["selected_entrant"])
	var selected_odds: float = float(opening["odds"][selected_id])
	for _i in 4:
		runtime.change_stake(1)
	var bet: Dictionary = runtime.place_bet()
	_check("one affordable pre-start ticket deducts exactly once",
		bool(bet.get("ok", false)) and int(runtime.facts()["stake"]) == 50
		and int(runtime.facts()["bankroll"]) == 950
		and String(runtime.facts()["ticket"].get("id", "")) == selected_id)
	var duplicate_bankroll: int = int(runtime.facts()["bankroll"])
	_check("duplicate ticket is rejected without bankroll mutation",
		not bool(runtime.place_bet().get("ok", true))
		and int(runtime.facts()["bankroll"]) == duplicate_bankroll)
	_check("tournament starts once and closes the betting window", runtime.start_tournament()
		and not bool(runtime.place_bet().get("ok", true)))

	var current: Dictionary = runtime.facts()["current_match"]
	_check("winner outside the current pair cannot advance",
		not runtime.record_match_winner("not_in_match")
		and runtime.facts()["current_match"] == current)
	_check("semifinal A winner advances", runtime.record_match_winner(selected_id))
	current = runtime.facts()["current_match"]
	var semi_b_winner: String = String(current["left"])
	_check("semifinal B winner advances and forms the final",
		runtime.record_match_winner(semi_b_winner)
		and String(runtime.facts()["current_match"]["round"]) == "FINAL"
		and String(runtime.facts()["current_match"]["left"]) == selected_id
		and String(runtime.facts()["current_match"]["right"]) == semi_b_winner)
	_check("final settles once with existing odds and vig",
		runtime.record_match_winner(selected_id)
		and String(runtime.facts()["champion"]) == selected_id
		and int(runtime.facts()["payout"]) == int(floor(50.0 * selected_odds * 0.9))
		and int(runtime.facts()["bankroll"]) == 950 + int(runtime.facts()["payout"]))
	var settled_bankroll: int = int(runtime.facts()["bankroll"])
	_check("settled final cannot pay twice", not runtime.record_match_winner(selected_id)
		and int(runtime.facts()["bankroll"]) == settled_bankroll)

	runtime.reset_tournament()
	_check("reset restores exact deterministic opening bankroll/bracket/ticket",
		int(runtime.facts()["bankroll"]) == 1000 and runtime.facts()["ticket"].is_empty()
		and runtime.facts()["matches"] == opening["matches"]
		and String(runtime.facts()["champion"]) == "")
	runtime.select_mode("enter")
	_check("ENTER visibly replaces seed zero with the player before start",
		String(runtime.facts()["entrants"][0]["id"]) == "player"
		and runtime.facts()["matches"].any(func(match: Dictionary) -> bool:
			return String(match["left"]) == "player" or String(match["right"]) == "player"))
	_finish()


func _finish() -> void:
	print("SPECTACLE RESULTS: %d passed, %d failed" % [passed, failed])
	print("SPECTACLE: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
