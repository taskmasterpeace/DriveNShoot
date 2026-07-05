## Arsenal proof — 3 fire behaviors, ammo from the backpack, reload, kills that
## leave lootable corpses, rocket blast + trauma. Fires via injected LMB events;
## aim uses main.aim_override (headless has no real mouse — documented exception).
## Run: godot --headless --path game res://proto3d/tests/arsenal_sim.tscn
extends Node

var main: Node3D
var t: float = 0.0
var phase: int = 0
var phase_t: float = 0.0
var passed: int = 0
var failed: int = 0
var _lurk: ProtoLurker
var _lurk2: ProtoLurker


func _ready() -> void:
	var packed: PackedScene = load("res://proto3d/proto3d.tscn")
	main = packed.instantiate()
	add_child(main)
	print("GUN: scene up")


func _check(name: String, ok: bool) -> void:
	if ok:
		passed += 1
		print("GUN: PASS - %s" % name)
	else:
		failed += 1
		print("GUN: FAIL - %s" % name)


func _tap_interact() -> void:
	for pressed in [true, false]:
		var ev := InputEventAction.new()
		ev.action = "interact"
		ev.pressed = pressed
		Input.parse_input_event(ev)


func _click_fire() -> void:
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


func _spawn_lurker(offset: Vector3) -> ProtoLurker:
	var l := ProtoLurker.create()
	l.stalk_range = 0.0 # stand still for the range test
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
		0: # on foot, arm up via the item路 (use_item = equip)
			if phase_t > 0.6:
				_tap_interact()
				_next()
		1:
			if phase_t > 0.5:
				main.backpack.add("pistol", 1)
				main.backpack.add("9mm", 24)
				main.use_item("pistol")
				_check("pistol equips from item", main.current_weapon() != null and main.current_weapon().id == "pistol")
				# Step CLEAR of the parked car first — your own ride is COVER now
				# (3D shot lines clip the hull the old chest-high rays skimmed).
				main.player.global_position = main.cars[0].global_position + Vector3(5.0, 0.3, 0)
				main.player.velocity = Vector3.ZERO
				main.aim_override = Vector3(1, 0, 0) # shoot east
				_lurk = _spawn_lurker(Vector3(8, 0.4, 0))
				_next()
		2: # pistol kills in a few shots -> corpse
			if phase_t > 0.4 and is_instance_valid(_lurk) and not _lurk.dead:
				_click_fire()
			elif not is_instance_valid(_lurk) or _lurk.dead:
				_check("pistol HITSCAN kills the lurker (mag %d/12)" % main.current_weapon().mag, main.current_weapon().mag < 12)
				_next()
			if phase_t > 8.0:
				_check("pistol HITSCAN kills the lurker", false)
				_next()
		3: # corpse is lootable (Container serves the dead)
			if phase_t > 0.6:
				var corpse: ProtoChest = null
				for node in main.get_children():
					if node is ProtoChest and node.container.label == "Corpse":
						corpse = node
						break
				_check("kill leaves a lootable CORPSE", corpse != null and corpse.container.count("meat") >= 1)
				# shotgun: equip + one blast at close range
				main.backpack.add("shotgun", 1)
				main.backpack.add("12ga", 6)
				main.use_item("shotgun")
				_check("shotgun equips (slot 2)", main.current_weapon().id == "shotgun")
				_lurk = _spawn_lurker(Vector3(6, 0.4, 0))
				_next()
		4:
			if phase_t > 0.4 and is_instance_valid(_lurk) and not _lurk.dead:
				_click_fire()
			elif not is_instance_valid(_lurk) or _lurk.dead:
				_check("shotgun MULTI-pellet drops it close-up", true)
				_next()
			if phase_t > 6.0:
				_check("shotgun MULTI-pellet drops it close-up", false)
				_next()
		5: # reload economy: dump the mag, R refills from backpack
			if phase_t > 0.5:
				var w: ProtoWeapon = main.current_weapon()
				w.mag = 0
				_key(KEY_R)
				_next()
		6:
			if phase_t > 2.2: # reloads take REAL time now (shotgun 1.6s)
				var w: ProtoWeapon = main.current_weapon()
				_check("R reloads from backpack (mag %d)" % w.mag, w.mag > 0)
				# rocket: two clustered lurkers, one boom
				main.backpack.add("pipe_rocket", 1)
				main.backpack.add("rocket", 2)
				main.use_item("pipe_rocket")
				_lurk = _spawn_lurker(Vector3(12, 0.4, 0))
				_lurk2 = _spawn_lurker(Vector3(13.5, 0.4, 1.2))
				_next()
		7:
			if phase_t > 0.5:
				_click_fire()
				_next()
		8:
			if phase_t > 2.0:
				var both_dead: bool = (not is_instance_valid(_lurk) or _lurk.dead) and (not is_instance_valid(_lurk2) or _lurk2.dead)
				_check("rocket PROJECTILE blast kills the cluster", both_dead)
				_key(KEY_1)
				_next()
		9:
			if phase_t > 0.4:
				_check("weapon switch: 1 returns to pistol", main.equipped == 0)
				_next()
		10:
			print("GUN RESULTS: %d passed, %d failed" % [passed, failed])
			print("GUN: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
			get_tree().quit(0 if failed == 0 else 1)

	if t > 40.0:
		print("GUN: TIMEOUT in phase %d" % phase)
		print("GUN RESULTS: %d passed, %d failed" % [passed, failed])
		get_tree().quit(1)
