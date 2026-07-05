## The ONE transfer/loot/use interface — the same panel opens the car trunk, a
## world chest, or just your pack. Left = you, right = theirs. Click to move;
## USE consumes (bandage a wound from any open panel). "An interface that fits all of us."
class_name ProtoContainerPanel
extends CanvasLayer

var is_open: bool = false
var _main: Node = null
var _mine: ProtoContainer = null
var _theirs: ProtoContainer = null

var _root: PanelContainer
var _title: Label
var _left_box: VBoxContainer
var _right_box: VBoxContainer


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

	var hint := Label.new()
	hint.add_theme_font_override("font", ProtoHUD.mixed_font())
	hint.add_theme_font_size_override("font_size", 13)
	hint.add_theme_color_override("font_color", Color(0.92, 0.89, 0.82, 0.7))
	hint.text = "click item = move · USE = consume · TAB/E = close"
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
	var box := VBoxContainer.new()
	box.size_flags_vertical = Control.SIZE_EXPAND_FILL
	wrap.add_child(box)
	return box


## Open with the player's pack and (optionally) another container (trunk/chest).
func open(mine: ProtoContainer, theirs: ProtoContainer = null) -> void:
	_mine = mine
	_theirs = theirs
	is_open = true
	_root.visible = true
	_refresh()


func close() -> void:
	is_open = false
	_root.visible = false


func _refresh() -> void:
	if not is_open:
		return
	_title.text = ("%s  ⇄  %s" % [_mine.label, _theirs.label]) if _theirs else _mine.label
	_fill(_left_box, _mine, _theirs, true)
	_fill(_right_box, _theirs, _mine, false)
	# Take All (polish): sweep the whole container in one click.
	if _theirs != null and not _theirs.slots.is_empty():
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
	var ids: Array = from.slots.keys()
	ids.sort()
	for id in ids:
		var info: Dictionary = ProtoContainer.ITEMS.get(id, {"name": id, "emoji": "❔", "usable": false})
		var row := HBoxContainer.new()
		box.add_child(row)
		var btn := Button.new()
		btn.add_theme_font_override("font", ProtoHUD.mixed_font())
		btn.text = "%s %s ×%d" % [info["emoji"], info["name"], from.count(id)]
		btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		btn.pressed.connect(_on_move.bind(from, to, id))
		row.add_child(btn)
		if mine_side and info["usable"]:
			var use := Button.new()
			use.add_theme_font_override("font", ProtoHUD.mixed_font())
			use.text = "USE"
			use.pressed.connect(_on_use.bind(from, id))
			row.add_child(use)


func _on_move(from: ProtoContainer, to: ProtoContainer, id: String) -> void:
	if to != null:
		from.transfer_to(to, id)
		if _main and "audio" in _main and _main.audio:
			_main.audio.play_ui("blip", -12.0)
	_refresh()


func _on_use(from: ProtoContainer, id: String) -> void:
	if _main and _main.has_method("use_item") and _main.use_item(id):
		from.remove(id, 1)
	_refresh()
