## Verdict exports keep subjective scores beside objective facts without a fake
## composite winner and never leave user://physics_lab/verdicts/.
## Run: Godot --headless --path game res://proto3d/tests/lab_verdict_sim.tscn
extends Node

const VERDICT_PATH := "res://proto3d/tools/physics_lab/lab_verdict.gd"
const LAB_PATH := "res://proto3d/tools/physics_combat_lab.tscn"

var passed: int = 0
var failed: int = 0


func _check(label: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("LAB_VERDICT: %s - %s" % ["PASS" if ok else "FAIL", label])


func _ready() -> void:
	print("LAB_VERDICT: start")
	get_tree().create_timer(30.0).timeout.connect(func() -> void:
		print("LAB_VERDICT: WATCHDOG")
		get_tree().quit(1))
	if not ResourceLoader.exists(VERDICT_PATH):
		_check("the lab Verdict Book exists", false)
		_finish()
		return
	var verdict: RefCounted = load(VERDICT_PATH).new()
	var save_existed: bool = FileAccess.file_exists("user://drivn.save")
	var save_stamp: int = FileAccess.get_modified_time("user://drivn.save") if save_existed else -1
	var record: Dictionary = {"ratings": {"feel": 8, "control": 9, "weight": 8,
		"readability": 7, "fun": 9}, "note": "Grip reads; full physics recovery is heavy.",
		"mode": "active_ragdoll", "weapon": "scrap_smg", "surface": "wet",
		"camera": "broadcast", "condition": "hurt", "scenario": "pistol_duel",
		"metrics": {"grip_left_cm": 1.7, "speed_error": 0.4, "physics_ms": 2.1},
		"replay_id": "replay_sim_001"}
	var exported: Dictionary = verdict.save(record)
	_check("Verdict Book exports JSON and Markdown only beneath its lab directory",
		bool(exported.get("ok", false))
		and String(exported["json_path"]).begins_with("user://physics_lab/verdicts/")
		and String(exported["markdown_path"]).begins_with("user://physics_lab/verdicts/"))
	var from_json: Dictionary = verdict.load_json(String(exported["json_path"]))
	var from_markdown: Dictionary = verdict.load_markdown(String(exported["markdown_path"]))
	_check("JSON and Markdown round-trip the same objective and subjective record",
		from_json == from_markdown and from_json["ratings"] == record["ratings"]
		and from_json["metrics"] == record["metrics"])
	_check("saved verdict keeps every grouping field and UTC timestamp",
		from_json.has_all(["mode", "weapon", "surface", "camera", "condition",
			"scenario", "timestamp_utc", "replay_id", "note"]))
	_check("out-of-range ratings are rejected",
		not bool(verdict.save({"ratings": {"feel": 11, "control": 5, "weight": 5,
			"readability": 5, "fun": 5}}).get("ok", true)))
	var comparison: String = verdict.comparison_markdown([from_json])
	_check("comparison groups evidence without calculating one winner",
		comparison.contains("active_ragdoll") and comparison.contains("Objective metrics")
		and comparison.contains("Subjective ratings")
		and not comparison.to_lower().contains("overall winner")
		and not comparison.to_lower().contains("composite score"))
	_check("clear-all refuses without explicit confirmation",
		not verdict.clear_all(false) and FileAccess.file_exists(String(exported["json_path"])))
	verdict.delete_export(String(exported["id"]))

	var lab: Node3D = (load(LAB_PATH) as PackedScene).instantiate()
	add_child(lab)
	for _i in 5:
		await get_tree().process_frame
	lab.hud.toggle_verdict()
	_check("standalone HUD exposes a modal five-rating Verdict Book",
		lab.hud.verdict_open() and lab.hud.verdict_fields().size() == 5)
	lab.hud.toggle_verdict()
	lab.queue_free()
	var save_untouched: bool = FileAccess.file_exists("user://drivn.save") == save_existed
	if save_existed:
		save_untouched = save_untouched and FileAccess.get_modified_time("user://drivn.save") == save_stamp
	_check("verdict workflow never touches the campaign save", save_untouched)
	_finish()


func _finish() -> void:
	print("LAB_VERDICT RESULTS: %d passed, %d failed" % [passed, failed])
	print("LAB_VERDICT: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
