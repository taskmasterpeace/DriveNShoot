## Regression: auxiliary motor-pool registration must not steal the starter
## seat or the Meridian sedan's lock/loot. Runs the NORMAL title -> NEW GAME
## path, then holds the real W key; no teleport, direct throttle or arming call.
## Run with a fresh isolated user profile. Existing saves/rebinds are never edited.
extends Node

const MAIN_SCENE := "res://proto3d/proto3d.tscn"
const START := Vector2(2.5, 390.0)
const SEDAN := Vector2(95.0, -284.0)
var passed: int = 0
var failed: int = 0
var finished: bool = false
var capture_dir: String = ""


func _ready() -> void:
	for argument: String in OS.get_cmdline_user_args():
		if argument.begins_with("--capture-dir="):
			capture_dir = argument.trim_prefix("--capture-dir=")
	get_tree().create_timer(120.0).timeout.connect(func() -> void:
		_check("normal launch and drive finish before watchdog", false)
		_finish())
	_run.call_deferred()


func _check(label: String, condition: bool) -> void:
	if condition:
		passed += 1
	else:
		failed += 1
	print("STARTER_SPAWN: %s - %s" % ["PASS" if condition else "FAIL", label])


func _run() -> void:
	var clean_profile := not FileAccess.file_exists("user://drivn.save") \
		and not FileAccess.file_exists("user://input_overrides.json")
	_check("fresh profile has no existing save or rebinds (nothing deleted)", clean_profile)
	if not clean_profile:
		_finish.call_deferred()
		return
	# Keep this observer at the root while SceneTree launches the real main, so
	# the current_scene == self title gate runs without a test-only menu bypass.
	get_tree().current_scene = null
	var transition: Error = get_tree().change_scene_to_file(MAIN_SCENE)
	_check("normal main scene transition accepted", transition == OK)
	if transition != OK:
		_finish.call_deferred()
		return
	await _frames(12)
	var main := get_tree().current_scene as Node3D
	_check("normal main scene entered tree", main != null and main.scene_file_path == MAIN_SCENE)
	if main == null:
		_finish.call_deferred()
		return
	_check("normal launch presents title", bool(main.get("menu_open")))
	var button := _new_game_button(main)
	_check("real NEW GAME button is visible", button != null and button.is_visible_in_tree())
	await _capture("title")
	if button != null:
		button.grab_focus()
		await _frames(3)
		_key(KEY_ENTER, true)
		await _frames(3)
		_key(KEY_ENTER, false)
		await _frames(10)
	_check("ENTER on NEW GAME dismisses title", not bool(main.get("menu_open")))
	var objectives := main.get("objectives") as ProtoObjectives
	_check("NEW GAME starts the real drive objective", objectives != null and objectives.active and objectives.index == 0)
	var cars: Array = main.get("cars")
	var active_car := main.get("active_car") as ProtoCar3D
	var grounds := main.get("test_grounds") as ProtoTestGrounds
	_check("starter is the active first registered car", active_car != null and not cars.is_empty() and active_car == cars[0])
	if active_car != null:
		print("STARTER_SPAWN: launch car=%s position=%s surface=%s" % [active_car.display_name, active_car.global_position, active_car.current_surface])
		_check("starter spawns on interstate at (2.5, 390), not motor pool", _xz(active_car).distance_to(START) < 3.0)
		_check("starter's real tire surface is road", active_car.current_surface == "road" and ProtoWorldBuilder.surface_at(active_car.global_position) == "road")
		_check("starter is unlocked and accepts player input", not active_car.locked and active_car.key_id.is_empty() and active_car.is_active and active_car.use_player_input)
	var sedan := _car_near(cars, SEDAN)
	_check("Meridian car remains physically parked at (95, -284)", sedan != null)
	_check("second registered car is the actual Meridian sedan", sedan != null and cars.size() > 1 and cars[1] == sedan)
	if sedan != null:
		_check("actual Meridian sedan owns its name and key lock", sedan.display_name == "sedan" and sedan.locked and sedan.key_id == "meridian_car_key")
		_check("actual Meridian sedan retains its starter rocket loot", sedan.trunk.count("pipe_rocket") == 1 and sedan.trunk.count("rocket") == 3)
	_check("Test Grounds retains all nine motor-pool vehicles", grounds != null and grounds.pool_cars.size() == 9)
	if grounds != null:
		var registered_once := true
		var motorcycle: ProtoCar3D = null
		for pool_car: ProtoCar3D in grounds.pool_cars:
			registered_once = registered_once and cars.count(pool_car) == 1
			if pool_car.vclass == "motorcycle":
				motorcycle = pool_car
		_check("each motor-pool vehicle remains registered exactly once", registered_once)
		_check("starter does not commandeer a motor-pool vehicle", not grounds.pool_cars.has(active_car))
		_check("motor-pool motorcycle remains at its own stand", motorcycle != null and _xz(motorcycle).distance_to(Vector2(64.0, 130.0)) < 3.0)
		_check("motor-pool motorcycle has no stolen sedan lock", motorcycle != null and not motorcycle.locked and motorcycle.key_id.is_empty())
	await _capture("new_game")
	if active_car != null and objectives != null and not bool(main.get("menu_open")):
		var drove_from := _xz(active_car)
		_key(KEY_W, true)
		await _frames(3)
		_check("real W key reaches the throttle action", Input.is_action_pressed("move_up"))
		# Condition-based wait: allow ignition/cranking, then stop as soon as the
		# real objective advances. Twenty seconds is a bound, not a staged drive.
		for frame in 1200:
			if objectives.index >= 1:
				break
			await get_tree().physics_frame
		_key(KEY_W, false)
		await _frames(3)
		var distance := _xz(active_car).distance_to(drove_from)
		print("STARTER_SPAWN: W drive distance=%.2fm objective=%d final=%s" % [distance, objectives.index, active_car.global_position])
		_check("W drives the actual starter over 40 horizontal meters", distance > 40.0)
		_check("real driving advances onboarding to pull over", objectives.active and objectives.index == 1)
		_check("released W leaves no stuck throttle action", not Input.is_action_pressed("move_up"))
		await _capture("after_drive")
	# Drain the owned main scene before quitting; do not leave world/audio/render
	# resources for engine shutdown or change anything in an existing save.
	var main_ref: WeakRef = weakref(main)
	get_tree().current_scene = null
	main.queue_free()
	main = null
	await _frames(4)
	_check("owned main is freed before shutdown", main_ref.get_ref() == null)
	_finish.call_deferred()


func _xz(car: ProtoCar3D) -> Vector2:
	return Vector2(car.global_position.x, car.global_position.z)


func _car_near(cars: Array, point: Vector2) -> ProtoCar3D:
	for car: ProtoCar3D in cars:
		if _xz(car).distance_to(point) < 3.0:
			return car
	return null


func _new_game_button(node: Node) -> Button:
	if node is Button and (node as Button).text.contains("NEW GAME"):
		return node as Button
	for child: Node in node.get_children():
		var found := _new_game_button(child)
		if found != null:
			return found
	return null


func _key(code: Key, pressed: bool) -> void:
	var event := InputEventKey.new()
	event.keycode = code
	event.physical_keycode = code
	event.pressed = pressed
	Input.parse_input_event(event)


func _frames(count: int) -> void:
	for frame in count:
		await get_tree().process_frame


func _capture(label: String) -> void:
	if capture_dir.is_empty():
		return
	if DisplayServer.get_name() == "headless":
		_check("optional captures require a rendering driver", false)
		return
	var error: Error = DirAccess.make_dir_recursive_absolute(capture_dir)
	_check("capture directory is writable", error == OK)
	await RenderingServer.frame_post_draw
	var image := get_viewport().get_texture().get_image()
	_check("real %s viewport captured" % label, image != null and not image.is_empty() and image.save_png(capture_dir.path_join(label + ".png")) == OK)


func _finish() -> void:
	if finished:
		return
	finished = true
	_key(KEY_W, false)
	_key(KEY_ENTER, false)
	print("STARTER_SPAWN RESULTS: %d passed, %d failed" % [passed, failed])
	get_tree().quit(0 if failed == 0 else 1)
