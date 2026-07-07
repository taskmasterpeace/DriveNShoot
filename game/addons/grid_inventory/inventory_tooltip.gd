## GRID INVENTORY — the hover TOOLTIP (reference: Oen44/Godot-Inventory's ItemTooltip,
## trimmed to what a survival game needs: name, count, description — no affix/price
## sections). InventoryUI owns one and shows it when the cursor enters a filled slot.
## Built in code, mouse-transparent so it never eats input.
class_name InventoryTooltip
extends PanelContainer

var _name: Label
var _count: Label
var _desc: Label


func _ready() -> void:
	visible = false
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	top_level = true                      # position in screen space, not clipped by the grid
	var vb := VBoxContainer.new()
	vb.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(vb)

	_name = _line(vb, 15)
	_name.add_theme_color_override("font_color", Color(1.0, 0.86, 0.55))  # bone/amber, no purple
	_count = _line(vb, 12)
	_desc = _line(vb, 12)
	_desc.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_desc.custom_minimum_size = Vector2(200, 0)


func _line(parent: Node, sz: int) -> Label:
	var l := Label.new()
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	l.add_theme_font_size_override("font_size", sz)
	parent.add_child(l)
	return l


## Fill + show near screen position `at`. Null item hides it.
func show_item(item: InventoryItem, count: int, at: Vector2) -> void:
	if item == null:
		visible = false
		return
	_name.text = item.display_name if item.display_name != "" else String(item.id)
	_count.text = ("x%d" % count) if count > 1 else ""
	_count.visible = count > 1
	_desc.text = item.description
	_desc.visible = item.description != ""
	position = at + Vector2(14, 14)
	visible = true


func hide_tip() -> void:
	visible = false
