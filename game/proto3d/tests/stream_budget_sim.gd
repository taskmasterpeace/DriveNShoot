## Proof for the STREAMING LOAD BUDGET (world_stream.gd — mined from
## LittleFernStudio/Chunk-Loader, MIT). A fresh arrival fills the ring at once; steady-
## state driving spawns at most LOAD_BUDGET chunks/frame from a nearest-first queue, so a
## boundary cross no longer builds a whole row in one frame. Drives the REAL stream (same
## setup as map_sim), never fakes the result. Run:
## godot --headless --path game res://proto3d/tests/stream_budget_sim.tscn
extends Node

var passed := 0
var failed := 0

var usmap
var stream: ProtoWorldStream


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("STREAM: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _ready() -> void:
	usmap = ProtoUSMap.get_default()
	ProtoWorldBuilder.usmap = usmap
	ProtoWorldBuilder.extra_road_rects.clear()
	stream = ProtoWorldStream.new()
	add_child(stream)
	stream.setup([])

	var ring := ProtoWorldStream.RING
	var full := (2 * ring + 1) * (2 * ring + 1)   # 49 for RING=3
	var budget := ProtoWorldStream.LOAD_BUDGET
	var chunk := ProtoWorldStream.CHUNK

	# --- 1. FRESH arrival fills the whole ring in ONE call (ground underfoot now). ---
	var p0 := Vector3(0, 0.5, 0)
	stream.update_stream(p0, self)
	_check("fresh fill loads the whole ring at once (%d == %d)" % [stream.loaded.size(), full], stream.loaded.size() == full)
	_check("fresh fill leaves the queue empty", stream._load_queue.is_empty())

	# --- 2. Boundary cross is BUDGETED: at most LOAD_BUDGET new chunks this frame. ---
	var before: int = stream.loaded.size()
	var p1 := p0 + Vector3(chunk, 0, 0)           # one chunk east; the new chunk was already loaded → not fresh
	stream.update_stream(p1, self)
	var grew: int = stream.loaded.size() - before
	_check("boundary cross builds ≤ LOAD_BUDGET this frame (grew %d ≤ %d)" % [grew, budget], grew <= budget)
	_check("the rest of the new edge is queued, not built", not stream._load_queue.is_empty())

	# --- 3. Draining over frames completes the new leading edge. ---
	for _i in 5:
		stream.update_stream(p1, self)
	_check("queue drains to empty after enough frames", stream._load_queue.is_empty())
	var ccx1 := int(floor(p1.x / chunk))
	var ccz1 := int(floor(p1.z / chunk))
	var edge_loaded := true
	for dz in range(-ring, ring + 1):
		if not stream.loaded.has("%d,%d" % [ccx1 + ring, ccz1 + dz]):
			edge_loaded = false
	_check("the full leading column is loaded once drained", edge_loaded)

	# --- 4. NEAREST-FIRST + budget, on a controlled queue (a second clean stream). ---
	var s2 := ProtoWorldStream.new()
	add_child(s2)
	s2.setup([])
	# Seed a queue of known distances from the player at world origin; all within RING.
	s2._load_queue = [Vector2i(3, 3), Vector2i(0, 0), Vector2i(2, 2), Vector2i(1, 0), Vector2i(0, 1)]
	s2._drain_load_queue(Vector3.ZERO, 0, 0)      # player at chunk (0,0)
	# The three NEAREST (0,0),(1,0),(0,1) get built; the two farthest stay queued.
	_check("nearest 3 built: (0,0)", s2.loaded.has("0,0"))
	_check("nearest 3 built: (1,0)", s2.loaded.has("1,0"))
	_check("nearest 3 built: (0,1)", s2.loaded.has("0,1"))
	_check("farthest NOT built: (2,2)", not s2.loaded.has("2,2"))
	_check("farthest NOT built: (3,3)", not s2.loaded.has("3,3"))
	_check("exactly LOAD_BUDGET built, 2 still queued", s2._load_queue.size() == 2)

	print("STREAM: DONE — %d passed, %d failed" % [passed, failed])
	get_tree().quit(1 if failed > 0 else 0)
