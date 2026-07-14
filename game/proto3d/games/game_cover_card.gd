## One controller-focusable cartridge package. The semantic Button text remains
## available to tests and accessibility while the visible face uses real art.
class_name ProtoGameCoverCard
extends Button

const INK := Color("11100d")
const CARD := Color("242019")
const CARD_HOVER := Color("30291f")
const AMBER := Color("f2b735")
const BONE := Color("e8dfcf")
const DIM := Color("918675")
const DANGER := Color("c94f3d")
const STEEL := Color("5f756e")

var cover_texture_rect: TextureRect
var state_label: Label
var art_loaded := false
var game_row: Dictionary = {}


static func create(row: Dictionary, available: bool, owned: bool) -> Button:
	var script := load("res://proto3d/games/game_cover_card.gd") as GDScript
	var card: Button = script.new()
	card._setup(row, available, owned)
	return card


func _setup(row: Dictionary, available: bool, owned: bool) -> void:
	game_row = row.duplicate(true)
	name = "CoverCard_%s" % String(row.get("id", "unknown"))
	focus_mode = Control.FOCUS_ALL
	clip_contents = true
	size_flags_horizontal = Control.SIZE_EXPAND_FILL
	custom_minimum_size = Vector2(218, 356)
	tooltip_text = String(row.get("help", row.get("title", "CARTRIDGE")))

	var state := "READY"
	if not available:
		state = "NOT INSTALLED"
	elif not owned:
		state = "LOCKED // FIND CARTRIDGE"
	var title := String(row.get("title", row.get("id", "UNKNOWN")))
	text = "%s  //  %s  //  PWR %d / NET %d%s" % [title,
		String(row.get("aspect", "")), int(row.get("power_draw", 0)),
		int(row.get("network_cost", 0)), "  [%s]" % state if state != "READY" else ""]
	disabled = not available or not owned
	_style_button()

	var margin := MarginContainer.new()
	margin.mouse_filter = Control.MOUSE_FILTER_IGNORE
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	margin.add_theme_constant_override("margin_left", 10)
	margin.add_theme_constant_override("margin_top", 10)
	margin.add_theme_constant_override("margin_right", 10)
	margin.add_theme_constant_override("margin_bottom", 10)
	add_child(margin)

	var layout := VBoxContainer.new()
	layout.mouse_filter = Control.MOUSE_FILTER_IGNORE
	layout.add_theme_constant_override("separation", 7)
	margin.add_child(layout)

	var family := Label.new()
	family.mouse_filter = Control.MOUSE_FILTER_IGNORE
	family.text = "POCKET GAME DECK" if String(row.get("platform", "")) == "handheld" \
		else "SAFEHOUSE CONSOLE"
	family.add_theme_font_size_override("font_size", 11)
	family.add_theme_color_override("font_color", AMBER)
	layout.add_child(family)

	var art_well := PanelContainer.new()
	art_well.mouse_filter = Control.MOUSE_FILTER_IGNORE
	art_well.custom_minimum_size = Vector2(198, 228)
	art_well.size_flags_vertical = Control.SIZE_EXPAND_FILL
	var art_frame := StyleBoxFlat.new()
	art_frame.bg_color = INK
	art_frame.border_color = Color("574a37")
	art_frame.set_border_width_all(1)
	art_frame.corner_radius_top_left = 6
	art_frame.corner_radius_top_right = 6
	art_frame.corner_radius_bottom_left = 6
	art_frame.corner_radius_bottom_right = 6
	art_well.add_theme_stylebox_override("panel", art_frame)
	layout.add_child(art_well)

	var art_stack := Control.new()
	art_stack.mouse_filter = Control.MOUSE_FILTER_IGNORE
	art_well.add_child(art_stack)
	cover_texture_rect = TextureRect.new()
	cover_texture_rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	cover_texture_rect.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	cover_texture_rect.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	cover_texture_rect.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	cover_texture_rect.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS
	cover_texture_rect.texture = _cover_texture(String(row.get("cover_path", "")), title)
	cover_texture_rect.modulate = Color(0.72, 0.72, 0.67, 1.0) if disabled else Color.WHITE
	art_stack.add_child(cover_texture_rect)

	state_label = Label.new()
	state_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	state_label.text = state
	state_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	state_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	state_label.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_WIDE)
	state_label.offset_top = -30.0
	state_label.add_theme_font_size_override("font_size", 11)
	state_label.add_theme_color_override("font_color", BONE if state == "READY" else AMBER)
	var state_back := StyleBoxFlat.new()
	state_back.bg_color = Color(0.067, 0.063, 0.051, 0.92)
	state_back.border_color = AMBER if state != "READY" else STEEL
	state_back.border_width_top = 1
	state_label.add_theme_stylebox_override("normal", state_back)
	art_stack.add_child(state_label)

	var title_label := Label.new()
	title_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	title_label.text = title
	title_label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	title_label.add_theme_font_size_override("font_size", 16)
	title_label.add_theme_color_override("font_color", BONE)
	layout.add_child(title_label)

	var players: Dictionary = row.get("players", {}) as Dictionary
	var min_players := int(players.get("min", 1))
	var max_players := int(players.get("max", min_players))
	var player_fact := "%dP" % min_players if min_players == max_players \
		else "%d-%dP" % [min_players, max_players]
	var facts := Label.new()
	facts.mouse_filter = Control.MOUSE_FILTER_IGNORE
	facts.text = "%s // %s // %s\nPWR %d // NET %d" % [String(row.get("aspect", "")),
		player_fact, _network_fact(players), int(row.get("power_draw", 0)),
		int(row.get("network_cost", 0))]
	facts.add_theme_font_size_override("font_size", 11)
	facts.add_theme_color_override("font_color", DIM)
	layout.add_child(facts)


func _network_fact(players: Dictionary) -> String:
	var online := String(players.get("online", "none"))
	if online == "challenge":
		return "SCORE LINK"
	if bool(players.get("local", false)) and online != "none":
		return "LOCAL + ONLINE"
	if bool(players.get("local", false)):
		return "LOCAL"
	if online != "none":
		return "ONLINE"
	return "OFFLINE"


func _cover_texture(path: String, title: String) -> Texture2D:
	if path != "" and ResourceLoader.exists(path):
		var loaded := load(path) as Texture2D
		if loaded != null:
			art_loaded = true
			return loaded
	art_loaded = false
	return _fallback_texture(title)


func _fallback_texture(title: String) -> Texture2D:
	var image := Image.create(64, 96, false, Image.FORMAT_RGBA8)
	var accents := [AMBER, DANGER, STEEL, Color("c87832")]
	var accent: Color = accents[abs(title.hash()) % accents.size()]
	image.fill(INK)
	for y in range(96):
		for x in range(64):
			var stripe := ((x + y + abs(title.hash()) % 17) / 8) as int % 2 == 0
			if stripe and (x < 8 or x > 55 or y < 8 or y > 87):
				image.set_pixel(x, y, accent.darkened(0.2))
			elif (x * 3 + y * 5 + abs(title.hash())) % 43 == 0:
				image.set_pixel(x, y, Color(accent, 0.72))
	return ImageTexture.create_from_image(image)


func _style_button() -> void:
	# The real visible typography lives in child labels. Keeping semantic Button
	# text transparent preserves search/accessibility without drawing it twice.
	for color_name in ["font_color", "font_hover_color", "font_pressed_color",
			"font_focus_color", "font_disabled_color"]:
		add_theme_color_override(color_name, Color.TRANSPARENT)
	add_theme_stylebox_override("normal", _card_style(CARD, Color("554a39"), 1))
	add_theme_stylebox_override("hover", _card_style(CARD_HOVER, AMBER, 2))
	add_theme_stylebox_override("focus", _card_style(CARD_HOVER, AMBER, 3))
	add_theme_stylebox_override("pressed", _card_style(INK, AMBER, 2))
	add_theme_stylebox_override("disabled", _card_style(Color("1b1915"), Color("4c463b"), 1))


func _card_style(background: Color, border: Color, width: int) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = background
	style.border_color = border
	style.set_border_width_all(width)
	style.corner_radius_top_left = 10
	style.corner_radius_top_right = 10
	style.corner_radius_bottom_left = 10
	style.corner_radius_bottom_right = 10
	style.shadow_color = Color(0, 0, 0, 0.32)
	style.shadow_size = 5 if width > 1 else 2
	return style
