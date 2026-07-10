## Combat FX (the juice layer): every hit, swing, and shot gets ANSWERED on
## screen. Short automatic-fire flashes are pooled; longer one-shot effects
## self-free. Everything tags itself into "fx_*" groups so sims can prove the
## juice exists without rendering a single pixel.
class_name ProtoFX
extends RefCounted

const FLASH_CAP: int = 12
static var _flash_pools: Dictionary = {}
static var _flash_serial: int = 0


## A flash is two crossed emissive blades plus a point-light beat. Expiry hides
## the slot and stops processing; it never frees during a firefight.
class FlashSlot extends Node3D:
	var blade_a: MeshInstance3D = null
	var blade_b: MeshInstance3D = null
	var light: OmniLight3D = null
	var mesh_a: BoxMesh = null
	var mesh_b: BoxMesh = null
	var material: StandardMaterial3D = null
	var active: bool = false
	var life_left: float = 0.0
	var started_serial: int = 0
	var authored_length: float = 0.0

	func _ensure_built() -> void:
		if blade_a != null:
			return
		blade_a = MeshInstance3D.new()
		blade_b = MeshInstance3D.new()
		light = OmniLight3D.new()
		mesh_a = BoxMesh.new()
		mesh_b = BoxMesh.new()
		material = StandardMaterial3D.new()
		material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		material.emission_enabled = true
		blade_a.mesh = mesh_a
		blade_b.mesh = mesh_b
		blade_a.material_override = material
		blade_b.material_override = material
		blade_a.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		blade_b.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		add_child(blade_a)
		add_child(blade_b)
		add_child(light)
		blade_b.rotation.z = PI * 0.25
		add_to_group("fx_flash")

	func play(pos: Vector3, dir: Vector3, row: Dictionary, serial: int) -> void:
		_ensure_built()
		var length: float = float(row.get("length", 0.5))
		var width: float = float(row.get("width", 0.16))
		var offset: float = float(row.get("offset", 0.3))
		var color: Color = row.get("color", Color(1.0, 0.82, 0.35)) as Color
		mesh_a.size = Vector3(width, width * 0.24, length)
		mesh_b.size = mesh_a.size
		material.albedo_color = color
		material.emission = color
		material.emission_energy_multiplier = float(row.get("emission", 5.0))
		light.light_color = color
		light.light_energy = float(row.get("energy", 2.4))
		light.omni_range = float(row.get("range", 4.0))
		var forward: Vector3 = dir.normalized() if dir.length_squared() > 0.001 else Vector3.FORWARD
		global_position = pos + forward * offset
		look_at(global_position + forward, Vector3.UP)
		authored_length = length
		started_serial = serial
		life_left = float(row.get("life", 0.075))
		active = true
		visible = true
		set_process(true)

	func _process(delta: float) -> void:
		life_left -= delta
		if life_left <= 0.0:
			active = false
			visible = false
			light.light_energy = 0.0
			set_process(false)


static func _valid_pool(parent: Node) -> Array:
	var key: int = parent.get_instance_id()
	var raw: Array = _flash_pools.get(key, [])
	var valid: Array = []
	for entry in raw:
		if is_instance_valid(entry) and (entry as Node).get_parent() == parent:
			valid.append(entry)
	_flash_pools[key] = valid
	return valid


static func _oldest_or_idle(pool: Array) -> FlashSlot:
	for entry in pool:
		var slot := entry as FlashSlot
		if not slot.active:
			return slot
	var oldest: FlashSlot = pool[0] as FlashSlot
	for entry in pool:
		var slot := entry as FlashSlot
		if slot.started_serial < oldest.started_serial:
			oldest = slot
	return oldest


## Muzzle flash: weapon-authored and hard-capped per host. At capacity, the
## oldest live slot is restarted so a long burst cannot allocate without bound.
static func muzzle_flash(parent: Node, pos: Vector3, dir: Vector3, row: Dictionary = {}) -> void:
	var pool: Array = _valid_pool(parent)
	var slot: FlashSlot = null
	if pool.size() < FLASH_CAP:
		for entry in pool:
			var candidate := entry as FlashSlot
			if not candidate.active:
				slot = candidate
				break
		if slot == null:
			slot = FlashSlot.new()
			parent.add_child(slot)
			pool.append(slot)
			_flash_pools[parent.get_instance_id()] = pool
	else:
		slot = _oldest_or_idle(pool)
	_flash_serial += 1
	slot.play(pos, dir, row, _flash_serial)


## Ejected shell casing: a glinting speck that arcs right of the gun and dies
## on the ground. Pure visual (tweened, no physics body).
static func casing(parent: Node, pos: Vector3, right_dir: Vector3) -> void:
	var m := MeshInstance3D.new()
	var box := BoxMesh.new()
	box.size = Vector3(0.03, 0.03, 0.07)
	m.mesh = box
	m.material_override = ProtoWorldBuilder.material(Color(0.85, 0.68, 0.25), 0.3, true)
	m.add_to_group("fx_casing")
	parent.add_child(m)
	m.global_position = pos
	var land := pos + right_dir * randf_range(0.5, 0.9) + Vector3(randf_range(-0.2, 0.2), 0, randf_range(-0.2, 0.2))
	land.y = 0.04
	var apex := (pos + land) / 2.0 + Vector3(0, 0.35, 0)
	m.rotation = Vector3(randf() * TAU, randf() * TAU, 0)
	var tw := m.create_tween()
	tw.tween_property(m, "global_position", apex, 0.12).set_ease(Tween.EASE_OUT)
	tw.tween_property(m, "global_position", land, 0.16).set_ease(Tween.EASE_IN)
	tw.parallel().tween_property(m, "rotation:x", m.rotation.x + 7.0, 0.28)
	tw.tween_interval(1.4)
	tw.tween_property(m, "transparency", 1.0, 0.5)
	tw.tween_callback(m.queue_free)


## Blood puff on flesh hits — dark, brief, gravity-pulled.
static func blood(parent: Node, pos: Vector3) -> void:
	var p := CPUParticles3D.new()
	p.one_shot = true
	p.emitting = true
	p.amount = 14
	p.lifetime = 0.45
	p.explosiveness = 1.0
	p.mesh = BoxMesh.new()
	(p.mesh as BoxMesh).size = Vector3(0.07, 0.07, 0.07)
	p.direction = Vector3(0, 1, 0)
	p.spread = 70.0
	p.initial_velocity_min = 1.6
	p.initial_velocity_max = 3.4
	p.gravity = Vector3(0, -14.0, 0)
	p.color = Color(0.45, 0.06, 0.05)
	p.add_to_group("fx_blood")
	parent.add_child(p)
	p.global_position = pos
	var tw := p.create_tween()
	tw.tween_interval(0.8)
	tw.tween_callback(p.queue_free)


## Impact dust/sparks where a round meets the WORLD (walls, ground, wrecks) —
## misses and cover hits read instantly.
static func impact(parent: Node, pos: Vector3) -> void:
	var p := CPUParticles3D.new()
	p.one_shot = true
	p.emitting = true
	p.amount = 10
	p.lifetime = 0.35
	p.explosiveness = 1.0
	p.mesh = BoxMesh.new()
	(p.mesh as BoxMesh).size = Vector3(0.05, 0.05, 0.05)
	p.direction = Vector3(0, 1, 0)
	p.spread = 80.0
	p.initial_velocity_min = 1.2
	p.initial_velocity_max = 2.6
	p.gravity = Vector3(0, -6.0, 0)
	p.color = Color(0.78, 0.7, 0.55)
	p.add_to_group("fx_impact")
	parent.add_child(p)
	p.global_position = pos
	var tw := p.create_tween()
	tw.tween_interval(0.7)
	tw.tween_callback(p.queue_free)


## The swing made visible: a flat arc blade that sweeps through the melee arc
## and fades. Rides the swinger so it tracks a lunge.
static func swing_arc(swinger: Node3D, aim_dir: Vector3, arc_deg: float, reach: float) -> void:
	var root := Node3D.new()
	root.add_to_group("fx_swing")
	swinger.add_child(root)
	root.position = Vector3(0, 1.15, 0)
	var blade := MeshInstance3D.new()
	var box := BoxMesh.new()
	box.size = Vector3(0.09, 0.03, reach)
	blade.mesh = box
	blade.material_override = ProtoWorldBuilder.material(Color(0.92, 0.9, 0.82), 0.2, true)
	blade.position = Vector3(0, 0, -reach / 2.0)
	root.add_child(blade)
	var aim_yaw := atan2(-aim_dir.x, -aim_dir.z)
	var half := deg_to_rad(arc_deg) / 2.0
	# Local yaw so the WORLD direction matches the aim (root rides the swinger).
	root.rotation.y = (aim_yaw - swinger.global_rotation.y) + half
	var tw := root.create_tween()
	tw.tween_property(root, "rotation:y", root.rotation.y - half * 2.0, 0.13).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	tw.parallel().tween_property(blade, "transparency", 0.85, 0.13)
	tw.tween_callback(root.queue_free)


## Kill payoff: a skull that pops off the fallen.
static func skull(parent: Node, pos: Vector3) -> void:
	var lbl := Label3D.new()
	lbl.text = "💀"
	lbl.font_size = 200
	lbl.pixel_size = 0.004
	lbl.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	lbl.add_to_group("fx_skull")
	parent.add_child(lbl)
	lbl.global_position = pos + Vector3(0, 1.6, 0)
	var tw := lbl.create_tween()
	tw.tween_property(lbl, "global_position", pos + Vector3(0, 2.8, 0), 0.7).set_ease(Tween.EASE_OUT)
	tw.parallel().tween_property(lbl, "modulate:a", 0.0, 0.7)
	tw.tween_callback(lbl.queue_free)
