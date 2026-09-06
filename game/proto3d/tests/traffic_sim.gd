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
	# THE DENSIFY LAW: the relief bake inserts polyline midpoints, so vertex
	# INDICES drift between bakes — survey segments by their corner COORDINATES.
	var pts95: PackedVector2Array = traffic._road("I-95")["pts"]
	var s3 := _seg_at(pts95, Vector2(2250, -2500))
	var s4 := _seg_at(pts95, Vector2(1500, -250))

	# === 2. RIGHT-HAND LAW: both directions sit on their own side ==================
	# I-95 segment [2250,-2500]->[1500,-250]: spawn one agent per direction, lane 0.
	var a_fwd: Node3D = traffic.spawn_agent("I-95", s3, 400.0, 0, 1)
	var a_back: Node3D = traffic.spawn_agent("I-95", s3, 800.0, 0, -1)
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
	var leader: Node3D = traffic.spawn_agent("I-95", s3, 500.0, 0, 1)
	traffic.set_agent_speed(leader, 4.0) # a crawler
	var chaser: Node3D = traffic.spawn_agent("I-95", s3, 440.0, 0, 1)
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
	var exiter: Node3D = traffic.spawn_agent("I-95", s4, 400.0, 0, 1)
	traffic.set_agent_speed(exiter, 25.0)
	# Since the 0.18b mirrors an exit owns ramps for BOTH directions (+ the
	# legacy row) — landing on ANY of ITS ramp_ids is "took the exit".
	var mer_ramp_ids: Array = []
	for me in traffic.usmap.exits:
		if String((me as Dictionary)["id"]) == "I-95_X1":
			mer_ramp_ids = (me as Dictionary).get("ramp_ids", [])
	var took_ramp := false
	var despawned := false
	for _i in 1500: # the ramp is ~1.25km at 2-lane cruise (±jitter) — give it room
		traffic._tick(0.1)
		# queue_free can't land mid-frame (this whole loop is one frame) — the
		# system's own ledger is the honest despawn signal.
		if not traffic.agents.has(exiter):
			despawned = true
			break
		if mer_ramp_ids.has(traffic.agent_road(exiter)):
			took_ramp = true
	_check("the agent TOOK the exit (transferred onto the ramp polyline)", took_ramp)
	_check("...and despawned at the ramp's end — gone to the location", despawned)

	# === 5. PROMOTION: a bullet makes it REAL =====================================
	ProtoTraffic.TRAFFIC["promote_cap"] = 1.0
	var victim: Node3D = traffic.spawn_agent("I-95", s3, 600.0, 0, 1)
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
	var victim2: Node3D = traffic.spawn_agent("I-95", s3, 640.0, 0, 1)
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
	# A streamed-out car can remain in the main ledger for a frame. Validity
	# must be checked BEFORE the type operator, and the scan must still find
	# the real living leader after that entry (returning null is not a fix).
	var stale := ProtoCar3D.create("scavenger", Color.WHITE)
	main.cars.push_front(stale)
	stale.free()
	var lifetime_chaser: Node3D = traffic.spawn_agent("I-95", s3, 650.0, 0, 1)
	_check("freed ledger entry does not hide valid car ahead", traffic._car_ahead(lifetime_chaser) == blocker)
	main.cars.pop_front()
	traffic.despawn_agent(lifetime_chaser)
	var chaser2: Node3D = traffic.spawn_agent("I-95", s3, 560.0, 0, 1)
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
	var tripper: Node3D = traffic.spawn_agent("I-95", s3, 100.0, 0, 1)
	traffic.set_agent_trip(tripper, "I-95_X1")
	traffic.set_agent_speed(tripper, 30.0)
	var trip_took_ramp := false
	for _i in 2400: # ~2.9km of highway + 1.25km of ramp at 2-lane cruise
		traffic._tick(0.1)
		if not traffic.agents.has(tripper):
			break
		if mer_ramp_ids.has(traffic.agent_road(tripper)):
			trip_took_ramp = true
	_check("a TRIP agent leaves at ITS destination exit even at exit_take_chance 0", trip_took_ramp)
	_check("...and resolved at the destination (city-to-city, proven end to end)",
		not traffic.agents.has(tripper))

	# === 8. CONVOYS v1 (BANDIT_CONVOY_ECOSYSTEM.md §3.1, Acceptance 1) ============
	traffic._promoted.clear()
	ProtoTraffic.TRAFFIC["promote_cap"] = 5.0
	main.active_car.global_position = Vector3(1875.0, 1.0, -1375.0) # back in view of the column
	var lead: Node3D = traffic.spawn_agent("I-95", s3, 300.0, 0, 1)
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
	await _diamond_arrival_regression()

	print("TRAFFIC RESULTS: %d passed, %d failed" % [passed, failed])
	print("TRAFFIC: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)


## Deterministic reproduction of the real ramp-end blocker, independent of
## random drive timing. Both arrival paths must keep the connecting roads clear.
func _diamond_arrival_regression() -> void:
	var map: ProtoUSMap = main.stream.usmap
	var ramp: Dictionary = map.road_by_id("I-90_X11-off")
	var points: PackedVector2Array = ramp["pts"]
	var last := points.size() - 2
	var length := points[last].distance_to(points[last + 1])
	var junction: Vector2 = points[-1]
	var observer := junction + Vector2(30,30)
	main.active_car.global_position = Vector3(observer.x, ProtoWorldBuilder.ground_y(observer.x,observer.y)+1.2, observer.y)
	main.active_car.linear_velocity = Vector3.ZERO # pre-fixture observer staging only
	for index: int in 70:
		main.stream.update_stream(main.active_car.global_position, main)
		await get_tree().physics_frame
	var queries: Array[PhysicsShapeQueryParameters3D] = []
	for id: String in ["I-90_X11-crossroad", "I-90_X11-town-link"]:
		var road: Dictionary = map.road_by_id(id)
		var road_points: PackedVector2Array = road["pts"]
		var a: Vector2 = road_points[0]
		var b: Vector2 = road_points[1]
		var middle := (a+b)*0.5
		var height := ProtoUSMap.elev_at(road,a.distance_to(b)*0.5)+0.09
		var shape := BoxShape3D.new()
		shape.size = Vector3(float(ProtoUSMap.road_geometry(road)["width"]),2.2,a.distance_to(b)+0.02)
		var query := PhysicsShapeQueryParameters3D.new()
		query.shape = shape
		query.transform = Transform3D(Basis(Vector3.UP,atan2(b.x-a.x,b.y-a.y)),Vector3(middle.x,height+1.35,middle.y))
		query.collision_mask = 1 # every body participates; no exclusions
		queries.append(query)
		var floor_point := Vector3(middle.x,height,middle.y)
		var floor_hit: Dictionary = main.get_world_3d().direct_space_state.intersect_ray(PhysicsRayQueryParameters3D.create(floor_point+Vector3.UP*0.2,floor_point-Vector3.UP*0.2,1))
		_check("arrival fixture %s has real connecting-road floor" % id, not floor_hit.is_empty())
	_check("arrival fixture retains stock promotion cap5", int(ProtoTraffic.TRAFFIC["promote_cap"]) == 5)
	for full_cap: bool in [false,true]:
		# Independent actual traffic owner: never fabricate its registry or alter
		# the live-drive traffic budget/seed. This sim already owns a manual clock.
		var fixture := ProtoTraffic.create(main,map)
		main.add_child(fixture)
		fixture.set_physics_process(false)
		if full_cap:
			for index: int in 5:
				var capacity_agent: Node3D = fixture.spawn_agent("I-90",0,50.0+float(index)*25.0,0,1)
				fixture.promote(capacity_agent,0.0,true)
			_check("full-cap fixture contains five real production-promoted cars", fixture._promoted.size() == 5)
		var agent := fixture.spawn_agent("I-90_X11-off",last,length-0.11,0,1) as ProtoTraffic.TrafficAgent
		fixture.set_agent_speed(agent,5.0)
		_check("endpoint fixture starts without a projected real-car leader", fixture._car_ahead(agent) == null)
		var original := agent.global_position
		fixture._tick(0.05) # actual advance crosses the endpoint and invokes arrival
		var arrival_body := _trip_body(fixture,agent,5 if full_cap else 0)
		_check("arrival fixture preserves original or genuinely promoted body", is_instance_valid(arrival_body))
		if not is_instance_valid(arrival_body):
			fixture.queue_free()
			continue
		for frame: int in 3:
			await get_tree().physics_frame
		var phase := "full-cap" if full_cap else "capacity-available"
		print("TRAFFIC ARRIVAL phase=%s original=%s body=%s position=%s promoted=%d" % [phase,original,arrival_body.get_path(),arrival_body.global_position,fixture._promoted.size()])
		if is_instance_valid(agent):
			print("TRAFFIC ARRIVAL AGENT registered=%s road=%s seg=%d s_ab=%.3f dir=%d speed=%.3f cruise=%.3f arrived=%s leader=%s" % [fixture.agents.has(agent),agent.road_id,agent.seg_i,agent.s_ab,agent.dir,agent.speed,agent.cruise,agent.arrived,fixture._car_ahead(agent)])
		var initial := _arrival_body_boxes(queries,arrival_body,phase+" initial")
		for step: int in 240:
			fixture._tick(0.05)
		for frame: int in 3:
			await get_tree().physics_frame
		arrival_body = _trip_body(fixture,agent,5 if full_cap else 0)
		var final := _arrival_body_boxes(queries,arrival_body,phase+" after12trafficseconds")
		print("TRAFFIC ARRIVAL ENVELOPE phase=%s initial_arrival_boxes=%d final_arrival_boxes=%d exclusions=0" % [phase,initial,final])
		_check("%s arrival leaves crossroad and feeder free of its parked collider" % phase, is_instance_valid(arrival_body) and final == 0)
		# Cleanup only these fixture-owned actors, never ambient route traffic.
		for car: Node3D in fixture._promoted.duplicate():
			main.cars.erase(car)
			car.queue_free()
		fixture.queue_free()
		await get_tree().physics_frame
		await get_tree().physics_frame
	await _managed_trip_regressions(map)


## Actual Seattle geometry stays materialized while the manual traffic clock
## crosses the bridge and reaches the far town end; no actor is moved by tests.
func _managed_trip_regressions(map: ProtoUSMap) -> void:
	var canonical := map.roads.duplicate(true)
	var cells: Dictionary = {}
	var owned: Array[Node3D] = []
	for id: String in ["I-90_X11-crossroad","I-90_X11-town-link"]:
		for point: Vector2 in map.road_by_id(id)["pts"]:
			for x: int in range(-1,2):
				for z: int in range(-1,2):
					cells[Vector2i(floori(point.x/128.0)+x,floori(point.y/128.0)+z)] = true
	for cell: Vector2i in cells:
		if main.stream.loaded.has("%d,%d" % [cell.x,cell.y]):
			continue
		var chunk: Node3D = main.stream._spawn_chunk(cell.x,cell.y)
		if chunk != null:
			if chunk.has_meta("relief"):
				main.stream._drape_chunk(chunk)
			owned.append(chunk)
	for frame: int in 4:
		await get_tree().physics_frame
	# One fixed observer covers both ramp terminals and the bridge. The distant
	# final approach may legitimately resolve off-view; nearby parking is a
	# separate test below, not a reason to change the production visibility law.
	var bridge_points: PackedVector2Array = map.road_by_id("I-90_X11-crossroad")["pts"]
	_stage_trip_observer((bridge_points[0]+bridge_points[-1])*0.5+Vector2(35,0))
	for id: String in ["I-90_X11-off","I-90_X11-off-r"]:
		for full_cap: bool in [false,true]:
			var fixture := _trip_fixture(map,full_cap,"I-90",50.0,25.0)
			var road: Dictionary = map.road_by_id(id)
			var points: PackedVector2Array = road["pts"]
			var last := points.size()-2
			var agent := fixture.spawn_agent(id,last,points[last].distance_to(points[-1])-0.11,0,1) as ProtoTraffic.TrafficAgent
			fixture.set_agent_speed(agent,12.0)
			fixture.set_agent_trip(agent,"I-90_X11")
			var visited: Array[String] = [id]
			var bounded := true
			var trip_retained := true
			var bridge_samples := 0
			var bridge_valid := true
			var ticks := 0
			var last_position := agent.global_position
			for step: int in 3600: # <=180 traffic seconds; never shortens the trip
				ticks += 1
				var before := agent.global_position
				var speed_before := agent.speed
				last_position = before
				fixture._tick(0.05)
				if not fixture.agents.has(agent):
					break # a genuine promotion, checked for safe destination below
				bounded = bounded and before.distance_to(agent.global_position) <= maxf(speed_before,agent.speed)*0.05+0.02
				last_position = agent.global_position
				trip_retained = trip_retained and agent.dest_exit_id == "I-90_X11"
				if not visited.has(agent.road_id):
					visited.append(agent.road_id)
				if agent.road_id == "I-90_X11-crossroad" and absf(fixture._travel_arc(agent)-180.0) < 8.0:
					bridge_samples += 1
					var deck := ProtoUSMap.elev_at(map.road_by_id(agent.road_id),180.0)+0.09
					var ray := PhysicsRayQueryParameters3D.create(agent.global_position+Vector3.UP,agent.global_position-Vector3.UP*2.0,1)
					ray.exclude = [agent.get_rid()] # supporting floor only: ignore the measured actor itself
					var hit: Dictionary = main.get_world_3d().direct_space_state.intersect_ray(ray)
					bridge_valid = bridge_valid and absf(agent.global_position.y-deck-0.62)<0.2 and not hit.is_empty() and String(hit["collider"].get_meta("road_deck","")) == agent.road_id
				if agent.arrived:
					break
			var phase := "%s cap=%s" % [id,full_cap]
			var expected: Array[String] = [id,"I-90_X11-town-link"]
			if id == "I-90_X11-off-r":
				expected.insert(1,"I-90_X11-crossroad")
			print("TRAFFIC MANAGED TRIP %s visited=%s seconds=%.2f bridge_samples=%d bridge_valid=%s" % [phase,visited,float(ticks)*0.05,bridge_samples,bridge_valid])
			_check("%s follows only its declared connectors to town" % phase, visited == expected)
			_check("%s lane transitions are speed bounded, not endpoint teleports" % phase,bounded)
			_check("%s retains its actual trip identity" % phase,trip_retained)
			if id == "I-90_X11-off-r":
				_check("%s crosses ON the actual elevated bridge deck" % phase,bridge_samples>0 and bridge_valid)
			var body := _trip_body(fixture,agent,5 if full_cap else 0)
			if is_instance_valid(body):
				last_position = body.global_position
			var destination := Vector2(-56555,-18090)
			var reached := Vector2(last_position.x,last_position.z).distance_to(destination)<80.0
			var off_view := last_position.distance_to(fixture._anchor()) >= float(ProtoTraffic.TRAFFIC["vanish_r_min"])
			print("TRAFFIC TRIP RESOLUTION %s last=%s body_present=%s destination_approach=%s off_view=%s" % [phase,last_position,is_instance_valid(body),reached,off_view])
			_check("%s reaches the bounded final destination approach" % phase,reached)
			_check("%s resolves only after all connectors and at its destination" % phase,visited==expected and reached and (is_instance_valid(body) or off_view))
			await _free_trip_fixture(fixture)
	await _final_arrival_regressions(map)
	await _managed_convoy_arrival_regression(map)
	_check("managed traffic tests preserve every canonical road row",map.roads == canonical)
	for chunk: Node3D in owned:
		chunk.queue_free()
	await get_tree().physics_frame
	await _unsafe_parking_regressions(map)


func _stage_trip_observer(point: Vector2) -> void:
	# Staging is between independent trips only. No observer movement under tick.
	main.active_car.global_position = Vector3(point.x,ProtoWorldBuilder.ground_y(point.x,point.y)+1.2,point.y)
	main.active_car.linear_velocity = Vector3.ZERO


func _final_arrival_regressions(map: ProtoUSMap) -> void:
	var road: Dictionary = map.road_by_id("I-90_X11-town-link")
	_stage_trip_observer(Vector2(-56555,-18055))
	for full_cap: bool in [false,true]:
		var fixture := _trip_fixture(map,full_cap,"I-90",50,25)
		var cumulative := fixture._cum(road)
		var arc: float = cumulative[-1]-80.0
		var segment := 0
		while segment+1<cumulative.size()-1 and cumulative[segment+1]<arc:
			segment += 1
		var agent := fixture.spawn_agent(String(road["id"]),segment,arc-cumulative[segment],0,1) as ProtoTraffic.TrafficAgent
		fixture.set_agent_speed(agent,12)
		fixture.set_agent_trip(agent,"I-90_X11")
		var bounded := true
		for step: int in 2400:
			var before := agent.global_position
			var speed_before := agent.speed
			fixture._tick(0.05)
			if not fixture.agents.has(agent):
				break
			bounded = bounded and before.distance_to(agent.global_position)<=maxf(speed_before,agent.speed)*0.05+0.02
			if agent.arrived:
				break
		var phase := "nearby final arrival cap=%s" % full_cap
		var body := _trip_body(fixture,agent,5 if full_cap else 0)
		_check(phase+" retains a visible original or promoted actor",is_instance_valid(body))
		_check(phase+" approaches its plot without teleporting",bounded)
		if is_instance_valid(body):
			for frame: int in 30:
				await get_tree().physics_frame
			_check_trip_plot(body as PhysicsBody3D,phase)
			var safe_cap_state := body is ProtoCar3D and fixture._promoted.size()==1
			if full_cap:
				safe_cap_state = body is ProtoTraffic.TrafficAgent and fixture.agents.has(body) and body.arrived and fixture._promoted.size()==5
			_check(phase+" resolves arrival under the actual stock cap",safe_cap_state)
		await _free_trip_fixture(fixture)


## Isolated geometry, actual traffic: accepting an occupied, unsupported, steep
## or entry-blocked plot must fail even when its final center looks convenient.
## The clear control prevents an implementation that rejects every pull-over.
func _managed_convoy_arrival_regression(map: ProtoUSMap) -> void:
	_stage_trip_observer(Vector2(-56555,-18055))
	var fixture := _trip_fixture(map,false,"I-90",50,25)
	var road: Dictionary = map.road_by_id("I-90_X11-town-link")
	var cumulative := fixture._cum(road)
	var arc: float = cumulative[-1]-80.0
	var segment := 0
	while segment+1<cumulative.size()-1 and cumulative[segment+1]<arc:
		segment += 1
	var lead := fixture.spawn_agent(String(road["id"]),segment,arc-cumulative[segment],0,1) as ProtoTraffic.TrafficAgent
	fixture.set_agent_speed(lead,5)
	fixture.set_agent_trip(lead,"I-90_X11")
	# Create the production convoy on a valid point-order segment, then stage its
	# trailing member at a surveyed arc before starting this independent trip.
	var convoy := fixture.spawn_convoy_behind(lead,1,"scrap")
	var follower := convoy[1] as ProtoTraffic.TrafficAgent
	var follower_arc := arc-40.0
	var follower_segment := 0
	while follower_segment+1<cumulative.size()-1 and cumulative[follower_segment+1]<follower_arc:
		follower_segment += 1
	follower.seg_i = follower_segment
	follower.s_ab = follower_arc-cumulative[follower_segment]
	fixture._place(follower,road) # pre-trip staging only, not motion under tick
	for step: int in 2400:
		fixture._tick(0.05)
		if not fixture._promoted.is_empty():
			break
	var follower_retained := is_instance_valid(follower) and fixture.agents.has(follower)
	if follower_retained:
		follower_retained = not follower.arrived and follower.dest_exit_id=="I-90_X11"
	print("TRAFFIC MANAGED CONVOY first_arrival_promotions=%d follower_registered_unarrived=%s" % [fixture._promoted.size(),follower_retained])
	if fixture._promoted.is_empty():
		for member: Variant in [lead,follower]:
			if is_instance_valid(member) and fixture.agents.has(member):
				print("TRAFFIC CONVOY STATE position=%s speed=%.4f cruise=%.4f arc=%.3f arrived=%s connection=%s parking=%s leader=%s" % [member.global_position,member.speed,member.cruise,fixture._travel_arc(member),member.arrived,member._connection,member._parking,fixture._car_ahead(member)])
		if is_instance_valid(lead) and fixture.agents.has(lead):
			_diagnose_convoy_parking(fixture,lead,road)
	_check("managed safe arrival does not chain-park its on-road convoy follower",fixture._promoted.size()==1 and follower_retained)
	if fixture._promoted.size()==1:
		_check_trip_plot(fixture._promoted[0] as PhysicsBody3D,"managed convoy leader")
	await _free_trip_fixture(fixture)


func _diagnose_convoy_parking(fixture: ProtoTraffic, agent: ProtoTraffic.TrafficAgent, road: Dictionary) -> void:
	var size := fixture._parking_size(agent)
	var ordinary := _parking_envelope()
	var cumulative := fixture._cum(road)
	var points: PackedVector2Array = road["pts"]
	for upstream: float in [55.0,40.0,25.0]:
		var arc: float = cumulative[-1]-upstream
		var segment := 0
		while segment+1<cumulative.size()-1 and cumulative[segment+1]<arc:
			segment += 1
		var heading := (points[segment+1]-points[segment]).normalized()
		var right := Vector2(-heading.y,heading.x)
		var yaw := atan2(-heading.x,-heading.y)
		var lane := fixture._lane_position(road,segment,arc-cumulative[segment],1,0)
		var center := Vector2(lane.x,lane.z)-right*ProtoUSMap.lane_offset(road,0)
		for offset: float in [9.6,12.6,15.6]:
			var point := center+right*offset
			var guess := Vector3(point.x,lane.y,point.y)
			var key := "%d,%d" % [floori(point.x/128),floori(point.y/128)]
			var plots: Array = main.stream._ruin_exclusions(guess,key)
			var entries: Array = main.stream._ruin_exclusions(guess,key,String(road["id"]))
			var actual := fixture._parking_sample(agent,guess,yaw,size,plots)
			var small := fixture._parking_sample(agent,guess,yaw,ordinary,plots)
			var actual_entry := not actual.is_empty() and fixture._parking_entry_clear(agent,agent.global_position,actual["position"],size,entries)
			var ordinary_entry := not small.is_empty() and fixture._parking_entry_clear(agent,agent.global_position,small["position"],ordinary,entries)
			print("TRAFFIC CONVOY CANDIDATE upstream=%.1f offset=%.1f position=%s actual_size=%s reserved_clear=%s actual_plot=%s actual_entry=%s ordinary_plot=%s ordinary_entry=%s" % [upstream,offset,guess,size,ProtoWorldStream._ruin_footprint_clear(guess,size,yaw,plots),not actual.is_empty(),actual_entry,not small.is_empty(),ordinary_entry])
			if actual.is_empty() and ProtoWorldStream._ruin_footprint_clear(guess,size,yaw,plots):
				_diagnose_parking_box(agent,guess,yaw,size)
			if not actual.is_empty() and not actual_entry:
				# Report the first real rejected swept box, without changing either
				# production query or envelope. This is diagnostic, not a new gate.
				var target: Vector3 = actual["position"]
				var delta := target-agent.global_position
				var length := Vector2(delta.x,delta.z).length()
				var count := maxi(1,ceili(length/2))
				var sweep_size := size+Vector3(0,0,length/float(count))
				var entry_yaw := atan2(-delta.x,-delta.z)
				var start_support := fixture._parking_sample(agent,agent.global_position,entry_yaw,size,entries)
				if start_support.is_empty():
					print("TRAFFIC CONVOY START REJECTION position=%s size=%s yaw=%.6f reservations_clear=%s" % [agent.global_position,size,entry_yaw,ProtoWorldStream._ruin_footprint_clear(agent.global_position,size,entry_yaw,entries)])
					_diagnose_parking_box(agent,agent.global_position,entry_yaw,size)
					continue
				var previous: Vector3 = start_support["position"]
				print("TRAFFIC CONVOY START SUPPORT chassis=%s support=%s finish=%s samples=%d" % [agent.global_position,previous,target,count])
				for step: int in range(1,count+1):
					var sample := agent.global_position.lerp(target,(float(step)-0.5)/float(count))
					var sampled := fixture._parking_sample(agent,sample,entry_yaw,sweep_size,entries)
					if sampled.is_empty():
						print("TRAFFIC CONVOY ENTRY REJECTION sample=%s size=%s yaw=%.6f reservations_clear=%s" % [sample,sweep_size,entry_yaw,ProtoWorldStream._ruin_footprint_clear(sample,sweep_size,entry_yaw,entries)])
						_diagnose_parking_box(agent,sample,entry_yaw,sweep_size)
						break
					var supported: Vector3 = sampled["position"]
					var horizontal := Vector2(supported.x-previous.x,supported.z-previous.z).length()
					var actual_delta := absf(supported.y-previous.y)
					var allowed := horizontal*float(ProtoTraffic.TRAFFIC["pull_over_max_grade"])+0.02
					if actual_delta>allowed:
						print("TRAFFIC CONVOY GRADE REJECTION step=%d chassis_start=%s start_support=%s previous_support=%s current_support=%s horizontal=%.9f actual_delta=%.9f allowed_delta=%.9f" % [step,agent.global_position,start_support["position"],previous,supported,horizontal,actual_delta,allowed])
						_diagnose_parking_box(agent,sample,entry_yaw,sweep_size)
						break
					previous = supported


func _diagnose_parking_box(agent: PhysicsBody3D, point: Vector3, yaw: float, size: Vector3) -> void:
	var floor_y := point.y-0.62
	var floors: Array = []
	for local: Vector3 in [Vector3.ZERO,Vector3(-size.x/2,0,-size.z/2),Vector3(size.x/2,0,-size.z/2),Vector3(size.x/2,0,size.z/2),Vector3(-size.x/2,0,size.z/2)]:
		var sample := point+Basis(Vector3.UP,yaw)*local
		var ray := PhysicsRayQueryParameters3D.create(sample+Vector3.UP,sample-Vector3.UP*2,1)
		ray.exclude = [agent.get_rid()]
		var hit: Dictionary = main.get_world_3d().direct_space_state.intersect_ray(ray)
		if hit.is_empty():
			floors.append("missing")
		else:
			floors.append({"position":hit["position"],"normal":hit["normal"],"body":hit["collider"].get_path()})
			if local==Vector3.ZERO:
				floor_y = hit["position"].y
	var shape := BoxShape3D.new()
	shape.size = Vector3(size.x,maxf(2.2,size.y),size.z)
	var query := PhysicsShapeQueryParameters3D.new()
	query.shape = shape
	query.transform = Transform3D(Basis(Vector3.UP,yaw),Vector3(point.x,floor_y+0.25+shape.size.y/2,point.z))
	query.collision_mask = 1
	var blockers: Array = []
	for hit: Dictionary in main.get_world_3d().direct_space_state.intersect_shape(query,64):
		if hit["collider"]!=agent:
			blockers.append({"body":hit["collider"].get_path(),"position":hit["collider"].global_position})
	print("TRAFFIC CONVOY BOX FLOORS %s BLOCKERS %s" % [floors,blockers])


func _unsafe_parking_regressions(live_map: ProtoUSMap) -> void:
	var map := ProtoUSMap.new()
	_check("parking matrix starts from a separate real map fold",map.load_file(ProtoUSMap.PATH))
	var origin := Vector2(90048,90048)
	var destination := origin+Vector2(60,0)
	var id := "TEST-PARK-FEEDER"
	var road: Dictionary = {"id":id,"kind":"county","pts":PackedVector2Array([origin-Vector2(60,0),destination]),"elev":PackedFloat32Array([4,4]),"elev_mode":"structure","lanes":2,"divided":false,"one_way":false,"interchange_id":"TEST-PARK"}
	map.roads = [road,live_map.road_by_id("I-90").duplicate(true)]
	var exit_row: Dictionary = {}
	for folded: Dictionary in map.exits:
		if String(folded["id"])=="I-90_X11":
			exit_row = folded.duplicate(true)
	exit_row["id"] = "TEST-PARK"
	exit_row["pos"] = origin-Vector2(60,0)
	exit_row["dest"] = destination
	exit_row["connector_ids"] = [id]
	exit_row["ramp_ids"] = []
	map.exits = [exit_row]
	map.placements = []
	map.junctions = []
	map.towns = []
	map._build_seg_grid()
	_stage_trip_observer(origin+Vector2(0,-35))
	var cap_modes: Array[String] = ["cap-touch-before","cap-touch-during","cap-follow","lane-leader"]
	var curb_modes: Array[String] = ["curb-0.09","curb-phase","curb-0.15","uphill-step","untagged-step","retry-curb"]
	for mode: String in ["clear","occupied","missing-floor","steep","entry-blocked","curb-0.09","curb-phase","curb-0.15","uphill-step","untagged-step","retry-curb","cap-touch-before","cap-touch-during","cap-follow","lane-leader"]:
		for full_cap: bool in [false,true]:
			if cap_modes.has(mode) and not full_cap:
				continue # these regressions require the unchanged stock cap to be full
			var curb := curb_modes.has(mode) or cap_modes.has(mode)
			var root := Node3D.new()
			root.name = "ParkingMatrix_"+mode
			main.add_child(root)
			# These are real collision fixtures for the traffic consumer, not mocked
			# queries or a renderer test. The serving pavement is always supported.
			if curb:
				# The real managed pavement constructor supplies collider identity;
				# no test assigns a road tag to an arbitrary obstruction body.
				var corners: Array[Vector3] = []
				for station: float in [-60.0,60.0]:
					for lateral: float in [-4.6,4.6]:
						corners.append(Vector3(origin.x+station,4.09,origin.y+lateral))
				main.stream._road_prism(root,corners,id,Color(0.15,0.15,0.15),0.52,true)
				var drop := 0.15 if mode=="curb-0.15" else (-0.09 if mode=="uphill-step" else 0.09)
				_parking_box(root,Vector3(origin.x,3.59-drop,origin.y+22.3),Vector3(160,1,35.4),"shoulder_support")
				if mode=="untagged-step":
					# Level pavement departure, then a separate untagged soil step.
					_parking_box(root,Vector3(origin.x,3.59,origin.y+5.8),Vector3(160,1,2.4),"untagged_upper_ground")
			else:
				_parking_box(root,Vector3(origin.x,3.83,origin.y),Vector3(120,0.52,9.2),"serving_pavement")
			if not curb and mode != "missing-floor":
				var support := _parking_box(root,Vector3(origin.x,3.59,origin.y+17),Vector3(120,1,30),"parking_support")
				if mode == "steep":
					support.rotation.z = atan(0.10) # actual ten-percent floor normal
			if mode == "occupied":
				for upstream: float in [55.0,40.0,25.0]:
					for offset: float in [9.6,12.6,15.6]:
						_parking_box(root,Vector3(destination.x-upstream,5.09,origin.y+offset),Vector3(0.5,2,0.5),"occupied_plot")
			if mode == "entry-blocked":
				_parking_box(root,Vector3(origin.x+15,5.09,origin.y+7.5),Vector3(85,2,0.5),"blocked_shoulder_entry")
			for frame: int in 3:
				await get_tree().physics_frame
			_check_parking_matrix_geometry(origin,mode)
			if curb:
				var ray_point := Vector3(origin.x,4.09,origin.y+4.0)
				var pavement: Dictionary = main.get_world_3d().direct_space_state.intersect_ray(PhysicsRayQueryParameters3D.create(ray_point+Vector3.UP*0.3,ray_point-Vector3.UP*0.3,1))
				_check(mode+" uses actual managed serving pavement identity",not pavement.is_empty() and String(pavement["collider"].get_meta("road_deck",""))==id)
			var fixture := _trip_fixture(map,full_cap,"I-90",50,25,root)
			var start_arc := 55.0 if mode=="curb-phase" else 40.0
			var agent := fixture.spawn_agent(id,0,start_arc,0,1) as ProtoTraffic.TrafficAgent
			fixture.set_agent_speed(agent,5) # fixed80m / phase-control65m approach
			fixture.set_agent_trip(agent,"TEST-PARK")
			var follower: ProtoTraffic.TrafficAgent = null
			if curb:
				var convoy := fixture.spawn_convoy_behind(agent,1,"scrap")
				follower = convoy[1] as ProtoTraffic.TrafficAgent
				follower.s_ab = start_arc-40.0
				fixture._place(follower,road) # fixed pre-trip spacing, no mid-trip writes
			if mode=="lane-leader":
				fixture.set_agent_speed(agent,0) # stationary in-lane control, staged before ticks
			var actors_synced := await _sync_matrix_actors(fixture)
			_check_matrix_bodies(fixture,mode+" staged")
			_check(mode+" observer has actual full-footprint supporting floor",_body_has_support(main.active_car))
			if mode=="cap-touch-before":
				main.stream.usmap = map
				_request_capped_departure_promotion(fixture,agent,mode)
				main.stream.usmap = live_map
			var bounded := true
			var no_other_overlap := true
			var retry_blocked := false
			var departure_requested := false
			var original_lead_position := agent.global_position
			for step: int in 1200: #60 traffic seconds includes repeated2s searches
				var before := agent.global_position
				var speed_before := agent.speed
				# The same consumer map is visible to reservation helpers only during
				# this synchronous tick. Restore before yielding to the live scene.
				main.stream.usmap = map
				fixture._tick(0.05)
				main.stream.usmap = live_map
				actors_synced = (await _sync_matrix_actors(fixture)) and actors_synced
				if not fixture.agents.has(agent):
					break
				bounded = bounded and before.distance_to(agent.global_position)<=maxf(speed_before,agent.speed)*0.05+0.02
				# Obstacles are all queried, including unknown/static bodies. The
				# measured subject alone is recognized by identity, never excluded.
				var probe_size := fixture._parking_size(agent) if cap_modes.has(mode) else Vector3.ZERO
				no_other_overlap = no_other_overlap and _parking_motion_clear(agent,probe_size)
				if mode=="cap-touch-during" and not departure_requested and agent.global_position.z>origin.y+2.8:
					departure_requested = true
					_check("cap request is exercised during an unfinished pavement departure",not agent.arrived and agent.global_position.z<origin.y+4.6)
					main.stream.usmap = map
					_request_capped_departure_promotion(fixture,agent,mode)
					main.stream.usmap = live_map
				if mode=="retry-curb" and not retry_blocked and agent.global_position.z>origin.y+5.0:
					retry_blocked = true
					# A real environmental change AFTER the first crossing; preserve
					# actor state and exercise repeated normal search/motion ticks.
					for upstream: float in [55.0,40.0,25.0]:
						for offset: float in [9.6,12.6,15.6]:
							_parking_box(root,Vector3(destination.x-upstream,5.0,origin.y+offset),Vector3(0.5,2,0.5),"late_occupied_plot")
					for frame: int in 3:
						await get_tree().physics_frame
				if agent.arrived:
					break
			var phase := "parking matrix %s cap=%s" % [mode,full_cap]
			actors_synced = (await _sync_matrix_actors(fixture)) and actors_synced
			_check(phase+" keeps every staged/moving actor synchronized with physics",actors_synced)
			_check_matrix_bodies(fixture,phase+" final")
			var body := _trip_body(fixture,agent,5 if full_cap else 0)
			_check(phase+" keeps the nearby actor visible",is_instance_valid(body))
			_check(phase+" uses speed-bounded motion",bounded)
			_check(phase+" never moves through another body",no_other_overlap)
			if is_instance_valid(body):
				var p := body.global_position
				print("TRAFFIC PARK MATRIX mode=%s cap=%s position=%s original_registered=%s promotions=%d" % [mode,full_cap,p,fixture.agents.has(body),fixture._promoted.size()])
				if mode in ["clear","curb-0.09","curb-phase","cap-touch-before","cap-touch-during","cap-follow"]:
					main.stream.usmap = map
					_check_trip_plot(body as PhysicsBody3D,phase)
					main.stream.usmap = live_map
					_check(phase+" actually pulls over on its right",p.z>origin.y+7 and p.x<destination.x-20)
					var resolved := body is ProtoCar3D and fixture._promoted.size()==1
					if full_cap:
						resolved = body is ProtoTraffic.TrafficAgent and body.arrived and fixture._promoted.size()==5
					_check(phase+" completes a genuine safe arrival",resolved)
					if curb:
						_check(phase+" does not chain-park its trailing convoy member",is_instance_valid(follower) and fixture.agents.has(follower) and not follower.arrived)
					if mode=="cap-touch-during":
						_check(phase+" actually exercises the mid-departure promotion path",departure_requested)
					if mode=="cap-follow" and fixture.agents.has(agent) and agent.arrived:
						await _check_parked_follower(fixture,agent,follower,map,live_map,phase)
				else:
					var waiting := body is ProtoTraffic.TrafficAgent and fixture.agents.has(body)
					if waiting:
						waiting = not body.arrived and body.dest_exit_id=="TEST-PARK" and body.speed<0.1
					var lateral_wait := absf(p.z-origin.y)<4.6
					if mode=="untagged-step":
						lateral_wait = p.z<=origin.y+7.02 # level departure may reach, not cross, the soil step
					elif mode in ["curb-0.15","uphill-step"]:
						lateral_wait = p.z<=origin.y+4.62
					elif mode=="retry-curb":
						lateral_wait = true # already crossed once before the plots became occupied
					var upstream_wait := p.x<=destination.x-20 and lateral_wait
					_check(phase+" waits unarrived upstream rather than parking at the junction",waiting and upstream_wait)
					_check(phase+" does not promote an unsafe arrival",fixture._promoted.size()==(5 if full_cap else 0))
					if mode=="lane-leader":
						_check(phase+" retains the real stationary in-lane leader",agent.global_position.distance_to(original_lead_position)<0.02 and not agent.arrived)
						_check(phase+" follower progresses then stops behind that physical leader",is_instance_valid(follower) and fixture.agents.has(follower) and follower.s_ab>5.0 and follower.s_ab<agent.s_ab-6.6 and follower.speed<0.1 and not follower.arrived)
						_check(phase+" follower never overlaps the retained in-lane body",is_instance_valid(follower) and _parking_motion_clear(follower,fixture._parking_size(follower),true))
					if mode=="retry-curb":
						_check(phase+" actually crossed once before occupied-plot retries",retry_blocked)
						if retry_blocked and is_instance_valid(agent) and fixture.agents.has(agent):
							await _check_curb_retry_state(fixture,agent,road,origin,map,live_map,phase)
			await _free_trip_fixture(fixture)
			root.queue_free()
			await get_tree().physics_frame
	_check("parking matrix restores the actual consumer map",main.stream.usmap==live_map)


func _request_capped_departure_promotion(fixture: ProtoTraffic, agent: ProtoTraffic.TrafficAgent, phase: String) -> void:
	var trip := agent.dest_exit_id
	var cruise := agent.cruise
	var position := agent.global_position
	agent.take_damage(1.0) # real public damage -> promotion path, not an arrival-field write
	print("TRAFFIC CAPPED REQUEST phase=%s position=%s registered=%s arrived=%s cruise=%.3f cap=%d" % [phase,agent.global_position,fixture.agents.has(agent),agent.arrived,agent.cruise,fixture._promoted.size()])
	_check(phase+" retains the same real body without exceeding stock cap",is_instance_valid(agent) and fixture.agents.has(agent) and fixture._promoted.size()==5 and agent.global_position==position)
	_check(phase+" does not manufacture arrival or erase its managed trip/cruise",not agent.arrived and agent.dest_exit_id==trip and is_equal_approx(agent.cruise,cruise))


func _check_parked_follower(fixture: ProtoTraffic, lead: ProtoTraffic.TrafficAgent, follower: ProtoTraffic.TrafficAgent, map: ProtoUSMap, live_map: ProtoUSMap, phase: String) -> void:
	# Continue the already-staged convoy; never move/remove the lead to clear a
	# route or reset its follower. Both actors remain real registered bodies.
	var actors_synced := await _sync_matrix_actors(fixture)
	_check_matrix_bodies(fixture,phase+" parked handoff")
	var parked_position := lead.global_position
	var initial_arc := fixture._travel_arc(follower)
	var bounded := true
	var clear := true
	for step: int in 1200: # same60s manual-clock bound as the other matrix trips
		var before := follower.global_position
		var speed_before := follower.speed
		main.stream.usmap = map
		fixture._tick(0.05)
		main.stream.usmap = live_map
		actors_synced = (await _sync_matrix_actors(fixture)) and actors_synced
		if not fixture.agents.has(follower):
			break
		bounded = bounded and before.distance_to(follower.global_position)<=maxf(speed_before,follower.speed)*0.05+0.02
		clear = clear and _parking_motion_clear(follower,fixture._parking_size(follower))
		if follower.arrived:
			break
	actors_synced = (await _sync_matrix_actors(fixture)) and actors_synced
	_check(phase+" subsequent follower is physically synchronized throughout",actors_synced)
	_check_matrix_bodies(fixture,phase+" subsequent final")
	var retained := is_instance_valid(follower) and fixture.agents.has(follower) and fixture.agents.has(lead)
	_check(phase+" retains both real convoy members at stock cap",retained and fixture._promoted.size()==5)
	_check(phase+" keeps follower motion bounded and collision-clear",bounded and clear)
	_check(phase+" never moves the safely parked leader",lead.global_position.distance_to(parked_position)<0.02)
	if retained:
		print("TRAFFIC PARKED FOLLOWER start_arc=%.3f final_arc=%.3f position=%s arrived=%s speed=%.3f lead=%s" % [initial_arc,fixture._travel_arc(follower),follower.global_position,follower.arrived,follower.speed,lead.global_position])
		_check(phase+" follower independently reaches a distinct safe arrival",follower.arrived and follower.global_position.distance_to(lead.global_position)>fixture._parking_size(follower).x)
		main.stream.usmap = map
		_check_trip_plot(lead,phase+" retained lead")
		_check_trip_plot(follower,phase+" subsequent follower")
		main.stream.usmap = live_map


func _matrix_actor_transforms_match(fixture: ProtoTraffic) -> bool:
	var members := fixture.agents.duplicate()
	members.append_array(fixture._promoted)
	for member: Variant in members:
		if not is_instance_valid(member):
			return false
		var body := member as PhysicsBody3D
		var server: Transform3D = PhysicsServer3D.body_get_state(body.get_rid(),PhysicsServer3D.BODY_STATE_TRANSFORM)
		# Absolute millimetre/basis tolerances: relative approximate comparison
		# at90km would silently accept metre-scale stale server transforms.
		if body.global_position.distance_squared_to(server.origin)>0.000001:
			return false
		for axis: int in 3:
			if (body.global_basis[axis]-server.basis[axis]).length_squared()>0.00000001:
				return false
	return true


func _sync_matrix_actors(fixture: ProtoTraffic) -> bool:
	# The caller restores the live consumer map before any await. Actual engine
	# integration, not body_set_state/pose writes, updates these kinematic hulls.
	# Stationary retries consume their normal manual budget without extra waits.
	for attempt: int in 2:
		if _matrix_actor_transforms_match(fixture):
			return true
		await get_tree().physics_frame
	return _matrix_actor_transforms_match(fixture)


func _check_matrix_bodies(fixture: ProtoTraffic, phase: String) -> void:
	var members := fixture.agents.duplicate()
	members.append_array(fixture._promoted)
	var detected := 0
	for member: Variant in members:
		if not is_instance_valid(member):
			continue
		var body := member as PhysicsBody3D
		var size := _parking_envelope(body)
		var shape := BoxShape3D.new()
		shape.size = Vector3(size.x,maxf(2.2,size.y),size.z)
		var query := PhysicsShapeQueryParameters3D.new()
		query.shape = shape
		query.transform = body.global_transform
		query.collision_mask = 1
		for hit: Dictionary in main.get_world_3d().direct_space_state.intersect_shape(query,32):
			if hit["collider"]==body:
				detected += 1
				break
	print("TRAFFIC PHYSICS phase=%s actors=%d actual_subject_hits=%d transforms_match=%s exclusions=0" % [phase,members.size(),detected,_matrix_actor_transforms_match(fixture)])
	_check(phase+" actual body poses match physics and are detected without exclusions",_matrix_actor_transforms_match(fixture) and detected==members.size())
	if fixture.has_meta("matrix_capacity"):
		var retained := 0
		var supported := 0
		for entry: Dictionary in fixture.get_meta("matrix_capacity"):
			var member: Variant = entry["car"]
			if not is_instance_valid(member):
				print("TRAFFIC CAP SUPPORT phase=%s car=%s invalid=true" % [phase,entry["id"]])
				continue
			var car := member as ProtoCar3D
			retained += int(fixture._promoted.has(car) and main.cars.has(car) and not car.dead)
			var grounded := _body_has_support(car,entry["floor"])
			supported += int(grounded)
			if not grounded:
				print("TRAFFIC CAP SUPPORT phase=%s car=%s position=%s velocity=%s" % [phase,entry["id"],car.global_position,car.linear_velocity])
		_check(phase+" retains the same five real stock-cap cars on their actual full-footprint floors",retained==5 and supported==5 and fixture._promoted.size()==5)


func _body_has_support(body: PhysicsBody3D, expected_floor: StaticBody3D = null) -> bool:
	# Actual transformed box corners, including pitch/roll. Only the subject's
	# RID is excluded from floor rays; other bodies cannot stand in for its pad.
	var points: Array[Vector3] = [body.global_position]
	for child: Node in body.get_children():
		if child is CollisionShape3D and child.shape is BoxShape3D:
			var half: Vector3 = child.shape.size*0.5
			for x: float in [-1.0,1.0]:
				for y: float in [-1.0,1.0]:
					for z: float in [-1.0,1.0]:
						points.append(child.global_transform*Vector3(half.x*x,half.y*y,half.z*z))
	if points.size()<9:
		return false
	for point: Vector3 in points:
		var top := Vector3(point.x,body.global_position.y+1.0,point.z)
		var query := PhysicsRayQueryParameters3D.create(top,top-Vector3.UP*3.0,1)
		query.exclude = [body.get_rid()]
		var hit: Dictionary = main.get_world_3d().direct_space_state.intersect_ray(query)
		if hit.is_empty() or (hit["position"] as Vector3).y>body.global_position.y:
			return false
		if expected_floor!=null and hit["collider"]!=expected_floor:
			return false
	return true


func _check_curb_retry_state(fixture: ProtoTraffic, crossed: ProtoTraffic.TrafficAgent, road: Dictionary, origin: Vector2, map: ProtoUSMap, live_map: ProtoUSMap, phase: String) -> void:
	# Read-only validation of another real boundary after the ORIGINAL actor's
	# actual crossing and retries. Never reposition it or reset its trip state.
	var start := fixture._lane_position(road,0,100,1,0)
	var finish := Vector3(start.x,4.62,origin.y+5.2)
	var size := fixture._parking_size(crossed)
	var key := "%d,%d" % [floori(start.x/128),floori(start.z/128)]
	main.stream.usmap = map
	var exclusions: Array = main.stream._ruin_exclusions(start,key,String(road["id"]))
	# Probe before spawning the fresh control so it cannot obstruct this query.
	var repeated := fixture._parking_entry_clear(crossed,start,finish,size,exclusions)
	var fresh := fixture.spawn_agent(String(road["id"]),0,100,0,1) as ProtoTraffic.TrafficAgent
	fixture.set_agent_trip(fresh,"TEST-PARK")
	main.stream.usmap = live_map
	_check(phase+" fresh preview control is physically synchronized",await _sync_matrix_actors(fixture))
	_check_matrix_bodies(fixture,phase+" fresh control")
	main.stream.usmap = map
	var first := fixture._parking_entry_clear(fresh,start,finish,size,exclusions)
	var preview_again := fixture._parking_entry_clear(fresh,start,finish,size,exclusions)
	main.stream.usmap = live_map
	print("TRAFFIC CURB RETRY STATE fresh_entry=%s repeated_preview=%s previously_crossed_entry=%s original_position=%s" % [first,preview_again,repeated,crossed.global_position])
	_check(phase+" previews do not spend an unconsumed curb allowance",first and preview_again)
	_check(phase+" does not regain a second curb allowance across retries",not repeated)
	fixture.despawn_agent(fresh)


func _parking_box(parent: Node3D, pos: Vector3, size: Vector3, label: String) -> StaticBody3D:
	var body := StaticBody3D.new()
	body.name = label
	var collision := CollisionShape3D.new()
	var shape := BoxShape3D.new()
	shape.size = size
	collision.shape = shape
	body.add_child(collision)
	parent.add_child(body)
	body.global_position = pos
	return body


func _check_parking_matrix_geometry(origin: Vector2, mode: String) -> void:
	var supported := 0
	var steep := 0
	var occupied := 0
	for upstream: float in [55.0,40.0,25.0]:
		for offset: float in [9.6,12.6,15.6]:
			var point := Vector3(origin.x+60-upstream,4.09,origin.y+offset)
			var ray_top := 5.0 if mode=="steep" else 0.2
			var hit: Dictionary = main.get_world_3d().direct_space_state.intersect_ray(PhysicsRayQueryParameters3D.create(point+Vector3.UP*ray_top,point-Vector3.UP*0.2,1))
			if not hit.is_empty():
				supported += 1
				steep += int((hit["normal"] as Vector3).y<cos(atan(0.06)))
			var shape := BoxShape3D.new()
			var size := _parking_envelope()
			shape.size = Vector3(size.z,2.2,size.x) # +X travel; car local-Z length
			var query := PhysicsShapeQueryParameters3D.new()
			query.shape = shape
			query.transform.origin = point+Vector3.UP*1.35
			query.collision_mask = 1
			occupied += int(not main.get_world_3d().direct_space_state.intersect_shape(query,32).is_empty())
	print("TRAFFIC PARK MATRIX GEOMETRY mode=%s candidate_floor_hits=%d steep=%d occupied=%d exclusions=0" % [mode,supported,steep,occupied])
	_check(mode+" matrix has its intended actual floor condition",supported==0 if mode=="missing-floor" else supported==9)
	if mode=="steep":
		_check("steep matrix physically measures >6% at every candidate",steep==9)
	if mode in ["clear","entry-blocked","occupied"]:
		_check(mode+" candidate plot occupancy is independently verified",occupied==(9 if mode=="occupied" else 0))
	if mode=="entry-blocked":
		var entry_shape := BoxShape3D.new()
		entry_shape.size = Vector3(85,2.2,6)
		var entry := PhysicsShapeQueryParameters3D.new()
		entry.shape = entry_shape
		entry.transform.origin = Vector3(origin.x+15,5.44,origin.y+5)
		entry.collision_mask = 1
		_check("entry-only matrix has a real obstruction before its nine clear plots",not main.get_world_3d().direct_space_state.intersect_shape(entry,32).is_empty())


func _parking_motion_clear(body: PhysicsBody3D, full_size: Vector3 = Vector3.ZERO, diagnose: bool = false) -> bool:
	var shape := BoxShape3D.new()
	shape.size = Vector3(1.9,1.0,ProtoTraffic.CAR_LEN)
	if full_size!=Vector3.ZERO:
		shape.size = Vector3(full_size.x,1.0,full_size.z) # full XZ envelope above its supporting floor
	var query := PhysicsShapeQueryParameters3D.new()
	query.shape = shape
	query.transform = body.global_transform
	query.collision_mask = 1
	for hit: Dictionary in main.get_world_3d().direct_space_state.intersect_shape(query,32):
		if hit["collider"] != body:
			if diagnose:
				var other := hit["collider"] as Node3D
				print("TRAFFIC MOTION BLOCK subject=%s position=%s collider=%s path=%s position=%s script=%s" % [body.get_instance_id(),body.global_position,other.get_instance_id(),other.get_path(),other.global_position,other.get_script()])
			return false
	return true


func _trip_fixture(map: ProtoUSMap, full_cap: bool, capacity_road: String, start: float, spacing: float, capacity_support: Node3D = null) -> ProtoTraffic:
	var fixture := ProtoTraffic.create(main,map)
	main.add_child(fixture)
	fixture.set_physics_process(false) # same manual-clock convention as existing traffic_sim
	if full_cap:
		var capacity: Array[Dictionary] = []
		for index: int in 5:
			var filling := fixture.spawn_agent(capacity_road,0,start+float(index)*spacing,0,1)
			var floor_body: StaticBody3D = null
			if capacity_support!=null:
				# Same five distant I-90 stations as before. A row alone supplies
				# no floor after streaming moves to the matrix at90km. These real
				# pads persist outside the stream ledger; gravity/void cleanup stay on.
				var floor_center := filling.global_position-Vector3.UP*1.12
				floor_body = _parking_box(capacity_support,floor_center,Vector3(12,1,12),"capacity_support_"+str(index))
			fixture.promote(filling,0.0,true)
			if capacity_support!=null:
				var car: ProtoCar3D = fixture._promoted[-1]
				capacity.append({"car":car,"id":car.get_instance_id(),"floor":floor_body})
		if capacity_support!=null:
			fixture.set_meta("matrix_capacity",capacity)
		_check("trip fixture fills stock cap with five real promotions",fixture._promoted.size()==5)
	return fixture


func _free_trip_fixture(fixture: ProtoTraffic) -> void:
	for member: Variant in fixture._promoted.duplicate():
		main.cars.erase(member)
		if is_instance_valid(member):
			(member as Node3D).queue_free()
	fixture.queue_free()
	await get_tree().physics_frame
	await get_tree().physics_frame


func _parking_envelope(body: PhysicsBody3D = null) -> Vector3:
	var size := Vector3(1.9,1.2,ProtoTraffic.CAR_LEN)
	if is_instance_valid(body):
		for child: Node in body.get_children():
			if child is CollisionShape3D and child.shape is BoxShape3D:
				var actual: Vector3 = child.shape.size
				size = Vector3(maxf(size.x,actual.x),maxf(size.y,actual.y),maxf(size.z,actual.z))
	for id: String in ["scavenger","pickup","van"]:
		var chassis: Vector3 = ProtoCar3D.VEHICLES[id]["chassis"]
		size = Vector3(maxf(size.x,chassis.x),maxf(size.y,chassis.y),maxf(size.z,chassis.z))
	return size+Vector3(1,0,1) # actual possible body envelope plus0.5m on each side


func _check_trip_plot(body: PhysicsBody3D, phase: String) -> void:
	var size := _parking_envelope(body)
	var pos := body.global_position
	var key := "%d,%d" % [floori(pos.x/128.0),floori(pos.z/128.0)]
	var exclusions: Array = main.stream._ruin_exclusions(pos,key)
	_check("%s full arrival footprint clears every road and placement" % phase,ProtoWorldStream._ruin_footprint_clear(pos,size,body.rotation.y,exclusions))
	var floors: Array[Vector3] = []
	var normals_ok := true
	for local: Vector3 in [Vector3.ZERO,Vector3(-size.x/2,0,-size.z/2),Vector3(size.x/2,0,-size.z/2),Vector3(size.x/2,0,size.z/2),Vector3(-size.x/2,0,size.z/2)]:
		var sample := pos+body.global_basis*local
		var ray := PhysicsRayQueryParameters3D.create(sample+Vector3.UP*3,sample-Vector3.UP*6,1)
		ray.exclude = [body.get_rid()] # explicit subject-only floor-ray exclusion, never other bodies
		var hit: Dictionary = main.get_world_3d().direct_space_state.intersect_ray(ray)
		if not hit.is_empty():
			floors.append(hit["position"])
			normals_ok = normals_ok and (hit["normal"] as Vector3).y >= cos(atan(0.06))
	_check("%s center and all footprint corners have <=6%% supporting grade" % phase,floors.size()==5 and normals_ok)
	if floors.size()!=5:
		return
	_check("%s actor is supported, not floating above its plot" % phase,pos.y-floors[0].y>=0.25 and pos.y-floors[0].y<=1.5)
	var shape := BoxShape3D.new()
	shape.size = Vector3(size.x,maxf(size.y,2.2),size.z)
	var query := PhysicsShapeQueryParameters3D.new()
	query.shape = shape
	query.transform = Transform3D(Basis(Vector3.UP,body.rotation.y),Vector3(pos.x,floors[0].y+0.25+shape.size.y/2,pos.z))
	query.collision_mask = 1 # full query retains subject AND every other body
	var others := 0
	for hit: Dictionary in main.get_world_3d().direct_space_state.intersect_shape(query,32):
		others += int(hit["collider"] != body)
	print("TRAFFIC PARKING %s position=%s envelope=%s other_bodies=%d floor_ray_exclusion=self_only clearance_exclusions=0" % [phase,pos,size,others])
	_check("%s full parking envelope contains no other body" % phase,others==0)


func _trip_body(fixture: ProtoTraffic, agent: Variant, prior_promotions: int) -> Node3D:
	# Promotion may already have freed the source: validate before ANY typed
	# parameter/cast. Its replacement must belong to this real promotion ledger.
	if is_instance_valid(agent) and agent is ProtoTraffic.TrafficAgent and fixture.agents.has(agent):
		return agent as Node3D
	if fixture._promoted.size() > prior_promotions:
		var promoted: Variant = fixture._promoted[prior_promotions]
		if is_instance_valid(promoted) and promoted is ProtoCar3D and main.cars.has(promoted) and promoted.get_parent() == main:
			return promoted as Node3D
	return null


func _arrival_body_boxes(queries: Array[PhysicsShapeQueryParameters3D], arrival: Node3D, phase: String) -> int:
	var blocked := 0
	for query: PhysicsShapeQueryParameters3D in queries:
		var hits: Array[Dictionary] = main.get_world_3d().direct_space_state.intersect_shape(query,32)
		var arrival_hit := false
		for hit: Dictionary in hits:
			var body: Node3D = hit["collider"]
			print("TRAFFIC ARRIVAL QUERY phase=%s body=%s position=%s target_arrival=%s" % [phase,body.get_path(),body.global_position,body == arrival])
			arrival_hit = arrival_hit or body == arrival
		blocked += int(arrival_hit)
	return blocked


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


## Nearest-vertex survey: densify-proof segment index for a surveyed corner.
func _seg_at(pts: PackedVector2Array, corner: Vector2) -> int:
	var bi := 0
	var bd := 1e18
	for i in range(pts.size() - 1):
		var d := pts[i].distance_to(corner)
		if d < bd:
			bd = d
			bi = i
	return bi
