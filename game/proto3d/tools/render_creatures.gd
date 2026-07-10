## Render THE FIVE CREATURES so their bodies read by EYE, not by green sim
## (the owner's law: view every generated visual before it ships). Pure rigs —
## ProtoQuadruped wearing each creature row's params, no AI — so the judge
## grades proportion/color/scale, not wander luck. Shots: a relative-scale
## LINEUP, each creature 3/4 mid-stride, and the 0.11 BODY-LAW dead sprawl.
## Runs NON-headless (real GPU); output → docs/acceptance/iter1/.
## Run: Godot --path game res://proto3d/tools/render_creatures.tscn
extends Node3D

const OUT := "res://../docs/acceptance/iter1"

var _cam: Camera3D


## Photograph the REAL actor (wings, spine blades, low-slung squish and all) —
## a re-derived bare rig lied by omission on the first pass. Physics off: the
## photobooth wants the body, not the wander.
func _actor_for(id: String) -> Node3D:
	ProtoCreature.ensure_rows()
	var a: Node3D = ProtoKnifeback.create() if id == "knifeback" else ProtoCreature.create(id)
	return a


## Freeze AFTER tree entry — a pre-add_child set_physics_process(false) gets
## re-enabled on enter-tree, and the photobooth subjects WANDERED OFF FRAME.
func _freeze(a: Node3D) -> void:
	a.set_physics_process(false)


func _quad_of(a: Node3D) -> ProtoQuadruped:
	return a._quad


func _ready() -> void:
	var out_abs := ProjectSettings.globalize_path(OUT)
	DirAccess.make_dir_recursive_absolute(out_abs)
	var env := WorldEnvironment.new()
	var e := Environment.new()
	e.background_mode = Environment.BG_COLOR
	e.background_color = Color(0.26, 0.28, 0.32)
	e.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	e.ambient_light_color = Color(0.6, 0.62, 0.68)
	e.ambient_light_energy = 1.15
	env.environment = e
	add_child(env)
	var key := DirectionalLight3D.new()
	key.rotation_degrees = Vector3(-50, -35, 0)
	key.light_energy = 1.7
	add_child(key)
	var fill := DirectionalLight3D.new()
	fill.rotation_degrees = Vector3(-20, 140, 0)
	fill.light_energy = 0.6
	add_child(fill)
	var floor_mesh := MeshInstance3D.new()
	var pm := PlaneMesh.new()
	pm.size = Vector2(30, 30)
	floor_mesh.mesh = pm
	floor_mesh.material_override = ProtoWorldBuilder.material(Color(0.09, 0.10, 0.11), 0.95)
	add_child(floor_mesh)

	_cam = Camera3D.new()
	_cam.current = true
	add_child(_cam)

	var ids := ["mossback", "wire_rat", "road_vulture", "glass_jackal", "knifeback"]

	# --- THE LINEUP: all five in a row, relative scale is the read -------------
	var lineup: Array = []
	var xs := [-5.0, -2.6, -1.2, 1.2, 4.6]
	for i in ids.size():
		var a := _actor_for(ids[i])
		add_child(a)
		_freeze(a)
		# PROFILE lineup (judge's note: head-on hid the knifeback's ridge);
		# the vulture rides AIRBORNE — circling is its truth in-game.
		a.position = Vector3(xs[i], 2.2 if ids[i] == "road_vulture" else 0.0, 0)
		a.rotation.y = PI * 0.5
		lineup.append(a)
	for _i in 30:
		for a in lineup:
			_quad_of(a).animate(0.016, 0.0, 0.7)
		await get_tree().process_frame
	await _shot("lineup_all5", Vector3(0, 2.2, 11.0), Vector3(0, 1.0, 0))
	for a in lineup:
		a.queue_free()

	# --- Each creature, 3/4, mid-stride (vulture: airborne, sky behind) -------
	for id in ids:
		var a := _actor_for(id)
		add_child(a)
		_freeze(a)
		a.rotation.y = PI * 0.62
		var s := float(ProtoCreature.ROWS[id].get("rig_scale", 1.0))
		var fly: bool = String(id) == "road_vulture" # loop var is untyped — := can't infer
		if fly:
			a.position.y = 2.4
		for _i in 26:
			_quad_of(a).animate(0.016, 2.0, 0.7)
			await get_tree().process_frame
		if fly: # shoot from BELOW so the wings cut against the lighter sky
			await _shot("creature_%s" % id, Vector3(1.6, 1.3, 1.8), Vector3(0, 2.4, 0))
		else:
			await _shot("creature_%s" % id, Vector3(2.0 * s, 1.2 * s, 2.2 * s), Vector3(0, 0.45 * s, 0))
		a.queue_free()

	# --- THE BODY LAW: a dead mossback sprawled (what a kill leaves) ----------
	var dead := _actor_for("mossback")
	add_child(dead)
	_freeze(dead)
	dead.rotation.y = PI * 0.6
	for _i in 4:
		_quad_of(dead).animate(0.016, 0.0, 0.5)
		await get_tree().process_frame
	_quad_of(dead).pose_dead()
	for _i in 8:
		await get_tree().process_frame
	await _shot("body_law_dead_mossback", Vector3(4.0, 2.4, 4.2), Vector3(0, 0.4, 0))
	dead.queue_free()

	print("RENDER: creatures done")
	get_tree().quit(0)


func _shot(name: String, cam_pos: Vector3, look: Vector3) -> void:
	_cam.position = cam_pos
	_cam.look_at(look, Vector3.UP)
	for _f in 4:
		await get_tree().process_frame
	await RenderingServer.frame_post_draw
	await get_tree().process_frame
	await RenderingServer.frame_post_draw
	var img := get_viewport().get_texture().get_image()
	var path := "%s/CREATURE_%s.png" % [ProjectSettings.globalize_path(OUT), name]
	print("RENDER: %s -> %s" % [name, "ok" if img.save_png(path) == OK else "ERR"])
