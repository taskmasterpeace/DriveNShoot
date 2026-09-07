class_name ProtoTransitTicketState
extends RefCounted
## One local player's monotonic ticket, atomically committed with carried scrip.

const ROOT_KEYS: PackedStringArray = ["version", "next_serial", "ticket", "last_end"]
const TICKET_KEYS: PackedStringArray = ["serial", "service", "origin", "destination", "departure", "paid", "phase", "last_safe_stop"]
const END_KEYS: PackedStringArray = ["serial", "reason", "refund", "safe_stop"]
const END_REASONS: PackedStringArray = ["cancelled", "arrived", "service_failed", "restart", "early_exit"]
const REFUND_REASONS: PackedStringArray = ["cancelled", "service_failed", "restart"]

var _catalog: ProtoTransitCatalog
var _checkpoint_path: String = ""
var _capture_run: Callable
var _publish_wallet: Callable
var _record: Dictionary = _empty_record()
var _busy: bool = false


func setup(catalog: ProtoTransitCatalog, checkpoint_path: String, capture_run: Callable, publish_wallet: Callable) -> void:
	if _busy:
		return
	_catalog = catalog
	_checkpoint_path = checkpoint_path
	_capture_run = capture_run
	_publish_wallet = publish_wallet
	_record = _empty_record()
	_busy = false


func record() -> Dictionary:
	return _record.duplicate(true)


func valid_record(value: Variant) -> bool:
	if _catalog == null or not _catalog.valid or not value is Dictionary:
		return false
	var root: Dictionary = value
	if not _exact_keys(root, ROOT_KEYS) or not root.version is int or int(root.version) != 1 or not root.next_serial is int or int(root.next_serial) < 1 or not root.ticket is Dictionary or not root.last_end is Dictionary:
		return false
	var next_serial: int = int(root.next_serial)
	var ticket: Dictionary = root.ticket
	var last_end: Dictionary = root.last_end
	if ticket.is_empty():
		if last_end.is_empty():
			return next_serial == 1
	else:
		if not _valid_ticket(ticket) or int(ticket.serial) != next_serial - 1:
			return false
	if not last_end.is_empty():
		if not _valid_end(last_end) or int(last_end.serial) >= next_serial:
			return false
		if ticket.is_empty() and int(last_end.serial) != next_serial - 1:
			return false
		if not ticket.is_empty() and int(last_end.serial) >= int(ticket.serial):
			return false
	return true


func restore(value: Dictionary) -> bool:
	if _busy:
		return false
	var candidate: Dictionary = _empty_record() if value.is_empty() else value
	if not valid_record(candidate):
		return false
	_record = candidate.duplicate(true)
	return true


func reserve(service_id: String, origin_id: String, departure: float, now: float, expected_serial: int, wallet: Dictionary) -> Dictionary:
	if _busy:
		return _failure("busy")
	if not _ready():
		return _failure("unavailable")
	if not _wallet_valid(wallet):
		return _failure("invalid_wallet")
	if not _record.ticket.is_empty():
		return _failure("active_ticket")
	if expected_serial != int(_record.next_serial):
		return _failure("serial_mismatch")
	if not _catalog.services.has(service_id):
		return _failure("unknown_service")
	var service: Dictionary = _catalog.services[service_id]
	if origin_id != String(service.origin):
		return _failure("wrong_origin")
	if not is_finite(departure) or not is_finite(now) or departure < 0.0 or now < 0.0:
		return _failure("invalid_time")
	if departure != _catalog.next_departure(service_id, now):
		return _failure("invalid_departure")
	if now > departure or now < departure - float(service.boarding_minutes):
		return _failure("outside_boarding_window")
	var fare: int = int(service.fare)
	if int(wallet.get("scrip", 0)) < fare:
		return _failure("insufficient_scrip")
	var candidate: Dictionary = _record.duplicate(true)
	var candidate_wallet: Dictionary = wallet.duplicate(true)
	candidate_wallet["scrip"] = int(wallet.get("scrip", 0)) - fare
	candidate.next_serial = expected_serial + 1
	candidate.ticket = {
		"serial": expected_serial,
		"service": service_id,
		"origin": String(service.origin),
		"destination": String(service.destination),
		"departure": departure,
		"paid": fare,
		"phase": "reserved",
		"last_safe_stop": String(service.origin),
	}
	return _commit(candidate, candidate_wallet, "reserved")


func board(serial: int, wallet: Dictionary) -> Dictionary:
	if _busy:
		return _failure("busy")
	if not _ready():
		return _failure("unavailable")
	if not _wallet_valid(wallet):
		return _failure("invalid_wallet")
	if _record.ticket.is_empty():
		return _failure("no_ticket")
	if int(_record.ticket.serial) != serial:
		return _failure("serial_mismatch")
	if String(_record.ticket.phase) != "reserved":
		return _failure("invalid_phase")
	var candidate: Dictionary = _record.duplicate(true)
	candidate.ticket.phase = "aboard"
	return _commit(candidate, wallet.duplicate(true), "boarded")


func finish(serial: int, reason: String, safe_stop: String, wallet: Dictionary) -> Dictionary:
	if _busy:
		return _failure("busy")
	if not _ready():
		return _failure("unavailable")
	if not _wallet_valid(wallet):
		return _failure("invalid_wallet")
	if _record.ticket.is_empty():
		return _failure("no_ticket")
	var ticket: Dictionary = _record.ticket
	if int(ticket.serial) != serial:
		return _failure("serial_mismatch")
	if reason not in END_REASONS:
		return _failure("invalid_reason")
	var endpoint: bool = safe_stop == String(ticket.origin) or safe_stop == String(ticket.destination)
	match reason:
		"cancelled":
			if String(ticket.phase) != "reserved" or safe_stop != String(ticket.origin):
				return _failure("invalid_finish")
		"arrived":
			if String(ticket.phase) != "aboard" or safe_stop != String(ticket.destination):
				return _failure("invalid_finish")
		"service_failed":
			if not endpoint:
				return _failure("invalid_finish")
		"restart":
			if safe_stop != String(ticket.last_safe_stop):
				return _failure("invalid_finish")
		"early_exit":
			if String(ticket.phase) != "aboard" or not endpoint:
				return _failure("invalid_finish")
	var refund: int = int(ticket.paid) if reason in REFUND_REASONS else 0
	var candidate_wallet: Dictionary = wallet.duplicate(true)
	candidate_wallet["scrip"] = int(candidate_wallet.get("scrip", 0)) + refund
	var candidate: Dictionary = _record.duplicate(true)
	candidate.ticket = {}
	candidate.last_end = {"serial": serial, "reason": reason, "refund": refund, "safe_stop": safe_stop}
	var result: Dictionary = _commit(candidate, candidate_wallet, "finished")
	if result.ok:
		result.refund = refund
		result.safe_stop = safe_stop
	return result


func _commit(candidate: Dictionary, candidate_wallet: Dictionary, success_code: String) -> Dictionary:
	_busy = true
	var captured: Variant = _capture_run.call()
	if not captured is Dictionary:
		_busy = false
		return _failure("invalid_capture")
	var run: Dictionary = captured.duplicate(true)
	if not run.get("player") is Dictionary:
		_busy = false
		return _failure("invalid_capture")
	var player: Dictionary = run.player
	if not player.get("backpack") is Dictionary:
		_busy = false
		return _failure("invalid_capture")
	run["transit"] = candidate.duplicate(true)
	player["backpack"] = candidate_wallet.duplicate(true)
	run["player"] = player
	var error: Error = ProtoAtomicCheckpoint.write(_checkpoint_path, run)
	if error != OK:
		_busy = false
		return _failure("checkpoint_failed")
	_record = candidate.duplicate(true)
	_publish_wallet.call(candidate_wallet.duplicate(true))
	_busy = false
	return {"ok": true, "code": success_code}


func _valid_ticket(ticket: Dictionary) -> bool:
	if not _exact_keys(ticket, TICKET_KEYS) or not ticket.serial is int or int(ticket.serial) < 1 or not ticket.service is String or not ticket.origin is String or not ticket.destination is String or not ticket.departure is float or not is_finite(float(ticket.departure)) or float(ticket.departure) < 0.0 or not ticket.paid is int or int(ticket.paid) < 0 or not ticket.phase is String or String(ticket.phase) not in ["reserved", "aboard"] or not ticket.last_safe_stop is String:
		return false
	var service_id: String = String(ticket.service)
	if not _catalog.services.has(service_id):
		return false
	var service: Dictionary = _catalog.services[service_id]
	if String(ticket.origin) != String(service.origin) or String(ticket.destination) != String(service.destination) or int(ticket.paid) != int(service.fare):
		return false
	if String(ticket.last_safe_stop) not in [String(ticket.origin), String(ticket.destination)]:
		return false
	return float(ticket.departure) == _catalog.next_departure(service_id, float(ticket.departure))


func _valid_end(last_end: Dictionary) -> bool:
	if not _exact_keys(last_end, END_KEYS) or not last_end.serial is int or int(last_end.serial) < 1 or not last_end.reason is String or String(last_end.reason) not in END_REASONS or not last_end.refund is int or int(last_end.refund) < 0 or not last_end.safe_stop is String or not _catalog.stops.has(String(last_end.safe_stop)):
		return false
	var reason: String = String(last_end.reason)
	var refund: int = int(last_end.refund)
	if reason not in REFUND_REASONS:
		return refund == 0
	for service: Dictionary in _catalog.services.values():
		if int(service.fare) == refund:
			return true
	return false


func _ready() -> bool:
	return _catalog != null and _catalog.valid and not _checkpoint_path.is_empty() and _capture_run.is_valid() and _publish_wallet.is_valid()


static func _wallet_valid(wallet: Dictionary) -> bool:
	for key: Variant in wallet:
		if not key is String or not wallet[key] is int or int(wallet[key]) < 0:
			return false
	return true


static func _exact_keys(value: Dictionary, expected: PackedStringArray) -> bool:
	if value.size() != expected.size():
		return false
	for key: String in expected:
		if not value.has(key):
			return false
	return true


static func _empty_record() -> Dictionary:
	return {"version": 1, "next_serial": 1, "ticket": {}, "last_end": {}}


static func _failure(code: String) -> Dictionary:
	return {"ok": false, "code": code}
