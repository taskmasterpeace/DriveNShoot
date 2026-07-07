## Proof for RACING v0's engine: ProtoRaceController drives ordered checkpoints,
## laps, and best-time persistence off REAL position updates on a plain body —
## no scene, no input, no car physics required (the controller is body-agnostic
## by design — a race board times whatever's handed to it). Also proves the
## ordering law (skip a gate, it does NOT advance) and the ghost path parameter.
## Run: godot --headless --path game res://proto3d/tests/race_controller_sim.tscn
extends Node

var passed := 0
var failed := 0
const TEST_RACE_ID := "rc_sim_test_race"
const TEST_VEHICLE := "rc_sim_rig"


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("RCS: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _finish() -> void:
	Engine.time_scale = 1.0
	# Leave no artifacts: strip this sim's own race id out of user://race_times.json
	# and remove any ghost files it wrote, so a real playthrough's data stays clean.
	if FileAccess.file_exists(ProtoRaceController.BEST_TIMES):
		var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(ProtoRaceController.BEST_TIMES))
		if parsed is Dictionary and (parsed as Dictionary).has("races"):
			var races: Dictionary = parsed["races"]
			if races.has(TEST_RACE_ID):
				races.erase(TEST_RACE_ID)
				parsed["races"] = races
				var f := FileAccess.open(ProtoRaceController.BEST_TIMES, FileAccess.WRITE)
				f.store_string(JSON.stringify(parsed, "  "))
				f.close()
	var ghost_dir := "user://ghosts_rc_sim"
	if DirAccess.dir_exists_absolute(ProjectSettings.globalize_path(ghost_dir)):
		var d := DirAccess.open(ghost_dir)
		if d:
			for f in d.get_files():
				DirAccess.remove_absolute(ProjectSettings.globalize_path(ghost_dir).path_join(f))
		DirAccess.remove_absolute(ProjectSettings.globalize_path(ghost_dir))
	print("RCS RESULTS: %d passed, %d failed" % [passed, failed])
	print("RCS: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)


## A plain Node3D stand-in body — proves the controller is truly body-agnostic
## (no VehicleBody3D/ProtoCar3D dependency at all).
class DummyBody:
	extends Node3D


func _ready() -> void:
	print("RCS: start")
	get_tree().create_timer(60.0).timeout.connect(func() -> void:
		print("RCS: WATCHDOG — runaway")
		failed += 1
		_finish())

	var body := DummyBody.new()
	add_child(body)
	body.global_position = Vector3(0, 0, 0)

	# A small square ring, easy to reason about: 4 checkpoints, 2 laps required.
	var race_row: Dictionary = {
		"id": TEST_RACE_ID, "name": "RC Sim Test Loop",
		"checkpoints": [Vector3(0, 0, 0), Vector3(20, 0, 0), Vector3(20, 0, 20), Vector3(0, 0, 20)],
		"laps": 2, "check_r": 3.0,
	}
	var race := ProtoRaceController.create(race_row, body)
	add_child(race)

	var cp_hits: Array = []
	race.checkpoint_hit.connect(func(i: int) -> void: cp_hits.append(i))
	var lap_times: Array = []
	race.lap_done.connect(func(t: float) -> void: lap_times.append(t))
	# NOTE: a plain float local is captured BY VALUE in a GDScript lambda — an
	# array is the reference-type idiom (same trick cp_hits/lap_times already
	# use) to let the callback actually write back to the outer scope.
	var finished_at: Array = [-1.0]
	race.race_finished.connect(func(t: float) -> void: finished_at[0] = t)

	race.start(TEST_VEHICLE)
	_check("controller ARMS on start()", race.running)
	_check("no best time yet (fresh race id)", race.best_time <= 0.0)

	# --- Phase 1: ORDERING LAW — try to skip checkpoint 2 (index 2), it must
	# NOT advance past checkpoint 1 (index 1) until checkpoint 1 is actually hit.
	body.global_position = Vector3(20, 0, 20) # sitting ON checkpoint index 2 already
	for _i in 5:
		race.tick(0.1)
	_check("skipping a gate does NOT advance (still awaiting cp 1, next_cp=%d)" % race.next_cp, race.next_cp == 1)
	_check("no checkpoint_hit fired for the skipped gate", cp_hits.is_empty())

	# Now actually walk it in order: 0 (start) -> 1 -> 2 -> 3 -> 0 (lap 1).
	var route: Array = [Vector3(0, 0, 0), Vector3(20, 0, 0), Vector3(20, 0, 20), Vector3(0, 0, 20), Vector3(0, 0, 0)]
	for i in range(1, route.size()):
		var a: Vector3 = route[i - 1]
		var b: Vector3 = route[i]
		for step in 10:
			var f := float(step) / 9.0
			body.global_position = a.lerp(b, f)
			race.tick(1.0 / 30.0)

	# The 4th gate crossing is "back through the start/finish line" — the
	# controller emits index 0 for it (next_cp wraps: 4 % 4 == 0), the same
	# behavior track.gd's original ring logic had (a lap = every gate PLUS
	# crossing the line again). So the in-order sequence is [1, 2, 3, 0], not
	# [1, 2, 3] — the finish line hit is itself a real, useful signal.
	_check("checkpoint_hit fired in order incl. the finish line (%s)" % str(cp_hits), cp_hits == [1, 2, 3, 0])
	_check("lap_done fired once after the first lap (%s)" % str(lap_times), lap_times.size() == 1)
	_check("elapsed time is sane after lap 1 (%.3fs)" % race.elapsed, race.elapsed > 0.05 and race.elapsed < 30.0)
	_check("laps_done == 1", race.laps_done == 1)
	_check("still running (2 laps required)", race.running)
	_check("race_finished has NOT fired yet", finished_at[0] < 0.0)

	# --- Phase 2: finish the second lap -> race_finished + best-time persists.
	for i in range(1, route.size()):
		var a2: Vector3 = route[i - 1]
		var b2: Vector3 = route[i]
		for step in 10:
			var f2 := float(step) / 9.0
			body.global_position = a2.lerp(b2, f2)
			race.tick(1.0 / 30.0)

	_check("lap_done fired a second time (%s)" % str(lap_times), lap_times.size() == 2)
	_check("race_finished fired (%.3fs)" % finished_at[0], finished_at[0] > 0.0)
	_check("controller stopped itself at lap cap", not race.running)
	_check("laps_done == 2 (the cap)", race.laps_done == 2)

	# --- Phase 3: best-time persists to disk AND round-trips on a fresh instance.
	_check("best_time recorded on the live instance (%.3fs)" % race.best_time, race.best_time > 0.0)
	_check("user://race_times.json exists (NOT res://)", FileAccess.file_exists(ProtoRaceController.BEST_TIMES))
	var on_disk: Variant = JSON.parse_string(FileAccess.get_file_as_string(ProtoRaceController.BEST_TIMES))
	var disk_ok: bool = on_disk is Dictionary and (on_disk as Dictionary).has("races") \
		and (on_disk["races"] as Dictionary).has(TEST_RACE_ID) \
		and (on_disk["races"][TEST_RACE_ID] as Dictionary).has(TEST_VEHICLE)
	_check("best time landed under races[%s][%s] on disk" % [TEST_RACE_ID, TEST_VEHICLE], disk_ok)

	var fresh := ProtoRaceController.create(race_row, body)
	add_child(fresh)
	fresh.start(TEST_VEHICLE)
	_check("a NEW controller instance loads the SAME best time on start() (%.3f == %.3f)" % [fresh.best_time, race.best_time],
		absf(fresh.best_time - race.best_time) < 0.001)

	# A worse (slower) "run" must NOT overwrite the best time.
	var worse_row := race_row.duplicate(true)
	worse_row["id"] = TEST_RACE_ID
	var slow := ProtoRaceController.create(worse_row, body)
	add_child(slow)
	slow.start(TEST_VEHICLE)
	# Fake a slower total by ticking a long idle stretch before finishing — cheap way
	# to guarantee elapsed > the fast run's best without re-driving the whole loop twice.
	slow.tick(race.best_time + 5.0)
	body.global_position = route[0]
	for i in range(1, route.size()):
		var a3: Vector3 = route[i - 1]
		var b3: Vector3 = route[i]
		for step in 10:
			var f3 := float(step) / 9.0
			body.global_position = a3.lerp(b3, f3)
			slow.tick(1.0 / 30.0)
	for i in range(1, route.size()):
		var a4: Vector3 = route[i - 1]
		var b4: Vector3 = route[i]
		for step in 10:
			var f4 := float(step) / 9.0
			body.global_position = a4.lerp(b4, f4)
			slow.tick(1.0 / 30.0)
	var after_slow: Variant = JSON.parse_string(FileAccess.get_file_as_string(ProtoRaceController.BEST_TIMES))
	var kept_fast: bool = after_slow is Dictionary and \
		absf(float((after_slow["races"][TEST_RACE_ID] as Dictionary)[TEST_VEHICLE]) - race.best_time) < 0.001
	_check("a SLOWER finish does not clobber the persisted best time", kept_fast)

	# --- Phase 4: the ghost's storage path is a parameter (race variant writes
	# under its own user://ghosts folder, default track behavior untouched).
	var ghost := ProtoTrackGhost.new()
	add_child(ghost)
	ghost.dir = "user://ghosts_rc_sim"
	_check("ghost default dir is still the legacy res://data/ghosts (untouched)",
		ProtoTrackGhost.DEFAULT_DIR == "res://data/ghosts")
	ghost.start_recording()
	body.global_position = Vector3(0, 0, 0)
	ghost.record(0.1, body)
	body.global_position = Vector3(5, 0, 5)
	ghost.record(0.1, body)
	ghost.save_recording(TEST_VEHICLE, 12.34)
	var expect_path := "user://ghosts_rc_sim/%s.json" % TEST_VEHICLE
	_check("parameterized ghost wrote to its OWN user:// dir (%s)" % expect_path, FileAccess.file_exists(expect_path))
	var loaded := ghost.load_ghost(TEST_VEHICLE)
	_check("the parameterized ghost loads back from that same dir", loaded)
	_check("static path_for(id, dir) matches the instance's own path",
		ProtoTrackGhost.path_for(TEST_VEHICLE, "user://ghosts_rc_sim") == expect_path)

	_finish()
