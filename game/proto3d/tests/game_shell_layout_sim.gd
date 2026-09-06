## Regression for transparent Button metadata inflating cover-card minima and
## viewport-wide column choices clipping the real library's fourth column.
## A real shell/deck lives in an exactly sized logical viewport; resizing that
## SAME open shell must preserve card identity, focus, ownership and textures.
extends Node

var passed: int = 0
var failed: int = 0
var finished: bool = false
var viewport: SubViewport
var deck: ProtoGameDeck
var shell: ProtoGameShell
var capture_dir: String = ""


func _ready() -> void:
	for argument: String in OS.get_cmdline_user_args():
		if argument.begins_with("--capture-dir="):
			capture_dir = argument.trim_prefix("--capture-dir=")
	get_tree().create_timer(60.0).timeout.connect(func() -> void:
		_check("layout regression completes before watchdog", false)
		_finish())
	_run.call_deferred()


func _check(label: String, condition: bool) -> void:
	passed += 1 if condition else 0
	failed += 0 if condition else 1
	print("GAME_SHELL_LAYOUT: %s - %s" % ["PASS" if condition else "FAIL", label])


func _run() -> void:
	# SubViewport supplies exact logical sizes even on headless/smaller displays;
	# no project, OS window, profile, save or cartridge ownership is modified.
	viewport = SubViewport.new()
	viewport.size = Vector2i(1280, 720)
	viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	add_child(viewport)
	deck = ProtoGameDeck.create() as ProtoGameDeck
	viewport.add_child(deck)
	shell = ProtoGameShell.create(deck) as ProtoGameShell
	viewport.add_child(shell)
	var ownership_before: Array = deck.ledger.unlocked.duplicate()
	_check("real catalog contains all 22 cartridges", deck.registry.order.size() == 22)
	# Reproduce the photographed console-only library first, then cover every
	# catalog row, including the three different handheld art proportions.
	shell.open_library("console", {"device": "console", "auto_start": false})
	await _frames(8)
	_check("real console shelf retains twelve covers", shell._library_box.get_child_count() == 12)
	await _check_library_layout("console_1280x720")
	shell.open_library("", {"auto_start": false})
	await _frames(8)
	var card_ids := _card_ids()
	_check("unfiltered library retains all twenty-two covers", card_ids.size() == 22)
	var focused: Control = viewport.gui_get_focus_owner()
	_check("enabled first card receives controller focus", focused == shell.first_library_button and focused != null and focused.focus_mode == Control.FOCUS_ALL)
	var wide_columns := shell._library_box.columns
	for size: Vector2i in [Vector2i(1280, 720), Vector2i(1280, 800), Vector2i(960, 720), Vector2i(1280, 720)]:
		viewport.size = size
		await _frames(8)
		var label := "%dx%d" % [size.x, size.y]
		_check("%s is the actual logical viewport size" % label, viewport.get_visible_rect().size.is_equal_approx(Vector2(size)))
		_check("%s resize retains the same open library and card nodes" % label, shell.is_open and shell.current_view == "library" and _card_ids() == card_ids)
		_check("%s resize retains controller focus" % label, viewport.gui_get_focus_owner() == focused)
		await _check_library_layout(label)
		if size.x == 960:
			_check("narrow resize repacks the existing cards into fewer columns", shell._library_box.columns < wide_columns)
	_check("resizing back restores room for the original column count", shell._library_box.columns == wide_columns)
	# Feed real pad navigation into this viewport's GUI, not a pressed signal.
	var right := InputEventJoypadButton.new()
	right.button_index = JOY_BUTTON_DPAD_RIGHT
	right.pressed = true
	viewport.push_input(right)
	await _frames(3)
	right.pressed = false
	viewport.push_input(right)
	await _frames(3)
	var moved_focus := viewport.gui_get_focus_owner()
	_check("D-pad navigation still reaches an enabled control in the shell", moved_focus != null and moved_focus != focused and shell._root.is_ancestor_of(moved_focus) and moved_focus.focus_mode == Control.FOCUS_ALL)
	_check("library resizing/navigation does not grant or remove cartridges", deck.ledger.unlocked == ownership_before)
	await _check_lower_row_focus()
	_check("lower-row focus checks leave library ownership unchanged", deck.ledger.unlocked == ownership_before)
	# Venue context exercises the real launch path without changing the ledger.
	# These are running cartridge ViewportTextures, never replacement test art.
	for sample: Dictionary in [
		{"id": "waste_heap", "size": Vector2i(640, 640)},
		{"id": "bunker_breaker", "size": Vector2i(540, 960)},
		{"id": "last_mile", "size": Vector2i(1280, 720)},
	]:
		var id := String(sample["id"])
		_check("%s launches a live cartridge through the shell" % id, shell.open_game(id, {"venue_owned": true, "source": "solo", "auto_start": true, "seed": 2026}))
		for size: Vector2i in [Vector2i(1280, 720), Vector2i(960, 720)]:
			viewport.size = size
			await _frames(8)
			var label := "%s_%dx%d" % [id, size.x, size.y]
			_check_frame(label)
			var texture: Texture2D = shell.screen_texture()
			var source_size: Vector2i = sample["size"]
			_check("%s retains the real source resolution" % label, texture is ViewportTexture and texture == deck.texture() and Vector2i(texture.get_size()) == source_size and deck.state == ProtoGameDeck.STATE_PLAYING)
			_check("%s keeps aspect-centered letterboxing inside the body" % label, shell._screen.stretch_mode == TextureRect.STRETCH_KEEP_ASPECT_CENTERED and shell._screen.expand_mode == TextureRect.EXPAND_IGNORE_SIZE and _in_frame(shell._screen))
			await _capture(label)
	_check("live aspect checks leave library ownership unchanged", deck.ledger.unlocked == ownership_before)
	shell.power_off()
	var viewport_ref: WeakRef = weakref(viewport)
	viewport.queue_free()
	viewport = null
	deck = null
	shell = null
	await _frames(4)
	_check("owned deck and shell viewport are freed before shutdown", viewport_ref.get_ref() == null)
	_finish.call_deferred()


func _check_lower_row_focus() -> void:
	viewport.size = Vector2i(1280, 720)
	await _frames(8)
	var crown := _card_named("crown_of_ash")
	var waste := _card_named("waste_heap")
	_check("lower-row regression uses the two real starter-owned cards", crown != null and waste != null and not crown.disabled and not waste.disabled)
	if crown == null or waste == null:
		return
	var ids := _card_ids()
	_check("lower-row focus starts with four columns", shell._library_box.columns == 4)
	crown.grab_focus()
	# follow_focus scrolls synchronously, but child positions update on the
	# queued layout. Wait before an explicit staging ensure, or its relative
	# delta would be applied twice against the same old card rectangle.
	await _frames(2)
	# Establish a fully visible lower-row starting condition using the real
	# scroll API. No ensure call is made after the resize or D-pad event.
	shell._library_scroll.ensure_control_visible(crown)
	await _frames(4)
	_check("lower-row focused card is fully visible before shrinking", viewport.gui_get_focus_owner() == crown and _card_fully_visible(crown))
	viewport.size = Vector2i(960, 720)
	await _frames(8)
	_check("shrinking repacks four columns to three without rebuilding", shell._library_box.columns == 3 and _card_ids() == ids)
	_check("shrinking retains the same lower-row focused card", viewport.gui_get_focus_owner() == crown)
	_check("same focused lower-row card remains fully visible after reflow", _card_fully_visible(crown))
	print("GAME_SHELL_LAYOUT: lower focus=%s card=%s scroll=%s offset=%d" % [crown.name, crown.get_global_rect(), shell._library_scroll.get_global_rect(), shell._library_scroll.scroll_vertical])
	# Both owned cards are enabled; the intervening locked cards stay locked.
	# DOWN crosses grid rows from WASTE HEAP to CROWN OF ASH through real GUI
	# navigation. The container must bring the new focused row into view.
	waste.grab_focus()
	await _frames(2)
	shell._library_scroll.ensure_control_visible(waste)
	await _frames(4)
	var down := InputEventJoypadButton.new()
	down.button_index = JOY_BUTTON_DPAD_DOWN
	down.pressed = true
	viewport.push_input(down)
	await _frames(3)
	down.pressed = false
	viewport.push_input(down)
	await _frames(3)
	_check("D-pad DOWN crosses rows to the enabled lower cartridge", viewport.gui_get_focus_owner() == crown and crown.get_global_rect().position.y > waste.get_global_rect().position.y)
	_check("D-pad row transition keeps the focused cartridge fully visible", _card_fully_visible(crown))
	await _capture("library_lower_row_focus_960x720")


func _card_named(id: String) -> ProtoGameCoverCard:
	for child: ProtoGameCoverCard in shell._library_box.get_children():
		if String(child.game_row.get("id", "")) == id:
			return child
	return null


func _card_fully_visible(card: Control) -> bool:
	var clip := shell._library_scroll.get_global_rect().intersection(viewport.get_visible_rect())
	clip = clip.intersection(shell._view_stack.get_global_rect())
	var scrollbar := shell._library_scroll.get_v_scroll_bar()
	if scrollbar.visible:
		clip.size.x = minf(clip.size.x, scrollbar.get_global_rect().position.x - clip.position.x)
	return clip.has_area() and clip.grow(0.5).encloses(card.get_global_rect())


func _card_ids() -> Array[int]:
	var ids: Array[int] = []
	for card: Node in shell._library_box.get_children():
		ids.append(card.get_instance_id())
	return ids


func _check_library_layout(label: String) -> void:
	_check_frame(label)
	# The ScrollContainer can itself grow past its anchors because of child
	# minima. Never treat an oversized scroll rectangle as the visible boundary.
	var clip := shell._library_scroll.get_global_rect().intersection(viewport.get_visible_rect())
	clip = clip.intersection(shell._view_stack.get_global_rect())
	var scrollbar := shell._library_scroll.get_v_scroll_bar()
	if scrollbar.visible:
		clip.size.x = minf(clip.size.x, scrollbar.get_global_rect().position.x - clip.position.x)
	var bounds_ok := true
	var states_ok := true
	var covers_ok := true
	var ownership_ok := true
	var art_shapes: Dictionary = {}
	var clipped_ids: Array[String] = []
	for child: Node in shell._library_box.get_children():
		var card := child as ProtoGameCoverCard
		if card == null:
			bounds_ok = false
			continue
		var rect := card.get_global_rect()
		var id := String(card.game_row.get("id", ""))
		var fits := rect.position.x >= clip.position.x - 0.5 and rect.end.x <= clip.end.x + 0.5
		if not fits:
			clipped_ids.append(id)
		bounds_ok = bounds_ok and fits
		states_ok = states_ok and rect.grow(0.5).encloses(card.state_label.get_global_rect())
		var art := card.cover_texture_rect
		covers_ok = covers_ok and card.art_loaded and art.texture != null \
			and art.stretch_mode == TextureRect.STRETCH_KEEP_ASPECT_CENTERED \
			and art.expand_mode == TextureRect.EXPAND_IGNORE_SIZE \
			and rect.grow(0.5).encloses(art.get_global_rect())
		if art.texture != null:
			var size := art.texture.get_size()
			art_shapes["square" if is_equal_approx(size.x, size.y) else ("portrait" if size.y > size.x else "landscape")] = true
		var available := bool(deck.registry.enabled(id))
		var owned := bool(deck.ledger.is_unlocked(id))
		ownership_ok = ownership_ok and card.disabled == (not available or not owned) and card.focus_mode == Control.FOCUS_ALL
	print("GAME_SHELL_LAYOUT: %s viewport=%s shell=%s scroll=%s visible_clip=%s grid=%s columns=%d clipped=%s" % [label, viewport.size, shell._root.get_global_rect(), shell._library_scroll.get_global_rect(), clip, shell._library_box.get_global_rect(), shell._library_box.columns, clipped_ids])
	_check("%s all card horizontal bounds fit scroll intersect viewport and body" % label, bounds_ok and clip.has_area())
	_check("%s complete card state strips remain within their cards" % label, states_ok)
	_check("%s all real cover textures remain contained and aspect-preserving" % label, covers_ok)
	_check("%s card availability/ownership and focus policy are unchanged" % label, ownership_ok)
	if shell._library_box.get_child_count() == 22:
		_check("%s live cover shelf includes square portrait and landscape art" % label, art_shapes.size() == 3)
	# Check that the final row is reachable without losing its lower state/text
	# area. Vertical scrolling is intentional; horizontal clipping is not.
	shell._library_scroll.scroll_vertical = int(scrollbar.max_value)
	await _frames(4)
	var last := shell._library_box.get_child(-1) as Control
	_check("%s final card can be scrolled fully into view" % label, clip.grow(0.5).encloses(last.get_global_rect()))
	shell._library_scroll.scroll_vertical = 0
	await _frames(4)
	await _capture("library_" + label)


func _check_frame(label: String) -> void:
	var fits := _in_frame(shell._root) and _in_frame(shell._title) and _in_frame(shell._status)
	for tab: Button in shell._tabs.values():
		fits = fits and _in_frame(tab)
	_check("%s entire bezel title tabs and status fit the viewport" % label, fits)
	var frame := shell._root.get_global_rect().grow(0.5)
	var body := shell._view_stack.get_global_rect().grow(0.5)
	_check("%s body remains inside bezel and viewport" % label, _in_frame(shell._view_stack) and frame.encloses(shell._view_stack.get_global_rect()))
	for control: Control in [shell._library_scroll, shell._screen, shell._text_scroll]:
		var surface := "library scroll" if control == shell._library_scroll else ("game screen" if control == shell._screen else "text scroll")
		_check("%s %s stays entirely inside body and viewport" % [label, surface], _in_frame(control) and body.encloses(control.get_global_rect()))


func _in_frame(control: Control) -> bool:
	var rect := control.get_global_rect()
	return rect.size.x > 0.0 and rect.size.y > 0.0 and viewport.get_visible_rect().grow(0.5).encloses(rect)


func _frames(count: int) -> void:
	for frame in count:
		await get_tree().process_frame


func _capture(label: String) -> void:
	if capture_dir.is_empty():
		return
	if DisplayServer.get_name() == "headless":
		_check("optional screenshots require rendering", false)
		return
	_check("capture directory is writable", DirAccess.make_dir_recursive_absolute(capture_dir) == OK)
	await RenderingServer.frame_post_draw
	var image := viewport.get_texture().get_image()
	_check("%s real viewport captured" % label, image != null and not image.is_empty() and image.save_png(capture_dir.path_join(label + ".png")) == OK)


func _finish() -> void:
	if finished:
		return
	finished = true
	print("GAME_SHELL_LAYOUT RESULTS: %d passed, %d failed" % [passed, failed])
	get_tree().quit(0 if failed == 0 else 1)
