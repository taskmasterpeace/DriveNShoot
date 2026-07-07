## THE LIBRARY (ship-guide goal): the user guide INSIDE the game. data/books.json rows
## render here — a library list, then a book, page by page. UI LAW compliant: ✕ + Esc
## close, amber/bone, 2px frame. Opened by the safehouse BOOKSHELF (whole library) or by
## USING a book_* item from the pack (that one book).
class_name ProtoBookPanel
extends CanvasLayer

const AMBER := Color(0.96, 0.72, 0.2)
const BONE := Color(0.92, 0.89, 0.82)
const DIM := Color(0.55, 0.52, 0.46)
const BOOKS_PATH := "res://data/books.json"

static var _books_cache: Array = []

var is_open: bool = false
var _main: Node = null
var _root: PanelContainer
var _title: Label
var _body: RichTextLabel
var _page_label: Label
var _shelf_box: VBoxContainer
var _reader_box: VBoxContainer
var _book: Dictionary = {}
var _page: int = 0


## All books, cached: [{id, title, emoji, pages: [String]}]
static func books() -> Array:
	if not _books_cache.is_empty():
		return _books_cache
	if FileAccess.file_exists(BOOKS_PATH):
		var d: Variant = JSON.parse_string(FileAccess.get_file_as_string(BOOKS_PATH))
		if d is Dictionary and (d as Dictionary).has("books"):
			_books_cache = (d as Dictionary)["books"]
	return _books_cache


static func book_by_id(id: String) -> Dictionary:
	for b in books():
		if String(b.get("id", "")) == id:
			return b
	return {}


static func create(main: Node) -> ProtoBookPanel:
	var p := ProtoBookPanel.new()
	p.layer = 4
	p._main = main
	p._root = PanelContainer.new()
	p._root.set_anchors_preset(Control.PRESET_CENTER)
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.05, 0.05, 0.04, 0.97)
	style.border_color = AMBER
	style.set_border_width_all(2)
	style.set_content_margin_all(14)
	p._root.add_theme_stylebox_override("panel", style)
	p.add_child(p._root)

	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 8)
	v.custom_minimum_size = Vector2(520, 460)
	p._root.add_child(v)

	var head := HBoxContainer.new()
	p._title = Label.new()
	p._title.add_theme_font_override("font", ProtoHUD.mixed_font())
	p._title.add_theme_font_size_override("font_size", 20)
	p._title.add_theme_color_override("font_color", AMBER)
	p._title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	head.add_child(p._title)
	var x := Button.new()
	x.text = "✕"
	x.add_theme_color_override("font_color", Color(0.9, 0.4, 0.3))
	x.pressed.connect(func() -> void: p.close())
	head.add_child(x)
	v.add_child(head)

	# THE SHELF — one button per manual.
	p._shelf_box = VBoxContainer.new()
	p._shelf_box.add_theme_constant_override("separation", 6)
	v.add_child(p._shelf_box)

	# THE READER — page text + prev/next.
	p._reader_box = VBoxContainer.new()
	p._reader_box.add_theme_constant_override("separation", 6)
	p._reader_box.size_flags_vertical = Control.SIZE_EXPAND_FILL
	v.add_child(p._reader_box)
	p._body = RichTextLabel.new()
	p._body.add_theme_font_override("normal_font", ProtoHUD.mixed_font())
	p._body.add_theme_font_size_override("normal_font_size", 15)
	p._body.add_theme_color_override("default_color", BONE)
	p._body.size_flags_vertical = Control.SIZE_EXPAND_FILL
	p._body.custom_minimum_size = Vector2(0, 320)
	p._reader_box.add_child(p._body)
	var nav := HBoxContainer.new()
	nav.alignment = BoxContainer.ALIGNMENT_CENTER
	nav.add_theme_constant_override("separation", 12)
	var prev := Button.new()
	prev.text = "◀ PAGE"
	prev.pressed.connect(func() -> void: p.turn(-1))
	nav.add_child(prev)
	p._page_label = Label.new()
	p._page_label.add_theme_color_override("font_color", DIM)
	nav.add_child(p._page_label)
	var next := Button.new()
	next.text = "PAGE ▶"
	next.pressed.connect(func() -> void: p.turn(1))
	nav.add_child(next)
	var back := Button.new()
	back.text = "📚 SHELF"
	back.pressed.connect(func() -> void: p.open_shelf())
	nav.add_child(back)
	p._reader_box.add_child(nav)

	p._root.visible = false
	return p


func _input(event: InputEvent) -> void:
	if is_open and event is InputEventKey and (event as InputEventKey).pressed \
			and (event as InputEventKey).keycode == KEY_ESCAPE:
		close()


## The whole library (the bookshelf's view).
func open_shelf() -> void:
	is_open = true
	_root.visible = true
	_book = {}
	_title.text = "📚 THE LIBRARY — pick a manual"
	_reader_box.visible = false
	_shelf_box.visible = true
	for c in _shelf_box.get_children():
		c.queue_free()
	for b_v in books():
		var b: Dictionary = b_v
		var btn := Button.new()
		btn.text = "%s  %s" % [String(b.get("emoji", "📖")), String(b.get("title", "?"))]
		btn.add_theme_font_override("font", ProtoHUD.mixed_font())
		btn.alignment = HORIZONTAL_ALIGNMENT_LEFT
		var bid := String(b.get("id", ""))
		btn.pressed.connect(func() -> void: open_book(bid))
		_shelf_box.add_child(btn)


## One manual, from page 1.
func open_book(id: String) -> void:
	var b := ProtoBookPanel.book_by_id(id)
	if b.is_empty():
		return
	is_open = true
	_root.visible = true
	_book = b
	_page = 0
	_shelf_box.visible = false
	_reader_box.visible = true
	_show_page()


func turn(dir: int) -> void:
	if _book.is_empty():
		return
	var pages: Array = _book.get("pages", [])
	_page = clampi(_page + dir, 0, pages.size() - 1)
	_show_page()


func _show_page() -> void:
	var pages: Array = _book.get("pages", [])
	_title.text = "%s  %s" % [String(_book.get("emoji", "📖")), String(_book.get("title", ""))]
	_body.text = String(pages[_page]) if _page < pages.size() else ""
	_page_label.text = "%d / %d" % [_page + 1, pages.size()]


func close() -> void:
	is_open = false
	_root.visible = false
