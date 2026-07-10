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
	_check("chaos separates truthful CPU/physics/render-proxy facts and never auto-degrades",
		budget.has_all(["frame_cpu_ms", "script_estimate_ms", "physics_ms",
			"render_draw_calls", "render_objects", "first_exceeded", "auto_degraded"])
		and String(budget.get("render_metric", "")) == "draw_calls"
		and not bool(budget["auto_degraded"]))
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
	lab.chaos.configure_transport("bad_wifi", 9)
	lab.chaos.set_load(lab, 0.25)
	await get_tree().physics_frame
	var visible_chaos: String = lab.hud.tools_text() if lab.hud.has_method("tools_text") else ""
	_check("standalone telemetry shows latency, jitter, loss, queue/drop and measured costs",
		visible_chaos.contains("120ms") and visible_chaos.contains("JIT 45")
		and visible_chaos.contains("LOSS 8%") and visible_chaos.contains("DROP")
		and visible_chaos.contains("CPU") and visible_chaos.contains("PHYS")
		and visible_chaos.contains("DRAW"))
	lab.chaos.clear_load()
	var one: Dictionary = lab.start_scenario("low_light_hunt", 44)
	var first_opening: Dictionary = lab.scenario_state()
	var two: Dictionary = lab.start_scenario("low_light_hunt", 44)
	var second_opening: Dictionary = lab.scenario_state()
	_check("standalone card applies the same opening state twice",
		one == two and first_opening == second_opening
		and lab.current_scenario == "low_light_hunt")
	lab.start_scenario("armored_penetration", 77)
	await get_tree().physics_frame
	_check("zero-opponent card removes the persistent sparring actor from play",
		int(lab.scenario_state()["opponent_count"]) == 0
		and not bool(lab.opponent.enabled)
		and lab.opponent.body.collision_layer == 0)
	_check("armored card stages one real armored vehicle and its authored objective",
		lab.scenario_vehicles.size() == 1
		and lab.scenario_vehicles[0] is ProtoCar3D
		and bool(lab.scenario_vehicles[0].get_meta("lab_armored", false))
		and String(lab.scenario_state()["win_condition"]["type"]) == "penetrations")
	lab.start_scenario("vehicle_gunner_pass", 88)
	var authored_player_spawn: Vector3 = lab.scenario_state()["position"]
	lab.adapter.reset_at(Transform3D(Basis.IDENTITY, Vector3(3, 0.05, 3)))
	lab.reset_fighters()
	_check("round reset restores the current card's authored player and vehicle opening",
		lab.adapter.anchor_transform().origin.distance_to(authored_player_spawn) < 0.01
		and lab.scenario_vehicles.size() == 1
		and String(lab.scenario_vehicles[0].get_meta("lab_vehicle_id", "")) == "pickup"
		and String(lab.scenario_state()["win_condition"]["type"]) == "survive_pass")
	lab.start_scenario("cover_two", 55)
	await get_tree().physics_frame
	_check("two-in-cover card spawns both real nonlethal AI opponents",
		lab.scenario_opponents.size() == 1 and int(lab.scenario_state()["opponent_count"]) == 2)
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
