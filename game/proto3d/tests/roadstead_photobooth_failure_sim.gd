extends Node

var passed: int = 0
var failed: int = 0

func check(label: String, condition: bool) -> void:
	passed += int(condition)
	failed += int(not condition)
	print("ROADSTEAD CAPTURE FAILURE: %s - %s" % ["PASS" if condition else "FAIL", label])

func _ready() -> void:
	get_tree().create_timer(20.0).timeout.connect(func() -> void: get_tree().quit(2))
	var tool: Node = load("res://proto3d/tools/roadstead_photobooth.gd").new()
	check("photobooth exposes checked image-save boundary", tool.has_method("save_capture_image") and tool.has_method("completion_exit_code"))
	if tool.has_method("save_capture_image") and tool.has_method("completion_exit_code"):
		var root: String = "user://roadstead-capture-failure"
		DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(root))
		tool.output = root
		var empty_error: Error = tool.save_capture_image(Image.new(), "empty_source")
		check("empty viewport source is an explicit capture failure", empty_error != OK and tool.failed_captures == 1 and tool.successful_captures == 0)
		var blocked_path: String = ProjectSettings.globalize_path(root + "/blocked.png")
		DirAccess.make_dir_recursive_absolute(blocked_path)
		var image: Image = Image.create(2, 2, false, Image.FORMAT_RGBA8)
		image.fill(Color("7f3fbf"))
		var write_error: Error = tool.save_capture_image(image, "blocked")
		check("failed PNG write is accumulated as a capture failure", write_error != OK and tool.failed_captures == 2 and tool.successful_captures == 0)
		check("any capture failure produces a nonzero process result", tool.completion_exit_code(2) != 0)
	tool.free()
	print("ROADSTEAD CAPTURE FAILURE: %d passed, %d failed" % [passed, failed])
	get_tree().quit(0 if failed == 0 else 1)
