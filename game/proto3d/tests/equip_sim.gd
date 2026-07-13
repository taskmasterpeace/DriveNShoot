## Proof for THE 19-SLOT PAPERDOLL (docs/design/EQUIPMENT_PAPERDOLL.md), rung 1: the
## wearable-gear SPINE. 19 slots (all bare by default), the gear catalog folds from
## data ("a new gear = a ROW"), USE wears a piece, WORN ARMOR blunts a wound through
## the real take_wound choke point, one-item-per-slot swaps, and worn gear survives
## save/load. Run:
##   godot --headless --path game res://proto3d/tests/equip_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node3D


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("GEAR: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _ready() -> void:
	print("GEAR: start")
	get_tree().create_timer(60.0).timeout.connect(func() -> void:
		print("GEAR: WATCHDOG"); print("GEAR: FAILURES PRESENT"); get_tree().quit(1))
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 8:
		await get_tree().process_frame

	# --- The spine: 19 slots, all bare, and the catalog folded at boot ----------
	_check("the paperdoll has all 19 slots, every one bare at start",
		main.character.worn.size() == 19
		and main.character.worn.values().all(func(v: Variant) -> bool: return String(v) == ""))
	_check("code-floor gear is in the catalog (kevlar_vest)",
		ProtoGear.CATALOG.has("kevlar_vest"))
	_check("a JSON-only row FOLDED IN (a new gear = a ROW): composite_shell",
		ProtoGear.CATALOG.has("composite_shell")
		and ProtoGear.slot_of("composite_shell") == "chest")

	# --- Reachable in play: gear is a real pack ITEM and drops from loot ---------
	_check("gear registers as a usable pack ITEM (kevlar_vest, cat armor)",
		ProtoContainer.ITEMS.has("kevlar_vest")
		and bool((ProtoContainer.ITEMS["kevlar_vest"] as Dictionary).get("usable", false))
		and String((ProtoContainer.ITEMS["kevlar_vest"] as Dictionary).get("cat", "")) == "armor")
	var lrng := RandomNumberGenerator.new()
	lrng.seed = hash("gear_loot")
	var looted_gear := false
	for _i in 80:
		for k in ProtoContainer.roll_loot("armor_cache", lrng):
			if ProtoGear.CATALOG.has(String(k)):
				looted_gear = true
	_check("gear is LOOTABLE — the armory cache rolls a wearable piece", looted_gear)
	# Found at a PLACE: the Military Base's chest pulls the armory table.
	var armory_wired := false
	var sp: Variant = JSON.parse_string(FileAccess.get_file_as_string("res://data/world/structure_profiles.json"))
	if sp is Dictionary:
		for srow in ((sp as Dictionary).get("structures", []) as Array):
			if srow is Dictionary and String((srow as Dictionary).get("id", "")) == "military_base_shell":
				armory_wired = String((srow as Dictionary).get("loot_table", "")) == "armor_cache"
	_check("the Military Base chest pulls the armory table (gear found at a place)",
		armory_wired and ProtoContainer.has_loot_table("armor_cache"))

	# --- The real USE verb wears a piece from the pack --------------------------
	main.backpack.add("kevlar_vest", 1)
	var used: bool = main.use_item("kevlar_vest")
	main.backpack.remove("kevlar_vest", 1) # use_item returns true; the panel drains the pack
	_check("USE wears a gear from the pack (kevlar_vest -> chest slot)",
		used and String(main.character.worn.get("chest", "")) == "kevlar_vest")

	# --- WORN ARMOR blunts a wound, felt through the real take_wound path --------
	var c := ProtoCharacter.new()
	var t0: float = c.body["torso"].hp
	c.take_wound("torso", 20.0) # bare
	var loss_bare: float = t0 - c.body["torso"].hp
	c.body["torso"].hp = t0
	c.hp = c.hp_cap()
	c.dead = false
	c.equip("kevlar_vest") # soak 0.24 on the torso
	c.take_wound("torso", 20.0)
	var loss_armored: float = t0 - c.body["torso"].hp
	_check("bare, a 20 wound lands full (~20 lost)", absf(loss_bare - 20.0) < 0.5)
	_check("worn armor BLUNTS the same wound (armored loss < bare loss)",
		loss_armored < loss_bare)
	_check("the cut matches the row's soak (~24%% less, tolerance ±2)",
		absf(loss_armored - 20.0 * (1.0 - 0.24)) < 2.0)

	# --- A second covering piece STACKS; the sum is clamped (never invulnerable) -
	c.equip("kevlar_collar") # neck, covers head+torso, soak 0.06
	_check("a second covering piece STACKS the soak (0.24 + 0.06 = 0.30)",
		absf(c.armor_soak("torso") - 0.30) < 0.001)
	_check("soak is capped at 0.75 — never invulnerable",
		c.armor_soak("torso") <= 0.75)

	# --- ONE ITEM PER SLOT: a new chest piece swaps the old, never both ---------
	c.equip("composite_shell") # chest, T5
	_check("ONE ITEM PER SLOT: a new chest piece SWAPS the old (composite_shell)",
		String(c.worn["chest"]) == "composite_shell")
	_check("equip refuses an unknown id", not c.equip("banana_peel"))

	# --- The 13 non-armor slots earn their keep: carry + stealth MODS -----------
	var g := ProtoCharacter.new()
	var carry_bare: float = g.carry_cap()
	g.equip("frame_pack") # back slot, +18 kg
	_check("the back slot ADDS carry (a pack raises the cap ~+18kg)",
		absf((g.carry_cap() - carry_bare) - 18.0) < 0.5)
	var seen_bare: float = g.stealth_detect_mult()
	g.equip("ghillie_poncho") # outer_coat, -12% detection
	_check("the coat slot makes you STEALTHIER (detection range drops)",
		g.stealth_detect_mult() < seen_bare)
	_check("a bare survivor gets NO gear mod (unchanged carry + stealth)",
		absf(ProtoCharacter.new().carry_cap() - carry_bare) < 0.001
		and absf(ProtoCharacter.new().stealth_detect_mult() - seen_bare) < 0.001)

	# --- Worn gear survives save/load (the dog pattern) -------------------------
	c.equip("kevlar_vest")
	c.equip("riot_helm")
	var rec: Dictionary = c.to_record()
	var d := ProtoCharacter.new()
	d.from_record(rec)
	_check("worn gear ROUND-TRIPS through save/load",
		String(d.worn["chest"]) == "kevlar_vest"
		and String(d.worn["head"]) == "riot_helm"
		and String(d.worn["legs"]) == "")
	var e := ProtoCharacter.new()
	e.from_record({}) # an old save with no paperdoll block
	_check("an old save with no worn loads clean (all 19 bare, no crash)",
		e.worn.size() == 19
		and e.worn.values().all(func(v: Variant) -> bool: return String(v) == ""))
	var f := ProtoCharacter.new()
	f.from_record({"worn": {"chest": "ghost_gear_999", "head": "riot_helm"}})
	_check("a retired/unknown worn id drops to bare on load (the catalog guards)",
		String(f.worn["chest"]) == "" and String(f.worn["head"]) == "riot_helm")

	print("GEAR RESULTS: %d passed, %d failed" % [passed, failed])
	print("GEAR: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
