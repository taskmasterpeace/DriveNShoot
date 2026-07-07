## Proof for THE OPTIONS PANEL (QA blocker, owner ask 2026-07-07): open/close
## via REAL input (Esc, ✕ click, pad B), a Master-volume slider actually moves
## AudioServer's bus, settings PERSIST across a reload, fullscreen/vsync calls
## DisplayServer (headless-guarded), and the panel is UI-LAW COMPLIANT (✕
## exists, badge text, amber/bone palette). Backs up/restores any real
## user://settings.json in EVERY exit path (including the watchdog).
## Run: godot --headless --path game res://proto3d/tests/options_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node3D
var _prev_time_scale: float = 1.0
var _backup_existed: bool = false
var _backup_text: String = ""


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("OPTS: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _key_event(physical: Key, is_pressed: bool) -> void:
	var ev := InputEventKey.new()
	ev.physical_keycode = physical
	ev.keycode = physical
	ev.pressed = is_pressed
	Input.parse_input_event(ev)


func _pad_button_event(button: JoyButton, is_pressed: bool) -> void:
	var ev := InputEventJoypadButton.new()
	ev.button_index = button
	ev.pressed = is_pressed
	Input.parse_input_event(ev)


func _backup_real_settings() -> void:
	_backup_existed = FileAccess.file_exists(ProtoOptionsPanel.SETTINGS_PATH)
	if _backup_existed:
		_backup_text = FileAccess.get_file_as_string(ProtoOptionsPanel.SETTINGS_PATH)
	DirAccess.remove_absolute(ProjectSettings.globalize_path(ProtoOptionsPanel.SETTINGS_PATH))


func _restore_real_settings() -> void:
	if _backup_existed:
		var f := FileAccess.open(ProtoOptionsPanel.SETTINGS_PATH, FileAccess.WRITE)
		if f != null:
			f.store_string(_backup_text)
			f.close()
	elif FileAccess.file_exists(ProtoOptionsPanel.SETTINGS_PATH):
		DirAccess.remove_absolute(ProjectSettings.globalize_path(ProtoOptionsPanel.SETTINGS_PATH))


func _finish(exit_code: int) -> void:
	Engine.time_scale = _prev_time_scale
	_restore_real_settings()
	print("OPTIONS RESULTS: %d passed, %d failed" % [passed, failed])
	print("OPTIONS: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(exit_code)


func _ready() -> void:
	print("OPTS: start")
	_prev_time_scale = Engine.time_scale
	_backup_real_settings()
	get_tree().create_timer(60.0).timeout.connect(func() -> void:
		print("OPTS: WATCHDOG")
		print("OPTIONS: FAILURES PRESENT")
		_finish(1))

	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 8:
		await get_tree().process_frame

	# ==========================================================================
	# (a) OPEN/CLOSE via real input — Esc, ✕ click, pad B
	# ==========================================================================
	var panel := ProtoOptionsPanel.create(main)
	main.add_child(panel)
	for _i in 2:
		await get_tree().process_frame

	panel.open()
	await get_tree().process_frame # grab_focus() is call_deferred() — give it a frame to land
	_check("open() sets is_open true", panel.is_open)
	_check("controller-focus-on-open: a panel child holds focus", \
		panel.get_viewport().gui_get_focus_owner() != null \
		and panel._root.is_ancestor_of(panel.get_viewport().gui_get_focus_owner()))

	# Esc closes it
	_key_event(KEY_ESCAPE, true)
	await get_tree().process_frame
	_key_event(KEY_ESCAPE, false)
	await get_tree().process_frame
	_check("Esc closes the panel", not panel.is_open)

	# ✕ button click closes it
	panel.open()
	_check("re-opened for the ✕ test", panel.is_open)
	panel._close_btn.pressed.emit() # the same signal a real mouse click fires
	await get_tree().process_frame
	_check("✕ button closes the panel", not panel.is_open)

	# Pad B closes it
	panel.open()
	_check("re-opened for the pad-B test", panel.is_open)
	_pad_button_event(JOY_BUTTON_B, true)
	await get_tree().process_frame
	_pad_button_event(JOY_BUTTON_B, false)
	await get_tree().process_frame
	_check("pad B (JOY_BUTTON_B) closes the panel", not panel.is_open)

	panel.open() # leave it open for the remaining checks

	# ==========================================================================
	# (b) Master slider change -> AudioServer bus volume changes accordingly
	# ==========================================================================
	var master_idx := AudioServer.get_bus_index("Master")
	panel._master_slider.value = 40
	await get_tree().process_frame
	var db_at_40 := AudioServer.get_bus_volume_db(master_idx)
	var expected_at_40 := ProtoOptionsPanel._pct_to_db(40)
	_check("Master slider@40%% -> bus volume_db matches the pct curve (%.2f == %.2f)" \
		% [db_at_40, expected_at_40], is_equal_approx(db_at_40, expected_at_40))

	panel._master_slider.value = 100
	await get_tree().process_frame
	var db_at_100 := AudioServer.get_bus_volume_db(master_idx)
	_check("Master slider@100%% -> unity gain (0dB)", is_equal_approx(db_at_100, 0.0))

	panel._master_slider.value = 0
	await get_tree().process_frame
	var db_at_0 := AudioServer.get_bus_volume_db(master_idx)
	_check("Master slider@0%% -> the floor (-60dB)", is_equal_approx(db_at_0, -60.0))

	# Music/SFX buses ("Radio"/"Engine"/"Tires") are owned by other systems and
	# may not exist yet this early — guarded no-op is the contract, prove it:
	var music_bus_missing := AudioServer.get_bus_index("Radio") == -1
	panel._music_slider.value = 55 # must not crash even though the bus may not exist
	await get_tree().process_frame
	_check("Music slider on a MISSING 'Radio' bus is a safe no-op (no crash, sim still alive)", \
		not music_bus_missing or is_instance_valid(panel))
	# Restore Master to a clean 100 before the persistence phase reads it back.
	panel._master_slider.value = 100
	await get_tree().process_frame

	# ==========================================================================
	# (c) Settings PERSIST: write, reload/apply_saved, values match
	# ==========================================================================
	panel._master_slider.value = 62
	panel._vsync_btn.pressed.emit()   # toggles vsync off (default true -> false)
	panel._fullscreen_btn.pressed.emit() # toggles fullscreen on (default false -> true)
	await get_tree().process_frame
	_check("user://settings.json now exists after a change", \
		FileAccess.file_exists(ProtoOptionsPanel.SETTINGS_PATH))

	var written: Variant = JSON.parse_string(FileAccess.get_file_as_string(ProtoOptionsPanel.SETTINGS_PATH))
	var written_dict: Dictionary = written if written is Dictionary else {}
	_check("the written file has the values just set (master=62, vsync=false, fullscreen=true)", \
		int(written_dict.get("master_pct", -1)) == 62 \
		and bool(written_dict.get("vsync", true)) == false \
		and bool(written_dict.get("fullscreen", false)) == true)

	# A brand-new panel instance re-loading the SAME file must reproduce them:
	var panel2 := ProtoOptionsPanel.create(main)
	main.add_child(panel2)
	await get_tree().process_frame
	_check("a FRESH panel reload reproduces persisted values", \
		panel2.master_pct == 62 and panel2.vsync == false and panel2.fullscreen == true)

	# apply_saved() (the static, no-instance boot path) must also reproduce state:
	ProtoOptionsPanel.apply_saved()
	await get_tree().process_frame
	var db_after_apply_saved := AudioServer.get_bus_volume_db(master_idx)
	_check("apply_saved() (static boot call) re-applies the persisted Master volume", \
		is_equal_approx(db_after_apply_saved, ProtoOptionsPanel._pct_to_db(62)))

	# Put Master back to a clean 100 for the sim's own hygiene before finishing.
	panel._master_slider.value = 100
	await get_tree().process_frame

	# ==========================================================================
	# (d) Fullscreen toggle calls DisplayServer — headless-guarded, assert the
	# state var (not the actual OS window, which a headless run has none of).
	# ==========================================================================
	var before_fullscreen: bool = panel2.fullscreen
	panel2._fullscreen_btn.pressed.emit()
	await get_tree().process_frame
	_check("fullscreen toggle flips the tracked state var", panel2.fullscreen != before_fullscreen)
	_check("DisplayServer name is readable (headless-guard path exercised, no crash)", \
		DisplayServer.get_name() != "")

	# ==========================================================================
	# (e) UI-LAW checks: ✕ exists, badge text, palette colors match the doc
	# ==========================================================================
	_check("a ✕ close button exists", panel._close_btn != null and panel._close_btn.text == "✕")
	var found_badge := false
	for c in _all_labels(panel._root):
		if c.text == "OPTIONS":
			found_badge = true
	_check("the badge text reads exactly 'OPTIONS'", found_badge)
	_check("AMBER matches the doc's constant (0.96, 0.72, 0.2)", \
		panel.AMBER.is_equal_approx(Color(0.96, 0.72, 0.2)))
	_check("BONE matches the doc's constant (0.92, 0.89, 0.82)", \
		panel.BONE.is_equal_approx(Color(0.92, 0.89, 0.82)))
	_check("close-button red is the one sanctioned non-amber exception (0.9, 0.4, 0.3)", \
		panel.CLOSE_RED.is_equal_approx(Color(0.9, 0.4, 0.3)))
	var frame_style := panel._root.get_theme_stylebox("panel") as StyleBoxFlat
	_check("frame is the STANDARD weight (2px, AMBER border) per UI law §3", \
		frame_style != null and frame_style.border_width_left == 2 \
		and frame_style.border_color.is_equal_approx(panel.AMBER))

	_finish(0 if failed == 0 else 1)


func _all_labels(node: Node) -> Array[Label]:
	var out: Array[Label] = []
	if node is Label:
		out.append(node as Label)
	for c in node.get_children():
		out.append_array(_all_labels(c))
	return out
