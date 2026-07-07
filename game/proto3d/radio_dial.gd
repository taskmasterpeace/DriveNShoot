## THE RADIO DIAL (control_gallery goal) — the owner's "go to different frequencies with
## premade frequencies" idea, built from Godot's stock controls: a FREQUENCY SLIDER you
## drag across the FM band, PRESET chips (one per station — the premade frequencies), a
## live "97.9 FM" readout, a station name (or "— static —" between stations), plus power +
## volume. It drives a ProtoMusic (music.gd owns the shelf, buses, and playback); this is
## purely the face of the radio.
class_name ProtoRadioDial
extends CanvasLayer

const AMBER := Color(0.96, 0.72, 0.2)
const BONE := Color(0.92, 0.89, 0.82)
const DIM := Color(0.55, 0.52, 0.46)

var is_open: bool = false

var _music: ProtoMusic = null
var _was_locked: bool = true ## edge detector: play static once when the dial LEAVES a station
var _root: PanelContainer
var _freq_slider: HSlider
var _readout: Label
var _station_label: Label
var _presets: HBoxContainer
var _power: CheckButton
var _vol: HSlider


static func create(music: ProtoMusic) -> ProtoRadioDial:
	var rd := ProtoRadioDial.new()
	rd.layer = 4
	rd._music = music

	rd._root = PanelContainer.new()
	rd._root.set_anchors_preset(Control.PRESET_CENTER)
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.05, 0.05, 0.04, 0.96)
	style.border_color = AMBER
	style.set_border_width_all(2)
	style.set_content_margin_all(14)
	rd._root.add_theme_stylebox_override("panel", style)
	rd.add_child(rd._root)

	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 8)
	v.custom_minimum_size = Vector2(420, 0)
	rd._root.add_child(v)

	# Header: title + ✕
	var head := HBoxContainer.new()
	var title := Label.new()
	title.text = "📻 RADIO"
	title.add_theme_font_override("font", ProtoHUD.mixed_font())
	title.add_theme_font_size_override("font_size", 20)
	title.add_theme_color_override("font_color", AMBER)
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	head.add_child(title)
	var x := Button.new()
	x.text = "✕"
	x.add_theme_color_override("font_color", Color(0.9, 0.4, 0.3))
	x.pressed.connect(func() -> void: rd.close())
	head.add_child(x)
	v.add_child(head)

	# The big frequency readout.
	rd._readout = Label.new()
	rd._readout.add_theme_font_override("font", ProtoHUD.mixed_font())
	rd._readout.add_theme_font_size_override("font_size", 34)
	rd._readout.add_theme_color_override("font_color", BONE)
	rd._readout.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(rd._readout)

	rd._station_label = Label.new()
	rd._station_label.add_theme_font_override("font", ProtoHUD.mixed_font())
	rd._station_label.add_theme_font_size_override("font_size", 15)
	rd._station_label.add_theme_color_override("font_color", AMBER)
	rd._station_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(rd._station_label)

	# THE DIAL — sweep the band; locks onto a preset or hits static between them.
	var band := HBoxContainer.new()
	var lo := Label.new(); lo.text = "%.0f" % ProtoMusic.BAND_LO; lo.add_theme_color_override("font_color", DIM)
	band.add_child(lo)
	rd._freq_slider = HSlider.new()
	rd._freq_slider.min_value = ProtoMusic.BAND_LO
	rd._freq_slider.max_value = ProtoMusic.BAND_HI
	rd._freq_slider.step = 0.1
	rd._freq_slider.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	rd._freq_slider.value_changed.connect(func(_f: float) -> void: rd._on_tune())
	band.add_child(rd._freq_slider)
	var hi := Label.new(); hi.text = "%.0f" % ProtoMusic.BAND_HI; hi.add_theme_color_override("font_color", DIM)
	band.add_child(hi)
	v.add_child(band)

	# PRESETS — one chip per station (the premade frequencies).
	rd._presets = HBoxContainer.new()
	rd._presets.add_theme_constant_override("separation", 6)
	v.add_child(rd._presets)

	# Power + volume row.
	var ctl := HBoxContainer.new()
	ctl.add_theme_constant_override("separation", 10)
	rd._power = CheckButton.new()
	rd._power.text = "POWER"
	rd._power.add_theme_font_override("font", ProtoHUD.mixed_font())
	rd._power.toggled.connect(func(on: bool) -> void: rd._set_power(on))
	ctl.add_child(rd._power)
	var vlabel := Label.new(); vlabel.text = "🔊"; ctl.add_child(vlabel)
	rd._vol = HSlider.new()
	rd._vol.min_value = 0; rd._vol.max_value = 100; rd._vol.step = 1
	rd._vol.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	rd._vol.value_changed.connect(func(val: float) -> void:
		if rd._music != null: rd._music.set_volume_pct(int(val)))
	ctl.add_child(rd._vol)
	v.add_child(ctl)

	rd._root.visible = false
	return rd


func open() -> void:
	is_open = true
	_root.visible = true
	_rebuild_presets()
	if _music != null:
		_power.button_pressed = _music.power_on
		_vol.value = float(_music.volume_pct)
		_freq_slider.set_value_no_signal(_music.current_frequency())
	_refresh_readout(_music.current_frequency() if _music != null else ProtoMusic.BAND_LO)


func close() -> void:
	is_open = false
	_root.visible = false


func toggle() -> void:
	if is_open: close()
	else: open()


## Rebuild the preset chips from the live station list.
func _rebuild_presets() -> void:
	for c in _presets.get_children():
		c.queue_free()
	if _music == null:
		return
	for pr in _music.frequencies():
		var b := Button.new()
		b.text = "%.1f" % float(pr["freq"])
		b.tooltip_text = String(pr["name"])
		b.add_theme_font_override("font", ProtoHUD.mixed_font())
		var f: float = float(pr["freq"])
		b.pressed.connect(func() -> void: _freq_slider.value = f)   # snaps the dial → tunes
		_presets.add_child(b)


## Dial moved — tune to the nearest preset (or static) and update the readout. The SOUND
## of tuning (sound-map pass): leaving a station hisses radio_static once; locking a new
## one clicks — edges only, so dragging the slider isn't a machine gun.
func _on_tune() -> void:
	if _music == null:
		return
	var f: float = _freq_slider.value
	var idx := _music.tune_to_frequency(f)
	var locked := idx >= 0
	if locked != _was_locked:
		var au: Variant = _music._main.audio if (_music._main != null and "audio" in _music._main) else null
		if au != null:
			au.play_ui("radio_static" if not locked else "blip", -10.0)
	_was_locked = locked
	_refresh_readout(f)


func _refresh_readout(freq: float) -> void:
	_readout.text = "%.1f FM" % freq
	if _music == null:
		_station_label.text = ""
		return
	var idx := _music.tune_to_frequency(freq)   # -1 when between stations
	_station_label.text = ("♫ " + _music.station_name()) if idx >= 0 else "— static —"


func _set_power(on: bool) -> void:
	if _music == null:
		return
	if _music.power_on != on:
		_music.toggle_power()
