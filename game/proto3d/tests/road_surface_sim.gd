extends Node
## Real Seattle road/terrain overlap reproduction. Owned disposable profile only.
var main: Node3D
var passed: int = 0
var failed: int = 0
var output: String = ""
var captures: Array[Dictionary] = []
var timing_enabled: bool = OS.get_environment("DRIVN_PROFILE_PARKING")=="1"

func _timing_marker(phase: String, updates: int = 0, total_us: int = 0, max_us: int = 0) -> void:
	if timing_enabled:
		print("SURFACE TIMING phase=%s wall_ms=%d stream_updates=%d update_total_us=%d update_max_us=%d parking=%s reservations=%s" % [phase,Time.get_ticks_msec(),updates,total_us,max_us,main.traffic.parking_profile,main.stream.reservation_profile])

func check(label: String, ok: bool) -> void:
	passed += int(ok)
	failed += int(not ok)
	print("ROAD SURFACE: %s %s" % ["PASS" if ok else "FAIL", label])

func frames(count: int = 5) -> void:
	await get_tree().process_frame
	for i: int in count:
		await get_tree().physics_frame

func key(code: Key, down: bool) -> void:
	var event := InputEventKey.new()
	event.keycode = code
	event.physical_keycode = code
	event.pressed = down
	Input.parse_input_event(event)
	await frames()

func capture(id: String) -> void:
	if output.is_empty():
		return
	await frames(10)
	await RenderingServer.frame_post_draw
	var picture: Image = get_viewport().get_texture().get_image()
	check(id + " real 1280x720 frame", picture.get_size() == Vector2i(1280,720))
	check(id + " saved", picture.save_png(output.path_join(id + ".png")) == OK)
	captures.append({"id":id,"pixels":str(picture.get_size()),"player":str(main.player.global_position),
		"car":str(main.active_car.global_position) if main.active_car != null else "on foot",
		"camera":str(main.cam_rig._cam.global_position),"hour":main.daynight.hour,
		"note":"Actual unedited game render. Locations are photographically staged, not continuous-trip evidence. See the named scene for real inputs exercised. Comparison clock held at 11:00. Isolated fresh profile."})

func probe_road(rid: String, slabs: Array[MeshInstance3D], at: Vector3, terrain_only: bool = false) -> void:
	var probes: int = 0
	var buried: int = 0
	var missed: int = 0
	var maximum: float = -INF
	var worst := Vector3.ZERO
	var collider_name: String = ""
	for slab: MeshInstance3D in slabs:
		if String(slab.get_meta("road_slab")) != rid:
			continue
		for point: Vector3 in _slab_sample_points(slab):
			if Vector2(point.x-at.x,point.z-at.z).length() > 200:
				continue
			var query := PhysicsRayQueryParameters3D.create(point + Vector3.UP * 20, point - Vector3.UP * 5, 1)
			var hit: Dictionary = main.get_world_3d().direct_space_state.intersect_ray(query)
			# The separate profile gate inspects physical terrain, while the
			# default broader gate STILL counts median/other obstruction hits.
			if terrain_only:
				var excluded: Array[RID] = []
				for attempt: int in 32:
					if hit.is_empty() or (hit["collider"] as Node).has_meta("relief_floor"):
						break
					excluded.append((hit["collider"] as CollisionObject3D).get_rid())
					query.exclude = excluded
					hit = main.get_world_3d().direct_space_state.intersect_ray(query)
				if not hit.is_empty() and not (hit["collider"] as Node).has_meta("relief_floor"):
					hit = {}
			if hit.is_empty():
				missed += 1
				continue
			probes += 1
			var gap: float = (hit["position"] as Vector3).y - point.y
			if gap > maximum:
				maximum = gap
				worst = point
				collider_name = str((hit["collider"] as Node).get_path())
				var body: Node = hit["collider"]
				collider_name += " meta=" + str(body.get_meta_list())
				for child: Node in body.get_children():
					if child is CollisionShape3D and child.shape is BoxShape3D:
						collider_name += " box=" + str(child.shape.size)
			if gap > 0.12:
				buried += 1
	print("ROAD SURFACE diagnostic: road=%s probes=%d buried=%d max=%.3f worst=%s collider=%s ground_y=%.3f" % [rid,probes,buried,maximum,worst,collider_name,ProtoWorldBuilder.ground_y(worst.x,worst.z)])
	check(rid + " has sampled physical pavement", probes >= 20)
	check(rid + " has a floor at every tested pavement point", missed == 0)
	check(rid + (" is not buried under physical terrain" if terrain_only else " is not buried under terrain or blockers"), buried == 0)


func _slab_sample_points(slab: MeshInstance3D) -> PackedVector3Array:
	var samples := PackedVector3Array()
	if slab.mesh is BoxMesh:
		var size: Vector3 = (slab.mesh as BoxMesh).size
		for step: int in range(2, int(size.z) - 2, 4):
			samples.append(slab.global_transform * Vector3(2, size.y * 0.5, -size.z * 0.5 + step))
	else:
		var faces := slab.mesh.get_faces()
		var normals: PackedVector3Array = slab.mesh.surface_get_arrays(0)[Mesh.ARRAY_NORMAL]
		for i: int in range(0, faces.size(), 3):
			if normals.size() > i and normals[i].y < 0.5:
				continue # physical pavement is the actual top, not a deck's underside
			samples.append(slab.global_transform * ((faces[i] + faces[i + 1] + faces[i + 2]) / 3.0))
	return samples

func run_checks(slabs: Array[MeshInstance3D], at: Vector3) -> void:
	for rid: String in ["I-90", "I-90_X11-off", "I-90_X11-on", "I-90_X11-off-r", "I-90_X11-on-r"]:
		# The old terrain-only profile is still useful, but a 20m ray is not an
		# obstruction gate: a perfectly legal overpass is its first hit.
		probe_road(rid, slabs, at, true)
	await _diamond_physics()


func _envelope_hits(point: Vector3, height: float = 2.2) -> Array[Dictionary]:
	var shape := BoxShape3D.new()
	shape.size = Vector3(0.35, height, 0.35)
	var query := PhysicsShapeQueryParameters3D.new()
	query.shape = shape
	query.transform.origin = point + Vector3.UP * (0.25 + height * 0.5)
	query.collision_mask = 1
	# Deliberately NO exclusions: medians, barrels, columns and homes count.
	return main.get_world_3d().direct_space_state.intersect_shape(query, 32)


func _height_at(road: Dictionary, point: Vector2) -> float:
	return ProtoUSMap.elev_at(road, float(ProtoUSMap._project_road(road, point)["arc_m"]))


func _stage_photo(point: Vector2, id: String) -> void:
	_timing_marker("photo start "+id)
	var update_total := 0
	var update_max := 0
	main.player.global_position = Vector3(point.x, ProtoWorldBuilder.ground_y(point.x, point.y) + 1.2, point.y)
	main.player.velocity = Vector3.ZERO
	for i: int in 70:
		var started := Time.get_ticks_usec() if timing_enabled else 0
		main.stream.update_stream(main.player.global_position, main)
		if timing_enabled:
			var elapsed := Time.get_ticks_usec()-started
			update_total += elapsed
			update_max = maxi(update_max,elapsed)
		await frames(1)
		if (i+1)%20==0:
			_timing_marker("photo stream "+id,i+1,update_total,update_max)
	main.cam_rig.snap_to_target()
	_timing_marker("photo settle "+id,70,update_total,update_max)
	await frames(30)
	await capture(id)
	_timing_marker("photo end "+id,70,update_total,update_max)


func _diamond_physics() -> void:
	var map: ProtoUSMap = main.stream.usmap
	var ids: Array[String] = ["I-90_X11-off", "I-90_X11-on", "I-90_X11-off-r", "I-90_X11-on-r", "I-90_X11-crossroad", "I-90_X11-town-link"]
	# Materialize the REAL chunks covering every road point, including the
	# displaced 260m ports and the entire long feeder. Test-owned chunks stay
	# outside the loader registry so its unload ring cannot erase far probes.
	var cells: Dictionary = {}
	var chunks: Array[Node3D] = []
	var owned_chunks: Array[Node3D] = []
	for id: String in ids:
		var road: Dictionary = map.road_by_id(id)
		for point: Vector2 in road["pts"]:
			for dx: int in range(-1, 2):
				for dz: int in range(-1, 2):
					var cell := Vector2i(floori(point.x / 128.0) + dx, floori(point.y / 128.0) + dz)
					cells[cell] = true
	for cell: Vector2i in cells:
		var key_name := "%d,%d" % [cell.x, cell.y]
		if main.stream.loaded.has(key_name):
			chunks.append(main.stream.loaded[key_name])
		else:
			var chunk: Node3D = main.stream._spawn_chunk(cell.x, cell.y)
			if chunk != null:
				if chunk.has_meta("relief"):
					main.stream._drape_chunk(chunk)
				chunks.append(chunk)
				owned_chunks.append(chunk)
	await frames(8)
	# Negative controls prove both blocked travel and low underside detection.
	var control := Vector3(-56064, 100, -17888)
	check("empty travel envelope control", _envelope_hits(control).is_empty())
	var blocker := ProtoWorldBuilder.box_body(main, Vector3(1, 1, 1), control + Vector3.UP, Color.WHITE)
	await frames(2)
	check("negative control detects real barrel-sized blocker", not _envelope_hits(control).is_empty())
	blocker.queue_free()
	var low_deck := ProtoWorldBuilder.box_body(main, Vector3(5, 0.5, 5), control + Vector3.UP * 2.3, Color.WHITE)
	await frames(2)
	check("negative control rejects insufficient bridge underside", not _envelope_hits(control).is_empty())
	low_deck.queue_free()
	await frames(2)
	var full_box := _road_envelope_query(control, control + Vector3(0, 0, 3), 9.2)
	check("empty continuous full-width envelope control", main.get_world_3d().direct_space_state.intersect_shape(full_box).is_empty())
	var thin_trunk := ProtoWorldBuilder.box_body(main, Vector3(0.5, 3, 0.5), control + Vector3(1, 1.5, 1.5), Color.WHITE)
	await frames(2)
	check("continuous envelope catches half-metre trunk between sparse samples", not main.get_world_3d().direct_space_state.intersect_shape(full_box).is_empty())
	check("stationary full-width blocker cannot clear by bounded recheck", await _settled_full_boxes([full_box]) == 1)
	thin_trunk.queue_free()
	await frames(2)
	for native_body: PhysicsBody3D in [CharacterBody3D.new(), AnimatableBody3D.new()]:
		var shape := CollisionShape3D.new()
		var box := BoxShape3D.new()
		box.size = Vector3(0.5, 3, 0.5)
		shape.shape = box
		native_body.add_child(shape)
		main.add_child(native_body)
		native_body.position = control + Vector3(1, 1.5, 1.5)
		native_body.add_to_group("threat")
		native_body.add_to_group("combatant")
		await frames(2)
		check("unregistered %s with misleading combat groups remains fixed blocker" % native_body.get_class(), await _settled_full_boxes([full_box]) == 1)
		native_body.queue_free()
		await frames(2)
	var live_lurkers := 0
	var live_traffic := 0
	for actor: Node in get_tree().get_nodes_in_group("threat"):
		live_lurkers += int(_live_road_occupant(actor))
	for actor: Node in main.traffic.agents:
		live_traffic += int(_live_road_occupant(actor))
	check("actual registered living lurkers are recognized as occupants", live_lurkers > 0)
	check("actual registered ambient traffic is recognized as occupants", live_traffic > 0)
	var cross: Dictionary = map.road_by_id("I-90_X11-crossroad")
	var rails := 0
	var pillars := 0
	var rail_error := 0.0
	var foot_error := 0.0
	var reserved_pillars := 0
	var white_paint := 0
	var yellow_ramps := 0
	for chunk: Node3D in chunks:
		for node: Node in chunk.get_children():
			if node is Node3D and String(node.get_meta("road_guard_rail", "")) == "I-90_X11-crossroad":
				rails += 1
				var pos: Vector3 = node.global_position
				var expected := _height_at(cross, Vector2(pos.x, pos.z)) + 0.57 + float(absi(hash("I-90_X11-crossroad")) % 5) * 0.004
				rail_error = maxf(rail_error, absf(pos.y - expected))
			if node is StaticBody3D and String(node.get_meta("road_pillar", "")) == "I-90_X11-crossroad":
				pillars += 1
				for child: Node in node.get_children():
					if child is CollisionShape3D and child.shape is BoxShape3D:
						var foot: Vector3 = child.global_transform * Vector3(0, -child.shape.size.y * 0.5, 0)
						foot_error = maxf(foot_error, absf(foot.y - ProtoWorldBuilder.ground_y(foot.x, foot.z)))
						var foot_ray := PhysicsRayQueryParameters3D.create(foot + Vector3.UP * 0.2, foot - Vector3.UP * 0.3, 1, [node.get_rid()])
						var terrain_hit: Dictionary = main.get_world_3d().direct_space_state.intersect_ray(foot_ray)
						foot_error = INF if terrain_hit.is_empty() else maxf(foot_error, absf(float(terrain_hit["position"].y) - foot.y))
						for underlying: Dictionary in map.road_segments_near(foot, 30.0):
							if String(underlying["id"]) != "I-90_X11-crossroad" and ProtoUSMap._seg_dist(Vector2(foot.x, foot.z), underlying["a"], underlying["b"]) < float(ProtoUSMap.road_geometry(underlying)["width"]) * 0.5 + 1.0:
								reserved_pillars += 1
			if node is MeshInstance3D and String(node.get_meta("road_center", "")) in ids.slice(0, 4):
				var color: Color = node.material_override.albedo_color
				white_paint += int(absf(color.r - color.b) < 0.15)
				yellow_ramps += int(absf(color.r - color.b) >= 0.15)
	print("ROAD HARDWARE rails=%d height_error=%.4f pillars=%d foot_error=%.4f reserved=%d" % [rails, rail_error, pillars, foot_error, reserved_pillars])
	check("elevated edge rails follow row height without second drape", rails > 0 and rail_error < 0.05)
	check("densified short deck spans have actual support bodies", pillars > 0)
	check("pillar feet meet their own offset terrain and reserve underlying roads", pillars > 0 and foot_error < 0.05 and reserved_pillars == 0)
	check("all one-way ramp center markings are white", white_paint > 0 and yellow_ramps == 0)
	_joined_visuals(map, chunks, ids)
	_legacy_pad_regressions(map, chunks)
	await _wet_deck_regression(map)
	await _port_hardware(map, chunks)
	for id: String in ids:
		await _full_width_floor(map.road_by_id(id))
		await _continuous_road_envelope(map.road_by_id(id))
	_bridge_clearance(map)
	_timing_marker("owned cleanup start")
	for chunk: Node3D in owned_chunks:
		chunk.queue_free()
	await frames(2)
	_timing_marker("owned cleanup end")
	# Exact matched photographic stages used for the four original BEFOREs.
	await _stage_photo((cross["pts"] as PackedVector2Array)[0], "02_crossroad_ground_approach")
	await _stage_photo((map.road_by_id("I-90_X11-off")["pts"] as PackedVector2Array)[0], "03_actual_off_ramp_mouth")
	var fp: PackedVector2Array = map.road_by_id("I-90_X11-town-link")["pts"]
	await _stage_photo(fp[int(fp.size() * 0.5)], "04_town_feeder")
	# The real on-route reaches this region after the interchange is unloaded.
	# Use the normal loader, not the earlier test-owned materialized chunks.
	# Keep the staged observer outside the queried road (no query exclusions).
	await _stage_photo(fp[-1] + Vector2(0, 30), "05_later_streamed_town_feeder")
	await _continuous_road_envelope(map.road_by_id("I-90_X11-town-link"), true)
	await _highway_continuation_probe(map)


## The completion photograph exposed a roof just beyond the ON route endpoint.
## Load the real neighborhood and query its continuing lane, not a data-only box.
func _highway_continuation_probe(map: ProtoUSMap) -> void:
	var highway: Dictionary = map.road_by_id("I-90")
	var start := Vector2(-56389.61, -17982.54) # captured ON completion position
	var projected: Dictionary = ProtoUSMap._project_road(highway, start)
	var travel: Vector2 = -(projected["dir"] as Vector2)
	var outside := Vector2(-travel.y, travel.x)
	await _stage_photo(start + outside * 30.0, "06_highway_continuation_police")
	var occupied: Array[PhysicsShapeQueryParameters3D] = []
	var floor_gaps := 0
	for index: int in 5:
		var a := start + travel * float(index * 3)
		var b := start + travel * float((index + 1) * 3)
		var query := _road_envelope_query(Vector3(a.x, _height_at(highway,a)+0.09, a.y), Vector3(b.x, _height_at(highway,b)+0.09, b.y), 3.6)
		var hits: Array[Dictionary] = main.get_world_3d().direct_space_state.intersect_shape(query,32)
		if not hits.is_empty():
			occupied.append(query)
			for hit: Dictionary in hits:
				_log_occupant("HIGHWAY CONTINUATION", query.transform.origin, hit["collider"])
		var middle := (a + b) * 0.5
		var pavement := Vector3(middle.x, _height_at(highway,middle)+0.09, middle.y)
		var floor_hit: Dictionary = main.get_world_3d().direct_space_state.intersect_ray(PhysicsRayQueryParameters3D.create(pavement+Vector3.UP*0.2,pavement-Vector3.UP*0.2,1))
		floor_gaps += int(floor_hit.is_empty())
	var fixed := await _settled_full_boxes(occupied)
	print("ROAD HIGHWAY CONTINUATION boxes=5 length=15m width=3.6m floor_gaps=%d initial_occupied=%d final_fixed_unknown=%d exclusions=0" % [floor_gaps, occupied.size(), fixed])
	check("actual continuing highway lane has materialized floor", floor_gaps == 0)
	check("actual continuing highway lane has no fixed/unknown obstruction", fixed == 0)


func _pad_meshes(chunks: Array[Node3D], id: String) -> Array[MeshInstance3D]:
	var found: Array[MeshInstance3D] = []
	for chunk: Node3D in chunks:
		for node: Node in chunk.get_children():
			if node is MeshInstance3D and String(node.get_meta("junction_slab", "")) == id:
				found.append(node)
	return found


## Exercise actual chunk rendering, not a mocked eligibility predicate. The
## stale Seattle tee must not invent asphalt; a genuine junction keeps its fill.
func _legacy_pad_regressions(map: ProtoUSMap, chunks: Array[Node3D]) -> void:
	check("stale J-tee-135 emits no disconnected paint-obscuring filler", _pad_meshes(chunks, "J-tee-135").is_empty())
	var valid := _pad_meshes(chunks, "J-tee-3")
	check("meeting J-tee-3 keeps its original intersection fill", valid.size() == 1)
	if valid.size() == 1:
		var p := Vector3(-56500, ProtoWorldBuilder.ground_y(-56500, -18000) + 0.13, -18000)
		check("J-tee-3 fill retains dimensions transform and material", valid[0].mesh is BoxMesh and (valid[0].mesh as BoxMesh).size.is_equal_approx(Vector3(29.2, 0.05, 29.2)) and valid[0].position.distance_to(p) < 0.002 and valid[0].rotation.is_zero_approx() and valid[0].material_override.albedo_color.is_equal_approx(ProtoWorldBuilder.COL_ROAD))
	# Separate real ProtoUSMap instance: no canonical arrays or live bytes are
	# mutated. Synthetic folded rows run synchronously through _spawn_chunk;
	# restore the live stream map before any frame/process callback can run.
	var fixture := ProtoUSMap.new()
	check("isolated pad fixture loads actual map fold", fixture.load_file(ProtoUSMap.PATH))
	fixture.placements = []
	fixture.towns = []
	fixture.exits = []
	fixture._seg_grid.clear()
	var origin := Vector2(90048, 90048)
	var cases: Array[Dictionary] = [
		{"id":"valid", "offset":0.0, "diagonal":false, "wide":false, "missing":false, "want":true},
		{"id":"missing", "offset":0.0, "diagonal":false, "wide":false, "missing":true, "want":false},
		{"id":"nonmeeting", "offset":40.0, "diagonal":false, "wide":false, "missing":false, "want":false},
		{"id":"diagonal", "offset":0.0, "diagonal":true, "wide":false, "missing":false, "want":true},
		{"id":"wide-inside", "offset":13.5, "diagonal":false, "wide":true, "missing":false, "want":true},
		{"id":"wide-outside", "offset":13.8, "diagonal":false, "wide":true, "missing":false, "want":false}]
	for item: Dictionary in cases:
		var wide := bool(item["wide"])
		var offset := Vector2(0, float(item["offset"]))
		var diagonal := Vector2(100, 100) if bool(item["diagonal"]) else Vector2(100, 0)
		fixture.roads = [
			{"id":"pad-a", "kind":"county", "pts":PackedVector2Array([origin + Vector2(0,-100), origin + Vector2(0,100)]), "lanes":2, "divided":false},
			{"id":"pad-b", "kind":"county", "pts":PackedVector2Array([origin + offset - diagonal, origin + offset + diagonal]), "lanes":6 if wide else 2, "divided":wide}]
		fixture.junctions = [{"id":item["id"], "pos":origin, "kind":"cross", "grade":"flat", "control":"none", "legs":[{"road":"pad-a"}, {"road":"missing" if bool(item["missing"]) else "pad-b"}]}]
		main.stream.usmap = fixture
		var built: Node3D = main.stream._spawn_chunk(703, 703)
		main.stream.usmap = map
		var pads := _pad_meshes([built], String(item["id"]))
		check("runtime pad fixture %s preserves only meeting filler" % item["id"], pads.size() == int(bool(item["want"])))
		if bool(item["want"]) and pads.size() == 1:
			var pad: MeshInstance3D = pads[0]
			var width := 29.2 if wide else 11.2
			check("runtime valid %s filler retains old dimensions/transform/material and no body" % item["id"], pad.mesh is BoxMesh and (pad.mesh as BoxMesh).size.is_equal_approx(Vector3(width,0.05,width)) and pad.position.is_equal_approx(Vector3(origin.x,0.13,origin.y)) and pad.rotation.is_zero_approx() and pad.material_override.albedo_color.is_equal_approx(ProtoWorldBuilder.COL_ROAD) and pad.get_child_count() == 0)
		var bodies := 0
		for node: Node in built.get_children():
			bodies += int(node is CollisionObject3D)
		print("ROAD PAD FIXTURE %s pads=%d collision_bodies=%d" % [item["id"], pads.size(), bodies])
		built.queue_free()
	main.stream.usmap = map


## A managed ribbon already owns its floor. The legacy wet bridge must not
## add a second, higher box deck with three-metre terminal caps over it.
func _wet_deck_regression(map: ProtoUSMap) -> void:
	var fixture := ProtoUSMap.new()
	check("wet-deck fixture uses a separate actual map fold", fixture.load_file(ProtoUSMap.PATH))
	fixture.placements = []
	fixture.towns = []
	fixture.exits = []
	fixture.junctions = []
	fixture._seg_grid.clear()
	var origin := Vector2(90048, 90048)
	check("wet-deck runtime fixture is actually ocean", fixture.biome_at(Vector3(origin.x,0,origin.y)) == "ocean")
	for managed: bool in [true, false]:
		var id := "TEST-WET-MANAGED" if managed else "TEST-WET-LEGACY"
		fixture.roads = [{"id":id, "kind":"county", "pts":PackedVector2Array([origin - Vector2(20,0), origin + Vector2(20,0)]), "elev":PackedFloat32Array([4,4]), "elev_mode":"structure", "lanes":2, "divided":false, "interchange_id":"wet-fixture" if managed else ""}]
		main.stream.usmap = fixture
		var built: Node3D = main.stream._spawn_chunk(703, 703)
		main.stream.usmap = map
		await frames(3) # register real bodies after restoring the live map
		var decks := 0
		var rails := 0
		var visual_top := -INF
		var visual_end := 0.0
		var collision_end := 0.0
		for node: Node in built.get_children():
			if node is MeshInstance3D and String(node.get_meta("road_slab", "")) == id:
				for vertex: Vector3 in node.mesh.get_faces():
					var point: Vector3 = node.global_transform * vertex
					visual_top = maxf(visual_top, point.y)
					visual_end = maxf(visual_end, absf(point.x - origin.x))
			if not node is StaticBody3D:
				continue
			var deck := String(node.get_meta("road_deck", "")) == id
			decks += int(deck)
			for shape: Node in node.get_children():
				if not shape is CollisionShape3D:
					continue
				if shape.shape is BoxShape3D:
					var size: Vector3 = shape.shape.size
					rails += int(size.is_equal_approx(Vector3(0.4,1,46)))
					if deck:
						for x: float in [-0.5,0.5]:
							for z: float in [-0.5,0.5]:
								var point: Vector3 = shape.global_transform * Vector3(size.x*x,0,size.z*z)
								collision_end = maxf(collision_end, absf(point.x - origin.x))
				elif deck and shape.shape is ConvexPolygonShape3D:
					for vertex: Vector3 in shape.shape.points:
						collision_end = maxf(collision_end, absf((shape.global_transform * vertex).x - origin.x))
		var mismatched_floors := 0
		for x: float in [-18.0,0.0,18.0]:
			for z: float in [-4.2,0.0,4.2]:
				var p := Vector3(origin.x+x,visual_top,origin.y+z)
				var hit: Dictionary = main.get_world_3d().direct_space_state.intersect_ray(PhysicsRayQueryParameters3D.create(p+Vector3.UP*0.2,p-Vector3.UP*0.5,1))
				mismatched_floors += int(hit.is_empty() or absf(float(hit["position"].y)-visual_top) > 0.005)
		check(id + " has exactly one physical deck and retains both wet rails", decks == 1 and rails == 2)
		check(id + " actual full-width floor matches rendered pavement", is_finite(visual_top) and mismatched_floors == 0)
		check(id + " physical deck ends match visible pavement ends", absf(collision_end - visual_end) < 0.005)
		if managed:
			var outside := Vector3(origin.x+21,visual_top,origin.y)
			var outside_hit: Dictionary = main.get_world_3d().direct_space_state.intersect_ray(PhysicsRayQueryParameters3D.create(outside+Vector3.UP*0.2,outside-Vector3.UP*0.5,1))
			check("managed wet deck has no ghost floor one metre beyond terminal", outside_hit.is_empty() and collision_end <= 20.04)
		print("ROAD WET %s decks=%d rails=%d visual_top=%.4f visual_end=%.4f collision_end=%.4f mismatched_floors=%d" % [id,decks,rails,visual_top,visual_end,collision_end,mismatched_floors])
		built.queue_free()
		await frames(2)
	main.stream.usmap = map


func _port_hardware(map: ProtoUSMap, chunks: Array[Node3D]) -> void:
	var descriptor: Dictionary = {}
	for row: Dictionary in map.exits:
		if String(row["id"]) == "I-90_X11":
			descriptor = row
	for port: Dictionary in map.exit_ports(descriptor):
		await _port_transfer_floor(map, port)
		var position: Vector2 = port["pos"]
		var found_sign := false
		var readable_sign := false
		var strip_length := 0.0
		var strip_error := 0.0
		var strip_floor_gaps := 0
		var strip_blocked := 0
		var occupied: Array[Vector3] = []
		var reflector_posts := 0
		var marker := "road_decel" if String(port["role"]) == "off" else "road_accel"
		for chunk: Node3D in chunks:
			for node: Node in chunk.get_children():
				if not node is Node3D:
					continue
				var xz := Vector2(node.global_position.x, node.global_position.z)
				if node.has_meta("road_reflector") and String(node.get_meta("road_reflector")) == String(port["road"]["id"]):
					reflector_posts += 1
				if node.is_in_group("exit_sign") and xz.distance_to(position) < 35.0:
					found_sign = true
					for child: Node in node.get_children():
						if child is Label3D and child.visible and child.text.length() > 8 and child.font_size * child.pixel_size >= 0.5 and child.billboard == BaseMaterial3D.BILLBOARD_ENABLED:
							readable_sign = true
				if node is MeshInstance3D and node.has_meta(marker) and xz.distance_to(position) < 180.0:
					strip_length += (node.mesh as BoxMesh).size.z
					strip_error = maxf(strip_error, absf(node.global_position.y - _height_at(map.road_by_id("I-90"), xz) - 0.12))
					var size: Vector3 = (node.mesh as BoxMesh).size
					for lateral: float in [-0.45, 0.0, 0.45]:
						for longitudinal: float in [-0.4, 0.0, 0.4]:
							var p: Vector3 = node.global_transform * Vector3(size.x * lateral, size.y * 0.5, size.z * longitudinal)
							var ray := PhysicsRayQueryParameters3D.create(p + Vector3.UP * 0.24, p - Vector3.UP * 0.5, 1)
							var floor_hit: Dictionary = main.get_world_3d().direct_space_state.intersect_ray(ray)
							strip_floor_gaps += int(floor_hit.is_empty() or absf(float(floor_hit["position"].y) - p.y) > 0.2)
							var hits := _envelope_hits(p)
							if not hits.is_empty():
								occupied.append(p)
								_log_occupant("PORT " + String(port["road"]["id"]), p, hits[0]["collider"])
		strip_blocked = await _settled_obstructions(occupied)
		check("actual %s port has nearby sign" % port["road"]["id"], found_sign)
		check("actual %s sign has cruise-readable persistent destination text" % port["road"]["id"], readable_sign)
		print("ROAD PORT %s sign=%s %s length=%.3f height_error=%.4f" % [port["road"]["id"], found_sign, marker, strip_length, strip_error])
		check("actual %s port has 120-180m height-following %s" % [port["road"]["id"], marker], strip_length >= 120.0 and strip_length <= 181.0 and strip_error < 0.06)
		print("ROAD PORT FLOOR %s gaps=%d blocked=%d reflector_posts=%d" % [port["road"]["id"], strip_floor_gaps, strip_blocked, reflector_posts])
		check("actual %s speed-change lane has full-width physical floor and travel clearance" % port["road"]["id"], strip_floor_gaps == 0 and strip_blocked == 0)
		check("actual %s ramp has roadside reflector posts" % port["road"]["id"], reflector_posts >= 4)
	var inventory := _gore_inventory(map,chunks)
	var barrel_ports: Dictionary = inventory["ports"]
	var owned_ports: Array[String] = []
	print("ROAD GORE barrels=%d footprint_overlaps=%d" % [inventory["total"],inventory["bad"]])
	print("ROAD GORE PORT COUNTS %s" % barrel_ports)
	for port: Dictionary in map.exit_ports(descriptor):
		var ramp: Dictionary = port["road"]
		var port_id := "I-90_X11-%s-port" % ramp["id"]
		owned_ports.append(port_id)
		check("actual owned %s independently has at least three gore barrels" % port_id,int(barrel_ports.get(port_id,0))>=3)
		if int(barrel_ports.get(port_id, 0)) >= 3:
			continue
		var points: PackedVector2Array = ramp["pts"]
		var total := 0.0
		for i: int in range(points.size() - 1):
			total += points[i].distance_to(points[i + 1])
		var mouth: Vector2 = port["pos"]
		var cell := Vector2i(floori(mouth.x / 128.0), floori(mouth.y / 128.0))
		var center := Vector3((cell.x + 0.5) * 128.0, 0, (cell.y + 0.5) * 128.0)
		var exclusions: Array = main.stream._ruin_exclusions(center, "%d,%d" % [cell.x, cell.y])
		for distance: float in [35.0, 40.0, 45.0, 50.0, 55.0, 60.0, 65.0, 70.0, 75.0]:
			var sample: Dictionary = main.stream._road_station(ramp, distance if String(port["role"]) == "off" else total - distance)
			var p: Vector2 = sample["pos"]
			var projected: Dictionary = ProtoUSMap._project_road(map.road_by_id("I-90"), p)
			var outward: Vector2 = (p - (projected["pos"] as Vector2)).normalized()
			var candidate: Vector2 = (p + (projected["pos"] as Vector2)) * 0.5 + outward * 4.5
			var conflicts: Array = []
			for rect: Array in exclusions:
				if not main.stream._ruin_footprint_clear(Vector3(candidate.x, 0, candidate.y), Vector3(0.85, 0.9, 0.85), 0.0, [rect]):
					conflicts.append(rect)
			print("ROAD GORE CANDIDATE %s d=%.0f pos=%s conflicts=%s" % [ramp["id"], distance, candidate, conflicts])
	check("actual gore barrels exist outside every full road footprint", _gore_gate(inventory,owned_ports))
	_gore_ownership_negative(map,chunks,owned_ports)


func _gore_inventory(map: ProtoUSMap, chunks: Array[Node3D]) -> Dictionary:
	var total := 0
	var bad := 0
	var ports: Dictionary = {}
	for chunk: Node3D in chunks:
		for node: Node in chunk.get_children():
			if not node is StaticBody3D or not node.has_meta("gore_barrel"):
				continue
			total += 1
			var port_id := String(node.get_meta("gore_barrel"))
			ports[port_id] = int(ports.get(port_id,0))+1
			for road: Dictionary in map.road_segments_near(node.global_position,30.0):
				var xz := Vector2(node.global_position.x,node.global_position.z)
				if ProtoUSMap._seg_dist(xz,road["a"],road["b"])<float(ProtoUSMap.road_geometry(road)["width"])*0.5+0.4:
					bad += 1
					print("ROAD BAD BARREL id=%s pos=%s overlaps=%s" % [port_id,node.global_position,road["id"]])
	return {"total":total,"bad":bad,"ports":ports}


func _gore_gate(inventory: Dictionary, owned_ports: Array[String]) -> bool:
	if int(inventory["total"])<12 or int(inventory["bad"])!=0 or owned_ports.size()!=4:
		return false
	for port_id: String in owned_ports:
		if int(inventory["ports"].get(port_id,0))<3:
			return false
	return true


func _gore_ownership_negative(map: ProtoUSMap, chunks: Array[Node3D], owned_ports: Array[String]) -> void:
	var before := _gore_inventory(map,chunks)
	var subject: StaticBody3D = null
	for chunk: Node3D in chunks:
		for node: Node in chunk.get_children():
			if node is StaticBody3D and String(node.get_meta("gore_barrel",""))==owned_ports[0]:
				subject = node
				break
		if subject!=null:
			break
	check("barrel ownership negative uses an actual owned materialized barrel",subject!=null)
	if subject==null:
		return
	var original_parent := subject.get_parent()
	var original_index := subject.get_index()
	var pose := subject.global_transform
	var holding := Node3D.new()
	main.add_child(holding)
	# Synchronous inventory fixture only: no physics/input frame occurs with
	# the real barrel withheld, and no real-drive scene or road data is altered.
	subject.reparent(holding,true)
	var unrelated := subject.duplicate() as StaticBody3D
	unrelated.set_meta("gore_barrel","UNRELATED-PORT-counterexample")
	original_parent.add_child(unrelated)
	unrelated.global_transform = pose
	var mutated := _gore_inventory(map,chunks)
	check("missing-port fixture preserves total barrels and full-road overlap result",mutated["total"]==before["total"] and mutated["bad"]==before["bad"])
	check("missing-port fixture actually removes one owned count and adds unrelated hardware",int(mutated["ports"].get(owned_ports[0],0))==int(before["ports"].get(owned_ports[0],0))-1 and int(mutated["ports"].get("UNRELATED-PORT-counterexample",0))==1)
	check("actual gore gate rejects a missing owned barrel despite compensating unrelated hardware",not _gore_gate(mutated,owned_ports))
	unrelated.free()
	subject.reparent(original_parent,true)
	original_parent.move_child(subject,original_index)
	holding.free()
	check("barrel ownership negative restores every original materialized count",_gore_inventory(map,chunks)==before)


## The driven car's outside wheels fell into this highway-to-ramp gap. Probe
## the full tapered transfer, not just the two separately valid road rows.
func _port_transfer_floor(map: ProtoUSMap, port: Dictionary) -> void:
	var highway: Dictionary = map.road_by_id("I-90")
	var ramp: Dictionary = port["road"]
	var off := String(port["role"]) == "off"
	var sample: Dictionary = main.stream._road_station(highway, float(port["highway_arc_m"]) + (-15.0 if off else 15.0) * float(port["side"]))
	var travel: Vector2 = (sample["dir"] as Vector2) * float(port["side"])
	var right := Vector2(-travel.y, travel.x)
	var start: Vector2 = sample["pos"] + right * (float(ProtoUSMap.road_geometry(highway)["width"]) * 0.5 - 1.5)
	var mouth: Vector2 = port["pos"]
	var points: PackedVector2Array = ramp["pts"]
	var inward := (points[1] - points[0]).normalized() if off else (points[-2] - points[-1]).normalized()
	var normal := Vector2(-inward.y, inward.x)
	if normal.dot(right) < 0.0:
		normal = -normal
	var gaps := 0
	var occupied: Array[Vector3] = []
	for step: int in range(16):
		var t := float(step) / 15.0
		for lateral: float in [-0.9, -0.45, 0.0, 0.45, 0.9]:
			var a := start + right * 1.5 * lateral
			var b := mouth + normal * float(ProtoUSMap.road_geometry(ramp)["width"]) * 0.5 * lateral
			var xz := a.lerp(b, t)
			var p := Vector3(xz.x, lerpf(float(sample["height"]), _height_at(ramp, mouth), t) + 0.09, xz.y)
			var hit: Dictionary = main.get_world_3d().direct_space_state.intersect_ray(PhysicsRayQueryParameters3D.create(p + Vector3.UP * 0.24, p - Vector3.UP * 0.5, 1))
			gaps += int(hit.is_empty() or absf(float(hit["position"].y) - p.y) > 0.2)
			if not _envelope_hits(p).is_empty():
				occupied.append(p)
	var blocked := await _settled_obstructions(occupied)
	print("ROAD TRANSFER %s probes=80 gaps=%d blocked=%d" % [ramp["id"], gaps, blocked])
	check("actual %s full-width highway/ramp transfer has no floor gap or lip" % ramp["id"], gaps == 0 and blocked == 0)


## Catch the actual overhanging paint fragments and sawtooth pavement: real
## mesh vertices may not extend metres past the canonical path at each bend.
func _joined_visuals(map: ProtoUSMap, chunks: Array[Node3D], ids: Array[String]) -> void:
	var errors := {"road_center": 0.0, "road_slab": 0.0}
	var vertices := 0
	var collision_overhang := 0.0
	var collision_vertices := 0
	for chunk: Node3D in chunks:
		for node: Node in chunk.get_children():
			if node is StaticBody3D and String(node.get_meta("road_deck", "")) in ids:
				var road: Dictionary = map.road_by_id(String(node.get_meta("road_deck")))
				var half_width := float(ProtoUSMap.road_geometry(road)["width"]) * 0.5
				for child: Node in node.get_children():
					if not child is CollisionShape3D:
						continue
					var corners := PackedVector3Array()
					if child.shape is ConvexPolygonShape3D:
						corners = child.shape.points
					elif child.shape is BoxShape3D:
						for x: float in [-0.5, 0.5]:
							for z: float in [-0.5, 0.5]:
								corners.append(Vector3(x * child.shape.size.x, 0, z * child.shape.size.z))
					for corner: Vector3 in corners:
						var p: Vector3 = child.global_transform * corner
						collision_overhang = maxf(collision_overhang, float(ProtoUSMap._project_road(road, Vector2(p.x, p.z))["dist"]) - half_width)
						collision_vertices += 1
			if not node is MeshInstance3D:
				continue
			for tag: String in ["road_center", "road_slab"]:
				var rid := String(node.get_meta(tag, ""))
				if rid not in ids:
					continue
				var road: Dictionary = map.road_by_id(rid)
				var half_width := 0.175 if tag == "road_center" else float(ProtoUSMap.road_geometry(road)["width"]) * 0.5
				for local: Vector3 in node.mesh.get_faces():
					var point: Vector3 = node.global_transform * local
					var distance := float(ProtoUSMap._project_road(road, Vector2(point.x, point.z))["dist"])
					errors[tag] = maxf(float(errors[tag]), distance - half_width)
					vertices += 1
	print("ROAD VISUAL vertices=%d paint_overhang=%.4f pavement_overhang=%.4f" % [vertices, errors["road_center"], errors["road_slab"]])
	check("managed paint follows joined road without cap fragments", vertices > 100 and float(errors["road_center"]) < 0.12)
	check("managed pavement follows joined road without sawtooth caps", vertices > 100 and float(errors["road_slab"]) < 0.3)
	print("ROAD COLLISION JOIN vertices=%d overhang=%.4f" % [collision_vertices, collision_overhang])
	check("joined pavement has no invisible collision cap overhangs", collision_vertices > 100 and collision_overhang < 0.3)
	_prism_winding(chunks, ids)


## Godot's clockwise front faces must oppose their vertex-normal cross
## product. Test actual rendered triangles, including the exposed transfers;
## a reversed top can be black despite UP normals and correct collision.
func _prism_winding(chunks: Array[Node3D], ids: Array[String]) -> void:
	var top_faces := 0
	var side_faces := 0
	var reversed_top := 0
	var reversed_side := 0
	for chunk: Node3D in chunks:
		for node: Node in chunk.get_children():
			if not node is MeshInstance3D or not node.mesh is ArrayMesh:
				continue
			if String(node.get_meta("road_slab", "")) not in ids and not node.has_meta("road_port_transition"):
				continue
			for surface: int in node.mesh.get_surface_count():
				var arrays: Array = node.mesh.surface_get_arrays(surface)
				var vertices: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
				var normals: PackedVector3Array = arrays[Mesh.ARRAY_NORMAL]
				for i: int in range(0, vertices.size(), 3):
					var cross := (vertices[i + 1] - vertices[i]).cross(vertices[i + 2] - vertices[i]).normalized()
					var normal := (normals[i] + normals[i + 1] + normals[i + 2]).normalized()
					var reversed := cross.dot(normal) > -0.97
					if normal.y > 0.95:
						top_faces += 1
						reversed_top += int(reversed)
					elif absf(normal.y) < 0.5:
						side_faces += 1
						reversed_side += int(reversed)
	print("ROAD WINDING tops=%d reversed=%d sides=%d reversed=%d" % [top_faces, reversed_top, side_faces, reversed_side])
	check("actual road and transfer top triangles have outward clockwise winding", top_faces > 100 and reversed_top == 0)
	check("actual road and transfer side triangles have outward normals", side_faces > 100 and reversed_side == 0)


func _full_width_floor(road: Dictionary) -> void:
	var points: PackedVector2Array = road["pts"]
	var half_width := float(ProtoUSMap.road_geometry(road)["width"]) * 0.5 - 0.2
	var floors := 0
	var missing := 0
	var blocked := 0
	var first_block := ""
	var first_missing := ""
	var occupied: Array[Vector3] = []
	for i: int in range(points.size() - 1):
		var delta := points[i + 1] - points[i]
		var perp := Vector2(-delta.y, delta.x).normalized()
		var steps := maxi(1, ceili(delta.length() / 3.0))
		for step: int in range(steps + 1):
			var center := points[i].lerp(points[i + 1], float(step) / steps)
			for lateral: float in [-1.0, -0.5, 0.0, 0.5, 1.0]:
				var xz := center + perp * half_width * lateral
				var point := Vector3(xz.x, _height_at(road, center) + 0.09, xz.y)
				var ray := PhysicsRayQueryParameters3D.create(point + Vector3.UP * 0.24, point - Vector3.UP * 0.5, 1)
				var hit: Dictionary = main.get_world_3d().direct_space_state.intersect_ray(ray)
				floors += 1
				var no_floor := hit.is_empty() or absf(float(hit["position"].y) - point.y) > 0.2
				missing += int(no_floor)
				if no_floor and first_missing == "":
					var deep: Dictionary = main.get_world_3d().direct_space_state.intersect_ray(PhysicsRayQueryParameters3D.create(point + Vector3.UP * 0.24, point - Vector3.UP * 10.0, 1))
					var floor_info := "NO FLOOR WITHIN 10M"
					if not deep.is_empty():
						var floor_body: Node = deep["collider"]
						floor_info = "%s pos=%s meta=%s deck=%s" % [floor_body.get_path(), deep["position"], floor_body.get_meta_list(), floor_body.get_meta("road_deck", "")]
					first_missing = "segment=%d step=%d/%d lateral=%.1f point=%s row_y=%.4f ground_y=%.4f near_hit=%s deeper=%s" % [i, step, steps, lateral, point, _height_at(road, center), ProtoWorldBuilder.ground_y(xz.x, xz.y), hit, floor_info]
				var obstacles := _envelope_hits(point)
				if not obstacles.is_empty():
					occupied.append(point)
					if first_block == "":
						var body: Node = obstacles[0]["collider"]
						first_block = "%s at %s meta=%s" % [body.get_path(), point, body.get_meta_list()]
						_log_occupant(String(road["id"]), point, body)
	blocked = await _settled_obstructions(occupied)
	print("ROAD ENVELOPE %s probes=%d missing=%d blocked=%d first=%s" % [road["id"], floors, missing, blocked, first_block])
	if first_missing != "":
		print("ROAD MISSING %s %s" % [road["id"], first_missing])
	check(String(road["id"]) + " full-width physical floor at EVERY point", floors > 100 and missing == 0)
	check(String(road["id"]) + " full-width static geometry has no fixed/unknown blockers (all bodies queried)", blocked == 0)


## Contiguous boxes cover the spaces between the retained 6,460 floor/point
## probes. A half-metre trunk anywhere across a road must block this gate.
func _road_envelope_query(a: Vector3, b: Vector3, width: float) -> PhysicsShapeQueryParameters3D:
	var delta := b - a
	var shape := BoxShape3D.new()
	shape.size = Vector3(width, 2.2, Vector2(delta.x, delta.z).length() + 0.02)
	var query := PhysicsShapeQueryParameters3D.new()
	query.shape = shape
	query.transform = Transform3D(Basis(Vector3.UP, atan2(delta.x, delta.z)), (a + b) * 0.5 + Vector3.UP * 1.35)
	query.collision_mask = 1
	return query # NO exclusions, including live traffic and roadside trunks.


func _continuous_road_envelope(road: Dictionary, later_streamed: bool = false) -> void:
	var points: PackedVector2Array = road["pts"]
	var width := float(ProtoUSMap.road_geometry(road)["width"])
	var occupied: Array[PhysicsShapeQueryParameters3D] = []
	var boxes := 0
	var covered := 0.0
	var later_floor_gaps := 0
	var phase := "later-streamed town-end" if later_streamed else "all-materialized"
	for i: int in range(points.size() - 1):
		var steps := maxi(1, ceili(points[i].distance_to(points[i + 1]) / 3.0))
		for step: int in steps:
			var a := points[i].lerp(points[i + 1], float(step) / steps)
			var b := points[i].lerp(points[i + 1], float(step + 1) / steps)
			if later_streamed and ((a + b) * 0.5).distance_to(points[-1]) > 180.0:
				continue
			var query := _road_envelope_query(Vector3(a.x, _height_at(road, a) + 0.09, a.y), Vector3(b.x, _height_at(road, b) + 0.09, b.y), width)
			if later_streamed:
				var pavement := query.transform.origin - Vector3.UP * 1.35
				var floor_hit: Dictionary = main.get_world_3d().direct_space_state.intersect_ray(PhysicsRayQueryParameters3D.create(pavement + Vector3.UP * 0.24, pavement - Vector3.UP * 0.5, 1))
				later_floor_gaps += int(floor_hit.is_empty() or absf(float(floor_hit["position"].y) - pavement.y) > 0.2)
			var hits: Array[Dictionary] = main.get_world_3d().direct_space_state.intersect_shape(query, 32)
			boxes += 1
			covered += a.distance_to(b)
			if not hits.is_empty():
				if occupied.is_empty():
					_log_occupant("CONTINUOUS " + phase + " " + String(road["id"]), query.transform.origin, hits[0]["collider"])
				occupied.append(query)
	var blocked := await _settled_full_boxes(occupied)
	print("ROAD CONTINUOUS %s phase=%s boxes=%d length=%.2fm width=%.2fm initial_occupied=%d final_fixed_unknown=%d exclusions=0" % [road["id"], phase, boxes, covered, width, occupied.size(), blocked])
	check("%s %s continuous full-width static geometry has no fixed/unknown blockers" % [road["id"], phase], boxes > 40 and covered > 120.0 and blocked == 0)
	if later_streamed:
		print("ROAD LATER STREAMED actual_midpoint_floors=%d missing=%d" % [boxes, later_floor_gaps])
		check("later-streamed feeder has actual floor throughout queried region", boxes > 40 and later_floor_gaps == 0)


func _settled_full_boxes(queries: Array[PhysicsShapeQueryParameters3D]) -> int:
	if queries.is_empty():
		return 0
	var initial_fixed := 0
	var initial_gameplay := 0
	for query: PhysicsShapeQueryParameters3D in queries:
		var hits: Array[Dictionary] = main.get_world_3d().direct_space_state.intersect_shape(query, 32)
		var fixed := _fixed_hits(hits)
		initial_fixed += int(fixed > 0)
		initial_gameplay += int(fixed < hits.size())
	await frames(60)
	var remaining := 0
	var occupied := 0
	var gameplay := 0
	for query: PhysicsShapeQueryParameters3D in queries:
		# Recheck the SAME full-width boxes, never the old sparse point query.
		var hits: Array[Dictionary] = main.get_world_3d().direct_space_state.intersect_shape(query, 32)
		if not hits.is_empty():
			if occupied == 0:
				_log_occupant("CONTINUOUS FINAL after=60physicsframes", query.transform.origin, hits[0]["collider"])
			occupied += 1
			remaining += int(_fixed_hits(hits) > 0)
			gameplay += int(_fixed_hits(hits) < hits.size())
	print("ROAD FULL-BOX OCCUPANCY initial_occupied=%d initial_fixed_unknown=%d initial_live_gameplay=%d final_occupied=%d final_fixed_unknown=%d final_live_gameplay=%d after=60physicsframes exclusions=0" % [queries.size(), initial_fixed, initial_gameplay, occupied, remaining, gameplay])
	return remaining


## Recognition is identity/registration based, NEVER a physics-class filter.
## Dormant living actors stay honestly occupied; unknown/scenery bodies fail.
func _live_road_occupant(body: Node) -> bool:
	if not is_instance_valid(body) or not main.is_ancestor_of(body):
		return false
	if body is ProtoTraffic.TrafficAgent:
		return body.traffic == main.traffic and main.traffic.agents.has(body) and main.traffic.is_physics_processing()
	if body is ProtoLurker and body.get_script() == preload("res://proto3d/lurker.gd"):
		return not body.dead and body.body.hp > 0.0 and body.is_in_group("threat") and body.is_in_group("combatant") and body.is_physics_processing()
	return false


func _fixed_hits(hits: Array[Dictionary]) -> int:
	var fixed := 0
	for hit: Dictionary in hits:
		fixed += int(not _live_road_occupant(hit["collider"]))
	return fixed


func _log_occupant(label: String, point: Vector3, body: Node) -> void:
	var script: Script = body.get_script()
	print("ROAD INITIAL OCCUPANCY %s point=%s body=%s class=%s script=%s meta=%s" % [label, point, body.get_path(), body.get_class(), script.resource_path if script != null else "native", body.get_meta_list()])
	for ancestor: Node in [body, body.get_parent(), body.get_parent().get_parent()]:
		print("ROAD OCCUPANT DETAIL node=%s position=%s placement=%s building=%s" % [ancestor.name, ancestor.global_position if ancestor is Node3D else Vector3.ZERO, ancestor.get_meta("placement_id", ""), ancestor.get_meta("building", "")])
	for child: Node in body.get_children():
		if child is CollisionShape3D:
			print("ROAD OCCUPANT SHAPE position=%s size=%s" % [child.global_position, child.shape.size if child.shape is BoxShape3D else child.shape.get_class()])
	if body is ProtoChest:
		print("ROAD OCCUPANT CHEST label=%s" % body.container.label)


## Traffic remains alive and ALL categories stay in the query. An occupied
## point gets one bounded second to clear naturally; stationary blockers
## still fail. Record initial/final counts instead of excluding cars.
func _settled_obstructions(points: Array[Vector3]) -> int:
	if points.is_empty():
		return 0
	var initial_fixed := 0
	var initial_gameplay := 0
	for point: Vector3 in points:
		var hits := _envelope_hits(point)
		var fixed := _fixed_hits(hits)
		initial_fixed += int(fixed > 0)
		initial_gameplay += int(fixed < hits.size())
	await frames(60)
	var remaining := 0
	var occupied := 0
	var gameplay := 0
	for point: Vector3 in points:
		var hits := _envelope_hits(point)
		occupied += int(not hits.is_empty())
		remaining += int(_fixed_hits(hits) > 0)
		gameplay += int(_fixed_hits(hits) < hits.size())
	print("ROAD POINT OCCUPANCY initial_occupied=%d initial_fixed_unknown=%d initial_live_gameplay=%d final_occupied=%d final_fixed_unknown=%d final_live_gameplay=%d after=60physicsframes exclusions=0" % [points.size(), initial_fixed, initial_gameplay, occupied, remaining, gameplay])
	return remaining


func _bridge_clearance(map: ProtoUSMap) -> void:
	var cross: Dictionary = map.road_by_id("I-90_X11-crossroad")
	var highway: Dictionary = map.road_by_id("I-90")
	var anchor: Vector2 = Vector2.ZERO
	for row: Dictionary in map.exits:
		if String(row["id"]) == "I-90_X11":
			anchor = row["pos"]
	var projection: Dictionary = ProtoUSMap._project_road(highway, anchor)
	var dir: Vector2 = projection["dir"]
	var perp := Vector2(-dir.y, dir.x)
	var deck_separation := _height_at(cross, anchor) - _height_at(highway, anchor)
	var min_headroom := INF
	var clear := true
	for lateral: float in [-9.0, -6.0, -3.0, 3.0, 6.0, 9.0]:
		var xz: Vector2 = projection["pos"] + perp * lateral
		var pavement := Vector3(xz.x, _height_at(highway, xz) + 0.09, xz.y)
		var floor_hit: Dictionary = main.get_world_3d().direct_space_state.intersect_ray(PhysicsRayQueryParameters3D.create(pavement + Vector3.UP * 0.2, pavement - Vector3.UP * 0.5, 1))
		var ceiling: Dictionary = main.get_world_3d().direct_space_state.intersect_ray(PhysicsRayQueryParameters3D.create(pavement + Vector3.UP * 0.25, pavement + Vector3.UP * 9.0, 1))
		clear = clear and not floor_hit.is_empty() and not ceiling.is_empty() and _envelope_hits(pavement).is_empty()
		if not ceiling.is_empty():
			min_headroom = minf(min_headroom, float(ceiling["position"].y) - pavement.y)
	var median_point := Vector3(anchor.x, _height_at(highway, anchor) + 0.4, anchor.y)
	var median: Dictionary = main.get_world_3d().direct_space_state.intersect_ray(PhysicsRayQueryParameters3D.create(median_point - Vector3(perp.x, 0, perp.y) * 2.0, median_point + Vector3(perp.x, 0, perp.y) * 2.0, 1))
	print("BRIDGE deck_top_separation=%.3fm measured_underside_headroom=%.3fm" % [deck_separation, min_headroom])
	check("bridge deck-top separation at least 6.2m", deck_separation >= 6.19)
	check("both underlying carriageways have floor and >=5.5m actual underside headroom", clear and min_headroom >= 5.5)
	check("physical median remains intact below overpass", not median.is_empty() and (median["collider"] as Node).has_meta("road_barrier"))

func _ready() -> void:
	var owned: String = ProjectSettings.globalize_path("res://../build/").replace("\\", "/").simplify_path().to_lower().trim_suffix("/") + "/"
	var profile: String = OS.get_user_data_dir().replace("\\", "/").simplify_path().to_lower()
	if not profile.begins_with(owned):
		print("ROAD SURFACE: REFUSED non-build save profile")
		get_tree().quit(2)
		return
	get_tree().create_timer(130).timeout.connect(func() -> void: get_tree().quit(2))
	for argument: String in OS.get_cmdline_user_args():
		if argument.begins_with("--output="):
			output = argument.trim_prefix("--output=").replace("\\", "/").simplify_path()
	if not output.is_empty():
		if not output.to_lower().begins_with(owned) or DisplayServer.get_name() == "headless":
			get_tree().quit(2)
			return
		if DirAccess.make_dir_recursive_absolute(output) != OK:
			get_tree().quit(2)
			return
	main = load("res://proto3d/proto3d.tscn").instantiate()
	add_child(main)
	await frames(15)
	if not output.is_empty():
		get_window().size = Vector2i(1280,720)
	await key(KEY_E, true)
	await key(KEY_E, false)
	check("actual E exits starter car", main.mode == main.Mode.FOOT)
	main.daynight.hour = 11.0
	main.daynight.dev_mult = 0.0
	# Photographic staging, not evidence of travelling from Virginia to Seattle.
	var at := Vector3(-56064, 12, -17888)
	main.player.global_position = at
	main.player.velocity = Vector3.ZERO
	main.cam_rig.zoom_t = 0.75
	for i: int in 70:
		main.stream.update_stream(at, main)
		await frames(1)
	main.cam_rig.snap_to_target()
	await frames(30)
	await capture("01_seattle_approach")
	var slabs: Array[MeshInstance3D] = []
	for chunk: Node3D in main.stream.loaded.values():
		for child: Node in chunk.get_children():
			if child is MeshInstance3D and child.has_meta("road_slab"):
				slabs.append(child as MeshInstance3D)
	check("real road slabs loaded around photographed approach", slabs.size() > 5)
	# Check the actual top faces and physics floor, not surface_at's abstract
	# road classification (which remains 'road' when terrain buries the mesh).
	await run_checks(slabs, at)
	if not output.is_empty():
		var manifest := FileAccess.open(output.path_join("manifest.json"),FileAccess.WRITE)
		if manifest == null:
			check("capture manifest can be written",false)
		else:
			manifest.store_string(JSON.stringify({"scene":get_script().resource_path,"passed":passed,"failed":failed,"captures":captures},"\t"))
			manifest.close()
	main.queue_free()
	await frames(8)
	main = null
	print("ROAD SURFACE RESULTS: %d passed, %d failed" % [passed,failed])
	get_tree().quit(0 if failed == 0 else 1)
