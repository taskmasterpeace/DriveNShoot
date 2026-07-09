## DRIVN camera lab: a small playable harness for testing a GTA2-grounded
## on-foot camera. Mouse chooses facing, W moves forward in that facing, and the
## camera rides opposite the facing vector. Wheel/V blend overhead <-> third-person.
extends Node3D

const CLOSE_HEIGHT := 3.1
const FAR_HEIGHT := 28.0
const CLOSE_BACK := 6.4
const FAR_BACK := 11.0
const CLOSE_FOV := 72.0
const FAR_FOV := 58.0
const TURN_RATE_DEG := 720.0
const WALK_SPEED := 3.9
const RUN_SPEED := 7.2
const BACKPEDAL_SPEED := 2.4
const STRAFE_SPEED := 3.2

var _player: CharacterBody3D
var _puppet: Node3D
var _cam: Camera3D
var _label: Label
var _aim_marker: MeshInstance3D

var _aim_dir := Vector3(0, 0, -1)
var _cam_dir := Vector3(0, 0, -1)
var _body_yaw: float = 0.0
var _prev_yaw: float = 0.0
var _zoom_t: float = 0.78
var _last_speed: float = 0.0

var _test_aim_active: bool = false
var _test_move_active: bool = false
var _test_move := Vector2.ZERO
var _test_sprint: bool = false


func _ready() -> void:
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
	var target_yaw := _yaw_of(_aim_dir)
	_body_yaw = _rotate_yaw(_body_yaw, target_yaw, deg_to_rad(TURN_RATE_DEG) * delta)
	_player.rotation.y = _body_yaw

	var move_input := _read_move_input()
	var wish := _movement_vector(move_input)
	_player.velocity.x = wish.x
	_player.velocity.z = wish.z
	_player.velocity.y = 0.0
	_player.move_and_slide()
	_last_speed = Vector2(_player.velocity.x, _player.velocity.z).length()

	if _puppet != null and _puppet.has_method("animate"):
		var turn_rate := wrapf(_body_yaw - _prev_yaw, -PI, PI) / maxf(delta, 0.0001)
		_prev_yaw = _body_yaw
		_puppet.call("animate", delta, _last_speed, turn_rate, false, 0.0, false)

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

	_aim_marker = MeshInstance3D.new()
	var marker := CylinderMesh.new()
	marker.top_radius = 0.16
	marker.bottom_radius = 0.16
	marker.height = 0.08
	_aim_marker.mesh = marker
	_aim_marker.material_override = _mat(Color(0.95, 0.72, 0.22), 0.45)
	add_child(_aim_marker)


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

	if ClassDB.class_exists("ProtoPuppet"):
		_puppet = ProtoPuppet.create({"cloth": Color(0.58, 0.49, 0.36), "skin": Color(0.78, 0.66, 0.50)})
		_player.add_child(_puppet)
	else:
		var body := MeshInstance3D.new()
		var bm := BoxMesh.new()
		bm.size = Vector3(0.75, 1.5, 0.45)
		body.mesh = bm
		body.position.y = 0.82
		body.material_override = _mat(Color(0.58, 0.49, 0.36), 0.72)
		_player.add_child(body)
		_puppet = body


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


func _read_move_input() -> Vector2:
	if _test_move_active:
		return _test_move.limit_length(1.0)
	var x := 0.0
	var y := 0.0
	if Input.is_key_pressed(KEY_A):
		x -= 1.0
	if Input.is_key_pressed(KEY_D):
		x += 1.0
	if Input.is_key_pressed(KEY_W):
		y += 1.0
	if Input.is_key_pressed(KEY_S):
		y -= 1.0
	return Vector2(x, y).limit_length(1.0)


func _sprint_pressed() -> bool:
	return _test_sprint if _test_move_active else Input.is_key_pressed(KEY_SHIFT)


func _movement_vector(input: Vector2) -> Vector3:
	if input.length_squared() < 0.0001:
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
	elif input.y < -0.05:
		speed = BACKPEDAL_SPEED
	elif absf(input.x) > 0.05:
		speed = STRAFE_SPEED
	return world * speed


func _update_aim_from_mouse() -> void:
	if _test_aim_active:
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


func _update_camera(delta: float, snap: bool) -> void:
	var k := 1.0 if snap else 1.0 - exp(-8.0 * delta)
	_cam_dir = _cam_dir.slerp(_aim_dir, k) if _cam_dir.length_squared() > 0.01 else _aim_dir
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
	if _aim_marker == null:
		return
	_aim_marker.global_position = _player.global_position + _aim_dir * 4.0 + Vector3(0, 0.06, 0)


func _update_label() -> void:
	if _label == null:
		return
	var mode := "THIRD" if _zoom_t < 0.25 else ("GTA2" if _zoom_t > 0.65 else "CHASE")
	_label.text = "CAMERA LAB  %s\nWASD move  |  Mouse around body turns facing\nShift sprint only when moving forward  |  Wheel zoom  |  V toggle  |  R reset\nspeed %.1f m/s  zoom %.2f" % [mode, _last_speed, _zoom_t]


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
	_prev_yaw = _body_yaw
	_cam_dir = _aim_dir.normalized()
	_last_speed = 0.0
	_update_camera(1.0 / 60.0, true)


func camera_behind_dot() -> float:
	var to_cam := _cam.global_position - _player.global_position
	to_cam.y = 0.0
	if to_cam.length_squared() < 0.001:
		return 0.0
	return to_cam.normalized().dot(-_aim_dir.normalized())


func camera_height() -> float:
	return _cam.global_position.y - _player.global_position.y


func player_position() -> Vector3:
	return _player.global_position


func last_speed() -> float:
	return _last_speed
