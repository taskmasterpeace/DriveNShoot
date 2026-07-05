## Dog system proof — input-driven. Adopts each type and verifies its signature:
## Security rear-smell, Hunter stash-nose, Companion instant obedience, Cuddle calm
## aura + the Stress vital throttling stamina regen. Commands: E stay/follow, C whistle.
## Run: godot --headless --path game res://proto3d/tests/dog_sim.tscn
extends Node

var main: Node3D
var t: float = 0.0
var phase: int = 0
var phase_t: float = 0.0
var passed: int = 0
var failed: int = 0
var _sec: ProtoDog
var _hun: ProtoDog
var _com: ProtoDog
var _cud: ProtoDog
var _lurker: ProtoLurker
var _mark: float = 0.0


func _ready() -> void:
	var packed: PackedScene = load("res://proto3d/proto3d.tscn")
	main = packed.instantiate()
	add_child(main)
	print("DOG: scene up")


func _check(name: String, ok: bool) -> void:
	if ok:
		passed += 1
		print("DOG: PASS - %s" % name)
	else:
		failed += 1
		print("DOG: FAIL - %s" % name)


func _tap_interact() -> void:
	var ev := InputEventAction.new()
	ev.action = "interact"
	ev.pressed = true
	Input.parse_input_event(ev)
	var ev2 := InputEventAction.new()
	ev2.action = "interact"
	ev2.pressed = false
	Input.parse_input_event(ev2)


func _key(code: Key, down: bool) -> void:
	var ev := InputEventKey.new()
	ev.keycode = code
	ev.physical_keycode = code
	ev.pressed = down
	Input.parse_input_event(ev)


func _place_player(pos: Vector3) -> void:
	main.player.global_position = pos
	main.player.velocity = Vector3.ZERO


func _dog(type: int) -> ProtoDog:
	for d in main.all_dogs:
		if d.dog_type == type:
			return d
	return null


func _next() -> void:
	phase += 1
	phase_t = 0.0


func _physics_process(delta: float) -> void:
	t += delta
	phase_t += delta
	match phase:
		0: # settle + find dogs
			if phase_t > 0.6:
				_sec = _dog(ProtoDog.DogType.SECURITY)
				_hun = _dog(ProtoDog.DogType.HUNTER)
				_com = _dog(ProtoDog.DogType.COMPANION)
				_cud = _dog(ProtoDog.DogType.CUDDLE)
				_check("all four dog types spawned at the kennel", _sec != null and _hun != null and _com != null and _cud != null)
				_tap_interact() # exit the car
				_next()
		1: # adopt Security
			if phase_t > 0.5:
				_place_player(_sec.global_position + Vector3(1.0, 0, 0))
				_next()
		2:
			if phase_t > 0.5:
				_check("adopt prompt shows", main.hud.current_prompt.contains("Adopt"))
				_tap_interact()
				_next()
		3: # walk away; dog should follow (obey delay 0.5 then follow)
			if phase_t > 0.8:
				_check("Security adopted", _sec.adopted and main.dogs.has(_sec))
				Input.action_press("move_up")
				_next()
		4: # walk, then wait for the dog to CONVERGE (not a fixed-time snapshot)
			if phase_t > 2.5:
				Input.action_release("move_up")
			var dd := _sec.global_position.distance_to(main.player.global_position)
			if phase_t > 2.5 and dd < 6.5:
				_check("Security FOLLOWS through real movement (%.1f m)" % dd, true)
				# Spawn a lurker BEHIND the player (facing is -Z after walking north)
				_lurker = ProtoLurker.create()
				main.add_child(_lurker)
				_lurker.global_position = main.player.global_position + Vector3(0, 0.4, 9.0)
				main.last_dog_alert = {}
				_next()
			elif phase_t > 7.0:
				_check("Security FOLLOWS through real movement (timeout)", false)
				_next()
		5: # rear-smell
			if not main.last_dog_alert.is_empty():
				_check("rear-smell: dog alerted, flagged BEHIND", main.last_dog_alert.get("behind", false) == true)
				_lurker.queue_free()
				_next()
			elif phase_t > 4.0:
				_check("rear-smell: dog alerted, flagged BEHIND", false)
				_lurker.queue_free()
				_next()
		6: # stay command holds
			if phase_t > 0.6:
				_place_player(_sec.global_position + Vector3(0.9, 0, 0))
				_next()
		7:
			if phase_t > 0.5:
				if main.hud.current_prompt.contains("Stay"):
					_tap_interact()
					_next()
				elif phase_t > 2.0:
					_check("stay prompt available", false)
					_next()
		8:
			if phase_t > 1.0: # obey delay
				Input.action_press("move_up")
				_next()
		9:
			if phase_t > 2.2:
				Input.action_release("move_up")
				var d := _sec.global_position.distance_to(main.player.global_position)
				_check("STAY holds while you walk off (%.1f m)" % d, d > 7.0)
				_key(KEY_C, true)
				_next()
		10: # whistle brings the pack back — converge, don't snapshot
			if phase_t > 0.15:
				_key(KEY_C, false)
			var wd := _sec.global_position.distance_to(main.player.global_position)
			if phase_t > 1.0 and wd < 6.5:
				_check("WHISTLE (C) recalls the dog (%.1f m)" % wd, true)
				_next()
			elif phase_t > 7.0:
				_check("WHISTLE (C) recalls the dog (%.1f m, timeout)" % wd, false)
				_next()
		11: # Hunter: adopt at kennel -> stash within nose range pings
			if phase_t > 0.4:
				main.last_dog_nose = {}
				_place_player(_hun.global_position + Vector3(1.0, 0, 0))
				_next()
		12:
			if phase_t > 0.5:
				_tap_interact()
				_next()
		13:
			if not main.last_dog_nose.is_empty():
				_check("Hunter NOSE pings the safehouse stash", true)
				_check("Bloodhound BREED boosts the nose (%.0f m > 30)" % _hun.params()["nose_radius"], _hun.params()["nose_radius"] > 30.0)
				_next()
			elif phase_t > 4.0:
				_check("Hunter NOSE pings the safehouse stash", false)
				_next()
		14: # Companion: instant obedience (no delay) — adopt then immediate follow state
			if phase_t > 0.4:
				_place_player(_com.global_position + Vector3(1.0, 0, 0))
				_next()
		15:
			if phase_t > 0.5:
				_tap_interact()
				_next()
		16:
			if phase_t > 0.15: # near-instant
				_check("Companion obeys INSTANTLY (state=FOLLOW at %.2fs)" % phase_t, _com.state == ProtoDog.DogState.FOLLOW)
				_next()
		17: # Cuddle: calm aura drains stress; stress throttles stamina regen
			if phase_t > 0.4:
				_place_player(_cud.global_position + Vector3(1.0, 0, 0))
				_next()
		18:
			if phase_t > 0.5:
				_tap_interact()
				_next()
		19:
			if phase_t > 1.0:
				main.stress = 60.0
				_mark = 60.0
				_next()
		20: # stand near Biscuit — converge, don't snapshot (pack crowding varies)
			if main.stress < _mark - 18.0:
				_check("Cuddle aura melts stress (60 -> %.0f)" % main.stress, true)
				_check("stress throttles stamina regen (mult %.2f)" % main.player.stamina_regen_mult, main.player.stamina_regen_mult < 0.9)
				_next()
			elif phase_t > 7.0:
				_check("Cuddle aura melts stress (60 -> %.0f, timeout)" % main.stress, false)
				_next()
		21:
			print("DOG RESULTS: %d passed, %d failed" % [passed, failed])
			print("DOG: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
			get_tree().quit(0 if failed == 0 else 1)

	if t > 55.0:
		print("DOG: TIMEOUT in phase %d" % phase)
		print("DOG RESULTS: %d passed, %d failed" % [passed, failed])
		get_tree().quit(1)
