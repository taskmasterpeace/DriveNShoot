## Proof for the PROVING GROUNDS: the autopilot DRIVES a real lap through the
## ordered checkpoints (inputs only — the iron rule), the lap records a GHOST,
## the ghost replays, and a CHASE AI closes on the moving ghost through the
## obstacle gauntlet — the first vehicle-navigation proof in the engine.
## Run: godot --headless --path game res://proto3d/tests/track_sim.tscn
extends Node

var passed := 0
var failed := 0
var track: ProtoTrack


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("TRK: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _finish() -> void:
	Engine.time_scale = 1.0
	# Leave no sim artifacts: the half-scale ghost/lap would pollute real data.
	DirAccess.remove_absolute(ProjectSettings.globalize_path(ProtoTrackGhost.path_for("scavenger")))
	print("TRK RESULTS: %d passed, %d failed" % [passed, failed])
	print("TRK: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)


func _ready() -> void:
	print("TRK: start")
	get_tree().create_timer(160.0).timeout.connect(func() -> void:
		print("TRK: WATCHDOG — runaway")
		failed += 1
		_finish())
	Engine.time_scale = 2.5 # sprint the wall clock; physics stays deterministic enough for a lap

	track = ProtoTrack.create(0.5, true) # half-size ring, no HUD/camera
	add_child(track)
	await get_tree().physics_frame
	track.spawn_vehicle("scavenger")
	var pilot := ProtoAutopilot.attach(track.car)
	pilot.arrive_dist = 2.0 # checkpoints pass by radius; the pilot just aims

	# --- Phase 1: DRIVE a full lap on inputs only -----------------------------
	var t := 0.0
	while track.laps_done < 1 and t < 100.0:
		pilot.target_pos = track._cps[track.next_cp % track._cps.size()]
		await get_tree().physics_frame
		t += get_physics_process_delta_time()
	_check("the autopilot DROVE a full lap (%.1fs sim, cp-ordered)" % track.last_time, track.laps_done >= 1)
	_check("the lap recorded a time (%.2fs)" % track.best_time, track.best_time > 5.0)
	_check("the GHOST persisted to disk", FileAccess.file_exists(ProtoTrackGhost.path_for("scavenger")))
	var lt: Variant = JSON.parse_string(FileAccess.get_file_as_string(ProtoTrack.LAPTIMES))
	_check("laptimes.json carries the vehicle's best", lt is Dictionary and (lt["laps"] as Dictionary).has("scavenger"))

	# --- Phase 2: the ghost REPLAYS -------------------------------------------
	_check("ghost loads (%d samples)" % track.ghost.samples.size(), track.ghost.load_ghost("scavenger"))
	track.ghost.start_playback()
	var p0: Vector3 = track.ghost.ghost_body().global_position
	for _i in 90:
		await get_tree().physics_frame
	var moved := track.ghost.ghost_body().global_position.distance_to(p0)
	_check("the ghost MOVES its lap line (%.1f m)" % moved, moved > 3.0)

	# --- Phase 3: CHASE AI hunts the moving ghost through the gauntlet --------
	track.ghost.start_playback() # restart the lap for the hunt
	track.spawn_chaser()
	track.car.input_throttle = 0.0 # park the player rig; the hunt is the test
	var closest := 1e9
	t = 0.0
	while t < 45.0 and closest > 10.0:
		await get_tree().physics_frame
		t += get_physics_process_delta_time()
		if not track.ghost.playing:
			track.ghost.start_playback() # keep the rabbit running
		closest = minf(closest, track.chaser.global_position.distance_to(track.ghost.ghost_body().global_position))
	_check("the CHASE AI closes on the moving ghost (nearest %.1f m, want <10)" % closest, closest < 10.0)
	_check("whiskers actually fired during the hunt", track.chaser_ai._whisker_hit.size() == 3)

	_finish()
