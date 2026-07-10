## Preview and projectile share one ballistic law. Charge, strength, mass, and
## inherited motion all change distance; inventory is spent only on release.
## Run: Godot --headless --path game res://proto3d/tests/throw_charge_sim.tscn
extends Node3D

const THROWABLE_PATH := "res://proto3d/throwable.gd"

var passed: int = 0
var failed: int = 0


func _check(label: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("THROW: %s - %s" % ["PASS" if ok else "FAIL", label])


func _grenade_event(down: bool) -> InputEventAction:
	var event := InputEventAction.new()
	event.action = "drivn_grenade"
	event.pressed = down
	return event


func _ready() -> void:
	print("THROW: start")
	get_tree().create_timer(20.0).timeout.connect(func() -> void:
		print("THROW: WATCHDOG")
		get_tree().quit(1))

	if not ResourceLoader.exists(THROWABLE_PATH):
		_check("the reusable throwable component exists", false)
		_finish()
		return
	var throwable: Script = load(THROWABLE_PATH) as Script
	var row: Dictionary = throwable.row("grenade")
	_check("the grenade row folds from data", not row.is_empty() and row.has("mass"))
	var tap: float = throwable.charge_for(0.0, row)
	var half: float = throwable.charge_for(float(row["charge_s"]) * 0.5, row)
	var full: float = throwable.charge_for(float(row["charge_s"]), row)
	_check("charge orders tap < half < full", tap < half and half < full)

	var base: Vector3 = throwable.launch_velocity(Vector3.FORWARD, full, 0,
		float(row["mass"]), Vector3.ZERO, row)
	var strong: Vector3 = throwable.launch_velocity(Vector3.FORWARD, full, 10,
		float(row["mass"]), Vector3.ZERO, row)
	var heavy: Vector3 = throwable.launch_velocity(Vector3.FORWARD, full, 0,
		2.0, Vector3.ZERO, row)
	_check("strength increases horizontal throw speed", strong.length() > base.length())
	_check("a heavier object travels slower", Vector2(heavy.x, heavy.z).length()
		< Vector2(base.x, base.z).length())
	var inherited: Vector3 = throwable.launch_velocity(Vector3.FORWARD, full, 0,
		float(row["mass"]), Vector3(8, 0, 0), row)
	_check("horizontal carrier velocity is inherited",
		absf((inherited.x - base.x) - 5.2) < 0.01)

	var origin := Vector3(0, 8, 0)
	var predicted: PackedVector3Array = throwable.predict(origin, base,
		float(row["gravity"]), 12, 1.0 / 60.0)
	var projectile: Node3D = throwable.create_projectile(row, base)
	add_child(projectile)
	projectile.global_position = origin
	for _i in 10:
		projectile.advance_fixed(1.0 / 60.0)
	_check("preview point 10 matches ten projectile steps",
		projectile.global_position.distance_to(predicted[10]) < 0.03)
	projectile.queue_free()

	# Real action path: press previews and holds inventory; release spends/spawns.
	var main: Node3D = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 8:
		await get_tree().process_frame
	main.set_physics_process(false)
	if main.active_car != null:
		main._exit_car()
	main.mode = main.Mode.FOOT
	main.backpack.slots["grenade"] = 1
	main._unhandled_input(_grenade_event(true))
	_check("press starts a throw without consuming inventory",
		main.backpack.count("grenade") == 1)
	main._physics_process(0.45)
	_check("hold exposes a live trajectory preview",
		main.get("_throw_preview") != null and main.get("_throw_preview").visible)
	main._unhandled_input(_grenade_event(false))
	_check("release consumes exactly one grenade", main.backpack.count("grenade") == 0)
	var spawned: int = main.get_tree().get_nodes_in_group("throwable_projectile").size()
	_check("release spawns one real throwable projectile", spawned == 1)

	main.queue_free()
	_finish()


func _finish() -> void:
	print("THROW RESULTS: %d passed, %d failed" % [passed, failed])
	print("THROW: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
