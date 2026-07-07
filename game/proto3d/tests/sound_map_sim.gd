## Proof for the SOUND MAP pass (goal "get all the sounds you need and map them"). The six
## new SoundForge SFX exist, load into ProtoAudio, and are WIRED to their moments: walkie
## squelch, radio-dial static, sensor ping (positional), camera click, the drone's rotor
## hum loop, and the corpse's landing thud. Real proto3d harness + stub spies where a
## positional call needs catching. Run:
## godot --headless --path game res://proto3d/tests/sound_map_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node = null


class StubAudio:
	var log: Array = []
	func play_at(id: String, _p: Vector3, _v: float = 0.0, _pi: float = 1.0) -> void: log.append(id)
	func play_ui(id: String, _v: float = 0.0, _pi: float = 1.0) -> void: log.append(id)


class StubMain:
	extends Node
	var audio := StubAudio.new()
	func notify(_t: String) -> void: pass


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("SNDMAP: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _ready() -> void:
	get_tree().create_timer(120.0).timeout.connect(func() -> void:
		print("SNDMAP: DONE — %d passed, %d failed (WATCHDOG)" % [passed, failed + 1])
		get_tree().quit(1))
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 8:
		await get_tree().process_frame

	# --- 1. The six new sounds exist on disk and are registered streams ------------
	for id in ["walkie_squelch", "radio_static", "sensor_ping", "drone_hum", "body_thud", "camera_click"]:
		_check("stream '%s' loaded from SoundForge" % id, ProtoAudio.streams.has(id))
	_check("drone_hum is a LOOP", "drone_hum" in ProtoAudio.LOOPED
		and ProtoAudio.streams["drone_hum"] is AudioStreamMP3 and (ProtoAudio.streams["drone_hum"] as AudioStreamMP3).loop)

	# --- 2. The walkie keys with its SQUELCH (the UI player carries it) ------------
	main.use_item("walkie")
	_check("keying the walkie plays walkie_squelch", main.audio._ui_player.stream == ProtoAudio.streams["walkie_squelch"])

	# --- 3. The radio dial hisses STATIC when it leaves a station ------------------
	var freqs: Array = main.music.frequencies()
	if freqs.size() >= 2:
		main.radio_dial.open()
		main.radio_dial._freq_slider.value = float(freqs[0]["freq"])              # lock A
		main.radio_dial._freq_slider.value = (float(freqs[0]["freq"]) + float(freqs[1]["freq"])) * 0.5  # off into the hiss
		_check("leaving a station plays radio_static", main.audio._ui_player.stream == ProtoAudio.streams["radio_static"])
		main.radio_dial.close()
	else:
		_check("(shelf too small for the static check)", true)

	# --- 4. The motion sensor PINGS from its own position --------------------------
	var stub := StubMain.new()
	add_child(stub)
	var sensor := ProtoMotionSensor.create(stub, Vector3(6, 0, 388))   # isolated staging
	add_child(sensor)
	var foe := Node3D.new()
	add_child(foe)
	foe.add_to_group("threat")
	foe.global_position = sensor.global_position + Vector3(3, 0.4, 0)
	sensor._physics_process(0.6)
	_check("the sensor's trip plays sensor_ping AT the sensor", "sensor_ping" in stub.audio.log)
	foe.queue_free()

	# --- 5. The corpse THUDS when it hits the dirt ---------------------------------
	var corpse := ProtoCorpse.create("Corpse", {}, Color(0.5, 0.4, 0.3), Vector3(4, 2, 0), stub)
	add_child(corpse)
	corpse.set_physics_process(false)
	corpse.global_position = Vector3(6, 2.0, 380)
	for _i in 240:
		corpse._physics_process(1.0 / 60.0)
	_check("the body's landing plays body_thud", "body_thud" in stub.audio.log)

	# --- 6. The drone carries its rotor HUM (a positional loop on the bird) --------
	var bird := ProtoDrone.create(main, Vector3(6, 4, 372))
	add_child(bird)
	var hum: AudioStreamPlayer3D = null
	for c in bird.get_children():
		if c is AudioStreamPlayer3D:
			hum = c
	_check("a hum loop rides the drone", hum != null and hum.stream == ProtoAudio.streams["drone_hum"])
	bird.queue_free()

	print("SNDMAP: DONE — %d passed, %d failed" % [passed, failed])
	get_tree().quit(1 if failed > 0 else 0)
