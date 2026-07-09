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

## THE CHOIR REGISTRY (THE_INFECTED.md 0.13 — ONE registry; LWE's nest sites
## read these SAME rows): a base is an anchor when its row sets choir_r > 0 or
## hosts a congregation (code-floor radius 650). Zones are the machine's
## geography — purging the herd never lifts the silence (0.4, §20).
static var _choir_cache: Array = []
static var _choir_loaded := false


static func choir_anchors() -> Array:
	if _choir_loaded:
		return _choir_cache
	_choir_loaded = true
	_choir_cache = []
	if FileAccess.file_exists(PATH):
		var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(PATH))
		if parsed is Dictionary:
			for b in (parsed as Dictionary).get("bases", []):
				var br: Dictionary = b
				var r := float(br.get("choir_r", 0.0))
				if r <= 0.0 and String(br.get("occupier", "")) == "choir_congregation":
					r = 650.0
				if r > 0.0:
					_choir_cache.append({"id": String(br.get("id", "")),
						"pos": Vector2(float(br["pos"][0]), float(br["pos"][1])), "r": r})
	return _choir_cache


static func choir_zone_at(pos: Vector3) -> bool:
	for a in choir_anchors():
		if (a["pos"] as Vector2).distance_to(Vector2(pos.x, pos.z)) <= float(a["r"]):
			return true
	return false


## F-IP's anchor term: MAX over anchors, never sum (two overlapping anchors
## never double the silence).
static func choir_anchor_prox(pos: Vector3) -> float:
	var best := 0.0
	for a in choir_anchors():
		var d: float = (a["pos"] as Vector2).distance_to(Vector2(pos.x, pos.z))
		best = maxf(best, clampf(1.0 - d / float(a["r"]), 0.0, 1.0))
	return best


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


var rng := RandomNumberGenerator.new() ## the ROULETTE's dice (sims seed it)


## THE THREE TIERS (the carousel pun is the mechanic):
## - THE PAIR: two doors → point-to-point.
## - THE ROULETTE: 3+ doors and a fried targeting computer → the RING chooses.
## - THE DIAL: carry Cheyenne's targeting core, and your MAP COURSE aims the
##   jump — click a lit gate on the atlas, then step through.
func pick_destination(from_id: String) -> String:
	var actives: Array = []
	for id in active:
		if id != from_id and active[id]:
			actives.append(id)
	if actives.is_empty():
		return ""
	# THE DIAL: the map IS the dial — a set course near a lit gate picks the door.
	if _main.backpack.count("targeting_core") > 0:
		for wp in _main.waypoints:
			var wpos: Vector3 = (wp[1] as Node3D).global_position if wp[1] is Node3D else wp[1]
			for id2 in actives:
				var g: Variant = gates.get(id2)
				if g != null and is_instance_valid(g) \
						and Vector2(wpos.x, wpos.z).distance_to(Vector2(g.global_position.x, g.global_position.z)) < 200.0:
					_main.notify("🎛️ THE DIAL reads your course — destination LOCKED")
					return id2
	if actives.size() == 1:
		return actives[0] # THE PAIR
	# THE ROULETTE: the computer's fried. Step in. Find out.
	_main.notify("🎰 The targeting computer is FRIED — the ring CHOOSES (find Cheyenne's core for the Dial)")
	return actives[rng.randi() % actives.size()]


## RING EVENTS: besiege a lit node (never one already under siege). Your FIRST
## node is a safe haven — the ring only bites once you've built a network.
func besiege_random(days: int) -> String:
	var lit: Array = []
	for id in active:
		if active[id] and gates.has(id) and not gates[id].under_siege:
			lit.append(id)
	if lit.size() < 2:
		return ""
	var target: String = lit[rng.randi() % lit.size()]
	gates[target].begin_siege(days)
	return target


func any_under_siege() -> Array:
	var out: Array = []
	for id in gates:
		if gates[id].under_siege:
			out.append(id)
	return out


## The JUMP: flesh, not steel. Costs cells, lands with jump sickness. The car —
## and everything in its trunk — stays exactly where you left it.
func jump(from_id: String) -> bool:
	var to_id := pick_destination(from_id)
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
	# THE GARAGE (the killer wrinkle): the gate takes flesh — but the NODE keeps
	# your rig. Jump OUT: a rig parked at the gate is STORED (up to the row's
	# slots). Jump IN: everything stored there rolls out to meet you. Ferry a
	# bike to a node the long way ONCE and you've got wheels there forever.
	_store_nearby_rig(from_id)
	var dest: Dictionary = base_row(to_id)
	var p: Array = dest["pos"]
	_main.player.global_position = Vector3(float(p[0]) + 4.0, 0.5, float(p[1]) + 4.0)
	_main.player.velocity = Vector3.ZERO
	_main.stress = minf(100.0, _main.stress + float(jr.get("sickness_stress", 25)))
	# JUMP SICKNESS you can SEE (CAROUSEL.md): white tear → teal afterimage + shake.
	if _main.hud != null:
		_main.hud.jump_flash()
	if _main.cam_rig != null:
		_main.cam_rig.add_trauma(0.8)
	_main.audio.play_ui("blip", -2.0, 0.6)
	_main.notify("🎠 The ring SPINS — %s. Your rig is three states behind you." % dest["name"])
	_deliver_garage(to_id)
	return true


func _store_nearby_rig(gate_id: String) -> void:
	var g: Variant = gates.get(gate_id)
	if g == null:
		return
	var slots: int = int(g.row.get("garage_slots", 1))
	if g.garage.size() >= slots:
		return
	var best: ProtoCar3D = null
	var bd := 25.0
	for car in _main.cars:
		if car is ProtoCar3D and is_instance_valid(car) and not car.dead \
				and car.ai_driver == null and car.vclass != "trailer" \
				and car.global_position.distance_to(g.global_position) < bd:
			bd = car.global_position.distance_to(g.global_position)
			best = car
	if best == null:
		return
	var comps: Dictionary = {}
	for k in best.components:
		comps[k] = best.components[k].hp
	g.garage.append({"vclass": best.vclass, "fuel": best.fuel,
		"components": comps, "trunk": best.trunk.slots.duplicate()})
	_main.cars.erase(best)
	best.queue_free()
	_main.notify("🅿️ Your %s rolls into %s's garage (%d/%d slots) — it'll wait" % [best.display_name, g.row["name"], g.garage.size(), slots])


func _deliver_garage(gate_id: String) -> void:
	var g: Variant = gates.get(gate_id)
	if g == null or g.garage.is_empty():
		return
	var i := 0
	for rec in g.garage:
		var car := ProtoCar3D.create(String(rec["vclass"]), Color(0.5, 0.45, 0.4))
		_main.add_child(car)
		car.global_position = g.global_position + Vector3(8.0 + 4.0 * i, 1.0, -6.0)
		car.fuel = float(rec.get("fuel", 60.0))
		var comps: Dictionary = rec.get("components", {})
		for k in comps:
			if car.components.has(k):
				car.components[k].hp = float(comps[k])
		car.trunk.slots = (rec.get("trunk", {}) as Dictionary).duplicate()
		_main.cars.append(car)
		i += 1
	_main.notify("🅿️ The garage delivers: %d rig%s waiting where you left %s" % [g.garage.size(), "s" if g.garage.size() != 1 else "", "them" if g.garage.size() != 1 else "it"])
	g.garage.clear()


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
	## THE DUNGEON (rung 4): the row's objectives gate the boot; the OCCUPIER
	## force spawns when you get close — every base is an encounter, not a button.
	var objectives_left: Array = []
	var occupiers: Array = []
	var _spawned: bool = false
	var garage: Array = [] ## stored rig records (jump-out parks, jump-in delivers)
	## RING EVENTS: a lit node the world wants back. Relieve it in time or it goes
	## dormant — the Carousel is not a trophy shelf, it's a front line.
	var under_siege: bool = false
	var siege_deadline_day: int = 0
	var siege_attackers: Array = []
	## THE PORTAL (docs/design/CAROUSEL_PORTAL.md): a live gate grows a countdown portal
	## on the platform — activate it, the computer counts you down, THE DIAL rolls.
	var portal: ProtoCarouselPortal = null

	static func create(c: ProtoCarousel, row_in: Dictionary) -> ProtoGate:
		var g := ProtoGate.new()
		g.carousel = c
		g.row = row_in
		g.objectives_left = (row_in.get("objectives", ["power"]) as Array).duplicate()
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
		if under_siege:
			col = Color(0.95, 0.2, 0.12) # SIEGE: alarm red
		elif state == "spinup":
			col = Color(0.95, 0.55, 0.15) # boot: burning amber
		elif state == "active":
			col = Color(0.3, 0.85, 0.75) # live: carousel teal
		_ring.material_override = ProtoWorldBuilder.material(col, 0.4, state != "dormant" or under_siege)

	func interact_position() -> Vector3:
		return global_position

	func interact_prompt(main: Node) -> String:
		match state:
			"active":
				return "E — 🎠 JUMP the ring (%s)" % row["name"]
			"spinup":
				return "— THE RING IS SPINNING UP — HOLD THE ROOM —"
			_:
				_refresh_purge(main)
				match _next_objective():
					"purge":
						return "🎠 %s: PURGE the base — %d occupier%s still breathing" % [row["name"], _living_occupiers(), "s" if _living_occupiers() != 1 else ""]
					"codes":
						return "E — 🎠 %s: LAUNCH CODES — %s standing earns them, or %d scrip buys them" % [row["name"], "TRUSTED", _codes_price()]
					"power":
						var need: Dictionary = row.get("power_need", {"item": "jerry_can", "count": 1})
						return "E — 🎠 %s: socket power (%d/%d %s)" % [row["name"], fed, int(need["count"]), String(need["item"])]
					_:
						return "E — 🎠 %s: begin the SPIN-UP" % row["name"]

	func interact(main: Node) -> void:
		match state:
			"active":
				carousel.jump(row["id"])
			"spinup":
				main.notify("🎠 It's booting — keep it alive")
			_:
				_refresh_purge(main)
				match _next_objective():
					"purge":
						main.notify("🎠 The room won't boot with %d occupiers breathing — CLEAR IT" % _living_occupiers())
					"codes":
						# Three doors to the codes (CAROUSEL.md): standing EARNS them,
						# scrip BUYS them, and purging the state's troops... is rude.
						var st: String = String(row.get("state", ""))
						if main.respect.standing(st) in ["TRUSTED", "HERO"]:
							objectives_left.erase("codes")
							main.notify("🎠 %s vouches for you — the LAUNCH CODES are yours" % String(main.ruler_of(st)["ruler"]))
						elif main.backpack.remove("scrip", _codes_price()):
							objectives_left.erase("codes")
							main.notify("🎠 The codes cost %d scrip. Wired. Nobody asks where they came from." % _codes_price())
						else:
							main.notify("🎠 CODES: earn %s's trust, or bring %d scrip" % [st, _codes_price()])
							return
						_try_spinup(main)
					"power":
						var need: Dictionary = row.get("power_need", {"item": "jerry_can", "count": 1})
						if not main.backpack.remove(String(need["item"]), 1):
							main.notify("🎠 The socket wants %s — you're empty" % String(need["item"]))
							return
						fed += 1
						main.audio.play_ui("click", -6.0)
						if fed >= int(need["count"]):
							objectives_left.erase("power")
							_try_spinup(main)
						else:
							main.notify("🎠 Power at %d/%d — it hums a little louder" % [fed, int(need["count"])])
					_:
						_try_spinup(main)

	func _codes_price() -> int:
		return 20 + 10 * int(row.get("difficulty", 1))

	func _next_objective() -> String:
		return String(objectives_left.front()) if not objectives_left.is_empty() else ""

	func _living_occupiers() -> int:
		var n := 0
		for o in occupiers:
			if o != null and is_instance_valid(o) and not o.get("dead"):
				n += 1
		return n

	## PURGE clears itself the moment the last occupier drops.
	func _refresh_purge(main: Node) -> void:
		if "purge" in objectives_left and _spawned and _living_occupiers() == 0:
			objectives_left.erase("purge")
			main.notify("🎠 %s is CLEARED — the room is yours to boot" % row["name"])

	func _try_spinup(main: Node) -> void:
		_refresh_purge(main)
		if objectives_left.is_empty():
			_begin_spinup(main)
		else:
			main.notify("🎠 Still owed: %s" % ", ".join(objectives_left))

	## SPIN-UP: loud, bright, ~12s a wave. Survive it and the node is yours.
	func _begin_spinup(main: Node) -> void:
		state = "spinup"
		refresh_visual()
		_waves_left = int(row.get("spinup_waves", 2))
		_spin_t = 12.0
		main.notify("🎠 %s SPINS UP — every ear in the county just turned this way" % row["name"])
		main.spawn_howler_pack(global_position + Vector3(30, 0, 30), 2)

	## Begin a SIEGE: attackers ring the gate, a game-day clock starts. Reach it
	## and clear them to relieve it; let the clock run out and the node falls.
	func begin_siege(days: int) -> void:
		if state != "active" or under_siege:
			return
		under_siege = true
		siege_deadline_day = carousel._main.daynight.day + days
		refresh_visual()
		var m: Node = carousel._main
		var atk := 3
		siege_attackers.clear()
		var before: int = m.howlers.size()
		m.spawn_howler_pack(global_position + Vector3(24, 0, 18), atk)
		for i in range(before, m.howlers.size()):
			siege_attackers.append(m.howlers[i])
		m.notify("📻 ⚠️ %s IS UNDER SIEGE — reach it by DAY %d or the node falls" % [row["name"], siege_deadline_day])
		if "audio" in m and m.audio:
			m.audio.play_ui("vo_radio_war", -4.0)


	func _living_attackers() -> int:
		var n := 0
		for a in siege_attackers:
			if a != null and is_instance_valid(a) and not a.get("dead"):
				n += 1
		return n


	## A live gate wears the countdown portal (docs/design/CAROUSEL_PORTAL.md): E arms it,
	## the computer counts 10→1, and the FIRE executes the REAL roulette jump — the same
	## carousel.jump() the terminal's E offers (which stays, as the quiet parity path).
	func _mount_portal() -> void:
		if portal != null and is_instance_valid(portal):
			return
		portal = ProtoCarouselPortal.create(carousel._main)
		portal.jump_action = func() -> void: carousel.jump(row["id"])
		add_child(portal)
		portal.position = Vector3(0, 0.4, -2.2) # on the platform, clear of the terminal


	func _clear_portal() -> void:
		if portal != null and is_instance_valid(portal):
			portal.queue_free()
		portal = null


	func _lose_node() -> void:
		under_siege = false
		state = "dormant"
		fed = 0
		_spawned = false
		objectives_left = (row.get("objectives", ["power"]) as Array).duplicate()
		carousel.active.erase(row["id"])
		_clear_portal() # a dark gate has no portal
		refresh_visual()
		var m: Node = carousel._main
		m.stress = minf(100.0, m.stress + 30.0)
		m.notify("🎠💀 %s HAS FALLEN — the ring goes dark there. Take it back." % row["name"])


	## THE APPROACH: get within 130 m of a dormant base and its OCCUPIER wakes up.
	func _physics_process(delta: float) -> void:
		if not _spawned and state == "dormant" and carousel._main != null \
				and carousel._main.player != null \
				and global_position.distance_to(carousel._main.player.global_position) < 130.0:
			_spawn_occupation(carousel._main)
		# SIEGE resolution: relieved when you reach the gate and the attackers are
		# down; lost when the deadline passes with the node still surrounded.
		if under_siege:
			var pl: Node3D = carousel._main.player
			var here: bool = pl != null and pl.global_position.distance_to(global_position) < 60.0
			if here and _living_attackers() == 0:
				under_siege = false
				siege_attackers.clear()
				refresh_visual()
				carousel._main.notify("🎠 %s RELIEVED — you held the line. The node stays yours." % row["name"])
			elif carousel._main.daynight.day >= siege_deadline_day:
				_lose_node()
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
		_mount_portal()
		var m: Node = carousel._main # never current_scene — sims wrap main in a harness
		if m and m.has_method("notify"):
			# The reward chest materializes at the live gate — the room pays out.
			# The UNIQUE rides in it too (Cheyenne's targeting core = THE DIAL).
			var reward: Dictionary = ((row.get("reward", {}) as Dictionary).get("items", {}) as Dictionary).duplicate()
			var unique: String = String((row.get("reward", {}) as Dictionary).get("unique", ""))
			if unique != "":
				reward[unique] = 1
			if not reward.is_empty():
				var c := ProtoChest.create("%s cache" % row["name"], reward)
				m.add_child(c)
				c.global_position = global_position + Vector3(-3.5, 0.05, 2.5)
			m.notify("🎠 %s IS LIT — the node is yours, permanently%s" % [row["name"],
				(" · the cache holds the %s" % unique.replace("_", " ").to_upper()) if unique != "" else ""])
			if m.has_method("circuit_beat"):
				m.circuit_beat("node") # THE CIRCUIT's capstone beat


	## THE OCCUPATION (the row decides who holds the room):
	## howler_warren = teeth in the dark · raider/ruler garrisons = lurker troops
	## (a RULER's troops STAND DOWN for a TRUSTED name — respect is a key) ·
	## automated = nobody home, just locks. Plus wreck cover: the APPROACH reads
	## like a place that was fought over before you got there.
	func _spawn_occupation(m: Node) -> void:
		_spawned = true
		var diff: int = int(row.get("difficulty", 1))
		# Wreck ring — cover on the way in, every base.
		for i in 3 + diff:
			var ang := TAU * float(i) / float(3 + diff) + 0.4
			ProtoWorldBuilder.box_body(m, Vector3(2.2, 1.1, 4.4),
				global_position + Vector3(cos(ang), 0, sin(ang)) * (24.0 + 4.0 * (i % 3)) + Vector3(0, 0.55, 0),
				Color(0.24, 0.2, 0.17))
		match String(row.get("occupier", "dormant")):
			"howler_warren":
				var before: int = m.howlers.size()
				m.spawn_howler_pack(global_position + Vector3(20, 0, 12), 1 + diff)
				for i2 in range(before, m.howlers.size()):
					occupiers.append(m.howlers[i2])
			"raider_garrison", "ruler_troops":
				var st: String = String(row.get("state", ""))
				if String(row["occupier"]) == "ruler_troops" and m.respect.standing(st) in ["TRUSTED", "HERO"]:
					m.notify("🎠 The %s's troops read your face — and STAND DOWN. Respect is a key." % String(m.ruler_of(st)["ruler"]))
					objectives_left.erase("purge") # nobody to purge; they let you work
					return
				for i3 in 1 + diff:
					var l := ProtoLurker.create()
					m.add_child(l)
					l.global_position = global_position + Vector3(10.0 + 3.0 * i3, 0.4, -8.0 + 5.0 * i3)
					occupiers.append(l)
			"choir_congregation":
				# THE FIRST CHOIR (THE_INFECTED I1): a shambler herd holds the
				# ground, standing, murmuring. Purging kills BODIES — the anchor
				# and its silence STAY (0.4; never explain why, §20).
				for i4 in 6 + diff * 3:
					var inf := ProtoInfected.create("shambler")
					m.add_child(inf)
					var ang4 := TAU * float(i4) / float(6 + diff * 3)
					var rr := 8.0 + 3.0 * float(i4 % 3)
					inf.global_position = global_position + Vector3(cos(ang4) * rr, 0.4, sin(ang4) * rr)
					occupiers.append(inf)
			_:
				pass # automated: the locks are the fight
