extends Node
## Catches missing close/input ownership, overlapping wound art and inaccessible
## scroll content. All activation/close/navigation uses real input dispatch.
## Position and wound fixtures belong only to the isolated test profile.
var main: Node3D
var passed: int = 0
var failed: int = 0
var output: String = ""
var captures: Array[Dictionary] = []

func check(label: String, ok: bool) -> void:
	passed += int(ok)
	failed += int(not ok)
	print("CHARACTER SHEET: %s %s" % ["PASS" if ok else "FAIL", label])

func frames(count: int = 5) -> void:
	for i: int in count:
		await get_tree().physics_frame

func key(code: Key) -> void:
	for down: bool in [true, false]:
		var event := InputEventKey.new()
		event.keycode = code
		event.physical_keycode = code
		event.pressed = down
		Input.parse_input_event(event)
		await frames()

func key_state(code: Key, down: bool, shift: bool = false) -> void:
	var event := InputEventKey.new()
	event.keycode = code
	event.physical_keycode = code
	event.pressed = down
	event.shift_pressed = shift
	Input.parse_input_event(event)
	await frames(2)

func axis_state(value: float) -> void:
	var event := InputEventJoypadMotion.new()
	event.axis = JOY_AXIS_RIGHT_X
	event.axis_value = value
	Input.parse_input_event(event)
	await frames(3)

func pad(code: JoyButton) -> void:
	for down: bool in [true, false]:
		var event := InputEventJoypadButton.new()
		event.button_index = code
		event.pressed = down
		Input.parse_input_event(event)
		await frames()

func pointer(at: Vector2, code: MouseButton = MOUSE_BUTTON_LEFT) -> void:
	at = get_viewport().get_final_transform() * at
	var motion := InputEventMouseMotion.new()
	motion.position = at
	Input.parse_input_event(motion)
	await frames()
	for down: bool in [true, false]:
		var event := InputEventMouseButton.new()
		event.position = at
		event.button_index = code
		event.pressed = down
		Input.parse_input_event(event)
		await frames()

func close_fixture() -> void:
	# Cleanup after RED, not an asserted close path.
	if main.hud.sheet_open():
		main.hud.toggle_sheet("")

func closer() -> Button:
	for node: Node in main.hud._sheet_panel.find_children("*", "Button", true, false):
		if (node as Button).text == "✕":
			return node as Button
	return null

func scroll() -> ScrollContainer:
	return main.hud._sheet_panel.find_children("*", "ScrollContainer", true, false)[0] as ScrollContainer

func capture(id: String) -> void:
	if output.is_empty():
		return
	await frames(8)
	await RenderingServer.frame_post_draw
	var picture: Image = get_viewport().get_texture().get_image()
	check(id + " captures a real rendered frame", picture != null and not picture.is_empty())
	var error: Error = picture.save_png(output.path_join(id + ".png")) if picture != null else ERR_INVALID_DATA
	check(id + " original PNG saved", error == OK)
	captures.append({"id": id, "saved": error == OK, "pixels": str(picture.get_size()) if picture != null else "none",
		"logical_viewport": str(get_viewport().get_visible_rect().size), "note": "Actual game/HUD; isolated fixture, no image edits. Wound is staged; controls use real input."})

func _ready() -> void:
	var profile: String = OS.get_user_data_dir().replace("\\", "/").simplify_path().to_lower()
	var owned: String = ProjectSettings.globalize_path("res://../build/").replace("\\", "/").simplify_path().to_lower().trim_suffix("/") + "/"
	if not profile.begins_with(owned):
		print("CHARACTER SHEET: REFUSED non-build profile")
		get_tree().quit(2)
		return
	for argument: String in OS.get_cmdline_user_args():
		if argument.begins_with("--output="):
			output = argument.trim_prefix("--output=").replace("\\", "/").simplify_path()
	if not output.is_empty():
		if not output.to_lower().begins_with(owned) or DisplayServer.get_name() == "headless" or DirAccess.make_dir_recursive_absolute(output) != OK:
			get_tree().quit(2)
			return
	get_tree().create_timer(110).timeout.connect(func() -> void: get_tree().quit(2))
	main = load("res://proto3d/proto3d.tscn").instantiate()
	add_child(main)
	await frames(20)
	if not output.is_empty():
		get_window().size = Vector2i(1280,720)
		await frames(12)
	await key(KEY_K)
	check("stock K opens the real sheet", main.hud.sheet_open())
	var root: Control = main.hud._sheet_panel
	var button := closer()
	check("visible close control sits in the header's right edge", button != null and button.is_visible_in_tree() and button.get_global_rect().get_center().x > root.get_global_rect().get_center().x and button.global_position.y < root.global_position.y + 90)
	var focus: Control = get_viewport().gui_get_focus_owner()
	check("opening assigns actionable controller focus inside sheet", focus is Button and root.is_ancestor_of(focus))
	check("wound diagram never overlaps the readable scroll column", not main.hud._body_doll.get_global_rect().intersects(scroll().get_global_rect()))
	var presentation: CanvasLayer = root.get_canvas_layer_node()
	check("dossier is above the road objective HUD", presentation != null and presentation.layer > main.road_life.objective.get_canvas_layer_node().layer)
	await capture("01_dossier")
	check("sheet owns the held vehicle controls", main.active_car.player_input_blocked)
	Input.action_press("move_up")
	Input.action_press("move_right")
	await frames(12)
	check("held pedals and steering stay neutral", main.active_car.input_throttle == 0 and main.active_car.input_steer == 0)
	Input.action_release("move_up")
	Input.action_release("move_right")
	await key(KEY_E)
	check("interact cannot exit the vehicle behind sheet", main.mode == main.Mode.DRIVE)
	await key(KEY_TAB)
	check("pack cannot open underneath sheet", not main.panel.is_open)
	if main.panel.is_open:
		main.panel.close()
	await key(KEY_ESCAPE)
	check("raw Escape closes the sheet", not main.hud.sheet_open())
	close_fixture()
	await key(KEY_K)
	await pad(JOY_BUTTON_B)
	check("raw pad B closes the sheet", not main.hud.sheet_open())
	close_fixture()
	await key(KEY_K)
	button = closer()
	if button != null:
		await pointer(button.get_global_rect().get_center())
	check("real pointer hit closes the sheet", not main.hud.sheet_open())
	close_fixture()
	await key(KEY_K)
	await pad(JOY_BUTTON_A)
	check("pad A activates the initially focused close control", not main.hud.sheet_open())
	close_fixture()
	await key(KEY_K)
	await key(KEY_PAGEDOWN)
	check("Page Down reveals more sheet content", scroll().scroll_vertical > 0)
	var previous: int = scroll().scroll_vertical
	await pad(JOY_BUTTON_DPAD_DOWN)
	check("D-pad Down scrolls without requiring a mouse", scroll().scroll_vertical > previous)
	previous = scroll().scroll_vertical
	await pointer(scroll().get_global_rect().get_center(), MOUSE_BUTTON_WHEEL_DOWN)
	check("mouse wheel advances content", scroll().scroll_vertical > previous)
	await key(KEY_END)
	var bar: VScrollBar = scroll().get_v_scroll_bar()
	check("End reaches the last world-system record", absf(bar.value - (bar.max_value - bar.page)) < 2 and main.hud._sheet_label.text.contains("THE CAROUSEL"))
	await capture("02_world_records")
	await key(KEY_K)
	check("repeated stock K closes the sheet", not main.hud.sheet_open())
	close_fixture()
	if main.mode == main.Mode.DRIVE:
		await key(KEY_E)
	check("foot fixture begins with no unrelated modal gate", not main._gameplay_input_blocked())
	main.player.global_position = Vector3(110, 0.6, -316)
	main.player.velocity = Vector3.ZERO
	await frames(15)
	main.cam_rig.snap_to_target()
	await key(KEY_K)
	var start: Vector3 = main.player.global_position
	Input.action_press("move_right")
	await frames(20)
	Input.action_release("move_right")
	check("held movement cannot walk while reading", Vector2(main.player.global_position.x - start.x, main.player.global_position.z - start.z).length() < 0.15)
	check("foot input is locked by the same modal gate", main.player.input_locked)
	check("close-gesture fixture is actually grounded", main.player.is_on_floor())
	var back := InputEventJoypadButton.new()
	back.button_index = JOY_BUTTON_B
	back.pressed = true
	Input.parse_input_event(back)
	await frames()
	check("B closes immediately without crouching on the same held press", not main.hud.sheet_open() and not main.player.crouching)
	back = InputEventJoypadButton.new()
	back.button_index = JOY_BUTTON_B
	back.pressed = false
	Input.parse_input_event(back)
	await frames()
	check("B release leaves gameplay available", not main._gameplay_input_blocked())
	await key(KEY_TAB)
	check("real pack opens for modal ownership fixture", main.panel.is_open)
	await key(KEY_K)
	check("sheet cannot stack over another modal", not main.hud.sheet_open() and main.panel.is_open)
	close_fixture()
	main.panel.close()
	await key(KEY_K)
	await key(KEY_K)
	var arm: Damageable = main.character.body["l_arm"]
	arm.hp = arm.max_hp * 0.5
	main.character.hp = minf(main.character.hp, main.character.hp_cap())
	await key(KEY_K)
	check("reopening refreshes actual staged wound data", main.hud._body_doll.tier_of("l_arm") == 1 and main.hud._sheet_label.text.contains("WORN"))
	await capture("03_wounded")
	for part: String in ProtoCharacter.PART_NAMES:
		var damage: Damageable = main.character.body[part]
		damage.hp = damage.max_hp * 0.5
	main.character.hp = minf(main.character.hp, main.character.hp_cap())
	await key(KEY_K)
	await key(KEY_K)
	for size: Vector2i in [Vector2i(1280,800), Vector2i(960,540)]:
		get_window().content_scale_size = size
		if not output.is_empty():
			get_window().size = size
		await frames(15)
		check(str(size) + " open sheet resizes inside viewport gutters", get_viewport().get_visible_rect().grow(-30).encloses(root.get_global_rect()))
		check(str(size) + " close remains visible within panel", closer() != null and root.get_global_rect().encloses(closer().get_global_rect()))
		check(str(size) + " wound diagram remains separate from text", not main.hud._body_doll.get_global_rect().intersects(scroll().get_global_rect()))
		check(str(size) + " text has no horizontal overflow", main.hud._sheet_label.size.x <= scroll().size.x and scroll().get_h_scroll_bar().value == 0)
		var condition: Label = main.hud.get("_sheet_condition") as Label
		check(str(size) + " six wounded parts do not spill into footer", condition != null and condition.get_global_rect().end.y <= root.get_global_rect().end.y - 88)
		await capture("04_compact_%dx%d" % [size.x,size.y])
		await key(KEY_END)
		bar = scroll().get_v_scroll_bar()
		check(str(size) + " final content remains reachable", absf(bar.value - (bar.max_value - bar.page)) < 2)
	await key(KEY_ESCAPE)
	await frames()
	check("closing releases the player's input gate", not main.player.input_locked)
	start = main.player.global_position
	Input.action_press("move_right")
	await frames(20)
	Input.action_release("move_right")
	check("actual movement resumes after closing", Vector2(main.player.global_position.x - start.x, main.player.global_position.z - start.z).length() > 0.3)
	await key(KEY_K)
	main.hud.show_death("DOWNED — regression fixture")
	check("death presentation dismisses an open dossier", not main.hud.sheet_open())
	# A detached controller cannot strand the modal-release guard forever.
	main.hud.toggle_sheet(main._sheet_text(), main._body_tiers())
	back = InputEventJoypadButton.new()
	back.button_index = JOY_BUTTON_B
	back.pressed = true
	Input.parse_input_event(back)
	await frames()
	Input.joy_connection_changed.emit(0, false)
	check("controller disconnect clears a lost closing release", not main.hud.sheet_blocks_input())
	back = InputEventJoypadButton.new()
	back.button_index = JOY_BUTTON_B
	back.pressed = false
	Input.parse_input_event(back)
	await transition_checks()
	if not output.is_empty():
		var file := FileAccess.open(output.path_join("manifest.json"), FileAccess.WRITE)
		check("manifest opens", file != null)
		if file != null:
			file.store_string(JSON.stringify({"captures": captures, "passed": passed, "failed": failed}, "\t"))
	main.queue_free()
	main = null
	await frames(8)
	print("CHARACTER SHEET RESULTS: %d passed, %d failed" % [passed,failed])
	get_tree().quit(0 if failed == 0 else 1)

func transition_checks() -> void:
	# Gesture started in the world, then K: opening must cancel intent, not
	# dispatch a tap or allow the delayed hold timer to fire behind the sheet.
	close_fixture()
	main.equipped = -1 # Valid empty-hand fixture, not a fake weapon.
	main.player.stamina = main.player.max_stamina
	var click := InputEventMouseButton.new()
	click.button_index = MOUSE_BUTTON_LEFT
	click.pressed = true
	Input.parse_input_event(click)
	await get_tree().process_frame # Hardware dispatch is a process pass, not a physics tick.
	await frames(2)
	print("CHARACTER SHEET gesture precondition: fist=%s fire=%s blocked=%s mode=%s" % [main._fist_pressed,main._fire_down,main._gameplay_input_blocked(),main.mode])
	check("real empty-hand press arms a world gesture", main._fist_pressed and main._fire_down)
	await key(KEY_K)
	click = InputEventMouseButton.new()
	click.button_index = MOUSE_BUTTON_LEFT
	click.pressed = false
	Input.parse_input_event(click)
	var biggest_cooldown: float = 0
	for i: int in 40:
		await frames(1)
		biggest_cooldown = maxf(biggest_cooldown, main.palm._cd)
	check("opening K cancels a pending shove without firing it", biggest_cooldown == 0 and not main._fist_pressed)
	check("fire release behind K cannot strand the next attack", not main._fire_down)
	await key(KEY_K)
	await pointer(Vector2(500, 200))
	check("next ordinary click still punches after closing", main.fists._cd > 0)
	await key_state(KEY_C, true)
	check("real whistle press begins its gesture", main._wh_down)
	await key(KEY_K)
	await key_state(KEY_C, false)
	await frames(45)
	check("opening K cancels pending whistle hold and tap batch", not main._wh_down and main._wh_taps == 0 and not main._wh_hold_fired)
	await key(KEY_K)
	await key(KEY_J)
	check("real J opens character creation", main.char_create.is_open)
	await key(KEY_K)
	check("K cannot stack over character creation", main.char_create.is_open and not main.hud.sheet_open())
	close_fixture()
	main.char_create.toggle() # RED cleanup; preserves the character choices.
	await key(KEY_K)
	await key_state(KEY_SHIFT, true, true)
	await key_state(KEY_K, true, true)
	await key_state(KEY_SHIFT, false)
	await key_state(KEY_K, false)
	check("releasing modifier first cannot strand close latch", not main.hud.sheet_blocks_input())
	main.hud.notification(NOTIFICATION_WM_WINDOW_FOCUS_OUT) # RED cleanup via real notification boundary.
	var binding := InputEventJoypadMotion.new()
	binding.axis = JOY_AXIS_RIGHT_X
	binding.axis_value = -1.0
	InputMap.action_add_event("drivn_sheet", binding) # Disposable extra supported axis binding.
	await key(KEY_K)
	await axis_state(-0.9)
	await axis_state(0.0)
	check("negative-axis close releases at neutral", not main.hud.sheet_blocks_input())
	main.hud.notification(NOTIFICATION_WM_WINDOW_FOCUS_OUT)
	await key(KEY_K)
	await axis_state(-0.9)
	Input.joy_connection_changed.emit(0, false)
	check("axis-controller disconnect also releases the modal latch", not main.hud.sheet_blocks_input())
	await axis_state(0.0)
	main.hud.notification(NOTIFICATION_WM_WINDOW_FOCUS_OUT)
	InputMap.action_erase_event("drivn_sheet", binding)
	close_fixture()
	main.character.take_wound("torso", 9999) # Actual death signal/presentation, not a boolean-only fixture.
	await frames()
	check("lethal wound reaches the real death state", main.character.dead)
	await key(KEY_K)
	check("K cannot reopen the dossier above death", not main.hud.sheet_open())
	close_fixture()
