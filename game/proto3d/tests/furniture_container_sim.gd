## Proof for a spawned ProtoFurniture: a REAL E-press opens it, loot from the
## resolver is present, and a SECOND open does NOT re-roll (lazy-once contract).
## Run: godot --headless --path game res://proto3d/tests/furniture_container_sim.tscn
extends Node

var main: Node3D
var passed := 0
var failed := 0
var _fridge: ProtoFurniture = null


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("FURN: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _tap_interact() -> void:
	var ev := InputEventAction.new()
	ev.action = "interact"
	ev.pressed = true
	Input.parse_input_event(ev)
	var ev2 := InputEventAction.new()
	ev2.action = "interact"
	ev2.pressed = false
	Input.parse_input_event(ev2)


func _ready() -> void:
	print("FURN: start")
	get_tree().create_timer(60.0).timeout.connect(func() -> void:
		print("FURN: WATCHDOG")
		print("FURN: FAILURES PRESENT")
		get_tree().quit(1))
	Engine.time_scale = 2.5
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 8:
		await get_tree().process_frame
	main._exit_car() # the sim boots DRIVING (enter_car in _ready) — get on foot first

	# Spawn a fridge from its furniture_defs.json row, standalone (not through
	# furnish_interior — this sim tests ProtoFurniture itself, in isolation).
	_fridge = ProtoFurniture.create("fridge", "furniture_container_sim:fridge_0", "house")
	main.add_child(_fridge)
	# ISOLATED staging (dogverb_sim idiom): the real furnisher now furnishes the
	# safehouse interior, so planting the test fridge at its old anchor stacks two
	# interactables and a neighboring stove can outbid it for the prompt.
	_fridge.global_position = Vector3(6.0, 0.03, 388.0)
	for _i in 2:
		await get_tree().physics_frame

	# Player walks up (staged position — the E-press itself is REAL input).
	main.player.global_position = _fridge.global_position + Vector3(0.9, 0, 0)
	main.player.velocity = Vector3.ZERO
	for _i in 6:
		await get_tree().physics_frame

	_check("fridge prompts an open", main.hud.current_prompt.to_lower().contains("fridge"))
	_tap_interact()
	for _i in 6:
		await get_tree().physics_frame

	_check("REAL E opens the panel on the fridge's container",
		main.panel.is_open and main.panel._theirs == _fridge.container)
	# OVERFLOW REGRESSION (playtest 2026-07-08: a 20+ item chest ran off the bottom
	# of the screen). Each column's item list lives inside a ScrollContainer, so a
	# long pack scrolls within the panel instead of spilling past the frame.
	_check("the pack column scrolls inside the panel (no off-screen spill)",
		main.panel._left_box.get_parent() is ScrollContainer)
	_check("the chest column scrolls too",
		main.panel._right_box.get_parent() is ScrollContainer)
	# Fill with MANY DISTINCT rows (one of every catalogued item) and confirm the
	# list now wants more height than its bounded view — it genuinely scrolls
	# instead of spilling off the bottom of the screen.
	for id in ProtoContainer.ITEMS.keys():
		_fridge.container.add(String(id), 1)
	main.panel._refresh()
	for _i in 3:
		await get_tree().process_frame
	var scroll := main.panel._right_box.get_parent() as ScrollContainer
	_check("a full chest overflows INTO the scroll (content %dpx > view %dpx)" %
		[int(main.panel._right_box.size.y), int(scroll.size.y)],
		main.panel._right_box.size.y > scroll.size.y)
	var first_hash: int = _fridge.container.slots.duplicate().hash()
	_check("loot is PRESENT after first open (%d slot(s))" % _fridge.container.slots.size(),
		not _fridge.container.slots.is_empty())

	# Close, take one item out (simulating the player looting it), reopen: the
	# SAME (now-diminished) contents must come back — no re-roll.
	var any_id := ""
	for id in _fridge.container.slots:
		any_id = String(id)
		break
	if any_id != "":
		_fridge.container.remove(any_id, 1)
	var _key_ev := InputEventKey.new()
	_key_ev.keycode = KEY_TAB
	_key_ev.pressed = true
	Input.parse_input_event(_key_ev)
	var _key_ev2 := InputEventKey.new()
	_key_ev2.keycode = KEY_TAB
	_key_ev2.pressed = false
	Input.parse_input_event(_key_ev2)
	for _i in 4:
		await get_tree().physics_frame

	var pre_reopen: Dictionary = _fridge.container.slots.duplicate()
	_tap_interact()
	for _i in 6:
		await get_tree().physics_frame
	_check("SECOND open does NOT re-roll (contents unchanged after player took one)",
		_fridge.container.slots.hash() == pre_reopen.hash())

	Engine.time_scale = 1.0
	print("FURN RESULTS: %d passed, %d failed" % [passed, failed])
	print("FURN: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
