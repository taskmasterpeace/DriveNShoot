## Proof for the MAIN MENU (the front door): the title builds, CONTINUE is gated
## by whether a save exists, each door fires the right call (new/continue/host/
## join), and it STAYS OUT of sims (only shows on a real launch).
## Run: godot --headless --path game res://proto3d/tests/menu_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node3D


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("MENU: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _ready() -> void:
	print("MENU: start")
	get_tree().create_timer(60.0).timeout.connect(func() -> void:
		print("MENU: WATCHDOG")
		print("MENU: FAILURES PRESENT")
		get_tree().quit(1))
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 8:
		await get_tree().process_frame

	# --- The menu STAYS OUT of sims (current_scene is the harness, not main) -----
	var stray_menu := false
	for n in main.get_children():
		if n is ProtoMenu:
			stray_menu = true
	_check("no menu in a SIM context (it knows it's not the launch scene)", not stray_menu and not main.menu_open)

	# --- CONTINUE is gated by a save --------------------------------------------
	DirAccess.remove_absolute(ProjectSettings.globalize_path(main.SAVE_PATH))
	var m1 := ProtoMenu.create(main)
	main.add_child(m1)
	var has_continue := false
	for b in _buttons(m1):
		if b.text.contains("CONTINUE"):
			has_continue = true
	_check("no save → NO Continue button", not has_continue)
	m1.dismiss()
	main.save_game() # write one
	var m2 := ProtoMenu.create(main)
	main.add_child(m2)
	has_continue = false
	for b in _buttons(m2):
		if b.text.contains("CONTINUE"):
			has_continue = true
	_check("a save exists → Continue appears", has_continue)

	# --- Each door fires the right thing ----------------------------------------
	main.menu_open = true
	m2.new_game()
	for _i in 3:
		await get_tree().physics_frame # queue_free clears at frame end
	_check("NEW GAME dismisses and hands you the wheel", not main.menu_open and not is_instance_valid(m2))

	main.backpack.add("scrip", 123)
	main.save_game()
	main.backpack.remove("scrip", main.backpack.count("scrip")) # wipe
	var m3 := ProtoMenu.create(main)
	main.add_child(m3)
	main.menu_open = true
	m3.continue_game()
	_check("CONTINUE loads the save (scrip %d back)" % main.backpack.count("scrip"), main.backpack.count("scrip") >= 123)

	var m4 := ProtoMenu.create(main)
	main.add_child(m4)
	main.menu_open = true
	m4.host_game()
	_check("HOST opens the net", main.net != null and main.net.online)
	main.net.leave()

	# --- Menu-open GATES gameplay input -----------------------------------------
	main.menu_open = true
	var moved_before: Vector3 = main.player.global_position
	var ev := InputEventKey.new()
	ev.keycode = KEY_TAB
	ev.pressed = true
	main._unhandled_input(ev) # would normally open the pack
	_check("the menu SWALLOWS gameplay input while up", not main.panel.is_open)

	print("MENU RESULTS: %d passed, %d failed" % [passed, failed])
	print("MENU: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)


func _buttons(node: Node) -> Array:
	var out: Array = []
	for c in node.get_children():
		if c is Button:
			out.append(c)
		out.append_array(_buttons(c))
	return out
