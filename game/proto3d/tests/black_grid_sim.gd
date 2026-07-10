## BLACK GRID clean-room fidelity proof, slice one: Infantry-like inertia,
## loadout mass, projectile relationships, energy, and real-time fog/radar.
extends Node

const SCENE := "res://proto3d/games/black_grid/black_grid.tscn"
const ZONES := "res://data/black_grid_zones.json"

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
	_finish()


func _make_game(row: Dictionary, mode: String, actor_count: int, seed: int,
		zone_id: String) -> Control:
	var created: Control = (load(SCENE) as PackedScene).instantiate()
	add_child(created)
	created.configure(row, {"source": "focused", "mode": mode, "zone_id": zone_id,
		"actor_count": actor_count, "session_id": "grid-%s-%d" % [mode, seed],
		"bots_enabled": false})
	created.start_match(seed, [{"seat": 0, "device": -1, "profile_id": "rider"}])
	return created


func _snap(move: Vector2, aim: Vector2 = Vector2.RIGHT, held: Dictionary = {},
		pressed: Dictionary = {}) -> Dictionary:
	return {"seat": 0, "device": -1, "move": move, "aim": aim,
		"held": held, "pressed": pressed, "released": {}}


func _finish() -> void:
	print("BLACK_GRID RESULTS: %d passed, %d failed" % [passed, failed])
	print("BLACK_GRID: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
