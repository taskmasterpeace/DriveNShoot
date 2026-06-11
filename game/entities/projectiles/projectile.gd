class_name Projectile
extends Area2D

## Projectile
## Travels in a direction and damages whatever it hits — both VehicleEntity (own hp/
## take_damage) and CharacterEntity (HealthController.change_hp). Respects teams so a
## projectile never hits its own source or an ally, and is destroyed on world geometry.

@export var life_time: float = 3.0
@export var hit_vehicles: bool = true
@export var hit_characters: bool = true
@export var impact_shake: float = 4.0 ## Camera shake applied when this projectile hits something.

var velocity: Vector2 = Vector2.ZERO
var damage: int = 0
var knockback_force: float = 0.0
var team: int = 0 ## 0 = player/friendly, 1 = hostile. Same-team entities are passed through.
var source: Node = null ## The entity that fired this; never damages its own source.

func _ready() -> void:
	body_entered.connect(_on_body_entered)
	var timer: SceneTreeTimer = get_tree().create_timer(life_time)
	timer.timeout.connect(queue_free)

## Configure the projectile. team/source are optional for backwards compatibility with
## callers that only pass the original four arguments.
func setup(direction: Vector2, speed: float, _damage: int, _knockback: float, _team: int = 0, _source: Node = null) -> void:
	velocity = direction * speed
	damage = _damage
	knockback_force = _knockback
	team = _team
	source = _source

func _physics_process(delta: float) -> void:
	global_position += velocity * delta

func _on_body_entered(body: Node) -> void:
	# Never hit the entity that fired this, and never hit an ally.
	if body == source:
		return
	if "team" in body and body.team == team:
		return

	if hit_vehicles and body is VehicleEntity:
		body.take_damage(float(damage))
		_impact()
		return

	if hit_characters and body is CharacterEntity:
		_damage_character(body)
		_impact()
		return

	# Hit static world geometry (walls, terrain on the block layer) — stop the round.
	if body is StaticBody2D or body is TileMapLayer:
		queue_free()

func _damage_character(character: CharacterEntity) -> void:
	if character.health_controller:
		character.health_controller.change_hp(-damage, "Gunfire")
	if knockback_force > 0.0 and character.has_method("apply_knockback"):
		character.apply_knockback(velocity.normalized() * knockback_force)
	# Floating damage number + shake feedback (does not itself subtract HP).
	character.take_damage(damage)

func _impact() -> void:
	if impact_shake > 0.0 and has_node("/root/CameraShaker"):
		get_node("/root/CameraShaker").apply_shake(impact_shake)
	queue_free()
