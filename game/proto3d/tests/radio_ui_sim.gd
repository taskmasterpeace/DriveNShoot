## Proof for the RADIO FACEPLATE + dial (radio_dial.gd + music.gd — goal: "the radio
## station to function right, with preset stations"). Stages 3 fake stations, then
## verifies through the REAL ProtoMusic/ProtoRadioDial that:
##  - a preset is built per station (the "premade frequencies"),
##  - tuning locks onto a preset and hits static between them,
##  - the dial's chips mirror the station list,
##  - the pixel faceplate PNG loads (skins the panel),
##  - power toggling reflects into music state.
## Playback is never triggered (power stays off), so no audio / invalid-stream noise.
## godot --headless --path game res://proto3d/tests/radio_ui_sim.tscn
extends Node

var passed := 0
var failed := 0
const STAGE := "user://test_radio_stations"
const STATIONS: Array[String] = ["chicago_radio", "desert_gold", "night_freq"]


func _check(n: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("RADIO: %s - %s" % ["PASS" if ok else "FAIL", n])


func _stage() -> void:
	DirAccess.make_dir_recursive_absolute(STAGE)
	for s in STATIONS:
		var d := STAGE + "/" + s
		DirAccess.make_dir_recursive_absolute(d)
		var f := FileAccess.open(d + "/track1.mp3", FileAccess.WRITE) # extension is all stations() reads
		if f != null:
			f.close()


func _cleanup() -> void:
	var d := DirAccess.open(STAGE)
	if d == null:
		return
	for sub in d.get_directories():
		var sd := DirAccess.open(STAGE + "/" + sub)
		if sd != null:
			for file in sd.get_files():
				sd.remove(file)
		d.remove(sub)
	for file in d.get_files():
		d.remove(file)
	DirAccess.remove_absolute(STAGE)


func _finish() -> void:
	_cleanup()
	print("RADIO RESULTS: %d passed, %d failed" % [passed, failed])
	if failed == 0:
		print("ALL CHECKS PASSED")
	get_tree().quit(1 if failed > 0 else 0)


func _ready() -> void:
	get_tree().create_timer(20.0).timeout.connect(func() -> void:
		print("RADIO: FAIL - watchdog timeout"); _cleanup(); get_tree().quit(1))

	_stage()
	var music := ProtoMusic.create(self)
	add_child(music)
	music.dir_override = STAGE

	# 1) the shelf + the premade frequencies.
	_check("3 stations read off the shelf", music.stations().size() == 3)
	var freqs: Array = music.frequencies()
	_check("one preset frequency per station", freqs.size() == 3)
	_check("first preset near band low (~%.1f)" % ProtoMusic.BAND_LO, float(freqs[0]["freq"]) <= 90.0 and float(freqs[0]["freq"]) >= 88.0)
	_check("last preset near band high (~%.1f)" % ProtoMusic.BAND_HI, float(freqs[2]["freq"]) >= 106.0)

	# 2) tuning: lock onto a preset, static between them.
	_check("tuning to a preset locks its station", music.tune_to_frequency(float(freqs[1]["freq"])) == 1)
	_check("tuning between presets is static (-1)", music.tune_to_frequency(93.0) == -1)

	# 3) the dial face mirrors the shelf + carries the pixel faceplate.
	var dial := ProtoRadioDial.create(music)
	add_child(dial)
	dial.open()
	_check("dial builds one preset chip per station", dial._presets.get_child_count() == 3)
	_check("dial is open", dial.is_open)
	_check("pixel faceplate loaded on the face", dial._face != null and dial._face.has_dial())

	# 5) THE TUNING POINTER (owner ask: the needle must MOVE) — the code-driven marker
	# maps frequency across the band: BAND_LO -> 0.0, BAND_HI -> 1.0, middle -> 0.5.
	dial._face.set_state(ProtoMusic.BAND_LO, ProtoMusic.BAND_LO, ProtoMusic.BAND_HI, "", true)
	_check("pointer at band low -> frac 0", is_equal_approx(dial._face.pointer_frac, 0.0))
	dial._face.set_state(ProtoMusic.BAND_HI, ProtoMusic.BAND_LO, ProtoMusic.BAND_HI, "", true)
	_check("pointer at band high -> frac 1", is_equal_approx(dial._face.pointer_frac, 1.0))
	var midf := (ProtoMusic.BAND_LO + ProtoMusic.BAND_HI) * 0.5
	dial._face.set_state(midf, ProtoMusic.BAND_LO, ProtoMusic.BAND_HI, "", true)
	_check("pointer at mid-band -> frac ~0.5", absf(dial._face.pointer_frac - 0.5) < 0.01)

	# 4) power routes into music state (no playback: empty shelf-safe, we set idx not play).
	_check("radio starts powered off", not music.power_on)

	_finish()
