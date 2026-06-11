class_name Explosion
extends Node2D

## Explosion — a one-shot area-of-effect blast. Applies falloff splash damage to vehicles and
## characters within radius (respecting teams), then plays an expanding/fading sprite and frees
## itself. Fully code-driven; spawn with setup().

const SPRITE: Texture2D = preload("res://entities/projectiles/sprites/explosion.png")

var radius: float = 120.0
var damage: int = 0
var team: int = 0
var source: Node = null

func setup(_radius: float, _damage: int, _team: int, _source: Node) -> void:
	radius = _radius
	damage = _damage
	team = _team
	source = _source

func _ready() -> void:
	_apply_splash()
	_play_visual()
	if has_node("/root/CameraShaker"):
		get_node("/root/CameraShaker").apply_shake(10.0)

func _apply_splash() -> void:
	var seen: Dictionary = {}
	for grp in ["vehicle", "enemy", "player"]:
		for n in get_tree().get_nodes_in_group(grp):
			if seen.has(n):
				continue
			seen[n] = true
			if n == source:
				continue
			if "team" in n and n.team == team:
				continue
			if not n is Node2D:
				continue
			var dist: float = (n.global_position - global_position).length()
			if dist > radius:
				continue
			var dmg: int = int(damage * (1.0 - dist / radius))
			if dmg <= 0:
				continue
			if n is VehicleEntity:
				n.take_damage(float(dmg))
			elif n is CharacterEntity and n.health_controller:
				n.health_controller.change_hp(-dmg, "Explosion")
			elif n.has_method("take_damage"):
				n.take_damage(dmg) # generic damageable (e.g. Bandit)

func _play_visual() -> void:
	var spr: Sprite2D = Sprite2D.new()
	spr.texture = SPRITE
	add_child(spr)
	var tex_w: float = max(1.0, float(SPRITE.get_width()))
	var full: float = (radius * 2.0) / tex_w
	spr.scale = Vector2(full * 0.3, full * 0.3)
	var tween: Tween = create_tween()
	tween.set_parallel(true)
	tween.tween_property(spr, "scale", Vector2(full, full), 0.25)
	tween.tween_property(spr, "modulate:a", 0.0, 0.35)
	tween.set_parallel(false)
	tween.tween_callback(queue_free)
