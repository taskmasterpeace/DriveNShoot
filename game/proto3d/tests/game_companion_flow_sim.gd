## Full standalone journey proof: branded boot, box-before-boot selection,
## contact-gated launch, all twenty-two real cartridges, stock AI fill,
## restart/eject/quit, isolated persistence, and zero reachable multiplayer UI.
## Run: Godot --headless --path game res://proto3d/tests/game_companion_flow_sim.tscn
extends Node

const APP_SCRIPT := "res://proto3d/games/companion/game_deck_companion.gd"
const APP_SCENE := "res://proto3d/games/companion/game_deck_companion.tscn"
const SAVE_PATH := "user://test_game_deck_companion_flow.json"
const SKIP_SAVE_PATH := "user://test_game_deck_companion_skip.json"
const DRIVN_FIXTURE := "user://test_drivn_companion_flow_fixture.save"

var passed := 0
var failed := 0


func _check(label: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("GAME_COMPANION_FLOW: %s - %s" % ["PASS" if ok else "FAIL", label])


func _ready() -> void:
	print("GAME_COMPANION_FLOW: start")
	get_tree().create_timer(180.0).timeout.connect(func() -> void:
		print("GAME_COMPANION_FLOW: WATCHDOG")
		get_tree().quit(1))
	_cleanup()
	_write_text(DRIVN_FIXTURE, "DRIVN-MAIN-SAVE-MUST-NOT-CHANGE\nfixture=road-world")
	var drivn_before := FileAccess.get_file_as_bytes(DRIVN_FIXTURE)
	_check("standalone companion root script and scene exist",
		FileAccess.file_exists(APP_SCRIPT) and FileAccess.file_exists(APP_SCENE))
	if not FileAccess.file_exists(APP_SCRIPT) or not FileAccess.file_exists(APP_SCENE):
		_finish()
		return
	var app_script := load(APP_SCRIPT) as GDScript
	var app: Control = app_script.create(SAVE_PATH)
	add_child(app)
	app.set_process(false)
	var deck: Node = app.get("deck") as Node
	deck.set_process(false)
	await get_tree().process_frame
	var boot: Dictionary = app.call("snapshot_ui")
	_check("branded app begins on an exclusive BOOT surface",
		String(boot.get("state", "")) == "BOOT" and bool(boot.get("boot_visible", false))
		and not bool(boot.get("shelf_visible", true))
		and String(boot.get("product_title", "")) == "DRIVN: GAME DECK")
	app.call("_advance_boot", 0.5)
	_check("boot remains skippable before its 2.2-second deadline",
		String((app.call("snapshot_ui") as Dictionary).get("state", "")) == "BOOT")
	app.call("skip_boot")
	_check("skip opens the real shelf immediately",
		String((app.call("snapshot_ui") as Dictionary).get("state", "")) == "SHELF")

	var skip_probe: Control = app_script.create(SKIP_SAVE_PATH)
	add_child(skip_probe)
	skip_probe.set_process(false)
	(skip_probe.get("deck") as Node).set_process(false)
	skip_probe.call("_advance_boot", 2.19)
	var before_deadline := String((skip_probe.call("snapshot_ui") as Dictionary).get("state", ""))
	skip_probe.call("_advance_boot", 0.02)
	_check("unskipped boot resolves at the exact 2.2-second branded deadline",
		before_deadline == "BOOT"
		and String((skip_probe.call("snapshot_ui") as Dictionary).get("state", "")) == "SHELF")
	skip_probe.queue_free()

	_check("companion ledger transiently unlocks all twenty-two installed cartridges",
		(deck.ledger.unlocked as Array).size() == 22
		and deck.registry.order.all(func(id: Variant) -> bool:
			return bool(deck.ledger.is_unlocked(String(id)))))
	var shelf: Control = app.get("shelf") as Control
	var inspector: Control = app.get("inspector") as Control
	var transition: Control = app.get("transition") as Control
	var shell: CanvasLayer = app.get("shell") as CanvasLayer
	var cards: Dictionary = shelf.get("cards") as Dictionary
	(cards["waste_heap"] as Button).pressed.emit()
	_check("selecting box art opens inspection without launching",
		String((app.call("snapshot_ui") as Dictionary).get("state", "")) == "INSPECT"
		and deck.cartridge == null
		and String((inspector.call("snapshot_ui") as Dictionary).get("game_id", "")) == "waste_heap")
	(inspector.get("insert_button") as Button).pressed.emit()
	_check("INSERT begins the physical ritual but cannot launch before contact",
		String((app.call("snapshot_ui") as Dictionary).get("state", "")) == "INSERT"
		and deck.cartridge == null)
	transition.call("_advance", 0.61)
	_check("the cartridge remains absent through the pre-contact slot beat", deck.cartridge == null)
	transition.call("_advance", 0.02)
	_check("electrical contact launches WASTE HEAP through the canonical deck",
		deck.cartridge != null and String(deck.current_row.get("id", "")) == "waste_heap"
		and deck.state == "PLAYING")
	transition.call("_advance", 0.53)
	var handheld_context: Dictionary = deck.current_context
	_check("handheld context is exactly one local human with no bot or network path",
		String((app.call("snapshot_ui") as Dictionary).get("state", "")) == "PLAY"
		and (deck.active_seats as Array).size() == 1
		and not bool(handheld_context.get("bots_enabled", true))
		and int(handheld_context.get("actor_count", 0)) == 1
		and not bool(handheld_context.get("online", true))
		and not bool(handheld_context.get("spectator", true)))
	_check("standalone shell and canonical deck render the exact same live texture",
		shell.call("screen_texture") == deck.texture())
	var first_seed := int(app.get("current_seed"))
	(shell.get("_restart_button") as Button).pressed.emit()
	_check("RESTART replaces the match with a fresh stock seed",
		int(app.get("current_seed")) != first_seed and deck.cartridge != null
		and deck.state == "PLAYING" and String(deck.current_row.get("id", "")) == "waste_heap")
	(shell.get("_power_button") as Button).pressed.emit()
	_check("CHANGE CARTRIDGE stops, saves, and enters reverse eject",
		String((app.call("snapshot_ui") as Dictionary).get("state", "")) == "EJECT"
		and deck.cartridge == null and deck.state == "OFF" and FileAccess.file_exists(SAVE_PATH))
	transition.call("_advance", 0.56)
	await get_tree().process_frame
	_check("eject restores shelf focus to the same physical box",
		String((app.call("snapshot_ui") as Dictionary).get("state", "")) == "SHELF"
		and String((shelf.call("snapshot_ui") as Dictionary).get("focused_game_id", "")) == "waste_heap")

	var launched_ids: Array[String] = []
	var exact_contexts := true
	var exact_runtime_population := true
	for id_value in deck.registry.order:
		var game_id := String(id_value)
		var row: Dictionary = deck.registry.get_game(game_id)
		app.call("inspect_game", game_id)
		(inspector.get("insert_button") as Button).pressed.emit()
		transition.call("_advance", 0.63)
		transition.call("_advance", 0.53)
		if deck.cartridge != null and String(deck.current_row.get("id", "")) == game_id \
				and deck.state == "PLAYING" and shell.call("screen_texture") == deck.texture():
			launched_ids.append(game_id)
		var players: Dictionary = row.get("players", {}) as Dictionary
		var context: Dictionary = deck.current_context
		var expected_actors := int(players.get("max", 1)) \
			if String(row.get("platform", "")) == "console" else 1
		exact_contexts = exact_contexts \
			and (deck.active_seats as Array).size() == 1 \
			and int(context.get("actor_count", 0)) == expected_actors \
			and bool(context.get("bots_enabled", false)) == (String(row.get("platform", "")) == "console") \
			and not bool(context.get("online", true)) \
			and not bool(context.get("spectator", true))
		exact_runtime_population = exact_runtime_population \
			and int(deck.cartridge.get("participant_total")) == expected_actors
		app.call("change_cartridge")
		transition.call("_advance", 0.56)
	_check("all twenty-two canonical cartridges launch through inspect/contact/play",
		launched_ids == deck.registry.order)
	_check("every handheld stays solo and every console fills to declared stock AI maximum",
		exact_contexts and exact_runtime_population)

	app.call("open_shelf")
	(shelf.get("promo_card") as Button).pressed.emit()
	_check("DRIVN promotion is a distinct non-launching application state",
		String((app.call("snapshot_ui") as Dictionary).get("state", "")) == "PROMO"
		and deck.cartridge == null and not (inspector.get("insert_button") as Button).visible)
	(inspector.get("back_button") as Button).pressed.emit()
	var shell_state: Dictionary = shell.call("companion_snapshot")
	var visible_tabs: Array = shell_state.get("visible_tabs", []) as Array
	var reachable_text := String(shell_state.get("reachable_text", "")).to_upper()
	var forbidden := ["HOST", "JOIN", "INVITATION", "SPECTATOR", "SECOND SEAT", "PWR", "NET "]
	_check("companion shell exposes only play/help/controls/about/scores",
		visible_tabs == ["play", "help", "controls", "about", "scores"]
		and bool(shell_state.get("companion_mode", false))
		and not bool(shell_state.get("lobby_attached", true)))
	_check("no multiplayer, second-seat, power, or network action/copy is reachable",
		forbidden.all(func(token: String) -> bool: return not reachable_text.contains(token))
		and reachable_text.contains("CHANGE CARTRIDGE") and reachable_text.contains("RESTART")
		and reachable_text.contains("A DRIVN COMPANION"))

	app.call("inspect_game", "last_mile")
	(inspector.get("insert_button") as Button).pressed.emit()
	transition.call("_advance", 0.63)
	transition.call("_advance", 0.53)
	app.call("request_quit", false)
	_check("quit from play uses the same stop/save/eject path",
		String((app.call("snapshot_ui") as Dictionary).get("state", "")) == "EJECT"
		and deck.cartridge == null and FileAccess.file_exists(SAVE_PATH))
	transition.call("_advance", 0.56)
	_check("orderly quit reaches terminal QUIT only after eject finishes",
		String((app.call("snapshot_ui") as Dictionary).get("state", "")) == "QUIT")
	var companion_envelope := JSON.parse_string(FileAccess.get_file_as_string(SAVE_PATH)) as Dictionary
	_check("companion persistence is a dedicated valid envelope",
		int(companion_envelope.get("schema", 0)) == 1
		and companion_envelope.get("ledger", null) is Dictionary
		and companion_envelope.get("ui", null) is Dictionary
		and String(app.get("save_store").get("path")) == SAVE_PATH)
	_check("the DRIVN main-save fixture remains byte-for-byte untouched",
		FileAccess.get_file_as_bytes(DRIVN_FIXTURE) == drivn_before)
	_cleanup()
	_finish()


func _write_text(path: String, text: String) -> void:
	var file := FileAccess.open(path, FileAccess.WRITE)
	file.store_string(text)
	file.close()


func _cleanup() -> void:
	for path in [SAVE_PATH, SAVE_PATH + ".tmp", SKIP_SAVE_PATH, SKIP_SAVE_PATH + ".tmp",
			DRIVN_FIXTURE]:
		if FileAccess.file_exists(path):
			DirAccess.remove_absolute(ProjectSettings.globalize_path(path))


func _finish() -> void:
	get_tree().auto_accept_quit = true
	print("GAME_COMPANION_FLOW RESULTS: %d passed, %d failed" % [passed, failed])
	print("GAME_COMPANION_FLOW: %s" % (
		"ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
