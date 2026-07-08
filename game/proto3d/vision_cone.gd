## PROTO-3D vision cone v2 (Perception Engine — the VISUAL half).
## Inside your facing arc AND within your sight RANGE: clear. Outside: dimmed.
## v2 measures everything in WORLD METERS and converts to screen each frame, so
## ZOOMING THE CAMERA NEVER CHANGES WHAT YOUR CHARACTER CAN SEE (playtest bug).
## Traits/gear scale the arc and range (eye patch = half the arc). A dog's alert
## briefly REVEALS a bubble where it smells the threat — its senses become yours.
## PZ-informed: docs/ENGINE.md §5, METASYSTEM.md.
class_name ProtoVisionCone
extends CanvasLayer

const SHADER_CODE := "
shader_type canvas_item;
uniform vec2 apex = vec2(0.5, 0.5);      // cone origin in UV
uniform vec2 dir = vec2(0.0, -1.0);      // facing, screen space (y down)
uniform float half_angle = 1.22;          // radians
uniform float clear_radius = 0.10;        // aspect-corrected UV units (from meters)
uniform float view_range = 0.6;           // aspect-corrected UV units (from meters)
uniform float dim_amount = 0.68;          // darkness outside your sight
uniform float aspect = 1.777;
uniform vec2 reveal_pos = vec2(-9.0, -9.0); // dog-sense bubble (UV)
uniform float reveal_radius = 0.08;
uniform float reveal_amount = 0.0;
uniform sampler2D occl_map : repeat_enable, filter_linear; // 1D wall-distance map (METERS, full 360)
uniform float occl_uv_per_m = 0.0;                          // 0 = occlusion off
void fragment() {
	vec2 p = UV - apex;
	p.x *= aspect;
	float d = length(p);
	vec2 dd = normalize(vec2(dir.x * aspect, dir.y));
	float ang = acos(clamp(dot(normalize(p + vec2(0.00001)), dd), -1.0, 1.0));
	float arc_ok = 1.0 - smoothstep(half_angle * 0.80, half_angle * 1.06, ang);
	float range_ok = 1.0 - smoothstep(view_range * 0.72, view_range * 1.05, d);
	float in_cone = arc_ok * range_ok;
	float near = 1.0 - smoothstep(clear_radius * 0.65, clear_radius * 1.2, d);
	float vis = max(in_cone, near);
	// LOS: WALLS END SIGHT. Per-pixel angle looks up the ray-fan wall distance;
	// visibility dies just past it. Screen == world XZ (top-down, north-up), so
	// the angle needs no remapping. The reveal below is SMELL — it pierces walls.
	if (occl_uv_per_m > 0.0) {
		float wang = atan(p.y, p.x);
		float occ_r = texture(occl_map, vec2((wang + 3.14159265) / 6.2831853, 0.5)).r * occl_uv_per_m;
		vis *= 1.0 - smoothstep(occ_r * 0.94, occ_r * 1.06, d);
	}
	// The dog's nose: a temporary clear bubble where it smelled something.
	vec2 rp = reveal_pos - apex;
	rp.x *= aspect;
	float rev = (1.0 - smoothstep(reveal_radius * 0.6, reveal_radius * 1.15, distance(p, rp))) * reveal_amount;
	vis = max(vis, rev);
	float darkness = (1.0 - vis) * dim_amount * (0.75 + 0.25 * smoothstep(0.0, 0.6, d));
	COLOR = vec4(0.01, 0.02, 0.045, darkness);
}"

## Per-mode targets IN WORLD METERS: [half_angle rad, clear_radius_m, view_range_m, dim]
## view_range is HOW FAR you see in your look direction (world meters). Owner
## 2026-07-08: "look a direction, see to the HORIZON that way" — on foot the
## forward cone now reaches far; binoculars reach much farther still.
const MODE_FOOT := [1.22, 5.5, 100.0, 0.68]  ## ~140° arc; a long forward sightline
const MODE_DRIVE := [1.48, 9.0, 70.0, 0.55]  ## wider + farther from the cab
const MODE_BINOC := [0.42, 4.0, 240.0, 0.78] ## narrow lens — the horizon, wherever you glass

var _rect: ColorRect
var _mat: ShaderMaterial
var _half: float = 1.22
var _clear_m: float = 5.5
var _range_m: float = 36.0
var _dim: float = 0.68
var _dir: Vector2 = Vector2(0, -1)
var _reveal_world: Vector3 = Vector3.ZERO
var _reveal_t: float = 0.0

## Sim hooks — the WORLD-METER truth the shader is fed from.
var last_clear_m: float = 0.0
var last_range_m: float = 0.0
var last_occl: PackedFloat32Array = PackedFloat32Array() ## LOS fan: meters by world angle
var _occl_tex: ImageTexture = null


static func create() -> ProtoVisionCone:
	var vc := ProtoVisionCone.new()
	vc.layer = 1 # under the HUD (HUD is layer 2)
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


## A dog smelled something: reveal that spot for a beat (its senses become yours).
func reveal_at(world_pos: Vector3) -> void:
	_reveal_world = world_pos
	_reveal_t = 1.8


## Called by the main scene every physics frame.
## mode_params: MODE_* (meters). arc/range mults come from traits/gear (eye patch).
## occl: the LOS ray fan (meters, full 360° starting at -PI) — empty disables it.
func update_cone(cam: Camera3D, apex_world: Vector3, facing: Vector3, mode_params: Array,
		delta: float, arc_mult: float = 1.0, range_mult: float = 1.0,
		occl: PackedFloat32Array = PackedFloat32Array()) -> void:
	if cam == null:
		return
	var vp := cam.get_viewport()
	var size: Vector2 = vp.get_visible_rect().size
	if size.x < 2.0 or size.y < 2.0:
		return

	# Smooth toward the mode's shape (scaled by character traits/gear).
	var k := 1.0 - exp(-7.0 * delta)
	_half = lerpf(_half, mode_params[0] * clampf(arc_mult, 0.15, 1.5), k)
	_clear_m = lerpf(_clear_m, mode_params[1] * clampf(range_mult, 0.12, 2.0), k)
	_range_m = lerpf(_range_m, mode_params[2] * clampf(range_mult, 0.12, 2.0), k)
	_dim = lerpf(_dim, mode_params[3], k)
	last_clear_m = _clear_m
	last_range_m = _range_m

	# THE ZOOM FIX: convert world meters -> screen UV at the apex, every frame.
	# Zooming changes this ratio, so the on-screen circle shrinks/grows while the
	# WORLD distance your character sees stays constant.
	var apex_px := cam.unproject_position(apex_world + Vector3(0, 1.0, 0))
	var probe_px := cam.unproject_position(apex_world + Vector3(1, 1.0, 0))
	var px_per_m := maxf(apex_px.distance_to(probe_px), 0.001)
	var uv_per_m := px_per_m / size.y # shader corrects x by aspect, so height-units
	var apex_uv := apex_px / size

	var f := facing
	f.y = 0.0
	if f.length_squared() > 0.001:
		var target := Vector2(f.x, f.z).normalized()
		_dir = _dir.slerp(target, clampf(10.0 * delta, 0.0, 1.0)) if _dir.length_squared() > 0.01 else target

	# LOS depth map: wall distances around the full circle -> a 1-px-tall texture
	# the shader samples by angle. No smoothing — walls don't lerp.
	last_occl = occl
	if occl.size() > 0:
		var img := Image.create_from_data(occl.size(), 1, false, Image.FORMAT_RF, occl.to_byte_array())
		if _occl_tex == null or _occl_tex.get_width() != occl.size():
			_occl_tex = ImageTexture.create_from_image(img)
		else:
			_occl_tex.update(img)
		_mat.set_shader_parameter("occl_map", _occl_tex)
		_mat.set_shader_parameter("occl_uv_per_m", uv_per_m)
	else:
		_mat.set_shader_parameter("occl_uv_per_m", 0.0)

	_mat.set_shader_parameter("apex", apex_uv)
	_mat.set_shader_parameter("dir", _dir)
	_mat.set_shader_parameter("half_angle", _half)
	_mat.set_shader_parameter("clear_radius", _clear_m * uv_per_m)
	_mat.set_shader_parameter("view_range", _range_m * uv_per_m)
	_mat.set_shader_parameter("dim_amount", _dim)
	_mat.set_shader_parameter("aspect", size.x / size.y)

	# Dog-sense reveal bubble (fades out; zero cost when idle)
	_reveal_t = maxf(0.0, _reveal_t - delta)
	var amount := clampf(_reveal_t / 0.6, 0.0, 1.0) # full, then quick fade at the end
	_mat.set_shader_parameter("reveal_amount", amount)
	if amount > 0.0:
		var rev_px := cam.unproject_position(_reveal_world + Vector3(0, 1.0, 0))
		_mat.set_shader_parameter("reveal_pos", rev_px / size)
		_mat.set_shader_parameter("reveal_radius", 7.0 * uv_per_m)


## Sim/query hook: sight distance (meters) along a world direction, from the
## last LOS fan. -1 when occlusion isn't running.
func occl_range_at(world_dir: Vector3) -> float:
	if last_occl.is_empty():
		return -1.0
	var ang := atan2(world_dir.z, world_dir.x)
	var i := int(floor((ang + PI) / TAU * last_occl.size())) % last_occl.size()
	return last_occl[i]


## Sim hooks
func current_half_angle() -> float:
	return _half

func current_dir() -> Vector2:
	return _dir

func reveal_active() -> bool:
	return _reveal_t > 0.0
