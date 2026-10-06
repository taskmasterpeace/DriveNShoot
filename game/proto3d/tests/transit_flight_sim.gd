extends Node3D
## Physical flight acceptance. Initial fixture staging is explicit; travel uses
## real player input and the production force controller, never transform jumps.
var main: Node
var passed: int = 0
var failed: int = 0
var scenario: String = "east"
var capture_dir: String = ""
var previous_scale: float

func check(label: String, ok: bool) -> void:
	passed += int(ok)
	failed += int(not ok)
	print("TRANSIT FLIGHT %s: %s" % ["PASS" if ok else "FAIL",label])

func frames(count: int) -> void:
	for i: int in count:
		await get_tree().physics_frame

func action(id: String, hold: int = 5) -> void:
	for pressed: bool in [true,false]:
		var event := InputEventAction.new()
		event.action = id
		event.pressed = pressed
		Input.parse_input_event(event)
		await get_tree().process_frame
		await get_tree().process_frame
		await frames(hold if pressed else 5)

func _ready() -> void:
	previous_scale = Engine.time_scale
	var owned: String = ProjectSettings.globalize_path("res://../build/").replace("\\","/").simplify_path().to_lower().trim_suffix("/")+"/"
	for key: String in ["APPDATA","LOCALAPPDATA"]:
		if not OS.get_environment(key).replace("\\","/").simplify_path().to_lower().begins_with(owned):
			get_tree().quit(2)
			return
	for arg: String in OS.get_cmdline_user_args():
		if arg.begins_with("--scenario="):
			scenario = arg.trim_prefix("--scenario=")
		if arg.begins_with("--capture-dir="):
			capture_dir = arg.trim_prefix("--capture-dir=")
	get_tree().create_timer(165.0).timeout.connect(func() -> void:
		print("TRANSIT FLIGHT FAIL: watchdog")
		Engine.time_scale = previous_scale
		get_tree().quit(2))
	main = load("res://proto3d/proto3d.tscn").instantiate()
	add_child(main)
	await frames(20)
	await action("interact")
	check("initial car exits through input",main.mode == main.Mode.FOOT)
	check("one real KESTREL body available alongside LASTLINE",main.transit.vehicles.has("kestrel_courier") and main.transit.vehicles.size() == 2)
	check("physical interest query exists for independent running bodies",main.transit.has_method("streaming_positions"))
	check("force flight driver available",ResourceLoader.exists("res://proto3d/transit/flight_driver.gd"))
	if failed == 0:
		if scenario == "weather":
			await weather_checks()
		elif scenario == "streaming":
			await streaming_checks()
		else:
			await journey()
	finish()

func activate(id: String) -> void:
	var button: Button = main.transit.panel.actions.get(id)
	check("real GUI action enabled: "+id,button != null and not button.disabled)
	if button == null or button.disabled:
		return
	button.grab_focus()
	await get_tree().process_frame
	await get_tree().process_frame
	await action("ui_accept")

func weather_at(pos: Vector3, kind: String, intensity: float) -> void:
	# A real stationary small weather field; age produces exact core intensity.
	main.weather.systems = [{"kind":kind,"pos":Vector2(pos.x,pos.z),"radius":60.0,"vel":Vector2.ZERO,"ttl_h":10.0,"age_h":intensity}]

func weather_checks() -> void:
	main.player.global_position = main.transit.stops.meridian_east.global_position+Vector3.UP*0.15 # initial counter fixture
	main.daynight.hour = 11.8
	main.backpack.slots.scrip = 30
	main.weather.force("clear")
	await frames(60)
	for endpoint: String in ["meridian_east","richmond"]:
		for kind: String in ["dust","rain"]:
			var threshold: float = 0.55 if kind == "dust" else 0.85
			for offset: float in [-0.001,0.0,0.001]:
				weather_at(main.transit.stops[endpoint].pad,kind,threshold+offset)
				var wallet: Dictionary = main.backpack.slots.duplicate(true)
				check("departure threshold %s %s %.3f" % [endpoint,kind,threshold+offset],main.transit.can_reserve("kestrel_east") == (offset < 0.0))
				if offset >= 0.0:
					main.transit.reserve("kestrel_east")
					check("weather denial never charges wallet",main.backpack.slots == wallet and main.transit.record().ticket.is_empty())
	main.weather.force("clear")

func walk_to(target: Vector3) -> void:
	var started: int = Time.get_ticks_msec()
	while main.player.global_position.distance_to(target) > 1.3 and Time.get_ticks_msec()-started<20000:
		var delta_pos: Vector3 = target-main.player.global_position
		for binding: String in ["move_up","move_down","move_left","move_right"]:
			var event := InputEventAction.new()
			event.action = binding
			event.pressed = (binding=="move_up" and delta_pos.z < -0.5) or (binding=="move_down" and delta_pos.z > 0.5) or (binding=="move_left" and delta_pos.x < -0.5) or (binding=="move_right" and delta_pos.x > 0.5)
			Input.parse_input_event(event)
		await get_tree().process_frame
		await frames(3)
	for binding: String in ["move_up","move_down","move_left","move_right"]:
		var event := InputEventAction.new()
		event.action = binding
		Input.parse_input_event(event)
	await get_tree().process_frame
	await frames(5)
	check("real walking input reaches pad approach",main.player.global_position.distance_to(target)<1.8)

func journey() -> void:
	var origin: String = "richmond" if scenario == "west" else "meridian_east"
	var destination: String = "meridian_east" if scenario == "west" else "richmond"
	var route_id: String = "kestrel_west" if scenario == "west" else "kestrel_east"
	main.player.global_position = main.transit.stops[origin].global_position+Vector3.UP*0.15 # initial fixture only
	main.player.velocity = Vector3.ZERO
	main.daynight.hour = 11.7
	main.weather.force("clear")
	main.backpack.slots.scrip = 30
	if scenario == "west":
		var run: Dictionary = main.capture_save()
		run.transit_fleet = {"version":1,"coach_stop":"meridian_east","helicopter_stop":"richmond"}
		check("west initial persisted fleet fixture",main.apply_save(run))
	await frames(60)
	await action("interact")
	check("shared counter panel opens",main.transit.panel.is_open)
	await activate("reserve:"+route_id)
	check("flight ticket costs exactly fifteen",main.backpack.slots.scrip==15)
	check("counter cannot remotely board distant pad",not main.transit.can_board())
	await action("interact")
	var stop: Node3D = main.transit.stops[origin]
	# Walk around shelter through the established open apron, then to door.
	await walk_to(stop.global_position+stop.east*5.0)
	await walk_to(stop.pad+stop.east*5.0)
	await capture("01_actual_pad_approach")
	var car: ProtoTransitVehicle = main.transit.vehicles.kestrel_courier
	await walk_to(car.anchor_world("Boarding"))
	await action("interact")
	check("pad door opens same panel beyond counter reading radius",main.transit.panel.is_open and main.player.global_position.distance_to(stop.global_position)>30)
	await activate("board")
	check("same passenger ownership boards actual aircraft",main.transit.is_riding() and main.active_car == car and main.passenger_of_ai)
	if not main.transit.is_riding():
		return
	var start: Vector3 = car.global_position
	var previous: Vector3 = start
	var step: float = 0.0
	var height: float = 0.0
	var fuel: float = car.fuel
	var captured: Dictionary = {}
	var begin: int = Time.get_ticks_msec()
	while main.transit.is_riding() and Time.get_ticks_msec()-begin<130000:
		await frames(1)
		step = maxf(step,previous.distance_to(car.global_position))
		previous = car.global_position
		height = maxf(height,car.global_position.y-ProtoWorldBuilder.ground_y(car.global_position.x,car.global_position.z))
		var agl: float = car.global_position.y-ProtoWorldBuilder.ground_y(car.global_position.x,car.global_position.z)
		for label: String in ["02_takeoff","03_cabin_cruise","04_approach","05_touchdown"]:
			var reached: bool = (label=="02_takeoff" and agl>5 and agl<13) or (label=="03_cabin_cruise" and agl>22) or (label=="04_approach" and car.global_position.distance_to(main.transit.stops[destination].pad)<40 and height>15) or (label=="05_touchdown" and agl<0.5 and height>15)
			if reached and not captured.has(label):
				captured[label] = true
				await capture(label)
		if agl>15 and not captured.has("exit_rejected"):
			captured.exit_rejected = true
			await action("interact")
			check("airborne tap cannot drop passenger",main.transit.is_riding())
	check("real continuous takeoff gains cruise height",height>22 and step<2.0)
	check("flight consumes actual carried vehicle fuel",car.fuel<fuel-0.1)
	check("actual far-pad arrival releases grounded foot passenger",not main.transit.is_riding() and main.mode==main.Mode.FOOT and car.global_position.distance_to(main.transit.stops[destination].pad)<2.0)
	check("normal arrival retains fifteen fare",main.backpack.slots.scrip==15)
	await capture("06_foot_exit")

func streaming_checks() -> void:
	var stream: Variant = main.stream
	var player_pos: Vector3 = main.player.global_position
	var remote := Vector3(6400,30,6400) # labeled far-terrain floor fixture, NOT route travel
	var interest: Array[Vector3] = [remote,remote]
	stream.update_stream(player_pos,main,interest)
	check("missing actual service center materialized immediately",stream.loaded.has("50,50"))
	check("service-only floor never reveals player fog",not stream.visited.has("50,50"))
	var center: Node = stream.loaded.get("50,50")
	for i: int in 8:
		stream.update_stream(player_pos,main,interest)
	check("live service center node retained",stream.loaded.get("50,50")==center)
	var extra: int = 0
	for key: String in stream.loaded:
		if key.begins_with("49,") or key.begins_with("50,") or key.begins_with("51,"):
			extra += 1
	check("duplicate body interests request exactly nine chunks",extra==9)
	stream.update_stream(remote,main,interest)
	check("actual player arrival reveals already materialized center",stream.visited.has("50,50"))
	stream.update_stream(player_pos,main,[])
	check("released remote center normally unloads",not stream.loaded.has("50,50"))
	check("stale released service requests removed",not stream._load_queue.any(func(c: Vector2i) -> bool: return c.x>=49))

func capture(label: String) -> void:
	if DisplayServer.get_name()=="headless":
		return
	DirAccess.make_dir_recursive_absolute(capture_dir)
	await get_tree().process_frame
	await RenderingServer.frame_post_draw
	var path: String = capture_dir+"/"+label+".png"
	check("raw GPU capture "+label,get_viewport().get_texture().get_image().save_png(path)==OK)
	print("CAPTURE: "+path)

func finish() -> void:
	Engine.time_scale = previous_scale
	print("TRANSIT FLIGHT RESULT: %d passed / %d failed" % [passed,failed])
	get_tree().quit(1 if failed else 0)
