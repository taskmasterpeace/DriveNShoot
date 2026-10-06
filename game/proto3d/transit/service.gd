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
var helicopter_stop: String = "meridian_east"
var _riding: bool = false
var _driver: Variant = null
var _active_kind: String = "coach"
var _failed_bodies: Dictionary = {}
var _departed: bool = false
var _arrival: bool = false
var _ending_reason: String = ""
var _checkpoint_stop: String = ""
var _checkpoint_position: Variant = null
var _exit_notice: String = ""
var _checkpoint_respawn: Dictionary = {}

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
		_spawn_aircraft()

func _spawn_aircraft() -> void:
	if vehicles.has("kestrel_courier"):
		return
	var car: ProtoTransitVehicle = ProtoTransitVehicle.make("helicopter")
	car.service = self
	car.position = stops[helicopter_stop].pad+Vector3.UP*0.12
	car.rotation.y = stops[helicopter_stop].bay_yaw()
	add_child(car)
	vehicles.kestrel_courier = car
	car.set_door_open(true)

func stop_for(kind: String) -> String:
	return helicopter_stop if kind=="helicopter" else coach_stop

func vehicle_for(kind: String) -> ProtoTransitVehicle:
	return vehicles.get("kestrel_courier" if kind=="helicopter" else "lastline_coach")

func active_vehicle() -> ProtoTransitVehicle:
	return vehicle_for(_active_kind)

func service_name() -> String:
	return "KESTREL" if _active_kind=="helicopter" else "LASTLINE"

func terminal_position(kind: String, id: String) -> Vector3:
	return stops[id].pad if kind=="helicopter" else stops[id].bay

func streaming_positions() -> Array[Vector3]:
	var result: Array[Vector3] = []
	if not offline():
		return result
	for kind: String in ["coach","helicopter"]:
		var car: ProtoTransitVehicle = vehicle_for(kind)
		if not is_instance_valid(car):
			continue
		var running: bool = is_instance_valid(car.ai_driver) and car.ai_driver.running
		if running or (_failed_bodies.has(kind) and car.global_position.distance_to(terminal_position(kind,stop_for(kind)))>2.0):
			result.append(car.global_position)
	return result

func flight_grounded(from: Vector3, to: Vector3) -> bool:
	for pos: Vector3 in [from,to]:
		if main.weather.intensity_at(pos,"dust")>=0.55 or main.weather.intensity_at(pos,"rain")>=0.85:
			return true
	return false

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
	return {"version":1,"coach_stop":coach_stop,"helicopter_stop":helicopter_stop}

func capture_run() -> Dictionary:
	if not _checkpoint_respawn.is_empty():
		return _checkpoint_respawn.duplicate(true)
	var run: Dictionary = main.capture_save()
	if not _checkpoint_stop.is_empty():
		run.transit_fleet = fleet_record()
		run.transit_fleet["helicopter_stop" if _active_kind=="helicopter" else "coach_stop"] = _checkpoint_stop
		var safe: Vector3 = catalog.stop_position(_checkpoint_stop)
		if _checkpoint_position is Vector3:
			safe = _checkpoint_position-Vector3.UP*0.15
		run.player.pos = [safe.x,safe.y+0.15,safe.z]
	return run

func _publish_wallet(wallet: Dictionary) -> void:
	main.backpack.slots = wallet.duplicate(true)
	main.backpack.changed.emit()

func can_open(id: String) -> bool:
	return _eligible_at_stop(id) and main.player.global_position.distance_to(catalog.stop_position(id)) < 3.5

func _eligible_at_stop(id: String) -> bool:
	return offline() and stops.has(id) and stops[id].safe and not main.character.dead and main.mode == main.Mode.FOOT

func can_access_panel(id: String) -> bool:
	return can_open(id) or (id == stop_for(_active_kind) and can_board())

func can_reserve(id: String) -> bool:
	if not offline() or not catalog.services.has(id) or not state.record().ticket.is_empty():
		return false
	var row: Dictionary = catalog.services[id]
	var kind: String = row.kind
	var car: ProtoTransitVehicle = vehicle_for(kind)
	var now: float = now_minutes()
	if car==null or _failed_bodies.has(kind) or (is_instance_valid(car.ai_driver) and car.ai_driver.running):
		return false
	if kind=="helicopter" and flight_grounded(stops[row.origin].pad,stops[row.destination].pad):
		return false
	return row.origin == stop_for(kind) and can_open(String(row.origin)) and not car.dead and car.global_position.distance_to(terminal_position(kind,stop_for(kind)))<2.0 and now>=catalog.next_departure(id,now)-float(row.boarding_minutes)

func reserve(id: String) -> void:
	if not can_reserve(id):
		main.notify("Service unavailable: location, weather or boarding window")
		return
	var kind: String = catalog.services[id].kind
	var result: Dictionary = state.reserve(id,stop_for(kind),catalog.next_departure(id,now_minutes()),now_minutes(),int(state.record().next_serial),main.backpack.slots)
	if result.ok:
		_active_kind = kind
		_ending_reason = ""
	main.notify(service_name()+" ticket reserved" if result.ok else "Service: "+String(result.code))
	if result.ok:
		main.audio.play_ui("click",-6.0)
	panel.refresh()

func can_board() -> bool:
	var ticket: Dictionary = state.record().ticket
	if ticket.is_empty() or not offline() or _riding:
		return false
	var kind: String = catalog.services[ticket.service].kind
	var car: ProtoTransitVehicle = vehicle_for(kind)
	if car==null or _failed_bodies.has(kind):
		return false
	if kind=="helicopter" and flight_grounded(stops[ticket.origin].pad,stops[ticket.destination].pad):
		return false
	return ticket.phase == "reserved" and ticket.origin == stop_for(kind) and _eligible_at_stop(stop_for(kind)) and not car.dead and car.global_position.distance_to(terminal_position(kind,stop_for(kind)))<2.0 and car.can_disembark() and main.player.global_position.distance_to(car.anchor_world("Boarding")) < 3.0 and now_minutes() <= float(ticket.departure) and car.passenger_anchor(0)!=null

func board() -> void:
	if not can_board():
		main.notify(service_name()+": approach the open boarding door; unsafe weather grounds flights")
		return
	var result: Dictionary = state.board(int(state.record().ticket.serial),main.backpack.slots)
	if not result.ok:
		main.notify("LASTLINE: "+String(result.code))
		return
	var car: ProtoTransitVehicle = active_vehicle()
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
	main.notify(service_name()+" passenger · departs at scheduled time · pilot/driver keeps the controls")

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
		return service_name()
	if main.character.dead:
		return "PASSENGER LOST · R — respawn + interruption refund"
	var destination: String = String(catalog.stops[ticket.destination].name)
	if not _ending_reason.is_empty():
		return "KESTREL INTERRUPTED · awaiting physical landing · refund at safe exit" if _active_kind=="helicopter" else "SERVICE STOPPED · E / Y/△ — safe roadside exit + refund"
	if _arrival:
		return destination+" · opening door / checking safe exit"
	if _departed:
		return service_name()+" → "+destination+" · HOLD E / Y/△ request landing" if _active_kind=="helicopter" else "LASTLINE → "+destination+" · remain seated · exit at next stop"
	return service_name()+" → %s · departs in %d min · E / Y/△ exit" % [destination,maxi(0,ceili(float(ticket.departure)-now_minutes()))]

func passenger_position() -> Vector3:
	var car: ProtoTransitVehicle = active_vehicle()
	if car == null:
		return main.player.global_position
	var hips: Vector3 = (main.player.puppet.hip_l.global_position+main.player.puppet.hip_r.global_position)*0.5
	return car.passenger_anchor(0).global_position-(hips-main.player.global_position)

func pose_passenger(delta: float) -> void:
	var car: ProtoTransitVehicle = active_vehicle()
	main.player.set_armed(false)
	main.player.puppet.raised = false
	main.player.puppet.rotation.y = wrapf(car.rotation.y-main.player.rotation.y,-PI,PI)
	main.player.puppet.pose_driving(delta)
	main.player.global_position = passenger_position()

func request_exit() -> bool:
	if not _riding or not offline() or main.character.dead:
		return false
	if not _ending_reason.is_empty():
		return _finish("service_failed",stop_for(_active_kind))
	if _departed and not _arrival:
		main.notify(service_name()+": remain seated until a safe stop")
		return false
	var safe: String = stop_for(_active_kind)
	var reason: String = "early_exit"
	if _arrival:
		safe = String(state.record().ticket.destination)
		reason = "arrived"
		if _active_kind=="helicopter" and is_instance_valid(_driver) and _driver.voluntary:
			reason = "early_exit"
			for id: String in stops:
				if active_vehicle().global_position.distance_to(stops[id].pad)<2.0:
					safe = id
	return _finish(reason,safe)

func request_early_stop() -> void:
	if _active_kind=="helicopter" and is_instance_valid(_driver) and _driver.running:
		_driver.request_landing()
		main.notify("KESTREL: landing requested · no voluntary refund")
	else:
		main.notify(service_name()+": public-service driver keeps the controls")

func respawn_after_death(run: Dictionary) -> bool:
	if not _riding or not offline() or not main.character.dead:
		return false
	var ticket: Dictionary = state.record().ticket
	if ticket.is_empty() or ticket.phase != "aboard":
		return false
	_checkpoint_respawn = run.duplicate(true)
	_checkpoint_respawn.transit_fleet = fleet_record()
	var result: Dictionary = state.finish(int(ticket.serial),"service_failed",stop_for(_active_kind),run.player.backpack)
	_checkpoint_respawn = {}
	if not result.ok:
		_notify_exit_once("death","LASTLINE: respawn checkpoint failed; press R to retry")
		return false
	# Publication follows the single full-run write. This is explicitly death
	# respawn, not a claim that the corpse safely walked out of the coach.
	_ending_reason = "Passenger died"
	var car: ProtoTransitVehicle = active_vehicle()
	_failed_bodies[_active_kind] = true
	if _active_kind!="helicopter" or car.grounded():
		car.set_door_open(true)
	if is_instance_valid(_driver):
		_driver.halt(_ending_reason)
	main.character.from_record(run.player.character)
	main.deaths = int(run.deaths)
	var p: Array = run.player.pos
	_release(Vector3(float(p[0]),float(p[1]),float(p[2])),"body_unavailable")
	main.player.dead_vis = false
	main.hud.hide_death()
	main.notify(service_name()+" death interruption · fare refunded · aircraft continues physical landing / replacement on reload")
	return true

func _finish(reason: String, safe_stop: String) -> bool:
	var car: ProtoTransitVehicle = active_vehicle()
	if reason == "service_failed" and (car.linear_velocity.length() >= 0.1 or (is_instance_valid(_driver) and _driver.running)):
		_exit_notice = ""
		return false # Emergency egress waits for the real completed parking transition.
	if reason != "service_failed" and car.global_position.distance_to(terminal_position(_active_kind,safe_stop))>=2.0:
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
	if _active_kind=="helicopter":
		helicopter_stop = safe_stop
	else:
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
	var car: ProtoTransitVehicle = active_vehicle()
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
	if catalog.services[id].kind=="helicopter":
		return terminal_position("helicopter",catalog.services[id].origin).distance_to(terminal_position("helicopter",catalog.services[id].destination))/float(catalog.services[id].speed_mps)+20.0
	var points: PackedVector3Array = route(id)
	var length: float = 0.0
	for i: int in range(1,points.size()):
		length += points[i-1].distance_to(points[i])
	return length/float(catalog.services[id].speed_mps) # stock clock: one game minute/second.

func _physics_process(_delta: float) -> void:
	if not _riding:
		return
	var car: ProtoTransitVehicle = active_vehicle()
	if not offline():
		if _driver != null:
			_driver.halt("Offline service unavailable online")
		return # No client may commit the local authority checkpoint.
	var ticket: Dictionary = state.record().ticket
	if main.character.dead or car.dead:
		main._stop_handheld_session("body_unavailable")
		_ending_reason = "Vehicle or passenger disabled"
		_failed_bodies[_active_kind] = true
		if _active_kind!="helicopter" or car.grounded():
			car.set_door_open(true)
		if _driver != null:
			_driver.halt("Vehicle or passenger disabled")
	if not _departed and _ending_reason.is_empty() and now_minutes() >= float(ticket.departure):
		car.set_door_open(false)
		if not car.doors_closed():
			return
		_departed = true
		if is_instance_valid(_driver) and not _driver.running:
			_driver.detach()
			_driver.queue_free()
		_driver = ProtoFlightDriver.new() if _active_kind=="helicopter" else ProtoCoachDriver.new()
		add_child(_driver)
		var kind: String = _active_kind
		_driver.arrived.connect(func() -> void:
			if _riding and active_vehicle()==car:
				_arrival = true
			car.set_door_open(true))
		_driver.failed.connect(func(reason: String) -> void:
			_failed_bodies[kind] = true
			if _riding and active_vehicle()==car:
				_ending_reason = reason
			car.set_door_open(true)
			main._stop_handheld_session("body_unavailable")
			main.notify(car.display_name+" stopped: "+reason+" · safe exit + refund"))
		if _active_kind=="helicopter":
			_driver.setup(car,stops[ticket.origin].pad,stops[ticket.destination].pad,float(catalog.services[ticket.service].speed_mps))
		else:
			_driver.setup(car,route(String(ticket.service)),float(catalog.services[ticket.service].speed_mps))
	if _arrival and car.doors_open:
		request_exit()

func valid_run(data: Dictionary) -> bool:
	if data.has("transit") and not state.valid_record(data.transit):
		return false
	if not data.has("transit_fleet"):
		return true
	var fleet: Variant = data.transit_fleet
	if not fleet is Dictionary or not fleet.get("version") is int or fleet.version!=1 or not fleet.get("coach_stop") is String or not stops.has(fleet.coach_stop):
		return false
	for key: Variant in fleet:
		if key not in ["version","coach_stop","helicopter_stop"]:
			return false
	return not fleet.has("helicopter_stop") or (fleet.helicopter_stop is String and stops.has(fleet.helicopter_stop))

func restore_run(data: Dictionary) -> bool:
	if not offline() or not valid_run(data):
		return false
	var incoming: Dictionary = data.duplicate(true)
	var staged := ProtoTransitTicketState.new()
	staged.setup(catalog,main.SAVE_PATH,func() -> Dictionary: return incoming,func(wallet: Dictionary) -> void: incoming.player.backpack = wallet)
	if not staged.restore(incoming.get("transit",{})):
		return false
	var stop_id: String = String(incoming.get("transit_fleet",{"coach_stop":"meridian_east"}).coach_stop)
	var air_stop: String = String(incoming.get("transit_fleet",{}).get("helicopter_stop","meridian_east"))
	var recovery_stop: String = stop_id
	var ticket: Dictionary = staged.record().ticket
	if not ticket.is_empty():
		if not incoming.get("player") is Dictionary or not incoming.player.get("backpack") is Dictionary:
			return false
		recovery_stop = String(ticket.last_safe_stop)
		if catalog.services[ticket.service].kind=="helicopter":
			air_stop = recovery_stop
		else:
			stop_id = recovery_stop
		var safe: Vector3 = catalog.stop_position(recovery_stop)
		incoming.player.pos = [safe.x,safe.y+0.15,safe.z]
		incoming.transit_fleet = {"version":1,"coach_stop":stop_id,"helicopter_stop":air_stop}
		var result: Dictionary = staged.finish(int(ticket.serial),"restart",recovery_stop,incoming.player.backpack)
		if not result.ok:
			return false
		incoming.transit = staged.record()
	# Publication starts only after successful staged recovery write.
	panel.close()
	if _riding:
		_release(catalog.stop_position(recovery_stop)+Vector3.UP*0.15,"body_unavailable")
	for car: ProtoTransitVehicle in vehicles.values():
		if is_instance_valid(car.ai_driver):
			var old: Node = car.ai_driver
			old.detach()
			old.queue_free()
	_driver = null
	state.restore(staged.record())
	coach_stop = stop_id
	helicopter_stop = air_stop
	for kind: String in ["coach","helicopter"]:
		var car: ProtoTransitVehicle = vehicle_for(kind)
		if car!=null and (car.dead or _failed_bodies.has(kind)):
			remove_child(car)
			car.queue_free()
			vehicles.erase("kestrel_courier" if kind=="helicopter" else "lastline_coach")
	_spawn_coach()
	_spawn_aircraft()
	_failed_bodies.clear()
	_ending_reason = ""
	for kind: String in ["coach","helicopter"]:
		var car: ProtoTransitVehicle = vehicle_for(kind)
		var stop: ProtoTransitStop = stops[stop_for(kind)]
		car.is_active = false
		car.input_throttle = 0.0
		car.input_brake = 0.0
		car.input_handbrake = false
		car.global_position = terminal_position(kind,stop_for(kind))+Vector3.UP*0.12 # Save restoration, never active journey movement.
		car.rotation.y = stop.bay_yaw()
		car.linear_velocity = Vector3.ZERO
		car.angular_velocity = Vector3.ZERO
		car.set_door_open(true)
	data.clear()
	data.merge(incoming,true)
	return true
