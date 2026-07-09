## VISUAL proof for the TV fix (2026-07-08): boot the real game, roll the test reel,
## go TO THE COUCH (close the fullscreen panel), and screenshot the physical TV set —
## the picture must be ON THE MODEL now, not a frozen/blank amber screen. NON-headless
## (real GPU + video decode + SubViewport render); the offscreen path is blank headless.
extends Node

const OUT := "C:/WINDOWS/TEMP/claude/D--git-carworld/6c9af67f-9864-4393-bc47-bb421db03620/scratchpad/photobooth"
var _cam: Camera3D


func _ready() -> void:
	DirAccess.make_dir_recursive_absolute(OUT)
	get_tree().create_timer(60.0).timeout.connect(func() -> void:
		print("RENDER_TV: WATCHDOG"); get_tree().quit(1))
	var main: Node3D = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 8:
		await get_tree().process_frame

	main._exit_car()
	var p: ProtoPlayer3D = main.player
	p.global_position = main.SAFEHOUSE + Vector3(-3.0, 0.35, -1.4)
	p.velocity = Vector3.ZERO
	for _i in 8:
		await get_tree().physics_frame

	# Roll the test reel.
	main.media_panel.open()
	main.media_panel.set_category("clips")
	await get_tree().process_frame
	main.media_panel.select_media("test_pattern")
	for _i in 30: # let the stream decode a few real frames into the viewport
		await get_tree().physics_frame

	# SHOT A — the FULLSCREEN panel: the WHOLE frame (the reference for "not cropped").
	await get_tree().process_frame
	await RenderingServer.frame_post_draw
	await get_tree().process_frame
	await RenderingServer.frame_post_draw
	var img_fs := get_viewport().get_texture().get_image()
	print("RENDER_TV: fullscreen -> %s" % ("ok" if img_fs.save_png("%s/TV_fullscreen.png" % OUT) == OK else "ERR"))

	# SHOT B — the MODEL screen, straight-on at a framing distance. If it shows only a
	# sub-rect of the frame (a corner), the BoxMesh UV crop is real (fix: QuadMesh).
	main.media_panel.close() # to the couch
	for _i in 40:
		await get_tree().physics_frame
	var tv: ProtoTV = main.media_panel.tv_set
	print("RENDER_TV: is_live=%s yaw=%.2f" % [tv.is_live(), tv.rotation.y])
	var scr: MeshInstance3D = tv.screen
	_cam = Camera3D.new()
	add_child(_cam)
	_cam.current = true
	var front: Vector3 = -tv.global_transform.basis.z.normalized() # the TV's front (cabinet face, -Z)
	_cam.global_position = scr.global_position + front * 1.5 + Vector3(0, 0.02, 0)
	_cam.look_at(scr.global_position, Vector3.UP)
	for _i in 6:
		await get_tree().process_frame
	await RenderingServer.frame_post_draw
	await get_tree().process_frame
	await RenderingServer.frame_post_draw
	var img := get_viewport().get_texture().get_image()
	print("RENDER_TV: model_screen -> %s" % ("ok" if img.save_png("%s/TV_model_screen.png" % OUT) == OK else "ERR"))
	get_tree().quit(0)
