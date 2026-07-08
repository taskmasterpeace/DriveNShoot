## Render the mannequin ProtoPuppet so proportions + MOTION read by eye, not guess.
## ANIMATION_FIX_PACK acceptance views: WALK-SIDE / RUN-SIDE (vs the reference strip),
## CROUCH-SIDE (shoulders down, boots planted), the SHOTGUN two-hand hold (two distinct
## shoulders), the BAT mid-swing, and the protected PISTOL. Plus idle/armed/build lineup.
## Runs NON-headless (real GPU); the offscreen path hangs under --headless.
extends Node3D

const OUT := "C:/WINDOWS/TEMP/claude/D--git-carworld/6c9af67f-9864-4393-bc47-bb421db03620/scratchpad/photobooth"

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

	# Side-on camera (+X looking at -X): the ANIMATION_FIX_PACK acceptance view.
	var SIDE := Vector3(3.6, 1.05, 0.0)
	var Q34 := Vector3(2.1, 1.4, 2.4)
	var LOOK := Vector3(0.0, 1.0, 0.0)

	# --- Idle / armed 3/4 (proportions) ---
	var idle: ProtoPuppet = await _make({}, false, 0.0, PI); await _shot("idle", Q34, LOOK); idle.queue_free()
	var armed: ProtoPuppet = await _make({}, true, 0.0, PI); await _shot("armed_pistol", Q34, LOOK); armed.queue_free()

	# --- WALK-SIDE (4.2 m/s) and RUN-SIDE (7.2) — hold next to the reference strip.
	# Puppet faces -Z (face_y 0) so the +X camera sees a CLEAN side profile: the stride
	# swings across the frame (the reference-strip view), not toward the lens.
	var walk: ProtoPuppet = await _make({}, false, 4.2, 0.0); await _shot("walk_side", SIDE, LOOK); walk.queue_free()
	var run: ProtoPuppet = await _make({}, false, 7.2, 0.0); await _shot("run_side", SIDE, LOOK); run.queue_free()

	# --- CROUCH-SIDE: shoulders ride the chest DOWN, boots stay planted (D1+D2) ---
	var crouch: ProtoPuppet = await _make_crouch(); await _shot("crouch_side", SIDE, Vector3(0, 0.7, 0)); crouch.queue_free()

	# --- SHOTGUN two-hand hold, front + 3/4: two DISTINCT shoulders (D5) ---
	var sg: ProtoPuppet = await _make_gun("shotgun"); await _shot("shotgun_front", Vector3(0, 1.15, 3.4), Vector3(0, 1.05, 0))
	await _shot("shotgun_34", Q34, LOOK); sg.queue_free()
	var pr: ProtoPuppet = await _make_gun("pipe_rocket"); await _shot("pipe_rocket_34", Q34, LOOK); pr.queue_free()

	# --- BAT mid-swing: capture at the CONTACT pose (D4 replacement + the goal's ask) ---
	var bat: ProtoPuppet = await _make_bat_contact(); await _shot("bat_contact", Q34, LOOK); bat.queue_free()

	# --- BUILD LINEUP skinny/normal/heavy, front ---
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


func _make_crouch() -> ProtoPuppet:
	var p := ProtoPuppet.create({})
	add_child(p)
	p.rotation.y = 0.0 # face -Z: a clean side profile for the +X camera
	p.crouch_target = 1.0
	for _f in 3:
		await get_tree().process_frame
	for _i in 60: # let the crouch blend settle full
		p.animate(0.016, 0.0, 0.0, false, 0.0, false)
		await get_tree().process_frame
	return p


func _make_gun(id: String) -> ProtoPuppet:
	var p := ProtoPuppet.create({})
	add_child(p)
	p.rotation.y = PI
	var w: Dictionary = ProtoWeapon.WEAPONS[id]
	var hp: Dictionary = w["hand_pose"]
	var shape: Dictionary = ProtoWeapon.SHAPES.get(id, {})
	p.set_weapon_mesh(shape.get("parts", []), float(shape.get("muzzle_z", 0.34)))
	p.set_hand_pose(hp["offset"], bool(hp.get("two_handed", false)), hp.get("grip_l", Vector3.ZERO), hp.get("grip_r", Vector3.ZERO))
	p.raised = true
	p.set_armed(true)
	for _f in 3:
		await get_tree().process_frame
	for _i in 100: # let the blade + fore-grip IK settle onto the hold
		p.animate(0.016, 0.0, 0.0, true, 0.0, false)
		await get_tree().process_frame
	return p


func _make_bat_contact() -> ProtoPuppet:
	var p := ProtoPuppet.create({})
	add_child(p)
	p.rotation.y = PI * 0.72
	var w: Dictionary = ProtoWeapon.WEAPONS["bat"]
	var shape: Dictionary = ProtoWeapon.SHAPES["bat"]
	p.set_weapon_mesh(shape["parts"], float(shape.get("muzzle_z", 0.34)))
	p.set_hand_pose(w["hand_pose"]["offset"], true)
	p.set_armed(true)
	for _f in 3:
		await get_tree().process_frame
	p.play_strike("bat_swing")
	# advance to ~the contact pose (load ~155ms + into the contact ease ~80ms)
	for _i in 15:
		p.animate(0.016, 0.0, 0.0, false, 0.0, false)
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
