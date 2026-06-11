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
# Effect kind for each pickup, in the same order as pickup_textures.
const PICKUP_KINDS := ["health", "ammo", "scrap", "fuel", "repair", "armor"]

var pursuer_spawned_this_run: bool = false ## Informational (shown in debug overlay).
var pursuer_pending: bool = false ## True once an encounter is queued, waiting on the speed check.
var player_speed_ok_timer: float = 0.0
var run_started_mile: float = 0.0
var last_pursuer_mile: float = 0.0 ## Miles at the last pursuer spawn (recurring encounter cadence).
var boss_spawned_this_run: bool = false ## Road Captain boss spawns once per run at high heat.
@export var base_encounter_interval: float = 0.55 ## Miles between encounters at low heat; shrinks as heat rises.

## The node encounters track: the active (driven) vehicle, else the on-foot player.
func _tracked_node() -> Node2D:
	for v in get_tree().get_nodes_in_group("vehicle"):
		if v is VehicleEntity and v.is_active:
			return v
	var players := get_tree().get_nodes_in_group("player")
	return players[0] if not players.is_empty() else null

func _world() -> Node:
	return get_tree().current_scene

func _ready() -> void:
	if has_node("/root/GameState"):
		var gs := get_node("/root/GameState")
		gs.distance_updated.connect(_on_distance_updated)
		gs.run_started.connect(_on_run_started)

## Reset all per-run encounter state at the start of every run (robust — doesn't depend on the
## first distance update firing).
func _on_run_started() -> void:
	pursuer_pending = false
	pursuer_spawned_this_run = false
	boss_spawned_this_run = false
	last_pursuer_mile = 0.0
	last_loot_mile = 0.0
	player_speed_ok_timer = 0.0

func _process(delta: float) -> void:
	var gs = get_node_or_null("/root/GameState")
	if not gs or gs.current_state != 1: # Not RUN
		player_speed_ok_timer = 0.0
		return
		
	# Speed gate keyed to whatever the player is driving (the vehicle), not the static player node.
	var track := _tracked_node()
	if track and track.velocity.length() > 120.0:
		player_speed_ok_timer += delta
	else:
		player_speed_ok_timer = 0.0

	# Process a queued encounter once the player is moving.
	if pursuer_pending and player_speed_ok_timer > 1.5:
		spawn_pursuer()
		pursuer_pending = false
		if gs:
			last_pursuer_mile = gs.current_run_miles
	
var last_loot_mile: float = 0.0
const LOOT_SCENE = preload("res://entities/world/loot_cache.tscn")

func _on_distance_updated(miles: float) -> void:
	if miles < 0.1:
		pursuer_spawned_this_run = false
		pursuer_pending = false # Reset pending status
		run_started_mile = 0.0
		last_loot_mile = 0.0 # Reset
		last_pursuer_mile = 0.0
		boss_spawned_this_run = false
		return
		
	# Loot Spawning
	if miles - last_loot_mile >= 0.8:
		_spawn_loot(miles)
		
	# Recurring encounters: queue one when enough distance has passed since the last, with the
	# gap shrinking as heat rises (deeper + hotter = relentless). The _process speed gate then
	# releases it when the player is actually moving.
	var gs = get_node_or_null("/root/GameState")
	if not gs: return
	var heat: int = gs.current_heat
	if heat < 15: return # short grace period at the start of a run
	var threat: int = gs.get_threat_level()
	var interval: float = clampf(base_encounter_interval - float(heat) * 0.008 - float(threat) * 0.025, 0.18, base_encounter_interval)
	if not pursuer_pending and miles - last_pursuer_mile >= interval:
		pursuer_pending = true

	# The Road Captain (boss) shows up once, deep in a hot run, as the climax.
	if heat >= 50 and not boss_spawned_this_run:
		_spawn_boss()

func _spawn_loot(miles: float) -> void:
	last_loot_mile = miles + randf_range(0.0, 0.4) # Next spawn in 0.8 to 1.2 mi

	var track := _tracked_node()
	if not track: return

	var spawn_pos = track.global_position + Vector2(0, -1500) # Ahead (Up is -Y)
	# Lane Snap (Center +/- 220)
	var lateral_offset = randf_range(-220, 220)
	spawn_pos.x = 10000.0 + lateral_offset # Road Center is 10000

	var loot = LOOT_SCENE.instantiate()
	loot.global_position = spawn_pos

	# Assign a pickup type — the sprite and its effect (loot.pickup_kind) match.
	if pickup_textures.size() > 0:
		var idx: int = randi() % pickup_textures.size()
		loot.pickup_kind = PICKUP_KINDS[idx]
		var sprite: Sprite2D = loot.get_node_or_null("Sprite2D")
		if sprite:
			sprite.texture = pickup_textures[idx]
			sprite.modulate = Color.WHITE  # Override brown tint from .tscn

	_world().add_child(loot)


func spawn_pursuer() -> void:
	pursuer_spawned_this_run = true

	var track := _tracked_node()
	if not track: return

	var spawn_pos = track.global_position + Vector2(0, 1500) # Behind (forward is -Y)
	spawn_pos.x += randf_range(-150, 150)

	# Sometimes the encounter is a convoy (armored hauler + escorts) instead of a lone pursuer.
	if randf() < 0.25:
		_spawn_convoy(track)
		return

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
	_world().add_child(pursuer)

	# A swarm pick brings a pack of flanking bikes.
	if is_swarm:
		_spawn_swarm_escorts(track, spawn_pos)

	# Telegraph to the player.
	var player := get_tree().get_first_node_in_group("player")
	var warning_text: String = "SWARM INBOUND!" if is_swarm else "PURSUER DETECTED!"
	if player and player.has_method("show_warning"):
		player.show_warning(warning_text)
	elif player and player.has_method("notify_action"):
		player.notify_action(warning_text, 1.0)

## Spawns the Road Captain boss behind the player as a run's climax.
func _spawn_boss() -> void:
	boss_spawned_this_run = true
	var track := _tracked_node()
	if not track:
		return
	var boss = PURSUER_SCENE.instantiate()
	boss.behavior_type = PursuerAI.BehaviorType.BOSS
	boss.road_center_x = 10000.0
	boss.global_position = track.global_position + Vector2(randf_range(-150.0, 150.0), 1400.0)
	_assign_enemy_sprite(boss)
	_world().add_child(boss)
	var player := get_tree().get_first_node_in_group("player")
	if player and player.has_method("show_warning"):
		player.show_warning("ROAD CAPTAIN INCOMING — big bounty!")

## Randomly assigns one of the enemy sprite variants to a pursuer's Sprite2D.
func _assign_enemy_sprite(pursuer: Node) -> void:
	if enemy_textures.size() > 0:
		var tex: Texture2D = enemy_textures.pick_random()
		var sprite: Sprite2D = pursuer.get_node_or_null("Sprite2D")
		if sprite:
			sprite.texture = tex

## Spawns an oncoming convoy: an armored TRANSPORT (rich loot when downed) flanked by two
## SHOOTER escorts, on the road ahead of the player so they meet head-on.
func _spawn_convoy(track: Node2D) -> void:
	var ahead: Vector2 = track.global_position + Vector2(0, -1800) # ahead = north (-Y)
	ahead.x = 10000.0 # road center

	var transport = PURSUER_SCENE.instantiate()
	transport.behavior_type = PursuerAI.BehaviorType.TRANSPORT
	transport.rotation = PI / 2.0 # face south, toward the oncoming player
	transport.global_position = ahead
	_assign_enemy_sprite(transport)
	_world().add_child(transport)

	for off in [-230.0, 230.0]:
		var escort = PURSUER_SCENE.instantiate()
		escort.behavior_type = PursuerAI.BehaviorType.SHOOTER
		escort.global_position = ahead + Vector2(off, 160.0)
		_assign_enemy_sprite(escort)
		_world().add_child(escort)

	var player := get_tree().get_first_node_in_group("player")
	if player and player.has_method("show_warning"):
		player.show_warning("CONVOY AHEAD — take it down for loot!")
	elif player and player.has_method("notify_action"):
		player.notify_action("CONVOY AHEAD!", 1.0)

## Spawns two extra SWARM bikes flanking the lead bike.
func _spawn_swarm_escorts(_track: Node2D, lead_pos: Vector2) -> void:
	for offset in [-260.0, 260.0]:
		var bike = PURSUER_SCENE.instantiate()
		bike.behavior_type = PursuerAI.BehaviorType.SWARM
		bike.global_position = lead_pos + Vector2(offset, randf_range(-120.0, 120.0))
		_assign_enemy_sprite(bike)
		_world().add_child(bike)

