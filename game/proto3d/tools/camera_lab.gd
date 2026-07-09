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

var _player: CharacterBody3D
var _body_square: MeshInstance3D
var _body_nose: MeshInstance3D
var _torso_square: MeshInstance3D
var _torso_nose: MeshInstance3D
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

var _test_aim_active: bool = false
var _test_move_active: bool = false
var _test_move := Vector2.ZERO
var _test_sprint: bool = false


func _ready() -> void:
	ProtoInputMap.ensure()
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
	_label.text = "CAMERA LAB  %s\n%s\nblue square/dot = body + vision | yellow square/dot = torso + selector\n%s  aim:%s  speed %.1f  twist %.0f deg  zoom %.2f\nLS %.2f,%.2f   RS %.2f,%.2f" % [
		mode, recommended_controls_text(), _footwork, _aim_source, _last_speed,
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
