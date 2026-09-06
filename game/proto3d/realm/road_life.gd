class_name ProtoRoadLife
extends Node3D
var main: Node
var state: ProtoRoadLifeState = ProtoRoadLifeState.new()
var panel: ProtoPropertyPanel
var office: ProtoRoadJobBoard
var sites: Array[ProtoPropertySite] = []
var receivers: Dictionary = {}
var _encounter_attempt: int = -1
var _encounter: ProtoLurker
var objective: Label
var objective_backing: PanelContainer

func setup(owner: Node) -> void:
	main = owner
	var rows: Array = JSON.parse_string(FileAccess.get_file_as_string("res://data/properties.json")).properties
	var data: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://data/road_jobs.json"))
	state.setup(main, rows, data.jobs)
	panel = ProtoPropertyPanel.new()
	panel.road_life = self
	add_child(panel)
	office = ProtoRoadJobBoard.new()
	office.position = Vector3(data.office[0], 0, data.office[1])
	add_child(office)
	office.setup(self)
	main.waypoints.append(["ROAD OFFICE · JOBS", office])
	for row: Dictionary in rows:
		var site: ProtoPropertySite = ProtoPropertySite.new()
		add_child(site)
		site.setup(self, row)
		sites.append(site)
		main.waypoints.append([row.name, site])
	var yard: Node3D = preload("res://proto3d/realm/roadstead_yard.gd").new()
	add_child(yard)
	yard.setup(self)
	for row: Dictionary in data.jobs:
		var road: Dictionary = main.stream.usmap.road_by_id(row.road)
		var points: PackedVector2Array = road.pts
		var point: Vector2 = points[0].lerp(points[1], float(row.fraction))
		var geometry: Dictionary = ProtoUSMap.road_geometry(road)
		var receiver: ProtoRoadJobBoard = ProtoRoadJobBoard.new()
		var tangent: Vector2 = (points[1] - points[0]).normalized()
		var shoulder: Vector2 = point + Vector2(-tangent.y, tangent.x) * (float(geometry.width) / 2.0 + 8.0)
		receiver.position = Vector3(shoulder.x, 0, shoulder.y)
		receiver.position.y = ProtoWorldBuilder.ground_y(receiver.position.x, receiver.position.z)
		add_child(receiver)
		receiver.setup(self, row.id)
		receivers[row.id] = receiver
		main.waypoints.append(["DELIVERY · " + row.id.to_upper(), receiver])
	var layer: CanvasLayer = CanvasLayer.new()
	layer.layer = 3 # above the main game's screen-space vision-cone dimmer
	add_child(layer)
	objective_backing = PanelContainer.new()
	objective_backing.position = Vector2(20,155)
	var style: StyleBoxFlat = StyleBoxFlat.new()
	style.bg_color = Color(0.035,0.065,0.05,0.94)
	style.set_corner_radius_all(8)
	style.content_margin_left = 12
	style.content_margin_right = 12
	style.content_margin_top = 8
	style.content_margin_bottom = 8
	objective_backing.add_theme_stylebox_override("panel", style)
	layer.add_child(objective_backing)
	objective = Label.new()
	objective.add_theme_font_size_override("font_size", 17)
	objective.add_theme_color_override("font_color", Color("fff3d6"))
	objective.add_theme_color_override("font_outline_color", Color.BLACK)
	objective.add_theme_constant_override("outline_size", 3)
	objective_backing.add_child(objective)

func _physics_process(_delta: float) -> void:
	if main == null:
		return
	objective_backing.visible = not main.menu_open and not panel.is_open
	if main.net != null and main.net.online:
		objective.text = "ROADSTEAD · LOCAL AUTHORITY — transactions disabled in co-op"
		if panel.is_open:
			panel.close()
		return
	var target: Node3D = office
	var message: String = "Visit ROAD OFFICE for freight · N cycles waypoints"
	if state.jobs.active != "":
		target = receivers[state.jobs.active]
		message = "Deliver %s · cargo in backpack · E at receiver" % state.jobs.active.replace("_", " ")
	else:
		var selected_site: ProtoPropertySite = _selected_site()
		if selected_site != null and state.balance() >= int(selected_site.row.price):
			target = selected_site
			message = "Deed earned! Buy %s · %d banked" % [selected_site.row.name, int(selected_site.row.price)]
	objective.text = "ROADSTEAD · LOCAL AUTHORITY\n%s · %dm" % [message, main.player.global_position.distance_to(target.global_position)]
	var active_job: String = state.jobs.active
	var job: Dictionary = state.definitions.get(active_job, {})
	var encounter_receiver: Node3D = receivers.get(active_job) as Node3D
	if not job.is_empty() and bool(job.get("encounter", false)) and encounter_receiver != null and _encounter_attempt != state.jobs.attempt and main.player.global_position.distance_to(encounter_receiver.global_position) < 55.0:
		_encounter_attempt = state.jobs.attempt
		if is_instance_valid(_encounter):
			_encounter.queue_free()
		_encounter = ProtoLurker.create()
		main.add_child(_encounter)
		_encounter.global_position = encounter_receiver.global_position + Vector3(8,0.5,8)
		main.notify("%s: movement by the relay. Fight or deliver and leave." % String(job.name))

func _selected_site() -> ProtoPropertySite:
	for site: ProtoPropertySite in sites:
		if not state.ledger.can_access(ProtoRoadLifeState.ACCOUNT, String(site.row.id)):
			return site
	return null

func notify_result(result: Dictionary) -> void:
	main.notify("ROAD OFFICE: checkpoint saved" if result.ok else "ROAD OFFICE: " + String(result.error))
