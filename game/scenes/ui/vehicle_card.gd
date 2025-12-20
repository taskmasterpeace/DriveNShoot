extends PanelContainer

signal selected

@onready var name_label = $VBox/NameLabel
@onready var req_label = $VBox/ReqLabel
@onready var select_button = $VBox/SelectButton
@onready var lock_overlay = $LockOverlay

func setup(v_name: String, req: String, is_unlocked: bool, is_active: bool) -> void:
	name_label.text = v_name
	req_label.text = req
	
	if is_unlocked:
		lock_overlay.visible = false
		if is_active:
			select_button.text = "SELECTED"
			select_button.disabled = true
		else:
			select_button.text = "SELECT"
			select_button.disabled = false
			select_button.pressed.connect(func(): selected.emit())
	else:
		lock_overlay.visible = true
		select_button.text = "LOCKED"
		select_button.disabled = true
