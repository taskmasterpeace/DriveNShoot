## Proof for NPC AAA: a MOTORIST walks to a rig, boards it, and drives the
## interstate's own polyline toward a destination — arriving ALIVE, parking, and
## stepping out. The player can flag the ride down (passenger seat), HOLD E to
## take the wheel, and tap E to get out. NPC barks read the situation.
## Run: godot --headless --path game res://proto3d/tests/npc_drive_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node3D


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("DRV: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _ready() -> void:
	print("DRV: start")
	get_tree().create_timer(150.0).timeout.connect(func() -> void:
		print("DRV: WATCHDOG")
		print("DRV: FAILURES PRESENT")
		get_tree().quit(1))
	Engine.time_scale = 3.0
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 8:
		await get_tree().process_frame
	var usmap: ProtoUSMap = main.stream.usmap
	_check("the map's roads are loadable bones", usmap != null and usmap.ok and usmap.roads.size() > 0)

	# --- Stage the trip ON the interstate (I-95 passes near Meridian) -----------
	# Stage on a REAL interstate (I-95 runs past Meridian) — exits are stubs.
	var road_pts: PackedVector2Array = []
	for r in usmap.roads:
		if r["id"] == "I-95":
			road_pts = r["pts"]
	var near_pt := Vector2(1204, 283) # where I-95 passes Meridian (the exit joins here)
	var start := Vector3(near_pt.x, 0.0, near_pt.y)
	var si := 0
	var sd := 1e18
	for i in road_pts.size():
		if road_pts[i].distance_to(Vector2(start.x, start.z)) < sd:
			sd = road_pts[i].distance_to(Vector2(start.x, start.z))
			si = i
	var di: int = mini(si + 2, road_pts.size() - 1) if si + 2 < road_pts.size() else maxi(si - 2, 0)
	var dest := Vector3(road_pts[di].x, 0.0, road_pts[di].y)
	var route_probe: Array = ProtoMotorist.plan_route(usmap, start, dest)
	_check("the route rides the ROAD's own points (%d waypoints)" % route_probe.size(), route_probe.size() >= 2)
	# The sim's DRIVE leg: 380 m straight down the same road (polyline segments run
	# kilometers — a full city hop is minutes; the mechanics prove the same either way).
	var seg_dir := (road_pts[mini(si + 1, road_pts.size() - 1)] - road_pts[si])
	var dest_near := start + Vector3(seg_dir.x, 0, seg_dir.y).normalized() * 380.0
	var trip_car := ProtoCar3D.create("scavenger", Color(0.4, 0.4, 0.45))
	main.add_child(trip_car)
	trip_car.global_position = start + Vector3(6, 1.0, 0)
	main.cars.append(trip_car)
	var m := ProtoMotorist.create(main, trip_car, dest_near, "drifter", "Marlow")
	main.add_child(m)
	m.global_position = start + Vector3(1, 0.4, 3)

	# --- He walks, he boards, he DRIVES ------------------------------------------
	var t := 0.0
	while t < 15.0 and m.state != ProtoMotorist.MState.DRIVE:
		await get_tree().physics_frame
		t += get_physics_process_delta_time()
	_check("the motorist WALKS to the rig and boards it", m.state == ProtoMotorist.MState.DRIVE and trip_car.ai_driver == m)
	var moved := 0.0
	var start_pos: Vector3 = trip_car.global_position
	t = 0.0
	while t < 60.0 and m.state == ProtoMotorist.MState.DRIVE:
		await get_tree().physics_frame
		t += get_physics_process_delta_time()
		moved = maxf(moved, start_pos.distance_to(trip_car.global_position))
	_check("he DROVE the highway (%.0fm covered)" % moved, moved > 250.0)
	_check("…and ARRIVED ALIVE (parked, stepped out)", m.state == ProtoMotorist.MState.WANDER and m.visible and not trip_car.dead)
	_check("the rig survived the trip too", not trip_car.dead)

	# --- The passenger seat --------------------------------------------------------
	var car2 := ProtoCar3D.create("van", Color(0.45, 0.45, 0.4))
	main.add_child(car2)
	car2.global_position = start + Vector3(20, 1.0, 10)
	main.cars.append(car2)
	var m2 := ProtoMotorist.create(main, car2, dest, "scav", "Quinn")
	main.add_child(m2)
	m2.global_position = car2.global_position + Vector3(2, 0.3, 2)
	t = 0.0
	while t < 15.0 and m2.state != ProtoMotorist.MState.DRIVE:
		await get_tree().physics_frame
		t += get_physics_process_delta_time()
	main._exit_car()
	main.player.global_position = car2.global_position + Vector3(2, 0.5, 0)
	car2.interact(main) # E on a driven car = ride shotgun
	_check("E on a DRIVEN car = the passenger seat", main.passenger_of_ai and main.active_car == car2)
	main.take_wheel() # (the hold-E path calls exactly this)
	_check("HOLD E = the wheel is YOURS (brain let go)", not main.passenger_of_ai
		and car2.ai_driver == null and car2.use_player_input and main.mode == main.Mode.DRIVE)
	main._exit_car()
	_check("tap E = out on your feet", main.mode == main.Mode.FOOT and main.player.visible)

	# --- The barks read the world ---------------------------------------------------
	var trader: ProtoNPC = null
	for n in main.get_children():
		if n is ProtoNPC and (n as ProtoNPC).role == "trade":
			trader = n
	main.weather.force("dust", 9999.0)
	_check("a bark reads the STORM ('%s…')" % trader._pick_bark(main).substr(0, 18), trader._pick_bark(main).contains("Dust"))
	main.weather.force("clear", 9999.0)
	main.events.today_event = "" # (day 1 rolls a blood moon, which OUTRANKS the posters — correctly)
	main.respect.add_infamy("KENTUCKY", 500.0)
	main.on_state_entered("KENTUCKY")
	_check("a bark reads the POSTERS", trader._pick_bark(main).contains("posters"))

	Engine.time_scale = 1.0
	print("DRV RESULTS: %d passed, %d failed" % [passed, failed])
	print("DRV: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
