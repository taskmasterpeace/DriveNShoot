## Run INSIDE the exported executable, not the editor. This proves packaging,
## registry availability and the real title -> NEW GAME input path, not that
## all cartridges or the complete game have been playtested.
extends Node

const MAIN_SCENE := "res://proto3d/proto3d.tscn"
const REQUIRED_TEXT: Array[String] = [
	"res://THIRD_PARTY_NOTICES.md", "res://LICENSE",
	"res://third_party/licenses/littlejs-arcade-mit.txt",
	"res://assets/fonts/game_deck/OFL.txt",
	"res://assets/input_icons/ATTRIBUTION.md",
	"res://assets/skins/ATTRIBUTION.md", "res://addons/exit_portal_free/ATTRIBUTION.md",
	"res://addons/dialogue_manager/LICENSE",
	"res://addons/tile_bit_tools/LICENSE", "res://addons/exit_portal_free/LICENSE",
]
const MODELS: Array[String] = ["roadstead_cottage", "parcel_mailbox", "freight_kiosk", "delivery_crate"]
var checks: Array[Dictionary] = []
var failed: int = 0
var output: String = "user://packaged_release_evidence"
var capture_requested: bool = false
var report_written: bool = false


func _check(label: String, condition: bool) -> void:
	checks.append({"name": label, "passed": condition})
	failed += 0 if condition else 1
	print("PACKAGED_RELEASE: %s - %s" % ["PASS" if condition else "FAIL", label])


func _ready() -> void:
	for argument: String in OS.get_cmdline_user_args():
		if argument.begins_with("--output="):
			output = argument.trim_prefix("--output=")
		if argument == "--capture":
			capture_requested = true
	get_tree().create_timer(120.0).timeout.connect(func() -> void:
		_check("packaged acceptance finished before watchdog", false)
		_finish())
	_run.call_deferred()


func _read_json(path: String) -> Dictionary:
	if not FileAccess.file_exists(path):
		return {}
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(path))
	return parsed if parsed is Dictionary else {}


func _run() -> void:
	_check("running the exported template, not the editor", not OS.has_feature("editor"))
	_check("configured launch is the real main game", String(ProjectSettings.get_setting("application/run/main_scene", "")) == MAIN_SCENE)
	_check("evidence directory is writable", DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(output)) == OK)
	for path: String in REQUIRED_TEXT:
		_check("packed notice readable: %s" % path, FileAccess.file_exists(path) and not FileAccess.get_file_as_string(path).strip_edges().is_empty())
	var registry := ProtoGameRegistry.load_catalog()
	_check("all 22 cartridge catalog rows load", registry.rows.size() == 22 and registry.load_warnings.is_empty())
	var enabled: int = 0
	var contract_ok: int = 0
	for id: String in registry.order:
		var row: Dictionary = registry.get_game(id)
		var cover_path := String(row.get("cover_path", ""))
		var cover: Texture2D = load(cover_path) as Texture2D
		_check("imported cartridge cover loads: %s" % id, cover != null and cover.get_width() > 0 and cover.get_height() > 0)
		if registry.enabled(id):
			enabled += 1
		if registry.cartridge_contract_error(id).is_empty():
			contract_ok += 1
	_check("22 cartridge scenes pass availability and notice gates (not playthrough)", enabled == 22)
	_check("22 cartridge scene interfaces instantiate (not playthrough)", contract_ok == 22)
	for source: Dictionary in registry.sources.values():
		for field: String in ["notice_path", "license_path", "content_license_path"]:
			var path := String(source.get(field, ""))
			if not path.is_empty():
				_check("source text packed: %s/%s" % [source["id"], field], FileAccess.file_exists(path) and not FileAccess.get_file_as_string(path).is_empty())
	for model: String in MODELS:
		var path := "res://assets/models/homestead/%s.glb" % model
		var packed := load(path) as PackedScene
		_check("homestead model loads: %s" % model, packed != null)
		if packed != null:
			var instance := packed.instantiate()
			_check("homestead model instantiates: %s" % model, instance is Node3D)
			instance.free()
	var input_rows := _read_json("res://data/input_bindings.json")
	_check("input binding rows packed", (input_rows.get("actions", []) as Array).size() > 20)
	var lighting := _read_json("res://data/world_lighting.json")
	_check("world lighting rows packed", lighting.has("day_sun_energy") and lighting.has("new_moon_ambient"))
	var properties := _read_json("res://data/properties.json")
	_check("three homestead property rows packed", (properties.get("properties", []) as Array).size() == 3)
	var jobs := _read_json("res://data/road_jobs.json")
	_check("three freight job rows packed", (jobs.get("jobs", []) as Array).size() == 3)
	_check("LCD font loads", load("res://assets/ui/fonts/radio_lcd.ttf") is Font)
	_check("Game Deck font loads", load("res://assets/fonts/game_deck/RussoOne-Regular.ttf") is Font)
	# Preserve this observer at the root while SceneTree performs a NORMAL main
	# scene transition. The main scene's current_scene == self front-door gate
	# therefore runs unchanged; no manual ProtoMenu creation or callback bypass.
	get_tree().current_scene = null
	_check("main scene transition accepted", get_tree().change_scene_to_file(MAIN_SCENE) == OK)
	await _frames(12)
	var main: Node = get_tree().current_scene
	_check("normal main scene entered tree", main != null and main.scene_file_path == MAIN_SCENE)
	if main != null:
		_check("real launch opens the title gate", bool(main.get("menu_open")))
		var start := _new_game_button(main)
		_check("real NEW GAME button is visible", start != null and start.is_visible_in_tree())
		if capture_requested:
			await _capture("title")
		if start != null:
			start.grab_focus()
			await _frames(3)
			var press := InputEventKey.new()
			press.keycode = KEY_ENTER
			press.pressed = true
			Input.parse_input_event(press)
			await _frames(3)
			var release := InputEventKey.new()
			release.keycode = KEY_ENTER
			release.pressed = false
			Input.parse_input_event(release)
			await _frames(10)
			_check("NEW GAME keyboard UI input dismisses title", not bool(main.get("menu_open")))
			var objectives: Node = main.get("objectives")
			_check("NEW GAME arms real first-run objectives", objectives != null and bool(objectives.get("active")))
			_check("real Roadstead life system is present", main.get("road_life") != null)
			if capture_requested:
				await _capture("new_game")
	# Obtain exact notices from the engine actually embedded in this executable.
	_write_text("Godot-engine-LICENSE.txt", Engine.get_license_text())
	_write_text("Godot-third-party-copyright.json", JSON.stringify(Engine.get_copyright_info(), "\t"))
	_write_text("Godot-third-party-licenses.json", JSON.stringify(Engine.get_license_info(), "\t"))
	# Orderly teardown belongs to this harness. Do not leave the full live scene
	# for engine shutdown: queued world/audio/render resources need cleanup frames.
	# The intermittent shutdown warning was not reproduced by the verbose probe,
	# so this verifies ownership/lifetime without claiming a specific leaked asset.
	if is_instance_valid(main):
		var main_ref: WeakRef = weakref(main)
		get_tree().current_scene = null
		main.queue_free()
		main = null
		await _frames(4)
		_check("owned main scene freed before shutdown", main_ref.get_ref() == null)
	# Let _run's coroutine locals release before serializing results and quitting.
	_finish.call_deferred()


func _new_game_button(node: Node) -> Button:
	if node is Button and (node as Button).text.contains("NEW GAME"):
		return node as Button
	for child: Node in node.get_children():
		var found := _new_game_button(child)
		if found != null:
			return found
	return null


func _frames(count: int) -> void:
	for i in count:
		await get_tree().process_frame


func _capture(label: String) -> void:
	if DisplayServer.get_name() == "headless":
		_check("%s screenshot requires rendering driver" % label, false)
		return
	await RenderingServer.frame_post_draw
	var image := get_viewport().get_texture().get_image()
	var valid := image != null and not image.is_empty()
	_check("%s real viewport captured" % label, valid and image.save_png(ProjectSettings.globalize_path(output.path_join(label + ".png"))) == OK)


func _write_text(name: String, content: String) -> void:
	var file := FileAccess.open(output.path_join(name), FileAccess.WRITE)
	_check("evidence written: %s" % name, file != null)
	if file != null:
		file.store_string(content)


func _finish() -> void:
	if report_written:
		return
	report_written = true
	var report := {"kind": "local-evaluation-packaged-smoke", "passed": checks.size() - failed,
		"failed": failed, "engine": Engine.get_version_info(), "capture_requested": capture_requested,
		"display_driver": DisplayServer.get_name(), "checks": checks,
		"limitations": "Packaging, scene interfaces and title/New Game UI smoke only; not all-cartridge playthrough, full-game certification, clean-machine testing or redistribution clearance."}
	var file := FileAccess.open(output.path_join("acceptance.json"), FileAccess.WRITE)
	if file != null:
		file.store_string(JSON.stringify(report, "\t"))
	else:
		failed += 1
	print("PACKAGED_RELEASE RESULTS: %d passed, %d failed" % [checks.size() - failed, failed])
	print("PACKAGED_RELEASE: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
