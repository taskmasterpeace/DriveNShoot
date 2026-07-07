## Proof for THE CAROUSEL PORTAL (carousel_portal.gd, docs/design/CAROUSEL_PORTAL.md).
## Drives the REAL activation path — interact() → arm() → the ten-second countdown →
## fire — one manual second at a time (advance(), same deterministic pattern as
## ProtoStrikePlayer), spying every audio id the portal requests through a stub main.
## Also confirms the generated computer-voice MP3s are real, loadable streams.
## Run: godot --headless --path game res://proto3d/tests/carousel_portal_sim.tscn
extends Node

var passed := 0
var failed := 0


class StubAudio:
	var log: Array = []
	func play_at(id: String, _pos: Vector3, _vol: float = 0.0, _pitch: float = 1.0) -> void:
		log.append(id)


class StubMain:
	extends Node
	var audio := StubAudio.new()
	var notes: Array = []
	func notify(text: String) -> void:
		notes.append(text)


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("PORTAL: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _ready() -> void:
	# The generated voice + charge assets are real, loadable AudioStreamMP3 files.
	var voice_ok := true
	for n in range(1, 11):
		voice_ok = voice_ok and ResourceLoader.exists("res://assets/sfx/portal_cd_%d.mp3" % n)
	_check("all 10 countdown voice MP3s exist (portal_cd_10..1)", voice_ok)
	_check("portal_go + portal_arm + portal_charge MP3s exist",
		ResourceLoader.exists("res://assets/sfx/portal_go.mp3")
		and ResourceLoader.exists("res://assets/sfx/portal_arm.mp3")
		and ResourceLoader.exists("res://assets/sfx/portal_charge.mp3"))
	_check("a countdown clip loads as an audio stream", load("res://assets/sfx/portal_cd_10.mp3") is AudioStream)

	var main := StubMain.new()
	add_child(main)
	var portal := ProtoCarouselPortal.create(main)
	# Don't put it under the engine's _process — step it manually for determinism.

	var spoken: Array = []
	portal.counted.connect(func(n: int) -> void: spoken.append(n))
	var fired := {"hit": false}
	portal.fired.connect(func() -> void: fired["hit"] = true)

	# IDLE: prompt invites activation, nothing has played.
	_check("starts IDLE with the ACTIVATE prompt", portal.interact_prompt(main) == "E — ACTIVATE PORTAL")
	_check("nothing played before activation", main.audio.log.is_empty())

	# ACTIVATE (the real interact the E key would call).
	portal.interact(main)
	_check("interact arms the countdown (state COUNTDOWN)", portal._state == ProtoCarouselPortal.State.COUNTDOWN)
	_check("arming plays the 'portal_arm' voice", "portal_arm" in main.audio.log)
	_check("says TEN immediately on arm", "portal_cd_10" in main.audio.log)
	_check("prompt now shows the live count", portal.interact_prompt(main) == "PORTAL ARMING — 10")
	_check("arming notified the player", main.notes.size() >= 1)

	# Ten one-second steps: 9,8,…,1 then FIRE on the tenth.
	for _i in 10:
		portal.advance(1.0)

	_check("counted 10 down to 1 in order", spoken == [10, 9, 8, 7, 6, 5, 4, 3, 2, 1])
	# Every number voice was requested, in sequence, exactly once.
	var voice_seq: Array = []
	for id in main.audio.log:
		if String(id).begins_with("portal_cd_"):
			voice_seq.append(int(String(id).trim_prefix("portal_cd_")))
	_check("voice clips fired in countdown order", voice_seq == [10, 9, 8, 7, 6, 5, 4, 3, 2, 1])

	# FIRE at zero: the announce clips play, the signal fired, no jump wired (dev build).
	_check("fired() emitted at zero", fired["hit"])
	_check("state is FIRING after zero", portal._state == ProtoCarouselPortal.State.FIRING)
	_check("fire plays portal_go + portal_charge", "portal_go" in main.audio.log and "portal_charge" in main.audio.log)
	_check("fire prompt is blank (not re-activatable mid-fire)", portal.interact_prompt(main) == "")
	_check("dev build did NOT jump — announced instead", main.notes.any(func(t): return "not wired to a gate" in String(t)))

	# Interacting again mid-sequence is a no-op (can't re-arm a live portal).
	var log_len := main.audio.log.size()
	portal.interact(main)
	_check("re-interacting while FIRING does nothing", main.audio.log.size() == log_len)

	# After the reset window it returns to IDLE, ready to activate again.
	portal.advance(ProtoCarouselPortal.RESET_AFTER + 0.1)
	_check("resets to IDLE after the fire window", portal._state == ProtoCarouselPortal.State.IDLE)
	_check("re-armable after reset", portal.interact_prompt(main) == "E — ACTIVATE PORTAL")

	# --- WIRED TO THE RING (goal ②): a gate-mounted portal fires the REAL jump. ---
	var main2 := StubMain.new()
	add_child(main2)
	var wired := ProtoCarouselPortal.create(main2)
	add_child(wired)
	var jumped := {"n": 0}
	wired.jump_action = func() -> void: jumped["n"] += 1
	wired.interact(main2)
	for _i in 10:
		wired.advance(1.0)
	_check("a WIRED portal executes the jump at zero", int(jumped["n"]) == 1)
	_check("wired fire announces THE DIAL, not the dev line", main2.notes.any(func(t): return "THE DIAL" in String(t)))
	wired.advance(ProtoCarouselPortal.RESET_AFTER + 0.1)
	_check("wired portal resets for the next jump", wired._state == ProtoCarouselPortal.State.IDLE)

	print("PORTAL: DONE — %d passed, %d failed" % [passed, failed])
	get_tree().quit(1 if failed > 0 else 0)
