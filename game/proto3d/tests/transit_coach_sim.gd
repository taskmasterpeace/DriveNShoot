extends Node3D
## Real modal input and physical main-world journeys. Only initial setup stages
## a character; once boarded every metre must be made by the real drivetrain.
var main: Node
var passed: int = 0
var failed: int = 0
var scenario: String = "east"
var capture_dir: String = ""
var tracked: Node3D
var tracked_previous: Vector3
var largest_step: float = 0.0
var physics_elapsed: float = 0.0
var physics_ticks: int = 0
var emergency_input_probe: bool = false
var emergency_publications: Array[Dictionary] = []

func _input(event: InputEvent) -> void:
	if emergency_input_probe and event.is_action("interact"):
		var car: ProtoTransitVehicle = main.transit.vehicles.lastline_coach
		print("EMERGENCY INPUT EDGE: ",JSON.stringify({"pressed":event.is_pressed(),"speed":car.linear_velocity.length(),"running":main.transit._driver.running,"riding":main.transit.is_riding(),"tick":physics_ticks}))

func record_emergency_publication() -> void:
	var life: ProtoTransitService = main.transit
	var car: ProtoTransitVehicle = life.vehicles.lastline_coach
	var observation: Dictionary = {"speed":car.linear_velocity.length(),"running":is_instance_valid(life._driver) and life._driver.running,"wallet":main.backpack.slots.duplicate(true),"ticket":life.record(),"tick":physics_ticks}
	emergency_publications.append(observation)
	print("EMERGENCY WALLET PUBLICATION: ",JSON.stringify(observation))
class RoadVictim extends Node3D:
	var received: float = 0.0
	func take_damage(amount: float) -> void:
		received += amount

func _physics_process(_delta: float) -> void:
	physics_elapsed += _delta
	physics_ticks += 1
	if is_instance_valid(tracked):
		largest_step = maxf(largest_step,tracked.global_position.distance_to(tracked_previous))
		tracked_previous = tracked.global_position

func check(label: String, ok: bool, details: Dictionary = {}) -> void:
	passed += int(ok)
	failed += int(not ok)
	print("TRANSIT COACH %s: %s" % ["PASS" if ok else "FAIL", label])
	if not ok and not details.is_empty():
		print("ASSERTION DETAILS: ",JSON.stringify(details))

func frames(count: int) -> void:
	for i: int in count:
		await get_tree().physics_frame

func action(id: String, hold: int = 5) -> void:
	for pressed: bool in [true, false]:
		var event := InputEventAction.new()
		event.action = id
		event.pressed = pressed
		Input.parse_input_event(event)
		# Several physics ticks may share one idle frame under load. Let the
		# real GUI/input lifecycle consume each edge before injecting the next.
		await get_tree().process_frame
		await get_tree().process_frame
		await frames(hold if pressed else 5)

func activate(id: String) -> void:
	var button: Button = main.transit.panel.actions.get(id)
	check("GUI action available: " + id, button != null and not button.disabled)
	if button == null or button.disabled:
		return
	button.grab_focus()
	await get_tree().process_frame
	await get_tree().process_frame
	await frames(2)
	await action("ui_accept")

func _ready() -> void:
	var owned: String = ProjectSettings.globalize_path("res://../build/").replace("\\", "/").simplify_path().to_lower().trim_suffix("/") + "/"
	for key: String in ["APPDATA", "LOCALAPPDATA"]:
		if not OS.get_environment(key).replace("\\", "/").simplify_path().to_lower().begins_with(owned):
			get_tree().quit(2)
			return
	for arg: String in OS.get_cmdline_user_args():
		if arg.begins_with("--scenario="):
			scenario = arg.trim_prefix("--scenario=")
		if arg.begins_with("--capture-dir="):
			capture_dir = arg.trim_prefix("--capture-dir=")
	get_tree().create_timer(165.0).timeout.connect(func() -> void:
		print("TRANSIT COACH FAIL: watchdog")
		get_tree().quit(2))
	main = load("res://proto3d/proto3d.tscn").instantiate()
	add_child(main)
	await frames(20)
	await action("interact")
	check("initial car exit uses existing interact input", main.mode == main.Mode.FOOT)
	check("main world owns playable transit service", "transit" in main and main.get("transit") != null)
	if failed:
		finish()
		return
	if scenario == "safety":
		await safety_checks()
	elif scenario == "death":
		await death_checks()
	elif scenario == "emergency":
		await emergency_checks(main.transit)
	elif scenario.begins_with("reboard_"):
		await reboard_checks()
	else:
		await journey()
	finish()

func journey() -> void:
	var service_id: String = "lastline_" + ("west" if scenario == "west" else "east")
	var origin_id: String = "richmond" if scenario == "west" else "meridian_east"
	var destination_id: String = "meridian_east" if scenario == "west" else "richmond"
	var origin: Vector3 = main.transit.catalog.stop_position(origin_id)
	main.player.global_position = origin + Vector3.UP * 0.15 # INITIAL STAGING ONLY.
	main.player.velocity = Vector3.ZERO
	main.backpack.slots["scrip"] = 20
	main.daynight.hour = 11.9 # Inside real noon boarding window; no accelerated clock.
	if scenario == "west":
		var initial: Dictionary = main.capture_save()
		initial.transit_fleet = {"version":1,"coach_stop":"richmond"}
		check("explicit INITIAL west fleet checkpoint staging",main.apply_save(initial))
	main.weather.force("clear")
	await frames(90)
	main.cam_rig.snap_to_target()
	print("TRANSIT LIGHTING: "+JSON.stringify({"hour":main.daynight.hour,"coach_headlights":main.transit.vehicles.lastline_coach.headlights_on,"stop_lamps":main.transit.stops[origin_id].lamps.map(func(l: OmniLight3D) -> bool: return l.visible),"vision_mask":main.daynight.visual_mask_strength(),"surface":ProtoWorldBuilder.surface_at(main.transit.vehicles.lastline_coach.global_position)}))
	await action("interact")
	check("stop opens one shared service panel", main.transit.panel.is_open)
	if not main.transit.panel.is_open:
		return
	check("first actionable control receives focus", main.transit.panel.is_ancestor_of(get_viewport().gui_get_focus_owner()))
	check("unimplemented flights cannot be purchased", not main.transit.panel.actions.has("reserve:kestrel_east") and not main.transit.panel.actions.has("reserve:kestrel_west"))
	await capture("01_ticket_board")
	await activate("reserve:" + service_id)
	check("GUI purchase debits exactly two scrip", main.backpack.slots.scrip == 18)
	print("BOARD BEFORE: ",JSON.stringify({"can_board":main.transit.can_board(),"anchor_distance":main.player.global_position.distance_to(main.transit.vehicles.lastline_coach.anchor_world("Boarding")),"ticket":main.transit.record(),"focus":str(get_viewport().gui_get_focus_owner()),"mode":main.mode,"player":str(main.player.global_position)}))
	await activate("board")
	print("BOARD AFTER: ",JSON.stringify({"can_board":main.transit.can_board(),"anchor_distance":main.player.global_position.distance_to(main.transit.vehicles.lastline_coach.anchor_world("Boarding")),"ticket":main.transit.record(),"focus":str(get_viewport().gui_get_focus_owner()),"mode":main.mode,"riding":main.transit.is_riding(),"passenger":main.passenger_of_ai,"notices":main.hud._toast_q}))
	check("paid character occupies real passenger seat", main.passenger_of_ai and main.transit.is_riding(),{"expected":"passenger=true,riding=true","passenger":main.passenger_of_ai,"riding":main.transit.is_riding(),"ticket":main.transit.record(),"can_board":main.transit.can_board(),"anchor_distance":main.player.global_position.distance_to(main.transit.vehicles.lastline_coach.anchor_world("Boarding"))})
	check("public boarding feedback never offers taking the wheel",not main.hud._toast_q.any(func(t: String) -> bool: return t.contains("HOLD E to take the wheel")),{"notices":main.hud._toast_q,"expected":"no generic take-wheel notice"})
	if not main.transit.is_riding():
		return
	var coach: Node3D = main.active_car
	check("public service identifies only its actual seated occupant",coach.carries_character(main.player) and not coach.carries_character(main.cars[0]))
	await frames(10)
	var pelvis: Vector3 = (main.player.puppet.hip_l.global_position + main.player.puppet.hip_r.global_position) * 0.5
	check("pelvis sits at authored seat rather than root through roof", pelvis.distance_to(coach.passenger_anchor(0).global_position) < 0.08)
	await action("interact", 40)
	check("held interact cannot steal public coach", main.passenger_of_ai and not coach.use_player_input)
	await capture("02_boarded")
	var start: Vector3 = coach.global_position
	var victim := RoadVictim.new()
	add_child(victim)
	var route_row: PackedVector3Array = main.transit.catalog.route_points(service_id)
	victim.global_position = route_row[0].lerp(route_row[1],0.25) # INITIAL non-occupant collision fixture, no rider movement.
	victim.add_to_group("combatant")
	tracked = coach
	tracked_previous = start
	largest_step = 0.0
	var furthest: float = 0.0
	var clock_start: float = main.daynight.hour
	var captured: bool = false
	var arrival_write_armed: bool = false
	var arrival_write_checked: bool = false
	var start_ms: int = Time.get_ticks_msec()
	var journey_physics_start: float = physics_elapsed
	var journey_ticks_start: int = physics_ticks
	var road_index: int = main.transit.stops[origin_id].departure(scenario == "west").size()-1
	var approach_index: int = road_index+maxi(0,route_row.size()-2)+1
	var observed_edges: Dictionary = {}
	journey_edge("start",start_ms,journey_physics_start,journey_ticks_start,road_index,approach_index)
	var telemetry_at: int = start_ms
	while main.transit.is_riding() and Time.get_ticks_msec() - start_ms < 150000:
		await frames(1)
		var pos: Vector3 = coach.global_position
		var driver: ProtoCoachDriver = main.transit._driver
		if is_instance_valid(driver):
			for edge: String in ["departure","road","end_apron","arrival"]:
				var reached: bool = (edge=="departure" and driver.running) or (edge=="road" and driver.index>=road_index) or (edge=="end_apron" and driver.index>=approach_index) or (edge=="arrival" and main.transit._arrival)
				if reached and not observed_edges.has(edge):
					observed_edges[edge] = true
					journey_edge(edge,start_ms,journey_physics_start,journey_ticks_start,road_index,approach_index)
		furthest = maxf(furthest, pos.distance_to(start))
		if furthest>800 and not arrival_write_armed:
			arrival_write_armed = true
			set_checkpoint_path("user://absent_directory/refused.save")
		if main.transit._arrival and coach.can_disembark() and not arrival_write_checked:
			arrival_write_checked = true
			journey_edge("denied_arrival_gate",start_ms,journey_physics_start,journey_ticks_start,road_index,approach_index)
			check("failed arrival checkpoint publishes neither destination fleet nor ticket completion",main.transit.coach_stop==origin_id and main.transit.record().ticket.get("phase")=="aboard" and main.transit.is_riding() and main.backpack.slots.scrip==18)
			var obstruction: StaticBody3D = ProtoWorldBuilder.box_body(self,Vector3(2,4,2),coach.anchor_world("Exit")+Vector3.UP*1.5,Color(0.5,0.2,0.1))
			await frames(3)
			set_checkpoint_path(main.SAVE_PATH)
			journey_edge("arrival_writer_restored",start_ms,journey_physics_start,journey_ticks_start,road_index,approach_index)
			await action("interact")
			check("blocked terminal exit cannot publish foot mode",main.transit.is_riding() and main.transit.coach_stop==origin_id)
			obstruction.queue_free()
			await frames(3)
		if Time.get_ticks_msec() >= telemetry_at:
			telemetry_at += 5000
			print("COACH TRACE: " + JSON.stringify({"pos":str(pos),"surface":ProtoWorldBuilder.surface_at(pos),"velocity":str(coach.linear_velocity),"yaw":coach.rotation.y,"throttle":coach.input_throttle,"steer":coach.input_steer,"brake":coach.input_brake,"damage":coach.snapshot_damage(),"driver_i":main.transit._driver.index if main.transit._driver != null else -1,"blocked":main.transit._driver.blocked if main.transit._driver != null else false,"failure":main.transit._ending_reason}))
		if coach.dead:
			check("physical vehicle survives unobstructed scheduled journey",false)
			break
		if not main.transit._ending_reason.is_empty():
			print("COACH OBSTRUCTION: "+main.transit._driver.obstacle_path)
			check("scheduled route is not interrupted",false)
			break
		if furthest > 150.0 and not captured:
			captured = true
			await action("interact")
			check("moving exit request keeps rider safely aboard", main.transit.is_riding())
			await capture("03_journey")
	print("TRANSIT COACH METRICS: " + JSON.stringify({"furthest_m":furthest,"largest_step_m":largest_step,"seconds":(Time.get_ticks_msec()-start_ms)/1000.0,"coach":str(coach.global_position)}))
	journey_edge("observation_outcome",start_ms,journey_physics_start,journey_ticks_start,road_index,approach_index)
	tracked = null
	check("road journey made physical progress without teleport", furthest > 800.0 and largest_step < 2.0)
	check("world clock advances through journey", main.daynight.hour > clock_start)
	check("moving coach still roadkills a non-occupant",victim.received>0.0)
	victim.queue_free()
	check("arrival leaves living rider on clear ground", main.mode == main.Mode.FOOT and main.character.hp > 0 and not main.transit.is_riding())
	check("arrival is at actual other terminal", main.player.global_position.distance_to(main.transit.catalog.stop_position(destination_id)) < 10.0)
	await frames(360) # Real toast queue drains normally after the failed-write/blocked-exit fixture.
	journey_edge("post_toast_outcome",start_ms,journey_physics_start,journey_ticks_start,road_index,approach_index)
	check("successful arrival settles to truthful foot presentation",not String(main.hud._toast_label.text).contains("remain seated") or main.hud._toast_label.modulate.a<0.05)
	check("parking releases all inputs without sinking suspension", not coach.is_active and not coach.input_handbrake and coach.input_brake == 0.0 and absf(coach.global_position.y - ProtoWorldBuilder.ground_y(coach.global_position.x,coach.global_position.z)) < 0.2)
	var terminal: ProtoTransitStop = main.transit.stops[destination_id]
	var corners_clear: bool = true
	for x: float in [-1.25,1.25]:
		for z: float in [-4.2,4.2]:
			var corner: Vector3 = coach.to_global(Vector3(x,0,z))
			corners_clear = corners_clear and ProtoWorldBuilder._in_rect(corner,terminal.apron_rects[0])
	check("complete parked body remains inside constructed apron and actual exit is clear",corners_clear and main.transit._clear_exit(coach)!=null)
	print("TRANSIT PARKING: "+JSON.stringify({"heading_error_deg":rad_to_deg(absf(wrapf(coach.rotation.y-terminal.bay_yaw(),-PI,PI))),"position_error_m":coach.global_position.distance_to(terminal.bay),"exit_clear":main.transit._clear_exit(coach)!=null,"surface":ProtoWorldBuilder.surface_at(coach.global_position)}))
	await capture("04_arrival" if not main.transit.is_riding() else "04_FAILED_before_arrival")
	if not main.transit.is_riding():
		if not capture_dir.is_empty():
			var prior_mask: bool = main.vision_cone.visible
			main.vision_cone.visible = false
			await capture("diagnostic_arrival_mask_off_NOT_journey_evidence")
			main.vision_cone.visible = prior_mask
		var final_save: Dictionary = main.save_game()
		check("arrival checkpoint includes completed ticket and destination fleet",final_save.transit.ticket.is_empty() and final_save.transit_fleet.coach_stop == destination_id)
		check("destination save reload succeeds",main.load_game())
		await frames(45)
		check("reload retains exactly one physical shuttle at destination",main.transit.vehicles.size() == 1 and main.transit.vehicles.lastline_coach.global_position.distance_to(main.transit.stops[destination_id].bay) < 2.0)
		# Schedule remains real: availability is tested in the next window, not by selling early.
		main.daynight.hour = 17.6
		main.player.global_position = main.transit.catalog.stop_position(destination_id)+Vector3.UP*0.15
		check("reverse route is available from destination after reload",main.transit.can_reserve("lastline_east" if scenario == "west" else "lastline_west"))
		if not capture_dir.is_empty():
			var prior_hour: float = main.daynight.hour
			main.daynight.hour = 20.0 # Explicit POST-journey night-light fixture, not travel time.
			await frames(5)
			check("terminal practical lamps are on at night",terminal.lamps.all(func(l: OmniLight3D) -> bool: return l.visible))
			await capture("05_terminal_night_POST_journey_fixture")
			main.daynight.hour = prior_hour
		main.player.global_position = main.transit.catalog.stop_position(origin_id)+Vector3.UP*0.15 # POST-journey unload fixture only.
		await frames(90)
		var parked: ProtoTransitVehicle = main.transit.vehicles.lastline_coach
		var chunk_key: String = "%d,%d" % [floori(parked.global_position.x/128),floori(parked.global_position.z/128)]
		check("exactly one waiting coach remains grounded after distant chunk unload",not main.stream.loaded.has(chunk_key) and main.transit.vehicles.size()==1 and absf(parked.global_position.y-ProtoWorldBuilder.ground_y(parked.global_position.x,parked.global_position.z))<0.2)

func event_press(event: InputEvent) -> void:
	Input.parse_input_event(event)
	await get_tree().process_frame
	await get_tree().process_frame
	await frames(3)
	var release: InputEvent = event.duplicate()
	release.set("pressed",false)
	Input.parse_input_event(release)
	await get_tree().process_frame
	await get_tree().process_frame
	await frames(3)

func journey_edge(edge: String, start_ms: int, physics_start: float, ticks_start: int, road_index: int, approach_index: int) -> void:
	var life: ProtoTransitService = main.transit
	var driver: ProtoCoachDriver = life._driver
	var index: int = driver.index if is_instance_valid(driver) else -1
	var phase: String = "waiting" if index<0 else ("departure_apron" if index<road_index else ("road" if index<approach_index else "destination_apron"))
	if life._arrival:
		phase = "parked_arrival"
	print("JOURNEY EDGE: ",JSON.stringify({"edge":edge,"wall_s":float(Time.get_ticks_msec()-start_ms)/1000.0,"physics_s":physics_elapsed-physics_start,"ticks":physics_ticks-ticks_start,"clock_hour":main.daynight.hour,"index":index,"phase":phase,"running":is_instance_valid(driver) and driver.running,"arrival":life._arrival,"riding":life.is_riding(),"ticket_phase":life.record().ticket.get("phase","none"),"checkpoint_path":life.state._checkpoint_path,"position":str(life.vehicles.lastline_coach.global_position),"speed":life.vehicles.lastline_coach.linear_velocity.length()}))

func set_checkpoint_path(path: String) -> void:
	var before: Dictionary = main.transit.record()
	main.transit.state.setup(main.transit.catalog,path,main.transit.capture_run,main.transit._publish_wallet)
	main.transit.state.restore(before)

func safety_checks() -> void:
	var life: Node = main.transit
	var origin: Vector3 = life.catalog.stop_position("meridian_east")
	main.player.global_position = origin+Vector3.UP*0.15 # Safety fixture INITIAL staging only.
	main.player.velocity = Vector3.ZERO
	main.backpack.slots["scrip"] = 20
	main.daynight.hour = 11.5
	await frames(80)
	await geometry_checks(life)
	await cross_traffic_checks(life)
	var dashboard: Dictionary = life.vehicles.lastline_coach.dashboard()
	for surface: String in ["gravel","dirt_road","water"]:
		dashboard.surface = surface
		dashboard.struggling = false
		main.hud.set_dashboard(dashboard)
		check("real dashboard labels surface "+surface,String(main.hud.dash_status_text()).contains("GRAVEL" if surface=="gravel" else "WATER" if surface=="water" else "DIRT"))
	var richmond: ProtoTransitStop = life.stops.richmond
	var distant_fixture: Node3D = main.stream._spawn_chunk(10,-2) # Explicit unloaded-site fixture, not journey staging.
	await frames(3)
	var intrusion := PhysicsRayQueryParameters3D.create(Vector3(1309.661,8,-220.9745),Vector3(1309.661,1,-220.9745))
	# Exact anonymous house identified by failed west journey, not an authored placement.
	check("reserved apron excludes reproduced neighborhood roof intrusion",get_world_3d().direct_space_state.intersect_ray(intrusion).is_empty())
	check("constructed concrete provides road grip",ProtoWorldBuilder.surface_at(richmond.point(14,10)) == "road")
	distant_fixture.queue_free()
	await frames(3)
	distant_fixture = main.stream._spawn_chunk(10,-2)
	main.stream._clear_service_scatter(distant_fixture)
	await frames(3)
	check("reloaded distant chunk still excludes actual roof intrusion",get_world_3d().direct_space_state.intersect_ray(intrusion).is_empty())
	distant_fixture.queue_free()
	var baseline: Dictionary = main.capture_save()
	await action("interact")
	check("safety board opens from real stop input",life.panel.is_open)
	var position: Vector3 = main.player.global_position
	await action("move_up",12)
	await action("shoot",12)
	check("held movement and fire cannot leak under ticket board",main.player.global_position.distance_to(position)<0.05 and main._gameplay_input_blocked())
	var key := InputEventKey.new()
	key.keycode = KEY_ESCAPE
	key.pressed = true
	await event_press(key)
	check("Escape closes ticket board",not life.panel.is_open)
	await action("interact")
	var pad := InputEventJoypadButton.new()
	pad.button_index = JOY_BUTTON_B
	pad.pressed = true
	await event_press(pad)
	check("B/◯ closes ticket board",not life.panel.is_open)
	await action("interact")
	var button: Button = life.panel.frame.find_children("*","Button",true,false).filter(func(b: Button) -> bool: return b.get_meta("action","") == "close")[0]
	var click := InputEventMouseButton.new()
	click.button_index = MOUSE_BUTTON_LEFT
	click.pressed = true
	click.position = get_viewport().get_final_transform() * button.get_global_rect().get_center()
	await event_press(click)
	check("visible close control responds to actual mouse input",not life.panel.is_open)
	get_window().size = Vector2i(1280,800)
	await frames(3)
	await action("interact")
	check("ticket rect fits small viewport",get_viewport().get_visible_rect().encloses(life.panel.frame.get_global_rect()))
	await activate("reserve:lastline_east")
	check("reserved checkpoint has exact fare",main.backpack.slots.scrip == 18)
	var boarding: Vector3 = life.vehicles.lastline_coach.anchor_world("Boarding")
	main.player.global_position = boarding+life.stops.meridian_east.south*2.99 # Explicit boundary fixture before boarding.
	check("reserved rider just inside three metres may board",life.can_board())
	main.player.global_position = boarding+life.stops.meridian_east.south*3.01
	check("reserved rider just outside three metres cannot board",not life.can_board())
	var away: Vector3 = (boarding-origin).normalized()
	main.player.global_position = boarding+away*2.99
	check("door radius is independent of counter radius",life.can_board() and not life.can_open("meridian_east"),{"door_m":main.player.global_position.distance_to(boarding),"counter_m":main.player.global_position.distance_to(origin),"can_board":life.can_board(),"expected":"can_board=true outside counter range"})
	main.player.global_position = boarding+away*3.01
	check("outside door radius away from counter refuses boarding",not life.can_board())
	life.panel.close()
	main.player.global_position = boarding+away*2.8 # Leave margin for real foot settling during input delivery.
	await frames(3)
	await action("interact")
	check("door-side interact reaches shared Board action away from counter",life.panel.is_open and life.panel.actions.has("board") and not life.panel.actions.board.disabled,{"panel_open":life.panel.is_open,"door_m":main.player.global_position.distance_to(boarding),"counter_m":main.player.global_position.distance_to(origin)})
	main.player.global_position = origin+Vector3.UP*0.15
	var reserved: Dictionary = main.capture_save()
	main.player.global_position += Vector3(9,0,0) # Deliberate out-of-range safety fixture.
	await frames(20)
	check("remote reservation cannot board",not life.can_board() and not life.panel.is_open)
	main.player.global_position = origin+Vector3.UP*0.15
	await frames(20)
	await action("interact")
	set_checkpoint_path("user://absent_directory/refused.save")
	await activate("board")
	check("failed boarding checkpoint exposes no live passenger mutation",not life.is_riding() and main.mode == main.Mode.FOOT and life.record().ticket.phase == "reserved" and main.backpack.slots.scrip == 18)
	set_checkpoint_path(main.SAVE_PATH)
	await activate("board")
	check("boarding succeeds after checkpoint retry",life.is_riding())
	check("public boarding feedback never offers taking the wheel",not main.hud._toast_q.any(func(t: String) -> bool: return t.contains("HOLD E to take the wheel")),{"notices":main.hud._toast_q,"expected":"no generic take-wheel notice"})
	var aboard: Dictionary = main.capture_save()
	check("passenger HUD does not claim pedal control",not String(main.hud._help_label.text).contains("throttle"))
	await frames(480) # Let existing real notices drain; never clear the global toast queue.
	var blocker: StaticBody3D = ProtoWorldBuilder.box_body(self,Vector3(2,4,2),life.vehicles.lastline_coach.anchor_world("Exit")+Vector3.UP*1.5,Color(0.5,0.2,0.1))
	await frames(3)
	for attempt: int in 3:
		await action("interact")
	check("unchanged blocked exit queues only one real failure notice",main.hud._toast_q.filter(func(t: String) -> bool: return t.contains("boarding exit blocked")).size()==1)
	print("RECOVERY PRECONDITION BEFORE CLEAR: ",JSON.stringify({"riding":life.is_riding(),"passenger":main.passenger_of_ai,"hp":main.character.hp,"dead":main.character.dead,"car_dead":life.vehicles.lastline_coach.dead,"ending":life._ending_reason,"ticket":life.record(),"mode":main.mode}))
	check("settled blocked-exit inputs retain aboard recovery precondition",life.is_riding() and main.passenger_of_ai and life.record().ticket.get("phase","")=="aboard" and not main._e_down and not Input.is_action_pressed("interact"),{"expected":"riding/passenger/aboard; released interact and _e_down","riding":life.is_riding(),"passenger":main.passenger_of_ai,"ticket":life.record(),"e_down":main._e_down,"interact_pressed":Input.is_action_pressed("interact")})
	blocker.queue_free()
	await frames(3)
	print("RECOVERY PRECONDITION AFTER CLEAR: ",JSON.stringify({"riding":life.is_riding(),"passenger":main.passenger_of_ai,"hp":main.character.hp,"dead":main.character.dead,"car_dead":life.vehicles.lastline_coach.dead,"ending":life._ending_reason,"ticket":life.record(),"mode":main.mode}))
	var before: Dictionary = life.record()
	var live_position: Vector3 = main.player.global_position
	var bad: Dictionary = aboard.duplicate(true)
	bad.transit = {"bad":true}
	var applied: bool = main.apply_save(bad)
	check("corrupt transit rejects entire live save",not applied and life.record() == before and main.player.global_position == live_position and main.passenger_of_ai,{"expected":"apply=false,ticket and position unchanged,passenger=true","applied":applied,"record_equal":life.record()==before,"position_equal":main.player.global_position==live_position,"passenger":main.passenger_of_ai,"before":before,"after":life.record(),"before_position":str(live_position),"after_position":str(main.player.global_position)})
	for corrupt: Variant in [null,{}, {"version":1,"coach_stop":"unknown"},{"version":1,"coach_stop":"richmond","extra":true},{"version":1.0,"coach_stop":"richmond"}]:
		bad = aboard.duplicate(true)
		bad.transit_fleet = corrupt
		applied = main.apply_save(bad)
		check("present malformed fleet refuses entire save",not applied and life.record() == before and main.passenger_of_ai,{"expected":"apply=false,ticket unchanged,passenger=true","fleet":corrupt,"applied":applied,"record_equal":life.record()==before,"passenger":main.passenger_of_ai,"before":before,"after":life.record()})
	set_checkpoint_path("user://absent_directory/refused.save")
	# restore_run uses the shared main SAVE_PATH; a real filesystem obstruction
	# below forces its staged recovery write to fail without a mocked checkpoint.
	var save_path: String = main.SAVE_PATH
	var old_bytes: String = FileAccess.get_file_as_string(save_path)
	DirAccess.remove_absolute(save_path)
	DirAccess.make_dir_absolute(save_path)
	applied = main.apply_save(aboard.duplicate(true))
	check("failed recovery write leaves live passenger untouched",not applied and life.record() == before and main.passenger_of_ai,{"expected":"apply=false,ticket unchanged,passenger=true","applied":applied,"record_equal":life.record()==before,"passenger":main.passenger_of_ai,"before":before,"after":life.record()})
	DirAccess.remove_absolute(save_path)
	var file := FileAccess.open(save_path,FileAccess.WRITE)
	file.store_string(old_bytes)
	file.close()
	set_checkpoint_path(main.SAVE_PATH)
	aboard.transit_fleet.coach_stop = "richmond" # Ticket last-safe origin has precedence.
	check("aboard restart commits recovery",main.apply_save(aboard))
	check("aboard restart refunds once at safe origin",not life.is_riding() and main.mode == main.Mode.FOOT and main.backpack.slots.scrip == 20 and life.coach_stop == "meridian_east" and main.player.global_position.distance_to(origin)<1.0)
	check("reloading recovered disk cannot refund twice",main.load_game() and main.backpack.slots.scrip == 20)
	check("reserved save recovery commits incoming wallet",main.apply_save(reserved) and main.backpack.slots.scrip == 20)
	var legacy: Dictionary = baseline.duplicate(true)
	legacy.erase("transit")
	legacy.erase("transit_fleet")
	check("old save omissions restore empty ticket and default fleet",main.apply_save(legacy) and life.record().ticket.is_empty() and life.coach_stop == "meridian_east")
	await frames(10)
	check("ordinary player driver's roadkill exemption remains",main.cars[0].carries_character(main.player))
	var notice_deadline: int = Time.get_ticks_msec()+8000
	while main.hud._toast_q.size()>=5 and Time.get_ticks_msec()<notice_deadline:
		await get_tree().process_frame # Let the existing bounded queue make room; never clear it.
	var ordinary_notices: int = main.hud._toast_q.filter(func(t: String) -> bool: return t.contains("HOLD E to take the wheel")).size()
	main.enter_passenger(main.cars[0]) # Explicit ordinary-passenger API fixture, not service journey evidence.
	check("ordinary passenger retains original take-wheel boarding notice",main.hud._toast_q.filter(func(t: String) -> bool: return t.contains("HOLD E to take the wheel")).size()==ordinary_notices+1)
	main._exit_car()
	check("waiting public service exempts no pedestrian",not life.vehicles.lastline_coach.carries_character(main.player))
	life.vehicles.lastline_coach.use_player_input = true # A stray control flag must not grant service occupancy.
	check("public occupant exemption still requires active service identity",not life.vehicles.lastline_coach.carries_character(main.player))
	life.vehicles.lastline_coach.use_player_input = false
	var offline_disk: String = FileAccess.get_file_as_string(main.SAVE_PATH)
	var prior_net: ProtoNet = main.net
	main.net = ProtoNet.new()
	main.net.online = true # State-only authority fixture; no listener or peer is started.
	check("online clients cannot open reserve or apply the local service checkpoint",not life.can_open("meridian_east") and not life.can_reserve("lastline_east") and not main.apply_save(legacy) and FileAccess.get_file_as_string(main.SAVE_PATH)==offline_disk)
	main.net.free()
	main.net = prior_net
	await emergency_checks(life)

func geometry_checks(life: Node) -> void:
	var stream: ProtoWorldStream = main.stream
	var center := Vector3(1320,0,-192)
	var road: Dictionary = stream.usmap.road_near(center,200.0)
	var reservations: Dictionary = stream.service_reservations.duplicate(true)
	var fixture_a := Node3D.new()
	var fixture_b := Node3D.new()
	add_child(fixture_a)
	add_child(fixture_b)
	var rng_a := RandomNumberGenerator.new()
	var rng_b := RandomNumberGenerator.new()
	var removed: int = 0
	var retained: int = 0
	var identical: bool = true
	var same_random: bool = true
	for seed_value: int in 16:
		rng_a.seed = seed_value
		rng_b.seed = seed_value
		stream.service_reservations = {}
		stream._stamp_neighborhood(fixture_a,center,road,rng_a)
		stream.service_reservations = reservations
		var original: int = fixture_a.get_child_count()
		stream._clear_service_scatter(fixture_a)
		stream._stamp_neighborhood(fixture_b,center,road,rng_b)
		removed += original-fixture_a.get_child_count()
		retained += fixture_a.get_child_count()
		identical = identical and neighborhood_signature(fixture_a)==neighborhood_signature(fixture_b)
		same_random = same_random and rng_a.state==rng_b.state
		for fixture: Node3D in [fixture_a,fixture_b]:
			for child: Node in fixture.get_children():
				fixture.remove_child(child)
				child.queue_free()
	print("NEIGHBORHOOD FIXTURE: "+JSON.stringify({"removed":removed,"retained":retained,"identical":identical}))
	check("late and initial reservations preserve identical outside neighborhood candidates",removed>0 and retained>0 and identical)
	check("neighborhood reservation preserves exact later random stream",same_random)
	fixture_a.queue_free()
	fixture_b.queue_free()
	var stop: ProtoTransitStop = life.stops.richmond
	var outside: Vector3 = stop.point(55,20)
	var expected_surface: String = ProtoWorldBuilder.surface_at(outside)
	var replacement_a := ProtoTransitStop.new()
	var replacement_b := ProtoTransitStop.new()
	life.add_child(replacement_a)
	replacement_a.setup(life,"richmond")
	life.add_child(replacement_b)
	replacement_b.setup(life,"richmond")
	var key: String = replacement_b._pavement_key
	replacement_a.queue_free()
	await frames(2)
	check("deferred old stop teardown cannot erase replacement pavement",ProtoWorldBuilder.extra_road_rects.has(key) and ProtoWorldBuilder.surface_at(stop.point(14,10))=="road")
	replacement_b.queue_free()
	await frames(2)
	check("stop pavement teardown owns only its entries and leaves outside grip unchanged",not ProtoWorldBuilder.extra_road_rects.has(key) and ProtoWorldBuilder.extra_road_rects.has(stop._pavement_key) and ProtoWorldBuilder.surface_at(outside)==expected_surface)

func neighborhood_signature(fixture: Node3D) -> String:
	var rows: Array = []
	for child: Node3D in fixture.get_children():
		var row: Array = [str(child.position),child.get_meta("anonymous_neighborhood",[])]
		for member: Node3D in child.get_children():
			row.append(str(member.transform))
		rows.append(row)
	return JSON.stringify(rows)

func cross_traffic_checks(life: Node) -> void:
	var stop: ProtoTransitStop = life.stops.richmond
	var coach := ProtoTransitVehicle.make("coach")
	coach.position = stop.point(0,15)+Vector3.UP*0.12 # INITIAL traffic fixture.
	coach.rotation.y = stop.bay_yaw()
	life.add_child(coach)
	var crossing := ProtoCar3D.create("van",Color.WHITE)
	crossing.position = stop.point(12,28)+Vector3.UP*0.12
	crossing.rotation.y = atan2(stop.south.x,stop.south.z)
	life.add_child(crossing)
	crossing.use_player_input = false
	await frames(30)
	coach.linear_velocity = stop.east*4 # INITIAL fixture velocities before driver setup.
	crossing.linear_velocity = -stop.south*6
	var driver := ProtoCoachDriver.new()
	life.add_child(driver)
	driver.setup(coach,PackedVector3Array([stop.point(0,15),stop.point(30,15)]),6)
	check("merge probe predicts approaching cross traffic outside front beam",driver._obstacle(4))
	await frames(10)
	check("cross traffic makes actual drivetrain brake",driver.blocked and coach.input_throttle==0.0 and coach.linear_velocity.length()<4.0)
	await frames(300) # Yield clears first; allow the real coach to accelerate again.
	print("CROSS TRAFFIC FIXTURE: "+JSON.stringify({"coach":str(coach.global_position),"crossing":str(crossing.global_position),"blocked":driver.blocked,"obstacle":driver.obstacle_path,"chassis":coach.components.chassis.hp}))
	check("yield releases after real cross traffic clears without impact damage",not driver.blocked and coach.global_position.distance_to(stop.point(0,15))>3.0 and coach.components.chassis.hp==100)
	driver.running = false
	driver.queue_free()
	coach.queue_free()
	crossing.queue_free()

func emergency_checks(life: Node) -> void:
	# Fresh INITIAL service fixture, then all roadside movement is real controls.
	main.daynight.hour = 11.9
	main.player.global_position = life.catalog.stop_position("meridian_east")+Vector3.UP*0.15
	main.backpack.slots.scrip = 20
	await frames(20)
	await action("interact")
	await activate("reserve:lastline_east")
	await activate("board")
	if not life.is_riding():
		return
	var coach: ProtoTransitVehicle = life.vehicles.lastline_coach
	var origin: Vector3 = coach.global_position
	var timeout: int = Time.get_ticks_msec()+40000
	var physics_start: float = physics_elapsed
	var ticks_start: int = physics_ticks
	while coach.global_position.distance_to(origin)<100 and Time.get_ticks_msec()<timeout:
		await frames(1)
	check("emergency fixture genuinely travels to roadside",coach.global_position.distance_to(origin)>100)
	var damage_wall: int = Time.get_ticks_msec()
	var damage_physics: float = physics_elapsed
	print("EMERGENCY APPROACH: ",JSON.stringify({"wall_s":40.0-float(timeout-damage_wall)/1000.0,"physics_s":damage_physics-physics_start,"speed":coach.linear_velocity.length(),"position":str(coach.global_position)}))
	coach.take_damage(1000.0) # Actual external combat damage entry point, no healing or invulnerability.
	await frames(3)
	print("DEAD BRAKE EARLY PHASE: ",JSON.stringify({"hook":coach.inactive_brake_force(),"body":coach.brake,"demand":coach.input_brake,"handbrake":coach.input_handbrake,"matching":coach.ai_driver==life._driver,"surface_brake":coach.current_handling().get("brake"),"tick":physics_ticks}))
	await get_tree().process_frame
	await get_tree().process_frame # Observe after body/driver physics callbacks, not only physics_frame's pre-callback signal.
	var contacts: Array = []
	for wheel: Node in coach.get_children():
		if wheel is VehicleWheel3D:
			contacts.append({"contact":wheel.is_in_contact(),"brake":wheel.brake,"friction":wheel.wheel_friction_slip})
	print("DEAD BRAKE TELEMETRY: ",JSON.stringify({"dead":coach.dead,"active":coach.is_active,"driver_running":life._driver.running,"input_brake":coach.input_brake,"input_handbrake":coach.input_handbrake,"effective_brake":coach.brake,"max_brake":coach.max_brake,"speed":coach.linear_velocity.length(),"engine_force":coach.engine_force,"wheels":contacts}))
	check("destroyed service consumes physical driver's emergency brake",coach.dead and coach.input_brake>0.0 and coach.brake>3.0 and coach.engine_force==0.0,{"input_brake":coach.input_brake,"effective_brake":coach.brake,"max_brake":coach.max_brake,"expected":"service brake greater than generic idle3, no propulsion"})
	while (life._ending_reason.is_empty() or not coach.can_disembark()) and Time.get_ticks_msec()<timeout:
		await frames(1)
	check("disabled service physically brakes upright on real roadside ground",coach.dead and coach.can_disembark())
	var ticket: Dictionary = life.record()
	var rolling_speed: float = coach.linear_velocity.length()
	var rolling_disk: String = FileAccess.get_file_as_string(main.SAVE_PATH)
	var rolling_driver: bool = life._driver.running
	emergency_input_probe = true
	emergency_publications.clear()
	main.backpack.changed.connect(record_emergency_publication)
	# Acknowledged real tap at this physics boundary: the usual multi-frame
	# helper can outlast the now-effective brakes and legitimate auto-egress.
	var was_up: bool = not main._e_down
	var tap := InputEventAction.new()
	tap.action = "interact"
	tap.pressed = true
	Input.parse_input_event(tap)
	Input.flush_buffered_events() # Dispatch the real buffer at the measured unsafe edge.
	var press_delivered: bool = main._e_down
	tap = InputEventAction.new()
	tap.action = "interact"
	tap.pressed = false
	Input.parse_input_event(tap)
	Input.flush_buffered_events()
	var release_delivered: bool = not main._e_down
	check("rolling real E edges are positively acknowledged",was_up and press_delivered and release_delivered,{"was_up":was_up,"press_delivered":press_delivered,"release_delivered":release_delivered})
	check("rolling emergency refuses real exit input and refund",rolling_speed>=0.1 and rolling_speed<0.5 and rolling_driver and life.is_riding() and life.record()==ticket and main.backpack.slots.scrip==18 and FileAccess.get_file_as_string(main.SAVE_PATH)==rolling_disk and emergency_publications.is_empty(),{"expected":"acknowledged unsafe request; still aboard,unchanged ticket/wallet/disk","initial_speed":rolling_speed,"driver_running":rolling_driver,"riding":life.is_riding(),"record_equal":life.record()==ticket,"scrip":main.backpack.slots.scrip,"publications":emergency_publications})
	if not life.is_riding():
		main.backpack.changed.disconnect(record_emergency_publication)
		emergency_input_probe = false
		return
	set_checkpoint_path("user://absent_directory/refused.save") # Keep auto-exit retry denied when real parking completes.
	await get_tree().process_frame
	await get_tree().process_frame
	while (coach.linear_velocity.length()>=0.1 or life._driver.running) and Time.get_ticks_msec()<timeout:
		await frames(1)
	print("EMERGENCY TIMING: ",JSON.stringify({"total_wall_s":40.0-float(timeout-Time.get_ticks_msec())/1000.0,"total_physics_s":physics_elapsed-physics_start,"post_damage_wall_s":float(Time.get_ticks_msec()-damage_wall)/1000.0,"post_damage_physics_s":physics_elapsed-damage_physics,"physics_ticks":physics_ticks-ticks_start,"speed":coach.linear_velocity.length(),"running":life._driver.running,"effective_brake":coach.brake,"input_brake":coach.input_brake,"input_handbrake":coach.input_handbrake}))
	check("emergency completes real parking before checkpoint retry",coach.linear_velocity.length()<0.1 and not life._driver.running and coach.can_disembark(),{"speed":coach.linear_velocity.length(),"running":life._driver.running,"can_disembark":coach.can_disembark(),"deadline_remaining_ms":timeout-Time.get_ticks_msec(),"physics_elapsed_s":physics_elapsed-physics_start,"position":str(coach.global_position),"angular":str(coach.angular_velocity)})
	var roadside: Vector3 = coach.global_position
	var roadside_started: int = Time.get_ticks_msec()
	set_checkpoint_path("user://absent_directory/refused.save")
	await action("interact")
	check("denied roadside checkpoint publishes neither refund nor exit",life.is_riding() and life.record()==ticket and main.backpack.slots.scrip==18)
	check("completed emergency parking restores default inactive brake",coach.brake==3.0 and coach.inactive_brake_force()==3.0)
	set_checkpoint_path(main.SAVE_PATH)
	await action("interact")
	check("roadside retry exits physically with one full refund",not life.is_riding() and main.mode==main.Mode.FOOT and main.backpack.slots.scrip==20 and main.player.global_position.distance_to(roadside)<8.0)
	check("interrupted wreck remains in place and cannot sell another ticket",coach.dead and coach.global_position.distance_to(roadside)<0.2 and not life.can_reserve("lastline_east"),{"expected":"dead=true,displacement<0.2m,reserve=false","dead":coach.dead,"displacement_m":coach.global_position.distance_to(roadside),"can_reserve":life.can_reserve("lastline_east"),"before":str(roadside),"after":str(coach.global_position),"velocity":str(coach.linear_velocity),"elapsed_s":(Time.get_ticks_msec()-roadside_started)/1000.0,"player":str(main.player.global_position)})
	var saved: Dictionary = str_to_var(FileAccess.get_file_as_string(main.SAVE_PATH))
	var foot: Vector3 = Vector3(saved.player.pos[0],saved.player.pos[1],saved.player.pos[2])
	check("emergency checkpoint saves actual foot position and unchanged recovery terminal",foot.distance_to(main.player.global_position)<0.3 and saved.transit_fleet.coach_stop=="meridian_east" and saved.transit.ticket.is_empty())
	var wreck_id: int = coach.get_instance_id()
	check("interruption reload succeeds",main.load_game())
	await frames(20)
	check("reload constructs exactly one replacement without second refund",life.vehicles.size()==1 and life.vehicles.lastline_coach.get_instance_id()!=wreck_id and not life.vehicles.lastline_coach.dead and main.backpack.slots.scrip==20 and main.player.global_position.distance_to(foot)<0.5)
	check("every emergency wallet publication occurs after actual completed parking",not emergency_publications.is_empty() and emergency_publications.all(func(p: Dictionary) -> bool: return float(p.speed)<0.1 and not bool(p.running)),{"publications":emergency_publications})
	main.backpack.changed.disconnect(record_emergency_publication)
	emergency_input_probe = false

func fixture_board(id: String) -> void:
	var life: ProtoTransitService = main.transit
	main.player.global_position = life.catalog.stop_position(id)+Vector3.UP*0.15 # Explicit lifecycle/death fixture staging, not travel evidence.
	main.player.velocity = Vector3.ZERO
	main.daynight.hour = 11.9
	main.backpack.slots["scrip"] = 20
	main.backpack.slots["scrap"] = 10
	main.weather.force("clear")
	await frames(90)
	await action("interact")
	await activate("reserve:lastline_"+("east" if id=="meridian_east" else "west"))
	await activate("board")
	check("fixture boards through real GUI",life.is_riding() and main.passenger_of_ai and main.player.process_mode==Node.PROCESS_MODE_DISABLED)

func player_colliders_enabled() -> bool:
	for child: Node in main.player.get_children():
		if child is CollisionShape3D and child.disabled:
			return false
	return true

func death_checks() -> void:
	var baseline: Dictionary = main.capture_save()
	for clone: bool in [false,true]:
		check("death fixture initial checkpoint restore",main.apply_save(baseline.duplicate(true)))
		if clone:
			# Explicit banked scan fixture; actual R must use the existing clone branch.
			main.cloning.backup = {"record":main.character.to_record(),"wake_pos":[125.0,0.0,-320.0],"day_h":24.0,"vat":true,"defect":{"tax":12.0}}
			main.cloning.journal = [{"day":1,"line":"retained death regression"}]
		await fixture_board("meridian_east")
		var life: ProtoTransitService = main.transit
		var coach: ProtoTransitVehicle = life.vehicles.lastline_coach
		var coach_id: int = coach.get_instance_id()
		var clone_before: Dictionary = main.cloning.serialize()
		var deaths_before: int = main.deaths
		main.character.take_wound("torso",1000.0)
		await frames(5)
		check("actual passenger wound kills rider, not coach",main.character.dead and not coach.dead and life.is_riding(),{"clone":clone,"dead":main.character.dead,"coach_dead":coach.dead,"riding":life.is_riding()})
		var ticket: Dictionary = life.record()
		var corpse: Vector3 = main.player.global_position
		await action("interact")
		check("dead rider cannot bypass R through roadside exit",main.character.dead and life.is_riding() and life.record()==ticket and main.backpack.slots.scrip==18)
		var dead_record: Dictionary = main.character.to_record()
		var hunger_marker: float = main._last_hunger_hr
		var disk_before: String = FileAccess.get_file_as_string(main.SAVE_PATH)
		set_checkpoint_path("user://absent_directory/refused.save")
		await action("drivn_reload")
		var expected: Dictionary = dead_record.duplicate(true)
		expected.hunger = maxf(0.0,float(dead_record.hunger)-2.8*(float(main._last_hunger_hr)-hunger_marker))
		var after: Dictionary = main.character.to_record()
		check("denied respawn keeps ordinary hunger cadence running",absf(float(after.hunger)-float(expected.hunger))<0.0000001,{"before":dead_record.hunger,"after":after.hunger,"expected":expected.hunger,"marker_before":hunger_marker,"marker_after":main._last_hunger_hr})
		# Hunger has its independent exact-law assertion above; every other
		# character field is compared exactly without suspending world time.
		expected.erase("hunger")
		after.erase("hunger")
		check("denied R respawn leaves dead ownership, wallet, deaths and clone unchanged",main.character.dead and after==expected and life.record()==ticket and life.is_riding() and main.passenger_of_ai and main.player.process_mode==Node.PROCESS_MODE_DISABLED and main.backpack.slots.scrip==18 and main.backpack.slots.scrap==10 and main.deaths==deaths_before and main.cloning.serialize()==clone_before and FileAccess.get_file_as_string(main.SAVE_PATH)==disk_before,{"clone":clone,"dead":main.character.dead,"character_before":expected,"character_after":after,"ticket_equal":life.record()==ticket,"riding":life.is_riding(),"passenger":main.passenger_of_ai,"process":main.player.process_mode,"wallet":main.backpack.slots,"deaths":main.deaths,"expected_deaths":deaths_before,"corpse_displacement":main.player.global_position.distance_to(corpse)})
		set_checkpoint_path(main.SAVE_PATH)
		if not main.character.dead:
			check("R respawn restores all foot ownership",not life.is_riding() and not main.passenger_of_ai and main.player.process_mode==Node.PROCESS_MODE_INHERIT and player_colliders_enabled(),{"riding":life.is_riding(),"passenger":main.passenger_of_ai,"process":main.player.process_mode,"colliders":player_colliders_enabled()})
			continue # Preserve RED; do not fake another death to make retry pass.
		await action("drivn_reload")
		var wake: Vector3 = Vector3(125,0.3,-320) if clone else main.SAFEHOUSE+Vector3.UP*0.3
		check("R retry revives at chosen wake with full foot ownership",not main.character.dead and not main.player.dead_vis and not life.is_riding() and not main.passenger_of_ai and main.active_car==null and main.mode==main.Mode.FOOT and main.player.process_mode==Node.PROCESS_MODE_INHERIT and player_colliders_enabled() and main.player.global_position.distance_to(wake)<0.5 and main.cam_rig.target==main.player,{"clone":clone,"position":str(main.player.global_position),"expected_wake":str(wake),"riding":life.is_riding(),"process":main.player.process_mode,"colliders":player_colliders_enabled()})
		if main.character.dead:
			continue
		check("death toll precedes one full fare refund; clone bank survives",main.backpack.slots.scrip==15 and main.backpack.slots.scrap==6 and main.deaths==deaths_before+1 and main.cloning.serialize()==clone_before and (not clone or is_equal_approx(main.character.hp,main.character.hp_cap()-12.0)),{"clone":clone,"wallet":main.backpack.slots,"deaths":main.deaths,"hp":main.character.hp,"cap":main.character.hp_cap()})
		var disk: Dictionary = str_to_var(FileAccess.get_file_as_string(main.SAVE_PATH))
		var saved_pos := Vector3(float(disk.player.pos[0]),float(disk.player.pos[1]),float(disk.player.pos[2]))
		check("death checkpoint atomically contains revived player, toll, refund, fleet and death count",not disk.player.character.dead and disk.transit.ticket.is_empty() and disk.transit.last_end.reason=="service_failed" and disk.transit.last_end.refund==2 and disk.transit_fleet.coach_stop=="meridian_east" and disk.player.backpack.scrip==15 and disk.player.backpack.scrap==6 and disk.deaths==deaths_before+1 and saved_pos.distance_to(wake)<0.01)
		check("respawn preserves halted coach and blocks further session sales",life.vehicles.lastline_coach.get_instance_id()==coach_id and not life._ending_reason.is_empty())
		var foot: Vector3 = main.player.global_position
		await action("move_right",30)
		check("revived player actually moves under foot input",main.player.global_position.distance_to(foot)>0.3,{"distance":main.player.global_position.distance_to(foot)})
		await action("drivn_reload")
		check("second living R neither refunds nor taxes again",main.backpack.slots.scrip==15 and main.backpack.slots.scrap==6 and main.deaths==deaths_before+1)
		check("death recovery checkpoint reload succeeds",main.load_game())
		await frames(20)
		check("reload replaces interrupted coach exactly once and preserves wake/toll",life.vehicles.size()==1 and life.vehicles.lastline_coach.get_instance_id()!=coach_id and main.backpack.slots.scrip==15 and main.deaths==deaths_before+1 and main.player.global_position.distance_to(wake)<0.5)
	check("non-transit death fixture restores old run",main.apply_save(baseline.duplicate(true)))
	main.backpack.slots["scrip"] = 20
	main.backpack.slots["scrap"] = 10
	main.character.take_wound("torso",1000.0)
	await action("drivn_reload")
	check("ordinary non-transit R keeps existing toll with no transit refund",not main.character.dead and main.deaths==int(baseline.deaths)+1 and main.backpack.slots.scrip==14 and main.backpack.slots.scrap==6 and main.transit.record().ticket.is_empty())

func reboard_checks() -> void:
	var life: ProtoTransitService = main.transit
	var origin: String = "richmond" if scenario=="reboard_west" else "meridian_east"
	var destination: String = "meridian_east" if origin=="richmond" else "richmond"
	var initial: Dictionary = main.capture_save()
	initial.transit_fleet.coach_stop = origin
	check("explicit reboard initial fleet checkpoint staging",main.apply_save(initial))
	await fixture_board(origin)
	var coach: ProtoTransitVehicle = life.vehicles.lastline_coach
	var start: Vector3 = coach.global_position
	var deadline: int = Time.get_ticks_msec()+45000
	while coach.global_position.distance_to(start)<12.0 and Time.get_ticks_msec()<deadline:
		await frames(1)
	check("initial real departure creates the retained driver",life._departed and is_instance_valid(life._driver) and coach.global_position.distance_to(start)>12.0)
	print("DRIVER BEFORE RESTORE: ",JSON.stringify({"service_driver":str(life._driver),"vehicle_driver":str(coach.ai_driver),"same":coach.ai_driver==life._driver}))
	var id: int = coach.get_instance_id()
	# Deliberate destination checkpoint fixture, NOT arrival evidence. Full east/west
	# journeys independently establish physical arrival and no-active-ticket saves.
	var destination_run: Dictionary = initial.duplicate(true)
	destination_run.transit_fleet.coach_stop = destination
	destination_run.clock.hour = 11.9
	var stand: Vector3 = life.catalog.stop_position(destination)+Vector3.UP*0.15
	destination_run.player.pos = [stand.x,stand.y,stand.z]
	check("staged destination reload retains healthy body",main.apply_save(destination_run) and life.vehicles.lastline_coach.get_instance_id()==id)
	check("restore detaches matching driver before deferred deletion",coach.ai_driver==null,{"vehicle_driver":str(coach.ai_driver),"valid":is_instance_valid(coach.ai_driver),"queued":coach.ai_driver.is_queued_for_deletion() if is_instance_valid(coach.ai_driver) else false})
	await frames(90)
	print("DRIVER AFTER DEFERRED FREE: ",JSON.stringify({"vehicle_driver":str(coach.ai_driver),"null_comparison":coach.ai_driver==null,"valid":is_instance_valid(coach.ai_driver)}))
	check("retained coach detaches freed driver reference",coach.ai_driver==null,{"valid_driver":is_instance_valid(coach.ai_driver),"expected":"null reference before reboarding"})
	main.daynight.hour = 11.9
	await action("interact")
	await activate("reserve:lastline_"+("east" if destination=="meridian_east" else "west"))
	life.panel.close()
	var boarding: Vector3 = coach.anchor_world("Boarding")
	main.player.global_position = boarding+(boarding-life.catalog.stop_position(destination)).normalized()*2.8 # Door-side interaction fixture, not vehicle travel.
	await frames(3)
	await action("interact")
	check("reboarding door input opens the same panel away from counter",life.panel.is_open and not life.can_open(destination))
	await activate("board")
	check("retained coach reboards with completed player ownership",life.is_riding() and main.passenger_of_ai and main.player.process_mode==Node.PROCESS_MODE_DISABLED and not player_colliders_enabled() and coach._roof.get_surface_override_material(0)!=null,{"riding":life.is_riding(),"passenger":main.passenger_of_ai,"colliders_enabled":player_colliders_enabled()})
	start = coach.global_position
	deadline = Time.get_ticks_msec()+45000
	while coach.global_position.distance_to(start)<12.0 and Time.get_ticks_msec()<deadline:
		await frames(1)
	check("reboarded reverse service departs through real drivetrain",life._departed and is_instance_valid(life._driver) and coach.ai_driver==life._driver and coach.global_position.distance_to(start)>12.0 and not main.character.dead,{"distance":coach.global_position.distance_to(start),"dead":main.character.dead})

func capture(id: String) -> void:
	if capture_dir.is_empty():
		return
	DirAccess.make_dir_recursive_absolute(capture_dir)
	await RenderingServer.frame_post_draw
	check("capture " + id, get_viewport().get_texture().get_image().save_png(capture_dir.path_join(id + ".png")) == OK)

func finish() -> void:
	print("TRANSIT COACH: %d passed, %d failed" % [passed, failed])
	get_tree().quit(1 if failed else 0)
