## Physical-box inspection surface for the standalone companion. A cartridge is
## never launched from the shelf: the player sees its art, fiction, objective,
## score law, and live keyboard/pad bindings before INSERT becomes available.
class_name ProtoCompanionInspector
extends Control

signal insert_requested(game_id: String)
signal back_requested
signal follow_requested(url: String)

var mode := "empty"
var current_game_id := ""
var current_cover_path := ""
var current_controls: Array = []
var current_features: Array = []
var current_url := ""

var cover_texture_rect: TextureRect
var insert_button: Button
var back_button: Button
var follow_button: Button

var _body: BoxContainer
var _art_rail: PanelContainer
var _info_rail: PanelContainer
var _platform_label: Label
var _aspect_label: Label
var _cover_caption: Label
var _eyebrow_label: Label
var _title_label: Label
var _strap_label: Label
var _status_label: Label
var _facts_label: Label
var _help_label: Label
var _lore_label: Label
var _features_label: Label
var _controls_grid: GridContainer


func _init() -> void:
	name = "CompanionInspector"
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_build_ui()
	_apply_empty_state()


func show_game(row: Dictionary, controls: Array) -> void:
	mode = "game"
	current_game_id = String(row.get("id", ""))
	current_cover_path = String(row.get("cover_path", ""))
	current_controls = controls.duplicate(true)
	current_features.clear()
	current_url = ""
	var players: Dictionary = row.get("players", {}) as Dictionary
	var score: Dictionary = row.get("score", {}) as Dictionary
	var platform := String(row.get("platform", "")).to_upper()
	var aspect := String(row.get("aspect", ""))
	var ai := bool(players.get("ai", false))
	var score_rule := "LOW TIME WINS" if String(score.get("direction", "high")) == "low" \
		else "HIGH SCORE WINS"
	_platform_label.text = platform
	_aspect_label.text = aspect
	_cover_caption.text = "PHYSICAL CARTRIDGE // %s" % String(row.get("title", ""))
	_eyebrow_label.text = "A DRIVN GAME DECK CARTRIDGE"
	_title_label.text = String(row.get("title", ""))
	_strap_label.text = "INSERT THE BOX. LEARN THE RULES. THEN BOOT."
	_status_label.text = "READY TO INSERT"
	_facts_label.text = "%s // %s // %s\nSINGLE PLAYER%s" % [platform, aspect, score_rule,
		" // AI OPPONENTS" if ai else " // SOLO CHALLENGE"]
	_help_label.text = String(row.get("help", ""))
	_lore_label.text = String(row.get("about_world", ""))
	_features_label.text = ""
	_set_cover(current_cover_path)
	_set_controls(current_controls)
	insert_button.visible = current_game_id != ""
	insert_button.disabled = current_game_id == ""
	follow_button.visible = false
	follow_button.disabled = true
	back_button.grab_focus()


func show_promo(release_row: Dictionary) -> void:
	mode = "promo"
	current_game_id = ""
	current_controls.clear()
	var promo: Dictionary = release_row.get("promo", {}) as Dictionary
	current_features = (promo.get("features", []) as Array).duplicate(true)
	current_url = String(release_row.get("full_game_url", ""))
	current_cover_path = String(promo.get("art_path", ""))
	_platform_label.text = "THE WORLD OUTSIDE THE ARCADE"
	_aspect_label.text = "2:3"
	_cover_caption.text = "DRIVN // THE FULL WASTELAND"
	_eyebrow_label.text = String(release_row.get("subtitle", "A DRIVN COMPANION"))
	_title_label.text = String(promo.get("headline", "DRIVN // THE FULL WASTELAND"))
	_strap_label.text = String(promo.get("strap", ""))
	_status_label.text = String(promo.get("status", ""))
	_facts_label.text = String(promo.get("body", ""))
	_help_label.text = "THIS ARCADE IS ONE ROOM IN A MUCH BIGGER WORLD."
	_lore_label.text = "Drive the Divided States. Keep the machine alive. Build a crew, shelter dogs, fight for safehouses, and carry these cartridges with you."
	_features_label.text = " // ".join(current_features)
	_set_cover(current_cover_path, true)
	_set_controls([])
	insert_button.visible = false
	insert_button.disabled = true
	var safe_url := current_url.begins_with("https://") and current_url.length() > 8
	follow_button.visible = safe_url
	follow_button.disabled = not safe_url
	back_button.grab_focus()


func snapshot_ui() -> Dictionary:
	var ai_opponents := mode == "game" and _facts_label.text.contains("AI OPPONENTS")
	var score_rule := "LOW TIME WINS" if _facts_label.text.contains("LOW TIME WINS") \
		else ("HIGH SCORE WINS" if _facts_label.text.contains("HIGH SCORE WINS") else "")
	return {
		"mode": mode,
		"game_id": current_game_id,
		"title": _title_label.text,
		"strap": _strap_label.text,
		"body": _facts_label.text,
		"help": _help_label.text,
		"lore": _lore_label.text,
		"platform": _platform_label.text,
		"aspect": _aspect_label.text,
		"score_rule": score_rule,
		"single_player": mode == "game" and _facts_label.text.contains("SINGLE PLAYER"),
		"ai_opponents": ai_opponents,
		"cover_path": current_cover_path,
		"controls": current_controls.duplicate(true),
		"features": current_features.duplicate(true),
		"status": _status_label.text,
		"insert_visible": insert_button.visible,
		"follow_visible": follow_button.visible,
		"layout": "stacked" if _body.vertical else "desktop",
	}


func _build_ui() -> void:
	var background := ColorRect.new()
	background.color = ProtoCompanionTheme.INK
	background.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	background.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(background)
	var margin := MarginContainer.new()
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	margin.add_theme_constant_override("margin_left", 30)
	margin.add_theme_constant_override("margin_top", 26)
	margin.add_theme_constant_override("margin_right", 30)
	margin.add_theme_constant_override("margin_bottom", 26)
	add_child(margin)
	_body = BoxContainer.new()
	_body.add_theme_constant_override("separation", 20)
	margin.add_child(_body)

	_art_rail = PanelContainer.new()
	_art_rail.name = "ArtRail"
	_art_rail.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_art_rail.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_art_rail.size_flags_stretch_ratio = 0.38
	_art_rail.add_theme_stylebox_override("panel",
		ProtoCompanionTheme.panel(ProtoCompanionTheme.CARD, ProtoCompanionTheme.RUST, 2))
	_body.add_child(_art_rail)
	var art_stack := VBoxContainer.new()
	art_stack.add_theme_constant_override("separation", 10)
	_art_rail.add_child(art_stack)
	var badges := HBoxContainer.new()
	badges.add_theme_constant_override("separation", 8)
	art_stack.add_child(badges)
	_platform_label = ProtoCompanionTheme.make_badge("CARTRIDGE", ProtoCompanionTheme.RUST)
	_platform_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	badges.add_child(_platform_label)
	_aspect_label = ProtoCompanionTheme.make_badge("--", ProtoCompanionTheme.TEAL)
	badges.add_child(_aspect_label)
	cover_texture_rect = TextureRect.new()
	cover_texture_rect.name = "FullBoxArt"
	cover_texture_rect.custom_minimum_size = Vector2(260, 390)
	cover_texture_rect.size_flags_vertical = Control.SIZE_EXPAND_FILL
	cover_texture_rect.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	cover_texture_rect.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	cover_texture_rect.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	art_stack.add_child(cover_texture_rect)
	_cover_caption = Label.new()
	_cover_caption.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_cover_caption.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_cover_caption.add_theme_font_size_override("font_size", 12)
	_cover_caption.add_theme_color_override("font_color", ProtoCompanionTheme.AMBER)
	art_stack.add_child(_cover_caption)

	_info_rail = PanelContainer.new()
	_info_rail.name = "InformationRail"
	_info_rail.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_info_rail.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_info_rail.size_flags_stretch_ratio = 0.62
	_info_rail.add_theme_stylebox_override("panel",
		ProtoCompanionTheme.panel(ProtoCompanionTheme.CARD, ProtoCompanionTheme.BORDER, 1))
	_body.add_child(_info_rail)
	var scroll := ScrollContainer.new()
	scroll.name = "CopyAndControlsScroll"
	scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_info_rail.add_child(scroll)
	var information := VBoxContainer.new()
	information.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	information.add_theme_constant_override("separation", 12)
	scroll.add_child(information)
	_eyebrow_label = _make_label(13, ProtoCompanionTheme.TEAL)
	information.add_child(_eyebrow_label)
	_title_label = _make_label(34, ProtoCompanionTheme.BONE)
	information.add_child(_title_label)
	_strap_label = _make_label(15, ProtoCompanionTheme.AMBER)
	information.add_child(_strap_label)
	_status_label = ProtoCompanionTheme.make_badge("SELECT A CARTRIDGE", ProtoCompanionTheme.AMBER)
	information.add_child(_status_label)
	_facts_label = _make_label(16, ProtoCompanionTheme.BONE)
	information.add_child(_facts_label)
	_add_section_title(information, "OBJECTIVE")
	_help_label = _make_label(16, ProtoCompanionTheme.BONE)
	information.add_child(_help_label)
	_add_section_title(information, "IN THE WORLD")
	_lore_label = _make_label(15, ProtoCompanionTheme.BONE.darkened(0.14))
	information.add_child(_lore_label)
	_features_label = _make_label(13, ProtoCompanionTheme.TEAL)
	information.add_child(_features_label)
	_add_section_title(information, "LIVE CONTROLS // KEYBOARD + CONTROLLER")
	_controls_grid = GridContainer.new()
	_controls_grid.columns = 3
	_controls_grid.add_theme_constant_override("h_separation", 14)
	_controls_grid.add_theme_constant_override("v_separation", 7)
	information.add_child(_controls_grid)
	var actions := HBoxContainer.new()
	actions.add_theme_constant_override("separation", 10)
	information.add_child(actions)
	back_button = Button.new()
	back_button.text = "BACK TO SHELF"
	back_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	ProtoCompanionTheme.style_button(back_button, ProtoCompanionTheme.TEAL)
	back_button.pressed.connect(func() -> void: back_requested.emit())
	actions.add_child(back_button)
	follow_button = Button.new()
	follow_button.text = "FOLLOW DRIVN"
	follow_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	ProtoCompanionTheme.style_button(follow_button, ProtoCompanionTheme.RUST)
	follow_button.pressed.connect(_on_follow_pressed)
	actions.add_child(follow_button)
	insert_button = Button.new()
	insert_button.text = "INSERT CARTRIDGE"
	insert_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	ProtoCompanionTheme.style_button(insert_button, ProtoCompanionTheme.AMBER)
	insert_button.pressed.connect(_on_insert_pressed)
	actions.add_child(insert_button)
	resized.connect(_update_layout)
	call_deferred("_update_layout")


func _apply_empty_state() -> void:
	_platform_label.text = "GAME DECK"
	_aspect_label.text = "--"
	_cover_caption.text = "SELECT A BOX FROM THE SHELF"
	_eyebrow_label.text = "DRIVN: GAME DECK"
	_title_label.text = "INSPECT BEFORE INSERT"
	_strap_label.text = "EVERY CARTRIDGE HAS ITS OWN MACHINE, RULES, AND STORY."
	_status_label.text = "NO CARTRIDGE SELECTED"
	_facts_label.text = ""
	_help_label.text = ""
	_lore_label.text = ""
	_features_label.text = ""
	insert_button.visible = false
	insert_button.disabled = true
	follow_button.visible = false
	follow_button.disabled = true
	_set_cover("", true)
	_set_controls([])


func _set_cover(path: String, force_promo_shape: bool = false) -> void:
	var texture: Texture2D
	if path != "" and ResourceLoader.exists(path):
		texture = load(path) as Texture2D
	if texture == null:
		var width := 192
		var height := 288 if force_promo_shape else 192
		var image := Image.create(width, height, false, Image.FORMAT_RGBA8)
		image.fill(ProtoCompanionTheme.INK)
		for y in range(height):
			for x in range(width):
				if y > int(height * 0.55) and absf(float(x - width / 2)) < float(y) * 0.22:
					image.set_pixel(x, y, ProtoCompanionTheme.RUST.darkened(0.35))
				elif (x * 7 + y * 3) % 101 == 0:
					image.set_pixel(x, y, ProtoCompanionTheme.TEAL.darkened(0.2))
		texture = ImageTexture.create_from_image(image)
	cover_texture_rect.texture = texture


func _set_controls(controls: Array) -> void:
	for child in _controls_grid.get_children():
		child.free()
	for heading in ["ACTION", "KEYBOARD / MOUSE", "CONTROLLER"]:
		var label := _make_label(11, ProtoCompanionTheme.AMBER)
		label.text = heading
		_controls_grid.add_child(label)
	for value in controls:
		var row: Dictionary = value
		for text in [String(row.get("label", "")), String(row.get("keyboard", "--")),
				String(row.get("pad", "--"))]:
			var label := _make_label(13, ProtoCompanionTheme.BONE)
			label.text = text
			_controls_grid.add_child(label)


func _on_insert_pressed() -> void:
	if mode == "game" and current_game_id != "" and insert_button.visible \
			and not insert_button.disabled:
		insert_requested.emit(current_game_id)


func _on_follow_pressed() -> void:
	if mode == "promo" and follow_button.visible and not follow_button.disabled \
			and current_url.begins_with("https://"):
		follow_requested.emit(current_url)


func _update_layout() -> void:
	if _body == null:
		return
	_body.vertical = size.x > 0.0 and size.x < 900.0
	if _body.vertical:
		cover_texture_rect.custom_minimum_size = Vector2(220, 300)
	else:
		cover_texture_rect.custom_minimum_size = Vector2(260, 390)


func _make_label(font_size: int, color: Color) -> Label:
	var label := Label.new()
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	label.add_theme_font_size_override("font_size", font_size)
	label.add_theme_color_override("font_color", color)
	return label


func _add_section_title(parent: VBoxContainer, text: String) -> void:
	var divider := HSeparator.new()
	divider.add_theme_color_override("separator", ProtoCompanionTheme.BORDER)
	parent.add_child(divider)
	var heading := _make_label(12, ProtoCompanionTheme.RUST)
	heading.text = text
	parent.add_child(heading)
