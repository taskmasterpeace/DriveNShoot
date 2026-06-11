class_name Minimap
extends Control

## Minimap — a code-drawn radar pinned to the top-right. The player sits at the centre;
## hostiles (group "enemy") and loot (group "loot") are plotted around them, clamped to the
## rim when out of range. Fully self-contained: add it to any CanvasLayer and set `player`.

@export var view_range: float = 2600.0 ## World units shown across the full radar diameter.
@export var map_size: float = 180.0

var player: Node2D

func _ready() -> void:
	# Pin to the top-right corner at any resolution.
	anchor_left = 1.0
	anchor_right = 1.0
	anchor_top = 0.0
	anchor_bottom = 0.0
	offset_left = -(map_size + 20.0)
	offset_top = 20.0
	offset_right = -20.0
	offset_bottom = map_size + 20.0
	mouse_filter = Control.MOUSE_FILTER_IGNORE

func _process(_delta: float) -> void:
	queue_redraw()

func _draw() -> void:
	var center: Vector2 = size * 0.5
	var r: float = map_size * 0.5
	draw_circle(center, r, Color(0.05, 0.06, 0.05, 0.65))
	draw_arc(center, r, 0.0, TAU, 48, Color(0.45, 0.5, 0.45, 0.85), 2.0)

	if not is_instance_valid(player):
		player = get_tree().get_first_node_in_group("player")
		if not is_instance_valid(player):
			return

	var origin: Vector2 = player.global_position
	draw_circle(center, 4.0, Color.WHITE) # player at centre

	for e in get_tree().get_nodes_in_group("enemy"):
		_plot(e, origin, center, r, Color(0.9, 0.2, 0.2))
	for l in get_tree().get_nodes_in_group("loot"):
		_plot(l, origin, center, r, Color(0.95, 0.85, 0.2))

func _plot(node: Object, origin: Vector2, center: Vector2, r: float, color: Color) -> void:
	if not node is Node2D:
		return
	var rel: Vector2 = (node.global_position - origin) / view_range * (r * 2.0)
	if rel.length() > r:
		rel = rel.normalized() * r
		color = color.darkened(0.2)
	draw_circle(center + rel, 3.0, color)
