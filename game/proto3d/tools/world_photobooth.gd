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
	{"name": "colorado_i25", "pos": Vector3(-35125, 1.0, 0), "yaw": 20.0},
	{"name": "appalachia_i40", "pos": Vector3(-6500, 1.0, 2875), "yaw": 20.0},
	{"name": "mississippi_i90", "pos": Vector3(-15737, 1.0, -10966), "yaw": 70.0},
	{"name": "overpass_i40_i75", "pos": Vector3(-6980, 1.0, 2794), "yaw": 81.0},
	{"name": "town_approach_farmbelt", "pos": Vector3(-55950, 1.0, -17850), "yaw": 105.0}, # ARC 2: Seattle fades in through worked land + water tower
	{"name": "billboard_i40", "pos": Vector3(-2373, 1.0, 3537), "yaw": 180.0}, # ARC 2: EXIT 20 advert readable at the wheel
	{"name": "ecotone_seam", "pos": Vector3(-7616, 1.0, -19392), "yaw": 65.0}, # ARC 2: forest thins into the neighbor biome
	{"name": "meridian_districts", "pos": Vector3(150, 1.0, -320), "yaw": 160.0}, # ARC 3: downtown grey vs fairgrounds trampled
	{"name": "ghost_dead_motel", "pos": Vector3(-57011, 1.0, -2140), "yaw": 175.0}, # ARC 3: decayed Americana off a dirt spur
	{"name": "seattle_city_exit", "pos": Vector3(-56064, 1.0, -17888), "yaw": 68}, # CITY EXITS: standing at the exit, looking down the 6-deg ramp into Seattle
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
	# THE VERTICAL COUNTRY: spots carry authored y for flat land, but painted
	# relief and road humps rise above it — stage on the REAL surface (land or
	# road deck, whichever is higher) or the player spawns under the world and
	# the void net teleports the shot home to the safehouse.
	var road: Dictionary = main.stream.usmap.road_near(pos, 60.0)
	var surf_y := ProtoWorldBuilder.ground_y(pos.x, pos.z)
	if not road.is_empty():
		var a2: Vector2 = road["a"]
		var ab: Vector2 = (road["b"] as Vector2) - a2
		var t := clampf((Vector2(pos.x, pos.z) - a2).dot(ab) / maxf(ab.length_squared(), 0.001), 0.0, 1.0)
		surf_y = maxf(surf_y, lerpf(float(road.get("elev_a", 0.0)), float(road.get("elev_b", 0.0)), t))
	pos.y = maxf(pos.y, surf_y + 1.0)
	main.player.global_position = pos
	main.player.rotation.y = deg_to_rad(float(s.get("yaw", 0.0)))
	# let the streamer build the neighborhood (chunks, roads, towns, trees)
	for _i in 40:
		main.stream.update_stream(pos, main)
		await get_tree().physics_frame
	# the teleport "crossed" every state line on the way — flush the border
	# toasts so the shot documents the WORLD, not the travel noise
	if main.get("hud") != null and "_toast_q" in main.hud:
		main.hud._toast_q.clear()
		if main.hud.get("_toast_label") != null:
			main.hud._toast_label.text = ""
	for _i in 30:
		await get_tree().process_frame
	await RenderingServer.frame_post_draw
	await get_tree().process_frame
	await RenderingServer.frame_post_draw
	var img := get_viewport().get_texture().get_image()
	var path := "%s/%s.png" % [out_abs, String(s["name"])]
	print("PHOTOBOOTH: %s -> %s" % [s["name"], "ok" if img.save_png(path) == OK else "ERR"])
