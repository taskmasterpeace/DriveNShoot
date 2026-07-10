## Standalone lab boot contract: isolated from campaign/menu/save, real F1 body,
## five stations, shared command motion, readable controls, and exact reset.
## Run: Godot --headless --path game res://proto3d/tests/physics_lab_sim.tscn
extends Node

const LAB_PATH := "res://proto3d/tools/physics_combat_lab.tscn"
const SAVE_PATH := "user://drivn.save"

var passed: int = 0
var failed: int = 0
var prior_scale: float = 1.0


func _check(label: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("PHYSICS_LAB: %s - %s" % ["PASS" if ok else "FAIL", label])


func _ready() -> void:
	print("PHYSICS_LAB: start")
	prior_scale = Engine.time_scale
	get_tree().create_timer(180.0, true, false, true).timeout.connect(func() -> void:
		Engine.time_scale = prior_scale
		print("PHYSICS_LAB: WATCHDOG")
		get_tree().quit(1))
	if not ResourceLoader.exists(LAB_PATH):
		_check("the standalone Physics Combat Lab scene exists", false)
		_finish()
		return
	var launcher_path: String = ProjectSettings.globalize_path("res://../PHYSICS_LAB.bat")
	_check("the standalone double-click launcher exists", FileAccess.file_exists(launcher_path))

	var save_stamp_before: int = FileAccess.get_modified_time(SAVE_PATH) \
		if FileAccess.file_exists(SAVE_PATH) else 0
	Engine.time_scale = 0.83
	var lab: Node3D = (load(LAB_PATH) as PackedScene).instantiate()
	add_child(lab)
	for _i in 6:
		await get_tree().physics_frame
	_check("the lab boots without a campaign menu",
		lab.find_children("*", "ProtoMenu", true, false).is_empty())
	_check("F1 controlled hybrid is the active body", String(lab.active_mode) == "hybrid")
	_check("the lab is explicitly save isolated", lab.get("save_isolated") == true)
	var station_names: Array = lab.stations.keys()
	_check("five named test stations are constructed", station_names.size() == 5
		and station_names.has("BODY LANE") and station_names.has("GRIP & GAZE RANGE")
		and station_names.has("DIVE & THROW LANE") and station_names.has("KILLHOUSE")
		and station_names.has("VEHICLE DAMAGE BAY"))
	_check("HUD surfaces controls and mode keys",
		String(lab.hud.controls_text).contains("WASD")
		and String(lab.hud.controls_text).contains("F1"))

	var start: Vector3 = lab.player.global_position
	lab.feed_for_test({"keyboard": {"move": Vector2(0, -1),
		"aim_world": Vector3.FORWARD, "sprint": false}})
	for _i in 75:
		await get_tree().physics_frame
	lab.feed_for_test({"keyboard": {"move": Vector2.ZERO,
		"aim_world": Vector3.FORWARD}})
	_check("a fed shared command moves the real F1 player",
		lab.player.global_position.distance_to(start) > 1.0)

	# Full L1 real-path walk: movement, dive, fire, throw, radial, duel, bodies,
	# diagnostics, replay, comparison tools, scenario, and verdict export.
	lab.reset_station()
	lab.set_opponent_behavior("passive")
	lab.feed_for_test({"keyboard": {"move": Vector2(1, 0),
		"aim_world": Vector3.FORWARD, "sprint": true}})
	for _i in 70:
		await get_tree().physics_frame
	_check("F1 sprint drives the real low-ready run path",
		float(lab.adapter.metrics().get("speed", 0.0)) > 4.5
		and float(lab.adapter.metrics().get("sprint_blend", 0.0)) > 0.5)
	lab.feed_for_test({"keyboard": {"move": Vector2(1, 0),
		"aim_world": Vector3.FORWARD, "dive": true}})
	await get_tree().physics_frame
	lab.feed_for_test({"keyboard": {"move": Vector2.ZERO,
		"aim_world": Vector3.FORWARD, "dive": false}})
	for _i in 55:
		await get_tree().physics_frame
	_check("directional dive is recorded by the Black Box",
		lab.replay.find_marker("dive").size() > 0)
	var pistol_before: int = lab.adapter.weapon.mag
	lab.feed_for_test({"keyboard": {"aim_world": Vector3.FORWARD, "fire": true}})
	await get_tree().physics_frame
	lab.feed_for_test({"keyboard": {"aim_world": Vector3.FORWARD, "fire": false}})
	for _i in 4:
		await get_tree().physics_frame
	_check("pistol fire consumes ammo and leaves a fire marker",
		lab.adapter.weapon.mag == pistol_before - 1 and lab.replay.find_marker("fire").size() > 0)
	var throwables_before: int = get_tree().get_nodes_in_group("throwable_projectile").size()
	lab.feed_for_test({"keyboard": {"aim_world": Vector3.FORWARD, "throw": true}})
	for _i in 35:
		await get_tree().physics_frame
	lab.feed_for_test({"keyboard": {"aim_world": Vector3.FORWARD, "throw": false}})
	await get_tree().physics_frame
	_check("charged throw launches a real lab projectile",
		get_tree().get_nodes_in_group("throwable_projectile").size() > throwables_before)

	# Hold radial and aim east: with fists at center, the east sector is Scrap SMG.
	lab.feed_for_test({"keyboard": {"aim_world": Vector3.RIGHT, "radial": true}})
	for _i in 24:
		await get_tree().physics_frame
	lab.feed_for_test({"keyboard": {"aim_world": Vector3.RIGHT, "radial": false}})
	for _i in 3:
		await get_tree().physics_frame
	_check("held radial equips the Scrap SMG and restores prior time scale",
		String(lab.adapter.weapon.id) == "scrap_smg" and absf(Engine.time_scale - 0.83) < 0.001)

	lab.lab_round.reset_match()
	lab.reset_fighters()
	lab.set_opponent_behavior("duel")
	for _i in 720:
		lab.feed_for_test({"keyboard": {"aim_world": Vector3.FORWARD, "fire": true}})
		await get_tree().physics_frame
		if String(lab.lab_round.winner) != "":
			break
	_check("repeatable nonlethal duel reaches a winner without a corpse",
		String(lab.lab_round.winner) != ""
		and get_tree().get_nodes_in_group("corpse").is_empty())

	lab.switch_mode("active_ragdoll")
	await get_tree().physics_frame
	var active_joints: int = int(lab.adapter.metrics().get("joint_count", 0))
	lab.lab_round.reset_match()
	lab.adapter.reset_at(lab.station_spawn)
	lab.opponent.reset_at(Transform3D(Basis.IDENTITY, Vector3(0, 0.05, -1.25)))
	lab.adapter.set_weapon("fists")
	lab.feed_for_test({"keyboard": {"aim_world": Vector3.FORWARD, "fire": false}})
	await get_tree().physics_frame
	lab.feed_for_test({"keyboard": {"aim_world": Vector3.FORWARD, "fire": true}})
	await get_tree().physics_frame
	lab.feed_for_test({"keyboard": {"aim_world": Vector3.FORWARD, "fire": false}})
	await get_tree().physics_frame
	var physical_melee_damage: float = float(
		lab.lab_round.snapshot()["fighters"]["opponent"]["damage_taken"])
	lab.switch_mode("full_physics")
	await get_tree().physics_frame
	var full_joints: int = int(lab.adapter.metrics().get("joint_count", 0))
	lab.lab_round.reset_match()
	lab.reset_fighters()
	lab.opponent.reset_at(Transform3D(Basis.IDENTITY, Vector3(0, 0.05, -3.0)))
	lab.adapter.set_weapon("pistol")
	lab.shot_spread_deg = 0.0
	for i in 250:
		lab.feed_for_test({"keyboard": {"aim_world": Vector3.FORWARD,
			"fire": i % 25 == 0}})
		await get_tree().physics_frame
	var physical_gun_damage: float = float(
		lab.lab_round.snapshot()["fighters"]["opponent"]["damage_taken"])
	lab.shot_spread_deg = -1.0
	lab.switch_mode("hybrid")
	await get_tree().physics_frame
	_check("F2/F3 bodies support real articulated melee and self-safe gunfire (joints %d/%d, damage %.1f/%.1f)" % [
		active_joints, full_joints, physical_melee_damage, physical_gun_damage],
		active_joints >= 10 and full_joints >= 10
		and physical_melee_damage > 0.0 and physical_gun_damage > 0.0)

	lab.adapter.reset_at(Transform3D(Basis.IDENTITY, lab.gaze_origin))
	lab.feed_for_test({"keyboard": {"aim_world": Vector3.RIGHT}})
	await get_tree().physics_frame
	for _i in 50:
		await get_tree().physics_frame
	lab.toggle_xray()
	lab.diagnostics.update_xray(lab.adapter)
	_check("gaze return and X-ray diagnostics are live",
		String(lab._gaze_source) == "returning"
		and bool(lab.diagnostics.xray_facts()["visible"]))

	lab.freeze_replay()
	var replay_restored: bool = lab.restore_replay_offset(30)
	var mirror_started: bool = lab.start_mirror_run()
	for _i in 5:
		await get_tree().physics_frame
	_check("Black Box restore and Mirror Run spawn from the same trace",
		replay_restored and mirror_started and lab.mirror_bodies.size() == 3)
	lab.clear_mirror_run()
	await get_tree().physics_frame
	lab.replay.unfreeze()
	lab.set_surface("low_friction_debug")
	lab.set_condition_preset("hurt")
	_check("surface carousel and condition dial feed the active body",
		String(lab.adapter.surface["id"]) == "low_friction_debug"
		and String(lab.adapter.condition["id"]) == "hurt")
	var scenario: Dictionary = lab.start_scenario("low_light_hunt", 404)
	_check("scenario card applies low-light hunter state",
		String(scenario.get("id", "")) == "low_light_hunt" and lab.gaze_night
		and lab.gaze_dust and lab.gaze_headlights and lab.opponent_behavior == "HUNTER")
	var verdict_export: Dictionary = lab.save_current_verdict(
		{"feel":8, "control":8, "weight":9, "readability":8, "fun":9},
		"End-to-end integration verdict")
	_check("Verdict Book exports the integrated run", bool(verdict_export.get("ok", false)))
	if bool(verdict_export.get("ok", false)):
		lab.verdict.delete_export(String(verdict_export["id"]))
	lab.chaos.configure_transport("local", 1)
	lab.reset_station()
	lab.switch_mode("hybrid")
	lab.diagnostics.set_xray(false, lab.adapter)
	lab.clear_mirror_run()
	await get_tree().process_frame
	_check("integration reset frees temporary physics/mirror bodies",
		get_tree().get_nodes_in_group("lab_mirror_body").is_empty()
		and get_tree().get_nodes_in_group("lab_physics_part").is_empty())

	lab.player.global_position = Vector3(99, 5, 99)
	lab.character.hp = 17.0
	lab.adapter.weapon.mag = 1
	lab.reset_station()
	_check("reset restores the active scenario opening transform",
		lab.player.global_position.distance_to(lab.scenario_player_spawn.origin) < 0.05)
	_check("reset restores health and ammunition",
		is_equal_approx(lab.character.hp, 100.0)
		and lab.adapter.weapon.mag == int(lab.adapter.weapon.info()["mag_size"]))
	var metrics: Dictionary = lab.adapter.metrics()
	_check("HUD-facing hybrid telemetry is finite",
		bool(metrics.get("finite", false)) and metrics.has("grip_left_cm")
		and metrics.has("speed"))

	var save_stamp_after: int = FileAccess.get_modified_time(SAVE_PATH) \
		if FileAccess.file_exists(SAVE_PATH) else 0
	_check("boot, movement, and reset never touch the campaign save",
		save_stamp_after == save_stamp_before)
	lab.queue_free()
	await get_tree().process_frame
	_check("lab exit restores the exact prior time scale",
		absf(Engine.time_scale - 0.83) < 0.001)
	Engine.time_scale = prior_scale
	_finish()


func _finish() -> void:
	Engine.time_scale = prior_scale
	print("PHYSICS_LAB RESULTS: %d passed, %d failed" % [passed, failed])
	print("PHYSICS_LAB: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
