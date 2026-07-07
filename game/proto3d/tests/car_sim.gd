## The Living Car proof — 5-part anatomy, death spiral, fuel, husk, hotwire.
## Run: godot --headless --path game res://proto3d/tests/car_sim.tscn
extends Node

var main: Node3D
var car: ProtoCar3D
var t: float = 0.0
var phase: int = 0
var phase_t: float = 0.0
var passed: int = 0
var failed: int = 0
var _v0: float = 0.0


func _ready() -> void:
	var packed: PackedScene = load("res://proto3d/proto3d.tscn")
	main = packed.instantiate()
	add_child(main)
	print("CAR: scene up")


func _check(name: String, ok: bool) -> void:
	if ok:
		passed += 1
		print("CAR: PASS - %s" % name)
	else:
		failed += 1
		print("CAR: FAIL - %s" % name)


func _tap_interact() -> void:
	var ev := InputEventAction.new()
	ev.action = "interact"
	ev.pressed = true
	Input.parse_input_event(ev)
	# Release immediately — a stuck 'pressed' state would begin hotwiring on arrival.
	var ev2 := InputEventAction.new()
	ev2.action = "interact"
	ev2.pressed = false
	Input.parse_input_event(ev2)


func _next() -> void:
	phase += 1
	phase_t = 0.0


func _physics_process(delta: float) -> void:
	t += delta
	phase_t += delta
	match phase:
		0: # take direct control of the starting car
			if phase_t > 0.6:
				car = main.cars[0]
				car.use_player_input = false
				car.input_throttle = 1.0
				_next()
		1: # healthy baseline
			if phase_t > 1.5:
				_v0 = car.forward_speed
				_check("healthy car accelerates (%.1f m/s)" % _v0, _v0 > 8.0)
				car.components["engine"].hp = 0.0 # BROKEN
				_next()
		2: # broken engine = no drive
			if phase_t > 1.5:
				_check("BROKEN engine won't drive (%.1f -> %.1f m/s)" % [_v0, car.forward_speed], car.forward_speed < _v0)
				_check("dashboard reads engine BROKEN", car.dashboard()["engine"] == Damageable.Tier.BROKEN)
				car.components["engine"].hp = 100.0
				car.components["tires"].hp = 12.0 # CRITICAL
				_next()
		3: # worn tires = less grip (handling = baseline x condition)
			if phase_t > 0.5:
				var slip: float = car._front_wheels[0].wheel_friction_slip
				_check("CRITICAL tires cut grip (%.2f < %.2f)" % [slip, car.grip_front], slip < car.grip_front * 0.75)
				car.components["tires"].hp = 100.0
				car.fuel = 0.8
				_next()
		4: # dry tank = stall
			if phase_t > 3.2:
				_check("tank runs DRY under throttle (fuel %.1f)" % car.fuel, car.fuel <= 0.01)
				car.input_throttle = 0.0
				car.fuel = 100.0
				car.components["chassis"].hp = 35.0
				_next()
		5: # smoking
			if phase_t > 0.5:
				_check("chassis 35% -> SMOKING", car.dashboard()["smoking"] == true)
				car.components["chassis"].hp = 10.0
				_next()
		6: # on fire, cook rising
			if phase_t > 1.2:
				var d: Dictionary = car.dashboard()
				_check("chassis 10% -> ON FIRE", d["on_fire"] == true)
				_check("cook meter rising (%.0f%%)" % d["cook"], d["cook"] > 2.0)
				_tap_interact() # BAIL OUT of the burning car
				_next()
		7:
			if phase_t > 0.5:
				_check("bailed out while burning (on foot)", main.mode == 1)
				_next()
		8: # the spiral always ends in a burnt husk (wait for the wreck to settle)
			if car.dead and car.linear_velocity.length() < 1.5:
				_check("cooked off -> DESTROYED husk (always burnt)", true)
				main.player.global_position = car.global_position + Vector3(2.0, 0.3, 0)
				main.player.velocity = Vector3.ZERO
				_next()
			elif phase_t > 14.0:
				_check("cooked off -> DESTROYED husk (always burnt)", false)
				_next()
		9: # husk is salvage
			if phase_t > 0.6:
				_check("husk prompts salvage", main.hud.current_prompt.contains("Salvage"))
				_tap_interact()
				_next()
		10:
			if phase_t > 0.4:
				_check("salvaged the wreck", car.salvaged)
				# Hotwire the locked sedan with NO key — hold E.
				main.player.global_position = main.cars[1].global_position + Vector3(2.2, 0.3, 0)
				main.player.velocity = Vector3.ZERO
				_next()
		11:
			if phase_t > 0.5:
				# THE ENTRY LADDER (2026-07-07): the door offers the SMASH (or a quiet
				# pick with a lockpick); hot-wiring moved to the WHEEL (car_entry_sim).
				_check("no key -> the door offers the SMASH", main.hud.current_prompt.contains("smash"))
				Input.action_press("interact")
				_next()
		12: # hold it
			if not main.cars[1].locked:
				Input.action_release("interact")
				_check("HELD E smashes into the sedan (glass scar)", main.cars[1].window_broken)
				_next()
			elif phase_t > 8.0:
				Input.action_release("interact")
				_check("HELD E smashes into the sedan", false)
				_next()
		13:
			print("CAR RESULTS: %d passed, %d failed" % [passed, failed])
			print("CAR: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
			get_tree().quit(0 if failed == 0 else 1)

	if t > 50.0:
		print("CAR: TIMEOUT in phase %d" % phase)
		print("CAR RESULTS: %d passed, %d failed" % [passed, failed])
		get_tree().quit(1)
