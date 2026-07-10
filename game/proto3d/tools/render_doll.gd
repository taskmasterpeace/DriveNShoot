## ⚒ THE DOLL GALLERY — acceptance render for ProtoDamageDoll: classes × damage
## states at readable size, one contact strip. Run WITHOUT --headless:
##   Godot_v4.5.1-stable_win64_console.exe --path game res://proto3d/tools/render_doll.tscn
extends Node

const OUT := "C:/WINDOWS/TEMP/claude/D--git-carworld/0f71b692-94b3-495a-9db8-c96fa73de59a/scratchpad/doll_gallery.png"
const TILE_W := 220
const TILE_H := 300

## [vclass, label, tiers dict, on_fire]
const STATES: Array = [
	["pickup", "healthy", {}, false],
	["pickup", "beat-up", {"engine": 2, "tires": 1, "battery": 1, "fuel_tank": 2, "chassis": 3}, false],
	["pickup", "ON FIRE", {"engine": 3, "chassis": 2}, true],
	["motorcycle", "shot tires", {"tires": 3, "chassis": 1}, false],
	["semi", "worn", {"engine": 1, "chassis": 2}, false],
	["scavenger", "shot tires", {"tires": 3}, false],
]

const BODY_OUT := "C:/WINDOWS/TEMP/claude/D--git-carworld/0f71b692-94b3-495a-9db8-c96fa73de59a/scratchpad/body_gallery.png"
## [label, part tiers]
const BODY_STATES: Array = [
	["whole", {}],
	["bruised", {"torso": 1, "l_arm": 1}],
	["broken leg", {"r_leg": 3, "torso": 2}],
	["critical", {"head": 2, "torso": 3, "r_arm": 2, "l_leg": 1}],
]


func _ready() -> void:
	DrivnData.ensure()
	var sv := SubViewport.new()
	sv.size = Vector2i(TILE_W, TILE_H)
	sv.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	sv.transparent_bg = false
	add_child(sv)
	var bg := ColorRect.new()
	bg.color = Color(0.35, 0.33, 0.30) # daylight-ground stand-in behind the plate
	bg.set_anchors_preset(Control.PRESET_FULL_RECT)
	sv.add_child(bg)
	var doll := ProtoDamageDoll.new()
	doll.set_anchors_preset(Control.PRESET_FULL_RECT)
	doll.offset_left = 12.0
	doll.offset_right = -12.0
	doll.offset_top = 12.0
	doll.offset_bottom = -12.0
	sv.add_child(doll)

	var strip := Image.create(TILE_W * STATES.size(), TILE_H, false, Image.FORMAT_RGBA8)
	for i in STATES.size():
		var row: Array = STATES[i]
		var d: Dictionary = {"doll": ProtoCar3D.doll_spec_for(String(row[0])), "on_fire": bool(row[3])}
		var tiers: Dictionary = row[2]
		for part in ProtoDamageDoll.PARTS:
			d[part] = int(tiers.get(part, 0))
		doll.update_state(d)
		doll.queue_redraw()
		# Let the flash-on-worsen pulse die before shooting — the gallery shows
		# resting states (the pulse itself is a live-play read).
		await get_tree().create_timer(0.9).timeout
		await get_tree().process_frame
		await RenderingServer.frame_post_draw
		var img := sv.get_texture().get_image()
		if img.get_format() != strip.get_format():
			img.convert(strip.get_format())
		strip.blit_rect(img, Rect2i(0, 0, TILE_W, TILE_H), Vector2i(i * TILE_W, 0))
		print("DOLL: %s/%s rendered" % [row[0], row[1]])
	print("DOLL: strip -> %s (%s)" % [OUT, "ok" if strip.save_png(OUT) == OK else "ERR"])

	# --- THE BODY DOLL gallery (K sheet wound silhouette) ---
	doll.queue_free()
	var body := ProtoBodyDoll.new()
	body.set_anchors_preset(Control.PRESET_FULL_RECT)
	body.offset_left = 12.0
	body.offset_right = -12.0
	body.offset_top = 12.0
	body.offset_bottom = -12.0
	sv.add_child(body)
	var bstrip := Image.create(TILE_W * BODY_STATES.size(), TILE_H, false, Image.FORMAT_RGBA8)
	for i in BODY_STATES.size():
		var row: Array = BODY_STATES[i]
		body.set_tiers(row[1])
		for _f in 6:
			await get_tree().process_frame
		await RenderingServer.frame_post_draw
		var img := sv.get_texture().get_image()
		if img.get_format() != bstrip.get_format():
			img.convert(bstrip.get_format())
		bstrip.blit_rect(img, Rect2i(0, 0, TILE_W, TILE_H), Vector2i(i * TILE_W, 0))
		print("DOLL: body/%s rendered" % row[0])
	print("DOLL: body strip -> %s (%s)" % [BODY_OUT, "ok" if bstrip.save_png(BODY_OUT) == OK else "ERR"])
	get_tree().quit(0)
