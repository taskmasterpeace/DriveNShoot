## RUST RUNNERS fidelity proof, slice one: Soldat-like side-view locomotion,
## stance vocabulary, independent aim, complete carried combat, and respawn.
extends Node

const SCENE := "res://proto3d/games/rust_runners/rust_runners.tscn"
const MAPS := "res://data/rust_runners_maps.json"

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
		"session_id": "rust-determinism"})
	var seats := [{"seat": 0, "device": -1, "profile_id": "rider"}]
	game.start_match(44117, seats)
	_check("match spawns one rider and one deterministic opponent", game.actors.size() == 2
		and not bool(game.actor_state(0).get("ai", true))
		and bool(game.actor_state(1).get("ai", false)))
	var twin: Control = (load(SCENE) as PackedScene).instantiate()
	add_child(twin)
	twin.configure(row, {"source": "focused", "mode": "deathmatch",
		"map_id": "refinery_run", "gore": true, "actor_count": 2,
		"session_id": "rust-determinism"})
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
	_finish()


func _snap(move: Vector2, aim: Vector2 = Vector2.RIGHT, held: Dictionary = {},
		pressed: Dictionary = {}) -> Dictionary:
	return {"seat": 0, "device": -1, "move": move, "aim": aim,
		"held": held, "pressed": pressed, "released": {}}


func _finish() -> void:
	print("RUST_RUNNERS RESULTS: %d passed, %d failed" % [passed, failed])
	print("RUST_RUNNERS: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
