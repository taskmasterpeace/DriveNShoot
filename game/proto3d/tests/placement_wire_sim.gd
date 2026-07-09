## Proof for THE MATERIALIZE WIRE (AMERICAN_ROAD M0): streamed-chunk placements
## with catalog ids come out of world_stream as REAL structure shells (signed,
## chest-seeded, metad), the gas_station→gas_station_small MIGRATION alias
## lands, and unknown ids keep the massing-box FALLBACK (0.7's law — deleting it
## early turns un-migrated towns into nulls). Boots the real scene; the chunk
## build call is the same function streaming runs.
## Run: godot --headless --path game res://proto3d/tests/placement_wire_sim.tscn
extends Node

var passed := 0
var failed := 0


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("PWIRE: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _finish(prev_scale: float) -> void:
	Engine.time_scale = prev_scale
	print("PWIRE RESULTS: %d passed, %d failed" % [passed, failed])
	print("PWIRE: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)


func _ready() -> void:
	print("PWIRE: start")
	var prev_scale := Engine.time_scale
	Engine.time_scale = 1.0
	get_tree().create_timer(90.0).timeout.connect(func() -> void:
		print("PWIRE: WATCHDOG")
		failed += 1
		_finish(prev_scale))

	var main: Node = load("res://proto3d/proto3d.tscn").instantiate()
	add_child(main)
	for i in range(40):
		await get_tree().process_frame

	var stream: ProtoWorldStream = main.stream
	DrivnData.ensure_structures()

	# --- 1) Find a REAL usmap placement outside the authored rect with a
	# catalog id, and build ITS chunk through the real chunk path. -------------
	var target: Dictionary = {}
	for p in stream.usmap.placements_in(Rect2(-1e7, -1e7, 2e7, 2e7)):
		var pos2 := Vector2(p["pos"].x, p["pos"].y)
		if ProtoWorldStream.AUTHORED.has_point(pos2):
			continue
		var sid := String(ProtoWorldStream.ID_MIGRATE.get(p["building"], p["building"]))
		if DrivnData.structures.has(sid):
			target = p
			break
	_check("usmap has a non-authored placement with a catalog id", not target.is_empty())
	if not target.is_empty():
		var chunk_m := float(ProtoWorldStream.CHUNK)
		var cx := int(floor(target["pos"].x / chunk_m))
		var cz := int(floor(target["pos"].y / chunk_m))
		var chunk: Node3D = stream._spawn_chunk(cx, cz)
		_check("the placement's chunk builds (real _spawn_chunk path)", chunk != null)
		var found: Node3D = null
		if chunk != null:
			for s in get_tree().get_nodes_in_group("structure"):
				if s is Node3D and String(s.get_meta("placement_id", "")) == String(target["id"]):
					found = s
					break
		_check("placement '%s' (%s) materialized as a STRUCTURE SHELL, not a box"
				% [target["id"], target["building"]],
			found != null and found.has_meta("structure_id"))
		if chunk != null:
			chunk.queue_free()

	# --- 2) THE MIGRATION ALIAS: a legacy 'gas_station' id becomes the
	# gas_station_small shell (rows migrated, zero data edits needed). ---------
	var host := Node3D.new()
	add_child(host)
	stream._spawn_placement(host, {"id": "pwire-alias", "building": "gas_station", "pos": Vector2(9000, 9000)})
	await get_tree().process_frame
	var alias_shell: Node3D = null
	for c in host.get_children():
		if c.has_meta("placement_id") and String(c.get_meta("placement_id")) == "pwire-alias":
			alias_shell = c
	_check("legacy 'gas_station' aliases to the gas_station_small shell",
		alias_shell != null and String(alias_shell.get_meta("structure_id", "")) == "gas_station_small")
	_check("...and keeps its ORIGINAL building meta (the save/tools read it)",
		alias_shell != null and String(alias_shell.get_meta("building", "")) == "gas_station")

	# --- 3) THE FALLBACK LAW: an unknown id still boxes (never a null town) ----
	stream._spawn_placement(host, {"id": "pwire-unknown", "building": "definitely_not_a_row", "pos": Vector2(9020, 9000)})
	await get_tree().process_frame
	var box: Node = null
	for c in host.get_children():
		if c.has_meta("placement_id") and String(c.get_meta("placement_id")) == "pwire-unknown":
			box = c
	_check("an unknown building id still gets the massing-box fallback",
		box != null and not box.has_meta("structure_id"))
	host.queue_free()

	_finish(prev_scale)
