// THE WATER'S EDGE — the ocean sheet shader (SEABOARD goal W2).
// Adapted techniques, licenses honored (docs/design/WATER_RESEARCH.md — the
// car_3d aero-drag citation precedent):
//   · structure/two-tone/procedural-noise/vertex-bob: "Toon Style 3D Water Shader —
//     No textures needed" by Megalithium, godotshaders.com, CC0.
//     https://godotshaders.com/shader/toon-style-3d-water-shader-no-textures-needed/
//   · depth-reconstruction foam-band math: "Foam Edge Water Shader" by Antz,
//     godotshaders.com, MIT. https://godotshaders.com/shader/foam-edge-water-shader/
// No textures anywhere — flat two-tone + procedural noise + depth foam. Reads from
// the TOP-DOWN camera: banding + the foam ring are planar effects; the bob is felt,
// never choppy. NO PURPLE (house law) — coastal teals + warm-white foam.
shader_type spatial;
render_mode blend_mix, depth_draw_never, cull_back, shadows_disabled, specular_disabled;

uniform vec3 deep_color: source_color = vec3(0.10, 0.22, 0.30);
uniform vec3 shallow_color: source_color = vec3(0.16, 0.38, 0.42);
uniform vec3 foam_color: source_color = vec3(0.92, 0.94, 0.90);
uniform float alpha_base: hint_range(0.5, 1.0) = 0.86;
uniform float bob_amp: hint_range(0.0, 0.4) = 0.08;
uniform float bob_speed: hint_range(0.0, 3.0) = 0.9;
uniform float band_scale: hint_range(0.005, 0.2) = 0.035;
uniform float band_speed: hint_range(0.0, 1.0) = 0.12;
uniform float foam_falloff_m: hint_range(0.2, 8.0) = 2.6;  // Antz's foamFallOffDistance
uniform float foam_edge_bias: hint_range(-0.5, 0.5) = 0.08;

uniform sampler2D depth_tex: hint_depth_texture, filter_linear;

// Cheap value noise (Megalithium's no-texture idea, simplified): two octaves of
// hashed lattice — enough wobble for bands + foam edges, zero samplers.
float hash21(vec2 p) {
	p = fract(p * vec2(123.34, 345.45));
	p += dot(p, p + 34.345);
	return fract(p.x * p.y);
}

float vnoise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	vec2 u = f * f * (3.0 - 2.0 * f);
	float a = hash21(i);
	float b = hash21(i + vec2(1, 0));
	float c = hash21(i + vec2(0, 1));
	float d = hash21(i + vec2(1, 1));
	return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

varying vec3 world_pos;

void vertex() {
	world_pos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	// The bob — alive, never choppy (sin of world position + time).
	VERTEX.y += sin(world_pos.x * 0.11 + TIME * bob_speed)
		* cos(world_pos.z * 0.09 + TIME * bob_speed * 0.8) * bob_amp;
}

void fragment() {
	// TWO-TONE banding by slow-scrolling procedural noise — the flat-color read.
	vec2 wuv = world_pos.xz * band_scale + vec2(TIME * band_speed, TIME * band_speed * 0.6);
	float band = vnoise(wuv) * 0.65 + vnoise(wuv * 2.3 + 7.0) * 0.35;
	vec3 col = mix(deep_color, shallow_color, smoothstep(0.35, 0.75, band));

	// FOAM at the shoreline — Antz's linear-depth falloff band, noise-broken edge.
	float scene_depth_raw = texture(depth_tex, SCREEN_UV).r;
	vec3 ndc = vec3(SCREEN_UV * 2.0 - 1.0, scene_depth_raw);
	vec4 view = INV_PROJECTION_MATRIX * vec4(ndc, 1.0);
	view.xyz /= view.w;
	float scene_dist = -view.z;              // linear depth of what's UNDER the water
	float water_dist = -VERTEX.z;            // this fragment's own view depth
	float water_depth = max(scene_dist - water_dist, 0.0);
	float falloff = clamp(1.0 - water_depth / foam_falloff_m + foam_edge_bias, 0.0, 1.0);
	float foam_noise = vnoise(world_pos.xz * 0.9 + TIME * 0.35);
	float foam = smoothstep(0.55, 0.95, falloff + foam_noise * 0.22);
	col = mix(col, foam_color, foam);

	ALBEDO = col;
	ALPHA = clamp(alpha_base + foam * 0.14, 0.0, 1.0);
	ROUGHNESS = 0.35;
}
