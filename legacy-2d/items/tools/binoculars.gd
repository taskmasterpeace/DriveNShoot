class_name Binoculars
extends Node

## Binoculars Tool
## Zooms the camera out to see further when used.

@export var zoom_level: float = 0.5 ## Lower value = zoomed out (wider view)
@export var transition_speed: float = 2.0

var is_active: bool = false
var original_zoom: Vector2 = Vector2.ONE
var player_camera: Camera2D = null

func _ready() -> void:
	# Attempt to find player camera if attached to player
	var parent = get_parent()
	if parent.has_node("Camera2D"):
		player_camera = parent.get_node("Camera2D")

func use() -> void:
	if not player_camera:
		return
		
	is_active = !is_active
	
	if is_active:
		original_zoom = player_camera.zoom
		_tween_zoom(Vector2(zoom_level, zoom_level))
	else:
		_tween_zoom(original_zoom)

func _tween_zoom(target_zoom: Vector2) -> void:
	var tween = create_tween()
	tween.tween_property(player_camera, "zoom", target_zoom, 1.0 / transition_speed).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
