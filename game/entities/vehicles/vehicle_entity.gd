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
signal passenger_entry_started(delay_seconds: float)
signal passenger_entry_completed

@export var max_hp: float = 100.0
var hp: float = 100.0

## Faction: 0 = player/friendly, 1 = hostile. Used by projectiles for friendly-fire checks
## and by multiplayer to distinguish player-owned vehicles.
@export var team: int = 0

# Collision damage tuning
@export_group("Collision Damage")
@export var collision_speed_threshold: float = 300.0  ## Min speed (px/s) for impact damage
@export var collision_damage_scale: float = 10.0  ## Divides excess speed to get damage
@export var min_collision_damage: float = 5.0
@export var max_collision_damage: float = 50.0
@export var collision_damage_cooldown: float = 0.5  ## Seconds between damage ticks

# Passenger entry tuning
@export_group("Entry")
@export var passenger_entry_delay: float = 1.75  ## Seconds to slide across seats

@export_group("Physics")
@export var steering_angle = 15  # Maximum angle for steering the car's wheels
@export var engine_power = 900  # How much force the engine can apply for acceleration
@export var max_speed = 600  # Top speed in pixels/s (prevents infinite acceleration)
@export var friction = -150  # Ground friction — higher = more planted feel
@export var drag = -0.12  # Air drag — higher = more resistance at speed
@export var braking = -450  # Braking power when the brake input is applied
@export var max_speed_reverse = 250  # Maximum speed limit in reverse
@export var slip_speed = 400  # Speed above which the car's traction decreases (for drifting)
@export var traction_fast = 6.0  # Traction at high speed — higher = more grip, less drift
@export var traction_slow = 25.0  # Traction at low speed — higher = snappier steering response
@export var handbrake_friction = -300  # Extra friction when handbrake is pulled
@export var handbrake_traction = 0.8  # Low traction for drifting

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
var is_passenger_delay_active: bool = false
var entry_side: String = ""
var _current_speed: float = 0.0  ## Cached velocity.length() per frame

@onready var _camera: Camera2D = $Camera2D if has_node("Camera2D") else null

@export var data: DataVehicle
@export var sprite_node: Sprite2D

func load_data(_data: DataVehicle) -> void:
	data = _data
	if sprite_node and data.icon:
		sprite_node.texture = data.icon
		# Update collision shape based on sprite size if needed?
		# For now, just visual.
	
	engine_power = data.acceleration
	braking = -data.braking # Braking is negative force
	max_speed = data.max_speed
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
	move_and_slide()

	# Cache speed once per frame (avoids repeated sqrt)
	_current_speed = velocity.length()

	# Check for high speed collisions
	if get_slide_collision_count() > 0:
		_check_collision_damage()

	current_mph = _current_speed / PIXELS_PER_MPH
	speed_changed.emit(current_mph)

	if _camera:
		_camera.enabled = is_active

func _check_collision_damage() -> void:
	# Prevent damage spam - cooldown between hits
	var current_time: float = Time.get_ticks_msec() / 1000.0
	if current_time - _last_damage_time < collision_damage_cooldown:
		return
	_last_damage_time = current_time

	# Calculate damage based on cached collision speed
	if _current_speed > collision_speed_threshold:
		var damage: float = (_current_speed - collision_speed_threshold) / collision_damage_scale
		damage = clamp(damage, min_collision_damage, max_collision_damage)
		take_damage(damage)

func get_input() -> void:
	# If Player Driven
	if current_driver:
		# Block input during passenger entry delay
		if is_passenger_delay_active:
			input_steering = 0.0
			input_throttle = 0.0
			input_braking = 0.0
			input_handbrake = false
			return

		# Exit vehicle
		if Input.is_action_just_pressed("interact"):
			exit_vehicle()
			return

		# Steering: Left stick X or WASD/Arrows
		input_steering = Input.get_axis("move_left", "move_right")
		# Handbrake: Space or Square (PS) / X (Xbox)
		input_handbrake = Input.is_action_pressed("jump")

		# Throttle: W/Up, Left stick up, or R2 trigger (analog)
		input_throttle = Input.get_action_strength("move_up")
		# Brake: S/Down, Left stick down, or L2 trigger (analog)
		input_braking = Input.get_action_strength("move_down")
	
func apply_input() -> void:
	# Reduce steering at high speed for stability (full steering below 40%, linear fade to 40% at top speed)
	var speed_ratio: float = clampf(_current_speed / max_speed, 0.0, 1.0)
	var steer_factor: float = lerpf(1.0, 0.4, speed_ratio)
	steer_direction = input_steering * deg_to_rad(steering_angle) * steer_factor
	_handbrake = input_handbrake

	# Apply throttle only if below max speed
	if input_throttle > 0:
		if _current_speed < max_speed:
			acceleration = transform.x * engine_power * input_throttle
	elif input_braking > 0:
		acceleration = transform.x * -engine_power * input_braking * 0.5

func apply_friction(delta: float) -> void:
	# Stop cleanly at very low speed to prevent sliding/vibration
	if acceleration.length() < 100 and _current_speed < 30:
		velocity = velocity.move_toward(Vector2.ZERO, 200.0 * delta)
		return

	# Ground friction — always opposes motion, gives planted feel
	var current_friction: float = friction
	if _handbrake:
		current_friction += handbrake_friction
	var friction_force: Vector2 = velocity * current_friction * delta
	# Air drag — increases with speed squared, natural top speed limiter
	var drag_force: Vector2 = velocity * velocity.length() * drag * delta

	acceleration += drag_force + friction_force

func calculate_steering(delta: float) -> void:
	if _current_speed < 5:
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
	var traction: float = traction_slow
	if _current_speed > slip_speed:
		traction = traction_fast
	# Handbrake reduces traction for drifting
	if _handbrake:
		traction = handbrake_traction

	# Dot product represents how aligned the new heading is with the current velocity direction
	var d = new_heading.dot(velocity.normalized())

	# If not braking (d > 0), adjust the car velocity smoothly towards the new heading
	if d > 0:
		velocity = velocity.lerp(new_heading * _current_speed, traction * delta)

	# If braking (d < 0), reverse the direction and limit the speed
	if d < 0:
		velocity = -new_heading * min(_current_speed, max_speed_reverse)

	# Set rotation directly to new heading (no lerp - prevents oscillation)
	rotation = new_heading.angle()

func detect_entry_side(player_pos: Vector2) -> String:
	var to_player = (player_pos - global_position).normalized()
	var side_dot = to_player.dot(transform.y)

	# Handle perpendicular approach (front/rear)
	if abs(side_dot) < 0.1:
		return "driver"

	# transform.y points LEFT in Godot's local space
	# Positive = left (driver's side), Negative = right (passenger's side)
	return "driver" if side_dot > 0 else "passenger"

func enter_vehicle(driver: Node2D, player_position: Vector2 = Vector2.ZERO) -> void:
	if is_active or is_passenger_delay_active:
		return

	# Detect entry side
	var player_pos: Vector2 = player_position if player_position != Vector2.ZERO else driver.global_position
	entry_side = detect_entry_side(player_pos)
	current_driver = driver

	# Passenger side delay
	if entry_side == "passenger":
		is_passenger_delay_active = true
		passenger_entry_started.emit(passenger_entry_delay)
		play_passenger_entry_animation()
		await get_tree().create_timer(passenger_entry_delay).timeout
		# Guard against vehicle being freed or driver leaving during await
		if not is_instance_valid(self):
			return
		if current_driver == null:
			is_passenger_delay_active = false
			return
		is_passenger_delay_active = false
		passenger_entry_completed.emit()

	# Activate vehicle
	is_active = true
	driver_entered.emit(driver)

func play_passenger_entry_animation() -> void:
	var original_pos = position
	var tween = create_tween()
	tween.set_parallel(false)

	# Rock back and forth 3 times
	for i in range(3):
		tween.tween_property(self, "position", original_pos + Vector2(2, -1), 0.15)
		tween.tween_property(self, "position", original_pos + Vector2(-2, 1), 0.15)
		tween.tween_property(self, "position", original_pos, 0.15)

	# Ensure exact return to original position
	tween.tween_callback(func(): position = original_pos)

func exit_vehicle() -> void:
	if not is_active or not current_driver:
		return
	var driver = current_driver
	current_driver = null
	is_active = false
	driver_exited.emit(driver)

func get_exit_position() -> Vector2:
	# Always exit on driver's side (left side of vehicle)
	var exit_marker: Node2D = get_node_or_null("DriverExitMarker")
	if exit_marker:
		return exit_marker.global_position
	# Fallback: calculate driver's side position
	return global_position + Vector2(-50, 20).rotated(rotation)

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
	# Visual/audio feedback handled by smoke_node and signals
	# Reduce power
	engine_power *= 0.1 
	if smoke_node:
		smoke_node.emitting = true
	
func repair() -> void:
	is_broken = false
	repaired.emit()
	
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
	
	if has_node("/root/GameState"):
		get_node("/root/GameState").add_heat(5, "Crash")
	
	if hp <= 0:
		_die()

func _die() -> void:
	vehicle_destroyed.emit()
	if has_node("/root/GameState"):
		get_node("/root/GameState").fail_run("Wrecked")
