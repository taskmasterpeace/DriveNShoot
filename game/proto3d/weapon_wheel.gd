## Controller-first arsenal picker. One action owns a tap/hold grammar: quick
## release cycles, a held press opens this radial, center means bare hands.
class_name ProtoWeaponWheel
extends CanvasLayer

const HOLD_S: float = 0.18
const SLOW_SCALE: float = 0.18
const INNER_R: float = 76.0
const OUTER_R: float = 190.0

const INK := Color("#f3ead7")
const MUTED := Color("#b9aa90")
const PANEL := Color("#241f1a")
const WEDGE := Color("#3a3026")
const WEDGE_ACTIVE := Color("#d8922f")
const CENTER_ACTIVE := Color("#2fa89a")

var is_open: bool = false
var hold_threshold: float = HOLD_S
var _holding: bool = false
var _held_s: float = 0.0
var _ids: Array[String] = []
var _current: String = "fists"
var _selected: int = 0
var _prior_time_scale: float = 1.0
var _owns_time_scale: bool = false

var _root: Control = null
var _dial: Node2D = null
var _title: Label = null
var _hint: Label = null
var _wedges: Array[Polygon2D] = []
var _labels: Array[Label] = []
var _center: Polygon2D = null
var _center_label: Label = null


static func create() -> CanvasLayer:
	var wheel: Variant = (load("res://proto3d/weapon_wheel.gd") as Script).new()
	wheel._build()
	return wheel


func _build() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	layer = 120
	_root = Control.new()
	_root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_root)
	var dim := ColorRect.new()
	dim.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	dim.color = Color(0.055, 0.045, 0.035, 0.78)
	dim.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_root.add_child(dim)
	_dial = Node2D.new()
	_root.add_child(_dial)
	_title = _label("ARSENAL", 24, INK)
	_title.position = Vector2(-90, -258)
	_title.size = Vector2(180, 34)
	_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_dial.add_child(_title)
	_hint = _label("RELEASE TO DRAW  •  CENTER: FISTS", 13, MUTED)
	_hint.position = Vector2(-180, 218)
	_hint.size = Vector2(360, 26)
	_hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_dial.add_child(_hint)
	_root.visible = false
	set_process(true)


func _label(text_in: String, size_in: int, color_in: Color) -> Label:
	var label := Label.new()
	label.text = text_in
	label.add_theme_font_size_override("font_size", size_in)
	label.add_theme_color_override("font_color", color_in)
	label.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.8))
	label.add_theme_constant_override("shadow_offset_x", 2)
	label.add_theme_constant_override("shadow_offset_y", 2)
	return label


func configure(ids: Array[String], current: String) -> void:
	_ids = ids.duplicate()
	if _ids.is_empty():
		_ids = ["fists"]
	if _ids[0] != "fists":
		_ids.push_front("fists")
	_current = current if _ids.has(current) else _ids[0]
	_selected = _ids.find(_current)
	_rebuild_dial()


func _rebuild_dial() -> void:
	for wedge in _wedges:
		wedge.free()
	for label in _labels:
		label.free()
	_wedges.clear()
	_labels.clear()
	if _center != null:
		_center.free()
	if _center_label != null:
		_center_label.free()
	var count: int = maxi(1, _ids.size() - 1)
	for i in count:
		var start: float = -PI * 0.5 + TAU * float(i) / float(count)
		var finish: float = -PI * 0.5 + TAU * float(i + 1) / float(count)
		var wedge := Polygon2D.new()
		wedge.polygon = _wedge_points(start, finish)
		wedge.color = WEDGE
		_dial.add_child(wedge)
		_dial.move_child(wedge, 0)
		_wedges.append(wedge)
		var mid: float = (start + finish) * 0.5
		var label := _label(_display_name(_ids[i + 1]), 15, INK)
		var center := Vector2(cos(mid), sin(mid)) * ((INNER_R + OUTER_R) * 0.5)
		label.position = center - Vector2(62, 14)
		label.size = Vector2(124, 28)
		label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		_dial.add_child(label)
		_labels.append(label)
	_center = Polygon2D.new()
	_center.polygon = _circle_points(INNER_R - 10.0, 32)
	_center.color = PANEL
	_dial.add_child(_center)
	_center_label = _label("FISTS", 17, INK)
	_center_label.position = Vector2(-55, -14)
	_center_label.size = Vector2(110, 28)
	_center_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_dial.add_child(_center_label)
	_refresh()


func _wedge_points(start: float, finish: float) -> PackedVector2Array:
	var points := PackedVector2Array()
	var steps: int = 12
	for i in steps + 1:
		var angle: float = lerpf(start, finish, float(i) / float(steps))
		points.append(Vector2(cos(angle), sin(angle)) * OUTER_R)
	for i in steps + 1:
		var angle: float = lerpf(finish, start, float(i) / float(steps))
		points.append(Vector2(cos(angle), sin(angle)) * INNER_R)
	return points


func _circle_points(radius: float, count: int) -> PackedVector2Array:
	var points := PackedVector2Array()
	for i in count:
		var angle: float = TAU * float(i) / float(count)
		points.append(Vector2(cos(angle), sin(angle)) * radius)
	return points


func _display_name(id: String) -> String:
	if ProtoWeapon.WEAPONS.has(id):
		return String(ProtoWeapon.WEAPONS[id].get("name", id)).to_upper()
	return id.replace("_", " ").to_upper()


func begin_hold() -> void:
	_holding = true
	_held_s = 0.0


func advance_hold(delta: float) -> void:
	if not _holding or is_open:
		return
	_held_s += delta
	if _held_s >= hold_threshold:
		_open()


func _open() -> void:
	is_open = true
	_root.visible = true
	_prior_time_scale = Engine.time_scale
	_owns_time_scale = true
	Engine.time_scale = SLOW_SCALE
	_refresh()


func selection_for(pointer: Vector2) -> int:
	if pointer.length() < 0.28 or _ids.size() <= 1:
		return 0
	var count: int = maxi(1, _ids.size() - 1)
	var angle: float = wrapf(atan2(pointer.y, pointer.x) + PI * 0.5, 0.0, TAU)
	return 1 + int(floor(angle / TAU * float(count))) % count


func update_pointer(pointer: Vector2) -> void:
	_selected = selection_for(pointer)
	_refresh()


func _refresh() -> void:
	if _center == null:
		return
	_center.color = CENTER_ACTIVE if _selected == 0 else PANEL
	_center_label.add_theme_color_override("font_color", PANEL if _selected == 0 else INK)
	for i in _wedges.size():
		var active: bool = _selected == i + 1
		_wedges[i].color = WEDGE_ACTIVE if active else WEDGE
		_labels[i].add_theme_color_override("font_color", PANEL if active else INK)


func tap_cycle() -> String:
	if _ids.is_empty():
		return ""
	var index: int = _ids.find(_current)
	index = (index + 1) % _ids.size()
	_current = _ids[index]
	_selected = index
	return _current


func release() -> String:
	var selected_id: String = _ids[_selected] if is_open and not _ids.is_empty() else tap_cycle()
	_holding = false
	_close()
	_current = selected_id
	return selected_id


func cancel() -> void:
	_holding = false
	_close()


func _close() -> void:
	is_open = false
	if _root != null:
		_root.visible = false
	if _owns_time_scale:
		Engine.time_scale = _prior_time_scale
		_owns_time_scale = false


func _process(_delta: float) -> void:
	if _dial != null:
		_dial.position = get_viewport().get_visible_rect().size * 0.5


func _exit_tree() -> void:
	if _owns_time_scale:
		Engine.time_scale = _prior_time_scale
