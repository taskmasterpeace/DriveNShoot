## Proof for THE GADGETS (goal): surveillance camera → the V-window CAMS feed, the
## walkie-talkie's chatter, the motion sensor's ping, the HUMVEE with its built-in drone
## bay, and THE CHARGE LAW (a quarter of the day, riding the game clock). Runs the REAL
## proto3d under the harness; real use_item calls, staged threats per test-standards.
## Run: godot --headless --path game res://proto3d/tests/gadget_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node = null


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("GADGET: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _threat_at(pos: Vector3) -> Node3D:
	var t := Node3D.new()
	main.add_child(t)
	t.add_to_group("threat")
	t.global_position = pos
	return t


func _ready() -> void:
	get_tree().create_timer(120.0).timeout.connect(func() -> void:
		print("GADGET: WATCHDOG")
		print("GADGET: DONE — %d passed, %d failed (WATCHDOG)" % [passed, failed + 1])
		get_tree().quit(1))
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 8:
		await get_tree().process_frame

	var ppos: Vector3 = main.player.global_position

	# --- 1. SURVEILLANCE CAMERA → the V-window (the old dog-cam slot) -------------
	_check("camera deploys via the real use path", main.use_item("surveil_cam"))
	_check("one camera registered", main.surveil_cams.size() == 1)
	var cam: ProtoSurveilCam = main.surveil_cams[0]
	# Press V like a player until the CAMS stop comes around (the spawn may start in the
	# car, so REARVIEW legitimately takes the first press).
	for _i in 4:
		if main.sview.mode == ProtoSecondaryView.SVMode.CAMS:
			break
		main.sview.cycle(main)
	_check("V reaches the CAMS feed", main.sview.mode == ProtoSecondaryView.SVMode.CAMS)
	main.sview.update_view(main)
	_check("the feed's eye sits ON the camera (%.1fm)" % main.sview.cam_global().distance_to(cam.cam_position()),
		main.sview.cam_global().distance_to(cam.cam_position()) < 1.0)
	cam.interact(main)       # pack it back up
	await get_tree().process_frame
	_check("packing up returns the camera to the pack", main.surveil_cams.is_empty()
		and main.backpack.count("surveil_cam") >= 1)

	# --- 2. WALKIE-TALKIE — chatter reveals nearby movement -----------------------
	var foe := _threat_at(ppos + Vector3(0, 0.4, -40))   # 40m north of you
	_check("keying the walkie works", main.use_item("walkie"))
	_check("chatter reports movement NORTH", main.last_walkie_report.contains("north"))
	foe.queue_free()
	await get_tree().process_frame
	main.use_item("walkie")
	_check("no threats → dead air", main.last_walkie_report == "dead air")

	# --- 3. MOTION SENSOR — pings when something crosses it ------------------------
	_check("sensor deploys", main.use_item("motion_sensor"))
	var sensor: ProtoMotionSensor = null
	for n in main.get_children():
		if n is ProtoMotionSensor:
			sensor = n
	_check("sensor is standing in the world", sensor != null)
	if sensor != null:
		var prowler := _threat_at(sensor.global_position + Vector3(4, 0.4, 0))
		sensor._physics_process(0.6)   # one full scan interval
		_check("a threat crossing it TRIPS the sensor", sensor.pings >= 1)
		var pings0: int = sensor.pings
		sensor._physics_process(0.6)   # still inside the 6s re-ping quiet time
		_check("quiet time between pings (no siren)", sensor.pings == pings0)
		prowler.queue_free()
		sensor.interact(main)
		await get_tree().process_frame
		_check("sensor packs back up", main.backpack.count("motion_sensor") >= 1)

	# --- 4. THE HUMVEE — military rig with a built-in drone bay --------------------
	var hv := ProtoCar3D.create("humvee", Color(0.32, 0.36, 0.28))
	main.add_child(hv)
	hv.global_position = ppos + Vector3(12, 0.8, 0)
	_check("the Humvee row exists (military spec: heavy + armored)",
		hv.display_name == "Humvee" and hv.mass == 2600.0 and bool(hv.spec.get("drone_bay", false)))
	var bay: ProtoDroneDock = null
	for c in hv.get_children():
		if c is ProtoDroneDock:
			bay = c
	_check("a REAL drone dock rides the rear deck", bay != null)

	# --- 5. THE CHARGE LAW — a quarter of the day, on the GAME clock ---------------
	_check("charge = 360 game-s (¼ of the 24-min day)", ProtoDroneDock.CHARGE_SECONDS == 360.0)
	var dock: ProtoDroneDock = main.drone_dock
	dock.charging = true
	dock._charge_t = ProtoDroneDock.CHARGE_SECONDS
	var prev_mult: float = main.daynight.dev_mult
	main.daynight.dev_mult = 60.0
	dock._physics_process(1.0)   # 1 real s × 60 = 60 game-s of charge
	main.daynight.dev_mult = prev_mult
	_check("the charge rides the GAME clock (60s drained in 1 fast-clock second)",
		absf(dock._charge_t - 300.0) < 0.01)
	_check("charge readout ~16%%", absf(dock.charge_pct() - (60.0 / 360.0 * 100.0)) < 0.5)
	dock._charge_t = 0.5
	dock._physics_process(1.0)
	_check("a full charge clears the dock for relaunch", not dock.charging)

	print("GADGET: DONE — %d passed, %d failed" % [passed, failed])
	get_tree().quit(1 if failed > 0 else 0)
