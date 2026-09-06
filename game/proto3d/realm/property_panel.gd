class_name ProtoPropertyPanel
extends CanvasLayer
var road_life: Node
var is_open: bool = false
var root: Control
var contents: VBoxContainer
var site: ProtoPropertySite
var board: ProtoRoadJobBoard
var buttons: Dictionary = {}
var status: String = ""
var _refresh_pending: bool = false
var confirmation: ConfirmationDialog

func _ready() -> void:
	layer = 35
	root = Control.new()
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.visible = false
	add_child(root)
	var shade: ColorRect = ColorRect.new()
	shade.color = Color(0.035,0.055,0.05,0.92)
	shade.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.add_child(shade)
	var panel: PanelContainer = PanelContainer.new()
	panel.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	panel.position = Vector2(-370,-300)
	panel.size = Vector2(740,600)
	var style: StyleBoxFlat = StyleBoxFlat.new()
	style.bg_color = Color("233932")
	style.border_color = Color("c89c53")
	style.set_border_width_all(2)
	style.set_corner_radius_all(10)
	style.content_margin_left = 22
	style.content_margin_right = 22
	style.content_margin_top = 18
	style.content_margin_bottom = 18
	panel.add_theme_stylebox_override("panel", style)
	root.add_child(panel)
	var scroll: ScrollContainer = ScrollContainer.new()
	panel.add_child(scroll)
	contents = VBoxContainer.new()
	contents.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	contents.add_theme_constant_override("separation", 10)
	scroll.add_child(contents)
	var close_button: Button = Button.new()
	close_button.text = "×"
	close_button.tooltip_text = "Close · Esc / B / E / Y"
	close_button.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	close_button.position = Vector2(318,-288)
	close_button.size = Vector2(38,38)
	close_button.pressed.connect(close)
	root.add_child(close_button)

func open_site(value: ProtoPropertySite) -> void:
	site = value
	board = null
	_open()

func open_board(value: ProtoRoadJobBoard) -> void:
	board = value
	site = null
	_open()

func _open() -> void:
	if not road_life.state.allowed() or road_life.main.mode != road_life.main.Mode.FOOT:
		road_life.main.notify("ROADSTEAD uses LOCAL AUTHORITY; offline and on foot only")
		return
	is_open = true
	root.show()
	status = ""
	road_life.main.player.input_locked = true
	road_life.main._fist_pressed = false
	road_life.main._fire_down = false
	refresh()

func close() -> void:
	if is_instance_valid(confirmation):
		confirmation.queue_free()
		confirmation = null
	is_open = false
	root.hide()
	# Main recomputes all shared modal locks every physics tick.
	road_life.main.player.input_locked = false
	road_life.main._fire_down = false
	road_life.main._fist_pressed = false

func _input(event: InputEvent) -> void:
	if not is_open:
		return
	if is_instance_valid(confirmation) and confirmation.visible:
		return # confirmation owns its own focus and Esc/B; don't close the underlying panel
	if event.is_action_pressed("ui_cancel") or event.is_action_pressed("interact") or event.is_action_pressed("drivn_crouch"):
		close()
		get_viewport().set_input_as_handled()
	elif event is InputEventKey and event.echo:
		get_viewport().set_input_as_handled()

func _line(value: String, large: bool = false) -> void:
	var label: Label = Label.new()
	label.text = value
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	label.add_theme_font_size_override("font_size", 23 if large else 16)
	label.add_theme_color_override("font_color", Color("f2e3c5"))
	contents.add_child(label)

func _button(id: String, text: String, callback: Callable) -> void:
	var button: Button = Button.new()
	button.text = text
	button.custom_minimum_size.y = 38
	button.focus_mode = Control.FOCUS_ALL
	button.add_theme_font_size_override("font_size", 17)
	button.pressed.connect(func() -> void:
		if not is_open or _refresh_pending:
			return
		callback.call())
	contents.add_child(button)
	buttons[id] = button

func _result(value: Dictionary) -> void:
	status = "Saved to the local checkpoint." if value.ok else String(value.error)
	road_life.notify_result(value)
	# Disable immediately, rebuild after the current mouse/key event has completed.
	_refresh_pending = true
	for button: Button in buttons.values():
		button.disabled = true
	refresh.call_deferred()

func refresh() -> void:
	_refresh_pending = false
	for child: Node in contents.get_children():
		contents.remove_child(child)
		child.queue_free()
	buttons.clear()
	var state: ProtoRoadLifeState = road_life.state
	_line("ROADSTEAD / LOCAL AUTHORITY", true)
	_line("Banked Road Office fund: %d scrip  |  Carried cash: %d\nNot shared or networked. Every transaction checkpoints the entire local run." % [state.balance(), road_life.main.backpack.count("scrip")])
	if status != "":
		_line(status)
	if site != null:
		_line(String(site.row.name), true)
		var parcel: Dictionary = state.ledger.snapshot().parcels[site.row.id]
		if parcel.owner_id == "":
			_line("Deed: %d banked scrip · %d stored items\nEnter the cottage from the porch. Furniture is visual; possessions are managed here." % [site.row.price, site.row.item_capacity])
			_button("purchase", "Buy deed · %d banked scrip" % site.row.price, func() -> void: _result(state.purchase(site.row.id, state.request_id("buy"))))
		else:
			_line("YOUR HOME · store or take one item per activation")
			_button("guest", "Revoke local guest key" if parcel.guests.has("local_guest") else "Grant local guest key (offline only)", func() -> void: _result(state.guest(site.row.id, not parcel.guests.has("local_guest"))))
			if road_life.main.backpack.count("household_pantry") > 0:
				_button("pantry", "Unpack pantry reserve → 3 canned meals", func() -> void: _result(state.unpack_pantry(site.row.id)))
			for item: String in road_life.main.backpack.slots:
				if item.begins_with("freight_"):
					continue
				_button("store:" + item, "Store 1 · %s (%d carried)" % [ProtoContainer.ITEMS.get(item, {}).get("name", item), road_life.main.backpack.count(item)], func() -> void: _result(state.transfer(site.row.id, item, false, state.request_id("store"))))
			for item: String in parcel.items:
				_button("take:" + item, "Take 1 · %s (%d stored)" % [ProtoContainer.ITEMS.get(item, {}).get("name", item), parcel.items[item]], func() -> void: _result(state.transfer(site.row.id, item, true, state.request_id("take"))))
	elif board.job_id != "":
		var row: Dictionary = state.definitions[board.job_id]
		_line(String(row.name), true)
		_line(String(row.description))
		_button("deliver", "Hand over cargo · %d banked scrip + supply" % row.reward, func() -> void: _result(state.deliver(board.job_id, board.interact_position())))
	else:
		_line("FREIGHT DESK · earn your first deed", true)
		_line("Take one job. Drive east on Meridian main street onto the Richmond road. N cycles all marked receivers. Park, get out, E / Y to deliver. Each contract pays once.")
		for id: String in state.definitions:
			var row: Dictionary = state.definitions[id]
			if not state.jobs.completed.has(id):
				_button("accept:" + id, "%s · %d banked" % [row.name, row.reward], func() -> void: _result(state.accept(id)))
		if state.jobs.active != "":
			_line("Active: %s · Lost cargo? Reissue here. Contracts can be cancelled and taken again until paid." % state.jobs.active)
			_button("recover", "Reissue missing contract cargo", func() -> void: _result(state.recover()))
			_button("cancel", "Cancel active contract (confirmation)", _confirm_cancel)
	_button("close", "CLOSE · Esc / B / E / Y", close)
	buttons.values()[0].grab_focus.call_deferred()

func _confirm_cancel() -> void:
	var dialog: ConfirmationDialog = ConfirmationDialog.new()
	confirmation = dialog
	dialog.dialog_text = "Cancel this contract? Carried cargo is returned. No reward is paid."
	root.add_child(dialog)
	dialog.confirmed.connect(func() -> void: _result(road_life.state.cancel()); dialog.queue_free())
	dialog.canceled.connect(func() -> void: dialog.queue_free())
	dialog.popup_centered()
