## THE GUN AUDIO REALISM LAW (owner: "make sure ALL gun sound effects are
## realistic"): every firearm sounds like WHAT IT IS. Four laws, held as
## regressions: (1) every ranged weapon declares a fire sound and it resolves
## to a REAL RECORDING (AudioStreamMP3 from SoundForge — a synth square wave
## is not a gunshot); (2) DISTINCTNESS — no two gun classes share a report
## (a rocket launcher must never crack like a 9mm); (3) the whole mechanical
## chain (pump, shell drop, mag drop/insert, dry-fire click) is file-backed;
## (4) the humanizer — repeated shots never play at identical pitch.
## Run: godot --headless --path game res://proto3d/tests/gun_audio_sim.tscn
extends Node

var passed := 0
var failed := 0


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("GUNAUDIO: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _ready() -> void:
	print("GUNAUDIO: start")
	get_tree().create_timer(60.0).timeout.connect(func() -> void:
		print("GUNAUDIO: WATCHDOG")
		print("GUNAUDIO: FAILURES PRESENT")
		get_tree().quit(1))

	var audio := ProtoAudio.new()
	add_child(audio)
	await get_tree().process_frame

	# === 1. COVERAGE: every trigger has a voice ====================================
	var guns: Array[String] = []
	for id in ProtoWeapon.WEAPONS:
		var w: Dictionary = ProtoWeapon.WEAPONS[id]
		var b: int = w["behavior"]
		if b == ProtoWeapon.Behavior.MELEE:
			continue
		guns.append(id)
		if String(w.get("fire_sfx", "")) == "":
			print("GUNAUDIO:   %s has NO fire_sfx row" % id)
	var covered := true
	for id2 in guns:
		if String(ProtoWeapon.WEAPONS[id2].get("fire_sfx", "")) == "":
			covered = false
	_check("every ranged weapon declares a fire_sfx (%d guns)" % guns.size(), covered and guns.size() >= 4)

	# === 2. REAL RECORDINGS: a synth buzz is not a gunshot =========================
	var real_ok := true
	for id3 in guns:
		var sid := String(ProtoWeapon.WEAPONS[id3].get("fire_sfx", ""))
		var st: AudioStream = ProtoAudio.streams.get(sid, null)
		if st == null or not (st is AudioStreamMP3):
			real_ok = false
			print("GUNAUDIO:   %s fire_sfx '%s' is %s" % [id3, sid, "MISSING" if st == null else "SYNTH fallback"])
	_check("every fire sound is a REAL recording (SoundForge mp3, never the synth fallback)", real_ok)

	# === 3. DISTINCTNESS: a rocket launcher never cracks like a 9mm ================
	var by_sfx: Dictionary = {}
	for id4 in guns:
		var sid2 := String(ProtoWeapon.WEAPONS[id4].get("fire_sfx", ""))
		if not by_sfx.has(sid2):
			by_sfx[sid2] = []
		(by_sfx[sid2] as Array).append(id4)
	var distinct := true
	for sid3 in by_sfx:
		if (by_sfx[sid3] as Array).size() > 1:
			distinct = false
			print("GUNAUDIO:   '%s' shared by %s" % [sid3, str(by_sfx[sid3])])
	_check("no two gun classes share a report (pistol/shotgun/rocket/MG all speak their own)", distinct)

	# === 4. THE CHARACTER ENVELOPE: each report fits its weapon ====================
	# A pistol crack is short; the shotgun boom carries more; the rocket LAUNCH
	# (thump + motor whoosh) is the longest voice; the MG report must be punchy
	# enough to overlap-fire cleanly at its 0.13s cooldown.
	var len_of := func(gun: String) -> float:
		var st2: AudioStream = ProtoAudio.streams.get(String(ProtoWeapon.WEAPONS[gun].get("fire_sfx", "")), null)
		return st2.get_length() if st2 != null else -1.0
	var pistol_l: float = len_of.call("pistol")
	var shotgun_l: float = len_of.call("shotgun")
	var rocket_l: float = len_of.call("pipe_rocket")
	var mg_l: float = len_of.call("car_mg")
	_check("the pistol speaks in a crack (%.2fs in 0.3-2.0)" % pistol_l, pistol_l >= 0.3 and pistol_l <= 2.0)
	_check("the shotgun boom carries (%.2fs, >= 0.6)" % shotgun_l, shotgun_l >= 0.6)
	_check("the rocket LAUNCH is the longest voice (%.2fs, >= 1.0 and > pistol)" % rocket_l,
		rocket_l >= 1.0 and rocket_l > pistol_l)
	_check("the MG report stays punchy for automatic fire (%.2fs in 0.2-1.5)" % mg_l, mg_l >= 0.2 and mg_l <= 1.5)

	# === 5. THE MECHANICAL CHAIN is file-backed too ================================
	var chain_ok := true
	for sid4 in ["shotgun_pump", "shell_drop", "reload_drop", "reload_insert", "click"]:
		var st3: AudioStream = ProtoAudio.streams.get(sid4, null)
		if st3 == null or not (st3 is AudioStreamMP3):
			chain_ok = false
			print("GUNAUDIO:   chain sound '%s' is %s" % [sid4, "MISSING" if st3 == null else "SYNTH fallback"])
	_check("pump / shell drop / mag drop / mag seat / dry-fire click are all real recordings", chain_ok)

	# === 6. THE HUMANIZER: no two shots at identical pitch =========================
	# play_at jitters pitch_scale 0.94-1.06 — the law that keeps rapid fire from
	# sounding like one looped sample.
	var pitches: Array[float] = []
	for _i in 3:
		audio.play_at("shot", Vector3.ZERO, -80.0)
		var p := audio.get_child(audio.get_child_count() - 1)
		if p is AudioStreamPlayer3D:
			pitches.append((p as AudioStreamPlayer3D).pitch_scale)
	var band_ok := pitches.size() == 3
	for pv in pitches:
		if pv < 0.94 or pv > 1.06:
			band_ok = false
	_check("repeated shots wear the pitch jitter band 0.94-1.06 (%s)" % str(pitches), band_ok)

	print("GUNAUDIO RESULTS: %d passed, %d failed" % [passed, failed])
	print("GUNAUDIO: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
