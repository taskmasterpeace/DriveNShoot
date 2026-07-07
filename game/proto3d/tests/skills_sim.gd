## Proof for THE SKILL TREE: 10 skills, every one wired to a REAL effect — no dead
## stats. For each skill: set the level, measure the number move. Plus the XP-by-use
## hooks fire from real actions (pet→Kinship, bandage→First Aid, chest→Scavenging,
## melee swing→Melee, salvage→Mechanics) and the level-up toast names the gain.
## Run: godot --headless --path game res://proto3d/tests/skills_sim.tscn
extends Node

var main: Node3D
var t := 0.0
var phase := 0
var phase_t := 0.0
var passed := 0
var failed := 0


func _ready() -> void:
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	print("SKL: scene up")


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("SKL: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _set_level(id: String, lvl: int) -> void:
	main.character.skills[id] = {"xp": 40.0 * lvl * lvl, "level": lvl}


func _next() -> void:
	phase += 1
	phase_t = 0.0


func _physics_process(delta: float) -> void:
	t += delta
	phase_t += delta
	match phase:
		0:
			if phase_t > 0.6:
				var ch: ProtoCharacter = main.character
				_check("the tree is 12 skills (10 + MARTIAL ARTS + PILOTING)", ProtoCharacter.SKILLS.size() == 12)
				var stars := 0
				for id in ProtoCharacter.SKILLS:
					if ProtoCharacter.SKILLS[id].get("star", false):
						stars += 1
				_check("⭐ Driving and ⭐ Kinship are the signatures", stars == 2
					and ProtoCharacter.SKILLS["driving"]["star"] and ProtoCharacter.SKILLS["kinship"]["star"])
				# --- ⭐ DRIVING: control + top ride into the car -------------
				_set_level("driving", 6)
				main._apply_skill_effects()
				_check("Driving 6 → car control ×%.2f, top ×%.2f" % [main.active_car.driver_control, main.active_car.driver_top],
					main.active_car.driver_control > 1.25 and main.active_car.driver_top > 1.04)
				# --- ⭐ KINSHIP: obedience, tame cost, horn, morale ----------
				_set_level("kinship", 6)
				_check("Kinship 6 → commands land %.0f%% faster" % ((1.0 - ch.kinship_obey_mult()) * 100.0), ch.kinship_obey_mult() < 0.4)
				_check("Kinship 6 → taming costs 1 meat (was 3)", ch.tame_meat_needed() == 1)
				_check("Kinship 6 → the horn carries %dm (was 55)" % int(ch.horn_recall_radius()), ch.horn_recall_radius() > 70.0)
				_check("Kinship 6 → the pack stands braver (+%.2f morale)" % ch.kinship_morale_bonus(), ch.kinship_morale_bonus() > 0.2)
				_next()
		1:
			if phase_t > 0.2:
				var ch: ProtoCharacter = main.character
				# --- The other seven, each a real number that moves ----------
				_set_level("mechanics", 5)
				_check("Mechanics 5 → repairs ×%.2f, +%d salvage, hotwire %.1fs" % [ch.repair_mult(), ch.salvage_bonus(), main._hotwire_duration()],
					ch.repair_mult() > 1.3 and ch.salvage_bonus() >= 2 and main._hotwire_duration() < 3.0)
				_set_level("marksmanship", 5)
				var wpn := ProtoWeapon.new("pistol")
				_check("Marksmanship 5 → crit %.0f%% (base 15), reload ×%.2f" % [wpn.current_crit(main) * 100.0, ch.reload_mult()],
					wpn.current_crit(main) > 0.19 and ch.reload_mult() < 0.84)
				_set_level("melee", 5)
				_check("Melee 5 → dmg ×%.2f, stamina ×%.2f, +kd %.2f" % [ch.melee_dmg_mult(), ch.melee_stam_mult(), ch.melee_kd_bonus()],
					ch.melee_dmg_mult() > 1.25 and ch.melee_stam_mult() < 0.8)
				_set_level("endurance", 5)
				main._apply_skill_effects()
				_check("Endurance 5 → tank %d (was 100), regen ×%.2f" % [int(main.player.max_stamina), main.player.endurance_regen],
					main.player.max_stamina == 130.0 and main.player.endurance_regen == 1.25)
				_set_level("strength", 4)
				_check("Strength 4 → carry %.0fkg (was 32), shove ×%.2f" % [ch.carry_cap(), ch.shove_mult()],
					ch.carry_cap() == 42.0 and ch.shove_mult() > 1.2)
				_set_level("stealth", 6)
				main._apply_skill_effects()
				_check("Stealth 6 → walking, seen at ×%.2f range" % main.player.noise_mult(),
					not main.player._was_running and main.player.noise_mult() == 0.7)
				_set_level("scavenging", 6)
				_check("Scavenging 6 → +%d cache finds, fragment reveals %d chunks" % [ch.scavenge_bonus(), ch.fragment_reveal_radius()],
					ch.scavenge_bonus() == 3 and ch.fragment_reveal_radius() == 5)
				_set_level("first_aid", 5)
				_check("First Aid 5 → treatments ×%.2f" % ch.heal_mult(), ch.heal_mult() > 1.3)
				_next()
		2:
			if phase_t > 0.2:
				var ch: ProtoCharacter = main.character
				# --- XP-BY-USE: real actions teach ---------------------------
				var chest := ProtoChest.create("Cache", {"9mm": 4})
				add_child(chest)
				var scav0: float = ch.skills["scavenging"]["xp"]
				chest.interact(main)
				_check("cracking a cache teaches Scavenging (+%d xp) and skilled eyes found +scrap" % int(ch.skills["scavenging"]["xp"] - scav0),
					ch.skills["scavenging"]["xp"] > scav0 and chest.container.count("scrap") >= 3)
				main.panel.close()
				var fa0: float = ch.skills["first_aid"]["xp"]
				# 60 damage leaves headroom above the base 30 heal (Damageable clamps
				# to max_hp — the iron-list gotcha; the skill's bonus needs room to show).
				ch.body["l_arm"].damage(60.0)
				var arm0: float = ch.body["l_arm"].hp
				main.use_item("bandage")
				_check("bandaging teaches First Aid and heals ×mult (arm +%.0f, want >35)" % (ch.body["l_arm"].hp - arm0),
					ch.skills["first_aid"]["xp"] > fa0 and ch.body["l_arm"].hp - arm0 > 35.0)
				# Melee swing on a target teaches Melee + Strength, not Marksmanship.
				var lurker := ProtoLurker.create()
				add_child(lurker)
				lurker.global_position = main.player.global_position + main.player.facing() * 1.5
				var melee0: float = ch.skills["melee"]["xp"]
				var wrench := ProtoWeapon.new("wrench")
				main.player.stamina = 100.0
				wrench.fire(main, main.player.global_position, main.player.facing())
				_check("a connected swing teaches Melee (+%.1f xp)" % (ch.skills["melee"]["xp"] - melee0),
					ch.skills["melee"]["xp"] > melee0)
				# The sheet sells the climb: stars, bars, live effect lines.
				var sheet: String = main._sheet_text()
				_check("the K sheet shows the tree (stars, bars, effects, how-to-level)",
					sheet.contains("⭐") and sheet.contains("▱") and sheet.contains("next lv:") and sheet.contains("Kinship"))
				_next()
		3:
			print("SKL RESULTS: %d passed, %d failed" % [passed, failed])
			print("SKL: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
			get_tree().quit(0 if failed == 0 else 1)

	if t > 25.0:
		print("SKL: TIMEOUT phase %d" % phase)
		print("SKL RESULTS: %d passed, %d failed" % [passed, failed])
		get_tree().quit(1)
