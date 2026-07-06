## THE HOME BASE (goal: the safehouse + metaworld ARE the base game). Upgrades
## are DATA ROWS bought at the BUILD BOARD with the wasteland's raw material —
## scrap finally has its sink. Every effect rides a system that already exists:
## the crew's game-hour tick (garage/kennel), the T-wait clock (bed), the item
## catalog (workbench), and the metaworld's raid rolls (walls).
class_name ProtoHomebase
extends StaticBody3D

const HOME := Vector3(112.0, 0.0, -320.0)
const HOME_R := 30.0
const TICK_HOURS := 0.5

## The ladder — bought in order; each rung makes the next one make sense.
const UPGRADES: Array = [
	{"id": "walls1", "name": "WALLS I", "cost": {"scrap": 6, "jack": 10}, "desc": "raiders think twice"},
	{"id": "garage", "name": "GARAGE", "cost": {"scrap": 8, "jack": 15, "car_parts": 1}, "desc": "parked rigs self-repair"},
	{"id": "kennel", "name": "KENNEL UPGRADE", "cost": {"scrap": 6, "jack": 10}, "desc": "home dogs heal — raids can't take them"},
	{"id": "workbench", "name": "WORKBENCH", "cost": {"scrap": 10, "jack": 20}, "desc": "craft bandages, ammo, power cells"},
	{"id": "bed", "name": "BED", "cost": {"scrap": 4, "jack": 8}, "desc": "sleep to dawn, drop the day's weight"},
	{"id": "walls2", "name": "WALLS II", "cost": {"scrap": 12, "jack": 20}, "desc": "raiders need a reason"},
	{"id": "walls3", "name": "WALLS III", "cost": {"scrap": 20, "jack": 35}, "desc": "raiders go elsewhere"},
]
## The workbench recipes — first affordable crafts (E again for the next).
const RECIPES: Array = [
	{"makes": "bandage", "count": 1, "cost": {"scrap": 2}},
	{"makes": "9mm", "count": 10, "cost": {"scrap": 3}},
	{"makes": "power_cell", "count": 1, "cost": {"scrap": 8, "jack": 5}},
]

var owned: Dictionary = {} ## id -> true
var _main: Node = null
var _last_hour: float = -1.0
var _walls_node: Node3D = null


static func create(main: Node) -> ProtoHomebase:
	var h := ProtoHomebase.new()
	h._main = main
	h.add_to_group("interactable")
	h.position = HOME + Vector3(-8.0, 0.0, 2.0) # the board by the safehouse door
	var post := MeshInstance3D.new()
	var pm := BoxMesh.new()
	pm.size = Vector3(0.18, 1.6, 0.18)
	post.mesh = pm
	post.material_override = ProtoWorldBuilder.material(Color(0.4, 0.32, 0.2), 0.85)
	post.position.y = 0.8
	h.add_child(post)
	var board := MeshInstance3D.new()
	var bm := BoxMesh.new()
	bm.size = Vector3(1.4, 0.9, 0.08)
	board.mesh = bm
	board.material_override = ProtoWorldBuilder.material(Color(0.5, 0.42, 0.26), 0.7)
	board.position.y = 1.5
	h.add_child(board)
	var shape := CollisionShape3D.new()
	var bs := BoxShape3D.new()
	bs.size = Vector3(1.4, 2.0, 0.4)
	shape.shape = bs
	shape.position.y = 1.0
	h.add_child(shape)
	return h


func walls_tier() -> int:
	return 3 if owned.has("walls3") else (2 if owned.has("walls2") else (1 if owned.has("walls1") else 0))


func _next_upgrade() -> Dictionary:
	for u in UPGRADES:
		if not owned.has(u["id"]):
			return u
	return {}


func _cost_text(cost: Dictionary) -> String:
	var parts: Array = []
	for k in cost:
		parts.append("%d %s" % [cost[k], k])
	return " + ".join(parts)


func _can_afford(cost: Dictionary) -> bool:
	for k in cost:
		if _main.backpack.count(k) < cost[k]:
			return false
	return true


func _pay(cost: Dictionary) -> void:
	for k in cost:
		_main.backpack.remove(k, cost[k])


func interact_position() -> Vector3:
	return global_position


func interact_prompt(_m: Node) -> String:
	var u := _next_upgrade()
	if u.is_empty():
		return "🏠 HOME — fully built (walls %d)" % walls_tier()
	return "E — BUILD %s (%s) — %s" % [u["name"], _cost_text(u["cost"]), u["desc"]]


func interact(main: Node) -> void:
	var u := _next_upgrade()
	if u.is_empty():
		main.notify("🏠 The place is BUILT. It'll outlast you.")
		return
	if not _can_afford(u["cost"]):
		main.notify("🔩 %s wants %s — the wasteland's raw material is out there" % [u["name"], _cost_text(u["cost"])])
		return
	_pay(u["cost"])
	owned[u["id"]] = true
	main.audio.play_ui("thunk", -6.0)
	main.notify("🏠 %s BUILT — %s" % [u["name"], u["desc"]])
	match String(u["id"]):
		"walls1", "walls2", "walls3":
			_raise_walls()
		"workbench":
			var wb := Workbench.new()
			wb.home = self
			main.add_child(wb)
			wb.global_position = HOME + Vector3(-4.0, 0.0, 4.0)
		"bed":
			var bed := Bed.new()
			bed.home = self
			main.add_child(bed)
			bed.global_position = HOME + Vector3(-3.5, 0.0, -4.0)


## Walls you can SEE: a ring of posts that thickens with each tier.
func _raise_walls() -> void:
	if _walls_node != null:
		_walls_node.queue_free()
	_walls_node = Node3D.new()
	_main.add_child(_walls_node)
	var tier := walls_tier()
	var n := 10 + tier * 4
	for i in n:
		var ang := TAU * float(i) / float(n)
		var seg := MeshInstance3D.new()
		var sm := BoxMesh.new()
		sm.size = Vector3(2.6, 0.8 + 0.5 * tier, 0.3)
		seg.mesh = sm
		seg.material_override = ProtoWorldBuilder.material(Color(0.36, 0.30, 0.22), 0.85)
		seg.position = HOME + Vector3(cos(ang), 0, sin(ang)) * (HOME_R - 4.0) + Vector3(0, (0.8 + 0.5 * tier) * 0.5, 0)
		seg.rotation.y = -ang
		_walls_node.add_child(seg)


## The hour tick (the crew's law): the base EARNS while the clock turns.
func _physics_process(_delta: float) -> void:
	if _main == null or not ("daynight" in _main) or _main.daynight == null:
		return
	var hr: float = _main.daynight.hour + float(_main.daynight.day) * 24.0
	if _last_hour < 0.0:
		_last_hour = hr
		return
	if hr - _last_hour < TICK_HOURS:
		return
	_last_hour = hr
	if owned.has("garage"):
		for car in _main.cars:
			if car is ProtoCar3D and is_instance_valid(car) and not car.dead \
					and not car.is_active and car.global_position.distance_to(HOME) < HOME_R:
				var worst: Damageable = null
				for k in car.components:
					if worst == null or car.components[k].ratio() < worst.ratio():
						worst = car.components[k]
				if worst != null and worst.ratio() < 1.0:
					worst.restore(8.0)
	if owned.has("kennel"):
		for node in get_tree().get_nodes_in_group("proto_dog"):
			var d := node as ProtoDog
			if d != null and is_instance_valid(d) and not d.downed and d.hp < d.max_hp \
					and d.global_position.distance_to(HOME) < HOME_R:
				d.hp = minf(d.max_hp, d.hp + 5.0)


## The WORKBENCH — E crafts the first recipe you can afford (scrap's sink).
class Workbench:
	extends StaticBody3D
	var home: ProtoHomebase = null

	func _ready() -> void:
		add_to_group("interactable")
		var m := MeshInstance3D.new()
		var bm := BoxMesh.new()
		bm.size = Vector3(1.8, 0.9, 0.8)
		m.mesh = bm
		m.material_override = ProtoWorldBuilder.material(Color(0.44, 0.36, 0.24), 0.75)
		m.position.y = 0.45
		add_child(m)
		var shape := CollisionShape3D.new()
		var bs := BoxShape3D.new()
		bs.size = Vector3(1.8, 1.0, 0.8)
		shape.shape = bs
		shape.position.y = 0.5
		add_child(shape)

	func interact_position() -> Vector3:
		return global_position

	func _affordable(main: Node) -> Dictionary:
		for r in ProtoHomebase.RECIPES:
			var ok := true
			for k in r["cost"]:
				if main.backpack.count(k) < r["cost"][k]:
					ok = false
			if ok:
				return r
		return {}

	func interact_prompt(main: Node) -> String:
		var r := _affordable(main)
		if r.is_empty():
			return "🛠 WORKBENCH — bring scrap (bandage 2 · 9mm×10 3 · power cell 8+5j)"
		return "E — CRAFT %s ×%d (%s)" % [String(r["makes"]), int(r["count"]), home._cost_text(r["cost"])]

	func interact(main: Node) -> void:
		var r := _affordable(main)
		if r.is_empty():
			main.notify("🛠 Nothing to work with — scrap is the wasteland's raw material")
			return
		home._pay(r["cost"])
		main.backpack.add(String(r["makes"]), int(r["count"]))
		main.audio.play_ui("click", -6.0)
		main.notify("🛠 Crafted %s ×%d" % [String(r["makes"]), int(r["count"])])


## The BED — sleep to dawn: the T-wait clock, made comfortable.
class Bed:
	extends StaticBody3D
	var home: ProtoHomebase = null

	func _ready() -> void:
		add_to_group("interactable")
		var m := MeshInstance3D.new()
		var bm := BoxMesh.new()
		bm.size = Vector3(1.0, 0.4, 2.1)
		m.mesh = bm
		m.material_override = ProtoWorldBuilder.material(Color(0.5, 0.44, 0.34), 0.7)
		m.position.y = 0.2
		add_child(m)
		var shape := CollisionShape3D.new()
		var bs := BoxShape3D.new()
		bs.size = Vector3(1.0, 0.5, 2.1)
		shape.shape = bs
		shape.position.y = 0.25
		add_child(shape)

	func interact_position() -> Vector3:
		return global_position

	func interact_prompt(_m: Node) -> String:
		return "E — SLEEP to dawn (stress falls off, the body knits)"

	func interact(main: Node) -> void:
		var dn: ProtoDayNight = main.daynight
		if dn.hour >= 6.0:
			dn.day += 1
		dn.hour = 6.0
		main.stress = maxf(0.0, main.stress - 30.0)
		main.character.treat(main.character.worst_part(), 10.0)
		main.audio.play_ui("blip", -8.0, 0.7)
		main.notify("🛏 You sleep. Dawn, day %d — the weight is lighter." % dn.day)
