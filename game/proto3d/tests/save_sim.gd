## Proof for SAVE/LOAD: one file carries the whole run — the player (pack,
## wounds, position), the dogs (bond and memory intact), the ring's lit nodes,
## the home's upgrades (re-raised, no duplicates), the ledger, the clock, and
## THE CIRCUIT. Save → wreck everything → load → the road remembers.
## Run: godot --headless --path game res://proto3d/tests/save_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node3D


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("SAVE: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _ready() -> void:
	print("SAVE: start")
	get_tree().create_timer(90.0).timeout.connect(func() -> void:
		print("SAVE: WATCHDOG")
		print("SAVE: FAILURES PRESENT")
		get_tree().quit(1))
	Engine.time_scale = 2.5
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 8:
		await get_tree().process_frame
	main._exit_car()

	# --- Build a run worth keeping ------------------------------------------------
	main.backpack.add("scrip", 77)
	main.backpack.add("scrap", 20)
	main.use_item("wrench")
	main.daynight.day = 3
	main.daynight.hour = 21.0
	main.respect.add_esteem("NEVADA", 120.0)
	main.carousel.set_active("camp_bellamy")
	main.homebase.interact(main) # WALLS I (6 scrap + 10 scrip)
	var dog := ProtoDog.create(ProtoDog.DogType.HUNTER, "Keeper", "Bloodhound")
	main.add_child(dog)
	dog.global_position = main.player.global_position + Vector3(2, 0.4, 0)
	dog.interact(main) # adopt
	dog.bond = 47.0
	dog.times_saved = 2
	main.circuit_beat("scavenge")
	var jack0: int = main.backpack.count("scrip")
	var walls0: int = main.homebase.walls_tier()
	main.character.take_wound("l_arm", 30.0)
	main.character.hp = main.character.hp_cap()
	var arm0: float = main.character.body["l_arm"].hp
	# The formerly-LEAKING world state (HANDOFF §2b): hunger, weather, an active war.
	main.character.hunger = 37.0
	main.weather.force("dust", 999.0)
	main.events.today_event = "state_at_war"
	main.events.war_state = "TEXAS"
	# CREW: hire one, hurt him a little — he must survive the reload (was vanishing).
	var sam := ProtoCompanion.create(main, "sam")
	main.add_child(sam)
	sam.global_position = main.player.global_position + Vector3(3, 0.2, 0)
	sam.hp = 44.0
	main.companions.append(sam)
	# METAWORLD: a dog dehydrated off-screen (left guarding) — its record must persist.
	var ghost := ProtoDog.create(ProtoDog.DogType.SECURITY, "Ghost", "Shepherd")
	main.add_child(ghost)
	ghost.adopted = true
	main.metaworld.dehydrate(ghost)
	var meta0: int = main.metaworld.records.size()

	# --- SAVE, then WRECK everything -------------------------------------------------
	main.save_game()
	_check("the save hit the disk", FileAccess.file_exists(main.SAVE_PATH))
	main.backpack.remove("scrip", jack0)
	main.daynight.day = 1
	main.respect.add_infamy("NEVADA", 500.0)
	dog.take_damage(999.0)
	dog._bleed_out_t = 0.1
	for _i in 20:
		await get_tree().physics_frame
	_check("(the wreck is real: dog gone, pockets empty)", main.backpack.count("scrip") == 0 and not is_instance_valid(dog))
	main.character.treat("l_arm", 100.0)
	for k in main.circuit_beats:
		main.circuit_beats[k] = false

	# --- LOAD: the road remembers -------------------------------------------------
	main.ecology._last_h = 999999.0 # a stale eco clock a load must re-anchor
	_check("load succeeds", main.load_game())
	_check("the pockets came back (%d scrip)" % main.backpack.count("scrip"), main.backpack.count("scrip") == jack0)
	# LWE §0.7 (audit-3): the eco tick RE-ANCHORS to the restored clock — an
	# older save must never freeze the director, a newer one must never fire
	# one phantom whole-game-age tick.
	_check("the ECO CLOCK re-anchored on load (sentinel set)", main.ecology._last_h == -1.0)
	_check("the clock came back (day %d, %02.0f:00)" % [main.daynight.day, main.daynight.hour],
		main.daynight.day == 3 and absf(main.daynight.hour - 21.0) < 0.2)
	_check("the ledger came back (NEVADA %s)" % main.respect.standing("NEVADA"),
		main.respect.standing("NEVADA") in ["TRUSTED", "HERO"])
	_check("the RING came back (bellamy lit)", main.carousel.active.get("camp_bellamy", false)
		and main.carousel.gates["camp_bellamy"].state == "active")
	_check("the HOME came back (walls %d)" % main.homebase.walls_tier(), main.homebase.walls_tier() == walls0)
	var back: ProtoDog = null
	for n in main.get_children():
		if n is ProtoDog and (n as ProtoDog).adopted and (n as ProtoDog).dog_name == "Keeper":
			back = n
	_check("the DOG came back — bond and memory intact (%.0f bond, %d saves)" % [back.bond if back else -1.0, back.times_saved if back else -1],
		back != null and is_equal_approx(back.bond, 47.0) and back.times_saved == 2)
	_check("the wound came back too (l_arm %.0f — saves don't heal you)" % main.character.body["l_arm"].hp,
		absf(main.character.body["l_arm"].hp - arm0) < 0.01)
	_check("THE CIRCUIT came back (scavenge ✓)", main.circuit_beats["scavenge"])
	# The leaks are plugged: hunger, weather, and the war all survive the reload.
	_check("HUNGER came back (%.0f — no longer loads full)" % main.character.hunger, absf(main.character.hunger - 37.0) < 0.5)
	_check("the WEATHER came back (dust, not clear)", main.weather.state == "dust")
	_check("the WAR came back (%s)" % main.events.war_state, main.events.war_state == "TEXAS" and main.events.today_event == "state_at_war")
	# THE CREW came back — one Sam, hurt as saved (44 hp), not a fresh full hire.
	var sam_back: ProtoCompanion = null
	for c in main.companions:
		if c is ProtoCompanion and (c as ProtoCompanion).crew_id == "sam":
			sam_back = c
	_check("the CREW came back (Sam re-hired, %.0f hp)" % (sam_back.hp if sam_back else -1.0),
		sam_back != null and absf(sam_back.hp - 44.0) < 0.5 and main.companions.size() == 1)
	_check("the METAWORLD record came back (%d off-screen dog)" % main.metaworld.records.size(),
		main.metaworld.records.size() == meta0 and meta0 >= 1)
	# The save carries a VERSION (future-proofs schema changes) and the safehouse
	# is now ONE anchor (respawn + go-home agree within the go-home radius).
	var rec_v: Dictionary = main.save_game()
	_check("the save is versioned (v%d)" % int(rec_v.get("version", -1)), int(rec_v.get("version", -1)) == main.SAVE_VERSION)
	_check("respawn + go-home share ONE safehouse anchor",
		(main.SAFEHOUSE + Vector3(0, 0.3, 0)).distance_to(ProtoObjectives.HOME) < ProtoObjectives.HOME_RADIUS)
	main.load_game() # double-load: no duplicate benches/dogs
	for _i in 3:
		await get_tree().physics_frame # queue_free clears at frame end
	var keepers := 0
	for n in main.get_children():
		if n is ProtoDog and (n as ProtoDog).adopted and (n as ProtoDog).dog_name == "Keeper":
			keepers += 1
	_check("double-load doesn't duplicate the pack (%d Keeper)" % keepers, keepers == 1)

	# --- OLD-SAVE MIGRATION: a pre-rename save's 'jack' arrives as scrip ---------
	var old_slots := {"jack": 40, "scrap": 3, "scrip": 2}
	var migrated: Dictionary = main.migrate_item_ids(old_slots)
	_check("old-save jack lands as scrip, additive (40+2=%d)" % migrated.get("scrip", 0),
		int(migrated.get("scrip", 0)) == 42 and not migrated.has("jack") and int(migrated.get("scrap", 0)) == 3)

	Engine.time_scale = 1.0
	print("SAVE RESULTS: %d passed, %d failed" % [passed, failed])
	print("SAVE: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
