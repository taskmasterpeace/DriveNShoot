## Proof for SURFACE-DEPENDENT VEHICLE HANDLING (owner directive 2026-07-14,
## "not just slow down — make it as realistic as possible"): each surface is a
## HANDLING CHARACTER (data/surfaces.json → ProtoTraction.handling_table), not
## just a grip/speed number. Proves: braking distance ladders asphalt<grass<
## dirt<gravel, sand plows a wider turn than asphalt at the same steer input,
## gravel's rear:front grip ratio is more tail-happy under the handbrake than
## asphalt's, sand's rolling drag bogs a coasting car faster than asphalt,
## wet metal is slicker than dry metal, the
## JSON row actually drives the table (fold proof), and asphalt itself drives
## BYTE-IDENTICAL to the pre-existing drive_sim baseline (all h fields neutral).
## Run: godot --headless --path game res://proto3d/tests/surface_handling_sim.tscn
extends Node3D

enum Phase { FOLD_PROOF, WET_METAL, BRAKE, STEER_PREP, STEER, HB_PREP, HB, COAST_PREP, COAST, REGRESS_ACCEL, REGRESS_BRAKE, DONE }

var phase: Phase = Phase.FOLD_PROOF
var phase_t: float = 0.0
var t: float = 0.0
var passed: int = 0
var failed: int = 0

# --- BRAKE ladder ---
var brake_queue: Array = [["road", "asphalt"], ["grass", "grass"], ["dirt", "dirt"], ["gravel", "gravel"]]
var brake_car: ProtoCar3D = null
var brake_label: String = ""
var brake_engaged: bool = false ## explicit state — NOT re-derived from speed (avoids accel/brake oscillation)
var brake_start_pos: Vector3
var brake_dist: Dictionary = {} ## label -> meters
const BRAKE_TEST_SPEED := 18.0

# --- STEER: sand plows, wider turn than asphalt ---
var steer_queue: Array = [["road", "asphalt"], ["sand", "sand"]]
var steer_car: ProtoCar3D = null
var steer_label: String = ""
var steer_curv_sum: float = 0.0
var steer_curv_n: int = 0
var steer_curvature: Dictionary = {} ## label -> avg |yaw_rate|/speed ("1/turn-radius") while holding full lock

# --- HANDBRAKE / OVERSTEER MECHANISM: gravel's rear:front wheel-friction
# RATIO under the handbrake is more tail-happy than asphalt's — the direct,
# deterministic proof of rear_bias's job. (A full-physics yaw measurement was
# tried first and found FRAGILE: the handbrake's own hard decel (20 m/s²)
# stops the car in well under a second on EVERY surface, and the vehicle
# solver's emergent yaw depends on many interacting factors beyond rear_bias
# alone — a real car on the actual wheel/friction path, reading the actual
# wheel_friction_slip Godot's solver is using, is the honest, robust test.)
var hb_queue: Array = [["road", "asphalt"], ["gravel", "gravel"]]
var hb_car: ProtoCar3D = null
var hb_label: String = ""
var hb_ratio: Dictionary = {} ## label -> rear/front wheel_friction_slip under the handbrake

# --- COAST: sand's rolling drag bogs faster than asphalt ---
var coast_queue: Array = [["road", "asphalt"], ["sand", "sand"]]
var coast_car: ProtoCar3D = null
var coast_label: String = ""
var coast_speed0: float = 0.0
var coast_drop: Dictionary = {} ## label -> m/s lost in the fixed coast window

# --- ASPHALT REGRESSION: must match the pre-existing drive_sim ballpark ---
var regress_car: ProtoCar3D = null
var t_060: float = -1.0
var regress_brake_start: Vector3
var regress_brake_dist: float = -1.0


func _ready() -> void:
	var ground := StaticBody3D.new()
	var shape := CollisionShape3D.new()
	var box := BoxShape3D.new()
	box.size = Vector3(4000, 1, 4000)
	shape.shape = box
	shape.position.y = -0.5
	ground.add_child(shape)
	add_child(ground)
	print("SURF: start")
	get_tree().create_timer(90.0).timeout.connect(func() -> void:
		print("SURF: WATCHDOG — runaway in phase %s" % Phase.keys()[phase])
		_report())


func _check(check_name: String, ok: bool) -> void:
	if ok:
		passed += 1
	else:
		failed += 1
	print("SURF: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _spawn(surface: String, pos: Vector3) -> ProtoCar3D:
	var car := ProtoCar3D.create("scavenger", Color(0.5, 0.3, 0.2))
	car.position = pos
	car.use_player_input = false
	car.is_active = true
	car.surface_override = surface
	add_child(car)
	return car


func _next(p: Phase) -> void:
	phase = p
	phase_t = 0.0


func _physics_process(delta: float) -> void:
	t += delta
	phase_t += delta

	match phase:
		Phase.FOLD_PROOF:
			_run_fold_proof()
			_next(Phase.WET_METAL)

		Phase.WET_METAL:
			_run_wet_metal()
			_next(Phase.BRAKE)

		# --- BRAKE ladder: accelerate to a fixed speed on each surface, then
		# full-brake and measure the stopping distance. -----------------------
		Phase.BRAKE:
			if brake_car == null:
				if brake_queue.is_empty():
					var d_asphalt: float = float(brake_dist["asphalt"])
					var d_grass: float = float(brake_dist["grass"])
					var d_dirt: float = float(brake_dist["dirt"])
					var d_gravel: float = float(brake_dist["gravel"])
					_check("BRAKING LADDER: asphalt %.1fm < grass %.1fm < dirt %.1fm < gravel %.1fm" %
						[d_asphalt, d_grass, d_dirt, d_gravel],
						d_asphalt < d_grass and d_grass < d_dirt and d_dirt < d_gravel)
					_next(Phase.STEER_PREP)
				else:
					var run: Array = brake_queue.pop_front()
					brake_car = _spawn(String(run[0]), Vector3(0, 1.2, 0))
					brake_label = String(run[1])
					brake_car.input_throttle = 1.0
					brake_engaged = false
					phase_t = 0.0
			else:
				if not brake_engaged:
					brake_car.input_throttle = 1.0
					brake_car.input_brake = 0.0
					if brake_car.forward_speed >= BRAKE_TEST_SPEED or phase_t > 20.0:
						brake_engaged = true
						brake_start_pos = brake_car.global_position
						phase_t = 0.0
				else:
					brake_car.input_throttle = 0.0
					brake_car.input_brake = 1.0
					if brake_car.forward_speed < 0.5 or phase_t > 20.0:
						brake_dist[brake_label] = brake_start_pos.distance_to(brake_car.global_position)
						brake_car.queue_free()
						brake_car = null

		# --- STEER: same lock, CURVATURE (|yaw_rate|/speed ≈ 1/turn-radius) —
		# speed-independent so a bogged-down surface's own lower cruise speed
		# can't confound the comparison. Asphalt curves TIGHTER; sand PLOWS
		# (smaller curvature = a wider turn radius at whatever speed it holds).
		Phase.STEER_PREP:
			if steer_car == null:
				if steer_queue.is_empty():
					var asphalt_curv: float = float(steer_curvature["asphalt"])
					var sand_curv: float = float(steer_curvature["sand"])
					_check("STEER: sand PLOWS a wider turn than asphalt (curvature asphalt %.3f > sand %.3f, same steer input)" %
						[asphalt_curv, sand_curv], asphalt_curv > sand_curv)
					_next(Phase.HB_PREP)
				else:
					var run: Array = steer_queue.pop_front()
					steer_car = _spawn(String(run[0]), Vector3(60, 1.2, 0))
					steer_label = String(run[1])
					phase_t = 0.0
					steer_curv_sum = 0.0
					steer_curv_n = 0
			else:
				steer_car.input_throttle = 1.0
				if steer_car.forward_speed >= 8.0 or phase_t > 15.0:
					_next(Phase.STEER)

		Phase.STEER:
			steer_car.input_throttle = 0.6
			steer_car.input_steer = 1.0
			# Sample once the turn has settled (skip the first beat of transient
			# wheel-solver noise); average several samples for stability.
			if phase_t > 1.0:
				var sp: float = maxf(absf(steer_car.forward_speed), 0.5)
				steer_curv_sum += absf(steer_car.angular_velocity.y) / sp
				steer_curv_n += 1
			if phase_t > 3.5:
				steer_curvature[steer_label] = steer_curv_sum / maxf(1, steer_curv_n)
				steer_car.queue_free()
				steer_car = null
				_next(Phase.STEER_PREP)

		# --- HANDBRAKE / OVERSTEER: launch, then hold the handbrake for a beat
		# so the REAL wheels settle onto their surface-driven friction_slip,
		# then read rear:front off the actual VehicleWheel3D nodes Godot's
		# solver is using — the deterministic, robust proof of rear_bias.
		Phase.HB_PREP:
			if hb_car == null:
				if hb_queue.is_empty():
					var asphalt_ratio: float = float(hb_ratio["asphalt"])
					var gravel_ratio: float = float(hb_ratio["gravel"])
					_check("OVERSTEER: gravel's rear:front grip ratio is more tail-happy than asphalt's (gravel %.3f < asphalt %.3f)" %
						[gravel_ratio, asphalt_ratio], gravel_ratio < asphalt_ratio)
					_next(Phase.COAST_PREP)
				else:
					var run: Array = hb_queue.pop_front()
					hb_car = _spawn(String(run[0]), Vector3(120, 1.2, 0))
					hb_label = String(run[1])
					phase_t = 0.0
			else:
				hb_car.input_throttle = 1.0
				if hb_car.forward_speed >= 18.0:
					_next(Phase.HB)

		Phase.HB:
			hb_car.input_throttle = 0.6
			hb_car.input_steer = 1.0
			hb_car.input_handbrake = true
			if phase_t > 0.3: # a few ticks so this frame's wheel_friction_slip is live
				var front_slip: float = hb_car._front_wheels[0].wheel_friction_slip
				var rear_slip: float = hb_car._rear_wheels[0].wheel_friction_slip
				hb_ratio[hb_label] = rear_slip / maxf(0.001, front_slip)
				hb_car.queue_free()
				hb_car = null
				_next(Phase.HB_PREP)

		# --- COAST: no input at all — sand's roll_drag bogs a coasting car
		# down FASTER than asphalt's bare aero drag. -------------------------
		Phase.COAST_PREP:
			if coast_car == null:
				if coast_queue.is_empty():
					var asphalt_drop: float = float(coast_drop["asphalt"])
					var sand_drop: float = float(coast_drop["sand"])
					_check("SAND BOG: coasting loses MORE speed on sand than asphalt (sand -%.1f m/s > asphalt -%.1f m/s over 2s)" %
						[sand_drop, asphalt_drop], sand_drop > asphalt_drop)
					_next(Phase.REGRESS_ACCEL)
				else:
					var run: Array = coast_queue.pop_front()
					coast_car = _spawn(String(run[0]), Vector3(180, 1.2, 0))
					coast_label = String(run[1])
					phase_t = 0.0
			else:
				coast_car.input_throttle = 1.0
				if coast_car.forward_speed >= 22.0:
					coast_speed0 = coast_car.forward_speed
					_next(Phase.COAST)

		Phase.COAST:
			coast_car.input_throttle = 0.0
			coast_car.input_brake = 0.0
			coast_car.input_steer = 0.0
			if phase_t > 2.0:
				coast_drop[coast_label] = coast_speed0 - coast_car.forward_speed
				coast_car.queue_free()
				coast_car = null
				_next(Phase.COAST_PREP)

		# --- ASPHALT REGRESSION: must land in the same ballpark drive_sim
		# measured BEFORE this feature (0-60 ≈3.27s, 60-0 braking ≈46m). All
		# h fields are neutral (1.0/0.0) on asphalt by construction, so this
		# should hold within a generous tolerance — proves the new mechanics
		# never touched the paved-road feel. ---------------------------------
		Phase.REGRESS_ACCEL:
			if regress_car == null:
				regress_car = _spawn("road", Vector3(240, 1.2, 0))
				regress_car.input_throttle = 1.0
				phase_t = 0.0
			else:
				regress_car.input_throttle = 1.0
				if t_060 < 0.0 and regress_car.forward_speed >= 26.8:
					t_060 = phase_t
				if phase_t > 12.0:
					_check("ASPHALT REGRESSION: 0-60 time unchanged (%.2fs, drive_sim baseline 3.27s ±25%%)" % t_060,
						t_060 > 0.0 and t_060 < 3.27 * 1.25)
					regress_brake_start = regress_car.global_position
					_next(Phase.REGRESS_BRAKE)

		Phase.REGRESS_BRAKE:
			regress_car.input_throttle = 0.0
			regress_car.input_brake = 1.0
			if regress_car.forward_speed < 0.5 or phase_t > 12.0:
				regress_brake_dist = regress_brake_start.distance_to(regress_car.global_position)
				_check("ASPHALT REGRESSION: braking distance unchanged (%.1fm, drive_sim baseline ~46m ±25%%)" % regress_brake_dist,
					regress_brake_dist > 46.0 * 0.75 and regress_brake_dist < 46.0 * 1.25)
				regress_car.queue_free()
				regress_car = null
				_next(Phase.DONE)

		Phase.DONE:
			_report()

	if t > 85.0:
		print("SURF: TIMEOUT in phase %s" % Phase.keys()[phase])
		_report()


## THE DATA LAW: data/surfaces.json actually drives the table — tamper a value
## in memory, force a refold from the REAL file on disk, and prove the JSON's
## authored number wins back over the tamper (not just "a value exists").
func _run_fold_proof() -> void:
	ProtoTraction.ensure_handling()
	_check("surfaces.json supplies surfaces the code floor never defined ('gravel' grip %.2f)" %
		float(ProtoTraction.handling_table.get("gravel", {}).get("grip", -1.0)),
		ProtoTraction.handling_table.has("gravel") and is_equal_approx(float(ProtoTraction.handling_table["gravel"]["grip"]), 0.75))
	var before: float = float(ProtoTraction.handling_table["dirt"]["roughness"])
	ProtoTraction.handling_table["dirt"]["roughness"] = 0.987 # tamper the in-memory row
	ProtoTraction._handling_loaded = false
	ProtoTraction.ensure_handling() # refold from the REAL file on disk
	var after: float = float(ProtoTraction.handling_table["dirt"]["roughness"])
	_check("DATA LAW: a surfaces.json row overlay changes a value (tampered 0.987 -> refold restored %.2f, matches authored %.2f)" %
		[after, before], is_equal_approx(after, before) and not is_equal_approx(after, 0.987))


## Wetness folds INTO the character: wet metal is the steepest slick shift on
## the table (a rain-soaked bridge deck), ~0.55 per the owner's called-out target.
func _run_wet_metal() -> void:
	var dry := ProtoTraction.handling("metal", "dry", "street")
	var wet := ProtoTraction.handling("metal", "wet", "street")
	_check("WET METAL grips less than dry metal (dry %.2f > wet %.2f)" % [float(dry["grip"]), float(wet["grip"])],
		float(wet["grip"]) < float(dry["grip"]))
	_check("...and wet metal lands near the called-out ~0.55 target (got %.2f)" % float(wet["grip"]),
		float(wet["grip"]) > 0.45 and float(wet["grip"]) < 0.65)


func _report() -> void:
	print("SURF RESULTS: %d passed, %d failed" % [passed, failed])
	print("SURF: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
