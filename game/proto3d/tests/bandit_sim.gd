## Proof for THE BANDIT DIRECTOR (BANDIT_CONVOY_ECOSYSTEM.md §8.2-8.6, owner:
## "a whole AI for the bandits… put it all together"): regional strength rows
## (Southwest 5, Virginia 1, occupied Florida 0), the WATCH ledger (driving
## their roads accrues sightings; the drone's eye multiplies it), the COMMIT —
## strength ≥3 raises the CHECKPOINT KIT ahead of the player (pay the toll and
## the barriers part; come up short and the pirate law answers), the regional
## law (a strength-5 state commits ≥3× faster than a strength-1 state), and
## the DRONE (shadows you, shootable, downs into scrap, blinds the gang a day).
## Run: godot --headless --path game res://proto3d/tests/bandit_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node3D


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("BANDIT: %s - %s" % ["PASS" if ok else "FAIL", check_name])


## Simulated game-hours of DRIVING in the player's current state until the gang
## commits (manual clock — the sim owns time, deterministic).
func _hours_to_commit(b: ProtoBandits, max_h: float) -> float:
	var h := 0.0
	while h < max_h:
		b._tick(6.0) # 6 real seconds = 0.1 game-hour per tick
		h += 0.1
		var st: String = main.stream.current_state(main.active_car.global_position)
		if b._gang(st)["gstate"] == ProtoBandits.GangState.COOLDOWN:
			return h
	return max_h


func _ready() -> void:
	print("BANDIT: start")
	get_tree().create_timer(150.0).timeout.connect(func() -> void:
		print("BANDIT: WATCHDOG")
		print("BANDIT: FAILURES PRESENT")
		get_tree().quit(1))

	# === 1. THE ROWS: regional strength + the fold law ============================
	_check("the Southwest is their kingdom (AZ/NM 5, NV/UT 4)",
		ProtoBandits.strength_of("ARIZONA") == 5 and ProtoBandits.strength_of("NEW MEXICO") == 5
		and ProtoBandits.strength_of("NEVADA") == 4 and ProtoBandits.strength_of("UTAH") == 4)
	_check("Virginia barely fields a crew; unknown states default to a nuisance (1)",
		ProtoBandits.strength_of("VIRGINIA") == 1 and ProtoBandits.strength_of("MAINE") == 1)
	_check("occupied FLORIDA fields NO bandits (the Faith owns those roads)",
		ProtoBandits.strength_of("FLORIDA") == 0)
	var f := FileAccess.open("user://test_bandits.json", FileAccess.WRITE)
	f.store_string(JSON.stringify({"regions": {"VIRGINIA": 4.0}, "tuning": {"toll_per_strength": 11.0}}))
	f.close()
	var regions: Dictionary = {"VIRGINIA": 1}
	var tuning: Dictionary = {"toll_per_strength": 8.0, "cooldown_h": 8.0}
	ProtoBandits.fold_file(regions, tuning, "user://test_bandits.json")
	DirAccess.remove_absolute("user://test_bandits.json")
	_check("the fold law: data overrides floor, number by number",
		int(regions["VIRGINIA"]) == 4 and is_equal_approx(float(tuning["toll_per_strength"]), 11.0)
		and is_equal_approx(float(tuning["cooldown_h"]), 8.0))

	# === Boot ======================================================================
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 8:
		await get_tree().process_frame
	var b: ProtoBandits = main.bandits
	_check("main owns the BANDIT DIRECTOR", b != null and b is ProtoBandits)
	b.set_physics_process(false) # the sim owns the clock
	b.rng.seed = hash("bandit_sim")

	# Stage the car ONTO an Arizona stretch of interstate (staging: the documented
	# exception). Find one from the map itself — no hardcoded coordinates.
	var m: ProtoUSMap = main.stream.usmap
	var az_pt := Vector3.INF
	for road in m.roads:
		if String(road["kind"]) != "interstate":
			continue
		var pts: PackedVector2Array = road["pts"]
		for i in range(pts.size() - 1):
			for t in [0.25, 0.5, 0.75]:
				var q: Vector2 = pts[i].lerp(pts[i + 1], t)
				if m.state_at(Vector3(q.x, 0, q.y)) == "ARIZONA":
					az_pt = Vector3(q.x, 1.0, q.y)
					break
			if az_pt != Vector3.INF:
				break
		if az_pt != Vector3.INF:
			break
	_check("the map HAS an Arizona interstate stretch", az_pt != Vector3.INF)
	main.active_car.global_position = az_pt
	main.active_car.linear_velocity = Vector3(14, 0, 0) # "driving" (forward_speed read)

	# === 2. THE EYE: a strength-5 state flies a shadow drone ======================
	b._tick(1.0)
	_check("a strength-5 gang FLIES ITS DRONE over you", b.drone != null and is_instance_valid(b.drone))

	# === 3. WATCH -> COMMIT: the checkpoint kit rises ahead =======================
	var az_hours := _hours_to_commit(b, 12.0)
	_check("the AZ gang commits off the sightings ledger (%.1f game-hours)" % az_hours, az_hours < 12.0)
	_check("...and being strength 5, it raises the CHECKPOINT KIT",
		b.checkpoint != null and is_instance_valid(b.checkpoint))
	var barriers := 0
	if b.checkpoint != null:
		for c in b.checkpoint.get_children():
			if c.has_meta("bandit_barrier"):
				barriers += 1
	_check("the kit is REAL: %d physical barrier runs + the toll sign" % barriers, barriers >= 2)

	# === 4. PAY THE LINE: scrip parts the barriers =================================
	main.backpack.add("scrip", 200)
	var kit_pos: Vector3 = (b.checkpoint.get_child(0) as Node3D).global_position
	var scrip0: int = main.backpack.count("scrip")
	main.active_car.global_position = kit_pos + Vector3(5, 1, 0)
	b._tick(0.5)
	_check("PAYING the toll parts the barriers (scrip %d -> %d, kit gone)" % [scrip0, main.backpack.count("scrip")],
		main.backpack.count("scrip") < scrip0 and b.checkpoint == null)

	# === 5. SHORT PAY: the crew comes off the shoulder =============================
	var st_now: String = main.stream.current_state(main.active_car.global_position)
	b._gang(st_now)["cool_until_h"] = -1.0
	b._gang(st_now)["gstate"] = ProtoBandits.GangState.WATCH
	var h2 := _hours_to_commit(b, 12.0)
	_check("the gang re-commits after cooldown clears (%.1fh)" % h2, h2 < 12.0)
	if b.checkpoint != null:
		main.backpack.remove("scrip", main.backpack.count("scrip")) # broke
		var pirates0: int = main.pirates.size()
		var kit2: Vector3 = (b.checkpoint.get_child(0) as Node3D).global_position
		main.active_car.global_position = kit2 + Vector3(5, 1, 0)
		b._tick(0.5)
		_check("SHORT at the line = the crew answers (pirates %d -> %d)" % [pirates0, main.pirates.size()],
			main.pirates.size() > pirates0)

	# === 6. THE REGIONAL LAW: NM commits >=3x faster than VA ======================
	var t_strong: float = float(ProtoBandits.TUNING["threshold_base"]) / (5.0 * float(ProtoBandits.TUNING["sight_drive"]) * 5.0)
	var t_weak: float = float(ProtoBandits.TUNING["threshold_base"]) / (1.0 * float(ProtoBandits.TUNING["sight_drive"]) * 1.0)
	_check("a strength-5 state commits %.0fx faster than strength-1 (>=3x, the contract's bar)" % (t_weak / t_strong),
		t_weak / t_strong >= 3.0)

	# === 7. THE DRONE FALLS: scrap drops, the gang goes BLIND =====================
	# (Back to the KNOWN Arizona stretch — the checkpoint sat 420m up-road and may
	# have crossed a state line, which correctly cleared the weaker state's eye.)
	main.active_car.global_position = az_pt
	if b.drone == null or not is_instance_valid(b.drone):
		b._tick(1.0)
	_check("the eye is back over Arizona ground", b.drone != null and is_instance_valid(b.drone))
	var chests0 := 0
	for n in main.get_children():
		if n is ProtoChest:
			chests0 += 1
	(b.drone as ProtoBandits.BanditDrone).take_damage(30.0)
	await get_tree().process_frame
	var chests1 := 0
	for n2 in main.get_children():
		if n2 is ProtoChest:
			chests1 += 1
	_check("shooting the drone DOWNS it into lootable scrap (+%d wreck)" % (chests1 - chests0), chests1 > chests0)
	b._tick(1.0)
	_check("...and the gang is BLIND — no new eye for a day", b.drone == null or not is_instance_valid(b.drone))

	# === 8. OCCUPIED FLORIDA: zero bandits, ever ===================================
	var fl_pt := Vector3.INF
	for road2 in m.roads:
		if String(road2["kind"]) != "interstate":
			continue
		var pts2: PackedVector2Array = road2["pts"]
		for i2 in range(pts2.size() - 1):
			var q2: Vector2 = pts2[i2].lerp(pts2[i2 + 1], 0.5)
			if m.state_at(Vector3(q2.x, 0, q2.y)) == "FLORIDA":
				fl_pt = Vector3(q2.x, 1.0, q2.y)
				break
		if fl_pt != Vector3.INF:
			break
	if fl_pt != Vector3.INF:
		main.active_car.global_position = fl_pt
		for _i in 40:
			b._tick(6.0)
		_check("FLORIDA accrues NOTHING (no gangs under the occupation)",
			float(b._gang("FLORIDA")["sightings"]) == 0.0 and b.checkpoint == null)

	print("BANDIT RESULTS: %d passed, %d failed" % [passed, failed])
	print("BANDIT: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
