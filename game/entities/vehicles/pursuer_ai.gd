class_name PursuerAI
extends VehicleEntity

enum State { SEEK, RAM, BLOCK, RESET_DISTANCE }
enum BehaviorType { RAMMER, BLOCKER, SHOOTER, SWARM, TRANSPORT }

const SHOOTER_WEAPON: DataWeapon = preload("res://items/weapons/machine_gun.tres")
const LOOT_SCENE: PackedScene = preload("res://entities/world/loot_cache.tscn")

@export var behavior_type: BehaviorType = BehaviorType.RAMMER
@export var preferred_range: float = 360.0 ## SHOOTER: distance it tries to hold from the player.
@export var fire_cone_degrees: float = 22.0 ## SHOOTER: fires only when roughly facing the player.

var current_state: State = State.SEEK

var player_target: Node2D
var follow_distance: float = 260.0
var ram_range: float = 250.0 # Distance to trigger RAM
var block_distance: float = 400.0 # Distance AHEAD to block
var road_center_x: float = 10000.0 # Updated road center approx
var lane_width: float = 260.0

var state_timer: float = 0.0
var ram_duration: float = 0.6
var stickiness_timer: float = 0.0

# Stats overrides
var base_accel: float = 800.0

func _ready() -> void:
	team = 1 # Hostile — set before super._ready() so any data-mounted weapons inherit it.
	super._ready()
	# SHOOTERs carry a forward-mounted gun and fire while keeping their distance.
	if behavior_type == BehaviorType.SHOOTER and mounted_weapons.is_empty() and SHOOTER_WEAPON:
		mount_weapon(SHOOTER_WEAPON, 0, 1)
	# SWARM: cheap, fast, fragile bikes that mob the player (uses RAMMER chase logic).
	if behavior_type == BehaviorType.SWARM:
		max_hp = 40.0
		hp = 40.0
		base_accel = 1150.0
		follow_distance = 130.0
		ram_range = 220.0
		scale = Vector2(0.7, 0.7)
	# TRANSPORT: armored hauler that cruises the road (doesn't chase) with a big loot payload.
	if behavior_type == BehaviorType.TRANSPORT:
		max_hp = 320.0
		hp = 320.0
		base_accel = 520.0
		scale = Vector2(1.3, 1.3)
	# Disable Smoke (Pursuer doesn't break down same way)
	if smoke_node:
		smoke_node.queue_free()
		smoke_node = null
		
	is_active = true # AI is always active
	engine_power = base_accel
	
	# Find player
	var players = get_tree().get_nodes_in_group("player")
	if players.size() > 0:
		player_target = players[0]
		
	collision_layer = 1 # Car Layer
	collision_mask = 1 + 2 + (1 << 7) # Car + World + rough_terrain (blocked from foot-only ruins)

func _physics_process(delta: float) -> void:
	if not player_target:
		# Try find player repeatedly or despawn?
		var players = get_tree().get_nodes_in_group("player")
		if players.size() > 0:
			player_target = players[0]
		else:
			return
			
	_update_state(delta)
	
	super._physics_process(delta) # Handles physics movement using inputs set below

func _update_state(delta: float) -> void:
	if behavior_type == BehaviorType.TRANSPORT:
		_transport_behavior()
		return
	# Calculate relative info
	var dist_vector = player_target.global_position - global_position
	var dist = dist_vector.length()
	var forward_dot = transform.x.dot(dist_vector.normalized())
	
	# Anti-Sticky
	if dist < 140.0:
		stickiness_timer += delta
	else:
		stickiness_timer = max(0.0, stickiness_timer - delta)
		
	if stickiness_timer > 2.5:
		current_state = State.RESET_DISTANCE
		stickiness_timer = 0.0

	# State Machine
	match current_state:
		State.SEEK:
			if behavior_type == BehaviorType.BLOCKER:
				_seek_block_position(dist_vector)
				# If we are ahead of player and in lane, switch to BLOCK
				if forward_dot < -0.5 and dist < 600.0: # Behind us
					current_state = State.BLOCK
			elif behavior_type == BehaviorType.SHOOTER:
				_shooter_behavior(dist, forward_dot)
			else:
				_seek_behavior(dist_vector)
				if dist < ram_range and forward_dot > 0.5: # Facing player and close
					current_state = State.RAM
					state_timer = 0.0
		
		State.BLOCK:
			_block_behavior(dist_vector)
			# If player gets ahead, switch to SEEK
			if forward_dot > 0.0:
				current_state = State.SEEK
				
		State.RAM:
			_ram_behavior(dist_vector)
			state_timer += delta
			if state_timer > ram_duration:
				current_state = State.SEEK
				
		State.RESET_DISTANCE:
			_reset_behavior()
			state_timer += delta
			if state_timer > 0.8: # Short backoff
				current_state = State.SEEK

func _transport_behavior() -> void:
	# Cruise straight ahead along its heading; the hauler doesn't chase, its escorts do.
	input_throttle = 0.5
	input_braking = 0.0
	input_steering = 0.0

func _shooter_behavior(dist: float, forward_dot: float) -> void:
	# Hold preferred range: close in if far, back off if too close, coast if in the pocket.
	if dist > preferred_range * 1.2:
		input_throttle = 1.0
		input_braking = 0.0
	elif dist < preferred_range * 0.7:
		input_throttle = 0.0
		input_braking = 1.0
	else:
		input_throttle = 0.4
		input_braking = 0.0

	# Steer to face the player so the forward-mounted gun lines up.
	var steer_angle: float = get_angle_to(player_target.global_position)
	steer_angle = clamp(steer_angle, deg_to_rad(-steering_angle), deg_to_rad(steering_angle))
	input_steering = steer_angle / deg_to_rad(steering_angle)

	# Fire when roughly facing the player and within engagement range.
	if forward_dot > cos(deg_to_rad(fire_cone_degrees)) and dist < preferred_range * 1.6:
		fire_weapons()

func _seek_behavior(dist_vector: Vector2) -> void:
	# Throttle: Full unless we are ahead of player?
	# Simple Seek: Drive towards player forward projected position?
	# Actually, we want to be behind player.
	# But MVP is "Seek Player".
	
	input_throttle = 1.0
	input_braking = 0.0
	
	# Steering
	# Steer towards player X, but stay on road
	var target_x = clamp(player_target.global_position.x, road_center_x - lane_width, road_center_x + lane_width)
	var steering_target = Vector2(target_x, player_target.global_position.y) 
	
	var steer_angle = get_angle_to(steering_target)
	# Clamp angle
	steer_angle = clamp(steer_angle, deg_to_rad(-steering_angle), deg_to_rad(steering_angle))
	input_steering = steer_angle / deg_to_rad(steering_angle)

func _ram_behavior(dist_vector: Vector2) -> void:
	# Burst Accel
	input_throttle = 1.0
	input_braking = 0.0
	
	# Steer directly at player
	var steer_angle = get_angle_to(player_target.global_position)
	steer_angle = clamp(steer_angle, deg_to_rad(-steering_angle), deg_to_rad(steering_angle))
	input_steering = steer_angle / deg_to_rad(steering_angle)

func _seek_block_position(dist_vector: Vector2) -> void:
	# Drive to position ahead of player
	input_throttle = 1.0
	input_braking = 0.0
	
	var target_pos = player_target.global_position + Vector2(0, -block_distance)
	# Clamp X to road
	target_pos.x = clamp(target_pos.x, road_center_x - lane_width, road_center_x + lane_width)
	
	var steer_angle = get_angle_to(target_pos)
	steer_angle = clamp(steer_angle, deg_to_rad(-steering_angle), deg_to_rad(steering_angle))
	input_steering = steer_angle / deg_to_rad(steering_angle)

func _block_behavior(dist_vector: Vector2) -> void:
	# We are ahead, try to stay ahead and match lane
	var target_x = player_target.global_position.x
	
	# Brake checking?
	var dist = dist_vector.length()
	if dist < 200.0:
		# Player is close behind -> Brake check!
		input_throttle = 0.0
		input_braking = 1.0
	else:
		# Maintain speed (slightly slower than player to force interaction?)
		input_throttle = 0.6
		input_braking = 0.0
		
	# Match X
	var steering_target = Vector2(target_x, global_position.y - 100.0)
	var steer_angle = get_angle_to(steering_target)
	steer_angle = clamp(steer_angle, deg_to_rad(-steering_angle), deg_to_rad(steering_angle))
	input_steering = steer_angle / deg_to_rad(steering_angle)

func _reset_behavior() -> void:
	# Back off
	input_throttle = 0.0
	input_braking = 0.5 # Slow down
	# Steer away slightly?
	input_steering = 0.2 if randf() > 0.5 else -0.2

# Override get_input to do nothing (AI controls inputs directly above)
func get_input() -> void:
	pass

# Pursuer Special Death
func _die() -> void:
	if behavior_type == BehaviorType.TRANSPORT:
		_drop_convoy_loot()
	elif has_node("/root/GameState"):
		get_node("/root/GameState").add_scrap(randi_range(8, 20)) # bounty for the kill
	_spawn_death_explosion()
	vehicle_destroyed.emit()
	queue_free()

## A downed transport spills a rich loot payload.
func _drop_convoy_loot() -> void:
	var parent: Node = get_parent()
	if not parent:
		return
	for i in 3:
		var loot = LOOT_SCENE.instantiate()
		parent.add_child(loot)
		loot.global_position = global_position + Vector2(randf_range(-90.0, 90.0), randf_range(-90.0, 90.0))
		if "loot_multiplier" in loot:
			loot.loot_multiplier = 2.5
