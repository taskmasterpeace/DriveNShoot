## Proof: the MELEE LAW — no teeth or steel through walls, in either direction
## (playtest: "I can hit them through the wall, they can hit me").
## A wall between attacker and target kills the hit; open ground restores it.
## Run: godot --headless --path game res://proto3d/tests/melee_wall_sim.tscn
extends Node3D

var passed := 0
var failed := 0


## A body that counts its wounds — the dummy on the far side of the wall.
class Dummy:
	extends CharacterBody3D
	var hits: int = 0

	func take_damage(_amount: float) -> void:
		hits += 1

	static func create() -> Dummy:
		var d := Dummy.new()
		var shape := CollisionShape3D.new()
		var cap := CapsuleShape3D.new()
		cap.radius = 0.35
		cap.height = 1.7
		shape.shape = cap
		shape.position.y = 0.85
		d.add_child(shape)
		return d


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("MWALL: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _ready() -> void:
	print("MWALL: start")

	# Arrange: a wall at x=2 splits the dog (x=0) from the dummy (x=4).
	var wall := StaticBody3D.new()
	var ws := CollisionShape3D.new()
	var wb := BoxShape3D.new()
	wb.size = Vector3(0.3, 3.0, 6.0)
	ws.shape = wb
	wall.add_child(ws)
	wall.position = Vector3(2.0, 1.5, 0.0)
	add_child(wall)

	var dog := ProtoDog.create(ProtoDog.DogType.SECURITY, "Testfang", "Shepherd")
	add_child(dog)
	dog.global_position = Vector3.ZERO

	var dummy := Dummy.create()
	add_child(dummy)
	dummy.global_position = Vector3(4.0, 0.0, 0.0)

	# Let the physics server register the bodies before any raycast.
	await get_tree().physics_frame
	await get_tree().physics_frame

	# Act 1: bite THROUGH the wall — the law says no.
	dog._bite(dummy)
	_check("a wall between = NO bite (hits %d, want 0)" % dummy.hits, dummy.hits == 0)

	# ...and the law reads the same in both directions.
	_check("melee_clear is blocked BOTH ways",
		not ProtoWeapon.melee_clear(dog, dummy) and not ProtoWeapon.melee_clear(dummy, dog))

	# Act 2: same dog, same dummy, open ground — teeth work again.
	dog.global_position = Vector3(3.2, 0.0, 1.5)
	dog._bite_cd = 0.0
	await get_tree().physics_frame
	await get_tree().physics_frame
	dog._bite(dummy)
	_check("open ground = the bite LANDS (hits %d, want 1)" % dummy.hits, dummy.hits == 1)

	print("MWALL RESULTS: %d passed, %d failed" % [passed, failed])
	print("MWALL: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
