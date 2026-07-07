## Proof for the DOG VERBS (MOVESET.txt — zero new keys, all automatic):
## JUMP — a following dog LEAPS a low fence instead of pinballing (money moment).
## POUNCE — SIC inside the launch window leaves the GROUND and carries teeth in.
## DIG — a Hunter's nose flags packed earth, its paws unearth the cache, and the
## loot rolls off the data spine (loot_tables.json "buried_cache").
## Run: godot --headless --path game res://proto3d/tests/dogverb_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node3D


class TestFoe:
	extends CharacterBody3D
	var hp: float = 999.0
	var hits: Array = []
	var _stun_t: float = 0.0

	static func create() -> TestFoe:
		var f := TestFoe.new()
		f.add_to_group("threat")
		var shape := CollisionShape3D.new()
		var cap := CapsuleShape3D.new()
		cap.radius = 0.35
		cap.height = 1.7
		shape.shape = cap
		shape.position.y = 0.85
		f.add_child(shape)
		return f

	func take_damage(amount: float, _attacker: Node3D = null) -> void:
		hp -= amount
		hits.append(amount)

	func knock_down() -> void:
		_stun_t = 1.2

	func _physics_process(delta: float) -> void:
		_stun_t = maxf(0.0, _stun_t - delta)


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("DOGVERB: %s - %s" % ["PASS" if ok else "FAIL", check_name])


## A long low fence a dog should BOUND, not bounce off.
func _fence(at: Vector3) -> StaticBody3D:
	var wall := StaticBody3D.new()
	var shape := CollisionShape3D.new()
	var box := BoxShape3D.new()
	box.size = Vector3(24.0, 0.6, 0.3)
	shape.shape = box
	wall.add_child(shape)
	var mesh := MeshInstance3D.new()
	var bm := BoxMesh.new()
	bm.size = box.size
	mesh.mesh = bm
	wall.add_child(mesh)
	main.add_child(wall)
	wall.global_position = Vector3(at.x, 0.3, at.z)
	return wall


func _ready() -> void:
	print("DOGVERB: start")
	get_tree().create_timer(90.0).timeout.connect(func() -> void:
		print("DOGVERB: WATCHDOG"); print("DOGVERB: FAILURES PRESENT"); get_tree().quit(1))
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 8:
		await get_tree().process_frame

	main._exit_car()
	main.daynight.hour = 12.0 # broad daylight — no howler pack in the test lane
	var p: ProtoPlayer3D = main.player
	p.global_position = Vector3(6, 0.35, 388)
	p.velocity = Vector3.ZERO
	for _i in 4:
		await get_tree().physics_frame

	# --- 1. JUMP: a fence between the dog and your heel ------------------------
	var rex: ProtoDog = ProtoDog.create(ProtoDog.DogType.SECURITY, "Rex", "Shepherd")
	main.add_child(rex)
	rex.global_position = p.global_position + Vector3(0, 0, 6.0)
	await get_tree().physics_frame
	rex.interact(main) # the real adoption path (E on the dog)
	_check("Rex joins the pack", rex.adopted)
	# Stage the HEEL deterministically on the player's far side (the dog's own
	# heel angle is random) — the fence must be CROSSED, not settled behind.
	rex._follow_angle = PI * 1.5
	_fence(p.global_position + Vector3(0, 0, 3.0)) # a fence across the lane
	var flew := false
	var crossed := false
	for _i in 420:
		await get_tree().physics_frame
		if not rex.is_on_floor():
			flew = true
		if rex.global_position.z < p.global_position.z + 2.4:
			crossed = true
			break
	_check("the dog LEFT THE GROUND on the way (jump)", flew)
	_check("the dog CLEARED the fence to your heel", crossed)

	# --- 2. POUNCE: SIC in the launch window leaves the ground -----------------
	var foe := TestFoe.create()
	main.add_child(foe)
	foe.global_position = rex.global_position + Vector3(3.2, 0, 0)
	await get_tree().physics_frame
	rex.command_sic(foe)
	var pounced := false
	var bit := false
	for _i in 240:
		await get_tree().physics_frame
		if not rex.is_on_floor():
			pounced = true
		if not foe.hits.is_empty():
			bit = true
			break
	_check("SIC LAUNCHES a pounce (airborne)", pounced)
	_check("the pounce carries the TEETH in (bite landed)", bit)
	foe.queue_free()
	rex.queue_free() # phase over — one dog, one job, no cross-dog noise
	await get_tree().physics_frame

	# --- 3. DIG: a Hunter unearths packed earth --------------------------------
	# Open desert, far from Meridian's furniture: no stray stash can hog the
	# nose's ping loop, nothing else in the interactable ring.
	p.global_position = Vector3(300, 0.35, 700)
	p.velocity = Vector3.ZERO
	var belle: ProtoDog = ProtoDog.create(ProtoDog.DogType.HUNTER, "Belle", "Bloodhound")
	main.add_child(belle)
	belle.global_position = p.global_position + Vector3(-4, 0, 0)
	await get_tree().physics_frame
	belle.interact(main)
	_check("Belle joins the pack", belle.adopted)
	var kin0: float = main.character.skills["kinship"]["xp"]
	var cache := ProtoBuriedCache.create()
	main.add_child(cache)
	cache.global_position = p.global_position + Vector3(-10, 0, 0)
	var pawed := false
	for _i in 700:
		await get_tree().physics_frame
		if belle._quad != null and belle._quad._dig > 0.3:
			pawed = true
		if cache.taken:
			break
	_check("the nose found it and the PAWS went to work", pawed)
	_check("the cache is UNEARTHED", cache.taken)
	var dug_chest: ProtoChest = null
	for node in main.get_children():
		if node is ProtoChest and (node as ProtoChest).container.label == "Dug-up cache":
			dug_chest = node
			break
	_check("the loot is real ground loot (a dug-up chest)", dug_chest != null)
	_check("the haul rolled off the DATA SPINE (buried_cache table)",
		dug_chest != null and not dug_chest.container.slots.is_empty())
	_check("the pack PROVIDING builds kinship", main.character.skills["kinship"]["xp"] > kin0)

	print("DOGVERB RESULTS: %d passed, %d failed" % [passed, failed])
	print("DOGVERB: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
