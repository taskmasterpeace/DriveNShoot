## Bonus tools 4–7 must remain lab-only and measurable.
## Run: Godot --headless --path game res://proto3d/tests/lab_bonus_tools_sim.tscn
extends Node

const CALIBRATION_PATH := "res://proto3d/tools/physics_lab/lab_calibration.gd"
const SURFACE_PATH := "res://proto3d/tools/physics_lab/lab_surface.gd"
const CAMERA_WALL_PATH := "res://proto3d/tools/physics_lab/lab_camera_wall.gd"
const LAB_PATH := "res://proto3d/tools/physics_combat_lab.tscn"
const SURFACE_IDS: Array[String] = ["asphalt", "dirt", "wet", "mud", "gravel",
	"shallow_water", "low_friction_debug"]
const CONDITION_IDS: Array[String] = ["fresh", "overloaded", "hurt", "exhausted",
	"late_game_specialist"]

var passed: int = 0
var failed: int = 0


func _check(label: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("LAB_BONUS: %s - %s" % ["PASS" if ok else "FAIL", label])


func _ready() -> void:
	print("LAB_BONUS: start")
	get_tree().create_timer(45.0).timeout.connect(func() -> void:
		print("LAB_BONUS: WATCHDOG")
		get_tree().quit(1))
	if not ResourceLoader.exists(CALIBRATION_PATH) \
			or not ResourceLoader.exists(SURFACE_PATH) \
			or not ResourceLoader.exists(CAMERA_WALL_PATH):
		_check("calibration, surface, and camera tools exist", false)
		_finish()
		return

	var campaign_path := "user://input_overrides.json"
	var campaign_existed: bool = FileAccess.file_exists(campaign_path)
	var campaign_bytes: String = FileAccess.get_file_as_string(campaign_path) if campaign_existed else ""
	var calibration: RefCounted = load(CALIBRATION_PATH).new()
	calibration.begin_drift_sample(5.0)
	for i in 300:
		var angle: float = float(i) * 0.17
		calibration.sample({"left_stick": Vector2(cos(angle), sin(angle)) * 0.11,
			"right_stick": Vector2(0.07, -0.03), "left_trigger": 0.02,
			"right_trigger": 0.01}, 1.0 / 60.0)
	var drift: Dictionary = calibration.drift_result()
	_check("five-second drift sample recommends measured maximum plus margin (%s)" % str(drift),
		bool(drift.get("complete", false))
		and is_equal_approx(float(drift["max_rest_magnitude"]), 0.11)
		and is_equal_approx(float(drift["recommended_deadzone"]), 0.15))
	calibration.deadzone = float(drift["recommended_deadzone"])
	calibration.response_exponent = 1.35
	calibration.aim_sensitivity = 0.9
	calibration.trigger_threshold = 0.18
	calibration.rumble = 0.65
	calibration.hold_threshold = 0.18
	_check("recommended deadzone normalizes the measured drift to stable zero",
		calibration.normalize_stick(Vector2(0.11, 0.0)).is_zero_approx())
	var preset_name := "sim_%d" % Time.get_ticks_msec()
	_check("named calibration preset saves beneath the lab directory",
		calibration.save_preset(preset_name)
		and FileAccess.file_exists("user://physics_lab/input_presets.json"))
	_check("tap and hold grammar remains cycle versus radial",
		calibration.classify_hold(0.12) == "cycle"
		and calibration.classify_hold(0.24) == "radial")
	calibration.delete_preset(preset_name)
	var campaign_untouched: bool = FileAccess.file_exists(campaign_path) == campaign_existed
	if campaign_existed:
		campaign_untouched = campaign_untouched \
			and FileAccess.get_file_as_string(campaign_path) == campaign_bytes
	_check("lab presets never modify campaign input overrides", campaign_untouched)

	var surface: RefCounted = load(SURFACE_PATH).new()
	_check("surface carousel exposes every approved surface in order",
		surface.ids() == SURFACE_IDS)
	var stop_distances: Array[float] = []
	var slide_distances: Array[float] = []
	for id in SURFACE_IDS:
		var trace: Dictionary = surface.simulate_trace(id, 7.2)
		stop_distances.append(float(trace["stop_distance"]))
		slide_distances.append(float(trace["dive_slide_distance"]))
	_check("identical traces produce an authored stopping-distance order",
		stop_distances[5] < stop_distances[3] and stop_distances[3] < stop_distances[0]
		and stop_distances[0] < stop_distances[1] and stop_distances[1] < stop_distances[4]
		and stop_distances[4] < stop_distances[2] and stop_distances[2] < stop_distances[6])
	_check("low-friction debug has the longest bounded dive slide",
		slide_distances[6] > slide_distances[2] and slide_distances[6] < 30.0)
	_check("surface rows expose the production vehicle traction result",
		(surface.row("mud")["vehicle_traction"] as Dictionary).has_all(["speed", "grip"]))
	_check("condition dial exposes every approved nonpersistent preset",
		surface.condition_ids() == CONDITION_IDS)

	var lab: Node3D = (load(LAB_PATH) as PackedScene).instantiate()
	add_child(lab)
	for _i in 6:
		await get_tree().physics_frame
	var baseline: Dictionary = lab.adapter.metrics().duplicate(true)
	lab.set_condition_preset("hurt")
	var hurt: Dictionary = lab.adapter.metrics()
	lab.set_condition_preset("fresh")
	var restored: Dictionary = lab.adapter.metrics()
	_check("hurt condition changes only the lab condition packet",
		String(hurt["condition"]) == "hurt" and float(hurt["stamina"]) < float(baseline["stamina"]))
	_check("one-action fresh reset restores the exact body baseline",
		String(restored["condition"]) == "fresh"
		and is_equal_approx(float(restored["stamina"]), float(baseline["stamina"])))
	for mode in ["hybrid", "active_ragdoll", "full_physics"]:
		lab.switch_mode(mode)
		lab.set_surface("wet")
		lab.set_condition_preset("overloaded")
		_check("%s consumes the shared surface and condition packet" % mode,
			String(lab.adapter.condition["id"]) == "overloaded"
			and String(lab.adapter.surface["id"]) == "wet")

	lab.camera_wall.set_subject(lab.player)
	lab.camera_wall.set_visible(true)
	for _i in 3:
		await get_tree().process_frame
	var camera_facts: Dictionary = lab.camera_wall.facts()
	_check("Camera Truth Wall owns five synchronized named viewports",
		int(camera_facts["viewport_count"]) == 5
		and (camera_facts["names"] as Array) == ["top_down_drive", "on_foot_3d",
			"chase_candidate", "high_tactical", "broadcast"])
	var isolated: bool = lab.camera.current
	for camera in lab.camera_wall.cameras().values():
		isolated = isolated and (camera as Camera3D).get_viewport() != lab.get_viewport()
	_check("truth-wall cameras never replace the gameplay camera", isolated)
	lab.camera_wall.set_preset("muzzle_flash")
	_check("camera wall surfaces the selected lighting/readability preset",
		String(lab.camera_wall.facts()["preset"]) == "muzzle_flash")
	lab.camera_wall.set_visible(false)
	var disabled: bool = true
	for viewport in lab.camera_wall.viewports().values():
		disabled = disabled and (viewport as SubViewport).render_target_update_mode \
			== SubViewport.UPDATE_DISABLED
	_check("hidden camera wall disables all viewport updates", disabled)
	lab.queue_free()
	_finish()


func _finish() -> void:
	print("LAB_BONUS RESULTS: %d passed, %d failed" % [passed, failed])
	print("LAB_BONUS: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
