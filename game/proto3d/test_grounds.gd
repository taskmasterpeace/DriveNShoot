## ⚒ THE TEST GROUNDS (owner directive 2026-07-07 night: "rebuild the starting
## location — I need EVERYTHING there for me to test, lay it out, name it useful").
## A labeled fairground on the safehouse's south field: every drivable rig in a
## MOTOR POOL row, the whole ARMORY, a stocked SUPPLY DEPOT, a firing RANGE with
## self-healing dummies, a STABLE with a saddled horse, a fenced GATOR PEN, a
## Hunter DIG spot, and direction signs to everything that can't be moved here
## (I-95's traffic/convoys, the drive-in, Meridian's market). One walk tries
## the whole game. Inside the AUTHORED rect, so streaming leaves it alone.
class_name ProtoTestGrounds
extends Node3D

const ORIGIN := Vector3(110.0, 0.0, 150.0) ## the grounds' center (waypoint target)
const GROUNDS_RECT := Rect2(30.0, 80.0, 180.0, 270.0) ## x,z,w,d — the sim asserts inside this

var horse: ProtoHorse = null
var gator: ProtoGator = null
var dig_spot: ProtoBuriedCache = null
var range_targets: Array = []
var pool_cars: Array = []


## A RANGE DUMMY: shootable, meleeable (combatant group — the melee union), and
## SELF-HEALING so the range never wears out. Flashes on the hit.
class RangeTarget extends StaticBody3D:
	var hp: float = 60.0
	var dead: bool = false ## scanners ask; a dummy never dies, it resets
	var _box: MeshInstance3D = null
	var _flash_t: float = 0.0
	func _init(dist_label: String) -> void:
		add_to_group("combatant")
		_box = MeshInstance3D.new()
		var bm := BoxMesh.new()
		bm.size = Vector3(0.9, 1.8, 0.25)
		_box.mesh = bm
		_box.material_override = ProtoWorldBuilder.material(Color(0.75, 0.62, 0.18), 0.9)
		_box.position.y = 0.9
		add_child(_box)
		var shape := CollisionShape3D.new()
		var bs := BoxShape3D.new()
		bs.size = Vector3(0.9, 1.8, 0.25)
		shape.shape = bs
		shape.position.y = 0.9
		add_child(shape)
		var l := Label3D.new()
		l.text = dist_label
		l.font_size = 44
		l.billboard = BaseMaterial3D.BILLBOARD_ENABLED
		l.position.y = 2.2
		add_child(l)
	func take_damage(amount: float) -> void:
		hp -= amount
		_flash_t = 0.15
		if _box:
			_box.material_override = ProtoWorldBuilder.material(Color(0.95, 0.3, 0.2), 0.9)
		if hp <= 0.0:
			hp = 60.0 # the range never wears out
	func _process(delta: float) -> void:
		if _flash_t > 0.0:
			_flash_t -= delta
			if _flash_t <= 0.0 and _box:
				_box.material_override = ProtoWorldBuilder.material(Color(0.75, 0.62, 0.18), 0.9)


static func create(main: Node) -> ProtoTestGrounds:
	var g := ProtoTestGrounds.new()
	g.name = "TestGrounds"

	# --- The pad: a concrete apron so the grounds READ as a place ---------------
	ProtoWorldBuilder.box_visual(g, Vector3(GROUNDS_RECT.size.x, 0.04, GROUNDS_RECT.size.y),
		Vector3(GROUNDS_RECT.position.x + GROUNDS_RECT.size.x * 0.5, 0.05,
			GROUNDS_RECT.position.y + GROUNDS_RECT.size.y * 0.5), Color(0.34, 0.33, 0.31))
	g._sign(Vector3(110, 0, 92), "⚒ TEST GROUNDS", 96)
	g._sign(Vector3(110, 0, 104),
		"→ I-95: TRAFFIC + CONVOYS (east, past the ramp)\n← SAFEHOUSE: TV·BED·DRONE DOCK·BUILD BOARD\n↑ MERIDIAN: MARKET·CREW·PUBLIC SCREEN·DRIVE-IN", 28)

	# --- 🚗 MOTOR POOL: one of EVERY drivable rig, keys in it --------------------
	g._sign(Vector3(115, 0, 118), "🚗 MOTOR POOL — one of everything", 44)
	var fleet: Array = ["scavenger", "motorcycle", "buggy", "pickup", "van", "semi", "pickup_truck", "rv", "suv"]
	for i in fleet.size():
		var car := ProtoCar3D.create(fleet[i], Color(0.38 + 0.05 * (i % 3), 0.4, 0.44))
		g.add_child(car)
		car.position = Vector3(48.0 + i * 16.0, 1.0, 130.0)
		car.rotation.y = PI # noses at the walker
		g._sign(Vector3(48.0 + i * 16.0, 0, 122.0), car.display_name if "display_name" in car else String(fleet[i]).to_upper(), 24)
		g.pool_cars.append(car)
		if "cars" in main:
			main.cars.append(car)

	# --- 🔫 THE ARMORY: every weapon row + the ammo to feed it -------------------
	g._sign(Vector3(48, 0, 158), "🔫 ARMORY", 44)
	var guns := ProtoChest.create("ARMORY — guns", {"pistol": 1, "shotgun": 1, "pipe_rocket": 1, "9mm": 240, "12ga": 60, "rocket": 12})
	g.add_child(guns)
	guns.position = Vector3(44, 0.4, 164)
	var steel := ProtoChest.create("ARMORY — steel", {"wrench": 1, "machete": 1, "axe": 1, "bat": 1})
	g.add_child(steel)
	steel.position = Vector3(50, 0.4, 164)
	var ordnance := ProtoChest.create("ARMORY — ordnance", {"grenade": 8, "mine": 4, "flare": 6})
	g.add_child(ordnance)
	ordnance.position = Vector3(56, 0.4, 164)

	# --- 🧰 SUPPLY DEPOT: food/meds/repair/fuel/scrip/gadgets --------------------
	g._sign(Vector3(48, 0, 184), "🧰 SUPPLY DEPOT", 44)
	var supply := ProtoChest.create("SUPPLY — the lot", {
		"bandage": 10, "medkit": 4, "painkillers": 6,
		"meat": 12, "canned_food": 8, "water": 8, "coffee": 4, "whiskey": 3, "cooked_meal": 2,
		"jerry_can": 4, "car_parts": 6, "tire_kit": 4, "duct_tape": 6,
		"scrap": 60, "scrip": 300,
		"drone": 1, "power_cell": 4, "targeting_core": 1, "mount_schematic": 1,
		"eyepatch": 1, "map_fragment": 2, "dog_collar": 1,
	})
	g.add_child(supply)
	supply.position = Vector3(48, 0.4, 190)

	# --- 🎯 THE RANGE: self-healing dummies at read distances --------------------
	g._sign(Vector3(100, 0, 160), "🎯 RANGE — fire NORTH from this line", 40)
	ProtoWorldBuilder.box_visual(g, Vector3(30, 0.05, 0.5), Vector3(112, 0.09, 162), Color(0.85, 0.82, 0.70))
	for d in [10.0, 20.0, 30.0, 42.0]:
		var t := RangeTarget.new("%dm" % int(d))
		g.add_child(t)
		t.position = Vector3(100.0 + d * 0.45, 0, 162.0 - d) # a spread fan, all north of the line
		g.range_targets.append(t)

	# --- 🐴 THE STABLE: E mounts, WASD rides, fire from the saddle ---------------
	g._sign(Vector3(168, 0, 150), "🐴 STABLE — E to mount", 44)
	g.horse = ProtoHorse.create()
	g.add_child(g.horse)
	g.horse.position = Vector3(168, 0.3, 158)
	for rail_z in [153.0, 163.0]:
		ProtoWorldBuilder.box_body(g, Vector3(12, 0.9, 0.3), Vector3(168, 0.45, rail_z), Color(0.4, 0.3, 0.18))

	# --- 🐊 THE GATOR PEN: linger inside and learn (walled — it can't leave) -----
	g._sign(Vector3(170, 0, 252), "🐊 GATOR PEN — it counts to 2. don't linger", 40)
	ProtoWorldBuilder.box_visual(g, Vector3(16, 0.03, 16), Vector3(170, 0.06, 266), Color(0.14, 0.22, 0.20)) # the black water
	for w in [[Vector3(16.6, 1.2, 0.4), Vector3(170, 0.6, 258.0)], [Vector3(16.6, 1.2, 0.4), Vector3(170, 0.6, 274.0)],
			[Vector3(0.4, 1.2, 16.6), Vector3(162.0, 0.6, 266)], [Vector3(0.4, 1.2, 16.6), Vector3(178.0, 0.6, 266)]]:
		ProtoWorldBuilder.box_body(g, w[0], w[1], Color(0.44, 0.43, 0.41))
	g.gator = ProtoGator.create()
	g.add_child(g.gator)
	g.gator.position = Vector3(170, 0.15, 266)

	# --- 🦴 THE DIG SPOT: bring a Hunter dog, whistle SEEK ------------------------
	g._sign(Vector3(70, 0, 220), "🦴 HUNTER DIG SPOT — a dog smells it", 36)
	g.dig_spot = ProtoBuriedCache.create()
	g.add_child(g.dig_spot)
	g.dig_spot.position = Vector3(70, 0, 226)

	# (The ⚒ TEST GROUNDS waypoint rides the boot literal in proto3d.gd — N finds it.)
	return g


func _sign(at: Vector3, text: String, size: int) -> void:
	var post := MeshInstance3D.new()
	var pm := BoxMesh.new()
	pm.size = Vector3(0.18, 2.6, 0.18)
	post.mesh = pm
	post.material_override = ProtoWorldBuilder.material(Color(0.35, 0.3, 0.22), 0.9)
	post.position = at + Vector3(0, 1.3, 0)
	add_child(post)
	var l := Label3D.new()
	l.text = text
	l.font_size = size
	l.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	l.modulate = Color(1.0, 0.85, 0.4)
	l.outline_size = 8
	l.position = at + Vector3(0, 2.9, 0)
	add_child(l)
