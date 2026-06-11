class_name RoadSegment
extends Node2D

## Road Segment
## A single chunk of the road loop.

@export var length: float = 2048.0
@export var exit_point: Marker2D

const WRECK_SCENE = preload("res://systems/map/obstacles/wreck.tscn")
const FOOT_ZONE_SCRIPT = preload("res://systems/map/foot_zone.gd")
const ROAD_WIDTH = 800.0 # Approx width
const LANE_WIDTH = 200.0

@export var world_width: float = 4200.0 ## Total width of the wasteland on either side of the road.
@export var terrain_color: Color = Color(0.21, 0.18, 0.13) ## Wasteland dirt backdrop.
@export var ambient_rocks: int = 10 ## Decorative rocks scattered in the side bands.

func _ready() -> void:
	if not exit_point:
		# Default exit point if not set in scene
		exit_point = Marker2D.new()
		exit_point.position = Vector2(0, -length)
		exit_point.name = "AutoExitPoint"
		add_child(exit_point)
	_generate_terrain_backdrop()

func get_exit_global_position() -> Vector2:
	if exit_point:
		return exit_point.global_position
	return global_position + Vector2(0, -length)

## Lays down the wide wasteland backdrop and scatters decorative rocks in the side bands,
## so the world reads as open terrain rather than a bare road.
func _generate_terrain_backdrop() -> void:
	var ground: Polygon2D = Polygon2D.new()
	var hw: float = world_width * 0.5
	ground.polygon = PackedVector2Array([
		Vector2(-hw, 0.0), Vector2(hw, 0.0), Vector2(hw, -length), Vector2(-hw, -length)
	])
	ground.color = terrain_color
	ground.z_index = -20
	add_child(ground)

	for i in ambient_rocks:
		var side: float = -1.0 if randf() < 0.5 else 1.0
		var x: float = side * randf_range(ROAD_WIDTH * 0.6, hw - 120.0)
		var y: float = -randf() * length
		_spawn_rock(Vector2(x, y))

func _spawn_rock(pos: Vector2) -> void:
	var rock: Polygon2D = Polygon2D.new()
	var s: float = randf_range(28.0, 78.0)
	rock.polygon = PackedVector2Array([
		Vector2(-s, -s * 0.7), Vector2(s * 0.6, -s), Vector2(s, s * 0.5), Vector2(0.0, s), Vector2(-s, s * 0.4)
	])
	rock.color = Color(0.3, 0.27, 0.23)
	rock.position = pos
	rock.z_index = -10
	add_child(rock)

## Occasionally drops a foot-only ruin off to the side of the road. Vehicles can't enter, so
## the player must stop and explore on foot for the richer loot inside.
func maybe_spawn_foot_zone(chance: float) -> void:
	if randf() > chance:
		return
	var fz: FootZone = FOOT_ZONE_SCRIPT.new()
	var side: float = -1.0 if randf() < 0.5 else 1.0
	fz.position = Vector2(side * randf_range(950.0, 1500.0), -length * randf_range(0.3, 0.7))
	add_child(fz)

func spawn_obstacles(difficulty: float) -> void:
	# difficulty: 0 = Safe, 1 = Light, 2 = Medium, 3 = Heavy
	
	if difficulty < 1.0: return # Safe zone
	
	var count = 0
	var chance = 0.0
	
	if difficulty <= 1.0: # Light
		count = 1
		chance = 0.3
	elif difficulty <= 2.0: # Medium
		count = 2 # Max
		chance = 0.6
	else: # Heavy
		count = 3
		chance = 0.85
		
	if randf() > chance: return
	
	# Constraints
	var safe_buffer_y = 500.0
	var spawn_zone_len = length - safe_buffer_y - 200.0 # Leave room at end too
	
	if difficulty > 2.5 and randf() < 0.3:
		_spawn_pattern_blockade(spawn_zone_len, safe_buffer_y)
	elif difficulty > 1.5 and randf() < 0.4:
		_spawn_pattern_chicane(spawn_zone_len, safe_buffer_y)
	else:
		_spawn_random_scatter(count, spawn_zone_len, safe_buffer_y)

func _spawn_pattern_blockade(zone_len: float, safe_y: float) -> void:
	# 2 Wrecks blocking 2 lanes at same Y
	var y_pos = -safe_y - randf() * zone_len
	var open_lane = randi() % 3 - 1 # -1, 0, 1
	var lanes = [-1, 0, 1]
	lanes.erase(open_lane)
	
	for lane_idx in lanes:
		var wreck = WRECK_SCENE.instantiate()
		add_child(wreck)
		wreck.position = Vector2(lane_idx * LANE_WIDTH, y_pos)

func _spawn_pattern_chicane(zone_len: float, safe_y: float) -> void:
	# 3 Wrecks, staggered Y, shifting lanes
	var start_y = -safe_y - randf() * (zone_len * 0.5)
	var lanes = [-1, 0, 1]
	lanes.shuffle() # Logic could be better (Left->Center->Right) but random is okay for now
	
	for i in range(3):
		var wreck = WRECK_SCENE.instantiate()
		add_child(wreck)
		wreck.position = Vector2(lanes[i] * LANE_WIDTH, start_y - (i * 400.0))

func _spawn_random_scatter(count: int, zone_len: float, safe_y: float) -> void:
	for i in range(count):
		var y_pos = -safe_y - randf() * zone_len
		var lane_x = (randi() % 3 - 1) * LANE_WIDTH
		
		var wreck = WRECK_SCENE.instantiate()
		add_child(wreck)
		wreck.position = Vector2(lane_x, y_pos)
		wreck.rotation = randf() * PI * 0.1
