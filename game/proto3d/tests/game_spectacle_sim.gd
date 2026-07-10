## GAME TOURNAMENT venue contract: data schedules every console title, physical
## venues expose mirrors/brackets/posters, and spectators sample the one deck.
extends Node

class FakeNewsroom extends RefCounted:
	var ads: Array = []
	var wins: Array = []
	func report_game_tournament(event: Dictionary, venue_name: String) -> void:
		ads.append({"event": event.duplicate(true), "venue": venue_name})
	func report_game_win(event: Dictionary, venue_name: String) -> void:
		wins.append({"event": event.duplicate(true), "venue": venue_name})

class VenueHarness extends Node:
	var daynight := ProtoDayNight.new()
	var backpack := ProtoContainer.new("Tournament Wallet")
	var newsroom := FakeNewsroom.new()
	var notices: Array[String] = []
	func notify(text: String) -> void:
		notices.append(text)

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

	var harness := VenueHarness.new()
	add_child(harness)
	var deck := ProtoGameDeck.create(harness)
	add_child(deck)
	var shell := ProtoGameShell.create(deck)
	add_child(shell)
	var drive_in_row: Dictionary = venues.filter(func(row: Dictionary) -> bool:
		return String(row.get("id", "")) == "meridian_drive_in_games")[0]
	var drive_events: Array = events.filter(func(row: Dictionary) -> bool:
		return String(row.get("venue_id", "")) == "meridian_drive_in_games")
	var venue: Node3D = venue_script.create(harness, deck, shell, drive_in_row, drive_events)
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
	deck.launch("dial_tanks", {"source": "spectacle-proof"})
	deck.start(22020, [{"seat": 0, "device": -1, "profile_id": "local"}])
	_check("venue spectator samples the exact ordinary live deck texture",
		spectator.screen_texture() == deck.texture())
	deck.stop("schedule_proof_done")

	var economy_methods := venue.has_method("enter_live_event") \
		and venue.has_method("place_wager") and venue.has_method("trap_for") \
		and venue.has_method("settle_result") and venue.has_signal("trap_triggered")
	_check("venue exposes entry bracket wager prize and trap policy", economy_methods)
	if not economy_methods:
		_finish()
		return
	var trap_day := 6
	while trap_day < 706 and String(venue.trap_for(
		venue.event_at(trap_day, 19.25), trap_day)) == "":
		trap_day += 7
	_check("a scheduled trap branch is deterministic and discoverable", trap_day < 706)
	harness.daynight.day = trap_day
	harness.daynight.hour = 19.25
	harness.backpack.add("scrip", 100)
	var trap_count := [0]
	venue.trap_triggered.connect(func(_event: Dictionary, _trap: String) -> void:
		trap_count[0] += 1)
	var started := bool(venue.enter_live_event())
	_check("entering pays once and starts the ordinary venue-owned cartridge", started
		and harness.backpack.count("scrip") == 85 and deck.state == "PLAYING"
		and String(deck.current_context.get("tournament_id", "")) == "rustball_saturday"
		and not bool(deck.ledger.is_unlocked("rustball")))
	_check("visible bracket contains the player and named house entrants",
		(venue.get("bracket") as Array).size() >= 3
		and (venue.get("bracket") as Array).any(func(entry: Dictionary) -> bool:
			return String(entry.get("id", "")) == "player"))
	_check("the deterministic trap interrupts fullscreen but fabricates no result",
		trap_count[0] == 1 and not shell.is_open and deck.state == "PLAYING"
		and deck.ledger.recent_results.is_empty())
	_check("the same live bracket cannot charge entry twice", not bool(venue.enter_live_event())
		and harness.backpack.count("scrip") == 85)
	var wager: Dictionary = venue.place_wager("player", 5)
	_check("optional wager uses physical scrip and the shared betting book",
		not wager.is_empty() and harness.backpack.count("scrip") == 80)
	var finished := bool(deck.cartridge.debug_force_finish())
	var result: Dictionary = deck.cartridge.get("last_result")
	_check("winning settles one bracket record prize and wager payout", finished
		and deck.ledger.tournament_records.size() == 1
		and harness.backpack.count("game_cart_fight_night_99") == 1
		and harness.backpack.count("scrip") > 190
		and harness.newsroom.wins.size() == 1)
	var before_repeat_scrip := harness.backpack.count("scrip")
	_check("tournament settlement is idempotent", not bool(venue.settle_result(result))
		and harness.backpack.count("scrip") == before_repeat_scrip
		and deck.ledger.tournament_records.size() == 1)
	_check("the event ad and champion become radio/TV newsroom hooks",
		harness.newsroom.ads.size() == 1 and harness.newsroom.wins.size() == 1)
	_check("spectator and schedule never change world time scale", Engine.time_scale == 1.0)
	_finish()


func _finish() -> void:
	print("GAME_SPECTACLE RESULTS: %d passed, %d failed" % [passed, failed])
	print("GAME_SPECTACLE: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
