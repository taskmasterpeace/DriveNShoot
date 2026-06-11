class_name Bandit
extends CharacterBody2D

## Bandit — a self-contained on-foot enemy. Deliberately does NOT extend CharacterEntity (which
## needs an animation tree, health controller, hitboxes, etc.) so it can be spawned purely from
## code without a fully-wired scene. Chases the player, holds a preferred range, and fires a gun.
## Lives on the character layer, so it can stand inside foot-only ruins where vehicles can't go.

const WEAPON: DataWeapon = preload("res://items/weapons/machine_gun.tres")
const SPRITE: Texture2D = preload("res://entities/enemies/sprites/enemy_raider_foot.png")

@export var max_hp: float = 50.0
@export var move_speed: float = 175.0
@export var attack_range: float = 430.0
@export var preferred_range: float = 280.0

var hp: float = 50.0
var team: int = 1 ## Hostile.
var player: Node2D
var weapon: WeaponSystem

func _ready() -> void:
	add_to_group("enemy")
	hp = max_hp
	collision_layer = 1 << 1            # character layer (2)
	collision_mask = 1 | (1 << 1)       # block + character (NOT rough_terrain — can enter ruins)

	var spr: Sprite2D = Sprite2D.new()
	spr.texture = SPRITE
	add_child(spr)

	var col: CollisionShape2D = CollisionShape2D.new()
	var shape: CircleShape2D = CircleShape2D.new()
	shape.radius = 14.0
	col.shape = shape
	add_child(col)

	weapon = WeaponSystem.new()
	weapon.weapon_data = WEAPON
	weapon.team = team
	weapon.source = self
	add_child(weapon)

	player = get_tree().get_first_node_in_group("player")

func _physics_process(_delta: float) -> void:
	if not is_instance_valid(player):
		player = get_tree().get_first_node_in_group("player")
		velocity = Vector2.ZERO
		return

	var to_player: Vector2 = player.global_position - global_position
	var dist: float = to_player.length()
	var dir: Vector2 = to_player.normalized()

	# Hold a firing distance: close in if far, back off if too close.
	if dist > preferred_range:
		velocity = dir * move_speed
	elif dist < preferred_range * 0.6:
		velocity = -dir * move_speed
	else:
		velocity = Vector2.ZERO
	move_and_slide()

	if dist < attack_range:
		weapon.global_rotation = dir.angle()
		weapon.try_shoot()

## Generic damage entry point used by projectiles for non-Vehicle/Character bodies.
func take_damage(amount) -> void:
	hp -= amount
	modulate = Color(1.0, 0.6, 0.6) # brief hit flash tint
	if hp <= 0.0:
		queue_free()
