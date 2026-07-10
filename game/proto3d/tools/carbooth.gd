## ⚒ THE CAR BOOTH — photobooth's sibling for RIGS: spawns vehicles in staged
## damage states and renders top-down + three-quarter PNGs so exhaust/damage
## reads get DIAGNOSED FROM PICTURES, not described.
## Needs a real GPU context — run WITHOUT --headless (dummy driver renders blank):
##   Godot_v4.5.1-stable_win64_console.exe --path game res://proto3d/tools/carbooth.tscn
extends Node3D

const OUT := "C:/WINDOWS/TEMP/claude/D--git-carworld/0f71b692-94b3-495a-9db8-c96fa73de59a/scratchpad/carbooth"
const SHOT := 900

var _sv: SubViewport
var _cam: Camera3D


func _ready() -> void:
	DirAccess.make_dir_recursive_absolute(OUT)
	DrivnData.ensure()
	_sv = SubViewport.new()
	_sv.size = Vector2i(SHOT, SHOT)
	_sv.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	_sv.transparent_bg = false
	add_child(_sv)
	var env := WorldEnvironment.new()
	var e := Environment.new()
	e.background_mode = Environment.BG_COLOR
	e.background_color = Color(0.16, 0.17, 0.19)
	e.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	e.ambient_light_color = Color(0.5, 0.5, 0.55)
	e.ambient_light_energy = 0.6
	env.environment = e
	_sv.add_child(env)
	var key := DirectionalLight3D.new()
	key.rotation = Vector3(deg_to_rad(-42.0), deg_to_rad(-38.0), 0.0)
	key.light_energy = 1.1
	_sv.add_child(key)
	var floor_mesh := MeshInstance3D.new()
	var pm := PlaneMesh.new()
	pm.size = Vector2(24, 24)
	floor_mesh.mesh = pm
	floor_mesh.material_override = ProtoWorldBuilder.material(Color(0.10, 0.11, 0.12), 0.9)
	_sv.add_child(floor_mesh)
	_cam = Camera3D.new()
	_sv.add_child(_cam)

	# SUBJECTS: [vclass, chassis_ratio (-1 = husk), label]
	var subjects: Array = [
		["scavenger", 0.5, "scav_smoking"],
		["semi", 0.5, "semi_stack"],
		["scavenger", -1.0, "husk"],
	]
	for s_row in subjects:
		var row: Array = s_row
		await _shoot(String(row[0]), float(row[1]), String(row[2]))
	print("CARBOOTH: done")
	get_tree().quit(0)


func _shoot(vc: String, ratio: float, label: String) -> void:
	var car := ProtoCar3D.create(vc, Color(0.45, 0.28, 0.2))
	car.freeze = true # a studio stand, not a road — no floor collision needed
	car.position = Vector3(0, 0.7, 0)
	_sv.add_child(car)
	await get_tree().physics_frame
	if ratio < 0.0:
		car._become_husk(false)
	else:
		car.components["chassis"].hp = car.components["chassis"].max_hp * ratio
	if OS.get_environment("CARBOOTH_HIDE_SMOKE") == "1" and ratio > 0.0:
		car._ensure_smoke().visible = false # isolation probe: is the artifact the emitter?
	# Let the plume develop PAST one full emission cycle (lifetime 2.2s) — in the
	# first cycle the not-yet-spawned slots are suspects for origin artifacts.
	for _f in 170:
		await get_tree().process_frame
	var views: Array = [
		["topdown", Vector3(0, 16.0, 0.8), Vector3.ZERO],
		["rear34", Vector3(3.6, 2.6, 5.4), Vector3(0, 0.6, 0)],
	]
	for v_row in views:
		var view: Array = v_row
		var vname: String = view[0]
		var vpos: Vector3 = view[1]
		var vlook: Vector3 = view[2]
		_cam.position = vpos
		_cam.look_at(vlook, Vector3(0, 0, -1) if vname == "topdown" else Vector3.UP)
		await RenderingServer.frame_post_draw
		await get_tree().process_frame
		await RenderingServer.frame_post_draw
		var img := _sv.get_texture().get_image()
		var path := "%s/%s_%s.png" % [OUT, label, vname]
		print("CARBOOTH: %s (%s)" % [path, "ok" if img.save_png(path) == OK else "ERR"])
	car.queue_free()
	await get_tree().process_frame
