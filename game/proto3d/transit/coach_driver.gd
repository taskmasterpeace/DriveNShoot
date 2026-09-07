class_name ProtoCoachDriver
extends Node
## Pure-pursuit controller over a physical route. Never writes body transforms
## or velocities; a blocked road is a failed service, not a teleport opportunity.
signal arrived
signal failed(reason: String)
var car: ProtoTransitVehicle
var points: PackedVector3Array
var speed: float = 12.0
var running: bool = false
var index: int = 0
var obstruction_seconds: float = 0.0
var blocked: bool = false
var obstacle_path: String = ""
var _failure: String = ""

func setup(vehicle: ProtoTransitVehicle, route: PackedVector3Array, cruise: float) -> void:
	car = vehicle
	points = route.duplicate()
	speed = cruise
	index = 0
	running = points.size() >= 2
	car.use_player_input = false
	car.is_active = running
	car.engine_on = running
	car.can_sleep = false
	car.ai_driver = self

func halt(reason: String) -> void:
	_failure = reason

func _physics_process(delta: float) -> void:
	if not running or not is_instance_valid(car):
		return
	var velocity: float = Vector2(car.linear_velocity.x, car.linear_velocity.z).length()
	var position: Vector3 = car.global_position
	var final: Vector3 = points[points.size() - 1]
	var final_distance: float = Vector2(position.x-final.x,position.z-final.z).length()
	if car.dead:
		_failure = "Vehicle disabled"
	if not _failure.is_empty() or (index >= points.size()-2 and final_distance < 1.5):
		_brake_to_park(velocity)
		if velocity < 0.1:
			running = false
			if _failure.is_empty():
				arrived.emit()
			else:
				failed.emit(_failure)
		return
	var lookahead: float = clampf(3.0 + velocity * 0.5, 3.0, 9.0)
	while index < points.size()-2:
		var end: Vector3 = points[index+1]
		var segment: Vector3 = end-points[index]
		segment.y = 0.0
		var delta_end: Vector3 = position-end
		delta_end.y = 0.0
		if delta_end.dot(segment) >= 0.0 or delta_end.length() < 2.5:
			index += 1
		else:
			break
	var target: Vector3 = _lookahead(position, lookahead)
	var to_target: Vector3 = target-position
	to_target.y = 0.0
	var forward: Vector3 = -car.global_basis.z
	forward.y = 0.0
	var angle: float = forward.normalized().signed_angle_to(to_target.normalized(),Vector3.UP)
	# Wheelbase 4.65m from authored axles; lookahead reacts continuously to speed.
	var wheel_angle: float = atan2(2.0 * 4.65 * sin(angle),maxf(1.0,to_target.length()))
	car.input_steer = clampf(wheel_angle / maxf(0.1,car.max_steer),-1.0,1.0)
	var desired: float = minf(speed, 4.0 / maxf(0.25,absf(angle)))
	var curvature: float = absf(2.0*sin(angle)/maxf(1.0,to_target.length()))
	if curvature > 0.001:
		desired = minf(desired,sqrt(2.4/curvature))
	if index >= points.size()-2:
		desired = minf(desired,sqrt(maxf(0.0,2.0*2.0*(final_distance-1.0))))
	blocked = _obstacle(velocity)
	if blocked:
		desired = 0.0
		obstruction_seconds += delta
		if obstruction_seconds > 12.0:
			_failure = "Road obstructed"
	else:
		obstruction_seconds = 0.0
	if desired <= 0.0:
		_brake_to_park(velocity)
	else:
		car.is_active = true
		car.input_handbrake = false
		car.input_throttle = clampf((desired-velocity)*0.35,0.0,1.0)
		car.input_brake = clampf((velocity-desired)*0.35,0.0,0.6) if velocity > 1.0 else 0.0

func _brake_to_park(velocity: float) -> void:
	car.input_throttle = 0.0
	car.input_brake = 0.7 if velocity > 1.0 else 0.0
	car.input_handbrake = velocity >= 0.1 and velocity <= 1.0
	car.is_active = velocity >= 0.1
	if velocity < 0.1:
		car.input_steer = 0.0
		car.engine_on = false

func _lookahead(position: Vector3, distance: float) -> Vector3:
	var begin: Vector3 = Geometry3D.get_closest_point_to_segment(position,points[index],points[index+1])
	for i: int in range(index,points.size()-1):
		var end: Vector3 = points[i+1]
		var length: float = begin.distance_to(end)
		if length >= distance:
			return begin.lerp(end,distance/maxf(length,0.001))
		distance -= length
		begin = end
	return points[points.size()-1]

func _obstacle(velocity: float) -> bool:
	var reach: float = 3.5 + velocity * 0.8 + velocity * velocity / 6.0
	var forward: Vector3 = -car.global_basis.z
	for lateral: float in [-1.15,0.0,1.15]:
		var from: Vector3 = car.to_global(Vector3(lateral,1.0,-4.5))
		var ray := PhysicsRayQueryParameters3D.create(from,from+forward*reach)
		ray.exclude = [car.get_rid()]
		var hit: Dictionary = car.get_world_3d().direct_space_state.intersect_ray(ray)
		if not hit.is_empty():
			var body: Node = hit.collider
			obstacle_path = String(body.get_path())
			var details: Array = []
			for node: Node in [body,body.get_parent(),body.get_parent().get_parent()]:
				details.append({"name":node.name,"groups":node.get_groups(),"meta":node.get_meta_list(),"script":str(node.get_script()),"position":str(node.global_position) if node is Node3D else ""})
			obstacle_path += " " + JSON.stringify(details)
			return true
	obstacle_path = ""
	# Predict crossing vehicles before they enter the narrow forward beam. Use
	# the intended rolling velocity while waiting, so a stop does not immediately
	# clear its own yield condition and lurch into the approaching traffic.
	var own_velocity: Vector3 = forward*maxf(velocity,4.0)
	own_velocity.y = 0.0
	for node: Node in get_tree().get_nodes_in_group("interactable"):
		if not node is ProtoCar3D or node == car:
			continue
		var other := node as ProtoCar3D
		var other_velocity: Vector3 = other.linear_velocity
		other_velocity.y = 0.0
		if other_velocity.length()<1.0 or absf(other_velocity.normalized().dot(forward))>0.75:
			continue
		var offset: Vector3 = other.global_position-car.global_position
		offset.y = 0.0
		if offset.dot(forward)<-2.0 or offset.length()>35.0:
			continue
		var relative: Vector3 = other_velocity-own_velocity
		var time: float = -offset.dot(relative)/maxf(0.1,relative.length_squared())
		if time>0.0 and time<3.5 and (offset+relative*time).length()<6.0:
			obstacle_path = "cross traffic: "+String(other.get_path())
			return true
	return false
