## CROWN OF ASH proof: complete chess legality and adjudication remain the
## authority beneath skippable battle-capture spectacle.
## Run: Godot --headless --path game res://proto3d/tests/crown_of_ash_sim.tscn
extends Node

var passed := 0
var failed := 0
var capture_events := 0
var capture_committed := false


func _check(label: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("CROWN: %s - %s" % ["PASS" if ok else "FAIL", label])


func _sq(name: String) -> Vector2i:
	return Vector2i(name.unicode_at(0) - "a".unicode_at(0), 8 - int(name.substr(1, 1)))


func _has_to(moves: Array, square: String) -> bool:
	var target := _sq(square)
	return moves.any(func(move: Dictionary) -> bool: return move.get("to") == target)


func _ready() -> void:
	print("CROWN: start")
	get_tree().create_timer(90.0).timeout.connect(func() -> void:
		print("CROWN: WATCHDOG")
		get_tree().quit(1))
	var scene_path := "res://proto3d/games/crown_of_ash/crown_of_ash.tscn"
	_check("the battle-chess cartridge exists", ResourceLoader.exists(scene_path))
	if not ResourceLoader.exists(scene_path):
		_finish()
		return
	var game: Control = (load(scene_path) as PackedScene).instantiate()
	add_child(game)
	game.request_feedback.connect(func(kind: String, payload: Dictionary) -> void:
		if kind == "battle_capture":
			capture_events += 1
			capture_committed = game.piece_at(payload["to"]) == payload["attacker"])
	game.configure(ProtoGameRegistry.load_catalog().get_game("crown_of_ash"), {"source": "solo"})
	game.start_match(99, [{"seat": 0, "profile_id": "local"}])

	_check("initial position has twenty legal moves", game.all_legal_moves().size() == 20)
	_check("a blocked rook has no legal move", game.legal_moves(_sq("a1")).is_empty())
	_check("white pawn may double-step from e2", _has_to(game.legal_moves(_sq("e2")), "e4"))
	_check("a legal double-step commits and changes side", game.try_move(_sq("e2"), _sq("e4"))
		and game.side_to_move == "b")

	game.load_fen("7k/8/8/8/8/8/8/Rp2K3 w - - 0 1")
	_check("a legal capture commits", game.try_move(_sq("a1"), _sq("b1")))
	_check("battle event fires after board commit", capture_events == 1 and capture_committed)

	game.load_fen("7k/8/8/3pP3/8/8/8/4K3 w - d6 0 1")
	_check("en passant is offered on the immediate reply", _has_to(game.legal_moves(_sq("e5")), "d6"))
	_check("en passant removes the passed pawn", game.try_move(_sq("e5"), _sq("d6"))
		and game.piece_at(_sq("d6")) == "wP" and game.piece_at(_sq("d5")) == "")

	game.load_fen("7k/8/8/3pP3/8/8/8/4K3 w - d6 0 1")
	game.try_move(_sq("e1"), _sq("e2"))
	game.try_move(_sq("h8"), _sq("h7"))
	_check("en passant expires after one reply", not _has_to(game.legal_moves(_sq("e5")), "d6"))

	game.load_fen("r3k2r/8/8/8/2b5/8/8/R3K2R w KQkq - 0 1")
	_check("castling through an attacked transit square is illegal", not _has_to(game.legal_moves(_sq("e1")), "g1"))
	game.load_fen("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1")
	_check("legal castling moves both king and rook", game.try_move(_sq("e1"), _sq("g1"))
		and game.piece_at(_sq("g1")) == "wK" and game.piece_at(_sq("f1")) == "wR")

	game.load_fen("7k/P7/8/8/8/8/8/4K3 w - - 0 1")
	_check("promotion choice is honored", game.try_move(_sq("a7"), _sq("a8"), "N")
		and game.piece_at(_sq("a8")) == "wN")

	game.load_fen("4r2k/8/8/8/8/8/4R3/4K3 w - - 0 1")
	_check("a pinned piece cannot expose its king", not game.try_move(_sq("e2"), _sq("d2")))

	game.load_fen("start")
	game.try_move(_sq("f2"), _sq("f3"))
	game.try_move(_sq("e7"), _sq("e5"))
	game.try_move(_sq("g2"), _sq("g4"))
	game.try_move(_sq("d8"), _sq("h4"))
	_check("fool's mate adjudicates checkmate", game.game_status == "checkmate" and game.finished)

	game.load_fen("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1")
	game.adjudicate()
	_check("no-move non-check position is stalemate", game.game_status == "stalemate")

	game.load_fen("7k/8/8/8/8/8/6R1/K7 w - - 99 1")
	game.try_move(_sq("g2"), _sq("g3"))
	_check("one hundred halfmoves triggers fifty-move draw", game.game_status == "draw_fifty")

	game.load_fen("7k/8/8/8/5b2/8/8/2B1K3 w - - 0 1")
	game.adjudicate()
	_check("same-color bishop ending is insufficient material", game.game_status == "draw_material")

	game.load_fen("start")
	for move in [["g1", "f3"], ["g8", "f6"], ["f3", "g1"], ["f6", "g8"],
			["g1", "f3"], ["g8", "f6"], ["f3", "g1"], ["f6", "g8"]]:
		game.try_move(_sq(move[0]), _sq(move[1]))
	_check("third occurrence triggers repetition draw", game.game_status == "draw_threefold")

	game.load_fen("8/8/8/3k4/8/3P4/4K3/8 w - - 0 1")
	var saved: Dictionary = game.snapshot()
	var ai_a: Dictionary = game.choose_ai_move(2)
	game.try_move(_sq("d3"), _sq("d4"))
	game.restore_snapshot(saved)
	var ai_b: Dictionary = game.choose_ai_move(2)
	_check("snapshot restores exact chess state", game.position_key() == String(saved["position_key"]))
	_check("AI choice is deterministic from the same state", not ai_a.is_empty() and ai_a == ai_b)

	game.context = {"source": "local"}
	game.start_match(111, [{"seat": 0, "profile_id": "bone"}, {"seat": 1, "profile_id": "rust"}])
	game.load_fen("7k/4p3/8/8/8/8/4P3/4K3 b - - 0 1")
	game.cursor = _sq("e7")
	game.selected = game.INVALID_SQUARE
	game.apply_inputs(1, [
		{"seat": 0, "pressed": {"primary": true}},
		{"seat": 1, "pressed": {}},
	])
	_check("local seat zero cannot move the rival army", game.selected == game.INVALID_SQUARE)
	game.apply_inputs(2, [
		{"seat": 0, "pressed": {}},
		{"seat": 1, "pressed": {"primary": true}},
	])
	_check("local seat one owns the second army", game.selected == _sq("e7"))

	game.context = {"source": "solo", "ai": true}
	game.start_match(112, [{"seat": 0, "profile_id": "local"}])
	game.load_fen("7k/4p3/8/8/8/8/4P3/4K3 b - - 0 1")
	var ai_before: String = game.position_key()
	game.apply_inputs(1, [{"seat": 0, "pressed": {}}])
	_check("single-player AI takes the unattended army turn", game.position_key() != ai_before
		and game.side_to_move == "w")

	game.context = {"source": "session", "online": true, "local_side": "w"}
	game.start_match(113, [{"seat": 0, "profile_id": "local", "side": "w"}])
	game.load_fen("start")
	game.apply_event({"event_id": "remote-e4", "type": "move", "from": "e2", "to": "e4"})
	_check("reliable online move event commits through cartridge authority", game.piece_at(_sq("e4")) == "wP"
		and game.side_to_move == "b")
	_check("capture vignette never changes world time", Engine.time_scale == 1.0)
	_finish()


func _finish() -> void:
	print("CROWN RESULTS: %d passed, %d failed" % [passed, failed])
	print("CROWN: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
