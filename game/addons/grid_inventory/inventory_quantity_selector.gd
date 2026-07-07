## GRID INVENTORY — the STACK-SPLIT dialog (reference: Oen44/Godot-Inventory's
## QuantitySelector). Shift-click a stack of >1 and this pops up: a slider to choose
## how many to peel off, TAKE / CANCEL. Emits `confirmed(amount)`; the InventoryUI
## turns that into Inventory.split_slot(). Built in code — no scene needed.
class_name InventoryQuantitySelector
extends PanelContainer

signal confirmed(amount: int)

var _label: Label
var _slider: HSlider


func _ready() -> void:
	visible = false
	var vb := VBoxContainer.new()
	vb.add_theme_constant_override("separation", 6)
	add_child(vb)

	_label = Label.new()
	_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	vb.add_child(_label)

	_slider = HSlider.new()
	_slider.min_value = 1
	_slider.step = 1
	_slider.custom_minimum_size = Vector2(160, 0)
	_slider.value_changed.connect(func(_v: float) -> void: _sync_label())
	vb.add_child(_slider)

	var row := HBoxContainer.new()
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	row.add_theme_constant_override("separation", 8)
	vb.add_child(row)
	var cancel := Button.new()
	cancel.text = "Cancel"
	cancel.pressed.connect(func() -> void: visible = false)
	row.add_child(cancel)
	var ok := Button.new()
	ok.text = "Take"
	ok.pressed.connect(func() -> void:
		visible = false
		confirmed.emit(int(_slider.value)))
	row.add_child(ok)


## Show the dialog for a stack of `count`, near screen position `at`. Slider spans
## 1..count-1 (you can't split off the whole stack — that's just a move).
func open(count: int, at: Vector2) -> void:
	_slider.max_value = maxi(1, count - 1)
	_slider.value = maxi(1, (count - 1))
	_sync_label()
	position = at
	visible = true
	_slider.grab_focus()


func _sync_label() -> void:
	_label.text = "Take %d" % int(_slider.value)
