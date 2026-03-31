## Test scene for vehicle driving mechanics.
## Walk around with WASD/Arrows, press E near a car to enter, drive with WASD/Arrows, press E to exit.
extends Node2D

@onready var player: CharacterBody2D = $Player
@onready var vehicle: VehicleEntity = $Vehicle
@onready var player_camera: Camera2D = $Player/Camera2D
@onready var instructions_label: Label = $UI/Instructions
@onready var speed_label: Label = $UI/SpeedLabel

var player_in_vehicle: bool = false

func _ready() -> void:
	# Connect vehicle signals
	vehicle.driver_entered.connect(_on_vehicle_entered)
	vehicle.driver_exited.connect(_on_vehicle_exited)

	# Make sure player camera is active at start
	player_camera.enabled = true

	_update_instructions()

func _process(_delta: float) -> void:
	# Update speed display
	if player_in_vehicle:
		var mph = int(vehicle.current_mph)
		speed_label.text = "%d MPH" % mph
	else:
		speed_label.text = ""

	# Check for interact input when player is on foot
	if not player_in_vehicle and Input.is_action_just_pressed("interact"):
		_try_enter_vehicle()

func _try_enter_vehicle() -> void:
	# Check if player is close enough to vehicle
	var distance = player.global_position.distance_to(vehicle.global_position)
	if distance < 150.0:  # Entry distance
		_enter_vehicle()

func _enter_vehicle() -> void:
	player_in_vehicle = true

	# Disable player
	player.visible = false
	player.set_physics_process(false)
	player.get_node("CollisionShape2D").disabled = true
	player_camera.enabled = false

	# Enable vehicle
	vehicle.enter_vehicle(player)

	_update_instructions()

func _on_vehicle_entered(_driver: Node2D) -> void:
	pass  # Already handled in _enter_vehicle

func _on_vehicle_exited(_driver: Node2D) -> void:
	player_in_vehicle = false

	# Re-enable player at exit position
	player.global_position = vehicle.get_exit_position()
	player.visible = true
	player.set_physics_process(true)
	player.get_node("CollisionShape2D").disabled = false
	player_camera.enabled = true

	_update_instructions()

func _update_instructions() -> void:
	if instructions_label:
		if player_in_vehicle:
			instructions_label.text = "WASD/Arrows/Stick = Drive | R2/L2 = Gas/Brake | Space/Square = Handbrake | E/X = Exit"
		else:
			instructions_label.text = "WASD/Arrows/Stick = Walk | E/X = Enter Vehicle (get close to a car)"
