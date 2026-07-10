## Proof for TEXTURED TERRAIN (world_builder.gd ground_material/ground_visual — goal:
## "improve the terrain in every biome, adds texture"). Verifies every biome's ground
## gets a detail+normal-mapped, triplanar material (not a flat color), that plain boxes
## stay CLEAN (only terrain is textured), the noise textures are shared singletons, and
## nothing sneaks in purple. Run:
## godot --headless --path game res://proto3d/tests/ground_texture_sim.tscn
extends Node

var passed := 0
var failed := 0


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("GROUND: %s - %s" % ["PASS" if ok else "FAIL", check_name])


## The house rule: no purple. Bans saturated hues in the violet/magenta band.
func _is_purple(c: Color) -> bool:
	return c.s > 0.15 and c.h > 0.72 and c.h < 0.92


func _first_mesh(n: Node) -> MeshInstance3D:
	if n is MeshInstance3D:
		return n
	for c in n.get_children():
		var hit := _first_mesh(c)
		if hit != null:
			return hit
	return null


func _ready() -> void:
	var col := ProtoWorldBuilder.COL_GROUND
	var gm := ProtoWorldBuilder.ground_material(col)

	# The core: ground is now TEXTURED, not a flat color.
	_check("ground_material is a StandardMaterial3D", gm is StandardMaterial3D)
	_check("ground has a detail albedo texture", gm.albedo_texture is Texture2D)
	_check("ground is triplanar (no stretch across slabs)", gm.uv1_triplanar)
	_check("ground has a normal map (lit micro-relief)", gm.normal_enabled and gm.normal_texture is Texture2D)
	_check("ground keeps its biome tint as albedo_color", gm.albedo_color.is_equal_approx(col))

	# Plain boxes/houses must stay CLEAN — only terrain gets grain.
	var plain := ProtoWorldBuilder.material(col)
	_check("plain material() has NO albedo texture (boxes stay clean)", plain.albedo_texture == null)
	_check("ground_material differs from plain material", gm != plain)

	# The noise textures are shared singletons (one bake, reused everywhere).
	_check("detail texture is a shared singleton",
		ProtoWorldBuilder.ground_detail_texture() == ProtoWorldBuilder.ground_detail_texture())
	_check("normal texture is a shared singleton",
		ProtoWorldBuilder.ground_normal_texture() == ProtoWorldBuilder.ground_normal_texture())
	_check("same color returns the cached ground material", ProtoWorldBuilder.ground_material(col) == gm)

	# EVERY biome gets textured ground, tinted to its own color, none of them purple.
	var textured := 0
	var biomes := 0
	for biome in ProtoWorldStream.BIOME_GROUND:
		biomes += 1
		var c: Color = ProtoWorldStream.BIOME_GROUND[biome]
		var m := ProtoWorldBuilder.ground_material(c)
		var ok := m.albedo_texture is Texture2D and m.normal_enabled and m.albedo_color.is_equal_approx(c)
		if ok:
			textured += 1
		if _is_purple(c):
			_check("biome '%s' color is not purple" % biome, false)
	_check("ALL %d biomes get textured ground" % biomes, textured == biomes and biomes == 10)
	_check("no biome ground color is purple", not ProtoWorldStream.BIOME_GROUND.values().any(_is_purple))

	# THE PATCHWORK (fidelity loop it.7): per-chunk tint is deterministic, subtle,
	# and quantized so the material cache stays bounded (<=5 shades per biome).
	var t1 := ProtoWorldBuilder.chunk_tint(col, 3, 7)
	_check("chunk_tint is deterministic (same chunk, same shade)",
		t1 == ProtoWorldBuilder.chunk_tint(col, 3, 7))
	var shades: Dictionary = {}
	var max_dv := 0.0
	for cx in range(40):
		var tc := ProtoWorldBuilder.chunk_tint(col, cx, 11)
		shades[tc.to_html()] = true
		max_dv = maxf(max_dv, absf(tc.r - col.r))
	_check("patchwork deals 2..5 quantized shades (%d)" % shades.size(),
		shades.size() >= 2 and shades.size() <= 5)
	_check("the nudge stays subtle (max %.3f <= 0.056)" % max_dv, max_dv <= 0.056)

	# THE BUILDING PATCHWORK (it.11): per-placement tint jitter through the same
	# quantized law — different seeds deal different wall swatches; seed 0 = base.
	DrivnData.ensure_structures()
	var wall_shades: Dictionary = {}
	for seed_v in [12345, 777, 4242, 90210, 31337]:
		var s := ProtoStructureBuilder.materialize("house_small", "", int(seed_v))
		if s != null:
			var mi := _first_mesh(s)
			if mi != null and mi.material_override is StandardMaterial3D:
				wall_shades[(mi.material_override as StandardMaterial3D).albedo_color.to_html()] = true
			s.queue_free()
	_check("building tints spread across placements (%d distinct >= 2)" % wall_shades.size(),
		wall_shades.size() >= 2)

	# WATER READS (it.14): lit ripple + glint — low roughness, gentle normal, cached.
	var wm := ProtoWorldBuilder.water_material(Color(0.16, 0.28, 0.34))
	_check("water material glints (roughness %.2f <= 0.2)" % wm.roughness, wm.roughness <= 0.2)
	_check("water has lit ripple (normal on, gentle %.2f <= 0.5)" % wm.normal_scale,
		wm.normal_enabled and wm.normal_scale <= 0.5)
	_check("water material is cached", ProtoWorldBuilder.water_material(Color(0.16, 0.28, 0.34)) == wm)

	print("GROUND: DONE — %d passed, %d failed" % [passed, failed])
	get_tree().quit(1 if failed > 0 else 0)
