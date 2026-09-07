extends "res://proto3d/tests/roadside_clearance_sim.gd"

func capture(id: String) -> void:
	await super.capture(id)
	if id == "03_return_ramp_after_drive":
		await _inspect_roof()

func _mesh_vertices(mesh: MeshInstance3D) -> PackedVector3Array:
	var result := PackedVector3Array()
	for vertex: Vector3 in mesh.mesh.get_faces():
		result.append(mesh.global_transform * vertex)
	return result

func _inspect_roof() -> void:
	var camera: Camera3D = main.cam_rig._cam
	# The root viewport uses1920x1080 stretch coordinates even though the
	# captured render is1280x720. Convert observed image pixels before ray pick.
	var pixel := Vector2(420, 402) * get_viewport().get_visible_rect().size / Vector2(1280,720)
	var origin := camera.project_ray_origin(pixel)
	var direction := camera.project_ray_normal(pixel)
	print("ROOF CAMERA transform=%s projection=%s fov=%s size=%s viewport=%s historical_position_delta=%s" % [camera.global_transform,
		camera.projection, camera.fov, camera.size, get_viewport().get_visible_rect(),
		camera.global_position - Vector3(-56204.05,59.68646,-17965.46)])
	var selected: MeshInstance3D = null
	var selected_hit := Vector3.ZERO
	var closest := INF
	for node: Node in main.find_children("*", "MeshInstance3D", true, false):
		var mesh := node as MeshInstance3D
		if mesh.mesh == null or not mesh.is_visible_in_tree() or Vector2(mesh.global_position.x-origin.x,mesh.global_position.z-origin.z).length() > 120:
			continue
		var vertices := _mesh_vertices(mesh)
		for index: int in range(0,vertices.size(),3):
			var hit: Variant = Geometry3D.ray_intersects_triangle(origin,direction,vertices[index],vertices[index+1],vertices[index+2])
			if hit != null and origin.distance_to(hit) < closest:
				closest = origin.distance_to(hit)
				selected = mesh
				selected_hit = hit
	check("same-stage roof pixel identifies actual nearest visible mesh triangle", selected != null)
	if selected == null:
		return
	# Do not assume this visibly boxy building has a separate0.3m roof layer:
	# the picked surface may be the top of its actual solid building body.
	var roof_identity := selected.mesh is BoxMesh and (selected.mesh as BoxMesh).size.x > 6 and (selected.mesh as BoxMesh).size.z > 6 and not selected.has_meta("road_slab") and selected.get_parent() is StaticBody3D
	check("roof-region pixel identifies a physical building-sized surface, not pavement",roof_identity)
	if not roof_identity:
		print("ROOF WRONG SURFACE path=%s mesh=%s metadata=%s" % [selected.get_path(),selected.mesh,selected.get_meta_list()])
		return
	var vertices := _mesh_vertices(selected)
	var bounds := AABB(vertices[0],Vector3.ZERO)
	var projected := PackedVector2Array()
	var highway: Dictionary = main.stream.usmap.road_by_id("I-90")
	var min_arc := INF
	var max_arc := -INF
	for vertex: Vector3 in vertices:
		bounds = bounds.expand(vertex)
		projected.append(camera.unproject_position(vertex))
		var projection: Dictionary = ProtoUSMap._project_road(highway,Vector2(vertex.x,vertex.z))
		min_arc = minf(min_arc,float(projection["arc_m"]))
		max_arc = maxf(max_arc,float(projection["arc_m"]))
	print("ROOF SELECTED path=%s instance=%s hit=%s mesh=%s size=%s bounds=%s screen_hull=%s road_arc=%s..%s color=%s" % [
		selected.get_path(),selected.get_instance_id(),selected_hit,selected.mesh.get_class(),(selected.mesh as BoxMesh).size,bounds,
		Geometry2D.convex_hull(projected),min_arc,max_arc,(selected.material_override as StandardMaterial3D).albedo_color])
	var ancestor: Node = selected
	while ancestor != null and ancestor != self:
		var metadata: Dictionary = {}
		for key_name: StringName in ancestor.get_meta_list():
			metadata[key_name] = str(ancestor.get_meta(key_name))
		print("ROOF ANCESTOR path=%s class=%s instance=%s metadata=%s" % [ancestor.get_path(),ancestor.get_class(),ancestor.get_instance_id(),metadata])
		ancestor = ancestor.get_parent()
	# All nearby physical boxes are enumerated, including untagged generated
	# roof/wall siblings. Same-position similarity is evidence, not invented IDs.
	var center := bounds.get_center()
	for node: Node in main.find_children("*", "CollisionShape3D", true, false):
		var shape := node as CollisionShape3D
		if not shape.shape is BoxShape3D or Vector2(shape.global_position.x-center.x,shape.global_position.z-center.z).length() > 12:
			continue
		var size: Vector3 = shape.shape.size
		var low := INF
		var high := -INF
		for x: float in [-0.5,0.5]:
			for y: float in [-0.5,0.5]:
				for z: float in [-0.5,0.5]:
					var vertex: Vector3 = shape.global_transform * (Vector3(x,y,z) * size)
					low = minf(low,vertex.y)
					high = maxf(high,vertex.y)
		print("ROOF NEARBY BOX path=%s body=%s size=%s transform=%s height=%s..%s" % [shape.get_path(),shape.get_parent().get_instance_id(),size,shape.global_transform,low,high])
	# The full longitudinal interval includes the roof plus a 6m vehicle at
	# either end. Query all six travel lanes, not only the photographed lane.
	min_arc = maxf(0,min_arc-6)
	max_arc += 6
	var geometry := ProtoUSMap.road_geometry(highway)
	var intervals := maxi(1,ceili((max_arc-min_arc)/3.0))
	var occupied: Array[PhysicsShapeQueryParameters3D] = []
	var floor_count := 0
	var missing := 0
	var box_count := 0
	for step: int in intervals:
		var arc_a := lerpf(min_arc,max_arc,float(step)/intervals)
		var arc_b := lerpf(min_arc,max_arc,float(step+1)/intervals)
		var a: Dictionary = ProtoRoadGraph._point_at(highway,arc_a)
		var b: Dictionary = ProtoRoadGraph._point_at(highway,arc_b)
		var tangent: Vector2 = a["dir"]
		var side := Vector2(-tangent.y,tangent.x)
		for sign_value: float in [-1.0,1.0]:
			for lane: int in int(geometry["per_side"]):
				var offset := ProtoUSMap.lane_offset(highway,lane)*sign_value
				var xz_a: Vector2 = a["pos"] + side*offset
				var xz_b: Vector2 = b["pos"] + side*offset
				var start := Vector3(xz_a.x,ProtoUSMap.elev_at(highway,arc_a)+0.09,xz_a.y)
				var end := Vector3(xz_b.x,ProtoUSMap.elev_at(highway,arc_b)+0.09,xz_b.y)
				var query := _road_envelope_query(start,end,ProtoUSMap.LANE_W)
				(query.shape as BoxShape3D).size.y = 3.6
				query.transform.origin = (start+end)*0.5 + Vector3.UP*2.0
				query.collision_mask = 0xFFFFFFFF
				box_count += 1
				var hits: Array[Dictionary] = main.get_world_3d().direct_space_state.intersect_shape(query,64)
				if not hits.is_empty():
					occupied.append(query)
					for hit: Dictionary in hits:
						_log_occupant("ROOF INTERVAL",query.transform.origin,hit["collider"])
				for lateral: float in [-1.0,0.0,1.0]:
					var middle := (start+end)*0.5 + Vector3(side.x,0,side.y)*lateral*(ProtoUSMap.LANE_W*0.5-0.02)
					var hit: Dictionary = main.get_world_3d().direct_space_state.intersect_ray(PhysicsRayQueryParameters3D.create(middle+Vector3.UP*0.24,middle-Vector3.UP*0.5,1))
					floor_count += 1
					missing += int(hit.is_empty() or absf(float(hit["position"].y)-middle.y)>0.2)
	var fixed := await _settled_full_boxes(occupied)
	print("ROOF INTERVAL arc=%s..%s lanes=%s boxes=%d height=3.6 all_layers=true exclusions=0 floor_probes=%d missing=%d initial_occupied=%d fixed_unknown=%d" % [
		min_arc,max_arc,geometry["lanes"],box_count,floor_count,missing,occupied.size(),fixed])
	check("identified roof interval has physical floor across every lane",floor_count>0 and missing==0)
	check("identified roof interval leaves every full-height lane clear",box_count>0 and fixed==0)
