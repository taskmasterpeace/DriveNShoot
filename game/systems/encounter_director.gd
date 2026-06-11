class_name EncounterDirector
extends Node

const PURSUER_SCENE = preload("res://entities/vehicles/pursuer_vehicle.tscn")

# Enemy sprite pool — randomly assigned to pursuers on spawn
var enemy_textures: Array[Texture2D] = [
	preload("res://entities/vehicles/sprites/enemy_gang_muscle.png"),
	preload("res://entities/vehicles/sprites/enemy_wasteland_pickup.png"),
	preload("res://entities/vehicles/sprites/enemy_military_humvee.png"),
	preload("res://entities/vehicles/sprites/enemy_bandit_sedan.png"),
	preload("res://entities/vehicles/sprites/enemy_road_captain.png"),
	preload("res://entities/vehicles/sprites/enemy_nomad_bike.png"),
]

# Pickup sprite pool — randomly assigned to loot caches
var pickup_textures: Array[Texture2D] = [
	preload("res://entities/world/sprites/pickup_health.png"),
	preload("res://entities/world/sprites/pickup_ammo.png"),
	preload("res://entities/world/sprites/pickup_scrap.png"),
	preload("res://entities/world/sprites/pickup_fuel.png"),
	preload("res://entities/world/sprites/pickup_repair.png"),
	preload("res://entities/world/sprites/pickup_armor.png"),
]

var pursuer_spawned_this_run: bool = false
var pursuer_pending: bool = false ## True once heat is high enough to queue a pursuer, waiting on the speed check.
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
	
	var gs = get_node_or_null("/root/GameState")
	if not gs: return
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

	# Randomly assign pickup sprite
	if pickup_textures.size() > 0:
		var tex: Texture2D = pickup_textures.pick_random()
		var sprite: Sprite2D = loot.get_node_or_null("Sprite2D")
		if sprite:
			sprite.texture = tex
			sprite.modulate = Color.WHITE  # Override brown tint from .tscn

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

	# Behavior variety (set before the node enters the tree so _ready mounts a gun for SHOOTERs).
	var roll: float = randf()
	var is_swarm: bool = false
	if roll < 0.35:
		pursuer.behavior_type = PursuerAI.BehaviorType.RAMMER
	elif roll < 0.6:
		pursuer.behavior_type = PursuerAI.BehaviorType.SHOOTER
	elif roll < 0.8:
		pursuer.behavior_type = PursuerAI.BehaviorType.BLOCKER
	else:
		pursuer.behavior_type = PursuerAI.BehaviorType.SWARM
		is_swarm = true

	_assign_enemy_sprite(pursuer)

	# Add to world
	player.get_parent().add_child(pursuer)

	# A swarm pick brings a pack of flanking bikes.
	if is_swarm:
		_spawn_swarm_escorts(player, spawn_pos)

	# Telegraph
	var warning_text: String = "SWARM INBOUND!" if is_swarm else "PURSUER DETECTED!"
	if player.has_method("show_warning"):
		player.show_warning(warning_text)
	elif player.has_method("notify_action"):
		player.notify_action(warning_text, 1.0)

## Randomly assigns one of the enemy sprite variants to a pursuer's Sprite2D.
func _assign_enemy_sprite(pursuer: Node) -> void:
	if enemy_textures.size() > 0:
		var tex: Texture2D = enemy_textures.pick_random()
		var sprite: Sprite2D = pursuer.get_node_or_null("Sprite2D")
		if sprite:
			sprite.texture = tex

## Spawns two extra SWARM bikes flanking the lead bike.
func _spawn_swarm_escorts(player: Node2D, lead_pos: Vector2) -> void:
	for offset in [-260.0, 260.0]:
		var bike = PURSUER_SCENE.instantiate()
		bike.behavior_type = PursuerAI.BehaviorType.SWARM
		bike.global_position = lead_pos + Vector2(offset, randf_range(-120.0, 120.0))
		_assign_enemy_sprite(bike)
		player.get_parent().add_child(bike)

