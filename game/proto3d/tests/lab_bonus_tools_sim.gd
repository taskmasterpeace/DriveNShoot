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
	var calibration_ui: bool = lab.hud.has_method("calibration_panel_facts")
	var calibration_facts: Dictionary = lab.hud.calibration_panel_facts() if calibration_ui else {}
	var calibration_fields: Array = calibration_facts.get("fields", [])
	var has_calibration_fields: bool = true
	for field_id in ["deadzone", "response_exponent", "aim_sensitivity",
		"trigger_threshold", "rumble", "hold_threshold"]:
		has_calibration_fields = has_calibration_fields and calibration_fields.has(field_id)
	_check("standalone lab exposes an interactive calibration panel with every tuning field",
		calibration_ui and has_calibration_fields)
	lab.calibration.deadzone = 0.20
	var calibrated_input: RefCounted = null
	lab.input_source.feed_for_test({"pad": {"move": Vector2(0.12, 0.0),
		"aim_world": Vector3.FORWARD}})
	calibrated_input = lab.input_source.sample(lab.camera, lab.player.global_position, 1.0 / 60.0)
	lab.input_source.clear_test_feed()
	_check("selected lab calibration normalizes the actual pad command path",
		calibrated_input != null and (calibrated_input.get("move") as Vector3).is_zero_approx())
	lab.calibration.trigger_threshold = 0.20
	lab.input_source.feed_for_test({"pad": {"move": Vector2.ZERO,
		"aim_world": Vector3.FORWARD, "right_trigger": 0.15, "fire": true}})
	var trigger_below: RefCounted = lab.input_source.sample(lab.camera,
		lab.player.global_position, 1.0 / 60.0)
	lab.input_source.feed_for_test({"pad": {"move": Vector2.ZERO,
		"aim_world": Vector3.FORWARD, "right_trigger": 0.55, "fire": false}})
	var trigger_above: RefCounted = lab.input_source.sample(lab.camera,
		lab.player.global_position, 1.0 / 60.0)
	_check("calibrated trigger threshold gates the real pad fire edge",
		not bool(trigger_below.get("fire_held")) and bool(trigger_above.get("fire_pressed")))
	lab.input_source.clear_test_feed()
	var original_move_left: Array[InputEvent] = InputMap.action_get_events("move_left")
	InputMap.action_erase_events("move_left")
	var rebound_left := InputEventKey.new()
	rebound_left.keycode = KEY_Q
	InputMap.action_add_event("move_left", rebound_left)
	Input.action_press("move_left", 1.0)
	await get_tree().process_frame
	var rebound_command: RefCounted = lab.input_source.sample(lab.camera,
		lab.player.global_position, 1.0 / 60.0)
	Input.action_release("move_left")
	var q_is_bound: bool = InputMap.action_get_events("move_left").any(
		func(event: InputEvent) -> bool:
			return event is InputEventKey and (event as InputEventKey).keycode == KEY_Q)
	InputMap.action_erase_events("move_left")
	for original_event in original_move_left:
		InputMap.action_add_event("move_left", original_event)
	_check("lab keyboard movement honors the live InputMap rebind (x %.2f)" %
		float((rebound_command.get("move") as Vector3).x),
		q_is_bound and float((rebound_command.get("move") as Vector3).x) < -0.9)
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
