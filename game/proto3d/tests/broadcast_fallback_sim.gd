## Proof for THE LIVING WORLD, Phase 2 (HANDOFF §0 · LIVING_WORLD_DSOA §21.3): the
## BROADCAST layer. An event outcome queues a bulletin; the text ALWAYS exists (the
## fallback floor — a missing TTS/video never blocks); and the radio (Y-scan) delivers
## it as an emergency interrupt that cuts through the static, once. Run:
##   godot --headless --path game res://proto3d/tests/broadcast_fallback_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node3D


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("BCAST: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _ready() -> void:
	print("BCAST: start")
	get_tree().create_timer(60.0).timeout.connect(func() -> void:
		print("BCAST: WATCHDOG"); print("BCAST: FAILURES PRESENT"); get_tree().quit(1))
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 8:
		await get_tree().process_frame
	var ws = main.world_state

	# --- an event outcome creates a broadcast, and its TEXT always exists ----------------
	var digest: Dictionary = ws.run_offline_catchup(4, 777) # flips Florida -> queues a bulletin
	_check("the takeover queued at least one broadcast", ws.broadcast_queue.size() > 0)
	var b0: Dictionary = ws.broadcast_queue[0]
	_check("the bulletin has non-empty TEXT (the fallback floor)", not String(b0.get("text", "")).is_empty())
	_check("the bulletin names the event outcome (Florida / new law)",
		String(b0.get("text", "")).to_upper().contains("FLORIDA")
		or String(b0.get("text", "")).contains("firearms"))
	_check("a fresh bulletin starts UNHEARD", not bool(b0.get("heard", false)))

	# --- queue_broadcast with NO audio pipeline does not crash (text-only path) ----------
	var n_before: int = ws.broadcast_queue.size()
	ws.queue_broadcast("tv", "Southern Emergency Feed: checkpoints active on I-75.")
	_check("queue_broadcast(text-only) appended without crashing", ws.broadcast_queue.size() == n_before + 1)

	# --- the RADIO delivers the bulletin as an emergency interrupt, ONCE -----------------
	main.radio._cd = 0.0
	main.radio.scan()
	_check("Y-scan delivers a BULLETIN first (cuts through the static)", main.radio.last_signal == "bulletin")
	_check("the delivered bulletin is now marked HEARD", bool(ws.broadcast_queue[0].get("heard", false)))
	# THE TWO-CHANNEL LAW (cinema.md Phase 6): the dial drains RADIO bulletins;
	# tv-medium bulletins belong to the SET's lower-third. A radio scan must
	# never eat the television's news.
	main.radio._cd = 0.0
	var radio_unheard_before: int = 0
	var tv_unheard_before: int = 0
	for b in ws.broadcast_queue:
		if not bool(b.get("heard", false)):
			if String(b.get("medium", "radio")) == "tv":
				tv_unheard_before += 1
			else:
				radio_unheard_before += 1
	main.radio.scan()
	var radio_unheard_after: int = 0
	var tv_unheard: int = 0
	for b in ws.broadcast_queue:
		if not bool(b.get("heard", false)):
			if String(b.get("medium", "radio")) == "tv":
				tv_unheard += 1
			else:
				radio_unheard_after += 1
	_check("each scan drains at most one RADIO bulletin (no infinite re-report)",
		radio_unheard_after == max(0, radio_unheard_before - 1))
	_check("the radio does NOT eat the television's news", tv_unheard == tv_unheard_before and tv_unheard >= 1)
	# The SET airs it: opening the TV shows the lower-third and marks it heard.
	main.open_media_panel()
	var aired := false
	for b in ws.broadcast_queue:
		if String(b.get("medium", "")) == "tv" and bool(b.get("heard", false)):
			aired = true
	_check("opening the TV AIRS the tv bulletin (marks it heard)", aired)
	main.media_panel.close()

	print("BCAST RESULTS: %d passed, %d failed" % [passed, failed])
	print("BCAST: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
