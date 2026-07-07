## THE MEDIA PANEL (docs/cinema.md Phase 2): the safehouse TV's face — pick
## FILM / TV SHOW / TRAILERS / CLIPS, pick a row, and WATCH it, in-game, at ~80%
## of the screen. Time passes while it plays (downtime is gameplay). Locked rows
## tease ("NOT FOUND YET"); known-but-missing files say NOT INSTALLED and never
## crash (Phase 8 law). The NEWS ticker line is the Newsroom's lower-third.
class_name ProtoMediaPanel
extends CanvasLayer

const AMBER := Color(0.96, 0.72, 0.2)
const BONE := Color(0.92, 0.89, 0.82)
const DIM := Color(0.55, 0.52, 0.46)

var is_open: bool = false
var now_playing_id: String = ""

var _main: Node = null
var _root: PanelContainer
var _tabs: HBoxContainer
var _list_scroll: ScrollContainer
var _list: VBoxContainer
var _video: VideoStreamPlayer
var _now_label: Label
var _status: Label
var _ticker: Label
var _category: String = "film"


static func create(main: Node) -> ProtoMediaPanel:
	var p := ProtoMediaPanel.new()
	p._main = main
	p.layer = 3
	p.visible = false

	p._root = PanelContainer.new()
	p._root.set_anchors_preset(Control.PRESET_CENTER)
	# ~80% of a 1920×1080 canvas (stretch mode scales it).
	p._root.offset_left = -760.0
	p._root.offset_right = 760.0
	p._root.offset_top = -420.0
	p._root.offset_bottom = 420.0
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.09, 0.08, 0.06, 0.97)
	style.border_color = AMBER
	style.set_border_width_all(2)
	style.set_corner_radius_all(6)
	style.set_content_margin_all(14)
	p._root.add_theme_stylebox_override("panel", style)
	p.add_child(p._root)

	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 8)
	p._root.add_child(v)

	# Title + category tabs.
	var title := Label.new()
	title.text = "📺  THE SET"
	title.add_theme_font_override("font", ProtoHUD.mixed_font())
	title.add_theme_font_size_override("font_size", 24)
	title.add_theme_color_override("font_color", AMBER)
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(title)

	p._tabs = HBoxContainer.new()
	p._tabs.add_theme_constant_override("separation", 6)
	p._tabs.alignment = BoxContainer.ALIGNMENT_CENTER
	v.add_child(p._tabs)
	for cat in [["film", "FILM"], ["tvshow", "TV SHOW"], ["trailers", "TRAILERS"], ["clips", "CLIPS"]]:
		var b := Button.new()
		b.text = cat[1]
		b.add_theme_font_override("font", ProtoHUD.mixed_font())
		b.add_theme_font_size_override("font_size", 15)
		var cid: String = cat[0]
		b.pressed.connect(func() -> void: p.set_category(cid))
		p._tabs.add_child(b)

	# Body: the shelf (left) and the SCREEN (right).
	var cols := HBoxContainer.new()
	cols.add_theme_constant_override("separation", 14)
	cols.size_flags_vertical = Control.SIZE_EXPAND_FILL
	v.add_child(cols)

	p._list_scroll = ScrollContainer.new()
	p._list_scroll.custom_minimum_size = Vector2(420, 0)
	p._list_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	p._list_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	cols.add_child(p._list_scroll)
	p._list = VBoxContainer.new()
	p._list.add_theme_constant_override("separation", 4)
	p._list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	p._list_scroll.add_child(p._list)

	var screen_v := VBoxContainer.new()
	screen_v.add_theme_constant_override("separation", 6)
	screen_v.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	screen_v.size_flags_vertical = Control.SIZE_EXPAND_FILL
	cols.add_child(screen_v)

	var frame := PanelContainer.new()
	var fstyle := StyleBoxFlat.new()
	fstyle.bg_color = Color(0.02, 0.02, 0.02, 1.0)
	fstyle.border_color = Color(0.25, 0.21, 0.14)
	fstyle.set_border_width_all(2)
	fstyle.set_content_margin_all(4)
	frame.add_theme_stylebox_override("panel", fstyle)
	frame.size_flags_vertical = Control.SIZE_EXPAND_FILL
	screen_v.add_child(frame)
	p._video = VideoStreamPlayer.new()
	p._video.expand = true
	p._video.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	p._video.size_flags_vertical = Control.SIZE_EXPAND_FILL
	frame.add_child(p._video)

	# The NEWS lower-third — the Newsroom's line crawls here while you watch.
	p._ticker = Label.new()
	p._ticker.add_theme_font_override("font", ProtoHUD.mixed_font())
	p._ticker.add_theme_font_size_override("font_size", 14)
	p._ticker.add_theme_color_override("font_color", Color(0.95, 0.85, 0.4))
	p._ticker.text = ""
	p._ticker.clip_text = true
	screen_v.add_child(p._ticker)

	p._now_label = Label.new()
	p._now_label.add_theme_font_override("font", ProtoHUD.mixed_font())
	p._now_label.add_theme_font_size_override("font_size", 16)
	p._now_label.add_theme_color_override("font_color", BONE)
	p._now_label.text = "Pick something off the shelf."
	screen_v.add_child(p._now_label)

	p._status = Label.new()
	p._status.add_theme_font_override("font", ProtoHUD.mixed_font())
	p._status.add_theme_font_size_override("font_size", 13)
	p._status.add_theme_color_override("font_color", DIM)
	p._status.text = "[E] off · [■] stop · time passes while it plays"
	screen_v.add_child(p._status)
	var stop_b := Button.new()
	stop_b.text = "■ STOP"
	stop_b.add_theme_font_override("font", ProtoHUD.mixed_font())
	stop_b.pressed.connect(func() -> void: p.stop())
	screen_v.add_child(stop_b)
	return p


func _registry() -> ProtoMediaRegistry:
	return _main.media_registry if ("media_registry" in _main and _main.media_registry != null) else null


func open() -> void:
	is_open = true
	visible = true
	refresh()


func close() -> void:
	stop()
	is_open = false
	visible = false


func stop() -> void:
	if _video.is_playing():
		_video.stop()
	_video.stream = null
	now_playing_id = ""
	_now_label.text = "Pick something off the shelf."


## Is a reel actually rolling? (main ORs this into daynight.waiting — time passes.)
func playing() -> bool:
	return is_open and _video.stream != null and _video.is_playing()


func set_category(cat: String) -> void:
	_category = cat
	refresh()


## The Newsroom's lower-third (Phase 6): the latest unheard TV bulletin crawls
## under the screen. Empty = quiet night.
func set_ticker(text: String) -> void:
	_ticker.text = ("⚠ NEWS — " + text) if text != "" else ""


func refresh() -> void:
	for c in _list.get_children():
		c.queue_free()
	var reg := _registry()
	if reg == null:
		return
	var unlocked: Dictionary = _main.media_unlocked if "media_unlocked" in _main else {}
	var have_any := false
	for row_v in reg.list_by_category(_category):
		have_any = true
		var row := row_v as Dictionary
		var id := String(row["id"])
		var unlocked_row: bool = String(row.get("unlock_type", "always_available")) == "always_available" or unlocked.has(id)
		var inst := reg.installed(id)
		var b := Button.new()
		b.add_theme_font_override("font", ProtoHUD.mixed_font())
		b.add_theme_font_size_override("font_size", 15)
		b.alignment = HORIZONTAL_ALIGNMENT_LEFT
		var mins := int(float(row.get("runtime_seconds", 0.0)) / 60.0)
		if not unlocked_row:
			b.text = "🔒 ???  — not found yet (the world hides its reels)"
			b.disabled = true
			b.add_theme_color_override("font_color", DIM)
		elif not inst:
			b.text = "▢ %s — NOT INSTALLED" % String(row.get("title", id))
			b.disabled = true
			b.add_theme_color_override("font_color", DIM)
		else:
			var watched: bool = "media_watched" in _main and _main.media_watched.has(id)
			b.text = "%s %s  (%d min)" % ["▸" if not watched else "✓", String(row.get("title", id)), mins]
			b.add_theme_color_override("font_color", BONE)
			b.pressed.connect(func() -> void: select_media(id))
		_list.add_child(b)
	if not have_any:
		var empty := Label.new()
		empty.add_theme_font_override("font", ProtoHUD.mixed_font())
		empty.add_theme_color_override("font_color", DIM)
		empty.text = "Nothing on this shelf yet.\nDrop media in via MediaForge (:8897)."
		_list.add_child(empty)


## The row click (and the sim's entry): load the stream at runtime and ROLL IT.
func select_media(id: String) -> void:
	var reg := _registry()
	if reg == null:
		return
	var stream := reg.open_stream(id)
	if stream == null:
		_now_label.text = "NOT INSTALLED — convert it in MediaForge (:8897)."
		return
	_video.stream = stream
	_video.play()
	now_playing_id = id
	_now_label.text = "NOW SHOWING — %s" % String(reg.get_media(id).get("title", id))
	if _main.has_method("mark_media_watched"):
		_main.mark_media_watched(id)
	refresh()
