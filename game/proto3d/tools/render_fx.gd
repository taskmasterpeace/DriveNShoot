## ⚒ THE FX BOOTH — staged combat effects rendered MID-LIFE so the juice gets
## judged from pictures (flash ~70ms, blood/impact bursts ~0.45s). Run WITHOUT
## --headless:
##   Godot_v4.5.1-stable_win64_console.exe --path game res://proto3d/tools/render_fx.tscn
extends Node3D

const OUT := "C:/WINDOWS/TEMP/claude/D--git-carworld/0f71b692-94b3-495a-9db8-c96fa73de59a/scratchpad/fx_gallery.png"
const TILE := 300

var _sv: SubViewport
var _cam: Camera3D


func _ready() -> void:
	_sv = SubViewport.new()
	_sv.size = Vector2i(TILE, TILE)
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
	# A COLLIDABLE floor (it.19): the blood POOL raycasts for ground — a bare
	# mesh floor gave it nothing to stain. (Inline build — box_body wants a
	# Node3D parent and the SubViewport isn't one.)
	var floor_body := StaticBody3D.new()
	var fmesh := MeshInstance3D.new()
	var fbm := BoxMesh.new()
	fbm.size = Vector3(8, 0.1, 8)
	fmesh.mesh = fbm
	fmesh.material_override = ProtoWorldBuilder.material(Color(0.22, 0.21, 0.19), 0.9)
	floor_body.add_child(fmesh)
	var fshape := CollisionShape3D.new()
	var fbs := BoxShape3D.new()
	fbs.size = fbm.size
	fshape.shape = fbs
	floor_body.add_child(fshape)
	floor_body.position = Vector3(0, -0.05, 0)
	_sv.add_child(floor_body)
	_cam = Camera3D.new()
	_sv.add_child(_cam)
	_cam.position = Vector3(0.0, 1.15, 1.5)
	_cam.look_at(Vector3(0, 0.95, 0), Vector3.UP)

	# [label, capture frame delay] — the flash lives ~4 frames, shoot it at birth;
	# "mark" is the SAME impact captured late (burst dead, the pock remains);
	# "pool" is blood captured late (the ground remembers); swing rides slow-mo.
	var subjects: Array = [["flash", 0], ["blood", 7], ["impact", 7], ["mark", 45],
		["pool", 50], ["swing", 1], ["skull", 6]]
	var strip := Image.create(TILE * subjects.size(), TILE, false, Image.FORMAT_RGBA8)
	for i in subjects.size():
		var row: Array = subjects[i]
		var label: String = row[0]
		# The flash lives 70ms (~4 frames) — slow the CLOCK to catch it mid-bloom,
		# restoring the PREVIOUS time_scale after (the house sim law).
		var prev_ts := Engine.time_scale
		if label == "flash" or label == "swing":
			Engine.time_scale = 0.05 # both live ~a dozen frames — catch them mid-arc
		var swing_dummy: Node3D = null
		match label:
			"flash":
				ProtoFX.muzzle_flash(_sv, Vector3(0, 1.0, 0), Vector3(1, 0, 0.25))
			"blood", "pool":
				ProtoFX.blood(_sv, Vector3(0, 1.0, 0))
			"impact", "mark":
				ProtoFX.impact(_sv, Vector3(0, 0.9, 0), Vector3(0, 0, 1))
			"swing":
				swing_dummy = Node3D.new()
				_sv.add_child(swing_dummy)
				ProtoFX.swing_arc(swing_dummy, Vector3(1, 0, 0.3), 110.0, 1.6)
			"skull":
				ProtoFX.skull(_sv, Vector3(0, 1.1, 0))
		for _f in int(row[1]):
			await get_tree().process_frame
		await RenderingServer.frame_post_draw
		if label == "flash" or label == "swing":
			Engine.time_scale = prev_ts
		if swing_dummy != null:
			swing_dummy.queue_free()
		var img := _sv.get_texture().get_image()
		if img.get_format() != strip.get_format():
			img.convert(strip.get_format())
		strip.blit_rect(img, Rect2i(0, 0, TILE, TILE), Vector2i(i * TILE, 0))
		print("FX: %s captured" % label)
		await get_tree().create_timer(1.2).timeout # let the effect fully die
	print("FX: strip -> %s (%s)" % [OUT, "ok" if strip.save_png(OUT) == OK else "ERR"])
	get_tree().quit(0)
