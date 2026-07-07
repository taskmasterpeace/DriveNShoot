## Proof for the TV VOLUME SLIDER (media_panel.gd — control_gallery goal). Builds the real
## TV panel, verifies the HSlider drives the set's volume_db and round-trips through
## settings.json. Backs up + restores user://settings.json (test-standards).
## Run: godot --headless --path game res://proto3d/tests/tv_volume_sim.tscn
extends Node

var passed := 0
var failed := 0
const SP := "user://settings.json"
var _backup: String = ""
var _had_backup := false


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("TVVOL: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _restore() -> void:
	if _had_backup:
		var f := FileAccess.open(SP, FileAccess.WRITE)
		if f != null:
			f.store_string(_backup); f.close()
	elif FileAccess.file_exists(SP):
		DirAccess.remove_absolute(ProjectSettings.globalize_path(SP))


func _ready() -> void:
	if FileAccess.file_exists(SP):
		_had_backup = true
		_backup = FileAccess.get_file_as_string(SP)

	var main := Node.new()
	add_child(main)
	var panel := ProtoMediaPanel.create(main)
	add_child(panel)

	# The slider exists, spans 0–100, and lives on the set.
	_check("TV panel has a volume HSlider", panel._vol_slider is HSlider)
	_check("slider spans 0–100", panel._vol_slider.min_value == 0.0 and panel._vol_slider.max_value == 100.0)
	_check("has a VideoStreamPlayer to drive", panel._video is VideoStreamPlayer)

	# Moving the slider sets the set's volume_db (via the pct→dB curve).
	panel._vol_slider.value = 35.0
	panel._apply_tv_volume()
	_check("slider drives volume_db (35%% → %.2f dB)" % panel._video.volume_db,
		absf(panel._video.volume_db - panel._pct_to_db(35)) < 0.01)
	_check("0%% is silence (−60 dB floor)", panel._pct_to_db(0) == -60.0)
	_check("100%% is 0 dB (full)", absf(panel._pct_to_db(100)) < 0.01)

	# Persist + round-trip through settings.json.
	ProtoMediaPanel._save_tv_volume(35)
	_check("saved value stored in the static", ProtoMediaPanel.tv_volume_pct == 35)
	ProtoMediaPanel.tv_volume_pct = -1                       # force a fresh load
	_check("reloads 35 from settings.json", ProtoMediaPanel._tv_volume() == 35)

	# Saving TV volume must NOT clobber other settings.json keys (options sliders).
	var f := FileAccess.open(SP, FileAccess.WRITE)
	f.store_string(JSON.stringify({"master_volume": 70, "tv_volume": 50}, "  ")); f.close()
	ProtoMediaPanel.tv_volume_pct = -1
	ProtoMediaPanel._save_tv_volume(42)
	var d: Variant = JSON.parse_string(FileAccess.get_file_as_string(SP))
	_check("merge keeps other keys (master_volume survives)", d is Dictionary and int((d as Dictionary).get("master_volume", -1)) == 70)
	_check("merge wrote the new tv_volume 42", int((d as Dictionary).get("tv_volume", -1)) == 42)

	_restore()
	print("TVVOL: DONE — %d passed, %d failed" % [passed, failed])
	get_tree().quit(1 if failed > 0 else 0)
