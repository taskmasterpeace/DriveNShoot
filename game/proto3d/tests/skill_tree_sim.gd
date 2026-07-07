## Proof for THE SKILL TREE (skill_tree.gd + data/skill_perks.json — goal, idea from
## SkillEditor adapted to level-by-doing). Perk nodes load per skill, the tree renders a
## branch per skill, and nodes UNLOCK (light up) only when the skill's level reaches their
## threshold — earned by use, never spent. Run:
## godot --headless --path game res://proto3d/tests/skill_tree_sim.tscn
extends Node

var passed := 0
var failed := 0


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("SKILLTREE: %s - %s" % ["PASS" if ok else "FAIL", check_name])


## Every Label text under a node (recursive) — to read what the tree is showing.
func _labels(node: Node, out: Array) -> void:
	if node is Label:
		out.append((node as Label).text)
	for c in node.get_children():
		_labels(c, out)


func _ready() -> void:
	# --- The perk data: a branch for every skill; martial_arts carries the REAL gates. ---
	var perks := ProtoSkillTree.perks()
	_check("perks load for all 11 skills", perks.size() == 11)
	var ma: Array = perks.get("martial_arts", [])
	_check("martial_arts has KICKS@2 / THROWS@4 / FINISHERS@6",
		ma.size() == 3 and int(ma[0]["level"]) == 2 and int(ma[1]["level"]) == 4 and int(ma[2]["level"]) == 6
		and String(ma[0]["name"]) == "KICKS")
	_check("every skill in SKILLS has a perk branch",
		ProtoCharacter.SKILLS.keys().all(func(id): return perks.has(id)))

	# --- The progression math matches character.gd (xp = 40·level²). ---
	_check("xp_for_level(2) == 160", ProtoSkillTree.xp_for_level(2) == 160.0)

	var character := ProtoCharacter.new()
	var main := Node.new()
	add_child(main)
	var tree := ProtoSkillTree.create(main, character)
	add_child(tree)

	character.skills["driving"] = {"xp": 260.0, "level": 2}   # 100 of 200 into level 3
	_check("progress_to_next is the fraction to the next level (~0.5)", absf(tree.progress_to_next("driving") - 0.5) < 0.01)

	# --- The tree renders a branch per skill. ---
	tree.open()
	_check("the tree shows a branch per skill (11)", tree._list.get_child_count() == 11)

	# --- Nodes are LOCKED until the level is earned. ---
	var lv0: Array = []
	_labels(tree._list, lv0)
	_check("at level 0, KICKS is LOCKED", lv0.any(func(t): return "🔒 Lv2 — KICKS" in String(t)))
	_check("at level 0, KICKS is NOT unlocked", not lv0.any(func(t): return "✓ KICKS" in String(t)))

	# Level martial_arts to 2 BY DOING (real xp), reopen — KICKS lights, THROWS still locked.
	character.add_xp("martial_arts", ProtoSkillTree.xp_for_level(2))   # → level 2
	_check("leveled martial_arts to 2 via add_xp", character.level("martial_arts") == 2)
	tree._rebuild()
	var lv2: Array = []
	_labels(tree._list, lv2)
	_check("KICKS UNLOCKS at level 2 (✓)", lv2.any(func(t): return "✓ KICKS" in String(t)))
	_check("THROWS still LOCKED at level 2 (needs 4)", lv2.any(func(t): return "🔒 Lv4 — THROWS" in String(t)))

	# Open/close state.
	_check("tree is open", tree.is_open)
	tree.close()
	_check("tree closes", not tree.is_open and not tree._root.visible)

	print("SKILLTREE: DONE — %d passed, %d failed" % [passed, failed])
	get_tree().quit(1 if failed > 0 else 0)
