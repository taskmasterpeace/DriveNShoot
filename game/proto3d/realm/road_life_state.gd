class_name ProtoRoadLifeState
extends RefCounted
## Local authority only. Staged backpack/jobs join the ledger's durable commit.
const ACCOUNT: String = "local_driver"
var main: Node
var ledger: ProtoPropertyLedger = ProtoPropertyLedger.new()
var jobs: Dictionary = {"active": "", "completed": {}, "attempt": 0}
var parcels: Array = []
var definitions: Dictionary = {}
var checkpoint_path: String = "user://drivn.save"
var _pending_pack: Dictionary = {}
var _pending_jobs: Dictionary = {}
var _busy: bool = false

func setup(owner: Node, rows: Array, job_rows: Array) -> void:
	main = owner
	parcels = rows
	for row: Dictionary in job_rows:
		definitions[String(row.id)] = row
	restore({})

func empty_record() -> Dictionary:
	var authority: Dictionary = {"version": 1, "accounts": {ACCOUNT: {"scrip": 0}}, "parcels": {}, "receipts": {}}
	for row: Dictionary in parcels:
		authority.parcels[row.id] = {"owner_id": "", "guests": {}, "items": {}}
	return {"version": 1, "ledger": authority, "jobs": {"active": "", "completed": {}, "attempt": 0}}

func record() -> Dictionary:
	return {"version": 1, "ledger": ledger.snapshot(), "jobs": jobs.duplicate(true)}

func valid_record(value: Variant) -> bool:
	if not value is Dictionary or value.size() != 3 or not value.get("version") is int or value.version != 1 or not value.get("ledger") is Dictionary or not value.get("jobs") is Dictionary:
		return false
	var j: Dictionary = value.jobs
	if j.size() != 3 or not j.get("active") is String or not j.get("completed") is Dictionary or not j.get("attempt") is int or j.attempt < 0:
		return false
	if j.active != "" and (not definitions.has(j.active) or j.completed.has(j.active)):
		return false
	for id: Variant in j.completed:
		if not definitions.has(id) or not j.completed[id] is bool or j.completed[id] != true:
			return false
	var probe: ProtoPropertyLedger = ProtoPropertyLedger.new()
	if probe.open_embedded(parcels, value.ledger, Callable()) != OK:
		return false
	var snapshot: Dictionary = probe.snapshot()
	if not snapshot.accounts.has(ACCOUNT):
		return false
	for id: String in j.completed:
		if not snapshot.receipts.has("job:" + id) or snapshot.receipts["job:" + id].payload != ["credit", ACCOUNT, int(definitions[id].reward)]:
			return false
	for id: String in definitions:
		if snapshot.receipts.has("job:" + id) and not j.completed.has(id):
			return false
	return true

func restore(value: Dictionary) -> bool:
	var candidate: Dictionary = empty_record() if value.is_empty() else value
	if not valid_record(candidate):
		return false
	ledger.open_embedded(parcels, candidate.ledger, _commit_ledger)
	jobs = candidate.jobs.duplicate(true)
	return true

func allowed() -> bool:
	return not _busy and not main.menu_open and not (main.net != null and main.net.online)

func balance() -> int:
	return int(ledger.snapshot().accounts[ACCOUNT].scrip)

func request_id(prefix: String) -> String:
	return "%s:%d:%d" % [prefix, Time.get_unix_time_from_system(), Time.get_ticks_usec()]

func _failure(message: String) -> Dictionary:
	return {"ok": false, "error": message}

func _stage() -> void:
	_pending_pack = main.backpack.slots.duplicate(true)
	_pending_jobs = jobs.duplicate(true)

func _commit_ledger(authority: Dictionary) -> Error:
	# Called only after a pending candidate exists. Replays bypass this callback.
	var data: Dictionary = main.capture_save()
	data.player.backpack = _pending_pack.duplicate(true)
	data.road_life = {"version": 1, "ledger": authority, "jobs": _pending_jobs.duplicate(true)}
	var error: Error = ProtoAtomicCheckpoint.write(checkpoint_path, data)
	if error != OK:
		return error
	main.backpack.slots = _pending_pack.duplicate(true)
	jobs = _pending_jobs.duplicate(true)
	return OK

func _finish(result: Dictionary) -> Dictionary:
	_busy = false
	_pending_pack = {}
	_pending_jobs = {}
	if result.ok:
		main.backpack.changed.emit()
	return result

func _commit_jobs() -> Dictionary:
	_busy = true
	var error: Error = _commit_ledger(ledger.snapshot())
	return _finish({"ok": error == OK, "error": "" if error == OK else "checkpoint_failed:%d" % error})

func accept(id: String) -> Dictionary:
	if not allowed():
		return _failure("LOCAL AUTHORITY unavailable while online or in menu")
	if not definitions.has(id) or jobs.active != "" or jobs.completed.has(id):
		return _failure("Contract unavailable; finish or cancel your active job")
	_stage()
	_pending_jobs.active = id
	_pending_jobs.attempt += 1
	_pending_pack[String(definitions[id].cargo)] = int(_pending_pack.get(String(definitions[id].cargo), 0)) + 1
	return _commit_jobs()

func cancel() -> Dictionary:
	if not allowed() or jobs.active == "":
		return _failure("No cancellable local contract")
	_stage()
	var cargo: String = definitions[jobs.active].cargo
	_remove(_pending_pack, cargo, 1)
	_pending_jobs.active = ""
	return _commit_jobs()

func recover() -> Dictionary:
	if not allowed() or jobs.active == "":
		return _failure("No active local contract")
	var cargo: String = definitions[jobs.active].cargo
	if main.backpack.count(cargo) > 0:
		return _failure("Cargo already in backpack")
	_stage()
	_pending_pack[cargo] = 1
	return _commit_jobs()

func deliver(id: String, destination: Vector3) -> Dictionary:
	if not allowed() or not definitions.has(id):
		return _failure("Local contract unavailable")
	if jobs.completed.has(id):
		return ledger.credit(ACCOUNT, int(definitions[id].reward), "job:" + id)
	if jobs.active != id or main.mode != main.Mode.FOOT or main.player.global_position.distance_to(destination) > 4.0:
		return _failure("Bring the active contract to this receiver on foot")
	var cargo: String = definitions[id].cargo
	if main.backpack.count(cargo) < 1:
		return _failure("Cargo missing: recover at Road Office or cancel")
	_stage()
	_remove(_pending_pack, cargo, 1)
	_pending_jobs.active = ""
	_pending_jobs.completed[id] = true
	# A real household supply goes into the same atomic reward candidate.
	var bonus: String = definitions[id].bonus
	_pending_pack[bonus] = int(_pending_pack.get(bonus, 0)) + 1
	_busy = true
	return _finish(ledger.credit(ACCOUNT, int(definitions[id].reward), "job:" + id))

func purchase(parcel: String, request: String) -> Dictionary:
	if not allowed():
		return _failure("Local transactions disabled while online")
	_stage()
	_busy = true
	return _finish(ledger.purchase(ACCOUNT, parcel, request))

func transfer(parcel: String, item: String, take: bool, request: String) -> Dictionary:
	if not allowed():
		return _failure("Local transactions disabled while online")
	# Historical receipts must not credit backpack twice; ledger checks payload conflicts.
	if ledger.snapshot().receipts.has(request):
		return ledger.take_item(ACCOUNT, parcel, item, 1, request) if take else ledger.store_item(ACCOUNT, parcel, item, 1, request)
	if not take and main.backpack.count(item) < 1:
		return _failure("Backpack item missing")
	if item.begins_with("freight_"):
		return _failure("Contract cargo stays in your backpack")
	_stage()
	if take:
		_pending_pack[item] = int(_pending_pack.get(item, 0)) + 1
	else:
		_remove(_pending_pack, item, 1)
	_busy = true
	var result: Dictionary = ledger.take_item(ACCOUNT, parcel, item, 1, request) if take else ledger.store_item(ACCOUNT, parcel, item, 1, request)
	return _finish(result)

func _remove(pack: Dictionary, id: String, count: int) -> void:
	var remaining: int = int(pack.get(id, 0)) - count
	if remaining <= 0:
		pack.erase(id)
	else:
		pack[id] = remaining

func guest(parcel: String, allowed_guest: bool) -> Dictionary:
	if not allowed() or not ledger.can_access(ACCOUNT, parcel):
		return _failure("Owned home required; offline only")
	_stage()
	_busy = true
	var result: Dictionary = ledger.ensure_account("local_guest")
	if result.ok:
		result = ledger.set_guest(ACCOUNT, parcel, "local_guest", allowed_guest, request_id("guest"))
	return _finish(result)

func unpack_pantry(parcel: String) -> Dictionary:
	if not allowed() or not ledger.can_access(ACCOUNT, parcel) or main.backpack.count("household_pantry") < 1:
		return _failure("Owned home and carried pantry reserve required")
	_stage()
	_remove(_pending_pack, "household_pantry", 1)
	_pending_pack.canned_food = int(_pending_pack.get("canned_food", 0)) + 3
	return _commit_jobs()
