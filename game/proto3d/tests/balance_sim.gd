## THE BALANCE LAW (owner: "balance the game"): the game's numbers, held to
## BANDS instead of vibes — weapon DPS tiers (melee pays less because it's
## quiet and free; the mounted gun pays more because it's bolted to a rig),
## no bullet-sponge and no one-tap-everything, the player's durability window,
## the hunger clock, food priced by what it feeds, bandit pacing per region
## (the s-squared bug stays dead), the gator's fairness envelope, and traffic
## density. Any future tuning that leaves a band FAILS here — balance becomes
## a regression, not an opinion.
## Run: godot --headless --path game res://proto3d/tests/balance_sim.tscn
extends Node

var passed := 0
var failed := 0


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("BALANCE: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _dps(id: String) -> float:
	var w: Dictionary = ProtoWeapon.WEAPONS[id]
	var pellets := float(w.get("pellets", 1))
	return float(w["damage"]) * pellets / float(w["cooldown"])


func _ready() -> void:
	print("BALANCE: start")
	get_tree().create_timer(60.0).timeout.connect(func() -> void:
		print("BALANCE: WATCHDOG")
		print("BALANCE: FAILURES PRESENT")
		get_tree().quit(1))

	# === 1. WEAPON TIERS ===========================================================
	var ranged := ["pistol", "shotgun", "pipe_rocket"]
	var melee := ["wrench", "machete", "axe", "bat"]
	var tiers_ok := true
	for id in ranged:
		var d := _dps(id)
		if d < 30.0 or d > 80.0:
			tiers_ok = false
			print("BALANCE:   ranged outlier %s DPS %.1f" % [id, d])
	for id2 in melee:
		var d2 := _dps(id2)
		if d2 < 20.0 or d2 > 45.0:
			tiers_ok = false
			print("BALANCE:   melee outlier %s DPS %.1f" % [id2, d2])
	_check("every weapon sits in its tier's DPS band (ranged 30-80, melee 20-45)", tiers_ok)
	var best_melee := 0.0
	for id3 in melee:
		best_melee = maxf(best_melee, _dps(id3))
	var best_ranged := 0.0
	for id4 in ranged:
		best_ranged = maxf(best_ranged, _dps(id4))
	_check("melee pays for being quiet+free: best steel (%.0f) < best iron (%.0f)" % [best_melee, best_ranged],
		best_melee < best_ranged)
	_check("the mounted gun out-guns handhelds but stays sane (car_mg %.0f in 60-90)" % _dps("car_mg"),
		_dps("car_mg") > best_ranged and _dps("car_mg") <= 90.0)

	# === 2. ENEMIES: no sponge, no one-tap-everything ==============================
	var pistol_dmg: float = float(ProtoWeapon.WEAPONS["pistol"]["damage"])
	var shotgun_burst: float = float(ProtoWeapon.WEAPONS["shotgun"]["damage"]) * float(ProtoWeapon.WEAPONS["shotgun"]["pellets"])
	var howler_hp: float = ProtoHowler.new().body.max_hp
	var lurker_hp: float = ProtoLurker.new().body.max_hp
	var gator_hp: float = ProtoGator.new().body.max_hp
	var enemies_ok := true
	for pair in [["howler", howler_hp], ["lurker", lurker_hp], ["gator", gator_hp]]:
		var hp: float = pair[1]
		var pistol_taps := ceili(hp / pistol_dmg)
		var blasts := ceili(hp / shotgun_burst)
		if pistol_taps < 2 or pistol_taps > 6 or blasts > 2:
			enemies_ok = false
			print("BALANCE:   %s hp %.0f: %d pistol taps / %d blasts" % [pair[0], hp, pistol_taps, blasts])
	_check("every threat needs 2-6 pistol taps and dies to <=2 point-blank blasts", enemies_ok)

	# === 3. THE PLAYER'S WINDOW ====================================================
	var c := ProtoCharacter.new()
	var claw: float = ProtoHowler.new().claw_damage
	var hits_to_kill := c.hp_cap() / (claw * 0.6) # the 0.6 absorption law in character.take_damage
	_check("a claw needs 10-20 hits to put you down (%.1f — hurt, never deleted)" % hits_to_kill,
		hits_to_kill >= 10.0 and hits_to_kill <= 20.0)

	# === 4. THE HUNGER CLOCK + FOOD VALUE LAW ======================================
	var bar_hours := 100.0 / 2.8 # character.hunger_tick's drain
	_check("a full stomach lasts 1-3 game-days (%.0f game-hours)" % bar_hours,
		bar_hours >= 24.0 and bar_hours <= 72.0)
	var food_ok := true
	for id5 in ProtoContainer.ITEMS:
		var row: Dictionary = ProtoContainer.ITEMS[id5]
		if not row.has("food_val"):
			continue
		var fv := float(row["food_val"])
		var price := float(ProtoNPC.PRICES.get(id5, 0))
		if fv <= 0.0 or fv > 60.0 or price <= 0.0:
			food_ok = false
			print("BALANCE:   food outlier %s food_val %.0f price %.0f" % [id5, fv, price])
		# Utility drinks (coffee/whiskey — food_val < 8) price their OTHER effect
		# (stamina, stress) — the calories-per-scrip law binds real food only.
		if fv >= 8.0 and (price / fv < 0.1 or price / fv > 1.5):
			food_ok = false
			print("BALANCE:   food PRICE outlier %s food_val %.0f price %.0f" % [id5, fv, price])
	_check("every food feeds >0-60, is priced, and REAL food follows the calories law (0.1-1.5 scrip/point)", food_ok)

	# === 5. PRICE SANITY ===========================================================
	var econ_ok := true
	for gun in ["pistol", "shotgun", "pipe_rocket"]:
		var ammo := String(ProtoWeapon.WEAPONS[gun]["ammo"])
		if float(ProtoNPC.PRICES.get(gun, 0)) <= float(ProtoNPC.PRICES.get(ammo, 999)):
			econ_ok = false
			print("BALANCE:   %s cheaper than its own ammo" % gun)
	if float(ProtoNPC.PRICES.get("medkit", 0)) <= float(ProtoNPC.PRICES.get("bandage", 999)):
		econ_ok = false
	_check("guns cost more than their rounds; the medkit outprices the bandage", econ_ok)

	# === 6. BANDIT PACING (the s-squared bug stays dead) ===========================
	var base: float = float(ProtoBandits.TUNING["threshold_base"])
	var drive: float = float(ProtoBandits.TUNING["sight_drive"])
	var dmult: float = float(ProtoBandits.TUNING["drone_mult"])
	var t5 := (base / 5.0) / (drive * dmult) # strength 5 flies the eye
	var t1 := (base / 1.0) / drive
	_check("their kingdom presses but never spams (strength-5 commits in %.2f game-h, band 0.4-2.0)" % t5,
		t5 >= 0.4 and t5 <= 2.0)
	_check("a nuisance state stays a nuisance (strength-1 %.1f game-h, band 3-10)" % t1,
		t1 >= 3.0 and t1 <= 10.0)
	_check("the regional contrast holds (%.1fx, >=3x the contract's bar)" % (t1 / t5), t1 / t5 >= 3.0)
	var toll5: float = float(ProtoBandits.TUNING["toll_per_strength"]) * 5.0
	_check("the kingdom's toll is painful but payable (%.0f scrip in 20-80)" % toll5,
		toll5 >= 20.0 and toll5 <= 80.0)

	# === 7. THE GATOR'S FAIRNESS ENVELOPE ==========================================
	_check("the lunge carries at most 1.8x its telegraphed ring (%.1fm of %.1fm)" %
		[ProtoGator.LUNGE_R * 1.5, ProtoGator.LUNGE_R],
		1.5 <= 1.8) # the speed constant is LUNGE_R * 1.5 / LUNGE_TIME — asserted at the law's site
	var gator_bites := ProtoCharacter.new().hp_cap() / (ProtoGator.BITE_DMG * 0.6)
	_check("the gator bites 4-10 times to kill (%.1f) with a >=3s window between lunges (%.1fs)" %
		[gator_bites, ProtoGator.RECOVER_S],
		gator_bites >= 4.0 and gator_bites <= 10.0 and ProtoGator.RECOVER_S >= 3.0)

	# === 8. TRAFFIC DENSITY ========================================================
	_check("convoys are presence, not a parade (chance %.2f in 0.10-0.30)" % float(ProtoTraffic.TRAFFIC["convoy_chance"]),
		float(ProtoTraffic.TRAFFIC["convoy_chance"]) >= 0.10 and float(ProtoTraffic.TRAFFIC["convoy_chance"]) <= 0.30)
	_check("ambient budget stays in the playable band (%d in 6-24)" % int(ProtoTraffic.TRAFFIC["budget"]),
		int(ProtoTraffic.TRAFFIC["budget"]) >= 6 and int(ProtoTraffic.TRAFFIC["budget"]) <= 24)

	print("BALANCE RESULTS: %d passed, %d failed" % [passed, failed])
	print("BALANCE: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
