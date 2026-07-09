## Proof for THE FAILURE LADDER (NAVIGATION.md §5 — NEVER A STATUE): a wall
## dropped ACROSS the walker's path mid-journey → the ladder fires (sidestep /
## detour / re-plan), the walker still arrives, and it is never motionless —
## the motorist's stand-forever is outlawed and this sim is the law's receipt.
## Run: godot --headless --path game res://proto3d/tests/nav_walk_block_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node = null


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("NAVB: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _finish(prev_scale: float) -> void:
	Engine.time_scale = prev_scale
	print("NAVB RESULTS: %d passed, %d failed" % [passed, failed])
	print("NAVB: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)


func _ready() -> void:
	print("NAVB: start")
	var prev_scale := Engine.time_scale
	Engine.time_scale = 1.0
	get_tree().create_timer(200.0).timeout.connect(func() -> void:
		print("NAVB: WATCHDOG")
		failed += 1
		_finish(prev_scale))

	main = load("res://proto3d/proto3d.tscn").instantiate()
	add_child(main)
	for i in range(40):
		await get_tree().physics_frame
	var jd: ProtoJourneys = main.journeys
	var town: Dictionary = {}
	for t in main.stream.usmap.towns:
		if String(t["id"]) == "meridian":
			town = t

	var w := CharacterBody3D.new()
	var col := CollisionShape3D.new()
	var cap := CapsuleShape3D.new()
	cap.radius = 0.32
	cap.height = 1.7
	col.shape = cap
	col.position.y = 0.85
	w.add_child(col)
	main.add_child(w)
	w.global_position = Vector3(104, 0.4, -318) # staged start (the documented exception)
	for i in range(4):
		await get_tree().physics_frame

	var jid := jd.start_walk(w, town, "meridian-church", 0.5, 2.2)
	_check("the journey starts", jid != "")
	var arr := {"v": false}
	jd.journey_arrived.connect(func(id: String) -> void:
		if id == jid:
			arr["v"] = true)

	# let it commit to a path, then DROP A WALL dead ahead of the walker
	for i in range(90):
		await get_tree().physics_frame
	var heading := Vector3(w.velocity.x, 0, w.velocity.z).normalized()
	var wall_c := w.global_position + heading * 4.0
	var perp := Vector3(-heading.z, 0, heading.x)
	var wall: Array = []
	for k in range(-2, 3):
		var box := StaticBody3D.new()
		var bcol := CollisionShape3D.new()
		var bs := BoxShape3D.new()
		bs.size = Vector3(1.6, 2.0, 1.6)
		bcol.shape = bs
		box.add_child(bcol)
		var bm := MeshInstance3D.new()
		var bmesh := BoxMesh.new()
		bmesh.size = bs.size
		bm.mesh = bmesh
		box.add_child(bm)
		main.add_child(box)
		box.global_position = wall_c + perp * (1.6 * float(k)) + Vector3(0, 1.0, 0)
		wall.append(box)
	print("NAVB: wall of %d dropped at %s" % [wall.size(), wall_c])

	var rec0: int = jd.total_recoveries
	var frames := 0
	var motionless := 0.0
	var worst_still := 0.0
	var last := w.global_position
	while not bool(arr["v"]) and frames < 9000:
		await get_tree().physics_frame
		frames += 1
		var d := w.global_position.distance_to(last)
		motionless = (motionless + get_physics_process_delta_time()) if d < 0.002 else 0.0
		worst_still = maxf(worst_still, motionless)
		last = w.global_position
	_check("the walker STILL ARRIVES despite the wall (%d frames)" % frames, bool(arr["v"]))
	_check("the ladder FIRED on the blockage (%d recoveries)" % (jd.total_recoveries - rec0),
		jd.total_recoveries - rec0 >= 1)
	_check("NEVER A STATUE — worst motionless streak %.1f s < 5.0" % worst_still, worst_still < 5.0)
	for b in wall:
		b.queue_free()
	w.queue_free()
	_finish(prev_scale)
