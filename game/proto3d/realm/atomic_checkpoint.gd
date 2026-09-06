class_name ProtoAtomicCheckpoint
extends RefCounted
## Same-directory verified replacement. No delete-first window; no live publish here.
static func write(path: String, data: Dictionary) -> Error:
	var expected: PackedByteArray = var_to_str(data).to_utf8_buffer()
	if expected.size() > 64 * 1024 * 1024:
		return ERR_OUT_OF_MEMORY
	var temporary: String = "%s.tmp.%d.%d" % [path, OS.get_process_id(), Time.get_ticks_usec()]
	var file: FileAccess = FileAccess.open(temporary, FileAccess.WRITE)
	if file == null:
		return FileAccess.get_open_error()
	var stored: bool = file.store_buffer(expected)
	file.flush()
	var error: Error = file.get_error()
	file.close()
	if not stored and error == OK:
		error = ERR_FILE_CANT_WRITE
	if error == OK:
		file = FileAccess.open(temporary, FileAccess.READ)
		if file == null:
			error = FileAccess.get_open_error()
		else:
			if file.get_length() != expected.size() or file.get_buffer(expected.size()) != expected:
				error = ERR_FILE_CORRUPT
			file.close()
	if error == OK:
		error = DirAccess.rename_absolute(temporary, path)
	if error != OK:
		DirAccess.remove_absolute(temporary)
	return error
