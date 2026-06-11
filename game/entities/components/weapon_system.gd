class_name WeaponSystem
extends Node2D

## WeaponSystem
## Handles shooting projectiles, ammo, fire-rate cadence, and reloading from DataWeapon stats.
## Attach as a child of a vehicle hardpoint or a character; its global_rotation is the aim
## direction. Set `team` and `source` from the owner so projectiles skip friendlies.

signal shot(ammo_in_magazine: int)
signal reloaded(ammo_in_magazine: int)
signal empty_magazine

const MUZZLE_FLASH: Texture2D = preload("res://entities/projectiles/sprites/muzzle_flash.png")

@export var weapon_data: DataWeapon
@export var team: int = 0 ## Faction of whoever owns this weapon; forwarded to projectiles.

var source: Node = null ## The entity that owns this weapon; projectiles never hit it.
var current_ammo: int = 0
var is_reloading: bool = false
var reload_timer: Timer
var _fire_cooldown: float = 0.0 ## Seconds remaining before this weapon can fire again.

func _ready() -> void:
	reload_timer = Timer.new()
	reload_timer.one_shot = true
	reload_timer.timeout.connect(_on_reload_complete)
	add_child(reload_timer)

	if weapon_data:
		initialize(weapon_data)

func _process(delta: float) -> void:
	if _fire_cooldown > 0.0:
		_fire_cooldown -= delta

func initialize(data: DataWeapon) -> void:
	weapon_data = data
	current_ammo = weapon_data.max_ammo
	_fire_cooldown = 0.0

## Fire if the weapon is off cooldown. Safe to call every frame while the trigger is held.
func try_shoot() -> void:
	if _fire_cooldown > 0.0:
		return
	shoot()

func shoot() -> void:
	if not weapon_data or not weapon_data.projectile_scene:
		return
	if is_reloading:
		return
	if current_ammo <= 0:
		empty_magazine.emit()
		start_reload()
		return

	# Cadence: weapon_data.speed is seconds between shots.
	_fire_cooldown = weapon_data.speed

	# Spread is applied per-pellet so shotguns scatter correctly.
	var pellets: int = max(1, weapon_data.pellets)
	for _i in pellets:
		_spawn_projectile()

	current_ammo -= 1
	shot.emit(current_ammo)
	_show_muzzle_flash()

	if has_node("/root/CameraShaker"):
		get_node("/root/CameraShaker").apply_shake(weapon_data.fire_shake)

	if current_ammo <= 0:
		start_reload()

func _spawn_projectile() -> void:
	var projectile: Node = weapon_data.projectile_scene.instantiate()
	get_tree().root.add_child(projectile)

	var spread_rad: float = deg_to_rad(weapon_data.spread_degrees)
	var random_angle: float = randf_range(-spread_rad / 2.0, spread_rad / 2.0)
	var shoot_direction: Vector2 = Vector2.RIGHT.rotated(global_rotation + random_angle)

	projectile.global_position = global_position
	projectile.rotation = shoot_direction.angle()

	if projectile.has_method("setup"):
		projectile.setup(shoot_direction, weapon_data.projectile_speed, weapon_data.power, weapon_data.knockback_force, team, source)

## Brief muzzle flash at the barrel. Short-lived and self-freeing, so it stays bounded even
## at high fire rates.
func _show_muzzle_flash() -> void:
	var flash: Sprite2D = Sprite2D.new()
	flash.texture = MUZZLE_FLASH
	flash.position = Vector2(20.0, 0.0) # forward of the muzzle
	add_child(flash)
	get_tree().create_timer(0.05).timeout.connect(flash.queue_free)

func start_reload() -> void:
	if is_reloading or not weapon_data or current_ammo == weapon_data.max_ammo:
		return
	is_reloading = true
	reload_timer.start(weapon_data.reload_time)

func _on_reload_complete() -> void:
	is_reloading = false
	current_ammo = weapon_data.max_ammo
	reloaded.emit(current_ammo)
