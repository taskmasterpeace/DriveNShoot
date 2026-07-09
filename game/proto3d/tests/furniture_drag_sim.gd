## Proof for the FURNITURE DRAG prototype (2026-07-08): the TV joins the "furniture"
## group and rides the SAME hold-E grab-drag chests/bodies use — tap E to watch it,
## HOLD E to grab and reposition it, E again to set it down — and its new spot persists
## through save/load. Real key events (the iron rule), the real interact chain.
## Run: godot --headless --path game res://proto3d/tests/furniture_drag_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node3D


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("FURNDRAG: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _e(down: bool) -> void:
	var ev := InputEventKey.new()
	ev.keycode = KEY_E
	ev.physical_keycode = KEY_E
	ev.pressed = down
	Input.parse_input_event(ev)
	await get_tree().physics_frame


func _ready() -> void:
	print("FURNDRAG: start")
	get_tree().create_timer(75.0).timeout.connect(func() -> void:
		print("FURNDRAG: WATCHDOG"); print("FURNDRAG: FAILURES PRESENT"); get_tree().quit(1))
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 8:
		await get_tree().process_frame

	main._exit_car()
	var p: ProtoPlayer3D = main.player
	p.global_position = main.SAFEHOUSE + Vector3(-3.0, 0.35, -1.4) # right at the set (tv_sim's spot)
	p.velocity = Vector3.ZERO
	for _i in 8:
		await get_tree().physics_frame

	var tv: ProtoTV = main.media_panel.tv_set
	_check("the TV is in the 'furniture' group", tv.is_in_group("furniture"))
	_check("the TV carries a furniture_id for the save", tv.has_meta("furniture_id"))
	_check("the TV is the current interactable (standing at the set)", main._current_interactable is ProtoTV)
	# THE SYSTEM GENERALIZES — all house furniture is movable, not just the TV.
	var fids := {}
	for f in get_tree().get_nodes_in_group("furniture"):
		if f.has_meta("furniture_id"):
			fids[String(f.get_meta("furniture_id"))] = true
	_check("all house furniture joins the group (have: %s)" % str(fids.keys()),
		fids.has("tv") and fids.has("bookshelf") and fids.has("drone_dock"))
	# THE DEFAULT FACING was fixed off the corner (the "wrong side"): it faces the room now.
	_check("the TV's default faces the room, not the old corner (yaw %.2f != 0.7)" % tv.rotation.y,
		absf(tv.rotation.y - 0.7) > 0.05)
	var start_pos: Vector3 = tv.global_position

	# --- HOLD E = grab (not a tap → not the watch panel) ------------------------
	await _e(true) # press and HOLD (don't release until the grab lands)
	for _i in 30: # past the 0.35s hold threshold (_update_drag arms _dragging)
		await get_tree().physics_frame
	_check("HOLD E grabs the TV (dragging), not the watch panel", main._dragging == tv and not main.media_panel.is_open)
	await _e(false) # release the key — the haul continues until you E to drop

	# --- Walk it to a new corner; the set trails you ---------------------------
	p.global_position = main.SAFEHOUSE + Vector3(1.5, 0.35, 1.5)
	for _i in 30:
		await get_tree().physics_frame
	var moved: float = tv.global_position.distance_to(start_pos)
	_check("the TV FOLLOWS you as you move (%.2fm from where it was)" % moved, moved > 1.0)
	_check("...and it stays on the floor while hauled (y %.2f ~= start %.2f)" % [tv.global_position.y, start_pos.y],
		absf(tv.global_position.y - start_pos.y) < 0.05)

	# --- ROTATE it with the wheel (owner: "they gotta be rotated") --------------
	var yaw0: float = tv.rotation.y
	main._rotate_dragged(1.0)
	main._rotate_dragged(1.0)
	_check("the wheel ROTATES the held TV (%.2f -> %.2f, ~2×15°)" % [yaw0, tv.rotation.y],
		absf(wrapf(tv.rotation.y - yaw0, -PI, PI) - 2.0 * main.FURN_ROTATE_STEP) < 0.01)

	# --- E again = set it down; it stays put ------------------------------------
	await _e(true)
	await _e(false)
	_check("E sets the TV down (no longer dragging)", main._dragging == null)
	var dropped_pos: Vector3 = tv.global_position
	var dropped_yaw: float = tv.rotation.y
	for _i in 20:
		await get_tree().physics_frame
	_check("the dropped TV STAYS where you left it (%.2fm drift)" % tv.global_position.distance_to(dropped_pos),
		tv.global_position.distance_to(dropped_pos) < 0.15)

	# --- It PERSISTS: save records the new spot, load restores it ---------------
	var data: Dictionary = main.save_game()
	_check("the save records the moved furniture", (data.get("furniture", {}) as Dictionary).has("tv"))
	var rec: Array = (data["furniture"] as Dictionary)["tv"]
	_check("...at the dropped position (save %.2f,%.2f,%.2f)" % [float(rec[0]), float(rec[1]), float(rec[2])],
		Vector3(float(rec[0]), float(rec[1]), float(rec[2])).distance_to(dropped_pos) < 0.05)
	# Shove the TV somewhere wrong, then load — it must snap back to the saved spot.
	tv.global_position = main.SAFEHOUSE + Vector3(-8, 0, -8)
	main.apply_save(data)
	for _i in 4:
		await get_tree().physics_frame
	_check("LOAD restores the TV to its saved corner (%.2fm off)" % tv.global_position.distance_to(dropped_pos),
		tv.global_position.distance_to(dropped_pos) < 0.05)
	_check("...and its ROTATION too (yaw %.2f ~= dropped %.2f)" % [tv.rotation.y, dropped_yaw],
		absf(wrapf(tv.rotation.y - dropped_yaw, -PI, PI)) < 0.02)

	print("FURNDRAG RESULTS: %d passed, %d failed" % [passed, failed])
	print("FURNDRAG: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
