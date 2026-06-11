class_name DataWeapon
extends DataItem

@export var power: int = 1 ## The value this entity subtracts from another entity's HP when it attacks.
@export var speed: float = 0.5 ## Affects the cooldown time between attacks.

@export_group("Ranged")
@export var projectile_scene: PackedScene
@export var projectile_speed: float = 800.0
@export var spread_degrees: float = 0.0
@export var knockback_force: float = 200.0
@export var max_ammo: int = 30
@export var reload_time: float = 1.5
@export var pellets: int = 1 ## Projectiles fired per shot (e.g. shotgun fires many).
@export var fire_shake: float = 5.0 ## Camera shake applied to the shooter on each shot.
