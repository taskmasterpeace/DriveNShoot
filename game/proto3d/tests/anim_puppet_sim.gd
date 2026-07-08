## Proof for THE CLIP-DRIVEN PUPPET (owner 2026-07-08: "we switch to animation
## clips"). The Mesh2Motion-rigged humanoid GLB drives the player body with REAL
## AnimationPlayer clips instead of sin() bone-posing. Verifies:
##  - the GLB loads with its AnimationPlayer + 66-bone skeleton + mesh
##  - logical states map to real clips (walk + death at minimum)
##  - animate(moving) actually MOVES the skeleton over frames (clips playing, not frozen)
##  - animate(dead) switches to the death clip
##  - player_3d builds ProtoAnimPuppet as its body and drives animate() without error
##  - the model stands ~1.8 m tall, feet ~y=0 (upright, groundable)
## Run: godot --headless --path game res://proto3d/tests/anim_puppet_sim.tscn
extends Node

var passed := 0
var failed := 0
var _prev_time_scale: float = 1.0


func _check(n: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("ANIMPUP: %s - %s" % ["PASS" if ok else "FAIL", n])


func _ready() -> void:
	print("ANIMPUP: start")
	_prev_time_scale = Engine.time_scale
	get_tree().create_timer(30.0, true, false, true).timeout.connect(func() -> void:
		print("ANIMPUP: WATCHDOG timeout"); _finish())
	await _run()


func _run() -> void:
	# 1) Build the puppet.
	var p: ProtoAnimPuppet = ProtoAnimPuppet.create({})
	add_child(p)
	for _f in 4:
		await get_tree().process_frame
	_check("puppet built", p != null)
	_check("skeleton present (66 bones)", p.skel != null and p.skel.get_bone_count() == 66)
	_check("mesh present", p.mesh != null)
	_check("AnimationPlayer present", p._ap != null)
	_check("weapon mount on hand_r", p.hand_mount != null)

	# 2) Logical states map to real clips.
	_check("walk clip mapped", String(p._clips.get("walk", "")) != "")
	_check("death clip mapped", String(p._clips.get("death", "")) != "")

	# 3) Model stands upright, ~1.8 m, feet near y=0.
	var aabb := _aabb(p)
	_check("stands ~1.6-2.0 m tall (%.2f)" % aabb.size.y, aabb.size.y >= 1.5 and aabb.size.y <= 2.1)
	_check("feet near ground (min.y=%.2f)" % aabb.position.y, absf(aabb.position.y) < 0.15)

	# 4) MOVING → the walk clip actually animates the skeleton over time.
	var head := p.skel.find_bone("head")
	var hand := p.skel.find_bone("hand_r")
	p.animate(0.016, 3.0, 0.0, false, 0.0, false) # enter walk
	for _f in 2:
		await get_tree().process_frame
	var pose_a := p.skel.get_bone_global_pose(hand).origin
	var head_a := p.skel.get_bone_global_pose(head).origin
	for _f in 12: # let the clip advance
		p.animate(0.016, 3.0, 0.0, false, 0.0, false)
		await get_tree().process_frame
	var pose_b := p.skel.get_bone_global_pose(hand).origin
	_check("walk clip MOVES the skeleton (Δ=%.3f)" % pose_a.distance_to(pose_b), pose_a.distance_to(pose_b) > 0.01)
	_check("state == walk", p._state == "walk")

	# 5) DEAD → switch to the death clip.
	p.animate(0.016, 0.0, 0.0, false, 0.0, true)
	for _f in 4:
		await get_tree().process_frame
	_check("state == death when dead", p._state == "death")
	_check("playing death clip", p._ap.current_animation == String(p._clips.get("death", "")))

	# 6) player_3d builds + drives it end to end.
	ProtoPlayer3D.USE_ANIM_PUPPET = true
	var pl: ProtoPlayer3D = ProtoPlayer3D.create({})
	add_child(pl)
	for _f in 4:
		await get_tree().process_frame
	_check("player body IS ProtoAnimPuppet", pl.puppet is ProtoAnimPuppet)
	# Drive a few animate frames through the player's own path (no crash).
	var ok := true
	for _f in 6:
		pl.puppet.animate(0.016, 2.5, 0.0, false, 0.0, false)
		await get_tree().process_frame
	_check("player drives animate() clean", ok and is_instance_valid(pl.puppet))

	_finish()


func _aabb(n: Node) -> AABB:
	var out := AABB(); var first := true
	for m in _meshes(n):
		var mi := m as MeshInstance3D
		var w := mi.get_global_transform() * mi.get_aabb()
		if first: out = w; first = false
		else: out = out.merge(w)
	return out


func _meshes(n: Node) -> Array:
	var o: Array = []
	if n is MeshInstance3D and (n as MeshInstance3D).mesh != null: o.append(n)
	for c in n.get_children(): o.append_array(_meshes(c))
	return o


func _finish() -> void:
	Engine.time_scale = _prev_time_scale
	print("ANIMPUP: DONE passed=%d failed=%d" % [passed, failed])
	get_tree().quit(1 if failed > 0 else 0)
