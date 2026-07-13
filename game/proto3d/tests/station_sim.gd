## Proof for NAMED RADIO STATIONS (owner ask v2): a SUBFOLDER of mp3s is a
## station (chicago_radio reads as CHICAGO RADIO), O powers the set on/off,
## L turns the dial through stations, ,/. work the volume knob (persisted),
## a powered station rolls track-after-track, and the Y-scan's music signal
## lands on a random station. Real key events; empty shelf = quiet, no crash.
## Run: godot --headless --path game res://proto3d/tests/station_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node3D


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("STATION: %s - %s" % ["PASS" if ok else "FAIL", check_name])


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
	print("STATION: start")
	get_tree().create_timer(60.0).timeout.connect(func() -> void:
		print("STATION: WATCHDOG"); print("STATION: FAILURES PRESENT"); get_tree().quit(1))
	# Clean radio prefs so the run is deterministic.
	if FileAccess.file_exists(ProtoMusic.SETTINGS_PATH):
		DirAccess.remove_absolute(ProtoMusic.SETTINGS_PATH)
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 8:
		await get_tree().process_frame
	var m: ProtoMusic = main.music

	# --- The shelf: folders ARE stations ----------------------------------------
	var st := m.stations()
	var names: Array = []
	for s in st:
		names.append(String(s["name"]))
	_check("folders read as STATIONS (%s)" % str(names), st.size() >= 2)
	_check("CHICAGO RADIO is on the dial (the owner's station)", names.has("CHICAGO RADIO"))
	_check("loose root mp3s read as FREEWAVE (back-compat)", names.has("FREEWAVE"))

	# --- O = power; the set starts quiet -----------------------------------------
	_check("the set starts OFF", not m.power_on and not m.is_playing())
	# O now OPENS THE RADIO DIAL (radio_dial_sim covers that UI); the dial's POWER button
	# calls music.toggle_power() — the power LOGIC this sim is about. Drive it directly.
	m.toggle_power()
	await get_tree().physics_frame
	_check("the dial's power turns the set ON (%s playing)" % m.station_name(), m.power_on and m.is_playing())

	# --- A powered station never goes quiet between tracks -------------------------
	m._on_finished() # the track ends…
	_check("…and the station ROLLS ON (auto-advance)", m.is_playing())

	# --- L = the dial ---------------------------------------------------------------
	var before := m.station_name()
	await _key(KEY_L)
	_check("L turns the DIAL (%s → %s)" % [before, m.station_name()], m.station_name() != before)
	_check("the new station is already playing (power stays on)", m.is_playing())

	# --- , / . = the knob, persisted -------------------------------------------------
	var v0 := m.volume_pct
	await _key(KEY_PERIOD)
	_check("'.' turns it UP (%d → %d)" % [v0, m.volume_pct], m.volume_pct == clampi(v0 + 10, 0, 100))
	await _key(KEY_COMMA)
	await _key(KEY_COMMA)
	_check("',' turns it DOWN", m.volume_pct == clampi(v0 - 10, 0, 100))
	_check("the knob PERSISTS (user://radio_settings.json)", FileAccess.file_exists(ProtoMusic.SETTINGS_PATH))

	# --- O again = off ----------------------------------------------------------------
	m.toggle_power()
	await get_tree().physics_frame
	_check("the dial's power turns it OFF", not m.power_on and not m.is_playing())

	# --- The Y-scan's music signal lands on a random station ---------------------------
	main.radio._deliver("music")
	_check("the dial's MUSIC signal powers a station (%s)" % m.station_name(),
		m.power_on and m.is_playing())
	m.stop()

	# --- The empty-shelf law -------------------------------------------------------------
	m.dir_override = "res://media/music/nowhere"
	_check("an empty shelf can't power on (quietly)", not m.toggle_power())
	_check("the dial on an empty shelf says so", not m.next_station())
	m.dir_override = ""

	print("STATION RESULTS: %d passed, %d failed" % [passed, failed])
	print("STATION: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
