## The ONE transfer/loot/use interface — the same panel opens the car trunk, a
## world chest, or just your pack. Left = you, right = theirs. Click to move;
## USE consumes (bandage a wound from any open panel). "An interface that fits all of us."
class_name ProtoContainerPanel
extends CanvasLayer

var is_open: bool = false
var _main: Node = null
var _mine: ProtoContainer = null
var _theirs: ProtoContainer = null
var _merchant: Node = null ## set → this is a SHOP: moves cost/pay scrip (Stage 6)

var _root: PanelContainer
var _title: Label
var _left_box: VBoxContainer
var _right_box: VBoxContainer
var _load_label: Label


static func create(main: Node) -> ProtoContainerPanel:
	var p := ProtoContainerPanel.new()
	p._main = main
	p.layer = 3
	p._root = PanelContainer.new()
	p._root.set_anchors_preset(Control.PRESET_CENTER)
	p._root.offset_left = -330.0
	p._root.offset_right = 330.0
	p._root.offset_top = -210.0
	p._root.offset_bottom = 210.0
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.10, 0.09, 0.07, 0.94)
	style.border_color = Color(0.96, 0.72, 0.2)
	style.set_border_width_all(2)
	style.set_corner_radius_all(6)
	p._root.add_theme_stylebox_override("panel", style)
	p._root.visible = false
	p.add_child(p._root)

	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 8)
	p._root.add_child(v)
	p._title = Label.new()
	p._title.add_theme_font_override("font", ProtoHUD.mixed_font())
	p._title.add_theme_font_size_override("font_size", 22)
	p._title.add_theme_color_override("font_color", Color(0.96, 0.72, 0.2))
	p._title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(p._title)

	var cols := HBoxContainer.new()
	cols.add_theme_constant_override("separation", 18)
	cols.size_flags_vertical = Control.SIZE_EXPAND_FILL
	v.add_child(cols)
	p._left_box = p._make_col(cols, "YOU")
	p._right_box = p._make_col(cols, "THEIRS")

	p._load_label = Label.new()
	p._load_label.add_theme_font_override("font", ProtoHUD.mixed_font())
	p._load_label.add_theme_font_size_override("font_size", 14)
	p._load_label.add_theme_color_override("font_color", Color(0.96, 0.72, 0.2))
	p._load_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(p._load_label)

	var hint := Label.new()
	hint.add_theme_font_override("font", ProtoHUD.mixed_font())
	hint.add_theme_font_size_override("font_size", 13)
	hint.add_theme_color_override("font_color", Color(0.92, 0.89, 0.82, 0.7))
	hint.text = "click = move · USE = consume · DROP = to ground · TAB/E = close"
	hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(hint)
	return p


func _make_col(parent: Control, heading: String) -> VBoxContainer:
	var wrap := VBoxContainer.new()
	wrap.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	parent.add_child(wrap)
	var h := Label.new()
	h.add_theme_font_override("font", ProtoHUD.mixed_font())
	h.add_theme_font_size_override("font_size", 15)
	h.add_theme_color_override("font_color", Color(0.92, 0.89, 0.82))
	h.text = heading
	wrap.add_child(h)
	# A full pack (the Test Grounds SUPPLY chest is 20+ rows) overran the panel and
	# spilled off the bottom of the screen (playtest 2026-07-08). Scroll inside a
	# bounded column instead: the panel never grows past its own frame.
	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	wrap.add_child(scroll)
	var box := VBoxContainer.new()
	box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(box)
	return box


## Open with the player's pack and (optionally) another container (trunk/chest).
## With a merchant, the SAME panel becomes the shop: item moves carry scrip.
func open(mine: ProtoContainer, theirs: ProtoContainer = null, merchant: Node = null) -> void:
	_mine = mine
	_theirs = theirs
	_merchant = merchant
	is_open = true
	_root.visible = true
	_refresh()


func close() -> void:
	is_open = false
	_root.visible = false


func _refresh() -> void:
	if not is_open:
		return
	var their_label: String = _theirs.label if _theirs else ""
	if _theirs and _theirs.max_weight > 0.0:
		their_label += "  (%.0f / %.0f kg)" % [_theirs.total_weight(), _theirs.max_weight]
	_title.text = ("%s  ⇄  %s" % [_mine.label, their_label]) if _theirs else _mine.label
	_fill(_left_box, _mine, _theirs, true)
	_fill(_right_box, _theirs, _mine, false)
	# Take All (polish): sweep the whole container in one click — NOT in a shop.
	if _theirs != null and _merchant == null and not _theirs.slots.is_empty():
		var take_all := Button.new()
		take_all.add_theme_font_override("font", ProtoHUD.mixed_font())
		take_all.text = "≪ TAKE ALL"
		take_all.pressed.connect(_on_take_all)
		_right_box.add_child(take_all)


func _on_take_all() -> void:
	for id in _theirs.slots.keys().duplicate():
		_theirs.transfer_to(_mine, id, _theirs.count(id))
	if _main and "audio" in _main and _main.audio:
		_main.audio.play_ui("blip")
	_refresh()


func _fill(box: VBoxContainer, from: ProtoContainer, to: ProtoContainer, mine_side: bool) -> void:
	for child in box.get_children():
		child.queue_free()
	if from == null:
		return
	# Group by category (weapons → ammo → meds → food → tools → loot) with headers —
	# a full pack reads like a kit list, not a junk drawer.
	var by_cat: Dictionary = {}
	for id in from.slots.keys():
		var cat: String = ProtoContainer.ITEMS.get(id, {}).get("cat", "loot")
		if not by_cat.has(cat):
			by_cat[cat] = []
		by_cat[cat].append(id)
	for cat in ProtoContainer.CAT_ORDER:
		if not by_cat.has(cat):
			continue
		var header := Label.new()
		header.add_theme_font_override("font", ProtoHUD.mixed_font())
		header.add_theme_font_size_override("font_size", 12)
		header.add_theme_color_override("font_color", Color(0.96, 0.72, 0.2, 0.85))
		header.text = "— %s —" % ProtoContainer.CAT_LABEL.get(cat, cat.to_upper())
		box.add_child(header)
		var ids: Array = by_cat[cat]
		ids.sort()
		for id in ids:
			var info: Dictionary = ProtoContainer.ITEMS.get(id, {"name": id, "emoji": "❔", "usable": false, "w": 0.5})
			var row := HBoxContainer.new()
			box.add_child(row)
			var btn := Button.new()
			btn.add_theme_font_override("font", ProtoHUD.mixed_font())
			var n := from.count(id)
			btn.text = "%s %s ×%d · %.1fkg" % [info["emoji"], info["name"], n, info.get("w", 0.5) * n]
			btn.tooltip_text = String(info.get("desc", ""))
			if _merchant != null and id != "scrip" and _main and _main.has_method("trade_price"):
				btn.text += "  🪙%d" % _main.trade_price(id, mine_side) # sell price on your side, buy on theirs
			btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			btn.pressed.connect(_on_move.bind(from, to, id))
			row.add_child(btn)
			if mine_side and info["usable"]:
				var use := Button.new()
				use.add_theme_font_override("font", ProtoHUD.mixed_font())
				use.text = "USE"
				use.tooltip_text = String(info.get("desc", ""))
				use.pressed.connect(_on_use.bind(from, id))
				row.add_child(use)
			if mine_side:
				if to != null: # a trunk/chest is open — explicit STORE (playtest ask)
					var store := Button.new()
					store.add_theme_font_override("font", ProtoHUD.mixed_font())
					store.text = "SELL ≫" if _merchant != null else "STORE ≫"
					store.pressed.connect(_on_move.bind(from, to, id))
					row.add_child(store)
				var drop := Button.new()
				drop.add_theme_font_override("font", ProtoHUD.mixed_font())
				drop.text = "DROP"
				drop.pressed.connect(_on_drop.bind(from, id))
				row.add_child(drop)
	if mine_side and _load_label and from != null:
		var cap: float = 32.0
		if _main != null and "character" in _main and _main.character:
			cap = _main.character.carry_cap() # STRENGTH raises it — the panel tells the truth
		var load := from.total_weight()
		_load_label.text = "🎒 load %.1f / %.0f kg%s" % [load, cap, "  — 🐢 OVERLOADED" if load > cap else ""]
		_load_label.add_theme_color_override("font_color",
			Color(0.9, 0.3, 0.2) if load > cap else Color(0.96, 0.72, 0.2))


func _on_drop(from: ProtoContainer, id: String) -> void:
	if _main and _main.has_method("drop_item") and _main.drop_item(id):
		pass
	_refresh()


func _on_move(from: ProtoContainer, to: ProtoContainer, id: String) -> void:
	if to == null:
		_refresh()
		return
	# Shop mode: the move IS the transaction — scrip flows the other way.
	if _merchant != null and _main != null:
		if id == "scrip":
			_refresh() # scrip is the currency, not a good
			return
		var selling: bool = from == _mine
		var price: int = _main.trade_price(id, selling)
		if selling:
			if from.transfer_to(to, id):
				_mine.add("scrip", price)
		else:
			if _mine.count("scrip") < price:
				if _main.has_method("notify"):
					_main.notify("Not enough scrip (%d needed)" % price)
				_refresh()
				return
			if from.transfer_to(to, id):
				_mine.remove("scrip", price)
				if _main and _main.has_method("circuit_beat"):
					_main.circuit_beat("upgrade") # buying gear IS the upgrade beat
		if "audio" in _main and _main.audio:
			_main.audio.play_ui("click", -6.0)
		_refresh()
		return
	if not from.transfer_to(to, id):
		if _main and _main.has_method("notify") and not to.has_room(id):
			_main.notify("%s is FULL (%.0f kg max) — bring a bigger vehicle" % [to.label, to.max_weight])
	elif _main and "audio" in _main and _main.audio:
		_main.audio.play_ui("blip", -12.0)
	_refresh()


func _on_use(from: ProtoContainer, id: String) -> void:
	if _main and _main.has_method("use_item") and _main.use_item(id):
		from.remove(id, 1)
	_refresh()
