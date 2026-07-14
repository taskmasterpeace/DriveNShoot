## IRON DOME proof: aimed interceptors, manual expanding blasts, missile chains,
## city loss, finite ammo, portrait bounds, snapshot, and score/cities result.
extends Node

var passed := 0
var failed := 0
var results := [0]


func _check(label: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("IRON_DOME: %s - %s" % ["PASS" if ok else "FAIL", label])


func _new_game(seed_value: int = 300) -> Control:
	var scene := load("res://proto3d/games/iron_dome/iron_dome.tscn") as PackedScene
	var game: Control = scene.instantiate()
	add_child(game)
	game.configure(ProtoGameRegistry.load_catalog().get_game("iron_dome"), {"source": "test"})
	game.start_match(seed_value, [{"seat": 0, "device": -1, "profile_id": "proof"}])
	return game


func _snap(pressed: Dictionary, aim: Vector2 = Vector2.ZERO,
		cursor: Vector2 = Vector2.ZERO) -> Dictionary:
	return {"seat": 0, "device": -1, "held": pressed.duplicate(),
		"pressed": pressed.duplicate(), "released": {}, "move": Vector2.ZERO,
		"aim": aim, "cursor": cursor}


func _ready() -> void:
	print("IRON_DOME: start")
	get_tree().create_timer(50.0).timeout.connect(func() -> void: get_tree().quit(1))
	var path := "res://proto3d/games/iron_dome/iron_dome.tscn"
	_check("the cartridge scene exists", ResourceLoader.exists(path))
	if not ResourceLoader.exists(path):
		_finish()
		return
	var a := _new_game(444)
	var b := _new_game(444)
	_check("same seed creates the same incoming wave", a.missiles == b.missiles)
	_check("portrait defense field is 540 by 960", a.FIELD_SIZE == Vector2(540, 960))
	var pointer_target := Vector2(310, 420)
	a.apply_inputs(1, [_snap({"primary": true}, Vector2.ZERO, a.field_to_screen(pointer_target))])
	_check("pointer primary launches at the selected field point", a.interceptors.size() == 1
		and (a.interceptors[0] as Dictionary)["target"].distance_to(pointer_target) < 1.0)
	var ammo_after_pointer: int = a.ammo
	a.apply_inputs(2, [_snap({"primary": true}, Vector2.RIGHT)])
	_check("stick aim moves the same target and consumes one shot", a.ammo == ammo_after_pointer - 1
		and a.aim_point.x > pointer_target.x)

	a.start_match(445, [{"seat": 0}])
	a.missiles = [
		{"pos": Vector2(270, 360), "vel": Vector2(0, 20), "target_city": 2, "alive": true},
		{"pos": Vector2(292, 370), "vel": Vector2(0, 20), "target_city": 3, "alive": true},
	]
	a.interceptors.clear()
	_check("launch consumes finite silo ammo", a.launch_interceptor(Vector2(280, 365)) and a.ammo == 19)
	for _i in 20:
		a.update_fixed(0.05)
	_check("interceptor reaches target and waits armed", bool((a.interceptors[0] as Dictionary).get("armed", false)))
	a.detonate_armed()
	for _i in 8:
		a.update_fixed(0.05)
	_check("expanding blast chains nearby missiles", a.missiles.is_empty() and a.score >= 200)

	a.start_match(446, [{"seat": 0}])
	a.missiles = [{"pos": Vector2(a.city_x(1), a.GROUND_Y - 2), "vel": Vector2(0, 80),
		"target_city": 1, "alive": true}]
	a.update_fixed(0.1)
	_check("ground impact destroys its targeted city", not bool(a.cities[1]))
	a.ammo = 0
	_check("empty silos refuse another interceptor", not a.launch_interceptor(Vector2(200, 300)))

	var saved: Dictionary = a.snapshot()
	a.update_fixed(0.2)
	a.restore_snapshot(saved)
	_check("snapshot restores missiles, blasts, cities, aim, ammo, score, wave, and RNG", a.snapshot() == saved)

	var loss := _new_game(447)
	loss.match_finished.connect(func(_result: Dictionary) -> void: results[0] += 1)
	loss.cities = [false, false, false, false, false, true]
	loss.missiles = [{"pos": Vector2(loss.city_x(5), loss.GROUND_Y - 1), "vel": Vector2(0, 80),
		"target_city": 5, "alive": true}]
	loss.update_fixed(0.1)
	loss.update_fixed(0.1)
	_check("last city loss emits one result", loss.finished and int(results[0]) == 1)
	_check("result reports score and cities saved", loss.last_result.get("primary", null) is int
		and (loss.last_result.get("secondary", {}) as Dictionary).has("cities_saved"))
	var forced := _new_game(448)
	_check("catalog completion hook emits valid IRON DOME result", forced.debug_force_finish())
	_check("rules never change world time", Engine.time_scale == 1.0)
	_finish()


func _finish() -> void:
	print("IRON_DOME RESULTS: %d passed, %d failed" % [passed, failed])
	print("IRON_DOME: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
