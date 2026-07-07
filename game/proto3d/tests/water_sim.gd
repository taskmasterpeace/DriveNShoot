## Proof for WATER ON FOOT (MOVESET.txt): one AUTOMATIC state by depth, no key.
## Water near dry land = WADE (slow); open water = SWIM (slower, lungs drain,
## hands busy — no strikes); an empty tank = DROWNING (the torso pays). The sim
## probes the REAL usmap for a real shoreline — no synthetic water.
## Run: godot --headless --path game res://proto3d/tests/water_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node3D


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("WATER: %s - %s" % ["PASS" if ok else "FAIL", check_name])


## Find a real shoreline on the macro map: a WATER cell with a DRY 4-neighbor.
## Returns {"edge": 2m into the water off the dry side, "center": mid-cell} or {}.
func _find_shore(m: ProtoUSMap) -> Dictionary:
	for cy in m.h:
		for cx in m.w:
			if String(m.legend.get(m.grid[cy][cx], "")) != "water":
				continue
			for n in [Vector2i(-1, 0), Vector2i(1, 0), Vector2i(0, -1), Vector2i(0, 1)]:
				var nx: int = cx + n.x
				var ny: int = cy + n.y
				if nx < 0 or nx >= m.w or ny < 0 or ny >= m.h:
					continue
				var nb := String(m.legend.get(m.grid[ny][nx], ""))
				if nb == "water" or nb == "ocean":
					continue
				var c := m.cell_center(Vector2i(cx, cy))
				var edge := Vector3(c.x, 0.35, c.y)
				if n.x != 0:
					edge.x = m.offset.x + (cx + (0.0 if n.x < 0 else 1.0)) * m.cell_m - n.x * 2.0
				else:
					edge.z = m.offset.y + (cy + (0.0 if n.y < 0 else 1.0)) * m.cell_m - n.y * 2.0
				return {"edge": edge, "center": Vector3(c.x, 0.35, c.y)}
	return {}


func _mouse(down: bool) -> void:
	var ev := InputEventMouseButton.new()
	ev.button_index = MOUSE_BUTTON_LEFT
	ev.pressed = down
	Input.parse_input_event(ev)


func _ready() -> void:
	print("WATER: start")
	get_tree().create_timer(75.0).timeout.connect(func() -> void:
		print("WATER: WATCHDOG"); print("WATER: FAILURES PRESENT"); get_tree().quit(1))
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 8:
		await get_tree().process_frame

	main._exit_car()
	main.daynight.hour = 12.0 # broad daylight — no pack interference out there
	var p: ProtoPlayer3D = main.player
	p.global_position = Vector3(6, 0.35, 388)
	p.velocity = Vector3.ZERO
	for _i in 6:
		await get_tree().physics_frame
	_check("dry land reads dry", main.water_state == "")

	var shore := _find_shore(main.stream.usmap)
	_check("the macro map HAS a real shoreline", not shore.is_empty())
	if shore.is_empty():
		print("WATER RESULTS: %d passed, %d failed" % [passed, failed])
		print("WATER: FAILURES PRESENT")
		get_tree().quit(1)
		return

	# --- WADE: 2 m into the water, dry land a stride away ----------------------
	p.global_position = shore["edge"]
	p.velocity = Vector3.ZERO
	for _i in 6:
		await get_tree().physics_frame
	_check("the water's edge is a WADE", main.water_state == "wade")
	_check("wading is SLOW (×%.2f)" % p.speed_mult, absf(p.speed_mult - 0.55) < 0.01)

	# --- SWIM: mid-cell, open water every direction ----------------------------
	p.global_position = shore["center"]
	p.velocity = Vector3.ZERO
	p.stamina = p.max_stamina
	for _i in 6:
		await get_tree().physics_frame
	_check("open water is a SWIM", main.water_state == "swim")
	_check("swimming is SLOWER (×%.2f)" % p.speed_mult, absf(p.speed_mult - 0.45) < 0.01)
	var stam0: float = p.stamina
	for _i in 30:
		await get_tree().physics_frame
	_check("the swim DRAINS your lungs (%.1f → %.1f)" % [stam0, p.stamina], p.stamina < stam0 - 1.0)
	_mouse(true)
	await get_tree().physics_frame
	_check("hands are busy afloat — no strikes", not main._fist_pressed)
	_mouse(false)
	await get_tree().physics_frame

	# --- DROWNING: an empty tank and the water starts taking -------------------
	var torso0: float = main.character.body["torso"].hp
	p.stamina = 1.0
	for _i in 70:
		await get_tree().physics_frame
	_check("empty lungs = DROWNING (torso %.1f → %.1f)" % [torso0, main.character.body["torso"].hp],
		main.character.body["torso"].hp < torso0 - 1.0)

	# --- OUT: land restores everything -----------------------------------------
	p.global_position = Vector3(6, 0.35, 388)
	p.velocity = Vector3.ZERO
	for _i in 6:
		await get_tree().physics_frame
	_check("back on land reads dry", main.water_state == "")
	_check("dry speed restores (×%.2f)" % p.speed_mult, p.speed_mult > 0.9)
	var stam1: float = p.stamina
	for _i in 30:
		await get_tree().physics_frame
	_check("lungs refill on land", p.stamina > stam1)

	print("WATER RESULTS: %d passed, %d failed" % [passed, failed])
	print("WATER: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
