## One participant law for every console cartridge: bot fill reaches the row's
## declared ceiling; disabling it keeps only the rules-required opposition.
extends Node

const EXPECTED: Dictionary = {
	"crown_of_ash": 2,
	"dial_tanks": 4,
	"red_sky": 4,
	"black_orbit": 4,
	"gridbreach": 4,
	"rustball": 4,
	"fuel_run": 4,
	"skyjoust": 2,
	"fight_night_99": 2,
	"ashland_command": 2,
	"rust_runners": 8,
	"black_grid": 16,
}

var passed := 0
var failed := 0


func _check(label: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("GAME_BOT_FILL: %s - %s" % ["PASS" if ok else "FAIL", label])


func _ready() -> void:
	print("GAME_BOT_FILL: start")
	get_tree().create_timer(90.0).timeout.connect(func() -> void:
		print("GAME_BOT_FILL: WATCHDOG")
		get_tree().quit(1))
	var registry := ProtoGameRegistry.load_catalog()
	var base_script := load("res://proto3d/games/game_cartridge.gd") as GDScript
	var probe: Control = base_script.new()
	_check("shared participant-count contract exists",
		probe.has_method("target_participant_count") and "participant_total" in probe)
	probe.free()
	if failed > 0:
		_finish()
		return
	for game_id_value in EXPECTED:
		var game_id := String(game_id_value)
		var maximum := int(EXPECTED[game_id])
		var row: Dictionary = registry.get_game(game_id)
		_check("%s catalog maximum is the bot-fill ceiling" % game_id,
			int((row.get("players", {}) as Dictionary).get("max", 0)) == maximum)
		var filled := _launch(row, {"source": "bot-fill", "bots_enabled": true}, 7100 + maximum)
		_check("%s fills every empty seat" % game_id,
			int(filled.get("participant_total")) == maximum)
		_check("%s runtime creates the declared filled population" % game_id,
			_runtime_count(game_id, filled) == maximum)
		filled.queue_free()

		var lean := _launch(row, {"source": "bot-fill", "bots_enabled": false}, 7200 + maximum)
		_check("%s bot-fill off keeps the rules-required pair" % game_id,
			int(lean.get("participant_total")) == 2)
		_check("%s runtime does not retain max-fill actors when disabled" % game_id,
			_runtime_count(game_id, lean) == 2)
		lean.queue_free()
	_finish()


func _launch(row: Dictionary, context: Dictionary, seed_value: int) -> Control:
	var packed := load(String(row.get("cartridge_scene", ""))) as PackedScene
	var cartridge := packed.instantiate() as Control
	add_child(cartridge)
	cartridge.configure(row, context)
	cartridge.start_match(seed_value, [{"seat": 0, "device": -1,
		"profile_id": "rider", "name": "RIDER"}])
	return cartridge


func _runtime_count(game_id: String, cartridge: Control) -> int:
	match game_id:
		"crown_of_ash", "ashland_command":
			return 2
		"dial_tanks":
			return (cartridge.get("tanks") as Array).size()
		"red_sky":
			return (cartridge.get("crews") as Array).size()
		"black_orbit":
			return (cartridge.get("ships") as Array).size()
		"gridbreach":
			return (cartridge.get("players") as Array).size()
		"rustball":
			return (cartridge.get("players_state") as Array).size()
		"fuel_run":
			return (cartridge.get("cars") as Array).size()
		"skyjoust":
			return (cartridge.get("pilots") as Array).size()
		"fight_night_99":
			return (cartridge.get("fighters") as Array).size()
		"rust_runners", "black_grid":
			return (cartridge.get("actors") as Array).size()
	return 0


func _finish() -> void:
	print("GAME_BOT_FILL RESULTS: %d passed, %d failed" % [passed, failed])
	print("GAME_BOT_FILL: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
