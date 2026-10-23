---
name: keys-and-voice-lab
description: How to get voices/keys without bothering Robert - cupcake localhost is keyless; this PC has no Bitwarden token; Breeze may be stopped and needs ComfyUI paused; the dead ElevenLabs key
metadata:
  node_type: memory
  type: reference
  originSessionId: f1ad5e47-37e9-4595-a64f-f419a2fb4e02
  modified: 2026-10-23T18:38:08.551Z
---

**Robert's rule (2026-10-23, after a frustrating key back-and-forth):** "we have a voice lab, don't use placeholders" and
"just say in plain English what you want". Prefer the route that needs NO key; ask him for at most ONE click/paste.

- **Voice lab = Breeze TTS 2 on cupcake.** On the box `http://127.0.0.1:8700` is the keyless `local` tenant: scp a script
  to `/tmp/<job>/` on `taskmasterpeace@192.168.1.249`, run it there, scp the WAVs back. No CUPCAKE_GATEWAY_KEY needed.
  Proven script: carworld `docs/devlog/01/breeze_voice.py` (design once cfg 4.0 seed 707 + clarity term -> freeze ref ->
  clone every line cfg 1.0).
- **mk-breeze can be stopped** (was, 10-22 09:23) and **fails to start while the GPU is full** ("Failed to set CUDA
  device"; vLLM ~48 GB + ComfyUI ~7 GB). With `/v1/health` running:false queue 0: stop mk-breeze's crash loop,
  `sudo systemctl stop comfyui`, `sudo systemctl start mk-breeze` (READY ~37 s), do the job, `sudo systemctl start comfyui`.
- **This PC (Alpine Swift, seat `alpine-swift`) has no `~/.config/mkl/bws.key` and no Secrets Manager project**, so
  `with-keys.sh` can't work here. The Key Locker is on port **8797** (not 8787) and isn't always running
  (`node server.mjs` in `D:/git/cupcake/tools/key-locker/`). CUPCAKE_GATEWAY_KEY is not in the Locker.
- **ELEVENLABS_API_KEY in the Locker is "Refused - dead or disabled"**; ad-lab has no `.env` (only the tracked
  `.env.example` - never a real key there).
- The global skills (`key-locker`, `breeze-tts-2`) can't be edited from a carworld session (project-config hook); the
  same notes are in carworld `docs/devlog/01/KEY_AND_VOICE_NOTES.md` for Robert to paste in.

Related: [[web-engine-dsoa-2026-10-22]]
