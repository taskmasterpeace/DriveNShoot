## DRIVN: GAME DECK standalone application. This is a thin product flow over
## the canonical deck, cartridges, input router, ledger, and game shell.
class_name ProtoGameDeckCompanion
extends Control

const BOOT := "BOOT"
const SHELF := "SHELF"
const INSPECT := "INSPECT"
const INSERT := "INSERT"
const PLAY := "PLAY"
const EJECT := "EJECT"
const PROMO := "PROMO"
const QUIT := "QUIT"
const BOOT_DURATION := 2.2
const RELEASE_PATH := "res://data/game_deck_companion.json"
const SMOKE_SAVE_PATH := "user://game_deck_companion_smoke.json"

var app_state := BOOT
var release_row: Dictionary = {}
var ui_state: Dictionary = {}
var selected_game_id := ""
var current_seed := 0

var deck: Node
var save_store: RefCounted
var shelf: Control
var inspector: Control
var transition: Control
var shell: CanvasLayer
var boot_layer: Control

var save_path_override := ""
var _boot_elapsed := 0.0
var _boot_progress: ProgressBar
var _seed_nonce := 0
var _pending_launch_ok := false
var _quit_after_eject := false
var _exit_on_quit := true
var _initialized := false
var _smoke_mode := false


static func create(new_save_path_override: String = "") -> Control:
	var script := load("res://proto3d/games/companion/game_deck_companion.gd") as GDScript
	var app: Control = script.new()
	app.set("save_path_override", new_save_path_override)
	return app


func _init() -> void:
	name = "DRIVNGameDeckCompanion"
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)


func _ready() -> void:
	if _initialized:
		return
	_initialized = true
	get_tree().auto_accept_quit = false
	_smoke_mode = _smoke_requested()
	if _smoke_mode and save_path_override == "":
		save_path_override = SMOKE_SAVE_PATH
	_load_release()
	_build_runtime()
	_build_boot()
	app_state = BOOT
	set_process(true)
	if _smoke_mode:
		set_process(false)
		call_deferred("_run_export_smoke")


func _process(delta: float) -> void:
	_advance_boot(delta)


func _advance_boot(delta: float) -> void:
	if app_state != BOOT or delta <= 0.0:
		return
	_boot_elapsed += delta
	if _boot_progress != null:
		_boot_progress.value = clampf(_boot_elapsed / BOOT_DURATION, 0.0, 1.0) * 100.0
	if _boot_elapsed >= BOOT_DURATION:
		open_shelf()


func skip_boot() -> void:
	if app_state == BOOT:
		open_shelf()


func open_shelf(focus_game_id: String = "") -> void:
	if app_state == QUIT:
		return
	boot_layer.visible = false
	inspector.visible = false
	transition.visible = false
	shell.call("hide_for_transition")
	shelf.visible = true
	var filter_id := String(ui_state.get("filter", "all"))
	shelf.call("set_filter", filter_id)
	var restore_id := focus_game_id if focus_game_id != "" \
		else String(ui_state.get("last_game_id", "waste_heap"))
	# Visibility changes take effect at the next GUI pass; restore after that pass
	# so controller focus cannot remain attached to the hidden shell.
	shelf.call_deferred("restore_focus", restore_id)
	app_state = SHELF


func inspect_game(game_id: String) -> bool:
	if app_state not in [SHELF, INSPECT] or not deck.registry.enabled(game_id):
		return false
	var row: Dictionary = deck.registry.get_game(game_id)
	if row.is_empty():
		return false
	selected_game_id = game_id
	ui_state["last_game_id"] = game_id
	shelf.visible = false
	boot_layer.visible = false
	inspector.visible = true
	inspector.call("show_game", row,
		deck.input_router.help_labels(String(row.get("controls_profile", ""))))
	app_state = INSPECT
	return true


func show_promo() -> void:
	if app_state != SHELF:
		return
	shelf.visible = false
	inspector.visible = true
	inspector.call("show_promo", release_row)
	app_state = PROMO


func insert_game(game_id: String) -> bool:
	if app_state != INSPECT or game_id != selected_game_id:
		return false
	var row: Dictionary = deck.registry.get_game(game_id)
	if row.is_empty() or not deck.registry.enabled(game_id):
		return false
	current_seed = _next_seed()
	_pending_launch_ok = false
	inspector.visible = false
	shelf.visible = false
	transition.visible = true
	transition.call("insert", row, _cover_texture(row),
		bool(ui_state.get("reduced_motion", false)))
	app_state = INSERT
	return true


func change_cartridge() -> void:
	if app_state != PLAY or deck.cartridge == null:
		return
	save_now()
	deck.stop("companion_eject")
	shell.call("hide_for_transition")
	transition.visible = true
	transition.call("eject", bool(ui_state.get("reduced_motion", false)))
	app_state = EJECT


func restart_game() -> bool:
	if app_state != PLAY or selected_game_id == "" or deck.cartridge == null:
		return false
	save_now()
	deck.stop("companion_restart")
	var row: Dictionary = deck.registry.get_game(selected_game_id)
	current_seed = _next_seed()
	var opened := bool(shell.call("open_game", selected_game_id,
		_context_for_row(row, current_seed)))
	if opened:
		shell.call("show_after_transition")
		app_state = PLAY
	return opened


func request_quit(exit_tree: bool = true) -> void:
	if app_state == QUIT or _quit_after_eject:
		return
	_exit_on_quit = exit_tree
	if deck != null and deck.cartridge != null:
		save_now()
		deck.stop("companion_quit")
		shell.call("hide_for_transition")
		shelf.visible = false
		inspector.visible = false
		_quit_after_eject = true
		transition.visible = true
		transition.call("eject", bool(ui_state.get("reduced_motion", false)))
		app_state = EJECT
	else:
		_finalize_quit()


func save_now() -> Error:
	if save_store == null or deck == null:
		return ERR_UNCONFIGURED
	if shelf != null:
		ui_state["filter"] = String(shelf.get("current_filter"))
	if selected_game_id != "":
		ui_state["last_game_id"] = selected_game_id
	return int(save_store.call("save_from", deck.ledger, ui_state)) as Error


func snapshot_ui() -> Dictionary:
	return {
		"state": app_state,
		"product_title": String(release_row.get("product_title", "")),
		"selected_game_id": selected_game_id,
		"seed": current_seed,
		"boot_elapsed": _boot_elapsed,
		"boot_visible": boot_layer != null and boot_layer.visible,
		"shelf_visible": shelf != null and shelf.visible,
		"inspector_visible": inspector != null and inspector.visible,
		"transition_visible": transition != null and transition.visible,
		"shell_visible": shell != null and shell.visible,
		"deck_state": deck.state if deck != null else "",
		"save_path": String(save_store.get("path")) if save_store != null else "",
	}


func _build_runtime() -> void:
	deck = ProtoGameDeck.create(self)
	add_child(deck)
	save_store = ProtoCompanionSave.new()
	if save_path_override != "":
		save_store.set("path", save_path_override)
	ui_state = save_store.call("load_into", deck.ledger) as Dictionary

	shelf = ProtoCompanionShelf.new()
	add_child(shelf)
	shelf.call("configure", deck.registry, release_row)
	shelf.call("set_filter", String(ui_state.get("filter", "all")))
	shelf.visible = false
	inspector = ProtoCompanionInspector.new()
	inspector.visible = false
	add_child(inspector)
	transition = ProtoCompanionTransition.new()
	transition.visible = false
	add_child(transition)
	shell = ProtoGameShell.create(deck)
	shell.call("set_companion_mode", true)
	add_child(shell)

	shelf.connect("game_selected", inspect_game)
	shelf.connect("promo_selected", show_promo)
	shelf.connect("quit_requested", request_quit)
	inspector.connect("insert_requested", insert_game)
	inspector.connect("back_requested", open_shelf)
	inspector.connect("follow_requested", _on_follow_requested)
	transition.connect("insert_contact", _on_insert_contact)
	transition.connect("insert_finished", _on_insert_finished)
	transition.connect("eject_finished", _on_eject_finished)
	shell.connect("companion_change_requested", change_cartridge)
	shell.connect("companion_restart_requested", restart_game)
	shell.connect("companion_quit_requested", request_quit)
	deck.connect("result_recorded", _on_result_recorded)


func _build_boot() -> void:
	boot_layer = Control.new()
	boot_layer.name = "CompanionBoot"
	boot_layer.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(boot_layer)
	var background := ColorRect.new()
	background.color = ProtoCompanionTheme.INK
	background.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	boot_layer.add_child(background)
	var horizon := ColorRect.new()
	horizon.color = ProtoCompanionTheme.RUST.darkened(0.38)
	horizon.set_anchors_preset(Control.PRESET_BOTTOM_WIDE)
	horizon.offset_top = -140
	horizon.offset_bottom = 0
	boot_layer.add_child(horizon)
	var center := VBoxContainer.new()
	center.set_anchors_preset(Control.PRESET_CENTER)
	center.offset_left = -430
	center.offset_top = -210
	center.offset_right = 430
	center.offset_bottom = 210
	center.alignment = BoxContainer.ALIGNMENT_CENTER
	center.add_theme_constant_override("separation", 14)
	boot_layer.add_child(center)
	var family := Label.new()
	family.text = "FROM THE WORLD OF DRIVN"
	family.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	family.add_theme_font_size_override("font_size", 16)
	family.add_theme_color_override("font_color", ProtoCompanionTheme.TEAL)
	center.add_child(family)
	var title := Label.new()
	title.text = String(release_row.get("product_title", "DRIVN: GAME DECK"))
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_font_size_override("font_size", 58)
	title.add_theme_color_override("font_color", ProtoCompanionTheme.AMBER)
	center.add_child(title)
	var subtitle := Label.new()
	subtitle.text = "%s // %s" % [String(release_row.get("subtitle", "A DRIVN COMPANION")),
		String(release_row.get("version", ""))]
	subtitle.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	subtitle.add_theme_font_size_override("font_size", 17)
	subtitle.add_theme_color_override("font_color", ProtoCompanionTheme.BONE)
	center.add_child(subtitle)
	var rule := HSeparator.new()
	rule.custom_minimum_size = Vector2(0, 12)
	rule.add_theme_color_override("separator", ProtoCompanionTheme.RUST)
	center.add_child(rule)
	var catalog := Label.new()
	catalog.text = "22 CARTRIDGES // 10 HANDHELD // 12 CONSOLE // SINGLE PLAYER"
	catalog.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	catalog.add_theme_font_size_override("font_size", 15)
	catalog.add_theme_color_override("font_color", ProtoCompanionTheme.BONE.darkened(0.16))
	center.add_child(catalog)
	_boot_progress = ProgressBar.new()
	_boot_progress.min_value = 0.0
	_boot_progress.max_value = 100.0
	_boot_progress.value = 0.0
	_boot_progress.show_percentage = false
	_boot_progress.custom_minimum_size = Vector2(0, 8)
	center.add_child(_boot_progress)
	var prompt := Label.new()
	prompt.text = "PRESS ANY KEY / BUTTON TO OPEN THE SHELF"
	prompt.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	prompt.add_theme_font_size_override("font_size", 13)
	prompt.add_theme_color_override("font_color", ProtoCompanionTheme.TEAL)
	center.add_child(prompt)


func _load_release() -> void:
	var parser := JSON.new()
	if parser.parse(FileAccess.get_file_as_string(RELEASE_PATH)) == OK \
			and parser.data is Dictionary:
		release_row = (parser.data as Dictionary).duplicate(true)
	else:
		release_row = {"product_title": "DRIVN: GAME DECK",
			"subtitle": "A DRIVN COMPANION", "version": "UNVERSIONED", "promo": {}}


func _on_insert_contact() -> void:
	if app_state != INSERT or selected_game_id == "":
		return
	var row: Dictionary = deck.registry.get_game(selected_game_id)
	_pending_launch_ok = bool(shell.call("open_game", selected_game_id,
		_context_for_row(row, current_seed)))
	shell.call("hide_for_transition")


func _on_insert_finished() -> void:
	if app_state != INSERT:
		return
	ui_state["seen_insert"] = true
	transition.visible = false
	if _pending_launch_ok:
		shell.call("show_after_transition")
		app_state = PLAY
	else:
		open_shelf(selected_game_id)


func _on_eject_finished() -> void:
	transition.visible = false
	if _quit_after_eject:
		_finalize_quit()
	else:
		open_shelf(selected_game_id)


func _on_result_recorded(_result: Dictionary) -> void:
	save_now()


func _on_follow_requested(url: String) -> void:
	if url.begins_with("https://"):
		OS.shell_open(url)


func _context_for_row(row: Dictionary, seed_value: int) -> Dictionary:
	var console := String(row.get("platform", "")) == "console"
	var players: Dictionary = row.get("players", {}) as Dictionary
	return {
		"source": "companion",
		"device": String(row.get("platform", "")),
		"auto_start": true,
		"seed": seed_value,
		"session_id": "companion:%s:%d" % [String(row.get("id", "game")), seed_value],
		"online": false,
		"spectator": false,
		"bots_enabled": console,
		"actor_count": int(players.get("max", 1)) if console else 1,
		"seats": [{"seat": 0, "device": -1, "profile_id": "companion-local",
			"name": "RIDER"}],
	}


func _cover_texture(row: Dictionary) -> Texture2D:
	var path := String(row.get("cover_path", ""))
	return load(path) as Texture2D if path != "" and ResourceLoader.exists(path) else null


func _next_seed() -> int:
	_seed_nonce += 1
	var candidate := absi(int(hash("%s:%d:%d" % [selected_game_id,
		Time.get_ticks_usec(), _seed_nonce])))
	if candidate == current_seed:
		candidate += _seed_nonce + 1
	return maxi(1, candidate)


func _smoke_requested() -> bool:
	return OS.get_cmdline_args().has("--companion-smoke") \
		or OS.get_cmdline_user_args().has("--companion-smoke")


func _run_export_smoke() -> void:
	var failures: Array[String] = []
	_smoke_check(failures, "companion release data loaded",
		String(release_row.get("product_title", "")) == "DRIVN: GAME DECK")
	_smoke_check(failures, "smoke persistence is isolated",
		String(save_store.get("path")) == SMOKE_SAVE_PATH)
	var packed_covers_ok: bool = deck.registry.order.size() == 22
	for game_id_value in deck.registry.order:
		var cover_path := String(deck.registry.get_game(String(game_id_value)).get(
			"cover_path", ""))
		packed_covers_ok = packed_covers_ok and ResourceLoader.exists(cover_path) \
			and load(cover_path) is Texture2D
	_smoke_check(failures, "all twenty-two packed cover textures resolve",
		packed_covers_ok)
	skip_boot()
	_smoke_check(failures, "boot reaches shelf", app_state == SHELF)

	var handheld_ok := inspect_game("waste_heap") and insert_game("waste_heap")
	_smoke_check(failures, "handheld cartridge accepted", handheld_ok)
	if handheld_ok:
		transition.call("_advance", 0.63)
		transition.call("_advance", 0.53)
		_smoke_check(failures, "handheld launches through cartridge contact",
			app_state == PLAY and deck.state == ProtoGameDeck.STATE_PLAYING
			and String(deck.current_row.get("id", "")) == "waste_heap")
		_smoke_check(failures, "handheld remains one human with no bot fill",
			deck.active_seats.size() == 1
			and not bool(deck.current_context.get("bots_enabled", true))
			and int(deck.current_context.get("actor_count", 0)) == 1
			and deck.cartridge != null
			and int(deck.cartridge.get("participant_total")) == 1)
		change_cartridge()
		transition.call("_advance", 0.56)
		_smoke_check(failures, "handheld eject restores shelf", app_state == SHELF)

	var console_ok := inspect_game("rust_runners") and insert_game("rust_runners")
	_smoke_check(failures, "console cartridge accepted", console_ok)
	if console_ok:
		transition.call("_advance", 0.63)
		transition.call("_advance", 0.53)
		_smoke_check(failures, "console launches through cartridge contact",
			app_state == PLAY and deck.state == ProtoGameDeck.STATE_PLAYING
			and String(deck.current_row.get("id", "")) == "rust_runners")
		_smoke_check(failures, "console fills the stock eight-rider field with AI",
			deck.active_seats.size() == 1
			and bool(deck.current_context.get("bots_enabled", false))
			and int(deck.current_context.get("actor_count", 0)) == 8
			and deck.cartridge != null
			and int(deck.cartridge.get("participant_total")) == 8)
		change_cartridge()
		transition.call("_advance", 0.56)
		_smoke_check(failures, "console eject restores shelf", app_state == SHELF)

	var save_error := save_now()
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(SMOKE_SAVE_PATH)) \
		if save_error == OK and FileAccess.file_exists(SMOKE_SAVE_PATH) else null
	var envelope := parsed as Dictionary if parsed is Dictionary else {}
	var smoke_ui: Dictionary = envelope.get("ui", {}) as Dictionary
	_smoke_check(failures, "dedicated companion envelope saves cleanly",
		save_error == OK and int(envelope.get("schema", 0)) == ProtoCompanionSave.SCHEMA
		and envelope.get("ledger", null) is Dictionary
		and bool(smoke_ui.get("seen_insert", false))
		and String(smoke_ui.get("last_game_id", "")) == "rust_runners")

	if deck.cartridge != null:
		deck.stop("export_smoke_complete")
	_cleanup_smoke_files()
	get_tree().auto_accept_quit = true
	if failures.is_empty():
		print("GAME_DECK_COMPANION_SMOKE: PASS - handheld, console AI, eject, and save")
		get_tree().quit(0)
	else:
		print("GAME_DECK_COMPANION_SMOKE: FAIL - %s" % " | ".join(failures))
		get_tree().quit(1)


func _smoke_check(failures: Array[String], label: String, ok: bool) -> void:
	print("GAME_DECK_COMPANION_SMOKE: %s - %s" % ["PASS" if ok else "FAIL", label])
	if not ok:
		failures.append(label)


func _cleanup_smoke_files() -> void:
	for candidate in [SMOKE_SAVE_PATH, SMOKE_SAVE_PATH + ".tmp"]:
		if FileAccess.file_exists(candidate):
			DirAccess.remove_absolute(ProjectSettings.globalize_path(candidate))


func _finalize_quit() -> void:
	save_now()
	_quit_after_eject = false
	app_state = QUIT
	boot_layer.visible = false
	shelf.visible = false
	inspector.visible = false
	transition.visible = false
	shell.call("hide_for_transition")
	if _exit_on_quit:
		get_tree().call_deferred("quit")


func _unhandled_input(event: InputEvent) -> void:
	if not event.is_pressed():
		return
	if app_state == BOOT:
		skip_boot()
		get_viewport().set_input_as_handled()
	elif app_state == INSERT:
		transition.call("skip_after_contact")
		get_viewport().set_input_as_handled()
	elif app_state in [INSPECT, PROMO] and event is InputEventKey \
			and (event as InputEventKey).physical_keycode == KEY_ESCAPE:
		open_shelf(selected_game_id)
		get_viewport().set_input_as_handled()


func _notification(what: int) -> void:
	if what == NOTIFICATION_WM_CLOSE_REQUEST and _initialized:
		request_quit(true)
