extends Node
## Real title/car/camera polling regression; _unhandled_input alone is not a lock.
var main: Node
var passed: int = 0
var failed: int = 0

func _ready() -> void:
	get_tree().create_timer(60).timeout.connect(func() -> void: get_tree().quit(1))
	_run.call_deferred()

func _run() -> void:
	get_tree().current_scene = null
	_check("normal transition", get_tree().change_scene_to_file("res://proto3d/proto3d.tscn") == OK)
	await frames(15)
	main = get_tree().current_scene
	_check("title gate open", main.menu_open)
	var zoom: float = main.cam_rig.zoom_t
	for code: Key in [KEY_W, KEY_B, KEY_T]:
		await held(code, true)
	Input.action_press("drivn_zoom_in")
	Input.action_press("drivn_binoculars")
	Input.action_press("drivn_aim_right")
	await frames(15)
	_check("title locks player movement", main.player.input_locked)
	_check("title blocks throttle without changing driver ownership", is_zero_approx(main.active_car.input_throttle) and main.active_car.use_player_input)
	_check("title blocks binocular polling", not main.cam_rig.binoculars)
	_check("title blocks time acceleration", not main.daynight.waiting)
	_check("title blocks zoom polling", is_equal_approx(zoom, main.cam_rig.zoom_t))
	_check("title blocks right-stick aiming", main.aim_override == Vector3.ZERO and not main._pad_aiming)
	for code: Key in [KEY_W, KEY_B, KEY_T]:
		await held(code, false)
	Input.action_release("drivn_zoom_in")
	Input.action_release("drivn_binoculars")
	Input.action_release("drivn_aim_right")
	var start := find_button(main, "NEW GAME")
	_check("title still exposes launch", start != null)
	if start != null:
		start.grab_focus()
		await held(KEY_ENTER, true)
		await held(KEY_ENTER, false)
	await frames(6)
	_check("real UI dismissal restores gameplay", not main.menu_open and not main.player.input_locked)
	await held(KEY_W, true)
	_check("gas resumes after modal closes", main.active_car.input_throttle > 0.9)
	await held(KEY_W, false)
	await held(KEY_F11, true)
	await held(KEY_F11, false)
	_check("gameplay Controls opens through real key", main.controls_panel != null and main.controls_panel.is_open)
	await held(KEY_W, true)
	await held(KEY_B, true)
	Input.action_press("drivn_binoculars")
	await frames(4)
	_check("Controls also blocks pedals", is_zero_approx(main.active_car.input_throttle))
	_check("Controls also blocks binoculars", not main.cam_rig.binoculars)
	main.active_car.use_player_input = false
	main.active_car.input_throttle = 0.35
	await frames(4)
	_check("modal preserves AI-driver controls", is_equal_approx(main.active_car.input_throttle, 0.35))
	main.active_car.use_player_input = true
	Input.action_release("drivn_binoculars")
	for code: Key in [KEY_W, KEY_B]:
		await held(code, false)
	main.controls_panel.close()
	await frames(4)
	_check("closing Controls releases body", not main.player.input_locked)
	get_tree().current_scene = null
	main.queue_free()
	main = null
	await frames(5)
	print("MODAL_POLL RESULTS: %d passed, %d failed" % [passed, failed])
	get_tree().quit(0 if failed == 0 else 1)

func _check(label: String, ok: bool) -> void:
	passed += int(ok)
	failed += int(not ok)
	print("MODAL_POLL: %s - %s" % ["PASS" if ok else "FAIL", label])

func frames(count: int) -> void:
	for i: int in count:
		await get_tree().physics_frame

func held(code: Key, pressed: bool) -> void:
	var event := InputEventKey.new()
	event.keycode = code
	event.physical_keycode = code
	event.pressed = pressed
	Input.parse_input_event(event)
	await frames(4)

func find_button(node: Node, text: String) -> Button:
	if node is Button and node.text.contains(text):
		return node as Button
	for child: Node in node.get_children():
		var found := find_button(child, text)
		if found != null:
			return found
	return null
