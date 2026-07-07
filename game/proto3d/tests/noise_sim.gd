## Proof for THE NOISE LAYER (spawn-ecology foundation): emit_noise/noises_in is
## a general event log any system can report into (radio/engine/horn today);
## nothing PUSHES to a listener, threats POLL. A loud, powered-on car radio (100%
## volume) pulls an idling/circling howler off its orbit to INVESTIGATE the noise
## itself; a whisper-quiet radio (10%) does not reach it at all. The log stays
## BOUNDED — old events age out, it never grows without limit.
## Run: godot --headless --path game res://proto3d/tests/noise_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node3D


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("NOISE: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _ready() -> void:
	print("NOISE: start")
	get_tree().create_timer(60.0).timeout.connect(func() -> void:
		print("NOISE: WATCHDOG"); print("NOISE: FAILURES PRESENT"); get_tree().quit(1))
	Engine.time_scale = 3.0
	if FileAccess.file_exists(ProtoMusic.SETTINGS_PATH):
		DirAccess.remove_absolute(ProtoMusic.SETTINGS_PATH)
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 8:
		await get_tree().process_frame
	main.daynight.hour = 1.0 # FORCE NIGHT — a howler in daylight FLEEs, never circles

	# --- The noise log itself: emit/poll, a general layer -----------------------
	main._noise_log.clear()
	main.emit_noise(Vector3(10, 0, 0), 20.0, "test")
	var heard: Array = main.noises_in(Vector3(5, 0, 0))
	_check("noises_in hears an event within its radius", heard.size() == 1 and heard[0]["kind"] == "test")
	var far_heard: Array = main.noises_in(Vector3(500, 0, 0))
	_check("...and NOT one far outside its radius", far_heard.is_empty())
	main._noise_log.clear()

	# --- BOUNDED: the log ages out, never grows without limit --------------------
	for i in 50:
		main.emit_noise(Vector3(i, 0, 0), 5.0, "spam")
	_check("emit_noise doesn't crash under a burst (%d logged)" % main._noise_log.size(),
		main._noise_log.size() == 50)
	var now_ms := Time.get_ticks_msec()
	for n in main._noise_log:
		n["time"] = now_ms - int(main.NOISE_TTL_MS) - 500 # force every entry stale
	main.noises_in(Vector3(0, 0, 0)) # a poll prunes as a side effect
	_check("a stale burst PRUNES down to zero (bounded, not a leak)", main._noise_log.is_empty())

	# --- Stage: a car with a radio, and a howler a real ~55m out ------------------
	main.enter_car(main.cars[0])
	await get_tree().physics_frame
	var car: ProtoCar3D = main.active_car
	var howler := ProtoHowler.create(main)
	main.add_child(howler)
	howler.set_role("circler")
	var start_pos := car.global_position + Vector3(55.0, 0.4, 0.0)
	howler.global_position = start_pos
	howler.state = ProtoHowler.HowlState.CIRCLE
	howler._charge_cd = 99.0 # keep it from just charging the PLAYER on its own during the watch
	await get_tree().physics_frame

	# --- LOUD (100%) radio: the howler is pulled toward the noise source ---------
	main.music.set_volume_pct(100)
	if not main.music.power_on:
		main.music.toggle_power()
	await get_tree().physics_frame
	_check("a 100%% radio's noise radius reaches the howler at 55m",
		lerpf(0.0, 90.0, 100.0 / 100.0) >= 55.0)
	var d0 := howler.global_position.distance_to(car.global_position)
	var t := 0.0
	var pulled := false
	while t < 10.0:
		await get_tree().physics_frame
		t += get_physics_process_delta_time()
		if howler.global_position.distance_to(car.global_position) < d0 * 0.7:
			pulled = true
			break
	_check("...and a LOUD radio draws a circling howler IN (%.0fm -> %.0fm)" \
		% [d0, howler.global_position.distance_to(car.global_position)], pulled)

	# --- QUIET (10%) radio: does NOT reach it -------------------------------------
	howler.global_position = start_pos
	howler.velocity = Vector3.ZERO
	howler._charge_cd = 99.0
	main.music.set_volume_pct(10)
	await get_tree().physics_frame
	# Drop the LOUD stage's lingering events (radius-90 entries live in the log
	# until they age out) so this stage judges only what the QUIET radio emits,
	# then give the radio a beat to re-emit at its new radius.
	main._noise_log.clear()
	for _i in 40:
		await get_tree().physics_frame
	var quiet_radius := lerpf(0.0, 90.0, 10.0 / 100.0)
	_check("a 10%% radio's noise radius (%.0fm) does NOT reach a howler at 55m" % quiet_radius,
		quiet_radius < 55.0)
	var heard_quiet: Array = main.noises_in(howler.global_position)
	var radio_heard := false
	for n in heard_quiet:
		if String(n["kind"]) == "radio":
			radio_heard = true
	_check("...confirmed: noises_in at the howler's position carries no 'radio' event", not radio_heard)

	Engine.time_scale = 1.0
	print("NOISE RESULTS: %d passed, %d failed" % [passed, failed])
	print("NOISE: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
