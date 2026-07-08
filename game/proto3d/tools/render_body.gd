## Render the mannequin ProtoPuppet — idle, armed, walking, and a skinny/normal/fat
## lineup — so I can SEE proportions + the build param instead of iterating blind.
## Runs NON-headless (real GPU); the offscreen path hangs under --headless.
extends Node3D

const OUT := "C:/WINDOWS/TEMP/claude/D--git-carworld/02d9fd30-4d73-400e-825f-fb94da4cc1a7/scratchpad/photobooth"

var _cam: Camera3D


func _ready() -> void:
	DirAccess.make_dir_recursive_absolute(OUT)
	var env := WorldEnvironment.new()
	var e := Environment.new()
	e.background_mode = Environment.BG_COLOR
	e.background_color = Color(0.26, 0.28, 0.32)
	e.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	e.ambient_light_color = Color(0.6, 0.62, 0.68); e.ambient_light_energy = 1.15
	env.environment = e
	add_child(env)
	var key := DirectionalLight3D.new()
	key.rotation_degrees = Vector3(-50, -35, 0); key.light_energy = 1.7
	add_child(key)
	var fill := DirectionalLight3D.new()
	fill.rotation_degrees = Vector3(-20, 140, 0); fill.light_energy = 0.6
	add_child(fill)
	var floor_mesh := MeshInstance3D.new()
	var pm := PlaneMesh.new(); pm.size = Vector2(12, 12)
	floor_mesh.mesh = pm
	floor_mesh.material_override = ProtoWorldBuilder.material(Color(0.09, 0.10, 0.11), 0.95)
	add_child(floor_mesh)

	_cam = Camera3D.new()
	_cam.current = true
	add_child(_cam)

	# --- 1) Default IDLE, facing camera, 3/4 view ---
	var idle: ProtoPuppet = await _make({}, false, 0.0, PI)
	await _shot("idle", Vector3(2.1, 1.4, 2.4), Vector3(0.0, 1.0, 0.0))
	idle.queue_free()

	# --- 2) ARMED (gun raised), 3/4 ---
	var armed: ProtoPuppet = await _make({}, true, 0.0, PI)
	await _shot("armed", Vector3(2.1, 1.4, 2.4), Vector3(0.0, 1.0, 0.0))
	armed.queue_free()

	# --- 3) WALKING mid-stride, side-on ---
	var walk: ProtoPuppet = await _make({}, false, 4.0, PI * 0.5)
	await _shot("walk", Vector3(3.4, 1.1, 0.2), Vector3(0.0, 1.0, 0.0))
	walk.queue_free()

	# --- 4) BUILD LINEUP: skinny / normal / heavy, front ---
	var skinny: ProtoPuppet = await _make({"build": 0.0}, false, 0.0, PI); skinny.position.x = -1.3
	var normal: ProtoPuppet = await _make({"build": 1.0}, false, 0.0, PI)
	var heavy: ProtoPuppet = await _make({"build": 2.0}, false, 0.0, PI); heavy.position.x = 1.3
	for _f in 20:
		skinny.animate(0.016, 0.0, 0.0, false, 0.0, false)
		normal.animate(0.016, 0.0, 0.0, false, 0.0, false)
		heavy.animate(0.016, 0.0, 0.0, false, 0.0, false)
		await get_tree().process_frame
	await _shot("builds", Vector3(0.0, 1.15, 3.9), Vector3(0.0, 1.0, 0.0))
	get_tree().quit(0)


func _make(app: Dictionary, armed: bool, speed: float, face_y: float) -> ProtoPuppet:
	var p := ProtoPuppet.create(app)
	add_child(p)
	p.rotation.y = face_y
	p.raised = armed
	p.set_armed(armed)
	for _f in 3:
		await get_tree().process_frame
	for _i in 24:
		p.animate(0.016, speed, 0.0, armed, 0.0, false)
		await get_tree().process_frame
	return p


func _shot(name: String, cam_pos: Vector3, look: Vector3) -> void:
	_cam.position = cam_pos
	_cam.look_at(look, Vector3.UP)
	for _f in 4:
		await get_tree().process_frame
	await RenderingServer.frame_post_draw
	await get_tree().process_frame
	await RenderingServer.frame_post_draw
	var img := get_viewport().get_texture().get_image()
	print("RENDER: %s -> %s" % [name, "ok" if img.save_png("%s/BODY_%s.png" % [OUT, name]) == OK else "ERR"])
