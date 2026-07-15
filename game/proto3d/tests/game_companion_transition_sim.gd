## Deterministic package-to-cartridge ritual proof. Time is advanced manually so
## contact, boot, skip, eject, and reduced-motion behavior cannot flake.
## Run: Godot --headless --path game res://proto3d/tests/game_companion_transition_sim.tscn
extends Node

const TRANSITION_SCRIPT := "res://proto3d/games/companion/companion_transition.gd"

var passed := 0
var failed := 0


func _check(label: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("GAME_COMPANION_TRANSITION: %s - %s" % ["PASS" if ok else "FAIL", label])


func _ready() -> void:
	print("GAME_COMPANION_TRANSITION: start")
	get_tree().create_timer(30.0).timeout.connect(func() -> void:
		print("GAME_COMPANION_TRANSITION: WATCHDOG")
		get_tree().quit(1))
	_check("companion transition implementation exists", FileAccess.file_exists(TRANSITION_SCRIPT))
	if not FileAccess.file_exists(TRANSITION_SCRIPT):
		_finish()
		return
	var transition: Control = (load(TRANSITION_SCRIPT) as GDScript).new()
	add_child(transition)
	transition.set_process(false)
	var contact_count := [0]
	var insert_finish_count := [0]
	var eject_finish_count := [0]
	transition.connect("insert_contact", func() -> void: contact_count[0] += 1)
	transition.connect("insert_finished", func() -> void: insert_finish_count[0] += 1)
	transition.connect("eject_finished", func() -> void: eject_finish_count[0] += 1)
	var image := Image.create(240, 360, false, Image.FORMAT_RGBA8)
	image.fill(Color("c87832"))
	var cover := ImageTexture.create_from_image(image)
	var row := {"id": "crown_of_ash", "title": "CROWN OF ASH",
		"platform": "console", "aspect": "16:9"}

	transition.call("insert", row, cover, false)
	var opening: Dictionary = transition.call("snapshot_ui")
	_check("ritual opens on the selected physical package with shared art",
		String(opening.get("state", "")) == "PACKAGE"
		and bool(opening.get("same_texture", false))
		and int(opening.get("contact_light_count", 0)) == 4)
	transition.call("skip_after_contact")
	_check("skip before electrical contact does nothing",
		String((transition.call("snapshot_ui") as Dictionary).get("state", "")) == "PACKAGE"
		and contact_count[0] == 0 and insert_finish_count[0] == 0)

	var sequence: Array[String] = ["PACKAGE"]
	for delta in [0.181, 0.201, 0.24, 0.20, 0.33]:
		transition.call("_advance", float(delta))
		var state_name := String((transition.call("snapshot_ui") as Dictionary).get("state", ""))
		if sequence[-1] != state_name:
			sequence.append(state_name)
	_check("standard insert traverses package, cartridge, slot, contact, and screen in order",
		sequence == ["PACKAGE", "CARTRIDGE", "SLOT", "CONTACT", "SCREEN"])
	_check("electrical contact occurs exactly once at the 0.62-second threshold",
		contact_count[0] == 1 and float((transition.call("snapshot_ui") as Dictionary).get(
			"contact_at", 0.0)) == 0.62)
	_check("standard ritual finishes no later than 1.15 seconds",
		insert_finish_count[0] == 1
		and String((transition.call("snapshot_ui") as Dictionary).get("state", "")) == "SCREEN"
		and float((transition.call("snapshot_ui") as Dictionary).get("elapsed", 9.0)) <= 1.153)
	transition.call("_advance", 1.0)
	_check("finished insertion cannot double-emit contact or completion",
		contact_count[0] == 1 and insert_finish_count[0] == 1)

	contact_count[0] = 0
	insert_finish_count[0] = 0
	transition.call("insert", row, cover, false)
	transition.call("_advance", 0.63)
	transition.call("skip_after_contact")
	_check("skip after contact safely reaches the powered screen",
		contact_count[0] == 1 and insert_finish_count[0] == 1
		and String((transition.call("snapshot_ui") as Dictionary).get("state", "")) == "SCREEN")
	transition.call("eject", false)
	_check("eject begins from the powered screen",
		String((transition.call("snapshot_ui") as Dictionary).get("state", "")) == "EJECT")
	transition.call("_advance", 0.56)
	_check("standard eject reverses completely to idle",
		eject_finish_count[0] == 1
		and String((transition.call("snapshot_ui") as Dictionary).get("state", "")) == "IDLE")

	contact_count[0] = 0
	insert_finish_count[0] = 0
	transition.call("insert", row, cover, true)
	transition.call("_advance", 0.101)
	var reduced_contact: Dictionary = transition.call("snapshot_ui")
	transition.call("_advance", 0.101)
	_check("reduced motion uses one 0.1-second fade to contact",
		String(reduced_contact.get("state", "")) == "CONTACT" and contact_count[0] == 1)
	_check("reduced motion uses a second 0.1-second fade to finish",
		insert_finish_count[0] == 1
		and String((transition.call("snapshot_ui") as Dictionary).get("state", "")) == "SCREEN")
	transition.call("eject", true)
	transition.call("_advance", 0.201)
	_check("reduced-motion eject preserves the complete idle transition",
		eject_finish_count[0] == 2
		and String((transition.call("snapshot_ui") as Dictionary).get("state", "")) == "IDLE")
	var package_art: TextureRect = transition.get("package_art") as TextureRect
	var cartridge_art: TextureRect = transition.get("cartridge_art") as TextureRect
	_check("package and cartridge labels keep art aspect without cropping",
		package_art.stretch_mode == TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		and cartridge_art.stretch_mode == TextureRect.STRETCH_KEEP_ASPECT_CENTERED)
	_finish()


func _finish() -> void:
	print("GAME_COMPANION_TRANSITION RESULTS: %d passed, %d failed" % [passed, failed])
	print("GAME_COMPANION_TRANSITION: %s" % (
		"ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
