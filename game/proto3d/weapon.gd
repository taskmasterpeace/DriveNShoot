## The Arsenal (COMBAT_AND_GEAR §1): a gun is DATA + one of 3 behaviors, never new
## code. Ammo lives in the backpack (Container multi-use). Same system will bolt
## onto cars later (mount_type).
class_name ProtoWeapon
extends RefCounted

enum Behavior { HITSCAN, HITSCAN_MULTI, PROJECTILE }

const WEAPONS: Dictionary = {
	"pistol": {"name": "Pistol", "emoji": "🔫", "behavior": Behavior.HITSCAN, "damage": 18.0,
		"mag_size": 12, "ammo": "9mm", "cooldown": 0.32, "spread_deg": 4.0, "range": 42.0},
	"shotgun": {"name": "Pump shotgun", "emoji": "🔫", "behavior": Behavior.HITSCAN_MULTI, "damage": 9.0,
		"pellets": 6, "mag_size": 5, "ammo": "12ga", "cooldown": 0.95, "spread_deg": 11.0, "range": 22.0},
	"pipe_rocket": {"name": "Pipe rocket", "emoji": "🧨", "behavior": Behavior.PROJECTILE, "damage": 60.0,
		"mag_size": 1, "ammo": "rocket", "cooldown": 1.6, "spread_deg": 2.0, "range": 60.0,
		"speed": 20.0, "blast": 5.0},
}

var id: String
var mag: int = 0
var _cd: float = 0.0


func _init(id_in: String) -> void:
	id = id_in
	mag = info()["mag_size"]


func info() -> Dictionary:
	return WEAPONS[id]


func tick(delta: float) -> void:
	_cd = maxf(0.0, _cd - delta)


func can_fire() -> bool:
	return mag > 0 and _cd <= 0.0


## Fires from the player toward aim_dir. Returns true if a shot happened.
func fire(main: Node, from: Vector3, aim_dir: Vector3) -> bool:
	if not can_fire():
		return false
	mag -= 1
	_cd = info()["cooldown"]
	var w := info()
	match w["behavior"]:
		Behavior.HITSCAN:
			_ray_shot(main, from, _spread(aim_dir, w["spread_deg"]), w["range"], w["damage"])
		Behavior.HITSCAN_MULTI:
			for i in int(w["pellets"]):
				_ray_shot(main, from, _spread(aim_dir, w["spread_deg"]), w["range"], w["damage"])
		Behavior.PROJECTILE:
			_launch(main, from, _spread(aim_dir, w["spread_deg"]), w)
	return true


## Triangular-distribution cone (INTERFACE_AND_BODY §6) — one random angle, top-down.
func _spread(dir: Vector3, deg: float) -> Vector3:
	var t := randf() - randf()
	return dir.rotated(Vector3.UP, t * deg_to_rad(deg))


func _ray_shot(main: Node, from: Vector3, dir: Vector3, rng: float, dmg: float) -> void:
	var space: PhysicsDirectSpaceState3D = main.player.get_world_3d().direct_space_state
	var to := from + dir * rng
	var q := PhysicsRayQueryParameters3D.create(from, to)
	q.exclude = [main.player.get_rid()]
	var hit: Dictionary = space.intersect_ray(q)
	var end := to
	if not hit.is_empty():
		end = hit["position"]
		var col = hit["collider"]
		if col != null and col.has_method("take_damage"):
			col.take_damage(dmg)
	_tracer(main, from, end)


## Visible round: shots fly the ROLLED vector, so misses are legible.
func _tracer(main: Node, from: Vector3, to: Vector3) -> void:
	var m := MeshInstance3D.new()
	var box := BoxMesh.new()
	var length := from.distance_to(to)
	box.size = Vector3(0.05, 0.05, maxf(length, 0.4))
	m.mesh = box
	m.material_override = ProtoWorldBuilder.material(Color(1.0, 0.85, 0.4), 0.2, true)
	main.add_child(m)
	m.global_position = (from + to) / 2.0
	if length > 0.1:
		m.look_at(to, Vector3.UP)
	var tw := m.create_tween()
	tw.tween_property(m, "transparency", 1.0, 0.09)
	tw.tween_callback(m.queue_free)


func _launch(main: Node, from: Vector3, dir: Vector3, w: Dictionary) -> void:
	var rocket := ProtoRocket.new()
	rocket.dir = dir
	rocket.speed = w["speed"]
	rocket.damage = w["damage"]
	rocket.blast = w["blast"]
	main.add_child(rocket)
	rocket.global_position = from + dir * 1.2


## The flying pipe rocket: straight line, explodes on proximity or timeout.
class ProtoRocket:
	extends Node3D
	var dir: Vector3
	var speed: float = 20.0
	var damage: float = 60.0
	var blast: float = 5.0
	var _life: float = 3.0

	func _ready() -> void:
		var m := MeshInstance3D.new()
		var box := BoxMesh.new()
		box.size = Vector3(0.15, 0.15, 0.5)
		m.mesh = box
		m.material_override = ProtoWorldBuilder.material(Color(0.8, 0.3, 0.1), 0.4, true)
		add_child(m)
		if dir.length_squared() > 0.01:
			look_at(global_position + dir, Vector3.UP)

	func _physics_process(delta: float) -> void:
		global_position += dir * speed * delta
		_life -= delta
		var main := get_parent()
		for node in get_tree().get_nodes_in_group("threat"):
			var t := node as Node3D
			if t and is_instance_valid(t) and t.global_position.distance_to(global_position) < 1.6:
				_boom(main)
				return
		if _life <= 0.0:
			_boom(main)

	func _boom(main: Node) -> void:
		for node in get_tree().get_nodes_in_group("threat"):
			var t := node as Node3D
			if t and is_instance_valid(t) and t.global_position.distance_to(global_position) < blast:
				if t.has_method("take_damage"):
					t.take_damage(damage)
		if main.has_method("on_explosion"):
			main.on_explosion(global_position)
		queue_free()
