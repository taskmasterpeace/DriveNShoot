## THE RADIO STATIONS (owner ask v2): every SUBFOLDER of game/media/music/radio/
## is a NAMED STATION — chicago_radio/ reads as "CHICAGO RADIO"; loose mp3s in
## the root are the FREEWAVE default. Drop a folder of mp3s = a new station, no
## code, no import step (runtime bytes-load). The set has a POWER switch (O),
## a station dial (L), and a volume knob (, / .) — all rebindable rows — and a
## powered station keeps playing track after track until you shut it off.
## Settings persist to user://radio_settings.json. Missing folders = silence,
## never a crash. game/ is the ambient shelf (a hook, not a habit).
class_name ProtoMusic
extends Node

const RADIO_DIR := "res://media/music/radio"
const GAME_DIR := "res://media/music/game"
const SETTINGS_PATH := "user://radio_settings.json"

## THE MUFFLE BUS (CAR_UI_REQUIREMENTS P0-3): a "Radio" bus, owned ENTIRELY by
## this file (never touches audio.gd's buses) — same idempotent-creation idiom
## as voice.gd's capture bus. The emitter always plays through it; a single
## AudioEffectLowPassFilter sits on the bus and is enabled/disabled wholesale —
## Godot's stock low-pass has no wet/dry knob, so "wet" (doc's tuning table) =
## effect ENABLED at a low, muffled cutoff; "dry" = effect DISABLED entirely.
const BUS_NAME := "Radio"
## Muffled cutoff: low enough to read as "bass thump through a closed door,"
## per the doc's "car door closes" reference. Tuned by ear, not a design number.
const MUFFLE_CUTOFF_HZ := 500.0

var dir_override: String = "" ## sims point this at nowhere to prove the no-crash law
var now_playing: String = ""
var power_on: bool = false
var volume_pct: int = 70      ## 0..100 — the knob (70 ≈ riding under the engine)
var station_idx: int = 0
## THE CAR RADIO IS POSITIONAL (owner ask): a real AudioStreamPlayer3D, reparented
## onto whichever body is carrying it (attach_to) — the active car at the wheel,
## the player on foot otherwise (a carried radio). unit_size scales with the SAME
## knob that sets loudness, so a loud station is both louder near you AND carries
## further — "sounds like it's coming out of the car," and matters to what hears it.
var _player: AudioStreamPlayer3D
var _carrier: Node3D = null
var _main: Node = null
var _rng := RandomNumberGenerator.new()
var _lowpass: AudioEffectLowPassFilter = null
var _lowpass_idx: int = -1
var is_interior: bool = true  ## sim hook: true = full-fidelity (in the cab)
var is_powered: bool = true   ## sim hook: false = battery BROKEN, forced silent


static func create(main: Node) -> ProtoMusic:
	var m := ProtoMusic.new()
	m._main = main
	m._rng.randomize()
	m._ensure_bus()
	m._player = AudioStreamPlayer3D.new()
	m._player.max_polyphony = 1
	m._player.bus = BUS_NAME
	m.add_child(m._player)
	m._player.finished.connect(m._on_finished)
	m._load_settings()
	m._apply_volume()
	return m


## Idempotent (voice.gd's capture-bus idiom) — safe across repeated ProtoMusic
## instances in sims. This bus belongs ONLY to the radio; audio.gd is never touched.
func _ensure_bus() -> void:
	var idx := AudioServer.get_bus_index(BUS_NAME)
	if idx == -1:
		idx = AudioServer.bus_count
		AudioServer.add_bus(idx)
		AudioServer.set_bus_name(idx, BUS_NAME)
		AudioServer.set_bus_send(idx, "Master")
	if AudioServer.get_bus_effect_count(idx) == 0:
		var fx := AudioEffectLowPassFilter.new()
		fx.cutoff_hz = MUFFLE_CUTOFF_HZ
		AudioServer.add_bus_effect(idx, fx)
		AudioServer.set_bus_effect_enabled(idx, 0, false) # starts CLEAR (interior default)
	_lowpass_idx = 0
	_lowpass = AudioServer.get_bus_effect(idx, 0) as AudioEffectLowPassFilter


## Reparent the emitter onto whatever body is carrying the radio right now — the
## car you're driving/standing by, or you on foot. A no-op if it's already there
## (proto3d calls this every tick). A null/freed carrier is a safe no-op: the
## player just stays wherever it last was rather than crash on a missing rig.
func attach_to(carrier: Node3D) -> void:
	if carrier == null or not is_instance_valid(carrier) or carrier == _carrier:
		return
	_carrier = carrier
	var prev := _player.get_parent()
	if prev != null:
		prev.remove_child(_player)
	carrier.add_child(_player)
	_player.position = Vector3.ZERO


## THE MUFFLE (CAR_UI_REQUIREMENTS P0-3): true = in the cab, full fidelity;
## false = exterior (on foot near a parked car, or riding but not seated) —
## the low-pass ENABLES. Called every frame from proto3d's audio-loop tick so
## it flips within the SAME frame the player's mode/active_car state changes
## (no polling delay, no tween — a car door closing is instant).
func set_interior(interior: bool) -> void:
	if interior == is_interior:
		return
	is_interior = interior
	if _lowpass != null:
		var idx := AudioServer.get_bus_index(BUS_NAME)
		if idx != -1:
			AudioServer.set_bus_effect_enabled(idx, _lowpass_idx, not interior)


## THE DEAD BATTERY (CAR_UI_REQUIREMENTS P0-3 edge case): silence, not static —
## a BROKEN battery cuts the radio the same way it already cuts the headlights.
## Read-only poll from proto3d (car_3d.gd's Damageable tier); this file owns no
## car state. Powering back up resumes the CURRENT station where the shelf
## left off (no re-roll) if the set was on when it died.
func set_powered(powered: bool) -> void:
	if powered == is_powered:
		return
	is_powered = powered
	if not powered:
		_player.stream_paused = true
	elif power_on:
		_player.stream_paused = false


## Every station on the shelf: [{id, name, dir, tracks: [paths]}]. Subfolders
## are named stations; loose root mp3s are FREEWAVE (the v1 back-compat pool).
func stations() -> Array:
	var base := dir_override if dir_override != "" else RADIO_DIR
	var out: Array = []
	var d := DirAccess.open(base)
	if d == null:
		return out
	for sub in d.get_directories():
		var tr := _mp3s_in(base + "/" + sub)
		if not tr.is_empty():
			out.append({"id": sub, "name": sub.replace("_", " ").to_upper(),
				"dir": base + "/" + sub, "tracks": tr})
	var loose := _mp3s_in(base)
	if not loose.is_empty():
		out.append({"id": "freewave", "name": "FREEWAVE", "dir": base, "tracks": loose})
	return out


func _mp3s_in(path: String) -> Array:
	var out: Array = []
	var d := DirAccess.open(path)
	if d == null:
		return out
	for f in d.get_files():
		if f.ends_with(".mp3"):
			out.append(path + "/" + f)
	return out


## Back-compat (the dial + sims): the WHOLE pool across every station.
func tracks(dir_path: String = "") -> Array:
	if dir_path != "":
		return _mp3s_in(dir_path)
	var out: Array = []
	for s in stations():
		out.append_array(s["tracks"])
	return out


func station_name() -> String:
	var st := stations()
	if st.is_empty():
		return "dead air"
	return String(st[clampi(station_idx, 0, st.size() - 1)]["name"])


## THE POWER SWITCH (O): on = the current station starts playing and KEEPS
## playing; off = silence. Returns the new state.
func toggle_power() -> bool:
	power_on = not power_on
	if power_on:
		if not _play_current():
			power_on = false # an empty shelf can't power on
	else:
		_player.stop()
		now_playing = ""
	_save_settings()
	return power_on


## THE DIAL (L): next station, wrapping. False if the shelf is bare.
func next_station() -> bool:
	var st := stations()
	if st.is_empty():
		return false
	station_idx = (station_idx + 1) % st.size()
	_save_settings()
	if power_on:
		_play_current()
	return true


## THE KNOB (, / .): 0..100, mapped onto a sane dB curve. Persisted.
func set_volume_pct(p: int) -> void:
	volume_pct = clampi(p, 0, 100)
	_apply_volume()
	_save_settings()


func _apply_volume() -> void:
	# 100% ≈ -4 dB (present, not painful) … 0% ≈ -60 dB (off in all but name).
	_player.volume_db = lerpf(-60.0, -4.0, float(volume_pct) / 100.0)
	# THE RADIUS MATTERS (owner ask): how far the radio CARRIES scales with the
	# same knob — 10% ≈ 12m (barely past the hood) … 100% ≈ 110m (a real beacon).
	# unit_size is the "1 unit of distance" reference for the attenuation curve;
	# max_distance is the hard cutoff, kept a hair past it.
	var audible_m := lerpf(12.0, 110.0, float(volume_pct) / 100.0)
	_player.unit_size = maxf(1.0, audible_m * 0.35)
	_player.max_distance = audible_m


## --- THE FREQUENCY DIAL (control_gallery goal) ---------------------------------------
## The owner's "premade frequencies" idea: every station gets a real FM frequency, spread
## across the band; you TUNE a dial and lock onto a preset (or hit static between them).
const BAND_LO := 88.1
const BAND_HI := 107.9
const TUNE_LOCK := 0.3   ## MHz within a preset that "locks" its station (else static)


## The frequency assigned to station `idx` of `count` — evenly spread across the band,
## snapped to a real 0.2 MHz grid so presets never collide. Deterministic (not saved).
func station_frequency(idx: int, count: int = -1) -> float:
	var n := count if count >= 0 else stations().size()
	if n <= 0:
		return BAND_LO
	if n == 1:
		return snappedf((BAND_LO + BAND_HI) * 0.5, 0.2)
	var f := lerpf(BAND_LO, BAND_HI, float(clampi(idx, 0, n - 1)) / float(n - 1))
	return clampf(snappedf(f, 0.2), BAND_LO, BAND_HI)


## The preset list: [{freq, idx, name}], one entry per station — the dial's tick marks.
func frequencies() -> Array:
	var st := stations()
	var out: Array = []
	for i in st.size():
		out.append({"freq": station_frequency(i, st.size()), "idx": i, "name": String(st[i]["name"])})
	return out


## The frequency the dial currently sits on (the tuned station's preset).
func current_frequency() -> float:
	return station_frequency(station_idx, stations().size())


## Tune the dial to a frequency: locks to the nearest preset within TUNE_LOCK (selects +
## plays that station if powered) and returns its index; otherwise it's STATIC → returns -1
## (the tuned station is left as-is — you're between stations).
func tune_to_frequency(freq: float, lock: float = TUNE_LOCK) -> int:
	var best := -1
	var best_d := lock + 0.001
	for pr in frequencies():
		var d: float = absf(float(pr["freq"]) - freq)
		if d < best_d:
			best_d = d
			best = int(pr["idx"])
	if best >= 0:
		set_station(best)
	return best


## Jump straight to a station index (the dial's absolute select; next_station is relative).
func set_station(idx: int) -> bool:
	var st := stations()
	if st.is_empty():
		return false
	station_idx = clampi(idx, 0, st.size() - 1)
	_save_settings()
	if power_on:
		_play_current()
	return true


## A random track off the CURRENT station.
func _play_current() -> bool:
	var st := stations()
	if st.is_empty():
		return false
	station_idx = clampi(station_idx, 0, st.size() - 1)
	var tr: Array = st[station_idx]["tracks"]
	if tr.is_empty():
		return false
	return play_file(tr[_rng.randi() % tr.size()])


## A powered radio never goes quiet between tracks — the station rolls on.
func _on_finished() -> void:
	if power_on:
		_play_current()


## The dial's "music" signal (Y-scan): land on a RANDOM station and power ON.
func play_random() -> bool:
	var st := stations()
	if st.is_empty():
		return false
	station_idx = _rng.randi() % st.size()
	power_on = true
	var ok := _play_current()
	if not ok:
		power_on = false
	_save_settings()
	return ok


## RUNTIME mp3 load — bytes in, stream out, no import. The whole reason the
## owner can fill a station by dropping files in a folder.
func play_file(path: String) -> bool:
	var bytes := FileAccess.get_file_as_bytes(path)
	if bytes.is_empty():
		return false
	var mp3 := AudioStreamMP3.new()
	mp3.data = bytes
	if mp3.data.is_empty():
		return false
	_player.stream = mp3
	_player.play()
	now_playing = path.get_file().get_basename().replace("_", " ")
	return true


func stop() -> void:
	if _player.playing:
		_player.stop()
	now_playing = ""
	power_on = false


## DEAD BATTERY = SILENCE (P0-3): a powered-off battery reads as not-playing to
## every caller, even though the underlying stream is merely PAUSED (not
## stopped) so a live battery resumes the same spot in the track, not a restart.
func is_playing() -> bool:
	return _player != null and _player.playing and is_powered


func _save_settings() -> void:
	var f := FileAccess.open(SETTINGS_PATH, FileAccess.WRITE)
	if f != null:
		f.store_string(JSON.stringify({"volume_pct": volume_pct, "station_idx": station_idx}))
		f.close()


func _load_settings() -> void:
	if not FileAccess.file_exists(SETTINGS_PATH):
		return
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(SETTINGS_PATH))
	if parsed is Dictionary:
		volume_pct = clampi(int((parsed as Dictionary).get("volume_pct", 70)), 0, 100)
		station_idx = maxi(0, int((parsed as Dictionary).get("station_idx", 0)))
