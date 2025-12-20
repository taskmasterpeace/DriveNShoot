extends CanvasLayer

@onready var title_label = $Panel/Title
@onready var cause_label = $Panel/CauseLabel
@onready var miles_val = $Panel/Stats/MilesRow/Value
@onready var best_val = $Panel/Stats/BestRow/Value
@onready var scrap_val = $Panel/Stats/ScrapRow/Value

@onready var start_btn = $Panel/Buttons/StartButton
@onready var town_btn = $Panel/Buttons/TownButton
@onready var quit_btn = $Panel/Buttons/QuitButton

func _ready() -> void:
	visible = false
	start_btn.pressed.connect(_on_start)
	town_btn.pressed.connect(_on_town)
	quit_btn.pressed.connect(func(): get_tree().quit())
	
	if has_node("/root/GameState"):
		get_node("/root/GameState").run_finished.connect(_on_run_finished)

func _on_run_finished(results: Dictionary) -> void:
	setup(results.miles, results.best, results.scrap_delta, results.cause)

func setup(miles: float, best: float, scrap_gain: int, cause: String = "Extracted") -> void:
	miles_val.text = "%.1f mi" % miles
	best_val.text = "%.1f mi" % best
	scrap_val.text = "+%d" % scrap_gain
	
	if cause == "Extracted":
		title_label.text = "RUN EXTRACTED"
		title_label.modulate = Color(0.4, 1.0, 0.4)
		cause_label.text = "Miles Banked!"
	else:
		title_label.text = "RUN FAILED"
		title_label.modulate = Color(1.0, 0.4, 0.4)
		cause_label.text = "Killed by: %s" % cause
		
	visible = true
	get_tree().paused = true

func _on_start() -> void:
	get_tree().paused = false
	visible = false
	var gs = get_node("/root/GameState")
	gs.start_run()
	# GameState start_run logic handles resetting loop, but we might need to be sure player is ready.
	# GameState -> RoadManager -> Teleport.
	# This should work.

func _on_town() -> void:
	get_tree().paused = false
	visible = false
	var gs = get_node("/root/GameState")
	gs.return_to_town()
