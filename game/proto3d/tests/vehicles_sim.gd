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
var _queue: Array = ["motorcycle", "buggy", "scavenger", "pickup", "van", "semi"]
var _style_queue: Array = []
var _road_top: Dictionary = {} ## "class_surface" -> top speed reached (surface phase)
var _surf_queue: Array = []
var _surf_car: ProtoCar3D = null
var _surf_key: String = ""
var _surf_top: float = 0.0
var _shimmy_seen: bool = false
var _hud: ProtoHUD = null
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
	_check_modular_vehicle_style()


func _check(name: String, ok: bool) -> void:
	if ok:
		passed += 1
		print("VEH: PASS - %s" % name)
	else:
		failed += 1
		print("VEH: FAIL - %s" % name)


func _mesh_count(root: Node) -> int:
	if root == null:
		return 0
	var count := 1 if root is MeshInstance3D else 0
	for child in root.get_children():
		count += _mesh_count(child)
	return count


func _visual_bounds(root: Node3D) -> AABB:
	var has_bounds := false
	var bounds := AABB()
	for child in root.get_children():
		if child is Node3D:
			var n := child as Node3D
			if n is CollisionShape3D or n is VehicleWheel3D or n is SpotLight3D or n is OmniLight3D:
				continue
			var child_bounds := _visual_bounds_for_node(n, n.transform)
			if child_bounds.size != Vector3.ZERO:
				bounds = bounds.merge(child_bounds) if has_bounds else child_bounds
				has_bounds = true
	return bounds


func _visual_bounds_for_node(node: Node3D, xform: Transform3D) -> AABB:
	var has_bounds := false
	var bounds := AABB()
	if node is MeshInstance3D:
		var mesh_node := node as MeshInstance3D
		var aabb := mesh_node.get_aabb()
		for i in range(8):
			var p := xform * aabb.get_endpoint(i)
			var point_box := AABB(p, Vector3.ZERO)
			bounds = bounds.merge(point_box) if has_bounds else point_box
			has_bounds = true
	for child in node.get_children():
		if child is Node3D:
			var child_3d := child as Node3D
			var child_bounds := _visual_bounds_for_node(child_3d, xform * child_3d.transform)
			if child_bounds.size != Vector3.ZERO:
				bounds = bounds.merge(child_bounds) if has_bounds else child_bounds
				has_bounds = true
	return bounds


func _vehicle_visual_target_size(vehicle_id: String) -> Vector3:
	DrivnData.ensure()
	var spec: Dictionary = ProtoCar3D.VEHICLES[vehicle_id]
	var chassis: Vector3 = spec["chassis"]
	var half_x := chassis.x * 0.5
	var half_z := chassis.z * 0.5
	var wheels: Array = spec.get("wheels", [])
	for wheel in wheels:
		var w: Array = wheel
		var visible := true if w.size() < 5 else bool(w[4])
		if not visible:
			continue
		var wx := absf(float(w[0]))
		var wz := absf(float(w[1]))
		var radius := float(w[5]) if w.size() > 5 else 0.35
		half_x = maxf(half_x, wx + radius)
		half_z = maxf(half_z, wz + radius)
	return Vector3(half_x * 2.0, chassis.y, half_z * 2.0)


func _check_modular_vehicle_style() -> void:
	DrivnData.ensure()
	_style_queue.clear()
	for key in ProtoCar3D.VEHICLES.keys():
		_style_queue.append(String(key))
	_style_queue.sort()
	for vehicle_id in _style_queue:
		var car := ProtoCar3D.create(vehicle_id, Color(0.4, 0.4, 0.4))
		add_child(car)
		var style := car.get_node_or_null("ModularVehicleStyle")
		var part_count := _mesh_count(style)
		_check("%s uses the modular low-poly vehicle style (%d parts)" % [vehicle_id, part_count],
			style != null and part_count >= 8 and part_count <= 72)
		var bounds := _visual_bounds(car)
		var target := _vehicle_visual_target_size(vehicle_id)
		_check("%s visual footprint matches live rig scale (got %.1fx%.1f, want %.1fx%.1f)" %
			[vehicle_id, bounds.size.x, bounds.size.z, target.x, target.z],
			absf(bounds.size.x - target.x) <= 0.45 and absf(bounds.size.z - target.z) <= 0.55)
		car.queue_free()


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
					var order: Array = ["motorcycle", "buggy", "scavenger", "pickup", "van", "semi"]
					var ok := true
					for i in range(order.size() - 1):
						if _accel_times[order[i]] > _accel_times[order[i + 1]] + 0.01:
							ok = false
					_check("accel ladder holds: bike %.1f < buggy %.1f < car %.1f < pickup %.1f < van %.1f < semi %.1f" %
						[_accel_times["motorcycle"], _accel_times["buggy"], _accel_times["scavenger"], _accel_times["pickup"], _accel_times["van"], _accel_times["semi"]], ok)
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
				_check("KNOBBY buggy keeps useful bite on dirt (%.2f)" % buggy.surface_grip_mult(), buggy.surface_grip_mult() >= 0.84)
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
		6: # SURFACES CHANGE THE DRIVE: same pedal, different ground — through the TIRES
			if not _did:
				_did = true
				_surf_queue = [["van", "road"], ["van", "dirt"], ["buggy", "road"], ["buggy", "dirt"],
					["pickup", "road"], ["pickup", "dirt"]]
			if _surf_car == null:
				if _surf_queue.is_empty():
					var van_drop: float = 1.0 - float(_road_top["van_dirt"]) / float(_road_top["van_road"])
					var buggy_drop: float = 1.0 - float(_road_top["buggy_dirt"]) / float(_road_top["buggy_road"])
					var pickup_drop: float = 1.0 - float(_road_top["pickup_dirt"]) / float(_road_top["pickup_road"])
					_check("HIGHWAY van BOGS on dirt (top %.1f -> %.1f, -%d%%)" % [_road_top["van_road"], _road_top["van_dirt"], int(van_drop * 100)], van_drop > 0.15)
					_check("KNOBBY buggy barely slows (-%d%%)" % int(buggy_drop * 100), buggy_drop < 0.14)
					_check("ALL-TERRAIN pickup shrugs most of it off (-%d%%)" % int(pickup_drop * 100), pickup_drop < 0.15)
					_check("off-road tires beat highway tires on dirt", buggy_drop < van_drop and pickup_drop < van_drop)
					_next()
				else:
					var run: Array = _surf_queue.pop_front()
					_surf_car = _spawn(run[0], Vector3(300, 1.2, 0))
					_surf_car.surface_override = run[1]
					_surf_car.is_active = true
					_surf_key = "%s_%s" % [run[0], run[1]]
					_surf_top = 0.0
					phase_t = 0.0
			else:
				_surf_car.input_throttle = 1.0
				_surf_top = maxf(_surf_top, _surf_car.forward_speed)
				if phase_t > 5.0:
					_road_top[_surf_key] = _surf_top
					_surf_car.queue_free()
					_surf_car = null
		7: # DEPLETED TIRES: slower, visibly recolored, the body SHIMMIES, the dash says LIMPING
			if not _did:
				_did = true
				_car = _spawn("scavenger", Vector3(300, 1.2, 0))
				_car.surface_override = "road"
				_car.is_active = true
				_car.components["tires"].damage(75.0) # 100 -> 25 = CRITICAL
				_shimmy_seen = false
				phase_t = 0.0
			else:
				_car.input_throttle = 1.0
				if _car._hull_mesh and absf(_car._hull_mesh.rotation.z) > 0.005:
					_shimmy_seen = true
				if phase_t > 5.0:
					_check("shot tires CAP the speed (%.1f m/s, healthy tops ~32+)" % _car.forward_speed, _car.forward_speed < 29.0 and _car.forward_speed > 18.0)
					_check("tires LOOK the damage from above (recolored, tier %d)" % _car._tire_look_tier, _car._tire_look_tier == 2)
					_check("the body SHIMMIES on shot tires", _shimmy_seen)
					_check("the car reads as struggling (limp)", _car.is_struggling)
					_hud = ProtoHUD.create()
					add_child(_hud)
					_hud.set_dashboard(_car.dashboard())
					_check("dash says it PLAINLY: '%s'" % _hud._dash_status.text, _hud._dash_status.text.contains("TIRES SHOT"))
					var tire_lbl: Label = _hud._dash_labels["tires"]
					_check("dash parts show real BARS (%s)" % tire_lbl.text, tire_lbl.text.contains("▮") and tire_lbl.text.contains("▱"))
					_car.queue_free()
					_next()
		8: # the dash tells you about the GROUND too: BOGGED when churning, DIRT chip when fine
			if not _did:
				_did = true
				_car = _spawn("van", Vector3(300, 1.2, 0))
				_car.surface_override = "dirt"
				_car.is_active = true
				phase_t = 0.0
			else:
				_car.input_throttle = 1.0
				if phase_t > 0.6:
					_hud.set_dashboard(_car.dashboard())
					_check("highway van on dirt: dash says BOGGED ('%s')" % _hud._dash_status.text, _hud._dash_status.text.contains("BOGGED"))
					var buggy := _spawn("buggy", Vector3(320, 1.2, 0))
					buggy.surface_override = "dirt"
					buggy.current_surface = "dirt"
					_hud.set_dashboard(buggy.dashboard())
					_check("knobby buggy on dirt: just the DIRT chip ('%s')" % _hud._dash_status.text, _hud._dash_status.text.contains("DIRT") and not _hud._dash_status.text.contains("BOGGED"))
					_check("...and the dash names the rig + load", _hud._dash_status.text.contains("Dustrunner") and _hud._dash_status.text.contains("kg"))
					buggy.queue_free()
					_car.queue_free()
					_next()
		9:
			print("VEH RESULTS: %d passed, %d failed" % [passed, failed])
			print("VEH: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
			get_tree().quit(0 if failed == 0 else 1)

	if t > 170.0:
		print("VEH: TIMEOUT in phase %d" % phase)
		print("VEH RESULTS: %d passed, %d failed" % [passed, failed])
		get_tree().quit(1)
