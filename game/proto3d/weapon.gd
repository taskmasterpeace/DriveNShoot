## The Arsenal (COMBAT_AND_GEAR §1): a gun is DATA + one of 3 behaviors, never new
## code. Ammo lives in the backpack (Container multi-use). Same system will bolt
## onto cars later (mount_type).
class_name ProtoWeapon
extends RefCounted

enum Behavior { HITSCAN, HITSCAN_MULTI, PROJECTILE, MELEE }

const WEAPONS: Dictionary = {
	"pistol": {"name": "Pistol", "emoji": "🔫", "behavior": Behavior.HITSCAN, "damage": 18.0,
		"mag_size": 12, "ammo": "9mm", "cooldown": 0.32, "spread_deg": 4.0, "range": 42.0, "reload_s": 0.9},
	"shotgun": {"name": "Pump shotgun", "emoji": "🔫", "behavior": Behavior.HITSCAN_MULTI, "damage": 9.0,
		"pellets": 6, "mag_size": 5, "ammo": "12ga", "cooldown": 0.95, "spread_deg": 11.0, "range": 22.0, "reload_s": 1.6},
	"pipe_rocket": {"name": "Pipe rocket", "emoji": "🧨", "behavior": Behavior.PROJECTILE, "damage": 60.0,
		"mag_size": 1, "ammo": "rocket", "cooldown": 1.6, "spread_deg": 2.0, "range": 60.0,
		"speed": 20.0, "blast": 5.0, "reload_s": 2.2},
	# Melee: no ammo, QUIET (no stress spike), stamina-gated. The wrench doubles
	# as the repair tool (multi-use). Machete hits harder.
	"wrench": {"name": "Wrench", "emoji": "🔧", "behavior": Behavior.MELEE, "damage": 14.0,
		"mag_size": 0, "ammo": "", "cooldown": 0.5, "spread_deg": 0.0, "reach": 2.4, "arc_deg": 100.0, "stamina": 8.0, "knockdown": 0.35, "shove": 1.8},
	"machete": {"name": "Machete", "emoji": "🔪", "behavior": Behavior.MELEE, "damage": 24.0,
		"mag_size": 0, "ammo": "", "cooldown": 0.7, "spread_deg": 0.0, "reach": 2.6, "arc_deg": 80.0, "stamina": 12.0, "knockdown": 0.25, "shove": 3.4},
	# Vehicle mount (COMBAT_AND_GEAR §5): same system, bolted to the car.
	"car_mg": {"name": "Hood MG", "emoji": "🔫", "behavior": Behavior.HITSCAN, "damage": 10.0,
		"mag_size": 40, "ammo": "9mm", "cooldown": 0.13, "spread_deg": 3.5, "range": 55.0},
}

var id: String
var mag: int = 0
var bloom: float = 0.0 ## grows per shot, decays at rest — the reticle shows it
var crit_chance: float = 0.15 ## the lucky shot: ×1.8, gold CRIT floater, sharp tick
var _cd: float = 0.0


func _init(id_in: String) -> void:
	id = id_in
	mag = info()["mag_size"]


func info() -> Dictionary:
	return WEAPONS[id]


func tick(delta: float) -> void:
	_cd = maxf(0.0, _cd - delta)
	bloom = maxf(0.0, bloom - delta * 1.8)


func is_melee() -> bool:
	return info()["behavior"] == Behavior.MELEE


func can_fire() -> bool:
	return (mag > 0 or is_melee()) and _cd <= 0.0


## Effective spread right now (base × bloom × skill) — the reticle draws this.
func current_spread(main: Node) -> float:
	var skill_mult := 1.0
	if "character" in main and main.character:
		skill_mult = clampf(1.0 - 0.06 * main.character.level("marksmanship"), 0.5, 1.0)
	return info()["spread_deg"] * (1.0 + bloom) * skill_mult


## Fires from the player toward aim_dir. Returns true if a shot happened.
func fire(main: Node, from: Vector3, aim_dir: Vector3) -> bool:
	if not can_fire():
		return false
	var w := info()
	if is_melee():
		# Stamina-gated swing, hits everything in the reach arc. QUIET (no heat/
		# stress) — but never silent to the SENSES: you see the arc, feel the lunge,
		# hear the whoosh, and every connection answers with blood + a thunk.
		if main.player.stamina < w["stamina"]:
			return false
		main.player.stamina -= w["stamina"]
		_cd = w["cooldown"]
		ProtoFX.swing_arc(main.player, aim_dir, w["arc_deg"], w["reach"])
		main.player.swing()
		main.player.lunge(aim_dir)
		if "audio" in main and main.audio:
			main.audio.play_at("whoosh", main.player.global_position, -8.0)
		var hit_any := false
		for node in main.get_tree().get_nodes_in_group("threat"):
			var t := node as Node3D
			if t == null or not is_instance_valid(t):
				continue
			var to_t: Vector3 = t.global_position - main.player.global_position
			to_t.y = 0.0
			if to_t.length() <= w["reach"] and aim_dir.dot(to_t.normalized()) > cos(deg_to_rad(w["arc_deg"] / 2.0)):
				if t.has_method("take_damage"):
					var was_valid := true
					ProtoFX.blood(main, t.global_position + Vector3(0, 1.1, 0))
					if t.has_method("shove"):
						t.shove(to_t.normalized(), w.get("shove", 2.5)) # steel carries weight — per-weapon
					var crit := randf() < crit_chance
					if crit:
						ProtoFloater.pop(main, t.global_position + Vector3(0, 2.2, 0), "CRIT", Color(1.0, 0.8, 0.2), 150)
					t.take_damage(w["damage"] * (1.8 if crit else 1.0))
					hit_any = true
					was_valid = is_instance_valid(t)
					if "audio" in main and main.audio:
						main.audio.play_at("thunk", main.player.global_position + to_t, -2.0)
					if "cam_rig" in main and main.cam_rig:
						main.cam_rig.add_trauma(0.16) # the connection lands in your hands
					# Melee HITS — chance to knock the target flat (feel the impact).
					if was_valid and t.has_method("knock_down") and randf() < w.get("knockdown", 0.3):
						t.knock_down()
		if hit_any and main.has_method("grant_xp"):
			main.grant_xp("marksmanship", 1.0)
		return true
	mag -= 1
	_cd = w["cooldown"]
	var sp := current_spread(main)
	bloom = minf(bloom + 0.45, 2.2) # each shot blooms the cone; rest recovers it
	# Every trigger pull is ANSWERED: flash at the muzzle, brass off to the right.
	ProtoFX.muzzle_flash(main, from, aim_dir)
	ProtoFX.casing(main, from, aim_dir.cross(Vector3.UP).normalized() * -1.0)
	match w["behavior"]:
		Behavior.HITSCAN:
			_ray_shot(main, from, _spread(aim_dir, sp), w["range"], w["damage"])
		Behavior.HITSCAN_MULTI:
			# Pellets at close range carry SHOVE — a shotgun answer you can see.
			for i in int(w["pellets"]):
				_ray_shot(main, from, _spread(aim_dir, sp), w["range"], w["damage"], 1.4)
		Behavior.PROJECTILE:
			_launch(main, from, _spread(aim_dir, sp), w)
	return true


## Triangular-distribution cone (INTERFACE_AND_BODY §6) — one random angle, top-down.
func _spread(dir: Vector3, deg: float) -> Vector3:
	var t := randf() - randf()
	return dir.rotated(Vector3.UP, t * deg_to_rad(deg))


func _ray_shot(main: Node, from: Vector3, dir: Vector3, rng: float, dmg: float, shove_power: float = 0.0) -> void:
	var space: PhysicsDirectSpaceState3D = main.player.get_world_3d().direct_space_state
	var to := from + dir * rng
	var q := PhysicsRayQueryParameters3D.create(from, to)
	var excl: Array[RID] = [main.player.get_rid()]
	# Shooting from a vehicle: don't shoot your own ride in the back of the head.
	if "active_car" in main and main.active_car != null and is_instance_valid(main.active_car):
		excl.append((main.active_car as PhysicsBody3D).get_rid())
	q.exclude = excl
	var hit: Dictionary = space.intersect_ray(q)
	var end := to
	if not hit.is_empty():
		end = hit["position"]
		var col = hit["collider"]
		if col != null and col.has_method("take_damage"):
			# FLESH: blood where the round lands, a dry tick in your ear, the
			# reticle pinches — the game says "that one counted."
			ProtoFX.blood(main, end)
			if shove_power > 0.0 and col.has_method("shove"):
				col.shove(dir, shove_power)
			var crit := randf() < crit_chance
			if crit:
				ProtoFloater.pop(main, end + Vector3(0, 1.0, 0), "CRIT", Color(1.0, 0.8, 0.2), 150)
			col.take_damage(dmg * (1.8 if crit else 1.0))
			if "audio" in main and main.audio:
				main.audio.play_ui("hitmark", -12.0 if crit else -14.0, 1.5 if crit else 1.0)
			if "hud" in main and main.hud:
				main.hud.pulse_hit()
			if main.has_method("grant_xp"):
				main.grant_xp("marksmanship", 2.0) # hits teach; misses don't
		else:
			# THE WORLD: dust off the wall — even a miss tells you where it went.
			ProtoFX.impact(main, end)
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


## Lobbed grenade: ballistic arc + fuse, blast via main.on_explosion.
class ProtoGrenade:
	extends Node3D
	var vel: Vector3
	var fuse: float = 1.6
	var blast: float = 5.0
	var damage: float = 55.0

	func _ready() -> void:
		var m := MeshInstance3D.new()
		var box := BoxMesh.new()
		box.size = Vector3(0.18, 0.18, 0.18)
		m.mesh = box
		m.material_override = ProtoWorldBuilder.material(Color(0.2, 0.28, 0.16), 0.6)
		add_child(m)

	func _physics_process(delta: float) -> void:
		vel.y -= 12.0 * delta
		global_position += vel * delta
		if global_position.y < 0.15:
			global_position.y = 0.15
			vel = vel * 0.35
			vel.y = 0.0
		fuse -= delta
		if fuse <= 0.0:
			var main := get_parent()
			for node in get_tree().get_nodes_in_group("threat"):
				var t := node as Node3D
				if t and is_instance_valid(t) and t.global_position.distance_to(global_position) < blast:
					if t.has_method("take_damage"):
						t.take_damage(damage)
			if main.has_method("on_explosion"):
				main.on_explosion(global_position)
			queue_free()


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
