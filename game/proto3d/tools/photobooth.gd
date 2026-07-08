## ⚒ THE PUPPET PHOTOBOOTH (owner 2026-07-08: "why can't you just render the model,
## move it, take a picture?" — YES). A dev harness that spawns ProtoPuppet, equips
## each weapon with the REAL pose code, and renders front / three-quarter / side
## PNGs to the scratchpad so the rig can be DIAGNOSED FROM PICTURES, not described.
##
## Needs a real GPU context — run WITHOUT --headless (the dummy driver renders blank):
##   Godot_v4.5.1-stable_win64_console.exe --path game res://proto3d/tools/photobooth.tscn
## It renders, writes PNGs, prints each path, and quits. Re-run after a rig/mesh edit
## to see the change. Output dir is the OUT const below.
extends Node3D

const OUT := "C:/WINDOWS/TEMP/claude/D--git-carworld/8e9f2702-dbfb-45a1-aec4-96ecf44518c7/scratchpad/photobooth"
const SHOTS := 900 ## square capture, px

## weapon id -> the aim_arm yaw for the shot (profile-left shows the gun silhouette).
const SUBJECTS: Array = [
	{"id": "", "label": "unarmed"},
	{"id": "pistol", "label": "pistol"},
	{"id": "shotgun", "label": "shotgun"},
	{"id": "pipe_rocket", "label": "rocket"},
]
## camera name -> position (looking at chest height 1.1).
const ANGLES: Array = [
	{"name": "front", "pos": Vector3(0.0, 1.2, 3.2)},
	{"name": "threequarter", "pos": Vector3(2.4, 1.5, 2.4)},
	{"name": "side", "pos": Vector3(3.2, 1.2, 0.0)},
]

var _sv: SubViewport
var _cam: Camera3D


func _ready() -> void:
	DirAccess.make_dir_recursive_absolute(OUT)

	_sv = SubViewport.new()
	_sv.size = Vector2i(SHOTS, SHOTS)
	_sv.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	_sv.transparent_bg = false
	add_child(_sv)

	# A neutral studio: flat sky, a key light, a fill, a floor line for scale.
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
	pm.size = Vector2(6, 6)
	floor_mesh.mesh = pm
	floor_mesh.material_override = ProtoWorldBuilder.material(Color(0.10, 0.11, 0.12), 0.9)
	_sv.add_child(floor_mesh)

	_cam = Camera3D.new()
	_sv.add_child(_cam)

	await _contact_sheet()
	await _run()
	await _turn_sweep()
	print("PHOTOBOOTH: done")
	get_tree().quit(0)


## THE CONTACT SHEET (owner 2026-07-08: "we need a way to iterate faster… all
## the weapons and their grips figured out"). Every weapon held, in ONE image, in
## a grid — tweak a SHAPE row in weapon.gd, re-run, read one picture, see them all.
func _contact_sheet() -> void:
	var order: Array = ["pistol", "shotgun", "pipe_rocket", "wrench", "machete", "axe", "bat"]
	var cols := 3
	var tile := 320
	var rows := int(ceil(float(order.size()) / cols))
	var sheet := Image.create(cols * tile, rows * tile, false, Image.FORMAT_RGBA8)
	sheet.fill(Color(0.13, 0.14, 0.16, 1.0))
	print("PHOTOBOOTH: contact-sheet grid (row-major): %s" % str(order))

	_cam.position = Vector3(1.5, 1.35, 2.1)
	_cam.look_at(Vector3(0.0, 1.15, -0.05), Vector3.UP)
	for i in order.size():
		var id: String = order[i]
		var puppet := ProtoPuppet.create({})
		_sv.add_child(puppet)
		var w: Dictionary = ProtoWeapon.WEAPONS[id]
		var pose: Dictionary = w.get("hand_pose", {})
		puppet.set_hand_pose(pose.get("offset", Vector3.ZERO), pose.get("two_handed", false),
			pose.get("grip_l", Vector3.ZERO), pose.get("grip_r", Vector3.ZERO))
		var shp: Dictionary = ProtoWeapon.shape(id)
		puppet.set_weapon_mesh(shp.get("parts", []), shp.get("muzzle_z", 0.34))
		puppet.raised = true # force the hold up so the silhouette reads (even melee)
		puppet.set_armed(true)
		for _f in 60:
			puppet.animate(1.0 / 60.0, 0.0, 0.0, true, 0.0, false)
			puppet.aim_arm.rotation.y = -0.5 # angle the weapon toward the camera
			await get_tree().process_frame
		await RenderingServer.frame_post_draw
		await get_tree().process_frame
		await RenderingServer.frame_post_draw
		var img := _sv.get_texture().get_image()
		img.resize(tile, tile, Image.INTERPOLATE_LANCZOS)
		if img.get_format() != sheet.get_format():
			img.convert(sheet.get_format())
		var col := i % cols
		var row := i / cols
		sheet.blit_rect(img, Rect2i(0, 0, tile, tile), Vector2i(col * tile, row * tile))
		puppet.queue_free()
		await get_tree().process_frame
	var path := "%s/_CONTACT_SHEET.png" % OUT
	var err := sheet.save_png(path)
	print("PHOTOBOOTH: %s  (%s)" % [path, "ok" if err == OK else "ERR %d" % err])


## THE DOORKNOB TEST (owner 2026-07-08: "the torso rotates like a doorknob, not
## like a torso"). Render the armed puppet turning through a yaw arc from a fixed
## front camera — a rigid vertical box spinning flat about its center IS a
## doorknob; a torso banks and twists into the turn. Re-run after the rig fix.
func _turn_sweep() -> void:
	_cam.position = Vector3(0.0, 1.3, 3.4)
	_cam.look_at(Vector3(0, 1.05, 0), Vector3.UP)
	var puppet := ProtoPuppet.create({})
	_sv.add_child(puppet)
	var w: Dictionary = ProtoWeapon.WEAPONS["pistol"]
	var pose: Dictionary = w.get("hand_pose", {})
	puppet.set_hand_pose(pose.get("offset", Vector3.ZERO), pose.get("two_handed", false),
		pose.get("grip_l", Vector3.ZERO), pose.get("grip_r", Vector3.ZERO))
	puppet.raised = true
	puppet.set_armed(true)
	for deg in [0, 30, 60, 90]:
		puppet.rotation.y = deg_to_rad(deg)
		for _f in 30:
			puppet.animate(1.0 / 60.0, 0.0, deg_to_rad(60.0), true, 0.0, false) # turn_rate feeds the lean
			await get_tree().process_frame
		await RenderingServer.frame_post_draw
		await get_tree().process_frame
		await RenderingServer.frame_post_draw
		var img := _sv.get_texture().get_image()
		var path := "%s/turn_%02d.png" % [OUT, deg]
		var err := img.save_png(path)
		print("PHOTOBOOTH: %s  (%s)" % [path, "ok" if err == OK else "ERR %d" % err])
	puppet.queue_free()


func _run() -> void:
	for subj in SUBJECTS:
		var puppet := ProtoPuppet.create({})
		_sv.add_child(puppet)
		puppet.position = Vector3.ZERO

		# Equip exactly as proto3d._apply_hand_pose does.
		var id: String = subj["id"]
		if id == "":
			puppet.set_hand_pose(Vector3.ZERO, false)
			puppet.raised = true
		else:
			var w: Dictionary = ProtoWeapon.WEAPONS[id]
			var pose: Dictionary = w.get("hand_pose", {})
			puppet.set_hand_pose(pose.get("offset", Vector3.ZERO), pose.get("two_handed", false),
				pose.get("grip_l", Vector3.ZERO), pose.get("grip_r", Vector3.ZERO))
			puppet.raised = not (int(w["behavior"]) == ProtoWeapon.Behavior.MELEE)
			puppet.set_armed(true)

		# Aim the gun arm to camera-left so we see the weapon's profile, and settle
		# the lerped pose over real frames (the rig eases into the hold).
		var armed := id != ""
		for _f in 70:
			puppet.animate(1.0 / 60.0, 0.0, 0.0, armed, 0.0, false)
			if armed:
				puppet.aim_arm.rotation.y = -PI * 0.5
			await get_tree().process_frame

		for ang in ANGLES:
			_cam.position = ang["pos"]
			_cam.look_at(Vector3(0, 1.05, 0), Vector3.UP)
			await RenderingServer.frame_post_draw
			await get_tree().process_frame
			await RenderingServer.frame_post_draw
			var img := _sv.get_texture().get_image()
			var path := "%s/%s_%s.png" % [OUT, subj["label"], ang["name"]]
			var err := img.save_png(path)
			print("PHOTOBOOTH: %s  (%s)" % [path, "ok" if err == OK else "ERR %d" % err])

		puppet.queue_free()
		await get_tree().process_frame
