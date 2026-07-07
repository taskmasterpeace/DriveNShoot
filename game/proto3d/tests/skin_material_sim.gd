## Proof for PIXEL-ART SKINS (world_builder.gd material_textured/material_skin — goal
## "pixel art, brought into 3D"). Verifies the skin registry loads, the material is NEAREST-
## filtered (crisp) + triplanar (world-space), the TEXEL-PER-METER law (density set by
## tile_meters, constant across mesh sizes), and the missing-skin fallback. Run:
## godot --headless --path game res://proto3d/tests/skin_material_sim.tscn
extends Node

var passed := 0
var failed := 0


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("SKIN: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _ready() -> void:
	# The four hero skins loaded from assets/skins/.
	var sk := ProtoWorldBuilder.skins()
	for name in ["road", "wall", "dirt", "metal"]:
		_check("skin '%s' loaded" % name, sk.has(name) and ProtoWorldBuilder.skin(name) is Texture2D)

	# The material is the pixel-art recipe: NEAREST + triplanar, carrying the skin.
	var m := ProtoWorldBuilder.material_skin("road", 1.0)
	_check("material carries the road texture", m.albedo_texture == ProtoWorldBuilder.skin("road"))
	_check("NEAREST filter (crisp pixels, not blurry)", m.texture_filter == BaseMaterial3D.TEXTURE_FILTER_NEAREST)
	_check("triplanar world-mapping (density independent of mesh size)", m.uv1_triplanar)
	_check("1 m tile → uv1_scale 1.0 (texel-per-meter)", absf(m.uv1_scale.x - 1.0) < 0.001)

	# TEXEL-PER-METER: tile_meters sets density; a 2 m tile halves the scale.
	var m2 := ProtoWorldBuilder.material_textured(ProtoWorldBuilder.skin("dirt"), 2.0)
	_check("2 m tile → uv1_scale 0.5 (constant density law)", absf(m2.uv1_scale.x - 0.5) < 0.001)

	# One skin+scale → one cached material, so EVERY surface using it shares one density
	# regardless of its mesh size (that's what keeps a wall and a road looking related).
	_check("same skin+scale returns the cached material", ProtoWorldBuilder.material_skin("road", 1.0) == m)
	_check("different tile_meters is a different material", ProtoWorldBuilder.material_skin("road", 2.0) != m)

	# Missing skin never renders black — it falls back to a flat color material.
	var fb := ProtoWorldBuilder.material_skin("does_not_exist", 1.0, Color(0.5, 0.4, 0.3))
	_check("missing skin falls back to a flat color (no black)", fb.albedo_texture == null and fb.albedo_color.is_equal_approx(Color(0.5, 0.4, 0.3)))

	# The tiles are chunky (16 px) — the owner's locked call.
	var img := ProtoWorldBuilder.skin("road").get_image()
	_check("skins are chunky 16×16 tiles", img.get_width() == 16 and img.get_height() == 16)

	print("SKIN: DONE — %d passed, %d failed" % [passed, failed])
	get_tree().quit(1 if failed > 0 else 0)
