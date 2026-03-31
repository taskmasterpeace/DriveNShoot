# Godot MCP Server Setup Guide for CarWorld

> **Note:** This guide uses the free, open-source **ee0pdt/Godot-MCP** plugin instead of the paid GDAI MCP plugin. Both provide similar AI-assisted Godot development capabilities.

## ✅ Installation Complete!

The MCP server and plugin have been automatically installed and configured:
- ✅ Godot MCP server cloned and built
- ✅ Plugin copied to `C:\git\carworld\game\addons\godot_mcp\`
- ✅ Claude Code configured with MCP server
- ⏳ **Manual step required:** Enable plugin in Godot (see below)

---

# Godot MCP Server Setup (REFERENCE - Paid Alternative)

## Overview
This guide will help you set up the GDAI MCP Server plugin to enable AI-assisted Godot game development for your CarWorld project.

## ✅ Prerequisites (All Met!)
- ✅ Godot Engine 4.5+ installed and working
- ✅ `uv` package manager installed (v0.5.11 detected)
- ✅ Claude Code CLI available
- ✅ Existing addons folder at `C:\git\carworld\game\addons\`

---

## Step 1: Download GDAI MCP Plugin

**Download Link:** https://buymeacoffee.com/3ddelano/e/404704

1. Visit the link above and download the plugin (may require a donation/purchase)
2. You will receive a ZIP file containing the plugin
3. Extract the ZIP file - you should see an `addons` folder inside

**Expected Structure After Extraction:**
```
downloaded-zip/
└── addons/
    └── gdai-mcp-plugin-godot/
        ├── plugin.cfg
        ├── plugin.gd
        ├── gdai_mcp_server.py
        └── ... (other plugin files)
```

---

## Step 2: Install Plugin in Your Godot Project

### Manual Installation:
1. **Close Godot Editor** if it's currently running
2. Navigate to your extracted download folder
3. **Copy** the entire `addons/gdai-mcp-plugin-godot/` folder
4. **Paste** it into: `C:\git\carworld\game\addons\`

**Final Location:**
```
C:\git\carworld\game\addons\gdai-mcp-plugin-godot\
```

This should be at the same level as your other addons:
- `C:\git\carworld\game\addons\dialogue_manager\`
- `C:\git\carworld\game\addons\tile_bit_tools\`
- `C:\git\carworld\game\addons\gdai-mcp-plugin-godot\` ← New!

---

## Step 3: Enable Plugin in Godot Editor

1. **Open Godot Editor** and load your CarWorld project (`C:\git\carworld\game\project.godot`)
2. Go to: **Project → Project Settings → Plugins** tab
3. Find **"GDAI MCP"** in the plugin list
4. **Check the box** to enable it
5. A new **"GDAI MCP"** tab should appear in the **bottom panel** of the Godot Editor

### Optional but Recommended Editor Settings:
- Go to: **Editor → Editor Settings**
- Search for and enable:
  - ✅ **Auto Reload Scripts on External Change**
  - ✅ **Auto Reload and Parse Scripts on Save**

---

## Step 4: Configure Claude Code MCP Client

Once the plugin is enabled in Godot:

1. **In Godot:** Click on the **GDAI MCP** tab at the bottom of the editor
2. You should see a **JSON configuration** displayed there
3. **Copy** that JSON configuration

### Add to Claude Code:

Open your terminal and run:

```bash
claude mcp add gdai-mcp uv run C:\git\carworld\game\addons\gdai-mcp-plugin-godot\gdai_mcp_server.py
```

**OR** if the GDAI MCP tab shows a different path, use that path from the JSON config instead.

**Alternative Method:**
If you prefer manual configuration, the JSON should look something like this:

```json
{
  "mcpServers": {
    "gdai-mcp": {
      "command": "uv",
      "args": ["run", "C:\\git\\carworld\\game\\addons\\gdai-mcp-plugin-godot\\gdai_mcp_server.py"]
    }
  }
}
```

---

## Step 5: Verify Installation

### Test the Setup:
1. **Ensure Godot project is OPEN** in the Godot Editor (this is critical!)
2. Open a **new Claude Code chat session**
3. Try these test commands:

**Basic Tests:**
- "List all scenes in my Godot project"
- "Show me any script errors in the project"
- "What's the structure of my main scene?"

**Advanced Test:**
- "Create a new scene called 'test_mcp.tscn' with a Node2D root and a Sprite2D child"

### Expected Behavior:
✅ Claude Code can see your project structure
✅ Can read scripts and scenes
✅ Can create/modify nodes and scenes
✅ Can view debugger output and errors
✅ Can take screenshots of the editor

---

## 🎯 What You Can Do After Setup

Once configured, Claude Code will be able to:

### 1. Scene Management
- Generate scenes, nodes, and resources programmatically
- Modify scene trees (add/remove/update nodes)
- Adjust node properties dynamically

### 2. Script Development
- Write and debug GDScript code
- Read debugger output and script errors
- Perform end-to-end testing:
  - Read errors → Update script → Run game → Verify with screenshots

### 3. Asset Management
- Search for files and resources in `res://` filesystem
- Intelligently locate project assets by name
- Reference assets in prompts automatically (e.g., "use the car sprite")

### 4. Visual Feedback
- Automatically capture screenshots of the Godot Editor
- Capture screenshots of the running game
- Visually understand UI and gameplay for better assistance

---

## 🐛 Troubleshooting

### Plugin Doesn't Appear in Godot:
- Verify the folder is at `addons/gdai-mcp-plugin-godot/` (not nested deeper)
- Check that `plugin.cfg` exists in that folder
- Restart Godot Editor completely (close and reopen)
- Check Godot console for any error messages

### Claude Code Can't Connect:
- **Ensure Godot project is OPEN** when using Claude Code (most common issue!)
- Verify `uv` is accessible in PATH: run `uv --version` in terminal
- Check the MCP server path in the configuration command is correct
- Try restarting Claude Code: `claude restart`

### Screenshots Don't Work:
- May require additional permissions on Windows
- Check Godot console for screenshot-related errors
- Ensure the plugin has write access to the project folder

### MCP Server Won't Start:
- Check Python dependencies are installed by the plugin
- Look for error messages in the GDAI MCP tab in Godot
- Verify that `gdai_mcp_server.py` exists in the plugin folder

---

## 📚 Additional Resources

- **Official Documentation:** https://gdaimcp.com/
- **Installation Guide:** https://gdaimcp.com/docs/installation
- **Examples:** https://gdaimcp.com/docs/examples
- **Supported Tools:** https://gdaimcp.com/docs/supported-tools
- **Common Issues:** https://gdaimcp.com/docs/common-issues
- **GitHub Repository:** https://github.com/3ddelano/gdai-mcp-plugin-godot

**Community Support:**
- Discord: https://discord.gg/FZY9TqW
- Contact: DM `@3ddelano`

---

## 🚀 Next Steps After Installation

Once you've completed all steps and verified the installation works:

1. **Test with simple requests** to get familiar with the capabilities
2. **Try creating new scenes** to understand the scene generation workflow
3. **Ask for script debugging help** when you encounter errors
4. **Experiment with asset searching** to see how it finds resources
5. **Use natural language** to describe what you want to build

### Example Workflows:

**Debugging Workflow:**
```
You: "I'm getting errors when I run the game, can you fix them?"
Claude: [Reads errors → Identifies issues → Updates scripts → Runs game → Verifies fixes]
```

**Scene Creation Workflow:**
```
You: "Create a new enemy vehicle scene with a CharacterBody2D and basic collision"
Claude: [Creates scene → Adds nodes → Sets up collision layers → Adds placeholder script]
```

**Asset Integration Workflow:**
```
You: "Add the enemy truck sprite to my new enemy scene"
Claude: [Searches assets → Finds truck sprite → Adds Sprite2D node → Assigns sprite]
```

---

## ⚠️ Important Notes

- **Keep Godot Open:** The MCP server only works when Godot is running with your project open
- **Save Work Often:** While the plugin is stable, always save your work before major changes
- **Version Control:** Don't commit the plugin to public repositories (as per the FAQ)
- **Commercial Use:** You CAN use this plugin for commercial game development
- **Godot Version:** Compatible with Godot 4.1+ (your project uses 4.5+, so you're good!)

---

## ✨ Ready to Go!

Once you complete these steps, you'll have a powerful AI-assisted Godot development environment. Feel free to ask Claude Code to help with:
- Scene design and layout
- GDScript coding and debugging
- Asset organization and integration
- Game systems implementation
- Testing and troubleshooting

Happy game developing! 🎮
