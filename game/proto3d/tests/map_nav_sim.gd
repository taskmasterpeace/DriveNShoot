## Proof for the player-navigation first cut (2026-07-05): plant a HOME beacon (F),
## open the country atlas, CLICK a town to set your course, click open ground to
## drop a mark, and confirm N cycles back to HOME. Drives the real handlers with
## real key + mouse events (iron rule: no teleporting past the mechanic).
## KEY presses flush on the NEXT frame, so every press is observed a phase later;
## map clicks go straight through the gui_input handler (synchronous).
## Run: godot --headless --path game res://proto3d/tests/map_nav_sim.tscn
extends Node

var main: Node3D
var t := 0.0
var phase := 0
var phase_t := 0.0
var passed := 0
var failed := 0
var home_where := Vector3.ZERO
var town_name := ""
var town_pos := Vector3.ZERO
var n_count := 0


func _ready() -> void:
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	print("MAPNAV: scene up")
	# WATCHDOG (the iron rule — this sim was missing one and HUNG the headless suite
	# silently when a phase stalled; now it fails fast and names the stuck phase).
	get_tree().create_timer(60.0).timeout.connect(func() -> void:
		print("MAPNAV: WATCHDOG — stalled at phase %d (t=%.1f)" % [phase, phase_t])
		print("MAPNAV RESULTS: %d passed, %d failed" % [passed, failed + 1])
		print("MAPNAV: FAILURES PRESENT")
		get_tree().quit(1))


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("MAPNAV: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _key(code: Key) -> void:
	for pressed in [true, false]:
		var ev := InputEventKey.new()
		ev.keycode = code
		ev.physical_keycode = code
		ev.pressed = pressed
		Input.parse_input_event(ev)


func _find_wp(pred: Callable) -> int:
	for i in main.waypoints.size():
		if pred.call(main.waypoints[i]):
			return i
	return -1


func _home_count() -> int:
	var c := 0
	for w in main.waypoints:
		if w[0] == main.HOME_KEY:
			c += 1
	return c


func _town_screen(t_pos: Vector2) -> Vector2:
	var xf: Dictionary = main.stream._country_transform()
	return xf["org"] + (t_pos - (xf["bounds"] as Rect2).position) * float(xf["px"])


func _click_map(at: Vector2) -> void:
	var ev := InputEventMouseButton.new()
	ev.button_index = MOUSE_BUTTON_LEFT
	ev.pressed = true
	ev.position = at
	main.stream._on_map_input(ev) # the real gui_input handler (synchronous)


func _next() -> void:
	phase += 1
	phase_t = 0.0


func _physics_process(delta: float) -> void:
	t += delta
	phase_t += delta
	match phase:
		0:
			if phase_t > 0.8:
				home_where = main.active_car.global_position if main.active_car else main.player.global_position
				_key(KEY_F) # PLANT HOME (observed next phase)
				_next()
		1:
			if phase_t > 0.3:
				var idx := _find_wp(func(w): return w[0] == main.HOME_KEY)
				_check("F plants a HOME waypoint", idx >= 0)
				if idx >= 0:
					_check("HOME sits where you stood (%.0fm)" % main.waypoints[idx][1].distance_to(home_where),
						main.waypoints[idx][1].distance_to(home_where) < 3.0)
				_key(KEY_F) # press again — should MOVE home, not duplicate it
				_next()
		2:
			if phase_t > 0.3:
				_check("a second F MOVES home (still one 🏠, not two)", _home_count() == 1)
				_key(KEY_M) # -> local
				_next()
		3:
			if phase_t > 0.3:
				_key(KEY_M) # -> atlas
				_next()
		4:
			if phase_t > 0.4:
				_check("the country ATLAS is open (mode 2)", main.stream.map_open() and main.stream._map_mode == 2)
				main.stream._map_canvas.size = Vector2(600, 480) # deterministic layout, headless
				var picked: Dictionary = main.stream.usmap.town_near(Vector3(0, 0, 0), 1.0e9)
				town_name = String(picked["name"])
				var tp: Vector2 = picked["pos"]
				town_pos = Vector3(tp.x, 0.0, tp.y)
				_click_map(_town_screen(tp)) # CLICK the town (synchronous)
				_next()
		5:
			if phase_t > 0.2:
				var ci := _find_wp(func(w): return String(w[0]).begins_with(main.COURSE_PREFIX))
				_check("clicking a town SET A COURSE waypoint", ci >= 0)
				if ci >= 0:
					_check("the course is SELECTED (arrow points there now)", main.waypoint_idx == ci)
					_check("the course lands on %s (%.0fm off)" % [town_name, main.waypoints[ci][1].distance_to(town_pos)],
						main.waypoints[ci][1].distance_to(town_pos) < main.stream.usmap.cell_m)
					_check("the course label names the town", String(main.waypoints[ci][0]).contains(town_name))
				# Now click OPEN GROUND (>22px from every town) → a plain MARK, replacing the course.
				var xf: Dictionary = main.stream._country_transform()
				var org: Vector2 = xf["org"]
				var px: float = xf["px"]
				var bpos: Vector2 = (xf["bounds"] as Rect2).position
				var empty := Vector2(-1, -1)
				for gx in range(30, 570, 15):
					for gy in range(40, 440, 15):
						var c := Vector2(gx, gy)
						var nearest := 1.0e9
						for tw in main.stream.usmap.towns:
							nearest = minf(nearest, (org + ((tw["pos"] as Vector2) - bpos) * px).distance_to(c))
						if nearest > 22.0:
							empty = c
							break
					if empty.x >= 0:
						break
				_check("found open ground to click", empty.x >= 0)
				if empty.x >= 0:
					_click_map(empty)
				_next()
		6:
			if phase_t > 0.2:
				var marks := 0
				var courses := 0
				for w in main.waypoints:
					if String(w[0]).begins_with(main.COURSE_PREFIX):
						courses += 1
						if String(w[0]).contains("MARK"):
							marks += 1
				_check("open-ground click drops a MARK", marks == 1)
				_check("still only ONE course at a time (the town course was replaced)", courses == 1)
				_key(KEY_M) # close the atlas
				_next()
		7:
			# N-cycle to HOME: observe the prior press at frame start, then press again.
			if main.waypoint_idx >= 0 and main.waypoints[main.waypoint_idx][0] == main.HOME_KEY:
				_check("N can steer you back HOME (in %d presses)" % n_count, true)
				_next()
			elif n_count > main.waypoints.size() + 3:
				_check("N can steer you back HOME", false)
				_next()
			else:
				_key(KEY_N)
				n_count += 1
		8:
			print("MAPNAV RESULTS: %d passed, %d failed" % [passed, failed])
			print("MAPNAV: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
			get_tree().quit(0 if failed == 0 else 1)

	if t > 30.0:
		print("MAPNAV: TIMEOUT in phase %d" % phase)
		print("MAPNAV RESULTS: %d passed, %d failed" % [passed, failed])
		get_tree().quit(1)
