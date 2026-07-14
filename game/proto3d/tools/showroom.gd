## THE SHOWROOM — a visual render harness for every VEHICLE and STRUCTURE row,
## so the fleet + world catalog get judged by EYE, not by a green sim (owner law:
## a sim proves structure, never looks — a gauge shipped with hallucinated art
## once because nobody looked). Renders PNGs from useful angles for every row in
## ProtoCar3D.VEHICLES (front-3/4, side, rear-3/4, top, a standing-puppet SCALE
## shot, and a SEATED-rider shot for two-wheel rigs) and every row in the
## structure_profiles.json catalog (3/4 + top).
##
## Mode via `OS.get_cmdline_user_args()`: vehicles | structures | all (default all).
## Runs NON-headless (real GPU) — same law as render_body.gd/render_structures.gd/
## render_creatures.gd: get_viewport().get_texture() needs a real swapchain, and
## `--headless` hangs forever waiting on RenderingServer.frame_post_draw (verified
## by every sibling render_*.gd's header comment; this one follows the same law
## rather than re-paying that discovery).
##
## Run:  Godot --path game res://proto3d/tools/showroom.tscn -- vehicles
##       Godot --path game res://proto3d/tools/showroom.tscn -- structures
##       Godot --path game res://proto3d/tools/showroom.tscn -- all   (default)
extends Node3D

const OUT := "res://../docs/renders/showroom"

var _cam: Camera3D
var _out_abs: String = ""
var _manifest: Array = []


func _ready() -> void:
	_out_abs = ProjectSettings.globalize_path(OUT)
	DirAccess.make_dir_recursive_absolute(_out_abs)
	DirAccess.make_dir_recursive_absolute(_out_abs + "/vehicles")
	DirAccess.make_dir_recursive_absolute(_out_abs + "/structures")

	var env := WorldEnvironment.new()
	var e := Environment.new()
	e.background_mode = Environment.BG_COLOR
	e.background_color = Color(0.27, 0.29, 0.33)
	e.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	e.ambient_light_color = Color(0.62, 0.64, 0.7)
	e.ambient_light_energy = 1.2
	env.environment = e
	add_child(env)
	var key := DirectionalLight3D.new()
	key.rotation_degrees = Vector3(-55, -35, 0)
	key.light_energy = 1.7
	add_child(key)
	var fill := DirectionalLight3D.new()
	fill.rotation_degrees = Vector3(-20, 140, 0)
	fill.light_energy = 0.55
	add_child(fill)
	var floor_mesh := MeshInstance3D.new()
	var pm := PlaneMesh.new()
	pm.size = Vector2(70, 70)
	floor_mesh.mesh = pm
	floor_mesh.material_override = ProtoWorldBuilder.material(Color(0.15, 0.16, 0.17), 0.95)
	add_child(floor_mesh)
	# a REAL collider under the turntable — the vehicles are physics bodies and
	# need something to settle their suspension onto before the shot.
	var ground := StaticBody3D.new()
	var shape := CollisionShape3D.new()
	var box := BoxShape3D.new()
	box.size = Vector3(70, 1, 70)
	shape.shape = box
	shape.position.y = -0.5
	ground.add_child(shape)
	add_child(ground)

	_cam = Camera3D.new()
	_cam.current = true
	add_child(_cam)

	var args := OS.get_cmdline_user_args()
	var mode := String(args[0]) if args.size() > 0 else "all"

	if mode == "vehicles" or mode == "all":
		await _render_vehicles()
	if mode == "structures" or mode == "all":
		await _render_structures()

	var manifest_path := "%s/manifest.json" % _out_abs
	var f := FileAccess.open(manifest_path, FileAccess.WRITE)
	f.store_string(JSON.stringify({
		"generated": Time.get_datetime_string_from_system(),
		"mode": mode,
		"count": _manifest.size(),
		"shots": _manifest,
	}, "\t"))
	f.close()
	print("SHOWROOM: done, %d rows -> %s" % [_manifest.size(), manifest_path])
	get_tree().quit(0)


# =============================================================================
# VEHICLES
# =============================================================================
func _render_vehicles() -> void:
	DrivnData.ensure() # folds vehicles.json overlays + materializes data-only rigs
	var ids: Array = ProtoCar3D.VEHICLES.keys()
	ids.sort()
	for vid_v in ids:
		var vid: String = String(vid_v)
		var s: Dictionary = ProtoCar3D.VEHICLES[vid]
		var chassis: Vector3 = s.get("chassis", Vector3(2.0, 1.0, 4.0))
		var car := ProtoCar3D.create(vid, Color(0.45, 0.44, 0.42))
		add_child(car)
		car.position = Vector3(0, chassis.y * 0.5 + 0.5, 0)
		car.rotation.y = 0.0 # headlights are built at -Z (car_3d.gd's _add_style_headlights);
			# leaving rotation at 0 means the nose faces our -Z "front34" camera. (A PI
			# flip here — copied from test_grounds.gd's unrelated walker-facing law —
			# pointed the TAILLIGHTS at the "front" camera; caught by eyeballing the render.)
		car.use_player_input = false
		car.is_active = false
		for _f in 60: # let the suspension settle onto the ground before the shot
			await get_tree().physics_frame

		# Bounding-SPHERE fit (not a flat footprint-only reach): a compact car's
		# chassis (2-6m) is an order of magnitude smaller than a structure's
		# footprint (8-60m), so the structures' additive-constant formula left
		# every vehicle a matchbox-sized speck lost in gray. Fit a sphere around
		# the chassis half-extents and place the camera to fill ~55% of the
		# 75deg-vertical-fov frame (sin(37.5deg) ~= 0.61; 0.5 leaves margin for
		# the "scale" shot's extra puppet).
		var half_len: float = chassis.z * 0.5
		var half_wid: float = chassis.x * 0.5
		var half_h: float = chassis.y * 0.6 + 0.3 # a little headroom for cab/roof racks
		var radius: float = sqrt(half_len * half_len + half_wid * half_wid + half_h * half_h)
		var dist: float = radius / 0.5
		var look_y: float = chassis.y * 0.4
		var angles: Array = ["front34", "side", "rear34", "top", "scale"]
		await _shot("vehicles/%s_front34" % vid, Vector3(dist * 0.55, half_h * 1.3 + 0.5, -dist * 0.85), Vector3(0, look_y, 0))
		await _shot("vehicles/%s_side" % vid, Vector3(dist * 1.05, half_h * 0.9 + 0.3, 0.0), Vector3(0, look_y, 0))
		await _shot("vehicles/%s_rear34" % vid, Vector3(-dist * 0.55, half_h * 1.3 + 0.5, dist * 0.85), Vector3(0, look_y, 0))
		# a look_at() straight down needs its tiny epsilon on ONE horizontal axis
		# only — (eps, H, eps) split evenly between x AND z gave the "up" vector a
		# 45deg diagonal bias, so every top-down shot rendered the vehicle rotated
		# a free 45 degrees off true (caught by eyeballing the render).
		await _shot("vehicles/%s_top" % vid, Vector3(0.0, dist * 1.7, 0.001), Vector3.ZERO)

		# --- SCALE shot: a standing puppet beside the vehicle (the must-have) -----
		var pup: ProtoPuppet = ProtoPuppet.create({})
		add_child(pup)
		pup.position = Vector3(chassis.x * 0.5 + 0.9, 0, chassis.z * 0.3)
		pup.rotation.y = PI * 0.25
		for _i in 20:
			pup.animate(0.016, 0.0, 0.0, false, 0.0, false)
			await get_tree().process_frame
		var dist_scale: float = dist * 1.3 # the extra puppet needs more room in-frame
		await _shot("vehicles/%s_scale" % vid, Vector3(dist_scale * 0.6, half_h * 1.1 + 0.6, -dist_scale * 0.9), Vector3(0, chassis.y * 0.35, 0))

		# --- SEATED rider (nice-to-have): two-wheel rigs get a puppet on the seat,
		# reusing proto3d.gd's _pose_exposed_rider seat math + ProtoPuppet.pose_riding.
		if bool(s.get("two_wheel", false)):
			var seat: Vector3 = car.global_transform * Vector3(0, float(chassis.y) * 0.5 + 0.32, 0.12)
			pup.global_position = seat
			pup.rotation.y = 0.0 # pose_riding assumes the puppet already faces the bike's forward
			for _i in 40:
				pup.pose_riding(0.016, false)
				await get_tree().process_frame
			# look/camera target the RIDER'S torso (seat height + ~0.9m sit-height),
			# not the bike's own low chassis center — the puppet's root is at its
			# FEET, and pose_riding lifts the whole body onto the seat, so a
			# chassis-only look target left the rider cropped out of frame.
			var rider_mid: float = seat.y + 0.55
			await _shot("vehicles/%s_seated" % vid, Vector3(dist * 1.1, rider_mid + 0.9, -dist * 0.95), Vector3(0, rider_mid, 0))
			angles.append("seated")

		_manifest.append({
			"category": "vehicles", "id": vid, "display_name": String(s.get("name", vid)),
			"family": String(s.get("family", "")), "angles": angles,
		})
		pup.queue_free()
		car.queue_free()
		for _f in 3:
			await get_tree().process_frame


# =============================================================================
# STRUCTURES
# =============================================================================
func _render_structures() -> void:
	DrivnData.ensure_structures()
	var ids: Array = DrivnData.structures.keys()
	ids.sort()
	for sid_v in ids:
		var sid: String = String(sid_v)
		var row: DrivnStructure = DrivnData.structures[sid]
		var st := ProtoStructureBuilder.materialize(sid)
		if st == null:
			continue
		add_child(st)
		for _f in 4:
			await get_tree().process_frame

		var w: float = row.footprint_m.x
		var d: float = row.footprint_m.y
		var wh: float = ProtoStructureBuilder.WALL_H * maxf(1.0, float(row.floors))
		# Framing law: the SILHOUETTE pass hangs read-features (masts/silos/
		# flagpoles/canopies) WELL past the footprint (up to footprint*0.5+3.4m,
		# or wh+5m tall) — the first pass (reach off footprint alone) put the
		# camera INSIDE those toppers on tall/narrow rows (water_tower). Reach
		# now clears footprint half + wall height + the silhouette's own budget.
		# Reach scales off the HALF-DIAGONAL (not just the longer side) so a wide-
		# but-shallow giant (military_base_shell 60x45) gets pushed back far enough
		# — a bare maxf(w,d)*0.5 barely cleared the box's own corner, landing the
		# camera almost on the roof (a razor-thin grazing shot, not a real 3/4).
		var half_diag: float = sqrt((w * 0.5) * (w * 0.5) + (d * 0.5) * (d * 0.5))
		var reach: float = half_diag * 1.9 + wh + 6.0
		# elevation must scale with REACH too, not just wall height — a giant
		# footprint (military_base_shell 60x45) put a low fixed camera nearly
		# level with its own roof, grazing across it edge-on instead of a real
		# elevated 3/4. Whichever is taller wins: a real spire's height, or a
		# giant footprint's own distance-scaled elevation.
		var cam_y: float = maxf(wh * 0.8 + 2.5, reach * 0.4)
		await _shot("structures/%s_34" % sid, Vector3(reach * 0.68, cam_y, reach * 0.68), Vector3(0, wh * 0.4, 0))
		# single-axis epsilon (see the vehicles' top-shot note) — splitting it across
		# both x AND z rotated every top-down shot a free, unintended 45 degrees.
		await _shot("structures/%s_top" % sid, Vector3(0.0, reach * 1.3, 0.001), Vector3.ZERO)

		_manifest.append({
			"category": "structures", "id": sid, "display_name": row.display_name,
			"category_tag": row.category, "footprint_m": [w, d], "floors": row.floors,
			"angles": ["34", "top"],
		})
		st.queue_free()
		for _f in 2:
			await get_tree().process_frame


func _shot(rel_path: String, cam_pos: Vector3, look: Vector3) -> void:
	_cam.position = cam_pos
	_cam.look_at(look, Vector3.UP)
	for _f in 4:
		await get_tree().process_frame
	await RenderingServer.frame_post_draw
	await get_tree().process_frame
	await RenderingServer.frame_post_draw
	var img := get_viewport().get_texture().get_image()
	var path := "%s/%s.png" % [_out_abs, rel_path]
	print("SHOWROOM: %s -> %s" % [rel_path, "ok" if img.save_png(path) == OK else "ERR"])
