## CAMP MODE (RV_PLAN rungs 3-4): park the Homestead anywhere flat and LIVE in
## it. A camp kit rides every `camper` rig — E deploys the awning: a BED (the
## home's own — sleep to dawn), a STOVE (meat → a hot camp meal, the first
## craft-on-the-road), and a lamp. Drive off and it all stows itself. The 60×
## map stops being a distance and becomes a lifestyle.
class_name ProtoCamp
extends StaticBody3D

var rv: ProtoCar3D = null
var _main: Node = null
var deployed: bool = false
var _gear: Node3D = null
var _bed: Node = null
var _stove: Node = null


static func create(main: Node, rv_in: ProtoCar3D) -> ProtoCamp:
	var c := ProtoCamp.new()
	c._main = main
	c.rv = rv_in
	c.add_to_group("interactable")
	var m := MeshInstance3D.new()
	var bm := BoxMesh.new()
	bm.size = Vector3(0.6, 0.5, 0.4)
	m.mesh = bm
	m.material_override = ProtoWorldBuilder.material(Color(0.55, 0.45, 0.25), 0.7)
	m.position.y = 0.25
	c.add_child(m)
	var shape := CollisionShape3D.new()
	var bs := BoxShape3D.new()
	bs.size = Vector3(0.7, 0.6, 0.5)
	shape.shape = bs
	shape.position.y = 0.3
	c.add_child(shape)
	return c


func interact_position() -> Vector3:
	return global_position


func interact_prompt(_m: Node) -> String:
	return "E — 🏕 STRIKE camp (or just drive off)" if deployed else "E — 🏕 MAKE CAMP (bed · stove · light)"


func interact(main: Node) -> void:
	if deployed:
		_stow(main, true)
	else:
		_deploy(main)


func _deploy(main: Node) -> void:
	deployed = true
	_gear = Node3D.new()
	main.add_child(_gear)
	var side := rv.global_basis.x # camp on the door side
	var base := rv.global_position + side * 4.0
	# The awning + lamp — a warm point in the dark (howlers respect light).
	var awning := MeshInstance3D.new()
	var am := BoxMesh.new()
	am.size = Vector3(4.0, 0.1, 3.0)
	awning.mesh = am
	awning.material_override = ProtoWorldBuilder.material(Color(0.5, 0.38, 0.22), 0.8)
	_gear.add_child(awning)
	awning.global_position = base + Vector3(0, 2.2, 0)
	var lamp := OmniLight3D.new()
	lamp.light_color = Color(1.0, 0.85, 0.6)
	lamp.light_energy = 1.6
	lamp.omni_range = 9.0
	_gear.add_child(lamp)
	lamp.global_position = base + Vector3(0, 2.0, 0)
	# THE BED — the home's own class, reused verbatim (sleep to dawn).
	_bed = ProtoHomebase.Bed.new()
	main.add_child(_bed)
	_bed.global_position = base + Vector3(-1.2, 0, 0.8)
	# THE STOVE — meat in, a hot meal out.
	_stove = Stove.new()
	main.add_child(_stove)
	_stove.global_position = base + Vector3(1.2, 0, -0.6)
	main.audio.play_ui("thunk", -8.0)
	main.notify("🏕 Camp's UP — bed, stove, a light against the dark. Drive off to stow it.")


func _stow(main: Node, spoken: bool) -> void:
	deployed = false
	for n in [_gear, _bed, _stove]:
		if n != null and is_instance_valid(n):
			n.queue_free()
	_gear = null
	_bed = null
	_stove = null
	if spoken:
		main.notify("🏕 Camp struck — everything back in the Homestead")


func _physics_process(_delta: float) -> void:
	if rv == null or not is_instance_valid(rv) or rv.dead:
		queue_free()
		return
	# The kit rides the rig; a MOVING rig stows the camp itself.
	global_position = rv.global_position - rv.global_basis.z * -3.2 + rv.global_basis.x * 1.6
	global_position.y = rv.global_position.y - 0.4
	if deployed and absf(rv.forward_speed) > 2.0:
		_stow(_main, false)
		_main.notify("🏕 The camp stows itself as the Homestead rolls out")


## The STOVE — the road's first crafting station: 1 meat → 1 hot camp meal.
class Stove:
	extends StaticBody3D

	func _ready() -> void:
		add_to_group("interactable")
		var m := MeshInstance3D.new()
		var bm := BoxMesh.new()
		bm.size = Vector3(0.8, 0.7, 0.6)
		m.mesh = bm
		m.material_override = ProtoWorldBuilder.material(Color(0.3, 0.3, 0.32), 0.6)
		m.position.y = 0.35
		add_child(m)
		var shape := CollisionShape3D.new()
		var bs := BoxShape3D.new()
		bs.size = Vector3(0.9, 0.8, 0.7)
		shape.shape = bs
		shape.position.y = 0.4
		add_child(shape)

	func interact_position() -> Vector3:
		return global_position

	func interact_prompt(main: Node) -> String:
		if main.backpack.count("meat") <= 0:
			return "🍳 STOVE — bring meat to cook"
		return "E — 🍳 COOK (1 meat → hot camp meal)"

	func interact(main: Node) -> void:
		if not main.backpack.remove("meat", 1):
			main.notify("🍳 Nothing to cook — the pack's out of meat")
			return
		main.backpack.add("cooked_meal", 1)
		main.audio.play_ui("click", -8.0)
		if main.has_method("grant_xp"):
			main.grant_xp("scavenging", 1.0)
		main.notify("🍳 The stove does its work — a HOT MEAL rides in your pack now")
