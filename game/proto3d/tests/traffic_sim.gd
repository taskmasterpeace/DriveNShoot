## Proof for THE TRAFFIC SYSTEM (docs/design/ROAD_TRAFFIC_OVERHAUL.md §3.4):
## lightweight agents on the road polylines (the paths) — right-hand lane law,
## car-following (never through a leader), EXITS as the only way off the highway
## (agent takes a ramp to a location and despawns at its end), spawn budget +
## despawn band, and PROMOTION: touch one (bullet or bumper) and it becomes a
## REAL ProtoCar3D with the damage forwarded. Knobs are TRAFFIC rows folded from
## data/traffic.json (the motions.json law). The sim drives the system's own
## _tick with a manual clock (the ProtoStrikePlayer determinism pattern).
## Run: godot --headless --path game res://proto3d/tests/traffic_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node3D


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("TRAFFIC: %s - %s" % ["PASS" if ok else "FAIL", check_name])


## Right of travel for a 2D heading (x east, z south): rotate -90 deg about UP.
func _right_of(d: Vector2) -> Vector2:
	return Vector2(-d.y, d.x)


func _ready() -> void:
	print("TRAFFIC: start")
	get_tree().create_timer(120.0).timeout.connect(func() -> void:
		print("TRAFFIC: WATCHDOG")
		print("TRAFFIC: FAILURES PRESENT")
		get_tree().quit(1))

	# === 1. THE ROWS + the fold law (code floor, data/traffic.json overlays) ======
	_check("TRAFFIC rows exist (budget/headway_s/exit_take_chance/speed_lanes_2..6/promote_cap)",
		ProtoTraffic.TRAFFIC.has("budget") and ProtoTraffic.TRAFFIC.has("headway_s")
		and ProtoTraffic.TRAFFIC.has("exit_take_chance") and ProtoTraffic.TRAFFIC.has("speed_lanes_2")
		and ProtoTraffic.TRAFFIC.has("speed_lanes_4") and ProtoTraffic.TRAFFIC.has("speed_lanes_6")
		and ProtoTraffic.TRAFFIC.has("promote_cap"))
	var f := FileAccess.open("user://test_traffic.json", FileAccess.WRITE)
	f.store_string(JSON.stringify({"traffic": {"budget": 3.0, "made_up_knob": 7.0}}))
	f.close()
	var into: Dictionary = {"budget": 12.0, "headway_s": 1.6}
	ProtoTraffic.fold_file(into, "user://test_traffic.json")
	DirAccess.remove_absolute("user://test_traffic.json")
	_check("data OVERRIDES the floor, number by number", is_equal_approx(float(into["budget"]), 3.0))
	_check("untouched knobs keep stock", is_equal_approx(float(into["headway_s"]), 1.6))
	_check("unknown knobs are welcomed (open schema)", into.has("made_up_knob"))

	# === Boot the real game ========================================================
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 8:
		await get_tree().process_frame
	_check("main owns a ProtoTraffic node", main.traffic != null and main.traffic is ProtoTraffic)
	var traffic: ProtoTraffic = main.traffic
	traffic.set_physics_process(false) # the sim owns the clock from here (deterministic)
	traffic.rng.seed = hash("traffic_sim")
	ProtoTraffic.TRAFFIC["budget"] = 0.0        # no ambient spawns under the sim
	ProtoTraffic.TRAFFIC["despawn_r"] = 999999.0 # staged agents live far from the player

	# === 2. RIGHT-HAND LAW: both directions sit on their own side ==================
	# I-95 segment [2250,-2500]->[1500,-250]: spawn one agent per direction, lane 0.
	var a_fwd: Node3D = traffic.spawn_agent("I-95", 3, 400.0, 0, 1)
	var a_back: Node3D = traffic.spawn_agent("I-95", 3, 800.0, 0, -1)
	traffic._tick(0.016)
	var seg_a := Vector2(2250, -2500)
	var seg_b := Vector2(1500, -250)
	var seg_d := (seg_b - seg_a).normalized()
	var fwd_off := Vector2(a_fwd.global_position.x, a_fwd.global_position.z) - (seg_a + seg_d * 400.0)
	var back_off := Vector2(a_back.global_position.x, a_back.global_position.z) - (seg_a + seg_d * 800.0)
	_check("dir +1 rides the RIGHT of a->b travel (dot %.1f > 0)" % fwd_off.dot(_right_of(seg_d)),
		fwd_off.dot(_right_of(seg_d)) > 0.5)
	_check("dir -1 rides the RIGHT of b->a travel (dot %.1f > 0)" % back_off.dot(_right_of(-seg_d)),
		back_off.dot(_right_of(-seg_d)) > 0.5)
	var road_row: Dictionary = {}
	for r in main.stream.usmap.roads:
		if String(r["id"]) == "I-95":
			road_row = r
	_check("the lateral magnitude IS the geometry law's lane_offset (%.1f vs %.1f)" %
		[fwd_off.length(), ProtoUSMap.lane_offset(road_row, 0)],
		absf(fwd_off.length() - ProtoUSMap.lane_offset(road_row, 0)) < 0.2)
	_check("agents MOVE along the path when ticked", _agent_advances(traffic, a_fwd))
	traffic.despawn_agent(a_fwd)
	traffic.despawn_agent(a_back)

	# === 3. CAR-FOLLOWING: a follower never drives through its leader =============
	var leader: Node3D = traffic.spawn_agent("I-95", 3, 500.0, 0, 1)
	traffic.set_agent_speed(leader, 4.0) # a crawler
	var chaser: Node3D = traffic.spawn_agent("I-95", 3, 440.0, 0, 1)
	traffic.set_agent_speed(chaser, 24.0)
	var min_gap := 999.0
	for _i in 240: # 12 simulated seconds
		traffic._tick(0.05)
		min_gap = minf(min_gap, chaser.global_position.distance_to(leader.global_position))
	_check("the chaser slowed to its leader (%.1f m/s <= 4.8)" % traffic.agent_speed(chaser),
		traffic.agent_speed(chaser) <= 4.8)
	_check("...and NEVER passed through (min gap %.1fm >= 4)" % min_gap, min_gap >= 4.0)
	traffic.despawn_agent(leader)
	traffic.despawn_agent(chaser)

	# === 4. EXITS ARE THE CONNECTIONS: the agent leaves at the ramp, to the town ==
	ProtoTraffic.TRAFFIC["exit_take_chance"] = 1.0
	# I-95 seg 4 [1500,-250]->[-1000,4250]; the Meridian exit anchors at (1204,283),
	# ~610m in. Spawn 400m in, dir +1 — the ramp departs the travel side.
	var exiter: Node3D = traffic.spawn_agent("I-95", 4, 400.0, 0, 1)
	traffic.set_agent_speed(exiter, 25.0)
	var took_ramp := false
	var despawned := false
	for _i in 1500: # the ramp is ~1.25km at 2-lane cruise (±jitter) — give it room
		traffic._tick(0.1)
		# queue_free can't land mid-frame (this whole loop is one frame) — the
		# system's own ledger is the honest despawn signal.
		if not traffic.agents.has(exiter):
			despawned = true
			break
		if traffic.agent_road(exiter) == "EXIT-meridian":
			took_ramp = true
	_check("the agent TOOK the exit (transferred onto the ramp polyline)", took_ramp)
	_check("...and despawned at the ramp's end — gone to the location", despawned)

	# === 5. PROMOTION: a bullet makes it REAL =====================================
	ProtoTraffic.TRAFFIC["promote_cap"] = 1.0
	var victim: Node3D = traffic.spawn_agent("I-95", 3, 600.0, 0, 1)
	traffic._tick(0.016)
	var vpos := victim.global_position
	var cars_before: int = main.cars.size()
	victim.take_damage(12.0)
	await get_tree().process_frame
	_check("take_damage PROMOTES the agent to a real ProtoCar3D", main.cars.size() == cars_before + 1)
	_check("...at the agent's own transform (%.1fm off)" % (main.cars[-1].global_position.distance_to(vpos) if main.cars.size() > cars_before else 999.0),
		main.cars.size() > cars_before and main.cars[-1].global_position.distance_to(vpos) < 3.0)
	_check("...with the damage FORWARDED (chassis hp below max)",
		main.cars.size() > cars_before
		and (main.cars[-1].components["chassis"] as Damageable).hp < (main.cars[-1].components["chassis"] as Damageable).max_hp)
	_check("...and the agent itself is gone", not is_instance_valid(victim))
	# At cap: the next touch despawns, never a physics storm.
	var victim2: Node3D = traffic.spawn_agent("I-95", 3, 640.0, 0, 1)
	traffic._tick(0.016)
	var cars_at_cap: int = main.cars.size()
	victim2.take_damage(12.0)
	await get_tree().process_frame
	_check("at promote_cap a touch DESPAWNS instead (car count held at %d)" % cars_at_cap,
		main.cars.size() == cars_at_cap and not is_instance_valid(victim2))

	# === 6. BUDGET + THE BAND: ambient maintenance spawns near, culls far =========
	ProtoTraffic.TRAFFIC["budget"] = 5.0
	ProtoTraffic.TRAFFIC["despawn_r"] = 550.0
	# Stage the ANCHOR onto the I-95 corridor (staging positions: the documented
	# exception). The player boots IN the car (enter_car at _ready), so the
	# anchor is the ACTIVE CAR — move that.
	main.active_car.global_position = Vector3(1875.0, 1.0, -1375.0)
	for _i in 40:
		traffic._tick(0.1)
	var n_spawned: int = traffic.agents.size()
	_check("maintenance fills toward the budget near a road (%d in 1..5)" % n_spawned,
		n_spawned >= 1 and n_spawned <= 5)
	_check("...and never exceeds it", traffic.agents.size() <= 5)
	main.active_car.global_position = Vector3(-30000.0, 1.0, -18000.0) # nowhere near those agents
	for _i in 30:
		traffic._tick(0.1)
	_check("agents beyond the band are CULLED when the player leaves (%d left)" % traffic.agents.size(),
		traffic.agents.size() == 0 or _all_near(traffic, main.player.global_position, 600.0))

	# === 7. PLAYTEST P0s (owner, 2026-07-07 evening): highway-only, no ghosts, ===
	# === no vanishing in view, and every car is GOING SOMEWHERE ==================
	ProtoTraffic.TRAFFIC["budget"] = 0.0
	ProtoTraffic.TRAFFIC["despawn_r"] = 999999.0
	for a in traffic.agents.duplicate():
		traffic.despawn_agent(a)

	# 7a. Ambient spawns are INTERSTATE-ONLY (the junction chunk sees the ramp too —
	# a spawn must never land on it).
	main.active_car.global_position = Vector3(1216.0, 1.0, 320.0) # the ramp junction
	ProtoTraffic.TRAFFIC["budget"] = 6.0
	ProtoTraffic.TRAFFIC["despawn_r"] = 550.0
	for _i in 80:
		traffic._tick(0.1)
	var all_interstate := true
	for a2 in traffic.agents:
		if String(traffic._road(traffic.agent_road(a2)).get("kind", "")) != "interstate":
			all_interstate = false
	_check("ambient spawns land on INTERSTATES only, never a ramp (%d agents)" % traffic.agents.size(),
		traffic.agents.size() > 0 and all_interstate)
	ProtoTraffic.TRAFFIC["budget"] = 0.0
	ProtoTraffic.TRAFFIC["despawn_r"] = 999999.0
	for a3 in traffic.agents.duplicate():
		traffic.despawn_agent(a3)

	# 7b. A ramp agent NEVER drives into hand-built land: the Meridian ramp ends
	# inside the safehouse compound — the agent must ARRIVE at the AUTHORED edge.
	# Player staged FAR: arrival off-view = despawn, and no position ever inside.
	main.active_car.global_position = Vector3(-20000.0, 1.0, -8000.0)
	var ramper: Node3D = traffic.spawn_agent("EXIT-meridian", 0, 0.0, 0, 1)
	traffic.set_agent_speed(ramper, 25.0)
	var entered_authored := false
	for _i in 800:
		traffic._tick(0.1)
		if not traffic.agents.has(ramper):
			break
		var p2 := Vector2(ramper.global_position.x, ramper.global_position.z)
		if ProtoWorldStream.AUTHORED.has_point(p2):
			entered_authored = true
	_check("the ramp agent NEVER enters the hand-built compound (the dirt-driving bug)",
		not entered_authored)
	_check("...and it resolved off-view (despawned at the boundary)", not traffic.agents.has(ramper))

	# 7c. IN VIEW an arrival never vanishes — it becomes a real PARKED car.
	main.active_car.global_position = Vector3(340.0, 1.0, -180.0) # near the compound edge, in view of the ramp mouth
	var cars_n: int = main.cars.size()
	traffic._promoted.clear() # free the promote cap for the arrival
	var ramper2: Node3D = traffic.spawn_agent("EXIT-meridian", 0, 0.0, 0, 1)
	traffic.set_agent_speed(ramper2, 25.0)
	for _i in 800:
		traffic._tick(0.1)
		if not traffic.agents.has(ramper2):
			break
	_check("an arrival IN VIEW promotes to a real PARKED car, never a vanish",
		main.cars.size() == cars_n + 1)
	var arrival_car: Node3D = null
	if main.cars.size() > cars_n:
		arrival_car = main.cars[-1]
		_check("...stationary at the compound's edge, outside hand-built land",
			not ProtoWorldStream.AUTHORED.has_point(Vector2(arrival_car.global_position.x, arrival_car.global_position.z)))

	# 7d. Agents stop behind ANY real car — a PARKED rig in the lane, not just the
	# player's active one (the ghosting-through-the-red-car bug).
	var blocker := ProtoCar3D.create("pickup", Color(0.7, 0.2, 0.2))
	main.add_child(blocker)
	main.cars.append(blocker)
	var seg_a2 := Vector2(2250, -2500)
	var seg_d2 := (Vector2(1500, -250) - seg_a2).normalized()
	var lane_off := Vector2(-seg_d2.y, seg_d2.x) * ProtoUSMap.lane_offset(traffic._road("I-95"), 0)
	var block_pt := seg_a2 + seg_d2 * 700.0 + lane_off
	blocker.global_position = Vector3(block_pt.x, 0.6, block_pt.y)
	var chaser2: Node3D = traffic.spawn_agent("I-95", 3, 560.0, 0, 1)
	traffic.set_agent_speed(chaser2, 24.0)
	var min_gap2 := 999.0
	for _i in 200:
		traffic._tick(0.05)
		if traffic.agents.has(chaser2):
			min_gap2 = minf(min_gap2, chaser2.global_position.distance_to(blocker.global_position))
	_check("an agent STOPS behind a PARKED rig in its lane (min gap %.1fm >= 4)" % min_gap2,
		min_gap2 >= 4.0)
	traffic.despawn_agent(chaser2)
	main.cars.erase(blocker)
	blocker.queue_free()

	# 7e. EVERY ambient car has a TRIP: spawn far up I-95 with the Meridian exit as
	# its DESTINATION and exit_take_chance 0 — the trip overrides the dice, it rides
	# the highway down and leaves at ITS exit ("they're trying to go somewhere").
	ProtoTraffic.TRAFFIC["exit_take_chance"] = 0.0
	main.active_car.global_position = Vector3(-20000.0, 1.0, -8000.0) # off-view: the arrival resolves by despawn
	# Clear 7c's parked arrival off the single-lane ramp first — the trip agent
	# correctly QUEUES behind any car on its road (that's 7d's law working), and
	# a permanent roadblock would stall this proof forever.
	if arrival_car != null and is_instance_valid(arrival_car):
		main.cars.erase(arrival_car)
		arrival_car.queue_free()
	await get_tree().process_frame
	var tripper: Node3D = traffic.spawn_agent("I-95", 3, 100.0, 0, 1)
	traffic.set_agent_trip(tripper, "I-95_X1")
	traffic.set_agent_speed(tripper, 30.0)
	var trip_took_ramp := false
	for _i in 2400: # ~2.9km of highway + 1.25km of ramp at 2-lane cruise
		traffic._tick(0.1)
		if not traffic.agents.has(tripper):
			break
		if traffic.agent_road(tripper) == "EXIT-meridian":
			trip_took_ramp = true
	_check("a TRIP agent leaves at ITS destination exit even at exit_take_chance 0", trip_took_ramp)
	_check("...and resolved at the destination (city-to-city, proven end to end)",
		not traffic.agents.has(tripper))

	# === 8. CONVOYS v1 (BANDIT_CONVOY_ECOSYSTEM.md §3.1, Acceptance 1) ============
	traffic._promoted.clear()
	ProtoTraffic.TRAFFIC["promote_cap"] = 5.0
	main.active_car.global_position = Vector3(1875.0, 1.0, -1375.0) # back in view of the column
	var lead: Node3D = traffic.spawn_agent("I-95", 3, 300.0, 0, 1)
	traffic.set_agent_trip(lead, "I-95_X1")
	var column: Array = traffic.spawn_convoy_behind(lead, 2, "scrap")
	_check("a convoy is a 2-3 truck COLUMN (got %d)" % column.size(), column.size() == 3)
	var shared := true
	for cm in column:
		if traffic.agent_road(cm) != "I-95" or (cm as Node3D).get("dest_exit_id") != "I-95_X1" \
				or (cm as Node3D).get("convoy_id") == "":
			shared = false
	_check("...sharing ONE destination and ONE convoy id", shared)
	for _i in 60:
		traffic._tick(0.05)
	var gap01: float = (column[0] as Node3D).global_position.distance_to((column[1] as Node3D).global_position)
	var gap12: float = (column[1] as Node3D).global_position.distance_to((column[2] as Node3D).global_position)
	_check("the column HOLDS together on the move (gaps %.0fm/%.0fm, both 6-40m)" % [gap01, gap12],
		gap01 > 6.0 and gap01 < 40.0 and gap12 > 6.0 and gap12 < 40.0)
	var cars_before2: int = main.cars.size()
	(column[0] as Node3D).take_damage(10.0)
	await get_tree().process_frame
	_check("touching ONE truck makes the WHOLE CONVOY real (+3 cars, got +%d)" % (main.cars.size() - cars_before2),
		main.cars.size() == cars_before2 + 3)
	var hauls_cargo := false
	for ci in range(cars_before2, main.cars.size()):
		var trunk: ProtoContainer = main.cars[ci].trunk
		if trunk != null and trunk.count("scrap") >= 5:
			hauls_cargo = true
	_check("...and the trucks HAUL their cargo row (scrap in a trunk)", hauls_cargo)

	print("TRAFFIC RESULTS: %d passed, %d failed" % [passed, failed])
	print("TRAFFIC: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)


func _agent_advances(traffic: ProtoTraffic, agent: Node3D) -> bool:
	var before := agent.global_position
	for _i in 30:
		traffic._tick(0.05)
	return agent.global_position.distance_to(before) > 5.0


func _all_near(traffic: ProtoTraffic, pos: Vector3, r: float) -> bool:
	for a in traffic.agents:
		if is_instance_valid(a) and a.global_position.distance_to(pos) > r:
			return false
	return true
