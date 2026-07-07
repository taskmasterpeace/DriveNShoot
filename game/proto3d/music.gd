## THE MUSIC LAYER (owner ask, 2026-07-06): mp3s dropped in game/media/music/
## become the game's music — radio/ feeds the DIAL's music stations (Y-scan can
## land on one), game/ is the ambient bed (off by default; a hook, not a habit).
## Files load at RUNTIME from raw bytes — NO import step, so the owner can drop
## an mp3 in the folder and it's on the air. Missing folders = silence, never a crash.
class_name ProtoMusic
extends Node

const RADIO_DIR := "res://media/music/radio"
const GAME_DIR := "res://media/music/game"

var dir_override: String = "" ## sims point this at nowhere to prove the no-crash law
var now_playing: String = ""
var _player: AudioStreamPlayer
var _main: Node = null


static func create(main: Node) -> ProtoMusic:
	var m := ProtoMusic.new()
	m._main = main
	m._player = AudioStreamPlayer.new()
	m._player.volume_db = -10.0
	m.add_child(m._player)
	return m


## Every mp3 on the RADIO shelf right now (a new track = a new file, no code).
func tracks(dir_path: String = "") -> Array:
	var path := dir_path if dir_path != "" else (dir_override if dir_override != "" else RADIO_DIR)
	var out: Array = []
	var dir := DirAccess.open(path)
	if dir == null:
		return out
	for f in dir.get_files():
		if f.ends_with(".mp3"):
			out.append(path + "/" + f)
	return out


## Spin a random track off the shelf. Returns false (quietly) if the shelf's bare.
func play_random() -> bool:
	var list := tracks()
	if list.is_empty():
		return false
	return play_file(list[randi() % list.size()])


## RUNTIME mp3 load — bytes in, stream out, no import. The whole reason the
## owner can fill the dial by dropping files in a folder.
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


func is_playing() -> bool:
	return _player != null and _player.playing
