class_name ProtoTransitService
extends Node3D
## Offline authority for one physical shuttle and the reviewed atomic ticket.
var main: Node
var catalog := ProtoTransitCatalog.new()
var state := ProtoTransitTicketState.new()
var panel: ProtoTransitPanel
var vehicles: Dictionary = {}
var stops: Dictionary = {}
var coach_stop: String = "meridian_east"
var _riding: bool = false
var _driver: ProtoCoachDriver
var _departed: bool = false
var _arrival: bool = false
var _ending_reason: String = ""
var _checkpoint_stop: String = ""
var _checkpoint_position: Variant = null
var _exit_notice: String = ""

func setup(owner: Node) -> void:
	main = owner
	catalog.setup(JSON.parse_string(FileAccess.get_file_as_string("res://data/transit.json")),main.stream.usmap)
	state.setup(catalog,main.SAVE_PATH,capture_run,_publish_wallet)
	panel = ProtoTransitPanel.new()
	panel.service = self
	add_child(panel)
	if not catalog.valid:
		return
	for id: String in catalog.stops:
		var stop := ProtoTransitStop.new()
		add_child(stop)
		stop.setup(self,id)
		stops[id] = stop
		main.waypoints.append(["LASTLINE · "+String(catalog.stops[id].name),stop])
	if (stops.meridian_east as ProtoTransitStop).safe and (stops.richmond as ProtoTransitStop).safe:
		_spawn_coach()

func _spawn_coach() -> void:
	if vehicles.has("lastline_coach"):
		return
	var car: ProtoTransitVehicle = ProtoTransitVehicle.make("coach")
	car.service = self
	var stop: ProtoTransitStop = stops[coach_stop]
	car.position = stop.bay+Vector3.UP*0.12
	car.rotation.y = stop.bay_yaw()
	add_child(car)
	vehicles["lastline_coach"] = car
	car.set_door_open(true)
	# Not in main.cars: generic car selection/hotwiring must not bypass tickets.

func offline() -> bool:
	return main.net == null or not main.net.online

func now_minutes() -> float:
	return (float(main.daynight.day)-1.0)*1440.0+float(main.daynight.hour)*60.0

func record() -> Dictionary:
	return state.record()

func fleet_record() -> Dictionary:
	return {"version":1,"coach_stop":coach_stop}

func capture_run() -> Dictionary:
	var run: Dictionary = main.capture_save()
	if not _checkpoint_stop.is_empty():
		run.transit_fleet = {"version":1,"coach_stop":_checkpoint_stop}
		var safe: Vector3 = catalog.stop_position(_checkpoint_stop)
		if _checkpoint_position is Vector3:
			safe = _checkpoint_position-Vector3.UP*0.15
		run.player.pos = [safe.x,safe.y+0.15,safe.z]
	return run

func _publish_wallet(wallet: Dictionary) -> void:
	main.backpack.slots = wallet.duplicate(true)
	main.backpack.changed.emit()

func can_open(id: String) -> bool:
	return offline() and stops.has(id) and stops[id].safe and not main.character.dead and main.mode == main.Mode.FOOT and main.player.global_position.distance_to(catalog.stop_position(id)) < 3.5

func can_reserve(id: String) -> bool:
	if not offline() or not _ending_reason.is_empty() or not catalog.services.has(id) or not vehicles.has("lastline_coach") or not state.record().ticket.is_empty():
		return false
	var row: Dictionary = catalog.services[id]
	var car: ProtoTransitVehicle = vehicles.lastline_coach
	var now: float = now_minutes()
	return row.kind == "coach" and row.origin == coach_stop and can_open(String(row.origin)) and not car.dead and car.global_position.distance_to(stops[coach_stop].bay) < 2.0 and now >= catalog.next_departure(id,now)-float(row.boarding_minutes)

func reserve(id: String) -> void:
	if not can_reserve(id):
		main.notify("LASTLINE unavailable here or outside boarding window")
		return
	var result: Dictionary = state.reserve(id,coach_stop,catalog.next_departure(id,now_minutes()),now_minutes(),int(state.record().next_serial),main.backpack.slots)
	main.notify("LASTLINE ticket reserved" if result.ok else "LASTLINE: "+String(result.code))
	if result.ok:
		main.audio.play_ui("click",-6.0)
	panel.refresh()

func can_board() -> bool:
	var ticket: Dictionary = state.record().ticket
	if ticket.is_empty() or not offline() or _riding or not vehicles.has("lastline_coach"):
		return false
	var car: ProtoTransitVehicle = vehicles.lastline_coach
	return ticket.phase == "reserved" and ticket.origin == coach_stop and can_open(coach_stop) and not car.dead and car.global_position.distance_to(stops[coach_stop].bay)<2.0 and car.can_disembark() and main.player.global_position.distance_to(car.anchor_world("Boarding")) < 3.0 and now_minutes() <= float(ticket.departure)

func board() -> void:
	if not can_board():
		main.notify("LASTLINE: approach the open boarding door")
		return
	var result: Dictionary = state.board(int(state.record().ticket.serial),main.backpack.slots)
	if not result.ok:
		main.notify("LASTLINE: "+String(result.code))
		return
	var car: ProtoTransitVehicle = vehicles.lastline_coach
	_riding = true
	_departed = false
	_arrival = false
	_ending_reason = ""
	_exit_notice = ""
	panel.close()
	main.enter_passenger(car)
	for child: Node in main.player.get_children():
		if child is CollisionShape3D:
			child.set_deferred("disabled",true)
	main.cam_rig.target = car
	main.hud.set_mode(true)
	car.set_cabin_roof_faded(true)
	main.notify("LASTLINE passenger · departs at scheduled time · driver keeps the wheel")

func cancel() -> void:
	var ticket: Dictionary = state.record().ticket
	if ticket.is_empty() or not offline() or not can_open(String(ticket.origin)):
		return
	var result: Dictionary = state.finish(int(ticket.serial),"cancelled",String(ticket.origin),main.backpack.slots)
	main.notify("LASTLINE ticket refunded" if result.ok else "LASTLINE: "+String(result.code))
	panel.refresh()

func is_riding() -> bool:
	return _riding

func passenger_status() -> String:
	var ticket: Dictionary = state.record().ticket
	if ticket.is_empty():
		return "LASTLINE"
	var destination: String = String(catalog.stops[ticket.destination].name)
	if not _ending_reason.is_empty():
		return "SERVICE STOPPED · E / Y/△ — safe roadside exit + refund"
	if _arrival:
		return destination+" · opening door / checking safe exit"
	if _departed:
		return "LASTLINE → "+destination+" · remain seated · exit at next stop"
	return "LASTLINE → %s · departs in %d min · E / Y/△ exit" % [destination,maxi(0,ceili(float(ticket.departure)-now_minutes()))]

func passenger_position() -> Vector3:
	var car: ProtoTransitVehicle = vehicles.get("lastline_coach")
	if car == null:
		return main.player.global_position
	var hips: Vector3 = (main.player.puppet.hip_l.global_position+main.player.puppet.hip_r.global_position)*0.5
	return car.passenger_anchor(0).global_position-(hips-main.player.global_position)

func pose_passenger(delta: float) -> void:
	var car: ProtoTransitVehicle = vehicles.lastline_coach
	main.player.set_armed(false)
	main.player.puppet.raised = false
	main.player.puppet.rotation.y = wrapf(car.rotation.y-main.player.rotation.y,-PI,PI)
	main.player.puppet.pose_driving(delta)
	main.player.global_position = passenger_position()

func request_exit() -> bool:
	if not _riding or not offline():
		return false
	if not _ending_reason.is_empty():
		return _finish("service_failed",coach_stop)
	if _departed and not _arrival:
		main.notify("LASTLINE: remain seated until a safe stop")
		return false
	return _finish("arrived" if _arrival else "early_exit",String(state.record().ticket.destination) if _arrival else coach_stop)

func _finish(reason: String, safe_stop: String) -> bool:
	var car: ProtoTransitVehicle = vehicles.lastline_coach
	if reason == "service_failed" and (car.linear_velocity.length() >= 0.1 or (is_instance_valid(_driver) and _driver.running)):
		_exit_notice = ""
		return false # Emergency egress waits for the real completed parking transition.
	if reason != "service_failed" and car.global_position.distance_to(stops[safe_stop].bay)>=2.0:
		return false
	if not car.can_disembark():
		_exit_notice = ""
		return false
	var exit: Variant = _clear_exit(car)
	if exit == null:
		_notify_exit_once(reason,"LASTLINE: boarding exit blocked; remain seated")
		return false
	_checkpoint_stop = safe_stop
	_checkpoint_position = exit
	var result: Dictionary = state.finish(int(state.record().ticket.serial),reason,safe_stop,main.backpack.slots)
	_checkpoint_stop = ""
	_checkpoint_position = null
	if not result.ok:
		_notify_exit_once(reason,"LASTLINE: checkpoint failed; remain safely aboard")
		return false
	coach_stop = safe_stop
	_release(exit,"arrival" if reason == "arrived" else "body_unavailable")
	main.notify("LASTLINE · "+String(catalog.stops[safe_stop].name))
	if reason == "service_failed":
		main.notify("LASTLINE interrupted · full refund · replacement at last terminal on reload")
	return true

func _notify_exit_once(reason: String, message: String) -> void:
	var key: String = reason+"|"+message
	if key != _exit_notice:
		_exit_notice = key
		main.notify(message)

func _clear_exit(car: ProtoTransitVehicle) -> Variant:
	var from: Vector3 = car.anchor_world("Exit")+Vector3.UP*1.5
	var ray := PhysicsRayQueryParameters3D.create(from,from+Vector3.DOWN*3.0)
	ray.exclude = [car.get_rid(),main.player.get_rid()]
	var hit: Dictionary = get_world_3d().direct_space_state.intersect_ray(ray)
	if hit.is_empty() or (hit.normal as Vector3).dot(Vector3.UP) < 0.85:
		return null
	var foot: Vector3 = hit.position+Vector3.UP*0.08
	var shape := CapsuleShape3D.new()
	shape.radius = 0.35
	shape.height = 1.8
	var query := PhysicsShapeQueryParameters3D.new()
	query.shape = shape
	query.transform = Transform3D(Basis.IDENTITY,foot+Vector3.UP*0.95)
	query.exclude = [car.get_rid(),main.player.get_rid()]
	return foot if get_world_3d().direct_space_state.intersect_shape(query).is_empty() else null

func _release(position: Vector3, reason: String) -> void:
	main._stop_handheld_session(reason)
	var car: ProtoTransitVehicle = vehicles.get("lastline_coach")
	if car != null:
		car.set_cabin_roof_faded(false)
	_riding = false
	_exit_notice = ""
	_departed = false
	_arrival = false
	main.passenger_of_ai = false
	main.mode = main.Mode.FOOT
	main.active_car = null
	main.player.global_position = position
	main.player.velocity = Vector3.ZERO
	main.player.process_mode = Node.PROCESS_MODE_INHERIT
	main.player.is_active = true
	main.player.visible = true
	for child: Node in main.player.get_children():
		if child is CollisionShape3D:
			child.set_deferred("disabled",false)
	main.cam_rig.target = main.player
	main.hud.set_mode(false)

func route(id: String) -> PackedVector3Array:
	var row: Dictionary = catalog.services[id]
	var westbound: bool = id == "lastline_west"
	var start: ProtoTransitStop = stops[row.origin]
	var end: ProtoTransitStop = stops[row.destination]
	var result: PackedVector3Array = start.departure(westbound)
	var road: PackedVector3Array = catalog.route_points(id)
	for i: int in range(1,road.size()-1):
		result.append(road[i])
	result.append_array(end.approach(westbound))
	return result

func duration_minutes(id: String) -> float:
	var points: PackedVector3Array = route(id)
	var length: float = 0.0
	for i: int in range(1,points.size()):
		length += points[i-1].distance_to(points[i])
	return length/float(catalog.services[id].speed_mps) # stock clock: one game minute/second.

func _physics_process(_delta: float) -> void:
	if not _riding:
		return
	var car: ProtoTransitVehicle = vehicles.lastline_coach
	if not offline():
		if _driver != null:
			_driver.halt("Offline service unavailable online")
		return # No client may commit the local authority checkpoint.
	var ticket: Dictionary = state.record().ticket
	if main.character.dead or car.dead:
		main._stop_handheld_session("body_unavailable")
		_ending_reason = "Vehicle or passenger disabled"
		car.set_door_open(true)
		if _driver != null:
			_driver.halt("Vehicle or passenger disabled")
	if not _departed and _ending_reason.is_empty() and now_minutes() >= float(ticket.departure):
		car.set_door_open(false)
		if not car.doors_closed():
			return
		_departed = true
		if is_instance_valid(_driver):
			_driver.running = false
			_driver.queue_free()
		_driver = ProtoCoachDriver.new()
		add_child(_driver)
		_driver.arrived.connect(func() -> void:
			_arrival = true
			car.set_door_open(true))
		_driver.failed.connect(func(reason: String) -> void:
			_ending_reason = reason
			car.set_door_open(true)
			main._stop_handheld_session("body_unavailable")
			main.notify("LASTLINE stopped: "+reason+" · safe roadside exit + refund"))
		_driver.setup(car,route(String(ticket.service)),float(catalog.services[ticket.service].speed_mps))
	if _arrival and car.doors_open:
		request_exit()

func valid_run(data: Dictionary) -> bool:
	if data.has("transit") and not state.valid_record(data.transit):
		return false
	if not data.has("transit_fleet"):
		return true
	var fleet: Variant = data.transit_fleet
	return fleet is Dictionary and fleet.size() == 2 and fleet.get("version") is int and fleet.version == 1 and fleet.get("coach_stop") is String and stops.has(fleet.coach_stop)

func restore_run(data: Dictionary) -> bool:
	if not offline() or not valid_run(data):
		return false
	var incoming: Dictionary = data.duplicate(true)
	var staged := ProtoTransitTicketState.new()
	staged.setup(catalog,main.SAVE_PATH,func() -> Dictionary: return incoming,func(wallet: Dictionary) -> void: incoming.player.backpack = wallet)
	if not staged.restore(incoming.get("transit",{})):
		return false
	var stop_id: String = String(incoming.get("transit_fleet",{"coach_stop":"meridian_east"}).coach_stop)
	var ticket: Dictionary = staged.record().ticket
	if not ticket.is_empty():
		if not incoming.get("player") is Dictionary or not incoming.player.get("backpack") is Dictionary:
			return false
		stop_id = String(ticket.last_safe_stop)
		var safe: Vector3 = catalog.stop_position(stop_id)
		incoming.player.pos = [safe.x,safe.y+0.15,safe.z]
		incoming.transit_fleet = {"version":1,"coach_stop":stop_id}
		var result: Dictionary = staged.finish(int(ticket.serial),"restart",stop_id,incoming.player.backpack)
		if not result.ok:
			return false
		incoming.transit = staged.record()
	# Publication starts only after successful staged recovery write.
	panel.close()
	if _riding:
		_release(catalog.stop_position(stop_id)+Vector3.UP*0.15,"body_unavailable")
	if is_instance_valid(_driver):
		_driver.running = false
		_driver.queue_free()
	_driver = null
	state.restore(staged.record())
	coach_stop = stop_id
	if vehicles.has("lastline_coach") and (vehicles.lastline_coach.dead or not _ending_reason.is_empty()):
		var wreck: Node = vehicles.lastline_coach
		remove_child(wreck)
		wreck.queue_free()
		vehicles.clear()
		_spawn_coach()
	_ending_reason = ""
	if vehicles.has("lastline_coach"):
		var car: ProtoTransitVehicle = vehicles.lastline_coach
		var stop: ProtoTransitStop = stops[stop_id]
		car.is_active = false
		car.input_throttle = 0.0
		car.input_brake = 0.0
		car.input_handbrake = false
		car.global_position = stop.bay+Vector3.UP*0.12 # Save restoration, never active journey movement.
		car.rotation.y = stop.bay_yaw()
		car.linear_velocity = Vector3.ZERO
		car.angular_velocity = Vector3.ZERO
		car.set_door_open(true)
	data.clear()
	data.merge(incoming,true)
	return true
