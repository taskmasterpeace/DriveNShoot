## Proof for THE VISIBLE RIDER (owner: "I want to see a model on the motorcycle
## because we need the arm for aiming"): an exposed rig (rider_exposed row —
## the motorcycle) keeps the PUPPET in the saddle — visible, pinned, posed
## riding — and the AIM ARM tracks the mouse while armed, so a drive-by is a
## thing you SEE. Fire from the saddle is muzzle-true off the visible gun.
## Cab vehicles keep hiding the driver (no read through a roof — unchanged law).
## Run: godot --headless --path game res://proto3d/tests/bike_rider_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node3D


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("RIDER: %s - %s" % ["PASS" if ok else "FAIL", check_name])


class Dummy extends CharacterBody3D:
	var hp: float = 999.0
	var dead: bool = false
	func _init() -> void:
		add_to_group("combatant")
		var shape := CollisionShape3D.new()
		var cap := CapsuleShape3D.new()
		cap.radius = 0.4
		cap.height = 1.8
		shape.shape = cap
		shape.position.y = 0.9
		add_child(shape)
	func take_damage(amount: float) -> void:
		hp -= amount


func _ready() -> void:
	print("RIDER: start")
	get_tree().create_timer(120.0).timeout.connect(func() -> void:
		print("RIDER: WATCHDOG")
		print("RIDER: FAILURES PRESENT")
		get_tree().quit(1))
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 8:
		await get_tree().process_frame
	main._exit_car() # boot puts you in YOUR CAR — start on foot
	for _i in 6:
		await get_tree().physics_frame

	# --- Stage a bike on open ground (staging positions: the documented exception)
	var bike := ProtoCar3D.create("motorcycle", Color(0.5, 0.2, 0.2))
	main.add_child(bike)
	main.cars.append(bike)
	bike.global_position = main.player.global_position + Vector3(3.0, 0.6, 0)
	for _i in 6:
		await get_tree().physics_frame

	# --- 1. THE VISIBLE RIDER ------------------------------------------------------
	main.enter_car(bike)
	for _i in 12:
		await get_tree().physics_frame
	_check("mounting the BIKE keeps the puppet VISIBLE (rider_exposed row)", main.player.visible)
	_check("...pinned to the saddle (%.2fm from the bike)" % main.player.global_position.distance_to(bike.global_position),
		main.player.global_position.distance_to(bike.global_position) < 1.6)
	# ANIMATION_FIX_PACK_2 sign law: hips fold FORWARD (positive), the knee is
	# the elbow's mirror and flexes NEGATIVE — the old signs predate it.
	_check("...posed RIDING (hips folded onto the seat, %.2f rad)" % main.player.puppet.hip_l.rotation.x,
		main.player.puppet.hip_l.rotation.x > 0.7)
	_check("...knees gripping the tank (%.2f rad)" % main.player.puppet.knee_l.rotation.x,
		main.player.puppet.knee_l.rotation.x < -0.8)

	# --- 2. THE ARM AIMS (the whole point) ----------------------------------------
	main.backpack.add("pistol", 1)
	main.backpack.add("9mm", 30)
	main.use_item("pistol")
	var east: Vector3 = main.player.global_position + Vector3(30, 1.0, 0)
	main.aim_override = east - main.player.global_position
	for _i in 20:
		await get_tree().physics_frame
	_check("armed in the saddle raises the iron (gun visible in the hand)",
		main.player.puppet.gun.visible)
	var expect_yaw: float = ProtoPlayer3D._yaw_of(Vector3(1, 0, 0))
	var have_yaw: float = wrapf(main.player.puppet.aim_arm.rotation.y + main.player.puppet.rotation.y, -PI, PI)
	_check("the AIM ARM tracks the aim from the saddle (yaw %.2f vs %.2f)" % [have_yaw, expect_yaw],
		absf(wrapf(have_yaw - expect_yaw, -PI, PI)) < 0.35)

	# --- 3. FIRE FROM THE SADDLE is muzzle-true off the VISIBLE gun ----------------
	var mark := Dummy.new()
	main.add_child(mark)
	mark.global_position = main.player.global_position + Vector3(12, 0.1, 0)
	main.aim_override = mark.global_position + Vector3(0, 0.9, 0) - main.player.global_position
	for _i in 6:
		await get_tree().physics_frame
	var hp0: float = mark.hp
	for _try in 6: # squeeze through cooldown — spread is spread
		main._fire_from_seat()
		for _i in 22:
			await get_tree().physics_frame
		if mark.hp < hp0:
			break
	_check("a drive-by LANDS from the saddle (hp %.0f -> %.0f)" % [hp0, mark.hp], mark.hp < hp0)
	var muzzle: Vector3 = main.player.muzzle_world()
	_check("...and the shot leaves the puppet's REAL muzzle (%.1fm from the bike)" % muzzle.distance_to(bike.global_position),
		muzzle.distance_to(bike.global_position) < 3.0)

	# --- 4. DISMOUNT restores; a CAB shows the driver too (GLB body law 2026-07-14:
	# cabins wear real GLASS now — the puppet is SEEN at the wheel of every rig;
	# driver_visible_sim owns the deep checks, this guards the flip) ---------------
	main._exit_car()
	for _i in 8:
		await get_tree().physics_frame
	_check("stepping off restores the walker (visible + active)",
		main.player.visible and main.player.is_active)
	main.enter_car(main.cars[0]) # the scavenger — a roofed cab
	for _i in 6:
		await get_tree().physics_frame
	_check("a CAB shows the driver through the glass (GLB body law)", main.player.visible)
	main._exit_car()

	print("RIDER RESULTS: %d passed, %d failed" % [passed, failed])
	print("RIDER: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
