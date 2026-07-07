## Proof for ProtoSplitView (split_view.gd) — the dynamic split-screen tech. Verifies the
## split RULE (horizontal separation vs threshold), that the module builds its two shared-
## world viewports + composite shader, and that a live instance flips split_active on/off
## as the remote flies away/returns — all through the real path, boot included. Run:
## godot --headless --path game res://proto3d/tests/split_view_sim.tscn
extends Node

var passed := 0
var failed := 0


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("SPLIT: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _n3(p: Vector3) -> Node3D:
	var n := Node3D.new()
	n.position = p
	add_child(n)
	return n


func _ready() -> void:
	# The pure rule: split only past the horizontal separation threshold.
	_check("close → no split", not ProtoSplitView.would_split(Vector3.ZERO, Vector3(5, 0, 0), 20.0))
	_check("far → split", ProtoSplitView.would_split(Vector3.ZERO, Vector3(30, 0, 0), 20.0))
	_check("altitude alone never splits (horizontal only)", not ProtoSplitView.would_split(Vector3.ZERO, Vector3(0, 80, 0), 20.0))

	# The module builds: two SHARED-world viewports, two cameras, the composite shader.
	var sv := ProtoSplitView.create()
	_check("two SubViewports built", sv._vp1 is SubViewport and sv._vp2 is SubViewport)
	_check("viewports SHARE the main World3D (own_world_3d = false)", not sv._vp1.own_world_3d and not sv._vp2.own_world_3d)
	_check("a camera per view", sv._cam1 is Camera3D and sv._cam2 is Camera3D)
	_check("fullscreen composite has the split shader", sv._view is ColorRect and sv._mat.shader != null)
	_check("starts hidden/inactive", not sv.visible and not sv.active)

	add_child(sv)
	await get_tree().process_frame

	# Live: activate on a close pair → seamless (split_active false).
	var body := _n3(Vector3.ZERO)
	var drone := _n3(Vector3(4, 8, 0))
	sv.max_separation = 20.0
	sv.activate(body, drone)
	await get_tree().process_frame
	_check("activate shows the view", sv.active and sv.visible)
	_check("close pair renders ONE seamless view (split_active false)", sv._mat.get_shader_parameter("split_active") == false)

	# Fly the drone away → the screen auto-splits.
	drone.global_position = Vector3(45, 8, 0)
	sv._process(0.1)
	_check("drone flies far → screen AUTO-SPLITS (split_active true)", sv._mat.get_shader_parameter("split_active") == true)

	# Bring it back → merges again.
	drone.global_position = Vector3(3, 8, 0)
	sv._process(0.1)
	_check("drone returns → screen MERGES back to one view", sv._mat.get_shader_parameter("split_active") == false)

	sv.deactivate()
	_check("deactivate hides the view", not sv.active and not sv.visible)

	print("SPLIT: DONE — %d passed, %d failed" % [passed, failed])
	get_tree().quit(1 if failed > 0 else 0)
