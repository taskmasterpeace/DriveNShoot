## GAME TOURNAMENT venue contract: data schedules every console title, physical
## venues expose mirrors/brackets/posters, and spectators sample the one deck.
extends Node

var passed := 0
var failed := 0


func _check(label: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("GAME_SPECTACLE: %s - %s" % ["PASS" if ok else "FAIL", label])


func _ready() -> void:
	print("GAME_SPECTACLE: start")
	get_tree().create_timer(75.0).timeout.connect(func() -> void:
		print("GAME_SPECTACLE: WATCHDOG")
		get_tree().quit(1))
	var venue_path := "res://proto3d/games/game_venue.gd"
	var spectator_path := "res://proto3d/games/game_spectator.gd"
	var data_path := "res://data/game_tournaments.json"
	var substrate_exists := ResourceLoader.exists(venue_path) \
		and ResourceLoader.exists(spectator_path) and FileAccess.file_exists(data_path)
	_check("tournament data venue and spectator substrates exist", substrate_exists)
	if not substrate_exists:
		_finish()
		return
	var venue_script := load(venue_path) as GDScript
	var catalog: Dictionary = venue_script.load_catalog(data_path)
	var venues: Array = catalog.get("venues", [])
	var events: Array = catalog.get("events", [])
	_check("catalog validates three venue types and ten event nights",
		venues.size() == 3 and events.size() == 10
		and (catalog.get("warnings", []) as Array).is_empty())
	var registry := ProtoGameRegistry.load_catalog()
	var console_ids: Array = registry.phase_rows(1).filter(func(row: Dictionary) -> bool:
		return String(row.get("platform", "")) == "console").map(func(row: Dictionary) -> String:
		return String(row.get("id", "")))
	var event_ids: Dictionary = {}
	var game_coverage: Dictionary = {}
	var schedule_fields_ok := true
	for event_value in events:
		var event: Dictionary = event_value
		var event_id := String(event.get("id", ""))
		event_ids[event_id] = int(event_ids.get(event_id, 0)) + 1
		game_coverage[String(event.get("game_id", ""))] = true
		schedule_fields_ok = schedule_fields_ok and int(event.get("day_mod", -1)) >= 0 \
			and float(event.get("hour", -1.0)) >= 0.0 \
			and float(event.get("duration_h", 0.0)) > 0.0 \
			and int(event.get("entry_fee_scrip", -1)) >= 0 \
			and int(event.get("prize_scrip", -1)) >= 0 \
			and float(event.get("trap_chance", -1.0)) >= 0.0 \
			and not (event.get("announcer", []) as Array).is_empty()
	_check("every console game has one unique visible schedule row",
		event_ids.values().all(func(count: Variant) -> bool: return int(count) == 1)
		and console_ids.all(func(game_id: Variant) -> bool:
			return game_coverage.has(String(game_id))) and schedule_fields_ok)
	var palette_ok := true
	for venue_value in venues:
		var venue_row: Dictionary = venue_value
		var position: Array = venue_row.get("position", [])
		var screen_size: Array = venue_row.get("screen_size", [])
		var accent := Color.from_string(String(venue_row.get("accent", "#000000")), Color.BLACK)
		var hue := accent.h
		palette_ok = palette_ok and position.size() == 3 and screen_size.size() == 2 \
			and not (accent.s > 0.25 and hue > 0.68 and hue < 0.95)
	_check("venue rows declare physical placement screens and no purple", palette_ok)

	var deck := ProtoGameDeck.create(self)
	add_child(deck)
	var shell := ProtoGameShell.create(deck)
	add_child(shell)
	var drive_in_row: Dictionary = venues.filter(func(row: Dictionary) -> bool:
		return String(row.get("id", "")) == "meridian_drive_in_games")[0]
	var drive_events: Array = events.filter(func(row: Dictionary) -> bool:
		return String(row.get("venue_id", "")) == "meridian_drive_in_games")
	var venue: Node3D = venue_script.create(self, deck, shell, drive_in_row, drive_events)
	add_child(venue)
	_check("a physical venue exposes interaction mirror tote bracket poster and announcer",
		venue.is_in_group("interactable") and venue.is_in_group("game_venue")
		and venue.get_node_or_null("Spectator") != null
		and venue.get_node_or_null("ToteBoard") != null
		and venue.get_node_or_null("Poster") != null
		and venue.get_node_or_null("Announcer") != null)
	var live_event: Dictionary = venue.event_at(2, 20.25)
	_check("the drive-in schedule resolves only inside its declared live window",
		String(live_event.get("game_id", "")) == "dial_tanks"
		and venue.event_at(2, 10.0).is_empty())
	var spectator: Node = venue.get_node("Spectator")
	deck.ledger.unlock("dial_tanks")
	deck.launch("dial_tanks", {"source": "spectacle-proof"})
	deck.start(22020, [{"seat": 0, "device": -1, "profile_id": "local"}])
	_check("venue spectator samples the exact ordinary live deck texture",
		spectator.screen_texture() == deck.texture())
	_check("spectator and schedule never change world time scale", Engine.time_scale == 1.0)
	_finish()


func _finish() -> void:
	print("GAME_SPECTACLE RESULTS: %d passed, %d failed" % [passed, failed])
	print("GAME_SPECTACLE: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
