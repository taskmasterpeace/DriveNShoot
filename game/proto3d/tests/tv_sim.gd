## Proof for the SAFEHOUSE TV MVP (docs/cinema.md Phase 2 acceptance): walk to
## the set, E opens the panel (feet freeze), pick the test reel off the shelf,
## it PLAYS (a real Theora stream MediaForge converted), TIME PASSES while it
## rolls, watched persists through the save, E turns it off and gives you back
## your feet. Real key events; the reel is real media off the real manifest.
## Run: godot --headless --path game res://proto3d/tests/tv_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node3D


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("TV: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _e() -> void:
	for down in [true, false]:
		var ev := InputEventKey.new()
		ev.keycode = KEY_E
		ev.physical_keycode = KEY_E
		ev.pressed = down
		Input.parse_input_event(ev)
		await get_tree().physics_frame
		await get_tree().physics_frame


func _ready() -> void:
	print("TV: start")
	get_tree().create_timer(75.0).timeout.connect(func() -> void:
		print("TV: WATCHDOG"); print("TV: FAILURES PRESENT"); get_tree().quit(1))
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 8:
		await get_tree().process_frame

	main._exit_car()
	var p: ProtoPlayer3D = main.player
	# Home, RIGHT in front of the set (the home chest sits 1.3m away and wins
	# the nearest-interactable race from farther back — stand at the screen).
	p.global_position = main.SAFEHOUSE + Vector3(-3.0, 0.35, -1.4)
	p.velocity = Vector3.ZERO
	for _i in 8:
		await get_tree().physics_frame

	_check("the catalog LOADED (manifest rows: %d)" % main.media_registry.rows.size(),
		main.media_registry.rows.size() >= 1)
	_check("the TEST REEL is on the manifest (MediaForge made it)",
		main.media_registry.rows.has("test_pattern"))
	_check("the reel's file is INSTALLED", main.media_registry.installed("test_pattern"))
	_check("the TV is the current interactable", main._current_interactable is ProtoTV)

	# --- E opens the set; the feet freeze ---------------------------------------
	await _e()
	_check("E opens the media panel", main.media_panel.is_open)
	for _i in 6: # input_locked latches a frame or two after the panel opens — converge, not snapshot (load-flaky)
		if p.input_locked:
			break
		await get_tree().physics_frame
	_check("the feet FREEZE while the set is on", p.input_locked)

	# --- Pick the reel off the CLIPS shelf --------------------------------------
	main.media_panel.set_category("clips")
	await get_tree().process_frame
	main.media_panel.select_media("test_pattern")
	for _i in 4:
		await get_tree().physics_frame
	_check("the reel ROLLS (stream live: %s)" % main.media_panel.now_playing_id,
		main.media_panel.playing() and main.media_panel.now_playing_id == "test_pattern")
	_check("watching MARKS it watched", main.media_watched.has("test_pattern"))

	# --- TIME RUNS 1:1 while it plays (owner 2026-07-07: the old fast-forward
	# was "absurd" — a broadcast is real time; the AIR CLOCK keeps schedules honest)
	var h0: float = main.daynight.hour
	for _i in 60:
		await get_tree().physics_frame
	var dh_watching: float = main.daynight.hour - h0
	# --- THE COUCH (owner): E-closing mid-reel keeps it playing ON THE SET ------
	main.media_panel.close()
	for _i in 4:
		await get_tree().physics_frame
	_check("closing the panel mid-reel keeps it rolling ON THE SET (couch mode)",
		main.media_panel.set_playing())
	var tv_node: Node = main.media_panel.tv_set
	_check("...and the SET's screen carries the live picture", tv_node != null and tv_node.is_live())
	# TV FIX (2026-07-08, owner replay of "I hear it but I don't SEE it on the TV"): the
	# picture is now a SubViewport(UPDATE_ALWAYS) ViewportTexture — it re-renders EVERY
	# frame whether or not the 2D panel is on screen, so the set is never a frozen frame
	# (the old get_video_texture()-off-a-1px-hidden-player path). Verify the real pipeline,
	# not just that a material got assigned (the false-green the old check let through).
	var vp: SubViewport = main.media_panel._vp
	_check("the panel drives an ALWAYS-render SubViewport (not a hidden video player)",
		vp != null and vp.render_target_update_mode == SubViewport.UPDATE_ALWAYS)
	_check("...the video plays INSIDE that viewport", main.media_panel._video.get_parent() == vp)
	_check("...the SET's screen texture IS that live viewport (the wiring is real, end to end)",
		tv_node._live_material != null and tv_node._live_material.albedo_texture == vp.get_texture())
	# The screen is a QUADMESH so the WHOLE frame shows — a BoxMesh atlases its 6 faces
	# and the front sampled only a cropped sub-rect (owner: "a piece cropped of the image").
	_check("...on a QuadMesh (full-frame, not a BoxMesh sub-rect crop)", tv_node.screen.mesh is QuadMesh)
	_check("...the couch reel keeps PLAYING (audio + always-live frames)", main.media_panel._video.is_playing())
	_check("...but the fullscreen CHROME is gone (no fullscreen takeover)",
		main.media_panel.visible and not main.media_panel._root.visible)
	_check("...prompt now offers FULLSCREEN", String(tv_node.interact_prompt(main)).contains("FULLSCREEN"))
	main.media_panel.power_off()
	for _i in 4:
		await get_tree().physics_frame
	_check("power OFF stops the set and restores the idle glow",
		not main.media_panel.set_playing() and not tv_node.is_live())
	var h1: float = main.daynight.hour
	for _i in 60:
		await get_tree().physics_frame
	var dh_idle: float = main.daynight.hour - h1
	_check("time runs 1:1 while the reel rolls — NO fast-forward (Δ%.3fh vs idle Δ%.3fh)" % [dh_watching, dh_idle],
		absf(dh_watching - dh_idle) < 0.006)

	# --- THE AIR CLOCK: a channel is a BROADCAST — the schedule is a pure function
	# of the world clock (same clock = same program+offset; advance the clock past
	# the program's runtime = the NEXT program is on).
	var ch: Dictionary = {"id": "air_test", "categories": ["clips"]}
	var plist: Array = main.media_panel._channel_playlist(ch)
	if plist.size() >= 1:
		var slot_a: Dictionary = main.media_panel._air_slot("air_test", plist)
		var slot_b: Dictionary = main.media_panel._air_slot("air_test", plist)
		_check("AIR CLOCK is deterministic (same clock -> same slot)",
			int(slot_a["idx"]) == int(slot_b["idx"]) and absf(float(slot_a["offset"]) - float(slot_b["offset"])) < 0.01)
		var day0: float = float(main.daynight.day)
		var hour0: float = float(main.daynight.hour)
		main.daynight.day += 3
		main.daynight.hour += 0.21 # +3d0.21h — never a clean multiple of a clip's runtime
		var slot_c: Dictionary = main.media_panel._air_slot("air_test", plist)
		main.daynight.day = day0
		main.daynight.hour = hour0
		# The law itself: the broadcast advanced by EXACTLY the elapsed air time
		# (mod the cycle) — one game hour = 60s of air. (A same-slot alias with a
		# short cycle is legal; the arithmetic still has to line up.)
		var reg2: RefCounted = main.media_registry
		var cycle := 0.0
		for id2 in plist:
			cycle += maxf(10.0, float(reg2.get_media(String(id2)).get("runtime_seconds", 60.0)))
		var air_delta := (3.0 * 24.0 + 0.21) * 60.0
		var arc_a := 0.0
		for i2 in int(slot_a["idx"]):
			arc_a += maxf(10.0, float(reg2.get_media(String(plist[i2])).get("runtime_seconds", 60.0)))
		arc_a += float(slot_a["offset"])
		var arc_c := 0.0
		for i3 in int(slot_c["idx"]):
			arc_c += maxf(10.0, float(reg2.get_media(String(plist[i3])).get("runtime_seconds", 60.0)))
		arc_c += float(slot_c["offset"])
		var expect := fmod(arc_a + air_delta, cycle)
		_check("...and the broadcast MOVED ON by exactly the elapsed air time (%.1fs vs %.1fs expected)" % [arc_c, expect],
			absf(arc_c - expect) < 0.1)

	# --- The save REMEMBERS the shelf -------------------------------------------
	var snap: Dictionary = main.save_game()
	main.media_watched.clear()
	main.apply_save(snap)
	_check("watched PERSISTS through save/load", main.media_watched.has("test_pattern"))

	# --- E reopens FULLSCREEN; E again = THE COUCH (panel away, feet back) -------
	# apply_save restores the player off the set + clears _current_interactable; re-stage
	# at the screen and settle so E re-finds the TV (mirrors the opening approach — the
	# interactable is a per-frame proximity read, not saved).
	main.player.global_position = main.SAFEHOUSE + Vector3(-3.0, 0.35, -1.4)
	main.player.velocity = Vector3.ZERO
	for _i in 10:
		await get_tree().physics_frame
	await _e()
	_check("E at the set reopens FULLSCREEN", main.media_panel.is_open)
	await _e()
	_check("E again lands on the couch (panel away — ✕ is the only OFF switch)",
		not main.media_panel.is_open)
	_check("the feet come back", not p.input_locked)
	main.media_panel.power_off()

	print("TV RESULTS: %d passed, %d failed" % [passed, failed])
	print("TV: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
