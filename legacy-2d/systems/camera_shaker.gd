extends Node

## CameraShaker
## Helper to shake the camera.

var shake_strength: float = 0.0
var shake_fade: float = 5.0

func apply_shake(strength: float) -> void:
	shake_strength = strength

func _process(delta: float) -> void:
	if shake_strength > 0:
		shake_strength = lerp(shake_strength, 0.0, shake_fade * delta)
		
		var camera = get_viewport().get_camera_2d()
		if camera:
			var offset = Vector2(
				randf_range(-shake_strength, shake_strength),
				randf_range(-shake_strength, shake_strength)
			)
			camera.offset = offset
