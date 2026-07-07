## Proof for the FULL-SCREEN BINOCULARS rework (owner ask 2026-07-07): the old
## vignette drowned most of the frame in black — the new one is a THIN RIM.
## Headless can't read shader pixels back, so the contract is the CONSTANTS the
## shader mirrors (hud_3d.gd documents this pact in place): the measured
## clear fraction stays >= 85%, the rim starts past the frame's edge circle,
## and the two bands never stack past either one's own ceiling. Plus the real
## input path: HOLD B raises the binocular state, release drops it.
## Run: godot --headless --path game res://proto3d/tests/binocular_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node3D


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("BINOC: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _key(code: int, pressed: bool) -> void:
	var ev := InputEventKey.new()
	ev.keycode = code
	ev.physical_keycode = code
	ev.pressed = pressed
	Input.parse_input_event(ev)


func _ready() -> void:
	print("BINOC: start")
	get_tree().create_timer(90.0).timeout.connect(func() -> void:
		print("BINOC: WATCHDOG")
		print("BINOC: FAILURES PRESENT")
		get_tree().quit(1))

	# === 1. THE THIN-RIM CONTRACT (the consts the shader mirrors) =================
	_check(">=85%% of the frame stays clear (measured const %.2f)" % ProtoHUD.VIGNETTE_MASK_CLEAR_PCT,
		ProtoHUD.VIGNETTE_MASK_CLEAR_PCT >= 0.85)
	_check("the corner rim starts OUTSIDE the frame's inscribed circle (d %.2f > 1.0)" % ProtoHUD.VIGNETTE_RIM_START,
		ProtoHUD.VIGNETTE_RIM_START > 1.0)
	_check("neither band alone blacks out (rim %.2f, lens %.2f, both < 0.6)" %
		[ProtoHUD.VIGNETTE_RIM_MAX_ALPHA, ProtoHUD.VIGNETTE_LENS_MAX_ALPHA],
		ProtoHUD.VIGNETTE_RIM_MAX_ALPHA < 0.6 and ProtoHUD.VIGNETTE_LENS_MAX_ALPHA < 0.6)
	_check("the shader takes the MAX of the bands, never the sum (the no-stack law)",
		ProtoHUD.VIGNETTE_SHADER.contains("max("))

	# === 2. THE REAL INPUT PATH: hold B raises it, release drops it ================
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 8:
		await get_tree().process_frame
	main._exit_car() # binoculars are an on-foot verb
	for _i in 6:
		await get_tree().physics_frame
	_key(KEY_B, true)
	for _i in 10:
		await get_tree().physics_frame
	_check("HOLD B raises the binoculars", bool(main.cam_rig.binoculars))
	_check("...and the HUD's thin-rim vignette is LIVE", main.hud._vignette != null and main.hud._vignette.visible)
	_key(KEY_B, false)
	for _i in 10:
		await get_tree().physics_frame
	_check("release drops them", not bool(main.cam_rig.binoculars))

	print("BINOC RESULTS: %d passed, %d failed" % [passed, failed])
	print("BINOC: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
