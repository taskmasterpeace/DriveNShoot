## BLACK GRID clean-room fidelity proof, slice one: Infantry-like inertia,
## loadout mass, projectile relationships, energy, and real-time fog/radar.
extends Node

const SCENE := "res://proto3d/games/black_grid/black_grid.tscn"
const ZONES := "res://data/black_grid_zones.json"

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
		sent_snapshots.append({"event_id":event_id,"state":state.duplicate(true)})
		return true
	func send_result(result: Dictionary) -> bool:
		sent_results.append(result.duplicate(true))
		return true

var passed := 0
var failed := 0


func _check(label: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("BLACK_GRID: %s - %s" % ["PASS" if ok else "FAIL", label])


func _ready() -> void:
	print("BLACK_GRID: start")
	get_tree().create_timer(70.0).timeout.connect(func() -> void: get_tree().quit(1))
	var exists := ResourceLoader.exists(SCENE) and FileAccess.file_exists(ZONES)
	_check("cartridge scene and original zone rows exist", exists)
	if not exists:
		_finish()
		return
	var parsed: Dictionary = JSON.parse_string(FileAccess.get_file_as_string(ZONES))
	var zones: Array = parsed.get("zones", [])
	var zone_rows_valid := zones.size() >= 3 and zones.all(func(zone: Dictionary) -> bool:
		return not (zone.get("walls", []) as Array).is_empty() \
			and not (zone.get("darkness", []) as Array).is_empty() \
			and (zone.get("spawns", {}) as Dictionary).has("team_0") \
			and (zone.get("spawns", {}) as Dictionary).has("team_1") \
			and not (zone.get("capture_nodes", []) as Array).is_empty() \
			and not (zone.get("vehicle_pads", []) as Array).is_empty() \
			and not String(zone.get("id", "")).contains("infantry"))
	_check("three zones declare original walls darkness spawns objectives and vehicle pads",
		zone_rows_valid)

	var row: Dictionary = ProtoGameRegistry.load_catalog().get_game("black_grid")
	var game := _make_game(row, "skirmish", 2, 6101, "relay_fall")
	_check("match starts a rider and deterministic opposing field bot",
		game.actors.size() == 2 and not bool(game.actor_state(0)["ai"])
		and bool(game.actor_state(1)["ai"]))
	var twin := _make_game(row, "skirmish", 2, 6101, "relay_fall")
	_check("seed class loadout and zone reproduce exact initial state",
		JSON.stringify(game.snapshot()) == JSON.stringify(twin.snapshot()))

	game.place_actor_for_test(0, Vector2(180, 520), Vector2.ZERO)
	game.apply_inputs(1, [_snap(Vector2.RIGHT)])
	var first_velocity := float(game.actor_state(0)["velocity"].x)
	game.apply_inputs(2, [_snap(Vector2.ZERO)])
	_check("free movement accelerates and coasts with retained inertia",
		first_velocity > 0.0 and first_velocity < float(game.actor_state(0)["max_speed"])
		and float(game.actor_state(0)["velocity"].x) > 0.0)
	var scout_mass := float(game.actor_state(0)["total_mass"])
	var scout_accel := float(game.actor_state(0)["acceleration"])
	var heavy_ok := bool(game.set_loadout_for_test(0, "heavy",
		["bg_siege_shell", "bg_shard_cannon", "armor_plate", "power_cell"]))
	_check("class and carried equipment produce real encumbrance", heavy_ok
		and float(game.actor_state(0)["total_mass"]) > scout_mass
		and float(game.actor_state(0)["acceleration"]) < scout_accel)
	_check("loadout cap rejects an impossible everything-kit",
		not bool(game.set_loadout_for_test(0, "scout",
			["bg_siege_shell", "bg_shard_cannon", "bg_rail_lance", "armor_plate",
			"armor_plate", "power_cell", "sensor_pack"])))

	game.set_loadout_for_test(0, "scout", ["bg_pulse_carbine", "bg_rail_lance", "sensor_pack"])
	game.place_actor_for_test(0, Vector2(180, 520), Vector2.ZERO)
	var energy_before := float(game.actor_state(0)["energy"])
	game.apply_inputs(3, [_snap(Vector2.RIGHT, Vector2.RIGHT, {}, {"mobility": true})])
	_check("shared mobility performs a powered combat boost", int(game.actor_state(0)["boost_ticks"]) > 0
		and float(game.actor_state(0)["velocity"].x) > game.RUN_SPEED
		and float(game.actor_state(0)["energy"]) < energy_before)
	var spent_energy := float(game.actor_state(0)["energy"])
	game.step_without_input(25)
	_check("energy recharges after boost pressure ends", float(game.actor_state(0)["energy"]) > spent_energy)
	game.apply_inputs(40, [_snap(Vector2.ZERO, Vector2(0.42, -0.91), {"stance": true})])
	_check("aim remains independent while stance changes handling",
		Vector2(game.actor_state(0)["aim"]).is_equal_approx(Vector2(0.42, -0.91).normalized())
		and String(game.actor_state(0)["stance"]) == "braced"
		and float(game.actor_state(0)["max_speed"]) < game.RUN_SPEED)

	game.place_actor_for_test(0, Vector2(150, 180), Vector2.ZERO)
	game.place_actor_for_test(1, Vector2(370, 180), Vector2.ZERO)
	game.actor_state(1)["hp"] = 100.0
	game.actor_state(1)["armor"] = 24.0
	game.actor_state(1)["alive"] = true
	game.set_active_weapon_for_test(0, "bg_pulse_carbine")
	var armor_before := float(game.actor_state(1)["armor"])
	game.apply_inputs(41, [_snap(Vector2.ZERO, Vector2.RIGHT, {}, {"primary": true})])
	_check("independent primary fire launches a traveling projectile before impact",
		game.combat.projectiles.size() == 1 and int(game.weapon_state(0, "bg_pulse_carbine")["ammo"]) == 31)
	game.step_without_input(18)
	_check("projectile travel resolves armor then health and knockback",
		float(game.actor_state(1)["armor"]) < armor_before
		and float(game.actor_state(1)["hp"]) < 100.0
		and not Vector2(game.actor_state(1).get("last_knockback", Vector2.ZERO)).is_zero_approx())

	game.combat.step_many(40)
	game.weapon_state(0, "bg_pulse_carbine")["ammo"] = 0
	game.apply_inputs(70, [_snap(Vector2.ZERO, Vector2.RIGHT, {}, {"reload": true})])
	_check("magazine reload uses the same shared timed ammo economy",
		int(game.weapon_state(0, "bg_pulse_carbine")["reload"]) > 0)
	game.combat.step_many(int(game.combat.weapon_rows["bg_pulse_carbine"]["reload_ticks"]))
	_check("reload moves reserve rounds into the magazine",
		int(game.weapon_state(0, "bg_pulse_carbine")["ammo"]) > 0)
	game.combat.step_many(40)
	var legal_heat_shots := 0
	for heat_probe in 8:
		if not game.fire_weapon_for_test(0, "bg_pulse_carbine", Vector2.RIGHT).is_empty():
			legal_heat_shots += 1
		game.combat.step_many(4)
	_check("weapon heat eventually gates an otherwise loaded pulse carbine",
		legal_heat_shots > 1 and legal_heat_shots < 8
		and float(game.weapon_state(0, "bg_pulse_carbine")["heat"]) > 0.0)

	game.set_loadout_for_test(0, "heavy", ["bg_siege_shell", "bg_shard_cannon",
		"armor_plate", "power_cell"])
	game.combat.step_many(80)
	game.fire_weapon_for_test(0, "bg_siege_shell", Vector2.RIGHT,
		{"velocity_scale": 0.0, "fuse_ticks": 1})
	game.combat.step()
	_check("siege explosion emits blast falloff and deterministic shrapnel",
		game.combat.event_count("blast") >= 1 and game.combat.event_count("shrapnel") >= 10)
	game.set_loadout_for_test(0, "scout", ["bg_pulse_carbine", "bg_rail_lance", "sensor_pack"])
	game.combat.step_many(80)
	game.place_actor_for_test(0, Vector2(420, 260), Vector2.ZERO)
	game.fire_weapon_for_test(0, "bg_rail_lance", Vector2.RIGHT)
	_check("rail fire ricochets from declared zone geometry",
		game.combat.event_count("ricochet") >= 1)

	var fog := _make_game(row, "skirmish", 2, 6201, "blackout_yard")
	var wall: Rect2 = fog.walls[0]
	fog.place_actor_for_test(0, wall.position - Vector2(70, -40), Vector2.ZERO)
	fog.place_actor_for_test(1, wall.end + Vector2(70, -40), Vector2.ZERO)
	fog.update_visibility_for_test(0)
	_check("wall occlusion removes the exact enemy contact",
		not fog.visible_contacts(0).has(1))
	_check("radar retains only a coarse contact behind the wall",
		fog.radar_contacts(0).has(1)
		and Vector2(fog.radar_contacts(0)[1]) != Vector2(fog.actor_state(1)["pos"]))
	fog.place_actor_for_test(0, Vector2(210, 540), Vector2.ZERO)
	fog.place_actor_for_test(1, Vector2(290, 540), Vector2.ZERO)
	fog.update_visibility_for_test(0)
	_check("clear line of sight restores the exact real-time contact",
		fog.visible_contacts(0).has(1)
		and Vector2(fog.visible_contacts(0)[1]).is_equal_approx(Vector2(fog.actor_state(1)["pos"])))
	var dark: Rect2 = fog.darkness[0]
	fog.place_actor_for_test(1, dark.get_center(), Vector2.ZERO)
	fog.place_actor_for_test(0, dark.get_center() + Vector2(180, 0), Vector2.ZERO)
	fog.update_visibility_for_test(0)
	_check("darkness hides exact contacts outside close reveal range",
		not fog.visible_contacts(0).has(1) and fog.radar_contacts(0).has(1))
	var fog_saved: Dictionary = fog.snapshot()
	fog.place_actor_for_test(1, Vector2(900, 500), Vector2.ZERO)
	fog.update_visibility_for_test(0)
	fog.restore_snapshot(fog_saved)
	_check("fog exact and radar contact state survives deep restore",
		JSON.stringify(fog.snapshot()) == JSON.stringify(fog_saved))

	var forced := bool(game.debug_force_finish())
	_check("infantry slice emits one normalized objective-aware result", forced
		and String(game.last_result.get("game_id", "")) == "black_grid"
		and (game.last_result.get("secondary", {}) as Dictionary).has("objective_score"))

	var field := _make_game(row, "skirmish", 4, 6301, "relay_fall")
	field.set_loadout_for_test(0, "engineer", ["bg_pulse_carbine", "turret_pack",
		"barricade_pack", "sensor_pack", "repair_kit", "power_cell"])
	var materials_before := int(field.actor_state(0)["materials"])
	var energy_before_deploy := float(field.actor_state(0)["energy"])
	var sensor: int = field.place_deployable_for_test(0, "sensor",
		Vector2(field.actor_state(0)["pos"]) + Vector2(40, 0))
	_check("sensor placement spends carried material and energy", sensor >= 0
		and int(field.actor_state(0)["materials"]) < materials_before
		and float(field.actor_state(0)["energy"]) < energy_before_deploy)
	field.place_actor_for_test(0, Vector2(100, 560), Vector2.ZERO)
	field.deployables[sensor]["pos"] = Vector2(700, 560)
	field.place_actor_for_test(1, Vector2(1080, 560), Vector2.ZERO)
	field.update_visibility_for_test(0)
	_check("team sensor extends coarse radar without inventing exact sight",
		field.radar_contacts(0).has(1) and not field.visible_contacts(0).has(1))

	field.place_actor_for_test(0, Vector2(220, 560), Vector2.ZERO)
	var barricade: int = field.place_deployable_for_test(0, "barricade", Vector2(300, 560))
	field.apply_inputs(1, [_snap(Vector2.RIGHT)])
	field.step_without_input(25)
	_check("barricade becomes destroyable collision that blocks movement",
		barricade >= 0 and float(field.actor_state(0)["pos"].x) < 285.0)
	field.place_actor_for_test(1, Vector2(520, 520), Vector2.ZERO)
	var enemy_hp_before := float(field.actor_state(1)["hp"])
	var turret: int = field.place_deployable_for_test(0, "turret", Vector2(390, 520))
	field.step_without_input(45)
	_check("powered turret acquires and damages an enemy", turret >= 0
		and float(field.actor_state(1)["hp"]) < enemy_hp_before)
	field.actor_state(0)["hp"] = 45.0
	var repair: int = field.place_deployable_for_test(0, "repair", Vector2(field.actor_state(0)["pos"]))
	field.step_without_input(30)
	_check("repair node restores nearby allied infantry", repair >= 0
		and float(field.actor_state(0)["hp"]) > 45.0)
	var deployed_count: int = field.deployables.size()
	field.damage_deployable_for_test(sensor, 999.0, 1)
	_check("field equipment is damageable and leaves the active set when destroyed",
		field.deployables.size() == deployed_count - 1)

	var motor := _make_game(row, "fleet", 4, 6401, "continuity_bastion")
	_check("zone vehicle pads spawn distinct light armored field vehicles",
		motor.vehicles.size() >= 3
		and float(motor.vehicle_state(0)["mass"]) != float(motor.vehicle_state(1)["mass"])
		and String(motor.vehicle_state(0)["weapon_id"]) != "")
	var vehicle_pos: Vector2 = motor.vehicle_state(0)["pos"]
	motor.place_actor_for_test(0, vehicle_pos + Vector2(12, 0), Vector2.ZERO)
	var entered := bool(motor.enter_vehicle_for_test(0, 0))
	_check("interaction enters a real driver seat and removes infantry movement authority",
		entered and int(motor.actor_state(0)["vehicle_id"]) == 0
		and int(motor.vehicle_state(0)["driver"]) == 0)
	motor.apply_inputs(1, [_snap(Vector2.RIGHT, Vector2.RIGHT)])
	motor.step_without_input(8)
	_check("vehicle mass retains distinct mounted momentum",
		float(motor.vehicle_state(0)["velocity"].x) > 0.0
		and float(motor.vehicle_state(0)["pos"].x) > vehicle_pos.x)
	motor.place_actor_for_test(1, Vector2(motor.vehicle_state(0)["pos"]) + Vector2(180, 0), Vector2.ZERO)
	var mounted_target_hp := float(motor.actor_state(1)["hp"])
	var mounted_fired := bool(motor.fire_vehicle_for_test(0, Vector2.RIGHT))
	motor.step_without_input(25)
	_check("mounted weapon uses shared projectile combat", mounted_fired
		and float(motor.actor_state(1)["hp"]) < mounted_target_hp)
	_check("driver can exit back to infantry at the vehicle position",
		bool(motor.exit_vehicle_for_test(0)) and int(motor.actor_state(0)["vehicle_id"]) == -1)

	var skirmish := _make_game(row, "skirmish", 4, 6501, "relay_fall")
	var tickets_before := int(skirmish.tickets["team:1"])
	skirmish.score_kill_for_test(0, 1)
	_check("Skirmish kill spends enemy tickets and awards team score",
		int(skirmish.tickets["team:1"]) == tickets_before - 1
		and int(skirmish.team_scores["team:0"]) == 1
		and int(skirmish.actor_state(1)["respawn_ticks"]) > 0)
	skirmish.respawn_actor_for_test(1)
	_check("team spawn network returns the defeated actor at an owned position",
		bool(skirmish.actor_state(1)["alive"])
		and skirmish.team_spawn_positions(1).any(func(pos: Vector2) -> bool:
			return pos.distance_to(Vector2(skirmish.actor_state(1)["pos"])) < 1.0))

	var front := _make_game(row, "frontlines", 4, 6502, "relay_fall")
	front.capture_node_for_test(0, 0)
	front.step_without_input(front.OBJECTIVE_SCORE_TICKS)
	_check("Frontlines capture creates a forward spawn and periodic objective score",
		int(front.capture_nodes[0]["owner"]) == 0
		and int(front.team_scores["team:0"]) > 0
		and front.team_spawn_positions(0).has(Vector2(front.capture_nodes[0]["pos"])))

	var ctf := _make_game(row, "capture_flag", 4, 6503, "relay_fall")
	ctf.place_actor_for_test(0, Vector2(ctf.flag_state(1)["home"]), Vector2.ZERO)
	ctf.update_objectives_for_test()
	ctf.place_actor_for_test(0, Vector2(ctf.flag_state(0)["home"]), Vector2.ZERO)
	ctf.update_objectives_for_test()
	_check("Capture the Flag carries banks and resets the enemy signal",
		int(ctf.team_scores["team:0"]) >= 3 and int(ctf.flag_state(1)["carrier"]) == -1)

	var hunt := _make_game(row, "bug_hunt", 4, 6504, "blackout_yard")
	_check("Bug Hunt starts a cooperative squad against role-tagged creatures",
		hunt.bugs.size() >= 6 and hunt.actors.all(func(actor: Dictionary) -> bool:
			return int(actor.get("team", -1)) == 0))
	for bug_value in hunt.bugs.duplicate():
		hunt.kill_bug_for_test(int((bug_value as Dictionary)["id"]), 0)
	_check("clearing the last bug ends one cooperative round",
		hunt.finished and String(hunt.last_result.get("secondary", {}).get("mode", "")) == "bug_hunt")

	var fleet := _make_game(row, "fleet", 4, 6505, "continuity_bastion",
		{"score_limit": 1})
	var enemy_vehicle: int = fleet.vehicles.find_custom(func(vehicle: Dictionary) -> bool:
		return int(vehicle.get("team", -1)) == 1)
	fleet.destroy_vehicle_for_test(enemy_vehicle, 0)
	_check("Fleet mode scores destroyed mounted armor and honors its limit",
		fleet.finished and int(fleet.team_scores["team:0"]) >= 1)

	var vote := _make_game(row, "skirmish", 4, 6506, "relay_fall")
	vote.cast_vote(0, "frontlines")
	vote.cast_vote(1, "frontlines")
	vote.cast_vote(2, "fleet")
	_check("round-end vote resolves a deterministic declared next mode",
		String(vote.resolve_vote()) == "frontlines" and vote.next_mode == "frontlines")
	var timed := _make_game(row, "skirmish", 4, 6507, "relay_fall",
		{"time_limit_ticks": 3})
	timed.step_without_input(3)
	_check("declared time limit ends one field round when score remains tied",
		timed.finished and int(timed.last_result.get("secondary", {}).get("winner_team", -1)) in [0, 1])

	var bot_field := _make_game(row, "frontlines", 16, 6601, "relay_fall",
		{"bots_enabled": true})
	_check("one rider fills to sixteen deterministic field actors",
		bot_field.actors.size() == 16 and bot_field.actors.slice(1).all(func(actor: Dictionary) -> bool:
			return bool(actor.get("ai", false))))
	var objective_ai: Dictionary = bot_field.ai_snapshot_for_test(1)
	_check("objective bot selects an uncaptured forward node and moves toward it",
		String(bot_field.actor_state(1)["ai_goal"]) == "capture_node"
		and not Vector2(objective_ai.get("move", Vector2.ZERO)).is_zero_approx())
	bot_field.actor_state(1)["class_id"] = "engineer"
	bot_field.actor_state(1)["materials"] = 100
	bot_field.capture_node_for_test(0, 1)
	bot_field.place_actor_for_test(1, Vector2(bot_field.capture_nodes[0]["pos"]), Vector2.ZERO)
	bot_field.ai_snapshot_for_test(1)
	_check("engineer bot fortifies an owned objective with a deployable",
		bot_field.deployables.any(func(deployable: Dictionary) -> bool:
			return int(deployable.get("owner", -1)) == 1))

	var bot_fleet := _make_game(row, "fleet", 8, 6602, "continuity_bastion",
		{"bots_enabled": true})
	var bot_vehicle_index: int = bot_fleet.vehicles.find_custom(func(vehicle: Dictionary) -> bool:
		return int(vehicle.get("team", -1)) == int(bot_fleet.actor_state(1)["team"]))
	var bot_vehicle_pos: Vector2 = bot_fleet.vehicle_state(bot_vehicle_index)["pos"]
	bot_fleet.place_actor_for_test(1, bot_vehicle_pos + Vector2(10, 0), Vector2.ZERO)
	bot_fleet.ai_snapshot_for_test(1)
	_check("field bot can claim an unoccupied vehicle seat",
		int(bot_fleet.actor_state(1)["vehicle_id"]) >= 0)

	var local_seats := [{"seat":0,"device":-1,"profile_id":"p0"},
		{"seat":1,"device":1,"profile_id":"p1"}]
	var local := _make_game(row, "skirmish", 4, 6701, "relay_fall", {}, local_seats)
	local.place_actor_for_test(0, Vector2(200, 540), Vector2.ZERO)
	local.place_actor_for_test(1, Vector2(1000, 540), Vector2.ZERO)
	local.apply_inputs(1, [_snap(Vector2.RIGHT), {"seat":1,"move":Vector2.LEFT,
		"aim":Vector2.LEFT,"held":{},"pressed":{},"released":{}}])
	_check("local field seats retain isolated simultaneous movement",
		float(local.actor_state(0)["velocity"].x) > 0.0
		and float(local.actor_state(1)["velocity"].x) < 0.0)
	var full_saved: Dictionary = bot_field.snapshot()
	bot_field.step_without_input(4)
	bot_field.restore_snapshot(full_saved)
	_check("deployable vehicle objective bot and spawn state converges after restore",
		JSON.stringify(bot_field.snapshot()) == JSON.stringify(full_saved))
	_check("tactical glass surfaces fog radar loadout objectives vehicles and vote state",
		field.get_node_or_null("TacticalStatus") != null
		and String(field.get("_status").text).contains("MASS")
		and not field.capture_nodes.is_empty() and not field.vehicles.is_empty())
	var arcade := FakeArcade.new()
	add_child(arcade)
	var deck := ProtoGameDeck.create(self)
	add_child(deck)
	deck.attach_net(arcade)
	deck.launch("black_grid", {"source":"session","online":true,"local_peer_id":1,
		"session_id":"grid-bridge","mode":"frontlines","actor_count":2,"bots_enabled":false})
	deck.start(6801, [{"seat":0,"peer_id":1,"profile_id":"host"},
		{"seat":1,"peer_id":2,"profile_id":"remote"}])
	arcade.input_received.emit(2, 1, {"seat":1,"move":Vector2.LEFT,"aim":Vector2.LEFT,
		"held":{"move_left":true},"pressed":{},"released":{}})
	deck.process_tick()
	deck.process_tick()
	deck.process_tick()
	_check("ordinary host bridge applies remote field input and publishes full snapshots",
		float(deck.cartridge.actor_state(1)["velocity"].x) < 0.0
		and arcade.sent_snapshots.size() == 1)
	var bridge_state: Dictionary = deck.cartridge.snapshot()
	var expected_actor: Dictionary = ((bridge_state["combat"] as Dictionary)["actors"] as Dictionary)[1]
	deck.cartridge.place_actor_for_test(1, Vector2(99, 99), Vector2.ZERO)
	var converged: bool = deck.apply_network_snapshot(bridge_state)
	deck.cartridge.debug_force_finish()
	_check("ordinary bridge converges vehicles objectives fog and one result",
		converged and Vector2(deck.cartridge.actor_state(1)["pos"]).is_equal_approx(
			Vector2(expected_actor["pos"]))
		and arcade.sent_results.size() == 1 and deck.ledger.recent_results.size() == 1)
	_finish()


func _make_game(row: Dictionary, mode: String, actor_count: int, seed: int,
		zone_id: String, extra: Dictionary = {}, explicit_seats: Array = []) -> Control:
	var created: Control = (load(SCENE) as PackedScene).instantiate()
	add_child(created)
	var new_context := {"source": "focused", "mode": mode, "zone_id": zone_id,
		"actor_count": actor_count, "session_id": "grid-%s-%d" % [mode, seed],
		"bots_enabled": false}
	new_context.merge(extra, true)
	created.configure(row, new_context)
	var new_seats: Array = explicit_seats.duplicate(true)
	if new_seats.is_empty():
		new_seats = [{"seat": 0, "device": -1, "profile_id": "rider"}]
	created.start_match(seed, new_seats)
	return created


func _snap(move: Vector2, aim: Vector2 = Vector2.RIGHT, held: Dictionary = {},
		pressed: Dictionary = {}) -> Dictionary:
	return {"seat": 0, "device": -1, "move": move, "aim": aim,
		"held": held, "pressed": pressed, "released": {}}


func _finish() -> void:
	print("BLACK_GRID RESULTS: %d passed, %d failed" % [passed, failed])
	print("BLACK_GRID: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
