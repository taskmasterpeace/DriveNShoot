#!/usr/bin/env node
// MEDIAFORGE — the DRIVN media ingest forge + REST API (cinema.md Phases 0/1/8).
// The owner drops MP4s (films / episodes / trailers / clips) into game/media/<category>/,
// this forge converts them to Theora .ogv — the ONLY video Godot's gl_compatibility
// renderer plays — extracts a poster, probes the runtime, and writes the manifest row
// (game/data/media_manifest.json) the in-game MediaRegistry will consume. Music is
// folder-driven: game/media/music/{radio,game} hold mp3s, no rows needed.
//
//   Run:  node tools/mediaforge/server.mjs      (http://localhost:8897)
//   Docs: GET /api/help
//
// ONE dependency (the exception among the forges): ffmpeg-static bundles the encoder —
// nothing to install on the machine. Local files only; streaming is a LATER version.
// No purple.

import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, createReadStream } from "node:fs";
import { dirname, join, resolve, extname, basename, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ffmpegPath from "ffmpeg-static";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const MEDIA = process.env.MEDIA_PATH || join(ROOT, "game", "media");
const MANIFEST = process.env.MANIFEST_PATH || join(ROOT, "game", "data", "media_manifest.json");
const PORT = Number(process.env.MEDIAFORGE_PORT || 8897);
const FFMPEG = ffmpegPath;

const CATEGORIES = ["film", "tvshow", "trailers", "clips", "musicvideo"];
const MUSIC_DIRS = ["radio", "game"]; // under game/media/music/
const SOURCE_EXTS = [".mp4", ".mov", ".mkv", ".webm"];
const UNLOCK_TYPES = ["always_available", "found_dvd", "found_tape", "found_reel",
	"quest_reward", "regional_channel", "world_event"];
const SCREEN_CONTEXTS = ["safehouse_tv", "drive_in", "public_tv", "news"];
// Encoding law (verified against the bundled ffmpeg 6.1.1: libtheora+libvorbis+libmp3lame all present):
const VIDEO_ARGS = ["-codec:v", "libtheora", "-qscale:v", "6", "-codec:a", "libvorbis", "-qscale:a", "4"];
const VIDEO_SCALE = "scale='min(960,iw)':-2";  // cap width 960, keep aspect, even height
const POSTER_SCALE = "scale='min(480,iw)':-2"; // poster cap 480
// drawtext needs an explicit fontfile on Windows (no fontconfig in the static build).
const FONT = ["C:/Windows/Fonts/consola.ttf", "C:/Windows/Fonts/arial.ttf"].find((f) => existsSync(f)) || null;
// The 48-star reel wants a real ★ (U+2605) glyph — Arial carries it, Consolas is a
// coding font with no guarantee; a dedicated pick beats hoping FONT (above) has it.
const STAR_FONT = ["C:/Windows/Fonts/arial.ttf", "C:/Windows/Fonts/consola.ttf"].find((f) => existsSync(f)) || null;

if (!FFMPEG || !existsSync(FFMPEG)) {
	console.error(`ffmpeg-static did not resolve a binary (got: ${FFMPEG}). Run: cd tools/mediaforge && npm install`);
	process.exit(1);
}
for (const c of CATEGORIES) mkdirSync(join(MEDIA, c), { recursive: true });
for (const m of MUSIC_DIRS) mkdirSync(join(MEDIA, "music", m), { recursive: true });

// ---------- manifest ----------
let doc = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, "utf8")) : {};
if (!doc._comment) doc._comment = "DRIVN media manifest — written by MediaForge (tools/mediaforge). Rows are the game's whole video catalog.";
if (!Array.isArray(doc.media)) doc.media = [];
const save = () => writeFileSync(MANIFEST, JSON.stringify(doc, null, 2) + "\n");
const byId = (id) => doc.media.find((m) => m.id === id);

// res://media/... <-> disk. res:// is game/ (never res://game/).
const resToDisk = (p) => join(ROOT, "game", String(p || "").replace(/^res:\/\//, "").replaceAll("/", sep));
const relToDisk = (rel) => {
	const full = resolve(MEDIA, rel);
	if (!full.startsWith(resolve(MEDIA) + sep) && full !== resolve(MEDIA)) throw "path escapes game/media";
	return full;
};

const slugify = (s) => String(s).toLowerCase().replace(/\.[a-z0-9]+$/i, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "untitled";
const titleize = (s) => String(s).replace(/\.[a-z0-9]+$/i, "").replace(/[_\-.]+/g, " ").trim()
	.split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
const uniqueId = (want, sourceFile) => {
	let id = slugify(want), n = 2;
	while (byId(id) && byId(id).source_file !== sourceFile) id = `${slugify(want)}_${n++}`;
	return id;
};

function makeRow(o) {
	return {
		id: o.id, category: o.category, title: o.title || o.id,
		series: o.series || "", season: o.season ?? null, episode: o.episode ?? null,
		runtime_seconds: Number(o.runtime_seconds) || 0,
		encoded_path: `res://media/${o.category}/${o.id}/${o.id}.ogv`,
		poster_path: `res://media/${o.category}/${o.id}/poster.png`,
		source_file: o.source_file || "",
		unlock_type: UNLOCK_TYPES.includes(o.unlock_type) ? o.unlock_type : "always_available",
		unlock_region: o.unlock_region || "",
		screen_context: Array.isArray(o.screen_context) && o.screen_context.length ? o.screen_context : ["safehouse_tv"],
		priority: Number.isFinite(Number(o.priority)) ? Number(o.priority) : 1,
		requires_pack: Boolean(o.requires_pack),
	};
}
const upsert = (row) => { doc.media = doc.media.filter((m) => m.id !== row.id); doc.media.push(row); save(); };

// ---------- ffmpeg plumbing ----------
// jobs: in-memory status the UI polls (GET /api/jobs) while a conversion runs.
const jobs = [];
let busy = false;
function newJob(kind, label) {
	const j = { job: jobs.length + 1, kind, label, status: "running", percent: 0,
		lines: [], started: new Date().toISOString(), finished: null, error: null };
	jobs.push(j); if (jobs.length > 40) jobs.shift();
	return j;
}
const jline = (j, s) => { const t = String(s).trim(); if (!t) return; j.lines.push(t); if (j.lines.length > 30) j.lines.shift(); };

// Run ffmpeg with args; stream stderr into the job; resolve {code, stderr}.
function ff(args, job, durationForPct) {
	return new Promise((resolveP, rejectP) => {
		const child = spawn(FFMPEG, ["-hide_banner", "-y", ...args], { windowsHide: true });
		let stderr = "";
		child.stderr.on("data", (d) => {
			const s = d.toString(); stderr += s;
			const lines = s.split(/\r|\n/).filter(Boolean);
			for (const ln of lines) {
				if (job) jline(job, ln);
				if (job && durationForPct > 0) {
					const m = ln.match(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/);
					if (m) job.percent = Math.min(99, Math.round((+m[1] * 3600 + +m[2] * 60 + +m[3]) / durationForPct * 100));
				}
			}
		});
		child.on("error", rejectP);
		child.on("close", (code) => resolveP({ code, stderr }));
	});
}

// Probe duration by parsing `ffmpeg -i` stderr ("Duration: 00:01:23.45").
async function probeDuration(file) {
	const { stderr } = await ff(["-i", file], null, 0);
	const m = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
	return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : 0;
}

async function encodeVideo(srcAbs, category, id, job) {
	const outDir = join(MEDIA, category, id);
	mkdirSync(outDir, { recursive: true });
	const ogv = join(outDir, `${id}.ogv`);
	const poster = join(outDir, "poster.png");
	const duration = await probeDuration(srcAbs);
	jline(job, `duration probed: ${duration.toFixed(2)}s — encoding Theora/Vorbis…`);
	const enc = await ff(["-i", srcAbs, "-vf", VIDEO_SCALE, ...VIDEO_ARGS, ogv], job, duration);
	if (enc.code !== 0 || !existsSync(ogv)) throw `ffmpeg encode failed (exit ${enc.code}): ${enc.stderr.split("\n").slice(-4).join(" ")}`;
	// poster at 10% of the runtime (frame-accurate enough, fast: -ss before -i)
	const at = Math.max(0, duration * 0.10);
	const pos = await ff(["-ss", at.toFixed(2), "-i", srcAbs, "-frames:v", "1", "-vf", POSTER_SCALE, poster], job, 0);
	if (pos.code !== 0 || !existsSync(poster)) jline(job, `poster extraction failed (exit ${pos.code}) — row written without poster`);
	job.percent = 100;
	return { ogv, poster: existsSync(poster) ? poster : null, duration };
}

// ---------- scan ----------
const isSource = (f) => SOURCE_EXTS.includes(extname(f).toLowerCase());
function scanSources() {
	const claimed = new Set(doc.media.map((m) => m.source_file).filter(Boolean));
	const out = [];
	for (const cat of CATEGORIES) {
		const dir = join(MEDIA, cat);
		if (!existsSync(dir)) continue;
		const consider = [];
		for (const name of readdirSync(dir)) {
			const p = join(dir, name);
			const st = statSync(p);
			if (st.isFile() && isSource(name)) consider.push({ p, rel: `${cat}/${name}` });
			else if (st.isDirectory()) // one level of per-id subfolders
				for (const sub of readdirSync(p))
					if (statSync(join(p, sub)).isFile() && isSource(sub)) consider.push({ p: join(p, sub), rel: `${cat}/${name}/${sub}` });
		}
		for (const { p, rel } of consider) {
			const file = basename(p);
			const slug = slugify(file);
			const encoded = existsSync(join(MEDIA, cat, slug, `${slug}.ogv`));
			if (claimed.has(file) || encoded) continue; // already rowed / already converted
			out.push({ file: rel, category: cat, size_mb: +(statSync(p).size / 1048576).toFixed(1),
				suggested_id: slug, suggested_title: titleize(file) });
		}
	}
	return out;
}
function scanMusic() {
	const out = {};
	for (const m of MUSIC_DIRS) {
		const dir = join(MEDIA, "music", m);
		out[m] = existsSync(dir)
			? readdirSync(dir).filter((f) => extname(f).toLowerCase() === ".mp3")
				.map((f) => ({ file: f, size_kb: Math.round(statSync(join(dir, f)).size / 1024) }))
			: [];
	}
	return out;
}

// ---------- the built-in test media (prove the pipeline before real footage) ----------
// THE 48-STAR REEL: deep-navy field, a 6x8 grid of white stars (48 = the DIVIDED
// STATES flag joke), the title in amber, "TEST REEL" underneath. Same graceful
// fallback as before — if drawtext hiccups (missing glyph, bad escaping), we
// retry on a plain color card so the pipeline NEVER dies for a font reason.
async function makeTestClip(job) {
	const id = "test_pattern", cat = "clips";
	const outDir = join(MEDIA, cat, id); mkdirSync(outDir, { recursive: true });
	const ogv = join(outDir, `${id}.ogv`), poster = join(outDir, "poster.png");
	const bg = "color=c=0x0a1428:size=640x360:rate=24"; // deep navy field
	const starRows = Array(6).fill("★ ★ ★ ★ ★ ★ ★ ★").join("\\n"); // 6x8 = 48
	const draw = STAR_FONT
		? ["-vf", [
			`drawtext=fontfile='${STAR_FONT.replace(":", "\\:")}':text='${starRows}':fontsize=26:fontcolor=white@0.85:line_spacing=10:x=(w-text_w)/2:y=28`,
			`drawtext=fontfile='${STAR_FONT.replace(":", "\\:")}':text='DIVIDED STATES OF AMERICA':fontsize=34:fontcolor=0xf0b429:x=(w-text_w)/2:y=h-96:box=1:boxcolor=black@0.55:boxborderw=10`,
			`drawtext=fontfile='${STAR_FONT.replace(":", "\\:")}':text='TEST REEL':fontsize=16:fontcolor=0x9a8f78:x=(w-text_w)/2:y=h-46`,
		  ].join(",")]
		: [];
	jline(job, STAR_FONT ? `drawtext via ${STAR_FONT} (48 stars + title)` : "no system font found — plain navy card (still valid)");
	let enc = await ff(["-f", "lavfi", "-i", `${bg}:d=12`,
		"-f", "lavfi", "-i", "sine=frequency=440", "-t", "12", ...draw, ...VIDEO_ARGS, ogv], job, 12);
	if (enc.code !== 0 && draw.length) { // drawtext hiccup → fall back to a plain navy card
		jline(job, "drawtext failed — retrying plain navy card");
		enc = await ff(["-f", "lavfi", "-i", `${bg}:d=12`,
			"-f", "lavfi", "-i", "sine=frequency=440", "-t", "12", ...VIDEO_ARGS, ogv], job, 12);
	}
	if (enc.code !== 0 || !existsSync(ogv)) throw `test clip encode failed (exit ${enc.code})`;
	const duration = await probeDuration(ogv);
	await ff(["-ss", "1.2", "-i", ogv, "-frames:v", "1", "-vf", POSTER_SCALE, poster], job, 0);
	const row = makeRow({ id, category: cat, title: "48 Stars — Divided States of America", runtime_seconds: +duration.toFixed(2),
		source_file: "(generated by MediaForge)", screen_context: ["safehouse_tv", "drive_in", "public_tv"] });
	upsert(row);
	job.percent = 100;
	return { row, ogv_bytes: statSync(ogv).size, poster: existsSync(poster) };
}

async function makeTestMusic(job) {
	const made = [];
	// radio: layered sine chord (220Hz + 277Hz ≈ A3+C#4) amixed, tremolo for texture
	const radio = join(MEDIA, "music", "radio", "test_wasteland_loop.mp3");
	jline(job, "radio bed: sine 220+277 amix + tremolo …");
	const r = await ff(["-f", "lavfi", "-i", "sine=frequency=220", "-f", "lavfi", "-i", "sine=frequency=277",
		"-filter_complex", "amix=inputs=2,tremolo=f=4:d=0.6", "-t", "30",
		"-codec:a", "libmp3lame", "-q:a", "4", radio], job, 30);
	if (r.code !== 0 || !existsSync(radio)) throw `radio test mp3 failed (exit ${r.code})`;
	made.push({ file: "music/radio/test_wasteland_loop.mp3", bytes: statSync(radio).size });
	// game: low 110Hz drone with a slow tremolo volume envelope (10s swell cycle)
	const game = join(MEDIA, "music", "game", "test_ambient.mp3");
	jline(job, "game bed: sine 110 drone + slow envelope …");
	const g = await ff(["-f", "lavfi", "-i", "sine=frequency=110",
		"-af", "tremolo=f=0.1:d=0.8,volume=0.8", "-t", "30",
		"-codec:a", "libmp3lame", "-q:a", "4", game], job, 30);
	if (g.code !== 0 || !existsSync(game)) throw `game test mp3 failed (exit ${g.code})`;
	made.push({ file: "music/game/test_ambient.mp3", bytes: statSync(game).size });
	job.percent = 100;
	return made;
}

// ---------- HELP ----------
const HELP = {
	name: "MediaForge API — ingest the DRIVN media library (game/data/media_manifest.json + game/media/)",
	note: "MP4/MOV/MKV/WEBM in → Theora .ogv out (the ONLY video Godot gl_compatibility plays) + poster.png + manifest row. Music is folder-driven mp3s under game/media/music/{radio,game}. Local files only — streaming is a later version.",
	encoding: "-codec:v libtheora -qscale:v 6 -codec:a libvorbis -qscale:a 4, scaled to max 960px wide (poster 480px, frame at 10% runtime). mp3: libmp3lame -q:a 4.",
	categories: CATEGORIES, unlock_types: UNLOCK_TYPES, screen_contexts: SCREEN_CONTEXTS,
	endpoints: [
		"GET    /api/help                      -> this document",
		"GET    /api/media                     -> manifest rows + encoded_exists/poster_exists per row",
		"GET    /api/scan                      -> unconverted sources in the 5 category folders + mp3s in music/",
		"POST   /api/convert {file,category,title?,id?} -> encode to .ogv + poster + upsert row (file is relative to game/media; responds when done — poll /api/jobs meanwhile)",
		"POST   /api/testclip                  -> generate the 12s synthetic 48 STARS / DIVIDED STATES OF AMERICA reel into clips/test_pattern + row",
		"POST   /api/testmusic                 -> generate test mp3s into music/radio + music/game",
		"GET    /api/stations                  -> NAMED RADIO STATIONS (each subfolder of music/radio = a station; loose root mp3s = FREEWAVE)",
		"POST   /api/stations {name}           -> create a station folder (name slugs to snake_case; drop mp3s in it and it's on the dial)",
		"GET    /api/jobs                      -> in-memory job log (progress % + ffmpeg stderr tail)",
		"PATCH  /api/media?id=X {fields}       -> edit row fields (title, series, season, episode, unlock_type, unlock_region, screen_context, priority, requires_pack)",
		"DELETE /api/media?id=X                -> remove the row (files stay on disk)",
		"GET    /media/<path>                  -> serves game/media files (poster thumbnails, ogv preview, mp3)",
	],
	examples: [
		`curl localhost:${PORT}/api/scan`,
		`curl -X POST localhost:${PORT}/api/convert -d '{"file":"film/blood_road.mp4","category":"film","title":"Blood Road"}'`,
		`curl -X POST localhost:${PORT}/api/testclip`,
		`curl -X PATCH "localhost:${PORT}/api/media?id=test_pattern" -d '{"unlock_type":"found_dvd","unlock_region":"florida"}'`,
	],
};

// ---------- http ----------
const MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".ogv": "video/ogg",
	".mp3": "audio/mpeg", ".md": "text/plain; charset=utf-8", ".txt": "text/plain; charset=utf-8" };
const json = (res, code, obj) => {
	res.writeHead(code, { "content-type": "application/json", "access-control-allow-origin": "*" });
	res.end(JSON.stringify(obj));
};

const server = createServer(async (req, res) => {
	const url = new URL(req.url, `http://localhost:${PORT}`);
	const q = url.searchParams;
	let body = null;
	if (["POST", "PUT", "PATCH"].includes(req.method)) {
		const chunks = [];
		for await (const c of req) chunks.push(c);
		try { body = JSON.parse(Buffer.concat(chunks).toString() || "{}"); }
		catch { return json(res, 400, { error: "bad JSON body" }); }
	}
	try {
		if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html"))
			return res.writeHead(200, { "content-type": "text/html" }).end(readFileSync(join(HERE, "index.html")));
		if (url.pathname === "/api/help") return json(res, 200, HELP);

		// static file route: /media/* -> game/media/* (poster thumbs, ogv preview, mp3)
		if (req.method === "GET" && url.pathname.startsWith("/media/")) {
			let p;
			try { p = relToDisk(decodeURIComponent(url.pathname.slice(7))); } catch { return json(res, 403, { error: "forbidden" }); }
			if (!existsSync(p) || !statSync(p).isFile()) return json(res, 404, { error: "no such file" });
			res.writeHead(200, { "content-type": MIME[extname(p).toLowerCase()] || "application/octet-stream",
				"content-length": statSync(p).size, "access-control-allow-origin": "*" });
			return createReadStream(p).pipe(res);
		}

		if (url.pathname === "/api/media" && req.method === "GET")
			return json(res, 200, {
				manifest: MANIFEST.replaceAll(sep, "/"),
				media: doc.media.map((m) => ({ ...m,
					encoded_exists: existsSync(resToDisk(m.encoded_path)),
					poster_exists: existsSync(resToDisk(m.poster_path)) })),
			});

		if (url.pathname === "/api/scan") return json(res, 200, { sources: scanSources(), music: scanMusic() });
		if (url.pathname === "/api/jobs") return json(res, 200, { busy, jobs: jobs.slice(-12).reverse() });

		if (url.pathname === "/api/convert" && req.method === "POST") {
			if (busy) return json(res, 409, { error: "a conversion is already running — poll /api/jobs" });
			if (!body.file) return json(res, 400, { error: "need {file} relative to game/media" });
			const category = body.category || String(body.file).split(/[\\/]/)[0];
			if (!CATEGORIES.includes(category)) return json(res, 400, { error: `category must be one of ${CATEGORIES.join("|")}` });
			let src;
			try { src = relToDisk(body.file); } catch (e) { return json(res, 400, { error: String(e) }); }
			if (!existsSync(src) || !statSync(src).isFile()) return json(res, 404, { error: `no source at game/media/${body.file}` });
			if (!isSource(src)) return json(res, 400, { error: `not a convertible source (${SOURCE_EXTS.join(" ")})` });
			const sourceFile = basename(src);
			const id = body.id ? slugify(body.id) : uniqueId(sourceFile, sourceFile);
			const title = body.title || titleize(sourceFile);
			const job = newJob("convert", `${body.file} → ${category}/${id}/${id}.ogv`);
			busy = true;
			try {
				const r = await encodeVideo(src, category, id, job);
				const prev = byId(id) || {};
				const row = makeRow({ ...prev, id, category, title, source_file: sourceFile,
					runtime_seconds: +r.duration.toFixed(2) });
				upsert(row);
				job.status = "done"; job.finished = new Date().toISOString();
				return json(res, 200, { ok: true, row, ogv_bytes: statSync(r.ogv).size, poster: !!r.poster, job: job.job });
			} catch (e) {
				job.status = "failed"; job.error = String(e); job.finished = new Date().toISOString();
				return json(res, 500, { error: String(e), job: job.job });
			} finally { busy = false; }
		}

		if (url.pathname === "/api/testclip" && req.method === "POST") {
			if (busy) return json(res, 409, { error: "a conversion is already running — poll /api/jobs" });
			const job = newJob("testclip", "synthetic DRIVN TEST REEL → clips/test_pattern");
			busy = true;
			try {
				const r = await makeTestClip(job);
				job.status = "done"; job.finished = new Date().toISOString();
				return json(res, 200, { ok: true, ...r, job: job.job });
			} catch (e) {
				job.status = "failed"; job.error = String(e); job.finished = new Date().toISOString();
				return json(res, 500, { error: String(e), job: job.job });
			} finally { busy = false; }
		}

		if (url.pathname === "/api/testmusic" && req.method === "POST") {
			if (busy) return json(res, 409, { error: "a conversion is already running — poll /api/jobs" });
			const job = newJob("testmusic", "synthetic beds → music/radio + music/game");
			busy = true;
			try {
				const made = await makeTestMusic(job);
				job.status = "done"; job.finished = new Date().toISOString();
				return json(res, 200, { ok: true, made, job: job.job });
			} catch (e) {
				job.status = "failed"; job.error = String(e); job.finished = new Date().toISOString();
				return json(res, 500, { error: String(e), job: job.job });
			} finally { busy = false; }
		}

		// ---- NAMED RADIO STATIONS (owner ask): a folder of mp3s = a station -----
		if (url.pathname === "/api/stations" && req.method === "GET") {
			const radio = join(MEDIA, "music", "radio");
			const out = [];
			for (const e of readdirSync(radio, { withFileTypes: true })) {
				if (!e.isDirectory()) continue;
				const tracks = readdirSync(join(radio, e.name)).filter((f) => f.endsWith(".mp3"));
				out.push({ id: e.name, name: e.name.replace(/_/g, " ").toUpperCase(),
					dir: `game/media/music/radio/${e.name}`, tracks: tracks.length, files: tracks });
			}
			const loose = readdirSync(radio).filter((f) => f.endsWith(".mp3"));
			if (loose.length) out.push({ id: "freewave", name: "FREEWAVE (loose root mp3s)",
				dir: "game/media/music/radio", tracks: loose.length, files: loose });
			return json(res, 200, { stations: out });
		}
		if (url.pathname === "/api/stations" && req.method === "POST") {
			const raw = String(body.name || "").trim();
			if (!raw) return json(res, 400, { error: "need name (e.g. 'Chicago Radio')" });
			const slug = raw.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
			if (!slug) return json(res, 400, { error: "name slugs to nothing — use letters/numbers" });
			const dir = join(MEDIA, "music", "radio", slug);
			mkdirSync(dir, { recursive: true });
			return json(res, 200, { ok: true, id: slug, name: slug.replace(/_/g, " ").toUpperCase(),
				dir: `game/media/music/radio/${slug}`, note: "drop mp3s in the folder — it's on the dial next launch (L cycles stations, O powers the set)" });
		}

		if (url.pathname === "/api/media" && req.method === "PATCH") {
			const cur = byId(q.get("id"));
			if (!cur) return json(res, 404, { error: `no media '${q.get("id")}'` });
			const EDITABLE = ["title", "series", "season", "episode", "unlock_type", "unlock_region",
				"screen_context", "priority", "requires_pack"];
			for (const k of EDITABLE) if (k in body) cur[k] = body[k];
			if (typeof cur.screen_context === "string") // UI sends comma text; store an array
				cur.screen_context = cur.screen_context.split(",").map((s) => s.trim()).filter(Boolean);
			const row = makeRow(cur); // re-normalize (also re-derives paths from id/category)
			doc.media = doc.media.map((m) => (m.id === row.id ? row : m)); save();
			return json(res, 200, { ok: true, row });
		}

		if (url.pathname === "/api/media" && req.method === "DELETE") {
			const n = doc.media.length;
			doc.media = doc.media.filter((m) => m.id !== q.get("id")); save();
			return json(res, 200, { removed: n - doc.media.length, note: "files left on disk" });
		}

		json(res, 404, { error: "no such endpoint", help: "/api/help" });
	} catch (e) { json(res, 500, { error: String(e) }); }
});

server.requestTimeout = 0; // feature-film conversions can outlive the default 5-min request timeout

server.listen(PORT, () => {
	console.log(`MediaForge up:  http://localhost:${PORT}   (manifest ${MANIFEST})`);
	console.log(`media tree:     ${MEDIA}`);
	console.log(`ffmpeg-static:  ${FFMPEG}`);
	console.log(`API docs:       http://localhost:${PORT}/api/help`);
});
