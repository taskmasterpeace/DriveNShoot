## Proof for ROADKILL (car_3d.gd _roadkill — goal "all characters can be hit by vehicles").
## A moving car mauls characters in its path, scaled by speed, flinging the corpse forward;
## a slow bump or an out-of-reach body is spared; one pass = one hit. Run:
## godot --headless --path game res://proto3d/tests/roadkill_sim.tscn
extends Node

var passed := 0
var failed := 0


class Victim:
	extends Node3D
	var hp: float = 100.0
	var hit_launch: Vector3 = Vector3.ZERO
	func take_damage(a: float) -> void: hp -= a


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("ROADKILL: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _victim(at: Vector3) -> Victim:
	var v := Victim.new()
	add_child(v)
	v.add_to_group("threat")
	v.global_position = at
	return v


func _ready() -> void:
	var car := ProtoCar3D.create("scavenger", Color(0.5, 0.4, 0.3))
	add_child(car)
	car.set_physics_process(false)   # we call _roadkill directly, deterministically
	car.is_active = true
	car.global_position = Vector3.ZERO
	car.linear_velocity = Vector3(0, 0, -15)   # barreling forward (-Z)

	# A character right in the car's path gets mauled + flung the way the car's going.
	var v := _victim(Vector3(0, 0, -2.5))
	car._roadkill(0.1)
	_check("roadkill damaged the character", v.hp < 100.0)
	_check("damage scales with speed (~50 at 15 m/s)", v.hp <= 50.0)
	_check("the corpse is flung FORWARD (launch -Z, up +Y)", v.hit_launch.z < 0.0 and v.hit_launch.y > 0.0)
	_check("victim goes on cooldown (one pass, one hit)", car._roadkill_cd.has(v))

	var hp_after := v.hp
	car._roadkill(0.05)   # still on cooldown
	_check("cooldown blocks a second hit the same pass", v.hp == hp_after)

	# A body out of reach is untouched.
	var far := _victim(Vector3(0, 0, -40))
	car._roadkill(0.1)
	_check("a character out of reach is spared", far.hp == 100.0)

	# A slow crawl is a bump, not a maiming.
	car.linear_velocity = Vector3(0, 0, -2)   # below ROADKILL_MIN_SPEED
	var slow := _victim(Vector3(0, 0, -2.0))
	car._roadkill(0.1)
	_check("a slow bump doesn't maim", slow.hp == 100.0)

	print("ROADKILL: DONE — %d passed, %d failed" % [passed, failed])
	get_tree().quit(1 if failed > 0 else 0)
