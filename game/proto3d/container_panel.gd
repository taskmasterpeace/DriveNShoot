## The ONE transfer/loot/use interface — the same panel opens the car trunk, a
## world chest, or just your pack. Left = you, right = theirs. Click to move;
## USE consumes (bandage a wound from any open panel). "An interface that fits all of us."
class_name ProtoContainerPanel
extends CanvasLayer

const AMBER := Color(0.96, 0.72, 0.2)
const BONE := Color(0.92, 0.89, 0.82)
const DIM := Color(0.55, 0.52, 0.46)

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
var _right_column: Control
var _close_btn: Button
var _status: Label
var _actions: Dictionary = {}
var _first_action: Button = null
var _eat_pack_release: bool = false
var _eat_escape_release: bool = false
var _eat_back_release: bool = false


static func create(main: Node) -> ProtoContainerPanel:
	var p := ProtoContainerPanel.new()
	p._main = main
	p.layer = 3
	p._root = PanelContainer.new()
	p._root.set_anchors_preset(Control.PRESET_CENTER)
	p._fit_to_viewport()
	var style := StyleBoxFlat.new()
	# Fully opaque ink is deliberate here: HUD/world text under item rows is
	# unreadable interference. Action feedback remains on this panel and the HUD.
	style.bg_color = Color(0.09, 0.08, 0.06, 1.0)
	style.border_color = AMBER
	style.set_border_width_all(2)
	style.set_corner_radius_all(6)
	style.set_content_margin_all(16)
	p._root.add_theme_stylebox_override("panel", style)
	p._root.visible = false
	p.add_child(p._root)

	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 8)
	p._root.add_child(v)
	var header := HBoxContainer.new()
	header.add_theme_constant_override("separation", 12)
	v.add_child(header)
	p._title = Label.new()
	p._title.add_theme_font_override("font", ProtoHUD.mixed_font())
	p._title.add_theme_font_size_override("font_size", 22)
	p._title.add_theme_color_override("font_color", AMBER)
	p._title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	p._title.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	header.add_child(p._title)
	p._close_btn = Button.new()
	p._close_btn.text = "✕"
	p._style_button(p._close_btn)
	p._close_btn.custom_minimum_size = Vector2(36, 36)
	p._close_btn.add_theme_color_override("font_color", Color(0.9, 0.4, 0.3))
	p._close_btn.pressed.connect(p.close)
	header.add_child(p._close_btn)

	var cols := HBoxContainer.new()
	cols.add_theme_constant_override("separation", 18)
	cols.size_flags_vertical = Control.SIZE_EXPAND_FILL
	v.add_child(cols)
	p._left_box = p._make_col(cols, "YOU")
	p._right_box = p._make_col(cols, "THEIRS")
	p._right_column = p._right_box.get_parent().get_parent() as Control

	p._load_label = Label.new()
	p._load_label.add_theme_font_override("font", ProtoHUD.mixed_font())
	p._load_label.add_theme_font_size_override("font_size", 15)
	p._load_label.add_theme_color_override("font_color", Color(0.96, 0.72, 0.2))
	p._load_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(p._load_label)
	p._status = Label.new()
	p._status.add_theme_font_override("font", ProtoHUD.mixed_font())
	p._status.add_theme_font_size_override("font_size", 15)
	p._status.add_theme_color_override("font_color", BONE)
	p._status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	p._status.custom_minimum_size.y = 36
	v.add_child(p._status)

	var hint := Label.new()
	hint.add_theme_font_override("font", ProtoHUD.mixed_font())
	hint.add_theme_font_size_override("font_size", 15)
	hint.add_theme_color_override("font_color", DIM)
	hint.text = "SELECT  Enter / A / ✕  ·  CLOSE  Tab / E / Esc / B / ◯"
	hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	v.add_child(hint)
	return p


func _ready() -> void:
	get_viewport().size_changed.connect(_fit_to_viewport)
	_fit_to_viewport()


func _fit_to_viewport() -> void:
	var vp := _main.get_viewport().get_visible_rect().size
	var size := Vector2(minf(1060.0 if _theirs != null else 720.0, vp.x - 80.0), minf(620.0, vp.y - 80.0))
	_root.offset_left = -size.x * 0.5
	_root.offset_right = size.x * 0.5
	_root.offset_top = -size.y * 0.5
	_root.offset_bottom = size.y * 0.5


func _style_button(button: Button) -> void:
	button.add_theme_font_override("font", ProtoHUD.mixed_font())
	button.add_theme_font_size_override("font_size", 15)
	button.add_theme_color_override("font_color", BONE)
	button.add_theme_color_override("font_disabled_color", BONE)
	button.add_theme_color_override("font_hover_color", AMBER)
	button.add_theme_color_override("font_focus_color", AMBER)
	button.custom_minimum_size.y = 36
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.13, 0.115, 0.075)
	style.set_content_margin_all(6)
	style.set_corner_radius_all(6)
	button.add_theme_stylebox_override("normal", style)
	button.add_theme_stylebox_override("disabled", style)
	var focus := style.duplicate() as StyleBoxFlat
	focus.bg_color = Color(0, 0, 0, 0)
	focus.border_color = AMBER
	focus.set_border_width_all(2)
	button.add_theme_stylebox_override("focus", focus)
	var hover := focus.duplicate() as StyleBoxFlat
	hover.bg_color = Color(0.20, 0.17, 0.10)
	button.add_theme_stylebox_override("hover", hover)
	button.add_theme_stylebox_override("pressed", hover)


func _register_action(button: Button, key: String) -> void:
	button.set_meta("container_action", key)
	_actions[key] = button
	if not button.disabled and _first_action == null:
		_first_action = button


func _focus_action(key: String) -> void:
	if not is_open:
		return
	var button := _actions.get(key, _first_action) as Button
	if button == null or button.disabled:
		button = _first_action if _first_action != null else _close_btn
	if is_instance_valid(button) and button.is_inside_tree():
		button.grab_focus()


func _input(event: InputEvent) -> void:
	var key := event as InputEventKey
	var pad := event as InputEventJoypadButton
	var escape := key != null and (key.physical_keycode == KEY_ESCAPE or key.keycode == KEY_ESCAPE)
	var back := pad != null and pad.button_index == JOY_BUTTON_B
	if _eat_pack_release and key != null and event.is_action_released("drivn_pack"):
		_eat_pack_release = false
		get_viewport().set_input_as_handled()
		return
	if _eat_escape_release and escape and not key.pressed:
		_eat_escape_release = false
		get_viewport().set_input_as_handled()
		return
	if _eat_back_release and back and not pad.pressed:
		_eat_back_release = false
		get_viewport().set_input_as_handled()
		return
	if not is_open or (key != null and key.echo):
		return
	if key != null and event.is_action_pressed("drivn_pack"):
		_eat_pack_release = true # TAB must close before GUI consumes it as focus-next
	elif escape and key.pressed:
		_eat_escape_release = true
	elif back and pad.pressed:
		_eat_back_release = true
	else:
		return # E remains in main's ordinary interact priority chain
	get_viewport().set_input_as_handled()
	close()


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
	scroll.follow_focus = true
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
	_status.text = "Select an item action. USE equips or consumes; DROP leaves it on the ground."
	_right_column.visible = _theirs != null
	_fit_to_viewport()
	is_open = true
	_root.visible = true
	_refresh()


func close() -> void:
	is_open = false
	_root.visible = false


func _refresh() -> void:
	if not is_open:
		return
	var previous_focus := get_viewport().gui_get_focus_owner()
	var focus_key := String(previous_focus.get_meta("container_action", "")) if previous_focus != null else ""
	_actions.clear()
	_first_action = null
	var their_label: String = _theirs.label if _theirs else ""
	if _theirs and _theirs.max_weight > 0.0:
		their_label += "  (%.0f / %.0f kg)" % [_theirs.total_weight(), _theirs.max_weight]
	_title.text = ("%s  ⇄  %s" % [_mine.label, their_label]) if _theirs else _mine.label
	_fill(_left_box, _mine, _theirs, true)
	_fill(_right_box, _theirs, _mine, false)
	# Take All (polish): sweep the whole container in one click — NOT in a shop.
	if _theirs != null and _merchant == null and not _theirs.slots.is_empty():
		var take_all := Button.new()
		_style_button(take_all)
		take_all.text = "≪ TAKE ALL"
		take_all.pressed.connect(_on_take_all)
		_right_box.add_child(take_all)
		_register_action(take_all, "theirs:take_all")
	_focus_action.call_deferred(focus_key)


func _on_take_all() -> void:
	for id in _theirs.slots.keys().duplicate():
		_theirs.transfer_to(_mine, id, _theirs.count(id))
	if _main and "audio" in _main and _main.audio:
		_main.audio.play_ui("blip")
	_status.text = "Transfer complete. Anything that did not fit stays in %s." % _theirs.label
	_refresh()


func _fill(box: VBoxContainer, from: ProtoContainer, to: ProtoContainer, mine_side: bool) -> void:
	for child in box.get_children():
		box.remove_child(child)
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
		header.add_theme_font_size_override("font_size", 15)
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
			_style_button(btn)
			var n := from.count(id)
			# Pixel item icon (assets/ui/items/ via the bridge) — the emoji stays only
			# as the fallback when an id has no icon yet.
			var pic := ProtoItemBridge.icon_for(String(id))
			if pic != null:
				btn.icon = pic
				btn.add_theme_constant_override("icon_max_width", 24)
			btn.text = "%s%s ×%d · %.1fkg" % ["" if pic != null else String(info["emoji"]) + " ", info["name"], n, info.get("w", 0.5) * n]
			btn.tooltip_text = String(info.get("desc", ""))
			if _merchant != null and id != "scrip" and _main and _main.has_method("trade_price"):
				btn.text += "  🪙%d" % _main.trade_price(id, mine_side) # sell price on your side, buy on theirs
			btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			btn.clip_text = true
			btn.disabled = to == null or (_merchant != null and id == "scrip")
			if btn.disabled:
				btn.focus_mode = Control.FOCUS_NONE # a solo item name has no move action
			btn.pressed.connect(_on_move.bind(from, to, id))
			row.add_child(btn)
			var side: String = "mine" if mine_side else "theirs"
			_register_action(btn, "%s:%s:move" % [side, id])
			if mine_side and info["usable"]:
				var use := Button.new()
				_style_button(use)
				use.text = "USE"
				use.tooltip_text = String(info.get("desc", ""))
				use.pressed.connect(_on_use.bind(from, id))
				row.add_child(use)
				_register_action(use, "%s:%s:use" % [side, id])
			if mine_side:
				if to != null: # a trunk/chest is open — explicit STORE (playtest ask)
					var store := Button.new()
					_style_button(store)
					store.text = "SELL ≫" if _merchant != null else "STORE ≫"
					store.pressed.connect(_on_move.bind(from, to, id))
					row.add_child(store)
					store.disabled = _merchant != null and id == "scrip"
					_register_action(store, "%s:%s:store" % [side, id])
				var drop := Button.new()
				_style_button(drop)
				drop.text = "DROP"
				drop.pressed.connect(_on_drop.bind(from, id))
				row.add_child(drop)
				_register_action(drop, "%s:%s:drop" % [side, id])
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
		_status.text = "Dropped %s into ground gear." % _item_name(id)
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
				_status.text = "Sold %s for %d scrip." % [_item_name(id), price]
		else:
			if _mine.count("scrip") < price:
				_status.text = "Not enough scrip (%d needed)" % price
				if _main.has_method("notify"):
					_main.notify(_status.text)
				_refresh()
				return
			if from.transfer_to(to, id):
				_mine.remove("scrip", price)
				_status.text = "Bought %s for %d scrip." % [_item_name(id), price]
				if _main and _main.has_method("circuit_beat"):
					_main.circuit_beat("upgrade") # buying gear IS the upgrade beat
		if "audio" in _main and _main.audio:
			_main.audio.play_ui("click", -6.0)
		_refresh()
		return
	if not from.transfer_to(to, id):
		if _main and _main.has_method("notify") and not to.has_room(id):
			_status.text = "%s is FULL (%.0f kg max) — bring a bigger vehicle" % [to.label, to.max_weight]
			_main.notify(_status.text)
	else:
		_status.text = "Moved %s to %s." % [_item_name(id), to.label]
		if _main and "audio" in _main and _main.audio:
			_main.audio.play_ui("blip", -12.0)
	_refresh()


func _on_use(from: ProtoContainer, id: String) -> void:
	var before_notice := _latest_notice()
	if _main and _main.has_method("use_item") and _main.use_item(id):
		from.remove(id, 1)
		_status.text = "Used %s." % _item_name(id)
	else:
		_status.text = "Item kept: %s." % _item_name(id)
	# Mirror only the existing synchronous item result, never dequeue or hide
	# global notifications. This keeps equip/failure explanations readable over
	# opaque ink without changing use_item's consumed-versus-retained contract.
	var notice := _latest_notice()
	if not notice.is_empty() and notice != before_notice:
		_status.text = notice
	# A usable device can open another modal. Respect its focus ownership rather
	# than rebuilding these rows and stealing focus back into the inventory.
	var focus_owner := get_viewport().gui_get_focus_owner()
	if focus_owner != null and not _root.is_ancestor_of(focus_owner):
		close()
		return
	_refresh()


func _item_name(id: String) -> String:
	return String(ProtoContainer.ITEMS.get(id, {}).get("name", id))


func _latest_notice() -> String:
	if _main == null or _main.get("hud") == null:
		return ""
	var queue: Array = _main.hud.get("_toast_q")
	return String(queue.back()) if not queue.is_empty() else ""
