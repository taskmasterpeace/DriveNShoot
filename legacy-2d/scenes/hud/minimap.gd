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

	# Centre on whatever the player is actually controlling — the driven vehicle, or the
	# on-foot player — so the radar stays useful while driving (the player node is static then).
	var focus: Node2D = _focus_node()
	if not is_instance_valid(focus):
		return

	var origin: Vector2 = focus.global_position
	draw_circle(center, 4.0, Color.WHITE) # you, at centre

	for e in get_tree().get_nodes_in_group("enemy"):
		_plot(e, origin, center, r, Color(0.9, 0.2, 0.2))
	for l in get_tree().get_nodes_in_group("loot"):
		_plot(l, origin, center, r, Color(0.95, 0.85, 0.2))

## The node the radar centres on: the active vehicle if driving, else the on-foot player.
func _focus_node() -> Node2D:
	for v in get_tree().get_nodes_in_group("vehicle"):
		if v is VehicleEntity and v.is_active:
			return v
	if is_instance_valid(player):
		return player
	return get_tree().get_first_node_in_group("player")

func _plot(node: Object, origin: Vector2, center: Vector2, r: float, color: Color) -> void:
	if not node is Node2D:
		return
	var rel: Vector2 = (node.global_position - origin) / view_range * (r * 2.0)
	if rel.length() > r:
		rel = rel.normalized() * r
		color = color.darkened(0.2)
	draw_circle(center + rel, 3.0, color)
