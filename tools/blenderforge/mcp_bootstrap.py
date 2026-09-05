"""Start the installed Blender MCP addon in a disposable GUI Blender session.

Run Blender with --factory-startup --python this_file (not --background).
No user preferences or scenes are saved. Only localhost receives commands.
"""
import importlib.util
import os
from pathlib import Path
import bpy

addon_path = Path(os.environ.get("DRIVN_BLENDER_ADDON", str(
    Path.home() / "AppData/Roaming/Blender Foundation/Blender/5.1/scripts/addons/blender_mcp_addon.py")))
if bpy.app.background:
    raise RuntimeError("Blender MCP needs the GUI event loop; start a hidden GUI session.")
if not addon_path.is_file():
    raise FileNotFoundError(f"Installed Blender MCP addon not found: {addon_path}")
spec = importlib.util.spec_from_file_location("drivn_blender_mcp_addon", addon_path)
addon = importlib.util.module_from_spec(spec)
spec.loader.exec_module(addon)
port = int(os.environ.get("DRIVN_BLENDER_PORT", "19876"))
if not 1024 <= port <= 65535:
    raise ValueError("Invalid local MCP port")
# Provide the server before register() so the addon's auto-start uses our port.
bpy.types.blendermcp_server = addon.BlenderMCPServer(host="127.0.0.1", port=port)
addon.register()
bpy.context.scene.blendermcp_port = port
bpy.context.scene.blendermcp_use_polyhaven = False
bpy.context.scene.blendermcp_use_hyper3d = False
if not bpy.types.blendermcp_server.running:
    raise RuntimeError("Blender MCP addon did not start")
print(f"DRIVN_BLENDER_MCP_READY 127.0.0.1:{port}", flush=True)
