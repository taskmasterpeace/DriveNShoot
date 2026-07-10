## CROWN OF ASH — complete deterministic chess beneath original DRIVN battle
## vignettes. Presentation can be skipped; the board and clocks never wait for it.
extends "res://proto3d/games/game_cartridge.gd"

const START_FEN := "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
const INVALID_SQUARE := Vector2i(-1, -1)
const INK := Color("11100d")
const CARD := Color("242019")
const AMBER := Color("f2b735")
const BONE := Color("e8dfcf")
const RED := Color("b84a3b")
const LIGHT_SQUARE := Color("8b795d")
const DARK_SQUARE := Color("3b3429")
const MATERIAL: Dictionary = {"P": 100, "N": 320, "B": 330, "R": 500, "Q": 900, "K": 0}
const GLYPHS: Dictionary = {
	"wK": "♔", "wQ": "♕", "wR": "♖", "wB": "♗", "wN": "♘", "wP": "♙",
	# Outline glyphs accept Godot's palette tint consistently. Several Windows
	# color-font fallbacks render the filled black pawn purple and ignore tint.
	"bK": "♔", "bQ": "♕", "bR": "♖", "bB": "♗", "bN": "♘", "bP": "♙",
}

var board: Array = []
var side_to_move := "w"
var castling_rights := "KQkq"
var en_passant := INVALID_SQUARE
var halfmove_clock := 0
var fullmove_number := 1
var repetition: Dictionary = {}
var game_status := "playing"
var cursor := Vector2i(4, 6)
var selected := INVALID_SQUARE

var _cells: Array[Label] = []
var _status_label: Label = null
var _battle_overlay: PanelContainer = null
var _battle_label: Label = null
var _ai_side := ""
var _applying_network_event := false


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_build_ui()
	request_feedback.connect(_on_feedback)
	if board.is_empty():
		load_fen("start")


func start_match(new_seed: int, new_seats: Array) -> void:
	super.start_match(new_seed, new_seats)
	_ai_side = ""
	if new_seats.size() == 1 and not bool(context.get("online", false)) \
			and not bool(context.get("spectator", false)) and bool(context.get("ai", true)):
		_ai_side = _other(String((new_seats[0] as Dictionary).get("side",
			context.get("local_side", "w"))))
	load_fen("start")


func load_fen(fen: String) -> bool:
	if fen == "start":
		fen = START_FEN
	var parts := fen.split(" ")
	if parts.size() < 4:
		return false
	var ranks := parts[0].split("/")
	if ranks.size() != 8:
		return false
	board = []
	for y in 8:
		var row: Array = []
		var token := String(ranks[y])
		for index in token.length():
			var character := token.substr(index, 1)
			if character.is_valid_int():
				for _empty in int(character):
					row.append("")
			else:
				var color := "w" if character == character.to_upper() else "b"
				row.append(color + character.to_upper())
		if row.size() != 8:
			return false
		board.append(row)
	side_to_move = String(parts[1])
	castling_rights = "" if String(parts[2]) == "-" else String(parts[2])
	en_passant = INVALID_SQUARE if String(parts[3]) == "-" else _point(String(parts[3]))
	halfmove_clock = int(parts[4]) if parts.size() > 4 else 0
	fullmove_number = int(parts[5]) if parts.size() > 5 else 1
	repetition.clear()
	repetition[position_key()] = 1
	game_status = "playing"
	finished = false
	active = true
	paused = false
	last_result.clear()
	selected = INVALID_SQUARE
	_render()
	return true


func piece_at(square: Vector2i) -> String:
	if not _inside(square):
		return ""
	return String(board[square.y][square.x])


func legal_moves(from: Vector2i) -> Array:
	var piece := piece_at(from)
	if piece == "" or piece.substr(0, 1) != side_to_move:
		return []
	var out: Array = []
	for move_value in _pseudo_moves(from):
		var move: Dictionary = move_value
		if _move_is_legal(move):
			out.append(move)
	return out


func all_legal_moves() -> Array:
	var out: Array = []
	for y in 8:
		for x in 8:
			var from := Vector2i(x, y)
			if piece_at(from).begins_with(side_to_move):
				out.append_array(legal_moves(from))
	return out


func try_move(from: Vector2i, to: Vector2i, promotion: String = "Q") -> bool:
	if not active or paused or finished:
		return false
	for move_value in legal_moves(from):
		var move: Dictionary = move_value
		if move.get("to") != to:
			continue
		var move_promotion := String(move.get("promotion", ""))
		if move_promotion != "" and move_promotion != promotion.to_upper():
			continue
		_apply_move(move, true, true)
		selected = INVALID_SQUARE
		_render()
		adjudicate()
		if bool(context.get("online", false)) and not _applying_network_event:
			network_event_requested.emit({
				"event_id": "move:%s:%d:%s%s" % [_session_id, fullmove_number,
					_name(from), _name(to)],
				"type": "move", "from": _name(from), "to": _name(to),
				"promotion": promotion.to_upper(),
			})
		return true
	return false


func _pseudo_moves(from: Vector2i) -> Array:
	var piece := piece_at(from)
	if piece == "":
		return []
	var color := piece.substr(0, 1)
	var kind := piece.substr(1, 1)
	var out: Array = []
	match kind:
		"P":
			var direction := -1 if color == "w" else 1
			var start_rank := 6 if color == "w" else 1
			var one := from + Vector2i(0, direction)
			if _inside(one) and piece_at(one) == "":
				_add_pawn_moves(out, from, one)
				var two := from + Vector2i(0, direction * 2)
				if from.y == start_rank and piece_at(two) == "":
					out.append(_move(from, two, {"double_pawn": true}))
			for dx in [-1, 1]:
				var target := from + Vector2i(dx, direction)
				if not _inside(target):
					continue
				var target_piece := piece_at(target)
				if target_piece != "" and target_piece.substr(0, 1) != color:
					_add_pawn_moves(out, from, target)
				elif target == en_passant:
					var passed_piece := piece_at(Vector2i(target.x, from.y))
					if passed_piece == _other(color) + "P":
						out.append(_move(from, target, {"en_passant": true}))
		"N":
			for offset in [Vector2i(1, 2), Vector2i(2, 1), Vector2i(2, -1), Vector2i(1, -2),
					Vector2i(-1, -2), Vector2i(-2, -1), Vector2i(-2, 1), Vector2i(-1, 2)]:
				_add_if_open_or_enemy(out, from, from + offset, color)
		"B":
			_add_slides(out, from, color, [Vector2i(1, 1), Vector2i(1, -1), Vector2i(-1, 1), Vector2i(-1, -1)])
		"R":
			_add_slides(out, from, color, [Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1), Vector2i(0, -1)])
		"Q":
			_add_slides(out, from, color, [Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1), Vector2i(0, -1),
				Vector2i(1, 1), Vector2i(1, -1), Vector2i(-1, 1), Vector2i(-1, -1)])
		"K":
			for dy in [-1, 0, 1]:
				for dx in [-1, 0, 1]:
					if dx != 0 or dy != 0:
						_add_if_open_or_enemy(out, from, from + Vector2i(dx, dy), color)
			_add_castles(out, color)
	return out


func _add_pawn_moves(out: Array, from: Vector2i, to: Vector2i) -> void:
	if to.y == 0 or to.y == 7:
		for promotion in ["Q", "R", "B", "N"]:
			out.append(_move(from, to, {"promotion": promotion}))
	else:
		out.append(_move(from, to))


func _add_if_open_or_enemy(out: Array, from: Vector2i, to: Vector2i, color: String) -> void:
	if not _inside(to):
		return
	var target := piece_at(to)
	if target == "" or (target.substr(0, 1) != color and not target.ends_with("K")):
		out.append(_move(from, to))


func _add_slides(out: Array, from: Vector2i, color: String, directions: Array) -> void:
	for direction_value in directions:
		var direction: Vector2i = direction_value
		var target := from + direction
		while _inside(target):
			var target_piece := piece_at(target)
			if target_piece == "":
				out.append(_move(from, target))
			else:
				if target_piece.substr(0, 1) != color and not target_piece.ends_with("K"):
					out.append(_move(from, target))
				break
			target += direction


func _add_castles(out: Array, color: String) -> void:
	var rank := 7 if color == "w" else 0
	var king_flag := "K" if color == "w" else "k"
	var queen_flag := "Q" if color == "w" else "q"
	var enemy := _other(color)
	if piece_at(Vector2i(4, rank)) != color + "K" or _in_check(color):
		return
	if castling_rights.contains(king_flag) and piece_at(Vector2i(7, rank)) == color + "R" \
			and piece_at(Vector2i(5, rank)) == "" and piece_at(Vector2i(6, rank)) == "" \
			and not _is_square_attacked(Vector2i(5, rank), enemy) \
			and not _is_square_attacked(Vector2i(6, rank), enemy):
		out.append(_move(Vector2i(4, rank), Vector2i(6, rank), {"castle": "king"}))
	if castling_rights.contains(queen_flag) and piece_at(Vector2i(0, rank)) == color + "R" \
			and piece_at(Vector2i(1, rank)) == "" and piece_at(Vector2i(2, rank)) == "" \
			and piece_at(Vector2i(3, rank)) == "" \
			and not _is_square_attacked(Vector2i(3, rank), enemy) \
			and not _is_square_attacked(Vector2i(2, rank), enemy):
		out.append(_move(Vector2i(4, rank), Vector2i(2, rank), {"castle": "queen"}))


func _move(from: Vector2i, to: Vector2i, extras: Dictionary = {}) -> Dictionary:
	var out := {"from": from, "to": to}
	for key in extras:
		out[key] = extras[key]
	return out


func _move_is_legal(move: Dictionary) -> bool:
	var moving_side := side_to_move
	var state := _chess_state()
	_apply_move(move, false, false)
	var legal := not _in_check(moving_side)
	_restore_chess_state(state, false)
	return legal


func _apply_move(move: Dictionary, record_history: bool, feedback: bool) -> void:
	var from: Vector2i = move["from"]
	var to: Vector2i = move["to"]
	var piece := piece_at(from)
	var moving_side := piece.substr(0, 1)
	var kind := piece.substr(1, 1)
	var captured_square := to
	if bool(move.get("en_passant", false)):
		captured_square = Vector2i(to.x, from.y)
	var captured := piece_at(captured_square)
	board[from.y][from.x] = ""
	if captured_square != to:
		board[captured_square.y][captured_square.x] = ""
	var placed := piece
	if String(move.get("promotion", "")) != "":
		placed = moving_side + String(move["promotion"])
	board[to.y][to.x] = placed
	if String(move.get("castle", "")) != "":
		var rook_from_x := 7 if String(move["castle"]) == "king" else 0
		var rook_to_x := 5 if String(move["castle"]) == "king" else 3
		board[to.y][rook_to_x] = moving_side + "R"
		board[to.y][rook_from_x] = ""
	_update_castling_rights(piece, from, captured, captured_square)
	en_passant = INVALID_SQUARE
	if kind == "P" and abs(to.y - from.y) == 2:
		en_passant = Vector2i(from.x, (from.y + to.y) / 2)
	halfmove_clock = 0 if kind == "P" or captured != "" else halfmove_clock + 1
	if moving_side == "b":
		fullmove_number += 1
	side_to_move = _other(moving_side)
	if record_history:
		var key := position_key()
		repetition[key] = int(repetition.get(key, 0)) + 1
	if feedback and captured != "":
		request_feedback.emit("battle_capture", {
			"attacker": placed, "defender": captured, "from": from, "to": to,
		})


func _update_castling_rights(piece: String, from: Vector2i, captured: String, captured_square: Vector2i) -> void:
	if piece == "wK":
		_remove_right("K"); _remove_right("Q")
	elif piece == "bK":
		_remove_right("k"); _remove_right("q")
	elif piece == "wR" and from == Vector2i(0, 7):
		_remove_right("Q")
	elif piece == "wR" and from == Vector2i(7, 7):
		_remove_right("K")
	elif piece == "bR" and from == Vector2i(0, 0):
		_remove_right("q")
	elif piece == "bR" and from == Vector2i(7, 0):
		_remove_right("k")
	if captured == "wR" and captured_square == Vector2i(0, 7):
		_remove_right("Q")
	elif captured == "wR" and captured_square == Vector2i(7, 7):
		_remove_right("K")
	elif captured == "bR" and captured_square == Vector2i(0, 0):
		_remove_right("q")
	elif captured == "bR" and captured_square == Vector2i(7, 0):
		_remove_right("k")


func _remove_right(flag: String) -> void:
	castling_rights = castling_rights.replace(flag, "")


func _in_check(color: String) -> bool:
	for y in 8:
		for x in 8:
			if piece_at(Vector2i(x, y)) == color + "K":
				return _is_square_attacked(Vector2i(x, y), _other(color))
	return true


func _is_square_attacked(target: Vector2i, by_color: String) -> bool:
	for y in 8:
		for x in 8:
			var from := Vector2i(x, y)
			var piece := piece_at(from)
			if not piece.begins_with(by_color):
				continue
			var kind := piece.substr(1, 1)
			if kind == "P":
				var direction := -1 if by_color == "w" else 1
				if target == from + Vector2i(-1, direction) or target == from + Vector2i(1, direction):
					return true
			elif kind == "N":
				var delta := target - from
				if Vector2i(absi(delta.x), absi(delta.y)) in [Vector2i(1, 2), Vector2i(2, 1)]:
					return true
			elif kind == "K":
				var delta := target - from
				if maxi(absi(delta.x), absi(delta.y)) == 1:
					return true
			elif kind in ["B", "R", "Q"] and _slider_attacks(from, target, kind):
				return true
	return false


func _slider_attacks(from: Vector2i, target: Vector2i, kind: String) -> bool:
	var delta := target - from
	var diagonal := absi(delta.x) == absi(delta.y) and delta.x != 0
	var straight := (delta.x == 0) != (delta.y == 0)
	if (kind == "B" and not diagonal) or (kind == "R" and not straight) \
			or (kind == "Q" and not (diagonal or straight)):
		return false
	var step := Vector2i(signi(delta.x), signi(delta.y))
	var point := from + step
	while point != target:
		if piece_at(point) != "":
			return false
		point += step
	return true


func adjudicate() -> String:
	var moves := all_legal_moves()
	if moves.is_empty():
		if _in_check(side_to_move):
			game_status = "checkmate"
			_finish_chess(_other(side_to_move))
		else:
			game_status = "stalemate"
			_finish_chess("")
	elif halfmove_clock >= 100:
		game_status = "draw_fifty"
		_finish_chess("")
	elif int(repetition.get(position_key(), 0)) >= 3:
		game_status = "draw_threefold"
		_finish_chess("")
	elif _insufficient_material():
		game_status = "draw_material"
		_finish_chess("")
	else:
		game_status = "check" if _in_check(side_to_move) else "playing"
	_render()
	return game_status


func _finish_chess(winner: String) -> void:
	finish_match({
		"primary": 1 if winner != "" else 0,
		"secondary": {"winner": winner, "status": game_status, "fullmove": fullmove_number},
		"outcome": "complete",
		"ranked": true,
	})


func debug_force_finish() -> bool:
	if finished:
		return false
	game_status = "checkmate"
	_finish_chess("w")
	return finished


func _insufficient_material() -> bool:
	var non_kings: Array = []
	var bishop_colors: Array[int] = []
	for y in 8:
		for x in 8:
			var piece := piece_at(Vector2i(x, y))
			if piece != "" and not piece.ends_with("K"):
				non_kings.append(piece)
				if piece.ends_with("B"):
					bishop_colors.append((x + y) % 2)
	if non_kings.is_empty():
		return true
	if non_kings.size() == 1:
		return String(non_kings[0]).substr(1, 1) in ["B", "N"]
	if bishop_colors.size() == non_kings.size():
		return bishop_colors.all(func(square_color: int) -> bool:
			return square_color == bishop_colors[0])
	return false


func position_key() -> String:
	return JSON.stringify([board, side_to_move, castling_rights,
		"-" if en_passant == INVALID_SQUARE else _name(en_passant)])


func snapshot() -> Dictionary:
	var state := super.snapshot()
	state["board"] = board.duplicate(true)
	state["side_to_move"] = side_to_move
	state["castling_rights"] = castling_rights
	state["en_passant"] = [en_passant.x, en_passant.y]
	state["halfmove_clock"] = halfmove_clock
	state["fullmove_number"] = fullmove_number
	state["repetition"] = repetition.duplicate(true)
	state["game_status"] = game_status
	state["cursor"] = [cursor.x, cursor.y]
	state["selected"] = [selected.x, selected.y]
	state["position_key"] = position_key()
	return state


func restore_snapshot(state: Dictionary) -> void:
	super.restore_snapshot(state)
	board = (state.get("board", board) as Array).duplicate(true)
	side_to_move = String(state.get("side_to_move", side_to_move))
	castling_rights = String(state.get("castling_rights", castling_rights))
	var ep: Array = state.get("en_passant", [-1, -1])
	en_passant = Vector2i(int(ep[0]), int(ep[1]))
	halfmove_clock = int(state.get("halfmove_clock", halfmove_clock))
	fullmove_number = int(state.get("fullmove_number", fullmove_number))
	repetition = (state.get("repetition", repetition) as Dictionary).duplicate(true)
	game_status = String(state.get("game_status", game_status))
	var cursor_row: Array = state.get("cursor", [4, 6])
	cursor = Vector2i(int(cursor_row[0]), int(cursor_row[1]))
	var selected_row: Array = state.get("selected", [-1, -1])
	selected = Vector2i(int(selected_row[0]), int(selected_row[1]))
	_render()


func _chess_state() -> Dictionary:
	return {
		"board": board.duplicate(true), "side": side_to_move, "rights": castling_rights,
		"ep": en_passant, "half": halfmove_clock, "full": fullmove_number,
		"repetition": repetition.duplicate(true), "status": game_status,
		"finished": finished, "active": active, "last_result": last_result.duplicate(true),
	}


func _restore_chess_state(state: Dictionary, render_now: bool = true) -> void:
	board = (state["board"] as Array).duplicate(true)
	side_to_move = String(state["side"])
	castling_rights = String(state["rights"])
	en_passant = state["ep"]
	halfmove_clock = int(state["half"])
	fullmove_number = int(state["full"])
	repetition = (state["repetition"] as Dictionary).duplicate(true)
	game_status = String(state["status"])
	finished = bool(state["finished"])
	active = bool(state["active"])
	last_result = (state["last_result"] as Dictionary).duplicate(true)
	if render_now:
		_render()


func choose_ai_move(depth: int = 2) -> Dictionary:
	var moves := all_legal_moves()
	if moves.is_empty():
		return {}
	moves.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return _move_key(a) < _move_key(b))
	var perspective := side_to_move
	var best_score := -10000000
	var best: Dictionary = {}
	for move_value in moves:
		var move: Dictionary = move_value
		var state := _chess_state()
		_apply_move(move, false, false)
		var score := _search(maxi(0, depth - 1), perspective)
		_restore_chess_state(state, false)
		if best.is_empty() or score > best_score:
			best_score = score
			best = move.duplicate(true)
	return best


func _search(depth: int, perspective: String) -> int:
	if depth <= 0:
		return _evaluate(perspective)
	var moves := all_legal_moves()
	if moves.is_empty():
		if _in_check(side_to_move):
			return -100000 if side_to_move == perspective else 100000
		return 0
	var maximizing := side_to_move == perspective
	var best := -10000000 if maximizing else 10000000
	for move_value in moves:
		var state := _chess_state()
		_apply_move(move_value, false, false)
		var score := _search(depth - 1, perspective)
		_restore_chess_state(state, false)
		best = maxi(best, score) if maximizing else mini(best, score)
	return best


func _evaluate(perspective: String) -> int:
	var score := 0
	for row in board:
		for value in row:
			var piece := String(value)
			if piece == "":
				continue
			var amount := int(MATERIAL.get(piece.substr(1, 1), 0))
			score += amount if piece.begins_with(perspective) else -amount
	var saved_side := side_to_move
	side_to_move = perspective
	var own_mobility := all_legal_moves().size()
	side_to_move = _other(perspective)
	var enemy_mobility := all_legal_moves().size()
	side_to_move = saved_side
	return score + (own_mobility - enemy_mobility) * 2


func _move_key(move: Dictionary) -> String:
	return "%s%s%s" % [_name(move["from"]), _name(move["to"]), String(move.get("promotion", ""))]


func apply_inputs(new_tick: int, snapshots: Array) -> void:
	if not active or paused or finished:
		return
	tick = maxi(tick, new_tick)
	if _ai_side == side_to_move:
		var ai_move: Dictionary = choose_ai_move(2)
		if not ai_move.is_empty():
			try_move(ai_move["from"], ai_move["to"], String(ai_move.get("promotion", "Q")))
		return
	var snapshot_row := _snapshot_for_side(snapshots, side_to_move)
	if snapshot_row.is_empty():
		return
	var pressed: Dictionary = snapshot_row.get("pressed", {})
	if bool(pressed.get("move_left", false)):
		cursor.x = maxi(0, cursor.x - 1)
	elif bool(pressed.get("move_right", false)):
		cursor.x = mini(7, cursor.x + 1)
	elif bool(pressed.get("move_up", false)):
		cursor.y = maxi(0, cursor.y - 1)
	elif bool(pressed.get("move_down", false)):
		cursor.y = mini(7, cursor.y + 1)
	elif bool(pressed.get("primary", false)) or bool(pressed.get("interact", false)):
		if selected == INVALID_SQUARE:
			if piece_at(cursor).begins_with(side_to_move):
				selected = cursor
		else:
			if not try_move(selected, cursor):
				selected = INVALID_SQUARE
	_render()


func _snapshot_for_side(snapshots: Array, side: String) -> Dictionary:
	var owner_seat := -999
	for index in seats.size():
		var seat: Dictionary = seats[index]
		var seat_side := String(seat.get("side", "w" if index == 0 else "b"))
		if seat_side == side:
			owner_seat = int(seat.get("seat", index))
			break
	for snapshot_value in snapshots:
		var snapshot: Dictionary = snapshot_value
		if int(snapshot.get("seat", -999)) == owner_seat:
			return snapshot
	return {}


func apply_event(event: Dictionary) -> void:
	if String(event.get("type", "move")) != "move" or finished:
		return
	var from_value: Variant = event.get("from", "")
	var to_value: Variant = event.get("to", "")
	var from: Vector2i = from_value if from_value is Vector2i else _point(String(from_value))
	var to: Vector2i = to_value if to_value is Vector2i else _point(String(to_value))
	_applying_network_event = true
	try_move(from, to, String(event.get("promotion", "Q")))
	_applying_network_event = false


func _inside(square: Vector2i) -> bool:
	return square.x >= 0 and square.x < 8 and square.y >= 0 and square.y < 8


func _other(color: String) -> String:
	return "b" if color == "w" else "w"


func _point(name: String) -> Vector2i:
	if name.length() != 2:
		return INVALID_SQUARE
	return Vector2i(name.unicode_at(0) - "a".unicode_at(0), 8 - int(name.substr(1, 1)))


func _name(square: Vector2i) -> String:
	return String.chr("a".unicode_at(0) + square.x) + str(8 - square.y)


func _build_ui() -> void:
	var background := ColorRect.new()
	background.color = INK
	background.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(background)
	var frame := VBoxContainer.new()
	frame.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT, Control.PRESET_MODE_MINSIZE, 24)
	frame.add_theme_constant_override("separation", 10)
	add_child(frame)
	var title := Label.new()
	title.text = "CROWN OF ASH // THE STATES AT WAR"
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_font_size_override("font_size", 28)
	title.add_theme_color_override("font_color", AMBER)
	frame.add_child(title)
	_status_label = Label.new()
	_status_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_status_label.add_theme_font_size_override("font_size", 18)
	_status_label.add_theme_color_override("font_color", BONE)
	frame.add_child(_status_label)
	var body := HBoxContainer.new()
	body.alignment = BoxContainer.ALIGNMENT_CENTER
	body.add_theme_constant_override("separation", 24)
	body.size_flags_vertical = Control.SIZE_EXPAND_FILL
	frame.add_child(body)
	var grid := GridContainer.new()
	grid.columns = 8
	grid.custom_minimum_size = Vector2(640, 640)
	body.add_child(grid)
	for y in 8:
		for x in 8:
			var cell := Label.new()
			cell.custom_minimum_size = Vector2(76, 76)
			cell.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
			cell.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
			cell.add_theme_font_size_override("font_size", 44)
			var style := StyleBoxFlat.new()
			style.bg_color = LIGHT_SQUARE if (x + y) % 2 == 0 else DARK_SQUARE
			style.border_color = Color("5d513f")
			style.set_border_width_all(1)
			cell.add_theme_stylebox_override("normal", style)
			grid.add_child(cell)
			_cells.append(cell)
	var lore := Label.new()
	lore.custom_minimum_size = Vector2(320, 0)
	lore.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	lore.text = "THE CROWN IS EMPTY.\n\nEvery state sends an army. Every capture becomes a remembered execution. The board accepts no excuses and no dice.\n\nPRIMARY / E — select and move\nF1 — strategy and controls"
	lore.add_theme_font_size_override("font_size", 18)
	lore.add_theme_color_override("font_color", BONE)
	body.add_child(lore)

	_battle_overlay = PanelContainer.new()
	_battle_overlay.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	_battle_overlay.custom_minimum_size = Vector2(620, 210)
	var battle_style := StyleBoxFlat.new()
	battle_style.bg_color = Color(0.05, 0.04, 0.03, 0.97)
	battle_style.border_color = RED
	battle_style.set_border_width_all(4)
	battle_style.set_content_margin_all(22)
	_battle_overlay.add_theme_stylebox_override("panel", battle_style)
	add_child(_battle_overlay)
	_battle_label = Label.new()
	_battle_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_battle_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_battle_label.add_theme_font_size_override("font_size", 30)
	_battle_label.add_theme_color_override("font_color", BONE)
	_battle_overlay.add_child(_battle_label)
	_battle_overlay.visible = false


func _render() -> void:
	if _cells.size() != 64:
		return
	for y in 8:
		for x in 8:
			var index := y * 8 + x
			var piece := piece_at(Vector2i(x, y))
			_cells[index].text = String(GLYPHS.get(piece, ""))
			_cells[index].add_theme_color_override("font_color", BONE if piece.begins_with("w") else RED)
			var style := StyleBoxFlat.new()
			style.bg_color = LIGHT_SQUARE if (x + y) % 2 == 0 else DARK_SQUARE
			if Vector2i(x, y) == selected:
				style.border_color = AMBER
				style.set_border_width_all(5)
			elif Vector2i(x, y) == cursor:
				style.border_color = BONE
				style.set_border_width_all(3)
			else:
				style.border_color = Color("5d513f")
				style.set_border_width_all(1)
			_cells[index].add_theme_stylebox_override("normal", style)
	_status_label.text = "%s TO MOVE // %s // MOVE %d" % [
		"BONE" if side_to_move == "w" else "RUST", game_status.to_upper(), fullmove_number]


func _on_feedback(kind: String, payload: Dictionary) -> void:
	if kind != "battle_capture" or _battle_overlay == null:
		return
	_battle_label.text = "%s  EXECUTES  %s" % [_piece_name(String(payload.get("attacker", ""))),
		_piece_name(String(payload.get("defender", "")))]
	_battle_overlay.visible = true
	var tween := create_tween()
	tween.tween_interval(1.2)
	tween.tween_callback(func() -> void:
		if is_instance_valid(_battle_overlay):
			_battle_overlay.visible = false)


func _piece_name(piece: String) -> String:
	var color := "BONE" if piece.begins_with("w") else "RUST"
	var kind: String = {"K": "CROWN", "Q": "REGENT", "R": "RIG", "B": "PREACHER",
		"N": "RIDER", "P": "LEVY"}.get(piece.substr(1, 1), "UNIT")
	return "%s %s" % [color, kind]
