## Proof for THE MERIDIAN REDO (owner order 2026-07-09: "redo meridian so it
## includes all the testing elements"): every spec-web testing element exists as
## a materialized structure shell in the authored town — placed from usmap ROWS
## through ProtoStructureBuilder (its first world consumer) — inside the
## AUTHORED rect, non-overlapping, signed, and (where enterable) with a REAL
## door gap a body can walk through (proven by physics ray, not by faith).
## Run: godot --headless --path game res://proto3d/tests/meridian_town_sim.tscn
extends Node

var passed := 0
var failed := 0

## The testing elements the spec web names (INDEX.md ledger -> its consumers):
## FAMILY (diner/church/school/houses/jeweler/restaurant) · SPECTACLES
## (fight_pit/derby/grandstand/drone_ring/bar) · CLONING (clinic/clone_wing/vat)
## · MUD (auto_shop/junkyard) · SECURITY (police) · media (radio) · freight
## (warehouse/market/gas/motel).
const EXPECTED: PackedStringArray = [
	"clinic_small", "clone_wing", "school_small", "church_small", "police_station",
	"motel_strip", "radio_station", "auto_shop", "diner_roadside", "bar_roadhouse",
	"jeweler", "restaurant_fancy", "market_general", "gas_station_small", "drone_ring",
	"fight_pit", "house_small", "junkyard", "blackmarket_vat", "warehouse",
	"derby_bowl", "race_track_grandstand",
]


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("MER: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _finish(prev_scale: float) -> void:
	Engine.time_scale = prev_scale
	print("MER RESULTS: %d passed, %d failed" % [passed, failed])
	print("MER: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)


## Ray from just outside the shell's front doorway to its center: an enterable
## shell must NOT block it (the door gap is real); a massing block MUST.
func _door_ray_blocked(main: Node, shell: Node3D, depth: float) -> bool:
	var space := (main as Node3D).get_world_3d().direct_space_state
	var outside: Vector3 = shell.to_global(Vector3(0, 1.2, depth * 0.5 + 0.8))
	var inside: Vector3 = shell.to_global(Vector3(0, 1.2, 0))
	var q := PhysicsRayQueryParameters3D.create(outside, inside)
	return not space.intersect_ray(q).is_empty()


func _ready() -> void:
	print("MER: start")
	var prev_scale := Engine.time_scale
	Engine.time_scale = 1.0
	get_tree().create_timer(90.0).timeout.connect(func() -> void:
		print("MER: WATCHDOG")
		failed += 1
		_finish(prev_scale))

	var main: Node = load("res://proto3d/proto3d.tscn").instantiate()
	add_child(main)
	for i in range(40):
		await get_tree().physics_frame

	# --- 1) Every testing element materialized (by structure_id meta) -----------
	var shells: Dictionary = {} # structure_id -> Array[Node3D]
	for s in get_tree().get_nodes_in_group("structure"):
		if s is Node3D and s.has_meta("structure_id"):
			var sid := String(s.get_meta("structure_id"))
			if not shells.has(sid):
				shells[sid] = []
			(shells[sid] as Array).append(s)
	for sid in EXPECTED:
		_check("testing element '%s' is materialized in the world" % sid, shells.has(sid))
	_check("the residential lane has BOTH houses (house_small x2 for the NAV walk tests)",
		shells.has("house_small") and (shells["house_small"] as Array).size() >= 2)

	# --- 2) Every shell sits INSIDE the authored rect (hand-built land) ---------
	var all_in := true
	for sid in shells:
		for s in (shells[sid] as Array):
			if not ProtoWorldStream.AUTHORED.has_point(Vector2((s as Node3D).global_position.x, (s as Node3D).global_position.z)):
				all_in = false
				print("MER: OUTSIDE AUTHORED: %s at %s" % [sid, (s as Node3D).global_position])
	_check("every placed shell is inside the AUTHORED rect", all_in)

	# --- 3) No two shells overlap (rot-aware AABB on the catalog footprints) ----
	DrivnData.ensure_structures()
	var boxes: Array = []
	for sid in shells:
		for s in (shells[sid] as Array):
			var row: DrivnStructure = DrivnData.structures.get(String(sid))
			if row == null:
				continue
			var n3 := s as Node3D
			var swap := absf(fposmod(absf(n3.rotation.y), PI) - PI * 0.5) < 0.2
			var w := (row.footprint_m.y if swap else row.footprint_m.x)
			var d := (row.footprint_m.x if swap else row.footprint_m.y)
			boxes.append([sid, n3.global_position.x - w * 0.5, n3.global_position.x + w * 0.5,
				n3.global_position.z - d * 0.5, n3.global_position.z + d * 0.5])
	var overlaps := 0
	for i in range(boxes.size()):
		for j in range(i + 1, boxes.size()):
			var a: Array = boxes[i]
			var b: Array = boxes[j]
			if a[1] < b[2] and b[1] < a[2] and a[3] < b[4] and b[3] < a[4]:
				overlaps += 1
				print("MER: OVERLAP %s x %s" % [a[0], b[0]])
	_check("no two placed shells overlap (rot-aware AABB, %d boxes)" % boxes.size(), overlaps == 0)

	# --- 4) Enterable shells have a REAL door gap; massing blocks are solid -----
	for probe in [["diner_roadside", true], ["church_small", true], ["fight_pit", true], ["derby_bowl", false]]:
		var sid2 := String(probe[0])
		var wants_open: bool = probe[1]
		if not shells.has(sid2):
			_check("door probe on '%s' (missing shell)" % sid2, false)
			continue
		var row2: DrivnStructure = DrivnData.structures.get(sid2)
		var blocked := _door_ray_blocked(main, (shells[sid2] as Array)[0], row2.footprint_m.y)
		if wants_open:
			_check("'%s' front doorway is a REAL walkable gap (ray passes)" % sid2, not blocked)
		else:
			_check("'%s' is honest MASS (ray blocked — no fake doorway)" % sid2, blocked)

	# --- 5) The read + the loot: sign out front, cache where the row rolls one --
	var diner: Node3D = (shells["diner_roadside"] as Array)[0] if shells.has("diner_roadside") else null
	var has_sign := false
	var has_chest := false
	if diner != null:
		for c in diner.get_children():
			if c is ProtoSign:
				has_sign = true
			if c is ProtoChest:
				has_chest = true
	_check("the diner has its SIGN out front (every structure reads from the road)", has_sign)
	_check("the diner rolled its loot cache (chest_common row)", has_chest)

	# --- 6) The placement layer is data-honest: metas carried for the systems ---
	var meta_ok := diner != null and diner.has_meta("npc_jobs") and diner.has_meta("event_hooks") \
		and diner.has_meta("placement_id") and diner.is_in_group("placement")
	_check("shells carry npc_jobs/event_hooks/placement_id metas + the placement group", meta_ok)

	_finish(prev_scale)
