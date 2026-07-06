#!/usr/bin/env node
// SoundForge — generates the game's sound effects via the ElevenLabs
// sound-generation API, driven by manifest.json (the customization surface).
//
//   node tools/soundforge/generate.mjs              # all sounds missing on disk
//   node tools/soundforge/generate.mjs howl engine  # just these ids
//   node tools/soundforge/generate.mjs --force      # regenerate everything
//   node tools/soundforge/generate.mjs howl --force # re-roll one sound
//
// Key comes from ELEVENLABS_API_KEY in the environment or .env at the repo root
// (gitignored — NEVER commit it). Output: game/assets/sfx/<id>.mp3, which
// ProtoAudio loads at boot (synth fallback when a file is missing).
// After generating, run a Godot import pass so res:// sees the new files:
//   <godot-console> --headless --path game --import

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const OUT_DIR = join(ROOT, "game", "assets", "sfx");
const MANIFEST = JSON.parse(readFileSync(join(HERE, "manifest.json"), "utf8"));

// --- key: env var, else .env at repo root or beside this script ---------------
function loadKey() {
	if (process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY;
	for (const p of [join(ROOT, ".env"), join(HERE, ".env")]) {
		if (!existsSync(p)) continue;
		const m = readFileSync(p, "utf8").match(/ELEVENLABS_API_KEY\s*=\s*(\S+)/);
		if (m) return m[1];
	}
	console.error("No ELEVENLABS_API_KEY (env or .env at repo root). Aborting.");
	process.exit(1);
}
const KEY = loadKey();

const args = process.argv.slice(2);
const force = args.includes("--force");
const wanted = args.filter((a) => !a.startsWith("--"));

mkdirSync(OUT_DIR, { recursive: true });

let made = 0, skipped = 0, failed = 0;
for (const s of MANIFEST.sounds) {
	if (wanted.length && !wanted.includes(s.id)) continue;
	const out = join(OUT_DIR, `${s.id}.mp3`);
	if (existsSync(out) && !force) {
		skipped++;
		continue;
	}
	process.stdout.write(`generating ${s.id} (${s.duration_seconds}s)... `);
	try {
		const r = await fetch("https://api.elevenlabs.io/v1/sound-generation", {
			method: "POST",
			headers: { "xi-api-key": KEY, "content-type": "application/json" },
			body: JSON.stringify({
				text: s.prompt,
				duration_seconds: s.duration_seconds,
				prompt_influence: s.prompt_influence ?? 0.4,
			}),
		});
		if (!r.ok) {
			const err = await r.text();
			console.log(`FAILED ${r.status}: ${err.slice(0, 200)}`);
			failed++;
			continue;
		}
		const buf = Buffer.from(await r.arrayBuffer());
		writeFileSync(out, buf);
		console.log(`ok (${(buf.length / 1024).toFixed(0)} KB)`);
		made++;
	} catch (e) {
		console.log(`FAILED: ${e}`);
		failed++;
	}
}
console.log(`\nSoundForge: ${made} generated, ${skipped} already on disk (use --force to re-roll), ${failed} failed.`);
console.log(`Files in game/assets/sfx — now run the Godot import pass so res:// sees them.`);
process.exit(failed > 0 ? 1 : 0);
