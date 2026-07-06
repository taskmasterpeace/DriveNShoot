class_name DebugOverlay
extends CanvasLayer

var label: Label

func _ready() -> void:
	visible = false
	label = Label.new()
	label.position = Vector2(20, 100)
	label.add_theme_color_override("font_color", Color.YELLOW)
	add_child(label)

func _input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and event.keycode == KEY_F1:
		visible = not visible

func _process(delta: float) -> void:
	if not visible: return
	
	var gs = get_node_or_null("/root/GameState")
	if not gs: return
	
	var txt = "DEBUG (F1)\n"
	txt += "Miles: %.2f\n" % gs.current_run_miles
	txt += "Heat: %d\n" % gs.current_heat
	txt += "Scrap: %d\n" % gs.scrap
	txt += "Last Heat:\n"
	for entry in gs.heat_log:
		txt += "  %s\n" % entry
		
	# Director Info
	var director = gs.get_tree().root.find_child("EncounterDirector", true, false)
	if director:
		txt += "Pend: %s\n" % str(director.pursuer_pending)
		txt += "Spwn: %s\n" % str(director.pursuer_spawned_this_run)
		
	label.text = txt
