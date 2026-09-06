extends Node
## Full-scene regression: the visual perception mask follows real world time,
## while the day/night rules continue to own sight range independently.

var main: Node
var passed: int = 0
var failed: int = 0


func _ready() -> void:
	get_tree().create_timer(30.0).timeout.connect(func() -> void:
		push_error("DAYLIGHT MASK: TIMEOUT")
		get_tree().quit(1)
	)
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	await _frames(10)
	await _interact()
	_check("real input exits the car", main.mode == main.Mode.FOOT)
	main.daynight.set_physics_process(false)
	ProtoWeather.sky_dim = 1.0
	ProtoWeather.sky_tint_amt = 0.0
	ProtoWeather.fog_mult = 1.0

	main.daynight.hour = 12.0
	main.daynight.moon_phase = 1.0
	main.daynight._apply()
	main._update_vision_cone(2.0, false)
	var day_mask: float = float(main.vision_cone._mat.get_shader_parameter("dim_amount"))
	var day_range: float = main.vision_cone.last_range_m
	var day_darkness: float = float(main.daynight.call("visual_darkness")) if main.daynight.has_method("visual_darkness") else -1.0

	main.daynight.hour = 0.0
	main.daynight.moon_phase = 1.0
	main.daynight._apply()
	main._update_vision_cone(2.0, false)
	var full_moon_mask: float = float(main.vision_cone._mat.get_shader_parameter("dim_amount"))
	var full_moon_range: float = main.vision_cone.last_range_m
	var night_darkness: float = float(main.daynight.call("visual_darkness")) if main.daynight.has_method("visual_darkness") else -1.0

	main.daynight.moon_phase = 0.0
	main.daynight._apply()
	main._update_vision_cone(2.0, false)
	var new_moon_range: float = main.vision_cone.last_range_m

	_check("daylight mask is materially lighter than the night mask (%.3f < %.3f)" % [day_mask, full_moon_mask],
		day_mask < full_moon_mask * 0.7)
	_check("shared practical-light curve is 0 by day and 1 at night (%.2f -> %.2f)" % [day_darkness, night_darkness],
		is_zero_approx(day_darkness) and is_equal_approx(night_darkness, 1.0))
	_check("daytime sight range remains the on-foot 100m rule (%.1fm)" % day_range,
		absf(day_range - 100.0) < 0.5)
	_check("full-moon sight remains 0.75 of daytime (%.1fm)" % full_moon_range,
		absf(full_moon_range - 75.0) < 0.5)
	_check("new-moon sight remains 0.40 of daytime (%.1fm)" % new_moon_range,
		absf(new_moon_range - 40.0) < 0.5)

	main.queue_free()
	main = null
	await _frames(4)
	print("DAYLIGHT MASK RESULTS: %d passed, %d failed" % [passed, failed])
	get_tree().quit(0 if failed == 0 else 1)


func _frames(count: int) -> void:
	for _i: int in count:
		await get_tree().physics_frame


func _interact() -> void:
	for pressed: bool in [true, false]:
		var event: InputEventAction = InputEventAction.new()
		event.action = "interact"
		event.pressed = pressed
		Input.parse_input_event(event)
		await get_tree().process_frame
		await _frames(3)


func _check(label: String, result: bool) -> void:
	passed += int(result)
	failed += int(not result)
	print("DAYLIGHT MASK: %s %s" % ["PASS" if result else "FAIL", label])
