## Proof for THE LIVING WORLD, Phase 0 (HANDOFF §0 · LIVING_WORLD_DSOA §21.1): the
## signature "Four Days Later: Florida Under New Law" slice, driven through the REAL
## save→load path. We save at home with a gun in the pack, backdate last_played 4 days,
## load — and the offline EVENT DIRECTOR must flip Florida, change its law, brief us at
## home (NOT arrest us), make the gun contraband, and queue a broadcast. Run:
##   godot --headless --path game res://proto3d/tests/offline_catchup_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node3D


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("CATCHUP: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _ready() -> void:
	print("CATCHUP: start")
	get_tree().create_timer(60.0).timeout.connect(func() -> void:
		print("CATCHUP: WATCHDOG"); print("CATCHUP: FAILURES PRESENT"); get_tree().quit(1))
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 8:
		await get_tree().process_frame

	# --- data spine: the two slice laws exist + JSON added a new one (additive fold) -----
	_check("free_counties_law + faith_occupation_law are code-floor laws",
		ProtoWorldState.LAWS.has("free_counties_law") and ProtoWorldState.LAWS.has("faith_occupation_law"))
	_check("a JSON-only law folded in (a new law = a ROW)",
		ProtoWorldState.LAWS.has("corporate_corridor_law"))
	_check("before catch-up, FLORIDA is free (default controller)",
		main.world_state.controller_of("FLORIDA") == "free_counties"
		and main.world_state.law_id_for("FLORIDA") == "free_counties_law")

	# --- set the stage: at home, a gun in the pack, then SAVE (stamps last_played=now) ---
	main.mode = main.Mode.FOOT
	main.player.is_active = true
	main.player.global_position = main.SAFEHOUSE + Vector3(0, 0.2, 0)
	main.backpack.slots.clear()
	main.backpack.add("pistol", 1)
	main.backpack.add("9mm", 30)
	var data: Dictionary = main.save_game()

	# --- backdate the on-disk save to 4+ days ago and LOAD (the REAL catch-up path) ------
	data["last_played_utc"] = int(data.get("last_played_utc", 0)) - (4 * 86400 + 3600)
	var f := FileAccess.open(main.SAVE_PATH, FileAccess.WRITE)
	f.store_string(var_to_str(data))
	f.close()
	var ok_load: bool = main.load_game()
	_check("the save loads cleanly", ok_load)
	for _i in 4:
		await get_tree().process_frame

	# --- the acceptance criteria (§21.1) -------------------------------------------------
	_check("FLORIDA's controller CHANGED to the Faith Bloc",
		main.world_state.controller_of("FLORIDA") == "broadcast_church")
	_check("FLORIDA's LAW PROFILE changed to Faith Occupation",
		main.world_state.law_id_for("FLORIDA") == "faith_occupation_law")
	_check("a RETURN BRIEFING is pending (days passed, took Florida)",
		not main.world_state.pending_briefing.is_empty()
		and int(main.world_state.pending_briefing.get("days", 0)) == 4
		and String(main.world_state.pending_briefing.get("took_state", "")) == "FLORIDA")
	# gun becomes contraband — legal at home under free law, illegal under the new FL law
	_check("the pistol is now CONTRABAND in Florida",
		main.world_state.player_contraband("FLORIDA").has("pistol"))
	_check("...but the SAME pistol is legal under Free Counties law",
		main.world_state.contraband_in("TEXAS", ["pistol"]).is_empty())
	_check("a BROADCAST was queued (the world announces itself)",
		main.world_state.broadcast_queue.size() > 0)
	# fairness: no instant unavoidable punishment at home
	_check("the player woke SAFE inside the safehouse (not arrested/killed)",
		not main.player.dead_vis and main.player.global_position.distance_to(main.SAFEHOUSE) < 6.0)

	# --- the RETURN BRIEFING is a real SCREEN (surface every system) + dismiss on input --
	_check("the State-of-the-State briefing panel is on screen after load",
		main.hud.briefing_shown())
	_check("the briefing swallows gameplay input while it's up (menu_open gate)",
		main.menu_open == true)
	Input.action_press("interact") # E — step into the day (REAL input, not a teleport)
	Input.action_release("interact")
	var evk := InputEventKey.new()
	evk.keycode = KEY_E
	evk.pressed = true
	Input.parse_input_event(evk)
	for _i in 6:
		await get_tree().process_frame
	_check("any key DISMISSES the briefing and hands input back",
		not main.hud.briefing_shown() and main.menu_open == false)

	# --- determinism: same gap + same seed => same result --------------------------------
	var w2 := ProtoWorldState.create(main)
	var d1: Dictionary = w2.run_offline_catchup(4, 12345)
	var w3 := ProtoWorldState.create(main)
	var d2: Dictionary = w3.run_offline_catchup(4, 12345)
	_check("catch-up is DETERMINISTIC (same seed => same took_state + broadcast count)",
		String(d1.get("took_state", "")) == String(d2.get("took_state", ""))
		and (d1.get("broadcasts", []) as Array).size() == (d2.get("broadcasts", []) as Array).size())
	# a short absence must NOT trigger the major beat (bounded, fair)
	var w4 := ProtoWorldState.create(main)
	var d3: Dictionary = w4.run_offline_catchup(1, 999)
	_check("a 1-day absence does NOT flip a state (threshold respected)",
		String(d3.get("took_state", "")) == "")

	print("CATCHUP RESULTS: %d passed, %d failed" % [passed, failed])
	print("CATCHUP: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
