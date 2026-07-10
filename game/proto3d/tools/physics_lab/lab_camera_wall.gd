## Five isolated SubViewport cameras that judge the same subject through actual
## gameplay/broadcast distances without ever replacing the main viewport camera.
class_name ProtoLabCameraWall
extends Node

const ORDER: Array[String] = ["top_down_drive", "on_foot_3d", "chase_candidate",
	"high_tactical", "broadcast"]
const OFFSETS: Dictionary = {
	"top_down_drive": Vector3(0, 30, 0.2),
	"on_foot_3d": Vector3(9, 9, 14),
	"chase_candidate": Vector3(0, 5, 10),
	"high_tactical": Vector3(13, 21, 18),
	"broadcast": Vector3(-11, 7, 13),
}
const PRESETS: Array[String] = ["day", "night", "dust", "headlight",
	"muzzle_flash", "silhouette"]

var subject: Node3D = null
var preset_id: String = "day"
var _enabled: bool = false
var _viewports: Dictionary = {}
var _cameras: Dictionary = {}
var _textures: Dictionary = {}
var _canvas: CanvasLayer = null
var _strip: Control = null


func setup(subject_in: Node3D) -> void:
	subject = subject_in
	_build_views()
	set_visible(false)


func set_subject(subject_in: Node3D) -> void:
	subject = subject_in
	if subject == null:
		return
	for viewport in _viewports.values():
		(viewport as SubViewport).world_3d = subject.get_world_3d()


func set_visible(enabled: bool) -> void:
	_enabled = enabled
	if _strip != null:
		_strip.visible = enabled
	for viewport in _viewports.values():
		(viewport as SubViewport).render_target_update_mode = SubViewport.UPDATE_ALWAYS \
			if enabled else SubViewport.UPDATE_DISABLED
	set_process(enabled)


func set_preset(id: String) -> bool:
	if id not in PRESETS:
		return false
	preset_id = id
	var tint: Color = {
		"day": Color.WHITE, "night": Color("#7290ad"), "dust": Color("#c49161"),
		"headlight": Color("#ffe0a0"), "muzzle_flash": Color("#ff9c38"),
		"silhouette": Color("#8c9ba0")}.get(id, Color.WHITE)
	for texture in _textures.values():
		(texture as TextureRect).modulate = tint
	return true


func cameras() -> Dictionary:
	return _cameras


func viewports() -> Dictionary:
	return _viewports


func facts() -> Dictionary:
	return {"visible": _enabled, "viewport_count": _viewports.size(),
		"names": ORDER.duplicate(), "preset": preset_id, "subject": subject}


func _build_views() -> void:
	if not _viewports.is_empty():
		return
	_canvas = CanvasLayer.new()
	_canvas.layer = 70
	add_child(_canvas)
	_strip = Panel.new()
	_strip.position = Vector2(550, 18)
	_strip.size = Vector2(704, 118)
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.08, 0.065, 0.05, 0.94)
	style.border_color = Color("#5e4b35")
	style.set_border_width_all(1)
	style.set_corner_radius_all(10)
	_strip.add_theme_stylebox_override("panel", style)
	_canvas.add_child(_strip)
	for i in ORDER.size():
		var id: String = ORDER[i]
		var viewport := SubViewport.new()
		viewport.name = "Truth_%s" % id
		viewport.size = Vector2i(256, 144)
		viewport.render_target_update_mode = SubViewport.UPDATE_DISABLED
		if subject != null:
			viewport.world_3d = subject.get_world_3d()
		add_child(viewport)
		var camera := Camera3D.new()
		camera.name = "Camera_%s" % id
		camera.fov = 55.0 if id != "top_down_drive" else 48.0
		camera.current = true
		viewport.add_child(camera)
		var texture := TextureRect.new()
		texture.name = "View_%s" % id
		texture.position = Vector2(10 + i * 138, 24)
		texture.size = Vector2(128, 72)
		texture.texture = viewport.get_texture()
		texture.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		texture.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
		_strip.add_child(texture)
		var label := Label.new()
		label.text = id.replace("_", " ").to_upper()
		label.position = Vector2(10 + i * 138, 4)
		label.add_theme_font_size_override("font_size", 10)
		label.add_theme_color_override("font_color", Color("#eadfca"))
		_strip.add_child(label)
		_viewports[id] = viewport
		_cameras[id] = camera
		_textures[id] = texture


func _process(_delta: float) -> void:
	if not _enabled or subject == null or not is_instance_valid(subject):
		return
	for id in ORDER:
		var camera := _cameras[id] as Camera3D
		camera.global_position = subject.global_position + (OFFSETS[id] as Vector3)
		camera.look_at(subject.global_position + Vector3(0, 0.9, 0), Vector3.UP)
