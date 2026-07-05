## Playtest-bug regression: (1) the world has GROUND past the old 6km slab edge,
## (2) a car flipped onto its roof rights itself, (3) edge respawn nudges inward.
extends Node

var main: Node3D
var t := 0.0
var phase := 0
var phase_t := 0.0
var passed := 0
var failed := 0


func _ready() -> void:
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	print("RCV: scene up")


func _check(name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("RCV: %s - %s" % ["PASS" if ok else "FAIL", name])


func _warp_car(pos: Vector3, basis_in: Basis = Basis.IDENTITY) -> void:
	main.active_car.global_transform = Transform3D(basis_in, pos)
	main.active_car.linear_velocity = Vector3.ZERO
	main.active_car.angular_velocity = Vector3.ZERO
	main._safe_timer = -5.0


func _next() -> void:
	phase += 1
	phase_t = 0.0


func _physics_process(delta: float) -> void:
	t += delta
	phase_t += delta
	match phase:
		0: # drive PAST the old slab edge — the far states must have a floor now
			if phase_t > 0.8:
				_warp_car(Vector3(6600, 3.0, 0))
				_next()
		1:
			if phase_t > 2.5:
				_check("GROUND exists past the old 6km edge (y=%.1f)" % main.active_car.global_position.y, main.active_car.global_position.y > -2.0)
				_check("still in a named state out here (%s)" % main.stream.current_state(6600.0), main.stream.current_state(6600.0) != "")
				_next()
		2: # flip the car onto its roof — it should right itself
			if phase_t > 0.5:
				_warp_car(Vector3(6600, 2.5, 30), Basis(Vector3.FORWARD, PI)) # upside down
				_next()
		3:
			var up: float = main.active_car.global_basis.y.dot(Vector3.UP)
			if phase_t > 1.0 and up > 0.8:
				_check("flipped car RIGHTS ITSELF (up=%.2f in %.1fs)" % [up, phase_t], true)
				_next()
			elif phase_t > 8.0:
				_check("flipped car RIGHTS ITSELF (up=%.2f)" % up, false)
				_next()
		4:
			print("RCV RESULTS: %d passed, %d failed" % [passed, failed])
			print("RCV: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
			get_tree().quit(0 if failed == 0 else 1)

	if t > 25.0:
		print("RCV: TIMEOUT in phase %d" % phase)
		print("RCV RESULTS: %d passed, %d failed" % [passed, failed])
		get_tree().quit(1)
