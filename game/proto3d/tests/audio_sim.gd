## Audio infra proof: streams synthesize, engine hum attaches while driving and
## pitches with speed, gunshots register through the pooled player.
## Run: godot --headless --path game res://proto3d/tests/audio_sim.tscn
extends Node

var main: Node3D
var t: float = 0.0
var phase: int = 0
var phase_t: float = 0.0
var passed: int = 0
var failed: int = 0
var _pitch0: float = 0.0


func _ready() -> void:
	var packed: PackedScene = load("res://proto3d/proto3d.tscn")
	main = packed.instantiate()
	add_child(main)
	print("SND: scene up")


func _check(name: String, ok: bool) -> void:
	if ok:
		passed += 1
		print("SND: PASS - %s" % name)
	else:
		failed += 1
		print("SND: FAIL - %s" % name)


func _physics_process(delta: float) -> void:
	t += delta
	phase_t += delta
	match phase:
		0:
			if phase_t > 0.8:
				_check("all streams built (%d)" % ProtoAudio.streams.size(), ProtoAudio.streams.size() >= 10)
				# SoundForge tier: every mp3 in assets/sfx must have loaded over its synth.
				var disk := 0
				var dir := DirAccess.open("res://assets/sfx")
				if dir:
					for f in dir.get_files():
						if f.ends_with(".mp3"):
							disk += 1
				_check("SoundForge samples loaded (%d files → %d streams)" % [disk, ProtoAudio.from_files],
					ProtoAudio.from_files == disk)
				# The engine loop must LOOP whichever tier provided it (WAV synth or MP3 file).
				var eng: Variant = ProtoAudio.streams.get("engine")
				var loops: bool = (eng is AudioStreamWAV and eng.loop_mode == AudioStreamWAV.LOOP_FORWARD) \
					or (eng is AudioStreamMP3 and eng.loop)
				_check("engine stream loops (%s)" % eng.get_class(), eng != null and loops)
				_check("engine hum attached while driving", main._engine_loop != null and main._engine_loop.playing)
				_pitch0 = main._engine_loop.pitch_scale
				main.cars[0].use_player_input = false
				main.cars[0].input_throttle = 1.0
				phase += 1
				phase_t = 0.0
		1:
			if phase_t > 2.0:
				_check("engine pitch rises with speed (%.2f -> %.2f)" % [_pitch0, main._engine_loop.pitch_scale], main._engine_loop.pitch_scale > _pitch0 + 0.15)
				main.cars[0].input_throttle = 0.0
				var n0 := ProtoAudio.play_count
				main.audio.play_at("shot", main.player.global_position)
				main.audio.play_ui("blip")
				_check("one-shot pool + UI both fired (+%d)" % (ProtoAudio.play_count - n0), ProtoAudio.play_count == n0 + 2)
				phase += 1
				phase_t = 0.0
		2:
			print("SND RESULTS: %d passed, %d failed" % [passed, failed])
			print("SND: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
			get_tree().quit(0 if failed == 0 else 1)

	if t > 20.0:
		print("SND: TIMEOUT")
		print("SND RESULTS: %d passed, %d failed" % [passed, failed])
		get_tree().quit(1)
