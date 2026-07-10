## Render the I2 SILHOUETTE PASS so the category reads are judged by eye:
## three rows of five category representatives, shot 3/4-high (the top-down
## game read). A brown-box lineup fails; a canopy/steeple/stack/marquee/cross
## lineup passes. Output → docs/acceptance/iter3/.
## Run: Godot_console --path game res://proto3d/tools/render_structures.tscn
extends Node3D

const OUT := "res://../docs/acceptance/iter3"
const SHOTS: Array = [
	["sheet1", ["gas_station_small", "market_general", "house_small", "police_station", "clinic_small"]],
	["sheet2", ["church_small", "school_small", "fight_pit", "warehouse", "checkpoint_road"]],
	["sheet3", ["monument_plaza", "radio_station", "clone_wing", "still_shack"]],
	["sheet4", ["military_base_shell"]], # the giant gets its own frame — sharing one wrecked the lineup
]

var _cam: Camera3D


func _ready() -> void:
	var out_abs := ProjectSettings.globalize_path(OUT)
	DirAccess.make_dir_recursive_absolute(out_abs)
	var env := WorldEnvironment.new()
	var e := Environment.new()
	e.background_mode = Environment.BG_COLOR
	e.background_color = Color(0.3, 0.32, 0.36)
	e.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	e.ambient_light_color = Color(0.62, 0.64, 0.7)
	e.ambient_light_energy = 1.2
	env.environment = e
	add_child(env)
	var key := DirectionalLight3D.new()
	key.rotation_degrees = Vector3(-55, -30, 0)
	key.light_energy = 1.6
	add_child(key)
	var floor_mesh := MeshInstance3D.new()
	var pm := PlaneMesh.new()
	pm.size = Vector2(220, 80)
	floor_mesh.mesh = pm
	floor_mesh.material_override = ProtoWorldBuilder.material(Color(0.2, 0.2, 0.19), 0.95)
	add_child(floor_mesh)
	_cam = Camera3D.new()
	_cam.current = true
	add_child(_cam)

	DrivnData.ensure_structures()
	for shot in SHOTS:
		var name_s: String = shot[0]
		var ids: Array = shot[1]
		var built: Array = []
		# FOOTPRINT-AWARE spacing (the judge's sheet-3 fail: a fixed 22 m grid
		# let a giant footprint swallow its neighbors) + camera fitted to the
		# real row width.
		var x := 0.0
		for sid in ids:
			var row: DrivnStructure = DrivnData.structures.get(String(sid))
			var fw: float = row.footprint_m.x if row != null else 12.0
			var s := ProtoStructureBuilder.materialize(String(sid))
			if s != null:
				add_child(s)
				s.global_position = Vector3(x + fw * 0.5, 0, 0)
				built.append(s)
			x += fw + 10.0
		for s in built:
			(s as Node3D).global_position.x -= x * 0.5 # center the row
		for _f in 6:
			await get_tree().process_frame
		await _shot(name_s, Vector3(0, maxf(26.0, x * 0.42), maxf(34.0, x * 0.55)), Vector3(0, 1.5, 0))
		for s in built:
			s.queue_free()
		for _f in 3:
			await get_tree().process_frame

	print("RENDER: structures done")
	get_tree().quit(0)


func _shot(name_s: String, cam_pos: Vector3, look: Vector3) -> void:
	_cam.position = cam_pos
	_cam.look_at(look, Vector3.UP)
	for _f in 4:
		await get_tree().process_frame
	await RenderingServer.frame_post_draw
	await get_tree().process_frame
	await RenderingServer.frame_post_draw
	var img := get_viewport().get_texture().get_image()
	var path := "%s/STRUCT_%s.png" % [ProjectSettings.globalize_path(OUT), name_s]
	print("RENDER: %s -> %s" % [name_s, "ok" if img.save_png(path) == OK else "ERR"])
