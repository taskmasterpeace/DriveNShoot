## Extends PlayerEntity to support entering and exiting vehicles.
## Attach this to the player node to enable vehicle interaction.
class_name PlayerVehicleController
extends Node

@export var player: PlayerEntity ## The player this controller manages
@export var detection_area: Area2D ## Area2D to detect nearby vehicles

var current_vehicle: VehicleEntity = null
var is_in_vehicle: bool = false

signal entered_vehicle(vehicle: VehicleEntity)
signal exited_vehicle(vehicle: VehicleEntity)

func _ready() -> void:
	if detection_area:
		detection_area.body_entered.connect(_on_body_entered)
		detection_area.body_exited.connect(_on_body_exited)

var _nearby_vehicles: Array[VehicleEntity] = []

func _on_body_entered(body: Node2D) -> void:
	if body is VehicleEntity:
		if not _nearby_vehicles.has(body):
			_nearby_vehicles.append(body)

func _on_body_exited(body: Node2D) -> void:
	if body is VehicleEntity:
		_nearby_vehicles.erase(body)

func _process(_delta: float) -> void:
	if is_in_vehicle:
		return

	# Check for interact input to enter vehicle
	if Input.is_action_just_pressed("interact"):
		_try_enter_nearest_vehicle()

func _try_enter_nearest_vehicle() -> void:
	if _nearby_vehicles.is_empty():
		return

	var nearest: VehicleEntity = null
	var nearest_dist: float = INF

	for vehicle in _nearby_vehicles:
		if vehicle.can_enter(player):
			var dist = player.global_position.distance_to(vehicle.global_position)
			if dist < nearest_dist:
				nearest_dist = dist
				nearest = vehicle

	if nearest:
		enter_vehicle(nearest)

func enter_vehicle(vehicle: VehicleEntity) -> void:
	if is_in_vehicle or not vehicle:
		return

	current_vehicle = vehicle
	is_in_vehicle = true

	# Disable player
	player.visible = false
	player.set_physics_process(false)
	player.set_process(false)
	if player.has_node("CollisionShape2D"):
		player.get_node("CollisionShape2D").disabled = true

	# Connect to vehicle exit signal
	vehicle.driver_exited.connect(_on_driver_exited, CONNECT_ONE_SHOT)

	# Enter the vehicle
	vehicle.enter_vehicle(player)

	entered_vehicle.emit(vehicle)

func _on_driver_exited(driver: Node2D) -> void:
	if driver != player:
		return

	exit_vehicle()

func exit_vehicle() -> void:
	if not is_in_vehicle or not current_vehicle:
		return

	var vehicle = current_vehicle
	is_in_vehicle = false

	# Get exit position from vehicle
	var exit_pos = vehicle.get_exit_position()

	# Re-enable player
	player.global_position = exit_pos
	player.visible = true
	player.set_physics_process(true)
	player.set_process(true)
	if player.has_node("CollisionShape2D"):
		player.get_node("CollisionShape2D").disabled = false

	current_vehicle = null

	exited_vehicle.emit(vehicle)

func force_exit() -> void:
	if current_vehicle:
		current_vehicle.exit_vehicle()
