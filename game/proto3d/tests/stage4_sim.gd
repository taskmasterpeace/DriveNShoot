## Stage 4 proof: melee (stamina-gated, quiet), grenades, reticle bloom, hood MG.
extends Node

var main: Node3D
var t := 0.0
var phase := 0
var phase_t := 0.0
var passed := 0
var failed := 0
var _lurk: ProtoLurker
var _base_spread := 0.0
var _stress0 := 0.0
var _mag0: int = 0


func _ready() -> void:
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	print("CBT: scene up")


func _check(name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("CBT: %s - %s" % ["PASS" if ok else "FAIL", name])


func _tap_interact() -> void:
	for pressed in [true, false]:
		var ev := InputEventAction.new()
		ev.action = "interact"
		ev.pressed = pressed
		Input.parse_input_event(ev)


func _click() -> void:
	for pressed in [true, false]:
		var ev := InputEventMouseButton.new()
		ev.button_index = MOUSE_BUTTON_LEFT
		ev.pressed = pressed
		Input.parse_input_event(ev)


func _key(code: Key) -> void:
	for pressed in [true, false]:
		var ev := InputEventKey.new()
		ev.keycode = code
		ev.physical_keycode = code
		ev.pressed = pressed
		Input.parse_input_event(ev)


func _spawn(offset: Vector3) -> ProtoLurker:
	var l := ProtoLurker.create()
	l.stalk_range = 0.0
	main.add_child(l)
	l.global_position = main.player.global_position + offset
	return l


func _next() -> void:
	phase += 1
	phase_t = 0.0


func _physics_process(delta: float) -> void:
	t += delta
	phase_t += delta
	match phase:
		0: # out of the car; equip the wrench (melee)
			if phase_t > 0.6:
				_tap_interact()
				_next()
		1:
			if phase_t > 0.5:
				main.use_item("wrench")
				var w: ProtoWeapon = main.current_weapon()
				_check("wrench equips as MELEE", w != null and w.is_melee())
				main.aim_override = Vector3(1, 0, 0)
				_lurk = _spawn(Vector3(1.8, 0.4, 0))
				_stress0 = main.stress
				_next()
		2: # swing until dead: stamina drains, stress does NOT spike (quiet)
			if phase_t > 0.3 and is_instance_valid(_lurk) and not _lurk.dead:
				_click()
			elif not is_instance_valid(_lurk) or _lurk.dead:
				_check("melee kills in reach", true)
				_check("swings cost stamina (%.0f)" % main.player.stamina, main.player.stamina < 100.0)
				# QUIET check: swing at nothing — weapon itself must add no stress.
				main.stress = 10.0
				var w: ProtoWeapon = main.current_weapon()
				w._cd = 0.0
				_click()
				_check("melee is QUIET (stress %.1f)" % main.stress, main.stress < 11.0)
				_next()
			if phase_t > 8.0:
				_check("melee kills in reach", false)
				_next()
		3: # grenade
			if phase_t > 0.4:
				main.backpack.add("grenade", 1)
				_lurk = _spawn(Vector3(7, 0.4, 0))
				_key(KEY_G)
				_next()
		4:
			if (not is_instance_valid(_lurk)) or _lurk.dead:
				_check("grenade lob kills at range", true)
				_next()
			elif phase_t > 4.0:
				_check("grenade lob kills at range", false)
				_next()
		5: # bloom: equip pistol, rapid-fire -> spread grows; rest -> recovers
			if phase_t > 0.5:
				main.backpack.add("pistol", 1)
				main.backpack.add("9mm", 24)
				main.use_item("pistol")
				var w: ProtoWeapon = main.current_weapon()
				_base_spread = w.current_spread(main)
				w.fire(main, main.player.global_position + Vector3(0, 1.2, 0), Vector3(1, 0, 0))
				w._cd = 0.0
				w.fire(main, main.player.global_position + Vector3(0, 1.2, 0), Vector3(1, 0, 0))
				w._cd = 0.0
				w.fire(main, main.player.global_position + Vector3(0, 1.2, 0), Vector3(1, 0, 0))
				_check("rapid fire BLOOMS the cone (%.1f -> %.1f)" % [_base_spread, w.current_spread(main)], w.current_spread(main) > _base_spread * 1.3)
				_next()
		6:
			if phase_t > 2.2:
				var w: ProtoWeapon = main.current_weapon()
				_check("rest recovers the cone (%.1f)" % w.current_spread(main), w.current_spread(main) < _base_spread * 1.15)
				# Shoot-from-the-car test (the hood MG default is GONE — VEHICLES.md §6):
				# clear battlefield corpses (loot is grabby by design), stand at the door
				for node in main.get_children():
					if node is ProtoChest and node.container.label == "Corpse":
						node.queue_free()
				var car: ProtoCar3D = main.cars[0]
				main.player.global_position = car.global_position - car.global_basis.x * 2.0
				main.player.velocity = Vector3.ZERO
				_next()
		7:
			if phase_t > 0.5 and phase_t < 0.6:
				_tap_interact() # enter the Scavenger from the door
			if phase_t > 0.9:
				if main.mode == 0:
					_check("no default hood MG on the Scavenger anymore", main.active_car.mount_weapon == null)
					var fwd: Vector3 = main.active_car.facing()
					# 6m, not 14: the test is "you CAN kill from the seat", not
					# "pistol bloom at range" (that fight is legitimately hard).
					_lurk = _spawn(fwd * 6.0 + Vector3(0, 0.4, 0))
					_lurk.global_position = main.active_car.global_position + fwd * 6.0 + Vector3(0, 0.4, 0)
					main.aim_override = fwd # "mouse" on the lurker out the windshield
					_mag0 = main.current_weapon().mag
					_next()
				elif phase_t > 3.0:
					_check("re-entered the car for the shoot-from-car test", false)
					phase = 9
		8:
			if phase_t > 0.3 and is_instance_valid(_lurk) and not _lurk.dead:
				# UNNORMALIZED aim: converge at the lurker itself (mouse-equivalent).
				main.aim_override = _lurk.global_position - main.active_car.global_position
				if main.current_weapon().mag <= 0:
					_key(KEY_R) # top up mid-fight like a person would
				# PACED shots — mashing the trigger pins the bloom at max and
				# nothing lands at range (that's the bloom system working).
				elif fmod(phase_t, 0.55) < delta:
					_click() # YOUR OWN gun, out the driver's window
			elif (not is_instance_valid(_lurk)) or _lurk.dead:
				_check("YOUR OWN GUN kills from the driver's seat (no mount needed)", true)
				_check("...and it burned YOUR mag (%d < %d)" % [main.current_weapon().mag, _mag0], main.current_weapon().mag < _mag0)
				_next()
			if phase_t > 14.0:
				_check("YOUR OWN GUN kills from the driver's seat (no mount needed)", false)
				_next()
		9:
			print("CBT RESULTS: %d passed, %d failed" % [passed, failed])
			print("CBT: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
			get_tree().quit(0 if failed == 0 else 1)

	if t > 45.0:
		print("CBT: TIMEOUT in phase %d" % phase)
		print("CBT RESULTS: %d passed, %d failed" % [passed, failed])
		get_tree().quit(1)
