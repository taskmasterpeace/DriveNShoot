# Devlog 01 (2026-10-23): the state of DIVIDED STATES OF AMERICA and its tools

`DSOA_devlog_01.mp4` (3:33, 1920x1080, not committed: rebuild it from here). 25 segments, one per frame:
`script.tsv` = frame, section label, narration. Frames are the game-camera renders in `docs/renders/web/*` (plus the
two fresh captures here, and the underground/roadside/bases renders from their branches).

Voice: **Breeze TTS 2 on cupcake (our voice lab)**, one narrator for every line. `narrator_ref.wav` + `.txt` is the
frozen voice (designed once: cfg 4.0, seed 707, the design text in `breeze_voice.py`); every line is cloned from it at
cfg 1.0. Each line was transcribed back with faster-whisper and matched against the script (all 25 pass).

Rebuild:
1. voice: copy `breeze_voice.py` + `script.tsv` (+ `narrator_ref.*` to keep the same voice) to `/tmp/<job>/` on cupcake
   and run `python3 breeze_voice.py clone` there (localhost:8700 needs no key), then copy the `voNN.wav` back.
   If mk-breeze is down or the GPU is full, see `KEY_AND_VOICE_NOTES.md`.
2. put the frames named in `script.tsv` beside them and run `python build.py` (clips: fit + push-in, label, captions);
3. concat `list.txt`, loudnorm the voice to -16 LUFS and mix the low drone bed at 0.08; a 1280-wide CRF 30 copy is the
   phone version (`DSOA_devlog_01_small.mp4`, ~9 MB).
