## Proof for EXIT NODES (World_Structures spec §5 + §19 exit_blueprint_sim):
## every exit node has an assigned TIER + a lawful archetype (the blueprints
## file), its RAMP roads exist as exit-kind roads that reach the destination
## (the local-road law), and its HIGHWAY SIGN materializes in the streamed world
## at the ramp mouth — the read that turns a drive into a DECISION. Buildings
## are still NOT placed (owner's order) — this is roads, ramps, and signs.
## Run: godot --headless --path game res://proto3d/tests/exit_blueprint_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node3D


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("EXIT: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _ready() -> void:
	print("EXIT: start")
	get_tree().create_timer(75.0).timeout.connect(func() -> void:
		print("EXIT: WATCHDOG"); print("EXIT: FAILURES PRESENT"); get_tree().quit(1))

	# --- The blueprints file: seven archetypes, each with a tier + services ------
	var bp_ok := FileAccess.file_exists("res://data/world/exit_blueprints.json")
	_check("exit_blueprints.json exists", bp_ok)
	var archetypes: Dictionary = {}
	if bp_ok:
		var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string("res://data/world/exit_blueprints.json"))
		for a in (parsed as Dictionary).get("exit_archetypes", []):
			archetypes[String((a as Dictionary).get("id", ""))] = a
	_check("all SEVEN archetypes present (spec §5 table)", archetypes.size() == 7
		and archetypes.has("service") and archetypes.has("military_spur") and archetypes.has("dead"))

	# --- The map's exit nodes are lawful ------------------------------------------
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 8:
		await get_tree().process_frame
	var m: ProtoUSMap = main.stream.usmap
	_check("the map carries EXIT NODES (%d)" % m.exits.size(), m.exits.size() >= 1)
	var all_lawful := true
	var ramps_ok := true
	var local_road_ok := true
	for e in m.exits:
		if String(e["community_tier"]) == "" or not archetypes.has(String(e["archetype"])):
			all_lawful = false
		# Every node's ramps exist as exit-kind roads (§5: off-ramp; return if declared).
		var found_ramps := 0
		for road in m.roads:
			if String(road.get("kind", "")) == "exit":
				var pts: PackedVector2Array = road["pts"]
				if pts.size() >= 2 and (pts[0].distance_to(e["pos"]) < 30.0 or pts[pts.size() - 1].distance_to(e["pos"]) < 200.0):
					found_ramps += 1
		if found_ramps < 1:
			ramps_ok = false
		# The LOCAL ROAD law: the ramp reaches the destination (road_near at dest).
		var near: Dictionary = m.road_near(Vector3(e["dest"].x, 0, e["dest"].y), 60.0)
		if near.is_empty():
			local_road_ok = false
	_check("every node has a TIER + a lawful ARCHETYPE", all_lawful)
	_check("every node's RAMP exists (exit-kind road at the anchor)", ramps_ok)
	_check("every ramp REACHES its destination (the local-road law)", local_road_ok)

	# --- The Meridian interchange is canon -----------------------------------------
	var mx: Dictionary = {}
	for e in m.exits:
		if String(e["id"]) == "I-95_X1":
			mx = e
	_check("EXIT 1 — MERIDIAN is on I-95 (T3 county_seat)",
		not mx.is_empty() and String(mx["highway_id"]) == "I-95"
		and String(mx["community_tier"]) == "T3" and String(mx["archetype"]) == "county_seat")

	# --- The SIGN materializes in the streamed world (§18) --------------------------
	main._exit_car()
	var p: ProtoPlayer3D = main.player
	p.global_position = Vector3(1204, 0.35, 282) # the ramp mouth on I-95
	p.velocity = Vector3.ZERO
	var sign_found := false
	var sign_text := ""
	for _i in 240:
		await get_tree().physics_frame
		for node in get_tree().get_nodes_in_group("exit_sign"):
			if String(node.get_meta("exit_id")) == "I-95_X1":
				sign_found = true
				var s := node as ProtoSign
				for c in s.get_children():
					if c is Label3D and (c as Label3D).text.contains("EXIT"):
						sign_text = (c as Label3D).text
		if sign_found:
			break
	_check("the EXIT SIGN rises at the ramp mouth (streamed)", sign_found)
	_check("the sign READS the decision (%s)" % sign_text,
		sign_text.contains("EXIT 1") and sign_text.contains("MERIDIAN") and sign_text.contains("T3"))

	print("EXIT RESULTS: %d passed, %d failed" % [passed, failed])
	print("EXIT: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
