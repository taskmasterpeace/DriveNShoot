## GAME DECK acquisition proof: starter ownership is narrow, ordinary libraries
## respect it, and a generic physical cartridge installs once through USE/save.
extends Node

var passed := 0
var failed := 0
var main: Node3D = null


func _check(label: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("GAME_ACQUISITION: %s - %s" % ["PASS" if ok else "FAIL", label])


func _library_button(title: String) -> Button:
	for child in main.game_shell._library_box.get_children():
		if child is Button and String((child as Button).text).contains(title):
			return child as Button
	return null


func _ready() -> void:
	print("GAME_ACQUISITION: start")
	get_tree().create_timer(90.0).timeout.connect(func() -> void:
		print("GAME_ACQUISITION: WATCHDOG")
		get_tree().quit(1))
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _frame in 10:
		await get_tree().process_frame
	var ledger: RefCounted = main.game_deck.ledger
	var starters: Array = ledger.unlocked
	_check("a new save owns exactly WASTE HEAP and CROWN OF ASH",
		starters.size() == 2 and starters.has("waste_heap") and starters.has("crown_of_ash"))

	main.game_shell.open_library("handheld")
	await get_tree().process_frame
	var radworm_button := _library_button("RADWORM")
	_check("locked media remains visible and disabled in the ordinary library",
		radworm_button != null and radworm_button.disabled and radworm_button.text.contains("LOCKED"))
	var bypassed: bool = main.game_shell.open_game("radworm", {"source": "solo", "device": "handheld"})
	_check("ordinary direct library launch cannot bypass physical ownership", not bypassed)
	main.game_deck.stop("red_cleanup")

	ProtoContainer.ensure_items()
	var cartridge_items: Array = ProtoContainer.ITEMS.keys().filter(func(item_id: Variant) -> bool:
		return String(item_id).begins_with("game_cart_"))
	_check("every non-starter Phase 1 game has one physical cartridge item",
		cartridge_items.size() == 18 and cartridge_items.has("game_cart_radworm")
		and not cartridge_items.has("game_cart_waste_heap"))

	main.backpack.add("game_cart_radworm", 1)
	var installed: bool = main.use_item("game_cart_radworm")
	if installed:
		main.backpack.remove("game_cart_radworm", 1)
	_check("USE consumes a physical cartridge and installs its game", installed
		and ledger.unlocked.has("radworm") and main.backpack.count("game_cart_radworm") == 0)
	main.backpack.add("game_cart_radworm", 1)
	var duplicate_consumed: bool = main.use_item("game_cart_radworm")
	_check("duplicate media is not consumed or installed twice", not duplicate_consumed
		and ledger.unlocked.count("radworm") == 1 and main.backpack.count("game_cart_radworm") == 1)

	main.game_shell.open_library("handheld")
	await get_tree().process_frame
	radworm_button = _library_button("RADWORM")
	_check("installed media becomes launchable through the same library",
		radworm_button != null and not radworm_button.disabled
		and main.game_shell.open_game("radworm", {"source": "solo", "device": "handheld"}))
	main.game_deck.stop("save_probe")
	var save: Dictionary = main.save_game()
	ledger.restore({})
	main.apply_save(save)
	if not ledger.unlocked.has("radworm"):
		print("GAME_ACQUISITION: save unlocked=%s restored=%s" % [
			str((save.get("game_deck", {}) as Dictionary).get("unlocked", [])), str(ledger.unlocked)])
	_check("installed ownership survives the one-file save", ledger.unlocked.has("radworm"))
	_check("acquisition never changes world time scale", Engine.time_scale == 1.0)
	_finish()


func _finish() -> void:
	print("GAME_ACQUISITION RESULTS: %d passed, %d failed" % [passed, failed])
	print("GAME_ACQUISITION: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
