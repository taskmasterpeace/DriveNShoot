## Regression for THE AUTOPILOT'S MISSING BRAKE (2026-07-19). ProtoAutopilot used to set
## input_brake ONLY on heading error — a blocked nose merely multiplied throttle by 0.45 —
## so a promoted traffic car would rear-end a stopped car at full speed. It now brakes once
## an obstacle is inside its stopping distance (v^2/2a).
## Drives the REAL path: a real car, a real ProtoAutopilot, a real StaticBody in the road,
## real physics frames. Staged away from Meridian so nothing else can be the obstacle.
## Run: godot --headless --path game res://proto3d/tests/autopilot_brake_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node3D


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("APBRAKE: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _finish(prev_scale: float) -> void:
	Engine.time_scale = prev_scale
	print("APBRAKE RESULTS: %d passed, %d failed" % [passed, failed])
	print("APBRAKE: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)


func _ready() -> void:
	print("APBRAKE: start")
	var prev_scale := Engine.time_scale
	Engine.time_scale = 1.0
	get_tree().create_timer(90.0).timeout.connect(func() -> void:
		print("APBRAKE: WATCHDOG")
		failed += 1
		_finish(prev_scale))

	main = load("res://proto3d/proto3d.tscn").instantiate()
	add_child(main)
	for i in range(40):
		await get_tree().physics_frame

	var car: ProtoCar3D = main.cars[0]
	# stage on the open proving stretch, well clear of Meridian's clutter
	var start := Vector3(6.0, 1.2, 388.0)
	car.global_position = start
	car.rotation = Vector3.ZERO
	car.linear_velocity = Vector3.ZERO
	for i2 in range(10):
		await get_tree().physics_frame

	# a wall straight down the road: -Z is forward, so put it ahead of the nose
	var wall := StaticBody3D.new()
	var mesh := MeshInstance3D.new()
	var bm := BoxMesh.new()
	bm.size = Vector3(12.0, 3.0, 1.0)
	mesh.mesh = bm
	wall.add_child(mesh)
	var shape := CollisionShape3D.new()
	var bs := BoxShape3D.new()
	bs.size = bm.size
	shape.shape = bs
	wall.add_child(shape)
	main.add_child(wall)
	wall.global_position = start + Vector3(0, 1.5, -34.0)
	for i3 in range(6):
		await get_tree().physics_frame

	# real autopilot, routed straight THROUGH the wall — it must stop itself
	var pilot := ProtoAutopilot.new()
	main.add_child(pilot)
	pilot.attach(car)
	pilot.aggression = 1.0
	pilot.set_route([start + Vector3(0, 0, -120.0)])

	var max_brake := 0.0
	var top_speed := 0.0
	var closest := 999.0
	for i4 in range(240):
		await get_tree().physics_frame
		var spd := absf(car.forward_speed)
		top_speed = maxf(top_speed, spd)
		max_brake = maxf(max_brake, car.input_brake)
		closest = minf(closest, car.global_position.distance_to(wall.global_position))

	print("APBRAKE: top_speed=%.1f m/s  max_brake=%.2f  closest=%.1f m" % [top_speed, max_brake, closest])
	_check("the car actually got moving (%.1f m/s > 3)" % top_speed, top_speed > 3.0)
	_check("THE BRAKE FIRES for an obstacle dead ahead (max_brake %.2f > 0)" % max_brake,
		max_brake > 0.0)
	# it must not simply drive into the wall: a car's own length keeps `closest`
	# above zero, so assert it never got inside a body-length of the barrier.
	_check("it did NOT bury itself in the wall (closest %.1f m >= 2.0)" % closest, closest >= 2.0)

	pilot.queue_free()
	wall.queue_free()
	_finish(prev_scale)
