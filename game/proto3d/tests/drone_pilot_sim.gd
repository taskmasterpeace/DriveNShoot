## Proof for ProtoDronePilot (drone_pilot.gd) — the owner's drone-flying rules: body
## immobile only while flying, can't switch off in the air (lands first), attack → hover
## in place (never falls) + body regains control, land from hover. Drives the REAL state
## machine one manual delta at a time. Run:
## godot --headless --path game res://proto3d/tests/drone_pilot_sim.tscn
extends Node

var passed := 0
var failed := 0


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("PILOT: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _drone() -> Node3D:
	var d := Node3D.new()
	d.position = Vector3(0, ProtoDronePilot.FLY_H, 0)
	add_child(d)
	return d


func _advance(pilot: ProtoDronePilot, frames: int, step: float = 1.0 / 60.0) -> void:
	for _i in frames:
		pilot.update(step)


func _ready() -> void:
	var pilot := ProtoDronePilot.new()
	add_child(pilot)
	var offs := {"n": 0}
	pilot.shut_off.connect(func() -> void: offs["n"] += 1)

	# OFF baseline.
	_check("starts OFF, body free, inactive", pilot.state == ProtoDronePilot.PState.OFF and not pilot.body_immobile() and not pilot.is_active())

	# START → FLYING: body freezes, split shows.
	var d := _drone()
	_check("start() takes off (→ FLYING)", pilot.start(d) and pilot.state == ProtoDronePilot.PState.FLYING)
	_check("body is immobile while flying", pilot.body_immobile())
	_check("split view shows while flying", pilot.split_should_show())
	_check("can't start a second session", not pilot.start(d))

	# PILOT input moves the bird.
	var x0 := d.global_position.x
	pilot.pilot_input(Vector3(1, 0, 0))
	_advance(pilot, 30)
	_check("piloting moves the drone (x grew %.1f)" % (d.global_position.x - x0), d.global_position.x > x0 + 1.0)

	# CAN'T switch off in the air — request_off begins a LANDING, not an instant off.
	_check("drone is airborne", d.global_position.y > ProtoDronePilot.GROUND_Y + 1.0)
	pilot.request_off()
	_check("request_off in air → LANDING (not OFF)", pilot.state == ProtoDronePilot.PState.LANDING)
	_check("body FREES the moment you stop flying", not pilot.body_immobile())
	_advance(pilot, 200)
	_check("landing completes → OFF", pilot.state == ProtoDronePilot.PState.OFF)
	_check("shut_off fired once on landing", int(offs["n"]) == 1)
	_check("drone ended on the ground", absf(d.global_position.y - ProtoDronePilot.GROUND_Y) < 0.1)

	# ATTACK while flying → HOVER: bird stays in the sky, body regains control.
	var d2 := _drone()
	pilot.start(d2)
	pilot.on_attacked()
	_check("attack while flying → HOVER", pilot.state == ProtoDronePilot.PState.HOVER)
	_check("body is free again after bailing", not pilot.body_immobile())
	_check("split hides once you're back on your body", not pilot.split_should_show())
	_advance(pilot, 120)
	_check("a hovering bird does NOT fall out of the sky", d2.global_position.y > ProtoDronePilot.FLY_H - 1.0)

	# From HOVER you can send it down to land.
	pilot.land()
	_check("land() from HOVER → LANDING", pilot.state == ProtoDronePilot.PState.LANDING)
	_advance(pilot, 200)
	_check("hovered bird lands and shuts off", pilot.state == ProtoDronePilot.PState.OFF)

	# Off when already grounded is immediate (no needless landing).
	var d3 := _drone()
	pilot.start(d3)
	d3.global_position.y = ProtoDronePilot.GROUND_Y   # already down
	pilot.request_off()
	_check("request_off while grounded → OFF immediately", pilot.state == ProtoDronePilot.PState.OFF)

	# Losing the drone mid-flight (shot down) fails safe to OFF.
	var d4 := _drone()
	pilot.start(d4)
	d4.free()
	pilot.update(0.1)
	_check("a destroyed drone fails safe to OFF", pilot.state == ProtoDronePilot.PState.OFF)

	print("PILOT: DONE — %d passed, %d failed" % [passed, failed])
	get_tree().quit(1 if failed > 0 else 0)
