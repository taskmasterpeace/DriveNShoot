class_name WeaponSystem
extends Node2D

## WeaponSystem
## Handles shooting projectiles, ammo management, and reloading.
## Based on DataWeapon stats.

signal shot(ammo_in_magazine: int)
signal reloaded(ammo_in_magazine: int)
signal empty_magazine

@export var weapon_data: DataWeapon

var current_ammo: int = 0
var is_reloading: bool = false
var reload_timer: Timer

func _ready() -> void:
	reload_timer = Timer.new()
	reload_timer.one_shot = true
	reload_timer.timeout.connect(_on_reload_complete)
	add_child(reload_timer)
	
	if weapon_data:
		initialize(weapon_data)

func initialize(data: DataWeapon) -> void:
	weapon_data = data
	current_ammo = weapon_data.max_ammo

func shoot() -> void:
	if not weapon_data or not weapon_data.projectile_scene:
		return
	
	if is_reloading:
		return
		
	if current_ammo <= 0:
		empty_magazine.emit()
		start_reload()
		return

	# Spawn projectile
	var projectile = weapon_data.projectile_scene.instantiate()
	get_tree().root.add_child(projectile)
	
	# Rotation and Spread
	var spread_rad = deg_to_rad(weapon_data.spread_degrees)
	var random_angle = randf_range(-spread_rad / 2.0, spread_rad / 2.0)
	var shoot_direction = Vector2.RIGHT.rotated(global_rotation + random_angle)
	
	projectile.global_position = global_position
	projectile.rotation = shoot_direction.angle()
	
	# Configure projectile
	if projectile.has_method("setup"):
		projectile.setup(shoot_direction, weapon_data.projectile_speed, weapon_data.power, weapon_data.knockback_force)
	
	current_ammo -= 1
	shot.emit(current_ammo)
	
	# Polish: Screen Shake
	if has_node("/root/CameraShaker"):
		get_node("/root/CameraShaker").apply_shake(5.0)

func start_reload() -> void:
	if is_reloading or current_ammo == weapon_data.max_ammo:
		return
		
	is_reloading = true
	reload_timer.start(weapon_data.reload_time)

func _on_reload_complete() -> void:
	is_reloading = false
	current_ammo = weapon_data.max_ammo
	reloaded.emit(current_ammo)
