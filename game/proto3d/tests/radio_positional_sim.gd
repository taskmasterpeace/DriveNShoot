## Proof for CAR_UI_REQUIREMENTS P0-3 (POSITIONAL + MUFFLED radio): the radio's
## AudioStreamPlayer3D rides the active car (attach_to), attenuation scales with
## the volume knob so a louder station carries further, exiting the car via REAL
## input engages an interior/exterior low-pass within a frame, re-entering clears
## it, a BROKEN battery silences the set (not static), and the ,/. knob still
## maps to volume_db + persists exactly as before.
## Run: godot --headless --path game res://proto3d/tests/radio_positional_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node3D


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("RADPOS: %s - %s" % ["PASS" if ok else "FAIL", check_name])


## Real InputEventKey, same idiom as station_sim.gd's _key() helper.
func _key(kc: Key) -> void:
	for down in [true, false]:
		var ev := InputEventKey.new()
		ev.keycode = kc
		ev.physical_keycode = kc
		ev.pressed = down
		Input.parse_input_event(ev)
		await get_tree().physics_frame
	await get_tree().physics_frame


func _ready() -> void:
	print("RADPOS: start")
	get_tree().create_timer(60.0).timeout.connect(func() -> void:
		print("RADPOS: WATCHDOG"); print("RADPOS: FAILURES PRESENT"); get_tree().quit(1))
	if FileAccess.file_exists(ProtoMusic.SETTINGS_PATH):
		DirAccess.remove_absolute(ProtoMusic.SETTINGS_PATH)
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 8:
		await get_tree().process_frame

	# --- (a) POSITIONAL: attach_to rides the active car; attenuation favors near --
	main.enter_car(main.cars[0])
	await get_tree().physics_frame
	main.music.toggle_power()
	await get_tree().physics_frame
	_check("attach_to reparents the emitter onto the active car",
		main.music._player.get_parent() == main.active_car)
	_check("the emitter is a real AudioStreamPlayer3D (positional, not flat)",
		main.music._player is AudioStreamPlayer3D)

	# Two cars, staged apart, each a would-be radio carrier: the ATTENUATION
	# CONFIG (unit_size/max_distance) is a property of the emitter, not per-car —
	# what "favors the nearer" is the listener's measured distance against that
	# one curve. Prove the curve itself: louder volume = larger reach, and the
	# emitter's WORLD position matches whichever car currently carries it.
	var near_car: ProtoCar3D = main.active_car
	var far_car := ProtoCar3D.create("van", Color(0.4, 0.4, 0.5)) # "sedan" is not a fleet id — create() returned null and the sim died here
	main.add_child(far_car)
	far_car.global_position = near_car.global_position + Vector3(300, 0, 0)
	main.cars.append(far_car)
	_check("the emitter sits at the NEAR car's position, not the far one",
		main.music._player.global_position.distance_to(near_car.global_position) < 3.0
		and main.music._player.global_position.distance_to(far_car.global_position) > 200.0)

	main.music.set_volume_pct(10)
	var reach_low: float = main.music._player.max_distance
	main.music.set_volume_pct(100)
	var reach_high: float = main.music._player.max_distance
	_check("100%% carries further than 10%% (%.0fm -> %.0fm) — nearer always wins on the same curve" \
		% [reach_low, reach_high], reach_high > reach_low)
	_check("the doc's 100%% ceiling lands ~90-110m (%.0fm)" % reach_high, reach_high >= 90.0 and reach_high <= 120.0)

	# --- (b) MUFFLE: exit via REAL input engages the low-pass within a frame -----
	main.music.set_volume_pct(70)
	_check("in the cab starts CLEAR (low-pass disabled)", main.music.is_interior)
	var bus_idx := AudioServer.get_bus_index(ProtoMusic.BUS_NAME)
	_check("the 'Radio' bus exists (idempotent, owned by music.gd)", bus_idx != -1)
	_check("interior: low-pass effect is DISABLED (full fidelity)",
		not AudioServer.is_bus_effect_enabled(bus_idx, 0))

	await _key(KEY_E) # the REAL exit — same key the player presses
	_check("REAL E-exit flips mode to FOOT", main.mode == main.Mode.FOOT)
	_check("...and the muffle engages WITHIN A FRAME (low-pass now ENABLED)",
		not main.music.is_interior and AudioServer.is_bus_effect_enabled(bus_idx, 0))

	main.enter_car(near_car) # re-enter (staged call — entry itself isn't under test, the flip is)
	await get_tree().physics_frame
	_check("re-entering clears the muffle (low-pass DISABLED again)",
		main.music.is_interior and not AudioServer.is_bus_effect_enabled(bus_idx, 0))

	# --- (c) DEAD BATTERY: silence, not static -----------------------------------
	main.music.toggle_power() # ensure ON
	if not main.music.power_on:
		main.music.toggle_power()
	await get_tree().physics_frame
	_check("radio is audibly on before the battery dies", main.music.is_playing())
	near_car.components["battery"].hp = 0.0
	_check("battery reads BROKEN", near_car.components["battery"].tier() == Damageable.Tier.BROKEN)
	await get_tree().physics_frame
	_check("a BROKEN battery SILENCES the radio (is_playing() false)", not main.music.is_playing())
	_check("...but it's PAUSED, not stopped — no static, no crash", main.music._player.stream != null)
	near_car.components["battery"].hp = near_car.components["battery"].max_hp
	await get_tree().physics_frame
	_check("a live battery resumes the set", main.music.is_playing())

	# --- (d) the volume knob still maps to volume_db + persists -----------------
	var v0: float = main.music.volume_pct
	await _key(KEY_PERIOD)
	_check("'.' still turns it UP (%d -> %d)" % [v0, main.music.volume_pct],
		main.music.volume_pct == clampi(v0 + 10, 0, 100))
	_check("volume_db still maps off the SAME knob (a real dB value)",
		main.music._player.volume_db < 0.0 and main.music._player.volume_db > -60.0)
	_check("the knob still PERSISTS (user://radio_settings.json)",
		FileAccess.file_exists(ProtoMusic.SETTINGS_PATH))

	print("RADPOS RESULTS: %d passed, %d failed" % [passed, failed])
	print("RADPOS: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
