## THE OPTIONS PANEL (QA blocker, owner ask 2026-07-07): the game shipped with
## ZERO settings surface — no fullscreen toggle, no volume control — the #1
## negative-review trigger on Steam. Self-contained like controls_panel.gd:
## DISPLAY (fullscreen/windowed, vsync) + AUDIO (Master/Music/SFX 0-100%
## sliders onto AudioServer bus volume_db). Persists to user://settings.json;
## `apply_saved()` is a STATIC call with no panel instance needed, so the
## title screen (menu.gd) can apply saved settings before any UI exists.
##
## Bus scoping (read before touching): only buses OTHER systems already made
## idempotently are faded here — this panel creates NO new bus.
##   Master — always exists (Godot default). Most one-shot SFX (gunfire,
##            impacts, UI blips via ProtoAudio.play_at/play_ui) live here.
##   Music  — maps onto the "Radio" bus (music.gd, ProtoMusic._ensure_bus).
##            Owned entirely by music.gd (it carries the muffle low-pass
##            filter at effect slot 0) — this panel only calls
##            set_bus_volume_db on it, never touches the effect chain or
##            any player. Guarded: no-op if the bus doesn't exist yet
##            (e.g. before a ProtoMusic instance has ever been created).
##   SFX    — maps onto BOTH "Engine" and "Tires" (audio.gd,
##            ProtoAudio.ensure_buses) — the closest existing "vehicle SFX"
##            grouping. NOT a universal SFX-isolation bus: most gunfire/
##            impact/UI one-shots stay on Master and are covered by the
##            Master slider instead. Documented here rather than implied.
## Guard note: all three sliders check get_bus_index(...) != -1 before
## writing, so a headless sim or a boot moment before ProtoAudio/ProtoMusic
## exist never errors.
##
## Pause-menu hook (NOT built this pass — title-menu access only, per owner
## scope): wiring this into in-game play would be a single line in
## proto3d.gd's _unhandled_input, mirroring the existing controls_panel
## block (see toggle_controls_panel + its priority-chain entry):
##   if options_panel != null and options_panel.is_open:
##       if event.is_action_pressed("drivn_options"): toggle_options_panel()
##       return
## plus a `toggle_options_panel()` method identical in shape to
## `toggle_controls_panel()`. Left undone because proto3d.gd is heavily
## contended this pass — flagging so whoever adds a real in-game pause menu
## doesn't have to re-derive this.
class_name ProtoOptionsPanel
extends CanvasLayer

const AMBER := Color(0.96, 0.72, 0.2)
const BONE := Color(0.92, 0.89, 0.82)
const DIM := Color(0.55, 0.52, 0.46)
const CLOSE_RED := Color(0.9, 0.4, 0.3) ## the one sanctioned non-amber accent (UI law §7)

const SETTINGS_PATH := "user://settings.json"

## Bus names this panel fades — never created here, only read/guarded.
const BUS_MASTER := "Master"
const BUS_MUSIC := "Radio"   ## owned by music.gd
const BUS_SFX_A := "Engine"  ## owned by audio.gd
const BUS_SFX_B := "Tires"   ## owned by audio.gd

## In-code defaults — used when user://settings.json doesn't exist yet.
const DEFAULT_SETTINGS: Dictionary = {
	"fullscreen": false,
	"vsync": true,
	"master_pct": 100,
	"music_pct": 70,
	"sfx_pct": 100,
}

var is_open: bool = false
var _main: Node = null
var _root: PanelContainer
var _fullscreen_btn: Button
var _vsync_btn: Button
var _master_slider: HSlider
var _music_slider: HSlider
var _sfx_slider: HSlider
var _master_label: Label
var _music_label: Label
var _sfx_label: Label
var _close_btn: Button

## Live settings mirror (sim hook: read these instead of re-parsing the file).
var fullscreen: bool = false
var vsync: bool = true
var master_pct: int = 100
var music_pct: int = 70
var sfx_pct: int = 100


static func create(main: Node) -> ProtoOptionsPanel:
	var p := ProtoOptionsPanel.new()
	p._main = main
	p.layer = 7 # above HUD(2)/controls_panel(5), below menu.gd's title(8) that opens it
	p._build()
	p._load_settings()
	p._apply_all()
	p.close() # built hidden; the caller opens it
	return p


## STATIC — no panel instance required. Call once at boot (menu.gd's _build,
## or proto3d.gd's _ready as the documented in-game alternative) so a saved
## fullscreen/vsync/volume choice is live before the player sees anything.
static func apply_saved() -> void:
	var settings := _read_settings_file()
	_apply_display(bool(settings.get("fullscreen", false)), bool(settings.get("vsync", true)))
	_apply_audio_bus(BUS_MASTER, int(settings.get("master_pct", 100)))
	_apply_audio_bus(BUS_MUSIC, int(settings.get("music_pct", 70)))
	_apply_audio_bus(BUS_SFX_A, int(settings.get("sfx_pct", 100)))
	_apply_audio_bus(BUS_SFX_B, int(settings.get("sfx_pct", 100)))


static func _read_settings_file() -> Dictionary:
	if not FileAccess.file_exists(SETTINGS_PATH):
		return DEFAULT_SETTINGS.duplicate()
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(SETTINGS_PATH))
	if parsed is Dictionary:
		var out: Dictionary = DEFAULT_SETTINGS.duplicate()
		for k in (parsed as Dictionary).keys():
			out[k] = (parsed as Dictionary)[k]
		return out
	return DEFAULT_SETTINGS.duplicate()


## Headless-safe: DisplayServer calls are guarded by checking we're not in a
## null/degenerate window backend (sims still run under a real (if hidden)
## window in this project's headless mode, so the call itself is safe — this
## guard is about not crashing if a future CI truly has no display server).
static func _apply_display(want_fullscreen: bool, want_vsync: bool) -> void:
	if DisplayServer.get_name() == "headless":
		return # nothing to toggle — sim asserts against the settings dict instead
	var mode := DisplayServer.WINDOW_MODE_FULLSCREEN if want_fullscreen else DisplayServer.WINDOW_MODE_WINDOWED
	DisplayServer.window_set_mode(mode)
	var vsync_mode := DisplayServer.VSYNC_ENABLED if want_vsync else DisplayServer.VSYNC_DISABLED
	DisplayServer.window_set_vsync_mode(vsync_mode)


static func _apply_audio_bus(bus_name: String, pct: int) -> void:
	var idx := AudioServer.get_bus_index(bus_name)
	if idx == -1:
		return # that system hasn't created its bus yet (or never will) — safe no-op
	AudioServer.set_bus_volume_db(idx, _pct_to_db(clampi(pct, 0, 100)))


## 100% -> 0dB (unity, present). 0% -> -60dB (off in all but name — matches
## music.gd's own _apply_volume floor so the two sliders feel consistent).
static func _pct_to_db(pct: int) -> float:
	return lerpf(-60.0, 0.0, float(pct) / 100.0)


func _build() -> void:
	_root = PanelContainer.new()
	_root.set_anchors_preset(Control.PRESET_CENTER)
	var vp := get_viewport().get_visible_rect().size if get_viewport() != null else Vector2(1280, 800)
	var w: float = minf(520.0, vp.x - 80.0)
	var h: float = minf(420.0, vp.y - 80.0)
	_root.offset_left = -w * 0.5
	_root.offset_right = w * 0.5
	_root.offset_top = -h * 0.5
	_root.offset_bottom = h * 0.5
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.09, 0.08, 0.06, 0.97) # standard-panel bg (UI law §3)
	style.border_color = AMBER
	style.set_border_width_all(2)
	style.set_corner_radius_all(6)
	style.set_content_margin_all(14)
	_root.add_theme_stylebox_override("panel", style)
	add_child(_root)

	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 10)
	_root.add_child(v)

	# --- Header: title + badge + close ------------------------------------
	var header := HBoxContainer.new()
	header.add_theme_constant_override("separation", 8)
	v.add_child(header)
	var title := Label.new()
	title.text = "⚙  OPTIONS"
	title.add_theme_font_override("font", ProtoHUD.mixed_font())
	title.add_theme_font_size_override("font_size", 22)
	title.add_theme_color_override("font_color", AMBER)
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header.add_child(title)

	# The badge chip (UI law §4). OPTIONS has no natural INDEX — NAME pair to
	# enumerate (unlike a channel or a bay), so this is the documented
	# exception: a single-word state chip in the same visual spec.
	var badge := PanelContainer.new()
	var bstyle := StyleBoxFlat.new()
	bstyle.bg_color = Color(0.15, 0.13, 0.08)
	bstyle.border_color = AMBER
	bstyle.set_border_width_all(2)
	bstyle.set_corner_radius_all(4)
	bstyle.set_content_margin_all(8)
	badge.add_theme_stylebox_override("panel", bstyle)
	var badge_lbl := Label.new()
	badge_lbl.text = "OPTIONS"
	badge_lbl.add_theme_font_override("font", ProtoHUD.mixed_font())
	badge_lbl.add_theme_font_size_override("font_size", 20)
	badge_lbl.add_theme_color_override("font_color", AMBER)
	badge.add_child(badge_lbl)
	header.add_child(badge)

	_close_btn = Button.new()
	_close_btn.text = "✕"
	_close_btn.add_theme_font_override("font", ProtoHUD.mixed_font())
	_close_btn.add_theme_font_size_override("font_size", 20)
	_close_btn.add_theme_color_override("font_color", CLOSE_RED)
	_close_btn.custom_minimum_size = Vector2(36, 36)
	_close_btn.pressed.connect(func() -> void: close())
	header.add_child(_close_btn)

	v.add_child(HSeparator.new())

	# --- DISPLAY section ----------------------------------------------------
	v.add_child(_section_label("— DISPLAY —"))
	var disp_row := HBoxContainer.new()
	disp_row.add_theme_constant_override("separation", 10)
	v.add_child(disp_row)
	_fullscreen_btn = _mk_toggle_button("")
	_fullscreen_btn.pressed.connect(func() -> void: _on_fullscreen_pressed())
	disp_row.add_child(_fullscreen_btn)
	_vsync_btn = _mk_toggle_button("")
	_vsync_btn.pressed.connect(func() -> void: _on_vsync_pressed())
	disp_row.add_child(_vsync_btn)

	v.add_child(HSeparator.new())

	# --- AUDIO section -------------------------------------------------------
	v.add_child(_section_label("— AUDIO —"))
	var slider_box := VBoxContainer.new()
	slider_box.add_theme_constant_override("separation", 8)
	v.add_child(slider_box)
	var m := _mk_slider_row(slider_box, "MASTER")
	_master_slider = m[0] as HSlider
	_master_label = m[1] as Label
	_master_slider.value_changed.connect(func(val: float) -> void: _on_master_changed(int(val)))
	var mu := _mk_slider_row(slider_box, "MUSIC")
	_music_slider = mu[0] as HSlider
	_music_label = mu[1] as Label
	_music_slider.value_changed.connect(func(val: float) -> void: _on_music_changed(int(val)))
	var sf := _mk_slider_row(slider_box, "SFX")
	_sfx_slider = sf[0] as HSlider
	_sfx_label = sf[1] as Label
	_sfx_slider.value_changed.connect(func(val: float) -> void: _on_sfx_changed(int(val)))

	var hint := Label.new()
	hint.text = "Close (Esc / B) · settings apply live and save automatically"
	hint.add_theme_font_override("font", ProtoHUD.mixed_font())
	hint.add_theme_font_size_override("font_size", 13)
	hint.add_theme_color_override("font_color", DIM)
	hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(hint)


func _section_label(text: String) -> Label:
	var l := Label.new()
	l.text = text
	l.add_theme_font_override("font", ProtoHUD.mixed_font())
	l.add_theme_font_size_override("font_size", 15)
	l.add_theme_color_override("font_color", AMBER)
	return l


func _mk_toggle_button(text: String) -> Button:
	var b := Button.new()
	b.text = text
	b.add_theme_font_override("font", ProtoHUD.mixed_font())
	b.add_theme_font_size_override("font_size", 15)
	b.custom_minimum_size = Vector2(230, 40)
	return b


## Returns [HSlider, Label] and adds the row (label + slider + %-readout) to parent.
func _mk_slider_row(parent: VBoxContainer, row_name: String) -> Array:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 10)
	parent.add_child(row)
	var name_lbl := Label.new()
	name_lbl.text = row_name
	name_lbl.add_theme_font_override("font", ProtoHUD.mixed_font())
	name_lbl.add_theme_font_size_override("font_size", 15)
	name_lbl.add_theme_color_override("font_color", BONE)
	name_lbl.custom_minimum_size = Vector2(90, 0)
	row.add_child(name_lbl)
	var slider := HSlider.new()
	slider.min_value = 0
	slider.max_value = 100
	slider.step = 1
	slider.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	slider.focus_mode = Control.FOCUS_ALL
	row.add_child(slider)
	var pct_lbl := Label.new()
	pct_lbl.add_theme_font_override("font", ProtoHUD.mixed_font())
	pct_lbl.add_theme_font_size_override("font_size", 15)
	pct_lbl.add_theme_color_override("font_color", BONE)
	pct_lbl.custom_minimum_size = Vector2(48, 0)
	pct_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	row.add_child(pct_lbl)
	return [slider, pct_lbl]


func open() -> void:
	is_open = true
	visible = true
	_refresh_controls()
	if _fullscreen_btn != null:
		_fullscreen_btn.grab_focus.call_deferred() # controller-focus-on-open (UI law §Edge Cases)


func close() -> void:
	is_open = false
	visible = false


func toggle() -> void:
	if is_open:
		close()
	else:
		open()


## Raw hardware close (UI law §7): ✕ wired above, Esc, and pad B — mirrors
## media_panel.gd's exact block since this panel isn't threaded into
## proto3d.gd's _unhandled_input priority chain this pass.
func _input(event: InputEvent) -> void:
	if not is_open:
		return
	if event is InputEventKey and (event as InputEventKey).pressed and not (event as InputEventKey).echo \
			and (event as InputEventKey).physical_keycode == KEY_ESCAPE:
		get_viewport().set_input_as_handled()
		close()
		return
	if event is InputEventJoypadButton and (event as InputEventJoypadButton).pressed \
			and (event as InputEventJoypadButton).button_index == JOY_BUTTON_B:
		get_viewport().set_input_as_handled()
		close()
		return


func _refresh_controls() -> void:
	_fullscreen_btn.text = "🖥  FULLSCREEN: %s" % ("ON" if fullscreen else "OFF")
	_vsync_btn.text = "🔃  VSYNC: %s" % ("ON" if vsync else "OFF")
	_master_slider.set_value_no_signal(master_pct)
	_master_label.text = "%d%%" % master_pct
	_music_slider.set_value_no_signal(music_pct)
	_music_label.text = "%d%%" % music_pct
	_sfx_slider.set_value_no_signal(sfx_pct)
	_sfx_label.text = "%d%%" % sfx_pct


func _on_fullscreen_pressed() -> void:
	fullscreen = not fullscreen
	_apply_display(fullscreen, vsync)
	_refresh_controls()
	_save_settings()
	_notify("🖥 Fullscreen %s" % ("ON" if fullscreen else "OFF"))


func _on_vsync_pressed() -> void:
	vsync = not vsync
	_apply_display(fullscreen, vsync)
	_refresh_controls()
	_save_settings()
	_notify("🔃 VSync %s" % ("ON" if vsync else "OFF"))


## OPTIONS is reachable from the title menu (menu.gd), where `main.hud` may
## not be the fully-live in-game HUD a mid-gameplay caller can assume exists
## (and a lighter test harness may have no hud at all). `has_method("notify")`
## alone isn't enough — notify()'s OWN body does `hud.toast(text)` with no
## null-check, so a null `hud` crashes one level deeper. Guard both.
func _notify(text: String) -> void:
	if _main == null or not _main.has_method("notify"):
		return
	if not ("hud" in _main) or _main.hud == null:
		return
	_main.notify(text)


func _on_master_changed(val: int) -> void:
	master_pct = clampi(val, 0, 100)
	_apply_audio_bus(BUS_MASTER, master_pct)
	_master_label.text = "%d%%" % master_pct
	_save_settings()


func _on_music_changed(val: int) -> void:
	music_pct = clampi(val, 0, 100)
	_apply_audio_bus(BUS_MUSIC, music_pct)
	_music_label.text = "%d%%" % music_pct
	_save_settings()


func _on_sfx_changed(val: int) -> void:
	sfx_pct = clampi(val, 0, 100)
	_apply_audio_bus(BUS_SFX_A, sfx_pct)
	_apply_audio_bus(BUS_SFX_B, sfx_pct)
	_sfx_label.text = "%d%%" % sfx_pct
	_save_settings()


## Push the live mirror onto DisplayServer/AudioServer (called once on create,
## after _load_settings — mirrors apply_saved()'s logic but against the
## instance's already-loaded fields rather than re-reading the file).
func _apply_all() -> void:
	_apply_display(fullscreen, vsync)
	_apply_audio_bus(BUS_MASTER, master_pct)
	_apply_audio_bus(BUS_MUSIC, music_pct)
	_apply_audio_bus(BUS_SFX_A, sfx_pct)
	_apply_audio_bus(BUS_SFX_B, sfx_pct)


func _save_settings() -> void:
	var f := FileAccess.open(SETTINGS_PATH, FileAccess.WRITE)
	if f != null:
		f.store_string(JSON.stringify({
			"fullscreen": fullscreen,
			"vsync": vsync,
			"master_pct": master_pct,
			"music_pct": music_pct,
			"sfx_pct": sfx_pct,
		}, "  "))
		f.close()


func _load_settings() -> void:
	var settings := _read_settings_file()
	fullscreen = bool(settings.get("fullscreen", false))
	vsync = bool(settings.get("vsync", true))
	master_pct = clampi(int(settings.get("master_pct", 100)), 0, 100)
	music_pct = clampi(int(settings.get("music_pct", 70)), 0, 100)
	sfx_pct = clampi(int(settings.get("sfx_pct", 100)), 0, 100)
