extends CanvasLayer

func _ready() -> void:
	visible = false

func _input(event: InputEvent) -> void:
	if event.is_action_pressed("toggle_help"):
		visible = not visible
		get_tree().paused = visible
