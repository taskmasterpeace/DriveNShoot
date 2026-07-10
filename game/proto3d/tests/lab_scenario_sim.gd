## Deterministic scenario cards and bounded transport/load chaos.
## Run: Godot --headless --path game res://proto3d/tests/lab_scenario_sim.tscn
extends Node

const SCENARIO_PATH := "res://proto3d/tools/physics_lab/lab_scenario.gd"
const CHAOS_PATH := "res://proto3d/tools/physics_lab/lab_chaos.gd"
const COMMAND_PATH := "res://proto3d/tools/physics_lab/lab_command.gd"
const LAB_PATH := "res://proto3d/tools/physics_combat_lab.tscn"
const IDS: Array[String] = ["pistol_duel", "smg_suppression", "martial_arts_bout",
	"cover_two", "low_light_hunt", "vehicle_gunner_pass", "armored_penetration",
	"tournament_final"]

var passed: int = 0
var failed: int = 0


func _check(label: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("LAB_SCENARIO: %s - %s" % ["PASS" if ok else "FAIL", label])


func _ready() -> void:
	print("LAB_SCENARIO: start")
	get_tree().create_timer(45.0).timeout.connect(func() -> void:
		print("LAB_SCENARIO: WATCHDOG")
		get_tree().quit(1))
	if not ResourceLoader.exists(SCENARIO_PATH) or not ResourceLoader.exists(CHAOS_PATH):
		_check("scenario and chaos tools exist", false)
		_finish()
		return
	var scenario: RefCounted = load(SCENARIO_PATH).new()
	_check("scenario deck exposes all eight approved cards in order", scenario.ids() == IDS)
	var deterministic: bool = true
	for id in IDS:
		var first: Dictionary = scenario.start(id, 8675309)
		var second: Dictionary = scenario.start(id, 8675309)
		deterministic = deterministic and first == second \
			and first.has_all(["seed", "body_modes", "spawn_transforms", "loadouts",
				"opponents", "surface", "weather", "camera_preset", "win_condition",
				"opening_events"])
	_check("same card and seed reproduce bodies, positions, loadouts, AI, weather, and events",
		deterministic)

	var chaos: RefCounted = load(CHAOS_PATH).new()
	var command_script: Script = load(COMMAND_PATH)
	chaos.configure_transport("local", 101)
	for i in 120:
		var command: RefCounted = command_script.new()
		command.set("stamp", i + 1)
		chaos.enqueue(command, float(i) * 16.667)
	var local_delivered: Array = chaos.pump(3000.0)
	var local_facts: Dictionary = chaos.transport_facts()
	_check("local transport delivers every command without delay or drops",
		local_delivered.size() == 120 and int(local_facts["dropped"]) == 0
		and float(local_facts["max_delay_ms"]) <= 1.0)
	chaos.configure_transport("bad_wifi", 101)
	for i in 240:
		var command: RefCounted = command_script.new()
		command.set("stamp", i + 1)
		chaos.enqueue(command, float(i) * 50.0)
	var wifi_delivered: Array = chaos.pump(15000.0)
	var wifi_facts: Dictionary = chaos.transport_facts()
	_check("bad Wi-Fi applies bounded latency/jitter/loss and reports it",
		wifi_delivered.size() > 0 and int(wifi_facts["dropped"]) > 0
		and float(wifi_facts["max_delay_ms"]) <= 210.0
		and String(wifi_facts["preset"]) == "bad_wifi")

	var load_counts: Dictionary = chaos.set_load(self, 0.1)
	_check("load slider spawns known counts for all six stress categories",
		load_counts.has_all(["spectators", "fighters", "rigid_props", "flashes", "marks", "cars"])
		and int(load_counts["spectators"]) == 12 and int(load_counts["cars"]) == 2)
	var budget: Dictionary = chaos.performance_facts()
	_check("chaos reports the first exceeded budget and never auto-degrades",
		budget.has_all(["render_ms", "script_ms", "physics_ms", "first_exceeded",
			"auto_degraded"]) and not bool(budget["auto_degraded"]))
	chaos.clear_load()
	await get_tree().process_frame
	_check("clearing chaos frees every temporary load node",
		get_tree().get_nodes_in_group("lab_chaos_load").is_empty())

	var save_existed: bool = FileAccess.file_exists("user://drivn.save")
	var save_stamp: int = FileAccess.get_modified_time("user://drivn.save") if save_existed else -1
	var lab: Node3D = (load(LAB_PATH) as PackedScene).instantiate()
	add_child(lab)
	for _i in 6:
		await get_tree().physics_frame
	var one: Dictionary = lab.start_scenario("low_light_hunt", 44)
	var first_opening: Dictionary = lab.scenario_state()
	var two: Dictionary = lab.start_scenario("low_light_hunt", 44)
	var second_opening: Dictionary = lab.scenario_state()
	_check("standalone card applies the same opening state twice",
		one == two and first_opening == second_opening
		and lab.current_scenario == "low_light_hunt")
	lab.queue_free()
	await get_tree().process_frame
	var save_untouched: bool = FileAccess.file_exists("user://drivn.save") == save_existed
	if save_existed:
		save_untouched = save_untouched and FileAccess.get_modified_time("user://drivn.save") == save_stamp
	_check("scenario and chaos tools never touch the campaign save", save_untouched)
	_finish()


func _finish() -> void:
	print("LAB_SCENARIO RESULTS: %d passed, %d failed" % [passed, failed])
	print("LAB_SCENARIO: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
