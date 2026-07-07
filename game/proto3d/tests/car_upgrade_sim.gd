## THE CAR UPGRADE PASS proof (owner ask 2026-07-07): night halo + brake-glow +
## reverse light, the skid LOOP (not a one-shot), two-rate steering, burnout,
## tire puncture (6th damage part, round-tripped), and the window rebuild
## (windshield forward, sides + rear glass, tinted, motorcycles skip).
## Run: godot --headless --path game res://proto3d/tests/car_upgrade_sim.tscn
extends Node

var main: Node3D
var car: ProtoCar3D
var t: float = 0.0
var phase: int = 0
var phase_t: float = 0.0
var passed: int = 0
var failed: int = 0
var _step: int = 0
var _prev_time_scale: float = 1.0

# Section (e) samples steering both directions across several frames — a
# Dictionary wrapper so the lambda-captured counters survive by REFERENCE
# (GDScript lambdas capture int/bool/float BY VALUE, not by reference).
var _steer_probe := {"building": [], "returning": []}


func _check(name: String, ok: bool) -> void:
	if ok:
		passed += 1
		print("CUP: PASS - %s" % name)
	else:
		failed += 1
		print("CUP: FAIL - %s" % name)


func _next() -> void:
	phase += 1
	phase_t = 0.0
	_step = 0


func _ready() -> void:
	_prev_time_scale = Engine.time_scale
	print("CUP: start")
	get_tree().create_timer(70.0).timeout.connect(func() -> void:
		print("CUP: WATCHDOG")
		print("CUP RESULTS: %d passed, %d failed" % [passed, failed])
		print("CUP: FAILURES PRESENT")
		Engine.time_scale = _prev_time_scale
		get_tree().quit(1))
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 8:
		await get_tree().process_frame
	print("CUP: scene up")


func _physics_process(delta: float) -> void:
	if main == null or not is_instance_valid(main):
		return
	t += delta
	phase_t += delta
	match phase:
		0: # take direct control of the starting car
			if phase_t > 0.4:
				car = main.cars[0]
				car.use_player_input = false
				car.input_throttle = 0.0
				car.input_brake = 0.0
				car.input_handbrake = false
				car.input_steer = 0.0
				_next()

		# --- (a) NIGHT + HEADLIGHTS -> HALO ON w/ row-configured range; DAY -> OFF ---
		1:
			if _step == 0:
				_step = 1
				main.daynight.hour = 2.0 # deep night
				car.set_headlights(true)
			elif phase_t > 0.3:
				_check("night + headlights -> halo exists", car._halo != null)
				_check("halo is visible", car._halo != null and car._halo.visible)
				var halo_row: Dictionary = (car.spec.get("lights", {}) as Dictionary).get("halo", {})
				var want_range: float = float(halo_row.get("range", 9.0))
				_check("halo range reads the ROW (%.1fm)" % car._halo.omni_range, absf(car._halo.omni_range - want_range) < 0.01)
				main.daynight.hour = 12.0 # noon
				car.set_headlights(false)
				_next()
		2:
			if phase_t > 0.3:
				_check("day / lights off -> halo OFF", not car._halo.visible)
				car.set_headlights(true) # leave lit for later phases (reverse light needs no gate)
				_next()

		# --- (b) BRAKE INPUT -> tail emission jumps + red pulse; released -> idle ---
		3:
			if _step == 0:
				_step = 1
				_check("tail materials built (per-instance)", car._tail_mats.size() == 2)
				car.input_brake = 1.0
			elif phase_t > 0.3:
				var e0: float = (car._tail_mats[0] as StandardMaterial3D).emission_energy_multiplier
				_check("brake input -> tail emission jumps (%.2f)" % e0, e0 > 2.0)
				_check("brake -> a red pulse light exists", car._brake_light != null and car._brake_light.visible)
				car.input_brake = 0.0
				_next()
		4:
			if phase_t > 0.3:
				var e1: float = (car._tail_mats[0] as StandardMaterial3D).emission_energy_multiplier
				_check("released -> tail back to idle (%.2f)" % e1, e1 < 1.6)
				_check("released -> brake pulse off", car._brake_light == null or not car._brake_light.visible)
				_next()

		# --- (c) REVERSING -> white box + SpotLight3D ON; forward -> OFF -------------
		5:
			if _step == 0:
				_step = 1
				car.input_throttle = 0.0
				car.linear_velocity = Vector3.ZERO
				car.angular_velocity = Vector3.ZERO
				car.input_brake = 1.0 # reverse-throttle path (forward_speed starts at 0)
			elif phase_t > 2.5 and absf(car.forward_speed) > 0.5:
				_check("moving backward (%.2f m/s, +Z is BACKWARD)" % car.forward_speed, car.forward_speed < -0.5)
				_next()
			elif phase_t > 6.0:
				_check("moving backward under reverse input", false)
				_next()
		6:
			if phase_t > 0.3:
				var rg := car._reverse_glows[0] as MeshInstance3D
				var rmat := rg.material_override as StandardMaterial3D
				_check("reversing -> white glow box lit (%.2f)" % rmat.emission_energy_multiplier, rmat.emission_energy_multiplier > 0.0)
				_check("reversing -> backward SpotLight3D lit", car._reverse_light != null and car._reverse_light.light_energy > 0.0)
				car.input_brake = 0.0
				car.input_throttle = 1.0 # drive forward again to clear reverse state
				_next()
		7:
			if phase_t > 1.5 and car.forward_speed < -0.1:
				# still reversing (heavy rig / momentum) — keep waiting a beat
				pass
			elif phase_t > 1.5:
				var rg := car._reverse_glows[0] as MeshInstance3D
				var rmat := rg.material_override as StandardMaterial3D
				_check("driving forward -> reverse glow OFF (%.2f)" % rmat.emission_energy_multiplier, rmat.emission_energy_multiplier <= 0.0)
				_check("driving forward -> backward SpotLight3D OFF", car._reverse_light.light_energy <= 0.0)
				car.input_throttle = 0.0
				car.linear_velocity = Vector3.ZERO
				car.angular_velocity = Vector3.ZERO
				_next()
			elif phase_t > 8.0:
				_check("driving forward -> reverse OFF", false)
				_next()

		# --- (d) FORCED WHEEL-SLIP (handbrake drift) -> skid player playing; -------
		#     gripped -> stopped
		8:
			if _step == 0:
				_step = 1
				car.global_position = car.global_position # keep pose, just launch it
				car.linear_velocity = -car.global_basis.z * 9.0 # already moving fwd at speed
				car.input_throttle = 1.0
				car.input_handbrake = true
			elif phase_t > 1.2:
				_check("handbrake drift at speed -> is_skidding", car.is_skidding)
				_check("...and a skid player is attached + playing", car._skid_player != null and car._skid_player.playing)
				car.input_handbrake = false
				_next()
		9:
			if phase_t > 0.2 and _step == 0:
				_step = 1
				car.linear_velocity = Vector3.ZERO
				car.angular_velocity = Vector3.ZERO
				car.input_throttle = 0.0
			elif phase_t > 1.0:
				_check("grip restored (parked) -> is_skidding false", not car.is_skidding)
				_check("...and the loop stopped", car._skid_player == null or not car._skid_player.playing)
				_next()

		# --- (e) STEER RETURNS TO CENTER FASTER THAN IT BUILDS -----------------------
		# Split across THREE clean phases (no same-frame branch timing ambiguity):
		# 10 = wind steering UP from center, sampling every frame; 11 = release and
		# sample the return; 12 = compare the two rates.
		10:
			if _step == 0:
				_step = 1
				car.linear_velocity = Vector3.ZERO
				car.angular_velocity = Vector3.ZERO
				car.steering = 0.0
				car.input_steer = 1.0 # winding UP from center
			else:
				(_steer_probe["building"] as Array).append(absf(car.steering))
				if phase_t > 0.5:
					_next()
		11:
			if _step == 0:
				_step = 1
				car.input_steer = 0.0 # release -> should RETURN faster than it built
			else:
				(_steer_probe["returning"] as Array).append(absf(car.steering))
				if phase_t > 0.5:
					_next()
		12:
			var build_arr: Array = _steer_probe["building"]
			var ret_arr: Array = _steer_probe["returning"]
			_check("steer BUILDS toward lock (%.4f -> %.4f)" % [build_arr[0] if build_arr.size() > 0 else 0.0, build_arr[-1] if build_arr.size() > 0 else 0.0],
				build_arr.size() > 1 and build_arr[-1] > build_arr[0])
			_check("steer RETURNS toward center (%.4f -> %.4f)" % [ret_arr[0] if ret_arr.size() > 0 else 0.0, ret_arr[-1] if ret_arr.size() > 0 else 0.0],
				ret_arr.size() > 1 and ret_arr[-1] < ret_arr[0])
			# TIME-TO-TARGET, not a whole-window average slope: both series PLATEAU
			# once they reach their target (move_toward clamps there), and that
			# trailing flat stretch dilutes an average-slope comparison even though
			# steer_return_speed > steer_speed is exactly true — count frames until
			# each series gets within 2% of its target instead.
			var lock_val: float = build_arr.max() if build_arr.size() > 0 else 0.0
			var frames_to_build := build_arr.size()
			for i in build_arr.size():
				if build_arr[i] >= lock_val * 0.98:
					frames_to_build = i + 1
					break
			var frames_to_return := ret_arr.size()
			for i in ret_arr.size():
				if ret_arr[i] <= lock_val * 0.02:
					frames_to_return = i + 1
					break
			_check("...and RETURNS to center in FEWER frames than it took to BUILD to lock (%d frames to build vs %d frames to return)" % [frames_to_build, frames_to_return],
				frames_to_return < frames_to_build)
			_check("steer_return_speed is configured faster than steer_speed (%.1f > %.1f)" % [car.steer_return_speed, car.steer_speed], car.steer_return_speed > car.steer_speed)
			_next()

		# --- (f) BURNOUT STATE AT THROTTLE+STANDSTILL --------------------------------
		13:
			if _step == 0:
				_step = 1
				car.linear_velocity = Vector3.ZERO
				car.angular_velocity = Vector3.ZERO
				car.input_steer = 0.0
				car.input_throttle = 1.0
			elif phase_t > 0.3:
				_check("full throttle at standstill -> is_burnout", car.is_burnout)
				var rear0: VehicleWheel3D = car._rear_wheels[0]
				_check("burnout drops rear grip (%.2f < baseline %.2f)" % [rear0.wheel_friction_slip, car.grip_rear], rear0.wheel_friction_slip < car.grip_rear * 0.9)
				_next()
		14: # let it accelerate PAST burnout_speed_max and confirm it clears
			if phase_t > 3.0 or absf(car.forward_speed) > car.burnout_speed_max + 1.0:
				_check("speed climbs past burnout_speed_max -> is_burnout clears", not car.is_burnout)
				car.input_throttle = 0.0
				car.linear_velocity = Vector3.ZERO
				car.angular_velocity = Vector3.ZERO
				_next()

		# --- (g) PUNCTURE: radius shrunk, top speed penalized, round-trips ----------
		15:
			if _step == 0:
				_step = 1
				var before_radius: float = car._all_wheels[0].wheel_radius
				car.puncture_tire(0)
				var after_radius: float = car._all_wheels[0].wheel_radius
				_check("puncture_tire(0) shrinks that wheel's radius (%.3f -> %.3f)" % [before_radius, after_radius],
					absf(after_radius - before_radius * ProtoCar3D.PUNCTURE_RADIUS_MULT) < 0.001)
				_check("any_punctured() is true", car.any_punctured())
			elif phase_t > 0.2:
				_next()
		16: # top-speed penalty: drive it out and confirm eff_top is taxed
			if _step == 0:
				_step = 1
				car.input_throttle = 1.0
				car.input_steer = 0.0
			elif phase_t > 6.0:
				var v: float = absf(car.forward_speed)
				var taxed_ceiling: float = car.top_speed * ProtoCar3D.PUNCTURE_TOP_SPEED_MULT
				_check("a flat taxes top speed (%.1f m/s, under taxed ceiling %.1f, full %.1f)" % [v, taxed_ceiling, car.top_speed],
					v < taxed_ceiling + 1.5)
				_next()
		17: # ROUND-TRIP: snapshot -> mutate -> restore -> exact match
			if phase_t > 0.2:
				car.components["engine"].hp = 41.0
				car.components["chassis"].hp = 77.0
				car.fuel = 62.5
				var snap: Dictionary = car.snapshot_damage()
				_check("snapshot captured the puncture (%s)" % str(snap.get("punctured", [])), bool((snap["punctured"] as Array)[0]))
				# Mutate everything away from the snapshot...
				car.components["engine"].hp = 100.0
				car.components["chassis"].hp = 100.0
				car.fuel = 100.0
				car.repair_puncture(0)
				_check("repaired -> any_punctured() false", not car.any_punctured())
				# ...then restore and prove the round trip, part by part.
				car.restore_damage(snap)
				_check("restore -> engine hp exact (%.1f)" % car.components["engine"].hp, absf(car.components["engine"].hp - 41.0) < 0.01)
				_check("restore -> chassis hp exact (%.1f)" % car.components["chassis"].hp, absf(car.components["chassis"].hp - 77.0) < 0.01)
				_check("restore -> fuel exact (%.1f)" % car.fuel, absf(car.fuel - 62.5) < 0.01)
				_check("restore -> puncture flag round-tripped back ON", car.any_punctured())
				var after_radius: float = car._all_wheels[0].wheel_radius
				_check("restore -> puncture radius re-applied", after_radius < car._wheel_base_radius[0] - 0.001)
				car.repair_puncture(0)
				_next()

		# --- (h) WINDOWS: windshield sits FORWARD (-Z); sides exist; moto has none ---
		18:
			if phase_t > 0.2:
				# Build a fresh cab car + a fresh motorcycle purely for geometry checks
				# (no need to drive them — staged construction only).
				var cab := ProtoCar3D.create("van", Color(0.5, 0.5, 0.55))
				add_child(cab)
				# Compare against the ROW's cabin_pos.z, not world zero — a cab-forward
				# vehicle (van/pickup/semi) pushes cabin_pos itself deep into -Z, so
				# both panes can share a negative absolute Z; what matters is which
				# side of the CABIN CENTER each one sits on.
				var cab_center_z: float = cab.spec["cabin_pos"].z
				var windshield_z := -INF
				var rear_z := INF
				var side_count := 0
				for child in cab.get_children():
					if child is MeshInstance3D and (child as MeshInstance3D).material_override != null:
						var mo := (child as MeshInstance3D).material_override
						if mo is StandardMaterial3D and (mo as StandardMaterial3D).metallic > 0.0:
							var z: float = (child as MeshInstance3D).position.z
							var box := (child as MeshInstance3D).mesh as BoxMesh
							if box.size.x > 0.5 and z < cab_center_z: # the wide pane FORWARD of cabin center
								windshield_z = z
							elif box.size.x > 0.5 and z > cab_center_z:
								rear_z = z
							elif box.size.x < 0.3:
								side_count += 1
				_check("windshield mesh sits on the cabin's FORWARD (-Z, facing()) half (z=%.2f < center %.2f)" % [windshield_z, cab_center_z],
					windshield_z < cab_center_z and windshield_z > -INF)
				_check("side windows exist on a cab vehicle (%d found)" % side_count, side_count == 2)
				_check("rear glass exists on the opposite face (z=%.2f > center %.2f)" % [rear_z, cab_center_z], rear_z > cab_center_z and rear_z < INF)
				_check("windshield sits strictly forward of the rear glass (%.2f < %.2f)" % [windshield_z, rear_z], windshield_z < rear_z)

				var moto := ProtoCar3D.create("motorcycle", Color(0.3, 0.3, 0.3))
				add_child(moto)
				var moto_glass := 0
				for child in moto.get_children():
					if child is MeshInstance3D and (child as MeshInstance3D).material_override != null:
						var mo2 := (child as MeshInstance3D).material_override
						if mo2 is StandardMaterial3D and (mo2 as StandardMaterial3D).metallic > 0.0:
							moto_glass += 1
				_check("motorcycle (two_wheel) has NO windows (%d found)" % moto_glass, moto_glass == 0)
				cab.queue_free()
				moto.queue_free()
				_next()

		# --- (i) A vehicles.json LIGHTS OVERRIDE FOLDS THROUGH -----------------------
		19:
			if phase_t > 0.2:
				var moto2 := ProtoCar3D.create("motorcycle", Color(0.2, 0.2, 0.2))
				add_child(moto2)
				var halo_row: Dictionary = (moto2.spec.get("lights", {}) as Dictionary).get("halo", {})
				_check("motorcycle row's halo.range override folds through (%.1f == 6.5)" % float(halo_row.get("range", -1.0)),
					absf(float(halo_row.get("range", -1.0)) - 6.5) < 0.01)
				_check("...halo.energy override folds through (%.2f == 0.9)" % float(halo_row.get("energy", -1.0)),
					absf(float(halo_row.get("energy", -1.0)) - 0.9) < 0.01)
				var brake_row: Dictionary = (moto2.spec.get("lights", {}) as Dictionary).get("brake", {})
				_check("...un-overridden sibling (brake) SURVIVES the deep merge (%.1f == 3.0)" % float(brake_row.get("energy_mult", -1.0)),
					absf(float(brake_row.get("energy_mult", -1.0)) - 3.0) < 0.01)
				moto2.queue_free()
				_next()

		20:
			print("CUP RESULTS: %d passed, %d failed" % [passed, failed])
			print("CUP: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
			Engine.time_scale = _prev_time_scale
			get_tree().quit(0 if failed == 0 else 1)

	if t > 65.0:
		print("CUP: TIMEOUT in phase %d" % phase)
		print("CUP RESULTS: %d passed, %d failed" % [passed, failed])
		Engine.time_scale = _prev_time_scale
		get_tree().quit(1)
