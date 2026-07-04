## Headless physics proof for the PROTO-3D car. Runs the real VehicleBody3D on a
## flat plane and measures: 0-60 time, top speed, 60-0 braking distance, steering
## response, and handbrake slide. Prints SIM RESULTS and quits.
## Run: godot --headless --path game res://proto3d/tests/drive_sim.tscn
extends Node3D

enum Phase { ACCEL, TOP, BRAKE, STEER_PREP, STEER, HANDBRAKE_PREP, HANDBRAKE, DONE }

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
var hb_start_yaw: float = 0.0
var hb_turned: float = 0.0
var flipped: bool = false


func _ready() -> void:
	# Flat ground
	var ground := StaticBody3D.new()
	var shape := CollisionShape3D.new()
	var box := BoxShape3D.new()
	box.size = Vector3(4000, 1, 4000)
	shape.shape = box
	shape.position.y = -0.5
	ground.add_child(shape)
	add_child(ground)

	car = ProtoCar3D.create(Color(0.6, 0.2, 0.1))
	car.position = Vector3(0, 1.2, 0)
	car.use_player_input = false
	car.is_active = true
	add_child(car)
	print("SIM: start")


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
				_next(Phase.HANDBRAKE_PREP)
		Phase.HANDBRAKE_PREP:
			car.input_steer = 0.0
			car.input_throttle = 1.0
			if speed >= 18.0:
				hb_start_yaw = car.rotation.y
				_next(Phase.HANDBRAKE)
		Phase.HANDBRAKE:
			car.input_throttle = 0.0
			car.input_steer = 1.0
			car.input_handbrake = true
			hb_turned = absf(wrapf(car.rotation.y - hb_start_yaw, -PI, PI))
			if phase_t > 1.6:
				_next(Phase.DONE)
		Phase.DONE:
			_report()

	if t > 60.0:
		print("SIM: TIMEOUT in phase %s" % Phase.keys()[phase])
		_report()


func _next(p: Phase) -> void:
	print("SIM: phase %s -> %s at t=%.1f (speed %.1f m/s)" % [Phase.keys()[phase], Phase.keys()[p], t, car.forward_speed])
	phase = p
	phase_t = 0.0


func _report() -> void:
	print("SIM RESULTS:")
	print("  0-60 mph:        %s" % ("%.2f s" % t_060 if t_060 > 0.0 else "NOT REACHED"))
	print("  top speed:       %.1f m/s (%.0f mph)" % [top_speed, top_speed * MPH])
	print("  60-0 braking:    %.1f m in %.2f s" % [brake_dist, brake_time])
	print("  steer @15m/s:    turned %.0f deg in 2.5 s" % rad_to_deg(steer_turned))
	print("  handbrake slide: yawed %.0f deg in 1.6 s" % rad_to_deg(hb_turned))
	print("  flipped over:    %s" % ("YES - BAD" if flipped else "no"))
	get_tree().quit()
