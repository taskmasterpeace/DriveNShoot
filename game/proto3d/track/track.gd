## THE PROVING GROUNDS (MASTER_PLAN follow-on): a standalone race circuit for
## comparing the fleet. Lap timing through ordered checkpoints, a GHOST of each
## vehicle's best lap to race against, an obstacle gauntlet on the back straight,
## and a CHASE AI that pursues the ghost — the groundwork for vehicle navigation
## (following a moving target through obstacles is the chase/race primitive).
## Lap times persist to res://data/laptimes.json — VehicleForge reads them, so the
## compare panel shows real on-track results next to the paper stats.
##
## Run:  Godot --path game res://proto3d/track/track.tscn -- vehicle=suv
## Keys: 1-9 pick a rig · G race the ghost · C chase-AI on the ghost · R reset · ESC quit
class_name ProtoTrack
extends Node3D

const LAPTIMES := "res://data/laptimes.json"
## The circuit (world m). A rounded ring; scale shrinks it for fast headless sims.
const POINTS: Array = [
	Vector3(0, 0, 80), Vector3(60, 0, 80), Vector3(110, 0, 40), Vector3(110, 0, -40),
	Vector3(60, 0, -80), Vector3(-60, 0, -80), Vector3(-110, 0, -40), Vector3(-110, 0, 40),
	Vector3(-60, 0, 80),
]
const CHECK_R := 12.0 ## pass radius on a checkpoint

var track_scale: float = 1.0
var car: ProtoCar3D = null
var vehicle_id: String = "scavenger"
var ghost: ProtoTrackGhost = null
var chaser: ProtoCar3D = null
var chaser_ai: ProtoAutopilot = null

var lap_t: float = 0.0
var next_cp: int = 1 ## index into _cps; 0 is start/finish
var laps_done: int = 0
var best_time: float = 0.0
var last_time: float = 0.0
var _cps: Array = []
var _cam: Camera3D = null
var _hud: Label = null
var headless_sim: bool = false ## sims: no HUD/camera, no input picker


static func create(scale_in: float = 1.0, sim: bool = false) -> ProtoTrack:
	var t := ProtoTrack.new()
	t.track_scale = scale_in
	t.headless_sim = sim
	return t


func _ready() -> void:
	DrivnData.ensure()
	for p in POINTS:
		_cps.append(p * track_scale)
	_build_world()
	# cmdline: `-- vehicle=suv` from the tool's TEST DRIVE button
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("vehicle="):
			vehicle_id = arg.get_slice("=", 1)
	if not headless_sim:
		_build_camera_hud()
		spawn_vehicle(vehicle_id)
	ghost = ProtoTrackGhost.new()
	add_child(ghost)


func _build_world() -> void:
	# Ground slab + sun — the track owns its own little world.
	var env := WorldEnvironment.new()
	var e := Environment.new()
	e.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	e.ambient_light_color = Color(0.8, 0.78, 0.7)
	e.ambient_light_energy = 0.7
	env.environment = e
	add_child(env)
	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-52, -30, 0)
	add_child(sun)
	var s := track_scale
	ProtoWorldBuilder.box_body(self, Vector3(360 * s, 1.0, 300 * s), Vector3(0, -0.5, 0), Color(0.5, 0.44, 0.3))
	# The ribbon: gray slabs along each segment + checkpoint pylons.
	for i in _cps.size():
		var a: Vector3 = _cps[i]
		var b: Vector3 = _cps[(i + 1) % _cps.size()]
		var mid := (a + b) * 0.5
		var seg := b - a
		var road := MeshInstance3D.new()
		var bm := BoxMesh.new()
		bm.size = Vector3(14.0, 0.06, seg.length() + 14.0)
		road.mesh = bm
		road.material_override = ProtoWorldBuilder.material(Color(0.30, 0.30, 0.32), 0.9)
		road.position = mid + Vector3(0, 0.03, 0)
		road.rotation.y = atan2(-seg.x, -seg.z)
		add_child(road)
		var pylon := MeshInstance3D.new()
		var pm := BoxMesh.new()
		pm.size = Vector3(0.5, 3.0, 0.5)
		pylon.mesh = pm
		pylon.material_override = ProtoWorldBuilder.material(Color(0.96, 0.72, 0.2) if i == 0 else Color(0.6, 0.55, 0.45), 0.6, i == 0)
		pylon.position = a + Vector3(7.5, 1.5, 0)
		add_child(pylon)
	# THE GAUNTLET: a slalom of walls on the back straight (P4→P5, z = -80s) —
	# the obstacle course the chase AI must thread (and you must not eat).
	# Wall LENGTH scales with the track or a shrunken sim ring becomes a trap
	# pocket (full-size walls + half-size spacing taught us that).
	for j in 3:
		var wx := (-30.0 + 30.0 * j) * s
		var off := (4.0 if j % 2 == 0 else -4.0)
		ProtoWorldBuilder.box_body(self, Vector3(1.0, 2.0, 9.0 * s), Vector3(wx, 1.0, -80.0 * s + off), Color(0.55, 0.3, 0.2))


func spawn_vehicle(id: String) -> void:
	if car != null and is_instance_valid(car):
		car.queue_free()
	vehicle_id = id if ProtoCar3D.VEHICLES.has(id) else "scavenger"
	car = ProtoCar3D.create(vehicle_id, Color(0.62, 0.18, 0.12))
	car.use_player_input = not headless_sim
	car.is_active = true
	add_child(car)
	_reset_to_line()


func _reset_to_line() -> void:
	var dir: Vector3 = (_cps[1] - _cps[0]).normalized()
	car.global_position = _cps[0] + Vector3(0, 0.8, 0)
	car.global_rotation.y = atan2(-dir.x, -dir.z)
	car.linear_velocity = Vector3.ZERO
	car.angular_velocity = Vector3.ZERO
	lap_t = 0.0
	next_cp = 1
	ghost.start_recording()
	if ghost.playing or ghost.samples.size() > 1:
		ghost.start_playback()


func _physics_process(delta: float) -> void:
	if car == null:
		return
	lap_t += delta
	ghost.record(delta, car)
	ghost.advance(delta)
	# Ordered checkpoints — no corner cutting counts.
	var target: Vector3 = _cps[next_cp % _cps.size()]
	var d := car.global_position * Vector3(1, 0, 1) - target * Vector3(1, 0, 1)
	if d.length() < CHECK_R * maxf(track_scale, 0.6):
		next_cp += 1
		if next_cp > _cps.size(): # all gates + back through start = a LAP
			_lap_done()
	if _hud:
		_hud.text = "%s  ·  LAP %.2fs  ·  best %s  ·  cp %d/%d%s\n1-9 rig · G ghost · C chase AI · R reset" % [
			ProtoCar3D.VEHICLES[vehicle_id]["name"], lap_t,
			("%.2fs" % best_time) if best_time > 0.0 else "—",
			next_cp - 1, _cps.size(),
			("  ·  Δghost %.1fm" % car.global_position.distance_to(ghost.ghost_body().global_position)) if ghost.playing else ""]


func _lap_done() -> void:
	last_time = lap_t
	laps_done += 1
	if best_time <= 0.0 or lap_t < best_time:
		best_time = lap_t
		ghost.save_recording(vehicle_id, best_time) # the ghost IS your best line
		ghost.load_ghost(vehicle_id)
		_write_laptime()
	lap_t = 0.0
	next_cp = 1
	ghost.start_recording()
	if ghost.samples.size() > 1:
		ghost.start_playback()


## Lap times persist where the TOOLS look: best per vehicle, one JSON.
func _write_laptime() -> void:
	var data: Dictionary = {"laps": {}}
	if FileAccess.file_exists(LAPTIMES):
		var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(LAPTIMES))
		if parsed is Dictionary:
			data = parsed
	if not data.has("laps"):
		data["laps"] = {}
	var prev: float = float((data["laps"] as Dictionary).get(vehicle_id, 0.0))
	if prev <= 0.0 or best_time < prev:
		data["laps"][vehicle_id] = best_time
	var f := FileAccess.open(LAPTIMES, FileAccess.WRITE)
	f.store_string(JSON.stringify(data, "  "))
	f.close()


## CHASE AI: a second rig whose only order is "catch the ghost" — through the
## gauntlet, around the ring. The first vehicle-navigation test in the engine.
func spawn_chaser() -> void:
	if chaser != null and is_instance_valid(chaser):
		chaser.queue_free()
	chaser = ProtoCar3D.create("buggy", Color(0.2, 0.3, 0.5))
	add_child(chaser)
	chaser.global_position = _cps[0] + Vector3(-6, 0.8, -6)
	chaser_ai = ProtoAutopilot.attach(chaser)
	if ghost.ghost_body() != null:
		chaser_ai.target_node = ghost.ghost_body()
	elif car:
		chaser_ai.target_node = car


func _unhandled_input(event: InputEvent) -> void:
	if headless_sim or not (event is InputEventKey and event.pressed and not event.echo):
		return
	var kc := (event as InputEventKey).keycode
	if kc == KEY_R:
		_reset_to_line()
	elif kc == KEY_G:
		if ghost.load_ghost(vehicle_id):
			ghost.start_playback()
	elif kc == KEY_C:
		spawn_chaser()
	elif kc == KEY_ESCAPE:
		get_tree().quit()
	elif kc >= KEY_1 and kc <= KEY_9:
		var fleet := DrivnData.fleet().filter(func(v): return v.id != "trailer")
		var idx := kc - KEY_1
		if idx < fleet.size():
			spawn_vehicle(fleet[idx].id)


func _process(_delta: float) -> void:
	if _cam and car:
		var want := car.global_position + Vector3(0, 26, 20)
		_cam.global_position = _cam.global_position.lerp(want, 0.08)
		_cam.look_at(car.global_position + Vector3(0, 0, -2))


func _build_camera_hud() -> void:
	_cam = Camera3D.new()
	_cam.position = Vector3(0, 30, 40)
	add_child(_cam)
	_cam.make_current()
	var layer := CanvasLayer.new()
	add_child(layer)
	_hud = Label.new()
	_hud.position = Vector2(16, 12)
	_hud.add_theme_font_size_override("font_size", 18)
	_hud.add_theme_color_override("font_color", Color(0.96, 0.72, 0.2))
	layer.add_child(_hud)
