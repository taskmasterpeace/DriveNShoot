## Proof for THE INFECTED I2 (§0.5): "your own dog sniffs you" — a bonded dog SMELLS the
## bite fever on its owner and won't settle (a living tell you're sick), and settles once
## you're cured. Additive to the shipped dog + bite-fever; no hot-file touch. Run:
##   godot --headless --path game res://proto3d/tests/dog_fever_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node3D


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("DOGFEVER: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _ready() -> void:
	print("DOGFEVER: start")
	get_tree().create_timer(60.0).timeout.connect(func() -> void:
		print("DOGFEVER: WATCHDOG"); print("DOGFEVER: FAILURES PRESENT"); get_tree().quit(1))
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 8:
		await get_tree().process_frame

	main._exit_car()
	var p: ProtoPlayer3D = main.player
	p.is_active = true
	p.global_position = Vector3(6, 0.35, 388) # clear of Meridian
	for _i in 6:
		await get_tree().physics_frame

	# --- A bonded dog at your side ---------------------------------------------
	var rex: ProtoDog = ProtoDog.create(ProtoDog.DogType.SECURITY, "Rex", "Shepherd")
	main.add_child(rex)
	rex.global_position = p.global_position + Vector3(0, 0, 3.0)
	rex.interact(main) # the real adoption path (sets _main + the bond)
	rex.add_bond(30.0, main) # a real partner, so the fever-smell tell is unlocked
	_check("Rex is a bonded companion (tier %d ≥ 1)" % rex.bond_tier(), rex.bond_tier() >= 1)
	for _i in 4:
		await get_tree().physics_frame

	# --- FEVER: the dog smells it and won't settle -----------------------------
	var now: float = main.daynight.day * 24.0 + main.daynight.hour
	main.character.bite_fever(now)
	_check("you carry bite fever", main.character.fever_active(now))
	rex.global_position = p.global_position + Vector3(0, 0, 3.0) # right beside you
	for _i in 20:
		await get_tree().physics_frame
	_check("your bonded dog SMELLS the fever (won't settle)", rex._fever_sniffing)

	# --- CURED: the dog settles ------------------------------------------------
	main.character.fever_until_h = -1.0
	_check("the fever is cured", not main.character.fever_active(now))
	for _i in 10:
		await get_tree().physics_frame
	_check("a healthy owner: the dog settles (no more sniffing)", not rex._fever_sniffing)

	print("DOGFEVER RESULTS: %d passed, %d failed" % [passed, failed])
	print("DOGFEVER: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
