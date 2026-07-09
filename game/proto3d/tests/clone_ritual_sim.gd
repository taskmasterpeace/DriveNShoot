## Proof for CLONING C1 (docs/design/CLONING.md): the scan is a RITUAL (scrip
## up front, an hour in the chair, completes on the game clock); THE MEMORY LAW
## holds on death (you wake AT THE SCAN as day-of-scan you — post-scan skill
## levels are GONE from your head) while THE JOURNAL survives the body; the
## wasteland still takes its cut; the black-market vat's defect is a permanent
## tax; and the whole chair rides the save file.
## Run: godot --headless --path game res://proto3d/tests/clone_ritual_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node = null


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("CLONE: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _finish(prev_scale: float) -> void:
	Engine.time_scale = prev_scale
	print("CLONE RESULTS: %d passed, %d failed" % [passed, failed])
	print("CLONE: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)


func _ready() -> void:
	print("CLONE: start")
	var prev_scale := Engine.time_scale
	Engine.time_scale = 1.0
	get_tree().create_timer(120.0).timeout.connect(func() -> void:
		print("CLONE: WATCHDOG")
		failed += 1
		_finish(prev_scale))

	main = load("res://proto3d/proto3d.tscn").instantiate()
	add_child(main)
	for i in range(40):
		await get_tree().physics_frame
	main.mode = main.Mode.FOOT
	main.active_car = null
	var cl: ProtoCloning = main.cloning
	_check("the chair is wired at boot", cl != null)

	# --- 1) THE RITUAL: scrip up front, the clock finishes it ---------------------
	var clinic := Vector3(66, 0.4, -277) # Meridian's clone wing (staged position)
	main.player.global_position = clinic
	for i in range(4):
		await get_tree().physics_frame
	main.backpack.add("scrip", 100)
	_check("no scan without the scrip (price %d)" % ProtoCloning.SCAN_PRICE,
		true) # priced below — the refusal path:
	main.backpack.remove("scrip", main.backpack.count("scrip"))
	_check("...broke = refused", not cl.begin_scan(false))
	main.backpack.add("scrip", 100)
	_check("the chair takes the scrip and starts the hour", cl.begin_scan(false)
		and main.backpack.count("scrip") == 100 - ProtoCloning.SCAN_PRICE)
	_check("...but the backup is NOT instant (the ritual takes the clock)", not cl.has_backup())
	main.daynight.hour += 1.2
	for i in range(6):
		await get_tree().physics_frame
	_check("an hour later the scan is DONE (backup banked at the chair)", cl.has_backup())

	# --- 2) live a little AFTER the scan: level a skill, write the journal --------
	var skill_before: int = main.character.level("scavenging")
	for i in range(400):
		main.character.add_xp("scavenging", 5.0)
	var skill_after: int = main.character.level("scavenging")
	_check("post-scan life happened (scavenging %d -> %d)" % [skill_before, skill_after],
		skill_after > skill_before)
	cl.journal_add("The hermit's still is off CR-rosewood, second spur.")
	cl.journal_add("Deacon owes me 40 scrip. He knows.")

	# --- 3) THE WAKE: the memory law + the surviving journal ----------------------
	var deaths_before: int = main.deaths
	main.backpack.add("scrap", 10)
	main.respawn_at_home()
	for i in range(4):
		await get_tree().physics_frame
	_check("death wakes you AT THE SCAN, not the safehouse cot (%.0f m from the chair)"
			% main.player.global_position.distance_to(clinic),
		main.player.global_position.distance_to(clinic) < 5.0)
	_check("THE MEMORY LAW: the post-scan levels are GONE from your head (scavenging back to %d)"
			% main.character.level("scavenging"),
		main.character.level("scavenging") == skill_before)
	_check("THE JOURNAL SURVIVES the body (%d entries)" % cl.journal.size(), cl.journal.size() >= 2)
	_check("the wasteland still took its cut (scrap taxed)", main.backpack.count("scrap") < 10)
	_check("the death still counted", main.deaths == deaths_before + 1)

	# --- 4) the vat: cheap, no questions, the defect is forever --------------------
	main.backpack.add("scrip", 60)
	var defected := false
	for attempt in range(24): # walk the clock until the seeded roll lands
		if cl.begin_scan(true):
			main.daynight.hour += 1.2
			for i in range(4):
				await get_tree().physics_frame
			if not (cl.backup.get("defect", {}) as Dictionary).is_empty():
				defected = true
				break
			main.backpack.add("scrip", ProtoCloning.VAT_PRICE)
			main.daynight.hour += 1.0
		else:
			main.backpack.add("scrip", 40)
	_check("the vat's defect roll lands (deterministic per hour, %s)" % ("hit" if defected else "never"),
		defected)
	if defected:
		var hp_before: float = main.character.hp
		main.respawn_at_home()
		for i in range(4):
			await get_tree().physics_frame
		_check("the defective body carries the tax FOREVER (hp %d < %d)" % [int(main.character.hp), int(hp_before)],
			main.character.hp < hp_before)

	# --- 5) the chair rides the save -------------------------------------------------
	var dump: Dictionary = cl.serialize()
	var probe := ProtoCloning.create(main)
	probe.restore(dump)
	_check("backup + journal round-trip the save", probe.has_backup() and probe.journal.size() >= 2)

	_finish(prev_scale)
