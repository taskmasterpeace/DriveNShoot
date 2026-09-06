## Real main + ordinary starter pack. Hardware opens, navigates, uses, trades,
## drops and closes the real shared interface; only loot/shop fixtures are staged.
extends Node

var passed: int = 0
var failed: int = 0
var main: Node = null
var panel: ProtoContainerPanel
var _finished: bool = false
var _leaked_close_events: int = 0
var _previous_scale_size: Vector2i


func _ready() -> void:
	_previous_scale_size = get_tree().root.content_scale_size
	get_tree().root.content_scale_size = Vector2i(1280, 720)
	get_tree().create_timer(120.0).timeout.connect(func() -> void:
		_check("container modal regression completes before watchdog", false)
		_finish())
	_run.call_deferred()


func _check(label: String, condition: bool) -> void:
	passed += 1 if condition else 0
	failed += 0 if condition else 1
	print("CONTAINER_MODAL: %s - %s" % ["PASS" if condition else "FAIL", label])


func _run() -> void:
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	await _frames(12)
	panel = main.get("panel") as ProtoContainerPanel
	_check("starter pack is the ordinary wrench and five scrip", main.backpack.count("wrench") == 1 and main.backpack.count("scrip") == 5)
	await _key(KEY_E)
	_check("real interact exits the starter car", main.mode == main.Mode.FOOT)
	await _key(KEY_TAB)
	_check("real TAB opens the solo backpack", panel.is_open and panel._theirs == null)
	_check("solo backpack hides the empty THEIRS column", not _visible_label(panel._root, "THEIRS"))
	_check("initial focus selects an enabled item action", _focused_text() == "USE" and _focus_within(panel._left_box))
	_check("backpack fits 1280x720", _fits(panel._root))
	var frame := panel._root.get_theme_stylebox("panel") as StyleBoxFlat
	_check("ink frame prevents gameplay text bleeding through", frame != null and frame.bg_color.a >= 0.98)
	_check("container contents have readable internal padding", frame != null and frame.content_margin_left >= 12.0 and frame.content_margin_top >= 12.0)
	var closer := _button(panel._root, "✕", true)
	_check("visible top-right close affordance exists", closer != null and closer.is_visible_in_tree() and _header_close(closer))
	var first_use := get_viewport().gui_get_focus_owner() as Button
	await _pad(JOY_BUTTON_DPAD_DOWN)
	_check("D-pad down navigates items instead of closing the open pack", panel.is_open and _focus_within(panel._root) and get_viewport().gui_get_focus_owner() != first_use)
	if not panel.is_open:
		await _key(KEY_TAB) # recover the fixture after the specific RED failure
	var use_after_navigation := _button(panel._left_box, "USE", true)
	if use_after_navigation != null:
		use_after_navigation.grab_focus()
		await _frames(2)
	await _key(KEY_RIGHT)
	_check("keyboard navigation reaches DROP from the first USE", _focused_text() == "DROP")
	await _pad(JOY_BUTTON_DPAD_LEFT)
	_check("controller navigation returns to the first USE", _focused_text() == "USE")
	await _pad(JOY_BUTTON_A)
	_check("controller activates the real starter weapon USE", main.current_weapon() != null and main.current_weapon().id == "wrench")
	_check("equipping consumes the pack copy exactly once", main.backpack.count("wrench") == 0)
	_check("item rebuild retains enabled controller focus", _focus_within(panel._root) and _focused_enabled())
	await _key(KEY_TAB)
	_check("TAB still closes after item buttons receive focus", not panel.is_open)
	panel.close() # fixture cleanup after a RED failure, never the asserted close

	for method: String in ["escape", "pad", "pointer", "interact"]:
		await _key(KEY_TAB)
		_check("TAB reopens for " + method, panel.is_open)
		var leaked_before := _leaked_close_events
		if method == "escape":
			await _key(KEY_ESCAPE)
		elif method == "pad":
			await _pad(JOY_BUTTON_B)
		elif method == "pointer":
			closer = _button(panel._root, "✕", true)
			if closer != null:
				await _click(closer)
		else:
			await _key(KEY_E)
		_check(method + " closes the real backpack", not panel.is_open)
		if method in ["escape", "pad"]:
			_check(method + " close is consumed before gameplay", _leaked_close_events == leaked_before)
		panel.close()

	await _exercise_shared_modes()
	get_tree().root.content_scale_size = Vector2i(1280, 800)
	await _frames(3)
	await _key(KEY_TAB)
	_check("reopened solo backpack fits 1280x800", panel.is_open and _fits(panel._root))
	_check("returning from trade hides THEIRS again", not _visible_label(panel._root, "THEIRS"))
	await _key(KEY_ESCAPE)
	main.backpack.add("game_handheld", 1) # one owned device, not a replacement pack
	await _key(KEY_TAB)
	var handheld_use := _row_action(panel._left_box, "Game Deck", "USE")
	_check("pack exposes the owned handheld USE action", handheld_use != null)
	if handheld_use != null:
		await _activate(handheld_use)
	_check("real handheld USE opens the Game Deck library", main.game_shell.is_open and main.game_shell.current_view == "library")
	_check("handheld handoff closes the lower inventory modal", not panel.is_open and not panel._root.is_visible_in_tree())
	var handed_focus := get_viewport().gui_get_focus_owner()
	_check("handheld handoff retains the new modal's controller focus", handed_focus != null and main.game_shell.is_ancestor_of(handed_focus))
	_check("handheld USE never consumes the device", main.backpack.count("game_handheld") == 1)
	main.queue_free()
	main = null
	await _frames(4)
	_finish()


func _exercise_shared_modes() -> void:
	var chest := ProtoChest.create("Modal proof cache", {"bandage": 2}, false)
	main.add_child(chest)
	chest.global_position = main.player.global_position + main.player.facing() * 1.5
	main._current_interactable = chest
	await _key(KEY_E)
	_check("real E opens the shared loot interface", panel.is_open and panel._theirs == chest.container)
	_check("loot keeps its second column visible", _visible_label(panel._root, "THEIRS"))
	_check("loot layout fits the viewport", _fits(panel._root))
	var bandage := _button(panel._right_box, "Bandage")
	if bandage != null:
		await _activate(bandage)
	_check("real item activation transfers one loot unit", main.backpack.count("bandage") == 1 and chest.container.count("bandage") == 1)
	await _key(KEY_E)
	_check("main-owned E still closes loot", not panel.is_open)
	panel.close()

	var trader := ProtoNPC.create("trader")
	main.add_child(trader)
	trader.global_position = main.player.global_position + main.player.facing() * 1.2
	main._current_interactable = trader
	await _key(KEY_E)
	_check("real E opens the shared trade interface", panel.is_open and panel._merchant == trader)
	_check("trade keeps its second column visible", _visible_label(panel._root, "THEIRS"))
	_check("trade never exposes loot TAKE ALL", _button(panel._right_box, "TAKE ALL") == null)
	_check("trade layout fits the viewport", _fits(panel._root))
	var medkits_before: int = trader.stock.count("medkit")
	var money_before: int = main.backpack.count("scrip")
	var medkit := _button(panel._right_box, "Field medkit")
	if medkit != null:
		await _activate(medkit)
	_check("unaffordable purchase preserves stock and scrip", trader.stock.count("medkit") == medkits_before and main.backpack.count("scrip") == money_before)
	_check("unaffordable purchase remains readable on the opaque panel", _visible_text(panel._root).contains("Not enough scrip"))
	main.backpack.add("scrip", 100)
	var buy_price: int = main.trade_price("bandage", false)
	var sell_price: int = main.trade_price("bandage", true)
	var stock_before: int = trader.stock.count("bandage")
	bandage = _button(panel._right_box, "Bandage")
	if bandage != null:
		await _activate(bandage)
	_check("buy transfers one item and charges the existing quote", main.backpack.count("bandage") == 2 and trader.stock.count("bandage") == stock_before - 1 and main.backpack.count("scrip") == money_before + 100 - buy_price)
	var sell := _row_action(panel._left_box, "Bandage", "SELL")
	if sell != null:
		await _activate(sell)
	_check("sell returns one item and pays the existing quote", main.backpack.count("bandage") == 1 and trader.stock.count("bandage") == stock_before and main.backpack.count("scrip") == money_before + 100 - buy_price + sell_price)
	var drop := _row_action(panel._left_box, "Bandage", "DROP")
	if drop != null:
		await _activate(drop)
	var ground_count: int = 0
	for child: Node in main.get_children():
		if child is ProtoChest and (child as ProtoChest).container.label == "Dropped gear":
			ground_count += (child as ProtoChest).container.count("bandage")
	_check("DROP transfers one unit into real dropped gear", main.backpack.count("bandage") == 0 and ground_count == 1)
	await _key(KEY_E)
	panel.close()
	chest.queue_free()
	trader.queue_free()


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and (event as InputEventKey).pressed and (event as InputEventKey).physical_keycode == KEY_ESCAPE:
		_leaked_close_events += 1
	if event is InputEventJoypadButton and (event as InputEventJoypadButton).pressed and (event as InputEventJoypadButton).button_index == JOY_BUTTON_B:
		_leaked_close_events += 1


func _fits(root: Control) -> bool:
	return get_viewport().get_visible_rect().grow(-30).encloses(root.get_global_rect())


func _header_close(button: Button) -> bool:
	var rect := panel._root.get_global_rect()
	return button.get_global_rect().get_center().x > rect.get_center().x and button.get_global_rect().position.y < rect.position.y + 70


func _focus_within(root: Control) -> bool:
	var focus := get_viewport().gui_get_focus_owner()
	return focus != null and root.is_ancestor_of(focus)


func _focused_text() -> String:
	var focus := get_viewport().gui_get_focus_owner()
	return (focus as Button).text if focus is Button else ""


func _focused_enabled() -> bool:
	var focus := get_viewport().gui_get_focus_owner()
	return focus is Button and not (focus as Button).disabled


func _visible_label(node: Node, value: String) -> bool:
	if node is Label and (node as Label).text == value and (node as Label).is_visible_in_tree():
		return true
	for child: Node in node.get_children():
		if _visible_label(child, value):
			return true
	return false


func _visible_text(node: Node) -> String:
	var result: String = (node as Label).text if node is Label and (node as Label).is_visible_in_tree() else ""
	for child: Node in node.get_children():
		result += "\n" + _visible_text(child)
	return result


func _button(node: Node, text: String, exact: bool = false) -> Button:
	if node is Button and ((node as Button).text == text if exact else (node as Button).text.contains(text)):
		return node as Button
	for child: Node in node.get_children():
		var found := _button(child, text, exact)
		if found != null:
			return found
	return null


func _row_action(node: Node, item: String, action: String) -> Button:
	var label := _button(node, item)
	return _button(label.get_parent(), action) if label != null else null


func _activate(button: Button) -> void:
	button.grab_focus()
	await _frames(2)
	await _key(KEY_ENTER)


func _key(code: Key) -> void:
	for down: bool in [true, false]:
		var event := InputEventKey.new()
		event.physical_keycode = code
		event.keycode = code
		event.pressed = down
		Input.parse_input_event(event)
		await _frames(3)


func _pad(code: JoyButton) -> void:
	for down: bool in [true, false]:
		var event := InputEventJoypadButton.new()
		event.button_index = code
		event.pressed = down
		get_viewport().push_input(event)
		await _frames(3)


func _click(button: Button) -> void:
	var pointer := get_viewport().get_final_transform() * button.get_global_rect().get_center()
	for down: bool in [true, false]:
		var event := InputEventMouseButton.new()
		event.position = pointer
		event.button_index = MOUSE_BUTTON_LEFT
		event.pressed = down
		Input.parse_input_event(event)
		await _frames(3)


func _frames(count: int) -> void:
	for i: int in count:
		await get_tree().process_frame


func _finish() -> void:
	if _finished:
		return
	_finished = true
	get_tree().root.content_scale_size = _previous_scale_size
	print("CONTAINER_MODAL RESULTS: %d passed, %d failed" % [passed, failed])
	print("CONTAINER_MODAL: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
