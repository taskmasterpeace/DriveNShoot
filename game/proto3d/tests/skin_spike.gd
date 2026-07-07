## THE SPIKE (goal "pixel art, brought into 3D"): composes a safehouse block + a stretch of
## road with the pixel SKINS (NEAREST, texel-per-meter) and a FLAT-SHADED box actor beside
## them — so the "textured world, clean actors" contrast can be judged in-engine. Renders a
## real frame to a screenshot. Run WINDOWED (real GL) so it actually draws:
##   Godot --path game res://proto3d/tests/skin_spike.tscn
extends Node3D

const OUT := "user://skin_spike.png"


func _skinned(size: Vector3, pos: Vector3, skin_name: String) -> void:
	var mi := MeshInstance3D.new()
	var bm := BoxMesh.new()
	bm.size = size
	mi.mesh = bm
	mi.material_override = ProtoWorldBuilder.material_skin(skin_name, 1.0)  # 1 texture tile / metre
	mi.position = pos
	add_child(mi)


func _flat_actor(pos: Vector3, color: Color) -> void:
	# The clean actor: a flat-shaded box, NO texture — reads crisp against the busy ground.
	var mi := MeshInstance3D.new()
	var cap := CapsuleMesh.new()
	cap.radius = 0.4
	cap.height = 1.9
	mi.mesh = cap
	var m := StandardMaterial3D.new()
	m.albedo_color = color
	m.roughness = 0.9
	mi.mesh.material = m
	mi.position = pos + Vector3(0, 1.0, 0)
	add_child(mi)


func _ready() -> void:
	# Lighting + a warm wasteland ambient so the pixels read.
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color(0.45, 0.4, 0.34)
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(0.55, 0.5, 0.42)
	env.ambient_light_energy = 0.55
	var we := WorldEnvironment.new()
	we.environment = env
	add_child(we)
	var sun := DirectionalLight3D.new()
	sun.rotation = Vector3(deg_to_rad(-55), deg_to_rad(40), 0)
	sun.light_energy = 1.15
	add_child(sun)

	# GROUND — dry cracked dirt, wide.
	_skinned(Vector3(40, 0.4, 40), Vector3(0, -0.2, 0), "dirt")
	# ROAD — a stretch of cracked asphalt through it.
	_skinned(Vector3(7, 0.05, 40), Vector3(0, 0.03, 0), "road")
	# THE SAFEHOUSE BLOCK — concrete walls forming a corner, ~4 m tall.
	_skinned(Vector3(8, 4, 0.4), Vector3(6, 2, -6), "wall")
	_skinned(Vector3(0.4, 4, 8), Vector3(10, 2, -2), "wall")
	# A rusted metal shack beside it.
	_skinned(Vector3(4, 3, 4), Vector3(-8, 1.5, -5), "metal")

	# CLEAN ACTORS on the road — the contrast that's the whole trick.
	_flat_actor(Vector3(0, 0, 3), Color(0.9, 0.85, 0.72))
	_flat_actor(Vector3(1.4, 0, 6), Color(0.85, 0.35, 0.25))

	# Top-down angled camera — the game's framing (look_at_from_position: no in-tree gotcha).
	var cam := Camera3D.new()
	add_child(cam)
	cam.look_at_from_position(Vector3(3, 15, 15), Vector3(2, 1.5, -4), Vector3.UP)
	cam.fov = 55
	cam.make_current()

	# Let a few real frames draw, then grab the screenshot.
	for _i in 12:
		await get_tree().process_frame
	await RenderingServer.frame_post_draw
	var img := get_viewport().get_texture().get_image()
	img.save_png(OUT)
	print("SPIKE: screenshot saved to %s" % ProjectSettings.globalize_path(OUT))
	get_tree().quit(0)
