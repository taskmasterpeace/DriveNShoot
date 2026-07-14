## Proof for THE VISIBLE DRIVER (GLB body law, 2026-07-14): cabins wear authored
## glass now, so the puppet is SEEN at the wheel of every rig — roofed cab or
## saddle. Real main, real door (interact chain, never teleported state):
## enter a roofed car → player stays visible, pinned to the DRIVER seat, posed
## driving; exit → walks free; the bike keeps the saddle law + aim arm.
## Run: godot --headless --path game res://proto3d/tests/driver_visible_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node = null


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("DRIVERVIS: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _frames(n: int) -> void:
	for _i in n:
		await get_tree().physics_frame


func _finish(watchdog: bool = false) -> void:
	print("DRIVERVIS RESULTS: %d passed, %d failed%s" % [passed, failed, " (WATCHDOG)" if watchdog else ""])
	print("DRIVERVIS: %s" % ("ALL CHECKS PASSED" if failed == 0 and not watchdog else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 and not watchdog else 1)


func _ready() -> void:
	get_tree().create_timer(120.0).timeout.connect(func() -> void: _finish(true))
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	await _frames(8)
	if main.mode == 0 and main.active_car != null:
		main._exit_car()
		await _frames(4)
	# Isolated staging (test-standards): the proven quiet spot.
	main.player.global_position = Vector3(6, 0.35, 388)
	await _frames(2)

	# --- 1. ROOFED CAB: the driver is SEEN through the glass. --------------------
	var car := ProtoCar3D.create("scavenger", Color(0.4, 0.4, 0.45))
	main.add_child(car)
	car.global_position = main.player.global_position + Vector3(2.6, 0.6, 0)
	await _frames(3)
	car.interact(main) # the real door
	await _frames(6)
	_check("at the wheel of the roofed cab", main.mode == 0 and main.active_car == car)
	_check("the driver is VISIBLE behind the glass", main.player.visible)
	var seat_dist: float = main.player.global_position.distance_to(car.global_position)
	_check("the body sits IN the cab, not on the road (%.2fm from hull center)" % seat_dist, seat_dist < 2.0)
	var seat_local: Vector3 = car.to_local(main.player.global_position)
	_check("seated on the DRIVER side (left, x=%.2f)" % seat_local.x, seat_local.x < -0.1)
	# The pose engages within a few frames (direct joint writes).
	await _frames(10)
	var hip_x: float = main.player.puppet.hip_l.rotation.x
	_check("hips folded onto the bench (%.2f rad)" % hip_x, hip_x > 0.7)
	var knee_x: float = main.player.puppet.knee_l.rotation.x
	_check("knees toward the pedals (KNEE LAW, %.2f rad)" % knee_x, knee_x < -0.5)

	# --- 2. GLB body present on the rig (authored glass to be seen through). -----
	var style := car.get_node_or_null("ModularVehicleStyle")
	var glb := style.get_node_or_null("GlbBody") if style != null else null
	_check("the rig wears its authored GLB body", glb != null)

	# --- 3. OUT the door: the walker returns whole. -------------------------------
	main._exit_car()
	await _frames(6)
	_check("out of the car, on foot", main.mode != 0 or main.active_car == null)
	_check("still visible on foot", main.player.visible)
	car.queue_free()

	# --- 4. THE SADDLE LAW survives: bike rider still posed riding. ---------------
	var bike := ProtoCar3D.create("motorcycle", Color(0.3, 0.3, 0.3))
	main.add_child(bike)
	bike.global_position = main.player.global_position + Vector3(-2.6, 0.6, 0)
	await _frames(3)
	bike.interact(main)
	await _frames(10)
	_check("on the saddle", main.active_car == bike)
	_check("rider visible on the bike", main.player.visible)
	var bike_knee: float = main.player.puppet.knee_l.rotation.x
	_check("saddle pose engaged (knees folded, %.2f rad)" % bike_knee, bike_knee < -0.9)
	main._exit_car()
	await _frames(4)
	bike.queue_free()

	_finish()
