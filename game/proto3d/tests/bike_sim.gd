## Headless proof for the TWO-WHEEL upright assist (playtest bug 2026-07-05:
## "the motorcycle tips over as soon as you get on it"). Runs the real Rat Bike
## VehicleBody3D through the exact bug path — park, MOUNT, idle, ride, swerve,
## stop, dismount — and asserts it never falls. Inputs only (iron rule).
## Run: godot --headless --path game res://proto3d/tests/bike_sim.tscn
extends Node3D

enum Phase { PARKED, MOUNT_IDLE, RIDE, SWERVE_L, SWERVE_R, STOP, DISMOUNT, DONE }

var bike: ProtoCar3D
var phase: Phase = Phase.PARKED
var t: float = 0.0
var phase_t: float = 0.0
var passed: int = 0
var failed: int = 0

var min_up_parked: float = 1.0
var min_up_mounted: float = 1.0
var min_up_riding: float = 1.0
var min_up_swerve: float = 1.0
var ride_top: float = 0.0
var swerve_lean_seen: float = 0.0
var ever_fell: bool = false


func _ready() -> void:
	var ground := StaticBody3D.new()
	var shape := CollisionShape3D.new()
	var box := BoxShape3D.new()
	box.size = Vector3(4000, 1, 4000)
	shape.shape = box
	shape.position.y = -0.5
	ground.add_child(shape)
	add_child(ground)

	# Parked, nobody on it — the kickstand case.
	bike = ProtoCar3D.create("motorcycle", Color(0.45, 0.3, 0.12))
	bike.position = Vector3(0, 1.0, 0)
	bike.use_player_input = false
	bike.is_active = false
	add_child(bike)
	print("SIM: start (Rat Bike upright proof)")


func _check(check_name: String, ok: bool) -> void:
	if ok:
		passed += 1
		print("SIM: PASS - %s" % check_name)
	else:
		failed += 1
		print("SIM: FAIL - %s" % check_name)


func _up() -> float:
	return bike.global_basis.y.dot(Vector3.UP)


func _physics_process(delta: float) -> void:
	t += delta
	phase_t += delta
	if _up() < 0.3:
		ever_fell = true

	match phase:
		Phase.PARKED:
			min_up_parked = minf(min_up_parked, _up() if phase_t > 0.6 else 1.0) # let it settle onto the ground first
			if phase_t > 2.5:
				_check("PARKED bike stands on its own (min up %.2f, want >0.92)" % min_up_parked, min_up_parked > 0.92)
				# THE BUG MOMENT: mounting = is_active flips true (what enter_car does).
				bike.is_active = true
				bike.input_throttle = 0.0
				bike.input_steer = 0.0
				_next(Phase.MOUNT_IDLE)
		Phase.MOUNT_IDLE:
			# Sit on it, touch nothing. The playtest bike fell RIGHT HERE.
			min_up_mounted = minf(min_up_mounted, _up())
			if phase_t > 3.0:
				_check("MOUNTED bike does NOT tip over while idle 3s (min up %.2f, want >0.92)" % min_up_mounted, min_up_mounted > 0.92)
				_next(Phase.RIDE)
		Phase.RIDE:
			bike.input_throttle = 1.0
			min_up_riding = minf(min_up_riding, _up())
			ride_top = maxf(ride_top, bike.forward_speed)
			if phase_t > 3.5:
				_check("bike RIDES (hit %.1f m/s, want >10)" % ride_top, ride_top > 10.0)
				_check("upright while accelerating (min up %.2f, want >0.9)" % min_up_riding, min_up_riding > 0.9)
				_next(Phase.SWERVE_L)
		Phase.SWERVE_L:
			bike.input_throttle = 0.6
			bike.input_steer = 1.0
			min_up_swerve = minf(min_up_swerve, _up())
			swerve_lean_seen = maxf(swerve_lean_seen, absf(asin(clampf(bike.global_basis.x.dot(Vector3.UP), -1.0, 1.0))))
			if phase_t > 1.4:
				_next(Phase.SWERVE_R)
		Phase.SWERVE_R:
			bike.input_throttle = 0.6
			bike.input_steer = -1.0
			min_up_swerve = minf(min_up_swerve, _up())
			swerve_lean_seen = maxf(swerve_lean_seen, absf(asin(clampf(bike.global_basis.x.dot(Vector3.UP), -1.0, 1.0))))
			if phase_t > 1.4:
				bike.input_steer = 0.0
				_check("hard swerves L+R never dump the bike (min up %.2f, want >0.82)" % min_up_swerve, min_up_swerve > 0.82)
				# 3° floor = the lean reads at all; 32° ceiling = a deep carve, never
				# the 47-64° layover the unstabilized bike hit (min-up guards the dump).
				_check("the bike visibly LEANS into corners (peak %.1f deg, want 3-32)" % rad_to_deg(swerve_lean_seen),
					swerve_lean_seen > deg_to_rad(3.0) and swerve_lean_seen < deg_to_rad(32.0))
				_next(Phase.STOP)
		Phase.STOP:
			# The swerve can end with the bike SPUN ~180° (forward_speed sign
			# flips with facing at ~−12 m/s). Under the arcade scheme brake IS
			# reverse-gear at low/negative speed — so a rider stopping a
			# backward-rolling bike uses FORWARD throttle as the brake, then
			# releases everything at walking pace.
			if bike.forward_speed > 1.5:
				bike.input_throttle = 0.0
				bike.input_brake = 1.0
			elif bike.forward_speed < -1.5:
				bike.input_throttle = 1.0
				bike.input_brake = 0.0
			else:
				bike.input_throttle = 0.0
				bike.input_brake = 0.0
			if absf(bike.forward_speed) < 0.5 and phase_t > 0.5:
				bike.input_brake = 0.0
				_next(Phase.DISMOUNT)
			elif phase_t > 8.0:
				_check("bike brakes to a stop", false)
				_next(Phase.DISMOUNT)
		Phase.DISMOUNT:
			# Get off — kickstand takes over again.
			bike.is_active = false
			if phase_t > 2.0:
				_check("DISMOUNTED bike still standing (up %.2f, want >0.92)" % _up(), _up() > 0.92)
				_check("never fell over the whole run", not ever_fell)
				_next(Phase.DONE)
		Phase.DONE:
			_report()

	if t > 40.0:
		print("SIM: TIMEOUT in phase %s" % Phase.keys()[phase])
		_report()


func _next(p: Phase) -> void:
	print("SIM: phase %s -> %s at t=%.1f (speed %.1f m/s, up %.2f)" % [Phase.keys()[phase], Phase.keys()[p], t, bike.forward_speed, _up()])
	phase = p
	phase_t = 0.0


func _report() -> void:
	print("SIM RESULTS: %d passed, %d failed" % [passed, failed])
	print("SIM: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
