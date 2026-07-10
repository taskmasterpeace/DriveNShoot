## CREATURES SIM (LWE P1 — the eco→world bridge + the five creatures).
## Proves, in order: (1) cold-start LEDGER seeding (a fresh swamp cell banks
## wildlife from its floats), (2) the hourly RECONCILE steps counts toward what
## the floats support, (3) REALIZATION — the player arrives (staged teleport,
## the documented exception) and the stream spends the banked counts into
## living ProtoCreature/ProtoKnifeback actors, budget-capped per cell,
## (4) prey FLEES noise, (5) the 0.11 BODY LAW — a kill leaves the RIG as the
## corpse with rolled loot, and writes eco_kill back into the cell,
## (6) the Knifeback NEST MACHINE walks FED→HUNGRY→STARVING→WOUNDED→recovered.
## Run: godot --headless --path game res://proto3d/tests/creatures_sim.tscn
extends Node

var main: Node3D
var t: float = 0.0
var phase: int = 0
var phase_t: float = 0.0
var checks_passed: int = 0
var checks_failed: int = 0

var swamp: Vector3 = Vector3.INF
var swamp_row: Dictionary = {}
var _victim_cell: Dictionary = {}
var _pre_kill_prey: float = 0.0
var _victim: ProtoCreature = null
var _victim_pos: Vector3
var _kb: ProtoKnifeback = null


func _ready() -> void:
	var packed: PackedScene = load("res://proto3d/proto3d.tscn")
	main = packed.instantiate()
	add_child(main)
	print("CREATURES: scene instanced")


func _check(name: String, ok: bool) -> void:
	if ok:
		checks_passed += 1
		print("CREATURES: PASS - %s" % name)
	else:
		checks_failed += 1
		print("CREATURES: FAIL - %s" % name)


func _next() -> void:
	phase += 1
	phase_t = 0.0


func _finish() -> void:
	print("CREATURES RESULTS: %d passed, %d failed" % [checks_passed, checks_failed])
	print("CREATURES: %s" % ("ALL CHECKS PASSED" if checks_failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if checks_failed == 0 else 1)


## Nearest swamp ground to the FL corner of the map — scan the macro map, no
## guessing coordinates. Deterministic: fixed grid, first hit wins.
func _find_swamp() -> Vector3:
	var um: ProtoUSMap = main.stream.usmap
	if um == null or not um.ok:
		return Vector3.INF
	for z in range(2000, 20000, 500):
		for x in range(-8000, 12000, 500):
			var p := Vector3(float(x), 0, float(z))
			if um.biome_at(p) == "swamp":
				return p
	# widen the net if the near-south had none
	for z in range(-20000, 22000, 750):
		for x in range(-14000, 14000, 750):
			var p2 := Vector3(float(x), 0, float(z))
			if um.biome_at(p2) == "swamp":
				return p2
	return Vector3.INF


func _creatures_near(pos: Vector3, radius: float) -> Array:
	var out: Array = []
	for n in get_tree().get_nodes_in_group("creature"):
		if n is Node3D and is_instance_valid(n) and (n as Node3D).global_position.distance_to(pos) <= radius:
			out.append(n)
	return out


func _physics_process(delta: float) -> void:
	t += delta
	phase_t += delta
	match phase:
		0: # settle
			if phase_t > 0.8:
				_check("scene booted (population + ecology wired)",
					main.population != null and main.ecology != null)
				swamp = _find_swamp()
				_check("found swamp ground on the macro map", swamp != Vector3.INF)
				if swamp == Vector3.INF:
					_finish()
					return
				_next()
		1: # LEDGER: cold-start seeding
			swamp_row = main.population.cell_at(swamp)
			var cur: Dictionary = swamp_row["current_pop"]
			var eco: Dictionary = swamp_row["eco"]
			_check("swamp eco seeds rich (prey %.2f ≥ 0.5)" % float(eco["prey_density"]), float(eco["prey_density"]) >= 0.5)
			_check("cold-start banked grazers (%d ≥ 2)" % int(cur.get("grazer", 0)), int(cur.get("grazer", 0)) >= 2)
			_check("cold-start banked pack predators (%d ≥ 1)" % int(cur.get("pack_pred", 0)), int(cur.get("pack_pred", 0)) >= 1)
			# F3 THE ONE AUTHORED NEST: the first swamp IS the Alley den (hot
			# from first touch); every OTHER swamp cell stays below the apex
			# bar — apexes are rare, never wallpaper.
			_check("the AUTHORED NEST banked THE apex (%d == 1)" % int(cur.get("apex", 0)), int(cur.get("apex", 0)) == 1)
			var other := Vector3.INF
			var um2: ProtoUSMap = main.stream.usmap
			for z2 in range(2000, 20000, 500):
				for x2 in range(-8000, 12000, 500):
					var p2 := Vector3(float(x2), 0, float(z2))
					if um2.biome_at(p2) == "swamp" and p2.distance_to(swamp) > 900.0:
						other = p2
						break
				if other != Vector3.INF:
					break
			if other != Vector3.INF:
				var orow: Dictionary = main.population.cell_at(other)
				_check("a GENERIC swamp cell banks NO apex (rarity law)",
					int((orow["current_pop"] as Dictionary).get("apex", 0)) == 0)
			# a human-zone cell banks rodents (rats live where humans lived) —
			# scan near the swamp for ground whose ZONE qualifies (the Alley's
			# own road shoulder), never a hardcoded coordinate's guess.
			var rodent_zones := ["suburbs", "industrial", "house_field", "road_shoulder"]
			var probe := Vector3.INF
			for dz in range(-3000, 3001, 250):
				for dx in range(-3000, 3001, 250):
					var p := swamp + Vector3(float(dx), 0, float(dz))
					if rodent_zones.has(main.population._derive_zone_tag(p)) \
							and not main.population._is_protected(p):
						probe = p
						break
				if probe != Vector3.INF:
					break
			_check("found a human-zone cell near the swamp", probe != Vector3.INF)
			if probe != Vector3.INF:
				var road_row: Dictionary = main.population.cell_at(probe)
				var rc: int = int((road_row["current_pop"] as Dictionary).get("rodent", 0))
				_check("human-zone cell banked rodents (%d ≥ 1)" % rc, rc >= 1)
			_next()
		2: # RECONCILE: floats move → counts follow, both directions
			var eco: Dictionary = swamp_row["eco"]
			var cur: Dictionary = swamp_row["current_pop"]
			var g0: int = int(cur.get("grazer", 0))
			eco["prey_density"] = 0.0
			main.ecology.tick(2.0)
			var g1: int = int(cur.get("grazer", 0))
			_check("starved sector steps grazers DOWN (%d → %d)" % [g0, g1], g1 < g0)
			# force ALL the inputs (this phase proves the RECONCILE law; the
			# float drift itself is ecology_sim's job — a 0.549-vs-0.55
			# threshold straddle here would be testing luck, not law)
			eco["prey_density"] = 0.9
			eco["predator_pressure"] = 0.8 # the AUTHORED nest runs hot (apex bar 0.75)
			eco["corpse_heat"] = 0.6
			main.ecology.tick(4.0)
			var g2: int = int(cur.get("grazer", 0))
			_check("rich sector steps grazers back UP (%d → %d ≥ 3)" % [g1, g2], g2 >= 3)
			# F7 ABSENT read: birds refuse the sky over the apex-hot nest —
			# NO-BIRDS is the sentence (the positive case is a pure-law check
			# in the F7 phase below)
			_check("NO-BIRDS over the apex nest (scavenger %d == 0)" % int(cur.get("scavenger", 0)),
				int(cur.get("scavenger", 0)) == 0)
			_check("apex still holds the wet ground (== 1)", int(cur.get("apex", 0)) == 1)
			# audit GAP-8: a PROTECTED cell banks NO wildlife however rich its
			# floats — never hunted on your doorstep. Flag a fresh cell
			# directly: which 500 m cells GET the flag is the bubble law's
			# business (safehouse_spawn_suppression_sim); the reconcile guard
			# is what's under test here.
			var home_row: Dictionary = main.population.cell_at(Vector3(-9000, 0, -9000))
			home_row["protected"] = true
			(home_row["eco"] as Dictionary)["prey_density"] = 0.9
			(home_row["current_pop"] as Dictionary)["grazer"] = 0
			main.ecology.tick(4.0)
			_check("protected cell banks NO wildlife (doorstep law)",
				int((home_row["current_pop"] as Dictionary).get("grazer", 0)) == 0)
			# audit GAP-10: a pre-eco save row HEALS on first touch
			var old_pos := Vector3(9000, 0, 9000)
			var old_key: String = main.population.cell_key(old_pos)
			main.population.cells[old_key] = {"id": old_key, "zone_tag": "thick_forest",
				"biome": "scrub", "current_pop": {}, "protected": false}
			var healed: Dictionary = main.population.cell_at(old_pos)
			_check("pre-eco save cell HEALS (eco backfilled on touch)", healed.has("eco"))
			# re-arm the NEST before realization: the side-checks' extra ticks
			# drift pred around the 0.75 apex bar and the reconcile un-banks
			# the den — force the authored heat back, one tick to re-bank.
			(swamp_row["eco"] as Dictionary)["predator_pressure"] = 0.85
			main.ecology.tick(1.0)
			_next()
		3: # REALIZATION: the player ARRIVES (staged teleport — documented exception)
			main.cars[0].global_position = swamp + Vector3(20, 1.2, 0)
			main.cars[0].linear_velocity = Vector3.ZERO
			main.player.global_position = swamp + Vector3(18, 1.0, 0)
			main.player.velocity = Vector3.ZERO
			_next()
		4: # give the stream + physics a moment to realize and settle
			if phase_t > 2.5:
				var near := _creatures_near(swamp, 800.0)
				_check("the land LIVES on arrival (%d creatures ≥ 3)" % near.size(), near.size() >= 3)
				var kinds := {}
				var cell_key: String = main.population.cell_key(swamp)
				var mossbacks_in_cell := 0
				for c in near:
					if c is ProtoCreature:
						kinds[(c as ProtoCreature).kind] = true
						if (c as ProtoCreature).kind == "mossback" \
								and main.population.cell_key((c as Node3D).global_position) == cell_key:
							mossbacks_in_cell += 1
					elif c is ProtoKnifeback:
						kinds["knifeback"] = true
						_kb = c
				print("CREATURES: realized kinds = %s" % str(kinds.keys()))
				_check("mossbacks realized", kinds.has("mossback"))
				_check("a KNIFEBACK holds the swamp", kinds.has("knifeback"))
				_check("per-cell budget held (%d mossbacks ≤ 4 in the cell)" % mossbacks_in_cell, mossbacks_in_cell <= 4)
				# pick a victim for the body-law phase
				for c in near:
					if c is ProtoCreature and (c as ProtoCreature).kind == "mossback":
						_victim = c
						break
				_check("victim staged", _victim != null)
				_next()
		5: # NOISE: prey flees the bang
			if _victim == null or not is_instance_valid(_victim):
				_check("victim survived to the noise phase", false)
				_next()
				return
			main.emit_noise(_victim.global_position + Vector3(3, 0, 0), 45.0, "gunshot")
			_next()
		6:
			if phase_t > 0.6:
				_check("prey FLEES the gunshot", _victim != null and is_instance_valid(_victim)
					and _victim.state == ProtoCreature.CState.FLEE)
				_next()
		7: # BODY LAW: the kill leaves a body, and the land remembers
			if _victim == null or not is_instance_valid(_victim):
				_check("victim reachable for the kill", false)
				_next()
				return
			_victim_pos = _victim.global_position
			# measure the VICTIM'S cell — it may have wandered across a 500 m
			# line since realization; eco_kill lands where the body falls
			_victim_cell = main.population.cell_at(_victim_pos)
			_pre_kill_prey = float((_victim_cell["eco"] as Dictionary).get("prey_density", 0.0))
			_victim.take_damage(999.0)
			_next()
		8:
			if phase_t > 0.5:
				var corpse: Node = null
				for n in get_tree().get_nodes_in_group("corpse"):
					if n is Node3D and (n as Node3D).global_position.distance_to(_victim_pos) < 6.0:
						corpse = n
						break
				_check("the kill left a CORPSE where it fell", corpse != null)
				if corpse != null:
					var has_rig := false
					for ch in corpse.get_children():
						if ch is ProtoQuadruped:
							has_rig = true
					_check("the corpse IS the rig (0.11 BODY LAW — no box lump)", has_rig)
					var meat: int = (corpse as ProtoCorpse).container.count("meat") if (corpse as ProtoCorpse).container.has_method("count") else -1
					if meat == -1: # container may not expose count(); read slots directly
						meat = 0
						for slot in (corpse as ProtoCorpse).container.slots:
							if String(slot.get("id", "")) == "meat":
								meat += int(slot.get("count", 0))
					_check("loot rolled ONTO the body (meat %d ≥ 2)" % meat, meat >= 2)
				var prey_now: float = float((_victim_cell["eco"] as Dictionary).get("prey_density", 0.0))
				_check("the kill wrote back to the land (prey %.3f < %.3f)" % [prey_now, _pre_kill_prey],
					prey_now < _pre_kill_prey)
				_next()
		9: # THE NEST MACHINE (drive the floats, walk the states)
			if _kb == null or not is_instance_valid(_kb):
				# the knifeback may have realized in a neighbor cell — find any
				for n in get_tree().get_nodes_in_group("creature"):
					if n is ProtoKnifeback and is_instance_valid(n):
						_kb = n
						break
			if _kb == null:
				_check("a knifeback exists for the nest-machine phase", false)
				_finish()
				return
			var kb_eco: Dictionary = main.population.cell_at(_kb.nest_pos)["eco"]
			kb_eco["prey_density"] = 0.6
			_kb._nest_tick()
			_check("prey-rich nest reads FED", _kb.nest_state == ProtoKnifeback.Nest.FED)
			kb_eco["prey_density"] = 0.3
			_kb._nest_tick()
			_check("thinning prey reads HUNGRY", _kb.nest_state == ProtoKnifeback.Nest.HUNGRY)
			var r_hungry := _kb.hunt_radius()
			kb_eco["prey_density"] = 0.05
			_kb._nest_tick()
			_check("starved land reads STARVING", _kb.nest_state == ProtoKnifeback.Nest.STARVING)
			_check("STARVING widens the ground (%.0f > %.0f)" % [_kb.hunt_radius(), r_hungry],
				_kb.hunt_radius() > r_hungry)
			_kb.take_damage(200.0) # 260 → 60, under the 40% line
			_check("a broken apex goes WOUNDED", _kb.nest_state == ProtoKnifeback.Nest.WOUNDED)
			_check("WOUNDED closes the hunt (radius %.0f ≤ 4)" % _kb.hunt_radius(), _kb.hunt_radius() <= 4.0)
			kb_eco["prey_density"] = 0.6 # the land recovers while it heals —
			# a mended apex re-reads the SECTOR (leaving prey at 0.05 would
			# correctly wake it STARVING; that's the machine working, not the law under test)
			for i in range(30): # it licks its wounds at the den…
				_kb._nest_tick()
			# healthy endstates: FED, or the BREEDING beat if the loop lands on
			# the 5th fed read — both mean "mended and reading the land again"
			_check("…and comes BACK (mended past 70%%, healthy state)",
				(_kb.nest_state == ProtoKnifeback.Nest.FED or _kb.nest_state == ProtoKnifeback.Nest.BREEDING)
				and _kb.body.hp >= _kb.body.max_hp * 0.7)
			# stage the HUMAN-GATE trial: a FED nest with the player inside it
			kb_eco["prey_density"] = 0.6
			_kb._nest_tick() # FED
			main.player.global_position = _kb.nest_pos + Vector3(5, 0.4, 0)
			main.player.velocity = Vector3.ZERO
			_next()
		10: # F2 THE HUMAN GATE: a fed apex never hunts people
			if phase_t > 0.8:
				_check("F2: a FED apex never hunts humans (gate shut)",
					_kb._hunt == null or not _kb._hunt.is_in_group("player3d"))
				var eco3: Dictionary = main.population.cell_at(_kb.nest_pos)["eco"]
				eco3["prey_density"] = 0.02
				eco3["warn_count"] = 0
				_kb._nest_tick() # STARVING — but the land has not warned yet
				_kb._hunt = null # drop whatever mossback it latched onto — the
				# trial is about the HUMAN gate, and a busy jaw never re-scans
				main.player.global_position = _kb.nest_pos + Vector3(4, 0.4, 0)
				main.player.velocity = Vector3.ZERO
				_next()
		11: # F1 THE WARNING LADDER: the unwarned strike defers into a tell
			if phase_t > 1.0:
				var eco4: Dictionary = main.population.cell_at(_kb.nest_pos)["eco"]
				_check("F1: unwarned strike DEFERS into a tell (warn_count %d ≥ 1, not hunting)" % int(eco4.get("warn_count", 0)),
					int(eco4.get("warn_count", 0)) >= 1
					and (_kb._hunt == null or not _kb._hunt.is_in_group("player3d")))
				eco4["warn_count"] = 3 # the land has said its three pieces
				_kb._hunt = null # re-scan with the warnings spent
				_next()
		12: # F1+F2 armed: warned + STARVING → the road is meat; F4: noise widens
			if phase_t > 0.9:
				_check("F1/F2: warned + STARVING → it hunts the player",
					_kb._hunt != null and is_instance_valid(_kb._hunt) and _kb._hunt.is_in_group("player3d"))
				var eco5: Dictionary = main.population.cell_at(_kb.nest_pos)["eco"]
				var hn0: float = float(eco5.get("human_noise", 0.0))
				main.emit_noise(_kb.nest_pos, 60.0, "gunshot")
				main.emit_noise(_kb.nest_pos, 60.0, "engine")
				_check("F4: the land HEARS the racket (human_noise %.2f → %.2f)" % [hn0, float(eco5.get("human_noise", 0.0))],
					float(eco5.get("human_noise", 0.0)) > hn0 + 0.2)
				main.player.global_position = Vector3(-8600, 0.4, 6600) # out of its world
				_next()
		13: # F6 THE BAIT VERB + THE BACKFIRE
			if phase_t > 0.5:
				# bait: dropped meat DRAWS the land (corpse-heat deposit)
				var bait_cell: Dictionary = main.population.cell_at(main.player.global_position)
				var h0: float = float((bait_cell["eco"] as Dictionary).get("corpse_heat", 0.0))
				main.backpack.add("meat", 1)
				var dropped: bool = main.drop_item("meat")
				var h1: float = float((bait_cell["eco"] as Dictionary).get("corpse_heat", 0.0))
				_check("F6: dropped meat BAITS the land (heat %.2f → %.2f)" % [h0, h1],
					dropped and h1 >= h0 + 0.25)
				# backfire: rodents boom where the predators died (pure law)
				var fake := {"biome": "scrub", "zone_tag": "road_shoulder",
					"eco": {"food_avail": 0.6, "prey_density": 0.3, "predator_pressure": 0.8,
						"corpse_heat": 0.0, "water_rot": 0.25}}
				var with_pred: int = int(ProtoEcology.wildlife_desired(fake).get("rodent", 0))
				(fake["eco"] as Dictionary)["predator_pressure"] = 0.0
				var without_pred: int = int(ProtoEcology.wildlife_desired(fake).get("rodent", 0))
				_check("F6: rats INHERIT the earth when predators die (%d → %d)" % [with_pred, without_pred],
					without_pred > with_pred)
				_next()
		14: # F9 OFFLINE ECOLOGY: absence advances the floats, never spawns
			if phase_t > 0.4:
				var eco9: Dictionary = swamp_row["eco"]
				var prey0: float = float(eco9.get("prey_density", 0.0))
				var live0: int = get_tree().get_nodes_in_group("creature").size()
				var digest: Dictionary = main.world_state.run_offline_catchup(4, 12345)
				var prey1: float = float(eco9.get("prey_density", 0.0))
				var live1: int = get_tree().get_nodes_in_group("creature").size()
				_check("F9: 4 absent days MOVE the land (prey %.2f → %.2f)" % [prey0, prey1],
					absf(prey1 - prey0) > 0.01)
				_check("F9: offline advance NEVER spawns (%d → %d live)" % [live0, live1], live1 <= live0)
				_check("F9: the catchup returns a digest", digest.has("days") and int(digest["days"]) == 4)
				_next()
		15: # F7 THE BIRD LANGUAGE: marker law + formations + the ABSENT/positive pair
			if phase_t > 0.4:
				# pure law: heat draws birds — unless an apex owns the sky
				var fake7 := {"biome": "swamp", "zone_tag": "thick_forest",
					"eco": {"food_avail": 0.5, "prey_density": 0.4, "predator_pressure": 0.3,
						"corpse_heat": 0.6, "water_rot": 0.5}}
				var birds_ok: int = int(ProtoEcology.wildlife_desired(fake7).get("scavenger", 0))
				(fake7["eco"] as Dictionary)["predator_pressure"] = 0.8
				var birds_apex: int = int(ProtoEcology.wildlife_desired(fake7).get("scavenger", 0))
				_check("F7: heat draws BIRDS on open land (%d ≥ 1)" % birds_ok, birds_ok >= 1)
				_check("F7: NO-BIRDS where the apex owns the sky (%d == 0)" % birds_apex, birds_apex == 0)
				# marker law: you can't farm the read layer
				var v := ProtoCreature.create("road_vulture")
				main.add_child(v)
				v.global_position = main.player.global_position + Vector3(6, 3, 0)
				v.take_damage(999.0)
				_check("F7: a shot bird SCATTERS, never falls (alive, FLUSH)",
					is_instance_valid(v) and not v.dead and v.state == ProtoCreature.CState.FLUSH)
				# formation: a fresh corpse reads LOW+TIGHT
				var body7 := ProtoCorpse.create("Read target", {}, Color(0.4, 0.35, 0.3), Vector3.ZERO, main)
				main.add_child(body7)
				body7.global_position = main.player.global_position + Vector3(8, 0.3, 0)
				body7.heat = 1.0
				v.state = ProtoCreature.CState.CIRCLE
				v._sense_vulture()
				_check("F7: the formation SPEAKS freshness (read %.2f ≥ 0.8)" % v._read_fresh, v._read_fresh >= 0.8)
				v.queue_free()
				body7.queue_free()
				_next()
		16: # F7 THE GATHER: banked birds realize into the chunk you STAND in
			if phase_t > 0.3 and phase_t < 0.5:
				# park the stream's center (the active car) at the player's spot;
				# the bait already heated this cell — bank a bird and wait for
				# the 6 s re-materialize beat to spend it
				main.cars[0].global_position = main.player.global_position + Vector3(10, 1.0, 0)
				main.cars[0].linear_velocity = Vector3.ZERO
				# bank on the cell of the CAR'S CHUNK CENTER — that's the cell
				# the re-materialize beat spends (a player can straddle a 500 m
				# line from their own chunk's center)
				var gccx := int(floor(main.cars[0].global_position.x / 128.0))
				var gccz := int(floor(main.cars[0].global_position.z / 128.0))
				var gcenter := Vector3((gccx + 0.5) * 128.0, 0, (gccz + 0.5) * 128.0)
				var gcell: Dictionary = main.population.cell_at(gcenter)
				(gcell["eco"] as Dictionary)["corpse_heat"] = 0.6
				(gcell["eco"] as Dictionary)["predator_pressure"] = 0.2
				main.ecology.tick(1.0)
			elif phase_t > 9.0:
				var gathered := 0
				for n in get_tree().get_nodes_in_group("creature"):
					if n is ProtoCreature and (n as ProtoCreature).kind == "road_vulture" 							and is_instance_valid(n) 							and (n as Node3D).global_position.distance_to(main.player.global_position) < 300.0:
						gathered += 1
				_check("F7: birds GATHER over the watched kill (%d ≥ 1, no chunk reload)" % gathered, gathered >= 1)
				_next()
		17:
			_finish()

	if t > 90.0:
		print("CREATURES: TIMEOUT in phase %d" % phase)
		print("CREATURES RESULTS: %d passed, %d failed" % [checks_passed, checks_failed])
		get_tree().quit(1)
