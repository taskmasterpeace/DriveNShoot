## THE FUEL ACCORD (owner add, 2026-07-09) — gas stations are GUARDED NEUTRAL GROUND
## and the economy's sink. Every materialized gas_station_small gets: THE PUMP (fuel
## for scrip — jerry cans went rare, the pump is the plan now), TWO ACCORD ENFORCERS
## (neutral colors, posted; violence inside the ring turns every flag against you and
## the guards ENGAGE), and THE SIGN ("FUEL ACCORD GROUND — ALL FLAGS WELCOME").
## Bandit/ecology directors honor the ring as a NO-STRIKE zone via in_ring().
## Data rows: prices.json pump_fuel · security_forces.json accord[] · the catalog's
## gas_station_small placements. One node per station, parented to the CHUNK — the
## ring registers on entering the tree and unregisters when the chunk unloads.
class_name ProtoFuelAccord
extends Node3D

const RING_R := 22.0          ## the neutral ground's radius (m)
const FUEL_PER_BUY := 40.0    ## one purchase = one jerry can's worth
const ACCORD_INFAMY := 40.0   ## the price of violence, paid to EVERY flag
const GUARD_HP := 90.0
const GUARD_RANGE := 26.0
const GUARD_FIRE_CD := 1.15
const GUARD_DAMAGE := 12.0
## Every flag that hears an Accord violation (union'd with the live ledger's keys).
const ALL_FLAGS: Array = ["meridian", "free_counties", "broadcast_church",
	"corporate_corridor", "federal_remnant"]
const ACCORD_TINT := Color(0.42, 0.46, 0.48) ## neutral slate — no flag's color

static var rings: Array = [] ## live ring centers (Vector3) — directors query in_ring


## THE TRUCE QUERY (F4): is this spot on Accord ground? pad widens the courtesy.
static func in_ring(pos: Vector3, pad: float = 0.0) -> bool:
	for c in rings:
		var cv: Vector3 = c
		if Vector2(pos.x - cv.x, pos.z - cv.z).length() <= RING_R + pad:
			return true
	return false


## THE VIOLATION (F2): violence on Accord ground. Every flag hears it, the guards
## in that ring acquire the attacker. Called from the real damage paths.
static func report_violence(main: Node, attacker: Node3D, pos: Vector3) -> void:
	if main == null or attacker == null or not in_ring(pos, 2.0):
		return
	if "player" in main and attacker == main.player:
		if "bounty_hunted" in main:
			main.bounty_hunted = true
		if "respect" in main and main.respect != null:
			var flags: Dictionary = {}
			for f in ALL_FLAGS:
				flags[f] = true
			for k in main.respect.ledger.keys():
				flags[k] = true
			for f in flags.keys():
				main.respect.add_infamy(String(f), ACCORD_INFAMY)
		if main.has_method("notify"):
			main.notify("⛽ YOU BROKE THE ACCORD — every flag on the road just heard it.")
	var tree := main.get_tree() if main.is_inside_tree() else null
	if tree != null:
		for g in tree.get_nodes_in_group("accord_guard"):
			if g is Node3D and (g as Node3D).global_position.distance_to(pos) <= RING_R + GUARD_RANGE:
				g.engage(attacker)


## Build a station's Accord dressing. Parent to the CHUNK beside the shell.
static func create(station_pos: Vector3, yaw: float) -> ProtoFuelAccord:
	var a := ProtoFuelAccord.new()
	a.add_to_group("fuel_accord")
	a.position = station_pos
	a.rotation.y = yaw
	# THE PUMP — the island out front (+Z is the shell's front door side).
	var pump := AccordPump.new()
	pump.position = Vector3(2.4, 0, 6.5)
	a.add_child(pump)
	# THE SIGN — the promise, readable (wave-1 sign law: the group does the work).
	var sign := ProtoSign.create("FUEL ACCORD GROUND — ALL FLAGS WELCOME", "⛽")
	sign.position = Vector3(-3.2, 0, 8.5)
	a.add_child(sign)
	# THE ENFORCERS — two posts flanking the pump island, neutral slate.
	for gi in 2:
		var guard := AccordGuard.new()
		guard.position = Vector3(-1.8 + 8.0 * float(gi), 0, 7.8)
		a.add_child(guard)
	return a


func _enter_tree() -> void:
	rings.append(global_position if is_inside_tree() else position)


func _ready() -> void:
	# _enter_tree ran before the chunk positioned us — re-stamp the true center.
	if rings.size() > 0:
		rings[rings.size() - 1] = global_position


func _exit_tree() -> void:
	rings.erase(global_position)


## THE PUMP — fuel for scrip (F1). The interact contract every chest/board uses.
class AccordPump:
	extends StaticBody3D

	func _ready() -> void:
		add_to_group("interactable")
		var body := MeshInstance3D.new()
		var bm := BoxMesh.new()
		bm.size = Vector3(0.9, 1.6, 0.6)
		body.mesh = bm
		body.position.y = 0.8
		body.material_override = ProtoWorldBuilder.material(ProtoFuelAccord.ACCORD_TINT, 0.6)
		add_child(body)
		var stripe := MeshInstance3D.new()
		var sm := BoxMesh.new()
		sm.size = Vector3(0.94, 0.3, 0.64)
		stripe.mesh = sm
		stripe.position.y = 1.25
		stripe.material_override = ProtoWorldBuilder.material(Color(0.92, 0.84, 0.55), 0.4, true)
		add_child(stripe)
		var shape := CollisionShape3D.new()
		var bs := BoxShape3D.new()
		bs.size = Vector3(0.9, 1.6, 0.6)
		shape.shape = bs
		shape.position.y = 0.8
		add_child(shape)

	func _price() -> int:
		ProtoNPC.ensure_prices()
		return int(ProtoNPC.PRICES.get("pump_fuel", 12))

	func interact_position() -> Vector3:
		return global_position

	func interact_prompt(m: Node) -> String:
		var rig: Node = m._rig_in_reach() if m.has_method("_rig_in_reach") else null
		if rig == null:
			return "⛽ THE PUMP — bring a rig in reach"
		if float(rig.fuel) >= 99.5:
			return "⛽ %s — tank's FULL" % String(rig.display_name)
		return "E — ⛽ fuel the %s (+%d for %d scrip)" % [String(rig.display_name),
			int(ProtoFuelAccord.FUEL_PER_BUY), _price()]

	func interact(m: Node) -> void:
		var rig: Node = m._rig_in_reach() if m.has_method("_rig_in_reach") else null
		if rig == null:
			if m.has_method("notify"):
				m.notify("⛽ No rig in reach — the hose only stretches so far.")
			return
		if float(rig.fuel) >= 99.5:
			if m.has_method("notify"):
				m.notify("⛽ Tank's full.")
			return
		var price := _price()
		if not ("backpack" in m) or not m.backpack.remove("scrip", price):
			if m.has_method("notify"):
				m.notify("⛽ Fuel's %d scrip — the Accord doesn't run tabs." % price)
			return
		rig.fuel = minf(100.0, float(rig.fuel) + ProtoFuelAccord.FUEL_PER_BUY)
		if "audio" in m and m.audio != null:
			m.audio.play_ui("blip", -8.0)
		if m.has_method("notify"):
			m.notify("⛽ Fueled the %s (%d%%) — %d scrip to the Accord." %
				[String(rig.display_name), int(rig.fuel), price])


## THE ENFORCER (F2) — posted, neutral, and very done with everybody's wars.
## Stands its ground (no follow), engages whoever breaks the Accord in its ring.
class AccordGuard:
	extends CharacterBody3D

	var hp: float = ProtoFuelAccord.GUARD_HP
	var target: Node3D = null
	var _cd: float = 0.0
	var puppet: Node3D = null

	func _ready() -> void:
		add_to_group("combatant")
		add_to_group("accord_guard")
		var shape := CollisionShape3D.new()
		var cap := CapsuleShape3D.new()
		cap.radius = 0.35
		cap.height = 1.7
		shape.shape = cap
		shape.position.y = 0.9
		add_child(shape)
		# The look: the guard silhouette in Accord slate — a uniform, not a flag.
		var row: Dictionary = ProtoPuppet.look("guard")
		row["cloth"] = ProtoFuelAccord.ACCORD_TINT
		row["hat"] = ProtoFuelAccord.ACCORD_TINT.darkened(0.25)
		puppet = ProtoPuppet.create(row)
		add_child(puppet)
		if puppet.has_method("set_armed"):
			puppet.set_armed(true)

	## The Accord broke — this guard takes the fight to whoever broke it.
	func engage(who: Node3D) -> void:
		if who != null and is_instance_valid(who):
			target = who

	func take_damage(amount: float, attacker: Node3D = null) -> void:
		hp -= amount
		# Being SHOT on Accord ground IS a violation. The weapon path passes no
		# attacker (single-arg take_damage) — an unattributed hit on a posted guard
		# is the PLAYER's (the only weapon-wielder in the tree); co-op remotes are
		# authoritative on their own sims.
		var m := _main()
		var who: Node3D = attacker
		if who == null and m != null and "player" in m:
			who = m.player
		if m != null and who != null:
			ProtoFuelAccord.report_violence(m, who, global_position)
		elif who != null:
			engage(who)
		if hp <= 0.0:
			var m2 := _main()
			if m2 != null:
				var body := ProtoChest.create("Fallen Accord enforcer", {"9mm": 8, "scrip": 4})
				m2.add_child(body)
				body.global_position = Vector3(global_position.x, 0.05, global_position.z)
			queue_free()

	func _physics_process(delta: float) -> void:
		_cd = maxf(0.0, _cd - delta)
		if target == null or not is_instance_valid(target):
			return
		var d := global_position.distance_to(target.global_position)
		if d > ProtoFuelAccord.GUARD_RANGE:
			return # posted, not a chaser — the ring is the jurisdiction
		# Face the trouble.
		var flat := Vector3(target.global_position.x, global_position.y, target.global_position.z)
		if flat.distance_to(global_position) > 0.5:
			look_at(flat, Vector3.UP)
		if _cd <= 0.0:
			_cd = ProtoFuelAccord.GUARD_FIRE_CD
			_fire()

	func _fire() -> void:
		if target == null or not is_instance_valid(target):
			return
		var from := global_position + Vector3(0, 1.3, 0)
		var to: Vector3 = target.global_position + Vector3(0, 0.9, 0)
		var ray := PhysicsRayQueryParameters3D.create(from, to)
		ray.exclude = [get_rid()]
		var hit := get_world_3d().direct_space_state.intersect_ray(ray)
		if hit.is_empty():
			return
		var col: Object = hit["collider"]
		var m := _main()
		if m != null and "player" in m and col == m.player and m.has_method("on_player_clawed"):
			m.on_player_clawed(ProtoFuelAccord.GUARD_DAMAGE, self) # the player's real hurt path
		elif col != null and col.has_method("take_damage"):
			col.take_damage(ProtoFuelAccord.GUARD_DAMAGE)

	func _main() -> Node:
		var n: Node = self
		while n != null:
			if "respect" in n and "player" in n:
				return n
			n = n.get_parent()
		return null
