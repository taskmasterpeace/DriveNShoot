## THE SAFEHOUSE TV (docs/cinema.md Phase 2 + the CHANNEL rework): the set in the
## corner of home LOOKS like a TV. CHANNELS ARE BROADCASTS, NOT MENUS (owner law):
## turning to CH 3/5/7/9/13 lands you on whatever that channel is already rolling —
## no content picker, ever. Channel flip = re-tune + roll, exactly the same
## roll/advance ProtoPublicScreen._next() already does for wall screens, just
## driven by an index instead of a fixed channel. A static burst covers the cut.
## The old shelf browser survives as the GUIDE sub-view — but GUIDE is now ONLY
## the player's OWN collection (found DVDs/tapes/reels/quest rewards): "your own
## tapes," never the broadcast catalog. Locked rows tease ("NOT FOUND YET");
## known-but-missing files say NOT INSTALLED and never crash (Phase 8 law). The
## NEWS ticker line is the Newsroom's lower-third; EBS pulls the same feed
## full-screen when tuned.
class_name ProtoMediaPanel
extends CanvasLayer

const AMBER := Color(0.96, 0.72, 0.2)
const BONE := Color(0.92, 0.89, 0.82)
const DIM := Color(0.55, 0.52, 0.46)
const STATIC_SECONDS := 0.3
const SETTINGS_PATH := "user://settings.json"
## TV volume 0–100, shared across every set, lazy-loaded from settings.json (-1 = unloaded).
static var tv_volume_pct: int = -1

var is_open: bool = false
var now_playing_id: String = ""
var channel_index: int = 0  ## persists on this node between opens (not saved to file)
var showing_guide: bool = false ## false = the CHANNEL view (default), true = the GUIDE shelf

var _main: Node = null
var _root: PanelContainer
var _close_btn: Button
var _channel_badge: Label
var _channel_view: Control
var _guide_view: Control
var _tabs: HBoxContainer
var _list_scroll: ScrollContainer
var _list: VBoxContainer
var _video: VideoStreamPlayer
var _screen_stack: Control ## the bezel's screen area — the video's fullscreen home
var _vol_slider: HSlider
var _now_label: Label
var _status: Label
var _ticker: Label
var _category: String = "film"
var _static_rect: ColorRect
var _static_t: float = 0.0
var _ebs_card: PanelContainer
var _ebs_label: Label
var _dead_air_card: PanelContainer
## THE SET (owner 2026-07-07): the physical TV this panel is the fullscreen view
## OF. Close the panel mid-reel and the picture keeps rolling on the set itself.
var tv_set: Node = null


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
	# THE BEZEL: a thick dark cabinet frame around the whole set — it should
	# read as a TV, not a menu.
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.08, 0.075, 0.06, 0.98)
	style.border_color = Color(0.03, 0.03, 0.03)
	style.set_border_width_all(16)
	style.set_corner_radius_all(10)
	style.set_content_margin_all(16)
	p._root.add_theme_stylebox_override("panel", style)
	p.add_child(p._root)

	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 8)
	p._root.add_child(v)

	# --- Header row: channel badge (left), title (center), X close (right) -----
	var header := HBoxContainer.new()
	header.add_theme_constant_override("separation", 10)
	v.add_child(header)

	p._channel_badge = Label.new()
	p._channel_badge.text = "CH — —"
	p._channel_badge.add_theme_font_override("font", ProtoHUD.mixed_font())
	p._channel_badge.add_theme_font_size_override("font_size", 20)
	p._channel_badge.add_theme_color_override("font_color", AMBER)
	var badge_style := StyleBoxFlat.new()
	badge_style.bg_color = Color(0.15, 0.13, 0.08)
	badge_style.border_color = AMBER
	badge_style.set_border_width_all(2)
	badge_style.set_corner_radius_all(4)
	badge_style.set_content_margin_all(8)
	var badge_wrap := PanelContainer.new()
	badge_wrap.add_theme_stylebox_override("panel", badge_style)
	badge_wrap.add_child(p._channel_badge)
	header.add_child(badge_wrap)

	var title := Label.new()
	title.text = "📺  THE SET"
	title.add_theme_font_override("font", ProtoHUD.mixed_font())
	title.add_theme_font_size_override("font_size", 22)
	title.add_theme_color_override("font_color", BONE)
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header.add_child(title)

	# 🔊 TV VOLUME — a real slider (control_gallery goal), 0–100 → the set's volume_db.
	var vol_box := HBoxContainer.new()
	vol_box.add_theme_constant_override("separation", 4)
	var vol_icon := Label.new()
	vol_icon.text = "🔊"
	vol_icon.add_theme_font_override("font", ProtoHUD.mixed_font())
	vol_icon.add_theme_font_size_override("font_size", 15)
	vol_box.add_child(vol_icon)
	p._vol_slider = HSlider.new()
	p._vol_slider.min_value = 0.0
	p._vol_slider.max_value = 100.0
	p._vol_slider.step = 1.0
	p._vol_slider.value = float(ProtoMediaPanel._tv_volume())
	p._vol_slider.custom_minimum_size = Vector2(110, 0)
	p._vol_slider.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	p._vol_slider.tooltip_text = "TV volume"
	p._vol_slider.value_changed.connect(func(val: float) -> void:
		ProtoMediaPanel._save_tv_volume(int(val))
		p._apply_tv_volume())
	vol_box.add_child(p._vol_slider)
	header.add_child(vol_box)

	var guide_toggle := Button.new()
	guide_toggle.text = "📋 GUIDE"
	guide_toggle.add_theme_font_override("font", ProtoHUD.mixed_font())
	guide_toggle.add_theme_font_size_override("font_size", 15)
	guide_toggle.tooltip_text = "Your own tapes — found DVDs/tapes/reels, not the broadcast"
	guide_toggle.pressed.connect(func() -> void: p.toggle_guide())
	header.add_child(guide_toggle)

	p._close_btn = Button.new()
	p._close_btn.text = "✕"
	p._close_btn.add_theme_font_override("font", ProtoHUD.mixed_font())
	p._close_btn.add_theme_font_size_override("font_size", 18)
	p._close_btn.add_theme_color_override("font_color", Color(0.9, 0.4, 0.3))
	p._close_btn.tooltip_text = "Close (E / Esc / B)"
	p._close_btn.pressed.connect(func() -> void: p.power_off()) # ✕ = the OFF switch; E/Esc = to the couch
	header.add_child(p._close_btn)

	# --- CHANNEL UP/DOWN hint row -------------------------------------------------
	var chan_hint := Label.new()
	chan_hint.text = "◀ CH DOWN · CH UP ▶"
	chan_hint.add_theme_font_override("font", ProtoHUD.mixed_font())
	chan_hint.add_theme_font_size_override("font_size", 12)
	chan_hint.add_theme_color_override("font_color", DIM)
	chan_hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(chan_hint)

	# --- Body: the SCREEN (the channel view lives here; GUIDE view is a shelf) ---
	var body := PanelContainer.new()
	body.size_flags_vertical = Control.SIZE_EXPAND_FILL
	v.add_child(body)

	# The CHANNEL view — the default. Full screen, no picker.
	p._channel_view = VBoxContainer.new()
	(p._channel_view as VBoxContainer).add_theme_constant_override("separation", 6)
	p._channel_view.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	p._channel_view.size_flags_vertical = Control.SIZE_EXPAND_FILL
	body.add_child(p._channel_view)

	var frame := PanelContainer.new()
	var fstyle := StyleBoxFlat.new()
	fstyle.bg_color = Color(0.02, 0.02, 0.02, 1.0)
	fstyle.border_color = Color(0.25, 0.21, 0.14)
	fstyle.set_border_width_all(2)
	fstyle.set_content_margin_all(4)
	frame.add_theme_stylebox_override("panel", fstyle)
	frame.size_flags_vertical = Control.SIZE_EXPAND_FILL
	p._channel_view.add_child(frame)

	# A Control stack: the video, the static burst, the DEAD AIR card, the EBS card —
	# whichever applies sits on top (only one visible at a time).
	var screen_stack := Control.new()
	screen_stack.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	screen_stack.size_flags_vertical = Control.SIZE_EXPAND_FILL
	frame.add_child(screen_stack)
	p._screen_stack = screen_stack

	p._video = VideoStreamPlayer.new()
	p._video.expand = true
	p._video.set_anchors_preset(Control.PRESET_FULL_RECT)
	screen_stack.add_child(p._video)

	p._dead_air_card = PanelContainer.new()
	p._dead_air_card.set_anchors_preset(Control.PRESET_FULL_RECT)
	var dead_style := StyleBoxFlat.new()
	dead_style.bg_color = Color(0.03, 0.03, 0.03)
	p._dead_air_card.add_theme_stylebox_override("panel", dead_style)
	var dead_label := Label.new()
	dead_label.name = "DeadLabel"
	dead_label.text = "░▒▓ DEAD AIR ▓▒░\nnothing on this channel"
	dead_label.add_theme_font_override("font", ProtoHUD.mixed_font())
	dead_label.add_theme_font_size_override("font_size", 22)
	dead_label.add_theme_color_override("font_color", Color(0.4, 0.4, 0.4))
	dead_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	dead_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	dead_label.set_anchors_preset(Control.PRESET_FULL_RECT)
	p._dead_air_card.add_child(dead_label)
	p._dead_air_card.visible = false
	screen_stack.add_child(p._dead_air_card)

	p._ebs_card = PanelContainer.new()
	p._ebs_card.set_anchors_preset(Control.PRESET_FULL_RECT)
	var ebs_style := StyleBoxFlat.new()
	ebs_style.bg_color = Color(0.08, 0.02, 0.02)
	ebs_style.border_color = Color(0.8, 0.2, 0.15)
	ebs_style.set_border_width_all(4)
	p._ebs_card.add_theme_stylebox_override("panel", ebs_style)
	p._ebs_label = Label.new()
	p._ebs_label.text = "EBS — STAND BY"
	p._ebs_label.add_theme_font_override("font", ProtoHUD.mixed_font())
	p._ebs_label.add_theme_font_size_override("font_size", 20)
	p._ebs_label.add_theme_color_override("font_color", Color(0.95, 0.85, 0.3))
	p._ebs_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	p._ebs_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	p._ebs_label.autowrap_mode = TextServer.AUTOWRAP_WORD
	p._ebs_label.set_anchors_preset(Control.PRESET_FULL_RECT)
	p._ebs_card.add_child(p._ebs_label)
	p._ebs_card.visible = false
	screen_stack.add_child(p._ebs_card)

	# THE STATIC BURST — a flash of noise between channel changes.
	p._static_rect = ColorRect.new()
	p._static_rect.set_anchors_preset(Control.PRESET_FULL_RECT)
	p._static_rect.color = Color(1, 1, 1, 1)
	p._static_rect.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	p._static_rect.visible = false
	screen_stack.add_child(p._static_rect)

	# The NEWS lower-third — the Newsroom's line crawls here while you watch.
	p._ticker = Label.new()
	p._ticker.add_theme_font_override("font", ProtoHUD.mixed_font())
	p._ticker.add_theme_font_size_override("font_size", 14)
	p._ticker.add_theme_color_override("font_color", Color(0.95, 0.85, 0.4))
	p._ticker.text = ""
	p._ticker.clip_text = true
	p._channel_view.add_child(p._ticker)

	p._now_label = Label.new()
	p._now_label.add_theme_font_override("font", ProtoHUD.mixed_font())
	p._now_label.add_theme_font_size_override("font_size", 16)
	p._now_label.add_theme_color_override("font_color", BONE)
	p._now_label.text = "…"
	p._channel_view.add_child(p._now_label)

	p._status = Label.new()
	p._status.add_theme_font_override("font", ProtoHUD.mixed_font())
	p._status.add_theme_font_size_override("font_size", 13)
	p._status.add_theme_color_override("font_color", DIM)
	p._status.text = "[E] to the couch — keeps playing on the set · [✕] power off · ◀▶ channel"
	p._channel_view.add_child(p._status)

	# The GUIDE view — YOUR OWN TAPES only (found_dvd/found_tape/found_reel/
	# quest_reward that the save has actually unlocked). No broadcast catalog here.
	p._guide_view = VBoxContainer.new()
	(p._guide_view as VBoxContainer).add_theme_constant_override("separation", 8)
	p._guide_view.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	p._guide_view.size_flags_vertical = Control.SIZE_EXPAND_FILL
	p._guide_view.visible = false
	body.add_child(p._guide_view)

	var guide_title := Label.new()
	guide_title.text = "📼 YOUR OWN TAPES — found DVDs, tapes, reels"
	guide_title.add_theme_font_override("font", ProtoHUD.mixed_font())
	guide_title.add_theme_font_size_override("font_size", 16)
	guide_title.add_theme_color_override("font_color", AMBER)
	(p._guide_view as VBoxContainer).add_child(guide_title)

	p._tabs = HBoxContainer.new()
	p._tabs.add_theme_constant_override("separation", 6)
	p._tabs.alignment = BoxContainer.ALIGNMENT_CENTER
	(p._guide_view as VBoxContainer).add_child(p._tabs)
	for cat in [["film", "FILM"], ["tvshow", "TV SHOW"], ["trailers", "TRAILERS"], ["clips", "CLIPS"], ["musicvideo", "MUSIC VIDEO"]]:
		var b := Button.new()
		b.text = cat[1]
		b.add_theme_font_override("font", ProtoHUD.mixed_font())
		b.add_theme_font_size_override("font_size", 14)
		var cid: String = cat[0]
		b.pressed.connect(func() -> void: p.set_category(cid))
		p._tabs.add_child(b)

	p._list_scroll = ScrollContainer.new()
	p._list_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	p._list_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	(p._guide_view as VBoxContainer).add_child(p._list_scroll)
	p._list = VBoxContainer.new()
	p._list.add_theme_constant_override("separation", 4)
	p._list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	p._list_scroll.add_child(p._list)

	var stop_b := Button.new()
	stop_b.text = "■ STOP"
	stop_b.add_theme_font_override("font", ProtoHUD.mixed_font())
	stop_b.pressed.connect(func() -> void: p.stop())
	(p._guide_view as VBoxContainer).add_child(stop_b)
	p._apply_tv_volume()
	return p


## TV volume, lazy-loaded from settings.json (default 80). Shared across every set.
static func _tv_volume() -> int:
	if tv_volume_pct < 0:
		tv_volume_pct = 80
		if FileAccess.file_exists(SETTINGS_PATH):
			var d: Variant = JSON.parse_string(FileAccess.get_file_as_string(SETTINGS_PATH))
			if d is Dictionary and (d as Dictionary).has("tv_volume"):
				tv_volume_pct = clampi(int((d as Dictionary)["tv_volume"]), 0, 100)
	return tv_volume_pct


## Persist the TV volume, merging into settings.json so the options-panel keys survive.
static func _save_tv_volume(pct: int) -> void:
	tv_volume_pct = clampi(pct, 0, 100)
	var d: Dictionary = {}
	if FileAccess.file_exists(SETTINGS_PATH):
		var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(SETTINGS_PATH))
		if parsed is Dictionary:
			d = parsed
	d["tv_volume"] = tv_volume_pct
	var f := FileAccess.open(SETTINGS_PATH, FileAccess.WRITE)
	if f != null:
		f.store_string(JSON.stringify(d, "  "))
		f.close()


func _pct_to_db(pct: int) -> float:
	return -60.0 if pct <= 0 else linear_to_db(float(pct) / 100.0)


## Push the current slider value onto the set. Safe before/after a video is playing —
## volume_db sticks on the VideoStreamPlayer across streams.
func _apply_tv_volume() -> void:
	if _video != null:
		var pct: int = int(_vol_slider.value) if _vol_slider != null else _tv_volume()
		_video.volume_db = _pct_to_db(pct)


func _registry() -> ProtoMediaRegistry:
	return _main.media_registry if ("media_registry" in _main and _main.media_registry != null) else null


## Opening the TV lands you on whatever CH channel_index is already rolling — a
## channel is a broadcast, not a menu (owner law). GUIDE view stays a manual toggle.
func open() -> void:
	is_open = true
	visible = true
	_root.visible = true
	_restore_video_fullscreen() # bring the picture back off the couch-sliver into the bezel
	showing_guide = false
	_channel_view.visible = true
	_guide_view.visible = false
	if tv_set != null and tv_set.has_method("set_off"):
		tv_set.set_off() # fullscreen takes the picture back from the set
	_tune_and_roll(false) # no static burst on first power-up
	refresh()


## Fullscreen: the video fills the bezel's screen area again (undo the couch sliver).
func _restore_video_fullscreen() -> void:
	if _video.get_parent() != _screen_stack:
		# Reparenting exits/re-enters the tree, which STOPS the player — save the
		# playhead and resume so the reel doesn't restart from the top.
		var resume_at := _video.stream_position
		var had_stream := _video.stream != null
		_video.get_parent().remove_child(_video)
		_screen_stack.add_child(_video)
		_screen_stack.move_child(_video, 0) # behind the DEAD AIR / EBS / static cards
		if had_stream:
			_video.play()
			_video.stream_position = resume_at
	_video.set_anchors_preset(Control.PRESET_FULL_RECT)
	_video.modulate = Color.WHITE


## E / back out: TO THE COUCH (owner 2026-07-07) — the panel hides but a rolling
## reel KEEPS PLAYING on the physical set. Walk around, do your stove-and-pack
## chores with the game on; E the set again for fullscreen. ✕/power_off stops it.
func close() -> void:
	is_open = false
	if _video.stream != null and _video.is_playing() and tv_set != null and tv_set.has_method("set_live"):
		# TO THE COUCH. A hidden VideoStreamPlayer decodes audio but FREEZES its
		# texture (playtest 2026-07-08: "I hear it but don't see it on the TV").
		# So keep the layer alive and the video DECODING — reparented to a 1px
		# sliver in the corner, visible-in-tree (full-res frames still decode) but
		# imperceptible — and hide only the bezel chrome. The set shows live frames.
		visible = true
		_root.visible = false
		if _video.get_parent() != self:
			# Exiting the tree stops the player — save the playhead and resume so
			# the couch picks up exactly where fullscreen left off (no restart).
			var resume_at := _video.stream_position
			_video.get_parent().remove_child(_video)
			add_child(_video)
			_video.play()
			_video.stream_position = resume_at
		_video.set_anchors_preset(Control.PRESET_TOP_LEFT)
		_video.position = Vector2.ZERO
		_video.size = Vector2(1, 1)
		tv_set.set_live(_video.get_video_texture())
	else:
		visible = false
		power_off()


## The actual OFF switch (✕ button): dead screen, warm amber idle glow back.
func power_off() -> void:
	stop()
	is_open = false
	visible = false


func stop() -> void:
	if _video.is_playing():
		_video.stop()
	_video.stream = null
	now_playing_id = ""
	_now_label.text = "…"
	if tv_set != null and tv_set.has_method("set_off"):
		tv_set.set_off()


## Is a reel rolling FULLSCREEN? (Sims + the input lock read this.)
func playing() -> bool:
	return is_open and _video.stream != null and _video.is_playing()


## Is the reel rolling ON THE SET (panel closed, picture on the television)?
func set_playing() -> bool:
	return not is_open and _video.stream != null and _video.is_playing()


## Flip a GUIDE category tab (the shelf of YOUR OWN TAPES, filtered further below).
func set_category(cat: String) -> void:
	_category = cat
	showing_guide = true
	_channel_view.visible = false
	_guide_view.visible = true
	refresh()


func toggle_guide() -> void:
	showing_guide = not showing_guide
	_channel_view.visible = not showing_guide
	_guide_view.visible = showing_guide
	if showing_guide:
		refresh()
	else:
		_update_channel_badge()


## The Newsroom's lower-third (Phase 6): the latest unheard TV bulletin crawls
## under the screen. Empty = quiet night.
func set_ticker(text: String) -> void:
	_ticker.text = ("⚠ NEWS — " + text) if text != "" else ""


# --- CHANNEL UP/DOWN: flip between LIVE broadcasts, never a content picker -----

func channel_up() -> void:
	var chans := ProtoPublicScreen.tv_channels()
	if chans.is_empty():
		return
	channel_index = (channel_index + 1) % chans.size()
	_tune_and_roll(true)


func channel_down() -> void:
	var chans := ProtoPublicScreen.tv_channels()
	if chans.is_empty():
		return
	channel_index = (channel_index - 1 + chans.size()) % chans.size()
	_tune_and_roll(true)


func current_channel() -> Dictionary:
	var chans := ProtoPublicScreen.tv_channels()
	if chans.is_empty():
		return {}
	channel_index = clampi(channel_index, 0, chans.size() - 1)
	return chans[channel_index]


func _update_channel_badge() -> void:
	var c := current_channel()
	if c.is_empty():
		_channel_badge.text = "CH — NO SIGNAL"
		return
	_channel_badge.text = "CH %d — %s" % [int(c.get("channel_num", 0)), String(c.get("name", c.get("id", "")))]


## Tune to channel_index and start it ROLLING — no selection step. Mirrors
## ProtoPublicScreen.power_on()/_next(): pick the playlist, play the next item,
## auto-advance on finish. EBS is special: it shows the newsroom feed, not a reel.
func _tune_and_roll(with_static: bool) -> void:
	_update_channel_badge()
	var c := current_channel()
	if with_static:
		_flash_static()
	_ebs_card.visible = false
	_dead_air_card.visible = false
	if bool(c.get("ebs", false)):
		_show_ebs()
		return
	if not _video.finished.is_connected(_on_channel_finished):
		_video.finished.connect(_on_channel_finished)
	_roll_channel(c)


func _channel_playlist(c: Dictionary) -> Array:
	var out: Array = []
	var reg := _registry()
	if reg == null:
		return out
	var cats: Array = c.get("categories", [])
	for id in reg.order:
		var row: Dictionary = reg.rows[id]
		if cats.has(String(row.get("category", ""))) and reg.installed(String(id)):
			out.append(String(id))
	return out


## THE AIR CLOCK (owner: "it should feel like it's already been on air"). A
## channel BROADCASTS whether anyone watches or not: the schedule is a pure
## function of the world clock, so tuning in lands you mid-program, tuning
## away and back later finds the broadcast exactly where it should be. One
## game hour = 60 real seconds of air time — the same 1:1 the 24-min day gives
## real playback, so the offset stays consistent while you actually watch.
## Per-channel hash phase keeps the lineups unsynchronized.
func _air_slot(cid: String, list: Array) -> Dictionary:
	var reg := _registry()
	var runtimes: Array = []
	var total := 0.0
	for id in list:
		var rt: float = maxf(10.0, float(reg.get_media(String(id)).get("runtime_seconds", 60.0)))
		runtimes.append(rt)
		total += rt
	var day := 0.0
	var hour := 12.0
	if _main != null and "daynight" in _main and _main.daynight != null:
		day = float(_main.daynight.day)
		hour = float(_main.daynight.hour)
	var air := (day * 24.0 + hour) * 60.0 + float(absi(hash(cid)) % 997)
	var t := fmod(air, total)
	for i in list.size():
		if t < float(runtimes[i]):
			return {"idx": i, "offset": t}
		t -= float(runtimes[i])
	return {"idx": 0, "offset": 0.0}


## Roll whatever the AIR CLOCK says this channel is showing RIGHT NOW, from the
## middle of the program (seek where the stream supports it — Theora rewinds to
## 0 on unsupported seeks, in which case the schedule still cuts programs over
## at the right times, which is most of the "it was already on" read).
func _roll_channel(c: Dictionary) -> void:
	var cid := String(c.get("id", ""))
	var list := _channel_playlist(c)
	if list.is_empty():
		now_playing_id = ""
		_now_label.text = "…"
		_dead_air_card.visible = true
		if _video.is_playing():
			_video.stop()
		_video.stream = null
		return
	var slot := _air_slot(cid, list)
	var id: String = list[int(slot["idx"])]
	var reg := _registry()
	var stream := reg.open_stream(id)
	if stream == null:
		_dead_air_card.visible = true
		return
	_video.stream = stream
	_video.play()
	if float(slot["offset"]) > 1.0:
		_video.stream_position = float(slot["offset"])
	# On the couch, a channel auto-advance swaps the stream — re-hand the NEW
	# texture to the set so it doesn't cling to the last reel's final frame.
	if not is_open and tv_set != null and tv_set.has_method("set_live"):
		tv_set.set_live(_video.get_video_texture())
	now_playing_id = id
	_now_label.text = "NOW ON %s — %s" % [String(c.get("name", cid)), String(reg.get_media(id).get("title", id))]
	if _main.has_method("mark_media_watched"):
		_main.mark_media_watched(id)


func _on_channel_finished() -> void:
	if showing_guide or (not is_open and not set_playing()):
		return
	var c := current_channel()
	if bool(c.get("ebs", false)):
		return
	_roll_channel(c) # the AIR CLOCK already advanced to the next program


## CH 13 — EBS: the newsroom's queued tv bulletin, full-screen, no reel required.
## A quiet queue is a calm STAND BY card (worldbuilding, not a bug).
func _show_ebs() -> void:
	if _video.is_playing():
		_video.stop()
	_video.stream = null
	var line := ""
	var clip := ""
	if _main != null and "world_state" in _main and _main.world_state != null:
		for b in _main.world_state.broadcast_queue:
			if String(b.get("medium", "")) == "tv" and not bool(b.get("heard", false)):
				line = String(b.get("text", ""))
				clip = String(b.get("clip_id", ""))
				b["heard"] = true
				break
	if line == "":
		_ebs_label.text = "EBS — STAND BY\n\nno bulletin queued — the wire is quiet"
		_ebs_card.visible = true
		now_playing_id = ""
		_now_label.text = "…"
		return
	var reg := _registry()
	if clip != "" and reg != null and reg.installed(clip):
		var stream := reg.open_stream(clip)
		if stream != null:
			_video.stream = stream
			_video.play()
			now_playing_id = clip
	_ebs_label.text = "⚠ EMERGENCY BROADCAST ⚠\n\n%s" % line
	_ebs_card.visible = true
	_now_label.text = "EBS — EMERGENCY BROADCAST"


## A brief flash of procedural noise between channel changes — no asset dependency.
func _flash_static() -> void:
	var img := Image.create(64, 36, false, Image.FORMAT_RGB8)
	var rng := RandomNumberGenerator.new()
	for y in img.get_height():
		for x in img.get_width():
			var g := rng.randf()
			img.set_pixel(x, y, Color(g, g, g))
	_static_rect.texture = ImageTexture.create_from_image(img)
	_static_rect.visible = true
	_static_t = STATIC_SECONDS


func _process(delta: float) -> void:
	if _static_t > 0.0:
		_static_t -= delta
		if _static_t <= 0.0:
			_static_rect.visible = false


## Raw hardware close (owner spec): X (mouse, wired above), Esc key, and pad B —
## on top of the existing `interact` action close (E key / pad Y) main.gd already
## wires. Mirrors the raw-Esc precedent in controls_panel.gd.
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
	if not showing_guide:
		if event.is_action_pressed("tv_channel_up"):
			get_viewport().set_input_as_handled()
			channel_up()
		elif event.is_action_pressed("tv_channel_down"):
			get_viewport().set_input_as_handled()
			channel_down()


# --- THE GUIDE: your own tapes only (found_dvd/found_tape/found_reel/quest_reward ---
# that the SAVE has actually unlocked) — never the broadcast catalog. -----------

func refresh() -> void:
	if not showing_guide:
		return
	for c in _list.get_children():
		c.queue_free()
	var reg := _registry()
	if reg == null:
		return
	var unlocked: Dictionary = _main.media_unlocked if "media_unlocked" in _main else {}
	var have_any := false
	for row_v in reg.list_by_category(_category):
		var row := row_v as Dictionary
		var id := String(row["id"])
		var unlock_type := String(row.get("unlock_type", "always_available"))
		# GUIDE = YOUR OWN TAPES: a real collectible (found_*/quest_reward), and
		# only once the save actually has it. always_available lives on the
		# broadcast, not the shelf — it never appears here.
		if unlock_type == "always_available" or unlock_type == "regional_channel":
			continue
		have_any = true
		var inst := reg.installed(id)
		var b := Button.new()
		b.add_theme_font_override("font", ProtoHUD.mixed_font())
		b.add_theme_font_size_override("font_size", 15)
		b.alignment = HORIZONTAL_ALIGNMENT_LEFT
		var mins := int(float(row.get("runtime_seconds", 0.0)) / 60.0)
		if not unlocked.has(id):
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
		empty.text = "No tapes of yours in this category yet.\nFind DVDs/tapes/reels out in the world."
		_list.add_child(empty)


## The GUIDE row click (and the sim's entry): load the stream at runtime and
## ROLL IT. This is the ONLY place a title is ever picked from a list — broadcast
## channels never expose one (owner law).
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
