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

var dir_override: String = "" ## sims point this at nowhere to prove the no-crash law
var now_playing: String = ""
var power_on: bool = false
var volume_pct: int = 70      ## 0..100 — the knob (70 ≈ riding under the engine)
var station_idx: int = 0
var _player: AudioStreamPlayer
var _main: Node = null
var _rng := RandomNumberGenerator.new()


static func create(main: Node) -> ProtoMusic:
	var m := ProtoMusic.new()
	m._main = main
	m._rng.randomize()
	m._player = AudioStreamPlayer.new()
	m.add_child(m._player)
	m._player.finished.connect(m._on_finished)
	m._load_settings()
	m._apply_volume()
	return m


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


func is_playing() -> bool:
	return _player != null and _player.playing


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
