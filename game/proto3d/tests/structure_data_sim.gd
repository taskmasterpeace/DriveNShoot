## Proof for STRUCTURE PROFILES (World_Structures spec §7-8, §19 structure_data_sim):
## the catalog is ROWS — every row has required fields, a valid footprint name, a
## REAL loot-table reference, and at least one systemic JOB (§9 multi-use rule);
## the SHELL BUILDER materializes every row (walls + door gap when enterable, the
## §18 sign glyph, seeded loot) — created on a stage, NOT placed in the world
## (owner's order: roads + exits first). Bad rows warn, never crash.
## Run: godot --headless --path game res://proto3d/tests/structure_data_sim.tscn
extends Node

var passed := 0
var failed := 0


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("STRUCT: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _ready() -> void:
	print("STRUCT: start")
	get_tree().create_timer(45.0).timeout.connect(func() -> void:
		print("STRUCT: WATCHDOG"); print("STRUCT: FAILURES PRESENT"); get_tree().quit(1))

	# --- The catalog folds ------------------------------------------------------
	DrivnData.ensure_structures()
	_check("the catalog LOADED (%d rows)" % DrivnData.structures.size(), DrivnData.structures.size() >= 15)
	_check("the fold flagged no row problems (%s)" % str(DrivnData.structure_warnings),
		DrivnData.structure_warnings.is_empty())

	# --- Spec MVP list present (§17) ---------------------------------------------
	for id in ["gas_station_small", "market_general", "motel_strip", "house_small",
			"police_station", "clinic_small", "courthouse", "auto_shop", "junkyard",
			"warehouse", "monument_plaza", "checkpoint_road", "military_base_shell"]:
		_check("MVP row '%s' exists" % id, DrivnData.structures.has(id))

	# --- THE MERIDIAN TESTING SET (owner 2026-07-09) + the M0 migration rows -------
	for id in ["bar_roadhouse", "jeweler", "restaurant_fancy", "school_small", "fight_pit",
			"derby_bowl", "race_track_grandstand", "drone_ring", "clone_wing", "blackmarket_vat"]:
		_check("testing row '%s' exists (the spec web's proving-ground set)" % id, DrivnData.structures.has(id))
	for id in ["ruined_house", "market_stall", "safehouse"]:
		_check("M0 migration row '%s' exists (legacy usmap ids become shells)" % id, DrivnData.structures.has(id))

	# --- Every row is LAWFUL: fields, footprint names, loot refs, the JOB rule ----
	var all_lawful := true
	var loot_ok := true
	for id in DrivnData.structures:
		var row: DrivnStructure = DrivnData.structures[id]
		if not row.validate().is_empty():
			all_lawful = false
		if row.loot_table != "":
			var rng := RandomNumberGenerator.new()
			rng.seed = 1
			# roll_loot on a MISSING table returns {} always; a real table with
			# weight-1.0 entries yields something across a few seeds.
			var any := false
			for s in 5:
				rng.seed = s
				if not ProtoContainer.roll_loot(row.loot_table, rng).is_empty():
					any = true
					break
			if not any:
				loot_ok = false
				print("STRUCT: bad loot table ref '%s' on %s" % [row.loot_table, id])
	_check("every row passes validate() (fields+footprint+the JOB rule §9)", all_lawful)
	_check("every loot_table reference ROLLS real loot", loot_ok)

	# --- The shell builder materializes EVERY row ---------------------------------
	var built := 0
	var signs_ok := true
	var loot_chests_ok := true
	var tagged_ok := true
	for id in DrivnData.structures:
		var row: DrivnStructure = DrivnData.structures[id]
		var shell := ProtoStructureBuilder.materialize(id)
		if shell == null:
			continue
		add_child(shell)
		shell.position = Vector3(built * 60.0, 0, 0) # a test lot, not the world
		built += 1
		if not (shell.is_in_group("structure") and String(shell.get_meta("structure_id")) == id):
			tagged_ok = false
		var has_sign := false
		var has_chest := false
		for c in shell.get_children():
			if c is ProtoSign:
				has_sign = true
			if c is ProtoChest:
				has_chest = true
		if not has_sign:
			signs_ok = false
		if row.loot_table != "" and not has_chest:
			loot_chests_ok = false
	_check("the builder materialized EVERY row (%d/%d)" % [built, DrivnData.structures.size()],
		built == DrivnData.structures.size())
	_check("every shell carries its SIGN GLYPH (§18)", signs_ok)
	_check("every looted row carries its CACHE (§9)", loot_chests_ok)
	_check("every shell is TAGGED for the systems (§2 rule 1)", tagged_ok)

	# --- Enterable shells have a REAL door gap + are FURNISHED (not empty) ---------
	var gas := ProtoStructureBuilder.materialize("gas_station_small")
	add_child(gas)
	gas.position = Vector3(0, 0, 200)
	var walls := 0
	var furniture := 0
	for c in gas.get_children():
		if c is ProtoFurniture:
			furniture += 1
		elif c is StaticBody3D and not (c is ProtoChest): # the cache is a body too
			walls += 1
	_check("an enterable shell splits the front wall (5 wall bodies = a doorway)", walls == 5)
	_check("an enterable shell is FURNISHED — not an empty box (%d interactable pieces)" % furniture,
		furniture >= 2)

	# --- The unknown-id law: warn, never crash -------------------------------------
	var ghost := ProtoStructureBuilder.materialize("no_such_building")
	_check("an unknown id returns null (warn-not-crash)", ghost == null)

	print("STRUCT RESULTS: %d passed, %d failed" % [passed, failed])
	print("STRUCT: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
