class_name FloatingText
extends Label

## Floating Text
## Moves up and fades out.

@export var speed: float = 50.0
@export var fade_duration: float = 1.0

func setup(text_value: String, color: Color) -> void:
	text = text_value
	modulate = color
	
	var tween = create_tween()
	tween.tween_property(self, "position", position + Vector2.UP * 50, fade_duration)
	tween.parallel().tween_property(self, "modulate:a", 0.0, fade_duration)
	tween.tween_callback(queue_free)
