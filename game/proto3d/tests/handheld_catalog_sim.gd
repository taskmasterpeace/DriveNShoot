## COMPLETE HANDHELD SHELF proof: every row is a real cartridge behind the same
## lifecycle, deterministic snapshot, semantic input, result, and aspect contract.
## Run: Godot --headless --path game res://proto3d/tests/handheld_catalog_sim.tscn
extends Node

var passed := 0
var failed := 0


func _check(label: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("HANDHELD_CATALOG: %s - %s" % ["PASS" if ok else "FAIL", label])


func _ready() -> void:
	print("HANDHELD_CATALOG: start")
	get_tree().create_timer(90.0).timeout.connect(func() -> void:
		print("HANDHELD_CATALOG: WATCHDOG")
		get_tree().quit(1))
	var registry := ProtoGameRegistry.load_catalog()
	var rows: Array = registry.phase_rows(1).filter(func(row: Dictionary) -> bool:
		return String(row.get("platform", "")) == "handheld")
	_check("catalog still declares exactly ten handheld games", rows.size() == 10)
	var before_scale := Engine.time_scale
	for row_value in rows:
		var row: Dictionary = row_value
		await _prove_row(registry, row)
	_check("the full shelf never changes world time scale", Engine.time_scale == before_scale)
	_finish()


func _prove_row(registry: RefCounted, row: Dictionary) -> void:
	var id := String(row.get("id", ""))
	var scene_path := String(row.get("cartridge_scene", ""))
	if not ResourceLoader.exists(scene_path):
		_check("%s is installed" % id, false)
		return
	var scene := load(scene_path) as PackedScene
	var game: Control = scene.instantiate() as Control
	if game == null:
		_check("%s has a Control cartridge root" % id, false)
		return
	var device: Dictionary = registry.get_device(String(row.get("device_id", "")))
	var resolution: Array = device.get("resolution", [])
	var screen: Array = device.get("screen_size_m", [])
	_check("%s device matches declared aspect" % id, resolution.size() == 2 and screen.size() == 2
		and String(device.get("aspect", "")) == String(row.get("aspect", "")))
	_check("%s implements the shared cartridge contract" % id,
		String(registry.cartridge_contract_error(id)) == "")
	var viewport := SubViewport.new()
	viewport.size = Vector2i(int(resolution[0]), int(resolution[1]))
	viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	add_child(viewport)
	viewport.add_child(game)
	await get_tree().process_frame
	game.configure(row, {"source": "catalog-proof", "challenge_seed": 700 + id.hash()})
	game.start_match(700 + id.hash(), [{"seat": 0, "device": -1, "profile_id": "proof"}])
	_check("%s starts through the shared contract" % id, bool(game.get("active"))
		and int(game.get("seed_value")) == 700 + id.hash())
	var original: Dictionary = game.snapshot()
	game.apply_inputs(1, [_all_actions_snapshot()])
	var after_input: Dictionary = game.snapshot()
	_check("%s accepts semantic input ticks" % id, int(after_input.get("tick", 0)) >= 1)
	game.pause_match(true)
	var paused: Dictionary = game.snapshot()
	game.apply_inputs(2, [_all_actions_snapshot()])
	_check("%s pauses without simulation mutation" % id, game.snapshot() == paused)
	game.pause_match(false)
	game.restore_snapshot(original)
	_check("%s restores its deterministic snapshot" % id,
		JSON.stringify(game.snapshot()) == JSON.stringify(original))
	var emitted := [0]
	game.match_finished.connect(func(_result: Dictionary) -> void: emitted[0] += 1)
	var forced := game.has_method("debug_force_finish") and bool(game.debug_force_finish())
	var result: Dictionary = game.get("last_result")
	_check("%s emits one normalized valid result" % id, forced and int(emitted[0]) == 1
		and String(result.get("game_id", "")) == id
		and String(result.get("ruleset", "")) == String(row.get("ruleset", ""))
		and String(result.get("outcome", "")) == "complete"
		and (result.get("primary", null) is int or result.get("primary", null) is float))
	game.stop_match("catalog_done")
	viewport.remove_child(game)
	game.free()
	viewport.queue_free()


func _all_actions_snapshot() -> Dictionary:
	return {"seat": 0, "device": -1,
		"held": {"move_left": true, "move_right": true, "move_up": true,
			"move_down": true, "primary": true, "secondary": true, "throttle": true,
			"brake": true, "thrust": true, "flipper_left": true, "flipper_right": true},
		"pressed": {"move_left": true, "move_up": true, "primary": true,
			"secondary": true, "interact": true, "jump": true},
		"released": {}, "aim": Vector2.RIGHT, "move": Vector2(-1, -1)}


func _finish() -> void:
	print("HANDHELD_CATALOG RESULTS: %d passed, %d failed" % [passed, failed])
	print("HANDHELD_CATALOG: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
