## ONE-WIRE shell proof: WASTE HEAP launches only through ProtoGameDeck, renders
## one always-live texture to device/fullscreen, consumes real semantic input,
## exposes live HELP/ABOUT, and obeys play-vs-menu close semantics.
## Run: Godot --headless --path game res://proto3d/tests/game_shell_sim.tscn
extends Node

var passed := 0
var failed := 0


func _check(label: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("GAME_SHELL: %s - %s" % ["PASS" if ok else "FAIL", label])


func _ready() -> void:
	print("GAME_SHELL: start")
	get_tree().create_timer(40.0).timeout.connect(func() -> void:
		print("GAME_SHELL: WATCHDOG")
		get_tree().quit(1))
	var deck_script: GDScript = load("res://proto3d/games/game_deck.gd") as GDScript
	var shell_script: GDScript = load("res://proto3d/games/game_shell.gd") as GDScript
	_check("deck and shell implementations exist", deck_script != null and shell_script != null)
	if deck_script == null or shell_script == null:
		_finish()
		return

	var time_scale_before := Engine.time_scale
	var deck: Node = deck_script.create()
	add_child(deck)
	var shell: CanvasLayer = shell_script.create(deck)
	add_child(shell)
	shell.open_library("handheld")
	await get_tree().process_frame
	_check("library opens inside the heavy shell", shell.is_open and shell.current_view == "library")
	var shell_rect: Rect2 = shell._root.get_global_rect()
	var view_rect: Rect2 = get_viewport().get_visible_rect()
	_check("the bezel stays fully inside the rendered frame", shell_rect.position.x >= 0.0
		and shell_rect.position.y >= 0.0 and shell_rect.end.x <= view_rect.end.x
		and shell_rect.end.y <= view_rect.end.y)
	_check("library buttons are keyboard/pad focusable", shell.first_library_button != null
		and shell.first_library_button.focus_mode == Control.FOCUS_ALL)

	_check("WASTE HEAP launches through the deck", shell.open_game("waste_heap", {"source": "solo"}))
	deck.start(77, [{"seat": 0, "device": -1, "profile_id": "local", "name": "RIDER"}])
	_check("the cartridge is a child of one always-live viewport", deck.cartridge != null
		and deck.cartridge.get_parent() == deck.viewport
		and deck.viewport.render_target_update_mode == SubViewport.UPDATE_ALWAYS)
	_check("fullscreen and physical consumers share the exact texture", shell.screen_texture() == deck.texture())

	deck.cartridge.restore_snapshot({
		"board": [[2, 2, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
		"score": 0, "highest_part": 2, "rng_state": 77, "tick": 0,
	})
	var left := InputEventKey.new()
	left.physical_keycode = KEY_A
	left.keycode = KEY_A
	left.pressed = true
	shell.handle_event(left)
	deck.process_tick()
	_check("real key input reaches cartridge semantics", deck.cartridge.board[0][0] == 4)

	shell.show_view("help")
	_check("HELP combines objective and live bindings", shell.current_text.contains("Slide every salvage part")
		and shell.current_text.contains("Arcade move left"))
	shell.show_view("about")
	_check("ABOUT separates lore from real source/license", shell.current_text.contains("IN THE WORLD")
		and shell.current_text.contains("REAL SOURCE & LICENSE") and shell.current_text.contains("LittleJS Arcade")
		and shell.current_text.contains("Adapted/used:") and shell.current_text.contains("Excluded:")
		and shell.current_text.contains("License: res://third_party/licenses/"))

	shell.show_view("play")
	var stance := InputEventJoypadButton.new()
	stance.device = 1
	stance.button_index = JOY_BUTTON_B
	stance.pressed = true
	deck.input_router.assign_device(0, 1)
	shell.handle_event(stance)
	var stance_snapshot: Dictionary = deck.input_router.snapshot_for_seat(0)
	_check("active-play pad B reaches cartridge input and does not close", shell.is_open
		and bool((stance_snapshot["pressed"] as Dictionary).get("stance", false)))

	var escape := InputEventKey.new()
	escape.physical_keycode = KEY_ESCAPE
	escape.keycode = KEY_ESCAPE
	escape.pressed = true
	shell.handle_event(escape)
	_check("Esc pauses into shell state without touching world time", deck.state == "PAUSED"
		and shell.current_view == "pause" and Engine.time_scale == time_scale_before)

	var close_b := InputEventJoypadButton.new()
	close_b.device = 1
	close_b.button_index = JOY_BUTTON_B
	close_b.pressed = true
	shell.handle_event(close_b)
	_check("menu-state pad B closes fullscreen to the device", not shell.is_open)
	_check("closing fullscreen keeps the cartridge alive", deck.cartridge != null and deck.state == "PAUSED")

	shell.open_game("waste_heap", {"source": "solo"})
	deck.start(88, [{"seat": 0, "device": -1, "profile_id": "local"}])
	shell.power_off()
	_check("power off destroys the active cartridge", deck.cartridge == null and deck.state == "OFF")
	_check("a missing future cartridge is isolated as an error", not deck.launch("dial_tanks", {})
		and deck.state == "ERROR" and deck.error_text.contains("CARTRIDGE"))
	_check("CROWN OF ASH launches into read-only spectator state",
		deck.launch("crown_of_ash", {"source": "session", "spectator": true})
		and deck.start(90, []) and deck.state == "SPECTATING")
	_check("spectator receives authoritative board snapshots", deck.apply_network_snapshot({
		"board": [["", "", "", "", "", "", "", "bK"], ["", "", "", "", "", "", "", ""],
			["", "", "", "", "", "", "", ""], ["", "", "", "", "", "", "", ""],
			["", "", "", "", "", "", "", ""], ["", "", "", "", "", "", "", ""],
			["", "", "", "", "wP", "", "", ""], ["", "", "", "", "wK", "", "", ""]],
		"side_to_move": "w", "castling": "", "en_passant": [-1, -1], "halfmove": 0,
		"fullmove": 1, "repetition": {}, "game_status": "playing", "cursor": [4, 6],
		"selected": [-1, -1], "seed": 90, "seats": [], "tick": 4, "active": true,
		"paused": false, "finished": false, "session_id": "spectator-proof",
	}) and deck.cartridge.piece_at(Vector2i(4, 6)) == "wP")
	_check("shell lifecycle never pauses DRIVN", Engine.time_scale == time_scale_before)
	_finish()


func _finish() -> void:
	print("GAME_SHELL RESULTS: %d passed, %d failed" % [passed, failed])
	print("GAME_SHELL: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
