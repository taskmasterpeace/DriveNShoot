## PROTO-3D — the CarWorld dream, proven in the engine we already have.
## Real vehicle physics (VehicleBody3D), top-down zoom camera, binocular cone,
## get out of the car, walk into the safehouse, go upstairs.
## Run this scene directly: res://proto3d/proto3d.tscn
extends Node3D

enum Mode { DRIVE, FOOT }

const INTERACT_RANGE := 3.4
const ZOOM_STEP := 0.07
const KILL_Y := -12.0

var mode: Mode = Mode.DRIVE
var player: ProtoPlayer3D
var cars: Array[ProtoCar3D] = []
var active_car: ProtoCar3D = null
var cam_rig: ProtoCameraRig
var hud: ProtoHUD
var house: ProtoHouse

## Key ring: key_id -> display name.
var keys: Dictionary = {}

var _current_interactable: Node3D = null
var _last_safe: Vector3 = Vector3(2.5, 1.2, 390)
var _safe_timer: float = 0.0


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
	cars[0].display_name = "Scavenger"
	# The car parked in Meridian is locked — its key is in the safehouse stash.
	cars[1].display_name = "sedan"
	cars[1].locked = true
	cars[1].key_id = "meridian_car_key"
	cars[1].key_display = "the Meridian car key"

	# Player starts driving car 0 on the interstate.
	player = ProtoPlayer3D.create()
	player.position = Vector3(6, 0.2, 388)
	add_child(player)

	cam_rig = ProtoCameraRig.create()
	add_child(cam_rig)

	hud = ProtoHUD.create()
	add_child(hud)

	house.tracked = player
	enter_car(cars[0])
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
	env.ambient_light_energy = 0.6
	env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	env.fog_enabled = true
	env.fog_light_color = Color(0.78, 0.70, 0.55)
	env.fog_density = 0.0006
	env.fog_sky_affect = 0.3
	var we := WorldEnvironment.new()
	we.environment = env
	add_child(we)


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("interact"):
		if mode == Mode.DRIVE:
			_exit_car()
		elif _current_interactable and player.move_state == ProtoPlayer3D.FootState.NORMAL:
			_current_interactable.call("interact", self)
	elif event is InputEventMouseButton and event.pressed:
		var mb := event as InputEventMouseButton
		# While glassing, the wheel magnifies the binocular view; otherwise it zooms the camera.
		if mb.button_index == MOUSE_BUTTON_WHEEL_UP:
			if cam_rig.binoculars:
				cam_rig.add_binocular_zoom(0.25)
			else:
				cam_rig.add_zoom(-ZOOM_STEP)
		elif mb.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			if cam_rig.binoculars:
				cam_rig.add_binocular_zoom(-0.25)
			else:
				cam_rig.add_zoom(ZOOM_STEP)


func _physics_process(delta: float) -> void:
	# Zoom fallback keys (no wheel on some setups)
	if Input.is_key_pressed(KEY_Z):
		cam_rig.add_zoom(-0.02)
	if Input.is_key_pressed(KEY_X):
		cam_rig.add_zoom(0.02)

	# Binoculars: hold B or right mouse. On foot, your body turns to follow the glass.
	var binoc := Input.is_key_pressed(KEY_B) or Input.is_mouse_button_pressed(MOUSE_BUTTON_RIGHT)
	cam_rig.binoculars = binoc
	hud.set_binoculars(binoc)
	if mode == Mode.FOOT:
		player.face_override = cam_rig.binocular_aim_dir() if binoc else Vector3.ZERO

	if mode == Mode.DRIVE and active_car:
		hud.set_speed(active_car.current_mph, true)
	else:
		hud.set_speed(0.0, false)
	hud.set_stamina(player.stamina, player.max_stamina, mode == Mode.FOOT)

	_update_interact_prompt()
	_update_respawn(delta)
	_update_location_label()


## Finds the nearest interactable with a live prompt and shows its chip.
func _update_interact_prompt() -> void:
	_current_interactable = null
	if mode == Mode.DRIVE:
		if active_car and active_car.current_mph < 8.0:
			hud.show_prompt("E — Get out")
		else:
			hud.show_prompt("")
		return
	var best: Node3D = null
	var best_d := INTERACT_RANGE
	var best_prompt := ""
	for node in get_tree().get_nodes_in_group("interactable"):
		var n := node as Node3D
		if n == null or not is_instance_valid(n):
			continue
		var p: Vector3 = n.call("interact_position")
		var d := p.distance_to(player.global_position)
		if d < best_d:
			var prompt: String = n.call("interact_prompt", self)
			if prompt != "":
				best = n
				best_d = d
				best_prompt = prompt
	_current_interactable = best
	hud.show_prompt(best_prompt)


## World-edge safety net (M2 streaming makes this obsolete): remember the last
## grounded position; anything that falls below KILL_Y comes back to it.
func _update_respawn(delta: float) -> void:
	var body: Node3D = active_car if mode == Mode.DRIVE else player
	if body == null:
		return
	_safe_timer += delta
	var grounded := false
	if body is RigidBody3D:
		grounded = absf((body as RigidBody3D).linear_velocity.y) < 0.6
	elif body is CharacterBody3D:
		grounded = (body as CharacterBody3D).is_on_floor()
	if _safe_timer > 1.0 and grounded and body.global_position.y > -1.0 and body.global_position.y < 30.0:
		_safe_timer = 0.0
		_last_safe = body.global_position
	if body.global_position.y < KILL_Y:
		body.global_position = _last_safe + Vector3(0, 2.0, 0)
		if body is RigidBody3D:
			(body as RigidBody3D).linear_velocity = Vector3.ZERO
			(body as RigidBody3D).angular_velocity = Vector3.ZERO
			body.global_transform = Transform3D(Basis.IDENTITY, _last_safe + Vector3(0, 2.0, 0))
		elif body is CharacterBody3D:
			(body as CharacterBody3D).velocity = Vector3.ZERO
		hud.toast("The wasteland spit you back out")


# --- Key ring / interactable services ---------------------------------------

func has_key(key_id: String) -> bool:
	return keys.has(key_id)


func give_key(key_id: String, display: String) -> void:
	keys[key_id] = display
	hud.set_keys(keys.values())
	hud.toast("Got %s" % display)


func notify(text: String) -> void:
	hud.toast(text)


func _update_location_label() -> void:
	var pos := active_car.global_position if (mode == Mode.DRIVE and active_car) else player.global_position
	if pos.x > 35.0:
		hud.set_location("MERIDIAN — POP. UNKNOWN")
	else:
		hud.set_location("DEATHLANDS — INTERSTATE 9")


func enter_car(car: ProtoCar3D) -> void:
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
	# Step out on the driver's side (left). global_basis.x is the car's RIGHT, so negate it.
	var out_pos := active_car.global_position - active_car.global_basis.x * 2.3
	out_pos.y = active_car.global_position.y + 0.3
	player.global_position = out_pos
	player.velocity = Vector3.ZERO
	player.process_mode = Node.PROCESS_MODE_INHERIT
	player.visible = true
	player.is_active = true
	cam_rig.target = player
	active_car = null
	hud.set_mode(false)
