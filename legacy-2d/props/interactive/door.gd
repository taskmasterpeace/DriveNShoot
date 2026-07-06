class_name InteractiveDoor
extends StaticBody2D

## Interactive Door
## Opens/Closes on player interaction.

@onready var sprite = $Sprite2D
@onready var collider = $CollisionShape2D
@onready var interaction_area = $InteractionArea

var is_open: bool = false

func _ready() -> void:
	# Assume frame 0 is closed, frame 1 is open
	if sprite:
		sprite.frame = 0

func interact_with(_player: Node2D) -> void:
	interact()

func interact() -> void:
	is_open = !is_open
	if is_open:
		open()
	else:
		close()

func open() -> void:
	if sprite:
		sprite.frame = 1
	if collider:
		collider.set_deferred("disabled", true) # Allow passage

func close() -> void:
	if sprite:
		sprite.frame = 0
	if collider:
		collider.set_deferred("disabled", false) # Block passage

func _on_interaction_area_body_entered(body: Node2D) -> void:
	if body.is_in_group("player"):
		# In a real system, we'd register this interactive object to the player
		pass
