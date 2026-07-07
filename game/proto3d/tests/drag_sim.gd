## Proof for GRAB & DRAG (MOVESET.txt): E on a chest/body is TAP-vs-HOLD —
## TAP opens it (the old law, untouched), HOLD grabs it and it TRAILS you (slow,
## heavy, teaches STRENGTH), E again sets it down and it STAYS. Real inputs
## (the "interact" action), a real corpse-style chest (solid=false).
## Run: godot --headless --path game res://proto3d/tests/drag_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node3D


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("DRAG: %s - %s" % ["PASS" if ok else "FAIL", check_name])


## E as the HARDWARE sends it (the "interact" action is bound to PHYSICAL E) —
## Input.action_press only feeds pollers, never the _unhandled_input event path.
func _e(down: bool) -> void:
	var ev := InputEventKey.new()
	ev.keycode = KEY_E
	ev.physical_keycode = KEY_E
	ev.pressed = down
	Input.parse_input_event(ev)


func _ready() -> void:
	print("DRAG: start")
	get_tree().create_timer(75.0).timeout.connect(func() -> void:
		print("DRAG: WATCHDOG"); print("DRAG: FAILURES PRESENT"); get_tree().quit(1))
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 8:
		await get_tree().process_frame

	main._exit_car()
	var p: ProtoPlayer3D = main.player
	p.global_position = Vector3(6, 0.35, 388)
	p.velocity = Vector3.ZERO
	for _i in 4:
		await get_tree().physics_frame

	# A body on the road (corpse chests are solid=false loot piles).
	var body := ProtoChest.create("Test body", {"scrap": 2}, false)
	main.add_child(body)
	body.global_position = p.global_position + p.facing() * 1.2
	var spawn := body.global_position
	for _i in 6:
		await get_tree().physics_frame
	_check("the body is the current interactable", main._current_interactable == body)

	# --- 1. TAP E = open (the old law, untouched) ------------------------------
	_e(true)
	for _i in 3:
		await get_tree().physics_frame
	_e(false)
	for _i in 3:
		await get_tree().physics_frame
	_check("TAP still OPENS the container", main.panel.is_open)
	main.panel.close()
	for _i in 3:
		await get_tree().physics_frame

	# --- 2. HOLD E = grab ------------------------------------------------------
	_e(true)
	for _i in 30:
		await get_tree().physics_frame # past the 0.35s grab beat
	_check("HOLD grabs it (dragging)", main._dragging == body)
	_e(false)
	for _i in 3:
		await get_tree().physics_frame
	_check("release does NOT drop it (E again does)", main._dragging == body)

	# --- 3. It trails you; you're slower; hauling teaches ----------------------
	var stren_xp: float = main.character.skills["strength"]["xp"]
	Input.action_press("move_up")
	for _i in 240:
		await get_tree().physics_frame # a real haul (~9 m at drag pace)
	Input.action_release("move_up")
	var walked := p.global_position.distance_to(Vector3(6, 0.35, 388))
	var trailed := body.global_position.distance_to(p.global_position)
	_check("you actually hauled it somewhere (%.1fm from spawn)" % body.global_position.distance_to(spawn),
		body.global_position.distance_to(spawn) > 2.0)
	_check("it TRAILS at arm's length (%.1fm)" % trailed, trailed < 2.4)
	_check("hauling is HEAVY (speed_mult %.2f)" % p.speed_mult, p.speed_mult < 0.7)
	_check("hauling teaches STRENGTH", main.character.skills["strength"]["xp"] > stren_xp)
	_check("you still covered ground (%.1fm)" % walked, walked > 3.0)

	# --- 4. E again = set it down, it STAYS ------------------------------------
	_e(true)
	for _i in 3:
		await get_tree().physics_frame
	_e(false)
	for _i in 3:
		await get_tree().physics_frame
	_check("E sets it down", main._dragging == null)
	var rest := body.global_position
	Input.action_press("move_up")
	for _i in 40:
		await get_tree().physics_frame
	Input.action_release("move_up")
	_check("dropped, it STAYS PUT", body.global_position.distance_to(rest) < 0.1)
	_check("speed restores after the drop (%.2f)" % p.speed_mult, p.speed_mult > 0.9)

	print("DRAG RESULTS: %d passed, %d failed" % [passed, failed])
	print("DRAG: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
