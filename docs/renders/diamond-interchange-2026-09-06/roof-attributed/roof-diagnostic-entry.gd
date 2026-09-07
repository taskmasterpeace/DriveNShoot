extends SceneTree

func _init() -> void:
	call_deferred("_start")

func _start() -> void:
	var script: Script = load("D:/git/carworld/.worktrees/america-foundation/.superpowers/sdd/2026-09-06-diamond-interchanges/roof-diagnostic.gd")
	var scene := Node.new()
	scene.set_script(script)
	root.add_child(scene)
