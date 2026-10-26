# Divided States of America

A top-down game about driving and surviving in a divided United States.

The browser game and its tools are in `web/`. From that folder:

```powershell
npm ci
npm run build
npm run agent
```

With the agent running, use a second terminal in `web/` to run the tests:

```powershell
node tools/dl.mjs selftest
node tools/ip-lint.mjs
node --test tools/fixed-step.test.mjs tools/selftest-exit.test.mjs
```

Read the passed and total counts in the test result. See `web/AGENTS.md` for the browser game's controls and tools, and `STATUS.md` for the checks run for this update.

The original Godot game remains in `game/` and launches through `PLAY.bat`. Its existing save folder keeps the name `DRIVN` so this title change does not move saves, following [Godot's save folder rules](https://docs.godotengine.org/en/4.5/tutorials/io/data_paths.html). Folder names and code identifiers keep their existing names.
