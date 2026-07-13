## Proof for THE INFECTED I2: the ECHO type (THE_INFECTED.md §0.8) — "a worker that waits;
## it NEVER advances on you." A variant ROW with advances:false; ProtoInfected drops any
## acquired chase target so the echo idles at its task while a shambler closes on the noise.
## Type exists + behaves; spawn-mix (share) deferred to the owner/INDEX. Run:
##   godot --headless --path game res://proto3d/tests/infected_echo_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node3D


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("ECHO: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _ready() -> void:
	print("ECHO: start")
	get_tree().create_timer(60.0).timeout.connect(func() -> void:
		print("ECHO: WATCHDOG"); print("ECHO: FAILURES PRESENT"); get_tree().quit(1))
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 8:
		await get_tree().process_frame

	ProtoInfected.ensure_rows()
	_check("the ECHO type exists as a variant row", ProtoInfected.rows.has("echo"))
	var er: Dictionary = ProtoInfected.rows.get("echo", {})
	_check("the Echo is a worker that WAITS (advances:false)", bool(er.get("advances", true)) == false)
	_check("its bundle carries the CLIMBER tag (§0.16)", "climber" in (er.get("tags", []) as Array))

	# --- it holds its spot at a loud noise; a shambler closes ------------------
	var stage := Vector3(6, 0.4, 388)
	var echo: ProtoInfected = ProtoInfected.create("echo")
	main.add_child(echo)
	echo.global_position = stage + Vector3(15, 0, 0)
	var shamb: ProtoInfected = ProtoInfected.create("shambler")
	main.add_child(shamb)
	shamb.global_position = stage + Vector3(-15, 0, 0)
	for _i in 4:
		await get_tree().physics_frame
	var d0_e: float = echo.global_position.distance_to(stage)
	var d0_s: float = shamb.global_position.distance_to(stage)
	for i in 150:
		if i % 12 == 0:
			main.emit_noise(stage, 95.0, "horn")
		await get_tree().physics_frame
	var closed_e: float = d0_e - echo.global_position.distance_to(stage)
	var closed_s: float = d0_s - shamb.global_position.distance_to(stage)
	_check("the Echo HOLDS its spot — never advances on the noise (closed %.1fm)" % closed_e, closed_e < 1.5)
	_check("...while a shambler DOES close on it (%.1fm > %.1fm)" % [closed_s, closed_e], closed_s > closed_e + 0.8)

	print("ECHO RESULTS: %d passed, %d failed" % [passed, failed])
	print("ECHO: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
