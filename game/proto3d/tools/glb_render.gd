## Render ProtoSkelPuppet at the game angle (all-humanoids migration step): the
## authored body, arms DOWN out of T-pose, standing naturally in-engine.
extends Node3D

const OUT := "C:/WINDOWS/TEMP/claude/D--git-carworld/8e9f2702-dbfb-45a1-aec4-96ecf44518c7/scratchpad/photobooth"

func _ready() -> void:
	DirAccess.make_dir_recursive_absolute(OUT)
	var sv := SubViewport.new()
	sv.size = Vector2i(760, 900)
	sv.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	add_child(sv)
	var env := WorldEnvironment.new()
	var e := Environment.new()
	e.background_mode = Environment.BG_COLOR
	e.background_color = Color(0.16, 0.17, 0.19)
	e.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	e.ambient_light_color = Color(0.55, 0.55, 0.6); e.ambient_light_energy = 0.7
	env.environment = e
	sv.add_child(env)
	var key := DirectionalLight3D.new()
	key.rotation = Vector3(deg_to_rad(-45.0), deg_to_rad(-35.0), 0.0); key.light_energy = 1.1
	sv.add_child(key)
	var floor_mesh := MeshInstance3D.new()
	var pm := PlaneMesh.new(); pm.size = Vector2(10, 10)
	floor_mesh.mesh = pm
	floor_mesh.material_override = ProtoWorldBuilder.material(Color(0.10, 0.11, 0.12), 0.9)
	sv.add_child(floor_mesh)

	var p := ProtoSkelPuppet.create({})
	sv.add_child(p) # placed at origin, EXACTLY like player_3d adds it (no drop)
	for _f in 4:
		await get_tree().process_frame
	# Run the animated idle the way the game does, so this matches in-game.
	for _f in 40:
		p.animate(1.0 / 60.0, 0.0, 0.0, false, 0.0, false)
		await get_tree().process_frame
	var aabb := _combined_aabb(p)
	print("GLB_RENDER: in-place size=%.2v feet_y=%.3f (want ~0)" % [aabb.size, aabb.position.y])

	var cam := Camera3D.new()
	sv.add_child(cam)
	cam.position = Vector3(0.0, 2.35, 2.0) # ~41° game angle, framed on the body
	cam.look_at(Vector3(0.0, 0.95, 0.0), Vector3.UP)
	for _f in 4:
		await get_tree().process_frame
	await RenderingServer.frame_post_draw
	await get_tree().process_frame
	await RenderingServer.frame_post_draw
	var img := sv.get_texture().get_image()
	print("GLB_RENDER: %s (%s)" % ["_SKEL_IDLE.png", "ok" if img.save_png("%s/_SKEL_IDLE.png" % OUT) == OK else "ERR"])
	get_tree().quit(0)

func _combined_aabb(n: Node) -> AABB:
	var out := AABB(); var first := true
	for m in _meshes(n):
		var mi := m as MeshInstance3D
		var world := mi.global_transform * mi.get_aabb()
		if first: out = world; first = false
		else: out = out.merge(world)
	return out

func _meshes(n: Node) -> Array:
	var o: Array = []
	if n is MeshInstance3D and (n as MeshInstance3D).mesh != null: o.append(n)
	for c in n.get_children(): o.append_array(_meshes(c))
	return o
