## THE SKILL TREE (goal — idea from Michael-Jalloh/SkillEditor, MIT). A SPEND-points tree
## doesn't fit DRIVN (skills level BY DOING, never by menu), so this is the honest version:
## a visual MASTERY tree where every skill is a branch and its milestone PERK nodes LIGHT UP
## as the skill levels through use — earned, not bought. Data-driven (data/skill_perks.json,
## SkillEditor's node-per-skill shape); the text atlas sheet (K) is untouched. Opens on U.
class_name ProtoSkillTree
extends CanvasLayer

const AMBER := Color(0.96, 0.72, 0.2)
const BONE := Color(0.92, 0.89, 0.82)
const DIM := Color(0.5, 0.48, 0.43)
const LOCKED_BG := Color(0.12, 0.12, 0.11)
const UNLOCKED_BG := Color(0.28, 0.20, 0.05)
const PERKS_PATH := "res://data/skill_perks.json"

static var _perks_cache: Dictionary = {}

var is_open: bool = false
var _main: Node = null
var _character: ProtoCharacter = null
var _root: PanelContainer
var _list: VBoxContainer


static func create(main: Node, character: ProtoCharacter) -> ProtoSkillTree:
	var st := ProtoSkillTree.new()
	st.layer = 4
	st._main = main
	st._character = character

	st._root = PanelContainer.new()
	st._root.set_anchors_preset(Control.PRESET_CENTER)
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.05, 0.05, 0.04, 0.97)
	style.border_color = AMBER
	style.set_border_width_all(2)
	style.set_content_margin_all(14)
	st._root.add_theme_stylebox_override("panel", style)
	st.add_child(st._root)

	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 8)
	v.custom_minimum_size = Vector2(560, 520)
	st._root.add_child(v)

	var head := HBoxContainer.new()
	var title := Label.new()
	title.text = "🌳 SKILL TREE — every branch levels by DOING"
	title.add_theme_font_override("font", ProtoHUD.mixed_font())
	title.add_theme_font_size_override("font_size", 20)
	title.add_theme_color_override("font_color", AMBER)
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	head.add_child(title)
	var x := Button.new()
	x.text = "✕"
	x.add_theme_color_override("font_color", Color(0.9, 0.4, 0.3))
	x.pressed.connect(func() -> void: st.close())
	head.add_child(x)
	v.add_child(head)

	var scroll := ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	v.add_child(scroll)
	st._list = VBoxContainer.new()
	st._list.add_theme_constant_override("separation", 10)
	st._list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(st._list)

	st._root.visible = false
	return st


## The perk nodes per skill: {skill_id: [{level, name, desc}]}. Loaded + cached from JSON.
static func perks() -> Dictionary:
	if not _perks_cache.is_empty():
		return _perks_cache
	if FileAccess.file_exists(PERKS_PATH):
		var d: Variant = JSON.parse_string(FileAccess.get_file_as_string(PERKS_PATH))
		if d is Dictionary and (d as Dictionary).has("perks"):
			_perks_cache = (d as Dictionary)["perks"]
	return _perks_cache


func open() -> void:
	is_open = true
	_root.visible = true
	_rebuild()


func close() -> void:
	is_open = false
	_root.visible = false


func toggle() -> void:
	if is_open: close()
	else: open()


## xp needed to REACH level l (character.gd: level = floor(sqrt(xp/40)) → xp = 40·l²).
static func xp_for_level(l: int) -> float:
	return 40.0 * float(l) * float(l)


## 0..1 progress from the current level toward the next.
func progress_to_next(skill_id: String) -> float:
	if _character == null or not _character.skills.has(skill_id):
		return 0.0
	var s: Dictionary = _character.skills[skill_id]
	var lvl := int(s["level"])
	var cur := xp_for_level(lvl)
	var nxt := xp_for_level(lvl + 1)
	return clampf((float(s["xp"]) - cur) / maxf(1.0, nxt - cur), 0.0, 1.0)


func _rebuild() -> void:
	for c in _list.get_children():
		c.queue_free()
	# Star (signature) skills first, then the rest — same order as the text sheet.
	for star in [true, false]:
		for id in ProtoCharacter.SKILLS:
			if bool(ProtoCharacter.SKILLS[id].get("star", false)) == star:
				_list.add_child(_branch(String(id)))


func _branch(skill_id: String) -> Control:
	var row: Dictionary = ProtoCharacter.SKILLS[skill_id]
	var lvl := _character.level(skill_id) if _character != null else 0

	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 3)

	# Header: ⭐ emoji name — Lv N
	var htext := "%s%s %s — Lv %d" % ["⭐ " if bool(row.get("star", false)) else "", row.get("emoji", ""), row.get("name", skill_id), lvl]
	var header := Label.new()
	header.text = htext
	header.add_theme_font_override("font", ProtoHUD.mixed_font())
	header.add_theme_font_size_override("font_size", 15)
	header.add_theme_color_override("font_color", AMBER if bool(row.get("star", false)) else BONE)
	box.add_child(header)

	# Progress bar toward the next level (control_gallery ProgressBar).
	var bar := ProgressBar.new()
	bar.min_value = 0.0
	bar.max_value = 1.0
	bar.value = progress_to_next(skill_id)
	bar.show_percentage = false
	bar.custom_minimum_size = Vector2(0, 8)
	box.add_child(bar)

	# Perk nodes — chips that light when level ≥ their threshold.
	var chips := HBoxContainer.new()
	chips.add_theme_constant_override("separation", 6)
	var node_list: Array = perks().get(skill_id, [])
	for node_v in node_list:
		var node: Dictionary = node_v
		var need := int(node.get("level", 1))
		chips.add_child(_chip(String(node.get("name", "")), String(node.get("desc", "")), need, lvl >= need))
	box.add_child(chips)
	return box


func _chip(pname: String, desc: String, need: int, unlocked: bool) -> Control:
	var chip := PanelContainer.new()
	var style := StyleBoxFlat.new()
	style.bg_color = UNLOCKED_BG if unlocked else LOCKED_BG
	style.border_color = AMBER if unlocked else DIM
	style.set_border_width_all(1)
	style.set_content_margin_all(5)
	chip.add_theme_stylebox_override("panel", style)
	var lbl := Label.new()
	lbl.text = ("✓ " + pname) if unlocked else ("🔒 Lv%d — %s" % [need, pname])
	lbl.add_theme_font_override("font", ProtoHUD.mixed_font())
	lbl.add_theme_font_size_override("font_size", 12)
	lbl.add_theme_color_override("font_color", BONE if unlocked else DIM)
	lbl.tooltip_text = desc
	chip.tooltip_text = desc
	chip.add_child(lbl)
	return chip
