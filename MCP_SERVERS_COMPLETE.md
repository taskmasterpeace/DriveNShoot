# Complete MCP Server Setup for CarWorld - The Ultimate Godot Vibe Coding Stack 🚀

## ✅ Installation Complete!

You now have the **ultimate Godot vibe coding setup** with three powerful MCP servers configured:

1. **Godot MCP** - Direct Godot Editor integration
2. **Context7** - Enhanced AI context management
3. **PixelLab** - AI-powered pixel art generation

---

## 📦 Configured MCP Servers

### 1. 🎮 Godot MCP (ee0pdt/Godot-MCP)

**Status:** ✅ Installed and Configured

**What it does:**
- Direct control of Godot Editor via WebSocket
- Create and modify scenes, nodes, and resources
- Read and write GDScript files
- Debug errors and analyze project structure
- Execute Godot-specific commands

**Configuration:**
```json
{
  "godot-mcp": {
    "type": "stdio",
    "command": "node",
    "args": ["C:/git/carworld/godot-mcp/server/dist/index.js"]
  }
}
```

**Location:**
- Server: `C:\git\carworld\godot-mcp\`
- Plugin: `C:\git\carworld\game\addons\godot_mcp\`

**Manual Step Required:**
- ⏳ Enable the plugin in Godot (Project → Project Settings → Plugins → Check "Godot MCP")

---

### 2. 🧠 Context7 (Upstash Context7)

**Status:** ✅ Installed and Configured

**What it does:**
- Maintains conversation context across chat sessions
- Stores important project information and patterns
- Provides semantic memory for better AI responses
- Learns from your codebase and preferences over time

**Configuration:**
```json
{
  "context7": {
    "type": "stdio",
    "command": "npx",
    "args": ["-y", "@upstash/context7-mcp"]
  }
}
```

**Features:**
- Persistent memory across sessions
- Automatic context summarization
- Semantic search through conversation history
- No additional setup required

**Usage:**
Context7 works automatically in the background. It will:
- Remember important decisions you make
- Recall previous conversations about your project
- Suggest solutions based on past interactions
- Maintain awareness of your coding patterns

---

### 3. 🎨 PixelLab (AI Pixel Art Generator)

**Status:** ✅ Installed and Configured

**What it does:**
- Generate pixel art assets using AI
- Create sprites, tilesets, and game assets
- Integrate directly with Godot projects
- Export in various formats compatible with Godot

**Configuration:**
```json
{
  "pixellab": {
    "type": "http",
    "url": "https://api.pixellab.ai/mcp",
    "headers": {
      "Authorization": "Bearer 8a33c429-1ea4-489b-aa2d-0587bbfdd885"
    }
  }
}
```

**Features:**
- AI-powered sprite generation
- Tileset creation
- Character design
- Item and prop generation
- Automatic integration with Godot asset pipeline

**Usage Examples:**
```
"Create a 32x32 pixel art sprite of a zombie enemy"
"Generate a grass tileset for a top-down game"
"Design a pixel art car sprite facing right"
"Create pickup item icons for health, ammo, and fuel"
```

---

## 🧪 Testing Your Setup

### Step 1: Restart Claude Code
Restart to load the new MCP server configurations:
```bash
claude restart
```

### Step 2: Enable Godot Plugin
1. Open Godot Editor
2. Load project: `C:\git\carworld\game\project.godot`
3. Go to: **Project → Project Settings → Plugins**
4. Check the box next to **"Godot MCP"**
5. Verify WebSocket server starts (check Godot console)

### Step 3: Start a New Chat
Open a fresh chat session to test all servers.

---

## 🎯 Test Commands

### Testing Godot MCP:
```
What scenes are in my Godot project?
```

```
Show me the structure of my main player script
```

```
Create a new test scene with a CharacterBody2D root
```

### Testing Context7:
```
Remember that I'm building a top-down vehicular combat game called CarWorld
```

Later in the same or different session:
```
What type of game am I building?
```
*Context7 should remember your project details*

### Testing PixelLab:
```
Generate a 32x32 pixel art sprite of a post-apocalyptic car
```

```
Create a zombie enemy sprite for my top-down game
```

```
Design a health pickup icon in pixel art style
```

---

## 🔥 The Ultimate Godot Vibe Coding Workflow

### Why This Stack is Powerful

**Godot + Claude Code** has emerged as the **gold standard** for AI-assisted game development:

1. **Claude's Native GDScript Proficiency**
   - Exceptional understanding of GDScript and Godot architecture
   - Well-structured documentation in training data
   - Python-like syntax aligns with Claude's strengths

2. **Superior MCP Ecosystem**
   - Multiple mature MCP servers available
   - Active community development
   - Real-world success stories from developers

3. **Lightweight Architecture**
   - Godot's simple project structure works well with AI
   - Clear file organization
   - Easy to understand scene system

4. **Proven Results**
   - Developers report smooth workflows
   - Faster prototyping than manual coding
   - Effective for both beginners and experienced devs

---

## 🎮 Example Workflows

### Workflow 1: Create a New Enemy with Art
```
User: "I need a zombie enemy for my game. Create the sprite and scene."

Claude: I'll help you create a complete zombie enemy:
1. [Uses PixelLab] Generating a 64x64 zombie sprite...
2. [Uses Godot MCP] Creating enemy scene with CharacterBody2D...
3. [Adds sprite to scene and configures collision]
4. [Creates basic AI script for zombie behavior]
Done! Your zombie enemy is ready at res://entities/enemies/zombie.tscn
```

### Workflow 2: Debug with Context Memory
```
User: "I'm getting an error in my vehicle physics"

Claude: [Checks Context7 for previous discussions about vehicle physics]
I remember you implemented arcade-style physics using CharacterBody2D.
Let me check your vehicle script...
[Uses Godot MCP to read the script]
Found the issue: Line 67 has a typo in velocity calculation.
[Fixes the error and explains the solution]
```

### Workflow 3: Asset Pipeline
```
User: "Create a complete tileset for desert roads"

Claude: I'll create a complete desert road tileset:
1. [Uses PixelLab] Generating desert road tiles...
   - Straight roads (N-S, E-W)
   - Corners (NE, NW, SE, SW)
   - T-junctions
   - 4-way intersections
2. [Uses Godot MCP] Creating TileSet resource...
3. [Imports and configures all tiles]
4. [Sets up collision shapes]
Your desert road tileset is ready at res://tilesets/desert_roads.tres
```

### Workflow 4: Iterative Development
```
User: "Add a new weapon system to my player vehicle"

Claude: [Context7 remembers your existing weapon system architecture]
I'll add a new weapon following your existing component pattern:
1. [Creates weapon component script]
2. [Adds to player vehicle scene]
3. [Implements firing logic compatible with your input system]
4. [Suggests weapon sprites to generate with PixelLab]
Would you like me to generate the weapon sprites now?
```

---

## 🛠️ Advanced Configuration

### Current Config Location:
```
C:\Users\taskm\.claude.json
```

### Full MCP Configuration:
```json
{
  "mcpServers": {
    "godot-mcp": {
      "type": "stdio",
      "command": "node",
      "args": ["C:/git/carworld/godot-mcp/server/dist/index.js"],
      "env": {}
    },
    "context7": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp"],
      "env": {}
    },
    "pixellab": {
      "type": "http",
      "url": "https://api.pixellab.ai/mcp",
      "headers": {
        "Authorization": "Bearer 8a33c429-1ea4-489b-aa2d-0587bbfdd885"
      }
    }
  }
}
```

---

## 🐛 Troubleshooting

### Godot MCP Issues:
**Problem:** Plugin not appearing
- Verify folder: `C:\git\carworld\game\addons\godot_mcp\`
- Check `plugin.cfg` exists
- Restart Godot completely

**Problem:** Connection errors
- Ensure Godot is open with plugin enabled
- Check Godot console for WebSocket messages
- Verify Node.js is installed: `node --version`

### Context7 Issues:
**Problem:** Not remembering context
- Context builds over time - use it for a few conversations
- Try explicitly asking it to remember important info
- Restart Claude Code to reload the server

**Problem:** Server won't start
- Check internet connection (Context7 uses cloud service)
- Verify npx is working: `npx --version`
- Try: `npx -y @upstash/context7-mcp` manually

### PixelLab Issues:
**Problem:** API errors
- Verify API key is correct in config
- Check PixelLab service status
- Ensure you have API credits/quota remaining

**Problem:** Assets not generating
- Be specific in your prompts (size, style, subject)
- Check Godot console for import errors
- Verify internet connection

---

## 🔄 Updating Servers

### Update Godot MCP:
```bash
cd C:/git/carworld/godot-mcp
git pull
cd server
npm install
npm run build
```

### Update Context7:
Context7 updates automatically via npx (always uses latest version).

### Update PixelLab API Key:
Edit `C:\Users\taskm\.claude.json` and update the Bearer token.

---

## 📚 Resources

### Godot MCP:
- **GitHub:** https://github.com/ee0pdt/Godot-MCP
- **Detailed Setup:** `GODOT_MCP_SETUP.md`

### Context7:
- **NPM Package:** https://www.npmjs.com/package/@upstash/context7-mcp
- **Documentation:** https://upstash.com/docs/mcp/context7

### PixelLab:
- **Website:** https://pixellab.ai/
- **API Docs:** https://api.pixellab.ai/docs
- **MCP Integration:** https://pixellab.ai/mcp

### General MCP Resources:
- **MCP Protocol:** https://modelcontextprotocol.io/
- **Claude Code Docs:** https://docs.anthropic.com/claude/docs
- **MCP Servers Directory:** https://mcpservers.com/

---

## 💡 Pro Tips

### 1. Layer Your Requests
Combine multiple MCP capabilities in one request:
```
"Generate a zombie sprite with PixelLab, then create a Godot scene
with the sprite, collision, and basic AI script"
```

### 2. Build Context Over Time
Tell Context7 about your:
- Game design decisions
- Code architecture patterns
- Preferred naming conventions
- Art style guidelines

### 3. Iterate with Feedback
Don't expect perfection on first try:
```
User: "The zombie sprite looks too cartoony"
Claude: [Regenerates with different style parameters]
```

### 4. Leverage Project Memory
Reference previous work:
```
"Create a new enemy using the same pattern as the zombie we made earlier"
```

### 5. Batch Asset Creation
Generate multiple related assets:
```
"Create a complete enemy pack: zombie, raider, mutant dog -
including sprites and scenes for each"
```

---

## 🎉 You're Ready to Vibe Code!

Your setup is now complete with the **ultimate Godot development stack**:

✅ **Godot MCP** - Editor control
✅ **Context7** - Persistent memory
✅ **PixelLab** - AI art generation

### Next Steps:

1. **Restart Claude Code:** `claude restart`
2. **Enable Godot Plugin:** Project → Settings → Plugins
3. **Start Creating:** Open a new chat and build your game!

### Suggested First Project:

```
"Let's create a new pickup item system for my game:
1. Generate sprites for health, ammo, and fuel pickups (PixelLab)
2. Create a reusable pickup scene (Godot MCP)
3. Add a pickup manager system
4. Integrate with my existing player and UI"
```

**Happy Vibe Coding! 🚀🎮✨**

---

*The combination of Claude's strong GDScript understanding, multiple robust MCP servers, and Godot's lightweight architecture creates the ideal environment for rapid game prototyping and development.*
