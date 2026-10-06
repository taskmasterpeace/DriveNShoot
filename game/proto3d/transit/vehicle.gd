class_name ProtoTransitVehicle
extends ProtoCar3D
## Authored bodies share the car factory/damage/container contract. Route and
## flight forces belong to service drivers, not this physical/attachment layer.
var service: Node = null
var service_kind: String = ""
var doors_open: bool = false
var _door: Node3D
var _door_closed: Transform3D
var _door_tween: Tween
var _door_target: bool = false
var _door_collisions: Array[CollisionShape3D] = []
var _roof: MeshInstance3D
var _roof_faded_materials: Array[Material] = []

func is_service_aircraft() -> bool:
	return service_kind == "helicopter"

func ground_forces_enabled() -> bool:
	return not is_service_aircraft() or grounded()

func grounded() -> bool:
	if not is_inside_tree() or global_basis.y.dot(Vector3.UP) < 0.9:
		return false
	for x: float in [-0.94,0.94]:
		var from: Vector3 = to_global(Vector3(x,0.16,0.15))
		var query := PhysicsRayQueryParameters3D.create(from,from+Vector3.DOWN*0.24)
		query.exclude = [get_rid()]
		var hit: Dictionary = get_world_3d().direct_space_state.intersect_ray(query)
		if hit.is_empty() or (hit.normal as Vector3).dot(Vector3.UP)<0.8:
			return false
	return true

func flight_power() -> float:
	if dead or not engine_on or fuel<=0.0 or components.battery.tier()==Damageable.Tier.BROKEN:
		return 0.0
	return TIER_ENGINE_MULT[components.engine.tier()] * (0.12 if misfiring else 1.0)

func carries_character(body: Node3D) -> bool:
	return service != null and service.is_riding() and service.main.active_car == self and body == service.main.player

func inactive_brake_force() -> float:
	var idle: float = super.inactive_brake_force()
	if not dead or service == null or not service.offline() or service.vehicles.get("lastline_coach") != self:
		return idle
	if not is_instance_valid(ai_driver) or not ai_driver is ProtoCoachDriver or service._driver != ai_driver or not ai_driver.running:
		return idle
	# The dead-body early return still forbids propulsion. Consume the service
	# driver's demand through actual wheel brakes, including its final parking
	# demand; never use the ordinary handbrake's low-speed velocity shortcut.
	var demand: float = maxf(clampf(input_brake,0.0,1.0),float(input_handbrake))
	return maxf(idle,demand*max_brake*float(current_handling()["brake"]))

func interact_prompt(_main: Node) -> String:
	if service != null and service.can_board():
		return "E / Y/△ — Board "+display_name+" with reserved ticket"
	return "E / Y/△ — "+display_name+" ticket board" if service != null and not is_active and not dead else ""

func interact_position() -> Vector3:
	return anchor_world("Boarding") if service != null else super.interact_position()

func interact(_main: Node) -> void:
	if service != null:
		service.panel.open(service.stop_for(service_kind))

static func make(kind: String) -> ProtoTransitVehicle:
	if kind not in ["coach", "helicopter"]:
		return null
	DrivnData.ensure()
	var car := ProtoTransitVehicle.new()
	car.service_kind = kind
	ProtoCar3D.create("lastline_coach" if kind == "coach" else "kestrel_courier", Color.WHITE, car)
	car.use_player_input = false
	car._door = car.find_child("Door_passenger", true, false)
	car._door_closed = car._door.transform
	car._roof = car.find_child("Roof_coach" if kind == "coach" else "Roof_cabin", true, false)
	for child: Node in car.get_children():
		if child is CollisionShape3D and child.get_meta("transit_door", false):
			car._door_collisions.append(child)
	return car

func anchor_world(anchor_name: String) -> Vector3:
	var anchor: Node3D = find_child(anchor_name, true, false)
	return anchor.global_position if anchor != null else global_position

func passenger_anchor(seat: int) -> Node3D:
	if seat < 0 or seat >= int(spec.get("passenger_seats", 0)):
		return null
	return find_child("Seat_passenger_%02d" % (seat + 1), true, false) as Node3D

func set_door_open(open: bool) -> void:
	if _door == null or (_door_target == open and is_instance_valid(_door_tween) and _door_tween.is_running()):
		return
	if _door_target == open and doors_open == open:
		return
	_door_target = open
	doors_open = false # Neither opening nor closing permits passenger release.
	if is_instance_valid(_door_tween):
		_door_tween.kill()
	for shape: CollisionShape3D in _door_collisions:
		shape.set_deferred("disabled", false)
	_door_tween = create_tween().set_process_mode(Tween.TWEEN_PROCESS_PHYSICS)
	_door_tween.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	if service_kind == "coach":
		var target: Basis = Basis(Vector3.UP, -PI * 0.52) * _door_closed.basis if open else _door_closed.basis
		_door_tween.tween_property(_door, "basis", target, 0.6)
	else:
		_door_tween.tween_property(_door, "position", _door_closed.origin + (Vector3(0.10, 0, 1.45) if open else Vector3.ZERO), 0.6)
	_door_tween.finished.connect(func() -> void:
		doors_open = open
		for shape: CollisionShape3D in _door_collisions:
			shape.set_deferred("disabled", open))

func set_cabin_roof_faded(faded: bool) -> void:
	if _roof == null:
		return
	# GeometryInstance3D.transparency is ignored by Compatibility. Unique alpha
	# materials work there too and never alter the shared imported exterior art.
	if faded and _roof_faded_materials.is_empty():
		for i: int in _roof.mesh.get_surface_count():
			var material: BaseMaterial3D = _roof.mesh.surface_get_material(i).duplicate() as BaseMaterial3D
			material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
			material.albedo_color.a *= 0.04
			_roof_faded_materials.append(material)
	for i: int in _roof.mesh.get_surface_count():
		_roof.set_surface_override_material(i, _roof_faded_materials[i] if faded else null)
	_roof.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF if faded else GeometryInstance3D.SHADOW_CASTING_SETTING_ON

func can_disembark() -> bool:
	if not doors_open or linear_velocity.length() >= 0.5 or angular_velocity.length() >= 0.2:
		return false
	if service_kind != "helicopter":
		return global_basis.y.dot(Vector3.UP) > 0.9 and _all_wheels.filter(func(w: VehicleWheel3D) -> bool: return w.is_in_contact()).size() >= 2
	return grounded()

func doors_closed() -> bool:
	return not _door_target and not doors_open and (not is_instance_valid(_door_tween) or not _door_tween.is_running())
