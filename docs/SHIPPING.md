# SHIPPING — from this repo to a Steam build

**The short version: double-click `BUILD.bat` → `build/DRIVN.exe`. One file, ship it.**

## 0. One-time setup: export templates (currently NOT installed)
Godot needs its 4.5.1 export templates (~900 MB, once per Godot version). `BUILD.bat`
detects this and offers to download/install them for you (option A). Manual route:
1. Download <https://github.com/godotengine/godot/releases/download/4.5.1-stable/Godot_v4.5.1-stable_export_templates.tpz>
2. Extract the archive's inner `templates/` folder INTO
   `%APPDATA%\Godot\export_templates\4.5.1.stable\`
   (so `windows_release_x86_64.exe` sits directly in that folder)
Or in the Godot editor: **Editor > Manage Export Templates > Download and Install**.

## 1. Build
- Double-click `BUILD.bat` (repo root). It prints the version, runs an import pass,
  exports the `Windows Release` preset, and verifies `build/DRIVN.exe` exists
  (Godot can exit 0 on failure, so the script trusts the artifact, not the exit code).
- The exe is **single-file** (pck embedded): copy it anywhere, double-click to play.
  It is a release build — don't try to run it headless; launch it like a player would.

## 2. What's in the build
- Everything under `game/` (res://) **plus** raw `*.json` / `*.mp3` / `*.ogv` via the
  preset's include_filter — the data spine and the radio/media systems read real files
  at runtime, and Godot would otherwise strip non-resource files from the pck.
- Excluded: `*.mp4` encode sources, `*.md` docs. Media is ~128 MB of content, engine
  template ~163 MB → expect a ~250–320 MB exe. Fine for Steam (depots delta-patch).
- Saves/rebinds/radio settings live in `%APPDATA%\Godot\app_userdata\DRIVN\`.
  NOTE: the project was renamed CarWorld→DRIVN for shipping, so old dev saves remain
  in `app_userdata\CarWorld\` — copy them over if you want them in a packaged build.

## 3. Versioning
`game/project.godot → [application] config/version` is the source of truth (now **0.14.0**);
BUILD.bat prints it. When cutting a release, bump it AND the matching
`application/file_version` / `product_version` ("0.14.0.0") in `game/export_presets.cfg`.
Convention: 0.MINOR per content arc, .PATCH per fix; tag the commit `v0.14.0`.

## 4. Optional polish (not blockers)
- **Explorer file icon / version metadata on the exe** needs rcedit (one-time):
  download `rcedit-x64.exe` from <https://github.com/electron/rcedit/releases>, set its
  path in Godot **Editor Settings > Export > Windows > rcedit**, rebuild. Without it the
  exe file shows the stock Godot icon — the window/taskbar icon is already DRIVN's 48-star.
- Code signing: skip for now; Steam does not require it.

## 5. Steam (the road)
1. Steamworks account + $100 app credit → you get an **appid** and depot ids.
2. Smoke-test `build/DRIVN.exe` on a machine that isn't this dev box: title menu,
   NEW GAME first-run chain, radio (O/L), save F5 / load F9, co-op F7/F8, controller.
3. Upload with **SteamPipe** (`steamcmd` + an `app_build.vdf` pointing at `build/`).
   Godot games ship fine on Steam with NO SDK integration — overlay works via injection.
4. **steam_api integration (achievements, rich presence, lobbies) is NOT built** — known
   later step via GodotSteam when wanted; it is not required to launch.
5. Store page: capsule art from the 48-star brand (`game/icon.png`), screenshots,
   trailer cut with MediaForge.

`build/` is git-ignored — never commit exes.
