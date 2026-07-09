## SURFACING (2026-07-09 playtest "we added a lot of systems but we ain't looking at
## nothing"). Proves two now-visible things:
##  · THE COMPASS ("we need a compass") — the ribbon is created and stores the fed heading.
##  · SPECTACLES ("where's all the spectacles?") — a race board is PLACED, reachable (in the
##    interactable group), on the waypoint ring so N finds it, and carries races to run.
## Run: Godot_console --headless --path game res://proto3d/tests/surfacing_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node3D
var _prev_ts: float = 1.0


func _check(n: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("SURF: %s - %s" % ["PASS" if ok else "FAIL", n])


func _ready() -> void:
	print("SURF: start")
	get_tree().create_timer(60.0).timeout.connect(func() -> void:
		print("SURF: WATCHDOG")
		print("SURF RESULTS: %d passed, %d failed" % [passed, failed + 1])
		print("SURF: FAILURES PRESENT")
		Engine.time_scale = _prev_ts
		get_tree().quit(1))
	_prev_ts = Engine.time_scale
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 24:
		await get_tree().process_frame # let the game loop feed the HUD
	main.mode = main.Mode.FOOT
	for _i in 8:
		await get_tree().physics_frame

	# --- THE COMPASS -----------------------------------------------------------
	_check("the compass ribbon was created by the HUD loop", main.hud._compass != null)
	main.hud.update_compass(deg_to_rad(90.0)) # feed East directly
	_check("the compass stores the fed heading (E = 90 deg)",
		main.hud._compass != null and is_equal_approx(main.hud._compass.heading, deg_to_rad(90.0)))

	# --- SPECTACLES: the race board ---------------------------------------------
	var board: Node = null
	for n in get_tree().get_nodes_in_group("interactable"):
		if n is ProtoRaceBoard:
			board = n
			break
	_check("a SPECTACLES race board is placed + interactable", board != null)
	var on_ring := false
	for wp in main.waypoints:
		if wp.size() >= 2 and wp[1] is Node and wp[1] == board:
			on_ring = true
			break
	_check("the race board is on the waypoint ring (N finds it)", on_ring)
	if board != null:
		_check("the board carries races to run", not board.races.is_empty())

	Engine.time_scale = _prev_ts
	print("SURF RESULTS: %d passed, %d failed" % [passed, failed])
	print("SURF: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
