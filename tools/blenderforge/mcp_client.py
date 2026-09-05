"""Call the installed Blender MCP server through the actual MCP stdio protocol.

Use the Python environment in which blender-mcp and the mcp SDK are installed.
No persistent MCP configuration changes; child-process telemetry is disabled.
"""
import argparse
import asyncio
import json
import os
from pathlib import Path
import sys
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client


async def run(args):
    executable = Path(args.server or Path(sys.executable).with_name("blender-mcp.exe"))
    if not executable.is_file():
        raise FileNotFoundError(f"Installed Blender MCP executable missing: {executable}")
    env = dict(os.environ)
    env.update(BLENDER_HOST="127.0.0.1", BLENDER_PORT=str(args.port), BLENDER_MCP_DISABLE_TELEMETRY="true")
    server = StdioServerParameters(command=str(executable), args=[], env=env)
    async with stdio_client(server) as (read, write):
        async with ClientSession(read, write) as session:
            initialized = await session.initialize()
            print(json.dumps({"mcp_server": initialized.serverInfo.model_dump(), "port": args.port}))
            if args.list:
                listing = await session.list_tools()
                for tool in listing.tools:
                    if tool.name in ("get_scene_info", "execute_blender_code", "get_viewport_screenshot"):
                        print(json.dumps(tool.model_dump(), ensure_ascii=True))
                return 0
            if args.code:
                source = Path(args.code).resolve()
                # runpy preserves __file__ for portable asset output paths.
                code = "import runpy\nrunpy.run_path(" + repr(str(source)) + ", run_name='__main__')"
                payload = {"code": code, "user_prompt": "Author original DRIVN homestead assets through Blender MCP."}
                tool_name = "execute_blender_code"
            else:
                tool_name = "get_scene_info"
                payload = {"user_prompt": "Verify the isolated DRIVN Blender MCP scene."}
            result = await session.call_tool(tool_name, payload)
            failed = bool(result.isError)
            for block in result.content:
                if block.type == "text":
                    print(block.text)
                    failed = failed or block.text.lstrip().startswith("Error")
            return 1 if failed else 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--server", help="Installed blender-mcp executable")
    parser.add_argument("--port", type=int, default=19876)
    parser.add_argument("--list", action="store_true", help="Print relevant MCP tool schemas")
    parser.add_argument("--code", help="Python source file to execute inside the isolated Blender session")
    options = parser.parse_args()
    if not 1024 <= options.port <= 65535:
        parser.error("port must be between 1024 and 65535")
    raise SystemExit(asyncio.run(run(options)))
