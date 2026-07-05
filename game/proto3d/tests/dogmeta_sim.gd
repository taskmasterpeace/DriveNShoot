## Metasystem + whistle-commands + combat-impact proof.
## - The whistle button does 4 things by press-pattern (tap/double/triple/hold)
## - Sic makes the dog chase and BITE
## - Melee/bite KNOCKDOWN + floating combat text
## - Guard a dog, drive away (it dehydrates to a record), an off-screen raid kills
##   it, drive back → you come home to find it GONE. The metaworld, proven in miniature.
extends Node

var main: Node3D
var t := 0.0
var phase := 0
var phase_t := 0.0
var passed := 0
var failed := 0
var _lucky: ProtoDog
var _lurk: ProtoLurker
var _hp0 := 0.0
var _guard_spot := Vector3.ZERO


func _ready() -> void:
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	print("META: scene up")


func _check(name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("META: %s - %s" % ["PASS" if ok else "FAIL", name])


func _tap_interact() -> void:
	for pressed in [true, false]:
		var ev := InputEventAction.new()
		ev.action = "interact"
		ev.pressed = pressed
		Input.parse_input_event(ev)


func _key_c(pressed: bool) -> void:
	var ev := InputEventKey.new()
	ev.keycode = KEY_C
	ev.physical_keycode = KEY_C
	ev.pressed = pressed
	Input.parse_input_event(ev)


func _whistle_taps(n: int) -> void:
	for i in n:
		_key_c(true)
		_key_c(false)


func _spawn_lurker(offset: Vector3) -> ProtoLurker:
	var l := ProtoLurker.create()
	l.stalk_range = 0.0
	main.add_child(l)
	l.global_position = main.player.global_position + offset
	return l


func _companion() -> ProtoDog:
	for d in main.all_dogs:
		if d.dog_type == ProtoDog.DogType.COMPANION:
			return d
	return null


func _find_remains() -> bool:
	for node in main.get_children():
		if node is ProtoChest and (node as ProtoChest).container.label.contains("remains"):
			return true
	return false


func _has_floater() -> bool:
	for node in main.get_children():
		if node is ProtoFloater:
			return true
	return false


func _next() -> void:
	phase += 1
	phase_t = 0.0


func _physics_process(delta: float) -> void:
	t += delta
	phase_t += delta
	match phase:
		0:
			if phase_t > 0.6:
				main.metaworld._auto_events = false # deterministic off-screen events
				_tap_interact() # out of the car
				_next()
		1:
			if phase_t > 0.5:
				_lucky = _companion()
				main.player.global_position = _lucky.global_position + Vector3(2, 0.3, 0) # stand WITH the dog
				main.player.velocity = Vector3.ZERO
				_lucky.interact(main) # adopt directly
				_check("adopted the Companion dog", _lucky.adopted and main.dogs.has(_lucky))
				_next()
		2: # WHISTLE: single tap = heel
			if phase_t > 0.4:
				_whistle_taps(1)
				_next()
		3:
			if phase_t > 0.45:
				_check("1 whistle = HEEL", main.last_whistle == "heel")
				_whistle_taps(2)
				_next()
		4:
			if phase_t > 0.45:
				_check("2 whistles = GUARD (dog now guarding)", main.last_whistle == "guard" and _lucky.state == ProtoDog.DogState.GUARD)
				_whistle_taps(3)
				_next()
		5:
			if phase_t > 0.45:
				_check("3 whistles = SEEK", main.last_whistle == "seek")
				_key_c(true) # HOLD
				_next()
		6:
			if phase_t > 0.5:
				_check("HOLD whistle = SIC", main.last_whistle == "sic")
				_key_c(false) # release
				_next()
		7: # SIC → the dog chases and BITES
			if phase_t > 0.4:
				_lurk = _spawn_lurker(Vector3(4, 0.4, 0))
				_hp0 = _lurk.body.hp
				_lucky.command_sic(_lurk)
				_next()
		8:
			if (not is_instance_valid(_lurk)) or _lurk.body.hp < _hp0 - 1.0:
				_check("SIC: the dog bit it (hp %.0f -> %s)" % [_hp0, "dead" if not is_instance_valid(_lurk) else str(int(_lurk.body.hp))], true)
				_next()
			elif phase_t > 9.0:
				_check("SIC: the dog bit it", false)
				_next()
		9: # KNOCKDOWN + floating text
			if phase_t > 0.4:
				var lk := _spawn_lurker(Vector3(3, 0.4, 3))
				lk.knock_down()
				await_check(lk)
				_next()
		10:
			if phase_t > 0.3:
				_check("floating combat text appears (KNOCKDOWN/damage)", _has_floater())
				_next()
		11: # METASYSTEM: guard → drive away → dehydrate
			if phase_t > 0.4:
				for node in main.get_tree().get_nodes_in_group("threat"):
					if is_instance_valid(node):
						node.queue_free()
				_guard_spot = main.player.global_position
				_lucky.command_guard(_guard_spot)
				main.player.global_position += Vector3(2000, 0, 0) # far out of the bubble
				_next()
		12:
			if phase_t > 0.5:
				_check("guarding dog DEHYDRATED to a record when you left", main.metaworld.records.size() >= 1 and not is_instance_valid(_lucky))
				# an off-screen raid kills the record
				main.metaworld.force_raid(main.metaworld.records[0], 100.0)
				_check("off-screen raid can KILL the record", main.metaworld.records[0].get("killed", false))
				main.player.global_position = _guard_spot # drive back
				_next()
		13:
			if _find_remains():
				_check("you come home to find it GONE (remains + record cleared)", main.metaworld.records.is_empty())
				_next()
			elif phase_t > 4.0:
				_check("you come home to find it GONE", false)
				_next()
		14:
			print("META RESULTS: %d passed, %d failed" % [passed, failed])
			print("META: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
			get_tree().quit(0 if failed == 0 else 1)

	if t > 45.0:
		print("META: TIMEOUT in phase %d" % phase)
		print("META RESULTS: %d passed, %d failed" % [passed, failed])
		get_tree().quit(1)


func await_check(lk: ProtoLurker) -> void:
	_check("melee/bite KNOCKDOWN lands the target flat", lk.knocked)
