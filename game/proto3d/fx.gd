## Combat FX (the juice layer): every hit, swing, and shot gets ANSWERED on
## screen. All effects are fire-and-forget (self-freeing tweens/particles),
## cost nothing when idle, and tag themselves into "fx_*" groups so sims can
## prove the juice exists without rendering a single pixel.
class_name ProtoFX
extends RefCounted


## THE SOFT PUFF (fidelity loop it.4): one shared billboarded smoke sprite — a
## radial-gradient disc generated once at runtime (no asset on disk), tinted by
## each emitter's own color/ramp via vertex color. Every gray-box particle
## system upgrades through this pair instead of rolling its own.
static var _puff_tex: ImageTexture = null

static func puff_texture() -> ImageTexture:
	if _puff_tex == null:
		var n := 64
		var img := Image.create(n, n, false, Image.FORMAT_RGBA8)
		for y in n:
			for x in n:
				var d := Vector2(x - n / 2.0 + 0.5, y - n / 2.0 + 0.5).length() / (n / 2.0)
				var a := clampf(1.0 - d, 0.0, 1.0)
				a = a * a * (3.0 - 2.0 * a) * 0.85 # smoothstep falloff, core capped —
				# even a fresh dense puff stays translucent (opaque cores read as balls)
				img.set_pixel(x, y, Color(1, 1, 1, a))
		_puff_tex = ImageTexture.create_from_image(img)
	return _puff_tex


static func puff_material() -> StandardMaterial3D:
	var mat := StandardMaterial3D.new()
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	# Tint via the MATERIAL's albedo_color (per emitter), NEVER per-instance
	# vertex color: with CPUParticles3D the instance-color path rendered one
	# zero-data instance as a PURE-BLACK disc pinned at the emitter — probed at
	# (0.00, 0.00, 0.00) and immune to ramp/amount/billboard-mode changes.
	mat.vertex_color_use_as_albedo = false
	mat.albedo_texture = puff_texture()
	mat.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
	return mat


## Muzzle flash: a hot emissive blade + a light blink at the muzzle. ~70 ms.
static func muzzle_flash(parent: Node, pos: Vector3, dir: Vector3) -> void:
	var m := MeshInstance3D.new()
	var box := BoxMesh.new()
	box.size = Vector3(0.16, 0.16, 0.5)
	m.mesh = box
	m.material_override = ProtoWorldBuilder.material(Color(1.0, 0.82, 0.35), 0.1, true)
	m.add_to_group("fx_flash")
	parent.add_child(m)
	m.global_position = pos + dir * 0.3
	if dir.length_squared() > 0.01:
		m.look_at(pos + dir * 2.0, Vector3.UP)
	var light := OmniLight3D.new()
	light.light_color = Color(1.0, 0.75, 0.3)
	light.light_energy = 2.4
	light.omni_range = 4.0
	m.add_child(light)
	# The HOT CORE: a soft glow disc at the muzzle behind the blade (the shared
	# puff sprite, billboarded) — the flash reads round-and-hot, not boxy.
	var core := MeshInstance3D.new()
	var cq := QuadMesh.new()
	cq.size = Vector2(0.55, 0.55)
	var cmat := puff_material()
	cmat.albedo_color = Color(1.0, 0.86, 0.42, 0.95)
	cq.material = cmat
	core.mesh = cq
	m.add_child(core)
	core.position = Vector3(0, 0, 0.1)
	var tw := m.create_tween()
	tw.tween_property(m, "scale", Vector3(0.4, 0.4, 1.3), 0.07)
	tw.parallel().tween_property(light, "light_energy", 0.0, 0.07)
	tw.tween_callback(m.queue_free)


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


## Blood on flesh hits — dark soft droplets that burst, shrink and fall (the
## puff sprite tinted on ITS OWN material — the black-ball law, never p.color).
static func blood(parent: Node, pos: Vector3) -> void:
	var p := CPUParticles3D.new()
	p.one_shot = true
	p.emitting = true
	p.amount = 12
	p.lifetime = 0.45
	p.explosiveness = 1.0
	var quad := QuadMesh.new()
	quad.size = Vector2(0.30, 0.30)
	var mat := puff_material()
	mat.albedo_color = Color(0.42, 0.05, 0.04, 0.9)
	quad.material = mat
	p.mesh = quad
	var shrink := Curve.new()
	shrink.add_point(Vector2(0.0, 1.0))
	shrink.add_point(Vector2(1.0, 0.45))
	p.scale_amount_curve = shrink # droplets thin as they fly
	p.direction = Vector3(0, 1, 0)
	p.spread = 70.0
	p.initial_velocity_min = 1.6
	p.initial_velocity_max = 3.4
	p.gravity = Vector3(0, -14.0, 0)
	p.add_to_group("fx_blood")
	parent.add_child(p)
	p.global_position = pos
	var tw := p.create_tween()
	tw.tween_interval(0.8)
	tw.tween_callback(p.queue_free)


## Impact where a round meets the WORLD (walls, ground, wrecks): a soft DUST
## kick + a pinch of hot SPARKS — misses and cover hits read instantly. Pass the
## surface `normal` to also leave THE MARK (it.13): a dark pock that lingers ~9 s
## and fades — the wall remembers the firefight. ZERO normal = burst only
## (cars/companions keep their old read).
static func impact(parent: Node, pos: Vector3, normal: Vector3 = Vector3.ZERO) -> void:
	if normal.length_squared() > 0.01:
		var mark := MeshInstance3D.new()
		var mq := QuadMesh.new()
		mq.size = Vector2(0.32, 0.32)
		var mm := puff_material()
		mm.billboard_mode = BaseMaterial3D.BILLBOARD_DISABLED # it lies ON the surface
		mm.albedo_color = Color(0.06, 0.055, 0.05, 0.62)
		mq.material = mm
		mark.mesh = mq
		mark.add_to_group("fx_mark")
		parent.add_child(mark)
		var n := normal.normalized()
		var up := Vector3.UP if absf(n.dot(Vector3.UP)) < 0.9 else Vector3.FORWARD
		mark.look_at_from_position(pos + n * 0.03, pos - n, up) # quad face OUT along n
		mark.rotate_object_local(Vector3(0, 0, 1), randf() * TAU) # break repetition
		var mtw := mark.create_tween()
		mtw.tween_interval(9.0)
		mtw.tween_property(mark, "transparency", 1.0, 4.0)
		mtw.tween_callback(mark.queue_free)
	var p := CPUParticles3D.new()
	p.one_shot = true
	p.emitting = true
	p.amount = 8
	p.lifetime = 0.4
	p.explosiveness = 1.0
	var quad := QuadMesh.new()
	quad.size = Vector2(0.26, 0.26)
	var mat := puff_material()
	mat.albedo_color = Color(0.72, 0.65, 0.50, 0.75)
	quad.material = mat
	p.mesh = quad
	var grow := Curve.new()
	grow.add_point(Vector2(0.0, 0.5))
	grow.add_point(Vector2(1.0, 1.5))
	p.scale_amount_curve = grow # dust blooms outward
	p.direction = Vector3(0, 1, 0)
	p.spread = 80.0
	p.initial_velocity_min = 1.0
	p.initial_velocity_max = 2.2
	p.gravity = Vector3(0, -3.5, 0)
	p.add_to_group("fx_impact")
	parent.add_child(p)
	p.global_position = pos
	var tw := p.create_tween()
	tw.tween_interval(0.8)
	tw.tween_callback(p.queue_free)
	# The sparks: a pinch of hot emissive chips that die fast under gravity.
	var s := CPUParticles3D.new()
	s.one_shot = true
	s.emitting = true
	s.amount = 5
	s.lifetime = 0.22
	s.explosiveness = 1.0
	s.mesh = BoxMesh.new()
	(s.mesh as BoxMesh).size = Vector3(0.035, 0.035, 0.035)
	(s.mesh as BoxMesh).material = ProtoWorldBuilder.material(Color(1.0, 0.8, 0.35), 0.1, true)
	s.direction = Vector3(0, 1, 0)
	s.spread = 75.0
	s.initial_velocity_min = 2.4
	s.initial_velocity_max = 4.2
	s.gravity = Vector3(0, -18.0, 0)
	s.add_to_group("fx_impact")
	parent.add_child(s)
	s.global_position = pos
	var tw2 := s.create_tween()
	tw2.tween_interval(0.6)
	tw2.tween_callback(s.queue_free)


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
