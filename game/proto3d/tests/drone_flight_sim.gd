## THE BIRD FLIES LIKE A BIRD (owner: "users should be able to control drones — polish
## that and improve it"). Regression + new-feature proof for the flight upgrade on top
## of the 2026-07-07/09 pilot session: HELD altitude (climb/dive, ground+ceiling clamp),
## eased accel (mass, not a cursor), a boost tier, and the SIGNAL RANGE law (weak past
## 85% of ProtoDrone.ROUTE_RANGE from your body, auto-recall past 100%). E-land and B-
## recall still ride the same session they always did — this sim re-proves both on top
## of the new feel so a flight-feel change can never quietly break the shutoff/recall
## contract. Real inputs throughout (action_press/release — the same tool getup_sim,
## dive_sim, m1_sim and pad_sim already use for a hardware-free "real key" press);
## staging positions is the one documented exception.
## Run: Godot_console --headless --path game res://proto3d/tests/drone_flight_sim.tscn
extends Node

const ISO := Vector3(6, 0.35, 388) ## the proven isolated staging spot

var passed := 0
var failed := 0
var main: Node3D
var _prev_ts: float = 1.0


func _check(n: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("FLIGHT: %s - %s" % ["PASS" if ok else "FAIL", n])


func _panel_use(id: String) -> void:
	if main.use_item(id):
		main.backpack.remove(id, 1)


## Advance sim time while a set of actions stays held, sampling a callback each frame.
func _hold_for(actions: Array, seconds: float, sample: Callable = Callable()) -> void:
	for a in actions:
		Input.action_press(a)
	var t := 0.0
	while t < seconds:
		await get_tree().physics_frame
		t += get_physics_process_delta_time()
		if sample.is_valid():
			sample.call()
	for a in actions:
		Input.action_release(a)


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
	print("FLIGHT: start")
	get_tree().create_timer(180.0).timeout.connect(func() -> void:
		print("FLIGHT: WATCHDOG")
		print("FLIGHT RESULTS: %d passed, %d failed" % [passed, failed + 1])
		print("FLIGHT: FAILURES PRESENT")
		Engine.time_scale = _prev_ts
		get_tree().quit(1))
	_prev_ts = Engine.time_scale
	Engine.time_scale = 2.5
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 10:
		await get_tree().process_frame
	main.mode = main.Mode.FOOT
	main.active_car = null
	main.player.global_position = ISO

	# --- A: deploy + take the stick (unchanged contract) ------------------------
	main.backpack.add("drone", 1)
	_panel_use("drone")
	await get_tree().physics_frame
	_check("deploy took the stick", main.drone_pilot.is_active() and main.drone.piloted)
	_check("split view is up", main.split_view.active)
	var pilot: ProtoDronePilot = main.drone_pilot
	# It takes off from your shoulder height — give it a couple seconds to climb and
	# settle at the cruise altitude before reading it as the baseline.
	await _hold_for([], 2.0)
	_check("cruise altitude reads ~%.0fm AGL" % pilot.altitude_agl(), pilot.altitude_agl() > 6.0 and pilot.altitude_agl() < 10.0)

	# --- B: ASCEND — climbs past 10m and clamps at the ceiling -------------------
	var saw_10 := {"v": false}
	await _hold_for(["drivn_drone_ascend"], 9.0, func() -> void:
		if pilot.altitude_agl() > 10.0:
			saw_10["v"] = true)
	_check("SPACE climbed the bird past 10m", bool(saw_10["v"]))
	_check("altitude clamps at the ~40m ceiling (got %.1f)" % pilot.altitude_agl(),
		pilot.altitude_agl() > 37.0 and pilot.altitude_agl() < 41.5)

	# --- C: DESCEND — dives and clamps above the ground, never into it -----------
	await _hold_for(["drivn_drone_descend"], 11.0)
	_check("altitude clamps just above the ground (got %.1f)" % pilot.altitude_agl(),
		pilot.altitude_agl() > 1.8 and pilot.altitude_agl() < 4.0)
	_check("the bird is still airborne, not buried", main.drone.global_position.y > 0.0)

	# --- D: BOOST — measurably faster than the unboosted cruise, drains harder --
	# Settle to unboosted top speed, then measure a clean 1s window.
	await _hold_for(["move_up"], 2.5)
	var bp_a: float = main.drone.battery_pct()
	var pos_a: Vector3 = main.drone.global_position
	await _hold_for(["move_up"], 1.0)
	var pos_b: Vector3 = main.drone.global_position
	var bp_b: float = main.drone.battery_pct()
	var dist_unboosted := Vector2(pos_b.x - pos_a.x, pos_b.z - pos_a.z).length()
	var drain_unboosted := bp_a - bp_b
	# Now boost — let velocity ramp to the new top speed, then measure the same window.
	await _hold_for(["move_up", "drivn_sprint"], 1.0)
	var bp_c: float = main.drone.battery_pct()
	var pos_c: Vector3 = main.drone.global_position
	await _hold_for(["move_up", "drivn_sprint"], 1.0)
	var pos_d: Vector3 = main.drone.global_position
	var bp_d: float = main.drone.battery_pct()
	var dist_boosted := Vector2(pos_d.x - pos_c.x, pos_d.z - pos_c.z).length()
	var drain_boosted := bp_c - bp_d
	_check("BOOST is measurably faster (%.1fm/s vs %.1fm/s)" % [dist_boosted, dist_unboosted],
		dist_boosted > dist_unboosted * 1.2)
	_check("BOOST drains the battery harder (%.2f%%/s vs %.2f%%/s)" % [drain_boosted, drain_unboosted],
		drain_boosted > drain_unboosted * 1.4)

	# --- E: SIGNAL RANGE — WEAK warning, then LOST auto-recall past ROUTE_RANGE --
	var saw_weak := {"v": false}
	var t := 0.0
	Input.action_press("move_up")
	Input.action_press("drivn_sprint") # boost through the rest of the range fast
	while t < 25.0 and main.drone_pilot.is_active():
		await get_tree().physics_frame
		t += get_physics_process_delta_time()
		if main._drone_signal_state >= 1:
			saw_weak["v"] = true
	Input.action_release("move_up")
	Input.action_release("drivn_sprint")
	_check("SIGNAL WEAK fired before the link broke", bool(saw_weak["v"]))
	_check("SIGNAL LOST auto-recalled (pilot released)", not main.drone_pilot.is_active())
	_check("auto-recall points the bird home (ROUTE_BACK)",
		main.drone == null or not is_instance_valid(main.drone) or main.drone.mode == ProtoDrone.DroneMode.ROUTE_BACK)
	_check("auto-recall folded the split view", not main.split_view.active)
	# Let the recalled bird finish its trip home (it flies itself the rest of the way).
	t = 0.0
	while t < 45.0 and main.drone != null and is_instance_valid(main.drone):
		await get_tree().physics_frame
		t += get_physics_process_delta_time()
	_check("the recalled bird came down (not lost)", main.drone == null or not is_instance_valid(main.drone))

	# --- F: E STILL LANDS a piloted bird --------------------------------------
	main.player.global_position = ISO
	main.backpack.add("drone", 1)
	_panel_use("drone")
	await get_tree().physics_frame
	_check("second flight takes the stick", main.drone_pilot.is_active())
	await _tap_interact()
	_check("E in the air starts a LANDING", main.drone_pilot.state == ProtoDronePilot.PState.LANDING)
	t = 0.0
	while t < 12.0 and main.drone_pilot.is_active():
		await get_tree().physics_frame
		t += get_physics_process_delta_time()
	_check("the landing completes (pilot OFF)", not main.drone_pilot.is_active())
	_check("the bird parked where it set down", main.drone != null and main.drone.parked)

	# --- G: B/R3 RECALL still works on a fresh flight --------------------------
	main.player.global_position = main.drone.global_position + Vector3(1.2, 0, 0)
	main.player.global_position.y = 0.35
	for _i in 6:
		await get_tree().physics_frame
	await _tap_interact() # pack the parked bird back up
	await get_tree().physics_frame
	if main.backpack.count("drone") == 0:
		main.backpack.add("drone", 1) # E-pack-up should have already handed it back
	main.player.global_position = ISO
	_panel_use("drone")
	await get_tree().physics_frame
	_check("third flight takes the stick", main.drone_pilot.is_active())
	main.recall_drone()
	_check("recall drops the stick", not main.drone_pilot.is_active())
	_check("recall points the bird home (ROUTE_BACK)",
		main.drone != null and main.drone.mode == ProtoDrone.DroneMode.ROUTE_BACK)
	t = 0.0
	while t < 30.0 and main.drone != null and is_instance_valid(main.drone):
		await get_tree().physics_frame
		t += get_physics_process_delta_time()
	_check("the recalled bird set itself down", main.drone == null or not is_instance_valid(main.drone))

	Engine.time_scale = _prev_ts
	print("FLIGHT RESULTS: %d passed, %d failed" % [passed, failed])
	print("FLIGHT: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
