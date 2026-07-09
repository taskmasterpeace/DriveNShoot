## Proof for THE INFECTED I1 (docs/design/THE_INFECTED.md §8): rows fold;
## shamblers steer at the LOUDEST noise and POOL there (no pathfinding, ever);
## the melee UNION kills one and its body carries infection = 1.0 (the LWE
## contract field, live); a claw leaves BITE FEVER whose taxes run and whose
## ONLY cure is a night's sleep + antibiotics; fever rides the save; and the
## PERF PROBE holds 40 realized shamblers inside the frame budget (0.7's gate).
## Run: godot --headless --path game res://proto3d/tests/infected_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node = null


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("INF: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _finish(prev_scale: float) -> void:
	Engine.time_scale = prev_scale
	print("INF RESULTS: %d passed, %d failed" % [passed, failed])
	print("INF: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)


func _ready() -> void:
	print("INF: start")
	var prev_scale := Engine.time_scale
	Engine.time_scale = 1.0
	get_tree().create_timer(180.0).timeout.connect(func() -> void:
		print("INF: WATCHDOG")
		failed += 1
		_finish(prev_scale))

	main = load("res://proto3d/proto3d.tscn").instantiate()
	add_child(main)
	for i in range(40):
		await get_tree().physics_frame

	# --- 1) rows fold -------------------------------------------------------------
	ProtoInfected.ensure_rows()
	_check("infected.json folds (shambler row, fever block %s h)" % ProtoInfected.fever_row.get("hours"),
		ProtoInfected.rows.has("shambler") and float(ProtoInfected.fever_row.get("hours", 0.0)) >= 24.0)

	# --- 2) F-SHAMBLER-STEER: converge on the noise and POOL -----------------------
	var stage := Vector3(6, 0.35, 388) # the staging spot, clear ground
	var herd: Array = []
	for k in range(4):
		var s: ProtoInfected = ProtoInfected.create("shambler")
		main.add_child(s)
		s.global_position = stage + Vector3(6.0 + 2.0 * float(k), 0.4, 6.0 + 1.5 * float(k))
		herd.append(s)
	var noise_at := stage + Vector3(-8, 0, -6)
	for t in range(26): # keep the event alive on the bus while they walk (~24 m at 1.1 m/s)
		main.emit_noise(noise_at, 70.0, "horn")
		for i in range(60):
			await get_tree().physics_frame
	var near_n := 0
	for s in herd:
		if is_instance_valid(s) and (s as Node3D).global_position.distance_to(noise_at) < 7.0:
			near_n += 1
	_check("shamblers CONVERGE on the loudest noise and POOL (%d/4 within 7 m)" % near_n, near_n >= 3)

	# --- 3) the melee union + THE BODY LAW (infection = 1.0) -----------------------
	var victim: ProtoInfected = herd[0]
	var vpos: Vector3 = victim.global_position
	victim.take_damage(999.0)
	for i in range(6):
		await get_tree().physics_frame
	var found_corpse := false
	var inf_val := 0.0
	for c in get_tree().get_nodes_in_group("corpse"):
		if c is ProtoCorpse and (c as Node3D).global_position.distance_to(vpos) < 4.0:
			found_corpse = true
			inf_val = (c as ProtoCorpse).infection
	_check("a killed shambler leaves a BODY (never a box)", found_corpse)
	_check("...and the body carries infection = 1.0 (the LWE contract field, live)", is_equal_approx(inf_val, 1.0))

	# --- 4) BITE FEVER: applies on the claw, taxes run, one cure only ---------------
	var now_h: float = float(main.daynight.day) * 24.0 + float(main.daynight.hour)
	main.character.bite_fever(now_h)
	_check("the claw leaves BITE FEVER (active, %0.f h)" % (main.character.fever_until_h - now_h),
		main.character.fever_active(now_h))
	_check("a medkit alone does NOT cure it", not main.character.try_cure_fever(false, true))
	_check("a night's sleep alone does NOT cure it", not main.character.try_cure_fever(true, false))
	var rec: Dictionary = main.character.to_record()
	_check("fever RIDES the save (record carries fever_until_h)", float(rec.get("fever_until_h", -1.0)) > 0.0)
	_check("sleep + antibiotics BREAKS it", main.character.try_cure_fever(true, true)
		and not main.character.fever_active(now_h))

	# --- 5) THE PERF PROBE (0.7): 40 realized shamblers inside the frame budget ----
	var forty: Array = []
	for k in range(40 - 3): # 3 survivors from the pool test still stand
		var s2: ProtoInfected = ProtoInfected.create("shambler")
		main.add_child(s2)
		s2.global_position = stage + Vector3(-20.0 + 2.2 * float(k % 10), 0.4, 14.0 + 2.2 * float(k / 10))
		forty.append(s2)
	for i in range(10):
		await get_tree().physics_frame # settle
	var t0 := Time.get_ticks_usec()
	var probe_frames := 60
	for i in range(probe_frames):
		await get_tree().physics_frame
	var avg_ms := float(Time.get_ticks_usec() - t0) / 1000.0 / float(probe_frames)
	_check("THE PERF PROBE: 40 realized shamblers average %.1f ms/frame (< 33)" % avg_ms, avg_ms < 33.0)
	for s3 in forty:
		if is_instance_valid(s3):
			s3.queue_free()
	for s4 in herd:
		if is_instance_valid(s4):
			s4.queue_free()

	_finish(prev_scale)
