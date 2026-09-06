extends RefCounted
## Local editor tooling must never inherit TCPServer's wildcard bind default.

const BIND_ADDRESS: String = "127.0.0.1"

static func listen(server: TCPServer, port: int) -> Error:
	return server.listen(port, BIND_ADDRESS)
