## Rolling Black Box and three-lane Mirror Run must share exact command frames.
## Run: Godot --headless --path game res://proto3d/tests/lab_replay_sim.tscn
extends Node

const REPLAY_PATH := "res://proto3d/tools/physics_lab/lab_replay.gd"
const COMMAND_PATH := "res://proto3d/tools/physics_lab/lab_command.gd"
const LAB_PATH := "res://proto3d/tools/physics_combat_lab.tscn"

class Receiver extends RefCounted:
	var frames: Array[Dictionary] = []
	func apply_command(command: RefCounted, _delta: float) -> void:
		frames.append(command.as_dictionary())

var passed: int = 0
var failed: int = 0


func _check(label: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("LAB_REPLAY: %s - %s" % ["PASS" if ok else "FAIL", label])


func _ready() -> void:
	print("LAB_REPLAY: start")
	get_tree().create_timer(55.0).timeout.connect(func() -> void:
		print("LAB_REPLAY: WATCHDOG")
		get_tree().quit(1))
	if not ResourceLoader.exists(REPLAY_PATH):
		_check("the bounded lab replay component exists", false)
		_finish()
		return
	var replay: RefCounted = load(REPLAY_PATH).new()
	var command_script: Script = load(COMMAND_PATH)
	for i in 1800:
		var command: RefCounted = command_script.new()
		command.set("stamp", i + 1)
		command.set("move", Vector3(float(i % 3) - 1.0, 0, -1).limit_length(1.0))
		command.set("aim_world", Vector3.FORWARD.rotated(Vector3.UP, float(i) * 0.001))
		command.set("sprint", i % 2 == 0)
		replay.record_command(command)
		replay.record_snapshot({"mode": "hybrid",
			"transform": Transform3D(Basis.IDENTITY, Vector3(float(i), 0, 0)),
			"velocity": Vector3(float(i % 7), 0, 0), "weapon": "pistol",
			"ammo": 12 - (i % 12), "condition": "fresh",
			"round": {"phase": "active"}, "opponent": {"behavior": "passive"},
			"rng_seed": 42})
		if i in [300, 900]:
			replay.mark("fire", "SHOT %d" % i)
		if i == 1200:
			replay.mark("contact", "DIVE CONTACT")
	_check("thirty seconds retains only the newest twenty seconds",
		replay.frame_count() == 1200 and replay.first_stamp() == 601
		and replay.last_stamp() == 1800)
	_check("eviction also bounds snapshots and stale timeline markers",
		replay.snapshot_count() == 1200 and replay.markers().size() == 2
		and int(replay.markers()[0]["frame"]) >= replay.first_frame())
	replay.freeze()
	var contact_marker: Dictionary = replay.find_marker("contact")
	var contact_snapshot: Dictionary = replay.seek(int(contact_marker["frame"]))
	_check("freeze and marker seek restore the exact recorded snapshot",
		replay.frozen and contact_snapshot["transform"].origin.x == 1200.0)
	var resume_frame: int = int(contact_marker["frame"]) - 120
	var resumed: Dictionary = replay.resume_from(resume_frame)
	_check("resume-from returns command and snapshot two seconds earlier",
		not replay.frozen and int((resumed["command"] as RefCounted).get("stamp")) == 1081
		and (resumed["snapshot"]["transform"] as Transform3D).origin.x == 1080.0)

	var receivers: Array = [Receiver.new(), Receiver.new(), Receiver.new()]
	var mirror_facts: Dictionary = replay.mirror_run(receivers, 1.0 / 60.0)
	var identical: bool = true
	for i in (receivers[0] as Receiver).frames.size():
		identical = identical \
			and (receivers[0] as Receiver).frames[i] == (receivers[1] as Receiver).frames[i] \
			and (receivers[1] as Receiver).frames[i] == (receivers[2] as Receiver).frames[i]
	_check("Mirror Run delivers identical immutable commands to all three modes",
		identical and int(mirror_facts["delivered_per_receiver"]) == 1200)
	var churn: RefCounted = load(REPLAY_PATH).new()
	for cycle in 10:
		for i in 1300:
			var command: RefCounted = command_script.new()
			command.set("stamp", cycle * 1300 + i)
			churn.record_command(command)
			churn.record_snapshot({"cycle": cycle, "frame": i})
		_check("record/clear cycle %d remains bounded" % cycle,
			churn.frame_count() == 1200 and churn.snapshot_count() == 1200)
		churn.clear()
	_check("repeated record/clear releases every retained frame",
		churn.frame_count() == 0 and churn.snapshot_count() == 0 and churn.markers().is_empty())

	var lab: Node3D = (load(LAB_PATH) as PackedScene).instantiate()
	add_child(lab)
	for _i in 6:
		await get_tree().physics_frame
	for i in 150:
		lab.feed_for_test({"keyboard": {"move": Vector2(0, -1), "aim_world": Vector3.FORWARD,
			"sprint": true, "dive": i == 40, "fire": i in [20, 80, 130]}})
		await get_tree().physics_frame
	_check("standalone lab continuously records complete state snapshots",
		lab.replay.frame_count() >= 150 and lab.replay.latest_snapshot().has_all(
			["mode", "body_transforms", "velocities", "weapon", "ammo", "condition",
			"round", "opponent", "rng_seed"]))
	lab.freeze_replay()
	_check("lab freeze surfaces fire and dive/contact timeline markers",
		lab.replay.frozen and lab.replay.find_marker("fire").size() > 0
		and lab.replay.find_marker("dive").size() > 0)
	var rewind_state: Dictionary = lab.replay.snapshot_at(lab.replay.last_frame() - 120)
	var restored: bool = lab.restore_replay_offset(120)
	var restore_error: float = lab.player.global_position.distance_to(
		(rewind_state["body_transforms"]["root"] as Transform3D).origin)
	_check("return-live restore applies the recorded body and weapon state (ok %s, error %.3f, ammo %d/%d)" % [
		str(restored), restore_error, lab.adapter.weapon.mag, int(rewind_state["ammo"])],
		restored and restore_error < 0.01
		and lab.adapter.weapon.mag == int(rewind_state["ammo"]))
	_check("Mirror Run starts three real body lanes from the frozen trace",
		lab.start_mirror_run() and lab.mirror_bodies.size() == 3)
	for _i in 180:
		await get_tree().physics_frame
	var results: Dictionary = lab.mirror_results
	_check("Mirror Run produces per-body metrics without a composite winner",
		results.has_all(["hybrid", "active_ragdoll", "full_physics"])
		and not results.has("winner") and not results.has("score"))
	lab.clear_mirror_run()
	await get_tree().physics_frame
	_check("clearing Mirror Run frees every temporary comparison body",
		get_tree().get_nodes_in_group("lab_mirror_body").is_empty())
	lab.queue_free()
	_finish()


func _finish() -> void:
	print("LAB_REPLAY RESULTS: %d passed, %d failed" % [passed, failed])
	print("LAB_REPLAY: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
