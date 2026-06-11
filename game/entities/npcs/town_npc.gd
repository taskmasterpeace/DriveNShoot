class_name TownNPC
extends StaticBody2D

## A simple interactable town NPC. Press E nearby to hear a cycling flavor line. Code-generated
## (the town zone sets sprite/name/lines). A future step can swap this for branching DialogueManager
## conversations; this gives towns living, talkable characters now.

@export var npc_name: String = "Stranger"
var lines: Array = ["..."]
var _line_idx: int = 0

func _ready() -> void:
	add_to_group("interactable")
	# Interaction-detection area so the player's InteractionController picks us up (like the garage).
	var area: Area2D = Area2D.new()
	area.collision_layer = 1
	area.collision_mask = 2 # detect the player (character layer)
	var col: CollisionShape2D = CollisionShape2D.new()
	var shape: CircleShape2D = CircleShape2D.new()
	shape.radius = 90.0
	col.shape = shape
	area.add_child(col)
	add_child(area)

func get_interaction_text() -> String:
	return "Talk to %s" % npc_name

func can_interact() -> bool:
	return true

# Presence of interact() is how the InteractionController detects a talkable; interact_with does the work.
func interact() -> void:
	pass

func interact_with(player: Node) -> void:
	if lines.is_empty():
		return
	var line: String = lines[_line_idx % lines.size()]
	_line_idx += 1
	var text: String = "%s: %s" % [npc_name, line]
	if player and player.has_method("notify_action"):
		player.notify_action(text, 1.0)
	elif player and player.has_method("show_warning"):
		player.show_warning(text)
	print(text)
