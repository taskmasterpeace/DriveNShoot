extends Node
## Real-world signage regression and optional unretouched GPU captures.
## Staging is photography/setup, not proof of travel. Door entry uses actual input.
var main: Node3D
var passed: int = 0
var failed: int = 0
var output: String = ""
var captures: Array[Dictionary] = []

func check(label: String, ok: bool) -> void:
	passed += int(ok)
	failed += int(not ok)
	print("MERIDIAN SIGNAGE: %s %s" % ["PASS" if ok else "FAIL", label])

func frames(count: int) -> void:
	for i: int in count:
		await get_tree().physics_frame

func action(id: String) -> void:
	for pressed: bool in [true, false]:
		var event := InputEventAction.new()
		event.action = id
		event.pressed = pressed
		Input.parse_input_event(event)
		await frames(5)

func stage(at: Vector3) -> void:
	main.player.global_position = at
	main.player.velocity = Vector3.ZERO
	main.player.move_state = ProtoPlayer3D.FootState.NORMAL
	await frames(25)
	main.cam_rig.snap_to_target()
	await frames(30)

func capture(id: String) -> void:
	if output.is_empty():
		return
	await frames(8)
	await RenderingServer.frame_post_draw
	var picture: Image = get_viewport().get_texture().get_image()
	var size_ok: bool = picture != null and picture.get_size() == Vector2i(1280,720)
	check(id + " actual image is 1280x720", size_ok)
	var result: Error = picture.save_png(output.path_join(id + ".png")) if size_ok else ERR_INVALID_DATA
	check(id + " original game frame saved", result == OK)
	captures.append({"id": id, "saved": result == OK, "player": str(main.player.global_position),
		"camera": str(main.cam_rig._cam.global_position), "hour": main.daynight.hour,
		"note": "Photographic staging, normal game renderer/HUD; no image editing or synthetic scene."})

func _ready() -> void:
	# A runtime self-check complements the runner's fresh, explicit profiles.
	var profile: String = OS.get_user_data_dir().replace("\\", "/").simplify_path().to_lower()
	var owned: String = ProjectSettings.globalize_path("res://../build/").replace("\\", "/").simplify_path().to_lower().trim_suffix("/") + "/"
	if not profile.begins_with(owned):
		print("MERIDIAN SIGNAGE: REFUSED non-build save profile")
		get_tree().quit(2)
		return
	get_tree().create_timer(90).timeout.connect(func() -> void: get_tree().quit(2))
	for argument: String in OS.get_cmdline_user_args():
		if argument.begins_with("--output="):
			output = argument.trim_prefix("--output=").replace("\\", "/").simplify_path()
	if not output.is_empty():
		if not output.to_lower().begins_with(owned) or DisplayServer.get_name() == "headless":
			get_tree().quit(2)
			return
		if DirAccess.make_dir_recursive_absolute(output) != OK:
			get_tree().quit(2)
			return
	main = load("res://proto3d/proto3d.tscn").instantiate()
	add_child(main)
	await frames(15)
	if not output.is_empty():
		get_window().size = Vector2i(1280,720)
	await action("interact")
	check("starter car exits through actual interact action", main.mode == main.Mode.FOOT)
	main.daynight.hour = 11.0
	main.daynight.dev_mult = 0.0
	main.cam_rig.zoom_t = 0.25
	await stage(Vector3(110,1,-320))
	await capture("01_safehouse_front")
	var markers: Array[Label3D] = []
	for candidate: Node in main.find_children("*", "Label3D", true, false):
		var label := candidate as Label3D
		if label.text == "SAFEHOUSE" or label.text.begins_with("STRAYS") or label.text.begins_with("KENNEL"):
			markers.append(label)
	check("safehouse and kennel still have named world destinations", markers.size() == 2)
	for label: Label3D in markers:
		var context: String = label.text.replace("\n", " / ")
		check(context + " is painted on a fixed plane, not a camera-facing banner", label.billboard == BaseMaterial3D.BILLBOARD_DISABLED)
		check(context + " fits a human-scale board below the roofline", label.get_aabb().size.x <= 4.5 and label.global_position.y <= 3.8)
		var board: MeshInstance3D = label.get_parent() as MeshInstance3D
		check(context + " has a physical board behind its lettering", board != null and board.mesh is BoxMesh)
		if board != null and board.mesh is BoxMesh:
			var board_size: Vector3 = (board.mesh as BoxMesh).size
			print("MERIDIAN SIGNAGE bounds: %s text=%s board=%s" % [context,label.get_aabb().size,board_size])
			check(context + " lettering stays inside the board", label.get_aabb().size.x <= board_size.x - 0.1 and label.get_aabb().size.y <= board_size.y - 0.04)
		check(context + " retains depth testing", not label.no_depth_test)
	var destinations: Array[String] = []
	for waypoint: Array in main.waypoints:
		destinations.append(String(waypoint[0]))
	check("existing navigation still offers safehouse and kennel", destinations.has("SAFEHOUSE") and destinations.has("KENNEL"))
	var dogs: Array[Node] = get_tree().get_nodes_in_group("proto_dog")
	var can_adopt: bool = false
	for dog: Node in dogs:
		if not dog.adopted and dog.interact_prompt(main).to_lower().contains("adopt"):
			can_adopt = true
	check("strays retain the real contextual adoption prompt", can_adopt)
	await stage(Vector3(110,1,-306))
	await capture("02_safehouse_approach")
	await stage(Vector3(123,1,-309))
	await capture("03_kennel_front")
	await stage(Vector3(110,1,-320))
	main.daynight.hour = 23.0
	await frames(45)
	await capture("04_safehouse_night")
	main.daynight.hour = 11.0
	await stage(Vector3(108.5,0.4,-318.8))
	await action("interact")
	Input.action_press("move_up")
	for i: int in 100:
		await get_tree().physics_frame
		if main.player.global_position.z < -322.0:
			break
	Input.action_release("move_up")
	await frames(6)
	check("actual movement still traverses the safehouse doorway", main.player.global_position.z < -322.0)
	for marker: Label3D in markers:
		if marker.text == "SAFEHOUSE":
			check("front sign clears the interior with the facade cutaway", not marker.is_visible_in_tree())
	await capture("05_safehouse_entry")
	Input.action_press("move_down")
	for i: int in 100:
		await get_tree().physics_frame
		if main.player.global_position.z > -319.0:
			break
	Input.action_release("move_down")
	await frames(6)
	check("actual movement returns outside the safehouse", main.player.global_position.z > -319.0)
	for marker: Label3D in markers:
		if marker.text == "SAFEHOUSE":
			check("front sign returns after exiting the cutaway", marker.is_visible_in_tree())
	await capture("06_safehouse_exit")
	if not output.is_empty():
		var manifest := FileAccess.open(output.path_join("manifest.json"), FileAccess.WRITE)
		check("capture manifest opens", manifest != null)
		if manifest != null:
			manifest.store_string(JSON.stringify({"captures": captures, "passed": passed, "failed": failed}, "\t"))
	main.queue_free()
	main = null
	await frames(8)
	print("MERIDIAN SIGNAGE RESULTS: %d passed, %d failed" % [passed,failed])
	get_tree().quit(0 if failed == 0 else 1)
