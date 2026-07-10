## Armed sprinting owns a tactical low-ready carry, driven by real sprint state.
## A fire press ends the sprint, raises inside 0.18 s, then accepts one shot.
## Run: Godot --headless --path game res://proto3d/tests/low_ready_sim.tscn
extends Node3D

var passed: int = 0
var failed: int = 0


func _check(label: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("LOW_READY: %s - %s" % ["PASS" if ok else "FAIL", label])


func _settle(p: ProtoPuppet, speed: float, sprint: bool, frames: int = 120) -> void:
	p.set("sprint_target", sprint)
	for _i in frames:
		p.animate(1.0 / 60.0, speed, 0.0, true, 0.0, false)


func _ready() -> void:
	print("LOW_READY: start")
	get_tree().create_timer(20.0).timeout.connect(func() -> void:
		print("LOW_READY: WATCHDOG")
		get_tree().quit(1))

	var pistol_pose: Dictionary = ProtoWeapon.WEAPONS["pistol"]["hand_pose"]
	_check("pistol row declares a tactical carry class",
		String(pistol_pose.get("carry_class", "")) == "pistol")
	_check("pistol row declares both grips and an elbow pole",
		pistol_pose.has("grip_l") and pistol_pose.has("grip_r")
		and pistol_pose.has("elbow_pole_l"))
	if not pistol_pose.has("carry_class"):
		_finish()
		return

	var p := ProtoPuppet.create({})
	add_child(p)
	await get_tree().process_frame
	p.callv("set_hand_pose", [pistol_pose["offset"], pistol_pose["two_handed"],
		pistol_pose["grip_l"], pistol_pose["grip_r"], pistol_pose["carry_class"],
		pistol_pose["elbow_pole_l"]])
	p.set_weapon_mesh(ProtoWeapon.shape("pistol")["parts"],
		float(ProtoWeapon.shape("pistol")["muzzle_z"]))
	p.set_armed(true)
	p.raised = true
	_settle(p, 0.0, false)
	var firing_dir: Vector3 = (p.muzzle_world() - p.gun.global_position).normalized()
	var firing_metrics: Dictionary = p.grip_metrics()
	_check("raised pistol plants both hands within 3 cm",
		float(firing_metrics["left_error_cm"]) < 3.0
		and float(firing_metrics["right_error_cm"]) < 3.0)

	_settle(p, 7.2, true)
	_check("full armed sprint reaches the sprint blend", float(p.get("sprint_blend")) > 0.9)
	_check("full armed sprint reaches low ready", float(p.get("low_ready_blend")) > 0.9)
	var low_dir: Vector3 = (p.muzzle_world() - p.gun.global_position).normalized()
	_check("low ready pitches the muzzle down from firing pose",
		low_dir.y < firing_dir.y - 0.20)

	_settle(p, 0.0, false, 30)
	_check("ending sprint raises the weapon before fire", float(p.get("low_ready_blend")) < 0.1)

	# Integration: a press at full low-ready cannot spend a round immediately,
	# but the queued shot crosses the raise gate well inside the 0.18 s cap.
	var main: Node3D = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 8:
		await get_tree().process_frame
	main.set_physics_process(false)
	if main.active_car != null:
		main._exit_car()
	main.mode = main.Mode.FOOT
	var pistol := ProtoWeapon.new("pistol")
	main.weapons = [pistol]
	main.equipped = 0
	main._apply_hand_pose(pistol)
	main.player._was_running = true
	main.player.puppet.set("sprint_target", true)
	main.player.puppet.set("low_ready_blend", 1.0)
	main.fire_equipped()
	_check("a sprint fire press does not shoot from low ready", pistol.mag == 12)
	main.player._was_running = false
	main.player.puppet.set("sprint_target", false)
	var elapsed: float = 0.0
	while pistol.mag == 12 and elapsed < 0.19:
		main.player.puppet.animate(1.0 / 60.0, 0.0, 0.0, true, 0.0, false)
		main._update_pending_fire(1.0 / 60.0)
		elapsed += 1.0 / 60.0
	_check("the queued shot raises and fires within 0.18 s (%.3f s)" % elapsed,
		pistol.mag == 11 and elapsed <= 0.181)

	main.queue_free()
	p.queue_free()
	_finish()


func _finish() -> void:
	print("LOW_READY RESULTS: %d passed, %d failed" % [passed, failed])
	print("LOW_READY: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
