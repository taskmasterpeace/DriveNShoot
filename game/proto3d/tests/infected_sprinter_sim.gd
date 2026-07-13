## Proof for THE INFECTED I2: the SPRINTER type (THE_INFECTED.md §0.1/§0.5 — "sprinter/
## echo/choir rows land at I2"). A fast, fragile variant — a data ROW the shipped
## ProtoInfected engine already reads (speed_mps/hp from the row). The TYPE exists and
## works here; the spawn-MIX (share) stays 0.0 = the owner/INDEX's call. It genuinely
## out-runs a shambler to a noise. No hot-file touch. Run:
##   godot --headless --path game res://proto3d/tests/infected_sprinter_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node3D


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("SPRINTER: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _ready() -> void:
	print("SPRINTER: start")
	get_tree().create_timer(60.0).timeout.connect(func() -> void:
		print("SPRINTER: WATCHDOG"); print("SPRINTER: FAILURES PRESENT"); get_tree().quit(1))
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 8:
		await get_tree().process_frame

	# --- The TYPE exists as a data row; the engine reads it ----------------------
	ProtoInfected.ensure_rows()
	_check("the SPRINTER type exists as a variant row", ProtoInfected.rows.has("sprinter"))
	var sr: Dictionary = ProtoInfected.rows.get("sprinter", {})
	var sh: Dictionary = ProtoInfected.rows.get("shambler", {})
	_check("its spawn-MIX is deferred (share 0.0 — the type is ready, the mix is the owner's call)",
		absf(float(sr.get("share", -1.0))) < 0.0001)
	_check("a sprinter is FASTER than a shambler (%.1f > %.1f m/s)" % [float(sr.get("speed_mps", 0)), float(sh.get("speed_mps", 0))],
		float(sr.get("speed_mps", 0)) > float(sh.get("speed_mps", 99)))
	_check("a sprinter is more FRAGILE (%d < %d hp)" % [int(sr.get("hp", 0)), int(sh.get("hp", 0))],
		float(sr.get("hp", 99)) < float(sh.get("hp", 0)))

	# --- create('sprinter') builds a real, fast hostile from that row -----------
	var spr: ProtoInfected = ProtoInfected.create("sprinter")
	main.add_child(spr)
	_check("create('sprinter') is a threat+combatant (the one damage law)",
		spr.is_in_group("threat") and spr.is_in_group("combatant"))
	_check("its body hp reads the sprinter row (%d)" % int(spr.body.hp),
		absf(spr.body.hp - float(sr.get("hp", 0))) < 0.5)

	# --- it OUT-RUNS a shambler to a loud noise ---------------------------------
	var stage := Vector3(6, 0.4, 388)
	var shamb: ProtoInfected = ProtoInfected.create("shambler")
	main.add_child(shamb)
	shamb.global_position = stage + Vector3(15, 0, 0)
	spr.global_position = stage + Vector3(-15, 0, 0)
	for _i in 4:
		await get_tree().physics_frame
	var d0_sh: float = shamb.global_position.distance_to(stage)
	var d0_spr: float = spr.global_position.distance_to(stage)
	for i in 150:
		if i % 12 == 0:
			main.emit_noise(stage, 95.0, "horn") # a standing beacon (re-emit past the TTL)
		await get_tree().physics_frame
	# Both start ~15 m out; the sprinter's speed row (2.8) should close MORE ground than
	# the shambler's (1.1) in the same window — compare displacement, not absolute position.
	var closed_sh: float = d0_sh - shamb.global_position.distance_to(stage)
	var closed_spr: float = d0_spr - spr.global_position.distance_to(stage)
	_check("the sprinter OUT-RUNS the shambler to the noise (closed %.1fm vs %.1fm)" % [closed_spr, closed_sh],
		closed_spr > closed_sh * 1.4)

	print("SPRINTER RESULTS: %d passed, %d failed" % [passed, failed])
	print("SPRINTER: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
