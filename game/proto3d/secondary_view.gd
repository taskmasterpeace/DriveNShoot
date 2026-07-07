## STAGE 7 — the SECOND WINDOW (SecondaryView, the multi-use viewport):
## ONE picture-in-picture module, many eyes. V cycles what it shows:
##   🪞 REARVIEW — behind your vehicle while driving
##   🛸 DRONE   — straight down from the scout drone
## Modes self-skip when their eye doesn't exist. Scopes/radar/minimap later
## bolt onto the SAME module (STAGES.md multi-use table).
## (DOGCAM retired 2026-07-07 — the owner repurposed that screen real estate
## for full-screen binoculars; ride-a-dog's-back is gone, not just hidden.)
class_name ProtoSecondaryView
extends CanvasLayer

enum SVMode { OFF, REARVIEW, DRONE, CAMS }

var mode: SVMode = SVMode.OFF
var _cam_idx: int = 0 ## which placed surveillance camera CAMS mode is watching
var _frame: PanelContainer
var _label: Label
var _viewport: SubViewport
var _cam: Camera3D


static func create() -> ProtoSecondaryView:
	var sv := ProtoSecondaryView.new()
	sv.layer = 2
	sv._frame = PanelContainer.new()
	sv._frame.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	sv._frame.offset_left = -286.0
	sv._frame.offset_right = -14.0
	sv._frame.offset_top = 14.0
	sv._frame.offset_bottom = 232.0
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.05, 0.05, 0.04, 0.9)
	style.border_color = Color(0.96, 0.72, 0.2)
	style.set_border_width_all(2)
	sv._frame.add_theme_stylebox_override("panel", style)
	sv._frame.visible = false
	sv.add_child(sv._frame)
	var v := VBoxContainer.new()
	sv._frame.add_child(v)
	sv._label = Label.new()
	sv._label.add_theme_font_override("font", ProtoHUD.mixed_font())
	sv._label.add_theme_font_size_override("font_size", 14)
	sv._label.add_theme_color_override("font_color", Color(0.96, 0.72, 0.2))
	v.add_child(sv._label)
	var svc := SubViewportContainer.new()
	svc.stretch = true
	svc.size_flags_vertical = Control.SIZE_EXPAND_FILL
	v.add_child(svc)
	sv._viewport = SubViewport.new()
	sv._viewport.size = Vector2i(260, 180)
	sv._viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	svc.add_child(sv._viewport)
	sv._cam = Camera3D.new()
	sv._cam.fov = 55.0
	sv._viewport.add_child(sv._cam)
	return sv


## Sim hook: where the second eye currently sits.
func cam_global() -> Vector3:
	return _cam.global_position


## V — cycle to the next mode that actually has an eye to look through. Inside CAMS,
## each press steps to the NEXT placed camera before moving on past the last one.
func cycle(main: Node) -> void:
	if mode == SVMode.CAMS and _cam_idx + 1 < _cams(main).size():
		_cam_idx += 1
		if "audio" in main and main.audio:
			main.audio.play_ui("blip", -10.0)
		return
	for _i in 4:
		mode = ((mode + 1) % 4) as SVMode
		if _available(main, mode):
			break
	if mode == SVMode.CAMS:
		_cam_idx = 0
	_frame.visible = mode != SVMode.OFF
	if "audio" in main and main.audio:
		main.audio.play_ui("blip", -10.0)


## The live placed surveillance cameras (invalid entries pruned).
func _cams(main: Node) -> Array:
	if not ("surveil_cams" in main):
		return []
	var out: Array = []
	for c in main.surveil_cams:
		if c != null and is_instance_valid(c):
			out.append(c)
	return out


func _available(main: Node, m: SVMode) -> bool:
	match m:
		SVMode.OFF:
			return true
		SVMode.REARVIEW:
			return main.mode == 0 and main.active_car != null # DRIVE
		SVMode.DRONE:
			return "drone" in main and main.drone != null and is_instance_valid(main.drone)
		SVMode.CAMS:
			return not _cams(main).is_empty()
	return false


func update_view(main: Node) -> void:
	if mode == SVMode.OFF:
		return
	if not _available(main, mode):
		cycle(main) # the eye vanished (drone died) — move on
		return
	match mode:
		SVMode.REARVIEW:
			var car: ProtoCar3D = main.active_car
			_cam.global_position = car.global_position + car.global_basis.z * 4.5 + Vector3(0, 3.2, 0)
			_cam.look_at(car.global_position + car.global_basis.z * 22.0 + Vector3(0, 0.5, 0), Vector3.UP)
			_label.text = "🪞 REARVIEW — %s" % car.display_name
		SVMode.DRONE:
			var dr: Node3D = main.drone
			_cam.global_position = dr.global_position + Vector3(0, 0.6, 0.01)
			_cam.look_at(dr.global_position - Vector3(0, 8.0, 0), Vector3(0, 0, -1))
			_label.text = "🛸 DRONE — batt %d%%" % int(main.drone.battery_pct())
		SVMode.CAMS:
			var cams := _cams(main)
			_cam_idx = clampi(_cam_idx, 0, cams.size() - 1)
			var sc: ProtoSurveilCam = cams[_cam_idx]
			_cam.global_position = sc.cam_position()
			_cam.look_at(sc.cam_target(), Vector3.UP)
			_label.text = "📹 CAM %d/%d — REC" % [_cam_idx + 1, cams.size()]