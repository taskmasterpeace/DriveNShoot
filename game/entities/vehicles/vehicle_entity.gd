## Vehicle physics from POWERHACK69 2D-Topdown-Movement-and-Car
class_name VehicleEntity
extends CharacterBody2D

signal driver_entered(driver: Node2D)
signal driver_exited(driver: Node2D)
signal speed_changed(mph: float)
signal health_changed(hp: float, max_hp: float)
signal vehicle_destroyed
signal breakdown
signal repaired

@export var max_hp: float = 100.0
var hp: float = 100.0


@export var steering_angle = 15  # Maximum angle for steering the car's wheels
@export var engine_power = 900  # How much force the engine can apply for acceleration
@export var friction = -55  # The friction coefficient that slows down the car
@export var drag = -0.06  # Air drag coefficient that also slows down the car
@export var braking = -450  # Braking power when the brake input is applied
@export var max_speed_reverse = 250  # Maximum speed limit in reverse
@export var slip_speed = 400  # Speed above which the car's traction decreases (for drifting)
@export var traction_fast = 2.5  # Traction factor when the car is moving fast (affects control)
@export var traction_slow = 10  # Traction factor when the car is moving slow (affects control)
@export var handbrake_friction = -200  # Extra friction when handbrake is pulled
@export var handbrake_traction = 1.0  # Low traction for drifting

var wheel_base = 65  # Distance between the front and back axle of the car
var acceleration = Vector2.ZERO  # Current acceleration vector
var steer_direction = 0.0  # Current direction of steering
var _handbrake = false

# Input variables (Set by Driver or AI)
var input_throttle: float = 0.0 # 0.0 to 1.0 (Forward)
var input_braking: float = 0.0 # 0.0 to 1.0 (Brake/Reverse)
var input_steering: float = 0.0 # -1.0 to 1.0
var input_handbrake: bool = false

var is_active: bool = false
var current_driver: Node2D = null
var current_mph: float = 0.0

@export var data: DataVehicle
@export var sprite_node: Sprite2D

func _ready() -> void:
	if data:
		load_data(data)

func load_data(_data: DataVehicle) -> void:
	data = _data
	if sprite_node and data.icon:
		sprite_node.texture = data.icon
		# Update collision shape based on sprite size if needed?
		# For now, just visual.
	
	engine_power = data.acceleration
	braking = -data.braking # Braking is negative force
	steering_angle = data.steering_angle
	max_speed_reverse = data.max_speed_reverse
	slip_speed = data.slip_speed
	wheel_base = data.wheel_base
	traction_fast = data.traction_slip
	traction_slow = data.traction_grip

const PIXELS_PER_MPH: float = 30.0

func _physics_process(delta: float) -> void:
	if is_active:
		acceleration = Vector2.ZERO
		get_input()
		apply_input()
		calculate_steering(delta)

	velocity += acceleration * delta
	apply_friction(delta)
	velocity += acceleration * delta
	apply_friction(delta)
	move_and_slide()

	# Check for high speed collisions
	if get_slide_collision_count() > 0:
		_check_collision_damage()


	current_mph = velocity.length() / PIXELS_PER_MPH
	speed_changed.emit(current_mph)

	if has_node("Camera2D"):
		$Camera2D.enabled = is_active

func get_input():
	# If Player Driven
	if current_driver:
		# Exit vehicle
		if Input.is_action_just_pressed("interact"):
			exit_vehicle()
			return

		# Get steering input and translate it to an angle
		input_steering = Input.get_axis("ui_left", "ui_right")
		input_handbrake = Input.is_action_pressed("jump")
		
		# Analog Throttle/Brake support
		input_throttle = Input.get_action_strength("ui_up")
		input_braking = Input.get_action_strength("ui_down")
	
func apply_input():
	steer_direction = input_steering * deg_to_rad(steering_angle)
	_handbrake = input_handbrake
	
	if input_throttle > 0:
		acceleration = transform.x * engine_power * input_throttle
		
	if input_braking > 0:
		acceleration = transform.x * braking * input_braking

func apply_friction(delta):
	# If there is no input and speed is very low, just stop to prevent endless sliding
	if acceleration == Vector2.ZERO and velocity.length() < 50 and not _handbrake:
		velocity = Vector2.ZERO
	# Calculate friction force and air drag based on current velocity, and apply it
	var current_friction = friction
	if _handbrake:
		current_friction += handbrake_friction
	var friction_force = velocity * current_friction * delta
	var drag_force = velocity * velocity.length() * drag * delta
	# Add the forces to the acceleration
	acceleration += drag_force + friction_force

func calculate_steering(delta):
	if velocity.length() < 5:
		return

	# Calculate the positions of the rear and front wheel
	var rear_wheel = position - transform.x * wheel_base / 2.0
	var front_wheel = position + transform.x * wheel_base / 2.0
	# Advance the wheels' positions based on the current velocity, applying rotation to the front wheel
	rear_wheel += velocity * delta
	front_wheel += velocity.rotated(steer_direction) * delta
	# Calculate the new heading based on the wheels' positions
	var new_heading = rear_wheel.direction_to(front_wheel)

	# Choose the traction model based on the current speed
	var traction = traction_slow
	if velocity.length() > slip_speed:
		traction = traction_fast
	# Handbrake reduces traction for drifting
	if _handbrake:
		traction = handbrake_traction

	# Dot product represents how aligned the new heading is with the current velocity direction
	var d = new_heading.dot(velocity.normalized())

	# If not braking (d > 0), adjust the car velocity smoothly towards the new heading
	if d > 0:
		velocity = velocity.lerp(new_heading * velocity.length(), traction * delta)

	# If braking (d < 0), reverse the direction and limit the speed
	if d < 0:
		velocity = -new_heading * min(velocity.length(), max_speed_reverse)

	# Smoothly rotate to new heading instead of snapping (fixes oscillation)
	var target_rotation = new_heading.angle()
	rotation = lerp_angle(rotation, target_rotation, 10.0 * delta)

func enter_vehicle(driver: Node2D) -> void:
	if is_active:
		return
	current_driver = driver
	is_active = true
	driver_entered.emit(driver)

func exit_vehicle() -> void:
	if not is_active or not current_driver:
		return
	var driver = current_driver
	current_driver = null
	is_active = false
	driver_exited.emit(driver)

func get_exit_position() -> Vector2:
	if has_node("ExitMarker"):
		return $ExitMarker.global_position
	return global_position + Vector2(0, 80).rotated(rotation)

var _last_damage_time: float = 0.0
var _last_mile_check: float = 0.0
var is_broken: bool = false
var smoke_node: CPUParticles2D

func _ready() -> void:
	if data:
		load_data(data)
	
	if has_node("/root/GameState"):
		get_node("/root/GameState").distance_updated.connect(_on_distance_updated)
		
	# Setup Smoke
	smoke_node = CPUParticles2D.new()
	smoke_node.emitting = false
	smoke_node.amount = 16
	smoke_node.lifetime = 1.0
	smoke_node.direction = Vector2(0, -1)
	smoke_node.gravity = Vector2(0, -98)
	smoke_node.spread = 45.0
	smoke_node.initial_velocity_min = 20.0
	smoke_node.initial_velocity_max = 50.0
	smoke_node.scale_amount_min = 4.0
	smoke_node.scale_amount_max = 8.0
	smoke_node.color = Color(0.3, 0.3, 0.3, 0.8)
	smoke_node.position = Vector2(0, 0) # Center
	add_child(smoke_node)

var _last_repair_mile: float = 0.0

func _on_distance_updated(miles: float) -> void:
	if miles - _last_mile_check >= 1.0: # Check every mile
		_last_mile_check = floor(miles)
		
		# Pity Timer: No breakdowns before 0.2 mi
		if miles < 0.2: return
		
		# Cooldown: No breakdown if recently repaired (within 0.3 mi)
		if miles - _last_repair_mile < 0.3: return
		
		_roll_breakdown_chance()

func _roll_breakdown_chance() -> void:
	if is_broken: return
	
	var chance = 0.2
	if has_node("/root/GameState"):
		chance *= get_node("/root/GameState").get_breakdown_multiplier()
		
	if randf() < chance: # Chance per mile
		break_down()

func break_down() -> void:
	is_broken = true
	breakdown.emit()
	print("VEHICLE WENT CLUNK! SMOKE EVERYWHERE!")
	# Reduce power
	engine_power *= 0.1 
	if smoke_node:
		smoke_node.emitting = true
	
func repair() -> void:
	is_broken = false
	repaired.emit()
	print("Vehicle Repaired!")
	
	# Update cooldown tracker
	if has_node("/root/GameState"):
		_last_repair_mile = get_node("/root/GameState").current_run_miles
		
	# Restore power
	if data:
		engine_power = data.acceleration # Reset to base
	else:
		engine_power = 900 # Fallback
		
	if smoke_node:
		smoke_node.emitting = false

	
# Override interact logic (handled by controller usually, but we can intercept?)
# Controller calls enter_vehicle directly if it's a vehicle.
func can_enter(player: Node2D) -> bool:
	if is_broken:
		# Player must repair first
		return false
	return true



func take_damage(amount: float) -> void:
	# Apply Armor Upgrade
	if has_node("/root/GameState"):
		amount *= get_node("/root/GameState").get_damage_multiplier()

	hp -= amount
	health_changed.emit(hp, max_hp)
	print("Vehicle hit! HP: ", hp)
	
	if has_node("/root/GameState"):
		get_node("/root/GameState").add_heat(5, "Crash")
	
	if hp <= 0:
		_die()

func _die() -> void:
	print("Vehicle Destroyed!")
	vehicle_destroyed.emit()
	if has_node("/root/GameState"):
		get_node("/root/GameState").fail_run("Wrecked")

