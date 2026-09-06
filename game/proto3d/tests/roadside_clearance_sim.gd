extends "res://proto3d/tests/road_surface_sim.gd"
## Independent footprint and physical-floor probes for the roadside decoration
## defect. The base road_surface_sim remains a separate broader failing gate.

func polygon(transform: Transform3D, size: Vector3) -> PackedVector2Array:
	var points := PackedVector2Array()
	for corner: Vector3 in [Vector3(-size.x,0,-size.z), Vector3(size.x,0,-size.z),
			Vector3(size.x,0,size.z), Vector3(-size.x,0,size.z)]:
		var point: Vector3 = transform * (corner * 0.5)
		points.append(Vector2(point.x,point.z))
	return points

func strip_fixture(label: String, obstacles: Array, want: Array, degenerate: bool = false) -> void:
	var chunk := Node3D.new()
	add_child(chunk)
	main.stream._build_roadside_strip(chunk,Vector2.ZERO,Vector2.ZERO if degenerate else Vector2(0,100),
		2,1,0.5,Color.WHITE,"roadside_fence","fixture",true,obstacles)
	var actual: Array = []
	for body: Node3D in chunk.get_children():
		for node: Node in body.get_children():
			if node is CollisionShape3D and node.shape is BoxShape3D:
				var shape := node as CollisionShape3D
				var size: Vector3 = shape.shape.size
				var first: Vector3 = shape.global_transform * Vector3(0,0,-size.z * 0.5)
				var last: Vector3 = shape.global_transform * Vector3(0,0,size.z * 0.5)
				actual.append(Vector2(first.z,last.z))
	var exact: bool = actual.size() == want.size()
	if exact:
		for i: int in want.size():
			exact = exact and (actual[i] as Vector2).distance_to(want[i]) < 0.002
	check("physical strip " + label + " retains the hand-derived clear intervals " + str(actual),exact)
	chunk.free()

func run_checks(slabs: Array[MeshInstance3D], at: Vector3) -> void:
	var asphalt: Array[PackedVector2Array] = []
	for slab: MeshInstance3D in slabs:
		asphalt.append(polygon(slab.global_transform, (slab.mesh as BoxMesh).size))
	# Observe the existing untagged town cross streets too. Literal mesh sizes
	# catch the regression BEFORE production adds any new metadata/helper.
	var local_streets: int = 0
	for chunk: Node3D in main.stream.loaded.values():
		for node: Node in chunk.get_children():
			if node is MeshInstance3D and node.mesh is BoxMesh:
				var size: Vector3 = node.mesh.size
				if size.is_equal_approx(Vector3(8,0.04,115.2)) or size.is_equal_approx(Vector3(115.2,0.04,8)):
					asphalt.append(polygon(node.global_transform,size))
					local_streets += 1
	check("actual town cross streets are included in clearance probes",local_streets >= 2)
	var counts: Dictionary = {}
	var collisions: Dictionary = {}
	var floating: int = 0
	var max_float: float = 0
	var ground_probes: Dictionary = {}
	var roadside_bodies: Array[RID] = []
	var endpoint_probes: int = 0
	var pitched_runs: int = 0
	var endpoint_failures: int = 0
	# Inspect the original streamed furniture. Its shoulder offsets can reach
	# just beyond the loaded floor ring. Supply those missing test-edge floors
	# using the REAL floor builder; do not silently skip a failed ground ray.
	var edge_floors: Dictionary = {}
	for chunk: Node3D in main.stream.loaded.values():
		for node: Node in chunk.get_children():
			if not node.has_meta("roadside_fence_post") and not node.has_meta("roadside_pole"):
				continue
			var point: Vector3 = (node as Node3D).global_position
			var cell := Vector2i(int(floor(point.x/128)),int(floor(point.z/128)))
			var floor_key := "%d,%d" % [cell.x,cell.y]
			if main.stream.loaded.has(floor_key) or edge_floors.has(floor_key):
				continue
			var center := Vector3((cell.x+0.5)*128,0,(cell.y+0.5)*128)
			var floor_body: StaticBody3D = main.stream._relief_floor(center,main.stream.biome_at(center))
			add_child(floor_body)
			edge_floors[floor_key] = floor_body
	await frames(3)
	for chunk: Node3D in main.stream.loaded.values():
		for node: Node in chunk.get_children():
			if node is CollisionObject3D and (node.has_meta("roadside_pole") or node.has_meta("roadside_fence") or node.has_meta("roadside_fence_post") or node.has_meta("road_guardrail")):
				roadside_bodies.append(node.get_rid())
	for chunk: Node3D in main.stream.loaded.values():
		for node: Node in chunk.get_children():
			var tag: String = ""
			for candidate: String in ["roadside_pole", "roadside_fence", "roadside_fence_post", "road_guardrail", "road_verge"]:
				if node.has_meta(candidate):
					tag = candidate
			if tag.is_empty():
				continue
			var size := Vector3.ZERO
			var transform: Transform3D = (node as Node3D).global_transform
			if node is MeshInstance3D and node.mesh is BoxMesh:
				size = node.mesh.size
			else:
				for child: Node in node.get_children():
					if child is CollisionShape3D and child.shape is BoxShape3D:
						size = child.shape.size
						transform = child.global_transform
			if size == Vector3.ZERO:
				continue
			counts[tag] = int(counts.get(tag,0)) + 1
			var footprint: PackedVector2Array = polygon(transform,size)
			for road: PackedVector2Array in asphalt:
				if not Geometry2D.intersect_polygons(footprint,road).is_empty():
					collisions[tag] = int(collisions.get(tag,0)) + 1
					break
			if tag in ["roadside_pole","roadside_fence_post"]:
				var foot: Vector3 = transform * Vector3(0,-size.y * 0.5,0)
				var query := PhysicsRayQueryParameters3D.create(foot + Vector3.UP * 2, foot - Vector3.UP * 30,1)
				query.exclude = roadside_bodies
				var hit: Dictionary = main.get_world_3d().direct_space_state.intersect_ray(query)
				if not hit.is_empty():
					ground_probes[tag] = int(ground_probes.get(tag,0)) + 1
					var gap: float = foot.y-(hit["position"] as Vector3).y
					max_float = maxf(max_float,maxf(0,gap))
					# A fence stake may be embedded in the triangulated floor. It
					# must not float or disappear: at least 0.5m remains visible.
					var grounded: bool = absf(gap) <= 0.25 if tag == "roadside_pole" else gap <= 0.25 and size.y+gap >= 0.5
					if not grounded:
						floating += 1
						print("ROADSIDE grounding discrepancy tag=%s foot=%s hit=%s collider=%s" % [tag,foot,hit["position"],(hit["collider"] as Node).get_path()])
				else:
					print("ROADSIDE missing floor tag=%s foot=%s floor_chunk_loaded=%s" % [tag,foot,main.stream.loaded.has("%d,%d" % [int(floor(foot.x/128)),int(floor(foot.z/128))])])
			if tag in ["roadside_fence","road_guardrail"] and (node as Node3D).global_position.distance_to(at) < 150:
				var endpoints: Array[Vector3] = [transform * Vector3(0,0,-size.z * 0.5),transform * Vector3(0,0,size.z * 0.5)]
				if absf(endpoints[1].y-endpoints[0].y) > 0.1:
					pitched_runs += 1
				for point: Vector3 in endpoints:
					var lift: float = 0.62 if tag == "roadside_fence" else 0.35
					var query := PhysicsRayQueryParameters3D.create(point+Vector3.UP * 5,point-Vector3.UP * 30,1)
					query.exclude = roadside_bodies
					var hit: Dictionary = main.get_world_3d().direct_space_state.intersect_ray(query)
					endpoint_probes += 1
					if hit.is_empty() or absf(point.y-lift-(hit["position"] as Vector3).y) > 0.25:
						endpoint_failures += 1
	print("ROADSIDE diagnostic counts=%s overlaps=%s grounded_probes=%s floating=%d max=%.3f pitched_runs=%d endpoints=%d/%d" % [counts,collisions,ground_probes,floating,max_float,pitched_runs,endpoint_probes-endpoint_failures,endpoint_probes])
	for tag: String in ["roadside_pole", "roadside_fence", "roadside_fence_post", "road_guardrail", "road_verge"]:
		check(tag + " remains present in the real roadscape", int(counts.get(tag,0)) >= 2)
		check(tag + " leaves every loaded asphalt slab clear", int(collisions.get(tag,0)) == 0)
	for tag: String in ["roadside_pole","roadside_fence_post"]:
		check("every " + tag + " has a successful actual floor probe", int(ground_probes.get(tag,0)) >= 2 and int(ground_probes.get(tag,0)) == int(counts.get(tag,0)))
	check("pole feet meet the floor and fence posts are grounded with visible height", floating == 0)
	check("physical endpoint probes include genuinely sloped rails",endpoint_probes >= 4 and pitched_runs >= 2)
	check("each sampled rail endpoint follows the physical ground exactly once",endpoint_failures == 0)
	for floor_body: StaticBody3D in edge_floors.values():
		floor_body.queue_free()
	# The previously recorded pole is on this real return-ramp line. Staging
	# sets only the starting pose; E enters and W drives through the obstacle.
	var blocked := Vector3(-56157.28,0,-17934.86)
	var direction := Vector3(0.93,0,0.37).normalized()
	var start: Vector3 = blocked - direction * 22
	var car: ProtoCar3D = ProtoCar3D.create("scavenger", Color(0.55,0.42,0.30))
	car.freeze = true
	main.add_child(car)
	main.cars.append(car)
	car.global_position = Vector3(start.x,ProtoWorldBuilder.ground_y(start.x,start.z)+1,start.z)
	car.rotation = Vector3(0,atan2(-direction.x,-direction.z),0)
	car.linear_velocity = Vector3.ZERO
	car.angular_velocity = Vector3.ZERO
	main.player.global_position = car.global_position + Vector3(0,0,2)
	main.player.velocity = Vector3.ZERO
	await frames(20)
	car.freeze = false
	await frames(20)
	await key(KEY_E,true)
	await key(KEY_E,false)
	check("actual E enters the staged test car", main.mode == main.Mode.DRIVE and main.active_car == car)
	if main.mode == main.Mode.DRIVE and main.active_car == car:
		main.cam_rig.snap_to_target()
		await capture("02_return_ramp_before_drive")
		await key(KEY_W,true)
		await frames(240)
		await key(KEY_W,false)
		var travelled: float = (car.global_position-start).dot(direction)
		print("ROADSIDE drive distance=%.3f car=%s" % [travelled,car.global_position])
		check("real driving passes the former pole by at least one car length", travelled > 30)
		await capture("03_return_ramp_after_drive")
	# Independent literal intervals: a 2m strip expands each rectangle by 1.5m
	# (half its width + the 0.5m safety gap). Check instantiated colliders, not
	# expectations generated by the production interval helper.
	strip_fixture("unobstructed",[],[Vector2(0,100)])
	strip_fixture("perpendicular crossing",[[0,50,20,4.6,0]],[Vector2(0,43.9),Vector2(56.1,100)])
	strip_fixture("rotated crossing",[[0,50,4.6,20,PI * 0.5]],[Vector2(0,43.9),Vector2(56.1,100)])
	strip_fixture("diagonal crossing",[[0,50,4.6,20,PI * 0.25]],[Vector2(0,41.373297),Vector2(58.626703,100)])
	strip_fixture("overlapping exclusions",[[0,52,20,5,0],[0,45,20,5,0]],[Vector2(0,38.5),Vector2(58.5,100)])
	strip_fixture("finite end",[[0,103,20,2,0]],[Vector2(0,99.5)])
	strip_fixture("entirely obstructed",[[0,50,20,60,0]],[])
	strip_fixture("parallel near miss",[[22,50,20,60,0]],[Vector2(0,100)])
	strip_fixture("zero length",[],[],true)
	# Resolve a REAL 12x9m catalog building through the production exclusions,
	# then measure actual strip colliders against independently derived bounds.
	var previous_map: ProtoUSMap = main.stream.usmap
	var fixture_map := ProtoUSMap.new()
	fixture_map.ok = true
	fixture_map.placements = [{"id":"roadside-gas-fixture","building":"gas_station_small","pos":Vector2(0,50),"rot":0.65}]
	main.stream.usmap = fixture_map
	var building_exclusions: Array = main.stream._ruin_exclusions(Vector3(0,0,50),"roadside-building-fixture")
	main.stream.usmap = previous_map
	# 6m expanded local-Z half extent / cos(0.65) = 7.536957m.
	strip_fixture("authored diagonal gas station",building_exclusions,[Vector2(0,42.463043),Vector2(57.536957,100)])
