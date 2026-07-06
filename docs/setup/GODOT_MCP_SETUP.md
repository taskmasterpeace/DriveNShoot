# Godot MCP Server - Setup Complete! 🎮

## ✅ What Was Installed

The free, open-source **ee0pdt/Godot-MCP** plugin has been successfully set up for your CarWorld project:

- ✅ **MCP Server:** Cloned and built at `C:\git\carworld\godot-mcp\`
- ✅ **Godot Plugin:** Installed at `C:\git\carworld\game\addons\godot_mcp\`
- ✅ **Claude Code:** Configured to use the MCP server

---

## 🚀 Next Step: Enable the Plugin in Godot

You need to enable the plugin manually in the Godot Editor:

### Instructions:

1. **Open Godot Editor** and load your CarWorld project:
   - Project location: `C:\git\carworld\game\project.godot`

2. **Go to Project Settings:**
   - Menu: **Project → Project Settings → Plugins** tab

3. **Enable the Godot MCP Plugin:**
   - Find **"Godot MCP"** in the plugin list
   - **Check the box** next to it to enable

4. **Verify the Plugin is Active:**
   - You should see a confirmation in the Godot console
   - The plugin will start a WebSocket server on port 8765

---

## 🧪 Testing the Setup

Once you've enabled the plugin in Godot, test the integration:

### 1. Ensure Godot is Open
**Critical:** The MCP server only works when your Godot project is running with the plugin enabled!

### 2. Start a New Claude Code Chat
Open a fresh chat session to ensure the MCP server is loaded.

### 3. Try These Test Commands:

**Basic Project Info:**
```
Can you tell me about my Godot project structure?
```

**Scene Inspection:**
```
What scenes are in my project? Can you describe the main scene?
```

**Script Analysis:**
```
Show me all the GDScript files in my project and their purposes
```

**Code Review:**
```
Are there any syntax errors in my scripts?
```

**Advanced Test:**
```
Create a new test scene called test_mcp_integration.tscn with a Node2D root
```

---

## 🎯 Available Capabilities

With the Godot MCP server, I (Claude Code) can now:

### 📋 Project Management
- **List all scenes** in your project
- **Read scene files** (.tscn) and understand their structure
- **List all scripts** (.gd files) in your project
- **Browse project folders** and assets

### 📝 Script Operations
- **Read GDScript files** and analyze code
- **Write and modify scripts** based on your requirements
- **Fix syntax errors** and improve code quality
- **Suggest optimizations** and best practices

### 🎨 Scene Manipulation
- **Create new scenes** with specified node structures
- **Modify existing scenes** (add/remove nodes)
- **Update node properties** and configurations
- **Organize scene hierarchies**

### 🐛 Debugging Assistance
- **Identify script errors** before running
- **Suggest fixes** for common issues
- **Review code** for potential problems
- **Help with Godot-specific patterns**

---

## 📖 Example Workflows

### Workflow 1: Creating a New Enemy Type
```
User: "Create a new enemy scene for a zombie enemy with basic components"

Claude: I'll create a new enemy scene with the standard structure:
- CharacterBody2D (root)
- Sprite2D (for the sprite)
- CollisionShape2D (for collision detection)
- Area2D (for detection range)
- Script with basic movement logic
[Creates the scene and script]
```

### Workflow 2: Debugging Script Errors
```
User: "My player script has errors, can you fix them?"

Claude: Let me read your player script and check for issues.
[Reads the script, identifies errors]
I found 3 errors:
1. Line 45: Variable 'velocty' should be 'velocity' (typo)
2. Line 67: Missing return type annotation
3. Line 89: Incorrect signal connection syntax

Would you like me to fix these?
```

### Workflow 3: Project Organization
```
User: "Show me all scripts that handle vehicle physics"

Claude: Scanning your project for vehicle-related scripts...
[Searches and lists files]
Found 4 scripts related to vehicle physics:
1. game/entities/vehicles/car_controller.gd
2. game/systems/physics/vehicle_physics.gd
3. game/scripts/vehicle_stats.gd
4. game/entities/components/wheel_system.gd

Would you like me to explain what each one does?
```

---

## 🛠️ Technical Details

### MCP Server Configuration
The Claude Code configuration is stored in:
```
C:\Users\taskm\.claude.json
```

Configuration details:
```json
{
  "godot-mcp": {
    "command": "node",
    "args": ["C:/git/carworld/godot-mcp/server/dist/index.js"]
  }
}
```

### Plugin Location
```
C:\git\carworld\game\addons\godot_mcp\
├── plugin.cfg              (Plugin configuration)
├── mcp_server.gd           (Main MCP server logic)
├── websocket_server.gd     (WebSocket communication)
├── command_handler.gd      (Command processing)
├── commands/               (Command implementations)
├── ui/                     (UI components)
└── utils/                  (Utility functions)
```

### Communication Flow
1. **Claude Code** sends requests via stdio to the MCP server (`index.js`)
2. **MCP Server** communicates with Godot via **WebSocket** (port 8765)
3. **Godot Plugin** executes commands in the editor
4. **Results** are sent back through the chain to Claude Code

---

## 🐛 Troubleshooting

### Plugin Doesn't Appear in Godot
**Issue:** Can't find "Godot MCP" in the Plugins list

**Solutions:**
- Verify the plugin folder exists at `C:\git\carworld\game\addons\godot_mcp\`
- Check that `plugin.cfg` is present in that folder
- Restart Godot Editor completely (close and reopen)
- Look for errors in the Godot console (Output tab)

### Claude Code Can't Connect
**Issue:** MCP server not responding to commands

**Solutions:**
- **Most Common:** Ensure Godot project is OPEN and the plugin is ENABLED
- Check the Godot console for WebSocket server messages
- Verify the server built correctly (check `C:\git\carworld\godot-mcp\server\dist\index.js` exists)
- Try restarting Claude Code: `claude restart`
- Check Node.js is installed: `node --version`

### WebSocket Connection Errors
**Issue:** Plugin shows connection errors in Godot console

**Solutions:**
- Check if another application is using port 8765
- Disable plugin and re-enable it in Godot
- Restart both Godot and Claude Code
- Check Windows Firewall settings (may block local WebSocket)

### Commands Not Working
**Issue:** Claude Code responds but changes don't appear in Godot

**Solutions:**
- Ensure you're asking for Godot-specific tasks
- Check the Godot console for error messages
- Verify the plugin is enabled (check the checkbox in Project Settings → Plugins)
- The project folder must be writable (not read-only)

---

## 🔄 Updating the Plugin

If you need to update the Godot MCP plugin in the future:

```bash
cd C:/git/carworld/godot-mcp
git pull
cd server
npm install
npm run build
cp -r ../addons/godot_mcp ../game/addons/
```

Then restart Godot and Claude Code.

---

## 📚 Additional Resources

- **GitHub Repository:** https://github.com/ee0pdt/Godot-MCP
- **Godot Documentation:** https://docs.godotengine.org/
- **MCP Protocol:** https://modelcontextprotocol.io/

**Alternative MCP Servers for Godot:**
- **GDAI MCP** (paid): https://gdaimcp.com/ - More features, includes screenshots
- **Coding-Solo/godot-mcp**: Focus on project execution and debugging
- **Dokujaa/Godot-MCP**: Another community implementation

---

## 💡 Tips for Best Results

1. **Keep Godot Open:** Always have your project open in Godot when using Claude Code
2. **Be Specific:** Detailed requests get better results
3. **Verify Changes:** Always check the Godot editor after Claude makes changes
4. **Use Version Control:** Commit your work before asking for major changes
5. **Start Small:** Test with simple tasks before complex scene generation
6. **Ask for Explanations:** Don't hesitate to ask why certain approaches are suggested

---

## 🎉 You're Ready!

The Godot MCP server is fully configured. Once you **enable the plugin in Godot**, you can start using natural language to:

- Generate scenes and nodes
- Write and debug GDScript
- Organize your project
- Get coding assistance
- Automate repetitive tasks

Happy game developing with AI assistance! 🚀

---

**Next Steps:**
1. Open Godot and enable the plugin (Project → Project Settings → Plugins)
2. Start a new Claude Code chat session
3. Try the test commands above
4. Build amazing games with AI-powered workflows!
