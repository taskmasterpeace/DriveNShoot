DRIVN / Roadstead - portable Windows local-evaluation candidate

PLAY
Extract the entire zip into a writable folder and double-click PLAY_DRIVN.bat.
This small launcher runs DRIVN.exe with a separate evaluation save profile.
The executable contains the game and Godot runtime: no Godot installation,
Node.js, Python, editor servers, or launcher is needed to play.
Windows x64 and a graphics driver compatible with this GL Compatibility
build are required. The executable is unsigned; no publisher validation,
SmartScreen reputation, store approval, or clean-machine certification is claimed.

START
Choose NEW GAME at the title. Keyboard: W/A/S/D to move or drive; E to
interact / leave the car; F11 shows and rebinds the current controls.
Controller bindings are also available in the F11 controls panel.
With PLAY_DRIVN.bat, saves and settings live under:
%LOCALAPPDATA%\DRIVN-Roadstead-Evaluation\Roaming\Godot\app_userdata\DRIVN\
If that location cannot be created, the launcher uses evaluation-profile/
beside the executable. "Portable" means no installation is required.
Advanced: double-clicking DRIVN.exe directly also works without Godot installed,
but uses the normal %APPDATA%\Godot\app_userdata\DRIVN\ profile and may share
existing DRIVN saves. Use PLAY_DRIVN.bat to keep evaluation saves separate.

WHAT WAS VERIFIED
Read manifest.json and evidence/acceptance.json for the exact source revision,
dirty-worktree label, engine version, checks, and limitations. SHA256SUMS.txt
lists payload hashes. If title.png and new_game.png exist in evidence/, they
are unedited captures from this exported executable's real viewport.
Packaging checks cover data/model/font/notice availability, 22 cartridge scene
interfaces and availability gates, and keyboard UI input from title to NEW GAME.
They DO NOT establish that all 22 cartridges have been played through, every
gameplay system is complete, all hardware works, multiplayer is production-ready,
or this is a finished/AAA-certified game.

LOCAL EVALUATION ONLY - REDISTRIBUTION NOT CLEARED
Do not treat this archive as authorization for public distribution or sale.
Included source notices are technical/provenance records, not a blanket license
for all DRIVN content. The inspected records do not establish redistribution
rights for all non-test film/episode media, generated ElevenLabs audio, or the
generated PixelLab LCD font. Input-icon attribution also needs a complete
upstream license record before public release. Missing records do not prove
that rights are absent; owner/source confirmation is still required.
Exact engine and bundled third-party notices are extracted from the embedded
runtime into notices/. Existing game/addon/source/font notices are included
as available. No signing, payment, upload, hosting, or public deployment occurred.
