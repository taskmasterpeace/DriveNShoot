## Proof for SIGNS FOR THE ILLITERATE (player ask). A sign shows a SYMBOL you always
## see ("words here"); the WORDS only become readable when the sign is inside your
## sight cone AND within reading range — knowing letters is a luxury, you must LOOK.
## Run: godot --headless --path game res://proto3d/tests/sign_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node3D


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("SIGN: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _ready() -> void:
	print("SIGN: start")
	get_tree().create_timer(60.0).timeout.connect(func() -> void:
		print("SIGN: WATCHDOG"); print("SIGN: FAILURES PRESENT"); get_tree().quit(1))
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 8:
		await get_tree().process_frame

	# --- The world seeds signs, each carrying words -----------------------------
	_check("signs exist in the world (data rows)", main.signs.size() >= 1)
	var sign = main.signs[0]
	_check("a sign carries WORDS", String(sign.text).length() > 0)

	# The gaze is driven by the (fixed headless) mouse, so we can't turn it — instead
	# we place the sign relative to the player's ACTUAL sight_facing (like dog_sim).
	main.mode = main.Mode.FOOT
	main.player.is_active = true
	main.player.global_position = Vector3(60, 0.2, -300)
	for _i in 6:
		await get_tree().physics_frame
	var gaze: Vector3 = main.player.sight_facing()
	gaze.y = 0.0
	gaze = gaze.normalized()

	# --- In the sight cone, close → the words are READABLE ----------------------
	sign.global_position = main.player.global_position + gaze * 6.0
	for _i in 3:
		await get_tree().physics_frame
	_check("in the sight cone → the words are READABLE", sign.is_readable())
	_check("...and the symbol is always there (words-here marker)", sign._symbol.visible)

	# --- Behind the gaze → unreadable (can't read from the corner of your eye) ---
	sign.global_position = main.player.global_position - gaze * 6.0
	for _i in 3:
		await get_tree().physics_frame
	_check("behind your gaze → the words are NOT readable", not sign.is_readable())

	# --- In the cone but too far → still unreadable (walk closer) ----------------
	sign.global_position = main.player.global_position + gaze * 40.0
	for _i in 3:
		await get_tree().physics_frame
	_check("in-cone but too far → unreadable (walk closer)", not sign.is_readable())

	print("SIGN RESULTS: %d passed, %d failed" % [passed, failed])
	print("SIGN: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
