## ONE final catalog proof preserves the exact twenty-game Phase 1 contract and
## iterates all twenty-two owned cartridges through the
## exact shell/deck/input/snapshot/result/stop path used by the world devices.
extends Node

var passed := 0
var failed := 0


func _check(label: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("GAME_CATALOG: %s - %s" % ["PASS" if ok else "FAIL", label])


func _ready() -> void:
	print("GAME_CATALOG: start")
	get_tree().create_timer(180.0).timeout.connect(func() -> void:
		print("GAME_CATALOG: WATCHDOG")
		get_tree().quit(1))
	var deck := ProtoGameDeck.create(self)
	add_child(deck)
	deck.set_process(false)
	var shell := ProtoGameShell.create(deck)
	add_child(shell)
	var phase_one: Array = deck.registry.phase_rows(1)
	var phase_two: Array = deck.registry.phase_rows(2)
	var rows: Array = phase_one + phase_two
	_check("the complete Phase 1 catalog still contains exactly twenty rows",
		phase_one.size() == 20)
	_check("the complete installed catalog contains two flagships and twenty-two games",
		phase_two.size() == 2 and rows.size() == 22
		and phase_two.all(func(row: Dictionary) -> bool:
			return deck.registry.installed(String(row.get("id", "")))))
	for row_value in rows:
		var row: Dictionary = row_value
		deck.ledger.unlock(String(row.get("id", "")))
	_check("ownership ledger can install every declared row without weakening Phase 1",
		deck.ledger.installed_count(1) == 20 and deck.ledger.installed_count(2) == 2
		and deck.ledger.installed_total_count() == 22)
	var before_scale := Engine.time_scale
	for row_value in rows:
		await _prove_row(deck, shell, row_value as Dictionary)
	_check("all twenty-two owned cartridge lifecycles leave DRIVN time untouched",
		Engine.time_scale == before_scale)
	_finish()


func _prove_row(deck: Node, shell: CanvasLayer, row: Dictionary) -> void:
	var game_id := String(row.get("id", ""))
	var history_before := (deck.ledger.recent_results as Array).size()
	var launched: bool = shell.open_game(game_id, {"source": "complete-catalog",
		"device": String(row.get("platform", ""))})
	_check("%s launches through owned shell" % game_id, launched
		and deck.cartridge != null and deck.current_row.get("id") == game_id)
	if not launched:
		return
	var seed_value: int = 51000 + abs(game_id.hash() % 10000)
	var started: bool = deck.start(seed_value,
		[{"seat": 0, "device": -1, "profile_id": "catalog", "name": "RIDER"}])
	_check("%s starts through the shared deck" % game_id, started and deck.state == "PLAYING")
	if not started:
		deck.stop("catalog_start_failed")
		return
	var original: Dictionary = deck.cartridge.snapshot()
	var key := InputEventKey.new()
	key.physical_keycode = KEY_W
	key.keycode = KEY_W
	key.pressed = true
	deck.feed_event(key)
	deck.process_tick()
	_check("%s consumes a real semantic input tick" % game_id,
		int(deck.cartridge.snapshot().get("tick", 0)) >= 1)
	var paused_ok: bool = deck.pause()
	var paused_state: Dictionary = deck.cartridge.snapshot()
	deck.process_tick()
	_check("%s pause blocks simulation without global pause" % game_id,
		paused_ok and deck.cartridge.snapshot() == paused_state and Engine.time_scale == 1.0)
	deck.resume()
	deck.cartridge.restore_snapshot(original)
	_check("%s restores its deterministic snapshot" % game_id,
		JSON.stringify(deck.cartridge.snapshot()) == JSON.stringify(original))
	var forced := bool(deck.cartridge.debug_force_finish())
	var result: Dictionary = deck.cartridge.get("last_result")
	_check("%s writes one normalized result" % game_id, forced
		and (deck.ledger.recent_results as Array).size() == history_before + 1
		and String(result.get("game_id", "")) == game_id
		and String(result.get("outcome", "")) == "complete")
	deck.stop("catalog_complete")
	_check("%s stops without erasing its registry row" % game_id,
		deck.cartridge == null and not deck.registry.get_game(game_id).is_empty())


func _finish() -> void:
	print("GAME_CATALOG RESULTS: %d passed, %d failed" % [passed, failed])
	print("GAME_CATALOG: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
