## Cover-first standalone library: twenty-two real cartridges and one separate
## DRIVN full-game promotion, with deterministic filtering/focus restoration.
class_name ProtoCompanionShelf
extends Control

signal game_selected(game_id: String)
signal promo_selected
signal quit_requested

var registry: RefCounted
var release_row: Dictionary = {}
var cards: Dictionary = {}
var promo_card: Button
var grid: GridContainer
var filter_buttons: Dictionary = {}
var quit_button: Button
var current_filter := "all"

var _scroll: ScrollContainer
var _subtitle: Label


func _init() -> void:
	name = "CompanionShelf"
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_build_ui()


func configure(new_registry: RefCounted, new_release_row: Dictionary) -> void:
	registry = new_registry
	release_row = new_release_row.duplicate(true)
	for child in grid.get_children():
		child.queue_free()
	cards.clear()
	var card_script := load("res://proto3d/games/game_cover_card.gd") as GDScript
	for game_id_value in registry.order:
		var game_id := String(game_id_value)
		var row: Dictionary = registry.get_game(game_id)
		var available := bool(registry.enabled(game_id))
		var card: Button = card_script.create(row, available, true, {"companion": true})
		card.pressed.connect(func() -> void: game_selected.emit(game_id))
		cards[game_id] = card
		grid.add_child(card)
	promo_card = _make_promo_card()
	grid.add_child(promo_card)
	set_filter(current_filter)
	call_deferred("restore_focus", "waste_heap")


func set_filter(filter_id: String) -> void:
	current_filter = filter_id if filter_id in ["all", "handheld", "console"] else "all"
	for game_id_value in cards:
		var game_id := String(game_id_value)
		var row: Dictionary = registry.get_game(game_id)
		(cards[game_id] as Button).visible = current_filter == "all" \
			or String(row.get("platform", "")) == current_filter
	if promo_card != null:
		promo_card.visible = current_filter == "all"
	for id in filter_buttons:
		(filter_buttons[id] as Button).button_pressed = String(id) == current_filter
	_focus_first_visible()


func restore_focus(game_id: String) -> void:
	if cards.has(game_id) and (cards[game_id] as Button).visible:
		# Queue this behind any filter fallback so the remembered cartridge wins.
		(cards[game_id] as Button).call_deferred("grab_focus")
	else:
		_focus_first_visible()


func snapshot_ui() -> Dictionary:
	var ordered_ids: Array = []
	var visible_count := 0
	var focused_game_id := ""
	if registry != null:
		for game_id_value in registry.order:
			var game_id := String(game_id_value)
			ordered_ids.append(game_id)
			var card: Button = cards.get(game_id) as Button
			if card != null and card.visible:
				visible_count += 1
			if card != null and card.has_focus():
				focused_game_id = game_id
	return {"filter": current_filter, "game_count": cards.size(),
		"visible_game_count": visible_count, "promo_visible": promo_card != null and promo_card.visible,
		"ordered_ids": ordered_ids, "focused_game_id": focused_game_id}


func _build_ui() -> void:
	var background := ColorRect.new()
	background.color = ProtoCompanionTheme.INK
	background.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	background.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(background)

	var margin := MarginContainer.new()
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	margin.add_theme_constant_override("margin_left", 28)
	margin.add_theme_constant_override("margin_top", 22)
	margin.add_theme_constant_override("margin_right", 28)
	margin.add_theme_constant_override("margin_bottom", 20)
	add_child(margin)
	var layout := VBoxContainer.new()
	layout.add_theme_constant_override("separation", 12)
	margin.add_child(layout)

	var header := HBoxContainer.new()
	layout.add_child(header)
	var identity := VBoxContainer.new()
	identity.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header.add_child(identity)
	var title := Label.new()
	title.text = "DRIVN: GAME DECK"
	title.add_theme_font_size_override("font_size", 30)
	title.add_theme_color_override("font_color", ProtoCompanionTheme.AMBER)
	identity.add_child(title)
	_subtitle = Label.new()
	_subtitle.text = "A DRIVN COMPANION // 22 PLAYABLE CARTRIDGES"
	_subtitle.add_theme_font_size_override("font_size", 14)
	_subtitle.add_theme_color_override("font_color", ProtoCompanionTheme.TEAL)
	identity.add_child(_subtitle)

	var filters := HBoxContainer.new()
	filters.add_theme_constant_override("separation", 8)
	header.add_child(filters)
	for filter_row in [["all", "ALL // 22"], ["handheld", "HANDHELD // 10"],
			["console", "CONSOLE // 12"]]:
		var button := Button.new()
		button.text = String(filter_row[1])
		button.custom_minimum_size = Vector2(142, 42)
		ProtoCompanionTheme.style_filter(button)
		var filter_id := String(filter_row[0])
		button.pressed.connect(func() -> void: set_filter(filter_id))
		filters.add_child(button)
		filter_buttons[filter_id] = button

	var divider := HSeparator.new()
	divider.add_theme_color_override("separator", ProtoCompanionTheme.RUST)
	layout.add_child(divider)
	_scroll = ScrollContainer.new()
	_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	layout.add_child(_scroll)
	grid = GridContainer.new()
	grid.columns = 4
	grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	grid.add_theme_constant_override("h_separation", 12)
	grid.add_theme_constant_override("v_separation", 12)
	_scroll.add_child(grid)
	resized.connect(_update_columns)

	var footer := HBoxContainer.new()
	footer.add_theme_constant_override("separation", 12)
	layout.add_child(footer)
	var hint := Label.new()
	hint.text = "SELECT: INSPECT BOX // INSERT FROM DETAILS // ESC: BACK"
	hint.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	hint.add_theme_color_override("font_color", ProtoCompanionTheme.BONE.darkened(0.35))
	footer.add_child(hint)
	quit_button = Button.new()
	quit_button.text = "QUIT"
	ProtoCompanionTheme.style_button(quit_button, ProtoCompanionTheme.DANGER)
	quit_button.pressed.connect(func() -> void: quit_requested.emit())
	footer.add_child(quit_button)


func _make_promo_card() -> Button:
	var card := Button.new()
	card.name = "PromoCard_DRIVN"
	card.text = "DRIVN // THE FULL WASTELAND // ABOUT THE FULL GAME"
	card.custom_minimum_size = Vector2(218, 356)
	card.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	ProtoCompanionTheme.style_button(card, ProtoCompanionTheme.RUST)
	var stack := VBoxContainer.new()
	stack.mouse_filter = Control.MOUSE_FILTER_IGNORE
	stack.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	stack.offset_left = 10
	stack.offset_top = 10
	stack.offset_right = -10
	stack.offset_bottom = -10
	stack.add_theme_constant_override("separation", 8)
	card.add_child(stack)
	var family := Label.new()
	family.text = "THE WORLD OUTSIDE THE ARCADE"
	family.add_theme_font_size_override("font_size", 11)
	family.add_theme_color_override("font_color", ProtoCompanionTheme.RUST)
	stack.add_child(family)
	var art := TextureRect.new()
	art.custom_minimum_size = Vector2(198, 228)
	art.size_flags_vertical = Control.SIZE_EXPAND_FILL
	art.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	art.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	art.texture = _promo_texture()
	stack.add_child(art)
	var title := Label.new()
	title.text = "DRIVN"
	title.add_theme_font_size_override("font_size", 24)
	title.add_theme_color_override("font_color", ProtoCompanionTheme.BONE)
	stack.add_child(title)
	var strap := Label.new()
	strap.text = "THE FULL WASTELAND\nGAME DECK LIVES INSIDE THIS WORLD"
	strap.add_theme_font_size_override("font_size", 11)
	strap.add_theme_color_override("font_color", ProtoCompanionTheme.AMBER)
	stack.add_child(strap)
	card.pressed.connect(func() -> void: promo_selected.emit())
	return card


func _promo_texture() -> Texture2D:
	var promo: Dictionary = release_row.get("promo", {}) as Dictionary
	var path := String(promo.get("art_path", ""))
	if path != "" and ResourceLoader.exists(path):
		var texture := load(path) as Texture2D
		if texture != null:
			return texture
	var image := Image.create(192, 288, false, Image.FORMAT_RGBA8)
	image.fill(ProtoCompanionTheme.INK)
	for y in range(image.get_height()):
		for x in range(image.get_width()):
			if y > 158 and absf(float(x - 96)) < float(y - 148) * 0.34:
				image.set_pixel(x, y, ProtoCompanionTheme.RUST.darkened(0.35))
			elif (x * 5 + y * 3) % 97 == 0:
				image.set_pixel(x, y, ProtoCompanionTheme.TEAL.darkened(0.25))
	return ImageTexture.create_from_image(image)


func _focus_first_visible() -> void:
	if registry == null:
		return
	for game_id_value in registry.order:
		var card: Button = cards.get(String(game_id_value)) as Button
		if card != null and card.visible:
			card.call_deferred("grab_focus")
			return
	if promo_card != null and promo_card.visible:
		promo_card.call_deferred("grab_focus")


func _update_columns() -> void:
	if grid != null:
		grid.columns = 4 if size.x >= 1000.0 else 2
