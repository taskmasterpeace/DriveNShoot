## Headless physics proof for AERODYNAMIC DRAG (car_3d.gd, learned from
## Ander2211/Vehicle-Controller MIT). Drives a REAL VehicleBody3D on a flat plane
## (same harness as drive_sim): proves the drag FORCE formula, that drag actually
## slows a COASTING car through the physics solver, and that the gentle per-class
## value does NOT wreck the tuned top speed. Never teleports — real throttle inputs.
## Run: godot --headless --path game res://proto3d/tests/aero_sim.tscn
extends Node3D

enum Phase { TOPSPEED, COAST_DRAG_PREP, COAST_DRAG, COAST_NODRAG_PREP, COAST_NODRAG, DONE }

var car: ProtoCar3D
var phase: Phase = Phase.TOPSPEED
var t: float = 0.0
var phase_t: float = 0.0

var top_reached: float = 0.0
var coast_v0: float = 0.0
var drop_drag: float = -1.0
var drop_nodrag: float = -1.0

var passed: int = 0
var failed: int = 0


func _ready() -> void:
	var ground := StaticBody3D.new()
	var shape := CollisionShape3D.new()
	var box := BoxShape3D.new()
	box.size = Vector3(6000, 1, 6000)
	shape.shape = box
	shape.position.y = -0.5
	ground.add_child(shape)
	add_child(ground)

	car = ProtoCar3D.create("scavenger", Color(0.6, 0.2, 0.1))
	car.position = Vector3(0, 1.2, 0)
	car.use_player_input = false
	car.is_active = true
	add_child(car)

	# --- Pure-function checks first (no physics needed): the drag FORCE formula ---
	car.aero_drag = 0.30
	var f := car.aero_force(Vector3(10.0, 0.0, 0.0)) # |v|=10 -> 0.30*100 = 30 N, -x
	_check("aero_force magnitude = aero_drag·v² (want 30N, got %.1f)" % f.length(), absf(f.length() - 30.0) < 0.01)
	_check("aero_force opposes motion (−x)", f.x < 0.0 and absf(f.z) < 0.001)
	_check("aero_force ignores vertical velocity", absf(car.aero_force(Vector3(0, 20, 0)).length()) < 0.001)
	car.aero_drag = 0.0
	_check("aero_force is ZERO when drag off", car.aero_force(Vector3(10, 0, 0)) == Vector3.ZERO)
	car.aero_drag = 5.0
	_check("aero_force zero below 0.5 m/s dead-zone", car.aero_force(Vector3(0.2, 0, 0)) == Vector3.ZERO)

	car.aero_drag = float(car.spec.get("aero_drag", 0.0)) # restore the real tuned value (0.30)
	print("SIM: start (scavenger tuned aero_drag=%.2f, top=%.0f)" % [car.aero_drag, car.top_speed])


func _check(check_name: String, ok: bool) -> void:
	if ok: passed += 1
	else: failed += 1
	print("AERO: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _physics_process(delta: float) -> void:
	t += delta
	phase_t += delta
	var speed := car.forward_speed
	top_reached = maxf(top_reached, speed)

	match phase:
		# Full throttle to steady state — the gentle 0.30 drag must not gut top speed.
		Phase.TOPSPEED:
			car.input_throttle = 1.0
			car.input_brake = 0.0
			car.input_steer = 0.0
			if phase_t > 12.0:
				_check("top speed holds with tuned drag (%.1f m/s ≥ 85%% of tuned %.0f)" % [top_reached, car.top_speed],
					top_reached >= 0.85 * car.top_speed)
				_next(Phase.COAST_DRAG_PREP)

		# Reach 25 m/s (drag OFF so we can get there), then coast 2s WITH a strong
		# drag switched on — big, unambiguous slowdown.
		Phase.COAST_DRAG_PREP:
			car.input_throttle = 1.0
			car.aero_drag = 0.0
			if speed >= 25.0:
				coast_v0 = speed
				car.aero_drag = 5.0        # drag ON for the coast
				_next(Phase.COAST_DRAG)
		Phase.COAST_DRAG:
			car.input_throttle = 0.0
			if phase_t >= 2.0:
				drop_drag = coast_v0 - speed
				_next(Phase.COAST_NODRAG_PREP)

		# Back to the SAME 25 m/s (drag off throughout), coast 2s — smaller slowdown.
		Phase.COAST_NODRAG_PREP:
			car.input_throttle = 1.0
			car.aero_drag = 0.0
			if speed >= 25.0:
				coast_v0 = speed
				_next(Phase.COAST_NODRAG)
		Phase.COAST_NODRAG:
			car.input_throttle = 0.0
			if phase_t >= 2.0:
				drop_nodrag = coast_v0 - speed
				_check("coasting with drag slows MORE (drag −%.1f vs no-drag −%.1f m/s over 2s)" % [drop_drag, drop_nodrag],
					drop_drag > drop_nodrag + 3.0)
				_check("both coasts measured from ~25 m/s", drop_drag >= 0.0 and drop_nodrag >= 0.0)
				_next(Phase.DONE)
		Phase.DONE:
			_report()

	if t > 40.0:
		print("AERO: TIMEOUT in phase %s" % Phase.keys()[phase])
		if phase != Phase.DONE:
			failed += 1   # a timeout before the last check is a real failure, never a false green
		_report()


func _next(p: Phase) -> void:
	print("AERO: phase %s -> %s at t=%.1f (speed %.1f)" % [Phase.keys()[phase], Phase.keys()[p], t, car.forward_speed])
	phase = p
	phase_t = 0.0


func _report() -> void:
	print("AERO RESULTS: %d passed, %d failed" % [passed, failed])
	print("AERO: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
