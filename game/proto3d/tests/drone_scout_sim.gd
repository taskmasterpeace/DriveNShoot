## Proof for the SCOUT DRONE (LIVING_WORLD_DSOA Phase 3, sim spec §21.4):
## launch from the SAFEHOUSE DOCK (E), the bird flies your course while your
## BODY STAYS HOME, the battery drains, a hazard on the route gets REVEALED and
## MARKED ON THE MAP (the 🛸 waypoint), the bird comes HOME to charge — and a
## bird that takes fire is LOST (a wreck where it fell, not a refund).
## Run: godot --headless --path game res://proto3d/tests/drone_scout_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node3D


class TestFoe:
	extends CharacterBody3D
	var hp: float = 999.0
	func take_damage(amount: float, _attacker: Node3D = null) -> void:
		hp -= amount

	static func create() -> TestFoe:
		var f := TestFoe.new()
		f.add_to_group("threat")
		var shape := CollisionShape3D.new()
		var cap := CapsuleShape3D.new()
		cap.radius = 0.35
		cap.height = 1.7
		shape.shape = cap
		shape.position.y = 0.85
		f.add_child(shape)
		return f


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("DRONE: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _e() -> void:
	for down in [true, false]:
		var ev := InputEventKey.new()
		ev.keycode = KEY_E
		ev.physical_keycode = KEY_E
		ev.pressed = down
		Input.parse_input_event(ev)
		await get_tree().physics_frame
		await get_tree().physics_frame


func _ready() -> void:
	print("DRONE: start")
	get_tree().create_timer(90.0).timeout.connect(func() -> void:
		print("DRONE: WATCHDOG"); print("DRONE: FAILURES PRESENT"); get_tree().quit(1))
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 8:
		await get_tree().process_frame

	main._exit_car()
	main.daynight.hour = 12.0
	var p: ProtoPlayer3D = main.player
	var dock: ProtoDroneDock = main.drone_dock
	p.global_position = dock.global_position + Vector3(0, 0.35, 1.2) # at the pad
	p.velocity = Vector3.ZERO
	for _i in 6:
		await get_tree().physics_frame
	_check("the DOCK is by the safehouse door (interactable)", main._current_interactable == dock)

	# A hazard on tonight's route, and a course for the bird to fly.
	var foe := TestFoe.create()
	main.add_child(foe)
	foe.global_position = dock.global_position + Vector3(0, 0, -60.0)
	main.set_map_course("TEST SWEEP", dock.global_position + Vector3(0, 0, -80.0))
	await get_tree().physics_frame

	# --- Launch: the bird goes OUT, the body stays IN ---------------------------
	var home_pos := p.global_position
	await _e()
	_check("E LAUNCHES the scout", main.drone != null and is_instance_valid(main.drone))
	_check("it flies the ROUTE (mode OUT)", main.drone != null and main.drone.mode == ProtoDrone.DroneMode.ROUTE_OUT)
	var batt0: float = main.drone.battery if main.drone != null else 0.0
	var flew_out := false
	var hazard_marked := false
	var came_home := false
	for _i in 1200:
		await get_tree().physics_frame
		if main.drone != null and is_instance_valid(main.drone):
			if main.drone.global_position.distance_to(dock.global_position) > 30.0:
				flew_out = true
		for wp in main.waypoints:
			if String(wp[0]).begins_with("🛸 HAZARD"):
				hazard_marked = true
		if main.drone == null and dock.charging:
			came_home = true
			break
	_check("the bird actually FLEW OUT (>30m)", flew_out)
	_check("your BODY stayed home the whole flight", p.global_position.distance_to(home_pos) < 0.6)
	_check("the battery DRAINED", batt0 >= ProtoDrone.BATTERY_MAX - 0.5 and came_home) # a full flight spent charge
	_check("the hazard is MARKED ON THE MAP (🛸 waypoint)", hazard_marked)
	_check("the bird came HOME to the dock (recharging)", came_home and dock.flights == 1)

	# --- A bird under fire is LOST ----------------------------------------------
	for _i in 260:
		await get_tree().physics_frame # let the dock finish charging
	await _e()
	_check("the dock relaunches after charging", main.drone != null and is_instance_valid(main.drone))
	if main.drone != null:
		main.drone.take_damage(99.0)
	await get_tree().physics_frame
	var wreck_found := false
	for node in main.get_children():
		if node is ProtoChest and (node as ProtoChest).container.label == "Drone wreck":
			wreck_found = true
	_check("shot down = LOST (no bird)", main.drone == null)
	_check("the wreck is WHERE IT FELL (salvage, not a refund)", wreck_found)

	print("DRONE RESULTS: %d passed, %d failed" % [passed, failed])
	print("DRONE: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
