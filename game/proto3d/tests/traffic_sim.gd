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
