## THE GAME SHELL: one heavy-bezel library/play/help/about/scores surface for
## all cartridges. The physical device and fullscreen view share one texture.
class_name ProtoGameShell
extends CanvasLayer

const INK := Color("11100d")
const CARD := Color("242019")
const AMBER := Color("f2b735")
const BONE := Color("e8dfcf")
const DIM := Color("918675")
const DANGER := Color("c94f3d")

var deck: Node
var is_open := false
var current_view := "library"
var current_text := ""
var first_library_button: Button = null
var _root: PanelContainer
var _title: Label
var _status: Label
var _screen: TextureRect
var _library_scroll: ScrollContainer
var _library_box: VBoxContainer
var _text_scroll: ScrollContainer
var _text_label: RichTextLabel
var _tabs: Dictionary = {}


static func create(new_deck: Node) -> CanvasLayer:
	var script := load("res://proto3d/games/game_shell.gd") as GDScript
	var shell: CanvasLayer = script.new()
	shell._setup(new_deck)
	return shell


func _setup(new_deck: Node) -> void:
	deck = new_deck
	layer = 6
	_build_ui()
	visible = false
	_root.visible = false


func _build_ui() -> void:
	_root = PanelContainer.new()
	_root.set_anchors_preset(Control.PRESET_CENTER)
	_root.custom_minimum_size = Vector2(1180, 680)
	var frame := StyleBoxFlat.new()
	frame.bg_color = INK
	frame.border_color = AMBER
	frame.set_border_width_all(2)
	frame.set_content_margin_all(18)
	frame.corner_radius_top_left = 10
	frame.corner_radius_top_right = 10
	frame.corner_radius_bottom_left = 10
	frame.corner_radius_bottom_right = 10
	_root.add_theme_stylebox_override("panel", frame)
	add_child(_root)

	var layout := VBoxContainer.new()
	layout.add_theme_constant_override("separation", 10)
	_root.add_child(layout)
	var header := HBoxContainer.new()
	header.add_theme_constant_override("separation", 10)
	layout.add_child(header)
	_title = Label.new()
	_title.text = "GAME DECK // NO CARTRIDGE"
	_title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_title.add_theme_font_size_override("font_size", 24)
	_title.add_theme_color_override("font_color", AMBER)
	header.add_child(_title)
	var power := Button.new()
	power.text = "■ POWER"
	power.focus_mode = Control.FOCUS_ALL
	power.add_theme_color_override("font_color", DANGER)
	power.pressed.connect(power_off)
	header.add_child(power)
	var close := Button.new()
	close.text = "✕"
	close.focus_mode = Control.FOCUS_ALL
	close.add_theme_color_override("font_color", DANGER)
	close.pressed.connect(close_to_device)
	header.add_child(close)

	var tab_bar := HBoxContainer.new()
	tab_bar.add_theme_constant_override("separation", 6)
	layout.add_child(tab_bar)
	for tab in [["library", "LIBRARY"], ["play", "PLAY"], ["help", "HELP"],
			["controls", "CONTROLS"], ["about", "ABOUT"], ["scores", "SCORES"]]:
		var button := Button.new()
		button.text = String(tab[1])
		button.focus_mode = Control.FOCUS_ALL
		button.toggle_mode = true
		var view_id := String(tab[0])
		button.pressed.connect(func() -> void: show_view(view_id))
		tab_bar.add_child(button)
		_tabs[view_id] = button

	var body := PanelContainer.new()
	body.size_flags_vertical = Control.SIZE_EXPAND_FILL
	var body_style := StyleBoxFlat.new()
	body_style.bg_color = CARD
	body_style.border_color = Color("4f4638")
	body_style.set_border_width_all(1)
	body_style.set_content_margin_all(12)
	body_style.corner_radius_top_left = 8
	body_style.corner_radius_top_right = 8
	body_style.corner_radius_bottom_left = 8
	body_style.corner_radius_bottom_right = 8
	body.add_theme_stylebox_override("panel", body_style)
	layout.add_child(body)
	var stack := Control.new()
	stack.custom_minimum_size = Vector2(0, 510)
	body.add_child(stack)

	_screen = TextureRect.new()
	_screen.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_screen.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_screen.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	_screen.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	stack.add_child(_screen)

	_library_scroll = ScrollContainer.new()
	_library_scroll.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_library_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	stack.add_child(_library_scroll)
	_library_box = VBoxContainer.new()
	_library_box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_library_box.add_theme_constant_override("separation", 6)
	_library_scroll.add_child(_library_box)

	_text_scroll = ScrollContainer.new()
	_text_scroll.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_text_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	stack.add_child(_text_scroll)
	_text_label = RichTextLabel.new()
	_text_label.bbcode_enabled = true
	_text_label.fit_content = true
	_text_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_text_label.add_theme_font_size_override("normal_font_size", 18)
	_text_label.add_theme_color_override("default_color", BONE)
	_text_scroll.add_child(_text_label)

	_status = Label.new()
	_status.text = "WORLD LIVE // START or ESC: menu // F1: help"
	_status.add_theme_color_override("font_color", DIM)
	layout.add_child(_status)


func open_library(platform: String = "") -> void:
	is_open = true
	visible = true
	_root.visible = true
	deck.set_shell_open(true)
	current_view = "library"
	_title.text = "GAME DECK // CARTRIDGE LIBRARY"
	_rebuild_library(platform)
	_sync_views()


func _rebuild_library(platform: String) -> void:
	for child in _library_box.get_children():
		child.queue_free()
	first_library_button = null
	for id_value in deck.registry.order:
		var id := String(id_value)
		var row: Dictionary = deck.registry.get_game(id)
		if platform != "" and String(row.get("platform", "")) != platform:
			continue
		var button := Button.new()
		button.focus_mode = Control.FOCUS_ALL
		button.alignment = HORIZONTAL_ALIGNMENT_LEFT
		button.text = "%s  //  %s%s" % [String(row.get("title", id)), String(row.get("aspect", "")),
			"" if deck.registry.enabled(id) else "  [NOT INSTALLED]"]
		button.disabled = not deck.registry.enabled(id)
		button.add_theme_color_override("font_color", BONE if not button.disabled else DIM)
		var game_id := id
		button.pressed.connect(func() -> void: open_game(game_id, {"source": "solo"}))
		_library_box.add_child(button)
		if first_library_button == null:
			first_library_button = button
	if first_library_button != null:
		first_library_button.grab_focus()


func open_game(game_id: String, context: Dictionary = {}) -> bool:
	is_open = true
	visible = true
	_root.visible = true
	deck.set_shell_open(true)
	if not deck.launch(game_id, context):
		_title.text = "GAME DECK // ERROR"
		_set_text(deck.error_text)
		current_view = "error"
		_sync_views()
		return false
	_title.text = "GAME DECK // %s" % String(deck.current_row.get("title", game_id))
	_screen.texture = deck.texture()
	current_view = "play"
	_sync_views()
	return true


func show_view(view_id: String) -> void:
	if view_id == "library":
		open_library(String(deck.current_row.get("platform", "")))
		return
	if deck.current_row.is_empty() and view_id != "pause":
		_set_text("NO CARTRIDGE // choose one from LIBRARY")
		current_view = view_id
		_sync_views()
		return
	current_view = view_id
	match view_id:
		"play":
			_screen.texture = deck.texture()
		"help":
			_set_text(_help_text(false))
		"controls":
			_set_text(_help_text(true))
		"about":
			_set_text(_about_text())
		"scores":
			_set_text(_scores_text())
		"pause":
			_set_text("[color=#f2b735][font_size=30]PAUSED[/font_size][/color]\n\nThe road is still moving outside this screen.\n\nSTART / ESC — resume\nB / ◯ — return to the physical device")
		_:
			_set_text(deck.error_text)
	_sync_views()


func _help_text(controls_only: bool) -> String:
	var lines: Array[String] = []
	if not controls_only:
		lines.append("[color=#f2b735][font_size=28]HOW TO PLAY[/font_size][/color]")
		lines.append(String(deck.current_row.get("help", "")))
		lines.append("")
	lines.append("[color=#f2b735][font_size=24]LIVE CONTROLS[/font_size][/color]")
	var profile := String(deck.current_row.get("controls_profile", "puzzle_grid"))
	for row_value in deck.input_router.help_labels(profile):
		var row: Dictionary = row_value
		lines.append("%s\n  %s   //   %s" % [String(row.get("label", "")),
			String(row.get("keyboard", "—")), String(row.get("pad", "—"))])
	return "\n".join(lines)


func _about_text() -> String:
	var lines: Array[String] = [
		"[color=#f2b735][font_size=28]IN THE WORLD[/font_size][/color]",
		String(deck.current_row.get("about_world", "")), "",
		"[color=#f2b735][font_size=28]REAL SOURCE & LICENSE[/font_size][/color]",
	]
	for source_id in deck.current_row.get("source_ids", []):
		var source: Dictionary = deck.registry.get_source(String(source_id))
		lines.append("%s\n%s\nCode: %s\nContent: %s\nRevision: %s\nNotice: %s" % [
			String(source.get("name", source_id)), String(source.get("url", "")),
			String(source.get("code_license", "")), String(source.get("content_license", "")),
			String(source.get("revision", "")), String(source.get("notice_path", ""))])
	return "\n".join(lines)


func _scores_text() -> String:
	var game_id := String(deck.current_row.get("id", ""))
	var ruleset := String(deck.current_row.get("ruleset", ""))
	var best: Dictionary = deck.ledger.personal_best(game_id, ruleset)
	var lines: Array[String] = ["[color=#f2b735][font_size=28]SCORES[/font_size][/color]"]
	lines.append("PERSONAL // no completed run" if best.is_empty() else "PERSONAL // %s" % best.get("primary"))
	for row_value in deck.ledger.board(game_id, ruleset, "house"):
		var row: Dictionary = row_value
		lines.append("HOUSE (FICTIONAL) // %s  %s" % [row.get("name", "?"), row.get("primary", 0)])
	return "\n".join(lines)


func _set_text(text: String) -> void:
	current_text = text
	_text_label.text = text


func _sync_views() -> void:
	_screen.visible = current_view == "play"
	_library_scroll.visible = current_view == "library"
	_text_scroll.visible = current_view not in ["play", "library"]
	for tab_id in _tabs:
		(_tabs[tab_id] as Button).button_pressed = String(tab_id) == current_view


func handle_event(event: InputEvent) -> bool:
	if not is_open:
		return false
	if current_view == "play" and deck.state == "PLAYING":
		if _is_pause_event(event):
			deck.pause()
			show_view("pause")
		else:
			deck.feed_event(event)
		return true
	if current_view == "pause" and _is_pause_event(event):
		deck.resume()
		show_view("play")
		return true
	if _is_raw_close(event):
		close_to_device()
		return true
	return false


func _is_pause_event(event: InputEvent) -> bool:
	return (event is InputEventKey and (event as InputEventKey).pressed \
		and not (event as InputEventKey).echo \
		and (event as InputEventKey).physical_keycode == KEY_ESCAPE) \
		or (event is InputEventJoypadButton and (event as InputEventJoypadButton).pressed \
		and (event as InputEventJoypadButton).button_index == JOY_BUTTON_START)


func _is_raw_close(event: InputEvent) -> bool:
	return (event is InputEventKey and (event as InputEventKey).pressed \
		and not (event as InputEventKey).echo \
		and (event as InputEventKey).physical_keycode == KEY_ESCAPE) \
		or (event is InputEventJoypadButton and (event as InputEventJoypadButton).pressed \
		and (event as InputEventJoypadButton).button_index == JOY_BUTTON_B)


func _input(event: InputEvent) -> void:
	if handle_event(event):
		get_viewport().set_input_as_handled()


func close_to_device() -> void:
	is_open = false
	_root.visible = false
	visible = false
	deck.set_shell_open(false)


func power_off() -> void:
	deck.stop("power_off")
	close_to_device()


func screen_texture() -> Texture2D:
	return _screen.texture
