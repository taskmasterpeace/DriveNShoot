class_name EncounterDirector
extends Node

const PURSUER_SCENE = preload("res://entities/vehicles/pursuer_vehicle.tscn")

var pursuer_spawned_this_run: bool = false
var player_speed_ok_timer: float = 0.0
var run_started_mile: float = 0.0

func _ready() -> void:
	if has_node("/root/GameState"):
		get_node("/root/GameState").distance_updated.connect(_on_distance_updated)
	# Also need to listen for run reset?
	# GameState doesn't emit "run_started" logic explicitly but has start_run.
	# But we can check if GameState.current_run_miles < 0.1 to reset.

func _process(delta: float) -> void:
	var gs = get_node("/root/GameState")
	if not gs or gs.current_state != 1: # Not RUN
		player_speed_ok_timer = 0.0
		return
		
	# Check Player Speed
	var players = get_tree().get_nodes_in_group("player")
	if players.size() > 0:
		var p = players[0]
		# Assuming p is PlayerEntity which extends CharacterEntity -> velocity
		if p.velocity.length() > 120.0: # 120 threshold
			player_speed_ok_timer += delta
		else:
			player_speed_ok_timer = 0.0
			
	# Process Pending Spawn
	if pursuer_pending and not pursuer_spawned_this_run:
		if player_speed_ok_timer > 2.0:
			spawn_pursuer()
	
var last_loot_mile: float = 0.0
const LOOT_SCENE = preload("res://entities/world/loot_cache.tscn")

func _on_distance_updated(miles: float) -> void:
	if miles < 0.1:
		pursuer_spawned_this_run = false
		pursuer_pending = false # Reset pending status
		run_started_mile = 0.0
		last_loot_mile = 0.0 # Reset
		return
		
	# Loot Spawning
	if miles - last_loot_mile >= 0.8:
		_spawn_loot(miles)
		
	# Pursuer Logic
	if pursuer_spawned_this_run: return
	
	var gs = get_node("/root/GameState")
	var heat = gs.current_heat
	
	# Guaranteed Spawn (Heat >= 40)
	# Queue it, wait for speed check
	if heat >= 40:
		pursuer_pending = true
		
	# Eligible Spawn (Heat >= 25 AND Miles >= 0.6)
	if heat >= 25 and miles >= 0.6:
		_try_spawn_pursuer(miles)

func _spawn_loot(miles: float) -> void:
	last_loot_mile = miles + randf_range(0.0, 0.4) # Next spawn in 0.8 to 1.2 mi
	
	print("Spawning Loot Cache...")
	var players = get_tree().get_nodes_in_group("player")
	if players.is_empty(): return
	var player = players[0]
	
	var spawn_pos = player.global_position + Vector2(0, -1500) # Ahead (Up is -Y)
	
	# Lane Snap (Center +/- 220)
	var lateral_offset = randf_range(-220, 220)
	spawn_pos.x = 10000.0 + lateral_offset # Road Center is 10000
	
	var loot = LOOT_SCENE.instantiate()
	loot.global_position = spawn_pos
	player.get_parent().add_child(loot)


func _try_spawn_pursuer(miles: float) -> void:
	# Constraints
	if player_speed_ok_timer < 2.0: return
	
	# Chance based on Heat? or just basic eligibility check
	# User: "Pursuer becomes eligible immediately"
	spawn_pursuer()


func spawn_pursuer() -> void:
	pursuer_spawned_this_run = true
	print("WARNING: PURSUER INBOUND!")
	
	var players = get_tree().get_nodes_in_group("player")
	if players.is_empty(): return
	var player = players[0]
	
	var spawn_pos = player.global_position + Vector2(0, 1500) # Behind (Down is +Y?)
	# Assuming Forward is -Y (Up). Behind is +Y.
	# Check player facing? 
	# Lane offset?
	spawn_pos.x += randf_range(-150, 150)
	
	var pursuer = PURSUER_SCENE.instantiate()
	pursuer.global_position = spawn_pos
	# Add to world
	player.get_parent().add_child(pursuer)
	
	# Telegraph
	if player.has_method("show_warning"):
		player.show_warning("PURSUER DETECTED!")
	elif player.has_method("notify_action"):
		player.notify_action("PURSUER DETECTED!", 1.0)

