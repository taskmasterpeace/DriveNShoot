## Simple player controller for testing.
## WASD to move, E to interact with vehicles.
extends CharacterBody2D

@export var speed: float = 300.0
@export var acceleration: float = 0.15

func _physics_process(_delta: float) -> void:
	var input_vector = Vector2.ZERO
	input_vector.x = Input.get_action_strength("move_right") - Input.get_action_strength("move_left")
	input_vector.y = Input.get_action_strength("move_down") - Input.get_action_strength("move_up")
	input_vector = input_vector.normalized()

	velocity = velocity.lerp(input_vector * speed, acceleration)
	move_and_slide()
