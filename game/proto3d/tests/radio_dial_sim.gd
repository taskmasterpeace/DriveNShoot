## Proof for the RADIO FREQUENCY DIAL (music.gd frequency model + radio_dial.gd — the
## control_gallery "premade frequencies" goal). Tests the pure frequency math, real-station
## tuning (locks to a preset / static between), and the dial UI. Backs up user://settings.
## Run: godot --headless --path game res://proto3d/tests/radio_dial_sim.tscn
extends Node

var passed := 0
var failed := 0
const SP := "user://settings.json"
var _backup: String = ""
var _had := false


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("DIAL: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _restore() -> void:
	if _had:
		var f := FileAccess.open(SP, FileAccess.WRITE)
		if f != null:
			f.store_string(_backup); f.close()


func _ready() -> void:
	if FileAccess.file_exists(SP):
		_had = true
		_backup = FileAccess.get_file_as_string(SP)

	var music := ProtoMusic.create(self)
	add_child(music)
	music.power_on = false   # keep it silent for the test (no playback)

	# --- Pure frequency math (explicit counts — no filesystem needed). ---
	_check("n=0 → band floor", music.station_frequency(0, 0) == ProtoMusic.BAND_LO)
	_check("n=1 → mid-band", absf(music.station_frequency(0, 1) - snappedf((ProtoMusic.BAND_LO + ProtoMusic.BAND_HI) * 0.5, 0.2)) < 0.001)
	var f0 := music.station_frequency(0, 3)
	var f1 := music.station_frequency(1, 3)
	var f2 := music.station_frequency(2, 3)
	_check("3 stations spread ascending across the band", f0 < f1 and f1 < f2)
	_check("all presets sit in the FM band", f0 >= ProtoMusic.BAND_LO and f2 <= ProtoMusic.BAND_HI)
	_check("presets snap to the 0.2 MHz grid", absf(f1 - snappedf(f1, 0.2)) < 0.0001)

	# --- Real stations off the shelf (media/music/radio → chicago_radio + FREEWAVE). ---
	var freqs := music.frequencies()
	_check("shelf has ≥2 stations to tune", freqs.size() >= 2)
	if freqs.size() >= 2:
		var fa: float = float(freqs[0]["freq"])
		var fb: float = float(freqs[1]["freq"])
		_check("presets are distinct frequencies", absf(fa - fb) > ProtoMusic.TUNE_LOCK)
		_check("tuning to preset A locks station 0", music.tune_to_frequency(fa) == 0 and music.station_idx == 0)
		_check("tuning to preset B locks station 1", music.tune_to_frequency(fb) == 1 and music.station_idx == 1)
		var mid := (fa + fb) * 0.5
		_check("tuning BETWEEN presets is static (−1)", music.tune_to_frequency(mid) == -1)
		_check("static leaves the tuned station unchanged", music.station_idx == 1)

	# --- The dial UI drives the model. ---
	var dial := ProtoRadioDial.create(music)
	add_child(dial)
	dial.open()
	_check("dial built a preset chip per station", dial._presets.get_child_count() == freqs.size())
	_check("frequency slider spans the band", dial._freq_slider.min_value == ProtoMusic.BAND_LO and dial._freq_slider.max_value == ProtoMusic.BAND_HI)
	if freqs.size() >= 2:
		dial._freq_slider.value = float(freqs[0]["freq"])   # → _on_tune → locks station 0
		_check("moving the dial to preset A selects station 0", music.station_idx == 0)
		_check("readout shows the station (♫) when locked", dial._station_label.text.begins_with("♫"))
		dial._freq_slider.value = (float(freqs[0]["freq"]) + float(freqs[1]["freq"])) * 0.5
		_check("readout shows '— static —' between stations", dial._station_label.text == "— static —")
		_check("readout formats the frequency", dial._readout.text.ends_with("FM"))

	_restore()
	print("DIAL: DONE — %d passed, %d failed" % [passed, failed])
	get_tree().quit(1 if failed > 0 else 0)
