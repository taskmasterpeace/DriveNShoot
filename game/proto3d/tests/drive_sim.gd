## Headless physics proof for the PROTO-3D car. Runs the real VehicleBody3D on a
## flat plane and measures: 0-60 time, top speed, 60-0 braking distance, steering
## response, and the HANDBRAKE — now three ways (the 2026-07-05 driving pass):
##   • straight handbrake must actually BRAKE (playtest: "doesn't work unless you turn")
##   • a handbrake TURN drifts in a controlled arc, never whips a full 180
##   • a LONG hold stays bounded (no runaway spin-out)
## Plus: SURFACE grip differs road vs dirt, and sliding lays SKID MARKS.
## Run: godot --headless --path game res://proto3d/tests/drive_sim.tscn
extends Node3D

enum Phase { ACCEL, TOP, BRAKE, STEER_PREP, STEER,
	HB_STRAIGHT_PREP, HB_STRAIGHT, HB_TURN_PREP, HB_TURN, HB_LONG_PREP, HB_LONG,
	SURFACE, DONE }

const MPH := 2.237

var car: ProtoCar3D
var phase: Phase = Phase.ACCEL
var t: float = 0.0
var phase_t: float = 0.0

var t_060: float = -1.0
var top_speed: float = 0.0
var brake_start_pos: Vector3
var brake_dist: float = -1.0
var brake_time: float = -1.0
var steer_start_yaw: float = 0.0
var steer_turned: float = 0.0

var hbs_speed0: float = 0.0
var hbs_drop: float = 0.0
var hbs_yaw0: float = 0.0
var hbs_yaw_drift: float = 0.0

var hb_start_yaw: float = 0.0
var hb_turned: float = 0.0

var hb_long_prev_yaw: float = 0.0
var hb_long_total: float = 0.0
var hb_long_peak_rate: float = 0.0

var surf_road_grip: float = 0.0
var surf_dirt_grip: float = 0.0
var skids_after_drift: int = 0
var flipped: bool = false

var passed: int = 0
var failed: int = 0


func _ready() -> void:
	var ground := StaticBody3D.new()
	var shape := CollisionShape3D.new()
	var box := BoxShape3D.new()
	box.size = Vector3(4000, 1, 4000)
	shape.shape = box
	shape.position.y = -0.5
	ground.add_child(shape)
	add_child(ground)

	car = ProtoCar3D.create("scavenger", Color(0.6, 0.2, 0.1))
	car.position = Vector3(0, 1.2, 0)
	car.use_player_input = false
	car.is_active = true
	add_child(car)
	print("SIM: start")


func _check(name: String, ok: bool) -> void:
	if ok:
		passed += 1
		print("SIM: PASS - %s" % name)
	else:
		failed += 1
		print("SIM: FAIL - %s" % name)


func _physics_process(delta: float) -> void:
	t += delta
	phase_t += delta
	var speed := car.forward_speed
	top_speed = maxf(top_speed, speed)
	if car.global_basis.y.dot(Vector3.UP) < 0.3:
		flipped = true

	match phase:
		Phase.ACCEL:
			car.input_throttle = 1.0
			car.input_brake = 0.0
			car.input_steer = 0.0
			car.input_handbrake = false
			if t_060 < 0.0 and speed >= 26.8:
				t_060 = phase_t
				_next(Phase.TOP)
			elif phase_t > 15.0:
				_next(Phase.TOP)
		Phase.TOP:
			car.input_throttle = 1.0
			if phase_t > 8.0:
				brake_start_pos = car.global_position
				_next(Phase.BRAKE)
		Phase.BRAKE:
			car.input_throttle = 0.0
			car.input_brake = 1.0
			if speed <= 0.5:
				brake_dist = brake_start_pos.distance_to(car.global_position)
				brake_time = phase_t
				_next(Phase.STEER_PREP)
		Phase.STEER_PREP:
			car.input_brake = 0.0
			car.input_throttle = 1.0
			if speed >= 15.0:
				steer_start_yaw = car.rotation.y
				_next(Phase.STEER)
		Phase.STEER:
			car.input_throttle = 0.6
			car.input_steer = 1.0
			steer_turned = absf(wrapf(car.rotation.y - steer_start_yaw, -PI, PI))
			if phase_t > 2.5:
				car.input_steer = 0.0
				_next(Phase.HB_STRAIGHT_PREP)

		# --- Straight handbrake MUST brake (the "doesn't work unless you turn" bug) ---
		Phase.HB_STRAIGHT_PREP:
			car.input_throttle = 1.0
			car.input_steer = 0.0
			if speed >= 20.0:
				hbs_speed0 = speed
				hbs_yaw0 = car.rotation.y
				_next(Phase.HB_STRAIGHT)
		Phase.HB_STRAIGHT:
			car.input_throttle = 0.0
			car.input_steer = 0.0
			car.input_handbrake = true
			hbs_drop = hbs_speed0 - speed
			hbs_yaw_drift = maxf(hbs_yaw_drift, absf(wrapf(car.rotation.y - hbs_yaw0, -PI, PI)))
			if phase_t > 2.0:
				car.input_handbrake = false
				_check("straight handbrake BRAKES (lost %.1f m/s in 2s, want >=8)" % hbs_drop, hbs_drop >= 8.0)
				_check("straight handbrake tracks straight (drifted %.0f deg, want <20)" % rad_to_deg(hbs_yaw_drift), hbs_yaw_drift < deg_to_rad(20.0))
				_next(Phase.HB_TURN_PREP)

		# --- Handbrake TURN drifts in a controlled arc, never a 180 ---
		Phase.HB_TURN_PREP:
			car.input_throttle = 1.0
			if speed >= 18.0:
				hb_start_yaw = car.rotation.y
				_next(Phase.HB_TURN)
		Phase.HB_TURN:
			# A real drift keeps some throttle so the rear steps out instead of just stopping.
			car.input_throttle = 0.5
			car.input_steer = 1.0
			car.input_handbrake = true
			hb_turned = absf(wrapf(car.rotation.y - hb_start_yaw, -PI, PI))
			if phase_t > 1.6:
				car.input_handbrake = false
				car.input_steer = 0.0
				_check("handbrake TURN drifts a real arc 35-150 deg in 1.6s (got %.0f)" % rad_to_deg(hb_turned),
					hb_turned > deg_to_rad(35.0) and hb_turned < deg_to_rad(150.0))
				_next(Phase.HB_LONG_PREP)

		# --- LONG hold stays bounded: no runaway 360 spin-out ---
		Phase.HB_LONG_PREP:
			car.input_throttle = 1.0
			car.input_steer = 0.0
			car.input_handbrake = false
			if speed >= 22.0:
				hb_long_prev_yaw = car.rotation.y
				hb_long_total = 0.0
				hb_long_peak_rate = 0.0
				_next(Phase.HB_LONG)
		Phase.HB_LONG:
			# Powered drift held wide open for 3s — the case that used to WHIP 180.
			# It may bring you around (that's your input), but SMOOTHLY: the win is
			# a capped, controllable yaw rate, never the old 6.5 rad/s snap.
			car.input_throttle = 0.6
			car.input_steer = 1.0
			car.input_handbrake = true
			var d := absf(wrapf(car.rotation.y - hb_long_prev_yaw, -PI, PI))
			hb_long_prev_yaw = car.rotation.y
			hb_long_total += d
			hb_long_peak_rate = maxf(hb_long_peak_rate, d / delta)
			if phase_t > 3.0:
				car.input_handbrake = false
				car.input_steer = 0.0
				_check("no violent SNAP — yaw rate pinned near the cap (peak %.1f rad/s, want <2.4; raw bug whipped at 6.5)" % hb_long_peak_rate,
					hb_long_peak_rate < 2.4)
				_check("a held drift comes around smoothly, not a berserk spin (total %.0f deg over 3s, want <320)" % rad_to_deg(hb_long_total),
					hb_long_total < deg_to_rad(320.0))
				_next(Phase.SURFACE)

		# --- Surface matters: dirt grips less than road; drifting lays skid marks ---
		Phase.SURFACE:
			if phase_t < 0.05:
				car.surface_override = "road"
				surf_road_grip = car.surface_grip_mult()
				car.surface_override = "dirt"
				surf_dirt_grip = car.surface_grip_mult()
				car.surface_override = ""
				skids_after_drift = car.skid_count()
				_check("SURFACE: dirt grips less than road (road %.2f > dirt %.2f)" % [surf_road_grip, surf_dirt_grip],
					surf_road_grip > surf_dirt_grip and surf_dirt_grip > 0.4)
				_check("SKID MARKS laid during the drifts (%d on the ground)" % skids_after_drift, skids_after_drift > 0)
				_next(Phase.DONE)
		Phase.DONE:
			_report()

	if t > 70.0:
		print("SIM: TIMEOUT in phase %s" % Phase.keys()[phase])
		_report()


func _next(p: Phase) -> void:
	print("SIM: phase %s -> %s at t=%.1f (speed %.1f m/s)" % [Phase.keys()[phase], Phase.keys()[p], t, car.forward_speed])
	phase = p
	phase_t = 0.0


func _report() -> void:
	print("SIM MEASUREMENTS:")
	print("  0-60 mph:        %s" % ("%.2f s" % t_060 if t_060 > 0.0 else "NOT REACHED"))
	print("  top speed:       %.1f m/s (%.0f mph)" % [top_speed, top_speed * MPH])
	print("  60-0 braking:    %.1f m in %.2f s" % [brake_dist, brake_time])
	print("  steer @15m/s:    turned %.0f deg in 2.5 s" % rad_to_deg(steer_turned))
	print("  hb straight:     lost %.1f m/s, drifted %.0f deg" % [hbs_drop, rad_to_deg(hbs_yaw_drift)])
	print("  hb turn 1.6s:    yawed %.0f deg" % rad_to_deg(hb_turned))
	print("  hb long 3.0s:    total %.0f deg, peak %.1f rad/s" % [rad_to_deg(hb_long_total), hb_long_peak_rate])
	print("  flipped over:    %s" % ("YES - BAD" if flipped else "no"))
	print("SIM RESULTS: %d passed, %d failed" % [passed, failed])
	print("SIM: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
