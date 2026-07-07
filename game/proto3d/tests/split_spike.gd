## VISUAL SPIKE for the dynamic split-screen (finish pass): composes a textured ground,
## a flat-shaded BODY and a DRONE with the real ProtoSplitView, and screenshots BOTH
## states — merged (close) and split (far) — so the render can be judged for real.
## Run WINDOWED: Godot --path game res://proto3d/tests/split_spike.tscn
extends Node3D

var sv: ProtoSplitView
var body: Node3D
var drone: Node3D


func _capsule(pos: Vector3, color: Color) -> Node3D:
	var n := Node3D.new()
	add_child(n)
	n.global_position = pos
	var mi := MeshInstance3D.new()
	var cap := CapsuleMesh.new()
	cap.radius = 0.4
	cap.height = 1.8
	mi.mesh = cap
	var m := StandardMaterial3D.new()
	m.albedo_color = color
	mi.mesh.material = m
	mi.position.y = 1.0
	n.add_child(mi)
	return n


func _skinned(size: Vector3, pos: Vector3, skin_name: String) -> void:
	var mi := MeshInstance3D.new()
	var bm := BoxMesh.new()
	bm.size = size
	mi.mesh = bm
	mi.material_override = ProtoWorldBuilder.material_skin(skin_name, 1.0)
	mi.position = pos
	add_child(mi)


func _ready() -> void:
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color(0.42, 0.38, 0.33)
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(0.55, 0.5, 0.42)
	env.ambient_light_energy = 0.6
	var we := WorldEnvironment.new()
	we.environment = env
	add_child(we)
	var sun := DirectionalLight3D.new()
	sun.rotation = Vector3(deg_to_rad(-55), deg_to_rad(35), 0)
	add_child(sun)

	_skinned(Vector3(120, 0.4, 60), Vector3(20, -0.2, 0), "dirt")     # ground
	_skinned(Vector3(120, 0.05, 7), Vector3(20, 0.03, 0), "road")     # the road east
	_skinned(Vector3(4, 3, 4), Vector3(6, 1.5, -8), "metal")          # a shack
	_skinned(Vector3(6, 4, 0.4), Vector3(30, 2, 8), "wall")           # a wall out east

	body = _capsule(Vector3(0, 0, 0), Color(0.92, 0.87, 0.74))        # you
	drone = _capsule(Vector3(4, 8, 0), Color(0.3, 0.9, 0.5))          # the bird (green)

	sv = ProtoSplitView.create()
	add_child(sv)
	sv.activate(body, drone)

	await _shoot("user://split_merged.png")     # close → ONE seamless view
	drone.global_position = Vector3(52, 8, 0)   # fly it far east
	await _shoot("user://split_active.png")     # far → THE SPLIT
	print("SPIKE: done")
	get_tree().quit(0)


func _shoot(path: String) -> void:
	for _i in 14:
		await get_tree().process_frame
	await RenderingServer.frame_post_draw
	get_viewport().get_texture().get_image().save_png(path)
	print("SPIKE: saved %s" % ProjectSettings.globalize_path(path))
