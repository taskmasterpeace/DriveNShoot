## GOLDEN GOOSE control-law proof. Both flagship shooters expose the exact same
## ordered semantics and the same live keyboard/mouse/controller bindings.
extends Node

const EXPECTED: Array[String] = [
	"move_up", "move_down", "move_left", "move_right",
	"aim_up", "aim_down", "aim_left", "aim_right",
	"primary", "secondary", "mobility", "stance", "reload", "interact",
	"weapon_prev", "weapon_next", "scoreboard", "pause", "help",
]

var passed := 0
var failed := 0


func _check(label: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("SHOOTER_CONTROLS: %s - %s" % ["PASS" if ok else "FAIL", label])


func _ready() -> void:
	print("SHOOTER_CONTROLS: start")
	get_tree().create_timer(30.0).timeout.connect(func() -> void: get_tree().quit(1))
	ProtoInputMap._folded = false
	ProtoInputMap.ensure()
	var router := ProtoArcadeInputRouter.new()
	var registry := ProtoGameRegistry.load_catalog()
	var rust: Dictionary = registry.get_game("rust_runners")
	var grid: Dictionary = registry.get_game("black_grid")
	_check("both flagship rows exist in Phase 2", int(rust.get("phase", 0)) == 2
		and int(grid.get("phase", 0)) == 2)
	_check("both rows name one shared shooter profile",
		String(rust.get("controls_profile", "")) == "shared_shooter"
		and String(grid.get("controls_profile", "")) == "shared_shooter")
	var semantics: Array = router.PROFILES.get("shared_shooter", [])
	_check("shared shooter semantics have the exact approved order", semantics == EXPECTED)
	var rust_help: Array = router.help_labels(String(rust.get("controls_profile", "")))
	var grid_help: Array = router.help_labels(String(grid.get("controls_profile", "")))
	_check("RUST RUNNERS and BLACK GRID display identical live HELP rows",
		JSON.stringify(rust_help) == JSON.stringify(grid_help) and rust_help.size() == EXPECTED.size())
	var bindings := _binding_rows()
	_check("move and independent aim expose WASD/left-stick and mouse/right-stick",
		(bindings["arcade_move_up"]["keys"] as Array).has("key:W")
		and (bindings["arcade_move_up"]["pad"] as Array).has("axis:ly:-")
		and (bindings["arcade_aim_right"]["pad"] as Array).has("axis:rx:+"))
	_check("fire is LMB or right trigger without stealing the mobility face button",
		(bindings["arcade_primary"]["keys"] as Array).has("mouse:left")
		and (bindings["arcade_primary"]["pad"] as Array).has("axis:rt")
		and not (bindings["arcade_primary"]["pad"] as Array).has("joy:a"))
	_check("alternate fire is RMB or G and left trigger",
		(bindings["arcade_secondary"]["keys"] as Array).has("mouse:right")
		and (bindings["arcade_secondary"]["keys"] as Array).has("key:G")
		and (bindings["arcade_secondary"]["pad"] as Array).has("axis:lt"))
	_check("mobility and stance are Space/A and Ctrl/B",
		(bindings["arcade_mobility"]["keys"] as Array).has("key:SPACE")
		and (bindings["arcade_mobility"]["pad"] as Array).has("joy:a")
		and (bindings["arcade_stance"]["keys"] as Array).has("key:CTRL")
		and (bindings["arcade_stance"]["pad"] as Array).has("joy:b"))
	_check("reload/interact are R/X and E/Y",
		(bindings["arcade_reload"]["keys"] as Array).has("key:R")
		and (bindings["arcade_reload"]["pad"] as Array).has("joy:x")
		and (bindings["arcade_interact"]["keys"] as Array).has("key:E")
		and (bindings["arcade_interact"]["pad"] as Array).has("joy:y"))
	_check("weapon cycle, scoreboard, pause, and help keep their approved slots",
		(bindings["arcade_weapon_prev"]["pad"] as Array).has("joy:lb")
		and (bindings["arcade_weapon_next"]["pad"] as Array).has("joy:rb")
		and (bindings["arcade_scoreboard"]["keys"] as Array).has("key:TAB")
		and (bindings["arcade_pause"]["pad"] as Array).has("joy:start")
		and (bindings["arcade_help"]["pad"] as Array).has("joy:back"))
	_finish()


func _binding_rows() -> Dictionary:
	var out := {}
	for value in ProtoInputMap.actions:
		var row: Dictionary = value
		out[String(row.get("id", ""))] = row
	return out


func _finish() -> void:
	print("SHOOTER_CONTROLS RESULTS: %d passed, %d failed" % [passed, failed])
	print("SHOOTER_CONTROLS: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
