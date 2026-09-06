## Real front-door regression: normal scene transition, hardware input, pointer
## hit testing, focus ownership and the 1280x720 UI contract. No mocked menu or
## direct button signals. Run with an isolated user-data profile.
extends Node

const MAIN_SCENE := "res://proto3d/proto3d.tscn"
var passed: int = 0
var failed: int = 0
var main: Node = null
var menu: ProtoMenu = null
var _finished: bool = false
var _profile_backup: Dictionary = {}
var _previous_scale_size: Vector2i


func _ready() -> void:
	_previous_scale_size = get_tree().root.content_scale_size
	get_tree().root.content_scale_size = Vector2i(1280, 720)
	for path: String in [ProtoInputMap.OVERRIDES_PATH, ProtoOptionsPanel.SETTINGS_PATH]:
		_profile_backup[path] = {"exists": FileAccess.file_exists(path),
			"text": FileAccess.get_file_as_string(path) if FileAccess.file_exists(path) else ""}
	get_tree().create_timer(120.0).timeout.connect(func() -> void:
		_check("title modal regression completes before watchdog", false)
		_finish())
	_run.call_deferred()


func _check(label: String, condition: bool) -> void:
	passed += 1 if condition else 0
	failed += 0 if condition else 1
	print("TITLE_MODAL: %s - %s" % ["PASS" if condition else "FAIL", label])


func _run() -> void:
	# Keep this observer at root while the REAL front-door current_scene gate
	# runs. Instantiating main below a sim would intentionally skip the title.
	get_tree().current_scene = null
	_check("normal main scene transition accepted", get_tree().change_scene_to_file(MAIN_SCENE) == OK)
	await _frames(12)
	main = get_tree().current_scene
	if main != null:
		for child: Node in main.get_children():
			if child is ProtoMenu:
				menu = child as ProtoMenu
	_check("normal launch owns a live title gate", menu != null and bool(main.get("menu_open")))
	if menu == null:
		await _cleanup()
		return
	_check("regression uses the 1280x720 logical viewport", get_viewport().get_visible_rect().size.is_equal_approx(Vector2(1280, 720)))
	_check("title action face fits inside the viewport gutter", _fits(menu._root))
	_check("title has an opaque full-viewport backdrop over the live HUD", _has_opaque_backdrop(menu))
	_check("title face has the shared mechanical bezel", _has_bezel(menu._root))
	_check("title initially focuses its NEW GAME action", _focus_text().contains("NEW GAME"))
	await _exercise_controls()
	await _exercise_options()
	_check("subpanel checks leave the title gate intact", bool(main.get("menu_open")))
	await _cleanup()


func _exercise_controls() -> void:
	var launcher := _button(menu, "CONTROLS")
	_check("title exposes a Controls action", launcher != null)
	if launcher == null:
		return
	await _activate(launcher)
	var panel: ProtoControlsPanel = main.get("controls_panel") as ProtoControlsPanel
	_check("real title input opens Controls", panel != null and panel.is_open)
	if panel == null:
		return
	_check("Controls is presented above the title face", _presented(panel, panel._root))
	_check("Controls receives initial controller focus", _focus_within(panel._root))
	_check("Controls fits the 1280x720 viewport gutter", _fits(panel._root))
	var first_binding := _first_button(panel._rows_box)
	var first_category := panel._rows_box.get_child(0) as Control
	_check("initial Controls category is fully inside its scroll viewport", panel._scroll.get_global_rect().encloses(first_category.get_global_rect()))
	_check("initial focused binding is fully visible", first_binding != null and panel._scroll.get_global_rect().encloses(first_binding.get_global_rect()))
	for i: int in 12:
		await _key(KEY_TAB)
	_check("Controls navigation cannot reach underlying title actions", _focus_within(panel._root))
	await _key(KEY_ESCAPE)
	_check("idle raw Esc closes Controls", not panel.is_open)
	_check("Controls Esc restores focus to its title launcher", get_viewport().gui_get_focus_owner() == launcher)
	panel.close() # cleanup after an expected RED close failure, not the asserted path

	await _activate(launcher)
	await _pad(JOY_BUTTON_B)
	_check("raw pad B closes Controls", not panel.is_open)
	_check("Controls pad close restores launcher focus", get_viewport().gui_get_focus_owner() == launcher)
	panel.close()

	await _activate(launcher)
	var closer := _button(panel, "✕", true)
	_check("Controls exposes a visible header close button", closer != null and closer.is_visible_in_tree())
	if closer != null:
		_check("Controls close sits in the top-right header", _header_close(panel._root, closer))
		await _click(closer)
	_check("real pointer hit reaches Controls close above title", not panel.is_open)
	_check("Controls pointer close restores launcher focus", get_viewport().gui_get_focus_owner() == launcher)
	panel.close()

	await _activate(launcher)
	var binding := _first_button(panel._rows_box)
	_check("Controls exposes a real binding action", binding != null)
	if binding != null:
		var before := JSON.stringify(ProtoInputMap.rows_for_panel())
		await _activate(binding)
		_check("real UI activation begins a binding capture", panel.capturing())
		await _key(KEY_ESCAPE)
		_check("capture Esc cancels without closing Controls", panel.is_open and not panel.capturing())
		_check("capture cancellation preserves every live binding", JSON.stringify(ProtoInputMap.rows_for_panel()) == before)
		_check("capture cancellation restores a focusable binding row", _focus_within(panel._rows_box))
	await _key(KEY_ESCAPE)
	_check("Esc after capture cancellation returns to title", not panel.is_open and get_viewport().gui_get_focus_owner() == launcher)
	panel.close()

	# The header close is not a binding. The capture ear must leave its actual
	# pointer events for GUI hit testing in both hardware columns.
	for slot: String in ["keys", "pad"]:
		await _activate(launcher)
		binding = _first_button(panel._rows_box)
		if slot == "pad" and binding != null:
			binding = binding.get_parent().get_child(2) as Button
		var before := JSON.stringify(ProtoInputMap.rows_for_panel())
		if binding != null:
			await _activate(binding)
		_check(slot + " capture is active before pointer close", panel.capturing())
		await _click(panel._close_btn)
		_check(slot + " capture closes through the real header pointer", not panel.is_open)
		_check(slot + " capture header close never changes a binding", JSON.stringify(ProtoInputMap.rows_for_panel()) == before)
		_check(slot + " capture header close restores title focus", get_viewport().gui_get_focus_owner() == launcher)
		panel.close()


func _exercise_options() -> void:
	var launcher := _button(menu, "OPTIONS")
	_check("title exposes an Options action", launcher != null)
	if launcher == null:
		return
	await _activate(launcher)
	var panel: ProtoOptionsPanel = menu.get("_options_panel") as ProtoOptionsPanel
	_check("real title input opens Options", panel != null and panel.is_open)
	if panel == null:
		return
	_check("Options is presented above the title face", _presented(panel, panel._root))
	_check("Options receives initial controller focus", _focus_within(panel._root))
	_check("Options fits the 1280x720 viewport gutter", _fits(panel._root))
	await _key(KEY_ESCAPE)
	_check("raw Esc closes Options", not panel.is_open)
	_check("Options Esc restores its launcher focus", get_viewport().gui_get_focus_owner() == launcher)
	panel.close()

	await _activate(launcher)
	await _pad(JOY_BUTTON_B)
	_check("raw pad B closes Options", not panel.is_open)
	_check("Options pad close restores launcher focus", get_viewport().gui_get_focus_owner() == launcher)
	panel.close()

	await _activate(launcher)
	await _click(panel._close_btn)
	_check("real pointer hit reaches Options close above title", not panel.is_open)
	_check("Options pointer close restores launcher focus", get_viewport().gui_get_focus_owner() == launcher)
	panel.close()


func _presented(panel: CanvasLayer, root: Control) -> bool:
	return root.is_visible_in_tree() and (panel.layer > menu.layer or not menu._root.is_visible_in_tree())


func _fits(root: Control) -> bool:
	var bounds := get_viewport().get_visible_rect().grow(-30.0)
	return bounds.encloses(root.get_global_rect())


func _has_bezel(root: Control) -> bool:
	if not root is PanelContainer:
		return false
	var style := root.get_theme_stylebox("panel") as StyleBoxFlat
	return style != null and style.border_width_left >= 2 and style.border_width_right >= 2


func _has_opaque_backdrop(node: Node) -> bool:
	if node is ColorRect:
		var rect := node as ColorRect
		if rect.color.a >= 0.999 and rect.get_global_rect().encloses(get_viewport().get_visible_rect()):
			return true
	for child: Node in node.get_children():
		if _has_opaque_backdrop(child):
			return true
	return false


func _header_close(root: Control, closer: Button) -> bool:
	var panel_rect := root.get_global_rect()
	var close_rect := closer.get_global_rect()
	return close_rect.get_center().x > panel_rect.get_center().x and close_rect.position.y < panel_rect.position.y + 70.0


func _focus_within(root: Control) -> bool:
	var focus := get_viewport().gui_get_focus_owner()
	return focus != null and root.is_ancestor_of(focus)


func _focus_text() -> String:
	var focus := get_viewport().gui_get_focus_owner()
	return (focus as Button).text if focus is Button else ""


func _button(node: Node, label: String, exact: bool = false) -> Button:
	if node is Button:
		var candidate := node as Button
		if candidate.text == label if exact else candidate.text.contains(label):
			return candidate
	for child: Node in node.get_children():
		var found := _button(child, label, exact)
		if found != null:
			return found
	return null


func _first_button(node: Node) -> Button:
	if node is Button:
		return node as Button
	for child: Node in node.get_children():
		var found := _first_button(child)
		if found != null:
			return found
	return null


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


func _cleanup() -> void:
	if is_instance_valid(main):
		get_tree().current_scene = null
		main.queue_free()
		main = null
		await _frames(4)
	_finish()


func _finish() -> void:
	if _finished:
		return
	_finished = true
	for path: String in _profile_backup:
		var backup: Dictionary = _profile_backup[path]
		if bool(backup["exists"]):
			var file := FileAccess.open(path, FileAccess.WRITE)
			if file != null:
				file.store_string(String(backup["text"]))
		elif FileAccess.file_exists(path):
			DirAccess.remove_absolute(path)
	get_tree().root.content_scale_size = _previous_scale_size
	print("TITLE_MODAL RESULTS: %d passed, %d failed" % [passed, failed])
	print("TITLE_MODAL: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
