## Standalone lab boot contract: isolated from campaign/menu/save, real F1 body,
## five stations, shared command motion, readable controls, and exact reset.
## Run: Godot --headless --path game res://proto3d/tests/physics_lab_sim.tscn
extends Node

const LAB_PATH := "res://proto3d/tools/physics_combat_lab.tscn"
const SAVE_PATH := "user://drivn.save"

var passed: int = 0
var failed: int = 0
var prior_scale: float = 1.0


func _check(label: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("PHYSICS_LAB: %s - %s" % ["PASS" if ok else "FAIL", label])


func _ready() -> void:
	print("PHYSICS_LAB: start")
	prior_scale = Engine.time_scale
	get_tree().create_timer(35.0, true, false, true).timeout.connect(func() -> void:
		Engine.time_scale = prior_scale
		print("PHYSICS_LAB: WATCHDOG")
		get_tree().quit(1))
	if not ResourceLoader.exists(LAB_PATH):
		_check("the standalone Physics Combat Lab scene exists", false)
		_finish()
		return
	var launcher_path: String = ProjectSettings.globalize_path("res://../PHYSICS_LAB.bat")
	_check("the standalone double-click launcher exists", FileAccess.file_exists(launcher_path))

	var save_stamp_before: int = FileAccess.get_modified_time(SAVE_PATH) \
		if FileAccess.file_exists(SAVE_PATH) else 0
	Engine.time_scale = 0.83
	var lab: Node3D = (load(LAB_PATH) as PackedScene).instantiate()
	add_child(lab)
	for _i in 6:
		await get_tree().physics_frame
	_check("the lab boots without a campaign menu",
		lab.find_children("*", "ProtoMenu", true, false).is_empty())
	_check("F1 controlled hybrid is the active body", String(lab.active_mode) == "hybrid")
	_check("the lab is explicitly save isolated", lab.get("save_isolated") == true)
	var station_names: Array = lab.stations.keys()
	_check("five named test stations are constructed", station_names.size() == 5
		and station_names.has("BODY LANE") and station_names.has("GRIP & GAZE RANGE")
		and station_names.has("DIVE & THROW LANE") and station_names.has("KILLHOUSE")
		and station_names.has("VEHICLE DAMAGE BAY"))
	_check("HUD surfaces controls and mode keys",
		String(lab.hud.controls_text).contains("WASD")
		and String(lab.hud.controls_text).contains("F1"))

	var start: Vector3 = lab.player.global_position
	lab.feed_for_test({"keyboard": {"move": Vector2(0, -1),
		"aim_world": Vector3.FORWARD, "sprint": false}})
	for _i in 75:
		await get_tree().physics_frame
	lab.feed_for_test({"keyboard": {"move": Vector2.ZERO,
		"aim_world": Vector3.FORWARD}})
	_check("a fed shared command moves the real F1 player",
		lab.player.global_position.distance_to(start) > 1.0)

	lab.player.global_position = Vector3(99, 5, 99)
	lab.character.hp = 17.0
	lab.adapter.weapon.mag = 1
	lab.reset_station()
	_check("reset restores the station transform",
		lab.player.global_position.distance_to(lab.station_spawn.origin) < 0.05)
	_check("reset restores health and ammunition",
		is_equal_approx(lab.character.hp, 100.0)
		and lab.adapter.weapon.mag == int(lab.adapter.weapon.info()["mag_size"]))
	var metrics: Dictionary = lab.adapter.metrics()
	_check("HUD-facing hybrid telemetry is finite",
		bool(metrics.get("finite", false)) and metrics.has("grip_left_cm")
		and metrics.has("speed"))

	var save_stamp_after: int = FileAccess.get_modified_time(SAVE_PATH) \
		if FileAccess.file_exists(SAVE_PATH) else 0
	_check("boot, movement, and reset never touch the campaign save",
		save_stamp_after == save_stamp_before)
	lab.queue_free()
	await get_tree().process_frame
	_check("lab exit restores the exact prior time scale",
		absf(Engine.time_scale - 0.83) < 0.001)
	Engine.time_scale = prior_scale
	_finish()


func _finish() -> void:
	Engine.time_scale = prior_scale
	print("PHYSICS_LAB RESULTS: %d passed, %d failed" % [passed, failed])
	print("PHYSICS_LAB: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
