## PROTO-3D car: real raycast-suspension vehicle physics (VehicleBody3D).
## No faked bicycle model — suspension, tire slip, and weight transfer are simulated.
## Forward is -Z. Built entirely from code via ProtoCar3D.create().
class_name ProtoCar3D
extends VehicleBody3D

signal speed_changed(mph: float)

@export_group("Drive Feel")
@export var max_engine_force: float = 6500.0
@export var max_brake: float = 40.0
@export var max_steer: float = 0.55          ## Radians at standstill
@export var high_speed_steer: float = 0.16   ## Radians at top speed
@export var steer_speed: float = 5.0         ## How fast the wheel turns (rad/s)
@export var top_speed: float = 34.0          ## m/s (~76 mph)
@export var reverse_top_speed: float = 11.0
@export var grip_front: float = 5.5   ## Higher = more planted (less slide). Worn/blown tires LOWER this.
@export var grip_rear: float = 5.0    ## Baseline grip; the Tires component modifies it (see LOOP2 spec).
@export var handbrake_grip_rear: float = 2.4  ## Slide grip — playtest bug: 1.1 spun the car a full 180.
@export var handbrake_steer_mult: float = 0.55 ## Steering authority while sliding (full lock = spin).

## When true the car reads keyboard/gamepad input itself (while is_active).
## The drive_sim test sets this false and feeds the input fields directly.
var use_player_input: bool = true
var is_active: bool = false

## Locked cars need their key found somewhere in the world.
var locked: bool = false
var key_id: String = ""
var key_display: String = "key"
var display_name: String = "car"

var input_throttle: float = 0.0
var input_brake: float = 0.0
var input_steer: float = 0.0  ## +1 = left
var input_handbrake: bool = false

var current_mph: float = 0.0
var forward_speed: float = 0.0

var _front_wheels: Array[VehicleWheel3D] = []
var _rear_wheels: Array[VehicleWheel3D] = []


static func create(body_color: Color) -> ProtoCar3D:
	var car := ProtoCar3D.new()
	car.add_to_group("interactable")
	car.mass = 900.0
	car.center_of_mass_mode = RigidBody3D.CENTER_OF_MASS_MODE_CUSTOM
	car.center_of_mass = Vector3(0, -0.25, 0)

	# Chassis collision
	var shape := CollisionShape3D.new()
	var box := BoxShape3D.new()
	box.size = Vector3(2.0, 0.7, 4.4)
	shape.shape = box
	car.add_child(shape)

	# Body visuals: hull + cabin + windshield hint so you can read the facing.
	var hull := MeshInstance3D.new()
	var hull_mesh := BoxMesh.new()
	hull_mesh.size = Vector3(2.0, 0.55, 4.4)
	hull.mesh = hull_mesh
	hull.material_override = ProtoWorldBuilder.material(body_color, 0.55)
	hull.position.y = 0.05
	car.add_child(hull)

	var cabin := MeshInstance3D.new()
	var cabin_mesh := BoxMesh.new()
	cabin_mesh.size = Vector3(1.7, 0.5, 2.0)
	cabin.mesh = cabin_mesh
	cabin.material_override = ProtoWorldBuilder.material(body_color * 0.75, 0.5)
	cabin.position = Vector3(0, 0.55, 0.25)
	car.add_child(cabin)

	var windshield := MeshInstance3D.new()
	var ws_mesh := BoxMesh.new()
	ws_mesh.size = Vector3(1.55, 0.42, 0.12)
	windshield.mesh = ws_mesh
	windshield.material_override = ProtoWorldBuilder.material(Color(0.15, 0.2, 0.25), 0.2)
	windshield.position = Vector3(0, 0.55, -0.8)
	car.add_child(windshield)

	# Tail lights (emissive) — helps read facing from top-down.
	for tx in [-0.7, 0.7]:
		var tail := MeshInstance3D.new()
		var tmesh := BoxMesh.new()
		tmesh.size = Vector3(0.35, 0.15, 0.08)
		tail.mesh = tmesh
		tail.material_override = ProtoWorldBuilder.material(Color(0.9, 0.1, 0.08), 0.4, true)
		tail.position = Vector3(tx, 0.2, 2.2)
		car.add_child(tail)

	# Wheels: front pair steers, rear pair drives.
	var wheel_specs: Array = [
		[Vector3(-0.85, -0.15, -1.45), true, false],
		[Vector3(0.85, -0.15, -1.45), true, false],
		[Vector3(-0.85, -0.15, 1.45), false, true],
		[Vector3(0.85, -0.15, 1.45), false, true],
	]
	for spec in wheel_specs:
		var wheel := VehicleWheel3D.new()
		wheel.position = spec[0]
		wheel.use_as_steering = spec[1]
		wheel.use_as_traction = spec[2]
		wheel.wheel_radius = 0.38
		wheel.wheel_rest_length = 0.22
		wheel.suspension_travel = 0.25
		wheel.suspension_stiffness = 45.0
		wheel.suspension_max_force = 12000.0
		wheel.damping_compression = 0.25 * 2.0 * sqrt(45.0)
		wheel.damping_relaxation = 0.4 * 2.0 * sqrt(45.0)
		wheel.wheel_roll_influence = 0.05
		var tire := MeshInstance3D.new()
		var tmesh := CylinderMesh.new()
		tmesh.top_radius = 0.38
		tmesh.bottom_radius = 0.38
		tmesh.height = 0.3
		tire.mesh = tmesh
		tire.material_override = ProtoWorldBuilder.material(Color(0.08, 0.08, 0.08), 1.0)
		tire.rotation_degrees.z = 90.0
		wheel.add_child(tire)
		car.add_child(wheel)
		if spec[1]:
			car._front_wheels.append(wheel)
		else:
			car._rear_wheels.append(wheel)
	for w in car._front_wheels:
		w.wheel_friction_slip = car.grip_front
	for w in car._rear_wheels:
		w.wheel_friction_slip = car.grip_rear
	return car


func facing() -> Vector3:
	return -global_basis.z


# --- Interactable contract (on-foot) ---------------------------------------

func interact_position() -> Vector3:
	return global_position


func interact_prompt(main: Node) -> String:
	if is_active:
		return ""
	if locked and not main.has_key(key_id):
		return "LOCKED — need %s" % key_display
	if locked:
		return "E — Unlock %s (%s)" % [display_name, key_display]
	return "E — Enter %s" % display_name


func interact(main: Node) -> void:
	if is_active:
		return
	if locked:
		if main.has_key(key_id):
			locked = false
			main.notify("Unlocked the %s" % display_name)
		return
	main.enter_car(self)


func _physics_process(delta: float) -> void:
	forward_speed = linear_velocity.dot(-global_basis.z)
	current_mph = absf(forward_speed) * 2.237
	speed_changed.emit(current_mph)

	if not is_active:
		engine_force = 0.0
		brake = 3.0  # parking brake
		steering = move_toward(steering, 0.0, steer_speed * delta)
		return

	if use_player_input:
		input_throttle = Input.get_action_strength("move_up")
		input_brake = Input.get_action_strength("move_down")
		input_steer = Input.get_axis("move_right", "move_left")
		input_handbrake = Input.is_action_pressed("jump")

	# Steering authority falls off with speed for stability, ramps in smoothly.
	# While the handbrake is down, authority is trimmed too — full lock mid-slide
	# whipped the car 180 (first-playtest bug); a drift should be steered, not spun.
	var speed_ratio := clampf(absf(forward_speed) / top_speed, 0.0, 1.0)
	var steer_limit := lerpf(max_steer, high_speed_steer, speed_ratio)
	if input_handbrake:
		steer_limit *= handbrake_steer_mult
	steering = move_toward(steering, input_steer * steer_limit, steer_speed * delta)

	# Throttle / brake / reverse.
	# NOTE: measured empirically via drive_sim — positive engine_force pushes +Z,
	# so forward (-Z) drive needs a NEGATIVE engine force.
	engine_force = 0.0
	brake = 0.0
	if input_throttle > 0.0 and forward_speed < top_speed:
		# Taper force as speed climbs — punchy low end, natural top-speed plateau.
		engine_force = -input_throttle * max_engine_force * lerpf(1.0, 0.45, speed_ratio)
	if input_brake > 0.0:
		if forward_speed > 1.0:
			brake = input_brake * max_brake
		elif forward_speed > -reverse_top_speed:
			engine_force = input_brake * max_engine_force * 0.5

	# Handbrake: kill rear grip + light brake = slides on demand.
	var rear_grip := handbrake_grip_rear if input_handbrake else grip_rear
	for w in _rear_wheels:
		w.wheel_friction_slip = rear_grip
	if input_handbrake:
		brake = maxf(brake, 6.0)
