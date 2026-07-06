class_name SecurityCamera
extends Node2D

## SecurityCamera
## Detects motion (Player/Enemy) in its cone of vision.

signal motion_detected(body: Node2D)

@export var rotation_speed: float = 0.5
@export var sweep_angle: float = 45.0
@onready var detection_area = $DetectionArea
@onready var cone_sprite = $ConeSprite

var current_angle: float = 0.0
var direction: float = 1.0
var base_rotation: float = 0.0

func _ready() -> void:
	base_rotation = rotation
	if detection_area:
		detection_area.body_entered.connect(_on_body_entered)

func _process(delta: float) -> void:
	# Rotate camera back and forth
	current_angle += rotation_speed * delta * direction
	
	if abs(current_angle) > deg_to_rad(sweep_angle):
		direction *= -1.0
	
	rotation = base_rotation + current_angle

func _on_body_entered(body: Node2D) -> void:
	if body.is_in_group("player") or body.is_in_group("enemy"):
		print("Security Camera: Motion Detected! Object: ", body.name)
		motion_detected.emit(body)
		# Flash red
		if cone_sprite:
			var tween = create_tween()
			tween.tween_property(cone_sprite, "modulate", Color.RED, 0.2)
			tween.tween_property(cone_sprite, "modulate", Color(1, 1, 1, 0.3), 0.2)
