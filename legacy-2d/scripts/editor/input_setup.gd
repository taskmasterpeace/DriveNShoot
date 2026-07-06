@tool
extends EditorScript

func _run() -> void:
	_add_input_action("prone", [KEY_Z])
	_add_input_action("run", [KEY_SHIFT])
	_add_input_action("interact", [KEY_E, KEY_SPACE])
	_add_input_action("shoot", [MOUSE_BUTTON_LEFT])
	_add_input_action("use_tool", [KEY_F])
	print("Input Setup Complete")

func _add_input_action(action_name: String, events: Array) -> void:
	if not InputMap.has_action(action_name):
		InputMap.add_action(action_name)
		print("Added action: ", action_name)
	
	for event in events:
		var input_event
		if typeof(event) == TYPE_INT:
			if event < 10: # Mouse buttons are small ints
				input_event = InputEventMouseButton.new()
				input_event.button_index = event
			else:
				input_event = InputEventKey.new()
				input_event.keycode = event
		
		# Check if event already exists
		var has_event = false
		for existing in InputMap.action_get_events(action_name):
			if existing is InputEventKey and input_event is InputEventKey:
				if existing.keycode == input_event.keycode:
					has_event = true
			elif existing is InputEventMouseButton and input_event is InputEventMouseButton:
				if existing.button_index == input_event.button_index:
					has_event = true
		
		if not has_event:
			InputMap.action_add_event(action_name, input_event)
