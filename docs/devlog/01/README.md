# Devlog 01 (2026-10-23): the state of DIVIDED STATES OF AMERICA and its tools

`DSOA_devlog_01.mp4` (4:38, 1920x1080, not committed: rebuild it from here). 25 segments, one per frame:
`script.tsv` = frame, section label, narration. Frames are the game-camera renders in `docs/renders/web/*` (plus the
two fresh captures here, and the underground/roadside/bases renders from their branches).

Rebuild: put the frames named in `script.tsv` beside these files, then
1. voice: `powershell -File tts.ps1` (offline Windows voice "Microsoft David", a placeholder: the ElevenLabs key in
   ad-lab was rejected as invalid on 2026-10-23; re-voice with a real key for a release cut);
2. `python build.py` (per-segment clips: fit + slow push-in, a gold section label, burned-in captions, fades);
3. concat `list.txt` and mix the low drone bed (see the session notes: `ffmpeg -f concat ...` then `amix` at 0.10).
