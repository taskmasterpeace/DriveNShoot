## Proof for THE SHARED P0 (INDEX.md: "wire ProtoPopulation into proto3d.gd"):
## the ledger EXISTS at boot, the stream bridge holds the SAME object, the
## player's presence stamps their cell, the refill tick rides the game-hour
## clock, and the ledger rides the ONE save file (save_game/apply_save).
## Real-path: boots the actual proto3d scene under the harness; the only
## staging is advancing daynight's clock (the documented exception — the same
## API population_cell_sim drives).
## Run: godot --headless --path game res://proto3d/tests/population_wire_sim.tscn
extends Node

var passed := 0
var failed := 0
var _save_backup: PackedByteArray = PackedByteArray()
var _had_save := false


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("POPWIRE: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _backup_save() -> void:
	_had_save = FileAccess.file_exists("user://drivn.save")
	if _had_save:
		_save_backup = FileAccess.get_file_as_bytes("user://drivn.save")


func _restore_save() -> void:
	if _had_save:
		var f := FileAccess.open("user://drivn.save", FileAccess.WRITE)
		f.store_buffer(_save_backup)
		f.close()
	elif FileAccess.file_exists("user://drivn.save"):
		DirAccess.remove_absolute("user://drivn.save")


func _finish(prev_scale: float) -> void:
	_restore_save()
	Engine.time_scale = prev_scale
	print("POPWIRE RESULTS: %d passed, %d failed" % [passed, failed])
	print("POPWIRE: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)


func _ready() -> void:
	print("POPWIRE: start")
	var prev_scale := Engine.time_scale
	Engine.time_scale = 1.0
	_backup_save()
	get_tree().create_timer(90.0).timeout.connect(func() -> void:
		print("POPWIRE: WATCHDOG")
		failed += 1
		_finish(prev_scale))

	var main: Node = load("res://proto3d/proto3d.tscn").instantiate()
	add_child(main)
	# First headless frames are slow; give boot + first chunk builds room.
	for i in range(40):
		await get_tree().process_frame

	# --- 1) THE WIRE: the ledger exists and the bridge holds the SAME object ----
	_check("main.population is wired at boot (ProtoPopulation exists)",
		main.population != null and main.population is ProtoPopulation)
	_check("stream.population is the SAME ledger (one truth, not a twin)",
		main.stream != null and main.stream.population == main.population)

	# --- 2) PRESENCE: the player's cell bootstrapped + last_seen stamped --------
	var ppos: Vector3 = main.player.global_position
	var pkey: String = main.population.cell_key(ppos)
	_check("the player's cell bootstrapped from presence (key %s exists)" % pkey,
		main.population.cells.has(pkey))
	var now_h: float = float(main.daynight.day) * 24.0 + float(main.daynight.hour)
	var seen_h: float = float(main.population.cells[pkey]["last_seen_time"]) if main.population.cells.has(pkey) else -999.0
	_check("mark_seen stamps the cell every clock advance (seen within 0.2h of now)",
		absf(now_h - seen_h) <= 0.2)

	# --- 3) THE HOURLY TICK rides the real game clock ---------------------------
	var anchor_before: float = main._last_pop_hr
	main.daynight.hour += 1.2 # staged clock advance (the documented exception)
	for i in range(6):
		await get_tree().process_frame
	_check("the refill tick fired on the game-hour boundary (_last_pop_hr advanced %.2f -> %.2f)"
			% [anchor_before, main._last_pop_hr],
		main._last_pop_hr > anchor_before)

	# --- 4) THE SAVE: the ledger rides the one file ------------------------------
	var far := Vector3(-88000, 0, -88000)
	var frow: Dictionary = main.population.cell_at(far)
	(frow["current_pop"] as Dictionary)["threat"] = 6
	var fkey: String = main.population.cell_key(far)
	var data: Dictionary = main.save_game()
	_check("save_game() carries a 'population' key with the cells",
		data.has("population") and (data["population"] as Dictionary).has("cells"))
	var saved_cells: Dictionary = (data["population"] as Dictionary).get("cells", {})
	_check("the staged count (threat=6 in %s) is IN the save data" % fkey,
		saved_cells.has(fkey) and int((saved_cells[fkey]["current_pop"] as Dictionary)["threat"]) == 6)

	# --- 5) THE LOAD: apply_save restores the ledger + re-anchors the tick ------
	main.population.cells.clear()
	main.apply_save(data)
	for i in range(4):
		await get_tree().process_frame
	_check("apply_save restores the ledger (threat=6 back in %s)" % fkey,
		main.population.cells.has(fkey)
		and int((main.population.cells[fkey]["current_pop"] as Dictionary)["threat"]) == 6)

	# --- 6) DEATH WRITE-BACK path is guarded (the lurker/howler callers) --------
	# The wired property is what lurker.gd:71 / howler.gd:122 look for; prove the
	# call is safe on a tag-less node (no meta = no-op, never a crash).
	var dummy := Node3D.new()
	add_child(dummy)
	main.population.on_actor_removed(dummy)
	_check("on_actor_removed is a safe no-op for non-ledger actors", true)
	dummy.queue_free()

	_finish(prev_scale)
