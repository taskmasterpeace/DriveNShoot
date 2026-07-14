## DYNAMIC SPLIT-SCREEN (goal 2026-07-07) — the tech from godot-demo-projects'
## viewport/dynamic_split_screen (MIT), adapted to our top-down world and made a reusable
## module. Two SubViewports SHARE the main World3D (own_world_3d = false, the same trick
## ProtoSecondaryView already relies on) and render it from two cameras — your BODY
## (anchor) and a REMOTE unit (the drone; later a high-bond dog). A fullscreen ColorRect
## runs split_screen.gdshader over both viewport textures: one seamless view when they're
## close, an auto-split when the remote flies far. It's an OVERLAY CanvasLayer — it never
## touches the main render path, so it's safe to switch on and off.
##
## Use: sv = ProtoSplitView.create(); main.add_child(sv)
##      sv.activate(player_body, drone)   # split appears as the drone flies away
##      sv.deactivate()                   # back to the normal single view
class_name ProtoSplitView
extends CanvasLayer

const AMBER: Color = Color(0.96, 0.72, 0.2)   ## the split line — house style, no purple

## Horizontal world distance (m) at which the screen starts to split. Tunable per use
## (a high-bond dog can see farther → a bigger number). Below it, one seamless view.
var max_separation: float = 22.0
var split_line_thickness: float = 4.0
var cam_height: float = 26.0      ## how high each eye floats over its subject
var cam_back: float = 9.0         ## …and how far back — the game's top-down-angled look
## ALTITUDE-FOLLOWING EYE (drone flight polish): a subject flying HIGH (the piloted
## drone) pulls its own eye up and back too — climbing actually shows more world.
## Pure geometry (same fixed FOV), so it never touches the "altitude never splits"
## law — that's still driven by horizontal separation alone (_tick below).
const ALT_CAM_GAIN: float = 0.7
const ALT_BACK_GAIN: float = 0.25

var active: bool = false
var _anchor: Node3D = null        ## view 1 — your body
var _remote: Node3D = null        ## view 2 — the drone / dog
var _vp1: SubViewport
var _vp2: SubViewport
var _cam1: Camera3D
var _cam2: Camera3D
var _view: ColorRect
var _mat: ShaderMaterial


static func create() -> ProtoSplitView:
	var sv := ProtoSplitView.new()
	sv.layer = 1                                  # over the world, under the HUD layers
	sv._vp1 = sv._make_viewport()
	sv._vp2 = sv._make_viewport()
	sv._cam1 = Camera3D.new()
	sv._cam2 = Camera3D.new()
	sv._vp1.add_child(sv._cam1)
	sv._vp2.add_child(sv._cam2)
	sv.add_child(sv._vp1)
	sv.add_child(sv._vp2)

	sv._mat = ShaderMaterial.new()
	sv._mat.shader = load("res://proto3d/split_screen.gdshader")
	sv._view = ColorRect.new()
	sv._view.set_anchors_preset(Control.PRESET_FULL_RECT)
	sv._view.mouse_filter = Control.MOUSE_FILTER_IGNORE
	sv._view.material = sv._mat
	sv.add_child(sv._view)

	sv._mat.set_shader_parameter("viewport1", sv._vp1.get_texture())
	sv._mat.set_shader_parameter("viewport2", sv._vp2.get_texture())
	sv._mat.set_shader_parameter("split_line_color", Vector3(AMBER.r, AMBER.g, AMBER.b))
	sv.visible = false
	return sv


func _make_viewport() -> SubViewport:
	var vp := SubViewport.new()
	vp.own_world_3d = false                       # SHARE the main World3D — see the game
	vp.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	vp.size = Vector2i(640, 360)
	return vp


## Whether the screen would split for a body↔remote pair at this separation — the pure
## rule, exposed so a headless sim can prove it without a GPU.
static func would_split(anchor: Vector3, remote: Vector3, max_sep: float) -> bool:
	var d := remote - anchor
	return Vector2(d.x, d.z).length() > max_sep


## Turn the split view on: view 1 follows `anchor` (you), view 2 follows `remote` (drone).
func activate(anchor: Node3D, remote: Node3D) -> void:
	_anchor = anchor
	_remote = remote
	active = true
	visible = true
	_resize()
	_tick()


func deactivate() -> void:
	active = false
	visible = false
	_anchor = null
	_remote = null


func _resize() -> void:
	var s: Vector2i = _screen_size()
	_vp1.size = s
	_vp2.size = s
	_mat.set_shader_parameter("viewport_size", Vector2(s))


func _screen_size() -> Vector2i:
	var vp := get_viewport()
	if vp != null:
		return Vector2i(vp.get_visible_rect().size)
	return Vector2i(1280, 720)


func _process(_delta: float) -> void:
	if active:
		_tick()


func _tick() -> void:
	if _anchor == null or _remote == null or not is_instance_valid(_anchor) or not is_instance_valid(_remote):
		return
	_resize()
	var a := _anchor.global_position
	var b := _remote.global_position
	var diff := b - a
	diff.y = 0.0
	var sep := Vector2(diff.x, diff.z).length()

	# Place each eye ALONG the body↔remote line (demo model): centred between them when
	# close (→ both frame the same area → one view), pushed to a fixed half-separation
	# when far (→ they frame the gap → the split reads the real direction).
	var clamped := clampf(sep, 0.0, max_separation)
	var off := (diff.normalized() * clamped) if sep > 0.01 else Vector3.ZERO
	_aim(_cam1, a + off * 0.5)
	_aim(_cam2, b - off * 0.5)

	var screen := Vector2(_screen_size())
	var p1 := _cam1.unproject_position(a) / screen
	var p2 := _cam2.unproject_position(b) / screen
	var split := sep > max_separation
	var thick := clampf(lerpf(0.0, split_line_thickness, (sep - max_separation) / max_separation), 0.0, split_line_thickness)

	_mat.set_shader_parameter("split_active", split)
	_mat.set_shader_parameter("player1_position", p1)
	_mat.set_shader_parameter("player2_position", p2)
	_mat.set_shader_parameter("split_line_thickness", thick)


func _aim(cam: Camera3D, target: Vector3) -> void:
	# The subject's own altitude pulls its eye up+back proportionally (a grounded body's
	# target.y is near zero, so this is a no-op for view 1 — it's the drone eye it flies).
	var extra: float = maxf(0.0, target.y)
	cam.global_position = Vector3(target.x, cam_height + extra * ALT_CAM_GAIN, target.z + cam_back + extra * ALT_BACK_GAIN)
	cam.look_at(Vector3(target.x, 0.0, target.z), Vector3.UP)
