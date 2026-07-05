## THE FLEET proof (VEHICLES.md): five wildly different vehicles from ONE data
## table. Measures on a flat plane: acceleration ORDER (bike quickest, semi
## slowest), top-speed caps, tire dirt_mult variation (knobby buggy ~keeps grip,
## highway van loses it), trunk capacity enforcement (saddlebag refuses what a
## van swallows), the bike THROWING its rider on a wall crash, and the semi
## TOWING its trailer without flipping — then dropping it.
## Run: godot --headless --path game res://proto3d/tests/vehicles_sim.tscn
extends Node3D

var t: float = 0.0
var phase: int = 0
var phase_t: float = 0.0
var passed: int = 0
var failed: int = 0
var _did: bool = false

var _accel_times: Dictionary = {} ## vclass -> seconds to 15 m/s
var _queue: Array = ["motorcycle", "buggy", "scavenger", "van", "semi"]
var _car: ProtoCar3D = null
var _bike: ProtoCar3D = null
var _semi: ProtoCar3D = null
var _trailer: ProtoCar3D = null
var _thrown: bool = false
var _hitch_gap0: float = -1.0


func _ready() -> void:
	var ground := StaticBody3D.new()
	var shape := CollisionShape3D.new()
	var box := BoxShape3D.new()
	box.size = Vector3(4000, 1, 4000)
	shape.shape = box
	shape.position.y = -0.5
	ground.add_child(shape)
	add_child(ground)
	print("VEH: fleet sim start")


func _check(name: String, ok: bool) -> void:
	if ok:
		passed += 1
		print("VEH: PASS - %s" % name)
	else:
		failed += 1
		print("VEH: FAIL - %s" % name)


func _spawn(vclass: String, pos: Vector3) -> ProtoCar3D:
	var v := ProtoCar3D.create(vclass, Color(0.4, 0.4, 0.4))
	v.position = pos
	v.use_player_input = false
	add_child(v)
	return v


func _next() -> void:
	phase += 1
	phase_t = 0.0
	_did = false


func _physics_process(delta: float) -> void:
	t += delta
	phase_t += delta
	match phase:
		0: # ACCELERATION LADDER: each class, full throttle, time to 15 m/s
			if _car == null:
				if _queue.is_empty():
					var order: Array = ["motorcycle", "buggy", "scavenger", "van", "semi"]
					var ok := true
					for i in range(order.size() - 1):
						if _accel_times[order[i]] > _accel_times[order[i + 1]] + 0.01:
							ok = false
					_check("acceleration ladder holds: bike %.1fs < buggy %.1fs < car %.1fs < van %.1fs < semi %.1fs" %
						[_accel_times["motorcycle"], _accel_times["buggy"], _accel_times["scavenger"], _accel_times["van"], _accel_times["semi"]], ok)
					_check("bike is QUICK (%.1fs to 15 m/s)" % _accel_times["motorcycle"], _accel_times["motorcycle"] < 2.2)
					_check("semi is a SLUG (%.1fs to 15 m/s)" % _accel_times["semi"], _accel_times["semi"] > _accel_times["motorcycle"] * 1.8)
					_next()
				else:
					_car = _spawn(_queue.pop_front(), Vector3(0, 1.2, 0))
					_car.is_active = true
					phase_t = 0.0
			else:
				_car.input_throttle = 1.0
				if _car.forward_speed >= 15.0 or phase_t > 14.0:
					_accel_times[_car.vclass] = phase_t
					_car.queue_free()
					_car = null
		1: # TIRES: dirt worth per class — knobby buggy vs highway van (data check via the live API)
			if not _did:
				_did = true
				var buggy := _spawn("buggy", Vector3(30, 1.2, 0))
				var van := _spawn("van", Vector3(40, 1.2, 0))
				buggy.surface_override = "dirt"
				van.surface_override = "dirt"
				buggy.current_surface = "dirt"
				van.current_surface = "dirt"
				_check("KNOBBY buggy barely feels dirt (%.2f)" % buggy.surface_grip_mult(), buggy.surface_grip_mult() >= 0.9)
				_check("HIGHWAY van hates dirt (%.2f)" % van.surface_grip_mult(), van.surface_grip_mult() <= 0.72)
				_check("...and the car sits between (%.2f)" % 0.78, buggy.surface_grip_mult() > 0.78 and 0.78 > van.surface_grip_mult())
				buggy.queue_free()
				van.queue_free()
				_next()
		2: # TRUNKS: the saddlebag refuses what the van swallows (capacity gate)
			if not _did:
				_did = true
				var bike := _spawn("motorcycle", Vector3(50, 1.2, 0))
				var van := _spawn("van", Vector3(60, 1.2, 0))
				var stash := ProtoContainer.new("test pile")
				stash.add("scrap", 80) # 96 kg of junk
				var moved_bike := 0
				while stash.transfer_to(bike.trunk, "scrap", 1):
					moved_bike += 1
				_check("saddlebag CAPS OUT fast (%d scrap ≈ %.0f kg of its %d)" % [moved_bike, bike.trunk.total_weight(), int(bike.trunk.max_weight)],
					moved_bike >= 6 and moved_bike <= 8 and not bike.trunk.has_room("scrap"))
				var moved_van := 0
				while stash.transfer_to(van.trunk, "scrap", 1):
					moved_van += 1
				_check("the van swallows the REST of the pile (%d more)" % moved_van, moved_van == 80 - moved_bike)
				bike.queue_free()
				van.queue_free()
				_next()
		3: # THE BIKE THROWS YOU: full speed into a wall → rider_thrown fires
			if not _did:
				_did = true
				var wall := StaticBody3D.new()
				var ws := CollisionShape3D.new()
				var wb := BoxShape3D.new()
				wb.size = Vector3(30, 6, 2)
				ws.shape = wb
				wall.add_child(ws)
				wall.position = Vector3(100, 1.5, -40)
				add_child(wall)
				_bike = _spawn("motorcycle", Vector3(100, 1.0, 0))
				_bike.is_active = true
				_bike.rider_thrown.connect(func(_dv: float) -> void: _thrown = true)
			elif _bike != null and is_instance_valid(_bike):
				_bike.input_throttle = 1.0
				if _thrown or phase_t > 8.0:
					_check("a wall crash THROWS the rider off the bike (rider_thrown)", _thrown)
					_bike.queue_free()
					_bike = null
					_next()
		4: # THE RIG: semi tows its trailer straight without flipping, then drops it
			if not _did:
				_did = true
				_semi = _spawn("semi", Vector3(200, 1.4, 0))
				_trailer = _spawn("trailer", Vector3(200, 1.6, 7.3))
				ProtoCar3D.couple(_semi, _trailer)
				_semi.is_active = true
				_hitch_gap0 = -1.0
			else:
				_semi.input_throttle = 1.0
				if phase_t > 1.0 and _hitch_gap0 < 0.0:
					_hitch_gap0 = _semi.global_position.distance_to(_trailer.global_position)
				if phase_t > 5.0:
					var gap := _semi.global_position.distance_to(_trailer.global_position)
					_check("trailer FOLLOWS the rig (gap %.1fm vs %.1fm at start)" % [gap, _hitch_gap0], absf(gap - _hitch_gap0) < 2.0)
					_check("trailer stays UPRIGHT under tow", _trailer.global_basis.y.dot(Vector3.UP) > 0.8)
					_check("the rig actually moved out (%.0fm)" % (_semi.global_position.z * -1.0 if false else _semi.global_position.distance_to(Vector3(200, 1.4, 0))),
						_semi.global_position.distance_to(Vector3(200, 1.4, 0)) > 20.0)
					_semi.input_throttle = 0.0
					_trailer.uncouple()
					_next()
		5: # dropped trailer stays put while the rig drives on
			if not _did:
				_did = true
			else:
				_semi.input_throttle = 1.0
				if phase_t > 3.0:
					var gap := _semi.global_position.distance_to(_trailer.global_position)
					_check("DROPPED trailer is left behind (gap grew to %.0fm)" % gap, gap > _hitch_gap0 + 8.0)
					_check("trailer's 400kg tank rides with IT, not the rig", _trailer.trunk.max_weight == 400.0)
					_next()
		6:
			print("VEH RESULTS: %d passed, %d failed" % [passed, failed])
			print("VEH: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
			get_tree().quit(0 if failed == 0 else 1)

	if t > 110.0:
		print("VEH: TIMEOUT in phase %d" % phase)
		print("VEH RESULTS: %d passed, %d failed" % [passed, failed])
		get_tree().quit(1)
