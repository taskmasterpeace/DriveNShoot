class_name ProtoTransitStop
extends Node3D
## A shared south-side terminal: east-facing bay, protected waiting island,
## separate turning apron, and a reserved rotor pad. All consumers use this frame.
var service: Node
var stop_id: String
var east: Vector3
var south: Vector3
var bay: Vector3
var pad: Vector3
var safe: bool = false
var apron_rects: Array = []
var lane_east_v: float
var lane_west_v: float
var lamps: Array[OmniLight3D] = []
var _pavement_key: String = ""

func setup(owner: Node, id: String) -> void:
	service = owner
	stop_id = id
	global_position = service.catalog.stop_position(id)
	var row: Dictionary = service.catalog.stops[id]
	var road: Dictionary = service.main.stream.usmap.road_by_id(row.road)
	var sample: Dictionary = ProtoTransitCatalog._sample(road,float(row.fraction))
	var tangent: Vector2 = sample.tangent
	east = -Vector3(tangent.x,0,tangent.y)
	south = east.cross(Vector3.UP)
	bay = global_position - east*3.26 - south*3.8
	pad = global_position + south*float(row.pad_offset_m)
	var lateral: float = float(ProtoUSMap.road_geometry(road).width)*0.5 + float(row.shoulder_m)-3.8
	lane_east_v = -lateral+ProtoUSMap.lane_offset(road,0)
	lane_west_v = -lateral-ProtoUSMap.lane_offset(road,0)
	var yaw: float = atan2(east.x,east.z)
	# Local rectangle axes: X = south, Z = east.
	for descriptor: Array in [[Vector2(7,10),Vector2(28,62)],[Vector2(3.26,float(row.pad_offset_m)+3.8),Vector2(14,14)]]:
		var center: Vector3 = point(descriptor[0].x,descriptor[0].y)
		var size: Vector2 = descriptor[1]
		apron_rects.append([center.x,center.z,size.x*0.5,size.y*0.5,yaw])
	var reservations: Array = service.main.stream._ruin_exclusions(global_position,"%d,%d" % [floori(global_position.x/128),floori(global_position.z/128)],String(row.road))
	safe = true
	for rect: Array in apron_rects:
		if not ProtoWorldStream._ruin_footprint_clear(Vector3(rect[0],0,rect[1]),Vector3(rect[2]*2,1,rect[3]*2),rect[4],reservations):
			safe = false
		var basis := Basis(Vector3.UP,float(rect[4]))
		var center := Vector3(rect[0],0,rect[1])
		var base_y: float = ProtoWorldBuilder.ground_y(center.x,center.z)
		for x: float in [-float(rect[2]),0.0,float(rect[2])]:
			for z: float in [-float(rect[3]),0.0,float(rect[3])]:
				var sample_position: Vector3 = center+basis*Vector3(x,0,z)
				if absf(ProtoWorldBuilder.ground_y(sample_position.x,sample_position.z)-base_y)>0.04:
					safe = false
	# The full rotor square and entire waiting/apron footprint must be clear of
	# other roads/buildings; only its own explicit merging driveways cross lanes.
	print("TRANSIT SITE: %s safe=%s wait=%s bay=%s pad=%s" % [id,safe,global_position,bay,pad])
	if not safe:
		return
	_pavement_key = "transit:%s:%d" % [id,get_instance_id()]
	service.main.stream.reserve_service_footprint(_pavement_key,apron_rects)
	ProtoWorldBuilder.extra_road_rects[_pavement_key] = apron_rects.duplicate(true)
	_construct()
	add_to_group("interactable")

func point(u: float, v: float) -> Vector3:
	var result: Vector3 = bay + east*u + south*v
	result.y = ProtoWorldBuilder.ground_y(result.x,result.z)
	return result

func bay_yaw() -> float:
	return atan2(-east.x,-east.z)

func departure(westbound: bool) -> PackedVector3Array:
	var route := PackedVector3Array([point(0,0)])
	if not westbound:
		route.append(point(16,0))
		route.append(point(40,lane_east_v))
		return route
	route.append(point(14,0))
	_arc(route,Vector2(14,10),10,-PI/2,PI/2)
	route.append(point(-10,20))
	_arc(route,Vector2(-10,10),10,PI/2,PI)
	route.append(point(-20,lane_west_v+10))
	_arc(route,Vector2(-30,lane_west_v+10),10,0,-PI/2)
	return route

func approach(westbound: bool) -> PackedVector3Array:
	var route := PackedVector3Array()
	if not westbound:
		route.append(point(-40,lane_east_v))
		route.append(point(-16,0))
		route.append(point(0,0))
		return route
	route.append(point(44,lane_west_v))
	_arc(route,Vector2(44,lane_west_v+10),10,-PI/2,-PI)
	route.append(point(34,10))
	_arc(route,Vector2(24,10),10,0,PI/2)
	route.append(point(-10,20))
	_arc(route,Vector2(-10,10),10,PI/2,PI*1.5)
	route.append(point(0,0))
	return route

func _arc(route: PackedVector3Array, center: Vector2, radius: float, start: float, end: float) -> void:
	var count: int = ceili(absf(end-start)/0.15)
	for i: int in range(1,count+1):
		var angle: float = lerpf(start,end,float(i)/count)
		route.append(point(center.x+cos(angle)*radius,center.y+sin(angle)*radius))

func _construct() -> void:
	# Real service-owned support survives distant chunk unload. Flatness is
	# verified from the terrain samples before concrete is constructed.
	for rect: Array in apron_rects:
		var center := Vector3(rect[0],0,rect[1])
		center.y = ProtoWorldBuilder.ground_y(center.x,center.z)
		var ground: StaticBody3D = ProtoWorldBuilder.box_body(self,Vector3(rect[2]*2,0.15,rect[3]*2),to_local(center-Vector3.UP*0.075),Color(0.29,0.28,0.24),rect[4])
		ground.set_meta("transit_apron",stop_id)
		ProtoWorldBuilder.box_visual(self,Vector3(rect[2]*2,0.02,rect[3]*2),to_local(center+Vector3.UP*0.055),Color(0.30,0.29,0.26),rect[4])
	var yaw: float = bay_yaw()
	var shelter: Vector3 = global_position + south*2.6
	# Marked pedestrian island and protected bay. Paint is visible above the
	# existing ground visual; the real supporting slab remains exactly at grade.
	ProtoWorldBuilder.box_visual(self,Vector3(3.5,0.025,6.5),to_local(global_position+south*1.4+Vector3.UP*0.07),Color(0.56,0.50,0.36),yaw)
	for u: float in [-5.0,5.0]:
		ProtoWorldBuilder.box_visual(self,Vector3(3.0,0.025,0.13),to_local(point(u,0)+Vector3.UP*0.07),Color(0.96,0.72,0.2),yaw)
	ProtoWorldBuilder.box_visual(self,Vector3(0.13,0.025,10.0),to_local(point(0,1.6)+Vector3.UP*0.07),Color(0.96,0.72,0.2),yaw)
	var cream := Color(0.85,0.81,0.67)
	var green := Color(0.22,0.34,0.28)
	for offset: float in [-2.2,2.2]:
		for depth: float in [-1.0,1.0]:
			ProtoWorldBuilder.box_body(self,Vector3(0.19,2.8,0.19),to_local(shelter+east*offset+south*depth+Vector3.UP*1.4),green)
	ProtoWorldBuilder.box_body(self,Vector3(2.8,0.16,5.2),to_local(shelter+Vector3.UP*2.85),cream,yaw)
	ProtoWorldBuilder.box_visual(self,Vector3(0.1,0.32,5.2),to_local(shelter-south*1.36+Vector3.UP*2.8),green,yaw)
	ProtoWorldBuilder.box_body(self,Vector3(0.55,0.12,3.4),to_local(shelter+south*0.7+Vector3.UP*0.55),cream,yaw)
	for offset: float in [-1.35,1.35]:
		ProtoWorldBuilder.box_body(self,Vector3(0.42,0.48,0.16),to_local(shelter+south*0.7+east*offset+Vector3.UP*0.24),green,yaw)
	ProtoWorldBuilder.box_body(self,Vector3(0.14,0.55,3.4),to_local(shelter+south*1.0+Vector3.UP*0.93),green,yaw)
	ProtoWorldBuilder.box_visual(self,Vector3(0.12,0.1,5.2),to_local(shelter-south*1.38+Vector3.UP*2.59),Color(0.96,0.72,0.2),yaw)
	var sign := Label3D.new()
	sign.text = "LASTLINE\n" + String(service.catalog.stops[stop_id].name).to_upper() + "\nTICKETS · E / Y/△"
	sign.font_size = 44
	sign.pixel_size = 0.01
	sign.modulate = Color(0.96,0.72,0.2)
	sign.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	sign.no_depth_test = false
	add_child(sign)
	sign.global_position = shelter+Vector3.UP*3.5
	for local: Vector2 in [Vector2(6,8),Vector2(4,12)]:
		var lamp := OmniLight3D.new()
		lamp.light_color = Color(1.0,0.79,0.47)
		lamp.light_energy = 3.0
		lamp.omni_range = 16.0
		add_child(lamp)
		lamps.append(lamp)
		lamp.global_position = point(local.x,local.y)+Vector3.UP*4
		ProtoWorldBuilder.box_body(self,Vector3(0.14,4,0.14),to_local(lamp.global_position-Vector3.UP*2),Color(0.28,0.26,0.22))
		ProtoWorldBuilder.box_visual(self,Vector3(0.65,0.14,0.40),to_local(lamp.global_position),Color(0.82,0.75,0.55))

func _physics_process(_delta: float) -> void:
	if service == null:
		return
	for lamp: OmniLight3D in lamps:
		lamp.visible = service.main.daynight.is_dark()

func _exit_tree() -> void:
	ProtoWorldBuilder.extra_road_rects.erase(_pavement_key)
	if is_instance_valid(service) and is_instance_valid(service.main.stream):
		service.main.stream.service_reservations.erase(_pavement_key)

func interact_position() -> Vector3:
	return global_position

func interact_prompt(_main: Node) -> String:
	return "E / Y/△ — Read LASTLINE ticket board" if safe else ""

func interact(_main: Node) -> void:
	service.panel.open(stop_id)
