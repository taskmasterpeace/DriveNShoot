class_name FootZone
extends Node2D

## FootZone — a foot-only ruin.
## A ring of rough-terrain barriers blocks VEHICLES (which mask the rough_terrain layer) but
## lets CHARACTERS walk straight through (they don't mask it). The interior holds a high-value
## loot cache, so the player must leave the vehicle and go in on foot. Fully code-generated —
## no .tscn needed.

const LOOT_SCENE: PackedScene = preload("res://entities/world/loot_cache.tscn")
const ROUGH_TERRAIN_BIT: int = 1 << 7 ## Collision layer 8 ("rough_terrain").

@export var radius: float = 340.0
@export var barrier_count: int = 28 ## Blocks forming the perimeter ring.
@export var barrier_size: float = 80.0
@export var ground_color: Color = Color(0.17, 0.15, 0.13, 0.92)
@export var rubble_color: Color = Color(0.32, 0.28, 0.24)

func _ready() -> void:
	_build_ground()
	_build_perimeter()
	_spawn_interior_loot()

func _build_ground() -> void:
	var ground: Polygon2D = Polygon2D.new()
	var pts: PackedVector2Array = PackedVector2Array()
	var segments: int = 32
	for j in segments:
		var a: float = TAU * float(j) / float(segments)
		pts.append(Vector2(cos(a), sin(a)) * (radius - barrier_size * 0.5))
	ground.polygon = pts
	ground.color = ground_color
	ground.z_index = -5
	add_child(ground)

func _build_perimeter() -> void:
	for i in barrier_count:
		var angle: float = TAU * float(i) / float(barrier_count)
		var body: StaticBody2D = StaticBody2D.new()
		body.collision_layer = ROUGH_TERRAIN_BIT # only on rough_terrain
		body.collision_mask = 0 # static — detects nothing itself
		body.position = Vector2(cos(angle), sin(angle)) * radius

		var shape: CollisionShape2D = CollisionShape2D.new()
		var rect: RectangleShape2D = RectangleShape2D.new()
		rect.size = Vector2(barrier_size, barrier_size)
		shape.shape = rect
		body.add_child(shape)

		var vis: Polygon2D = Polygon2D.new()
		var h: float = barrier_size * 0.5
		vis.polygon = PackedVector2Array([Vector2(-h, -h), Vector2(h, -h), Vector2(h, h), Vector2(-h, h)])
		vis.color = rubble_color
		body.add_child(vis)

		add_child(body)

func _spawn_interior_loot() -> void:
	var loot: Node = LOOT_SCENE.instantiate()
	add_child(loot)
	loot.position = Vector2.ZERO # center of the ruin
	# Reward going in on foot with richer loot, if the cache supports a multiplier.
	if "loot_multiplier" in loot:
		loot.loot_multiplier = 2.0
