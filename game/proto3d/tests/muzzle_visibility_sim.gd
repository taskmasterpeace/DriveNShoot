## Automatic fire must stay bright and bounded: authored flash shapes, one flash
## per accepted shot, and a fixed pool instead of short-lived allocation churn.
## Run: Godot --headless --path game res://proto3d/tests/muzzle_visibility_sim.tscn
extends Node3D

var passed: int = 0
var failed: int = 0


func _check(label: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("MUZZLE: %s - %s" % ["PASS" if ok else "FAIL", label])


func _ready() -> void:
	print("MUZZLE: start")
	get_tree().create_timer(20.0).timeout.connect(func() -> void:
		print("MUZZLE: WATCHDOG")
		get_tree().quit(1))

	var authored: bool = true
	for id in ["pistol", "scrap_smg", "shotgun"]:
		authored = authored and not (ProtoWeapon.WEAPONS[id].get("muzzle_fx", {}) as Dictionary).is_empty()
	_check("pistol, SMG, and shotgun author their muzzle FX", authored)
	if not authored:
		_finish()
		return

	var lengths: Array[float] = []
	for id in ["pistol", "scrap_smg", "shotgun"]:
		lengths.append(float((ProtoWeapon.WEAPONS[id]["muzzle_fx"] as Dictionary)["length"]))
	_check("pistol, SMG, and shotgun flashes have distinct lengths",
		not is_equal_approx(lengths[0], lengths[1])
		and not is_equal_approx(lengths[1], lengths[2])
		and not is_equal_approx(lengths[0], lengths[2]))

	var main: Node3D = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 8:
		await get_tree().process_frame
	main.set_physics_process(false)
	var host := Node3D.new()
	main.add_child(host)
	var weapon := ProtoWeapon.new("scrap_smg")
	weapon.mag = 100
	var origin := Vector3(12.0, 2.0, 8.0)
	var direction := Vector3.FORWARD
	for _i in 40:
		weapon._cd = 0.0
		weapon.fire(main, origin, direction, host)
	var flashes := host.get_children().filter(func(n: Node) -> bool:
		return n.is_in_group("fx_flash"))
	_check("forty shots never allocate more than twelve flash slots (%d)" % flashes.size(),
		flashes.size() == 12)
	var row: Dictionary = ProtoWeapon.WEAPONS["scrap_smg"]["muzzle_fx"]
	var expected: Vector3 = origin + direction * float(row["offset"])
	var newest: Node3D = flashes.back() as Node3D
	_check("the flash starts at the authored muzzle offset",
		newest.global_position.distance_to(expected) < 0.08)
	_check("the pooled slot exposes the authored length",
		absf(float(newest.get("authored_length")) - float(row["length"])) < 0.001)

	await get_tree().create_timer(0.16).timeout
	var inactive: bool = flashes.all(func(n: Node) -> bool: return not n.visible)
	_check("expired flash slots stay pooled and inactive", inactive and flashes.size() == 12)

	main.queue_free()
	_finish()


func _finish() -> void:
	print("MUZZLE RESULTS: %d passed, %d failed" % [passed, failed])
	print("MUZZLE: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
