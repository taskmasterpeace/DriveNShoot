## The Shared Interface proof — one Container + one panel for trunk, chest, pack;
## bandaging a wound from looted supplies. "An interface that fits all of us."
## Run: godot --headless --path game res://proto3d/tests/container_sim.tscn
extends Node

var main: Node3D
var t: float = 0.0
var phase: int = 0
var phase_t: float = 0.0
var passed: int = 0
var failed: int = 0
var _chest: ProtoChest = null


func _ready() -> void:
	var packed: PackedScene = load("res://proto3d/proto3d.tscn")
	main = packed.instantiate()
	add_child(main)
	print("BOX: scene up")


func _check(name: String, ok: bool) -> void:
	if ok:
		passed += 1
		print("BOX: PASS - %s" % name)
	else:
		failed += 1
		print("BOX: FAIL - %s" % name)


func _tap_interact() -> void:
	var ev := InputEventAction.new()
	ev.action = "interact"
	ev.pressed = true
	Input.parse_input_event(ev)
	var ev2 := InputEventAction.new()
	ev2.action = "interact"
	ev2.pressed = false
	Input.parse_input_event(ev2)


func _key(code: Key) -> void:
	var ev := InputEventKey.new()
	ev.keycode = code
	ev.physical_keycode = code
	ev.pressed = true
	Input.parse_input_event(ev)
	var ev2 := InputEventKey.new()
	ev2.keycode = code
	ev2.physical_keycode = code
	ev2.pressed = false
	Input.parse_input_event(ev2)


func _next() -> void:
	phase += 1
	phase_t = 0.0


func _physics_process(delta: float) -> void:
	t += delta
	phase_t += delta
	match phase:
		0: # out of the car, walk to its REAR
			if phase_t > 0.6:
				_tap_interact()
				_next()
		1:
			if phase_t > 0.5:
				var car: ProtoCar3D = main.cars[0]
				main.player.global_position = car.global_position + car.global_basis.z * 3.0
				main.player.velocity = Vector3.ZERO
				_next()
		2: # trunk prompt at the rear
			if phase_t > 0.6:
				_check("rear of car prompts OPEN TRUNK", main.hud.current_prompt.contains("trunk"))
				_tap_interact()
				_next()
		3: # panel opens on the trunk
			if phase_t > 0.4:
				_check("the ONE panel opens (trunk)", main.panel.is_open and main.panel._theirs != null and main.panel._theirs.label.contains("cargo"))
				# take the bandage (click-equivalent)
				main.panel._on_move(main.panel._theirs, main.panel._mine, "bandage")
				_check("looted bandage into backpack", main.backpack.count("bandage") == 1)
				_key(KEY_TAB) # close
				_next()
		4: # crash wound + bandage from pack
			if phase_t > 0.4:
				_check("panel closed", not main.panel.is_open)
				main.give_bleeding(2)
				_next()
		5:
			if phase_t > 0.4:
				_check("crash wound shows 🤕 moodle", main.hud.active_moodles.get("hurt", 0) == 2)
				_key(KEY_TAB) # open pack
				_next()
		6:
			if phase_t > 0.4:
				_check("TAB opens your pack", main.panel.is_open and main.panel._theirs == null)
				main.panel._on_use(main.panel._mine, "bandage")
				_check("USE bandage cures the wound", main.bleeding == 0)
				_check("bandage consumed", main.backpack.count("bandage") == 0)
				_key(KEY_TAB)
				_next()
		7: # the same panel opens a world CHEST
			if phase_t > 0.4:
				for node in main.get_children():
					if node is ProtoChest:
						_chest = node
						break
				main.player.global_position = _chest.global_position + Vector3(1.0, 0.3, 0)
				main.player.velocity = Vector3.ZERO
				_next()
		8:
			if phase_t > 0.6:
				_check("chest prompts open", main.hud.current_prompt.contains("chest"))
				_tap_interact()
				_next()
		9:
			if phase_t > 0.4:
				_check("SAME panel opens the chest", main.panel.is_open and main.panel._theirs.label == "Chest")
				main.panel._on_move(main.panel._theirs, main.panel._mine, "meat")
				var s0: float = 40.0
				main.stress = s0
				main.panel._on_use(main.panel._mine, "meat")
				_check("ate meat from the chest — stress fell", main.stress < s0 - 10.0)
				_next()
		10:
			print("BOX RESULTS: %d passed, %d failed" % [passed, failed])
			print("BOX: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
			get_tree().quit(0 if failed == 0 else 1)

	if t > 30.0:
		print("BOX: TIMEOUT in phase %d" % phase)
		print("BOX RESULTS: %d passed, %d failed" % [passed, failed])
		get_tree().quit(1)
