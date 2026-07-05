## Floating combat text — the "you can SEE it" layer. Damage numbers, KNOCKDOWN!,
## HURT, etc. rise off an entity and fade. Cheap Label3D, self-frees.
class_name ProtoFloater
extends Node3D

static func pop(scene: Node, world_pos: Vector3, text: String, color: Color, size: int = 120) -> void:
	if scene == null or not is_instance_valid(scene):
		return
	var f := ProtoFloater.new()
	scene.add_child(f)
	f.global_position = world_pos + Vector3(randf_range(-0.3, 0.3), 0, 0)
	var lbl := Label3D.new()
	lbl.text = text
	lbl.font = ProtoHUD.mixed_font()
	lbl.font_size = size
	lbl.pixel_size = 0.006
	lbl.modulate = color
	lbl.outline_size = 16
	lbl.outline_modulate = Color(0.05, 0.03, 0.02, 0.9)
	lbl.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	lbl.no_depth_test = true
	f.add_child(lbl)
	var tw := f.create_tween()
	tw.set_parallel(true)
	tw.tween_property(f, "position:y", f.position.y + 2.4, 1.0).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tw.tween_property(lbl, "modulate:a", 0.0, 1.0).set_delay(0.35)
	tw.chain().tween_callback(f.queue_free)
