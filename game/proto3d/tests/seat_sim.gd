## Proof for SEAT ANCHORS (RV_PLAN): a rider boards a BED seat VISIBLE and
## parented to the rig — Sam gunning from the truck bed, the dog with its tail
## in the wind — and the gunner KEEPS FIRING as the rig drives. Cab riders hide.
## Run: godot --headless --path game res://proto3d/tests/seat_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node3D


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("SEAT: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _ready() -> void:
	print("SEAT: start")
	get_tree().create_timer(80.0).timeout.connect(func() -> void:
		print("SEAT: WATCHDOG")
		print("SEAT: FAILURES PRESENT")
		get_tree().quit(1))
	Engine.time_scale = 2.5
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 8:
		await get_tree().process_frame
	main._exit_car()

	# --- The pickup has BED seats (from its row) --------------------------------
	var truck := ProtoCar3D.create("pickup", Color(0.5, 0.3, 0.2))
	main.add_child(truck)
	truck.global_position = main.player.global_position + Vector3(6, 1, 0)
	main.cars.append(truck)
	_check("the pickup row carries BED seats", truck.spec.get("seats", []).size() >= 2)

	# --- Sam boards the bed: VISIBLE, parented, and STILL ARMED ------------------
	var sam := ProtoCompanion.create(main, "sam")
	main.add_child(sam)
	sam.global_position = truck.global_position + Vector3(1, 0.5, 0)
	main.companions.append(sam)
	var dog := ProtoDog.create(ProtoDog.DogType.HUNTER, "Ridealong", "Pointer")
	main.add_child(dog)
	dog.global_position = truck.global_position + Vector3(1.5, 0.4, 1)
	dog.adopted = true
	dog._main = main
	dog.state = ProtoDog.DogState.FOLLOW
	main.dogs.append(dog)
	main.all_dogs.append(dog)
	main.enter_car(truck)
	await get_tree().physics_frame
	_check("Sam rides the bed VISIBLE (the poster)", sam.riding_in == truck and sam.visible and sam.get_parent() == truck)
	_check("the DOG rides the bed VISIBLE too", dog.riding_in == truck and dog.visible and dog.get_parent() == truck)
	_check("riders are PARENTED to the rig (they move with it)", sam.get_parent() == truck and dog.get_parent() == truck)

	# --- The rig drives; the bed gunner keeps firing ----------------------------
	var sam_pos0: Vector3 = sam.global_position
	truck.global_position += Vector3(40, 0, 0) # (staging: the rig moves)
	await get_tree().physics_frame
	_check("the bed rider MOVES WITH the rig (%.0fm)" % sam.global_position.distance_to(sam_pos0),
		sam.global_position.distance_to(sam_pos0) > 30.0)
	# A threat beside the road — the bed gun answers.
	var lurk := ProtoLurker.create()
	main.add_child(lurk)
	lurk.global_position = truck.global_position + Vector3(0, 0.4, 8)
	var hp0: float = lurk.body.hp
	var t := 0.0
	while t < 6.0 and lurk.body.hp >= hp0:
		await get_tree().physics_frame
		t += get_physics_process_delta_time()
	_check("the bed GUN answers a roadside threat (hp %.0f → %.0f)" % [hp0, lurk.body.hp], lurk.body.hp < hp0)

	# --- Step out: riders unparent and land ---------------------------------------
	main._exit_car()
	await get_tree().physics_frame
	_check("stepping out UN-parents the riders", sam.get_parent() == main and dog.get_parent() == main)

	Engine.time_scale = 1.0
	print("SEAT RESULTS: %d passed, %d failed" % [passed, failed])
	print("SEAT: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
