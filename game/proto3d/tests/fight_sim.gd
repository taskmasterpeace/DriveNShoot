## Two-way combat + inventory management proof: the lurker CLAWS you (wounds,
## bleed, fear), you kill it; DROP puts gear in a ground pile; rows show weight.
extends Node

var main: Node3D
var t := 0.0
var phase := 0
var phase_t := 0.0
var passed := 0
var failed := 0
var _lurk: ProtoLurker
var _hp0 := 0.0


func _ready() -> void:
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	print("FGT: scene up")


func _check(name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("FGT: %s - %s" % ["PASS" if ok else "FAIL", name])


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


func _next() -> void:
	phase += 1
	phase_t = 0.0


func _physics_process(delta: float) -> void:
	t += delta
	phase_t += delta
	match phase:
		0:
			if phase_t > 0.6:
				_tap_interact() # on foot
				_next()
		1:
			if phase_t > 0.5:
				_hp0 = main.character.hp
				_lurk = ProtoLurker.create()
				main.add_child(_lurk)
				_lurk.global_position = main.player.global_position + Vector3(1.2, 0.4, 0)
				_next()
		2: # get clawed
			if main.character.hp < _hp0 - 1.0:
				_check("the lurker CLAWS you (hp %.0f -> %.0f)" % [_hp0, main.character.hp], true)
				_check("claw wounds a body part", main.character.worst_part() != "" and main.character.body[main.character.worst_part()].ratio() < 1.0)
				_next()
			elif phase_t > 5.0:
				_check("the lurker CLAWS you", false)
				_next()
		3: # moodle lands next frame; then fight back with the starting wrench
			if phase_t > 0.4:
				_check("claw marks you hurt (moodle)", main.hud.active_moodles.has("hurt"))
				main.use_item("wrench")
				main.aim_override = Vector3(1, 0, 0)
				_next()
		4:
			if phase_t > 0.25 and is_instance_valid(_lurk) and not _lurk.dead:
				_click()
			elif (not is_instance_valid(_lurk)) or _lurk.dead:
				_check("you kill it back (two-way combat)", true)
				_next()
			if phase_t > 8.0:
				_check("you kill it back (two-way combat)", false)
				_next()
		5: # inventory: DROP scrap -> ground pile; weight shows on rows
			if phase_t > 0.5:
				main.backpack.add("scrap", 3)
				_key(KEY_TAB)
				_next()
		6:
			if phase_t > 0.4:
				_check("load footer shows (%s)" % main.panel._load_label.text, main.panel._load_label.text.contains("kg"))
				main.panel._on_drop(main.backpack, "scrap")
				var pile: ProtoChest = null
				for node in main.get_children():
					if node is ProtoChest and node.container.label == "Dropped gear":
						pile = node
						break
				_check("DROP makes a ground pile with the item", pile != null and pile.container.count("scrap") == 1)
				_check("pack got lighter", main.backpack.count("scrap") == 2)
				_key(KEY_TAB)
				_next()
		7:
			print("FGT RESULTS: %d passed, %d failed" % [passed, failed])
			print("FGT: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
			get_tree().quit(0 if failed == 0 else 1)

	if t > 30.0:
		print("FGT: TIMEOUT in phase %d" % phase)
		print("FGT RESULTS: %d passed, %d failed" % [passed, failed])
		get_tree().quit(1)
