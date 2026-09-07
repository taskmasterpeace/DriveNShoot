extends "res://proto3d/tests/road_surface_sim.gd"
## Independent footprint and physical-floor probes for the roadside decoration
## defect. The base road_surface_sim remains a separate broader physical gate.
var drive_pavements: Dictionary = {}

func driving_footprint_controls() -> void:
	var distant := PackedVector2Array([Vector2(-56200,-18000),Vector2(-56196,-18000),Vector2(-56196,-17999),Vector2(-56200,-17999)])
	print("ROADSIDE translated4x1 pavement signed_double_area=", signed_double_area(distant))
	check("thin finite pavement retains its hand-derived area at USA coordinates", valid_convex_footprint(distant) and signed_double_area(distant) == 8)
	# Literal 5.6m-wide, 10m-long pavement, independent of road projection.
	var road := {"id":"footprint-control", "lanes":1, "divided":false,
		"pts":PackedVector2Array([Vector2(0,-5), Vector2(0,5)])}
	var first := PackedVector2Array([Vector2(-2.8,-5), Vector2(2.8,-5), Vector2(2.8,0), Vector2(-2.8,0)])
	var second := PackedVector2Array([Vector2(-2.8,0), Vector2(2.8,0), Vector2(2.8,5), Vector2(-2.8,5)])
	drive_pavements[road["id"]] = [first, second]
	var car := ProtoCar3D.new()
	car.freeze = true
	car.process_mode = Node.PROCESS_MODE_DISABLED
	car.collision_layer = 0
	car.collision_mask = 0
	add_child(car)
	var shape := CollisionShape3D.new()
	var box := BoxShape3D.new()
	box.size = Vector3(2,2,4)
	shape.shape = box
	car.add_child(shape)
	check("full driving footprint spans two adjoining finite slabs", car_on_pavement(car, road))
	car.position.x = 1.75
	car.rotation.z = PI / 6
	check("rolled upper or lower chassis edge outside pavement is rejected", not car_on_pavement(car, road))
	car.position = Vector3(0,0,3)
	car.rotation = Vector3(PI / 6,0,0)
	check("pitched upper or lower chassis edge past finite end is rejected", not car_on_pavement(car, road))
	car.position = Vector3(0,0,5.4)
	car.rotation = Vector3.ZERO
	check("finite pavement does not acquire a round endpoint cap", not car_on_pavement(car, road))
	car.position = Vector3.ZERO
	first[2].y = -0.25
	first[3].y = -0.25
	second[0].y = 0.25
	second[1].y = 0.25
	drive_pavements[road["id"]] = [first, second]
	check("interior pavement gap is rejected even when all chassis corners are covered", not car_on_pavement(car, road))
	drive_pavements.erase(road["id"])
	check("missing literal driving pavement fails closed", not car_on_pavement(car, road))
	var center := PackedVector2Array([Vector2(-0.5,-0.5),Vector2(0.5,-0.5),Vector2(0.5,0.5),Vector2(-0.5,0.5)])
	var surround: Array = [
		PackedVector2Array([Vector2(-1,-2),Vector2(-0.5,-2),Vector2(-0.5,2),Vector2(-1,2)]),
		PackedVector2Array([Vector2(0.5,-2),Vector2(1,-2),Vector2(1,2),Vector2(0.5,2)]),
		PackedVector2Array([Vector2(-0.5,-2),Vector2(0.5,-2),Vector2(0.5,-0.5),Vector2(-0.5,-0.5)]),
		PackedVector2Array([Vector2(-0.5,0.5),Vector2(0.5,0.5),Vector2(0.5,2),Vector2(-0.5,2)])]
	drive_pavements[road["id"]] = [center] + surround
	check("enclosed slab first plus surrounding pavement fully covers chassis", car_on_pavement(car, road))
	drive_pavements[road["id"]] = surround + [center]
	check("full pavement coverage is independent of slab order", car_on_pavement(car, road))
	drive_pavements[road["id"]] = surround
	check("genuinely uncovered enclosed pavement hole is rejected", not car_on_pavement(car, road))
	var closed := PackedVector2Array([Vector2(-2.8,-5),Vector2(2.8,-5),Vector2(2.8,5),Vector2(-2.8,5),Vector2(-2.8,-5)])
	drive_pavements[road["id"]] = [closed]
	check("repeated closing pavement vertex preserves complete coverage", car_on_pavement(car, road))
	closed.reverse()
	drive_pavements[road["id"]] = [closed]
	check("clockwise finite pavement preserves complete coverage", car_on_pavement(car, road))
	for bad: PackedVector2Array in [PackedVector2Array(), PackedVector2Array([Vector2.ZERO,Vector2.ZERO,Vector2.ZERO]),
		PackedVector2Array([Vector2(-1,-1),Vector2(NAN,1),Vector2(1,-1)]),
		PackedVector2Array([Vector2(-1,-1),Vector2(INF,1),Vector2(1,-1)])]:
		drive_pavements[road["id"]] = [bad]
		check("malformed literal pavement fails closed " + str(bad), not car_on_pavement(car, road))
	drive_pavements.erase(road["id"])
	car.free()

func polygon(transform: Transform3D, size: Vector3) -> PackedVector2Array:
	var points := PackedVector2Array()
	for corner: Vector3 in [Vector3(-size.x,0,-size.z), Vector3(size.x,0,-size.z),
			Vector3(size.x,0,size.z), Vector3(-size.x,0,size.z)]:
		var point: Vector3 = transform * (corner * 0.5)
		points.append(Vector2(point.x,point.z))
	return points

## Both stock boxes and joined convex road prisms are measured from their
## literal rendered vertices. Do not substitute an axis-aligned bounding box:
## that would invent asphalt outside an angled or tapered join.
func pavement_polygon(slab: MeshInstance3D) -> PackedVector2Array:
	var points := PackedVector2Array()
	if slab.mesh == null:
		return points
	for vertex: Vector3 in slab.mesh.get_faces():
		var point: Vector3 = slab.global_transform * vertex
		points.append(Vector2(point.x, point.z))
	return Geometry2D.convex_hull(points) if points.size() >= 3 else PackedVector2Array()

func pavement_polygon_controls() -> void:
	var slab := MeshInstance3D.new()
	add_child(slab)
	var box := BoxMesh.new()
	box.size = Vector3(4, 0.2, 10)
	slab.mesh = box
	slab.position = Vector3(20, 3, 30)
	var box_points: PackedVector2Array = pavement_polygon(slab)
	check("literal box pavement includes its corner and excludes outside ground",
		Geometry2D.is_point_in_polygon(Vector2(21.9, 34.9), box_points)
		and not Geometry2D.is_point_in_polygon(Vector2(22.1, 35.1), box_points))
	# Hand-authored skewed, sloped quad: z0 spans x0..4; z10 spans x2..6.
	# Its bounding box contains (0.5,9), but its actual pavement does not.
	var vertices := PackedVector3Array([Vector3(0, 0, 0), Vector3(4, 0, 0),
		Vector3(6, 1, 10), Vector3(0, 0, 0), Vector3(6, 1, 10), Vector3(2, 1, 10)])
	var arrays: Array = []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = vertices
	var mesh := ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	slab.mesh = mesh
	slab.rotation.y = PI * 0.5
	var skew_points: PackedVector2Array = pavement_polygon(slab)
	check("joined pavement projection retains translated rotated sloped mesh extent",
		Geometry2D.is_point_in_polygon(Vector2(29, 26.2), skew_points))
	check("joined pavement does not invent the empty bounding-box corner",
		not Geometry2D.is_point_in_polygon(Vector2(29, 29.5), skew_points))
	slab.free()

func drive_contact_diagnostic(car: ProtoCar3D, phase: String) -> void:
	print("ROADSIDE DRIVE phase=%s position=%s velocity=%s" % [phase, car.global_position, car.linear_velocity])
	for node: Node in car.get_children():
		if node is VehicleWheel3D:
			print("ROADSIDE WHEEL contact=%s position=%s body=%s" % [node.is_in_contact(), node.global_position, node.get_contact_body()])
		elif node is CollisionShape3D:
			var query := PhysicsShapeQueryParameters3D.new()
			query.shape = node.shape
			query.transform = node.global_transform
			query.collision_mask = 1
			for hit: Dictionary in main.get_world_3d().direct_space_state.intersect_shape(query, 64):
				var body: Node3D = hit["collider"]
				if body == car:
					continue
				print("ROADSIDE CONTACT phase=%s path=%s position=%s metadata=%s" % [phase, body.get_path(), body.global_position, body.get_meta_list()])
				for child: Node in body.get_children():
					if child is CollisionShape3D and child.shape is BoxShape3D:
						print("ROADSIDE CONTACT BOX size=%s position=%s" % [child.shape.size, child.global_position])

func point_at_distance(road: Dictionary, distance: float) -> Vector2:
	var points: PackedVector2Array = road["pts"]
	var remaining := maxf(0, distance)
	for i: int in points.size() - 1:
		var length: float = points[i].distance_to(points[i + 1])
		if remaining <= length and length > 0.0001:
			return points[i].lerp(points[i + 1], remaining / length)
		remaining -= length
	return points[-1]

func signed_double_area(points: PackedVector2Array) -> float:
	var area: float = 0
	if points.is_empty():
		return area
	# Vector2 components are single precision. Translate before cross products,
	# or nearby products around 1e9 cancel real narrow slabs at USA coordinates.
	var origin: Vector2 = points[0]
	for i: int in points.size():
		area += (points[i] - origin).cross(points[(i + 1) % points.size()] - origin)
	return area

func valid_convex_footprint(points: PackedVector2Array) -> bool:
	if points.size() < 3:
		return false
	for point: Vector2 in points:
		if not point.is_finite():
			return false
	var area: float = signed_double_area(points)
	return is_finite(area) and area != 0

func clip_half_plane(points: PackedVector2Array, a: Vector2, b: Vector2, keep_left: bool) -> PackedVector2Array:
	var result := PackedVector2Array()
	if points.is_empty():
		return result
	var previous: Vector2 = points[-1]
	var previous_cross: float = (b - a).cross(previous - a)
	var previous_in: bool = previous_cross >= 0 if keep_left else previous_cross <= 0
	for current: Vector2 in points:
		var current_cross: float = (b - a).cross(current - a)
		var current_in: bool = current_cross >= 0 if keep_left else current_cross <= 0
		if current_in != previous_in:
			result.append(previous.lerp(current, previous_cross / (previous_cross - current_cross)))
		if current_in:
			result.append(current)
		previous = current
		previous_cross = current_cross
		previous_in = current_in
	return result if result.size() >= 3 and signed_double_area(result) != 0 else PackedVector2Array()

func subtract_convex(subject: PackedVector2Array, slab: PackedVector2Array) -> Array[PackedVector2Array]:
	if not valid_convex_footprint(slab):
		return [subject]
	var outside: Array[PackedVector2Array] = []
	var remainder: PackedVector2Array = subject
	var inside_left: bool = signed_double_area(slab) > 0
	# Each edge peels one convex outside piece off the still-inside remainder.
	# Unlike contour subtraction, this cannot turn a hole into a filled polygon.
	for i: int in slab.size():
		var a: Vector2 = slab[i]
		var b: Vector2 = slab[(i + 1) % slab.size()]
		if a == b:
			continue
		var piece: PackedVector2Array = clip_half_plane(remainder, a, b, not inside_left)
		if not piece.is_empty():
			outside.append(piece)
		remainder = clip_half_plane(remainder, a, b, inside_left)
		if remainder.is_empty():
			break
	return outside

func car_on_pavement(car: ProtoCar3D, road: Dictionary) -> bool:
	var pavement: Array = drive_pavements.get(String(road["id"]), [])
	if pavement.is_empty():
		return false
	# The cache contains convex hulls of real convex-prism/box slabs. Reject
	# malformed geometry; it must never consume an uncovered chassis polygon.
	for slab: PackedVector2Array in pavement:
		if not valid_convex_footprint(slab):
			return false
	var boxes: int = 0
	for node: Node in car.get_children():
		if not node is CollisionShape3D:
			continue
		if not node.shape is BoxShape3D:
			return false
		boxes += 1
		var points := PackedVector2Array()
		var origin := Vector2(node.global_position.x, node.global_position.z)
		var half: Vector3 = node.shape.size * 0.5
		# Pitch and roll project the upper/lower hull beyond the mid-plane.
		for x: float in [-half.x, half.x]:
			for y: float in [-half.y, half.y]:
				for z: float in [-half.z, half.z]:
					var point: Vector3 = node.global_transform * Vector3(x,y,z)
					points.append(Vector2(point.x, point.z) - origin)
		if not node.global_transform.is_finite() or not half.is_finite():
			return false
		var hull: PackedVector2Array = Geometry2D.convex_hull(points)
		if not valid_convex_footprint(hull):
			return false
		var remaining: Array[PackedVector2Array] = [hull]
		# Subtract every literal finite slab, not a centerline capsule or AABB.
		# This also detects interior holes even if all eight corners are covered.
		# Local coordinates avoid performing clipping at the USA's large offsets.
		for slab: PackedVector2Array in pavement:
			var local := PackedVector2Array()
			for point: Vector2 in slab:
				local.append(point - origin)
			var uncovered: Array[PackedVector2Array] = []
			for piece: PackedVector2Array in remaining:
				uncovered.append_array(subtract_convex(piece, local))
			remaining = uncovered
			if remaining.is_empty():
				break
		if not remaining.is_empty():
			return false
	return boxes > 0

func drive_pad(axis: JoyAxis, value: float) -> void:
	var event := InputEventJoypadMotion.new()
	event.device = 0
	event.axis = axis
	event.axis_value = value
	Input.parse_input_event(event)

func follow_current_ramp(car: ProtoCar3D, road: Dictionary) -> void:
	var here := Vector2(car.global_position.x, car.global_position.z)
	var projection: Dictionary = ProtoUSMap._project_road(road, here)
	var target: Vector2 = point_at_distance(road, float(projection["arc_m"]) + 12.0)
	var toward := Vector3(target.x - here.x, 0, target.y - here.y).normalized()
	var forward := -car.global_basis.z
	forward.y = 0
	var angle: float = forward.normalized().signed_angle_to(toward, Vector3.UP)
	var speed: float = car.linear_velocity.length()
	# Same real action path and proportional pedals as the four-route driver.
	# The curved replacement road needs steering, not a constant held wheel.
	drive_pad(JOY_AXIS_LEFT_X, -clampf(angle * 2.0, -1.0, 1.0))
	drive_pad(JOY_AXIS_TRIGGER_RIGHT, clampf((15.0 - speed) * 0.3, 0.0, 1.0))
	drive_pad(JOY_AXIS_TRIGGER_LEFT, clampf((speed - 15.5) * 0.25, 0.0, 1.0))

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
	pavement_polygon_controls()
	driving_footprint_controls()
	var asphalt: Array[PackedVector2Array] = []
	var joined_slabs: int = 0
	var valid_slabs: int = 0
	for slab: MeshInstance3D in slabs:
		var footprint: PackedVector2Array = pavement_polygon(slab)
		valid_slabs += int(footprint.size() >= 4)
		asphalt.append(footprint)
		var road_id := String(slab.get_meta("road_slab", ""))
		if not drive_pavements.has(road_id):
			drive_pavements[road_id] = []
		drive_pavements[road_id].append(footprint)
		joined_slabs += int(slab.mesh is ArrayMesh)
	print("ROADSIDE pavement full footprints=%d/%d joined=%d" % [valid_slabs, slabs.size(), joined_slabs])
	var invalid_return: int = 0
	for piece: PackedVector2Array in drive_pavements.get("I-90_X11-on", []):
		invalid_return += int(not valid_convex_footprint(piece))
	print("ROADSIDE current return-ramp invalid area footprints=", invalid_return)
	check("every loaded pavement slab has a measurable full footprint", valid_slabs == slabs.size() and valid_slabs > 0)
	check("real joined pavement is included in roadside clearance", joined_slabs > 0)
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
	# The old pole's road moved during the diamond migration. Preserve its
	# projection diagnostic, but drive the actual current ON ramp, not grass
	# through a now-lawful roadside pole. E enters; real pad events follow the
	# curved replacement road within the original 240-frame/>30m bounds.
	var blocked := Vector3(-56157.28,0,-17934.86)
	for road_id: String in ["I-90", "I-90_X11-on", "I-90_X11-on-r"]:
		var road: Dictionary = main.stream.usmap.road_by_id(road_id)
		print("ROADSIDE ORIGINAL FIXTURE road=%s projection=%s" % [road_id, ProtoUSMap._project_road(road, Vector2(blocked.x, blocked.z))])
	var return_road: Dictionary = main.stream.usmap.road_by_id("I-90_X11-on")
	var old_projection: Dictionary = ProtoUSMap._project_road(return_road, Vector2(blocked.x, blocked.z))
	var start_arc: float = float(old_projection["arc_m"]) - 22.0
	var start_xz: Vector2 = point_at_distance(return_road, start_arc)
	var ahead_xz: Vector2 = point_at_distance(return_road, start_arc + 38.0)
	var direction := Vector3(ahead_xz.x-start_xz.x, 0, ahead_xz.y-start_xz.y).normalized()
	var start := Vector3(start_xz.x, ProtoUSMap.elev_at(return_road, start_arc) + 1.0, start_xz.y)
	var car: ProtoCar3D = ProtoCar3D.create("scavenger", Color(0.55,0.42,0.30))
	car.freeze = true
	main.add_child(car)
	main.cars.append(car)
	car.global_position = start
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
		drive_contact_diagnostic(car, "before")
		var on_pavement: bool = car_on_pavement(car, return_road)
		check("staged car full footprint lies on the current return ramp", on_pavement)
		await capture("02_return_ramp_before_drive")
		for frame: int in 240:
			follow_current_ramp(car, return_road)
			await get_tree().physics_frame
			on_pavement = car_on_pavement(car, return_road) and on_pavement
		drive_pad(JOY_AXIS_LEFT_X, 0)
		drive_pad(JOY_AXIS_TRIGGER_RIGHT, 0)
		drive_pad(JOY_AXIS_TRIGGER_LEFT, 0)
		await frames(5)
		on_pavement = car_on_pavement(car, return_road) and on_pavement
		var travelled: float = (car.global_position-start).dot(direction)
		print("ROADSIDE drive distance=%.3f full_footprint_on_pavement=%s car=%s" % [travelled,on_pavement,car.global_position])
		drive_contact_diagnostic(car, "after")
		check("real driving traverses more than 30m of the current return ramp", travelled > 30)
		check("full car footprint stays on current return-ramp pavement", on_pavement)
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
