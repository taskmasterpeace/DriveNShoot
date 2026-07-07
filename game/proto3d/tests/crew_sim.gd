## Proof for THE CREW: hires are ROWS on the puppet rig, jobs earn their keep on
## the game clock (mechanic fixes the rig, medic patches you), and a crew you
## can LOSE — the rig flops, the gear drops as a corpse chest, the road weighs.
## Run: godot --headless --path game res://proto3d/tests/crew_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node3D


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("CRW: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _ready() -> void:
	print("CRW: start")
	get_tree().create_timer(90.0).timeout.connect(func() -> void:
		print("CRW: WATCHDOG")
		print("CRW: FAILURES PRESENT")
		get_tree().quit(1))
	Engine.time_scale = 2.5
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 8:
		await get_tree().process_frame
	main._exit_car()

	# --- Rows on the RIG ---------------------------------------------------------
	var sam := ProtoCompanion.create(main, "sam")
	main.add_child(sam)
	sam.global_position = main.player.global_position + Vector3(3, 0.5, 0)
	main.companions.append(sam)
	_check("the crew are ROWS (%d in the book)" % ProtoCompanion.CREW.size(), ProtoCompanion.CREW.size() >= 3)
	_check("Sam wears the PUPPET (iron out — he's the gunner)", sam.puppet != null and sam.puppet.gun.visible)
	# NPC ARCHETYPE read-back: mechanic/medic hires exist now (folded from npcs.json) —
	# the audit's dead hire branches are live (Hazel/Mercer had CREW rows but no archetype).
	_check("mechanic + medic archetypes folded in from data/npcs.json",
		ProtoNPC.ARCHETYPES.has("mechanic") and ProtoNPC.ARCHETYPES.has("medic")
		and String(ProtoNPC.ARCHETYPES["mechanic"]["name"]) == "Hazel"
		and String(ProtoNPC.ARCHETYPES["medic"]["role"]) == "hire")

	# --- FOLLOW (the dog law, human-shaped) ---------------------------------------
	main.player.global_position += Vector3(14, 0, 0)
	var t := 0.0
	while t < 12.0 and sam.global_position.distance_to(main.player.global_position) > 5.0:
		await get_tree().physics_frame
		t += get_physics_process_delta_time()
	_check("hire FOLLOWS (%.1fm behind)" % sam.global_position.distance_to(main.player.global_position),
		sam.global_position.distance_to(main.player.global_position) <= 5.0)

	# --- THE JOBS earn on the game clock ------------------------------------------
	var hazel := ProtoCompanion.create(main, "hazel")
	main.add_child(hazel)
	hazel.global_position = main.cars[0].global_position + Vector3(4, 0.5, 0)
	hazel.staying = true
	main.cars[0].components["engine"].hp = 40.0
	var eng0: float = main.cars[0].components["engine"].hp
	hazel._do_job() # a half-hour tick, called on the nose (the clock drives it live)
	_check("the MECHANIC works the rig's worst part (%.0f → %.0f)" % [eng0, main.cars[0].components["engine"].hp],
		main.cars[0].components["engine"].hp > eng0)
	var mercer := ProtoCompanion.create(main, "mercer")
	main.add_child(mercer)
	mercer.global_position = main.player.global_position + Vector3(2, 0.5, 0)
	main.character.take_wound("l_arm", 40.0)
	main.character.hp = main.character.hp_cap()
	var arm0: float = main.character.body["l_arm"].hp
	mercer._do_job()
	_check("the MEDIC patches you as you walk (%.0f → %.0f)" % [arm0, main.character.body["l_arm"].hp],
		main.character.body["l_arm"].hp > arm0)
	# …and the clock actually drives it: jump the hour, tick fires on its own.
	# (two frames first, so his job clock has a baseline BEFORE the jump)
	for _i in 3:
		await get_tree().physics_frame
	main.character.take_wound("l_arm", 20.0)
	main.character.hp = main.character.hp_cap()
	var arm1: float = main.character.body["l_arm"].hp
	main.daynight.hour += 1.0
	for _i in 10:
		await get_tree().physics_frame
	_check("the GAME CLOCK drives the job (T-wait a camp night = real work)", main.character.body["l_arm"].hp > arm1)

	# --- MORTALITY: the point ------------------------------------------------------
	var fallen0: int = main.fallen_dogs.size()
	sam.take_damage(999.0)
	_check("no more immortal capsules — the hire DIES", sam.dead)
	for _i in 60:
		await get_tree().physics_frame
	var corpse: ProtoCorpse = null
	for n in main.get_children():
		if n is ProtoCorpse and (n as ProtoCorpse).container.label.contains("Sam"):
			corpse = n
	_check("the gear drops on the BODY (loot the corpse, no crate)", corpse != null and corpse.container.count("9mm") > 0)
	_check("the memorial carries the name", main.fallen_dogs.size() == fallen0 + 1)
	_check("the roster let him go", not main.companions.has(sam))

	Engine.time_scale = 1.0
	print("CRW RESULTS: %d passed, %d failed" % [passed, failed])
	print("CRW: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
