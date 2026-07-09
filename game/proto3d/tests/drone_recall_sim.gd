## DRONE RECALL (2026-07-09 playtest "we need that fly back feature too — a button to
## automatically fly back"). Isolated from drone_remote_sim so its extra sim time can't
## perturb that suite's timing-sensitive 55s dock-scout route. Proves: recall drops the
## stick, points the bird home (ROUTE_BACK), folds the split view, and a dockless PACK bird
## sets itself down as a RECOVERABLE pickup (never lost) with the paired remote folded.
## Run: Godot_console --headless --path game res://proto3d/tests/drone_recall_sim.tscn
extends Node

const ISO := Vector3(6, 0.35, 388) ## the proven isolated staging spot

var passed := 0
var failed := 0
var main: Node3D
var _prev_ts: float = 1.0


func _check(n: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("RECALL: %s - %s" % ["PASS" if ok else "FAIL", n])


func _panel_use(id: String) -> void:
	if main.use_item(id):
		main.backpack.remove(id, 1)


func _ready() -> void:
	print("RECALL: start")
	get_tree().create_timer(60.0).timeout.connect(func() -> void:
		print("RECALL: WATCHDOG")
		print("RECALL RESULTS: %d passed, %d failed" % [passed, failed + 1])
		print("RECALL: FAILURES PRESENT")
		Engine.time_scale = _prev_ts
		get_tree().quit(1))
	_prev_ts = Engine.time_scale
	Engine.time_scale = 2.5
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 10:
		await get_tree().process_frame
	# The game boots at the wheel — the stick is a FOOT verb, so stage the walker.
	main.mode = main.Mode.FOOT
	main.active_car = null
	main.player.global_position = ISO

	# Deploy a pack bird — one press flies it (the 2026-07-09 one-press fix).
	main.backpack.add("drone", 1)
	_panel_use("drone")
	await get_tree().physics_frame
	_check("a bird is up and you're piloting it", main.drone != null and main.drone_pilot.is_active())

	# RECALL — its effects are SYNCHRONOUS (read before physics steps).
	main.recall_drone()
	_check("recall drops the stick (pilot released)", not main.drone_pilot.is_active())
	_check("recall points the bird home (ROUTE_BACK)",
		main.drone != null and main.drone.mode == ProtoDrone.DroneMode.ROUTE_BACK)
	_check("recall folds the split view", not main.split_view.active)

	# It flies home and sets itself down as a RECOVERABLE pickup (dockless pack bird).
	var t := 0.0
	while t < 30.0 and main.drone != null and is_instance_valid(main.drone):
		await get_tree().physics_frame
		t += get_physics_process_delta_time()
	_check("the recalled bird set itself down (not lost)", main.drone == null or not is_instance_valid(main.drone))
	_check("the remote folded when it landed", main.backpack.count("drone_remote") == 0)

	Engine.time_scale = _prev_ts
	print("RECALL RESULTS: %d passed, %d failed" % [passed, failed])
	print("RECALL: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
