## RED SKY proof: deterministic terrain/wind, turn ownership, angle/charge,
## ballistic flight, terrain deformation, blast damage, AI, local seats, result.
extends Node

var passed := 0
var failed := 0
var results := 0


func _check(label: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("RED_SKY: %s - %s" % ["PASS" if ok else "FAIL", label])


func _new_game(seed_value: int = 61, seat_count: int = 1) -> Control:
	var game := (load("res://proto3d/games/red_sky/red_sky.tscn") as PackedScene).instantiate() as Control
	add_child(game)
	game.configure(ProtoGameRegistry.load_catalog().get_game("red_sky"), {"source": "test"})
	var seats: Array = []
	for index in seat_count:
		seats.append({"seat": index, "device": -1 if index == 0 else index,
			"profile_id": "crew-%d" % index})
	game.start_match(seed_value, seats)
	return game


func _snap(seat: int, held: Dictionary = {}, pressed: Dictionary = {}) -> Dictionary:
	return {"seat": seat, "device": -1, "move": Vector2.ZERO, "aim": Vector2.ZERO,
		"held": held, "pressed": pressed, "released": {}}


func _ready() -> void:
	print("RED_SKY: start")
	get_tree().create_timer(60.0).timeout.connect(func() -> void: get_tree().quit(1))
	var path := "res://proto3d/games/red_sky/red_sky.tscn"
	_check("the cartridge scene exists", ResourceLoader.exists(path))
	if not ResourceLoader.exists(path):
		_finish()
		return
	var cold := (load(path) as PackedScene).instantiate() as Control
	add_child(cold)
	_check("an unstarted cartridge guards its empty terrain draw",
		cold.has_method("terrain_ready_for_draw") and not bool(cold.terrain_ready_for_draw()))
	cold.queue_free()
	var a := _new_game(611)
	var b := _new_game(611)
	_check("same seed creates identical ruined terrain and wind",
		a.terrain == b.terrain and a.wind == b.wind)
	_check("solo play fills an AI artillery crew", a.crews.size() == 2
		and bool((a.crews[1] as Dictionary)["ai"]))
	var angle_before := float((a.crews[0] as Dictionary)["angle"])
	var power_before := float((a.crews[0] as Dictionary)["power"])
	a.apply_inputs(1, [_snap(0, {"move_right": true, "move_up": true})])
	_check("active crew adjusts angle and charge through semantic holds",
		float((a.crews[0] as Dictionary)["angle"]) > angle_before
		and float((a.crews[0] as Dictionary)["power"]) > power_before)
	_check("primary fire launches one owned ballistic shell", a.fire_projectile(0)
		and int(a.projectile.get("owner", -1)) == 0)
	var velocity_before: Vector2 = a.projectile["vel"]
	a.update_projectile(0.1)
	_check("gravity and wind bend the ballistic velocity",
		Vector2(a.projectile["vel"]).y > velocity_before.y
		and Vector2(a.projectile["vel"]).x != velocity_before.x)

	var crater_x := float((a.crews[1] as Dictionary)["x"])
	var terrain_before: float = a.terrain_y(crater_x)
	var hp_before := int((a.crews[1] as Dictionary)["hp"])
	a.explode_at(Vector2(crater_x, terrain_before), 0)
	_check("impact deforms the sampled terrain downward", a.terrain_y(crater_x) > terrain_before)
	_check("blast falloff damages a crew inside the crater radius",
		int((a.crews[1] as Dictionary)["hp"]) < hp_before)
	_check("resolved shot advances to the next living crew", a.current_turn == 1)

	var local_game := _new_game(612, 2)
	local_game.apply_inputs(1, [_snap(0), _snap(1, {}, {"primary": true})])
	_check("a non-active local seat cannot steal the turn", local_game.projectile.is_empty())
	local_game.apply_inputs(2, [_snap(0, {}, {"primary": true}), _snap(1)])
	_check("the active local seat owns its projectile", int(local_game.projectile.get("owner", -1)) == 0)
	local_game.explode_at(Vector2(640, local_game.terrain_y(640)), 0)
	local_game.apply_inputs(3, [_snap(0), _snap(1, {}, {"primary": true})])
	_check("the second local seat fires after turn advance",
		int(local_game.projectile.get("owner", -1)) == 1)

	var ai_game := _new_game(613)
	ai_game.current_turn = 1
	_check("AI computes and fires a deterministic ranging shot", ai_game.ai_take_turn(1)
		and int(ai_game.projectile.get("owner", -1)) == 1)
	var saved: Dictionary = ai_game.snapshot()
	ai_game.update_projectile(0.2)
	ai_game.restore_snapshot(saved)
	_check("snapshot restores terrain, crews, projectile, turn, wind, RNG, and tick",
		ai_game.snapshot() == saved)

	var win_game := _new_game(614, 2)
	win_game.match_finished.connect(func(_result: Dictionary) -> void: results += 1)
	(win_game.crews[1] as Dictionary)["hp"] = 1
	win_game.explode_at(Vector2(float((win_game.crews[1] as Dictionary)["x"]),
		win_game.terrain_y(float((win_game.crews[1] as Dictionary)["x"]))), 0)
	_check("destroying the last rival emits one wins/damage result", win_game.finished
		and results == 1 and int(win_game.last_result.get("primary", 0)) == 1
		and (win_game.last_result.get("secondary", {}) as Dictionary).has("damage"))
	_check("completed artillery match is idempotent", not win_game.debug_force_finish() and results == 1)
	var forced := _new_game(615, 2)
	_check("catalog completion hook emits a valid RED SKY result", forced.debug_force_finish()
		and String(forced.last_result.get("game_id", "")) == "red_sky")
	_check("rules never change DRIVN time", Engine.time_scale == 1.0)
	_finish()


func _finish() -> void:
	print("RED_SKY RESULTS: %d passed, %d failed" % [passed, failed])
	print("RED_SKY: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
