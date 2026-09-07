extends Node
## Focused proof for the validated transit catalog and atomic local ticket record.

const CATALOG_PATH: String = "res://proto3d/transit/catalog.gd"
const TICKET_PATH: String = "res://proto3d/transit/ticket_state.gd"

var passed: int = 0
var failed: int = 0
var root: String
var catalog_script: Script
var ticket_script: Script
var catalog: Variant


func check(label: String, condition: bool) -> void:
	passed += int(condition)
	failed += int(not condition)
	print("TRANSIT TICKET: %s - %s" % ["PASS" if condition else "FAIL", label])


func _ready() -> void:
	var checkout: String = _canonical(ProjectSettings.globalize_path("res://").path_join(".."))
	var profile: String = _canonical(OS.get_user_data_dir())
	if not _profile_is_allowed(profile, checkout):
		print("TRANSIT TICKET PROFILE: REFUSED " + JSON.stringify({"user_data_dir": profile, "checkout": checkout}))
		get_tree().quit(2)
		return
	get_tree().create_timer(60.0).timeout.connect(func() -> void: get_tree().quit(1))
	print("TRANSIT TICKET: isolated profile " + profile)
	check("service cannot exist without runtime catalog", ResourceLoader.exists(CATALOG_PATH))
	check("ticket lifecycle implementation exists", ResourceLoader.exists(TICKET_PATH))
	if failed > 0:
		_finish()
		return
	catalog_script = load(CATALOG_PATH)
	ticket_script = load(TICKET_PATH)
	check("runtime scripts instantiate", catalog_script != null and catalog_script.can_instantiate() and ticket_script != null and ticket_script.can_instantiate())
	if failed > 0:
		_finish()
		return
	root = "user://transit_ticket_%d_%d" % [OS.get_process_id(), Time.get_ticks_usec()]
	DirAccess.make_dir_recursive_absolute(root)
	_test_catalog()
	_test_ticket_validation_and_lifecycle()
	_test_atomic_failures_and_recovery()
	_cleanup()
	_finish()


func _test_catalog() -> void:
	var map: ProtoUSMap = ProtoUSMap.new()
	check("actual national map loads", map.load_file("res://data/usmap.json"))
	var road_before: PackedVector2Array = (map.road_by_id("CR-meridian-richmond")["pts"] as PackedVector2Array).duplicate()
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string("res://data/transit.json"))
	check("transit rows parse as a dictionary", parsed is Dictionary)
	if not parsed is Dictionary:
		return
	catalog = catalog_script.new()
	check("shipped transit catalog validates", catalog.setup(parsed, map) and catalog.valid and catalog.errors.is_empty())
	check("catalog exposes two stops and four services", catalog.stops.size() == 2 and catalog.services.size() == 4)
	check("LASTLINE row keeps literal fare capacity and speed", catalog.services.lastline_east.fare == 2 and catalog.services.lastline_east.capacity == 6 and catalog.services.lastline_east.speed_mps == 12.0)
	check("KESTREL row keeps literal fare capacity and speed", catalog.services.kestrel_west.fare == 15 and catalog.services.kestrel_west.capacity == 3 and catalog.services.kestrel_west.speed_mps == 28.0)
	check("schedule returns the first multiple at or after now", catalog.next_departure("lastline_east", 710.0) == 720.0 and catalog.next_departure("lastline_east", 720.0) == 720.0 and catalog.next_departure("lastline_east", 721.0) == 1080.0)
	var meridian: Vector3 = catalog.stop_position("meridian_east")
	var richmond: Vector3 = catalog.stop_position("richmond")
	check("Meridian standing point uses exact south shoulder geometry", absf(meridian.x - 259.290) < 0.02 and absf(meridian.z - -275.806) < 0.02 and absf(meridian.y - ProtoWorldBuilder.ground_y(meridian.x, meridian.z)) < 0.001)
	check("Richmond standing point uses amended clear fraction", absf(richmond.x - 1292.890) < 0.02 and absf(richmond.z - -243.806) < 0.02 and absf(richmond.y - ProtoWorldBuilder.ground_y(richmond.x, richmond.z)) < 0.001)
	var east: PackedVector3Array = catalog.route_points("lastline_east")
	var west: PackedVector3Array = catalog.route_points("lastline_west")
	check("east route follows reverse source order on its right lane", east.size() == 2 and absf(east[0].x - 259.624) < 0.02 and absf(east[0].z - -286.601) < 0.02 and absf(east[1].x - 1293.224) < 0.02 and absf(east[1].z - -254.601) < 0.02)
	check("west route follows source order on its right lane", west.size() == 2 and absf(west[0].x - 1293.336) < 0.02 and absf(west[0].z - -258.199) < 0.02 and absf(west[1].x - 259.736) < 0.02 and absf(west[1].z - -290.199) < 0.02)
	check("catalog never mutates authoritative road points", map.road_by_id("CR-meridian-richmond")["pts"] == road_before)
	var detached: Dictionary = parsed.duplicate(true)
	var copied: Variant = catalog_script.new()
	check("independent catalog accepts detached rows", copied.setup(detached, map))
	detached.stops[0].name = "FORGED"
	detached.services[0].fare = 999
	check("catalog rows are deep copies", copied.stops.meridian_east.name == "Meridian East" and copied.services.lastline_east.fare == 2)

	var bad: Dictionary = parsed.duplicate(true)
	bad.stops.append(bad.stops[0].duplicate(true))
	check("duplicate stop IDs reject the catalog", not _accepts(bad, map))
	bad = parsed.duplicate(true)
	bad.services.append(bad.services[0].duplicate(true))
	check("duplicate service IDs reject the catalog", not _accepts(bad, map))
	bad = parsed.duplicate(true)
	bad.stops[0].road = "missing-road"
	check("unknown stop roads reject the catalog", not _accepts(bad, map))
	bad = parsed.duplicate(true)
	bad.stops[0].fraction = 1.1
	check("out-of-range stop fractions reject the catalog", not _accepts(bad, map))
	bad = parsed.duplicate(true)
	bad.stops[0].fraction = NAN
	check("nonfinite stop coordinates reject the catalog", not _accepts(bad, map))
	bad = parsed.duplicate(true)
	bad.stops[0].side = 0
	check("invalid stop sides reject the catalog", not _accepts(bad, map))
	bad = parsed.duplicate(true)
	bad.services[0].headway_minutes = 0.0
	check("nonpositive headways reject the catalog", not _accepts(bad, map))
	bad = parsed.duplicate(true)
	bad.services[0].speed_mps = INF
	check("nonfinite service speeds reject the catalog", not _accepts(bad, map))
	bad = parsed.duplicate(true)
	bad.services[0].fare = -1
	check("negative fares reject the catalog", not _accepts(bad, map))
	bad = parsed.duplicate(true)
	bad.services[0].capacity = 0
	check("zero capacity rejects the catalog", not _accepts(bad, map))
	bad = parsed.duplicate(true)
	bad.services[0].origin = "missing"
	check("absent service origins reject the catalog", not _accepts(bad, map))
	bad = parsed.duplicate(true)
	bad.services[0].destination = bad.services[0].origin
	check("same service endpoint rejects inferred direction", not _accepts(bad, map))
	bad = parsed.duplicate(true)
	bad.services[0].kind = "teleporter"
	check("unknown vehicle kinds reject the catalog", not _accepts(bad, map))
	bad = parsed.duplicate(true)
	bad.stops.append({"id": "other", "name": "Other", "road": "I-90", "fraction": 0.5, "side": 1, "shoulder_m": 8.0, "pad_offset_m": 18.0})
	bad.services[0].destination = "other"
	check("cross-road service endpoints reject the first corridor", not _accepts(bad, map))
	var broken_map: ProtoUSMap = ProtoUSMap.new()
	broken_map.load_file("res://data/usmap.json")
	var broken_road: Dictionary = broken_map.road_by_id("CR-meridian-richmond")
	broken_road["pts"] = PackedVector2Array([Vector2(NAN, -250.0), Vector2(208.0, -290.0)])
	check("nonfinite authoritative road points reject the catalog", not _accepts(parsed.duplicate(true), broken_map))


func _test_ticket_validation_and_lifecycle() -> void:
	var path: String = root + "/lifecycle.save"
	var bundle: Dictionary = _bundle(path, {"scrip": 5, "bandage": 1})
	var state: Variant = bundle.state
	check("new state does not create a checkpoint", not FileAccess.file_exists(path))
	check("empty old-save record restores versioned default", state.restore({}) and state.record() == {"version": 1, "next_serial": 1, "ticket": {}, "last_end": {}})
	var pristine: Dictionary = state.record()
	check("insufficient scrip rejects before staging", not state.reserve("lastline_east", "meridian_east", 720.0, 710.0, 1, {"scrip": 1}).ok and state.record() == pristine)
	check("wrong service rejects before staging", not state.reserve("missing", "meridian_east", 720.0, 710.0, 1, {"scrip": 5}).ok)
	check("wrong origin rejects before staging", not state.reserve("lastline_east", "richmond", 720.0, 710.0, 1, {"scrip": 5}).ok)
	check("stale and future serials reject", not state.reserve("lastline_east", "meridian_east", 720.0, 710.0, 0, {"scrip": 5}).ok and not state.reserve("lastline_east", "meridian_east", 720.0, 710.0, 2, {"scrip": 5}).ok)
	check("nonfinite times reject", not state.reserve("lastline_east", "meridian_east", NAN, 710.0, 1, {"scrip": 5}).ok and not state.reserve("lastline_east", "meridian_east", 720.0, INF, 1, {"scrip": 5}).ok)
	check("unscheduled departure rejects", not state.reserve("lastline_east", "meridian_east", 721.0, 710.0, 1, {"scrip": 5}).ok)
	check("expired departure rejects", not state.reserve("lastline_east", "meridian_east", 720.0, 721.0, 1, {"scrip": 5}).ok)
	check("too-early boarding window rejects", not state.reserve("lastline_east", "meridian_east", 720.0, 689.0, 1, {"scrip": 5}).ok)
	check("negative and malformed wallet counts reject", not state.reserve("lastline_east", "meridian_east", 720.0, 710.0, 1, {"scrip": -1}).ok and not state.reserve("lastline_east", "meridian_east", 720.0, 710.0, 1, {"scrip": 5, "scrap": -1}).ok and not state.reserve("lastline_east", "meridian_east", 720.0, 710.0, 1, {"scrip": 5.0}).ok)
	check("unknown wallet Variant objects reject", not state.reserve("lastline_east", "meridian_east", 720.0, 710.0, 1, {"scrip": 5, "bad": Vector2.ZERO}).ok)
	var bought: Dictionary = state.reserve("lastline_east", "meridian_east", 720.0, 710.0, 1, {"scrip": 5, "bandage": 1})
	check("ticket debits carried scrip", bought.ok and bundle.published == {"scrip": 3, "bandage": 1})
	var disk: Dictionary = str_to_var(FileAccess.get_file_as_string(path))
	check("reservation checkpoints ticket wallet and unrelated run fields", disk.transit == state.record() and disk.player.backpack == {"scrip": 3, "bandage": 1} and disk.sentinel == {"keep": 17})
	var reserved: Dictionary = state.record()
	var disk_reserved: String = FileAccess.get_file_as_string(path)
	check("duplicate serial cannot charge", not state.reserve("lastline_east", "meridian_east", 720.0, 710.0, 1, bundle.published).ok and state.record() == reserved and bundle.published == {"scrip": 3, "bandage": 1} and FileAccess.get_file_as_string(path) == disk_reserved)
	check("second active ticket rejects", not state.reserve("lastline_east", "meridian_east", 1080.0, 1070.0, 2, bundle.published).ok and state.record() == reserved)
	check("arrival requires an aboard ticket", not state.finish(1, "arrived", "richmond", bundle.published).ok)
	check("cancellation requires the origin endpoint", not state.finish(1, "cancelled", "richmond", bundle.published).ok)
	var ended: Dictionary = state.finish(1, "cancelled", "meridian_east", bundle.published)
	check("one cancellation refunds paid fare", ended.ok and ended.refund == 2 and ended.safe_stop == "meridian_east" and bundle.published.scrip == 5)
	check("repeat refund rejected", not state.finish(1, "cancelled", "meridian_east", bundle.published).ok and bundle.published.scrip == 5)
	check("consumed serial stays stale", not state.reserve("lastline_east", "meridian_east", 1080.0, 1070.0, 1, bundle.published).ok)
	check("next serial reserves after prior end", state.reserve("lastline_east", "meridian_east", 1080.0, 1070.0, 2, bundle.published).ok)
	check("future board serial rejects", not state.board(3, bundle.published).ok)
	check("matching serial boards once", state.board(2, bundle.published).ok and state.record().ticket.phase == "aboard")
	check("board twice rejects", not state.board(2, bundle.published).ok)
	check("aboard cancellation rejects", not state.finish(2, "cancelled", "meridian_east", bundle.published).ok)
	check("arrival requires destination endpoint", not state.finish(2, "arrived", "meridian_east", bundle.published).ok)
	var arrived: Dictionary = state.finish(2, "arrived", "richmond", bundle.published)
	check("arrival ends without refund", arrived.ok and arrived.refund == 0 and arrived.safe_stop == "richmond" and bundle.published.scrip == 3)
	check("invalid finish reason rejects", state.reserve("lastline_east", "meridian_east", 1440.0, 1430.0, 3, bundle.published).ok and state.board(3, bundle.published).ok and not state.finish(3, "teleported", "meridian_east", bundle.published).ok)
	check("service failure may finish at either route endpoint", state.finish(3, "service_failed", "richmond", bundle.published).ok and bundle.published.scrip == 3)
	check("early exit accepts either endpoint without refund", state.reserve("lastline_west", "richmond", 1800.0, 1790.0, 4, bundle.published).ok and state.board(4, bundle.published).ok and state.finish(4, "early_exit", "richmond", bundle.published).ok and bundle.published.scrip == 1)

	var valid: Dictionary = state.record()
	var forged: Dictionary = {"version": 1, "next_serial": 6, "ticket": {"serial": 5, "service": "lastline_east", "origin": "meridian_east", "destination": "richmond", "departure": 2160.0, "paid": 2, "phase": "reserved", "last_safe_stop": "meridian_east"}, "last_end": valid.last_end.duplicate(true)}
	check("well-formed recovered active ticket validates", state.valid_record(forged))
	var bad_record: Dictionary = forged.duplicate(true)
	bad_record.ticket.paid = 200
	check("forged paid amount rejects", not state.valid_record(bad_record))
	bad_record = forged.duplicate(true)
	bad_record.ticket.phase = "waiting"
	check("unknown ticket phase rejects", not state.valid_record(bad_record))
	bad_record = forged.duplicate(true)
	bad_record.ticket.extra = true
	check("extra ticket keys reject", not state.valid_record(bad_record))
	bad_record = forged.duplicate(true)
	bad_record.extra = true
	check("extra root keys reject", not state.valid_record(bad_record))
	bad_record = forged.duplicate(true)
	bad_record.last_end.extra = true
	check("extra ended-ticket keys reject", not state.valid_record(bad_record))
	bad_record = forged.duplicate(true)
	bad_record.last_end.reason = "arrived"
	bad_record.last_end.refund = 2
	check("nonrefundable end reasons reject forged refunds", not state.valid_record(bad_record))
	bad_record = forged.duplicate(true)
	bad_record.last_end.reason = "cancelled"
	bad_record.last_end.refund = 999
	check("ended refunds reject values outside catalog fares", not state.valid_record(bad_record))
	bad_record = forged.duplicate(true)
	bad_record.next_serial = 5
	check("invalid serial ordering rejects", not state.valid_record(bad_record))
	bad_record = forged.duplicate(true)
	bad_record.ticket.serial = 5.0
	check("non-integer serial Variant rejects", not state.valid_record(bad_record))
	bad_record = forged.duplicate(true)
	bad_record.ticket.origin = "richmond"
	check("wrong recorded direction rejects", not state.valid_record(bad_record))
	var before_bad_restore: Dictionary = state.record()
	check("invalid restore leaves live record untouched", not state.restore(bad_record) and state.record() == before_bad_restore)
	var exposed: Dictionary = state.record()
	exposed.last_end.reason = "FORGED"
	check("record returns a detached deep copy", state.record() == before_bad_restore)


func _test_atomic_failures_and_recovery() -> void:
	var buy_path: String = root + "/blocked-buy.save"
	var buy_bundle: Dictionary = _bundle(buy_path, {"scrip": 5, "bandage": 1})
	check("failed-buy fixture creates an existing checkpoint", buy_bundle.state.reserve("lastline_east", "meridian_east", 720.0, 710.0, 1, buy_bundle.published).ok and buy_bundle.state.finish(1, "cancelled", "meridian_east", buy_bundle.published).ok)
	var buy_before: Dictionary = buy_bundle.state.record()
	var buy_disk_before: String = FileAccess.get_file_as_string(buy_path)
	_block_checkpoint(buy_path)
	var buy_result: Dictionary = buy_bundle.state.reserve("lastline_east", "meridian_east", 1080.0, 1070.0, 2, buy_bundle.published)
	check("failed buy leaves memory and wallet unpublished", not buy_result.ok and buy_result.code == "checkpoint_failed" and buy_bundle.state.record() == buy_before and buy_bundle.published == {"scrip": 5, "bandage": 1})
	check("failed buy leaves denied checkpoint directory intact", DirAccess.dir_exists_absolute(ProjectSettings.globalize_path(buy_path)))
	_restore_checkpoint(buy_path)
	check("failed buy preserves existing checkpoint bytes", FileAccess.get_file_as_string(buy_path) == buy_disk_before)

	var path: String = root + "/atomic.save"
	var bundle: Dictionary = _bundle(path, {"scrip": 7, "bandage": 1})
	var state: Variant = bundle.state
	check("atomic fixture reserves", state.reserve("lastline_east", "meridian_east", 720.0, 710.0, 1, bundle.published).ok)
	var memory_before: Dictionary = state.record()
	var wallet_before: Dictionary = bundle.published.duplicate(true)
	var disk_before: String = FileAccess.get_file_as_string(path)
	_block_checkpoint(path)
	var board_result: Dictionary = state.board(1, bundle.published)
	check("failed board leaves memory and wallet unchanged", not board_result.ok and board_result.code == "checkpoint_failed" and state.record() == memory_before and bundle.published == wallet_before)
	_restore_checkpoint(path)
	check("failed board preserves existing checkpoint bytes", FileAccess.get_file_as_string(path) == disk_before)
	check("board retries after storage recovery", state.board(1, bundle.published).ok)
	memory_before = state.record()
	wallet_before = bundle.published.duplicate(true)
	disk_before = FileAccess.get_file_as_string(path)
	_block_checkpoint(path)
	var refund_result: Dictionary = state.finish(1, "service_failed", "richmond", bundle.published)
	check("failed refund leaves ticket and wallet retryable", not refund_result.ok and refund_result.code == "checkpoint_failed" and state.record() == memory_before and bundle.published == wallet_before)
	_restore_checkpoint(path)
	check("failed refund preserves existing checkpoint bytes", FileAccess.get_file_as_string(path) == disk_before)
	var recovered_refund: Dictionary = state.finish(1, "service_failed", "richmond", bundle.published)
	check("service failure retries one bounded refund", recovered_refund.ok and recovered_refund.refund == 2 and bundle.published.scrip == 7 and not state.finish(1, "service_failed", "richmond", bundle.published).ok)

	var recovery_path: String = root + "/recovery.save"
	var first: Dictionary = _bundle(recovery_path, {"scrip": 5, "bandage": 1})
	check("recovery fixture reserves and boards", first.state.reserve("lastline_east", "meridian_east", 720.0, 710.0, 1, first.published).ok and first.state.board(1, first.published).ok)
	var saved_run: Dictionary = str_to_var(FileAccess.get_file_as_string(recovery_path))
	var second: Dictionary = _bundle(recovery_path, saved_run.player.backpack)
	second.run.clear()
	second.run.merge(saved_run.duplicate(true), true)
	check("roundtrip restores exact active ticket", second.state.restore(saved_run.transit) and second.state.record() == saved_run.transit)
	check("restart refuses any stop but recorded last safe stop", not second.state.finish(1, "restart", "richmond", second.published).ok)
	var restart: Dictionary = second.state.finish(1, "restart", "meridian_east", second.published)
	check("restart ends at recorded safe stop and refunds once", restart.ok and restart.refund == 2 and restart.safe_stop == "meridian_east" and second.published == {"scrip": 5, "bandage": 1} and not second.state.finish(1, "restart", "meridian_east", second.published).ok)

	var reentrant_path: String = root + "/reentrant.save"
	var reentrant: Dictionary = _bundle(reentrant_path, {"scrip": 5})
	reentrant.flags.reenter = true
	check("reservation publishes once while rejecting reentrant mutation", reentrant.state.reserve("lastline_east", "meridian_east", 720.0, 710.0, 1, reentrant.published).ok and not reentrant.reentry.ok and reentrant.reentry.code == "busy")


func _bundle(path: String, wallet: Dictionary) -> Dictionary:
	var run: Dictionary = {"version": 77, "player": {"backpack": wallet.duplicate(true)}, "sentinel": {"keep": 17}}
	var published: Dictionary = wallet.duplicate(true)
	var flags: Dictionary = {"reenter": false}
	var reentry: Dictionary = {}
	var state: Variant = ticket_script.new()
	var state_ref: WeakRef = weakref(state)
	state.setup(catalog, path,
		func() -> Dictionary: return run.duplicate(true),
		func(value: Dictionary) -> void:
			published.clear()
			published.merge(value.duplicate(true), true)
			run.player.backpack = value.duplicate(true)
			if flags.reenter:
				reentry.clear()
				var active_state: Variant = state_ref.get_ref()
				if active_state != null:
					reentry.merge(active_state.board(1, value), true)
	)
	return {"state": state, "run": run, "published": published, "flags": flags, "reentry": reentry}


func _accepts(rows: Dictionary, map: ProtoUSMap) -> bool:
	var probe: Variant = catalog_script.new()
	return probe.setup(rows, map)


func _block_checkpoint(path: String) -> void:
	var absolute: String = ProjectSettings.globalize_path(path)
	var kept: String = absolute + ".kept"
	check("test arrangement preserves checkpoint before denial", DirAccess.rename_absolute(absolute, kept) == OK)
	check("test arrangement makes checkpoint path a directory", DirAccess.make_dir_absolute(absolute) == OK)


func _restore_checkpoint(path: String) -> void:
	var absolute: String = ProjectSettings.globalize_path(path)
	var kept: String = absolute + ".kept"
	check("test arrangement removes denied directory", DirAccess.remove_absolute(absolute) == OK)
	check("test arrangement restores checkpoint", DirAccess.rename_absolute(kept, absolute) == OK)


func _cleanup() -> void:
	var absolute: String = ProjectSettings.globalize_path(root)
	if not absolute.is_empty() and DirAccess.dir_exists_absolute(absolute):
		var dir: DirAccess = DirAccess.open(absolute)
		if dir != null:
			for file: String in dir.get_files():
				DirAccess.remove_absolute(absolute.path_join(file))
		DirAccess.remove_absolute(absolute)


func _finish() -> void:
	print("TRANSIT TICKET RESULTS: %d passed, %d failed" % [passed, failed])
	print("TRANSIT TICKET: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)


static func _canonical(path: String) -> String:
	var canonical: String = path.replace("\\", "/").simplify_path().trim_suffix("/")
	return canonical.to_lower() if OS.get_name() == "Windows" else canonical


static func _profile_is_allowed(profile: String, checkout: String) -> bool:
	if not profile.is_absolute_path() or not checkout.is_absolute_path():
		return false
	return profile.begins_with(checkout + "/build/") or profile.begins_with(checkout + "/.superpowers/sdd/")
