# DEATHLANDS — Claude instructions

**Read [AGENTS.md](AGENTS.md) first.** It covers the agent API, the CLI, content packs, scenarios, the architecture map and the invariants.

Short version:
- Fastest: the `deathlands` MCP server (`.mcp.json`). Call `dl_launch`, then `dl_selftest`, and use the `dl_*` tools.
- Shell: `npm run agent` (dev server + headless Chrome), then `node tools/dl.mjs selftest`.
- Drive the game with `node tools/dl.mjs <command> key=value ...`, not with clicks. Use `step` to advance time, and `screenshot --out` to see the result.
- Add content as JSON in `content/` before writing code. Add commands as rows in `COMMANDS` (`src/agent/api.js`), then run `node tools/gen-commands.mjs`.
- Keep the budget under 150 draw calls (instance everything), no per-frame allocations, fixed light count, no purple, real flags on every person.
- After changes, `selftest` must stay green and `scenario name=stress` must not regress.
