## STAGE 8 rung 1 proof — the SCOUT DRONE (Robotics ladder): deploy from the
## pack, it patrols overhead and PINGS threats into your perception, the Second
## Window rides its eye (V), and a dead battery lands it as a pickup — the bird
## always comes home. Run: godot --headless --path game res://proto3d/tests/drone_sim.tscn
extends Node

var main: Node3D
var t: float = 0.0
var phase: int = 0
var phase_t: float = 0.0
var passed: int = 0
var failed: int = 0
var _step: int = 0
var _lurk: ProtoLurker = null


func _ready() -> void:
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	print("DRN: scene up")


func _check(name: String, ok: bool) -> void:
	if ok:
		passed += 1
		print("DRN: PASS - %s" % name)
	else:
		failed += 1
		print("DRN: FAIL - %s" % name)


func _tap_interact() -> void:
	for pressed in [true, false]:
		var ev := InputEventAction.new()
		ev.action = "interact"
		ev.pressed = pressed
		Input.parse_input_event(ev)


func _key(code: Key, pressed: bool) -> void:
	var ev := InputEventKey.new()
	ev.keycode = code
	ev.physical_keycode = code
	ev.pressed = pressed
	Input.parse_input_event(ev)


func _next() -> void:
	phase += 1
	phase_t = 0.0
	_step = 0


func _physics_process(delta: float) -> void:
	t += delta
	phase_t += delta
	match phase:
		0:
			if phase_t > 0.6:
				_tap_interact()
				main.player.global_position = Vector3(6, 0.3, 300)
				main.player.velocity = Vector3.ZERO
				_next()
		1: # DEPLOY: the item leaves the pack, the bird goes up
			if _step == 0:
				_step = 1
				main.backpack.add("drone", 1)
				# The REAL use path: the panel's USE button consumes on success.
				main.panel._on_use(main.backpack, "drone")
			elif phase_t > 1.2:
				_check("drone DEPLOYS from the pack (item consumed)", main.drone != null and main.backpack.count("drone") == 0)
				_check("...and it's AIRBORNE (y %.1f)" % main.drone.global_position.y, main.drone.global_position.y > 4.0)
				# ONE PRESS = deploy AND fly (playtest #6) — assert, then release
				# to AUTONOMY: the pilot owns battery/shutoff while flying
				# (drone.gd:194), and phases 3-4 test the AUTONOMOUS bird.
				_check("...and ONE press put you at the stick (piloted)", main.drone.piloted)
				main.drone_pilot.abort_to_autonomy()
				main.drone.piloted = false
				main.drone.parked = false
				main.drone.mode = ProtoDrone.DroneMode.PATROL
				_next()
		2: # THE SECOND WINDOW rides the drone's eye
			if _step == 0:
				_step = 1
				_key(KEY_V, true)
				_key(KEY_V, false)
			elif phase_t > 0.4:
				_check("V rides the drone's eye (DRONE mode)", main.sview.mode == ProtoSecondaryView.SVMode.DRONE)
				_check("...camera AT the bird (%.1fm)" % main.sview.cam_global().distance_to(main.drone.global_position),
					main.sview.cam_global().distance_to(main.drone.global_position) < 4.0)
				_next()
		3: # SCOUT: a threat under the patrol ring pings YOUR perception
			if _step == 0:
				_step = 1
				_lurk = ProtoLurker.create()
				_lurk.stalk_range = 0.0
				main.add_child(_lurk)
				_lurk.global_position = main.player.global_position + Vector3(18, 0.4, 0) # on the patrol ring
			elif main.vision_cone.reveal_active():
				_check("the bird PINGS movement into your perception", true)
				_next()
			elif phase_t > 6.0:
				_check("the bird PINGS movement into your perception", false)
				_next()
		4: # BATTERY: dies → the bird lands itself as a pickup (nothing lost)
			if _step == 0:
				_step = 1
				main.drone.battery = 1.2
			elif main.drone == null:
				var found := false
				for node in main.get_children():
					if node is ProtoChest and node.container.label == "Landed drone" and node.container.count("drone") == 1:
						found = true
				_check("battery dead → the bird LANDS as a pickup (drone recoverable)", found)
				_next()
			elif phase_t > 5.0:
				_check("battery dead → the bird LANDS as a pickup", false)
				_next()
		5:
			print("DRN RESULTS: %d passed, %d failed" % [passed, failed])
			print("DRN: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
			get_tree().quit(0 if failed == 0 else 1)

	if t > 35.0:
		print("DRN: TIMEOUT in phase %d" % phase)
		print("DRN RESULTS: %d passed, %d failed" % [passed, failed])
		get_tree().quit(1)
