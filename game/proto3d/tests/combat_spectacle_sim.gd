## L3 combat Spectacles: legal deterministic bracket, honest one-ticket book,
## real WATCH/ENTER bodies, nonlethal settlement, and standalone isolation.
## Run: Godot --headless --path game res://proto3d/tests/combat_spectacle_sim.tscn
extends Node

const RUNTIME_PATH := "res://proto3d/tools/physics_lab/lab_spectacle.gd"
const SAVE_PATH := "user://drivn.save"

var passed: int = 0
var failed: int = 0
var prior_scale: float = 1.0
var max_spectacle_ai: int = 0


class RejectingLab:
	extends Node3D
	var lab_round: RefCounted = preload(
		"res://proto3d/tools/physics_lab/lab_round.gd").new()

	func _init() -> void:
		lab_round.setup(["player", "opponent"], 100.0, 2)
		lab_round.hit("player", 9.0, {"attacker":"opponent", "kind":"fixture"})

	func configure_spectacle_match(_left: Dictionary, _right: Dictionary,
			_mode: String) -> bool:
		return false

	func clear_spectacle_fighters() -> void:
		pass


func _check(label: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("SPECTACLE: %s - %s" % ["PASS" if ok else "FAIL", label])


func _ready() -> void:
	print("SPECTACLE: start")
	prior_scale = Engine.time_scale
	var save_existed: bool = FileAccess.file_exists(SAVE_PATH)
	var save_stamp: int = FileAccess.get_modified_time(SAVE_PATH) if save_existed else -1
	get_tree().create_timer(45.0, true, false, true).timeout.connect(func() -> void:
		Engine.time_scale = prior_scale
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
	var bypassed_law: Dictionary = valid_row.duplicate(true)
	bypassed_law["prohibited_groups"] = []
	bypassed_law["entrants"][0]["group"] = "dog"
	var bad_spawns: Dictionary = valid_row.duplicate(true); bad_spawns["spawns"]["left"] = [1, 2]
	var bad_round: Dictionary = valid_row.duplicate(true); bad_round["round_health"] = 0
	var wrong_wins: Dictionary = valid_row.duplicate(true); wrong_wins["rounds_to_win"] = 3
	var wrong_stakes: Dictionary = valid_row.duplicate(true); wrong_stakes["stake_max"] = 25
	var uppercase_dog: Dictionary = valid_row.duplicate(true)
	uppercase_dog["entrants"][0]["group"] = "DOG"
	_check("validator rejects lethal, dog, infected, duplicate, bad-weapon, and short cards",
		not bool(runtime.validate_row(lethal)["ok"])
		and not bool(runtime.validate_row(dog)["ok"])
		and not bool(runtime.validate_row(infected)["ok"])
		and not bool(runtime.validate_row(duplicate_id)["ok"])
		and not bool(runtime.validate_row(bad_weapon)["ok"])
		and not bool(runtime.validate_row(short_field)["ok"]))
	_check("entrant law and physical schema cannot be bypassed by malformed rows",
		not bool(runtime.validate_row(bypassed_law)["ok"])
		and not bool(runtime.validate_row(bad_spawns)["ok"])
		and not bool(runtime.validate_row(bad_round)["ok"])
		and not bool(runtime.validate_row(wrong_wins)["ok"])
		and not bool(runtime.validate_row(wrong_stakes)["ok"])
		and not bool(runtime.validate_row(uppercase_dog)["ok"]))

	var rejecting_lab := RejectingLab.new()
	add_child(rejecting_lab)
	var rejecting_runtime: Node = (load(RUNTIME_PATH) as Script).new()
	rejecting_lab.add_child(rejecting_runtime)
	var rejecting_ready: bool = rejecting_runtime.setup(
		rejecting_lab, "wasteland_shootout", 8401)
	_check("failed physical staging rolls the tournament back to a visible ready state",
		rejecting_ready and not rejecting_runtime.start_tournament()
		and String(rejecting_runtime.facts()["phase"]) == "ready"
		and String(rejecting_runtime.facts()["status"]).contains("STAGING")
		and rejecting_lab.lab_round.fighter_order == ["player", "opponent"]
		and is_equal_approx(rejecting_lab.lab_round.health("player"), 91.0))
	rejecting_lab.queue_free()

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

	Engine.time_scale = 0.83
	var lab: Node3D = (load("res://proto3d/tools/physics_combat_lab.tscn") as PackedScene).instantiate()
	add_child(lab)
	for _i in 8:
		await get_tree().physics_frame
	var original_player_id: int = lab.player.get_instance_id()
	var original_adapter_id: int = lab.adapter.get_instance_id()
	var original_transform: Transform3D = lab.adapter.anchor_transform()
	var original_mode: String = lab.active_mode
	var original_surface: String = String(lab.adapter.surface.get("id", ""))
	var original_condition: String = String(lab.adapter.condition.get("id", ""))
	var live: Node = (load(RUNTIME_PATH) as Script).new()
	lab.add_child(live)
	_check("physical runtime binds to the standalone lab", live.setup(lab, "wasteland_shootout", 8401)
		and live.select_mode("watch") and live.start_tournament())
	for _i in 4:
		await get_tree().physics_frame
	var fighters: Array = lab.get("spectacle_fighters") if "spectacle_fighters" in lab else []
	max_spectacle_ai = maxi(max_spectacle_ai, fighters.size())
	var live_match: Dictionary = live.facts()["current_match"]
	var watch_ready: bool = fighters.size() == 2
	if watch_ready:
		var left: Node = fighters[0]
		var right: Node = fighters[1]
		watch_ready = left.has_method("configure_identity") and right.has_method("configure_identity") \
			and left.body.collision_layer != 0 and right.body.collision_layer != 0 \
			and String(left.get("fighter_id")) == String(live_match["left"]) \
			and String(right.get("fighter_id")) == String(live_match["right"]) \
			and left.target == right.body and right.target == left.body \
			and String(left.weapon.id) == String(live.entrant_by_id(String(live_match["left"]))["weapon_id"]) \
			and String(right.weapon.id) == String(live.entrant_by_id(String(live_match["right"]))["weapon_id"]) \
			and left._has_line_of_sight() and right._has_line_of_sight() \
			and not left.find_children("SpectacleName", "Label3D", true, false).is_empty() \
			and not right.find_children("SpectacleName", "Label3D", true, false).is_empty()
	_check("WATCH stages two real reciprocal collision-active AI fighters with authored weapons", watch_ready)
	if watch_ready:
		var left: Node = fighters[0]
		var right: Node = fighters[1]
		var left_id: String = String(left.get("fighter_id"))
		var right_id: String = String(right.get("fighter_id"))
		var left_health: float = lab.lab_round.health(left_id)
		left.take_damage(9.0, right.body)
		_check("real damage signal scores the arbitrary WATCH fighter ids",
			is_equal_approx(lab.lab_round.health(left_id), left_health - 9.0)
			and is_equal_approx(lab.lab_round.health(right_id), 100.0))
		lab.lab_round.hit(right_id, 200.0, {"attacker":left_id, "kind":"watch_probe"})
		lab.lab_round.reset_round()
		lab.lab_round.hit(right_id, 200.0, {"attacker":left_id, "kind":"watch_probe"})
		for _i in 3:
			await get_tree().process_frame
		var restaged: Array = lab.get("spectacle_fighters")
		max_spectacle_ai = maxi(max_spectacle_ai, restaged.size())
		var tag_count_ok: bool = restaged.size() == 2
		if tag_count_ok:
			tag_count_ok = restaged[0].find_children(
				"SpectacleName", "Label3D", true, false).size() == 1 \
				and restaged[1].find_children(
					"SpectacleName", "Label3D", true, false).size() == 1
		_check("physical match completion advances and restages semifinal B",
			String(live.facts()["current_match"].get("id", "")) == "semi_b"
			and restaged.size() == 2 and tag_count_ok)
	live.reset_tournament()
	_check("physical reset clears WATCH bodies and allows ENTER selection",
		(lab.get("spectacle_fighters") as Array).is_empty() and live.select_mode("enter"))
	_check("ENTER tournament starts", live.start_tournament())
	for _i in 4:
		await get_tree().physics_frame
	var enter_fighters: Array = lab.get("spectacle_fighters")
	max_spectacle_ai = maxi(max_spectacle_ai, enter_fighters.size())
	var enter_match: Dictionary = live.facts()["current_match"]
	var rival_id: String = String(enter_match["right"]) if String(enter_match["left"]) == "player" \
		else String(enter_match["left"])
	var enter_ready: bool = enter_fighters.size() == 1
	if enter_ready:
		var rival: Node = enter_fighters[0]
		enter_ready = rival.has_method("configure_identity") \
			and String(rival.get("fighter_id")) == rival_id \
			and String(rival.get("opponent_id")) == "player" \
			and rival.target == lab.player and rival.body.collision_layer != 0
	_check("ENTER keeps the current player body and stages exactly one authored rival",
		enter_ready and lab.player.get_instance_id() == original_player_id
		and lab.adapter.get_instance_id() == original_adapter_id
		and lab.active_mode == original_mode
		and String(lab.adapter.surface.get("id", "")) == original_surface
		and String(lab.adapter.condition.get("id", "")) == original_condition)
	if enter_ready:
		var rival: Node = enter_fighters[0]
		var player_health: float = lab.lab_round.health("player")
		var rival_health: float = lab.lab_round.health(rival_id)
		lab._on_player_damaged(8.0)
		rival.take_damage(9.0, lab.player)
		_check("ENTER routes both real damage signals to the correct nonlethal fighters",
			is_equal_approx(lab.lab_round.health("player"), player_health - 8.0)
			and is_equal_approx(lab.lab_round.health(rival_id), rival_health - 9.0))
		lab.lab_round.hit(rival_id, 200.0, {"attacker":"player", "kind":"enter_probe"})
		lab.lab_round.reset_round()
		lab.lab_round.hit(rival_id, 200.0, {"attacker":"player", "kind":"enter_probe"})
		for _i in 3:
			await get_tree().process_frame
		_check("player can advance in the same bracket without death/corpse state",
			String((live.facts()["matches"] as Array)[0]["winner"]) == "player"
			and get_tree().get_nodes_in_group("corpse").is_empty()
			and not lab.character.dead)
	live.reset_tournament()
	_check("tournament reset frees temporary AI and restores the exact opening player transform",
		(lab.get("spectacle_fighters") as Array).is_empty()
		and lab.adapter.anchor_transform().origin.distance_to(original_transform.origin) < 0.01
		and lab.lab_round.fighter_order == ["player", "opponent"])

	var scenario_card: Dictionary = lab.start_scenario("cover_two", 4402)
	var scenario_actor_count: int = lab.scenario_opponents.size()
	var scenario_behavior: String = String(lab.opponent_behavior)
	var scenario_start_blocked: bool = not scenario_card.is_empty() \
		and lab.spectacle.select_mode("watch") and not lab.spectacle.start_tournament()
	_check("Spectacles refuse staging without stealing an active scenario's actors",
		scenario_start_blocked and String(lab.current_scenario) == "cover_two"
		and scenario_actor_count >= 1 and lab.scenario_opponents.size() == scenario_actor_count
		and String(lab.opponent_behavior) == scenario_behavior
		and lab.scenario_opponents.all(func(actor: Node) -> bool: return is_instance_valid(actor))
		and (lab.get("spectacle_fighters") as Array).is_empty())
	lab.start_scenario("free_play", 4402)

	var integrated_ui: bool = "spectacle" in lab and lab.get("spectacle") != null \
		and "spectacle_panel" in lab and lab.get("spectacle_panel") != null
	_check("standalone lab boots with the Spectacle runtime and panel", integrated_ui)
	if integrated_ui:
		var ui_runtime: Node = lab.get("spectacle")
		var ui_panel: CanvasLayer = lab.get("spectacle_panel")
		lab.set_surface("mud")
		lab.set_condition_preset("hurt")
		var prior_time_scale: float = Engine.time_scale
		var toggle := InputEventKey.new()
		toggle.keycode = KEY_J
		toggle.pressed = true
		lab._unhandled_input(toggle)
		_check("J opens a full WATCH · BET · ENTER tournament panel",
			ui_panel.is_open() and String(ui_panel.panel_facts()["text"]).contains("WATCH")
			and String(ui_panel.panel_facts()["text"]).contains("BET")
			and String(ui_panel.panel_facts()["text"]).contains("ENTER")
			and String(ui_panel.panel_facts()["text"]).contains("BANKROLL")
			and String(ui_panel.panel_facts()["text"]).contains("SEMIFINAL")
			and int(ui_panel.panel_facts()["button_count"]) >= 9
			and is_equal_approx(Engine.time_scale, prior_time_scale))
		var held_position: Vector3 = lab.player.global_position
		var held_mag: int = lab.adapter.weapon.mag
		lab.feed_for_test({"keyboard":{"move":Vector2(0, 1), "fire":true,
			"aim_world":Vector3.FORWARD}})
		await get_tree().physics_frame
		_check("open panel suppresses movement/fire without changing time scale",
			lab.player.global_position.distance_to(held_position) < 0.01
			and lab.adapter.weapon.mag == held_mag
			and is_equal_approx(Engine.time_scale, prior_time_scale))
		var panel_scenario: String = String(lab.current_scenario)
		var panel_mode: String = String(lab.active_mode)
		var panel_surface: String = String(lab.adapter.surface.get("id", ""))
		var panel_condition: String = String(lab.adapter.condition.get("id", ""))
		for key in [KEY_N, KEY_F2, KEY_U, KEY_I]:
			var conflict := InputEventKey.new()
			conflict.keycode = key
			conflict.pressed = true
			lab._unhandled_input(conflict)
		_check("open Spectacles panel consumes unrelated lab shortcuts",
			String(lab.current_scenario) == panel_scenario and String(lab.active_mode) == panel_mode
			and String(lab.adapter.surface.get("id", "")) == panel_surface
			and String(lab.adapter.condition.get("id", "")) == panel_condition)
		for key in [KEY_2, KEY_RIGHT, KEY_UP, KEY_B]:
			var event := InputEventKey.new()
			event.keycode = key
			event.pressed = true
			lab._unhandled_input(event)
		_check("panel keyboard parity selects ENTER, entrant/stake, and places the ticket",
			String(ui_runtime.facts()["mode"]) == "enter"
			and int(ui_runtime.facts()["stake"]) == 20
			and not ui_runtime.facts()["ticket"].is_empty())
		var start := InputEventKey.new()
		start.keycode = KEY_ENTER
		start.pressed = true
		lab._unhandled_input(start)
		await get_tree().process_frame
		_check("START closes the large panel and leaves a compact live bracket strip",
			String(ui_runtime.facts()["phase"]) == "running" and not ui_panel.is_open()
			and bool(ui_panel.panel_facts()["compact_visible"]))
		for fighter in (lab.get("spectacle_fighters") as Array):
			fighter.set_behavior("passive")
		var refresh_before: int = int(ui_panel.panel_facts()["refresh_count"])
		for _i in 8:
			await get_tree().physics_frame
		_check("panel refresh is event-driven rather than rebuilt every physics frame",
			int(ui_panel.panel_facts()["refresh_count"]) == refresh_before)
		var ui_match: Dictionary = ui_runtime.facts()["current_match"]
		var ui_rival: String = String(ui_match["right"]) \
			if String(ui_match["left"]) == "player" else String(ui_match["left"])
		var player_name: String = String(ui_runtime.entrant_by_id("player")["name"]).to_upper()
		var player_health_before: float = float(
			ui_runtime.facts()["round"]["fighters"]["player"]["health"])
		lab._on_player_damaged(7.0)
		await get_tree().process_frame
		var damage_readout: String = String(ui_panel.panel_facts()["text"])
		var player_health_after: float = maxf(0.0, player_health_before - 7.0)
		_check("live board names both fighters and shows event-driven health plus broadcast copy",
			damage_readout.contains("%s HP %.0f/100" % [player_name, player_health_after])
			and damage_readout.contains(String(ui_runtime.entrant_by_id(ui_rival)["name"]).to_upper())
			and damage_readout.contains(String(ui_runtime.row["broadcast"]["semifinal"])))
		var hud_round: String = lab._round_readout()
		_check("always-visible HUD uses the active Spectacle fighter ids instead of legacy P/O score",
			hud_round.contains(player_name)
			and hud_round.contains(String(ui_runtime.entrant_by_id(ui_rival)["name"]).to_upper())
			and hud_round.contains("HP") and not hud_round.contains("P0-0O"))
		lab.lab_round.hit(ui_rival, 200.0,
			{"attacker":"player", "kind":"broadcast_probe"})
		await get_tree().process_frame
		var round_readout: String = String(ui_panel.panel_facts()["text"])
		_check("live board exposes round score and the real nonlethal round card",
			round_readout.contains("%s HP %.0f/100 R 1/2" % [player_name, player_health_after])
			and round_readout.contains("BROADCAST_PROBE"))
		var bout_matches: Array = ui_runtime.facts()["matches"]
		var bout_ticket: Dictionary = ui_runtime.facts()["ticket"]
		var bout_mode: String = String(lab.active_mode)
		var bout_surface: String = String(lab.adapter.surface.get("id", ""))
		var bout_condition: String = String(lab.adapter.condition.get("id", ""))
		var bout_reset := InputEventKey.new()
		bout_reset.keycode = KEY_BACKSPACE
		bout_reset.pressed = true
		lab._unhandled_input(bout_reset)
		await get_tree().process_frame
		var reset_round: Dictionary = ui_runtime.facts()["round"]
		var reset_fighters: Dictionary = reset_round.get("fighters", {})
		var reset_clean: bool = not reset_fighters.is_empty()
		for fighter in reset_fighters.values():
			reset_clean = reset_clean and is_equal_approx(float(fighter["health"]),
				float(reset_round["max_health"])) and int(fighter["rounds"]) == 0
		_check("Backspace resets only the physical bout and preserves the ENTER experiment",
			reset_clean and String(ui_runtime.facts()["phase"]) == "running"
			and ui_runtime.facts()["matches"] == bout_matches
			and ui_runtime.facts()["ticket"] == bout_ticket
			and String(lab.active_mode) == bout_mode
			and String(lab.adapter.surface.get("id", "")) == bout_surface
			and String(lab.adapter.condition.get("id", "")) == bout_condition)
		var first_complete: bool = _settle_tournament(ui_runtime, lab, true)
		var settled_champion: String = String(ui_runtime.facts()["champion"])
		await get_tree().process_frame
		await get_tree().process_frame
		_check("physical final settlement restores ordinary sparring while preserving champion/card copy",
			first_complete and lab.lab_round.fighter_order == ["player", "opponent"]
			and (lab.get("spectacle_fighters") as Array).is_empty()
			and String(ui_runtime.facts()["champion"]) == settled_champion
			and not (ui_runtime.facts()["round"]["last_card"] as Dictionary).is_empty()
			and String(ui_panel.panel_facts()["text"]).contains("THE BOARD REMEMBERS THE CHAMPION"))
		ui_runtime.reset_tournament()
		var second_started: bool = ui_runtime.select_mode("watch") and ui_runtime.start_tournament()
		var locked_scenario: String = String(lab.current_scenario)
		var locked_mode: String = String(lab.active_mode)
		var locked_surface: String = String(lab.adapter.surface.get("id", ""))
		var locked_condition: String = String(lab.adapter.condition.get("id", ""))
		for key in [KEY_N, KEY_F2, KEY_U, KEY_I]:
			var conflict := InputEventKey.new()
			conflict.keycode = key
			conflict.pressed = true
			lab._unhandled_input(conflict)
		await get_tree().process_frame
		var locked_fighters: Array = lab.get("spectacle_fighters")
		_check("running WATCH consumes conflicting scenario/body/surface/condition shortcuts",
			second_started and String(lab.current_scenario) == locked_scenario
			and String(lab.active_mode) == locked_mode
			and String(lab.adapter.surface.get("id", "")) == locked_surface
			and String(lab.adapter.condition.get("id", "")) == locked_condition
			and locked_fighters.size() == 2
			and locked_fighters.all(func(fighter: Node) -> bool: return is_instance_valid(fighter)))
		var second_complete: bool = second_started and _settle_tournament(ui_runtime, lab, false)
		ui_runtime.reset_tournament()
		await get_tree().process_frame
		_check("two complete tournaments reset with at most two temporary AI and no death state",
			first_complete and second_complete and max_spectacle_ai <= 2
			and (lab.get("spectacle_fighters") as Array).is_empty()
			and get_tree().get_nodes_in_group("corpse").is_empty() and not lab.character.dead)
		var idle_nodes_before: int = int(Performance.get_monitor(Performance.OBJECT_NODE_COUNT))
		for _i in 120:
			ui_runtime.facts()
			ui_runtime.readout()
		var idle_nodes_after: int = int(Performance.get_monitor(Performance.OBJECT_NODE_COUNT))
		_check("idle odds and bracket reads allocate no scene nodes",
			idle_nodes_after == idle_nodes_before)
	var save_untouched: bool = FileAccess.file_exists(SAVE_PATH) == save_existed
	if save_untouched and save_existed:
		save_untouched = FileAccess.get_modified_time(SAVE_PATH) == save_stamp
	_check("Spectacles never mutate the campaign save", save_untouched)
	lab.queue_free()
	await get_tree().process_frame
	_check("Spectacles restore the exact pre-lab time scale on exit",
		is_equal_approx(Engine.time_scale, 0.83))
	Engine.time_scale = prior_scale
	_finish()


func _settle_tournament(runtime: Node, lab: Node3D, choose_left: bool) -> bool:
	var guard: int = 0
	while String(runtime.facts()["phase"]) == "running" and guard < 2:
		var current: Dictionary = runtime.facts()["current_match"]
		var winner: String = String(current["left"] if choose_left else current["right"])
		if winner == "" or not runtime.record_match_winner(winner):
			return false
		if String(runtime.facts()["phase"]) == "running" \
				and not runtime._start_current_match():
			return false
		max_spectacle_ai = maxi(max_spectacle_ai,
			(lab.get("spectacle_fighters") as Array).size())
		guard += 1
	if guard != 2 or String(runtime.facts()["phase"]) != "running":
		return false
	var final: Dictionary = runtime.facts()["current_match"]
	var loser: String = String(final["right"] if choose_left else final["left"])
	lab.lab_round.hit(loser, 999.0,
		{"attacker":String(final["left"] if choose_left else final["right"]), "kind":"final_probe"})
	lab.lab_round.reset_round()
	lab.lab_round.hit(loser, 999.0,
		{"attacker":String(final["left"] if choose_left else final["right"]), "kind":"final_probe"})
	return String(runtime.facts()["phase"]) == "settled"


func _finish() -> void:
	Engine.time_scale = prior_scale
	print("SPECTACLE RESULTS: %d passed, %d failed" % [passed, failed])
	print("SPECTACLE: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
