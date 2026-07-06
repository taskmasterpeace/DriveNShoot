## THE CAROUSEL (docs/CAROUSEL.md, rungs 1-3) — earned fast-travel as the
## meta-game. Gate rings under military bases, loaded from data/carousel.json
## (bases are ROWS). A dormant gate wants its OBJECTIVE (this slice: haul POWER —
## jerry cans into the socket), then survives the SPIN-UP (loud: the pack comes),
## then it's YOURS forever. Jumps take FLESH, NOT STEEL: you, your pack, your
## dog — never your rig. Cells per jump, stress on arrival. THE PAIR tier:
## active nodes link in ring order.
class_name ProtoCarousel
extends Node

const PATH := "res://data/carousel.json"

var _main: Node = null
var data: Dictionary = {}
var gates: Dictionary = {} ## base_id -> ProtoGate
var active: Dictionary = {} ## base_id -> true (session persistence; saves later)


static func create(main: Node) -> ProtoCarousel:
	var c := ProtoCarousel.new()
	c._main = main
	c._load()
	return c


func _load() -> void:
	if not FileAccess.file_exists(PATH):
		push_warning("carousel: no %s" % PATH)
		return
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(PATH))
	if parsed is Dictionary:
		data = parsed


func _ready() -> void:
	for b in data.get("bases", []):
		var g := ProtoGate.create(self, b)
		_main.add_child.call_deferred(g)
		gates[b["id"]] = g


func base_row(id: String) -> Dictionary:
	for b in data.get("bases", []):
		if b["id"] == id:
			return b
	return {}


func set_active(id: String) -> void: # sims/dev stage with this; gameplay earns it
	active[id] = true
	if gates.has(id):
		gates[id].state = "active"
		gates[id].refresh_visual()


## THE PAIR: the next ACTIVE node after `from_id` in ring order (wraps).
func next_active(from_id: String) -> String:
	var ring: Array = data.get("ring_order", [])
	var i := ring.find(from_id)
	if i < 0:
		return ""
	for step in range(1, ring.size()):
		var cand: String = ring[(i + step) % ring.size()]
		if active.get(cand, false):
			return cand
	return ""


## The JUMP: flesh, not steel. Costs cells, lands with jump sickness. The car —
## and everything in its trunk — stays exactly where you left it.
func jump(from_id: String) -> bool:
	var to_id := next_active(from_id)
	if to_id == "":
		_main.notify("🎠 The ring needs a SECOND door — light another base")
		return false
	var jr: Dictionary = data.get("jump", {})
	var cell: String = jr.get("cell_item", "power_cell")
	var need: int = int(jr.get("cells_per_jump", 1))
	if _main.backpack.count(cell) < need:
		_main.notify("🎠 The gate wants %d power cell%s — it doesn't run on hope" % [need, "s" if need > 1 else ""])
		return false
	_main.backpack.remove(cell, need)
	var dest: Dictionary = base_row(to_id)
	var p: Array = dest["pos"]
	_main.player.global_position = Vector3(float(p[0]) + 4.0, 0.5, float(p[1]) + 4.0)
	_main.player.velocity = Vector3.ZERO
	_main.stress = minf(100.0, _main.stress + float(jr.get("sickness_stress", 25)))
	_main.audio.play_ui("blip", -2.0, 0.6)
	_main.notify("🎠 The ring SPINS — %s. Your rig is three states behind you." % dest["name"])
	return true


## One gate station in the world: platform, ring, terminal. An interactable with
## a tiny state machine: dormant → (power objective) → SPIN-UP defense → active.
class ProtoGate:
	extends StaticBody3D

	var carousel: ProtoCarousel = null
	var row: Dictionary = {}
	var state: String = "dormant" ## dormant | spinup | active
	var fed: int = 0              ## jerry cans socketed so far
	var _spin_t: float = 0.0
	var _waves_left: int = 0
	var _ring: MeshInstance3D = null

	static func create(c: ProtoCarousel, row_in: Dictionary) -> ProtoGate:
		var g := ProtoGate.new()
		g.carousel = c
		g.row = row_in
		g.add_to_group("interactable")
		g.add_to_group("carousel_gate")
		var p: Array = row_in["pos"]
		g.position = Vector3(float(p[0]), 0.0, float(p[1]))
		# platform + the RING (a torus on its side) + terminal
		var plat := MeshInstance3D.new()
		var pm := BoxMesh.new()
		pm.size = Vector3(10, 0.4, 10)
		plat.mesh = pm
		plat.material_override = ProtoWorldBuilder.material(Color(0.35, 0.36, 0.38), 0.85)
		plat.position.y = 0.2
		g.add_child(plat)
		g._ring = MeshInstance3D.new()
		var tm := TorusMesh.new()
		tm.inner_radius = 2.6
		tm.outer_radius = 3.2
		g._ring.mesh = tm
		g._ring.rotation_degrees.x = 90.0
		g._ring.position.y = 3.4
		g.add_child(g._ring)
		var term := MeshInstance3D.new()
		var tb := BoxMesh.new()
		tb.size = Vector3(0.8, 1.4, 0.5)
		term.mesh = tb
		term.material_override = ProtoWorldBuilder.material(Color(0.2, 0.22, 0.24), 0.5)
		term.position = Vector3(3.6, 0.7, 0)
		g.add_child(term)
		var shape := CollisionShape3D.new()
		var bs := BoxShape3D.new()
		bs.size = Vector3(10, 0.5, 10)
		shape.shape = bs
		shape.position.y = 0.2
		g.add_child(shape)
		g.refresh_visual()
		return g

	func refresh_visual() -> void:
		var col := Color(0.25, 0.28, 0.3) # dormant: dead metal
		if state == "spinup":
			col = Color(0.95, 0.55, 0.15) # boot: burning amber
		elif state == "active":
			col = Color(0.3, 0.85, 0.75) # live: carousel teal
		_ring.material_override = ProtoWorldBuilder.material(col, 0.4, state != "dormant")

	func interact_position() -> Vector3:
		return global_position

	func interact_prompt(main: Node) -> String:
		match state:
			"active":
				return "E — 🎠 JUMP the ring (%s)" % row["name"]
			"spinup":
				return "— THE RING IS SPINNING UP — HOLD THE ROOM —"
			_:
				var need: Dictionary = row.get("power_need", {"item": "jerry_can", "count": 1})
				return "E — 🎠 %s: socket power (%d/%d %s)" % [row["name"], fed, int(need["count"]), String(need["item"])]

	func interact(main: Node) -> void:
		match state:
			"active":
				carousel.jump(row["id"])
			"spinup":
				main.notify("🎠 It's booting — keep it alive")
			_:
				var need: Dictionary = row.get("power_need", {"item": "jerry_can", "count": 1})
				if not main.backpack.remove(String(need["item"]), 1):
					main.notify("🎠 The socket wants %s — you're empty" % String(need["item"]))
					return
				fed += 1
				main.audio.play_ui("click", -6.0)
				if fed >= int(need["count"]):
					_begin_spinup(main)
				else:
					main.notify("🎠 Power at %d/%d — it hums a little louder" % [fed, int(need["count"])])

	## SPIN-UP: loud, bright, ~12s a wave. Survive it and the node is yours.
	func _begin_spinup(main: Node) -> void:
		state = "spinup"
		refresh_visual()
		_waves_left = int(row.get("spinup_waves", 2))
		_spin_t = 12.0
		main.notify("🎠 %s SPINS UP — every ear in the county just turned this way" % row["name"])
		main.spawn_howler_pack(global_position + Vector3(30, 0, 30), 2)

	func _physics_process(delta: float) -> void:
		if state != "spinup":
			return
		_spin_t -= delta
		_ring.rotation.z += delta * (2.0 + float(row.get("spinup_waves", 2)) - _waves_left)
		if _spin_t <= 0.0:
			_waves_left -= 1
			if _waves_left <= 0:
				_go_active()
			else:
				_spin_t = 12.0
				var m := get_tree().current_scene
				if m and m.has_method("spawn_howler_pack"):
					m.spawn_howler_pack(global_position + Vector3(-30, 0, 25), 2)

	func _go_active() -> void:
		state = "active"
		refresh_visual()
		carousel.active[row["id"]] = true
		var m: Node = carousel._main # never current_scene — sims wrap main in a harness
		if m and m.has_method("notify"):
			# The reward chest materializes at the live gate — the room pays out.
			var reward: Dictionary = (row.get("reward", {}) as Dictionary).get("items", {})
			if not reward.is_empty():
				var c := ProtoChest.create("%s cache" % row["name"], reward)
				m.add_child(c)
				c.global_position = global_position + Vector3(-3.5, 0.05, 2.5)
			m.notify("🎠 %s IS LIT — the node is yours, permanently" % row["name"])
			if m.has_method("circuit_beat"):
				m.circuit_beat("node") # THE CIRCUIT's capstone beat
