extends Node
## Regression for unreadable map labels, lost close affordances and controls
## reaching the world while planning. Real inputs; fresh owned profile only.
var main: Node3D
var passed: int = 0
var failed: int = 0
var output: String = ""
var captures: Array[Dictionary] = []

func check(label: String, ok: bool) -> void:
	passed += int(ok)
	failed += int(not ok)
	print("ATLAS READABILITY: %s %s" % ["PASS" if ok else "FAIL", label])

func frames(count: int = 5) -> void:
	# Rendered frames can batch several physics ticks. Observe actual hardware
	# dispatch before asserting UI state (the toolbar release trace proved this).
	await get_tree().process_frame
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

func pad(code: JoyButton) -> void:
	for down: bool in [true, false]:
		var event := InputEventJoypadButton.new()
		event.button_index = code
		event.pressed = down
		Input.parse_input_event(event)
		await frames()

func pad_state(code: JoyButton, down: bool) -> void:
	var event := InputEventJoypadButton.new()
	event.button_index = code
	event.pressed = down
	Input.parse_input_event(event)
	await frames()

func key_state(code: Key, down: bool) -> void:
	var event := InputEventKey.new()
	event.keycode = code
	event.physical_keycode = code
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

func cleanup_map() -> void:
	if main.stream.map_open():
		main.stream._on_gps_button("power") # RED cleanup, never an asserted close path.

func close_button() -> Button:
	for node: Node in main.stream._map_layer.find_children("*", "Button", true, false):
		if (node as Button).text == "✕":
			return node as Button
	return null

func capture(id: String) -> void:
	if output.is_empty():
		return
	await frames(8)
	await RenderingServer.frame_post_draw
	var picture: Image = get_viewport().get_texture().get_image()
	check(id + " is a rendered frame", picture != null and not picture.is_empty())
	var result: Error = picture.save_png(output.path_join(id + ".png")) if picture != null else ERR_INVALID_DATA
	check(id + " original PNG saved", result == OK)
	captures.append({"id": id, "saved": result == OK, "pixels": str(picture.get_size()),
		"logical_viewport": str(get_viewport().get_visible_rect().size), "skin": main.stream.device_skin,
		"mode": main.stream._map_mode, "note": "Actual game render; real map inputs; isolated fresh profile. No image edits or world-clock hold."})

func labels_fit() -> void:
	if output.is_empty():
		return # Headless does not draw text. Geometry assertions require real rendering.
	var valid: bool = "_map_label_layout" in main.stream
	var labels: Array = main.stream.get("_map_label_layout") if valid else []
	var canvas: Rect2 = Rect2(Vector2.ZERO, main.stream._map_canvas.size)
	var all_inside: bool = not labels.is_empty()
	var nonoverlap: bool = not labels.is_empty()
	for i: int in labels.size():
		var box: Rect2 = labels[i]["rect"]
		all_inside = all_inside and canvas.encloses(box)
		for j: int in range(i + 1, labels.size()):
			nonoverlap = nonoverlap and not box.intersects(labels[j]["rect"])
	check("drawn labels are completely inside the LCD", all_inside)
	check("drawn label boxes never overlap one another", nonoverlap)

func _ready() -> void:
	var profile: String = OS.get_user_data_dir().replace("\\", "/").simplify_path().to_lower()
	var owned: String = ProjectSettings.globalize_path("res://../build/").replace("\\", "/").simplify_path().to_lower().trim_suffix("/") + "/"
	if not profile.begins_with(owned):
		print("ATLAS READABILITY: REFUSED non-build profile")
		get_tree().quit(2)
		return
	for argument: String in OS.get_cmdline_user_args():
		if argument.begins_with("--output="):
			output = argument.trim_prefix("--output=").replace("\\", "/").simplify_path()
	if not output.is_empty() and (not output.to_lower().begins_with(owned) or DisplayServer.get_name() == "headless" or DirAccess.make_dir_recursive_absolute(output) != OK):
		get_tree().quit(2)
		return
	get_tree().create_timer(110).timeout.connect(func() -> void: get_tree().quit(2))
	main = load("res://proto3d/proto3d.tscn").instantiate()
	add_child(main)
	await frames(20)
	if not output.is_empty():
		get_window().size = Vector2i(1280,720)
		await frames(12)
	await key(KEY_M)
	check("M opens the live local map", main.stream.map_open() and main.stream._map_mode == 1)
	check("default route display uses most of the viewport width", main.stream._map_canvas.size.x >= get_viewport().get_visible_rect().size.x * 0.65)
	check("opening grants keyboard/controller focus to the map", get_viewport().gui_get_focus_owner() == main.stream._map_canvas)
	var button := close_button()
	check("a visible red close button is available", button != null and button.is_visible_in_tree())
	await capture("01_local")
	labels_fit()
	if not output.is_empty():
		var home: Rect2 = Rect2()
		for label: Dictionary in main.stream._map_label_layout:
			if label["text"] == "SAFEHOUSE":
				home = label["rect"]
		check("safehouse has a readable local label", home.has_area())
		if home.has_area():
			await pointer(main.stream._map_canvas.global_position + home.get_center())
			check("clicking local SAFEHOUSE selects its actual world position", main.waypoint_idx >= 0 and String(main.waypoints[main.waypoint_idx][0]).ends_with("SAFEHOUSE") and main.waypoints[main.waypoint_idx][1].distance_to(Vector3(110,0,-323)) < 1)
	await key(KEY_M)
	check("M advances to state", main.stream._map_mode == 2)
	await capture("02_virginia")
	labels_fit()
	await key(KEY_M)
	check("M advances to country", main.stream._map_mode == 3)
	await capture("03_divided_states")
	labels_fit()
	for town: Dictionary in main.stream.usmap.towns:
		if town["id"] == "chicago":
			check("Chicago label has no broken UTF-8 punctuation", not String(town["name"]).contains("â€"))
	if not output.is_empty():
		var seattle: Rect2 = Rect2()
		for label: Dictionary in main.stream._map_label_layout:
			if label["text"] == "SEATTLE":
				seattle = label["rect"]
		check("Seattle has a readable country label", seattle.has_area())
		if seattle.has_area():
			await pointer(main.stream._map_canvas.global_position + seattle.get_center())
			check("clicking the visible Seattle name selects Seattle, not a nearby MARK", main.waypoint_idx >= 0 and String(main.waypoints[main.waypoint_idx][0]).ends_with("SEATTLE") and main.waypoints[main.waypoint_idx][1].distance_to(Vector3(-56500,0,-18000)) < 1)
	var before_zoom: float = main.stream._atlas_zoom
	await pad(JOY_BUTTON_RIGHT_SHOULDER)
	check("controller RB zooms the atlas", main.stream._atlas_zoom > before_zoom)
	var before_pan: Vector2 = main.stream._atlas_pan
	await pad(JOY_BUTTON_DPAD_RIGHT)
	check("controller D-pad pans the zoomed atlas", main.stream._atlas_pan.x > before_pan.x)
	await pad(JOY_BUTTON_A)
	check("controller A sets a real selected course", main.waypoint_idx >= 0 and String(main.waypoints[main.waypoint_idx][0]).begins_with(main.COURSE_PREFIX))
	await capture("04_country_course")
	if not output.is_empty():
		check("selected center course keeps a visible map label", main.stream._map_label_layout.any(func(label: Dictionary) -> bool: return int(label["priority"]) >= 1000))
	var toolbar: HBoxContainer = main.stream._map_toolbar
	before_zoom = main.stream._atlas_zoom
	await pointer((toolbar.get_child(1) as Button).get_global_rect().get_center())
	check("visible zoom control changes actual map scale", main.stream._atlas_zoom > before_zoom)
	check("using a toolbar control returns focus to map navigation", get_viewport().gui_get_focus_owner() == main.stream._map_canvas)
	await key(KEY_ESCAPE)
	check("raw Escape closes without cycling views", not main.stream.map_open())
	cleanup_map()
	await key(KEY_M)
	await pad(JOY_BUTTON_B)
	check("raw controller B closes", not main.stream.map_open())
	cleanup_map()
	await key(KEY_M)
	button = close_button()
	if button != null:
		await pointer(button.get_global_rect().get_center())
	check("real pointer activates visible close button", not main.stream.map_open())
	cleanup_map()
	await key(KEY_M)
	Input.action_press("move_up")
	Input.action_press("move_right")
	await frames(12)
	check("held vehicle throttle and steering stay neutral behind map", main.active_car.input_throttle == 0 and main.active_car.input_steer == 0)
	Input.action_release("move_up")
	Input.action_release("move_right")
	await key(KEY_E)
	check("interact cannot exit the car behind map", main.mode == main.Mode.DRIVE)
	await key(KEY_TAB)
	check("pack cannot stack over the map", not main.panel.is_open)
	if main.panel.is_open:
		main.panel.close()
	cleanup_map()
	await key(KEY_M)
	await pad(JOY_BUTTON_X)
	check("X switches from wide atlas to GPS", main.stream.device_skin == "gps")
	await capture("05_gps")
	await pad(JOY_BUTTON_X)
	check("X switches from GPS to portrait phone", main.stream.device_skin == "phone")
	await capture("06_phone")
	await pad(JOY_BUTTON_X)
	check("X returns to wide atlas without closing", main.stream.device_skin == "atlas" and main.stream.map_open())
	if not output.is_empty():
		get_window().content_scale_size = Vector2i(960,540)
		get_window().size = Vector2i(960,540)
		await frames(12)
		await key(KEY_M)
		await key(KEY_M)
		check("compact LCD is wholly inside the viewport", get_viewport().get_visible_rect().encloses(main.stream._map_canvas.get_global_rect()))
		await capture("07_compact_country")
		labels_fit()
	cleanup_map()
	if main.mode == main.Mode.DRIVE:
		await key(KEY_E)
	main.player.global_position = Vector3(110,0.6,-316) # Open-ground staging only.
	main.player.velocity = Vector3.ZERO
	await frames(12)
	await key(KEY_M)
	var start: Vector3 = main.player.global_position
	Input.action_press("move_right")
	await frames(20)
	Input.action_release("move_right")
	check("on-foot movement cannot walk behind the map", Vector2(main.player.global_position.x - start.x, main.player.global_position.z - start.z).length() < 0.15)
	check("on-foot lock is actually engaged", main.player.input_locked)
	cleanup_map()
	start = main.player.global_position
	Input.action_press("move_right")
	await frames(20)
	Input.action_release("move_right")
	check("real walking resumes after map closes", Vector2(main.player.global_position.x - start.x, main.player.global_position.z - start.z).length() > 0.3)
	await transition_checks()
	await key(KEY_J)
	await key(KEY_M)
	check("map cannot open over character creation", main.char_create.is_open and not main.stream.map_open())
	cleanup_map()
	if main.char_create.is_open:
		main.char_create.toggle()
	await mounted_checks()
	await key(KEY_M)
	main.character.take_wound("torso", 9999)
	await frames()
	check("actual death dismisses the atlas", main.character.dead and not main.stream.map_open())
	await key(KEY_M)
	check("map cannot reopen above death", not main.stream.map_open())
	if not output.is_empty():
		var file := FileAccess.open(output.path_join("manifest.json"), FileAccess.WRITE)
		check("manifest opens", file != null)
		if file != null:
			file.store_string(JSON.stringify({"captures": captures, "passed": passed, "failed": failed}, "\t"))
	main.queue_free()
	main = null
	await frames(8)
	print("ATLAS READABILITY RESULTS: %d passed, %d failed" % [passed,failed])
	get_tree().quit(0 if failed == 0 else 1)

func transition_checks() -> void:
	await key(KEY_M)
	var button := close_button()
	for attempt: int in 8:
		if get_viewport().gui_get_focus_owner() == button:
			break
		await key(KEY_TAB)
	check("keyboard can focus the visible close control", button != null and get_viewport().gui_get_focus_owner() == button)
	await pad_state(JOY_BUTTON_A, true)
	check("focused close does not activate until pad A is released", main.stream.map_open())
	check("focused close keeps held A out of gameplay", main._gameplay_input_blocked())
	await pad_state(JOY_BUTTON_A, false)
	check("focused close activates on pad A release", not main.stream.map_open())
	check("A release clears the closing guard", not main._gameplay_input_blocked())
	cleanup_map()
	await key(KEY_M)
	await pad_state(JOY_BUTTON_B, true)
	check("held B closes without crouching", not main.stream.map_open() and not main.player.crouching and main._gameplay_input_blocked())
	Input.joy_connection_changed.emit(0, false)
	check("disconnect releases an actual pad closing guard", not main._gameplay_input_blocked())
	await pad_state(JOY_BUTTON_B, false)
	await key(KEY_M)
	await key(KEY_M)
	await key(KEY_M)
	var binding := InputEventKey.new()
	binding.physical_keycode = KEY_W
	InputMap.action_add_event("drivn_map", binding) # Disposable supported rebind.
	await key_state(KEY_W, true)
	check("rebound map key closes the country view", not main.stream.map_open() and main._gameplay_input_blocked())
	Input.joy_connection_changed.emit(0, false)
	check("unrelated pad disconnect cannot release a held keyboard close", main._gameplay_input_blocked())
	await key_state(KEY_W, false)
	check("rebound keyboard release clears its guard", not main._gameplay_input_blocked())
	InputMap.action_erase_event("drivn_map", binding)
	cleanup_map()
	main.equipped = -1
	var click := InputEventMouseButton.new()
	click.button_index = MOUSE_BUTTON_LEFT
	click.pressed = true
	Input.parse_input_event(click)
	await get_tree().process_frame
	await frames(2)
	check("real unarmed press arms the gesture fixture", main._fist_pressed and main._fire_down)
	await key(KEY_M)
	click = InputEventMouseButton.new()
	click.button_index = MOUSE_BUTTON_LEFT
	click.pressed = false
	Input.parse_input_event(click)
	var cooldown: float = 0
	for i: int in 40:
		await frames(1)
		cooldown = maxf(cooldown, main.palm._cd)
	check("opening map cancels pending shove and fire latch", cooldown == 0 and not main._fist_pressed and not main._fire_down)
	await key(KEY_ESCAPE)
	await pointer(Vector2(500,200))
	check("next real click can punch after closing map", main.fists._cd > 0)
	await key_state(KEY_C, true)
	check("whistle fixture begins a real hold", main._wh_down)
	await key(KEY_M)
	await key_state(KEY_C, false)
	await frames(40)
	check("map cancels pending whistle hold and taps", not main._wh_down and main._wh_taps == 0 and not main._wh_hold_fired)
	await key(KEY_ESCAPE)

func mounted_checks() -> void:
	main.player.global_position = Vector3(8.4,0.5,388)
	main.player.velocity = Vector3.ZERO
	var horse := ProtoHorse.create("mustang")
	main.add_child(horse)
	horse.global_position = Vector3(10,0.5,388)
	await frames(12)
	await key(KEY_E)
	var mounted: bool = horse.riders.get("front") != null and main.player.get_parent() == horse
	check("real E mounts the horse for the map-control fixture", mounted)
	if not mounted:
		horse.queue_free()
		return
	main.weapons.append(ProtoWeapon.new("pistol"))
	main.equipped = main.weapons.size() - 1
	var weapon: ProtoWeapon = main.current_weapon()
	await key(KEY_M)
	Input.action_press("move_up")
	await frames(25)
	Input.action_release("move_up")
	check("mounted movement stays neutral while reading map", absf(horse._speed) < 0.01)
	var ammo: int = weapon.mag
	var fire := InputEventAction.new()
	fire.action = "drivn_fire"
	fire.pressed = true
	Input.parse_input_event(fire)
	await frames(3)
	fire = InputEventAction.new()
	fire.action = "drivn_fire"
	fire.pressed = false
	Input.parse_input_event(fire)
	await frames(3)
	check("mounted fire cannot spend ammo behind the map", weapon.mag == ammo)
	await key(KEY_ESCAPE)
	Input.action_press("move_up")
	await frames(25)
	Input.action_release("move_up")
	check("mounted controls work again after closing", horse._speed > 0.5)
	await frames(40)
	await key(KEY_E)
	check("real E dismount still works after map use", main.player.get_parent() != horse)
	if main.player.get_parent() == horse:
		horse.interact(main) # RED cleanup only: never delete the player's parent.
	horse.queue_free()
	await frames(6)
