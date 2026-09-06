extends Node
## Arrangement stages only the approach; actual movement/interact traverse the site.
var main: Node
var passed: int = 0
var failed: int = 0

func check(label: String, ok: bool) -> void:
	passed += int(ok)
	failed += int(not ok)
	print("ROADSTEAD YARD: %s %s" % ["PASS" if ok else "FAIL", label])

func frames(count: int) -> void:
	for i: int in count:
		await get_tree().physics_frame

func action(id: String) -> void:
	var event := InputEventAction.new()
	event.action = id
	event.pressed = true
	Input.parse_input_event(event)
	await frames(3)
	event = InputEventAction.new()
	event.action = id
	Input.parse_input_event(event)
	await frames(3)

func stage(at: Vector3) -> void:
	main.player.global_position = at + Vector3(0, 0.6, 0)
	main.player.velocity = Vector3.ZERO
	main.player.move_state = ProtoPlayer3D.FootState.NORMAL
	await frames(12)

func walk_until(action_id: String, boundary: float, upward: bool) -> void:
	Input.action_press(action_id)
	for i: int in 180:
		await get_tree().physics_frame
		var z: float = main.player.global_position.z
		if (upward and z < boundary) or (not upward and z > boundary):
			break
	Input.action_release(action_id)
	await frames(6)

func _ready() -> void:
	get_tree().create_timer(90).timeout.connect(func() -> void: get_tree().quit(2))
	main = load("res://proto3d/proto3d.tscn").instantiate()
	add_child(main)
	await frames(12)
	await action("interact")
	check("real input exits starter car", main.mode == main.Mode.FOOT)
	var yard: Node3D = main.road_life.get_node_or_null("RoadsteadYard")
	check("real road-life scene owns authored yard", yard != null)
	for point: Vector3 in [Vector3(30,0,-338), Vector3(54,0,-350), Vector3(78,0,-350)]:
		check("connected approach has gravel tire response at %s" % point, ProtoWorldBuilder.surface_at(point) == "gravel")
	if yard != null:
		var bodies: Array[Node] = yard.find_children("*", "StaticBody3D", true, false)
		check("solid props have physical presence", bodies.size() >= 8)
		var hit: Dictionary = main.get_world_3d().direct_space_state.intersect_ray(
			PhysicsRayQueryParameters3D.create(Vector3(33,0.65,-363), Vector3(35,0.65,-363)))
		check("literal side-fence probe hits real collision", not hit.is_empty() and yard.is_ancestor_of(hit.get("collider")))
		var meshes: Array[Node] = yard.find_children("*", "MeshInstance3D", true, false)
		check("imported yard geometry is instantiated", meshes.size() >= 12)
	await stage(main.road_life.office.global_position + Vector3(0,0,7))
	await walk_until("move_up", -325.5, true)
	await action("interact")
	check("walk through shelter reaches real office interaction", main.road_life.panel.is_open and main.road_life.panel.board == main.road_life.office)
	main.road_life.panel.close()
	for site: Node3D in main.road_life.sites:
		await stage(site.global_position + Vector3(0,0,12.5))
		await walk_until("move_up", site.global_position.z + 2.8, true)
		var local: Vector3 = site.to_local(main.player.global_position)
		check("real lane-to-room walk enters " + String(site.row.id), local.z < 3.0 and local.z > -3.5 and absf(local.x) < 0.6 and local.y > 0.25)
		var hidden: bool = not site.roofs.is_empty()
		for roof: Node3D in site.roofs:
			hidden = hidden and not roof.visible
		check("entered house keeps roof cutaway", hidden)
		await walk_until("move_down", site.global_position.z + 11.0, false)
		check("real room-to-lane walk exits without jumping", main.player.global_position.z > site.global_position.z + 11.0)
	main.queue_free()
	main = null
	await frames(8)
	check("yard road registration is removed with scene", not ProtoWorldBuilder.extra_road_rects.has("roadstead_yard"))
	print("ROADSTEAD YARD RESULTS: %d passed, %d failed" % [passed,failed])
	get_tree().quit(0 if failed == 0 else 1)
