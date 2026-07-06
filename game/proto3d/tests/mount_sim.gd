## Proof for VEHICLE WEAPON MOUNTS (user P5 ask; HANDOFF roadmap #5). The hood-MG
## fire/reload code was complete but DEAD-GATED — mount_weapon was never assigned.
## Now the mount_schematic item, USED at the wheel, bolts a car_mg on, activating
## the whole path. Run: godot --headless --path game res://proto3d/tests/mount_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node3D


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("MOUNT: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _ready() -> void:
	print("MOUNT: start")
	get_tree().create_timer(60.0).timeout.connect(func() -> void:
		print("MOUNT: WATCHDOG"); print("MOUNT: FAILURES PRESENT"); get_tree().quit(1))
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 8:
		await get_tree().process_frame
	main.daynight.hour = 0.0 # keep the howler target alive
	for _i in 2:
		await get_tree().physics_frame

	# --- On foot the schematic refuses (it bolts to a RIG) ----------------------
	main.mode = main.Mode.FOOT
	main.backpack.add("mount_schematic", 1)
	_check("on foot the schematic refuses (no rig)", not main.use_item("mount_schematic"))

	# --- At the wheel, USE bolts a hood MG on ------------------------------------
	main.mode = main.Mode.DRIVE
	main.active_car = main.cars[0]
	_check("rig starts with NO mount (was dead-gated)", main.active_car.mount_weapon == null)
	var ok: bool = main.use_item("mount_schematic")
	_check("USE mount_schematic bolts a car_mg on", ok and main.active_car.mount_weapon != null and main.active_car.mount_weapon.id == "car_mg")
	_check("a second schematic refuses (already mounted)", not main.use_item("mount_schematic"))

	# --- The now-live fire path damages a target ahead --------------------------
	main.active_car.mount_weapon.mag = 40
	var howl := ProtoHowler.create(main)
	main.add_child(howl)
	var fwd: Vector3 = main.active_car.facing()
	howl.global_position = main.active_car.global_position + fwd * 7.0 + Vector3(0, 0.4, 0)
	for _i in 3:
		await get_tree().physics_frame
	var hp0: float = howl.body.hp
	for _i in 6: # spread means not every ray connects — empty a burst
		main.active_car.mount_weapon._cd = 0.0
		main.fire_mount()
		await get_tree().physics_frame
	_check("the mounted MG deals damage down the road", not is_instance_valid(howl) or howl.body.hp < hp0)
	_check("firing burned the mag (40 → %d)" % main.active_car.mount_weapon.mag, main.active_car.mount_weapon.mag < 40)

	print("MOUNT RESULTS: %d passed, %d failed" % [passed, failed])
	print("MOUNT: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
