## GAME DECK catalog contract: the complete 22-row promise is present before
## cartridge multiplication, malformed rows do not enter the registry, and a
## missing future cartridge is merely uninstalled — never a boot failure.
## Run: Godot --headless --path game res://proto3d/tests/game_registry_sim.tscn
extends Node

var passed := 0
var failed := 0


func _check(label: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("GAME_REG: %s - %s" % ["PASS" if ok else "FAIL", label])


func _ready() -> void:
	print("GAME_REG: start")
	get_tree().create_timer(30.0).timeout.connect(func() -> void:
		print("GAME_REG: WATCHDOG")
		get_tree().quit(1))

	var registry_script: GDScript = load("res://proto3d/games/game_registry.gd") as GDScript
	_check("the registry implementation exists", registry_script != null)
	if registry_script == null:
		_finish()
		return

	var reg: RefCounted = registry_script.load_catalog()
	var phase_one: Array = reg.phase_rows(1)
	var handheld: Array = phase_one.filter(func(row: Dictionary) -> bool:
		return String(row.get("platform", "")) == "handheld")
	var console: Array = phase_one.filter(func(row: Dictionary) -> bool:
		return String(row.get("platform", "")) == "console")
	_check("twenty Phase 1 rows", phase_one.size() == 20)
	_check("ten handheld rows", handheld.size() == 10)
	_check("ten console rows", console.size() == 10)
	_check("two Phase 2 rows", reg.phase_rows(2).size() == 2)
	_check("proof rows declared", reg.rows.has("waste_heap") and reg.rows.has("crown_of_ash"))
	_check("both proof cartridges pass scene and notice gates", reg.enabled("waste_heap")
		and reg.enabled("crown_of_ash"))
	_check("new handheld cartridge clears scene and notice gates", reg.installed("radworm")
		and reg.enabled("radworm") and reg.cartridge_contract_error("radworm") == "")
	_check("demining cartridge clears scene and notice gates", reg.installed("dead_ground")
		and reg.enabled("dead_ground") and reg.cartridge_contract_error("dead_ground") == "")
	_check("warehouse cartridge clears scene and notice gates", reg.installed("pack_rat")
		and reg.enabled("pack_rat") and reg.cartridge_contract_error("pack_rat") == "")
	_check("portrait breaker clears scene and notice gates", reg.installed("bunker_breaker")
		and reg.enabled("bunker_breaker") and reg.cartridge_contract_error("bunker_breaker") == "")
	_check("landscape racer clears scene and notice gates", reg.installed("last_mile")
		and reg.enabled("last_mile") and reg.cartridge_contract_error("last_mile") == "")
	_check("missile-defense cartridge clears scene and notice gates", reg.installed("iron_dome")
		and reg.enabled("iron_dome") and reg.cartridge_contract_error("iron_dome") == "")
	_check("missing future scenes are uninstalled, not malformed", not reg.installed("fall_line"))
	_check("catalog validates without row errors", reg.load_warnings.is_empty())
	_finish()


func _finish() -> void:
	print("GAME_REG RESULTS: %d passed, %d failed" % [passed, failed])
	print("GAME_REG: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
