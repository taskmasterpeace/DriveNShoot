## PROTO-3D vision cone (Perception Engine v1 — the VISUAL half).
## Inside your facing cone: clear. Outside: dimmed. A close radius stays visible
## all around (peripheral awareness). Follows the body on foot, the car when
## driving, and your AIM while glassing. PZ-informed: docs/ENGINE.md §5.
## v1 is visual dimming only — entity culling/memory is Stage 5's gameplay half.
class_name ProtoVisionCone
extends CanvasLayer

const SHADER_CODE := "
shader_type canvas_item;
uniform vec2 apex = vec2(0.5, 0.5);      // cone origin in UV
uniform vec2 dir = vec2(0.0, -1.0);      // facing, screen space (y down)
uniform float half_angle = 1.22;          // radians
uniform float clear_radius = 0.10;        // aspect-corrected UV units
uniform float dim_amount = 0.55;          // darkness outside the cone
uniform float aspect = 1.777;
void fragment() {
	vec2 p = UV - apex;
	p.x *= aspect;
	float d = length(p);
	vec2 dd = normalize(vec2(dir.x * aspect, dir.y));
	float ang = acos(clamp(dot(normalize(p + vec2(0.00001)), dd), -1.0, 1.0));
	float in_cone = 1.0 - smoothstep(half_angle * 0.80, half_angle * 1.06, ang);
	float near = 1.0 - smoothstep(clear_radius * 0.65, clear_radius * 1.2, d);
	float vis = max(in_cone, near);
	// Cold, unmistakable dark outside the cone; deepens with distance from the apex.
	float darkness = (1.0 - vis) * dim_amount * (0.75 + 0.25 * smoothstep(0.0, 0.6, d));
	COLOR = vec4(0.01, 0.02, 0.045, darkness);
}"

## Per-mode targets: [half_angle rad, clear_radius, dim]
const MODE_FOOT := [1.22, 0.105, 0.68]   ## ~140° arc — PZ-style awareness
const MODE_DRIVE := [1.48, 0.165, 0.55]  ## wider + bigger bubble from the cab
const MODE_BINOC := [0.42, 0.06, 0.78]   ## narrow lens locked to your aim

var _rect: ColorRect
var _mat: ShaderMaterial
var _half: float = 1.22
var _clear: float = 0.105
var _dim: float = 0.55
var _dir: Vector2 = Vector2(0, -1)


static func create() -> ProtoVisionCone:
	var vc := ProtoVisionCone.new()
	vc.layer = 1 # under the HUD (HUD moves to layer 2)
	vc._rect = ColorRect.new()
	vc._rect.set_anchors_preset(Control.PRESET_FULL_RECT)
	vc._rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var sh := Shader.new()
	sh.code = SHADER_CODE
	vc._mat = ShaderMaterial.new()
	vc._mat.shader = sh
	vc._rect.material = vc._mat
	vc.add_child(vc._rect)
	return vc


## Called by the main scene every physics frame.
## mode_params: one of MODE_FOOT/MODE_DRIVE/MODE_BINOC. facing: world-space XZ direction.
func update_cone(cam: Camera3D, apex_world: Vector3, facing: Vector3, mode_params: Array, delta: float) -> void:
	if cam == null:
		return
	var vp := cam.get_viewport()
	var size: Vector2 = vp.get_visible_rect().size
	if size.x < 2.0 or size.y < 2.0:
		return

	# Smooth toward the mode's cone shape so transitions glide (no snap).
	var k := 1.0 - exp(-7.0 * delta)
	_half = lerpf(_half, mode_params[0], k)
	_clear = lerpf(_clear, mode_params[1], k)
	_dim = lerpf(_dim, mode_params[2], k)

	# Apex: the character's screen position (never behind the camera in top-down).
	var apex_px := cam.unproject_position(apex_world + Vector3(0, 1.0, 0))
	var apex_uv := apex_px / size

	# Facing in screen space: camera is north-up, so world +X → screen +X and
	# world +Z → screen +Y (down). Smooth the swing so quick turns feel physical.
	var f := facing
	f.y = 0.0
	if f.length_squared() > 0.001:
		var target := Vector2(f.x, f.z).normalized()
		_dir = _dir.slerp(target, clampf(10.0 * delta, 0.0, 1.0)) if _dir.length_squared() > 0.01 else target

	_mat.set_shader_parameter("apex", apex_uv)
	_mat.set_shader_parameter("dir", _dir)
	_mat.set_shader_parameter("half_angle", _half)
	_mat.set_shader_parameter("clear_radius", _clear)
	_mat.set_shader_parameter("dim_amount", _dim)
	_mat.set_shader_parameter("aspect", size.x / size.y)


## Sim hooks
func current_half_angle() -> float:
	return _half

func current_dir() -> Vector2:
	return _dir
