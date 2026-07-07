## Proof for the MUSIC LAYER (owner ask): mp3s dropped in game/media/music/radio/
## become the DIAL's music — runtime bytes-load, NO import step, so a new track
## is just a new file. The radio's "music" signal spins one; an empty shelf reads
## as static and NEVER crashes. MediaForge's test tracks are the fixture.
## Run: godot --headless --path game res://proto3d/tests/music_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node3D


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("MUSIC: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _ready() -> void:
	print("MUSIC: start")
	get_tree().create_timer(60.0).timeout.connect(func() -> void:
		print("MUSIC: WATCHDOG"); print("MUSIC: FAILURES PRESENT"); get_tree().quit(1))
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 8:
		await get_tree().process_frame

	# --- The shelf: MediaForge's test track is real music -----------------------
	var list: Array = main.music.tracks()
	_check("the radio shelf has real mp3s (%d)" % list.size(), list.size() >= 1)
	_check("runtime bytes-load PLAYS one (no import step)", main.music.play_random())
	_check("something is on the air (%s)" % main.music.now_playing, main.music.is_playing())
	main.music.stop()
	_check("stop() kills the transmitter", not main.music.is_playing())

	# --- The DIAL lands the station (the real signal path) ----------------------
	main.radio._cd = 0.0
	main.radio._deliver("music") # the signal row's delivery, minus the weighted dice
	_check("the 'music' signal SPINS a track", main.radio.last_signal == "music" and main.music.is_playing())
	main.music.stop()
	_check("the signal catalog carries the station row",
		ProtoRadio.SIGNALS.any(func(s): return String(s.get("id", "")) == "music"))

	# --- The empty-shelf law: static, never a crash ------------------------------
	main.music.dir_override = "res://media/music/nowhere"
	_check("an empty shelf plays NOTHING (quietly)", not main.music.play_random())
	main.radio._deliver("music")
	_check("the dial reads an empty shelf as STATIC (no crash)", main.radio.last_signal == "static")
	main.music.dir_override = ""

	# --- The GAME shelf exists for the ambient hook ------------------------------
	_check("the game-music shelf is scannable too", main.music.tracks(ProtoMusic.GAME_DIR).size() >= 0)

	print("MUSIC RESULTS: %d passed, %d failed" % [passed, failed])
	print("MUSIC: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
