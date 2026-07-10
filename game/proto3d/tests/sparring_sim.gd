## Nonlethal lab combat must exercise real weapons and AI without crossing into
## campaign wounds, death, crime, corpses, or save data.
## Run: Godot --headless --path game res://proto3d/tests/sparring_sim.tscn
extends Node

const ROUND_PATH := "res://proto3d/tools/physics_lab/lab_round.gd"
const OPPONENT_PATH := "res://proto3d/tools/physics_lab/lab_opponent.gd"
const LAB_PATH := "res://proto3d/tools/physics_combat_lab.tscn"

var passed: int = 0
var failed: int = 0


func _check(label: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("SPARRING: %s - %s" % ["PASS" if ok else "FAIL", label])


func _ready() -> void:
	print("SPARRING: start")
	get_tree().create_timer(55.0).timeout.connect(func() -> void:
		print("SPARRING: WATCHDOG")
		get_tree().quit(1))
	if not ResourceLoader.exists(ROUND_PATH) or not ResourceLoader.exists(OPPONENT_PATH):
		_check("nonlethal opponent and round scripts exist", false)
		_finish()
		return

	var round: RefCounted = load(ROUND_PATH).new()
	round.setup(["player", "opponent"], 100.0, 2)
	_check("round starts active with isolated fighter health",
		round.phase == "active" and round.health("player") == 100.0
		and round.health("opponent") == 100.0)
	round.hit("opponent", 100.0, {"attacker": "player", "kind": "bullet"})
	_check("health depletion awards a round and freezes commands",
		round.rounds("player") == 1 and round.commands_frozen())
	round.tick(1.21)
	_check("round reset restores both fighters after the authored card delay",
		round.phase == "active" and round.health("player") == 100.0
		and round.health("opponent") == 100.0 and round.reset_count == 1)
	round.knockdown("player", "opponent")
	round.score("player", "clean_combo")
	_check("knockdowns and clean combos use distinct point values",
		round.points("opponent") == 2 and round.points("player") == 1)
	round.ring_out("opponent", "player")
	_check("best-of-three reaches a match winner without a death state",
		round.winner == "player" and round.phase == "match_end"
		and bool(round.snapshot().get("nonlethal", false)))
	round.reset_match()

	var save_existed: bool = FileAccess.file_exists("user://drivn.save")
	var save_stamp: int = FileAccess.get_modified_time("user://drivn.save") if save_existed else -1
	var lab: Node3D = (load(LAB_PATH) as PackedScene).instantiate()
	add_child(lab)
	for _i in 5:
		await get_tree().physics_frame
	var campaign_hp: float = lab.character.hp
	var campaign_body: Dictionary = {}
	for part_id in lab.character.body:
		campaign_body[part_id] = lab.character.body[part_id].hp
	var behavior_key := InputEventKey.new()
	behavior_key.keycode = KEY_F4
	behavior_key.pressed = true
	lab._unhandled_input(behavior_key)
	_check("F4 cycles the surfaced opponent behavior instead of resetting",
		lab.opponent_behavior == "RETURN_FIRE")

	# Keep the duel close and deterministic enough to exercise actual rays.
	lab.reset_station()
	lab.opponent.reset_at(Transform3D(Basis.IDENTITY, Vector3(0, 0.05, -5)))
	lab.set_opponent_behavior("passive")
	for _i in 75:
		await get_tree().physics_frame
	_check("passive behavior never initiates combat",
		int(lab.opponent.metrics().get("shots", -1)) == 0
		and lab.lab_round.health("player") == 100.0)

	lab.set_opponent_behavior("return_fire")
	for _i in 45:
		await get_tree().physics_frame
	var shots_before_hit: int = int(lab.opponent.metrics().get("shots", -1))
	lab.opponent.take_damage(1.0)
	for _i in 150:
		await get_tree().physics_frame
	var player_damage: float = float(lab.lab_round.snapshot()["fighters"]["player"]["damage_taken"])
	_check("return-fire waits for provocation and then attacks",
		shots_before_hit == 0 and int(lab.opponent.metrics().get("shots", 0)) > 0
		and player_damage > 0.0)

	for physical_mode in ["active_ragdoll", "full_physics"]:
		lab.lab_round.reset_match()
		lab.switch_mode(physical_mode)
		lab.reset_fighters()
		lab.set_opponent_behavior("return_fire")
		var physical_shots_before: int = int(lab.opponent.metrics().get("shots", 0))
		lab.opponent.take_damage(1.0)
		for _i in 240:
			await get_tree().physics_frame
		var physical_damage: float = float(
			lab.lab_round.snapshot()["fighters"]["player"]["damage_taken"])
		var physical_label: String = "return-fire damage routes nonlethally through %s limbs (damage %.1f, shots %d)" % [
			physical_mode, physical_damage,
			int(lab.opponent.metrics().get("shots", 0)) - physical_shots_before,
		]
		_check(physical_label,
			physical_damage > 0.0)
	lab.switch_mode("hybrid")

	# Let hunter see the player, then insert a real wall and verify bounded search.
	lab.lab_round.reset_match()
	lab.reset_fighters()
	lab.set_opponent_behavior("hunter")
	for _i in 30:
		await get_tree().physics_frame
	var wall: Node3D = ProtoWorldBuilder.box_body(lab, Vector3(5, 3, 0.5),
		Vector3(0, 1.5, -4), Color("#564b3e"))
	var hunter_shots: int = int(lab.opponent.metrics().get("shots", 0))
	for _i in 90:
		await get_tree().physics_frame
	var hunter_metrics: Dictionary = lab.opponent.metrics()
	_check("hunter searches its last-known position for a bounded window",
		bool(hunter_metrics.get("searching", false))
		and float(hunter_metrics.get("last_seen_age", INF)) <= 4.0)
	_check("opponent respects walls instead of firing through them",
		int(hunter_metrics.get("shots", 0)) == hunter_shots)
	wall.queue_free()
	await get_tree().physics_frame

	# A duel has live damage on both sides and can finish a repeatable match.
	lab.lab_round.reset_match()
	lab.reset_fighters()
	lab.set_opponent_behavior("duel")
	for _i in 720:
		lab.feed_for_test({"keyboard": {"aim_world": Vector3.FORWARD,
			"fire": true if _i % 24 == 0 else false}})
		await get_tree().physics_frame
		if lab.lab_round.winner != "":
			break
	var duel_snapshot: Dictionary = lab.lab_round.snapshot()
	_check("duel mode damages both fighters and reaches a winner (%s; shots %d)" % [
		str(duel_snapshot), int(lab.opponent.metrics().get("shots", 0))],
		float(duel_snapshot["fighters"]["player"]["damage_taken"]) > 0.0
		and float(duel_snapshot["fighters"]["opponent"]["damage_taken"]) > 0.0
		and String(duel_snapshot.get("winner", "")) != "")

	var campaign_unchanged: bool = is_equal_approx(lab.character.hp, campaign_hp)
	for part_id in campaign_body:
		campaign_unchanged = campaign_unchanged and is_equal_approx(
			lab.character.body[part_id].hp, campaign_body[part_id])
	_check("sparring creates no campaign wounds, corpses, crime, or deaths",
		campaign_unchanged and get_tree().get_nodes_in_group("corpse").is_empty()
		and not "deaths" in lab and not "crime" in lab)
	lab.queue_free()
	await get_tree().process_frame
	var save_untouched: bool = FileAccess.file_exists("user://drivn.save") == save_existed
	if save_existed:
		save_untouched = save_untouched and FileAccess.get_modified_time("user://drivn.save") == save_stamp
	_check("sparring never writes the campaign save", save_untouched)
	_finish()


func _finish() -> void:
	print("SPARRING RESULTS: %d passed, %d failed" % [passed, failed])
	print("SPARRING: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
