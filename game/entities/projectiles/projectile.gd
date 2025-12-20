class_name Projectile
extends Area2D

## Projectile
## Moves in a direction and damages/knocks back CharacterEntities.

var velocity: Vector2 = Vector2.ZERO
var damage: int = 0
var knockback_force: float = 0.0

@export var life_time: float = 3.0

func _ready() -> void:
	body_entered.connect(_on_body_entered)
	
	# Auto-destroy after lifetime
	var timer = get_tree().create_timer(life_time)
	timer.timeout.connect(queue_free)

func setup(direction: Vector2, speed: float, _damage: int, _knockback: float) -> void:
	velocity = direction * speed
	damage = _damage
	knockback_force = _knockback

func _physics_process(delta: float) -> void:
	global_position += velocity * delta

func _on_body_entered(body: Node) -> void:
	if body is CharacterEntity:
		# Apply Damage
		if body.has_method("take_damage"):
			# Assuming take_damage now accepts a knockback vector or we modify it
			# Since CharacterEntity might not have 'take_damage' with knockback yet, we will implement it.
			# For now, let's assume we can push them.
			if body.has_method("apply_knockback"):
				var knockback_vector = velocity.normalized() * knockback_force
				body.apply_knockback(knockback_vector)
				
			# If take_damage is standard
			if body.has_node("HealthController"): # Or whatever health system
				body.health_controller.hp -= damage # Simplified access
	
	# Destroy projectile on impact
	queue_free()
