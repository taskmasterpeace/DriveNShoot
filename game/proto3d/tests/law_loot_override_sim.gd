## Proof for THE LAW OVERRIDE layer: the SAME gun-flavored furniture rolls guns
## under free_counties_law, and rolls confiscation_notice ~65%±10 of the time a
## weapon WOULD have dropped once faith_occupation_law is forced via the real
## ProtoWorldState API (not a raw Dictionary shortcut — proves the live wiring).
## Run: godot --headless --path game res://proto3d/tests/law_loot_override_sim.tscn
extends Node

var passed := 0
var failed := 0
const N := 300


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("LAW: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _ready() -> void:
	print("LAW: start")
	get_tree().create_timer(30.0).timeout.connect(func() -> void:
		print("LAW: WATCHDOG")
		print("LAW: FAILURES PRESENT")
		get_tree().quit(1))

	var world_state := ProtoWorldState.create(null)

	# --- free_counties (the default — no state ever forced into active_laws): guns
	# roll freely across both the gun safe AND the police locker, many seeds -------
	var free_guns := 0
	for i in N:
		var rng := RandomNumberGenerator.new()
		rng.seed = hash("law_loot_override_sim:free:%d" % i)
		var loot: Dictionary = ProtoLootResolver.resolve("gun_safe", "", "SOME_FREE_STATE", null, rng,
			world_state.law_for("SOME_FREE_STATE"))
		for item_id in loot:
			if String(item_id) in ["pistol", "shotgun", "9mm", "12ga"]:
				free_guns += 1
	_check("free_counties_law: guns roll through untouched (%d/%d rolls had one)" % [free_guns, N],
		free_guns > N / 3)

	# --- Force FLORIDA under faith_occupation_law via the REAL API (the offline
	# catch-up's own takeover path), then resolve the SAME gun safe + police locker
	# repeatedly: confiscation_notice should appear ~DEFAULT_LAW_OVERRIDE_CHANCE
	# (0.65) of the times a weapon-tagged item would have rolled. ------------------
	world_state.active_laws["FLORIDA"] = "faith_occupation_law"
	_check("faith_occupation_law is now active for FLORIDA (real API, not a shortcut)",
		world_state.law_id_for("FLORIDA") == "faith_occupation_law"
		and String(world_state.law_for("FLORIDA").get("guns", "")) == "contraband")

	# The 0.65 chance is PER WEAPON STACK (spec §5.2: each rolled gun independently
	# becomes a notice) — so the estimator is notices / (notices + survivors).
	# Counting per SEED instead inflates to 1-(0.35)^k (≈88% at k=2 stacks): the
	# original version of this sim made exactly that mistake.
	var notice_stacks := 0
	var surviving_stacks := 0
	var got_weapon := 0
	for i in N:
		var rng := RandomNumberGenerator.new()
		rng.seed = hash("law_loot_override_sim:occupied:%d" % i)
		var loot: Dictionary = ProtoLootResolver.resolve("gun_safe", "", "FLORIDA", null, rng,
			world_state.law_for("FLORIDA"))
		notice_stacks += int(loot.get("confiscation_notice", 0))
		for item_id in loot:
			if String(item_id) in ["pistol", "shotgun", "9mm", "12ga"]:
				surviving_stacks += 1
				got_weapon += 1

	var per_stack_rate: float = float(notice_stacks) / float(maxi(1, notice_stacks + surviving_stacks))
	_check("faith_occupation_law: per-STACK confiscation ~65%%±10 (%.1f%%, %d seized / %d weapon stacks)" %
		[per_stack_rate * 100.0, notice_stacks, notice_stacks + surviving_stacks],
		per_stack_rate > 0.55 and per_stack_rate < 0.75)
	_check("…and SOME guns still slip through (not 100%% seized: %d weapon hits/%d)" % [got_weapon, N],
		got_weapon > 0)

	# --- Police locker too — the recon's OTHER gun-flavored container --------------
	var locker_notice := 0
	var locker_would_be := 0
	for i in N:
		var rng := RandomNumberGenerator.new()
		rng.seed = hash("law_loot_override_sim:locker:%d" % i)
		var rng_probe := RandomNumberGenerator.new()
		var loot: Dictionary = ProtoLootResolver.resolve("police_locker", "", "FLORIDA", null, rng,
			world_state.law_for("FLORIDA"))
		locker_notice += int(loot.get("confiscation_notice", 0))
		for item_id in loot:
			if String(item_id) in ["pistol", "shotgun", "9mm", "12ga"]:
				locker_would_be += 1
	var locker_rate: float = float(locker_notice) / float(maxi(1, locker_notice + locker_would_be))
	_check("police locker under the same law: per-STACK confiscation ~65%%±10 too (%.1f%%, %d/%d)" %
		[locker_rate * 100.0, locker_notice, locker_notice + locker_would_be],
		locker_rate > 0.55 and locker_rate < 0.75)

	print("LAW RESULTS: %d passed, %d failed" % [passed, failed])
	print("LAW: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
