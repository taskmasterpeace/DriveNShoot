extends Node3D
## Rendered contract: perception may DIM pixels, never brighten or bleach them.
## A wrong alpha (including negative/NaN from wall-distance sampling) must fail.
## Requires a real rendering driver, not --headless's dummy renderer.
var passed: int = 0
var failed: int = 0

func _ready() -> void:
	get_tree().create_timer(30.0).timeout.connect(func() -> void: get_tree().quit(1))
	if DisplayServer.get_name() == "headless":
		push_error("VISION RENDER requires a real rendering driver")
		get_tree().quit(1)
		return
	var backdrop: ColorRect = ColorRect.new()
	backdrop.color = Color(0.36, 0.4, 0.34)
	backdrop.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(backdrop)
	var camera: Camera3D = Camera3D.new()
	add_child(camera)
	camera.position = Vector3(0, 30, 20)
	camera.look_at(Vector3.ZERO)
	camera.current = true
	var baseline: Image = await capture()
	var cone: ProtoVisionCone = ProtoVisionCone.create()
	add_child(cone)
	for distance: float in [-1.0, 0.0, 0.001, 2.0, 20.0, 100.0]:
		var occlusion: PackedFloat32Array = PackedFloat32Array()
		if distance >= 0.0:
			occlusion.resize(96)
			occlusion.fill(distance)
		cone.update_cone(camera, Vector3.ZERO, Vector3.FORWARD,
			ProtoVisionCone.MODE_FOOT, 1.0, 1.0, 1.0, occlusion)
		var rendered: Image = await capture()
		var brighter: int = 0
		var dimmer: int = 0
		for y: int in range(0, rendered.get_height(), 4):
			for x: int in range(0, rendered.get_width(), 4):
				var a: Color = baseline.get_pixel(x,y)
				var b: Color = rendered.get_pixel(x,y)
				if b.r > a.r + 0.012 or b.g > a.g + 0.012 or b.b > a.b + 0.012:
					brighter += 1
				if b.get_luminance() < a.get_luminance() - 0.03:
					dimmer += 1
		check("wall %.3fm never brightens (%d bright samples)" % [distance, brighter], brighter == 0)
		check("wall %.3fm retains peripheral dimming" % distance, dimmer > 100)
	print("VISION RENDER RESULTS: %d passed, %d failed" % [passed, failed])
	get_tree().quit(0 if failed == 0 else 1)

func capture() -> Image:
	await get_tree().process_frame
	await RenderingServer.frame_post_draw
	return get_viewport().get_texture().get_image()

func check(label: String, result: bool) -> void:
	if result:
		passed += 1
	else:
		failed += 1
	print("VISION RENDER: %s %s" % ["PASS" if result else "FAIL", label])
