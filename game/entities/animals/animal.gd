class_name Animal
extends CharacterBody2D

## Animal Entity with Taming System
## States: WILD (Wander), TAMING (Being tamed), TAMED (Follows player)

enum State { WILD, TAMING, TAMED }
var state = State.WILD

@export var max_wildness: float = 100.0
@export var taming_speed: float = 20.0
@export var move_speed: float = 100.0

var current_wildness: float
var taming_progress: float = 0.0

@onready var sprite = $Sprite2D
@onready var detection_area = $DetectionArea
@onready var taming_timer = $TamingTimer
@onready var navigation_agent = $NavigationAgent2D

var target_player: Node2D = null

signal tamed(animal: Animal)

func _ready() -> void:
	current_wildness = max_wildness
	
	if detection_area:
		detection_area.body_entered.connect(_on_body_entered)
		detection_area.body_exited.connect(_on_body_exited)

func _physics_process(delta: float) -> void:
	match state:
		State.WILD:
			_wander_state(delta)
		State.TAMING:
			_taming_state(delta)
		State.TAMED:
			_follow_state(delta)
	
	move_and_slide()

func _wander_state(_delta: float) -> void:
	# Simple random wander (placeholder)
	if randf() < 0.01:
		velocity = Vector2(randf_range(-1, 1), randf_range(-1, 1)).normalized() * (move_speed * 0.5)

func _taming_state(delta: float) -> void:
	velocity = Vector2.ZERO
	# Taming logic: If player is close and holding "interact" (simulated here by just proximity for now)
	if target_player:
		taming_progress += delta * taming_speed
		current_wildness -= delta * taming_speed
		
		if current_wildness <= 0:
			_success_tame()

func _follow_state(_delta: float) -> void:
	if target_player:
		var direction = global_position.direction_to(target_player.global_position)
		var distance = global_position.distance_to(target_player.global_position)
		
		if distance > 100.0:
			velocity = direction * move_speed
		else:
			velocity = Vector2.ZERO

func _success_tame() -> void:
	state = State.TAMED
	taming_progress = 100.0
	print("Animal Tamed!")
	tamed.emit(self)
	# Add to player's list (mock)
	if target_player.has_method("add_tamed_animal"):
		target_player.add_tamed_animal(self)
	
	modulate = Color(0.5, 1.0, 0.5) # Turn green to show tamed

func _on_body_entered(body: Node2D) -> void:
	if body.is_in_group("player"):
		target_player = body
		if state == State.WILD:
			# Start taming process if close
			print("Player close. Taming possible.")
			state = State.TAMING

func _on_body_exited(body: Node2D) -> void:
	if body == target_player:
		if state == State.TAMING:
			state = State.WILD
			print("Player left. Taming failed.")
			current_wildness = max_wildness # Reset?
		
		# keep reference if tamed to follow, otherwise null
		if state != State.TAMED:
			target_player = null
