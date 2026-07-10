## Regression proof for bounded driving gaze. A car may turn through any number
## of circles, but the driver's HEAD remains local to the vehicle: it looks into
## the turn, yields to active mouse/pad aim, and returns toward the road.
## Run: Godot --headless --path game res://proto3d/tests/drive_gaze_sim.tscn
extends Node

const GAZE_PATH := "res://proto3d/drive_gaze.gd"

var passed: int = 0
var failed: int = 0


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("DRIVE_GAZE: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _ready() -> void:
	print("DRIVE_GAZE: start")
	get_tree().create_timer(15.0).timeout.connect(func() -> void:
		print("DRIVE_GAZE: WATCHDOG")
		print("DRIVE_GAZE: FAILURES PRESENT")
		get_tree().quit(1))

	if not ResourceLoader.exists(GAZE_PATH):
		_check("the bounded driving-gaze component exists", false)
		_finish()
		return
	var gaze_script: Script = load(GAZE_PATH) as Script
	var gaze: Variant = gaze_script.new()
	var facing: Vector3 = Vector3.FORWARD

	# Ten seconds of a constant right-hand circle must never wind the neck.
	for _i in 600:
		facing = gaze.update(1.0 / 60.0, Basis.IDENTITY, -0.7,
			Vector3.ZERO, false, "turn")
	_check("a sustained circle cannot wind the neck (%.1f deg)" % rad_to_deg(gaze.local_yaw),
		absf(gaze.local_yaw) <= deg_to_rad(35.1))
	_check("turn anticipation is visibly rightward", gaze.local_yaw < deg_to_rad(-10.0))
	_check("resolved facing stays finite", facing.is_finite())

	# Releasing the turn returns forward instead of preserving accumulated yaw.
	for _i in 180:
		facing = gaze.update(1.0 / 60.0, Basis.IDENTITY, 0.0,
			Vector3.ZERO, false, "returning")
	_check("released turn returns the head forward (%.1f deg)" % rad_to_deg(gaze.local_yaw),
		absf(gaze.local_yaw) < deg_to_rad(2.0))
	_check("returned facing is the road", facing.dot(Vector3.FORWARD) > 0.999)

	# Active look owns gaze inside the anatomical neck arc.
	var aim_70: Vector3 = Vector3.FORWARD.rotated(Vector3.UP, deg_to_rad(70.0))
	for _i in 90:
		facing = gaze.update(1.0 / 60.0, Basis.IDENTITY, 0.0,
			aim_70, true, "mouse")
	_check("mouse aim owns the head (%.1f deg)" % rad_to_deg(gaze.local_yaw),
		gaze.local_yaw > deg_to_rad(65.0) and gaze.local_yaw <= deg_to_rad(80.0))
	_check("the gaze source is surfaced", gaze.source == "mouse")
	_check("resolved gaze follows the aimed side", facing.dot(aim_70) > 0.99)

	# A reticle behind the driver may exist, but the human neck may not follow it.
	var aim_150: Vector3 = Vector3.FORWARD.rotated(Vector3.UP, deg_to_rad(150.0))
	for _i in 90:
		facing = gaze.update(1.0 / 60.0, Basis.IDENTITY, 0.0,
			aim_150, true, "right_stick")
	_check("behind-the-seat aim clamps at the neck limit (%.1f deg)" % rad_to_deg(gaze.local_yaw),
		gaze.local_yaw <= deg_to_rad(80.1) and gaze.local_yaw >= deg_to_rad(78.0))
	_check("pad look uses the same gaze state", gaze.source == "right_stick")

	# Once look intent goes idle, the spring owns the return again.
	for _i in 180:
		facing = gaze.update(1.0 / 60.0, Basis.IDENTITY, 0.0,
			Vector3.ZERO, false, "returning")
	_check("idle aim returns forward (%.1f deg)" % rad_to_deg(gaze.local_yaw),
		absf(gaze.local_yaw) < deg_to_rad(2.0))
	_check("idle time is measurable", gaze.idle_s > 2.9)

	# Reset is exact so vehicle entry/switch cannot inherit the previous driver's head.
	gaze.reset()
	_check("reset clears yaw and velocity", is_zero_approx(gaze.local_yaw)
		and is_zero_approx(gaze.yaw_velocity) and gaze.source == "returning")

	# Integration: the real driving scene must consume this resolver for SIGHT,
	# while the reticle/weapon direction remains free inside its own seat law.
	var main: Node3D = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 8:
		await get_tree().process_frame
	var integrated_gaze: Variant = main.get("_drive_gaze")
	_check("the real driving scene owns a gaze resolver", integrated_gaze != null)
	if integrated_gaze == null:
		main.queue_free()
		_finish()
		return
	var car: ProtoCar3D = main.active_car
	_check("the integration test begins at the wheel", car != null and main.mode == main.Mode.DRIVE)

	integrated_gaze.reset()
	main.set("_drive_look_idle", 99.0)
	main.set("_drive_look_source", "returning")
	car.angular_velocity.y = -0.7
	for _i in 120:
		main._update_vision_cone(1.0 / 60.0, false)
	var gaze_world: Vector3 = integrated_gaze.update(0.0, car.global_basis,
		car.angular_velocity.y, Vector3.ZERO, false, "returning")
	var cone_dir: Vector2 = main.vision_cone.current_dir()
	_check("the driving cone reads the bounded head",
		cone_dir.dot(Vector2(gaze_world.x, gaze_world.z)) > 0.98)
	_check("real circle yaw stays inside the turn limit",
		absf(float(integrated_gaze.local_yaw)) <= deg_to_rad(35.1))

	# Mouse intent owns the head, but aiming behind may exceed the neck clamp.
	var car_forward: Vector3 = -car.global_basis.z
	var behind_aim: Vector3 = car_forward.rotated(Vector3.UP, deg_to_rad(150.0))
	main.aim_override = behind_aim
	main.set("_drive_look_idle", 0.0)
	main.set("_drive_look_source", "mouse")
	for _i in 120:
		main._update_vision_cone(1.0 / 60.0, false)
	var weapon_local: Vector3 = car.global_basis.inverse() * main.aim_direction()
	var weapon_yaw: float = atan2(-weapon_local.x, -weapon_local.z)
	_check("weapon aim remains independent beyond the neck",
		absf(weapon_yaw) > deg_to_rad(120.0)
		and absf(float(integrated_gaze.local_yaw)) <= deg_to_rad(80.1))

	# The visible rider uses the exact same local yaw as the cone resolver.
	var puppet := ProtoPuppet.create({})
	add_child(puppet)
	puppet.call("set_gaze_yaw", deg_to_rad(-42.0))
	_check("the puppet head exposes the resolved driving gaze",
		absf(puppet.neck.rotation.y - deg_to_rad(-42.0)) < 0.01)
	puppet.queue_free()
	main.queue_free()

	_finish()


func _finish() -> void:
	print("DRIVE_GAZE RESULTS: %d passed, %d failed" % [passed, failed])
	print("DRIVE_GAZE: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
