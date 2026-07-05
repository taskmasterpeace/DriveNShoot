## LIFE proof: the day/night clock + the pack riding along. Night shrinks your
## sight and lights the headlamps; T-wait sprints the clock; dogs hop in when
## you drive, calm you when petted, come to the HORN, and eat when hurt.
## Inputs drive everything; teleports only stage positions (documented exception).
## Run: godot --headless --path game res://proto3d/tests/life_sim.tscn
extends Node

var main: Node3D
var t: float = 0.0
var phase: int = 0
var phase_t: float = 0.0
var passed: int = 0
var failed: int = 0
var _did: bool = false
var _step: int = 0
var _lucky: ProtoDog = null
var _h0: float = 0.0


func _ready() -> void:
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	print("LIF: scene up")


func _check(name: String, ok: bool) -> void:
	if ok:
		passed += 1
		print("LIF: PASS - %s" % name)
	else:
		failed += 1
		print("LIF: FAIL - %s" % name)


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


func _tap_key(code: Key) -> void:
	_key(code, true)
	_key(code, false)


func _place(p: Vector3) -> void:
	main.player.global_position = p
	main.player.velocity = Vector3.ZERO


func _next() -> void:
	phase += 1
	phase_t = 0.0
	_did = false
	_step = 0


func _physics_process(delta: float) -> void:
	t += delta
	phase_t += delta
	match phase:
		0: # boot, on foot in the open
			if phase_t > 0.6:
				_tap_interact()
				_place(Vector3(6, 0.3, 300))
				_next()
		1: # HIGH NOON: full sight, lights off, sun icon
			if not _did:
				_did = true
				main.daynight.hour = 13.0
			elif phase_t > 1.6:
				_check("noon is not dark", not main.daynight.is_dark())
				_check("full sight in daylight (%.0fm)" % main.vision_cone.last_range_m, main.vision_cone.last_range_m > 30.0)
				_check("clock reads day (%s)" % main.daynight.clock_text(), main.daynight.clock_text().contains("☀️"))
				_check("headlights off in daylight", not main.cars[0].headlights_on)
				_next()
		2: # DEEP NIGHT: sight SHRINKS, headlights answer on their own
			if not _did:
				_did = true
				main.daynight.hour = 2.0
			elif phase_t > 2.0:
				_check("2 AM is dark", main.daynight.is_dark())
				_check("night taxes your EYES (cone %.0fm < 24)" % main.vision_cone.last_range_m, main.vision_cone.last_range_m < 24.0)
				_check("headlights come on at dark", main.cars[0].headlights_on)
				_check("clock reads night (%s)" % main.daynight.clock_text(), main.daynight.clock_text().contains("🌙"))
				_next()
		3: # HOLD T TO WAIT: the clock sprints
			if not _did:
				_did = true
				_h0 = main.daynight.hour
				_key(KEY_T, true)
			elif phase_t > 1.0:
				_key(KEY_T, false)
				var advanced: float = main.daynight.hour - _h0
				_check("holding T sprints the clock (+%.1fh in 1s)" % advanced, advanced > 0.5)
				_next()
		4: # ADOPT + the pack RIDES ALONG (auto-board on entering the car)
			if _step == 0:
				_step = 1
				for node in main.all_dogs:
					if node.dog_name == "Lucky":
						_lucky = node
				_place(_lucky.global_position + Vector3(1.2, 0, 0))
				_lucky.interact(main) # adopt (cone_sim precedent)
				var car: ProtoCar3D = main.cars[0]
				_place(car.global_position - car.global_basis.x * 2.0)
			elif _step == 1 and phase_t > 0.5:
				_step = 2
				# Stage Lucky on the car's FAR side at tap time: near the car (board
				# range) but clearly farther from the player than the car — the E
				# prompt picks the nearest interactable, and followers CHASE you,
				# so any pre-placed spot drifts (the flake this replaces).
				_lucky.global_position = main.cars[0].global_position + main.cars[0].global_basis.x * 2.5 + Vector3(0, 0.3, 0)
				_lucky.velocity = Vector3.ZERO
				_tap_interact() # enter the car — Lucky should hop in (exactly one tap)
			elif _step == 2 and phase_t > 1.0:
				_check("Lucky HOPS IN when you drive (riding)", _lucky.riding_in == main.cars[0])
				_check("...and rides hidden in the cab", not _lucky.visible)
				_next()
		5: # PET the rider (P): nerves settle in the cab
			if _step == 0:
				_step = 1
				main.stress = 60.0
				_tap_key(KEY_P)
			elif phase_t > 0.4:
				_check("petting the rider settles nerves (stress %.0f < 60)" % main.stress, main.stress <= 51.0)
				_next()
		6: # arrive somewhere, hop out — the dog hops out WITH you
			if _step == 0:
				_step = 1
				Input.action_press("move_up")
			elif _step == 1 and phase_t > 1.5:
				_step = 2
				Input.action_release("move_up")
				Input.action_press("move_down")
			elif _step == 2 and phase_t > 3.2:
				_step = 3
				Input.action_release("move_down")
				_tap_interact() # get out
			elif _step == 3 and phase_t > 3.8:
				_check("Lucky hops OUT with you", _lucky.riding_in == null and _lucky.visible)
				_check("...right beside the vehicle (%.1fm)" % _lucky.global_position.distance_to(main.cars[0].global_position),
					_lucky.global_position.distance_to(main.cars[0].global_position) < 7.0)
				_next()
		7: # THE HORN: guard the dog, drive off, honk — it comes running
			if _step == 0:
				_step = 1
				_lucky.command_guard(_lucky.global_position)
			elif _step == 1 and phase_t > 0.5:
				_step = 2
				_tap_interact() # back in the car
			elif _step == 2 and phase_t > 1.0:
				_step = 3
				# GUARD dogs hold their post even inside board range — only FOLLOWERS ride.
				_check("a GUARDING dog holds its post (no auto-board)", _lucky.riding_in == null)
				Input.action_press("move_up")
			elif _step == 3 and phase_t > 2.2:
				_step = 4
				Input.action_release("move_up")
				Input.action_press("move_down") # brake before you lean on the horn
			elif _step == 4 and phase_t > 3.4:
				_step = 5
				Input.action_release("move_down")
				_tap_key(KEY_H) # HOOOONK
			elif _step == 5 and phase_t > 5.0:
				_check("the HORN calls the pack off guard duty (Lucky heels)", _lucky.state == ProtoDog.DogState.FOLLOW)
				_tap_interact() # out of the car for the feed test
				_next()
		8: # FEED a hurt dog: meat heals the pack
			if _step == 0:
				_step = 1
				# settle a beat after exiting the car
			elif _step == 1 and phase_t > 0.6:
				_step = 2
				_lucky.take_damage(30.0) # 50 -> 20
				main.backpack.add("meat", 2)
				_place(_lucky.global_position + Vector3(1.0, 0, 0))
				_lucky.interact(main) # E — feed path wins while hurt + meat in the pack
			elif _step == 2 and phase_t > 1.0:
				_check("meat heals the hurt dog (hp %.0f ≥ 45)" % _lucky.hp, _lucky.hp >= 45.0)
				_check("...and the meat is EATEN (1 left)", main.backpack.count("meat") == 1)
				_next()
		9:
			print("LIF RESULTS: %d passed, %d failed" % [passed, failed])
			print("LIF: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
			get_tree().quit(0 if failed == 0 else 1)

	if t > 45.0:
		print("LIF: TIMEOUT in phase %d" % phase)
		print("LIF RESULTS: %d passed, %d failed" % [passed, failed])
		get_tree().quit(1)
