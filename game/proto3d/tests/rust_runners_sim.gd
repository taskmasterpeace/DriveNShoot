## RUST RUNNERS fidelity proof, slice one: Soldat-like side-view locomotion,
## stance vocabulary, independent aim, complete carried combat, and respawn.
extends Node

const SCENE := "res://proto3d/games/rust_runners/rust_runners.tscn"
const MAPS := "res://data/rust_runners_maps.json"

class FakeArcade extends Node:
	signal input_received(peer_id: int, tick: int, snapshot: Dictionary)
	signal event_received(peer_id: int, event: Dictionary)
	signal snapshot_received(peer_id: int, state: Dictionary)
	signal result_received(peer_id: int, result: Dictionary)
	var sent_snapshots: Array = []
	var sent_results: Array = []
	func is_host_authority() -> bool: return true
	func send_input(_tick: int, _snapshot: Dictionary) -> bool: return true
	func send_event(_event: Dictionary) -> bool: return true
	func send_snapshot(event_id: String, state: Dictionary) -> bool:
		sent_snapshots.append({"event_id": event_id, "state": state.duplicate(true)})
		return true
	func send_result(result: Dictionary) -> bool:
		sent_results.append(result.duplicate(true))
		return true

var passed := 0
var failed := 0


func _check(label: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("RUST_RUNNERS: %s - %s" % ["PASS" if ok else "FAIL", label])


func _ready() -> void:
	print("RUST_RUNNERS: start")
	get_tree().create_timer(60.0).timeout.connect(func() -> void: get_tree().quit(1))
	var exists := ResourceLoader.exists(SCENE) and FileAccess.file_exists(MAPS)
	_check("cartridge scene and original arena rows exist", exists)
	if not exists:
		_finish()
		return
	var map_catalog: Dictionary = JSON.parse_string(FileAccess.get_file_as_string(MAPS))
	var maps: Array = map_catalog.get("maps", [])
	var original_rows := maps.size() >= 3 and maps.all(func(row: Dictionary) -> bool:
		return not (row.get("platforms", []) as Array).is_empty() \
		and (row.get("spawns", []) as Array).size() >= 4 \
		and not (row.get("pickups", []) as Array).is_empty() \
		and not String(row.get("id", "")).contains("soldat"))
	_check("refinery bridge and graveyard arenas are complete original data rows", original_rows)

	var game: Control = (load(SCENE) as PackedScene).instantiate()
	add_child(game)
	var row: Dictionary = ProtoGameRegistry.load_catalog().get_game("rust_runners")
	game.configure(row, {"source": "focused", "mode": "deathmatch",
		"map_id": "refinery_run", "gore": true, "actor_count": 2,
		"session_id": "rust-determinism", "bots_enabled": false})
	var seats := [{"seat": 0, "device": -1, "profile_id": "rider"}]
	game.start_match(44117, seats)
	_check("match spawns one rider and one deterministic opponent", game.actors.size() == 2
		and not bool(game.actor_state(0).get("ai", true))
		and bool(game.actor_state(1).get("ai", false)))
	var twin: Control = (load(SCENE) as PackedScene).instantiate()
	add_child(twin)
	twin.configure(row, {"source": "focused", "mode": "deathmatch",
		"map_id": "refinery_run", "gore": true, "actor_count": 2,
		"session_id": "rust-determinism", "bots_enabled": false})
	twin.start_match(44117, seats)
	_check("seed and arena produce exact deterministic spawn state",
		JSON.stringify(game.snapshot()) == JSON.stringify(twin.snapshot()))

	game.place_actor_for_test(0, Vector2(260, 600), Vector2.ZERO, true)
	game.apply_inputs(1, [_snap(Vector2.RIGHT)])
	_check("ground movement accelerates instead of teleporting", float(game.actor_state(0)["velocity"].x) > 0.0
		and float(game.actor_state(0)["velocity"].x) < game.RUN_SPEED
		and float(game.actor_state(0)["pos"].x) > 260.0)
	game.place_actor_for_test(0, Vector2(260, 350), Vector2(210, 0), false)
	game.apply_inputs(2, [_snap(Vector2.LEFT)])
	_check("air control bends but preserves momentum", float(game.actor_state(0)["velocity"].x) > 0.0
		and not bool(game.actor_state(0)["on_ground"]))

	game.place_actor_for_test(0, Vector2(300, 600), Vector2.ZERO, true)
	game.apply_inputs(3, [_snap(Vector2.ZERO, Vector2.RIGHT, {"mobility": true}, {"mobility": true})])
	var jump_velocity := float(game.actor_state(0)["velocity"].y)
	var fuel_before := float(game.actor_state(0)["jet_fuel"])
	game.apply_inputs(4, [_snap(Vector2.ZERO, Vector2.RIGHT, {"mobility": true})])
	_check("mobility jumps then burns finite jet fuel in the air", jump_velocity < 0.0
		and float(game.actor_state(0)["jet_fuel"]) < fuel_before
		and float(game.actor_state(0)["velocity"].y) < jump_velocity + game.GRAVITY * game.STEP * 1.1)
	var depleted := float(game.actor_state(0)["jet_fuel"])
	game.place_actor_for_test(0, Vector2(300, 600), Vector2.ZERO, true)
	game.apply_inputs(5, [_snap(Vector2.ZERO)])
	_check("ground contact recharges the jet pack", float(game.actor_state(0)["jet_fuel"]) > depleted)

	game.apply_inputs(6, [_snap(Vector2.ZERO, Vector2.RIGHT, {"stance": true}, {"stance": true})])
	_check("stance enters crouch with a shorter collision hull",
		String(game.actor_state(0)["stance"]) == "crouch"
		and float(game.actor_state(0)["hull_height"]) < game.STAND_HEIGHT)
	game.apply_inputs(7, [_snap(Vector2.DOWN, Vector2.RIGHT, {"stance": true}, {"stance": true})])
	_check("down plus stance enters prone", String(game.actor_state(0)["stance"]) == "prone"
		and float(game.actor_state(0)["hull_height"]) == game.PRONE_HEIGHT)
	game.place_actor_for_test(0, Vector2(300, 600), Vector2.ZERO, true)
	game.apply_inputs(8, [_snap(Vector2.RIGHT, Vector2.RIGHT,
		{"stance": true}, {"stance": true})])
	_check("moving stance press starts a momentum roll", String(game.actor_state(0)["stance"]) == "roll"
		and int(game.actor_state(0)["roll_ticks"]) > 0
		and float(game.actor_state(0)["velocity"].x) > game.RUN_SPEED)
	game.place_actor_for_test(0, Vector2(300, 600), Vector2.ZERO, true)
	game.actor_state(0)["facing"] = 1
	game.apply_inputs(9, [_snap(Vector2.LEFT, Vector2.RIGHT,
		{"stance": true}, {"mobility": true})])
	_check("stance plus opposite mobility performs a backflip",
		String(game.actor_state(0)["stance"]) == "backflip"
		and float(game.actor_state(0)["velocity"].x) < 0.0
		and float(game.actor_state(0)["velocity"].y) < 0.0)

	game.place_actor_for_test(0, Vector2(420, 300), Vector2(0, 700), false)
	var hp_before_fall := float(game.actor_state(0)["hp"])
	game.apply_inputs(10, [_snap(Vector2.ZERO)])
	game.step_without_input(25)
	_check("platform landing resolves and excessive impact causes fall damage",
		bool(game.actor_state(0)["on_ground"])
		and float(game.actor_state(0)["hp"]) < hp_before_fall)

	game.place_actor_for_test(0, Vector2(210, 600), Vector2.ZERO, true)
	game.place_actor_for_test(1, Vector2(420, 600), Vector2.ZERO, true)
	game.apply_inputs(40, [_snap(Vector2.ZERO, Vector2(0.35, -0.94), {}, {"primary": true})])
	_check("aim is independent full-angle and primary fires the active slot",
		Vector2(game.actor_state(0)["aim"]).is_equal_approx(Vector2(0.35, -0.94).normalized())
		and game.combat.event_count("fire") >= 1
		and int(game.weapon_state(0, "rr_scrap_rifle")["ammo"]) == 29)
	var first_slot := String(game.actor_state(0)["active_weapon"])
	game.apply_inputs(41, [_snap(Vector2.ZERO, Vector2.RIGHT, {}, {"weapon_next": true})])
	_check("weapon cycling changes between primary and secondary carried slots",
		String(game.actor_state(0)["active_weapon"]) != first_slot)
	var active_weapon := String(game.actor_state(0)["active_weapon"])
	game.weapon_state(0, active_weapon)["ammo"] = 0
	game.apply_inputs(42, [_snap(Vector2.ZERO, Vector2.RIGHT, {}, {"reload": true})])
	_check("reload starts the selected magazine timer", int(game.weapon_state(0, active_weapon)["reload"]) > 0)
	var grenades_before := int(game.weapon_state(0, "rr_frag")["ammo"])
	game.apply_inputs(43, [_snap(Vector2.ZERO, Vector2.RIGHT, {}, {"secondary": true})])
	_check("alternate fire throws a physical grenade", int(game.weapon_state(0, "rr_frag")["ammo"]) == grenades_before - 1
		and game.combat.projectiles.any(func(projectile: Dictionary) -> bool:
			return String(projectile.get("weapon_id", "")) == "rr_frag"))
	game.combat.step_many(40)
	game.actor_state(0)["active_slot"] = 0
	game.actor_state(0)["active_weapon"] = "rr_scrap_rifle"
	game.actor_state(1)["alive"] = true
	game.actor_state(1)["hp"] = 100.0
	game.actor_state(1)["armor"] = 0.0
	game.actor_state(1)["respawn_ticks"] = 0
	game.place_actor_for_test(0, Vector2(210, 600), Vector2.ZERO, true)
	game.place_actor_for_test(1, Vector2(420, 600), Vector2.ZERO, true)
	var target_hp := float(game.actor_state(1)["hp"])
	game.apply_inputs(44, [_snap(Vector2.ZERO, Vector2.RIGHT, {}, {"primary": true})])
	_check("cartridge combat applies seeded shot damage recoil and knockback",
		float(game.actor_state(1)["hp"]) < target_hp
		and Vector2(game.actor_state(0).get("last_recoil", Vector2.ZERO)).x < 0.0
		and Vector2(game.actor_state(1).get("last_knockback", Vector2.ZERO)).x > 0.0)

	var slots_before := (game.actor_state(0)["weapon_slots"] as Array).size()
	var dropped := bool(game.drop_active_weapon(0))
	_check("active weapons can be dropped into a world pickup", dropped
		and (game.actor_state(0)["weapon_slots"] as Array).size() == slots_before - 1
		and game.pickups.any(func(pickup: Dictionary) -> bool:
			return String(pickup.get("kind", "")) == "weapon"))
	var dropped_index: int = game.pickups.size() - 1
	game.pickups[dropped_index]["pos"] = game.actor_state(0)["pos"]
	game.collect_pickups_for_test(0)
	_check("a dropped weapon can be picked back up", (game.actor_state(0)["weapon_slots"] as Array).size() == slots_before)

	game.actor_state(0)["hp"] = 35.0
	game.actor_state(0)["armor"] = 0.0
	game.add_pickup_for_test("health", game.actor_state(0)["pos"], 45)
	game.add_pickup_for_test("vest", game.actor_state(0)["pos"], 35)
	game.add_pickup_for_test("grenade", game.actor_state(0)["pos"], 2)
	var frag_before_pickup := int(game.weapon_state(0, "rr_frag")["reserve"])
	game.collect_pickups_for_test(0)
	_check("health vest and grenade pickups restore their declared resources",
		float(game.actor_state(0)["hp"]) > 35.0 and float(game.actor_state(0)["armor"]) >= 35.0
		and int(game.weapon_state(0, "rr_frag")["reserve"]) == frag_before_pickup + 2)

	game.actor_state(0)["spawn_protection"] = 12
	var protected_hp := float(game.actor_state(0)["hp"])
	_check("spawn protection rejects incoming damage",
		not bool(game.damage_actor_for_test(0, 999.0, 1))
		and float(game.actor_state(0)["hp"]) == protected_hp)
	game.actor_state(0)["spawn_protection"] = 0
	game.set_gore_enabled(true)
	_check("lethal damage creates original primitive death pieces",
		bool(game.damage_actor_for_test(0, 999.0, 1))
		and not bool(game.actor_state(0)["alive"]) and game.death_parts.size() >= 4)
	game.step_without_input(game.RESPAWN_TICKS)
	_check("death timer respawns with protection and full health", bool(game.actor_state(0)["alive"])
		and float(game.actor_state(0)["hp"]) == float(game.actor_state(0)["max_hp"])
		and int(game.actor_state(0)["spawn_protection"]) > 0)
	game.set_gore_enabled(false)
	game.death_parts.clear()
	game.actor_state(0)["spawn_protection"] = 0
	game.damage_actor_for_test(0, 999.0, 1)
	_check("gore toggle preserves death rules without spawning pieces", game.death_parts.is_empty())

	game.step_without_input(game.RESPAWN_TICKS)
	var saved: Dictionary = game.snapshot()
	game.apply_inputs(200, [_snap(Vector2.RIGHT, Vector2.UP, {"mobility": true})])
	game.restore_snapshot(saved)
	_check("full locomotion combat and pickup snapshot restores exactly",
		JSON.stringify(game.snapshot()) == JSON.stringify(saved))
	var forced := bool(game.debug_force_finish())
	_check("focused cartridge emits one normalized flagship result", forced
		and String(game.last_result.get("game_id", "")) == "rust_runners"
		and String(game.last_result.get("outcome", "")) == "complete"
		and (game.last_result.get("secondary", {}) as Dictionary).has("kills"))

	var dm := _make_game(row, "deathmatch", 4, 1, 5101)
	dm.score_kill_for_test(0, 1)
	_check("Deathmatch awards the killer's individual score", int(dm.actor_state(0)["score"]) == 1
		and int(dm.mode_scores.get("actor:0", 0)) == 1)
	var tdm := _make_game(row, "team_deathmatch", 4, 1, 5102)
	tdm.score_kill_for_test(0, 1)
	_check("Team Deathmatch awards the killer's team", int(tdm.mode_scores.get("team:0", 0)) == 1
		and int(tdm.mode_scores.get("team:1", 0)) == 0)

	var ctf := _make_game(row, "capture_flag", 4, 1, 5103)
	ctf.place_actor_for_test(0, Vector2(ctf.flag_state(1)["pos"]), Vector2.ZERO, true)
	ctf.update_objectives_for_test()
	_check("CTF enemy flag can be carried", int(ctf.flag_state(1)["carrier"]) == 0)
	ctf.damage_actor_for_test(0, 999.0, 1)
	var dropped_flag_pos := Vector2(ctf.flag_state(1)["pos"])
	_check("a killed carrier drops the flag at the death position",
		int(ctf.flag_state(1)["carrier"]) == -1 and bool(ctf.flag_state(1)["dropped"]))
	ctf.place_actor_for_test(1, dropped_flag_pos, Vector2.ZERO, true)
	ctf.update_objectives_for_test()
	_check("the owning team returns its dropped flag",
		not bool(ctf.flag_state(1)["dropped"])
		and Vector2(ctf.flag_state(1)["pos"]).is_equal_approx(Vector2(ctf.flag_state(1)["home"])))
	ctf.respawn_actor_for_test(0)
	ctf.place_actor_for_test(0, Vector2(ctf.flag_state(1)["home"]), Vector2.ZERO, true)
	ctf.update_objectives_for_test()
	ctf.place_actor_for_test(0, Vector2(ctf.flag_state(0)["home"]), Vector2.ZERO, true)
	ctf.update_objectives_for_test()
	_check("carrying the enemy flag home records a capture and resets it",
		int(ctf.mode_scores.get("team:0", 0)) == 3
		and int(ctf.flag_state(1)["carrier"]) == -1
		and not bool(ctf.flag_state(1)["dropped"]))

	var point := _make_game(row, "pointmatch", 4, 1, 5104)
	point.place_actor_for_test(0, Vector2(point.point_item["pos"]), Vector2.ZERO, true)
	point.update_objectives_for_test()
	point.step_without_input(point.POINT_SCORE_TICKS)
	_check("Pointmatch possession produces periodic individual score",
		int(point.point_item["carrier"]) == 0 and int(point.actor_state(0)["score"]) >= 1)

	var limited := _make_game(row, "deathmatch", 2, 1, 5105, {"score_limit": 1})
	var result_count := [0]
	limited.match_finished.connect(func(_result: Dictionary) -> void: result_count[0] += 1)
	limited.score_kill_for_test(0, 1)
	limited.score_kill_for_test(0, 1)
	_check("score limit ends one normalized mode result exactly once", limited.finished
		and result_count[0] == 1 and String(limited.last_result.get("secondary", {}).get("mode", "")) == "deathmatch")

	var bots := _make_game(row, "capture_flag", 8, 1, 5201)
	_check("one human seat fills to the flagship eight-actor population",
		bots.actors.size() == 8 and bots.actors.slice(1).all(func(actor: Dictionary) -> bool:
			return bool(actor.get("ai", false))))
	bots.actor_state(1)["hp"] = 18.0
	var health_ai: Dictionary = bots.ai_snapshot_for_test(1)
	_check("wounded bot seeks a health pickup and produces traversal input",
		String(bots.actor_state(1)["ai_goal"]) == "pickup_health"
		and not Vector2(health_ai.get("move", Vector2.ZERO)).is_zero_approx())
	bots.actor_state(1)["hp"] = 100.0
	bots.flag_state(0)["pos"] = Vector2(bots.actor_state(1)["pos"]) + Vector2(180, -140)
	var flag_ai: Dictionary = bots.ai_snapshot_for_test(1)
	_check("objective bot pursues the enemy flag and ignites traversal mobility",
		String(bots.actor_state(1)["ai_goal"]) == "enemy_flag"
		and bool((flag_ai.get("pressed", {}) as Dictionary).get("mobility", false)))

	var duel_bots := _make_game(row, "deathmatch", 4, 1, 5202)
	duel_bots.place_actor_for_test(1, Vector2(400, 500), Vector2.ZERO, true)
	duel_bots.place_actor_for_test(0, Vector2(540, 500), Vector2.ZERO, true)
	var bot_fired := false
	for probe_tick in 24:
		duel_bots.tick = probe_tick
		var bot_input: Dictionary = duel_bots.ai_snapshot_for_test(1)
		if bool((bot_input.get("pressed", {}) as Dictionary).get("primary", false)):
			bot_fired = true
			break
	_check("combat bot selects a target aims and fires on a deterministic cadence", bot_fired)

	var local_seats := [
		{"seat": 0, "device": -1, "profile_id": "p0"},
		{"seat": 1, "device": 1, "profile_id": "p1"},
		{"seat": 2, "device": 2, "profile_id": "p2"},
		{"seat": 3, "device": 3, "profile_id": "p3"},
	]
	var local := _make_game(row, "team_deathmatch", 4, 4, 5301, {}, local_seats)
	local.place_actor_for_test(0, Vector2(400, 600), Vector2.ZERO, true)
	local.place_actor_for_test(1, Vector2(800, 600), Vector2.ZERO, true)
	local.apply_inputs(1, [_snap(Vector2.RIGHT), {"seat": 1, "device": 1,
		"move": Vector2.LEFT, "aim": Vector2.LEFT, "held": {}, "pressed": {}, "released": {}}])
	_check("four-seat local layout keeps two simultaneous actors isolated",
		float(local.actor_state(0)["velocity"].x) > 0.0
		and float(local.actor_state(1)["velocity"].x) < 0.0)

	var online_seats: Array = []
	for online_index in 8:
		online_seats.append({"seat": online_index, "peer_id": online_index + 1,
			"profile_id": "peer-%d" % online_index})
	var online := _make_game(row, "capture_flag", 8, 8, 5302,
		{"online": true, "session_id": "rust-eight"}, online_seats)
	var online_saved: Dictionary = online.snapshot()
	online.apply_inputs(1, [_snap(Vector2.RIGHT, Vector2.UP, {"mobility": true})])
	online.restore_snapshot(online_saved)
	_check("eight-seat online state converges through the ordinary deep snapshot",
		JSON.stringify(online.snapshot()) == JSON.stringify(online_saved))
	local.apply_inputs(2, [{"seat": 0, "move": Vector2.ZERO, "aim": Vector2.RIGHT,
		"held": {"scoreboard": true}, "pressed": {}, "released": {}}])
	_check("broadcast HUD exposes mode score kill feed ammo health vest jet and scoreboard",
		local.get_node_or_null("Scoreboard") != null and local.get_node_or_null("KillFeed") != null
		and bool(local.show_scoreboard) and not dm.kill_feed.is_empty()
		and String(local.get("_status").text).contains("JET"))
	ProtoContainer.ensure_items()
	var venue_catalog: Dictionary = (load("res://proto3d/games/game_venue.gd") as GDScript).load_catalog()
	var rust_board: Array = ProtoGameRegistry.load_catalog().house_boards.filter(func(board: Dictionary) -> bool:
		return String(board.get("game_id", "")) == "rust_runners")
	_check("physical prize cache house board and drive-in night surface the cartridge",
		ProtoContainer.ITEMS.has("game_cart_rust_runners")
		and FileAccess.get_file_as_string("res://data/loot_tables.json").contains("game_cart_rust_runners")
		and rust_board.size() == 1
		and (venue_catalog.get("events", []) as Array).any(func(event: Dictionary) -> bool:
			return String(event.get("game_id", "")) == "rust_runners"))
	var arcade := FakeArcade.new()
	add_child(arcade)
	var deck := ProtoGameDeck.create(self)
	add_child(deck)
	deck.attach_net(arcade)
	deck.launch("rust_runners", {"source": "session", "online": true,
		"local_peer_id": 1, "session_id": "rust-bridge", "mode": "team_deathmatch",
		"actor_count": 2, "bots_enabled": false})
	deck.start(5401, [{"seat": 0, "peer_id": 1, "profile_id": "host"},
		{"seat": 1, "peer_id": 2, "profile_id": "remote"}])
	var remote_input := {"seat": 1, "move": Vector2.LEFT, "aim": Vector2.LEFT,
		"held": {"move_left": true}, "pressed": {}, "released": {}}
	arcade.input_received.emit(2, 1, remote_input)
	deck.process_tick()
	deck.process_tick()
	deck.process_tick()
	_check("ordinary host bridge applies remote shooter input and publishes snapshots",
		float(deck.cartridge.actor_state(1)["velocity"].x) < 0.0
		and arcade.sent_snapshots.size() == 1)
	var bridge_state: Dictionary = deck.cartridge.snapshot()
	var bridge_actor: Dictionary = ((bridge_state["combat"] as Dictionary)["actors"] as Dictionary)[1]
	var expected_remote_pos: Vector2 = bridge_actor["pos"]
	deck.cartridge.place_actor_for_test(1, Vector2(99, 99), Vector2.ZERO, false)
	var converged: bool = deck.apply_network_snapshot(bridge_state)
	deck.cartridge.debug_force_finish()
	_check("ordinary bridge converges and publishes one normalized flagship result",
		converged and Vector2(deck.cartridge.actor_state(1)["pos"]).is_equal_approx(expected_remote_pos)
		and arcade.sent_results.size() == 1 and deck.ledger.recent_results.size() == 1)
	_finish()


func _snap(move: Vector2, aim: Vector2 = Vector2.RIGHT, held: Dictionary = {},
		pressed: Dictionary = {}) -> Dictionary:
	return {"seat": 0, "device": -1, "move": move, "aim": aim,
		"held": held, "pressed": pressed, "released": {}}


func _make_game(row: Dictionary, mode: String, actor_count: int, seat_count: int,
		seed: int, extra: Dictionary = {}, explicit_seats: Array = []) -> Control:
	var created: Control = (load(SCENE) as PackedScene).instantiate()
	add_child(created)
	var new_context := {"source": "focused", "mode": mode, "map_id": "refinery_run",
		"gore": false, "actor_count": actor_count, "session_id": "rust-%s-%d" % [mode, seed]}
	new_context.merge(extra, true)
	created.configure(row, new_context)
	var new_seats: Array = explicit_seats.duplicate(true)
	if new_seats.is_empty():
		for seat_index in seat_count:
			new_seats.append({"seat": seat_index, "device": -1 if seat_index == 0 else seat_index,
				"profile_id": "seat-%d" % seat_index})
	created.start_match(seed, new_seats)
	return created


func _finish() -> void:
	print("RUST_RUNNERS RESULTS: %d passed, %d failed" % [passed, failed])
	print("RUST_RUNNERS: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
