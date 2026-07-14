## DATA-DRIVEN VIDEO-GAME VENUE. This pass builds the place, schedule, mirror,
## poster, tote/bracket board, and announcer surface. Entry/settlement lands in
## the next task and still uses the ordinary Game Deck.
extends StaticBody3D

signal tournament_started(event: Dictionary)
signal tournament_settled(record: Dictionary)
signal trap_triggered(event: Dictionary, trap: String)

const PATH := "res://data/game_tournaments.json"
const KINDS := ["drive_in", "roadhouse", "game_hall"]

var main: Node = null
var deck: Node = null
var shell: CanvasLayer = null
var venue_row: Dictionary = {}
var events: Array = []
var active_event: Dictionary = {}
var spectator: Node3D = null
var tote_board: Label3D = null
var poster: Label3D = null
var announcer: Label3D = null
var current_event: Dictionary = {}
var bracket: Array = []
var betting_card: Dictionary = {}
var _current_record_id := ""
var active_trap := ""
var _refresh_t := 0.0


static func load_catalog(path: String = PATH) -> Dictionary:
	var warnings: Array[String] = []
	if not FileAccess.file_exists(path):
		return {"venues": [], "events": [], "warnings": ["missing tournament data"]}
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(path))
	if not (parsed is Dictionary):
		return {"venues": [], "events": [], "warnings": ["malformed tournament data"]}
	var registry := ProtoGameRegistry.load_catalog()
	var valid_venues: Array = []
	var valid_events: Array = []
	var venue_ids: Dictionary = {}
	for venue_value in (parsed as Dictionary).get("venues", []):
		if not (venue_value is Dictionary):
			warnings.append("venue row is not a dictionary")
			continue
		var row := venue_value as Dictionary
		var id := String(row.get("id", ""))
		var position: Array = row.get("position", [])
		var size: Array = row.get("screen_size", [])
		var accent := Color.from_string(String(row.get("accent", "#000000")), Color.BLACK)
		if id == "" or venue_ids.has(id) or not KINDS.has(String(row.get("kind", ""))) \
				or position.size() != 3 or size.size() != 2 or float(size[0]) <= 0.0 \
				or float(size[1]) <= 0.0 or String(row.get("name", "")) == "" \
				or (accent.s > 0.25 and accent.h > 0.68 and accent.h < 0.95):
			warnings.append("invalid or purple venue '%s'" % id)
			continue
		venue_ids[id] = true
		valid_venues.append(row.duplicate(true))
	var event_ids: Dictionary = {}
	for event_value in (parsed as Dictionary).get("events", []):
		if not (event_value is Dictionary):
			warnings.append("event row is not a dictionary")
			continue
		var row := event_value as Dictionary
		var id := String(row.get("id", ""))
		var game_id := String(row.get("game_id", ""))
		var game: Dictionary = registry.get_game(game_id)
		if id == "" or event_ids.has(id) or not venue_ids.has(String(row.get("venue_id", ""))) \
				or game.is_empty() or int(game.get("phase", 0)) not in [1, 2] \
				or (int(game.get("phase", 0)) == 2 and not registry.installed(game_id)) \
				or String(game.get("platform", "")) != "console" \
				or int(row.get("day_mod", -1)) not in range(7) \
				or float(row.get("hour", -1.0)) < 0.0 or float(row.get("hour", 24.0)) >= 24.0 \
				or float(row.get("duration_h", 0.0)) <= 0.0 \
				or int(row.get("entry_fee_scrip", -1)) < 0 or int(row.get("prize_scrip", -1)) < 0 \
				or float(row.get("trap_chance", -1.0)) < 0.0 \
				or float(row.get("trap_chance", 2.0)) > 1.0 \
				or String(row.get("poster", "")) == "" \
				or (row.get("announcer", []) as Array).is_empty() \
				or (row.get("entrants", []) as Array).size() < 2 \
				or (row.get("possible_traps", []) as Array).is_empty():
			warnings.append("invalid tournament event '%s'" % id)
			continue
		event_ids[id] = true
		valid_events.append(row.duplicate(true))
	return {"venues": valid_venues, "events": valid_events, "warnings": warnings}


static func create(new_main: Node, new_deck: Node, new_shell: CanvasLayer,
		new_venue_row: Dictionary, new_events: Array) -> Node3D:
	var script := load("res://proto3d/games/game_venue.gd") as GDScript
	var venue: Node3D = script.new()
	venue.main = new_main
	venue.deck = new_deck
	venue.shell = new_shell
	venue.venue_row = new_venue_row.duplicate(true)
	venue.events = new_events.duplicate(true)
	venue.name = "GameVenue_%s" % String(new_venue_row.get("id", "unknown"))
	venue.add_to_group("interactable")
	venue.add_to_group("game_venue")
	venue._build()
	var pos: Array = new_venue_row.get("position", [0, 0, 0])
	venue.position = Vector3(float(pos[0]), float(pos[1]), float(pos[2]))
	return venue


func _build() -> void:
	var accent := Color.from_string(String(venue_row.get("accent", "#f2b735")), Color("f2b735"))
	var size_array: Array = venue_row.get("screen_size", [4.0, 2.25])
	var screen_size := Vector2(float(size_array[0]), float(size_array[1]))
	var kind := String(venue_row.get("kind", "roadhouse"))
	var screen_y := 4.8 if kind == "drive_in" else (3.5 if kind == "game_hall" else 2.8)
	var spectator_script := load("res://proto3d/games/game_spectator.gd") as GDScript
	spectator = spectator_script.create(deck, screen_size, accent)
	spectator.position = Vector3(0, screen_y, 0)
	add_child(spectator)

	var counter := MeshInstance3D.new()
	counter.name = "TournamentCounter"
	var counter_box := BoxMesh.new()
	counter_box.size = Vector3(maxf(3.0, screen_size.x * 0.7), 1.0, 1.1)
	counter.mesh = counter_box
	counter.position = Vector3(0, 0.5, 1.8)
	counter.material_override = ProtoWorldBuilder.material(Color("30281d"), 0.8)
	add_child(counter)

	tote_board = _label("ToteBoard", Vector3(-screen_size.x * 0.65, 1.75, 1.55), accent)
	poster = _label("Poster", Vector3(screen_size.x * 0.65, 1.75, 1.55), Color("e8dfcf"))
	announcer = _label("Announcer", Vector3(0, screen_y + screen_size.y * 0.65, 0.15), accent)
	announcer.text = String(venue_row.get("name", "GAME NIGHT"))

	var shape := CollisionShape3D.new()
	var box := BoxShape3D.new()
	box.size = Vector3(maxf(4.0, screen_size.x + 0.5), 2.0, 1.5)
	shape.shape = box
	shape.position = Vector3(0, 1.0, 1.3)
	add_child(shape)
	if deck != null and not deck.result_recorded.is_connected(_on_result_recorded):
		deck.result_recorded.connect(_on_result_recorded)
	refresh_schedule(_day(), _hour())
	set_process(true)


func _label(label_name: String, at: Vector3, color: Color) -> Label3D:
	var label := Label3D.new()
	label.name = label_name
	label.font_size = 44
	label.pixel_size = 0.006
	label.modulate = color
	label.outline_modulate = Color("11100d")
	label.outline_size = 9
	label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	label.position = at
	add_child(label)
	return label


func event_at(day: int, hour: float) -> Dictionary:
	for event_value in events:
		var event: Dictionary = event_value
		if posmod(day, 7) != int(event.get("day_mod", -1)):
			continue
		var starts := float(event.get("hour", 0.0))
		var ends := starts + float(event.get("duration_h", 0.0))
		if hour >= starts and hour < ends:
			return event.duplicate(true)
	return {}


func refresh_schedule(day: int, hour: float) -> void:
	active_event = event_at(day, hour)
	_retire_settled_event()
	if not current_event.is_empty() and active_trap != "":
		tote_board.text = "MATCH LIVE\nWORLD INTERRUPTION"
		poster.text = String(current_event.get("poster", "GAME NIGHT"))
		announcer.text = "INTERRUPTION // %s" % active_trap.replace("_", " ").to_upper()
		return
	if active_event.is_empty():
		var next := _next_event(day, hour)
		tote_board.text = "NEXT\n%s" % _event_time_line(next)
		poster.text = String(next.get("poster", "NO CARD POSTED"))
		return
	tote_board.text = "LIVE NOW\nENTRY %d  //  PRIZE %d" % [
		int(active_event.get("entry_fee_scrip", 0)), int(active_event.get("prize_scrip", 0))]
	poster.text = String(active_event.get("poster", "GAME NIGHT"))
	var barks: Array = active_event.get("announcer", [])
	announcer.text = String(barks[0]) if not barks.is_empty() else String(venue_row.get("name", ""))


func _retire_settled_event() -> void:
	if current_event.is_empty() or String(current_event.get("id", "")) == \
			String(active_event.get("id", "")):
		return
	if _current_record_id == "" or deck == null or deck.ledger == null \
			or not deck.ledger.tournament_records.has(_current_record_id):
		return
	current_event.clear()
	bracket.clear()
	betting_card.clear()
	_current_record_id = ""
	active_trap = ""


func _next_event(day: int, hour: float) -> Dictionary:
	var best: Dictionary = {}
	var best_delta := INF
	for offset in 8:
		var candidate_day := day + offset
		for event_value in events:
			var event: Dictionary = event_value
			if posmod(candidate_day, 7) != int(event.get("day_mod", -1)):
				continue
			var delta := float(offset) * 24.0 + float(event.get("hour", 0.0)) - hour
			if delta >= 0.0 and delta < best_delta:
				best_delta = delta
				best = event
	return best.duplicate(true)


func _event_time_line(event: Dictionary) -> String:
	if event.is_empty():
		return "NO SCHEDULE"
	return "DAY %d  %02d:00\n%s" % [int(event.get("day_mod", 0)),
		int(event.get("hour", 0)), String(event.get("game_id", "")).to_upper()]


func interact_position() -> Vector3:
	return global_position + global_basis.z * 2.0


func interact_prompt(_main: Node) -> String:
	refresh_schedule(_day(), _hour())
	if active_event.is_empty():
		return "E — %s SCHEDULE" % String(venue_row.get("name", "GAME VENUE"))
	return "E — ENTER %s // %d SCRIP" % [String(active_event.get("game_id", "")).to_upper(),
		int(active_event.get("entry_fee_scrip", 0))]


func interact(_main: Node) -> void:
	refresh_schedule(_day(), _hour())
	if not active_event.is_empty():
		enter_live_event()
		return
	_notify("🎮 No live bracket. %s" % tote_board.text.replace("\n", " — "))


func enter_live_event() -> bool:
	refresh_schedule(_day(), _hour())
	if active_event.is_empty() or not current_event.is_empty() or main == null \
			or not ("backpack" in main) or main.backpack == null:
		return false
	var fee := int(active_event.get("entry_fee_scrip", 0))
	if main.backpack.count("scrip") < fee or (fee > 0 and not main.backpack.remove("scrip", fee)):
		_notify("🎮 Entry is %d scrip. The window does not run tabs." % fee)
		return false
	current_event = active_event.duplicate(true)
	_current_record_id = "%s:day:%d" % [String(current_event.get("id", "")), _day()]
	_build_bracket()
	_open_betting_card()
	if "newsroom" in main and main.newsroom != null \
			and main.newsroom.has_method("report_game_tournament"):
		main.newsroom.report_game_tournament(current_event,
			String(venue_row.get("name", "GAME VENUE")))
	var context := {"source": "tournament", "device": "console", "venue_owned": true,
		"auto_start": true, "tournament_id": String(current_event.get("id", "")),
		"venue_id": String(venue_row.get("id", "")),
		"seed": hash("tournament:%s:%d" % [String(current_event.get("id", "")), _day()])}
	if not shell.open_game(String(current_event.get("game_id", "")), context):
		main.backpack.add("scrip", fee)
		current_event.clear()
		_current_record_id = ""
		return false
	tournament_started.emit(current_event.duplicate(true))
	_update_bracket_board("ROUND LIVE // RIDER AT THE CONTROLS")
	var trap := trap_for(current_event, _day())
	if trap != "":
		active_trap = trap
		announcer.text = "INTERRUPTION // %s" % trap.replace("_", " ").to_upper()
		trap_triggered.emit(current_event.duplicate(true), trap)
		_notify("⚠ TOURNAMENT INTERRUPTED — %s. The match stays live on the screen." %
			trap.replace("_", " ").to_upper())
		shell.close_to_device()
	return true


func _build_bracket() -> void:
	bracket.clear()
	var entrants: Array = current_event.get("entrants", [])
	for index in entrants.size():
		bracket.append({"id": "npc-%d" % index, "name": String(entrants[index]),
			"status": "ROUND ONE"})
	bracket.append({"id": "player", "name": "RIDER", "status": "ROUND ONE"})


func _open_betting_card() -> void:
	var card_entrants: Array = []
	for index in bracket.size():
		var entry: Dictionary = bracket[index]
		card_entrants.append({"id": String(entry.get("id", "")),
			"name": String(entry.get("name", "")), "strength": 0.8 + float(index) * 0.15})
	betting_card = ProtoBetting.open_card(String(venue_row.get("id", "game_venue")),
		_day(), card_entrants)


func place_wager(entrant_id: String, stake: int) -> Dictionary:
	if current_event.is_empty() or betting_card.is_empty() or stake <= 0 or main == null \
			or not ("backpack" in main) or main.backpack.count("scrip") < stake:
		return {}
	var valid := (betting_card.get("entrants", []) as Array).any(func(entry: Dictionary) -> bool:
		return String(entry.get("id", "")) == entrant_id)
	if not valid or not main.backpack.remove("scrip", stake):
		return {}
	return ProtoBetting.place(betting_card, entrant_id, stake,
		entrant_id == "player")


func trap_for(event: Dictionary, day: int) -> String:
	if event.is_empty():
		return ""
	var traps: Array = event.get("possible_traps", [])
	if traps.is_empty():
		return ""
	var rng := RandomNumberGenerator.new()
	rng.seed = hash("game-trap:%s:%d" % [String(event.get("id", "")), day])
	if rng.randf() >= float(event.get("trap_chance", 0.0)):
		return ""
	return String(traps[int(rng.randi()) % traps.size()])


func _on_result_recorded(result: Dictionary) -> void:
	settle_result(result)


func settle_result(result: Dictionary) -> bool:
	if current_event.is_empty() or String(result.get("game_id", "")) != \
			String(current_event.get("game_id", "")) or String(result.get("source", "")) != "tournament":
		return false
	var won := float(result.get("primary", 0.0)) > 0.0
	var record := {"record_id": _current_record_id, "event_id": current_event.get("id", ""),
		"venue_id": venue_row.get("id", ""), "game_id": current_event.get("game_id", ""),
		"day": _day(), "won": won, "result_id": result.get("result_id", ""),
		"primary": result.get("primary", 0), "settled": true}
	if not bool(deck.ledger.record_tournament(_current_record_id, record)):
		return false
	for index in bracket.size():
		if String((bracket[index] as Dictionary).get("id", "")) == "player":
			(bracket[index] as Dictionary)["status"] = "CHAMPION" if won else "ELIMINATED"
	if won and main != null and "backpack" in main:
		main.backpack.add("scrip", int(current_event.get("prize_scrip", 0)))
		var prize_item := String(current_event.get("prize_item", ""))
		if prize_item != "":
			main.backpack.add(prize_item, 1)
	if not betting_card.is_empty():
		ProtoBetting.settle(betting_card, "player" if won else "npc-0")
		var payout := 0
		for ticket_value in betting_card.get("tickets", []):
			payout += int((ticket_value as Dictionary).get("paid", 0))
		if payout > 0 and main != null and "backpack" in main:
			main.backpack.add("scrip", payout)
	if won and main != null and "newsroom" in main and main.newsroom != null \
			and main.newsroom.has_method("report_game_win"):
		main.newsroom.report_game_win(current_event,
			String(venue_row.get("name", "GAME VENUE")))
	_update_bracket_board("RIDER WINS // PRIZE PAID" if won else "RIDER OUT // HOUSE FINAL")
	tournament_settled.emit(record.duplicate(true))
	return true


func _update_bracket_board(headline: String) -> void:
	var lines: Array[String] = [headline]
	for entry_value in bracket:
		var entry: Dictionary = entry_value
		lines.append("%s  %s" % [String(entry.get("name", "?")),
			String(entry.get("status", ""))])
	tote_board.text = "\n".join(lines)


func _notify(text: String) -> void:
	if main != null and main.has_method("notify"):
		main.notify(text)
	else:
		print(text)


func _process(delta: float) -> void:
	_refresh_t -= delta
	if _refresh_t <= 0.0:
		_refresh_t = 0.5
		refresh_schedule(_day(), _hour())
		if spectator != null:
			spectator.refresh_texture()


func _day() -> int:
	return int(main.daynight.day) if main != null and main.get("daynight") != null else 1


func _hour() -> float:
	return float(main.daynight.hour) if main != null and main.get("daynight") != null else 9.0
