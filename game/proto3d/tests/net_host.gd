## Live-transport HOST half (tools/net_loopback.sh runs it): a real ENet server
## that reports, over stdout, when a client actually connects. Pairs with
## net_client.gd — this is the two-process proof that the socket layer works.
extends Node

var net: ProtoNet = null
var _saw := false


func notify(_t: String) -> void:
	pass # stub: ProtoNet calls main.notify; we only care about the peer signal


func _ready() -> void:
	net = ProtoNet.create(self)
	add_child(net)
	net.peer_joined.connect(func(id: int) -> void:
		_saw = true
		print("HOST: PEER_CONNECTED %d" % id))
	if net.host(24777):
		print("HOST: LISTENING on 24777")
	else:
		print("HOST: BIND FAILED")
		get_tree().quit(1)
	get_tree().create_timer(12.0).timeout.connect(func() -> void:
		print("HOST: %s" % ("A CLIENT CONNECTED" if _saw else "NO CLIENT — FAIL"))
		get_tree().quit(0 if _saw else 1))
