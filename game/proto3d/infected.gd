## THE INFECTED (docs/design/THE_INFECTED.md §1/§3.1): failed stabilization
## trials — living bodies, not monsters. ONE actor class on the shared rig;
## every variant is a ROW in data/infected.json. The frame is the lurker's
## proven skeleton (capsule + puppet + Damageable + stagger/shove/knockdown +
## melee_clear claw + corpse + population unregister) with the stalk block
## swapped for the howler's loudest-noise steer: NO PATHFINDING, EVER — they
## steer at sound, drift with the herd, POOL at noise sources, and walls stop
## them (pooling at walls is correct behavior). Howlers are a time; infected
## are a terrain: no dawn flight, no headlight fear, no weather taxes.
class_name ProtoInfected
extends CharacterBody3D

const ROWS_PATH := "res://data/infected.json"
static var rows: Dictionary = {} ## id -> variant row (code floor + fold)
static var fever_row: Dictionary = {"hours": 36.0, "stam_mult": 0.75, "hunger_mult": 1.3}
static var _loaded := false

var variant: String = "shambler"
var row: Dictionary = {}
var hit_launch: Vector3 = Vector3.ZERO
var body: Damageable = Damageable.new("body", "💀", 26.0)
var dead: bool = false
var knocked: bool = false
var _knock_t := 0.0
var _stun_t := 0.0
var _claw_cd := 0.0
var _hit_flash_t := 0.0
var _flash_mat: StandardMaterial3D = null
var _visual: Node3D
var _puppet: ProtoPuppet = null
var _main: Node = null
var _steer_t := 0.0
var _target: Vector3 = Vector3.ZERO
var _has_target := false


static func ensure_rows() -> void:
	if _loaded:
		return
	_loaded = true
	# code floor: the shambler exists even with no file at all
	rows = {"shambler": {"id": "shambler", "hp": 26.0, "claw": 8.0, "claw_cd": 1.4,
		"speed_mps": 1.1, "lock_speed_mps": 1.6,
		"puppet": {"skin": [0.62, 0.58, 0.52], "cloth": [0.30, 0.28, 0.24], "gait": 0.6, "build": 0.72}}}
	if not FileAccess.file_exists(ROWS_PATH):
		return
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(ROWS_PATH))
	if not (parsed is Dictionary):
		return
	var d: Dictionary = parsed
	for v in d.get("variants", []):
		rows[String((v as Dictionary).get("id", ""))] = (v as Dictionary).duplicate(true)
	for k in (d.get("fever", {}) as Dictionary):
		fever_row[k] = d["fever"][k]


static func create(variant_in: String = "shambler") -> ProtoInfected:
	ensure_rows()
	var i := ProtoInfected.new()
	i.variant = variant_in
	i.row = rows.get(variant_in, rows["shambler"])
	i.body = Damageable.new("body", "💀", float(i.row.get("hp", 26.0)))
	# melee scans the UNION — every hostile is meleeable however tagged
	i.add_to_group("infected")
	i.add_to_group("threat")
	i.add_to_group("combatant")
	var shape := CollisionShape3D.new()
	var cap := CapsuleShape3D.new()
	cap.radius = 0.32
	cap.height = 1.6
	shape.shape = cap
	shape.position.y = 0.8
	i.add_child(shape)
	# the one rig, fed the pale trial look; ~40% drag a leg (the shipped limp field)
	var look: Dictionary = (i.row.get("puppet", {}) as Dictionary).duplicate(true)
	for ck in ["skin", "cloth"]:
		if look.has(ck) and look[ck] is Array and (look[ck] as Array).size() >= 3:
			var a: Array = look[ck]
			look[ck] = Color(float(a[0]), float(a[1]), float(a[2])) # JSON rows carry arrays; the rig wants Colors
	if randf() < 0.4:
		look["limp"] = "l" if randf() < 0.5 else "r"
	i._puppet = ProtoPuppet.create(look)
	i._visual = i._puppet
	i.add_child(i._visual)
	return i


func knock_down() -> void:
	if dead:
		return
	knocked = true
	_knock_t = 1.6
	if _visual:
		_visual.rotation.x = -1.35
	ProtoFloater.pop(get_parent(), global_position + Vector3(0, 2.1, 0), "KNOCKDOWN!", Color(1.0, 0.82, 0.2), 150)


func is_stunned() -> bool:
	return _stun_t > 0.0


func shove(dir: Vector3, power: float) -> void:
	if dead:
		return
	var d := Vector3(dir.x, 0, dir.z)
	if d.length_squared() > 0.01:
		velocity += d.normalized() * power + Vector3(0, power * 0.25, 0)


func take_damage(amount: float) -> void:
	if dead:
		return
	_stun_t = minf(_stun_t + 0.3, 0.7)
	ProtoFloater.pop(get_parent(), global_position + Vector3(0, 1.8, 0), "-%d" % int(amount), Color(0.96, 0.86, 0.55), 110)
	if _flash_mat == null:
		_flash_mat = StandardMaterial3D.new()
		_flash_mat.albedo_color = Color(1.0, 0.9, 0.8)
		_flash_mat.emission_enabled = true
		_flash_mat.emission = Color(1.0, 0.55, 0.35)
		_flash_mat.emission_energy_multiplier = 2.4
	_hit_flash_t = 0.12
	_flash_all(_visual, _flash_mat)
	velocity.y += 1.6
	body.damage(amount)
	if body.hp <= 0.0:
		dead = true
		var m := _resolve_main()
		if m != null and "population" in m and m.population != null:
			m.population.on_actor_removed(self)
		ProtoFX.skull(get_parent(), global_position)
		# THE BODY LAW + the ecosystem contract: an infected corpse READS WRONG —
		# pale tint, no pack loot, and it carries the infection float the
		# pressure law (F-IP) and the corpse-flies tell consume.
		var corpse := ProtoCorpse.create("Body", {}, Color(0.58, 0.55, 0.5), hit_launch, m)
		corpse.infection = 1.0
		get_parent().add_child(corpse)
		corpse.global_position = global_position
		queue_free()


func _flash_all(node: Node, mat: Material) -> void:
	if node is MeshInstance3D:
		(node as MeshInstance3D).material_overlay = mat
	for c in node.get_children():
		_flash_all(c, mat)


func _resolve_main() -> Node:
	if _main != null and is_instance_valid(_main):
		return _main
	var m: Node = get_tree().current_scene
	if m == null or not ("population" in m):
		m = get_parent()
	_main = m
	return _main


func _physics_process(delta: float) -> void:
	if not is_on_floor():
		velocity += get_gravity() * delta
	if _hit_flash_t > 0.0:
		_hit_flash_t -= delta
		if _hit_flash_t <= 0.0 and _visual:
			_flash_all(_visual, null)
	if _puppet != null:
		var spd := Vector2(velocity.x, velocity.z).length()
		_puppet.animate(delta, spd, 0.0, false, 0.0, dead)
	if _stun_t > 0.0:
		_stun_t -= delta
		velocity.x = move_toward(velocity.x, 0.0, 16.0 * delta)
		velocity.z = move_toward(velocity.z, 0.0, 16.0 * delta)
		move_and_slide()
		return
	if knocked:
		_knock_t -= delta
		velocity.x = move_toward(velocity.x, 0.0, 14.0 * delta)
		velocity.z = move_toward(velocity.z, 0.0, 14.0 * delta)
		if _knock_t <= 0.0:
			knocked = false
			if _visual:
				_visual.rotation.x = 0.0
		move_and_slide()
		return

	# F-SHAMBLER-STEER (no pathfinding, ever): loudest noises_in hit, refreshed
	# on a 1 s cadence; else drift with the herd centroid; else stand (POOL).
	_steer_t -= delta
	if _steer_t <= 0.0:
		_steer_t = 1.0
		_has_target = false
		var m := _resolve_main()
		if m != null and m.has_method("noises_in"):
			var heard: Array = m.noises_in(global_position)
			if not heard.is_empty():
				var loudest: Dictionary = heard[0]
				for n in heard:
					if float(n["radius"]) > float(loudest["radius"]):
						loudest = n
				_target = loudest["pos"]
				_has_target = true
		if not _has_target:
			# herd drift: the centroid of nearby kin
			var sum := Vector3.ZERO
			var n_kin := 0
			for k in get_tree().get_nodes_in_group("infected"):
				if k != self and k is Node3D and is_instance_valid(k) \
						and (k as Node3D).global_position.distance_to(global_position) < 60.0:
					sum += (k as Node3D).global_position
					n_kin += 1
			if n_kin >= 2:
				_target = sum / float(n_kin)
				_has_target = true

	var speed := float(row.get("speed_mps", 1.1))
	if _has_target:
		var to_t := _target - global_position
		to_t.y = 0.0
		if to_t.length() > 2.5:
			var dir := to_t.normalized()
			# locked on: a body in claw reach walks faster (1.6) — the read that
			# says RUN. "Locked" here = the target is close and real.
			if to_t.length() < 9.0:
				speed = float(row.get("lock_speed_mps", 1.6))
			velocity.x = move_toward(velocity.x, dir.x * speed, 6.0 * delta)
			velocity.z = move_toward(velocity.z, dir.z * speed, 6.0 * delta)
			if _visual:
				_visual.rotation.y = lerp_angle(_visual.rotation.y, atan2(-dir.x, -dir.z), 4.0 * delta)
		else:
			# POOLED at the noise — stand there until louder news arrives
			velocity.x = move_toward(velocity.x, 0.0, 8.0 * delta)
			velocity.z = move_toward(velocity.z, 0.0, 8.0 * delta)
	else:
		velocity.x = move_toward(velocity.x, 0.0, 8.0 * delta)
		velocity.z = move_toward(velocity.z, 0.0, 8.0 * delta)

	# the claw — contact only, through the wall law, and the wound leaves
	# BITE FEVER on a player (sepsis, never transformation — §3.6)
	_claw_cd = maxf(0.0, _claw_cd - delta)
	if not dead and _claw_cd <= 0.0:
		var pl: Node3D = get_tree().get_first_node_in_group("player3d")
		if pl != null and is_instance_valid(pl):
			var d := global_position.distance_to(pl.global_position)
			if d <= 1.9 and ProtoWeapon.melee_clear(self, pl):
				_claw_cd = float(row.get("claw_cd", 1.4))
				if pl.has_method("take_damage"):
					pl.take_damage(float(row.get("claw", 8.0)), self)
				var m2 := _resolve_main()
				if m2 != null and "character" in m2 and m2.character != null and m2.character.has_method("bite_fever"):
					var now_h: float = (float(m2.daynight.day) * 24.0 + float(m2.daynight.hour)) if ("daynight" in m2 and m2.daynight != null) else 0.0
					m2.character.bite_fever(now_h)
	move_and_slide()
