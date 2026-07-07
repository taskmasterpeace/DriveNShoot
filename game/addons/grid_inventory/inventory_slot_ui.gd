## GRID INVENTORY — ONE SLOT CELL. Draws an item's icon + stack count, and is the
## drag & drop surface. It owns no logic: every drop is routed back to the parent
## InventoryUI, which calls Inventory.move_slot(). Built entirely in code (no .tscn
## required) so InventoryUI can spawn a whole grid from a single set_inventory() call.
class_name InventorySlotUI
extends Panel

var index: int = -1
var _grid: InventoryUI = null

var _icon: TextureRect
var _count: Label
var _name: Label


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_STOP
	mouse_entered.connect(func() -> void:
		if _grid != null: _grid.show_tooltip(index))
	mouse_exited.connect(func() -> void:
		if _grid != null: _grid.hide_tooltip())

	_icon = TextureRect.new()
	_icon.set_anchors_preset(Control.PRESET_FULL_RECT)
	_icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	_icon.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_icon)

	_name = Label.new()
	_name.set_anchors_preset(Control.PRESET_FULL_RECT)
	_name.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_name.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_name.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_name.add_theme_font_size_override("font_size", 11)
	_name.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_name)

	_count = Label.new()
	_count.set_anchors_preset(Control.PRESET_BOTTOM_RIGHT)
	_count.offset_left = -22.0
	_count.offset_top = -18.0
	_count.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	_count.add_theme_font_size_override("font_size", 12)
	_count.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_count)


func bind(grid: InventoryUI, slot_index: int) -> void:
	_grid = grid
	index = slot_index


## Shift + left-click a stack of >1 → the split dialog (a plain click still starts a
## drag via _get_drag_data; only the shift-modified press is intercepted here).
func _gui_input(event: InputEvent) -> void:
	if event is InputEventMouseButton:
		var mb := event as InputEventMouseButton
		if mb.pressed and mb.button_index == MOUSE_BUTTON_LEFT and mb.shift_pressed and _grid != null:
			_grid.request_split(index)
			accept_event()


## Refreshes visuals from the model. Safe to call before _ready (nodes lazy-guarded).
func refresh(item: InventoryItem, count: int) -> void:
	if _icon == null:
		return
	if item == null:
		_icon.texture = null
		_name.text = ""
		_count.text = ""
		return
	_icon.texture = item.icon
	_name.text = "" if item.icon != null else item.display_name
	_count.text = str(count) if count > 1 else ""


# --- Drag & drop (Godot's Control virtuals, stable 4.3 -> 4.6) ----------------------

func _get_drag_data(_at: Vector2) -> Variant:
	if _grid == null or _grid.inventory == null or _grid.inventory.is_slot_empty(index):
		return null
	var item := _grid.inventory.get_item(index)
	var count := _grid.inventory.get_count(index)

	# A little floating preview that follows the cursor.
	var preview := TextureRect.new()
	preview.custom_minimum_size = size
	preview.size = size
	preview.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	preview.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	preview.texture = item.icon
	preview.modulate = Color(1, 1, 1, 0.75)
	if item.icon == null:
		var lbl := Label.new()
		lbl.text = item.display_name
		preview.add_child(lbl)
	var wrap := Control.new()               # offsets the preview so it centers on the cursor
	wrap.add_child(preview)
	preview.position = -0.5 * size
	set_drag_preview(wrap)

	return {"source": "grid_inventory", "grid": _grid, "index": index, "count": count}


func _can_drop_data(_at: Vector2, data: Variant) -> bool:
	return data is Dictionary \
		and (data as Dictionary).get("source", "") == "grid_inventory" \
		and (data as Dictionary).get("grid", null) == _grid   # same inventory only


func _drop_data(_at: Vector2, data: Variant) -> void:
	var from := int((data as Dictionary)["index"])
	_grid.inventory.move_slot(from, index)
