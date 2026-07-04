## PROTO-3D — the CarWorld dream, proven in the engine we already have.
## Real vehicle physics (VehicleBody3D), top-down zoom camera, binocular cone,
## get out of the car, walk into the safehouse, go upstairs.
## Run this scene directly: res://proto3d/proto3d.tscn
extends Node3D

enum Mode { DRIVE, FOOT }

const INTERACT_RANGE := 3.8
const ZOOM_STEP := 0.07

var mode: Mode = Mode.DRIVE
var player: ProtoPlayer3D
var cars: Array[ProtoCar3D] = []
var active_car: ProtoCar3D = null
var cam_rig: ProtoCameraRig
var hud: ProtoHUD
var house: ProtoHouse


func _ready() -> void:
	_build_environment()
	var info: Dictionary = ProtoWorldBuilder.build_world(self)
	house = info["house"]

	# Cars
	var colors: Array[Color] = [Color(0.62, 0.18, 0.12), Color(0.24, 0.32, 0.24)]
	var spawns: Array[Transform3D] = info["car_spawns"]
	for i in spawns.size():
		var car := ProtoCar3D.create(colors[i % colors.size()])
		car.transform = spawns[i]
		add_child(car)
		cars.append(car)

	# Player starts driving car 0 on the interstate.
	player = ProtoPlayer3D.create()
	player.position = Vector3(6, 0.2, 388)
	add_child(player)

	cam_rig = ProtoCameraRig.create()
	add_child(cam_rig)

	hud = ProtoHUD.create()
	add_child(hud)

	house.tracked = player
	_enter_car(cars[0])
	cam_rig.snap_to_target()


func _build_environment() -> void:
	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-52, -38, 0)
	sun.light_color = Color(1.0, 0.92, 0.78)
	sun.light_energy = 1.25
	sun.shadow_enabled = true
	sun.directional_shadow_max_distance = 140.0
	add_child(sun)

	var env := Environment.new()
	var sky := Sky.new()
	var sky_mat := ProceduralSkyMaterial.new()
	sky_mat.sky_top_color = Color(0.55, 0.62, 0.7)
	sky_mat.sky_horizon_color = Color(0.82, 0.72, 0.55)
	sky_mat.ground_bottom_color = Color(0.45, 0.38, 0.28)
	sky_mat.ground_horizon_color = Color(0.82, 0.72, 0.55)
	sky.sky_material = sky_mat
	env.background_mode = Environment.BG_SKY
	env.sky = sky
	env.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
	env.ambient_light_energy = 1.0
	env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	env.fog_enabled = true
	env.fog_light_color = Color(0.78, 0.70, 0.55)
	env.fog_density = 0.0022
	var we := WorldEnvironment.new()
	we.environment = env
	add_child(we)


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("interact"):
		if mode == Mode.DRIVE:
			_exit_car()
		else:
			var car := _nearest_car(player.global_position)
			if car and car.global_position.distance_to(player.global_position) <= INTERACT_RANGE:
				_enter_car(car)
	elif event is InputEventMouseButton and event.pressed:
		var mb := event as InputEventMouseButton
		if mb.button_index == MOUSE_BUTTON_WHEEL_UP:
			cam_rig.add_zoom(-ZOOM_STEP)
		elif mb.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			cam_rig.add_zoom(ZOOM_STEP)


func _physics_process(_delta: float) -> void:
	# Zoom fallback keys (no wheel on some setups)
	if Input.is_key_pressed(KEY_Z):
		cam_rig.add_zoom(-0.02)
	if Input.is_key_pressed(KEY_X):
		cam_rig.add_zoom(0.02)

	# Binoculars: hold B or right mouse.
	var binoc := Input.is_key_pressed(KEY_B) or Input.is_mouse_button_pressed(MOUSE_BUTTON_RIGHT)
	cam_rig.binoculars = binoc
	hud.set_binoculars(binoc)

	if mode == Mode.DRIVE and active_car:
		hud.set_speed(active_car.current_mph, true)
	else:
		hud.set_speed(0.0, false)

	_update_location_label()


func _update_location_label() -> void:
	var pos := active_car.global_position if (mode == Mode.DRIVE and active_car) else player.global_position
	if pos.x > 35.0:
		hud.set_location("MERIDIAN — POP. UNKNOWN")
	else:
		hud.set_location("DEATHLANDS — INTERSTATE 9")


func _nearest_car(from: Vector3) -> ProtoCar3D:
	var best: ProtoCar3D = null
	var best_d := INF
	for car in cars:
		var d := car.global_position.distance_to(from)
		if d < best_d:
			best_d = d
			best = car
	return best


func _enter_car(car: ProtoCar3D) -> void:
	mode = Mode.DRIVE
	active_car = car
	car.is_active = true
	player.is_active = false
	player.visible = false
	player.process_mode = Node.PROCESS_MODE_DISABLED
	cam_rig.target = car
	hud.set_mode(true)


func _exit_car() -> void:
	if active_car == null:
		return
	mode = Mode.FOOT
	active_car.is_active = false
	# Step out on the driver's side (left = +X when forward is -Z... left is -X;
	# use +X so you step out toward the shoulder, away from traffic).
	var out_pos := active_car.global_position + active_car.global_basis.x * 2.3
	out_pos.y = active_car.global_position.y + 0.3
	player.global_position = out_pos
	player.velocity = Vector3.ZERO
	player.process_mode = Node.PROCESS_MODE_INHERIT
	player.visible = true
	player.is_active = true
	cam_rig.target = player
	active_car = null
	hud.set_mode(false)
