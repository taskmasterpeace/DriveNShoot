## L2 vehicle impacts: one finite packet and rotation-safe local face law.
## Run: Godot --headless --path game res://proto3d/tests/vehicle_contact_sim.tscn
extends Node

const IMPACT_PATH := "res://proto3d/vehicle_impact.gd"

var passed: int = 0
var failed: int = 0


func _check(label: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("VEH_CONTACT: %s - %s" % ["PASS" if ok else "FAIL", label])


func _finish() -> void:
	print("VEH_CONTACT RESULTS: %d passed, %d failed" % [passed, failed])
	print("VEH_CONTACT: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)


func _ready() -> void:
	print("VEH_CONTACT: start")
	get_tree().create_timer(20.0).timeout.connect(func() -> void:
		print("VEH_CONTACT: WATCHDOG")
		get_tree().quit(1))
	if not ResourceLoader.exists(IMPACT_PATH):
		_check("normalized impact component exists", false)
		_finish()
		return
	var impact: Script = load(IMPACT_PATH)
	var sanitized: Dictionary = impact.packet({"world_pos":Vector3(NAN, INF, -INF),
		"world_normal":Vector3.ZERO, "incoming_dir":Vector3.ZERO,
		"energy":INF, "penetration":-40.0, "source":"bullet", "weapon_id":"pistol"})
	_check("packet sanitizes vectors and clamps energy/penetration",
		(sanitized["world_pos"] as Vector3).is_finite()
		and (sanitized["world_normal"] as Vector3).is_normalized()
		and (sanitized["incoming_dir"] as Vector3).is_normalized()
		and is_equal_approx(float(sanitized["energy"]), 5000.0)
		and is_equal_approx(float(sanitized["penetration"]), 0.0))
	var missing: Dictionary = impact.packet({})
	_check("packet supplies every required field",
		missing.has_all(["world_pos", "world_normal", "incoming_dir", "energy",
			"penetration", "source", "weapon_id"]))

	var car_transform := Transform3D(Basis(Vector3.UP, PI * 0.5), Vector3(12, 0.5, -7))
	var half := Vector3(1.2, 1.0, 2.4)
	var cases: Dictionary = {
		"front": {"pos":Vector3(0, 0.55, -2.35), "normal":Vector3(0, 0, -1)},
		"rear": {"pos":Vector3(0, 0.55, 2.35), "normal":Vector3(0, 0, 1)},
		"left": {"pos":Vector3(-1.15, 0.55, 0), "normal":Vector3(-1, 0, 0)},
		"right": {"pos":Vector3(1.15, 0.55, 0), "normal":Vector3(1, 0, 0)},
		"top": {"pos":Vector3(0, 1.0, 0), "normal":Vector3.UP},
		"wheel": {"pos":Vector3(-1.1, 0.12, -1.65), "normal":Vector3(-1, 0, 0)},
	}
	var faces_ok: bool = true
	for expected in cases:
		var data: Dictionary = cases[expected]
		var packet: Dictionary = impact.packet({
			"world_pos":car_transform * (data["pos"] as Vector3),
			"world_normal":car_transform.basis * (data["normal"] as Vector3),
			"incoming_dir":-(car_transform.basis * (data["normal"] as Vector3)),
			"energy":42.0, "penetration":8.0, "source":"test"})
		var got: String = impact.zone_for(car_transform, half, packet)
		if got != expected:
			print("VEH_CONTACT: expected %s, got %s" % [expected, got])
			faces_ok = false
	_check("rotated vehicle resolves front/rear/left/right/top/wheel in local space", faces_ok)

	var contact: Dictionary = impact.contact_packet(Vector3(4, 1, 2), Vector3.LEFT,
		Vector3.RIGHT, 9000.0, "crash")
	_check("contact packet clamps impulse energy and preserves crash facts",
		float(contact["energy"]) == 5000.0 and String(contact["source"]) == "crash"
		and (contact["world_pos"] as Vector3) == Vector3(4, 1, 2)
		and (contact["world_normal"] as Vector3).dot(Vector3.LEFT) > 0.99)
	_finish()
