## Proof for the DRONE POLISH pass (goal: small QoL, high impact, low code): the battery
## drains while YOU fly and an empty one auto-LANDS (never a mid-air vanish), a pilot-
## landed bird PARKS (grabbable, rotors still) and its patrol re-anchors, E packs a landed
## bird back into the pack, and a flying bird is NOT grabbable. Run:
## godot --headless --path game res://proto3d/tests/drone_polish_sim.tscn
extends Node

var passed := 0
var failed := 0


class StubMain:
	extends Node
	var backpack := ProtoContainer.new("Pack")
	var drone: Node = null
	var notes: Array = []
	func notify(t: String) -> void: notes.append(t)


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("POLISH: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _ready() -> void:
	var main := StubMain.new()
	add_child(main)

	# --- Battery drains under YOUR stick; empty auto-LANDS. ------------------------
	var bird := ProtoDrone.create(main, Vector3.ZERO)
	add_child(bird)
	bird.global_position = Vector3(0, 8, 0)
	bird.piloted = true
	main.drone = bird
	var pilot := ProtoDronePilot.new()
	add_child(pilot)
	pilot.start(bird)
	var b0: float = bird.battery
	for _i in 60:
		pilot.update(1.0 / 60.0)
	_check("piloted flight drains the battery (%.1f → %.1f)" % [b0, bird.battery], bird.battery < b0 - 0.9)
	bird.battery = 0.4
	for _i in 60:
		pilot.update(1.0 / 60.0)
	_check("an empty battery brings the bird DOWN (LANDING/OFF, not a vanish)",
		pilot.state == ProtoDronePilot.PState.LANDING or pilot.state == ProtoDronePilot.PState.OFF)
	for _i in 200:
		pilot.update(1.0 / 60.0)
	_check("it lands and shuts off", pilot.state == ProtoDronePilot.PState.OFF and bird.global_position.y < 1.0)

	# --- PARK on pilot landing (the proto3d shut_off wire, replayed here). ---------
	bird.piloted = false
	bird.parked = true
	bird._anchor = bird.global_position
	bird._physics_process(1.0)   # a parked bird's autonomy stands DOWN
	_check("a parked bird stays put (no patrol climb)", bird.global_position.y < 1.0)
	_check("a parked bird reads as landed (grabbable)", bird.landed())
	_check("the pack-up prompt shows", bird.interact_prompt(main) != "")

	# --- E packs it up: item back, world ref cleared, node gone. -------------------
	bird.interact(main)
	await get_tree().process_frame
	_check("E returns the drone to the pack", main.backpack.count("drone") == 1)
	_check("the world ref is cleared", main.drone == null)
	_check("the bird is gone from the world", not is_instance_valid(bird))

	# --- A FLYING bird is not grabbable. --------------------------------------------
	var high := ProtoDrone.create(main, Vector3.ZERO)
	add_child(high)
	high.global_position = Vector3(0, 8, 0)
	_check("a flying bird shows no grab prompt", high.interact_prompt(main) == "")
	var before: int = main.backpack.count("drone")
	high.interact(main)
	_check("E on a flying bird does nothing", is_instance_valid(high) and main.backpack.count("drone") == before)

	print("POLISH: DONE — %d passed, %d failed" % [passed, failed])
	get_tree().quit(1 if failed > 0 else 0)
