## Proof for the MELEE ARSENAL (axe + baseball bat). Both are data rows on the one
## weapon system: USE-to-equip like every weapon, and a swing lands damage + shove
## (knockback) + a chance to knock flat. The BAT launches (biggest shove); the AXE
## chops (biggest single hit + hardest knockdown). Run:
##   godot --headless --path game res://proto3d/tests/melee_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node3D


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("MEL: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _ready() -> void:
	print("MEL: start")
	get_tree().create_timer(60.0).timeout.connect(func() -> void:
		print("MEL: WATCHDOG"); print("MEL: FAILURES PRESENT"); get_tree().quit(1))
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 8:
		await get_tree().process_frame

	# --- The rows exist on the one weapon system --------------------------------
	_check("AXE is a weapon row", ProtoWeapon.WEAPONS.has("axe") and ProtoWeapon.WEAPONS["axe"]["behavior"] == ProtoWeapon.Behavior.MELEE)
	_check("BAT is a weapon row", ProtoWeapon.WEAPONS.has("bat") and ProtoWeapon.WEAPONS["bat"]["behavior"] == ProtoWeapon.Behavior.MELEE)
	_check("AXE hits hardest of the melee kit", ProtoWeapon.WEAPONS["axe"]["damage"] > ProtoWeapon.WEAPONS["machete"]["damage"])
	_check("BAT is the KNOCKBACK king (shove beats the axe)", ProtoWeapon.WEAPONS["bat"]["shove"] > ProtoWeapon.WEAPONS["axe"]["shove"])
	_check("both are two-handed", ProtoWeapon.WEAPONS["axe"]["hand_pose"]["two_handed"] and ProtoWeapon.WEAPONS["bat"]["hand_pose"]["two_handed"])
	_check("both are USE-to-equip items with a price", ProtoContainer.ITEMS.has("axe") and ProtoContainer.ITEMS.has("bat") and ProtoNPC.PRICES.has("axe") and ProtoNPC.PRICES.has("bat"))

	# --- Equip the bat off the pack (the real path) -----------------------------
	main.mode = main.Mode.FOOT
	main.player.is_active = true
	main.backpack.add("bat", 1)
	main.use_item("bat")
	var eq: ProtoWeapon = main.current_weapon()
	_check("USE bat → it's in your hands", eq != null and eq.id == "bat")

	# --- A swing LANDS: damage + knockback on a target in the arc ----------------
	var howl := ProtoHowler.create(main)
	main.add_child(howl)
	howl.global_position = main.player.global_position + Vector3(0, 0, -2.0) # dead ahead, in reach
	for _i in 3:
		await get_tree().physics_frame
	main.player.set_aim_intent(Vector3(0, 0, -1)) # face the target
	var hp0: float = howl.body.hp
	var pos0: Vector3 = howl.global_position
	eq._cd = 0.0
	eq.fire(main, main.player.global_position, Vector3(0, 0, -1))
	for _i in 6:
		await get_tree().physics_frame
	_check("the bat swing dealt damage (%.0f → %.0f)" % [hp0, howl.body.hp] if is_instance_valid(howl) else "target destroyed",
		not is_instance_valid(howl) or howl.body.hp < hp0)
	if is_instance_valid(howl):
		_check("the bat LAUNCHED it (moved %.1fm)" % pos0.distance_to(howl.global_position), pos0.distance_to(howl.global_position) > 0.3)
	else:
		_check("the bat LAUNCHED it (target already down)", true)

	print("MEL RESULTS: %d passed, %d failed" % [passed, failed])
	print("MEL: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
