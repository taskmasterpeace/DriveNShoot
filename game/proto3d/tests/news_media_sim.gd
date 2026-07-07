## Proof for NEWS FROM WORLD STATE + PUBLIC SCREENS (docs/cinema.md Phases 5–6):
## force a state takeover → the TV reports it (a tv bulletin exists, naming the
## state); post a bounty → the RADIO reports it on the next scan; a weather event
## makes the wire; a channel row TUNES a public screen by faction; and a world-
## event clip PREEMPTS the screen's idle loop. All rows, no hardcoded catalog.
## Run: godot --headless --path game res://proto3d/tests/news_media_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node3D


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("NEWS: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _ready() -> void:
	print("NEWS: start")
	get_tree().create_timer(60.0).timeout.connect(func() -> void:
		print("NEWS: WATCHDOG"); print("NEWS: FAILURES PRESENT"); get_tree().quit(1))
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 8:
		await get_tree().process_frame
	var ws = main.world_state

	# --- Phase 6: force a TAKEOVER → the TV reports it --------------------------
	ws.run_offline_catchup(4, 777) # the canonical Florida fall
	var tv_line := ""
	for b in ws.broadcast_queue:
		if String(b.get("medium", "")) == "tv" and not bool(b.get("heard", false)):
			tv_line = String(b.get("text", ""))
			break
	_check("the takeover puts NEWS on the TV (a tv bulletin exists)", tv_line != "")
	_check("the TV names the event (FLORIDA, new law)", tv_line.to_upper().contains("FLORIDA"))
	_check("the SET surfaces it as the lower-third", main.newsroom.latest_tv_line() == tv_line)

	# --- Phase 6: force a BOUNTY → the radio reports it --------------------------
	# (each scan drains ONE bulletin; the takeover's is ahead in line — sweep on)
	main.newsroom.report_bounty(120, "GEORGIA")
	var bounty_heard := false
	for _sweep in 5:
		main.radio._cd = 0.0
		main.radio.scan()
		for b in ws.broadcast_queue:
			if bool(b.get("heard", false)) and String(b.get("medium", "radio")) != "tv" \
					and String(b.get("text", "")).contains("120"):
				bounty_heard = true
		if bounty_heard:
			break
	_check("the BOUNTY hits the dial (radio drains it on scan)", bounty_heard)

	# --- Phase 6: weather makes the wire ------------------------------------------
	main.newsroom.report_weather("dust")
	var dust_on_wire := false
	for b in ws.broadcast_queue:
		if String(b.get("text", "")).contains("Dust wall"):
			dust_on_wire = true
	_check("a WEATHER event makes the wire", dust_on_wire)

	# --- Phase 5: channel rows tune a public screen --------------------------------
	var scr: ProtoPublicScreen = main.public_screen
	_check("channel rows FOLDED from data (faith_voice is a row)",
		ProtoPublicScreen.CHANNELS.any(func(c): return String(c.get("id", "")) == "faith_voice"))
	scr.tune()
	var default_channel := String(scr.channel.get("id", ""))
	var my_state: String = main.stream.usmap.state_at(scr.global_position)
	ws.state_control[my_state] = "broadcast_church" # the Bloc takes the home state
	scr.tune()
	_check("occupation RETUNES the screen (%s → %s)" % [default_channel, String(scr.channel.get("id", ""))],
		String(scr.channel.get("id", "")) == "faith_voice" and default_channel != "faith_voice")
	ws.state_control.erase(my_state)

	# --- Phase 5: the idle loop runs without selection; an event clip PREEMPTS -----
	scr.tune()
	scr.power_on()
	_check("the public screen runs a LOOP nobody chose (%s)" % scr.now_showing,
		scr.now_showing != "" and scr.preempted_by == "")
	ws.queue_broadcast("tv", "EMERGENCY — test broadcast interrupt.")
	ws.broadcast_queue[-1]["clip_id"] = "test_pattern" # a world-event-specific clip
	scr._next()
	_check("a world-event CLIP preempts the loop", scr.preempted_by != "" and scr.now_showing == "test_pattern")
	scr._next()
	_check("after the news, the loop resumes", scr.preempted_by == "")

	print("NEWS RESULTS: %d passed, %d failed" % [passed, failed])
	print("NEWS: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
