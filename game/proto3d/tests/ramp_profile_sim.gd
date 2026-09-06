extends "res://proto3d/tests/road_surface_sim.gd"
## Terrain-profile and short-span rendering proof. This deliberately does NOT
## replace road_surface_sim's broader, still-failing median-clearance gate.

func run_checks(slabs: Array[MeshInstance3D], at: Vector3) -> void:
	for rid: String in ["I-90", "I-90_X11-off", "I-90_X11-on", "I-90_X11-off-r", "I-90_X11-on-r"]:
		probe_road(rid,slabs,at,true)
	# Two consecutive 3.9075m real I-5 exit segments used to be discarded by
	# the renderer's <=4m shortcut. Their neighbors' end caps leave a real gap.
	var west := Vector3(-53751.5936,0,1672.0431)
	west.y = ProtoWorldBuilder.ground_y(west.x,west.z) + 1
	main.player.global_position = west
	main.player.velocity = Vector3.ZERO
	for i: int in 70:
		main.stream.update_stream(west,main)
		await frames(1)
	main.cam_rig.snap_to_target()
	await frames(20)
	await capture("02_i5_short_ramp_section")
	var polygons: Array[PackedVector2Array] = []
	for chunk: Node3D in main.stream.loaded.values():
		for node: Node in chunk.get_children():
			if not node is MeshInstance3D or String(node.get_meta("road_slab","")) != "I-5_X7-off" or not node.mesh is BoxMesh:
				continue
			var size: Vector3 = node.mesh.size
			var polygon := PackedVector2Array()
			for corner: Vector3 in [Vector3(-size.x,0,-size.z),Vector3(size.x,0,-size.z),Vector3(size.x,0,size.z),Vector3(-size.x,0,size.z)]:
				var point: Vector3 = node.global_transform * (corner*0.5)
				polygon.append(Vector2(point.x,point.z))
			polygons.append(polygon)
	check("actual I-5 exit pavement is loaded",polygons.size() >= 2)
	for point: Vector2 in [Vector2(-53751.5936,1672.0431),Vector2(-53751.1266,1671.8644),Vector2(-53752.0606,1672.2218)]:
		var covered := false
		for polygon: PackedVector2Array in polygons:
			covered = covered or Geometry2D.is_point_in_polygon(point,polygon)
		check("short-span pavement is continuous at " + str(point),covered)
