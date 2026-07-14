## WORLD PHOTOBOOTH — before/after proof for WORLD-SCALE changes (tree density,
## city layout). Boots the REAL game (proto3d.tscn), teleports the player to
## named spots, lets the streamer settle, and captures the actual driving-camera
## view to PNGs. Same non-headless law as showroom.gd (real swapchain needed).
##
## Run:  Godot --path game res://proto3d/tools/world_photobooth.tscn -- <tag>
## Out:  docs/renders/world/<tag>/<spot>.png   (tag e.g. "baseline", "after")
extends Node

const OUT := "res://../docs/renders/world"

## The standing shot list: FOREST deep in a forest biome, PLAINS, a small town,
## and MERIDIAN's core. Positions in world meters (usmap space).
## Each: name, pos (teleport), cam_yaw_deg (which way the eye faces).
const SHOTS: Array = [
	{"name": "meridian_main", "pos": Vector3(110, 1.0, -320), "yaw": 0.0},
	{"name": "meridian_edge", "pos": Vector3(60, 1.0, -260), "yaw": 140.0},
	{"name": "forest_deep_east", "pos": Vector3(-5250, 1.0, -19250), "yaw": 45.0},
	{"name": "swamp", "pos": Vector3(-11250, 1.0, 13250), "yaw": 45.0},
	{"name": "plains", "pos": Vector3(-37750, 1.0, -19250), "yaw": 45.0},
	{"name": "farmland", "pos": Vector3(-22750, 1.0, -19250), "yaw": 45.0},
	{"name": "mountains", "pos": Vector3(-53750, 1.0, -19250), "yaw": 45.0},
	{"name": "town_downtown", "pos": Vector3(-23600, 1.0, 13114), "yaw": 30.0},
	{"name": "town_mainstreet", "pos": Vector3(-4800, 1.0, 14533), "yaw": 30.0},
]

var main: Node = null
var _tag: String = "baseline"
var _extra_spots: Array = []


func _ready() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() > 0:
		_tag = String(args[0])
	# extra spots via args: name,x,z,yaw tuples after the tag
	for i in range(1, args.size()):
		var parts: PackedStringArray = String(args[i]).split(",")
		if parts.size() >= 3:
			_extra_spots.append({"name": parts[0],
				"pos": Vector3(float(parts[1]), 1.0, float(parts[2])),
				"yaw": float(parts[3]) if parts.size() > 3 else 0.0})
	var out_abs := ProjectSettings.globalize_path(OUT) + "/" + _tag
	DirAccess.make_dir_recursive_absolute(out_abs)

	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 10:
		await get_tree().physics_frame
	# the run may boot at the menu or the wheel — clear both
	if "menu_open" in main and main.menu_open:
		main.menu_open = false
	if main.get("mode") == 0 and main.get("active_car") != null:
		main._exit_car()
		await get_tree().physics_frame

	var all_shots: Array = SHOTS + _extra_spots
	for s in all_shots:
		await _shoot(s, out_abs)
	print("PHOTOBOOTH: done, %d shots -> %s" % [all_shots.size(), out_abs])
	get_tree().quit(0)


func _shoot(s: Dictionary, out_abs: String) -> void:
	var pos: Vector3 = s["pos"]
	main.player.global_position = pos
	main.player.rotation.y = deg_to_rad(float(s.get("yaw", 0.0)))
	# let the streamer build the neighborhood (chunks, roads, towns, trees)
	for _i in 40:
		main.stream.update_stream(pos, main)
		await get_tree().physics_frame
	for _i in 30:
		await get_tree().process_frame
	await RenderingServer.frame_post_draw
	await get_tree().process_frame
	await RenderingServer.frame_post_draw
	var img := get_viewport().get_texture().get_image()
	var path := "%s/%s.png" % [out_abs, String(s["name"])]
	print("PHOTOBOOTH: %s -> %s" % [s["name"], "ok" if img.save_png(path) == OK else "ERR"])
