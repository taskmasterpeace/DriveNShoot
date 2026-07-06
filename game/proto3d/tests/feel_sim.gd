## Proof for the FEEL slice (goal: "on-foot + night look like a real 3D game"):
## 1) THE POKÉMON FIX — on foot the camera holds a real 3D pitch (~50°), while
##    driving keeps the GTA2 near-top-down. 2) NIGHT FLOOR — a new-moon midnight
## keeps a sliver of light and sight (moody, never blind).
## Run: godot --headless --path game res://proto3d/tests/feel_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node3D


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("FEEL: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _pitch_deg() -> float:
	var cam: Camera3D = get_viewport().get_camera_3d()
	var fwd: Vector3 = -cam.global_basis.z
	return rad_to_deg(asin(clampf(-fwd.y, -1.0, 1.0)))


func _ready() -> void:
	print("FEEL: start")
	get_tree().create_timer(60.0).timeout.connect(func() -> void:
		print("FEEL: WATCHDOG")
		print("FEEL: FAILURES PRESENT")
		get_tree().quit(1))
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 8:
		await get_tree().process_frame

	# --- DRIVING: GTA2 top-down stays -------------------------------------------
	# (spawn state IS driving)
	for _i in 4:
		await get_tree().physics_frame
	main.cam_rig.snap_to_target()
	for _i in 30:
		await get_tree().physics_frame
	var drive_pitch := _pitch_deg()
	_check("driving stays near top-down (pitch %.0f° > 66°)" % drive_pitch, drive_pitch > 66.0)

	# --- ON FOOT: the camera tilts into REAL 3D ----------------------------------
	main.mode = main.Mode.FOOT
	for _i in 4:
		await get_tree().physics_frame # let main push on_foot into the rig
	main.cam_rig.snap_to_target()
	for _i in 40:
		await get_tree().physics_frame
	var foot_pitch := _pitch_deg()
	_check("on foot the world is 3D again (pitch %.0f° in 35–62°)" % foot_pitch, foot_pitch >= 35.0 and foot_pitch <= 62.0)
	_check("foot pitch is clearly shallower than drive pitch", foot_pitch < drive_pitch - 8.0)

	# --- NIGHT FLOOR: new-moon midnight is moody, never blind --------------------
	var dn = main.daynight
	dn.hour = 0.0
	dn.moon_phase = 0.0 # worst case: new moon
	for _i in 3:
		await get_tree().physics_frame # _apply runs on the clock tick
	_check("new-moon sight floor ≥ 0.4 (was 0.32)", dn.vision_mult() >= 0.399)
	var sun: DirectionalLight3D = main._sun
	_check("new-moon moonlight energy ≥ 0.05 (was 0.015)", sun.light_energy >= 0.05)
	dn.moon_phase = 1.0
	for _i in 3:
		await get_tree().physics_frame
	_check("full moon is brighter than new moon", sun.light_energy > 0.1)

	print("FEEL RESULTS: %d passed, %d failed" % [passed, failed])
	print("FEEL: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
