## Simple player controller for testing.
## WASD to move, E to interact with vehicles.
extends CharacterBody2D

@export var speed: float = 300.0
@export var acceleration: float = 0.15

var current_vehicle: Node2D = null
var nearby_vehicle: Node2D = null

func _ready() -> void:
	# Defer connection to ensure scene is fully loaded
	call_deferred("_connect_to_vehicles")

func _connect_to_vehicles() -> void:
	# Find ALL vehicles in the scene and connect to their interaction areas
	var vehicles: Array[Node] = get_tree().get_nodes_in_group("vehicle")
	for vehicle: Node in vehicles:
		if vehicle.has_node("InteractionArea"):
			var area: Area2D = vehicle.get_node("InteractionArea")
			area.body_entered.connect(_on_vehicle_nearby.bind(vehicle))
			area.body_exited.connect(_on_vehicle_far.bind(vehicle))

func _physics_process(_delta: float) -> void:
	# If in vehicle, don't process player movement
	if current_vehicle:
		return

	var input_vector := Vector2.ZERO
	input_vector.x = Input.get_action_strength("move_right") - Input.get_action_strength("move_left")
	input_vector.y = Input.get_action_strength("move_down") - Input.get_action_strength("move_up")
	input_vector = input_vector.normalized()

	velocity = velocity.lerp(input_vector * speed, acceleration)
	move_and_slide()

func _input(event: InputEvent) -> void:
	# Enter vehicle with E
	if event.is_action_pressed("interact") and nearby_vehicle and not current_vehicle:
		enter_vehicle(nearby_vehicle)
	# Exit vehicle with E
	elif event.is_action_pressed("interact") and current_vehicle:
		exit_vehicle()

func enter_vehicle(vehicle: Node2D) -> void:
	if vehicle.has_method("enter_vehicle"):
		vehicle.enter_vehicle(self, global_position)
		current_vehicle = vehicle
		visible = false
		# Disable player camera so vehicle camera takes over
		if has_node("Camera2D"):
			$Camera2D.enabled = false
		if get_node_or_null("CollisionShape2D"):
			$CollisionShape2D.disabled = true

func exit_vehicle() -> void:
	if current_vehicle and current_vehicle.has_method("exit_vehicle"):
		var exit_pos: Vector2 = current_vehicle.get_exit_position() if current_vehicle.has_method("get_exit_position") else current_vehicle.global_position
		current_vehicle.exit_vehicle()
		global_position = exit_pos
		current_vehicle = null
		visible = true
		# Re-enable player camera
		if has_node("Camera2D"):
			$Camera2D.enabled = true
		if get_node_or_null("CollisionShape2D"):
			$CollisionShape2D.disabled = false

func _on_vehicle_nearby(body: Node2D, vehicle: Node2D) -> void:
	if body == self:
		nearby_vehicle = vehicle

func _on_vehicle_far(body: Node2D, vehicle: Node2D) -> void:
	if body == self and nearby_vehicle == vehicle:
		nearby_vehicle = null
