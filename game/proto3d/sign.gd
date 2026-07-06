## SIGNS FOR THE ILLITERATE (player ask). The Divided States are full of people
## who can't read — so a sign shows a SYMBOL (📜) you always see, meaning "there are
## words here." You only READ the words when the sign falls inside your SIGHT CONE
## and you're close enough — then the text surfaces. Knowing letters is a luxury out
## here; the game makes you walk up and LOOK.
class_name ProtoSign
extends Node3D

var text: String = ""
var _symbol: Label3D = null
var _words: Label3D = null
var _readable: bool = false


static func create(text_in: String, glyph: String = "📜") -> ProtoSign:
	var s := ProtoSign.new()
	s.text = text_in
	# The post.
	var post := MeshInstance3D.new()
	var bm := BoxMesh.new()
	bm.size = Vector3(0.12, 1.9, 0.12)
	post.mesh = bm
	post.position.y = 0.95
	post.material_override = ProtoWorldBuilder.material(Color(0.34, 0.26, 0.16), 0.7, false)
	s.add_child(post)
	# The board.
	var board := MeshInstance3D.new()
	var bb := BoxMesh.new()
	bb.size = Vector3(1.1, 0.7, 0.08)
	board.mesh = bb
	board.position.y = 1.75
	board.material_override = ProtoWorldBuilder.material(Color(0.5, 0.42, 0.28), 0.6, false)
	s.add_child(board)
	# The SYMBOL — always visible, near + far: "there are words here."
	s._symbol = Label3D.new()
	s._symbol.text = glyph
	s._symbol.font_size = 64
	s._symbol.pixel_size = 0.006
	s._symbol.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	s._symbol.position.y = 1.75
	s._symbol.modulate = Color(1, 1, 1)
	s.add_child(s._symbol)
	# The WORDS — hidden until you're looking at it, close enough to read.
	s._words = Label3D.new()
	s._words.text = text_in
	s._words.font_size = 40
	s._words.pixel_size = 0.005
	s._words.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	s._words.position.y = 2.5
	s._words.modulate = Color(0.96, 0.9, 0.7)
	s._words.outline_size = 8
	s._words.outline_modulate = Color(0, 0, 0, 0.85)
	s._words.visible = false
	s.add_child(s._words)
	return s


## True while the words are legible (in cone + in range). Sim + HUD hook.
func is_readable() -> bool:
	return _readable


## proto3d flips this each frame from the sight-cone test. Reading fades the
## symbol back and lifts the words up.
func set_readable(on: bool) -> void:
	if on == _readable:
		return
	_readable = on
	_words.visible = on
	_symbol.modulate = Color(0.8, 0.9, 0.7) if on else Color(1, 1, 1)
