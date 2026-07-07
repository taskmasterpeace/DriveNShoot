## Proof for THE LIBRARY (ship-guide goal — the user guide INSIDE the game). Books load
## as rows, every book_* ITEM opens a real book, the shelf lists all manuals, the reader
## pages, and the safehouse BOOKSHELF interactable raises the panel. Real main harness.
## Run: godot --headless --path game res://proto3d/tests/library_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node = null


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("LIB: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _ready() -> void:
	get_tree().create_timer(120.0).timeout.connect(func() -> void:
		print("LIB: DONE — %d passed, %d failed (WATCHDOG)" % [passed, failed + 1])
		get_tree().quit(1))
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 8:
		await get_tree().process_frame

	# The rows: 7 focused manuals, every one with real pages.
	var books := ProtoBookPanel.books()
	_check("7 manuals on the shelf", books.size() == 7)
	_check("every book has 3 pages of real text",
		books.all(func(b): return (b["pages"] as Array).size() == 3 and String((b["pages"] as Array)[0]).length() > 80))

	# Every book_* ITEM resolves to a real book (no orphaned manuals either way).
	ProtoContainer.ensure_items()
	var item_books: Array = []
	for id in ProtoContainer.ITEMS:
		if String(id).begins_with("book_"):
			item_books.append(String(id))
	_check("7 book items exist", item_books.size() == 7)
	_check("every book item opens a real book",
		item_books.all(func(id): return not ProtoBookPanel.book_by_id(id).is_empty()))

	# The SHELF: lists all manuals; the panel is modal (input locks).
	var shelf: ProtoBookshelf = null
	for n in main.get_children():
		if n is ProtoBookshelf:
			shelf = n
	_check("a bookshelf stands in the safehouse", shelf != null)
	if shelf != null:
		shelf.interact(main)
		_check("E on the shelf opens THE LIBRARY", main.book_panel.is_open)
		await get_tree().process_frame
		_check("library lists all 7 manuals", main.book_panel._shelf_box.get_child_count() == 7)
		await get_tree().physics_frame
		_check("reading is modal (feet frozen)", main.player.input_locked)
		main.book_panel.close()
		_check("✕ closes the library", not main.book_panel.is_open)

	# The ITEM path: USE a manual from the pack → that book, page 1; pages turn.
	_check("using 'Manual: The Pack' opens it", main.use_item("book_dogs"))
	_check("the right book is open", String(main.book_panel._book.get("id", "")) == "book_dogs")
	_check("page 1 teaches adoption", main.book_panel._body.text.contains("adopts"))
	main.book_panel.turn(1)
	_check("page 2 is THE WHISTLE", main.book_panel._body.text.contains("WHISTLE"))
	main.book_panel.turn(-1)
	main.book_panel.turn(-1)
	_check("pages clamp at the cover", main.book_panel._page == 0)
	main.book_panel.close()

	print("LIB: DONE — %d passed, %d failed" % [passed, failed])
	get_tree().quit(1 if failed > 0 else 0)
