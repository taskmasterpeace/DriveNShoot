#!/usr/bin/env node
// SoundForge VOICES — generates per-character voice lines via the ElevenLabs
// text-to-speech API, driven by voices.json (the customization surface).
// THE ONE RULE: a character's voice_id never changes — same voice, every line.
//
//   node tools/soundforge/voices.mjs                  # all lines missing on disk
//   node tools/soundforge/voices.mjs mercy            # every line for one character
//   node tools/soundforge/voices.mjs mercy_greet      # just one line (vo_ prefix optional)
//   node tools/soundforge/voices.mjs --force          # regenerate everything
//   node tools/soundforge/voices.mjs radio --force    # re-roll one character
//
// Key comes from ELEVENLABS_API_KEY in the environment or .env at the repo root
// (gitignored — NEVER commit it). Output: game/assets/sfx/vo_<char>_<line>.mp3,
// which ProtoAudio auto-loads at boot — so vo_mercy_greet is playable via
// audio.play_at("vo_mercy_greet", pos). After generating, run a Godot import
// pass so res:// sees the new files:
//   <godot-console> --headless --path game --import

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const OUT_DIR = join(ROOT, "game", "assets", "sfx");
const MANIFEST = JSON.parse(readFileSync(join(HERE, "voices.json"), "utf8"));

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

// A job matches an arg by character name ("mercy"), line id ("mercy_greet"),
// or full sfx id ("vo_mercy_greet").
function matches(char, line) {
	if (!wanted.length) return true;
	return wanted.some((w) => w === char || w === `${char}_${line}` || w === `vo_${char}_${line}`);
}

mkdirSync(OUT_DIR, { recursive: true });

const results = [];
let made = 0, skipped = 0, failed = 0;
for (const [char, def] of Object.entries(MANIFEST.characters)) {
	for (const [line, text] of Object.entries(def.lines)) {
		if (!matches(char, line)) continue;
		const id = `vo_${char}_${line}`;
		const out = join(OUT_DIR, `${id}.mp3`);
		if (existsSync(out) && !force) {
			results.push([id, "SKIP", "already on disk"]);
			skipped++;
			continue;
		}
		process.stdout.write(`speaking ${id} [${def.voice_name}]... `);
		try {
			const r = await fetch(
				`https://api.elevenlabs.io/v1/text-to-speech/${def.voice}?output_format=mp3_44100_128`,
				{
					method: "POST",
					headers: { "xi-api-key": KEY, "content-type": "application/json" },
					body: JSON.stringify({ text, model_id: MANIFEST.model_id }),
				}
			);
			if (!r.ok) {
				const err = await r.text();
				console.log(`FAILED ${r.status}`);
				results.push([id, "FAIL", `${r.status}: ${err.slice(0, 120)}`]);
				failed++;
				continue;
			}
			const buf = Buffer.from(await r.arrayBuffer());
			writeFileSync(out, buf);
			console.log(`ok (${(buf.length / 1024).toFixed(0)} KB)`);
			results.push([id, "OK", `${(buf.length / 1024).toFixed(0)} KB`]);
			made++;
		} catch (e) {
			console.log(`FAILED: ${e}`);
			results.push([id, "FAIL", String(e).slice(0, 120)]);
			failed++;
		}
	}
}

const w = Math.max(...results.map(([id]) => id.length), 4);
console.log(`\n${"id".padEnd(w)}  status  detail`);
for (const [id, status, detail] of results) console.log(`${id.padEnd(w)}  ${status.padEnd(6)}  ${detail}`);
console.log(`\nVoices: ${made} generated, ${skipped} already on disk (use --force to re-roll), ${failed} failed.`);
console.log(`Files in game/assets/sfx — now run the Godot import pass so res:// sees them.`);
process.exit(failed > 0 ? 1 : 0);
