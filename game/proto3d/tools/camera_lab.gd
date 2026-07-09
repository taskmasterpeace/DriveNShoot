## DRIVN camera lab: a small playable harness for testing a GTA2-grounded
## on-foot control split. The lower square is feet/body/vision. The upper square
## is torso/selector. Mouse or right stick aims the torso; WASD or left stick moves
## the feet. Wheel/V blend overhead <-> third-person.
extends Node3D

const CLOSE_HEIGHT := 3.1
const FAR_HEIGHT := 28.0
const CLOSE_BACK := 6.4
const FAR_BACK := 11.0
const CLOSE_FOV := 72.0
const FAR_FOV := 58.0
const FEET_TURN_RATE_DEG := 420.0
const FEET_CATCHUP_RATE_DEG := 560.0
const MAX_TWIST_DEG := 82.0
const WALK_SPEED := 3.9
const RUN_SPEED := 7.2
const BACKPEDAL_SPEED := 2.4
const STRAFE_SPEED := 3.2
const VEHICLE_MODE_NAMES := ["scavenger", "motorcycle", "buggy", "pickup", "van", "semi", "trailer", "pickup_truck", "rv", "suv"]

var _player: CharacterBody3D
var _body_square: MeshInstance3D
var _body_nose: MeshInstance3D
var _torso_square: MeshInstance3D
var _torso_nose: MeshInstance3D
var _survivor_model: Node3D
var _survivor_upper: Node3D
var _buggy_model: Node3D
var _truck_model: Node3D
var _vehicle_models: Dictionary = {}
var _cam: Camera3D
var _label: Label
var _selector_marker: MeshInstance3D
var _vision_marker: MeshInstance3D

var _aim_dir := Vector3(0, 0, -1)
var _cam_dir := Vector3(0, 0, -1)
var _body_yaw: float = 0.0
var _upper_yaw: float = 0.0
var _prev_yaw: float = 0.0
var _zoom_t: float = 0.78
var _last_speed: float = 0.0
var _footwork := "IDLE"
var _aim_source := "MOUSE"
var _active_model_name := "squares"

var _test_aim_active: bool = false
var _test_move_active: bool = false
var _test_move := Vector2.ZERO
var _test_sprint: bool = false


func _ready() -> void:
	ProtoInputMap.ensure()
	DrivnData.ensure()
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	_build_world()
	_build_player()
	_build_camera()
	_build_ui()
	_update_camera(1.0 / 60.0, true)


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseButton:
		var mb := event as InputEventMouseButton
		if mb.pressed and mb.button_index == MOUSE_BUTTON_WHEEL_UP:
			_zoom_t = clampf(_zoom_t - 0.08, 0.0, 1.0)
		elif mb.pressed and mb.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			_zoom_t = clampf(_zoom_t + 0.08, 0.0, 1.0)
	elif event is InputEventKey:
		var key := event as InputEventKey
		if key.pressed and not key.echo:
			if key.keycode == KEY_V:
				_zoom_t = 0.0 if _zoom_t > 0.35 else 0.82
			elif key.keycode == KEY_M:
				cycle_visual_model()
			elif key.keycode == KEY_R:
				_test_aim_active = false
				_test_move_active = false
				reset_test_pose(Vector3.ZERO)


func _physics_process(delta: float) -> void:
	_update_aim_from_mouse()
	_update_split_turn(delta)
	_player.rotation.y = _body_yaw

	var move_input := _read_move_input()
	var wish := _movement_vector(move_input)
	_player.velocity.x = wish.x
	_player.velocity.z = wish.z
	_player.velocity.y = 0.0
	_player.move_and_slide()
	_last_speed = Vector2(_player.velocity.x, _player.velocity.z).length()

	_prev_yaw = _body_yaw
	_apply_upper_body_pose()

	_update_camera(delta, false)
	_update_markers()
	_update_label()


func _build_world() -> void:
	var env := WorldEnvironment.new()
	var e := Environment.new()
	e.background_mode = Environment.BG_COLOR
	e.background_color = Color(0.08, 0.10, 0.12)
	e.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	e.ambient_light_color = Color(0.42, 0.45, 0.48)
	e.ambient_light_energy = 0.72
	env.environment = e
	add_child(env)

	var sun := DirectionalLight3D.new()
	sun.rotation = Vector3(deg_to_rad(-48.0), deg_to_rad(32.0), 0.0)
	sun.light_energy = 1.45
	add_child(sun)

	var floor := MeshInstance3D.new()
	var plane := PlaneMesh.new()
	plane.size = Vector2(90, 90)
	floor.mesh = plane
	floor.material_override = _mat(Color(0.13, 0.16, 0.15), 0.92)
	add_child(floor)

	for i in range(-20, 21):
		_add_line(Vector3(i * 2.0, 0.01, 0), Vector3(0.035, 0.02, 80.0), Color(0.20, 0.24, 0.23))
		_add_line(Vector3(0, 0.012, i * 2.0), Vector3(80.0, 0.02, 0.035), Color(0.20, 0.24, 0.23))
	_add_line(Vector3(0, 0.04, 0), Vector3(0.09, 0.05, 80.0), Color(0.28, 0.35, 0.52))
	_add_line(Vector3(0, 0.045, 0), Vector3(80.0, 0.05, 0.09), Color(0.48, 0.22, 0.20))

	for p in [Vector3(10, 0.5, -8), Vector3(-8, 0.5, -14), Vector3(16, 0.5, 8), Vector3(-15, 0.5, 12)]:
		var box := MeshInstance3D.new()
		var bm := BoxMesh.new()
		bm.size = Vector3(2.2, 1.0, 2.2)
		box.mesh = bm
		box.position = p
		box.material_override = _mat(Color(0.34, 0.30, 0.23), 0.8)
		add_child(box)

	_selector_marker = _dot_marker(Color(0.95, 0.72, 0.22), 0.18)
	_selector_marker.name = "SelectorDot"
	add_child(_selector_marker)
	_vision_marker = _dot_marker(Color(0.20, 0.58, 1.0), 0.14)
	_vision_marker.name = "VisionDot"
	add_child(_vision_marker)


func _build_player() -> void:
	_player = CharacterBody3D.new()
	_player.name = "CameraLabPlayer"
	add_child(_player)

	var shape_node := CollisionShape3D.new()
	var cap := CapsuleShape3D.new()
	cap.height = 1.55
	cap.radius = 0.34
	shape_node.shape = cap
	shape_node.position.y = 0.78
	_player.add_child(shape_node)

	_body_square = _flat_square("BodySquare", Color(0.18, 0.52, 0.88), 1.28, 0.08)
	_player.add_child(_body_square)
	_body_nose = _front_tab("BodyNose", Color(0.08, 0.20, 0.36), -0.64)
	_body_square.add_child(_body_nose)

	_torso_square = _flat_square("TorsoSquare", Color(0.90, 0.58, 0.18), 0.86, 0.34)
	_player.add_child(_torso_square)
	_torso_nose = _front_tab("TorsoNose", Color(0.36, 0.20, 0.06), -0.43)
	_torso_square.add_child(_torso_nose)
	_survivor_model = _build_block_survivor()
	_player.add_child(_survivor_model)
	for vehicle_id in VEHICLE_MODE_NAMES:
		var model := _build_vehicle_model(vehicle_id)
		_vehicle_models[vehicle_id] = model
		_player.add_child(model)
	_buggy_model = _vehicle_models["buggy"] as Node3D
	_truck_model = _build_vehicle_model("pickup")
	_truck_model.name = "BlockTruckAlias"
	_player.add_child(_truck_model)
	_apply_visual_model()


func _build_camera() -> void:
	_cam = Camera3D.new()
	_cam.name = "CameraLabCamera"
	_cam.current = true
	_cam.near = 0.05
	_cam.far = 400.0
	add_child(_cam)


func _build_ui() -> void:
	var layer := CanvasLayer.new()
	add_child(layer)
	_label = Label.new()
	_label.position = Vector2(18, 16)
	_label.add_theme_font_size_override("font_size", 15)
	_label.add_theme_color_override("font_color", Color(0.88, 0.92, 0.90))
	_label.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.8))
	_label.add_theme_constant_override("shadow_offset_x", 2)
	_label.add_theme_constant_override("shadow_offset_y", 2)
	layer.add_child(_label)


func _add_line(pos: Vector3, size: Vector3, color: Color) -> void:
	var m := MeshInstance3D.new()
	var b := BoxMesh.new()
	b.size = size
	m.mesh = b
	m.position = pos
	m.material_override = _mat(color, 0.9)
	add_child(m)


func _mat(color: Color, roughness: float) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.albedo_color = color
	m.roughness = roughness
	return m


func _dot_marker(color: Color, radius: float) -> MeshInstance3D:
	var m := MeshInstance3D.new()
	var cyl := CylinderMesh.new()
	cyl.top_radius = radius
	cyl.bottom_radius = radius
	cyl.height = 0.08
	m.mesh = cyl
	m.material_override = _mat(color, 0.45)
	return m


func _flat_square(name: String, color: Color, size: float, y: float) -> MeshInstance3D:
	var m := MeshInstance3D.new()
	m.name = name
	var b := BoxMesh.new()
	b.size = Vector3(size, 0.12, size)
	m.mesh = b
	m.position.y = y
	m.material_override = _mat(color, 0.7)
	return m


func _front_tab(name: String, color: Color, front_z: float) -> MeshInstance3D:
	var m := MeshInstance3D.new()
	m.name = name
	var b := BoxMesh.new()
	b.size = Vector3(0.34, 0.14, 0.18)
	m.mesh = b
	m.position = Vector3(0, 0.08, front_z)
	m.material_override = _mat(color, 0.65)
	return m


func _block(parent: Node, name: String, pos: Vector3, size: Vector3, color: Color, rot: Vector3 = Vector3.ZERO) -> MeshInstance3D:
	var m := MeshInstance3D.new()
	m.name = name
	var b := BoxMesh.new()
	b.size = size
	m.mesh = b
	m.position = pos
	m.rotation = rot
	m.material_override = _mat(color, 0.74)
	parent.add_child(m)
	return m


func _wheel(parent: Node, name: String, pos: Vector3) -> MeshInstance3D:
	var m := MeshInstance3D.new()
	m.name = name
	var cyl := CylinderMesh.new()
	cyl.top_radius = 0.34
	cyl.bottom_radius = 0.34
	cyl.height = 0.30
	cyl.radial_segments = 8
	m.mesh = cyl
	m.position = pos
	m.rotation.z = PI * 0.5
	m.material_override = _mat(Color(0.08, 0.08, 0.08), 0.86)
	parent.add_child(m)
	return m


func _build_block_survivor() -> Node3D:
	var root := Node3D.new()
	root.name = "BlockSurvivor"
	root.position.y = 0.56
	var upper := Node3D.new()
	upper.name = "SurvivorUpper"
	root.add_child(upper)
	_survivor_upper = upper
	var cloth := Color(0.42, 0.33, 0.23)
	var dark := Color(0.12, 0.12, 0.12)
	var skin := Color(0.58, 0.39, 0.24)
	_block(root, "pelvis", Vector3(0, 0.50, 0), Vector3(0.72, 0.34, 0.42), dark)
	_block(root, "leg_l", Vector3(-0.22, 0.02, 0), Vector3(0.24, 0.86, 0.24), dark)
	_block(root, "leg_r", Vector3(0.22, 0.02, 0), Vector3(0.24, 0.86, 0.24), dark)
	_block(root, "boot_l", Vector3(-0.22, -0.48, -0.08), Vector3(0.30, 0.16, 0.46), dark)
	_block(root, "boot_r", Vector3(0.22, -0.48, -0.08), Vector3(0.30, 0.16, 0.46), dark)
	_block(upper, "waist", Vector3(0, 0.78, 0), Vector3(0.62, 0.30, 0.38), cloth)
	_block(upper, "chest", Vector3(0, 1.14, 0), Vector3(0.78, 0.54, 0.44), cloth)
	_block(upper, "head", Vector3(0, 1.70, -0.02), Vector3(0.46, 0.46, 0.42), skin)
	_block(upper, "nose", Vector3(0, 1.68, -0.27), Vector3(0.18, 0.12, 0.16), skin)
	_block(upper, "arm_l", Vector3(-0.56, 1.10, -0.02), Vector3(0.18, 0.66, 0.20), cloth, Vector3(0, 0, deg_to_rad(-9)))
	_block(upper, "arm_r", Vector3(0.56, 1.10, -0.02), Vector3(0.18, 0.66, 0.20), cloth, Vector3(0, 0, deg_to_rad(9)))
	_block(upper, "hand_l", Vector3(-0.62, 0.69, -0.03), Vector3(0.20, 0.18, 0.18), skin)
	_block(upper, "hand_r", Vector3(0.62, 0.69, -0.03), Vector3(0.20, 0.18, 0.18), skin)
	return root


func _build_block_truck() -> Node3D:
	var root := Node3D.new()
	root.name = "BlockTruck"
	root.position.y = 0.12
	root.scale = Vector3(0.72, 0.72, 0.72)
	var blue := Color(0.05, 0.28, 0.72)
	var dark := Color(0.08, 0.08, 0.08)
	var metal := Color(0.20, 0.20, 0.18)
	var glass := Color(0.16, 0.24, 0.26)
	_block(root, "chassis_l", Vector3(-0.34, 0.10, 0.0), Vector3(0.16, 0.18, 2.85), metal)
	_block(root, "chassis_r", Vector3(0.34, 0.10, 0.0), Vector3(0.16, 0.18, 2.85), metal)
	_block(root, "front_cross", Vector3(0, 0.15, -1.24), Vector3(0.98, 0.18, 0.16), metal)
	_block(root, "rear_cross", Vector3(0, 0.15, 1.22), Vector3(0.98, 0.18, 0.16), metal)
	_block(root, "hood", Vector3(0, 0.54, -0.96), Vector3(1.12, 0.25, 0.76), blue, Vector3(deg_to_rad(-4), 0, 0))
	_block(root, "cab", Vector3(0, 0.88, -0.24), Vector3(1.02, 0.78, 0.68), blue)
	_block(root, "windshield", Vector3(0, 1.05, -0.61), Vector3(0.84, 0.34, 0.06), glass, Vector3(deg_to_rad(-14), 0, 0))
	_block(root, "bed_floor", Vector3(0, 0.47, 0.78), Vector3(1.16, 0.18, 1.10), blue)
	_block(root, "bed_l", Vector3(-0.64, 0.70, 0.78), Vector3(0.12, 0.42, 1.10), blue)
	_block(root, "bed_r", Vector3(0.64, 0.70, 0.78), Vector3(0.12, 0.42, 1.10), blue)
	_block(root, "tailgate", Vector3(0, 0.68, 1.39), Vector3(1.20, 0.38, 0.12), blue)
	_block(root, "front_bumper", Vector3(0, 0.35, -1.48), Vector3(1.18, 0.20, 0.16), metal)
	_block(root, "rear_bumper", Vector3(0, 0.33, 1.56), Vector3(1.12, 0.18, 0.14), metal)
	_block(root, "grille", Vector3(0, 0.55, -1.39), Vector3(0.86, 0.26, 0.08), metal)
	_block(root, "headlight_l", Vector3(-0.34, 0.58, -1.45), Vector3(0.18, 0.18, 0.06), Color(0.95, 0.86, 0.62))
	_block(root, "headlight_r", Vector3(0.34, 0.58, -1.45), Vector3(0.18, 0.18, 0.06), Color(0.95, 0.86, 0.62))
	_block(root, "seat_l", Vector3(-0.23, 0.67, -0.14), Vector3(0.24, 0.30, 0.22), dark)
	_block(root, "seat_r", Vector3(0.23, 0.67, -0.14), Vector3(0.24, 0.30, 0.22), dark)
	_block(root, "mirror_l", Vector3(-0.67, 0.86, -0.45), Vector3(0.10, 0.16, 0.12), dark)
	_block(root, "mirror_r", Vector3(0.67, 0.86, -0.45), Vector3(0.10, 0.16, 0.12), dark)
	_block(root, "roll_front", Vector3(0, 1.36, -0.33), Vector3(1.03, 0.12, 0.12), metal)
	_block(root, "roll_rear", Vector3(0, 1.30, 0.28), Vector3(1.03, 0.12, 0.12), metal)
	_block(root, "roll_l", Vector3(-0.52, 1.10, -0.02), Vector3(0.12, 0.12, 0.76), metal, Vector3(deg_to_rad(16), 0, 0))
	_block(root, "roll_r", Vector3(0.52, 1.10, -0.02), Vector3(0.12, 0.12, 0.76), metal, Vector3(deg_to_rad(16), 0, 0))
	_wheel(root, "wheel_fl", Vector3(-0.68, 0.22, -1.02))
	_wheel(root, "wheel_fr", Vector3(0.68, 0.22, -1.02))
	_wheel(root, "wheel_rl", Vector3(-0.68, 0.22, 0.95))
	_wheel(root, "wheel_rr", Vector3(0.68, 0.22, 0.95))
	return root


func _build_block_buggy() -> Node3D:
	var root := Node3D.new()
	root.name = "BlockBuggy"
	root.position.y = 0.10
	root.scale = Vector3(0.68, 0.68, 0.68)
	var blue := Color(0.04, 0.24, 0.68)
	var dark := Color(0.08, 0.08, 0.08)
	var metal := Color(0.18, 0.18, 0.16)
	var glass := Color(0.14, 0.21, 0.23)
	_block(root, "chassis_l", Vector3(-0.32, 0.12, -0.05), Vector3(0.14, 0.18, 2.45), metal)
	_block(root, "chassis_r", Vector3(0.32, 0.12, -0.05), Vector3(0.14, 0.18, 2.45), metal)
	_block(root, "front_cross", Vector3(0, 0.17, -1.05), Vector3(0.92, 0.16, 0.14), metal)
	_block(root, "rear_cross", Vector3(0, 0.17, 1.02), Vector3(0.88, 0.16, 0.14), metal)
	_block(root, "nose", Vector3(0, 0.48, -0.78), Vector3(1.02, 0.28, 0.78), blue, Vector3(deg_to_rad(-6), 0, 0))
	_block(root, "cockpit_floor", Vector3(0, 0.38, 0.18), Vector3(0.90, 0.16, 0.72), metal)
	_block(root, "seat", Vector3(0, 0.67, 0.18), Vector3(0.38, 0.38, 0.34), dark)
	_block(root, "dash", Vector3(0, 0.72, -0.28), Vector3(0.58, 0.22, 0.16), dark)
	_block(root, "windshield_bar", Vector3(0, 1.06, -0.34), Vector3(0.86, 0.10, 0.10), metal)
	_block(root, "roll_front", Vector3(0, 1.25, -0.18), Vector3(0.92, 0.12, 0.12), metal)
	_block(root, "roll_rear", Vector3(0, 1.24, 0.62), Vector3(0.82, 0.12, 0.12), metal)
	_block(root, "roll_l", Vector3(-0.46, 0.96, 0.20), Vector3(0.12, 0.12, 1.05), metal, Vector3(deg_to_rad(18), 0, 0))
	_block(root, "roll_r", Vector3(0.46, 0.96, 0.20), Vector3(0.12, 0.12, 1.05), metal, Vector3(deg_to_rad(18), 0, 0))
	_block(root, "side_l", Vector3(-0.58, 0.53, 0.15), Vector3(0.12, 0.34, 0.86), blue)
	_block(root, "side_r", Vector3(0.58, 0.53, 0.15), Vector3(0.12, 0.34, 0.86), blue)
	_block(root, "rear_engine", Vector3(0, 0.55, 0.94), Vector3(0.86, 0.30, 0.46), dark)
	_block(root, "engine_vent", Vector3(0, 0.76, 0.97), Vector3(0.54, 0.08, 0.36), metal)
	_block(root, "front_bumper", Vector3(0, 0.35, -1.30), Vector3(1.12, 0.18, 0.16), metal)
	_block(root, "headlight_l", Vector3(-0.31, 0.56, -1.16), Vector3(0.16, 0.16, 0.06), Color(0.95, 0.84, 0.55))
	_block(root, "headlight_r", Vector3(0.31, 0.56, -1.16), Vector3(0.16, 0.16, 0.06), Color(0.95, 0.84, 0.55))
	_block(root, "tiny_windshield", Vector3(0, 0.91, -0.43), Vector3(0.58, 0.24, 0.05), glass, Vector3(deg_to_rad(-14), 0, 0))
	_wheel(root, "wheel_fl", Vector3(-0.70, 0.23, -0.78))
	_wheel(root, "wheel_fr", Vector3(0.70, 0.23, -0.78))
	_wheel(root, "wheel_rl", Vector3(-0.72, 0.25, 0.82))
	_wheel(root, "wheel_rr", Vector3(0.72, 0.25, 0.82))
	return root


func _build_vehicle_model(vehicle_id: String) -> Node3D:
	var model: Node3D
	match vehicle_id:
		"motorcycle":
			model = _build_motorcycle_model()
		"buggy":
			model = _build_block_buggy()
		"pickup":
			model = _build_block_truck()
		"pickup_truck":
			model = _build_war_pickup_model()
		"van":
			model = _build_van_model()
		"semi":
			model = _build_semi_model()
		"trailer":
			model = _build_trailer_model()
		"rv":
			model = _build_rv_model()
		"suv":
			model = _build_suv_model()
		_:
			model = _build_scavenger_model()
	return _scale_vehicle_model_to_live_footprint(vehicle_id, model)


func _scale_vehicle_model_to_live_footprint(vehicle_id: String, model: Node3D) -> Node3D:
	var current := _style_size_for_model(model)
	var target := _vehicle_visual_target_size(vehicle_id)
	if current.x > 0.001 and target.x > 0.001:
		model.scale.x *= target.x / current.x
	if current.z > 0.001 and target.z > 0.001:
		model.scale.z *= target.z / current.z
	return model


func _vehicle_visual_target_size(vehicle_id: String) -> Vector3:
	var key := vehicle_id
	if key == "truck":
		key = "pickup"
	if not ProtoCar3D.VEHICLES.has(key):
		return Vector3.ZERO
	var spec: Dictionary = ProtoCar3D.VEHICLES[key]
	var chassis: Vector3 = spec["chassis"]
	var half_x := chassis.x * 0.5
	var half_z := chassis.z * 0.5
	var wheels: Array = spec.get("wheels", [])
	for wheel in wheels:
		var w: Array = wheel
		var visible := true if w.size() < 5 else bool(w[4])
		if not visible:
			continue
		var wx := absf(float(w[0]))
		var wz := absf(float(w[1]))
		var radius := float(w[5]) if w.size() > 5 else 0.35
		half_x = maxf(half_x, wx + radius)
		half_z = maxf(half_z, wz + radius)
	return Vector3(half_x * 2.0, chassis.y, half_z * 2.0)


func _build_motorcycle_model() -> Node3D:
	var root := Node3D.new()
	root.name = "BlockMotorcycle"
	root.position.y = 0.12
	root.scale = Vector3(0.82, 0.82, 0.82)
	var red := Color(0.52, 0.12, 0.08)
	var metal := Color(0.16, 0.16, 0.15)
	var dark := Color(0.07, 0.07, 0.07)
	_block(root, "spine", Vector3(0, 0.48, 0), Vector3(0.16, 0.16, 1.62), metal)
	_block(root, "tank", Vector3(0, 0.68, -0.28), Vector3(0.42, 0.28, 0.62), red, Vector3(deg_to_rad(-4), 0, 0))
	_block(root, "seat", Vector3(0, 0.66, 0.36), Vector3(0.38, 0.16, 0.58), dark)
	_block(root, "rear_fender", Vector3(0, 0.64, 0.86), Vector3(0.36, 0.12, 0.42), red, Vector3(deg_to_rad(10), 0, 0))
	_block(root, "fork_l", Vector3(-0.12, 0.56, -0.86), Vector3(0.06, 0.52, 0.08), metal, Vector3(deg_to_rad(-14), 0, 0))
	_block(root, "fork_r", Vector3(0.12, 0.56, -0.86), Vector3(0.06, 0.52, 0.08), metal, Vector3(deg_to_rad(-14), 0, 0))
	_block(root, "handlebar", Vector3(0, 0.96, -0.78), Vector3(0.70, 0.06, 0.08), metal)
	_block(root, "headlight", Vector3(0, 0.72, -1.02), Vector3(0.22, 0.18, 0.08), Color(0.95, 0.84, 0.55))
	_block(root, "exhaust", Vector3(0.25, 0.38, 0.54), Vector3(0.08, 0.08, 0.92), metal, Vector3(deg_to_rad(8), 0, 0))
	_wheel(root, "front_wheel", Vector3(0, 0.24, -1.02))
	_wheel(root, "rear_wheel", Vector3(0, 0.24, 1.02))
	return root


func _build_scavenger_model() -> Node3D:
	var root := Node3D.new()
	root.name = "BlockScavenger"
	root.position.y = 0.10
	root.scale = Vector3(0.70, 0.70, 0.70)
	var rust := Color(0.42, 0.21, 0.10)
	var tan := Color(0.36, 0.31, 0.23)
	var metal := Color(0.18, 0.18, 0.16)
	var glass := Color(0.12, 0.18, 0.20)
	_block(root, "frame_l", Vector3(-0.42, 0.13, 0), Vector3(0.12, 0.16, 2.90), metal)
	_block(root, "frame_r", Vector3(0.42, 0.13, 0), Vector3(0.12, 0.16, 2.90), metal)
	_block(root, "hull", Vector3(0, 0.50, 0.08), Vector3(1.30, 0.38, 2.36), rust)
	_block(root, "hood", Vector3(0, 0.65, -0.92), Vector3(1.18, 0.24, 0.88), tan, Vector3(deg_to_rad(-5), 0, 0))
	_block(root, "cabin", Vector3(0, 0.94, -0.04), Vector3(1.05, 0.58, 0.82), rust)
	_block(root, "windshield", Vector3(0, 1.08, -0.52), Vector3(0.82, 0.28, 0.06), glass, Vector3(deg_to_rad(-13), 0, 0))
	_block(root, "trunk", Vector3(0, 0.68, 0.98), Vector3(1.06, 0.26, 0.72), tan)
	_block(root, "front_plate", Vector3(0, 0.51, -1.34), Vector3(1.08, 0.26, 0.08), metal)
	_block(root, "rear_plate", Vector3(0, 0.48, 1.36), Vector3(1.02, 0.20, 0.10), metal)
	_block(root, "roof_load", Vector3(0, 1.34, -0.02), Vector3(0.72, 0.16, 0.58), metal)
	_block(root, "headlight_l", Vector3(-0.34, 0.58, -1.39), Vector3(0.16, 0.16, 0.06), Color(0.95, 0.84, 0.55))
	_block(root, "headlight_r", Vector3(0.34, 0.58, -1.39), Vector3(0.16, 0.16, 0.06), Color(0.95, 0.84, 0.55))
	_wheel(root, "wheel_fl", Vector3(-0.72, 0.24, -0.94))
	_wheel(root, "wheel_fr", Vector3(0.72, 0.24, -0.94))
	_wheel(root, "wheel_rl", Vector3(-0.72, 0.24, 0.98))
	_wheel(root, "wheel_rr", Vector3(0.72, 0.24, 0.98))
	return root


func _build_war_pickup_model() -> Node3D:
	var root := _build_block_truck()
	root.name = "BlockWarPickup"
	root.scale = Vector3(0.75, 0.75, 0.75)
	var metal := Color(0.16, 0.16, 0.15)
	var crate := Color(0.42, 0.27, 0.13)
	_block(root, "brush_guard_l", Vector3(-0.46, 0.52, -1.62), Vector3(0.10, 0.42, 0.08), metal)
	_block(root, "brush_guard_r", Vector3(0.46, 0.52, -1.62), Vector3(0.10, 0.42, 0.08), metal)
	_block(root, "brush_guard_mid", Vector3(0, 0.72, -1.64), Vector3(0.88, 0.10, 0.08), metal)
	_block(root, "bed_crate_l", Vector3(-0.28, 0.92, 0.82), Vector3(0.34, 0.34, 0.40), crate)
	_block(root, "bed_crate_r", Vector3(0.28, 0.92, 0.98), Vector3(0.34, 0.34, 0.40), crate)
	_block(root, "roof_lights", Vector3(0, 1.56, -0.36), Vector3(0.64, 0.12, 0.12), metal)
	_block(root, "mount_stub", Vector3(0, 1.08, 0.72), Vector3(0.18, 0.30, 0.18), metal)
	return root


func _build_van_model() -> Node3D:
	var root := Node3D.new()
	root.name = "BlockVan"
	root.position.y = 0.12
	root.scale = Vector3(0.66, 0.66, 0.66)
	var body := Color(0.18, 0.31, 0.46)
	var dark := Color(0.08, 0.08, 0.08)
	var metal := Color(0.18, 0.18, 0.16)
	var glass := Color(0.12, 0.18, 0.20)
	_block(root, "frame", Vector3(0, 0.15, 0), Vector3(1.38, 0.18, 3.34), metal)
	_block(root, "body", Vector3(0, 0.86, 0.12), Vector3(1.44, 1.12, 2.90), body)
	_block(root, "nose", Vector3(0, 0.64, -1.50), Vector3(1.34, 0.46, 0.62), body, Vector3(deg_to_rad(-5), 0, 0))
	_block(root, "windshield", Vector3(0, 1.14, -1.18), Vector3(1.04, 0.42, 0.06), glass, Vector3(deg_to_rad(-12), 0, 0))
	_block(root, "side_window_l", Vector3(-0.74, 1.12, -0.28), Vector3(0.06, 0.32, 0.78), glass)
	_block(root, "side_window_r", Vector3(0.74, 1.12, -0.28), Vector3(0.06, 0.32, 0.78), glass)
	_block(root, "rear_doors", Vector3(0, 0.88, 1.62), Vector3(1.28, 0.86, 0.08), body)
	_block(root, "front_bumper", Vector3(0, 0.42, -1.84), Vector3(1.34, 0.18, 0.12), metal)
	_block(root, "rear_bumper", Vector3(0, 0.40, 1.86), Vector3(1.30, 0.18, 0.12), metal)
	_block(root, "roof_rack", Vector3(0, 1.52, 0.04), Vector3(1.10, 0.10, 1.70), metal)
	_block(root, "headlight_l", Vector3(-0.40, 0.64, -1.86), Vector3(0.16, 0.16, 0.06), Color(0.95, 0.84, 0.55))
	_block(root, "headlight_r", Vector3(0.40, 0.64, -1.86), Vector3(0.16, 0.16, 0.06), Color(0.95, 0.84, 0.55))
	_wheel(root, "wheel_fl", Vector3(-0.78, 0.24, -1.16))
	_wheel(root, "wheel_fr", Vector3(0.78, 0.24, -1.16))
	_wheel(root, "wheel_rl", Vector3(-0.78, 0.24, 1.18))
	_wheel(root, "wheel_rr", Vector3(0.78, 0.24, 1.18))
	return root


func _build_rv_model() -> Node3D:
	var root := _build_van_model()
	root.name = "BlockRV"
	root.scale = Vector3(0.70, 0.70, 0.70)
	var cream := Color(0.62, 0.55, 0.43)
	var dark := Color(0.08, 0.08, 0.08)
	var glass := Color(0.12, 0.18, 0.20)
	_block(root, "camper_top", Vector3(0, 1.58, 0.24), Vector3(1.50, 0.34, 2.38), cream)
	_block(root, "side_window_l2", Vector3(-0.78, 1.18, 0.76), Vector3(0.06, 0.30, 0.54), glass)
	_block(root, "side_window_r2", Vector3(0.78, 1.18, 0.76), Vector3(0.06, 0.30, 0.54), glass)
	_block(root, "awning", Vector3(-0.88, 1.34, 0.12), Vector3(0.10, 0.10, 1.60), dark)
	_block(root, "roof_vent", Vector3(0.34, 1.82, -0.22), Vector3(0.32, 0.10, 0.32), dark)
	return root


func _build_suv_model() -> Node3D:
	var root := Node3D.new()
	root.name = "BlockSUV"
	root.position.y = 0.10
	root.scale = Vector3(0.70, 0.70, 0.70)
	var olive := Color(0.24, 0.31, 0.20)
	var metal := Color(0.16, 0.16, 0.15)
	var glass := Color(0.12, 0.18, 0.20)
	_block(root, "frame", Vector3(0, 0.15, 0), Vector3(1.34, 0.18, 2.92), metal)
	_block(root, "body", Vector3(0, 0.70, 0.12), Vector3(1.42, 0.62, 2.34), olive)
	_block(root, "hood", Vector3(0, 0.78, -1.12), Vector3(1.30, 0.28, 0.70), olive, Vector3(deg_to_rad(-4), 0, 0))
	_block(root, "cabin", Vector3(0, 1.12, -0.04), Vector3(1.22, 0.66, 1.18), olive)
	_block(root, "rear_cabin", Vector3(0, 1.03, 0.86), Vector3(1.22, 0.56, 0.86), olive)
	_block(root, "windshield", Vector3(0, 1.20, -0.70), Vector3(0.98, 0.34, 0.06), glass, Vector3(deg_to_rad(-13), 0, 0))
	_block(root, "roof_rack", Vector3(0, 1.52, 0.18), Vector3(1.06, 0.10, 1.34), metal)
	_block(root, "drone_bay", Vector3(0, 1.62, 0.60), Vector3(0.62, 0.12, 0.38), metal)
	_block(root, "front_bumper", Vector3(0, 0.44, -1.54), Vector3(1.36, 0.22, 0.14), metal)
	_block(root, "rear_bumper", Vector3(0, 0.42, 1.48), Vector3(1.24, 0.18, 0.14), metal)
	_wheel(root, "wheel_fl", Vector3(-0.78, 0.24, -0.98))
	_wheel(root, "wheel_fr", Vector3(0.78, 0.24, -0.98))
	_wheel(root, "wheel_rl", Vector3(-0.78, 0.24, 1.02))
	_wheel(root, "wheel_rr", Vector3(0.78, 0.24, 1.02))
	return root


func _build_semi_model() -> Node3D:
	var root := Node3D.new()
	root.name = "BlockSemi"
	root.position.y = 0.12
	root.scale = Vector3(0.62, 0.62, 0.62)
	var body := Color(0.47, 0.11, 0.08)
	var metal := Color(0.17, 0.17, 0.15)
	var glass := Color(0.12, 0.18, 0.20)
	_block(root, "long_frame_l", Vector3(-0.48, 0.16, 0.38), Vector3(0.14, 0.18, 3.80), metal)
	_block(root, "long_frame_r", Vector3(0.48, 0.16, 0.38), Vector3(0.14, 0.18, 3.80), metal)
	_block(root, "hood", Vector3(0, 0.70, -1.42), Vector3(1.44, 0.46, 1.24), body, Vector3(deg_to_rad(-4), 0, 0))
	_block(root, "cab", Vector3(0, 1.20, -0.44), Vector3(1.48, 1.12, 1.10), body)
	_block(root, "windshield", Vector3(0, 1.45, -1.04), Vector3(1.08, 0.42, 0.06), glass, Vector3(deg_to_rad(-12), 0, 0))
	_block(root, "fifth_wheel", Vector3(0, 0.56, 1.04), Vector3(1.00, 0.16, 0.70), metal)
	_block(root, "front_bumper", Vector3(0, 0.52, -2.14), Vector3(1.54, 0.22, 0.14), metal)
	_block(root, "grille", Vector3(0, 0.78, -2.08), Vector3(1.10, 0.42, 0.08), metal)
	_block(root, "stack_l", Vector3(-0.82, 1.52, -0.14), Vector3(0.12, 1.26, 0.12), metal)
	_block(root, "stack_r", Vector3(0.82, 1.52, -0.14), Vector3(0.12, 1.26, 0.12), metal)
	_wheel(root, "wheel_fl", Vector3(-0.88, 0.25, -1.58))
	_wheel(root, "wheel_fr", Vector3(0.88, 0.25, -1.58))
	_wheel(root, "wheel_ml", Vector3(-0.88, 0.25, 0.98))
	_wheel(root, "wheel_mr", Vector3(0.88, 0.25, 0.98))
	_wheel(root, "wheel_rl", Vector3(-0.88, 0.25, 1.66))
	_wheel(root, "wheel_rr", Vector3(0.88, 0.25, 1.66))
	return root


func _build_trailer_model() -> Node3D:
	var root := Node3D.new()
	root.name = "BlockTrailer"
	root.position.y = 0.12
	root.scale = Vector3(0.58, 0.58, 0.58)
	var body := Color(0.42, 0.42, 0.38)
	var metal := Color(0.16, 0.16, 0.15)
	_block(root, "box", Vector3(0, 1.10, 0.42), Vector3(1.70, 1.52, 4.60), body)
	_block(root, "front_panel", Vector3(0, 1.10, -1.94), Vector3(1.76, 1.50, 0.10), metal)
	_block(root, "rear_doors", Vector3(0, 1.10, 2.78), Vector3(1.76, 1.44, 0.12), body)
	_block(root, "frame_l", Vector3(-0.62, 0.24, 0.42), Vector3(0.12, 0.16, 4.90), metal)
	_block(root, "frame_r", Vector3(0.62, 0.24, 0.42), Vector3(0.12, 0.16, 4.90), metal)
	_block(root, "hitch", Vector3(0, 0.38, -2.46), Vector3(0.34, 0.14, 0.90), metal)
	_block(root, "landing_l", Vector3(-0.42, 0.56, -1.60), Vector3(0.10, 0.82, 0.10), metal)
	_block(root, "landing_r", Vector3(0.42, 0.56, -1.60), Vector3(0.10, 0.82, 0.10), metal)
	_block(root, "side_rail_l", Vector3(-0.90, 1.76, 0.42), Vector3(0.08, 0.08, 4.26), metal)
	_block(root, "side_rail_r", Vector3(0.90, 1.76, 0.42), Vector3(0.08, 0.08, 4.26), metal)
	_wheel(root, "wheel_l1", Vector3(-0.88, 0.25, 1.42))
	_wheel(root, "wheel_r1", Vector3(0.88, 0.25, 1.42))
	_wheel(root, "wheel_l2", Vector3(-0.88, 0.25, 2.06))
	_wheel(root, "wheel_r2", Vector3(0.88, 0.25, 2.06))
	return root


func _set_square_visible(value: bool) -> void:
	if _body_square != null:
		_body_square.visible = value
	if _torso_square != null:
		_torso_square.visible = value


func _apply_visual_model() -> void:
	_set_square_visible(_active_model_name == "squares")
	if _survivor_model != null:
		_survivor_model.visible = _active_model_name == "survivor"
	for id in _vehicle_models:
		var model := _vehicle_models[id] as Node3D
		if model != null:
			model.visible = String(id) == _active_model_name
	if _truck_model != null:
		_truck_model.visible = _active_model_name == "truck"


func _visual_model_list() -> PackedStringArray:
	var names := PackedStringArray(["squares", "survivor"])
	for vehicle_id in VEHICLE_MODE_NAMES:
		names.append(vehicle_id)
	names.append("truck")
	return names


func cycle_visual_model() -> void:
	var names := _visual_model_list()
	var idx := names.find(_active_model_name)
	idx = 0 if idx < 0 else (idx + 1) % names.size()
	set_visual_model(names[idx])


func set_visual_model(name: String) -> bool:
	var next := name.to_lower()
	if not _visual_model_list().has(next):
		return false
	_active_model_name = next
	_apply_visual_model()
	return true


func active_model_name() -> String:
	return _active_model_name


func visual_model_names() -> String:
	return ",".join(_visual_model_list())


func _mesh_count(root: Node) -> int:
	if root == null:
		return 0
	var count := 1 if root is MeshInstance3D else 0
	for child in root.get_children():
		count += _mesh_count(child)
	return count


func _style_size_for_model(root: Node3D) -> Vector3:
	if root == null:
		return Vector3.ZERO
	var state := [false, AABB()]
	_accumulate_model_bounds(root, root.transform, state)
	if not bool(state[0]):
		return Vector3.ZERO
	var bounds: AABB = state[1]
	return bounds.size


func _accumulate_model_bounds(node: Node, xform: Transform3D, state: Array) -> void:
	if node is MeshInstance3D:
		var mesh_node := node as MeshInstance3D
		var aabb := mesh_node.get_aabb()
		for i in range(8):
			_merge_bound_point(xform * aabb.get_endpoint(i), state)
	for child in node.get_children():
		if child is Node3D:
			var child_3d := child as Node3D
			_accumulate_model_bounds(child, xform * child_3d.transform, state)


func _merge_bound_point(point: Vector3, state: Array) -> void:
	var point_box := AABB(point, Vector3.ZERO)
	if bool(state[0]):
		var bounds: AABB = state[1]
		state[1] = bounds.merge(point_box)
	else:
		state[0] = true
		state[1] = point_box


func style_part_count(name: String) -> int:
	var key := name.to_lower()
	if _vehicle_models.has(key):
		return _mesh_count(_vehicle_models[key] as Node)
	match key:
		"squares":
			return _mesh_count(_body_square) + _mesh_count(_torso_square)
		"survivor":
			return _mesh_count(_survivor_model)
		"truck":
			return _mesh_count(_truck_model)
	return 0


func style_size(name: String) -> Vector3:
	var key := name.to_lower()
	if _vehicle_models.has(key):
		return _style_size_for_model(_vehicle_models[key] as Node3D)
	match key:
		"squares":
			return _style_size_for_model(_body_square)
		"survivor":
			return _style_size_for_model(_survivor_model)
		"truck":
			return _style_size_for_model(_truck_model)
	return Vector3.ZERO


func style_summary() -> String:
	return "modular low-poly survivor and full fleet vehicle block models: scavenger, motorcycle, buggy, pickup, van, semi, trailer, pickup_truck, rv, suv, with simple interior budgets."


func _read_move_input() -> Vector2:
	if _test_move_active:
		return _test_move.limit_length(1.0)
	return _left_stick_vector()


func _sprint_pressed() -> bool:
	return _test_sprint if _test_move_active else Input.is_action_pressed("drivn_sprint")


func _left_stick_vector() -> Vector2:
	return Vector2(
		Input.get_axis("move_left", "move_right"),
		Input.get_axis("move_down", "move_up")).limit_length(1.0)


func _right_stick_vector() -> Vector2:
	return Vector2(
		Input.get_axis("drivn_aim_left", "drivn_aim_right"),
		Input.get_axis("drivn_aim_up", "drivn_aim_down")).limit_length(1.0)


func _movement_vector(input: Vector2) -> Vector3:
	if input.length_squared() < 0.0001:
		_footwork = "IDLE"
		return Vector3.ZERO
	var fwd := _vec_of(_body_yaw)
	var right := Vector3(-fwd.z, 0, fwd.x)
	var world := fwd * input.y + right * input.x
	if world.length_squared() < 0.0001:
		return Vector3.ZERO
	world = world.normalized()

	var speed := WALK_SPEED
	if input.y > 0.72 and absf(input.x) < 0.38 and _sprint_pressed():
		speed = RUN_SPEED
		_footwork = "RUN"
	elif input.y < -0.05:
		speed = BACKPEDAL_SPEED
		_footwork = "BACKPEDAL"
	elif absf(input.x) > 0.05:
		speed = STRAFE_SPEED
		_footwork = "SIDE-STEP"
	else:
		_footwork = "WALK"
	return world * speed


func _update_split_turn(delta: float) -> void:
	var target_yaw := _yaw_of(_aim_dir)
	var max_twist := deg_to_rad(MAX_TWIST_DEG)
	var raw_delta := wrapf(target_yaw - _body_yaw, -PI, PI)
	var turn_rate := deg_to_rad(FEET_TURN_RATE_DEG)
	if absf(raw_delta) > max_twist:
		var edge_feet_yaw := target_yaw - signf(raw_delta) * max_twist
		turn_rate = deg_to_rad(FEET_CATCHUP_RATE_DEG)
		_body_yaw = _rotate_yaw(_body_yaw, edge_feet_yaw, turn_rate * delta)
	_body_yaw = wrapf(_body_yaw, -PI, PI)

	var clamped_delta := clampf(wrapf(target_yaw - _body_yaw, -PI, PI), -max_twist, max_twist)
	_upper_yaw = wrapf(_body_yaw + clamped_delta, -PI, PI)


func _apply_upper_body_pose() -> void:
	var twist := wrapf(_upper_yaw - _body_yaw, -PI, PI)
	if _torso_square != null:
		_torso_square.rotation.y = twist
	if _torso_nose != null:
		_torso_nose.rotation.y = twist
	if _survivor_upper != null:
		_survivor_upper.rotation.y = twist


func _update_aim_from_mouse() -> void:
	if _test_aim_active:
		return
	var stick := _right_stick_vector()
	if stick.length() > 0.24:
		_aim_dir = Vector3(stick.x, 0.0, stick.y).normalized()
		_aim_source = "RIGHT STICK"
		return
	if _cam == null or _player == null:
		return
	var player_px := _cam.unproject_position(_player.global_position + Vector3(0, 1.0, 0))
	var mouse := get_viewport().get_mouse_position()
	var rel := mouse - player_px
	if rel.length() < 10.0:
		return
	# Keep the mouse-to-heading read independent from the orbiting camera. The first
	# version used camera right/forward here, so rotating the camera changed what the
	# same cursor position meant and caused runaway spin.
	var d := Vector3(rel.x, 0.0, rel.y)
	if d.length_squared() > 0.001:
		_aim_dir = d.normalized()
		_aim_source = "MOUSE"


func _update_camera(delta: float, snap: bool) -> void:
	var k := 1.0 if snap else 1.0 - exp(-8.0 * delta)
	var feet_dir := _vec_of(_body_yaw)
	_cam_dir = _cam_dir.slerp(feet_dir, k) if _cam_dir.length_squared() > 0.01 else feet_dir
	_cam_dir = _cam_dir.normalized()
	var height := lerpf(CLOSE_HEIGHT, FAR_HEIGHT, _zoom_t)
	var back := lerpf(CLOSE_BACK, FAR_BACK, _zoom_t)
	var lookahead := lerpf(2.2, 4.8, _zoom_t)
	var target := _player.global_position + Vector3(0, 1.05, 0) + _cam_dir * lookahead
	var want := _player.global_position - _cam_dir * back + Vector3(0, height, 0)
	_cam.global_position = want if snap else _cam.global_position.lerp(want, 1.0 - exp(-7.5 * delta))
	_cam.look_at(target, Vector3.UP)
	_cam.fov = lerpf(_cam.fov, lerpf(CLOSE_FOV, FAR_FOV, _zoom_t), 1.0 - exp(-9.0 * delta))


func _update_markers() -> void:
	if _selector_marker != null:
		_selector_marker.global_position = _player.global_position + _aim_dir * 4.0 + Vector3(0, 0.06, 0)
	if _vision_marker != null:
		_vision_marker.global_position = _player.global_position + _vec_of(_body_yaw) * 2.35 + Vector3(0, 0.08, 0)


func _update_label() -> void:
	if _label == null:
		return
	var mode := "THIRD" if _zoom_t < 0.25 else ("GTA2" if _zoom_t > 0.65 else "CHASE")
	var ls := _left_stick_vector()
	var rs := _right_stick_vector()
	_label.text = "CAMERA LAB  %s  model:%s\n%s\nblue/dot = lower body + vision | yellow/dot = upper body + selector | M cycles model\n%s  aim:%s  speed %.1f  twist %.0f deg  zoom %.2f\nLS %.2f,%.2f   RS %.2f,%.2f" % [
		mode, _active_model_name, recommended_controls_text(), _footwork, _aim_source, _last_speed,
		upper_lower_delta_deg(), _zoom_t, ls.x, ls.y, rs.x, rs.y]


static func _yaw_of(v: Vector3) -> float:
	return atan2(-v.x, -v.z)


static func _vec_of(yaw: float) -> Vector3:
	return Vector3(-sin(yaw), 0.0, -cos(yaw))


static func _rotate_yaw(from: float, to: float, amount: float) -> float:
	var d := wrapf(to - from, -PI, PI)
	return from + clampf(d, -amount, amount)


func set_test_aim_dir(dir: Vector3) -> void:
	var d := dir
	d.y = 0.0
	if d.length_squared() < 0.001:
		return
	_test_aim_active = true
	_aim_dir = d.normalized()
	_aim_source = "TEST"


func set_test_move(move: Vector2, sprint: bool) -> void:
	_test_move_active = true
	_test_move = move.limit_length(1.0)
	_test_sprint = sprint


func set_test_zoom(value: float) -> void:
	_zoom_t = clampf(value, 0.0, 1.0)


func reset_test_pose(pos: Vector3) -> void:
	_player.global_position = pos
	_player.velocity = Vector3.ZERO
	_body_yaw = _yaw_of(_aim_dir)
	_upper_yaw = _body_yaw
	_prev_yaw = _body_yaw
	_cam_dir = _vec_of(_body_yaw)
	_last_speed = 0.0
	_footwork = "IDLE"
	_update_camera(1.0 / 60.0, true)


func camera_behind_dot() -> float:
	var to_cam := _cam.global_position - _player.global_position
	to_cam.y = 0.0
	if to_cam.length_squared() < 0.001:
		return 0.0
	return to_cam.normalized().dot(-_aim_dir.normalized())


func camera_behind_feet_dot() -> float:
	var to_cam := _cam.global_position - _player.global_position
	to_cam.y = 0.0
	if to_cam.length_squared() < 0.001:
		return 0.0
	return to_cam.normalized().dot(-_vec_of(_body_yaw))


func camera_height() -> float:
	return _cam.global_position.y - _player.global_position.y


func player_position() -> Vector3:
	return _player.global_position


func last_speed() -> float:
	return _last_speed


func upper_lower_delta_deg() -> float:
	return rad_to_deg(wrapf(_upper_yaw - _body_yaw, -PI, PI))


func max_twist_deg() -> float:
	return MAX_TWIST_DEG


func feet_facing() -> Vector3:
	return _vec_of(_body_yaw)


func upper_facing() -> Vector3:
	return _vec_of(_upper_yaw)


func footwork_label() -> String:
	return _footwork


func active_aim_source() -> String:
	return _aim_source


func selector_dot_visible() -> bool:
	return _selector_marker != null and _selector_marker.visible


func vision_dot_visible() -> bool:
	return _vision_marker != null and _vision_marker.visible


func selector_dot_alignment() -> float:
	if _selector_marker == null:
		return 0.0
	var d := _selector_marker.global_position - _player.global_position
	d.y = 0.0
	if d.length_squared() < 0.001:
		return 0.0
	return d.normalized().dot(_aim_dir.normalized())


func vision_dot_alignment() -> float:
	if _vision_marker == null:
		return 0.0
	var d := _vision_marker.global_position - _player.global_position
	d.y = 0.0
	if d.length_squared() < 0.001:
		return 0.0
	return d.normalized().dot(_vec_of(_body_yaw))


func square_visuals_ready() -> bool:
	return _body_square != null and _torso_square != null and _body_square.visible and _torso_square.visible


func torso_square_alignment() -> float:
	if _torso_square == null:
		return 0.0
	var fwd := -_torso_square.global_basis.z
	fwd.y = 0.0
	if fwd.length_squared() < 0.001:
		return 0.0
	return fwd.normalized().dot(_vec_of(_upper_yaw))


func body_square_alignment() -> float:
	if _body_square == null:
		return 0.0
	var fwd := -_body_square.global_basis.z
	fwd.y = 0.0
	if fwd.length_squared() < 0.001:
		return 0.0
	return fwd.normalized().dot(_vec_of(_body_yaw))


func controller_bindings_ready() -> bool:
	for action in ["move_left", "move_right", "move_up", "move_down",
			"drivn_aim_left", "drivn_aim_right", "drivn_aim_up", "drivn_aim_down",
			"drivn_sprint"]:
		if not InputMap.has_action(action):
			return false
	return true


func recommended_controls_text() -> String:
	return "Mouse aims torso; WASD moves feet. PlayStation: Left stick footwork, Right stick torso selector, L3 sprint."
