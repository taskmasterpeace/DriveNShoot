## Live-transport CLIENT half: connects to the host over real ENet loopback and
## reports success. Pairs with net_host.gd (tools/net_loopback.sh).
extends Node

var net: ProtoNet = null


func notify(_t: String) -> void:
	pass


func _ready() -> void:
	net = ProtoNet.create(self)
	add_child(net)
	multiplayer.connected_to_server.connect(func() -> void:
		print("CLIENT: CONNECTED to host — the wasteland is shared")
		get_tree().create_timer(1.5).timeout.connect(func() -> void: get_tree().quit(0)))
	multiplayer.connection_failed.connect(func() -> void:
		print("CLIENT: CONNECTION FAILED")
		get_tree().quit(1))
	# give the host a beat to bind
	get_tree().create_timer(1.5).timeout.connect(func() -> void:
		net.join("127.0.0.1", 24777))
	get_tree().create_timer(11.0).timeout.connect(func() -> void:
		print("CLIENT: TIMED OUT")
		get_tree().quit(1))
