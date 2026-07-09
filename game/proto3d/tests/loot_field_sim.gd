## LOOT VARIETY + WEAPONS (2026-07-09 playtest "every chest I open got the same shit /
## you didn't leave any weapons anywhere"): proves ProtoWorldStream.roll_field_cache now
## VARIES per chest and ARMS the player, and that the revived cache_rare table carries a
## weapon (it was a dead, weaponless table). Pure/static roll — no scene needed, fast.
## Run: Godot_console --headless --path game res://proto3d/tests/loot_field_sim.tscn
extends Node

var passed := 0
var failed := 0


func _check(n: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("LOOT: %s - %s" % ["PASS" if ok else "FAIL", n])


func _ready() -> void:
	var rng := RandomNumberGenerator.new()
	rng.seed = hash("loot_field_2026_07_09")
	var weapons := {"pistol": true, "shotgun": true, "machete": true, "wrench": true, "bat": true, "axe": true}
	var biomes := ["farmland", "urban", "wasteland"]
	var n := 400
	var with_weapon := 0
	var empties := 0
	var signatures := {}
	for i in n:
		var biome: String = biomes[i % biomes.size()]
		var near_road: bool = (i % 2) == 0
		var cache: Dictionary = ProtoWorldStream.roll_field_cache(biome, near_road, rng)
		if cache.is_empty():
			empties += 1
		var keys: Array = cache.keys()
		keys.sort()
		signatures[",".join(keys)] = true
		for k in cache:
			if weapons.has(k):
				with_weapon += 1
				break
	var weapon_rate := float(with_weapon) / float(n)
	_check("caches ARM you — weapon rate %.0f%% (want 8-50%%)" % (weapon_rate * 100.0),
		weapon_rate > 0.08 and weapon_rate < 0.5)
	_check("caches VARY — %d distinct loot signatures over %d rolls (want >25)" % [signatures.size(), n],
		signatures.size() > 25)
	_check("almost no cache is empty (%d/%d, want <%d)" % [empties, n, n / 10], empties < n / 10)

	# The revived cache_rare table: a weapon lives there now (was axe/bat/medkit, referenced
	# nowhere; now wired as the field jackpot AND carrying pistol/machete/wrench).
	_check("cache_rare is a real, wired table", ProtoContainer.has_loot_table("cache_rare"))
	var rare_weapon := 0
	for i in 200:
		var rare: Dictionary = ProtoContainer.roll_loot("cache_rare", rng)
		for k in rare:
			if weapons.has(k):
				rare_weapon += 1
				break
	_check("cache_rare hands out a weapon (%d/200 rolls, want >20)" % rare_weapon, rare_weapon > 20)

	print("LOOT RESULTS: %d passed, %d failed" % [passed, failed])
	print("LOOT: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
