class_name RoadManager
extends Node

## RoadManager
## Manages the infinite road loop.

@export var player: Node2D
@export var segment_scenes: Array[PackedScene] = []
@export var initial_segments: int = 3
@export var spawn_threshold: float = 1000.0

var active_segments: Array[RoadSegment] = []
var last_exit_position: Vector2 = Vector2.ZERO
var total_distance: float = 0.0

const SEGMENT_PATH = "res://systems/map/road_segment.tscn"

func _ready() -> void:
	if segment_scenes.is_empty():
		var base_scene: PackedScene = load(SEGMENT_PATH)
		if base_scene:
			segment_scenes.append(base_scene)

	# Locate player if not assigned in editor
	if not player:
		var players: Array[Node] = get_tree().get_nodes_in_group("player")
		if players.size() > 0:
			player = players[0]

	if has_node("/root/GameState"):
		var gs: Node = get_node("/root/GameState")
		gs.run_started.connect(_on_run_started)
		gs.state_changed.connect(_on_state_changed)

func _process(_delta: float) -> void:
	if not player or active_segments.is_empty():
		return
		
	# Only update road during RUN state
	if has_node("/root/GameState") and get_node("/root/GameState").current_state != 1: # 1 = RUN
		return

	# Update Distance
	if has_node("/root/GameState"):
		get_node("/root/GameState").update_distance(player.global_position)
		
	# Check if we need to spawn new segments
	var dist_to_end = player.global_position.distance_to(active_segments.back().get_exit_global_position())
	
	if dist_to_end < 3000.0:
		_spawn_segment()
		
	# Despawn old segments
	var first_seg = active_segments.front()
	# Assuming moving North (-Y)
	if player.global_position.y < first_seg.get_exit_global_position().y - 1000.0:
		_despawn_segment()

func _on_run_started() -> void:
	reset_road()
	spawn_starting_road()
	_teleport_player_to_start()

func _on_state_changed(new_state: int) -> void:
	if new_state == 0: # TOWN
		reset_road()
		_teleport_player_to_town()

func reset_road() -> void:
	for seg in active_segments:
		seg.queue_free()
	active_segments.clear()
	last_exit_position = Vector2(0, -2000) # Start road bit away from town physically, or separate scenes?
	# User wanted Town -> Road transition.
	# Simplest MVP: Teleport to coordinates (0, -10000) for "The Road" and (0,0) for Town.
	last_exit_position = Vector2(10000, 0) # "The Road" origin far away

func spawn_starting_road() -> void:
	# last_exit_position is set in reset_road
	for i in range(initial_segments):
		_spawn_segment()

func _spawn_segment() -> void:
	var scene: PackedScene = segment_scenes.pick_random()
	var seg: RoadSegment = scene.instantiate() as RoadSegment
	add_child(seg)
	seg.global_position = last_exit_position
	last_exit_position = seg.get_exit_global_position()
	active_segments.append(seg)
	
	# Difficulty Logic
	if has_node("/root/GameState"):
		var gs = get_node("/root/GameState")
		var miles = gs.current_run_miles
		var diff = 0.0
		if miles > 1.0: diff = 3.0
		elif miles > 0.6: diff = 2.0
		elif miles > 0.2: diff = 1.0
		
		seg.spawn_obstacles(diff)


func _despawn_segment() -> void:
	var seg = active_segments.pop_front()
	seg.queue_free()

func _teleport_player_to_start() -> void:
	if player:
		player.global_position = Vector2(10000, 0) # Start of road
		player.rotation = -PI / 2.0  # Face north (-Y) to align with road direction
		if has_node("/root/GameState"):
			get_node("/root/GameState").set_run_start_position(player.global_position)
		
func _teleport_player_to_town() -> void:
	# Ideally find TownZone spawn point
	if player:
		player.global_position = Vector2(0, 0) # Town Origin

