## One deterministic insertion/ejection component shared by every cartridge.
## The contact signal is the only legal moment for the app to launch gameplay.
class_name ProtoCompanionTransition
extends Control

signal insert_contact
signal insert_finished
signal eject_finished

enum TransitionState { IDLE, PACKAGE, CARTRIDGE, SLOT, CONTACT, SCREEN, EJECT }

const CONTACT_TIME := 0.62
const INSERT_FINISH_TIME := 1.15
const EJECT_FINISH_TIME := 0.55
const REDUCED_BEAT_TIME := 0.10

const STATE_NAMES := {
	TransitionState.IDLE: "IDLE",
	TransitionState.PACKAGE: "PACKAGE",
	TransitionState.CARTRIDGE: "CARTRIDGE",
	TransitionState.SLOT: "SLOT",
	TransitionState.CONTACT: "CONTACT",
	TransitionState.SCREEN: "SCREEN",
	TransitionState.EJECT: "EJECT",
}

var state := TransitionState.IDLE
var package_art: TextureRect
var cartridge_art: TextureRect
var contact_lights: Array[ColorRect] = []

var _elapsed := 0.0
var _active_mode := ""
var _reduced_motion := false
var _contact_emitted := false
var _insert_finish_emitted := false
var _eject_finish_emitted := false
var _row: Dictionary = {}
var _stage: Control
var _package_frame: PanelContainer
var _cartridge_frame: PanelContainer
var _slot_frame: PanelContainer
var _powered_overlay: ColorRect
var _powered_title: Label
var _phase_label: Label
var _cartridge_shape := Vector2(340, 218)


func _init() -> void:
	name = "CompanionCartridgeTransition"
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	_build_ui()
	visible = false


func _process(delta: float) -> void:
	_advance(delta)


func insert(row: Dictionary, texture: Texture2D, reduced_motion: bool) -> void:
	_row = row.duplicate(true)
	package_art.texture = texture
	cartridge_art.texture = texture
	_reduced_motion = reduced_motion
	_elapsed = 0.0
	_active_mode = "insert"
	_contact_emitted = false
	_insert_finish_emitted = false
	_eject_finish_emitted = false
	state = TransitionState.PACKAGE
	visible = true
	_powered_title.text = "%s // SIGNAL LOCKED" % String(row.get("title", "CARTRIDGE"))
	_set_cartridge_shape(row)
	_visualize()


func eject(reduced_motion: bool) -> void:
	if state == TransitionState.IDLE:
		return
	_reduced_motion = reduced_motion
	_elapsed = 0.0
	_active_mode = "eject"
	_eject_finish_emitted = false
	state = TransitionState.EJECT
	visible = true
	_visualize()


func skip_after_contact() -> void:
	if _active_mode != "insert" or not _contact_emitted or _insert_finish_emitted:
		return
	_elapsed = REDUCED_BEAT_TIME * 2.0 if _reduced_motion else INSERT_FINISH_TIME
	state = TransitionState.SCREEN
	_visualize()
	_finish_insert()


func _advance(delta: float) -> void:
	if delta <= 0.0 or _active_mode == "":
		return
	_elapsed += delta
	if _active_mode == "eject":
		_visualize()
		var eject_duration := REDUCED_BEAT_TIME * 2.0 if _reduced_motion \
			else EJECT_FINISH_TIME
		if _elapsed >= eject_duration:
			_finish_eject()
		return
	if _reduced_motion:
		if _elapsed >= REDUCED_BEAT_TIME and not _contact_emitted:
			state = TransitionState.CONTACT
			_emit_contact()
		if _elapsed >= REDUCED_BEAT_TIME * 2.0:
			state = TransitionState.SCREEN
			_visualize()
			_finish_insert()
		else:
			_visualize()
		return

	if _elapsed >= 0.82:
		state = TransitionState.SCREEN
	elif _elapsed >= CONTACT_TIME:
		state = TransitionState.CONTACT
	elif _elapsed >= 0.38:
		state = TransitionState.SLOT
	elif _elapsed >= 0.18:
		state = TransitionState.CARTRIDGE
	else:
		state = TransitionState.PACKAGE
	if _elapsed >= CONTACT_TIME and not _contact_emitted:
		_emit_contact()
	_visualize()
	if _elapsed >= INSERT_FINISH_TIME:
		_finish_insert()


func snapshot_ui() -> Dictionary:
	var lit := 0
	for light in contact_lights:
		if light.color == ProtoCompanionTheme.AMBER:
			lit += 1
	return {
		"state": String(STATE_NAMES.get(state, "UNKNOWN")),
		"elapsed": _elapsed,
		"contact_at": CONTACT_TIME,
		"same_texture": package_art.texture != null and package_art.texture == cartridge_art.texture,
		"contact_light_count": contact_lights.size(),
		"lit_contacts": lit,
		"reduced_motion": _reduced_motion,
		"active": _active_mode != "",
		"game_id": String(_row.get("id", "")),
	}


func _emit_contact() -> void:
	if _contact_emitted:
		return
	_contact_emitted = true
	insert_contact.emit()


func _finish_insert() -> void:
	if _insert_finish_emitted:
		return
	_insert_finish_emitted = true
	_active_mode = ""
	state = TransitionState.SCREEN
	_visualize()
	insert_finished.emit()


func _finish_eject() -> void:
	if _eject_finish_emitted:
		return
	_eject_finish_emitted = true
	_active_mode = ""
	state = TransitionState.IDLE
	_visualize()
	visible = false
	eject_finished.emit()


func _build_ui() -> void:
	var blackout := ColorRect.new()
	blackout.color = Color(ProtoCompanionTheme.INK, 0.96)
	blackout.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(blackout)
	_stage = Control.new()
	_stage.name = "CartridgeStage"
	_stage.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(_stage)

	var brand := VBoxContainer.new()
	brand.set_anchors_preset(Control.PRESET_CENTER_TOP)
	brand.offset_left = -340
	brand.offset_top = 34
	brand.offset_right = 340
	brand.offset_bottom = 112
	brand.custom_minimum_size = Vector2(680, 78)
	_stage.add_child(brand)
	var title := Label.new()
	title.text = "DRIVN: GAME DECK"
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_font_size_override("font_size", 30)
	title.add_theme_color_override("font_color", ProtoCompanionTheme.AMBER)
	brand.add_child(title)
	_phase_label = Label.new()
	_phase_label.text = "PACKAGE DETECTED"
	_phase_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_phase_label.add_theme_font_size_override("font_size", 13)
	_phase_label.add_theme_color_override("font_color", ProtoCompanionTheme.TEAL)
	brand.add_child(_phase_label)

	_package_frame = PanelContainer.new()
	_package_frame.name = "Package"
	_package_frame.set_anchors_preset(Control.PRESET_CENTER)
	_package_frame.offset_left = -170
	_package_frame.offset_top = -255
	_package_frame.offset_right = 170
	_package_frame.offset_bottom = 255
	_package_frame.pivot_offset = Vector2(170, 255)
	_package_frame.add_theme_stylebox_override("panel",
		ProtoCompanionTheme.panel(ProtoCompanionTheme.CARD, ProtoCompanionTheme.RUST, 3))
	_stage.add_child(_package_frame)
	package_art = TextureRect.new()
	package_art.name = "SelectedBoxArt"
	package_art.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	package_art.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	_package_frame.add_child(package_art)

	_cartridge_frame = PanelContainer.new()
	_cartridge_frame.name = "PhysicalCartridge"
	_cartridge_frame.set_anchors_preset(Control.PRESET_CENTER)
	_cartridge_frame.clip_contents = true
	_cartridge_frame.add_theme_stylebox_override("panel",
		ProtoCompanionTheme.panel(Color("302b22"), ProtoCompanionTheme.BONE.darkened(0.35), 4, 16))
	_stage.add_child(_cartridge_frame)
	cartridge_art = TextureRect.new()
	cartridge_art.name = "CartridgeLabel"
	cartridge_art.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	cartridge_art.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	cartridge_art.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT, Control.PRESET_MODE_MINSIZE, 18)
	_cartridge_frame.add_child(cartridge_art)

	_slot_frame = PanelContainer.new()
	_slot_frame.name = "UniversalDeckSlot"
	_slot_frame.set_anchors_preset(Control.PRESET_CENTER)
	_slot_frame.offset_left = -250
	_slot_frame.offset_top = 270
	_slot_frame.offset_right = 250
	_slot_frame.offset_bottom = 390
	_slot_frame.add_theme_stylebox_override("panel",
		ProtoCompanionTheme.panel(Color("090907"), ProtoCompanionTheme.BORDER, 4, 8))
	_stage.add_child(_slot_frame)
	var slot_stack := VBoxContainer.new()
	slot_stack.alignment = BoxContainer.ALIGNMENT_CENTER
	slot_stack.add_theme_constant_override("separation", 8)
	_slot_frame.add_child(slot_stack)
	var slot_label := Label.new()
	slot_label.text = "UNIVERSAL DECK SLOT // CONTACT BUS"
	slot_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	slot_label.add_theme_font_size_override("font_size", 13)
	slot_label.add_theme_color_override("font_color", ProtoCompanionTheme.BONE.darkened(0.25))
	slot_stack.add_child(slot_label)
	var lights := HBoxContainer.new()
	lights.alignment = BoxContainer.ALIGNMENT_CENTER
	lights.add_theme_constant_override("separation", 22)
	slot_stack.add_child(lights)
	for index in range(4):
		var light := ColorRect.new()
		light.name = "Contact%d" % (index + 1)
		light.custom_minimum_size = Vector2(42, 9)
		light.color = ProtoCompanionTheme.BORDER
		lights.add_child(light)
		contact_lights.append(light)

	_powered_overlay = ColorRect.new()
	_powered_overlay.name = "PoweredScreen"
	_powered_overlay.color = ProtoCompanionTheme.TEAL.darkened(0.52)
	_powered_overlay.modulate = Color(1.0, 1.0, 1.0, 0.0)
	_powered_overlay.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_powered_overlay.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_stage.add_child(_powered_overlay)
	_powered_title = Label.new()
	_powered_title.set_anchors_preset(Control.PRESET_CENTER)
	_powered_title.offset_left = -430
	_powered_title.offset_top = -36
	_powered_title.offset_right = 430
	_powered_title.offset_bottom = 36
	_powered_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_powered_title.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_powered_title.add_theme_font_size_override("font_size", 27)
	_powered_title.add_theme_color_override("font_color", ProtoCompanionTheme.BONE)
	_powered_overlay.add_child(_powered_title)


func _set_cartridge_shape(row: Dictionary) -> void:
	var aspect := String(row.get("aspect", ""))
	var shape := Vector2(340, 218)
	if String(row.get("platform", "")) == "handheld":
		match aspect:
			"1:1":
				shape = Vector2(230, 230)
			"9:16":
				shape = Vector2(168, 276)
			_:
				shape = Vector2(318, 184)
	_cartridge_shape = shape
	_cartridge_frame.offset_left = -shape.x * 0.5
	_cartridge_frame.offset_top = -shape.y * 0.5
	_cartridge_frame.offset_right = shape.x * 0.5
	_cartridge_frame.offset_bottom = shape.y * 0.5
	_cartridge_frame.pivot_offset = shape * 0.5


func _visualize() -> void:
	if state == TransitionState.IDLE:
		return
	var package_alpha := 1.0
	var cartridge_alpha := 0.0
	var slot_alpha := 0.15
	var screen_alpha := 0.0
	var cartridge_y := -25.0
	var package_x := 0.0
	var scale_value := 1.0
	var lit_count := 0
	if _active_mode == "eject":
		var duration := REDUCED_BEAT_TIME * 2.0 if _reduced_motion else EJECT_FINISH_TIME
		var p := clampf(_elapsed / duration, 0.0, 1.0)
		screen_alpha = 1.0 - p
		cartridge_alpha = 1.0
		cartridge_y = lerpf(175.0, -35.0, p)
		package_alpha = p
		package_x = lerpf(-360.0, 0.0, p)
		slot_alpha = 1.0 - p * 0.55
		lit_count = int(round((1.0 - p) * 4.0))
		_phase_label.text = "EJECTING // SCORE + SAVE COMMITTED"
	elif _reduced_motion:
		var fade := clampf(_elapsed / REDUCED_BEAT_TIME, 0.0, 1.0)
		package_alpha = 1.0 - fade
		cartridge_alpha = fade
		slot_alpha = fade
		if _contact_emitted:
			var power := clampf((_elapsed - REDUCED_BEAT_TIME) / REDUCED_BEAT_TIME, 0.0, 1.0)
			screen_alpha = power
			lit_count = 4
		_phase_label.text = "CONTACT // REDUCED MOTION"
	else:
		if _elapsed < 0.18:
			scale_value = lerpf(1.0, 1.04, clampf(_elapsed / 0.18, 0.0, 1.0))
		elif _elapsed < 0.38:
			var reveal := clampf((_elapsed - 0.18) / 0.20, 0.0, 1.0)
			package_x = lerpf(0.0, -360.0, reveal)
			cartridge_alpha = reveal
		else:
			package_x = -360.0
			cartridge_alpha = 1.0
			var descend := clampf((_elapsed - 0.38) / 0.24, 0.0, 1.0)
			cartridge_y = lerpf(-25.0, 175.0, descend)
			slot_alpha = lerpf(0.15, 1.0, descend)
		if _elapsed >= CONTACT_TIME:
			lit_count = clampi(int(floor((_elapsed - CONTACT_TIME) / 0.045)) + 1, 1, 4)
			screen_alpha = clampf((_elapsed - 0.82) / 0.25, 0.0, 1.0)
		_phase_label.text = String(STATE_NAMES.get(state, "INSERT")) + " // UNIVERSAL BUS"
	_package_frame.offset_left = -170.0 + package_x
	_package_frame.offset_top = -255.0
	_package_frame.offset_right = 170.0 + package_x
	_package_frame.offset_bottom = 255.0
	_package_frame.modulate = Color(1.0, 1.0, 1.0, package_alpha)
	_package_frame.scale = Vector2.ONE * scale_value
	_cartridge_frame.offset_left = -_cartridge_shape.x * 0.5
	_cartridge_frame.offset_top = -_cartridge_shape.y * 0.5 + cartridge_y
	_cartridge_frame.offset_right = _cartridge_shape.x * 0.5
	_cartridge_frame.offset_bottom = _cartridge_shape.y * 0.5 + cartridge_y
	_cartridge_frame.modulate = Color(1.0, 1.0, 1.0, cartridge_alpha)
	_slot_frame.modulate = Color(1.0, 1.0, 1.0, slot_alpha)
	_powered_overlay.modulate = Color(1.0, 1.0, 1.0, screen_alpha)
	_powered_title.visible = screen_alpha > 0.01
	for index in range(contact_lights.size()):
		contact_lights[index].color = ProtoCompanionTheme.AMBER \
			if index < lit_count else ProtoCompanionTheme.BORDER
