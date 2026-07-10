## Gaze direction and distance are measured independently. This sim must never
## "fix" visibility constants merely to make a target read visible.
## Run: Godot --headless --path game res://proto3d/tests/fov_direction_sim.tscn
extends Node

const DIAGNOSTICS_PATH := "res://proto3d/tools/physics_lab/lab_diagnostics.gd"
const LAB_PATH := "res://proto3d/tools/physics_combat_lab.tscn"
const EXPECTED_DISTANCES: Array[int] = [5, 10, 20, 30, 50, 75, 100, 150, 240]

var passed: int = 0
var failed: int = 0


func _check(label: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("FOV_DIRECTION: %s - %s" % ["PASS" if ok else "FAIL", label])


func _ready() -> void:
	print("FOV_DIRECTION: start")
	get_tree().create_timer(40.0).timeout.connect(func() -> void:
		print("FOV_DIRECTION: WATCHDOG")
		get_tree().quit(1))
	if not ResourceLoader.exists(DIAGNOSTICS_PATH):
		_check("the lab diagnostics component exists", false)
		_finish()
		return
	var lab: Node3D = (load(LAB_PATH) as PackedScene).instantiate()
	add_child(lab)
	for _i in 6:
		await get_tree().physics_frame

	var distances: Array[int] = []
	for raw_distance in lab.gaze_targets:
		distances.append(int(raw_distance))
	distances.sort()
	_check("gaze station has every authored distance target", distances == EXPECTED_DISTANCES)
	_check("gaze station constructs a wall and movable door",
		lab.gaze_wall != null and lab.gaze_door != null)

	lab.adapter.reset_at(Transform3D(Basis.IDENTITY, lab.gaze_origin))
	lab.set_target_distance(20)
	await get_tree().physics_frame
	var vision: Dictionary = {"forward": Vector3.FORWARD, "gaze": Vector3.FORWARD,
		"weapon": Vector3.RIGHT, "cone_direction": Vector3.FORWARD,
		"source": "mouse", "range": 100.0, "half_angle_deg": 55.0,
		"fade_member": true, "transparency": 0.15, "look_age": 0.1}
	lab.set_gaze_door(false)
	await get_tree().physics_frame
	var blocked: Dictionary = lab.diagnostics.snapshot(lab.adapter,
		lab.active_gaze_target, lab.camera, vision)
	lab.set_gaze_door(true)
	await get_tree().physics_frame
	var open: Dictionary = lab.diagnostics.snapshot(lab.adapter,
		lab.active_gaze_target, lab.camera, vision)
	_check("closed/open door produces a real LOS transition (closed %s %.1fm, open %s %.1fm)" % [
		str(blocked["los"]), float(blocked["los_distance"]),
		str(open["los"]), float(open["los_distance"])],
		not bool(blocked["los"]) and bool(open["los"]))
	_check("distance and camera projection facts are finite",
		is_finite(float(open["distance"])) and (open["screen_position"] as Vector2).is_finite()
		and open.has("on_screen") and open.has("camera_behind"))
	_check("visible head yaw and cone yaw agree within two degrees",
		absf(float(open["head_yaw_deg"]) - float(open["cone_yaw_deg"])) <= 2.0)
	_check("weapon aim can exceed the neck without moving the cone",
		absf(float(open["weapon_yaw_deg"]) - float(open["head_yaw_deg"])) > 60.0
		and absf(float(open["cone_yaw_deg"]) - float(open["head_yaw_deg"])) <= 2.0)
	var named_sources: Array[String] = []
	for source in ["turn", "mouse", "right_stick", "returning"]:
		vision["source"] = source
		named_sources.append(String(lab.diagnostics.snapshot(lab.adapter,
			lab.active_gaze_target, lab.camera, vision)["source"]))
	_check("turn, mouse, right-stick, and returning sources stay named",
		named_sources == ["turn", "mouse", "right_stick", "returning"])
	_check("snapshot exposes cone, fade, transparency, grip, and performance facts",
		open.has("in_cone") and open.has("fade_member") and open.has("transparency")
		and open.has("grip_left_cm") and open.has("physics_ms"))
	var original_fov: float = lab.camera.fov
	lab.toggle_day_night()
	lab.toggle_dust()
	lab.toggle_headlights()
	lab.toggle_binoculars()
	lab.toggle_camera_zoom()
	lab.cycle_target_distance(1)
	_check("station toggles surface night, dust, lights, binoculars, zoom, and range",
		lab.gaze_night and lab.gaze_dust and lab.gaze_headlights
		and lab.gaze_binoculars and lab.gaze_zoomed and lab.camera.fov < original_fov
		and lab.gaze_target_distance == 30)

	for mode in ["hybrid", "active_ragdoll", "full_physics"]:
		lab.switch_mode(mode)
		await get_tree().physics_frame
		lab.diagnostics.set_xray(true, lab.adapter)
		lab.diagnostics.update_xray(lab.adapter)
		var xray: Dictionary = lab.diagnostics.xray_facts()
		_check("%s exposes equivalent labeled X-ray geometry" % mode,
			String(xray.get("mode", "")) == mode
			and int(xray.get("line_count", 0)) >= 3
			and int(xray.get("label_count", 0)) >= 5
			and bool(xray.get("visible", false)))
	lab.diagnostics.set_xray(false, lab.adapter)
	_check("X-ray disables both visibility and update work",
		not bool(lab.diagnostics.xray_facts().get("visible", true))
		and not lab.diagnostics.updates_enabled())
	lab.queue_free()
	_finish()


func _finish() -> void:
	print("FOV_DIRECTION RESULTS: %d passed, %d failed" % [passed, failed])
	print("FOV_DIRECTION: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
