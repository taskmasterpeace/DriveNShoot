## THE REMOTE + THE EYE (drone fix 2026-07-09) — regression proof for the owner's
## report: "can't control them / the remote disappears after launch / the home
## drone doesn't work." Three shipped bugs, three laws:
##  · THE REMOTE LAW — deploying a pack drone CONSUMES the drone row (the bird
##    leaves the bag) but hands you a DRONE REMOTE row; the old flow consumed the
##    item and then said "use it again to take the stick" — impossible with one.
##  · THE STICK — USE the remote and the pilot session starts for real (dock
##    scouts too, which never had ANY control path before).
##  · THE EYE + PAIRING — a dock launch is WATCHABLE (split view follows the
##    scout out and folds when it docks; the remote survives a homecoming), and
##    the remote dies with the bird (pack-up folds it, shot-down strips it).
## Staging positions is the documented exception; every verb here is the real
## API the panel/keys drive (use_item mirrors container_panel's consume contract,
## steering and landing ride parse_input_event through the real action rows).
## Run: godot --headless --path game res://proto3d/tests/drone_remote_sim.tscn
extends Node

const ISO := Vector3(6, 0.35, 388) ## the proven isolated staging spot

var passed := 0
var failed := 0
var main: Node3D
var _prev_ts: float = 1.0


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("REMOTE: %s - %s" % ["PASS" if ok else "FAIL", check_name])


## Mirror container_panel._on_use: the panel consumes the row IFF use_item says so.
func _panel_use(id: String) -> void:
	if main.use_item(id):
		main.backpack.remove(id, 1)


func _tap_interact() -> void:
	var down := InputEventKey.new()
	down.keycode = KEY_E
	down.physical_keycode = KEY_E
	down.pressed = true
	Input.parse_input_event(down)
	await get_tree().physics_frame
	await get_tree().physics_frame
	var up := InputEventKey.new()
	up.keycode = KEY_E
	up.physical_keycode = KEY_E
	up.pressed = false
	Input.parse_input_event(up)
	await get_tree().physics_frame


func _ready() -> void:
	print("REMOTE: start")
	get_tree().create_timer(110.0).timeout.connect(func() -> void:
		print("REMOTE: WATCHDOG")
		print("REMOTE RESULTS: %d passed, %d failed" % [passed, failed + 1])
		print("REMOTE: FAILURES PRESENT")
		Engine.time_scale = _prev_ts
		get_tree().quit(1))
	_prev_ts = Engine.time_scale
	Engine.time_scale = 2.5
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 10:
		await get_tree().process_frame
	# The game boots at the wheel — the stick is a FOOT verb, so stage the walker.
	main.mode = main.Mode.FOOT
	main.active_car = null
	main.player.global_position = ISO

	# --- A: THE REMOTE LAW — deploy hands you the controller --------------------
	main.backpack.add("drone", 1)
	_panel_use("drone")
	await get_tree().physics_frame
	_check("deploy puts a bird in the sky", main.drone != null and is_instance_valid(main.drone))
	_check("the drone row left the bag (the bird IS the item)", main.backpack.count("drone") == 0)
	_check("THE REMOTE appeared in the pack", main.backpack.count("drone_remote") == 1)

	# --- B: THE STICK — the remote starts a real pilot session ------------------
	_panel_use("drone_remote")
	await get_tree().physics_frame
	_check("USE remote takes the stick (pilot active)", main.drone_pilot.is_active())
	_check("the bird knows it's piloted", main.drone != null and main.drone.piloted)
	_check("the split view is up", main.split_view.active)
	_check("the remote was NOT consumed by piloting", main.backpack.count("drone_remote") == 1)
	# Fly it with the REAL key: W (move_up) through the input map, ~1.5s of stick.
	var start_pos: Vector3 = main.drone.global_position
	var w_down := InputEventKey.new()
	w_down.keycode = KEY_W
	w_down.physical_keycode = KEY_W
	w_down.pressed = true
	Input.parse_input_event(w_down)
	for _i in 40:
		await get_tree().physics_frame
	var w_up := InputEventKey.new()
	w_up.keycode = KEY_W
	w_up.physical_keycode = KEY_W
	w_up.pressed = false
	Input.parse_input_event(w_up)
	await get_tree().physics_frame
	var moved: float = Vector2(main.drone.global_position.x - start_pos.x,
		main.drone.global_position.z - start_pos.z).length()
	_check("the stick FLIES the bird (moved %.1f m)" % moved, moved > 2.0)
	# E brings it in: LANDING first, OFF when it touches down.
	await _tap_interact()
	_check("E in the air starts a LANDING (not a vanish)",
		main.drone_pilot.state == ProtoDronePilot.PState.LANDING)
	var t := 0.0
	while t < 12.0 and main.drone_pilot.is_active():
		await get_tree().physics_frame
		t += get_physics_process_delta_time()
	_check("the landing completes (pilot OFF)", not main.drone_pilot.is_active())
	_check("the split folded with the session", not main.split_view.active)
	_check("the bird PARKED where it set down", main.drone != null and main.drone.parked)

	# --- C: PACK-UP PAIRING — the controller folds into the kit -----------------
	main.player.global_position = main.drone.global_position + Vector3(1.2, 0, 0)
	main.player.global_position.y = 0.35
	for _i in 6:
		await get_tree().physics_frame # let the interact scan find the parked bird
	await _tap_interact()
	await get_tree().physics_frame
	_check("E packs the landed bird (drone row back)", main.backpack.count("drone") == 1)
	_check("the remote folded with it", main.backpack.count("drone_remote") == 0)
	_check("no bird registered", main.drone == null or not is_instance_valid(main.drone))

	# --- D: THE HOME DRONE — dock launch is watchable and comes home ------------
	main.backpack.remove("drone", 1) # the dock owns its own bird — clear the bag
	var dock: ProtoDroneDock = main.drone_dock
	main.player.global_position = dock.global_position + Vector3(1.0, 0.35, 0.6)
	for _i in 6:
		await get_tree().physics_frame
	await _tap_interact()
	await get_tree().physics_frame
	_check("E at the dock launches the ROUTE scout",
		main.drone != null and is_instance_valid(main.drone)
		and main.drone.mode == ProtoDrone.DroneMode.ROUTE_OUT)
	_check("THE EYE: the split follows the scout out",
		main.split_view.active and main.split_view._remote == main.drone)
	_check("the dock handed you a REMOTE", main.backpack.count("drone_remote") == 1)
	_check("the dock prompt reads the bird as OUT",
		dock.interact_prompt(main).contains("OUT"))
	# Let it fly the whole route home (out ~120 m, back to the pad, dock).
	t = 0.0
	while t < 55.0 and main.drone != null and is_instance_valid(main.drone):
		await get_tree().physics_frame
		t += get_physics_process_delta_time()
	_check("the bird came HOME and docked", main.drone == null or not is_instance_valid(main.drone))
	_check("the dock is CHARGING (a quarter of the day)", dock.charging)
	_check("the eye folded on the homecoming", not main.split_view.active)
	_check("the homecoming KEEPS the remote", main.backpack.count("drone_remote") == 1)
	var flights_before: int = dock.flights
	await _tap_interact()
	await get_tree().physics_frame
	_check("the charge law holds — no relaunch while charging",
		dock.flights == flights_before and (main.drone == null or not is_instance_valid(main.drone)))

	# --- E: SIGNAL LOST — the remote dies with the bird -------------------------
	main.player.global_position = ISO
	main.backpack.add("drone", 1)
	_panel_use("drone")
	await get_tree().physics_frame
	_check("second deploy tops the remote up to ONE, never two",
		main.backpack.count("drone_remote") == 1)
	main.drone.take_damage(999.0)
	await get_tree().physics_frame
	_check("shot down strips the paired remote", main.backpack.count("drone_remote") == 0)
	_check("the bird is gone from the ledger", main.drone == null or not is_instance_valid(main.drone))

	Engine.time_scale = _prev_ts
	print("REMOTE RESULTS: %d passed, %d failed" % [passed, failed])
	print("REMOTE: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
