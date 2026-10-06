class_name ProtoFlightDriver
extends Node
## Bounded force flight. A failed motor is allowed to fall; neither this driver
## nor passenger release turns off gravity, collisions, or the impact pipeline.
signal arrived
signal failed(reason: String)
var car: ProtoTransitVehicle
var origin: Vector3
var destination: Vector3
var target: Vector3
var speed: float = 28.0
var running: bool = false
var phase: String = "boarding"
var voluntary: bool = false
var failure: String = ""
var holding: bool = false
var applied_thrust: float = 0.0
var _hold: Vector3
var _retry: float = 0.0
var _rotor_main: Node3D
var _rotor_tail: Node3D

func setup(vehicle: ProtoTransitVehicle, from: Vector3, to: Vector3, cruise: float) -> void:
	car = vehicle
	origin = from
	destination = to
	target = to
	speed = cruise
	running = true
	phase = "takeoff"
	car.ai_driver = self
	car.is_active = true
	car.use_player_input = false
	car.can_sleep = false
	car.engine_on = true
	car.input_throttle = 0.8 # Existing component-gated fuel burn, below road burnout.
	_rotor_main = car.find_child("Rotor_main",true,false)
	_rotor_tail = car.find_child("Rotor_tail",true,false)

func request_landing() -> void:
	if running:
		voluntary = true
		_redirect()

func halt(reason: String) -> void:
	if failure.is_empty():
		failure = reason
	if running and phase != "emergency":
		_redirect()

func detach() -> void:
	running = false
	if is_instance_valid(car) and car.ai_driver == self:
		car.ai_driver = null

func _exit_tree() -> void:
	detach()

func _query(shape: Shape3D, position: Vector3) -> PhysicsShapeQueryParameters3D:
	var query := PhysicsShapeQueryParameters3D.new()
	query.shape = shape
	query.transform = Transform3D(Basis.IDENTITY,position)
	query.exclude = [car.get_rid()]
	if car.service != null:
		query.exclude.append(car.service.main.player.get_rid())
	return query

func pad_clear(pad: Vector3) -> bool:
	var box := BoxShape3D.new()
	box.size = Vector3(11,29,11)
	var query := _query(box,pad+Vector3.UP*14.7)
	return car.get_world_3d().direct_space_state.intersect_shape(query).is_empty()

func _redirect() -> void:
	phase = "emergency"
	var pads: Array[Vector3] = [origin,destination]
	pads.sort_custom(func(a: Vector3,b: Vector3) -> bool: return car.global_position.distance_squared_to(a)<car.global_position.distance_squared_to(b))
	for pad: Vector3 in pads:
		if pad_clear(pad):
			target = pad
			holding = false
			return
	holding = true
	_hold = car.global_position

func _forward_clear(direction: Vector3) -> bool:
	if direction.length()<0.1:
		return true
	var box := BoxShape3D.new()
	box.size = Vector3(9,4,9)
	var query := _query(box,car.global_position+Vector3.UP*1.8)
	query.motion = direction.normalized()*35.0
	var result: PackedFloat32Array = car.get_world_3d().direct_space_state.cast_motion(query)
	return result.is_empty() or result[0]>=0.999

func _weather_bad() -> bool:
	return car.service != null and car.service.flight_grounded(origin,destination)

func _physics_process(delta: float) -> void:
	if not running or not is_instance_valid(car):
		return
	var power: float = car.flight_power()
	if is_instance_valid(_rotor_main):
		_rotor_main.rotate_object_local(Vector3.UP,42.0*power*delta)
	if is_instance_valid(_rotor_tail):
		_rotor_tail.rotate_object_local(Vector3.RIGHT,64.0*power*delta)
	if failure.is_empty() and (car.dead or power<0.99):
		halt("Aircraft power reduced" if power>0 else "Aircraft power lost")
	if failure.is_empty() and _weather_bad():
		halt("Weather grounded service")
	var position: Vector3 = car.global_position
	var horizontal: Vector3 = target-position
	horizontal.y = 0.0
	var distance: float = horizontal.length()
	var ground: float = ProtoWorldBuilder.ground_y(position.x,position.z)
	var desired: Vector3 = Vector3.ZERO
	var height: float = ground+25.0
	if phase == "takeoff":
		if position.y-ground>=23.0:
			phase = "cruise"
	elif holding:
		_retry -= delta
		if _retry<=0.0:
			_retry = 1.0
			_redirect()
		desired = (_hold-position).limit_length(3.0)
		height = _hold.y
	else:
		if distance<60 and phase=="cruise":
			phase = "approach"
		if distance<0.5 and Vector2(car.linear_velocity.x,car.linear_velocity.z).length()<0.5:
			if not pad_clear(target):
				halt("Landing pad obstructed")
			else:
				phase = "landing"
		if phase == "landing":
			height = target.y-0.15 # Small real downward demand settles both skids.
			desired = horizontal*1.2
		else:
			desired = horizontal.normalized()*minf(speed,sqrt(maxf(0.0,8.0*(distance-0.1))))
			if not _forward_clear(horizontal):
				halt("Flight path obstructed")
				desired = Vector3.ZERO
	desired.y = clampf((height-position.y)*1.2,-3.0,5.0)
	if phase=="landing" and position.y-target.y<2.0:
		desired.y = maxf(desired.y,-0.65)
	var acceleration: Vector3 = ((desired-car.linear_velocity)*3.0).limit_length(7.0)
	var thrust: Vector3 = (acceleration+Vector3.UP*9.8).limit_length(18.0*power)
	applied_thrust = thrust.length()*car.mass
	car.apply_central_force(thrust*car.mass)
	# World-up attitude and heading are torque targets, never basis assignments.
	var yaw_error: float = 0.0
	if horizontal.length()>3.0:
		yaw_error = (-car.global_basis.z).signed_angle_to(horizontal.normalized(),Vector3.UP)
	var upright: Vector3 = car.global_basis.y.cross(Vector3.UP)
	car.apply_torque((upright*12.0+Vector3.UP*yaw_error*3.0-car.angular_velocity*8.0)*car.mass*power)
	if car.grounded() and car.linear_velocity.length()<0.1 and car.angular_velocity.length()<0.2 and (phase=="landing" or power<=0.0):
		running = false
		phase = "stopped"
		car.input_throttle = 0.0
		car.is_active = false
		car.engine_on = false
		if failure.is_empty():
			arrived.emit()
		else:
			failed.emit(failure)
