## Proof for THE INFECTED I2, scan-consumer rung 1 (THE_INFECTED.md §0.5/§3.5): a clone
## clinic SCANS the body and REFUSES a fevered one — bite fever is scan-detectable, and
## "the state fears your body more than your body does." A cured body backs up fine.
## Extends the shipped cloning (C1) + character bite-fever (I1); no hot-file touch. Run:
##   godot --headless --path game res://proto3d/tests/clone_fever_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node3D


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("CLONEFEVER: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _ready() -> void:
	print("CLONEFEVER: start")
	get_tree().create_timer(60.0).timeout.connect(func() -> void:
		print("CLONEFEVER: WATCHDOG"); print("CLONEFEVER: FAILURES PRESENT"); get_tree().quit(1))
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 8:
		await get_tree().process_frame

	var now: float = main.cloning.now_h()
	main.backpack.add("scrip", 500) # plenty for the chair
	var scrip0: int = main.backpack.count("scrip")

	# --- A FEVERED body is REFUSED — no scan, no scrip taken --------------------
	main.character.bite_fever(now)
	_check("the player carries bite fever", main.character.fever_active(now))
	var refused: bool = main.cloning.begin_scan(false)
	_check("the clinic REFUSES a fevered body (begin_scan → false)", not refused)
	_check("a refused scan takes NO scrip (the chair never hummed)",
		main.backpack.count("scrip") == scrip0)
	_check("no backup was started", main.cloning.scan_until_h < 0.0)

	# --- CURED, the same body backs up fine ------------------------------------
	main.character.fever_until_h = -1.0 # a full night's sleep + antibiotics (I1's cure) cleared it
	_check("the fever is cured", not main.character.fever_active(now))
	var ok: bool = main.cloning.begin_scan(false)
	_check("a CURED body backs up (begin_scan → true)", ok)
	_check("the healthy scan bought the chair (scrip spent)",
		main.backpack.count("scrip") < scrip0)

	print("CLONEFEVER RESULTS: %d passed, %d failed" % [passed, failed])
	print("CLONEFEVER: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
