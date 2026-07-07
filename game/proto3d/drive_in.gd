## THE DRIVE-IN (docs/cinema.md Phase 3): films made native to a car game.
## A lot off the road: a BIG screen (real video on world geometry — a SubViewport
## texture), a projector post. E on the projector rolls the show — TRAILERS
## first, then the FEATURE (any installed rows with the drive_in context; the
## theater is public, it plays whether or not YOUR shelf has the film). Park
## facing the screen and watch from the cab. Drive off and the projector notices.
## Phase 4 seeding: locked found_* rows scatter their pickups on this lot —
## drop a film in MediaForge with unlock_type found_tape and a tape APPEARS here.
class_name ProtoDriveIn
extends Node3D

const STOP_RANGE := 70.0 ## leave the lot and the show stops for you

var showing: bool = false
var phase: String = "" ## "" | "trailers" | "feature"
var reel_queue: Array = [] ## media ids still to roll (feature last)
var now_showing: String = ""

var _main: Node = null
var _video: VideoStreamPlayer
var _viewport: SubViewport
var _screen: MeshInstance3D
var _warned_far: bool = false


static func create(main: Node) -> ProtoDriveIn:
	var d := ProtoDriveIn.new()
	d._main = main
	d.add_to_group("interactable")

	# THE SCREEN — a monolith you can see from the road. Video renders into a
	# SubViewport; its texture skins the front face (unshaded: it GLOWS at night).
	var back := MeshInstance3D.new()
	var bm := BoxMesh.new()
	bm.size = Vector3(13.0, 7.0, 0.5)
	back.mesh = bm
	back.material_override = ProtoWorldBuilder.material(Color(0.16, 0.15, 0.13), 0.95)
	back.position = Vector3(0, 4.5, 0)
	d.add_child(back)
	var legs_m := MeshInstance3D.new()
	var lm := BoxMesh.new()
	lm.size = Vector3(11.0, 1.6, 0.3)
	legs_m.mesh = lm
	legs_m.material_override = ProtoWorldBuilder.material(Color(0.3, 0.26, 0.2), 0.9)
	legs_m.position = Vector3(0, 0.8, 0)
	d.add_child(legs_m)

	d._viewport = SubViewport.new()
	d._viewport.size = Vector2i(512, 288)
	d._viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	d.add_child(d._viewport)
	d._video = VideoStreamPlayer.new()
	d._video.expand = true
	d._video.size = Vector2(512, 288)
	d._viewport.add_child(d._video)
	d._video.finished.connect(d._on_finished)

	d._screen = MeshInstance3D.new()
	var sm := QuadMesh.new()
	sm.size = Vector2(12.0, 6.4)
	d._screen.mesh = sm
	var mat := StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.albedo_color = Color(0.05, 0.05, 0.05)
	mat.albedo_texture = d._viewport.get_texture()
	d._screen.material_override = mat
	d._screen.position = Vector3(0, 4.5, 0.27) # the front face (+Z toward the lot)
	d.add_child(d._screen)

	# The projector post — the E you walk up to.
	var post := MeshInstance3D.new()
	var pm := BoxMesh.new()
	pm.size = Vector3(0.5, 1.3, 0.5)
	post.mesh = pm
	post.material_override = ProtoWorldBuilder.material(Color(0.35, 0.3, 0.22), 0.9)
	post.position = Vector3(0, 0.65, 18.0)
	d.add_child(post)
	var head := MeshInstance3D.new()
	var hm := BoxMesh.new()
	hm.size = Vector3(0.7, 0.5, 0.9)
	head.mesh = hm
	head.material_override = ProtoWorldBuilder.material(Color(0.2, 0.18, 0.16), 0.85)
	head.position = Vector3(0, 1.55, 18.0)
	d.add_child(head)
	return d


## Phase 4 world-seeding: every LOCKED found_* row scatters its pickup here.
func seed_pickups() -> void:
	if _main == null or not ("media_registry" in _main) or _main.media_registry == null:
		return
	var i := 0
	for id in _main.media_registry.order:
		var row: Dictionary = _main.media_registry.rows[id]
		var ut := String(row.get("unlock_type", "always_available"))
		if not ut.begins_with("found_"):
			continue
		if "media_unlocked" in _main and _main.media_unlocked.has(id):
			continue
		var kind := ut.trim_prefix("found_") # found_dvd -> dvd
		var pickup := ProtoMediaPickup.create(String(id), kind)
		add_child(pickup)
		pickup.position = Vector3(-6.0 + 3.2 * (i % 5), 0, 10.0 + 2.5 * (i / 5))
		i += 1


func interact_position() -> Vector3:
	return global_position + Vector3(0, 0, 18.0) # the projector post, not the screen


func interact_prompt(_m: Node) -> String:
	if showing:
		return "E — 🎞️ Shut the projector down (%s)" % now_showing
	return "E — 🎞️ Start the show (trailers, then the feature)"


func interact(_m: Node) -> void:
	if showing:
		stop_show("You kill the projector. The lot goes dark.")
	else:
		start_show()


## The SCHEDULE (a row of the manifest, not code): every installed drive_in
## trailer first, then the first installed drive_in film as the feature.
func start_show() -> void:
	var reg: ProtoMediaRegistry = _main.media_registry if ("media_registry" in _main) else null
	if reg == null:
		return
	reel_queue.clear()
	for row_v in reg.list_for_context("drive_in"):
		var row := row_v as Dictionary
		if String(row.get("category", "")) == "trailers" and reg.installed(String(row["id"])):
			reel_queue.append(String(row["id"]))
	for row_v in reg.list_for_context("drive_in"):
		var row := row_v as Dictionary
		if String(row.get("category", "")) == "film" and reg.installed(String(row["id"])):
			reel_queue.append(String(row["id"])) # the FEATURE anchors the night
			break
	if reel_queue.is_empty():
		if _main.has_method("notify"):
			_main.notify("🎞️ The projector's empty — no drive-in reels installed (MediaForge :8897).")
		return
	showing = true
	_warned_far = false
	if _main.has_method("notify"):
		_main.notify("🎞️ The projector clatters to life — %d reel(s) tonight." % reel_queue.size())
	_play_next()


func _play_next() -> void:
	if reel_queue.is_empty():
		stop_show("The feature ends. The lot goes dark.")
		return
	now_showing = String(reel_queue.pop_front())
	var reg: ProtoMediaRegistry = _main.media_registry
	phase = "feature" if String(reg.get_media(now_showing).get("category", "")) == "film" else "trailers"
	_video.stream = reg.open_stream(now_showing)
	if _video.stream == null:
		_play_next() # a missing reel skips, never crashes (Phase 8 law)
		return
	_video.play()
	if _main.has_method("mark_media_watched") and phase == "feature":
		_main.mark_media_watched(now_showing) # you sat through it — it counts


func _on_finished() -> void:
	if showing:
		_play_next()


func stop_show(line: String = "") -> void:
	showing = false
	phase = ""
	now_showing = ""
	if _video.is_playing():
		_video.stop()
	_video.stream = null
	if line != "" and _main != null and _main.has_method("notify"):
		_main.notify("🎞️ " + line)


func _physics_process(_delta: float) -> void:
	if not showing or _main == null or not ("player" in _main):
		return
	# Leaving the lot stops the show (the acceptance law) — the projector isn't
	# playing to an empty field for you.
	var anchor: Vector3 = _main.player.global_position
	if "active_car" in _main and _main.mode == _main.Mode.DRIVE and _main.active_car != null:
		anchor = _main.active_car.global_position
	if anchor.distance_to(global_position) > STOP_RANGE:
		stop_show("The screen shrinks in the mirror. The show goes on without you — somewhere behind.")